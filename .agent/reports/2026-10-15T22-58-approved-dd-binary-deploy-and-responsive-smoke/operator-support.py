"""Unexecuted finite operator candidate. Imports are inert; no production selector API."""
import argparse, ctypes, grp, hashlib, json, os, pathlib, signal, stat, subprocess, sys, time
OLD = '169aad1b6cfa747f78ae3464b614f43c0749d806'
NEW = 'dd59817f750684b093965f539dd4de466be13077'
ACTIVATION_SHA = '0719de5667f23f571357f2db7750297de7f7f405d2d8c06bc2d39105b237e243'
UNIT_PATH = '/etc/systemd/system/'
DROP = UNIT_PATH + 'stockinsider-web-standalone.service.d/20-writer-release.conf'
ENV = '/etc/stockinsider/writer-release.env'

def digest(b): return hashlib.sha256(b).hexdigest()
def same_stat(s): return (s.st_dev,s.st_ino,s.st_mode,s.st_uid,s.st_gid,s.st_nlink,s.st_size,s.st_mtime_ns,s.st_ctime_ns)
def read_fixed(path, expected, uid, gid, mode):
    """Bounded exact bytes, no symlink/hardlink, stable opened object and name."""
    before=os.lstat(path)
    assert stat.S_ISREG(before.st_mode) and before.st_nlink == 1, 'profile_regular_single_link'
    assert (before.st_uid,before.st_gid,stat.S_IMODE(before.st_mode)) == (uid,gid,mode), 'profile_metadata'
    fd=os.open(path,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
    try:
        assert same_stat(before)==same_stat(os.fstat(fd)), 'profile_open_changed'
        parts=[]; remaining=len(expected)+1
        while remaining:
            b=os.read(fd,remaining)
            if not b: break
            parts.append(b); remaining-=len(b)
        actual=b''.join(parts)
        assert actual == expected, 'profile_exact_bytes'
        assert same_stat(before)==same_stat(os.fstat(fd))==same_stat(os.lstat(path)), 'profile_read_changed'
    finally: os.close(fd)
    return {'sha256':digest(actual),'uid':uid,'gid':gid,'mode':mode}

def expected_effective(name):
    assert name in ('stockinsider-web-standalone.service','stockinsider-internal-worker.service')
    return {'Id':name,'LoadState':'loaded','FragmentPath':UNIT_PATH+name,
            'DropInPaths':DROP if name.startswith('stockinsider-web') else '',
            'NeedDaemonReload':'no','User':'stockinsider','Group':'stockinsider',
            'WorkingDirectory':'/opt/stockinsider/current/app'}

def assert_effective(name, actual):
    assert actual==expected_effective(name), 'effective_unit_identity'

def fixed_profile(release):
    assert release in (OLD,NEW)
    group=grp.getgrnam('stockinsider').gr_gid
    dirs={'/etc':(0,0,0o755),'/etc/systemd':(0,0,0o755),UNIT_PATH.rstrip('/'):(0,0,0o755),
          UNIT_PATH+'stockinsider-web-standalone.service.d':(0,0,0o755),'/etc/stockinsider':(0,group,0o750)}
    before={}
    for p,want in dirs.items():
        s=os.lstat(p); assert stat.S_ISDIR(s.st_mode) and (s.st_uid,s.st_gid,stat.S_IMODE(s.st_mode))==want,'profile_directory'
        before[p]=same_stat(s)
    # Only these two known nonsecret configuration files are read; no other env contents.
    result={'writer':read_fixed(ENV,('STOCKINSIDER_WRITER_RELEASE_ID='+release+'\n').encode(),0,group,0o640),
            'dropIn':read_fixed(DROP,('[Service]\nEnvironmentFile='+ENV+'\n').encode(),0,0,0o644),'units':{}}
    profile=json.loads(pathlib.Path(__file__).with_name('unit-profile.json').read_text())
    assert profile['schema']=='dd-operator-fixed-unit-profile-candidate-v1' and len(profile['units'])==2
    for row in profile['units']:
        name=row['name'];assert name in ('stockinsider-web-standalone.service','stockinsider-internal-worker.service')
        p=UNIT_PATH+name;s=os.lstat(p);assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_size==row['bytes']
        fd=os.open(p,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK)
        try: b=os.read(fd,row['bytes']+1)
        finally: os.close(fd)
        assert len(b)==row['bytes'] and digest(b)==row['sha256'],'unit_exact_source'
        read_fixed(p,b,0,0,0o644)
        keys=['Id','LoadState','FragmentPath','DropInPaths','NeedDaemonReload','User','Group','WorkingDirectory']
        cmd=['/usr/bin/systemctl','show',name,'--no-pager']+['--property='+k for k in keys]
        text=subprocess.run(cmd,check=True,capture_output=True,text=True,timeout=10).stdout
        effective=dict(line.split('=',1) for line in text.splitlines());assert set(effective)==set(keys)
        assert_effective(name,effective)
        result['units'][name]={'sourceSha256':row['sha256'],'effective':effective}
    for p,s in before.items(): assert same_stat(os.lstat(p))==s,'profile_directory_changed'
    return result

def process_snapshot():
    rows=[]
    for p in pathlib.Path('/proc').iterdir():
        if not p.name.isdigit(): continue
        try:
            text=(p/'stat').read_text();f=text[text.rindex(')')+2:].split()
            rows.append({'pid':int(p.name),'state':f[0],'ppid':int(f[1]),'pgid':int(f[2]),'start':int(f[19])})
        except (FileNotFoundError,ProcessLookupError): pass
    return rows

def group_members(pgid): return [r for r in process_snapshot() if r['pgid']==pgid]

def run_owned(argv, seconds=1900, on_started=None, scan=group_members):
    """Private engine, not arbitrary production CLI. Subreaper tracks adopted/detached
    descendants as well as the original process group. Forced termination is uncertain:
    systemd/API work can outlive its synchronous client. No reverse on uncertainty.
    """
    interrupted=[]; prior={};libc=ctypes.CDLL(None,use_errno=True);old_subreaper=ctypes.c_int();subreaper=False
    p=None;forced=False;complete=False;members=[];error=None;baseline=set()
    def caught(number,frame): interrupted.append(number)
    def owned():
        # The injectable group scan remains a failure point exercised by isolated probes.
        group=scan(p.pid);rows=process_snapshot();ids={p.pid}
        ids.update(r['pid'] for r in rows if r['ppid']==os.getpid() and (r['pid'],r['start']) not in baseline)
        while True:
            more={r['pid'] for r in rows if r['ppid'] in ids};new=more-ids
            if not new:break
            ids.update(new)
        byid={r['pid']:r for r in rows if r['pid'] in ids}
        for r in group:byid[r['pid']]=r
        return list(byid.values())
    def reap(rows):
        for r in rows:
            if r['pid']!=p.pid and r.get('ppid')==os.getpid() and r['state']=='Z':
                try:os.waitpid(r['pid'],os.WNOHANG)
                except ChildProcessError:pass
    def terminate(rows,sig):
        now={r['pid']:r for r in process_snapshot()}
        for r in rows:
            # Check process generation before signalling an owned PID; never foreign reuse.
            if r['pid'] in now and now[r['pid']]['start']==r.get('start'):
                try:os.kill(r['pid'],sig)
                except ProcessLookupError:pass
    try:
        assert libc.prctl(37,ctypes.byref(old_subreaper),0,0,0)==0,'subreaper_get_failed'
        assert libc.prctl(36,1,0,0,0)==0,'subreaper_set_failed';subreaper=True
        baseline={(r['pid'],r['start'])for r in process_snapshot()if r['ppid']==os.getpid()}
        for sig in (signal.SIGHUP,signal.SIGINT,signal.SIGTERM):prior[sig]=signal.signal(sig,caught)
        p=subprocess.Popen(argv,start_new_session=True,close_fds=True)
        if on_started:on_started(p.pid)
        end=time.monotonic()+seconds
        while True:
            rc=p.poll();members=owned();reap(members)
            if rc is not None and not any(x['state']!='Z'for x in members):complete=True;members=owned();break
            if time.monotonic()>=end:forced=True;break
            time.sleep(.02)
        if forced:
            terminate(members,signal.SIGTERM);until=time.monotonic()+1
            while time.monotonic()<until:
                p.poll();members=owned();reap(members)
                if not any(x['state']!='Z'for x in members):break
                time.sleep(.02)
            terminate(members,signal.SIGKILL)
            try:p.wait(timeout=2)
            except subprocess.TimeoutExpired:pass
            members=owned();reap(members)
    except Exception as e:
        error=type(e).__name__
        if p is not None:
            # With unavailable inspection, kill only the still-owned original session;
            # incomplete evidence remains uncertain and never authorizes reversal.
            try:os.killpg(p.pid,signal.SIGKILL)
            except ProcessLookupError:pass
            try:p.wait(timeout=2)
            except subprocess.TimeoutExpired:pass
    finally:
        for sig,handler in prior.items():signal.signal(sig,handler)
        if subreaper and libc.prctl(36,old_subreaper.value,0,0,0)!=0:error='subreaper_restore_failed'
    return {'schema':'dd-owned-activation-settlement-candidate-v1','supervisorPid':os.getpid(),
            'childPid':p.pid if p else None,'childExit':p.returncode if p else None,
            'signals':interrupted,'forced':forced,'error':error,'remainingGroupMembers':members,
            'settledForRollback':complete and not forced and error is None and p.returncode is not None and p.returncode>=0,
            'descendantSubreaperUsed':subreaper,'externalSystemdJobsVerified':False}

def confirm_settled(result, pid):
    assert result['schema']=='dd-owned-activation-settlement-candidate-v1'
    assert result['supervisorPid']==pid
    assert result['settledForRollback'] and not result['forced'] and result['error'] is None
    assert result['childExit']==0, 'activation_outcome_uncertain_no_reverse'
    assert not any(x['state']!='Z'for x in result['remainingGroupMembers'])

def private_receipt(path):
    p=pathlib.Path(path);parent=p.parent;s=os.lstat(parent)
    assert str(parent).startswith('/run/stockinsider-dd-binary.') and parent.parent==pathlib.Path('/run')
    assert parent.resolve()==parent and stat.S_ISDIR(s.st_mode) and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o700
    assert p.name in ('forward.json','reverse.json')
    return p

def main():
    assert os.geteuid()==0,'operator_root_required'
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['profile','activate','settled']);parser.add_argument('value');parser.add_argument('extra',nargs='?');args=parser.parse_args()
    if args.action=='profile':
        assert args.extra is None;print(json.dumps(fixed_profile(args.value),sort_keys=True));return 0
    if args.action=='settled':
        p=private_receipt(args.value);s=os.lstat(p);assert stat.S_ISREG(s.st_mode) and s.st_nlink==1 and s.st_uid==0 and stat.S_IMODE(s.st_mode)==0o600 and s.st_size<16384
        result=json.loads(p.read_text());confirm_settled(result,int(args.extra));return 0
    release=args.value;assert release in (OLD,NEW);receipt=private_receipt(args.extra);assert not receipt.exists() and not receipt.is_symlink()
    script=pathlib.Path('/opt/stockinsider-standalone/releases')/release/'deployment/vps/activate-writer-release.sh'
    b=script.read_bytes();assert digest(b)==ACTIVATION_SHA;assert not script.is_symlink()
    result=run_owned(['/bin/bash',str(script),release]);result['release']=release
    fd=os.open(receipt,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,0o600)
    with os.fdopen(fd,'w')as f:json.dump(result,f,sort_keys=True);f.write('\n');f.flush();os.fsync(f.fileno())
    print(json.dumps(result,sort_keys=True))
    if not result['settledForRollback']:return 125
    if result['signals']:return 128+result['signals'][0]
    return result['childExit']

if __name__=='__main__':
    try:sys.exit(main())
    except Exception as e:print('operator_support_rejected:'+type(e).__name__,file=sys.stderr);sys.exit(125)
