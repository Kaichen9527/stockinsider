import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {verifyLocalInboxDataPlane} from '../scripts/research-local-inbox-dataplane.mjs';
import {prepareObservedRosterAdmission} from '../web/src/lib/research-observed-roster.ts';
const root=process.cwd();
const read=f=>JSON.parse(fs.readFileSync(root+'/docs/research/2026-10-08-discovery-live/'+f,'utf8'));
const roster={legacyClassification:read('observed-security-classification.json'),securityScope:read('official-security-scope-reconciliation.json')};
// Synthetic inbox and model owner are development fixtures. Only the fixed
// calculator's Git relay inputs are actual attributed public financial data.
const mapping=JSON.parse(fs.readFileSync(root+'/web/src/lib/research-complete-mapping.json'));
for(const symbol of ['2409','2383'])test(`compiled private author assignment ${symbol}, synthetic job, actual fixed financial inputs`,{timeout:120000},async t=>{
 const realFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const action=typeof options?.body==='string'&&options.body.length?JSON.parse(options.body).action:undefined;return realFetch(url,action==='sealResearchInput'||action==='readResearchInputRevision'?{...options,headers:{...options.headers,'x-research-input-version':'2'}}:action==='assignAuthor'||action==='readAuthorAssignment'?{...options,headers:{...options.headers,'x-research-execution-version':'2'}}:options);};
 try {const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedPriority:true,observedClaim:true,researchControllers:true,testPgClockLibrary:process.env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY,check:(name,fn)=>t.test(name,fn),afterBaseline:async({post,sql,priorityRequest,report,restart,pgClock})=>{
  const prepared=prepareObservedRosterAdmission(roster),scope={scope:'research_observed_v1',snapshotHash:prepared.snapshotHash};
  let r=await post('api/internal/research-observed-roster',roster);assert.equal(r.status,200);
  const now=new Date(Date.now()-1000).toISOString();
  const item={sourcePlatform:'threads',sourceUrl:`https://example.invalid/synthetic-financial-http/${symbol}`,author:'synthetic fixture, not a publisher observation',publishedAt:now,observedAt:now,firstObservedAt:now,symbols:[symbol],shortSummary:'Synthetic company mention for isolated controller and financial calculator acceptance. Not a real source or an investment thesis.',catalyst:'No actual catalyst; developer fixture only.',risk:'No orders, qualification, or independent model execution.',claimStatus:'reported',visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'};
  r=await post('api/internal/research-inbox',{items:[item]});assert.equal(r.status,200);const inbox=await r.json();assert.equal(inbox.accepted,1);const documentId=inbox.revisions[0].id;
  r=await post('api/internal/research-priority-run',{...priorityRequest,...scope,asOf:new Date().toISOString(),assessments:[{symbol,profitImpact:{level:0,reason:'合成隔離驗收，無真實獲利影響'},novelty:{level:0,reason:'合成隔離驗收，不是新催化'},researchability:{level:1,reason:'測試既有固定財務計算入口，不代表研究資格'},lane:'general',disposition:'queued',inProgress:false}]});const ranking=await r.json();assert.equal(r.status,200,JSON.stringify(ranking));assert.equal(ranking.newDeepResearchJobs,1);assert.equal(ranking.accountedCount,1978);
  const owner='synthetic-financial-http-owner';r=await post('api/internal/research-deep-job',{action:'claim',owner,...scope});const claimed=await r.json();assert.equal(r.status,200,JSON.stringify(claimed));assert.ok(claimed.context,'actual open-window reservation required');const context=claimed.context;
  const request={owner,...scope,jobId:context.job.jobId,attempt:context.job.attempt,reservationId:context.modelReservation.reservationId,bundleId:null,sourceDocumentIds:[documentId]};
  for(const name of ['20261009_research_publication_source_fence_v2.sql','20261009_research_input_preparations_v2.sql','20261009_research_input_preparation_assert_v2.sql','20261009_research_complete_input_v2.sql','20261009_research_author_assignments_v2.sql'])sql(fs.readFileSync(root+'/migrations/'+name,'utf8'));
  sql("NOTIFY pgrst,'reload schema';");
  let saved;
  await t.test('compiled guarded preparation binds actual job, lease and source seal',async()=>{
   for(let n=0;n<20;n++){r=await post('api/internal/research-deep-job',{action:'prepareResearchInput',...request});if(r.status===200)break;await new Promise(resolve=>setTimeout(resolve,100));}const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));saved=d.preparation;assert.equal(saved.payload.stockId,null);assert.equal(d.dispatchReady,false);
  });

  const input={owner,jobId:request.jobId,attempt:request.attempt,reservationId:request.reservationId,...scope,preparationId:saved.preparation_id,preparationHash:saved.input_hash,expectedArtifactManifestHash:mapping.companies[symbol].inventoryHash,expectedCalculatorExecutionHash:mapping.sourceClosureHash};
  await t.test('compiled read-only financial diagnostic before immutable admission',async()=>{
   const response=await post('api/internal/research-deep-job',{action:'financialSupplement',...request,preparationId:saved.preparation_id,preparationInputHash:saved.input_hash});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/financial-supplement-diagnostic.json',JSON.stringify(body),{flag:'wx',mode:0o600});
   if(symbol==='2409')t.diagnostic(JSON.stringify({field:'base Q4 display revenue, manual research assumption projection',actual:body.supplement.projection.projected.scenarios[1].quarters[1].segments[0].revenue,expectedFrozen:31090.078766235238}));
  });
  let sealed;
  await t.test('actual compiled marker path seals fixed calculation with all false capabilities',async()=>{
   r=await post('api/internal/research-deep-job',{action:'sealResearchInput',...input});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));sealed=d.revision;assert.equal(sealed.status,'sealed');assert.equal(sealed.replay,false);assert.ok(Object.values(sealed.canonical_payload.capabilities).every(x=>x===false));assert.equal(sealed.canonical_payload.financial.material.projection.monthlyBridge.value,symbol==='2409'?66876:60884.517);assert.equal(sql('SELECT count(*) FROM stocks;SELECT count(*) FROM stock_instruments_v3;'),'0\n0');
   report.completeInputHttp={symbol,revisionId:sealed.revision_id,inputHash:sealed.input_hash,charge:sealed.logical_bytes,syntheticJobAndOwner:true,actualTrustedRoleExecution:false,financialVerified:false,dispatchReady:false};
  });
  const assignmentRequest={action:'assignAuthor',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash};let assignment;
  const counts=()=>sql('SELECT count(*) FROM research_author_assignments_v2;SELECT count(*),sum(reserved_seconds) FROM research_model_reservations_v1;SELECT count(*) FROM research_model_completions_v1;SELECT count(*) FROM stocks;SELECT count(*) FROM stock_instruments_v3;');
  await t.test('actual role authentication and closed body reject before assignment',async()=>{
   for(const role of [false,'reviewer','tester','cron'])assert.equal((await post('api/internal/research-model-reservation',assignmentRequest,role)).status,401);
   for(const patch of [{authorId:'not-authority'},{principal:'a'.repeat(64)},{clock:new Date().toISOString()}])assert.equal((await post('api/internal/research-model-reservation',{...assignmentRequest,...patch})).status,400);
   assert.equal((await post('api/internal/research-model-reservation',{...assignmentRequest,inputHash:'f'.repeat(64)})).status,409);
   assert.equal(sql('SELECT count(*) FROM research_author_assignments_v2;'),'0');
  });
  await t.test('read before admission is null; two HTTP first admissions converge without recharging',async()=>{
   const initial=counts();r=await post('api/internal/research-model-reservation',{...assignmentRequest,action:'readAuthorAssignment'});let body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assert.equal(body.assignment,null);
   const responses=await Promise.all([post('api/internal/research-model-reservation',assignmentRequest),post('api/internal/research-model-reservation',assignmentRequest)]);
   const bodies=await Promise.all(responses.map(response=>response.json()));for(let i=0;i<responses.length;i++)assert.equal(responses[i].status,200,JSON.stringify(bodies[i]));assignment=bodies[0].assignment;assert.deepEqual(bodies[1].assignment,assignment);
   assert.equal(assignment.input_revision_id,sealed.revision_id);assert.equal(assignment.input_hash,sealed.input_hash);assert.equal(assignment.original_job_deadline,sealed.canonical_payload.originalJob.leaseExpiresAt);assert.equal(assignment.reservation_started_at,sealed.canonical_payload.originalReservation.startedAt);assert.equal('controller_principal' in assignment,false);assert.equal('canonical_request' in assignment,false);assert.equal(bodies[0].dispatchReady,false);assert.equal(bodies[0].modelDispatched,false);
   const after=counts();assert.equal(after.split('\n')[0],'1');assert.equal(after.split('\n').slice(1).join('\n'),initial.split('\n').slice(1).join('\n'));report.authorAssignmentHttp={symbol,assignmentId:assignment.assignment_id,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash,syntheticControllerCredentials:true,actualTrustedRoleExecution:false,publishableResearch:false};
  });
  await t.test('replay/restart return exact assignment and preserve original counts',async()=>{
   const before=counts();for(const action of ['assignAuthor','readAuthorAssignment']){r=await post('api/internal/research-model-reservation',{...assignmentRequest,action});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.deepEqual(d.assignment,assignment);}
   restart();for(let n=0;n<20;n++){r=await post('api/internal/research-model-reservation',{...assignmentRequest,action:'readAuthorAssignment'});if(r.status===200)break;await new Promise(resolve=>setTimeout(resolve,100));}const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.deepEqual(d.assignment,assignment);assert.equal(counts(),before);
  });
  await t.test('source withdrawal or original expiry blocks read/replay without deleting assignment',async()=>{
   const before=counts();if(symbol==='2409')sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||jsonb_build_object('retracted_at',clock_timestamp()) WHERE id='${documentId}';RESET ROLE;`);
   else{assert.ok(pgClock,'explicit reviewed isolated PG clock required');await pgClock.set('+1900');}
   for(const action of ['assignAuthor','readAuthorAssignment'])assert.equal((await post('api/internal/research-model-reservation',{...assignmentRequest,action})).status,409);assert.equal(counts(),before);
  });
 }});assert.ok(report.completeInputHttp);assert.ok(report.authorAssignmentHttp);
 }finally{globalThis.fetch=realFetch;}
});
