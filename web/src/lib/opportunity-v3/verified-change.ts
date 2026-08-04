import type {
  ActionDecisionV3,
  FormalResearchStatusV3,
  InternalOpportunityCardV3,
  OpportunityCardV3,
  OpportunityHomepageSummaryV3,
  PriorComparableV3,
  SourceClassV3,
  VerifiedChangeBriefV3,
  VerifiedChangeItemV3,
  VerifiedChangeKindV3,
  VerifiedChangeLaneKeyV3,
  VerifiedChangeWorkspaceV3,
  VerifiedEvidenceRowV3,
} from './contracts.ts';
import { createHash } from 'node:crypto';
import { type7Quantile } from './scoring.ts';
import { canonicalJson } from './canonical.ts';

const LANE_ORDER: VerifiedChangeLaneKeyV3[] = [
  'new_verified_change',
  'strengthened_thesis',
  'contradiction_or_review',
];

const FORMAL_ORDER: FormalResearchStatusV3[] = [
  'not_evaluated',
  'insufficient_evidence',
  'valuation_review',
  'formal_watch',
  'formal_candidate',
];

const FORMAL_LABEL: Record<FormalResearchStatusV3, string> = {
  not_evaluated: '未評估',
  insufficient_evidence: '證據不足',
  valuation_review: '估值待覆核',
  formal_watch: '正式觀察',
  formal_candidate: '正式候選',
};

const HORIZON_LABEL = {
  momentum_5_20d: '5–20 個交易日',
  swing_20_60d: '20–60 個交易日',
} as const;

const COPY: Record<VerifiedChangeKindV3, { headline: string; whatChanged: string }> = {
  official_event: { headline: '已確認官方事件', whatChanged: '官方或公司事件已由不可變來源確認。' },
  fundamental_update: { headline: '基本面證據更新', whatChanged: '基本面因子相較前次可比快照出現變化。' },
  valuation_update: { headline: '估值證據更新', whatChanged: '估值因子或狀態相較前次可比快照出現變化。' },
  source_corroboration: { headline: '取得獨立來源佐證', whatChanged: '新增或保留的獨立來源強化目前研究依據。' },
  contradiction: { headline: '存在待覆核矛盾', whatChanged: '證據存在衝突、確認缺口、過期或估值異常。' },
};

const SIZING_KEYS = new Set([
  'existingTargetExposurePct',
  'initialPositionPct',
  'maximumPositionPct',
]);

export interface VerifiedChangeCandidateInputV3 {
  runId: string;
  sourceRunId: string;
  stockId: string;
  candidateOrigin: 'direct_candidate';
  anchorClaimId: string;
  deepStatus: 'succeeded';
  card: OpportunityCardV3;
  anchorSourceClass: SourceClassV3;
  anchorEffectiveAt: string;
  sourceCutoff: string;
  evidenceRows: VerifiedEvidenceRowV3[];
  priorComparable: PriorComparableV3 | null;
}

export function toPublicActionDecision(decision: ActionDecisionV3): OpportunityCardV3['actionDecision'] {
  const publicDecision = Object.fromEntries(
    Object.entries(decision).filter(([key]) => !SIZING_KEYS.has(key)),
  ) as OpportunityCardV3['actionDecision'];
  assertNoPublicSizing(publicDecision);
  return publicDecision;
}

export function toPublicCard(card: InternalOpportunityCardV3): OpportunityCardV3 {
  const publicCard: OpportunityCardV3 = {
    ...card,
    actionDecision: toPublicActionDecision(card.actionDecision),
  };
  assertNoPublicSizing(publicCard);
  return publicCard;
}

export function assertNoPublicSizing(value: unknown): void {
  if (Array.isArray(value)) {
    for (const item of value) assertNoPublicSizing(item);
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (SIZING_KEYS.has(key)) throw new TypeError(`public sizing key forbidden: ${key}`);
    assertNoPublicSizing(child);
  }
}

