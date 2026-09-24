import assert from 'node:assert/strict';
import test from 'node:test';
import { bindCandidateTradePlan } from './candidate-trade-plan.ts';
import { createSavedOutcome, reconcileCandidateTradePlanCoverage, reconcilePublishedCandidateTradePlanCoverage,
  type CandidateTradePlanCoverageOutcome } from './candidate-trade-plan-coverage.ts';
import { buildTwEntryPlans } from './tw-entry-plan.ts';
import type { TwEntryPlanInput } from './tw-entry-plan-contract.ts';

function fixture(symbol = '2330', mode: 'conditional' | 'blocked' | 'waiting' | 'avoid_chase' | 'expired' | 'insufficient' = 'blocked') {
  // Explicit synthetic session authority; no dependency on a real market clock.
  const sessions = Array.from({ length: 241 }, (_, index) => new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10));
  const signal = sessions[239]; const next = sessions[240];
  const bars = sessions.slice(0, 240).map((session, index) => {
    const close = Number((50 + index * 0.1).toFixed(1));
    return { session, open: close, high: Number((close + 0.2).toFixed(1)), low: Number((close - 0.2).toFixed(1)),
      close, volume: 1000, availableAt: `${session}T14:00:00+08:00`, sourceRef: `fixture:${session}` };
  });
  Object.assign(bars[239], { close: 74.1, high: 74.2, volume: 1500 });
  if (mode === 'waiting') Object.assign(bars[239], { close: 73.9, high: 74.1, volume: 1000 });
  if (mode === 'avoid_chase') Object.assign(bars[239], { open: 77.9, high: 78.2, low: 77.8, close: 78, volume: 1500 });
  const input: TwEntryPlanInput = { symbol, candidateRevisionId: 'unbound', computedAt: `${signal}T15:00:00+08:00`,
    availableAt: `${signal}T15:00:00+08:00`, dataAsOf: `${signal}T14:00:00+08:00`, sourceDatasetRevision: 'verified-fixture-revision', bars,
    calendar: { version: 'fixture-calendar', knownAt: `${signal}T14:00:00+08:00`, completedSessions: sessions.slice(0, 240),
      signalSession: signal, signalCloseAt: `${signal}T13:30:00+08:00`, nextSession: next,
      nextOpenAt: `${next}T09:00:00+08:00`, nextCloseAt: `${next}T13:30:00+08:00` },
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: signal, adjustmentVersion: 'fixture-adjustment',
      adjustmentEvidenceHash: 'b'.repeat(64), status: 'verified' },
    formalEligibility: { state: mode === 'blocked' ? 'blocked' : 'eligible', policyVersion: 'existing-gate-v1',
      reasonCodes: mode === 'blocked' ? ['market_gate'] : [] }, liquidityVerified: true };
  if (mode === 'expired') input.availableAt = input.computedAt = `${next}T14:00:00+08:00`;
  if (mode === 'insufficient') {
    input.bars = []; input.calendar = null; input.priceBasis = null; input.missingData = ['official_adjustment_chain_missing'];
  }
  const base = { stock_id: `fixture-${symbol}`, session_date: signal, available_at: input.availableAt, provenance: { existing: 'retained' } };
  const bundle = buildTwEntryPlans(input);
  const savedRevision = { ...base, ...bindCandidateTradePlan(base, bundle) };
  const outcome = createSavedOutcome({ symbol, savedRevision });
  const card = { symbol, detailRevisionId: savedRevision.id, tradePlanSummary: savedRevision.provenance.trade_plan_summary };
  return { outcome, card, savedRevision, bundle };
}

test('whole-roster conservation keeps saved data gaps separate from evaluated and usable research zones', () => {
  const eligible = fixture('2330', 'conditional'); const blocked = fixture('2303'); const insufficient = fixture('2409', 'insufficient');
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2409', '2330', '2303'],
    outcomes: [eligible.outcome, blocked.outcome, insufficient.outcome] });
  assert.equal(coverage.complete, true); assert.equal(coverage.accountedForAll, true);
  assert.equal(coverage.expectedCount, 3); assert.equal(coverage.processedCount, 3);
  assert.equal(coverage.evaluatedCount, 2); assert.equal(coverage.dataInsufficientCount, 1);
  assert.equal(coverage.usablePlanCount, 1); assert.equal(coverage.savedCount, 3);
  assert.equal(coverage.validationStatus, 'research_only');
  assert.deepEqual(coverage.records.map(({ symbol, status, usablePlan }) => ({ symbol, status, usablePlan })), [
    { symbol: '2303', status: 'evaluated', usablePlan: false }, { symbol: '2330', status: 'evaluated', usablePlan: true },
    { symbol: '2409', status: 'data_insufficient', usablePlan: false },
  ]);
  assert.ok(coverage.records[2].reasonCodes.includes('official_adjustment_chain_missing'));
});

