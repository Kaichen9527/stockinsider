/** Synthetic database/receipt ports only. Not actual5274 parsing, source rights,
 * corporate-action restatement comparability or financial qualification. */
import test from 'node:test';
import assert from 'node:assert/strict';
import {auditPublishedThesis} from './thesis-audit.ts';
import {readCurrentFinancialCache} from './current-evidence-read.ts';
import {freezeFinancialPreparation} from './preparation-reconciliation.ts';
import {resolveFinancialEvidenceSources} from './financial-evidence-sources.ts';
import type {TwEntryHistoricalAuthorityResult} from '../tw-entry-plan-authority.ts';
import {financialPeriodsCompatible} from './financial-observation.ts';
import {validateClaim,type Claim,type Evidence} from './research.ts';
import {inputHash} from './policy.ts';
type Row=Record<string,unknown>;
const cutoff='2026-10-23T06:00:00.000000Z',stock='00000000-0000-4000-8000-000000000099';
const id=(n:number)=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
function row(n:number,patch:Row={}):Row{return {fact_id:id(n),stock_id:stock,fact_key:'quarterly_basic_eps',period_start:'2026-07-01',period_end:'2026-09-30',duration_kind:'quarterly',
 value:4.81,unit:'TWD_per_share',provider:'twse',authority_tier:'official_primary',estimate_kind:'reported',estimate_horizon:'reported_period',
 filing_published_at:'2026-10-21T01:00:00Z',source_timestamp:'2026-10-21T01:00:00Z',collected_at:'2026-10-21T02:00:00Z',
 recorded_at:`2026-10-22T01:00:00.${String(n).padStart(6,'0')}Z`,validation_recorded_at:cutoff,filing_restatement_id:'SYNTHETIC_FIXED_FILING',
 source_ref:`twse-openapi:synthetic:${n}`,validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true,...patch};}
