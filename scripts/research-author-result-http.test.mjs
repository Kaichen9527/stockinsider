import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {financialInstant} from '../web/src/lib/research-financial-clock.ts';
import {completeHash} from '../web/src/lib/research-complete-canonical.ts';
import {verifyLocalInboxDataPlane} from '../scripts/research-local-inbox-dataplane.mjs';
import {prepareObservedRosterAdmission} from '../web/src/lib/research-observed-roster.ts';
import {readAfterResearchReadiness} from './research-author-result-http-readiness.mjs';
import {authorResultFixture} from './research-author-result-fixture.mjs';
const root=process.cwd();
const read=f=>JSON.parse(fs.readFileSync(root+'/docs/research/2026-10-08-discovery-live/'+f,'utf8'));
const roster={legacyClassification:read('observed-security-classification.json'),securityScope:read('official-security-scope-reconciliation.json')};
// Synthetic inbox and model owner are development fixtures. Only the fixed
// calculator's Git relay inputs are actual attributed public financial data.
const mapping=JSON.parse(fs.readFileSync(root+'/web/src/lib/research-complete-mapping.json'));
for(const symbol of ['2409','2383'])test(`compiled private author result ${symbol}, synthetic job, actual fixed financial inputs`,{timeout:120000},async t=>{
 const realFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const action=typeof options?.body==='string'&&options.body.length?JSON.parse(options.body).action:undefined;return realFetch(url,action==='sealResearchInput'||action==='readResearchInputRevision'?{...options,headers:{...options.headers,'x-research-input-version':'2'}}:action==='receiveAuthorResult'||action==='readAuthorResult'?{...options,headers:{...options.headers,'x-research-execution-version':'2','x-research-author-result-action':action}}:action==='assignAuthor'||action==='readAuthorAssignment'||action==='readAuthorPacket'?{...options,headers:{...options.headers,'x-research-execution-version':'2'}}:options);};
 try {const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedPriority:true,observedClaim:true,researchControllers:true,testPgClockLibrary:process.env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY,check:(name,fn)=>t.test(name,fn),afterBaseline:async({post,rpc,sql,priorityRequest,report,restart})=>{
  const prepared=prepareObservedRosterAdmission(roster),scope={scope:'research_observed_v1',snapshotHash:prepared.snapshotHash};
  let r=await post('api/internal/research-observed-roster',roster);assert.equal(r.status,200);
  const now=new Date(Date.now()-1000).toISOString();
  const item={sourcePlatform:'threads',sourceUrl:`https://example.invalid/synthetic-financial-http/${symbol}`,author:'synthetic fixture, not a publisher observation',publishedAt:now,observedAt:now,firstObservedAt:now,symbols:[symbol],shortSummary:'Synthetic company mention for isolated controller and financial calculator acceptance. Not a real source or an investment thesis.',catalyst:'No actual catalyst; developer fixture only.',risk:'No orders, qualification, or independent model execution.',claimStatus:'reported',visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'};
  r=await post('api/internal/research-inbox',{items:[item]});assert.equal(r.status,200);const inbox=await r.json();assert.equal(inbox.accepted,1);const documentId=inbox.revisions[0].id;
  r=await post('api/internal/research-priority-run',{...priorityRequest,...scope,asOf:new Date().toISOString(),assessments:[{symbol,profitImpact:{level:0,reason:'合成隔離驗收，無真實獲利影響'},novelty:{level:0,reason:'合成隔離驗收，不是新催化'},researchability:{level:1,reason:'測試既有固定財務計算入口，不代表研究資格'},lane:'general',disposition:'queued',inProgress:false}]});const ranking=await r.json();assert.equal(r.status,200,JSON.stringify(ranking));assert.equal(ranking.newDeepResearchJobs,1);assert.equal(ranking.accountedCount,1978);
  const owner='synthetic-financial-http-owner';r=await post('api/internal/research-deep-job',{action:'claim',owner,...scope});const claimed=await r.json();assert.equal(r.status,200,JSON.stringify(claimed));assert.ok(claimed.context,'actual open-window reservation required');const context=claimed.context;
  const request={owner,...scope,jobId:context.job.jobId,attempt:context.job.attempt,reservationId:context.modelReservation.reservationId,bundleId:null,sourceDocumentIds:[documentId]};
  for(const name of ['20261009_research_publication_source_fence_v2.sql','20261009_research_input_preparations_v2.sql','20261009_research_input_preparation_assert_v2.sql','20261009_research_complete_input_v2.sql','20261009_research_author_assignments_v2.sql','20261009_research_author_packet_v2.sql','20261009_research_author_results_v2.sql'])sql(fs.readFileSync(root+'/migrations/'+name,'utf8'));
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
  const assignmentRequest={action:'assignAuthor',input,inputRevisionId:sealed.revision_id,inputHash:sealed.input_hash};
  const packetRequest={...assignmentRequest,action:'readAuthorPacket'};
  const tables=['research_author_results_v2','source_raw_documents','research_source_seals_v2','research_source_seal_invalidations_v2','research_input_preparations_v2','research_article_input_revisions_v2','research_author_assignments_v2','research_deep_jobs_v1','research_deep_job_attempts_v1','research_model_reservations_v1','research_model_completions_v1','stocks','stock_instruments_v3'];
  const q=value=>"'"+String(value).replaceAll("'","''")+"'";
  const audit=()=>sql(`SELECT jsonb_build_object(${tables.map(name=>`${q(name)},(SELECT jsonb_build_object('count',count(*),'rowHash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex')) FROM ${name} x)`).join(',')},'logicalCharge',(SELECT coalesce(sum(logical_bytes),0) FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) x));`);
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
  await t.test('synthetic controller observation and prose, actual fixed financial recalculation, one immutable private result',async()=>{
   fixture=authorResultFixture(resultIdentity,sealed,packetResponse.packet);const before=JSON.parse(audit());
   const response=await post('api/internal/research-model-reservation',fixture.request),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));responseResult=body;savedResult=body.result;
   assert.equal(savedResult.result_hash,completeHash(savedResult.payload));assert.deepEqual(savedResult.payload.rawArticle,fixture.request.article);assert.deepEqual(savedResult.payload.validatedArticle.calculation,sealed.canonical_payload.financial.material.calculation);assert.equal(savedResult.payload.observation.modelIdentity,null);
   for(const key of ['financialVerified','publishableResearch','researchQualified','strategyApproved','entryEligible'])assert.equal(savedResult.payload.validatedArticle[key],false);
   assert.equal(body.controllerReportOnly,true);assert.equal(body.modelDispatched,false);assert.equal(body.dispatchReady,false);assert.equal(body.publishableResearch,false);
   const after=JSON.parse(audit());assert.equal(after.research_author_results_v2.count,1);delete before.research_author_results_v2;delete after.research_author_results_v2;assert.deepEqual(after,before);
   fs.writeFileSync(process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol+'/author-result-response.json',JSON.stringify(body),{flag:'wx',mode:0o600});
   report.authorResultHttp={symbol,resultHash:savedResult.result_hash,logicalBytes:savedResult.logical_bytes,receivedAt:savedResult.received_at,responseBytes:Buffer.byteLength(JSON.stringify(body)),syntheticObservationAndProse:true,actualFixedFinancialCalculation:true,actualModelDispatched:false,formalPublication:false,stateAuditBefore:JSON.parse(audit()),stateAuditAfter:JSON.parse(audit())};
  });
  await t.test('changed article or observation single-shot rejected without modifying private draft',async()=>{
   const before=audit();for(const change of [v=>v.article.summary.text+='更改',v=>v.observation.outputHash='f'.repeat(64),v=>v.observation.controllerObservedEndAt='2099-01-01T00:00:00Z']){const bad=structuredClone(fixture.request);change(bad);const response=await post('api/internal/research-model-reservation',bad),body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_result_unavailable');assert.equal(body.retryClaim,false);}assert.equal(audit(),before);
  });
  await t.test('result exact read/reception replay and actual PG restart preserve full hash/clock/bytes and budget',async()=>{
   const before=audit();for(const req of [resultIdentity,fixture.request,resultIdentity]){const response=await post('api/internal/research-model-reservation',req),body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,responseResult);}restart();
   const response=await readAfterResearchReadiness(()=>rpc('candidate_research_stock_authority_page',{p_cutoff:priorityRequest.asOf,p_page_offset:0,p_page_limit:500}),()=>post('api/internal/research-model-reservation',resultIdentity),{name:'candidate_research_stock_authority_page',attempts,ready:x=>x.status===200&&Array.isArray(x.body)&&x.body.length===0});const body=await response.json();assert.equal(response.status,200,JSON.stringify(body));assert.deepEqual(body,responseResult);assert.equal(audit(),before);report.authorResultHttp.restartReadPreserved=true;report.authorResultHttp.stateAuditAfter=JSON.parse(audit());
  });
  await t.test('guarded source withdrawal rejects original packet and preserves sealed input/assignment/source bytes',async()=>{
   const original=sql(`SELECT to_jsonb(s)::text FROM source_raw_documents s WHERE id=${q(documentId)};`);
   const before=JSON.parse(audit()),revisedAt=new Date().toISOString();const withdrawal=await post('api/internal/research-inbox',{items:[{...item,observedAt:revisedAt,revisionObservedAt:revisedAt,retracted:true}]});const result=await withdrawal.json();assert.equal(withdrawal.status,200,JSON.stringify(result));assert.equal(result.accepted,1);assert.notEqual(result.revisions[0].id,documentId);assert.equal(sql(`SELECT to_jsonb(s)::text FROM source_raw_documents s WHERE id=${q(documentId)};`),original);
   const afterWithdrawal=audit();const response=await post('api/internal/research-model-reservation',packetRequest);const body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_packet_unavailable');assert.equal(body.retryClaim,false);assert.equal(audit(),afterWithdrawal);
   const after=JSON.parse(afterWithdrawal);for(const table of ['research_input_preparations_v2','research_article_input_revisions_v2','research_author_assignments_v2','research_author_results_v2','research_model_reservations_v1','research_model_completions_v1','stocks','stock_instruments_v3'])assert.deepEqual(after[table],before[table]);assert.equal(after.logicalCharge,before.logicalCharge);report.authorPacketWithdrawal={before,afterWithdrawal:after,afterRead:JSON.parse(audit()),originalSourceUnchanged:true,acceptedNewRevision:1,packetHttpStatus:response.status};
  });
  await t.test('withdrawal rejects result read and receive replay, preserves complete private draft and all charges',async()=>{
   const before=audit();for(const req of [resultIdentity,fixture.request]){const response=await post('api/internal/research-model-reservation',req),body=await response.json();assert.equal(response.status,409,JSON.stringify(body));assert.equal(body.error,'research_author_result_unavailable');assert.equal(body.retryClaim,false);}assert.equal(audit(),before);report.authorResultHttp.withdrawalRejectedWithDraftPreserved=true;report.authorResultHttp.afterWithdrawalAudit=JSON.parse(audit());
  });
 }});assert.ok(report.authorResultHttp);assert.ok(report.completeInputHttp);assert.ok(report.authorPacketHttp);
 }finally{globalThis.fetch=realFetch;}
});
