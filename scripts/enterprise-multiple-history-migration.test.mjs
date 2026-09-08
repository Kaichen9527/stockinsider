import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test, { after, before } from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migration = fs.readFileSync(path.join(root, 'migrations/20260907_04_enterprise_multiple_history_v6.sql'), 'utf8');
const research = fs.readFileSync(path.join(root, 'web/src/lib/candidate-research.ts'), 'utf8');
const principal = 'a11d4e67-7d0a-4c44-8a9d-1d5c3b875001';
const stock = '11111111-1111-4111-8111-111111111111';

function executable(name) {
  const configured = process.env.OPPORTUNITY_V3_POSTGRES_BIN
    ? path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name) : null;
  const candidates = [configured, `/opt/homebrew/bin/${name}`, `/usr/local/bin/${name}`].filter(Boolean);
  if (fs.existsSync('/usr/lib/postgresql')) {
    candidates.push(...fs.readdirSync('/usr/lib/postgresql')
      .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }))
      .map((version) => `/usr/lib/postgresql/${version}/bin/${name}`));
  }
  const discovered = spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'postgres-tool', name], {
    encoding: 'utf8',
  }).stdout.trim();
  if (discovered) candidates.push(discovered);
  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

const pg = { initdb: executable('initdb'), pgCtl: executable('pg_ctl'), psql: executable('psql') };
let cluster;

function command(binary, args, options = {}) {
  const result = spawnSync(binary, args, {
    cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, ...options,
  });
  if (result.status !== 0) throw new Error([`${path.basename(binary)} failed`, result.stdout, result.stderr].filter(Boolean).join('\n'));
  return result.stdout;
}

function psql(sql, extraArgs = []) {
  return command(pg.psql, [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port),
    '-U', cluster.user, '-d', 'postgres', ...extraArgs,
  ], { input: sql });
}

