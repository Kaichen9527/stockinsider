export type CandidateRiskAction = 'hold' | 'trim_no_chase' | 'hard_exit' | 'data_incomplete';

export type AtrBar = { high: number; low: number; close: number };

/**
 * Wilder ATR(14), seeded by the first fourteen true ranges and subsequently
 * smoothed as ((priorATR * 13) + currentTR) / 14. This is intentionally local:
 * indicator-library ATR implementations can use different SMA/seed semantics.
 */
export function wilderAtr14(bars: AtrBar[]): number | null {
  if (bars.length < 14 || bars.some((bar) => !Number.isFinite(bar.high) || !Number.isFinite(bar.low)
    || !Number.isFinite(bar.close) || bar.high < bar.low || bar.close <= 0)) return null;
  const trueRanges = bars.map((bar, index) => {
    const priorClose = index === 0 ? null : bars[index - 1].close;
    return priorClose == null ? bar.high - bar.low : Math.max(bar.high - bar.low, Math.abs(bar.high - priorClose), Math.abs(bar.low - priorClose));
  });
  let atr = trueRanges.slice(0, 14).reduce((sum, value) => sum + value, 0) / 14;
  for (const trueRange of trueRanges.slice(14)) atr = (atr * 13 + trueRange) / 14;
  return Number.isFinite(atr) && atr > 0 ? atr : null;
}

export function validAtr14(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}

export function adjacentSessionBelowMa60(input: {
  currentSessionDate: string | null;
  expectedPreviousSessionDate: string | null;
  priorSessionDate: string | null;
  priorClose: number | null;
  priorMa60: number | null;
}): boolean {
  return input.currentSessionDate != null && input.expectedPreviousSessionDate != null
    && input.priorSessionDate === input.expectedPreviousSessionDate
    && input.priorClose != null && input.priorMa60 != null
    && Number.isFinite(input.priorClose) && Number.isFinite(input.priorMa60)
    && input.priorClose < input.priorMa60;
}

export type RiskEpisodeState = {
  signalEpisodeId: string | null;
  referenceSessionDate: string | null;
  referencePrice: number | null;
  initialAtr14: number | null;
  initialStopPrice: number | null;
  peakClose: number | null;
  maxDrawdownPct: number | null;
};

/**
 * Starts an episode on the actionable transition but sets the reference on the
 * following adjacent session (t+1). The initial ATR belongs to the start day
 * and is never recomputed; a non-actionable transition clears all state so a
 * later signal cannot inherit a stale stop or high-water mark.
 */
export function advanceRiskEpisode(input: {
  stage: 'found' | 'waiting' | 'actionable';
  previousStage: 'found' | 'waiting' | 'actionable' | null;
  sessionDate: string;
  priorSessionDate: string | null;
  expectedPreviousSessionDate: string | null;
  close: number | null;
  atr14: number | null;
  episodeId: string;
  prior: RiskEpisodeState | null;
}): RiskEpisodeState {
  if (input.stage !== 'actionable') return { signalEpisodeId: null, referenceSessionDate: null, referencePrice: null, initialAtr14: null, initialStopPrice: null, peakClose: null, maxDrawdownPct: null };
  const starts = input.previousStage !== 'actionable';
  if (starts) return {
    signalEpisodeId: input.episodeId, referenceSessionDate: null, referencePrice: null,
    initialAtr14: validAtr14(input.atr14) ? input.atr14 : null, initialStopPrice: null,
    peakClose: null, maxDrawdownPct: null,
  };
  const prior = input.prior;
  if (!prior?.signalEpisodeId || !input.expectedPreviousSessionDate || input.priorSessionDate !== input.expectedPreviousSessionDate) {
    // A missing episode row or skipped official session cannot create a hidden
    // entry reference. Preserve no misleading risk state until a new episode.
    return { signalEpisodeId: prior?.signalEpisodeId ?? null, referenceSessionDate: prior?.referenceSessionDate ?? null, referencePrice: prior?.referencePrice ?? null, initialAtr14: prior?.initialAtr14 ?? null, initialStopPrice: prior?.initialStopPrice ?? null, peakClose: prior?.peakClose ?? null, maxDrawdownPct: prior?.maxDrawdownPct ?? null };
  }
  const referencePrice = prior.referencePrice ?? (input.close != null && Number.isFinite(input.close) ? input.close : null);
  const referenceSessionDate = prior.referenceSessionDate ?? (referencePrice == null ? null : input.sessionDate);
  const initialAtr14 = prior.initialAtr14;
  const initialStopPrice = prior.initialStopPrice ?? (referencePrice != null && validAtr14(initialAtr14) ? referencePrice - 2 * initialAtr14 : null);
  const peakClose = referencePrice == null || input.close == null || !Number.isFinite(input.close)
    ? prior.peakClose : Math.max(referencePrice, prior.peakClose ?? referencePrice, input.close);
  const maxDrawdownPct = runningMaxDrawdown(prior.maxDrawdownPct, peakClose, input.close);
  return { signalEpisodeId: prior.signalEpisodeId, referenceSessionDate, referencePrice, initialAtr14, initialStopPrice, peakClose, maxDrawdownPct };
}

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
  currentSessionDate?: string | null;
  expectedPreviousSessionDate?: string | null;
  priorSessionDate?: string | null;
  priorClose?: number | null;
  priorMa60?: number | null;
  rsi14: number | null;
  baseTarget: number | null;
  marketBreakdown: boolean;
  materialOfficialCounterEvidence: boolean;
}) {
  const { close, referencePrice, atr14, ma20, ma60, initialStopPrice } = input;
  if ([close, referencePrice, ma20, ma60, initialStopPrice].some((value) => value == null || !Number.isFinite(value)) || !validAtr14(atr14)) {
    return { state: 'data_incomplete' as const, reasons: ['risk_action_inputs_incomplete'] };
  }
  const reasons: string[] = [];
  if (input.initialStopPrice != null && close! <= input.initialStopPrice) reasons.push('initial_2atr_stop');
  const hasExplicitSessionCheck = input.currentSessionDate !== undefined || input.priorSessionDate !== undefined || input.expectedPreviousSessionDate !== undefined;
  const priorBelowMa60 = hasExplicitSessionCheck
    ? adjacentSessionBelowMa60({ currentSessionDate: input.currentSessionDate ?? null, expectedPreviousSessionDate: input.expectedPreviousSessionDate ?? null, priorSessionDate: input.priorSessionDate ?? null, priorClose: input.priorClose ?? null, priorMa60: input.priorMa60 ?? null })
    : input.priorCloseBelowMa60;
  if (close! < ma60! && priorBelowMa60) reasons.push('two_closes_below_ma60');
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
