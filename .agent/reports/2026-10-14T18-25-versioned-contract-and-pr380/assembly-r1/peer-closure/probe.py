from pathlib import Path
import subprocess,json,hashlib,fnmatch,yaml
old='47fe9fe39600f2012940865be16743a441c18111';new='dd59817f750684b093965f539dd4de466be13077';prior='b37fd62a0441dd55135ab863256ea434e70805a6';wf='.github/workflows/research-publication-tail-quality.yml';doc='docs/operations/2026-10-14/publication-tail-release-handoff.md';read=lambda r,p:subprocess.check_output(['git','show',r+':'+p]);sha=lambda b:hashlib.sha256(b).hexdigest()
a=read(old,wf);b=read(new,wf);added=b"      - 'scripts/runtime/**'\n";assert b.count(added)==1 and b.replace(added,b'')==a
changed=subprocess.check_output(['git','diff','--name-only',old,new],text=True).splitlines();assert set(changed)=={wf,doc}
legacybase='.agent/reports/2026-10-14T10-01-publication-tail-assembly-review/';loaded=json.loads(read(prior,legacybase+'actually-loaded-runtime.json'));assert len(loaded)==6
oldp=yaml.load(a,Loader=yaml.BaseLoader)['on']['pull_request']['paths'];newp=yaml.load(b,Loader=yaml.BaseLoader)['on']['pull_request']['paths'];rows=[]
for path in loaded:
 before=any(fnmatch.fnmatchcase(path,p)for p in oldp);after=any(fnmatch.fnmatchcase(path,p)for p in newp);assert not before and after
 rows.append({'path':path,'oldSelected':before,'newSelected':after})
index=json.loads(read(new,'docs/operations/2026-10-14/publication-tail-release-sources.json'));assert len(index['copiedFiles'])==41
for r in index['copiedFiles']:assert read(new,r['file'])==read(old,r['file'])
result={'old':old,'subject':new,'tree':subprocess.check_output(['git','rev-parse',new+'^{tree}'],text=True).strip(),'changed':changed,'onlyWorkflowChangeIsOneAddedPath':True,'copiedFilesUnchanged':41,'dependencies':rows,'priorEvidence':prior,'priorNegativeSha256':sha(read(prior,legacybase+'raw/workflow-coverage-negative.stderr')),'files':[{'file':p,'bytes':len(read(new,p)),'sha256':sha(read(new,p)),'blob':subprocess.check_output(['git','rev-parse',new+':'+p],text=True).strip()}for p in [wf,doc]],'sourceMutated':False,'testsNativeBuildRerun':False}
Path('/tmp/pubtail-path-closure-o14/result.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
