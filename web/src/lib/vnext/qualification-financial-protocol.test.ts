/** Actual qualification constructor, synthetic positive authority ports only.
 * No real financial/price/review/role/SQL acceptance or provider call. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
type Row=Record<string,unknown>;
const nativeRequire=createRequire(import.meta.url),root=fileURLToPath(new URL('./',import.meta.url));
function fixture(stripped:boolean,alreadyPublished=false,matchingQuote=true){
 const context=vm.createContext({});
 vm.runInContext(`
 const state={calls:[],proofs:[],valuationCalls:0,coverageCalls:0};
 const identity={principal:'SYNTHETIC_AUTHOR',role:'author'};
 const fact={fact_id:'SYNTHETIC_FACT',fact_key:'quarterly_revenue',value:100,unit:'TWD',period_end:'2026-06-30',recorded_at:'2026-10-22T01:00:00Z',
  validation_status:'validated',estimate_kind:'reported',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true};
 const evidence={id:fact.fact_id,key:fact.fact_key,value:fact.value,unit:fact.unit,period:fact.period_end,sourceTier:'official',kind:'fact',availableAt:'2026-10-22T01:00:00Z',
  ${stripped?'':"financial:{schemaVersion:'vnext-financial-observation-v1',gaps:[]},"}};
 const quoteEvidence={id:'SYNTHETIC_QUOTE',key:'current_price',value:100,period:'2026-10-21',unit:'TWD/share',sourceTier:'official',kind:'fact',availableAt:'2026-10-21T06:00:00.123456Z'};
 const frozen={cutoff:'2026-10-23T06:00:00Z',evidence:[evidence,quoteEvidence],gaps:[],${stripped?'':"financialObservationInventory:{schemaVersion:'vnext-financial-observation-v1',count:1},"}};
 const binding={alreadyPublished:${alreadyPublished},inputHash:'${'a'.repeat(64)}',symbol:'2330',evidence:frozen};
 const client={rpc:(name)=>{
  state.calls.push(name);if(name==='vnext_provider_command_v1')return {data:{state:'reviewing',inputHash:binding.inputHash,authorArtifact:{},review:{}},error:null};
  if(name==='read_financial_facts_for_stocks_as_of')return {limit:async()=>({data:[fact],error:null})};throw Error('unexpected_synthetic_rpc');
 },from:(table)=>{
  state.calls.push(table);if(!['stocks','stock_instruments_v3','tw_trading_sessions_v3'].includes(table))throw Error('unexpected_synthetic_table');
  const data=table==='stocks'?{id:'SYNTHETIC_STOCK',symbol:'2330',sector:'SYNTHETIC'}:table==='stock_instruments_v3'?{exchange:'TWSE'}:{session_id:'2026-10-21',close_at:'2026-10-21T05:30:00Z'};
  const chain={select:()=>chain,eq:()=>chain,lte:()=>chain,or:()=>chain,order:()=>chain,limit:()=>chain,single:async()=>({data,error:null}),maybeSingle:async()=>({data,error:null})};return chain;
 }};
 const mocks={
  'store':{command:async(_actor,action,request)=>{state.calls.push(action);if(action==='qualification-context')return binding;
   if(action!=='record-qualification')throw Error('unexpected_synthetic_command');state.proofs.push(request.proof);return {recorded:true};}},
  'supabase-server':{getSupabaseServerClient:()=>{state.calls.push('client');return client;}},
  'candidate-financial-coverage':{financialCoverageSummary:()=>{state.coverageCalls++;return {status:'complete'};}},
  'tw-entry-plan-authority':{
   acquireTwEntryForwardCalendar:async()=>({SYNTHETIC:true}),
   loadTwEntryPlanAuthority:async()=>({
    bars:[{close:100,session:'2026-10-21',volume:1000,sourceRef:'SYNTHETIC_PRICE',availableAt:'2026-10-21T06:00:00.123456Z'}],
    priceBasis:{status:'verified',adjustmentEvidenceHash:'SYNTHETIC_HISTORY'},missingData:[],sourceDatasetRevision:'SYNTHETIC_PRICE'
   }),
   loadTwEntryHistoricalPriceAuthority:async()=>({
    bars:[{close:100,session:'2026-10-21',sourceRef:'${matchingQuote?'SYNTHETIC_PRICE':'DIFFERENT_PRICE'}',
     sourceTimestamp:'2026-10-21T05:40:00.123456Z',availableAt:'2026-10-21T06:00:00.123456Z'}],
    priceBasis:{status:'verified',adjustmentEvidenceHash:'SYNTHETIC_HISTORY'},missingData:[]
   })
  },
  // Keep the valuation stub usable to isolate the independent SQL parity gate.
  'reviewed-valuation':{reviewedValuation:({quote})=>{state.valuationCalls++;
   state.quoteClock={observedAt:quote.observedAt??null,availableAt:quote.availableAt??null};return {usable:true,gaps:[]};}}
 };
 `,context);
 const cache=new Map<string,Row>(),allowed=new Set(['qualification.ts','financial-observation.ts','policy.ts','evidence-clock.ts','../candidate-price-history.ts']);
 function load(relative:string):Row{
  assert.ok(allowed.has(relative),`unexpected actual source:${relative}`);const file=path.resolve(root,relative),cached=cache.get(file);if(cached)return cached;
  let source=fs.readFileSync(file,'utf8');if(relative==='../candidate-price-history.ts'){
   const parsed=ts.createSourceFile(file,source,ts.ScriptTarget.Latest,true),declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isHistoryDate');
   assert.ok(declaration);source=declaration.getText(parsed);
  }
  const isolated={exports:{} as Row};cache.set(file,isolated.exports);
  const compiled=ts.transpileModule(source,{fileName:file,compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const wrapped=vm.runInContext(`(function(require,module,exports){${compiled}\n})`,context,{timeout:1000}) as(require:(name:string)=>unknown,record:typeof isolated,exports:Row)=>void;
  wrapped(name=>{if(name==='node:crypto')return nativeRequire(name);assert.ok(name.startsWith('.'),`unexpected external:${name}`);
   const resolved=path.resolve(path.dirname(file),name.endsWith('.ts')?name:`${name}.ts`),basename=path.basename(resolved,'.ts');
   const mocked=vm.runInContext(`mocks[${JSON.stringify(basename)}]`,context);if(mocked)return mocked;
   return load(path.relative(root,resolved));},isolated,isolated.exports);return isolated.exports;
 }
 const actual=load('qualification.ts').qualifyPublication as(actor:unknown,job:unknown)=>Promise<Row>;
 return {run:()=>actual(vm.runInContext('identity',context),'SYNTHETIC_JOB'),read:()=>JSON.parse(vm.runInContext('JSON.stringify(state)',context)) as {calls:string[];proofs:Row[];valuationCalls:number;coverageCalls:number;quoteClock?:{observedAt:string|null;availableAt:string|null}}};
}
test('actual new qualification cannot clear server SQL parity gap by stripping metadata/inventory or caller gap arrays',async()=>{
 for(const stripped of [false,true]){
  const f=fixture(stripped);await f.run();const state=f.read();assert.equal(state.proofs.length,1);const proof=state.proofs[0];
  assert.equal((proof.financialCoverage as Row).status,'complete');assert.equal((proof.priceBasis as Row).status,'verified');assert.equal((proof.valuation as Row).usable,true);
  assert.equal(proof.qualified,false);assert.deepEqual(proof.financialComparisonGaps,['missing_sql_financial_interval_basis_parity']);
  assert.deepEqual(state.quoteClock,{observedAt:'2026-10-21T05:40:00.123456Z',availableAt:'2026-10-21T06:00:00.123456Z'});
  assert.equal(state.valuationCalls,1);assert.equal(state.coverageCalls,1);assert.equal(state.calls.filter(call=>call==='record-qualification').length,1);
 }
});
test('alreadyPublished historical response returns before any new qualification or source/client work',async()=>{
 const f=fixture(true,true),result=await f.run();assert.equal(result.alreadyPublished,true);
 assert.deepEqual(f.read().calls,['qualification-context']);assert.deepEqual(f.read().proofs,[]);
});
test('an equal close for the same session cannot borrow another price observation clock',async()=>{
 const f=fixture(false,false,false);await f.run();
 assert.deepEqual(f.read().quoteClock,{observedAt:null,availableAt:null});
});
