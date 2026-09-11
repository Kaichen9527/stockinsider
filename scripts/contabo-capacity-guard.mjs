/** Pure admission check. Run again under the migration/backfill writer lock.
 * All budgets are additional peak allocation, including indexes and WAL.
 * This module never deletes files or changes another site's services. */
export const GIB = 1024 ** 3;
export const MINIMUM_RESERVE_BYTES = 15 * GIB;
export const WARNING_RESERVE_BYTES = 20 * GIB;
const BUDGET_KEYS = ['databaseRestoreBytes', 'documentBytes', 'peakWalBytes',
  'peakTemporaryBytes', 'deploymentBytes', 'localBackupStagingBytes'];

export function assessContaboCapacity(input, now = Date.now()) {
  const blocked = (reason) => ({ disposition: 'blocked', allowed: false, reasons: [reason],
    additionalPeakBytes: null, projectedAvailableBytes: null, minimumReserveBytes: MINIMUM_RESERVE_BYTES });
  if (!input || typeof input !== 'object' || Array.isArray(input)) return blocked('capacity_input_missing');
  const observedAt = typeof input.observedAt === 'string' ? Date.parse(input.observedAt) : NaN;
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now || now - observedAt > 300_000) {
    return blocked('capacity_observation_stale_or_invalid');
  }
  for (const key of ['availableBytes', ...BUDGET_KEYS]) {
    if (!Number.isSafeInteger(input[key]) || input[key] < 0) return blocked(`capacity_budget_missing_or_invalid:${key}`);
  }
  const additionalPeakBytes = BUDGET_KEYS.reduce((sum, key) => sum + input[key], 0);
  if (!Number.isSafeInteger(additionalPeakBytes)) return blocked('capacity_budget_overflow');
  const projectedAvailableBytes = input.availableBytes - additionalPeakBytes;
  const allowed = projectedAvailableBytes >= MINIMUM_RESERVE_BYTES;
  return {
    disposition: !allowed ? 'blocked' : projectedAvailableBytes < WARNING_RESERVE_BYTES ? 'warning' : 'ready',
    allowed,
    reasons: !allowed ? ['capacity_below_15_gib_reserve']
      : projectedAvailableBytes < WARNING_RESERVE_BYTES ? ['capacity_below_20_gib_warning'] : [],
    additionalPeakBytes, projectedAvailableBytes, minimumReserveBytes: MINIMUM_RESERVE_BYTES,
  };
}
