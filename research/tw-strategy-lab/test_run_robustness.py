"""Synthetic acceptance for the frozen R1-R4 implementation, not research approval."""
import copy
from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import engine
import run_robustness as r
import strategies
from test_strategies import breakout_fixture


def fixture_result(trades=()):
    return {'status': 'exploratory', 'trades': list(trades),
            'metrics': {'ending_equity': 1100., 'ending_receivables': 50.},
            'assumptions': {'initial_cash': 1000.}}


def trade(pnl, ret, symbol='fixture'):
    return {'symbol': symbol, 'net_pnl': pnl, 'net_return': ret}


def synthetic_panel():
    # Synthetic weekdays spanning warmup and 20+ active sessions, no web data.
    sessions = []
    day = date(2018, 1, 1)
    while len(sessions) < 285:
        if day.weekday() < 5:
            sessions.append(day.isoformat())
        day += timedelta(days=1)
    bars = {}
    for n, symbol in enumerate(r.STRATEGIES):
        prices = []
        for i, session in enumerate(sessions):
            close = round(20. + i * .05, 2)
            prices.append(dict(date=session, open=close, high=close + .1, low=close - .1,
                               close=close, volume=100000000, turnover_twd=1000000000))
        bars['7%03d' % n] = prices
    return bars, {}, {s: 1000 + i for i, s in enumerate(sessions)}


def synthetic_baseline(bars, actions, benchmark):
    bundle = {'trial-ledger.jsonl': []}
    for sid in r.STRATEGIES:
        signals = strategies.generate_signals(bars, sid, actions, allow_reconstructed_history=True)
        bundle[sid + '-signals.json'] = signals
        for name, assumptions in r.SCENARIOS.items():
            result = r.enrich(engine.simulate(bars, signals, sorted(benchmark), start='2019-01-01', end='2023-12-31',
                                             actions_by_symbol=actions, assumptions=assumptions), benchmark)
            filename = f'{sid}-{name}.json'
            bundle[filename] = result
            bundle['trial-ledger.jsonl'].append(dict(strategy_id=sid, scenario=name, parameter_variant=False,
                status=result['status'], metrics=result['metrics'], result_file=filename))
    return bundle


class MetricTests(unittest.TestCase):
    def test_median_even_and_odd(self):
        self.assertEqual(r.trade_diagnostics(fixture_result([trade(1, .3), trade(1, .1)]))['median_net_trade_return'], .2)
        self.assertEqual(r.trade_diagnostics(fixture_result([trade(1, .3), trade(-1, -.2), trade(2, .1)]))['median_net_trade_return'], .1)

    def test_all_zero_profit_and_no_loss_precedence_is_null(self):
        self.assertIsNone(r.trade_diagnostics(fixture_result([trade(0, 0)] * 3))['profit_factor'])

    def test_empty_trades_have_no_invented_win_rate(self):
        d = r.trade_diagnostics(fixture_result())
        self.assertIsNone(d['median_net_trade_return'])
        self.assertIsNone(d['profit_factor'])
        self.assertEqual(d['largest_winner_share_of_positive_profit'], 1)
        self.assertEqual(d['largest_symbol_share_of_positive_profit'], 1)

    def test_only_losses_profit_factor_zero(self):
        self.assertEqual(r.trade_diagnostics(fixture_result([trade(-2, -.1)]))['profit_factor'], 0)

    def test_no_loss_is_null_not_infinity(self):
        self.assertIsNone(r.trade_diagnostics(fixture_result([trade(2, .1)]))['profit_factor'])

    def test_symbol_concentration_does_not_net_losing_trades(self):
        d = r.trade_diagnostics(fixture_result([trade(8, .8, 'a'), trade(-7, -.7, 'a'), trade(2, .2, 'b')]))
        self.assertEqual(d['largest_symbol_share_of_positive_profit'], .8)
        self.assertEqual(d['largest_winner_share_of_positive_profit'], .8)
        self.assertEqual(d['profit_factor'], 10 / 7)

    def test_terminal_receivables_are_accounting_not_replay(self):
        d = r.trade_diagnostics(fixture_result())
        self.assertAlmostEqual(d['terminal_return_ex_unavailable_receivables'], .05)
        value = fixture_result(); value['assumptions']['initial_cash'] = 0
        self.assertIsNone(r.trade_diagnostics(value)['terminal_return_ex_unavailable_receivables'])

    def test_nonfinite_and_bool_trade_numbers_rejected(self):
        for value in (True, float('nan'), float('inf'), '1'):
            for key in ('net_pnl', 'net_return'):
                with self.subTest(value=value, key=key), self.assertRaises(ValueError):
                    t = trade(1, .1); t[key] = value
                    r.trade_diagnostics(fixture_result([t]))

    def test_null_gates_fail_and_boundary_comparisons_not_rounded(self):
        proposal = {'work_items': [None, {'finite_checks': [
            {'metric': 'median_net_trade_return_baseline', 'operator': '>', 'threshold': 0},
            {'metric': 'largest_winner_share_of_positive_profit_baseline', 'operator': '<=', 'threshold': .25}]}]}
        bundle = {f'S3-{s}.json': fixture_result([trade(1, .001) for _ in range(4)]) for s in ('baseline', 'cost_stress')}
        result = r.r2_diagnostics(bundle, proposal)
        self.assertTrue(all(x['passed'] for x in result['checks']))
        bundle['S3-baseline.json']['trades'][0]['net_pnl'] += 1e-12
        self.assertFalse(r.r2_diagnostics(bundle, proposal)['checks'][1]['passed'])
        bundle['S3-baseline.json']['trades'] = []
        self.assertFalse(r.r2_diagnostics(bundle, proposal)['checks'][0]['passed'])
        self.assertFalse(result['promotion_allowed'])

    def test_retained_inspection_never_simulates(self):
        with patch.object(r, 'simulate', side_effect=AssertionError('must not simulate')), patch.object(r, 'fetch_contract_review', side_effect=AssertionError('no request')):
            result = r.inspect_retained()
        self.assertEqual(result['new_simulations'], 0)
        self.assertFalse(result['R1_replay_verified'])
        self.assertEqual(len(result['R2']['checks']), 8)
        self.assertFalse(result['execution_authorized'])


