import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { launchIndexMonthResources, parseLaunchIndexBackfillPlan } from './launch-index-backfill.ts';

const id='00000000-0000-4000-8000-000000000001';
function plan(){return {schemaVersion:'licensed-launch-csv-plan-v3',status:'planned',reason:null,jobs:72,session:'2026-11-13',
 plannedAt:'2026-11-15T01:00:00Z',scope:'history_only',currentPlanStatus:'deferred',currentReason:'awaiting_current_completed_session',
 indexResources:72,skippedIndexResources:0,sourceAuthority:false,calendarAuthority:false};}
test('36 monthly resources include through month and known27-month control window, never assert520 sessions',()=>{
 const resources=launchIndexMonthResources('2026-11-13');assert.equal(resources.length,36);assert.equal(new Set(resources).size,36);
 assert.equal(resources[0],'2026-11');assert.equal(resources.at(-1),'2023-12');assert.equal(resources.indexOf('2024-09'),26);
 assert.equal(launchIndexMonthResources('2026-01-31')[1],'2025-12');
 for(const bad of ['2026-02-30','2026-13-01','2026-1-01'])assert.throws(()=>launchIndexMonthResources(bad));
});
test('closed v3 distinguishes planned, all-acquired, no-pool and no-completed without changing current deferral',()=>{
 assert.equal(parseLaunchIndexBackfillPlan(plan()).scope,'history_only');
 assert.equal(parseLaunchIndexBackfillPlan({...plan(),status:'already_acquired',jobs:0,skippedIndexResources:72}).status,'already_acquired');
 for(const status of ['deferred','no_active_pool']){
  const missing=status==='deferred';
  assert.equal(parseLaunchIndexBackfillPlan({...plan(),status,reason:missing?'completed_session_unavailable':null,jobs:0,session:null,scope:null,
   currentPlanStatus:missing?'deferred':'no_active_pool',currentReason:missing?'awaiting_current_completed_session':null,indexResources:0,skippedIndexResources:0}).status,status);
 }
 assert.equal(parseLaunchIndexBackfillPlan({...plan(),jobs:171,scope:'current_and_history',currentPlanStatus:'planned',currentReason:null}).jobs,171);
});
test('close job count extends the existing current plan and preserves both licensed budgets',()=>{
 const current={...plan(),scope:'current_and_history',currentPlanStatus:'planned',currentReason:null};
 assert.equal(parseLaunchIndexBackfillPlan({...current,jobs:176}).jobs,176);
 assert.equal(parseLaunchIndexBackfillPlan({...current,jobs:200,twseCloseJobs:24}).twseCloseJobs,24);
 assert.equal(parseLaunchIndexBackfillPlan({...current,jobs:102,twseCloseJobs:30}).twseCloseJobs,30);
 for(const invalid of [{...current,jobs:71,twseCloseJobs:1},{...current,jobs:103,twseCloseJobs:31},{...current,twseCloseJobs:0},
  {...current,twseCloseJobs:null},{...current,jobs:201,twseCloseJobs:25},{...plan(),jobs:73,twseCloseJobs:1}])
  assert.throws(()=>parseLaunchIndexBackfillPlan(invalid),/plan_unavailable/u);
});
test('wire tampering, planned0, stale status conflation, clocks and caller hooks are closed',()=>{
 let hooks=0;const accessor={...plan()};Object.defineProperty(accessor,'jobs',{get(){hooks++;return 72;},enumerable:true});
 for(const bad of [{...plan(),jobs:201},{...plan(),jobs:0},{...plan(),jobs:73},
  {...plan(),jobs:177,scope:'current_and_history',currentPlanStatus:'planned',currentReason:null},{...plan(),indexResources:71},{...plan(),calendarAuthority:true},
  {...plan(),status:'already_acquired',jobs:0,skippedIndexResources:71},{...plan(),currentPlanStatus:'planned'},
  {...plan(),session:'2026-11-16'},{...plan(),plannedAt:'invalid'},{...plan(),sourceUrl:'https://example.invalid'},accessor,new Proxy(plan(),{})])
  assert.throws(()=>parseLaunchIndexBackfillPlan(bad),/plan_unavailable/u);
 assert.equal(hooks,0);
});
/** Actual existing prepareLaunchSources/production seam, with no real runtime,
 * provider, private store, environment or DB access. */
