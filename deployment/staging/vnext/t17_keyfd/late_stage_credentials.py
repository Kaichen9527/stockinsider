"""One post-restore fixed handoff over the original authenticated root channel.

FD10 is retained only by the controller, never a PG/Node child. FD9 initially
holds a sealed public marker; only root can replace it with signed material.
No receipt, caller flag, pathname, command or extra backup capability is accepted.
"""
import os
import socket
import select
import struct
import time
from . import stage_credentials as credentials

CHANNEL_FD=10
READY=b'J'
ROOT_PHASE_SECONDS=75
DB_PHASE_SECONDS=90
BOOTSTRAP_MARKER=b'PUBLIC_T18_POST_RESTORE_HANDOFF_ONLY'.ljust(103,b'.')


def create_root_bootstrap():
    if os.getuid()!=0 or os.geteuid()!=0:raise credentials.StageCredentialRejected('handoff')
    return credentials._seal_public_or_stage_bytes(BOOTSTRAP_MARKER)


def observe_root_channel():
    try:
        os.set_inheritable(CHANNEL_FD,False)
        with socket.socket(fileno=os.dup(CHANNEL_FD)) as channel:
            if (channel.family!=socket.AF_UNIX or channel.getsockopt(socket.SOL_SOCKET,socket.SO_TYPE)!=socket.SOCK_SEQPACKET
                or struct.unpack('3i',channel.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))[1]!=0):
                raise credentials.StageCredentialRejected('handoff')
    except (OSError,ValueError):raise credentials.StageCredentialRejected('handoff') from None


def receive_ready(channel):
    # Root calls only on the same connection whose DB pid/UID/cgroup it verified.
    data,rights,flags,_=channel.recvmsg(2,socket.CMSG_SPACE(4),socket.MSG_CMSG_CLOEXEC)
    owned=[]
    import array
    for level,kind,raw in rights:
        if (level,kind)==(socket.SOL_SOCKET,socket.SCM_RIGHTS):
            values=array.array('i');values.frombytes(raw[:len(raw)//values.itemsize*values.itemsize]);owned.extend(values)
    for fd in owned:os.close(fd)
    if data!=READY or rights or flags&(socket.MSG_TRUNC|socket.MSG_CTRUNC):
        raise credentials.StageCredentialRejected('handoff')
    if select.select([channel],[],[],0)[0]:raise credentials.StageCredentialRejected('handoff')


def request_fresh_stage():
    """Internal call only AFTER actual clone validation, roles and owned socket.

    This channel requests fresh reader material, never restore authority. Root
    repeats peer/isolation checks and the controller independently rebinds APP.
    """
    received=None
    credentials.observe_stage_fd();observe_root_channel()
    if os.pread(credentials.FD,len(BOOTSTRAP_MARKER)+1,0)!=BOOTSTRAP_MARKER:
        raise credentials.StageCredentialRejected('handoff')
    try:
        with socket.socket(fileno=os.dup(CHANNEL_FD)) as channel:
            deadline=time.monotonic()+DB_PHASE_SECONDS
            channel.settimeout(DB_PHASE_SECONDS)
            if channel.send(READY)!=1:raise credentials.StageCredentialRejected('handoff')
            remaining=deadline-time.monotonic()
            if remaining<=0:raise credentials.StageCredentialRejected('handoff')
            channel.settimeout(remaining)
            received=credentials.receive_stage_fd(channel)
            if time.monotonic()>=deadline:raise credentials.StageCredentialRejected('handoff')
        # Collision-safe source >=30; keep actual root/seal validation on FD9.
        os.dup2(received,credentials.FD,inheritable=False)
        os.close(received);received=None
        credentials.observe_stage_fd()
        return credentials.read_stage_credentials()
    except (OSError,ValueError):raise credentials.StageCredentialRejected('handoff') from None
    finally:
        if received is not None:os.close(received)
        os.close(CHANNEL_FD)
