import json,subprocess,hashlib,re,pathlib,datetime,os,collections
G='/tmp/stockinsider-discovery-release-root-review-oct14';E='6d68136a19ba9c45a62909cb2ea4313fd6161b21';S='014d6468add162fa54c34680c07f10e2dab789c3';B='8b00416572b97e44832a792384dc60ad47d3e991';R='.agent/reports/2026-10-16T08-36-completed-handoff-reviewer-native/';D=pathlib.Path('/tmp/stockinsider-completed-reviewer-native-root-review-oct16')
def git(*a):return subprocess.check_output(['git',*a],cwd=G)
def get(ref,p):return git('show',ref+':'+p)
def obj(p):return json.loads(get(E,R+p))
def sha(b):return hashlib.sha256(b).hexdigest()
def canon(v):return json.dumps(v,sort_keys=True,separators=(',',':'),ensure_ascii=False)
r=obj('receipt.json');rb=get(E,R+'receipt.json');assert sha(rb)=='bad2f9664dc182a91d02cb6aa4ac65319744a66ffb01e524c1e3abcd50cb9333'
assert r['harnessSource']==S and r['base']==B and git('rev-parse',S+'^{tree}').decode().strip()==r['harnessTree']
seal=obj('source-seal.json');fs=seal['files'];assert len(fs)==len({f['path'] for f in fs})==317
q=b''.join((S+':'+f['path']+'\n').encode() for f in fs);data=subprocess.run(['git','cat-file','--batch'],input=q,cwd=G,stdout=subprocess.PIPE,check=True).stdout;at=0;total=0
for f in fs:
 end=data.index(b'\n',at);h=data[at:end].decode().split();n=int(h[2]);at=end+1;b=data[at:at+n];at+=n+1
 assert h[0]==f['blob'] and h[1]=='blob' and n==f['bytes'] and sha(b)==f['sha256'],f['path'];total+=n
assert at==len(data) and total==10319157==r['executedInputBytes']
old=json.loads(get(B,'.agent/reports/2026-10-16T01-13-completed-handoff-reviewer-source/source-seal.json'))['files'];now={f['path']:f for f in fs};assert len(old)==314
for f in old:assert now[f['path']]['blob']==f['blob'] and now[f['path']]['sha256']==f['sha256']
pub=r['publishedFilesExcludingReceipt'];assert len(pub)==13 and sum(f['bytes'] for f in pub)==372671
for f in pub:
 b=get(E,R+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];(D/f['path']).write_bytes(b)
(D/'receipt.json').write_bytes(rb)
h=r['handoff'];hb=get(h['commit'],h['path']);assert len(hb)==h['bytes'] and sha(hb)==h['sha256'] and git('rev-parse',h['commit']+':'+h['path']).decode().strip()==h['blob']
raw=obj('raw-inventory.json');assert raw['count']==len(raw['files'])==205 and raw['bytes']==sum(f['bytes'] for f in raw['files'])==310150803
for f in raw['files']:assert re.fullmatch('[0-9a-f]{64}',f['sha256'])
# Independent source extraction: four copied fragments and one metadata query.
original=get('6e0c19e16301db4fbbb2eebc37c227a23ab1c727','scripts/opportunity-v3/research-v3-author-durable-native.test.mjs').decode();helper=get(S,'scripts/opportunity-v3/research-v3-completed-reviewer-native-helper.mjs').decode();fragment=obj('exact-fragments.json')['fragments']
markers={'installer':('async function installer(','async function snapshot('),'snapshot':('async function snapshot(','async function assertInitialAuthorSourceProfile('),'sourceProfile':('async function assertInitialAuthorSourceProfile(','async function lifecycle(')}
for name,(a,b) in markers.items():
 x=original[original.index(a):original.index(b)];y=helper[helper.index(a):helper.index(b)];assert x==y and len(x.encode())==fragment[name]['bytes'] and sha(x.encode())==fragment[name]['sha256'],name
