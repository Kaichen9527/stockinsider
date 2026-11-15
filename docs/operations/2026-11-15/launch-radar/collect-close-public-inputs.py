#!/usr/bin/env python3
"""Capture licensed public close inputs; never contact a writer or promote a ranking."""

import argparse
import csv
from datetime import date, datetime, time, timezone
from decimal import Decimal, InvalidOperation
import hashlib
import io
import json
import os
from pathlib import Path
import re
import ssl
import stat
from time import monotonic
import types
from urllib.error import HTTPError, URLError
from urllib.request import HTTPRedirectHandler, HTTPSHandler, Request, build_opener
from concurrent.futures import ThreadPoolExecutor
from zoneinfo import ZoneInfo

TAIPEI = ZoneInfo("Asia/Taipei")
MAX_BYTES = 2_000_000
SOURCES = {
    "twse_quotes": (11549, "https://www.twse.com.tw/exchangeReport/STOCK_DAY_ALL?response=open_data", "日期", "證券代號", "收盤價"),
    "tpex_quotes": (11371, "https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&o=data&se=EW", "資料日期", "代號", "收盤"),
    "twse_issuers": (18419, "https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv", "出表日期", "公司代號", None),
    "tpex_issuers": (25036, "https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv", "出表日期", "公司代號", None),
    "tpex_market_foreign_flow": (11743, "https://www.tpex.org.tw/web/stock/3insti/3insti_SUMMARY/3itrdsum_result.php?l=zh-tw&o=data&t=D", "資料日期", "單位名稱", None),
}

# Exact adjacent root-owned source; populated by the reviewed stage manifest.
CONTROL_HELPER_SHA256 = '0684b92ce7a5e9f493bd923ce99a70f47c16a42a325c93e73b93e83dc1f2b07b'


def atomic_output(output, name, payload):
    pending = output / (name + '.pending')
    fd = os.open(pending, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC, 0o600)
    try:
        with os.fdopen(fd, 'wb', closefd=False) as stream:
            stream.write(payload); stream.flush(); os.fsync(stream.fileno())
    finally:
        os.close(fd)
    os.replace(pending, output / name)
    directory = os.open(output, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC)
    try: os.fsync(directory)
    finally: os.close(directory)


def maybe_control_samples(session, output):
    # No new request enters the original three-worker queue. A cheap guard runs
    # before importing anything extra; the helper then observes actual systemd
    # start/limits and cgroup headroom again before its bounded child is created.
    try:
        if output is None or os.geteuid() == 0: return
        started = int(Path('/proc/self/stat').read_text().rsplit(')', 1)[1].split()[19]) / os.sysconf('SC_CLK_TCK')
        if not 0 <= monotonic() - started <= 50: return
        cutoff = datetime.combine(date.fromisoformat(session), time(21, 30), tzinfo=TAIPEI)
        if (cutoff - datetime.now(timezone.utc)).total_seconds() < 35: return
        cg = Path('/proc/self/cgroup').read_text().strip()
        if not re.fullmatch(r'0::/system\.slice/[A-Za-z0-9_.@:-]+\.service', cg): return
        root = Path('/sys/fs/cgroup') / cg.removeprefix('0::').lstrip('/')
        if int((root / 'memory.max').read_text()) != 134217728 or int((root / 'pids.max').read_text()) != 12: return
        if int((root / 'memory.current').read_text()) > 134217728 - 80 * 1024**2 or int((root / 'pids.current').read_text()) > 8: return
        helper = Path(__file__).absolute().with_name('collect-close-control-samples.py')
        directory = os.open('/', os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
        try:
            for part in helper.parent.parts[1:]:
                child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
                os.close(directory); directory = child
                info = os.fstat(directory)
                if info.st_uid != 0 or (info.st_mode & 0o022 and not info.st_mode & stat.S_ISVTX): return
            fd = os.open(helper.name, os.O_RDONLY | os.O_NOFOLLOW | os.O_CLOEXEC, dir_fd=directory)
            try:
                info = os.fstat(fd)
                if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o022 or info.st_nlink != 1 or info.st_size > 65536: return
                source = os.read(fd, 65537)
                if hashlib.sha256(source).hexdigest() != CONTROL_HELPER_SHA256: return
            finally: os.close(fd)
        finally: os.close(directory)
        module = types.ModuleType('fixed_close_control_samples'); module.__file__ = str(helper)
        exec(compile(source, 'FIXED_CLOSE_CONTROL_SOURCE', 'exec'), module.__dict__)
        module.capture(session, output)
    except Exception:
        # Supplement failure never changes the five-source result or its exit.
        return


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, *args, **kwargs):
        return None