export function deriveVerifiedChangeBrief(input: VerifiedChangeCandidateInputV3): VerifiedChangeBriefV3 {
  const expectedDetailPath = `/opportunity-v3/${input.runId}/${input.card.symbol}`;
  if (input.card.detailPath !== expectedDetailPath) throw new TypeError('verified change detail path mismatch');
  if (
    !input.card.directSource ||
    input.candidateOrigin !== 'direct_candidate' ||
    !input.anchorClaimId ||
    input.deepStatus !== 'succeeded'
  ) throw new TypeError('verified change requires a direct deep-success candidate');
  const rows = selectEvidenceRows(input.evidenceRows);
  if (rows.some(
    (row) =>
      row.runId !== input.sourceRunId ||
      row.stockId !== input.stockId ||
      row.symbol !== input.card.symbol ||
      !['linked_new', 'linked_refresh', 'linked_duplicate_claim'].includes(row.mentionOutcome),
  )) throw new TypeError('verified change evidence provenance mismatch');
  if (!rows.length) throw new TypeError('verified change requires evidence');
  const classes = new Set(rows.map((row) => row.sourceClass));
  if (classes.size < 1 || classes.size > 4) throw new TypeError('invalid independent source-class count');
  const independentSourceClassCount = classes.size as 1 | 2 | 3 | 4;
  const contradictions: VerifiedChangeBriefV3['contradictions'] = [];
  const supportingRoots = new Set(rows.filter((row) => row.stance === 'supports').map((row) => row.evidenceRootId));
  const firstConflicting = rows.find((row) => row.stance === 'contradicts' && [...supportingRoots].some((root) => root !== row.evidenceRootId));
  if (firstConflicting) contradictions.push({ code: 'conflicting_source', evidenceRef: firstConflicting.evidenceRef });
  const firstOfficial = rows.find(
    (row) => (row.sourceClass === 'official' || row.sourceClass === 'public_research') && row.verificationTier === 'publisher_verified',
  );
  if ((input.anchorSourceClass === 'curated_thesis' || input.anchorSourceClass === 'community') && !firstOfficial) {
    contradictions.push({ code: 'missing_official_confirmation', evidenceRef: rows[0].evidenceRef });
  }
  const firstStale = rows.find((row) => row.freshness === 'stale');
  if (firstStale) contradictions.push({ code: 'stale_evidence', evidenceRef: firstStale.evidenceRef });
  if (input.card.valuation.status === 'outlier_review') {
    contradictions.push({ code: 'valuation_outlier', evidenceRef: input.card.valuation.evidenceRefs?.[0] ?? null });
  }
  const changeKind = resolveChangeKind(input, contradictions.length > 0);
  const copy = COPY[changeKind];
  const headline = normalizeBounded(`${input.card.symbol} ${copy.headline}`, 96);
  const whatChanged = normalizeBounded(copy.whatChanged, 280);
  const whyItMatters = normalizeBounded(
    `研究狀態：${FORMAL_LABEL[input.card.formalResearchStatus]}；主要觀察週期：${HORIZON_LABEL[input.card.primaryHorizon]}。`,
    280,
  );
  const verifiedAt = rows.reduce((latest, row) => {
    const timestamp = Date.parse(row.effectiveAt);
    if (!Number.isFinite(timestamp)) throw new TypeError('invalid evidence effective time');
    return timestamp > Date.parse(latest) ? row.effectiveAt : latest;
  }, rows[0].effectiveAt);
  const evidenceRefs: string[] = [];
  const seenRefs = new Set<string>();
  for (const row of rows) {
    if (!seenRefs.has(row.evidenceRef)) {
      seenRefs.add(row.evidenceRef);
      evidenceRefs.push(row.evidenceRef);
      if (evidenceRefs.length === 3) break;
    }
  }
  if (!evidenceRefs.length) throw new TypeError('verified change requires unique evidence refs');
  const brief: VerifiedChangeBriefV3 = {
    briefVersion: 'verified-change-brief-v3.0',
    changeKind,
    headline,
    whatChanged,
    whyItMatters,
    verifiedAt,
    sourceCutoff: input.sourceCutoff,
    evidenceRefs,
    independentSourceClassCount,
    contradictions,
    formalResearchStatus: input.card.formalResearchStatus,
    primaryHorizon: input.card.primaryHorizon,
    scoreDelta: input.card.scoreDelta,
    detailPath: input.card.detailPath,
    disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE',
  };
  assertNoPublicSizing(brief);
  return brief;
}

