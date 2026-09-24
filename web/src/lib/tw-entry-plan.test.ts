import assert from 'node:assert/strict';
import test from 'node:test';
import { buildTwEntryPlans, nextTwEntryPrice, roundTwEntryPrice, twEntryTick } from './tw-entry-plan.ts';
import type { TwEntryPlanInput } from './tw-entry-plan-contract.ts';

function fixture(count = 240): TwEntryPlanInput {
  const sessions: string[] = [];
  const day = new Date('2025-01-01T00:00:00Z');
  while (sessions.length < count + 1) {
    if (![0, 6].includes(day.getUTCDay())) sessions.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  const signalSession = sessions[count - 1]; const nextSession = sessions[count];
  const bars = sessions.slice(0, count).map((session, index) => {
    const close = Number((50 + index * 0.1).toFixed(1));
    return { session, open: Number((close - 0.1).toFixed(1)), high: Number((close + 0.2).toFixed(1)),
      low: Number((close - 0.2).toFixed(1)), close, volume: 1000,
      availableAt: `${session}T14:00:00+08:00`, sourceRef: `fixture-official:${session}` };
  });
  const priorResistance = Math.max(...bars.slice(-21, -1).map((bar) => bar.high));
  bars[count - 1] = { ...bars[count - 1], open: priorResistance, high: Number((priorResistance + 0.2).toFixed(1)),
    low: Number((priorResistance - 0.3).toFixed(1)), close: Number((priorResistance + 0.1).toFixed(1)), volume: 1500 };
  return { symbol: '2330', candidateRevisionId: 'fixture-candidate-revision-1',
    computedAt: `${signalSession}T14:15:00+08:00`, availableAt: `${signalSession}T14:10:00+08:00`,
    dataAsOf: `${signalSession}T13:30:00+08:00`, sourceDatasetRevision: 'fixture-official-dataset-1', bars,
    calendar: { version: 'fixture-calendar-1', knownAt: `${signalSession}T13:30:00+08:00`,
      completedSessions: sessions.slice(0, count), signalSession, signalCloseAt: `${signalSession}T13:30:00+08:00`,
      nextSession, nextOpenAt: `${nextSession}T09:00:00+08:00`, nextCloseAt: `${nextSession}T13:30:00+08:00` },
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: signalSession, adjustmentVersion: 'fixture-adjustment-v1',
      adjustmentEvidenceHash: 'a'.repeat(64), status: 'verified' },
    formalEligibility: { state: 'eligible', reasonCodes: [], policyVersion: 'unchanged-formal-gates-v1' }, liquidityVerified: true };
}
const plan = (input: TwEntryPlanInput, strategy = 'breakout') => buildTwEntryPlans(input).plans.find((entry) => entry.strategyId === strategy)!;

test('P1-01: prior20 excludes the signal high and its exactly 1.5x volume', () => {
  const input = fixture(); const before = structuredClone(input);
  const bundle = buildTwEntryPlans(input); const breakout = bundle.plans[0];
  assert.equal(breakout.rawSignalState, 'confirmed');
  assert.equal(breakout.planState, 'conditional');
  assert.equal(breakout.entryLower, 74.1);
  assert.equal(bundle.structures.find((row) => row.kind === 'prior20_resistance')?.anchorValue, 74);
  assert.equal(breakout.validationStatus, 'research_only');
  assert.equal(breakout.technicalTarget, null);
  assert.deepEqual(input, before, 'pure engine must not mutate producer inputs');
  assert.equal(bundle.ohlcv.length, 240);
  assert.equal('sourceRef' in bundle.ohlcv[0], false, 'public candles do not expose authority identifiers');
  assert.equal(bundle.ohlcv[18].ma20, null);
  assert.ok(bundle.ohlcv[19].ma20);
});

test('P1-02: a confirmed signal retains unchanged formal market/overseas blockers', () => {
  const input = fixture(); input.formalEligibility = { state: 'blocked', policyVersion: 'existing-policy',
    reasonCodes: ['negative_overseas_peer_catchdown', 'market_risk_off_blocks_new_actionable'] };
  const output = plan(input);
  assert.equal(output.rawSignalState, 'confirmed'); assert.equal(output.planState, 'blocked');
  assert.equal(output.eligibility.state, 'blocked');
  assert.deepEqual(output.eligibility.reasonCodes, [...input.formalEligibility.reasonCodes].sort());
  assert.equal(output.entryLower, 74.1, 'blocked plan preserves inspectable research geometry');
});

