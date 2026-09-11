import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

test('retention control plane plans, receipts, verifies, and rechecks pins without deleting source rows', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'retention-archive-pg-'));
  const data = path.join(directory, 'data');
  const socket = path.join(directory, 'socket');
  fs.mkdirSync(socket);
  const user = os.userInfo().username;
  const port = 56000 + (process.pid % 3000);
  const binary = (name) => {
    if (process.env.OPPORTUNITY_V3_POSTGRES_BIN) return path.join(process.env.OPPORTUNITY_V3_POSTGRES_BIN, name);
    const found = spawnSync('/usr/bin/env', ['sh', '-c', 'command -v "$1"', 'pg-tool', name], { encoding: 'utf8' }).stdout.trim();
    assert.ok(found, `${name} must be installed`);
    return found;
  };
  const command = (name, args, input) => {
    const result = spawnSync(binary(name), args, { input, encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    assert.equal(result.status, 0, result.stderr || result.stdout);
    return result.stdout.trim();
  };
  const sql = (value) => command('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', String(port), '-U', user, '-d', 'postgres', '-At'], value);
  let started = false;
  try {
    command('initdb', ['-D', data, '--auth=trust', '--no-locale', '--encoding=UTF8', '-U', user]);
    command('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-F -k ${socket} -p ${port} -c listen_addresses=''`, '-w', 'start']);
    started = true;
    sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
      CREATE TABLE public.candidate_research_runs(id uuid primary key,status text,finished_at timestamptz);
      CREATE TABLE public.candidate_research_run_items(id uuid primary key,run_id uuid,status text);
      CREATE TABLE public.candidate_detail_snapshots(id uuid primary key,research_run_id uuid,stock_id uuid,available_at timestamptz,created_at timestamptz,fact_ids jsonb);
      CREATE TABLE public.candidate_daily_stage_snapshots(id uuid primary key,detail_revision_id uuid);
      CREATE TABLE public.candidate_official_facts(fact_id uuid primary key);
      CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid primary key,revision_id uuid);
      CREATE TABLE public.radar_public_snapshots(
        id uuid primary key,
        window_key text not null default 'daily',
        status text not null default 'valid',
        published_at timestamptz not null default now()
      );
      CREATE TABLE public.radar_publication_state(window_key text primary key,last_success_snapshot_id uuid);
      CREATE TABLE public.source_run_ledger(id uuid primary key,terminal_reason text,attempted_at timestamptz);
      CREATE TABLE public.candidate_source_mentions(id uuid primary key,source_run_ledger_id uuid);
      CREATE TABLE public.connector_runs(id uuid primary key,status text,finished_at timestamptz,metadata jsonb);
      CREATE TABLE public.source_audits(id uuid primary key,connector_run_id uuid,status text,created_at timestamptz,metadata jsonb);
      CREATE TABLE public.worker_job_runs(id uuid primary key,status text,finished_at timestamptz,metadata jsonb);
      CREATE TABLE public.worker_logs(id uuid primary key,level text,metadata jsonb,created_at timestamptz);
      CREATE TABLE public.runtime_artifacts(id uuid primary key,artifact_key text,metadata jsonb,created_at timestamptz);`);
    const migration = fs.readFileSync(new URL('../../migrations/20260911_retention_archive_v1.sql', import.meta.url), 'utf8');
    sql(migration);
    sql(migration);
    const candidateRunId = '22222222-2222-4222-8222-222222222222';
    const candidateItemId = '33333333-3333-4333-8333-333333333333';
    sql(`INSERT INTO public.candidate_research_runs VALUES('${candidateRunId}','success',clock_timestamp()-interval '100 days');
      INSERT INTO public.candidate_research_run_items VALUES('${candidateItemId}','${candidateRunId}','partial')`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_eligibility_v1(
      'candidate_research_run','${candidateRunId}',clock_timestamp())->>'eligible'`).split('\n').at(-1), 'false');
    const connectorRunId = '44444444-4444-4444-8444-444444444444';
    const sourceAuditId = '55555555-5555-4555-8555-555555555555';
    sql(`INSERT INTO public.connector_runs VALUES('${connectorRunId}','success',clock_timestamp()-interval '100 days','{}'::jsonb);
      INSERT INTO public.source_audits VALUES('${sourceAuditId}','${connectorRunId}','failed',clock_timestamp()-interval '100 days','{"unresolved":true}'::jsonb)`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_eligibility_v1(
      'connector_run','${connectorRunId}',clock_timestamp())->>'eligible'`).split('\n').at(-1), 'false');
    const incidentRunId = '66666666-6666-4666-8666-666666666666';
    sql(`INSERT INTO public.worker_job_runs VALUES('${incidentRunId}','success',clock_timestamp()-interval '100 days','{"security_event":true}'::jsonb)`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_eligibility_v1(
      'worker_job_run','${incidentRunId}',clock_timestamp())->>'eligible'`).split('\n').at(-1), 'false');
    const rootId = '11111111-1111-4111-8111-111111111111';
    sql(`INSERT INTO public.worker_job_runs VALUES('${rootId}','success',clock_timestamp()-interval '100 days','{}'::jsonb)`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_eligibility_v1('worker_job_run','${rootId}',clock_timestamp())->>'eligible'`).split('\n').at(-1), 'true');
    assert.equal(sql(`SET ROLE service_role; SELECT jsonb_array_length(public.list_retention_archive_candidates_v1('worker_job_run',clock_timestamp(),100))`).split('\n').at(-1), '1');
    const rowHash = sql(`SELECT public.retention_archive_current_row_hash_v1('public.worker_job_runs','${rootId}')`);
    const closureHash = sql(`SELECT encode(digest(convert_to('public.worker_job_runs|${rootId}|${rowHash}'||E'\\n','UTF8'),'sha256'),'hex')`);
    const manifestId = sql(`SET ROLE service_role; SELECT public.prepare_retention_archive_manifest_v1(
      'worker_job_run','${rootId}',clock_timestamp(),'${'a'.repeat(64)}','${closureHash}',
      '{"public.worker_job_runs":1}'::jsonb,
      '[{"relation":"public.worker_job_runs","key":"${rootId}","rowHash":"${rowHash}"}]'::jsonb,'test')`).split('\n').at(-1);
    assert.match(manifestId, /^[0-9a-f-]{36}$/u);
    sql(`SET ROLE service_role; SELECT public.record_retention_archive_export_v1('${manifestId}',
      'backup/retention/test.sira','${'b'.repeat(64)}',100,clock_timestamp())`);
    assert.equal(sql(`SELECT status FROM public.retention_archive_manifests_v1 WHERE manifest_id='${manifestId}'`), 'exported');
    sql(`DO $$ BEGIN UPDATE public.retention_archive_manifests_v1 SET status='failed' WHERE manifest_id='${manifestId}';
      RAISE EXCEPTION 'direct update accepted'; EXCEPTION WHEN OTHERS THEN
      IF SQLERRM<>'retention_archive_direct_mutation_rejected' THEN RAISE; END IF; END $$;`);
    sql(`SET ROLE service_role; SELECT public.record_retention_archive_restore_v1('${manifestId}',
      'scratch/restore-one',1,'${closureHash}','${'a'.repeat(64)}',clock_timestamp())`);
    assert.equal(sql(`SELECT status FROM public.retention_archive_manifests_v1 WHERE manifest_id='${manifestId}'`), 'verified');
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_deletion_readiness_v1('${manifestId}')->>'ready'`).split('\n').at(-1), 'true');
    assert.equal(sql(`SELECT count(*) FROM public.worker_job_runs WHERE id='${rootId}'`), '1');
    sql(`SET ROLE service_role; INSERT INTO public.retention_archive_pin_events_v1(
      relation_name,row_key,pin_kind,state,reason,actor_principal) VALUES(
      'public.worker_job_runs','${rootId}','manual','active','test pin','test')`);
    assert.equal(sql(`SET ROLE service_role; SELECT public.retention_archive_deletion_readiness_v1('${manifestId}')->>'ready'`).split('\n').at(-1), 'false');
    assert.equal(sql("SELECT has_function_privilege('authenticated','public.prepare_retention_archive_manifest_v1(text,uuid,timestamptz,text,text,jsonb,jsonb,text)','EXECUTE')"), 'f');
    assert.equal(sql("SELECT has_table_privilege('service_role','public.retention_archive_manifests_v1','UPDATE')"), 'f');
  } finally {
    if (started) command('pg_ctl', ['-D', data, '-m', 'fast', '-w', 'stop']);
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
