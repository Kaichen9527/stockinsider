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
  assert.ok(runner.indexOf("await client.query('BEGIN')") < runner.indexOf('for(const migration of plan.migrations)'));
  assert.ok(runner.indexOf("await client.query('COMMIT')") > runner.indexOf('migration_postcondition_failed'));
  assert.match(runner, /if\(transactionOpen\)try\{await client.query\('ROLLBACK'\)/u);
});
