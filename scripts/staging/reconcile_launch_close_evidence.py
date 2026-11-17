"""Reconcile the retained evidence for one staging close. This reader never writes or publishes."""
import argparse
from datetime import date, datetime, time, timedelta, timezone
from hashlib import sha256
import json
import os
from pathlib import Path
import re
import stat

TAIPEI = timezone(timedelta(hours=8))
OBSERVATION_LIMIT = 16 * 1024 * 1024
RECEIPT_LIMIT = 128 * 1024
OBSERVED_DATASETS = {
    "twse_quotes": 11549,
    "tpex_quotes": 11371,
    "twse_issuers": 18419,
    "tpex_issuers": 25036,
    "tpex_market_foreign_flow": 11743,
}
SUPPLEMENTAL_DATASETS = {
    "twse_reported_close": 11764,
    "twse_disposition": 29082,
    "tpex_disposition": 11396,
    "tpex_halt_notice": 48664,
    "tpex_stock_institutional_shares": 11856,
    "tpex_all_session_quote": 11370,
}
POSITIVE_NOTICE_DATASETS = {29082, 11396}


def instant(value):
    if not isinstance(value, str):
        raise ValueError("invalid timestamp")
    stamp = datetime.fromisoformat(value)
    if stamp.utcoffset() is None:
        raise ValueError("timestamp without offset")
    return stamp


def read_bounded(path, limit):
    with os.fdopen(os.open(path, os.O_RDONLY | os.O_NOFOLLOW | os.O_NONBLOCK), "rb") as stream:
        before = os.fstat(stream.fileno())
        if not stat.S_ISREG(before.st_mode) or not 0 < before.st_size <= limit:
            raise ValueError("non-regular or oversized artifact")
        body = stream.read(limit + 1)
        after = os.fstat(stream.fileno())
        if len(body) != before.st_size or after.st_mtime_ns != before.st_mtime_ns or after.st_ctime_ns != before.st_ctime_ns:
            raise ValueError("artifact changed during read")
    return body


def read_receipt(path, limit=RECEIPT_LIMIT):
    if path is None:
        return None, "missing"
    try:
        body = read_bounded(path, limit)
        item = json.loads(body)
        if not isinstance(item, dict):
            return None, "invalid"
        return (item, sha256(body).hexdigest()), None
    except FileNotFoundError:
        return None, "missing"
    except (OSError, ValueError):
        return None, "invalid"


def collected_source(row, expected_id, source_file, session, cutoff, finished, supplement):
    output = {"datasetId": expected_id, "status": "receipt_invalid"}
    if not isinstance(row, dict) or row.get("datasetId") != expected_id:
        return output

    # Open-market notices can establish a positive restriction. Their silence
    # cannot establish that every stock is clear.
    positive_notice = expected_id in POSITIVE_NOTICE_DATASETS
    try:
        requested = instant(row.get("requestedAt"))
        observed = instant(row.get("observedAt"))
        recorded = instant(row["recordedAt"]) if "recordedAt" in row else finished
    except ValueError:
        return output
    market_close = datetime.combine(session, time(13, 30), TAIPEI)
    if not market_close <= requested <= observed <= recorded <= finished <= cutoff:
        return {**output, "status": "missed_or_unproven_cutoff"}

    if positive_notice:
        exact = row.get("positiveDispositionBytesRecordedByCutoff") is True and row.get("completeAbsenceProved") is False
    elif supplement:
        exact = row.get("timelySessionPayload") is True and row.get("sessionIdentity") == "EXACT_PAYLOAD_DAY"
    else:
        exact = row.get("timelySessionPayload") is True and row.get("sourceDate") == session.isoformat()
    if row.get("httpStatus") != 200 or not exact:
        return {**output, "status": "source_date_or_scope_unverified"}

    digest = row.get("sha256")
    length = row.get("bytes")
    if not isinstance(digest, str) or not re.fullmatch("[0-9a-f]{64}", digest):
        return output
    if type(length) is not int or not 0 < length <= OBSERVATION_LIMIT:
        return output
    try:
        body = read_bounded(source_file, OBSERVATION_LIMIT)
    except FileNotFoundError:
        return {**output, "status": "metadata_only", "observedAt": row["observedAt"]}
    except (OSError, ValueError):
        return {**output, "status": "retained_artifact_invalid"}
    if supplement and row.get("saved") is not True:
        return {**output, "status": "retained_artifact_unbound"}
    if len(body) != length or sha256(body).hexdigest() != digest:
        return {**output, "status": "retained_artifact_mismatch"}

    status = "positive_notice_verified" if positive_notice else "timely_original_verified"
    return {"datasetId": expected_id, "status": status, "sha256": digest, "bytes": length,
            "observedAt": row["observedAt"], "recordedBy": recorded.isoformat()}


