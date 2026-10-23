export type ResearchFailureDisposition='permanent'|'transient'|'uncertain';
/** Only locally established missing authority or a definite, settled provider
 * rejection is terminal. A timeout, read failure or unknown exception never
 * proves that preparation/provider work did not commit. */
export function researchFailureDisposition(error:unknown):ResearchFailureDisposition{
 if(error instanceof Error && error.name==='ProviderOutcomeUncertain')return 'uncertain';
 const reason=error instanceof Error?error.message:typeof error==='string'?error:'';
 const code=reason.split(':',1)[0];
 if(['vnext_validated_financial_data_missing','vnext_stock_authority_missing','vnext_trading_authority_missing','vnext_financial_coverage_permanently_unavailable','vnext_artifact_rejected','vnext_review_rejected',
  'vnext_worker_author_invalid','vnext_worker_review_invalid','vnext_worker_author_closed_shape','vnext_worker_sections_closed_shape','vnext_worker_section_closed_shape','vnext_worker_claim_closed_shape','vnext_worker_numeric_closed_shape','vnext_worker_formula_closed_shape','vnext_worker_claims_required','vnext_worker_review_closed_shape','vnext_worker_review_check_closed_shape','vnext_worker_review_claim_binding','vnext_worker_review_source_binding','vnext_worker_json_depth','vnext_worker_json_number_codec_unsupported','vnext_worker_json_unicode_invalid','vnext_worker_json_key_codec_unsupported',
  'provider_output_not_one_json_document','provider_output_invalid_json','provider_failed','provider_cancelled','provider_incomplete'].includes(code))return 'permanent';
 if(reason==='provider_http_429')return 'transient';
 if(/^provider_http_(400|401|403|404|413|422)$/u.test(reason))return 'permanent';
 return 'uncertain';
}
