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
MAX_ALL_SESSION_BYTES = 3 * 1024 * 1024
MAX_ALL_SESSION_ROWS = 20_000
LIVE_SESSIONS = ("2026-11-16", "2026-11-17", "2026-11-18")
HEADERS = {
    11764: ("日期", "證券代號", "證券名稱", "收盤價", "殖利率(%)", "股利年度", "本益比", "股價淨值比", "財報年/季"),
    29082: ("編號", "公布日期", "證券代號", "證券名稱", "累計", "處置條件", "處置起迄時間", "處置措施", "處置內容", "備註"),
    11396: ("公布日期", "證券代號", "證券名稱", "處置起訖時間", "處置原因", "處置內容"),
    48664: ("資料日期", "證券代號", "證券名稱", "暫停交易", "恢復交易"),
    11856: ("資料日期", "代號", "名稱", "外資及陸資不含外資自營商買進股數", "外資及陸資不含外資自營商賣出股數", "外資及陸資不含外資自營商買賣超股數", "外資自營商買進股數", "外資自營商賣出股數", "外資自營商買賣超股數", "外資及陸資買進股數", "外資及陸資賣出股數", "外資及陸資買賣超股數", "投信買進股數", "投信賣出股數", "投信買賣超股數", "自營商自行買賣買進股數", "自營商自行買賣賣出股數", "自營商自行買賣買賣超股數", "自營商避險買進股數", "自營商避險賣出股數", "自營商避險買賣超股數", "自營商買進股數", "自營商賣出股數", "自營商買賣超股數", "三大法人買賣超股數合計"),
    11370: ("資料日期", "代號", "名稱", "收盤", "漲跌", "開盤", "最高", "最低", "均價", "成交股數", "成交金額", "成交筆數", "最後買價", "最後賣價", "發行股數", "次日參考價", "次日漲停價", "次日跌停價"),
}
SYMBOL = re.compile(r"[0-9][0-9A-Z]{3,7}")
TRANSFER = {"twse_reported_close": 11764, "twse_disposition": 29082, "tpex_disposition": 11396,
            "tpex_halt_notice": 48664, "tpex_stock_institutional_shares": 11856,
            "tpex_all_session_quote": 11370}
RETAINABLE = frozenset((11764, 11856, 11370))
DISPOSITION_REPLAY_SCOPES = {29082: "DATED_QUERY_WITH_OVERLAPS", 11396: "CURRENT_FEED_ANNOUNCED_OVERLAPS"}


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
        "tpex_stock_institutional_shares": "https://www.tpex.org.tw/web/stock/3insti/DAILY_TradE/3itrade_hedge_result.php?l=zh-tw&o=data&se=EW&t=D",
        "tpex_all_session_quote": "https://www.tpex.org.tw/web/stock/aftertrading/DAILY_CLOSE_quotes/stk_quote_result.php?l=zh-tw&o=data",
    }


def positive(value):
    try:
        number = Decimal(value.replace(",", ""))
        return number.is_finite() and number > 0
    except InvalidOperation:
        return False


def shares(value, signed=False):
    normalized = value.strip().replace(",", "")
    if not re.fullmatch(r"-?[0-9]{1,15}" if signed else r"[0-9]{1,15}", normalized):
        raise ValueError("invalid_share_or_turnover")
    return int(normalized)