export function resolveVerifiedChangeLane(
  input: VerifiedChangeCandidateInputV3,
  brief: VerifiedChangeBriefV3,
): VerifiedChangeLaneKeyV3 | null {
  if (
    brief.contradictions.length > 0 ||
    brief.formalResearchStatus === 'insufficient_evidence' ||
    brief.formalResearchStatus === 'valuation_review' ||
    input.card.actionDecision.newPositionAction === 'valuation_review'
  ) return 'contradiction_or_review';
  if (
    (input.anchorSourceClass === 'official' || input.anchorSourceClass === 'public_research') &&
    (!input.priorComparable || Date.parse(input.anchorEffectiveAt) > Date.parse(input.priorComparable.sourceCutoff))
  ) return 'new_verified_change';
  const prior = input.priorComparable;
  if (
    (input.card.scoreDelta != null && input.card.scoreDelta >= 5) ||
    (prior && FORMAL_ORDER.indexOf(input.card.formalResearchStatus) > FORMAL_ORDER.indexOf(prior.formalResearchStatus)) ||
    (prior && brief.independentSourceClassCount > prior.independentSourceClassCount)
  ) return 'strengthened_thesis';
  return null;
}

export function buildVerifiedChangeWorkspace(
  candidates: VerifiedChangeCandidateInputV3[],
): VerifiedChangeWorkspaceV3 {
  const seen = new Set<string>();
  const laneItems = new Map<VerifiedChangeLaneKeyV3, VerifiedChangeItemV3[]>(
    LANE_ORDER.map((lane) => [lane, []]),
  );
  for (const candidate of candidates) {
    if (!candidate.card.directSource || seen.has(candidate.card.symbol)) continue;
    const brief = deriveVerifiedChangeBrief(candidate);
    const lane = resolveVerifiedChangeLane(candidate, brief);
    if (!lane) continue;
    seen.add(candidate.card.symbol);
    laneItems.get(lane)?.push({
      symbol: candidate.card.symbol,
      chineseName: candidate.card.chineseName,
      lane,
      brief,
      card: candidate.card,
    });
  }
  for (const lane of LANE_ORDER) laneItems.set(lane, (laneItems.get(lane) ?? []).sort(compareItems).slice(0, 8));
  const selected = roundRobin(laneItems, 18);
  const selectedSymbols = new Set(selected.map((item) => item.symbol));
  const lanes = LANE_ORDER.map((key) => ({
    key,
    items: (laneItems.get(key) ?? []).filter((item) => selectedSymbols.has(item.symbol)),
  }));
  return { status: selected.length ? 'available' : 'empty', lanes };
}

export function buildHomepageSummary(
  workspace: VerifiedChangeWorkspaceV3,
  asOf: string,
): OpportunityHomepageSummaryV3 {
  const laneMap = new Map(workspace.lanes.map((lane) => [lane.key, lane.items]));
  const topItems = roundRobin(laneMap, 3).map((item) => ({
    symbol: item.symbol,
    chineseName: item.chineseName,
    changeKind: item.brief.changeKind,
    headline: item.brief.headline,
    verifiedAt: item.brief.verifiedAt,
    detailPath: item.brief.detailPath,
  }));
  const laneCounts = Object.fromEntries(
    LANE_ORDER.map((lane) => [lane, laneMap.get(lane)?.length ?? 0]),
  ) as Record<VerifiedChangeLaneKeyV3, number>;
  return {
    workspacePath: '/opportunity-v3',
    asOf,
    status: workspace.status,
    totalCount: Object.values(laneCounts).reduce((sum, count) => sum + count, 0),
    laneCounts,
    topItems,
  };
}

