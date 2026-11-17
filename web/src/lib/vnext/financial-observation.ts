/** Observational metadata only. Neither this DTO nor its hashes grants source,
 * share-basis, financial-comparison, current-rights or publication authority. */
import {inputHash} from './policy.ts';
import {evidenceInstant,evidenceKnownAt} from './evidence-clock.ts';
import {isHistoryDate} from '../candidate-price-history.ts';
import type {Evidence} from './research.ts';
type Row=Record<string,unknown>;
export const FINANCIAL_SQL_PARITY_GAP='missing_sql_financial_interval_basis_parity' as const;
export const FINANCIAL_OBSERVATION_VERSION='vnext-financial-observation-v1' as const;
const text=(value:unknown)=>typeof value==='string'?value:null;
const epsBasis=(key:unknown)=>key==='quarterly_basic_eps'?'basic':key==='quarterly_diluted_eps'?'diluted':null;
const scalarKeys=new Set(['pe_multiple','pb_multiple','ev_ebitda_multiple','ev_sales_multiple']);
const scalarUnits=new Set(['ratio','multiple','dimensionless']);
/** Only explicit financial scalar concepts/units are exempt. A changed EPS
 * unit or unknown official key cannot turn a real quantity into a scalar. */
export function isFinancialQuantity(e:Evidence){
 if(!e.financial&&!(e.kind==='fact'&&e.sourceTier==='official'))return false;
 if(e.key==='current_price')return false;
 return !(scalarKeys.has(String(e.key))&&scalarUnits.has(String(e.unit)));
}
const reportedKeys=new Set(['monthly_revenue','quarterly_revenue','quarterly_gross_profit','quarterly_operating_expense','quarterly_operating_income','quarterly_non_operating_income','quarterly_pretax_income','quarterly_income_tax_expense','quarterly_noncontrolling_interest','quarterly_net_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps','quarterly_basic_eps','quarterly_ebitda','depreciation_amortization','diluted_shares','diluted_weighted_average_shares','basic_weighted_average_shares','common_shares_outstanding','book_value_per_share','roe','cash_and_equivalents','total_debt','net_debt','total_equity','total_assets','invested_capital','net_asset_value','operating_cash_flow','operating_cashflow','capital_expenditure','interest_expense','shares_outstanding','pe_multiple','pb_multiple','ev_ebitda_multiple','ev_sales_multiple','broker_target_price']);
/** Read scope only, BEFORE validation/head selection. Reject malformed batches
 * without deleting a newer rejected row and reviving an older observation. */
