import type { CandidateStageCard, RadarDailyPayload } from './types';

export type CandidateStageKey = 'found' | 'waiting' | 'actionable';

export type CandidateStagePage = {
  schemaVersion: 'radar-stage-page-v1';
  snapshotPublishedAt: string | null;
  snapshotStale: boolean;
  stage: CandidateStageKey;
  offset: number;
  limit: number;
  total: number;
  nextOffset: number | null;
  items: CandidateStageCard[];
};

export function isCandidateStageKey(value: string | null): value is CandidateStageKey {
  return value === 'found' || value === 'waiting' || value === 'actionable';
}

export function candidateStageCounts(payload: RadarDailyPayload) {
  return payload.stageCounts ?? {
    found: payload.stages?.found.length ?? 0,
    waiting: payload.stages?.waiting.length ?? 0,
    actionable: payload.stages?.actionable.length ?? 0,
  };
}

export function compactCandidateStageForSnapshot(card: CandidateStageCard): CandidateStageCard {
  const foundOnly = card.lifecycleStage === 'found';
  const valuation = Object.fromEntries(Object.entries(card.valuation).filter(([key, value]) => key === 'status' || value != null)) as CandidateStageCard['valuation'];
  const technical = Object.fromEntries(Object.entries(card.technical).filter(([key, value]) => {
    if (value == null && !['sessionDate', 'marketRegime', 'hardGatePassed'].includes(key)) return false;
    return !foundOnly || ['sessionDate', 'close', 'ma20', 'ma60', 'marketRegime', 'hardGatePassed'].includes(key);
  })) as CandidateStageCard['technical'];
  return {
    symbol: card.symbol,
    chineseName: card.chineseName,
    lifecycleStage: card.lifecycleStage,
    latestMentionAt: card.latestMentionAt,
    rawMentionCount: card.rawMentionCount,
    effectiveMentionCount: card.effectiveMentionCount,
    publisherCount: card.publisherCount,
    positivePublisherCount: card.positivePublisherCount,
    negativePublisherCount: card.negativePublisherCount,
    generalPublisherCount: card.generalPublisherCount,
    platformCount: card.platformCount,
    dominantPlatformShare: card.dominantPlatformShare,
    sources: (card.sources || []).slice(0, foundOnly ? 2 : 5).map((source) => ({
      platform: source.platform,
      ...(source.sourceName ? { sourceName: source.sourceName } : {}),
      ...(source.publisherName ? { publisherName: source.publisherName } : {}),
      ...(source.author ? { author: source.author } : {}),
      sourceUrl: source.sourceUrl,
      ...(source.stance ? { stance: source.stance } : {}),
    })),
    scores: card.scores,
    valuation,
    technical,
    ...(!foundOnly ? { consecutiveCloses: { passed: card.consecutiveCloses.passed, required: 2 } } : {}),
    unmetConditions: (card.unmetConditions || []).slice(0, foundOnly ? 4 : 8),
    ...(card.promotionReasons?.length ? { promotionReasons: card.promotionReasons.slice(0, 5) } : {}),
    ...(card.dataAsOf ? { dataAsOf: card.dataAsOf } : {}),
    ...(!foundOnly && card.riskAction ? { riskAction: card.riskAction } : {}),
  } as CandidateStageCard;
}

export function buildCanonicalStagePlane(stages: NonNullable<RadarDailyPayload['stages']>) {
  return {
    stageCounts: {
      found: stages.found.length,
      waiting: stages.waiting.length,
      actionable: stages.actionable.length,
    },
    stages: {
      found: stages.found.map(compactCandidateStageForSnapshot),
      waiting: stages.waiting.map(compactCandidateStageForSnapshot),
      actionable: stages.actionable.map(compactCandidateStageForSnapshot),
    },
  };
}

export function paginateCandidateStage(
  payload: RadarDailyPayload,
  stage: CandidateStageKey,
  requestedOffset: number,
  requestedLimit: number,
  compact: (card: CandidateStageCard) => CandidateStageCard = (card) => card,
): CandidateStagePage {
  const offset = Math.max(0, Math.floor(Number.isFinite(requestedOffset) ? requestedOffset : 0));
  const limit = Math.min(40, Math.max(1, Math.floor(Number.isFinite(requestedLimit) ? requestedLimit : 40)));
  const source = payload.stages?.[stage] ?? [];
  const total = candidateStageCounts(payload)[stage];
  const items = source.slice(offset, offset + limit).map(compact);
  const consumed = offset + items.length;
  return {
    schemaVersion: 'radar-stage-page-v1',
    snapshotPublishedAt: payload.snapshotPublishedAt ?? null,
    snapshotStale: payload.snapshotStale === true,
    stage,
    offset,
    limit,
    total,
    nextOffset: consumed < total && items.length > 0 ? consumed : null,
    items,
  };
}
