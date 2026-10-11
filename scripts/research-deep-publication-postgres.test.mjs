import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const bin = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const available = Boolean(bin && ['initdb', 'pg_ctl', 'psql']
  .every((name) => fs.existsSync(path.join(bin, name))));
const ids = {
  stock: '11111111-1111-4111-8111-111111111111',
  revision: '22222222-2222-4222-8222-222222222222',
  bundle: '33333333-3333-4333-8333-333333333333',
  outbox: '44444444-4444-4444-8444-444444444444',
};
const inputHash = 'a'.repeat(64);
const articleHash = 'c'.repeat(64);
const submissionHash = 'd'.repeat(64);

for (const recovery of ['rejected', 'explicit_failure']) test(`deep publication preserves ordinary history and recovers ${recovery} plus expired leases`,
  { skip: !available && 'local PostgreSQL tools unavailable' }, () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-deep-publication-'));
    const cluster = path.join(temporary, 'cluster');
    const port = 54000 + process.pid % 10000;
    const run = (binary, args) => execFileSync(path.join(bin, binary), args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const sql = (query) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', temporary, '-p', String(port), '-d', 'postgres', '-c', query]);
    let started = false;
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']);
      run('pg_ctl', ['-D', cluster, '-l', path.join(temporary, 'postgres.log'),
        '-o', `-h '' -k ${temporary} -p ${port}`, '-w', 'start']);
      started = true;
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE TABLE public.stocks(id uuid PRIMARY KEY, symbol text, market text);
        CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY, stock_id uuid);
        CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid PRIMARY KEY, revision_id uuid,
          published_revision_id uuid, input_hash text);
        CREATE TABLE public.candidate_daily_stage_snapshots(detail_revision_id uuid);
        CREATE TABLE public.candidate_research_dossiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), content jsonb, validation_status text,
          detail_snapshot_id uuid,narrative_kind text,bundle_id uuid,input_hash text,claims jsonb,source_references jsonb,
          claim_fact_map jsonb,rejection_reasons jsonb,bundle_hash text,detail_payload_hash text,published_at timestamptz);
        CREATE UNIQUE INDEX uq_candidate_dossier_input_revision_v4 ON public.candidate_research_dossiers(detail_snapshot_id,narrative_kind,input_hash)
          WHERE input_hash IS NOT NULL AND validation_status='valid';
        CREATE TABLE public.candidate_dossier_submission_receipts(
          submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dossier_id uuid DEFAULT gen_random_uuid(),
          revision_id uuid, bundle_id uuid, input_hash text, submission_hash text UNIQUE,
          status text, rejection_reasons jsonb);
        CREATE FUNCTION public.reject_candidate_dossier_revision_mutation_v4()
          RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_revision'; END $$;
        CREATE FUNCTION public.record_candidate_dossier_submission_v4(
          p_bundle_id uuid,p_revision_id uuid,p_input_hash text,p_submission_hash text,
          p_content jsonb,p_claims jsonb,p_source_references jsonb,p_claim_fact_map jsonb,
          p_validation_status text,p_rejection_reasons jsonb)
          RETURNS TABLE(submission_id uuid,dossier_id uuid,status text,rejection_reasons jsonb,idempotent_replay boolean)
          LANGUAGE plpgsql AS $$ BEGIN
            RETURN QUERY INSERT INTO public.candidate_dossier_submission_receipts
              (revision_id,bundle_id,input_hash,submission_hash,status,rejection_reasons)
            VALUES(p_revision_id,p_bundle_id,p_input_hash,p_submission_hash,
              CASE WHEN p_validation_status='valid' THEN 'accepted' ELSE 'rejected' END,p_rejection_reasons)
            RETURNING candidate_dossier_submission_receipts.submission_id,
              candidate_dossier_submission_receipts.dossier_id,
              candidate_dossier_submission_receipts.status,
              candidate_dossier_submission_receipts.rejection_reasons,FALSE;
          END $$;`);
      const v4 = fs.readFileSync(path.join(root, 'migrations/20260906_candidate_dossier_v4.sql'), 'utf8');
      sql(v4.slice(v4.indexOf('CREATE OR REPLACE FUNCTION public.record_candidate_dossier_submission_v4'),
        v4.indexOf('CREATE OR REPLACE FUNCTION public.reject_candidate_dossier_revision_mutation_v4')));
      for (const filename of [
        '20260907_candidate_dossier_outbox_v5.sql',
        '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql',
        '20260929_research_deep_jobs_v1.sql',
      ]) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port),
        '-d', 'postgres', '-f', path.join(root, 'migrations', filename)]);
      sql(`INSERT INTO public.stocks VALUES ('${ids.stock}','2409','TW');
        INSERT INTO public.candidate_detail_snapshots VALUES ('${ids.revision}','${ids.stock}');
        INSERT INTO public.candidate_dossier_bundles VALUES
          ('${ids.bundle}','${ids.revision}','${ids.revision}','${inputHash}');
        INSERT INTO public.candidate_daily_stage_snapshots VALUES ('${ids.revision}');
        INSERT INTO public.candidate_dossier_outbox_v5(job_id,bundle_id,revision_id,input_hash)
          VALUES ('${ids.outbox}','${ids.bundle}','${ids.revision}','${inputHash}');`);
      const ordinaryId = ids.outbox;
      assert.equal(sql("SELECT job_id FROM public.claim_candidate_dossier_outbox_v5('ordinary-owner',1)"), ordinaryId);
      assert.equal(sql(`SELECT status FROM public.record_candidate_dossier_submission_v6(
        '${ordinaryId}','ordinary-owner','${ids.bundle}','${ids.revision}','${inputHash}','${'1'.repeat(64)}',
        '{"summary":"ordinary article"}','[]','[]','{}','valid','[]')`), 'accepted');
      const ordinaryReceipt = sql(`SELECT receipt_id FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ordinaryId}'`);
      const runId = sql(`INSERT INTO public.research_priority_runs_v1
        (as_of,policy_version,input_hash,expected_count,accounted_count,source_attempts,rows,research_queue)
        VALUES(clock_timestamp()-interval '1 minute','research-priority-v1','${inputHash}',1,1,'[]','[]',
          '[{"symbol":"2409","disposition":"queued","independentRootCount":1}]'::jsonb)
        RETURNING run_id`).split('\n')[0];
      assert.equal(sql(`SELECT public.enqueue_research_deep_jobs_v1('${runId}')`), '1');
      const jobId = sql("SELECT job_id FROM public.claim_research_deep_job_v1('deep-owner')").split('|')[0];
      const claimPublication = (attempt = 1) => sql(`SELECT job_id FROM public.claim_candidate_deep_outbox_v1(
        '${jobId}','deep-owner',${attempt},'${ids.revision}','${inputHash}','outbox-owner')`);
      ids.outbox = claimPublication();
      assert.match(ids.outbox, /^[0-9a-f-]{36}$/u);
      assert.equal(claimPublication(), ids.outbox);
      assert.notEqual(ids.outbox, ordinaryId);
      assert.equal(sql(`SELECT public.heartbeat_candidate_dossier_outbox_v6('${ids.outbox}','outbox-owner')`), 'f');
      assert.equal(sql(`SELECT public.release_candidate_dossier_outbox_v6('${ids.outbox}','outbox-owner',true,'retry')`), 'f');
      assert.throws(() => sql(`SELECT status FROM public.record_candidate_dossier_submission_v6(
        '${ids.outbox}','outbox-owner','${ids.bundle}','${ids.revision}','${inputHash}','${'2'.repeat(64)}',
        '{}','[]','[]','{}','valid','[]')`), /identity_mismatch/u);
      let reviewId = sql(`INSERT INTO public.candidate_deep_article_reviews_v1
        (revision_id,input_hash,article_hash,author_id,reviewer_id,decision,findings,source_document_ids,reviewed_at)
        VALUES ('${ids.revision}','${inputHash}','${articleHash}','author','independent','accepted','{}','[]',clock_timestamp())
        RETURNING id`).split('\n')[0];
      const submit = (attempt = 1, validation = 'valid', hash = submissionHash) => sql(`SELECT status,idempotent_replay FROM public.record_candidate_deep_submission_v1(
        '${jobId}','deep-owner',${attempt},'${reviewId}','${articleHash}',
        '${ids.outbox}','outbox-owner','${ids.bundle}','${ids.revision}',
        '${inputHash}','${hash}',
        '{"deepResearch":{"articleHash":"${articleHash}"}}'::jsonb,
        '[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'${validation}','[]'::jsonb)`);
      assert.throws(() => submit(2), /research_deep_job_lease_lost/u);
      assert.throws(() => sql(`SELECT public.finish_research_deep_job_v2(
        '${jobId}','deep-owner',1,true,NULL,NULL)`), /publication_receipt_required/u);
      sql(`UPDATE public.research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE job_id='${jobId}'`);
      assert.throws(() => submit(), /research_deep_job_lease_lost/u);
      sql(`UPDATE public.research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()+interval '30 minutes'
        WHERE job_id='${jobId}'`);
      sql(`UPDATE public.candidate_dossier_outbox_v5 SET lease_expires_at=clock_timestamp()-interval '1 second'
        WHERE job_id='${ids.outbox}'`);
      assert.throws(() => submit(), /research_deep_outbox_binding_missing/u);
      assert.equal(sql('SELECT count(*) FROM public.candidate_dossier_submission_receipts'), '1');
      assert.equal(sql(`SELECT status FROM public.research_deep_jobs_v1 WHERE job_id='${jobId}'`), 'running');
      sql(`UPDATE public.candidate_dossier_outbox_v5 SET lease_expires_at=clock_timestamp()+interval '20 minutes'
        WHERE job_id='${ids.outbox}'`);
      if (recovery === 'explicit_failure') {
        assert.equal(sql(`SELECT public.finish_research_deep_job_v2('${jobId}','deep-owner',1,false,NULL,'model failed')`), 't');
        assert.equal(sql(`SELECT status,lease_owner IS NULL FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.outbox}'`), 'queued|t');
      } else assert.equal(submit(1, 'rejected'), 'rejected|f');
      assert.equal(sql(`SELECT status FROM public.research_deep_jobs_v1 WHERE job_id='${jobId}'`), 'queued');
      assert.equal(sql("SELECT attempt FROM public.claim_research_deep_job_v1('deep-owner')"), '2');
      assert.throws(() => sql(`SELECT public.finish_research_deep_job_v2(
        '${jobId}','deep-owner',1,false,NULL,'stale attempt failure')`), /lease_lost/u);
      assert.equal(sql(`SELECT status,attempts FROM public.research_deep_jobs_v1 WHERE job_id='${jobId}'`), 'running|2');
      assert.equal(claimPublication(2), ids.outbox);
      sql(`UPDATE public.research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_id='${jobId}';
        UPDATE public.candidate_dossier_outbox_v5 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_id='${ids.outbox}'`);
      assert.equal(sql("SELECT count(*) FROM public.claim_candidate_dossier_outbox_v5('ordinary-worker',5)"), '0');
      assert.equal(sql("SELECT attempt FROM public.claim_research_deep_job_v1('deep-owner')"), '3');
      assert.equal(claimPublication(3), ids.outbox);
      assert.throws(() => submit(2), /research_deep_job_lease_lost/u);
      assert.equal(sql("SELECT count(*) FROM reserve_research_model_v1('counter_review','independent-2','blocked-while-maker-runs')"),'0');
      assert.equal(sql(`SELECT handoff_research_deep_model_v1('${jobId}','deep-owner',3,'${articleHash}')`),'t');
      assert.equal(sql(`SELECT handoff_research_deep_model_v1('${jobId}','deep-owner',3,'${articleHash}')`),'t');
      assert.throws(()=>sql(`SELECT handoff_research_deep_model_v1('${jobId}','deep-owner',3,'${'f'.repeat(64)}')`),/replay_mismatch/u);
      const modelReservation=sql(`SELECT reservation_id FROM reserve_research_model_v1('counter_review','independent-2',
        'deep-review:${jobId}:3:${articleHash}')`);
      assert.match(modelReservation,/^[a-f0-9-]{36}$/u);
      const reviewed = {revision_id:ids.revision,input_hash:inputHash,article_hash:articleHash,
        author_id:'author',reviewer_id:'independent-2',decision:'accepted',findings:{checked:true},
        source_document_ids:[],reviewed_at:new Date().toISOString()};
      reviewId=sql(`SELECT record_budgeted_deep_review_v1('${jobId}',3,'${modelReservation}','${JSON.stringify(reviewed)}')`);
      assert.equal(sql(`SELECT record_budgeted_deep_review_v1('${jobId}',3,'${modelReservation}','${JSON.stringify(reviewed)}')`),reviewId);
      assert.equal(sql(`SELECT count(*) FROM research_model_completions_v1 WHERE reservation_id='${modelReservation}'`),'1');
      assert.equal(submit(3, 'valid', 'e'.repeat(64)), 'accepted|f');
      assert.equal(sql(`SELECT receipt_id FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ordinaryId}'`), ordinaryReceipt);
      assert.equal(sql("SELECT count(*) FROM public.candidate_research_dossiers WHERE validation_status='valid'"), '2');
      assert.equal(sql(`SELECT status,receipt_id IS NOT NULL FROM public.research_deep_jobs_v1
        WHERE job_id='${jobId}'`), 'completed|t');
      assert.equal(sql(`SELECT record_budgeted_deep_review_v1('${jobId}',3,'${modelReservation}','${JSON.stringify(reviewed)}')`),reviewId);
      assert.throws(()=>sql(`SELECT record_budgeted_deep_review_v1('${jobId}',3,'${modelReservation}',
        '${JSON.stringify({...reviewed, author_id:'changed-author'})}')`),/model_lease_lost/u);
      assert.equal(sql('SELECT count(*) FROM public.candidate_dossier_submission_receipts'), recovery === 'rejected' ? '3' : '2');
      assert.equal(submit(3, 'valid', 'e'.repeat(64)), 'accepted|t');
      assert.throws(() => submit(1), /research_deep_job_lease_lost/u);
      assert.throws(() => submit(2, 'valid', 'f'.repeat(64)), /research_deep_job_lease_lost/u);
      // Reviewed production replay is idempotent and retains immutable receipts.
      for (const filename of [
        '20260929_candidate_dossier_outbox_v6.sql',
        '20260929_research_agent_state_v1.sql',
        '20260929_research_deep_jobs_v1.sql',
      ]) run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port),
        '-d', 'postgres', '-f', path.join(root, 'migrations', filename)]);
      assert.equal(sql(`SELECT status,receipt_id IS NOT NULL FROM public.research_deep_jobs_v1
        WHERE job_id='${jobId}'`), 'completed|t');
      assert.equal(sql('SELECT count(*) FROM public.candidate_dossier_submission_receipts'), recovery === 'rejected' ? '3' : '2');
    } finally {
      if (started) {
        try { run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); }
        catch { /* Preserve the original test result. */ }
      }
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });
