'use strict';

const { canonicalJson, sha256 } = require('./codec');
const { assessTrackedRuntimeHealth, buildInstalledRuntimeHealthObservation } = require('./runtime-health');

const INSTALLATION_SCHEMA = 'stockinsider-runtime-installation-v1.1';
const SHA40 = /^[0-9a-f]{40}$/u;
const SHA64 = /^[0-9a-f]{64}$/u;
const RFC3339_SECONDS = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const READONLY_BOOTSTRAP_REASONS = new Set([
  'last_run_nonterminal',
  'projection_missing',
  'projection_stale',
  'consumer_producer_incompatible',
]);
const ACTIVATION_HEARTBEAT_MAXIMUM_SECONDS = 120;
const ACTIVATION_HEARTBEAT_POLL_MILLISECONDS = 2_000;

class RuntimeInstallationError extends Error {
  constructor(reason) { super(reason); this.code = reason; }
}
const ACTIVATION_FAILURE_REASONS = new Set([
  'active_pointer_invalid', 'active_runtime_conflict', 'scheduler_activation_failed',
  'scheduler_capture_invalid', 'scheduler_snapshot_changed', 'staged_hash_mismatch',
]);
const ACTIVATION_FAILURE_STAGES = new Set([
  'stage_release', 'verify_release', 'publish_release', 'disable_prior_owners',
  'load_new_owner', 'first_heartbeat', 'health_assessment', 'publish_health',
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

function assessActivationHealth(observation, reviewedRelease) {
  const health = assessTrackedRuntimeHealth(observation);
  if (health.status === 'pass') return Object.freeze({ disposition: 'activated', health });
  const reasons = health.reasons ?? [];
  // Runtime must stage and produce its manifest before the matching Web build
  // can be deployed. Admit a known, hash-shaped predecessor consumer only as
  // action-disabled readonly bootstrap; compatibility remains an explicit
  // health failure until Web is replaced by the reviewed release.
  const readonlyBootstrap = SHA40.test(observation.consumerCommitSha ?? '')
    && SHA256.test(observation.projectionChecksum ?? '')
    && ['fresh', 'stale'].includes(observation.projectionFreshness)
    && reasons.includes('consumer_producer_incompatible')
    && reasons.every((reason) => READONLY_BOOTSTRAP_REASONS.has(reason));
  requireCondition(readonlyBootstrap, 'scheduler_activation_failed');
  return Object.freeze({ disposition: 'activated_readonly_bootstrap', health });
}

function hasFirstHeartbeat(doctor, reviewedRelease) {
  const observation = doctor?.observation;
  if (!observation || observation.producerCommitSha !== reviewedRelease.commitSha) return false;
  if (observation.lastRunNonterminal === true && observation.leaseStatus === 'active') return true;
  return observation.lastTerminalStatus === 'success' && typeof observation.lastTerminalRunAt === 'string';
}

async function waitForFirstHeartbeat({ scheduler, reviewedRelease, maximumSeconds = ACTIVATION_HEARTBEAT_MAXIMUM_SECONDS,
  pollMilliseconds = ACTIVATION_HEARTBEAT_POLL_MILLISECONDS, wait = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  now = () => Date.now() }) {
  requireCondition(scheduler && typeof scheduler.doctor === 'function' && Number.isInteger(maximumSeconds) && maximumSeconds > 0
    && Number.isInteger(pollMilliseconds) && pollMilliseconds > 0 && typeof wait === 'function' && typeof now === 'function',
  'scheduler_activation_failed');
  const deadline = now() + maximumSeconds * 1000;
  let latest = null;
  do {
    latest = await scheduler.doctor(reviewedRelease);
    if (hasFirstHeartbeat(latest, reviewedRelease)) return latest;
    // A terminal producer failure or an unusable doctor result is already a
    // decisive activation failure. Waiting out the full registration budget
    // would only repeat the old stuck-installer behaviour.
    if (latest?.observation?.producerCommitSha === reviewedRelease.commitSha
      && ['failed', 'cancelled'].includes(latest.observation.lastTerminalStatus)) return latest;
    if (latest?.status === 'fail' && !latest?.observation) requireCondition(false, 'scheduler_activation_failed');
    if (now() >= deadline) break;
    await wait(Math.min(pollMilliseconds, Math.max(1, deadline - now())));
  } while (now() < deadline);
  requireCondition(false, 'scheduler_activation_failed');
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
  let failureStage = 'stage_release';
  try {
    await filesystem.stage(validated);
    failureStage = 'verify_release';
    await filesystem.verifyStaged(validated);
    failureStage = 'publish_release';
    await filesystem.publishRelease(validated);
    await phase('release_published');
    failureStage = 'disable_prior_owners';
    await scheduler.disablePriorOwners(priorScheduler);
    await phase('old_owners_disabled');
    failureStage = 'load_new_owner';
    await scheduler.loadNewOwner(validated);
    await phase('new_owner_loaded');
    // Do not await the producer's full terminal result. Its first durable
    // heartbeat proves that the new owner registered and took responsibility;
    // the release state machine will later demand terminal success + doctor
    // PASS before enabling actions or deploying the consumer.
    failureStage = 'first_heartbeat';
    const doctor = await waitForFirstHeartbeat({ scheduler, reviewedRelease });
    // A newly reviewed producer cannot be fully healthy until it has published
    // its first same-release projection. Build the typed observation first so
    // assessActivationHealth can admit only the closed read-only bootstrap
    // reasons; malformed or broader failing doctor output still rolls back.
    failureStage = 'health_assessment';
    requireCondition(doctor?.observation && typeof doctor.observation === 'object', 'scheduler_activation_failed');
    requireCondition(typeof filesystem.writeHealthObservation === 'function', 'scheduler_activation_failed');
    const observation = buildInstalledRuntimeHealthObservation({ manifest: validated, reviewedRelease, doctor });
    const activationHealth = assessActivationHealth(observation, reviewedRelease);
    failureStage = 'publish_health';
    await filesystem.writeHealthObservation(observation);
    await phase('doctor_passed');
    await phase('complete');
    return Object.freeze({ disposition: activationHealth.disposition, manifestSha256: validated.manifestSha256 });
  } catch (error) {
    const reason = ACTIVATION_FAILURE_REASONS.has(error?.code) ? error.code : 'scheduler_activation_failed';
    try {
      await scheduler.restore(priorScheduler);
      await filesystem.restoreActivePointer(priorPointer);
      await filesystem.cleanupIncomplete();
      await journal.rollback({ reason, stage: ACTIVATION_FAILURE_STAGES.has(failureStage) ? failureStage : 'health_assessment' });
    } catch {
      throw new RuntimeInstallationError('scheduler_rollback_failed');
    }
    return Object.freeze({ disposition: 'rolled_back', reason,
      failureStage: ACTIVATION_FAILURE_STAGES.has(failureStage) ? failureStage : 'health_assessment',
      manifestSha256: validated.manifestSha256 });
  }
}

module.exports = { INSTALLATION_SCHEMA, RuntimeInstallationError, activateTrackedRuntimeRelease,
  assessActivationHealth, hasFirstHeartbeat, waitForFirstHeartbeat, validateRuntimeInstallationManifest,
  ACTIVATION_FAILURE_STAGES, ACTIVATION_HEARTBEAT_MAXIMUM_SECONDS, ACTIVATION_HEARTBEAT_POLL_MILLISECONDS };
