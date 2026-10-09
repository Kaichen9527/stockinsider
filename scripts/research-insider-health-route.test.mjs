import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const ts=require('typescript');
function load(path,dependencyRequire=require){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:dependencyRequire,Request,Response,URL,Date,Set,process:{env:{}}});return exports;}
const health=load('web/src/lib/source-health.ts');
async function exercise(raw,authorized=true,body={connector:'twse_insider'}){
 const ledger=[];let releases=0,calls=0;
 const modules={
  'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
  '@/lib/internal-auth':{requireInternalAuth:()=>authorized?{ok:true,authSource:'synthetic-local-test'}:{ok:false,error:'unauthorized',status:401}},
  '@/lib/research-v2':{runSourceSync:async()=>{calls++;return {connector:'twse_insider',runId:'synthetic-run',dryRun:false,entityId:null,sessionMode:'not_applicable',...raw};}},
  '@/lib/source-policy':{sourceExecutionPolicy:()=>({disposition:'active',licenseBasis:'public_test',cadenceHours:24})},
  '@/lib/source-run-ledger':{nextExpectedAt:(clock,hours)=>new Date(Date.parse(clock)+hours*3600000).toISOString(),recordSourceRunLedger:async row=>ledger.push(row),syncSourceConnectorRegistry:async()=>{}},
  '@/lib/research-insider-snapshot':{validateInsiderSnapshotRequest:value=>value},
  '@/lib/source-batch':{},'@/lib/source-health':health,'@/lib/threads-token':{},
  '@/lib/production-write-lease':{acquireProductionWriteLease:async()=> 'synthetic-local-lease',releaseProductionWriteLease:async()=>{releases++;}},
 };
 const route=load('web/src/app/api/internal/source-sync/route.ts',id=>{assert.ok(Object.hasOwn(modules,id),`unmocked dependency ${id}`);return modules[id];});
 const response=await route.POST(new Request('http://localhost/api/internal/source-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
 return {status:response.status,body:await response.json(),ledger,releases,calls};
}
for(const duplicatesSkipped of [0,1501])test(`actual route rejects incomplete zero-new replay ${duplicatesSkipped}`,async()=>{
 const r=await exercise({recordsWritten:0,fetchedPosts:1501,duplicatesSkipped,degradedReason:'insider_bounded_response_pages_remaining'});
 assert.equal(r.status,502);assert.equal(r.body.ok,false);assert.equal(r.body.result.terminalReason,'partial');assert.equal(r.ledger[0].succeededAt,null);assert.equal(r.releases,1);
});
test('actual route rejects partial dataset failure with zero new documents',async()=>{
 const r=await exercise({recordsWritten:0,fetchedPosts:1,duplicatesSkipped:1,errorCode:'twse_insider_dataset_failures:1',degradedReason:'twse_insider_partial_schema_or_transport_failure'});
 assert.equal(r.status,502);assert.equal(r.ledger[0].succeededAt,null);assert.equal(r.body.result.terminalReason,'partial');
});
test('actual route keeps completed duplicate and empty results successful',async()=>{
 for(const raw of [{recordsWritten:0,fetchedPosts:1,duplicatesSkipped:1},{recordsWritten:0,fetchedPosts:0}]){
  const r=await exercise(raw);assert.equal(r.status,200);assert.ok(r.ledger[0].succeededAt);
 }
});
test('actual route authentication precedes collector and lease',async()=>{
 const r=await exercise({},false);assert.equal(r.status,401);assert.equal(r.calls,0);assert.equal(r.releases,0);assert.equal(r.ledger.length,0);
});

const snapshotRequest={connector:'twse_insider',insiderSnapshot:{runId:'11111111-1111-4111-8111-111111111111'}};
function progress({ageHours=1,live=false,complete=true}={}){return {schema:'insider_snapshot_progress_v1',runId:snapshotRequest.insiderSnapshot.runId,
 originalSourceObservedAt:new Date(Date.now()-ageHours*3600000).toISOString(),liveAcquisitions:live?[0,1,2,3,4]:[],outcome:complete?'coverage_complete':'pages_remaining'};}
test('cached complete yesterday remains stale502 and cannot renew succeededAt or next cadence',async()=>{
 const p=progress({ageHours:25});const r=await exercise({recordsWritten:0,fetchedPosts:0,metadata:{insider_snapshot:p}},true,snapshotRequest);
 assert.equal(r.status,502);assert.equal(r.body.result.degradedReason,'insider_snapshot_stale_refresh_pending');assert.equal(r.ledger[0].succeededAt,null);
 assert.equal(Date.parse(r.ledger[0].nextExpectedAt),Date.parse(p.originalSourceObservedAt)+24*3600000);assert.ok(Date.parse(r.ledger[0].nextExpectedAt)<Date.now());
});
test('fresh cached completion succeeds as processing without claiming a new live acquisition',async()=>{
 const p=progress();const r=await exercise({recordsWritten:0,fetchedPosts:0,metadata:{insider_snapshot:p}},true,snapshotRequest);
 assert.equal(r.status,200);assert.equal(r.ledger[0].succeededAt,null);assert.equal(Date.parse(r.ledger[0].nextExpectedAt),Date.parse(p.originalSourceObservedAt)+24*3600000);
});
test('live observation ledger uses original source clock rather than processing completion',async()=>{
 const p=progress({live:true});const r=await exercise({recordsWritten:1,fetchedPosts:1,metadata:{insider_snapshot:p}},true,snapshotRequest);
 assert.equal(r.status,200);assert.equal(r.ledger[0].succeededAt,p.originalSourceObservedAt);
});
test('explicit snapshot scope is closed before the write lease or collector',async()=>{
 for(const extra of [{connector:'all'},{symbol:'2330'},{dryRun:true},{unknown:1}]){const r=await exercise({},true,{...snapshotRequest,...extra});assert.equal(r.status,400);assert.equal(r.calls,0);assert.equal(r.releases,0);}
});