test('waiting, blocked, avoid-chase and expired are complete evaluations without usable zones', () => {
  for (const mode of ['waiting', 'blocked', 'avoid_chase', 'expired'] as const) {
    const { outcome, bundle } = fixture('2330', mode);
    assert.equal(bundle.plans[0].planState, mode === 'waiting' ? 'waiting_confirmation' : mode);
    const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
    assert.equal(coverage.complete, true, mode); assert.equal(coverage.evaluatedCount, 1, mode);
    assert.equal(coverage.unavailableCount, 0, mode); assert.equal(coverage.usablePlanCount, 0, mode);
  }
});

test('typed failures account for stocks but cannot complete coverage', () => {
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330', '2303'], outcomes: [
    { symbol: '2330', status: 'failed', reasonCodes: ['detail_write_failed'] },
    { symbol: '2303', status: 'unavailable', reasonCodes: ['trade_plan_not_published'] },
  ] });
  assert.equal(coverage.accountedForAll, true); assert.equal(coverage.complete, false);
  assert.equal(coverage.failedCount, 1); assert.equal(coverage.unavailableCount, 1);
  assert.equal(coverage.savedCount, 0); assert.equal(coverage.usablePlanCount, 0);
});

test('saved success flags cannot substitute for exact immutable envelope bindings', () => {
  const { savedRevision } = fixture();
  for (const patch of [{ id: 'old-revision' }, { provenance: {} }, { session_date: '2020-01-01' },
    { available_at: '2020-01-01T00:00:00Z' }]) {
    const outcome = createSavedOutcome({ symbol: '2330', savedRevision: { ...savedRevision, ...patch } });
    const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
    assert.equal(coverage.accountedForAll, true); assert.equal(coverage.complete, false);
    assert.equal(coverage.unavailableCount, 1); assert.deepEqual(coverage.publicationBindings, []);
    assert.deepEqual(coverage.records[0].reasonCodes, ['saved_trade_plan_invalid_or_missing']);
  }
});

test('missing and duplicate outcomes cannot silently disappear or be deduplicated as successful retries', () => {
  const { outcome } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330', '2303', '2409'], outcomes: [outcome, outcome,
    { symbol: '2409', status: 'failed', reasonCodes: ['persist_failed'] }] });
  assert.equal(coverage.complete, false); assert.equal(coverage.accountedForAll, false);
  assert.deepEqual(coverage.missingSymbols, ['2303']); assert.deepEqual(coverage.duplicateSymbols, ['2330']);
  assert.equal(coverage.expectedUniqueCount, coverage.processedCount + coverage.unresolvedCount + coverage.duplicateCount);
  assert.equal(coverage.usablePlanCount, 0); assert.deepEqual(coverage.publicationBindings, []);
});

test('duplicate expected entries, unexpected outcomes and invalid symbols are reported, never normalized away', () => {
  const { outcome } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330', '2330', ' 2303'], outcomes: [outcome,
    { symbol: '2409', status: 'failed', reasonCodes: [] },
    { symbol: 'TSM', status: 'failed', reasonCodes: [] },
  ] });
  assert.equal(coverage.complete, false); assert.equal(coverage.expectedCount, 3); assert.equal(coverage.expectedUniqueCount, 1);
  assert.deepEqual(coverage.duplicateExpectedSymbols, ['2330']); assert.deepEqual(coverage.unexpectedSymbols, ['2409']);
  assert.deepEqual(coverage.invalidExpectedIndexes, [2]); assert.deepEqual(coverage.invalidOutcomeIndexes, [2]);
});

test('input order does not change valid coverage or its deterministic publication bindings', () => {
  const one = fixture('2330'); const two = fixture('2303', 'insufficient');
  const forward = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330', '2303'], outcomes: [one.outcome, two.outcome] });
  const reverse = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2303', '2330'], outcomes: [two.outcome, one.outcome] });
  assert.deepEqual(forward, reverse);
});

test('empty work is explicitly empty with zero plans; an unexpected outcome prevents completion', () => {
  const empty = reconcileCandidateTradePlanCoverage({ expectedSymbols: [], outcomes: [] });
  assert.equal(empty.complete, true); assert.equal(empty.accountedForAll, true); assert.equal(empty.status, 'empty');
  assert.equal(empty.evaluatedCount, 0); assert.equal(empty.usablePlanCount, 0);
  assert.equal(reconcileCandidateTradePlanCoverage({ expectedSymbols: [], outcomes: [fixture().outcome] }).complete, false);
});

