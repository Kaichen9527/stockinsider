import {financialInterval,financialPeriodsCompatible,financialObservation,isFinancialQuantity,type FinancialObservationInventory} from './financial-observation.ts';
import {businessChecklist,type BusinessReceipt} from './business-criteria.ts';
import {catalystChecklist,type CatalystReceipt} from './semantic-criteria.ts';
import { deepFactors,type DeepInputs } from './factors.ts';
import { validateClaim,type Artifact,type Evidence,type Review } from './research.ts';
import { inputHash } from './policy.ts';
import {AUDIT_QUOTE_CLOCK_VERSION,quoteClock,civilDateKnownAt} from './audit-quote-clock.ts';
import {evidenceInstant} from './evidence-clock.ts';
import {reviewedValuation} from './reviewed-valuation.ts';
import {isForecastEvidence} from './forecast-current.ts';
type Row=Record<string,unknown>;
export type AuditQuote={close:number|null;session:string|null;source:string;adjusted:boolean;volume:number|null;ma20:number|null;ma60:number|null;volumeRatio:number|null;institutionalFlow:number|null;provenance?:string[];observedAt?:string|null;availableAt?:string|null};
export type ThesisAuditInput={businessReceipt?:BusinessReceipt|null;semanticReceipt?:CatalystReceipt|null;financialObservationInventory?:FinancialObservationInventory|null;symbol:string;inputHash:string;revisionId:string|null;publishedInputHash:string|null;artifact:Artifact|null;review:Review|null;original:Evidence[];current:Evidence[];newContent:Evidence[];quote:AuditQuote;cutoff:string;session?:string;previousAudit?:{materialEvidence?:Row}|null;market:{risk:string;snapshotHash:string|null};previousMarketHash:string|null;tradingValid:boolean|null};
const numeric=(fact:Evidence|undefined)=>typeof fact?.value==='number' && Number.isFinite(fact.value)?fact.value:null;
const periodWindow=(e:Evidence)=>e.financial?financialInterval(e)||`unavailable:${e.id}`:String(e.period);
const triple=(e:Evidence)=>`${e.key}\u0000${e.unit}\u0000${periodWindow(e)}`;
const scalarForecastKeys=new Set(['source_quarterly_diluted_eps_estimate','source_target_price_12m']);
const fiscalForecastKeys=new Set(['source_annual_forecast_eps','next_four_quarter_eps','source_next_four_fiscal_quarter_eps']);
type ForecastMaterial={key?:string;value:unknown;unit?:string;period?:string;source:string;eventAt:string;disclosureDigest?:string};
type ForecastRow={entry:Evidence;original:Evidence|null;material:ForecastMaterial};
function forecastRows(evidence:Evidence[],cutoff:string):ForecastRow[]{
 const limit=evidenceInstant(cutoff);
 if(limit===null)return [];
 const allowed=evidence.filter(e=>{
  const seen=evidenceInstant(e.availableAt),event=evidenceInstant(e.eventAt);
  return isForecastEvidence(e)&&e.kind==='assumption'&&e.sourceTier==='public'&&event!==null&&seen!==null&&event<=seen&&seen<=limit;
 });
 const byId=new Map(allowed.map(e=>[e.id,e]));
 return allowed.flatMap<ForecastRow>(e=>{
  if(e.unit!=='TWD_per_share'||numeric(e)===null)return [];
  const material={key:e.key,value:e.value,unit:e.unit,period:e.period,source:e.source,eventAt:e.eventAt};
  if(e.id.startsWith('forecast:')&&scalarForecastKeys.has(e.key||''))return [{entry:e,original:null,material}];
  if(!e.id.startsWith('fiscal-forecast:')||!e.id.endsWith(':eps')||!fiscalForecastKeys.has(e.key||''))return [];
  const original=byId.get(e.id.slice(0,-3)+'original');
  if(!original||original.key!=='fiscal_forecast_original'||original.source!==e.source
   ||original.eventAt!==e.eventAt||original.availableAt!==e.availableAt)return [];
  const disclosure=original.value as {schemaVersion?:unknown;statement?:unknown}|null;
  if(disclosure?.schemaVersion!=='vnext-fiscal-forecast-original-v1'||typeof disclosure.statement!=='string'||!disclosure.statement)return [];
  return [{entry:e,original,material:{...material,disclosureDigest:inputHash(disclosure.statement)}}];
 });
}
/** A cache audit reports support/drift/gaps; it does not claim a new semantic model review. */
export function auditPublishedThesis(input:ThesisAuditInput){
 const originalIds=new Set(input.original.map((e)=>e.id));const fresh=input.newContent.filter((e)=>!originalIds.has(e.id));
 const supported=(id:string)=>input.review?.approved===true && input.review.claimChecks.some((check)=>check.claimId===id && check.verdict==='supported');
 const currentForecasts=forecastRows(input.current,input.cutoff);
 const originalForecasts=forecastRows(input.original,input.cutoff);
 const currentForecastEntries=currentForecasts.map(row=>row.entry);
 const currentFiscalEvidence=new Map(currentForecasts.flatMap(row=>row.original?[[row.entry.id,row.entry],[row.original.id,row.original]] as const:[]));
 const counterpart=(old:Evidence)=>{
  if(old.id.startsWith('fiscal-forecast:')){
   const current=currentFiscalEvidence.get(old.id);
   return current?.contentHash===old.contentHash?current:undefined;
  }
  if(old.id.startsWith('forecast:')){
   return currentForecastEntries.find(e=>e.id===old.id)||currentForecastEntries.filter(e=>e.id.startsWith('forecast:')&&triple(e)===triple(old)&&financialPeriodsCompatible(e,old))
    .sort((a,b)=>b.availableAt.localeCompare(a.availableAt)||a.id.localeCompare(b.id))[0];
  }
  return input.current.find(e=>e.id===old.id)
   ||(old.kind==='fact'&&old.sourceTier==='official'?input.current.filter(e=>e.key!=='current_price'&&e.kind==='fact'&&e.sourceTier==='official'
    &&triple(e)===triple(old)&&financialPeriodsCompatible(e,old)).sort((a,b)=>b.availableAt.localeCompare(a.availableAt)||a.id.localeCompare(b.id))[0]:undefined);
 };
 const aliases=input.original.flatMap((old)=>{const current=counterpart(old);return current?[{...current,id:old.id}]:[];});
 const checks=(input.artifact?.claims||[]).map((claim)=>{
  const originals=claim.evidenceIds.map((id)=>input.original.find((e)=>e.id===id));
  const missing=claim.evidenceIds.filter((_,i)=>!originals[i] || !counterpart(originals[i]!));
  const changed=originals.flatMap((old)=>{const current=old && counterpart(old);return old && current && (inputHash(old.value)!==inputHash(current.value) || old.unit!==current.unit || old.period!==current.period)?[{originalId:old.id,currentId:current.id}]:[];});
  const validation=validateClaim(claim,aliases);
  const financialComparisonUnavailable=validation.some(reason=>reason.startsWith('claim_formula_financial_period_or_basis_unavailable:'));
  const superseded=Boolean(claim.numeric && claim.numeric.key!=='current_price' && input.current.some((e)=>e.kind==='fact' && e.sourceTier==='official' && e.key===claim.numeric!.key && e.unit===claim.numeric!.unit && String(e.period||'')>claim.numeric!.period && !(isFinancialQuantity(e)||originals.some(old=>old&&isFinancialQuantity(old)))));
  // A validated replacement is drift even if another original is temporarily unavailable.
  return {claimId:claim.id,status:changed.length || superseded?'drift':!supported(claim.id) || missing.length || financialComparisonUnavailable?'gap':validation.length?'drift':fresh.length?'new_related_evidence':'supported_original',missing,changed,superseded,validation,newOriginalEvidenceIds:fresh.map((e)=>e.id)};
 });
 const facts=input.current.filter((e)=>!isForecastEvidence(e) && e.kind==='fact' && e.sourceTier==='official' && evidenceInstant(e.availableAt)!==null && evidenceInstant(input.cutoff)!==null && evidenceInstant(e.availableAt)!<=evidenceInstant(input.cutoff)!);
 const latest=(key:string)=>facts.filter((e)=>e.key===key).sort((a,b)=>String(b.period).localeCompare(String(a.period))||b.availableAt.localeCompare(a.availableAt));
 const observe=(met:boolean|null,provenance:string[],raw:unknown=null)=>{
  // Financial observations use the exact availability of their own cited
  // sources. A market hash/roster boolean with no known clock remains a gap.
  const sources=provenance.map(id=>input.current.find(e=>e.id===id));
  const clocks=sources.map(e=>evidenceInstant(e?.availableAt));
  const valid=provenance.length>0&&sources.every(Boolean)&&clocks.every(at=>at!==null)&&evidenceInstant(input.cutoff)!==null
   && clocks.every(at=>at!<=evidenceInstant(input.cutoff)!);
  let latest=0;
  if(valid)for(let index=1;index<clocks.length;index++)if(clocks[index]!>clocks[latest]!)latest=index;
  const observedAt=valid?sources[latest]!.availableAt:'';
  return {met,provenance,raw,observedAt};
 };
 const margins=latest('quarterly_revenue').filter((e,i,a)=>a.findIndex((x)=>periodWindow(x)===periodWindow(e))===i).flatMap((revenue)=>{const profit=latest('quarterly_gross_profit').find((e)=>financialPeriodsCompatible(e,revenue,true));return numeric(revenue)!>0 && numeric(profit)!==null && profit?[{period:revenue.period,periodStart:revenue.financial?.periodStart??null,storedDurationKind:revenue.financial?.storedDurationKind??null,value:numeric(profit)!/numeric(revenue)!,provenance:[profit.id,revenue.id],raw:{operation:'divide',grossProfit:{id:profit.id,value:profit.value,unit:profit.unit,period:profit.period},revenue:{id:revenue.id,value:revenue.value,unit:revenue.unit,period:revenue.period}}}]:[];});
 const cash=latest('operating_cashflow')[0];const income=latest('quarterly_net_income')[0];
 // Current Evidence/Claim/Review carry numeric support and review protocol,
 // not a typed source-bound semantic criterion receipt. Reserved IDs, even
 // independently reviewed numeric0/1, cannot supply that missing authority.
 const semanticKeys=['competitive_advantage','catalyst_dated','catalyst_verified','catalyst_mechanism_documented','catalyst_falsifier_defined','risk_bound'];
 const semantic=(key:string)=>observe(null,[],{criterion:key,status:'source_bound_criterion_authority_missing'});
 const quote=input.quote;const clock=quoteClock(quote,input.cutoff);const quoteUsable=Boolean(clock && quote.adjusted && quote.source && civilDateKnownAt(quote.session,input.cutoff));const quoteProvenance=quoteUsable?[quote.source,...(quote.provenance||[])]:[];
 const observeQuote=(met:boolean|null,provenance:string[],raw:unknown=null)=>({met:quoteUsable?met:null,provenance:quoteUsable?provenance:[],raw,observedAt:quoteUsable?clock!.availableAt:''});
 const valuation=reviewedValuation({artifact:input.artifact,review:input.review,original:input.original,current:aliases,quote,cutoff:input.cutoff});
 const catalyst=catalystChecklist({artifact:input.artifact,review:input.review,original:input.original,current:input.current,cutoff:input.cutoff,symbol:input.symbol,revisionId:input.revisionId,inputHash:input.inputHash,receipt:input.semanticReceipt});
 const business=businessChecklist({artifact:input.artifact,review:input.review,original:input.original,current:input.current,cutoff:input.cutoff,symbol:input.symbol,revisionId:input.revisionId,inputHash:input.inputHash,receipt:input.businessReceipt});
 const competitive=business.checks.find(check=>check.criterion==='competitive_advantage')!;const riskAnalysis=business.checks.find(check=>check.criterion==='thesis_risk_analysis')!;
 const deep:DeepInputs={cutoff:input.cutoff,clockVersion:AUDIT_QUOTE_CLOCK_VERSION,valuation:valuation.valuation,
  profitabilityChecklist:{checks:[{key:'margin_stable',...observe(null,margins.slice(0,2).flatMap((e)=>e.provenance),margins.slice(0,2))},{key:'cashflow_conversion',...observe(cash && income && financialPeriodsCompatible(cash,income,true) && numeric(cash)!==null && numeric(income)!==null?numeric(cash)!>0 && numeric(income)!>0 && numeric(cash)!>=numeric(income)!*0.8:null,[cash?.id,income?.id].filter((id):id is string=>Boolean(id)),{cash:cash||null,income:income||null,minimumConversion:0.8})},{key:'competitive_advantage',...(competitive.met===null?semantic('competitive_advantage'):{met:null,provenance:competitive.provenance,observedAt:competitive.observedAt||'',raw:{criterion:'competitive_advantage',component:competitive,status:'remaining_components_not_db_verified'}})},{key:'concentration_disclosed',...observe(numeric(latest('customer_concentration')[0])!==null?true:null,latest('customer_concentration').slice(0,1).map((e)=>e.id))}]},
  technicalChipsChecklist:{checks:[{key:'trend_valid',...observeQuote(quote.adjusted && quote.close!==null && quote.ma20!==null && quote.ma60!==null?quote.close>=quote.ma20 && quote.close>=quote.ma60:null,quoteProvenance)},{key:'volume_confirmed',...observeQuote(quote.volumeRatio===null?null:quote.volumeRatio>=1,quoteProvenance)},{key:'institutional_confirmed',...observeQuote(quote.institutionalFlow===null?null:quote.institutionalFlow>=0,quoteProvenance)},{key:'adjustment_verified',...observeQuote(quote.adjusted?true:null,quoteProvenance)}]},
  catalystChecklist:catalyst,
  marketLiquidityChecklist:{checks:[{key:'market_known',...observe(input.market.risk!=='unknown'?true:null,input.market.snapshotHash?[input.market.snapshotHash]:[])},{key:'liquidity_verified',...observeQuote(quote.volume!==null?quote.volume>0:null,quoteProvenance)},{key:'trading_valid',...observe(input.tradingValid,[])},{key:'risk_bound',...semantic('risk_bound')}]}};
 const clockGaps=Object.entries({profitability:deep.profitabilityChecklist,marketLiquidity:deep.marketLiquidityChecklist})
  .flatMap(([group,list])=>list.checks.filter(check=>check.met!==null&&!check.observedAt).map(check=>`audit_check_clock_missing:${group}:${check.key}`));
 const oldQuote=input.artifact?.claims.find((claim)=>claim.numeric?.key==='current_price')?.numeric?.value;
 const financialChanged=facts.some((current)=>{const old=input.original.find((e)=>e.kind==='fact' && e.sourceTier==='official' && (e.id===current.id || triple(e)===triple(current) && financialPeriodsCompatible(e,current)));if(!old && current.financial && input.original.some(e=>e.key===current.key&&e.period===current.period))return false;return old?inputHash(old.value)!==inputHash(current.value):!input.original.some((e)=>e.kind==='fact' && e.sourceTier==='official' && e.key===current.key && e.unit===current.unit && String(e.period)>=String(current.period));});
 const originalForecastDigests=new Set(originalForecasts.map(row=>inputHash(row.material)));
 const forecastChanged=currentForecasts.some(row=>!originalForecastDigests.has(inputHash(row.material)));
 const forecastUnavailable=originalForecasts.some(row=>!counterpart(row.entry)||row.original!==null&&!counterpart(row.original));
 const financialComparisonGaps=facts.some(e=>e.financial && input.original.some(old=>old.key===e.key && old.period===e.period && old.id!==e.id && !financialPeriodsCompatible(old,e)))?['financial_period_or_share_basis_comparison_unavailable']:[];
 const materialForecasts=currentForecasts.map(row=>row.material).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const previousQuote=input.previousAudit?.materialEvidence?.quote as Row|undefined;
 const technicalChanged=quoteUsable && previousQuote && ['ma20','ma60','volumeRatio','institutionalFlow'].some((key)=>{const value=quote[key as keyof AuditQuote];return typeof value==='number' && typeof previousQuote[key]==='number' && value!==previousQuote[key];});
 const materialReasons=[...(forecastChanged?['current_source_forecast_changed']:[]),...(financialChanged?['verified_financial_inputs_changed']:[]),...(technicalChanged?['verified_technical_inputs_changed']:[]),...(quoteUsable && quote.close!==null && oldQuote!==undefined && quote.close!==oldQuote?['verified_quote_value_changed']:[]),...(checks.some((c)=>c.status==='drift')?['published_claim_or_period_changed']:[]),...(fresh.length?['new_permitted_original_content']:[]),...(input.market.snapshotHash && input.market.snapshotHash!==input.previousMarketHash?['market_inputs_changed']:[])];
 const materialFacts=[...facts].sort((a,b)=>b.availableAt.localeCompare(a.availableAt)).filter((e,i,a)=>a.findIndex((x)=>triple(x)===triple(e))===i).map((e)=>({key:e.key,value:e.value,unit:e.unit,period:e.period,financial:e.financial??null})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const materialEvidence={financialObservationInventory:input.financialObservationInventory??null,forecastDigest:inputHash(materialForecasts),forecastCount:materialForecasts.length,forecasts:materialForecasts,factDigest:inputHash(materialFacts),factCount:materialFacts.length,facts:materialFacts.slice(0,64),factDetailsTruncated:materialFacts.length>64,newEvidence:fresh.map((e)=>e.contentHash).sort(),quote:{clockVersion:AUDIT_QUOTE_CLOCK_VERSION,observedAt:clock?.observedAt||null,availableAt:clock?.availableAt||null,session:quoteUsable?quote.session:null,close:quoteUsable?quote.close:null,adjusted:quoteUsable,volumeRatio:quoteUsable?quote.volumeRatio:null,institutionalFlow:quoteUsable?quote.institutionalFlow:null,ma20:quoteUsable?quote.ma20:null,ma60:quoteUsable?quote.ma60:null},marketSnapshotHash:input.market.snapshotHash};
 return {schemaVersion:'vnext-thesis-audit-v1',clockVersion:AUDIT_QUOTE_CLOCK_VERSION,businessChecklist:business,symbol:input.symbol,inputHash:input.inputHash,publishedInputHash:input.publishedInputHash,revisionId:input.revisionId,cutoff:input.cutoff,session:input.session||quote.session,status:!input.artifact?'unpublished_gap':checks.some((c)=>c.status==='gap')?'evidence_gap':materialReasons.length?'material_review_required':'maintained',claimChecks:checks,deepInputs:deep,deepScore:deepFactors(deep),materialEvidence,materialReasons,materialChanged:materialReasons.length>0,materialHash:inputHash(materialEvidence),gaps:[...(facts.some(e=>e.financial)?['missing_sql_financial_interval_basis_parity']:[]),...(margins.length?['financial_margin_temporal_comparison_rule_unavailable']:[]),...financialComparisonGaps,...clockGaps,...(!clock?['audit_quote_clock_missing_or_future']:[]),...(forecastUnavailable?['original_forecast_current_authority_unavailable']:[]),...(!input.artifact?['no_published_thesis']:[]),...semanticKeys.filter(key=>key==='competitive_advantage'?competitive.met===null:!key.startsWith('catalyst_')||catalyst.checks.some(check=>`catalyst_${check.key}`===key&&check.met===null)).map(key=>`semantic_criterion_authority_missing:${key}`),...(catalyst.checks.some(check=>check.raw.status==='independent_confirmation_missing')?['independent_confirmation_missing']:[]),...(competitive.met!==null?['profitability_remaining_component_authority_missing']:[]),...(riskAnalysis.met!==null?['market_liquidity_remaining_component_authority_missing']:[]),...(!cash?['operating_cashflow_not_supplied_by_current_parser']:[]),...(materialFacts.length>64?['material_fact_details_bounded_digest_retained']:[]),...checks.filter((c)=>c.status==='gap').map((c)=>`claim_original_gap:${c.claimId}`),...(deepFactors(deep).availableWeight<100?['deep_factor_evidence_incomplete']:[])]};
}
export function currentEvidenceFromFacts(rows:Row[]):Evidence[]{return rows.filter((fact)=>fact.estimate_kind==='reported' && fact.estimate_horizon==='reported_period' && fact.validation_status==='validated' && fact.schema_valid===true && fact.unit_valid===true && fact.point_in_time_valid===true && fact.consistency_valid===true && ['official_primary','official_filing'].includes(String(fact.authority_tier))).map((fact)=>({id:String(fact.fact_id),key:String(fact.fact_key),value:fact.value,unit:String(fact.unit),period:String(fact.period_end),source:String(fact.source_ref),sourceTier:'official',kind:'fact',eventAt:String(fact.source_timestamp),availableAt:String(fact.recorded_at),contentHash:inputHash(fact),financial:financialObservation(fact,null,String(fact.recorded_at))}));}
