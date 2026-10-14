import pathlib,json,hashlib,subprocess,re
p=pathlib.Path('/tmp/stockinsider-source-withdrawal-execution-root-review-oct15');repo='/tmp/stockinsider-discovery-release-root-review-oct14';s='eeb874de40508d69f07f3740dba2af990b6bf653';sha=lambda b:hashlib.sha256(b).hexdigest();get=lambda c,f:subprocess.check_output(['git','show',c+':'+f],cwd=repo)
r=json.loads((p/'receipt.json').read_text());w=json.loads((p/'public-safe-witness.json').read_text());resources=json.loads((p/'command-and-resources.json').read_text());assert sha((p/'receipt.json').read_bytes())=='c4cfca7a5734f1a31e7cf19c4d15206c35597e531d702e976c036a8d5cf29e07';assert sha((p/'public-safe-witness.json').read_bytes())==r['publicWitnessSha256'];assert r['executedSubject']==w['subject']==s
files=json.loads((p/'source-inventory.json').read_text())['files']
for f in files:
 b=get(s,f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];assert subprocess.check_output(['git','rev-parse',s+':'+f['path']],cwd=repo).decode().strip()==f['blob']
raw=json.loads((p/'private-raw-inventory.json').read_text())['files'];assert len(raw)==100 and sum(x['bytes'] for x in raw)==2446036;assert len({x['path'] for x in raw})==100
for x in raw:assert re.fullmatch('[a-f0-9]{64}',x['sha256']) and x['bytes']>=0
summary=[]
def stable(a,b,source=False):
 for k in a['nineTables']:
  if source or k!='source_raw_documents':assert a['nineTables'][k]==b['nineTables'][k]
 for k in ['ledgerSha256','ledgerRows','charge','seals','ownedLeaseState']:assert a[k]==b[k]
def exact(a,b):
 stable(a,b,True)
 for k in ['sourceRows','events','invalidations']:assert a[k]==b[k]
for c in w['cases']:
 con=c['connections'];assert len({con['mutator']['pid'],con['writer'],con['observer']})==3;assert con['mutator']['role']=='service_role' and con['observerReadOnly'];assert c['expectedError']=={'code':'P0001','message':'source_seal_invalidated_or_missing'}
 for err in c['errors']:assert err['code']=='P0001' and err['message']=='source_seal_invalidated_or_missing'
 st={x['stage']:x for x in c['stages']};journal=c['journal'];assert [v['ordinal'] for v in journal]==list(range(len(journal)))
 for a in st.values():
  assert len(a['nineTables'])==9;charges=a['ledgerRows']['preparations']+a['ledgerRows']['revisions'];assert len(charges)==a['charge']['count'];assert sum(v['logicalBytes'] for v in charges)==a['charge']['bytes']
  for d in a['nineTables'].values():assert d['count']>=0 and re.fullmatch('[a-f0-9]{64}',d['hash'])
 if 'old77' not in c['case']:
  a=st['02-barrier-before-withdrawal'];b=st['03-withdrawal-observer-after-commit'];end=st['05-after-blocked-rpc'];stable(a,b);exact(b,end);assert a['sourceRows'][0]['rowHash']!=b['sourceRows'][0]['rowHash'];assert a['sourceRows'][0]['rootSha256']==b['sourceRows'][0]['rootSha256'];assert b['events']['count']==a['events']['count']+1 and b['invalidations']['count']==a['invalidations']['count']+1;assert len(c['errors'])==1
  n=9 if c['case'].startswith('2409') else 6;start=st['01-initial']['fd'];assert end['fd']=={'opens':start['opens']+n,'closes':start['closes']+n};assert end['charge']['count']==1 and end['nineTables']['research_article_input_revisions_v2']['count']==0
  commit=next(x for x in journal if x['stage'].endswith('-commit'));blocked=next(x for x in journal if x['stage']=='actual-rpc-call' and x['ordinal']>commit['ordinal']);assert commit['transaction']['pid']==con['mutator']['pid'];assert commit['ordinal']<blocked['ordinal'];assert commit['returningRowHash']==b['sourceRows'][0]['rowHash'];assert blocked['rpc']==('assert_research_input_candidate_v3' if n==9 else 'seal_research_article_input_candidate_v3')
  assert a['fd']=={'opens':start['opens']+n,'closes':start['closes']+(0 if n==9 else n)}
  summary.append({'case':c['case'],'stages':len(st),'chargeUnchanged':end['charge'],'newOpenedAndClosed':n,'commitOrdinal':commit['ordinal'],'blockedOrdinal':blocked['ordinal']})
 else:
  a=st['02-original-sealed-A'];b=st['03-withdraw-B-observer-after-commit'];restored=st['04-restore-A-observer-after-commit'];stable(a,b);stable(a,restored,True);assert a['sourceRows']==restored['sourceRows'] and a['sourceRows']!=b['sourceRows'];assert restored['events']['count']==a['events']['count']+2 and restored['invalidations']['count']==a['invalidations']['count']+2
  for label in ['05-read-replay','06-seal-replay']:exact(st[label+'-before'],st[label+'-after']);assert st[label+'-before']['fd']==st[label+'-after']['fd'];assert st[label+'-after']['ledgerRows']['revisions']==a['ledgerRows']['revisions']
  commits=[x for x in journal if x['stage'].endswith('-commit')];assert len(commits)==2 and commits[0]['transaction']['xid']!=commits[1]['transaction']['xid'];assert all(x['transaction']['pid']==con['mutator']['pid'] for x in commits);assert commits[1]['returningRowHash']==a['sourceRows'][0]['rowHash'];assert len(c['errors'])==2
  child=c['originalChild'];assert child['confirmedChildExit'] and child['confirmedChildClose'] and child['pendingRpcAtSave']==0 and child['terminal']['code']==0 and child['fd']=={'opens':8,'closes':8};assert len(child['rpcTrace'])==4;assert all(x['writerPid']==con['writer'] for x in child['rpcTrace'])
  summary.append({'case':c['case'],'stages':len(st),'chargeUnchanged':a['charge'],'sourceAEqualsRestoredA':True,'durableInvalidationsAdded':2,'rejectedReadAndSeal':True})
 clean=c['cleanup'];assert clean['stoppedReported'] and clean['pathAbsent'] and clean['postmasterPidAbsent'] and clean['afterLogHasShutdown'] and clean['beforeLogPreservedPrefix']
assert r['counts']==w['counts']=={'tests':4,'children':3,'parent':1,'pass':4,'fail':0,'cancelled':0,'skip':0,'todo':0}
cleanup=resources['cleanup'];assert cleanup['activeOwned']==0 and len(cleanup['clusters'])==3 and all(x['now'] in ['absent','zombie'] for x in cleanup['processes']);assert not r['scope']['activeProductionWriterReleaseVerified'] and not r['scope']['independentNativeApproval'];assert r['limits']['peakSampledSessionAndPgRssBytes']<8589934592 and min(r['limits']['minimumFreeBytes'].values())>=8589934592
result={'sourceBlobsVerified':len(files),'publishedFilesRead':6,'privateRawInventoryOnly':{'count':len(raw),'bytes':sum(x['bytes'] for x in raw)},'privateRawBytesRootVerified':False,'rootNativeExecuted':False,'publicWitnessConsistency':'PASS','cases':summary,'cleanup':{'activeOwned':0,'clustersAbsent':3,'zombies':sum(x['now']=='zombie' for x in cleanup['processes'])},'formalApproval':False};(p/'root-verification.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps(result,indent=2))