test('aggregate summary is bounded data-only counts; invalid runtime outcomes and oversize rosters fail closed', () => {
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [fixture().outcome] });
  const serialized = JSON.stringify(coverage.summary);
  assert.ok(Buffer.byteLength(serialized) < 1000);
  for (const privateKey of ['records', 'publicationBindings', 'ohlcv', 'sourceRef', 'envelope']) assert.equal(serialized.includes(privateKey), false);
  assert.equal('summary' in coverage.records[0], false);
  const invalid = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'],
    outcomes: [null, { symbol: '2330', status: 'success' }] as unknown as CandidateTradePlanCoverageOutcome[] });
  assert.equal(invalid.complete, false); assert.equal(invalid.invalidOutcomeCount, 2); assert.equal(invalid.missingCount, 1);
  assert.throws(() => reconcileCandidateTradePlanCoverage({ expectedSymbols: Array(20_001).fill('2330'), outcomes: [] }), RangeError);
});

test('publication accepts only current saved summaries and respects existing filters and non-Taiwan cards', () => {
  const one = fixture('2330'); const two = fixture('2409', 'insufficient');
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330', '2409'], outcomes: [one.outcome, two.outcome] });
  const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [one.card, { symbol: 'NVDA' }] });
  assert.equal(result.complete, true); assert.equal(result.matchedCount, 1); assert.equal(result.ignoredCardCount, 1);
  assert.equal(reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [two.card] }).complete, true);
  assert.equal(reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [] }).complete, true);
});

test('publication rejects old latest revisions, missing summaries and valid-shaped but changed summaries', () => {
  const { outcome, card } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
  const changed = structuredClone(coverage.publicationBindings[0].summary); changed.inputHash = 'c'.repeat(64);
  const cases = [
    { card: { ...card, detailRevisionId: 'previous-latest-revision' }, reason: 'card_revision_not_from_current_run' },
    { card: { ...card, tradePlanSummary: null }, reason: 'card_trade_plan_summary_missing_or_invalid' },
    { card: { ...card, tradePlanSummary: changed }, reason: 'card_trade_plan_summary_mismatch' },
  ];
  for (const example of cases) {
    const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [example.card] });
    assert.equal(result.complete, false); assert.equal(result.matchedCount, 0);
    assert.deepEqual(result.mismatches, [{ symbol: '2330', reason: example.reason }]);
  }
});

test('found and waiting buckets may display the same saved stock without duplicating research outcomes', () => {
  const { outcome, card } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
  const found = [card]; const waiting = [structuredClone(card)];
  const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [...found, ...waiting] });
  assert.equal(result.complete, true); assert.equal(result.matchedCount, 2); assert.equal(result.matchedSymbolCount, 1);
  assert.deepEqual(result.mismatches, []); assert.equal(coverage.processedCount, 1);
});

test('every cross-bucket copy must match; revision or summary drift cannot hide behind a valid card', () => {
  const { outcome, card } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
  const changed = structuredClone(coverage.publicationBindings[0].summary); changed.inputHash = 'c'.repeat(64);
  for (const [drift, reason] of [
    [{ ...card, detailRevisionId: 'previous-revision' }, 'card_revision_not_from_current_run'],
    [{ ...card, tradePlanSummary: changed }, 'card_trade_plan_summary_mismatch'],
    [{ ...card, tradePlanSummary: null }, 'card_trade_plan_summary_missing_or_invalid'],
  ] as const) {
    for (const cards of [[card, drift], [drift, card]]) {
      const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards });
      assert.equal(result.complete, false); assert.equal(result.matchedCount, 1); assert.equal(result.matchedSymbolCount, 0);
      assert.deepEqual(result.mismatches, [{ symbol: '2330', reason }]);
    }
  }
});

test('outside-roster Taiwan cards still block publication even alongside valid cross-bucket copies', () => {
  const { outcome, card } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [outcome] });
  const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [card, card, { symbol: '2409' }] });
  assert.equal(result.complete, false); assert.equal(result.matchedCount, 2); assert.equal(result.matchedSymbolCount, 1);
  assert.deepEqual(result.mismatches, [{ symbol: '2409', reason: 'card_not_in_research_roster' }]);
});

test('incomplete research prevents publication even with no cards; missing saved binding cannot be supplied by a card', () => {
  const { card } = fixture();
  const coverage = reconcileCandidateTradePlanCoverage({ expectedSymbols: ['2330'], outcomes: [] });
  const noCards = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [] });
  assert.equal(noCards.complete, false); assert.equal(noCards.coverageComplete, false);
  const result = reconcilePublishedCandidateTradePlanCoverage({ coverage, cards: [card] });
  assert.equal(result.complete, false);
  assert.deepEqual(result.mismatches, [{ symbol: null, reason: 'research_coverage_incomplete' },
    { symbol: '2330', reason: 'current_run_saved_binding_missing_or_duplicate' }]);
});
