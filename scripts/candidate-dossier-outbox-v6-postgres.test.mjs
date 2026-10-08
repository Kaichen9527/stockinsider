import assert from 'node:assert/strict';
import { execFileSync, spawnSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { collectPipedChild } from './test-support/collect-piped-child.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pgConfig = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
const binaries = pgConfig.status === 0 ? pgConfig.stdout.trim() : '';
const available = Boolean(binaries && fs.existsSync(path.join(binaries, 'initdb'))
  && fs.existsSync(path.join(binaries, 'pg_ctl')) && fs.existsSync(path.join(binaries, 'psql')));
const digest = 'a'.repeat(64);
const submissionDigest = 'b'.repeat(64);
const ids = {
  revision: '11111111-1111-4111-8111-111111111111',
  bundle: '22222222-2222-4222-8222-222222222222',
  job: '33333333-3333-4333-8333-333333333333',
  rejectedJob: '44444444-4444-4444-8444-444444444444',
  staleJob: '55555555-5555-4555-8555-555555555555',
  exhaustedJob: '66666666-6666-4666-8666-666666666666',
};

test('outbox v6 fences stale workers and atomically closes accepted and rejected receipts',
  { skip: !available && 'local PostgreSQL tools unavailable' }, async () => {
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'stockinsider-outbox-v6-'));
    const cluster = path.join(temporary, 'cluster');
    const port = 54000 + process.pid % 10000;
    const run = (binary, args) => execFileSync(path.join(binaries, binary), args, {
      encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
    const sql = (query) => run('psql', ['-X', '-A', '-t', '-v', 'ON_ERROR_STOP=1',
      '-h', temporary, '-p', String(port), '-d', 'postgres', '-c', query]);
    let started = false;
    const runningQueries = new Set();
    try {
      run('initdb', ['-D', cluster, '-A', 'trust', '--no-instructions']);
      run('pg_ctl', ['-D', cluster, '-l', path.join(temporary, 'postgres.log'),
        '-o', `-h '' -k ${temporary} -p ${port}`, '-w', 'start']);
      started = true;
      sql(`CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;
        CREATE TABLE public.candidate_detail_snapshots(id uuid PRIMARY KEY);
        CREATE TABLE public.candidate_dossier_bundles(bundle_id uuid PRIMARY KEY, revision_id uuid,
          published_revision_id uuid, input_hash text);
        CREATE TABLE public.candidate_daily_stage_snapshots(detail_revision_id uuid);
        CREATE TABLE public.candidate_dossier_submission_receipts(
          submission_id uuid PRIMARY KEY DEFAULT gen_random_uuid(), dossier_id uuid DEFAULT gen_random_uuid(),
          revision_id uuid, bundle_id uuid, submission_hash text UNIQUE, status text, rejection_reasons jsonb);`);
      sql(`CREATE FUNCTION public.record_candidate_dossier_submission_v4(
          p_bundle_id uuid,p_revision_id uuid,p_input_hash text,p_submission_hash text,
          p_content jsonb,p_claims jsonb,p_source_references jsonb,p_claim_fact_map jsonb,
          p_validation_status text,p_rejection_reasons jsonb)
        RETURNS TABLE(submission_id uuid,dossier_id uuid,status text,rejection_reasons jsonb,idempotent_replay boolean)
        LANGUAGE plpgsql AS $$ BEGIN
          RETURN QUERY INSERT INTO public.candidate_dossier_submission_receipts
            (revision_id,bundle_id,submission_hash,status,rejection_reasons)
          VALUES (p_revision_id,p_bundle_id,p_submission_hash,
            CASE WHEN p_validation_status='valid' THEN 'accepted' ELSE 'rejected' END,p_rejection_reasons)
          RETURNING candidate_dossier_submission_receipts.submission_id,
            candidate_dossier_submission_receipts.dossier_id,
            candidate_dossier_submission_receipts.status,
            candidate_dossier_submission_receipts.rejection_reasons,FALSE;
        END $$;`);
      sql(`INSERT INTO public.candidate_detail_snapshots VALUES ('${ids.revision}');
        INSERT INTO public.candidate_dossier_bundles VALUES ('${ids.bundle}','${ids.revision}','${ids.revision}','${digest}');
        INSERT INTO public.candidate_daily_stage_snapshots VALUES ('${ids.revision}');`);
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
        '-f', path.join(root, 'migrations/20260907_candidate_dossier_outbox_v5.sql')]);
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
        '-f', path.join(root, 'migrations/20260929_candidate_dossier_outbox_v6.sql')]);
      sql(`CREATE TABLE public.stocks(id uuid PRIMARY KEY);
        CREATE TABLE public.candidate_research_dossiers(id uuid PRIMARY KEY);
        CREATE FUNCTION public.reject_candidate_dossier_revision_mutation_v4()
        RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'immutable_revision'; END $$;`);
      run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-h', temporary, '-p', String(port), '-d', 'postgres',
        '-f', path.join(root, 'migrations/20260929_research_agent_state_v1.sql')]);
      sql(`INSERT INTO public.stocks VALUES ('77777777-7777-4777-8777-777777777777');
        INSERT INTO public.candidate_research_dossiers VALUES ('88888888-8888-4888-8888-888888888888');
        INSERT INTO public.candidate_thesis_qualifications_v1
          (stock_id,detail_revision_id,dossier_id,article_hash,evidence_snapshot_hash,
            review_receipt_hash,status,horizon,payload,qualified_at,next_review_at)
        VALUES ('77777777-7777-4777-8777-777777777777','${ids.revision}',
          '88888888-8888-4888-8888-888888888888','${digest}','${digest}',
          '${'e'.repeat(64)}','qualified','6-18m',
          '{"reviewReceiptHash":"${'e'.repeat(64)}","status":"qualified","articleHash":"${digest}","materialEventIds":[],"qualifiedAt":"2026-09-28T10:00:00Z","nextReviewAt":"2026-10-28T10:00:00Z"}',
          '2026-09-28T10:00:00Z','2026-10-28T10:00:00Z')`);
      assert.throws(() => sql(`UPDATE public.candidate_thesis_qualifications_v1 SET status='rejected'`), /immutable_revision/u);
      const initialThesis = sql('SELECT id FROM public.candidate_thesis_qualifications_v1');
      const appendThesis = (parent, status, hash, reviewedAt, dueAt, events, articleHash = digest) => sql(`
        INSERT INTO public.candidate_thesis_qualifications_v1
          (parent_id,stock_id,detail_revision_id,dossier_id,article_hash,evidence_snapshot_hash,
            review_receipt_hash,status,horizon,payload,qualified_at,next_review_at)
        SELECT ${parent ? `'${parent}'::uuid` : 'NULL'},stock_id,detail_revision_id,dossier_id,'${articleHash}',evidence_snapshot_hash,
          '${hash}','${status}',horizon,
          jsonb_build_object('reviewReceiptHash','${hash}','status','${status}','articleHash','${articleHash}',
            'qualifiedAt','${reviewedAt}','nextReviewAt','${dueAt}','materialEventIds','${JSON.stringify(events)}'::jsonb),
          '${reviewedAt}'::timestamptz,'${dueAt}'::timestamptz
        FROM public.candidate_thesis_qualifications_v1 WHERE id='${initialThesis}' RETURNING id`).split('\n')[0];
      const invalidation = appendThesis(initialThesis, 'invalidated', '1'.repeat(64),
        '2026-09-28T10:00:00Z', '2026-09-29T10:00:00Z', ['denial']);
      assert.throws(() => appendThesis(null, 'qualified', '2'.repeat(64),
        '2026-09-28T10:00:00.000Z', '2026-10-28T10:00:00Z', []), /head_changed/u);
      assert.throws(() => appendThesis(invalidation, 'qualified', '2'.repeat(64),
        '2026-09-28T10:00:00.000Z', '2026-10-28T10:00:00Z', ['denial']), /review_not_newer/u);
      assert.throws(() => appendThesis(invalidation, 'qualified', '2'.repeat(64),
        '2026-09-30T10:00:00Z', '2026-10-30T10:00:00Z', []), /events_not_reconciled/u);
      assert.throws(() => appendThesis(invalidation, 'qualified', '2'.repeat(64),
        '2026-09-30T10:00:00Z', '2026-10-30T10:00:00Z', ['denial']), /revised_article_required/u);
      const revised = appendThesis(invalidation, 'qualified', '2'.repeat(64),
        '2026-09-30T10:00:00Z', '2026-10-30T10:00:00Z', ['denial'], 'b'.repeat(64));
      assert.ok(revised);
      assert.throws(() => appendThesis(invalidation, 'qualified', '3'.repeat(64),
        '2026-09-30T11:00:00Z', '2026-10-30T11:00:00Z', ['denial'], 'c'.repeat(64)), /head_changed/u);
      assert.equal(sql('SELECT count(*) FROM public.candidate_thesis_qualifications_v1'), '3');

      const raceInsert = (receipt, when) => `INSERT INTO public.candidate_thesis_qualifications_v1
        (parent_id,stock_id,detail_revision_id,dossier_id,article_hash,evidence_snapshot_hash,
         review_receipt_hash,status,horizon,payload,qualified_at,next_review_at)
        SELECT '${revised}',stock_id,detail_revision_id,dossier_id,article_hash,evidence_snapshot_hash,
          '${receipt}','qualified',horizon,
          jsonb_build_object('reviewReceiptHash','${receipt}','status','qualified','articleHash',article_hash,
            'qualifiedAt','${when}','nextReviewAt','2026-11-01T00:00:00Z','materialEventIds','["denial"]'::jsonb),
          '${when}'::timestamptz,'2026-11-01T00:00:00Z'::timestamptz
        FROM public.candidate_thesis_qualifications_v1 WHERE id='${revised}';`;
      const asyncSQL = query => {
        const child = spawn(path.join(binaries,'psql'),['-X','-A','-t','-v','ON_ERROR_STOP=1','-h',temporary,'-p',String(port),'-d','postgres','-c',query]);
        const collection = collectPipedChild(child);
        runningQueries.add(collection);
        // Attach rejection handling now, before awaiting the PgSleep barrier.
        return collection.result.then(value => {
          runningQueries.delete(collection); return { value };
        }, error => {
          runningQueries.delete(collection); return { error };
        });
      };
      const first=asyncSQL(`SET application_name='astra-thesis-first'; BEGIN; ${raceInsert('4'.repeat(64),'2026-10-01T10:00:00Z')} SELECT pg_sleep(1.0); COMMIT;`);
      let firstSettled; void first.then(result => { firstSettled=result; });
      const deadline=Date.now()+3000;
      while(sql("SELECT count(*) FROM pg_stat_activity WHERE application_name='astra-thesis-first' AND wait_event='PgSleep'")!=='1'){
        if (firstSettled?.error) throw firstSettled.error;
        if (firstSettled?.value) throw new Error(`first writer ended before held transaction: ${firstSettled.value.err}`);
        assert.ok(Date.now()<deadline,'first writer never reached held transaction');
        await new Promise(r=>setTimeout(r,10));
      }
      const second=asyncSQL(raceInsert('5'.repeat(64),'2026-10-01T11:00:00Z'));
      const [firstResult,secondResult]=await Promise.all([first,second]);
      if (firstResult.error) throw firstResult.error;
      if (secondResult.error) throw secondResult.error;
      const a=firstResult.value,b=secondResult.value;
      assert.equal(a.code,0);assert.notEqual(b.code,0);assert.match(b.err,/research_thesis_head_changed/);
      assert.equal(sql('SELECT count(*) FROM public.candidate_thesis_qualifications_v1'),'4');

      const insertJob = (job, attempts = 0) => sql(`INSERT INTO public.candidate_dossier_outbox_v5
        (job_id,bundle_id,revision_id,input_hash,attempts) VALUES
        ('${job}','${ids.bundle}','${ids.revision}','${digest}',${attempts})`);
      const claim = (owner) => sql(`SELECT job_id FROM public.claim_candidate_dossier_outbox_v5('${owner}',1)`);
      const submit = (job, owner, hash, validation) => sql(`SELECT status,idempotent_replay
        FROM public.record_candidate_dossier_submission_v6(
          '${job}','${owner}','${ids.bundle}','${ids.revision}','${digest}','${hash}',
          '{}'::jsonb,'[]'::jsonb,'[]'::jsonb,'{}'::jsonb,'${validation}',
          ${validation === 'valid' ? "'[]'" : "'[\"reason\"]'"}::jsonb)`);
      insertJob(ids.job);
      assert.equal(claim('owner-one'), ids.job);
      assert.equal(submit(ids.job, 'owner-one', submissionDigest, 'valid'), 'accepted|f');
      assert.equal(submit(ids.job, 'owner-one', submissionDigest, 'valid'), 'accepted|t');
      assert.match(sql(`SELECT status,receipt_id IS NOT NULL FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.job}'`), /^accepted\|t$/u);
      sql(`DELETE FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.job}'`);

      insertJob(ids.rejectedJob);
      assert.equal(claim('owner-two'), ids.rejectedJob);
      assert.equal(submit(ids.rejectedJob, 'owner-two', 'c'.repeat(64), 'rejected'), 'rejected|f');
      assert.match(sql(`SELECT status,receipt_id IS NULL FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.rejectedJob}'`), /^rejected\|t$/u);
      sql(`DELETE FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.rejectedJob}'`);

      insertJob(ids.staleJob);
      assert.equal(claim('old-owner'), ids.staleJob);
      sql(`UPDATE public.candidate_dossier_outbox_v5 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_id='${ids.staleJob}'`);
      assert.equal(claim('new-owner'), ids.staleJob);
      assert.throws(() => submit(ids.staleJob, 'old-owner', 'd'.repeat(64), 'valid'), /candidate_dossier_lease_lost/u);
      assert.equal(sql(`SELECT COUNT(*) FROM public.candidate_dossier_submission_receipts WHERE submission_hash='${'d'.repeat(64)}'`), '0');
      assert.equal(sql(`SELECT public.heartbeat_candidate_dossier_outbox_v6('${ids.staleJob}','new-owner')`), 't');
      sql(`DELETE FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.staleJob}'`);

      insertJob(ids.exhaustedJob, 11);
      assert.equal(claim('last-owner'), ids.exhaustedJob);
      assert.equal(sql(`SELECT attempts FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.exhaustedJob}'`), '12');
      assert.equal(sql(`SELECT public.release_candidate_dossier_outbox_v6('${ids.exhaustedJob}','last-owner',true,'budget exhausted')`), 't');
      assert.equal(sql(`SELECT status FROM public.candidate_dossier_outbox_v5 WHERE job_id='${ids.exhaustedJob}'`), 'failed');
      assert.equal(claim('another-owner'), '');
    } finally {
      for (const collection of runningQueries) collection.cancel();
      if (started) {
        try { run('pg_ctl', ['-D', cluster, '-m', 'immediate', '-w', 'stop']); }
        catch { /* Preserve the failure from the test body when PostgreSQL already stopped. */ }
      }
      fs.rmSync(temporary, { recursive: true, force: true });
    }
  });