export interface StrategyCandidateV3 {
  runId: string;
  candidateSnapshotId: string;
  stockId: string;
  symbol: string;
  evidenceRootHash: string;
  briefInputHash: string;
  sourceCutoff: string;
  directSource: boolean;
  candidateOrigin: 'direct_candidate' | 'comparison_only';
  anchorClaimId: string | null;
  deepStatus: 'not_reached' | 'deferred' | 'failed' | 'succeeded';
  evidenceRows: VerifiedEvidenceRowV3[];
  briefDerivationInput: VerifiedChangeCandidateInputV3 | null;
  brief: VerifiedChangeBriefV3 | null;
}

export type StrategyCandidateIdentityV3 = [runId: string, symbol: string];

export interface ReviewerResolutionV3 {
  resolved: number;
  total: number;
  evaluationCutoff: string;
  evaluationInputCutoff: string;
  resolutionCutoff: string;
  evaluationDatasetLockHash: string;
  comparisonContractKey: string;
  evaluationInputRows: Array<{
    section: 'backtest_rows' | 'live_rows';
    rowOrdinal: number;
    enrichRunId: string;
  }>;
  supplyingRuns: Array<{
    runId: string;
    mode: 'source_scan' | 'enrich_rank' | 'label_outcomes' | 'shadow_evaluate';
    runPurpose: 'ad_hoc_shadow' | 'production_shadow_daily' | 'backtest_daily_primary' | 'outcome_label_daily' | 'shadow_evaluation_daily';
    status: 'preparing' | 'running' | 'success' | 'failed' | 'converged';
    evaluationDatasetLockHash: string | null;
    comparisonContractKey: string;
    sourceCutoff: string;
  }>;
  populationManifestId: string;
  populationManifestHash: string;
  populationRows: Array<{
    rowOrdinal: number;
    runId: string;
    candidateSnapshotId: string;
    stockId: string;
    symbol: string;
    evidenceRootHash: string;
    briefInputHash: string;
  }>;
}

export interface StrategyResultV3 {
  strategy: 'official_only' | 'source_led' | 'hybrid';
  selectedCandidateIds: StrategyCandidateIdentityV3[];
  excludedCandidateIdsAndReasons: Array<[StrategyCandidateIdentityV3, string]>;
  selectedCount: number;
  verifiedChangePrecisionNumerator: number;
  verifiedChangePrecisionDenominator: number;
  verifiedChangePrecision: number | null;
  contradictionCaptureNumerator: number;
  contradictionCaptureDenominator: number;
  contradictionCaptureRate: number | null;
  timeToFirstVerifiedChangeMinutes: number | null;
  reviewerResolutionNumerator: number;
  reviewerResolutionDenominator: number;
  reviewerResolutionRate: number | null;
  facts: Array<'insufficient_product_value_evidence'>;
  preCapCandidateCount: number;
  preCapOrderedIdentityHash: string;
  deferredDueStrategyEvidenceCap: number;
  retainedCandidateCount: number;
}

export type StrategyExclusionReasonV3 =
  | 'invalid_verified_change_input'
  | 'missing_verified_evidence'
  | 'missing_official_or_research_evidence'
  | 'insufficient_independent_source_classes';

