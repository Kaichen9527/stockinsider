#!/usr/bin/env python3
"""Bounded, resumable official TWSE/TPEx research downloads. No database writes.

The fixed panel is a present-day research sample, not a historical stock screen.
Raw observations are downloaded now; no historic publication timestamp is invented.
Only development data through 2023-12 may be downloaded by this command.
"""
from __future__ import annotations

import argparse
import concurrent.futures
from contextlib import contextmanager
import csv
import datetime as dt
from email.utils import parsedate_to_datetime
from decimal import Decimal, InvalidOperation
import hashlib
import fcntl
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import re
import socket
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request

PANEL = {"2330": "TWSE", "1216": "TWSE", "2882": "TWSE", "5347": "TPEX",
         "2317": "TWSE", "2603": "TWSE", "6488": "TPEX", "8069": "TPEX"}
PRIORITY = ("2330", "1216", "2882", "5347")
PRICE_FIELDS = ("symbol", "exchange", "session", "open", "high", "low", "close",
                "volume_shares", "turnover_twd", "transactions", "source_sha256",
                "volume_precision", "turnover_precision")
BENCHMARK_FIELDS = ("session", "total_return_index", "source_sha256")
ACTION_FIELDS = ("symbol", "exchange", "session", "kind", "pre_close", "reference_price",
                 "price_factor", "cash_dividend", "cash_return", "share_factor", "status",
                 "reason", "cash_available_date", "share_available_date", "source_sha256", "detail_source_sha256")
FEEDS = {
    "TWSE": {"ex_right_dividend": "exRight/TWT49U", "capital_reduction": "reducation/TWTAUU",
             "par_value_change": "change/TWTB8U"},
    "TPEX": {"ex_right_dividend": "exDailyQ", "capital_reduction": "revivt",
             "par_value_change": "pvChgRslt"},
}
MAX_BYTES = 8 * 1024 * 1024
SCHEMA = "stockinsider.tw-official-research.v1"


def now_iso():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace("+00:00", "Z")


def decimal(value, *, nonnegative=True):
    if isinstance(value, bool):
        raise ValueError("boolean is not a numeric value")
    cleaned = str(value).replace(",", "").strip()
    try:
        number = Decimal(cleaned)
    except InvalidOperation as exc:
        raise ValueError(f"invalid numeric value: {cleaned!r}") from exc
    if not number.is_finite() or (nonnegative and number < 0):
        raise ValueError(f"invalid numeric value: {cleaned!r}")
    return number


def number_text(value):
    return format(value, "f")


def parse_session(value):
    text = str(value).strip()
    m = re.fullmatch(r"(\d{2,4})[年/-](\d{1,2})[月/-](\d{1,2})日?", text)
    if not m and re.fullmatch(r"\d{7}", text):
        parts = (text[:3], text[3:5], text[5:])
    elif not m and re.fullmatch(r"\d{8}", text):
        parts = (text[:4], text[4:6], text[6:])
    elif m:
        parts = m.groups()
    else:
        raise ValueError(f"invalid session: {text!r}")
    year, month, day = map(int, parts)
    if year < 1911:
        year += 1911
    return dt.date(year, month, day).isoformat()


def table(payload, *, allow_empty=False):
    if not isinstance(payload, dict):
        raise ValueError("payload must be an object")
    stat = str(payload.get("stat", ""))
    if stat.lower() != "ok":
        raise ValueError(f"official response not successful: {stat[:160]}")
    candidate = payload
    if "tables" in payload:
        tables = payload["tables"]
        if not isinstance(tables, list) or len(tables) != 1:
            raise ValueError("unexpected number of official tables")
        candidate = tables[0]
    if not isinstance(candidate, dict):
        raise ValueError("official table must be an object")
    fields, rows = candidate.get("fields"), candidate.get("data")
    if not isinstance(fields, list) or not isinstance(rows, list):
        raise ValueError("missing official fields or data")
    if len(rows) > 100000 or any(not isinstance(row, list) or len(row) != len(fields) for row in rows):
        raise ValueError("malformed or oversized official table")
    for container, count_field in ((payload, "total"), (candidate, "totalCount")):
        if count_field in container:
            count = container[count_field]
            if isinstance(count, bool) or not re.fullmatch(r"\d+", str(count)) or int(count) != len(rows):
                raise ValueError("official row count does not match complete response")
    normalized_fields = [re.sub(r"\s+", "", str(f)) for f in fields]
    if len(set(normalized_fields)) != len(normalized_fields):
        raise ValueError("duplicate official column labels")
    return normalized_fields, rows


