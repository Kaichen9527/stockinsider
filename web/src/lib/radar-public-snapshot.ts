import { createHash } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';
import { STAGE_RULESET_VERSION } from './stage-classifier';
import { CANDIDATE_RESEARCH_MODEL_VERSION, loadCandidateShadowProgress } from './candidate-research';
import type { CandidateShadowProgress, CandidateStageCard, RadarDailyPayload } from './types';

type Row = Record<string, unknown>;
export type PublicRadarWindow = 'home' | 'daily' | 'hot' | 'weekly';
export const RADAR_PUBLIC_SCHEMA_VERSION = 'radar-public-v2' as const;

const memory = new Map<PublicRadarWindow, { expiresAt: number; value: PublishedRadarSnapshot | null }>();

export type PublishedRadarSnapshot = {
  id: string;
  etag: string;
  publishedAt: string;
  contentAsOf: string;
  stale: boolean;
  payload: RadarDailyPayload;
};

export function radarPublicSnapshotsEnabled() {
  return process.env.RADAR_PUBLIC_SNAPSHOTS_ENABLED !== 'disabled';
}

function compactText(value: unknown, max = 160) {
  if (typeof value !== 'string') return value ?? null;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function compactLegacyCard(value: unknown) {
  const card = (value && typeof value === 'object' ? value : {}) as Row;
  return {
    recommendationId: card.recommendationId,
    symbol: card.symbol,
    name: card.name,
    chineseName: card.chineseName ?? null,
    market: card.market,
    currentPrice: card.currentPrice ?? null,
    priceAsOf: card.priceAsOf ?? null,
    priceRefreshStatus: card.priceRefreshStatus ?? null,
    score: card.score,
    confidence: card.confidence,
    action: card.action,
    rationale: compactText(card.rationale),
    targetPrice: card.targetPrice ?? null,
    stopLoss: card.stopLoss ?? null,
    expectedUpsidePct: card.expectedUpsidePct ?? null,
    baseTarget: card.baseTarget ?? null,
    upsideTarget: card.upsideTarget ?? null,
    recommendationState: card.recommendationState ?? null,
    recommendationBucket: card.recommendationBucket ?? null,
    verificationStatus: card.verificationStatus ?? null,
    thesisTitle: compactText(card.thesisTitle, 100),
    thesisSummary: compactText(card.thesisSummary),
    catalystSummary: compactText(card.catalystSummary, 120),
    whyNotRecommended: compactText(card.whyNotRecommended, 120),
    whyNotPromoted: compactText(card.whyNotPromoted, 120),
    entryReadinessLabel: card.entryReadinessLabel ?? null,
    entryReadinessReasons: Array.isArray(card.entryReadinessReasons) ? card.entryReadinessReasons.slice(0, 3).map((item) => compactText(item, 100)) : [],
    recommendationIndex: card.recommendationIndex ?? null,
    researchConfidenceScore: card.researchConfidenceScore ?? null,
    displayBucket: card.displayBucket ?? null,
    candidateReason: compactText(card.candidateReason, 120),
    candidateSourceType: card.candidateSourceType ?? null,
    socialHitSummary: compactText(card.socialHitSummary, 120),
    sourceSignalBadges: Array.isArray(card.sourceSignalBadges) ? card.sourceSignalBadges.slice(0, 4) : [],
    sourceSignalSummary: compactText(card.sourceSignalSummary, 120),
    socialMentionStats: card.socialMentionStats ?? null,
    projectionReadOnly: card.projectionReadOnly === true ? true : undefined,
    researchDecision: card.researchDecision ?? null,
  };
}

function compactSourceHealth(value: RadarDailyPayload['sourceHealthSummary']) {
  if (!value) return undefined;
  return {
    ...value,
    connectorDetails: value.connectorDetails.map((item) => ({
      connector: item.connector, label: item.label, status: item.status, recordsWritten: item.recordsWritten,
      recordsWritten24h: item.recordsWritten24h, recordsWrittenThisRun: item.recordsWrittenThisRun,
      lastSuccessAt: item.lastSuccessAt, lastAttemptAt: item.lastAttemptAt, lastTerminalStatus: item.lastTerminalStatus,
      normalizedFailureCode: item.normalizedFailureCode, displayFailureReason: compactText(item.displayFailureReason, 140) as string | null,
      workerFreshnessStatus: item.workerFreshnessStatus, refreshCadenceHours: item.refreshCadenceHours,
      failureReason: compactText(item.failureReason, 140) as string | null, degradedReason: compactText(item.degradedReason, 140) as string | null,
      searched: item.searched, matched: item.matched, matchedSymbols: item.matchedSymbols?.slice(0, 12),
      articlesFetched: item.articlesFetched, pushCommentsParsed: item.pushCommentsParsed,
      channelBreakdown: item.channelBreakdown?.slice(0, 7).map((channel) => ({ ...channel, matchedSymbols: channel.matchedSymbols.slice(0, 12), excludedExamples: undefined })),
    })),
  };
}

function compactCandidateStageCard(card: CandidateStageCard): CandidateStageCard {
  const valuation = Object.fromEntries(Object.entries(card.valuation).filter(([key, value]) => key === 'status' || value != null)) as CandidateStageCard['valuation'];
  const technical = Object.fromEntries(Object.entries(card.technical).filter(([key, value]) => ['sessionDate', 'marketRegime', 'hardGatePassed'].includes(key) || value != null)) as CandidateStageCard['technical'];
  const compact = {
    symbol: card.symbol,
    chineseName: card.chineseName,
    lifecycleStage: card.lifecycleStage,
    latestMentionAt: card.latestMentionAt,
    rawMentionCount: card.rawMentionCount,
    effectiveMentionCount: card.effectiveMentionCount,
    publisherCount: card.publisherCount,
    platformCount: card.platformCount,
    dominantPlatformShare: card.dominantPlatformShare,
    // `latestMentionAt` already carries the ordering timestamp used by the
    // public card. Per-link timestamps remain in the detail revision, avoiding
    // the same ISO string being repeated hundreds of times in the Radar JSON.
    sources: card.sources.slice(0, 5).map((source) => ({
      platform: source.platform,
      ...(source.author ? { author: source.author } : {}),
      sourceUrl: source.sourceUrl,
      ...(source.stance ? { stance: source.stance } : {}),
    })),
    scores: card.scores,
    valuation,
    technical,
    consecutiveCloses: { passed: card.consecutiveCloses.passed, required: 2 },
    unmetConditions: card.unmetConditions.slice(0, 8),
    ...(card.promotionReasons.length ? { promotionReasons: card.promotionReasons.slice(0, 5) } : {}),
    ...(card.dataAsOf ? { dataAsOf: card.dataAsOf } : {}),
    ...(card.detailRevisionId ? { detailRevisionId: card.detailRevisionId } : {}),
    ...(card.riskAction ? { riskAction: card.riskAction } : {}),
  };
  return compact as CandidateStageCard;
}

function compactTheme(theme: RadarDailyPayload['hotThemes'][number]): RadarDailyPayload['hotThemes'][number] {
  return {
    themeKey: theme.themeKey,
    themeName: theme.themeName,
    windowType: theme.windowType,
    marketRegime: theme.marketRegime,
    heatScore: theme.heatScore,
    capitalFlowSignals: {},
    relatedSymbols: theme.relatedSymbols.slice(0, 12),
    evidenceCount: theme.evidenceCount,
    asOfDate: theme.asOfDate,
    verificationStatus: theme.verificationStatus,
    sourceCoverage: theme.sourceCoverage.slice(0, 4).map((source) => ({
      sourceName: source.sourceName,
      sourceType: source.sourceType,
      summary: String(compactText(source.summary, 120) || ''),
      sourceUrl: source.sourceUrl,
      sourceTimestamp: source.sourceTimestamp,
      symbols: source.symbols.slice(0, 8),
      verificationStatus: source.verificationStatus,
      confidence: source.confidence,
      weight: source.weight,
    })),
    missingSources: theme.missingSources.slice(0, 5),
    latestSourceAt: theme.latestSourceAt,
    foreignPeerBasket: [],
    leadLagSpreadPct: theme.leadLagSpreadPct ?? null,
    overseasMomentumAsOf: theme.overseasMomentumAsOf ?? null,
  };
}

export function buildCompactPublicRadarPayload(
  payload: RadarDailyPayload,
  stages: { found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] },
  shadowProgress: CandidateShadowProgress,
): RadarDailyPayload {
  const compactBucket = (items: unknown[] | undefined, limit: number) => (items || []).slice(0, limit).map(compactLegacyCard);
  const compactStages = {
    found: stages.found.map(compactCandidateStageCard),
    waiting: stages.waiting.map(compactCandidateStageCard),
    actionable: stages.actionable.map(compactCandidateStageCard),
  };
  const hasCandidateStages = compactStages.found.length + compactStages.waiting.length + compactStages.actionable.length > 0;
  return {
    ...payload,
    schemaVersion: RADAR_PUBLIC_SCHEMA_VERSION,
    shadowProgress,
    stages: compactStages,
    // Candidate stages are the canonical stock plane. Keeping the same stocks
    // in every legacy bucket doubled the public response and the server-rendered
    // homepage. The compatibility keys remain for one release, but are empty
    // once a canonical stage snapshot exists.
    opportunities: (hasCandidateStages ? [] : compactBucket(payload.opportunities, 8)) as RadarDailyPayload['opportunities'],
    scenarioUpsideCandidates: (hasCandidateStages ? [] : compactBucket(payload.scenarioUpsideCandidates, 8)) as RadarDailyPayload['scenarioUpsideCandidates'],
    earlyWatchlist: (hasCandidateStages ? [] : compactBucket(payload.earlyWatchlist, 8)) as RadarDailyPayload['earlyWatchlist'],
    recentFormal7d: (hasCandidateStages ? [] : compactBucket(payload.recentFormal7d, 6)) as RadarDailyPayload['recentFormal7d'],
    fallbackOpportunities90d: (hasCandidateStages ? [] : compactBucket(payload.fallbackOpportunities90d, 6)) as RadarDailyPayload['fallbackOpportunities90d'],
    hotTracking: (hasCandidateStages ? [] : compactBucket(payload.hotTracking, 6)) as RadarDailyPayload['hotTracking'],
    discoveredStocks: hasCandidateStages ? [] : (payload.discoveredStocks || []).slice(0, 20).map((item) => ({ ...item, sources: item.sources.slice(0, 5), sourceCoverage: item.sourceCoverage.slice(0, 5) })),
    // Five themes are enough for the public discovery view. The complete
    // research remains available on theme/detail routes, while the daily API
    // stays comfortably below its 150 KB transport budget.
    hotThemes: payload.hotThemes.slice(0, 5).map(compactTheme),
    sourceSignals: (payload.sourceSignals || []).slice(0, 12),
    sourceHealthSummary: compactSourceHealth(payload.sourceHealthSummary),
    connectorStatus: (payload.connectorStatus || []).slice(0, 20).map((item) => ({
      connector: item.connector,
      credentialStatus: item.credentialStatus,
      lastCheckedAt: item.lastCheckedAt,
      lastRunStatus: item.lastRunStatus,
      lastRunAt: item.lastRunAt,
      lastSuccessAt: item.lastSuccessAt,
      lastRecordsWritten: item.lastRecordsWritten,
      lastErrorSummary: compactText(item.lastErrorSummary, 120) as string | null,
      recordsWritten24h: item.recordsWritten24h,
      failureReason: compactText(item.failureReason, 120) as string | null,
    })),
    reports: (payload.reports || []).slice(0, 12).map((report) => ({
      ...report,
      summary: compactText(report.summary, 180) as string,
      memoMarkdown: '',
      catalystCalendar: [],
      entryExitRules: {},
      relatedSymbols: report.relatedSymbols.slice(0, 8),
    })),
    themeHypotheses: (payload.themeHypotheses || []).slice(0, 4).map((item) => ({
      ...item,
      summary: String(compactText(item.summary, 180) || ''),
      assumptions: item.assumptions.slice(0, 2).map((value) => String(compactText(value, 100) || '')),
      symbols: item.symbols.slice(0, 6),
      sourceUrls: item.sourceUrls.slice(0, 2),
    })),
  };
}

