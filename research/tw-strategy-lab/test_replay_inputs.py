import hashlib
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import replay_inputs as r


class ReplayInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.candidate, self.baseline = self.root / 'candidate', self.root / 'baseline'
        self.candidate.mkdir(); self.baseline.mkdir()
        self.manifest = {'holdout_accessed': False, 'requested_session_range': ['2018-01-01', '2023-12-31'], 'outputs': {}}
        for name in r.TABLES:
            raw = b'session,value\n2023-01-02,1\n'
            (self.candidate / name).write_bytes(raw)
            self.manifest['outputs'][name] = {'bytes': len(raw), 'sha256': r.digest(raw)}
        self.freeze()

    def freeze(self):
        self.raw = json.dumps(self.manifest).encode()
        (self.baseline / 'dataset-manifest.json').write_bytes(self.raw)
        self.sha = r.digest(self.raw)

    def run_recovery(self):
        return r.recover(self.candidate, self.root / 'out', baseline=self.baseline, dataset_sha256=self.sha)

    def test_exact_recovery_preserves_original_manifest_bytes(self):
        result = self.run_recovery()
        self.assertEqual(result['status'], 'exact_tables_recovered')
        self.assertEqual((self.root / 'out/manifest.json').read_bytes(), self.raw)
        self.assertEqual(result['new_historical_simulations'], 0)

    def test_a_single_changed_byte_blocks_all_tables(self):
        (self.candidate / 'prices.csv').write_bytes(b'session,value\n2023-01-02,2\n')
        result = self.run_recovery()
        self.assertEqual(result['status'], 'blocked_table_mismatch_or_missing')
        self.assertFalse((self.root / 'out/manifest.json').exists())
        self.assertFalse((self.root / 'out/benchmark.csv').exists())
        self.assertEqual(len(result['tables']), 3)

    def test_missing_table_retained_as_unavailable(self):
        (self.candidate / 'benchmark.csv').unlink()
        result = self.run_recovery()
        self.assertEqual(result['tables'][1]['status'], 'unavailable')

    def test_wrong_original_manifest_hash_rejected(self):
        with self.assertRaisesRegex(ValueError, 'frozen_manifest_hash_mismatch'):
            r.recover(self.candidate, self.root / 'out', baseline=self.baseline, dataset_sha256='0' * 64)
        self.assertFalse((self.root / 'out').exists())

    def test_later_manifest_is_not_relabelled_as_original(self):
        later = b'{"generated_at":"2026-09-26"}'
        (self.candidate / 'manifest.json').write_bytes(later)
        result = self.run_recovery()
        self.assertEqual(result['later_manifest_sha256'], r.digest(later))
        self.assertEqual((self.root / 'out/later-acquisition-manifest.json').read_bytes(), later)
        self.assertEqual((self.root / 'out/manifest.json').read_bytes(), self.raw)

    def test_existing_output_not_overwritten(self):
        self.run_recovery()
        with self.assertRaisesRegex(ValueError, 'output_already_exists'):
            self.run_recovery()

    def test_symlinked_table_rejected(self):
        file = self.candidate / 'prices.csv'
        file.rename(self.root / 'real.csv'); file.symlink_to(self.root / 'real.csv')
        self.assertEqual(self.run_recovery()['tables'][0]['status'], 'unavailable')

    def test_even_hash_matching_holdout_row_is_rejected(self):
        raw = b'session,value\n2024-01-02,1\n'
        (self.candidate / 'prices.csv').write_bytes(raw)
        self.manifest['outputs']['prices.csv'] = {'bytes': len(raw), 'sha256': r.digest(raw)}
        self.freeze()
        self.assertNotEqual(self.run_recovery()['status'], 'exact_tables_recovered')

    def test_duplicate_and_nonfinite_json_rejected(self):
        for raw in (b'{"x":1,"x":2}', b'{"x":NaN}'):
            with self.subTest(raw=raw), self.assertRaises(ValueError):
                r.strict_json(raw)


if __name__ == '__main__':
    unittest.main()
