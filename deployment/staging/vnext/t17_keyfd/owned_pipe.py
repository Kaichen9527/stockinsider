"""Unintegrated Linux key-FD primitive; no restore, backend or live authority.

Caller transfers exclusive ownership of an anonymous pipe read FD > 2. No
aliases/readers/FD reuse may race this function. Writer must send 32 binary bytes
and close ALL write aliases. The FD closes before exposing a borrowed view.
No CLI or key source discovery. Python cannot erase caller/consumer copies, swap
or crash dumps; the separately reviewed host must enforce those OS protections.
"""
from contextlib import contextmanager
import errno
import fcntl
import os
import select
import stat
import time

DEADLINE_SECONDS = 1.0


class KeyPipeRejected(Exception):
    """Fixed sanitized failure; never includes key bytes or OS paths."""


@contextmanager
def borrow_key_from_owned_pipe(fd):
    """Yield one borrowed 32-byte memoryview, wipe owned storage on all exits.

    Invalid noninteger/stdio selectors are rejected without closing anything.
    Every other selector is consumed/closed, including wrong descriptor types.
    Aborts (including BaseException) propagate after close and wipe. A consumer
    runs only after exact length AND EOF. This is not an auth or live grant.
    """
    if type(fd) is not int or fd <= 2:
        raise KeyPipeRejected('key_pipe_selector_rejected')
    storage = bytearray(33)
    try:
        try:
            metadata = os.fstat(fd)
            target = os.readlink('/proc/self/fd/' + str(fd))
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            if (not stat.S_ISFIFO(metadata.st_mode)
                    or metadata.st_uid != os.geteuid()
                    or not target.startswith('pipe:[')
                    or flags & os.O_ACCMODE != os.O_RDONLY):
                raise KeyPipeRejected('key_pipe_descriptor_rejected')
            os.set_inheritable(fd, False)
            os.set_blocking(fd, False)
            deadline = time.monotonic() + DEADLINE_SECONDS
            used = 0
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise KeyPipeRejected('key_pipe_deadline')
                readable, _, _ = select.select([fd], [], [], remaining)
                if not readable:
                    raise KeyPipeRejected('key_pipe_deadline')
                try:
                    # readv avoids allocating immutable Python bytes containing key.
                    count = os.readv(fd, [memoryview(storage)[used:]])
                except BlockingIOError:
                    continue
                except InterruptedError:
                    continue
                if count == 0:
                    if used != 32:
                        raise KeyPipeRejected('key_pipe_length')
                    break
                used += count
                if used > 32:
                    raise KeyPipeRejected('key_pipe_length')
        except (OSError, ValueError):
            raise KeyPipeRejected('key_pipe_io_rejected') from None
        finally:
            try:
                os.close(fd)
            except OSError as error:
                if error.errno != errno.EBADF:
                    raise KeyPipeRejected('key_pipe_close_rejected') from None
        yield memoryview(storage)[:32]
    finally:
        for index in range(len(storage)):
            storage[index] = 0
