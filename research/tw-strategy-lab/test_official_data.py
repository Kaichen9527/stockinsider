"""Offline evidence-normalization tests; no live API calls or account access."""
from copy import deepcopy
from decimal import Decimal
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

import official_data as data


FIXTURES = Path(__file__).parent / "tests" / "fixtures"
DIGEST = "a" * 64


def fixture(name):
    return json.loads((FIXTURES / name).read_text())


def price_payload(exchange="TWSE"):
    return fixture("twse_2330_202309.json" if exchange == "TWSE" else "tpex_6488_202309.json")


def action_payload(exchange="TWSE", *, cash="3", free="0", subscription="0", marker="息"):
    if exchange == "TWSE":
        fields = ["資料日期", "股票代號", "股票名稱", "除權息前收盤價", "除權息參考價",
                  "權值+息值", "權/息", "詳細資料", "最近一次申報每股 (單位)盈餘"]
        row = ["112年09月14日", "2330", "台積電", "541", "538", cash, marker, "2330,20230914", "999.99"]
        return {"stat": "OK", "strDate": "20230101", "endDate": "20231231", "fields": fields, "data": [row]}
    fields = ["除權息日期", "代號", "名稱", "除權息前收盤價", "除權息參考價",
              "現金股利", "每仟股無償配股", "現金增資股數", "按持股比例仟股認購"]
    row = ["112/01/05", "6488", "環球晶", "443", "436.50", cash, free, subscription, "0"]
    return {"stat": "ok", "date": "20230101~20231231",
            "tables": [{"fields": fields, "data": [row], "totalCount": 1}]}


def reduction_payload(*, ratio="700.00000000", cash="3.00000000", subscription="NA", details=True):
    pairs = [("股票代號/股票名稱:", "6488 / 環球晶"), ("恢復買賣日期:", "112/12/18"),
             ("每壹仟股換發新股票:", f"{ratio}&nbsp;股"), ("每股退還股款:", f"{cash}&nbsp;元/股"),
             ("現金增資總股數:", subscription)]
    html = "<table>" + "".join(f"<tr><th>{k}</th><td>{v}</td></tr>" for k, v in pairs) + "</table>" if details else ""
    return {"stat": "ok", "date": "20230101~20231231", "tables": [{
        "fields": ["恢復買賣日期", "股票代號", "名稱", "最後交易日之收盤價格",
                   "減資恢復買賣開始日參考價格", "詳細資料"],
        "data": [["1121218", "6488", "環球晶", "85", "117.14", html]], "totalCount": 1}]}