def reconcile_observation(path, session, cutoff, supplement):
    found, problem = read_receipt(path)
    if problem:
        return {"receiptStatus": problem}
    receipt, digest = found
    expected_schema = ("stockinsider-close-supplement-v2" if supplement
                       else "stockinsider-close-public-input-observation-v1")
    writer_key = "writerInvoked" if supplement else "publishOrWriterInvoked"
    clock_key = "completedAt" if supplement else "captureFinishedAt"
    try:
        valid_cutoff = instant(receipt.get("cutoff")) == cutoff
        finished = instant(receipt.get(clock_key))
    except ValueError:
        return {"receiptStatus": "invalid", "receiptSha256": digest}
    if (receipt.get("schema") != expected_schema or receipt.get("session") != session.isoformat()
            or not valid_cutoff or receipt.get(writer_key) is not False
            or supplement and not (receipt.get("rehearsal") is False and receipt.get("rankAuthority") is False)
            or not isinstance(receipt.get("sources"), dict)):
        return {"receiptStatus": "invalid", "receiptSha256": digest}

    datasets = SUPPLEMENTAL_DATASETS if supplement else OBSERVED_DATASETS
    sources = {
        name: collected_source(receipt["sources"].get(name), source_id, path.with_name(name + ".csv"),
                               session, cutoff, finished, supplement)
        for name, source_id in datasets.items()
    }
    return {"receiptStatus": "read", "receiptSha256": digest, "sources": sources}


def signed_checks(value):
    return (isinstance(value, dict)
            and all(type(value.get(key)) is int and 400 <= value[key] < 500
                    for key in ("badSignatureHttp", "wrongWriterReleaseHttp", "wrongLeaseHttp"))
            and value.get("ephemeralPostgrestUnixOnly") is True
            and value.get("leaseReleased") is True
            and type(value.get("writesAfterNegativeRequests")) is int and value["writesAfterNegativeRequests"] == 0)


def signed_visible(row, cutoff, visibility):
    if not isinstance(row, dict):
        return False
    try:
        requested = instant(row.get("requestedAt"))
        observed = instant(row.get("observedAt"))
        ready = instant(row.get("availableAt"))
    except ValueError:
        return False
    return (cutoff - timedelta(hours=8) <= requested <= observed <= ready < cutoff
            and row.get(visibility) is True and row.get("artifactReadbackVerified") is True
            and row.get("duplicateReadySameId") is True
            and isinstance(row.get("sha256"), str) and re.fullmatch("[0-9a-f]{64}", row["sha256"]) is not None)


