import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHostResources, parseMeminfo } from './contabo-host-resource-check.mjs';
import { GIB } from './contabo-capacity-guard.mjs';

const now = Date.parse('2026-09-11T00:00:00Z');
const capacity = { observedAt: new Date(now).toISOString(), availableBytes: 26 * GIB,
  databaseRestoreBytes: 4 * GIB, documentBytes: 0, peakWalBytes: GIB,
  peakTemporaryBytes: GIB, deploymentBytes: GIB, localBackupStagingBytes: 0,
  growthReserveBytes: GIB };

test('disk and memory reserves must both survive the planned peak', () => {
  const ready = assessHostResources({ capacity: { ...capacity, availableBytes: 27 * GIB }, availableMemoryBytes: 4 * GIB,
    peakMemoryBytes: GIB }, now);
  assert.equal(ready.allowed, true);
  assert.equal(ready.disposition, 'warning');
  const memoryBlocked = assessHostResources({ capacity, availableMemoryBytes: 2 * GIB,
    peakMemoryBytes: GIB }, now);
  assert.equal(memoryBlocked.allowed, false);
  assert.ok(memoryBlocked.reasons.includes('memory_below_required_reserve'));
  assert.equal(assessHostResources({ capacity: { ...capacity, availableBytes: 20 * GIB },
    availableMemoryBytes: 4 * GIB, peakMemoryBytes: 0 }, now).allowed, false);
});

test('Linux memory inventory requires explicit available and swap values', () => {
  assert.deepEqual(parseMeminfo('MemAvailable: 4096 kB\nSwapFree: 10 kB\n'), {
    availableMemoryBytes: 4194304, swapFreeBytes: 10240 });
  assert.throws(() => parseMeminfo('MemFree: 4 kB\n'));
});
