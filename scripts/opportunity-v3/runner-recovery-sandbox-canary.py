#!/usr/bin/env python3
"""Explicit no-credential current-native candidate canary. No provider, no activation."""
import argparse, hashlib, http.server, json, os, pathlib, subprocess, tempfile, threading
ROOT = pathlib.Path(__file__).resolve().parents[2]
DOC = ROOT / 'docs/engineering/runner-recovery-20261011'
def digest(p):
    h=hashlib.sha256()
    with open(p,'rb') as f:
        for b in iter(lambda:f.read(1024*1024),b''): h.update(b)
    return h.hexdigest()
def identity(p):
    s=os.lstat(p)
    return dict(device=str(s.st_dev),inode=str(s.st_ino),size=str(s.st_size),uid=s.st_uid,gid=s.st_gid,mode=format(s.st_mode,'06o'))
def main():
    ap=argparse.ArgumentParser();ap.add_argument('--output',required=True);ap.add_argument('--installation',action='store_true');a=ap.parse_args()
    fixture=(ROOT/'.loop-engineering/state/changes/source-led-opportunity-engine-v3/model-runner-host-pins-v3.json') if a.installation else (DOC/'host-pins.candidate.json')
    pins=json.loads(fixture.read_text());assert pins['approvalAuthority'] is None
    assert pins['fixtureVersion']==('model-runner-host-pins-v3.25' if a.installation else 'model-runner-host-pins-oct11-candidate-v1')
    native=next(x for x in pins['executables'] if x['name']=='codex');node=next(x for x in pins['executables'] if x['name']=='node')
    def verify():
        for x in pins['executables']:
            assert str(pathlib.Path(x['path']).resolve())==x['realpath'] and identity(x['path'])==x['stat'] and digest(x['path'])==x['sha256']
    verify();checks=[]
    with tempfile.TemporaryDirectory(prefix='si-recovery-canary-') as temporary:
        root=pathlib.Path(temporary).resolve();root.chmod(0o700)
        view,scratch,policy,transport=[root/x for x in ['view','scratch','policy','transport']]
        for p in [view,scratch,policy,transport]:p.mkdir(mode=0o700)
        (view/'run-node22.js').write_bytes((ROOT/'scripts/run-node22.js').read_bytes())
        (view/'source.txt').write_text('synthetic source\n');(root/'private.txt').write_text('synthetic outside\n');(transport/'synthetic-private.json').write_text('{"not_credentials":true}\n')
        env={'PATH':'/usr/bin:/bin:/usr/sbin:/sbin','HOME':str(scratch),'CODEX_HOME':str(policy),'TMPDIR':str(scratch),'LANG':'C','LC_ALL':'C'}
        developer=subprocess.check_output(['/usr/bin/xcode-select','-p'],env=env,text=True).strip()
        params=dict(subjectRoot=str(view),scratch=str(scratch),policyRoot=str(policy),nodeToolchainRoot='/usr/local',pinnedNodeExecutable=node['path'],developerRoot=developer)
        script="import {candidateSandboxPolicy} from './scripts/opportunity-v3/protected-external-gate-worker.mjs';console.log(JSON.stringify(candidateSandboxPolicy(JSON.parse(process.argv[1]))));"
        cp=subprocess.run([node['path'],'--input-type=module','-e',script,json.dumps(params)],cwd=ROOT,env=env,capture_output=True,text=True,timeout=15,check=True)
        baseprofile=json.loads(cp.stdout)
        adapter="const a=require('./scripts/model-runner-v3/codexAdapter');console.log(JSON.stringify(a.profileToml(...JSON.parse(process.argv[1]))));"
        cp=subprocess.run([node['path'],'-e',adapter,json.dumps([str(view),str(scratch),str(transport)])],cwd=ROOT,env=env,capture_output=True,text=True,timeout=15,check=True)
        runnerprofile=json.loads(cp.stdout)
        profiles={'external-gate-candidate':(policy,baseprofile),'model-runner-v3':(transport,runnerprofile)}
        hits=[0]
        class Handler(http.server.BaseHTTPRequestHandler):
            def do_GET(self):
                hits[0]+=1;self.send_response(200);self.end_headers();self.wfile.write(b'local synthetic')
            def log_message(self,*args):pass
        server=http.server.ThreadingHTTPServer(('127.0.0.1',0),Handler);thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        try:
            curl=['/usr/bin/curl','--noproxy','*','-sS','--max-time','2',f'http://127.0.0.1:{server.server_port}/']
            cp=subprocess.run(curl,env=env,capture_output=True,text=True,timeout=5);assert cp.returncode==0 and hits[0]==1
            for name,(home,text) in profiles.items():
                config=home/(name+'.config.toml');config.write_text(text);config.chmod(0o600)
                e={**env,'CODEX_HOME':str(home)};prefix=[native['path'],'sandbox','--profile',name,'--permission-profile',name,'-C',str(view),'--']
                cases=[('source_read',['/bin/cat',str(view/'source.txt')],False),('scratch_write',['/bin/sh','-c','printf yes > "$1"','sh',str(scratch/'write.txt')],False),('source_write',['/bin/sh','-c','printf bad > "$1"','sh',str(view/'bad.txt')],True),('private_sibling',['/bin/cat',str(root/'private.txt')],True),('transport_read',['/bin/cat',str(transport/'synthetic-private.json')],True),('descendant_transport',['/bin/sh','-c','exec /bin/cat "$1"','sh',str(transport/'synthetic-private.json')],True)]
                for label,cmd,deny in cases:
                    cp=subprocess.run(prefix+cmd,cwd=view,env=e,capture_output=True,text=True,timeout=15)
                    ok=(cp.returncode!=0 and 'Operation not permitted' in cp.stderr) if deny else cp.returncode==0
                    checks.append(dict(policy=name,name=label,passed=ok,exitCode=cp.returncode,stdout=cp.stdout,stderr=cp.stderr))
                before=hits[0];cp=subprocess.run(prefix+curl,cwd=view,env=e,capture_output=True,text=True,timeout=5)
                checks.append(dict(policy=name,name='network_denial_positive_control',passed=cp.returncode==7 and hits[0]==before,exitCode=cp.returncode,stdout=cp.stdout,stderr=cp.stderr))
        finally:server.shutdown();server.server_close();thread.join(timeout=3)
        assert (view/'source.txt').read_text()=='synthetic source\n'
        verify()
        receipt=dict(schema='runner-recovery-no-credential-canary-v1',candidateOnly=True,protectedPass=False,modelInvoked=False,realCredentialsRead=False,fixtureSha256=digest(fixture),installationCandidate=a.installation,runNode22Sha256=digest(ROOT/'scripts/run-node22.js'),scriptSha256=digest(__file__),policyModuleSha256=digest(ROOT/'scripts/opportunity-v3/protected-external-gate-worker.mjs'),profiles={k:v[1] for k,v in profiles.items()},checks=checks,passed=all(x['passed'] for x in checks))
        with open(a.output,'x') as f:json.dump(receipt,f,indent=2);f.write('\n')
        print(json.dumps({'passed':receipt['passed'],'checks':len(checks),'failed':[(x['policy'],x['name']) for x in checks if not x['passed']]}))
        return 0 if receipt['passed'] else 1
if __name__=='__main__':raise SystemExit(main())
