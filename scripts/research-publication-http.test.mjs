import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {parseResearchPublicationView} from '../web/src/lib/research-publication-view.ts';
import {financialInstant} from '../web/src/lib/research-financial-clock.ts';
import {completeCanonical,completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {verifyLocalInboxDataPlane} from '../scripts/research-local-inbox-dataplane.mjs';
import {prepareObservedRosterAdmission} from '../web/src/lib/research-observed-roster.ts';
import {readAfterResearchReadiness} from './research-reviewer-result-http-readiness.mjs';
import {oversizedReviewerFixture} from './research-reviewer-result-http-fixture.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
import {syntheticReviewerEnvelope,canonicalSizedEditorialReview} from './research-reviewer-result-fixture.mjs';
// Separate disposable scenario: original reviewer94 cases remain unchanged.
const root=process.cwd();
const read=f=>JSON.parse(fs.readFileSync(root+'/docs/research/2026-10-08-discovery-live/'+f,'utf8'));
const roster={legacyClassification:read('observed-security-classification.json'),securityScope:read('official-security-scope-reconciliation.json')};
// Synthetic inbox and model owner are development fixtures. Only the fixed
// calculator's Git relay inputs are actual attributed public financial data.
const mapping=JSON.parse(fs.readFileSync(root+'/web/src/lib/research-complete-mapping.json'));
for(const symbol of ['2409','2383'])test(`compiled atomic publication ${symbol}, synthetic job, actual fixed financial inputs`,{timeout:120000},async t=>{
 let publicationHeaders={}; let reviewHeaders={}; const realFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const action=typeof options?.body==='string'&&options.body.length?JSON.parse(options.body).action:undefined;return realFetch(url,['publishResearchArticle','readResearchPublication'].includes(action)?{...options,headers:{...options.headers,'x-research-input-version':'2','x-research-publication-action':action,...publicationHeaders}}:['receiveReviewerResult','readReviewerResult'].includes(action)?{...options,headers:{...options.headers,'x-research-execution-version':'2','x-research-review-result-action':action,...reviewHeaders}}:['assignReviewer','readReviewerAssignment','readReviewerPacket'].includes(action)?{...options,headers:{...options.headers,'x-research-execution-version':'2','x-research-review-assignment-action':action,...reviewHeaders}}:action==='sealResearchInput'||action==='readResearchInputRevision'?{...options,headers:{...options.headers,'x-research-input-version':'2'}}:action==='handoffAuthorResult'||action==='readAuthorHandoff'?{...options,headers:{...options.headers,'x-research-execution-version':'2','x-research-author-handoff-action':action}}:action==='receiveAuthorResult'||action==='readAuthorResult'?{...options,headers:{...options.headers,'x-research-execution-version':'2','x-research-author-result-action':action}}:action==='assignAuthor'||action==='readAuthorAssignment'||action==='readAuthorPacket'?{...options,headers:{...options.headers,'x-research-execution-version':'2'}}:options);};
 try {const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedPriority:true,observedClaim:true,researchControllers:true,publicationPreview:true,testPgClockLibrary:process.env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY,check:(name,fn)=>t.test(name,fn),afterBaseline:async({post,rpc,sql,priorityRequest,report,restart,origin,dropPublicationResponse})=>{
  const prepared=prepareObservedRosterAdmission(roster),scope={scope:'research_observed_v1',snapshotHash:prepared.snapshotHash};
  let r=await post('api/internal/research-observed-roster',roster);assert.equal(r.status,200);
  const now=new Date(Date.now()-1000).toISOString();
  const item={sourcePlatform:'threads',sourceUrl:`https://example.invalid/synthetic-financial-http/${symbol}`,author:'synthetic fixture, not a publisher observation',publishedAt:now,observedAt:now,firstObservedAt:now,symbols:[symbol],shortSummary:'Synthetic company mention for isolated controller and financial calculator acceptance. Not a real source or an investment thesis.',catalyst:'No actual catalyst; developer fixture only.',risk:'No orders, qualification, or independent model execution.',claimStatus:'reported',visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'};
  r=await post('api/internal/research-inbox',{items:[item]});assert.equal(r.status,200);const inbox=await r.json();assert.equal(inbox.accepted,1);const documentId=inbox.revisions[0].id;
  r=await post('api/internal/research-priority-run',{...priorityRequest,...scope,asOf:new Date().toISOString(),assessments:[{symbol,profitImpact:{level:0,reason:'合成隔離驗收，無真實獲利影響'},novelty:{level:0,reason:'合成隔離驗收，不是新催化'},researchability:{level:1,reason:'測試既有固定財務計算入口，不代表研究資格'},lane:'general',disposition:'queued',inProgress:false}]});const ranking=await r.json();assert.equal(r.status,200,JSON.stringify(ranking));assert.equal(ranking.newDeepResearchJobs,1);assert.equal(ranking.accountedCount,1978);
  const owner='synthetic-financial-http-owner';r=await post('api/internal/research-deep-job',{action:'claim',owner,...scope});const claimed=await r.json();assert.equal(r.status,200,JSON.stringify(claimed));assert.ok(claimed.context,'actual open-window reservation required');const context=claimed.context;
  const request={owner,...scope,jobId:context.job.jobId,attempt:context.job.attempt,reservationId:context.modelReservation.reservationId,bundleId:null,sourceDocumentIds:[documentId]};
  for(const name of ['20261009_research_publication_source_fence_v2.sql','20261009_research_input_preparations_v2.sql','20261009_research_input_preparation_assert_v2.sql','20261009_research_complete_input_v2.sql','20261009_research_author_assignments_v2.sql','20261009_research_author_packet_v2.sql','20261009_research_author_results_v2.sql','20261009_research_author_handoffs_v2.sql','20261009_research_reviewer_assignments_v2.sql','20261009_research_reviewer_results_v2.sql'])sql(fs.readFileSync(root+'/migrations/'+name,'utf8'));
  sql("NOTIFY pgrst,'reload schema';");
  // Admission probes are read/no-write readiness checks, separate from the
  // single business calls below. Preserve every startup response in the receipt.
  report.authorPacketReadiness=[];
  const attempts=report.authorPacketReadiness;
  let saved;
  await t.test('compiled guarded preparation binds actual job, lease and source seal',async()=>{
   r=await readAfterResearchReadiness(()=>rpc('prepare_research_input_v2',{p_request:{}}),()=>post('api/internal/research-deep-job',{action:'prepareResearchInput',...request}),{name:'prepare_research_input_v2',attempts,ready:x=>x.status===400&&x.body?.code==='P0001'&&x.body?.message==='input_preparation_shape'});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));saved=d.preparation;assert.equal(saved.payload.stockId,null);assert.equal(d.dispatchReady,false);
  });

  const input={owner,jobId:request.jobId,attempt:request.attempt,reservationId:request.reservationId,...scope,preparationId:saved.preparation_id,preparationHash:saved.input_hash,expectedArtifactManifestHash:mapping.companies[symbol].inventoryHash,expectedCalculatorExecutionHash:mapping.sourceClosureHash};
  let serverObservedCoreHash;
  await t.test('compiled read-only financial diagnostic before immutable admission',async()=>{
   const response=await post('api/internal/research-deep-job',{action:'financialSupplement',...request,preparationId:saved.preparation_id,preparationInputHash:saved.input_hash});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/financial-supplement-diagnostic.json',JSON.stringify(body),{flag:'wx',mode:0o600});
   serverObservedCoreHash=body.supplement.calculation.executionCodeHash;assert.match(serverObservedCoreHash,/^[a-f0-9]{64}$/u);
   if(symbol==='2409')t.diagnostic(JSON.stringify({field:'base Q4 display revenue, manual research assumption projection',actual:body.supplement.projection.projected.scenarios[1].quarters[1].segments[0].revenue,expectedFrozen:31090.078766235238}));
  });
  let sealed;
  await t.test('actual compiled marker path seals fixed calculation with all false capabilities',async()=>{
   r=await post('api/internal/research-deep-job',{action:'sealResearchInput',...input});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));sealed=d.revision;assert.equal(sealed.status,'sealed');assert.equal(sealed.replay,false);assert.ok(Object.values(sealed.canonical_payload.capabilities).every(x=>x===false));assert.equal(sealed.canonical_payload.financial.material.projection.monthlyBridge.value,symbol==='2409'?66876:60884.517);assert.equal(sql('SELECT count(*) FROM stocks;SELECT count(*) FROM stock_instruments_v3;'),'0\n0');
   report.completeInputHttp={symbol,revisionId:sealed.revision_id,inputHash:sealed.input_hash,charge:sealed.logical_bytes,syntheticJobAndOwner:true,actualTrustedRoleExecution:false,financialVerified:false,dispatchReady:false};
  });
  const assignmentRequest={action:'assignAuthor',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash};
  const packetRequest={...assignmentRequest,action:'readAuthorPacket'};
  const tables=['research_execution_invocations_v2','research_reviewer_results_v2','research_reviewer_assignments_v2','research_author_results_v2','source_raw_documents','research_source_seals_v2','research_source_seal_invalidations_v2','research_input_preparations_v2','research_article_input_revisions_v2','research_author_assignments_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_model_reservations_v1','research_model_completions_v1','stocks','stock_instruments_v3'];
  const q=value=>"'"+String(value).replaceAll("'","''")+"'";
  const audit=()=>sql(`SELECT jsonb_build_object(${tables.map(name=>`${q(name)},(SELECT jsonb_build_object('count',count(*),'rowHash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex')) FROM ${name} x)`).join(',')},'modelReservedSeconds',(SELECT coalesce(sum(reserved_seconds),0) FROM research_model_reservations_v1),'logicalCharge',(SELECT coalesce(sum(logical_bytes),0) FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) x));`);
  let assignment,packetResponse;
  await t.test('packet marker2 authentication and closed-body rejection leave all rows unchanged',async()=>{
   const before=audit();
   for(const role of [false,'reviewer','tester','cron'])assert.equal((await post('api/internal/research-model-reservation',packetRequest,role)).status,401);
   for(const patch of [{authorId:'not-authority'},{principal:'a'.repeat(64)},{clock:new Date().toISOString()},{extra:true}])assert.equal((await post('api/internal/research-model-reservation',{...packetRequest,...patch})).status,400);
   assert.equal((await post('api/internal/research-model-reservation',{...packetRequest,inputHash:'f'.repeat(64)})).status,409);
   assert.equal(audit(),before);
  });
  await t.test('complete input without original author assignment cannot produce a packet',async()=>{
   const before=audit();const response=await post('api/internal/research-model-reservation',packetRequest);const body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_packet_unavailable');assert.equal(body.retryClaim,false);assert.equal(audit(),before);
  });
  await t.test('existing guarded author admission binds this original input without a new reservation',async()=>{
   const before=JSON.parse(audit());r=await post('api/internal/research-model-reservation',assignmentRequest);const body=await r.json();assert.equal(r.status,200,JSON.stringify(body));assignment=body.assignment;assert.equal(assignment.input_hash,sealed.input_hash);assert.equal(body.modelDispatched,false);const after=JSON.parse(audit());assert.equal(after.research_author_assignments_v2.count,1);delete before.research_author_assignments_v2;delete after.research_author_assignments_v2;assert.deepEqual(after,before);
  });
  await t.test('compiled packet contains full public excerpts, unknown precision, actual seal clock and exact financial result',async()=>{
   const before=audit();const response=await post('api/internal/research-model-reservation',packetRequest);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));packetResponse=body;const packet=body.packet;
   assert.equal(body.packetHash,completeHash(packet));assert.equal(body.dispatchReady,false);assert.equal(body.modelDispatched,false);assert.equal(packet.schemaVersion,'research-author-packet-v2');assert.equal(packet.assignmentId,assignment.assignment_id);assert.equal(packet.sources.length,1);
   const source=packet.sources[0];assert.equal(source.summary,item.shortSummary);assert.equal(source.catalyst,item.catalyst);assert.equal(source.risk,item.risk);assert.equal(source.sourceClaimStatus,item.claimStatus);assert.equal(source.untrustedEvidence,true);assert.equal(source.descriptor.id,documentId);assert.deepEqual(source.descriptor.symbols,[symbol]);assert.equal(source.descriptor.url,item.sourceUrl);assert.deepEqual(source.descriptor.publication,{precision:'unknown',raw:null,timezone:null,instant:null});assert.equal(Date.parse(source.unverifiedPublicationClaim),Date.parse(item.publishedAt));
   const dbSeal=sql(`SELECT to_json(received_at)#>>'{}' FROM research_source_seals_v2 WHERE seal_id=${q(sealed.canonical_payload.sources.sealId)};`);
   assert.equal(financialInstant(packet.sourceSealReceivedAt),financialInstant(dbSeal));assert.equal(source.descriptor.admittedAt,packet.sourceSealReceivedAt);assert.ok(financialInstant(source.descriptor.observedAt)<=financialInstant(source.collectedAt));assert.ok(financialInstant(source.collectedAt)<=financialInstant(packet.sourceSealReceivedAt));assert.ok(financialInstant(packet.sourceSealReceivedAt)<=financialInstant(packet.evidenceCutoffAt));
   assert.deepEqual(packet.financial.projection,sealed.canonical_payload.financial.material.projection);assert.deepEqual(packet.financial.calculation,sealed.canonical_payload.financial.material.calculation);assert.ok(Object.values(packet.capabilities).every(v=>v===false));assert.equal(packet.financial.projection.monthlyBridge.value,symbol==='2409'?66876:60884.517);
   const privateBinding=JSON.parse(sql(`SELECT jsonb_build_object('principal',controller_principal,'owner',work_owner,'job',job_id,'reservation',reservation_id) FROM research_author_assignments_v2 WHERE assignment_id=${q(assignment.assignment_id)};`));
   const encoded=JSON.stringify(packet);fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/author-packet-response.json',JSON.stringify(body),{flag:'wx',mode:0o600});for(const value of Object.values(privateBinding))assert.equal(encoded.includes(value),false,'private execution binding must remain outside model context');
   const walk=value=>{if(value&&typeof value==='object')for(const [key,child]of Object.entries(value)){assert.ok(!['controller_principal','canonical_request','work_owner','owner','jobId','job_id','reservationId','reservation_id','principal'].includes(key));walk(child);}};walk(packet);
   const realNow=new Date().toISOString(),dbNow=sql('SELECT clock_timestamp()::text;');assert.ok(Date.parse(packet.writingWindow.assignedAt)<=Date.parse(realNow));for(const deadline of [packet.writingWindow.originalJobDeadline,packet.writingWindow.originalReservationDeadline])assert.ok(Date.parse(realNow)<Date.parse(deadline));assert.ok(Math.abs(Date.parse(realNow)-Date.parse(dbNow))<2000,'PG-only +0 clock agrees with real Node window');
   report.authorPacketHttp={symbol,packetHash:body.packetHash,packetBytes:Buffer.byteLength(encoded),sourceCount:packet.sources.length,sourceSealReceivedAt:packet.sourceSealReceivedAt,dbSealReceivedAt:dbSeal,nodeReadAt:realNow,pgReadAt:dbNow,writingWindow:packet.writingWindow,syntheticSourceJobCredentials:true,actualFinancialRelayProjection:true,modelDispatched:false,researchQualified:false,stateAuditBefore:JSON.parse(before),stateAuditAfter:JSON.parse(audit())};assert.equal(audit(),before);
  });
  await t.test('two packet reads and actual PostgreSQL restart preserve hash, clocks, rows and charges',async()=>{
   const before=audit();for(let n=0;n<2;n++){const response=await post('api/internal/research-model-reservation',packetRequest);const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,packetResponse);}restart();
   const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',packetRequest),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,packetResponse);assert.equal(audit(),before);
  });
  const resultIdentity={action:'readAuthorResult',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash};
  let fixture,savedResult,responseResult;
  await t.test('result marker2 auth and closed body reject with unchanged original budget',async()=>{
   const before=audit();for(const role of [false,'reviewer','tester','cron'])assert.equal((await post('api/internal/research-model-reservation',resultIdentity,role)).status,401);
   for(const patch of [{extra:true},{owner:'caller-identity'},{article:{}},{observation:{}}])assert.equal((await post('api/internal/research-model-reservation',{...resultIdentity,...patch})).status,400);
   assert.equal(audit(),before);
  });
  await t.test('actual result read before reception is null, no assignment or charge added',async()=>{
   const before=audit(),response=await post('api/internal/research-model-reservation',resultIdentity),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.result,null);assert.equal(body.controllerReportOnly,true);assert.equal(body.modelDispatched,false);assert.equal(body.publishableResearch,false);assert.equal(audit(),before);
  });
  await t.test('counterfactual original source fingerprint observation is rejected once with identical all-state audit',async()=>{
   fixture=authorResultFixture(resultIdentity,sealed,packetResponse.packet);const before=audit();
   assert.notEqual(fixture.envelope.validatedArticle.calculatorExecutionHash,serverObservedCoreHash);
   const payloadHash=completeHash(fixture.request),response=await post('api/internal/research-model-reservation',fixture.request),body=await response.json();
   assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_result_unavailable');assert.equal(body.retryClaim,false);assert.equal(audit(),before);
   report.authorResultCounterfactual={payloadHash,sourceArticleHash:fixture.request.observation.articleHash,sourceCoreHash:fixture.envelope.validatedArticle.calculatorExecutionHash,serverObservedCoreHash,status:response.status,responseBody:body,before:JSON.parse(before),after:JSON.parse(audit()),businessAttempts:1};
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/source-core-counterfactual.json',JSON.stringify({request:fixture.request,receipt:report.authorResultCounterfactual}),{flag:'wx',mode:0o600});
  });
  await t.test('synthetic controller observation and prose, actual fixed financial recalculation, one immutable private result',async()=>{
   const originalFixture=structuredClone(fixture);
   // This controller fixture was validated in source Node, whereas the receiver
   // independently validates with its compiled core. Bind the observed server
   // identity from the existing guarded diagnostic; do not bypass its equality.
   const sourceValidated=structuredClone(fixture.envelope.validatedArticle),receiverValidated=structuredClone(sourceValidated);
   const sourceCoreHash=sourceValidated.calculatorExecutionHash;assert.notEqual(sourceCoreHash,serverObservedCoreHash);
   receiverValidated.calculatorExecutionHash=serverObservedCoreHash;
   assert.deepEqual({...receiverValidated,calculatorExecutionHash:sourceCoreHash},sourceValidated,'only the core identity field changes before rehash');
   delete receiverValidated.articleHash;const expectedReceiverArticleHash=completeHash(receiverValidated);receiverValidated.articleHash=expectedReceiverArticleHash;
   assert.notEqual(expectedReceiverArticleHash,sourceValidated.articleHash);
   fixture.request=structuredClone(fixture.request); // detach the shared fixture observation alias; preserve envelope
   fixture.request.observation.articleHash=expectedReceiverArticleHash;
   assert.deepEqual({...fixture.request,observation:{...fixture.request.observation,articleHash:originalFixture.request.observation.articleHash}},originalFixture.request,'raw article, all clocks and other bindings remain untouched');
   assert.deepEqual(fixture.envelope,originalFixture.envelope,'shared fixture envelope is untouched');
   const identityBinding={sourceCoreHash,serverObservedCoreHash,sourceArticleHash:sourceValidated.articleHash,expectedReceiverArticleHash,sourceValidated,receiverValidated,changedField:'calculatorExecutionHash',requestDiff:['observation.articleHash'],sourceRequestHash:completeHash(originalFixture.request),receiverRequestHash:completeHash(fixture.request),rawArticleHash:completeHash(fixture.request.article),syntheticControllerObservation:true,actualModelExecuted:false};
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/single-core-identity-binding.json',JSON.stringify(identityBinding),{flag:'wx',mode:0o600});report.authorResultIdentityBinding=identityBinding;
   const before=JSON.parse(audit()),beforeResultAdmission=structuredClone(before);
   const response=await post('api/internal/research-model-reservation',fixture.request),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));responseResult=body;savedResult=body.result;assert.deepEqual(savedResult.payload.validatedArticle,receiverValidated,'receiver independently recalculates the expected compiled identity');
   assert.equal(savedResult.result_hash,completeHash(savedResult.payload));assert.deepEqual(savedResult.payload.rawArticle,fixture.request.article);assert.deepEqual(savedResult.payload.validatedArticle.calculation,sealed.canonical_payload.financial.material.calculation);assert.equal(savedResult.payload.observation.modelIdentity,null);
   for(const key of ['financialVerified','publishableResearch','researchQualified','strategyApproved','entryEligible'])assert.equal(savedResult.payload.validatedArticle[key],false);
   assert.equal(body.controllerReportOnly,true);assert.equal(body.modelDispatched,false);assert.equal(body.dispatchReady,false);assert.equal(body.publishableResearch,false);
   const after=JSON.parse(audit());assert.equal(after.research_author_results_v2.count,1);assert.equal(after.research_execution_invocations_v2.count,before.research_execution_invocations_v2.count+1);delete before.research_execution_invocations_v2;delete after.research_execution_invocations_v2;delete before.research_author_results_v2;delete after.research_author_results_v2;assert.deepEqual(after,before);
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/author-result-response.json',JSON.stringify(body),{flag:'wx',mode:0o600});
   report.authorResultHttp={symbol,resultHash:savedResult.result_hash,logicalBytes:savedResult.logical_bytes,receivedAt:savedResult.received_at,responseBytes:Buffer.byteLength(JSON.stringify(body)),syntheticObservationAndProse:true,actualFixedFinancialCalculation:true,actualModelDispatched:false,formalPublication:false,stateAuditBefore:beforeResultAdmission,stateAuditAfter:JSON.parse(audit())};
  });
  await t.test('changed article or observation single-shot rejected without modifying private draft',async()=>{
   const before=audit();for(const change of [v=>v.article.summary.text+='更改',v=>v.observation.outputHash='f'.repeat(64),v=>v.observation.controllerObservedEndAt='2099-01-01T00:00:00Z']){const bad=structuredClone(fixture.request);change(bad);const response=await post('api/internal/research-model-reservation',bad),body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_result_unavailable');assert.equal(body.retryClaim,false);}assert.equal(audit(),before);
  });
  await t.test('result exact read/reception replay and actual PG restart preserve full hash/clock/bytes and budget',async()=>{
   const before=audit();for(const req of [resultIdentity,fixture.request,resultIdentity]){const response=await post('api/internal/research-model-reservation',req),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,responseResult);}restart();
   const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',resultIdentity),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,responseResult);assert.equal(audit(),before);report.authorResultHttp.restartReadPreserved=true;report.authorResultHttp.stateAuditAfter=JSON.parse(audit());
  });


  const reviewIdentity=(action='readReviewerAssignment')=>({action,input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash,resultId:savedResult.result_id,resultHash:savedResult.result_hash});
  const reviewCall=async(req,role='reviewer',label='reviewer')=>{const response=await post('api/internal/research-model-reservation',req,role),body=await response.json();report.reviewerHttpAttempts??=[];report.reviewerHttpAttempts.push({label,request:structuredClone(req),requestHash:completeHash(req),status:response.status,body});return{response,body};};
  await t.test('separate reviewer bearer, closed body, mixed header, oversized body reject without writes',async()=>{
   const before=audit();for(const role of [true,false,'cron','tester'])assert.equal((await reviewCall(reviewIdentity(),role,'auth')).response.status,401);
   reviewHeaders={authorization:'Bearer synthetic-unknown-reviewer'};try{assert.equal((await reviewCall(reviewIdentity(),'reviewer','unknown-auth')).response.status,401);}finally{reviewHeaders={};}
   for(const patch of [{extra:true},{owner:'caller'},{principal:'a'.repeat(64)}])assert.equal((await reviewCall({...reviewIdentity(),...patch},'reviewer','closed-body')).response.status,400);
   reviewHeaders={'x-research-review-assignment-action':'assignReviewer'};try{assert.equal((await reviewCall(reviewIdentity(),'reviewer','action-header-mismatch')).response.status,400);}finally{reviewHeaders={};}
   reviewHeaders={'x-research-author-handoff-action':'readAuthorHandoff'};try{assert.equal((await reviewCall(reviewIdentity(),'reviewer','mixed-header')).response.status,400);}finally{reviewHeaders={};}
   const originalInputHash=completeHash(input),large=oversizedReviewerFixture(reviewIdentity());assert.equal((await reviewCall(large,'reviewer','oversized')).response.status,400);assert.equal(completeHash(input),originalInputHash);assert.equal(audit(),before);
  });
  await t.test('reviewer read packet and assign before author handoff reject with zero writes',async()=>{
   const before=audit();for(const action of ['readReviewerAssignment','readReviewerPacket','assignReviewer']){const{response,body}=await reviewCall(reviewIdentity(action),'reviewer','pre-handoff');assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_reviewer_assignment_unavailable');assert.equal(body.retryClaim,false);}assert.equal(audit(),before);
  });
  const handoffIdentity=()=>({action:'readAuthorHandoff',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash,resultId:savedResult.result_id,resultHash:savedResult.result_hash});
  let handoffResponse;
  const handoffCall=async(req,role=true,label='handoff')=>{const response=await post('api/internal/research-model-reservation',req,role),body=await response.json();report.authorHandoffAttempts??=[];report.authorHandoffAttempts.push({label,action:req.action,requestHash:completeHash(req),request:structuredClone(req),status:response.status,body});return{response,body};};
  await t.test('handoff exact header auth, closed six keys and result mismatch leave all state unchanged',async()=>{
   const before=audit();for(const role of [false,'reviewer','tester','cron'])assert.equal((await handoffCall(handoffIdentity(),role,'auth')).response.status,401);
   for(const patch of [{extra:true},{principal:'a'.repeat(64)},{owner:'caller'},{completion:{}}])assert.equal((await handoffCall({...handoffIdentity(),...patch},true,'closed-shape')).response.status,400);
   for(const patch of [{resultHash:'f'.repeat(64)},{inputHash:'f'.repeat(64)},{resultId:'00000000-0000-4000-8000-000000000000'}])assert.equal((await handoffCall({...handoffIdentity(),...patch},true,'binding-mismatch')).response.status,409);assert.equal(audit(),before);
  });
  await t.test('read before original reservation completion returns null without writing',async()=>{
   const before=audit(),{response,body}=await handoffCall(handoffIdentity(),true,'read-before');assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.receipt,null);assert.equal(body.authorReservationCompleted,false);assert.equal(audit(),before);
  });
  await t.test('single original author handoff adds only completion bound to recalculated article hash',async()=>{
   const before=JSON.parse(audit()),{response,body}=await handoffCall({...handoffIdentity(),action:'handoffAuthorResult'},true,'first-handoff');assert.equal(response.status,200,JSON.stringify(body));handoffResponse=body;
   assert.equal(body.authorReservationCompleted,true);assert.equal(body.receipt.result_hash,savedResult.payload.validatedArticle.articleHash);assert.equal(body.receipt.reservation_id,input.reservationId);assert.equal(body.receipt.owner,input.owner);assert.equal(body.receipt.outcome,'completed');
   for(const key of ['modelDispatched','reviewerDispatched','publishableResearch','researchQualified','strategyApproved','entryEligible'])assert.equal(body[key],false);assert.equal(body.controllerReportOnly,true);
   const after=JSON.parse(audit());assert.equal(after.research_model_completions_v1.count,before.research_model_completions_v1.count+1);const fullBefore=structuredClone(before),fullAfter=structuredClone(after);delete before.research_model_completions_v1;delete after.research_model_completions_v1;assert.deepEqual(after,before);
   report.authorHandoffHttp={symbol,completion:body.receipt,completionHash:completeHash(body.receipt),completionBytes:Buffer.byteLength(JSON.stringify(body.receipt)),stateAuditBefore:fullBefore,stateAuditAfter:fullAfter,syntheticControllerOnly:true,actualModelExecution:false,publication:false};
  });
  assert.ok(handoffResponse,'first author handoff failed; stop dependent cases without retry');
  await t.test('old author result active read rejects completed reservation and preserves private result',async()=>{
   const before=audit(),response=await post('api/internal/research-model-reservation',resultIdentity),body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_result_unavailable');assert.equal(audit(),before);
  });
  await t.test('handoff exact read replay and actual PG restart preserve complete receipt bytes clock and charge',async()=>{
   const before=audit();for(const req of [handoffIdentity(),{...handoffIdentity(),action:'handoffAuthorResult'},handoffIdentity()]){const {response,body}=await handoffCall(req,true,'read-replay');assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,handoffResponse);}restart();
   const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',handoffIdentity()),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();report.authorHandoffAttempts.push({label:'restart-read',action:'readAuthorHandoff',requestHash:completeHash(handoffIdentity()),status:response.status,body});assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,handoffResponse);assert.equal(audit(),before);report.authorHandoffHttp.restartReadPreserved=true;
  });

  assert.ok(handoffResponse,'positive author handoff must succeed before dependent reviewer cases');
  let reviewerResponse,reviewerPacketResponse;
  await t.test('completed author permits independent read with null reviewer and packet remains unavailable',async()=>{
   const before=audit(),{response,body}=await reviewCall(reviewIdentity(),'reviewer','read-before-review');assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.assignment,null);assert.equal(body.packet,null);assert.equal((await reviewCall(reviewIdentity('readReviewerPacket'),'reviewer','packet-before-review')).response.status,409);assert.equal(audit(),before);
  });
  await t.test('concurrent exact reviewer admission adds one counter-review reservation and1800 charge only',async()=>{
   const before=JSON.parse(audit()),reviewerAuditBefore=structuredClone(before),originalReservations=JSON.parse(sql('SELECT jsonb_agg(to_jsonb(r) ORDER BY reservation_id)::text FROM research_model_reservations_v1 r;'));const replies=await Promise.all([reviewCall(reviewIdentity('assignReviewer'),'reviewer','concurrent-first-A'),reviewCall(reviewIdentity('assignReviewer'),'reviewer','concurrent-first-B')]);for(const x of replies)assert.equal(x.response.status,200,JSON.stringify(x.body));assert.deepEqual(replies[0].body,replies[1].body);reviewerResponse=replies[0].body;assert.ok(reviewerResponse.assignment);assert.equal(reviewerResponse.blockedReason,null);assert.equal(reviewerResponse.reviewerDispatched,false);
   const after=JSON.parse(audit());assert.equal(after.research_reviewer_assignments_v2.count,1);assert.equal(after.research_model_reservations_v1.count,before.research_model_reservations_v1.count+1);assert.equal(after.modelReservedSeconds,before.modelReservedSeconds+1800);assert.equal(after.modelReservedSeconds,3600);
   const reservation=JSON.parse(sql(`SELECT to_jsonb(r)::text FROM research_model_reservations_v1 r WHERE reservation_id=${q(reviewerResponse.assignment.reservation_id)};`));assert.equal(reservation.role,'counter_review');assert.equal(reservation.reserved_seconds,1800);assert.equal(reservation.owner,input.owner);assert.equal(financialInstant(reservation.lease_expires_at)-financialInstant(reservation.started_at),1800n*1000000000n);assert.notEqual(reservation.reservation_id,input.reservationId);assert.deepEqual(JSON.parse(sql(`SELECT jsonb_agg(to_jsonb(r) ORDER BY reservation_id)::text FROM research_model_reservations_v1 r WHERE reservation_id<>${q(reservation.reservation_id)};`)),originalReservations);
   const original=JSON.parse(audit());for(const key of ['research_reviewer_assignments_v2','research_model_reservations_v1','modelReservedSeconds']){delete before[key];delete after[key];}assert.deepEqual(after,before);
   report.reviewerAssignmentHttp={symbol,assignment:reviewerResponse.assignment,assignmentHash:completeHash(reviewerResponse.assignment),reservation,reservedSeconds:3600,additionalSeconds:1800,stateAuditBefore:reviewerAuditBefore,stateAuditAfter:original,syntheticControllerOnly:true,actualReviewerDispatched:false};
  });
  assert.ok(reviewerResponse?.assignment,'first reviewer admission failed; stop dependent cases without retry');
  await t.test('original global-one model slot blocks another guarded reserve without refund or writes',async()=>{
   const before=audit(),response=await post('api/internal/research-model-reservation',{action:'reserve',owner:'synthetic-other-slot',role:'discovery',workKey:'synthetic-review-global-slot'}),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.reservation,null);assert.equal(body.blockedReason,'global_lease_or_daily_budget_exhausted');assert.equal(audit(),before);report.reviewerAssignmentHttp.globalSlotBlocked=true;
  });
  await t.test('reviewer packet carries actual fixed financial result public summaries article and no private execution bindings',async()=>{
   const before=audit(),{response,body}=await reviewCall(reviewIdentity('readReviewerPacket'),'reviewer','packet');assert.equal(response.status,200,JSON.stringify(body));reviewerPacketResponse=body;const packet=body.packet;assert.equal(body.packetHash,completeHash(packet));assert.equal(packet.schemaVersion,'research-reviewer-packet-v2');assert.equal(packet.authorResultHash,savedResult.result_hash);assert.equal(packet.articleHash,savedResult.payload.validatedArticle.articleHash);assert.equal(packet.calculatorExecutionHash,serverObservedCoreHash);assert.deepEqual(packet.article,savedResult.payload.rawArticle);assert.deepEqual(packet.research.financial,packetResponse.packet.financial);assert.deepEqual(packet.research.sources,packetResponse.packet.sources);assert.equal(packet.research.sources[0].summary,item.shortSummary);assert.equal(packet.research.sources[0].descriptor.publication.precision,'unknown');
   const privateValues=JSON.parse(sql(`SELECT jsonb_build_object('reviewerPrincipal',reviewer_principal,'reviewerOwner',work_owner,'reviewerReservation',reservation_id,'job',job_id) FROM research_reviewer_assignments_v2 WHERE assignment_id=${q(reviewerResponse.assignment.assignment_id)};`));const encoded=JSON.stringify(packet);for(const value of [...Object.values(privateValues),input.reservationId])assert.equal(encoded.includes(value),false);
   const walk=value=>{if(value&&typeof value==='object')for(const[key,child]of Object.entries(value)){assert.ok(!['controller_principal','reviewer_principal','work_owner','canonical_request','reservationId','reservation_id','jobId','job_id','fullText','full_text','rawBody','authorization'].includes(key));walk(child);}};walk(packet);for(const key of ['reviewerDispatched','publishableResearch','researchQualified','strategyApproved','entryEligible'])assert.equal(packet[key],false);assert.equal(audit(),before);report.reviewerAssignmentHttp.packetHash=body.packetHash;report.reviewerAssignmentHttp.packetBytes=Buffer.byteLength(encoded);
  });
  await t.test('reviewer exact read assign replay packet and PostgreSQL restart retain row hash clocks and budgets',async()=>{
   const before=audit();for(const action of ['readReviewerAssignment','assignReviewer']){const{response,body}=await reviewCall(reviewIdentity(action),'reviewer','read-replay');assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,reviewerResponse);}restart();
   const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',reviewIdentity('readReviewerPacket'),'reviewer'),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();report.reviewerHttpAttempts.push({label:'restart-packet',request:reviewIdentity('readReviewerPacket'),status:response.status,body});assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,reviewerPacketResponse);assert.equal(audit(),before);report.reviewerAssignmentHttp.restartPreserved=true;
  });
  const rrIdentity=(action='readReviewerResult')=>({...reviewIdentity(action)});
  const rrCall=async(req,role='reviewer',label='review-result')=>{const response=await post('api/internal/research-model-reservation',req,role),body=await response.json();report.reviewerResultAttempts??=[];report.reviewerResultAttempts.push({label,request:structuredClone(req),requestHash:completeHash(req),status:response.status,body});return{response,body};};
  let rrFixture,rrResponse;
  await t.test('review-result independent bearer closed body null-before with zero all-state audit',async()=>{
   const before=audit();for(const role of [true,false,'cron','tester'])assert.equal((await rrCall(rrIdentity(),role,'auth')).response.status,401);
   reviewHeaders={authorization:'Bearer synthetic-unknown-review-result'};try{assert.equal((await rrCall(rrIdentity(),'reviewer','unknown-auth')).response.status,401);}finally{reviewHeaders={};}
   for(const patch of [{extra:true},{review:{}},{observation:{}}])assert.equal((await rrCall({...rrIdentity(),...patch},'reviewer','closed-body')).response.status,400);
   reviewHeaders={'x-research-review-assignment-action':'readReviewerAssignment'};try{assert.equal((await rrCall(rrIdentity(),'reviewer','mixed-marker')).response.status,400);}finally{reviewHeaders={};}
   const{response,body}=await rrCall(rrIdentity(),'reviewer','null-before');assert.equal(response.status,200,JSON.stringify(body));assert.equal(body.result,null);assert.equal(body.controllerReportOnly,true);assert.equal(body.modelDispatched,false);assert.equal(audit(),before);
   rrFixture=syntheticReviewerEnvelope(rrIdentity('receiveReviewerResult'),{reviewerAssignment:reviewerResponse.assignment},reviewerPacketResponse.packet);
  });
  await t.test('review enums and paragraph scalar types reject coercion with zero result completion budget changes',async()=>{
   const mutations=[];for(const value of [[],{},null,['pass'],13]){mutations.push(r=>r.review.checks[0].status=value);mutations.push(r=>{r.review.findings=[{severity:value,paragraphId:null,issue:'此文字只是合成審查測試，不是實際執行來源查證或投資判斷。',sourceIds:[]}];});if(value!==null)mutations.push(r=>{r.review.findings=[{severity:'minor',paragraphId:value,issue:'此文字只是合成審查測試，不是實際執行來源查證或投資判斷。',sourceIds:[]}];});}
   mutations.push(r=>r.review.decision=['accepted']);mutations.push(r=>r.review.checks[0].status='unknown');mutations.push(r=>{r.review.findings=[{severity:'minor',paragraphId:'unknown',issue:'此文字只是合成審查測試，不是實際執行來源查證或投資判斷。',sourceIds:[]}];});
   for(const mutate of mutations){const bad=structuredClone(rrFixture.request);mutate(bad);bad.observation.outputHash=completeHash(bad.review);const before=audit(),{response,body}=await rrCall(bad,'reviewer','invalid-scalar');assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_reviewer_result_unavailable');assert.equal(audit(),before);}
  });
  await t.test('review canonical65537 and Unicode trim raw scalar bounds reject without any state change',async()=>{
   const exact=canonicalSizedEditorialReview(rrFixture.request.review,65536),over=structuredClone(exact);over.strongestCounterEvidence+='a';assert.equal(Buffer.byteLength(completeCanonical(exact)),65536);assert.equal(Buffer.byteLength(completeCanonical(over)),65537);report.reviewerResultBoundaries={canonicalExactBytes:65536,canonicalOverBytes:65537,canonicalDiffersFromWire:Buffer.byteLength(JSON.stringify(exact))!==65536};
   const reviews=[over];for(const text of ['😀'.repeat(19),'😀'.repeat(4001),'\uFEFF'.repeat(20),'\u3000'.repeat(20)]){const review=structuredClone(rrFixture.request.review);review.strongestCounterEvidence=text;reviews.push(review);}const raw=structuredClone(rrFixture.request.review);raw.checks[0].rationale='a'.repeat(2000)+' ';reviews.push(raw);
   for(const review of reviews){const bad=structuredClone(rrFixture.request);bad.review=review;bad.observation.outputHash=completeHash(review);const before=audit(),{response,body}=await rrCall(bad,'reviewer','canonical-unicode-over');assert.equal(response.status,409,JSON.stringify(body));assert.equal(audit(),before);}
  });
  await t.test('cross-role thread invocation reuse clock hash stale input rejected single-shot without writes',async()=>{
   for(const mutate of [r=>r.observation.threadId=savedResult.payload.observation.threadId,r=>r.observation.invocationId=savedResult.payload.observation.invocationId,r=>r.observation.controllerObservedStartAt='2026-01-01T00:00:00Z',r=>r.observation.controllerObservedEndAt='2099-01-01T00:00:00Z',r=>r.observation.outputHash='f'.repeat(64),r=>r.resultHash='f'.repeat(64),r=>r.inputHash='f'.repeat(64),r=>r.input.expectedCalculatorExecutionHash='f'.repeat(64)]){const bad=structuredClone(rrFixture.request);mutate(bad);const before=audit(),{response,body}=await rrCall(bad,'reviewer','binding-negative');assert.equal(response.status,409,JSON.stringify(body));assert.equal(audit(),before);}
  });
  await t.test('one immutable synthetic review result finishes only original counter-review reservation',async()=>{
   const accepted=structuredClone(rrFixture.request);if(symbol==='2409')accepted.review=canonicalSizedEditorialReview(accepted.review,65536);else accepted.review.strongestCounterEvidence='\uFEFF'+'😀'.repeat(20)+'\u3000';accepted.observation.outputHash=completeHash(accepted.review);rrFixture.request=accepted;
   const before=JSON.parse(audit()),{response,body}=await rrCall(accepted,'reviewer','positive-once');assert.equal(response.status,200,JSON.stringify(body));rrResponse=body;assert.ok(body.result);assert.equal(body.result.result_hash,completeHash(body.result.payload));assert.deepEqual(body.result.payload.rawReview,accepted.review);assert.equal(body.result.logical_bytes,Buffer.byteLength(completeCanonical(body.result.payload)));assert.deepEqual(body.result.payload.packet,reviewerPacketResponse.packet);assert.equal(body.reviewerDispatched,false);for(const key of ['publishableResearch','researchQualified','strategyApproved','entryEligible'])assert.equal(body[key],false);
   const after=JSON.parse(audit());assert.equal(after.research_reviewer_results_v2.count,1);assert.equal(after.research_model_completions_v1.count,before.research_model_completions_v1.count+1);const completion=JSON.parse(sql(`SELECT to_jsonb(c)::text FROM research_model_completions_v1 c WHERE reservation_id=${q(reviewerResponse.assignment.reservation_id)};`));assert.equal(completion.outcome,'completed');assert.equal(completion.result_hash,body.result.result_hash);const a=structuredClone(after),b=structuredClone(before);assert.equal(after.research_execution_invocations_v2.count,before.research_execution_invocations_v2.count+1);for(const k of ['research_execution_invocations_v2','research_reviewer_results_v2','research_model_completions_v1']){delete a[k];delete b[k];}assert.deepEqual(a,b);
   report.reviewerResultHttp={symbol,canonicalReviewBytes:Buffer.byteLength(completeCanonical(accepted.review)),rawReviewScalars:Array.from(accepted.review.strongestCounterEvidence).length,trimmedReviewScalars:Array.from(accepted.review.strongestCounterEvidence.trim()).length,resultHash:body.result.result_hash,logicalBytes:body.result.logical_bytes,receivedAt:body.result.received_at,completion,stateAuditBefore:before,stateAuditAfter:after,syntheticControllerAndReview:true,actualReviewerModelExecuted:false};
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/reviewer-result-response.json',JSON.stringify(body),{flag:'wx',mode:0o600});
  });
  assert.ok(rrResponse?.result,'first receive review result failed; stop dependent cases without business retry');
  await t.test('completed exact context read replay and PG restart preserve whole result clocks bytes charge',async()=>{
   const before=audit();for(const req of [rrIdentity(),rrFixture.request,rrIdentity()]){const{response,body}=await rrCall(req,'reviewer','completed-read-replay');assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,rrResponse);}restart();const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',rrIdentity(),'reviewer'),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();report.reviewerResultAttempts.push({label:'restart-completed-read',request:rrIdentity(),status:response.status,body});assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,rrResponse);assert.equal(audit(),before);report.reviewerResultHttp.restartPreserved=true;
   const bad=structuredClone(rrFixture.request);bad.review.strongestCounterEvidence+='changed';bad.observation.outputHash=completeHash(bad.review);assert.equal((await rrCall(bad,'reviewer','conflicting-replay')).response.status,409);assert.equal(audit(),before);
  });

  // Install unmodified upstream publication constraints/functions. The original
  // profile already contains full CREATE TABLE definitions; only its later
  // ALTER dependencies below were absent. No fixture author/result is inserted.
  const dependencies=[];
  const install=(file,text=fs.readFileSync(root+'/migrations/'+file,'utf8'))=>{
   sql(text);dependencies.push({file,installedSha256:createHash('sha256').update(text).digest('hex')});
  };
  const rankingSql=fs.readFileSync(root+'/migrations/20260830_source_ranking_v2.sql','utf8');
  const stageStart=rankingSql.indexOf('CREATE TABLE IF NOT EXISTS public.candidate_daily_stage_snapshots (');
  assert.ok(stageStart>=0);install('20260830_source_ranking_v2.sql',rankingSql.slice(stageStart,rankingSql.indexOf('\n);',stageStart)+4));
  const shadowSql=fs.readFileSync(root+'/migrations/20260901_source_research_shadow_v2.sql','utf8');
  const stageAlter=shadowSql.indexOf('ALTER TABLE public.candidate_daily_stage_snapshots\n');
  assert.ok(stageAlter>=0);install('20260901_source_research_shadow_v2.sql',shadowSql.slice(stageAlter,shadowSql.indexOf(';',stageAlter)+1));
  for(const file of ['20260906_candidate_dossier_v4.sql','20260907_candidate_dossier_outbox_v5.sql','20260929_candidate_dossier_outbox_v6.sql'])install(file);
  const jobsSql=fs.readFileSync(root+'/migrations/20260929_research_deep_jobs_v1.sql','utf8');
  for(const marker of ['ALTER TABLE public.research_deep_jobs_v1\n','ALTER TABLE public.candidate_research_dossiers\n','ALTER TABLE public.candidate_dossier_outbox_v5\n']){
   const start=jobsSql.indexOf(marker);assert.ok(start>=0);install('20260929_research_deep_jobs_v1.sql',jobsSql.slice(start,jobsSql.indexOf(';',start)+1));
  }
  for(const file of ['20261009_research_publication_lineage_v2.sql','20261010_research_atomic_publication_v2.sql','20261010_research_publication_view_v2.sql'])install(file);
  tables.push('candidate_dossier_bundles','candidate_dossier_outbox_v5','candidate_research_dossiers','candidate_dossier_submission_receipts');
  sql("NOTIFY pgrst,'reload schema';");
  await readAfterResearchReadiness(()=>rpc('read_research_company_publication_v2',{p_company:randomUUID()}),async()=>null,
   {name:'read_research_company_publication_v2',attempts,ready:x=>x.status===200&&x.body===null});
  const publicationRequest={action:'publishResearchArticle',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash,
   authorResultId:savedResult.result_id,authorResultHash:savedResult.result_hash,
   reviewerResultId:rrResponse.result.result_id,reviewerResultHash:rrResponse.result.result_hash};
  const publicationRead={...publicationRequest,action:'readResearchPublication'};
  const companyId=sealed.canonical_payload.researchIdentity.researchCompanyId;
  const preview=`preview/research-working/${symbol}?researchCompanyId=${companyId}`;
  const publicationCall=async(request,role=true)=>{
   const response=await post('api/internal/research-deep-job',request,role);
   const body=await response.json();report.publicationAttempts.push({action:request.action,status:response.status,body});
   return {response,body};
  };
  const get=relative=>realFetch(origin+relative,{redirect:'error',signal:AbortSignal.timeout(15000)});
  report.publicationAttempts=[];
  report.publicationHttp={symbol,dependencies,partialDevelopmentProfile:true,syntheticAuthorReview:true,
   actualAuthorExecuted:false,actualReviewerExecuted:false,researchQualified:false,strategyApproved:false,entryEligible:false};
  await t.test('publication exact auth, marker and closed fields reject; unpublished read and preview do not fall back',async()=>{
   const before=audit();
   for(const role of [false,'reviewer','tester','cron'])assert.equal((await publicationCall(publicationRequest,role)).response.status,401);
   for(const patch of [{extra:true},{authorId:'caller-authority'},{article:{}},{inputHash:'f'.repeat(64)}]){
    const {response}=await publicationCall({...publicationRequest,...patch});assert.equal(response.status,'inputHash'in patch?409:400);
   }
   publicationHeaders={'x-research-execution-version':'2'};
   try {assert.equal((await publicationCall(publicationRequest)).response.status,400);}finally{publicationHeaders={};}
   const {response,body}=await publicationCall(publicationRead);assert.equal(response.status,200);assert.equal(body.publication,null);
   const page=await get(preview);assert.equal(page.status,404);assert.equal((await page.text()).includes('published-research-title'),false);
   assert.equal(audit(),before);
  });
  let original;
  await t.test('first publication commits but TCP response is dropped; original read recovers exactly once',async()=>{
   const before=JSON.parse(audit());
   const dropped=await dropPublicationResponse(publicationRequest);
   assert.deepEqual(dropped,{upstreamStatus:200,callerErrorCode:'ECONNRESET',requests:1,forwardedResponseBytes:0});
   const {response,body}=await publicationCall(publicationRead);assert.equal(response.status,200,JSON.stringify(body));original=body.publication;
   assert.ok(original);assert.equal(original.researchState,'published');assert.equal(original.idempotentReplay,true);
   for(const key of ['researchQualified','strategyApproved','entryEligible'])assert.equal(original[key],false);
   const after=JSON.parse(audit());
   for(const name of ['candidate_dossier_bundles','candidate_dossier_outbox_v5','candidate_research_dossiers','candidate_dossier_submission_receipts'])assert.equal(after[name].count,before[name].count+1,name);
   const a=structuredClone(after),b=structuredClone(before);
   for(const name of ['research_deep_jobs_v1','candidate_dossier_bundles','candidate_dossier_outbox_v5','candidate_research_dossiers','candidate_dossier_submission_receipts']){delete a[name];delete b[name];}
   assert.deepEqual(a,b);
   assert.equal(sql(`SELECT status FROM research_deep_jobs_v1 WHERE job_id=${q(input.jobId)};`),'completed');
   report.publicationHttp.firstResponseDrop=dropped;report.publicationHttp.original=original;
  });
  assert.ok(original,'first publication recovery failed; no business retry');
  await t.test('concurrent exact HTTP replay and PostgreSQL restart preserve original receipt and all state',async()=>{
   const before=audit();
   const responses=await Promise.all([publicationCall(publicationRequest),publicationCall(publicationRequest),publicationCall(publicationRead)]);
   for(const {response,body}of responses){assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body.publication,original);}
   assert.equal(audit(),before);restart();
   await readAfterResearchReadiness(()=>rpc('read_research_company_publication_v2',{p_company:companyId}),async()=>null,
    {name:'read_research_company_publication_v2',attempts,ready:x=>x.status===200&&x.body?.publication?.receipt?.submissionId===original.receipt.submissionId});
   const {response,body}=await publicationCall(publicationRead);assert.equal(response.status,200);assert.deepEqual(body.publication,original);assert.equal(audit(),before);
   report.publicationHttp.restartPreserved=true;
  });
  await t.test('compiled company preview renders the actual accepted content, computed periods and strict identity bounds',async()=>{
   const before=audit(),response=await rpc('read_research_company_publication_v2',{p_company:companyId});assert.equal(response.status,200);
   const raw=await response.json(),view=parseResearchPublicationView(raw,companyId,symbol);
   assert.deepEqual(raw.publication.content,original.content);assert.deepEqual(view.valuations,original.content.deepResearch.valuations);
   const page=await get(preview),html=await page.text();assert.equal(page.status,200,html.slice(0,400));
   assert.ok(html.includes('published-research-title'));assert.ok(html.includes('\u5df2\u767c\u5e03\u7814\u7a76\u30fb\u672a\u53d6\u5f97\u6295\u8cc7\u8cc7\u683c'));
   assert.ok(html.includes('overflow-x-auto'));assert.ok(html.includes('<details'));
   for(const table of view.tables)for(const row of table.rows)for(const period of row.periods)assert.ok(html.includes(period));
   const privateValues=sql(`SELECT jsonb_build_array(a.controller_principal,a.work_owner,ar.payload->'observation',ra.reviewer_principal)::text FROM research_author_assignments_v2 a JOIN research_reviewer_assignments_v2 ra ON ra.author_assignment_id=a.assignment_id JOIN research_author_results_v2 ar ON ar.assignment_id=a.assignment_id LIMIT 1;`);
   for(const value of JSON.parse(privateValues)){const text=typeof value==='string'?value:JSON.stringify(value);assert.equal(html.includes(text),false);}
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/published-preview.html',html,{flag:'wx',mode:0o600});
   for(const bad of [`preview/research-working/${symbol}?researchCompanyId=${randomUUID()}`,
    `preview/research-working/${symbol==='2409'?'2383':'2409'}?researchCompanyId=${companyId}`,
    preview+'&extra=1',preview+'&researchCompanyId='+companyId]){
    const denied=await get(bad);assert.equal(denied.status,404);assert.equal((await denied.text()).includes('published-research-title'),false);
   }
   const draft=await get(`preview/research-working/${symbol}`);assert.equal(draft.status,200);assert.equal((await draft.text()).includes('published-research-title'),false);
   assert.equal(audit(),before);report.publicationHttp.compiledPreview=true;
  });
  await t.test('inbox HTTP withdrawal changes display state but retains original publication bytes, receipt and budget',async()=>{
   const revisedAt=new Date().toISOString();const response=await post('api/internal/research-inbox',{items:[{...item,observedAt:revisedAt,revisionObservedAt:revisedAt,retracted:true}]});assert.equal(response.status,200,await response.text());
   const before=audit(),{response:readResponse,body}=await publicationCall(publicationRead);assert.equal(readResponse.status,200,JSON.stringify(body));
   assert.equal(body.publication.researchState,'withdrawn');assert.deepEqual(body.publication.content,original.content);assert.deepEqual(body.publication.receipt,original.receipt);
   const page=await get(preview),html=await page.text();assert.equal(page.status,200);assert.ok(html.includes('published-research-title'));
   assert.ok(html.includes('\u4f86\u6e90\u5df2\u64a4\u56de\u30fb\u9700\u8981\u91cd\u65b0\u5be9\u67e5'));
   assert.equal(audit(),before);report.publicationHttp.withdrawalPreserved=true;
  });
 }});assert.ok(report.publicationHttp?.withdrawalPreserved);assert.ok(report.publicationHttp?.compiledPreview);
 }finally{globalThis.fetch=realFetch;}
});
