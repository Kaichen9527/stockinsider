import type { RadarDailyPayload, SourceSignalCard } from './types';

export const STAGE_RULESET_VERSION = 'source-ranking-v2.0.0';

export type CandidateLifecycleStage = 'found' | 'waiting' | 'actionable';
export type MarketRiskRegime = 'risk_on' | 'selective' | 'risk_off' | 'breakdown' | 'unknown';

type DiscoveryFactors = {
  independentSources: number;
  platformDiversity: number;
  discussionBurst: number;
  recency: number;
  sourceReliability: number;
};

type ResearchFactors = {
  valuationMarginOfSafety: number;
  financialBridge: number;
  officialEvidenceAndCounterEvidence: number;
  brokerEvidence: number;
  industryRotation: number;
  overseasPeers: number;
};

type ActionabilityFactors = {
  movingAveragesAndRelativeStrength: number;
  priceVolume: number;
  institutionalFlows: number;
  marketRegime: number;
  industryRotation: number;
  overseasPeers: number;
  overheatRisk: number;
};

type ConfidenceFactors = {
  completeness: number;
  freshness: number;
  traceability: number;
  crossSourceConsistency: number;
};

export type CandidateStageInput = {
  discovery: DiscoveryFactors;
  research: ResearchFactors;
  actionability: ActionabilityFactors;
  confidence: ConfidenceFactors;
  valuation: {
    hasBearBaseBull: boolean;
    baseUpsidePct: number | null;
    rewardRiskRatio: number | null;
    hasMaterialOfficialCounterEvidence: boolean;
  };
  technical: {
    close: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    ma240: number | null;
    ma60Slope: number | null;
    volumeRatio20Median: number | null;
    atr14: number | null;
    rsi14: number | null;
    breakoutAboveLongMa: boolean;
  };
  marketRegime: MarketRiskRegime;
  peerCatchdownBlock: boolean;
  staleOrFallback: boolean;
  consecutiveActionableCloses: number;
  previousStage?: CandidateLifecycleStage | null;
};

export type CandidateStageResult = {
  stage: CandidateLifecycleStage;
  scores: {
    discovery: number;
    research: number;
    actionability: number;
    dataConfidence: number;
  };
  unmetConditions: string[];
  promotionReasons: string[];
  technicalHardGatePassed: boolean;
  rulesetVersion: typeof STAGE_RULESET_VERSION;
};

