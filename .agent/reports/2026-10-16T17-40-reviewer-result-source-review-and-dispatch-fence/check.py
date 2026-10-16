import json,subprocess,hashlib,re,pathlib,datetime,os
G='/tmp/stockinsider-discovery-release-root-review-oct14';S='4eedb532f318b6f7892256da3a81468995e069df';E='6503307df3507504a0b696cb5fe881d8a7e6ec06';B='6d68136a19ba9c45a62909cb2ea4313fd6161b21';R='.agent/reports/2026-10-16T09-03-reviewer-result-union-source/';D=pathlib.Path('/tmp/stockinsider-reviewer-result-union-root-review-oct16')
def git(*a):return subprocess.check_output(['git',*a],cwd=G)
def get(ref,p):return git('show',ref+':'+p)
def obj(p):return json.loads(get(E,R+p))
def sha(b):return hashlib.sha256(b).hexdigest()
def body(t,name):return re.search(r'CREATE (?:OR REPLACE )?FUNCTION public\.'+name+r'\([\s\S]*?AS \$\$([\s\S]*?)\$\$;',t).group(1)
r=obj('receipt.json');rb=get(E,R+'receipt.json');assert sha(rb)=='d83cee23d7de46ef784e49238e306ee92b476a7ab28a8f2a8ff41ccb36c60188';assert r['source']==S and r['base']==B and git('rev-parse',S+'^{tree}').decode().strip()==r['tree']
seal=obj('source-seal.json');fs=seal['files'];assert len(fs)==len({f['path'] for f in fs})==326
q=b''.join((S+':'+f['path']+'\n').encode() for f in fs);data=subprocess.run(['git','cat-file','--batch'],input=q,cwd=G,stdout=subprocess.PIPE,check=True).stdout;at=0;total=0
for f in fs:
 end=data.index(b'\n',at);h=data[at:end].decode().split();n=int(h[2]);at=end+1;b=data[at:at+n];at+=n+1;assert h[0]==f['blob'] and h[1]=='blob' and n==f['bytes'] and sha(b)==f['sha256'],f['path'];total+=n
assert at==len(data) and total==10445953
old=json.loads(get(B,'.agent/reports/2026-10-16T08-36-completed-handoff-reviewer-native/source-seal.json'))['files'];now={f['path']:f for f in fs};assert len(old)==317
for f in old:assert now[f['path']]['blob']==f['blob'] and now[f['path']]['sha256']==f['sha256']
pub=r['files'];assert len(pub)==10
for f in pub:
 b=get(E,R+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];(D/f['path']).write_bytes(b)
(D/'receipt.json').write_bytes(rb);raw=obj('raw-inventory.json');assert len(raw['files'])==raw['count']==41 and sum(f['bytes'] for f in raw['files'])==raw['bytes']==362277
for f in raw['files']:assert re.fullmatch('[0-9a-f]{64}',f['sha256'])
prefix='docs/operations/2026-10-16/v3-reviewer-result-union/';profile=json.loads(get(S,prefix+'source-derived-profile.json'));lineage=json.loads(get(S,prefix+'fragment-lineage.json'));sql=get(S,'migrations/20261016_research_reviewer_result_union_candidate_v3.sql').decode();oldsql=get(S,'migrations/20261009_research_reviewer_results_v2.sql').decode();fence=get(S,'migrations/20261016_research_author_handoff_binding_fence_candidate_v3.sql').decode();assert sha(sql.encode())==profile['sqlSha256']
bodyResults=[]
for f in profile['functions']:
 name=f['signature'].split('(')[0];a=body(oldsql,name);b=body(sql,name);cut=a.index('BEGIN\n')+6
 assert b.startswith(a[:cut]) and b.endswith(a[cut:]) and sha(a.encode())==f['predecessorBodySha256'] and sha(b.encode())==f['successorBodySha256'];assert len(a.encode())==f['predecessorBytes'] and len(b.encode())==f['successorBytes'];bodyResults.append({'signature':f['signature'],'originalBodyBytes':len(a.encode()),'newBodyBytes':len(b.encode()),'originalBodyHash':sha(a.encode()),'newBodyHash':sha(b.encode()),'originalDeclarationAndStatementsBytePreserved':True})
for marker,endmark in [(" SELECT jsonb_build_object(\n 'relations'",' ) INTO namespace_now;'),(" SELECT jsonb_build_object(\n    'tables'",'  ) INTO catalog;')]:
 start=fence.index(marker);frag=fence[start:fence.index(endmark,start)+len(endmark)];assert sql.count(frag)==2
assert len(re.findall('CREATE OR REPLACE FUNCTION',sql))==2 and sql.count('ANY(ARRAY(SELECT')==8 and not re.search(r'\b(?:GRANT|REVOKE|CREATE TABLE|CREATE ROLE|ALTER ROLE|ALTER OWNER)\b',sql)
# Original packet/context pure fragments copied byte-exactly from frozen source.
a=get(S,'web/src/lib/research-v3-reviewer-assignment.ts').decode();b=get(S,'web/src/lib/research-v3-reviewer-result-projection.ts').decode()
for key,start,end in [('exactCheck','  function check(raw:unknown){','  const context='),('exactPacket','   const author=current.author,','  const snapshot=')]:
 frag=b[b.index(start):b.index(end,b.index(start))];assert frag in a; pinned=frag[:-1] if key=='exactPacket' and frag.endswith('\n') else frag;assert len(pinned.encode())==lineage[key]['bytes'] and sha(pinned.encode())==lineage[key]['sha256']