test('P1-03: a touch without stabilization never confirms a pullback', () => {
  const input = fixture(); const last = input.bars.at(-1)!;
  Object.assign(last, { open: 73.1, close: 73.2, high: 73.8, low: 72.7, volume: 1000 });
  const output = plan(input, 'pullback');
  assert.equal(output.rawSignalState, 'waiting'); assert.equal(output.entryLower, null);
  assert.ok(output.reasonCodes.includes('pullback_stabilization_not_confirmed'));
});

test('P1-03: a stabilized uptrend pullback produces a bounded current-scale research zone', () => {
  const input = fixture();
  Object.assign(input.bars.at(-2)!, { open: 72.7, high: 72.9, low: 72.4, close: 72.6 });
  Object.assign(input.bars.at(-1)!, { open: 72.8, high: 73.5, low: 72.7, close: 73.3, volume: 1000 });
  const output = plan(input, 'pullback');
  assert.equal(output.rawSignalState, 'confirmed'); assert.equal(output.planState, 'conditional');
  assert.equal(output.entryLower, 73.3); assert.ok(output.entryUpper! >= output.entryLower!);
  assert.ok(output.invalidationPrice! < output.entryLower!);
  assert.equal(output.exitPolicy.initialRiskLine, output.invalidationPrice);
  assert.equal(output.exitPolicy.maximumHoldingSessions, 20);
  assert.equal(output.exitPolicy.context, 'if_entered_under_this_strategy');
});

test('P1-03: a valid breakout that is too far above resistance keeps the signal without a usable entry zone', () => {
  const input = fixture(); Object.assign(input.bars.at(-1)!, { open: 77.9, high: 78.2, low: 77.8, close: 78 });
  const output = plan(input);
  assert.equal(output.rawSignalState, 'confirmed'); assert.equal(output.planState, 'avoid_chase');
  assert.ok(output.reasonCodes.includes('signal_above_no_chase_limit'));
  assert.equal(output.entryLower, null); assert.equal(output.entryUpper, null); assert.equal(output.invalidationPrice, null);
  assert.ok(output.noChaseAbove! < 78);
});

test('P1-03: tick rounding that leaves U below L cannot publish an entry zone', () => {
  const input = fixture();
  // Historical adjusted prices may fall between raw-market ticks. A tiny
  // trading range produces a genuine signal but insufficient room for one tick.
  input.bars.forEach((bar, index) => {
    const close = 50 + index * 0.0001;
    Object.assign(bar, { open: close, close, high: close + 0.0001, low: close - 0.0001 });
  });
  Object.assign(input.bars.at(-1)!, { open: 50.1, close: 50.1, high: 50.1, low: 50.1, volume: 1500 });
  const output = plan(input);
  assert.equal(output.rawSignalState, 'confirmed'); assert.equal(output.planState, 'avoid_chase');
  assert.ok(output.reasonCodes.includes('invalid_entry_geometry')); assert.equal(output.entryLower, null);
});

test('P1-04: Taiwan ticks use the correct tier on both sides of every boundary', () => {
  for (const [value, expected] of [[9.99, 10], [10, 10.05], [49.95, 50], [50, 50.1], [99.9, 100],
    [100, 100.5], [499.5, 500], [500, 501], [999, 1000], [1000, 1005]]) assert.equal(nextTwEntryPrice(value), expected);
  assert.equal(nextTwEntryPrice(49.98), 50); assert.equal(roundTwEntryPrice(99.99, 'down'), 99.9);
  assert.equal(roundTwEntryPrice(499.9, 'up'), 500); assert.equal(twEntryTick(0), null);
  assert.equal(roundTwEntryPrice(-1, 'down'), null);
});

test('P1-04: only the supplied official next session determines validity across closures', () => {
  const input = fixture(); const next = '2026-01-05';
  Object.assign(input.calendar!, { nextSession: next, nextOpenAt: `${next}T09:00:00+08:00`, nextCloseAt: `${next}T13:30:00+08:00` });
  const output = plan(input);
  assert.equal(output.validFromSession, next); assert.equal(output.expiresAfterSession, next);
  assert.equal(output.expiresAt, `${next}T13:30:00+08:00`);
});

test('P1-04: late knowledge cannot manufacture next-open eligibility; close-time publication is expired', () => {
  const input = fixture(); const next = input.calendar!.nextSession;
  input.availableAt = `${next}T10:00:00+08:00`; input.computedAt = `${next}T10:05:00+08:00`;
  const late = plan(input);
  assert.equal(late.rawSignalState, 'confirmed'); assert.equal(late.planState, 'blocked');
  assert.ok(late.eligibility.reasonCodes.includes('plan_published_after_next_open'));
  input.availableAt = input.calendar!.nextCloseAt; input.computedAt = `${next}T14:00:00+08:00`;
  const expired = plan(input);
  assert.equal(expired.rawSignalState, 'confirmed'); assert.equal(expired.planState, 'expired');
});

