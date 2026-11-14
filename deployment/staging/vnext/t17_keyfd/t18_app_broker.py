"""Fixed separate-UID staging app broker. No caller command/path/URL selectors.

Host starts this reviewed source in the DB's PRIVATE network namespace under
si-t18-app, seals the fixed control socket root-owned, and supplies only fixed
RO assets plus private tmpfs scratch/credentials. Never run as the DB UID.
"""
import base64
import ctypes
import hashlib
import hmac
import http.client
import json
import os
from pathlib import Path
import pwd
import resource
import signal
import socket
import stat
import struct
import subprocess
import tempfile
import time
from .portable_sql_fixture_adapter import _tools
from .staging_admission import _namespace_and_privileges, _production_pg_inaccessible, _mounts
from .t18_release_assets import observe_fixed_release_assets, RELEASE_PINS
from .t18_broker_transport import observe_network_namespace_cookie

APP_USER='si-t18-app'
REST_USER='si-t18-rest'
CONTROL='/run/t18-broker/control.sock'
REST_CONTROL='/run/t18-rest/control.sock'
REST_WORK='/run/t18-rest-work'
WORK='/run/t18-app-work'
CREDENTIALS='/run/credentials/stockinsider-t18-app'
MAX_FRAME=16384
OPS=('HELLO','CONFIGURE','START_A','START_B','STOP_NEXT','FAULT_NEXT','SHUTDOWN')


class AppBrokerRejected(Exception):
    def __init__(self):super().__init__('fixed_app_broker_rejected')


def _b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def create_stage_jwt():
    """Fresh staging-only15-minute token; no formal credential input."""
    secret=bytearray(os.urandom(32));now=int(time.time())
    header=_b64(b'{"alg":"HS256","typ":"JWT"}')
    claim=_b64(json.dumps({'role':'t18_reader','aud':'stockinsider-t18','iat':now,'exp':now+900},separators=(',',':')).encode())
    signed=(header+'.'+claim).encode();token=signed.decode()+'.'+_b64(hmac.new(secret,signed,hashlib.sha256).digest())
    return secret,token


def _validate_config(value):
    if type(value) is not dict or set(value)!={'op','stageJwt','hmacSecretB64'} or value['op']!='CONFIGURE':raise AppBrokerRejected()
    token=value['stageJwt'];encoded=value['hmacSecretB64']
    if type(token) is not str or not 64<=len(token)<=4096 or type(encoded) is not str or len(encoded)>64:raise AppBrokerRejected()
    try:
        secret=bytearray(base64.b64decode(encoded,validate=True));parts=token.split('.')
        if len(secret)!=32 or len(parts)!=3:raise ValueError()
        header=json.loads(base64.urlsafe_b64decode(parts[0]+'='*(-len(parts[0])%4)))
        claim=json.loads(base64.urlsafe_b64decode(parts[1]+'='*(-len(parts[1])%4)))
        expected=_b64(hmac.new(secret,(parts[0]+'.'+parts[1]).encode(),hashlib.sha256).digest())
        now=int(time.time())
        if (header!={'alg':'HS256','typ':'JWT'} or set(claim)!={'role','aud','iat','exp'}
            or claim['role']!='t18_reader' or claim['aud']!='stockinsider-t18'
            or type(claim['iat']) is not int or type(claim['exp']) is not int
            or not now-30<=claim['iat']<=now+5 or not now<claim['exp']<=now+900
            or not hmac.compare_digest(parts[2],expected)):raise ValueError()
        return secret,token
    except (ValueError,TypeError,UnicodeError):raise AppBrokerRejected() from None


def _recv_frame(connection):
    def take(size):
        data=bytearray()
        while len(data)<size:
            part=connection.recv(size-len(data))
            if not part:raise AppBrokerRejected()
            data.extend(part)
        return bytes(data)
    size=struct.unpack('!I',take(4))[0]
    if not 1<=size<=MAX_FRAME:raise AppBrokerRejected()
    try:
        def exact_pairs(pairs):
            result={}
            for k,v in pairs:
                if k in result:raise ValueError()
                result[k]=v
            return result
        value=json.loads(take(size),object_pairs_hook=exact_pairs)
    except (ValueError,UnicodeError):raise AppBrokerRejected() from None
    if type(value) is not dict or value.get('op') not in OPS:raise AppBrokerRejected()
    if value['op']!='CONFIGURE' and set(value)!={'op'}:raise AppBrokerRejected()
    return value


def _send_frame(connection,value):
    data=json.dumps(value,separators=(',',':')).encode()
    if len(data)>MAX_FRAME:raise AppBrokerRejected()
    connection.sendall(struct.pack('!I',len(data))+data)


