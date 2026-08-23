export type RuntimeHealthObservation = {
  checkedAt?: string;
  manifestPresent: boolean; manifestCanonical: boolean; reviewBindingValid: boolean;
  workerHashMatches: boolean; configHashMatches: boolean;
  schedulerRollbackPackagePresent: boolean; schedulerRollbackHashMatches: boolean;
  activationJournalComplete: boolean; activePointerValid: boolean; schedulerPlistMatches: boolean;
  schedulerOwner: 'com.stockinsider.auth-source-worker' | null; ownerPlistSha256?: string | null;
  competingOwners?: string[]; leaseStatus: 'absent' | 'active' | 'expired' | 'invalid';
  stateSchema: 'stockinsider-producer-state-v1' | null;
  lastTerminalRunAt?: string | null; lastTerminalStatus?: 'success' | 'failed' | 'cancelled' | null;
  lastRunNonterminal?: boolean; negativeRunDuration?: boolean; stuckRunCount?: number;
  projectionAsOf?: string | null; projectionChecksum?: string | null;
  projectionFreshness: 'fresh' | 'stale' | 'missing' | 'invalid';
  consumerCommitSha?: string | null; consumerCompatibility: 'compatible' | 'producer_newer' | 'consumer_newer' | 'unknown';
  producerCommitSha?: string | null; reviewedTreeSha?: string | null; workerSha256?: string | null;
  schedulerConfigSha256?: string | null; schedulerRollbackPackageSha256?: string | null; manifestSha256?: string | null;
  diskHealth?: { status?: 'pass' | 'warn' | 'fail'; reasons?: string[] } | null;
};

export function runtimeObservationMatchesProducer(observation: Partial<RuntimeHealthObservation> | undefined,
  producer: { commitSha: string | null; workerSha256: string | null; schedulerConfigSha256: string | null }) {
  if (!observation || typeof observation !== 'object') return false;
  return (!producer.commitSha || observation.producerCommitSha === producer.commitSha) &&
    (!producer.workerSha256 || observation.workerSha256 === producer.workerSha256) &&
    (!producer.schedulerConfigSha256 || observation.schedulerConfigSha256 === producer.schedulerConfigSha256);
}

const REASON_ORDER = [
  'manifest_missing','manifest_noncanonical','review_binding_invalid','worker_hash_mismatch','config_hash_mismatch',
  'scheduler_rollback_package_missing','scheduler_rollback_hash_mismatch','activation_journal_incomplete','active_pointer_invalid',
  'scheduler_plist_mismatch','scheduler_owner_mismatch','competing_scheduler','lease_invalid','state_schema_mismatch',
  'last_run_nonterminal','last_run_failed','negative_run_duration','stuck_runs_present','projection_missing','projection_hash_mismatch',
  'projection_stale','consumer_producer_incompatible','disk_capacity_low','source_audit_capacity_exceeded',
] as const;

const terminalStatuses = ['success', 'failed', 'cancelled'] as const;
const leaseStatuses = ['absent', 'active', 'expired', 'invalid'] as const;
const projectionFreshnessValues = ['fresh', 'stale', 'missing', 'invalid'] as const;
const compatibilityValues = ['compatible', 'producer_newer', 'consumer_newer', 'unknown'] as const;

function exactEnum<const T extends readonly string[]>(value: unknown, values: T, fallback: T[number]): T[number] {
  return typeof value === 'string' && (values as readonly string[]).includes(value) ? value as T[number] : fallback;
}

