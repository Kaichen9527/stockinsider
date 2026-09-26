"""Bounded, offline research-report event ledger; never a trading decision.

Input contains attributed facts and metadata, not article/report bodies. Rights
grants are supplied separately by an authorized operator; an ingestion method,
public URL or assertion inside a report is never itself a grant.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from datetime import date, datetime, timezone
from pathlib import Path
from urllib.parse import urlsplit
from zoneinfo import ZoneInfo

SCHEMA_VERSION = "broker-report-event-v1"
EVALUATION_VERSION = "broker-report-evaluation-v1"
MAX_EVENTS = 10000
SOURCE_TYPES = {"broker_original", "licensed_provider", "media_reported", "third_party_summary"}
FIELDS = {"schema_version", "event_id", "content_hash", "symbol", "exchange", "broker_id", "broker_group_id",
          "analyst", "publisher", "source_type", "source_url", "original_report_url", "report_key", "report_date",
          "report_published_at", "article_published_at", "first_seen_at", "recorded_at", "source_available_at",
          "availability_evidence", "rights_status", "rights_grant_id", "rating", "target", "estimates",
          "supersedes_event_id", "retracts_event_id", "extraction_version"}


def _text(value, maximum=256, *, optional=False):
    if value is None and optional:
        return None
    if not isinstance(value, str) or not 0 < len(value) <= maximum:
        raise ValueError("invalid_text")
    return value


def _time(value):
    value = _text(value, 64)
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise ValueError("invalid_timestamp") from error
    if parsed.tzinfo is None:
        raise ValueError("timestamp_timezone_required")
    return parsed.astimezone(timezone.utc).isoformat(timespec="microseconds").replace("+00:00", "Z")


def _day(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("invalid_date")
    date.fromisoformat(value)
    return value


def _number(value):
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise ValueError("invalid_number")
    return float(value)


def _url(value, *, optional=False):
    if value is None and optional:
        return None
    value = _text(value, 2048)
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("invalid_source_url")
    return value


def _canonical(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def _hash(value):
    return hashlib.sha256(_canonical(value).encode()).hexdigest()


def _object(value, fields):
    if not isinstance(value, dict) or set(value) - set(fields):
        raise ValueError("invalid_object_fields")
    return value


def normalize_report_event(raw: dict) -> dict:
    """Create/verify a content-addressed immutable event; never alter the input.

    Once sealed, changing any member without creating a new event is rejected.
    Unknown timestamps/rights remain unknown, never inferred from a filename.
    """
    _object(raw, FIELDS)
    if raw.get("schema_version", SCHEMA_VERSION) != SCHEMA_VERSION:
        raise ValueError("unsupported_schema")
    if not re.fullmatch(r"\d{4}", str(raw.get("symbol", ""))) or not isinstance(raw.get("symbol"), str):
        raise ValueError("invalid_symbol")
    if raw.get("exchange") not in {"TWSE", "TPEX"} or raw.get("source_type") not in SOURCE_TYPES:
        raise ValueError("invalid_source_identity")
    event = {"schema_version": SCHEMA_VERSION, "symbol": raw["symbol"], "exchange": raw["exchange"],
             "source_type": raw["source_type"], "source_url": _url(raw.get("source_url")),
             "original_report_url": _url(raw.get("original_report_url"), optional=True)}
    for field in ["broker_id", "broker_group_id", "analyst", "rights_grant_id", "supersedes_event_id", "retracts_event_id"]:
        event[field] = _text(raw.get(field), optional=True)
    for field in ["publisher", "report_key", "extraction_version"]:
        event[field] = _text(raw.get(field))
    event["report_date"] = _day(raw["report_date"]) if raw.get("report_date") else None
    for field in ["report_published_at", "article_published_at", "source_available_at"]:
        event[field] = _time(raw[field]) if raw.get(field) else None
    for field in ["first_seen_at", "recorded_at"]:
        event[field] = _time(raw.get(field))
    if event["recorded_at"] < event["first_seen_at"]:
        raise ValueError("recorded_before_first_seen")
    rights = raw.get("rights_status", "unknown")
    if rights not in {"unknown", "permitted", "blocked"}:
        raise ValueError("invalid_rights_status")
    event["rights_status"] = rights
    evidence = raw.get("availability_evidence")
    if evidence is not None:
        _object(evidence, {"kind", "evidence_id", "evidence_url", "known_at"})
        if evidence.get("kind") not in {"publisher_timestamp", "observed_snapshot", "licensed_pit_snapshot"}:
            raise ValueError("invalid_availability_evidence")
        evidence = {"kind": evidence["kind"], "evidence_id": _text(evidence.get("evidence_id")),
                    "evidence_url": _url(evidence.get("evidence_url")), "known_at": _time(evidence.get("known_at"))}
    event["availability_evidence"] = evidence
    rating = raw.get("rating")
    if rating is not None:
        _object(rating, {"raw", "scale_id", "previous", "current", "action"})
        if rating.get("action") not in {"upgrade", "downgrade", "reiterate", "initiate", "unknown"}:
            raise ValueError("invalid_rating_action")
        rating = {field: _text(rating.get(field), optional=True) for field in ["raw", "scale_id", "previous", "current", "action"]}
    event["rating"] = rating
    target = raw.get("target")
    if target is not None:
        _object(target, {"previous", "current", "currency", "horizon_months", "share_basis"})
        target = {"previous": _number(target.get("previous")), "current": _number(target.get("current")),
                  "currency": _text(target.get("currency"), 3), "horizon_months": _number(target.get("horizon_months")),
                  "share_basis": _text(target.get("share_basis"))}
        if any(target[key] is not None and target[key] <= 0 for key in ["previous", "current", "horizon_months"]):
            raise ValueError("invalid_target")
    event["target"] = target
    estimates = raw.get("estimates", [])
    if not isinstance(estimates, list) or len(estimates) > 16:
        raise ValueError("estimate_bound")
    event["estimates"] = []
    for estimate in estimates:
        _object(estimate, {"metric", "fiscal_period_end", "accounting_basis", "currency", "unit", "previous", "current", "reported_change_pct"})
        if estimate.get("metric") != "eps":
            raise ValueError("unsupported_estimate_metric")
        event["estimates"].append({"metric": "eps", "fiscal_period_end": _day(estimate.get("fiscal_period_end")),
                                   **{field: _text(estimate.get(field)) for field in ["accounting_basis", "currency", "unit"]},
                                   **{field: _number(estimate.get(field)) for field in ["previous", "current", "reported_change_pct"]}})
    event["estimates"].sort(key=_canonical)
    estimate_keys = [(row["metric"], row["fiscal_period_end"], row["accounting_basis"], row["currency"], row["unit"]) for row in event["estimates"]]
    if len(set(estimate_keys)) != len(estimate_keys):
        raise ValueError("duplicate_estimate_basis")
    digest = _hash(event)
    if raw.get("content_hash", digest) != digest or raw.get("event_id", "report:" + digest) != "report:" + digest:
        raise ValueError("immutable_event_hash_mismatch")
    return {**event, "event_id": "report:" + digest, "content_hash": digest}


def append_report_events(existing: list[dict], incoming: list[dict]) -> list[dict]:
    """Append immutable revisions; an identical retry does not create an event."""
    if len(existing) + len(incoming) > MAX_EVENTS:
        raise ValueError("event_bound")
    by_id = {}
    for raw in [*existing, *incoming]:
        event = normalize_report_event(raw)
        by_id[event["event_id"]] = event
    return sorted(by_id.values(), key=lambda event: (event["recorded_at"], event["event_id"]))


def _available_at(event):
    # Strict system replay. A newly fetched old report never becomes yesterday's
    # system evidence, even when its public timestamp is independently verified.
    dates = [event[field] for field in ["first_seen_at", "recorded_at", "report_published_at", "article_published_at", "source_available_at"] if event[field]]
    if event["availability_evidence"]:
        dates.append(event["availability_evidence"]["known_at"])
    return max(dates)


def _freshness(event, cutoff, max_age_days):
    # Publication age is distinct from system availability. Learning about an
    # old report today never restarts its factor window. A date-only report is
    # conservatively aged from the start of that date in its Taiwan market.
    publication = event["report_published_at"] or event["article_published_at"]
    basis = "report_published_at" if event["report_published_at"] else "article_published_at" if publication else None
    precision = "timestamp" if publication else None
    if publication is None and event["report_date"]:
        publication = _time(event["report_date"] + "T00:00:00+08:00")
        basis, precision = "report_date_start_of_day_Asia_Taipei", "date_conservative"
    if publication is None:
        return {"status": "unknown", "publication_at": None, "publication_basis": None,
                "precision": None, "age_days": None}
    elapsed = (datetime.fromisoformat(cutoff.replace("Z", "+00:00"))
               - datetime.fromisoformat(publication.replace("Z", "+00:00"))).total_seconds()
    return {"status": "fresh" if 0 <= elapsed <= max_age_days * 86400 else "stale",
            "publication_at": publication, "publication_basis": basis,
            "precision": precision, "age_days": elapsed / 86400}


def _rights_reason(event, grants, cutoff):
    if event["rights_status"] == "blocked":
        return "rights_explicitly_blocked"
    supplied = [grant for grant in grants if grant.get("grant_id") == event["rights_grant_id"] and event["rights_grant_id"]]
    try:
        matched = [grant for grant in supplied if _time(grant.get("known_at")) <= cutoff]
    except ValueError:
        return "rights_grant_invalid"
    if not matched:
        return "rights_grant_not_yet_known" if supplied else "factor_use_grant_missing"
    # Conflicting grants fail closed; a block always overrides a permit.
    if any(grant.get("status") == "blocked" for grant in matched):
        return "rights_explicitly_blocked"
    if len(matched) != 1:
        return "rights_grant_conflict"
    grant = matched[0]
    if any(not isinstance(grant.get(key), list) or not all(isinstance(value, str) for value in grant[key])
           for key in ["permissions", "broker_ids", "source_types", "source_domains"]):
        return "rights_grant_invalid"
    try:
        if _time(grant.get("known_at")) > cutoff:
            return "rights_grant_not_yet_known"
        if grant.get("expires_at") and _time(grant["expires_at"]) <= cutoff:
            return "rights_grant_expired"
        _url(grant.get("evidence_url"))
    except ValueError:
        return "rights_grant_invalid"
    if grant.get("status") != "permitted" or "factor_use" not in grant.get("permissions", []):
        return "factor_use_not_permitted"
    if event["broker_id"] not in grant.get("broker_ids", []) or event["source_type"] not in grant.get("source_types", []):
        return "rights_grant_scope_mismatch"
    if urlsplit(event["source_url"]).hostname not in grant.get("source_domains", []):
        return "rights_grant_scope_mismatch"
    return None


def _comparison(previous, current):
    if previous is None or current is None:
        return {"direction": "unknown", "change_pct": None, "comparison_kind": "missing_previous_or_current"}
    direction = "up" if current > previous else "down" if current < previous else "unchanged"
    kind = "positive_base" if previous > 0 and current >= 0 else "zero_base" if previous == 0 else "loss_to_profit" if previous < 0 <= current else "profit_to_loss" if previous > 0 > current else "both_losses"
    change = (current / previous - 1) * 100 if kind == "positive_base" else None
    if change is not None and not math.isfinite(change):
        change = None
        kind = "unbounded_ratio"
    return {"direction": direction, "change_pct": change, "comparison_kind": kind}


def _features(event):
    base = {"symbol": event["symbol"], "broker_group_id": event["broker_group_id"], "event_id": event["event_id"],
            "source_type": event["source_type"], "available_at": _available_at(event),
            "report_published_at": event["report_published_at"], "article_published_at": event["article_published_at"],
            "validation_status": "research_only"}
    features = []
    for estimate in event["estimates"]:
        known_basis = estimate["accounting_basis"] != "unknown" and estimate["unit"] == "per_ordinary_share" and estimate["currency"] == "TWD"
        comparison = _comparison(estimate["previous"], estimate["current"])
        features.append({**base, "kind": "eps_revision", **estimate, **comparison,
                         "usable": known_basis and comparison["direction"] != "unknown",
                         "reason": None if known_basis else "fiscal_or_share_basis_unverified"})
    target = event["target"]
    if target:
        comparison = _comparison(target["previous"], target["current"])
        known_basis = target["share_basis"] == "ordinary_share" and target["currency"] == "TWD" and target["horizon_months"] is not None
        features.append({**base, "kind": "target_revision", **target, **comparison,
                         "usable": known_basis and comparison["direction"] != "unknown",
                         "reason": None if known_basis else "target_horizon_or_share_basis_unverified"})
    rating = event["rating"]
    if rating:
        comparable = bool(rating["scale_id"] and rating["previous"] and rating["current"])
        features.append({**base, "kind": "rating_change", **rating,
                         "direction": {"upgrade": "up", "downgrade": "down", "reiterate": "unchanged"}.get(rating["action"], "unknown"),
                         "usable": comparable and rating["action"] in {"upgrade", "downgrade", "reiterate"},
                         "reason": None if comparable else "rating_scale_or_previous_missing"})
    return features


def evaluate_report_events(events: list[dict], *, cutoff: str, symbol: str | None = None,
                           rights_grants: list[dict] | None = None, max_age_days: int = 60) -> dict:
    """Evaluate current research evidence at a frozen system cutoff.

    Returns metadata regardless of factor entitlement, with no raw article text.
    Report syndication and broker-group breadth are separate deduplication steps.
    """
    cutoff = _time(cutoff)
    if type(max_age_days) is not int or not 1 <= max_age_days <= 365:
        raise ValueError("invalid_max_age_days")
    if not isinstance(events, list) or len(events) > MAX_EVENTS:
        raise ValueError("event_bound")
    if symbol is not None and not re.fullmatch(r"\d{4}", symbol):
        raise ValueError("invalid_symbol")
    grants = rights_grants or []
    if not isinstance(grants, list) or len(grants) > MAX_EVENTS or not all(isinstance(grant, dict) for grant in grants):
        raise ValueError("invalid_rights_grants")
    visible = {}; records = []; invalid_count = 0; duplicate_count = 0
    cutoff_day = datetime.fromisoformat(cutoff.replace("Z", "+00:00")).astimezone(ZoneInfo("Asia/Taipei")).date().isoformat()
    for index, raw in enumerate(events):
        try:
            event = normalize_report_event(raw)
        except (ValueError, TypeError) as error:
            invalid_count += 1
            records.append({"input_index": index, "status": "invalid", "reasons": [str(error)]})
            continue
        if symbol and event["symbol"] != symbol:
            continue
        if event["event_id"] in visible:
            duplicate_count += 1
            continue
        reasons = []
        if event["report_date"] and event["report_date"] > cutoff_day:
            reasons.append("future_report_date")
        if _available_at(event) > cutoff:
            reasons.append("not_available_at_cutoff")
        if reasons:
            records.append({"event_id": event["event_id"], "symbol": event["symbol"], "status": "future", "reasons": reasons})
        else:
            visible[event["event_id"]] = event
    suppressed = {}; lineage_invalid = set()
    for event in visible.values():
        for field, status in [("supersedes_event_id", "superseded"), ("retracts_event_id", "retracted")]:
            old_id = event[field]
            if not old_id:
                continue
            old = visible.get(old_id)
            if not old or any(old[key] != event[key] for key in ["symbol", "broker_group_id", "report_key"]) or _available_at(old) > _available_at(event):
                lineage_invalid.add(event["event_id"])
            else:
                suppressed[old_id] = status
    candidates = []
    for event in visible.values():
        reasons = []
        freshness = _freshness(event, cutoff, max_age_days)
        if freshness["status"] != "fresh":
            reasons.append("report_age_unknown" if freshness["status"] == "unknown" else "report_stale")
        if event["event_id"] in lineage_invalid:
            reasons.append("invalid_correction_lineage")
        if not event["availability_evidence"]:
            reasons.append("availability_evidence_missing")
        if not event["broker_id"] or not event["broker_group_id"]:
            reasons.append("named_broker_identity_missing")
        if event["source_type"] == "third_party_summary":
            reasons.append("original_or_media_verification_required")
        rights_reason = _rights_reason(event, grants, cutoff)
        if rights_reason:
            reasons.append(rights_reason)
        status = suppressed.get(event["event_id"], "retraction" if event["retracts_event_id"] else "metadata_only" if reasons else "evaluated")
        if event["event_id"] in lineage_invalid:
            status = "metadata_only"
        record = {"event_id": event["event_id"], "symbol": event["symbol"], "status": status,
                  "reasons": sorted(set(reasons)), "freshness": freshness}
        records.append(record)
        if status == "evaluated":
            candidates.append((event, record))
    grouped = {}
    for event, record in candidates:
        grouped.setdefault((event["symbol"], event["broker_group_id"], event["report_key"]), []).append((event, record))
    features = []
    priority = {"broker_original": 0, "licensed_provider": 1, "media_reported": 2, "third_party_summary": 3}
    for group in grouped.values():
        signatures = {_hash({key: event[key] for key in ["rating", "target", "estimates"]}) for event, _ in group}
        if len(signatures) > 1:
            for _, record in group:
                record.update(status="metadata_only", reasons=["conflicting_report_versions_without_correction"])
            continue
        group.sort(key=lambda pair: (priority[pair[0]["source_type"]], _available_at(pair[0]), pair[0]["event_id"]))
        features.extend(_features(group[0][0]))
        for _, record in group[1:]:
            record.update(status="duplicate", reasons=["same_report_syndication"])
            duplicate_count += 1
    # One current contribution per broker group and comparable fiscal basis.
    contributions = {}
    for feature in features:
        key = tuple(feature.get(field) for field in ["symbol", "broker_group_id", "kind", "fiscal_period_end", "accounting_basis", "currency", "unit", "horizon_months", "share_basis", "scale_id"])
        contributions.setdefault(key, []).append(feature)
    selected = []
    for rows in contributions.values():
        event_time = lambda feature: feature["report_published_at"] or feature["article_published_at"] or feature["available_at"]
        latest_time = max(map(event_time, rows))
        latest_rows = [feature for feature in rows if event_time(feature) == latest_time]
        latest_rows.sort(key=lambda feature: feature["event_id"])
        chosen = latest_rows[0]
        if len({_hash({key: feature.get(key) for key in ["previous", "current", "direction", "action", "reported_change_pct"]}) for feature in latest_rows}) > 1:
            chosen = {**chosen, "usable": False, "reason": "concurrent_broker_revision_conflict"}
        selected.append(chosen)
    selected.sort(key=_canonical)
    breadth = []
    basis_fields = ["symbol", "fiscal_period_end", "accounting_basis", "currency", "unit"]
    basis_key = lambda feature: tuple(feature.get(field) for field in basis_fields)
    for key in sorted({basis_key(feature) for feature in selected if feature["kind"] == "eps_revision"}):
        rows = [feature for feature in selected if feature["kind"] == "eps_revision" and basis_key(feature) == key and feature["usable"]]
        breadth.append({**dict(zip(basis_fields, key)), "up_broker_groups": len({row["broker_group_id"] for row in rows if row["direction"] == "up"}),
                        "down_broker_groups": len({row["broker_group_id"] for row in rows if row["direction"] == "down"}),
                        "covered_broker_groups": len({row["broker_group_id"] for row in rows})})
    counts = {status: sum(record["status"] == status for record in records) for status in ["evaluated", "metadata_only", "future", "superseded", "retracted", "retraction", "duplicate", "invalid"]}
    return {"schema_version": EVALUATION_VERSION, "validation_status": "research_only", "cutoff": cutoff,
            "age_policy": {"version": "publication-age-v1", "max_age_days": max_age_days, "boundary": "inclusive",
                           "basis_priority": ["report_published_at", "article_published_at", "report_date"],
                           "date_only_basis": "start_of_day_Asia_Taipei", "unknown_age_factor_use": "blocked"},
            "summary": {"input_count": len(events), "visible_event_count": len(visible), "invalid_count": invalid_count,
                        "duplicate_count": duplicate_count, "counts": counts, "usable_feature_count": sum(feature["usable"] for feature in selected)},
            "records": sorted(records, key=_canonical), "metadata_events": sorted(visible.values(), key=lambda event: event["event_id"]),
            "revision_features": selected, "eps_revision_breadth": breadth}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--cutoff", required=True)
    parser.add_argument("--symbol")
    parser.add_argument("--rights-grants", type=Path)
    parser.add_argument("--max-age-days", type=int, default=60)
    parser.add_argument("--output", type=Path)
    args = parser.parse_args(argv)
    if args.input.stat().st_size > 32 * 1024 * 1024:
        parser.error("input exceeds 32 MiB")
    payload = json.loads(args.input.read_text(encoding="utf-8"))
    events = payload if isinstance(payload, list) else payload.get("events", payload.get("research_events", []))
    grants = json.loads(args.rights_grants.read_text(encoding="utf-8")) if args.rights_grants else []
    result = evaluate_report_events(events, cutoff=args.cutoff, symbol=args.symbol, rights_grants=grants,
                                    max_age_days=args.max_age_days)
    rendered = json.dumps(result, indent=2, ensure_ascii=False, allow_nan=False) + "\n"
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
