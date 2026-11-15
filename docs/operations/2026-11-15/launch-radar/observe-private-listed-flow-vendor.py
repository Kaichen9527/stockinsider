#!/usr/bin/env python3
"""Observe the FinMind market-level flow edition for private research only."""
import argparse
import hashlib
import json
import os
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, Request, build_opener

TAIPEI = timezone(timedelta(hours=8))
VENDOR = "https://api.finmindtrade.com/api/v4/data"
DATASET = "TaiwanStockTotalInstitutionalInvestors"
ROOT = Path("/var/lib/stockinsider-stage-flow-vendor-202611")
LIVE_DAYS = ("2026-11-16", "2026-11-17")
KNOWN_CATEGORIES = frozenset((
    "Foreign_Investor", "Foreign_Dealer_Self", "Investment_Trust",
    "Dealer_self", "Dealer_Hedging", "total",
))
BYTE_LIMIT = 64 * 1024


class RefuseRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def observe(day, replay):
    start = datetime.now(timezone.utc)
    cutoff = datetime.combine(day, time(21, 30), TAIPEI)
    window_start = cutoff - timedelta(minutes=6)
    if not replay and not window_start <= start < cutoff:
        raise SystemExit("outside_live_observation_window")
    earliest = day - timedelta(days=13)
    query = urlencode({"dataset": DATASET, "start_date": earliest.isoformat(), "end_date": day.isoformat()})
    receipt = {
        "schema": "stockinsider-private-vendor-flow-observation-v1",
        "provider": "FinMind",
        "dataset": DATASET,
        "sessionDate": day.isoformat(),
        "requestedStart": earliest.isoformat(),
        "startedAt": start.isoformat(),
        "cutoff": cutoff.isoformat(),
        "researchReplay": replay,
        "sourceReportedSettledEdition": False,
        "providerReportedMarket": None,
        "marketScopeEvidence": "historical_parity_only",
        "publicUseApproved": False,
        "writerInvoked": False,
    }
    raw = None
    try:
        request = Request(VENDOR + "?" + query, headers={"Accept": "application/json", "User-Agent": "StockInsider-private-source-validation/1"})
        with build_opener(RefuseRedirect).open(request, timeout=9) as response:
            receipt["httpStatus"] = response.status
            receipt["httpDate"] = response.headers.get("Date")
            if response.status != 200 or response.headers.get_content_type() != "application/json":
                raise ValueError("response_type")
            raw = response.read(BYTE_LIMIT + 1)
        received = datetime.now(timezone.utc)
        if len(raw) > BYTE_LIMIT:
            raise ValueError("byte_limit")
        receipt.update({"observedAt": received.isoformat(), "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw)})
        payload = json.loads(raw)
        if not isinstance(payload, dict) or payload.get("status") != 200 or not isinstance(payload.get("data"), list):
            raise ValueError("vendor_status")
        groups = {}
        for row in payload["data"]:
            if not isinstance(row, dict) or set(row) != {"date", "name", "buy", "sell"}:
                raise ValueError("row_schema")
            row_day = date.fromisoformat(row["date"])
            if row_day.isoformat() != row["date"] or not earliest <= row_day <= day or row["name"] not in KNOWN_CATEGORIES:
                raise ValueError("row_scope")
            if any(type(row[side]) is not int or not 0 <= row[side] <= 10**13 for side in ("buy", "sell")):
                raise ValueError("row_value")
            categories = groups.setdefault(row["date"], {})
            if row["name"] in categories:
                raise ValueError("duplicate_category")
            categories[row["name"]] = (row["buy"], row["sell"])
        complete = []
        for label, categories in sorted(groups.items()):
            if set(categories) != KNOWN_CATEGORIES:
                continue
            total = tuple(sum(values[index] for key, values in categories.items() if key != "total") for index in range(2))
            if total != categories["total"]:
                raise ValueError("total_mismatch")
            complete.append(label)
        before_cutoff = received < cutoff and received.astimezone(TAIPEI).date() == day
        receipt.update({
            "status": "SESSION_PRESENT" if day.isoformat() in complete else "SESSION_MISSING_OR_INCOMPLETE",
            "observedSameDayBeforeCutoff": before_cutoff,
            "completeVendorDates": complete,
            "observedCategoryCount": len(groups.get(day.isoformat(), set())),
        })
        if not before_cutoff or day.isoformat() not in complete:
            raw = None
    except HTTPError as exc:
        receipt.update({"status": "HTTP_FAILURE", "httpStatus": exc.code})
        raw = None
    except (URLError, TimeoutError, OSError):
        receipt["status"] = "TRANSPORT_FAILURE"
        raw = None
    except (ValueError, TypeError, KeyError, UnicodeError):
        receipt["status"] = "PAYLOAD_REJECTED"
        raw = None
    receipt["completedAt"] = datetime.now(timezone.utc).isoformat()
    receipt["rawSaved"] = bool(raw and not replay)
    if not replay:
        session_dir = ROOT / day.isoformat()
        session_dir.mkdir(mode=0o700, exist_ok=False)
        if raw:
            (session_dir / "response.json").write_bytes(raw)
        (session_dir / "receipt.json").write_text(json.dumps(receipt, indent=2) + "\n")
    print(json.dumps(receipt, sort_keys=True))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("session", choices=("2026-11-13",) + LIVE_DAYS)
    parser.add_argument("--replay-check", action="store_true")
    args = parser.parse_args()
    if args.replay_check != (args.session == "2026-11-13") or os.getuid() == 0:
        raise SystemExit("outside_private_stage_scope")
    observe(date.fromisoformat(args.session), args.replay_check)


if __name__ == "__main__":
    main()
