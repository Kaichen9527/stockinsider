import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, symlinkSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
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

test('the CLI enforces admission when invoked through a release symlink', () => {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'stockinsider-capacity-link-'));
  try {
    const link = path.join(directory, 'contabo-host-resource-check.mjs');
    const invalidBudget = path.join(directory, 'invalid-budget.json');
    symlinkSync(fileURLToPath(new URL('./contabo-host-resource-check.mjs', import.meta.url)), link);
    writeFileSync(invalidBudget, '{invalid');
    const result = spawnSync(process.execPath, [link, invalidBudget], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    const output = JSON.parse(result.stderr);
    assert.equal(output.schema, 'stockinsider-host-resource-check-v1');
    assert.equal(output.allowed, false);
    assert.equal(typeof output.reason, 'string');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
