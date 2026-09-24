import { isDeepStrictEqual } from 'node:util';
import { candidateTradePlanSummary, readCandidateTradePlan, readCandidateTradePlanSummary } from './candidate-trade-plan.ts';
import type { TwEntryPlan, TwEntryPlanSummary } from './tw-entry-plan-contract.ts';

export const CANDIDATE_TRADE_PLAN_COVERAGE_VERSION = 'candidate-trade-plan-coverage-v1' as const;
export const CANDIDATE_TRADE_PLAN_PUBLICATION_COVERAGE_VERSION = 'candidate-trade-plan-publication-coverage-v1' as const;
const MAXIMUM_ROSTER = 20_000;
type Row = Record<string, unknown>;

export type CandidateTradePlanCoverageOutcome = {
  symbol: string; status: 'saved'; revisionId: string; sessionDate: string; availableAt: string; envelope: unknown;
} | {
  symbol: string; status: 'unavailable' | 'failed'; reasonCodes: string[];
};
export type CandidateTradePlanCoverageRecord = {
  symbol: string;
  status: 'evaluated' | 'data_insufficient' | 'unavailable' | 'failed' | 'unresolved' | 'duplicate';
  revisionId: string | null; reasonCodes: string[]; usablePlan: boolean;
};
export type CandidateTradePlanCoverageSummary = {
  schemaVersion: typeof CANDIDATE_TRADE_PLAN_COVERAGE_VERSION; validationStatus: 'research_only';
  status: 'complete' | 'incomplete' | 'empty'; complete: boolean; accountedForAll: boolean;
  expectedCount: number; expectedUniqueCount: number; outcomeCount: number; processedCount: number; savedCount: number;
  evaluatedCount: number; dataInsufficientCount: number; unavailableCount: number; failedCount: number;
  unresolvedCount: number; missingCount: number; duplicateCount: number; duplicateExpectedCount: number;
  unexpectedCount: number; invalidExpectedCount: number; invalidOutcomeCount: number;
  /** Number of distinct stocks with an eligible research zone, never a trade or performance count. */
  usablePlanCount: number;
};
export type CandidateTradePlanCoverage = CandidateTradePlanCoverageSummary & {
  /** Store only `summary` in the aggregate run row; records are per-item diagnostics. */
  summary: CandidateTradePlanCoverageSummary;
  records: CandidateTradePlanCoverageRecord[];
  /** Memory-only evidence for checking cards before snapshot publication. */
  publicationBindings: CandidateTradePlanPublicationBinding[];
  missingSymbols: string[]; duplicateSymbols: string[]; duplicateExpectedSymbols: string[]; unexpectedSymbols: string[];
  invalidExpectedIndexes: number[]; invalidOutcomeIndexes: number[];
};
export type CandidateTradePlanPublicationBinding = {
  symbol: string; revisionId: string; summary: TwEntryPlanSummary;
};
export type CandidateTradePlanPublicationCard = {
  symbol: string; detailRevisionId?: string | null; tradePlanSummary?: unknown;
};
export type CandidateTradePlanPublicationCoverage = {
  schemaVersion: typeof CANDIDATE_TRADE_PLAN_PUBLICATION_COVERAGE_VERSION; validationStatus: 'research_only';
  complete: boolean; coverageComplete: boolean; cardCount: number; taiwanCardCount: number; ignoredCardCount: number;
  /** Number of individually matched display cards, including copies across stage buckets. */
  matchedCount: number;
  /** Number of distinct symbols for which every displayed copy matches. */
  matchedSymbolCount: number; mismatches: Array<{ symbol: string | null; reason: string }>;
};

const object = (value: unknown): value is Row => value !== null && typeof value === 'object' && !Array.isArray(value);
const symbol = (value: unknown): value is string => typeof value === 'string' && /^\d{4}$/u.test(value);
const string = (value: unknown) => typeof value === 'string' ? value : '';
const unique = (values: string[]) => [...new Set(values)].sort();
function reasons(values: unknown, fallback: string): string[] {
  const result = Array.isArray(values) ? unique(values.filter((value): value is string => typeof value === 'string'
    && value.length > 0 && value.length <= 128)).slice(0, 32) : [];
  return result.length ? result : [fallback];
}

/** Call only after the immutable revision write succeeds. Reconciliation
 * verifies the actual saved ID/time/envelope instead of trusting a success flag. */
export function createSavedOutcome(input: { symbol: string; savedRevision: Row }): CandidateTradePlanCoverageOutcome {
  const row = input.savedRevision;
  const provenance = object(row.provenance) ? row.provenance : null;
  return { symbol: input.symbol, status: 'saved', revisionId: string(row.id),
    sessionDate: string(row.session_date), availableAt: string(row.available_at), envelope: provenance?.trade_plan ?? null };
}

function hasUsableResearchZone(plan: TwEntryPlan): boolean {
  const lower = plan.entryLower; const upper = plan.entryUpper; const stop = plan.invalidationPrice;
  return plan.validationStatus === 'research_only' && plan.rawSignalState === 'confirmed' && plan.planState === 'conditional'
    && plan.eligibility.state === 'eligible' && plan.eligibility.reasonCodes.length === 0 && plan.missingData.length === 0
    && lower !== null && upper !== null && stop !== null && [lower, upper, stop].every((value) => Number.isFinite(value) && value > 0)
    && stop < lower && lower <= upper && plan.noChaseAbove === upper;
}

