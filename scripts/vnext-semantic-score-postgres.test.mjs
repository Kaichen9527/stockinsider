/** New retained-state SQL acceptance only. No old test entry, installer bundle,
 * real financial/model/semantic publication or production authority is implied. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {workerFixture,hash} from './vnext-worker-fixture.mjs';
import {deepFactors} from '../web/src/lib/vnext/factors.ts';
import {DEEP_WEIGHTS} from '../web/src/lib/vnext/policy.ts';
const candidate='migrations/20261022_vnext_semantic_score_fence_v1.sql';
const profile=JSON.parse(fs.readFileSync('scripts/opportunity-v3/vnext-semantic-score-profile-v1.json','utf8'));
const baselinePath='/tmp/stockinsider-vnext-oct22-private/ir-native-11-status-recovery-o23/final-state.json';
const baseline=fs.readFileSync(baselinePath);assert.equal(hash(baseline),'b8637ca706af165aaee3dce944e400b0c60aeb4f0a6b5b6a352053a18958ad19');
assert.equal(process.env.VNEXT_TEST_CONTAINER,'stockinsider-vnext-oct22-worker-11');
assert.equal(process.env.VNEXT_WORKER_SOCKET_PARENT,'/tmp/stockinsider-vnext-oct22-private/worker-pg-socket-11');
await test('new semantic score guard: retained lab catalog and immutable audit history',{timeout:90000},async t=>{
 const x=await workerFixture();const events=[];let before,functionsBefore;
 const step=async(name,work)=>{let failed=false;await t.test(name,async()=>{try{await work();}catch(error){failed=true;throw error;}});if(failed)throw Error('dependent_semantic_stage_failed');};
 const catalog=async()=>(await x.observer.query("SELECT p.oid,p.oid::regprocedure::text AS signature,to_jsonb(p)-'prosrc' AS metadata,encode(sha256(convert_to(p.prosrc,'UTF8')),'hex') AS body FROM pg_proc p WHERE p.pronamespace='public'::regnamespace ORDER BY p.oid")).rows;
 const sqlScore=async(input,role='stockinsider_vnext_owner',deny=false)=>{
  const c=await x.connect();try{assert.ok(['stockinsider_vnext_owner','service_role'].includes(role));await c.query('SET ROLE '+role);
   const ready=new Promise(resolve=>c.connection.once('readyForQuery',m=>resolve(m.status)));const [q,r]=await Promise.allSettled([c.query('SELECT public.vnext_deep_score_v1($1::jsonb) AS score',[JSON.stringify(input)]),ready]);
   assert.equal(r.status,'fulfilled');assert.equal(r.value,'I');events.push({role,pid:c.processID,ready:r.value,status:q.status,...(q.status==='rejected'?{code:q.reason.code,message:q.reason.message}:{inputHash:hash(JSON.stringify(input)),score:q.value.rows[0].score})});
   if(deny){assert.equal(q.status,'rejected');assert.equal(q.reason.code,'42501');return;}
   if(q.status==='rejected')throw q.reason;return q.value.rows[0].score;
  }finally{await x.close(c);}
 };
 const checks=keys=>({checks:keys.map(key=>({key,met:true,provenance:['synthetic-numeric-one-not-semantic-authority'],observedAt:'2026-10-21T06:00:00Z'}))});
 const unsupported={cutoff:'2026-10-21T08:00:00Z',valuation:{},profitabilityChecklist:checks(['margin_stable','cashflow_conversion','competitive_advantage','concentration_disclosed']),technicalChipsChecklist:{checks:[]},catalystChecklist:checks(['dated','verified','mechanism_documented','falsifier_defined']),marketLiquidityChecklist:checks(['market_known','liquidity_verified','trading_valid','risk_bound'])};
 try{
  await step('exact retained rows and original score body match; original SQL counts unsupported scalar checklists',async()=>{
   before=await x.snapshot();assert.deepEqual(before,JSON.parse(baseline));functionsBefore=await catalog();
   for(const target of profile.routines){const rows=functionsBefore.filter(f=>f.signature===''+target.signature.replace('public.',''));assert.equal(rows.length,1);assert.equal(rows[0].body,target.predecessorBodySha256);}
   const originalScore=await sqlScore(unsupported);assert.equal(originalScore.confirmedPoints,50);assert.equal(originalScore.availableWeight,50);
   x.save('original-score-probe',{scope:'actual original SQL with synthetic checklist scalar assertions, not valid semantic authority',originalScore,input:unsupported,baselinePath,baselineSha256:hash(baseline)});
  });
  await step('full new guarded candidate commits; only two prosrc change and every business row stays immutable',async()=>{
   const bytes=fs.readFileSync(candidate);assert.equal(hash(bytes),profile.migrationSha256);await x.writer.query(bytes.toString());assert.deepEqual(await x.snapshot(),before);
   const after=await catalog();assert.equal(after.length,functionsBefore.length);let changed=0;
   for(const old of functionsBefore){const now=after.find(f=>f.oid===old.oid);assert.ok(now);const target=profile.routines.find(f=>old.signature===f.signature.replace('public.',''));
    if(target){assert.deepEqual(now.metadata,old.metadata);assert.equal(now.body,target.successorBodySha256);changed++;}else assert.deepEqual(now,old);
   }
   assert.equal(changed,2);x.save('candidate-install',{path:candidate,bytes:bytes.length,sha256:hash(bytes),profile,beforeFunctions:functionsBefore,afterFunctions:after,wholeRowsUnchanged:true,onlyTwoBodiesChanged:true,scope:'actual retained-state full candidate COMMIT; not fresh complete bundle'});
  });
  await step('actual SQL leaves unsupported groups null, preserves weighted valuation/technical arithmetic and private ACL',async()=>{
   const absent=await sqlScore(unsupported);assert.equal(absent.confirmedPoints,0);assert.equal(absent.availableWeight,0);
   for(const key of ['profitability','catalysts','marketLiquidity'])assert.equal(absent.factors[key].value,null);
   const safe={...unsupported,valuation:{current:10,bear:8,base:15,bull:20,method:'forward_pe',quoteAt:'2026-10-21',valuationAt:'2026-10-21',provenance:['synthetic-fixed-valuation-input-not-real-source']},technicalChipsChecklist:checks(['trend_valid','volume_confirmed','institutional_confirmed','adjustment_verified'])};
   const actual=await sqlScore(safe);const expected=deepFactors({...safe,profitabilityChecklist:{checks:[]},catalystChecklist:{checks:[]},marketLiquidityChecklist:{checks:[]}});
   assert.equal(actual.availableWeight,50);assert.ok(Math.abs(actual.confirmedPoints-expected.confirmedPoints)<1e-8);for(const [key,weight] of Object.entries(DEEP_WEIGHTS)){assert.equal(actual.factors[key].weight,weight);if(expected.factors[key].value===null)assert.equal(actual.factors[key].value,null);else assert.ok(Math.abs(actual.factors[key].value-expected.factors[key].value)<1e-8);}
   await sqlScore(safe,'service_role',true);assert.deepEqual(await x.snapshot(),before);
   x.save('score-fence',{unsupported:absent,validSubset:actual,expectedJs:expected,serviceRolePrivateDenied:true,wholeRowsUnchanged:true,publicProjection:'actual installed two-target body pin; existing revoked publication remains source-fenced; no fabricated audit/publication rows'});
  });
  await step('installed first-only candidate rejects and explicit rollback leaves exact catalog and rows',async()=>{
   const original=await catalog();const ready=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));
   const [q,r]=await Promise.allSettled([x.writer.query(fs.readFileSync(candidate,'utf8')),ready]);assert.equal(q.status,'rejected');assert.equal(q.reason.code,'P0001');assert.match(q.reason.message,/vnext_semantic_.*predecessor/u);assert.equal(r.status,'fulfilled');assert.equal(r.value,'E');
   const rollReady=new Promise(resolve=>x.writer.connection.once('readyForQuery',m=>resolve(m.status)));await x.writer.query('ROLLBACK');assert.equal(await rollReady,'I');assert.deepEqual(await catalog(),original);assert.deepEqual(await x.snapshot(),before);
   x.save('installed-repeat',{code:q.reason.code,message:q.reason.message,ready:r.value,rollbackReady:'I',wholeRowsAndCatalogUnchanged:true});
  });
 }finally{x.save('semantic-query-events',events);await x.finish();}
});
