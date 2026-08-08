'use strict';

const { Pool } = require('pg');

function createPostgresLegacyProducerAdapter({ connectionString }) {
  const pool = new Pool({ connectionString, max: 1, application_name: 'stockinsider-auth-source-worker-v3-11' });
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
    acquireLegacyProducerLease: async (input) => lease(await one('select * from public.acquire_legacy_producer_lease_v3_11($1,$2,$3,$4,$5,$6,$7)',
      [input.ownerLabel, input.sourceCommitSha, input.workerSha256, input.configBytes, input.configSha256, input.ownerToken, input.leaseSeconds])),
    claimLegacyProducerJob: async (input) => claim(await one('select * from public.claim_legacy_producer_job_v3_11($1,$2,$3,$4)', [input.runId, input.jobId, input.ownerToken, input.leaseSeconds])),
    heartbeatLegacyProducerJob: async (input) => Boolean((await one(
      'select public.heartbeat_legacy_producer_job_v3_11($1,$2,$3,$4) as alive',
      [input.runId, input.jobId, input.ownerToken, input.leaseSeconds],
    ))?.alive),
    completeLegacyProducerJob: async (input) => completion(await one('select * from public.complete_legacy_producer_job_v3_11($1,$2,$3,$4,$5,$6)',
      [input.runId, input.jobId, input.ownerToken, Buffer.from(input.resultCanonical), input.resultJson, input.resultHash])),
    failLegacyProducerJob: async (input) => completion(await one('select * from public.fail_legacy_producer_job_v3_11($1,$2,$3,$4)', [input.runId, input.jobId, input.ownerToken, input.failure])),
    close: () => pool.end(),
  });
}

module.exports = { createPostgresLegacyProducerAdapter };
