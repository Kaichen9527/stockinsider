import { NextRequest, NextResponse } from 'next/server';
import { getDailyRadarData, getPersistedRadarStages } from '@/lib/domain';
import { legacyCorrectnessProjectionEnabled, loadPublishedRadarProjection,
  RadarProjectionUnavailableError } from '@/lib/radar-projection-read';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { compactProducerRadarPayload } from '@/lib/radar-producer-payload';
import { radarResponseHeaders } from '@/lib/radar-response-policy';
import type { RadarDailyPayload } from '@/lib/types';
import { loadLatestRadarPublicSnapshot, radarPublicSnapshotsEnabled } from '@/lib/radar-public-snapshot';
import { hasCandidateStageCards } from '@/lib/candidate-stage-contract';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
const NO_STORE = radarResponseHeaders('fresh');

const CARD_BUCKETS = [
  'opportunities',
  'scenarioUpsideCandidates',
  'earlyWatchlist',
  'recentFormal7d',
  'fallbackOpportunities90d',
  'hotTracking',
] as const;

function truncateText(value: unknown, max = 140) {
  if (typeof value !== 'string') return value ?? null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compactEntryDecision(entry: Record<string, unknown> | null | undefined) {
  if (!entry || typeof entry !== 'object') return null;
  const buyPlan = entry.buyPlan && typeof entry.buyPlan === 'object' ? (entry.buyPlan as Record<string, unknown>) : null;
  const indicatorStack = entry.indicatorStack && typeof entry.indicatorStack === 'object' ? (entry.indicatorStack as Record<string, unknown>) : null;
  return {
    action: entry.action ?? null,
    positionSize: entry.positionSize ?? null,
    buyZone: entry.buyZone ?? null,
    addCondition: truncateText(entry.addCondition, 120),
    stopLoss: entry.stopLoss ?? null,
    invalidation: truncateText(entry.invalidation, 120),
    confidence: entry.confidence ?? null,
    actionabilityScore: entry.actionabilityScore ?? null,
    buyNowAllowed: entry.buyNowAllowed ?? null,
    entryStyle: entry.entryStyle ?? null,
    buyPlan: buyPlan
      ? {
          initialSizePct: buyPlan.initialSizePct ?? null,
          addSizePct: buyPlan.addSizePct ?? null,
          maxSizePct: buyPlan.maxSizePct ?? null,
          buyZone: truncateText(buyPlan.buyZone, 100),
          breakoutTrigger: truncateText(buyPlan.breakoutTrigger, 100),
          pullbackTrigger: truncateText(buyPlan.pullbackTrigger, 100),
          stopLoss: truncateText(buyPlan.stopLoss, 100),
          takeProfit: truncateText(buyPlan.takeProfit, 100),
        }
      : null,
    indicatorStack: indicatorStack
      ? {
          adx: indicatorStack.adx ?? null,
          atr: indicatorStack.atr ?? null,
          bollinger: indicatorStack.bollinger ?? null,
          stochastic: indicatorStack.stochastic ?? null,
          mfi: indicatorStack.mfi ?? null,
          obv: indicatorStack.obv ?? null,
          cmf: indicatorStack.cmf ?? null,
          volumeRatio20d: indicatorStack.volumeRatio20d ?? null,
        }
      : null,
  };
}

function compactDecisionTrigger(trigger: unknown) {
  if (!trigger || typeof trigger !== 'object') return null;
  const item = trigger as Record<string, unknown>;
  return {
    label: truncateText(item.label, 60),
    triggerType: item.triggerType ?? null,
    condition: truncateText(item.condition, 100),
    action: item.action ?? null,
    positionSize: truncateText(item.positionSize, 80),
    invalidation: truncateText(item.invalidation, 100),
    status: item.status ?? null,
  };
}

function compactTradeDecision(decision: Record<string, unknown> | null | undefined) {
  if (!decision || typeof decision !== 'object') return null;
  const entryTriggers = Array.isArray(decision.entryTriggers)
    ? decision.entryTriggers.map(compactDecisionTrigger).filter(Boolean).slice(0, 3)
    : [];
  const exitTriggers = Array.isArray(decision.exitTriggers)
    ? decision.exitTriggers.map(compactDecisionTrigger).filter(Boolean).slice(0, 3)
    : [];
  return {
    action: decision.action ?? null,
    positionSize: truncateText(decision.positionSize, 80),
    entryZone: truncateText(decision.entryZone, 120),
    addCondition: truncateText(decision.addCondition, 120),
    stopLoss: truncateText(decision.stopLoss, 100),
    takeProfit: truncateText(decision.takeProfit, 100),
    exitCondition: truncateText(decision.exitCondition, 120),
    marketGateReason: truncateText(decision.marketGateReason, 120),
    validUntil: truncateText(decision.validUntil, 80),
    confidence: decision.confidence ?? null,
    entryTriggers,
    exitTriggers,
  };
}

function compactMarketIndexSignal(signal: Record<string, unknown> | null | undefined) {
  if (!signal || typeof signal !== 'object') return null;
  return {
    status: signal.status ?? null,
    label: signal.label ?? null,
    summary: truncateText(signal.summary, 120),
    asOf: signal.asOf ?? null,
    trendScore: signal.trendScore ?? null,
    taiexState: signal.taiexState ?? null,
    otcState: signal.otcState ?? null,
    breadthState: signal.breadthState ?? null,
    foreignFlowState: signal.foreignFlowState ?? null,
    riskBudget: truncateText(signal.riskBudget, 100),
    entryBias: truncateText(signal.entryBias, 100),
    exitBias: truncateText(signal.exitBias, 100),
  };
}

function compactMarketValuationAdjustment(adjustment: Record<string, unknown> | null | undefined) {
  if (!adjustment || typeof adjustment !== 'object') return null;
  return {
    marketReratingStatus: adjustment.marketReratingStatus ?? null,
    marketReratingReason: truncateText(adjustment.marketReratingReason, 120),
    targetPeAdjustmentHint: truncateText(adjustment.targetPeAdjustmentHint, 120),
    repricingTriggerStrength: adjustment.repricingTriggerStrength ?? null,
    requiredEvidence: Array.isArray(adjustment.requiredEvidence)
      ? adjustment.requiredEvidence.slice(0, 3).map((item) => truncateText(item, 80))
      : [],
    summary: truncateText(adjustment.summary, 140),
    asOf: adjustment.asOf ?? null,
  };
}

function compactRevaluationJob(job: Record<string, unknown> | null | undefined) {
  if (!job || typeof job !== 'object') return null;
  return {
    status: job.status ?? null,
    queuedAt: job.queuedAt ?? null,
    lastAttemptAt: job.lastAttemptAt ?? null,
    nextAttemptAt: job.nextAttemptAt ?? null,
    slaStatus: job.slaStatus ?? null,
    missingEvidence: Array.isArray(job.missingEvidence) ? job.missingEvidence.slice(0, 3).map((item) => truncateText(item, 80)) : [],
    brokerEvidenceSearchStatus: job.brokerEvidenceSearchStatus ?? null,
    lastResult: truncateText(job.lastResult, 120),
  };
}

function compactLeadLagSignal(signal: Record<string, unknown> | null | undefined) {
  if (!signal || typeof signal !== 'object') return null;
  return {
    themeKey: signal.themeKey ?? null,
    themeName: signal.themeName ?? null,
    foreignMovePct: signal.foreignMovePct ?? null,
    twMovePct: signal.twMovePct ?? null,
    lagSpreadPct: signal.lagSpreadPct ?? null,
    sourceStatus: signal.sourceStatus ?? null,
    summary: truncateText(signal.summary, 120),
    asOf: signal.asOf ?? null,
  };
}

function compactConfidenceScoreBreakdown(value: Record<string, unknown> | null | undefined) {
  if (!value || typeof value !== 'object') return null;
  return {
    bridgeEvidence: value.bridgeEvidence ?? null,
    freshness: value.freshness ?? null,
    scenario: value.scenario ?? null,
    entryReadiness: value.entryReadiness ?? null,
    upsideQuality: value.upsideQuality ?? null,
    sectorRotationImpact: value.sectorRotationImpact ?? null,
  };
}

function compactHotMoverSignal(signal: Record<string, unknown> | null | undefined) {
  if (!signal || typeof signal !== 'object') return null;
  return {
    signalType: signal.signalType ?? null,
    changePct: signal.changePct ?? null,
    volume: signal.volume ?? null,
    volumeRatio: signal.volumeRatio ?? null,
    source: signal.source ?? null,
    asOf: signal.asOf ?? null,
    summary: truncateText(signal.summary, 120),
  };
}

function compactRecommendationCard(card: Record<string, unknown>) {
  const rawJob = card.revaluationJobSummary as Record<string, unknown> | null | undefined;
  const fallbackMissingEvidence = Array.isArray(rawJob?.missingEvidence)
    ? rawJob.missingEvidence
    : Array.isArray(rawJob?.requiredEvidence)
      ? rawJob.requiredEvidence
      : [];
  return {
    recommendationId: card.recommendationId,
    symbol: card.symbol,
    name: card.name,
    market: card.market,
    currentPrice: card.currentPrice ?? null,
    priceAsOf: card.priceAsOf ?? null,
    priceRefreshStatus: card.priceRefreshStatus ?? null,
    score: card.score,
    confidence: card.confidence,
    action: card.action,
    rationale: truncateText(card.rationale, 160),
    targetPrice: card.targetPrice ?? null,
    stopLoss: card.stopLoss ?? null,
    strategyState: card.strategyState ?? null,
    recommendationState: card.recommendationState ?? null,
    storyType: card.storyType ?? null,
    thesisTitle: truncateText(card.thesisTitle, 120),
    thesisSummary: truncateText(card.thesisSummary, 160),
    catalystSummary: truncateText(card.catalystSummary, 140),
    expectedUpsidePct: card.expectedUpsidePct ?? null,
    verificationStatus: card.verificationStatus ?? null,
    conditionalRecommendationNote: truncateText(card.conditionalRecommendationNote, 140),
    whyNotRecommended: truncateText(card.whyNotRecommended, 140),
    chineseName: card.chineseName ?? null,
    firstRecommendedAt: card.firstRecommendedAt ?? null,
    estimatedCatalystDate: card.estimatedCatalystDate ?? null,
    evidenceAgeHours: card.evidenceAgeHours ?? null,
    lastValidatedAt: card.lastValidatedAt ?? null,
    recommendationBucket: card.recommendationBucket ?? null,
    valuationQuality: card.valuationQuality ?? null,
    scenarioDriverType: card.scenarioDriverType ?? null,
    whyNotPromoted: truncateText(card.whyNotPromoted, 140),
    baseTarget: card.baseTarget ?? null,
    upsideTarget: card.upsideTarget ?? null,
    displayBaseUpsidePct: card.displayBaseUpsidePct ?? null,
    displayScenarioUpsidePct: card.displayScenarioUpsidePct ?? null,
    cardPrimaryUpsidePct: card.cardPrimaryUpsidePct ?? null,
    cardPrimaryUpsideLabel: card.cardPrimaryUpsideLabel ?? null,
    recommendationConfidenceScore: card.recommendationConfidenceScore ?? null,
    scenarioChecklistProgress: card.scenarioChecklistProgress ?? null,
    scenarioChecklistBreakdown: card.scenarioChecklistBreakdown ?? null,
    entryReadinessLabel: card.entryReadinessLabel ?? null,
    entryReadinessReasons: Array.isArray(card.entryReadinessReasons) ? card.entryReadinessReasons.slice(0, 2).map((item) => truncateText(item, 100)) : [],
    baseVerificationLabel: card.baseVerificationLabel ?? null,
    confidenceScoreBreakdown: compactConfidenceScoreBreakdown(card.confidenceScoreBreakdown as Record<string, unknown> | null | undefined),
    recommendationIndex: card.recommendationIndex ?? null,
    researchConfidenceScore: card.researchConfidenceScore ?? null,
    recommendationLifecycleStage: card.recommendationLifecycleStage ?? null,
    whyChanged: truncateText(card.whyChanged, 120),
    globalThemeLeadLagSignal: compactLeadLagSignal(card.globalThemeLeadLagSignal as Record<string, unknown> | null | undefined),
    globalLeadLagSummary: truncateText(card.globalLeadLagSummary, 120),
    scenarioOnlyDisplayAllowed: card.scenarioOnlyDisplayAllowed ?? null,
    targetStaleKind: card.targetStaleKind ?? null,
    repricingRequiredEvidence: Array.isArray(card.repricingRequiredEvidence) ? card.repricingRequiredEvidence.slice(0, 3).map((item) => truncateText(item, 80)) : [],
    candidateReason: truncateText(card.candidateReason, 120),
    candidateSourceType: card.candidateSourceType ?? null,
    hotMoverSignal: compactHotMoverSignal(card.hotMoverSignal as Record<string, unknown> | null | undefined),
    excludedReason: truncateText(card.excludedReason, 120),
    discoveryRunAt: card.discoveryRunAt ?? null,
    missedHotSymbolReason: truncateText(card.missedHotSymbolReason, 120),
    socialHitSummary: truncateText(card.socialHitSummary, 120),
    hotTrackingReason: truncateText(card.hotTrackingReason, 120),
    mlUpsideProbability: card.mlUpsideProbability ?? null,
    mlForecastSummary: truncateText(card.mlForecastSummary, 120),
    pttSignalSummary: truncateText(card.pttSignalSummary, 120),
    brokerSocialLeakSummary: truncateText(card.brokerSocialLeakSummary, 120),
    valuationSanityStatus: card.valuationSanityStatus ?? null,
    baseTargetVerificationStatus: card.baseTargetVerificationStatus ?? null,
    brokerConsensusSummary: truncateText(card.brokerConsensusSummary, 120),
    whyBaseIsFormal: truncateText(card.whyBaseIsFormal, 120),
    whyBaseIsNotFormal: truncateText(card.whyBaseIsNotFormal, 120),
    dedupeBucket: card.dedupeBucket ?? null,
    revaluationStatus: card.revaluationStatus ?? null,
    revaluationReason: truncateText(card.revaluationReason, 120),
    recommendationGateStatus: card.recommendationGateStatus ?? null,
    formalGateStatus: card.formalGateStatus ?? null,
    scenarioActionabilityStatus: card.scenarioActionabilityStatus ?? null,
    targetCoverageStatus: card.targetCoverageStatus ?? null,
    overTargetReason: truncateText(card.overTargetReason, 120),
    staleReason: card.staleReason ?? null,
    archiveReason: truncateText(card.archiveReason, 120),
    revaluationJobSummary: compactRevaluationJob(rawJob),
    revaluationSlaStatus: card.revaluationSlaStatus ?? null,
    nextRevaluationAt: card.nextRevaluationAt ?? null,
    missingRepricingEvidence: (Array.isArray(card.missingRepricingEvidence) && card.missingRepricingEvidence.length > 0
      ? card.missingRepricingEvidence
      : fallbackMissingEvidence
    ).slice(0, 3).map((item) => truncateText(item, 80)),
    brokerEvidenceSearchStatus: card.brokerEvidenceSearchStatus ?? null,
    nextEvidenceSearchPlan: Array.isArray(card.nextEvidenceSearchPlan) ? card.nextEvidenceSearchPlan.slice(0, 3).map((item) => truncateText(item, 80)) : [],
    scenarioPromotionStatus: card.scenarioPromotionStatus ?? null,
    entryActionLabel: card.entryActionLabel ?? null,
    entryDecision: compactEntryDecision(card.entryDecision as Record<string, unknown> | null | undefined),
    tradeDecision: compactTradeDecision(card.tradeDecision as Record<string, unknown> | null | undefined),
    marketGateStatus: card.marketGateStatus ?? null,
    marketIndexSignal: compactMarketIndexSignal(card.marketIndexSignal as Record<string, unknown> | null | undefined),
    marketValuationAdjustment: compactMarketValuationAdjustment(card.marketValuationAdjustment as Record<string, unknown> | null | undefined),
    whyBuyNow: truncateText(card.whyBuyNow, 120),
    whyExitNow: truncateText(card.whyExitNow, 120),
    isActionableRecommendation: card.isActionableRecommendation ?? null,
    displayBucket: card.displayBucket ?? null,
    displayTargetMode: card.displayTargetMode ?? null,
    whyNotFormal: truncateText(card.whyNotFormal, 120),
    whyNoFormalRecommendation: truncateText(card.whyNoFormalRecommendation, 120),
    whyNotVisible: truncateText(card.whyNotVisible, 120),
    revaluationPriority: card.revaluationPriority ?? null,
    sourceSignalBadges: Array.isArray(card.sourceSignalBadges) ? card.sourceSignalBadges.slice(0, 4) : [],
    sourceSignalSummary: truncateText(card.sourceSignalSummary, 120),
    socialMentionStats: card.socialMentionStats ?? null,
  };
}

function compactRadarPayload(data: Record<string, unknown>) {
  const compacted: Record<string, unknown> = { ...data };
  for (const bucket of CARD_BUCKETS) {
    const value = compacted[bucket];
    if (Array.isArray(value)) {
      compacted[bucket] = value.map((item) => compactRecommendationCard((item || {}) as Record<string, unknown>));
    }
  }
  return compacted;
}

async function withRadarStages(data: Record<string, unknown>) {
  const payload = data as unknown as RadarDailyPayload;
  if (hasCandidateStageCards(payload)) return data;
  if (!radarPublicSnapshotsEnabled()) return { ...data, stages: { found: [], waiting: [], actionable: [] } };
  return { ...data, stages: await getPersistedRadarStages() };
}

export async function GET(request: NextRequest) {
  try {
    const producerRead = request.headers.get('x-stockinsider-projection-source') === 'tracked-producer';
    if (producerRead && !requireExactInternalBearer(request)) {
      return NextResponse.json({ error: 'authentication_rejected' }, { status: 401, headers: NO_STORE });
    }
    if (!producerRead && radarPublicSnapshotsEnabled()) {
      const published = await loadLatestRadarPublicSnapshot('daily');
      if (published) {
        const ageMs = Date.now() - Date.parse(published.contentAsOf);
        const remainingFreshMs = 26 * 60 * 60 * 1000 - ageMs;
        const cacheControl = published.stale || remainingFreshMs <= 10 * 60 * 1000
          ? 'no-store, max-age=0'
          : 'public, max-age=60, stale-while-revalidate=300';
        const headers = {
          'cache-control': cacheControl,
          etag: published.etag,
          'x-stockinsider-snapshot-published-at': published.publishedAt,
          'x-stockinsider-snapshot-stale': String(published.stale),
        };
        if (request.headers.get('if-none-match') === published.etag) return new NextResponse(null, { status: 304, headers });
        return NextResponse.json(published.payload, { headers });
      }
    }
    const compact = producerRead ? null : await loadPublishedRadarProjection('daily');
    if (compact) {
      return NextResponse.json(await withRadarStages(compact as unknown as Record<string, unknown>), { headers: NO_STORE });
    }
    const data = await getDailyRadarData();
    const legacy = compactRadarPayload(data as unknown as Record<string, unknown>);
    const response = producerRead ? compactProducerRadarPayload(legacy) : legacy;
    return NextResponse.json(await withRadarStages(response as Record<string, unknown>), { headers: NO_STORE });
  } catch (error) {
    if (legacyCorrectnessProjectionEnabled() && error instanceof RadarProjectionUnavailableError) {
      return NextResponse.json({ error: 'radar_projection_unavailable', retryable: true }, { status: 503, headers: NO_STORE });
    }
    return NextResponse.json({ error: (error as Error).message }, { status: 500, headers: NO_STORE });
  }
}
