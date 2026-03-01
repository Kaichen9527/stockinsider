import unittest

from strategy_engine import _map_action, _is_stock_blocked


class TestStrategyLogic(unittest.TestCase):
    def test_score_mapping(self):
        self.assertEqual(_map_action(0.8), 'buy')
        self.assertEqual(_map_action(0.6), 'watch')
        self.assertEqual(_map_action(0.3), 'reduce')

    def test_freshness_gate(self):
        signal = {"freshness_status": "stale"}
        market = {"freshness_status": "fresh"}
        blocked, reason = _is_stock_blocked(signal, market)
        self.assertTrue(blocked)
        self.assertEqual(reason, "stock signal stale")

        signal2 = {"freshness_status": "fresh"}
        market2 = {"freshness_status": "fresh"}
        blocked2, reason2 = _is_stock_blocked(signal2, market2)
        self.assertFalse(blocked2)
        self.assertIsNone(reason2)


if __name__ == '__main__':
    unittest.main()