class PriceNormalizationTests(unittest.TestCase):
    def test_twse_known_month_preserves_shares_twd_and_source(self):
        actual = data.parse_price_payload(price_payload(), "2330", "TWSE", 2023, 9, DIGEST)
        self.assertEqual(len(actual["rows"]), 20)
        self.assertEqual(actual["issues"], [])
        row = actual["rows"][0]
        self.assertEqual((row["session"], row["open"], row["close"]), ("2023-09-01", "543.00", "548.00"))
        self.assertEqual((row["volume_shares"], row["turnover_twd"]), ("15194921", "8331995536"))
        self.assertEqual(row["source_sha256"], DIGEST)

    def test_tpex_converts_thousand_units_only_once(self):
        actual = data.parse_price_payload(price_payload("TPEX"), "6488", "TPEX", 2023, 9, DIGEST)
        row = actual["rows"][0]
        self.assertEqual((row["volume_shares"], row["turnover_twd"], row["transactions"]),
                         ("920000", "428273000", "1354"))
        self.assertEqual(row["close"], "467.00")

    def test_missing_ohlc_is_reported_without_fabricating_a_bar(self):
        payload = price_payload()
        payload["data"][0][3:7] = ["--"] * 4
        actual = data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)
        self.assertEqual(len(actual["rows"]), 19)
        self.assertEqual(actual["issues"][0]["reason"], "official_nontrading_or_missing_ohlc")

    def test_zero_volume_bar_is_flagged_non_executable(self):
        payload = price_payload()
        payload["data"][0][1] = "0"
        actual = data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)
        self.assertEqual(actual["issues"][0]["reason"], "zero_volume_not_executable")

    def test_duplicates_cross_month_invalid_numbers_and_geometry_fail_closed(self):
        changes = [lambda p: p["data"].append(deepcopy(p["data"][0])),
                   lambda p: p["data"][0].__setitem__(0, "112/10/01"),
                   lambda p: p["data"][0].__setitem__(3, "NaN"),
                   lambda p: p["data"][0].__setitem__(4, "Infinity"),
                   lambda p: p["data"][0].__setitem__(5, "600"),
                   lambda p: p["data"][0].__setitem__(1, "1.5"),
                   lambda p: p["data"][0].__setitem__(8, "-1")]
        for change in changes:
            payload = price_payload()
            change(payload)
            with self.subTest(change=changes.index(change)), self.assertRaises(ValueError):
                data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)

    def test_wrong_response_identity_is_not_relabelled(self):
        with self.assertRaises(ValueError):
            data.parse_price_payload(price_payload(), "2317", "TWSE", 2023, 9, DIGEST)
        payload = price_payload("TPEX")
        payload["code"] = "5347"
        with self.assertRaises(ValueError):
            data.parse_price_payload(payload, "6488", "TPEX", 2023, 9, DIGEST)

    def test_unknown_exchange_is_rejected(self):
        with self.assertRaises(ValueError):
            data.parse_price_payload(price_payload("TPEX"), "6488", "UNKNOWN", 2023, 9, DIGEST)

    def test_schema_drift_or_unsuccessful_reply_is_not_empty_success(self):
        for alteration in ("fields", "stat", "row_width"):
            payload = price_payload()
            if alteration == "fields":
                payload["fields"][1] = "成交仟股"
            elif alteration == "stat":
                payload["stat"] = "很抱歉，沒有符合條件的資料!"
            else:
                payload["data"][0].pop()
            with self.subTest(alteration=alteration), self.assertRaises(ValueError):
                data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)


class BenchmarkNormalizationTests(unittest.TestCase):
    def test_total_return_index_is_preserved(self):
        rows = data.parse_benchmark_payload(fixture("taiex_total_202309.json"), 2023, 9, DIGEST)
        self.assertEqual(len(rows), 20)
        self.assertEqual(rows[0], {"session": "2023-09-01", "total_return_index": "35737.71", "source_sha256": DIGEST})

    def test_price_index_cannot_impersonate_total_return_index(self):
        payload = fixture("taiex_total_202309.json")
        payload["fields"][1] = "發行量加權股價指數"
        with self.assertRaises(ValueError):
            data.parse_benchmark_payload(payload, 2023, 9, DIGEST)

    def test_empty_nonpositive_duplicate_and_wrong_month_are_rejected(self):
        for case in ("empty", "zero", "duplicate", "wrong_month"):
            payload = fixture("taiex_total_202309.json")
            if case == "empty":
                payload["data"] = []
            elif case == "zero":
                payload["data"][0][1] = "0"
            elif case == "duplicate":
                payload["data"].append(deepcopy(payload["data"][0]))
            else:
                payload["data"][0][0] = "112/10/01"
            with self.subTest(case=case), self.assertRaises(ValueError):
                data.parse_benchmark_payload(payload, 2023, 9, DIGEST)


