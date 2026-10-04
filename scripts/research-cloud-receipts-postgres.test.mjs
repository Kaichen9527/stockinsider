import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const binaries = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const available = Boolean(binaries && ['initdb', 'pg_ctl', 'psql']
  .every((name) => fs.existsSync(path.join(binaries, name))));
const digest = 'a'.repeat(64);

test('Cloud validated receipts are atomic, immutable and distinct from generic completions',
  { skip: !available && 'local PostgreSQL tools unavailable' }, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-cloud-receipt-'));
    const cluster = path.join(temporary, 'cluster'); const port = 54000 + process.pid % 10000;
    const run = (binary, args) => execFileSync(path.join(binaries, binary), args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
    const sql = (query) => run('psql', ['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',temporary,'-p',String(port),'-d','postgres','-c',query]);
    let started = false;
    try {
      run('initdb',['-D',cluster,'-A','trust','--no-instructions']);
      run('pg_ctl',['-D',cluster,'-l',path.join(temporary,'postgres.log'),'-o',`-h '' -k ${temporary} -p ${port}`,'-w','start']); started=true;
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
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
        '20260929_research_agent_state_v1.sql', '20260929_research_deep_jobs_v1.sql', '20261004_research_cloud_receipts_v1.sql']) {
        run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
          '-f', path.join(root, 'migrations', name)]);
      }


      const key=`cloud:v1:${digest}`;
      // One exact work key per role; explicit fixture reservations avoid using
      // the wall-clock-dependent daily scheduler to test receipt transactions.
      const reservation=(id,offset=0,role='independent_test',workKey=key)=>sql(`INSERT INTO research_model_reservations_v1
        (reservation_id,role,owner,work_key,taipei_day,started_at,lease_expires_at)
        SELECT '${id}', '${role}', 'cloud-test', '${workKey}', current_date, started, started+interval '30 minutes'
        FROM (SELECT clock_timestamp()+interval '${offset} minutes' AS started) t RETURNING reservation_id`).split('\n')[0];
      const first=reservation('11111111-1111-4111-8111-111111111111');
      const accept=(id,hash=digest,workHash=digest)=>sql(`SELECT accept_research_cloud_result_v1('${id}','cloud-test','${key}',
        '${workHash}','${'a'.repeat(40)}','completed','${hash}')`);
      assert.equal(accept(first),'t'); assert.equal(accept(first),'t');
      assert.equal(sql('SELECT count(*) FROM research_cloud_acceptances_v1'),'1');
      assert.equal(sql('SELECT count(*) FROM research_model_completions_v1'),'1');
      assert.throws(()=>accept(first,'b'.repeat(64)),/replay_mismatch/u);
      assert.throws(()=>accept(first,digest,'b'.repeat(64)),/replay_mismatch/u);
      assert.throws(()=>sql("UPDATE research_cloud_acceptances_v1 SET outcome='failed'"),/immutable_revision/u);
      assert.equal(sql("SELECT has_table_privilege('service_role','research_cloud_acceptances_v1','INSERT')"),'f');
      assert.equal(sql("SELECT has_function_privilege('anon','accept_research_cloud_result_v1(uuid,text,text,text,text,text,text)','EXECUTE')"),'f');

      // Remove no accepted rows. Different fixture roles/keys test rejected
      // receiver identities; a generic accounting finish can never mint a receipt.
      const genericKey=`cloud:v1:${'b'.repeat(64)}`;
      const generic=reservation('22222222-2222-4222-8222-222222222222',0,'independent_test',genericKey);
      sql(`SELECT finish_research_model_v1('${generic}','cloud-test','completed','${digest}')`);
      assert.throws(()=>sql(`SELECT accept_research_cloud_result_v1('${generic}','cloud-test','${genericKey}',
        '${digest}','${'a'.repeat(40)}','completed','${digest}')`),/generic_completion_not_acceptance/u);
      assert.equal(sql(`SELECT count(*) FROM research_cloud_acceptances_v1 WHERE reservation_id='${generic}'`),'0');
      const expiredKey=`cloud:v1:${'c'.repeat(64)}`;
      const expired=reservation('33333333-3333-4333-8333-333333333333',-31,'independent_test',expiredKey);
      const expiredAccept=()=>sql(`SELECT accept_research_cloud_result_v1('${expired}','cloud-test','${expiredKey}',
        '${digest}','${'a'.repeat(40)}','completed','${digest}')`);
      assert.throws(expiredAccept,/lease_lost/u);
      assert.equal(sql(`SELECT count(*) FROM research_model_completions_v1 WHERE reservation_id='${expired}'`),'0');
      // A previously accepted immutable receipt is replayable after expiry.
      sql(`INSERT INTO research_model_completions_v1(reservation_id,owner,outcome,result_hash)
        VALUES('${expired}','cloud-test','completed','${digest}');
        INSERT INTO research_cloud_acceptances_v1(reservation_id,owner,work_key,work_hash,source_commit,result_hash,outcome)
        VALUES('${expired}','cloud-test','${expiredKey}','${digest}','${'a'.repeat(40)}','${digest}','completed')`);
      assert.equal(expiredAccept(),'t');
      const failureKey=`cloud:v1:${'d'.repeat(64)}`;
      const failure=reservation('44444444-4444-4444-8444-444444444444',0,'independent_test',failureKey);
      sql(`CREATE FUNCTION reject_cloud_insert_fixture() RETURNS trigger LANGUAGE plpgsql AS
        $$ BEGIN RAISE EXCEPTION 'fixture_receipt_write_failure'; END $$;
        CREATE TRIGGER reject_cloud_fixture BEFORE INSERT ON research_cloud_acceptances_v1
        FOR EACH ROW EXECUTE FUNCTION reject_cloud_insert_fixture()`);
      assert.throws(()=>sql(`SELECT accept_research_cloud_result_v1('${failure}','cloud-test','${failureKey}',
        '${digest}','${'a'.repeat(40)}','completed','${digest}')`),/fixture_receipt_write_failure/u);
      assert.equal(sql(`SELECT count(*) FROM research_model_completions_v1 WHERE reservation_id='${failure}'`),'0');
    } finally {
      if(started) { try { run('pg_ctl',['-D',cluster,'-m','immediate','stop']); } catch {} }
      fs.rmSync(temporary,{recursive:true,force:true});
    }
  });
