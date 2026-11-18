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
from unittest.mock import Mock, patch

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
        self.assertEqual(environments[0]["TMPDIR"], environments[0]["XDG_CONFIG_HOME"])
        self.assertFalse(Path(environments[0]["XDG_CONFIG_HOME"]).exists())

    def test_timed_out_child_cannot_leave_document_or_taxonomy_scratch_behind(self):
        leftovers = []
        def timeout(*_args, **kwargs):
            scratch = Path(kwargs["env"]["TMPDIR"]) / "child-taxonomy-copy"
            scratch.mkdir()
            (scratch / "document.xhtml").write_bytes(b"temporary diagnostic")
            leftovers.append(scratch)
            raise subprocess.TimeoutExpired("isolated-parser", 25)
        payload = b"%PDF-1.4"
        with _pair() as (client, server):
            client.sendall(json.dumps({"byteLength": len(payload), "format": "pdf",
                "sha256": hashlib.sha256(payload).hexdigest()}).encode() + b"\n" + payload)
            with patch.object(worker.subprocess, "run", timeout), self.assertRaises(subprocess.TimeoutExpired):
                worker.serve(server)
        self.assertEqual(len(leftovers), 1)
        self.assertFalse(leftovers[0].exists())

    def test_disconnect_before_reply_keeps_accepting_requests(self):
        with _pair() as (first, server1), _pair() as (second, server2):
            first.close()
            second.shutdown(socket.SHUT_WR)
            second.settimeout(1)
            listener = Mock()
            listener.accept.side_effect = [(server1, ""), (server2, ""), StopIteration]
            with patch.object(worker.socket, "fromfd", return_value=listener), self.assertRaises(StopIteration):
                worker.main()
            self.assertEqual(listener.accept.call_count, 3)
            self.assertEqual(json.loads(second.recv(1024)), {"error": "parser_socket_header_invalid"})

    def test_extended_profile_requires_structured_format_and_filing_context(self):
        for request in (
            {"format": "xbrl"},
            {"format": "pdf", "expectedEntity": "5274", "expectedPeriodEnd": "2026-09-30"},
        ):
            with self.subTest(request=request), _pair() as (client, server):
                header = {**request, "byteLength": 1, "sha256": "a" * 64, "profile": "extended-official"}
                client.sendall(json.dumps(header).encode() + b"\nX")
                with self.assertRaisesRegex(ValueError, "parser_socket_profile_invalid"):
                    worker.receive_request(server)

    def test_registered_taxonomy_uses_closed_quarter_boundaries(self):
        for period in ('2020-06-30', '2025-12-31', '2024-09-30'):
            self.assertEqual(worker.registered_taxonomy(period), (worker.HISTORICAL_TAXONOMY_PATH,
                             worker.HISTORICAL_TAXONOMY_SHA256))
        for period in (None, '2020-03-31', '2026-03-31', '2025-06-29'):
            self.assertEqual(worker.registered_taxonomy(period), (worker.OFFICIAL_TAXONOMY_PATH,
                             worker.EXPECTED_TAXONOMY_SHA256))

    def test_historical_bundle_and_child_digest_are_both_bound(self):
        payload = b"exact source bytes"
        digest = hashlib.sha256(payload).hexdigest()
        for installed, returned in (
            (worker.HISTORICAL_TAXONOMY_SHA256, worker.HISTORICAL_TAXONOMY_SHA256),
            (worker.EXPECTED_TAXONOMY_SHA256, worker.HISTORICAL_TAXONOMY_SHA256),
            (worker.HISTORICAL_TAXONOMY_SHA256, worker.EXPECTED_TAXONOMY_SHA256),
        ):
            with self.subTest(installed=installed, returned=returned), tempfile.TemporaryDirectory() as directory, _pair() as (client, server):
                Path(directory, '.archive-sha256').write_text(installed + "\n", encoding='ascii')
                request = {"format": "xbrl", "byteLength": len(payload), "sha256": digest,
                           "expectedEntity": "3526", "expectedPeriodEnd": "2025-06-30", "profile": "extended-official"}
                client.sendall(json.dumps(request).encode() + b"\n" + payload)
                child = Mock(return_value=Mock(returncode=0, stdout=json.dumps({
                    "taxonomySha256": returned, "runtimeVersion": worker.EXPECTED_ARELLE_VERSION,
                }).encode()))
                with patch.object(worker, "HISTORICAL_TAXONOMY_PATH", directory), patch.object(worker.subprocess, "run", child):
                    if installed != worker.HISTORICAL_TAXONOMY_SHA256:
                        with self.assertRaisesRegex(ValueError, "official_taxonomy_identity_mismatch"):
                            worker.serve(server)
                        child.assert_not_called()
                    elif returned != installed:
                        with self.assertRaisesRegex(ValueError, "parser_runtime_identity_mismatch"):
                            worker.serve(server)
                    else:
                        worker.serve(server)
                        self.assertEqual(json.loads(client.recv(1024))["taxonomySha256"], worker.HISTORICAL_TAXONOMY_SHA256)
                        self.assertEqual(child.call_args.args[0][8:12], ["--expected-entity", "3526", "--expected-period-end", "2025-06-30"])
                        self.assertIn(worker.HISTORICAL_TAXONOMY_SHA256, child.call_args.args[0])
                        self.assertEqual(child.call_args.kwargs["input"], payload)

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
