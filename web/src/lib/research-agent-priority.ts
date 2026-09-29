/** Research scheduling only. This score is never an investment or trade score. */
export const RESEARCH_PRIORITY_POLICY = 'research-priority-v1' as const;
export const RESEARCH_PRIORITY_WEIGHTS = Object.freeze({
  evidence: 25, profitImpact: 25, novelty: 20, independentAttention: 15, researchability: 15,
});

export type ResearchSourceAttempt = {
  platform: string;
  status: 'success' | 'no_relevant' | 'failed' | 'not_attempted';
  attemptedAt: string;
  /** Exact query/page or connector range, never a claim to have searched everything. */
  scope?: string;
  resultCount?: number | null;
  errorCode?: string | null;
  receiptHash?: string | null;
};
export type ResearchSourceRoot = {
  rootId: string;
  url: string;
  publishedAt: string;
  firstObservedAt: string;
  kind: 'official_verified' | 'primary_industry' | 'public_broker' | 'news' | 'social_rumor';
  status: 'current' | 'retracted' | 'contradicted';
};
export type ResearchPriorityCandidate = {
  symbol: string;
  sector: string;
  roots: ResearchSourceRoot[];
  attempts: ResearchSourceAttempt[];
  /** Reviewed, ordinal estimates with an explanation, not model-generated returns. */
  profitImpact: { level: 0 | 1 | 2 | 3 | 4; reason: string };
  novelty: { level: 0 | 1 | 2 | 3 | 4; reason: string };
  researchability: { level: 0 | 1 | 2 | 3 | 4; reason: string };
  lane: 'general' | 'emerging';
  inProgress: boolean;
  disposition: 'queued' | 'researching' | 'needs_evidence' | 'rejected' | 'qualified' | 'stale';
};
export type ResearchPriorityRow = {
  symbol: string;
  lane: 'general' | 'emerging';
  score: number;
  scoreStatus: 'complete' | 'partial_source_failure';
  independentRootCount: number;
  rootIds: string[];
  missingPlatforms: string[];
  inProgress: boolean;
  disposition: ResearchPriorityCandidate['disposition'];
  policyVersion: typeof RESEARCH_PRIORITY_POLICY;
};

const weight = RESEARCH_PRIORITY_WEIGHTS;
const validTime = (value: string) => Number.isFinite(Date.parse(value));
const reasoned = (value: { level: number; reason: string }) => Number.isInteger(value.level)
  && value.level >= 0 && value.level <= 4 && value.reason.trim().length >= 4;

