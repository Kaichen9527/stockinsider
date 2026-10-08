import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

test('an inactive unheld entry cannot block monitoring an existing inactive position', async () => {
  const session = '2026-10-02'; const fetched = []; let marked; let saved;
  let initialAvailableAt='2026-10-04T00:00:00Z'; let firstBoundary;
  const book = { bookId: 'growth', positions: [{ symbol: '2409', sector: 'old', shares: 1000 }],
    lastProcessedSession: '2026-10-01', inceptionAt: '2026-09-30T00:00:00Z', activationAt:'2026-09-30T00:00:01Z' };
  const db = { rpc: async (name, args) => ({ error: null, data: name.includes('instrument')
    ? [{ symbol: args.p_stock_id, instrument_type: 'common_stock', exchange: 'TWSE', listing_status: 'inactive' }]
    : [] }), from(table) {
    let filters = {}; let inserted;
    const value = () => {
      if (table === 'research_paper_book_revisions_v1') {
        if (inserted) { saved = inserted; return { data: null, error: null }; }
        return { data: filters.operation_key ? null : { revision_hash: 'parent', state: book, available_at: initialAvailableAt }, error: null };
      }
      if (table === 'tw_trading_sessions_v3') {
        if(filters.open_at) { firstBoundary=filters.open_at; return {data:{session_id:session},error:null}; }
        return { data: { session_id: '2026-10-01' }, error: null };
      }
      if (table === 'candidate_technical_decisions_v1') return { data: [{ stock_id: '2330', snapshot: {
        symbol: '2330', entryResearchEligible: true, plans: [{ validFromSession: session, rawSignalState: 'confirmed' }],
      } }], error: null };
      if (table === 'stocks') return { data: { id: filters.symbol, symbol: filters.symbol }, error: null };
      if (table === 'opportunity_corporate_action_events_v3') return { data: [], error: null };
      throw new Error('unexpected_table:' + table);
    };
    const query = { then: (yes, no) => Promise.resolve(value()).then(yes, no), maybeSingle: async () => value() };
    for (const method of ['select','eq','gt','lt','lte','order','limit']) query[method] = (key, val) => {
      if (method === 'eq' || method==='gt') filters[key] = val; return query;
    };
    query.insert = (row) => { inserted = row; return query; }; return query;
  } };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer: () => true },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db },
    '@/lib/research-agent-qualification': { researchCanonicalHash: () => 'fixture', researchEntryQualification: () => { throw new Error('unheld entry must be skipped'); } },
    '@/lib/research-deep-evidence': {},
    '@/lib/research-paper-books': { markPaperPositions: (input) => { marked = input; return input.book; }, settlePaperSession: (input) => input.book },
    '@/lib/research-execution-context': { loadResearchExecutionContext: async () => ({}), assertResearchExecutionDatabasePolicy: async () => {} },
    '@/lib/tw-entry-plan-authority': { acquireTwEntryForwardCalendar: async () => ({}), loadTwEntryPlanAuthority: async (_db, input) => {
      fetched.push(input.symbol); return { sourceDatasetRevision:'fixture-revision', anchorAction:anchorContext(input), missingData: [], priceBasis: { status: 'verified' }, calendar: { completedSessions: [session] }, bars: [{ session, open: 30, high: 31, low: 29, close: 30, volume: 5000 }] };
    } },
    '@/lib/technical-features-v2': { calculateTechnicalFeatures: () => ({ ma20: 30 }) },
  };
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-paper-session/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, Date });
  const result = await exports.POST({ json: async () => ({ bookId: 'growth', action: 'session', session }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(fetched, ['2409']); assert.equal(marked.bars.length, 1);
  assert.equal(marked.bars[0].symbol, '2409'); assert.equal(saved.parent_hash, 'parent');
  assert.equal(saved.result.outcomes[0].reason, 'listing_not_active_at_entry');
  book.lastProcessedSession = null;
  book.activationAt = null;
  book.inceptionAt = '2026-10-04T00:00:00Z';
  const backdated = await exports.POST({ json: async () => ({ bookId: 'growth', action: 'session', session }) });
  assert.equal(backdated.status, 409);
  assert.equal(backdated.body.error, 'paper_session_before_inception');
  assert.deepEqual(fetched, ['2409'], 'a fresh book cannot observe a chosen historical bar');
  book.inceptionAt='2026-10-01T00:59:59Z';
  initialAvailableAt='2026-10-01T01:00:01Z';
  const opening=await exports.POST({json:async()=>({bookId:'growth',action:'session',session:'2026-10-01'})});
  assert.equal(opening.status,409); assert.equal(opening.body.error,'paper_session_before_inception');
  const next=await exports.POST({json:async()=>({bookId:'growth',action:'session',session})});
  assert.equal(next.status,200,JSON.stringify(next.body));
  assert.equal(firstBoundary,'2026-10-01T01:00:01.000Z','both predicates freeze the later initialization boundary');
  assert.equal(saved.state.activationAt,firstBoundary);
});


function anchorContext(input,event=null) {
  return {schema:'tw-entry-anchor-action-v1',status:'verified',symbol:input.symbol,exchange:input.exchange,
    session:input.signalSession,cutoff:input.cutoff,snapshotId:'11111111-1111-4111-8111-111111111111',
    sessionAuthorityId:'22222222-2222-4222-8222-222222222222',datasetHash:'a'.repeat(64),sourceDatasetRevision:'fixture-revision',event};
}

async function anchorRouteFixture({held=true,event=null,mutate=proof=>proof,replay=null,authorityMissing=[],revision='fixture-revision'}={}) {
  const session='2026-10-02';let saves=0,marks=0,eventReads=0,authorityReads=0;
  const book={bookId:'growth',positions:held?[{symbol:'2409',shares:1000,sector:'display'}]:[],lastProcessedSession:'2026-10-01',
    inceptionAt:'2026-09-30T00:00:00Z',activationAt:'2026-09-30T00:00:01Z'};
  const db={rpc:async(name,args)=>({error:null,data:name.includes('instrument')
    ?[{symbol:args.p_stock_id,instrument_type:'common_stock',exchange:'TWSE',listing_status:'active'}]
    :[{status:'active',canonical_sector_key:'display'}]}),from(table){
    const filters={};let inserted;
    const result=()=>{
      if(table==='research_paper_book_revisions_v1'){
        if(inserted){saves++;return{data:null,error:null};}
        return{data:filters.operation_key?replay:{revision_hash:'parent',state:book,available_at:book.activationAt},error:null};
      }
      if(table==='tw_trading_sessions_v3')return{data:{session_id:'2026-10-01'},error:null};
      if(table==='candidate_technical_decisions_v1')return{data:held?[]:[{stock_id:'2409',snapshot:{symbol:'2409',entryResearchEligible:true,
        plans:[{validFromSession:session,rawSignalState:'confirmed',entryUpper:30}]}}],error:null};
      if(table==='stocks')return{data:{id:'2409',symbol:'2409'},error:null};
      if(table==='opportunity_corporate_action_events_v3'){eventReads++;return{data:[{snapshot_id:'superseded-historical-event'}],error:null};}
      throw new Error('unexpected_table:'+table);
    };
    const query={then:(yes,no)=>Promise.resolve(result()).then(yes,no),maybeSingle:async()=>result()};
    for(const method of ['select','eq','gt','lt','lte','order','limit'])query[method]=(key,value)=>{if(method==='eq')filters[key]=value;return query;};
    query.insert=row=>{inserted=row;return query;};return query;
  }};
  const dependencies={
    'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status||200})}},
    '@/lib/internal-auth':{requireExactInternalBearer:()=>true},
    '@/lib/supabase-server':{getSupabaseServerClient:()=>db},
    '@/lib/research-agent-qualification':{researchCanonicalHash:()=> 'fixture'},
    '@/lib/research-deep-evidence':{},
    '@/lib/research-paper-books':{markPaperPositions:input=>{marks++;return input.book;},settlePaperSession:input=>input.book},
    '@/lib/research-execution-context':{loadResearchExecutionContext:async()=>({}),assertResearchExecutionDatabasePolicy:async()=>{}},
    '@/lib/tw-entry-plan-authority':{acquireTwEntryForwardCalendar:async()=>({}),loadTwEntryPlanAuthority:async(_db,input)=>{
      authorityReads++;return{missingData:authorityMissing,sourceDatasetRevision:revision,anchorAction:mutate(anchorContext(input,event)),
        priceBasis:{status:'verified'},calendar:{completedSessions:[session]},bars:[{session,open:30,high:31,low:29,close:30,volume:5000}]};
    }},
    '@/lib/technical-features-v2':{calculateTechnicalFeatures:()=>({ma20:30})},
  };
  const exports={};const source=fs.readFileSync(new URL('../web/src/app/api/internal/research-paper-session/route.ts',import.meta.url),'utf8');
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:name=>{assert.ok(name in dependencies,name);return dependencies[name];},Date});
  const response=await exports.POST({json:async()=>({bookId:'growth',action:'session',session})});
  return{response,saves,marks,eventReads,authorityReads};
}

