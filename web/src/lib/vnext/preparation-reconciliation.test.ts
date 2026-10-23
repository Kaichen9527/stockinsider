import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import ts from 'typescript';
import {freezeFinancialPreparation,reconcilePreparation,type PreparationDependencies} from './preparation-reconciliation.ts';
import {inputHash} from './policy.ts';
import type {Evidence} from './research.ts';
type Row=Record<string,unknown>;
const nativeRequire=createRequire(import.meta.url);
const jobId='00000000-0000-4000-8000-000000000001',executionId='00000000-0000-4000-8000-000000000002',stockId='00000000-0000-4000-8000-000000000003';
const author={principal:'synthetic-author',role:'author' as const};
const cutoff='2026-10-23T01:00:00.000Z',sourceAt='2026-10-22T06:00:00.000Z';
/** Actual source/controller execution with synthetic cache/DB transport. This
 * does not prove real financial authority, leases, SQL or a model invocation. */
function fixture(mode='ready'){
 const calls:string[]=[];
 const original:Row={hash:inputHash('synthetic-admission'),evidence:[],gaps:['prior_gap']};
 const state:Row={jobId,symbol:'2330',state:'running',executionId,inputHash:inputHash(original),prepared:false,deadline:'2026-10-23T01:01:00.000Z'};
 let context=original;
 const fact:Row={fact_id:'00000000-0000-4000-8000-000000000004',stock_id:stockId,fact_key:'quarterly_revenue',period_end:'2026-06-30',duration_kind:'quarterly',value:100,unit:'TWD',provider:'tpex',authority_tier:'official_filing',estimate_kind:'reported',estimate_horizon:'reported_period',source_ref:'tpex-openapi:synthetic-original',source_timestamp:sourceAt,collected_at:sourceAt,recorded_at:sourceAt,validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true};
 const sourceUrl='https://www.tpex.org.tw/synthetic-original.json',sha='a'.repeat(64);
 const tables:Record<string,Row[]>={stocks:[{id:stockId,symbol:'2330',market:'TW'}],stock_instruments_v3:[{stock_id:stockId,symbol:'2330',exchange:'TWSE',listing_status:'active',instrument_type:'common_stock',valid_from:'2020-01-01',valid_to:null,recorded_at:sourceAt,source_timestamp:sourceAt}],
  candidate_financial_acquisition_jobs_v4:[{job_id:'synthetic-original-acquisition',stock_id:stockId,period_end:'2026-06-30',status:'terminal',terminal_reason:'complete',response_sha256:sha,source_url:sourceUrl,collected_at:sourceAt,created_at:sourceAt,updated_at:sourceAt}],
  candidate_financial_document_receipts_v6:[],candidate_financial_document_fact_links_v8:[],candidate_issuer_ir_document_queue_v4:[],
  candidate_financial_fact_provenance_v4:[{provenance_id:'synthetic-provenance',fact_id:fact.fact_id,acquisition_job_id:'synthetic-original-acquisition',source_url:sourceUrl,source_sha256:sha,locator:{source_ref:fact.source_ref,period_end:fact.period_end,fact_key:fact.fact_key},extracted_at:sourceAt,recorded_at:sourceAt}],
  tw_trading_sessions_v3:[{session_id:'2026-10-22',market:'TWSE',status:'completed',provider:'twse',open_at:'2026-10-22T01:00:00Z',close_at:'2026-10-22T05:30:00Z',source_timestamp:sourceAt,collected_at:sourceAt,recorded_at:sourceAt}]};
 if(mode==='prepared' || mode==='provider_present'){state.prepared=true;context={...original,cutoff,evidence:[]};state.inputHash=inputHash(context);}
 if(mode==='expired')state.deadline='2026-10-23T00:59:59.000Z';
 if(mode==='queued')state.state='queued';
 if(mode==='published_historical'){state.state='published_historical';state.authorArtifact={raw:'must not expose'};}
 if(mode==='pending')tables.candidate_financial_document_receipts_v6=[{stock_id:stockId,receipt_id:'pending',receipt_status:'validation_pending',parser_status:'complete',financial_validation_status:'pending',accepted_at:sourceAt}];
 if(mode==='missing_stock')tables.stocks=[];
 if(mode==='future_instrument')tables.stock_instruments_v3[0].recorded_at='2099-01-01T00:00:00Z';
 if(mode==='future_instrument_source')tables.stock_instruments_v3[0].source_timestamp='2099-01-01T00:00:00Z';
 if(mode==='calendar_cancelled')tables.tw_trading_sessions_v3.push({...tables.tw_trading_sessions_v3[0],status:'cancelled',recorded_at:'2026-10-22T07:00:00Z'});
 const historical={notEntryAuthority:true as const,nextSessionAuthority:false as const,completedSessions:[],bars:[],priceBasis:null,sourceDatasetRevision:'synthetic-missing-price',availableAt:sourceAt,missingData:['adjusted_history_below_240']};
 const client={from(table:string){
  calls.push(`cache:${table}`);assert.ok(table in tables,`unexpected read ${table}`);
  const filters:Array<(row:Row)=>boolean>=[];
  const query={select:()=>query,eq:(key:string,value:unknown)=>{filters.push(row=>row[key]===value);return query;},in:(key:string,ids:unknown[])=>{filters.push(row=>ids.includes(row[key]));return query;},
   lte:(key:string,value:string)=>{filters.push(row=>Date.parse(String(row[key]))<=Date.parse(value));return query;},or:()=>query,order:()=>query,
   limit:(count:number)=>{assert.ok(count<=2001);return query;},
   maybeSingle:async()=>({data:tables[table].filter(row=>filters.every(f=>f(row)))[0]||null,error:null}),
   then(resolve:(value:unknown)=>void,reject:(error:unknown)=>void){return Promise.resolve({data:tables[table].filter(row=>filters.every(f=>f(row))),error:mode==='cache_read_lost'?{message:'uncertain transport'}:null}).then(resolve,reject);}};return query;
 },rpc(name:string,args:Row){
  if(name==='read_financial_facts_for_stocks_as_of'){calls.push('financial-asof');assert.deepEqual(args.p_stock_ids,[stockId]);return {limit:async(count:number)=>{assert.equal(count,2001);return {data:mode==='empty_facts'?[]:[fact],error:mode==='facts_read_lost'?{message:'uncertain'}:null};}};}
  if(name==='vnext_provider_command_v1')return journal(String(args.p_command) as 'inspect'|'read',args.p_request as Row).then(data=>({data,error:null}));
  assert.equal(name,'vnext_command_v1');return command(String(args.p_command),args.p_request as Row).then(data=>({data,error:null}));
 }} as unknown as PreparationDependencies['client'];
 let inspectCount=0;
 async function journal(action:'inspect'|'read',body:Row){
  calls.push(action);assert.equal(body.jobId,jobId);
  if(action==='inspect'){inspectCount++;if(mode==='race' && inspectCount===2)state.inputHash=inputHash('competing-input');return {...state};}
  assert.equal(body.executionId,executionId);
  if(mode==='journal_read_lost')throw Error('uncertain journal read');
  return state.prepared===true && mode==='provider_present'?{dispatch:false,invocation_id:'00000000-0000-4000-8000-000000000005',job_id:jobId,execution_id:executionId,input_hash:state.inputHash,principal:author.principal,task:'author',state:'uncertain',frozen_request:{private:'must not expose'},raw_response:{private:'must not expose'}}:{dispatch:false};
 }
 async function command(action:string,body:Row){
  calls.push(action);assert.ok(['work-context','prepare'].includes(action),`forbidden operation ${action}`);assert.equal(body.jobId,jobId);assert.equal(body.executionId,executionId);
  if(action==='work-context'){if(mode==='rights_withdrawn')throw Error('vnext_research_original_rights_no_longer_current');return {inputHash:state.inputHash,evidence:context};}
  if(state.prepared===true){if(body.inputHash!==state.inputHash)throw Error('vnext_frozen_preparation_conflict');return {inputHash:state.inputHash,replay:true};}
  state.prepared=true;state.inputHash=body.inputHash;context=body.evidence as Row;
  if(mode==='prepare_response_lost')throw Error('uncertain committed mutation response');
  if(mode==='wrong_prepare_hash')return {inputHash:inputHash('wrong'),frozen:true};
  if(mode==='missing_prepare_receipt')return {};
  if(mode==='extra_prepare_receipt')return {inputHash:state.inputHash,frozen:true,untrusted:true};
  return {inputHash:state.inputHash,frozen:true};
 }
 const deps:PreparationDependencies={client,journal,command,now:()=>cutoff,historical:async(request)=>{calls.push('historical');if(mode==='calendar_cancelled')assert.equal(request.signalSession,'');else assert.equal(request.signalSession,'2026-10-22');return historical;}};
 return {calls,state,deps,client,original,historical,command};
}
test('READ of ready immutable receipts has no mutation and exposes only readiness/authority gaps',async()=>{
 const f=fixture();const result=await reconcilePreparation(author,{jobId},f.deps);
 assert.equal(result.status,'ready');assert.equal(result.entryEligible,false);assert.equal(result.nextAction,'resume-preparation');assert.equal(result.automaticResume,false);assert.equal(result.priceAvailable,false);assert.equal(result.financialFacts,1);
 assert.equal(f.calls.includes('prepare'),false);assert.equal(f.state.prepared,false);assert.equal('evidence' in result,false);assert.equal('frozen_request' in result,false);
 assert.deepEqual(f.calls.filter(c=>!c.startsWith('cache:')),['inspect','work-context','read','financial-asof','historical','work-context','inspect','read']);
});
test('prepared replay observes immutable frozen state without cache or prepare; an existing invocation directs explicit recovery without exposing raw output',async()=>{
 for(const mode of ['prepared','provider_present']){const f=fixture(mode);const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(result.status,'prepared');assert.equal(result.inputHash,f.state.inputHash);assert.equal(result.nextAction,mode==='prepared'?'automatic':'recover');assert.deepEqual(f.calls,['inspect','work-context','read']);assert.equal(JSON.stringify(result).includes('must not expose'),false);}
});
test('current rights, expired/queued/historical work and unreadable journal never authorize preparation or cached IO',async()=>{
 for(const mode of ['rights_withdrawn','expired','queued','published_historical','journal_read_lost']){const f=fixture(mode);const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.notEqual(result.status,'ready');assert.equal(f.calls.some(c=>c.startsWith('cache:') || c==='prepare'),false);assert.notEqual(result.currentRights,'checked');assert.equal(JSON.stringify(result).includes('must not expose'),false);}
});
test('pending originals and definite missing cached facts are distinct from unknown reads; no read or resume fails/claims/restarts anything',async()=>{
 for(const [mode,status] of [['pending','unresolved'],['empty_facts','gap'],['missing_stock','gap'],['future_instrument','gap'],['future_instrument_source','gap'],['cache_read_lost','unresolved'],['facts_read_lost','unresolved']]){const f=fixture(mode);const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(result.status,status);assert.equal(f.calls.includes('prepare'),false);assert.equal(f.calls.includes('claim'),false);assert.equal(f.calls.includes('fail'),false);assert.equal(f.state.prepared,false);}
});
test('explicit cached resume prepares exactly once; subsequent requests observe frozen state without re-freezing',async()=>{
 const f=fixture();const original=JSON.stringify(f.original);const first=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(first.status,'prepared');assert.equal(first.prepared,true);assert.equal(f.calls.filter(c=>c==='prepare').length,1);assert.equal(JSON.stringify(f.original),original);
 const before=f.calls.length;const second=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(second.inputHash,first.inputHash);assert.deepEqual(f.calls.slice(before),['inspect','work-context','read']);assert.equal(f.calls.filter(c=>c==='prepare').length,1);
});
test('a committed prepare with lost response is uncertain and recovered only by explicit READ; no second mutation or new clock',async()=>{
 const f=fixture('prepare_response_lost');const deadline=f.state.deadline;const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(result.status,'unresolved');assert.equal(result.reason,'preparation_write_outcome_uncertain');assert.equal(f.state.prepared,true);assert.equal(f.state.deadline,deadline);
 const read=await reconcilePreparation(author,{jobId},f.deps);assert.equal(read.status,'prepared');assert.equal(f.calls.filter(c=>c==='prepare').length,1);assert.equal(f.calls.includes('fail'),false);
});
test('malformed successful mutation receipts stay uncertain; malformed inspect/journal cannot report preparation',async()=>{
 for(const mode of ['wrong_prepare_hash','missing_prepare_receipt','extra_prepare_receipt']){const f=fixture(mode);const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(result.reason,'preparation_write_receipt_invalid');assert.equal(result.status,'unresolved');assert.equal(f.calls.filter(c=>c==='prepare').length,1);assert.equal((await reconcilePreparation(author,{jobId},f.deps)).status,'prepared');}
 for(const change of [{prepared:null},{prepared:'true'},{symbol:'forged'},{symbol:2330},{state:'unknown'},{inputHash:'invalid'},{executionId:'invalid'},{deadline:'unknown'}]){const f=fixture();Object.assign(f.state,change);await assert.rejects(()=>reconcilePreparation(author,{jobId},f.deps),/vnext_preparation_(job|execution)_binding/);assert.deepEqual(f.calls,['inspect']);}
 const f=fixture('provider_present');const journal=f.deps.journal;f.deps.journal=async(action,body)=>{const row=await journal(action,body);return action==='read'?{...row,principal:'other-principal',task:'reviewer'}:row;};assert.equal((await reconcilePreparation(author,{jobId},f.deps)).reason,'provider_journal_read_unavailable');assert.equal(f.calls.includes('prepare'),false);
});
test('a changed execution/input or latest cancelled calendar cannot silently use stale authority',async()=>{
 const f=fixture('race');const result=await reconcilePreparation(author,{jobId},f.deps,true);assert.equal(result.reason,'original_execution_changed_or_expired');assert.equal(f.calls.includes('prepare'),false);
 const cancelled=fixture('calendar_cancelled');await reconcilePreparation(author,{jobId},cancelled.deps);assert.equal(cancelled.calls.includes('historical'),true); // empty anchor is independently refused by the real historical adapter
});
test('shared frozen projection is byte/hash equivalent to the original admitted execute projection and does not mutate sources',()=>{
 const f=fixture();const official:Evidence={id:'fact',key:'quarterly_revenue',value:100,unit:'TWD',period:'2026-06-30',source:'https://www.tpex.org.tw/original',sourceTier:'official',kind:'fact',eventAt:sourceAt,availableAt:sourceAt,contentHash:inputHash('synthetic-fact')};
 const sources={evidence:[official],receipts:[],deferredCount:0,deferredDigest:inputHash([]),deferredDetails:[],deferredDetailsTruncated:false,gaps:[]};const before=JSON.stringify(sources);
 const frozen={...f.original,cutoff,admissionHash:f.original.hash,priceAuthority:f.historical,financialSourceReceipts:sources.receipts,financialSourceDeferrals:{count:0,digest:sources.deferredDigest,details:[],detailsTruncated:false},gaps:['prior_gap','current_price_authority_unavailable','adjusted_history_below_240'],evidence:[official]};
 assert.deepEqual(freezeFinancialPreparation(f.original,f.historical,sources,cutoff),{inputHash:inputHash(frozen),evidence:frozen});assert.equal(JSON.stringify(sources),before);
});
function controllers(f:ReturnType<typeof fixture>){
 const cache=new Map<string,Record<string,unknown>>();const allowed=new Set(['http.ts','store.ts','policy.ts','auth.ts','request.ts','research.ts','runtime.ts','factors.ts','screening.ts','artifact-financial-summary.ts','citations.ts','financial-evidence-sources.ts','worker-output.ts','research-failure.ts','preparation-reconciliation.ts','cached-price-factors.ts']);
 const load=(name:string):Record<string,unknown>=>{
  if(!allowed.has(name))throw Error(`unexpected_preparation_source:${name}`);const prior=cache.get(name);if(prior)return prior;
  const filename=new URL(name,import.meta.url);const compiled=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:name}).outputText;
  const controllerModule={exports:{}};cache.set(name,controllerModule.exports);
  const require=(dependency:string):unknown=>{
   if(['node:crypto','node:async_hooks'].includes(dependency))return nativeRequire(dependency);
   if(dependency==='next/server')return nativeRequire('next/server');
   if(dependency==='./cached-admission.ts')return {cachedAdmissionBody:()=>{throw Error('unexpected admission');},currentReceiptBody:()=>{throw Error('unexpected content');}};
   if(['../supabase-server','../supabase-server.ts'].includes(dependency))return {getSupabaseServerClient:()=>f.client};
   if(dependency==='../taiwan-data-runtime')return {requireActiveVpsWriter:async()=>{f.calls.push('writer-metadata-read');return {ok:true,supabase:f.client};}};
   if(dependency==='../production-write-lease')return {acquireProductionWriteLease:async()=>{f.calls.push('lease-acquire');return 'synthetic-lease';},releaseProductionWriteLease:async()=>{f.calls.push('lease-release');}};
   if(dependency==='../tw-entry-plan-authority.ts')return {loadTwEntryHistoricalPriceAuthority:async(_client:unknown,request:Parameters<PreparationDependencies['historical']>[0])=>f.deps.historical(request)};
   if(dependency.startsWith('./'))return load(dependency.slice(2));
   throw Error(`forbidden_preparation_dependency:${dependency}`);
  };
  vm.compileFunction(compiled,['exports','require','module'],{filename:filename.pathname})(controllerModule.exports,require,controllerModule);return controllerModule.exports;
 };
 return {store:load('store.ts') as unknown as typeof import('./store.ts'),http:load('http.ts') as unknown as typeof import('./http.ts')};
}
test('actual HTTP-handler/store source contract uses configured author only; READ/replay has no lease and actual prepare has one',async()=>{
 const names=['STOCKINSIDER_VNEXT_ENABLED','STOCKINSIDER_VNEXT_AUTHOR_KEY','STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL','INTERNAL_API_KEY','STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL'];const prior=names.map(name=>process.env[name]);
 try{process.env.STOCKINSIDER_VNEXT_ENABLED='true';process.env.STOCKINSIDER_VNEXT_AUTHOR_KEY='synthetic-author-key';process.env.STOCKINSIDER_VNEXT_AUTHOR_PRINCIPAL=author.principal;process.env.INTERNAL_API_KEY='synthetic-operator-key';process.env.STOCKINSIDER_VNEXT_OPERATOR_PRINCIPAL='synthetic-operator';
  const f=fixture('prepared');f.state.deadline='2099-01-01T00:00:00.000Z';const {http,store}=controllers(f);
  const request=(body:Row,token='synthetic-author-key')=>new Request('http://localhost/api/internal/vnext-research',{method:'POST',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},body:JSON.stringify(body)});
  process.env.STOCKINSIDER_VNEXT_ENABLED='false';assert.equal(await http.vnextRoute(request({action:'preparation-read',jobId}),'vnext-research'),null);process.env.STOCKINSIDER_VNEXT_ENABLED='true';
  assert.equal((await http.vnextRoute(request({action:'preparation-read',jobId},'wrong'),'vnext-research'))!.status,401);
  for(const body of [{action:'preparation-read',jobId,principal:'forged'},{action:'resume-preparation',jobId:'invalid'}])assert.equal((await http.vnextRoute(request(body),'vnext-research'))!.status,409);
  assert.equal((await http.vnextRoute(request({action:'resume-preparation',jobId},'synthetic-operator-key'),'vnext-research'))!.status,409);
  assert.equal((await http.vnextRoute(request({action:'resume-preparation',symbols:[]},'synthetic-author-key'),'vnext-research'))!.status,200);assert.equal(f.calls.length,0);
  const response=await http.vnextRoute(request({action:'preparation-read',jobId}),'vnext-research');assert.equal(response!.status,200);const read=await response!.json();assert.equal(read.result.status,'prepared');assert.deepEqual(f.calls,['writer-metadata-read','inspect','work-context','read']);
  const before=f.calls.length;await store.resumeResearchPreparation(author,{jobId});assert.deepEqual(f.calls.slice(before),['writer-metadata-read','inspect','work-context','read']);assert.equal(f.calls.includes('prepare'),false);
  const ready=fixture();ready.state.deadline='2099-01-01T00:00:00.000Z';const actual=controllers(ready);const prepared=await actual.store.resumeResearchPreparation(author,{jobId});assert.equal(prepared.status,'prepared');assert.equal(ready.calls.filter(call=>call==='lease-acquire').length,1);assert.equal(ready.calls.filter(call=>call==='lease-release').length,1);assert.deepEqual(ready.calls.slice(-3),['lease-acquire','prepare','lease-release']);
 }finally{names.forEach((name,i)=>{if(prior[i]===undefined)delete process.env[name];else process.env[name]=prior[i];});}
});
