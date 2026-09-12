import assert from 'node:assert/strict';
import test from 'node:test';
import { assessContaboCapacity, GIB } from './contabo-capacity-guard.mjs';
const now = Date.parse('2026-09-10T03:00:00Z');
const input = {
  observedAt: new Date(now).toISOString(), availableBytes: 26 * GIB,
  databaseRestoreBytes: 4 * GIB, documentBytes: GIB / 8, peakWalBytes: GIB,
  peakTemporaryBytes: 2 * GIB, deploymentBytes: GIB / 2, localBackupStagingBytes: 0,
  growthReserveBytes: 2 * GIB,
};
test('all simultaneous allocations count toward the required reserve', () => {
  const result = assessContaboCapacity(input, now);
  assert.equal(result.additionalPeakBytes, 9.625 * GIB);
  assert.equal(result.projectedAvailableBytes, 16.375 * GIB);
  assert.equal(result.allowed, true);
  assert.equal(result.disposition, 'warning');
  assert.equal(assessContaboCapacity({ ...input, availableBytes: 21 * GIB }, now).allowed, false);
});
test('reserve equality is allowed but one byte short is blocked', () => {
  assert.equal(assessContaboCapacity({ ...input, availableBytes: 24.625 * GIB }, now).allowed, true);
  assert.equal(assessContaboCapacity({ ...input, availableBytes: 24.625 * GIB - 1 }, now).allowed, false);
});
test('unknown budgets never silently become zero', () => {
  for (const key of Object.keys(input).filter((key) => key !== 'observedAt')) {
    for (const invalid of [undefined, null, -1, NaN, Infinity, '100', 0.5]) {
      assert.equal(assessContaboCapacity({ ...input, [key]: invalid }, now).allowed, false);
    }
  }
  assert.equal(assessContaboCapacity(null, now).allowed, false);
});
test('stale and future measurements fail closed, not as deploy-ready', () => {
  for (const timestamp of [now - 300_001, now + 1, NaN]) {
    const observedAt = Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : 'invalid';
    assert.equal(assessContaboCapacity({ ...input, observedAt }, now).allowed, false);
  }
  assert.equal(assessContaboCapacity({ ...input, availableBytes: Number.MAX_SAFE_INTEGER,
    databaseRestoreBytes: Number.MAX_SAFE_INTEGER }, now).allowed, false);
});
