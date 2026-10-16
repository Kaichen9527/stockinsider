import pathlib,subprocess,hashlib,json,datetime,shutil,os
repo=pathlib.Path('/tmp/stockinsider-discovery-release-root-review-oct14');progress=pathlib.Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09');out=progress/'.agent/reports/2026-10-16T19-54-custody-review-and-official-2327';out.mkdir(exist_ok=False)
c='b9d81aa44bb07cabdd03c7b24b89a7abc2c32acd';prefix='docs/operations/2026-10-16/v3-generated-output-custody/';sha=lambda b:hashlib.sha256(b).hexdigest();blob=lambda p:subprocess.check_output(['git','show',c+':'+p],cwd=repo)
rb=blob(prefix+'evidence/receipt.json');assert sha(rb)=='f620730058b5ba412ae67ca85091dd021b88166530c2f72ce97f1bf9c583b301';receipt=json.loads(rb)
for row in receipt['files']:
 b=blob(prefix+'evidence/'+row['path']);assert len(b)==row['bytes'] and sha(b)==row['sha256'];(out/('cloud-'+row['path'])).write_bytes(b)
assert len(receipt['files'])==6 and sum(r['bytes'] for r in receipt['files'])==277777
(out/'cloud-receipt.json').write_bytes(rb)
for name,h in [('HANDOFF.md',receipt['reportSha256']),('custody-audit.py',receipt['executedAuditScriptSha256'])]:
 b=blob(prefix+name);assert sha(b)==h;(out/('cloud-'+name)).write_bytes(b)
seal=json.loads(blob('docs/operations/2026-10-16/v3-reviewer-result-tmp-native/evidence/source-seal.json'));p=subprocess.Popen(['git','cat-file','--batch'],cwd=repo,stdin=subprocess.PIPE,stdout=subprocess.PIPE)
for r in seal['files']:
 p.stdin.write((c+':'+r['path']+'\n').encode());p.stdin.flush();h=p.stdout.readline().decode().split();assert h[0]==r['blob'] and h[1]=='blob' and int(h[2])==r['bytes'];b=p.stdout.read(int(h[2]));assert p.stdout.read(1)==b'\n' and sha(b)==r['sha256']
p.stdin.close();assert p.wait()==0;assert len(seal['files'])==334 and sum(r['bytes'] for r in seal['files'])==10516436
refp=progress/'.agent/reports/2026-10-16T19-32-guarded-staging-review-and-output-custody/approved-dd-output-hash-reference.json';refb=refp.read_bytes();assert sha(refb)=='2dfb0f78f3a6b63fc7f11d5ceaaa60335b98a184ee94cfb4ae8f81464ee245cd';refs={r['cloudRelativePath']:r for r in json.loads(refb)['files']}
index=json.loads(blob(prefix+'evidence/comparison-index.json'));summary=json.loads(blob(prefix+'evidence/custody-summary.json'));counts={k:{'count':0,'logicalBytes':0,'allocatedBytes':0} for k in ['EXACT_MATCH','MISMATCH','NO_REFERENCE','CHANGED','ERROR']};seen=set()
for row in index:
 assert row['path'] not in seen;seen.add(row['path']);ref=refs.get(row['path']);expected='NO_REFERENCE' if ref is None else ('EXACT_MATCH' if row['bytes']==ref['bytes'] and row['sha256']==ref['sha256'] else 'MISMATCH');assert row['status']==expected and row['stable'] and row['priorAuditByteEqual']
 if ref:assert row['referenceBytes']==ref['bytes'] and row['referenceSha256']==ref['sha256']
 q=counts[expected];q['count']+=1;q['logicalBytes']+=row['bytes'];q['allocatedBytes']+=row['allocatedBytes']
assert len(index)==621 and counts==summary['categories'] and counts['EXACT_MATCH']['count']==0 and sum(v['logicalBytes'] for v in counts.values())==9602854 and sum(v['allocatedBytes'] for v in counts.values())==11493376
assert summary['safeDeletionCandidates']==[] and summary['unreferenced']==summary['exactRebuildability']=='UNKNOWN'
raw=json.loads(blob(prefix+'evidence/raw-inventory.json'));assert len(raw['files'])==raw['count']==8 and sum(r['bytes'] for r in raw['files'])==raw['bytes']==1791369
capture=pathlib.Path('/tmp/stockinsider-official-2327-capture-root-oct16');observed=json.loads((capture/'stdout').read_text());b=(capture/'2327.xhtml').read_bytes();assert len(b)==1528880 and sha(b)=='8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e';struct=json.loads((capture/'root-structural-check.json').read_text());struct['identityLabels']=struct['identityLabels'][:6];(out/'official-structural-witness.json').write_text(json.dumps(struct,ensure_ascii=False,indent=2)+'\n')
for name in ['acquire.sh','execution.json','stdout','stderr','retained-read.sh','retained-read.json','retained-read.stderr','guarded-upload.sh','upload-execution.json','upload.stdout','upload.stderr']:
 shutil.copyfile(capture/name,out/('official-'+name))
refresh=pathlib.Path('/tmp/stockinsider-official-five-refresh-oct16-1140')
for name in ['readonly.sh','execution.json','stdout','stderr']:shutil.copyfile(refresh/name,out/('official-five-'+name))
upload=json.loads((capture/'upload.stdout').read_text());assert upload['uploadAttempts']==upload['workerAttempts']==0 and upload['outcomeUncertain'] is False and upload['upload-preflight']['result']['reasons']==['memory_below_required_reserve']
pub=pathlib.Path('/Users/kaerchen/.ssh/id_ed25519.pub').read_text().split();assert pub[0]=='ssh-ed25519';pubb=(' '.join(pub[:2])+'\n').encode();assert sha(pubb)=='62e73abdb066168785d10a646c9145a8e75789a07527399ecbe58bbee7d60d59';(out/'root-evidence-recipient.pub').write_bytes(pubb)
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceInputsVerified':334,'sourceBytesVerified':10516436,'publishedReceiptFilesVerifiedIncludingReceipt':7,'publishedBytesVerifiedIncludingReceipt':277777+len(rb),'publishedComparisonRowsRecomputed':621,'categories':counts,'privateInventoryOnly':{'count':8,'bytes':1791369,'contentsObtained':False},'cloudActualGeneratedFileBytesObtainedByRoot':False,'safeDeletionCandidates':[],'originalOfficialFileRootActualBytesVerified':len(b),'originalOfficialFileSha256':sha(b),'structuralCheckOnlyNotAccountingValidation':True,'mimeCaptureStopPreserved':True,'detectedUploadMimeDecision':'application/xhtml+xml from actual XML XHTML namespace/inlineXBRL; upstream missing MIME retained separately, no change to bytes/guards','announcementDate':None,'uploadOrWorkerAttempts':0,'fullCapacityAllowed':False,'fullCapacityMemoryAvailable':2233806848,'fullCapacityMemoryRequired':2684354560,'databaseIdentityLastQuery':'2026-10-16T11:37:13.369113Z','rootFreeBytes':os.statvfs(progress).f_bavail*os.statvfs(progress).f_frsize,'rootRecipientPublicOnlySha256':sha(pubb),'newCredentialsCreated':False,'privateKeyModifiedOrPrinted':False,'newNativeExecuted':False,'goalActive':True}
(out/'root-check.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n');print(json.dumps(proof,ensure_ascii=False))
