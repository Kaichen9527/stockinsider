#!/usr/bin/python3
import fcntl,json,os,subprocess,time,datetime
from pathlib import Path
root=Path('/run/stockinsider-main169-refresh-watch-oct11')
locks=[]
for name in ('vps-heavy-operation.lock','stockinsider-production-write.lock'):
 fd=os.open('/run/lock/'+name,os.O_CREAT|os.O_WRONLY,0o600)
 fcntl.flock(fd,fcntl.LOCK_EX|fcntl.LOCK_NB);locks.append(fd)
query="""BEGIN READ ONLY; SET LOCAL statement_timeout='10s';
SELECT json_build_object('pipelineId',p.id,'pipelineStatus',p.status,'pipelineFinishedAt',p.finished_at,
'researchId',r.id,'researchStatus',r.status,'candidateCount',r.candidate_count,
'finishedAt',r.finished_at,'terminalReason',r.terminal_reason,'coverage',r.summary->'tradePlanCoverage',
'itemCount',(SELECT count(*) FROM public.candidate_research_run_items i WHERE i.run_id=r.id))
FROM public.pipeline_runs p JOIN public.candidate_research_runs r ON r.pipeline_run_id=p.id
WHERE p.id='918db413-a56c-4cd6-86f8-617b4a6b1239' AND r.id='d500fa84-e57b-4c3d-bafd-deac37ebf249';
ROLLBACK;"""
end=time.monotonic()+5400
last=None
while time.monotonic()<end:
 try:
  p=subprocess.run(['/usr/sbin/runuser','-u','postgres','--','/usr/bin/env','-i','PATH=/usr/bin:/bin','PGCONNECT_TIMEOUT=5','/usr/bin/psql','-h','/var/run/postgresql','-p','5432','-U','postgres','-d','stockinsider','-X','-w','-A','-t','-q','-v','ON_ERROR_STOP=1'],input=query,text=True,capture_output=True,timeout=min(15,max(0.001,end-time.monotonic())))
  if time.monotonic()>=end: break
  if p.returncode: raise RuntimeError('readonly_probe_exit_'+str(p.returncode))
  rows=[json.loads(line) for line in p.stdout.splitlines() if line.startswith('{')]
  if len(rows)!=1: raise RuntimeError('readonly_probe_expected_one_row')
  last=rows[0]
  result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'observing','result':last,'readOnly':True,'noRetryOrPublication':True}
  if last['pipelineStatus'] in ('success','failed'):
   result['state']='terminal'
  if time.monotonic()>=end: break
  temp=root/'latest.json.tmp';temp.write_text(json.dumps(result,indent=2)+'\n');os.replace(temp,root/'latest.json')
  if time.monotonic()>=end: break
  if result['state']=='terminal':
   print(json.dumps(result),flush=True);raise SystemExit(0 if last['pipelineStatus']=='success' else 1)
 except Exception as error:
  result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'probe_failed','errorType':type(error).__name__,'readOnly':True,'noRetryOrPublication':True}
  temp=root/'latest.json.tmp';temp.write_text(json.dumps(result)+'\n');os.replace(temp,root/'latest.json')
 remaining=end-time.monotonic()
 if remaining<=0: break
 time.sleep(min(30,remaining))
result={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'state':'observation_deadline','result':last,'readOnly':True,'noRetryOrPublication':True}
(root/'latest.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result),flush=True)
raise SystemExit(2)
