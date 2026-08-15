'use strict';

const { Pool } = require('pg');
const { Worker } = require('node:worker_threads');

const CLAIM_STATEMENT_TIMEOUT_MS = 1_200_000;

// The official fact handler performs bounded but CPU-heavy parsing. A timer on the
// main event loop cannot renew a lease while that parsing is synchronous, so the
// heartbeat owns a separate JS event loop and PostgreSQL connection. Credentials and
// owner tokens are passed only through workerData memory, never argv, env, disk or logs.
const POSTGRES_HEARTBEAT_WORKER_SOURCE = String.raw`
'use strict';
const { workerData } = require('node:worker_threads');
const state = new Int32Array(workerData.stateBuffer);
(async () => {
  const { Client } = require('pg');
  // A managed pooler may retire an otherwise idle connection without warning.
  // Give every pulse its own bounded client so a long official-facts handler never
  // depends on a socket surviving between the 40-second heartbeat intervals.
  // Four fresh attempts complete within the reviewed 120-second lease budget.
  const reconnectDelays = [0, 250, 500, 1000];
  const pulseOnce = async () => {
    const client = new Client({ connectionString: workerData.connectionString,
      application_name: 'stockinsider-auth-source-heartbeat-v3-11',
      connectionTimeoutMillis: 5000, query_timeout: 5000, statement_timeout: 5000 });
    client.on('error', () => {});
    try {
      await client.connect();
      const row = (await client.query(
        'select public.heartbeat_legacy_producer_job_v3_11($1,$2,$3,$4) as alive',
        [workerData.runId, workerData.jobId, workerData.ownerToken, workerData.leaseSeconds],
      )).rows[0];
      return row?.alive === true;
    } finally {
      await Promise.race([
        client.end().catch(() => {}),
        new Promise((resolve) => setTimeout(resolve, 1000)),
      ]);
    }
  };
  while (Atomics.load(state, 0) === 0) {
    let outcome = null;
    for (const delay of reconnectDelays) {
      if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
      if (Atomics.load(state, 0) !== 0) break;
      try { outcome = await pulseOnce(); break; } catch { /* use a fresh client for the next attempt */ }
    }
    if (Atomics.load(state, 0) !== 0) break;
    if (outcome === null) { Atomics.store(state, 0, 2); break; }
    if (!outcome) { Atomics.store(state, 0, 1); break; }
    Atomics.add(state, 1, 1);
    await new Promise((resolve) => setTimeout(resolve, workerData.heartbeatIntervalMs));
  }
})().catch(() => { Atomics.store(state, 0, 2); });
`;

function beginThreadedPostgresHeartbeat({ connectionString, runId, jobId, ownerToken, leaseSeconds,
  heartbeatIntervalMs, WorkerClass = Worker }) {
  const stateBuffer = new SharedArrayBuffer(Int32Array.BYTES_PER_ELEMENT * 2);
  const state = new Int32Array(stateBuffer);
  const worker = new WorkerClass(POSTGRES_HEARTBEAT_WORKER_SOURCE, { eval: true, workerData: {
    connectionString, runId, jobId, ownerToken, leaseSeconds, heartbeatIntervalMs, stateBuffer,
  } });
  let stopped = false;
  const markWorkerError = () => { if (!stopped) Atomics.compareExchange(state, 0, 0, 2); };
  worker.on?.('error', markWorkerError);
  worker.on?.('exit', markWorkerError);
  return Object.freeze({
    stop: async () => {
      if (!stopped) { stopped = true; await worker.terminate(); }
      const code = Atomics.load(state, 0);
      return Object.freeze({ state: code === 0 ? 'healthy' : code === 1 ? 'lost' : 'error',
        pulses: Atomics.load(state, 1) });
    },
  });
}