def parse_price_payload(payload, symbol, exchange, year, month, source_sha256):
    if not isinstance(payload, dict):
        raise ValueError("price payload must be an object")
    if exchange not in ("TWSE", "TPEX") or not re.fullmatch(r"\d{4}", symbol):
        raise ValueError("unrecognized exchange or symbol")
    if str(payload.get("date", ""))[:6] != f"{year}{month:02}":
        raise ValueError("price response month does not match request")
    if exchange == "TWSE":
        if not re.search(rf"(?<!\d){re.escape(symbol)}(?!\d)", str(payload.get("title", ""))):
            raise ValueError("TWSE response stock identity does not match request")
    elif str(payload.get("code", "")).strip() != symbol:
        raise ValueError("TPEx response stock identity does not match request")
    fields, rows = table(payload)
    expected = (["日期", "成交股數", "成交金額", "開盤價", "最高價", "最低價", "收盤價", "漲跌價差", "成交筆數"]
                if exchange == "TWSE" else
                ["日期", "成交仟股", "成交仟元", "開盤", "最高", "最低", "收盤", "漲跌", "筆數"])
    if fields[:9] != expected:
        raise ValueError(f"unrecognized {exchange} price columns: {fields!r}")
    normalized, issues, seen = [], [], set()
    for row in rows:
        session = parse_session(row[0])
        if not session.startswith(f"{year:04}-{month:02}-") or session in seen:
            raise ValueError("price date outside request or duplicate session")
        seen.add(session)
        if any(str(value).strip() in ("--", "---", "-", "", "----") for value in row[3:7]):
            issues.append({"symbol": symbol, "session": session, "reason": "official_nontrading_or_missing_ohlc"})
            continue
        o, h, l, c = map(decimal, row[3:7])
        if l <= 0 or not l <= min(o, c) <= max(o, c) <= h:
            raise ValueError(f"invalid OHLC geometry at {session}")
        factor = 1000 if exchange == "TPEX" else 1
        volume, turnover, transactions = decimal(row[1]) * factor, decimal(row[2]) * factor, decimal(row[8])
        if volume != volume.to_integral_value() or transactions != transactions.to_integral_value():
            raise ValueError("non-integral volume or transaction count")
        if volume == 0:
            issues.append({"symbol": symbol, "session": session, "reason": "zero_volume_not_executable"})
        normalized.append(dict(zip(PRICE_FIELDS, [symbol, exchange, session, *map(number_text, (o, h, l, c)),
                              number_text(volume), number_text(turnover), number_text(transactions), source_sha256,
                              "reported_thousand_shares" if exchange == "TPEX" else "reported_shares",
                              "reported_thousand_TWD" if exchange == "TPEX" else "reported_TWD"])))
    return {"rows": sorted(normalized, key=lambda r: r["session"]), "issues": issues}


def parse_benchmark_payload(payload, year, month, source_sha256):
    if not isinstance(payload, dict):
        raise ValueError("benchmark payload must be an object")
    if str(payload.get("date", ""))[:6] != f"{year}{month:02}":
        raise ValueError("benchmark response month does not match request")
    fields, rows = table(payload)
    if fields != ["日期", "發行量加權股價報酬指數"]:
        raise ValueError(f"unrecognized total-return index fields: {fields!r}")
    normalized, seen = [], set()
    for row in rows:
        session, value = parse_session(row[0]), decimal(row[1])
        if not session.startswith(f"{year:04}-{month:02}-") or session in seen or value <= 0:
            raise ValueError("invalid or duplicate benchmark observation")
        seen.add(session)
        normalized.append({"session": session, "total_return_index": number_text(value), "source_sha256": source_sha256})
    if not normalized:
        raise ValueError("empty benchmark month")
    return sorted(normalized, key=lambda r: r["session"])


class DetailTable(HTMLParser):
    def __init__(self):
        super().__init__()
        self.cells, self.cell, self.active = [], [], False

    def handle_starttag(self, tag, attrs):
        if tag in ("th", "td"):
            self.active, self.cell = True, []

    def handle_endtag(self, tag):
        if tag in ("th", "td") and self.active:
            self.cells.append("".join(self.cell).strip())
            self.active = False

    def handle_data(self, data):
        if self.active:
            self.cell.append(data)


