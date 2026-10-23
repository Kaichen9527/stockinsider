"""Synthetic input-contract regressions; no network, historical replay or promotion."""
import copy
from dataclasses import replace
from datetime import date, timedelta
import hashlib
import json
import unittest

from engine import Assumptions, simulate


def fixture():
    sessions = [(date(2023, 1, 1) + timedelta(days=i)).isoformat() for i in range(40)]
    bars = {'2330': [dict(date=d, open=100., high=102., low=98., close=100.,
                         volume=100_000_000, turnover_twd=10_000_000_000) for d in sessions]}
    signal = dict(date=sessions[25], symbol='2330', plan_state='eligible_proxy', rank=1.,
                  buy_limit=102., entry_lower=101., stop=80., exit_ma=20, max_hold=2)
    return dict(bars_by_symbol=bars, signals=[signal], sessions=sessions,
                start=sessions[25], end=sessions[-1])


def event(session='2023-01-28', **overrides):
    return dict(dict(session=session, status='verified', price_factor=.99,
                     share_factor=1., cash_dividend=1.), **overrides)


class EngineAdmissionTests(unittest.TestCase):
    def reject(self, inputs, reason):
        with self.assertRaisesRegex(ValueError, reason):
            simulate(**inputs)

    def test_valid_result_matches_pre_fix_golden(self):
        result = simulate(**fixture())
        raw = json.dumps(result, sort_keys=True, separators=(',', ':'), allow_nan=False).encode()
        self.assertEqual(hashlib.sha256(raw).hexdigest(), 'd09593e7397b86a1f4e01e3c2e418c7d42c881d9de698f6105f90be46af0016c')

    def test_valid_input_is_not_mutated(self):
        inputs = fixture()
        inputs['actions_by_symbol'] = {'2330': [event()]}
        before = copy.deepcopy(inputs)
        simulate(**inputs)
        self.assertEqual(inputs, before)

    def test_duplicate_action_cannot_double_dividend(self):
        inputs = fixture()
        inputs['actions_by_symbol'] = {'2330': [event(), event()]}
        self.reject(inputs, 'duplicate_action_session')

    def test_conflicting_same_day_action_is_not_implicitly_selected(self):
        inputs = fixture()
        inputs['actions_by_symbol'] = {'2330': [event(), event(cash_dividend=2.)]}
        self.reject(inputs, 'duplicate_action_session')

    def test_duplicate_action_rejected_even_without_position(self):
        inputs = fixture()
        inputs['signals'] = []
        inputs['actions_by_symbol'] = {'2330': [event(), event()]}
        self.reject(inputs, 'duplicate_action_session')

    def test_action_on_missing_calendar_session_is_rejected(self):
        inputs = fixture()
        inputs['sessions'].remove('2023-01-28')
        inputs['bars_by_symbol']['2330'] = [b for b in inputs['bars_by_symbol']['2330'] if b['date'] != '2023-01-28']
        inputs['actions_by_symbol'] = {'2330': [event()]}
        self.reject(inputs, 'action_not_on_calendar')

    def test_action_payment_before_entitlement_rejected_without_position(self):
        inputs = fixture()
        inputs['signals'] = []
        inputs['actions_by_symbol'] = {'2330': [event(payment_date='2023-01-01')]}
        self.reject(inputs, 'payment_before_entitlement')

    def test_invalid_payment_date_rejected(self):
        for payment in ('2023-02-30', '20230130', '', False):
            with self.subTest(payment=payment):
                inputs = fixture()
                inputs['actions_by_symbol'] = {'2330': [event(payment_date=payment)]}
                self.reject(inputs, 'invalid_payment_date')

    def test_nonfinite_dividends_rejected(self):
        for value in (float('nan'), float('inf'), float('-inf'), True, '1', -1):
            with self.subTest(value=value):
                inputs = fixture()
                inputs['actions_by_symbol'] = {'2330': [event(cash_dividend=value)]}
                self.reject(inputs, 'invalid_cash_dividend')

    def test_bool_action_factors_are_not_financial_numbers(self):
        for field in ('share_factor', 'price_factor'):
            with self.subTest(field=field):
                inputs = fixture()
                inputs['actions_by_symbol'] = {'2330': [event(**{field: True})]}
                self.reject(inputs, 'invalid_action_factor|share_changing')

    def test_nonfinite_assumptions_rejected(self):
        fields = ('initial_cash', 'commission', 'minimum_commission', 'sell_tax',
                  'slippage_bps', 'max_weight', 'max_turnover_participation')
        for field in fields:
            for value in (float('nan'), float('inf'), float('-inf'), True):
                with self.subTest(field=field, value=value):
                    inputs = fixture()
                    inputs['assumptions'] = replace(Assumptions(), **{field: value})
                    self.reject(inputs, 'invalid_assumptions')

    def test_lot_is_a_positive_integer(self):
        for lot in (True, 1.5, float('inf'), 0):
            with self.subTest(lot=lot):
                inputs = fixture()
                inputs['assumptions'] = replace(Assumptions(), lot=lot)
                self.reject(inputs, 'invalid_assumptions')

    def test_duplicate_bar_is_not_silently_overwritten(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'].insert(26, dict(inputs['bars_by_symbol']['2330'][26], close=101.))
        self.reject(inputs, 'bar_dates_must_be_unique_and_sorted')

    def test_unsorted_bars_do_not_change_warmup_or_last_price(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'].reverse()
        self.reject(inputs, 'bar_dates_must_be_unique_and_sorted')

    def test_nonfinite_ohlc_rejected(self):
        for field in ('open', 'high', 'low', 'close'):
            with self.subTest(field=field):
                inputs = fixture()
                inputs['bars_by_symbol']['2330'][26][field] = float('nan')
                self.reject(inputs, 'invalid_ohlc')

    def test_impossible_ohlc_rejected(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'][26]['low'] = 103.
        self.reject(inputs, 'invalid_ohlc_geometry')

    def test_nonfinite_volume_and_liquidity_rejected(self):
        for field in ('volume', 'turnover_twd'):
            for value in (float('nan'), float('inf'), -1, True):
                with self.subTest(field=field, value=value):
                    inputs = fixture()
                    inputs['bars_by_symbol']['2330'][20][field] = value
                    self.reject(inputs, 'invalid_volume_or_turnover')

    def test_valid_missing_bar_retains_missing_mark_failure(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'].pop(27)
        result = simulate(**inputs)
        self.assertEqual(result['status'], 'invalid_missing_marks')
        self.assertTrue(result['unresolved'])

    def test_valid_halt_does_not_invent_fill(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'][26]['volume'] = 0
        self.assertEqual(simulate(**inputs)['fills'], [])

    def test_invalid_calendar_date_rejected(self):
        inputs = fixture()
        inputs['sessions'].append('2023-02-30')
        self.reject(inputs, 'invalid_calendar')

    def test_holdout_tail_calendar_rejected_even_with_earlier_end(self):
        inputs = fixture()
        inputs['sessions'].append('2024-01-02')
        self.reject(inputs, 'holdout_locked')

    def test_holdout_bar_cannot_hide_outside_calendar(self):
        inputs = fixture()
        inputs['bars_by_symbol']['2330'].append(dict(inputs['bars_by_symbol']['2330'][-1], date='2024-01-02'))
        self.reject(inputs, 'holdout_locked')

    def test_duplicate_signal_rejected_before_any_order(self):
        inputs = fixture()
        # Last-session orders are never executed but must still be unambiguous.
        inputs['signals'][0]['date'] = inputs['sessions'][-1]
        inputs['signals'].append(copy.deepcopy(inputs['signals'][0]))
        self.reject(inputs, 'duplicate_symbol_signal_session')

    def test_eligible_order_fields_must_be_finite(self):
        for field in ('buy_limit', 'entry_lower', 'stop', 'rank'):
            with self.subTest(field=field):
                inputs = fixture()
                inputs['signals'][0][field] = float('nan')
                self.reject(inputs, 'invalid_signal')

    def test_zero_buy_limit_rejected_without_division_error(self):
        inputs = fixture()
        inputs['signals'][0]['buy_limit'] = 0
        self.reject(inputs, 'invalid_signal')

    def test_bad_exit_windows_rejected(self):
        for field in ('max_hold', 'exit_ma'):
            for value in (0, True, 1.5):
                with self.subTest(field=field, value=value):
                    inputs = fixture()
                    inputs['signals'][0][field] = value
                    self.reject(inputs, 'invalid_signal')

    def test_bad_exit_direction_rejected(self):
        inputs = fixture()
        inputs['signals'][0]['exit_ma_direction'] = 'above_typo'
        self.reject(inputs, 'invalid_signal')

    def test_nonexecutable_avoid_chase_keeps_null_order_fields(self):
        inputs = fixture()
        inputs['signals'][0].update(plan_state='avoid_chase', buy_limit=None, stop=None, entry_lower=None)
        self.assertEqual(simulate(**inputs)['fills'], [])

    def test_passive_benchmark_keeps_zero_stop_and_lower(self):
        inputs = fixture()
        inputs['signals'][0].update(stop=0, entry_lower=0, max_hold=1_000_000, exit_ma=1_000_000)
        self.assertEqual(len(simulate(**inputs)['fills']), 1)

    def test_missing_turnover_remains_zero_capacity_not_free_liquidity(self):
        inputs = fixture()
        for bar in inputs['bars_by_symbol']['2330']:
            del bar['turnover_twd']
        self.assertEqual(simulate(**inputs)['fills'], [])

    def test_known_closed_day_payment_still_releases_next_session(self):
        inputs = fixture()
        inputs['signals'][0]['max_hold'] = 30
        inputs['sessions'].remove('2023-01-31')
        inputs['bars_by_symbol']['2330'] = [b for b in inputs['bars_by_symbol']['2330'] if b['date'] != '2023-01-31']
        inputs['actions_by_symbol'] = {'2330': [event(payment_date='2023-01-31')]}
        result = simulate(**inputs)
        self.assertEqual(result['metrics']['ending_receivables'], 0)

    def test_no_actions_and_empty_signal_panel_still_report_no_trades(self):
        inputs = fixture()
        inputs['signals'] = []
        result = simulate(**inputs)
        self.assertEqual(result['metrics']['completed_trades'], 0)
        self.assertIsNone(result['metrics']['winning_trade_fraction'])


if __name__ == '__main__':
    unittest.main()