def inspect_tpex_eligible_input(dataset, rows, session, fixed_header):
    symbols = set()
    usable = 0
    for row in rows:
        code = row["代號"]
        if (not re.fullmatch(r"[0-9A-Za-z]{2,12}", code) or code in symbols
                or civil(row["資料日期"]) != session):
            raise ValueError("tpex_date_or_symbol")
        symbols.add(code)
        if dataset == 11856:
            values = [shares(row[column], signed=True) for column in fixed_header[3:]]
            for start in range(0, 21, 3):
                buy, sell, net = values[start:start + 3]
                if min(buy, sell) < 0 or buy - sell != net:
                    raise ValueError("tpex_institutional_arithmetic")
            if (values[6:9] != [values[j] + values[j + 3] for j in range(3)]
                    or values[18:21] != [values[j] + values[j + 3] for j in range(12, 15)]
                    or values[21] != values[8] + values[11] + values[20]):
                raise ValueError("tpex_institutional_totals")
            usable += 1
        else:
            traded = shares(row["成交股數"])
            turnover = shares(row["成交金額"])
            usable += traded > 0 and turnover > 0
    if not usable:
        raise ValueError("tpex_no_usable_input")
    return {"dataRows": len(rows), "sessionIdentity": "EXACT_PAYLOAD_DAY", "usableRecords": usable,
            "scope": "individual_institutional_shares" if dataset == 11856 else "all_session_quote_and_turnover"}


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
        if len(rows) > MAX_ALL_SESSION_ROWS:
            raise ValueError("csv_rows_bound")
    if dataset in (11856, 11370):
        return inspect_tpex_eligible_input(dataset, rows, session, header)
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
    limit = MAX_ALL_SESSION_BYTES if dataset == 11370 else MAX_BYTES
    if not rehearsal and (started.astimezone(TAIPEI).date().isoformat() != session or
                          not time(21, 28) <= started.astimezone(TAIPEI).time() < time(21, 30)):
        result["gap"] = "outside_observation_window"
        return name, result, None
    try:
        opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
        request = Request(url, headers={"User-Agent": "StockInsider/1.0 registered staging observation", "Accept": "text/csv, application/csv"})
        with opener.open(request, timeout=8) as response:
            raw = response.read(limit + 1)
            mime = response.headers.get_content_type()
            observed = datetime.now(timezone.utc)
            result.update(observedAt=observed.isoformat(), httpStatus=response.status, contentType=mime)
        if result["httpStatus"] != 200 or mime not in ("text/csv", "application/csv") or len(raw) > limit:
            raise ValueError("transport")
        result.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        result.update(inspect_csv(dataset, raw, session))
        result["beforeCutoff"] = not rehearsal and observed < cutoff
        result["timelySessionPayload"] = result["beforeCutoff"] and result["sessionIdentity"] == "EXACT_PAYLOAD_DAY"
        if (dataset in DISPOSITION_REPLAY_SCOPES and result["beforeCutoff"]
                and url == source_urls(session)[name]
                and result["sessionIdentity"] == DISPOSITION_REPLAY_SCOPES[dataset]):
            # Keep licensed bytes for replay of an observed restriction only.
            # The report still cannot establish full venue status or absence.
            result["replayPayloadKind"] = "positive_disposition"
            return name, result, raw
        return name, result, raw if dataset in RETAINABLE and (result["timelySessionPayload"] or rehearsal) else None
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
    directory_fd = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(directory_fd)
    finally:
        os.close(directory_fd)


def retain_source_payload(output, name, result, raw, cutoff, rehearsal):
    if raw is None:
        return
    atomic_write(output / (name + ".csv"), raw)
    recorded = datetime.now(timezone.utc)
    result["saved"] = True
    result["recordedAt"] = recorded.isoformat()
    if result.get("replayPayloadKind") == "positive_disposition":
        result["positiveDispositionBytesRecordedByCutoff"] = (
            result["beforeCutoff"] is True and not rehearsal and recorded < cutoff
        )


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
    receipt = {"schema": "stockinsider-close-supplement-v2", "session": args.session, "cutoff": cutoff.isoformat(),
               "startedAt": start.isoformat(), "rehearsal": args.rehearsal, "rankAuthority": False, "writerInvoked": False}
    with ThreadPoolExecutor(max_workers=3) as pool:
        pending = [pool.submit(acquire, name, url, args.session, cutoff, args.rehearsal)
                   for name, url in source_urls(args.session).items()]
        reports = [future.result() for future in pending]
    for name, result, raw in reports:
        retain_source_payload(args.output, name, result, raw, cutoff, args.rehearsal)
    receipt["sources"] = {name: result for name, result, _ in reports}
    receipt["completedAt"] = datetime.now(timezone.utc).isoformat()
    atomic_write(args.output / "receipt.json", (json.dumps(receipt, indent=2) + "\n").encode())
    print(json.dumps({"session": args.session, "rehearsal": args.rehearsal, "received": len(reports),
                      "timelyPayloads": sum(result.get("timelySessionPayload") is True for _, result, _ in reports)}))


if __name__ == "__main__":
    main()
