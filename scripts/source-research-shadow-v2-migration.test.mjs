import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = path.join(root, 'migrations/20260901_source_research_shadow_v2.sql');

function executable(name) {
  const candidates = ['/opt/homebrew/bin', '/usr/local/bin'];
  const resolved = spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'postgres-tool', name], { encoding: 'utf8' }).stdout.trim();
  return [resolved, ...candidates.map((directory) => path.join(directory, name))].find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

const pg = { initdb: executable('initdb'), pgCtl: executable('pg_ctl'), psql: executable('psql') };
let cluster;

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, { cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, ...options });
  if (result.status !== 0) throw new Error([`${path.basename(binary)} failed`, result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout;
}

function psql(sql, args = []) {
  return command(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres', ...args], { input: sql });
}

function rejected(sql) {
  const result = spawnSync(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port), '-U', cluster.user, '-d', 'postgres'], {
    cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, input: sql,
  });
  assert.notEqual(result.status, 0, `SQL unexpectedly succeeded:\n${sql}`);
  return result.stderr;
}

before(() => {
  for (const [name, binary] of Object.entries(pg)) if (!binary) throw new Error(`PostgreSQL executable unavailable: ${name}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'source-shadow-v2-pg-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  fs.mkdirSync(socket);
  const port = 55000 + (process.pid % 8000);
  const user = os.userInfo().username;
  command(pg.initdb, ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
  command(pg.pgCtl, ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
  cluster = { directory, data, socket, port, user };
  psql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE EXTENSION pgcrypto;
    CREATE TABLE stocks(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),symbol text,name text,market text);
    CREATE TABLE source_raw_documents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),collected_at timestamptz DEFAULT now());
    CREATE TABLE candidate_source_mentions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),available_at timestamptz DEFAULT now());
    CREATE TABLE production_write_leases(lease_key text PRIMARY KEY,owner_id uuid,expires_at timestamptz);
    CREATE TABLE valuation_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),primary_method text NOT NULL);
    CREATE TABLE candidate_research_runs(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE candidate_daily_stage_snapshots(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
    CREATE TABLE stock_instruments_v3(
      stock_id uuid,symbol text,official_name text,official_short_name text,official_legal_name text,
      exchange text,source_timestamp timestamptz,recorded_at timestamptz,valid_from timestamptz,valid_to timestamptz,
      listing_status text,instrument_type text,instrument_authority_id uuid
    );
    CREATE TABLE stock_sector_assignments_v3(
      stock_id uuid,canonical_sector_key text,source_timestamp timestamptz,recorded_at timestamptz,
      valid_from timestamptz,valid_to timestamptz,status text,assignment_authority_id uuid
    );
    CREATE TABLE candidate_shadow_session_observations(
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),session_date date,ruleset_version text,model_version text
    );
    INSERT INTO candidate_shadow_session_observations(session_date,ruleset_version,model_version)
    VALUES ('2026-08-31','old-rules','old-model');
  `);
  command(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-f', migration]);
  command(pg.psql, ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-f', migration]);
});

after(() => {
  if (!cluster) return;
  spawnSync(pg.pgCtl, ['-D', cluster.data, '-m', 'fast', '-w', 'stop'], { encoding: 'utf8' });
  fs.rmSync(cluster.directory, { recursive: true, force: true });
});

test('migration is repeatable and starts Shadow v2 without rewriting v1 audit evidence', () => {
  psql(`INSERT INTO candidate_shadow_session_observations(session_date,ruleset_version,model_version)
    VALUES ('2026-09-01','new-rules','new-model');`);
  const versions = psql(`SELECT string_agg(shadow_policy_version,',' ORDER BY session_date)
    FROM candidate_shadow_session_observations;`, ['-At']).trim();
  assert.equal(versions, 'shadow-policy-v1,shadow-policy-v2');
  const objects = psql(`SELECT jsonb_build_object(
    'details',to_regclass('public.candidate_detail_snapshots') IS NOT NULL,
    'market',to_regclass('public.market_evidence_snapshots') IS NOT NULL,
    'manifest',to_regclass('public.candidate_shadow_manifests') IS NOT NULL,
    'writer',to_regprocedure('public.register_production_writer_release(text,jsonb)') IS NOT NULL
  )::text;`, ['-At']).trim();
  assert.deepEqual(JSON.parse(objects), { details: true, market: true, manifest: true, writer: true });
});

test('writer fence is dormant before activation and then requires exact release plus a live lease', () => {
  psql(`INSERT INTO source_raw_documents DEFAULT VALUES;`);
  psql(`SELECT register_production_writer_release('abcdef1','{}'::jsonb);`);
  assert.match(rejected(`INSERT INTO source_raw_documents DEFAULT VALUES;`), /production_writer_release_rejected/u);
  assert.match(rejected(`BEGIN;SELECT set_config('request.headers','{"x-stockinsider-writer-release":"abcdef1"}',true);INSERT INTO source_raw_documents DEFAULT VALUES;COMMIT;`), /production_writer_lease_required/u);
  psql(`
    INSERT INTO production_write_leases(lease_key,owner_id,expires_at)
    VALUES ('production-data-plane',gen_random_uuid(),now()+interval '1 hour');
    BEGIN;
    SELECT set_config('request.headers','{"x-stockinsider-writer-release":"abcdef1"}',true);
    INSERT INTO source_raw_documents DEFAULT VALUES;
    COMMIT;
  `);
  assert.equal(Number(psql('SELECT count(*) FROM source_raw_documents;', ['-At']).trim()), 2);
});
