import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createIsolatedPgClock, verifyIsolatedPgClock, boundedPgCommand, cleanIsolatedPgCluster } from './test-support/isolated-pg-clock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000, maxBuffer: 65536 });
const bin = config.status === 0 ? config.stdout.trim() : '';
const migrations = ['20260907_candidate_dossier_outbox_v5.sql', '20260929_candidate_dossier_outbox_v6.sql',
  '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql'];
const hash = value => createHash('sha256').update(value).digest('hex');

for (const [window, time] of [['open', '12:00:00'], ['closed', '23:43:00']]) {
  test(`real unchanged PostgreSQL policy preserves ${window} lease window across restart`, t => {
    assert.ok(bin && ['initdb', 'pg_ctl', 'psql', 'postgres'].every(name => fs.existsSync(path.join(bin, name))),
      'PostgreSQL tools required; no skipped clock acceptance');
    const clock = createIsolatedPgClock({ taipeiTime: time });
    assert.equal(clock.mode, 'controlled_clock', 'explicit Linux library required; no real-clock acceptance');
    const originalHashes = migrations.map(name => hash(fs.readFileSync(path.join(root, 'migrations', name))));
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'si-clock-pg-'));
    const cluster = path.join(temporary, 'cluster');
    const port = 54000 + process.pid % 10000;
    const run = (binary, args, limits = {}) => boundedPgCommand(path.join(bin, binary), args, {
      env: binary === 'pg_ctl' ? clock.childEnv : process.env, timeout: binary === 'psql' ? (limits.timeout ?? 5000) : 30_000 });
    const sql = (query, limits) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', temporary, '-p', String(port), '-d', 'postgres', '-c', query], limits);
    const start = () => run('pg_ctl', ['-D', cluster, '-l', path.join(temporary, 'postgres.log'),
      '-o', `-h '' -k ${temporary} -p ${port}`, '-w', 'start']);
    const stop = () => run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']);
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']); start();
      t.diagnostic(JSON.stringify({ window, ...verifyIsolatedPgClock(sql, clock),
        postgres: run('postgres', ['--version']), migrationHashes: originalHashes }));
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text, market text);
        CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid);
        CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid PRIMARY KEY,revision_id uuid,published_revision_id uuid,input_hash text);
        CREATE TABLE public.candidate_daily_stage_snapshots(detail_revision_id uuid);
        CREATE TABLE public.candidate_research_dossiers(id uuid PRIMARY KEY,content jsonb,validation_status text,detail_snapshot_id uuid,narrative_kind text,input_hash text);
        CREATE TABLE public.candidate_dossier_submission_receipts(submission_id uuid PRIMARY KEY,revision_id uuid,input_hash text,dossier_id uuid,status text,submission_hash text,bundle_id uuid,rejection_reasons jsonb);
        CREATE FUNCTION public.reject_candidate_dossier_revision_mutation_v4() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_revision'; END $$;
        CREATE FUNCTION public.record_candidate_dossier_submission_v4(uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)
          RETURNS TABLE(submission_id uuid,dossier_id uuid,status text,rejection_reasons jsonb,idempotent_replay boolean)
          LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::uuid,'rejected'::text,'[]'::jsonb,false $$;`);
      for (const name of migrations) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary,
        '-p', String(port), '-d', 'postgres', '-f', path.join(root, 'migrations', name)]);
      const expectedSource = fs.readFileSync(path.join(root, 'migrations', migrations[2]), 'utf8');
      for (const name of ['research_model_lease_fits_day_v1', 'reserve_research_model_v1']) {
        const marker = `CREATE OR REPLACE FUNCTION public.${name}`;
        const startAt = expectedSource.indexOf(marker);
        const bodyStart = expectedSource.indexOf('AS $function$', startAt) + 'AS $function$'.length;
        const expected = expectedSource.slice(bodyStart, expectedSource.indexOf('$function$;', bodyStart));
        assert.equal(sql(`SELECT encode(sha256(convert_to(prosrc,'UTF8')),'hex') FROM pg_proc
          WHERE oid='public.${name}(${name === 'reserve_research_model_v1' ? 'text,text,text' : 'timestamptz'})'::regprocedure`), hash(expected));
      }
      for (const [at, expected] of [['23:29:59.999999', 't'], ['23:30:00', 'f'], ['23:59:59.999999', 'f']])
        assert.equal(sql(`SELECT research_model_lease_fits_day_v1('2026-10-08T${at}+08:00')`), expected);
      assert.equal(sql("SELECT research_model_lease_fits_day_v1('2026-10-09T00:00:00+08:00')"), 't');
      const reservation = sql("SELECT reservation_id FROM reserve_research_model_v1('discovery','clock-test','clock-reservation')");
      if (window === 'open') {
        assert.match(reservation, /^[a-f0-9-]{36}$/u);
        assert.equal(sql(`SELECT finish_research_model_v1('${reservation}','clock-test','failed','${'a'.repeat(64)}')`), 't');
      } else assert.equal(reservation, '');
      sql("INSERT INTO stocks VALUES('11111111-1111-4111-8111-111111111111','2409','TW')");
      const runId = sql(`INSERT INTO research_priority_runs_v1(as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)
        VALUES(clock_timestamp(),'research-priority-v1','${'a'.repeat(64)}',1,1,'[]','[]',
        '[{"symbol":"2409","disposition":"queued","independentRootCount":1}]') RETURNING run_id`).split('\n')[0];
      assert.equal(sql(`SELECT enqueue_research_deep_jobs_v1('${runId}')`), '1');
      const claim = sql("SELECT job_id FROM claim_research_deep_job_v1('clock-worker')");
      if (window === 'open') assert.match(claim, /^[a-f0-9-]{36}$/u);
      else {
        assert.equal(claim, '');
        assert.equal(sql('SELECT count(*) FROM research_model_reservations_v1'), '0');
        assert.equal(sql('SELECT count(*) FROM research_deep_job_attempts_v1'), '0');
        assert.equal(sql("SELECT count(*) FROM research_deep_jobs_v1 WHERE status='running'"), '0');
        assert.equal(sql("SELECT status,attempts FROM research_deep_jobs_v1"), 'queued|0');
      }
      const beforeRestart = Number(sql('SELECT extract(epoch FROM clock_timestamp())'));
      stop(); start();
      verifyIsolatedPgClock(sql, clock);
      const afterRestart = Number(sql('SELECT extract(epoch FROM clock_timestamp())'));
      assert.ok(afterRestart > beforeRestart && afterRestart - beforeRestart < 30, 'clock restart continuity');
      assert.equal(sql("SELECT count(*) FROM research_model_reservations_v1"), window === 'open' ? '2' : '0');
      assert.deepEqual(migrations.map(name => hash(fs.readFileSync(path.join(root, 'migrations', name)))), originalHashes);
    } finally { cleanIsolatedPgCluster({ cluster, temporary, stop }); }
  });
}