class VariantTests(unittest.TestCase):
    def test_inventory_is_closed_15_plus_6_plus_10(self):
        paths = r.registered_paths()
        self.assertEqual(len(paths), 31)
        self.assertEqual(len({p['id'] for p in paths}), 31)
        self.assertEqual([sum(p['work'] == group for p in paths) for group in ('R1', 'R3', 'R4')], [15, 6, 10])
        self.assertEqual({p['scenario'] for p in paths if p['work'] == 'R4'}, {'baseline'})
        self.assertEqual({p['strategy_id'] for p in paths if p['work'] == 'R3'}, {'S4v2-070', 'S4v2-075'})

    def test_variant_thresholds_are_actual_and_inclusive(self):
        bars = breakout_fixture()
        # Hold other conditions fixed, isolate ATR threshold at .60/.70/.75.
        def run(compression, variant=None):
            def atr(_, period=14):
                return compression if period == 5 else 1.
            with patch.object(strategies, 'wilder_atr', side_effect=atr):
                return strategies.generate_signals({'2330': bars}, 'S4', s4_variant=variant)
        self.assertTrue(run(.60))
        self.assertFalse(run(.60000000001))
        self.assertTrue(run(.70, 'S4v2-070'))
        self.assertFalse(run(.70000000001, 'S4v2-070'))
        self.assertTrue(run(.75, 'S4v2-075'))
        self.assertFalse(run(.75000000001, 'S4v2-075'))
        row = run(.69, 'S4v2-070')[0]
        self.assertEqual(row['parent_strategy_id'], 'S4')
        self.assertEqual(row['validation_status'], 'result_informed_development_hypothesis')
        default = run(.59)[0]
        variant = run(.59, 'S4v2-070')[0]
        for k in ('parent_strategy_id', 'atr5_over_atr20_max', 'validation_status'):
            del variant[k]
        variant['strategy_id'] = 'S4'
        self.assertEqual(default, variant)

    def test_other_variants_and_cross_strategy_usage_are_rejected(self):
        for variant in (True, .7, 'S4v2-080', 'baseline'):
            with self.subTest(variant=variant), self.assertRaises(ValueError):
                strategies.generate_signals({}, 'S4', s4_variant=variant)
        with self.assertRaises(ValueError):
            strategies.generate_signals({}, 'S1', s4_variant='S4v2-070')

    def test_holdout_still_rejected_in_both_new_variants(self):
        bars = breakout_fixture(); bars[-1]['date'] = '2024-01-02'
        for variant in r.VARIANTS:
            with self.subTest(variant=variant), self.assertRaisesRegex(ValueError, 'holdout'):
                strategies.generate_signals({'2330': bars}, 'S4', s4_variant=variant)


