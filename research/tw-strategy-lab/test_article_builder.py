"""Synthetic input fixtures only; no production roster or profitability evidence."""
import copy
import hashlib
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("article_builder", Path(__file__).with_name("article_builder.py"))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)
build_articles = module.build_articles


def candidate(symbol="2330"):
    return {"symbol": symbol, "name": "合成測試公司", "revision": "synthetic-candidate-" + symbol,
            "security_type": "common_stock", "exchange": "TWSE", "authority_ref": "synthetic-authority-" + symbol}


def snapshot(symbols=("2330", "2303")):
    return {"schema_version": "synthetic-candidate-snapshot-v1", "revision": "synthetic-snapshot",
            "as_of": "2026-09-25T08:00:00+08:00", "complete": True, "expected_count": len(symbols),
            "candidates": [candidate(symbol) for symbol in symbols]}


def research(symbols=("2330", "2303")):
    rows = [{"strategy_id": strategy, "status": "blocked" if strategy in {"S5", "S7"} else "evaluated",
             "signal_count": None if strategy in {"S5", "S7"} else 0,
             "reason_codes": ["point_in_time_events_missing"] if strategy in {"S5", "S7"} else []}
            for strategy in module.STRATEGIES]
    return {"schema_version": "synthetic-research-v1", "validation_status": "exploratory_fixed_survivor_panel",
            "dataset_hash": "a" * 64, "period": {"start": "2019-01-01", "end": "2023-12-31"},
            "strategies": [{**row, "metrics": {"net_cagr": 999999}} for row in rows],
            "by_symbol": {symbol: {"strategy_coverage": copy.deepcopy(rows)} for symbol in symbols}}