def parse_date(value):
    if not re.fullmatch(r"\d{7}", value):
        raise ValueError("invalid_date")
    return date(1911 + int(value[:3]), int(value[3:5]), int(value[5:])).isoformat()


def parse_csv(raw, day_col, key_col):
    reader = csv.reader(io.StringIO(raw.decode("utf-8-sig"), newline=""), strict=True)
    header = tuple(cell.strip() for cell in next(reader, ()))
    if len(set(header)) != len(header) or header[:2] != (day_col, key_col):
        raise ValueError("schema_mismatch")
    rows = {}
    dates = set()
    for row in reader:
        if not any(row):
            continue
        if len(row) != len(header):
            raise ValueError("row_shape_mismatch")
        row = [cell.strip() for cell in row]
        day, key = parse_date(row[0]), row[1]
        if not key or key in rows:
            raise ValueError("empty_or_duplicate_key")
        dates.add(day)
        rows[key] = dict(zip(header, row))
    if len(dates) != 1 or not rows:
        raise ValueError("mixed_or_missing_date")
    return dates.pop(), rows


def positive_close(value):
    try:
        number = Decimal(value.replace(",", ""))
        return number.is_finite() and number > 0
    except InvalidOperation:
        return False


def collect(entry, session, cutoff):
    name, (dataset, url, day_col, key_col, close_col) = entry
    result = {"datasetId": dataset, "requestedAt": datetime.now(timezone.utc).isoformat()}
    raw = None
    body = {}
    try:
        opener = build_opener(HTTPSHandler(context=ssl.create_default_context()), NoRedirect())
        request = Request(url, headers={"User-Agent": "StockInsider/1.0 public dataset verification", "Accept": "text/csv, application/csv"})
        with opener.open(request, timeout=12) as response:
            result["httpStatus"] = response.status
            result["contentType"] = response.headers.get_content_type()
            result["sourceLastModified"] = response.headers.get("Last-Modified")
            if result["contentType"] not in {"text/csv", "application/csv"}:
                raise ValueError("unexpected_content_type")
            raw = response.read(MAX_BYTES + 1)
        observed = datetime.now(timezone.utc)
        result["observedAt"] = observed.isoformat()
        if len(raw) > MAX_BYTES:
            raise ValueError("byte_limit")
        result.update(bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest())
        source_day, body = parse_csv(raw, day_col, key_col)
        result.update(sourceDate=source_day, rowCount=len(body), exactSessionDate=source_day == session)
        result["observedBeforeCutoff"] = observed <= cutoff
        result["sameTaipeiDate"] = observed.astimezone(TAIPEI).date().isoformat() == session
        result["observedAfterMarketClose"] = observed.astimezone(TAIPEI).time() >= time(13, 30)
        if close_col is not None:
            if any(close_col not in row for row in body.values()):
                raise ValueError("missing_close_column")
            result["positiveCloseCount"] = sum(positive_close(row[close_col]) for row in body.values())
        if name == "tpex_market_foreign_flow":
            columns = ("買進金額", "賣出金額", "買賣超")
            categories = ("外資及陸資合計", "外資及陸資(不含自營商)", "外資自營商")
            amounts = {}
            for category in categories:
                values = [int(body[category][key].replace(",", "")) for key in columns]
                if values[0] < 0 or values[1] < 0 or values[0] - values[1] != values[2]:
                    raise ValueError("invalid_flow_arithmetic")
                amounts[category] = values
            total, excluding, dealer = (amounts[category] for category in categories)
            if any(a != b + c for a, b, c in zip(total, excluding, dealer)):
                raise ValueError("invalid_flow_categories")
            result["foreignCombinedEqualsExcludingAndDealer"] = True
    except HTTPError as exc:
        result.update(httpStatus=exc.code, error="http")
    except (URLError, TimeoutError, OSError, ValueError, KeyError, csv.Error) as exc:
        if isinstance(exc, UnicodeError):
            reason = "encoding"
        elif type(exc) is ValueError and str(exc) in {
            "invalid_date", "schema_mismatch", "row_shape_mismatch", "empty_or_duplicate_key",
            "mixed_or_missing_date", "unexpected_content_type", "byte_limit", "missing_close_column",
            "invalid_flow_arithmetic", "invalid_flow_categories",
        }:
            reason = str(exc)
        else:
            reason = type(exc).__name__
        result["error"] = reason
    result["timelySessionPayload"] = "error" not in result and all(result.get(field) is True for field in (
        "exactSessionDate", "sameTaipeiDate", "observedBeforeCutoff", "observedAfterMarketClose",
    ))
    # Company profile payloads contain contact fields. Keep only their hashes and counts.
    retain = raw if "error" not in result and (close_col is not None or name == "tpex_market_foreign_flow") else None
    return name, result, body, retain