def detail_values(html):
    parser = DetailTable()
    parser.feed(html)
    if len(parser.cells) % 2:
        raise ValueError("malformed action details")
    result = {}
    for key, value in zip(parser.cells[::2], parser.cells[1::2]):
        key = re.sub(r"[\s:：]", "", key)
        if key in result:
            raise ValueError("duplicate action detail label")
        result[key] = value
    return result


def parse_action_payload(payload, exchange, kind, year, source_sha256):
    if not isinstance(payload, dict):
        raise ValueError("corporate action payload must be an object")
    if exchange == "TWSE":
        params = payload.get("params", {})
        if not isinstance(params, dict):
            raise ValueError("corporate action request parameters must be an object")
        start = payload.get("strDate", params.get("startDate"))
        end = payload.get("endDate", params.get("endDate"))
        if start != f"{year}0101" or end != f"{year}1231":
            raise ValueError("TWSE corporate action response range does not match requested year")
    elif exchange == "TPEX":
        if payload.get("date") != f"{year}0101~{year}1231":
            raise ValueError("TPEx corporate action response range does not match requested year")
    else:
        raise ValueError("unrecognized corporate action exchange")
    fields, rows = table(payload, allow_empty=True)
    if not fields and not rows:
        return []
    expected = {
        ("TWSE", "ex_right_dividend"): ["資料日期", "股票代號", "股票名稱", "除權息前收盤價", "除權息參考價"],
        ("TWSE", "capital_reduction"): ["恢復買賣日期", "股票代號", "名稱", "停止買賣前收盤價格", "恢復買賣參考價"],
        ("TWSE", "par_value_change"): ["恢復買賣日期", "股票代號", "名稱", "停止買賣前收盤價格", "恢復買賣參考價"],
        ("TPEX", "ex_right_dividend"): ["除權息日期", "代號", "名稱", "除權息前收盤價", "除權息參考價"],
        ("TPEX", "capital_reduction"): ["恢復買賣日期", "股票代號", "名稱", "最後交易日之收盤價格", "減資恢復買賣開始日參考價格"],
        ("TPEX", "par_value_change"): ["恢復買賣日期", "證券代號", "證券名稱", "最後交易日之收盤價格", "恢復買賣開始參考價"],
    }[exchange, kind]
    if fields[:5] != expected:
        raise ValueError(f"unrecognized corporate action columns: {fields[:5]!r}")
    normalized, seen = [], set()
    for raw in rows:
        session = parse_session(raw[0])
        if not session.startswith(f"{year:04}-"):
            raise ValueError("corporate action date outside requested year")
        symbol = str(raw[1]).strip()
        if symbol not in PANEL or PANEL[symbol] != exchange:
            continue
        key = (symbol, session, kind)
        if key in seen:
            raise ValueError("duplicate corporate action")
        seen.add(key)
        pre, ref = decimal(raw[3]), decimal(raw[4])
        if pre <= 0 or ref <= 0:
            raise ValueError("nonpositive corporate action reference")
        row = {field: "" for field in ACTION_FIELDS}
        row.update(symbol=symbol, exchange=exchange, session=session, kind=kind,
                   pre_close=number_text(pre), reference_price=number_text(ref),
                   price_factor=number_text(ref / pre), status="unresolved",
                   reason="missing_explicit_cash_or_share_factor", source_sha256=source_sha256)
        by_name = dict(zip(fields, raw))
        if kind == "ex_right_dividend" and exchange == "TWSE":
            # Current EPS/BVPS columns on this historical report MUST NOT be used.
            if str(by_name.get("權/息", "")).strip() == "息":
                cash = decimal(by_name["權值+息值"])
                if abs((pre - cash) - ref) > Decimal("0.011"):
                    raise ValueError("cash-only dividend does not reconcile to reference")
                row.update(cash_dividend=number_text(cash), cash_return="0", share_factor="1",
                           status="resolved", reason="cash_only_ex_dividend")
        elif kind == "ex_right_dividend" and exchange == "TPEX":
            needed = ("現金股利", "每仟股無償配股", "現金增資股數")
            if not all(k in by_name for k in needed):
                raise ValueError("missing explicit TPEx distribution fields")
            cash = decimal(by_name["現金股利"])
            free_shares = decimal(by_name["每仟股無償配股"])
            subscription = decimal(by_name["現金增資股數"])
            subscription_ratio = decimal(by_name.get("按持股比例仟股認購", 0))
            if subscription == 0 and subscription_ratio == 0:
                share_factor = 1 + free_shares / 1000
                if abs((pre - cash) / share_factor - ref) > Decimal("0.011"):
                    raise ValueError("TPEx distribution fields do not reconcile to reference")
                row.update(cash_dividend=number_text(cash), cash_return="0",
                           share_factor=number_text(share_factor), status="resolved",
                           reason="explicit_cash_and_free_share_fields")
                if share_factor != 1:
                    row.update(status="unresolved", reason="share_distribution_delivery_date_missing")
            else:
                row["reason"] = "rights_subscription_cashflow_unmodeled"
        elif exchange == "TPEX" and kind in ("capital_reduction", "par_value_change"):
            detail = detail_values(str(by_name.get("詳細資料", "")))
            detail_identity = detail.get("股票代號/股票名稱") or detail.get("證券代號/證券名稱")
            if detail_identity and not re.match(rf"^\s*{re.escape(symbol)}(?:\s|/|$)", detail_identity):
                raise ValueError("TPEx corporate action detail stock identity mismatch")
            if detail.get("恢復買賣日期") and parse_session(detail["恢復買賣日期"]) != session:
                raise ValueError("TPEx corporate action detail effective date mismatch")
            ratio_raw, cash_raw = detail.get("每壹仟股換發新股票"), detail.get("每股退還股款")
            subscription_raw = detail.get("現金增資總股數", "NA").strip()
            subscription = Decimal(0) if subscription_raw in ("NA", "N/A", "--", "") else decimal(subscription_raw)
            if ratio_raw and cash_raw and subscription == 0:
                ratio_match = re.fullmatch(r"\s*([\d,.]+)\s*股\s*", ratio_raw)
                cash_match = re.fullmatch(r"\s*([\d,.]+)\s*元/股\s*", cash_raw)
                if ratio_match and cash_match:
                    ratio, cash = decimal(ratio_match[1]) / 1000, decimal(cash_match[1])
                    if ratio > 0:
                        if abs((pre - cash) / ratio - ref) > Decimal("0.011"):
                            raise ValueError("TPEx capital action entitlements do not reconcile to reference")
                        row.update(cash_dividend="0", cash_return=number_text(cash), share_factor=number_text(ratio),
                                   share_available_date=session,
                                   status="resolved", reason="explicit_exchange_detail_fields")
            elif subscription > 0:
                row["reason"] = "rights_subscription_cashflow_unmodeled"
        normalized.append(row)
    return normalized