class ArticleBuilderTests(unittest.TestCase):
    def test_every_supplied_symbol_has_preview_and_never_executable_queue(self):
        result = build_articles(snapshot(), research())
        self.assertEqual(result["coverage"]["preview_ready_count"], 2)
        self.assertEqual(result["coverage"]["article_count"], result["coverage"]["queue_count"])
        self.assertTrue(result["coverage"]["complete_snapshot_accounted_for"])
        self.assertFalse(result["coverage"]["full_app_coverage_verified"])
        self.assertEqual([row["symbol"] for row in result["articles"]], ["2303", "2330"])
        for article, queued in zip(result["articles"], result["update_queue"]):
            self.assertEqual(article["status"], "preview_ready")
            self.assertEqual(queued["expected_candidate_revision"], article["candidate_revision"])
            self.assertIsNone(queued["current_candidate_revision"])
            self.assertTrue(queued["dry_run"])
            self.assertFalse(queued["publish_allowed"])
            self.assertIsNone(queued["publication_receipt"])
            self.assertIsNone(article["per_symbol_performance"])
            self.assertNotIn("999999", article["markdown"])
            self.assertIn("歷史", article["markdown"])
            self.assertIn("不能視為本股獨立報酬", article["markdown"])

    def test_missing_individual_results_block_without_borrowing_portfolio_performance(self):
        bundle = research(("2330",))
        result = build_articles(snapshot(), bundle)
        blocked = next(row for row in result["articles"] if row["symbol"] == "2303")
        self.assertEqual(blocked["status"], "blocked")
        self.assertIn("per_symbol_strategy_coverage_pending", blocked["reason_codes"])
        self.assertEqual(result["coverage"]["preview_ready_count"], 1)
        self.assertEqual(result["coverage"]["blocked_count"], 1)

    def test_missing_research_explicitly_lists_all_seven_blocked_without_evaluation_claim(self):
        result = build_articles(snapshot(), None)
        for article in result["articles"]:
            self.assertEqual(article["status"], "blocked")
            self.assertEqual([row["strategy_id"] for row in article["strategy_coverage"]], list(module.STRATEGIES))
            for row in article["strategy_coverage"]:
                self.assertEqual(row["status"], "blocked")
                self.assertIsNone(row["signal_count"])
                self.assertEqual(row["evidence_source"], "missing_or_invalid_input")
            self.assertIn("不代表已完成七項回測", article["markdown"])
        self.assertEqual(result["coverage"]["preview_ready_count"], 0)

    def test_public_observation_preserves_old_content_date_separate_from_read_clock(self):
        data = snapshot(("2330",))
        data.update(scope="bounded_public_card_observation_only", complete=False, expected_count=None,
                    source_content_as_of="2026-09-12")
        data["candidates"][0]["observed_at"] = "2026-09-25T00:00:00Z"
        article = build_articles(data)["articles"][0]
        self.assertEqual(article["status"], "blocked")
        self.assertEqual(article["public_observation"]["source_content_as_of"], "2026-09-12")
        self.assertIn("來源內容日期：2026-09-12", article["markdown"])
        self.assertIn("實際觀察時間：2026-09-25T00:00:00Z", article["markdown"])
        self.assertIn("觀察時間不是內容更新時間", article["markdown"])

    def test_missing_or_incomplete_snapshot_preserves_all_valid_unique_rows(self):
        for patch in [{"complete": False}, {"expected_count": 3}, {"revision": None},
                      {"as_of": "2026-09-25"}, {"schema_version": None}]:
            data = {**snapshot(), **patch}
            result = build_articles(data, research())
            self.assertEqual(result["coverage"]["article_count"], 2)
            self.assertEqual(result["coverage"]["blocked_count"], 2)
            self.assertFalse(result["coverage"]["complete_snapshot_accounted_for"])

    def test_missing_candidate_list_cannot_become_complete_export(self):
        data = snapshot(())
        del data["candidates"]
        result = build_articles(data, research())
        self.assertFalse(result["coverage"]["complete_snapshot_accounted_for"])
        self.assertIn("snapshot_candidates_missing", result["coverage"]["global_reason_codes"])

    def test_invalid_id_rows_are_counted_and_block_roster_without_disappearing(self):
        data = snapshot()
        data["candidates"].append({"symbol": "../escape"})
        data["expected_count"] = 3
        result = build_articles(data, research())
        self.assertEqual(result["coverage"]["invalid_row_indexes"], [2])
        self.assertEqual(result["coverage"]["input_count"], 3)
        self.assertEqual(result["coverage"]["article_count"], 2)
        self.assertEqual(result["coverage"]["blocked_count"], 2)

    def test_duplicate_symbols_are_fatal_even_for_identical_rows(self):
        for second in [candidate(), {**candidate(), "revision": "other-revision"}]:
            data = snapshot(("2330",))
            data["candidates"].append(second)
            data["expected_count"] = 2
            with self.assertRaisesRegex(ValueError, "duplicate_candidate_symbol:2330"):
                build_articles(data, research())

    def test_missing_candidate_authority_and_future_availability_block_only_affected_row(self):
        for patch in [{"revision": None}, {"authority_ref": None}, {"name": ""}, {"exchange": "US"},
                      {"security_type": "etf"}, {"available_at": "2026-09-25T00:00:01Z"}]:
            data = snapshot()
            data["candidates"][0].update(patch)
            result = build_articles(data, research())
            self.assertEqual(result["coverage"]["blocked_count"], 1)
            self.assertEqual(result["coverage"]["preview_ready_count"], 1)

    def test_research_missing_holdout_or_wrong_validation_blocks_every_article(self):
        for bundle in [None, {**research(), "validation_status": "verified"},
                       {**research(), "period": {"start": "2019-01-01", "end": "2024-01-01"}},
                       {**research(), "dataset_hash": "not-a-hash"}]:
            result = build_articles(snapshot(), bundle)
            self.assertEqual(result["coverage"]["blocked_count"], 2)
            self.assertIsNone(result["research_reference"])

    def test_missing_duplicate_running_or_invented_event_terminals_are_blocked(self):
        for alter in [lambda rows: rows.pop(), lambda rows: rows.__setitem__(0, rows[1]),
                      lambda rows: rows[0].update(status="running"),
                      lambda rows: rows[4].update(status="evaluated", signal_count=1),
                      lambda rows: rows[0].update(signal_count=True)]:
            bundle = research()
            alter(bundle["by_symbol"]["2330"]["strategy_coverage"])
            result = build_articles(snapshot(), bundle)
            row = next(row for row in result["articles"] if row["symbol"] == "2330")
            self.assertEqual(row["status"], "blocked")

    def test_source_input_not_mutated_and_output_deterministic(self):
        data, bundle = snapshot(), research()
        before = copy.deepcopy((data, bundle))
        first = build_articles(data, bundle)
        self.assertEqual(first, build_articles(data, bundle))
        self.assertEqual((data, bundle), before)

    def test_runner_period_and_exploratory_portfolio_status_are_accepted(self):
        bundle = research()
        bundle["period"] = ["2019-01-01", "2023-12-31"]
        for row in bundle["strategies"]:
            if row["status"] != "blocked":
                row["status"] = "exploratory"
        result = build_articles(snapshot(), bundle)
        self.assertEqual(result["coverage"]["preview_ready_count"], 2)
        self.assertEqual(result["research_reference"]["period"]["end"], "2023-12-31")

    def test_metadata_never_copies_report_body_and_future_cutoff_is_unavailable(self):
        evidence = {"schema_version": "broker-report-evaluation-v1", "cutoff": "2026-09-24T00:00:00Z",
                    "records": [{"event_id": "event-1", "symbol": "2330", "status": "metadata_only", "reasons": ["rights_unknown"]}],
                    "metadata_events": [{"event_id": "event-1", "symbol": "2330", "source_url": "https://example.org/report",
                                         "first_seen_at": "2026-09-23T00:00:00Z", "recorded_at": "2026-09-23T00:00:00Z",
                                         "body": "SECRET_REPORT_BODY_DO_NOT_COPY"}]}
        result = build_articles(snapshot(), research(), evidence)
        self.assertNotIn("SECRET_REPORT_BODY_DO_NOT_COPY", json.dumps(result))
        row = next(row for row in result["articles"] if row["symbol"] == "2330")
        self.assertEqual(row["report_evidence"]["sources"], ["https://example.org/report"])
        evidence["cutoff"] = "2026-09-26T00:00:00Z"
        result = build_articles(snapshot(), research(), evidence)
        self.assertEqual(result["articles"][0]["report_evidence"]["status"], "cutoff_unverified_or_future")
        self.assertNotIn("https://example.org/report", json.dumps(result))

    def test_markdown_text_is_escaped(self):
        data = snapshot(("2330",))
        data["candidates"][0]["name"] = "<script>[danger](https://example.org)"
        text = build_articles(data, research())["articles"][0]["markdown"]
        self.assertNotIn("<script>", text)
        self.assertNotIn("[danger](https://example.org)", text)

    def test_cli_writes_only_new_bounded_artifacts_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "snapshot.json"
            bundle = root / "research.json"
            source.write_text(json.dumps(snapshot()), encoding="utf-8")
            bundle.write_text(json.dumps(research()), encoding="utf-8")
            output = root / "result"
            args = ["--snapshot", str(source), "--research", str(bundle), "--output-dir", str(output)]
            result = module.main(args)
            self.assertEqual({path.name for path in output.iterdir()}, {"2303.md", "2330.md", "coverage.json", "update-queue.json"})
            for row in result["update_queue"]:
                self.assertEqual(hashlib.sha256((output / row["draft_path"]).read_bytes()).hexdigest(), row["article_hash"])
            original = {path.name: path.read_bytes() for path in output.iterdir()}
            with self.assertRaises(FileExistsError):
                module.main(args)
            self.assertEqual({path.name: path.read_bytes() for path in output.iterdir()}, original)

    def test_oversized_or_nonfinite_input_is_rejected(self):
        data = snapshot()
        data["irrelevant"] = float("nan")
        with self.assertRaises(ValueError):
            build_articles(data, research())
        data = snapshot()
        data["candidates"] = [candidate(str(index).zfill(4)) for index in range(5001)]
        with self.assertRaisesRegex(ValueError, "bound"):
            build_articles(data, research())


if __name__ == "__main__":
    unittest.main()
