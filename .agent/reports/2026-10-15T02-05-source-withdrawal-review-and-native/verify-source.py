import pathlib,json,hashlib,subprocess
p=pathlib.Path('/tmp/stockinsider-source-withdrawal-root-review-oct15');repo='/tmp/stockinsider-discovery-release-root-review-oct14';s='870436576d89d1a7f34cddb10f197787978d42f3';e='eeb874de40508d69f07f3740dba2af990b6bf653';prefix='.agent/reports/2026-10-15T01-49-source-withdrawal-source-only/';sha=lambda b:hashlib.sha256(b).hexdigest();get=lambda c,f:subprocess.check_output(['git','show',c+':'+f],cwd=repo)
for name in ['receipt.json','raw-inventory.json','source-inventory.json','HANDOFF.md']:(p/('maker-'+name)).write_bytes(get(e,prefix+name))
assert sha((p/'maker-receipt.json').read_bytes())=='246762b738c4e80e253cd2a0601fe296761c846172013a9a275b4d2bac1fccde'
counts={}
for inv,c,pre in [('source-inventory.json',s,''),('raw-inventory.json',e,prefix)]:
 data=json.loads(get(e,prefix+inv));rows=data['files'];total=0
 for f in rows:
  b=get(c,pre+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];total+=len(b)
  if 'blob' in f:assert subprocess.check_output(['git','rev-parse',c+':'+f['path']],cwd=repo).decode().strip()==f['blob']
 counts[inv]={'files':len(rows),'bytes':total}
for name in ['research-versioned-source-withdrawal-native.test.mjs','research-versioned-legal-fixture-helper.mjs']:(p/name).write_bytes(get(s,'scripts/opportunity-v3/'+name))
diff=subprocess.check_output(['git','diff','b3432984',s,'--','scripts/opportunity-v3/research-versioned-legal-fixture-helper.mjs'],cwd=repo);(p/'helper-diff.patch').write_bytes(diff)
paths=subprocess.check_output(['git','diff','--name-only','b3432984',s],cwd=repo).decode().splitlines();assert len(paths)==3
r={'subject':s,'evidence':e,'sourceEntries':counts['source-inventory.json'],'raw':counts['raw-inventory.json'],'reviewScope':'3path test-only source delta; not native or formal approval','P0':0,'P1':0,'P2':0,'nativeExecuted':False,'applicationImports':False,'reviewedError':'P0001 source_seal_invalidated_or_missing','actualExpectedErrorDerivedFromSql':True,'newCases':3,'caseExecution':'NOT_RUN','unchangedProductSqlRolesGrantsAuthority':True,'changedPaths':paths}
(p/'root-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r,indent=2))
