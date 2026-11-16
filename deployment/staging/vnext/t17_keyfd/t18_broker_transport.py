"""Fixed root-sealed AF_UNIX transport to the distinct nonroot T18 app broker.

No external socket/URL/FD, arbitrary argv/path or readiness assertion is accepted
by the runtime entry. Configuration secrets stay in this bounded IPC request,
never in an exception or a returned receipt. Caller-owned Python strings and
kernel socket buffers are outside any erasure claim.
"""
from contextlib import contextmanager
from dataclasses import dataclass,field
import base64
import grp
import json
import os
from pathlib import Path
import pwd
import re
import socket
import stat
import struct
import threading
import time
from .staging_admission import _mounts
from .t18_release_assets import LAUNCH_RELEASE_PINS, RELEASE_PINS

BROKER_ROOT='/run/t18-broker'
CONTROL_PATH=BROKER_ROOT+'/control.sock'
IPC_GROUP='stockinsider-t18-ipc'
DB_ACCESS_GROUP='stockinsider-t18-dbaccess'
BROKER_USERNAME='si-t18-app'
REST_ROOT='/run/t18-rest'
REST_USERNAME='si-t18-rest'
MAX_MESSAGE=16*1024
MAX_CONFIG=4096
SO_NETNS_COOKIE=71  # Linux SOL_SOCKET, actual kernel namespace identity
SHORT_REQUEST_SECONDS=15
START_REQUEST_SECONDS=60
OPS=frozenset(('HELLO','CONFIGURE','START_A','START_B','STOP_NEXT','FAULT_NEXT','SHUTDOWN'))
REST_OPS=frozenset(('HELLO','CONFIGURE','SHUTDOWN'))
COMMITS=frozenset(commit for commit,_ in (*RELEASE_PINS,*LAUNCH_RELEASE_PINS))
RESPONSE_FIELDS=frozenset(('op','status','sourceCommit','buildId','postgrestVersion',
                          'nextVersion','nextRunning','postgrestRunning','networkNamespaceCookie'))
STATUS={'HELLO':'READY','CONFIGURE':'CONFIGURED','START_A':'STARTED','START_B':'STARTED',
        'STOP_NEXT':'STOPPED','FAULT_NEXT':'FAULTED','SHUTDOWN':'CLOSED'}
FORBIDDEN_USERS=frozenset(('root','postgres','stockinsider','stockinsider_rehearsal',
                          'stockinsider_rehearsal_admin','si-vnext-oct22','admin','administrator'))


class BrokerTransportRejected(Exception):
    """Only fixed sanitized codes; never peer/system/request text."""


def _request_payload(op,fields):
    if type(op) is not str or op not in OPS:
        raise BrokerTransportRejected('broker_operation_rejected')
    expected={'stageJwt','hmacSecretB64'} if op=='CONFIGURE' else set()
    if set(fields)!=expected:
        raise BrokerTransportRejected('broker_request_fields_rejected')
    if op=='CONFIGURE':
        for value in fields.values():
            if type(value) is not str or not value or len(value)>MAX_CONFIG:
                raise BrokerTransportRejected('broker_configuration_rejected')
        if not re.fullmatch(r'[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+',fields['stageJwt']):
            raise BrokerTransportRejected('broker_configuration_rejected')
        try:
            decoded=base64.b64decode(fields['hmacSecretB64'],validate=True)
            if not 32<=len(decoded)<=MAX_CONFIG:
                raise ValueError()
        except (ValueError,TypeError):
            raise BrokerTransportRejected('broker_configuration_rejected') from None
    result=json.dumps({'op':op,**fields},separators=(',',':'),ensure_ascii=True).encode('ascii')
    if len(result)>MAX_MESSAGE:
        raise BrokerTransportRejected('broker_message_size_rejected')
    return result