function bounded(value: number): number {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function weighted(values: Array<[number, number]>): number {
  return Math.round(values.reduce((sum, [value, weight]) => sum + bounded(value) * weight, 0) * 10) / 10;
}

export function scoreDiscovery(factors: DiscoveryFactors): number {
  return weighted([
    [factors.independentSources, 0.35],
    [factors.platformDiversity, 0.20],
    [factors.discussionBurst, 0.20],
    [factors.recency, 0.15],
    [factors.sourceReliability, 0.10],
  ]);
}

export function scoreResearch(factors: ResearchFactors): number {
  return weighted([
    [factors.valuationMarginOfSafety, 0.30],
    [factors.financialBridge, 0.25],
    [factors.officialEvidenceAndCounterEvidence, 0.15],
    [factors.brokerEvidence, 0.10],
    [factors.industryRotation, 0.10],
    [factors.overseasPeers, 0.10],
  ]);
}

export function scoreActionability(factors: ActionabilityFactors): number {
  return weighted([
    [factors.movingAveragesAndRelativeStrength, 0.30],
    [factors.priceVolume, 0.15],
    [factors.institutionalFlows, 0.15],
    [factors.marketRegime, 0.15],
    [factors.industryRotation, 0.10],
    [factors.overseasPeers, 0.10],
    [factors.overheatRisk, 0.05],
  ]);
}

export function scoreDataConfidence(factors: ConfidenceFactors): number {
  return weighted([
    [factors.completeness, 0.30],
    [factors.freshness, 0.25],
    [factors.traceability, 0.25],
    [factors.crossSourceConsistency, 0.20],
  ]);
}

function hasNumber(value: number | null): value is number {
  return value != null && Number.isFinite(value);
}

export function technicalActionGate(input: CandidateStageInput['technical']): boolean {
  const { close, ma20, ma60, ma120, ma240, ma60Slope, volumeRatio20Median, atr14, rsi14 } = input;
  if (!hasNumber(close) || !hasNumber(ma20) || !hasNumber(ma60) || !hasNumber(atr14) || !hasNumber(rsi14)) return false;
  const trendPass = close > ma20 && close > ma60 && hasNumber(ma60Slope) && ma60Slope >= 0 && ma20 > ma60;
  const breakoutLevel = hasNumber(ma240) ? ma240 : ma120;
  const breakoutPass = input.breakoutAboveLongMa && hasNumber(breakoutLevel)
    && close > breakoutLevel && hasNumber(volumeRatio20Median) && volumeRatio20Median >= 1.3;
  const notOverextended = close <= ma20 + 2 * atr14 && rsi14 < 75;
  return (trendPass || breakoutPass) && notOverextended;
}

export function classifyCandidateStage(input: CandidateStageInput): CandidateStageResult {
  const scores = {
    discovery: scoreDiscovery(input.discovery),
    research: scoreResearch(input.research),
    actionability: scoreActionability(input.actionability),
    dataConfidence: scoreDataConfidence(input.confidence),
  };
  const unmet: string[] = [];
  const promotionReasons: string[] = [];
  const baseUpside = input.valuation.baseUpsidePct;
  const rewardRisk = input.valuation.rewardRiskRatio;
  const waitingEligible = scores.research >= 55
    && scores.dataConfidence >= 55
    && input.valuation.hasBearBaseBull
    && hasNumber(baseUpside) && baseUpside >= 8
    && hasNumber(rewardRisk) && rewardRisk >= 1
    && !input.valuation.hasMaterialOfficialCounterEvidence;

  if (scores.research < 55) unmet.push('research_score_below_55');
  if (scores.dataConfidence < 55) unmet.push('data_confidence_below_55');
  if (!input.valuation.hasBearBaseBull) unmet.push('bear_base_bull_missing');
  if (!hasNumber(baseUpside) || baseUpside < 8) unmet.push('base_upside_below_8');
  if (!hasNumber(rewardRisk) || rewardRisk < 1) unmet.push('reward_risk_below_1');
  if (input.valuation.hasMaterialOfficialCounterEvidence) unmet.push('material_official_counter_evidence');

  const technicalPassed = technicalActionGate(input.technical);
  const actionableEligible = waitingEligible
    && scores.research >= 70
    && scores.actionability >= 65
    && scores.dataConfidence >= 75
    && hasNumber(baseUpside) && baseUpside >= 12
    && hasNumber(rewardRisk) && rewardRisk >= 1.5
    && input.consecutiveActionableCloses >= 2
    && technicalPassed
    && !input.peerCatchdownBlock
    && !input.staleOrFallback
    && !['risk_off', 'breakdown'].includes(input.marketRegime);

  if (waitingEligible) {
    promotionReasons.push('minimum_research_and_valuation_complete');
    if (scores.research < 70) unmet.push('research_score_below_70');
    if (scores.actionability < 65) unmet.push('actionability_below_65');
    if (scores.dataConfidence < 75) unmet.push('data_confidence_below_75');
    if (!hasNumber(baseUpside) || baseUpside < 12) unmet.push('base_upside_below_12');
    if (!hasNumber(rewardRisk) || rewardRisk < 1.5) unmet.push('reward_risk_below_1_5');
    if (input.consecutiveActionableCloses < 2) unmet.push('requires_two_consecutive_closes');
    if (!technicalPassed) unmet.push('technical_hard_gate_failed');
    if (input.peerCatchdownBlock) unmet.push('negative_overseas_peer_catchdown');
    if (input.staleOrFallback) unmet.push('stale_or_fallback_data');
    if (input.marketRegime === 'risk_off') unmet.push('market_risk_off_blocks_new_actionable');
    if (input.marketRegime === 'breakdown') unmet.push('market_breakdown_forces_downgrade');
  }

  const stage: CandidateLifecycleStage = actionableEligible ? 'actionable' : waitingEligible ? 'waiting' : 'found';
  if (stage === 'actionable') promotionReasons.push('all_actionable_hard_gates_passed_two_sessions');
  return {
    stage,
    scores,
    unmetConditions: [...new Set(unmet)],
    promotionReasons,
    technicalHardGatePassed: technicalPassed,
    rulesetVersion: STAGE_RULESET_VERSION,
  };
}

export function sourceSignalLifecycleStage(signal: SourceSignalCard): CandidateLifecycleStage {
  if (signal.projectionReadOnly) return signal.researchReadiness?.status === 'data_needed' ? 'found' : 'waiting';
  const readiness = signal.researchReadiness?.status;
  if (readiness === 'actionable') return 'actionable';
  if (readiness === 'near_action' || readiness === 'wait_condition') return 'waiting';
  const action = signal.decisionEnvelope?.userAction;
  if (['buy', 'accumulate', 'research_starter'].includes(action)) return 'actionable';
  if (['wait_value', 'wait_market', 'wait_breakout', 'wait_reclaim', 'avoid_chase'].includes(action)) return 'waiting';
  return signal.proximityToAction ? 'waiting' : 'found';
}

export function buildRadarStages(payload: Pick<RadarDailyPayload, 'sourceSignals'>): NonNullable<RadarDailyPayload['stages']> {
  const found = [...(payload.sourceSignals ?? [])];
  return {
    found,
    waiting: found.filter((signal) => sourceSignalLifecycleStage(signal) === 'waiting'),
    actionable: found.filter((signal) => sourceSignalLifecycleStage(signal) === 'actionable'),
  };
}
