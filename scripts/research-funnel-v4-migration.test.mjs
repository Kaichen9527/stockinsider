import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { RESEARCH_FUNNEL_V4_MIGRATIONS } from './apply-research-funnel-v4-migrations.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('research funnel v4 migration plan is exact, additive and dry by default', () => {
  assert.deepEqual(RESEARCH_FUNNEL_V4_MIGRATIONS, [
    'migrations/20260906_financial_acquisition_v4.sql',
    'migrations/20260906_source_identity_v4.sql',
    'migrations/20260906_shadow_signal_v4.sql',
    'migrations/20260906_candidate_dossier_v4.sql',
    'migrations/20260906_taiwan_data_provider_v5.sql',
    'migrations/20260906_finmind_financial_fallback_v5.sql',
  ]);
  for (const relativePath of RESEARCH_FUNNEL_V4_MIGRATIONS) {
    const sql = fs.readFileSync(path.join(root, relativePath), 'utf8');
    assert.doesNotMatch(sql, /\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu);
    assert.match(sql, /(?:^|\n)BEGIN;\n/u);
    assert.match(sql, /COMMIT;\s*$/u);
  }
  const output = JSON.parse(execFileSync(process.execPath, ['scripts/apply-research-funnel-v4-migrations.mjs'], { cwd: root, encoding: 'utf8' }));
  assert.equal(output.applied, false);
  assert.equal(output.migrations.length, 6);
  assert.ok(output.migrations.every((entry) => /^[0-9a-f]{64}$/u.test(entry.sha256) && entry.bytes > 0));
});

test('runtime tables, append-only revisions and source identity are covered by the migration chain', () => {
  const sql = RESEARCH_FUNNEL_V4_MIGRATIONS.map((relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')).join('\n');
  for (const token of [
    'candidate_financial_acquisition_jobs_v4', 'next_attempt_at', 'candidate_issuer_ir_document_queue_v4',
    'canonical_content_hash', 'content_analyzable', 'source_search_documents_v3',
    'canonical_input_hashes', 'cohort_key', 'attempt_blockers',
    'revision_hash', 'candidate_dossier_bundles', 'candidate_dossier_submission_receipts',
    'record_candidate_dossier_submission_v4',
    'taiwan_data_refresh_queue_v5', 'publication_phase',
  ]) assert.match(sql, new RegExp(token, 'u'));
  assert.match(sql, /GRANT ALL ON TABLE public[.]candidate_financial_acquisition_jobs_v4[\s\S]*TO service_role/u);
  assert.match(sql, /claim_candidate_financial_acquisition_jobs_v4/u);
  assert.match(sql, /complete_candidate_financial_acquisition_job_v4/u);
  assert.match(sql, /v_provider = 'finmind' THEN 'https:\/\/api\.finmindtrade\.com\/api\/v4\/data'/u);
  assert.ok(sql.includes("(v_fact #>> '{input,stock_id}')::uuid IS DISTINCT FROM v_job.stock_id"));
  assert.ok(sql.includes("(v_fact #>> '{input,period_end}')::date IS DISTINCT FROM v_job.period_end"));
  assert.match(sql, /v_provider IS DISTINCT FROM v_batch_provider/u);
  assert.match(sql, /record_candidate_financial_fallback_v5/u);
  assert.match(sql, /consecutive_failures integer NOT NULL DEFAULT 0/u);
  assert.match(sql, /status='queued',attempts=LEAST\(attempts\+1,19\),consecutive_failures=0/u);
  assert.match(sql, /'official_retry_at',p_next_attempt_at/u);
  assert.match(sql, /Later retries of unchanged content are acquisition/u);
  assert.match(sql, /fact[.]authority_tier::text='finmind_mirror'/u);
  assert.match(sql, /append_financial_fact_v3/u);
  assert.match(sql, /FOR UPDATE SKIP LOCKED/u);
  assert.match(sql, /lease_owner = p_owner/u);
  assert.match(sql, /DROP CONSTRAINT IF EXISTS candidate_shadow_manifests_session_date_policy_version_key/u);
  assert.match(sql, /protect_published_candidate_detail_revision_v4/u);
  assert.match(sql, /pg_advisory_xact_lock\(hashtextextended\(p_submission_hash, 0\)\)/u);
  const submissionRoute = fs.readFileSync(path.join(root, 'web/src/app/api/internal/candidate-dossier-submission/route.ts'), 'utf8');
  const bundleRoute = fs.readFileSync(path.join(root, 'web/src/app/api/internal/candidate-dossier-bundle/route.ts'), 'utf8');
  assert.match(submissionRoute, /requireExactInternalBearer\(request\)/u);
  assert.match(bundleRoute, /requireExactInternalBearer\(request\)/u);
  assert.match(submissionRoute, /rpc\('record_candidate_dossier_submission_v4'/u);
  assert.doesNotMatch(submissionRoute, /from\('candidate_research_dossiers'\)[.]insert/u);
});
