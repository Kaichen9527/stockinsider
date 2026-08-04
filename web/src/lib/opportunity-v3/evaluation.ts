import { roundHalfAwayFromZero } from './canonical.ts';
import { type7Quantile } from './scoring.ts';

export type EvaluationRankingRowV3 = {
  symbol: string;
  score: number | null;
  confidence: number | null;
  relevant: boolean;
  grade: 0 | 1 | 2 | 3;
  mae20Pct: number;
};

export type EvaluationRunMetricsV3 = {
  precisionAt20: number;
  ndcgAt20: number;
  worstDecileMae20Pct: number;
  cohortSize: number;
  selectedCount: number;
};

export function rankIdenticalCohort(rows: EvaluationRankingRowV3[]): EvaluationRankingRowV3[] {
  const symbols = new Set<string>();
  for (const row of rows) {
    if (
      !/^[0-9A-Z]{4,10}$/u.test(row.symbol) ||
      symbols.has(row.symbol) ||
      (row.score !== null && !Number.isFinite(row.score)) ||
      (row.confidence !== null && !Number.isFinite(row.confidence)) ||
      ![0, 1, 2, 3].includes(row.grade) ||
      !Number.isFinite(row.mae20Pct) ||
      row.mae20Pct > 0
    ) throw new TypeError('invalid evaluation cohort row');
    symbols.add(row.symbol);
  }
  return [...rows].sort((left, right) => {
    const leftScored = left.score !== null;
    const rightScored = right.score !== null;
    if (leftScored !== rightScored) return leftScored ? -1 : 1;
    if (left.score !== right.score) return (right.score ?? 0) - (left.score ?? 0);
    if (left.confidence !== right.confidence) {
      return (right.confidence ?? Number.NEGATIVE_INFINITY) -
        (left.confidence ?? Number.NEGATIVE_INFINITY);
    }
    return left.symbol.localeCompare(right.symbol);
  });
}

export function evaluationRunMetrics(rows: EvaluationRankingRowV3[]): EvaluationRunMetricsV3 {
  const ranked = rankIdenticalCohort(rows);
  if (ranked.length < 10) throw new TypeError('non_qualifying_evaluation_cohort');
  const selectedCount = Math.min(20, ranked.length);
  const selected = ranked.slice(0, selectedCount);
  const precisionAt20 = selected.filter((row) => row.relevant).length / selectedCount;
  const dcg = discountedCumulativeGain(selected.map((row) => row.grade));
  const ideal = [...rows]
    .sort((left, right) => right.grade - left.grade || left.symbol.localeCompare(right.symbol))
    .slice(0, selectedCount);
  const idcg = discountedCumulativeGain(ideal.map((row) => row.grade));
  const p10 = type7Quantile(selected.map((row) => row.mae20Pct), 0.1);
  if (p10 === null) throw new TypeError('empty evaluation selection');
  return {
    precisionAt20: roundHalfAwayFromZero(precisionAt20, 6),
    ndcgAt20: roundHalfAwayFromZero(idcg === 0 ? 0 : dcg / idcg, 6),
    worstDecileMae20Pct: roundHalfAwayFromZero(p10, 6),
    cohortSize: rows.length,
    selectedCount,
  };
}

export function macroEvaluationMetrics(
  runs: EvaluationRankingRowV3[][],
): Omit<EvaluationRunMetricsV3, 'cohortSize' | 'selectedCount'> {
  if (!runs.length) throw new TypeError('empty evaluation run set');
  const metrics = runs.map(evaluationRunMetrics);
  const mean = (values: number[]) =>
    roundHalfAwayFromZero(values.reduce((sum, value) => sum + value, 0) / values.length, 6);
  return {
    precisionAt20: mean(metrics.map((row) => row.precisionAt20)),
    ndcgAt20: mean(metrics.map((row) => row.ndcgAt20)),
    worstDecileMae20Pct: mean(metrics.map((row) => row.worstDecileMae20Pct)),
  };
}

export type IdenticalComparisonRowV3 = {
  symbol: string;
  v3Rank: number | null;
  legacyRank: number | null;
  relevant: boolean;
  grade: 0 | 1 | 2 | 3;
  mae20Pct: number;
};

export function comparisonMetrics(
  cohorts: IdenticalComparisonRowV3[][],
): {
  v3Metrics: Omit<EvaluationRunMetricsV3, 'cohortSize' | 'selectedCount'>;
  legacyMetrics: Omit<EvaluationRunMetricsV3, 'cohortSize' | 'selectedCount'>;
} {
  const rankRows = (
    rows: IdenticalComparisonRowV3[],
    rankKey: 'v3Rank' | 'legacyRank',
  ): EvaluationRankingRowV3[] => rows.map((row) => {
    const rank = row[rankKey];
    if (!(rank === null || (Number.isSafeInteger(rank) && rank > 0))) {
      throw new TypeError('invalid comparison rank');
    }
    return {
      symbol: row.symbol,
      score: rank === null ? null : -rank,
      confidence: null,
      relevant: row.relevant,
      grade: row.grade,
      mae20Pct: row.mae20Pct,
    };
  });
  return {
    v3Metrics: macroEvaluationMetrics(
      cohorts.map((rows) => rankRows(rows, 'v3Rank')),
    ),
    legacyMetrics: macroEvaluationMetrics(
      cohorts.map((rows) => rankRows(rows, 'legacyRank')),
    ),
  };
}

