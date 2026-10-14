import pathlib,subprocess,json,hashlib
p=pathlib.Path('/tmp/stockinsider-response-loss-normalization-fixed-root-review-oct15');repo='/tmp/stockinsider-discovery-release-root-review-oct14';s='d33d6328763ee2591a41d849ff4bfadf75c2ff2e';e='b09a49eaccd82ba14c00f1a04a84d7683638f727';pre='.agent/reports/2026-10-15T02-40-response-loss-row-normalization/';get=lambda c,f:subprocess.check_output(['git','show',c+':'+f],cwd=repo);sha=lambda b:hashlib.sha256(b).hexdigest()
for n in ['receipt.json','raw-inventory.json','source-inventory.json']:(p/('maker-'+n)).write_bytes(get(e,pre+n))
assert sha((p/'maker-receipt.json').read_bytes())=='91028f2891615e1b45d3f3ba52876f4c2e5dc22ab09f4b3796c55bb6d0f9b936'
counts={}
for n,c,prefix in [('source-inventory.json',s,''),('raw-inventory.json',e,pre)]:
 rows=json.loads(get(e,pre+n))['files'];total=0
 for f in rows:
  b=get(c,prefix+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];total+=len(b)
  if 'blob' in f:assert subprocess.check_output(['git','rev-parse',c+':'+f['path']],cwd=repo).decode().strip()==f['blob']
 counts[n]={'files':len(rows),'bytes':total}
f='scripts/opportunity-v3/research-versioned-response-loss-native.test.mjs';(p/'exact-native.test.mjs.txt').write_bytes(get(s,f));(p/'normalization-probes.mjs').write_bytes(get(e,pre+'raw/normalization-probes.mjs'));(p/'delta.patch').write_bytes(subprocess.check_output(['git','diff','462aae78',s,'--',f],cwd=repo));paths=subprocess.check_output(['git','diff','--name-only','462aae78',s],cwd=repo).decode().splitlines();assert len(paths)==2
r={'subject':s,'evidence':e,'sourceVerified':counts['source-inventory.json'],'rawVerified':counts['raw-inventory.json'],'scopedSourceReview':{'P0':0,'P1':0,'P2':0},'nativeExecuted':False,'changedPaths':paths,'productSqlRelayFixtureAuthorityUnchanged':True};(p/'root-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
