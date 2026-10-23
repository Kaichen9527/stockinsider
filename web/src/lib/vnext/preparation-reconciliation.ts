import {readCurrentForecasts,type CurrentForecasts} from './forecast-current.ts';
import {readCurrentActionTerms,validateCurrentActionTerms,type CurrentActionTerms} from './corporate-action-terms.ts';
import type {getSupabaseServerClient} from '../supabase-server.ts';
import type {TwEntryHistoricalAuthorityResult} from '../tw-entry-plan-authority.ts';
import type {VnextIdentity} from './auth.ts';
import type {Evidence} from './research.ts';
import {inputHash} from './policy.ts';
import {resolveFinancialEvidenceSources} from './financial-evidence-sources.ts';
import {currentPriceEvidence} from './cached-price-factors.ts';
import {currentPreparationInstrument,PREPARATION_INSTRUMENT_COLUMNS} from './preparation-trading-identity.ts';
type Row=Record<string,unknown>;
type Client=ReturnType<typeof getSupabaseServerClient>;
type Sources=Awaited<ReturnType<typeof resolveFinancialEvidenceSources>>;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/iu;
const hash=/^[a-f0-9]{64}$/u;
const known=(value:unknown,cutoff:string)=>typeof value==='string' && Number.isFinite(Date.parse(value)) && Date.parse(value)<=Date.parse(cutoff);
export function preparationRequest(identity:VnextIdentity,body:Row){
 if(identity.role!=='author')throw Error('vnext_author_required');
 if(Object.keys(body).some(key=>!['action','jobId'].includes(key)) || (body.action!==undefined && !['preparation-read','resume-preparation'].includes(String(body.action))) || typeof body.jobId!=='string' || !uuid.test(body.jobId))throw Error('vnext_preparation_job_id_only');
 return body.jobId;
}
/** Same frozen projection used by ordinary admitted preparation and cached
 * reconciliation. Source descriptors stay outside the provider projection. */
export function freezeFinancialPreparation(original:Row,historical:TwEntryHistoricalAuthorityResult,financialSources:Sources,cutoff:string,forecasts?:CurrentForecasts,actionTerms?:CurrentActionTerms){
 if(actionTerms)validateCurrentActionTerms(actionTerms);
 const evidence=[...financialSources.evidence,...currentPriceEvidence(historical),...(forecasts?.evidence||[]),...(actionTerms?.evidence||[])];
 if(forecasts&&Date.parse(forecasts.asOf)>Date.parse(cutoff))throw Error('vnext_forecast_future_snapshot');
 if(actionTerms&&Date.parse(actionTerms.asOf)>Date.parse(cutoff))throw Error('vnext_action_future_snapshot');
 const currentPrice=historical.priceBasis?.status==='verified'?historical.bars.at(-1):undefined;
 const frozen={...original,cutoff,admissionHash:original.hash,priceAuthority:historical,financialSourceReceipts:financialSources.receipts,
  ...(forecasts?{forecastSourceReceipts:forecasts.receipts,forecastSourceAsOf:forecasts.asOf}:{}),
  ...(actionTerms?{actionTermsReceipts:actionTerms.receipts,actionTermsAsOf:actionTerms.asOf,actionTermsGaps:actionTerms.gaps}:{}),
  financialSourceDeferrals:{count:financialSources.deferredCount,digest:financialSources.deferredDigest,details:financialSources.deferredDetails,detailsTruncated:financialSources.deferredDetailsTruncated},
  gaps:[...(Array.isArray(original.gaps)?original.gaps:[]),...financialSources.gaps,...(forecasts?.gaps||[]),...(actionTerms?.gaps||[]),...(!currentPrice?['current_price_authority_unavailable',...historical.missingData]:[])],
  evidence:[...(Array.isArray(original.evidence)?original.evidence as Evidence[]:[]).filter(e=>!evidence.some(f=>f.id===e.id)),...evidence]};
 return {inputHash:inputHash(frozen),evidence:frozen};
}
export type PreparationDependencies={
 client:Client;
 command(action:string,body:Row):Promise<Row>;
 journal(action:'inspect'|'read',body:Row):Promise<Row>;
 historical(request:{stockId:string;symbol:string;exchange:'TWSE'|'TPEX';signalSession:string;cutoff:string}):Promise<TwEntryHistoricalAuthorityResult>;
 now?:()=>string;
};
const unresolved=(reason:string,extra:Row={})=>({status:'unresolved',reason,currentRights:'unavailable',nextAction:'preparation-read',automaticResume:false,reinvoke:false,...extra});
function sameExecution(a:Row,b:Row){return ['jobId','symbol','state','executionId','inputHash','deadline','prepared'].every(key=>a[key]===b[key]);}
async function currentContext(deps:PreparationDependencies,state:Row){
 const context=await deps.command('work-context',{jobId:state.jobId,executionId:state.executionId});
 if(context.inputHash!==state.inputHash || !context.evidence || typeof context.evidence!=='object' || Array.isArray(context.evidence))throw Error('vnext_preparation_context_changed');
 return context.evidence as Row;
}
async function readJournal(deps:PreparationDependencies,state:Row,identity:VnextIdentity){
 const record=await deps.journal('read',{jobId:state.jobId,executionId:state.executionId});
 if(record.dispatch!==false)throw Error('vnext_preparation_journal_read_invalid');
 if(record.invocation_id){
  if(!uuid.test(String(record.invocation_id)) || record.job_id!==state.jobId || record.execution_id!==state.executionId || record.input_hash!==state.inputHash || record.principal!==identity.principal || record.task!=='author' || !['dispatching','pending','uncertain','completed','failed'].includes(String(record.state)))throw Error('vnext_preparation_journal_binding');
 }else if(Object.keys(record).some(key=>key!=='dispatch')){
  // Existing SQL SELECT INTO a %ROWTYPE with no matching invocation returns
  // to_jsonb(invocation) with every declared column null, rather than {}.
  // Accept only that exact empty-row representation; no value is authority.
  const columns='invocation_id job_id task execution_id principal input_hash provider model model_version credential_identity prompt_version frozen_request request_hash state provider_response_id raw_response raw_output normalized_output error started_at deadline_at settled_at'.split(' ');
  if(Object.keys(record).sort().join('|')!==[...columns,'dispatch'].sort().join('|') || columns.some(key=>record[key]!==null))throw Error('vnext_preparation_journal_read_invalid');
  return {dispatch:false};
 }
 return record;
}
/** The latest cached session is only a query anchor. The existing historical
 * authority independently validates the full calendar/adjustment/price chain. */
