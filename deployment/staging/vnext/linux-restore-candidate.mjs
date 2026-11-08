/** Linux staging SOURCE candidate. No host IO, process runner or live adapter.
 * Only the explicitly synthetic small-buffer fixture may decrypt test bytes.
 */
import { verifyBackupChunks, decryptSmallBackupPayload, BACKUP_ENVELOPE_OVERHEAD_BYTES } from '../../../scripts/local-backup-envelope.mjs';

const GiB = 1024 ** 3;
const MAX_FIXTURE_PLAINTEXT = 64 * 1024;
const FIXTURE_DEADLINE_MS = 1000;
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
export const LINUX_RESTORE_CONTRACT = freeze({
  schemaVersion: 'stockinsider-linux-staging-restore-candidate-v1',
  platform: 'linux',
  postgresMajor: 17,
  binaryDirectoryIntent: '/usr/lib/postgresql/17/bin',
  programs: ['initdb', 'pg_ctl', 'createdb', 'pg_restore', 'psql'],
  locale: 'C',
  encoding: 'UTF8',
  sourceRootIntent: '/srv/stockinsider-vnext-oct22-staging/restore-source',
  dataRootIntent: '/srv/stockinsider-vnext-oct22-staging/restore-data',
  runtimeRootIntent: '/run/stockinsider-vnext-staging-restore',
  databaseIntent: 'stockinsider_vnext_restore_staging',
  sourceAccess: 'immutable_ciphertext_descriptor_authenticated_before_any_consumer',
  keyAccess: 'dedicated_owned_binary_fd_exact_32_bytes_plus_bounded_eof_probe',
  cluster: { newPrivateClusterOnly: true, listenAddresses: '', socketPermissions: '0700', hostAuthentication: 'reject', localAuthentication: 'peer', inheritedEnvironment: false },
  backupSetSchema: 'stockinsider-local-backup-set-v2',
  databaseManifestSchemas: ['stockinsider-database-export-v3', 'stockinsider-database-compact-v1'],
  capacity: { diskFloorBytes: 15 * GiB, memoryFloorBytes: 1.5 * GiB, minimumWalBytes: GiB, minimumScratchBytes: GiB / 2, minimumGrowthBytes: 2 * GiB, minimumMemoryPeakBytes: GiB, accounting: 'conservative_full_peak_one_verified_filesystem' },
  hostLock: 'exclusive_reviewed_host_lock_before_measurement_and_through_shutdown',
  enabled: false,
});

export const LINUX_RESTORE_REQUIREMENTS = freeze([
  { id: 'artifact_manifest_provenance', state: 'NOT_IMPLEMENTED', evidence: 'Trusted original manifest, complete exact member inventory/context/hash and source revision; caller receipt booleans cannot establish provenance' },
  { id: 'binary_key_fd_custody', state: 'NOT_IMPLEMENTED', evidence: 'Secure existing custody integration: owned dedicated binary FD, exact 32 bytes, bounded extra-byte/EOF read, deadline, abort/EPIPE handling and closure/zeroization; no argv, environment, key file backend or console key' },
  { id: 'immutable_ciphertext_descriptor', state: 'NOT_IMPLEMENTED', evidence: 'No-follow private single-link immutable ciphertext descriptor or independently enforced sealed snapshot held across authentication and every replay; regular-file descriptor and final stat alone do not prevent in-place mutation' },
  { id: 'linux_pg17_binary_and_locale', state: 'NOT_IMPLEMENTED', evidence: 'Trusted Linux PG17 absolute binaries, version/hash/ownership/path and C locale validation; declarations are not observations' },
  { id: 'isolated_unix_socket_cluster', state: 'NOT_IMPLEMENTED', evidence: 'New private nonroot cluster, dedicated socket/data/runtime/source, peer binding and network isolation; no production cluster, DNS, inherited PG environment, service or restore hook may be reachable' },
  { id: 'host_lock_and_capacity', state: 'NOT_IMPLEMENTED', evidence: 'Current measurements under host lock of ciphertext, expanded database, WAL, restore scratch, old/new releases, growth and memory peak; retain 15 GiB disk and 1.5 GiB memory on every actual filesystem' },
  { id: 'complete_restore_validation_and_shutdown', state: 'NOT_IMPLEMENTED', evidence: 'Exact reviewed TOC/bootstrap/source compatibility, owner/ACL/RLS/application/lineage validation, restored writer disarm before application access, bounded owned process cleanup and actual shutdown; no generic SQL/grant' },
  { id: 'complete_backup_set_and_key_escrow', state: 'NOT_IMPLEMENTED', evidence: 'Database plus separately verified storage/provider members, independent secure key recovery and full restore receipts; envelope verification alone is insufficient' },
  { id: 'real_next_staging_rollback', state: 'NOT_IMPLEMENTED', evidence: 'Separately approved isolated real Next release/database/config rollback with revision/data/health validation; this module does not rehearse a website or grant cutover' },
]);