test('piped child waits for inherited stderr after the leader exits', { timeout: 5000 }, async () => {
  const grandchild = `process.stderr.on('error',()=>{});setTimeout(()=>{process.stderr.write('late-stderr-marker');},100);setTimeout(()=>process.exit(0),180);`;
  const leader = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(grandchild)}],{stdio:['ignore','ignore',process.stderr],detached:true}).unref();process.exit(3);`;
  const child = spawn(process.execPath, ['-e', leader], { stdio: ['ignore','pipe','pipe'] });
  const { result } = collectPipedChild(child);
  const captured = await result;
  assert.equal(captured.code, 3);
  assert.equal(captured.err, 'late-stderr-marker');
});


test('piped child preserves output and original normal/nonzero/signal exits', async () => {
  for (const code of [0, 7]) {
    const child = spawn(process.execPath, ['-e', `process.stdout.write('out');process.stderr.write('err');process.exitCode=${code};`], { stdio: ['ignore','pipe','pipe'] });
    assert.deepEqual(await collectPipedChild(child).result, { code, signal:null, out:'out', err:'err' });
  }
  const child = spawn(process.execPath, ['-e', `process.kill(process.pid,'SIGTERM')`], { stdio: ['ignore','pipe','pipe'] });
  const result = await collectPipedChild(child).result;
  assert.equal(result.code, null); assert.equal(result.signal, 'SIGTERM');
});

test('piped child explicitly fails spawn and output limits', async () => {
  const missing = spawn(path.join(os.tmpdir(), `missing-stockinsider-executable-${process.pid}`), [], { stdio: ['ignore','pipe','pipe'] });
  await assert.rejects(collectPipedChild(missing).result, { code: 'ENOENT' });
  for (const stream of ['stdout','stderr']) {
    const noisy = spawn(process.execPath, ['-e', `process.${stream}.write('a'.repeat(1025));setInterval(()=>{},1000);`], { stdio: ['ignore','pipe','pipe'] });
    await assert.rejects(collectPipedChild(noisy, { maxBytes:1024 }).result, /piped_child_output_limit/);
  }
});

test('piped child bounds an inherited pipe that remains open after leader exit', { timeout:5000 }, async () => {
  const descendant = `process.stderr.on('error',()=>{});setTimeout(()=>process.exit(0),700);`;
  const leader = `const{spawn}=require('node:child_process');spawn(process.execPath,['-e',${JSON.stringify(descendant)}],{stdio:['ignore','ignore',process.stderr],detached:true}).unref();process.exit(4);`;
  const child = spawn(process.execPath, ['-e',leader], { stdio:['ignore','pipe','pipe'] });
  let kills=0; const kill=child.kill.bind(child); child.kill=(...args)=>{kills++;return kill(...args);};
  await assert.rejects(collectPipedChild(child,{timeoutMs:200}).result,/piped_child_deadline/);
  assert.equal(child.exitCode,4); assert.equal(kills,0);
  assert.equal(child.stderr.destroyed,true); assert.equal(child.stdout.destroyed,true);
});

function fakePipedChild() {
  const child=new EventEmitter(); child.stdout=new PassThrough(); child.stderr=new PassThrough();
  child.exitCode=null; child.signalCode=null; child.kills=0; child.kill=()=>{child.kills++;return true;};
  return child;
}

test('piped child rejects late close despite a delayed timer, and settles once', async () => {
  const child=fakePipedChild(); let clock=100, callback, clears=0;
  const collection=collectPipedChild(child,{timeoutMs:100,now:()=>clock,setTimer:f=>{callback=f;return 1;},clearTimer:()=>{clears++;}});
  const rejected=assert.rejects(collection.result,/piped_child_deadline/);
  child.emit('exit',0,null); clock=200; child.emit('close',0,null);
  callback(); child.emit('error',new Error('late error')); child.stdout.emit('error',new Error('late stream error'));
  await rejected; assert.equal(child.kills,0); assert.equal(clears,1);
});

test('piped child captures post-exit data, clears timer, and rejects stream errors/cancel', async () => {
  const child=fakePipedChild(); let callback, clears=0;
  const collection=collectPipedChild(child,{setTimer:f=>{callback=f;return 1;},clearTimer:()=>{clears++;}});
  child.emit('exit',3,null); child.stderr.write('late'); child.emit('close',3,null); callback();
  assert.deepEqual(await collection.result,{code:3,signal:null,out:'',err:'late'}); assert.equal(clears,1); assert.equal(child.kills,0);
  for (const kind of ['stream','cancel']) {
    const broken=fakePipedChild(); const attempt=collectPipedChild(broken);
    const rejected=assert.rejects(attempt.result,kind==='stream'?/broken stream/:/piped_child_cancelled/);
    if(kind==='stream') broken.stderr.emit('error',new Error('broken stream')); else attempt.cancel();
    await rejected; assert.equal(broken.kills,1); assert.equal(broken.stderr.destroyed,true);
    broken.emit('close',0,null); broken.emit('error',new Error('late'));
  }
});
