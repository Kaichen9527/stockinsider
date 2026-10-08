import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
const require=createRequire(new URL('../web/package.json',import.meta.url));
const ts=require('typescript');
function load(path,dependencyRequire=require){const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(path,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:dependencyRequire,Request,Response,URL,Date,Set,process:{env:{}}});return exports;}
const health=load('web/src/lib/source-health.ts');
async function exercise(raw,authorized=true){
 const ledger=[];let releases=0,calls=0;
 const modules={
  'next/server':{NextResponse:{json:(value,init)=>Response.json(value,init)}},
  '@/lib/internal-auth':{requireInternalAuth:()=>authorized?{ok:true,authSource:'synthetic-local-test'}:{ok:false,error:'unauthorized',status:401}},
  '@/lib/research-v2':{runSourceSync:async()=>{calls++;return {connector:'twse_insider',runId:'synthetic-run',dryRun:false,entityId:null,sessionMode:'not_applicable',...raw};}},
  '@/lib/source-policy':{sourceExecutionPolicy:()=>({disposition:'active',licenseBasis:'public_test',cadenceHours:24})},
  '@/lib/source-run-ledger':{nextExpectedAt:()=>null,recordSourceRunLedger:async row=>ledger.push(row),syncSourceConnectorRegistry:async()=>{}},
  '@/lib/source-batch':{},'@/lib/source-health':health,'@/lib/threads-token':{},
  '@/lib/production-write-lease':{acquireProductionWriteLease:async()=> 'synthetic-local-lease',releaseProductionWriteLease:async()=>{releases++;}},
 };
 const route=load('web/src/app/api/internal/source-sync/route.ts',id=>{assert.ok(Object.hasOwn(modules,id),`unmocked dependency ${id}`);return modules[id];});
 const response=await route.POST(new Request('http://localhost/api/internal/source-sync',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({connector:'twse_insider'})}));
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