def apply_twse_exright_detail(action, payload, source_sha256):
    """Keep explicit entitlements, but block stock dividends without delivery dates."""
    fields, rows = table(payload)
    if len(rows) != 1 or fields[:2] != ["股票代號", "股票名稱"]:
        raise ValueError("unrecognized TWSE corporate action detail")
    values = dict(zip(fields, rows[0]))
    if str(values["股票代號"]).strip() != action["symbol"]:
        raise ValueError("corporate action detail stock identity mismatch")
    def with_unit(name, unit):
        raw = str(values[name]).strip()
        match = re.fullmatch(r"([\d,.]+)\s*" + unit, raw)
        if not match:
            raise ValueError(f"unexpected unit in corporate action detail: {name}")
        return decimal(match[1])
    cash = with_unit("(每股配發現金股利)除息", r"元[／/]股")
    free = with_unit("A.按普通股股東持股比例每千股無償配股", "股")
    subscription = with_unit("C.(有償)現金增資", "股")
    subscription_ratio = with_unit("按股東持股比例每千股認購", "股")
    result = {**action, "detail_source_sha256": source_sha256}
    if subscription > 0 or subscription_ratio > 0:
        result.update(status="unresolved", reason="rights_subscription_cashflow_unmodeled")
        return result
    ratio = 1 + free / 1000
    if abs((decimal(action["pre_close"]) - cash) / ratio - decimal(action["reference_price"])) > Decimal("0.011"):
        raise ValueError("TWSE detail entitlements do not reconcile with historical reference")
    result.update(cash_dividend=number_text(cash), cash_return="0", share_factor=number_text(ratio),
                  status="resolved", reason="explicit_twse_detail_fields")
    if ratio != 1:
        result.update(status="unresolved", reason="share_distribution_delivery_date_missing")
    return result