olded=get('15d4ef54ec3f0fc8ab0e5c71111ed2baf2843ccb','web/src/lib/research-editorial-review.ts').decode();newed=get(S,'web/src/lib/research-v3-editorial-review.ts').decode();assert sha(olded.encode())==lineage['editorialOriginalSha256']
# Full editorial core preserves categories/text/paragraph/decision rules except one finite source path adaptation.
def segment(t,start,end):return t[t.index(start):t.index(end,t.index(start))]
x=segment(olded,'  const article =','  const cloned =').replace('((packet.research as Row).sources as Row[])','(packet.sources as Row[])');assert x==segment(newed,'  const article =','  const cloned =')
ref=profile['predecessorSnapshot'];inventory=json.loads(get(B,'.agent/reports/2026-10-16T08-36-completed-handoff-reviewer-native/raw-inventory.json'))['files'];f=next(f for f in inventory if ref['path'].endswith('/'+f['path']));assert f['bytes']==ref['bytes']==24739380 and f['sha256']==ref['sha256']=='a92a353a1f9d246017f094aa48fb495b9212d97d5104b882cd28a3bceea85b6d';assert not ref['rootVerifiedPrivateContents']
assert profile['preNamespaceHash']=='718f62f93fd1340e71b70eed24f856f030256c040e0efdd5734d98265fbbdf61' and profile['preCatalogHash']=='e5b3fc64fc31e8b97bd25006a263fcb27228fa8a70b9c33b11b8b5527ea55658';assert len(profile['packetFieldMap'])==46
for leaf,count in [('contracts-final.tap',15),('source-checks.tap',9)]:
 t=get(E,R+leaf).decode();assert re.search(r'^# pass '+str(count)+'$',t,re.M) and re.search(r'^# fail 0$',t,re.M)
res=obj('toolchain-resources.json');runs=res['runs'];samples=[s for r0 in runs for s in r0.get('samples',[])];mins={p:min(s['free'][p] for s in samples) for p in ['/workspace','/tmp']};peak=max(s['rss'] for s in samples);assert all(v>=8589934592 for v in mins.values()) and peak<8589934592
# Source-only control-flow finding: new arm chosen solely by caller envelope schema.
receive=body(sql,'receive_research_reviewer_result_v2');split=receive.index('BEGIN\n')+6;prefix=receive[split:receive.index('DECLARE context',split)]
assert "IF p_result->>'schemaVersion'='research-reviewer-result-v3-candidate' THEN" in prefix and 'read_research_reviewer_result_context_v2' not in prefix and "wireVersion" not in prefix
legacy=body(oldsql,'receive_research_reviewer_result_v2');assert "canonical_payload'->>'schemaVersion" not in legacy and "core'->>'wireVersion" not in legacy
finding={'id':'R1','priority':'P2','path':'migrations/20261016_research_reviewer_result_union_candidate_v3.sql','line':234,'title':'Server-owned retained wire version must fence dispatch before v2 arm','sourceFacts':['Outer IF selects new branch only from p_result.schemaVersion; current result context is acquired only inside selected arms.','For a retained v3 author/input context and caller-declared result-v2, source control flow reaches preserved v2 statements starting at source377.','The preserved v2 body checks result/review v2 and older nested packet fields, but has no retained input/binding wire-version guard.'],'claimScope':'Reachable legacy arm violates finite server-owned version selection; NOT an executed SQL acceptance or persisted-row counterexample.','requiredFix':'Acquire current existing result context before dispatch or use equally strong current server-owned fence; v3 binding/input must require v3 result, v2 input must require v2 result, unknown/mismatch rejects before old arm. Preserve original legacy declaration/statements bytes, all guards/limits/roles/ACL; update only necessary receive body/successor hash/profile source-derived namespace and focused source checks. Actual mixed-version native rejection still required.'}
(D/'finding.json').write_text(json.dumps(finding,ensure_ascii=False,indent=2)+'\n')
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':S,'evidence':E,'sourceInputsVerified':326,'sourceInputBytes':total,'originalInputsUnchanged':317,'publishedIncludingReceipt':len(pub)+1,'publishedBytesIncludingReceipt':sum(f['bytes'] for f in pub)+len(rb),'privateRawScope':'41/362277 bytes inventory only; no private contents or original24739380byte snapshot acquired','receiptSha256':sha(rb),'bodyResults':bodyResults,'makerChecksOnly':r['checks'],'makerSampledPeakRss':peak,'makerMinFree':mins,'rootAvailableBytes':os.statvfs('/tmp').f_bavail*os.statvfs('/tmp').f_frsize,'rootNodeNativeBuildExecuted':False,'reviewOutcome':'REQUEST_CHANGES','findings':{'P0':0,'P1':0,'P2':1},'finding':finding,'PGNative':'NOT_RUN','formalApproval':False,'fullGoalComplete':False};(D/'root-review.json').write_text(json.dumps(out,ensure_ascii=False,indent=2)+'\n');print(json.dumps(out,ensure_ascii=False))
