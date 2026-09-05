export type CandidateRiskAction = 'hold' | 'trim_no_chase' | 'hard_exit' | 'data_incomplete';

export function runningMaxDrawdown(previous: number | null, peak: number | null, close: number | null) {
  const current = peak != null && peak > 0 && close != null && Number.isFinite(close) ? (close - peak) / peak * 100 : null;
  if (current == null) return previous;
  return previous == null ? current : Math.min(previous, current);
}

export function candidateRiskAction(input: {
  close: number | null;
  referencePrice: number | null;
  atr14: number | null;
  initialStopPrice: number | null;
  ma20: number | null;
  ma60: number | null;
  priorCloseBelowMa60: boolean;
  rsi14: number | null;
  baseTarget: number | null;
  marketBreakdown: boolean;
  materialOfficialCounterEvidence: boolean;
}) {
  const { close, referencePrice, atr14, ma20, ma60, initialStopPrice } = input;
  if ([close, referencePrice, atr14, ma20, ma60, initialStopPrice].some((value) => value == null || !Number.isFinite(value))) {
    return { state: 'data_incomplete' as const, reasons: ['risk_action_inputs_incomplete'] };
  }
  const reasons: string[] = [];
  if (input.initialStopPrice != null && close! <= input.initialStopPrice) reasons.push('initial_2atr_stop');
  if (close! < ma60! && input.priorCloseBelowMa60) reasons.push('two_closes_below_ma60');
  if (input.materialOfficialCounterEvidence) reasons.push('material_official_counter_evidence');
  if (input.marketBreakdown && close! < ma20!) reasons.push('market_breakdown_and_below_ma20');
  if (reasons.length) return { state: 'hard_exit' as const, reasons };
  if (input.baseTarget != null && close! >= input.baseTarget) reasons.push('base_target_reached');
  if (input.rsi14 != null && input.rsi14 >= 75) reasons.push('rsi_overheated');
  if (close! > ma20! + 2 * atr14!) reasons.push('price_above_ma20_plus_2atr');
  if (close! < ma20! || close! < ma60!) reasons.push('trend_support_weakened');
  if (input.baseTarget == null || close! >= input.baseTarget) reasons.push('valuation_margin_not_available');
  return reasons.length ? { state: 'trim_no_chase' as const, reasons: [...new Set(reasons)] } : { state: 'hold' as const, reasons: ['trend_and_margin_of_safety_intact'] };
}
