"""Fixed root-to-DB staging descriptor handoff, no key reads or selectors.

Internal sender retains ownership of its six original capabilities. Receiver owns
the received copies and maps them only after collision-safe duplication. Real
runtime admission and FD-type/content validation remain in the fixed entry.
"""
import array
import fcntl
import grp
import os
import pwd
import socket
import stat
import struct
import sys
from .stage_credentials import receive_stage_fd

HANDOFF_PARENT='/run/stockinsider-t18'
HANDOFF_SOCKET=HANDOFF_PARENT+'/handoff'
IPC_GROUP='stockinsider-t18-ipc'
FIXED_EXEC=('/usr/bin/python3','-I','-B',
 '/readonly/t18-source/scripts/staging_restore_next_rollback.py',
 '--work-root','/run/t18-db-work')
FD_COUNT=6
INT_BYTES=array.array('i').itemsize
HANDOFF_SECONDS=45


class FdHandoffRejected(Exception):
    def __init__(self):super().__init__('fixed_t18_fd_handoff_rejected')


def _close(fds):
    for fd in set(fds):
        try:os.close(fd)
        except OSError:pass


def _six_open_fds(fds):
    if (type(fds) not in (tuple,list) or len(fds)!=FD_COUNT
        or any(type(fd) is not int or fd<0 for fd in fds) or len(set(fds))!=FD_COUNT):
        raise FdHandoffRejected()
    try:
        for fd in fds:os.fstat(fd)
    except OSError:raise FdHandoffRejected() from None
    return tuple(fds)


def _seqpacket(connection):
    if (not isinstance(connection,socket.socket)
        or connection.family!=socket.AF_UNIX
        or connection.getsockopt(socket.SOL_SOCKET,socket.SO_TYPE)!=socket.SOCK_SEQPACKET):
        raise FdHandoffRejected()
    connection.settimeout(HANDOFF_SECONDS)


def send_six_fds(connection,fds):
    """Root coordinator's private sender; no reading/logging any FD contents."""
    fds=_six_open_fds(fds);_seqpacket(connection)
    try:
        count=connection.sendmsg([b'V'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',fds))])
        if count!=1:raise FdHandoffRejected()
    except OSError:raise FdHandoffRejected() from None


def _received_fds(payload,ancillary,flags):
    # Collect ALL actual rights first so rejection cannot leak an earlier cmsg.
    received=[]
    for level,kind,data in ancillary:
        if level==socket.SOL_SOCKET and kind==socket.SCM_RIGHTS:
            values=array.array('i')
            values.frombytes(data[:len(data)//INT_BYTES*INT_BYTES])
            received.extend(values)
    try:
        if (payload!=b'V' or flags&(socket.MSG_CTRUNC|socket.MSG_TRUNC)
            or len(ancillary)!=1 or ancillary[0][0:2]!=(socket.SOL_SOCKET,socket.SCM_RIGHTS)
            or len(ancillary[0][2])!=FD_COUNT*INT_BYTES):raise FdHandoffRejected()
        result=_six_open_fds(received)
        for fd in result:
            if not fcntl.fcntl(fd,fcntl.F_GETFD)&fcntl.FD_CLOEXEC:raise FdHandoffRejected()
        return result
    except BaseException:
        _close(received)
        raise


def receive_six_fds(connection):
    """One bounded atomic record; owns received copies, rejects all truncation."""
    _seqpacket(connection)
    try:
        payload,ancillary,flags,_=connection.recvmsg(2,socket.CMSG_SPACE(FD_COUNT*INT_BYTES),socket.MSG_CMSG_CLOEXEC)
    except OSError:raise FdHandoffRejected() from None
    return _received_fds(payload,ancillary,flags)


def install_fixed_fds(fds):
    """Consume six owned descriptors, atomically prepare all dup sources first.

    Duplicate originals above19 BEFORE any dup2. Originals may occupy3..8, or
    cross another target slot; closing those numbers after mapping would destroy
    installed capabilities, so originals close before installing safe copies.
    """
    fds=_six_open_fds(fds);safe=[];installed=[]
    try:
        for fd in fds:safe.append(fcntl.fcntl(fd,fcntl.F_DUPFD_CLOEXEC,20))
        _close(fds)
        for target,source in zip(range(3,9),safe):
            os.dup2(source,target,inheritable=True);installed.append(target)
    except BaseException:
        _close(fds);_close(installed)
        raise FdHandoffRejected() from None
    finally:_close(safe)
    return tuple(range(3,9))


def _observe_fixed_endpoint():
    group=grp.getgrnam(IPC_GROUP).gr_gid
    parent=os.lstat(HANDOFF_PARENT);endpoint=os.lstat(HANDOFF_SOCKET)
    if (not stat.S_ISDIR(parent.st_mode) or parent.st_uid!=0 or parent.st_gid!=0
        or stat.S_IMODE(parent.st_mode)!=0o711 or not stat.S_ISSOCK(endpoint.st_mode)
        or endpoint.st_uid!=0 or endpoint.st_gid!=group or stat.S_IMODE(endpoint.st_mode)!=0o660):
        raise FdHandoffRejected()


def bootstrap_main():
    """No args. Authenticate fixed root socket, map FD3..8, exec exact entry."""
    fds=None;stage_fd=None
    try:
        if len(sys.argv)!=1 or os.getuid()==0 or os.geteuid()!=os.getuid() or pwd.getpwuid(os.getuid()).pw_name!='si-t18-db':
            raise FdHandoffRejected()
        _observe_fixed_endpoint()
        with socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET) as connection:
            connection.settimeout(HANDOFF_SECONDS);connection.connect(HANDOFF_SOCKET)
            _,uid,_=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
            if uid!=0:raise FdHandoffRejected()
            # Reobserve the fixed names after connection; live peer credentials
            # bind the accepted connection even if a pathname raced in between.
            _observe_fixed_endpoint()
            fds=receive_six_fds(connection)
            stage_fd=receive_stage_fd(connection)
        install_fixed_fds(fds);fds=None
        os.dup2(stage_fd,9,inheritable=True);os.close(stage_fd);stage_fd=None
        os.execve(FIXED_EXEC[0],list(FIXED_EXEC),{'PATH':'/usr/bin:/bin','LC_ALL':'C','PYTHONDONTWRITEBYTECODE':'1'})
    except BaseException:
        if fds is not None:_close(fds)
        if stage_fd is not None:_close([stage_fd])
        # A failed exec must close the installed capability set too.
        _close(range(3,10))
        return 2