class CorporateActionNormalizationTests(unittest.TestCase):
    def parse(self, payload, exchange="TWSE", kind="ex_right_dividend"):
        return data.parse_action_payload(payload, exchange, kind, 2023, DIGEST)

    def test_cash_only_twse_dividend_is_explicit_and_ignores_current_eps(self):
        row = self.parse(action_payload())[0]
        self.assertEqual((row["cash_dividend"], row["cash_return"], row["share_factor"], row["status"]),
                         ("3", "0", "1", "resolved"))
        self.assertNotIn("999.99", row.values())
        self.assertEqual(row["cash_available_date"], "")

    def test_twse_rights_without_detail_are_unresolved(self):
        for marker in ("權", "權息", "unknown"):
            row = self.parse(action_payload(marker=marker))[0]
            self.assertEqual(row["status"], "unresolved")
            self.assertEqual(row["share_factor"], "")
            self.assertEqual(row["cash_dividend"], "")

    def test_twse_cash_amount_must_reconcile_with_official_reference(self):
        with self.assertRaises(ValueError):
            self.parse(action_payload(cash="4"))

    def test_tpex_free_share_entitlements_use_explicit_ratio_not_reference_ratio(self):
        payload = action_payload("TPEX", cash="1.5", free="100")
        payload["tables"][0]["data"][0][3:5] = ["74", "65.91"]
        row = self.parse(payload, "TPEX")[0]
        self.assertEqual(row["status"], "unresolved")
        self.assertEqual(row["reason"], "share_distribution_delivery_date_missing")
        self.assertEqual(Decimal(row["share_factor"]), Decimal("1.1"))
        self.assertNotEqual(Decimal(row["share_factor"]), Decimal("74") / Decimal("65.91"))
        self.assertEqual(row["cash_dividend"], "1.5")

    def test_tpex_subscriptions_are_unresolved_not_free_shares(self):
        row = self.parse(action_payload("TPEX", cash="0", subscription="5000000"), "TPEX")[0]
        self.assertEqual(row["status"], "unresolved")
        self.assertEqual(row["reason"], "rights_subscription_cashflow_unmodeled")
        self.assertEqual(row["share_factor"], "")

    def test_tpex_contradictory_subscription_fields_do_not_resolve(self):
        payload = action_payload("TPEX", cash="6.5")
        payload["tables"][0]["data"][0][-1] = "40"
        try:
            rows = self.parse(payload, "TPEX")
        except ValueError:
            return
        self.assertEqual(rows[0]["status"], "unresolved")

    def test_tpex_inconsistent_cash_share_reference_does_not_resolve(self):
        payload = action_payload("TPEX", cash="100", free="100")
        try:
            rows = self.parse(payload, "TPEX")
        except ValueError:
            return
        self.assertEqual(rows[0]["status"], "unresolved")

    def test_reduction_uses_disclosed_share_exchange_and_cash_return(self):
        row = self.parse(reduction_payload(), "TPEX", "capital_reduction")[0]
        self.assertEqual(row["session"], "2023-12-18")
        self.assertEqual(Decimal(row["share_factor"]), Decimal("0.7"))
        self.assertEqual(Decimal(row["cash_return"]), Decimal("3"))
        self.assertEqual(row["cash_dividend"], "0")
        self.assertEqual(row["status"], "resolved")

    def test_reduction_missing_terms_or_subscription_is_unresolved(self):
        for payload in (reduction_payload(details=False), reduction_payload(ratio="NA"),
                        reduction_payload(ratio="0"), reduction_payload(subscription="1000000")):
            with self.subTest(payload=payload):
                row = self.parse(payload, "TPEX", "capital_reduction")[0]
                self.assertEqual(row["status"], "unresolved")

    def test_reduction_inconsistent_entitlements_do_not_resolve(self):
        payload = reduction_payload(ratio="100", cash="50")
        try:
            rows = self.parse(payload, "TPEX", "capital_reduction")
        except ValueError:
            return
        self.assertEqual(rows[0]["status"], "unresolved")

    def test_reduction_detail_identity_must_match_the_outer_event(self):
        for before, after in (("6488 / 環球晶", "5347 / 世界"), ("112/12/18", "112/12/19")):
            payload = reduction_payload()
            row = payload["tables"][0]["data"][0]
            row[-1] = row[-1].replace(before, after)
            with self.subTest(after=after):
                try:
                    rows = self.parse(payload, "TPEX", "capital_reduction")
                except ValueError:
                    continue
                self.assertEqual(rows[0]["status"], "unresolved")

    def test_twse_detail_preserves_cash_and_explicit_stock_entitlements(self):
        cash_action = self.parse(action_payload())[0]
        cash_detail = fixture("twse_2330_exright_detail_20230914.json")
        cash = data.apply_twse_exright_detail(cash_action, cash_detail, "b" * 64)
        self.assertEqual((cash["cash_dividend"], cash["share_factor"], cash["status"]), ("3", "1", "resolved"))
        self.assertEqual(cash["detail_source_sha256"], "b" * 64)
        stock_action = {**cash_action, "symbol": "2881", "session": "2023-09-04",
                        "pre_close": "64.8", "reference_price": "61.71"}
        stock_detail = fixture("twse_2881_exright_detail_20230904.json")
        stock = data.apply_twse_exright_detail(stock_action, stock_detail, "c" * 64)
        self.assertEqual((stock["cash_dividend"], stock["share_factor"]), ("0", "1.05"))
        self.assertEqual(stock["status"], "unresolved")
        self.assertEqual(stock["reason"], "share_distribution_delivery_date_missing")

    def test_twse_detail_rejects_wrong_symbol_units_or_reference(self):
        action = self.parse(action_payload())[0]
        for case in ("symbol", "unit", "entitlement"):
            payload = fixture("twse_2330_exright_detail_20230914.json")
            if case == "symbol":
                payload["data"][0][0] = "2882"
            else:
                payload["data"][0][2] = "3 千元／股" if case == "unit" else "100 元／股"
            with self.subTest(case=case), self.assertRaises(ValueError):
                data.apply_twse_exright_detail(action, payload, DIGEST)

    def test_action_duplicate_and_wrong_year_are_rejected(self):
        payload = action_payload()
        payload["data"].append(deepcopy(payload["data"][0]))
        with self.assertRaises(ValueError):
            self.parse(payload)
        payload = action_payload()
        payload["data"][0][0] = "113年09月14日"
        with self.assertRaises(ValueError):
            self.parse(payload)

    def test_annual_wrong_year_nonpanel_row_is_not_treated_as_no_panel_events(self):
        payload = action_payload()
        payload["data"][0][0] = "113年09月14日"
        payload["data"][0][1] = "9999"
        with self.assertRaises(ValueError):
            self.parse(payload)

    def test_empty_annual_response_requires_exact_range_and_schema(self):
        payload = action_payload()
        payload["data"] = []
        self.assertEqual(self.parse(payload), [])
        payload["strDate"], payload["endDate"] = "20240101", "20241231"
        with self.assertRaises(ValueError):
            self.parse(payload)
        for payload in ({"stat": "很抱歉，沒有符合條件的資料!"},
                        {"stat": "很抱歉，沒有符合條件的資料!", "strDate": "20230101", "endDate": "20231231"}):
            with self.subTest(payload=payload), self.assertRaises(ValueError):
                self.parse(payload)
        payload = action_payload("TPEX", cash="6.5")
        payload["tables"][0]["data"] = []
        payload["tables"][0]["totalCount"] = 0
        self.assertEqual(self.parse(payload, "TPEX"), [])
        payload["date"] = "20220101~20221231"
        with self.assertRaises(ValueError):
            self.parse(payload, "TPEX")

    def test_declared_row_counts_cannot_hide_truncated_annual_or_monthly_responses(self):
        payload = action_payload("TPEX", cash="6.5")
        payload["tables"][0]["totalCount"] = 1014
        with self.assertRaises(ValueError):
            self.parse(payload, "TPEX")
        payload = price_payload()
        payload["data"].pop()
        with self.assertRaises(ValueError):
            data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)
        payload = fixture("taiex_total_202309.json")
        payload["data"].pop()
        with self.assertRaises(ValueError):
            data.parse_benchmark_payload(payload, 2023, 9, DIGEST)

    def test_duplicate_detail_labels_cannot_overwrite_evidence(self):
        with self.assertRaises(ValueError):
            data.detail_values("<table><tr><th>每股退還股款:</th><td>3 元/股</td></tr>"
                               "<tr><th>每股退還股款:</th><td>0 元/股</td></tr></table>")


