from pathlib import Path
import os,subprocess,json,datetime
AUDIT=Path('/tmp/stockinsider-pr378-protected-fresh-ref-rerun-oct14.json')
assert not AUDIT.exists(),'rerun audit already exists; never repeat'
repo='Kaichen9527/stockinsider';head='18b1fba4c7fa89108cbf8892a0a7205860989995';base='3e1be377de3f6cac58f6de1626e8df994b9df146';evidence='73fafb9ec5c4d3fc67afe00c9fdc6a7f85b1d5f0'
def gh(*args):return json.loads(subprocess.check_output(['gh',*args],text=True))
pr=gh('pr','view','378','--repo',repo,'--json','number,state,isDraft,headRefOid,baseRefOid');assert pr['state']=='OPEN' and pr['isDraft'] and pr['headRefOid']==head and pr['baseRefOid']==base
rules=gh('api',f'repos/{repo}/rulesets/20177392');assert rules['enforcement']=='active' and rules.get('bypass_actors')==[]
checks=[]
for run in [38503491252,38503491209,38503491181]:
 r=gh('api',f'repos/{repo}/actions/runs/{run}');assert r['head_sha']==head and r['status']=='completed' and r['conclusion']=='success';checks.append({'id':run,'head':r['head_sha'],'status':r['status'],'conclusion':r['conclusion']})
r=gh('api',f'repos/{repo}/actions/runs/38503491190');assert r['head_sha']==head and r['status']=='completed' and r['conclusion']=='failure' and r['run_attempt']==1
refs=subprocess.check_output(['git','ls-remote','origin','refs/heads/main','refs/heads/codex/financial-document-owned-lease-oct14','refs/heads/evidence/source-led-opportunity-v3-exact-review-'+head],text=True);assert f'{base}\trefs/heads/main' in refs and f'{head}\trefs/heads/codex/financial-document-owned-lease-oct14' in refs and f'{evidence}\trefs/heads/evidence/' in refs
assert subprocess.check_output(['git','show','-s','--format=%P',evidence],text=True).strip()==head
record={'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'pr':pr,'rules':rules,'ordinary':checks,'initialRun':{'id':r['id'],'head':r['head_sha'],'attempt':r['run_attempt'],'status':r['status'],'conclusion':r['conclusion']},'refs':refs,'newEvidence':evidence,'action':'gh run rerun 38503491190 --failed only once after genuine fresh evidence ref','result':'started'}
fd=os.open(str(AUDIT),os.O_CREAT|os.O_EXCL|os.O_WRONLY,0o600)
with os.fdopen(fd,'w')as f:json.dump(record,f,indent=2)
p=subprocess.run(['gh','run','rerun','38503491190','--repo',repo,'--failed'],capture_output=True,text=True)
record.update({'completedAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':p.returncode,'stdout':p.stdout,'stderr':p.stderr,'result':'accepted' if p.returncode==0 else 'failed_no_retry'})
AUDIT.write_text(json.dumps(record,indent=2)+'\n');print(json.dumps({'audit':str(AUDIT),'exitCode':p.returncode,'result':record['result']}));assert p.returncode==0
