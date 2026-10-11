import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { assertReviewedMigrationSql, classifyReviewedMigrationSql } from './migration-sql-policy.mjs';

const root = new URL('../../', import.meta.url);
const plan = () => JSON.parse(execFileSync(process.execPath,
  ['scripts/opportunity-v3/migration-plan.mjs'], { cwd: root, encoding: 'utf8' }));

test('whole-file protective exceptions keep lexical blockers and the approved base chain', () => {
  const p = plan();
  assert.equal(p.migrations.length, 48);
  assert.equal(p.orderedChainSha256, '37dfacc252ec24a719b898b2b3ea31fc77c1631db083211f1f171c956772c613');
  assert.equal(p.researchAgentExtension.migrations.length, 24);
  const all = [...p.migrations, ...p.researchAgentExtension.preludeMigrations,
    ...p.researchAgentExtension.migrations];
  const exceptions = all.filter(row => row.protectiveSqlException);
  assert.equal(exceptions.length, 10);
  for (const row of all) {
    const bytes = fs.readFileSync(new URL(row.migration, root));
    assert.deepEqual(assertReviewedMigrationSql(row.migration, bytes),
      { sha256: row.sha256, additiveOnly: row.additiveOnly,
        protectiveSqlException: row.protectiveSqlException, allowed: row.allowed });
  }
  for (const row of exceptions) {
    const bytes = fs.readFileSync(new URL(row.migration, root));
    assert.equal(row.additiveOnly, false, 'exception must remain visible');
    for (const suffix of ['\n', '\nTRUNCATE public.stocks;', '\nDROP TABLE public.stocks;',
      '\nDROP SCHEMA public;', '\nDROP TYPE public.financial_fact_key_v3;']) {
      assert.throws(() => assertReviewedMigrationSql(row.migration,
        Buffer.concat([bytes, Buffer.from(suffix)])), /non_additive_migration_rejected/u);
    }
    for (const otherPath of ['migrations/copied.sql', './' + row.migration,
      row.migration.replace('migrations/', 'migrations/../migrations/')]) {
      assert.throws(() => assertReviewedMigrationSql(otherPath, bytes), /non_additive_migration_rejected/u);
    }
  }
});

test('unknown destructive SQL, including comments and function bodies, still fails closed', () => {
  for (const text of ['TRUNCATE t;', 'DROP TABLE t;', 'drop schema x;', 'DROP TYPE x;',
    '-- TRUNCATE guard\nSELECT 1;', 'CREATE FUNCTION x() RETURNS void LANGUAGE plpgsql AS $$BEGIN TRUNCATE t; END$$;']) {
    assert.throws(() => assertReviewedMigrationSql('migrations/unknown.sql', Buffer.from(text)),
      /non_additive_migration_rejected/u);
  }
  assert.equal(classifyReviewedMigrationSql('migrations/unknown.sql', Buffer.from('SELECT 1;')).allowed, true);
  assert.throws(() => assertReviewedMigrationSql('migrations/unknown.sql', 'SELECT 1;'), /input_invalid/u);
});
