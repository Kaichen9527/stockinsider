"""Fixed separate-UID staging app broker. No caller command/path/URL selectors.

Host starts this reviewed source in the DB's PRIVATE network namespace under
si-t18-app, seals the fixed control socket root-owned, and supplies only fixed
RO assets plus private tmpfs scratch/credentials. Never run as the DB UID.
"""
import base64
from contextlib import contextmanager,ExitStack
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
from .staging_admission import _namespace_and_privileges, _production_pg_inaccessible, _mounts, StagingAdmissionRejected
from .t18_host_plan import BROKER_REFUSAL_TAGS,broker_refusal_bytes
from .stage_credentials import APP_CREDENTIALS,APP_CREDENTIAL_NAME,MAX_TOKEN,create_stage_jwt,validate_stage_token,StageCredentialRejected
from .t18_release_assets import observe_fixed_release_assets, RELEASE_PINS,is_launch_release_pair
from .t18_broker_transport import observe_network_namespace_cookie

APP_USER='si-t18-app'
REST_USER='si-t18-rest'
CONTROL='/run/t18-broker/control.sock'
REST_CONTROL='/run/t18-rest/control.sock'
REST_WORK='/run/t18-rest-work'
WORK='/run/t18-app-work'
CREDENTIALS=APP_CREDENTIALS
MAX_FRAME=16384
OPS=('HELLO','CONFIGURE','START_A','START_B','STOP_NEXT','FAULT_NEXT','SHUTDOWN')


class AppBrokerRejected(Exception):
    def __init__(self):super().__init__('fixed_app_broker_rejected')


class _StartupRejected(AppBrokerRejected):
    def __init__(self,tag):
        super().__init__()
        self.tag=tag if type(tag) is str and tag in BROKER_REFUSAL_TAGS else 'runtime_or_cleanup'


@contextmanager
def _startup_check(tag):
    """Preserve all checks, project failures to compiled labels only."""
    try:yield
    except _StartupRejected:raise
    except BaseException as error:
        if tag=='namespace_observation' and isinstance(error,StagingAdmissionRejected):
            known={'nonroot_required':'namespace_nonroot','capability_free_required':'namespace_capabilities',
              'network_interface_observation_invalid':'namespace_interfaces_invalid',
              'network_interface_observation_unavailable':'namespace_interfaces_unavailable',
              'private_loopback_network_required':'namespace_not_loopback',
              'independent_network_namespace_required':'namespace_not_independent'}
            if len(error.args)==1 and type(error.args[0]) is str:tag=known.get(error.args[0],tag)
        raise _StartupRejected(tag) from None


def _b64(data):return base64.urlsafe_b64encode(data).rstrip(b'=').decode('ascii')


