/**
 * Valuation routing is evidence-driven. `symbol` remains accepted solely for
 * backwards-compatible callers; it is deliberately not used to choose a
 * valuation method.
 */
export const CYCLICAL_ASSET_SYMBOLS = new Set<string>();
export const FORWARD_BRIDGE_SYMBOLS = new Set<string>();
export const TURNAROUND_SYMBOLS = new Set<string>();
export const VALUATION_REMEDIATION_SYMBOLS = new Set<string>();

export type CandidateValuationBasis =
  | 'forward_12m'
  | 'normalized_cycle'
  | 'pb_reference'
  | 'ev_ebitda'
  | 'financial_pb_roe'
  | 'ttm_multiple_reference'
  | 'turnaround_conditional'
  | 'no_defensible_valuation_method';

type NormalizedCycleInputs = {
  normalizedEps?: number | null;
  cycleYearsObserved?: number | null;
  bookValuePerShare?: number | null;
  pbMultiple?: number | null;
  enterpriseValue?: number | null;
  ebitda?: number | null;
};
type FinancialInputs = {
  commonEquity?: number | null;
  bookValuePerShare?: number | null;
  roe?: number | null;
  pbMultiple?: number | null;
  roePeriodsObserved?: number | null;
};

function positive(value: number | null | undefined) { return typeof value === 'number' && Number.isFinite(value) && value > 0; }

export function candidateValuationPolicy(input: {
  symbol?: string;
  multipleMonthsCovered: number;
  next12mBridgeComplete: boolean;
  verifiedTurnaroundPath: boolean;
  businessModel?: 'general' | 'financial';
  lossMaking?: boolean;
  normalizedCycle?: NormalizedCycleInputs;
  financial?: FinancialInputs;
}) {
  const historyReady = input.multipleMonthsCovered >= 48;
  const lossMaking = input.lossMaking === true;
  const normalized = input.normalizedCycle;
  const financial = input.financial;
  if (lossMaking) {
    return input.verifiedTurnaroundPath && input.next12mBridgeComplete
      ? { basis: 'turnaround_conditional' as const, canPublishTarget: true, reason: null }
      : { basis: 'no_defensible_valuation_method' as const, canPublishTarget: false, reason: 'loss_making_investigation_required' };
  }
  if (input.businessModel === 'financial') {
    const complete = positive(financial?.commonEquity) && positive(financial?.bookValuePerShare)
      && positive(financial?.roe) && positive(financial?.pbMultiple) && (financial?.roePeriodsObserved || 0) >= 8 && historyReady;
    return complete
      ? { basis: 'financial_pb_roe' as const, canPublishTarget: true, reason: null }
      : { basis: 'no_defensible_valuation_method' as const, canPublishTarget: false, reason: 'financial_equity_pb_roe_inputs_incomplete' };
  }
  if (positive(normalized?.normalizedEps) && (normalized?.cycleYearsObserved || 0) >= 5 && historyReady) {
    return { basis: 'normalized_cycle' as const, canPublishTarget: true, reason: null };
  }
  if (positive(normalized?.enterpriseValue) && positive(normalized?.ebitda) && historyReady) {
    return { basis: 'ev_ebitda' as const, canPublishTarget: true, reason: null };
  }
  if (positive(normalized?.bookValuePerShare) && positive(normalized?.pbMultiple) && historyReady) {
    return { basis: 'pb_reference' as const, canPublishTarget: true, reason: null };
  }
  if (input.next12mBridgeComplete && historyReady) return { basis: 'forward_12m' as const, canPublishTarget: true, reason: null };
  return {
    basis: 'ttm_multiple_reference' as const,
    canPublishTarget: false,
    reason: historyReady ? 'next_12m_earnings_bridge_incomplete' : 'official_multiple_coverage_below_48_of_60',
  };
}
