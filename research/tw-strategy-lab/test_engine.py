import unittest
from datetime import date, timedelta
from engine import Assumptions, round_price, simulate, tick
from strategies import round_tw_price, tw_tick


def fixture():
    sessions = [(date(2023, 1, 1) + timedelta(days=i)).isoformat() for i in range(40)]
    bars = [{'date': d, 'open': 100., 'high': 102., 'low': 98., 'close': 100.,
             'volume': 100_000_000, 'turnover_twd': 10_000_000_000} for d in sessions]
    signal = dict(date=sessions[25], symbol='2330', plan_state='eligible_proxy', rank=1.,
                  buy_limit=102., entry_lower=101., stop=80., exit_ma=20, max_hold=2)
    return sessions, bars, signal


class EngineTests(unittest.TestCase):
    def run_case(self, bars, signals, sessions, **kwargs):
        return simulate({'2330': bars}, signals, sessions, start=sessions[25], end=sessions[-1], **kwargs)

    def test_engine_and_signal_tick_schedules_do_not_drift(self):
        # TWSE/TPEx common-stock grid. Keep signal limits and simulated fills
        # on the same legal prices at every boundary.
        schedule = [(0.01, .01), (5, .01), (9.99, .01), (10, .05),
                    (49.95, .05), (50, .1), (99.9, .1), (100, .5),
                    (499.5, .5), (500, 1), (999, 1), (1000, 5)]
        for price, expected in schedule:
            self.assertEqual(tick(price), expected)
            self.assertEqual(tw_tick(price), expected)
            self.assertEqual(round_price(price), round_tw_price(price, 'down'))
            self.assertEqual(round_price(price, up=True), round_tw_price(price, 'up'))

    def test_no_same_day_and_gap_below_band_really_fills(self):
        sessions, bars, signal = fixture()
        result = self.run_case(bars, [signal], sessions)
        buy = result['fills'][0]
        self.assertEqual(buy['date'], sessions[26])
        self.assertTrue(buy['gap_below_entry_lower'])
        self.assertGreater(buy['price'], 100)
        self.assertLessEqual(buy['price'], signal['buy_limit'])

    def test_cash_reconciles_fees_and_slippage_not_deducted_twice(self):
        sessions, bars, signal = fixture()
        result = self.run_case(bars, [signal], sessions)
        self.assertEqual(len(result['trades']), 1)
        pnl = result['trades'][0]['net_pnl']
        self.assertAlmostEqual(result['metrics']['ending_equity'], 10_000_000 + pnl)
        self.assertLess(pnl, 0)
        self.assertTrue(all(r['cash'] >= 0 for r in result['curve']))

    def test_open_equal_limit_cannot_invent_queue_fill(self):
        sessions, bars, signal = fixture()
        signal['buy_limit'] = 100
        result = self.run_case(bars, [signal], sessions)
        self.assertFalse(result['fills'])
        self.assertEqual(result['skipped_orders'][0]['reason'], 'limit_not_crossed_or_limit_up')

    def test_next_day_missing_expires_buy_instead_of_later_fill(self):
        sessions, bars, signal = fixture()
        bars.pop(26)
        result = self.run_case(bars, [signal], sessions)
        self.assertFalse(result['fills'])
        self.assertEqual(len(result['skipped_orders']), 1)

    def test_limit_down_exit_waits_and_retains_loss(self):
        sessions, bars, signal = fixture()
        signal['max_hold'] = 1
        bars[27].update(open=90., close=90., high=90., low=90.)
        bars[28].update(open=91., close=91., high=92., low=90.)
        result = self.run_case(bars, [signal], sessions)
        self.assertEqual(result['trades'][0]['exit_date'], sessions[28])
        self.assertTrue(any(s['reason'] == 'limit_down_proxy' for s in result['skipped_orders']))
        self.assertLess(result['trades'][0]['net_pnl'], 0)

    def test_cash_dividend_is_equity_receivable_not_buying_cash(self):
        sessions, bars, signal = fixture()
        signal['max_hold'] = 30
        for bar in bars[27:]:
            bar.update(open=99., high=101., low=97., close=99.)
        event = dict(session=sessions[27], status='verified', price_factor=.99, share_factor=1., cash_dividend=1.)
        result = self.run_case(bars, [signal], sessions, actions_by_symbol={'2330': [event]})
        shares = result['fills'][0]['shares']
        self.assertEqual(result['metrics']['ending_receivables'], shares)
        before = next(r for r in result['curve'] if r['date'] == sessions[26])
        after = next(r for r in result['curve'] if r['date'] == sessions[27])
        self.assertAlmostEqual(before['equity'], after['equity'])
        self.assertAlmostEqual(before['cash'], after['cash'])

    def test_unresolved_share_event_blocks(self):
        sessions, bars, signal = fixture()
        event = dict(session=sessions[27], status='verified', price_factor=.5, share_factor=2., cash_dividend=0.)
        with self.assertRaisesRegex(ValueError, 'share_changing'):
            self.run_case(bars, [signal], sessions, actions_by_symbol={'2330': [event]})

    def test_holdout_cannot_be_run(self):
        sessions, bars, signal = fixture()
        with self.assertRaisesRegex(ValueError, 'holdout_locked'):
            simulate({'2330': bars}, [signal], sessions, start='2023-01-01', end='2024-01-01')

    def test_reversal_exits_above_moving_average(self):
        sessions, bars, signal = fixture()
        signal.update(exit_ma_direction='above', exit_ma=5, max_hold=20)
        result = self.run_case(bars, [signal], sessions)
        self.assertEqual(result['trades'][0]['exit_date'], sessions[27])

    def test_stress_costs_reduce_same_path_return(self):
        sessions, bars, signal = fixture()
        normal = self.run_case(bars, [signal], sessions)
        stress = self.run_case(bars, [signal], sessions, assumptions=Assumptions(commission=.00285, minimum_commission=40, slippage_bps=20))
        self.assertLess(stress['metrics']['net_total_return'], normal['metrics']['net_total_return'])

    def test_quantity_is_fixed_at_limit_before_open_is_seen(self):
        sessions, bars, signal = fixture()
        normal = self.run_case(bars, [signal], sessions)
        bars[26].update(open=95., low=94.)
        gap = self.run_case(bars, [signal], sessions)
        self.assertEqual(normal['fills'][0]['shares'], gap['fills'][0]['shares'])

    def test_known_dividend_payment_on_closed_day_arrives_next_session(self):
        sessions, bars, signal = fixture()
        signal['max_hold'] = 30
        event = dict(session=sessions[27], status='verified', price_factor=.99, share_factor=1., cash_dividend=1., payment_date=sessions[30])
        del sessions[30]
        del bars[30]
        result = self.run_case(bars, [signal], sessions, actions_by_symbol={'2330': [event]})
        self.assertEqual(result['metrics']['ending_receivables'], 0)

    def test_known_same_day_dividend_payment_not_stranded(self):
        sessions, bars, signal = fixture()
        signal['max_hold'] = 30
        event = dict(session=sessions[27], status='verified', price_factor=.99, share_factor=1., cash_dividend=1., payment_date=sessions[27])
        result = self.run_case(bars, [signal], sessions, actions_by_symbol={'2330': [event]})
        self.assertEqual(result['metrics']['ending_receivables'], 0)


if __name__ == '__main__':
    unittest.main()
