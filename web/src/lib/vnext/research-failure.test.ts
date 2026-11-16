import assert from 'node:assert/strict';
import test,{before,after} from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {researchFailureDisposition} from './research-failure.ts';
import * as preparationReconciliation from './preparation-reconciliation.ts';
import * as launchRankingRead from './launch-ranking-read.ts';
import * as forecastCurrent from './forecast-current.ts';
import * as actionTerms from './corporate-action-terms.ts';
import {FINANCIAL_PROVIDER_PROTOCOL} from './financial-evidence-sources.ts';
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
 const allowed=new Set(['store.ts','policy.ts','research.ts','financial-observation.ts','catalyst-cancellation.ts','business-criteria.ts','semantic-criteria.ts','runtime.ts','factors.ts','audit-quote-clock.ts','../candidate-price-history.ts','screening.ts','artifact-financial-summary.ts','citations.ts','financial-evidence-sources.ts','evidence-clock.ts','worker-output.ts','research-failure.ts']);
 const identity={principal:'synthetic-author',role:'author' as const};
 const admissionHash='c'.repeat(64);
 const launch=mode.startsWith('launch_'),launchPolicy=launchRankingRead.LAUNCH_RANKING_POLICY;
 const stockId='00000000-0000-4000-8000-000000000020';
 const candidate={hash:admissionHash,...(launch?{researchPolicyVersion:launchPolicy}:{})};
 const body={jobId:'00000000-0000-4000-8000-000000000001',executionId:'00000000-0000-4000-8000-000000000002'};
 const sourceAt='2026-10-22T06:00:00Z',sourceUrl='https://www.twse.com.tw/synthetic-period.json',sha='b'.repeat(64);
 const old:Row={fact_id:'00000000-0000-4000-8000-000000000003',stock_id:stockId,fact_key:'quarterly_basic_eps',period_start:'2026-07-01',period_end:'2026-09-30',duration_kind:'quarterly',value:8.11,unit:'TWD_per_share',provider:'twse',authority_tier:'official_filing',estimate_kind:'reported',estimate_horizon:'reported_period',filing_restatement_id:'SYNTHETIC_OLD',source_ref:'twse-openapi:synthetic-old-eps',source_timestamp:sourceAt,collected_at:sourceAt,recorded_at:sourceAt,validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true};
 const facts=mode==='newer_rejected_financial'?[old,{...old,fact_id:'00000000-0000-4000-8000-000000000004',value:9.99,filing_restatement_id:'SYNTHETIC_NEW',recorded_at:'2026-10-23T00:30:00Z',validation_status:'rejected',unit_valid:false}]:[];
 const sourceTables:Record<string,Row[]>={
  candidate_financial_fact_provenance_v4:[{provenance_id:'synthetic-provenance',fact_id:old.fact_id,acquisition_job_id:'synthetic-acquisition',source_url:sourceUrl,source_sha256:sha,locator:{source_ref:old.source_ref,period_end:old.period_end,fact_key:old.fact_key},extracted_at:sourceAt,recorded_at:sourceAt}],
  candidate_financial_document_fact_links_v8:[],
  candidate_financial_acquisition_jobs_v4:[{job_id:'synthetic-acquisition',stock_id:old.stock_id,period_end:old.period_end,status:'terminal',terminal_reason:'complete',response_sha256:sha,source_url:sourceUrl,collected_at:sourceAt,created_at:sourceAt,updated_at:sourceAt}],
 };
 const client={from(table:string){
  calls.push({action:`cache:${table}`});assert.ok(['stocks','stock_instruments_v3'].includes(table)||table in sourceTables,`unexpected financial read ${table}`);
  const filters:Array<(row:Row)=>boolean>=[];
  const query={select:()=>query,eq:()=>query,or:()=>query,lte:()=>query,order:()=>query,limit:()=>query,
   in:(key:string,ids:unknown[])=>{filters.push(row=>ids.includes(row[key]));return query;},
   maybeSingle:async()=>table==='stocks'?{data:mode==='stock_missing'?null:{id:stockId,symbol:'2330',name:'Synthetic',sector:'general'},error:mode==='stock_timeout'?{message:'timeout'}:null}:{data:mode==='trading_missing'?null:{exchange:'TWSE',valid_from:'2020-01-01'},error:mode==='trading_timeout'?{message:'timeout'}:null},
   then(resolve:(value:unknown)=>void,reject:(error:unknown)=>void){return Promise.resolve({data:sourceTables[table].filter(row=>filters.every(filter=>filter(row))),error:null}).then(resolve,reject);}};
  return query;
 },rpc(name:string,args:Row){
  if(name==='read_financial_facts_for_stocks_as_of'){calls.push({action:'financial-asof'});return {limit:async(count:number)=>{assert.equal(count,2001);return {data:mode==='financial_timeout'?null:facts,error:mode==='financial_timeout'?{message:'transport timed out'}:null};}};}
  if(name==='vnext_launch_research_policy_v1'){
   calls.push({action:'launch-policy'});
   assert.deepEqual(args,{p_principal:identity.principal,p_job:body.jobId,p_execution:body.executionId,p_input_hash:admissionHash});
   return {data:mode==='launch_unbound'?null:{researchPolicyVersion:launchPolicy},error:null};
  }
  if(name==='vnext_forecast_read_v1'||name==='vnext_action_terms_read_v1'){
   const schemaVersion=name==='vnext_forecast_read_v1'?'vnext-current-forecasts-v1':'vnext-current-action-terms-v1';
   return {data:{schemaVersion,stockId,symbol:'2330',asOf:sourceAt,evidence:[],receipts:[],gaps:[]},error:null};
  }
  assert.equal(name,'vnext_command_v1');const action=String(args.p_command),request=args.p_request as Row;calls.push({action,body:request});
  if(action==='claim')return {data:{execute:true,...body,symbol:'2330',session:'2026-10-22',inputHash:admissionHash,evidence:candidate},error:null};
  if(action==='fail' && mode==='failure_receipt_lost')throw Error('synthetic mutation response lost');
  if(action==='author-context')return {data:mode==='author_replay'?{committed:true}:{inputHash:'synthetic',evidence:{evidence:[]}},error:null};
  if(action==='review-context')return {data:{inputHash:'synthetic',evidence:{evidence:[]},authorArtifact:null},error:null};
  if(action==='author')return {data:{authored:true,replay:true},error:null};
  if(action==='work-context')return {data:{...body,inputHash:admissionHash,evidence:candidate,...(launch?{financialProviderProtocol:FINANCIAL_PROVIDER_PROTOCOL}:{})},error:null};
  if(action==='prepare'&&launch)return {data:{frozen:true,inputHash:request.inputHash},error:null};
  assert.ok(['fail','review-fail'].includes(action),`unexpected store mutation ${action}`);return {data:{recorded:true},error:null};
 }};
 function load(name:string):Record<string,unknown>{
  if(!allowed.has(name))throw Error(`unexpected_failure_source:${name}`);const prior=cache.get(name);if(prior)return prior;
  const filename=new URL(name,import.meta.url);let source=fs.readFileSync(filename,'utf8');
  if(name==='../candidate-price-history.ts'){
   const parsed=ts.createSourceFile(filename.pathname,source,ts.ScriptTarget.Latest,true);
   const declaration=parsed.statements.find(node=>ts.isFunctionDeclaration(node)&&node.name?.text==='isHistoryDate');
   if(!declaration)throw Error('actual_history_date_validator_missing');source=declaration.getText(parsed);
  }
  const compiled=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:name}).outputText;
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
   if(dependency==='./launch-ranking-read.ts')return launchRankingRead;
   if(dependency==='./forecast-current.ts')return forecastCurrent;
   if(dependency==='./corporate-action-terms.ts')return actionTerms;
   if(dependency==='./preparation-reconciliation.ts')return preparationReconciliation;
   if(dependency==='../public-source-url.ts')return requireNative('../public-source-url.ts');
   if(dependency==='../candidate-price-history.ts')return load(dependency);
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
test('legacy preparation rejects zero validated financial data before preparation publication and records one permanent failure',async()=>{
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

test('legacy preparation cannot revive a validated EPS beneath a newer rejected same-grain fact',async()=>{
 const {store,identity,body,calls}=fixture('newer_rejected_financial');
 await assert.rejects(()=>store.executeResearch(identity,body),/vnext_validated_financial_data_missing/);
 const failures=calls.filter(call=>call.action==='fail');assert.equal(failures.length,1);assert.equal(failures[0].body?.permanent,true);
 assert.equal(calls.filter(call=>call.action==='financial-asof').length,1);
 assert.ok(calls.some(call=>call.action==='cache:candidate_financial_fact_provenance_v4'));
 assert.ok(calls.some(call=>call.action==='cache:candidate_financial_acquisition_jobs_v4'));
 assert.equal(calls.some(call=>['prepare','author','review'].includes(call.action)),false);
 assert.equal(calls.filter(call=>call.action==='release').length,1);
});

test('ordinary execution accepts verified launch absence and rejects unbound work before acquisition',async()=>{
 const admitted=fixture('launch_empty');
 const result=await admitted.store.executeResearch(admitted.identity,admitted.body);
 const frozen=admitted.calls.find(call=>call.action==='prepare')?.body?.evidence as Row;
 assert.equal(result.published,false);
 assert.deepEqual(frozen.financialProviderInput,{schemaVersion:FINANCIAL_PROVIDER_PROTOCOL,facts:[]});
 assert.ok((frozen.gaps as string[]).includes('launch_fundamentals_unavailable'));
 assert.equal(admitted.calls.filter(call=>call.action==='claim').length,1);
 assert.equal(admitted.calls.some(call=>call.action==='fail'),false);
 const refused=fixture('launch_unbound');
 await assert.rejects(()=>refused.store.executeResearch(refused.identity,refused.body),/vnext_launch_research_policy_unavailable/);
 assert.equal(refused.calls.some(call=>['financial-preparation','prepare','fail'].includes(call.action)),false);
 assert.equal(refused.calls.filter(call=>call.action==='release').length,1);
});