def _child_limits():
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    resource.setrlimit(resource.RLIMIT_CPU,(180,180))
    resource.setrlimit(resource.RLIMIT_FSIZE,(16*1024**2,16*1024**2))
    resource.setrlimit(resource.RLIMIT_NOFILE,(128,128))
    os.setsid()


def _observe_app_runtime(expected_user):
    _namespace_and_privileges();_production_pg_inaccessible()
    if expected_user not in (APP_USER,REST_USER) or pwd.getpwuid(os.getuid()).pw_name!=expected_user:raise AppBrokerRejected()
    import grp
    dbaccess=grp.getgrnam('stockinsider-t18-dbaccess').gr_gid
    groups=set(os.getgroups())|{os.getegid()}
    if (dbaccess in groups)!=(expected_user==REST_USER):raise AppBrokerRejected()
    libc=ctypes.CDLL(None,use_errno=True)
    if libc.prctl(4,0,0,0,0)!=0 or libc.prctl(38,1,0,0,0)!=0:raise AppBrokerRejected()
    if os.access('/run/t18-db-work',os.X_OK):raise AppBrokerRejected()
    mounts=_mounts(Path('/proc/self/mountinfo').read_text())
    for fixed in ((WORK,CREDENTIALS) if expected_user==APP_USER else (REST_WORK,)):
        info=os.lstat(fixed)
        exact=[m for m in mounts if m['mount']==fixed]
        if (not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o700
            or len(exact)!=1 or exact[0]['filesystem']!='tmpfs'
            or any(x.startswith('shared:') for x in exact[0]['optional'])
            or os.statvfs(fixed).f_blocks*os.statvfs(fixed).f_frsize>256*1024**2):raise AppBrokerRejected()
    cg=Path('/proc/self/cgroup').read_text().strip().split('0::')[-1]
    if not cg.startswith('/') or '..' in Path(cg).parts:raise AppBrokerRejected()
    cgroot=Path('/sys/fs/cgroup')/cg.lstrip('/')
    maximum=(cgroot/'memory.max').read_text().strip()
    if not maximum.isdecimal() or not 0<int(maximum)<=512*1024**2 or (cgroot/'memory.swap.max').read_text().strip()!='0':raise AppBrokerRejected()
    tasks=(cgroot/'pids.max').read_text().strip()
    if not tasks.isdecimal() or not 1<=int(tasks)<=64:raise AppBrokerRejected()


