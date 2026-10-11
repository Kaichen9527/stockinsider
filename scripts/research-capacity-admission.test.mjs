import assert from 'node:assert/strict';
import test from 'node:test';
import { assessResearchCapacity } from './research-capacity-admission.mjs';
const now = Date.parse('2026-09-30T00:00:00Z');
const base = () => ({ appObservation: { observedAt: new Date(now).toISOString(),
  roots: [{ realPath: '/opt/stockinsider', usedBytes: 3_000_000_000 },
    { realPath: '/var/lib/postgresql', usedBytes: 8_000_000_000 }] },
  host: { capacity: { observedAt: new Date(now).toISOString(), availableBytes: 40_000_000_000,
    databaseRestoreBytes: 0, documentBytes: 0, peakWalBytes: 1_000_000_000,
    peakTemporaryBytes: 4_000_000_000, deploymentBytes: 1_000_000_000,
    localBackupStagingBytes: 0, growthReserveBytes: 0 },
  availableMemoryBytes: 6_000_000_000, peakMemoryBytes: 1_000_000_000 } });
test('research admission includes peak allocation and an eight GB app reserve', () => {
  const input = base();
  assert.equal(assessResearchCapacity(input, now).allowed, true);
  input.appObservation.roots[0].usedBytes = 18_000_000_000;
  assert.equal(assessResearchCapacity(input, now).allowed, true);
  input.appObservation.roots[0].usedBytes++;
  assert.deepEqual(assessResearchCapacity(input, now).reasons, ['research_app_40gb_budget_exceeded']);
});
test('unused app quota cannot bypass whole-host disk or RAM admission', () => {
  const disk = base(); disk.host.capacity.availableBytes = 16_052_793_344;
  assert.equal(assessResearchCapacity(disk, now).allowed, false);
  const memory = base(); memory.host.availableMemoryBytes = 2_000_000_000;
  assert.ok(assessResearchCapacity(memory, now).reasons.includes('memory_below_required_reserve'));
});
test('stale, duplicate and nested inventories never manufacture free capacity', () => {
  const stale = base(); stale.appObservation.observedAt = new Date(now - 300_001).toISOString();
  assert.equal(assessResearchCapacity(stale, now).allowed, false);
  for (const realPath of ['/opt/stockinsider', '/opt/stockinsider/runtime']) {
    const duplicate = base(); duplicate.appObservation.roots.push({ realPath, usedBytes: 1 });
    assert.equal(assessResearchCapacity(duplicate, now).allowed, false);
  }
});