x=original[original.index('async function lifecycle('):];y=helper[helper.index('async function lifecycle('):];cut=" return {config,received,revision,article,original,assigned,saved,trace};"
pre=y[:y.index(cut)];assert original[original.index('async function lifecycle('):].startswith(pre);assert len(pre.encode())==fragment['authorPrefix']['bytes'] and sha(pre.encode())==fragment['authorPrefix']['sha256']
mark='const metadataQuery=';assert original[original.index(mark):original.index(';\n',original.index(mark))+2]==helper[helper.index(mark):helper.index(';\n',helper.index(mark))+2]
# Engineering identity: Hs from exact four Git inputs; Hc from published Node binary hash (not Root acquisition of Cloud binary).
ident=obj('actual-binding-identity.json');assert len(ident['inputs'])==4
for f in ident['inputs']:assert sha(get(S,f['path']))==f['sha256']
assert sha(canon(ident['inputs']).encode())==ident['hs'];assert sha(canon({'executor':'actual-native-node-engineering','node':'v22.14.0','nodeSha':ident['nodeSha256'],'input':ident['inputs']}).encode())==ident['hc']
for b in ident['bindings']:assert sha(canon(b['core']).encode())==b['hb'] and b['core']['compiledFingerprintIdentity']==ident['hc'] and b['core']['sourceExecutionHash']==ident['hs']
run=obj('native.result.json');command=obj('command-seal.json');assert run['command']==command['command'] and run['start']==command['start'] and run['exit']==0 and run['seconds']<2400 and run['sampleSeconds']==0.2 and run['peakSessionAndPgRssBytes']<8589934592
assert run['minimumFreeBytes']=={'/workspace':8590020608,'/tmp':13876314112} and all(v>=8589934592 for v in run['minimumFreeBytes'].values())
tap=get(E,R+'stackfree.tap').decode();assert '# pass 3' in tap and all('# '+k+' 0' in tap for k in ['fail','cancelled','skipped','todo'])
w=obj('public-safe-witness.json');assert len(w['cases'])==2 and w['nativeRuns']==1
caseResults=[]
def minus(v,*keys):return {k:x for k,x in v.items() if k not in keys}
for c in w['cases']:
 sym=c['symbol'];fd=9 if sym=='2409' else 7;charge=234995 if sym=='2409' else 144354;resultBytes=205189 if sym=='2409' else 135388
 assert len(set(c['connections'][k] for k in ['operator','writer','observer']))==3 and c['connections']['observerReadOnly']=='on'
 f=c['fenceInstaller'];assert f['actualCommit'] and f['onlyOneBodyChanged'] and f['otherFullMetadataUnchanged'] and len(f['changed'])==1 and f['changed'][0]['bodySha256']=='f507de78318a126e180f96fa7905fccfb6c1ee428688fb9e93b0f607c8d7e958'
 assert f['codecs']['namespace']['sha256']=='d5d40be3a570685e109953393c629d7b972b40d4910bb3d6002d28ceba81300d' and f['codecs']['catalog']['sha256']=='2db3c24e2ed40099f437f82290ab2049e0859080cfeae92bdd24592918725087' and f['codecs']['afternamespace']['sha256']=='718f62f93fd1340e71b70eed24f856f030256c040e0efdd5734d98265fbbdf61'
 assert all(v['jsEqualsDb'] for v in f['codecs'].values());assert all(v['count']==0 and v['sha256']==sha(b'[]') for v in f['emptyTables'].values()) and len(f['emptyTables'])==14
 assert c['fenceRepeat']=={'code':'P0001','message':'handoff_binding_predecessor_namespace','rollbackExact':True};assert c['c08Installer']['commitObserved'] and len(c['c08Installer']['changed'])==4
 ss=c['stages'];assert len(ss)==14 and all(len(s['tables'])==14 for s in ss)
 for s in ss:
  for k in ['sha256','ledgerHash','revocationsHash']:assert re.fullmatch('[0-9a-f]{64}',s[k])
  for t in s['tables'].values():assert isinstance(t['count'],int) and re.fullmatch('[0-9a-f]{64}',t['sha256'])
 done=ss[2];assert done['charge']=={'count':2,'bytes':charge};assert c['financialFd']=={'opened':fd,'closed':fd};assert c['durableResult']['bytes']==resultBytes
 assert ss[1]['tables']['research_model_completions_v1']['count']==0 and done['tables']['research_model_completions_v1']['count']==1
 for t in done['tables']:
  if t!='research_model_completions_v1':assert done['tables'][t]==ss[1]['tables'][t]
 assert all(minus(s,'label')==minus(done,'label') for s in ss[3:6])
 assigned=ss[6];assert assigned['tables']['research_model_reservations_v1']['count']==2 and assigned['tables']['research_reviewer_assignments_v2']['count']==1
 for t in assigned['tables']:
  if t not in ['research_model_reservations_v1','research_reviewer_assignments_v2']:assert assigned['tables'][t]==done['tables'][t]
 assert all(minus(s,'label')==minus(assigned,'label') for s in ss[7:9])
 revoked=ss[9];assert revoked['revocationCount']==1 and revoked['tables']==assigned['tables'];assert minus(revoked,'label','sha256','revocationsHash','revocationCount')==minus(assigned,'label','sha256','revocationsHash','revocationCount')
 assert all(minus(s,'label')==minus(revoked,'label') for s in ss[10:])
 assert all(s['ledgerHash']==done['ledgerHash'] and s['charge']==done['charge'] and s['fd']==done['fd'] for s in ss[2:])
 trace=c['rpcTrace'];assert len(trace)==25
 for i,t in enumerate(trace):
  assert t['ordinal']==i and t['ready']=='I' and t['beforeFd']==t['afterFd']==done['fd'] and t['startedAt']<=t['settledAt']
  assert not any(word in t['name'] for word in ['article_input','author_result','receive','prepare','renew','claim'])
 assert collections.Counter(t['name'] for t in trace[:21])=={'read_research_author_handoff_context_v2':10,'commit_research_author_handoff_v2':2,'read_research_reviewer_context_v2':7,'assign_research_reviewer_v2':1,'read_research_reviewer_sources_v2':1}
 assert all(t['error']=={'code':'P0001','message':'versioned_binding_unavailable'} for t in trace[21:])
 assert len(c['refusals'])==4 and all(t['querySettled'] and t['ready']=='I' and t['rpcCount']==1 and t['code']=='P0001' and t['message']=='versioned_binding_unavailable' for t in c['refusals'])
 p=c['packet'];assert p['sevenSections'] and p['allTablesExact'] and p['completeOriginalDraftRetained'] and p['reconstructedFullDraftSha']==p['originalDraftSha'] and p['jsonBytes']<=1048576 and p['taggedPacketBytes']<=1048576
 expected='accb32669966843b008a345bfe732a13d41af3b008fcbfe2f716d6d580c8cda2' if sym=='2409' else '65a5c805e45487dfa6daa91d5c8d7f5d5aae4a10ed7f6aa250cb6b11710b3064';assert p['originalDraftSha']==expected
 b=next(b for b in ident['bindings'] if b['symbol']==sym);assert c['binding']['core']==b['core'] and c['binding']['hb']==b['hb'] and c['binding']['wholeClosureApproved']==False and c['actualHttpRoute']==False and c['independentFormalAuthorReviewerExecution']==False
 caseResults.append({'symbol':sym,'stages':14,'tablesPerStage':14,'newFinancialFD':fd,'inputCharge':done['charge'],'durableResultBytes':resultBytes,'packetEnvelopeBytes':p['jsonBytes'],'rpcCount':25,'readTombstoneRefusals':4,'originalDraftSha':expected})
