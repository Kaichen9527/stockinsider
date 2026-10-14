import subprocess,json,hashlib,gzip,base64,pathlib
repo='/tmp/stockinsider-discovery-release-root-review-oct14'; out=pathlib.Path('/tmp/stockinsider-legacy77-source-root-review-oct15')
subject='305074af2547316078e930de8ad81a910860c8c0'; evidence='6a136516934a3fe8442a47b55c8f450b897102a5'; report='.agent/reports/2026-10-15T01-05-legacy77-source-only/'
def git(*args):return subprocess.check_output(['git',*args],cwd=repo)
def get(commit,path):return git('show',commit+':'+path)
def sha(b):return hashlib.sha256(b).hexdigest()
def js(commit,path):return json.loads(get(commit,path))
receipt=get(evidence,report+'receipt.json');assert sha(receipt)=='9231af220d74dbb0e74991e18b7a8d3f6ccabcd0d985e4d40c07efd83bacc4e2'
for inv,commit,prefix in [('source-inventory.json',subject,''),('raw-inventory.json',evidence,report)]:
 rows=js(evidence,report+inv)['files']
 for row in rows:
  b=get(commit,prefix+row['path']);assert len(b)==row['bytes'];assert sha(b)==row['sha256']
  if 'blob' in row:assert git('rev-parse',commit+':'+row['path']).decode().strip()==row['blob']
 print(inv,len(rows),sum(r['bytes'] for r in rows))
index=js(subject,'scripts/fixtures/research-legacy77/source-index.json'); gz=get(subject,index['fixture']['path']);assert sha(gz)==index['fixture']['sha256'];assert len(gz)==index['fixture']['bytes'];expanded=gzip.decompress(gz);assert len(expanded)==index['fixture']['expandedBytes'];capsule=json.loads(expanded)
assert [f['pin'] for f in capsule['files']]==index['files']
for f in capsule['files']:
 p=f['pin'];b=base64.b64decode(f['rawBase64'],validate=True);assert b==get(index['source'],p['file']);assert len(b)==p['bytes'] and sha(b)==p['sha256'];assert git('rev-parse',index['source']+':'+p['file']).decode().strip()==p['blob']
mapping=js(index['source'],'web/src/lib/research-complete-mapping.json');metadata=[{k:f[k] for k in ('file','bytes','sha256')} for f in index['files'][:22]];assert mapping['sourceClosure']==metadata
closure=sha(json.dumps(metadata,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode());assert closure==index['closureRecomputed']==mapping['sourceClosureHash']
proof=js('267184ec666e91df0815a3e268fe4764ef1021ce','.agent/reports/2026-10-14T11-40-versioned-protocol-design/historical77b1-proof.json');assert proof['files']==metadata and proof['sourceClosureHash']==closure
old=json.loads(gzip.decompress(get(subject,'scripts/fixtures/research-compatible-financial/pinned-original-source.json.gz'))); bypath={f['pin']['path']:f for f in old['files']}
for p in index['oldArtifactPins']:
 b=base64.b64decode(bypath[p['path']]['rawBase64'],validate=True);assert b==get('75d91024ce365606989bfe42b2d7e6227b65044d',p['path']);assert len(b)==p['bytes'] and sha(b)==p['sha256']
for p in index['sqlComparisons']:
 b=get(subject,p['file']);assert b==get(index['source'],p['file']);assert sha(b)==p['sha256']
r={'subject':subject,'evidence':evidence,'receiptSha256':sha(receipt),'sourceEntriesVerified':255,'rawFilesVerified':15,'originalCopiedFilesVerified':len(index['files']),'closureMembers':len(metadata),'recomputedClosure':closure,'originalFinancialFilesVerified':len(index['oldArtifactPins']),'unchangedSqlComparisons':len(index['sqlComparisons']),'applicationImports':False,'nativeExecuted':False,'review':'REQUEST_CHANGES','P0':0,'P1':0,'P2':1,'finding':'Child error resolves exit promise and unconditionally confirms termination while child is alive; independent isolated mock contract RED preserved.'}
(out/'root-verification.json').write_text(json.dumps(r,indent=2)+'\n');print(json.dumps(r))