export async function publishRadarPublicSnapshots(input: {
  payload: RadarDailyPayload;
  stages: { found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] };
  pipelineRunId?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const shadowProgress = await loadCandidateShadowProgress().catch(() => ({ observed: 0, qualifying: 0, required: 30 as const, remaining: 30, startedOn: null, latestSession: null, blockers: ['shadow_progress_unavailable'] }));
  const compact = buildCompactPublicRadarPayload(input.payload, input.stages, shadowProgress);
  const publishedAt = new Date().toISOString();
  const researchContentAsOf = [...input.stages.found, ...input.stages.waiting, ...input.stages.actionable]
    .map((card) => card.dataAsOf)
    .filter((value): value is string => typeof value === 'string' && Number.isFinite(Date.parse(value)))
    .sort()
    .at(-1) || compact.asOf;
  const prepared: Array<{ window: 'home' | 'daily'; payload: RadarDailyPayload; hash: string; etag: string; bytes: number }> = [];
  for (const window of ['home', 'daily'] as const) {
    const payload = { ...compact, snapshotPublishedAt: publishedAt, snapshotStale: false, sourceLedCorrectness: compact.sourceLedCorrectness ? { ...compact.sourceLedCorrectness, window } : compact.sourceLedCorrectness };
    const encoded = JSON.stringify(payload);
    const hash = createHash('sha256').update(encoded).digest('hex');
    const etag = `"${hash}"`;
    prepared.push({ window, payload, hash, etag, bytes: Buffer.byteLength(encoded) });
  }
  const home = prepared[0];
  const daily = prepared[1];
  const write = await supabase.rpc('publish_radar_public_snapshots', {
    p_home_payload: home.payload,
    p_home_hash: home.hash,
    p_home_etag: home.etag,
    p_daily_payload: daily.payload,
    p_daily_hash: daily.hash,
    p_daily_etag: daily.etag,
    p_schema_version: RADAR_PUBLIC_SCHEMA_VERSION,
    p_content_as_of: researchContentAsOf,
    p_pipeline_run_id: input.pipelineRunId || null,
    p_ruleset_version: STAGE_RULESET_VERSION,
    p_model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
    p_published_at: publishedAt,
  });
  if (write.error || !write.data) {
    const reason = write.error?.message || 'radar_publication_failed';
    try {
      await supabase.rpc('mark_radar_publication_failed', { p_terminal_reason: reason, p_attempted_at: publishedAt });
    } catch {
      // Preserve the original publication error when the best-effort failure marker also fails.
    }
    throw new Error(reason);
  }
  const ids = write.data as Row;
  const results = prepared.map((item) => ({
    id: String(item.window === 'home' ? ids.homeId : ids.dailyId),
    window: item.window,
    etag: item.etag,
    payloadHash: item.hash,
    bytes: item.bytes,
  }));
  memory.delete('home');
  memory.delete('daily');
  return { publishedAt, results, homePublicationId: String(ids.homeId), homePayloadHash: home.hash };
}

