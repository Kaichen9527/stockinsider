import { assessHostResources } from './contabo-host-resource-check.mjs';

export const RESEARCH_STORAGE_POLICY = 'research-storage-40gb-v1';
export const APP_LIMIT_BYTES = 40_000_000_000;
export const APP_RESERVE_BYTES = 8_000_000_000;

/** The application budget is an additional gate, never a replacement for the
 * measured whole-host disk/RAM guard. Call under the existing heavy-work lock. */
export function assessResearchCapacity(input, now = Date.now()) {
  const blocked = (reason) => ({ policy: RESEARCH_STORAGE_POLICY, allowed: false,
    reasons: [reason], appLimitBytes: APP_LIMIT_BYTES, appReserveBytes: APP_RESERVE_BYTES });
  if (!input || typeof input !== 'object') return blocked('research_capacity_input_missing');
  const { appObservation, host } = input;
  if (!appObservation || !Array.isArray(appObservation.roots) || !appObservation.roots.length) {
    return blocked('research_app_inventory_missing');
  }
  const observedAt = Date.parse(appObservation.observedAt);
  if (!Number.isFinite(now) || !Number.isFinite(observedAt) || observedAt > now
    || now - observedAt > 300_000) return blocked('research_app_observation_stale');
  const paths = new Set();
  let usedBytes = 0;
  for (const root of appObservation.roots) {
    if (!root || typeof root.realPath !== 'string' || !root.realPath.startsWith('/')
      || /(?:^|\/)\.{1,2}(?:\/|$)/u.test(root.realPath)
      || !Number.isSafeInteger(root.usedBytes) || root.usedBytes < 0
      || [...paths].some((value) => value === root.realPath
        || value.startsWith(`${root.realPath}/`) || root.realPath.startsWith(`${value}/`))) {
      return blocked('research_app_inventory_invalid_or_overlapping');
    }
    paths.add(root.realPath);
    usedBytes += root.usedBytes;
  }
  if (!Number.isSafeInteger(usedBytes)) return blocked('research_app_inventory_overflow');
  const resources = assessHostResources(host || {}, now);
  const peak = resources.disk.additionalPeakBytes;
  if (peak === null || !Number.isSafeInteger(peak)) return blocked('research_host_budget_invalid');
  const projectedAppBytes = usedBytes + peak;
  if (!Number.isSafeInteger(projectedAppBytes)) return blocked('research_app_projection_overflow');
  const appAllowed = projectedAppBytes + APP_RESERVE_BYTES <= APP_LIMIT_BYTES;
  return { policy: RESEARCH_STORAGE_POLICY, allowed: resources.allowed && appAllowed,
    reasons: [...resources.reasons, ...(!appAllowed ? ['research_app_40gb_budget_exceeded'] : [])],
    appLimitBytes: APP_LIMIT_BYTES, appReserveBytes: APP_RESERVE_BYTES,
    usedBytes, additionalPeakBytes: peak, projectedAppBytes, host: resources };
}