export function buildStrategyBakeoff(
  candidates: StrategyCandidateV3[],
  reviewer: ReviewerResolutionV3,
): StrategyResultV3[] {
  if (
    reviewer.evaluationCutoff !== reviewer.evaluationInputCutoff ||
    reviewer.evaluationCutoff !== reviewer.resolutionCutoff
  ) throw new TypeError('strategy evaluation cutoff mismatch');
  if (
    !Number.isSafeInteger(reviewer.resolved) ||
    !Number.isSafeInteger(reviewer.total) ||
    reviewer.resolved < 0 ||
    reviewer.total < 0 ||
    reviewer.resolved > reviewer.total ||
    !/^[0-9a-f]{64}$/u.test(reviewer.evaluationDatasetLockHash) ||
    !/^[0-9a-f]{64}$/u.test(reviewer.comparisonContractKey)
  ) throw new TypeError('invalid reviewer resolution input');
  const eligibleRunIds = eligibleStrategyRunIds(reviewer);
  for (const candidate of candidates) {
    const validDirect =
      candidate.directSource &&
      candidate.candidateOrigin === 'direct_candidate' &&
      typeof candidate.anchorClaimId === 'string' &&
      candidate.anchorClaimId.length > 0 &&
      candidate.deepStatus === 'succeeded';
    const validComparison =
      !candidate.directSource &&
      candidate.candidateOrigin === 'comparison_only' &&
      candidate.anchorClaimId === null &&
      candidate.deepStatus !== 'succeeded';
    if (!validDirect && !validComparison) throw new TypeError('invalid strategy candidate origin tuple');
    if (!eligibleRunIds.has(candidate.runId)) throw new TypeError('strategy candidate outside evaluation input');
    if (
      !Number.isFinite(Date.parse(candidate.sourceCutoff)) ||
      Date.parse(candidate.sourceCutoff) > Date.parse(reviewer.evaluationCutoff)
    ) {
      throw new TypeError('strategy candidate after evaluation cutoff');
    }
    if (candidate.evidenceRows.some(
      (row) =>
        row.runId !== candidate.runId ||
        row.symbol !== candidate.symbol ||
        !['linked_new', 'linked_refresh', 'linked_duplicate_claim'].includes(row.mentionOutcome),
    )) throw new TypeError('strategy evidence provenance mismatch');
    if (
      candidate.brief &&
      (!candidate.briefDerivationInput ||
        candidate.briefInputHash !== createHash('sha256').update(canonicalJson(candidate.briefDerivationInput), 'utf8').digest('hex') ||
        canonicalJson(deriveVerifiedChangeBrief(candidate.briefDerivationInput)) !== canonicalJson(candidate.brief) ||
        candidate.brief.sourceCutoff !== candidate.sourceCutoff ||
        candidate.brief.detailPath !== `/opportunity-v3/${candidate.runId}/${candidate.symbol}` ||
        candidate.brief.evidenceRefs.some(
          (ref) => !candidate.evidenceRows.some((row) => row.evidenceRef === ref),
        ))
    ) throw new TypeError('strategy brief provenance mismatch');
    if (!candidate.brief && candidate.briefDerivationInput !== null) {
      throw new TypeError('strategy brief provenance mismatch');
    }
  }
  const populationRows = validatedStrategyPopulation(reviewer, candidates, eligibleRunIds);
  const ordered = candidates
    .filter((candidate) => candidate.directSource && candidate.candidateOrigin === 'direct_candidate')
    .sort(
      (a, b) =>
        Date.parse(b.sourceCutoff) - Date.parse(a.sourceCutoff) ||
        a.runId.localeCompare(b.runId) ||
        a.symbol.localeCompare(b.symbol),
    );
  const unique = ordered.filter(
    (candidate, index) =>
      ordered.findIndex((row) => row.runId === candidate.runId && row.symbol === candidate.symbol) === index,
  );
  if (unique.length !== populationRows.length) throw new TypeError('strategy population conservation mismatch');
  const preCapIdentities = unique.map(
    (candidate): StrategyCandidateIdentityV3 => [candidate.runId, candidate.symbol],
  );
  const preCapOrderedIdentityHash = createHash('sha256')
    .update(canonicalJson(['strategy-population-v3.0', preCapIdentities]), 'utf8')
    .digest('hex');
  const frozen = unique.slice(0, 400);
  const contradictionDenominator = frozen.filter((candidate) => candidate.brief?.contradictions.length).length;
  return (['official_only', 'source_led', 'hybrid'] as const).map((strategy) => {
    const selected: StrategyCandidateV3[] = [];
    const excluded: Array<[StrategyCandidateIdentityV3, StrategyExclusionReasonV3]> = [];
    for (const candidate of frozen) {
      const classes = new Set(candidate.evidenceRows.map((row) => row.sourceClass));
      const official = candidate.evidenceRows.some(
        (row) => (row.sourceClass === 'official' || row.sourceClass === 'public_research') && row.verificationTier === 'publisher_verified',
      );
      const provenance = candidate.evidenceRows.length > 0;
      const reason = strategyExclusionReason(strategy, candidate, provenance, official, classes.size);
      const identity: StrategyCandidateIdentityV3 = [candidate.runId, candidate.symbol];
      if (reason) excluded.push([identity, reason]);
      else selected.push(candidate);
    }
    const precisionNumerator = selected.filter(
      (candidate) =>
        candidate.brief?.contradictions.length === 0 &&
        (candidate.brief.formalResearchStatus === 'formal_watch' || candidate.brief.formalResearchStatus === 'formal_candidate'),
    ).length;
    const contradictionNumerator = selected.filter((candidate) => candidate.brief?.contradictions.length).length;
    const minutes = selected.map((candidate) => {
      const earliest = Math.min(...candidate.evidenceRows.map((row) => Date.parse(row.effectiveAt)));
      const verified = Date.parse(candidate.brief!.verifiedAt);
      if (!Number.isFinite(earliest) || !Number.isFinite(verified) || verified < earliest) {
        throw new TypeError('invalid strategy evidence chronology');
      }
      return Math.floor((verified - earliest) / 60_000);
    });
    const facts: StrategyResultV3['facts'] = [];
    if (!selected.length || !contradictionDenominator || !reviewer.total) facts.push('insufficient_product_value_evidence');
    return {
      strategy,
      selectedCandidateIds: selected.map(
        (candidate): StrategyCandidateIdentityV3 => [candidate.runId, candidate.symbol],
      ),
      excludedCandidateIdsAndReasons: excluded,
      selectedCount: selected.length,
      verifiedChangePrecisionNumerator: precisionNumerator,
      verifiedChangePrecisionDenominator: selected.length,
      verifiedChangePrecision: ratioOrNull(precisionNumerator, selected.length),
      contradictionCaptureNumerator: contradictionNumerator,
      contradictionCaptureDenominator: contradictionDenominator,
      contradictionCaptureRate: ratioOrNull(contradictionNumerator, contradictionDenominator),
      timeToFirstVerifiedChangeMinutes: minutes.length ? type7Quantile(minutes, 0.5) : null,
      reviewerResolutionNumerator: reviewer.resolved,
      reviewerResolutionDenominator: reviewer.total,
      reviewerResolutionRate: ratioOrNull(reviewer.resolved, reviewer.total),
      facts: [...new Set(facts)],
      preCapCandidateCount: unique.length,
      preCapOrderedIdentityHash,
      deferredDueStrategyEvidenceCap: Math.max(0, unique.length - frozen.length),
      retainedCandidateCount: frozen.length,
    };
  });
}

