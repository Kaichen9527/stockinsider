'use strict';

const { Pool } = require('pg');

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
      const row = await one(`select claimed.* from
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
    appendLegacyOfficialIngestionChunk: async (input) => Boolean((await one(
      'select public.append_legacy_official_ingestion_chunk_rest_v3_15($1,$2,$3,$4,$5,$6,$7,$8,$9) as accepted',
      // node-postgres encodes a JavaScript Array as a PostgreSQL array literal.
      // Serialize explicitly so the function receives the reviewed JSONB array
      // contract instead of a JSON string/scalar or database array.
      [input.runId,input.jobId,input.ownerToken,input.kind,input.ordinal,JSON.stringify(input.items),input.chunkHash,
        input.producerSha,input.sourceCutoff]))?.accepted),
    failLegacyProducerJob: async (input) => completion(await one('select * from public.fail_legacy_producer_job_v3_11($1,$2,$3,$4)', [input.runId, input.jobId, input.ownerToken, input.failure])),
    close: () => pool.end(),
  });
}

module.exports = { createPostgresLegacyProducerAdapter };
