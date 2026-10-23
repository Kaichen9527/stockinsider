#!/usr/bin/env python3
"""Isolated Linux browser acceptance over read-only owned PostgreSQL snapshots.
No .env files or real data/credentials. Does not establish Contabo isolation.
"""
import argparse,datetime,hashlib,json,os,secrets,shutil,signal,subprocess,time,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
NODE_SHA='1abce2374a485bddae3c27b17a3e3143e2780232026e627c4fe74ddde3f380a1'

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--snapshots',required=True);parser.add_argument('--output',required=True);parser.add_argument('--suite',choices=['ui','revision','worker','rights','current'],default='ui');parser.add_argument('--browser',choices=['/usr/bin/chromium','/usr/bin/google-chrome'],default='/usr/bin/chromium');args=parser.parse_args()
    NODE=Path(shutil.which('node') or '/workspace/.tools/node22/node_modules/node/bin/node').resolve(strict=True)
    with NODE.open('rb') as f:node_sha=hashlib.file_digest(f,'sha256').hexdigest()
    if subprocess.check_output([str(NODE),'--version'],text=True).strip()!='v22.14.0' or node_sha!=NODE_SHA:raise SystemExit('original_pinned_Node22_required')
    source=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if os.environ.get('VNEXT_BROWSER_BUILD_SOURCE_SHA')!=source or subprocess.run(['git','diff','--quiet','--','web/src'],cwd=ROOT).returncode:raise SystemExit('same_built_clean_runtime_source_required')
    output=Path(args.output);snapshots=Path(args.snapshots)
    if not output.is_absolute() or output.exists() or not snapshots.is_absolute():raise SystemExit('fresh_absolute_owned_output_and_snapshot_required')
    for name in (['home.json','detail.json','home-before.json','detail-before.json'] if args.suite in ['revision','rights','current'] else ['home.json','detail.json']):
        p=snapshots/name
        if p.is_symlink() or not p.is_file() or p.stat().st_size>1048576:raise SystemExit('bounded_regular_snapshots_required')
    for p in [str(ROOT),'/tmp']:
        s=os.statvfs(p)
        if s.f_bavail*s.f_frsize<8589934592+268435456:raise SystemExit('original_floor_plus_256MiB_browser_reference_hold')
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
        E2E_BASE_URL='http://127.0.0.1:34230',PLAYWRIGHT_SKIP_WEBSERVER='1',VNEXT_CHROMIUM_EXECUTABLE=args.browser,VNEXT_E2E_JSON=str(output/'playwright.json'),
        NEXT_TELEMETRY_DISABLED='1')
    env.pop('NODE_OPTIONS',None)
    children=[];logs=[];report={'scope':'isolated Linux installed Chromium-engine browser / synthetic read-only transport of actual isolated DB snapshots, not real-source or Contabo acceptance',
        'startedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'appSourceSha256':hashlib.sha256((ROOT/'web/src/app/components/vnext/Home.tsx').read_bytes()).hexdigest(),
        'sourceCommit':source,'nodeSha256':NODE_SHA,'harnessSha256':hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
        'buildId':(ROOT/'web/.next/BUILD_ID').read_text().strip(),'requiredServerFilesSha256':hashlib.sha256((ROOT/'web/.next/required-server-files.json').read_bytes()).hexdigest(),
        'browserVersion':subprocess.run([args.browser,'--version'],capture_output=True,text=True,check=True).stdout.strip(),
        'browserLauncher':args.browser,'launcherSha256':hashlib.sha256(Path(args.browser).read_bytes()).hexdigest(),'suite':args.suite,'snapshotHashes':{name:hashlib.sha256((snapshots/name).read_bytes()).hexdigest() for name in (['home.json','detail.json','home-before.json','detail-before.json'] if args.suite in ['revision','rights','current'] else ['home.json','detail.json'])}}
    # Chrome's distro launcher can be a shell script, not the actual ELF.
    browser_binary=Path('/opt/google/chrome/chrome') if args.browser=='/usr/bin/google-chrome' else Path('/usr/lib/chromium/chromium')
    if not browser_binary.is_file():raise SystemExit('installed_browser_ELF_identity_required')
    with browser_binary.open('rb') as f:
        if f.read(4)!=b'\x7fELF':raise SystemExit('installed_browser_ELF_identity_required')
    with browser_binary.open('rb') as f:report['browserBinarySha256']=hashlib.file_digest(f,'sha256').hexdigest()
    tracked={};minimum={str(ROOT):None,'/tmp':None};peak=0;violation=None;contained=False
    def proc(pid):
        fields=Path(f'/proc/{pid}/stat').read_text().rsplit(')',1)[1].split()
        return {'pid':pid,'start':fields[19],'state':fields[0],'rss':int(fields[21])*os.sysconf('SC_PAGE_SIZE')}
    def sample():
        nonlocal peak,violation
        pending=[os.getpid()];seen={}
        while pending:
            pid=pending.pop()
            if pid in seen:continue
            if len(seen)>=4096:raise RuntimeError('owned_browser_process_bound')
            try:
                item=proc(pid);seen[pid]=item;tracked[(pid,item['start'])]=item
                tasks=list(Path(f'/proc/{pid}/task').iterdir())
                if len(tasks)>1024:raise RuntimeError('owned_browser_task_bound')
                for task in tasks:
                    try:pending.extend(map(int,(task/'children').read_text().split()))
                    except FileNotFoundError:pass
            except FileNotFoundError:pass
        rss=sum(p['rss'] for p in seen.values());peak=max(peak,rss)
        for p in minimum:
            s=os.statvfs(p);free=s.f_bavail*s.f_frsize;minimum[p]=free if minimum[p] is None else min(free,minimum[p])
            if free<8589934592:
                violation={'kind':'floor','filesystem':p,'free':free,'floor':8589934592};raise RuntimeError('original_browser_resource_floor_breached')
        if rss>=8589934592:
            violation={'kind':'rss','sampledRss':rss,'limit':8589934592};raise RuntimeError('original_browser_RSS_bound_breached')
    def start(name,cmd,cwd):
        log=(output/(name+'.log')).open('wb');logs.append(log);p=subprocess.Popen(cmd,cwd=cwd,env=env,stdout=log,stderr=subprocess.STDOUT);children.append((name,p));return p
    def ready(url,proc,timeout=60):
        until=time.monotonic()+timeout;opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
        while time.monotonic()<until:
            sample()
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
        completed=subprocess.Popen(command,cwd=ROOT/'web',env=env,stdout=log,stderr=subprocess.STDOUT);children.append(('playwright',completed));end=time.monotonic()+900
        while completed.poll() is None:
            sample()
            if time.monotonic()>end:raise RuntimeError('owned_browser_acceptance_timeout')
            time.sleep(.5)
        code=completed.returncode;sample()
        report.update(testCommand=command,exit=code)
    except Exception as error:
        report['errorType']=type(error).__name__;report['errorHash']=hashlib.sha256(str(error).encode()).hexdigest();raise
    finally:
        cleanup=[]
        for name,p in reversed(children):
            if p.poll() is None:p.send_signal(signal.SIGTERM)
            try:p.wait(timeout=15)
            except subprocess.TimeoutExpired:contained=True;p.kill();p.wait(timeout=5)
            cleanup.append({'name':name,'pid':p.pid,'exit':p.returncode,'directProcessSettled':p.returncode is not None,'procPathAbsent':not Path('/proc',str(p.pid)).exists()})
        for log in logs:log.close()
        post=[]
        for (pid,start),old in tracked.items():
            if pid==os.getpid():continue
            try:
                current=proc(pid);state='pid_reused' if current['start']!=start else current['state'];post.append({'pid':pid,'state':state,'rssBytes':current['rss']})
                if current['start']==start and current['state']!='Z':code=1
            except FileNotFoundError:post.append({'pid':pid,'state':'absent'})
        if contained or not all(p['directProcessSettled'] and p['procPathAbsent'] for p in cleanup):code=1
        report.update(exit=code,cleanup=cleanup,ownedPostrun=post,containmentUsed=contained,resourceViolation=violation,sampledTreePeakRssBytes=peak,sampledNotInstantaneous=True,minimumFreeBytes=minimum,endedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())
        (output/'receipt.json').write_text(json.dumps(report,indent=2)+'\n')
    return code
if __name__=='__main__':raise SystemExit(main())
