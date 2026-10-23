import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {researchFailureDisposition} from './research-failure.ts';
type Row=Record<string,unknown>;
const requireNative=createRequire(import.meta.url);
const previousEnabled=process.env.STOCKINSIDER_VNEXT_ENABLED;
before(()=>{process.env.STOCKINSIDER_VNEXT_ENABLED='true';});
after(()=>{if(previousEnabled===undefined)delete process.env.STOCKINSIDER_VNEXT_ENABLED;else process.env.STOCKINSIDER_VNEXT_ENABLED=previousEnabled;});
/** Execute the actual store controller. Only external financial preparation,
 * writer transport and DB responses are synthetic; no actual SQL lease, model
 * execution or official financial readiness is asserted by this fixture. */
function fixture(mode='empty_financial'){
 const calls:Array<{action:string;body?:Row}>=[];const cache=new Map<string,Record<string,unknown>>();
 const allowed=new Set(['store.ts','policy.ts','research.ts','catalyst-cancellation.ts','semantic-criteria.ts','runtime.ts','factors.ts','screening.ts','artifact-financial-summary.ts','citations.ts','financial-evidence-sources.ts','worker-output.ts','research-failure.ts']);
 const identity={principal:'synthetic-author',role:'author' as const};
 const body={jobId:'00000000-0000-4000-8000-000000000001',executionId:'00000000-0000-4000-8000-000000000002'};
 const client={from(table:string){calls.push({action:`cache:${table}`});const query={select:()=>query,eq:()=>query,or:()=>query,lte:()=>query,order:()=>query,limit:()=>query,maybeSingle:async()=>table==='stocks'?{data:mode==='stock_missing'?null:{id:'synthetic-stock',symbol:'2330',name:'Synthetic',sector:'general'},error:mode==='stock_timeout'?{message:'timeout'}:null}:{data:mode==='trading_missing'?null:{exchange:'TWSE',valid_from:'2020-01-01'},error:mode==='trading_timeout'?{message:'timeout'}:null}};return query;},rpc(name:string,args:Row){
  if(name==='read_financial_facts_for_stocks_as_of'){calls.push({action:'financial-asof'});return {limit:async(count:number)=>{assert.equal(count,10000);return {data:mode==='financial_timeout'?null:[],error:mode==='financial_timeout'?{message:'transport timed out'}:null};}};}
  assert.equal(name,'vnext_command_v1');const action=String(args.p_command),request=args.p_request as Row;calls.push({action,body:request});
  if(action==='claim')return {data:{execute:true,...body,symbol:'2330',session:'2026-10-22',evidence:{hash:'synthetic'}},error:null};
  if(action==='fail' && mode==='failure_receipt_lost')throw Error('synthetic mutation response lost');
  if(action==='author-context')return {data:mode==='author_replay'?{committed:true}:{inputHash:'synthetic',evidence:{evidence:[]}},error:null};
  if(action==='review-context')return {data:{inputHash:'synthetic',evidence:{evidence:[]},authorArtifact:null},error:null};
  if(action==='author')return {data:{authored:true,replay:true},error:null};
  assert.ok(['work-context','fail','review-fail'].includes(action),`unexpected store mutation ${action}`);return {data:{recorded:true},error:null};
 }};
 function load(name:string):Record<string,unknown>{
  if(!allowed.has(name))throw Error(`unexpected_failure_source:${name}`);const prior=cache.get(name);if(prior)return prior;
  const filename=new URL(name,import.meta.url);const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:name}).outputText;
  const controllerModule={exports:{}};cache.set(name,controllerModule.exports);
  const require=(dependency:string):unknown=>{
   if(['node:crypto','node:async_hooks'].includes(dependency))return requireNative(dependency);
   if(dependency==='../supabase-server')return {getSupabaseServerClient:()=>client};
   if(dependency==='../taiwan-data-runtime')return {requireActiveVpsWriter:async()=>{calls.push({action:'writer'});return {ok:true,supabase:client};}};
   if(dependency==='../production-write-lease')return {acquireProductionWriteLease:async()=>{calls.push({action:'acquire'});return 'synthetic-lease';},releaseProductionWriteLease:async()=>{calls.push({action:'release'});}};
   if(dependency==='./calendar-sync.ts')return {synchronizeExecutionCalendar:async()=>{calls.push({action:'calendar'});return {latestCompleted:'2026-10-21'};}};
   if(dependency==='../candidate-official-financials')return {refreshCandidateOfficialFinancials:async()=>{await (load('runtime.ts').verifyAdmittedResearch as (symbol:string)=>Promise<void>)('2330');calls.push({action:'financial-preparation'});return {failures:mode==='preparation_unknown'?[{error:'unknown'}]:[]};}};
   if(dependency==='../candidate-financial-document-worker')return {processCandidateFinancialDocumentReceipts:async()=>({reconciliationErrors:[],results:[]})};
   if(dependency==='../official-financial-validation-worker')return {validatePendingOfficialFinancials:async()=>({status:'success'})};
   if(dependency==='../tw-entry-plan-authority.ts')return {loadTwEntryHistoricalPriceAuthority:async()=>({notEntryAuthority:true,nextSessionAuthority:false,completedSessions:[],bars:[],priceBasis:null,missingData:['synthetic_missing_price_authority']})};
   if(dependency.startsWith('./'))return load(dependency.slice(2));
   throw Error(`unexpected_failure_dependency:${dependency}`);
  };
  vm.compileFunction(compiled,['exports','require','module'],{filename:filename.pathname})(controllerModule.exports,require,controllerModule);return controllerModule.exports;
 }
 return {store:load('store.ts') as unknown as typeof import('./store.ts'),identity,body,calls};
}
test('only confirmed missing authority, invalid output and definite settled rejections are permanent;429 alone is transient',()=>{
 for(const reason of ['vnext_validated_financial_data_missing','vnext_stock_authority_missing','vnext_trading_authority_missing','vnext_artifact_rejected:annualEps_required_numeric_or_null','vnext_review_rejected:review_binding','vnext_worker_author_invalid:unsupported_claim','provider_http_422','provider_http_403','provider_output_invalid_json'])assert.equal(researchFailureDisposition(Error(reason)),'permanent');
 assert.equal(researchFailureDisposition(Error('provider_http_429')),'transient');
 for(const reason of ['vnext_financial_preparation_incomplete','vnext_preparation_verified_facts_unavailable','vnext_stock_authority_read_uncertain','vnext_trading_authority_read_uncertain','vnext_provider_http_uncertain_500','timeout','fetch failed','provider_http_429:unknown-body','unexpected failure'])assert.equal(researchFailureDisposition(Error(reason)),'uncertain');
 const unknown=Error('provider_http_422');unknown.name='ProviderOutcomeUncertain';assert.equal(researchFailureDisposition(unknown),'uncertain');assert.equal(researchFailureDisposition(null),'uncertain');
});
test('actual admitted store rejects zero validated financial data before preparation publication and records one permanent failure',async()=>{
 const prior=process.env.STOCKINSIDER_VNEXT_ENABLED;process.env.STOCKINSIDER_VNEXT_ENABLED='true';
 try{const {store,identity,body,calls}=fixture();await assert.rejects(()=>store.executeResearch(identity,body),/vnext_validated_financial_data_missing/);const failed=calls.filter(call=>call.action==='fail');assert.equal(failed.length,1);assert.equal(failed[0].body?.permanent,true);assert.equal(failed[0].body?.jobId,body.jobId);assert.ok(calls.some(call=>call.action==='claim'));assert.ok(calls.some(call=>call.action==='work-context'));assert.equal(calls.filter(call=>call.action==='financial-preparation').length,1);assert.equal(calls.some(call=>call.action==='prepare'),false);assert.equal(calls.filter(call=>call.action==='release').length,1);}finally{if(prior===undefined)delete process.env.STOCKINSIDER_VNEXT_ENABLED;else process.env.STOCKINSIDER_VNEXT_ENABLED=prior;}
});
test('actual store distinguishes absent stock/trading authority from transport uncertainty without extra mutation',async()=>{
 const expected:Record<string,RegExp>={stock_missing:/vnext_stock_authority_missing/,trading_missing:/vnext_trading_authority_missing/,stock_timeout:/vnext_stock_authority_read_uncertain/,trading_timeout:/vnext_trading_authority_read_uncertain/,financial_timeout:/vnext_preparation_verified_facts_unavailable/,preparation_unknown:/vnext_financial_preparation_incomplete/};
 for(const mode of Object.keys(expected)){const {store,identity,body,calls}=fixture(mode);await assert.rejects(()=>store.executeResearch(identity,body),expected[mode]);const failures=calls.filter(call=>call.action==='fail');assert.equal(failures.length,mode.endsWith('_missing')?1:0);if(failures.length)assert.equal(failures[0].body?.permanent,true);assert.equal(calls.some(call=>call.action==='prepare'),false);assert.equal(calls.filter(call=>call.action==='release').length,1);}
});
test('invalid author/review API artifacts pass permanent failure and exact committed author replay performs no new failure',async()=>{
 for(const role of ['author','reviewer'] as const){const {store,identity,body,calls}=fixture();if(role==='author')await assert.rejects(()=>store.submitAuthor(identity,{...body,artifact:null}),/vnext_artifact_rejected/);else await assert.rejects(()=>store.submitReview({...identity,role},{...body,review:null}),/vnext_review_rejected/);const failures=calls.filter(call=>['fail','review-fail'].includes(call.action));assert.equal(failures.length,1);assert.equal(failures[0].body?.permanent,true);assert.equal(calls.some(call=>call.action==='author' || call.action==='review'),false);}
 const replay=fixture('author_replay');assert.deepEqual(await replay.store.submitAuthor(replay.identity,{...replay.body,artifact:{syntheticImmutableReceipt:true}}),{authored:true,replay:true});assert.equal(replay.calls.some(call=>call.action==='fail'),false);
});
test('lost failure-write response stays explicitly uncertain and is never automatically sent again',async()=>{
 const {store,identity,body,calls}=fixture('failure_receipt_lost');await assert.rejects(()=>store.executeResearch(identity,body),/vnext_validated_financial_data_missing;failure_receipt_uncertain/);assert.equal(calls.filter(call=>call.action==='fail').length,1);assert.equal(calls.filter(call=>call.action==='claim').length,1);assert.equal(calls.some(call=>call.action==='prepare'),false);
});
test('wrong role fails before writer lease or any source authority access',async()=>{const {store,body,calls}=fixture();await assert.rejects(()=>store.executeResearch({principal:'synthetic-operator',role:'operator'},body),/vnext_author_required/);assert.deepEqual(calls,[]);});
