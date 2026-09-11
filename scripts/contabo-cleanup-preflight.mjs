/** Pure cleanup eligibility analysis. This module cannot remove, stop or prune. */
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { VPS_HOST, validateReleaseExportInput } from './vps-release-identity.mjs';
import { verifyReleaseTreeManifest } from './vps-release-tar.mjs';
import { CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';

const under = (child, parent) => child === parent || child.startsWith(parent + path.sep);
const digest = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);

async function readPrivateReceipt(filePath) {
  const handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const metadata = await handle.stat();
    if (!metadata.isFile() || (metadata.mode & 0o777) !== 0o600
      || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
      throw new Error('cleanup_receipt_file_invalid');
    }
    return await handle.readFile();
  } finally { await handle.close(); }
}

export function verifyCleanupEvidence(candidate, archiveBytes, restoreBytes) {
  if (!path.isAbsolute(candidate.archiveReceiptPath || '') || !path.isAbsolute(candidate.restoreReceiptPath || '')
    || path.dirname(candidate.archiveReceiptPath) !== CONFIRMED_BACKUP_DIRECTORY
    || path.dirname(candidate.restoreReceiptPath) !== CONFIRMED_BACKUP_DIRECTORY
    || !digest(candidate.archiveReceiptSha256) || !digest(candidate.restoreReceiptSha256)
    || createHash('sha256').update(archiveBytes).digest('hex') !== candidate.archiveReceiptSha256
    || createHash('sha256').update(restoreBytes).digest('hex') !== candidate.restoreReceiptSha256) return false;
  try {
    const archive = JSON.parse(archiveBytes.toString('utf8'));
    const restore = JSON.parse(restoreBytes.toString('utf8'));
    validateReleaseExportInput({ host: archive.manifest?.host, releasePath: candidate.path });
    verifyReleaseTreeManifest(archive.manifest?.tree, archive.manifest?.tree);
    const contextSha256 = createHash('sha256').update(JSON.stringify(archive.manifest)).digest('hex');
    return archive.manifest?.schema === 'stockinsider-vps-release-export-v1'
      && archive.manifest.host === '5.104.83.211' && archive.manifest.releasePath === candidate.path
      && archive.manifest.tree.releasePath === candidate.path
      && archive.contextSha256 === contextSha256 && archive.postTreeSha256 === archive.manifest.tree.treeSha256
      && archive.treeStable === true && archive.manifest.plaintextStoredOnMac === false
      && archive.manifest.externalSecretsArchived === false
      && archive.manifest.remoteDeletePerformed === false
      && /^[0-9a-f]{64}$/.test(archive.result?.plaintextSha256 || '')
      && Number.isSafeInteger(archive.result?.plaintextBytes) && archive.result.plaintextBytes > 0
      && restore.schema === 'stockinsider-vps-release-restore-v1'
      && restore.host === archive.manifest.host && restore.releasePath === candidate.path
      && restore.sourceContextSha256 === archive.contextSha256
      && restore.sourcePlaintextSha256 === archive.result.plaintextSha256
      && restore.restoreVerified === true && restore.plaintextPersistedAfterVerification === false
      && restore.externalSecretsArchived === false && restore.externalSecretBytesArchived === 0
      && restore.deploymentReconstructionPlanVerified === true
      && restore.treeSha256 === archive.manifest.tree.treeSha256
      && restore.fileCount === archive.manifest.tree.fileCount
      && restore.totalBytes === archive.manifest.tree.totalBytes
      && restore.symlinkCount === (archive.manifest.tree.links?.length ?? 0)
      && restore.externalSecretSymlinkCount === (archive.manifest.tree.externalSecretLinks?.length ?? 0)
      && restore.externalSecretRebindRequired === ((archive.manifest.tree.externalSecretLinks?.length ?? 0) > 0)
      && JSON.stringify(restore.externalSecretRebindPolicies)
        === JSON.stringify((archive.manifest.tree.externalSecretLinks ?? []).map(item => item.policyId))
      && restore.redactedSecretFileCount === (archive.manifest.tree.redactedSecretFiles?.length ?? 0)
      && restore.redactedSecretRebindRequired === ((archive.manifest.tree.redactedSecretFiles?.length ?? 0) > 0)
      && JSON.stringify(restore.redactedSecretRebindPolicies)
        === JSON.stringify((archive.manifest.tree.redactedSecretFiles ?? []).map(item => item.policyId))
      && restore.redactedSecretBytesArchived === 0
      && restore.temporaryRestoreRemoved === true && restore.remoteDeletePerformed === false;
  } catch { return false; }
}

export function assessCleanupCandidates(inventory, policy, prerequisites = {}, evidence = {}, now = Date.now()) {
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
    try { validateReleaseExportInput({ host: VPS_HOST, releasePath: candidate.path }); } catch {
      reasons.push('candidate_path_invalid');
    }
    if (evidence[candidate.path] !== true) {
      reasons.push('verified_archive_and_restore_receipts_required');
    }
    for (const prerequisite of candidate.requires || []) {
      if (prerequisites[prerequisite] !== true) reasons.push(`external_prerequisite_missing:${prerequisite}`);
    }
    if (candidate.path.startsWith('/opt/minday-admin-console-releases/')
      && prerequisites.minday_admin_secret_migration_verified !== true) {
      reasons.push('external_prerequisite_missing:minday_admin_secret_migration_verified');
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
    const evidence = {};
    for (const candidate of policy.candidates) {
      if (!path.isAbsolute(candidate.archiveReceiptPath || '') || !path.isAbsolute(candidate.restoreReceiptPath || '')) continue;
      const [archive, restore] = await Promise.all([
        readPrivateReceipt(candidate.archiveReceiptPath).catch(() => null),
        readPrivateReceipt(candidate.restoreReceiptPath).catch(() => null),
      ]);
      evidence[candidate.path] = Boolean(archive && restore && verifyCleanupEvidence(candidate, archive, restore));
    }
    const candidates = assessCleanupCandidates(inventory, policy, prerequisites, evidence);
    console.log(JSON.stringify({ schema: 'stockinsider-cleanup-preflight-v1', candidates,
      eligibleCount: candidates.filter(item => item.eligible).length, destructiveActionPerformed: false }));
    process.exitCode = candidates.some(item => item.eligible) ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ schema: 'stockinsider-cleanup-preflight-v1', error: error.message,
      destructiveActionPerformed: false })); process.exitCode = 1;
  }
}