class AcquisitionBoundaryTests(unittest.TestCase):
    @staticmethod
    def cache_metadata(spec, raw):
        return {"url": spec["url"], "sha256": hashlib.sha256(raw).hexdigest(), "bytes": len(raw),
                "http_status": 200, "request_started_at": "2026-09-01T00:00:00Z",
                "retrieved_at": "2026-09-01T00:00:01Z"}

    def test_date_parser_accepts_official_calendar_formats_only(self):
        for source, expected in [(" 99/01/04", "2010-01-04"), ("112年09月14日", "2023-09-14"),
                                 ("1121218", "2023-12-18"), ("20230914", "2023-09-14")]:
            self.assertEqual(data.parse_session(source), expected)
        for source in ("112/02/29", "NaN", "112/13/01", "not a date"):
            with self.subTest(source=source), self.assertRaises(ValueError):
                data.parse_session(source)

    def test_holdout_years_cannot_be_requested(self):
        for start, end in [(2017, 2023), (2018, 2024), (2024, 2024), (2023, 2022)]:
            with self.subTest(start=start, end=end), self.assertRaises(ValueError):
                data.monthly_specs(start, end)
        specs = data.monthly_specs(2023, 2023)
        self.assertTrue(all(s["year"] == 2023 for s in specs))
        self.assertEqual(len(specs), 6 + 12 * (len(data.PANEL) + 1))

    def test_cache_mismatched_hash_does_not_become_valid_data(self):
        spec = {"type": "price", "symbol": "2330", "exchange": "TWSE", "year": 2023,
                "month": 9, "url": "https://www.twse.com.tw/example"}
        with tempfile.TemporaryDirectory() as folder:
            downloader = data.Downloader(folder)
            raw_path, meta_path = downloader.paths(spec["url"])
            raw = (FIXTURES / "twse_2330_202309.json").read_bytes()
            raw_path.write_bytes(raw)
            meta_path.write_text(json.dumps(self.cache_metadata(spec, raw)))
            self.assertIsNotNone(downloader.cached(spec))
            raw_path.write_bytes(raw + b" ")
            self.assertIsNone(downloader.cached(spec))

    def test_incomplete_or_invalid_cache_provenance_is_a_cache_miss(self):
        spec = {"type": "price", "symbol": "2330", "exchange": "TWSE", "year": 2023,
                "month": 9, "url": "https://www.twse.com.tw/example"}
        with tempfile.TemporaryDirectory() as folder:
            downloader = data.Downloader(folder)
            raw_path, meta_path = downloader.paths(spec["url"])
            raw = (FIXTURES / "twse_2330_202309.json").read_bytes()
            raw_path.write_bytes(raw)
            valid = self.cache_metadata(spec, raw)
            invalid = [[], None, {"url": spec["url"], "sha256": valid["sha256"]},
                       {**valid, "bytes": len(raw) - 1}, {**valid, "http_status": 503},
                       {**valid, "retrieved_at": "2026-09-01T00:00:01"},
                       {**valid, "request_started_at": "2026-09-01T00:00:02Z"},
                       {**valid, "retrieved_at": "9999-12-31T00:00:00Z"}]
            for key in ("bytes", "http_status", "request_started_at", "retrieved_at"):
                invalid.append({k: v for k, v in valid.items() if k != key})
            for metadata in invalid:
                meta_path.write_text(json.dumps(metadata))
                with self.subTest(metadata=metadata):
                    self.assertIsNone(downloader.cached(spec))

    def test_malformed_official_json_is_an_unavailable_source_not_an_uncaught_crash(self):
        spec = {"type": "price", "symbol": "2330", "exchange": "TWSE", "year": 2023,
                "month": 9, "url": "https://www.twse.com.tw/example"}
        for payload in ([], None, 1, "oops"):
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    data.parse_price_payload(payload, "2330", "TWSE", 2023, 9, DIGEST)
                with self.assertRaises(ValueError):
                    data.parse_benchmark_payload(payload, 2023, 9, DIGEST)
                with self.assertRaises(ValueError):
                    data.parse_action_payload(payload, "TWSE", "ex_right_dividend", 2023, DIGEST)
        with self.assertRaises(ValueError):
            data.table({"stat": "ok", "tables": [None]})
        with tempfile.TemporaryDirectory() as folder:
            response = MagicMock()
            response.__enter__.return_value = response
            response.url, response.status = spec["url"], 200
            response.read.return_value = b"[]"
            with patch.object(data.urllib.request, "urlopen", return_value=response):
                record = data.Downloader(folder, retries=0, min_interval=0).fetch(spec)
            self.assertIn("error", record)
            self.assertTrue(record["error"][0].startswith("invalid_payload:"))
            self.assertFalse(any(Path(folder).glob("*.meta.json")))

    def test_cache_writer_lock_rejects_overlap_and_can_be_reacquired(self):
        with tempfile.TemporaryDirectory() as folder:
            with data.download_lock(folder):
                with self.assertRaises(RuntimeError):
                    with data.download_lock(folder):
                        self.fail("overlapping cache writer acquired the lock")
            with data.download_lock(folder):
                self.assertTrue((Path(folder) / ".download.lock").exists())


if __name__ == "__main__":
    unittest.main()
