#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SHA40 = /^[0-9a-f]{40}$/u;
export const RESEARCH_FUNNEL_V4_MIGRATIONS = Object.freeze([
  'migrations/20260906_financial_acquisition_v4.sql',
  'migrations/20260906_source_identity_v4.sql',
  'migrations/20260906_shadow_signal_v4.sql',
  'migrations/20260906_candidate_dossier_v4.sql',
  'migrations/20260906_taiwan_data_provider_v5.sql',
  'migrations/20260906_finmind_financial_fallback_v5.sql',
]);

function migrationPlan() {
  return RESEARCH_FUNNEL_V4_MIGRATIONS.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(absolutePath) !== absolutePath) {
      throw new Error(`migration_file_not_regular:${relativePath}`);
    }
    const sql = fs.readFileSync(absolutePath, 'utf8');
    if (/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(sql)) {
      throw new Error(`destructive_migration_rejected:${relativePath}`);
    }
    return Object.freeze({
      relativePath,
      sql,
      bytes: Buffer.byteLength(sql),
      sha256: createHash('sha256').update(sql).digest('hex'),
    });
  });
}

function argumentsFor(argv) {
  const result = { apply: false, sourceCommit: null };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') result.apply = true;
    else if (argv[index] === '--source-commit' && SHA40.test(argv[index + 1] || '')) result.sourceCommit = argv[++index];
    else throw new Error('invalid_arguments');
  }
  if (result.apply && !result.sourceCommit) throw new Error('source_commit_required');
  return result;
}

function assertReviewedTree(sourceCommit) {
  const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== sourceCommit || dirty !== '') throw new Error('source_tree_not_exact_reviewed_commit');
}

async function apply(plan, sourceCommit) {
  assertReviewedTree(sourceCommit);
  const { Client } = require('pg');
  const { resolvePostgresConnectionReference } = require('./runtime/credential-resolver');
  const client = new Client({
    connectionString: resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url'),
    application_name: 'stockinsider-research-funnel-v4-migration',
    statement_timeout: 180_000,
    query_timeout: 180_000,
  });
  await client.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-research-funnel-v4',0))");
    locked = true;
    const prerequisites = await client.query(`SELECT
      to_regclass('public.candidate_detail_snapshots') IS NOT NULL AS detail,
      to_regclass('public.candidate_shadow_manifests') IS NOT NULL AS shadow,
      to_regclass('public.source_run_ledger') IS NOT NULL AS source,
      to_regclass('public.opportunity_financial_facts_v3') IS NOT NULL AS financial`);
    if (!Object.values(prerequisites.rows[0] || {}).every(Boolean)) throw new Error('research_funnel_v4_prerequisite_missing');
    for (const migration of plan) await client.query(migration.sql);
    const verification = await client.query(`SELECT
      to_regclass('public.candidate_financial_acquisition_jobs_v4') IS NOT NULL AS financial_jobs,
      to_regclass('public.source_search_documents_v3') IS NOT NULL AS source_view,
      to_regclass('public.candidate_dossier_bundles') IS NOT NULL AS dossier_bundles,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='candidate_shadow_manifests' AND column_name='cohort_key') AS shadow_cohort,
      to_regclass('public.taiwan_data_refresh_queue_v5') IS NOT NULL AS taiwan_data_queue,
      EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='radar_public_snapshots' AND column_name='publication_phase') AS radar_publication_phase`);
    if (!Object.values(verification.rows[0] || {}).every(Boolean)) throw new Error('research_funnel_v4_verification_failed');
    return verification.rows[0];
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-research-funnel-v4',0))").catch(() => undefined);
    await client.end();
  }
}

if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = argumentsFor(process.argv.slice(2));
  const plan = migrationPlan();
  const result = options.apply ? await apply(plan, options.sourceCommit) : null;
  process.stdout.write(`${JSON.stringify({
    protocol: 'stockinsider-research-funnel-v4-migration-plan-v1',
    sourceCommit: options.sourceCommit,
    migrations: plan.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
    applied: options.apply,
    verification: result,
  })}\n`);
}