function port(rows:Row[],receiptClock=cutoff){
 const allowed=new Set(['candidate_financial_fact_provenance_v4','candidate_financial_document_fact_links_v8','candidate_financial_acquisition_jobs_v4']);
 const client={rpc(name:string){assert.equal(name,'read_financial_facts_for_stocks_as_of');return {limit:async()=>({data:rows,error:null})};},from(table:string){
  assert.ok(allowed.has(table),`unexpected synthetic table:${table}`);let ids:unknown[]=[];
  const chain={select(){return chain;},in(_key:string,value:unknown[]){ids=value;return chain;},lte(){return chain;},order(){return chain;},limit:async()=>{
   const chosen=rows.filter(r=>ids.includes(r.fact_id));
   const data=table==='candidate_financial_fact_provenance_v4'?chosen.map(r=>({fact_id:r.fact_id,provenance_id:`SYNTHETIC_PROVENANCE:${r.fact_id}`,acquisition_job_id:r.fact_id,
    source_url:'https://www.twse.com.tw/synthetic-financial-periods',source_sha256:'b'.repeat(64),locator:{source_ref:r.source_ref,period_end:r.period_end,fact_key:r.fact_key},extracted_at:receiptClock,recorded_at:receiptClock})):
    table==='candidate_financial_acquisition_jobs_v4'?chosen.map(r=>({job_id:r.fact_id,stock_id:r.stock_id,period_end:r.period_end,status:'terminal',terminal_reason:'complete',
     source_url:'https://www.twse.com.tw/synthetic-financial-periods',response_sha256:'b'.repeat(64),collected_at:receiptClock,created_at:receiptClock,updated_at:receiptClock})):[];
   return {data,error:null};}};return chain;}};
 return client as unknown as Parameters<typeof readCurrentFinancialCache>[0];
}
const read=(rows:Row[],clock=cutoff)=>readCurrentFinancialCache(port(rows,clock),[stock],cutoff);
test('actual cache/projector preserves four same-end EPS interval/basis observations and original numeric hashes',async()=>{
 const rows=[row(1),row(2,{fact_key:'quarterly_diluted_eps',value:4.80}),row(3,{period_start:'2026-01-01',value:12.64}),row(4,{period_start:'2026-01-01',fact_key:'quarterly_diluted_eps',value:12.62})];
 const result=await read(rows);assert.equal(result.evidence.length,4);assert.equal(result.observationInventory?.count,4);
 for(const source of rows){const evidence=result.evidence.find(e=>e.id===source.fact_id)!;
  assert.equal(evidence.value,source.value);assert.equal(evidence.contentHash,inputHash(source));assert.equal(evidence.period,source.period_end);
  assert.equal(evidence.financial?.periodStart,source.period_start);assert.equal(evidence.financial?.storedDurationKind,'quarterly');
  assert.equal(evidence.financial?.periodType,'duration');assert.equal(evidence.financial?.reportingFrequency,null);
  assert.equal(evidence.financial?.epsBasis,source.fact_key==='quarterly_basic_eps'?'basic':'diluted');assert.equal(evidence.financial?.shareBasis,null);assert.equal(evidence.financial?.denominatorShares,null);assert.equal(evidence.financial?.restatementBasis,null);
  assert.equal(evidence.financial?.corporateActionRevision,null);assert.ok(evidence.financial?.sourceReceiptHash);
  assert.ok(evidence.financial?.gaps.includes('financial_reporting_frequency_not_typed'));
 }
 assert.equal(financialPeriodsCompatible(result.evidence[0],result.evidence[1]),false);
});
test('same-filing conflicting EPS contexts preserve fixed-receipt observations and never select by arrival or digest',async()=>{
 const rows=[row(1,{value:3.21}),row(2,{value:2.92})],first=await read(rows),reverse=await read([...rows].reverse());
 assert.deepEqual(first.evidence,[]);assert.ok(first.gaps.includes('financial_eps_variant_selection_ambiguous'));
 assert.equal(first.observationInventory?.count,2);assert.deepEqual(first.observationInventory?.details.map(d=>d.value),[3.21,2.92]);
 assert.ok(first.observationInventory?.details.every(d=>d.metadata.sourceReceiptHash!==null));
 assert.equal(first.observationInventory?.digest,reverse.observationInventory?.digest);
});
test('newer invalid same-grain revision cannot revive an older valid fact or mix reported with forecasts',async()=>{
 const old=row(1,{filing_restatement_id:'SYNTHETIC_OLD'}),bad=row(2,{filing_restatement_id:'SYNTHETIC_NEW',unit:'TWD',validation_status:'rejected',unit_valid:false});
 const result=await read([old,bad]);assert.deepEqual(result.evidence,[]);assert.equal(result.observationInventory?.count,2);
 const duplicate=await read([old,{...old,recorded_at:'2026-10-22T02:00:00Z',value:99}]);
 assert.deepEqual(duplicate.evidence,[]);assert.deepEqual(duplicate.gaps,['financial_cache_binding_invalid']);
 const independentInterval=await read([old,{...bad,period_start:'2026-01-01'}]);
 assert.equal(independentInterval.evidence.length,1);assert.equal(independentInterval.evidence[0].financial?.periodStart,'2026-07-01');
 assert.equal(independentInterval.evidence[0].financial?.shareBasis,null); // no typed supersession or corrected basis
 const typed=await read([old,row(3,{estimate_kind:'analyst_estimate',estimate_horizon:'next_twelve_months',value:99}),row(4,{estimate_kind:'broker_consensus',estimate_horizon:'target_12m',value:199})]);
 assert.equal(typed.evidence.length,1);assert.equal(typed.evidence[0].value,old.value);assert.equal(typed.observationInventory?.count,3);
 assert.deepEqual(new Set(typed.observationInventory?.details.map(d=>d.metadata.estimateKind)),new Set(['reported','analyst_estimate','broker_consensus']));
});
test('whole bounded ambiguity inventory is checked before64detail clipping and late receipt microseconds never backfill',async()=>{
 const rows=Array.from({length:65},(_,index)=>row(index+1,{value:index===64?10.1:10})),first=await read(rows);
 assert.deepEqual(first.evidence,[]);assert.equal(first.observationInventory?.count,65);assert.equal(first.observationInventory?.details.length,64);assert.equal(first.observationInventory?.truncated,true);
 const changed=rows.map((r,i)=>i===64?{...r,value:10.2}:r),second=await read(changed);
 assert.deepEqual(first.observationInventory?.details,second.observationInventory?.details);assert.notEqual(first.observationInventory?.digest,second.observationInventory?.digest);
 const late=await read([row(1)],'2026-10-23T06:00:00.000001Z');assert.deepEqual(late.evidence,[]);
 assert.equal(late.observationInventory?.details[0].metadata.sourceReceiptHash,null);assert.equal(late.observationInventory?.details[0].metadata.knownAt,null);
 const laterFact=await read([row(1,{recorded_at:'2026-10-23T06:00:00.000001Z'})]);assert.deepEqual(laterFact.evidence,[]);assert.deepEqual(laterFact.gaps,['financial_cache_binding_invalid']);
});
function formula(rows:Evidence[]):Claim{return {id:'synthetic-ratio',text:'Synthetic same-end interval rejection; not a real financial claim.',kind:'derived',evidenceIds:rows.map(e=>e.id),
 numeric:{key:'synthetic_margin',value:0.5,unit:'ratio',period:'2026-09-30',formula:{operation:'divide',evidenceIds:rows.map(e=>e.id)}}};}
