import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { bindCandidateTradePlan, candidateTradePlanSummary, readCandidateTradePlan, readCandidateTradePlanSummary,
  type CandidateTradePlanEnvelope } from './candidate-trade-plan.ts';
import { buildTwEntryPlans } from './tw-entry-plan.ts';
import type { TwEntryPlanInput } from './tw-entry-plan-contract.ts';

function fixture() {
  const sessions = Array.from({ length: 241 }, (_, index) => new Date(Date.UTC(2025, 0, index + 1)).toISOString().slice(0, 10));
  const signal = sessions[239]; const next = sessions[240];
  const bars = sessions.slice(0, 240).map((session, index) => {
    const close = Number((50 + index * 0.1).toFixed(1));
    return { session, open: close, high: Number((close + 0.2).toFixed(1)), low: Number((close - 0.2).toFixed(1)),
      close, volume: 1000, availableAt: `${session}T14:00:00+08:00`, sourceRef: `fixture:${session}` };
  });
  Object.assign(bars[239], { close: 74.1, high: 74.2, volume: 1500 });
  const input: TwEntryPlanInput = { symbol: '2330', candidateRevisionId: 'unbound', computedAt: `${signal}T15:00:00+08:00`,
    availableAt: `${signal}T15:00:00+08:00`, dataAsOf: `${signal}T14:00:00+08:00`, sourceDatasetRevision: 'verified-fixture-revision', bars,
    calendar: { version: 'fixture-calendar', knownAt: `${signal}T14:00:00+08:00`, completedSessions: sessions.slice(0, 240),
      signalSession: signal, signalCloseAt: `${signal}T13:30:00+08:00`, nextSession: next,
      nextOpenAt: `${next}T09:00:00+08:00`, nextCloseAt: `${next}T13:30:00+08:00` },
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: signal, adjustmentVersion: 'fixture-adjustment',
      adjustmentEvidenceHash: 'b'.repeat(64), status: 'verified' },
    formalEligibility: { state: 'blocked', policyVersion: 'existing-gate-v1', reasonCodes: ['market_gate'] }, liquidityVerified: true };
  const base = { stock_id: 'fixture-stock-id', session_date: signal, available_at: input.availableAt,
    title: 'Existing research', valuation: { currentPrice: 74.1 }, provenance: { retained: { policy: 'existing-policy' } } };
  const bound = bindCandidateTradePlan(base, buildTwEntryPlans(input));
  const envelope = bound.provenance.trade_plan as CandidateTradePlanEnvelope;
  const context = { revisionId: bound.id, symbol: input.symbol, sessionDate: signal, availableAt: input.availableAt };
  return { input, base, bound, envelope, context };
}
function rehash(envelope: CandidateTradePlanEnvelope) {
  const canonical = (value: unknown): string => value === null || typeof value !== 'object' ? JSON.stringify(value)
    : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
      : `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, member]) => `${JSON.stringify(key)}:${canonical(member)}`).join(',')}}`;
  envelope.bundleHash = createHash('sha256').update(canonical(envelope.bundle)).digest('hex');
  return envelope;
}