cleanup=obj('cleanup-proof.json');assert cleanup['backendAbsentCount']==10 and len(cleanup['explicitBackends'])==10 and all(not p['exists'] for p in cleanup['explicitBackends']);assert len(cleanup['cases'])==2
for c in cleanup['cases']:assert all(c[k] for k in ['clusterAbsent','socketDirectoryAbsent','shutdownLogObserved','secureRootFinallyAbsenceRecorded','secureRootAfterRunAbsent']) and all(p['finallyAbsent'] and p['afterRunAbsent'] for p in c['financialRoots'])
assert cleanup['sampledOwnedProcessesTotal']==40 and cleanup['sampledOwnedProcessesAbsent']==38 and len(cleanup['remainingZombieProcesses'])==2 and all(p['exists'] and p['state']=='Z' and p['rssBytes']==0 and p['ppid']==1 for p in cleanup['remainingZombieProcesses'])
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'harnessSource':S,'evidence':E,'sourceInputCount':317,'sourceInputBytes':total,'originalInputsUnchanged':314,'publishedCountIncludingReceipt':14,'publishedBytesIncludingReceipt':372671+len(rb),'receiptSha256':sha(rb),'privateRawScope':'205 raw/310150803 bytes inventory count/sum/hash format only; no private contents acquired','rootRuntimeNativeBuildExecuted':False,'scopedSourceAndPublicWitnessFindings':{'P0':0,'P1':0,'P2':0},'nativeMakerCount':r['actualTests'],'cases':caseResults,'makerSampledRssPeak':run['peakSessionAndPgRssBytes'],'makerMinimumFree':run['minimumFreeBytes'],'minimumWorkspaceMargin':8590020608-8589934592,'actualHsFromGit':ident['hs'],'hcFromPublishedBinaryHashNotRootBinaryAcquisition':ident['hc'],'rootAvailableBytes':os.statvfs('/tmp').f_bavail*os.statvfs('/tmp').f_frsize,'pending':r['pending'],'fullGoalComplete':False}
(D/'root-check.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False))