def _response(data,op):
    def pairs(values):
        result={}
        for key,value in values:
            if key in result:raise ValueError()
            result[key]=value
        return result
    try:
        result=json.loads(data.decode('utf-8'),object_pairs_hook=pairs,
                          parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))
        if type(result) is not dict or set(result)!=RESPONSE_FIELDS or result['op']!=op:
            raise ValueError()
        if result['status'] not in (STATUS[op],'REJECTED'):
            raise ValueError()
        if result['sourceCommit'] is not None and result['sourceCommit'] not in COMMITS:
            raise ValueError()
        if result['buildId'] is not None and (type(result['buildId']) is not str
                or not re.fullmatch(r'[A-Za-z0-9_-]{1,256}',result['buildId'])):
            raise ValueError()
        if result['postgrestVersion'] not in (None,'16.3') or result['nextVersion'] not in (None,'16.3.4'):
            raise ValueError()
        if type(result['nextRunning']) is not bool or type(result['postgrestRunning']) is not bool:
            raise ValueError()
        if (type(result['networkNamespaceCookie']) is not int
                or not 1<=result['networkNamespaceCookie']<=2**64-1):
            raise ValueError()
    except (ValueError,UnicodeError,TypeError,KeyError,RecursionError):
        raise BrokerTransportRejected('broker_response_rejected') from None
    if result['status']=='REJECTED':
        raise BrokerTransportRejected('broker_operation_refused')
    return {key:result[key] for key in RESPONSE_FIELDS}


def _receive(sock,count):
    result=bytearray()
    while len(result)<count:
        chunk=sock.recv(count-len(result))
        if not chunk:raise BrokerTransportRejected('broker_truncated_message')
        result.extend(chunk)
    return result


def _exchange(sock,op,fields):
    payload=_request_payload(op,fields)
    timeout=START_REQUEST_SECONDS if op in ('CONFIGURE','START_A','START_B') else SHORT_REQUEST_SECONDS
    deadline=time.monotonic()+timeout
    expired=threading.Event()
    def abort():
        expired.set()
        try:sock.shutdown(socket.SHUT_RDWR)
        except OSError:pass
    # Per-recv timeouts alone do not bound a peer dripping bytes. Shut down the
    # socket at the absolute request deadline; broker EOF cleanup owns children.
    timer=threading.Timer(timeout,abort)
    timer.daemon=True
    timer.start()
    try:
        sock.settimeout(timeout)
        sock.sendall(struct.pack('!I',len(payload))+payload)
        length=struct.unpack('!I',_receive(sock,4))[0]
        if not 1<=length<=MAX_MESSAGE:
            raise BrokerTransportRejected('broker_message_size_rejected')
        result=_response(_receive(sock,length),op)
        if expired.is_set() or time.monotonic()>=deadline:
            raise BrokerTransportRejected('broker_ipc_deadline')
        return result
    except BrokerTransportRejected:
        if expired.is_set() or time.monotonic()>=deadline:
            raise BrokerTransportRejected('broker_ipc_deadline') from None
        raise
    except (OSError,ValueError,TypeError,struct.error):
        if expired.is_set() or time.monotonic()>=deadline:
            raise BrokerTransportRejected('broker_ipc_deadline') from None
        raise BrokerTransportRejected('broker_ipc_failed') from None
    finally:
        timer.cancel()


def _validate_peer_identity(uid,username,groups,ipc_gid,controller_uid):
    """Private pure helper; values MUST come from SO_PEERCRED/proc at runtime."""
    if (type(uid) is not int or uid<=0 or uid==controller_uid or uid==65534
            or type(username) is not str or not re.fullmatch(r'[a-z_][a-z0-9_-]{0,30}',username)
            or username in FORBIDDEN_USERS or 'admin' in username or 'postgres' in username
            or username.startswith('portable') or ipc_gid not in groups):
        raise BrokerTransportRejected('broker_peer_identity_rejected')


def _validate_group_profile(groups,db_gid,profile):
    """Pure predicate only; runtime groups come from actual primary+supp GIDs."""
    if profile=='app' and db_gid in groups or profile=='rest' and db_gid not in groups:
        raise BrokerTransportRejected('broker_database_group_profile_rejected')
    if profile not in ('app','rest'):
        raise BrokerTransportRejected('broker_profile_rejected')


