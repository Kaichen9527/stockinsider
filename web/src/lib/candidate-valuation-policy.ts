export const CYCLICAL_ASSET_SYMBOLS = new Set([
  '1101','1301','1312','1314','1326','1802','2002','2337','2369','2408','3049','6770',
]);
export const FORWARD_BRIDGE_SYMBOLS = new Set(['1815','3715','6230']);
export const TURNAROUND_SYMBOLS = new Set(['2332','4171']);
export const VALUATION_REMEDIATION_SYMBOLS = new Set([
  ...CYCLICAL_ASSET_SYMBOLS,
  ...FORWARD_BRIDGE_SYMBOLS,
  ...TURNAROUND_SYMBOLS,
]);

export type CandidateValuationBasis =
  | 'forward_12m'
  | 'normalized_cycle'
  | 'ttm_multiple_reference'
  | 'turnaround_conditional'
  | 'no_defensible_valuation_method';

export function candidateValuationPolicy(input: {
  symbol: string;
  multipleMonthsCovered: number;
  next12mBridgeComplete: boolean;
  verifiedTurnaroundPath: boolean;
}) {
  if (TURNAROUND_SYMBOLS.has(input.symbol)) {
    return input.verifiedTurnaroundPath
      ? { basis: 'turnaround_conditional' as const, canPublishTarget: input.next12mBridgeComplete, reason: input.next12mBridgeComplete ? null : 'turnaround_bridge_incomplete' }
      : { basis: 'no_defensible_valuation_method' as const, canPublishTarget: false, reason: 'no_defensible_valuation_method' };
  }
  if (input.multipleMonthsCovered < 48) {
    return { basis: 'ttm_multiple_reference' as const, canPublishTarget: false, reason: 'official_multiple_coverage_below_48_of_60' };
  }
  if (CYCLICAL_ASSET_SYMBOLS.has(input.symbol)) {
    return { basis: 'normalized_cycle' as const, canPublishTarget: false, reason: 'normalized_cycle_earnings_and_asset_return_inputs_incomplete' };
  }
  if (FORWARD_BRIDGE_SYMBOLS.has(input.symbol)) {
    return input.next12mBridgeComplete
      ? { basis: 'forward_12m' as const, canPublishTarget: true, reason: null }
      : { basis: 'ttm_multiple_reference' as const, canPublishTarget: false, reason: 'next_12m_earnings_bridge_incomplete' };
  }
  return input.next12mBridgeComplete
    ? { basis: 'forward_12m' as const, canPublishTarget: true, reason: null }
    : { basis: 'ttm_multiple_reference' as const, canPublishTarget: false, reason: 'next_12m_earnings_bridge_incomplete' };
}
