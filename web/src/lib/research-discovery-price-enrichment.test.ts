import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { TW_ENTRY_PLAN_RULESET } from './tw-entry-plan-contract.ts';
import { DISCOVERY_PRICE_BOUNDS, discoveryWindowDatasetHash, evaluateDiscoveryPrice, loadDiscoveryPriceEnrichment,
  readDiscoveryRawQuote, type DiscoveryPriceCandidate, type DiscoveryPriceRead, type DiscoveryOfficialWindow } from './research-discovery-price-enrichment.ts';

const uuid=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const session='2026-10-02'; const cutoff='2026-10-02T08:00:00Z';
const url='https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2409&date=20261002&response=json';
function candidate(symbol='2409'): DiscoveryPriceCandidate {
  return {symbol,stockId:uuid(Number(symbol)),exchange:'TWSE',firstSeenAt:cutoff,hasDiscoveryEvidence:true};
}
function fixture(): DiscoveryPriceRead {
  const dates:string[]=[];
  for(let time=Date.parse(`${session}T00:00:00Z`);dates.length<61;time-=86_400_000) {
    const day=new Date(time); if([0,6].includes(day.getUTCDay()) || day.toISOString().slice(0,10)==='2026-09-25') continue;
    dates.unshift(day.toISOString().slice(0,10));
  }
  const stock=dates.map((day)=>({session:day,close:100,availableAt:`${day}T06:00:00Z`}));
  const window:DiscoveryOfficialWindow={stock,benchmark:structuredClone(stock),latestCompletedSession:session,
    calendar:dates.map((day)=>({session:day,closeAt:`${day}T05:30:00Z`,availableAt:`${day}T06:00:00Z`})),
    priceBasis:{kind:'adjusted_to_signal_session',anchorSession:session,evidenceHash:'a'.repeat(64),availableAt:`${session}T06:00:00Z`},
    validation:null,phase:null};
  const datasetHash=discoveryWindowDatasetHash(window);
  window.validation={status:'passed',recordedAt:`${session}T06:30:00Z`,evidenceHash:'b'.repeat(64),datasetHash};
  window.phase={ruleset:TW_ENTRY_PLAN_RULESET,session,availableAt:`${session}T07:00:00Z`,datasetHash,
    close:100,ma20:99,atr14:3,rsi14:60,breakout:'confirmed',pullback:'waiting'};
  return {quote:{session,close:100,volume:10_000,sourceUrl:url,availableAt:`${session}T06:00:00Z`,priceBasis:'raw_exchange_quote',symbol:'2409',exchange:'TWSE'},
    window,latestCompletedSession:session,missing:[]};
}
function mockClient(tables:Record<string,unknown[]>={},failTable:string|null=null) {
  const calls:Array<{table:string;method:string;args:unknown[]}>=[];
  const client={from(table:string){
    let low=0;let high=Infinity;
    const filters:Array<(row:Record<string,unknown>)=>boolean>=[];
    const orders:Array<{key:string;ascending:boolean}>=[];
    const compare=(a:unknown,b:unknown)=>{
      const aTime=typeof a==='string' && a.includes('T') ? Date.parse(a) : NaN;
      const bTime=typeof b==='string' && b.includes('T') ? Date.parse(b) : NaN;
      return Number.isFinite(aTime) && Number.isFinite(bTime) ? aTime-bTime : String(a).localeCompare(String(b));
    };
    const query:Record<string,unknown>={then(resolve:(value:unknown)=>void){
      let rows=(tables[table] || []) as Record<string,unknown>[];
      // Calendar mocks execute real predicates/order before LIMIT. Other table
      // fixtures deliberately expose malformed returned rows to the validators.
      if(table==='tw_trading_sessions_v3') rows=rows.filter((row)=>filters.every((filter)=>filter(row)))
        .sort((a,b)=>{for(const order of orders){const diff=compare(a[order.key],b[order.key]);if(diff) return order.ascending ? diff : -diff;}return 0;});
      resolve({data:rows.slice(low,high+1),error:table===failTable ? {message:'synthetic read failure'} : null});
    }};
    for(const method of ['select','lte','eq','order','abortSignal','limit','range']) query[method]=(...args:unknown[])=>{
      calls.push({table,method,args});if(method==='range'){low=Number(args[0]);high=Number(args[1]);}
      if(method==='eq') filters.push((row)=>compare(row[String(args[0])],args[1])===0);
      if(method==='lte') filters.push((row)=>compare(row[String(args[0])],args[1])<=0);
      if(method==='order') orders.push({key:String(args[0]),ascending:(args[1] as {ascending?:boolean})?.ascending!==false});
      if(method==='limit') high=Number(args[0])-1;return query;
    };
    return query;
  }};
  return {client:client as unknown as Parameters<typeof loadDiscoveryPriceEnrichment>[0],calls};
}
test('DP01 approved synthetic window computes all horizons; breakout does not grant research eligibility',()=>{
  const result=evaluateDiscoveryPrice(fixture(),cutoff);
  assert.equal(result.relative5d,0);assert.equal(result.relative20d,0);assert.equal(result.relative60d,0);
  assert.equal(result.pricePhase,'initial_breakout');assert.equal(result.researchEvidenceRequired,true);
  assert.equal(result.rankingInfluence,false);assert.deepEqual(result.missing,[]);
});

