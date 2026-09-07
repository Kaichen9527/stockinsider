/**
 * The small, shared contract at the boundary between acquisition, research and
 * the public valuation read model.  Provider identity is intentionally not a
 * substitute for validation: a FinMind mirror can be admissible, while an
 * unvalidated (or stale/conflicting) mirror cannot.
 */
export const CANDIDATE_FACT_KINDS = [
  'reported_numeric',
  // Kept only for legacy readers. New writers must use reported_numeric.
  'official_numeric',
  'official_text',
  'model_assumption',
  'derived_calculation',
  'data_gap',
] as const;

export type CandidateFactKind = (typeof CANDIDATE_FACT_KINDS)[number];

export const EVIDENCE_VALIDATION_STATUSES = [
  'validated',
  'pending',
  'rejected',
  'stale',
  'conflict',
] as const;

export type EvidenceValidationStatus = (typeof EVIDENCE_VALIDATION_STATUSES)[number];

export const CANDIDATE_VALUATION_METHODS = [
  'forward_pe',
  'normalized_pe',
  'ev_ebitda',
  'forward_pb',
  'financial_pb_roe',
  'pb_reference',
  'ev_sales',
  'ev_gross_profit',
  'dcf',
  'ttm_pe_reference',
  'ttm_pb_reference',
] as const;

export type CandidateValuationMethod = (typeof CANDIDATE_VALUATION_METHODS)[number];

export type PromotionEvidence = {
  provider?: string | null;
  authorityTier?: string | null;
  validationStatus?: string | null;
  schemaValid?: boolean | null;
  unitValid?: boolean | null;
  pointInTimeValid?: boolean | null;
  consistencyValid?: boolean | null;
  synthetic?: boolean | null;
  stale?: boolean | null;
};

export function normalizeCandidateFactKind(value: unknown): CandidateFactKind | null {
  if (value === 'official_numeric') return 'reported_numeric';
  return CANDIDATE_FACT_KINDS.includes(value as CandidateFactKind)
    ? value as CandidateFactKind
    : null;
}

/**
 * Old official filings did not have a separate validation-status column. They
 * remain readable as official evidence. Mirrors have no such grandfathering:
 * every validation dimension must be positively recorded before promotion.
 */
export function isPromotionEligibleEvidence(evidence: PromotionEvidence): boolean {
  if (evidence.synthetic === true || evidence.stale === true) return false;
  if (evidence.authorityTier === 'official_filing' || evidence.authorityTier === 'official_primary') {
    return evidence.validationStatus == null || evidence.validationStatus === 'validated';
  }
  if (evidence.provider !== 'finmind' && evidence.authorityTier !== 'finmind_mirror') return false;
  return evidence.validationStatus === 'validated'
    && evidence.schemaValid === true
    && evidence.unitValid === true
    && evidence.pointInTimeValid === true
    && evidence.consistencyValid === true;
}

export function candidateResearchItemStatus(input: {
  executionFailed: boolean;
  valuationComplete: boolean;
  noDefensibleMethod: boolean;
}): 'success' | 'partial' | 'failed' {
  if (input.executionFailed) return 'failed';
  // A documented no-defensible-method conclusion is a terminal research result;
  // an acquisition/evidence gap is not.
  if (input.valuationComplete || input.noDefensibleMethod) return 'success';
  return 'partial';
}
