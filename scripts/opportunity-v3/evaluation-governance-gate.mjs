import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const evidencePath = path.join(
  root,
  '.loop-engineering/state/changes/source-led-opportunity-engine-v3/verification/evaluation-cohorts.json',
);
const databaseUrl = process.env.OPPORTUNITY_V3_EVIDENCE_DATABASE_URL ?? '';

function emit(status, detail) {
  process.stdout.write(`${JSON.stringify({
    protocol: 'opportunity-verification-track-v3.0',
    track: 'evaluation_governance',
    status,
    ...detail,
  })}\n`);
}

function blocked(blocker) {
  emit('blocked', {
    blocker,
    requiredBacktestDates: 120,
    requiredLiveDates: 20,
    requiredAttemptRosterDates: 252,
  });
  process.exitCode = 2;
}

function exactObject(value, keys) {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value));
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort());
}

function parseEvidence() {
  const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
  exactObject(evidence, [
    'comparisonContractKey',
    'evaluationDatasetLockHash',
    'evaluationInputManifestHash',
    'evaluationInputManifestId',
    'linkAuditResolutionManifestHash',
    'linkAuditResolutionManifestId',
    'linkAuditSampleManifestHash',
    'linkAuditSampleManifestId',
    'protocol',
    'runId',
  ]);
  assert.equal(evidence.protocol, 'opportunity-evaluation-database-attestation-v3.0');
  for (const key of [
    'comparisonContractKey',
    'evaluationDatasetLockHash',
    'evaluationInputManifestHash',
    'linkAuditResolutionManifestHash',
    'linkAuditSampleManifestHash',
  ]) assert.match(evidence[key], /^[0-9a-f]{64}$/u);
  for (const key of [
    'runId',
    'evaluationInputManifestId',
    'linkAuditSampleManifestId',
    'linkAuditResolutionManifestId',
  ]) assert.match(evidence[key], /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u);
  return evidence;
}