async function signalSession(client:Client,exchange:string,cutoff:string){
 const result=await client.from('tw_trading_sessions_v3').select('session_id,market,status,provider,open_at,close_at,source_timestamp,collected_at,recorded_at')
  .eq('market',exchange).lte('source_timestamp',cutoff).lte('collected_at',cutoff).lte('recorded_at',cutoff)
  .order('session_id',{ascending:false}).order('recorded_at',{ascending:false}).limit(1001);
 if(result.error || !Array.isArray(result.data) || result.data.length>1000)throw Error('vnext_preparation_calendar_read_unresolved');
 const heads=new Map<string,Row>();
 for(const row of result.data as Row[]){
  if(typeof row.session_id!=='string' || !/^\d{4}-\d{2}-\d{2}$/u.test(row.session_id) || row.market!==exchange || row.provider!==exchange.toLowerCase()
   || !['completed','cancelled'].includes(String(row.status)) || !['source_timestamp','collected_at','recorded_at'].every(key=>known(row[key],cutoff)))throw Error('vnext_preparation_calendar_authority_unresolved');
  const prior=heads.get(row.session_id);
  if(!prior || Date.parse(String(row.recorded_at))>Date.parse(String(prior.recorded_at)))heads.set(row.session_id,row);
  else if(Date.parse(String(row.recorded_at))===Date.parse(String(prior.recorded_at)) && ['status','open_at','close_at','source_timestamp','collected_at'].some(key=>row[key]!==prior[key]))throw Error('vnext_preparation_calendar_conflict');
 }
 return [...heads.values()].filter(row=>row.status==='completed' && known(row.close_at,cutoff)).map(row=>String(row.session_id)).sort().at(-1)||'';
}
async function cachedProjection(deps:PreparationDependencies,state:Row,original:Row,cutoff:string,identity:VnextIdentity){
 const stocks=await deps.client.from('stocks').select('id,symbol,market').eq('symbol',String(state.symbol)).eq('market','TW').maybeSingle();
 if(stocks.error)throw Error('vnext_stock_authority_read_uncertain');
 if(!stocks.data)return {status:'gap',reason:'vnext_stock_authority_missing'};
 if(stocks.data.symbol!==state.symbol || stocks.data.market!=='TW' || typeof stocks.data.id!=='string' || !uuid.test(stocks.data.id))throw Error('vnext_preparation_stock_scope_mismatch');
 const stockId=String(stocks.data.id);
 // Read both the symbol and retained stock identity BEFORE filtering listing
 // status/validity. An older active row cannot hide a newer invalid/ambiguous head.
 const instrument=await deps.client.from('stock_instruments_v3').select(PREPARATION_INSTRUMENT_COLUMNS)
  .or(`symbol.eq.${state.symbol},stock_id.eq.${stockId}`).order('recorded_at',{ascending:false}).limit(1001);
 if(instrument.error)throw Error('vnext_trading_authority_read_uncertain');
 const selected=currentPreparationInstrument(instrument.data,{stockId,symbol:String(state.symbol),cutoff});
 if(selected.status!=='current')return selected;
 const exchange=selected.exchange;
 // Stock-scoped cache observation, not proof of this execution's lineage.
 // Never claim, settle, validate or reschedule any of that existing work.
 const jobs=await deps.client.from('candidate_financial_acquisition_jobs_v4').select('job_id,status,terminal_reason').eq('stock_id',stockId).order('created_at').limit(1001);
 const receipts=await deps.client.from('candidate_financial_document_receipts_v6').select('receipt_id,receipt_status,parser_status,financial_validation_status').eq('stock_id',stockId).order('accepted_at').limit(1001);
 if(jobs.error || receipts.error || !Array.isArray(jobs.data) || !Array.isArray(receipts.data) || jobs.data.length>1000 || receipts.data.length>1000)throw Error('vnext_preparation_receipts_read_unresolved');
 if((jobs.data as Row[]).some(row=>row.status!=='terminal') || (receipts.data as Row[]).some(row=>row.parser_status!=='complete' || row.financial_validation_status==='pending'))return {status:'unresolved',reason:'existing_cached_financial_work_pending'};
 const official=await deps.client.rpc('read_financial_facts_for_stocks_as_of',{p_cutoff:cutoff,p_stock_ids:[stockId]}).limit(2001);
 if(official.error || !Array.isArray(official.data) || official.data.length>2000)throw Error('vnext_preparation_verified_facts_unavailable');
 const verified=(official.data as Row[]).filter(f=>f.validation_status==='validated' && f.schema_valid===true && f.unit_valid===true && f.point_in_time_valid===true && f.consistency_valid===true && ['official_primary','official_filing'].includes(String(f.authority_tier)));
 const financial=await resolveFinancialEvidenceSources(deps.client,verified,cutoff);
 if(!financial.evidence.length)return {status:'gap',reason:'vnext_validated_financial_data_missing',gaps:financial.gaps};
 const session=await signalSession(deps.client,exchange,cutoff);
 const historical=await deps.historical({stockId,symbol:String(state.symbol),exchange,signalSession:session,cutoff});
 const forecasts=await readCurrentForecasts(deps.client,identity,String(state.jobId),String(state.executionId));
 if(forecasts.stockId!==stockId||forecasts.symbol!==state.symbol)throw Error('vnext_forecast_issuer_binding');
 const actionTerms=await readCurrentActionTerms(deps.client,identity,String(state.jobId),String(state.executionId));
 if(actionTerms.stockId!==stockId||actionTerms.symbol!==state.symbol)throw Error('vnext_action_issuer_binding');
 const frozenAt=(deps.now||(()=>new Date().toISOString()))();
 return {status:'ready',...freezeFinancialPreparation(original,historical,financial,frozenAt,forecasts,actionTerms),financialFacts:financial.evidence.length,sourceReceipts:financial.receipts.length,priceAvailable:historical.priceBasis?.status==='verified'};
}
/** READ is cache/journal observation only. The explicit resume uses exactly one
 * original prepare command; an unknown mutation outcome is read-recovered.
 * Neither path has dependencies capable of claim/refresh/parser/model work. */
