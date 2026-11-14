#!/usr/bin/env python3
"""ROOT ONSITE ONLY: fixed T18 admission/invalid/real staging orchestration.

Adapted from the coordinator's reviewed reader launcher. No arbitrary command,
URL or input path. Never run in Cloud or mount production release directories.
Only real mode reads exactly32+EOF stdin bytes; no key pathname/argv/artifact.
"""
import argparse
import fcntl
import grp
import hashlib
import json
import os
from pathlib import Path
import pwd
import re
import secrets
import select
import signal
import socket
import stat
import struct
import subprocess
import sys
import tempfile
import time
import threading
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from deployment.staging.vnext.t17_keyfd.t18_host_plan import build_unit_argv,SOURCE_HOST,ASSETS_HOST,DB_UNIT,APP_UNIT,REST_UNIT,BROKER_REFUSAL_MAX_BYTES,project_broker_refusal
from deployment.staging.vnext.t17_keyfd.t18_fd_handoff import send_six_fds,HANDOFF_PARENT,HANDOFF_SOCKET
from deployment.staging.vnext.t17_keyfd.stage_credentials import create_root_material,send_stage_fd,serve_credential_once,LOADER_PARENT,LOADER_SOCKET,APP_CREDENTIALS,ADMISSION_ONLY

ORIGINAL=Path('/run/stockinsider-t17-5b65286')
MANIFEST=ORIGINAL/'source/database-manifest.json'
HOSTLOCK=ORIGINAL/'restore-host.lock'
UNITS=(DB_UNIT,APP_UNIT,REST_UNIT)
SERVICES=('stockinsider-web-standalone.service','stockinsider-internal-worker.service',
          'stockinsider-postgrest.service','postgresql@17-stockinsider.service')
USERS=('si-t18-db','si-t18-app','si-t18-rest')
IPC='stockinsider-t18-ipc'
DBACCESS='stockinsider-t18-dbaccess'
CIPHER_SHA='f0845866ae749e88cbc0b9d0370e982ad8f5e9c98ce754cc68e45551f02202d4'
CIPHER_BYTES=491423538
DIRS=('/run/stockinsider-t18','/run/t18-db-work','/run/t18-pg','/run/t18-broker',
      '/run/t18-rest','/run/t18-app-work','/run/t18-rest-work',LOADER_PARENT)


class HostRejected(Exception):pass

_STOP_REQUESTED=False
_CLEANING=False


def _check_stop():
    if _STOP_REQUESTED and not _CLEANING:raise HostRejected('host_interrupted')


