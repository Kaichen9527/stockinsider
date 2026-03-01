import unittest

from ingestion_pipeline import _seed_market_snapshots


class TestPipelineSmoke(unittest.TestCase):
    def test_seed_contract(self):
        rows = _seed_market_snapshots()
        self.assertGreaterEqual(len(rows), 2)
        for row in rows:
            self.assertIn("market", row)
            self.assertIn("source_timestamp", row)
            self.assertIn("source_key", row)
            self.assertIn("sector_flows", row)


if __name__ == '__main__':
    unittest.main()