function rejectedSql(sql) {
  const result = spawnSync(pg.psql, [
    '-X', '-v', 'ON_ERROR_STOP=1', '-h', cluster.socket, '-p', String(cluster.port),
    '-U', cluster.user, '-d', 'postgres',
  ], { cwd: root, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' }, input: sql });
  assert.notEqual(result.status, 0, 'SQL unexpectedly succeeded');
  return result.stderr;
}

before(() => {
  for (const [name, binary] of Object.entries(pg)) assert.ok(binary, `PostgreSQL executable unavailable: ${name}`);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'enterprise-multiple-pg-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  const log = path.join(directory, 'postgres.log');
  fs.mkdirSync(socket);
  const port = 55000 + (process.pid % 5000);
  const user = os.userInfo().username;
  command(pg.initdb, ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
  command(pg.pgCtl, ['-D', data, '-l', log, '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
  cluster = { directory, data, socket, port, user };
  psql(`
    CREATE ROLE anon NOLOGIN;
    CREATE ROLE authenticated NOLOGIN;
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA extensions;
    CREATE EXTENSION pgcrypto WITH SCHEMA extensions;
    CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text NOT NULL);
    INSERT INTO public.stocks VALUES ('${stock}','2330');
    CREATE FUNCTION public.internal_principal_role_is_exact_v3_internal(uuid,text,timestamptz)
    RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT $1='${principal}'::uuid AND $2='opportunity_runner' $$;
  `);
});

after(() => {
  if (!cluster) return;
  command(pg.pgCtl, ['-D', cluster.data, '-m', 'fast', '-w', 'stop']);
  fs.rmSync(cluster.directory, { recursive: true, force: true });
});

test('enterprise multiples are append-only point-in-time observations instead of fabricated historical facts', () => {
  assert.match(migration, /CREATE TABLE IF NOT EXISTS public[.]candidate_enterprise_multiple_snapshots_v6/u);
  assert.match(migration, /PRIMARY KEY\(stock_id,session_date,model_version,calculation_input_hash\)/u);
  assert.match(migration, /append_candidate_enterprise_multiple_snapshot_v6/u);
  assert.match(migration, /p_session_date>p_available_at::date/u);
  assert.match(migration, /enterprise_multiple_snapshot_replay_missing/u);
  assert.match(migration, /REVOKE ALL ON public[.]candidate_enterprise_multiple_snapshots_v6 FROM PUBLIC,anon,authenticated,service_role/u);
  assert.doesNotMatch(migration, /generate_series|historical_backfill/iu);
  assert.match(research, /append_candidate_enterprise_multiple_snapshot_v6/u);
  assert.match(research, /ENTERPRISE_MULTIPLE_MODEL_VERSION/u);
});

test('enterprise multiple migration reapplies and the RPC preserves idempotent and revised observations', () => {
  psql(migration);
  psql(migration);
  const payload = JSON.stringify({
    cash_and_equivalents: 3, current_price: 100, diluted_shares: 10,
    total_debt: 5, ttm_ebitda: 2, ttm_revenue: 20,
  }).replaceAll("'", "''");
  const first = psql(`SET ROLE service_role; SELECT idempotent_replay FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-07','enterprise-multiple-v1','${payload}'::jsonb,ARRAY['22222222-2222-4222-8222-222222222222'::uuid],
    '2026-09-07T13:00:00Z','${principal}'); RESET ROLE;`, ['-At']).trim().split('\n').find((line) => line === 'f' || line === 't');
  assert.equal(first, 'f');
  const replay = psql(`SET ROLE service_role; SELECT idempotent_replay FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-07','enterprise-multiple-v1','${payload}'::jsonb,ARRAY['22222222-2222-4222-8222-222222222222'::uuid],
    '2026-09-07T13:00:00Z','${principal}'); RESET ROLE;`, ['-At']).trim().split('\n').find((line) => line === 'f' || line === 't');
  assert.equal(replay, 't');
  const secondFact = '33333333-3333-4333-8333-333333333333';
  psql(`SET ROLE service_role; SELECT idempotent_replay FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-06','enterprise-multiple-v1','${payload}'::jsonb,ARRAY['${secondFact}'::uuid,'22222222-2222-4222-8222-222222222222'::uuid],
    '2026-09-07T13:00:00Z','${principal}'); RESET ROLE;`);
  const reorderedReplay = psql(`SET ROLE service_role; SELECT idempotent_replay FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-06','enterprise-multiple-v1','${payload}'::jsonb,ARRAY['22222222-2222-4222-8222-222222222222'::uuid,'${secondFact}'::uuid,'${secondFact}'::uuid],
    '2026-09-07T13:00:00Z','${principal}'); RESET ROLE;`, ['-At']).trim().split('\n').find((line) => line === 'f' || line === 't');
  assert.equal(reorderedReplay, 't');
  assert.equal(psql(`SELECT cardinality(fact_ids) FROM public.candidate_enterprise_multiple_snapshots_v6 WHERE stock_id='${stock}' AND session_date='2026-09-06'`, ['-At']).trim(), '2');
  const revisedPayload = payload.replace('"current_price":100', '"current_price":90');
  psql(`SET ROLE service_role; SELECT idempotent_replay FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-07','enterprise-multiple-v1','${revisedPayload}'::jsonb,ARRAY['22222222-2222-4222-8222-222222222222'::uuid],
    '2026-09-07T13:01:00Z','${principal}'); RESET ROLE;`);
  assert.equal(psql(`SELECT count(*) FROM public.candidate_enterprise_multiple_snapshots_v6 WHERE stock_id='${stock}'`, ['-At']).trim(), '3');
  const privileges = JSON.parse(psql(`SELECT json_build_object(
    'tableInsert',has_table_privilege('authenticated','public.candidate_enterprise_multiple_snapshots_v6','INSERT'),
    'rpcExecute',has_function_privilege('authenticated','public.append_candidate_enterprise_multiple_snapshot_v6(uuid,date,text,jsonb,uuid[],timestamptz,uuid)','EXECUTE'))`, ['-At']).trim());
  assert.deepEqual(privileges, { tableInsert: false, rpcExecute: false });
  assert.match(rejectedSql(`SET ROLE service_role; SELECT * FROM public.append_candidate_enterprise_multiple_snapshot_v6(
    '${stock}','2026-09-08','enterprise-multiple-v1','${payload}'::jsonb,ARRAY['22222222-2222-4222-8222-222222222222'::uuid],
    '2026-09-07T13:00:00Z','${principal}');`), /invalid_enterprise_multiple_snapshot/u);
});