async function claimWithBoundedStatementTimeout(pool, text, values) {
  const client = await pool.connect();
  let discardClient = false;
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL statement_timeout = '${CLAIM_STATEMENT_TIMEOUT_MS / 1000}s'`);
    const result = await client.query(text, values);
    await client.query('COMMIT');
    return result.rows[0] ?? null;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discardClient = true; }
    throw error;
  } finally {
    client.release(discardClient);
  }
}

function createPostgresLegacyProducerAdapter({ connectionString }) {
  // Keep one connection available for lease heartbeats while a durable ingestion
  // write is using the other connection.  A single-connection pool can queue the
  // heartbeat behind a slow official chunk append until the 120-second lease dies.
  const pool = new Pool({ connectionString, max: 2, application_name: 'stockinsider-auth-source-worker-v3-11' });
  let cachedAuthorityPagesHash = '';
  let completionAuthorityHash = '';
  const one = async (text, values) => (await pool.query(text, values)).rows[0] ?? null;
  const lease = (row) => row && Object.freeze({
    runId: row.run_id,
    job: row.job_id ? { jobId: row.job_id } : null,
    disposition: row.disposition,
    status: row.disposition === 'retained_success' ? 'succeeded' : 'running',
    sourceCutoff: row.source_cutoff,
    authorityHash: row.authority_hash,
  });
  const claim = (row) => row && Object.freeze({
    runId: row.run_id, jobId: row.job_id, stage: row.stage, jobKind: row.job_kind,
    stageOrdinal: row.stage_ordinal, shardOrdinal: row.shard_ordinal,
    executionOrdinal: row.execution_ordinal, revisionId: row.revision_id,
    attempt: row.attempt, payloadCanonical: row.payload_canonical,
    payloadJson: row.payload_json, payloadHash: row.payload_hash,
    predecessorResultCanonical: row.predecessor_result_canonical,
    predecessorResultJson: row.predecessor_result_json,
    predecessorResultHash: row.predecessor_result_hash,
    authorityKind: row.authority_kind, authorityCanonical: row.authority_canonical,
    authorityJson: row.authority_json, authorityHash: row.authority_hash,
    frozenRevisionCanonical: row.frozen_revision_canonical,
    frozenRevisionJson: row.frozen_revision_json,
    frozenRevisionHash: row.frozen_revision_hash,
    readKind: row.read_kind, readCanonical: row.read_canonical,
    readJson: row.read_json, readHash: row.read_hash,
    readRowCount: row.read_row_count, leaseExpiresAt: row.lease_expires_at,
  });
  const completion = (row) => row && Object.freeze({
    status: row.status === 'success' ? 'succeeded' : row.status,
    nextJob: row.next_job,
  });
  return Object.freeze({
    acquireLegacyProducerLease: async (input) => {
      const value = lease(await one('select * from public.acquire_legacy_producer_lease_v3_11($1,$2,$3,$4,$5,$6,$7)',
        [input.ownerLabel, input.sourceCommitSha, input.workerSha256, input.configBytes, input.configSha256,
          input.ownerToken, input.leaseSeconds]));
      // A restarted worker can resume directly at a barrier whose claim omits
      // the authority pages.  The lease still binds the run's immutable
      // authority identity, so retain it for terminal completion.
      if (/^[0-9a-f]{64}$/u.test(value?.authorityHash ?? '')) completionAuthorityHash = value.authorityHash;
      return value;
    },
    claimLegacyProducerJob: async (input) => {
      const row = await claimWithBoundedStatementTimeout(pool, `select claimed.* from
        (select set_config('stockinsider.legacy_authority_hash',$5,true) marker) configured
        cross join lateral public.claim_legacy_producer_job_v3_11(
          $1,$2,$3,$4+(length(configured.marker)*0)
        ) claimed`, [input.runId, input.jobId, input.ownerToken, input.leaseSeconds, cachedAuthorityPagesHash]);
      const value = claim(row);
      if (/^[0-9a-f]{64}$/u.test(value?.authorityHash ?? '')) completionAuthorityHash = value.authorityHash;
      if (Array.isArray(value?.readJson?.authorityPages) && value.readJson.authorityPages.length > 0 &&
        typeof value.readJson.authorityHash === 'string' && /^[0-9a-f]{64}$/u.test(value.readJson.authorityHash)) {
        cachedAuthorityPagesHash = value.readJson.authorityHash;
        completionAuthorityHash = value.readJson.authorityHash;
      }
      return value;
    },
    heartbeatLegacyProducerJob: async (input) => Boolean((await one(
      'select public.heartbeat_legacy_producer_job_v3_11($1,$2,$3,$4) as alive',
      [input.runId, input.jobId, input.ownerToken, input.leaseSeconds],
    ))?.alive),
    beginLegacyProducerHeartbeat: async (input) => beginThreadedPostgresHeartbeat({ connectionString, ...input }),
    completeLegacyProducerJob: async (input) => completion(await one(`select completed.* from
      (select set_config('stockinsider.legacy_authority_hash',$7,true) marker) configured
      cross join lateral public.complete_legacy_producer_job_v3_14(
        $1,$2,$3,$4,$5,$6 || substring(configured.marker from 1 for 0)
      ) completed`, [input.runId, input.jobId, input.ownerToken, Buffer.from(input.resultCanonical), input.resultJson,
      input.resultHash, completionAuthorityHash])),
    appendLegacyRuntimeFailureDiagnostic: async (input) => Boolean((await one(
      'select public.append_legacy_runtime_failure_diagnostic_v3_14($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) as diagnostic_id',
      [input.runId,input.jobId,input.ownerToken,input.stage,input.jobKind,input.failureCode,input.origin,input.invariantCode,input.sqlstate,
        input.constraint,input.itemOrdinal,input.fieldPath,input.inputHash,input.producerSha,input.diagnosticHash,input.recordedAt]))?.diagnostic_id),
    appendLegacyOfficialIngestionChunk: async (input) => {
      try {
        return Boolean((await one(
          'select public.append_legacy_official_ingestion_chunk_rest_v3_15($1,$2,$3,$4,$5,$6,$7,$8,$9) as accepted',
          // node-postgres encodes a JavaScript Array as a PostgreSQL array literal.
          // Serialize explicitly so the function receives the reviewed JSONB array
          // contract instead of a JSON string/scalar or database array.
          [input.runId,input.jobId,input.ownerToken,input.kind,input.ordinal,JSON.stringify(input.items),input.chunkHash,
            input.producerSha,input.sourceCutoff]))?.accepted);
      } catch (error) {
        error.itemOrdinal=input.ordinal;
        error.fieldPath=`officialIngestion.${input.kind}`;
        error.failureOrigin='persistence';
        error.invariantCode='database_constraint_rejected';
        throw error;
      }
    },
    failLegacyProducerJob: async (input) => completion(await one('select * from public.fail_legacy_producer_job_v3_11($1,$2,$3,$4)', [input.runId, input.jobId, input.ownerToken, input.failure])),
    close: () => pool.end(),
  });
}

module.exports = { CLAIM_STATEMENT_TIMEOUT_MS, createPostgresLegacyProducerAdapter,
  beginThreadedPostgresHeartbeat, claimWithBoundedStatementTimeout, POSTGRES_HEARTBEAT_WORKER_SOURCE };
