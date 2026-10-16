import subprocess,json,hashlib,re,pathlib,datetime,os
G='/tmp/stockinsider-discovery-release-root-review-oct14';S='1349525f192c1ff78ff7bba409eee0e891ba4a5b';E='490a20fb316892eb0cbb43bb6b995997e2e449ef';B='6503307df3507504a0b696cb5fe881d8a7e6ec06';R='.agent/reports/2026-10-16T09-35-reviewer-dispatch-fix/';D=pathlib.Path('/tmp/stockinsider-reviewer-dispatch-fix-root-review-oct16')
def git(*a):return subprocess.check_output(['git',*a],cwd=G)
def get(ref,p):return git('show',ref+':'+p)
def sha(b):return hashlib.sha256(b).hexdigest()
def obj(p):return json.loads(get(E,R+p))
def body(t,n):return re.search(r'CREATE OR REPLACE FUNCTION public\.'+n+r'\([\s\S]*?AS \$\$([\s\S]*?)\$\$;',t).group(1)
r=obj('receipt.json');rb=get(E,R+'receipt.json');assert sha(rb)=='448dcc1a846e40781897b37db18a338888c83a8fcc3d229d1da50fc20db03271';assert r['base']==B and r['source']==S and git('rev-parse',S+'^{tree}').decode().strip()==r['tree']
seal=obj('source-seal.json');fs=seal['files'];assert len(fs)==len({f['path'] for f in fs})==328
q=b''.join((S+':'+f['path']+'\n').encode() for f in fs);data=subprocess.run(['git','cat-file','--batch'],input=q,cwd=G,stdout=subprocess.PIPE,check=True).stdout;at=0;total=0
for f in fs:
 end=data.index(b'\n',at);h=data[at:end].decode().split();n=int(h[2]);at=end+1;b=data[at:at+n];at+=n+1;assert h[0]==f['blob'] and h[1]=='blob' and n==f['bytes'] and sha(b)==f['sha256'],f['path'];total+=n
assert at==len(data) and total==10460237
old=json.loads(get(B,'.agent/reports/2026-10-16T09-03-reviewer-result-union-source/source-seal.json'))['files'];now={f['path']:f for f in fs};changes=[f['path'] for f in old if now[f['path']]['blob']!=f['blob']];assert len(old)==326 and changes==['docs/operations/2026-10-16/v3-reviewer-result-union/source-derived-profile.json','migrations/20261016_research_reviewer_result_union_candidate_v3.sql']
pubtotal=len(rb)
for f in r['files']:
 b=get(E,R+f['path']);assert len(b)==f['bytes'] and sha(b)==f['sha256'];pubtotal+=len(b);(D/f['path']).write_bytes(b)