def monthly_specs(start_year=2018, end_year=2023):
    if not 2018 <= start_year <= end_year <= 2023:
        raise ValueError("only the frozen 2018–2023 development data are allowed")
    specs = []
    for year in range(start_year, end_year + 1):
        for exchange, feeds in FEEDS.items():
            for kind, endpoint in feeds.items():
                query = {"startDate": f"{year}0101", "endDate": f"{year}1231", "response": "json"}
                base = f"https://www.twse.com.tw/rwd/zh/{endpoint}"
                if exchange == "TPEX":
                    query.update(startDate=f"{year}/01/01", endDate=f"{year}/12/31")
                    base = f"https://www.tpex.org.tw/www/zh-tw/bulletin/{endpoint}"
                specs.append({"type": "action", "exchange": exchange, "kind": kind, "year": year,
                              "phase": 0, "url": base + "?" + urllib.parse.urlencode(query)})
    for priority in (True, False):
        for year in range(start_year, end_year + 1):
            for month in range(1, 13):
                if priority:
                    specs.append({"type": "benchmark", "year": year, "month": month, "phase": 1,
                                  "url": f"https://www.twse.com.tw/rwd/zh/TAIEX/MFI94U?response=json&date={year}{month:02}01"})
                for symbol, exchange in PANEL.items():
                    if (symbol in PRIORITY) != priority:
                        continue
                    url = f"https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date={year}{month:02}01&stockNo={symbol}"
                    if exchange == "TPEX":
                        url = ("https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?" +
                               urllib.parse.urlencode({"code": symbol, "date": f"{year}/{month:02}/01", "response": "json"}))
                    specs.append({"type": "price", "symbol": symbol, "exchange": exchange, "year": year,
                                  "month": month, "phase": 1 if priority else 2, "url": url})
    return specs


def atomic_write(path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + f".{threading.get_ident()}.tmp")
    temporary.write_bytes(data)
    temporary.replace(path)


def write_json(path, value):
    atomic_write(path, (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode())


def write_csv(path, fields, rows):
    buffer = io.StringIO(newline="")
    writer = csv.DictWriter(buffer, fieldnames=fields, lineterminator="\n", extrasaction="raise")
    writer.writeheader()
    writer.writerows(rows)
    atomic_write(path, buffer.getvalue().encode())


class Downloader:
    def __init__(self, root, timeout=15, retries=2, min_interval=1):
        self.root, self.timeout, self.retries = Path(root), timeout, retries
        self.min_interval, self.lock, self.last_started = min_interval, threading.Lock(), 0.0
        self.root.mkdir(parents=True, exist_ok=True)

    def paths(self, url):
        key = hashlib.sha256(url.encode()).hexdigest()
        return self.root / (key + ".json"), self.root / (key + ".meta.json")

    def cached(self, spec):
        raw_path, meta_path = self.paths(spec["url"])
        if not raw_path.exists() or not meta_path.exists():
            return None
        try:
            if raw_path.stat().st_size > MAX_BYTES or meta_path.stat().st_size > 16384:
                return None
            meta, raw = json.loads(meta_path.read_bytes()), raw_path.read_bytes()
            if not isinstance(meta, dict):
                return None
            if meta["url"] != spec["url"] or meta["bytes"] != len(raw) or meta["http_status"] != 200 or hashlib.sha256(raw).hexdigest() != meta["sha256"]:
                return None
            def timestamp(value):
                if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d\d-\d\dT.+(?:Z|[+-]\d\d:\d\d)", value):
                    raise ValueError("cache timestamp must include a timezone")
                return dt.datetime.fromisoformat(value.replace("Z", "+00:00"))
            started, retrieved = timestamp(meta["request_started_at"]), timestamp(meta["retrieved_at"])
            if started > retrieved or retrieved > dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=5):
                return None
            payload = json.loads(raw)
            validate_payload(spec, payload, meta["sha256"])
            return {**meta, "cached": True, "spec": spec, "path": str(raw_path)}
        except (ValueError, KeyError, TypeError, OSError):
            return None

    def fetch(self, spec):
        cached = self.cached(spec)
        if cached:
            return cached
        errors = []
        for attempt in range(self.retries + 1):
            with self.lock:
                remaining = self.min_interval - (time.monotonic() - self.last_started)
                if remaining > 0:
                    time.sleep(remaining)
                self.last_started = time.monotonic()
            started, retry_delay = now_iso(), min(2 ** attempt, 8)
            try:
                request = urllib.request.Request(spec["url"], headers={
                    "User-Agent": "StockInsiderOfficialResearch/1.0 (bounded public historical-data retrieval)",
                    "Accept": "application/json"})
                with urllib.request.urlopen(request, timeout=self.timeout) as response:
                    host = urllib.parse.urlsplit(response.url).hostname
                    if host not in ("www.twse.com.tw", "www.tpex.org.tw"):
                        raise ValueError("official request redirected outside expected hosts")
                    raw = response.read(MAX_BYTES + 1)
                    if len(raw) > MAX_BYTES:
                        raise ValueError("official response exceeds 8 MiB bound")
                    payload = json.loads(raw)
                    digest = hashlib.sha256(raw).hexdigest()
                    validate_payload(spec, payload, digest)
                    meta = {"url": spec["url"], "sha256": digest, "bytes": len(raw), "http_status": response.status,
                            "retrieved_at": now_iso(), "request_started_at": started,
                            "content_type": response.headers.get("Content-Type"), "attempts": attempt + 1,
                            "etag": response.headers.get("ETag"), "last_modified": response.headers.get("Last-Modified")}
                raw_path, meta_path = self.paths(spec["url"])
                atomic_write(raw_path, raw)
                write_json(meta_path, meta)
                return {**meta, "cached": False, "spec": spec, "path": str(raw_path)}
            except urllib.error.HTTPError as exc:
                errors.append(f"HTTP {exc.code}")
                if exc.code not in (408, 429, 500, 502, 503, 504):
                    break
                if exc.code == 429:
                    retry_after = exc.headers.get("Retry-After", "")
                    try:
                        requested_delay = int(retry_after)
                    except ValueError:
                        try:
                            requested_delay = max(0, (parsedate_to_datetime(retry_after) - dt.datetime.now(dt.timezone.utc)).total_seconds())
                        except (ValueError, TypeError):
                            requested_delay = 30
                    if requested_delay > 300:
                        errors.append("Retry-After exceeds retry time budget; deferred to a later run")
                        break
                    if requested_delay < 0:
                        retry_delay = 30
                    else:
                        retry_delay = max(retry_delay, requested_delay)
            except (TimeoutError, socket.timeout, urllib.error.URLError, OSError) as exc:
                errors.append(type(exc).__name__ + ": " + str(exc)[:200])
            except (ValueError, KeyError, TypeError) as exc:
                errors.append("invalid_payload: " + str(exc)[:200])
                break
            if attempt < self.retries:
                time.sleep(retry_delay)
        return {"url": spec["url"], "spec": spec, "error": errors, "failed_at": now_iso()}