class DividendTests(unittest.TestCase):
    def fixture(self):
        days = [(date(2023, 1, 1) + timedelta(days=i)).isoformat() for i in range(40)]
        bars = {symbol: [dict(date=day, open=10., high=11., low=9., close=10., volume=10000000,
                             turnover_twd=100000000) for day in days] for symbol in ('1111', '2222')}
        # Large synthetic dividend is solely to expose sizing timing.
        action = {'1111': [dict(session=days[27], status='verified', share_factor=1., price_factor=.5,
                               cash_dividend=5., payment_date=days[35])]}
        for b in bars['1111'][27:]:
            b.update(open=5., close=5., high=6., low=4.)
        signals = [dict(date=days[i], symbol=symbol, plan_state='eligible_proxy', rank=1., buy_limit=10.1,
                        entry_lower=0, stop=0, max_hold=100, exit_ma=100) for i, symbol in ((25, '1111'), (27, '2222'))]
        a = engine.Assumptions(initial_cash=1000., commission=0., minimum_commission=0., sell_tax=0.,
                               slippage_bps=0., lot=1, max_weight=1.)
        return dict(bars_by_symbol=bars, signals=signals, sessions=days, start=days[25], end=days[-1],
                    actions_by_symbol=action, assumptions=a)

    def test_next_session_dividend_can_fund_that_opening(self):
        inputs = self.fixture()
        result = engine.simulate(**inputs, dividend_availability='optimistic_next_session_preopen')
        unknown = engine.simulate(**inputs, dividend_availability='payment_date_unknown')
        buys = [f for f in result['fills'] if f['symbol'] == '2222']
        self.assertTrue(buys)
        self.assertEqual(buys[0]['date'], inputs['sessions'][28])
        self.assertGreater(buys[0]['shares'], 1)
        self.assertEqual([f for f in unknown['fills'] if f['symbol'] == '2222'], [])
        self.assertEqual(result['metrics']['ending_receivables'], 0)
        self.assertGreater(unknown['metrics']['ending_receivables'], 0)

    def test_no_ex_date_cash_and_missing_session_uses_next_recorded_open(self):
        inputs = self.fixture()
        ex = inputs['sessions'][27]
        omitted = inputs['sessions'].pop(28)
        for bars in inputs['bars_by_symbol'].values():
            bars[:] = [b for b in bars if b['date'] != omitted]
        result = engine.simulate(**inputs, dividend_availability='optimistic_next_session_preopen')
        before = next(c for c in result['curve'] if c['date'] == ex)
        self.assertGreater(before['receivables'], 0)
        self.assertEqual(next(f for f in result['fills'] if f['symbol'] == '2222')['date'], inputs['sessions'][28])

    def test_input_payment_schedule_is_not_mutated(self):
        inputs = self.fixture(); original = copy.deepcopy(inputs)
        engine.simulate(**inputs, dividend_availability='optimistic_next_session_preopen')
        self.assertEqual(inputs, original)

    def test_default_output_has_no_added_metadata(self):
        result = engine.simulate(**self.fixture())
        self.assertNotIn('dividend_availability_model', result)

    def test_nondefault_result_is_explicitly_hypothetical(self):
        for mode in r.DIVIDENDS:
            result = engine.simulate(**self.fixture(), dividend_availability=mode)
            self.assertEqual(result['dividend_availability_model'], mode)
            self.assertTrue(any('R4' in text for text in result['limitations']))

    def test_unknown_mode_cannot_silently_run(self):
        with self.assertRaisesRegex(ValueError, 'unregistered_dividend'):
            engine.simulate(**self.fixture(), dividend_availability='optimistic_typo')

    def test_new_modes_cannot_read_holdout(self):
        inputs = self.fixture(); inputs['end'] = '2024-01-02'
        for mode in r.DIVIDENDS:
            with self.subTest(mode=mode), self.assertRaisesRegex(ValueError, 'holdout'):
                engine.simulate(**inputs, dividend_availability=mode)


