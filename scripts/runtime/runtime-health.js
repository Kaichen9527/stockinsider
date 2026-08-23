'use strict';

const { invariant } = require('./codec');

const REASON_ORDER = Object.freeze([
  'manifest_missing', 'manifest_noncanonical', 'review_binding_invalid',
  'worker_hash_mismatch', 'config_hash_mismatch',
  'scheduler_rollback_package_missing', 'scheduler_rollback_hash_mismatch',
  'activation_journal_incomplete', 'active_pointer_invalid',
  'scheduler_plist_mismatch', 'scheduler_owner_mismatch',
  'competing_scheduler', 'lease_invalid', 'state_schema_mismatch',
  'last_run_nonterminal', 'last_run_failed', 'negative_run_duration', 'stuck_runs_present',
  'projection_missing', 'projection_hash_mismatch', 'projection_stale',
  'consumer_producer_incompatible', 'disk_capacity_low', 'source_audit_capacity_exceeded',
]);

const TERMINAL_STATUSES = Object.freeze(['success', 'failed', 'cancelled']);
const LEASE_STATUSES = Object.freeze(['absent', 'active', 'expired', 'invalid']);
const PROJECTION_FRESHNESS = Object.freeze(['fresh', 'stale', 'missing', 'invalid']);
const CONSUMER_COMPATIBILITY = Object.freeze(['compatible', 'producer_newer', 'consumer_newer', 'unknown']);

function exactEnum(value, values, fallback) {
  return typeof value === 'string' && values.includes(value) ? value : fallback;
}

function wholeSecond(value = new Date().toISOString()) {
  const parsed = new Date(value);
  invariant(!Number.isNaN(parsed.getTime()), 'runtime health checkedAt');
  return parsed.toISOString().replace(/\.\d{3}Z$/u, 'Z');
}

function assessTrackedRuntimeHealth(observation) {
  const terminalStatus = observation.lastTerminalStatus === null || observation.lastTerminalStatus === undefined
    ? null : exactEnum(observation.lastTerminalStatus, TERMINAL_STATUSES, null);
  const leaseStatus = exactEnum(observation.leaseStatus, LEASE_STATUSES, 'invalid');
  const projectionFreshness = exactEnum(observation.projectionFreshness, PROJECTION_FRESHNESS, 'invalid');
  const consumerCompatibility = exactEnum(observation.consumerCompatibility, CONSUMER_COMPATIBILITY, 'unknown');
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
  add(leaseStatus === 'invalid', 'lease_invalid');
  add(observation.stateSchema !== 'stockinsider-producer-state-v1'
    || (observation.lastTerminalStatus !== null && observation.lastTerminalStatus !== undefined && terminalStatus === null),
  'state_schema_mismatch');
  add(Boolean(observation.lastRunNonterminal), 'last_run_nonterminal');
  add(terminalStatus === 'failed' || terminalStatus === 'cancelled', 'last_run_failed');
  add(Boolean(observation.negativeRunDuration), 'negative_run_duration');
  add((observation.stuckRunCount ?? 0) > 0, 'stuck_runs_present');
  add(projectionFreshness === 'missing', 'projection_missing');
  add(projectionFreshness === 'invalid', 'projection_hash_mismatch');
  add(projectionFreshness === 'stale', 'projection_stale');
  add(consumerCompatibility !== 'compatible', 'consumer_producer_incompatible');
  add(observation.diskHealth?.reasons?.includes('disk_capacity_low'), 'disk_capacity_low');
  add(observation.diskHealth?.reasons?.includes('source_audit_capacity_exceeded'), 'source_audit_capacity_exceeded');
  const reasons = REASON_ORDER.filter((reason) => present.has(reason));
  const competingOwners = [...new Set(observation.competingOwners ?? [])].sort().slice(0, 8);
  const stuckRunCount = Math.max(0, Math.trunc(observation.stuckRunCount ?? 0));
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
      leaseStatus,
    },
    runtime: {
      stateSchema: observation.stateSchema ?? null,
      lastTerminalRunAt: observation.lastTerminalRunAt ?? null,
      lastTerminalStatus: terminalStatus,
      stuckRunCount,
      disk: observation.diskHealth ?? null,
    },
    projection: {
      asOf: observation.projectionAsOf ?? null,
      checksum: observation.projectionChecksum ?? null,
      freshness: projectionFreshness,
    },
    consumer: {
      commitSha: observation.consumerCommitSha ?? null,
      acceptedProducerSchema: 'stockinsider-producer-state-v1',
      compatibility: consumerCompatibility,
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
    consumerCompatibility: exactEnum(observed.consumerCompatibility, CONSUMER_COMPATIBILITY, 'unknown'),
    lastRunNonterminal: observed.lastRunNonterminal === true,
    lastTerminalRunAt: observed.lastTerminalRunAt ?? null,
    lastTerminalStatus: exactEnum(observed.lastTerminalStatus, TERMINAL_STATUSES, null),
    leaseStatus: exactEnum(observed.leaseStatus, LEASE_STATUSES, 'invalid'),
    manifestCanonical: observed.manifestCanonical === true,
    manifestPresent: observed.manifestPresent === true,
    manifestSha256: manifest.manifestSha256,
    negativeRunDuration: observed.negativeRunDuration === true,
    ownerPlistSha256: observed.ownerPlistSha256 ?? null,
    producerCommitSha: reviewedRelease.commitSha,
    projectionAsOf: observed.projectionAsOf ?? null,
    projectionChecksum: observed.projectionChecksum ?? null,
    projectionFreshness: exactEnum(observed.projectionFreshness, PROJECTION_FRESHNESS, 'missing'),
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
    diskHealth: observed.diskHealth ?? null,
    workerHashMatches: observed.workerSha256 === reviewedRelease.workerSha256,
    workerSha256: reviewedRelease.workerSha256,
  });
}

module.exports = { REASON_ORDER, assessTrackedRuntimeHealth, buildInstalledRuntimeHealthObservation };
