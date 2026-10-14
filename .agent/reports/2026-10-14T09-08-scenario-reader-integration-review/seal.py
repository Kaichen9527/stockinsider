import pathlib,subprocess,json,hashlib,os,datetime
r=pathlib.Path('/tmp/si-pubtail-o14');out=pathlib.Path('/tmp/scenario-reader-review-o14');base='1f152fdf43add6bc7f97a00d7e36a7e8cfc105d4';origins=['6313d9e455eb4d5c17a76c94300c4fa676f6ddc9','9daf8248355568c45bb0bda3ade224be1b84b9f0','e8de7d76c852d86d6383f52f10c7aad74b9fa1f3']
def git(*a):return subprocess.check_output(['git',*a],cwd=r)
def sha(b):return hashlib.sha256(b).hexdigest()
prior=json.loads((out/'source-manifest.json').read_text());(out/'source-manifest-before-origin-fetch.json').write_text(json.dumps(prior,indent=2)+'\n')
rows=[]
for p in git('diff','--name-only',base,'HEAD').decode().splitlines():
 b=(r/p).read_bytes();eq={}
 for c in origins:
  z=subprocess.run(['git','show',c+':'+p],cwd=r,capture_output=True);eq[c]=None if z.returncode else z.stdout==b
 rows.append({'file':p,'bytes':len(b),'sha256':sha(b),'blob':git('rev-parse','HEAD:'+p).decode().strip(),'equal':eq})
prior['changedFiles']=rows;prior['identicalInheritedFileCount']=sum(any(v is True for v in a['equal'].values())for a in rows)
assert prior['identicalInheritedFileCount']==14
expected={'web/src/lib/research-cash-financial-reader.ts','scripts/fixtures/research-historical-cash/new-reader-execution-closure.json','.github/workflows/research-historical-cash-quality.yml','.github/workflows/source-led-opportunity-v3.yml','scripts/research-scenario-cash-reader.test.mjs','docs/operations/2026-10-14/scenario-cash-reader-integration-handoff.md'}
assert {a['file'] for a in rows if not any(v is True for v in a['equal'].values())}==expected
for p in ['web/src/lib/research-financial-io-owner.ts','web/src/lib/research-financial-io-engine.ts']:
 assert (r/p).read_bytes()==git('show',origins[0]+':'+p)
for p in ['web/src/lib/research-business-calculator.ts','web/src/lib/research-financial-clock.ts']:
 assert (r/p).read_bytes()==git('show','15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb:'+p)
for p in ['.nvmrc','package.json','package-lock.json','web/package.json','web/package-lock.json']:
 assert (r/p).read_bytes()==git('show',base+':'+p)
prior['node']=subprocess.check_output(['/workspace/.tools/node22/node_modules/.bin/node','-v']).decode().strip();prior['nextInstalled']=json.loads((r/'web/node_modules/next/package.json').read_text())['version'];assert prior['nextInstalled']=='16.3.4'
(out/'source-manifest.json').write_text(json.dumps(prior,indent=2)+'\n')
(out/'portable-fix.diff').write_bytes(git('diff',origins[0],origins[1],'--','scripts/research-cash-single-owner-reader.test.mjs','docs/operations/2026-10-14/cash-single-owner-reader-handoff.md'))
files=[]
for p in sorted((r/'web/.next/server').rglob('*')):
 if p.is_file():
  b=p.read_bytes();files.append({'file':str(p.relative_to(r/'web/.next')),'bytes':len(b),'sha256':sha(b),'symlink':p.is_symlink()})
build={'source':prior['subject'],'tree':prior['tree'],'webtree':prior['webtree'],'buildId':(r/'web/.next/BUILD_ID').read_text(),'compiler':'normal next build Turbopack','next':prior['nextInstalled'],'node':prior['node'],'files':files,'fileCount':len(files),'bytes':sum(x['bytes'] for x in files)}
(out/'build-manifest.json').write_text(json.dumps(build,indent=2)+'\n')
# Every runtime metadata pin has been read and checked; test dependencies include original core vectors.
extra=[]
for p in ['scripts/research-historical-cash-core.test.mjs','scripts/fixtures/research-historical-cash/operands-and-decimal-vectors.json']:
 b=(r/p).read_bytes();extra.append({'file':p,'bytes':len(b),'sha256':sha(b),'blob':git('rev-parse','HEAD:'+p).decode().strip()})
(out/'additional-inputs.json').write_text(json.dumps(extra,indent=2)+'\n')
print(json.dumps({'source':prior['subject'],'tree':prior['tree'],'webtree':prior['webtree'],'inherited':prior['identicalInheritedFileCount'],'buildId':build['buildId'],'serverfiles':len(files),'serverbytes':build['bytes'],'manifestSha256':sha((out/'build-manifest.json').read_bytes())},indent=2))