export function financialRowsAtCutoff(value:unknown,stockIds:readonly string[],cutoff:string):Row[]|null{
 if(!Array.isArray(value)||value.length>2000||value.some(row=>!row||typeof row!=='object'||!stockIds.includes(row.stock_id)
  ||!['source_timestamp','collected_at','recorded_at'].every(key=>evidenceKnownAt(row[key],cutoff))
  ||evidenceInstant(row.source_timestamp)!>evidenceInstant(row.collected_at)!||evidenceInstant(row.collected_at)!>evidenceInstant(row.recorded_at)!))return null;
 return value as Row[];
}
export function replaceReportedFinancial(e:Evidence,knownIds:ReadonlySet<string>){
 return knownIds.has(e.id)||e.kind==='fact'&&e.sourceTier==='official'
  &&(e.financial?.schemaVersion===FINANCIAL_OBSERVATION_VERSION||typeof e.value==='number'&&reportedKeys.has(String(e.key)));
}
export function financialFactGrain(row:Row){
 return JSON.stringify([row.stock_id,row.fact_key,row.period_start??null,row.period_end,row.duration_kind??null,row.estimate_kind,row.estimate_horizon]);
}
export function selectFinancialObservationHeads(rows:Row[]){
 if(rows.length>2000)throw Error('financial_cache_bound_exceeded');
 if(new Set(rows.map(row=>row.fact_id)).size!==rows.length)throw Error('financial_cache_binding_invalid');
 const groups=new Map<string,Row[]>();
 for(const row of rows){const key=financialFactGrain(row);groups.set(key,[...(groups.get(key)||[]),row]);}
 const heads:Row[]=[],ambiguous=new Set<string>();
 for(const [key,group] of groups){
  const ordered=[...group].sort((a,b)=>{
   const left=evidenceInstant(a.recorded_at),right=evidenceInstant(b.recorded_at);
   if(left===null||right===null)throw Error('financial_cache_binding_invalid');return left<right?1:left>right?-1:0;
  });const head=ordered[0];
  if(ordered.some(row=>evidenceInstant(row.recorded_at)===evidenceInstant(head.recorded_at)&&inputHash(row)!==inputHash(head)))throw Error('financial_revision_conflict');
  // A digest/date is not an original/restated variant discriminator. Examine
  // the WHOLE bounded selected-filing group before choosing a singular EPS.
  const filing=group.filter(row=>row.filing_restatement_id===head.filing_restatement_id);
  if(epsBasis(head.fact_key)&&new Set(filing.map(row=>inputHash([row.value,row.unit,row.source_ref]))).size>1)ambiguous.add(key);
  else heads.push(head);
 }
 return {heads,ambiguous};
}
export type FinancialObservation={
 schemaVersion:typeof FINANCIAL_OBSERVATION_VERSION;factId:string;factContentHash:string;
 periodStart:string|null;periodEnd:string|null;storedDurationKind:string|null;periodType:'instant'|'duration'|null;
 reportingFrequency:null;estimateKind:string|null;estimateHorizon:string|null;epsBasis:'basic'|'diluted'|null;
 filingRevisionId:string|null;shareBasis:null;denominatorShares:null;restatementBasis:null;corporateActionRevision:null;
 sourceReceiptHash:string|null;sourceRawSha256:string|null;sourceReceiptId:string|null;acquisitionJobId:string|null;provenanceId:string|null;knownAt:string|null;gaps:string[];
};
export function financialObservation(row:Row,receipt:Row|null,cutoff:string):FinancialObservation{
 const start=isHistoryDate(row.period_start)?row.period_start:null,end=isHistoryDate(row.period_end)?row.period_end:null;
 const duration=text(row.duration_kind),instant=duration==='instant';
 const periodType:FinancialObservation['periodType']=end?(instant&&row.period_start===null?'instant':!instant&&start&&start<=end&&['monthly','quarterly','ttm'].includes(duration||'')?'duration':null):null;
 const basis=epsBasis(row.fact_key),gaps:string[]=['missing_sql_financial_interval_basis_parity'];
 if(!periodType)gaps.push('financial_exact_period_metadata_unavailable');
 if(!instant)gaps.push('financial_reporting_frequency_not_typed');
 if(['TWD_per_share','TWD/share','share','thousand_shares'].includes(String(row.unit)))gaps.push('financial_share_basis_not_typed');
 if(basis){gaps.push('eps_share_basis_not_typed','corporate_action_restatement_bridge_missing');if(!['TWD_per_share','TWD/share'].includes(String(row.unit)))gaps.push('eps_per_share_unit_unavailable');}
 const clocks=[row.source_timestamp,row.collected_at,row.recorded_at,row.validation_recorded_at,row.filing_published_at,receipt?.knownAt].filter(value=>value!==null&&value!==undefined);
 const known=receipt&&receipt.factId===row.fact_id&&receipt.factRecordedAt===row.recorded_at&&receipt.stockId===row.stock_id
  &&typeof receipt.receiptHash==='string'&&/^[a-f0-9]{64}$/u.test(receipt.receiptHash)&&typeof receipt.sourceSha256==='string'&&/^[a-f0-9]{64}$/u.test(receipt.sourceSha256)
  &&evidenceKnownAt(row.validation_recorded_at,cutoff)&&clocks.length>0&&clocks.every(value=>evidenceKnownAt(value,cutoff))
  && evidenceInstant(row.source_timestamp)!<=evidenceInstant(row.collected_at)!&&evidenceInstant(row.collected_at)!<=evidenceInstant(row.recorded_at)!
  && evidenceInstant(row.recorded_at)!<=evidenceInstant(row.validation_recorded_at)!;
 const knownAt=known?clocks.map(String).sort((a,b)=>evidenceInstant(a)!<evidenceInstant(b)!?-1:evidenceInstant(a)!>evidenceInstant(b)!?1:0).at(-1)!:null;
 if(!knownAt)gaps.push('financial_fixed_source_receipt_unknown');
 return {schemaVersion:FINANCIAL_OBSERVATION_VERSION,factId:String(row.fact_id),factContentHash:inputHash(row),periodStart:start,periodEnd:end,
  storedDurationKind:duration,periodType,reportingFrequency:null,estimateKind:text(row.estimate_kind),estimateHorizon:text(row.estimate_horizon),epsBasis:basis,
  filingRevisionId:text(row.filing_restatement_id),shareBasis:null,denominatorShares:null,restatementBasis:null,corporateActionRevision:null,
  sourceReceiptHash:knownAt?text(receipt?.receiptHash):null,sourceRawSha256:knownAt?text(receipt?.sourceSha256):null,sourceReceiptId:knownAt?text(receipt?.receiptId):null,acquisitionJobId:knownAt?text(receipt?.acquisitionJobId):null,provenanceId:knownAt?text(receipt?.provenanceId):null,knownAt,gaps};
}
export function financialObservationInventory(rows:Row[],receipts:Row[],ambiguous:ReadonlySet<string>,cutoff:string){
 if(rows.length>2000)throw Error('financial_cache_bound_exceeded');
 const all=rows.map(row=>{const receipt=receipts.find(r=>r.factId===row.fact_id&&r.factRecordedAt===row.recorded_at)||null;
  return {factId:String(row.fact_id),stockId:text(row.stock_id),value:typeof row.value==='number'&&Number.isFinite(row.value)?row.value:null,unit:text(row.unit),recordedAt:text(row.recorded_at),provider:text(row.provider),
   metadata:financialObservation(row,receipt,cutoff),
   selection:ambiguous.has(financialFactGrain(row))?'ambiguous_variant_observation':'observed_revision'};
 }).sort((a,b)=>a.factId.localeCompare(b.factId)||String(a.recordedAt).localeCompare(String(b.recordedAt)));
 return {schemaVersion:FINANCIAL_OBSERVATION_VERSION,count:all.length,digest:inputHash(all),details:all.slice(0,64),truncated:all.length>64,
  gaps:[...(rows.some(row=>ambiguous.has(financialFactGrain(row)))?['financial_eps_variant_selection_ambiguous']:[]),...(all.length>64?['financial_revision_inventory_details_bounded']:[])]};
}
/** Cross-ID comparison requires metadata on BOTH sides. EPS share/restatement
 * basis remains unknown; even equal numbers cannot establish comparable EPS. */
