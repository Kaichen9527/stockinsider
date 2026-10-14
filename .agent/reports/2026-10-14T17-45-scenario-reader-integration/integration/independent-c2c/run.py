import subprocess,time,os,sys,json,signal,datetime
from pathlib import Path
label=sys.argv[1]; cmd=sys.argv[2:]; out=Path('/tmp/scenario-reader-review-o14/raw'); env=dict(os.environ);env['PATH']='/workspace/.tools/node22/node_modules/.bin:'+env['PATH'];env['USER']=__import__('pwd').getpwuid(os.geteuid()).pw_name
floor=8589934592
samples=[]
def sample(pid=None):
 rss=0
 if pid:
  rows=[]
  for d in Path('/proc').iterdir():
   if d.name.isdigit():
    try:
     x=(d/'stat').read_text(); fields=x[x.rindex(')')+2:].split();rows.append((int(d.name),int(fields[1]),int(fields[21])*os.sysconf('SC_PAGE_SIZE')))
    except (OSError,ValueError,IndexError):pass
  ids={pid}
  for _ in range(10):
   n=ids|{p for p,pp,r in rows if pp in ids}
   if n==ids:break
   ids=n
  rss=sum(r for p,pp,r in rows if p in ids)
 return {'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'rss':rss,'free':{p:os.statvfs(p).f_bavail*os.statvfs(p).f_frsize for p in ['/workspace','/tmp']}}
s=sample();samples.append(s)
if min(s['free'].values())<floor:raise SystemExit('capacity_admission_failed')
t0=time.monotonic();status='completed'
with (out/(label+'.stdout')).open('wb') as o,(out/(label+'.stderr')).open('wb') as e:
 p=subprocess.Popen(cmd,cwd='/tmp/si-pubtail-o14',env=env,stdout=o,stderr=e,start_new_session=True)
 while p.poll() is None:
  s=sample(p.pid);samples.append(s)
  if min(s['free'].values())<floor or s['rss']>floor or time.monotonic()-t0>600:
   status='resource_or_time_stop';os.killpg(p.pid,signal.SIGTERM);break
  time.sleep(.15)
 try:rc=p.wait(timeout=10)
 except subprocess.TimeoutExpired:os.killpg(p.pid,signal.SIGKILL);rc=p.wait()
samples.append(sample());record={'command':cmd,'cwd':'/tmp/si-pubtail-o14','exit':rc,'status':status,'seconds':time.monotonic()-t0,'peakSampledRSS':max(s['rss'] for s in samples),'minimumFree':{p:min(s['free'][p] for s in samples) for p in ['/workspace','/tmp']},'samples':samples};(out/(label+'.run.json')).write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({k:v for k,v in record.items() if k!='samples'}));sys.exit(0 if rc==0 else 1)
