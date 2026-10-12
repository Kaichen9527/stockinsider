import subprocess,json,pathlib,datetime
repo='Kaichen9527/stockinsider';subject='c82e0e4ed3670d195a76830d81e5851c1b0bdf1e';base='0997336d0eb8ec43ea0899f22fe5a03cc774518f';run='38216491152'
out=pathlib.Path('/tmp/stockinsider-pr375-normal-merge-audit-oct12.json')
assert not out.exists(),'one-use audit already exists'
def gh(*a):return json.loads(subprocess.check_output(['gh',*a],text=True))
rules=gh('api',f'repos/{repo}/rulesets/20177392');assert rules['enforcement']=='active' and rules['bypass_actors']==[]
required=[r for r in rules['rules'] if r['type']=='required_status_checks'];assert len(required)==1
assert any(c['context']=='stockinsider-v3-gate-root' for c in required[0]['parameters']['required_status_checks'])
r=gh('run','view',run,'--repo',repo,'--json','headSha,status,conclusion,jobs');assert r['headSha']==subject and r['status']=='completed' and r['conclusion']=='success'
expected={'stockinsider-v3-gate-bootstrap','requirements','architecture','exact-review','model-runner-code-gate','product-runtime-code-gate','stockinsider-v3-gate-root'}
assert {j['name'] for j in r['jobs']}==expected
assert all(j['status']=='completed' and j['conclusion']=='success' for j in r['jobs'])
p=gh('pr','view','375','--repo',repo,'--json','headRefOid,baseRefOid,baseRefName,isDraft,state,mergeStateStatus,statusCheckRollup');assert p['headRefOid']==subject and p['baseRefOid']==base and p['baseRefName']=='main' and p['isDraft']==False and p['state']=='OPEN' and p['mergeStateStatus']=='CLEAN',p
for name in expected|{'Candidate discovery admission and UI diagnostics','product-runtime','stockinsider-v3-diagnostic-product-runtime'}:
 matches=[x for x in p['statusCheckRollup'] if x.get('name')==name and (name not in expected or f'/runs/{run}/job/' in x.get('detailsUrl',''))];assert len(matches)==1 and matches[0]['status']=='COMPLETED' and matches[0]['conclusion']=='SUCCESS',(name,matches)
assert subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]==base
before={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected':r,'pr':p,'rules':rules,'source':subject,'expectedMain':base,'method':'standard gh pr merge --merge --match-head-commit; no admin/bypass/direct main push'}
out.write_text(json.dumps({'before':before,'mergeStarted':False},ensure_ascii=False,indent=2)+'\n')
subprocess.run(['gh','pr','merge','375','--repo',repo,'--merge','--match-head-commit',subject],check=True)
post=gh('pr','view','375','--repo',repo,'--json','headRefOid,state,mergeCommit,mergedAt,url');afterRules=gh('api',f'repos/{repo}/rulesets/20177392')
assert afterRules==rules,'rules changed externally during merge; no rules mutation performed by this script'
assert post['headRefOid']==subject and post['state']=='MERGED' and post['mergeCommit']['oid']
remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0];assert remote==post['mergeCommit']['oid']
out.write_text(json.dumps({'before':before,'mergeStarted':True,'after':post,'rulesUnchanged':True,'main':remote,'deployment':'not performed by this merge script'},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'main':remote,'mergedAt':post['mergedAt'],'audit':str(out)}))
