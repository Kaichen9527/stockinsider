from pathlib import Path
import subprocess,json,datetime,hashlib,zipfile
repo='Kaichen9527/stockinsider';head='c68864cd4125b2dc5e9249312ef9188bfdedcb82';base='5189547f76bf24c002b8e8b11669081ba67ad2c6';evidence='c83f103c3ddd1e582b4544c168bc46a2a80c056c';tree='8ab201731bcf2a1a99e71393ac9a7e18d01ed36c';web='c516655efaac8260b1bcf5938f8f4d65ab61ad44';runid=38595486518
root=Path('/tmp/stockinsider-discovery-snapshot-root-review-oct14');out=Path('/tmp/stockinsider-pr381-normal-merge-oct15');audit=Path('/tmp/stockinsider-pr381-normal-merge-audit-oct15.json')
def raw(args):return subprocess.check_output(args,cwd=root)
def gh(args):return json.loads(raw(['gh',*args]))
run=gh(['run','view',str(runid),'--repo',repo,'--json','databaseId,status,conclusion,attempt,headSha,jobs'])
assert run['status']=='completed' and run['conclusion']=='success' and run['attempt']==1 and run['headSha']==head
names={'stockinsider-v3-gate-bootstrap','requirements','architecture','exact-review','model-runner-code-gate','product-runtime-code-gate','stockinsider-v3-gate-root'}
assert len(run['jobs'])==7 and {x['name'] for x in run['jobs']}==names
assert all(x['status']=='completed' and x['conclusion']=='success' for x in run['jobs'])
pr=gh(['pr','view','381','--repo',repo,'--json','number,url,state,isDraft,headRefOid,baseRefOid,mergeStateStatus,mergeable'])
assert pr['state']=='OPEN' and not pr['isDraft'] and pr['headRefOid']==head and pr['baseRefOid']==base
assert pr['mergeable']=='MERGEABLE' and pr['mergeStateStatus']=='CLEAN'
ready=json.loads(Path('/tmp/stockinsider-pr381-ready-oct15.json').read_text());assert ready['exit']==0 and ready['source']==head and ready['base']==base
runs=gh(['run','list','--repo',repo,'--commit',head,'--limit','30','--json','databaseId,status,conclusion,workflowName,event'])
assert all(x['status']=='completed' for x in runs)
assert [x for x in runs if x['databaseId']==38590834521][0]['conclusion']=='success'
rules=gh(['api',f'repos/{repo}/rulesets/20177392']);assert rules['enforcement']=='active' and rules['bypass_actors']==[]
assert rules==json.loads(Path('/tmp/stockinsider-pr381-protected-ready-oct15/after-rules.json').read_text())
for ref,expected in [('refs/heads/main',base),('refs/heads/codex/reviewed-publication-artifact-release-oct14',head),('refs/heads/evidence/source-led-opportunity-v3-exact-review-'+head,evidence)]:
 assert raw(['git','ls-remote','origin',ref]).decode().split()[0]==expected
assert raw(['git','show','-s','--format=%P',evidence]).decode().strip()==head
assert raw(['git','rev-parse',head+'^{tree}']).decode().strip()==tree
assert not audit.exists()
for old in Path('/tmp').glob('stockinsider-pr381-normal-merge-audit-oct*.json'):
 assert json.loads(old.read_text()).get('exit')!=0,('already_consumed_merge',str(old))
out.mkdir(exist_ok=False)
for name,value in [('before-pr.json',pr),('before-rules.json',rules),('final-ready-protected-run.json',run),('before-head-runs.json',runs)]:
 (out/name).write_text(json.dumps(value,indent=2)+'\n')
logs=raw(['gh','api',f'repos/{repo}/actions/runs/{runid}/logs']);(out/'final-ready-protected-logs.zip').write_bytes(logs)
assert zipfile.ZipFile(out/'final-ready-protected-logs.zip').testzip() is None
(out/'log-verification.json').write_text(json.dumps({'runId':runid,'attempt':1,'bytes':len(logs),'sha256':hashlib.sha256(logs).hexdigest(),'sevenGenuineJobsAllSuccess':True},indent=2)+'\n')
command=['gh','pr','merge','381','--repo',repo,'--merge','--match-head-commit',head]
r=subprocess.run(command,cwd=root,capture_output=True,text=True)
audit.write_text(json.dumps({'pr':381,'source':head,'base':base,'freshEvidence':evidence,'readyProtectedRunId':runid,'ordinaryRunId':38590834521,'command':command,'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'admin':False,'bypass':False,'autoMerge':False,'directMainPush':False,'deploymentAttempted':False},indent=2)+'\n')
assert r.returncode==0,r.stderr
final=gh(['pr','view','381','--repo',repo,'--json','number,url,state,isDraft,headRefOid,baseRefOid,mergeCommit,mergedAt'])
assert final['state']=='MERGED' and final['headRefOid']==head and final['baseRefOid']==base
merged=final['mergeCommit']['oid'];remote=raw(['git','ls-remote','origin','refs/heads/main']).decode().split()[0];assert remote==merged
raw(['git','fetch','origin',merged])
parents=raw(['git','show','-s','--format=%P',merged]).decode().strip().split();assert parents==[base,head]
assert raw(['git','rev-parse',merged+'^{tree}']).decode().strip()==tree
assert raw(['git','rev-parse',merged+':web']).decode().strip()==web
current=gh(['api',f'repos/{repo}/rulesets/20177392']);assert current==rules
(out/'after-pr.json').write_text(json.dumps(final,indent=2)+'\n');(out/'after-rules.json').write_text(json.dumps(current,indent=2)+'\n')
result={'merged':True,'mergeCommit':merged,'parents':parents,'tree':tree,'webTree':web,'mergedAt':final['mergedAt'],'remoteMain':remote,'protectedRun':runid,'sevenTrueProtectedJobs':True,'rulesCompleteJSONUnchanged':True,'directChildAttestsSourceNotMerge':evidence,'deploymentPerformed':False}
(out/'merge-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result))
