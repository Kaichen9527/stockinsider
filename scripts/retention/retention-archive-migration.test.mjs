import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const migration = fs.readFileSync(new URL('../../migrations/20260911_retention_archive_v1.sql', import.meta.url), 'utf8');
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
  const runner = fs.readFileSync(path.join(root, 'scripts/apply-retention-archive-v1-migration.mjs'), 'utf8');
  assert.match(runner, /retention_migration_tree_not_exact_reviewed_commit/u);
  assert.match(runner, /STOCKINSIDER_RETENTION_MIGRATION_DATABASE_URL/u);
  assert.doesNotMatch(runner, /dotenv|readFileSync\([^\n]*[.]env(?:[.]local)?/u);
});
