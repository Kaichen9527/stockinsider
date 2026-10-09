export const CLOUD_CAPACITY_POLICY = 'research-cloud-validation-32gb-v1';
export const CLOUD_RESIDENT_LIMIT_BYTES = 20_000_000_000;
export const CLOUD_TEMP_LIMIT_BYTES = 4_000_000_000;
export const CLOUD_RESERVE_BYTES = 8_000_000_000;
export const CLOUD_MEMORY_TARGET_BYTES = 8 * 1024 ** 3;

/** Validation-only profile. Never imported by the production Contabo guard.
 * Measurements must be from the current sandbox; overlay df and du are separate. */
export function assessCloudCapacity(input, now = Date.now()) {
  const reasons = [];
  const blocked = (reason) => ({ policy: CLOUD_CAPACITY_POLICY, allowed: false, reasons: [reason] });
  if (!input || typeof input !== 'object') return blocked('cloud_capacity_missing');
  const observedAt = Date.parse(input.observedAt);
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > 300_000)
    return blocked('cloud_capacity_stale');
  for (const key of ['residentBytes', 'additionalTemporaryBytes', 'filesystemAvailableBytes',
    'availableMemoryBytes', 'expectedPeakMemoryBytes']) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0) return blocked(`cloud_capacity_invalid:${key}`);
  }
  const quota = input.projectQuotaAvailableBytes;
  if (quota !== null && (!Number.isSafeInteger(quota) || quota < 0)) return blocked('cloud_quota_invalid');
  const available = quota === null ? input.filesystemAvailableBytes : Math.min(quota, input.filesystemAvailableBytes);
  if (input.residentBytes > CLOUD_RESIDENT_LIMIT_BYTES) reasons.push('cloud_resident_20gb_exceeded');
  if (input.additionalTemporaryBytes > CLOUD_TEMP_LIMIT_BYTES) reasons.push('cloud_temporary_4gb_exceeded');
  if (available - input.additionalTemporaryBytes < CLOUD_RESERVE_BYTES) reasons.push('cloud_disk_reserve_insufficient');
  if (input.expectedPeakMemoryBytes > CLOUD_MEMORY_TARGET_BYTES) reasons.push('cloud_memory_8gib_target_exceeded');
  if (input.availableMemoryBytes - input.expectedPeakMemoryBytes < 512 * 1024 ** 2) reasons.push('cloud_memory_reserve_insufficient');
  return { policy: CLOUD_CAPACITY_POLICY, allowed: !reasons.length, reasons,
    effectiveAvailableBytes: available, projectQuotaVerified: quota !== null,
    residentBytes: input.residentBytes, additionalTemporaryBytes: input.additionalTemporaryBytes,
    expectedPeakMemoryBytes: input.expectedPeakMemoryBytes };
}
