#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const relativePaths = Object.freeze([
  'migrations/20260911_retention_archive_v1.sql',
  'migrations/20260911_retention_archive_v2.sql',
]);
const sha40 = /^[0-9a-f]{40}$/u;

function migrationPlans() {
  return Object.freeze(relativePaths.map((relativePath) => {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(absolutePath) !== absolutePath) {
      throw new Error('retention_migration_file_not_regular');
    }
    const sql = fs.readFileSync(absolutePath, 'utf8');
    if (/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(sql)) throw new Error('retention_migration_destructive_ddl_rejected');
    return Object.freeze({ relativePath, sql, bytes: Buffer.byteLength(sql), sha256: crypto.createHash('sha256').update(sql).digest('hex') });
  }));
}

function argumentsFor(argv) {
  const result = { apply: false, sourceCommit: '' };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') result.apply = true;
    else if (argv[index] === '--source-commit' && sha40.test(argv[index + 1] || '')) result.sourceCommit = argv[++index];
    else throw new Error('retention_migration_invalid_arguments');
  }
  if (result.apply && !result.sourceCommit) throw new Error('retention_migration_source_commit_required');
  return result;
}

function exactTree(sourceCommit) {
  const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== sourceCommit || dirty) throw new Error('retention_migration_tree_not_exact_reviewed_commit');
}

function connectionConfig() {
  const value = process.env.STOCKINSIDER_RETENTION_MIGRATION_DATABASE_URL;
  if (!value) throw new Error('retention_migration_database_url_missing');
  const parsed = new URL(value);
  const local = ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname);
  for (const parameter of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) parsed.searchParams.delete(parameter);
  if (local) return { connectionString: parsed.toString() };
  const caFile = process.env.STOCKINSIDER_RETENTION_MIGRATION_CA_FILE;
  if (!caFile) throw new Error('retention_migration_ca_file_required');
  const stat = fs.lstatSync(caFile);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('retention_migration_ca_file_invalid');
  return { connectionString: parsed.toString(), ssl: { rejectUnauthorized: true, ca: fs.readFileSync(caFile, 'utf8') } };
}

async function applyMigrations(plans, sourceCommit) {
  exactTree(sourceCommit);
  const { Client } = require('pg');
  const client = new Client({ ...connectionConfig(), application_name: 'stockinsider-retention-archive-v1-migration', statement_timeout: 180_000, query_timeout: 180_000 });
  await client.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-retention-archive-v1',0))");
    locked = true;
    const prerequisite = await client.query(`SELECT
      to_regclass('public.candidate_research_runs') IS NOT NULL AS research_runs,
      to_regclass('public.candidate_detail_snapshots') IS NOT NULL AS details,
      to_regclass('public.source_run_ledger') IS NOT NULL AS source_runs,
      to_regclass('public.worker_job_runs') IS NOT NULL AS worker_runs`);
    if (!Object.values(prerequisite.rows[0] || {}).every(Boolean)) throw new Error('retention_migration_prerequisite_missing');
    for (const plan of plans) await client.query(plan.sql);
    const verified = await client.query(`SELECT
      to_regclass('public.retention_archive_manifests_v1') IS NOT NULL AS manifests,
      to_regclass('public.retention_archive_manifest_rows_v1') IS NOT NULL AS manifest_rows,
      to_regclass('public.retention_archive_pin_events_v1') IS NOT NULL AS pins,
      to_regprocedure('public.retention_archive_eligibility_v1(text,uuid,timestamptz)') IS NOT NULL AS eligibility,
      to_regprocedure('public.retention_archive_deletion_readiness_v1(uuid)') IS NOT NULL AS readiness,
      to_regclass('public.retention_archive_manifests_v2') IS NOT NULL AS manifests_v2,
      to_regclass('public.retention_legacy_content_objects_v2') IS NOT NULL AS content_objects_v2,
      to_regprocedure('public.retention_legacy_run_plan_v2(timestamptz,integer)') IS NOT NULL AS run_plan_v2,
      to_regprocedure('public.list_connector_retention_archive_candidates_v2(timestamptz,integer)') IS NOT NULL AS connector_plan_v2`);
    if (!Object.values(verified.rows[0] || {}).every(Boolean)) throw new Error('retention_migration_verification_failed');
    return verified.rows[0];
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-retention-archive-v1',0))").catch(() => undefined);
    await client.end();
  }
}

const options = argumentsFor(process.argv.slice(2));
const plans = migrationPlans();
const verification = options.apply ? await applyMigrations(plans, options.sourceCommit) : null;
process.stdout.write(`${JSON.stringify({ protocol: 'stockinsider-retention-archive-v1-migration-plan',
  sourceCommit: options.sourceCommit || null,
  migration: { relativePath: plans[0].relativePath, bytes: plans[0].bytes, sha256: plans[0].sha256 },
  migrations: plans.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
  applied: options.apply, verification })}\n`);
