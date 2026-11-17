/** Invented rows/receipt ports for isolated comparison tests; no DB/source,
 * rights, corporate-action basis, semantic review or publication authority. */
import {projectFinancialEvidenceSources} from './financial-evidence-sources.ts';
import type {Evidence} from './research.ts';
export function withSyntheticFinancialMetadata(source:Evidence,periodStart:string|null){
 const row={fact_id:source.id,stock_id:'SYNTHETIC_STOCK',fact_key:source.key,period_start:periodStart,period_end:source.period,
  duration_kind:periodStart===null?'instant':'quarterly',value:source.value,unit:source.unit,provider:'twse',authority_tier:'official_primary',
  estimate_kind:'reported',estimate_horizon:'reported_period',filing_published_at:source.eventAt,source_timestamp:source.eventAt,
  collected_at:source.availableAt,recorded_at:source.availableAt,validation_recorded_at:source.availableAt,filing_restatement_id:'SYNTHETIC_FIXED_FILING',
  source_ref:`twse-openapi:synthetic:${source.id}`,validation_status:'validated',schema_valid:true,unit_valid:true,point_in_time_valid:true,consistency_valid:true};
 const rows={provenance:[{provenance_id:`SYNTHETIC_PROVENANCE:${source.id}`,fact_id:source.id,acquisition_job_id:`SYNTHETIC_JOB:${source.id}`,
  source_url:source.source,source_sha256:'b'.repeat(64),locator:{source_ref:row.source_ref,period_end:source.period,fact_key:source.key},
  extracted_at:source.availableAt,recorded_at:source.availableAt}],jobs:[{job_id:`SYNTHETIC_JOB:${source.id}`,stock_id:row.stock_id,period_end:source.period,
   status:'terminal',terminal_reason:'complete',response_sha256:'b'.repeat(64),source_url:source.source,collected_at:source.availableAt,created_at:source.availableAt,updated_at:source.availableAt}],
  links:[],receipts:[],documents:[]};
 const result=projectFinancialEvidenceSources([row],rows,source.availableAt);
 if(result.evidence.length!==1)throw Error('synthetic_financial_fixture_projection_failed');
 return result.evidence[0];
}
