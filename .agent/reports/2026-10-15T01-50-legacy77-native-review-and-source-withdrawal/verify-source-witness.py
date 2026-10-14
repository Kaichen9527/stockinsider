import pathlib,json,hashlib,subprocess,re
p=pathlib.Path('/tmp/stockinsider-legacy77-native-root-review-oct15');repo='/tmp/stockinsider-discovery-release-root-review-oct14';s='9d68b4d62b1af0fcbe221ed2e5689534e0b9da42';e='b3432984263ad59866af6fb077a45b802c087dbf';sha=lambda b:hashlib.sha256(b).hexdigest()
get=lambda c,f:subprocess.check_output(['git','show',c+':'+f],cwd=repo)
assert sha((p/'receipt.json').read_bytes())=='73f036773a40a1d3918d7ca6725c294e1f92bea58480ce01309e5c38866e6d05'
r=json.loads((p/'receipt.json').read_text());w=json.loads((p/'public-safe-witness.json').read_text());assert sha((p/'public-safe-witness.json').read_bytes())==r['witness']['sha256'];assert r['executedHead']==w['executedSubject']==s
si=json.loads((p/'source-inventory.json').read_text());files=si['files']
for f in files:
 b=get(s,f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];assert subprocess.check_output(['git','rev-parse',s+':'+f['path']],cwd=repo).decode().strip()==f['blob']
raw=json.loads((p/'private-raw-inventory.json').read_text());rows=raw['files'];assert len(rows)==68 and sum(f['bytes'] for f in rows)==4227511
assert len({f['path'] for f in rows})==68
for f in rows:assert re.fullmatch('[a-f0-9]{64}',f['sha256']) and isinstance(f['bytes'],int) and f['bytes']>=0
checks=[]
for c in w['cases']:
 assert c['symbol'] in ['2409','2383'];n=8 if c['symbol']=='2409' else 6;old=c['originalProducer'];assert old['sourceFilesVerified']==26 and old['fd']=={'opens':n,'closes':n};assert old['confirmedExit'] and old['confirmedClose'] and old['pendingRpcAtSave']==0;assert old['terminal']['code']==old['terminal']['exitEvent']['code']==0
 trace=old['rpcTrace'];assert [t['name'] for t in trace]==['read_research_article_input_revision_v2','assert_research_input_preparation_v2','assert_research_input_preparation_v2','seal_research_article_input_revision_v2'];assert [t['fd'] for t in trace]==[{'opens':0,'closes':0},{'opens':0,'closes':0},{'opens':n,'closes':0},{'opens':n,'closes':n}];assert len({t['writerPid'] for t in trace})==1;assert trace[0]['writerPid']==c['connections']['writer']!=c['connections']['observer'];assert c['connections']['observerReadOnly']
 stages=c['stages'];assert len(stages)==10;assert len({x['stage'] for x in stages})==10;by={x['stage']:x for x in stages}
 for st in stages:
  assert len(st['fullNineTableAudit'])==9
  for t,d in st['fullNineTableAudit'].items():assert isinstance(d['count'],int) and d['count']>=0 and re.fullmatch('[a-f0-9]{64}',d['hash'])
  charge=st['savedLogicalCharges'];allvalues=charge['preparations']+charge['revisions'];assert len(allvalues)==st['charge']['count'];assert sum(allvalues)==st['charge']['bytes'];assert st['storedRevisionCount']==len(charge['revisions']);assert st['parentFd']=={'opens':0,'closes':0}
 assert [st['charge']['count'] for st in stages]==[1,2,2,2,2,2,2,2,3,3]
 for i in [2,4,6,8]:
  a,b=stages[i:i+2]
  for k in ['fullNineTableAudit','fullLedgerSha256','charge','parentFd','storedRevisionCount','savedLogicalCharges']:assert a[k]==b[k]
 for st in stages[2:8]:
  for k in ['fullNineTableAudit','fullLedgerSha256','charge','parentFd','storedRevisionCount','savedLogicalCharges']:assert st[k]==stages[1][k]
 assert c['conflictError']=={'code':'P0001','message':'complete_replay_conflict'};assert c['freshOld77Error']['message']=='original_fresh_v2_requires_retained_execution_realm';assert c['currentRpcNames']==['read_research_article_input_candidate_v3']*4
 assert c['currentZeroIo'] and c['replayWithBothRootsMissing'] and c['oldSavedRowRequestPayloadClocksUnchanged'] and c['allCapabilitiesFalse'];assert not c['sourceIdentity']['newExecutionClaimed77'] and not c['sourceIdentity']['historicalCompiledNextVerified'];checks.append({'symbol':c['symbol'],'stages':10,'tablesPerStage':9,'pairsVerified':4,'sealedCharge':stages[1]['charge'],'thirdSlotCharge':stages[-1]['charge'],'actualOriginalFdCount':n})
res={'sourceEntriesVerified':len(files),'publishedFilesRead':6,'privateRawInventoryOnly':{'files':len(rows),'bytes':sum(f['bytes'] for f in rows)},'privateRawBytesVerifiedByRoot':False,'rootNativeExecuted':False,'cases':checks,'cleanup':w['cleanup'],'makerDerivedWitnessConsistency':'PASS','formalApproval':False};(p/'root-source-witness-verification.json').write_text(json.dumps(res,indent=2)+'\n');print(json.dumps(res,indent=2))
