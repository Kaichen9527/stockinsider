from pathlib import Path
import json,hashlib,re
root=Path('/tmp/cross-wire-exec-o14');a=root/'native-initial-artifacts';out=Path(__file__).parent
sha=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()
tables=['research_input_preparations_v2','research_article_input_revisions_v2','research_source_seals_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_deep_admission_charges_v1','research_model_reservations_v1','research_model_completions_v1','source_raw_documents']
def audit(v):
 assert set(v)==set(tables)
 for x in v.values():assert set(x)=={'count','hash'} and isinstance(x['count'],int) and re.fullmatch('[a-f0-9]{64}',x['hash'])
 return v
cases=[]
for prefix in ['2409-auo-compatible','2383-emc-v3','2409-mixed-v2-then-v3','2383-mixed-v3-then-v2','2409-max30-compatible-measure','2383-max30-v3-measure']:
 read=lambda suffix:json.loads((a/(prefix+'-'+suffix)).read_text())
 connections=read('connections.json');cleanup=read('cleanup.json');trace=read('rpc-fd-order.json');binding=read('engineering-bindings.json')
 c={'case':prefix,'sourceIdentity':{'hs':binding['hs'],'hc':binding['hc'],'partialFourSource':True,'actualNativeNodeEngineering':True,'wholeClosureApproved':False},'stage':cleanup['stage'],'connections':connections,'cleanup':{'clusterPathAbsent':not Path(cleanup['removed']).exists(),'writerAbsent':not Path('/proc/'+str(connections['writer'])).exists(),'observerAbsent':not Path('/proc/'+str(connections['observer'])).exists(),'serverShutdownLogged':'database system is shut down'in(a/(prefix+'-postgres.log')).read_text(),'preAndPostLogsDistinctFiles':True},'rpcFdOrder':trace,'pending':[]}
 # Fixed field allowlist prevents adding private payload, body, principals or URLs.
 assert all(set(r)=={'ordinal','name','before'} and set(r['before'])=={'opens','closes'} for r in trace)
 triples=[]
 for i,t in enumerate(trace):
  if t['name']=='seal_research_article_input_candidate_v3':
   prior=[r for r in trace[:i]if r['name']=='assert_research_input_candidate_v3'];pre,post=prior[-2:];n=post['before']['opens']-pre['before']['opens'];triples.append({'files':n,'preAllClosed':pre['before']['opens']==pre['before']['closes'],'postFdsRetained':post['before']['closes']==pre['before']['closes'],'sealAllClosed':t['before']['opens']==t['before']['closes'],'openedOnceBeforePost':n in[6,7,8,9]})
 c['fdLifecycleChecks']=triples
 f=a/(prefix+'-cross-wire-result.json')
 if f.exists():
  v=json.loads(f.read_text());c['tableAudit']={'storedAfterFirstSeal':audit(v['audit']),'afterReplay':None,'afterConflict':None,'equalityAssertionsPassedInCallback':True};c['pending'].append('separate afterReplay/afterConflict nine-table snapshots were not retained; no invented duplicate snapshots')
  c['fdCounts']={k:v[k]for k in ['expected','opens','closed','replayNoIo','conflictNoIo']};err=read('expected-binding-conflict.json');assert err['code']=='P0001'and err['message']=='complete_replay_conflict';c['expectedError']={'code':err['code'],'label':'complete_replay_conflict'}
 f=a/(prefix+'-mixed-count-bound.json')
 if f.exists():
  v=json.loads(f.read_text());c['tableAudit']={'before':audit(v['before']),'after':audit(v['after'])};assert v['before']==v['after'];c['charges']=v['used'];err=read('expected-count-bound.json');assert err['code']=='P0001'and err['message']=='input_preparation_count_bound';c['expectedError']={'code':err['code'],'label':'input_preparation_count_bound'}
 f=a/(prefix+'-max30-byte-measurement.json')
 if f.exists():
  v=json.loads(f.read_text());c['max30']={k:v[k]for k in ['sourceCount','used','preparationBytes','sealedCanonicalBytes','remainingBytes','remainingSlots']};m=read('mixed-byte-measurement.json');c['mixedBytes']={k:m[k]for k in ['beforeCharge','wouldCharge','afterCharge','actualSecondSeal','byteRejection']};c['tableAudit']={'before':None,'after':None};c['pending'].append('nine-table snapshots not serialized for successful max30 measurement; no fabricated before/after audit')
 c['rawEvidenceHashes']=[{'file':p.name,'bytes':p.stat().st_size,'sha256':sha(p)}for p in sorted(a.glob(prefix+'-*'))]
 cases.append(c)
tap=(root/'native-initial.stdout').read_text();assert '# tests 7\n'in tap and '# pass 7\n'in tap and '# fail 0\n'in tap
w={'kind':'public-safe-maker-derived-existing-native-witness','independentlyRawVerifiedByRoot':False,'nativeRerun':False,'executedSource':'7951cb3be14715891868dcf08a3acd57a3c98dbb','tap':{'sha256':sha(root/'native-initial.stdout'),'children':6,'parents':1,'pass':7,'fail':0,'skip':0,'todo':0},'cases':cases,'formalApproval':False,'privateRawPublished':False}
(out/'native-public-safe-witness.json').write_text(json.dumps(w,indent=2)+'\n');print('Derived six case witnesses from retained raw; missing snapshots explicit; no native execution.')
