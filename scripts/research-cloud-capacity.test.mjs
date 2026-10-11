import assert from 'node:assert/strict';
import test from 'node:test';
import { assessCloudCapacity } from './research-cloud-capacity.mjs';
const now = Date.parse('2026-10-04T00:00:00Z');
const input = () => ({ observedAt: new Date(now).toISOString(), residentBytes: 2_260_000_000,
  additionalTemporaryBytes: 4_000_000_000, filesystemAvailableBytes: 32_030_000_000,
  projectQuotaAvailableBytes: null, availableMemoryBytes: 8 * 1024 ** 3, expectedPeakMemoryBytes: 1024 ** 3 });
test('visible filesystem and counted resident input are independent; unknown quota stays explicit', () => {
  const result = assessCloudCapacity(input(), now);
  assert.equal(result.allowed, true); assert.equal(result.projectQuotaVerified, false);
  const limited = input(); limited.projectQuotaAvailableBytes = 11_999_999_999;
  assert.deepEqual(assessCloudCapacity(limited, now).reasons, ['cloud_disk_reserve_insufficient']);
});
test('stale, missing, future and overflow measurements fail closed', () => {
  for (const alteration of [{ observedAt: new Date(now - 300001).toISOString() },
    { observedAt: new Date(now + 1).toISOString() }, { residentBytes: Number.MAX_SAFE_INTEGER + 1 },
    { projectQuotaAvailableBytes: undefined }, { availableMemoryBytes: NaN }])
    assert.equal(assessCloudCapacity({ ...input(), ...alteration }, now).allowed, false);
});
test('resident, temporary, free-disk and memory targets are separate constraints', () => {
  for (const alteration of [{ residentBytes: 20_000_000_001 }, { additionalTemporaryBytes: 4_000_000_001 },
    { filesystemAvailableBytes: 11_999_999_999 }, { expectedPeakMemoryBytes: 8 * 1024 ** 3 + 1 },
    { availableMemoryBytes: 1024 ** 3 }]) assert.equal(assessCloudCapacity({ ...input(), ...alteration }, now).allowed, false);
});