export function assessTrackedRuntimeHealth(observation: RuntimeHealthObservation) {
  const terminalStatus = observation.lastTerminalStatus == null ? null
    : exactEnum(observation.lastTerminalStatus, terminalStatuses, null as never);
  const leaseStatus = exactEnum(observation.leaseStatus, leaseStatuses, 'invalid');
  const projectionFreshness = exactEnum(observation.projectionFreshness, projectionFreshnessValues, 'invalid');
  const consumerCompatibility = exactEnum(observation.consumerCompatibility, compatibilityValues, 'unknown');
  const present = new Set<string>();
  const add = (condition: boolean, reason: string) => { if (condition) present.add(reason); };
  add(!observation.manifestPresent, 'manifest_missing'); add(observation.manifestPresent && !observation.manifestCanonical, 'manifest_noncanonical');
  add(!observation.reviewBindingValid, 'review_binding_invalid'); add(!observation.workerHashMatches, 'worker_hash_mismatch'); add(!observation.configHashMatches, 'config_hash_mismatch');
  add(!observation.schedulerRollbackPackagePresent, 'scheduler_rollback_package_missing'); add(observation.schedulerRollbackPackagePresent && !observation.schedulerRollbackHashMatches, 'scheduler_rollback_hash_mismatch');
  add(!observation.activationJournalComplete, 'activation_journal_incomplete'); add(!observation.activePointerValid, 'active_pointer_invalid'); add(!observation.schedulerPlistMatches, 'scheduler_plist_mismatch');
  add(observation.schedulerOwner !== 'com.stockinsider.auth-source-worker', 'scheduler_owner_mismatch'); add((observation.competingOwners?.length ?? 0) > 0, 'competing_scheduler');
  add(leaseStatus === 'invalid', 'lease_invalid'); add(observation.stateSchema !== 'stockinsider-producer-state-v1'
    || (observation.lastTerminalStatus != null && terminalStatus === null), 'state_schema_mismatch');
  add(Boolean(observation.lastRunNonterminal), 'last_run_nonterminal'); add(Boolean(observation.negativeRunDuration), 'negative_run_duration'); add((observation.stuckRunCount ?? 0) > 0, 'stuck_runs_present');
  add(terminalStatus === 'failed' || terminalStatus === 'cancelled', 'last_run_failed');
  add(projectionFreshness === 'missing', 'projection_missing'); add(projectionFreshness === 'invalid', 'projection_hash_mismatch'); add(projectionFreshness === 'stale', 'projection_stale');
  add(consumerCompatibility !== 'compatible', 'consumer_producer_incompatible');
  add(observation.diskHealth?.reasons?.includes('disk_capacity_low') === true, 'disk_capacity_low');
  add(observation.diskHealth?.reasons?.includes('source_audit_capacity_exceeded') === true, 'source_audit_capacity_exceeded');
  const checkedAt = new Date(observation.checkedAt ?? Date.now()).toISOString().replace(/\.\d{3}Z$/u, 'Z');
  return {
    schema: 'stockinsider-runtime-health-v1.1', status: present.size === 0 ? 'pass' : 'fail', checkedAt,
    producer: { commitSha: observation.producerCommitSha ?? null, reviewedTreeSha: observation.reviewedTreeSha ?? null,
      workerSha256: observation.workerSha256 ?? null, schedulerConfigSha256: observation.schedulerConfigSha256 ?? null,
      schedulerRollbackPackageSha256: observation.schedulerRollbackPackageSha256 ?? null, manifestSha256: observation.manifestSha256 ?? null },
    scheduler: { owner: observation.schedulerOwner, ownerPlistSha256: observation.ownerPlistSha256 ?? null,
      competingOwners: [...new Set(observation.competingOwners ?? [])].sort().slice(0, 8), leaseStatus },
    runtime: { stateSchema: observation.stateSchema, lastTerminalRunAt: observation.lastTerminalRunAt ?? null,
      lastTerminalStatus: terminalStatus, stuckRunCount: Math.max(0, Math.trunc(observation.stuckRunCount ?? 0)),
      disk: observation.diskHealth ?? null },
    projection: { asOf: observation.projectionAsOf ?? null, checksum: observation.projectionChecksum ?? null, freshness: projectionFreshness },
    consumer: { commitSha: observation.consumerCommitSha ?? null, acceptedProducerSchema: 'stockinsider-producer-state-v1', compatibility: consumerCompatibility },
    reasons: REASON_ORDER.filter((reason) => present.has(reason)),
  } as const;
}
