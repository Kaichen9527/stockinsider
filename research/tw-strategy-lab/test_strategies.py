"""Synthetic correctness fixtures only; these are not performance evidence."""
import copy
from datetime import date, timedelta
import json
from pathlib import Path
import subprocess
import unittest

from strategies import (STRATEGY_IDS, _window, generate_signals, next_tw_price,
                        research_event_contract, round_tw_price, strategy_coverage,
                        tw_tick, wilder_atr)


def fixture_bars(count=240, slope=0.006):
    current = date(2018, 1, 1)
    rows = []
    while len(rows) < count:
        if current.weekday() < 5:
            close = 20 + len(rows) * slope
            rows.append({"date": current.isoformat(), "open": close, "high": close + .1,
                         "low": close - .1, "close": close, "volume": 1000})
        current += timedelta(days=1)
    return rows


def breakout_fixture():
    bars = fixture_bars()
    close = next_tw_price(bars[-2]["high"])
    bars[-1].update(open=close - .05, high=close + .05, low=close - .25,
                    close=close, volume=1500)
    return bars


def production_input(bars):
    session = bars[-1]["date"]
    next_day = date.fromisoformat(session) + timedelta(days=1)
    while next_day.weekday() >= 5:
        next_day += timedelta(days=1)
    timestamp = session + "T20:00:00+08:00"
    return {"symbol": "2330", "candidateRevisionId": "synthetic-fixture-revision",
            "sourceDatasetRevision": "synthetic-fixture-only", "computedAt": timestamp,
            "availableAt": timestamp, "dataAsOf": timestamp,
            "bars": [{"session": bar["date"], **{key: bar[key] for key in ("open", "high", "low", "close", "volume")},
                      "availableAt": bar["date"] + "T20:00:00+08:00", "sourceRef": "synthetic-fixture"} for bar in bars],
            "calendar": {"version": "synthetic-calendar", "signalSession": session,
                         "completedSessions": [bar["date"] for bar in bars],
                         "knownAt": session + "T00:00:00+08:00", "signalCloseAt": session + "T13:30:00+08:00",
                         "nextSession": next_day.isoformat(), "nextOpenAt": next_day.isoformat() + "T09:00:00+08:00",
                         "nextCloseAt": next_day.isoformat() + "T13:30:00+08:00"},
            "priceBasis": {"status": "verified", "kind": "adjusted_to_signal_session", "anchorSession": session,
                           "adjustmentVersion": "synthetic-action-basis", "adjustmentEvidenceHash": "a" * 64},
            "formalEligibility": {"state": "eligible", "policyVersion": "synthetic-formal", "reasonCodes": []},
            "liquidityVerified": True}


