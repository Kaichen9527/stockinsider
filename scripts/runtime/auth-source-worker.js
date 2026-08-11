'use strict';

const crypto = require('crypto');
const { invariant, sha256 } = require('./codec');
const { validateAuthSourceDagConfig } = require('./source-run-config');
const { safeFailureDiagnostic } = require('./safe-diagnostics');

const TERMINAL = new Set(['succeeded', 'failed', 'cancelled', 'non_trading_occurrence']);

async function runWithLeaseHeartbeat({ adapter, lease, claim, ownerToken, leaseSeconds, handler, heartbeatIntervalMs }) {
  let stopped = false;
  let leaseLost = false;
  let heartbeatError = null;
  let stopLoop;
  const stoppedSignal = new Promise((resolve) => { stopLoop = resolve; });
  const interval = heartbeatIntervalMs ?? Math.max(1000, Math.floor(leaseSeconds * 1000 / 3));
  const loop = (async () => {
    while (!stopped) {
      await Promise.race([new Promise((resolve) => {
        const timer = setTimeout(resolve, interval);
        if (typeof timer.unref === 'function') timer.unref();
      }), stoppedSignal]);
      if (stopped) break;
      try {
        const alive = await adapter.heartbeatLegacyProducerJob({ runId: lease.runId, jobId: claim.jobId, ownerToken, leaseSeconds });
        if (alive !== true) { leaseLost = true; break; }
      } catch (error) {
        heartbeatError = error;
        leaseLost = true;
        break;
      }
    }
  })();
  try {
    const output = await handler(Object.freeze({ ...claim, ownerToken }));
    if (leaseLost) {
      const error = new Error('producer_lease_lost');
      error.code = 'producer_lease_lost';
      error.cause = heartbeatError;
      throw error;
    }
    return output;
  } finally {
    stopped = true;
    stopLoop();
    await loop;
  }
}

async function runDurableAuthSourceWorker({ configBytes, adapter, sourceCommitSha, workerBytes, stageHandlers,
  ownerToken = crypto.randomUUID(), heartbeatIntervalMs }) {
  const validated = validateAuthSourceDagConfig(configBytes);
  invariant(/^[0-9a-f]{40}$/u.test(sourceCommitSha), 'source commit SHA');
  invariant(Buffer.isBuffer(workerBytes), 'reviewed worker bytes');
  invariant(adapter && ['acquireLegacyProducerLease', 'claimLegacyProducerJob', 'heartbeatLegacyProducerJob',
    'completeLegacyProducerJob','appendLegacyRuntimeFailureDiagnostic','failLegacyProducerJob']
    .every((name) => typeof adapter[name] === 'function'), 'durable PostgreSQL adapter');
  const lease = await adapter.acquireLegacyProducerLease({ ownerLabel: validated.config.ownerLabel, sourceCommitSha,
    workerSha256: sha256(workerBytes), configBytes: validated.bytes, configSha256: validated.sha256, ownerToken, leaseSeconds: validated.config.leaseSeconds });
  if (!lease || lease.disposition === 'owner_already_leased' || TERMINAL.has(lease.status)) return Object.freeze(lease ?? { disposition: 'lease_unavailable' });
  let job = lease.job;
  let completedJobs = 0;
  while (job) {
    const claim = await adapter.claimLegacyProducerJob({ runId: lease.runId, jobId: job.jobId, ownerToken, leaseSeconds: validated.config.leaseSeconds });
    if (!claim) break;
    try {
      const handler = stageHandlers?.[claim.stage];
      invariant(typeof handler === 'function', `missing stage handler: ${claim.stage}`);
      const output = await runWithLeaseHeartbeat({ adapter, lease, claim, ownerToken,
        leaseSeconds: validated.config.leaseSeconds, handler, heartbeatIntervalMs });
      const completion = await adapter.completeLegacyProducerJob({ runId: lease.runId, jobId: claim.jobId, ownerToken,
        resultCanonical: output.canonical, resultJson: output.json, resultHash: output.hash });
      invariant(completion && typeof completion.status === 'string', 'producer lease lost before completion');
      completedJobs += 1;
      invariant(completedJobs <= 12000, 'durable job conservation bound');
      if (TERMINAL.has(completion.status)) return Object.freeze({ ...completion, completedJobs });
      job = completion.nextJob ?? null;
    } catch (error) {
      if (error?.code === 'producer_lease_lost' || error?.message === 'producer lease lost before completion') {
        return Object.freeze({ disposition: 'lease_lost', runId: lease.runId, completedJobs });
      }
      const failure = error?.code === 'provider_unavailable' ? 'provider_unavailable' : 'data_integrity_failure';
      const failureDiagnostic=safeFailureDiagnostic(error,{runId:lease.runId,jobId:claim.jobId,stage:claim.stage,
        jobKind:claim.jobKind,origin:'handler',failureCode:failure,inputHash:claim.readHash,producerSha:sourceCommitSha,
        recordedAt:new Date().toISOString()});
      await adapter.appendLegacyRuntimeFailureDiagnostic({...failureDiagnostic,ownerToken});
      const terminal = await adapter.failLegacyProducerJob({ runId: lease.runId, jobId: claim.jobId, ownerToken, failure });
      if (!terminal) return Object.freeze({ disposition: 'lease_lost', runId: lease.runId, completedJobs });
      return Object.freeze({ ...terminal, disposition: 'failed', failure, completedJobs });
    }
  }
  return Object.freeze({ disposition: 'incomplete_job_graph', runId: lease.runId, completedJobs });
}

const runAuthSourceWorker = runDurableAuthSourceWorker;

module.exports = { runAuthSourceWorker, runDurableAuthSourceWorker, runWithLeaseHeartbeat };
