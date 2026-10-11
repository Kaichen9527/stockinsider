import datetime,os,pathlib,re,signal,subprocess,sys,time,json
root=pathlib.Path('/tmp/si-887-epfuc88h');work=pathlib.Path('/workspace/cloud-reviewer-result-http-vm-oct09');label=sys.argv[1];cmd=sys.argv[2:]
clock=lambda:datetime.datetime.now(datetime.timezone.utc).isoformat()
def processes():
 d={}
 for p in pathlib.Path('/proc').iterdir():
  if not p.name.isdigit():continue
  try:
   s=(p/'stat').read_text().rsplit(')',1)[1].split();m=re.search(r'^VmRSS:\s+(\d+) kB$',(p/'status').read_text(),re.M);d[int(p.name)]=(s[0],int(s[1]),int(s[2]),int(m.group(1))*1024 if m else 0)
  except (OSError,ValueError,IndexError):pass
 return d
def family(pid,d):
 k={pid}|{n for n,v in d.items() if v[2]==pid}
 while True:
  n={x for x,v in d.items() if v[1] in k}-k
  if not n:return k
  k|=n
env={'PATH':'/workspace/.tools/node22/node_modules/.bin:/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin:/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin','TMPDIR':str(root),'LANG':'C.UTF-8','TZ':'UTC','NEXT_TELEMETRY_DISABLED':'1'}
for k in ['HTTP_PROXY','HTTPS_PROXY','ALL_PROXY','NO_PROXY','http_proxy','https_proxy','all_proxy','no_proxy','SSL_CERT_FILE','SSL_CERT_DIR','NODE_EXTRA_CA_CERTS','CURL_CA_BUNDLE','REQUESTS_CA_BUNDLE','GIT_SSL_CAINFO']:
 if os.environ.get(k):env[k]=os.environ[k]
os.umask(0o077)
started=clock();begin=time.monotonic();peak=0;reserveBefore=os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize;stop=None;seen=set()
with (root/(label+'.stdout')).open('wb') as out,(root/(label+'.stderr')).open('wb') as err:
 p=subprocess.Popen(['/workspace/cloud-acceptance-0faebfd/tools/root/usr/bin/time','-v','-o',str(root/(label+'.time')),*cmd],cwd=work,env=env,stdout=out,stderr=err,start_new_session=True)
 while p.poll() is None:
  d=processes();f=family(p.pid,d);seen|=f;peak=max(peak,sum(d[n][3]for n in f if n in d));elapsed=time.monotonic()-begin
  if elapsed>600:stop='600 second stage deadline'
  if time.time()>=datetime.datetime(2026,10,11,5,40,30,tzinfo=datetime.timezone.utc).timestamp():stop='original manual deadline cleanup allowance'
  if peak>8*1024**3:stop='8GiB sampled RSS limit'
  if os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize<8*1024**3:stop='8GiB disk reserve'
  if stop:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=3)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait()
   break
  time.sleep(.1)
 code=p.wait()
d=processes();remaining=[{'pid':n,'state':d[n][0]}for n in seen if n in d and d[n][0]!='Z']
r={'stage':label,'command':cmd,'startedAt':started,'endedAt':clock(),'exitCode':code,'elapsedSeconds':time.monotonic()-begin,'sampledAggregatePeakRssBytes':peak,'rssMethod':'100ms aggregate process group and recursive live descendants, may miss short or reparented processes','diskAvailableBeforeBytes':reserveBefore,'diskAvailableAfterBytes':os.statvfs('/workspace').f_bavail*os.statvfs('/workspace').f_frsize,'guardTermination':stop,'remainingObservedChildren':remaining,'inheritedProxyAndCA':True,'credentialValuesCopied':False}
(root/(label+'.json')).write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r));print((root/(label+'.stdout')).read_text(errors='replace')[-1800:]);print((root/(label+'.stderr')).read_text(errors='replace')[-1000:]);sys.exit(code)