test('paper session uses verified zero-event anchor rather than any superseded historical event',async()=>{
  const result=await anchorRouteFixture();
  assert.equal(result.response.status,200,JSON.stringify(result.response.body));
  assert.equal(result.saves,1);assert.equal(result.marks,1);assert.equal(result.eventReads,0);
});

test('current verified corporate action still blocks held book and frozen new entry',async()=>{
  const event={kind:'ex_right_dividend',sourceRowRef:'b'.repeat(64)};
  const held=await anchorRouteFixture({event});
  assert.equal(held.response.status,409);assert.equal(held.response.body.error,'paper_corporate_action_reconciliation_required:2409');
  assert.equal(held.saves,0);assert.equal(held.marks,0);assert.equal(held.eventReads,0);
  const entry=await anchorRouteFixture({held:false,event});
  assert.equal(entry.response.status,200,JSON.stringify(entry.response.body));
  assert.equal(entry.response.body.result.outcomes[0].reason,'corporate_action_changed_frozen_entry_basis');
  assert.equal(entry.saves,1);assert.equal(entry.eventReads,0);
});

test('missing or mismatched anchor action context never marks or appends a book',async()=>{
  for(const mutate of [()=>null,()=>undefined,p=>({...p,status:'missing'}),p=>({...p,schema:'unknown'}),p=>({...p,symbol:'2330'}),p=>({...p,exchange:'TPEX'}),p=>({...p,session:'2026-10-01'}),
    p=>({...p,cutoff:'2026-10-01T00:00:00Z'}),p=>({...p,sourceDatasetRevision:'other'}),p=>({...p,snapshotId:'bad'}),
    p=>({...p,sessionAuthorityId:'bad'}),p=>({...p,datasetHash:'bad'}),p=>({...p,event:undefined}),
    p=>({...p,event:{kind:'unknown',sourceRowRef:'b'.repeat(64)}}),p=>({...p,event:{kind:'ex_right_dividend',sourceRowRef:'bad'}})]){
    const result=await anchorRouteFixture({mutate});assert.equal(result.response.status,409);
    assert.equal(result.response.body.error,'paper_anchor_action_context_invalid:2409');assert.equal(result.saves,0);assert.equal(result.marks,0);assert.equal(result.eventReads,0);
  }
  for(const revision of [null,'']){
    const result=await anchorRouteFixture({revision,mutate:p=>({...p,sourceDatasetRevision:revision})});
    assert.equal(result.response.status,409);assert.equal(result.marks,0);assert.equal(result.saves,0);
  }
  const missing=await anchorRouteFixture({authorityMissing:['corporate_action_hash_mismatch']});
  assert.equal(missing.response.status,409);assert.equal(missing.saves,0);assert.equal(missing.marks,0);
});

test('paper exact replay returns its original immutable receipt without current authority reads',async()=>{
  const replay={revision_hash:'original',input_hash:'fixture',state:{original:true},result:{original:true}};
  const result=await anchorRouteFixture({replay,mutate:()=>{throw new Error('must not read current authority');}});
  assert.equal(result.response.status,200);assert.equal(result.response.body.idempotentReplay,true);
  assert.equal(result.response.body.revision_hash,'original');assert.equal(result.saves,0);assert.equal(result.marks,0);assert.equal(result.authorityReads,0);
});
