#!/usr/bin/env python3
"""Read registered market sources in isolated staging, without a writer."""

import argparse
import csv
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import re
import ssl
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
MAX_BYTES = 500_000
LIVE_SESSIONS = ("2026-11-16", "2026-11-17")
HEADERS = {
    11764: ("日期", "證券代號", "證券名稱", "收盤價", "殖利率(%)", "股利年度", "本益比", "股價淨值比", "財報年/季"),
    29082: ("編號", "公布日期", "證券代號", "證券名稱", "累計", "處置條件", "處置起迄時間", "處置措施", "處置內容", "備註"),
    11396: ("公布日期", "證券代號", "證券名稱", "處置起訖時間", "處置原因", "處置內容"),
    48664: ("資料日期", "證券代號", "證券名稱", "暫停交易", "恢復交易"),
}
SYMBOL = re.compile(r"[0-9][0-9A-Z]{3,7}")
TRANSFER = {"twse_reported_close": 11764, "twse_disposition": 29082, "tpex_disposition": 11396,
            "tpex_halt_notice": 48664}


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def civil(value):
    raw = value.replace("/", "")
    if not re.fullmatch(r"[0-9]{7,8}", raw):
        raise ValueError("civil_date")
    year = int(raw[:-4]) + (1911 if len(raw) == 7 else 0)
    return date(year, int(raw[-4:-2]), int(raw[-2:])).isoformat()


def source_urls(session):
    day = session.replace("-", "")
    return {
        "twse_reported_close": "https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?response=open_data&date=" + day,
        "twse_disposition": "https://www.twse.com.tw/announcement/punish?response=open_data&startDate=" + day + "&endDate=" + day,
        "tpex_disposition": "https://www.tpex.org.tw/web/bulletin/disposal_information/disposal_information_result.php?l=zh-tw&o=data",
        "tpex_halt_notice": "https://www.tpex.org.tw/web/stock/aftertrading/spendi/sprc_today_result.php?l=zh-tw&o=data",
    }


def positive(value):
    try:
        number = Decimal(value.replace(",", ""))
        return number.is_finite() and number > 0
    except InvalidOperation:
        return False


def inspect_csv(dataset, raw, session):
    decoder = csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
    header = tuple(next(decoder, ()))
    if header != HEADERS[dataset]:
        raise ValueError("csv_header")
    rows = []
    for row in decoder:
        if not any(row):
            continue
        if len(row) != len(header):
            raise ValueError("csv_row")
        rows.append(dict(zip(header, row)))
    result = {"dataRows": len(rows), "sessionIdentity": "UNKNOWN", "usableRecords": 0}
    if dataset == 11764:
        codes = set()
        if not rows:
            raise ValueError("empty_closes")
        for row in rows:
            code = row["證券代號"]
            if not re.fullmatch(r"[0-9A-Za-z]{2,12}", code) or code in codes or row["日期"] != session.replace("-", ""):
                raise ValueError("close_date_or_symbol")
            codes.add(code)
        close_count = sum(positive(row["收盤價"]) for row in rows)
        if not close_count:
            raise ValueError("no_positive_close")
        result.update(sessionIdentity="EXACT_PAYLOAD_DAY", usableRecords=close_count)
    elif dataset in (29082, 11396):
        period_label = "處置起迄時間" if dataset == 29082 else "處置起訖時間"
        subjects = set()
        for row in rows:
            symbol = row["證券代號"].strip()
            if not SYMBOL.fullmatch(symbol):
                raise ValueError("disposition_symbol")
            start, stop = map(civil, re.split("[~～]", row[period_label].strip()))
            issued = civil(row["公布日期"].strip())
            if start > stop or issued > start:
                raise ValueError("disposition_interval")
            if issued <= session and start <= session <= stop:
                subjects.add(symbol)
        result.update(sessionIdentity="DATED_QUERY_WITH_OVERLAPS" if dataset == 29082 else "CURRENT_FEED_ANNOUNCED_OVERLAPS",
                      usableRecords=len(subjects), completeAbsenceProved=False)
    else:
        source_days = set()
        notices = 0
        for row in rows:
            raw_day, symbol = row["資料日期"].strip(), row["證券代號"].strip()
            if raw_day:
                source_days.add(civil(raw_day))
            if symbol:
                if not SYMBOL.fullmatch(symbol) or not raw_day:
                    raise ValueError("halt_symbol_date")
                if civil(raw_day) == session:
                    notices += 1
        result.update(sessionIdentity="EXACT_PAYLOAD_DAY" if source_days == {session} else "UNKNOWN",
                      sourceDays=sorted(source_days), usableRecords=notices, completeAbsenceProved=False)
    return result


