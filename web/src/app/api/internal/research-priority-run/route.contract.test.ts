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
import * as association from '../../../../lib/research-source-association.ts';
import { buildResearchInboxRow } from '../../../../lib/research-inbox.ts';

const source=readFileSync(new URL('./route.ts',import.meta.url),'utf8');
const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
const cutoff='2026-10-02T08:00:00Z';
const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
type TestRow=Record<string,unknown>;
const clock='2026-10-05T09:00:00Z';
class ServerDate extends Date {
  constructor(value: string | number = clock) { super(value); }
  static now() {return Date.parse(clock);}
}
function harness(first:unknown[]=[], config:{roster?:TestRow[];tables?:Record<string,TestRow[]>;sourceHeads?:TestRow[];
  evidenceHeads?:TestRow[];failTable?:string;storeError?:boolean}={}) {
  const calls:string[]=[];const inserts:Record<string,unknown>[]=[];const quoteStockIds:string[]=[];
  const db={from(table:string){
    calls.push(table);let inserted=false;
    let low=0;let high=Infinity;
    const data=(table==='research_first_discoveries_v1' ? first : config.tables?.[table] || []) as TestRow[];
    const filters:Array<(row:TestRow)=>boolean>=[];const orders:Array<{key:string;ascending:boolean}>=[];
    const compare=(a:unknown,b:unknown)=>{
      const ta=typeof a==='string' && a.includes('T') ? Date.parse(a) : NaN;
      const tb=typeof b==='string' && b.includes('T') ? Date.parse(b) : NaN;
      return Number.isFinite(ta) && Number.isFinite(tb) ? ta-tb : String(a).localeCompare(String(b));
    };
    const query:Record<string,unknown>={then(resolve:(result:unknown)=>void){
      const rows=data.filter((row)=>filters.every((filter)=>filter(row))).sort((a,b)=>{
        for(const order of orders){const diff=compare(a[order.key],b[order.key]);if(diff) return order.ascending ? diff : -diff;}return 0;
      }).slice(low,high+1);resolve({data:rows,error:config.failTable===table ? {message:'private DB diagnostic password=do-not-export'} : null});
    }};
    for(const method of ['select','lte','in','order','range','eq','abortSignal','limit']) query[method]=(...args:unknown[])=>{
      if(method==='eq') filters.push((row)=>compare(row[String(args[0])],args[1])===0);
      if(method==='eq' && table==='official_price_history' && args[0]==='stock_id') quoteStockIds.push(String(args[1]));
      if(method==='lte') filters.push((row)=>compare(row[String(args[0])],args[1])<=0);
      if(method==='in') filters.push((row)=>(args[1] as unknown[]).includes(row[String(args[0])]));
      if(method==='order') orders.push({key:String(args[0]),ascending:(args[1] as {ascending?:boolean})?.ascending!==false});
      if(method==='range'){low=Number(args[0]);high=Number(args[1]);}
      if(method==='limit') high=Number(args[0])-1;return query;
    };
    query.or=(filter:string)=>{
      const parts=/^metadata->>canonical_url\.eq\.("(?:\\.|[^"\\])*"),and\(metadata->>canonical_url\.is\.null,document_url\.match\.("(?:\\.|[^"\\])*")\)$/u.exec(filter);
      assert.ok(parts);const root=JSON.parse(parts[1]);const pattern=new RegExp(JSON.parse(parts[2]));
      filters.push((row)=>(row.metadata as TestRow)?.canonical_url===root || (row.metadata as TestRow)?.canonical_url==null && pattern.test(String(row.document_url)));
      return query;
    };
    query.insert=(row:Record<string,unknown>)=>{assert.equal(table,'research_priority_runs_v1');inserted=true;inserts.push(row);return query;};
    query.single=async()=>({data:inserted ? {run_id:uuid(99)} : null,error:config.storeError ? {code:'XX000',message:'private DB diagnostic password=do-not-export'} : null});
    return query;
  },rpc(name:string,args:{p_ids?:string[]}={}){
    calls.push(name);
    let data:unknown;
    if(name==='candidate_research_stock_authority_page') data=config.roster || [
      {symbol:'2409',stock_id:uuid(2409),exchange:'TWSE',sector:'display'},
      {symbol:'2410',stock_id:uuid(2410),exchange:'TWSE',sector:'display'}];
    else if(name==='research_source_heads_page_v1') data=config.sourceHeads || [];
    else if(name==='research_evidence_heads_v1') data=(config.evidenceHeads || (config.tables?.source_raw_documents || [])
      .map((row)=>({id:row.id,headId:row.id,retracted:false,superseded:false}))).filter((row)=>args.p_ids?.includes(String(row.id)));
    else if(['enqueue_research_deep_jobs_v1','capture_research_first_discoveries_v1'].includes(name)) data=0;
    else throw new Error(`unexpected test RPC ${name}`);
    const promise=Promise.resolve({data,error:null});return Object.assign(promise,{abortSignal:()=>promise});
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
    '@/lib/research-source-association':association,
  };
  const exports:Record<string,unknown>={};
  vm.runInNewContext(compiled,{exports,require:(name:string)=>{
    assert.ok(name in modules,`unexpected module ${name}`);return modules[name];
  },Date:ServerDate,Map,Set,Array,Number,Object,String,Promise},{timeout:1000});
  return {post:exports.POST as (request:Request)=>Promise<{status:number;body:Record<string,unknown>}>,calls,inserts,quoteStockIds};
}
function request(body:unknown,authorized=true,extraHeaders:Record<string,string>={}) {
  return new Request('https://example.test/api/internal/research-priority-run',{method:'POST',
    headers:{'content-type':'application/json',...(authorized ? {authorization:'Bearer synthetic-contract-only'} : {}),...extraHeaders},
    body:JSON.stringify(body)});
}
const payload=()=>({asOf:cutoff,sourceAttempts:[],assessments:[]});
test('industry-only current head never gains company attention from unioned legacy symbols',async()=>{
  const document={id:uuid(11),platform:'research_inbox_threads',
    document_url:'https://www.threads.com/@investanchors/post/Ddaum9QGFr_',
    symbols:['2409'],published_at:'2026-09-18T05:52:39Z',collected_at:'2026-10-02T07:00:00Z',
    canonical_content_hash:'a'.repeat(64),content_semantics:'editorial_discussion',
    metadata:{subject_scope:'industry_context',claim_status:'reported',
      first_observed_at:'2026-10-02T07:00:00Z',revision_observed_at:'2026-10-02T07:00:00Z'}};
  const industry=harness([],{sourceHeads:[document]});const baseline=harness();
  const a=await industry.post(request(payload()));const b=await baseline.post(request(payload()));
  assert.equal(a.status,200);assert.equal(b.status,200);
  assert.equal(JSON.stringify(industry.inserts[0].rows),JSON.stringify(baseline.inserts[0].rows));
  assert.equal(JSON.stringify(a.body.queue),JSON.stringify(b.body.queue));
  assert.deepEqual(document.symbols,['2409']); // no historical deletion/rewrite.
  const direct=harness([],{sourceHeads:[{...document,metadata:{...document.metadata,subject_scope:'company_mentions'}}]});
  assert.equal((await direct.post(request(payload()))).status,200);
  const row=(direct.inserts[0].rows as TestRow[]).find((item)=>item.symbol==='2409');
  assert.equal(row?.hasDiscoveryEvidence,true);
});
test('DR01 executable route rejects absent/non-exact bearer before any DB read',async()=>{
  for(const req of [request(payload(),false),request(payload(),true,{'x-internal-key':'synthetic-contract-only'})]) {
    const h=harness();const result=await h.post(req);
    assert.equal(result.status,401);assert.deepEqual(h.calls,[]);assert.equal(h.inserts.length,0);
  }
});
test('DR02 model/request supplied price contexts or arbitrary verified flags cannot enter server evidence',async()=>{
  const rated={level:0,reason:'synthetic unassessed research'};
  for(const body of [{...payload(),priceContext:{officialDatasetVerified:true}},
    {...payload(),prioritySymbols:['2409']},{...payload(),supplementaryObservation:{quoteStatus:'official_raw_quote'}},
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
  assert.equal((before.body.priceContexts as Array<{priceContext:{quoteStatus:string}}>)[0].priceContext.quoteStatus,'unverified_historical_raw');
  assert.equal((before.body.queue as unknown[]).length,2);
  assert.equal(JSON.stringify(before.body.queue),JSON.stringify(after.body.queue));
  const strip=(h:ReturnType<typeof harness>)=>(h.inserts[0].rows as Record<string,unknown>[]).map(({priceContext,supplementaryObservation,...row})=>{void priceContext;void supplementaryObservation;return row;});
  assert.equal(JSON.stringify(strip(a)),JSON.stringify(strip(b)));
  assert.equal(a.calls.filter((name)=>name==='research_first_discoveries_v1').length,1);
  assert.equal(a.calls.some((name)=>name==='official_price_history'),false);
});
test('DR05 impossible cutoff rejects before any source or price acquisition',async()=>{
  const h=harness();const result=await h.post(request({...payload(),asOf:'2026-02-30T08:00:00Z'}));
  assert.equal(result.status,400);assert.deepEqual(h.calls,[]);
});
function quoteTables(symbols=['2409'],close=110):Record<string,TestRow[]> {
  return {tw_trading_sessions_v3:[{session_id:'2026-10-02',status:'completed',market:'TWSE',provider:'twse',
    open_at:'2026-10-02T01:00:00Z',close_at:'2026-10-02T05:30:00Z',source_timestamp:'2026-10-02T05:30:00Z',
    collected_at:'2026-10-02T06:00:00Z',recorded_at:'2026-10-02T06:00:00Z',source_ref:'synthetic-official-calendar'}],
    official_price_history:symbols.map((symbol)=>({stock_id:uuid(Number(symbol)),session_date:'2026-10-02',close,volume:10000,
      source_url:`https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=${symbol}&date=20261002&response=json`,
      as_of:'2026-10-02T05:30:00Z',available_at:'2026-10-02T06:00:00Z',provider:'official_primary',integrityStatus:'valid'}))};
}
const missingFirst=(symbol:string)=>({symbol,run_id:uuid(1),first_seen_at:'2026-10-02T07:00:00Z',
  captured_at:'2026-10-02T07:30:00Z',snapshot:{price:null,priceStatus:'missing_at_discovery',gap:'price_read_admission_bound'}});
type PriceRow={symbol:string;priceContext:enrichment.DiscoveryPriceContext;supplementaryObservation:enrichment.DiscoverySupplementaryObservation};
test('DR06 actual route keeps weak/missing first immutable beside current verified raw quote',async()=>{
  for(const saved of [first(100),[missingFirst('2409')]]) {
    const original=JSON.stringify(saved);
    const h=harness(saved,{tables:quoteTables()});const result=await h.post(request(payload()));
    assert.equal(result.status,200);const row=(h.inserts[0].rows as PriceRow[])[0];
    assert.equal(row.priceContext.quoteStatus,saved[0].snapshot.price ? 'unverified_historical_raw' : 'missing_at_discovery');
    assert.equal(row.priceContext.immutableSnapshotHash,qualification.researchCanonicalHash(saved[0].snapshot));
    assert.equal(row.priceContext.cutoff,saved[0].first_seen_at);
    assert.equal(row.supplementaryObservation.quoteStatus,'official_raw_quote');
    assert.equal(row.supplementaryObservation.quote?.close,110);assert.equal(row.supplementaryObservation.cutoff,cutoff);
    assert.equal(row.supplementaryObservation.serverClock,new Date(clock).toISOString());assert.equal(row.supplementaryObservation.observedAt,'2026-10-02T06:00:00Z');
    assert.equal(row.supplementaryObservation.pricePhase,'unknown');assert.equal(row.supplementaryObservation.relative60d,null);
    assert.equal(JSON.stringify(saved),original);
    assert.equal(JSON.stringify(result.body.priceContexts),JSON.stringify((h.inserts[0].rows as PriceRow[]).map(({symbol,priceContext,supplementaryObservation})=>({symbol,priceContext,supplementaryObservation}))));
  }
});
test('DR07 actual supplementary evidence changes inputHash while first, scores and queue remain identical',async()=>{
  const saved=[missingFirst('2409')];const a=harness(saved,{tables:quoteTables(['2409'],110)});
  const b=harness(saved,{tables:quoteTables(['2409'],111)});
  const before=await a.post(request(payload()));const after=await b.post(request(payload()));
  assert.equal(before.status,200);assert.equal(after.status,200);assert.notEqual(before.body.inputHash,after.body.inputHash);
  assert.equal(JSON.stringify(before.body.queue),JSON.stringify(after.body.queue));
  const strip=(h:ReturnType<typeof harness>)=>(h.inserts[0].rows as PriceRow[]).map(({supplementaryObservation,...row})=>{void supplementaryObservation;return row;});
  assert.equal(JSON.stringify(strip(a)),JSON.stringify(strip(b)));
  for(const h of [a,b]) for(const row of h.inserts[0].rows as PriceRow[]) {
    const {observationHash,...receipt}=row.supplementaryObservation;
    assert.equal(observationHash,qualification.researchCanonicalHash(receipt));
  }
});
test('DR08 actual server-selected Top20 at lexical rear precedes outside candidates in shared32 admission',async()=>{
  const symbols=Array.from({length:45},(_,i)=>String(2400+i));const first=symbols.map(missingFirst);
  const roster=symbols.map((symbol)=>({symbol,stock_id:uuid(Number(symbol)),exchange:'TWSE',sector:'synthetic'}));
  const rated=(level:number)=>({level,reason:'reviewed synthetic ordinal'});
  const body={...payload(),assessments:symbols.map((symbol,i)=>({symbol,profitImpact:rated(i>=25 ? 4 : 0),novelty:rated(4),
    researchability:rated(4),lane:i>=40 ? 'emerging' : 'general',disposition:'queued',inProgress:false}))};
  const a=harness(first,{roster,tables:quoteTables(symbols)});const before=await a.post(request(body));
  const b=harness(first,{roster,tables:quoteTables(symbols,999)});const after=await b.post(request(body));
  assert.equal(before.status,200);assert.equal(after.status,200);
  const queue=before.body.queue as Array<{symbol:string}>;assert.equal(queue.length,20);
  assert.deepEqual(queue.map((row)=>row.symbol),symbols.slice(25));
  assert.deepEqual(a.quoteStockIds.slice(0,20),queue.map((row)=>uuid(Number(row.symbol))));
  assert.equal(a.quoteStockIds.length,32);assert.equal(JSON.stringify(before.body.queue),JSON.stringify(after.body.queue));
  const rows=a.inserts[0].rows as PriceRow[];assert.equal(rows.length,45);
  for(const row of rows.filter((row)=>queue.some((queued)=>queued.symbol===row.symbol))) assert.equal(row.supplementaryObservation.quoteStatus,'official_raw_quote');
  assert.equal(rows.filter((row)=>row.supplementaryObservation.missing.includes('price_read_admission_bound')).length,13);
  assert.ok(rows.every((row)=>row.priceContext.quoteStatus==='missing_at_discovery'));
  assert.equal((before.body.priceEnrichment as {supplementAccountedCount:number}).supplementAccountedCount,45);
});
test('DR09 actual DB predicates exclude later available/published quotes from original cutoff',async()=>{
  for(const field of ['as_of','available_at']) {
    const tables=quoteTables();tables.official_price_history[0][field]='2026-10-02T09:00:00Z';
    const saved=[missingFirst('2409')];const h=harness(saved,{tables});const result=await h.post(request(payload()));
    assert.equal(result.status,200);const row=(h.inserts[0].rows as PriceRow[])[0];
    assert.equal(row.supplementaryObservation.quote,null);assert.equal(row.priceContext.quote,null);
    assert.equal(row.supplementaryObservation.quoteStatus,'missing_at_current_cutoff');
    assert.ok(row.supplementaryObservation.missing.includes('official_quote_missing_at_current_cutoff'));
  }
});
test('DR10 active research outside Top20 has server priority; model inProgress cannot promote other candidates',async()=>{
  const symbols=Array.from({length:45},(_,i)=>String(2400+i));const active=symbols.slice(10);
  const roster=symbols.map((symbol)=>({symbol,stock_id:uuid(Number(symbol)),exchange:'TWSE'}));
  const tables=quoteTables(symbols);tables.research_deep_jobs_v1=active.map((symbol,i)=>({symbol,status:'running',created_at:cutoff,job_id:uuid(i+1)}));
  const h=harness(symbols.map(missingFirst),{roster,tables});
  const rated={level:4,reason:'reviewed synthetic ordinal'};
  const body={...payload(),assessments:symbols.map((symbol)=>({symbol,profitImpact:rated,novelty:rated,researchability:rated,
    lane:'general',disposition:'queued',inProgress:true}))};
  const result=await h.post(request(body));assert.equal(result.status,200);
  assert.equal(h.quoteStockIds.length,32);assert.deepEqual(h.quoteStockIds,active.slice(0,32).map((symbol)=>uuid(Number(symbol))));
  const rows=h.inserts[0].rows as Array<PriceRow & {inProgress:boolean}>;
  assert.ok(rows.filter((row)=>Number(row.symbol)<2410).every((row)=>!row.inProgress && !row.supplementaryObservation.attempted));
  assert.ok(rows.find((row)=>row.symbol==='2442')!.supplementaryObservation.missing.includes('price_read_admission_bound'));
});

function industryDoc():TestRow {
  return {id:uuid(11),...buildResearchInboxRow({sourcePlatform:'threads',sourceUrl:'https://www.threads.com/@investanchors/post/Ddaum9QGFr_',
    author:'Synthetic public author',publishedAt:'2026-08-01T01:00:00Z',observedAt:'2026-08-02T01:00:00Z',symbols:[],
    subjectScope:'industry_context',industryTerms:['CPO','testing'],shortSummary:'Industry testing bottleneck; no direct issuer mention',
    catalyst:'Unverified beneficiary hypothesis must be separate',risk:'No order or customer identified',claimStatus:'reported',visibility:'public'})};
}
function associationInput(doc=industryDoc()):association.IndustryAssociationInput {
  return {relation:'industry_hypothesis',sourceDocumentId:String(doc.id),sourceContentHash:String(doc.canonical_content_hash),
    sourceRootId:String((doc.metadata as TestRow).canonical_url),hypothesis:'Company could address part of an industry bottleneck',
    rationale:'Researcher inference awaiting company-specific evidence',companyBasisDocumentIds:[],
    strongestCounterEvidence:'Alternative suppliers and no customer order',associatedAt:'2026-10-01T01:00:00Z'};
}
function assessment(symbol='2409',items:unknown=[associationInput()]):TestRow {
  const rated={level:0,reason:'Research assumption without verified company evidence'};
  return {symbol,profitImpact:rated,novelty:rated,researchability:rated,lane:'general',disposition:'needs_evidence',inProgress:false,associations:items};
}
test('AR01 actual route rejects malformed/injected association authority before obtaining DB',async()=>{
  for(const items of [[{...associationInput(),verified:true}],[{...associationInput(),usableAtCutoff:true}],
    [{...associationInput(),sourceRootId:'https://example.test/?token=secret'}],Array(4).fill(associationInput()),'raw full text']) {
    const h=harness();const response=await h.post(request({...payload(),assessments:[assessment('2409',items)]}));
    assert.equal(response.status,400);assert.deepEqual(h.calls,[]);
  }
});
test('AR02 old source outside discovery window persists a server-hashed supplementary cue with no new priority roots',async()=>{
  const doc=industryDoc();const h=harness([],{tables:{source_raw_documents:[doc]}});
  const baseline=harness();const body={...payload(),assessments:[assessment()]};
  const {associations,...without}=assessment();void associations;
  const a=await h.post(request(body));const b=await baseline.post(request({...payload(),assessments:[without]}));
  assert.equal(a.status,200);assert.equal(b.status,200);
  const row=(h.inserts[0].rows as TestRow[])[0];const receipt=(row.sourceAssociations as association.IndustryAssociationReceipt[])[0];
  assert.equal(receipt.source?.publishedAt,'2026-08-01T01:00:00.000Z');
  assert.equal(receipt.evidenceStatus,'needs_evidence');assert.equal(receipt.status,'hypothesis');assert.equal(row.hasResearchCue,true);
  assert.equal(row.hasDiscoveryEvidence,false);assert.equal(row.firstSeenAt,null);assert.equal(row.disposition,'needs_evidence');
  assert.equal(row.associationObservedAt,new Date(clock).toISOString());assert.equal(receipt.usableAtCutoff,false);
  assert.equal(receipt.availableAt,new Date(clock).toISOString());assert.equal(receipt.dataCutoff,new Date(cutoff).toISOString());
  const {associationHash,...bound}=receipt;assert.equal(associationHash,qualification.researchCanonicalHash(bound));
  assert.equal(JSON.stringify(a.body.queue),JSON.stringify(b.body.queue));assert.notEqual(a.body.inputHash,b.body.inputHash);
  const strip=(rows:TestRow[])=>rows.map(({sourceAssociations,associationObservedAt,hasResearchCue,...rest})=>{
    void sourceAssociations;void associationObservedAt;void hasResearchCue;return rest;
  });
  assert.equal(JSON.stringify(strip(h.inserts[0].rows as TestRow[])),JSON.stringify(baseline.inserts[0].rows));
  assert.equal(JSON.stringify(((a.body.sourceAssociations as TestRow[])[0].associations)),JSON.stringify(row.sourceAssociations));
  assert.deepEqual(doc.symbols,[]);assert.equal(baseline.calls.includes('source_raw_documents'),false);
  assert.equal(b.body.sourceAssociations,undefined);
});
test('AR03 one original associated with two issuers never creates company mentions, attention or discovery times',async()=>{
  const doc=industryDoc();const h=harness([],{sourceHeads:[doc],tables:{source_raw_documents:[doc]}});
  const response=await h.post(request({...payload(),assessments:[assessment('2409'),assessment('2410')]}));assert.equal(response.status,200);
  const rows=h.inserts[0].rows as TestRow[];assert.equal(rows.length,2);
  for(const row of rows) {assert.equal(row.firstSeenAt,null);assert.equal(row.hasDiscoveryEvidence,false);assert.equal(row.hasResearchCue,true);
    const receipt=(row.sourceAssociations as association.IndustryAssociationReceipt[])[0];assert.equal(receipt.directSourceContribution,0);
    assert.equal(receipt.source?.rootId,associationInput().sourceRootId);
  }
  assert.equal((response.body.queue as unknown[]).length,0);
});
test('AR04 denial/retraction/supersession stay as visible invalidated or needs-update receipts',async()=>{
  for(const status of ['denied','retracted','superseded']) {
    const doc=industryDoc();if(status==='denied') (doc.metadata as TestRow).claim_status='denied';
    const heads=[{id:doc.id,headId:status==='superseded' ? uuid(12) : doc.id,retracted:status==='retracted',superseded:false}];
    const h=harness([],{tables:{source_raw_documents:[doc]},evidenceHeads:heads});
    const response=await h.post(request({...payload(),assessments:[assessment()]}));assert.equal(response.status,200);
    const row=(h.inserts[0].rows as TestRow[])[0];const receipt=(row.sourceAssociations as association.IndustryAssociationReceipt[])[0];
    assert.equal(receipt.status,'hypothesis');assert.equal(row.hasResearchCue,false);
    assert.equal(receipt.evidenceStatus,status==='superseded' ? 'needs_update' : 'invalidated');
    assert.equal(row.hasDiscoveryEvidence,false);assert.equal(row.firstSeenAt,null);
  }
});
test('AR05 source DB failure accounts every association without claiming no news or leaking raw diagnostics',async()=>{
  const h=harness([],{failTable:'source_raw_documents'});
  const response=await h.post(request({...payload(),assessments:[assessment('2409'),assessment('2410')]}));
  assert.equal(response.status,200);const receipts=(response.body.sourceAssociations as TestRow[])
    .flatMap((row)=>row.associations as association.IndustryAssociationReceipt[]);
  assert.equal(receipts.length,2);assert.ok(receipts.every((receipt)=>receipt.evidenceStatus==='unavailable' && !receipt.hasResearchCue));
  assert.ok(!JSON.stringify(response.body).includes('password'));assert.equal((h.inserts[0].rows as TestRow[]).length,2);
});
test('AR06 association issuer must be an official common-stock roster member',async()=>{
  const h=harness();const response=await h.post(request({...payload(),assessments:[assessment('9999')]}));
  assert.equal(response.status,409);assert.equal(response.body.error,'research_priority_association_company_not_in_roster');
  assert.equal(h.inserts.length,0);assert.equal(h.calls.includes('source_raw_documents'),false);
});
test('AR07 persistence/read errors remain bounded stable codes',async()=>{
  for(const config of [{storeError:true},{failTable:'candidate_issuer_document_domains_v6'}]) {
    const h=harness([],config);const response=await h.post(request(payload()));assert.equal(response.status,409);
    assert.ok(!JSON.stringify(response.body).includes('password'));assert.ok(!JSON.stringify(response.body).includes('private DB'));
  }
});
test('AR08 caller association cannot satisfy factor bindings or add a direct source claim',async()=>{
  const doc=industryDoc();const h=harness([],{sourceHeads:[doc],tables:{source_raw_documents:[doc]}});
  const factors=evidence.DISCOVERY_FACTORS.map((factor)=>({factor,status:'missing',explanation:'Missing company-specific direct evidence',documentIds:[],rootIds:[],availableAt:null}));
  const patched=factors.map((factor,i)=>i===0 ? {...factor,status:'supported',documentIds:[String(doc.id)],rootIds:[String((doc.metadata as TestRow).canonical_url)],availableAt:'2026-08-02T01:00:00Z'} : factor);
  const response=await h.post(request({...payload(),assessments:[{...assessment(),factors:patched}]}));
  assert.equal(response.status,409);assert.equal(h.inserts.length,0);
});
