import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';
import { breadthForRoster } from './market-breadth.ts';
const days=Array.from({length:30},(_,i)=>new Date(Date.UTC(2026,9,1+i)).toISOString().slice(0,10)),signal=days.at(-1)!;
const prices=(selected=days)=>selected.map((date,i)=>({date,close:100+i}));
test('signal close is mandatory even with20 old positive closes; missing and short counts are distinct',()=>{
 const result=breadthForRoster(new Map([['5274',prices(days.slice(0,29))],['6488',prices(days.slice(-19))]]),new Set(['5274','6488']),signal,days);
 assert.equal(result.observed,0);assert.equal(result.diagnostics.missingSignalClose,1);assert.equal(result.diagnostics.shortHistory,1);
});
test('latest20 of30 with signal stays valid through earlier gaps and exact20 presence is only diagnostic',()=>{
 const selected=days.filter((_,i)=>i!==25),result=breadthForRoster(new Map([['5274',prices(selected)]]),new Set(['5274']),signal,days);
 assert.equal(result.observed,1);assert.equal(result.numerator,1);assert.equal(result.diagnostics.strictLast20Present,0);
 assert.equal(result.diagnostics.signalPlus20Of30,1);assert.equal(result.diagnostics.caComparability,null);assert.equal(result.diagnostics.marketAuthority,false);
});
test('same-day duplicates collapse, conflicting duplicates exclude issuer, future and off-window rows never fill20',()=>{
 const good=prices(),result=breadthForRoster(new Map([['5274',[...good,good[0]]],['6488',[...good,{date:days[0],close:999}]],
  ['1234',[...prices(days.slice(-19)),{date:'2026-11-01',close:999},{date:'2026-09-01',close:999}]]]),new Set(['5274','6488','1234']),signal,days);
 assert.equal(result.observed,1);assert.equal(result.diagnostics.conflictingSessionRows,1);assert.equal(result.diagnostics.shortHistory,1);
 assert.equal(result.diagnostics.excludedRows,2);
});
test('nonpositive/nonfinite closes and missing target cannot be repaired by another day',()=>{
 for(const close of [0,-1,NaN,Infinity]){
  const rows=prices();rows[29]={date:signal,close};
  assert.equal(breadthForRoster(new Map([['5274',rows]]),new Set(['5274']),signal,days).observed,0);
 }
 for(const window of [days.slice(0,29),[...days,signal],[...days].reverse(),[...days,'2026-11-01']])
  assert.throws(()=>breadthForRoster(new Map(),new Set(),signal,window),/window_invalid/u);
});
test('both ACTUAL market-evidence caller expressions bind signal day and the30-date window',async()=>{
 const source=await readFile(new URL('./market-evidence.ts',import.meta.url),'utf8'),ast=ts.createSourceFile('market-evidence.ts',source,ts.ScriptTarget.Latest,true);
 const ingest=ast.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='ingestOfficialMarketEvidence');
 assert.ok(ingest&&ts.isFunctionDeclaration(ingest)&&ingest.body);
 const selected=ingest.body.statements.filter(node=>ts.isVariableStatement(node)&&node.declarationList.declarations.some(declaration=>
  ts.isIdentifier(declaration.name)&&['histories','twseBreadth','tpexBreadth'].includes(declaration.name.text)));
 assert.equal(selected.length,3);
 const isolatedModule={exports:{} as {twseBreadth?:ReturnType<typeof breadthForRoster>;tpexBreadth?:ReturnType<typeof breadthForRoster>}};
 const payload=selected.map(node=>node.getText(ast)).join('\n')+'\nmodule.exports={twseBreadth,tpexBreadth};';
 vm.runInNewContext(ts.transpileModule(payload,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:isolatedModule,breadthForRoster,sessionDate:signal,last20:days,twseRoster:new Set(['2330']),tpexRoster:new Set(['5274']),
   twseDaily:days.map(date=>({date,rows:new Map(date===signal?[]:[['2330',100]])})),
   tpexDaily:days.map((date,i)=>({date,rows:new Map([['5274',100+i]])}))});
 assert.equal(isolatedModule.exports.twseBreadth!.observed,0);assert.equal(isolatedModule.exports.twseBreadth!.diagnostics.missingSignalClose,1);
 assert.equal(isolatedModule.exports.tpexBreadth!.observed,1);assert.equal(isolatedModule.exports.tpexBreadth!.diagnostics.strictLast20Present,1);
});
test('ACTUAL whole ingest/build cannot bypass on old complete cache or resurrect its positive breadth after newzero',async()=>{
 const source=await readFile(new URL('./market-evidence.ts',import.meta.url),'utf8'),events:string[]=[],writes:Array<{table:string;data:unknown}>=[];
 const sessions=Array.from({length:520},(_,i)=>new Date(Date.UTC(2026,10,13-519+i)).toISOString().slice(0,10)),target=sessions.at(-1)!;
 const oldProvenance={legacyBreadthRevision:'SYNTHETIC_OLD_VERSION'};
 const existing=sessions.flatMap((session,i)=>(['TWSE','TPEX'] as const).map(market=>({market,session_date:session,index_close:100+i,
  breadth_above_ma20:1,breadth_observed:1,breadth_eligible:1,foreign_net_twd:1,available_at:'2026-11-13T13:00:00Z',
  source_urls:[],provenance:oldProvenance})));
 function query(table:string){
  const q:Record<string,unknown>={};let from=0,to=Number.MAX_SAFE_INTEGER;
  for(const method of ['select','lte','eq','in','order','limit'])q[method]=()=>q;
  q.range=(start:number,end:number)=>{from=start;to=end;return q;};
  q.upsert=(data:unknown)=>{writes.push({table,data:JSON.parse(JSON.stringify(data))});return q;};
  q.single=async()=>({data:{id:'00000000-0000-4000-8000-000000000001'},error:null});
  q.then=(fulfilled:(value:{data:unknown;error:null})=>unknown)=>Promise.resolve({data:table==='official_market_evidence_history'?existing.slice(from,to+1):[],error:null}).then(fulfilled);
  return q;
 }
 const client={from:query,rpc:async(name:string)=>{assert.equal(name,'candidate_research_stock_authority_page');return {data:[
  {symbol:'2330',exchange:'TWSE'},{symbol:'5274',exchange:'TPEX'}],error:null};}};
 const stubs:Record<string,unknown>={
  './supabase-server.ts':{getSupabaseServerClient:()=>client},'./market-breadth.ts':{breadthForRoster},
  './candidate-research-policy.ts':{collectPagedAuthorityRows:async(mapper:(from:number,to:number)=>Promise<unknown>)=>mapper(0,499)},
  './tw-market.ts':{fetchTwseMarketDailyRows:async(date:string)=>{events.push('twse_daily');return new Map(date===target?[]:[['2330',{close:100}]]);},
   fetchOfficialJson:async(url:string)=>{
    if(url.includes('/afterTrading/dailyQuotes?')){events.push('tpex_daily');const date=new URL(url).searchParams.get('date')!.replaceAll('/','-');
     return {tables:[{fields:['代號','收盤'],data:date===target?[]:[['5274','100']]}]};}
    if(url.includes('/fund/BFI82U?'))return {fields:['單位名稱','買賣差額'],data:[['外資及陸資(不含外資自營商)','1']]};
    if(url.includes('/insti/summary?'))return {tables:[{fields:['單位名稱','買賣超(元)'],data:[['外資及陸資合計','1']]}]};
    throw Error('unexpected synthetic source request');
   }},
 };
 const isolatedModule:{exports:Record<string,unknown>}={exports:{}};
 vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {module:isolatedModule,exports:isolatedModule.exports,require:(name:string)=>{assert.ok(Object.hasOwn(stubs,name),name);return stubs[name];},
   Map,Set,Date,Promise,Object,Number,String,Array,Error});
 const build=isolatedModule.exports.buildMarketEvidenceSnapshot as (day:string,cutoff:string,sessions:string[])=>Promise<{status:string;breadthState:null|{observed:number};
  breadthByMarket:Array<{observed:number}>;riskBudget:string|null;missingComponents:string[]}>;
 const result=await build(target,'2026-11-15T02:00:00Z',sessions);
 assert.equal(events.filter(event=>event==='twse_daily').length,30);assert.equal(events.filter(event=>event==='tpex_daily').length,30);
 assert.equal(result.status,'data_incomplete');assert.equal(result.breadthState,null);assert.equal(result.riskBudget,null);
 assert.ok(result.breadthByMarket.every(row=>row.observed===0));assert.ok(result.missingComponents.includes('twse_tpex_breadth_95pct'));
 function finite(value:unknown){if(typeof value==='number')assert.ok(Number.isFinite(value));
  else if(value&&typeof value==='object')for(const child of Object.values(value))finite(child);}
 finite(result);assert.equal(JSON.parse(JSON.stringify(result)).breadthState,null);
 const snapshots=writes.filter(write=>write.table==='market_evidence_snapshots');assert.equal(snapshots.length,1);
 const snapshot=snapshots[0].data as {model_version:string;provenance:{breadthPricePresenceDiagnostics:{TWSE:{missingSignalClose:number;caComparability:null}}}};
 assert.equal(snapshot.model_version,'market-evidence-v2.0.1-signal-close');assert.equal(snapshot.provenance.breadthPricePresenceDiagnostics.TWSE.missingSignalClose,1);
 assert.equal(snapshot.provenance.breadthPricePresenceDiagnostics.TWSE.caComparability,null);
 for(const write of writes.filter(write=>write.table==='official_market_evidence_history')){
  assert.ok(Array.isArray(write.data));for(const row of write.data){assert.equal(row.breadth_observed,1);assert.equal(row.breadth_eligible,1);assert.deepEqual(row.provenance,oldProvenance);}
 }
});
