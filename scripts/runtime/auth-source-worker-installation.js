'use strict';

const { canonicalJson, sha256 } = require('./codec');
const { assessTrackedRuntimeHealth, buildInstalledRuntimeHealthObservation } = require('./runtime-health');

const INSTALLATION_SCHEMA = 'stockinsider-runtime-installation-v1.1';
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const RFC3339_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;

class RuntimeInstallationError extends Error {
  constructor(reason) { super(reason); this.code = reason; }
}
const ACTIVATION_FAILURE_REASONS = new Set([
  'active_pointer_invalid', 'active_runtime_conflict', 'scheduler_activation_failed',
  'scheduler_capture_invalid', 'scheduler_snapshot_changed', 'staged_hash_mismatch',
]);

function requireCondition(condition, reason) { if (!condition) throw new RuntimeInstallationError(reason); }
function exactKeys(value, keys) { return value && canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()); }

function validateRuntimeInstallationManifest(manifest, reviewedRelease) {
  requireCondition(exactKeys(manifest, ['schema','commitSha','reviewedTreeSha','reviewAttestationSha256','worker','config','installedAt','schedulerRollback','rollback']), 'attestation_schema_mismatch');
  requireCondition(manifest.schema === INSTALLATION_SCHEMA && SHA40.test(manifest.commitSha) && SHA40.test(manifest.reviewedTreeSha)
    && SHA64.test(manifest.reviewAttestationSha256) && RFC3339_SECONDS.test(manifest.installedAt), 'attestation_schema_mismatch');
  requireCondition(exactKeys(manifest.worker, ['repositoryPath','sha256']) && manifest.worker.repositoryPath === 'scripts/runtime/auth-source-worker-cli.js' && SHA64.test(manifest.worker.sha256), 'authoritative_path_invalid');
  requireCondition(exactKeys(manifest.config, ['repositoryPath','sha256']) && manifest.config.repositoryPath === 'config/runtime/auth-source-dag.json' && SHA64.test(manifest.config.sha256), 'authoritative_path_invalid');
  requireCondition(exactKeys(manifest.schedulerRollback, ['releasePath','sha256','capturedAt','priorOwnerCount'])
    && manifest.schedulerRollback.releasePath === 'scheduler-rollback-package.json' && SHA64.test(manifest.schedulerRollback.sha256)
    && RFC3339_SECONDS.test(manifest.schedulerRollback.capturedAt) && manifest.schedulerRollback.priorOwnerCount === 3, 'scheduler_capture_invalid');
  if (manifest.rollback !== null) requireCondition(exactKeys(manifest.rollback, ['commitSha','manifestSha256','releaseDirectoryName'])
    && SHA40.test(manifest.rollback.commitSha) && SHA64.test(manifest.rollback.manifestSha256)
    && manifest.rollback.releaseDirectoryName === manifest.rollback.commitSha, 'scheduler_capture_invalid');
  requireCondition(reviewedRelease && manifest.commitSha === reviewedRelease.commitSha && manifest.reviewedTreeSha === reviewedRelease.treeSha,
    'review_identity_mismatch');
  requireCondition(manifest.reviewAttestationSha256 === reviewedRelease.reviewAttestationSha256, 'review_evidence_unbound');
  requireCondition(manifest.worker.sha256 === reviewedRelease.workerSha256 && manifest.config.sha256 === reviewedRelease.configSha256, 'staged_hash_mismatch');
  return Object.freeze({ ...manifest, manifestSha256: sha256(canonicalJson(manifest)) });
}

async function activateTrackedRuntimeRelease({ manifest, reviewedRelease, scheduler, filesystem, journal,
  activationAuthority, verifyActivationAuthority }) {
  const validated = validateRuntimeInstallationManifest(manifest, reviewedRelease);
  requireCondition(typeof verifyActivationAuthority === 'function' && activationAuthority &&
    await verifyActivationAuthority(activationAuthority) === true, 'production_runtime_activation_authority_required');
  requireCondition(journal && typeof journal.recover === 'function' && typeof journal.begin === 'function' &&
    typeof journal.write === 'function' && typeof journal.rollback === 'function', 'scheduler_activation_failed');
  requireCondition(filesystem && typeof filesystem.cleanupIncomplete === 'function', 'scheduler_activation_failed');
  await journal.recover();
  const priorScheduler = await scheduler.capture();
  const priorPointer = await filesystem.captureActivePointer();
  const phase = async (name) => journal.write(name);
  await journal.begin({ priorScheduler, priorPointer });
  try {
    await filesystem.stage(validated);
    await filesystem.verifyStaged(validated);
    await filesystem.publishRelease(validated);
    await phase('release_published');
    await scheduler.disablePriorOwners(priorScheduler);
    await phase('old_owners_disabled');
    await scheduler.loadNewOwner(validated);
    await phase('new_owner_loaded');
    const doctor = await scheduler.doctor(validated);
    requireCondition(doctor?.status === 'pass', 'scheduler_activation_failed');
    requireCondition(typeof filesystem.writeHealthObservation === 'function', 'scheduler_activation_failed');
    const observation = buildInstalledRuntimeHealthObservation({ manifest: validated, reviewedRelease, doctor });
    requireCondition(assessTrackedRuntimeHealth(observation).status === 'pass', 'scheduler_activation_failed');
    await filesystem.writeHealthObservation(observation);
    await phase('doctor_passed');
    await phase('complete');
    return Object.freeze({ disposition: 'activated', manifestSha256: validated.manifestSha256 });
  } catch (error) {
    try {
      await scheduler.restore(priorScheduler);
      await filesystem.restoreActivePointer(priorPointer);
      await filesystem.cleanupIncomplete();
      await journal.rollback();
    } catch {
      throw new RuntimeInstallationError('scheduler_rollback_failed');
    }
    const reason = ACTIVATION_FAILURE_REASONS.has(error?.code) ? error.code : 'scheduler_activation_failed';
    return Object.freeze({ disposition: 'rolled_back', reason, manifestSha256: validated.manifestSha256 });
  }
}

module.exports = { INSTALLATION_SCHEMA, RuntimeInstallationError, activateTrackedRuntimeRelease, validateRuntimeInstallationManifest };
