// SOURCE ONLY until independent review and a separate native execution release.
// Two v3 issuers, three direct DB receive rejections each; no successful receive/replay.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import{createHash,randomUUID}from'node:crypto';
import{withLegalVersionedFixture}from'./research-versioned-legal-fixture-helper.mjs';
import{readPrerequisiteState,stateDescriptor,canonical,digest,prerequisiteDescriptor}from'./research-versioned-prerequisite-profile.mjs';
import{nativeArticle}from'./research-v3-author-native-article-fixture.mjs';
import{createV3AuthorArticleComposition}from'../../web/src/lib/research-v3-author-result.ts';
import{createV3CashCitationConsumer}from'../../web/src/lib/research-v3-article-citations.ts';
import{createV3BusinessArticleValidator}from'../../web/src/lib/research-v3-business-article.ts';
import{resolveConfiguredResearchControllerPrincipals}from'../../web/src/lib/research-execution-binding.ts';
import{completeHash,completeCanonical}from'../../web/src/lib/research-v3-material-canonical.ts';
const hash=b=>createHash('sha256').update(b).digest('hex'),sqlPath='migrations/20261015_research_author_durable_union_candidate_v3.sql',sql=fs.readFileSync(sqlPath,'utf8');
const profile=JSON.parse(fs.readFileSync('docs/operations/2026-10-15/v3-author-durable-union/source-derived-profile.json'));
process.env.INTERNAL_API_KEY='synthetic-local-author-durable-native';process.env.RESEARCH_REVIEW_KEY='synthetic-local-independent-reviewer';
const identity=resolveConfiguredResearchControllerPrincipals();assert.equal(identity.ok,true);
const metadataQuery=`SELECT jsonb_build_object('functions',(SELECT jsonb_agg(jsonb_build_object('identity',to_jsonb(p)-'prosrc','bodySha256',encode(sha256(convert_to(prosrc,'UTF8')),'hex'),'signature',p.oid::regprocedure::text) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','auth','extensions')),'defaults',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY d.oid),'[]') FROM pg_default_acl d)) value`;
async function installer({client:c,connect,close,save,setStage}){
 const observer=await connect();await observer.query('SET default_transaction_read_only=on');
 const ids={writer:(await c.query('SELECT pg_backend_pid() pid')).rows[0].pid,observer:(await observer.query('SELECT pg_backend_pid() pid')).rows[0].pid,observerReadOnly:(await observer.query('SHOW transaction_read_only')).rows[0].transaction_read_only};assert.notEqual(ids.writer,ids.observer);assert.equal(ids.observerReadOnly,'on');save('installer-connections.json',ids);
 try{
  setStage('author union: actual pristine LOCAL predecessor and codec');
  const before=await readPrerequisiteState(observer),meta=(await observer.query(metadataQuery)).rows[0].value;
  save('installer-before-private.json',{state:before,metadata:meta});assert.deepEqual(stateDescriptor(before),prerequisiteDescriptor().successor);
  const codecs={};for(const key of ['namespace','catalog']){
   const js=canonical(before[key]),db=(await observer.query('SELECT research_observed_canonical_json_v1($1::jsonb) text',[JSON.stringify(before[key])])).rows[0].text;
   let first=-1;for(let i=0;i<Math.max(js.length,db.length);i++)if(js[i]!==db[i]){first=i;break;}
   codecs[key]={jsSha256:hash(js),dbSha256:hash(db),jsBytes:Buffer.byteLength(js),dbBytes:Buffer.byteLength(db),equal:js===db,firstDifferentCodeUnit:first};save('codec-'+key+'-private.json',{js,db});
  }save('installer-codecs.json',codecs);
  setStage('author union: original 619-line SQL first apply');
  try{await c.query(sql);}catch(error){
   save('installer-original-error.json',{code:error.code,message:error.message,where:error.where,position:error.position,sqlSha256:hash(sql)});
   await c.query('ROLLBACK');const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;
   save('installer-rejected-after-private.json',{state:after,metadata:afterMeta});assert.deepEqual(after,before);assert.deepEqual(afterMeta,meta);
   save('installer-rejected-witness.json',{sqlSha256:hash(sql),code:error.code,message:error.message,namespaceUnchanged:true,catalogUnchanged:true,objectOidsRolesAndMetadataUnchanged:true,defaultsUnchanged:true,codecs,actualCommit:false});throw error;
  }
  const after=await readPrerequisiteState(observer),afterMeta=(await observer.query(metadataQuery)).rows[0].value;save('installer-committed-after-private.json',{state:after,metadata:afterMeta});
  assert.ok(Object.values(codecs).every(v=>v.equal),'DB canonical must equal original JS codec');assert.deepEqual(after.details,before.details);assert.deepEqual(afterMeta.defaults,meta.defaults);
  const changed=[];for(let i=0;i<meta.functions.length;i++){const a=meta.functions[i],b=afterMeta.functions[i];assert.deepEqual(b.identity,a.identity);assert.equal(b.signature,a.signature);if(a.bodySha256!==b.bodySha256)changed.push(b);}
  assert.equal(changed.length,4);for(const f of profile.functions){const actual=afterMeta.functions.find(v=>v.signature.startsWith(f.name+'('));assert.ok(actual);assert.equal(actual.bodySha256,f.successorBodySha256);}
  const strip=s=>({...s,catalog:{...s.catalog,functions:[]},namespace:{...s.namespace,routines:[]}});assert.deepEqual(strip(after),strip(before));
  save('installer-commit-witness.json',{connections:ids,sqlSha256:hash(sql),codecs,changed:changed.map(v=>({signature:v.signature,bodySha256:v.bodySha256,oid:v.identity.oid})),metadataUnchanged:true,commitObserved:true});
  setStage('author union: installed first-only rejection');let code;try{await c.query(sql);assert.fail('installed migration accepted');}catch(error){code={code:error.code,message:error.message};assert.equal(error.code,'P0001');assert.equal(error.message,'author_union_predecessor_namespace');}finally{await c.query('ROLLBACK');}
  assert.deepEqual(await readPrerequisiteState(observer),after);save('installer-repeat-rejected.json',code);
 }finally{await close(observer);}
}
async function snapshot(x,label){
 const audit=await x.auditState(),ledger=await x.ledger(x.audit),author={};
 for(const table of ['research_author_assignments_v2','research_author_results_v2'])author[table]=(await x.audit.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.${table} t`)).rows[0].rows;
 const charge=(await x.audit.query('SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) q')).rows[0];
 const v={audit,ledger,ledgerHash:hash(canonical(ledger)),author,charge,fd:{...x.witness}};x.save(label+'.json',v);return v;
}
async function assertInitialAuthorSourceProfile(x){
 assert.ok(x.sourceIds.length>=1&&x.sourceIds.length<=30);assert.equal(new Set(x.sourceIds).size,x.sourceIds.length);
 const observer=(await x.audit.query("SELECT pg_backend_pid() pid,current_setting('transaction_read_only') read_only")).rows[0],writer=(await x.c.query('SELECT pg_backend_pid() pid')).rows[0].pid;
 assert.notEqual(observer.pid,writer);assert.equal(observer.read_only,'on');
 const rows=(await x.audit.query(`SELECT id,left(title,513) title,octet_length(title) title_bytes,
 left(summary,4097) summary,octet_length(summary) summary_bytes,
 CASE WHEN jsonb_typeof(symbols)='array' AND octet_length(symbols::text)<=401 THEN symbols ELSE NULL END symbols,
 left(metadata->>'rights_boundary',100) rights_boundary,left(metadata->>'subject_scope',100) subject_scope,
 left(metadata->>'content_form',100) content_form,left(metadata->>'read_status',100) read_status,(metadata->'synthetic'='true'::jsonb) synthetic,
 left(metadata->>'visibility',100) visibility,left(metadata->>'claim_status',100) claim_status,
 left(metadata->>'catalyst',2049) catalyst,octet_length(metadata->>'catalyst') catalyst_bytes,
 left(metadata->>'risk',2049) risk,octet_length(metadata->>'risk') risk_bytes,
 encode(sha256(convert_to(to_jsonb(s)::text,'UTF8')),'hex') row_hash
 FROM public.source_raw_documents s WHERE id=ANY($1::uuid[]) ORDER BY id LIMIT 31`,[x.sourceIds])).rows;
 assert.equal(rows.length,x.sourceIds.length);const manifest=x.prep.payload.sourceManifest;assert.equal(manifest.length,rows.length);
 const witness=[];for(const row of rows){
  assert.ok(x.sourceIds.includes(row.id));assert.equal(row.title,'Synthetic local '+x.symbol);assert.equal(row.summary,'Local engineering fixture mentions '+x.symbol);assert.deepEqual(row.symbols,[x.symbol]);
  for(const [key,value]of Object.entries({rights_boundary:'public_citation',subject_scope:'company_mentions',content_form:'article_body',read_status:'synthetic_local_fixture',synthetic:true,visibility:'public',claim_status:'rumor',catalyst:'Synthetic local engineering fixture: unconfirmed discussion only.',risk:'Synthetic local engineering fixture: no verified orders, rights or author approval.'}))assert.equal(row[key],value,key);
  for(const [key,max]of [['title',512],['summary',4096],['catalyst',2048],['risk',2048]]){assert.equal(Buffer.byteLength(row[key]),row[key+'_bytes']);assert.ok(row[key+'_bytes']>=1&&row[key+'_bytes']<=max);}
  assert.equal(manifest.find(v=>v.id===row.id)?.rowHash,row.row_hash);
  witness.push({ordinal:witness.length,symbol:x.symbol,rowHash:row.row_hash,manifestRowHashMatched:true,rightsBoundary:row.rights_boundary,subjectScope:row.subject_scope,visibility:row.visibility,claimStatus:row.claim_status,synthetic:row.synthetic,titleBytes:row.title_bytes,summaryBytes:row.summary_bytes,catalystBytes:row.catalyst_bytes,riskBytes:row.risk_bytes,exactFixedSyntheticFields:true});
 }
 x.save('author-source-profile-safe.json',{profile:'author_packet',observerPid:observer.pid,writerPid:writer,observerReadOnly:true,stage:'after neutral preparation / before firstseal',rows:witness,formalRightsVerified:false,formalAuthorVerified:false});
}

assert.equal(hash(sql),'18b0e4814410601ab8b254f274a7fe085230b922656038cc1f8fe2539c056f76');
assert.equal(hash(fs.readFileSync('docs/operations/2026-10-15/v3-author-durable-union/source-derived-profile.json')),'19526e0199a406857de4c9869afd3cb243f74603ee960f06bc5e812c5d291243');
const RECEIVE_SQL='SELECT public.receive_research_author_result_v2($1::jsonb,$2::uuid,$3::text,$4::text,$5::jsonb) value';
const OTHER_PRINCIPAL='9c'.repeat(32),OVERFLOW_ASCII_BYTES=1048577;
const ENVELOPE_KEYS=['assignmentId','bindingCapsuleIdentity','financialProfile','inputHash','inputRevisionId','observation','rawArticle','schemaVersion','validatedArticle','validatorVersion','wireVersion'];
// Finite mutations of a genuine prepared diagnostic. No validation bypass flag or arbitrary path selector.
function receiveMutants(envelope,principal){
 assert.deepEqual(Object.keys(envelope).sort(),ENVELOPE_KEYS);assert.equal(envelope.schemaVersion,'research-author-result-v3-candidate');
 assert.equal(envelope.wireVersion,'research-article-input-v3');assert.match(principal,/^[a-f0-9]{64}$/);assert.notEqual(principal,OTHER_PRINCIPAL);
 const originalHash=completeHash(envelope),originalBytes=Buffer.byteLength(completeCanonical(envelope));assert.ok(originalBytes>0&&originalBytes<=1048576);
 const wrong=JSON.parse(JSON.stringify(envelope));assert.deepEqual(wrong,envelope);
 assert.equal(typeof envelope.observation.invocationId,'string');assert.ok(envelope.observation.invocationId.length>0);
 const invocation=JSON.parse(JSON.stringify(envelope));invocation.observation.invocationId='';
 const restoredInvocation=JSON.parse(JSON.stringify(invocation));restoredInvocation.observation.invocationId=envelope.observation.invocationId;assert.deepEqual(restoredInvocation,envelope);
 assert.equal(typeof envelope.rawArticle.companyBackground,'string');assert.ok(envelope.rawArticle.companyBackground.length>0);
 const oversized=JSON.parse(JSON.stringify(envelope));oversized.rawArticle.companyBackground+='X'.repeat(OVERFLOW_ASCII_BYTES);
 const restoredOversized=JSON.parse(JSON.stringify(oversized));restoredOversized.rawArticle.companyBackground=envelope.rawArticle.companyBackground;assert.deepEqual(restoredOversized,envelope);
 const oversizedBytes=Buffer.byteLength(completeCanonical(oversized)); // Original depth12 codec must accept the unchanged shape.
 assert.equal(oversizedBytes,originalBytes+OVERFLOW_ASCII_BYTES);assert.ok(oversizedBytes>1048576&&oversizedBytes<=2097153);
 assert.deepEqual(oversized.validatedArticle,envelope.validatedArticle);assert.deepEqual(Object.keys(oversized).sort(),ENVELOPE_KEYS);
 const cases=[
  {kind:'principal',principal:OTHER_PRINCIPAL,envelope:wrong,error:'research_author_assignment_replay_conflict',delta:'/rpc/p_principal'},
  {kind:'invocation',principal,envelope:invocation,error:'research_author_result_binding',delta:'/observation/invocationId'},
  {kind:'receive-bound',principal,envelope:oversized,error:'research_author_result_bound',delta:'/rawArticle/companyBackground'}
 ];
 assert.equal(completeHash(envelope),originalHash);
 return cases.map(c=>({...c,originalHash,originalBytes,mutantHash:completeHash(c.envelope),mutantBytes:Buffer.byteLength(completeCanonical(c.envelope)),deltaOnly:true}));
}
const AUDIT_TABLES=['research_input_preparations_v2','research_article_input_revisions_v2','research_source_seals_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_deep_admission_charges_v1','research_model_reservations_v1','research_model_completions_v1','source_raw_documents','research_author_assignments_v2','research_author_results_v2','research_source_fence_events_v2','research_source_seal_invalidations_v2'];
async function receiveSnapshot(x,label){
 await x.audit.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
 try{
  assert.equal((await x.audit.query('SHOW transaction_read_only')).rows[0].transaction_read_only,'on');
  const tables={};for(const table of AUDIT_TABLES)tables[table]=(await x.audit.query(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]') rows FROM public.${table} t`)).rows[0].rows;
  const ledger=await x.ledger(x.audit),audit=await x.auditState(),charge=(await x.audit.query('SELECT count(*)::int count,coalesce(sum(logical_bytes),0)::int bytes FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) q')).rows[0];
  assert.equal(Object.keys(tables).length,13);const value={tables,ledger,ledgerHash:hash(canonical(ledger)),audit,charge,fd:{...x.witness}};x.save(label+'-private.json',value);return value;
 }finally{await x.audit.query('ROLLBACK');}
}
function safeSnapshot(value){return {fullSnapshotHash:hash(canonical(value)),tables:Object.fromEntries(Object.entries(value.tables).map(([k,rows])=>[k,{count:rows.length,sha256:hash(canonical(rows))}])),ledgerHash:value.ledgerHash,audit:value.audit,charge:value.charge,fd:value.fd};}
// Implicit statement transaction: a real ErrorResponse is followed by ReadyForQuery I, not E.
// No fabricated RPC result, timer, retry, explicit transaction, or recovery receive.
async function receiveRejection(client,params,expected,save){
 let onReady,onEnd,onError;
 const ready=new Promise((resolve,reject)=>{onReady=m=>resolve(m.status);onEnd=()=>reject(Error('receive_connection_ended_before_ready'));onError=e=>reject(e);client.connection.once('readyForQuery',onReady);client.connection.once('end',onEnd);client.connection.once('error',onError);});
 let actual;try{actual=await Promise.allSettled([client.query(RECEIVE_SQL,params),ready]);}
 finally{client.connection.removeListener('readyForQuery',onReady);client.connection.removeListener('end',onEnd);client.connection.removeListener('error',onError);}
 const [query,protocol]=actual;
 save({queryStatus:query.status,readyStatus:protocol.status,readyForQuery:protocol.status==='fulfilled'?protocol.value:null,...(query.status==='rejected'?{code:query.reason.code,message:query.reason.message,where:query.reason.where,position:query.reason.position}:{unexpectedSuccess:true})});
 assert.equal(protocol.status,'fulfilled','real ReadyForQuery required');assert.equal(protocol.value,'I','implicit failed statement must be idle');
 assert.equal(query.status,'rejected','receive must not succeed');assert.equal(query.reason.code,'P0001');assert.equal(query.reason.message,expected);
 return {code:query.reason.code,message:query.reason.message,readyForQuery:protocol.value,queryActuallySettled:true};
}
async function receiveNegativeCase(x){
 await assertInitialAuthorSourceProfile(x);
 x.setStage('author lifecycle: genuine v3 input firstseal');const prepared=await snapshot(x,'01-prepared');const first=await x.controller.runCompleteInput(x.rpc,x.req,true);assert.equal(first.replay,false);const sealed=await snapshot(x,'02-firstseal-observed');assert.equal(sealed.charge.count,2);const revision=sealed.ledger.revisions[0];assert.equal(first.revision_id,revision.revision_id);
 const names=['assign_research_author_v2','read_research_author_assignment_v2','read_research_author_packet_v2','receive_research_author_result_v2','read_research_author_result_v2'],trace=[];
 const db={rpc:async(name,args)=>{assert.notEqual(name,'receive_research_author_result_v2','prefix must never receive');trace.push({name,fd:{...x.witness}});x.save('author-rpc-order.json',trace);if(!names.includes(name))return x.rpc.rpc(name,args);const keys=['p_request','p_revision_id','p_input_hash','p_principal',...(name==='receive_research_author_result_v2'?['p_result']:[])];assert.equal((await x.c.query('SELECT current_user role')).rows[0].role,'service_role');try{return{data:(await x.c.query(`SELECT public.${name}(${keys.map((_,i)=>'$'+(i+1)).join(',')}) value`,keys.map(k=>args[k]))).rows[0].value,error:null};}catch(e){x.save('author-rpc-error.json',{name,code:e.code,message:e.message,where:e.where});throw e;}}};
 const config={bindingTexts:x.texts.filter(t=>JSON.parse(t).wireVersion==='research-article-input-v3'),executorFingerprint:x.hc},composition=createV3AuthorArticleComposition(config);let article,observation;
 const request=action=>new Request('https://fixture.invalid/private-native-composition-not-http-route',{method:'POST',headers:{authorization:'Bearer '+process.env.INTERNAL_API_KEY,'content-type':'application/json','x-research-author-result-action':action},body:JSON.stringify({action,input:x.req,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,...(action==='receiveAuthorResult'?{article,observation}:{})})});
 x.setStage('author lifecycle: actual authenticated assign and packet');const assigned=await composition.assignAuthor(request('assignAuthor'),db),packet=await composition.readAuthorPacket(request('readAuthorPacket'),db);const a=await snapshot(x,'03-assigned');assert.equal(a.author.research_author_assignments_v2.length,1);assert.equal(a.author.research_author_results_v2.length,0);assert.deepEqual(a.ledger,sealed.ledger);assert.deepEqual(a.fd,sealed.fd);
 const set=await createV3CashCitationConsumer(config).read(db,JSON.stringify(x.req),revision.revision_id,revision.input_hash),original=nativeArticle(x.symbol,revision,set);article=original.article;
 const validated=await createV3BusinessArticleValidator(config).validate(db,JSON.stringify(x.req),revision.revision_id,revision.input_hash,JSON.stringify(article),packet.packet.sources.map(s=>s.descriptor));
 observation={version:'research_execution_observation_v2',assignmentId:assigned.assignment.assignment_id,jobId:x.req.jobId,attempt:x.req.attempt,reservationId:x.req.reservationId,inputRevisionId:revision.revision_id,inputHash:revision.input_hash,articleHash:validated.validatedArticle.articleHash,reviewPackHash:null,outputHash:completeHash(article),verificationLevel:'trusted_controller_observation',providerSurface:'codex_cross_chat',hostId:null,threadId:randomUUID(),turnId:null,invocationId:'synthetic-local-'+randomUUID(),dispatchObservationHash:hash('synthetic-dispatch'),completionObservationHash:hash('synthetic-completion'),controllerObservedStartAt:article.authoredAt,controllerObservedEndAt:new Date().toISOString(),modelIdentity:null};

 x.setStage('author negatives: genuine validated diagnostic, no persistence');
 const diagnostic=await composition.prepareAuthorResult(request('receiveAuthorResult'),db);
 assert.deepEqual(diagnostic.persistence,{status:'unavailable',requiredRpc:'receive_research_author_result_v2',reason:'diagnostic preparation only; call receiveAuthorResult for a durable receipt'});
 for(const key of ['dispatchReady','modelDispatched','publishableResearch'])assert.equal(diagnostic[key],false);assert.equal(diagnostic.controllerReportOnly,true);
 assert.equal(diagnostic.envelopeHash,completeHash(diagnostic.envelope));assert.deepEqual(diagnostic.envelope.rawArticle,article);assert.deepEqual(diagnostic.envelope.validatedArticle,validated.validatedArticle);
 assert.deepEqual(diagnostic.envelope.observation,observation);assert.equal(trace.filter(v=>v.name==='receive_research_author_result_v2').length,0);
 x.save('prepared-diagnostic-envelope-private.json',diagnostic);
 const identity=(await x.c.query("SELECT pg_backend_pid() pid,current_user role,current_setting('transaction_isolation') isolation")).rows[0],observer=(await x.audit.query("SELECT pg_backend_pid() pid,current_setting('transaction_read_only') read_only")).rows[0];
 assert.equal(identity.role,'service_role');assert.equal(identity.isolation,'read committed');assert.notEqual(identity.pid,observer.pid);assert.equal(observer.read_only,'on');x.save('negative-connections.json',{writer:identity,observer});
 const baseline=await receiveSnapshot(x,'04-diagnostic-baseline');assert.equal(baseline.charge.count,2);assert.equal(baseline.tables.research_author_assignments_v2.length,1);assert.equal(baseline.tables.research_author_results_v2.length,0);
 assert.deepEqual(baseline.tables.research_author_assignments_v2,[assigned.assignment]);assert.deepEqual(baseline.ledger,sealed.ledger);assert.deepEqual(baseline.fd,sealed.fd);
 const originalPrincipal=assigned.assignment.controller_principal,envelope=diagnostic.envelope,variants=receiveMutants(envelope,originalPrincipal),proofs=[];
 for(const variant of variants){
  x.setStage('author direct receive negative: '+variant.kind);assert.equal((await x.c.query('SELECT current_user role')).rows[0].role,'service_role');
  const before=await receiveSnapshot(x,'before-'+variant.kind);assert.deepEqual(before,baseline);
  const params=[x.req,revision.revision_id,revision.input_hash,variant.principal,variant.envelope];
  const transport={parameterCount:params.length,sqlSha256:hash(RECEIVE_SQL),requestHash:completeHash(x.req),inputRevisionIdHash:hash(revision.revision_id),inputHash:revision.input_hash,principalHash:hash(variant.principal),originalPrincipalHash:hash(originalPrincipal),originalEnvelopeHash:variant.originalHash,mutantEnvelopeHash:variant.mutantHash,originalCanonicalBytes:variant.originalBytes,mutantCanonicalBytes:variant.mutantBytes,onlyDelta:variant.delta,addedAsciiBytes:variant.kind==='receive-bound'?OVERFLOW_ASCII_BYTES:0};
  x.save('mutant-'+variant.kind+'-private.json',{transport,envelope:variant.envelope});
  const error=await receiveRejection(x.c,params,variant.error,record=>x.save('receive-'+variant.kind+'-settlement-private.json',record));
  const after=await receiveSnapshot(x,'after-'+variant.kind);assert.deepEqual(after,before);assert.deepEqual(after,baseline);assert.equal(after.tables.research_author_results_v2.length,0);
  assert.equal(completeHash(envelope),diagnostic.envelopeHash);proofs.push({kind:variant.kind,transport,error,before:safeSnapshot(before),after:safeSnapshot(after)});x.save('receive-negative-progress-witness.json',{symbol:x.symbol,proofs});
 }
 assert.equal(proofs.length,3);assert.equal(trace.filter(v=>v.name==='receive_research_author_result_v2').length,0);
 x.save('receive-negative-witness.json',{symbol:x.symbol,proofs,baseline:safeSnapshot(baseline),prefix:{inputFirstSeal:1,assignments:1,authorResults:0,opened:sealed.fd.opens-prepared.fd.opens,closed:sealed.fd.closes-prepared.fd.closes,originalDraftSha:original.draftSha,compositionRpcNames:trace.map(v=>v.name),diagnosticPreparedNotPersisted:true},directReceiveAttempts:3,successfulReceives:0,modelInvocations:0,actualHttpRoute:false,formalAuthorApproval:false,wholeExecutionClosureApproved:false,sourceProseMapping:original.sourceProseMapping});
}
await test('new author receive negatives: two v3 issuers only',async t=>{
 for(const symbol of ['2409','2383']){let failure;await t.test(symbol+' direct receive principal/invocation/envelope bound',async()=>{
  const label='author-receive-negative-'+symbol;
  try{await withLegalVersionedFixture(symbol,{label,wireVersion:'research-article-input-v3',sourceProfile:'author_packet',afterPrerequisite:installer},async x=>{try{await receiveNegativeCase(x);}catch(error){try{await receiveSnapshot(x,'failure-before-cleanup');}catch(snapshotError){x.save('failure-snapshot-error.json',{message:snapshotError.message});}throw error;}});}catch(error){failure=error;throw error;}
  finally{const base=process.env.RESEARCH_PREREQUISITE_PROFILE_ARTIFACTS,p=path.join(base,symbol+'-'+label+'-cleanup.json');if(fs.existsSync(p)){const cleanup=JSON.parse(fs.readFileSync(p));assert.equal(fs.existsSync(cleanup.removed),false);fs.writeFileSync(path.join(base,symbol+'-'+label+'-cluster-absent.json'),JSON.stringify({clusterRemoved:true,stopped:cleanup.stopped,stage:cleanup.stage})+'\n');}}
 });if(failure)throw failure;}
});