def command(*args,timeout=30,stdin=None,pass_fds=()):
    _check_stop()
    result=subprocess.run(args,stdin=stdin,text=True,capture_output=True,timeout=timeout,
        env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'},pass_fds=pass_fds)
    if result.returncode:raise HostRejected('fixed_host_command_failed')
    if len(result.stdout)>1024**2 or len(result.stderr)>1024**2:raise HostRejected('host_capture_limit')
    return result.stdout.strip()


class _Capture:
    """Continuously drain both pipes; bounded buffers never backpressure exit."""
    def __init__(self,child,limit=1024**2):
        if type(limit) is not int or not 0<limit<=1024**2:raise HostRejected('host_capture_limit')
        self.limit=limit
        self.buffers=[bytearray(),bytearray()];self.overflow=threading.Event();self.stop=threading.Event()
        self.streams=(child.stdout,child.stderr);self.threads=[]
        for index,stream in enumerate(self.streams):
            os.set_blocking(stream.fileno(),False)
            thread=threading.Thread(target=self._drain,args=(index,stream.fileno()),daemon=True)
            thread.start();self.threads.append(thread)
    def _drain(self,index,fd):
        while not self.stop.is_set():
            try:
                if not select.select([fd],[],[],.1)[0]:continue
                block=os.read(fd,65536)
                if not block:return
                left=self.limit-len(self.buffers[index])
                self.buffers[index].extend(block[:left])
                if len(block)>left:self.overflow.set()
            except BlockingIOError:continue
            except OSError:return
    def finish(self):
        for thread in self.threads:thread.join(timeout=2)
        incomplete=any(thread.is_alive() for thread in self.threads)
        self.stop.set()
        for thread in self.threads:thread.join(timeout=.3)
        for stream in self.streams:stream.close()
        if incomplete or self.overflow.is_set():raise HostRejected('host_capture_limit_or_incomplete')
        return tuple(bytes(value) for value in self.buffers)


def _mounted(path):
    # Every target was absent at entry; only this run may mount these new paths.
    return any(line.split()[4]==str(path) for line in Path('/proc/self/mountinfo').read_text().splitlines())


def _loops_for(path):
    if path is None or not Path(path).exists():return set()
    values=command('losetup','--noheadings','--output','NAME','--associated',str(path)).splitlines()
    if any(not re.fullmatch(r'/dev/loop[0-9]+',value.strip()) for value in values):raise HostRejected('loop_inventory_invalid')
    return {value.strip() for value in values}


def _owned_loops(path,baseline,attach_intent):
    # A failed/unknown baseline is never permission to detach retained loops.
    if not attach_intent:return set()
    return _loops_for(path)-baseline


def _held_sealed_image(path):
    # Do not root-mount an image selected solely by a final pathname lstat.
    for parent in (path.parent,path.parent.parent):
        info=parent.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022:raise HostRejected('sealed_image_parent_metadata')
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
    info=os.fstat(fd)
    if (not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o400
        or info.st_nlink!=1 or not 0<info.st_size<=2*1024**3):
        os.close(fd);raise HostRejected('sealed_image_metadata')
    return fd


def disk(path):
    value=os.statvfs(path);return value.f_bavail*value.f_frsize


def memory():
    match=re.search(r'^MemAvailable:\s*(\d+) kB$',Path('/proc/meminfo').read_text(),re.M)
    if not match:raise HostRejected('host_memory_unobserved')
    return int(match[1])*1024


def system_state():
    services=[command('systemctl','show',unit,'-p','MainPID','-p','ActiveState','-p','ExecMainStartTimestampMonotonic') for unit in SERVICES]
    if not all('ActiveState=active' in state and re.search(r'^MainPID=[1-9][0-9]*$',state,re.M) for state in services):
        raise HostRejected('formal_services_not_active')
    return [services,os.readlink('/opt/stockinsider/current'),
        command('systemctl','list-unit-files','stockinsider*.timer','--no-legend','--plain')]


def _read_stdin_key():
    if os.isatty(0):raise HostRejected('noninteractive_key_stdin_required')
    value=bytearray(33);size=0;end=time.monotonic()+5
    try:
        while True:
            _check_stop()
            left=end-time.monotonic()
            if left<=0 or not select.select([0],[],[],left)[0]:raise HostRejected('key_stdin_deadline')
            _check_stop()
            count=os.readv(0,[memoryview(value)[size:]])
            if count==0:break
            size+=count
            if size>32:raise HostRejected('backup_key_length')
        if size!=32:raise HostRejected('backup_key_length')
        return value
    except BaseException:
        value[:]=bytes(len(value));raise


def _ensure_accounts():
    # Reserved staging accounts only. Never edit an existing differently shaped
    # account or any unrelated membership. Locked accounts remain reserved.
    for name in (*USERS,IPC,DBACCESS):
        try:entry=grp.getgrnam(name)
        except KeyError:command('groupadd','--system',name);entry=grp.getgrnam(name)
        if entry.gr_gid==0 or not set(entry.gr_mem)<=set(USERS):raise HostRejected('staging_group_collision')
    reserved={name:grp.getgrnam(name).gr_gid for name in (*USERS,IPC,DBACCESS)}
    if len(set(reserved.values()))!=5:raise HostRejected('staging_gid_collision')
    if any(entry.gr_gid in set(reserved.values()) and entry.gr_name not in reserved for entry in grp.getgrall()):raise HostRejected('staging_gid_alias')
    if any(entry.pw_gid in set(reserved.values()) and entry.pw_name not in USERS for entry in pwd.getpwall()):raise HostRejected('foreign_reserved_primary_group')
    for name in USERS:
        try:entry=pwd.getpwnam(name)
        except KeyError:
            command('useradd','--system','--no-create-home','--home-dir','/nonexistent',
                '--shell','/usr/sbin/nologin','--gid',name,name)
            entry=pwd.getpwnam(name)
        if (entry.pw_uid==0 or entry.pw_gid!=grp.getgrnam(name).gr_gid
            or entry.pw_dir!='/nonexistent' or entry.pw_shell!='/usr/sbin/nologin'):
            raise HostRejected('staging_user_collision')
        if any(other.pw_uid==entry.pw_uid and other.pw_name!=name for other in pwd.getpwall()):raise HostRejected('staging_uid_alias')
        allowed={entry.pw_gid,grp.getgrnam(IPC).gr_gid}
        if name!='si-t18-app':allowed.add(grp.getgrnam(DBACCESS).gr_gid)
        if not set(os.getgrouplist(name,entry.pw_gid))<=allowed:raise HostRejected('unexpected_staging_groups')
        probe=subprocess.run(['pgrep','-u',str(entry.pw_uid)],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        if probe.returncode!=1:raise HostRejected('staging_account_has_processes')
        groups=IPC+(','+DBACCESS if name!='si-t18-app' else '')
        command('usermod','--append','--groups',groups,'--lock',name)
    accounts={name:pwd.getpwnam(name) for name in USERS}
    if len({entry.pw_uid for entry in accounts.values()})!=3:raise HostRejected('staging_uid_collision')
    if any(entry.pw_uid in {a.pw_uid for a in accounts.values()} and entry.pw_name not in USERS for entry in pwd.getpwall()):raise HostRejected('staging_uid_alias')
    return accounts


def _root_inputs():
    # A full exact-source Git blob inventory is supplied with the reviewed
    # commit and checked by the coordinator before this root entry is invoked.
    for directory in (Path(SOURCE_HOST),Path(ASSETS_HOST)):
        info=directory.lstat()
        if not stat.S_ISDIR(info.st_mode) or info.st_uid!=0 or info.st_mode&0o022 or info.st_mode&0o005!=0o005:raise HostRejected('fixed_input_root_required')
    for parent,dirs,files in os.walk(SOURCE_HOST,followlinks=False):
        for name in (*dirs,*files):
            path=Path(parent)/name;info=path.lstat()
            if (info.st_uid!=0 or info.st_mode&0o022 or stat.S_ISLNK(info.st_mode)
                or not(stat.S_ISDIR(info.st_mode) or stat.S_ISREG(info.st_mode))
                or stat.S_ISREG(info.st_mode) and (info.st_nlink!=1 or not info.st_mode&0o004)
                or name=='database-manifest.json' or name=='.env' or name.startswith('.env.')):
                raise HostRejected('source_tree_not_public_root_owned')
    expected=Path(SOURCE_HOST)/'scripts/staging_t18_host.py'
    if expected.resolve()!=Path(__file__).resolve():raise HostRejected('fixed_reviewed_host_entry_required')


def _unit_available(unit):
    result=subprocess.run(['systemctl','show',unit,'-p','LoadState','-p','ActiveState','-p','FragmentPath','-p','Transient'],
        capture_output=True,text=True,timeout=10)
    values=dict(line.split('=',1) for line in result.stdout.splitlines() if '=' in line)
    if values.get('LoadState') not in (None,'not-found'):
        raise HostRejected('fixed_staging_unit_already_exists')


def _stop_unit(unit):
    subprocess.run(['systemctl','stop',unit],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,timeout=30)
    value=subprocess.run(['systemctl','show',unit,'-p','ActiveState','--value'],capture_output=True,text=True,timeout=10).stdout.strip()
    if value not in ('','inactive','failed'):raise HostRejected('staging_unit_still_live')
    cg=Path('/sys/fs/cgroup/system.slice')/unit/'cgroup.procs'
    if cg.exists() and cg.read_text().strip():raise HostRejected('staging_cgroup_not_empty')


def _peer(connection,accounts):
    pid,uid,gid=struct.unpack('3i',connection.getsockopt(socket.SOL_SOCKET,socket.SO_PEERCRED,12))
    expected=int(command('systemctl','show',DB_UNIT,'-p','MainPID','--value'))
    if uid!=accounts['si-t18-db'].pw_uid or gid!=accounts['si-t18-db'].pw_gid or pid!=expected:
        raise HostRejected('restricted_peer_identity')
    if Path('/proc',str(pid),'cgroup').read_text().strip()!='0::/system.slice/'+DB_UNIT:
        raise HostRejected('restricted_peer_cgroup')
    status=Path('/proc',str(pid),'status').read_text()
    for field in ('CapEff','CapPrm','CapAmb'):
        value=re.search('^'+field+r':\s*([0-9a-fA-F]+)$',status,re.M)
        if not value or int(value[1],16):raise HostRejected('restricted_peer_capabilities')


def _introspect_three_units(accounts):
    # Real kernel/proc/cgroup observations BEFORE reading stdin, not an approval
    # receipt. The unprivileged entries reobserve all their own guards later.
    namespaces=[]
    for unit,user in zip(UNITS,USERS):
        pid=int(command('systemctl','show',unit,'-p','MainPID','--value'))
        if pid<=0:raise HostRejected('unit_main_pid_missing')
        status=Path('/proc',str(pid),'status').read_text()
        uids=re.search(r'^Uid:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)$',status,re.M)
        if not uids or any(int(v)!=accounts[user].pw_uid for v in uids.groups()):raise HostRejected('unit_uid_mismatch')
        for name in ('CapEff','CapPrm','CapAmb'):
            value=re.search('^'+name+r':\s*([0-9a-fA-F]+)$',status,re.M)
            if not value or int(value[1],16):raise HostRejected('unit_capabilities_not_empty')
        if Path('/proc',str(pid),'cgroup').read_text().strip()!='0::/system.slice/'+unit:raise HostRejected('unit_cgroup_mismatch')
        ns=os.stat('/proc/'+str(pid)+'/ns/net');namespaces.append((ns.st_dev,ns.st_ino))
        devices=Path('/proc',str(pid),'net/dev').read_text().splitlines()[2:]
        if {line.split(':',1)[0].strip() for line in devices}!={'lo'}:raise HostRejected('unit_network_not_loopback_only')
        cg=Path('/sys/fs/cgroup/system.slice')/unit
        if (cg/'memory.swap.max').read_text().strip()!='0':raise HostRejected('unit_swap_not_disabled')
    host=os.stat('/proc/self/ns/net')
    if len(set(namespaces))!=1 or namespaces[0]==(host.st_dev,host.st_ino):raise HostRejected('unit_private_namespace_mismatch')


def _require_starting_brokers(children):
    # Fixed role labels only, never stderr, exceptions, command text or rows.
    for kind,label in (('APP','app_broker_startup_refused'),('REST','rest_broker_startup_refused')):
        if children[kind].poll() is not None:raise HostRejected(label)


def _wait_registered_db(child):
    """Ordering only: Popen is not a completed StartTransientUnit registration.

    Never substitutes for later actual three-UID/net/capability/key admission.
    Query only the fixed DB unit; no caller unit name or readiness assertion.
    """
    deadline=time.monotonic()+5
    while True:
        _check_stop()
        if child.poll() is not None:raise HostRejected('fixed_db_unit_exited_before_brokers')
        left=deadline-time.monotonic()
        if left<=0:raise HostRejected('fixed_db_unit_registration_timeout')
        try:
            observed=command('systemctl','show',DB_UNIT,'-p','LoadState','-p','ActiveState','-p','MainPID',timeout=min(1,left))
        except (HostRejected,subprocess.TimeoutExpired):
            _check_stop();observed=''
        values=dict(line.split('=',1) for line in observed.splitlines() if '=' in line)
        if values.get('LoadState') in ('error','masked','bad-setting'):
            raise HostRejected('fixed_db_unit_registration_rejected')
        if (values.get('LoadState')=='loaded' and values.get('ActiveState')=='active'
            and re.fullmatch('[1-9][0-9]*',values.get('MainPID',''))):
            if child.poll() is not None:raise HostRejected('fixed_db_unit_exited_before_brokers')
            return
        time.sleep(min(.05,max(0,deadline-time.monotonic())))


def _failed_broker_diagnostic(kind,code,data):
    observed=project_broker_refusal(data,kind) if type(code) is int and code==2 else None
    return observed or {'status':'NO_VALID_REFUSAL_RECORD'}


def _snapshot_broker_diagnostics(children,captures):
    # Observe before sending STOP: normal exits and subsequent cancellations are
    # not startup failures. A complete pre-STOP record also covers wrapper lag.
    failed={kind for kind in ('APP','REST') if kind in children and children[kind].poll() not in (None,0)}
    records={}
    for kind in ('APP','REST'):
        if kind in captures and not captures[kind].overflow.is_set():
            observed=project_broker_refusal(bytes(captures[kind].buffers[0]),kind)
            if observed:records[kind]=observed
    return failed,records


def _seal_controls(children):
    deadline=time.monotonic()+15;ipc=grp.getgrnam(IPC).gr_gid
    for parent in ('/run/t18-broker','/run/t18-rest'):
        endpoint=Path(parent)/'control.sock'
        while not endpoint.exists():
            _check_stop()
            _require_starting_brokers(children)
            if time.monotonic()>deadline:raise HostRejected('broker_socket_startup_deadline')
            time.sleep(.05)
        if not stat.S_ISSOCK(endpoint.lstat().st_mode):raise HostRejected('broker_socket_type')
        os.chown(endpoint,0,ipc);os.chmod(endpoint,0o660)
        os.chown(parent,0,ipc);os.chmod(parent,0o750)


def _digest(fd):
    digest=hashlib.sha256();offset=0
    while block:=os.pread(fd,256*1024,offset):offset+=len(block);digest.update(block)
    return digest.hexdigest()


def _runner_outcome(mode,code,value):
    if type(value) is not dict:raise HostRejected('fixed_runner_outcome_unexpected')
    if mode=='admission':
        good=(code==0 and value.get('schema')=='stockinsider-t18-host-admission-v1'
            and value.get('status')=='HOST_PREREQUISITES_VERIFIED_ONLY'
            and all(value.get(k) is False for k in ('keyRead','databaseStarted','applicationStarted','runtimeRestoreAdmission')))
        result=0
    elif mode=='invalid':
        good=(code==2 and value.get('schema')=='stockinsider-staging-next-rollback-v1'
            and value.get('status')=='REJECTED' and value.get('reason')=='backup_authentication_failed')
        result=0
    elif mode=='real':
        good=(value.get('schema')=='stockinsider-staging-next-rollback-v1'
            and (code,value.get('status')) in ((0,'DB_VERIFIED_FIXED_T18_EXERCISED'),(3,'DB_VERIFIED_T18_GAP')))
        result=code
    else:good=False;result=2
    if not good:raise HostRejected('fixed_runner_outcome_unexpected')
    return result


def execute(mode,manifest_sha):
    global _CLEANING
    if os.getuid()!=0 or os.geteuid()!=0:raise HostRejected('root_host_only')
    if os.stat('/proc/self/ns/mnt').st_ino!=os.stat('/proc/1/ns/mnt').st_ino:
        raise HostRejected('host_manager_mount_namespace_required')
    _root_inputs()
    before=system_state()
    if disk('/var/tmp')<23*1024**3 or memory()<3072*1024**2:raise HostRejected('initial_host_capacity')
    lock=os.open(HOSTLOCK,os.O_RDWR|os.O_NOFOLLOW|os.O_CLOEXEC)
    owned=os.fstat(lock)
    if owned.st_uid!=0 or not stat.S_ISREG(owned.st_mode) or owned.st_nlink!=1 or stat.S_IMODE(owned.st_mode)!=0o600:
        os.close(lock);raise HostRejected('root_host_lock_required')
    try:fcntl.flock(lock,fcntl.LOCK_EX|fcntl.LOCK_NB)
    except BaseException:os.close(lock);raise
    children={};captures={};created=[];mounts=[];fds=[];broker=None;storage=None;image=None
    cipher_image=None;cipher_before=set();work_before=set();mapper_intent=False
    cipher_attach_intent=False;work_attach_intent=False;unit_intents=set()
    work_loop=cipher_loop=None;mapped=False;name='si-t18-'+secrets.token_hex(6)
    peak={'minimumHostDiskBytes':disk('/var/tmp'),'minimumHostAvailableMemoryBytes':memory()}
    runner=None;cleanup_ok=False;state_ok=False;key_read_attempted=False;accounts_verified=False;started=time.monotonic()
    broker_diagnostics={}
    credential_loader=None;stage_material=None;stage_payload=None
    try:
        for unit in UNITS:_unit_available(unit)
        if any(os.path.lexists(p) for p in DIRS):raise HostRejected('staging_path_already_exists')
        runtime_parent=Path('/run').lstat()
        if not stat.S_ISDIR(runtime_parent.st_mode) or runtime_parent.st_uid!=0 or runtime_parent.st_mode&0o022:raise HostRejected('root_runtime_parent_required')
        if os.path.lexists(APP_CREDENTIALS):raise HostRejected('native_staging_credential_already_exists')
        accounts=_ensure_accounts();accounts_verified=True
        db=accounts['si-t18-db'];app=accounts['si-t18-app'];rest=accounts['si-t18-rest']
        owners=((0,0,0o711),(db.pw_uid,db.pw_gid,0o700),(db.pw_uid,grp.getgrnam(DBACCESS).gr_gid,0o750),
                (app.pw_uid,app.pw_gid,0o700),(rest.pw_uid,rest.pw_gid,0o700),
                (app.pw_uid,app.pw_gid,0o700),(rest.pw_uid,rest.pw_gid,0o700),(0,0,0o700))
        for path,(uid,gid,mode_bits) in zip(DIRS,owners):
            Path(path).mkdir();created.append(path);os.chown(path,uid,gid);os.chmod(path,mode_bits)
        for path,size,user in (('/run/t18-app-work','128M',app),('/run/t18-rest-work','64M',rest)):
            mounts.append(path)
            command('mount','-t','tmpfs','-o',f'size={size},mode=0700,uid={user.pw_uid},gid={user.pw_gid},nosuid,nodev,noexec','tmpfs',path)
            command('mount','--make-private',path)
        if mode!='admission':
            info=MANIFEST.lstat()
            if not stat.S_ISREG(info.st_mode) or info.st_uid!=0 or stat.S_IMODE(info.st_mode)!=0o400 or info.st_nlink!=1 or info.st_size>1024**2:
                raise HostRejected('manifest_metadata')
            manifest=os.open(MANIFEST,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC);fds.append(manifest)
            if _digest(manifest)!=manifest_sha:raise HostRejected('manifest_identity')
            candidates=list(Path('/var/tmp').glob('stockinsider-t17-intake.*/seal.*/ciphertext.ext4'))
            if len(candidates)!=1:raise HostRejected('sealed_image_inventory')
            cipher_image=candidates[0]
            cipher_image_fd=_held_sealed_image(cipher_image);fds.append(cipher_image_fd)
            cipher_before=_loops_for(cipher_image)
            storage=Path(tempfile.mkdtemp(prefix=name+'-',dir='/var/tmp'));storage.chmod(0o711)
            image=storage/'work.ext4'
            command('fallocate','-l','8G',str(image));image.chmod(0o600)
            work_before=_loops_for(image)
            if work_before:raise HostRejected('unexpected_preexisting_work_loop')
            work_attach_intent=True
            work_loop=command('losetup','--find','--show',str(image))
            if not re.fullmatch(r'/dev/loop[0-9]+',work_loop):raise HostRejected('workspace_loop_identity')
            if Path('/dev/mapper',name).exists():raise HostRejected('staging_mapper_collision')
            mapper_intent=True
            with open('/dev/urandom','rb',buffering=0) as random:
                command('cryptsetup','open','--type','plain','--cipher','aes-xts-plain64','--key-size','512',
                    '--key-file','-','--keyfile-size','64',work_loop,name,stdin=random)
            mapped=True;alias='/dev/mapper/'+name
            command('mkfs.ext4','-q','-m','0',alias)
            mounts.append('/run/t18-db-work')
            command('mount','-o','nosuid,nodev,noexec',alias,'/run/t18-db-work')
            command('mount','--make-private','/run/t18-db-work');os.chown('/run/t18-db-work',db.pw_uid,db.pw_gid);os.chmod('/run/t18-db-work',0o700)
            cipher=Path(HANDOFF_PARENT)/'cipher';cipher.mkdir();created.append(str(cipher))
            cipher_attach_intent=True
            cipher_loop=command('losetup','--find','--show','--read-only','/proc/self/fd/'+str(cipher_image_fd),pass_fds=(cipher_image_fd,))
            if not re.fullmatch(r'/dev/loop[0-9]+',cipher_loop):raise HostRejected('cipher_loop_identity')
            mounts.append(str(cipher))
            command('mount','-o','ro,nosuid,nodev,noexec',cipher_loop,str(cipher))
            command('mount','--make-private',str(cipher))
            sealed=os.open(cipher/'database.sib',os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC);fds.append(sealed)
            if os.fstat(sealed).st_size!=CIPHER_BYTES or _digest(sealed)!=CIPHER_SHA:raise HostRejected('ciphertext_identity')
            hostdir=os.open(storage,os.O_RDONLY|os.O_DIRECTORY|os.O_CLOEXEC);backing=os.open(image,os.O_RDONLY|os.O_NOFOLLOW|os.O_CLOEXEC)
            key_r,key_w=os.pipe2(os.O_CLOEXEC);fds.extend((hostdir,backing,key_r,key_w))
            broker=socket.socket(socket.AF_UNIX,socket.SOCK_SEQPACKET);broker.bind(HANDOFF_SOCKET)
            os.chown(HANDOFF_SOCKET,0,grp.getgrnam(IPC).gr_gid);os.chmod(HANDOFF_SOCKET,0o660);broker.listen(1);broker.settimeout(15)
        # Root0700 one-shot channel contains only a fresh staging reader JWT.
        # Serve it before waiting for APP MainPID/socket: LoadCredential precedes exec.
        if mode=='admission':stage_payload=ADMISSION_ONLY
        else:
            stage_material,stage_payload=create_root_material();fds.append(stage_material)
        credential_loader=socket.socket(socket.AF_UNIX,socket.SOCK_STREAM)
        credential_loader.bind(LOADER_SOCKET);os.chmod(LOADER_SOCKET,0o600)
        credential_loader.listen(1);credential_loader.settimeout(15)
        for kind in ('DB','APP','REST'):
            _check_stop()
            unit_intents.add(kind)
            argv=list(build_unit_argv(kind,mode))
            if kind=='DB' and storage is not None:
                # Preserve original backing-file/sysfs identity observation.
                index=next(i for i,arg in enumerate(argv) if arg.startswith('--property=BindReadOnlyPaths='))
                argv[index]+=' '+str(storage)
            children[kind]=subprocess.Popen(argv,stdin=subprocess.DEVNULL,stdout=subprocess.PIPE,stderr=subprocess.PIPE,bufsize=0,
                env={'PATH':'/usr/sbin:/usr/bin:/sbin:/bin','LC_ALL':'C'})
            captures[kind]=_Capture(children[kind],1024**2 if kind=='DB' else BROKER_REFUSAL_MAX_BYTES)
            if kind=='DB':_wait_registered_db(children[kind])
            if kind=='APP':
                serve_credential_once(credential_loader,stage_payload)
                credential_loader.close();credential_loader=None;stage_payload=None
        _seal_controls(children);_check_stop()
        if mode!='admission':
            conn,_=broker.accept();broker.close()
            with conn:
                _peer(conn,accounts);_introspect_three_units(accounts)
                if disk('/var/tmp')<15*1024**3 or memory()<3072*1024**2:raise HostRejected('pre_key_host_reserve')
                if mode=='real':
                    key_read_attempted=True
                    key=_read_stdin_key()
                    try:
                        if os.write(key_w,memoryview(key)[:32])!=32:raise HostRejected('key_pipe_short_write')
                    finally:key[:]=bytes(len(key))
                else:os.write(key_w,bytes(32))
                os.close(key_w);fds.remove(key_w)
                send_six_fds(conn,[key_r,sealed,manifest,lock,hostdir,backing])
                send_stage_fd(conn,stage_material)
                os.close(stage_material);fds.remove(stage_material);stage_material=None
            os.close(key_r);fds.remove(key_r)
        deadline=time.monotonic()+1250
        while children['DB'].poll() is None:
            _check_stop()
            peak['minimumHostDiskBytes']=min(peak['minimumHostDiskBytes'],disk('/var/tmp'))
            peak['minimumHostAvailableMemoryBytes']=min(peak['minimumHostAvailableMemoryBytes'],memory())
            if storage:peak['minimumWorkFreeBytes']=min(peak.get('minimumWorkFreeBytes',2**40),disk('/run/t18-db-work'))
            for label,unit in zip(('db','app','rest'),UNITS):
                try:value=int((Path('/sys/fs/cgroup/system.slice')/unit/'memory.peak').read_text())
                except FileNotFoundError:continue
                peak[label+'MemoryPeakObservedBytes']=max(peak.get(label+'MemoryPeakObservedBytes',0),value)
            if any(capture.overflow.is_set() for capture in captures.values()):raise HostRejected('host_capture_limit')
            if time.monotonic()>deadline or peak['minimumHostDiskBytes']<15*1024**3 or peak['minimumHostAvailableMemoryBytes']<1536*1024**2:
                raise HostRejected('live_host_reserve_or_deadline')
            time.sleep(.15)
        children['DB'].wait(timeout=6)
        out,err=captures['DB'].finish();del captures['DB']
        if len(out)>1024**2 or len(err)>1024**2:raise HostRejected('runner_capture_limit')
        runner=json.loads(out)
        outcome=_runner_outcome(mode,children['DB'].returncode,runner)
    finally:
        _CLEANING=True
        failures=[]
        failed_brokers,broker_diagnostics=_snapshot_broker_diagnostics(children,captures)
        for kind in ('APP','REST','DB'):
            if kind in unit_intents:
                try:
                    _stop_unit({'DB':DB_UNIT,'APP':APP_UNIT,'REST':REST_UNIT}[kind])
                    if kind in children:children[kind].wait(timeout=30)
                    if kind in captures:
                        captured_out,_=captures[kind].finish();del captures[kind]
                        if kind in failed_brokers:
                            broker_diagnostics[kind]=_failed_broker_diagnostic(kind,children[kind].returncode,captured_out)
                except Exception:failures.append('unit_cleanup')
        if broker:broker.close()
        if credential_loader:credential_loader.close()
        stage_payload=None
        for fd in fds:
            try:os.close(fd)
            except OSError:failures.append('descriptor_cleanup')
        for mount in reversed(mounts):
            try:
                if _mounted(mount):command('umount',mount)
                if _mounted(mount):raise HostRejected('owned_mount_remaining')
            except Exception:failures.append('mount_cleanup')
        work_loops=set();cipher_loops=set()
        try:
            work_loops=_owned_loops(image,work_before,work_attach_intent)
            cipher_loops=_owned_loops(cipher_image,cipher_before,cipher_attach_intent)
        except Exception:failures.append('loop_reconciliation')
        alias=Path('/dev/mapper')/name
        if mapper_intent and alias.exists():
            try:
                observed=command('cryptsetup','status',name)
                device=re.search(r'^\s*device:\s*(/dev/loop[0-9]+)\s*$',observed,re.M)
                if not device or device[1] not in work_loops:raise HostRejected('mapper_backing_identity')
                command('cryptsetup','close',name)
                if alias.exists():raise HostRejected('mapper_remaining')
            except Exception:failures.append('mapper_cleanup')
        for loop in sorted(cipher_loops|work_loops):
            try:command('losetup','-d',loop)
            except Exception:failures.append('loop_cleanup')
        try:
            for _ in range(20):
                remaining_work=_owned_loops(image,work_before,work_attach_intent)
                remaining_cipher=_owned_loops(cipher_image,cipher_before,cipher_attach_intent)
                if not (remaining_work or remaining_cipher):break
                time.sleep(.05)
            else:failures.append('owned_loop_remaining')
        except Exception:failures.append('loop_reconciliation')
        if image is not None and image.exists() and not failures:
            try:
                if _loops_for(image):failures.append('work_image_still_associated')
            except Exception:failures.append('loop_reconciliation')
        if image is not None and image.exists() and not failures:
            info=image.lstat()
            if stat.S_ISREG(info.st_mode) and info.st_nlink==1:
                try:image.unlink()
                except OSError:failures.append('image_cleanup')
            else:failures.append('image_identity')
        if storage is not None and not failures:
            try:storage.rmdir()
            except OSError:failures.append('storage_cleanup')
        for path in (Path(HANDOFF_SOCKET),Path(LOADER_SOCKET),Path('/run/t18-broker/control.sock'),Path('/run/t18-rest/control.sock')):
            if path.exists() and not failures:
                if stat.S_ISSOCK(path.lstat().st_mode):
                    try:path.unlink()
                    except OSError:failures.append('socket_cleanup')
                else:failures.append('socket_identity')
        if not failures:
            for path in reversed(created):
                try:Path(path).rmdir()
                except OSError:failures.append('directory_cleanup')
        if os.path.lexists(APP_CREDENTIALS):failures.append('native_staging_credential_remaining')
        cleanup_ok=not failures
        try:state_ok=system_state()==before
        except Exception:state_ok=False
        finally:os.close(lock)  # original exclusive OFD lock released LAST
        print(json.dumps({'schema':'stockinsider-t18-host-launcher-v1','mode':mode,'runner':runner,'runnerExit':None if 'DB' not in children else children['DB'].returncode,
            'resourceSample':peak,'brokerDiagnostics':broker_diagnostics,'durationSeconds':round(time.monotonic()-started,3),'stagingResourcesCleaned':cleanup_ok,'productionSignaturesUnchanged':state_ok,
            'stagingAccounts':('RESERVED_LOCKED_NOLOGIN' if accounts_verified else 'NOT_VERIFIED'),'keyRead':key_read_attempted,'nativeHoldRetained':True},sort_keys=True),flush=True)
        _CLEANING=False
        if not cleanup_ok or not state_ok:raise HostRejected('cleanup_or_production_signature_failed')
    return outcome


class _FixedParser(argparse.ArgumentParser):
    def error(self,_message):
        print(json.dumps({'schema':'stockinsider-t18-host-launcher-v1','status':'REJECTED',
            'reason':'fixed_host_arguments_rejected','keyRead':False,'nativeHoldRetained':True}))
        self.exit(2)


def main():
    parser=_FixedParser(description='Fixed root onsite T18 host launcher only')
    parser.add_argument('mode',choices=('admission','invalid','real'))
    parser.add_argument('--manifest-sha256')
    args=parser.parse_args()
    if args.mode=='admission' and args.manifest_sha256 is not None or args.mode!='admission' and not re.fullmatch('[0-9a-f]{64}',args.manifest_sha256 or ''):
        print(json.dumps({'status':'REJECTED','reason':'fixed_mode_manifest_contract'}));return 2
    os.umask(0o077)
    def stop(*_):
        # Defer interruption to checkpoints so fork/mount/loop ownership is
        # recorded before cleanup. Every native call still has a hard timeout.
        global _STOP_REQUESTED
        _STOP_REQUESTED=True
    for sig in (signal.SIGTERM,signal.SIGINT,signal.SIGHUP):signal.signal(sig,stop)
    try:return execute(args.mode,args.manifest_sha256)
    except BaseException as error:
        reason=str(error) if type(error) is HostRejected else 'inspect_nonsecret_host_observations'
        print(json.dumps({'schema':'stockinsider-t18-host-launcher-v1','status':'REJECTED','reason':reason,'nativeHoldRetained':True}));return 2


if __name__=='__main__':raise SystemExit(main())
