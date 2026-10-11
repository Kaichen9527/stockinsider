import sys,pathlib,json,subprocess,os,time,signal,datetime
r=pathlib.Path(__file__).parent;label=sys.argv[1];cmd=sys.argv[2:];e=os.environ.copy();e['PATH']='/workspace/.tools/node22/node_modules/.bin:'+e.get('PATH','');start=time.monotonic();at=datetime.datetime.now(datetime.timezone.utc).isoformat();peak=0;minimum={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in ['/workspace','/tmp']};stop=None
assert all(v>=8*1024**3 for v in minimum.values())
with open(r/(label+'.stdout'),'wb') as out,open(r/(label+'.stderr'),'wb') as err,open(r/(label+'.resources.jsonl'),'w') as sam:
 p=subprocess.Popen(cmd,cwd='/workspace/cloud-ptt-provenance-oct12',env=e,stdout=out,stderr=err,start_new_session=True)
 while p.poll() is None:
  rss=0
  for ent in pathlib.Path('/proc').iterdir():
   if not ent.name.isdecimal():continue
   try:
    s=(ent/'stat').read_text();f=s[s.rfind(')')+2:].split()
    if int(f[3])==p.pid:rss+=int(f[21])*os.sysconf('SC_PAGE_SIZE')
   except (OSError,ValueError,IndexError):pass
  peak=max(peak,rss);disk={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in minimum}
  for x,v in disk.items():minimum[x]=min(minimum[x],v)
  sam.write(json.dumps({'at':time.time(),'rss':rss,'disk':disk})+'\n');sam.flush()
  if rss>8*1024**3:stop='rss_limit'
  if min(disk.values())<8*1024**3:stop='disk_reserve'
  if time.monotonic()-start>180:stop='stage_deadline'
  if label=='install-chromium':
   diagnostic=(r/(label+'.stderr')).read_bytes()[-32768:]+(r/(label+'.stdout')).read_bytes()[-32768:]
   if b'server returned code 403' in diagnostic or b'403 Forbidden' in diagnostic:stop='first_network_denial_no_retry'
  if stop:
   os.killpg(p.pid,signal.SIGTERM)
   try:p.wait(timeout=5)
   except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
   break
  time.sleep(.01)
result={'label':label,'command':cmd,'startAt':at,'endAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'durationSeconds':time.monotonic()-start,'stopReason':stop,'peakProcessGroupRssBytes':peak,'minimumFreeBytes':minimum}
(r/(label+'.json')).write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
