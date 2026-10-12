import pathlib,subprocess,time,json,os,sys,signal,datetime
root=pathlib.Path(__file__).parent;repo='/workspace/cloud-live-discovery-adapter-oct12';env=os.environ.copy();env['PATH']='/workspace/.tools/node22/node_modules/.bin:'+env.get('PATH','');env['NEXT_TELEMETRY_DISABLED']='1'
for label,cmd in [('focused',['node','--experimental-strip-types','--test','--test-concurrency=1','web/src/lib/live-discovery-evidence-adapter.test.ts','web/src/lib/candidate-discovery-admission.test.ts','web/src/lib/ptt-mention-provenance.test.ts','web/src/lib/candidate-research-policy.test.ts']),('typecheck',['npm','--prefix','web','run','typecheck']),('lint',['npm','--prefix','web','run','lint']),('build',['npm','--prefix','web','run','build'])]:
 minimum={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in ['/workspace','/tmp']};assert min(minimum.values())>=8*1024**3
 at=datetime.datetime.now(datetime.timezone.utc).isoformat();start=time.monotonic();peak=0;reason=None
 with open(root/(label+'.final.stdout'),'wb') as out,open(root/(label+'.final.stderr'),'wb') as err,open(root/(label+'.resources.jsonl'),'w') as sam:
  p=subprocess.Popen(cmd,cwd=repo,env=env,stdout=out,stderr=err,start_new_session=True)
  while p.poll() is None:
   rss=0
   for ent in pathlib.Path('/proc').iterdir():
    if not ent.name.isdecimal():continue
    try:
     s=(ent/'stat').read_text();f=s[s.rfind(')')+2:].split()
     if int(f[3])==p.pid:rss+=int(f[21])*os.sysconf('SC_PAGE_SIZE')
    except (OSError,ValueError,IndexError):pass
   disk={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in minimum}
   for x,v in disk.items():minimum[x]=min(minimum[x],v)
   peak=max(peak,rss);sam.write(json.dumps({'at':time.time(),'rssBytes':rss,'freeBytes':disk})+'\n');sam.flush()
   if rss>8*1024**3:reason='rss_limit'
   if min(disk.values())<8*1024**3:reason='disk_reserve'
   if time.monotonic()-start>360:reason='stage_deadline'
   if reason:
    os.killpg(p.pid,signal.SIGTERM)
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);p.wait(timeout=5)
    break
   time.sleep(.25)
 result={'command':cmd,'startAt':at,'durationSeconds':time.monotonic()-start,'exitCode':p.returncode,'stopReason':reason,'peakProcessGroupRssBytes':peak,'minimumFreeBytes':minimum}
 (root/(label+'.result.json')).write_text(json.dumps(result,indent=2)+'\n');print(label,json.dumps(result),flush=True)
 if p.returncode:sys.exit(p.returncode if p.returncode>0 else 1)