(D/'receipt.json').write_bytes(rb);raw=obj('raw-inventory.json');assert len(raw['files'])==raw['count']==27 and sum(f['bytes'] for f in raw['files'])==raw['bytes']==216135
assert all(re.fullmatch('[a-f0-9]{64}',f['sha256']) for f in raw['files'])
p='migrations/20261016_research_reviewer_result_union_candidate_v3.sql';a=get(B,p).decode();b=get(S,p).decode();oldbody=body(a,'receive_research_reviewer_result_v2');newbody=body(b,'receive_research_reviewer_result_v2');start=newbody.index(' -- Server-owned dispatch fence');end=newbody.index('\n',newbody.index(' -- End server-owned dispatch fence'))+1;pre=newbody[start:end]
assert len(pre.encode())==2227 and sha(pre.encode())=='3d78015c19819d9fafb9f8e864486a2ae4b515f090659132077a2e4b6974c1d7'
assert newbody[:start]+newbody[end:]==oldbody and b.replace(pre,'').replace(sha(newbody.encode()),sha(oldbody.encode()))==a
assert len(newbody.encode())==23702 and sha(newbody.encode())=='8505d96f288d7e222fa85779f7c400f44c7a54dcca0c8bfc4e33e6cc73d72302' and sha(b.encode())=='8e8929f6353fbd814c4b8d8d34499dc90ef7dffea839fc5d8873455df5a07001'
assert body(a,'assert_research_editorial_review_v2')==body(b,'assert_research_editorial_review_v2')
assert start<newbody.index("IF p_result->>'schemaVersion'='research-reviewer-result-v3-candidate'")
assert pre.index('context:=public.read_research_reviewer_result_context_v2(p_request,p_revision_id,p_input_hash,p_author_principal,p_reviewer_principal,p_result_id,p_result_hash);')<pre.index("h:=context->'authorContext'")<pre.index("IF h->'revision'->'canonical_payload'->>'schemaVersion'")
assert "p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v3-candidate'" in pre and "p_result->>'schemaVersion' IS DISTINCT FROM 'research-reviewer-result-v2'" in pre and "ELSE RAISE EXCEPTION 'research_reviewer_result_dispatch_version'" in pre
assert pre.count('read_research_reviewer_result_context_v2')==1 and 'EXCEPTION WHEN' not in pre and 'research_input_binding_candidate_v3' not in pre
assert b.count('ANY(ARRAY(SELECT')==8
pp='docs/operations/2026-10-16/v3-reviewer-result-union/source-derived-profile.json';ap=json.loads(get(B,pp));bp=json.loads(get(S,pp));norm=json.loads(json.dumps(bp));norm['functions'][1]['successorBodySha256']=ap['functions'][1]['successorBodySha256'];norm['functions'][1]['successorBytes']=ap['functions'][1]['successorBytes'];norm['sqlSha256']=ap['sqlSha256'];norm['sourceDerivedSuccessorNamespaceHash']=ap['sourceDerivedSuccessorNamespaceHash'];assert norm==ap and bp['nativeVerified']==False
assert bp['functions'][1]['successorBodySha256']==sha(newbody.encode()) and bp['functions'][1]['successorBytes']==len(newbody.encode()) and bp['sqlSha256']==sha(b.encode())
dw=obj('derivation-witness.json');assert dw['snapshotBytes']==24739380 and dw['snapshotSha256']==ap['predecessorSnapshot']['sha256'] and dw['sourceDerivedSuccessorNamespace']==bp['sourceDerivedSuccessorNamespaceHash']
for name,n in [('focused.tap',5),('affected-static.tap',9)]:
 t=get(E,R+name).decode();assert re.search(r'^# pass '+str(n)+'$',t,re.M) and re.search(r'^# fail 0$',t,re.M)
out={'utc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'source':S,'evidence':E,'verifiedGitInputs':328,'gitBytes':total,'prior326Unchanged':324,'changedPriorPaths':changes,'publishedFilesIncludingReceipt':9,'publishedBytes':pubtotal,'privateRawInventoryOnly':{'count':27,'bytes':216135},'preambleBytes':2227,'preambleSha256':sha(pre.encode()),'newReceiveBytes':23702,'newReceiveSha256':sha(newbody.encode()),'sqlSha256':sha(b.encode()),'originalReceiveAndEntireSQLReconstructed':True,'editorialAndAllTSUnchanged':True,'profileOnlyFourNecessaryFieldsChanged':True,'R1SourceControlFlow':'closed by server current context gate before either arm','sourceReview':{'P0':0,'P1':0,'P2':0},'nativeMixedVersionAcceptance':'NOT_RUN','privateSnapshotContentsAcquired':False,'privateSuccessorNamespaceRootRecomputed':False,'rootNodePGNativeBuild':False,'rootAvailableBytes':os.statvfs('/tmp').f_bavail*os.statvfs('/tmp').f_frsize,'fullGoalComplete':False}
(D/'root-check.json').write_text(json.dumps(out,indent=2)+'\n');print(json.dumps(out))