def validate_payload(spec, payload, digest):
    if spec["type"] == "action_detail":
        return apply_twse_exright_detail(spec["action"], payload, digest)
    if spec["type"] == "price":
        return parse_price_payload(payload, spec["symbol"], spec["exchange"], spec["year"], spec["month"], digest)
    if spec["type"] == "benchmark":
        return parse_benchmark_payload(payload, spec["year"], spec["month"], digest)
    return parse_action_payload(payload, spec["exchange"], spec["kind"], spec["year"], digest)


def detail_spec(action):
    query = urllib.parse.urlencode({"STK_NO": action["symbol"], "T1": action["session"].replace("-", ""), "response": "json"})
    return {"type": "action_detail", "action": action, "year": int(action["session"][:4]), "symbol": action["symbol"],
            "url": "https://www.twse.com.tw/rwd/zh/exRight/TWT49UDetail?" + query}


def normalize_cache(specs, downloader, output, *, download_complete=False):
    output = Path(output)
    prices, benchmark, actions, observations, issues, unavailable = [], [], [], [], [], []
    for spec in specs:
        record = downloader.cached(spec)
        if not record:
            unavailable.append(spec)
            continue
        parsed = validate_payload(spec, json.loads(Path(record["path"]).read_bytes()), record["sha256"])
        observations.append({k: record[k] for k in ("url", "sha256", "bytes", "retrieved_at", "http_status")})
        if spec["type"] == "price":
            prices.extend(parsed["rows"])
            issues.extend(parsed["issues"])
        elif spec["type"] == "benchmark":
            benchmark.extend(parsed)
        else:
            actions.extend(parsed)
    prices.sort(key=lambda row: (row["symbol"], row["session"]))
    benchmark.sort(key=lambda row: row["session"])
    actions.sort(key=lambda row: (row["symbol"], row["session"], row["kind"]))
    enriched = []
    for action in actions:
        if action["exchange"] == "TWSE" and action["kind"] == "ex_right_dividend" and action["status"] != "resolved":
            spec = detail_spec(action)
            record = downloader.cached(spec)
            if record:
                action = apply_twse_exright_detail(action, json.loads(Path(record["path"]).read_bytes()), record["sha256"])
                observations.append({k: record[k] for k in ("url", "sha256", "bytes", "retrieved_at", "http_status")})
        enriched.append(action)
    actions = enriched
    # Multiple event feeds on the same effective day require explicit combined modeling.
    counts = {}
    for action in actions:
        key = (action["symbol"], action["session"])
        counts[key] = counts.get(key, 0) + 1
    for action in actions:
        if counts[(action["symbol"], action["session"])] > 1:
            action.update(status="unresolved", reason="same_day_multiple_events_require_combined_terms")
    reference_sessions = {row["session"] for row in benchmark}
    coverage, blocked = {}, {}
    for symbol, exchange in PANEL.items():
        sessions = {row["session"] for row in prices if row["symbol"] == symbol}
        missing = sorted(reference_sessions - sessions)
        unexpected = sorted(sessions - reference_sessions)
        coverage[symbol] = {"exchange": exchange, "rows": len(sessions), "first_session": min(sessions) if sessions else None,
                            "last_session": max(sessions) if sessions else None, "missing_benchmark_sessions": missing,
                            "sessions_without_benchmark": unexpected}
        for event in actions:
            if event["symbol"] == symbol and event["status"] != "resolved":
                blocked.setdefault(f"{symbol}/{event['session'][:4]}", []).append(event["reason"])
    for spec in unavailable:
        symbols = [spec["symbol"]] if spec["type"] == "price" else [s for s, e in PANEL.items() if spec["type"] == "benchmark" or e == spec["exchange"]]
        for symbol in symbols:
            blocked.setdefault(f"{symbol}/{spec['year']}", []).append(f"missing_{spec['type']}_source")
    for symbol, item in coverage.items():
        for session in item["missing_benchmark_sessions"]:
            blocked.setdefault(f"{symbol}/{session[:4]}", []).append("price_gap_needs_suspension_or_listing_evidence")
    write_csv(output / "prices.csv", PRICE_FIELDS, prices)
    write_csv(output / "benchmark.csv", BENCHMARK_FIELDS, benchmark)
    write_csv(output / "corporate_actions.csv", ACTION_FIELDS, actions)
    outputs = {name: {"sha256": hashlib.sha256((output / name).read_bytes()).hexdigest(), "bytes": (output / name).stat().st_size}
               for name in ("prices.csv", "benchmark.csv", "corporate_actions.csv")}
    manifest = {"schema": SCHEMA, "generated_at": now_iso(), "download_complete": download_complete and not unavailable,
                "research_scope": "fixed surviving panel; not historical screened-universe performance",
                "requested_session_range": [f"{min(s['year'] for s in specs)}-01-01", f"{max(s['year'] for s in specs)}-12-31"],
                "development_sessions": "2019-01-01/2023-12-31", "warmup_sessions": "2018-01-01/2018-12-31",
                "holdout_accessed": False, "holdout_sessions": "2024-01-01/2026-12-31",
                "known_time": "retrospectively retrieved official data; actual retrieved_at retained; historical publication timing and revisions unverified",
                "knowledge_mode": "official_effective_date_reconstruction",
                "units": {"prices": "TWD per unadjusted share", "volume": "shares", "turnover": "TWD", "share_factor": "new shares per old share", "cash": "TWD per old share"},
                "dividend_accounting": "cash entitlement on ex-date; payment date absent; cannot fund purchases before known payment",
                "benchmark": "TWSE TAIEX total return index; not executable security and has no fees",
                "corporate_actions": "price_factor=official reference/pre-close for signal continuity; never a substitute for explicit cash/share entitlements",
                "licensing": "official public historical research retrieval; raw API redistribution rights not assumed; source attribution required",
                "network_limits": {"concurrency": 2, "minimum_request_spacing_seconds": downloader.min_interval, "timeout_seconds": downloader.timeout, "retries": downloader.retries, "max_response_bytes": MAX_BYTES},
                "expected_requests": len(specs), "available_requests": len(specs) - len(unavailable),
                "source_documents": len(observations), "unavailable_sources": unavailable,
                "coverage": coverage, "benchmark_rows": len(benchmark), "action_rows": len(actions),
                "blocked_symbol_years": {k: sorted(set(v)) for k, v in sorted(blocked.items())},
                "row_issues": issues, "outputs": outputs, "sources": observations}
    write_json(output / "manifest.json", manifest)
    return manifest


