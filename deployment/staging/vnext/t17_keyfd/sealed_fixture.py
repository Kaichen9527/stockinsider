"""Linux-only bounded NONPRODUCTION ciphertext custody; not a restore adapter.

Copies <=64KiB from an exclusively owned regular-file FD into a kernel-sealed
memfd, then closes the source before exposing any reader. Authentication MUST
use this sealed snapshot before replay; snapshot creation authenticates nothing.
No pathname, caller readiness/metadata, filesystem fallback, or key is accepted.
This RAM-backed limit is NOT a large-backup custody implementation.
"""
from contextlib import contextmanager
import fcntl
import os
import stat

# Linux UAPI linux/fcntl.h (also works when Python lacks symbolic constants).
F_ADD_SEALS = 1033
F_GET_SEALS = 1034
F_SEAL_SEAL = 0x0001
F_SEAL_SHRINK = 0x0002
F_SEAL_GROW = 0x0004
F_SEAL_WRITE = 0x0008
REQUIRED_SEALS = F_SEAL_SEAL | F_SEAL_SHRINK | F_SEAL_GROW | F_SEAL_WRITE
MAX_CIPHERTEXT_BYTES = 64 * 1024
CHUNK_BYTES = 8192


class CiphertextCustodyRejected(Exception):
    """Fixed failure with no source path/bytes or raw kernel error text."""


class _BorrowedSealedFixture:
    def __init__(self, fd, size):
        self._fd = fd
        self.size = size

    def read_at(self, offset, count):
        # Metadata/objects are never accepted as proof: ask the kernel every read.
        if (self._fd is None or type(offset) is not int or type(count) is not int
                or offset < 0 or count < 0 or count > MAX_CIPHERTEXT_BYTES
                or offset > self.size or count > self.size - offset):
            raise CiphertextCustodyRejected('ciphertext_read_rejected')
        try:
            seals = fcntl.fcntl(self._fd, F_GET_SEALS)
            if seals & REQUIRED_SEALS != REQUIRED_SEALS:
                raise CiphertextCustodyRejected('ciphertext_seals_required')
            result = os.pread(self._fd, count, offset)
            if len(result) != count:
                raise CiphertextCustodyRejected('ciphertext_read_rejected')
            return result
        except OSError:
            raise CiphertextCustodyRejected('ciphertext_read_rejected') from None


@contextmanager
def borrow_sealed_fixture_from_owned_fd(source_fd):
    """Consume/close source FD >2; yield a lifetime-bounded sealed reader.

    Caller must serialize FD ownership/reuse. All ordinary integer selectors >2
    are consumed even when rejected; stdio/noninteger selectors are untouched.
    A source modified during copying is untrusted until the FINAL sealed bytes
    pass cryptographic authentication against independently trusted provenance.
    """
    if type(source_fd) is not int or source_fd <= 2:
        raise CiphertextCustodyRejected('ciphertext_selector_rejected')
    snapshot_fd = None
    reader = None
    try:
        try:
            if not stat.S_ISREG(os.fstat(source_fd).st_mode):
                raise CiphertextCustodyRejected('ciphertext_regular_fd_required')
            os.set_inheritable(source_fd, False)
            # No executable override or ordinary-file alternative on failure.
            snapshot_fd = os.memfd_create('stockinsider-public-fixture',
                                         os.MFD_CLOEXEC | os.MFD_ALLOW_SEALING)
            used = 0
            while True:
                chunk = os.pread(source_fd, min(CHUNK_BYTES, MAX_CIPHERTEXT_BYTES + 1 - used), used)
                if not chunk:
                    break
                if used + len(chunk) > MAX_CIPHERTEXT_BYTES:
                    raise CiphertextCustodyRejected('ciphertext_fixture_size_rejected')
                pending = memoryview(chunk)
                while pending:
                    written = os.write(snapshot_fd, pending)
                    if written <= 0:
                        raise CiphertextCustodyRejected('ciphertext_snapshot_rejected')
                    pending = pending[written:]
                used += len(chunk)
            if used == 0:
                raise CiphertextCustodyRejected('ciphertext_fixture_size_rejected')
            fcntl.fcntl(snapshot_fd, F_ADD_SEALS, REQUIRED_SEALS)
            if fcntl.fcntl(snapshot_fd, F_GET_SEALS) & REQUIRED_SEALS != REQUIRED_SEALS:
                raise CiphertextCustodyRejected('ciphertext_seals_required')
            if os.fstat(snapshot_fd).st_size != used:
                raise CiphertextCustodyRejected('ciphertext_snapshot_rejected')
        except (OSError, AttributeError, ValueError):
            raise CiphertextCustodyRejected('ciphertext_kernel_custody_unavailable') from None
        finally:
            try:
                os.close(source_fd)
            except OSError:
                pass
        reader = _BorrowedSealedFixture(snapshot_fd, used)
        yield reader
    finally:
        if reader is not None:
            reader._fd = None
        if snapshot_fd is not None:
            os.close(snapshot_fd)
