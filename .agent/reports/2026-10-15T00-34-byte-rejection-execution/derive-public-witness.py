from pathlib import Path
import json,hashlib
root=Path(__file__).parent;sha=lambda b:hashlib.sha256(b).hexdigest()
cleanup=json.loads((root/'cleanup-independent.json').read_text());cases=[]
for prefix in ['2409-auo-byte-plus400','2383-emc-byte-plus1300']:
 a=root/'native-corrected-artifacts';read=lambda suffix:json.loads((a/(prefix+'-'+suffix)).read_text())
 result=read('byte-rejection-result.json');conn=read('connections.json');binding=read('engineering-bindings.json');first=read('first-seal.json')['saved'];trace=read('rpc-fd-order.json');shape=read('source-locator-shape.json')
 stages=[]
 for suffix in ['01-initial-preparation','02-after-first-seal','03-before-second-preparation','04-after-second-preparation-before-rejection','05-after-second-seal-attempt']:
  value=read(suffix+'.json');audit=value['audit'];assert len(audit)==9
  assert all(set(row)=={'count','hash'} and len(row['hash'])==64 for row in audit.values())
  stages.append({'stage':suffix,'audit':audit,'ledgerHash':value['ledgerHash'],'ledgerHashAlgorithm':value['ledgerHashAlgorithm'],'charge':value['charge'],'fd':value['fd']})
 assert stages[-2]['audit']==stages[-1]['audit'];assert stages[-2]['ledgerHash']==stages[-1]['ledgerHash'];assert stages[-2]['charge']==stages[-1]['charge']
 assert result['observed']=={'code':'P0001','message':'complete_byte_bound'}
 row=result['after']['ledger']['revisions'][0];assert row['canonical_payload']['clocks']==first['canonical_payload']['clocks'];assert row['input_hash']==first['input_hash']and row['request_hash']==first['request_hash']
 assert result['before']['ledger']==result['after']['ledger']
 caps=first['canonical_payload']['capabilities'];assert all(v is False for v in caps.values())
 lifecycles=[]
 for i,t in enumerate(trace):
  if t['name']=='seal_research_article_input_candidate_v3':
   prior=[r for r in trace[:i]if r['name']=='assert_research_input_candidate_v3'];pre,post=prior[-2:];n=post['before']['opens']-pre['before']['opens'];lifecycles.append({'files':n,'preNoNewOpensFromSnapshot':True,'postFdsRetained':post['before']['closes']==pre['before']['closes'],'sealAllFdsClosed':t['before']['opens']==t['before']['closes']})
 cases.append({'case':prefix,'status':'PASS','expectedError':result['observed'],'sourceIdentity':{'hs':binding['hs'],'hc':binding['hc'],'kind':'partial-four-source actual Node engineering; not wholeclosure/Next/old77'},'sourceLocator':{'extensionBytes':shape['locatorExtensionBytes'],'documentCount':len(shape['documents']),'rootBytes':[v['rootBytes']for v in shape['documents']],'canonicalParentDocumentEqual':shape['canonicalParentDocumentEqual'],'publisherCount':1,'discoveryRootCount':1,'independentNewsRootQualification':False,'publicationCompatibilityProven':False},'stages':stages,'firstStoredHashes':{'inputHash':first['input_hash'],'requestHash':first['request_hash']},'firstClocksAndHashesUnchanged':True,'fullLedgerUnchanged':True,'allCapsFalse':caps,'rpcFdOrder':trace,'lifecycle':lifecycles,'chargeMeasurement':read('measured-preparation-and-first-seal-charges.json'),'actualRejectedWouldCharge':None,'actualRejectedTotal':None,'sourceDerivedPrediction':result['sourceDerivedPrediction'],'predictionIsMeasurement':False,'cleanup':next(x for x in cleanup['cases']if x['run']=='native-corrected'and x['case']==prefix),'pending':result['pending']})
w={'kind':'public-safe-maker-derived-native-byte-rejection-witness','independentlyApproved':False,'executedCode':'c462a51ceea1b69026b38ec40b105eb971d24116','originalCode':'594eaf16457ffb7526f0888922fc8612e893ac75','initial':{'pass':0,'fail':2,'childCasesAttempted':1,'parentCases':1,'EMC':'NOT_RUN fail-fast','cause':'audit ledger envelope depth>=14 was sent to material canonical depth12 after valid first seal','originalREDRetained':True},'corrected':{'pass':3,'fail':0,'children':2,'parents':1,'cancelled':0,'skipped':0,'todo':0},'cases':cases,'privateRawPublic':False,'formalApproval':False}
text=json.dumps(w,indent=2)+'\n'
for k in ['canonical_payload','canonical_request','bindingTexts','sourceDocumentIds','reservationId','jobId','preparation_id','owner','document_url','rawBase64']:assert '"'+k+'"'not in text,k
assert 'https://'not in text
(root/'public-safe-witness.json').write_text(text);print('two corrected cases, five snapshots each, full9 audit per snapshot; private values excluded')
