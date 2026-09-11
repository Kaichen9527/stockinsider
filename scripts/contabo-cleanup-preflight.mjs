/** Pure cleanup eligibility analysis. This module cannot remove, stop or prune. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const under = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

export function assessCleanupCandidates(inventory, policy, prerequisites = {}, now = Date.now()) {
  if (inventory?.schema !== 'stockinsider-contabo-deployment-inventory-v1'
    || policy?.schema !== 'stockinsider-all-app-retention-policy-v1') throw new Error('inventory_or_policy_invalid');
  const observedAt = Date.parse(inventory.observedAt);
  if (!Number.isFinite(observedAt) || observedAt > now || now - observedAt > 300_000) throw new Error('inventory_stale');
  if (inventory.host !== policy.host) throw new Error('host_identity_mismatch');
  const references = [
    ...inventory.links.map(item => ({ kind: 'symlink', owner: item.path, path: item.target })),
    ...inventory.services.flatMap(item => [item.workingDirectory, item.processCwd, item.processExe]
      .filter(Boolean).map(value => ({ kind: 'service', owner: item.unit, path: value }))),
    ...inventory.containers.flatMap(item => item.mounts.filter(mount => mount.source)
      .map(mount => ({ kind: 'container_mount', owner: item.name, path: mount.source }))),
    ...inventory.containers.flatMap(item => [item.composeWorkingDirectory, ...(item.composeConfigFiles || [])]
      .filter(Boolean).map(value => ({ kind: 'container_compose', owner: item.name, path: value }))),
    ...inventory.nginx.flatMap(item => item.references.filesystem
      .map(value => ({ kind: 'nginx', owner: item.source, path: value }))),
  ];
  return policy.candidates.map(candidate => {
    const reasons = [];
    if (!path.isAbsolute(candidate.path) || !under(candidate.path, '/opt') || candidate.path === '/opt') {
      reasons.push('candidate_path_invalid');
    }
    if (!digest(candidate.archiveReceiptSha256) || !digest(candidate.restoreReceiptSha256)) {
      reasons.push('verified_archive_and_restore_receipts_required');
    }
    for (const prerequisite of candidate.requires || []) {
      if (prerequisites[prerequisite] !== true) reasons.push(`external_prerequisite_missing:${prerequisite}`);
    }
    for (const retained of policy.retainedPaths || []) {
      if (under(retained, candidate.path) || under(candidate.path, retained)) reasons.push('overlaps_retained_path');
    }
    const externalReferences = references.filter(reference => reference.path
      && (under(reference.path, candidate.path) || under(candidate.path, reference.path))
      && !under(reference.owner, candidate.path));
    if (externalReferences.length) reasons.push('active_external_reference');
    const existsInInventory = inventory.links.some(item => under(item.path, candidate.path))
      || inventory.releases.some(item => under(item.path, candidate.path))
      || externalReferences.length > 0;
    if (!existsInInventory) reasons.push('candidate_not_observed');
    return { path: candidate.path, bytes: candidate.bytes ?? null, eligible: reasons.length === 0,
      reasons: [...new Set(reasons)], externalReferences };
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [inventoryPath, policyPath, prerequisitePath, ...extra] = process.argv.slice(2);
    if (extra.length || ![inventoryPath, policyPath].every(item => path.isAbsolute(item || ''))
      || (prerequisitePath && !path.isAbsolute(prerequisitePath))) throw new Error('absolute_paths_required');
    const inventory = JSON.parse(await readFile(inventoryPath, 'utf8'));
    const policy = JSON.parse(await readFile(policyPath, 'utf8'));
    const prerequisites = prerequisitePath ? JSON.parse(await readFile(prerequisitePath, 'utf8')) : {};
    const candidates = assessCleanupCandidates(inventory, policy, prerequisites);
    console.log(JSON.stringify({ schema: 'stockinsider-cleanup-preflight-v1', candidates,
      eligibleCount: candidates.filter(item => item.eligible).length, destructiveActionPerformed: false }));
    process.exitCode = candidates.some(item => item.eligible) ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ schema: 'stockinsider-cleanup-preflight-v1', error: error.message,
      destructiveActionPerformed: false })); process.exitCode = 1;
  }
}
