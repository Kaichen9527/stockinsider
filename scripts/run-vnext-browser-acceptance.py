#!/usr/bin/env python3
"""VM-only browser acceptance over read-only snapshots from owned PostgreSQL tests.
No .env files or real data/credentials. Does not establish Contabo isolation.
"""
import argparse,datetime,hashlib,json,os,secrets,signal,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NODE=Path('/workspace/.tools/node22/node_modules/node/bin/node')

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--snapshots',required=True);parser.add_argument('--output',required=True);parser.add_argument('--suite',choices=['ui','revision','worker','rights','current'],default='ui');args=parser.parse_args()
    output=Path(args.output);snapshots=Path(args.snapshots)
    if not output.is_absolute() or output.exists() or not snapshots.is_absolute():raise SystemExit('fresh_absolute_owned_output_and_snapshot_required')
    for name in (['home.json','detail.json','home-before.json','detail-before.json'] if args.suite in ['revision','rights','current'] else ['home.json','detail.json']):
        p=snapshots/name
        if p.is_symlink() or not p.is_file() or p.stat().st_size>1048576:raise SystemExit('bounded_regular_snapshots_required')
    for p in ['/workspace','/tmp']:
        s=os.statvfs(p)
        if s.f_bavail*s.f_frsize<8589934592:raise SystemExit('original_resource_floor_hold')
    output.mkdir(mode=0o700)
    # Preserve proxy/CA configuration, but remove inherited app/data/model identities.
    env=dict(os.environ)
    for k in list(env):
        if k.startswith(('SUPABASE_','NEXT_PUBLIC_SUPABASE_','OPPORTUNITY_V3_','STOCKINSIDER_','RESEARCH_','INTERNAL_','CRON_','OPENAI_','ANTHROPIC_')):env.pop(k,None)
    operator,author,reviewer,control=(secrets.token_hex(32) for _ in range(4))
    env.update(PATH=str(NODE.parent)+os.pathsep+env['PATH'],NODE_TEST_CONTEXT='child-v8',LEGACY_RADAR_CORRECTNESS_PROJECTION='enabled',
        STOCKINSIDER_VNEXT_ENABLED='true',SUPABASE_URL='http://127.0.0.1:34231',SUPABASE_SERVICE_ROLE_KEY=secrets.token_hex(32),
        INTERNAL_API_KEY=operator,STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL='synthetic-browser-operator',STOCKINSIDER_VNEXT_AUTHOR_KEY=author,
        STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL='synthetic-browser-author',STOCKINSIDER_VNEXT_REVIEWER_KEY=reviewer,STOCKINSIDER_VNEXT_REVIEWER_PRINCIPAL='synthetic-browser-reviewer',
        VNEXT_BROWSER_CONTROL_KEY=control,VNEXT_BROWSER_BRIDGE_PORT='34231',VNEXT_BROWSER_FIXTURES=str(snapshots),VNEXT_E2E_OPERATOR_KEY=operator,
        E2E_BASE_URL='http://127.0.0.1:34230',PLAYWRIGHT_SKIP_WEBSERVER='1',VNEXT_CHROMIUM_EXECUTABLE='/usr/bin/chromium',VNEXT_E2E_JSON=str(output/'playwright.json'),
        NEXT_TELEMETRY_DISABLED='1',NO_PROXY='127.0.0.1,localhost')
    children=[];logs=[];report={'scope':'VM real Chromium / synthetic read-only transport of actual isolated DB snapshots, not real-source or Contabo acceptance',
        'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'appSourceSha256':hashlib.sha256((ROOT/'web/src/app/components/vnext/Home.tsx').read_bytes()).hexdigest(),
        'browserVersion':subprocess.run(['/usr/bin/chromium','--version'],capture_output=True,text=True,check=True).stdout.strip(),
        'launcherSha256':hashlib.sha256(Path('/usr/bin/chromium').read_bytes()).hexdigest(),'suite':args.suite,'snapshotHashes':{name:hashlib.sha256((snapshots/name).read_bytes()).hexdigest() for name in (['home.json','detail.json','home-before.json','detail-before.json'] if args.suite in ['revision','rights','current'] else ['home.json','detail.json'])}}
    def start(name,cmd,cwd):
        log=(output/(name+'.log')).open('wb');logs.append(log);p=subprocess.Popen(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT);children.append((name,p));return p
    def ready(url,proc,timeout=60):
        until=time.monotonic()+timeout;opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        while time.monotonic()<until:
            if proc.poll() is not None:raise RuntimeError('owned_server_exited_before_ready')
            try:
                r=opener.open(url,timeout=2)
                if r.status==200:return
            except (OSError,urllib.error.URLError):pass
            time.sleep(.25)
        raise RuntimeError('owned_server_not_ready')
    code=1
    try:
        bridge=start('bridge',[str(NODE),'scripts/vnext-browser-fixture.mjs'],ROOT)
        req=urllib.request.Request('http://127.0.0.1:34231/__fixture/control',headers={'x-test-control':control})
        ready(req,bridge)
        app=start('next',[str(NODE),'node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','--port','34230'],ROOT/'web')
        ready('http://127.0.0.1:34230/',app)
        command=[str(NODE),'node_modules/@playwright/test/cli.js','test',({'revision':'vnext-revision.spec.ts','worker':'vnext-worker.spec.ts','rights':'vnext-rights.spec.ts','current':'vnext-current.spec.ts'}.get(args.suite,'vnext.spec.ts')),'--config','playwright.vnext.config.ts','--output',str(output/'screenshots-traces')]
        log=(output/'test.log').open('wb');logs.append(log)
        completed=subprocess.run(command,cwd=ROOT/'web',env=env,stdout=log,stderr=subprocess.STDOUT,timeout=900);code=completed.returncode
        report.update(testCommand=command,exit=code)
    except Exception as error:
        report['errorType']=type(error).__name__;report['error']=str(error);raise
    finally:
        cleanup=[]
        for name,p in reversed(children):
            if p.poll() is None:p.send_signal(signal.SIGTERM)
            try:p.wait(timeout=15)
            except subprocess.TimeoutExpired:p.kill();p.wait(timeout=5)
            cleanup.append({'name':name,'pid':p.pid,'exit':p.returncode,'directProcessSettled':p.returncode is not None,'procPathAbsent':not Path('/proc',str(p.pid)).exists()})
        for log in logs:log.close()
        report.update(cleanup=cleanup,endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (output/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
    return code
if __name__=='__main__':raise SystemExit(main())