test('P1-01/P1-05: insufficient, unfinished, missing-adjustment and conflicting inputs fail closed', () => {
  const cases: Array<[string, (input: TwEntryPlanInput) => void, string]> = [
    ['history', (input) => { input.bars = input.bars.slice(-239); }, 'price_history_below_240'],
    ['unclosed', (input) => { input.availableAt = `${input.calendar!.signalSession}T12:00:00+08:00`; }, 'signal_session_not_completed'],
    ['basis', (input) => { input.priceBasis = null; }, 'corporate_action_basis_unverified'],
    ['conflict', (input) => { input.priceBasis!.status = 'conflict'; }, 'corporate_action_basis_unverified'],
    ['wrong scale', (input) => { input.priceBasis!.anchorSession = '2025-01-01'; }, 'corporate_action_basis_unverified'],
    ['source conflict', (input) => { input.missingData = ['official_source_conflict']; }, 'official_source_conflict'],
    ['calendar', (input) => { input.calendar = null; }, 'calendar_authority_missing'],
  ];
  for (const [label, mutate, expected] of cases) {
    const input = fixture(); mutate(input); const output = buildTwEntryPlans(input);
    assert.ok(output.missingData.includes(expected), label); assert.equal(output.ohlcv.length, 0, label);
    for (const item of output.plans) { assert.equal(item.rawSignalState, 'data_insufficient', label); assert.equal(item.entryLower, null, label); }
  }
});

test('P1-05: official session gaps, duplicate dates, impossible dates, bad OHLC and future observations fail closed', () => {
  const gap = fixture(241); gap.bars.splice(220, 1);
  assert.ok(buildTwEntryPlans(gap).missingData.includes('official_price_session_gap'));
  const duplicate = fixture(); duplicate.bars[20].session = duplicate.bars[19].session;
  assert.ok(buildTwEntryPlans(duplicate).missingData.includes('price_session_sequence_invalid'));
  const impossible = fixture(); impossible.bars[10].session = '2025-02-30';
  assert.ok(buildTwEntryPlans(impossible).missingData.includes('price_session_sequence_invalid'));
  const invalid = fixture(); invalid.bars[12].high = invalid.bars[12].close - 1;
  assert.ok(buildTwEntryPlans(invalid).missingData.includes('invalid_ohlcv'));
  const future = fixture(); future.bars.at(-1)!.session = future.calendar!.nextSession;
  assert.ok(buildTwEntryPlans(future).missingData.includes('future_price_observation'));
  const late = fixture(); late.bars[12].availableAt = late.calendar!.nextOpenAt;
  assert.ok(buildTwEntryPlans(late).missingData.includes('price_provenance_or_knowledge_time_invalid'));
});

test('P1-09: rebind/retry preserves semantic plan identity and frozen knowledge time', () => {
  const input = fixture(); const original = buildTwEntryPlans(input);
  const retry = structuredClone(input); retry.candidateRevisionId = 'new-revision'; retry.computedAt = '2027-01-01T00:00:00Z';
  const replay = buildTwEntryPlans(retry);
  assert.equal(replay.inputHash, original.inputHash); assert.equal(replay.plans[0].planId, original.plans[0].planId);
  assert.equal(replay.plans[0].planState, original.plans[0].planState);
  assert.equal(replay.candidateRevisionId, 'new-revision'); assert.equal(replay.plans[0].computedAt, retry.computedAt);
  const changed = structuredClone(input); changed.bars[0].volume += 1;
  assert.notEqual(buildTwEntryPlans(changed).inputHash, original.inputHash);
  assert.deepEqual(buildTwEntryPlans(input), original);
});

test('missing liquidity/formal authority never changes a technical observation into actionable permission', () => {
  const input = fixture(); input.liquidityVerified = false;
  const output = plan(input);
  assert.equal(output.rawSignalState, 'confirmed'); assert.equal(output.planState, 'blocked');
  assert.equal(output.eligibility.state, 'unavailable'); assert.ok(output.reasonCodes.includes('liquidity_not_verified'));
  input.liquidityVerified = true; input.formalEligibility.reasonCodes = ['contradictory_eligible'];
  assert.equal(plan(input).eligibility.state, 'unavailable');
});

test('zero-volume history cannot provide a breakout denominator and input size is bounded', () => {
  const input = fixture(); input.bars.slice(-21, -1).forEach((bar) => { bar.volume = 0; });
  assert.ok(buildTwEntryPlans(input).missingData.includes('prior20_volume_unavailable'));
  const overflow = fixture(); overflow.bars = Array(2001).fill(overflow.bars[0]);
  assert.throws(() => buildTwEntryPlans(overflow), /tw_entry_plan_input_bound/u);
});