def reconcile_signed(path, session, cutoff, disposition):
    datasets = POSITIVE_NOTICE_DATASETS if disposition else {11549}
    found, problem = read_receipt(path)
    if problem:
        return {"receiptStatus": problem, "datasets": {str(k): "unverified" for k in sorted(datasets)}}
    receipt, digest = found
    guard = receipt.get("signedWriterChecks" if disposition else "auth")
    try:
        verified = instant(receipt.get("verifiedAt"))
        source_cutoff = receipt.get("originalCutoff") if disposition else receipt["data"]["originalCutoff"]
        valid_day = instant(source_cutoff) == cutoff
        if disposition:
            valid_day = valid_day and instant(receipt.get("readClock")) == cutoff
    except (ValueError, TypeError, KeyError):
        valid_day = False
    if (not valid_day or receipt.get("targetSession") != session.isoformat()
            or receipt.get("formalServiceWrites") is not False or receipt.get("scratchRemoved") is not True
            or not signed_checks(guard) or not cutoff <= verified <= cutoff + timedelta(seconds=45)):
        return {"receiptStatus": "invalid", "receiptSha256": digest, "datasets": {str(k): "unverified" for k in sorted(datasets)}}
    outcomes = {str(k): "unverified" for k in sorted(datasets)}
    if disposition:
        rows = receipt.get("reports")
        if receipt.get("mode") == "live" and isinstance(rows, list):
            for dataset in sorted(datasets):
                entries = [row for row in rows if isinstance(row, dict) and row.get("datasetId") == dataset]
                if (len(entries) == 1 and entries[0].get("stage") == "acknowledged"
                        and entries[0].get("completeAbsenceProved") is False
                        and signed_visible(entries[0], cutoff, "readbackAtCutoff")):
                    outcomes[str(dataset)] = "signed_positive_notices_only"
    else:
        data = receipt["data"]
        lookup = data.get("lookup")
        if (receipt.get("httpClosedBeforeCutoff") is True and data.get("session") == session.isoformat()
                and isinstance(lookup, dict) and lookup.get("visibleAtOriginal2130") is True
                and signed_visible({**data, "visible": True}, cutoff, "visible")):
            outcomes["11549"] = "signed_cutoff_readback"
    return {"receiptStatus": "read", "receiptSha256": digest, "datasets": outcomes}


def receipt_cutoff(item, day_key, session, cutoff):
    try:
        return item.get(day_key) == session.isoformat() and instant(item.get("cutoff")) == cutoff
    except ValueError:
        return False


def reconcile_roster(path, session, cutoff):
    found, problem = read_receipt(path)
    if problem:
        return {"receiptStatus": problem}
    receipt, digest = found
    result = {"receiptStatus": "invalid", "receiptSha256": digest}
    replay = receipt.get("replay")
    try:
        finished = instant(receipt.get("finishedAt"))
        if finished > cutoff:
            return {**result, "receiptStatus": "missed_or_unproven_cutoff"}
    except ValueError:
        return result
    if (receipt.get("schema") != "stockinsider-stage-listed-roster-capture-v2"
            or receipt.get("mode") != "live" or not receipt_cutoff(receipt, "session", session, cutoff)
            or receipt.get("eligibleForRosterReview") is not True
            or receipt.get("registryWrite") is not False or receipt.get("rankingAuthority") is not False
            or not isinstance(replay, dict) or replay.get("targetSession") != session.isoformat()
            or replay.get("sameSessionByCutoff") is not True):
        return result
    reviewed, problem = read_receipt(path.with_name("listing-review.json"), 512 * 1024)
    if problem:
        return {**result, "receiptStatus": "projection_" + problem}
    projection, projection_hash = reviewed
    if (projection_hash != receipt.get("retainedProjectionSha256")
            or projection.get("schema") != "stockinsider-stage-listed-roster-review-v2"
            or not receipt_cutoff(projection, "session", session, cutoff)):
        return {**result, "receiptStatus": "projection_mismatch"}
    return {**result, "receiptStatus": "timely_review_projection", "projectionSha256": projection_hash,
            "registryWrite": False, "rankingAuthority": False}