async function verifyDatabaseEvidence(evidence) {
  const client = new pg.Client({
    connectionString: databaseUrl,
    application_name: 'opportunity-v3-evaluation-governance-gate',
    statement_timeout: 10_000,
  });
  await client.connect();
  try {
    await client.query('BEGIN READ ONLY');
    const result = await client.query(`
      SELECT
        r.run_id,
        r.comparison_contract_key,
        r.evaluation_dataset_lock_hash,
        r.status AS run_status,
        e.status AS evaluation_status,
        e.payload_json,
        max(m.manifest_id::text) FILTER (WHERE i.input_role='evaluation_input') AS evaluation_input_manifest_id,
        max(m.manifest_hash) FILTER (WHERE i.input_role='evaluation_input') AS evaluation_input_manifest_hash,
        max(m.manifest_id::text) FILTER (WHERE i.input_role='link_audit_sample') AS link_audit_sample_manifest_id,
        max(m.manifest_hash) FILTER (WHERE i.input_role='link_audit_sample') AS link_audit_sample_manifest_hash,
        max(m.manifest_id::text) FILTER (WHERE i.input_role='link_audit_resolution') AS link_audit_resolution_manifest_id,
        max(m.manifest_hash) FILTER (WHERE i.input_role='link_audit_resolution') AS link_audit_resolution_manifest_hash
      FROM public.opportunity_runs r
      JOIN public.opportunity_evaluation_results_v3 e ON e.run_id=r.run_id
      JOIN public.opportunity_run_manifest_inputs i ON i.run_id=r.run_id
      JOIN public.opportunity_manifests_v3 m
        ON m.manifest_id=i.manifest_id AND m.status='complete'
      WHERE r.run_id=$1
        AND r.mode='shadow_evaluate'
        AND r.run_purpose='shadow_evaluation_daily'
      GROUP BY r.run_id,r.comparison_contract_key,r.evaluation_dataset_lock_hash,
        r.status,e.status,e.payload_json
    `, [evidence.runId]);
    assert.equal(result.rowCount, 1);
    const row = result.rows[0];
    assert.equal(row.run_status, 'success');
    assert.equal(row.evaluation_status, 'pass');
    for (const key of [
      'comparison_contract_key',
      'evaluation_dataset_lock_hash',
      'evaluation_input_manifest_id',
      'evaluation_input_manifest_hash',
      'link_audit_sample_manifest_id',
      'link_audit_sample_manifest_hash',
      'link_audit_resolution_manifest_id',
      'link_audit_resolution_manifest_hash',
    ]) {
      const evidenceKey = key.replace(/_([a-z])/gu, (_, letter) => letter.toUpperCase());
      assert.equal(row[key], evidence[evidenceKey], key);
    }
    const counts = await client.query(`
      SELECT
        count(*) FILTER (WHERE mr.section_key='attempt_roster')::integer AS attempt_roster_count,
        count(*) FILTER (WHERE mr.section_key='backtest_rows')::integer AS backtest_count,
        count(*) FILTER (WHERE mr.section_key='live_rows')::integer AS live_count,
        count(DISTINCT mr.payload_json->>0)
          FILTER (WHERE mr.section_key='attempt_roster')::integer AS attempt_roster_dates,
        count(DISTINCT mr.payload_json->>0)
          FILTER (WHERE mr.section_key='backtest_rows')::integer AS backtest_dates,
        count(DISTINCT mr.payload_json->>0)
          FILTER (WHERE mr.section_key='live_rows')::integer AS live_dates
      FROM public.opportunity_manifest_rows_v3 mr
      WHERE mr.manifest_id=$1
    `, [evidence.evaluationInputManifestId]);
    assert.equal(counts.rowCount, 1);
    assert.deepEqual(counts.rows[0], {
      attempt_roster_count: 252,
      backtest_count: 120,
      live_count: 20,
      attempt_roster_dates: 252,
      backtest_dates: 120,
      live_dates: 20,
    });
    const payload = row.payload_json;
    exactObject(payload, [
      'backtestCount',
      'evaluationInputManifestHash',
      'gateBooleans',
      'gateFacts',
      'legacyMetrics',
      'linkAuditResolutionManifestHash',
      'linkAuditSampleManifestHash',
      'linkPrecision',
      'linkRecall',
      'liveCount',
      'orderedInputRunAndManifestHashes',
      'status',
      'strategyPopulationSummary',
      'strategyRows',
      'v3Metrics',
    ]);
    assert.equal(payload.backtestCount, 120);
    assert.equal(payload.liveCount, 20);
    assert.equal(payload.evaluationInputManifestHash, evidence.evaluationInputManifestHash);
    assert.equal(payload.linkAuditSampleManifestHash, evidence.linkAuditSampleManifestHash);
    assert.equal(payload.linkAuditResolutionManifestHash, evidence.linkAuditResolutionManifestHash);
    assert.equal(payload.status, 'pass');
    assert.deepEqual(payload.gateFacts, []);
    assert.ok(payload.v3Metrics && payload.legacyMetrics);
    assert.ok(Number.isFinite(payload.linkPrecision) && payload.linkPrecision >= 0.95);
    assert.ok(Number.isFinite(payload.linkRecall) && payload.linkRecall >= 0.9);
    assert.ok(
      payload.gateBooleans &&
      Object.values(payload.gateBooleans).length > 0 &&
      Object.values(payload.gateBooleans).every((value) => value === true),
    );
    await client.query('COMMIT');
    return counts.rows[0];
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

if (!existsSync(evidencePath)) {
  blocked('non_fabricated_elapsed_cohorts_unavailable');
} else if (!databaseUrl) {
  blocked('database_attestation_unavailable');
} else {
  const evidence = parseEvidence();
  const counts = await verifyDatabaseEvidence(evidence);
  emit('pass', {
    attestedRunId: evidence.runId,
    observedAttemptRosterDates: counts.attempt_roster_dates,
    observedBacktestDates: counts.backtest_dates,
    observedLiveDates: counts.live_dates,
  });
}