export async function markRadarPublicSnapshotsFailed(reason: string, attemptedAt = new Date().toISOString()) {
  const result = await getSupabaseServerClient().rpc('mark_radar_publication_failed', {
    p_terminal_reason: reason.slice(0, 500),
    p_attempted_at: attemptedAt,
  });
  if (result.error) throw new Error(`radar_publication_failure_marker_failed:${result.error.message}`);
  memory.delete('home');
  memory.delete('daily');
}

export async function loadLatestRadarPublicSnapshot(window: PublicRadarWindow): Promise<PublishedRadarSnapshot | null> {
  if (!radarPublicSnapshotsEnabled()) return null;
  const cached = memory.get(window);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  let supabase: ReturnType<typeof getSupabaseServerClient>;
  try {
    supabase = getSupabaseServerClient();
  } catch (error) {
    // Local demo/E2E builds intentionally run without production credentials.
    // A missing snapshot client means "no published snapshot is available" and
    // must preserve the existing read-only fallback instead of turning every
    // public route into a 500. Production read/query failures still fail closed
    // below and never silently authorize an actionable card.
    if ((error as Error).message === 'Missing SUPABASE URL/key for server client') return null;
    throw error;
  }
  const [read, stateRead] = await Promise.all([
    supabase.from('radar_public_snapshots').select('id,etag,content_as_of,published_at,payload_json').eq('window_key', window).eq('status', 'valid').order('published_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('radar_publication_state').select('status,last_attempt_at,terminal_reason').eq('window_key', window).maybeSingle(),
  ]);
  if (read.error || stateRead.error) {
    const message = read.error?.message || stateRead.error?.message || 'radar_snapshot_read_failed';
    if (/relation .* does not exist|schema cache/iu.test(message)) return null;
    if (cached?.value) {
      const base = cached.value;
      const payload = failClosedStalePayload(base.payload, String(message));
      return { ...base, stale: true, etag: etagForPayload(payload), payload };
    }
    throw new Error(message);
  }
  if (!read.data) {
    memory.set(window, { expiresAt: Date.now() + 10_000, value: null });
    return null;
  }
  const row = read.data as Row;
  const publishedAt = String(row.published_at || '');
  const contentAsOf = String(row.content_as_of || '');
  const state = (stateRead.data || {}) as Row;
  const failedAfterSnapshot = state.status === 'failed' && Date.parse(String(state.last_attempt_at || '')) > Date.parse(publishedAt);
  const stale = failedAfterSnapshot || !contentAsOf || Date.now() - Date.parse(contentAsOf) > 26 * 60 * 60 * 1000;
  const base = row.payload_json as RadarDailyPayload;
  let payload: RadarDailyPayload = {
    ...base,
    snapshotPublishedAt: publishedAt || null,
    snapshotStale: stale,
    projectionHealth: stale
      ? { status: 'stale_readonly', integrityStatus: 'valid', freshnessStatus: 'stale_readonly', researchVisibility: 'last_good_readonly', actionAuthority: 'disabled', acquisitionAuthority: 'disabled', actionBlockers: ['public_snapshot_stale'], reason: 'public_snapshot_stale', missedExpectedRuns: 1, contentAsOf: String(row.content_as_of || null), evaluatedAt: publishedAt || null, publishedAt: publishedAt || null, nextExpectedAt: null, calendarAuthority: 'tw_trading_sessions_v3', actionsEnabled: false }
      : base.projectionHealth,
  };
  if (stale) payload = failClosedStalePayload(payload, failedAfterSnapshot ? String(state.terminal_reason || 'latest_publication_failed') : 'public_snapshot_stale');
  const value = { id: String(row.id), etag: stale ? etagForPayload(payload) : String(row.etag || ''), publishedAt, contentAsOf, stale, payload };
  memory.set(window, { expiresAt: Date.now() + 60_000, value });
  return value;
}

function etagForPayload(payload: RadarDailyPayload) {
  return `"${createHash('sha256').update(JSON.stringify(payload)).digest('hex')}"`;
}

function failClosedStalePayload(payload: RadarDailyPayload, reason: string): RadarDailyPayload {
  const actionable = payload.stages?.actionable || [];
  const downgrade = (card: CandidateStageCard): CandidateStageCard => ({
    ...card,
    lifecycleStage: card.lifecycleStage === 'actionable' ? 'waiting' : card.lifecycleStage,
    stale: true,
    unmetConditions: [...new Set([...card.unmetConditions, 'stale_or_fallback_data'])],
  });
  const found = payload.stages?.found.map(downgrade) || [];
  const waitingMap = new Map<string, CandidateStageCard>();
  for (const card of [...(payload.stages?.waiting || []), ...actionable].map(downgrade)) waitingMap.set(card.symbol, card);
  return {
    ...payload,
    snapshotStale: true,
    stages: payload.stages ? { found, waiting: [...waitingMap.values()], actionable: [] } : payload.stages,
    projectionHealth: {
      status: 'stale_readonly', integrityStatus: 'valid', freshnessStatus: 'stale_readonly', researchVisibility: 'last_good_readonly',
      actionAuthority: 'disabled', acquisitionAuthority: 'disabled', actionBlockers: [reason], reason,
      missedExpectedRuns: 1, contentAsOf: payload.asOf, evaluatedAt: new Date().toISOString(), publishedAt: payload.snapshotPublishedAt || null,
      nextExpectedAt: null, calendarAuthority: 'tw_trading_sessions_v3', actionsEnabled: false,
    },
  };
}
