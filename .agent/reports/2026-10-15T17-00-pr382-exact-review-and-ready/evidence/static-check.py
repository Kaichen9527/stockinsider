import ast,copy,fnmatch,hashlib,json,pathlib,subprocess,sys,yaml
root=pathlib.Path.cwd();raw=pathlib.Path('/tmp/dd-operator-release-o15');base='8c58e297e92422c1c3f52856a36bff12b1868100';origin='a87432e939b389f64aad3baffb176fee3954c346'
wf=root/'.github/workflows/dd-binary-operator-quality.yml';w=yaml.load(wf.read_text(),Loader=yaml.BaseLoader);results=[]
def check(name,fn):fn();results.append({'name':name,'status':'PASS'})
def require(b):assert b
copies=json.loads((raw/'copy-manifest.json').read_text())
for row in copies:
 check('exact copy '+row['path'],lambda row=row:require((root/row['path']).read_bytes()==subprocess.check_output(['git','show',origin+':'+row['path']])))
check('read-only permissions',lambda:require(w['permissions']=={'contents':'read'}))
check('ordinary event scope',lambda:require(set(w['on'])=={'push','pull_request'} and w['on']['push']['branches']==['codex/**']))
job=w['jobs']['isolated-operator-quality'];steps=job['steps']
check('single ubuntu job',lambda:require(len(w['jobs'])==1 and job['runs-on']=='ubuntu-24.04' and job['timeout-minutes']=='10'))
check('approved exact action pins',lambda:require([s['uses'] for s in steps if 'uses'in s]==['actions/checkout@11d5960a326750d5838078e36cf38b85af677262','actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02']))
check('checkout no persisted credentials',lambda:require(steps[0]['with']=={'persist-credentials':'false'}))
for event in ('push','pull_request'):
 paths=w['on'][event]['paths']
 watched=[r['path']for r in copies]+['docs/operations/2026-10-15/dd-binary-operator-release/HANDOFF.md','docs/operations/2026-10-15/dd-binary-operator-release/receipt-index.json',str(wf.relative_to(root)),'deployment/vps/activate-writer-release.sh','deployment/vps/systemd/stockinsider-web-standalone.service','deployment/vps/systemd/stockinsider-internal-worker.service','scripts/contabo-host-resource-check.mjs','scripts/contabo-capacity-guard.mjs','scripts/verify-standalone-release.mjs']
 for path in watched:check(event+' path '+path,lambda path=path:require(any(fnmatch.fnmatchcase(path,p)for p in paths)))
 # This workflow is intentionally bounded; unrelated app-only edits do not trigger it.
 check(event+' unrelated path excluded',lambda:require(not any(fnmatch.fnmatchcase('web/src/lib/research-v2.ts',p)for p in paths)))
pyblocks=[]
for i,step in enumerate(steps):
 if 'run'not in step:continue
 shell=step['run'];p=raw/f'workflow-step-{i}.sh';p.write_text(shell)
 result=subprocess.run(['bash','-n',str(p)],capture_output=True,text=True);(raw/f'shell-{i}.json').write_text(json.dumps({'command':['bash','-n',str(p)],'exit':result.returncode,'stdout':result.stdout,'stderr':result.stderr},indent=2)+'\n');check('shell syntax '+str(i),lambda:require(result.returncode==0))
 lines=shell.splitlines();pos=0
 while pos<len(lines):
  if "<<'PY'"in lines[pos]:
   end=lines.index('PY',pos+1);block='\n'.join(lines[pos+1:end])+'\n';ast.parse(block);pyblocks.append(block);pos=end
  pos+=1
check('two inline Python modules parse',lambda:require(len(pyblocks)==2))
for row in copies:
 if row['path'].endswith('.py'):ast.parse((root/row['path']).read_text())
check('two copied Python modules parse only',lambda:None)
r=subprocess.run(['bash','-n',str(root/'docs/operations/2026-10-15/dd-binary-operator-candidate/deploy.sh')],capture_output=True,text=True)
(raw/'candidate-bash-n.json').write_text(json.dumps({'command':r.args,'exit':r.returncode,'stdout':r.stdout,'stderr':r.stderr},indent=2)+'\n');check('candidate bash parse only',lambda:require(r.returncode==0))
# Execute only the isolated workflow JSON parser, never the original probe program.
parser=raw/'extracted-summary-parser.py';parser.write_text(pyblocks[1]);sample=pathlib.Path('/tmp/dd-recovery-fix-o15/probes-group-final.stdout').read_text();d=json.JSONDecoder();records=[];rest=sample
while rest.strip():v,n=d.raw_decode(rest.lstrip());records.append(v);rest=rest.lstrip()[n:]
parserresults=[]
def trial(name,records,ok):
 f=raw/'parser-input.json-stream';f.write_text('\n'.join(json.dumps(x)for x in records)+'\n')
 p=subprocess.run(['python3','-I','-B',str(parser),str(f)],capture_output=True,text=True)
 parserresults.append({'name':name,'expectedAcceptance':ok,'exit':p.returncode,'stdout':p.stdout,'stderr':p.stderr});assert (p.returncode==0)==ok,name
trial('retained final35 exact stdout (not a new probe run)',records,True)
for name,mutate in [
 ('wrong count',lambda r:r[-1].update(count=34)),('missing group',lambda r:r[-1]['results'].pop()),
 ('duplicate group',lambda r:r[-1]['results'].__setitem__(0,r[-1]['results'][1])),
 ('FAIL status',lambda r:r[-1]['results'][0].update(status='FAIL')),('SKIP status',lambda r:r[-1]['results'][0].update(status='SKIP')),
 ('formal true',lambda r:r[-1].update(formalApproval=True)),('extra summary key',lambda r:r[-1].update(extra=True)),
 ('missing dummy ordering record',lambda r:r.pop(0)),('unexpected intermediate record',lambda r:r.__setitem__(0,{'unknown':True})),
 ('duplicate summary',lambda r:r.append(copy.deepcopy(r[-1]))),('truncated summary',lambda r:r.pop())]:
 test=copy.deepcopy(records);mutate(test);trial(name,test,False)
(raw/'summary-parser-results.json').write_text(json.dumps(parserresults,indent=2)+'\n')
check('parser 1 retained positive + 11 negative controls',lambda:require(len(parserresults)==12))
# All tracked original base files must remain untouched; only additions allowed.
changed=subprocess.check_output(['git','diff',base,'--name-status'],text=True)
check('no tracked base modification',lambda:require(all(line.startswith('A\t') for line in changed.splitlines())))
baseidentities={p:subprocess.check_output(['git','rev-parse',base+':'+p],text=True).strip()for p in ['web','migrations','scripts','deployment','.github/workflows','package-lock.json','web/package-lock.json','.nvmrc','.loop-engineering']}
(raw/'base-identities.json').write_text(json.dumps(baseidentities,indent=2)+'\n')
(raw/'static-results.json').write_text(json.dumps({'groups':len(results),'results':results,'parserControls':12,'originalLinux35RunThisTask':False},indent=2)+'\n');print(json.dumps({'staticGroups':len(results),'fail':0,'parserControls':12,'original35Rerun':False},indent=2))