@contextmanager
def download_lock(cache):
    """One writer per shared cache; stale lock files do not block a later run."""
    path = Path(cache) / ".download.lock"
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a+") as handle:
        try:
            fcntl.flock(handle.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as exc:
            raise RuntimeError(f"A downloader already owns {path}; no duplicate requests were started") from exc
        handle.seek(0)
        handle.truncate()
        handle.write(json.dumps({"pid": os.getpid(), "started_at": now_iso()}))
        handle.flush()
        try:
            yield
        finally:
            fcntl.flock(handle.fileno(), fcntl.LOCK_UN)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path(tempfile.gettempdir()) / "stockinsider-official-development",
                        help="external working directory for raw cache and progress (default: system temporary directory)")
    parser.add_argument("--cache", type=Path, help="raw cache directory (keep outside version control)")
    parser.add_argument("--output", type=Path, help="normalized CSV and manifest directory")
    parser.add_argument("--normalize-only", action="store_true")
    parser.add_argument("--start-year", type=int, default=2018)
    parser.add_argument("--end-year", type=int, default=2023)
    parser.add_argument("--max-requests", type=int, help="maximum base requests for a probe; action details may add bounded requests")
    args = parser.parse_args()
    if args.max_requests is not None and args.max_requests < 1:
        parser.error("--max-requests must be positive")
    specs = monthly_specs(args.start_year, args.end_year)
    downloader = Downloader(args.cache or args.root / "cache")
    output = args.output or args.root / "output"
    with download_lock(downloader.root):
        execute_download(args, specs, downloader, output)