function evaluate(outcome: CandidateTradePlanCoverageOutcome): {
  record: CandidateTradePlanCoverageRecord; binding: CandidateTradePlanPublicationBinding | null;
} {
  const base = { symbol: outcome.symbol, revisionId: null, usablePlan: false };
  if (outcome.status !== 'saved') return { binding: null, record: { ...base, status: outcome.status,
    reasonCodes: reasons(outcome.reasonCodes, outcome.status === 'failed' ? 'trade_plan_generation_failed' : 'trade_plan_not_published') } };
  const bundle = readCandidateTradePlan(outcome.envelope, { revisionId: outcome.revisionId, symbol: outcome.symbol,
    sessionDate: outcome.sessionDate, availableAt: outcome.availableAt });
  if (!bundle) return { binding: null, record: { ...base, status: 'unavailable', reasonCodes: ['saved_trade_plan_invalid_or_missing'] } };
  const binding = { symbol: outcome.symbol, revisionId: outcome.revisionId, summary: candidateTradePlanSummary(bundle) };
  const missing = unique([...bundle.missingData, ...bundle.plans.flatMap((plan) => plan.missingData)]);
  if (missing.length || bundle.plans.some((plan) => plan.rawSignalState === 'data_insufficient' || plan.planState === 'data_insufficient')) {
    return { binding, record: { ...base, revisionId: outcome.revisionId, status: 'data_insufficient', reasonCodes: reasons(missing, 'trade_plan_data_insufficient') } };
  }
  return { binding, record: { ...base, revisionId: outcome.revisionId, status: 'evaluated',
    reasonCodes: reasons(bundle.plans.flatMap((plan) => [...plan.reasonCodes, ...plan.eligibility.reasonCodes]), 'research_plan_evaluated'),
    usablePlan: bundle.plans.some(hasUsableResearchZone) } };
}

/** A bounded, order-independent conservation check of the entire requested
 * roster. Data gaps are successful fail-closed evaluations, not usable entry
 * zones. A typed failure can account for a stock without completing coverage. */
export function reconcileCandidateTradePlanCoverage(input: {
  expectedSymbols: readonly string[]; outcomes: readonly CandidateTradePlanCoverageOutcome[];
}): CandidateTradePlanCoverage {
  if (input.expectedSymbols.length > MAXIMUM_ROSTER || input.outcomes.length > MAXIMUM_ROSTER * 2) throw new RangeError('candidate_trade_plan_coverage_bound');
  const expected = new Map<string, number>(); const invalidExpectedIndexes: number[] = [];
  input.expectedSymbols.forEach((value, index) => {
    if (!symbol(value)) invalidExpectedIndexes.push(index);
    else expected.set(value, (expected.get(value) ?? 0) + 1);
  });
  const grouped = new Map<string, CandidateTradePlanCoverageOutcome[]>(); const invalidOutcomeIndexes: number[] = [];
  const unexpected: string[] = [];
  input.outcomes.forEach((outcome, index) => {
    if (!object(outcome) || !symbol(outcome.symbol) || !['saved', 'failed', 'unavailable'].includes(outcome.status)) {
      invalidOutcomeIndexes.push(index); return;
    }
    if (!expected.has(outcome.symbol)) { unexpected.push(outcome.symbol); return; }
    const rows = grouped.get(outcome.symbol) ?? []; rows.push(outcome); grouped.set(outcome.symbol, rows);
  });
  const missingSymbols: string[] = []; const duplicateSymbols: string[] = [];
  const publicationBindings: CandidateTradePlanPublicationBinding[] = [];
  const records = [...expected.keys()].sort().map((key): CandidateTradePlanCoverageRecord => {
    const outcomes = grouped.get(key) ?? [];
    if (outcomes.length === 0) {
      missingSymbols.push(key);
      return { symbol: key, status: 'unresolved', revisionId: null, reasonCodes: ['missing_trade_plan_outcome'], usablePlan: false };
    }
    if (outcomes.length !== 1) {
      duplicateSymbols.push(key);
      return { symbol: key, status: 'duplicate', revisionId: null, reasonCodes: ['duplicate_trade_plan_outcomes'], usablePlan: false };
    }
    const evaluated = evaluate(outcomes[0]);
    if (evaluated.binding) publicationBindings.push(evaluated.binding);
    return evaluated.record;
  });
  const count = (status: CandidateTradePlanCoverageRecord['status']) => records.filter((row) => row.status === status).length;
  const evaluatedCount = count('evaluated'); const dataInsufficientCount = count('data_insufficient');
  const unavailableCount = count('unavailable'); const failedCount = count('failed');
  const unresolvedCount = count('unresolved'); const duplicateCount = count('duplicate');
  const duplicateExpectedSymbols = [...expected].filter(([, occurrences]) => occurrences !== 1).map(([key]) => key).sort();
  const unexpectedSymbols = unique(unexpected);
  const processedCount = evaluatedCount + dataInsufficientCount + unavailableCount + failedCount;
  const rosterValid = invalidExpectedIndexes.length === 0 && duplicateExpectedSymbols.length === 0;
  const accountedForAll = rosterValid && processedCount === input.expectedSymbols.length && missingSymbols.length === 0
    && duplicateCount === 0 && unexpectedSymbols.length === 0 && invalidOutcomeIndexes.length === 0;
  const complete = accountedForAll && evaluatedCount + dataInsufficientCount === input.expectedSymbols.length
    && failedCount === 0 && unavailableCount === 0;
  const summary: CandidateTradePlanCoverageSummary = {
    schemaVersion: CANDIDATE_TRADE_PLAN_COVERAGE_VERSION, validationStatus: 'research_only',
    status: input.expectedSymbols.length === 0 && input.outcomes.length === 0 ? 'empty' : complete ? 'complete' : 'incomplete',
    complete, accountedForAll, expectedCount: input.expectedSymbols.length, expectedUniqueCount: expected.size,
    outcomeCount: input.outcomes.length, processedCount, savedCount: evaluatedCount + dataInsufficientCount,
    evaluatedCount, dataInsufficientCount, unavailableCount, failedCount, unresolvedCount, missingCount: missingSymbols.length,
    duplicateCount, duplicateExpectedCount: duplicateExpectedSymbols.length, unexpectedCount: unexpectedSymbols.length,
    invalidExpectedCount: invalidExpectedIndexes.length, invalidOutcomeCount: invalidOutcomeIndexes.length,
    usablePlanCount: records.filter((row) => row.usablePlan).length,
  };
  return { ...summary, summary, records, publicationBindings, missingSymbols, duplicateSymbols, duplicateExpectedSymbols,
    unexpectedSymbols, invalidExpectedIndexes, invalidOutcomeIndexes };
}

