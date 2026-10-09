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
for(const symbol of ['2409','2383'])test(`compiled complete-input ${symbol}, synthetic job, actual fixed financial inputs`,{timeout:120000},async t=>{
 const realFetch=globalThis.fetch;globalThis.fetch=(url,options)=>{const action=typeof options?.body==='string'&&options.body.length?JSON.parse(options.body).action:undefined;return realFetch(url,action==='sealResearchInput'||action==='readResearchInputRevision'?{...options,headers:{...options.headers,'x-research-input-version':'2'}}:options);};
 try {const report=await verifyLocalInboxDataPlane({root,artifacts:process.env.RESEARCH_LOCAL_DATAPLANE_ARTIFACTS+'-'+symbol,pgBin:process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN,postgrestBin:process.env.RESEARCH_LOCAL_DATAPLANE_POSTGREST_BIN,observedPriority:true,observedClaim:true,testPgClockLibrary:process.env.STOCKINSIDER_TEST_PG_CLOCK_LIBRARY,check:(name,fn)=>t.test(name,fn),afterBaseline:async({post,sql,priorityRequest,report,restart,pgClock})=>{
  const prepared=prepareObservedRosterAdmission(roster),scope={scope:'research_observed_v1',snapshotHash:prepared.snapshotHash};
  let r=await post('api/internal/research-observed-roster',roster);assert.equal(r.status,200);
  const now=new Date(Date.now()-1000).toISOString();
  const item={sourcePlatform:'threads',sourceUrl:`https://example.invalid/synthetic-financial-http/${symbol}`,author:'synthetic fixture, not a publisher observation',publishedAt:now,observedAt:now,firstObservedAt:now,symbols:[symbol],shortSummary:'Synthetic company mention for isolated controller and financial calculator acceptance. Not a real source or an investment thesis.',catalyst:'No actual catalyst; developer fixture only.',risk:'No orders, qualification, or independent model execution.',claimStatus:'reported',visibility:'public',contentForm:'research_summary',acquisitionMethod:'public_document'};
  r=await post('api/internal/research-inbox',{items:[item]});assert.equal(r.status,200);const inbox=await r.json();assert.equal(inbox.accepted,1);const documentId=inbox.revisions[0].id;
  r=await post('api/internal/research-priority-run',{...priorityRequest,...scope,asOf:new Date().toISOString(),assessments:[{symbol,profitImpact:{level:0,reason:'合成隔離驗收，無真實獲利影響'},novelty:{level:0,reason:'合成隔離驗收，不是新催化'},researchability:{level:1,reason:'測試既有固定財務計算入口，不代表研究資格'},lane:'general',disposition:'queued',inProgress:false}]});const ranking=await r.json();assert.equal(r.status,200,JSON.stringify(ranking));assert.equal(ranking.newDeepResearchJobs,1);assert.equal(ranking.accountedCount,1978);
  const owner='synthetic-financial-http-owner';r=await post('api/internal/research-deep-job',{action:'claim',owner,...scope});const claimed=await r.json();assert.equal(r.status,200,JSON.stringify(claimed));assert.ok(claimed.context,'actual open-window reservation required');const context=claimed.context;
  const request={owner,...scope,jobId:context.job.jobId,attempt:context.job.attempt,reservationId:context.modelReservation.reservationId,bundleId:null,sourceDocumentIds:[documentId]};
  for(const name of ['20261009_research_publication_source_fence_v2.sql','20261009_research_input_preparations_v2.sql','20261009_research_input_preparation_assert_v2.sql','20261009_research_complete_input_v2.sql'])sql(fs.readFileSync(root+'/migrations/'+name,'utf8'));
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
  await t.test('guarded read and exact duplicate preserve original payload/hash/charge',async()=>{
   const count=sql('SELECT count(*),sum(logical_bytes) FROM research_article_input_revisions_v2;SELECT sum(reserved_seconds) FROM research_model_reservations_v1;');for(const action of ['readResearchInputRevision','sealResearchInput']){r=await post('api/internal/research-deep-job',{action,...input});const d=await r.json();assert.equal(r.status,200,JSON.stringify(d));assert.equal(d.revision.input_hash,sealed.input_hash);assert.deepEqual(d.revision.canonical_payload,sealed.canonical_payload);}assert.equal(sql('SELECT count(*),sum(logical_bytes) FROM research_article_input_revisions_v2;SELECT sum(reserved_seconds) FROM research_model_reservations_v1;'),count);
  });
  await t.test('anonymous, extra executable/body/clock and wrong original binding reject',async()=>{
   assert.equal((await post('api/internal/research-deep-job',{action:'sealResearchInput',...input},false)).status,401);
   for(const patch of [{command:'never-run'},{clock:new Date().toISOString()},{financial:{} }])assert.equal((await post('api/internal/research-deep-job',{action:'sealResearchInput',...input,...patch})).status,400);
   assert.equal((await post('api/internal/research-deep-job',{action:'sealResearchInput',...input,owner:'another-owner'})).status,409);
  });
  await t.test('actual restart reread persists and expired reservation refuses historical replay',async()=>{
   restart();for(let n=0;n<20;n++){r=await post('api/internal/research-deep-job',{action:'readResearchInputRevision',...input});if(r.status===200)break;await new Promise(resolve=>setTimeout(resolve,100));}assert.equal(r.status,200);assert.equal((await r.json()).revision.input_hash,sealed.input_hash);
   // Advance only this disposable PG clock; preserve append-only reservation and scoped completion guards.
   assert.ok(pgClock,'explicit reviewed isolated PG clock required');await pgClock.set('+1900');
   assert.equal((await post('api/internal/research-deep-job',{action:'readResearchInputRevision',...input})).status,409);assert.equal(sql('SELECT count(*) FROM research_article_input_revisions_v2;'),'1');
  });
 }});assert.ok(report.completeInputHttp);
 }finally{globalThis.fetch=realFetch;}
});