def execute_download(args, specs, downloader, output):
    if args.normalize_only:
        manifest = normalize_cache(specs, downloader, output, download_complete=True)
        print(json.dumps({"available": manifest["available_requests"], "expected": len(specs), "complete": manifest["download_complete"]}), flush=True)
        return
    run_specs = specs if args.max_requests is None else specs[:args.max_requests]
    records = []
    print(json.dumps({"event": "start", "at": now_iso(), "requests": len(run_specs), "scope": "2018–2023 only", "root": str(args.root)}), flush=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        for phase in (0, 1, 2):
            phase_specs = [spec for spec in run_specs if spec["phase"] == phase]
            futures = {pool.submit(downloader.fetch, spec): spec for spec in phase_specs}
            for future in concurrent.futures.as_completed(futures):
                record = future.result()
                records.append(record)
                spec = record["spec"]
                print(json.dumps({"event": "request", "done": len(records), "total": len(run_specs), "type": spec["type"],
                                  "symbol": spec.get("symbol"), "year": spec["year"], "month": spec.get("month"),
                                  "cached": record.get("cached", False), "ok": "error" not in record, "error": record.get("error")}), flush=True)
                if len(records) % 12 == 0:
                    write_json(args.root / "download-progress.json", records)
                    normalize_cache(specs, downloader, output)
            normalize_cache(specs, downloader, output)
            if phase == 0:
                with (output / "corporate_actions.csv").open(newline="") as stream:
                    pending_details = [detail_spec(row) for row in csv.DictReader(stream)
                                       if row["exchange"] == "TWSE" and row["kind"] == "ex_right_dividend"
                                       and row["status"] != "resolved"]
                if len(pending_details) > 500:
                    raise ValueError("corporate action detail requests exceed fixed-panel bound")
                for record in pool.map(downloader.fetch, pending_details):
                    records.append(record)
                    print(json.dumps({"event": "action_detail", "symbol": record["spec"]["symbol"],
                                      "session": record["spec"]["action"]["session"], "ok": "error" not in record,
                                      "error": record.get("error"), "cached": record.get("cached", False)}), flush=True)
                write_json(args.root / "download-progress.json", records)
                normalize_cache(specs, downloader, output)
    write_json(args.root / "download-progress.json", records)
    manifest = normalize_cache(specs, downloader, output, download_complete=True)
    print(json.dumps({"event": "finish", "at": now_iso(), "available_requests": manifest["available_requests"],
                      "expected_requests": len(specs), "complete": manifest["download_complete"],
                      "blocked_symbol_years": manifest["blocked_symbol_years"]}), flush=True)


if __name__ == "__main__":
    main()
