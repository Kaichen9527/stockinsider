"""Real Linux fcntl/memfd tests on <=64KiB public fixtures only."""
import errno
import fcntl
import importlib.util
import mmap
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

SOURCE = Path(__file__).resolve().parents[2] / 'deployment/staging/vnext/t17_keyfd/sealed_fixture.py'
spec = importlib.util.spec_from_file_location('sealed_fixture', SOURCE)
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)


# Public deterministic test-only bytes, matching the existing SI-BACKUP-1 GCM layout.
FIXTURE_KEY = b'\x71' * 32
FIXTURE_NONCE = b'\x02' * 12
FIXTURE_CONTEXT = b'\xaa' * 32
FIXTURE_HEADER = b'SI-BACKUP-1\n' + FIXTURE_NONCE + FIXTURE_CONTEXT

def envelope(plaintext):
    return FIXTURE_HEADER + AESGCM(FIXTURE_KEY).encrypt(FIXTURE_NONCE, plaintext, FIXTURE_HEADER)

def decrypt_fixture(ciphertext):
    if ciphertext[:len(FIXTURE_HEADER)] != FIXTURE_HEADER:
        raise ValueError('fixture_header_rejected')
    return AESGCM(FIXTURE_KEY).decrypt(FIXTURE_NONCE, ciphertext[len(FIXTURE_HEADER):], FIXTURE_HEADER)