export type FinancialObservationInventory=ReturnType<typeof financialObservationInventory>;
export function financialInterval(e:Evidence){
 const m=e.financial;if(!m||m.schemaVersion!==FINANCIAL_OBSERVATION_VERSION||m.factContentHash!==e.contentHash
  ||m.periodEnd!==e.period||!m.periodType||!m.knownAt||!m.sourceReceiptHash||!m.sourceRawSha256)return null;
 if(e.kind!=='fact'||e.sourceTier!=='official'||m.estimateKind!=='reported'||m.estimateHorizon!=='reported_period'
  ||!evidenceKnownAt(m.knownAt,e.availableAt)||!isHistoryDate(m.periodEnd)
  ||![m.factContentHash,m.sourceReceiptHash,m.sourceRawSha256].every(value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value)))return null;
 if(m.periodType==='instant'?(m.periodStart!==null||m.storedDurationKind!=='instant'):
  (!isHistoryDate(m.periodStart)||m.periodStart>m.periodEnd||!['monthly','quarterly','ttm'].includes(m.storedDurationKind||'')))return null;
 if(m.epsBasis!==epsBasis(e.key)||m.shareBasis!==null||m.denominatorShares!==null||m.restatementBasis!==null||m.corporateActionRevision!==null||m.reportingFrequency!==null)return null;
 if(m.epsBasis||['TWD_per_share','TWD/share','share','thousand_shares'].includes(String(e.unit)))return null; // No approved share-basis producer exists; no DTO field can opt in.
 return JSON.stringify([m.periodStart,m.periodEnd,m.storedDurationKind,m.estimateKind,m.estimateHorizon]);
}
export function financialPeriodsCompatible(a:Evidence,b:Evidence,paired=false){
 if(!a.financial&&!b.financial)return !isFinancialQuantity(a)&&!isFinancialQuantity(b)&&a.period===b.period;
 const left=financialInterval(a),right=financialInterval(b);if(!left||left!==right||a.unit!==b.unit)return false;
 if(!paired)return true;
 const leftRevision=a.financial!.filingRevisionId,rightRevision=b.financial!.filingRevisionId;
 return leftRevision!==null||rightRevision!==null?leftRevision!==null&&leftRevision===rightRevision:a.financial!.sourceRawSha256===b.financial!.sourceRawSha256;
}
