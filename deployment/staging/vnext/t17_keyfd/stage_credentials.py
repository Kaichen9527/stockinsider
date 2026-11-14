"""Fixed, ephemeral staging-reader material; never backup/restore authority.

JWT only goes to systemd LoadCredential. Its HMAC stays in a separately tagged,
root-owned sealed memfd delivered as FD9 to the already-restricted DB controller.
No payload path, environment, argv, receipt or arbitrary callback is accepted.
"""
import array
import base64
import fcntl
import hashlib
import hmac
import json
import os
import socket
import stat
import struct
import time
from .sealed_fixture import F_GET_SEALS,F_ADD_SEALS,REQUIRED_SEALS

FD=9
MAX_TOKEN=4096
MAX_MATERIAL=5+32+2+MAX_TOKEN
MAGIC=b'SI18\x01'
TOKEN_LIFETIME=900
MIN_REMAINING=300
LOADER_PARENT='/run/stockinsider-t18/credential-loader'
LOADER_SOCKET=LOADER_PARENT+'/credential.sock'
APP_CREDENTIALS='/run/credentials/stockinsider-t18-app.service'
APP_CREDENTIAL_NAME='postgrest-service-role.jwt'
ADMISSION_ONLY=b'PUBLIC_T18_ADMISSION_ONLY_NO_AUTHORITY'


class StageCredentialRejected(Exception):
    def __init__(self):super().__init__('fixed_stage_credential_rejected')


def _b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _exact_json(data):
    def pairs(items):
        result={}
        for key,value in items:
            if key in result:raise ValueError()
            result[key]=value
        return result
    return json.loads(data,object_pairs_hook=pairs,parse_constant=lambda _:(_ for _ in ()).throw(ValueError()))


def create_stage_jwt():
    secret=bytearray(os.urandom(32));now=int(time.time())
    header=_b64(b'{"alg":"HS256","typ":"JWT"}')
    claim=_b64(json.dumps({'role':'t18_reader','aud':'stockinsider-t18','iat':now,'exp':now+TOKEN_LIFETIME},separators=(',',':')).encode())
    signed=(header+'.'+claim).encode()
    return secret,signed.decode()+'.'+_b64(hmac.new(secret,signed,hashlib.sha256).digest())


