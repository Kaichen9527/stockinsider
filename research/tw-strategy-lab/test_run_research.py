"""Runner contract tests: synthetic in-memory data only, never official performance."""
import json
from pathlib import Path
import tempfile
import unittest
from unittest import mock

import run_research as runner


def synthetic_dataset(include_bars=True):
    sessions = ["2018-12-31", "2019-01-02", "2019-01-03"]
    bars = {symbol: [{"date": session, "open": 100., "high": 101., "low": 99.,
                      "close": 100., "volume": 1000., "turnover_twd": 100000.} for session in sessions]
            for symbol in runner.PANEL} if include_bars else {}
    exclusions = {} if include_bars else {symbol: ["synthetic_missing_authority"] for symbol in runner.PANEL}
    manifest = {"available_requests": 0, "expected_requests": 0, "synthetic_fixture": True}
    return manifest, "synthetic-dataset-hash", bars, {}, {session: 100. for session in sessions}, exclusions


def synthetic_simulation(*_args, **_kwargs):
    return {"status": "exploratory", "metrics": {"net_cagr": 0., "maximum_drawdown": 0., "completed_trades": 0},
            "curve": [{"date": session, "equity": 10000000.}
                      for session in ("2018-12-31", "2019-01-02", "2019-01-03")],
            "synthetic_fixture": True}


class ResearchRunnerTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="tw-lab-runner-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "fixture-code"
        self.root.mkdir()
        self.output = Path(self.temporary.name) / "result"
        original = runner.ROOT
        self.registry = json.loads((original / "preregistration.json").read_bytes())
        # Copies exist only for code-identity reads, not module execution.
        for name in ("engine.py", "strategies.py", "run_research.py", "official_data.py"):
            (self.root / name).write_bytes((original / name).read_bytes())
        self.freeze_fixture_registry()
        root_patch = mock.patch.object(runner, "ROOT", self.root)
        root_patch.start()
        self.addCleanup(root_patch.stop)

    def freeze_fixture_registry(self):
        raw = json.dumps(self.registry, sort_keys=True).encode()
        (self.root / "preregistration.json").write_bytes(raw)
        (self.root / "preregistration.sha256").write_text(runner.digest(raw))

    def assert_complete_candidate_coverage(self, result):
        self.assertEqual(set(result["by_symbol"]), set(runner.PANEL))
        for item in result["by_symbol"].values():
            coverage = item["strategy_coverage"]
            self.assertEqual(len(coverage), 7)
            self.assertEqual({row["strategy_id"] for row in coverage}, set(runner.STRATEGY_IDS))

    def test_registry_hash_mismatch_stops_before_dataset_or_simulation(self):
        (self.root / "preregistration.sha256").write_text("0" * 64)
        with mock.patch.object(runner, "load_dataset") as load, mock.patch.object(runner, "simulate") as simulate:
            with self.assertRaisesRegex(ValueError, "preregistration_changed_after_freeze"):
                runner.run("synthetic-data", self.output)
            load.assert_not_called()
            simulate.assert_not_called()
        self.assertFalse(self.output.exists())

    def test_matching_hash_cannot_hide_execution_assumption_mismatch(self):
        self.registry["assumptions"]["commission"] = 0
        self.freeze_fixture_registry()
        with mock.patch.object(runner, "load_dataset", return_value=synthetic_dataset()), \
                mock.patch.object(runner, "generate_signals") as generate, \
                mock.patch.object(runner, "simulate") as simulate:
            with self.assertRaisesRegex(ValueError, "registry_execution_assumptions_mismatch"):
                runner.run("synthetic-data", self.output)
            generate.assert_not_called()
            simulate.assert_not_called()

    def test_all_seven_blocked_hypotheses_keep_ledger_and_candidate_terminals(self):
        with mock.patch.object(runner, "load_dataset", return_value=synthetic_dataset(False)), \
                mock.patch.object(runner, "generate_signals") as generate, \
                mock.patch.object(runner, "simulate") as simulate:
            result = runner.run("synthetic-data", self.output)
            generate.assert_not_called()
            simulate.assert_not_called()
        self.assert_complete_candidate_coverage(result)
        self.assertEqual(len(result["trials"]), 7)
        self.assertTrue(all(row["status"] == "blocked" for row in result["trials"]))
        self.assertEqual({row["strategy_id"] for row in result["trials"]}, set(runner.STRATEGY_IDS))
        ledger = [json.loads(line) for line in (self.output / "trial-ledger.jsonl").read_text().splitlines()]
        self.assertEqual(ledger, result["trials"])
        self.assertFalse(result["holdout_accessed"])
        self.assertFalse(result["promotion_eligible"])

    def test_signal_failure_records_three_failed_trials_and_continues_other_strategies(self):
        def generate(_bars, strategy_id, *_args, **_kwargs):
            if strategy_id == "S1":
                raise ValueError("synthetic_signal_failure")
            return []
        with mock.patch.object(runner, "load_dataset", return_value=synthetic_dataset()), \
                mock.patch.object(runner, "generate_signals", side_effect=generate) as generated, \
                mock.patch.object(runner, "simulate", side_effect=synthetic_simulation):
            result = runner.run("synthetic-data", self.output)
        self.assert_complete_candidate_coverage(result)
        self.assertEqual({call.args[1] for call in generated.call_args_list}, {"S1", "S2", "S3", "S4", "S6"})
        self.assertEqual(len(result["trials"]), 17)
        failures = [row for row in result["trials"] if row["strategy_id"] == "S1"]
        self.assertEqual({row["scenario"] for row in failures}, {"baseline", "cost_stress", "small_capacity"})
        self.assertTrue(all(row["status"] == "failed" and row["error"] == "synthetic_signal_failure" for row in failures))
        later = [row for row in result["trials"] if row["strategy_id"] in ("S2", "S3", "S4", "S6")]
        self.assertEqual(len(later), 12)
        self.assertTrue(all(row["status"] == "exploratory" for row in later))
        self.assertEqual(len((self.output / "trial-ledger.jsonl").read_text().splitlines()), 17)

    def test_benchmark_failure_does_not_erase_registered_strategy_trials(self):
        def simulate(_bars, signals, *_args, **_kwargs):
            if signals and all(row["max_hold"] == 1000000 for row in signals):
                raise ValueError("synthetic_benchmark_failure")
            return synthetic_simulation()
        with mock.patch.object(runner, "load_dataset", return_value=synthetic_dataset()), \
                mock.patch.object(runner, "generate_signals", return_value=[]), \
                mock.patch.object(runner, "simulate", side_effect=simulate):
            result = runner.run("synthetic-data", self.output)
        self.assert_complete_candidate_coverage(result)
        self.assertEqual(len(result["trials"]), 17)
        self.assertEqual(len(result["panel_benchmarks"]), 3)
        self.assertTrue(all(row["status"] == "failed" for row in result["panel_benchmarks"].values()))

    def test_existing_output_cannot_be_overwritten(self):
        self.output.mkdir()
        original = b"previous immutable synthetic run\n"
        (self.output / "results.json").write_bytes(original)
        with mock.patch.object(runner, "load_dataset") as load:
            with self.assertRaisesRegex(ValueError, "output_already_exists"):
                runner.run("synthetic-data", self.output)
            load.assert_not_called()
        self.assertEqual((self.output / "results.json").read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
