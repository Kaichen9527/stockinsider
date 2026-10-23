/** Actual PG + worker/audit orchestration. Documents, facts/provider and preparation
 * are explicitly synthetic; no live source, finance, model or semantic approval. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {roles,binding,input,authorOutput,reviewerOutput,day,now,ids} from './vnext-synthetic-research-vectors.mjs';
import {runResearchWorker} from '../web/src/lib/vnext/worker-core.ts';
import {extractContentBatch} from '../web/src/lib/vnext/permitted-content.ts';
import {auditThesisCycle} from '../web/src/lib/vnext/thesis-cycle.ts';
import {auditPublishedThesis} from '../web/src/lib/vnext/thesis-audit.ts';
import {inputHash} from '../web/src/lib/vnext/policy.ts';
import {initialFactors,deepFactors} from '../web/src/lib/vnext/factors.ts';
await test('actual thesis audit, current-source closure and durable retry budget',{timeout:240000},async t=>{
 const x=await workerFixture();const providerCalls=[],extraEvents=[];let sourceEvidence,rateLimit=false;
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(e){failed=true;throw e;}});if(failed)throw Error('dependent_thesis_stage_failed');};
 const rpc=async(name,action,body,expected)=>{assert.ok(['vnext_analysis_command_v1','vnext_thesis_command_v1'].includes(name));const c=await x.connect();try{await c.query('SET ROLE service_role');const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));const [q,r]=await Promise.allSettled([c.query(`SELECT public.${name}($1,$2,$3::jsonb) AS result`,[roles.operator.principal,action,JSON.stringify(body)]),ready]);assert.equal(r.status,'fulfilled');assert.equal(r.value,'I');extraEvents.push({name,action,pid:c.processID,ready:r.value,status:q.status,...q.status==='rejected'?{code:q.reason.code,message:q.reason.message}:{committed:true}});if(expected){assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,expected);return;}if(q.status==='rejected')throw q.reason;return q.value.rows[0].result;}finally{await x.close(c);}};
 const thesis=(a,b)=>rpc('vnext_thesis_command_v1',a,b),source=(a,b)=>rpc('vnext_analysis_command_v1',a,b);
 const provider={invoke:async(request,id)=>{const doc=JSON.parse(request.input);providerCalls.push({task:doc.task,id,requestHash:hash(JSON.stringify(request))});if(rateLimit){rateLimit=false;return {status:'failed',responseId:null,reason:'provider_http_429',raw:{synthetic:true,httpStatus:429}};}return {status:'completed',responseId:'resp_audit_'+id.replaceAll('-',''),raw:{synthetic:true},output:doc.task==='author'?authorOutput():reviewerOutput(doc)};},lookup:async()=>{throw Error('no_uncertain_regeneration');}};
 const deps={author:binding('author'),reviewer:binding('reviewer'),provider,journal:(i,a,b)=>x.rpc(i.principal,a,b,true),command:(i,a,b)=>x.rpc(i.principal,a,b),
  prepare:async(i,b)=>{const r=await x.rpc(i.principal,'claim',b);if(r.execute!==true)return r;const frozen={...r.evidence,admissionHash:r.inputHash,syntheticPreparation:true};const h=inputHash(frozen);await x.rpc(i.principal,'prepare',{jobId:b.jobId,executionId:r.executionId,inputHash:h,evidence:frozen});return {...r,inputHash:h,evidence:frozen};},
  authorReceipt:(i,b)=>x.rpc(i.principal,'author',b),reviewReceipt:(i,b)=>x.rpc(i.principal,'review',b),
  publish:async(i,b)=>{const c=await x.rpc(i.principal,'qualification-context',{jobId:b.jobId});if(!c.alreadyPublished){const proof={schemaVersion:'stockinsider-vnext-authority-proof-v1',inputHash:c.inputHash,qualified:false,gaps:['synthetic-no-real-financial-adjusted-price-authority'],checkedAt:new Date().toISOString()};await x.rpc(i.principal,'record-qualification',{jobId:b.jobId,inputHash:c.inputHash,proof:{...proof,proofHash:inputHash(proof)}});}return x.rpc(i.principal,'publish',b);},withWriterLease:async work=>work()};
 const enqueue=async(symbol,key)=>{const i=input(symbol);i.evidence.push(sourceEvidence);const missing={value:null,source:'',observedAt:''};i.initialScore=initialFactors({cutoff:now,clues:[{symbol,source:'official',root:sourceEvidence.source,authorRoot:'synthetic:official',eventAt:now,availableAt:now,contentHash:sourceEvidence.contentHash}],sourceHealthy:false,recent7:null,prior21:null,corporateActionAdjusted:false,priceReturn20:missing,volumeRatio20:missing,institutionalFlowRatio:missing,revenueGrowth:missing,catalystVerified:missing});i.hash=inputHash({...i,hash:undefined});const r=await x.rpc(roles.operator.principal,'enqueue',{symbols:[symbol],requestKey:key,inputs:{[symbol]:i}});return r.jobs.find(j=>j.jobId).jobId;};
 const publicRead=async symbol=>{const c=await x.connect();try{await c.query('SET ROLE service_role');return(await c.query('SELECT public.vnext_read_v1($1) AS result',[symbol])).rows[0].result;}finally{await x.close(c);}};
 try{
  await step('original prefixes plus two additive candidates commit and real screen-context ambiguity is closed',async()=>{
   await x.install();for(const file of ['migrations/20261022_vnext_analysis_sources_v1.sql','migrations/20261022_vnext_thesis_audit_v1.sql']){const b=fs.readFileSync(file);await x.writer.query(b.toString());x.save(file.split('/').pop(),{sha256:hash(b),bytes:b.length});}
   await x.writer.query("INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,'operator',true),($2,'author',true),($3,'reviewer',true)",[roles.operator.principal,roles.author.principal,roles.reviewer.principal]);await x.writer.query("INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval'1 hour',true)",[day]);
   for(const role of ['author','reviewer']){const b=binding(role);await x.writer.query('INSERT INTO public.vnext_provider_bindings_v1(principal,task,provider,model,model_version,credential_identity,prompt_version,instructions,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[b.identity.principal,role,b.provider,b.model,b.modelVersion,b.credentialIdentity,b.promptVersion,b.instructions]);}
   await x.writer.query("INSERT INTO public.vnext_source_policies_v1(source,scope,license_basis,rights_subject,valid_until,enabled) VALUES('official','official_original','synthetic-fixture','synthetic-lab',clock_timestamp()+interval'1 hour',true)");
   const content={id:'synthetic-audit-source',source:'official',scope:'official_original',url:'https://mops.twse.com.tw/synthetic-audit-original',eventAt:now,publishedAt:now,eventBasis:'original_event',availableAt:now,symbols:['2409','2383','2412'],originalRoot:'https://mops.twse.com.tw/synthetic-audit-original',authorRoot:'synthetic:official',body:'Synthetic original source fixture, not acquired official content.'};await extractContentBatch([content],now,source);sourceEvidence=(await source('source-projection',{symbols:['2409']}))['2409'].evidence[0];assert.equal(sourceEvidence.kind,'assumption');
   const context=await x.rpc(roles.operator.principal,'screen-context',{});assert.deepEqual(context.clues,[]);assert.equal(context.session,day);x.save('screen-context',{session:context.session,clues:context.clues,realSql42702Closed:true});
  });
  for(const symbol of ['2409','2383'])await step(symbol+' actual configured worker consumes current extraction and retains an unqualified revision',async()=>{const jobId=await enqueue(symbol,'audit-prefix-'+symbol);const result=await runResearchWorker(jobId,deps);assert.equal(result.status,'published');const pub=await publicRead(symbol);assert.equal(pub.history.length,1);assert.equal(pub.history[0].sourceRights.current,true);x.save(symbol+'-publication',pub);});
  await step('actual all-active audit persists separate deep evidence; corrected new fact IDs cause substantive drift',async()=>{
   const context=await thesis('context',{});assert.equal(context.members.length,2);const cutoff=new Date().toISOString();
   const inputs=context.members.map(m=>{const p=m.publication;const original=p.originalEvidence.evidence;const current=original.map(e=>e.id===ids.cfo?{...e,id:'00000000-0000-4000-8000-000000000099',value:200,contentHash:hash('synthetic-corrected-cfo200')}:e);return {symbol:m.symbol,inputHash:m.inputHash,revisionId:p.revision_id,publishedInputHash:p.input_hash,artifact:p.content,review:p.review,original,current,newContent:[],quote:{close:20,session:day,source:'https://www.twse.com.tw/synthetic-audit-price',adjusted:true,volume:1000,ma20:18,ma60:17,volumeRatio:1.1,institutionalFlow:1},cutoff,market:{risk:'selective',snapshotHash:'b'.repeat(64)},previousMarketHash:'b'.repeat(64),tradingValid:true};});
   // Intentionally reproduce an old, structurally accepted but unsupported
   // scalar-semantic score BEFORE installing the correction. This fixture's
   // private current session is explicitly synthetic/completed; it is not a
   // real premarket close or two-session calendar acceptance.
   const correctReports=inputs.map(auditPublishedThesis),oldWrongReports=structuredClone(correctReports);
   oldWrongReports[0].deepInputs.catalystChecklist.checks=oldWrongReports[0].deepInputs.catalystChecklist.checks.map(check=>({...check,met:true,provenance:['synthetic-unrelated-numeric-one']}));
   oldWrongReports[0].deepScore=deepFactors(oldWrongReports[0].deepInputs);
   await thesis('record',{reports:oldWrongReports});
   const oldPublic=await publicRead(null),wrongSymbol=oldWrongReports[0].symbol;
   assert.equal(oldPublic.members.find(m=>m.symbol===wrongSymbol).deepScore.confirmedPoints,oldWrongReports[0].deepScore.confirmedPoints);
   assert.ok(oldWrongReports[0].deepScore.confirmedPoints>correctReports[0].deepScore.confirmedPoints);
   const oldRaw=await x.snapshot();const semanticFile='migrations/20261022_vnext_semantic_score_fence_v1.sql',semanticBytes=fs.readFileSync(semanticFile);
   const candidateReady=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));
   await x.writer.query(semanticBytes.toString());assert.equal(await candidateReady,'I');
   assert.deepEqual(await x.snapshot(),oldRaw);
   const recalculated=await publicRead(null);
   assert.equal(recalculated.members.find(m=>m.symbol===wrongSymbol).deepScore.confirmedPoints,correctReports[0].deepScore.confirmedPoints);
   assert.ok(recalculated.members.every(m=>m.sourceRights.current));
   const sorted=[...recalculated.members].sort((a,b)=>(b.deepScore.confirmedPoints-a.deepScore.confirmedPoints)||(b.deepScore.availableWeight-a.deepScore.availableWeight)||(b.initialScore.confirmedPoints-a.initialScore.confirmedPoints)||String(b.eventAt).localeCompare(String(a.eventAt))||a.symbol.localeCompare(b.symbol));
   assert.deepEqual(recalculated.members.map(m=>m.symbol),sorted.map(m=>m.symbol));
   assert.deepEqual(await x.snapshot(),oldRaw);
   x.save('semantic-current-public-recalculation',{migration:{path:semanticFile,bytes:semanticBytes.length,sha256:hash(semanticBytes)},oldPublic,recalculated,oldRaw,originalRowsUnchanged:true,oldWrongReportPreserved:true,scope:'fresh captured fixture actual service-role report/public READ and full correction COMMIT; private synthetic completed session, not official clock/time acceptance'});
   const result=await auditThesisCycle(inputs,{record:reports=>thesis('record',{reports})});assert.equal(result.reviewed,2);assert.ok(result.reports.every(r=>r.materialChanged && r.claimChecks.some(c=>c.status==='drift'&&c.changed.some(d=>d.currentId.endsWith('0099')))));assert.ok(result.reports.every(r=>r.deepScore.availableWeight>0 && r.deepScore.availableWeight<100));
   const home=await publicRead(null);assert.equal(home.members.length,2);assert.ok(home.members.every(m=>m.initialScore && m.deepScore && m.sourceRights.current));x.save('thesis-audit',{inputs,result,home});
   const before=await x.snapshot();assert.deepEqual(before.vnext_thesis_audits_v1,oldRaw.vnext_thesis_audits_v1);const wrong=structuredClone(result.reports);wrong[0].deepScore.confirmedPoints+=1;await rpc('vnext_thesis_command_v1','record',{reports:wrong},/vnext_thesis_fixed_deep_score_mismatch/u);assert.deepEqual(await x.snapshot(),before);
   // Direct service-role SQL must not accept arbitrary numeric/Boolean catalyst
   // assertions even if the generic pure arithmetic can sum those15points.
   const scalarSemantic=structuredClone(result.reports);
   scalarSemantic[0].deepInputs.catalystChecklist.checks=scalarSemantic[0].deepInputs.catalystChecklist.checks.map(check=>({...check,met:true,provenance:['synthetic-unrelated-numeric-one']}));
   scalarSemantic[0].deepScore=deepFactors(scalarSemantic[0].deepInputs);
   assert.ok(scalarSemantic[0].deepScore.confirmedPoints>result.reports[0].deepScore.confirmedPoints);
   await rpc('vnext_thesis_command_v1','record',{reports:scalarSemantic},/vnext_thesis_fixed_deep_score_mismatch/u);
   assert.deepEqual(await x.snapshot(),before);
   x.save('semantic-record-rejection',{actualServiceRole:true,unsupportedScalarSemanticRejected:true,wholeStateUnchanged:true,source:'new semantic fence installed through fresh prerequisite path; synthetic numeric assertions, not semantic review'});
  });
  await step('read-rights withdrawal blocks current replay and worker dispatch while immutable history remains exact',async()=>{
   const before=await x.snapshot();const calls=providerCalls.length;await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=false WHERE source='official'");const revoked=await x.snapshot();
   for(const symbol of ['2409','2383']){const detail=await publicRead(symbol);assert.equal(detail.history[0].sourceRights.current,false);x.save(symbol+'-revoked',detail);const p=(await x.observer.query('SELECT * FROM public.vnext_publications_v1 WHERE symbol=$1',[symbol])).rows[0];const job=(await x.observer.query('SELECT * FROM public.vnext_jobs_v1 WHERE job_id=$1',[p.job_id])).rows[0];await x.rpc(roles.reviewer.principal,'publish',{jobId:job.job_id,inputHash:job.input_hash,executionId:job.reviewer_execution},false,/vnext_research_original_rights_no_longer_current/u);const outcome=await runResearchWorker(job.job_id,deps);assert.equal(outcome.status,'published_historical');}
   x.save('revoked-home',await publicRead(null));assert.equal(providerCalls.length,calls);assert.deepEqual(await x.snapshot(),revoked);for(const table of ['vnext_publications_v1','vnext_jobs_v1','vnext_preparations_v1','vnext_qualifications_v1','vnext_provider_invocations_v1','vnext_thesis_audits_v1'])assert.deepEqual(revoked[table],before[table]);x.save('revocation',{before,revoked,scope:'real disposable policy COMMIT, actual current reads/replay denial; stored history untouched'});await x.writer.query("UPDATE public.vnext_source_policies_v1 SET enabled=true WHERE source='official'");
  });
  await step('only a known settled429 exposes one charged retry; total started attempts remains4',async()=>{
   const jobId=await enqueue('2412','audit-transient');rateLimit=true;assert.equal((await runResearchWorker(jobId,deps)).status,'failed');const context=await thesis('dispatch-context',{});assert.equal(context.transientFailures.length,1);assert.equal(context.transientFailures[0].job_id,jobId);
   const receipt=await x.rpc(roles.operator.principal,'retry',{jobId});assert.ok(receipt.jobId);assert.equal((await runResearchWorker(receipt.jobId,deps)).status,'published');assert.deepEqual((await thesis('dispatch-context',{})).transientFailures,[]);const stable=await x.snapshot();const replay=await x.rpc(roles.operator.principal,'retry',{jobId});assert.equal(replay.replay,true);assert.equal(replay.jobId,receipt.jobId);assert.deepEqual(await x.snapshot(),stable);await x.rpc(roles.operator.principal,'retry',{jobId:receipt.jobId},false,/vnext_retry_forbidden/u);assert.equal(Number((await x.observer.query('SELECT count(*) FROM public.vnext_jobs_v1 WHERE started_at IS NOT NULL')).rows[0].count),4);x.save('retry-state',await x.snapshot());
  });
 }finally{x.save('audit-trace',{providerCalls,extraEvents,syntheticPreparationAndProvider:true,realWriterLease:false,formalSemanticApproval:false});await x.finish();}
});