function eligibleStrategyRunIds(reviewer: ReviewerResolutionV3): Set<string> {
  const sectionOrder = { backtest_rows: 0, live_rows: 1 } as const;
  const seenSectionOrdinal = new Set<string>();
  const orderedInputRows = [...reviewer.evaluationInputRows].sort(
    (a, b) =>
      sectionOrder[a.section] - sectionOrder[b.section] ||
      a.rowOrdinal - b.rowOrdinal ||
      a.enrichRunId.localeCompare(b.enrichRunId),
  );
  for (const row of orderedInputRows) {
    if (!Number.isSafeInteger(row.rowOrdinal) || row.rowOrdinal < 0 || !row.enrichRunId) {
      throw new TypeError('invalid evaluation input supplier row');
    }
    const identity = `${row.section}\0${row.rowOrdinal}`;
    if (seenSectionOrdinal.has(identity)) throw new TypeError('duplicate evaluation input supplier ordinal');
    seenSectionOrdinal.add(identity);
  }
  const runById = new Map<string, ReviewerResolutionV3['supplyingRuns'][number]>();
  for (const run of reviewer.supplyingRuns) {
    if (runById.has(run.runId)) throw new TypeError('duplicate supplying run metadata');
    runById.set(run.runId, run);
  }
  const referencedRunIds = new Set(orderedInputRows.map((row) => row.enrichRunId));
  if (runById.size !== referencedRunIds.size || [...runById.keys()].some((runId) => !referencedRunIds.has(runId))) {
    throw new TypeError('supplying run roster contains unreferenced run');
  }
  const eligible = new Set<string>();
  for (const row of orderedInputRows) {
    if (eligible.has(row.enrichRunId)) continue;
    const run = runById.get(row.enrichRunId);
    if (
      !run ||
      run.mode !== 'enrich_rank' ||
      run.status !== 'success' ||
      !['production_shadow_daily', 'backtest_daily_primary'].includes(run.runPurpose) ||
      run.evaluationDatasetLockHash !== reviewer.evaluationDatasetLockHash ||
      run.comparisonContractKey !== reviewer.comparisonContractKey ||
      !Number.isFinite(Date.parse(run.sourceCutoff)) ||
      Date.parse(run.sourceCutoff) > Date.parse(reviewer.evaluationCutoff)
    ) throw new TypeError('invalid evaluation input supplying run');
    eligible.add(row.enrichRunId);
  }
  return eligible;
}

