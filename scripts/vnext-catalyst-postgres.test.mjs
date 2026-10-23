/** NEW protocol acceptance, not a live source or semantic/model approval.
 * Fresh mode runs original legal fixture + actual worker RPCs with a synthetic
 * provider. The finite retained mode proves installer/authority only and never
 * reports the fresh business path as executed. No old test entry is imported. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {roles,binding,input,authorOutput,reviewerOutput,day,now} from './vnext-synthetic-research-vectors.mjs';
import {runResearchWorker} from '../web/src/lib/vnext/worker-core.ts';
import {CATALYST_WORKER_PROFILE} from '../web/src/lib/vnext/worker-prompts.ts';
import {CATALYST_CRITERIA} from '../web/src/lib/vnext/semantic-criteria.ts';
import {extractContentBatch} from '../web/src/lib/vnext/permitted-content.ts';
import {auditPublishedThesis} from '../web/src/lib/vnext/thesis-audit.ts';
import {deepFactors,initialFactors} from '../web/src/lib/vnext/factors.ts';
import {inputHash} from '../web/src/lib/vnext/policy.ts';
const stage=process.env.VNEXT_CATALYST_TEST_STAGE??'fresh';
assert.ok(['fresh','retained-twse-o23'].includes(stage));
const suffix=stage==='fresh'?'06':'11';
assert.equal(process.env.VNEXT_TEST_CONTAINER,'stockinsider-vnext-oct22-worker-'+suffix);
assert.equal(process.env.VNEXT_WORKER_SOCKET_PARENT,'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-'+suffix);
const migration='migrations/20261022_vnext_catalyst_criteria_v1.sql';
const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-catalyst-criteria-profile-v1.json','utf8'));
await test('source-bound catalyst actual PG protocol: '+stage,{timeout:300000},async t=>{
 const x=await workerFixture(),events=[],providerCalls=[];let originalState;
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){
  failed=true;
  // Only finite diagnostic metadata may reach CI annotations. Full assertion
  // objects/rows, source bodies, IDs, credentials and stack remain private.
  const primitive=v=>v===null||typeof v==='boolean'||typeof v==='number'&&Number.isFinite(v)?v:'REDACTED_NONPRIMITIVE';
  const code=typeof error.code==='string'&&/^(?:[0-9A-Z]{5}|ERR_ASSERTION)$/u.test(error.code)?error.code:'UNKNOWN';
  const message=typeof error.message==='string'&&/^vnext_[a-z0-9_]{1,160}$/u.test(error.message)?error.message:'message_sha256:'+hash(String(error.message));
  const detail={stage:name,code,message,actual:primitive(error.actual),expected:primitive(error.expected)};
  console.log('CATALYST_FAILURE_SAFE '+JSON.stringify(detail));x.save('failure-safe',detail);throw error;
 }});if(failed)throw Error('dependent_catalyst_stage_failed');};
 const query=async(sql,args=[],role='service_role',expected)=>{const c=await x.connect();try{
  assert.ok(['service_role','stockinsider_vnext_owner'].includes(role));await c.query('SET ROLE '+role);
  const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));
  const [q,r]=await Promise.allSettled([c.query(sql,args),ready]);assert.equal(r.status,'fulfilled');assert.equal(r.value,'I');
  events.push({statementHash:hash(sql),role,pid:c.processID,ready:r.value,querySettled:true,...q.status==='rejected'?{code:q.reason.code,message:q.reason.message}:{committed:true}});
  if(expected){assert.equal(q.status,'rejected');assert.equal(q.reason.code,expected.code);assert.match(q.reason.message,expected.message);return;}
  if(q.status==='rejected')throw q.reason;return q.value;
 }finally{await x.close(c);}};
 const command=(name,action,body)=>query(`SELECT public.${name}($1,$2,$3::jsonb) AS result`,[roles.operator.principal,action,JSON.stringify(body)]).then(r=>r.rows[0].result);
 const source=(a,b)=>command('vnext_analysis_command_v1',a,b),thesis=(a,b)=>command('vnext_thesis_command_v1',a,b);
 const routines=async()=>(await x.observer.query("SELECT p.oid,p.oid::regprocedure::text AS signature,to_jsonb(p)-'prosrc' AS metadata,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY p.oid")).rows;
 const constraints=async()=>(await x.observer.query("SELECT c.oid,to_jsonb(c)-'oid'-'conbin' AS metadata,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c WHERE conrelid='public.vnext_provider_bindings_v1'::regclass ORDER BY c.conname")).rows;
 try{
  await step('full exact candidate COMMIT preserves prior rows/metadata and permits only three body plus one constraint deltas',async()=>{
   if(stage==='fresh'){
    await x.install();
    for(const path of ['migrations/20261022_vnext_analysis_sources_v1.sql','migrations/20261022_vnext_thesis_audit_v1.sql','migrations/20261022_vnext_source_withdrawals_v1.sql','migrations/20261022_vnext_cached_admission_v2.sql','migrations/20261022_vnext_terminal_failure_slots_v1.sql','migrations/20261022_vnext_financial_status_text_v1.sql','migrations/20261022_vnext_issuer_ir_sources_v1.sql','migrations/20261022_vnext_semantic_score_fence_v1.sql'])await x.writer.query(fs.readFileSync(path,'utf8'));
   }else{
    const path='/tmp/stockinsider-vnext-oct22-private/twse-native-retained-o23/final-state.json';
    const bytes=fs.readFileSync(path);assert.equal(hash(bytes),'15b5d243b7c6036f77c6292bddcce2a2c24415f6c263c037c1e79fab0c610926');assert.deepEqual(await x.snapshot(),JSON.parse(bytes));
   }
   await x.observer.query('SET default_transaction_read_only=on');
   originalState=await x.snapshot();const before=await routines(),oldConstraints=await constraints();
   const bytes=fs.readFileSync(migration);assert.equal(hash(bytes),profile.migrationSha256);
   const ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));await x.writer.query(bytes.toString());assert.equal(await ready,'I');
   assert.deepEqual(await x.snapshot(),originalState);const after=await routines();
   for(const old of before){const current=after.find(r=>r.oid===old.oid);assert.ok(current);const p=profile.routines.find(p=>p.signature.replace('public.','')===old.signature);if(p){assert.equal(old.body,p.predecessorBodySha256);assert.equal(current.body,p.successorBodySha256);assert.deepEqual(current.metadata,old.metadata);}else assert.deepEqual(current,old);}
   assert.equal(after.length,before.length+2);
   for(const p of profile.newPrivateRoutines){const actual=after.find(r=>r.signature===p.signature.replace('public.',''));assert.ok(actual);assert.equal(actual.body,p.bodySha256);}
   const currentConstraints=await constraints();assert.equal(currentConstraints.length,oldConstraints.length);
   for(const old of oldConstraints){const current=currentConstraints.find(c=>c.metadata.conname===old.metadata.conname);assert.ok(current);assert.deepEqual(current.metadata,old.metadata);if(old.metadata.conname===profile.promptConstraint.name){assert.equal(old.definition,profile.promptConstraint.predecessorDefinition);assert.equal(current.definition,profile.promptConstraint.successorDefinition);}else assert.deepEqual(current,old);}
   x.save('install',{stage,migration,bytes:bytes.length,sha256:hash(bytes),before,after,oldConstraints,currentConstraints,wholeBusinessRowsUnchanged:true,scope:stage==='fresh'?'full original captured financial50/publication26 plus explicitly listed vNext candidates; synthetic engineering setup':'retained exact TWSE-complete baseline; no fresh bundle or old installer replay'});
  });
  await step('private semantic/core functions reject service-role execution; unknown revision owner READ is null and writes nothing',async()=>{
   const state=await x.snapshot();
   await query('SELECT public.vnext_semantic_criteria_current_v1($1,$2)',['00000000-0000-4000-8000-000000000099','a'.repeat(64)],'service_role',{code:'42501',message:/permission denied/u});
   const r=await query('SELECT public.vnext_semantic_criteria_current_v1($1,$2) AS receipt',['00000000-0000-4000-8000-000000000099','a'.repeat(64)],'stockinsider_vnext_owner');assert.equal(r.rows[0].receipt,null);assert.deepEqual(await x.snapshot(),state);
  });
  if(stage==='fresh'){
   const b=role=>({...binding(role),promptVersion:CATALYST_WORKER_PROFILE.version,instructions:CATALYST_WORKER_PROFILE[role]});
   const anchor='新型控制晶片正式發布活動';const eventDay=new Date(Date.now()+30*86400000).toISOString().slice(0,10);
   await step('actual source reserve/complete and compiled v3 bindings use different engineering principals; no binding is rewritten',async()=>{
    await x.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,'operator',true),($2,'author',true),($3,'reviewer',true)",[roles.operator.principal,roles.author.principal,roles.reviewer.principal]);
    await x.writer.query("INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval'1 hour',true)",[day]);
    for(const role of ['author','reviewer']){const v=b(role);await x.writer.query('INSERT INTO public.vnext_provider_bindings_v1(principal,task,provider,model,model_version,credential_identity,prompt_version,instructions,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[v.identity.principal,role,v.provider,v.model,v.modelVersion,v.credentialIdentity,v.promptVersion,v.instructions]);}
    await x.writer.query("INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original','synthetic-protocol-fixture','synthetic-engineering-only',clock_timestamp()+interval'1 hour',true)");
    for(const symbol of ['2409','2383']){const negative=symbol==='2383',text=`🔬${symbol}官方公告：${anchor}將於${eventDay}舉行；若主要訂單取消，活動收入假說失效。${negative?'公司更正：先前所稱獨立驗證並未通過，撤回先前聲稱。':'目前僅公司單一公告，不代表獨立來源核實。'}`;
     const content={id:'synthetic-catalyst-'+symbol,source:'official',scope:'official_original',url:'https://mops.twse.com.tw/synthetic-catalyst-'+symbol,eventAt:now,publishedAt:now,eventBasis:'source_publication',availableAt:now,symbols:[symbol],originalRoot:'https://mops.twse.com.tw/synthetic-catalyst-'+symbol,authorRoot:'synthetic-single-official',body:text};await extractContentBatch([content],now,source);
    }
   });
   const provider={invoke:async(request,id)=>{const doc=JSON.parse(request.input);providerCalls.push({task:doc.task,id,requestHash:hash(JSON.stringify(request)),synthetic:true});
    if(doc.task==='author'){const raw=authorOutput(),e=doc.evidence.evidence.find(e=>e.key==='reported_event');assert.ok(e);const text=e.value.statement;raw.claims.push(...CATALYST_CRITERIA.map((criterion,i)=>({id:'catalyst-'+i,kind:'assumption',text:'Synthetic source-specific interpretation; no real semantic or financial approval.',evidenceIds:[e.id],semantic:{schemaVersion:'vnext-catalyst-annotation-v1',criterion,outcome:criterion==='catalyst_verified'&&doc.symbol==='2383'?'not_met':'met',symbol:doc.symbol,evidenceId:e.id,contentHash:e.contentHash,field:'statement',startCp:0,endCp:Array.from(text).length,quote:text,catalystAt:eventDay,catalystIdentity:anchor}})));for(const s of Object.values(raw.sections)){s.evidenceIds.push(e.id);s.claimIds.push(...raw.claims.filter(c=>c.semantic).map(c=>c.id));}return {status:'completed',responseId:'resp_catalyst_'+id.replaceAll('-',''),raw:{synthetic:true},output:raw};}
    const raw=reviewerOutput(doc);for(const check of raw.claimChecks){const claim=doc.authorArtifact.claims.find(c=>c.id===check.claimId);if(claim.semantic)check.semanticAssessment={schemaVersion:'vnext-catalyst-assessment-v1',annotation:structuredClone(claim.semantic),assessment:['catalyst_dated','catalyst_verified'].includes(claim.semantic.criterion)?'supported_report':'supported_inference',reason:'Synthetic comparison of the exact original quote, event date, issuer and explicit stated outcome; not actual model or external semantic approval.'};}return {status:'completed',responseId:'resp_catalyst_'+id.replaceAll('-',''),raw:{synthetic:true},output:raw};},lookup:async()=>{throw Error('no implicit recovery/resampling');}};
   const deps={author:b('author'),reviewer:b('reviewer'),provider,journal:(i,a,v)=>x.rpc(i.principal,a,v,true),command:(i,a,v)=>x.rpc(i.principal,a,v),prepare:async(i,v)=>{const r=await x.rpc(i.principal,'claim',v);if(r.execute!==true)return r;const frozen={...r.evidence,admissionHash:r.inputHash,syntheticPreparation:true},h=inputHash(frozen);await x.rpc(i.principal,'prepare',{jobId:v.jobId,executionId:r.executionId,inputHash:h,evidence:frozen});return {...r,inputHash:h,evidence:frozen};},authorReceipt:(i,v)=>x.rpc(i.principal,'author',v),reviewReceipt:(i,v)=>x.rpc(i.principal,'review',v),publish:async(i,v)=>{const c=await x.rpc(i.principal,'qualification-context',{jobId:v.jobId});if(!c.alreadyPublished){const proof={schemaVersion:'stockinsider-vnext-authority-proof-v1',inputHash:c.inputHash,qualified:false,gaps:['synthetic-no-financial-model-authority'],checkedAt:new Date().toISOString()};await x.rpc(i.principal,'record-qualification',{jobId:v.jobId,inputHash:c.inputHash,proof:{...proof,proofHash:inputHash(proof)}});}return x.rpc(i.principal,'publish',v);},withWriterLease:async work=>work()};
   for(const symbol of ['2409','2383'])await step(symbol+' source→actual worker receipts→current semantic receipt and fixed deep score; immutable replay',async()=>{
    const projected=(await source('source-projection',{symbols:[symbol]}))[symbol],e=projected.evidence.find(e=>e.key==='reported_event');assert.ok(e);const value=input(symbol);value.evidence.push(e);const missing={value:null,source:'',observedAt:''};value.initialScore=initialFactors({cutoff:now,clues:[{symbol,source:'official',root:e.source,authorRoot:'synthetic-single-official',eventAt:now,availableAt:now,contentHash:e.contentHash}],sourceHealthy:false,recent7:null,prior21:null,corporateActionAdjusted:false,priceReturn20:missing,volumeRatio20:missing,institutionalFlowRatio:missing,revenueGrowth:missing,catalystVerified:missing});value.hash=inputHash({...value,hash:undefined});
    const queued=await x.rpc(roles.operator.principal,'enqueue',{symbols:[symbol],requestKey:'catalyst-v3-'+symbol,inputs:{[symbol]:value}}),jobId=queued.jobs.find(j=>j.jobId).jobId;
    assert.equal((await runResearchWorker(jobId,deps)).status,'published');const context=await thesis('context',{}),member=context.members.find(m=>m.symbol===symbol),pub=member.publication,receipt=pub.semanticReceipt;assert.ok(receipt);assert.equal(receipt.symbol,symbol);assert.deepEqual(receipt.criteria.map(c=>c.met),symbol==='2383'?[true,false,true,true]:[true,null,true,true]);assert.notEqual(receipt.authorInvocation,receipt.reviewerInvocation);assert.notEqual(receipt.authorExecution,receipt.reviewerExecution);
    const audit=auditPublishedThesis({symbol,inputHash:member.inputHash,revisionId:pub.revision_id,publishedInputHash:pub.input_hash,artifact:pub.content,review:pub.review,original:pub.originalEvidence.evidence,current:pub.originalEvidence.evidence,semanticReceipt:receipt,newContent:[],quote:{close:null,session:null,source:'',adjusted:false,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null},cutoff:new Date().toISOString(),session:day,market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null});
    assert.equal(audit.deepScore.confirmedPoints,symbol==='2383'?11.25:0);assert.equal(audit.deepScore.availableWeight,symbol==='2383'?15:0);await thesis('record',{reports:[audit]});
    const home=(await query('SELECT public.vnext_read_v1(NULL) AS result')).rows[0].result;const publicMember=home.members.find(m=>m.symbol===symbol);assert.ok(publicMember);assert.equal(publicMember.deepScore.confirmedPoints,audit.deepScore.confirmedPoints);assert.equal(publicMember.deepScore.availableWeight,audit.deepScore.availableWeight);
    const stable=await x.snapshot(),forged=structuredClone(audit);forged.deepInputs.catalystChecklist.checks=forged.deepInputs.catalystChecklist.checks.map(c=>({...c,met:true,provenance:['1']}));forged.deepScore=deepFactors(forged.deepInputs);
    await query('SELECT public.vnext_thesis_command_v1($1,$2,$3::jsonb)',[roles.operator.principal,'record',JSON.stringify({reports:[forged]})],'service_role',{code:'P0001',message:/fixed_deep_score_mismatch/u});assert.deepEqual(await x.snapshot(),stable);
    const calls=providerCalls.length;assert.equal((await runResearchWorker(jobId,deps)).replay,true);assert.equal(providerCalls.length,calls);assert.deepEqual(await x.snapshot(),stable);x.save(symbol+'-semantic',{context,receipt,audit,wholeState:stable,providerScope:'synthetic adapter, no real model/semantic/source acquisition; one official root is not independent confirmation'});
   });
   await step('actual current source withdrawal nulls semantic authority; raw jobs/publications/audits/provider history remain byte exact',async()=>{
    const before=await x.snapshot();await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=false WHERE source='official' AND scope='official_original'");const revoked=await x.snapshot();const context=await thesis('context',{});assert.ok(context.members.every(m=>m.publication.semanticReceipt===null));
    for(const name of ['vnext_jobs_v1','vnext_preparations_v1','vnext_publications_v1','vnext_thesis_audits_v1','vnext_provider_invocations_v1'])assert.deepEqual(revoked[name],before[name]);assert.deepEqual(await x.snapshot(),revoked);x.save('withdrawal',{before,revoked,context,scope:'disposable original policy withdrawal, retained immutable history; no policy reenable'});
   });
  }
  await step('full installer repeat rejects with actual ReadyE then explicit ROLLBACK I preserving complete rows/routines',async()=>{
   const before=await x.snapshot(),functions=await routines(),ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));const [q,r]=await Promise.allSettled([x.writer.query(fs.readFileSync(migration,'utf8')),ready]);assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,/first_install_required/u);assert.equal(r.status,'fulfilled');assert.equal(r.value,'E');const rollback=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));await x.writer.query('ROLLBACK');assert.equal(await rollback,'I');assert.deepEqual(await x.snapshot(),before);assert.deepEqual(await routines(),functions);x.save('repeat',{code:q.reason.code,ready:'E',rollbackReady:'I',rowsAndRoutinesUnchanged:true});
  });
 }finally{x.save('catalyst-query-events',{events,providerCalls,stage,businessLifecycleExecuted:stage==='fresh',realModelExecuted:false,formalSemanticApproval:false});await x.finish();}
});
