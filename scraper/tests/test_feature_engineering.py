import unittest

from feature_engineering import moving_average, calculate_rsi, calculate_macd, compute_technical_snapshot


class TestFeatureEngineering(unittest.TestCase):
    def test_moving_average(self):
        self.assertAlmostEqual(moving_average([1, 2, 3, 4, 5], 5), 3.0)
        self.assertIsNone(moving_average([1, 2], 5))

    def test_rsi_range(self):
        prices = [100, 102, 103, 101, 105, 107, 108, 110, 109, 111, 112, 114, 113, 115, 116, 118]
        rsi = calculate_rsi(prices, 14)
        self.assertIsNotNone(rsi)
        assert rsi is not None
        self.assertGreaterEqual(rsi, 0)
        self.assertLessEqual(rsi, 100)

    def test_macd_contract(self):
        prices = [100 + i for i in range(40)]
        macd = calculate_macd(prices)
        self.assertIn("macd", macd)
        self.assertIn("signal", macd)
        self.assertIsNotNone(macd["macd"])

    def test_technical_snapshot(self):
        prices = [900, 910, 905, 920, 930, 940, 950, 960, 955, 970, 980, 995, 1005, 1010, 1020, 1030, 1040]
        snapshot = compute_technical_snapshot(prices)
        self.assertIsNotNone(snapshot.ma_short)
        self.assertIsNotNone(snapshot.rsi)


if __name__ == '__main__':
    unittest.main()