def _observe_peer(sock,ipc_gid,db_gid,expected_user,profile):
    raw=sock.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,struct.calcsize('3i'))
    pid,uid,gid=struct.unpack('3i',raw)
    if pid<=0:raise BrokerTransportRejected('broker_peer_identity_rejected')
    user=pwd.getpwuid(uid).pw_name
    if user!=expected_user:
        raise BrokerTransportRejected('fixed_broker_username_required')
    # A metadata read only. Missing ProtectProc visibility fails closed; never
    # infer capabilities or groups from a name/account database or caller data.
    status=Path('/proc')/str(pid)/'status'
    observed=status.read_text()
    uids=re.search(r'^Uid:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$',observed,re.M)
    gids=re.search(r'^Gid:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$',observed,re.M)
    groups=re.search(r'^Groups:\s*([0-9 ]*)$',observed,re.M)
    if (uids is None or any(int(v)!=uid for v in uids.groups()) or gids is None
            or int(gids.group(2))!=gid or groups is None):
        raise BrokerTransportRejected('broker_peer_identity_rejected')
    for name in ('CapEff','CapPrm','CapAmb'):
        cap=re.search(r'^'+name+r':\s*([0-9a-fA-F]+)$',observed,re.M)
        if cap is None or int(cap.group(1),16):
            raise BrokerTransportRejected('broker_peer_capabilities_rejected')
    actual_groups={int(v) for v in groups.group(1).split()}|{gid}
    _validate_peer_identity(uid,user,actual_groups,ipc_gid,os.geteuid())
    # APP may not retain a real/saved/fs DB-access GID that it could regain
    # without capabilities. REST membership is current primary+supplementary.
    profile_groups=actual_groups|{int(v) for v in gids.groups()} if profile=='app' else actual_groups
    _validate_group_profile(profile_groups,db_gid,profile)
    return pid,uid,gid,user


def _observe_controller_capabilities():
    status=Path('/proc/self/status').read_text()
    for name in ('CapEff','CapPrm','CapAmb'):
        value=re.search(r'^'+name+r':\s*([0-9a-fA-F]+)$',status,re.M)
        if value is None or int(value.group(1),16):
            raise BrokerTransportRejected('capability_free_controller_required')


def observe_network_namespace_cookie():
    """Fresh unbound AF_INET socket: actual kernel identity, no network IO."""
    try:
        with socket.socket(socket.AF_INET,socket.SOCK_STREAM) as probe:
            raw=probe.getsockopt(socket.SOL_SOCKET,SO_NETNS_COOKIE,8)
            cookie=struct.unpack('=Q',raw)[0]
        if not 1<=cookie<=2**64-1:
            raise BrokerTransportRejected('network_namespace_cookie_unavailable')
        return cookie
    except (OSError,ValueError,struct.error):
        raise BrokerTransportRejected('network_namespace_cookie_unavailable') from None


def _require_namespace_cookie(observed,expected):
    if (type(observed) is not int or not 1<=observed<=2**64-1 or observed!=expected):
        raise BrokerTransportRejected('broker_network_namespace_mismatch')


def _observe_control_path(root):
    ipc_gid=grp.getgrnam(IPC_GROUP).gr_gid
    db_gid=grp.getgrnam(DB_ACCESS_GROUP).gr_gid
    controller_groups=set(os.getgroups())|{os.getegid()}
    if ipc_gid==db_gid or ipc_gid not in controller_groups or db_gid not in controller_groups:
        raise BrokerTransportRejected('controller_ipc_group_required')
    for path in ('/run',root):
        info=os.lstat(path)
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o7022
                or path==root and (stat.S_IMODE(info.st_mode)!=0o750 or info.st_gid!=ipc_gid)):
            raise BrokerTransportRejected('root_sealed_control_parent_required')
    control=root+'/control.sock'
    info=os.lstat(control)
    if (not stat.S_ISSOCK(info.st_mode) or info.st_uid!=0 or info.st_gid!=ipc_gid
            or stat.S_IMODE(info.st_mode)!=0o660):
        raise BrokerTransportRejected('root_sealed_control_socket_required')
    mounts=_mounts(Path('/proc/self/mountinfo').read_text())
    applicable=[row for row in mounts if control==row['mount'] or control.startswith(row['mount'].rstrip('/')+'/')]
    if not applicable:raise BrokerTransportRejected('readonly_control_mount_required')
    nearest=max(applicable,key=lambda row:len(row['mount']))
    if 'ro' not in nearest['options'] or any(value.startswith('shared:') for value in nearest['optional']):
        raise BrokerTransportRejected('readonly_control_mount_required')
    # Require a dedicated control-root or socket bind, not incidental root RO.
    if nearest['mount'] not in (root,control):
        raise BrokerTransportRejected('readonly_control_mount_required')
    return ipc_gid,db_gid,info