def acquire(name, url, session, cutoff, rehearsal):
    dataset = TRANSFER[name]
    started = datetime.now(timezone.utc)
    result = {"datasetId": dataset, "requestedAt": started.isoformat(), "beforeCutoff": False}
    if not rehearsal and (started.astimezone(TAIPEI).date().isoformat() != session or
                          not time(21, 28) <= started.astimezone(TAIPEI).time() < time(21, 30)):
        result["gap"] = "outside_observation_window"
        return name, result, None
    try:
        opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
        request = Request(url, headers={"User-Agent": "StockInsider/1.0 registered staging observation", "Accept": "text/csv, application/csv"})
        with opener.open(request, timeout=8) as response:
            raw = response.read(MAX_BYTES + 1)
            mime = response.headers.get_content_type()
            observed = datetime.now(timezone.utc)
            result.update(observedAt=observed.isoformat(), httpStatus=response.status, contentType=mime)
        if result["httpStatus"] != 200 or mime not in ("text/csv", "application/csv") or len(raw) > MAX_BYTES:
            raise ValueError("transport")
        result.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        result.update(inspect_csv(dataset, raw, session))
        result["beforeCutoff"] = not rehearsal and observed < cutoff
        result["timelySessionPayload"] = result["beforeCutoff"] and result["sessionIdentity"] == "EXACT_PAYLOAD_DAY"
        return name, result, raw if dataset == 11764 and (result["timelySessionPayload"] or rehearsal) else None
    except HTTPError as err:
        result.update(httpStatus=err.code, gap="http")
    except (URLError, TimeoutError, OSError, ValueError, csv.Error):
        result["gap"] = "response_unavailable_or_invalid"
    return name, result, None


def atomic_write(path, body):
    temp = path.with_suffix(path.suffix + ".part")
    with temp.open("xb") as file:
        file.write(body)
        file.flush()
        os.fsync(file.fileno())
    os.replace(temp, path)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("session")
    parser.add_argument("output", type=Path)
    parser.add_argument("--rehearsal", action="store_true")
    args = parser.parse_args()
    if args.session not in LIVE_SESSIONS and not (args.rehearsal and args.session == "2026-11-13"):
        parser.error("unsupported session")
    start = datetime.now(timezone.utc)
    cutoff = datetime.combine(date.fromisoformat(args.session), time(21, 30), TAIPEI)
    if not args.rehearsal and (start >= cutoff or start.astimezone(TAIPEI).date().isoformat() != args.session):
        parser.error("outside actual session")
    os.umask(0o077)
    args.output.mkdir(mode=0o700)
    receipt = {"schema": "stockinsider-close-supplement-v1", "session": args.session, "cutoff": cutoff.isoformat(),
               "startedAt": start.isoformat(), "rehearsal": args.rehearsal, "rankAuthority": False, "writerInvoked": False}
    with ThreadPoolExecutor(max_workers=2) as pool:
        pending = [pool.submit(acquire, name, url, args.session, cutoff, args.rehearsal)
                   for name, url in source_urls(args.session).items()]
        reports = [future.result() for future in pending]
    for name, result, raw in reports:
        if raw is not None:
            atomic_write(args.output / (name + ".csv"), raw)
            result["saved"] = True
    receipt["sources"] = {name: result for name, result, _ in reports}
    receipt["completedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write(args.output / "receipt.json", (json.dumps(receipt, indent=2) + "\n").encode())
    print(json.dumps({"session": args.session, "rehearsal": args.rehearsal, "received": len(reports),
                      "timelyPayloads": sum(result.get("timelySessionPayload") is True for _, result, _ in reports)}))


if __name__ == "__main__":
    main()
