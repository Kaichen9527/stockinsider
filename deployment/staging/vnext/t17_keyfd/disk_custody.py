"""Unintegrated Linux fs-verity ciphertext custody, never a live restore grant.

Disk streaming only, no memfd/chmod/path-scan fallback. Caller owns a private
scratch directory FD and transfers exclusive source FD ownership. Final sealed
bytes still require independent manifest provenance and GCM authentication.
"""
from contextlib import contextmanager
import errno
import fcntl
import os
import secrets
import stat
import struct
import time

CHUNK = 1024 * 1024
MAX_BYTES = 256 * 1024**3
COPY_SECONDS = 120
ENABLE_VERITY = 0x40806685  # Linux fsverity_enable_arg, 128 bytes
MEASURE_VERITY = 0xc0046686  # Linux fsverity_digest, 4-byte header
VERITY_BLOCK_BYTES = 4096


class DiskCustodyRejected(Exception):
    def __init__(self, code, kernel_errno=None):
        super().__init__(code)
        self.kernel_errno = kernel_errno  # sanitized numeric capability evidence


def _validate_block_geometry(page_bytes, filesystem_block_bytes):
    """Pure validation for tests; not an admission API or a caller override."""
    for observed in (page_bytes, filesystem_block_bytes):
        if type(observed) is not int or observed < 1024 or observed & (observed - 1):
            raise DiskCustodyRejected('fsverity_block_geometry_unverified')
    if VERITY_BLOCK_BYTES > min(page_bytes, filesystem_block_bytes):
        raise DiskCustodyRejected('fsverity_4096_block_incompatible')


def _enable_argument(fd):
    # Linux fs-verity requires a nonzero power-of-two block size. Do not assume
    # the kernel supplies a default for zero. Observe THIS held file's FS first.
    page_bytes = os.sysconf('SC_PAGESIZE')
    filesystem_block_bytes = os.fstatvfs(fd).f_bsize
    _validate_block_geometry(page_bytes, filesystem_block_bytes)
    return struct.pack('<IIIIQIIQ11Q', 1, 1, VERITY_BLOCK_BYTES,
                       0, 0, 0, 0, 0, *([0] * 11))


def _measure(fd):
    digest = bytearray(4 + 64)
    struct.pack_into('<HH', digest, 0, 0, 64)
    try:
        fcntl.ioctl(fd, MEASURE_VERITY, digest, True)
    except OSError as error:
        raise DiskCustodyRejected('fsverity_measure_required', error.errno) from None
    algorithm, length = struct.unpack_from('<HH', digest)
    if algorithm != 1 or length != 32:
        raise DiskCustodyRejected('fsverity_sha256_required')
    return bytes(digest[4:36])


class _DiskSnapshot:
    def __init__(self, fd, size, digest):
        self._fd, self.size, self._digest = fd, size, digest

    def chunks(self, start=0, length=None):
        if self._fd is None:
            raise DiskCustodyRejected('custody_closed')
        if length is None:
            length = self.size - start
        if (type(start) is not int or type(length) is not int or start < 0
                or length < 0 or start + length > self.size):
            raise DiskCustodyRejected('custody_range_rejected')
        if _measure(self._fd) != self._digest:
            raise DiskCustodyRejected('custody_identity_rejected')
        offset, end = start, start + length
        while offset < end:
            try:
                chunk = os.pread(self._fd, min(CHUNK, end - offset), offset)
            except OSError as error:
                raise DiskCustodyRejected('custody_read_rejected', error.errno) from None
            if not chunk:
                raise DiskCustodyRejected('custody_short_read')
            yield chunk
            offset += len(chunk)


