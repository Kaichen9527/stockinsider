export type CandidateRiskAction = 'hold' | 'trim_no_chase' | 'hard_exit' | 'data_incomplete';

export function candidateRiskAction(input: {
  close: number | null;
  referencePrice: number | null;
  atr14: number | null;
  ma20: number | null;
  ma60: number | null;
  priorCloseBelowMa60: boolean;
  rsi14: number | null;
  baseTarget: number | null;
  marketBreakdown: boolean;
  materialOfficialCounterEvidence: boolean;
}) {
  const { close, referencePrice, atr14, ma20, ma60 } = input;
  if ([close, referencePrice, atr14, ma20, ma60].some((value) => value == null || !Number.isFinite(value))) {
    return { state: 'data_incomplete' as const, reasons: ['risk_action_inputs_incomplete'] };
  }
  const reasons: string[] = [];
  if (close! <= referencePrice! - 2 * atr14!) reasons.push('initial_2atr_stop');
  if (close! < ma60! && input.priorCloseBelowMa60) reasons.push('two_closes_below_ma60');
  if (input.materialOfficialCounterEvidence) reasons.push('material_official_counter_evidence');
  if (input.marketBreakdown && close! < ma20!) reasons.push('market_breakdown_and_below_ma20');
  if (reasons.length) return { state: 'hard_exit' as const, reasons };
  if (input.baseTarget != null && close! >= input.baseTarget) reasons.push('base_target_reached');
  if (input.rsi14 != null && input.rsi14 >= 75) reasons.push('rsi_overheated');
  if (close! > ma20! + 2 * atr14!) reasons.push('price_above_ma20_plus_2atr');
  return reasons.length ? { state: 'trim_no_chase' as const, reasons } : { state: 'hold' as const, reasons: ['trend_and_margin_of_safety_intact'] };
}