test('actual formula consumer rejects mixed interval/version or stripped metadata, preserving same-window non-EPS arithmetic',async()=>{
 const gross=row(1,{fact_key:'quarterly_gross_profit',unit:'TWD',value:100}),revenue=row(2,{fact_key:'quarterly_revenue',unit:'TWD',value:200});
 const matching=(await read([gross,revenue])).evidence;assert.deepEqual(validateClaim(formula(matching),matching),[]);
 const mixed=(await read([gross,{...revenue,period_start:'2026-01-01'}])).evidence;
 assert.ok(validateClaim(formula(mixed),mixed).includes('claim_formula_financial_period_or_basis_unavailable:synthetic-ratio'));
 for(const strip of ['one','both'] as const){const legacy=structuredClone(matching);delete legacy[0].financial;if(strip==='both')delete legacy[1].financial;
  assert.ok(validateClaim(formula(legacy),legacy).includes('claim_formula_financial_period_or_basis_unavailable:synthetic-ratio'));}
 const versions=structuredClone(matching);versions[1].financial!.filingRevisionId='OTHER_TYPED_FILING';
 assert.equal(financialPeriodsCompatible(versions[0],versions[1],true),false);
});
test('EPS basis cannot opt in through a forged DTO or an invalid scalar unit',async()=>{
 const sources=(await read([row(1),row(2,{fact_key:'quarterly_diluted_eps'})])).evidence;
 const forged=structuredClone(sources);Object.assign(forged[0].financial!,{shareBasis:'CALLER_APPROVED',corporateActionRevision:'CALLER_HASH',epsBasis:null});
 assert.equal(financialPeriodsCompatible(forged[0],forged[1]),false);
 for(const strip of [false,true]){const rows=structuredClone(sources);if(strip)rows.forEach(e=>{delete e.financial;});rows[0].unit='dimensionless';
  const claim:Claim={id:'synthetic-eps-mix',text:'Unknown share basis cannot become compatible through units.',kind:'derived',evidenceIds:rows.map(e=>e.id),numeric:{key:'valuation_base',value:Number(rows[0].value)*Number(rows[1].value),unit:'TWD_per_share',period:'2026-09-30',formula:{operation:'multiply',evidenceIds:rows.map(e=>e.id)}}};
  assert.ok(validateClaim(claim,rows).includes('claim_formula_financial_period_or_basis_unavailable:synthetic-eps-mix'));
 }
});
test('per-stock inventory stays scoped before display clipping and frozen preparation binds its exact digest',async()=>{
 const other='00000000-0000-4000-8000-000000000098',rows=[row(1),row(2,{stock_id:other,value:9.62})];
 const result=await readCurrentFinancialCache(port(rows),[stock,other],cutoff);
 assert.equal(result.observationInventories?.[stock].count,1);assert.equal(result.observationInventories?.[other].count,1);
 assert.ok(result.observationInventories?.[stock].details.every(d=>d.stockId===stock));
 assert.ok(result.observationInventories?.[other].details.every(d=>d.stockId===other));
 const sources=await resolveFinancialEvidenceSources(port([rows[0]]),[rows[0]],cutoff);
 const history:TwEntryHistoricalAuthorityResult={notEntryAuthority:true,nextSessionAuthority:false,completedSessions:[],bars:[],priceBasis:null,
  sourceDatasetRevision:'SYNTHETIC_UNAVAILABLE_HISTORY',availableAt:cutoff,missingData:['synthetic_history_unavailable']};
 const frozen=freezeFinancialPreparation({hash:inputHash('synthetic original'),evidence:[]},history,sources,cutoff);
 assert.deepEqual(frozen.evidence.financialObservationInventory,sources.observationInventory);
 assert.equal(frozen.inputHash,inputHash(frozen.evidence));
 assert.equal(frozen.evidence.evidence[0].contentHash,inputHash(rows[0]));
});

test('actual audit never compares same-end Q3 and cumulative margins as a temporal stability trend',async()=>{
 const rows=[row(1,{fact_key:'quarterly_gross_profit',unit:'TWD',value:90}),row(2,{fact_key:'quarterly_revenue',unit:'TWD',value:100}),
  row(3,{fact_key:'quarterly_gross_profit',unit:'TWD',value:10,period_start:'2026-01-01'}),row(4,{fact_key:'quarterly_revenue',unit:'TWD',value:100,period_start:'2026-01-01'})];
 const cache=await read(rows),audit=auditPublishedThesis({symbol:'2330',inputHash:'a'.repeat(64),publishedInputHash:null,revisionId:null,
  artifact:null,review:null,original:[],current:cache.evidence,newContent:[],cutoff,financialObservationInventory:cache.observationInventory,
  quote:{close:null,session:null,source:'',adjusted:false,volume:null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null},
  market:{risk:'unknown',snapshotHash:null},previousMarketHash:null,tradingValid:null});
 const margin=audit.deepInputs.profitabilityChecklist.checks[0];assert.equal(margin.met,null);
 const observations=margin.raw as Array<{periodStart:string;value:number}>;
 assert.equal(observations.length,2);assert.deepEqual(new Set(observations.map(r=>r.value)),new Set([0.9,0.1]));
 assert.deepEqual(new Set(observations.map(r=>r.periodStart)),new Set(['2026-07-01','2026-01-01']));
 assert.ok(audit.gaps.includes('financial_margin_temporal_comparison_rule_unavailable'));
 assert.equal(audit.materialEvidence.financialObservationInventory?.digest,cache.observationInventory?.digest);
 assert.ok(audit.gaps.includes('missing_sql_financial_interval_basis_parity'));
});