function scoreCandidate(candidate: ResearchPriorityCandidate, asOf: string): ResearchPriorityRow {
  if (!/^\d{4}$/u.test(candidate.symbol) || !reasoned(candidate.profitImpact)
    || !reasoned(candidate.novelty) || !reasoned(candidate.researchability)) {
    throw new Error('research_priority_candidate_invalid');
  }
  const cutoff = Date.parse(asOf);
  const latestByRoot = new Map<string, ResearchSourceRoot>();
  for (const root of candidate.roots) {
    if (!root.rootId || !validTime(root.publishedAt) || !validTime(root.firstObservedAt)
      || Date.parse(root.publishedAt) > cutoff || Date.parse(root.firstObservedAt) > cutoff) {
      throw new Error('research_priority_future_or_invalid_root');
    }
    const prior = latestByRoot.get(root.rootId);
    if (!prior || Date.parse(root.firstObservedAt) >= Date.parse(prior.firstObservedAt)) latestByRoot.set(root.rootId, root);
  }
  const roots = [...latestByRoot.values()].filter((root) => root.status === 'current');
  const evidenceRanks: Record<ResearchSourceRoot['kind'], number> = {
    official_verified: 4, primary_industry: 3, public_broker: 2, news: 1, social_rumor: 1,
  };
  const evidence = Math.max(0, ...roots.map((root) => evidenceRanks[root.kind]));
  const latestAttempts = new Map<string, ResearchSourceAttempt>();
  for (const attempt of candidate.attempts) {
    if (!attempt.platform || !validTime(attempt.attemptedAt) || Date.parse(attempt.attemptedAt) > cutoff) {
      throw new Error('research_priority_attempt_invalid');
    }
    const prior = latestAttempts.get(attempt.platform);
    if (!prior || Date.parse(attempt.attemptedAt) >= Date.parse(prior.attemptedAt)) latestAttempts.set(attempt.platform, attempt);
  }
  const missingPlatforms = latestAttempts.size === 0 ? ['source_coverage_unknown']
    : [...latestAttempts.values()].filter((attempt) => attempt.status === 'failed' || attempt.status === 'not_attempted')
      .map((attempt) => attempt.platform).sort();
  const week = 7 * 86400_000;
  const thisWeek = roots.filter((root) => Date.parse(root.firstObservedAt) > cutoff - week).length;
  const priorWeek = roots.filter((root) => {
    const at = Date.parse(root.firstObservedAt);
    return at > cutoff - week * 2 && at <= cutoff - week;
  }).length;
  const attention = Math.min(4, Math.max(0, thisWeek - priorWeek));
  const knownWeight = 100 - (missingPlatforms.length ? weight.independentAttention : 0);
  const raw = evidence * weight.evidence + candidate.profitImpact.level * weight.profitImpact
    + candidate.novelty.level * weight.novelty + candidate.researchability.level * weight.researchability
    + (missingPlatforms.length ? 0 : attention * weight.independentAttention);
  return {
    symbol: candidate.symbol, lane: candidate.lane,
    score: Math.round(raw / (knownWeight * 4) * 10000) / 100,
    scoreStatus: missingPlatforms.length ? 'partial_source_failure' : 'complete',
    independentRootCount: roots.length, rootIds: roots.map((root) => root.rootId).sort(), missingPlatforms,
    inProgress: candidate.inProgress, disposition: candidate.disposition, policyVersion: RESEARCH_PRIORITY_POLICY,
  };
}

export function selectResearchPriority(input: {
  candidates: ResearchPriorityCandidate[];
  asOf: string;
  maxGeneral?: number;
  maxEmerging?: number;
}) {
  if (!validTime(input.asOf) || input.candidates.length > 20_000) throw new Error('research_priority_input_invalid');
  const maxGeneral = input.maxGeneral ?? 15;
  const maxEmerging = input.maxEmerging ?? 5;
  if (!Number.isInteger(maxGeneral) || !Number.isInteger(maxEmerging) || maxGeneral < 0 || maxGeneral > 15
    || maxEmerging < 0 || maxEmerging > 5) throw new Error('research_priority_capacity_invalid');
  const symbols = new Set<string>();
  const all = input.candidates.map((candidate) => {
    if (symbols.has(candidate.symbol)) throw new Error('research_priority_duplicate_symbol');
    symbols.add(candidate.symbol);
    return scoreCandidate(candidate, input.asOf);
  });
  const eligible = all.filter((row) => row.disposition === 'queued' || row.disposition === 'researching'
    || row.disposition === 'stale');
  const order = (left: ResearchPriorityRow, right: ResearchPriorityRow) => Number(right.inProgress) - Number(left.inProgress)
    || right.score - left.score || left.symbol.localeCompare(right.symbol);
  const queue = [
    ...eligible.filter((row) => row.lane === 'general').sort(order).slice(0, maxGeneral),
    ...eligible.filter((row) => row.lane === 'emerging').sort(order).slice(0, maxEmerging),
  ];
  return { policyVersion: RESEARCH_PRIORITY_POLICY, asOf: input.asOf,
    expectedCount: all.length, accountedCount: all.length, rows: all.sort((a, b) => a.symbol.localeCompare(b.symbol)),
    queue, unselected: eligible.filter((row) => !queue.includes(row)),
  };
}