class ReviewTests(unittest.TestCase):
    def review(self):
        return dict(id=123, user={'type': 'Bot', 'login': 'chatgpt-codex-connector[bot]'}, author_association='NONE',
                    state='COMMENTED', commit_id='a' * 40, submitted_at='2026-09-25T10:00:00Z',
                    body='ROBUSTNESS_V2_1_ACCEPTED ' + r.PROPOSAL_SHA256 + ' ' + r.CLARIFICATION_SHA256)

    def check(self, review):
        return r.verify_review_payload(review, 'a' * 40, datetime(2026, 9, 25, 12, tzinfo=timezone.utc))

    def test_real_payload_shape_requires_marker_and_head(self):
        self.assertFalse(self.check(self.review())['release_gate_authority'])
        for change in ({'body': 'looks good'}, {'state': 'DISMISSED'}, {'commit_id': 'b' * 40}):
            value = self.review(); value.update(change)
            with self.subTest(change=change), self.assertRaises(ValueError):
                self.check(value)

    def test_self_or_unknown_reviewer_cannot_accept(self):
        for login in ('Kaichen9527', 'random-bot'):
            value = self.review(); value['user']['login'] = login
            with self.subTest(login=login), self.assertRaises(ValueError):
                self.check(value)

    def test_future_or_naive_timestamp_cannot_accept(self):
        for stamp in ('2027-01-01T00:00:00Z', '2026-09-25T10:00:00', 'invalid'):
            value = self.review(); value['submitted_at'] = stamp
            with self.subTest(stamp=stamp), self.assertRaises(ValueError):
                self.check(value)

    def test_no_git_or_dirty_git_has_no_source_identity(self):
        with patch.object(r.subprocess, 'check_output', side_effect=OSError()):
            with self.assertRaisesRegex(ValueError, 'clean_git'):
                r.source_identity()
        with patch.object(r.subprocess, 'check_output', return_value=' M engine.py'):
            with self.assertRaisesRegex(ValueError, 'dirty'):
                r.source_identity()

    def test_invalid_review_ids_never_contact_api(self):
        for value in (True, 0, -1, '1'):
            with self.subTest(value=value), self.assertRaises(ValueError):
                r.fetch_contract_review(value, 'a' * 40)


class FullPathTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bars, cls.actions, cls.benchmark = synthetic_panel()
        cls.bundle = synthetic_baseline(cls.bars, cls.actions, cls.benchmark)
        cls.proposal = r.contract()

    def run_paths(self, output, bundle=None):
        return r.run_registered_paths(self.bars, self.actions, self.benchmark,
                                     self.bundle if bundle is None else bundle, self.proposal,
                                     output, {'scope': 'synthetic_test_only', 'independent_review': False})

    def test_all_31_synthetic_paths_are_retained_without_winner(self):
        with tempfile.TemporaryDirectory() as directory:
            out = Path(directory) / 'new'
            result = self.run_paths(out)
            self.assertEqual(result['retained_path_records'], 31)
            self.assertEqual(result['completed_simulation_paths'], 31)
            self.assertTrue(result['R1_canonical_replay_passed'])
            self.assertEqual(result['status'], 'development_only_complete')
            self.assertIsNone(result['winner_selected'])
            self.assertFalse(result['production_authorized'])
            self.assertEqual(len((out / 'trial-ledger.jsonl').read_text().splitlines()), 31)
            self.assertTrue(all(t['metrics']['completed_trades'] == 0 for t in result['trials'] if t['strategy_id'] == 'S4'))
            with self.assertRaises(FileExistsError):
                self.run_paths(out)

    def test_r1_hidden_difference_blocks_but_does_not_omit_new_trials(self):
        bundle = copy.deepcopy(self.bundle)
        bundle['S1-baseline.json']['limitations'].append('changed')
        with tempfile.TemporaryDirectory() as directory:
            result = self.run_paths(Path(directory) / 'new', bundle)
        self.assertFalse(result['R1_canonical_replay_passed'])
        self.assertEqual(result['completed_simulation_paths'], 15)
        self.assertEqual(sum(t['status'] == 'blocked' for t in result['trials']), 16)
        self.assertEqual(result['retained_path_records'], 31)

    def test_r1_all_three_equality_surfaces_are_enforced(self):
        signals = self.bundle['S1-signals.json']
        result = self.bundle['S1-baseline.json']
        for surface in ('result', 'signals', 'ledger'):
            b = copy.deepcopy(self.bundle)
            if surface == 'result':
                b['S1-baseline.json']['costs_extra'] = 0
            elif surface == 'signals':
                b['S1-signals.json'].append({'raw_signal_state': 'confirmed'})
            else:
                b['trial-ledger.jsonl'][0]['parameter_variant'] = True
            self.assertFalse(r.r1_equality('S1', 'baseline', signals, result, b)[surface])

    def test_failed_simulation_still_leaves_31_registered_records(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(r, 'simulate', side_effect=ValueError('synthetic failure')):
            result = self.run_paths(Path(directory) / 'new')
        self.assertEqual(len(result['trials']), 31)
        self.assertEqual(sum(t['status'] == 'failed' for t in result['trials']), 15)
        self.assertEqual(result['completed_simulation_paths'], 0)

    def test_counts_do_not_modify_signal_rows(self):
        rows = [{'raw_signal_state': 'confirmed', 'plan_state': state} for state in ('eligible_proxy', 'avoid_chase')]
        old = copy.deepcopy(rows)
        self.assertEqual(r.confirmation_counts(rows), {'raw_confirmation_count': 2, 'eligible_order_count': 1, 'avoid_chase_count': 1})
        self.assertEqual(rows, old)


if __name__ == '__main__':
    unittest.main()
