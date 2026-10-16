import subprocess,json,hashlib,re,pathlib,datetime,os
G='/tmp/stockinsider-discovery-release-root-review-oct14';S='a085294da7db0e93ade3c3e9c1f556b736164287';E='b6ca7fb5d4057d748162da9e3e1b98a89a56443b';B='490a20fb316892eb0cbb43bb6b995997e2e449ef';R='docs/operations/2026-10-16/v3-reviewer-result-native/evidence/';D=pathlib.Path('/tmp/stockinsider-reviewer-native-resource-root-review-oct16')
def git(*a):return subprocess.check_output(['git',*a],cwd=G)
def get(ref,p):return git('show',ref+':'+p)
def sha(b):return hashlib.sha256(b).hexdigest()
def obj(p):return json.loads(get(E,R+p))
def body(s,n):return re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.'+n+r'\([\s\S]*?AS \$\$([\s\S]*?)\$\$;',s).group(1)
rb=get(E,R+'receipt.json');r=json.loads(rb);assert sha(rb)=='adb4961c31b6e956caf4197dc615bcebbe2cd3440b9dff9cfa503c317e9e2e73' and r['source']==S and r['base']==B and git('rev-parse',S+'^{tree}').decode().strip()==r['sourceTree']
seal=obj('source-seal.json');fs=seal['files'];assert len(fs)==len({f['path'] for f in fs})==331
q=b''.join((S+':'+f['path']+'\n').encode() for f in fs);data=subprocess.run(['git','cat-file','--batch'],input=q,cwd=G,stdout=subprocess.PIPE,check=True).stdout;at=0;total=0
for f in fs:
 e=data.index(b'\n',at);h=data[at:e].decode().split();n=int(h[2]);at=e+1;b=data[at:at+n];at+=n+1;assert h[0]==f['blob'] and h[1]=='blob' and n==f['bytes'] and sha(b)==f['sha256'],f['path'];total+=n
assert at==len(data) and total==10493941
old=json.loads(get(B,'.agent/reports/2026-10-16T09-35-reviewer-dispatch-fix/source-seal.json'))['files'];now={f['path']:f for f in fs};assert len(old)==328 and all(now[f['path']]['sha256']==f['sha256'] and now[f['path']]['blob']==f['blob'] for f in old)
post=obj('post-source-check.json');assert post['count']==331 and post['bytes']==total and post['allUnchanged'] and post['frozenInherited328Unchanged'];assert len(post['files'])==331
for f in post['files']:
 assert f['unchanged'] and all(f[k]==now[f['path']][k] for k in ('sha256','blob','bytes'))
pubtotal=len(rb)
for f in r['files']:
 b=get(E,R+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];pubtotal+=len(b);(D/f['path']).write_bytes(b)
(D/'receipt.json').write_bytes(rb);raw=obj('raw-inventory.json');assert len(raw['files'])==raw['count']==74 and sum(f['bytes'] for f in raw['files'])==raw['bytes']==172577373 and raw['nativeRawUnchanged'];assert all(re.fullmatch('[a-f0-9]{64}',f['sha256']) for f in raw['files'])
entry=get(S,'scripts/opportunity-v3/research-v3-reviewer-result-native.test.mjs').decode();helper=get(S,'scripts/opportunity-v3/research-v3-reviewer-result-native-helper.mjs').decode();orig=get(S,'scripts/opportunity-v3/research-v3-completed-handoff-reviewer-native.test.mjs').decode();sc=obj('source-checks.json')
for f in sc['exactFragments']:
 oldsource=get(S,f['source']).decode();start=helper.index(f['marker']);frag=helper[start:start+f['bytes']];assert len(frag.encode())==f['bytes'] and sha(frag.encode())==f['sha256'] and frag in oldsource
tables=re.search(r'const TABLES=(\[[^;]+\]);',helper).group(1);tableNames=re.findall("'([^']+)'",tables);assert len(tableNames)==len(set(tableNames))==16 and 'research_execution_invocations_v2' in tableNames and 'research_reviewer_results_v2' in tableNames
assert "Object.keys(tables).length,16" in helper and not re.search(r"from\s*'[^']+\.test\.mjs'",entry+helper)
w=obj('public-safe-witness.json');inst=w['installer'];u=inst['reviewerUnion'];profile=json.loads(get(S,'docs/operations/2026-10-16/v3-reviewer-result-union/source-derived-profile.json'));sql=get(S,'migrations/20261016_research_reviewer_result_union_candidate_v3.sql').decode()
assert w['overall']=='RESOURCE_HOLD_INTERRUPTED' and w['terminalRunnerExit']==1 and w['nativeNotPass'] and not w['tapSummaryPresent'];assert w['tapCompletedChildren']==w['tapCompletedParent']==w['tapPassCountObserved']==w['tapFailureCountObserved']==0
assert u['actualCommit'] and u['onlyTwoBodiesChanged'] and u['otherFullStateUnchanged'] and u['ids']['writer']!=u['ids']['observer'] and u['ids']['readOnly']=='on';assert u['sqlSha256']==sha(sql.encode())==profile['sqlSha256'];assert inst['repeat']=={'code':'P0001','message':'reviewer_union_predecessor_namespace','rollbackExact':True}
assert len(u['changed'])==len(inst['changes'])==2
for pin in profile['functions']:
 b=body(sql,pin['signature'].split('(')[0]).encode();ch=next(x for x in inst['changes'] if x['signature']==pin['signature']);actual=next(x for x in u['changed'] if x['signature']==pin['signature']);assert ch['newBodyBytes']==len(b)==pin['successorBytes'] and ch['newBodySha']==actual['bodySha256']==sha(b)==pin['successorBodySha256'];assert ch['oldBodyBytes']==pin['predecessorBytes'] and ch['oldBodySha']==pin['predecessorBodySha256']
before,after=inst['before'],inst['after'];assert before['tables']==after['tables'] and len(before['tables'])==16
for v in before['tables'].values():assert v=={'count':0,'sha256':sha(b'[]')}
for k in ['detailsHash','scopeHash','defaultsHash']:assert before[k]==after[k]
for k in ['namespace','catalog']:
 assert u['codecs'][k]['sha256']==before[k+'Hash'] and u['codecs']['after'+k]['sha256']==after[k+'Hash'];assert u['codecs'][k]['jsEqualsDb'] and u['codecs']['after'+k]['jsEqualsDb']
assert before['namespaceHash']==profile['preNamespaceHash'] and before['catalogHash']==profile['preCatalogHash'] and after['namespaceHash']==profile['sourceDerivedSuccessorNamespaceHash'] and after['catalogHash']=='0d8e754a86bc93438f4f7722964befa6af0518ae30b0237d8561e8da7f9b6535'
nr=obj('native.result.json');res=w['resources'];floor=8589934592;initial=res['initial']['freeBytes']['/workspace'];minimum=res['minimumFreeBytes']['/workspace'];assert nr['exit']==1 and nr['minimumFreeBytes']==res['minimumFreeBytes'] and nr['peakSessionAndPgRssBytes']==res['sampledPeakRssBytes']==996675584;assert initial==8591278080>=floor and minimum==8589361152<floor and floor-minimum==res['workspaceDeficitAtStop']==573440 and res['minimumFreeBytes']['/tmp']>=floor
assert len(w['notRun'])==9 and not w['privateRawContentsRootVerified'];tap=get(E,R+'incomplete-native.tap').decode();assert not re.search(r'^# (?:pass|fail|tests) |^ok |^not ok ',tap,re.M)
c=obj('cleanup-proof.json');assert c==w['cleanup'] and c['shutdownLogConfirmed'] and c['pgCtlExit']==0 and not c['fixtureFinallyExecuted'] and c['externalOwnedCleanupExecuted'];assert c['existingFinancialFiles']==c['expectedFinancialFiles']==29 and c['existingFinancialBytes']==1790390 and c['allExistingPinnedBytesExact'];assert len(c['paths'])==5 and all(p['lstat']=='ENOENT' for p in c['paths']);z=[p for p in c['processes'] if not p.get('absent')];assert len(c['processes'])==20 and z==[{'pid':702395,'state':'Z','ppid':1,'rss':0},{'pid':702424,'state':'Z','ppid':1,'rss':0}];assert c['actualPendingQueryPromiseSettlement']=='NOT_OBSERVED: session terminated'
for f in c['serverLogs']:assert any(g['path'].endswith(f['path']) and g['bytes']==f['bytes'] and g['sha256']==f['sha256'] for g in raw['files'])
ident=obj('actual-binding-identity.json');inputHashes=[]
for f in ident['inputs']:assert sha(get(S,f['path']))==f['sha256'];inputHashes.append(f['sha256'])
canon=lambda x:json.dumps(x,sort_keys=True,separators=(',',':'),ensure_ascii=False);assert sha(canon(ident['inputs']).encode())==ident['hs'];assert sha(canon({'executor':'actual-native-node-engineering','node':'v22.14.0','nodeSha':ident['nodeSha256'],'input':ident['inputs']}).encode())==ident['hc'];assert ident['partialFourSourceIdentity'] and ident['notNext'] and not ident['wholeClosureApproved']
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':S,'evidence':E,'verifiedGitInputs':331,'gitInputBytes':total,'inherited328Unchanged':True,'publishedFilesIncludingReceipt':15,'publishedBytes':pubtotal,'privateRawInventoryOnly':{'count':74,'bytes':172577373},'scope':'Root exact source and public installer/resource/cleanup evidence consistency review; no private raw snapshots acquired or Root native','sourceIntegration':{'P0':0,'P1':0,'P2':0},'overall':'RESOURCE_HOLD_INTERRUPTED','completeTapTests':0,'installerComponent':'AUO full new union COMMIT and repeat rejection only, not business lifecycle/native PASS','postNamespace':after['namespaceHash'],'postCatalog':after['catalogHash'],'businessLifecycleAndR1ActualSQL':'NOT_RUN','resource':{'floor':floor,'initial':initial,'initialMargin':initial-floor,'minimum':minimum,'deficit':floor-minimum,'observedWorkspaceDecline':initial-minimum,'fixturePinnedBytes':1790390,'sameRestoredFreeIsInsufficientEvidenceForRetry':True,'notAFutureWorkspaceConsumptionUpperBound':True},'cleanup':{'external':True,'fixtureFinally':False,'backendShutdown':True,'queryPromiseSettlement':'NOT_OBSERVED','fivePathsAbsentMakerWitness':True,'zombies':z},'rootPrivateContentsVerified':False,'rootNodePGNativeBuild':False,'rootAvailableBytes':os.statvfs('/tmp').f_bavail*os.statvfs('/tmp').f_frsize,'wholeExecutionClosureApproved':False,'fullGoalComplete':False};(D/'root-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
