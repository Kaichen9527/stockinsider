"""Only isolated dummy processes/scratch files. Never executes/sources deploy.sh or real helpers."""
import hashlib, importlib.util, json, os, pathlib, signal, subprocess, sys, tempfile, threading, time
HERE=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('support',HERE/'operator-support.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
results=[]
def probe(name,fn):
    fn();results.append({'name':name,'status':'PASS'})
def rejects(fn):
    try:fn()
    except (AssertionError,OSError,ValueError):return
    raise AssertionError('expected rejection')
with tempfile.TemporaryDirectory(prefix='dd-operator-hermetic-') as tmp:
    root=pathlib.Path(tmp);p=root/'known-nonsecret';p.write_bytes(b'exact\n');p.chmod(0o600)
    probe('finite exact nonsecret bytes',lambda:m.read_fixed(p,b'exact\n',os.getuid(),os.getgid(),0o600))
    probe('extra setting rejects',lambda:rejects(lambda:m.read_fixed(p,b'exact',os.getuid(),os.getgid(),0o600)))
    probe('unknown mode rejects',lambda:rejects(lambda:m.read_fixed(p,b'exact\n',os.getuid(),os.getgid(),0o640)))
    probe('unknown owner rejects',lambda:rejects(lambda:m.read_fixed(p,b'exact\n',os.getuid()+1,os.getgid(),0o600)))
    probe('unknown group rejects',lambda:rejects(lambda:m.read_fixed(p,b'exact\n',os.getuid(),os.getgid()+1,0o600)))
    probe('missing profile rejects',lambda:rejects(lambda:m.read_fixed(root/'missing',b'exact\n',os.getuid(),os.getgid(),0o600)))
    link=root/'link';link.symlink_to(p)
    probe('symlink rejects',lambda:rejects(lambda:m.read_fixed(link,b'exact\n',os.getuid(),os.getgid(),0o600)))
    hard=root/'hard';os.link(p,hard)
    probe('hardlink rejects',lambda:rejects(lambda:m.read_fixed(p,b'exact\n',os.getuid(),os.getgid(),0o600)));hard.unlink()
    for name in ('stockinsider-web-standalone.service','stockinsider-internal-worker.service'):
        probe('exact effective unit '+name,lambda name=name:m.assert_effective(name,m.expected_effective(name)))
        for field,value in [('DropInPaths','/unknown.conf'),('FragmentPath','/unknown.service'),('NeedDaemonReload','yes'),('User','root')]:
            probe('effective drift '+name+' '+field,lambda name=name,field=field,value=value:rejects(lambda:m.assert_effective(name,{**m.expected_effective(name),field:value})))
    probe('extra effective setting rejects',lambda:rejects(lambda:m.assert_effective('stockinsider-web-standalone.service',{**m.expected_effective('stockinsider-web-standalone.service'),'Extra':'unknown'})))
    def supervisor_signals():
        timers=[threading.Timer(.04,lambda:os.kill(os.getpid(),signal.SIGTERM)),threading.Timer(.08,lambda:os.kill(os.getpid(),signal.SIGINT))]
        def start(pid):
            for timer in timers:timer.start()
        r=m.run_owned([sys.executable,'-c','import time;time.sleep(.2)'],seconds=2,on_started=start)
        for timer in timers:timer.join()
        assert r['signals']==[signal.SIGTERM,signal.SIGINT];m.confirm_settled(r,os.getpid())
    probe('supervisor double signal waits for natural child completion',supervisor_signals)
    def ordinary_failure():
        r=m.run_owned([sys.executable,'-c','raise SystemExit(42)'],seconds=2)
        assert r['childExit']==42 and r['settledForRollback'];rejects(lambda:m.confirm_settled(r,os.getpid()))
    probe('nonzero activation is uncertain even after process settlement',ordinary_failure)
    def descendants():
        t=time.monotonic();r=m.run_owned([sys.executable,'-c',"import subprocess,sys;subprocess.Popen([sys.executable,'-c','import time;time.sleep(.18)'])"],seconds=2)
        assert time.monotonic()-t>=.18;m.confirm_settled(r,os.getpid());assert not any(x['state']!='Z'for x in r['remainingGroupMembers'])
    probe('wait for descendant after leader exit',descendants)
    def detached_descendant():
        t=time.monotonic();r=m.run_owned([sys.executable,'-c',"import subprocess,sys;subprocess.Popen([sys.executable,'-c','import time;time.sleep(.2)'],start_new_session=True)"],seconds=2)
        assert time.monotonic()-t>=.2 and r['descendantSubreaperUsed'];m.confirm_settled(r,os.getpid())
    probe('detached adopted descendant must settle too',detached_descendant)

    def forced():
        r=m.run_owned([sys.executable,'-c','import time;time.sleep(5)'],seconds=.08)
        assert r['forced'] and not r['settledForRollback'];rejects(lambda:m.confirm_settled(r,os.getpid()));assert not any(x['state']!='Z'for x in m.group_members(r['childPid']))
    probe('forced containment never authorizes reverse',forced)
    def scan_failure():
        def fail_scan(pid):raise RuntimeError('injected inspection unavailable')
        r=m.run_owned([sys.executable,'-c','import time;time.sleep(5)'],seconds=1,scan=fail_scan)
        assert not r['settledForRollback'] and r['error']=='RuntimeError';assert not any(x['state']!='Z'for x in m.group_members(r['childPid']))
    probe('inspection failure uncertain, owned child contained',scan_failure)
    # Actual shell state machine extraction, not the deploy entrypoint. Every prod-facing
    # primitive is an inert mock; support CLI is replaced by this explicit dummy driver.
    source=(HERE/'deploy.sh').read_text();fragment=source[source.index('changed=false\n'):source.index("/usr/bin/python3 -c 'import")]
    driver=root/'dummy-driver.py'
    driver.write_text('''import importlib.util,json,os,pathlib,sys\nspec=importlib.util.spec_from_file_location('real_support',sys.argv[1]);m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)\na=sys.argv[2:]\nif a[0]=='profile':raise SystemExit(0)\nif a[0]=='settled':\n r=json.loads(pathlib.Path(a[1]).read_text());m.confirm_settled(r,int(a[2]));raise SystemExit(0)\nrelease,receipt=a[1:];log=os.environ['DUMMY_LOG'];kind='FORWARD' if release=='new' else 'REVERSE'\ncode="import pathlib,time; p=pathlib.Path("+repr(log)+"); f=p.open('a');f.write("+repr(kind+'_CHILD_START\\n')+");f.flush();time.sleep(.2);f.write("+repr(kind+'_CHILD_END\\n')+");f.flush()"\nr=m.run_owned([sys.executable,'-c',code],seconds=.06 if os.environ.get('DUMMY_FORCE')=='1' and release=='new' else 2)\npathlib.Path(receipt).write_text(json.dumps(r))\nraise SystemExit((128+r['signals'][0]) if r['signals'] and r['settledForRollback'] else (r['childExit'] if r['settledForRollback'] else 125))\n''')
    fragment=fragment.replace('/usr/bin/python3 -I "$support"',sys.executable+' '+str(driver)+' '+str(HERE/'operator-support.py'))
    def shell_case(name,body,signals=0,force=False,cleanupfail=False,rmfail=False,spawn_signal=False,group_signal=False):
        case=root/name;case.mkdir();work=case/'work';work.mkdir();log=case/'events';log.write_text('')
        header='''set -euo pipefail
old=old
new=new
root=/inert
current=/inert/current
previous=/inert/previous
previous_before=
set_pointer(){ echo "POINTER_$1_$2"; }
readlink(){ echo /inert/old; }
writer(){ echo MOCK_WRITER; }
systemctl(){ :; }
curl(){ :; }
'''+('rmdir(){ return 1; }\n' if cleanupfail else '')+('rm(){ return 1; }\n' if rmfail else '')+'work='+str(work)+'\n'
        piece=fragment.replace('  activation_pid=$!', '  kill -TERM "$$"\n  activation_pid=$!') if spawn_signal else fragment
        script=header+piece+'\n'+body+'\n';(case/'extracted.probe.sh').write_text(script)
        env=os.environ.copy();env['DUMMY_LOG']=str(log)
        if force:env['DUMMY_FORCE']='1'
        p=subprocess.Popen(['/bin/bash','--noprofile','--norc'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=env,start_new_session=True)
        p.stdin.write(script);p.stdin.close();p.stdin=None
        if signals:
            end=time.monotonic()+3
            while 'FORWARD_CHILD_START' not in log.read_text():
                assert p.poll() is None and time.monotonic()<end;time.sleep(.005)
            (os.killpg if group_signal else os.kill)(p.pid,signal.SIGTERM)
            if signals==2:time.sleep(.03);os.kill(p.pid,signal.SIGTERM)
        so,se=p.communicate(timeout=6);events=log.read_text();record={'name':name,'exit':p.returncode,'stdout':so,'stderr':se,'events':events}
        print(json.dumps({'shellProbe':record}),flush=True)
        return record
    def term_pointer():
        r=shell_case('term-pointer','changed=true\nkill -TERM "$$"')
        assert r['exit']==143 and 'REVERSE_CHILD_END' in r['events'] and 'canonical_previous' in r['stdout']
    probe('TERM after pointer arms confirmed reverse',term_pointer)
    def during(signals):
        r=shell_case('term-activation-'+str(signals),'changed=true\nactivate_owned new forward\nexit 42',signals=signals)
        assert r['exit']==143;assert r['events'].index('FORWARD_CHILD_END')<r['events'].index('REVERSE_CHILD_START');assert r['events'].count('REVERSE_CHILD_START')==1
    probe('TERM during real dummy activation waits before reverse',lambda:during(1))
    probe('double TERM does not reenter recovery',lambda:during(2))
    def group_term():
        r=shell_case('group-term','changed=true\nactivate_owned new forward',signals=1,group_signal=True)
        assert r['exit']==143 and r['events'].index('FORWARD_CHILD_END')<r['events'].index('REVERSE_CHILD_START')
    probe('process-group TERM reaches shell and supervisor without reverse overlap',group_term)

    def ordinary():
        r=shell_case('ordinary','changed=true\nactivate_owned new forward\nexit 42')
        assert r['exit']==42 and r['events'].index('FORWARD_CHILD_END')<r['events'].index('REVERSE_CHILD_START')
    probe('ordinary failure preserves original status after confirmed recovery',ordinary)
    def uncertain():
        r=shell_case('uncertain','changed=true\nactivate_owned new forward',force=True)
        assert r['exit']!=0 and 'REVERSE' not in r['events'] and 'recovery_required:uncertain_state' in r['stderr']
    probe('unconfirmed activation prevents all reverse mutation',uncertain)
    def cleanup():
        r=shell_case('cleanup','activation_complete=true\nchanged=false\nexit 0',cleanupfail=True)
        assert r['exit']==74 and 'owned_cleanup_unconfirmed' in r['stderr'] and 'cleanup_verified' not in r['stdout'] and not r['events']
    probe('healthy activation cleanup-only failure is nonzero without rollback',cleanup)
    def success():
        r=shell_case('success','activation_complete=true\nchanged=false\nexit 0')
        assert r['exit']==0 and 'cleanup_verified' in r['stdout']
    probe('full success emitted only after cleanup',success)
    def spawn_window():
        r=shell_case('spawn-window','changed=true\nactivate_owned new forward',spawn_signal=True)
        assert r['exit']==143 and r['events'].index('FORWARD_CHILD_END')<r['events'].index('REVERSE_CHILD_START')
    probe('TERM between spawn and PID assignment retains ownership',spawn_window)
    def rm_failure():
        r=shell_case('rm-fail','activation_complete=true\nchanged=false\nexit 0',rmfail=True)
        assert r['exit']==74 and 'owned_cleanup_unconfirmed' in r['stderr'] and 'cleanup_verified' not in r['stdout']
    probe('rm failure also prevents full completion',rm_failure)

print(json.dumps({'scope':'isolated candidate components only; no production procedure or approved activation executed','count':len(results),'results':results,'formalApproval':False},indent=2))