async function prepareFixture(mode='enabled'){
 const source=await readFile(new URL('./launch-source-store.ts',import.meta.url),'utf8'),events:string[]=[],calls:unknown[]=[];
 const stubs:Record<string,unknown>={
  'node:crypto':{},'./auth.ts':{},'./launch-official-replay.ts':{},'./launch-native-volume.ts':{},'./launch-institutional-volume.ts':{},
  './launch-market-foreign-flow.ts':{},'./launch-breadth-replay.ts':{},'./evidence-clock.ts':{},'./policy.ts':{vnextEnabled:()=>true},'./launch-index-backfill.ts':{parseLaunchIndexBackfillPlan},
  '../taiwan-data-runtime.ts':{requireActiveVpsWriter:async()=>{events.push('writer');return {ok:true,supabase:{rpc:async(name:string,body:unknown)=>{
   events.push('rpc');calls.push({name,body});return {data:mode==='invalid'?{...plan(),jobs:201}:plan(),error:mode==='missing'?{code:'uninstalled'}:null};}}};}},
  '../data-plane-runtime.ts':{stockInsiderDataPlaneMode:()=> 'contabo'},
  '../private-artifact-store.ts':{privateArtifactStore:()=>({put:()=>{throw Error('unexpected artifact');}})},
  '../production-write-lease.ts':{acquireProductionWriteLease:async()=>{events.push('acquire');return mode==='busy'?null:id;},
   releaseProductionWriteLease:async(owner:string)=>{assert.equal(owner,id);events.push('release');}},
 };
 const isolatedModule:{exports:Record<string,unknown>}={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:isolatedModule,exports:isolatedModule.exports,require:(name:string)=>{assert.ok(Object.hasOwn(stubs,name),name);return stubs[name];},
   process:{env:{STOCKINSIDER_VNEXT_LAUNCH_SOURCES_ENABLED:mode==='disabled'?'false':'true',STOCKINSIDER_PRIVATE_ARTIFACT_ROOT:'SYNTHETIC_PRIVATE_ROOT'}},
   Buffer,Object,Date,Error,Number,Promise});
 const prepare=isolatedModule.exports.prepareLaunchSources as (identity:unknown)=>Promise<unknown>;
 return {events,calls,invoke:()=>prepare({role:mode==='unauthorized'?'reader':'operator',principal:'SYNTHETIC_OPERATOR'})};
}
test('actual prepare caller uses new guarded RPC under existing feature fence, with no oldplan fallback or source fetch',async()=>{
 const f=await prepareFixture();assert.deepEqual(await f.invoke(),parseLaunchIndexBackfillPlan(plan()));
 assert.deepEqual(f.events,['writer','acquire','rpc','release']);
 assert.equal(JSON.stringify(f.calls),JSON.stringify([{name:'vnext_launch_csv_backfill_plan_v1',body:{p_principal:'SYNTHETIC_OPERATOR',p_lease_owner:id}}]));
 const off=await prepareFixture('disabled');assert.equal(JSON.stringify(await off.invoke()),JSON.stringify({status:'disabled',sourceAuthority:false}));assert.deepEqual(off.events,[]);
});
test('uninstalled/newinvalid/unauthorized/busy paths never fallback and release only their own acquired lease',async()=>{
 for(const mode of ['missing','invalid','unauthorized','busy']){
  const f=await prepareFixture(mode);await assert.rejects(f.invoke);
  assert.equal(f.calls.length,mode==='missing'||mode==='invalid'?1:0);
  if(mode==='missing'||mode==='invalid')assert.equal(f.events.at(-1),'release');
  else assert.equal(f.events.includes('release'),false);
 }
});
