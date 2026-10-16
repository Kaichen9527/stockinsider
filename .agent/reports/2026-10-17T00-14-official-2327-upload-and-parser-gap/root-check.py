import pathlib,json,hashlib,datetime,shutil,os,subprocess
src=pathlib.Path('/tmp/stockinsider-official-2327-fresh-upload-oct17-1605')
progress=pathlib.Path('/Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09')
out=progress/'.agent/reports/2026-10-17T00-14-official-2327-upload-and-parser-gap'
out.mkdir(parents=True,exist_ok=False)
sha=lambda b:hashlib.sha256(b).hexdigest()
upload=json.loads((src/'stdout').read_text());worker=json.loads((src/'worker.stdout').read_text())
assert upload['uploadAttempts']==1 and upload['upload']['httpStatus']==202 and upload['upload']['ok'] is True and upload['upload']['idempotentReplay'] is False
rid=upload['upload']['receiptId'];assert rid=='c5b6ccf0-25d5-4fa3-b257-4f0b194c0090'
for label in ['upload-oct17-1605-preflight','upload-oct17-1605-immediate-preflight']:
 a=upload[label];assert a['actualExit']==0 and a['result']['allowed'] is True and a['result']['reasons']==[]
 assert a['result']['peakMemoryBytes']==1073741824 and a['result']['minimumAvailableMemoryBytes']==1610612736
 assert a['result']['disk']['minimumReserveBytes']==16106127360
assert upload['dbPreflight']['matchingReceipts']==[]
assert worker['workerAttempts']==0 and worker['uploadAttempts']==0 and worker['outcomeUncertain'] is False
assert worker['worker-oct17-1620-preflight']['actualExit']==1 and worker['worker-oct17-1620-preflight']['result']['reasons']==['memory_below_required_reserve']
assert 'dbPreflight' not in worker
rows=lambda p:[json.loads(s) for s in p.read_text().splitlines() if s.startswith('{')]
post=rows(src/'post-readonly.stdout');old=rows(pathlib.Path('/tmp/stockinsider-official-five-refresh-oct16-1140/stdout'))
db=next(x for x in post if 'databaseObservedAt' in x);assert db['activeWriterCount']==1 and db['activeRelease']=='dd59817f750684b093965f539dd4de466be13077' and db['dataPlaneLeaseRows']==0
new=next(x for x in post if 'newReceiptObservedAt' in x)['receipt']
assert new['receiptId']==rid and new['publishedAt'] is None and new['documentSha256']=='8900870e593b1342d0901d38c137cdbb62f48d662fb6ecedebe3431e28df9e9e' and new['byteLength']==1528880
assert new['receiptStatus']=='partial' and new['parserStatus']=='complete' and new['missingRequirements']==['candidate_financial_local_parser_socket_unavailable'] and new['rejectionReasons']==[]
for k in ['addedFactCounter','duplicateFactCounter','parserLocatorCount','factLinkCount','actualProvenanceFactCount','actualValidationReceiptCount','financialValidationAttempts']:assert new[k]==0
assert new['parserEvidenceCount']==new['jobLinkCount']==1
before=next(x for x in old if 'originalFive' in x)['originalFive'];after=next(x for x in post if 'originalFive' in x)['originalFive']
assert len(before)==len(after)==5 and all(x['status']=='queued' for x in after)
old_receipts={r['receiptId']:r for x in before for r in x['same_stock_period_receipts']}
new_receipts={r['receiptId']:r for x in after for r in x['same_stock_period_receipts']}
assert len(old_receipts)==6 and set(new_receipts)-set(old_receipts)=={rid}
assert all(new_receipts[k]==v for k,v in old_receipts.items())
parser=json.loads((src/'parser-namespace-readonly.stdout').read_text())
assert all(x['absent'] is True for x in parser['paths'][:2]) and len(parser['matchingListeners'])==1
repo='/tmp/stockinsider-discovery-release-root-review-oct14'
unit=subprocess.check_output(['git','show','dd59817f750684b093965f539dd4de466be13077:deployment/vps/systemd/stockinsider-financial-parser.socket'],cwd=repo)
assert sha(unit)==parser['finiteUnitSource']['/etc/systemd/system/stockinsider-financial-parser.socket']['sha256']
for name in ['stockinsider-financial-parser.socket','stockinsider-financial-parser.service']:assert 'ActiveState=active\nSubState=running\n' in parser[name]['properties']
names=['REPORT.md','orientation.json','preparation.json','guarded-upload.sh','execution.json','stdout','stderr','worker-source-pins.json','worker-preflight.sql','guarded-worker.sh','worker-execution.json','worker.stdout','worker.stderr','post-upload-readonly.sh','post-readonly-execution.json','post-readonly.stdout','post-readonly.stderr','parser-readonly.sh','parser-readonly-execution.json','parser-readonly.stdout','parser-readonly.stderr','parser-namespace-readonly.sh','parser-namespace-readonly-execution.json','parser-namespace-readonly.stdout','parser-namespace-readonly.stderr','root-check.py']
for name in names:shutil.copyfile(src/name,out/name)
proof={'at':datetime.datetime.now(datetime.timezone.utc).isoformat(),'uploadAttempts':1,'newReceiptId':rid,'uploadStatus':202,'twoOriginalCapacityChecksPassed':True,'rootWorkerHttpAttempts':0,'workerCapacityHold':True,'workerQueueAndInstalledBodyPinsNotExecuted':True,'otherActorReceiptCompletionObserved':True,'processingActorKnown':False,'historicalSixReceiptsExactMetadataUnchanged':True,'originalFiveJobsQueued':True,'newReceiptParserCompleteButPartial':True,'verifiedFacts':0,'validationReceipts':0,'socketPathAbsentHostAndKnownWorkerRoot':True,'activeListenerExistsDespiteAbsentPath':True,'runtimeDirectoryLifecycleHypothesisOnly':True,'socketUnitGitHashEqualsActual':True,'productionUnitOrCodeModified':False,'newNativeExecuted':False,'dbWriterLeaseObservedAt':db['databaseObservedAt'],'goalApiStatusObserved':'paused','goalStatusMutated':False,'heartbeatRequestedActive':True,'rootFreeBytes':os.statvfs(progress).f_bavail*os.statvfs(progress).f_frsize,'safeDeletionCandidates':[]}
(out/'root-proof.json').write_text(json.dumps(proof,indent=2)+'\n')
names.append('root-proof.json');files=[{'path':name,'bytes':(out/name).stat().st_size,'sha256':sha((out/name).read_bytes())} for name in sorted(names)]
receipt={'schema':'stockinsider-root-public-evidence-receipt-v1','sourceMain':'93e44475cbb0c27beb26e4dcb68e382096a4e212','progressBase':'26d686c0e894efdb30021e639124bb2005f11841','scope':'one exact official2327 upload and read-only parser gap proof; not native/formal publication/strategy approval','files':files,'totalBytes':sum(x['bytes'] for x in files)}
b=(json.dumps(receipt,ensure_ascii=False,indent=2)+'\n').encode();(out/'receipt.json').write_bytes(b);(out/'receipt.sha256').write_text(sha(b)+'  receipt.json\n');(out/'public-allowlist.json').write_text(json.dumps([x['path'] for x in files]+['receipt.json','receipt.sha256','public-allowlist.json'],indent=2)+'\n')
print(json.dumps({'report':str(out),'receiptSha256':sha(b),'filesBound':len(files),'bytesBound':receipt['totalBytes'],'proof':proof}))