def reconcile_limit(path, session, cutoff):
    found, problem = read_receipt(path)
    if problem:
        return {"receiptStatus": problem}
    receipt, digest = found
    result = {"receiptStatus": "invalid", "receiptSha256": digest}
    captures = receipt.get("captures")
    if (receipt.get("schema") not in ("stockinsider-actual-date-bound-limit-staging-v1",
                                     "stockinsider-actual-date-bound-limit-staging-v2")
            or not receipt_cutoff(receipt, "session", session, cutoff)
            or receipt.get("publicationAuthority") is not False
            or not isinstance(captures, list) or len(captures) != 3):
        return result
    try:
        checked = instant(receipt.get("checkedAt"))
        timely = all(instant(row.get("observedAt")) <= instant(row.get("recordedAt")) <= checked <= cutoff
                     for row in captures if isinstance(row, dict))
    except ValueError:
        return result
    if timely and all(isinstance(row, dict) for row in captures) and isinstance(receipt.get("diagnosticResult"), dict):
        return {**result, "receiptStatus": "single_symbol_receipt_only",
                "retainedOriginalBytesVerified": False, "publicationAuthority": False}
    return result


def exact_blob(path, row):
    if not isinstance(row, dict):
        return False
    try:
        body = read_bounded(path, OBSERVATION_LIMIT)
        return len(body) == row.get("bytes") and sha256(body).hexdigest() == row.get("sha256")
    except (OSError, ValueError):
        return False


def reconcile_range(path, session, cutoff):
    found, problem = read_receipt(path)
    if problem:
        return {"receiptStatus": problem}
    receipt, digest = found
    result = {"receiptStatus": "invalid", "receiptSha256": digest}
    sources = receipt.get("sources")
    if (receipt.get("schemaVersion") not in ("launch-disposition-range-replay-v1", "launch-disposition-range-replay-v2")
            or not receipt_cutoff(receipt, "day", session, cutoff)
            or receipt.get("rankingAuthority") is not False or receipt.get("durableWriterReceipt") is not False
            or not isinstance(sources, list)):
        return result
    reports = {}
    for market in ("TWSE", "TPEX"):
        options = [row for row in sources if isinstance(row, dict) and row.get("market") == market]
        status = "missing_or_refused"
        if len(options) == 1:
            row = options[0]
            dated, licensed = row.get("range"), row.get("licensed")
            if (not exact_blob(path.with_name(market + "-effective-range.json"), dated)
                    or not exact_blob(path.with_name(market + "-notice.csv"), licensed)):
                status = "retained_artifact_mismatch"
            elif row.get("reportsAgree") is not True:
                status = "reports_disagree"
            else:
                try:
                    timely = all(instant(item.get("observedAt")) <= instant(item.get("recordedAt")) <= cutoff
                                 for item in (dated, licensed))
                    status = ("timely_reports_agree" if timely and row.get("timelyOnThisReplay") is True
                              else "missed_or_unproven_cutoff")
                except ValueError:
                    status = "missed_or_unproven_cutoff"
        reports[market] = status
    return {**result, "receiptStatus": "read", "markets": reports,
            "durableWriterReceipt": False, "rankingAuthority": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("session", type=date.fromisoformat)
    for option in ("observer", "supplement", "signed-turnover", "signed-disposition", "roster", "price-limit", "disposition-range"):
        parser.add_argument("--" + option, type=Path)
    args = parser.parse_args()
    cutoff = datetime.combine(args.session, time(21, 30), TAIPEI)
    print(json.dumps({
        "schema": "stockinsider-staging-close-reconciliation-v1",
        "session": args.session.isoformat(), "cutoff": cutoff.isoformat(),
        "observer": reconcile_observation(args.observer, args.session, cutoff, False),
        "supplemental": reconcile_observation(args.supplement, args.session, cutoff, True),
        "signedTurnover": reconcile_signed(args.signed_turnover, args.session, cutoff, False),
        "signedDisposition": reconcile_signed(args.signed_disposition, args.session, cutoff, True),
        "roster": reconcile_roster(args.roster, args.session, cutoff),
        "priceLimit": reconcile_limit(args.price_limit, args.session, cutoff),
        "dispositionRange": reconcile_range(args.disposition_range, args.session, cutoff),
        "fullDispositionAbsenceEstablished": False,
        "officialCalendarAndRankingCertified": False,
        "writerInvoked": False,
    }, ensure_ascii=True, sort_keys=True))


if __name__ == "__main__":
    main()