def _validate_config(value):
    if type(value) is not dict or set(value)!={'op','stageJwt','hmacSecretB64'} or value['op']!='CONFIGURE':raise AppBrokerRejected()
    token=value['stageJwt'];encoded=value['hmacSecretB64']
    if type(token) is not str or not 64<=len(token)<=4096 or type(encoded) is not str or len(encoded)>64:raise AppBrokerRejected()
    secret=None
    try:
        secret=bytearray(base64.b64decode(encoded,validate=True))
        validate_stage_token(secret,token)
        return secret,token
    except (ValueError,TypeError,UnicodeError,StageCredentialRejected):
        if secret is not None:secret[:]=bytes(len(secret))
        raise AppBrokerRejected() from None


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
    with _startup_check('namespace_observation'):_namespace_and_privileges()
    with _startup_check('production_pg_paths'):_production_pg_inaccessible()
    with _startup_check('broker_identity'):
        if expected_user not in (APP_USER,REST_USER) or pwd.getpwuid(os.getuid()).pw_name!=expected_user:raise AppBrokerRejected()
    import grp
    with _startup_check('broker_group_lookup'):dbaccess=grp.getgrnam('stockinsider-t18-dbaccess').gr_gid
    with _startup_check('broker_group_membership'):
        groups=set(os.getgroups())|{os.getegid()}
        if (dbaccess in groups)!=(expected_user==REST_USER):raise AppBrokerRejected()
    with _startup_check('prctl_library'):libc=ctypes.CDLL(None,use_errno=True)
    with _startup_check('prctl_dumpable'):
        if libc.prctl(4,0,0,0,0)!=0:raise AppBrokerRejected()
    with _startup_check('prctl_no_new_privileges'):
        if libc.prctl(38,1,0,0,0)!=0:raise AppBrokerRejected()
    with _startup_check('db_work_inaccessible'):
        if os.access('/run/t18-db-work',os.X_OK):raise AppBrokerRejected()
    with _startup_check('mount_observation'):mounts=_mounts(Path('/proc/self/mountinfo').read_text())
    for fixed in ((WORK,) if expected_user==APP_USER else (REST_WORK,)):
        tag={WORK:'app_work_tmpfs',REST_WORK:'rest_work_tmpfs'}[fixed]
        with _startup_check(tag):
            info=os.lstat(fixed)
            exact=[m for m in mounts if m['mount']==fixed]
            if (not stat.S_ISDIR(info.st_mode) or info.st_uid!=os.getuid() or stat.S_IMODE(info.st_mode)!=0o700
                or len(exact)!=1 or exact[0]['filesystem']!='tmpfs'
                or any(x.startswith('shared:') for x in exact[0]['optional'])
                or os.statvfs(fixed).f_blocks*os.statvfs(fixed).f_frsize>256*1024**2):raise AppBrokerRejected()
    if expected_user==APP_USER:
        with _startup_check('credential_tmpfs'):_observe_systemd_credential(mounts)
    with _startup_check('cgroup_path'):
        cg=Path('/proc/self/cgroup').read_text().strip().split('0::')[-1]
        if not cg.startswith('/') or '..' in Path(cg).parts:raise AppBrokerRejected()
        cgroot=Path('/sys/fs/cgroup')/cg.lstrip('/')
    with _startup_check('cgroup_memory'):
        maximum=(cgroot/'memory.max').read_text().strip()
        if not maximum.isdecimal() or not 0<int(maximum)<=512*1024**2:raise AppBrokerRejected()
    with _startup_check('cgroup_swap'):
        if (cgroot/'memory.swap.max').read_text().strip()!='0':raise AppBrokerRejected()
    with _startup_check('cgroup_tasks'):
        tasks=(cgroot/'pids.max').read_text().strip()
        if not tasks.isdecimal() or not 1<=int(tasks)<=64:raise AppBrokerRejected()


def _credential_acl(data,uid,permissions):
    """Actual Linux POSIX ACL, not mode-mask inference or a caller permission bit."""
    if not 4<=len(data)<=128 or (len(data)-4)%8 or struct.unpack('<I',data[:4])[0]!=2:raise AppBrokerRejected()
    entries={}
    for offset in range(4,len(data),8):
        tag,perms,identity=struct.unpack('<HHI',data[offset:offset+8])
        if (tag,identity) in entries or perms&~7:raise AppBrokerRejected()
        entries[tag,identity]=perms
    base=0xffffffff
    required={(1,base):permissions,(2,uid):permissions,(16,base):permissions,(32,base):0}
    if (set(entries)!=set(required)|{(4,base)} or any(entries.get(k)!=v for k,v in required.items())
        or entries[4,base]!=0):raise AppBrokerRejected()


def _observe_systemd_credential(mounts):
    directory=credential=None
    try:
        if os.environ.get('CREDENTIALS_DIRECTORY')!=CREDENTIALS:raise AppBrokerRejected()
        directory=os.open(CREDENTIALS,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW|os.O_CLOEXEC)
        info=os.fstat(directory);fs=os.fstatvfs(directory)
        exact=[m for m in mounts if m['mount']==CREDENTIALS]
        if (not stat.S_ISDIR(info.st_mode) or (info.st_uid,info.st_gid)!=(0,0)
            or stat.S_IMODE(info.st_mode)!=0o550 or len(exact)!=1 or exact[0]['filesystem']!='tmpfs'
            or not {'ro','nosuid','nodev','noexec'}<=exact[0]['options']
            or any(x.startswith('shared:') for x in exact[0]['optional'])
            or not fs.f_flag&os.ST_RDONLY or not 0<fs.f_blocks*fs.f_frsize<=1024**2):raise AppBrokerRejected()
        _credential_acl(os.getxattr(directory,'system.posix_acl_access'),os.getuid(),5)
        credential=os.open(APP_CREDENTIAL_NAME,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC,dir_fd=directory)
        info=os.fstat(credential)
        if (not stat.S_ISREG(info.st_mode) or (info.st_uid,info.st_gid)!=(0,0) or info.st_nlink!=1
            or stat.S_IMODE(info.st_mode)!=0o440 or not 1<=info.st_size<=MAX_TOKEN):raise AppBrokerRejected()
        _credential_acl(os.getxattr(credential,'system.posix_acl_access'),os.getuid(),4)
    finally:
        if credential is not None:os.close(credential)
        if directory is not None:os.close(directory)