@contextmanager
def borrow_disk_snapshot(source_fd, directory_fd):
    """Consume source; borrow dir; yield only after real fs-verity enforcement.

    A same-UID writable alias/mapping blocks ENABLE_VERITY; after enable the
    inode cannot be rewritten even by its owner. Directory replacement/unlink
    cannot replace the held inode. No authentication has occurred until yield.
    Calls must be supervised externally: synchronous filesystem IO can stall.
    """
    if type(source_fd) is not int or source_fd <= 2:
        raise DiskCustodyRejected('source_fd_rejected')
    writer = reader = None
    filename = None
    identity = None
    snapshot = None
    try:
        try:
            if type(directory_fd) is not int or directory_fd <= 2 or source_fd == directory_fd:
                raise DiskCustodyRejected('directory_fd_rejected')
            directory = os.fstat(directory_fd)
            if (not stat.S_ISDIR(directory.st_mode) or directory.st_uid != os.geteuid()
                    or stat.S_IMODE(directory.st_mode) != 0o700):
                raise DiskCustodyRejected('private_directory_required')
            if not stat.S_ISREG(os.fstat(source_fd).st_mode):
                raise DiskCustodyRejected('regular_source_required')
            os.set_inheritable(source_fd, False)
            filename = 'ciphertext-' + secrets.token_hex(16)
            writer = os.open(filename, os.O_CREAT | os.O_EXCL | os.O_RDWR
                             | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600, dir_fd=directory_fd)
            info = os.fstat(writer)
            identity = (info.st_dev, info.st_ino)
            deadline, size = time.monotonic() + COPY_SECONDS, 0
            while True:
                if time.monotonic() > deadline:
                    raise DiskCustodyRejected('copy_deadline')
                chunk = os.pread(source_fd, min(CHUNK, MAX_BYTES + 1 - size), size)
                if not chunk:
                    break
                if size + len(chunk) > MAX_BYTES:
                    raise DiskCustodyRejected('copy_size_limit')
                pending = memoryview(chunk)
                while pending:
                    count = os.write(writer, pending)
                    if count <= 0:
                        raise DiskCustodyRejected('copy_write_rejected')
                    pending = pending[count:]
                size += len(chunk)
            if not size:
                raise DiskCustodyRejected('empty_source_rejected')
            os.fsync(writer)
            # Initial read-handle acquisition BEFORE sealing/authentication;
            # never reopen the source and never reopen ANY path after this.
            reader = os.open(filename, os.O_RDONLY | os.O_CLOEXEC | os.O_NOFOLLOW,
                             dir_fd=directory_fd)
            info = os.fstat(reader)
            if (info.st_dev, info.st_ino) != identity or info.st_nlink != 1 or info.st_size != size:
                raise DiskCustodyRejected('copy_identity_rejected')
            os.close(writer)
            writer = None
            # version=1, SHA256, checked explicit4096 block, no salt/signature.
            argument = _enable_argument(reader)
            try:
                fcntl.ioctl(reader, ENABLE_VERITY, argument)
            except OSError as error:
                raise DiskCustodyRejected('fsverity_enable_required', error.errno) from None
            digest = _measure(reader)
            if os.fstat(reader).st_size != size:
                raise DiskCustodyRejected('sealed_size_changed')
            # File still has owner-write mode: failure must be kernel enforced,
            # not our chmod. A successful write-open means NO consumer is allowed.
            try:
                probe = os.open(filename, os.O_WRONLY | os.O_CLOEXEC | os.O_NOFOLLOW,
                                dir_fd=directory_fd)
            except OSError as error:
                if error.errno not in (errno.EPERM, errno.EACCES, errno.ETXTBSY):
                    raise DiskCustodyRejected('writer_exclusion_unverified', error.errno) from None
            else:
                os.close(probe)
                raise DiskCustodyRejected('writer_still_available')
            # Authentication and replay use reader only, not filename/digest JSON.
            snapshot = _DiskSnapshot(reader, size, digest)
        except OSError as error:
            raise DiskCustodyRejected('disk_custody_io_rejected', error.errno) from None
        finally:
            try:
                os.close(source_fd)
            except OSError:
                pass
        yield snapshot
    finally:
        if snapshot is not None:
            snapshot._fd = None
        for fd in (writer, reader):
            if fd is not None:
                os.close(fd)
        if filename is not None and identity is not None:
            try:
                entry = os.stat(filename, dir_fd=directory_fd, follow_symlinks=False)
                if (entry.st_dev, entry.st_ino) == identity:
                    os.unlink(filename, dir_fd=directory_fd)
            except FileNotFoundError:
                pass