class StrategyTests(unittest.TestCase):
    def test_registered_inventory_and_blocked_event_strategies(self):
        registry = json.loads(Path(__file__).with_name("preregistration.json").read_text())
        self.assertEqual(registry["hypothesis_ids"], list(STRATEGY_IDS))
        self.assertEqual(registry["executable_ids"], ["S1", "S2", "S3", "S4", "S6"])
        self.assertEqual(registry["parameter_variants"], [])
        for strategy in ("S5", "S7"):
            self.assertEqual(strategy_coverage(strategy)["status"], "blocked")
            self.assertEqual(generate_signals({"2330": breakout_fixture()}, strategy), [])
            contract = research_event_contract(strategy)
            self.assertFalse(contract["automatic_activation"])
            self.assertIn("first_available_at", contract["required_fields"])
        with self.assertRaisesRegex(ValueError, "unknown_strategy"):
            generate_signals({}, "made_up")

    def test_tick_boundaries_and_invalid_prices(self):
        for price, tick in [(9.99, .01), (10, .05), (50, .1), (100, .5), (500, 1), (1000, 5)]:
            self.assertEqual(tw_tick(price), tick)
            self.assertAlmostEqual(next_tw_price(price), price + tick)
        self.assertEqual(round_tw_price(49.99, "up"), 50)
        self.assertEqual(next_tw_price(49.99), 50)
        self.assertEqual(round_tw_price(499.99, "down"), 499.5)
        self.assertIsNone(round_tw_price(.001))
        for invalid in (0, -1, float("nan"), float("inf"), True):
            self.assertIsNone(tw_tick(invalid))

    def test_wilder_seed_then_recursive_smoothing(self):
        bars = [{"high": 11, "low": 9, "close": 10}] * 14 + [{"high": 14, "low": 10, "close": 13}]
        self.assertAlmostEqual(wilder_atr(bars), (2 * 13 + 4) / 14)
        self.assertIsNone(wilder_atr(bars[:13]))

    def test_s1_s2_match_existing_typescript_core_on_synthetic_fixtures(self):
        repo = Path(__file__).resolve().parents[2]
        module = (repo / "web/src/lib/tw-entry-plan.ts").as_uri()
        fixtures = [breakout_fixture()]
        low_volume = copy.deepcopy(fixtures[0])
        low_volume[-1]["volume"] = 1499
        fixtures.append(low_volume)
        no_chase = copy.deepcopy(fixtures[0])
        no_chase[-1].update(open=23, close=23, high=23.1, low=21.3, volume=3000)
        fixtures.append(no_chase)
        code = (f"import {{buildTwEntryPlans}} from {json.dumps(module)};"
                "import {readFileSync} from 'node:fs';"
                "process.stdout.write(JSON.stringify(JSON.parse(readFileSync(0,'utf8')).map(buildTwEntryPlans))); ")
        completed = subprocess.run(["node", "--experimental-strip-types", "--input-type=module", "-e", code],
                                   input=json.dumps([production_input(bars) for bars in fixtures]), text=True,
                                   capture_output=True, check=True, timeout=30)
        for bars, reference in zip(fixtures, json.loads(completed.stdout)):
            self.assertEqual(reference["missingData"], [])
            for strategy, plan in zip(("S1", "S2"), reference["plans"]):
                result = generate_signals({"2330": bars}, strategy)
                if plan["rawSignalState"] != "confirmed":
                    self.assertEqual(result, [])
                    continue
                self.assertEqual(len(result), 1)
                expected = "eligible_proxy" if plan["planState"] == "conditional" else "avoid_chase"
                self.assertEqual(result[0]["plan_state"], expected)
                for actual, key in [("buy_limit", "entryUpper"), ("entry_lower", "entryLower"),
                                    ("stop", "invalidationPrice"), ("no_chase_above", "noChaseAbove")]:
                    self.assertEqual(result[0][actual], plan[key])

    def test_strict_240_history_and_prior20_excludes_today(self):
        bars = breakout_fixture()
        self.assertEqual(generate_signals({"2330": bars[1:]}, "S1"), [])
        signal = generate_signals({"2330": bars}, "S1")[0]
        self.assertEqual(signal["features"]["prior20_volume"], 1000)
        self.assertEqual(signal["features"]["prior20_high"], max(bar["high"] for bar in bars[-21:-1]))
        older = fixture_bars(1)
        older[0]["date"] = "2017-12-29"
        older[0].update(open=1000, close=1000, high=1001, low=999)
        self.assertEqual(generate_signals({"2330": older + bars}, "S1")[-1], signal)

    def test_future_append_cannot_change_earlier_signals_or_order(self):
        bars = fixture_bars(300, .05)
        prefix = {str(7000 + index): copy.deepcopy(bars[:260]) for index in range(8)}
        full = {str(7000 + index): copy.deepcopy(bars) for index in range(8)}
        earlier = generate_signals(prefix, "S3")
        self.assertTrue(earlier)
        observed = [row for row in generate_signals(full, "S3") if row["date"] <= bars[259]["date"]]
        self.assertEqual(observed, earlier)
        self.assertEqual({row["symbol"] for row in earlier}, {"7000", "7001"})
        self.assertTrue(all(date.fromisoformat(row["date"]).weekday() == 4 for row in earlier))

    def test_panel_momentum_requires_five_members_not_sector_claim(self):
        panel = {str(7000 + index): fixture_bars(260, .05) for index in range(4)}
        self.assertEqual(generate_signals(panel, "S3"), [])
        self.assertEqual(strategy_coverage("S3")["sector_rotation_status"], "blocked_pit_sector_membership_missing")

    def test_action_adjustment_is_local_and_leaves_current_raw_price(self):
        bars = breakout_fixture()
        event = {"session": bars[-1]["date"], "price_factor": .5, "share_factor": 2,
                 "status": "verified", "known_at": bars[-1]["date"] + "T19:00:00+08:00"}
        adjusted, reconstructed = _window(bars, [event], False)
        self.assertEqual(adjusted[0]["close"], bars[0]["close"] * .5)
        self.assertEqual(adjusted[0]["volume"], bars[0]["volume"] * 2)
        self.assertEqual(adjusted[-1], bars[-1])
        self.assertFalse(reconstructed)
        future = {**event, "session": "2019-01-02"}
        self.assertEqual(_window(bars, [future], False)[0], bars)
        self.assertEqual(bars[0]["volume"], 1000)

    def test_missing_action_knowledge_needs_explicit_reconstruction(self):
        bars = breakout_fixture()
        event = {"session": bars[-1]["date"], "price_factor": .98, "share_factor": 1,
                 "status": "verified", "knowledge_mode": "official_effective_date_reconstruction"}
        with self.assertRaisesRegex(ValueError, "known_at_missing"):
            generate_signals({"2330": bars}, "S1", {"2330": [event]})
        self.assertTrue(_window(bars, [event], True)[1])
        future_known = {**event, "known_at": bars[-1]["date"] + "T21:00:00+08:00"}
        with self.assertRaisesRegex(ValueError, "not_known_at_signal"):
            _window(bars, [future_known], True)
        with self.assertRaisesRegex(ValueError, "basis_unverified"):
            _window(bars, [{**event, "share_factor": None}], True)

    def test_contraction_has_a_separate_trigger(self):
        bars = fixture_bars(240, .02)
        for index, bar in enumerate(bars[:-1]):
            spread = .6 if index < 200 else .04
            bar.update(high=bar["close"] + spread, low=bar["close"] - spread)
        close = next_tw_price(max(bar["high"] for bar in bars[-11:-1]))
        bars[-1].update(open=close, close=close, high=close + .05, low=close - .05)
        result = generate_signals({"2330": bars}, "S4")
        self.assertEqual(len(result), 1)
        self.assertLessEqual(result[0]["features"]["atr5_atr20_prior"], .60)
        self.assertEqual(generate_signals({"2330": bars}, "S1"), [])

    def test_reversal_exits_above_ma_not_below_it(self):
        bars = fixture_bars(240, .04)
        bars[-1].update(open=28, close=28, high=28.2, low=27.8)
        result = generate_signals({"2330": bars}, "S6")
        self.assertEqual(len(result), 1)
        self.assertEqual(result[0]["exit_ma_direction"], "above")
        self.assertEqual(result[0]["max_hold"], 5)

    def test_invalid_data_and_holdout_are_rejected(self):
        base = breakout_fixture()
        for change, error in [({"volume": -1}, "invalid_volume"), ({"close": float("nan")}, "invalid_ohlc"),
                              ({"low": 100}, "geometry"), ({"date": "2024-01-02"}, "holdout_access_forbidden")]:
            bars = copy.deepcopy(base)
            bars[-1].update(change)
            with self.assertRaisesRegex(ValueError, error):
                generate_signals({"2330": bars}, "S1")
        with self.assertRaisesRegex(ValueError, "unique_and_sorted"):
            generate_signals({"2330": base + [base[-1]]}, "S1")


if __name__ == "__main__":
    unittest.main()