function validatedStrategyPopulation(
  reviewer: ReviewerResolutionV3,
  candidates: StrategyCandidateV3[],
  eligibleRunIds: Set<string>,
): ReviewerResolutionV3['populationRows'] {
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
  if (!UUID.test(reviewer.populationManifestId) || !/^[0-9a-f]{64}$/u.test(reviewer.populationManifestHash)) {
    throw new TypeError('invalid strategy population manifest');
  }
  if (!Array.isArray(reviewer.populationRows)) {
    throw new TypeError('invalid strategy population rows');
  }
  const identities = new Set<string>();
  for (const [index, row] of reviewer.populationRows.entries()) {
    const identity = `${row.runId}\0${row.candidateSnapshotId}`;
    if (
      row.rowOrdinal !== index ||
      !eligibleRunIds.has(row.runId) ||
      !UUID.test(row.candidateSnapshotId) ||
      !UUID.test(row.stockId) ||
      !/^[0-9A-Z]{4,10}$/u.test(row.symbol) ||
      !/^[0-9a-f]{64}$/u.test(row.evidenceRootHash) ||
      !/^[0-9a-f]{64}$/u.test(row.briefInputHash) ||
      identities.has(identity)
    ) throw new TypeError('invalid strategy population row');
    identities.add(identity);
  }
  const candidateRows = candidates
    .filter((candidate) => candidate.directSource && candidate.candidateOrigin === 'direct_candidate')
    .sort(
      (a, b) =>
        Date.parse(b.sourceCutoff) - Date.parse(a.sourceCutoff) ||
        a.runId.localeCompare(b.runId) ||
        a.symbol.localeCompare(b.symbol),
    )
    .filter(
      (candidate, index, rows) =>
        rows.findIndex((row) => row.runId === candidate.runId && row.symbol === candidate.symbol) === index,
    )
    .map((candidate, rowOrdinal) => ({
      rowOrdinal,
      runId: candidate.runId,
      candidateSnapshotId: candidate.candidateSnapshotId,
      stockId: candidate.stockId,
      symbol: candidate.symbol,
      evidenceRootHash: candidate.evidenceRootHash,
      briefInputHash: candidate.briefInputHash,
    }));
  if (canonicalJson(candidateRows) !== canonicalJson(reviewer.populationRows)) {
    throw new TypeError('strategy population conservation mismatch');
  }
  return reviewer.populationRows;
}

