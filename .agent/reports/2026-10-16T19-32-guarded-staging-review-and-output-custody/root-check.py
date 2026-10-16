import datetime, hashlib, json, os, pathlib, stat, subprocess

REPO = pathlib.Path('/tmp/stockinsider-discovery-release-root-review-oct14')
PROGRESS = pathlib.Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09')
OUT = PROGRESS / '.agent/reports/2026-10-16T19-32-guarded-staging-review-and-output-custody'
OUT.mkdir(parents=True, exist_ok=False)
COMMIT = '05cc5cf2bb0fc4ddf0d0276ae176be0b09bd79d4'
PREFIX = 'docs/operations/2026-10-16/v3-guarded-staging-audit/'
def sha(b): return hashlib.sha256(b).hexdigest()
def blob(path): return subprocess.check_output(['git', 'show', COMMIT+':'+path], cwd=REPO)
def write(name, obj): (OUT/name).write_text(json.dumps(obj, ensure_ascii=False, indent=2)+'\n')
receipt_bytes = blob(PREFIX+'evidence/receipt.json')
assert sha(receipt_bytes) == '23b54d9d3a1c44c7c61bbfc0590e74607f12f1f60ac305cb9834efa8275c628c'
receipt = json.loads(receipt_bytes)
published = []
for row in receipt['files']:
    b = blob(PREFIX+'evidence/'+row['path'])
    assert len(b)==row['bytes'] and sha(b)==row['sha256']
    (OUT/('cloud-'+row['path'])).write_bytes(b)
    published.append(row)
assert len(published)==6 and sum(x['bytes'] for x in published)==23900
(OUT/'cloud-receipt.json').write_bytes(receipt_bytes)
handoff = blob(PREFIX+'HANDOFF.md')
assert sha(handoff)==receipt['reportSha256']
(OUT/'cloud-HANDOFF.md').write_bytes(handoff)
proof = json.loads(blob(PREFIX+'evidence/source-proof.json'))
seal_bytes=blob(proof['sourceSealPath'])
assert sha(seal_bytes)==proof['sourceSealSha256']
seal=json.loads(seal_bytes)
proc=subprocess.Popen(['git','cat-file','--batch'],cwd=REPO,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for row in seal['files']:
    proc.stdin.write((COMMIT+':'+row['path']+'\n').encode());proc.stdin.flush()
    header=proc.stdout.readline().decode().split()
    assert header[0]==row['blob'] and header[1]=='blob' and int(header[2])==row['bytes']
    b=proc.stdout.read(int(header[2]));assert proc.stdout.read(1)==b'\n'
    assert sha(b)==row['sha256']
proc.stdin.close();assert proc.wait()==0
assert len(seal['files'])==334 and sum(x['bytes'] for x in seal['files'])==10516436
osfacts=json.loads(blob(PREFIX+'evidence/actual-os-audit.json'))
assert osfacts['selection']=='NONE_NOT_READY' and osfacts['safeDeletionCandidates']==[]
for c in osfacts['candidates']:
    assert c['allAncestorsGuardAccept']==all(x['directory'] and not x['symlink'] and (int(x['mode'],8)&0o022)==0 for x in c['ancestors'])
    assert c['freeAfterKnownRawFiles']==c['ancestors'][-1]['freeBytes']-1790390
    assert c['rawMinimumAdditionalBytes']==max(0,8589934592-c['freeAfterKnownRawFiles'])
raw=json.loads(blob(PREFIX+'evidence/raw-inventory.json'))
assert len(raw['files'])==raw['count']==8 and sum(x['bytes'] for x in raw['files'])==raw['bytes']==380194
assert all(len(x['sha256'])==64 and all(c in '0123456789abcdef' for c in x['sha256']) for x in raw['files'])
package=pathlib.Path('/tmp/stockinsider-final-reviewed-dd-artifact-oct14/dd59817f750684b093965f539dd4de466be13077')
manifest_bytes=(package/'release-manifest.json').read_bytes(); wrapper=json.loads(manifest_bytes);m=wrapper['manifest']
canonical=json.dumps(m,ensure_ascii=False,separators=(',',':')).encode()
assert sha(canonical)==wrapper['manifestSha256']=='344489589e929158a73d658c968128a563dd53ed9a5eac6b37ee89553b9a0a4a'
assert m['sourceCommit']==m['packagerCommit']==m['releaseId']=='dd59817f750684b093965f539dd4de466be13077'
assert len(m['files'])==2586 and sum(x['bytes'] for x in m['files'])==79354761
selected=[]
for row in m['files']:
    rel=pathlib.PurePosixPath(row['path']);assert not rel.is_absolute() and '..' not in rel.parts
    p=package/row['path'];s=p.lstat();assert stat.S_ISREG(s.st_mode) and not p.is_symlink()
    b=p.read_bytes();assert len(b)==row['bytes'] and sha(b)==row['sha256']
    if row['path'].startswith(('app/.next/server/','app/.next/static/')):
        selected.append({'packagePath':row['path'],'cloudRelativePath':'web/'+row['path'][4:],'bytes':row['bytes'],'sha256':row['sha256'],'mode':row['mode']})
assert len(selected)==1371 and sum(x['bytes'] for x in selected)==14966550
write('approved-dd-output-hash-reference.json',{'schemaVersion':1,'subject':m['releaseId'],'manifestSha256':wrapper['manifestSha256'],'wrapperBytes':len(manifest_bytes),'wrapperSha256':sha(manifest_bytes),'rootReadActualRetainedFiles':2586,'rootReadActualRetainedBytes':79354761,'selectedCount':len(selected),'selectedBytes':14966550,'files':selected,'scope':'Actual retained extracted DD files rehashed against exact originally approved manifest; tar not located or re-read this turn. Comparison reference only, no Cloud parity or deletion authorization.'})
official=pathlib.Path('/tmp/stockinsider-retained-official-artifacts-verified-oct16')
execution=json.loads((official/'execution.json').read_text());assert execution['actualExit']==0 and execution['readOnly']
assert sha((official/'readonly.sh').read_bytes())==execution['scriptSha256']
observation=json.loads((official/'stdout').read_text());assert observation['directoryPresent'] is False and observation['files']==[]
for name in ['execution.json','readonly.sh','stdout','stderr']:
    (OUT/('official-'+name)).write_bytes((official/name).read_bytes())
write('root-check.json',{'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'commit':COMMIT,'sourceInputsVerified':334,'sourceBytesVerified':10516436,'publishedReceiptFilesVerifiedIncludingReceipt':7,'publishedBytesVerifiedIncludingReceipt':23900+len(receipt_bytes),'handoffBytesVerified':len(handoff),'privateInventoryOnly':{'count':8,'bytes':380194,'contentsObtained':False},'scope':'Root actual Git-byte and bounded public-audit arithmetic consistency; not native, private OS contents, output custody parity, reclaim proof or formal approval.','selectedStaging':'NONE_NOT_READY','safeDeletionCandidates':[],'packageRetainedActualFilesRehashed':2586,'packageRetainedActualBytesRehashed':79354761,'packageManifestSha256':wrapper['manifestSha256'],'cloudOutputParity':'NOT_CHECKED','officialKnownDirectoryOnlyAbsent':True,'newDbWriterLeaseQuery':False,'rootFilesystemAvailable':os.statvfs(PROGRESS).f_bavail*os.statvfs(PROGRESS).f_frsize,'cleanupExecuted':False,'goalActive':True})
print(str(OUT))
print((OUT/'root-check.json').read_text())
