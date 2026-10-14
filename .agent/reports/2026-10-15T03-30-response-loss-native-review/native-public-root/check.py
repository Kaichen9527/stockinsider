import pathlib, json, hashlib, subprocess, re
p=pathlib.Path(__file__).parent
repo='/tmp/stockinsider-discovery-release-root-review-oct14'
sha=lambda b:hashlib.sha256(b).hexdigest()
read=lambda n:json.loads((p/n).read_text())
r=read('receipt.json');w=read('public-safe-witness.json');si=read('source-inventory.json');ri=read('raw-inventory.json');cl=read('cleanup-verification.json');res=read('execution-resources.json')
assert sha((p/'receipt.json').read_bytes())=='652e3c0092293064ddf2b359e01102c8ba3e025cb58cc95ef77afb196021cf24'
for n,h in r['fileHashes'].items():assert sha((p/n).read_bytes())==h
assert si['subject']==r['executedSubject']==w['subject']
assert si['code']==r['executedRuntimeCode']==w['code']
assert len(si['files'])==r['sourceCount']==263
assert len({f['path'] for f in si['files']})==263
for f in si['files']:
 b=subprocess.check_output(['git','show',si['subject']+':'+f['path']],cwd=repo)
 assert len(b)==f['bytes'] and sha(b)==f['sha256']
 assert subprocess.check_output(['git','rev-parse',si['subject']+':'+f['path']],cwd=repo).decode().strip()==f['blob']
assert len(ri['files'])==ri['count']==r['rawCount']==81
assert sum(f['bytes'] for f in ri['files'])==ri['bytes']==r['rawBytes']==4170673
assert len({f['path'] for f in ri['files']})==81
assert all(re.fullmatch('[a-f0-9]{64}',f['sha256']) for f in ri['files'])
assert r['sourceChanged'] is False and r['productionAuthorized'] is False and r['independentNativeApproval'] is False
assert r['native']['executions']==1 and r['native']['pass']==3 and r['native']['children']==2 and r['native']['parent']==1
assert all(r['native'][k]==0 for k in ['fail','cancelled','skip','todo','exit'])
assert res['execution']['exit']==0 and res['gitCleanBeforeRun'] and res['deletedOnlyOwnedFixtureRoots']
assert res['execution']['peakSessionAndPgRssBytes']==522870784
assert all(v>=8589934592 for v in res['execution']['minimumFreeBytes'].values())
assert cl['activeCount']==0 and cl['zombies']==2
assert all(x['state'] in ['absent','Z'] for x in cl['processes'])
assert sum(x['state']=='Z' for x in cl['processes'])==2
assert len(cl['clusters'])==2
assert all(all(c[k] is True for k in ['clusterAbsent','relayDirectoryAbsent','beforeLogPresent','afterLogShutdownConfirmed']) and c['pendingQueries']==0 for c in cl['clusters'])
assert {c['symbol'] for c in w['cases']}=={'2409','2383'}
out=[]
expected_stages=['01-prepared','02-before-seal-send','03-committed-response-held','04-after-actual-client-rejection','05-read-reconcile-before','05-read-reconcile-after','06-seal-replay-before','06-seal-replay-after']
for c in w['cases']:
 s=c['snapshots'];assert [x['stage'] for x in s]==expected_stages
 assert all(len(x['tables'])==9 for x in s)
 for x in s:
  assert x['charge']['count']==len(x['preparationRows'])+len(x['revisionRows'])
  assert x['charge']['bytes']==sum(y['logicalBytes'] for y in x['preparationRows']+x['revisionRows'])
  assert x['invalidationCount']==0 and x['eventCount']==1
  assert x['fd']['opens']==x['fd']['closes']
 assert s[0]['tables']==s[1]['tables'] and s[0]['ledgerSha256']==s[1]['ledgerSha256']
 baseline={k:v for k,v in s[2].items() if k!='stage'}
 assert all({k:v for k,v in x.items() if k!='stage'}==baseline for x in s[3:])
 assert baseline['charge']=={'count':2,'bytes':234998 if c['symbol']=='2409' else 101687}
 assert baseline['tables']['research_article_input_revisions_v2']['count']==1
 assert s[1]['tables']['research_article_input_revisions_v2']['count']==0
 assert all(s[1]['tables'][k]==baseline['tables'][k] for k in baseline['tables'] if k!='research_article_input_revisions_v2')
 assert s[1]['preparationRows']==baseline['preparationRows'] and s[1]['fencesSha256']==baseline['fencesSha256']
 t=c['transport'];pr=t['protocol']
 assert pr['commandCount']==pr['dataRowCount']==1 and pr['ready']=='I' and pr['errorResponse'] is False
 assert [f['type'] for f in pr['frames']]==['1','2','T','D','C','Z']
 assert sum(f['bytes'] for f in pr['frames'])==pr['framedBytes']==t['heldBytes']<4*1024*1024
 assert t['forwardedAfterArm']==0
 assert all(t[k] is True for k in ['observerCommitConfirmed','clientSocketClosed','upstreamSocketClosed','actualTransportDrop'])
 cn=c['connections'];assert cn['observerReadOnly'] and len({cn[k] for k in ['proxyWriterPid','fixtureWriterPid','observerPid','reconcilePid']})==4
 assert c['actualQueryError']['callerMessageMatches']
 assert all(c['fdOrderVerified'].values()) and c['cleanup']=={'pendingQueries':0,'relayClosed':True}
 assert len(c['reconcileRpcFdOrder'])==2 and all(x['name']=='read_research_article_input_candidate_v3' and x['fd']==baseline['fd'] for x in c['reconcileRpcFdOrder'])
 assert all(c['result'][k] is True for k in ['callerInitiallyUncertain','realPgPromiseRejected','zeroForwardedSealBytes','independentCommittedRowConfirmed','reconciledExactRow','replayedWithoutIoOrCharge'])
 assert c['result']['fd']=={'opens':9,'closes':9} if c['symbol']=='2409' else c['result']['fd']=={'opens':6,'closes':6}
 assert c['formalPeer'] is c['productionWriterVerified'] is c['wholeClosureApproved'] is False
 out.append({'symbol':c['symbol'],'stages':len(s),'tablesPerStage':9,'charge':baseline['charge'],'heldBytes':t['heldBytes'],'forwardedBytes':0,'caseFd':c['result']['fd'],'cumulativeFd':baseline['fd']})
result={'subject':r['executedSubject'],'evidence':'0ea482ce1a1bdb28d1c7fe595e56f2c71ebda9ea','receiptSha256':sha((p/'receipt.json').read_bytes()),'publishedFilesVerified':6,'actualGitBlobsVerified':263,'privateRawInspected':False,'privateRawInventoryOnly':{'count':81,'bytes':4170673},'publicWitnessConsistency':'PASS','cases':out,'rootNativeExecuted':False,'formalProductionApproval':False,'pending':r['pending']}
(p/'root-verification.json').write_text(json.dumps(result,indent=2)+'\n')
print(json.dumps(result))