class SealedFixtureTests(unittest.TestCase):
    def source(self, data=b'NONPRODUCTION_CIPHERTEXT'):
        f = tempfile.TemporaryFile()
        self.addCleanup(f.close)
        f.write(data)
        f.flush()
        return f, os.dup(f.fileno())

    def closed(self, fd):
        with self.assertRaises(OSError):
            os.fstat(fd)

    def test_real_seals_reject_alias_write_grow_shrink_and_writable_mmap(self):
        source, fd = self.source()
        with m.borrow_sealed_fixture_from_owned_fd(fd) as sealed:
            self.closed(fd)
            self.assertFalse(os.get_inheritable(sealed._fd))
            alias = os.dup(sealed._fd)
            try:
                self.assertEqual(fcntl.fcntl(alias, m.F_GET_SEALS), m.REQUIRED_SEALS)
                operations = [lambda: os.pwrite(alias, b'X', 0),
                              lambda: os.ftruncate(alias, 0),
                              lambda: os.ftruncate(alias, sealed.size + 1),
                              lambda: mmap.mmap(alias, sealed.size, access=mmap.ACCESS_WRITE),
                              lambda: fcntl.fcntl(alias, m.F_ADD_SEALS, 0x10)]
                for operation in operations:
                    with self.assertRaises(OSError) as error:
                        operation()
                    self.assertIn(error.exception.errno, (errno.EPERM, errno.EACCES))
                os.lseek(alias, sealed.size, os.SEEK_SET)
                self.assertEqual(sealed.read_at(0, sealed.size), b'NONPRODUCTION_CIPHERTEXT')
            finally:
                os.close(alias)
        self.closed(alias)

    def test_authentication_and_replay_use_same_snapshot_despite_source_and_path_swap(self):
        # Both complete GCM passes read the SAME kernel-sealed descriptor.
        plaintext = b'PUBLIC_NONPRODUCTION_PAYLOAD'
        fixture = envelope(plaintext)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'fixture'
            path.write_bytes(fixture)
            source = os.open(path, os.O_RDWR | os.O_CLOEXEC)
            try:
                with m.borrow_sealed_fixture_from_owned_fd(os.dup(source)) as sealed:
                    self.assertEqual(decrypt_fixture(sealed.read_at(0, sealed.size)), plaintext)
                    os.pwrite(source, b'X' * len(fixture), 0)
                    path.unlink()
                    path.write_bytes(b'UNAUTHENTICATED_REPLACEMENT')
                    # Sole plaintext consumer follows two completed GCM passes.
                    consumed = []
                    consumed.append(decrypt_fixture(sealed.read_at(0, sealed.size)))
                    self.assertEqual(consumed, [plaintext])
            finally:
                os.close(source)

    def test_tampered_fixture_never_reaches_authenticated_consumer(self):
        corrupted = bytearray(envelope(b'PUBLIC_NONPRODUCTION_PAYLOAD'))
        corrupted[-1] ^= 1
        _, fd = self.source(corrupted)
        calls = []
        with m.borrow_sealed_fixture_from_owned_fd(fd) as sealed:
            with self.assertRaises(InvalidTag):
                authenticated = decrypt_fixture(sealed.read_at(0, sealed.size))
                calls.append(authenticated)
        self.assertEqual(calls, [])

    def test_bounds_empty_and_oversize_close_source_before_consumer(self):
        for size in (0, m.MAX_CIPHERTEXT_BYTES + 1):
            _, fd = self.source(b'X' * size)
            with self.assertRaisesRegex(m.CiphertextCustodyRejected, 'size_rejected'):
                with m.borrow_sealed_fixture_from_owned_fd(fd):
                    self.fail('consumer_reached')
            self.closed(fd)
        _, fd = self.source(b'X' * m.MAX_CIPHERTEXT_BYTES)
        with m.borrow_sealed_fixture_from_owned_fd(fd) as sealed:
            self.assertEqual(len(sealed.read_at(0, sealed.size)), m.MAX_CIPHERTEXT_BYTES)

    def test_unsupported_kernel_rejects_without_fallback(self):
        _, fd = self.source()
        with patch.object(m.os, 'memfd_create', side_effect=OSError(errno.ENOSYS, 'private_error')):
            with self.assertRaisesRegex(m.CiphertextCustodyRejected, '^ciphertext_kernel_custody_unavailable$'):
                with m.borrow_sealed_fixture_from_owned_fd(fd):
                    self.fail('consumer_reached')
        self.closed(fd)

    def test_add_seal_noop_is_not_trusted(self):
        _, fd = self.source()
        real_fcntl = fcntl.fcntl
        def noop_add(fd, operation, *args):
            return 0 if operation == m.F_ADD_SEALS else real_fcntl(fd, operation, *args)
        with patch.object(m.fcntl, 'fcntl', side_effect=noop_add):
            with self.assertRaisesRegex(m.CiphertextCustodyRejected, '^ciphertext_seals_required$'):
                with m.borrow_sealed_fixture_from_owned_fd(fd):
                    self.fail('consumer_reached')
        self.closed(fd)

    def test_existing_shared_writable_mapping_blocks_sealing_and_closes_snapshot(self):
        _, fd = self.source(b'X' * mmap.PAGESIZE)
        created, maps = [], []
        real_create = os.memfd_create
        def mapped_create(*args):
            target = real_create(*args)
            created.append(target)
            os.ftruncate(target, mmap.PAGESIZE)
            maps.append(mmap.mmap(target, mmap.PAGESIZE, access=mmap.ACCESS_WRITE))
            return target
        try:
            with patch.object(m.os, 'memfd_create', side_effect=mapped_create):
                with self.assertRaises(m.CiphertextCustodyRejected):
                    with m.borrow_sealed_fixture_from_owned_fd(fd):
                        self.fail('consumer_reached')
            self.closed(fd)
            self.closed(created[0])
        finally:
            for mapping in maps:
                mapping.close()

    def test_consumer_error_and_abort_close_snapshot_and_invalidate_retained_reader(self):
        for error in (BrokenPipeError(), KeyboardInterrupt()):
            _, fd = self.source()
            with self.assertRaises(type(error)):
                with m.borrow_sealed_fixture_from_owned_fd(fd) as sealed:
                    retained = sealed
                    snapshot_fd = sealed._fd
                    raise error
            self.closed(snapshot_fd)
            with self.assertRaises(m.CiphertextCustodyRejected):
                retained.read_at(0, 1)

    def test_invalid_descriptors_and_ranges_rejected(self):
        for selector in (False, None, '3', -1, 0, 1, 2):
            with self.assertRaises(m.CiphertextCustodyRejected):
                with m.borrow_sealed_fixture_from_owned_fd(selector):
                    self.fail('consumer_reached')
        r, w = os.pipe()
        os.close(w)
        with self.assertRaises(m.CiphertextCustodyRejected):
            with m.borrow_sealed_fixture_from_owned_fd(r):
                self.fail('consumer_reached')
        self.closed(r)
        _, fd = self.source()
        with m.borrow_sealed_fixture_from_owned_fd(fd) as sealed:
            for offset, count in ((-1, 1), (0, -1), (0, 65537), (sealed.size, 1), (False, 1)):
                with self.assertRaises(m.CiphertextCustodyRejected):
                    sealed.read_at(offset, count)

    def test_failed_copy_closes_both_fds(self):
        _, fd = self.source()
        created = []
        real_create = os.memfd_create
        def remember(*args):
            target = real_create(*args)
            created.append(target)
            return target
        with patch.object(m.os, 'memfd_create', side_effect=remember):
            with patch.object(m.os, 'pread', side_effect=OSError(errno.EIO, 'private_error')):
                with self.assertRaises(m.CiphertextCustodyRejected):
                    with m.borrow_sealed_fixture_from_owned_fd(fd):
                        self.fail('consumer_reached')
        self.closed(fd)
        self.closed(created[0])


if __name__ == '__main__':
    unittest.main()