@dataclass(frozen=True)
class _ConnectedBroker:
    uid:int
    gid:int
    pid:int
    username:str
    _socket:object=field(repr=False,compare=False)
    _profile:str=field(repr=False,compare=False)
    _network_cookie:int=field(default=0,repr=False,compare=False)
    _lock:object=field(default_factory=threading.Lock,repr=False,compare=False)

    def request(self,op,**fields):
        allowed=OPS if self._profile=='app' else REST_OPS
        if type(op) is not str or op not in allowed:
            raise BrokerTransportRejected('broker_profile_operation_rejected')
        with self._lock:
            result=_exchange(self._socket,op,fields)
            _require_namespace_cookie(result['networkNamespaceCookie'],self._network_cookie)
            if self._profile=='app':
                if result['postgrestRunning'] or result['postgrestVersion'] is not None:
                    raise BrokerTransportRejected('broker_response_profile_rejected')
            elif (result['nextRunning'] or result['nextVersion'] is not None
                    or result['sourceCommit'] is not None or result['buildId'] is not None):
                raise BrokerTransportRejected('broker_response_profile_rejected')
            elif op=='CONFIGURE' and (not result['postgrestRunning'] or result['postgrestVersion']!='16.3'):
                raise BrokerTransportRejected('broker_response_profile_rejected')
            return result


@contextmanager
def _connect_profile(root,expected_user):
    """Private implementation accepts ONLY the two compiled profile pairs."""
    pairs={(BROKER_ROOT,BROKER_USERNAME):'app',(REST_ROOT,REST_USERNAME):'rest'}
    profile=pairs.get((root,expected_user))
    if profile is None:raise BrokerTransportRejected('broker_profile_rejected')
    sock=None
    try:
        if os.geteuid()==0:raise BrokerTransportRejected('nonroot_controller_required')
        _observe_controller_capabilities()
        ipc_gid,db_gid,before=_observe_control_path(root)
        sock=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        sock.settimeout(15)
        control=root+'/control.sock'
        sock.connect(control)
        after=os.lstat(control)
        if (before.st_dev,before.st_ino,before.st_mode,before.st_uid,before.st_gid)!=(after.st_dev,after.st_ino,after.st_mode,after.st_uid,after.st_gid):
            raise BrokerTransportRejected('control_socket_identity_changed')
        pid,uid,gid,user=_observe_peer(sock,ipc_gid,db_gid,expected_user,profile)
        # Broker HELLO supplies a fresh kernel AF_INET cookie from the pinned
        # peer process. Require equality BEFORE exposing CONFIGURE or secrets.
        cookie=observe_network_namespace_cookie()
        broker=_ConnectedBroker(uid,gid,pid,user,sock,profile,cookie)
        broker.request('HELLO')
        yield broker
    except BrokerTransportRejected:raise
    except (OSError,ValueError,KeyError,TypeError):
        raise BrokerTransportRejected('fixed_broker_unavailable') from None
    finally:
        if sock is not None:sock.close()


@contextmanager
def connect_fixed_app_broker():
    """Fixed Next UID, IPC group only; raw PG socket group is prohibited."""
    with _connect_profile(BROKER_ROOT,BROKER_USERNAME) as broker:yield broker


@contextmanager
def connect_fixed_rest_broker():
    """Fixed REST UID with actual DB-access+IPC groups; no Next operations."""
    with _connect_profile(REST_ROOT,REST_USERNAME) as broker:yield broker
