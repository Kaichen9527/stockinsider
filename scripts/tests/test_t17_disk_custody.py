"""Actual filesystem capability/refusal tests; never mock successful custody."""
import hashlib
import json
import os
from pathlib import Path
import tempfile
import unittest
from deployment.staging.vnext.t17_keyfd.disk_custody import (
    borrow_disk_snapshot, DiskCustodyRejected, _DiskSnapshot, CHUNK)
from deployment.staging.vnext.t17_keyfd.stream_fixture_gcm import (
    authenticate_then_replay, FixtureAuthenticationRejected)
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes


class DiskCustodyTests(unittest.TestCase):
    def test_real_32MiB_streamed_ciphertext_supported_or_explicit_refusal(self):
        # Larger than the complete memfd fixture allowance, generated O(CHUNK).
        # Real positive branch can execute on a separately provisioned fs-verity FS.
        parent = Path(__file__).resolve().parents[2] / 'work'
        parent.mkdir(exist_ok=True)
        with tempfile.TemporaryDirectory(prefix='public-disk-fixture-', dir=parent) as directory:
            root = Path(directory)
            os.chmod(root, 0o700)
            dfd = os.open(root, os.O_RDONLY | os.O_DIRECTORY | os.O_CLOEXEC)
            key, nonce, context = b'\x71' * 32, b'\x02' * 12, b'\xaa' * 32
            header = b'SI-BACKUP-1\n' + nonce + context
            encryptor = Cipher(algorithms.AES(key), modes.GCM(nonce)).encryptor()
            encryptor.authenticate_additional_data(header)
            digest = hashlib.sha256()
            with (root / 'source').open('wb') as f:
                f.write(header)
                for _ in range(32):
                    plaintext = b'P' * CHUNK
                    digest.update(plaintext)
                    f.write(encryptor.update(plaintext))
                f.write(encryptor.finalize())
                f.write(encryptor.tag)
            original_fd = os.open(root / 'source', os.O_RDWR | os.O_CLOEXEC)
            transferred = os.dup(original_fd)
            consumer_calls = []
            evidence = {'fixturePlaintextBytes':32 * CHUNK, 'maxCopyChunkBytes':CHUNK}
            try:
                try:
                    with borrow_disk_snapshot(transferred, dfd) as snapshot:
                        result = hashlib.sha256()
                        def consumer(chunk):
                            consumer_calls.append(len(chunk))
                            result.update(chunk)
                        authenticate_then_replay(snapshot, key, context, consumer)
                        self.assertEqual(result.hexdigest(), digest.hexdigest())
                        # Mutating the original source cannot change held custody.
                        os.pwrite(original_fd, b'X' * len(header), 0)
                        (root / 'source').unlink()
                        (root / 'source').write_bytes(b'UNAUTHENTICATED_REPLACEMENT')
                        again = hashlib.sha256()
                        authenticate_then_replay(snapshot, key, context, again.update)
                        self.assertEqual(again.hexdigest(), digest.hexdigest())
                        evidence['kernelCustody'] = 'VERIFIED'
                except DiskCustodyRejected as error:
                    # Missing fs capability is an EXPECTED REFUSAL, never success.
                    self.assertEqual(str(error), 'fsverity_enable_required')
                    self.assertIn(error.kernel_errno, (25, 95, 38, 1, 13))
                    self.assertEqual(consumer_calls, [])
                    evidence.update(kernelCustody='REFUSED',kernelErrno=error.kernel_errno)
                with self.assertRaises(OSError):
                    os.fstat(transferred)
                self.assertFalse(any(p.name.startswith('ciphertext-') for p in root.iterdir()))
                print('DISK_CUSTODY_EVIDENCE=' + json.dumps(evidence, sort_keys=True))
            finally:
                os.close(original_fd)
                os.close(dfd)

    def test_regular_file_cannot_forge_snapshot_with_metadata(self):
        with tempfile.TemporaryFile() as f:
            f.write(b'UNSEALED' * 100)
            f.flush()
            forged = _DiskSnapshot(f.fileno(), 800, b'X' * 32)
            calls = []
            with self.assertRaises(DiskCustodyRejected):
                authenticate_then_replay(forged, b'\x71' * 32, b'\xaa' * 32, calls.append)
            self.assertEqual(calls, [])

    def test_boolean_or_receipt_never_grants_authentication(self):
        for fake in (True, {'verified':True}, {'kernelCustody':'VERIFIED'}):
            with self.assertRaises(FixtureAuthenticationRejected):
                authenticate_then_replay(fake, b'\x71' * 32, b'\xaa' * 32, lambda _:self.fail('consumer'))

    def test_source_and_directory_validation_no_plain_path_fallback(self):
        with tempfile.TemporaryDirectory() as directory:
            os.chmod(directory, 0o755)
            dfd = os.open(directory, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with tempfile.TemporaryFile() as f:
                    transferred = os.dup(f.fileno())
                    with self.assertRaisesRegex(DiskCustodyRejected, 'private_directory_required'):
                        with borrow_disk_snapshot(transferred, dfd):
                            self.fail('consumer')
                    with self.assertRaises(OSError):os.fstat(transferred)
                for selector in (None, True, '3', -1, 0, 1, 2):
                    with self.assertRaises(DiskCustodyRejected):
                        with borrow_disk_snapshot(selector, dfd):self.fail('consumer')
            finally:os.close(dfd)


if __name__ == '__main__':
    unittest.main()