function exactKeys(value, keys) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).sort().join(',') === [...keys].sort().join(',');
}
function sameContract(value, expected) {
  if (Array.isArray(expected)) return Array.isArray(value) && value.length === expected.length && Object.keys(value).length === expected.length && expected.every((item, index) => sameContract(value[index], item));
  if (expected && typeof expected === 'object') return exactKeys(value, Object.keys(expected)) && Object.entries(expected).every(([key, item]) => sameContract(value[key], item));
  return value === expected;
}
export function prepareLinuxRestoreCandidate(plan, ...overrides) {
  if (overrides.length || !sameContract(plan, LINUX_RESTORE_CONTRACT)) throw Error('linux_restore_closed_contract_required');
  return freeze({ state: 'Disabled', executionAllowed: false, plan: LINUX_RESTORE_CONTRACT, requirements: LINUX_RESTORE_REQUIREMENTS, restoreVerified: false, stagingAccepted: false });
}
export async function executeLinuxStagingRestore(...overrides) {
  if (overrides.length) throw Error('linux_restore_execution_overrides_forbidden');
  throw Error('linux_restore_live_integration_not_implemented');
}

/** Hypothetical arithmetic only. No reservation, measurement or host authority. */
export function assessLinuxRestoreCapacityFixture(input) {
  const costs = ['sourceCiphertextBytes', 'immutableCiphertextCopyBytes', 'expandedArchiveBytes', 'restoredClusterBytes', 'walBytes', 'restoreScratchBytes', 'oldReleaseBytes', 'newReleaseBytes', 'growthBytes'];
  if (!exactKeys(input, [...costs, 'diskAvailableBytes', 'memoryAvailableBytes', 'memoryPeakBytes'])
      || Object.values(input).some(value => !Number.isSafeInteger(value) || value < 0)) throw Error('linux_restore_capacity_fields_required');
  const policy = LINUX_RESTORE_CONTRACT.capacity;
  if (!input.sourceCiphertextBytes || !input.immutableCiphertextCopyBytes || !input.expandedArchiveBytes || !input.restoredClusterBytes || !input.oldReleaseBytes || !input.newReleaseBytes || input.walBytes < policy.minimumWalBytes || input.restoreScratchBytes < policy.minimumScratchBytes || input.growthBytes < policy.minimumGrowthBytes || input.memoryPeakBytes < policy.minimumMemoryPeakBytes) throw Error('linux_restore_capacity_bounds_required');
  const peak = costs.reduce((sum, name) => sum + BigInt(input[name]), 0n);
  const diskFits = BigInt(input.diskAvailableBytes) - peak >= BigInt(policy.diskFloorBytes);
  const memoryFits = BigInt(input.memoryAvailableBytes) - BigInt(input.memoryPeakBytes) >= BigInt(policy.memoryFloorBytes);
  return freeze({ state: 'FixtureOnly', diskPeakFits: diskFits, memoryPeakFits: memoryFits, executionAllowed: false, hostReservationVerified: false, restoreVerified: false });
}

/** Synthetic arrays emulate chunk boundaries, NOT an OS FD or key backend.
 * Copy all bounded inputs before the first await. A consumer cannot replace
 * the authenticated source between passes; no path is reopened or accepted.
 */
export async function verifyLinuxRestoreFixture(options) {
  let snapshot, key, plaintext;
  const parts = [];
  let timer;
  try {
    if (!exactKeys(options, ['ciphertext', 'fixtureKeyChunks', 'contextSha256', 'fixtureConsumer'])) throw Error();
    const { ciphertext, fixtureKeyChunks, contextSha256, fixtureConsumer: consumer } = options;
    if (!Buffer.isBuffer(ciphertext) || ciphertext.length <= BACKUP_ENVELOPE_OVERHEAD_BYTES
        || ciphertext.length > MAX_FIXTURE_PLAINTEXT + BACKUP_ENVELOPE_OVERHEAD_BYTES
        || typeof contextSha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(contextSha256) || typeof consumer !== 'function'
        || !Array.isArray(fixtureKeyChunks)) throw Error();
    const chunkCount = fixtureKeyChunks.length;
    if (chunkCount < 1 || chunkCount > 32) throw Error();
    let bytes = 0;
    for (let index = 0; index < chunkCount; index++) {
      const part = fixtureKeyChunks[index];
      if (!Buffer.isBuffer(part) || part.length < 1 || part.length > 32 || (bytes += part.length) > 32) throw Error();
      parts.push(Buffer.from(part));
    }
    if (bytes !== 32) throw Error();
    snapshot = Buffer.from(ciphertext);
    key = Buffer.concat(parts);
    const cryptoOptions = { key, contextSha256, maxPlaintextBytes: MAX_FIXTURE_PLAINTEXT };
    await verifyBackupChunks([snapshot], cryptoOptions);
    // This helper also completes final GCM authentication before returning a
    // plaintext buffer. Both passes use the same private immutable snapshot.
    plaintext = await decryptSmallBackupPayload([snapshot], cryptoOptions);
    // Bounds this await for a cooperative async fixture. It does not preempt
    // synchronous JS or terminate late callback work; no process cleanup claim.
    await Promise.race([
      Promise.resolve().then(() => consumer(plaintext)),
      new Promise((_, reject) => { timer = setTimeout(() => reject(Error()), FIXTURE_DEADLINE_MS); }),
    ]);
  } catch {
    throw Error('linux_restore_fixture_rejected');
  } finally {
    clearTimeout(timer);
    plaintext?.fill(0);
    key?.fill(0);
    parts.forEach(part => part.fill(0));
    snapshot?.fill(0);
  }
  return freeze({ state: 'FixtureOnly', envelopeAuthenticatedBeforeConsumer: true, ownedBuffersCleared: true, plaintextArchiveWritten: false, osKeyFdVerified: false, immutableHostDescriptorVerified: false, restoreVerified: false, stagingAccepted: false });
}
