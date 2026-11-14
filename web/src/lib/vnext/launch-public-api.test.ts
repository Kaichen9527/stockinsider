import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

function fixture(enabled=true,availability='ready',fail=false){
  const calls:unknown[]=[];
  const source=readFileSync(new URL('../../app/api/launch-ranking/route.ts',import.meta.url),'utf8');
  const compiled=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
  const isolated={exports:{} as Record<string,unknown>};
  vm.runInNewContext(compiled,{URL,module:isolated,exports:isolated.exports,require:(name:string)=>{
    if(name==='next/server')return {NextResponse:{json:(value:unknown,init:ResponseInit)=>new Response(JSON.stringify(value),init)}};
    if(name==='@/lib/vnext/launch-ranking-read')return {launchRankingEnabled:()=>enabled,readLaunchRankingSnapshot:async(query:unknown)=>{
      calls.push(query);if(fail)throw Error('SYNTHETIC_PRIVATE_SECRET');return {availability,reason:null,snapshot:null,current:[],detail:null,readAt:'2026-11-13T13:31:00Z'};}};
    throw Error('unexpected_api_dependency');}});
  const GET=isolated.exports.GET as (request:Request)=>Promise<Response>;
  return {calls,request:(query='')=>GET(new Request('http://127.0.0.1/api/launch-ranking'+query))};
}
test('actual public GET disabled or malformed/duplicate/unknown query performs zero reader work and never caches',async()=>{
  const disabled=fixture(false),response=await disabled.request('?symbol=5274');assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');assert.deepEqual(disabled.calls,[]);
  const f=fixture();
  for(const query of ['?url=https://www.investanchors.com/user/vip_contents/SYNTHETIC_ONLY','?symbol=5274&symbol=6488','?rankingRunId=bad','?symbol=00981A','?access_token=SYNTHETIC_ONLY']){
    const result=await f.request(query);assert.equal(result.status,400);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.text()).includes('SYNTHETIC_ONLY'),false);
  }
  assert.deepEqual(f.calls,[]);
});
test('actual public GET exposes only the shared readonly projection, distinct empty/missing states and safe failures',async()=>{
  const run='00000000-0000-4000-8000-000000000001';
  for(const [state,status] of [['ready',200],['not_published',200],['not_found',404],['producer_unavailable',503],['schema_unavailable',503],['unavailable',503]] as const){
    const f=fixture(true,state),result=await f.request(`?rankingRunId=${run}&symbol=5274`);
    assert.equal(result.status,status);assert.equal(result.headers.get('cache-control'),'no-store');assert.equal((await result.json()).result.availability,state);
    assert.deepEqual(JSON.parse(JSON.stringify(f.calls)),[{rankingRunId:run,symbol:'5274'}]);
  }
  const failure=fixture(true,'ready',true),result=await failure.request();assert.equal(result.status,503);assert.equal(result.headers.get('cache-control'),'no-store');
  assert.deepEqual(await result.json(),{ok:false,error:'launch_ranking_read_unavailable'});
});
