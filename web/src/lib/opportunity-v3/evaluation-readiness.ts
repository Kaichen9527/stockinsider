import { type7Quantile } from './scoring.ts';

export type EvaluationDateEvidenceV3 = {
  evaluationDate: string;
  sourceCutoff: string;
  snapshotRecordedAt: string;
  directCandidateCount: number;
  immutableInputHash: string;
};

export function evaluationConstructibility(
  rows: EvaluationDateEvidenceV3[],
  requiredDates = 120,
) {
  const reasons = new Set<string>();
  const byDate = new Map<string, EvaluationDateEvidenceV3>();
  for (const row of rows) {
    if (
      !/^\d{4}-\d{2}-\d{2}$/u.test(row.evaluationDate) ||
      !Number.isFinite(Date.parse(row.sourceCutoff)) ||
      !Number.isFinite(Date.parse(row.snapshotRecordedAt)) ||
      Date.parse(row.snapshotRecordedAt) > Date.parse(row.sourceCutoff) ||
      !Number.isSafeInteger(row.directCandidateCount) ||
      row.directCandidateCount < 0 ||
      !/^[0-9a-f]{64}$/u.test(row.immutableInputHash)
    ) {
      reasons.add('invalid_point_in_time_row');
      continue;
    }
    if (byDate.has(row.evaluationDate)) {
      reasons.add('duplicate_evaluation_date');
      continue;
    }
    byDate.set(row.evaluationDate, row);
  }
  if (byDate.size < requiredDates) reasons.add('insufficient_historical_dates');
  return {
    status: reasons.size ? 'blocked' as const : 'constructible' as const,
    requiredDates,
    observedDates: byDate.size,
    missingDates: Math.max(0, requiredDates - byDate.size),
    reasons: [...reasons].sort(),
  };
}

export type ProductFeedbackEventV3 = {
  viewerHash: string;
  symbol: string;
  shownAt: string;
  evidenceEffectiveAt: string;
  action: 'shown' | 'saved' | 'dismissed' | 'follow_up';
  trustScore: 1 | 2 | 3 | 4 | 5 | null;
  decisionUsefulnessScore: 1 | 2 | 3 | 4 | 5 | null;
};

export function productValueMeasures(events: ProductFeedbackEventV3[]) {
  const valid = events.filter((event) =>
    /^[0-9a-f]{64}$/u.test(event.viewerHash) &&
    /^[0-9A-Z]{4,10}$/u.test(event.symbol) &&
    Number.isFinite(Date.parse(event.shownAt)) &&
    Number.isFinite(Date.parse(event.evidenceEffectiveAt)) &&
    Date.parse(event.shownAt) >= Date.parse(event.evidenceEffectiveAt));
  const shown = valid.filter((event) => event.action === 'shown');
  const actionCount = (action: ProductFeedbackEventV3['action']) =>
    valid.filter((event) => event.action === action).length;
  const rate = (count: number) => shown.length ? count / shown.length : null;
  const viewers = new Map<string, Set<string>>();
  for (const event of shown) {
    const dates = viewers.get(event.viewerHash) ?? new Set<string>();
    dates.add(event.shownAt.slice(0, 10));
    viewers.set(event.viewerHash, dates);
  }
  const scored = <K extends 'trustScore' | 'decisionUsefulnessScore'>(key: K) =>
    valid.map((event) => event[key]).filter((value): value is 1 | 2 | 3 | 4 | 5 => value !== null);
  const median = (values: number[]) => values.length ? type7Quantile(values, 0.5) : null;
  return {
    evidenceLeadTimeMinutesP50: median(shown.map((event) =>
      (Date.parse(event.shownAt) - Date.parse(event.evidenceEffectiveAt)) / 60_000)),
    falsePositiveBurdenRate: rate(actionCount('dismissed')),
    saveRate: rate(actionCount('saved')),
    dismissRate: rate(actionCount('dismissed')),
    followUpRate: rate(actionCount('follow_up')),
    repeatedUseRate: viewers.size
      ? [...viewers.values()].filter((dates) => dates.size >= 2).length / viewers.size
      : null,
    trustScoreP50: median(scored('trustScore')),
    decisionUsefulnessScoreP50: median(scored('decisionUsefulnessScore')),
    shownCount: shown.length,
    invalidEventCount: events.length - valid.length,
  };
}