test('P1-06: immutable binding preserves base provenance and seals the exact detail revision', () => {
  const { base, bound, envelope, context } = fixture();
  assert.match(bound.id, /^[a-f0-9]{8}-[a-f0-9]{4}-8[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u);
  assert.match(bound.revision_hash, /^[a-f0-9]{64}$/u);
  assert.deepEqual(bound.provenance.retained, base.provenance.retained);
  const read = readCandidateTradePlan(envelope, context);
  assert.ok(read); assert.equal(read.candidateRevisionId, bound.id);
  assert.ok(read.plans.every((plan) => plan.candidateRevisionId === bound.id));
  assert.equal(read.plans[0].rawSignalState, 'confirmed'); assert.equal(read.plans[0].planState, 'blocked');
  read.plans[0].reasonCodes.push('local-mutation');
  assert.equal(envelope.bundle.plans[0].reasonCodes.includes('local-mutation'), false, 'reader returns isolated data');
});

test('P1-06: hash corruption, wrong revision, stock, session or publication time fails closed', () => {
  const { envelope, context } = fixture();
  const corrupt = structuredClone(envelope); corrupt.bundle.plans[0].entryUpper = 999;
  assert.equal(readCandidateTradePlan(corrupt, context), null);
  for (const change of [{ revisionId: 'other-revision' }, { symbol: '2303' }, { sessionDate: '2025-01-01' },
    { availableAt: '2025-01-01T00:00:00Z' }]) assert.equal(readCandidateTradePlan(envelope, { ...context, ...change }), null);
  assert.equal(readCandidateTradePlan({ ...envelope, bundleHash: '0'.repeat(64) }, context), null);
});

test('P1-06/P1-08: rehashed invalid geometry, authority or research status cannot masquerade as a valid plan', () => {
  const { envelope, context } = fixture();
  const invalidStop = structuredClone(envelope);
  invalidStop.bundle.plans[0].invalidationPrice = invalidStop.bundle.plans[0].entryLower;
  invalidStop.bundle.plans[0].exitPolicy.initialRiskLine = invalidStop.bundle.plans[0].entryLower;
  assert.equal(readCandidateTradePlan(rehash(invalidStop), context), null);
  const invalidAuthority = structuredClone(envelope);
  invalidAuthority.bundle.plans[0].planState = 'conditional';
  assert.equal(readCandidateTradePlan(rehash(invalidAuthority), context), null);
  const invalidBasis = structuredClone(envelope); invalidBasis.bundle.plans[0].priceBasis!.status = 'missing';
  assert.equal(readCandidateTradePlan(rehash(invalidBasis), context), null);
  const invalidIdentity = structuredClone(envelope); invalidIdentity.bundle.plans[0].planId = 'tw-entry-plan:forged';
  assert.equal(readCandidateTradePlan(rehash(invalidIdentity), context), null);
  const privateCandle = structuredClone(envelope);
  Object.assign(privateCandle.bundle.ohlcv[0], { sourceRef: 'unexpected-private-reference' });
  assert.equal(readCandidateTradePlan(rehash(privateCandle), context), null);
});

test('P1-09: identical retries keep revision identity while changed research metadata creates new lineage', () => {
  const { input, base, bound, envelope } = fixture();
  assert.deepEqual(bindCandidateTradePlan(base, buildTwEntryPlans(input)), bound);
  assert.deepEqual(bindCandidateTradePlan({ ...base, ...bound }, envelope.bundle), bound);
  const reboundInput = { ...input, candidateRevisionId: 'different-placeholder' };
  assert.equal(bindCandidateTradePlan(base, buildTwEntryPlans(reboundInput)).id, bound.id);
  const changed = bindCandidateTradePlan({ ...base, title: 'Updated research evidence' }, buildTwEntryPlans(input));
  assert.notEqual(changed.id, bound.id); assert.notEqual(changed.revision_hash, bound.revision_hash);
  const newEnvelope = changed.provenance.trade_plan as CandidateTradePlanEnvelope;
  assert.equal(newEnvelope.bundle.plans[0].planId, envelope.bundle.plans[0].planId, 'rebinding is not an extra trading signal');
});

test('P1-09: old absent attachments and future contract versions stay unsupported', () => {
  const { envelope, context } = fixture();
  assert.equal(readCandidateTradePlan(undefined, context), null);
  assert.equal(readCandidateTradePlan(null, context), null);
  assert.equal(readCandidateTradePlan({}, context), null);
  const future = structuredClone(envelope); Object.assign(future.bundle, { schemaVersion: 'future-v99' });
  assert.equal(readCandidateTradePlan(rehash(future), context), null);
});

test('P1-06/P1-10: summary is a bounded revision-bound projection with no candles or prices', () => {
  const { bound, envelope } = fixture();
  const raw = bound.provenance.trade_plan_summary;
  const summary = readCandidateTradePlanSummary(raw, { revisionId: bound.id });
  assert.ok(summary); assert.equal(summary.inputHash, envelope.bundle.inputHash);
  assert.equal(summary.plans[0].rawSignalState, envelope.bundle.plans[0].rawSignalState);
  assert.equal(summary.plans[0].planState, envelope.bundle.plans[0].planState);
  assert.equal('ohlcv' in summary, false); assert.equal('entryLower' in summary.plans[0], false);
  assert.equal(readCandidateTradePlanSummary(raw, { revisionId: 'other-revision' }), null);
  assert.equal(readCandidateTradePlanSummary({ ...summary, ohlcv: [] }, { revisionId: bound.id }), null);
});

test('P1-05: missing authority can be published as explicit insufficient data without invented candles', () => {
  const { input, base } = fixture(); input.bars = []; input.calendar = null; input.priceBasis = null;
  input.missingData = ['official_adjustment_chain_missing'];
  const bound = bindCandidateTradePlan(base, buildTwEntryPlans(input));
  const read = readCandidateTradePlan(bound.provenance.trade_plan, { revisionId: bound.id, symbol: input.symbol,
    sessionDate: base.session_date, availableAt: base.available_at });
  assert.ok(read); assert.equal(read.ohlcv.length, 0);
  assert.equal(read.plans[0].rawSignalState, 'data_insufficient');
  assert.ok(read.plans[0].missingData.includes('official_adjustment_chain_missing'));
});

test('P1-10: worst-case reasons remain under the 1800-byte summary budget without truncating codes', () => {
  const { envelope } = fixture(); const bundle = structuredClone(envelope.bundle);
  for (const plan of bundle.plans) {
    plan.reasonCodes = Array.from({ length: 256 }, (_, index) => `reason-${index}-${'x'.repeat(85)}`);
    plan.reasonCodes.unshift('long-code-' + 'x'.repeat(500));
    plan.eligibility.reasonCodes = [...plan.reasonCodes];
    plan.eligibility.policyVersion = 'p'.repeat(512); plan.policyVersion = 'p'.repeat(512);
  }
  const summary = candidateTradePlanSummary(bundle);
  assert.ok(Buffer.byteLength(JSON.stringify(summary)) <= 1800);
  assert.ok(summary.plans.every((plan) => plan.reasonCodes.length <= 2 && plan.eligibility.reasonCodes.length <= 2));
  for (const [index, compact] of summary.plans.entries()) {
    assert.equal(compact.eligibility.policyVersion, bundle.plans[index].policyVersion);
    assert.ok(compact.reasonCodes.every((code) => bundle.plans[index].reasonCodes.includes(code)));
  }
  assert.ok(readCandidateTradePlanSummary(summary, { revisionId: bundle.candidateRevisionId }));
  assert.equal(bundle.plans[0].reasonCodes.length, 257, 'detail reasons remain untouched');
});
