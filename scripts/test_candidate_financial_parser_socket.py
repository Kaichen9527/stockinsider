"""Real offline subprocess regression for a parser user with no writable home."""
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("parser_socket", ROOT / "candidate_financial_parser_socket.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class SocketEnvironmentTest(unittest.TestCase):
    def test_offline_parser_has_ephemeral_config_without_inheriting_secrets(self):
        isolated = subprocess.run([sys.executable, "-c", "import arelle"], capture_output=True,
            env={"LANG": "C.UTF-8", "LC_ALL": "C.UTF-8", "PYTHONNOUSERSITE": "1"}, check=False)
        if isolated.returncode != 0:
            self.skipTest("reviewed parser virtualenv is not configured")
        payload = (ROOT / "fixtures/candidate-financial-document-parser/validated-instance.xbrl").read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        original_run = worker.subprocess.run
        environments = []

        def capture(*args, **kwargs):
            environments.append(dict(kwargs["env"]))
            self.assertTrue(Path(kwargs["env"]["XDG_CONFIG_HOME"]).is_dir())
            return original_run(*args, **kwargs)

        from arelle import Version
        with tempfile.TemporaryDirectory(prefix="stockinsider-taxonomy-fixture-") as directory:
            taxonomy = Path(directory)
            (taxonomy / "validated-taxonomy.xsd").write_bytes(
                (ROOT / "fixtures/candidate-financial-document-parser/validated-taxonomy.xsd").read_bytes())
            (taxonomy / ".archive-sha256").write_text(worker.EXPECTED_TAXONOMY_SHA256 + "\n", encoding="ascii")
            with _pair() as (client, server):
                client.settimeout(30)
                client.sendall(json.dumps({"byteLength": len(payload), "format": "xbrl", "sha256": digest}).encode() + b"\n" + payload)
                with patch.dict(os.environ, {"HOME": "/", "INTERNAL_API_KEY": "must-not-inherit"}), \
                    patch.object(worker, "OFFICIAL_TAXONOMY_PATH", directory), \
                    patch.object(worker, "EXPECTED_ARELLE_VERSION", str(Version.version)), \
                    patch.object(worker.subprocess, "run", capture):
                    worker.serve(server)
                response = json.loads(client.recv(65536))
        self.assertEqual(response["inputSha256"], digest)
        self.assertEqual(response["parser"], "arelle")
        self.assertTrue(response["locators"])
        self.assertNotIn("INTERNAL_API_KEY", environments[0])
        self.assertFalse(Path(environments[0]["XDG_CONFIG_HOME"]).exists())

    def test_xbrl_fails_closed_without_installed_taxonomy_identity(self):
        payload = (ROOT / "fixtures/candidate-financial-document-parser/validated-instance.xbrl").read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        with tempfile.TemporaryDirectory(prefix="stockinsider-taxonomy-missing-") as directory, _pair() as (client, server):
            client.sendall(json.dumps({"byteLength": len(payload), "format": "xbrl", "sha256": digest}).encode() + b"\n" + payload)
            with patch.object(worker, "OFFICIAL_TAXONOMY_PATH", directory):
                with self.assertRaisesRegex(ValueError, "official_taxonomy_unavailable"):
                    worker.serve(server)


from contextlib import contextmanager

@contextmanager
def _pair():
    client, server = socket.socketpair()
    try:
        yield client, server
    finally:
        client.close()
        server.close()

if __name__ == "__main__":
    unittest.main()
