from pathlib import Path
import subprocess,json,datetime
wt=Path('/tmp/stockinsider-discovery-release-root-review-oct14');report=Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/.agent/reports/2026-10-14T09-25-pr377-normal-merge');report.mkdir(parents=True,exist_ok=False)
audit=Path('/tmp/stockinsider-pr377-normal-merge-audit-oct14.json');assert not audit.exists(),'normal merge already attempted; do not repeat'
head='e9c56d7cacb17f0ce5a5ea202cff09c7c49df610';base='aa111a54c7108f043eebc1a5b0682391fc88aef9';evidence='596a81c42947c01af90204e6dd72fd5b113e619a'
def get(args):
 r=subprocess.run(args,cwd=wt,capture_output=True,text=True);assert r.returncode==0,(args,r.stderr);return r.stdout
run=get(['gh','run','view','38489616462','--repo','Kaichen9527/stockinsider','--json','databaseId,headSha,status,conclusion,attempt,jobs']);d=json.loads(run)
expected={'requirements','architecture','exact-review','stockinsider-v3-gate-bootstrap','product-runtime-code-gate','model-runner-code-gate','stockinsider-v3-gate-root'}
assert d['headSha']==head and d['attempt']==1 and d['status']=='completed' and d['conclusion']=='success'
assert {x['name'] for x in d['jobs']}==expected and all(x['status']=='completed' and x['conclusion']=='success' for x in d['jobs'])
(report/'ready-event-protected.json').write_text(run)
(report/'ready-event-protected.log').write_text(get(['gh','run','view','38489616462','--repo','Kaichen9527/stockinsider','--log']))
ordinary=[]
for rid in ['38477285982','38477286173','38477285994','38477286023']:
 v=json.loads(get(['gh','run','view',rid,'--repo','Kaichen9527/stockinsider','--json','databaseId,headSha,status,conclusion']))
 assert v['headSha']==head and v['status']=='completed' and v['conclusion']=='success';ordinary.append(v)
(report/'ordinary-terminal.json').write_text(json.dumps(ordinary,indent=2)+'\n')
pr=json.loads(get(['gh','pr','view','377','--repo','Kaichen9527/stockinsider','--json','number,state,isDraft,headRefOid,baseRefOid,mergeable,mergeStateStatus,statusCheckRollup']))
assert pr['state']=='OPEN' and not pr['isDraft'] and pr['headRefOid']==head and pr['baseRefOid']==base and pr['mergeable']=='MERGEABLE' and pr['mergeStateStatus']=='CLEAN'
(report/'pr-before-merge.json').write_text(json.dumps(pr,indent=2)+'\n')
rules=get(['gh','api','repos/Kaichen9527/stockinsider/rulesets/20177392']);rule=json.loads(rules);assert rule['enforcement']=='active' and rule['bypass_actors']==[];(report/'rules-before-merge.json').write_text(rules)
ref=get(['git','ls-remote','origin','refs/heads/evidence/source-led-opportunity-v3-exact-review-'+head]);assert ref.split()[0]==evidence;(report/'exact-ref.txt').write_text(ref)
assert get(['git','ls-remote','origin','refs/heads/main']).split()[0]==base
assert get(['git','rev-parse',evidence+'^']).strip()==head
assert get(['git','status','--porcelain=v1','--untracked-files=all']).strip()==''
a={'schema':'normal-merge-once-v1','pr':377,'subject':head,'base':base,'evidence':evidence,'protected_run':38489616462,'seven_actual_success':True,'ordinary_actual_success':True,'rules_active':True,'bypass_actors':[],'command':['gh','pr','merge','377','--merge','--match-head-commit',head,'--repo','Kaichen9527/stockinsider'],'requested_at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'status':'invocation_started','admin_or_auto_or_direct_push':False}
audit.write_text(json.dumps(a,indent=2)+'\n')
r=subprocess.run(a['command'],cwd=wt,text=True,capture_output=True);a.update({'exit_code':r.returncode,'stdout':r.stdout,'stderr':r.stderr,'status':'merge_requested' if r.returncode==0 else 'merge_failed_do_not_repeat_without_investigation'});audit.write_text(json.dumps(a,indent=2)+'\n');assert r.returncode==0,(r.returncode,r.stderr)
post=json.loads(get(['gh','pr','view','377','--repo','Kaichen9527/stockinsider','--json','state,isDraft,headRefOid,baseRefOid,mergedAt,mergeCommit,url']))
assert post['state']=='MERGED' and post['headRefOid']==head and post['baseRefOid']==base
merge=post['mergeCommit']['oid'];remote=get(['git','ls-remote','origin','refs/heads/main']).split()[0];assert remote==merge
get(['git','fetch','origin',merge])
parents=get(['git','show','-s','--format=%P',merge]).strip().split();assert parents==[base,head],parents
tree=get(['git','rev-parse',merge+'^{tree}']).strip();assert tree==get(['git','rev-parse',head+'^{tree}']).strip()
postrules=get(['gh','api','repos/Kaichen9527/stockinsider/rulesets/20177392']);assert json.loads(postrules)==rule;(report/'rules-after-merge.json').write_text(postrules)
(report/'pr-after-merge.json').write_text(json.dumps(post,indent=2)+'\n')
a.update({'status':'MERGED','merge_commit':merge,'merged_at':post['mergedAt'],'remote_main':remote,'parents':parents,'tree':tree,'web_tree':get(['git','rev-parse',merge+':web']).strip(),'rules_before_after_identical':True,'production_migration_or_deploy_executed':False});audit.write_text(json.dumps(a,indent=2)+'\n');(report/'normal-merge-audit.json').write_text(audit.read_text());print(json.dumps(a))
