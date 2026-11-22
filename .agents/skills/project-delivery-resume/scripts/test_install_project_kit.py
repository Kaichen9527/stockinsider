"""Fixture validation for v6 two-skill installs, preservation and conflicts."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest


class ProjectKitFixtureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.base = Path(self.temp.name)
        self.kit = self.base / "kit"
        self.root = self.base / "project"
        self.kit.mkdir()
        self.root.mkdir()
        subprocess.run(["git", "init", "-q", str(self.root)], check=True)
        self.original = b"# Existing product rules\nKeep production gates.\n"
        (self.root / "AGENTS.md").write_bytes(self.original)
        shutil.copyfile(Path(__file__).with_name("install_project_kit.py"), self.kit / "install_project_kit.py")
        self.payload = {
            ".agents/skills/project-delivery-resume/SKILL.md": b"delivery fixture\n",
            ".agents/skills/project-storage-guard/SKILL.md": b"storage fixture\n",
            "docs/delivery-v6/START.md": b"v6 selected project\n",
        }
        self.write_manifest()

    def tearDown(self):
        self.temp.cleanup()

    def write_manifest(self):
        files = []
        for rel, data in self.payload.items():
            p = self.kit / "payload" / rel
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_bytes(data)
            files.append({"path": rel, "sha256": hashlib.sha256(data).hexdigest()})
        (self.kit / "manifest.json").write_text(json.dumps({"schema_version": 1, "project": "fixture", "files": files}))

    def run_install(self, apply=False):
        cmd = [sys.executable, str(self.kit / "install_project_kit.py"), "--project-root", str(self.root)]
        if apply:
            cmd.append("--apply")
        env = os.environ.copy()
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=15, env=env)
        return result.returncode, json.loads(result.stdout)

    def test_preview_apply_and_idempotent_second_apply(self):
        code, preview = self.run_install()
        self.assertEqual(code, 0)
        self.assertEqual(preview["status"], "preview_no_changes")
        self.assertEqual((self.root / "AGENTS.md").read_bytes(), self.original)
        self.assertFalse((self.root / ".agents").exists())
        self.assertEqual(len(preview["create_relative_claude_links"]), 2)
        code, applied = self.run_install(True)
        self.assertEqual(code, 0)
        self.assertEqual(applied["status"], "applied_local_only")
        self.assertTrue((self.root / "AGENTS.md").read_bytes().startswith(self.original))
        self.assertIn(b":v6:begin", (self.root / "AGENTS.md").read_bytes())
        for skill in ("project-delivery-resume", "project-storage-guard"):
            link = self.root / ".claude/skills" / skill
            self.assertEqual(os.readlink(link), "../../.agents/skills/" + skill)
            self.assertTrue((link / "SKILL.md").is_file())
        code, repeated = self.run_install(True)
        self.assertEqual(code, 0)
        self.assertEqual(repeated["copy_or_append"], [])
        self.assertEqual(repeated["create_relative_claude_links"], [])
        self.assertFalse(repeated["git_push_performed"])

    def test_existing_storage_skill_conflict_blocks_all_changes(self):
        p = self.root / ".agents/skills/project-storage-guard/SKILL.md"
        p.parent.mkdir(parents=True)
        p.write_bytes(b"owned custom storage policy")
        code, report = self.run_install(True)
        self.assertEqual(code, 3)
        self.assertEqual(report["status"], "blocked_no_changes")
        self.assertFalse((self.root / ".agents/skills/project-delivery-resume").exists())
        self.assertEqual((self.root / "AGENTS.md").read_bytes(), self.original)

    def test_v5_marker_requires_reviewed_migration(self):
        old = self.original + b"<!-- project-delivery-resume:v5:begin -->\nold\n<!-- project-delivery-resume:v5:end -->\n"
        (self.root / "AGENTS.md").write_bytes(old)
        code, report = self.run_install(True)
        self.assertEqual(code, 3)
        self.assertIn("older managed version", " ".join(report["conflicts"]))
        self.assertEqual((self.root / "AGENTS.md").read_bytes(), old)
        self.assertFalse((self.root / ".agents").exists())

    def test_symlinked_storage_parent_refused(self):
        outside = self.base / "outside"
        outside.mkdir()
        (self.root / ".agents/skills").mkdir(parents=True)
        (self.root / ".agents/skills/project-storage-guard").symlink_to(outside, target_is_directory=True)
        code, report = self.run_install(True)
        self.assertEqual(code, 2)
        self.assertEqual(report["changes_completed"], [])
        self.assertEqual(list(outside.iterdir()), [])

    def test_missing_guard_manifest_refused(self):
        del self.payload[".agents/skills/project-storage-guard/SKILL.md"]
        self.write_manifest()
        code, report = self.run_install(True)
        self.assertEqual(code, 2)
        self.assertIn("both v6", report["error"])
        self.assertFalse((self.root / ".agents").exists())

    def test_tampered_payload_refused(self):
        (self.kit / "payload/docs/delivery-v6/START.md").write_bytes(b"tampered")
        code, report = self.run_install(True)
        self.assertEqual(code, 2)
        self.assertIn("integrity mismatch", report["error"])
        self.assertEqual(report["changes_completed"], [])
        self.assertEqual((self.root / "AGENTS.md").read_bytes(), self.original)


if __name__ == "__main__":
    unittest.main()
