import subprocess,json,pathlib,datetime
repo='Kaichen9527/stockinsider';subject='fbc1e9b4445d388b8f954e1a3827afa4ecfb6c55';base='4dddb8f01f518350c7d54b7995ee9358c1d945a7';run='38445962328'
out=pathlib.Path('/tmp/stockinsider-pr376-normal-merge-audit-oct14.json')
assert not out.exists(),'one-use merge audit already exists; never repeat'
def gh(*a):return json.loads(subprocess.check_output(['gh',*a],text=True))
rules=gh('api',f'repos/{repo}/rulesets/20177392');assert rules['enforcement']=='active' and rules['bypass_actors']==[]
required=[r for r in rules['rules'] if r['type']=='required_status_checks'];assert len(required)==1
assert any(c['context']=='stockinsider-v3-gate-root' and c['integration_id']==15368 for c in required[0]['parameters']['required_status_checks'])
r=gh('run','view',run,'--repo',repo,'--json','headSha,status,conclusion,jobs');assert r['headSha']==subject and r['status']=='completed' and r['conclusion']=='success'
expected={'stockinsider-v3-gate-bootstrap','requirements','architecture','exact-review','model-runner-code-gate','product-runtime-code-gate','stockinsider-v3-gate-root'}
assert {j['name'] for j in r['jobs']}==expected;assert all(j['status']=='completed' and j['conclusion']=='success' for j in r['jobs'])
p=gh('pr','view','376','--repo',repo,'--json','headRefOid,baseRefOid,baseRefName,isDraft,state,mergeStateStatus,statusCheckRollup');assert p['headRefOid']==subject and p['baseRefOid']==base and p['baseRefName']=='main' and p['isDraft']==False and p['state']=='OPEN' and p['mergeStateStatus']=='CLEAN',p
for name in expected:
 matches=[x for x in p['statusCheckRollup'] if x.get('name')==name and f'/runs/{run}/job/' in x.get('detailsUrl','')];assert len(matches)==1 and matches[0]['status']=='COMPLETED' and matches[0]['conclusion']=='SUCCESS',(name,matches)
for name,ordinary in [('financial-installation-quality','38423044805'),('product-runtime','38423044617'),('stockinsider-v3-diagnostic-product-runtime','38423044617')]:
 matches=[x for x in p['statusCheckRollup'] if x.get('name')==name and f'/runs/{ordinary}/job/' in x.get('detailsUrl','')];assert len(matches)==1 and matches[0]['status']=='COMPLETED' and matches[0]['conclusion']=='SUCCESS',(name,matches)
assert subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0]==base
exactref='refs/heads/evidence/source-led-opportunity-v3-exact-review-'+subject
assert subprocess.check_output(['git','ls-remote','origin',exactref],text=True).split()[0]=='52b48944cc64b0f459e33e27ea5027aa7d18d476'
assert subprocess.check_output(['git','show','-s','--format=%P','52b48944cc64b0f459e33e27ea5027aa7d18d476'],text=True).strip()==subject
before={'observedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'protected':r,'pr':p,'rules':rules,'source':subject,'expectedMain':base,'freshExactEvidence':'52b48944cc64b0f459e33e27ea5027aa7d18d476','method':'standard gh pr merge --merge --match-head-commit; no admin/bypass/direct main push; preserve evidence branch'}
a={'before':before,'mergeStarted':False};out.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
res=subprocess.run(['gh','pr','merge','376','--repo',repo,'--merge','--match-head-commit',subject],capture_output=True,text=True)
a['mergeCommand']={'exit':res.returncode,'stdout':res.stdout,'stderr':res.stderr};a['mergeStarted']=True
post=gh('pr','view','376','--repo',repo,'--json','headRefOid,state,mergeCommit,mergedAt,url');a['after']=post;out.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n')
assert post['headRefOid']==subject and post['state']=='MERGED' and post['mergeCommit']['oid'],(res.returncode,res.stderr,post)
afterRules=gh('api',f'repos/{repo}/rulesets/20177392');assert afterRules==rules,'protection changed externally during merge; this script made no protection mutation'
remote=subprocess.check_output(['git','ls-remote','origin','refs/heads/main'],text=True).split()[0];assert remote==post['mergeCommit']['oid']
a.update({'rulesUnchanged':True,'main':remote,'deployment':'not performed; formal capacity/peer/installation gates pending'})
out.write_text(json.dumps(a,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'main':remote,'mergedAt':post['mergedAt'],'audit':str(out)}))
