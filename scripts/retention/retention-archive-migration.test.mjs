import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migration = fs.readFileSync(new URL('../../migrations/20260911_retention_archive_v1.sql', import.meta.url), 'utf8');
const migrationV2 = fs.readFileSync(new URL('../../migrations/20260911_retention_archive_v2.sql', import.meta.url), 'utf8');
const materializeV2 = fs.readFileSync(new URL('./materialize-legacy-content-v2.sql', import.meta.url), 'utf8');
const legacyCleanup = fs.readFileSync(new URL('../supabase_retention_cleanup.js', import.meta.url), 'utf8');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

test('retention migration is additive and exposes no deletion executor', () => {
  assert.match(migration, /^BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(migration, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
  assert.doesNotMatch(migration, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public[.]delete_/iu);
  assert.match(migration, /'deleteRpcAvailable',FALSE/u);
  assert.match(migration, /'requiresSeparateReviewedDeletionExecutor',TRUE/u);
  assert.match(migration, /row_changed_or_missing_after_export/u);
  assert.match(migration, /pin_added_after_export/u);
});

test('retention policies distinguish 30-day detail from 90-day summaries and preserve incidents', () => {
  for (const detail of ['source_run_ledger', 'source_audit', 'worker_log']) {
    assert.match(migration, new RegExp(`\\('${detail}',30,'retention-v1'`, 'u'));
  }
  for (const summary of ['candidate_research_run', 'connector_run', 'worker_job_run', 'runtime_artifact']) {
    assert.match(migration, new RegExp(`\\('${summary}',90,'retention-v1'`, 'u'));
  }
  assert.match(migration, /lower\(level\) NOT IN \('warn','warning','error','critical','security','audit'\)/u);
  assert.match(migration, /NOT coalesce\(metadata,'\{\}'::jsonb\) @> '\{"unresolved":true\}'::jsonb/u);
  assert.match(migration, /status='success'/u);
});

test('pin graph covers latest/prior, recovery, decisions, revisions, facts, releases, and source provenance', () => {
  for (const pin of ['latest', 'prior', 'recovery', 'decision', 'revision_reference', 'fact_reference', 'release']) {
    assert.match(migration, new RegExp(`'${pin}'`, 'u'));
  }
  for (const relation of ['candidate_daily_stage_snapshots', 'candidate_dossier_bundles', 'radar_publication_state', 'candidate_source_mentions']) {
    assert.match(migration, new RegExp(`public[.]${relation}`, 'u'));
  }
});

test('legacy cleanup command cannot delete or modify rows', () => {
  assert.doesNotMatch(legacyCleanup, /new Client|\.query\(|delete from|update public/iu);
  assert.match(legacyCleanup, /No rows were changed/u);
});

test('archive control plane is service-role only and append-only', () => {
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/iu);
  assert.match(migration, /FROM PUBLIC,anon,authenticated/iu);
  assert.match(migration, /TO service_role/iu);
  assert.match(migration, /retention_archive_direct_mutation_rejected/u);
  assert.match(migration, /archive_locator ~ '\^backup\/retention\//u);
  assert.match(migration, /encrypted BOOLEAN NOT NULL DEFAULT FALSE/u);
  assert.match(migration, /restore_environment_id IS NOT NULL/u);
});

test('migration runner is exact-commit guarded and dry by default', () => {
  const output = JSON.parse(execFileSync(process.execPath, ['scripts/apply-retention-archive-v1-migration.mjs'], { cwd: root, encoding: 'utf8' }));
  assert.equal(output.applied, false);
  assert.equal(output.migration.relativePath, 'migrations/20260911_retention_archive_v1.sql');
  assert.match(output.migration.sha256, /^[0-9a-f]{64}$/u);
  assert.deepEqual(output.migrations.map(({ relativePath }) => relativePath), [
    'migrations/20260911_retention_archive_v1.sql',
    'migrations/20260911_retention_archive_v2.sql',
  ]);
  for (const planned of output.migrations) assert.match(planned.sha256, /^[0-9a-f]{64}$/u);
  const runner = fs.readFileSync(path.join(root, 'scripts/apply-retention-archive-v1-migration.mjs'), 'utf8');
  assert.match(runner, /retention_migration_tree_not_exact_reviewed_commit/u);
  assert.match(runner, /STOCKINSIDER_RETENTION_MIGRATION_DATABASE_URL/u);
  assert.match(runner, /retention_archive_manifests_v2/u);
  assert.match(runner, /retention_legacy_run_plan_v2/u);
  assert.doesNotMatch(runner, /dotenv|readFileSync\([^\n]*[.]env(?:[.]local)?/u);
});

test('retention v2 is additive, has no deletion path, and covers the complete legacy detail graph', () => {
  assert.match(migrationV2, /^BEGIN;[\s\S]*COMMIT;\s*$/u);
  assert.doesNotMatch(migrationV2, /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+(?:TABLE|SCHEMA|TYPE))\b/iu);
  assert.doesNotMatch(migrationV2, /CREATE\s+(?:OR\s+REPLACE\s+)?FUNCTION\s+public[.]delete_/iu);
  for (const relation of [
    'legacy_producer_jobs_v3_11', 'legacy_producer_job_payloads_v3_11',
    'legacy_producer_job_results_v3_11', 'legacy_source_processing_outcomes_v3_13',
    'legacy_frozen_source_revisions_v3_11', 'legacy_producer_authority_pages_v3_11',
  ]) assert.match(migrationV2, new RegExp(`public[.]${relation}`, 'u'));
  assert.match(migrationV2, /source_cutoff<p_now-interval '35 days'/u);
  assert.match(migrationV2, /summaryCutoffAt'[\s\S]*interval '90 days'/u);
  assert.match(migrationV2, /retention_legacy_jsonb_pins_v2/u);
  assert.match(migrationV2, /information_schema[.]columns/u);
  assert.match(migrationV2, /jsonb_reference/u);
  assert.match(migrationV2, /public_revision/u);
  assert.match(migrationV2, /official_fact/u);
});

test('connector v2 candidate listing materializes pins once and never calls row eligibility', () => {
  const body = migrationV2.match(/CREATE OR REPLACE FUNCTION public[.]list_connector_retention_archive_candidates_v2[\s\S]*?\n\$function\$;/u)?.[0] || '';
  assert.match(body, /pins AS MATERIALIZED/u);
  assert.match(body, /audits AS MATERIALIZED/u);
  assert.doesNotMatch(body, /retention_archive_eligibility_v1/u);
});

test('content-addressed materialization is local-only, lossless, and non-destructive', () => {
  assert.match(materializeV2, /inet_server_addr\(\) IS NOT NULL/u);
  assert.match(materializeV2, /current_user<>'stockinsider_rehearsal'/u);
  assert.match(materializeV2, /\^\/private\/tmp\/stockinsider-restore-/u);
  assert.doesNotMatch(materializeV2, /\b(?:DELETE\s+FROM|TRUNCATE|DROP\s+TABLE)\b/iu);
  assert.match(materializeV2, /retention_content_hash_collision/u);
  assert.match(materializeV2, /retention_content_reference_count_mismatch/u);
  assert.match(materializeV2, /retention_content_round_trip_mismatch/u);
  for (const ref of ['job_payload_refs', 'job_result_refs', 'authority_page_refs', 'frozen_revision_refs', 'processing_outcome_refs']) {
    assert.match(materializeV2, new RegExp(`retention_legacy_${ref}_v2`, 'u'));
  }
});

test('normalized legacy objects and identity edges are immutable after insertion', () => {
  for (const relation of [
    'content_objects', 'job_payload_refs', 'job_result_refs', 'authority_page_refs',
    'frozen_revision_refs', 'processing_outcome_refs',
  ]) {
    assert.match(migrationV2, new RegExp(`trg_retention_legacy_${relation}_guard_v2`, 'u'));
  }
  assert.match(migrationV2, /BEFORE UPDATE OR DELETE/gmu);
  assert.match(migrationV2, /reject_retention_archive_direct_mutation_v1/gmu);
});