export function relativeImprovement(current: number, legacy: number): number {
  if (![current, legacy].every(Number.isFinite)) throw new TypeError('invalid evaluation metric');
  return roundHalfAwayFromZero((current - legacy) / Math.max(Math.abs(legacy), 0.01), 6);
}

export type PromotionEvidenceV3 = {
  backtestCount: number;
  liveCount: number;
  v3Metrics: Omit<EvaluationRunMetricsV3, 'cohortSize' | 'selectedCount'> | null;
  legacyMetrics: Omit<EvaluationRunMetricsV3, 'cohortSize' | 'selectedCount'> | null;
  linkPrecision: number | null;
  linkRecall: number | null;
  acceptancePassed: boolean;
  securityPassed: boolean;
  operationsPassed: boolean;
};

export function evaluatePromotion(evidence: PromotionEvidenceV3) {
  if (
    !Number.isSafeInteger(evidence.backtestCount) ||
    !Number.isSafeInteger(evidence.liveCount) ||
    evidence.backtestCount < 0 ||
    evidence.backtestCount > 120 ||
    evidence.liveCount < 0 ||
    evidence.liveCount > 20
  ) throw new TypeError('invalid evaluation maturity counts');
  const metricsAvailable =
    evidence.backtestCount === 120 &&
    evidence.v3Metrics !== null &&
    evidence.legacyMetrics !== null;
  const precisionImprovement = metricsAvailable
    ? relativeImprovement(evidence.v3Metrics!.precisionAt20, evidence.legacyMetrics!.precisionAt20)
    : null;
  const ndcgImprovement = metricsAvailable
    ? relativeImprovement(evidence.v3Metrics!.ndcgAt20, evidence.legacyMetrics!.ndcgAt20)
    : null;
  const facts: string[] = [];
  if (evidence.backtestCount < 120) facts.push('insufficient_backtest_dates');
  if (evidence.liveCount < 20) facts.push('insufficient_live_dates');
  if (!metricsAvailable) facts.push('missing_reproducible_metrics');
  if (evidence.linkPrecision === null || evidence.linkRecall === null) {
    facts.push('insufficient_link_audit_evidence');
  }
  const conditions = {
    backtestMature: evidence.backtestCount === 120,
    liveMature: evidence.liveCount === 20,
    precisionImproved: precisionImprovement !== null && precisionImprovement >= 0.1,
    ndcgImproved: ndcgImprovement !== null && ndcgImprovement >= 0.1,
    adverseExcursionPreserved: metricsAvailable &&
      evidence.v3Metrics!.worstDecileMae20Pct >=
        evidence.legacyMetrics!.worstDecileMae20Pct - 2,
    linkPrecisionPassed: evidence.linkPrecision !== null && evidence.linkPrecision >= 0.95,
    linkRecallPassed: evidence.linkRecall !== null && evidence.linkRecall >= 0.9,
    acceptancePassed: evidence.acceptancePassed,
    securityPassed: evidence.securityPassed,
    operationsPassed: evidence.operationsPassed,
  };
  const pass = Object.values(conditions).every(Boolean);
  return {
    pass,
    mode: pass ? 'eligible_for_promotion' as const : 'shadow' as const,
    precisionImprovement,
    ndcgImprovement,
    conditions,
    facts,
  };
}

export function mostRecentDistinctCohorts<T extends {
  tradingDate: string;
  maturitySession: string;
}>(
  rows: T[],
  limit: number,
): T[] {
  if (!Number.isSafeInteger(limit) || limit < 0) throw new TypeError('invalid cohort limit');
  const seen = new Set<string>();
  const selected: T[] = [];
  for (const row of [...rows].sort(
    (left, right) =>
      right.maturitySession.localeCompare(left.maturitySession) ||
      right.tradingDate.localeCompare(left.tradingDate),
  )) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.tradingDate) ||
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.maturitySession)
    ) throw new TypeError('invalid evaluation cohort date');
    if (seen.has(row.tradingDate)) throw new TypeError('duplicate evaluation cohort date');
    seen.add(row.tradingDate);
    if (selected.length < limit) selected.push(row);
  }
  return selected.sort((left, right) => left.tradingDate.localeCompare(right.tradingDate));
}

function discountedCumulativeGain(grades: number[]): number {
  return grades.reduce(
    (sum, grade, index) => sum + ((2 ** grade) - 1) / Math.log2(index + 2),
    0,
  );
}
