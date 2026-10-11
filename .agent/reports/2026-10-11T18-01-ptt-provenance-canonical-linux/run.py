import os,sys,time,json,hashlib,subprocess,pathlib,pwd,datetime,signal
root=pathlib.Path(__file__).parent
repo=pathlib.Path('/workspace/cloud-ptt-provenance-oct12')
def utc():return datetime.datetime.now(datetime.timezone.utc).isoformat()
def sh(a):return subprocess.check_output(a,cwd=repo,text=True).strip()
source=sh(['git','rev-parse','HEAD']); assert source=='7af8cba0347010a1d2b007fc8e733ce30faf0ef3'
env=os.environ.copy();env.update(PATH='/workspace/.tools/node22/node_modules/.bin:/workspace/cloud-acceptance-0faebfd/tools/root/usr/lib/postgresql/17/bin:/opt/codex/runtimes/codex-primary-runtime/dependencies/node/bin:/usr/bin:/bin',USER=pwd.getpwuid(os.geteuid()).pw_name,TMPDIR=str(root),TZ='UTC',NEXT_TELEMETRY_DISABLED='1')
meta={'source':source,'tree':sh(['git','rev-parse','HEAD^{tree}']),'webTree':sh(['git','rev-parse','HEAD:web']),'status':sh(['git','status','--porcelain']),'startAt':utc(),'command':['npm','run','test:source-led-opportunity-v3:product-correctness'],'canonicalScript':json.load(open(repo/'package.json'))['scripts']['test:source-led-opportunity-v3:product-correctness'],'osUser':env['USER'],'node':subprocess.check_output(['node','--version'],env=env,text=True).strip(),'next':json.load(open(repo/'web/node_modules/next/package.json'))['version'],'pg':json.load(open(repo/'node_modules/pg/package.json'))['version'],'dependencyPlacement':{'root':'local hardlink directory of existing same-lock deps','web':'existing local hardlink directory'},'clock':'real; no preload or faketime set by supervisor','scratchRoot':str(root),'budgetSeconds':750}
meta['locks']={str(p):hashlib.sha256((repo/p).read_bytes()).hexdigest() for p in ['package-lock.json','web/package-lock.json']}
(root/'preflight.json').write_text(json.dumps(meta,indent=2)+'\n')
cmd=meta['command']; start=time.monotonic();peak=0;mins={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in ['/workspace','/tmp']};reason=None
assert all(v>=8*1024**3 for v in mins.values())
with open(root/'canonical.stdout','wb') as out,open(root/'canonical.stderr','wb') as err,open(root/'resources.jsonl','w') as samples:
 p=subprocess.Popen(cmd,cwd=repo,env=env,stdout=out,stderr=err,start_new_session=True)
 while p.poll() is None:
  rss=0;pids=[]
  for ent in pathlib.Path('/proc').iterdir():
   if not ent.name.isdecimal():continue
   try:
    s=(ent/'stat').read_text();fields=s[s.rfind(')')+2:].split()
    if int(fields[3])==p.pid:
     rss+=int(fields[21])*os.sysconf('SC_PAGE_SIZE');pids.append(int(ent.name))
   except (OSError,ValueError,IndexError):pass
  disk={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in mins};peak=max(peak,rss)
  for x,v in disk.items():mins[x]=min(mins[x],v)
  samples.write(json.dumps({'at':utc(),'rssBytes':rss,'diskAvailableBytes':disk,'pids':pids})+'\n');samples.flush()
  if rss>8*1024**3:reason='rss_limit'
  if any(v<8*1024**3 for v in disk.values()):reason='disk_reserve'
  if time.monotonic()-start>750:reason='manual_remaining_deadline'
  if reason:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
   break
  time.sleep(.5)
result={'startAt':meta['startAt'],'endAt':utc(),'durationSeconds':time.monotonic()-start,'exitCode':p.returncode,'stopReason':reason,'peakAggregateProcessGroupRssBytes':peak,'rssMeasurement':'/proc stat session process group sampled 0.5s; excludes shared filesystem cache','minimumDiskAvailableBytes':mins,'command':cmd}
(root/'result.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps({'artifactRoot':str(root),'result':result}),flush=True)