function strategyExclusionReason(
  strategy: StrategyResultV3['strategy'],
  candidate: StrategyCandidateV3,
  hasVerifiedEvidence: boolean,
  hasOfficialOrResearchEvidence: boolean,
  independentSourceClassCount: number,
): StrategyExclusionReasonV3 | null {
  if (!candidate.brief) return 'invalid_verified_change_input';
  if (!hasVerifiedEvidence) return 'missing_verified_evidence';
  if (strategy === 'official_only' && !hasOfficialOrResearchEvidence) {
    return 'missing_official_or_research_evidence';
  }
  if (strategy === 'hybrid' && !hasOfficialOrResearchEvidence && independentSourceClassCount < 2) {
    return 'insufficient_independent_source_classes';
  }
  return null;
}

function selectEvidenceRows(rows: VerifiedEvidenceRowV3[]): VerifiedEvidenceRowV3[] {
  const selected: VerifiedEvidenceRowV3[] = [];
  const roots = new Set<string>();
  for (const row of [...rows].sort(
    (a, b) =>
      a.sourceSelectionOrdinal - b.sourceSelectionOrdinal ||
      a.claimOrdinal - b.claimOrdinal ||
      a.evidenceRef.localeCompare(b.evidenceRef) ||
      a.evidenceRootId.localeCompare(b.evidenceRootId),
  )) {
    if (!Number.isSafeInteger(row.sourceSelectionOrdinal) || !Number.isSafeInteger(row.claimOrdinal)) {
      throw new TypeError('invalid evidence ordinal');
    }
    if (!row.evidenceRef || [...row.evidenceRef].length > 120 || !row.evidenceRootId) {
      throw new TypeError('invalid evidence identity');
    }
    if (!roots.has(row.evidenceRootId)) {
      roots.add(row.evidenceRootId);
      selected.push(row);
    }
  }
  return selected;
}

function resolveChangeKind(
  input: VerifiedChangeCandidateInputV3,
  hasContradiction: boolean,
): VerifiedChangeKindV3 {
  if (hasContradiction) return 'contradiction';
  if (input.anchorSourceClass === 'official') return 'official_event';
  if (input.card.changedBecause.some(
    (fact) => fact.code === 'factor_contribution_changed' && fact.factor === 'fundamental' && fact.delta !== 0,
  )) return 'fundamental_update';
  if (
    input.card.changedBecause.some(
      (fact) => fact.code === 'factor_contribution_changed' && fact.factor === 'valuation' && fact.delta !== 0,
    ) ||
    (input.priorComparable && input.priorComparable.valuationStatus !== input.card.valuation.status)
  ) return 'valuation_update';
  return 'source_corroboration';
}

function normalizeBounded(value: string, maximumCodePoints: number): string {
  const normalized = value.normalize('NFC').trim().replace(/\s+/gu, ' ');
  const length = [...normalized].length;
  if (!length || length > maximumCodePoints) throw new TypeError('verified-change text out of bounds');
  return normalized;
}

function compareItems(a: VerifiedChangeItemV3, b: VerifiedChangeItemV3): number {
  const verified = Date.parse(b.brief.verifiedAt) - Date.parse(a.brief.verifiedAt);
  if (verified) return verified;
  if (a.brief.scoreDelta == null && b.brief.scoreDelta != null) return 1;
  if (a.brief.scoreDelta != null && b.brief.scoreDelta == null) return -1;
  if (a.brief.scoreDelta != null && b.brief.scoreDelta != null) {
    const delta = Math.abs(b.brief.scoreDelta) - Math.abs(a.brief.scoreDelta);
    if (delta) return delta;
  }
  return a.symbol.localeCompare(b.symbol);
}

function roundRobin(
  lanes: Map<VerifiedChangeLaneKeyV3, VerifiedChangeItemV3[]>,
  limit: number,
): VerifiedChangeItemV3[] {
  const result: VerifiedChangeItemV3[] = [];
  for (let index = 0; result.length < limit; index += 1) {
    let added = false;
    for (const lane of LANE_ORDER) {
      const item = lanes.get(lane)?.[index];
      if (item) {
        result.push(item);
        added = true;
        if (result.length === limit) break;
      }
    }
    if (!added) break;
  }
  return result;
}

function ratioOrNull(numerator: number, denominator: number): number | null {
  if (!denominator) return null;
  return numerator / denominator;
}