def capture(session, output):
    cutoff = datetime.combine(date.fromisoformat(session), time(21, 30), tzinfo=TAIPEI)
    receipt = {
        "schema": "stockinsider-close-public-input-observation-v1",
        "session": session,
        "cutoff": cutoff.isoformat(),
        "captureStartedAt": datetime.now(timezone.utc).isoformat(),
        "scope": "source-observation-only",
        "fullMarketBreadth": "NOT_COMPUTED",
        "twseMarketForeignFlow": "NO_MATCHING_OPEN_LICENSE_CAPTURED",
        "publishOrWriterInvoked": False,
    }
    with ThreadPoolExecutor(max_workers=3) as pool:
        rows = list(pool.map(lambda entry: collect(entry, session, cutoff), SOURCES.items()))
    receipt["sources"] = {name: result for name, result, _, _ in rows}
    reports = {name: body for name, result, body, _ in rows if "error" not in result}
    receipt["issuerJoinDiagnostic"] = {}
    for market, close_col in (("twse", "收盤價"), ("tpex", "收盤")):
        quote_key, issuer_key = f"{market}_quotes", f"{market}_issuers"
        if quote_key not in reports or issuer_key not in reports:
            continue
        quotes, issuers = reports[quote_key], reports[issuer_key]
        matched = quotes.keys() & issuers.keys()
        receipt["issuerJoinDiagnostic"][market] = {
            "issuerRows": len(issuers),
            "matchedInQuotes": len(matched),
            "matchedWithPositiveClose": sum(positive_close(quotes[key][close_col]) for key in matched),
            "issuerNotInQuotes": len(issuers.keys() - quotes.keys()),
            "quoteNotInIssuers": len(quotes.keys() - issuers.keys()),
            "instrumentUniverseProved": False,
            "pointInTimeRosterProved": False,
        }
    receipt["captureFinishedAt"] = datetime.now(timezone.utc).isoformat()
    if output is not None:
        output.mkdir(mode=0o700)
        for name, _, _, raw in rows:
            if raw is not None:
                atomic_output(output, name + '.csv', raw)
        atomic_output(output, 'receipt.json', (json.dumps(receipt, indent=2) + '\n').encode('utf-8'))
    return receipt


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("session", type=lambda value: date.fromisoformat(value).isoformat())
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    receipt = capture(args.session, args.output)
    print(json.dumps(receipt), flush=True)
    maybe_control_samples(args.session, args.output)
    return 2 if any("error" in result for result in receipt["sources"].values()) else 0


if __name__ == "__main__":
    raise SystemExit(main())
