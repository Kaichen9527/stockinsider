import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { migrationBodyInAtomicTransaction } from './atomic-migration-chain.mjs';

test('transaction normalization preserves quoted PL/pgSQL and rejects embedded control', () => {
  const body = "CREATE FUNCTION f() RETURNS void AS $fn$ BEGIN; /* nested */ COMMIT; END; $fn$ LANGUAGE plpgsql;";
  assert.equal(migrationBodyInAtomicTransaction(`-- outer\nBEGIN;\n${body}\nCOMMIT;`).trim(), body);
  assert.equal(migrationBodyInAtomicTransaction("SELECT 'COMMIT;''literal'; /* BEGIN; /* nested */ */ SELECT $$ROLLBACK;$$;"),
    "SELECT 'COMMIT;''literal';\n /* BEGIN; /* nested */ */ SELECT $$ROLLBACK;$$;");
  for (const sql of ['BEGIN; SELECT 1;', 'SELECT 1; COMMIT;', 'BEGIN; SELECT 1; COMMIT; SELECT 2;',
    'SELECT 1; /* comment */ ROLLBACK;', 'START TRANSACTION; SELECT 1; COMMIT;',
    'SELECT 1; SAVEPOINT injected;', 'CREATE INDEX CONCURRENTLY idx ON t(id);', 'VACUUM t;',
    'SELECT $body$unclosed', "SELECT 'unclosed", 'SELECT 1; /* unclosed']) {
    assert.throws(() => migrationBodyInAtomicTransaction(sql), /migration_/u);
  }
});
test('every explicitly reviewed migration is compatible with one atomic transaction', () => {
  const plan = fs.readFileSync(new URL('./migration-plan.mjs', import.meta.url), 'utf8');
  const paths = [...plan.matchAll(/['"](migrations\/[^'"]+[.]sql)['"]/gu)].map((match) => match[1]);
  assert.ok(paths.length > 40);
  for (const path of paths) assert.ok(migrationBodyInAtomicTransaction(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')), path);
  const runner = fs.readFileSync(new URL('./apply-reviewed-migrations.mjs', import.meta.url), 'utf8');
  // Keep original installer expectations; absence is a real pending dependency, not -1 < loop.
  assert.ok(runner.includes("await client.query('BEGIN')"), 'actual atomic installer BEGIN is missing');
  assert.ok(runner.includes("await client.query('COMMIT')"), 'actual atomic installer COMMIT is missing');
  assert.ok(runner.indexOf("await client.query('BEGIN')") < runner.indexOf('for(const migration of plan.migrations)'));
  assert.ok(runner.lastIndexOf("await client.query('COMMIT')") > runner.indexOf('await verifyReviewedMigrationPostconditions(client, options)'));
  assert.match(runner, /if\(transactionOpen\)try\{await client.query\('ROLLBACK'\)/u);
});

test('atomic scanner does not hide COMMIT inside dollar-containing unquoted identifiers', () => {
  for (const sql of [
    'BEGIN; CREATE TEMP TABLE foo$tag$(i integer); COMMIT; CREATE TEMP TABLE bar$tag$(i integer); COMMIT;',
    'CREATE TEMP TABLE foo$$(i integer); ROLLBACK; CREATE TEMP TABLE bar$$(i integer);',
    'CREATE TEMP TABLE 名$tag$(i integer); COMMIT; CREATE TEMP TABLE 別$tag$(i integer);',
  ]) assert.throws(() => migrationBodyInAtomicTransaction(sql), /migration_embedded_transaction_control/u);
});
test('atomic scanner recognizes CR line endings rather than silently dropping real control', () => {
  assert.throws(() => migrationBodyInAtomicTransaction('SELECT 1; -- not a quote\rCOMMIT; SELECT 2;'), /migration_embedded_transaction_control/u);
  const body = 'CREATE TABLE t(i integer);';
  assert.equal(migrationBodyInAtomicTransaction(`-- comment\rBEGIN;\r${body}\rCOMMIT;`).trim(),body);
});
test('atomic scanner preserves E-string, nested comment and dollar bodies containing apparent control', () => {
  for (const body of [
    String.raw`SELECT E'escaped\' COMMIT; -- still string';`,
    String.raw`SELECT e'backslash\\ quote\' ROLLBACK;';`,
    '/* outer /* nested COMMIT; */ still comment */ SELECT 1;',
    'DO $fn$ BEGIN PERFORM 1; /* COMMIT; */ END $fn$;',
    'SELECT $$COMMIT; ROLLBACK;$$;',
    'CREATE TABLE foo$tag$(i integer); CREATE TABLE bar$tag$(i integer);',
  ]) assert.equal(migrationBodyInAtomicTransaction(`BEGIN; ${body} COMMIT;`).trim().replaceAll('\n',''), body.replaceAll('\n',''));
});
test('atomic scanner rejects control verbs and nontransactional DDL outside lexical islands', () => {
  for (const sql of ['SAVEPOINT s;', 'RELEASE SAVEPOINT s;', 'ABORT;', 'END;',
    'PREPARE TRANSACTION \'x\';', 'SET LOCAL TRANSACTION READ ONLY;',
    'CREATE DATABASE d;', 'ALTER SYSTEM SET work_mem=\'1MB\';',
    'REINDEX CONCURRENTLY i;', 'CREATE INDEX CONCURRENTLY i ON t(id);']) {
    assert.throws(()=>migrationBodyInAtomicTransaction(sql), /migration_/u);
  }
});

test('atomic scanner normalizes every unchanged base migration without claiming installer integration', () => {
  const plan = fs.readFileSync(new URL('./migration-plan.mjs', import.meta.url), 'utf8');
  const paths = [...plan.matchAll(/['"](migrations\/[^'"]+[.]sql)['"]/gu)].map(match => match[1]);
  assert.equal(paths.length, 48);
  for (const path of paths) assert.ok(migrationBodyInAtomicTransaction(fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8')), path);
});

test('atomic scanner rejects additional documented commands that cannot run in a transaction', () => {
  for (const sql of ['DROP DATABASE d;', 'CREATE TABLESPACE t LOCATION \'/tmp/t\';',
    'DROP TABLESPACE t;', 'REINDEX (CONCURRENTLY) INDEX i;', 'DISCARD ALL;',
    'ALTER DATABASE d SET TABLESPACE t;']) {
    assert.throws(()=>migrationBodyInAtomicTransaction(sql), /migration_nontransactional_statement/u);
  }
});
