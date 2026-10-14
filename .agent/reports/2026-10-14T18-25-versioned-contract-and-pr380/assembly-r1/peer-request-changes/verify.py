from pathlib import Path
import subprocess,json,hashlib,re,os
p=Path('/tmp/pubtail-review-o14');base='1f152fdf43add6bc7f97a00d7e36a7e8cfc105d4';head='47fe9fe39600f2012940865be16743a441c18111';sha=lambda b:hashlib.sha256(b).hexdigest();git=lambda *a:subprocess.check_output(['git',*a]);read=lambda ref,f:git('show',ref+':'+f)
index=json.loads(Path('docs/operations/2026-10-14/publication-tail-release-sources.json').read_text());copies=[]
for r in index['copiedFiles']:
 f=r['file'];a=Path(f).read_bytes();b=read(r['source'],f);assert a==b and len(a)==r['bytes'] and sha(a)==r['sha256'];assert git('rev-parse',head+':'+f).decode().strip()==r['blob'];copies.append(r)
assert len(copies)==41
paths=git('diff','--name-only',base,head).decode().splitlines();assert len(paths)==44
new=sorted(set(paths)-{x['file']for x in copies});assert len(new)==3
sql=[]
for r in copies:
 if r['file'].startswith('migrations/'):
  b=Path(r['file']).read_bytes()
  for ref in ['15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb','2e078dfdd74272d3d50dffdd4cc6c14df3152c78']:assert b==read(ref,r['file'])
  sql.append(r)
assert len(sql)==26
assert git('rev-parse',base+':web')==git('rev-parse',head+':web')
# All base files must remain byte-identical, not just a hand-picked financial list.
basefiles=git('ls-tree','-r','--name-only',base).decode().splitlines();changedbase=[]
for f in basefiles:
 if git('rev-parse',base+':'+f)!=git('rev-parse',head+':'+f):changedbase.append(f)
assert not changedbase
man=[]
for ref,f in [('5aad27050b43d62ebe3929a9b9c2ee22c60e7fda','.agent/reports/2026-10-14T12-42-publication-tail-entry-guard/source-manifest.json'),('9aef3bcfffd63727da70e7b920aee8009cb3c666','.agent/reports/2026-10-14T13-38-publication-tail-fragments/source-manifest.json')]:
 d=json.loads(read(ref,f))
 for row in d['files']:
  path=row.get('path',row.get('file'));local=Path(path);state='absent'
  if local.exists():
   b=local.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256'],path;state='exact'
  man.append({'origin':d['head'],'path':path,'status':state,'bytes':row['bytes'],'sha256':row['sha256']})
(p/'historical-native-input-comparison.json').write_text(json.dumps(man,indent=2))
workflow=Path('.github/workflows/research-publication-tail-quality.yml').read_text();financial=Path('.github/workflows/financial-installation-quality.yml').read_text()
a=workflow[workflow.index('      - name: Checkout'):workflow.index('      - name: Prepare private')];b=financial[financial.index('      - name: Checkout'):financial.index('      - name: Run all six')];assert a==b
assert 'contents: read' in workflow and 'persist-credentials: false' in workflow
assert not re.search(r'pull_request_target|secrets\.|id-token:|write-all|contents: write|workflow_dispatch',workflow)
upload='ea165f8d65b6e75b540449e92b4886f43607fa02';assert upload in read(base,'.github/workflows/source-led-opportunity-external-gate.yml').decode()
assert workflow.count('    runs-on:')==1 and workflow.count('--test-concurrency=1')==3
for x in ['mkdir -m 0700 "$evidence"','entry-native','fragments-native','set -euo pipefail']:assert x in workflow
# Static relative imports in copied JS files: each target resolves in exact subject.
imports=[]
for r in copies:
 f=Path(r['file'])
 if f.suffix!='.mjs':continue
 for match in re.finditer(r'(?:from\s*|import\s*)[\'\"](\.[^\'\"]+)[\'\"]',f.read_text()):
  target=(f.parent/match.group(1)).resolve();assert target.is_file(),str(target);imports.append({'file':str(f),'import':match.group(1),'target':str(target.relative_to(Path.cwd()))})
(p/'relative-imports.json').write_text(json.dumps(imports,indent=2));(p/'verified-copies.json').write_text(json.dumps(copies,indent=2))
result={'subject':head,'tree':git('rev-parse',head+'^{tree}').decode().strip(),'base':base,'webTree':git('rev-parse',head+':web').decode().strip(),'copyCount':len(copies),'sqlTwoOriginComparisons':len(sql)*2,'changedFiles':len(paths),'rootNewFiles':new,'baseFilesUnchanged':len(basefiles),'nativeManifestEntries':len(man),'nativeExactEntries':sum(x['status']=='exact'for x in man),'uniqueExactPaths':len({x['path']for x in man if x['status']=='exact'}),'absentNativeManifestEntries':[x for x in man if x['status']=='absent'],'setupCheckoutNodePgdgNpmBlockByteExact':True,'uploadPinAlreadyInBase':True,'relativeImportsResolved':len(imports),'newWorkflowHash':sha(workflow.encode()),'descriptorHash':sha(Path('scripts/opportunity-v3/research-publication-tail-descriptor.json').read_bytes())}
(p/'mechanical-results.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
