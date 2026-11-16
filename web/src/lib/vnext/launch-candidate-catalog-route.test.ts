import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {LAUNCH_CANDIDATE_FIXTURE,launchCandidateQuery,launchCandidateFixturePage,readLaunchCandidateCatalog,type LaunchCandidateQuery} from './launch-candidate-catalog.ts';
import {EPOCH_FIXTURE_SCHEMA,type CandidateEpochEvent} from './candidate-epoch-journal.ts';
import {POLICY} from './policy.ts';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cutoff='2026-11-14T13:30:00Z',now='2026-11-14T13:31:00Z';
function synthetic(){
 const clues=Array.from({length:21},(_,i)=>({id:id(100+i),symbol:String(2300+i),eventAt:'2026-11-13T01:00:00Z',availableAt:'2026-11-13T02:00:00Z',source:'synthetic_original_mention',industrySnapshot:null,
  publication:{kind:'synthetic_public_metadata_fixture',bindingId:id(300+i)}}));
 const events:CandidateEpochEvent[]=clues.slice(0,20).map((c,i)=>({eventId:id(i+1),symbol:c.symbol,sequence:'1',previousEventId:null,epochId:id(i+1),epochStartedAt:'2026-11-13T03:00:00Z',kind:'admitted',state:'researching',reasonCode:'admitted',causePath:'core.enqueue.admitted',occurredAt:'2026-11-13T03:00:00Z',recordedAt:'2026-11-13T03:00:00Z',publicationRevisionId:null}));
 return {schemaVersion:LAUNCH_CANDIDATE_FIXTURE,scope:'synthetic_only',catalogId:id(900),cutoff,coverage:{sourceComplete:false,membershipComplete:false,sourceFrom:null,membershipFrom:null,preActivationHistory:'unavailable'},clues,
  membership:{schemaVersion:EPOCH_FIXTURE_SCHEMA,policyVersion:POLICY.version,cutoff,coverage:{complete:false,preActivationHistory:'unavailable'},activation:'disabled_not_connected',events}};
}
/** Compile the actual route with an injected read adapter. */
function actualRoute(reader:(query:LaunchCandidateQuery)=>unknown=readLaunchCandidateCatalog){
 const source=fs.readFileSync(new URL('../../app/api/launch/candidates/route.ts',import.meta.url),'utf8');
 const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}});
 const isolatedModule={exports:{} as {GET:(request:Request)=>Promise<Response>}};let reads=0;
 const run=vm.runInNewContext(`(function(require,module,exports){${compiled.outputText}\n})`,{URL,Response,process:{env:{STOCKINSIDER_LAUNCH_CANDIDATES_ENABLED:'true',LAUNCH_CANDIDATE_FIXTURE:'true'}}},{timeout:1000}) as (r:(n:string)=>unknown,m:typeof isolatedModule,e:typeof isolatedModule.exports)=>void;
 run(name=>{
  if(name==='next/server')return {NextResponse:{json:(body:unknown,init:ResponseInit)=>new Response(JSON.stringify(body),{...init,headers:{...init.headers,'content-type':'application/json'}})}};
  if(name==='@/lib/vnext/launch-candidate-catalog')return {launchCandidateQuery,readLaunchCandidateCatalog:(q:LaunchCandidateQuery)=>{reads++;return reader(q);}};
  throw Error('unexpected_route_dependency');
 },isolatedModule,isolatedModule.exports);
 return {reads:()=>reads,get:(q='')=>isolatedModule.exports.GET(new Request(`http://127.0.0.1/api/launch/candidates${q?'?'+q:''}`))};
}
test('actual public route refuses missing saved launch data and fixture or write parameters',async()=>{
 const route=actualRoute();const response=await route.get();assert.equal(response.status,503);assert.equal(response.headers.get('cache-control'),'no-store');
 const body=await response.json();assert.equal(body.result.availability,'producer_unavailable');assert.equal(body.result.activation,'disabled_not_connected');assert.deepEqual(body.result.rows,[]);
 assert.equal(body.result.coverage.sourceComplete,false);assert.equal(body.result.publicationAuthority,false);assert.equal(route.reads(),1);
 for(const q of ['mode=fixture','url=https%3A%2F%2Fprivate.invalid','source=a&source=b','status=never_admitted'])assert.equal((await route.get(q)).status,400);
 assert.equal(route.reads(),1,'malformed queries must not reach even the disabled read boundary');
});
test('ACTUAL HTTProute plusACTUALqueryengine projects21 syntheticmentions/20admissions andpinsoldpage whilenewcatalogarrives',async()=>{
 const old=synthetic(),newer=synthetic();newer.catalogId=id(901);newer.clues.push({...newer.clues[0],id:id(999),symbol:'9999'});
 let latest=old;const route=actualRoute(q=>{const packet=q.catalogId===old.catalogId?old:latest;return launchCandidateFixturePage(packet,q,{catalogId:packet.catalogId,checkedAt:now,withdrawnClueIds:[]},now);});
 const firstResponse=await route.get(`catalogId=${old.catalogId}&limit=20`);assert.equal(firstResponse.status,200);const first=(await firstResponse.json()).result;assert.equal(first.rows.length,20);assert.ok(first.nextCursor);
 latest=newer;
 const secondResponse=await route.get(`catalogId=${old.catalogId}&limit=20&cursor=${first.nextCursor}`);assert.equal(secondResponse.status,200);const second=(await secondResponse.json()).result;
 assert.equal(second.rows.length,1);assert.equal(second.rows[0].symbol,'2320');assert.equal(second.rows[0].admission.kind,'admission_history_unknown');assert.equal(second.scope,'synthetic_projection_only');assert.equal(second.sourceAuthority,false);
 assert.equal((await route.get(`limit=20&cursor=${first.nextCursor}`)).status,400,'a changed latest packet cannot silently replace the cursor catalog');
 const history=await(await route.get(`catalogId=${old.catalogId}&status=admission_history_unknown`)).json();assert.equal(history.result.rows.length,1);
});
test('ACTUAL controlledHTTP withdrawalkeepsstableposition withno privateidentity andrefusesallfilteredrequests',async()=>{
 const p=synthetic();let withdrawn:string[]=[];
 const route=actualRoute(q=>launchCandidateFixturePage(p,q,{catalogId:p.catalogId,checkedAt:now,withdrawnClueIds:withdrawn},now));
 const first=(await(await route.get('limit=20')).json()).result;withdrawn=[p.clues[20].id];
 const second=(await(await route.get(`limit=20&cursor=${first.nextCursor}`)).json()).result;
 assert.deepEqual(second.rows,[{position:21,state:'redacted'}]);assert.equal(second.nextCursor,null);
 for(const filter of ['source=synthetic_original_mention','source=does_not_match','date=2020-01-01','status=recorded_active_epoch']){
  const response=await route.get(filter);assert.equal(response.status,503);const result=(await response.json()).result;
  assert.equal(result.availability,'filtered_projection_unavailable');assert.deepEqual(result.rows,[]);assert.equal(result.nextCursor,null);
 }
});
