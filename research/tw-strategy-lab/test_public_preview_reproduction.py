"""Offline proof that the retained CSV cannot acquire publication authority."""
import json
from pathlib import Path
import tempfile
import unittest
import article_builder
import reproduce_public_preview as reproduce


class ReproductionTests(unittest.TestCase):
    def test_frozen_csv_has_176_unique_identities(self):
        snapshot = reproduce.snapshot_from_csv(reproduce.CSV_PATH.read_bytes())
        self.assertEqual(len(snapshot['candidates']), 176)
        self.assertFalse(snapshot['complete'])
        self.assertFalse(snapshot['authoritative_snapshot_available'])
        self.assertIsNone(snapshot['candidates'][0]['observed_at'])

    def test_tamper_cannot_be_relabelled_as_original_observation(self):
        with self.assertRaisesRegex(ValueError, 'hash_mismatch'):
            reproduce.snapshot_from_csv(reproduce.CSV_PATH.read_bytes() + b'\n')

    def test_public_placeholder_is_retained_not_silently_repaired(self):
        snapshot = reproduce.snapshot_from_csv(reproduce.CSV_PATH.read_bytes())
        card = next(c for c in snapshot['candidates'] if c['symbol'] == '6000')
        self.assertEqual(card['name'], '6000')
        self.assertIsNone(card['revision'])
        self.assertNotIn('security_type', card)

    def test_all_drafts_remain_blocked_and_non_executable(self):
        snapshot = reproduce.snapshot_from_csv(reproduce.CSV_PATH.read_bytes())
        research = json.loads(reproduce.RESEARCH.read_text())
        result = article_builder.build_articles(snapshot, research)
        self.assertEqual(result['coverage']['blocked_count'], 176)
        self.assertEqual(result['coverage']['preview_ready_count'], 0)
        self.assertEqual(len(result['update_queue']), 176)
        self.assertTrue(all(not q['publish_allowed'] for q in result['update_queue']))

    def test_reproduction_creates_real_markdown_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'new'
            result = reproduce.main(['--output-dir', str(output)])
            self.assertEqual(len(list((output / 'drafts').glob('*.md'))), 176)
            self.assertEqual(result['coverage']['article_count'], 176)
            with self.assertRaises(FileExistsError):
                reproduce.main(['--output-dir', str(output)])

    def test_existing_output_symlink_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'target').mkdir()
            (root / 'link').symlink_to(root / 'target', target_is_directory=True)
            with self.assertRaises(FileExistsError):
                reproduce.main(['--output-dir', str(root / 'link')])
            self.assertEqual(list((root / 'target').iterdir()), [])


if __name__ == '__main__':
    unittest.main()
