import datetime,json,os,pathlib,re,signal,subprocess,sys,time
root=pathlib.Path('/workspace/cloud-author-packet-artifacts-oct09/atomic18d');work=pathlib.Path('/workspace/cloud-reviewer-result-http-vm-oct09');label=sys.argv[1];cmd=sys.argv[2:]
clock=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def du(p):
 if not pathlib.Path(p).exists():return 0
 return int(subprocess.run(['du','-sx','-B1',str(p)],text=True,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL).stdout.split()[0])
def rss(gid):
 procs={}
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   stat=(p/'stat').read_text().rsplit(')',1)[1].split();m=re.search(r'^VmRSS:\s+(\d+) kB$',(p/'status').read_text(),re.M)
   procs[int(p.name)]=(int(stat[1]),int(stat[2]),int(m.group(1))*1024 if m else 0)
  except (OSError,ValueError,IndexError):pass
 selected={gid}|{pid for pid,(_,pg,_)in procs.items()if pg==gid}
 while True:
  new={pid for pid,(parent,_,_)in procs.items()if parent in selected}-selected
  if not new:break
  selected|=new
 return sum(procs[pid][2]for pid in selected if pid in procs)
env={'PATH':'/workspace/.tools/node22/node_modules/.bin:/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/workspace/cloud-acceptance-0faebfd/tools/bin:/usr/bin:/bin','TMPDIR':'/tmp/si-apub-qhk3mbo7','LANG':'C.UTF-8','TZ':'UTC','DATA_MODE':'demo','RADAR_PUBLIC_SNAPSHOTS_ENABLED':'disabled','NEXT_TELEMETRY_DISABLED':'1'}
for name in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS']:
 if os.environ.get(name):env[name]=os.environ[name]
env['STOCKINSIDER_TEST_PG_CLOCK_LIBRARY']='/workspace/cloud-clock-builder-770-artifacts-oct09/build-770/libfaketime.so.1'
env['RESEARCH_OBSERVED_CLAIM_VERIFY']='enabled' if label.startswith('native') else 'disabled'
if label in ['fences-monday','fences-monday-signed']:env['STOCKINSIDER_OBSERVED_TEST_CLOCK_LIBRARY']='/workspace/cloud-observed-context-artifacts-oct08/clock-tool/root/usr/lib/x86_64-linux-gnu/faketime/libfaketime.so.1'
env.update({'RESEARCH_LOCAL_DATAPLANE_VERIFY':'enabled' if label.startswith('native') else 'disabled','RESEARCH_LOCAL_DATAPLANE_ARTIFACTS':str(root/(label+'-run')),'RESEARCH_LOCAL_DATAPLANE_PG_BIN':'/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin','RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN':'/workspace/cloud-local-dataplane-artifacts-oct08/tools/postgrest'})
if label in ['input-preparation-native-v2','input-preparation-native-v2-rls-green','input-v2-live-green','input-v2-live-final','input-v2-clean','input-cap-http-clean']:env['RESEARCH_INPUT_PREPARATION_VERIFY']='enabled'
if label in ['source-fence-review-red','source-fence-review-red-final']:env['SOURCE_FENCE_REVIEW_SUBJECT']='6b49b8a1'
env['RESEARCH_LOCAL_DATAPLANE_ARTIFACTS']=str(root/'native/http')
env['FINANCIAL_NAMESPACE_ARTIFACTS']=str(root/'observe2')
env['RESEARCH_NAMESPACE_DIAGNOSTIC_ARTIFACTS']=str(root)
assert not (root/(label+'.log')).exists(), 'create-only measurement label already exists'
started=clock();initial=os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize;tick=time.monotonic();peak=0;disk=du(work)+du(root)+du('/tmp/si-apub-qhk3mbo7')+sum(du(root/('http-'+sym)) for sym in ['2409','2383']);stop=None
with (root/(label+'.log')).open('w') as log:
 proc=subprocess.Popen(['/workspace/cloud-acceptance-0faebfd/tools/root/usr/bin/time','-v','-o',str(root/(label+'.time')),*cmd],cwd=work/'web' if label.startswith(('types','lint','build','normal-build')) or label in ['input-cap-types','input-cap-lint','input-cap-build'] else work,env=env,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
 last=0
 while proc.poll() is None:
  elapsed=time.monotonic()-tick;peak=max(peak,rss(proc.pid))
  if elapsed-last>1:disk=max(disk,du(work)+du(root)+du('/tmp/si-apub-qhk3mbo7')+sum(du(root/('http-'+sym)) for sym in ['2409','2383']));last=elapsed
  if elapsed>420:stop='420s deadline'
  if peak>8*1024**3:stop='8GiB RSS guard'
  if disk>4*10**9:stop='4GB temporary workspace guard'
  if os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize<8*1024**3:stop='8GiB disk reserve guard'
  if stop:
   os.killpg(proc.pid,signal.SIGTERM)
   try:proc.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(proc.pid,signal.SIGKILL);proc.wait()
   break
  time.sleep(.1)
 code=proc.wait()
report={'rssMethod':'100ms process-group plus live recursive descendants; short/reparented processes may be missed','stage':label,'command':cmd,'startedAt':started,'completedAt':clock(),'elapsedSeconds':time.monotonic()-tick,'exitCode':code,'sampledAggregateRssPeakBytes':peak,'observedTaskDiskPeakBytes':disk,'availableBeforeBytes':initial,'availableAfterBytes':os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize,'guardTermination':stop}
(root/(label+'.json')).write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report));print((root/(label+'.log')).read_text()[-1800:]);sys.exit(code)
