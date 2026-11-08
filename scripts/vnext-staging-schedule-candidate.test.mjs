import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { SCHEDULE_CANDIDATE, SCHEDULE_REQUIREMENTS, inspectScheduleCandidate, executeScheduledCandidate } from '../deployment/staging/vnext/schedule-candidate.mjs';

test('staging catalog fixes Taipei 20:30 ranking and 08:15 shared market, without enabling a schedule', () => {
  assert.equal(SCHEDULE_CANDIDATE.schemaVersion, 'stockinsider-staging-schedule-candidate-v1');
  assert.equal(SCHEDULE_CANDIDATE.scope, 'staging-source-only');
  assert.equal(SCHEDULE_CANDIDATE.timezone, 'Asia/Taipei');
  assert.deepEqual(SCHEDULE_CANDIDATE.jobs.map(({ id, wallClock }) => ({ id, wallClock })), [
    { id: 'rank_publish_2030', wallClock: '20:30:00' }, { id: 'shared_market_0815', wallClock: '08:15:00' },
  ]);
  assert.equal(SCHEDULE_CANDIDATE.enabled, false);
  assert.equal(SCHEDULE_CANDIDATE.executable, false);
  assert.equal(SCHEDULE_CANDIDATE.installation, 'NOT_IMPLEMENTED');
  assert.equal(SCHEDULE_CANDIDATE.stagingAcceptance, 'NOT_RUN');
  assert.equal(SCHEDULE_CANDIDATE.jobs[0].purpose, 'immutable_ranking_publication_from_qualified_active_pool');
  assert.equal(SCHEDULE_CANDIDATE.jobs[0].sourceReference, 'web/src/lib/vnext/ranking-command.ts#publishCycleRanking');
  assert.ok(SCHEDULE_CANDIDATE.jobs.every(job => !job.sourceReference.includes('research-cycle')));
});

test('delivery design forbids weekday inference, restart catchup, retry and lock queues', () => {
  assert.deepEqual(SCHEDULE_CANDIDATE.delivery, {
    persistent: false, catchup: false, automaticRetry: false, queueWhileLocked: false,
    weekdayInference: false, lockContention: 'skip_without_work_or_charge',
    candidateStartWindowMs: 300000, windowBoundary: 'half_open_original_slot_to_slot_plus_five_minutes',
    deadline: 'original_slot_deadline_required_and_rechecked_after_nonblocking_lock',
  });
  assert.match(SCHEDULE_CANDIDATE.jobs[0].admission, /official_completed_tw_session_and_postclose/u);
  assert.match(SCHEDULE_CANDIDATE.jobs[1].admission, /official_current_tw_session_and_latest_completed_session_pair/u);
  assert.ok(SCHEDULE_CANDIDATE.jobs.every(job => job.sourceCutoff === 'original_scheduled_slot'));
});

test('shared process-lock intent covers all isolated writers and cannot replace the durable database authority', () => {
  const lock = SCHEDULE_CANDIDATE.serialization;
  assert.equal(lock.sharedLockIntent, 'stockinsider-vnext-oct22-staging-write');
  assert.equal(lock.participants, 'both_jobs_and_every_isolated_staging_writer');
  assert.equal(lock.acquisition, 'nonblocking');
  assert.equal(lock.implementation, 'NOT_IMPLEMENTED');
  assert.equal(lock.replacesDatabaseLease, false);
  assert.equal(lock.processLockEstablishesSingleProductionOwner, false);
  assert.equal(lock.existingDatabaseWriterLease, 'MANDATORY_separate_isolated_binding_required');
});

test('all runtime and trusted production timer requirements remain unobserved', () => {
  assert.deepEqual(SCHEDULE_REQUIREMENTS.map(item => item.id), ['official_calendar', 'durable_ledger_and_idempotency', 'current_source_and_publication_bindings', 'isolated_runtime_and_all_writer_serialization', 'single_production_timer_inventory', 'reviewed_worker_execution_integration']);
  assert.ok(SCHEDULE_REQUIREMENTS.every(item => item.state === 'NOT_OBSERVED'));
  assert.match(SCHEDULE_REQUIREMENTS.find(item => item.id === 'single_production_timer_inventory').requiredEvidence, /Current trusted pinned-host observation/u);
  assert.match(SCHEDULE_REQUIREMENTS.find(item => item.id === 'durable_ledger_and_idempotency').requiredEvidence, /ranking replay alone cannot/u);
  assert.equal(SCHEDULE_CANDIDATE.incompleteInputs, 'retain_previous_immutable_snapshot_with_original_date_and_gaps');
});