def validate_stage_token(secret,token,minimum_remaining=MIN_REMAINING):
    """Internal validation of signed, exact15-minute, reader-only stage material."""
    try:
        if (len(secret)!=32 or type(token) is not str or not 64<=len(token)<=MAX_TOKEN
            or type(minimum_remaining) is not int or not 0<=minimum_remaining<=MIN_REMAINING):raise ValueError()
        parts=token.split('.')
        if len(parts)!=3:raise ValueError()
        header=_exact_json(base64.urlsafe_b64decode(parts[0]+'='*(-len(parts[0])%4)))
        claim=_exact_json(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
        now=int(time.time())
        signature=_b64(hmac.new(secret,(parts[0]+'.'+parts[1]).encode(),hashlib.sha256).digest())
        if (header!={'alg':'HS256','typ':'JWT'} or set(claim)!={'role','aud','iat','exp'}
            or claim['role']!='t18_reader' or claim['aud']!='stockinsider-t18'
            or type(claim['iat']) is not int or type(claim['exp']) is not int
            or claim['exp']-claim['iat']!=TOKEN_LIFETIME or claim['iat']>now+5
            or claim['exp']<=now or claim['exp']-now<minimum_remaining
            or not hmac.compare_digest(parts[2],signature)):raise ValueError()
        return claim['exp']
    except (ValueError,TypeError,UnicodeError,KeyError):raise StageCredentialRejected() from None


def _encode(secret,token):
    raw=token.encode('ascii');validate_stage_token(secret,token)
    return MAGIC+secret+struct.pack('!H',len(raw))+raw


def _decode(data):
    secret=None
    try:
        if not MAGIC==data[:5] or not 5+32+2+64<=len(data)<=MAX_MATERIAL:raise ValueError()
        size=struct.unpack('!H',data[37:39])[0]
        if len(data)!=39+size:raise ValueError()
        secret=bytearray(data[5:37]);token=data[39:].decode('ascii')
        validate_stage_token(secret,token)
        return secret,token
    except (ValueError,TypeError,UnicodeError,struct.error,StageCredentialRejected):
        if secret is not None:secret[:]=bytes(len(secret))
        raise StageCredentialRejected() from None


def _seal_public_or_stage_bytes(data):
    """Internal OS primitive; nonroot fixture use never mints root authority."""
    writable=readonly=None
    try:
        if not 0<len(data)<=MAX_MATERIAL:raise StageCredentialRejected()
        writable=os.memfd_create('t18-stage-reader',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
        if os.write(writable,data)!=len(data):raise StageCredentialRejected()
        os.fchmod(writable,0o400)
        fcntl.fcntl(writable,F_ADD_SEALS,REQUIRED_SEALS)
        readonly=os.open('/proc/self/fd/'+str(writable),os.O_RDONLY|os.O_CLOEXEC)
        return readonly
    except BaseException:
        if readonly is not None:os.close(readonly)
        raise
    finally:
        if writable is not None:os.close(writable)


def create_root_material():
    if os.getuid()!=0 or os.geteuid()!=0:raise StageCredentialRejected()
    secret,token=create_stage_jwt()
    try:return _seal_public_or_stage_bytes(_encode(secret,token)),token.encode('ascii')
    finally:secret[:]=bytes(len(secret))


def observe_stage_fd():
    try:
        info=os.fstat(FD)
        if (not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or info.st_nlink!=0
            or stat.S_IMODE(info.st_mode)!=0o400 or not 103<=info.st_size<=MAX_MATERIAL
            or fcntl.fcntl(FD,fcntl.F_GETFL)&os.O_ACCMODE!=os.O_RDONLY
            or fcntl.fcntl(FD,F_GET_SEALS)&REQUIRED_SEALS!=REQUIRED_SEALS):raise StageCredentialRejected()
        os.set_inheritable(FD,False)
    except (OSError,ValueError):raise StageCredentialRejected() from None


def read_stage_credentials():
    observe_stage_fd()
    try:return _decode(os.pread(FD,MAX_MATERIAL+1,0))
    except OSError:raise StageCredentialRejected() from None


def send_stage_fd(connection,fd):
    # A separate packet AFTER the unchanged V+six backup-capability packet.
    if connection.sendmsg([b'T'],[(socket.SOL_SOCKET,socket.SCM_RIGHTS,array.array('i',[fd]))])!=1:
        raise StageCredentialRejected()


def receive_stage_fd(connection):
    owned=[]
    try:
        value,rights,flags,_=connection.recvmsg(2,socket.CMSG_SPACE(array.array('i').itemsize),socket.MSG_CMSG_CLOEXEC)
        for level,kind,data in rights:
            if (level,kind)==(socket.SOL_SOCKET,socket.SCM_RIGHTS):
                values=array.array('i');values.frombytes(data[:len(data)//values.itemsize*values.itemsize]);owned.extend(values)
        if (value!=b'T' or flags&(socket.MSG_TRUNC|socket.MSG_CTRUNC) or len(rights)!=1
            or rights[0][:2]!=(socket.SOL_SOCKET,socket.SCM_RIGHTS) or len(owned)!=1
            or len(rights[0][2])!=array.array('i').itemsize
            or not fcntl.fcntl(owned[0],fcntl.F_GETFD)&fcntl.FD_CLOEXEC):raise StageCredentialRejected()
        # Protect stage FD before the original3..8 mapping closes received FDs.
        return fcntl.fcntl(owned[0],fcntl.F_DUPFD_CLOEXEC,30)
    except (OSError,ValueError):raise StageCredentialRejected() from None
    finally:
        for fd in owned:
            try:os.close(fd)
            except OSError:pass


def serve_credential_once(listener,payload):
    """Systemd credential-loader root peer only; exactly one bounded JWT+EOF."""
    if type(payload) is not bytes or not 1<=len(payload)<=MAX_TOKEN:raise StageCredentialRejected()
    connection,_=listener.accept()
    with connection:
        connection.settimeout(5)
        _,uid,_=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
        if uid!=0:raise StageCredentialRejected()
        connection.sendall(payload);connection.shutdown(socket.SHUT_WR)
