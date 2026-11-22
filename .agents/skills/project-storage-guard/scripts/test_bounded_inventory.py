"""Local fixtures for the inventory's filesystem and output boundaries."""
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

from bounded_inventory import inventory


class InventoryBoundaryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        (self.root / "log").mkdir()
        (self.root / "log" / "a.log").write_bytes(b"abc")

    def tearDown(self):
        self.temp.cleanup()

    def test_metadata_only_hardlink_and_no_contents(self):
        os.link(self.root / "log/a.log", self.root / "log/b.log")
        before = (self.root / "log/a.log").stat().st_mtime_ns
        with patch("builtins.open", side_effect=AssertionError("No file contents may be read")):
            result = inventory(self.root, ["log"])
        self.assertTrue(result["complete"])
        self.assertEqual(result["logical_bytes_observed"], 3)
        self.assertEqual(result["hardlink_duplicates"], 1)
        self.assertEqual(before, (self.root / "log/a.log").stat().st_mtime_ns)
        self.assertNotIn("a.log", str(result))

    def test_symlink_never_followed(self):
        (self.root / "source").mkdir()
        (self.root / "source/only-copy.db").write_bytes(b"unique" * 100)
        (self.root / "log/linked").symlink_to(self.root / "source", target_is_directory=True)
        result = inventory(self.root, ["log"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["logical_bytes_observed"], 3)
        self.assertEqual(result["skipped"]["symlink"], 1)
        with self.assertRaises(ValueError):
            inventory(self.root, ["log/linked"])

    def test_full_root_escape_git_and_overlapping_roots_refused(self):
        (self.root / "log/nested").mkdir()
        for selected in (["."], ["../"], [".git"], [str(self.root)], ["log", "log/nested"]):
            with self.subTest(selected=selected), self.assertRaises((ValueError, OSError)):
                inventory(self.root, selected)

    def test_depth_and_entry_caps_never_claim_total(self):
        (self.root / "log/nested").mkdir()
        (self.root / "log/nested/b.log").write_bytes(b"12345")
        shallow = inventory(self.root, ["log"], max_depth=0)
        self.assertFalse(shallow["complete"])
        self.assertEqual(shallow["logical_bytes_observed"], 3)
        bounded = inventory(self.root, ["log"], max_entries=1)
        self.assertFalse(bounded["complete"])
        self.assertEqual(bounded["entries_seen"], 1)
        self.assertEqual(bounded["stop_reason"], "entry_limit")

    def test_cloud_paths_and_placeholder_names_skipped(self):
        (self.root / "log/.asset.icloud").write_bytes(b"pointer")
        result = inventory(self.root, ["log"])
        self.assertFalse(result["complete"])
        self.assertEqual(result["logical_bytes_observed"], 3)
        (self.root / "CloudStorage").mkdir()
        with self.assertRaises(ValueError):
            inventory(self.root / "CloudStorage", ["log"])

    def test_deadline_stops_without_partial_success(self):
        with patch("bounded_inventory.time.monotonic", side_effect=[0, 10]):
            result = inventory(self.root, ["log"], max_seconds=1)
        self.assertFalse(result["complete"])
        self.assertEqual(result["entries_seen"], 0)
        self.assertEqual(result["stop_reason"], "time_limit")

    def test_nonfinite_or_unbounded_limits_refused(self):
        for value in (float("inf"), float("nan"), -1, 11):
            with self.subTest(seconds=value), self.assertRaises(ValueError):
                inventory(self.root, ["log"], max_seconds=value)
        with self.assertRaises(ValueError):
            inventory(self.root, ["log"], max_entries=5001)
        with self.assertRaises(ValueError):
            inventory(self.root, ["log"], max_depth=5)


if __name__ == "__main__":
    unittest.main()
