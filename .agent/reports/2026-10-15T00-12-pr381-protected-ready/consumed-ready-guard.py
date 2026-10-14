from pathlib import Path
import subprocess,json,datetime,hashlib,zipfile
repo='Kaichen9527/stockinsider'; source='c68864cd4125b2dc5e9249312ef9188bfdedcb82';base='5189547f76bf24c002b8e8b11669081ba67ad2c6';evidence='c83f103c3ddd1e582b4544c168bc46a2a80c056c'; runid=38590829287
root=Path('/tmp/stockinsider-discovery-snapshot-root-review-oct14');out=Path('/tmp/stockinsider-pr381-protected-ready-oct15');audit=Path('/tmp/stockinsider-pr381-ready-oct15.json')
def call(args): return subprocess.check_output(args,cwd=root)
def api(args): return json.loads(call(['gh',*args]))
# Read-only checks all precede the single authorized state transition.
run=api(['run','view',str(runid),'--repo',repo,'--json','databaseId,status,conclusion,attempt,headSha,jobs'])
assert run['status']=='completed' and run['conclusion']=='success' and run['attempt']==2 and run['headSha']==source
expected={'stockinsider-v3-gate-bootstrap','requirements','architecture','exact-review','model-runner-code-gate','product-runtime-code-gate','stockinsider-v3-gate-root'}
assert {j['name'] for j in run['jobs']}==expected and len(run['jobs'])==7
assert all(j['status']=='completed' and j['conclusion']=='success' for j in run['jobs'])
pr=api(['pr','view','381','--repo',repo,'--json','number,url,state,isDraft,headRefOid,baseRefOid,mergeStateStatus,mergeable'])
assert pr['number']==381 and pr['state']=='OPEN' and pr['isDraft'] and pr['headRefOid']==source and pr['baseRefOid']==base and pr['mergeable']=='MERGEABLE'
rules=api(['api',f'repos/{repo}/rulesets/20177392']);assert rules['enforcement']=='active' and rules['bypass_actors']==[]
previous=json.loads(Path('/tmp/stockinsider-pr381-reuse-fresh-exact-oct14/rules-before-rerun.json').read_text());assert previous==rules
runs=api(['run','list','--repo',repo,'--commit',source,'--limit','30','--json','databaseId,status,conclusion,workflowName'])
assert all(r['status']=='completed' for r in runs)
assert [r for r in runs if r['databaseId']==38590834521][0]['conclusion']=='success'
for ref,wanted in [('refs/heads/main',base),('refs/heads/codex/reviewed-publication-artifact-release-oct14',source),('refs/heads/evidence/source-led-opportunity-v3-exact-review-'+source,evidence)]:
 assert call(['git','ls-remote','origin',ref]).decode().split()[0]==wanted
assert call(['git','show','-s','--format=%P',evidence]).decode().strip()==source
assert not audit.exists()
# No previous successful ready event for this PR may be repeated under a new date.
for p in Path('/tmp').glob('stockinsider-pr381-ready-oct*.json'):
 old=json.loads(p.read_text());assert old.get('exit')!=0,('already_consumed_ready',str(p))
out.mkdir(exist_ok=False)
for name,value in [('completed-attempt2-run.json',run),('before-pr.json',pr),('before-rules.json',rules),('before-head-runs.json',runs)]: (out/name).write_text(json.dumps(value,indent=2)+'\n')
logs=call(['gh','api',f'repos/{repo}/actions/runs/{runid}/attempts/2/logs']);(out/'attempt2-logs.zip').write_bytes(logs)
assert zipfile.ZipFile(out/'attempt2-logs.zip').testzip() is None
(out/'log-verification.json').write_text(json.dumps({'bytes':len(logs),'sha256':hashlib.sha256(logs).hexdigest(),'runId':runid,'attempt':2,'sevenJobsAllTrueSuccess':True},indent=2)+'\n')
command=['gh','pr','ready','381','--repo',repo];result=subprocess.run(command,cwd=root,capture_output=True,text=True)
audit.write_text(json.dumps({'pr':381,'source':source,'base':base,'freshEvidence':evidence,'protectedRunId':runid,'protectedAttempt':2,'ordinaryRunId':38590834521,'command':command,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr,'manualCIrerun':False,'mergeAttempted':False},indent=2)+'\n')
assert result.returncode==0,result.stderr
updated=api(['pr','view','381','--repo',repo,'--json','number,state,isDraft,headRefOid,baseRefOid']);assert updated['state']=='OPEN' and not updated['isDraft'] and updated['headRefOid']==source and updated['baseRefOid']==base
current=api(['api',f'repos/{repo}/rulesets/20177392']);assert current==rules
(out/'after-pr.json').write_text(json.dumps(updated,indent=2)+'\n');(out/'after-rules.json').write_text(json.dumps(current,indent=2)+'\n')
print(json.dumps({'ready':True,'source':source,'audit':str(audit),'sevenTrueProtectedJobsSaved':True,'rulesUnchanged':True,'merge':False}))
