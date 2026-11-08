/** Deterministic staging design only: no imports, runner, installer or adapter.
 * This catalog does not establish a timer, identity, lock, lease or source grant.
 */
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

export const SCHEDULE_CANDIDATE = freeze({
  schemaVersion: 'stockinsider-staging-schedule-candidate-v1',
  scope: 'staging-source-only',
  namespaceIntent: 'stockinsider-vnext-oct22-staging',
  enabled: false,
  executable: false,
  installation: 'NOT_IMPLEMENTED',
  timezone: 'Asia/Taipei',
  jobs: [
    { id: 'rank_publish_2030', wallClock: '20:30:00', purpose: 'immutable_ranking_publication_from_qualified_active_pool', sourceReference: 'web/src/lib/vnext/ranking-command.ts#publishCycleRanking', admission: 'official_completed_tw_session_and_postclose_required', sourceCutoff: 'original_scheduled_slot' },
    { id: 'shared_market_0815', wallClock: '08:15:00', purpose: 'one_frozen_shared_market_snapshot', sourceReference: 'web/src/lib/vnext/market-ai-worker.ts#runMarketInterpretation', admission: 'official_current_tw_session_and_latest_completed_session_pair_required', sourceCutoff: 'original_scheduled_slot' },
  ],
  delivery: {
    persistent: false,
    catchup: false,
    automaticRetry: false,
    queueWhileLocked: false,
    weekdayInference: false,
    lockContention: 'skip_without_work_or_charge',
    candidateStartWindowMs: 300000,
    windowBoundary: 'half_open_original_slot_to_slot_plus_five_minutes',
    deadline: 'original_slot_deadline_required_and_rechecked_after_nonblocking_lock',
  },
  serialization: {
    sharedLockIntent: 'stockinsider-vnext-oct22-staging-write',
    participants: 'both_jobs_and_every_isolated_staging_writer',
    acquisition: 'nonblocking',
    implementation: 'NOT_IMPLEMENTED',
    existingDatabaseWriterLease: 'MANDATORY_separate_isolated_binding_required',
    replacesDatabaseLease: false,
    processLockEstablishesSingleProductionOwner: false,
  },
  incompleteInputs: 'retain_previous_immutable_snapshot_with_original_date_and_gaps',
  reuse: 'existing_calendar_ledger_source_and_writer_authority_only',
  transportGrant: 'NONE_readonly_vnext-preflight-v1_cannot_run_workers',
  stagingAcceptance: 'NOT_RUN',
});

/** @typedef {{id:string, state:'NOT_OBSERVED', requiredEvidence:string}} ScheduleRequirement */
/** @type {ReadonlyArray<Readonly<ScheduleRequirement>>} */
export const SCHEDULE_REQUIREMENTS = freeze([
  { id: 'official_calendar', state: 'NOT_OBSERVED', requiredEvidence: 'Current authoritative TWSE and TPEX session/calendar rows, scheduled slot binding, completed/postclose status for ranking and explicit current/previous-session pair for 08:15; weekdays and cached completed-only rows are insufficient' },
  { id: 'durable_ledger_and_idempotency', state: 'NOT_OBSERVED', requiredEvidence: 'Existing durable admission, actually-started attempt budget, writer lease, once-only original intent and uncertain-response recovery bound to the isolated writer; ranking replay alone cannot make the preceding source/model/research cycle idempotent' },
  { id: 'current_source_and_publication_bindings', state: 'NOT_OBSERVED', requiredEvidence: 'Current permitted source, frozen market, price, financial and independent publication/review bindings at original slot cutoff; a 20:30 clock does not prove completion of source work scheduled at 20:40' },
  { id: 'isolated_runtime_and_all_writer_serialization', state: 'NOT_OBSERVED', requiredEvidence: 'Verified independent service/database/queue/storage/network/identity, one nonblocking shared lock for both jobs and every isolated writer, existing DB lease, reviewed deadline and current source revision; no production environment or credential reuse' },
  { id: 'single_production_timer_inventory', state: 'NOT_OBSERVED', requiredEvidence: 'Current trusted pinned-host observation of deployed release, enabled/active timers and services, root/user cron, other users and hosted schedulers; reconcile legacy daily 21:00 research-cycle, source/data timers and installer enable paths before any cutover. Repository declarations or plan booleans cannot establish the live single owner' },
  { id: 'reviewed_worker_execution_integration', state: 'NOT_OBSERVED', requiredEvidence: 'Separately reviewed authenticated isolated worker integration and execution approval; existing restricted read-only forced command grants capacity observation only' },
]);

function rejectOverrides(overrides) {
  if (overrides.length !== 0) throw Error('schedule_candidate_overrides_forbidden');
}

/** No caller-supplied readiness/config/fixture object can enable this facade. */
export function inspectScheduleCandidate(...overrides) {
  rejectOverrides(overrides);
  return freeze({ state: 'Disabled', executable: false, candidate: SCHEDULE_CANDIDATE, requirements: SCHEDULE_REQUIREMENTS, productionTimerInventory: 'NOT_OBSERVED', workersInvoked: 0, networkAttempts: 0, writes: 0, stagingAcceptance: 'NOT_RUN' });
}

export async function executeScheduledCandidate(jobId, ...overrides) {
  rejectOverrides(overrides);
  if (!SCHEDULE_CANDIDATE.jobs.some(job => job.id === jobId)) throw Error('unknown_staging_schedule_candidate');
  const error = Error('staging_schedule_execution_disabled');
  error.code = 'STAGING_SCHEDULE_DISABLED';
  error.exitCode = 78;
  throw error;
}