/** Check only cards selected by the existing publication filters. A research
 * candidate need not have a public card, but every published Taiwan card must
 * carry this run's saved revision and its exact compact research summary.
 * Found and waiting/actionable buckets can legitimately display the same stock. */
export function reconcilePublishedCandidateTradePlanCoverage(input: {
  coverage: CandidateTradePlanCoverage; cards: readonly CandidateTradePlanPublicationCard[];
}): CandidateTradePlanPublicationCoverage {
  if (input.cards.length > MAXIMUM_ROSTER * 3) throw new RangeError('candidate_trade_plan_publication_bound');
  const mismatches: CandidateTradePlanPublicationCoverage['mismatches'] = [];
  if (!input.coverage.complete) mismatches.push({ symbol: null, reason: 'research_coverage_incomplete' });
  const expected = new Set(input.coverage.records.map((row) => row.symbol));
  const bindings = new Map<string, CandidateTradePlanPublicationBinding[]>();
  for (const binding of input.coverage.publicationBindings) {
    const rows = bindings.get(binding.symbol) ?? []; rows.push(binding); bindings.set(binding.symbol, rows);
  }
  const cards = new Map<string, CandidateTradePlanPublicationCard[]>(); let ignoredCardCount = 0;
  for (const card of input.cards) {
    if (!symbol(card.symbol)) { ignoredCardCount += 1; continue; }
    const rows = cards.get(card.symbol) ?? []; rows.push(card); cards.set(card.symbol, rows);
  }
  let matchedCount = 0; let matchedSymbolCount = 0;
  for (const [key, rows] of [...cards].sort(([a], [b]) => a.localeCompare(b))) {
    if (!expected.has(key)) { mismatches.push({ symbol: key, reason: 'card_not_in_research_roster' }); continue; }
    const saved = bindings.get(key) ?? [];
    if (saved.length !== 1) { mismatches.push({ symbol: key, reason: 'current_run_saved_binding_missing_or_duplicate' }); continue; }
    const binding = saved[0]; const matchesBefore = matchedCount;
    for (const card of rows) {
      if (card.detailRevisionId !== binding.revisionId) { mismatches.push({ symbol: key, reason: 'card_revision_not_from_current_run' }); continue; }
      const summary = readCandidateTradePlanSummary(card.tradePlanSummary, { revisionId: binding.revisionId });
      if (!summary) { mismatches.push({ symbol: key, reason: 'card_trade_plan_summary_missing_or_invalid' }); continue; }
      if (!isDeepStrictEqual(summary, binding.summary)) { mismatches.push({ symbol: key, reason: 'card_trade_plan_summary_mismatch' }); continue; }
      matchedCount += 1;
    }
    if (matchedCount - matchesBefore === rows.length) matchedSymbolCount += 1;
  }
  return { schemaVersion: CANDIDATE_TRADE_PLAN_PUBLICATION_COVERAGE_VERSION, validationStatus: 'research_only',
    complete: mismatches.length === 0, coverageComplete: input.coverage.complete,
    cardCount: input.cards.length, taiwanCardCount: input.cards.length - ignoredCardCount, ignoredCardCount,
    matchedCount, matchedSymbolCount, mismatches };
}
