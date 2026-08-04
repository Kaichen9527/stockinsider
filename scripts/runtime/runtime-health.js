'use strict';

const { invariant } = require('./codec');

const REASON_ORDER = Object.freeze([
  'manifest_missing', 'manifest_noncanonical', 'review_binding_invalid',
  'worker_hash_mismatch', 'config_hash_mismatch',
  'scheduler_rollback_package_missing', 'scheduler_rollback_hash_mismatch',
  'activation_journal_incomplete', 'active_pointer_invalid',
  'scheduler_plist_mismatch', 'scheduler_owner_mismatch',
  'competing_scheduler', 'lease_invalid', 'state_schema_mismatch',
  'last_run_nonterminal', 'negative_run_duration', 'stuck_runs_present',
  'projection_missing', 'projection_hash_mismatch', 'projection_stale',
  'consumer_producer_incompatible',
]);

function wholeSecond(value = new Date().toISOString()) {
  const parsed = new Date(value);
  invariant(!Number.isNaN(parsed.getTime()), 'runtime health checkedAt');
  return parsed.toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function assessTrackedRuntimeHealth(observation) {
  const present = new Set();
  const add = (condition, reason) => { if (condition) present.add(reason); };
  add(!observation.manifestPresent, 'manifest_missing');
  add(observation.manifestPresent && !observation.manifestCanonical, 'manifest_noncanonical');
  add(!observation.reviewBindingValid, 'review_binding_invalid');
  add(!observation.workerHashMatches, 'worker_hash_mismatch');
  add(!observation.configHashMatches, 'config_hash_mismatch');
  add(!observation.schedulerRollbackPackagePresent, 'scheduler_rollback_package_missing');
  add(observation.schedulerRollbackPackagePresent && !observation.schedulerRollbackHashMatches, 'scheduler_rollback_hash_mismatch');
  add(!observation.activationJournalComplete, 'activation_journal_incomplete');
  add(!observation.activePointerValid, 'active_pointer_invalid');
  add(!observation.schedulerPlistMatches, 'scheduler_plist_mismatch');
  add(observation.schedulerOwner !== 'com.stockinsider.auth-source-worker', 'scheduler_owner_mismatch');
  add((observation.competingOwners?.length ?? 0) > 0, 'competing_scheduler');
  add(observation.leaseStatus === 'invalid', 'lease_invalid');
  add(observation.stateSchema !== 'stockinsider-producer-state-v1', 'state_schema_mismatch');
  add(Boolean(observation.lastRunNonterminal), 'last_run_nonterminal');
  add(Boolean(observation.negativeRunDuration), 'negative_run_duration');
  add((observation.stuckRunCount ?? 0) > 0, 'stuck_runs_present');
  add(observation.projectionFreshness === 'missing', 'projection_missing');
  add(observation.projectionFreshness === 'invalid', 'projection_hash_mismatch');
  add(observation.projectionFreshness === 'stale', 'projection_stale');
  add(observation.consumerCompatibility !== 'compatible', 'consumer_producer_incompatible');
  const reasons = REASON_ORDER.filter((reason) => present.has(reason));
  const competingOwners = [...new Set(observation.competingOwners ?? [])].sort().slice(0, 8);
  const stuckRunCount = Math.max(0, Math.trunc(observation.stuckRunCount ?? 0));
  invariant(['absent', 'active', 'expired', 'invalid'].includes(observation.leaseStatus), 'runtime health lease');
  invariant(['fresh', 'stale', 'missing', 'invalid'].includes(observation.projectionFreshness), 'runtime health projection');
  invariant(['compatible', 'producer_newer', 'consumer_newer', 'unknown'].includes(observation.consumerCompatibility), 'runtime health compatibility');
  return Object.freeze({
    schema: 'stockinsider-runtime-health-v1.1', status: reasons.length === 0 ? 'pass' : 'fail',
    checkedAt: wholeSecond(observation.checkedAt),
    producer: {
      commitSha: observation.producerCommitSha ?? null,
      reviewedTreeSha: observation.reviewedTreeSha ?? null,
      workerSha256: observation.workerSha256 ?? null,
      schedulerConfigSha256: observation.schedulerConfigSha256 ?? null,
      schedulerRollbackPackageSha256: observation.schedulerRollbackPackageSha256 ?? null,
      manifestSha256: observation.manifestSha256 ?? null,
    },
    scheduler: {
      owner: observation.schedulerOwner ?? null,
      ownerPlistSha256: observation.ownerPlistSha256 ?? null,
      competingOwners,
      leaseStatus: observation.leaseStatus,
    },
    runtime: {
      stateSchema: observation.stateSchema ?? null,
      lastTerminalRunAt: observation.lastTerminalRunAt ?? null,
      lastTerminalStatus: observation.lastTerminalStatus ?? null,
      stuckRunCount,
    },
    projection: {
      asOf: observation.projectionAsOf ?? null,
      checksum: observation.projectionChecksum ?? null,
      freshness: observation.projectionFreshness,
    },
    consumer: {
      commitSha: observation.consumerCommitSha ?? null,
      acceptedProducerSchema: 'stockinsider-producer-state-v1',
      compatibility: observation.consumerCompatibility,
    },
    reasons,
  });
}

function buildInstalledRuntimeHealthObservation({ manifest, reviewedRelease, doctor = {} }) {
  invariant(doctor && doctor.observation && typeof doctor.observation === 'object', 'runtime doctor observation required');
  const observed = doctor.observation;
  return Object.freeze({
    activationJournalComplete: observed.activationJournalComplete === true,
    activePointerValid: observed.activePointerValid === true,
    competingOwners: Array.isArray(observed.competingOwners) ? observed.competingOwners : [],
    configHashMatches: observed.configSha256 === reviewedRelease.configSha256,
    consumerCommitSha: observed.consumerCommitSha ?? null,
    consumerCompatibility: observed.consumerCompatibility ?? 'unknown',
    lastRunNonterminal: observed.lastRunNonterminal === true,
    lastTerminalRunAt: observed.lastTerminalRunAt ?? null,
    lastTerminalStatus: observed.lastTerminalStatus ?? null,
    leaseStatus: observed.leaseStatus ?? 'invalid',
    manifestCanonical: observed.manifestCanonical === true,
    manifestPresent: observed.manifestPresent === true,
    manifestSha256: manifest.manifestSha256,
    negativeRunDuration: observed.negativeRunDuration === true,
    ownerPlistSha256: observed.ownerPlistSha256 ?? null,
    producerCommitSha: reviewedRelease.commitSha,
    projectionAsOf: observed.projectionAsOf ?? null,
    projectionChecksum: observed.projectionChecksum ?? null,
    projectionFreshness: observed.projectionFreshness ?? 'missing',
    reviewBindingValid: observed.reviewAttestationSha256 === reviewedRelease.reviewAttestationSha256,
    reviewedTreeSha: reviewedRelease.treeSha,
    schedulerConfigSha256: reviewedRelease.configSha256,
    schedulerOwner: observed.schedulerOwner ?? null,
    schedulerPlistMatches: observed.schedulerPlistSha256 === observed.ownerPlistSha256,
    schedulerRollbackHashMatches: observed.schedulerRollbackPackageSha256 === manifest.schedulerRollback.sha256,
    schedulerRollbackPackagePresent: observed.schedulerRollbackPackagePresent === true,
    schedulerRollbackPackageSha256: manifest.schedulerRollback.sha256,
    stateSchema: observed.stateSchema ?? null,
    stuckRunCount: observed.stuckRunCount ?? 0,
    workerHashMatches: observed.workerSha256 === reviewedRelease.workerSha256,
    workerSha256: reviewedRelease.workerSha256,
  });
}

module.exports = { REASON_ORDER, assessTrackedRuntimeHealth, buildInstalledRuntimeHealthObservation };
