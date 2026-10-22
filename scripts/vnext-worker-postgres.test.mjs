/** New actual PG worker path; injected provider is explicitly synthetic, not a live model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { workerFixture, hash } from './vnext-worker-fixture.mjs';
import { runResearchWorker } from '../web/src/lib/vnext/worker-core.ts';
import { AUTHOR_INSTRUCTIONS, REVIEWER_INSTRUCTIONS, WORKER_PROMPT_VERSION } from '../web/src/lib/vnext/worker-prompts.ts';
import { inputHash } from '../web/src/lib/vnext/policy.ts';
import { REQUIRED_SECTIONS } from '../web/src/lib/vnext/research.ts';
const now=new Date().toISOString(), day=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const roles={operator:{principal:'synthetic-worker-operator',role:'operator'},author:{principal:'synthetic-worker-author',role:'author'},reviewer:{principal:'synthetic-worker-reviewer',role:'reviewer'}};
const binding=role=>({identity:roles[role],provider:'openai-responses',model:'synthetic-provider-no-model-executed',modelVersion:'synthetic-fixture-v1',credentialIdentity:hash('synthetic-no-secret'),instructions:role==='author'?AUTHOR_INSTRUCTIONS:REVIEWER_INSTRUCTIONS,promptVersion:WORKER_PROMPT_VERSION});
const ids={cfo:'00000000-0000-4000-8000-000000000001',profit:'00000000-0000-4000-8000-000000000002',eps:'00000000-0000-4000-8000-000000000003'};
function input(symbol){const evidence=[{id:ids.cfo,key:'operating_cashflow',kind:'fact',sourceTier:'official',contentHash:hash('synthetic original cfo100'),value:100,unit:'TWD_thousands',period:'2026',source:'https://mops.twse.com.tw/synthetic-engineering-only/cfo',eventAt:now,availableAt:now},{id:ids.profit,key:'net_profit',kind:'fact',sourceTier:'official',contentHash:hash('synthetic original profit200'),value:200,unit:'TWD_thousands',period:'2026',source:'https://mops.twse.com.tw/synthetic-engineering-only/profit',eventAt:now,availableAt:now},{id:ids.eps,key:'annual_eps',kind:'fact',sourceTier:'official',contentHash:hash('synthetic original eps10'),value:10,unit:'TWD/share',period:'2026',source:'https://mops.twse.com.tw/synthetic-engineering-only/eps',eventAt:now,availableAt:now}];const frozen={symbol,eligible:true,tradingValid:true,contraindication:false,roots:['synthetic-single-publisher'],eventAt:now,cutoff:now,evidence,gaps:['synthetic engineering rows with allowlisted-origin metadata; never fetched, not real official facts']};return {...frozen,hash:inputHash(frozen)};}
function authorOutput(){return {sections:Object.fromEntries(REQUIRED_SECTIONS.map(key=>[key,{text:`Synthetic ${key}: original test CFO100 divided by group profit200 gives0.5; no real model or semantic investment approval.`,evidenceIds:[ids.cfo,ids.profit],claimIds:['cash-conversion']}])),claims:[{id:'cash-conversion',text:'Synthetic CFO100/profit200=0.5 cash conversion; not future FCF or investment forecast.',kind:'derived',evidenceIds:[ids.cfo,ids.profit],numeric:{value:0.5,unit:'ratio',period:'2026',key:'cash_conversion',formula:{operation:'divide',evidenceIds:[ids.cfo,ids.profit]}}},{id:'annual-eps',text:'Synthetic annual EPS10 is exactly the original annual_eps evidence in2026, not a forecast or quarterly substitute.',kind:'fact',evidenceIds:[ids.eps],numeric:{value:10,unit:'TWD/share',period:'2026',key:'annual_eps'}}],quoteDate:day,valuationDate:day,annualEps:10,nextFourQuarterEps:null,gaps:['next_four_quarter_eps_missing','quote_authority_missing','valuation_assumptions_unavailable','synthetic engineering fixture']};}
function reviewerOutput(document){assert.equal(document.authorArtifact.claims[0].numeric.value,0.5);assert.equal(document.evidence.evidence[0].value,100);return {approved:true,findings:[],factsChecked:true,valuationChecked:true,claimsChecked:true,claimChecks:document.authorArtifact.claims.map(claim=>({claimId:claim.id,verdict:'supported',reason:claim.id==='annual-eps'?'Synthetic annual EPS exactly matches annual_eps10/TWDper-share/2026; no actual financial or model approval.':'Synthetic originals: CFO100 and profit200 both TWD_thousands in2026 recompute0.5 ratio. No real semantic/financial approval.',sources:document.evidence.evidence.filter(e=>claim.evidenceIds.includes(e.id)).map(e=>({id:e.id,contentHash:e.contentHash}))}))};}
await test('actual durable worker journal and injected provider lifecycle',{timeout:240000},async t=>{
 const x=await workerFixture();const calls=[],lookups=[],leaseEvents=[];let uncertainOnce=false, failOnce=false, receiptLoss=false, fourthJob;
 const step=async(name,body)=>{let failed=false;await t.test(name,async()=>{try{await body();}catch(error){failed=true;throw error;}});if(failed)throw Error('dependent_worker_stage_failed');};
 const provider={
  async invoke(request,invocationId,deadline){const document=JSON.parse(request.input);assert.ok(Date.parse(deadline)>Date.now());assert.equal(request.store,true);calls.push({task:document.task,invocationId,executionId:document.executionId,inputHash:document.inputHash,requestHash:hash(JSON.stringify(request))});
   if(uncertainOnce){uncertainOnce=false;throw Error('synthetic actual-outcome-unknown; not a socket loss proof');}
   if(failOnce){failOnce=false;return {status:'failed',responseId:null,reason:'synthetic definite rejection',raw:{synthetic:true,httpStatus:422}};}
   const output=document.task==='author'?authorOutput():reviewerOutput(document);return {status:'completed',responseId:'resp_synthetic_'+invocationId.replaceAll('-',''),output,raw:{id:'resp_synthetic_'+invocationId.replaceAll('-',''),status:'completed',synthetic:true,output}};
  },
  async lookup(id){lookups.push(id);throw Error('no lookup ID after synthetic unknown dispatch; never regenerate');}
 };
 const deps={author:binding('author'),reviewer:binding('reviewer'),provider,
  journal:(identity,action,body)=>x.rpc(identity.principal,action,body,true),command:(identity,action,body)=>x.rpc(identity.principal,action,body),
  async prepare(identity,body){const receipt=await x.rpc(identity.principal,'claim',body);if(receipt.execute!==true)return receipt;const frozen={...receipt.evidence,admissionHash:receipt.inputHash,syntheticPreparation:true};const preparedHash=inputHash(frozen);await x.rpc(identity.principal,'prepare',{jobId:body.jobId,executionId:receipt.executionId,inputHash:preparedHash,evidence:frozen});return {...receipt,inputHash:preparedHash,evidence:frozen};},
  async authorReceipt(identity,body){const result=await x.rpc(identity.principal,'author',body);if(receiptLoss){receiptLoss=false;throw Error('synthetic post-DB-receipt uncertainty, not genuine transport loss');}return result;},
  reviewReceipt:(identity,body)=>x.rpc(identity.principal,'review',body),
  async publish(identity,body){const context=await x.rpc(identity.principal,'qualification-context',{jobId:body.jobId});if(!context.alreadyPublished){const proof={schemaVersion:'stockinsider-vnext-authority-proof-v1',inputHash:context.inputHash,qualified:false,gaps:['synthetic-no-real-financial-or-adjusted-price-authority'],checkedAt:new Date().toISOString()};await x.rpc(identity.principal,'record-qualification',{jobId:body.jobId,inputHash:context.inputHash,proof:{...proof,proofHash:inputHash(proof)}});}return x.rpc(identity.principal,'publish',body);},
  async withWriterLease(work){leaseEvents.push('synthetic-test-lease-acquired');try{return await work();}finally{leaseEvents.push('synthetic-test-lease-released');}}
 };
 const enqueue=async(symbol,key)=>{const i=input(symbol);const r=await x.rpc(roles.operator.principal,'enqueue',{symbols:[symbol],requestKey:key,inputs:{[symbol]:i}});return r.jobs.find(j=>j.jobId).jobId;};
 try{
  await step('exact genuine prefixes and additive worker migration commit, private tables/finite service RPC',async()=>{
   await x.install();await x.writer.query('INSERT INTO public.vnext_principals_v1(principal,role,enabled) VALUES($1,\'operator\',true),($2,\'author\',true),($3,\'reviewer\',true)',[roles.operator.principal,roles.author.principal,roles.reviewer.principal]);
   await x.writer.query('INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1,clock_timestamp()-interval\'1 hour\',true)',[day]);
   for(const role of ['author','reviewer']){const b=binding(role);await x.writer.query('INSERT INTO public.vnext_provider_bindings_v1(principal,task,provider,model,model_version,credential_identity,prompt_version,instructions,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,$8,true)',[b.identity.principal,role,b.provider,b.model,b.modelVersion,b.credentialIdentity,b.promptVersion,b.instructions]);}
   const acl=(await x.observer.query("SELECT has_table_privilege('service_role','public.vnext_provider_invocations_v1','INSERT') AS direct_insert,has_table_privilege('service_role','public.vnext_provider_bindings_v1','UPDATE') AS change_binding,has_function_privilege('anon','public.vnext_provider_command_v1(text,text,jsonb)','EXECUTE') AS anon_execute")).rows[0];assert.deepEqual(acl,{direct_insert:false,change_binding:false,anon_execute:false});x.save('private-acls',acl);
  });
  for(const symbol of ['2409','2383'])await step(symbol+' actual pipeline stores two frozen invocations, distinct executions and an unqualified public revision',async()=>{
   const jobId=await enqueue(symbol,'synthetic-worker-'+symbol),start=calls.length;
   const result=await runResearchWorker(jobId,deps);assert.equal(result.status,'published');
   const rows=(await x.observer.query('SELECT * FROM public.vnext_provider_invocations_v1 WHERE job_id=$1 ORDER BY task',[jobId])).rows;assert.equal(rows.length,2);assert.ok(rows.every(r=>r.state==='completed'));assert.notEqual(rows[0].execution_id,rows[1].execution_id);assert.notEqual(rows[0].principal,rows[1].principal);assert.equal(calls.length-start,2);
   const after=await x.snapshot();const replay=await runResearchWorker(jobId,deps);assert.equal(replay.replay,true);assert.equal(calls.length-start,2);assert.deepEqual(await x.snapshot(),after);
   await x.writer.query('SET ROLE service_role');const detail=await x.writer.query('SELECT public.vnext_read_v1($1) AS result',[symbol]);
   await x.writer.query('RESET ROLE');assert.equal(detail.rows[0].result.history.length,1);x.save(symbol+'-worker-publication',{result,invocations:rows,public:detail.rows[0].result,scope:'synthetic provider/originals and explicit unqualified authority; no live model/financial/semantic publication approval'});
  });
  await step('uncertain provider outcome is durable, repeated delivery does not invoke, no available ID never regenerates',async()=>{
   const jobId=await enqueue('2412','synthetic-worker-uncertain');uncertainOnce=true;const before=calls.length;
   const result=await runResearchWorker(jobId,deps);assert.equal(result.status,'uncertain');assert.equal(result.stage,'provider_transport');
   assert.equal(calls.length,before+1);const inv=(await x.observer.query('SELECT * FROM public.vnext_provider_invocations_v1 WHERE job_id=$1',[jobId])).rows;assert.equal(inv.length,1);assert.equal(inv[0].state,'uncertain');
   const again=await runResearchWorker(jobId,deps);assert.equal(again.status,'uncertain');assert.equal(calls.length,before+1);
   const recovered=await runResearchWorker(jobId,deps,true);assert.equal(recovered.stage,'provider_lookup_identity_unavailable');assert.equal(calls.length,before+1);assert.equal(lookups.length,0);
   const beforeReuse=await x.snapshot();const reused=(await x.observer.query("SELECT provider_response_id FROM public.vnext_provider_invocations_v1 WHERE state='completed' ORDER BY started_at LIMIT 1")).rows[0].provider_response_id;
   await x.rpc(roles.author.principal,'settle',{jobId,executionId:inv[0].execution_id,invocationId:inv[0].invocation_id,status:'completed',responseId:reused,output:authorOutput(),raw:{syntheticDuplicateProviderResponse:true}},true,{code:'23505',message:/vnext_provider_response_identity_v1/u});
   assert.deepEqual(await x.snapshot(),beforeReuse);
   await assert.rejects(x.writer.query('SELECT public.vnext_set_mode_v1(false)'),e=>e.code==='P0001'&&e.message==='vnext_mode_execution_in_progress');
   await assert.rejects(x.writer.query('UPDATE public.vnext_mode_v1 SET enabled=false'),e=>e.code==='P0001'&&e.message==='vnext_provider_outcome_unsettled');
   await x.rpc(roles.operator.principal,'retry',{jobId},false,/vnext_retry_forbidden/u);x.save('uncertain-state',await x.snapshot());
  });
  await step('synthetic prior-session unresolved records block a real claim before expensive preparation, exact rollback',async()=>{
   fourthJob=await enqueue('2454','synthetic-worker-definite-rejection');const before=await x.snapshot();
   await x.writer.query('BEGIN');
   try{
    await x.writer.query("INSERT INTO public.vnext_sessions_v1(session_date,close_at,completed) VALUES($1::date-1,clock_timestamp()-interval'1 day',true) ON CONFLICT DO NOTHING",[day]);
    for(let i=1;i<=3;i++){
     const symbol=String(6500+i),data=input(symbol);
     await x.writer.query("INSERT INTO public.vnext_members_v1(symbol,state,input_hash,evidence,admitted_session) VALUES($1,'waiting',$2,$3::jsonb,$4::date-1)",[symbol,data.hash,JSON.stringify(data),day]);
     const old=(await x.writer.query("INSERT INTO public.vnext_jobs_v1(request_key,symbol,input_hash,admission_hash,state,session_date,execution_id,author_principal,started_at,deadline_at) VALUES($1,$2,$3,$3,'failed',$4::date-1,gen_random_uuid(),$5,clock_timestamp()-interval'1 day',clock_timestamp()-interval'23 hours') RETURNING job_id,execution_id",['synthetic-prior-unresolved-'+i,symbol,data.hash,day,roles.author.principal])).rows[0];
     const b=binding('author');await x.writer.query("INSERT INTO public.vnext_provider_invocations_v1(job_id,task,execution_id,principal,input_hash,provider,model,model_version,credential_identity,prompt_version,frozen_request,request_hash,state,deadline_at) VALUES($1,'author',$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,'uncertain',clock_timestamp()-interval'23 hours')",[old.job_id,old.execution_id,roles.author.principal,data.hash,b.provider,b.model,b.modelVersion,b.credentialIdentity,b.promptVersion,JSON.stringify({syntheticPriorSessionInjection:true}),hash('synthetic-prior-'+i)]);
    }
    await x.writer.query('SET LOCAL ROLE service_role');const ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));
    const [query,settled]=await Promise.allSettled([x.writer.query('SELECT public.vnext_command_v1($1,$2,$3::jsonb)',[roles.author.principal,'claim',JSON.stringify({jobId:fourthJob})]),ready]);
    assert.equal(query.status,'rejected');assert.equal(query.reason.code,'P0001');assert.equal(query.reason.message,'vnext_global_research_slots_full');assert.equal(settled.status,'fulfilled');assert.equal(settled.value,'E');
    x.save('global-slot-refusal',{scope:'three synthetic prior-session unresolved rows plus one real current uncertain fixture; not actual cross-day provider executions',code:query.reason.code,message:query.reason.message,actualReadyForQuery:settled.value,expensivePreparationReached:false});
   }finally{await x.writer.query('ROLLBACK');}
   assert.deepEqual(await x.snapshot(),before);
  });
  await step('definite provider rejection consumes fourth attempt, does not invent an output or second dispatch',async()=>{
   const jobId=fourthJob;failOnce=true;const before=calls.length;
   const result=await runResearchWorker(jobId,deps);assert.equal(result.status,'failed');assert.equal(calls.length,before+1);
   const row=(await x.observer.query('SELECT state,author_result,started_at FROM public.vnext_jobs_v1 WHERE job_id=$1',[jobId])).rows[0];assert.equal(row.state,'failed');assert.equal(row.author_result,null);assert.ok(row.started_at);
   const again=await runResearchWorker(jobId,deps);assert.equal(again.status,'failed');assert.equal(calls.length,before+1);
   assert.equal(Number((await x.observer.query('SELECT count(*) FROM public.vnext_jobs_v1 WHERE started_at IS NOT NULL')).rows[0].count),4);x.save('definite-failure-state',await x.snapshot());
  });
 }finally{x.save('provider-calls',{calls,lookups,leaseEvents,formalModelExecution:false,syntheticProvider:true,syntheticWriterLeaseAdapter:true});await x.finish();}
});