class _FixedChildren:
    """Internal fixed operation state; assets are already observed/held."""
    def __init__(self,assets):
        self.namespace_cookie=observe_network_namespace_cookie()
        self.role=pwd.getpwuid(os.getuid()).pw_name
        if self.role not in (APP_USER,REST_USER):raise AppBrokerRejected()
        self.work=WORK if self.role==APP_USER else REST_WORK
        self.assets=assets;self.pg,_=_tools();self.node=Path(assets.node_path);self.next=None;self.postgrest=None
        self.logs=[];self.token=None;self.release=None;self.configured=False;self.configfd=None
        version=subprocess.run([str(self.node),'--version'],env={'PATH':'/usr/bin:/bin','LC_ALL':'C'},capture_output=True,timeout=5)
        if version.returncode or version.stdout.strip()!=b'v22.23.1':raise AppBrokerRejected()
    def response(self,op,status):
        return {'op':op,'status':status,'networkNamespaceCookie':self.namespace_cookie,'sourceCommit':None if self.release is None else self.release['sourceCommit'],
            'buildId':None if self.release is None else self.release['buildId'],
            'postgrestVersion':'16.3' if self.configured and self.role==REST_USER else None,'nextVersion':'16.3.4' if self.release else None,
            'nextRunning':self.next is not None and self.next.poll() is None,
            'postgrestRunning':self.postgrest is not None and self.postgrest.poll() is None}
    def _env(self):
        return {'PATH':'/usr/bin:/bin','HOME':self.work,'TMPDIR':self.work,'LC_ALL':'C','NODE_ENV':'production',
            'NEXT_TELEMETRY_DISABLED':'1','HOSTNAME':'127.0.0.1','PORT':'3000'}
    def _spawn(self,argv,env,pass_fds=()):
        log=tempfile.TemporaryFile(dir=self.work);self.logs.append(log)
        return subprocess.Popen(argv,env=env,cwd=self.work,stdin=subprocess.DEVNULL,stdout=log,stderr=log,
            close_fds=True,pass_fds=pass_fds,preexec_fn=_child_limits)
    def _psql(self,username,query,expect):
        env=self._env();env.update(PGHOST='/run/t18-pg',PGPORT='6551',PGUSER=username,PGDATABASE='t17_restored',
            PGPASSFILE='/dev/null',PGSERVICEFILE='/dev/null',PGCONNECT_TIMEOUT='2',PGOPTIONS='-c statement_timeout=2000 -c lock_timeout=1000')
        result=subprocess.run([str(self.pg/'psql'),'-X','-q','-A','-t','-v','ON_ERROR_STOP=1'],input=query,
            env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=5,close_fds=True)
        if (result.returncode==0)!=expect:raise AppBrokerRejected()
    def configure(self,request):
        if self.configured:raise AppBrokerRejected()
        secret,token=_validate_config(request)
        try:
            if self.role==APP_USER:
                if os.access('/run/t18-pg',os.X_OK):raise AppBrokerRejected()
                credential=Path(CREDENTIALS)/'postgrest-service-role.jwt'
                fd=os.open(credential,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW|os.O_CLOEXEC,0o400)
                try:os.write(fd,token.encode())
                finally:os.close(fd)
                self.token=token;self.configured=True
                return
            self._psql('t18_authenticator',b'SET ROLE t18_reader; SELECT count(*) FROM public.radar_public_snapshots;',True)
            for denied in ('si-t18-db','postgres','stockinsider','service_role'):
                self._psql(denied,b'SELECT 1;',False)
            for denied_sql in (b'SET ROLE service_role; SELECT 1;',
                b'BEGIN; SET LOCAL ROLE t18_reader; SET TRANSACTION READ WRITE; DELETE FROM public.radar_public_snapshots WHERE false; ROLLBACK;',
                b'BEGIN; SET LOCAL ROLE t18_reader; CREATE TABLE public.t18_should_not_exist(x int); ROLLBACK;'):
                self._psql('t18_authenticator',denied_sql,False)
            version=subprocess.run([self.assets.postgrest_path,'--version'],env=self._env(),capture_output=True,timeout=5)
            if version.returncode or not version.stdout.decode('ascii','ignore').strip().startswith('PostgREST 16.3'):raise AppBrokerRejected()
            config=('db-uri = "postgresql://t18_authenticator@/t17_restored?host=/run/t18-pg&port=6551"\n'
                'db-schemas = "public"\ndb-pool = 2\ndb-pool-acquisition-timeout = 3\n'
                'db-max-rows = 1\nopenapi-mode = "disabled"\nserver-host = "127.0.0.1"\nserver-port = 3301\n'
                'db-tx-end = "rollback"\njwt-aud = "stockinsider-t18"\n')
            # PostgREST accepts a base64 secret when the explicit option is set;
            # config is a sealed memfd, never a key/config pathname on disk.
            config=config+ 'jwt-secret-is-base64 = true\njwt-secret = "'+base64.b64encode(secret).decode()+'"\n'
            import fcntl
            self.configfd=os.memfd_create('t18-postgrest-config',os.MFD_CLOEXEC|os.MFD_ALLOW_SEALING)
            os.write(self.configfd,config.encode());os.lseek(self.configfd,0,os.SEEK_SET)
            fcntl.fcntl(self.configfd,fcntl.F_ADD_SEALS,fcntl.F_SEAL_WRITE|fcntl.F_SEAL_GROW|fcntl.F_SEAL_SHRINK|fcntl.F_SEAL_SEAL)
            env=self._env();env['GHCRTS']='-M128m -N1'
            self.postgrest=self._spawn([self.assets.postgrest_path,'/proc/self/fd/'+str(self.configfd)],env,(self.configfd,))
            self.token=token
            for _ in range(60):
                if self.postgrest.poll() is not None:raise AppBrokerRejected()
                conn=http.client.HTTPConnection('127.0.0.1',3301,timeout=.4)
                try:
                    conn.request('GET','/radar_publication_state?select=status&limit=1',headers={'Authorization':'Bearer '+token})
                    response=conn.getresponse();response.read(4096)
                    if response.status==200:break
                except OSError:pass
                finally:conn.close()
                time.sleep(.1)
            else:raise AppBrokerRejected()
            self.configured=True
        finally:
            for i in range(len(secret)):secret[i]=0
    def _require_no_children(self):
        cg=Path('/proc/self/cgroup').read_text().strip().split('0::')[-1]
        if not cg.startswith('/') or '..' in Path(cg).parts:raise AppBrokerRejected()
        for _ in range(20):
            procs=(Path('/sys/fs/cgroup')/cg.lstrip('/')/'cgroup.procs').read_text().split()
            if all(int(pid)==os.getpid() for pid in procs):return
            time.sleep(.05)
        raise AppBrokerRejected()

    def stop_next(self,kill=False):
        if self.next:
            try:os.killpg(self.next.pid,signal.SIGKILL if kill else signal.SIGTERM)
            except ProcessLookupError:pass
            try:self.next.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:os.killpg(self.next.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                self.next.wait(timeout=3)
            try:os.killpg(self.next.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            self.next=None
        if self.role==APP_USER:self._require_no_children()
    def start(self,index):
        if not self.configured or self.role!=APP_USER:raise AppBrokerRejected()
        self.stop_next();self.release=self.assets.releases[index]
        env=self._env();env.update(STOCKINSIDER_DATA_PLANE='contabo',STOCKINSIDER_POSTGREST_URL='http://127.0.0.1:3302/',
            STOCKINSIDER_BACKEND_ID='00000000-0000-4000-8000-000000000018',
            OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID='00000000-0000-4000-8000-000000000019',
            STOCKINSIDER_WRITER_RELEASE_ID=self.release['sourceCommit'],CREDENTIALS_DIRECTORY=CREDENTIALS,
            STOCKINSIDER_POSTGREST_JWT_SHA256=hashlib.sha256(self.token.encode()).hexdigest(),
            RADAR_PUBLIC_SNAPSHOTS_ENABLED='enabled')
        self.next=self._spawn([str(self.node),'--max-old-space-size=256',self.release['serverPath']],env)
    def close(self):
        self.stop_next()
        if self.postgrest:
            try:os.killpg(self.postgrest.pid,signal.SIGTERM)
            except ProcessLookupError:pass
            try:self.postgrest.wait(timeout=5)
            except subprocess.TimeoutExpired:
                try:os.killpg(self.postgrest.pid,signal.SIGKILL)
                except ProcessLookupError:pass
                self.postgrest.wait(timeout=3)
            try:os.killpg(self.postgrest.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            self.postgrest=None
        if self.configfd is not None:os.close(self.configfd);self.configfd=None
        if self.role==APP_USER:
            try:(Path(CREDENTIALS)/'postgrest-service-role.jwt').unlink()
            except FileNotFoundError:pass
        self.token=None
        for log in self.logs:log.close()
        self.logs=[]
        self._require_no_children()


def _serve_fixed_broker(expected_user):
    _observe_app_runtime(expected_user)
    control=CONTROL if expected_user==APP_USER else REST_CONTROL
    if os.path.lexists(control):raise AppBrokerRejected()
    listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);listener.settimeout(1100)
    deadline=time.monotonic()+1100;children=None
    try:
        listener.bind(control);listener.listen(1)
        with observe_fixed_release_assets() as assets:
            children=_FixedChildren(assets)
            connection,_=listener.accept();listener.close();connection.settimeout(1100)
            with connection:
                pid,uid,gid=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
                if uid==0 or uid==os.getuid() or pwd.getpwuid(uid).pw_name!='si-t18-db':raise AppBrokerRejected()
                while time.monotonic()<deadline:
                    value=_recv_frame(connection);op=value['op']
                    if expected_user==REST_USER and op not in ('HELLO','CONFIGURE','SHUTDOWN'):raise AppBrokerRejected()
                    try:
                        if op=='CONFIGURE':children.configure(value);status='CONFIGURED'
                        elif op in ('START_A','START_B'):children.start(0 if op=='START_A' else 1);status='STARTED'
                        elif op=='STOP_NEXT':children.stop_next();status='STOPPED'
                        elif op=='FAULT_NEXT':children.stop_next(kill=True);status='FAULTED'
                        elif op=='SHUTDOWN':children.close();status='CLOSED'
                        else:status='READY'
                    except Exception:
                        children.close();_send_frame(connection,children.response(op,'REJECTED'));raise AppBrokerRejected() from None
                    _send_frame(connection,children.response(op,status))
                    if op=='SHUTDOWN':return
                raise AppBrokerRejected()
    finally:
        if children:children.close()
        listener.close()


def _main(expected_user):
    resource.setrlimit(resource.RLIMIT_CORE,(0,0))
    def stop(*_):
        signal.alarm(0)
        for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,signal.SIG_IGN)
        raise TimeoutError()
    for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,stop)
    signal.alarm(1200)
    try:_serve_fixed_broker(expected_user);return 0
    except BaseException:return 2
    finally:signal.alarm(0)


def main():return _main(APP_USER)

def rest_main():return _main(REST_USER)