export async function reconcilePreparation(identity:VnextIdentity,body:Row,deps:PreparationDependencies,resume=false):Promise<Row>{
 const jobId=preparationRequest(identity,body);
 const state=await deps.journal('inspect',{jobId});
 const descriptor={jobId,state:state.state,executionId:state.executionId,inputHash:state.inputHash,deadline:state.deadline,prepared:state.prepared===true};
 if(state.jobId!==jobId || typeof state.prepared!=='boolean' || typeof state.state!=='string' || !['queued','running','authored','reviewing','published','published_historical','failed','rejected'].includes(state.state) || typeof state.symbol!=='string' || !/^\d{4}$/u.test(state.symbol) || typeof state.inputHash!=='string' || !hash.test(state.inputHash)
  || (state.executionId!==null && state.executionId!==undefined && (typeof state.executionId!=='string' || !uuid.test(state.executionId))) || (state.deadline!==null && state.deadline!==undefined && (typeof state.deadline!=='string' || !Number.isFinite(Date.parse(state.deadline)))))throw Error('vnext_preparation_job_binding');
 if(state.state!=='running')return {status:state.state==='queued'?'not_started':'not_running',...descriptor,currentRights:'not_checked',nextAction:state.state==='queued'?'automatic':'recover',automaticResume:false,reinvoke:false};
 if(!uuid.test(String(state.executionId)) || !hash.test(String(state.inputHash)) || typeof state.deadline!=='string' || !Number.isFinite(Date.parse(state.deadline)))throw Error('vnext_preparation_execution_binding');
 const now=deps.now||(()=>new Date().toISOString());
 if(Date.parse(state.deadline)<=Date.parse(now()))return {status:'blocked',reason:'original_execution_expired',...descriptor,currentRights:'not_checked',automaticResume:false,reinvoke:false};
 let original:Row;
 try{original=await currentContext(deps,state);}catch{return unresolved('active_work_context_unavailable',descriptor);}
 let journal:Row;
 try{journal=await readJournal(deps,state,identity);}catch{return unresolved('provider_journal_read_unavailable',descriptor);}
 if(state.prepared===true){
  if(inputHash(original)!==state.inputHash)return unresolved('frozen_preparation_binding_invalid',descriptor);
  return {status:'prepared',...descriptor,currentRights:'checked',preparationObservation:{inputHash:state.inputHash,source:'existing_job_and_work_context',immutableRowReceiptExposed:false},nextAction:journal.invocation_id?'recover':'automatic',automaticResume:false,reinvoke:false};
 }
 if(journal.invocation_id)return unresolved('provider_invocation_already_exists',descriptor);
 let cached:Row;
 try{cached=await cachedProjection(deps,state,original,now(),identity);}catch{return unresolved('cached_financial_authority_unresolved',descriptor);}
 // Recheck original rights/admission and the exact execution after all reads.
 let after:Row;
 try{await currentContext(deps,state);after=await deps.journal('inspect',{jobId});journal=await readJournal(deps,state,identity);}catch{return unresolved('active_work_context_changed',descriptor);}
 if(!sameExecution(state,after) || journal.invocation_id || Date.parse(state.deadline)<=Date.parse(now()))return unresolved('original_execution_changed_or_expired',descriptor);
 if(cached.status!=='ready')return {...descriptor,status:cached.status,reason:cached.reason,gaps:cached.gaps||[],scope:'current_cached_receipts_only',currentRights:'checked',nextAction:'preparation-read',automaticResume:false,reinvoke:false};
 const summary={...descriptor,status:'ready',financialFacts:cached.financialFacts,sourceReceipts:cached.sourceReceipts,priceAvailable:cached.priceAvailable,entryEligible:false,currentRights:'checked',nextAction:'resume-preparation',automaticResume:false,reinvoke:false};
 if(!resume)return summary;
 // Existing SQL serializes with provider reserve. Reserve requires a persisted
 // preparation; first prepare is immutable and any competing payload conflicts.
 // A response loss can mean COMMIT: never fail/retry/re-freeze in this call.
 let receipt:Row;
 try{receipt=await deps.command('prepare',{jobId,executionId:state.executionId,inputHash:cached.inputHash,evidence:cached.evidence});}
 catch{return unresolved('preparation_write_outcome_uncertain',descriptor);}
 if(receipt.inputHash!==cached.inputHash || !((receipt.frozen===true && Object.keys(receipt).sort().join(',')==='frozen,inputHash') || (receipt.replay===true && Object.keys(receipt).sort().join(',')==='inputHash,replay')))return unresolved('preparation_write_receipt_invalid',descriptor);
 return {...summary,status:'prepared',inputHash:receipt.inputHash,prepared:true,receipt,nextAction:'automatic'};
}
