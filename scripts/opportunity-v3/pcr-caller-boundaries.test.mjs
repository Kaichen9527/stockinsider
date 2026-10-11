import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const { buildFactorSnapshot } = require('../runtime/factor-snapshot.js');
const { calculateFactorScore } = require('../runtime/factor-score.js');
const { evaluateComparableRun } = require('../runtime/comparable-evaluation.js');
const { deriveTechnicalEntryState } = require('../runtime/technical-state.js');

function history(count) {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index / 20 + Math.sin(index / 3);
    return { session: new Date(Date.UTC(2020, 0, index + 1)).toISOString(),
      open: close - 0.2, high: close + 1, low: close - 1, close, volume: 1000 };
  });
}

function snapshotInput(count = 371) {
  const roster = Array.from({ length: 8 }, (_, index) => ({ stockId: `peer-${index}`, sector: 'panels' }));
  return { stockId: 'subject', history: history(count), asOf: '2030-01-01T00:00:00Z', roster,
    histories: roster.map(({ stockId }) => ({ stockId, rows: history(20) })) };
}

test('PCR-018 entry-state caller calculates and consumes the actual adjusted price plane', () => {
  const rows = history(130);
  const input = { rows, benchmark: rows, asOf: '2030-01-01T00:00:00Z' };
  assert.equal(Object.hasOwn(input, 'plane'), false);
  const state = deriveTechnicalEntryState(input);
  assert.equal(state.availability, 'available');
  assert.equal(state.plane.current, rows.at(-1).close);
  assert.equal(state.plane.previousClose, rows.at(-2).close);
  assert.equal(state.plane.ma20, rows.slice(-20).reduce((sum, row) => sum + row.close, 0) / 20);
  assert.equal(state.plane.relativeStrengthTaiex20, 0);
  assert.equal(state.plane.atr14, 2);
  assert.ok(Number.isFinite(state.plane.macdHistogram));
  assert.equal(deriveTechnicalEntryState({ ...input, benchmark: [] }).plane.reason, 'taiex_reference_unavailable');
  assert.equal(deriveTechnicalEntryState({ ...input, rows: rows.slice(-121) }).plane.reason,
    'insufficient_adjusted_history');
  const future = { ...rows.at(-1), session: '2031-01-01T00:00:00Z' };
  assert.equal(deriveTechnicalEntryState({ ...input, rows: [...rows, future] }).plane.reason, 'future_observation');
});

test('PCR-025 caller returns bounded history or the actual unavailable reason', () => {
  const insufficient = buildFactorSnapshot(snapshotInput(370));
  assert.equal(insufficient.availability, 'unavailable');
  assert.equal(insufficient.reason, 'insufficient_own_history');
  assert.equal(insufficient.manifest, undefined);
  const available = buildFactorSnapshot(snapshotInput());
  assert.equal(available.availability, 'available');
  assert.equal(available.own.endpointCount, 252);
  assert.equal(available.own.current.session, history(371).at(-1).session);
  const future = snapshotInput();
  future.history.push({ ...future.history.at(-1), session: '2031-01-01T00:00:00Z', close: 999 });
  assert.deepEqual(buildFactorSnapshot(future), available, 'post-cutoff data cannot change the caller result');
  assert.equal(buildFactorSnapshot(snapshotInput(878)).reason, 'bias_selection_bound_violation');
});

test('PCR-026 caller retains the roster manifest and rejects invalid universe inputs', () => {
  const input = snapshotInput();
  const result = buildFactorSnapshot(input);
  assert.equal(result.availability, 'available');
  assert.equal(result.manifest.roster.length, 8);
  assert.equal(result.manifest.sectors.panels.count, 8);
  assert.equal(result.manifest.sectors.panels.availability, 'available');
  assert.equal(result.manifest.histories.length, 8);
  assert.ok(Object.isFrozen(result));
  assert.equal(buildFactorSnapshot({ ...input, roster: [...input.roster, input.roster[0]] }).reason,
    'invalid_bias_roster');
  const excessive = Array.from({ length: 20001 }, (_, index) => ({ stockId: `stock-${index}` }));
  assert.equal(buildFactorSnapshot({ ...input, roster: excessive }).reason, 'bias_roster_exceeds_cap');
});

test('PCR-029 caller derives research eligibility from available quality and keeps BIAS unpromoted', () => {
  const eligible = calculateFactorScore({ roicScore: 50, growthScore: 50, marginScore: 50 });
  assert.equal(eligible.availableWeight, 0.65);
  assert.equal(eligible.score, 50);
  assert.equal(eligible.qualityActionEligible, true);
  assert.equal(eligible.eligibleForDeepResearch, true);
  assert.equal(eligible.biasPromotedWeight, 0);
  assert.equal(calculateFactorScore({ roicScore: 49, growthScore: 49, marginScore: 49 }).eligibleForDeepResearch, false);
  assert.equal(calculateFactorScore({ roicScore: 100, growthScore: 100 }).eligibleForDeepResearch, false);
  const missing = calculateFactorScore({});
  assert.equal(missing.reason, 'missing_fundamental_quality_facts');
  assert.equal(missing.eligibleForDeepResearch, false);
  assert.equal(missing.score, null);
});

test('PCR-031 caller preserves shadow rows and changes identity when the factor contract changes', () => {
  const input = { asOf: '2026-08-01', universeManifestHash: 'a'.repeat(64), rows: [{ symbol: '2409', loss: -1 }] };
  const original = evaluateComparableRun(input);
  assert.equal(original.state, 'shadow_only');
  assert.deepEqual(original.rows, input.rows);
  assert.equal(original.identity.asOf, input.asOf);
  assert.equal(original.identity.universeManifestHash, input.universeManifestHash);
  assert.equal(original.identity.staticIdentityMembers.length, 41);
  const changed = evaluateComparableRun({ ...input, factorContractVersion: 'experiment-v2' });
  assert.notEqual(changed.identity.comparisonContractKey, original.identity.comparisonContractKey);
  assert.notEqual(changed.identity.identityHash, original.identity.identityHash);
  assert.deepEqual(changed.rows, original.rows, 'identity changes cannot discard losing rows');
  assert.throws(() => evaluateComparableRun({ ...input,
    staticIdentityOverrides: { factorCorrectnessContractVersion: null } }), /invalid static identity/u);
});
