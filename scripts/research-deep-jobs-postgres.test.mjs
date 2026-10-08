import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createIsolatedPgClock, verifyIsolatedPgClock, boundedPgCommand, cleanIsolatedPgCluster } from './test-support/isolated-pg-clock.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const binaries = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const available = Boolean(binaries && ['initdb', 'pg_ctl', 'psql']
  .every((name) => fs.existsSync(path.join(binaries, name))));
const digest = 'a'.repeat(64);

test('weekly five-article cap and daily four-attempt/one-lease Mac queue fail closed',
  { skip: !available && 'local PostgreSQL tools unavailable' }, (t) => {
    const clock = createIsolatedPgClock();
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-research-jobs-'));
    const cluster = path.join(temporary, 'cluster');
    const port = 54000 + process.pid % 10000;
    const run = (binary, args, limits = {}) => boundedPgCommand(path.join(binaries, binary), args, {
      env: binary === 'pg_ctl' ? clock.childEnv : process.env, timeout: binary === 'psql' ? (limits.timeout ?? 5000) : 30_000,
    });
    const sql = (query, limits) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', temporary, '-p', String(port), '-d', 'postgres', '-c', query], limits);
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']);
      run('pg_ctl', ['-D', cluster, '-l', path.join(temporary, 'postgres.log'),
        '-o', `-h '' -k ${temporary} -p ${port}`, '-w', 'start']);
      t.diagnostic(JSON.stringify({ ...verifyIsolatedPgClock(sql, clock), postgres: run('postgres', ['--version']) }));
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text, market text);
        CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid);
        CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid PRIMARY KEY,revision_id uuid,published_revision_id uuid,input_hash text);
        CREATE TABLE public.candidate_daily_stage_snapshots(detail_revision_id uuid);
        CREATE TABLE public.candidate_research_dossiers(id uuid PRIMARY KEY,content jsonb,validation_status text, detail_snapshot_id uuid,narrative_kind text,input_hash text);
        CREATE TABLE public.candidate_dossier_submission_receipts(
          submission_id uuid PRIMARY KEY,revision_id uuid,input_hash text,dossier_id uuid,status text,submission_hash text,bundle_id uuid,rejection_reasons jsonb);
        CREATE FUNCTION public.reject_candidate_dossier_revision_mutation_v4()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_revision'; END $$;
        CREATE FUNCTION public.record_candidate_dossier_submission_v4(
          uuid,uuid,text,text,jsonb,jsonb,jsonb,jsonb,text,jsonb)
          RETURNS TABLE(submission_id uuid,dossier_id uuid,status text,rejection_reasons jsonb,idempotent_replay boolean)
          LANGUAGE sql AS $$ SELECT NULL::uuid,NULL::uuid,'rejected'::text,'[]'::jsonb,false $$;`);
      for (const name of ['20260907_candidate_dossier_outbox_v5.sql',
        '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql']) {
        run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
          '-f', path.join(root, 'migrations', name)]);
      }
      for (let i = 0; i < 6; i += 1) {
        sql(`INSERT INTO public.stocks VALUES ('${String(i + 1).padStart(8, '0')}-1111-4111-8111-111111111111',
          '${String(2409 + i)}','TW')`);
      }
      const queue = Array.from({ length: 6 }, (_, index) => ({
        symbol: String(2409 + index), disposition: 'queued', independentRootCount: 1,
      }));
      const runId = sql(`INSERT INTO public.research_priority_runs_v1
        (as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)
        VALUES(clock_timestamp(),'research-priority-v1','${digest}',6,6,'[]','[]',
          '${JSON.stringify(queue)}'::jsonb) RETURNING run_id`).split('\n')[0];
      assert.equal(sql(`SELECT public.enqueue_research_deep_jobs_v1('${runId}')`), '5');
      assert.equal(sql(`SELECT public.enqueue_research_deep_jobs_v1('${runId}')`), '0');
      assert.equal(sql('SELECT count(*) FROM public.research_deep_jobs_v1'), '5');
      const first = sql("SELECT job_id FROM public.claim_research_deep_job_v1('mac-codex-1')");
      assert.ok(first);
      assert.equal(sql("SELECT count(*) FROM public.claim_research_deep_job_v1('mac-codex-2')"), '0');
      assert.throws(() => sql(`SELECT public.finish_research_deep_job_v2(
        '${first}','mac-codex-2',1,true,NULL,NULL)`), /lease_lost/u);
      assert.throws(() => sql(`SELECT public.finish_research_deep_job_v2(
        '${first}','mac-codex-1',1,true,NULL,NULL)`), /publication_receipt_required/u);
      assert.equal(sql(`SELECT public.finish_research_deep_job_v2(
        '${first}','mac-codex-1',1,false,NULL,'source acquisition unavailable')`), 't');
      for (let attempt = 2; attempt <= 3; attempt += 1) {
        const claimed = sql("SELECT job_id FROM public.claim_research_deep_job_v1('mac-codex-1')");
        assert.equal(claimed, first);
        assert.throws(() => sql(`SELECT public.finish_research_deep_job_v2(
          '${first}','mac-codex-1',${attempt - 1},false,NULL,'stale attempt')`), /lease_lost/u);
        assert.equal(sql(`SELECT public.finish_research_deep_job_v2(
          '${first}','mac-codex-1',${attempt},false,NULL,'source acquisition unavailable')`), 't');
      }
      assert.equal(sql(`SELECT status,attempts FROM public.research_deep_jobs_v1 WHERE job_id='${first}'`), 'failed|3');
      const fourth = sql("SELECT job_id FROM public.claim_research_deep_job_v1('mac-codex-1')");
      assert.ok(fourth && fourth !== first);
      assert.equal(sql(`SELECT public.finish_research_deep_job_v2(
        '${fourth}','mac-codex-1',1,false,NULL,'source acquisition unavailable')`), 't');
      assert.equal(sql("SELECT count(*) FROM public.claim_research_deep_job_v1('mac-codex-1')"), '0');
      assert.throws(() => sql('UPDATE public.research_deep_job_attempts_v1 SET owner=\'fake\''), /immutable_revision/u);
    } finally {
      cleanIsolatedPgCluster({ cluster, temporary,
        stop: () => run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']) });
    }
  });
