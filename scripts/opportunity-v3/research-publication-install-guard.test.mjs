import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import { assertResearchPublicationFirstInstall } from './research-publication-install-guard.mjs';

const { Client } = createRequire(import.meta.url)('pg');
const inventory = JSON.parse(fs.readFileSync(new URL('./research-publication-install-inventory.json', import.meta.url)));
const quote = v => '"' + v.replaceAll('"', '""') + '"';

test('first-install detection covers every residue before either base or extension can mutate', async t => {
  const bin = execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim();
  const directory = fs.mkdtempSync('/tmp/si-install-guard-');
  const data = path.join(directory, 'pg'), port = 55000 + process.pid % 1000;
  let running = false;
  const clients = [];
  try {
    execFileSync(path.join(bin, 'initdb'), ['-D', data, '-A', 'trust', '--no-instructions'], { stdio: 'pipe' });
    execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-l', path.join(directory, 'pg.log'),
      '-o', `-h '' -k ${directory} -p ${port}`, '-w', 'start'], { stdio: 'pipe' });
    running = true;
    const connect = async () => {
      const c = new Client({ host: directory, port, database: 'postgres', user: os.userInfo().username,
        statement_timeout: 5000 });
      clients.push(c); await c.connect(); return c;
    };
    const a = await connect(), b = await connect();
    await t.test('empty initial namespace passes; all fixed table/function/role/column/trigger residues reject', async () => {
      await assertResearchPublicationFirstInstall(a);
      const rejected = async statement => {
        await a.query('BEGIN');
        try {
          await a.query(statement);
          await assert.rejects(assertResearchPublicationFirstInstall(a),
            /research_publication_existing_profile_requires_reviewed_successor/u);
        } finally { await a.query('ROLLBACK'); }
      };
      for (const name of inventory.tables) await rejected(`CREATE TABLE public.${quote(name)}(id integer)`);
      for (const name of inventory.newFunctionNames) await rejected(
        `CREATE FUNCTION public.${quote(name)}() RETURNS integer LANGUAGE sql AS 'SELECT 1'`);
      for (const name of inventory.roles) await rejected(`CREATE ROLE ${quote(name)} NOLOGIN`);
      for (const [table, column] of inventory.columns) await rejected(
        `CREATE TABLE public.${quote(table)}(${quote(column)} text)`);
      for (const name of inventory.triggerNames) await rejected(`
        CREATE TABLE public.fixture(id integer);
        CREATE FUNCTION public.fixture_trigger() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RETURN NEW;END$$;
        CREATE TRIGGER ${quote(name)} BEFORE INSERT ON public.fixture FOR EACH ROW EXECUTE FUNCTION public.fixture_trigger()`);
      for (const name of inventory.guardedPredecessors) await rejected(`
        CREATE FUNCTION public.${quote(name)}() RETURNS void LANGUAGE plpgsql
        AS $$BEGIN RAISE EXCEPTION 'research_admission_read_committed_required';END$$`);
      await assertResearchPublicationFirstInstall(a);
    });
    await t.test('two real installers serialize then reject committed residue before replay', async () => {
      await a.query('BEGIN');
      await a.query("SELECT pg_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))");
      await assertResearchPublicationFirstInstall(a);
      await a.query('CREATE TABLE public.research_author_results_v2(id integer)');
      await b.query('BEGIN');
      let settled = false;
      const waiting = b.query("SELECT pg_advisory_xact_lock(hashtextextended('stockinsider-reviewed-v3-migration-v1',0))")
        .then(() => { settled = true; });
      let blocked = false;
      for (let count = 0; count < 100 && !blocked; count++) {
        blocked = (await a.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [b.processID])).rows[0].blocked;
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10));
      }
      assert.equal(blocked, true); assert.equal(settled, false);
      await a.query('COMMIT'); await waiting;
      await assert.rejects(assertResearchPublicationFirstInstall(b), /existing_profile_requires_reviewed_successor/u);
      await b.query('ROLLBACK');
    });
    await t.test('unknown detection fails closed and installed check precedes all mutation', async () => {
      await assert.rejects(assertResearchPublicationFirstInstall({ query: async () => ({ rows: [{}] }) }),
        /install_detection_failed/u);
      const source = fs.readFileSync(new URL('./apply-reviewed-migrations.mjs', import.meta.url), 'utf8');
      const check = source.indexOf('await assertResearchPublicationFirstInstall(client)');
      assert.ok(check > source.indexOf("await client.query('BEGIN')"));
      assert.ok(check < source.indexOf('for(const migration of plan.migrations)'));
      assert.ok(check < source.indexOf('if(options.researchAgentExtension) {'));
    });
  } finally {
    for (const c of clients) { try { await c.query('ROLLBACK'); } catch {} try { await c.end(); } catch {} }
    if (running) execFileSync(path.join(bin, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop'], { stdio: 'pipe' });
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