test('inspection and worker facade cannot be enabled by metadata, callbacks, or a mutated catalog clone', async () => {
  const ready = { enabled: true, calendarVerified: true, ledgerReady: true, sourceBound: true, singleProductionTimer: true };
  let calls = 0;
  for (const extra of [ready, { adapter: () => { calls++; } }, { ...structuredClone(SCHEDULE_CANDIDATE), enabled: true }, undefined]) {
    assert.throws(() => inspectScheduleCandidate(extra), /schedule_candidate_overrides_forbidden/u);
    await assert.rejects(executeScheduledCandidate('rank_publish_2030', extra), /schedule_candidate_overrides_forbidden/u);
  }
  assert.equal(calls, 0);
  for (const job of SCHEDULE_CANDIDATE.jobs) await assert.rejects(executeScheduledCandidate(job.id), error => error.code === 'STAGING_SCHEDULE_DISABLED' && error.exitCode === 78);
  await assert.rejects(executeScheduledCandidate('vnext-preflight-v1'), /unknown_staging_schedule_candidate/u);
  const status = inspectScheduleCandidate();
  assert.equal(status.state, 'Disabled');
  assert.equal(status.productionTimerInventory, 'NOT_OBSERVED');
  assert.equal(status.workersInvoked + status.networkAttempts + status.writes, 0);
  assert.equal(status.stagingAcceptance, 'NOT_RUN');
});

test('catalog and requirements cannot be mutated into an execution grant', () => {
  assert.throws(() => { SCHEDULE_CANDIDATE.enabled = true; }, TypeError);
  assert.throws(() => { SCHEDULE_CANDIDATE.jobs[0].wallClock = '21:00:00'; }, TypeError);
  assert.throws(() => { SCHEDULE_REQUIREMENTS[0].state = 'ready'; }, TypeError);
  assert.throws(() => { inspectScheduleCandidate().state = 'Ready'; }, TypeError);
});

test('schedule design does not extend the restricted read-only forced command or import live workers', () => {
  assert.equal(SCHEDULE_CANDIDATE.transportGrant, 'NONE_readonly_vnext-preflight-v1_cannot_run_workers');
  const source = fs.readFileSync(new URL('../deployment/staging/vnext/schedule-candidate.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /^\s*import\b|\bimport\s*\(|\brequire\s*\(|process\.|\bfetch\s*\(|\bset(?:Timeout|Interval)\s*\(|\b(?:spawn|execFile)\s*\(/mu);
  assert.doesNotMatch(source, /EnvironmentFile=|ExecStart=|\[Install\]|User=root|ProxyCommand|\/etc\/stockinsider\/|\/opt\/stockinsider\/current/u);
});

test('retained production source conflict is explicit; source files cannot prove current remote inventory', () => {
  const read = path => fs.readFileSync(new URL('../' + path, import.meta.url), 'utf8');
  const timer = read('deployment/vps/systemd/stockinsider-research-cycle.timer');
  const service = read('deployment/vps/systemd/stockinsider-research-cycle.service');
  const reconcile = read('deployment/vps/systemd/stockinsider-taiwan-data-final-reconcile.timer');
  const installer = read('deployment/vps/install-systemd-schedules.sh');
  assert.match(timer, /^OnCalendar=\*-\*-\* 21:00:00 Asia\/Taipei$/mu);
  assert.match(timer, /^Persistent=true$/mu);
  assert.match(service, /^User=root$/mu);
  assert.match(service, /flock -w 1800 \/run\/lock\/stockinsider-production-write\.lock/u);
  assert.match(installer, /systemctl enable --now stockinsider-source-refresh\.timer stockinsider-research-cycle\.timer/u);
  assert.match(reconcile, /^OnCalendar=\*-\*-\* 20:40:00 Asia\/Taipei$/mu);
  assert.equal(inspectScheduleCandidate().productionTimerInventory, 'NOT_OBSERVED');
});

test('four inert unit candidates have hard-false root condition and no install or production dependencies', () => {
  for (const [name, clock] of [['rank-publish', '20:30:00'], ['shared-market', '08:15:00']]) {
    const base = 'stockinsider-vnext-oct22-staging-' + name;
    for (const extension of ['timer', 'service']) {
      const source = fs.readFileSync(new URL('../deployment/staging/vnext/' + base + '.' + extension, import.meta.url), 'utf8');
      assert.match(source, /^ConditionPathExists=!\/$/mu);
      assert.doesNotMatch(source, /\[Install\]|WantedBy=|RequiredBy=|Environment(?:File)?=|WorkingDirectory=|User=root|\/opt\/|\/etc\/stockinsider|flock|curl|\bnode\b|network-online|stockinsider-internal-worker/u);
      if (extension === 'timer') {
        assert.ok(source.includes('OnCalendar=*-*-* ' + clock + ' Asia/Taipei\n'));
        assert.match(source, /^Persistent=false$/mu);
        assert.match(source, /^RandomizedDelaySec=0$/mu);
        assert.match(source, /^AccuracySec=1s$/mu);
        assert.ok(source.includes('Unit=' + base + '.service\n'));
      } else {
        assert.match(source, /^Type=oneshot$/mu);
        assert.match(source, /^User=sivnext-schedule$/mu);
        assert.match(source, /^ExecStart=\/usr\/bin\/false$/mu);
        assert.equal(source.split('\n').filter(line => line.startsWith('Exec')).length, 1);
        for (const option of ['NoNewPrivileges=true', 'PrivateNetwork=true', 'PrivateTmp=true', 'ProtectSystem=strict', 'ProtectHome=true']) assert.ok(source.includes(option));
      }
    }
  }
});