function collectorMonthUrl(exchange:'TWSE' | 'TPEx') {
  // Invoke the actual collector's pure URL constructor with credential/network
  // modules stubbed out; no vault or environment secret is read by this test.
  const code=readFileSync(new URL('./tw-market.ts',import.meta.url),'utf8');
  const exports:Record<string,unknown>={};
  vm.runInNewContext(ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports,require:(name:string)=>{assert.equal(name,'./finmind-vault.ts');return {readFinMindVaultToken:()=>{throw new Error('vault must not be read');}};},
      fetch:()=>{throw new Error('network must not be read');}},{timeout:1000});
  return (exports.twStockHistoryMonthUrl as (job:Record<string,unknown>)=>string)({symbol:'2409',exchange,dataset:'price',month:'2026-10-01',lastSession:session});
}
test('DP19 124+ ordinary historical sessions do not exhaust latest-head admission',async()=>{
  const tables=rawTables();const base=tables.tw_trading_sessions_v3[0];
  for(let i=1;i<=200;i++) {
    const day=new Date(Date.parse(`${session}T00:00:00Z`)-i*86_400_000).toISOString().slice(0,10);
    tables.tw_trading_sessions_v3.push({...base,session_id:day,open_at:`${day}T01:00:00Z`,close_at:`${day}T05:30:00Z`,
      source_timestamp:`${day}T05:30:00Z`,collected_at:`${day}T06:00:00Z`,recorded_at:`${day}T06:00:00Z`});
  }
  tables.tw_trading_sessions_v3.reverse();
  const {client,calls}=mockClient(tables);const read=await readDiscoveryRawQuote(client,candidate(),cutoff,new AbortController().signal);
  assert.equal(read.quote?.close,100);assert.equal(read.latestCompletedSession,session);
  assert.equal(calls.filter((call)=>call.table==='tw_trading_sessions_v3' && call.method==='limit').length,2);
  assert.ok(calls.some((call)=>call.method==='eq' && call.args[0]==='session_id' && call.args[1]===session));
  assert.ok(calls.some((call)=>call.method==='eq' && call.args[0]==='recorded_at' && call.args[1]===`${session}T06:00:00Z`));
  assert.equal(read.missing.includes('official_calendar_read_bound'),false);
});
test('DP20 newest head ties remain bounded and newer cancellation cannot resurrect a completion',async()=>{
  const tied=rawTables();tied.tw_trading_sessions_v3.push({...tied.tw_trading_sessions_v3[0],status:'cancelled',recorded_at:`${session}T14:00:00+08:00`});
  assert.ok((await readDiscoveryRawQuote(mockClient(tied).client,candidate(),cutoff,new AbortController().signal)).missing.includes('official_calendar_conflict'));
  const cancelled=rawTables();cancelled.tw_trading_sessions_v3.push({...cancelled.tw_trading_sessions_v3[0],status:'cancelled',recorded_at:`${session}T07:00:00Z`});
  const rejected=await readDiscoveryRawQuote(mockClient(cancelled).client,candidate(),cutoff,new AbortController().signal);
  assert.equal(rejected.quote,null);assert.ok(rejected.missing.includes('latest_session_cancelled'));
  const full=rawTables();full.tw_trading_sessions_v3=Array.from({length:124},()=>({...full.tw_trading_sessions_v3[0]}));
  assert.ok((await readDiscoveryRawQuote(mockClient(full).client,candidate(),cutoff,new AbortController().signal)).missing.includes('official_calendar_read_bound'));
  const futureClose=rawTables();futureClose.tw_trading_sessions_v3.push({...futureClose.tw_trading_sessions_v3[0],
    status:'cancelled',recorded_at:`${session}T07:00:00Z`,close_at:`${session}T09:00:00Z`});
  assert.equal((await readDiscoveryRawQuote(mockClient(futureClose).client,candidate(),cutoff,new AbortController().signal)).quote,null);
});
test('DP21 actual TWSE/TPEx collector month URLs and exact-day quotes are admitted',async()=>{
  for(const exchange of ['TWSE','TPEX'] as const) {
    const tables=rawTables();tables.tw_trading_sessions_v3[0].market=exchange;tables.tw_trading_sessions_v3[0].provider=exchange.toLowerCase();
    tables.official_price_history[0].source_url=collectorMonthUrl(exchange==='TWSE' ? 'TWSE' : 'TPEx');
    const row={...candidate(),exchange};
    const read=await readDiscoveryRawQuote(mockClient(tables).client,row,cutoff,new AbortController().signal);
    assert.equal(read.quote?.close,100);assert.equal(read.quote?.exchange,exchange);
    assert.equal(evaluateDiscoveryPrice(read,cutoff).quoteStatus,'official_raw_quote');
    if(exchange==='TPEX') {
      tables.official_price_history[0].source_url=tables.official_price_history[0].source_url.replace('2026/10/01','2026/10/02');
      assert.equal((await readDiscoveryRawQuote(mockClient(tables).client,row,cutoff,new AbortController().signal)).quote?.close,100);
    }
  }
});
test('DP22 endpoint-specific stock/date/host/parameter mismatches reject both exchanges',async()=>{
  for(const exchange of ['TWSE','TPEX'] as const) {
    const source=collectorMonthUrl(exchange==='TWSE' ? 'TWSE' : 'TPEx');
    const symbolKey=exchange==='TWSE' ? 'stockNo' : 'code';
    const mutations:Array<(url:URL)=>void>=[
      (url)=>url.searchParams.set(symbolKey,'2330'),
      (url)=>url.searchParams.set('date',exchange==='TWSE' ? '20260901' : '2026/09/01'),
      (url)=>url.searchParams.set('date',exchange==='TWSE' ? '20261003' : '2026/10/03'),
      (url)=>url.searchParams.set('date',exchange==='TWSE' ? '20260230' : '2026/02/30'),
      (url)=>{url.hostname='www.twse.com.tw.attacker.test';},
      (url)=>url.searchParams.append(symbolKey,'2409'),
      (url)=>url.searchParams.delete('date'),
      (url)=>url.searchParams.set('response','html'),
      (url)=>url.searchParams.set(exchange==='TWSE' ? 'code' : 'stockNo','2409'),
      (url)=>{url.username='credential';},
    ];
    for(const mutate of mutations) {
      const altered=new URL(source);mutate(altered);const tables=rawTables();
      tables.tw_trading_sessions_v3[0].market=exchange;tables.tw_trading_sessions_v3[0].provider=exchange.toLowerCase();
      tables.official_price_history[0].source_url=altered.toString();
      const read=await readDiscoveryRawQuote(mockClient(tables).client,{...candidate(),exchange},cutoff,new AbortController().signal);
      assert.equal(read.quote,null);assert.ok(read.missing.includes('official_quote_validation_failed'));
    }
  }
  const tables=rawTables();tables.official_price_history[0].source_url='https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20261002&type=ALLBUT0999';
  assert.equal((await readDiscoveryRawQuote(mockClient(tables).client,candidate(),cutoff,new AbortController().signal)).quote?.close,100);
  tables.official_price_history[0].source_url=tables.official_price_history[0].source_url.replace('20261002','20261001');
  assert.equal((await readDiscoveryRawQuote(mockClient(tables).client,candidate(),cutoff,new AbortController().signal)).quote,null);
  const wrongRow=rawTables();wrongRow.official_price_history[0].source_url=collectorMonthUrl('TWSE');
  wrongRow.official_price_history[0].session_date='2026-10-01';
  assert.equal((await readDiscoveryRawQuote(mockClient(wrongRow).client,candidate(),cutoff,new AbortController().signal)).quote,null);
});
test('DP23 strict-reader rejected row cannot be upgraded by a later weak immutable registry capture',async()=>{
  for(const defect of ['provider_unknown','integrity_missing','market_unknown']) {
    const tables=rawTables();const row=candidate();
    if(defect==='provider_unknown') tables.official_price_history[0].provider='unknown';
    if(defect==='integrity_missing') tables.official_price_history[0].integrityStatus='';
    if(defect==='market_unknown') row.exchange='unknown';
    const strict=await readDiscoveryRawQuote(mockClient(tables).client,row,cutoff,new AbortController().signal);
    assert.equal(strict.quote,null);
    const price={...fixture().quote!};delete price.symbol;delete price.exchange;
    // The actual unchanged capture labels these weak raw rows official_quote
    // while omitting provider, integrity and exchange from its frozen payload.
    const captured={symbol:'2409',run_id:uuid(1),first_seen_at:cutoff,captured_at:'2026-10-02T09:00:00Z',
      snapshot:{price,priceStatus:'official_quote',pricePhase:'unknown'}};
    const before=JSON.stringify(captured);let rereads=0;
    const loaded=await loadDiscoveryPriceEnrichment(mockClient({research_first_discoveries_v1:[captured]}).client,
      [candidate()],'2026-10-05T09:00:00Z',{reader:async()=>{rereads++;return fixture();}});
    const context=loaded.contexts.get('2409')!;
    assert.equal(rereads,0);assert.equal(context.quote?.close,100);assert.equal(context.quoteStatus,'unverified_historical_raw');
    assert.equal(context.relative60d,null);assert.equal(context.pricePhase,'unknown');
    assert.ok(context.missing.includes('historical_raw_quote_unverified'));
    assert.equal(context.immutableSnapshotHash,researchCanonicalHash(captured.snapshot));assert.equal(JSON.stringify(captured),before);
  }
});
test('DP24 a first missing capture remains frozen after admission/date/available-data changes',async()=>{
  const captured={symbol:'2434',run_id:uuid(1),first_seen_at:cutoff,captured_at:'2026-10-02T09:00:00Z',
    snapshot:{price:null,priceStatus:'missing_at_discovery',gap:'price_read_admission_bound'}};
  let reads=0;
  const loaded=await loadDiscoveryPriceEnrichment(mockClient({research_first_discoveries_v1:[captured]}).client,
    [{...candidate('2434'),firstSeenAt:'2026-10-05T08:00:00Z'}],'2026-10-05T09:00:00Z',
    {reader:async()=>{reads++;return fixture();}});
  assert.equal(reads,0);assert.equal(loaded.accountedCount,1);const context=loaded.contexts.get('2434')!;
  assert.equal(context.quoteStatus,'missing_at_discovery');assert.equal(context.cutoff,cutoff);
  assert.equal(context.immutableSnapshotHash,researchCanonicalHash(captured.snapshot));
  assert.deepEqual(captured.snapshot,{price:null,priceStatus:'missing_at_discovery',gap:'price_read_admission_bound'});
});
test('DP02 wrong benchmark, incomplete calendar or stale last session never yields relative returns',()=>{
  for(const mutate of [(read:DiscoveryPriceRead)=>{read.window!.benchmark[0].session='2026-06-01';},
    (read:DiscoveryPriceRead)=>{read.window!.calendar.pop();},
    (read:DiscoveryPriceRead)=>{read.latestCompletedSession='2026-10-01';}]) {
    const read=fixture();mutate(read);const result=evaluateDiscoveryPrice(read,cutoff);
    assert.equal(result.relative5d,null);assert.equal(result.relative60d,null);assert.equal(result.pricePhase,'unknown');
  }
});
test('DP03 future available/session and validation clocks fail closed',()=>{
  for(const mutate of [(read:DiscoveryPriceRead)=>{read.window!.stock[60].availableAt='2026-10-03T06:00:00Z';},
    (read:DiscoveryPriceRead)=>{read.window!.stock[60].session='2026-10-03';},
    (read:DiscoveryPriceRead)=>{read.window!.validation!.recordedAt='2026-10-03T06:00:00Z';},
    (read:DiscoveryPriceRead)=>{read.window!.validation!.recordedAt='2026-10-02T05:00:00Z';}]) {
    const read=fixture();mutate(read);const result=evaluateDiscoveryPrice(read,cutoff);
    assert.equal(result.relative5d,null);assert.equal(result.pricePhase,'unknown');assert.ok(result.missing.length);
  }
});
test('DP04 missing quotes, corporate actions and failed official verification are explicit unknowns',()=>{
  const read=fixture();read.window!.validation!.status='failed';
  assert.equal(evaluateDiscoveryPrice(read,cutoff).relative60d,null);
  read.window!.priceBasis=null;assert.ok(evaluateDiscoveryPrice(read,cutoff).missing.includes('corporate_action_basis_missing'));
  read.quote=null;assert.ok(evaluateDiscoveryPrice(read,cutoff).missing.includes('quote_missing_at_discovery'));
  assert.equal(evaluateDiscoveryPrice({quote:null,window:null,latestCompletedSession:null,missing:[]},cutoff).pricePhase,'unknown');
});
test('DP05 valid returns do not invent a phase when metadata is absent, future or wrong ruleset',()=>{
  for(const mutate of [(read:DiscoveryPriceRead)=>{read.window!.phase=null;},
    (read:DiscoveryPriceRead)=>{read.window!.phase!.ruleset='model_guess';},
    (read:DiscoveryPriceRead)=>{read.window!.phase!.availableAt='2026-10-03T06:00:00Z';}]) {
    const read=fixture();mutate(read);const result=evaluateDiscoveryPrice(read,cutoff);
    assert.equal(result.relative60d,0);assert.equal(result.pricePhase,'unknown');
  }
});
test('DP06 overheating and established pullback preserve existing thresholds',()=>{
  const read=fixture();read.window!.phase!.rsi14=75;
  assert.equal(evaluateDiscoveryPrice(read,cutoff).pricePhase,'extended');
  read.window!.phase!.rsi14=60;read.window!.phase!.breakout='waiting';read.window!.phase!.pullback='confirmed';
  assert.equal(evaluateDiscoveryPrice(read,cutoff).pricePhase,'trend_pullback');
  read.window!.phase!.rsi14=101;assert.equal(evaluateDiscoveryPrice(read,cutoff).pricePhase,'unknown');
});
test('DP07 immutable first quote/gap survives later reads and a changed current firstSeenAt',async()=>{
  for(const price of [fixture().quote,null]) {
    const first={symbol:'2409',run_id:uuid(1),first_seen_at:cutoff,captured_at:'2026-10-02T09:00:00Z',snapshot:{price,pricePhase:'unknown'}};
    const {client}=mockClient({research_first_discoveries_v1:[first]});let reads=0;
    const later={...candidate(),firstSeenAt:'2026-10-05T08:00:00Z'};
    const result=await loadDiscoveryPriceEnrichment(client,[later],'2026-10-05T09:00:00Z',{
      reader:async()=>{reads++;return fixture();}});
    const context=result.contexts.get('2409')!;
    assert.equal(reads,0);assert.equal(context.cutoff,cutoff);assert.equal(context.quote?.close || null,price?.close || null);
    assert.equal(context.immutableSnapshotHash,researchCanonicalHash(first.snapshot));assert.equal(context.relative60d,null);
    assert.deepEqual(first.snapshot,{price,pricePhase:'unknown'});
  }
});
test('DP08 missing discovery, admitted success and failed read each account for a full symbol',async()=>{
  const {client}=mockClient();let reads=0;
  const result=await loadDiscoveryPriceEnrichment(client,[candidate('2409'),candidate('2410'),{...candidate('2411'),firstSeenAt:null,hasDiscoveryEvidence:false}],cutoff,{
    reader:async(_db,row)=>{reads++;if(row.symbol==='2410') throw new Error('private upstream message');return fixture();}});
  assert.equal(result.expectedCount,3);assert.equal(result.accountedCount,3);assert.equal(reads,2);
  assert.ok(result.contexts.get('2410')!.missing.includes('official_price_read_failed'));
  assert.ok(result.contexts.get('2411')!.missing.includes('discovery_evidence_missing'));
  assert.equal(JSON.stringify([...result.contexts.values()]).includes('private upstream message'),false);
});
test('DP09 deterministic sorted admission caps reads at 32 without losing symbols',async()=>{
  const {client}=mockClient();const candidates=Array.from({length:35},(_,i)=>candidate(String(2400+i))).reverse();
  const called:string[]=[];
  const result=await loadDiscoveryPriceEnrichment(client,candidates,cutoff,{reader:async(_db,row)=>{called.push(row.symbol);return fixture();}});
  assert.equal(called.length,DISCOVERY_PRICE_BOUNDS.newReads);assert.equal(called[0],'2400');assert.equal(result.accountedCount,35);
  assert.ok(result.contexts.get('2434')!.missing.includes('price_read_admission_bound'));
  assert.deepEqual(candidates.map((row)=>row.symbol),Array.from({length:35},(_,i)=>String(2434-i)));
});
test('DP10 registry failure and read deadline do not backfill an unconfirmed first capture',async()=>{
  const failed=mockClient({},'research_first_discoveries_v1');let reads=0;
  const reader=async()=>{reads++;return fixture();};
  const result=await loadDiscoveryPriceEnrichment(failed.client,[candidate()],cutoff,{reader});
  assert.equal(reads,0);assert.ok(result.contexts.get('2409')!.missing.includes('first_discovery_registry_read_failed'));
  const {client}=mockClient();const ticks=[0,DISCOVERY_PRICE_BOUNDS.readMs+1];
  const timed=await loadDiscoveryPriceEnrichment(client,[candidate()],cutoff,{reader,monotonicNow:()=>ticks.shift()!});
  assert.equal(reads,0);assert.equal(timed.accountedCount,1);assert.ok(timed.contexts.get('2409')!.missing.includes('price_read_deadline'));
});
function rawTables() {
  return {tw_trading_sessions_v3:[{session_id:session,status:'completed',market:'TWSE',provider:'twse',
    open_at:`${session}T01:00:00Z`,close_at:`${session}T05:30:00Z`,source_timestamp:`${session}T05:30:00Z`,
    collected_at:`${session}T06:00:00Z`,recorded_at:`${session}T06:00:00Z`,source_ref:'twse-official-calendar'}],
    official_price_history:[{session_date:session,close:100,volume:10_000,source_url:url,
      as_of:`${session}T05:30:00Z`,available_at:`${session}T06:00:00Z`,provider:'official_primary',integrityStatus:'valid'}]};
}
const currentRun=(prioritySymbols=['2409'])=>({serverClock:'2026-10-05T09:00:00Z',prioritySymbols});
function currentFixture(row:DiscoveryPriceCandidate):DiscoveryPriceRead {
  const read=fixture();read.quote={...read.quote!,symbol:row.symbol,exchange:'TWSE',
    sourceUrl:`https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=${row.symbol}&date=20261002&response=json`};
  read.quoteProvenance={provider:'official_primary',integrityStatus:'valid',stockId:row.stockId,exchange:row.exchange,
    publishedAt:'2026-10-02T05:30:00Z',observedAt:'2026-10-02T06:00:00Z',availableAt:read.quote.availableAt};
  return read;
}
test('DS01 weak first quote and verified current raw observation coexist without promotion',async()=>{
  for(const price of [fixture().quote,null]) {
    const captured={symbol:'2409',run_id:uuid(1),first_seen_at:cutoff,captured_at:'2026-10-02T09:00:00Z',
      snapshot:{price,priceStatus:price ? 'official_quote' : 'missing_at_discovery',gap:'price_read_admission_bound'}};
    const before=JSON.stringify(captured);const {client}=mockClient({research_first_discoveries_v1:[captured]});
    const baseline=await loadDiscoveryPriceEnrichment(client,[candidate()],'2026-10-05T08:00:00Z');
    const loaded=await loadDiscoveryPriceEnrichment(client,[candidate()],'2026-10-05T08:00:00Z',{
      currentRun:currentRun(),reader:async(_db,row)=>currentFixture(row)});
    assert.deepEqual(loaded.contexts.get('2409'),baseline.contexts.get('2409'));
    assert.equal(loaded.admittedReads,1);assert.equal(loaded.supplementAccountedCount,1);
    const observation=loaded.supplements.get('2409')!;
    assert.equal(observation.quoteStatus,'official_raw_quote');assert.equal(observation.knowledgeScope,'current_cutoff_only');
    assert.equal(observation.cutoff,'2026-10-05T08:00:00Z');assert.equal(observation.serverClock,currentRun().serverClock);
    assert.equal(observation.relative5d,null);assert.equal(observation.pricePhase,'unknown');
    const {observationHash,...receipt}=observation;assert.equal(observationHash,researchCanonicalHash(receipt));
    assert.equal(JSON.stringify(captured),before);
  }
});
test('DS02 server priority at lexical rear consumes the shared32 budget first and accounts all45',async()=>{
  const candidates=Array.from({length:45},(_,i)=>candidate(String(2400+i))).reverse();
  const prioritySymbols=Array.from({length:20},(_,i)=>String(2425+i));const called:string[]=[];
  const result=await loadDiscoveryPriceEnrichment(mockClient().client,candidates,cutoff,{
    currentRun:currentRun(prioritySymbols),reader:async(_db,row)=>{called.push(row.symbol);return currentFixture(row);}});
  assert.deepEqual(called.slice(0,20),prioritySymbols);assert.equal(called.length,32);
  assert.equal(result.accountedCount,45);assert.equal(result.supplementAccountedCount,45);
  assert.equal([...result.supplements.values()].filter((row)=>row.attempted).length,32);
  for(const symbol of prioritySymbols) assert.equal(result.supplements.get(symbol)!.quoteStatus,'official_raw_quote');
  assert.equal([...result.supplements.values()].filter((row)=>row.missing.includes('price_read_admission_bound')).length,13);
  assert.deepEqual(candidates.map((row)=>row.symbol),Array.from({length:45},(_,i)=>String(2444-i)));
});
test('DS03 no future source clock/session or weak provenance enters an earlier current cutoff',async()=>{
  for(const mutate of [(r:DiscoveryPriceRead)=>{r.quoteProvenance!.publishedAt='2026-10-02T09:00:00Z';},
    (r:DiscoveryPriceRead)=>{r.quoteProvenance!.observedAt='2026-10-02T09:00:00Z';},
    (r:DiscoveryPriceRead)=>{r.quote!.availableAt='2026-10-02T09:00:00Z';r.quoteProvenance!.availableAt=r.quote!.availableAt;},
    (r:DiscoveryPriceRead)=>{r.quote!.session='2026-10-06';},
    (r:DiscoveryPriceRead)=>{delete r.quoteProvenance;},
    (r:DiscoveryPriceRead)=>{r.quoteProvenance!.exchange='TPEX';},
    (r:DiscoveryPriceRead)=>{r.quoteProvenance!.observedAt='2026-10-02T05:00:00Z';}]) {
    const read=currentFixture(candidate());mutate(read);
    const loaded=await loadDiscoveryPriceEnrichment(mockClient().client,[candidate()],cutoff,
      {currentRun:currentRun(),reader:async()=>read});
    assert.equal(loaded.supplements.get('2409')!.quote,null);
    assert.equal(loaded.supplements.get('2409')!.quoteStatus,'missing_at_current_cutoff');
    assert.ok(loaded.supplements.get('2409')!.missing.includes('current_quote_provenance_invalid'));
  }
});
test('DS04 current priority is independent of missing first evidence or registry read failure',async()=>{
  const row={...candidate(),firstSeenAt:null,hasDiscoveryEvidence:false};
  const loaded=await loadDiscoveryPriceEnrichment(mockClient({},'research_first_discoveries_v1').client,[row],cutoff,
    {currentRun:currentRun(),reader:async()=>currentFixture(row)});
  assert.equal(loaded.contexts.get(row.symbol)!.quote,null);
  assert.ok(loaded.contexts.get(row.symbol)!.missing.includes('first_discovery_registry_read_failed'));
  assert.equal(loaded.supplements.get(row.symbol)!.quoteStatus,'official_raw_quote');
  assert.equal(loaded.admittedReads,1);
});
test('DS05 supplemental reads and earlier first reads share32 without leaking current data into first',async()=>{
  const rows=Array.from({length:32},(_,i)=>({...candidate(String(2400+i)),firstSeenAt:'2026-10-01T08:00:00Z'}));
  const called:string[]=[];
  const result=await loadDiscoveryPriceEnrichment(mockClient().client,rows,cutoff,{
    currentRun:currentRun(['2431']),reader:async(_db,row,at)=>{called.push(at);return currentFixture(row);}});
  assert.equal(result.admittedReads,32);assert.ok(called.every((at)=>at===cutoff));
  for(const row of rows){assert.equal(result.contexts.get(row.symbol)!.quote,null);
    assert.equal(result.contexts.get(row.symbol)!.cutoff,row.firstSeenAt);
    assert.ok(result.contexts.get(row.symbol)!.missing.includes('price_read_admission_bound'));}
  assert.equal(result.supplements.get('2431')!.quoteStatus,'official_raw_quote');
});
test('DS06 invalid server clock/unknown priority rejects before reads; deadline accounts all candidates',async()=>{
  for(const config of [{serverClock:'2026-10-01T00:00:00Z',prioritySymbols:['2409']},
    {serverClock:'2026-02-30T00:00:00Z',prioritySymbols:['2409']},currentRun(['9999']),currentRun(['2409','2409'])]) {
    const {client,calls}=mockClient();await assert.rejects(loadDiscoveryPriceEnrichment(client,[candidate()],cutoff,
      {currentRun:config}),/discovery_current_run_invalid/u);assert.equal(calls.length,0);
  }
  const ticks=[0,DISCOVERY_PRICE_BOUNDS.readMs+1];let reads=0;
  const result=await loadDiscoveryPriceEnrichment(mockClient().client,[candidate()],cutoff,{currentRun:currentRun(),
    monotonicNow:()=>ticks.shift() ?? DISCOVERY_PRICE_BOUNDS.readMs+1,reader:async()=>{reads++;return fixture();}});
  assert.equal(reads,0);assert.equal(result.supplementAccountedCount,1);
  assert.ok(result.supplements.get('2409')!.missing.includes('price_read_deadline'));
});
test('DS07 a late completed read is discarded and cannot enter current or first receipt',async()=>{
  let elapsed=0;
  const result=await loadDiscoveryPriceEnrichment(mockClient().client,[candidate()],cutoff,{currentRun:currentRun(),
    monotonicNow:()=>elapsed,reader:async(_db,row)=>{elapsed=DISCOVERY_PRICE_BOUNDS.readMs+1;return currentFixture(row);}});
  assert.equal(result.admittedReads,1);assert.equal(result.supplements.get('2409')!.quote,null);
  assert.equal(result.contexts.get('2409')!.quote,null);
  assert.ok(result.supplements.get('2409')!.missing.includes('price_read_deadline'));
});
test('DP11 fixed DB reader obtains only cutoff-visible raw quote; absent adapters remain missing',async()=>{
  const {client,calls}=mockClient(rawTables());
  const read=await readDiscoveryRawQuote(client,candidate(),cutoff,new AbortController().signal);
  assert.equal(read.quote?.close,100);assert.equal(read.latestCompletedSession,session);assert.equal(read.window,null);
  assert.ok(read.missing.includes('aligned_benchmark_adapter_unavailable'));
  assert.equal(evaluateDiscoveryPrice(read,cutoff).relative5d,null);
  assert.ok(calls.some((call)=>call.method==='lte' && call.args[0]==='available_at' && call.args[1]===cutoff));
  assert.equal(calls.every((call)=>['tw_trading_sessions_v3','official_price_history'].includes(call.table)),true);
});
test('DP12 cache official conflicts, future availability and invalid price source never verify a quote',async()=>{
  for(const mutate of [(tables:ReturnType<typeof rawTables>)=>{tables.official_price_history[0].integrityStatus='conflict';},
    (tables:ReturnType<typeof rawTables>)=>{tables.official_price_history[0].available_at='2026-10-03T06:00:00Z';},
    (tables:ReturnType<typeof rawTables>)=>{tables.official_price_history[0].source_url='https://attacker.test/twse.com.tw';}]) {
    const tables=rawTables();mutate(tables);const {client}=mockClient(tables);
    const result=await readDiscoveryRawQuote(client,candidate(),cutoff,new AbortController().signal);
    assert.equal(result.quote,null);assert.ok(result.missing.includes('official_quote_validation_failed'));
  }
});
test('DP13 no weekday or holiday guess certifies a stale latest completed session',async()=>{
  const {client}=mockClient(rawTables());
  const result=await readDiscoveryRawQuote(client,candidate(),'2026-10-05T08:00:00Z',new AbortController().signal);
  assert.equal(result.quote?.session,session);assert.equal(result.latestCompletedSession,null);
  assert.ok(result.missing.includes('latest_completed_session_freshness_unverified'));
});
test('DP14 calendar correction conflicts and incomplete clocks cannot become completed authority',async()=>{
  const tables=rawTables();tables.tw_trading_sessions_v3.push({...tables.tw_trading_sessions_v3[0],status:'cancelled'});
  const {client}=mockClient(tables);
  assert.equal((await readDiscoveryRawQuote(client,candidate(),cutoff,new AbortController().signal)).quote,null);
  tables.tw_trading_sessions_v3.pop();tables.tw_trading_sessions_v3[0].collected_at=`${session}T05:00:00Z`;
  assert.ok((await readDiscoveryRawQuote(mockClient(tables).client,candidate(),cutoff,new AbortController().signal)).missing.includes('official_calendar_validation_failed'));
});
test('DP15 exchange/provider conflict and ambiguous integrity flags remain visible failures',async()=>{
  const tables=rawTables();tables.official_price_history[0].source_url='https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock';
  assert.equal((await readDiscoveryRawQuote(mockClient(tables).client,candidate(),cutoff,new AbortController().signal)).quote,null);
  const mixed=rawTables();Object.assign(mixed.official_price_history[0],{integrity_status:'conflict'});
  assert.equal((await readDiscoveryRawQuote(mockClient(mixed).client,candidate(),cutoff,new AbortController().signal)).quote,null);
});
test('DP16 row clock before actual calendar close fails even with a recomputed dataset hash',()=>{
  const read=fixture();read.window!.stock[60].availableAt=`${session}T05:00:00Z`;
  const hash=discoveryWindowDatasetHash(read.window!);read.window!.validation!.datasetHash=hash;read.window!.phase!.datasetHash=hash;
  const result=evaluateDiscoveryPrice(read,cutoff);
  assert.equal(result.relative60d,null);assert.equal(result.pricePhase,'unknown');
  assert.ok(result.missing.includes('price_session_or_validation_clock_invalid'));
});
test('DP17 malformed/future immutable registry record cannot be replaced by a current quote',async()=>{
  const first={symbol:'2409',run_id:uuid(1),first_seen_at:cutoff,captured_at:'2026-10-06T09:00:00Z',snapshot:{price:fixture().quote}};
  let reads=0;const {client}=mockClient({research_first_discoveries_v1:[first]});
  const result=await loadDiscoveryPriceEnrichment(client,[candidate()],cutoff,{reader:async()=>{reads++;return fixture();}});
  assert.equal(reads,0);assert.equal(result.contexts.get('2409')!.quote,null);
  assert.ok(result.contexts.get('2409')!.missing.includes('immutable_first_discovery_invalid'));
});
test('DP18 registry over the fixed row bound accounts all candidates as missing without new reads',async()=>{
  const first=Array.from({length:5001},(_,i)=>({symbol:String(1000+i),run_id:uuid(i),first_seen_at:cutoff,
    captured_at:cutoff,snapshot:{price:null}}));
  const {client}=mockClient({research_first_discoveries_v1:first});let reads=0;
  const result=await loadDiscoveryPriceEnrichment(client,[candidate()],cutoff,{reader:async()=>{reads++;return fixture();}});
  assert.equal(reads,0);assert.equal(result.accountedCount,1);
  assert.ok(result.contexts.get('2409')!.missing.includes('first_discovery_registry_read_bound'));
});