def _managed_token_matches(token):
    fd=os.open(CREDENTIALS+'/'+APP_CREDENTIAL_NAME,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or not 1<=info.st_size<=MAX_TOKEN:raise AppBrokerRejected()
        actual=os.pread(fd,MAX_TOKEN+1,0)
        if not hmac.compare_digest(actual,token.encode('ascii')):raise AppBrokerRejected()
    finally:os.close(fd)


class _FixedChildren:
    """Internal fixed operation state; assets are already observed/held."""
    def __init__(self,assets):
        with _startup_check('namespace_cookie'):self.namespace_cookie=observe_network_namespace_cookie()
        with _startup_check('children_identity'):
            self.role=pwd.getpwuid(os.getuid()).pw_name
            if self.role not in (APP_USER,REST_USER):raise AppBrokerRejected()
        self.work=WORK if self.role==APP_USER else REST_WORK
        self.assets=assets
        with _startup_check('tool_installation'):self.pg,_=_tools()
        self.node=Path(assets.node_path);self.next=None;self.postgrest=None
        self.logs=[];self.token=None;self.release=None;self.configured=False;self.configfd=None
        with _startup_check('node_version'):
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
                _managed_token_matches(token)
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
        if is_launch_release_pair(self.assets.releases):
            env.update(STOCKINSIDER_VNEXT_ENABLED='true',STOCKINSIDER_LAUNCH_RANKING_ENABLED='true')
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
        # The native credential belongs to systemd and disappears on unit stop.
        self.token=None
        for log in self.logs:log.close()
        self.logs=[]
        self._require_no_children()


def _serve_fixed_broker(expected_user):
    _observe_app_runtime(expected_user)
    control=CONTROL if expected_user==APP_USER else REST_CONTROL
    with _startup_check('control_path'):
        if os.path.lexists(control):raise AppBrokerRejected()
    deadline=time.monotonic()+1100;children=None;listener=None
    try:
        with _startup_check('control_socket_create'):
            listener=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM);listener.settimeout(1100)
        with _startup_check('control_socket_bind'):listener.bind(control)
        with _startup_check('control_socket_listen'):listener.listen(1)
        with ExitStack() as stack:
            # Attribute only context entry to assets, never subsequent operations.
            with _startup_check('asset_verification'):
                assets=stack.enter_context(observe_fixed_release_assets())
            children=_FixedChildren(assets)
            with _startup_check('peer_accept'):
                connection,_=listener.accept();listener.close();connection.settimeout(1100)
            with connection:
                with _startup_check('peer_identity'):
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
        if listener:listener.close()


def _emit_refusal(expected_user,error):
    role={APP_USER:'APP',REST_USER:'REST'}.get(expected_user)
    if role is None:return
    tag=error.tag if type(error) is _StartupRejected else 'runtime_or_cleanup'
    try:os.write(1,broker_refusal_bytes(role,tag))
    except OSError:pass


def _main(expected_user):
    def stop(*_):
        signal.alarm(0)
        for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,signal.SIG_IGN)
        raise TimeoutError()
    try:
        with _startup_check('process_setup'):
            resource.setrlimit(resource.RLIMIT_CORE,(0,0))
            for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGALRM):signal.signal(sig,stop)
            signal.alarm(1200)
        _serve_fixed_broker(expected_user);return 0
    except BaseException as error:
        _emit_refusal(expected_user,error);return 2
    finally:signal.alarm(0)


def main():return _main(APP_USER)

def rest_main():return _main(REST_USER)
