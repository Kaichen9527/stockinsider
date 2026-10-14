from pathlib import Path
import subprocess,os,time,json,signal,pwd,datetime
root=Path('/tmp/si-pubtail-o14');out=Path('/tmp/compat-session-o14');env=dict(os.environ);env['PATH']='/workspace/.tools/node22/node_modules/.bin:'+env['PATH'];env['USER']=pwd.getpwuid(os.geteuid()).pw_name
floor=8589934592
for stage in ['typecheck','lint','build']:
 before={x:os.statvfs(x).f_bavail*os.statvfs(x).f_frsize for x in ['/workspace','/tmp']}
 if min(before.values())<floor:raise RuntimeError('capacity_before_'+stage)
 cmd=['npm','--prefix','web','run',stage];start=time.time();peak=0;minfree=dict(before);samples=0;bound=None
 with (out/'raw'/f'{stage}.stdout').open('w')as stdout,(out/'raw'/f'{stage}.stderr').open('w')as stderr:
  proc=subprocess.Popen(cmd,cwd=root,env=env,stdout=stdout,stderr=stderr,start_new_session=True)
  while proc.poll()is None:
   rows=[]
   for line in subprocess.check_output(['ps','-eo','pid=,ppid=,rss='],text=True).splitlines():
    try:rows.append(tuple(map(int,line.split())))
    except ValueError:pass
   ids={proc.pid};change=True
   while change:
    nxt={pid for pid,ppid,rss in rows if ppid in ids};change=not nxt.issubset(ids);ids|=nxt
   rss=sum(rss*1024 for pid,ppid,rss in rows if pid in ids);peak=max(peak,rss);samples+=1
   for x in minfree:minfree[x]=min(minfree[x],os.statvfs(x).f_bavail*os.statvfs(x).f_frsize)
   if peak>floor or min(minfree.values())<floor or time.time()-start>600:
    bound='rss'if peak>floor else 'disk'if min(minfree.values())<floor else 'time';os.killpg(proc.pid,signal.SIGTERM);break
   time.sleep(.25)
  code=proc.wait(timeout=30)
 r={'stage':stage,'command':cmd,'cwd':str(root),'startedAt':datetime.datetime.fromtimestamp(start,datetime.timezone.utc).isoformat(),'durationSeconds':time.time()-start,'exit':code,'boundStop':bound,'peakSampledProcessTreeRssBytes':peak,'sampleIntervalSeconds':.25,'samples':samples,'minFreeBytes':minfree,'beforeFreeBytes':before};(out/(stage+'-result.json')).write_text(json.dumps(r,indent=2));print(json.dumps(r),flush=True)
 if code or bound:break
