#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const files = Object.freeze([
  'migrations/20260929_candidate_dossier_outbox_v6.sql',
  'migrations/20260929_research_agent_state_v1.sql',
  'migrations/20260929_research_deep_jobs_v1.sql',
]);
const SHA40 = /^[0-9a-f]{40}$/u;
function plan() {
  return files.map((relativePath) => {
    const absolute = path.join(root, relativePath);
    const stat = fs.lstatSync(absolute);
    if (!stat.isFile() || stat.isSymbolicLink() || fs.realpathSync(absolute) !== absolute) {
      throw new Error(`research_agent_migration_not_regular:${relativePath}`);
    }
    const sql = fs.readFileSync(absolute, 'utf8');
    if (/\b(?:DROP\s+(?:TABLE|SCHEMA|TYPE)|TRUNCATE)\b/iu.test(sql)) {
      throw new Error(`research_agent_destructive_migration:${relativePath}`);
    }
    return { relativePath, sql, bytes: Buffer.byteLength(sql),
      sha256: createHash('sha256').update(sql).digest('hex') };
  });
}
function parse(argv) {
  let apply = false; let sourceCommit = null;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--apply') apply = true;
    else if (argv[index] === '--source-commit' && SHA40.test(argv[index + 1] || '')) sourceCommit = argv[++index];
    else throw new Error('research_agent_arguments_invalid');
  }
  if (apply && !sourceCommit) throw new Error('research_agent_exact_source_commit_required');
  return { apply, sourceCommit };
}
function assertReviewedTree(sourceCommit) {
  const head = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  const dirty = execFileSync('/usr/bin/git', ['status', '--porcelain=v1', '--untracked-files=all'], { cwd: root, encoding: 'utf8' }).trim();
  if (head !== sourceCommit || dirty) throw new Error('research_agent_tree_not_exact_reviewed_commit');
}
async function applyMigrations(migrations, sourceCommit) {
  assertReviewedTree(sourceCommit);
  const { Client } = require('pg');
  const { resolvePostgresConnectionReference } = require('./runtime/credential-resolver');
  const client = new Client({
    connectionString: resolvePostgresConnectionReference('keychain:stockinsider-runtime:database-url'),
    application_name: 'stockinsider-research-agent-migration',
    statement_timeout: 180_000, query_timeout: 180_000,
  });
  await client.connect();
  let locked = false;
  try {
    await client.query("SELECT pg_advisory_lock(hashtextextended('stockinsider-research-agents',0))");
    locked = true;
    const pre = await client.query(`SELECT
      to_regclass('public.candidate_dossier_outbox_v5') IS NOT NULL AS outbox,
      to_regclass('public.candidate_dossier_submission_receipts') IS NOT NULL AS receipts,
      to_regclass('public.candidate_detail_snapshots') IS NOT NULL AS detail,
      to_regprocedure('public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)') IS NOT NULL AS submission`);
    if (!Object.values(pre.rows[0] || {}).every(Boolean)) throw new Error('research_agent_prerequisite_missing');
    for (const migration of migrations) await client.query(migration.sql);
    const post = await client.query(`SELECT
      to_regprocedure('public.record_candidate_dossier_submission_v6(uuid,text,uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)') IS NOT NULL AS atomic_submission,
      to_regclass('public.research_priority_runs_v1') IS NOT NULL AS priority,
      to_regclass('public.candidate_deep_article_reviews_v1') IS NOT NULL AS article_review,
      to_regclass('public.candidate_thesis_qualifications_v1') IS NOT NULL AS thesis,
      to_regclass('public.candidate_technical_decisions_v1') IS NOT NULL AS technical,
      to_regclass('public.research_deep_jobs_v1') IS NOT NULL AS jobs,
      to_regprocedure('public.claim_research_deep_job_v1(text)') IS NOT NULL AS claim`);
    if (!Object.values(post.rows[0] || {}).every(Boolean)) throw new Error('research_agent_migration_verification_failed');
    return post.rows[0];
  } finally {
    if (locked) await client.query("SELECT pg_advisory_unlock(hashtextextended('stockinsider-research-agents',0))").catch(() => undefined);
    await client.end();
  }
}
if (path.resolve(process.argv[1] || '') === fileURLToPath(import.meta.url)) {
  const options = parse(process.argv.slice(2));
  const migrations = plan();
  const verification = options.apply ? await applyMigrations(migrations, options.sourceCommit) : null;
  process.stdout.write(`${JSON.stringify({
    protocol: 'research-agent-migration-plan-v1', sourceCommit: options.sourceCommit,
    migrations: migrations.map(({ relativePath, bytes, sha256 }) => ({ relativePath, bytes, sha256 })),
    applied: options.apply, verification,
  })}\n`);
}
