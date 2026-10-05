import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as evidence from '../../../../lib/research-discovery-evidence.ts';
import * as enrichment from '../../../../lib/research-discovery-price-enrichment.ts';
import * as priority from '../../../../lib/research-agent-priority.ts';
import * as roots from '../../../../lib/research-source-roots.ts';
import * as registry from '../../../../lib/research-source-registry.ts';
import * as qualification from '../../../../lib/research-agent-qualification.ts';

const source=readFileSync(new URL('./route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const cutoff='2026-10-02T08:00:00Z';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function harness(first:unknown[]=[]) {
  const calls:string[]=[];const inserts:Record<string,unknown>[]=[];
  const db={from(table:string){
    calls.push(table);let inserted=false;
    const data=table==='research_first_discoveries_v1' ? first : [];
    const query:Record<string,unknown>={then(resolve:(result:unknown)=>void){resolve({data,error:null});}};
    for(const method of ['select','lte','in','order','range','eq','abortSignal']) query[method]=()=>query;
    query.insert=(row:Record<string,unknown>)=>{assert.equal(table,'research_priority_runs_v1');inserted=true;inserts.push(row);return query;};
    query.single=async()=>({data:inserted ? {run_id:uuid(99)} : null,error:null});
    return query;
  },async rpc(name:string){
    calls.push(name);
    if(name==='candidate_research_stock_authority_page') return {data:[
      {symbol:'2409',stock_id:uuid(2409),exchange:'TWSE',sector:'display'},
      {symbol:'2410',stock_id:uuid(2410),exchange:'TWSE',sector:'display'}],error:null};
    if(name==='research_source_heads_page_v1') return {data:[],error:null};
    if(['enqueue_research_deep_jobs_v1','capture_research_first_discoveries_v1'].includes(name)) return {data:0,error:null};
    throw new Error(`unexpected test RPC ${name}`);
  }};
  const modules:Record<string,unknown>={
    'next/server':{NextResponse:{json:(body:unknown,init?:{status:number})=>({body,status:init?.status || 200})}},
    '@/lib/internal-auth':{requireExactInternalBearer:(request:Request)=>request.headers.get('authorization')==='Bearer synthetic-contract-only'
      && !request.headers.has('x-internal-key')},
    '@/lib/supabase-server':{getSupabaseServerClient:()=>{calls.push('getDB');return db;}},
    '@/lib/candidate-screened-universe':{loadPublishedCandidateSymbols:async()=>[]},
    '@/lib/research-agent-qualification':qualification,'@/lib/research-source-registry':registry,
    '@/lib/research-source-roots':roots,'@/lib/research-discovery-evidence':evidence,
    '@/lib/research-discovery-price-enrichment':enrichment,'@/lib/research-agent-priority':priority,
  };
  const exports:Record<string,unknown>={};
  vm.runInNewContext(compiled,{exports,require:(name:string)=>{
    assert.ok(name in modules,`unexpected module ${name}`);return modules[name];
  },Date,Map,Set,Array,Number,Object,String,Promise},{timeout:1000});
  return {post:exports.POST as (request:Request)=>Promise<{status:number;body:Record<string,unknown>}>,calls,inserts};
}
function request(body:unknown,authorized=true,extraHeaders:Record<string,string>={}) {
  return new Request('https://example.test/api/internal/research-priority-run',{method:'POST',
    headers:{'content-type':'application/json',...(authorized ? {authorization:'Bearer synthetic-contract-only'} : {}),...extraHeaders},
    body:JSON.stringify(body)});
}
const payload=()=>({asOf:cutoff,sourceAttempts:[],assessments:[]});
test('DR01 executable route rejects absent/non-exact bearer before any DB read',async()=>{
  for(const req of [request(payload(),false),request(payload(),true,{'x-internal-key':'synthetic-contract-only'})]) {
    const h=harness();const result=await h.post(req);
    assert.equal(result.status,401);assert.deepEqual(h.calls,[]);assert.equal(h.inserts.length,0);
  }
});
test('DR02 model/request supplied price contexts or arbitrary verified flags cannot enter server evidence',async()=>{
  const rated={level:0,reason:'synthetic unassessed research'};
  for(const body of [{...payload(),priceContext:{officialDatasetVerified:true}},
    {...payload(),assessments:[{symbol:'2409',profitImpact:rated,novelty:rated,researchability:rated,
      lane:'general',disposition:'needs_evidence',inProgress:false,officialDatasetVerified:true}]}]) {
    const h=harness();const result=await h.post(request(body));assert.equal(result.status,400);assert.deepEqual(h.calls,[]);
  }
});
test('DR03 route persists and returns every shadow context and hashes it while retaining existing queue',async()=>{
  const h=harness();const result=await h.post(request(payload()));
  assert.equal(result.status,200);assert.equal(result.body.expectedCount,2);assert.equal(result.body.accountedCount,2);
  const rows=h.inserts[0].rows as Array<{symbol:string;priceContext:{contextHash:string;missing:string[]}}>;
  assert.equal(JSON.stringify(rows.map((row)=>row.symbol)),JSON.stringify(['2409','2410']));
  assert.equal(rows.every((row)=>row.priceContext.missing.includes('discovery_evidence_missing')),true);
  const contexts=result.body.priceContexts as Array<{symbol:string;priceContext:unknown}>;
  assert.equal(contexts.length,rows.length);assert.equal(JSON.stringify(contexts.map((row)=>row.priceContext)),JSON.stringify(rows.map((row)=>row.priceContext)));
  assert.equal(result.body.inputHash,h.inserts[0].input_hash);
  assert.equal(JSON.stringify(result.body.queue),JSON.stringify(h.inserts[0].research_queue));
  assert.equal(h.calls.includes('capture_research_first_discoveries_v1'),true);
  assert.equal(h.calls.filter((name)=>name==='research_priority_runs_v1').length,1);
});
function first(close:number) {
  return [{symbol:'2409',run_id:uuid(1),first_seen_at:'2026-10-02T07:00:00Z',captured_at:'2026-10-02T07:30:00Z',
    snapshot:{price:{session:'2026-10-02',close,volume:100,sourceUrl:'https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2409',
      availableAt:'2026-10-02T06:00:00Z',priceBasis:'raw_exchange_quote'},pricePhase:'unknown'}}];
}
test('DR04 price evidence changes immutable input hash without changing score or Top20 queue',async()=>{
  const a=harness(first(100));const b=harness(first(101));
  const rated=(level:number)=>({level,reason:'independently reviewed synthetic ordinal'});
  const body={...payload(),assessments:['2409','2410'].map((symbol,i)=>({symbol,profitImpact:rated(3-i),
    novelty:rated(3-i),researchability:rated(3-i),lane:'general',disposition:'queued',inProgress:false}))};
  const before=await a.post(request(body));const after=await b.post(request(body));
  assert.equal(before.status,200);assert.equal(after.status,200);
  assert.notEqual(before.body.inputHash,after.body.inputHash);
  assert.equal((before.body.queue as unknown[]).length,2);
  assert.equal(JSON.stringify(before.body.queue),JSON.stringify(after.body.queue));
  const strip=(h:ReturnType<typeof harness>)=>(h.inserts[0].rows as Record<string,unknown>[]).map(({priceContext,...row})=>{void priceContext;return row;});
  assert.equal(JSON.stringify(strip(a)),JSON.stringify(strip(b)));
  assert.equal(a.calls.filter((name)=>name==='research_first_discoveries_v1').length,1);
  assert.equal(a.calls.some((name)=>name==='official_price_history'),false);
});
test('DR05 impossible cutoff rejects before any source or price acquisition',async()=>{
  const h=harness();const result=await h.post(request({...payload(),asOf:'2026-02-30T08:00:00Z'}));
  assert.equal(result.status,400);assert.deepEqual(h.calls,[]);
});
