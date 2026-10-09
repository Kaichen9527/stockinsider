import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAuthorAssignmentFixture } from './research-author-assignment-fixture.sql.mjs';
import { completeMaterial } from '../web/src/lib/research-complete-input.ts';
import { runResearchAuthorPacket } from '../web/src/lib/research-author-packet.ts';
import { runResearchReviewerAssignment } from '../web/src/lib/research-reviewer-assignment.ts';
import { resolveConfiguredResearchControllerPrincipals } from '../web/src/lib/research-execution-binding.ts';
import { runResearchAuthorHandoff } from '../web/src/lib/research-author-handoff.ts';
import { runResearchAuthorResult } from '../web/src/lib/research-author-result.ts';
import { resolveResearchControllerIdentity } from '../web/src/lib/research-execution-binding.ts';
import { authorResultFixture } from './research-author-result-fixture.mjs';
import { completeCanonical, completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { FinancialDeadline } from '../web/src/lib/research-financial-file-reader.ts';
import {runResearchReviewerResult} from '../web/src/lib/research-reviewer-result.ts';
import {syntheticReviewerEnvelope,canonicalSizedEditorialReview} from './research-reviewer-result-fixture.mjs';
import {validateResearchEditorialReview} from '../web/src/lib/research-editorial-review.ts';
import mapping from '../web/src/lib/research-complete-mapping.json' with { type: 'json' };

const bin = process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || (() => {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
})();
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
test('reviewer result: real original reservation budget/claim/fences, synthetic source and actual AUO calculation', async t => {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required, not skipped');
  const tmp = fs.mkdtempSync('/tmp/si-rresult-'), pg = path.join(tmp, 'pg'), port = 55000 + process.pid % 5000;
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', tmp, '-p', String(port), '-d', 'postgres'];
  let active = false, passed = false, childFailed = false;
  const check=(name,fn)=>t.test(name,async ctx=>{try{await fn(ctx);}catch(error){childFailed=true;throw error;}});
  const run = (name, argv, input) => execFileSync(path.join(bin, name), argv, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1048576 }).trim();
  const sql = s => run('psql', args, "SET statement_timeout='5s';" + s);
  const start = () => { run('pg_ctl', ['-D', pg, '-l', path.join(tmp, 'pg.log'), '-o', `-h '' -k ${tmp} -p ${port}`, '-w', 'start']); active = true; };
  const rpc = (name, values) => `SET ROLE service_role;SELECT ${name}(${values.map(v => q(typeof v === 'object' ? JSON.stringify(v) : v)).join(',')});`;
  const db = { rpc(name, a) {
    const response = promisify(execFile)(path.join(bin, 'psql'), [...args, '-c', rpc(name, Object.values(a))],
      { encoding: 'utf8', timeout: 6000, maxBuffer: 1048576 }).then(({ stdout }) => ({ data: JSON.parse(stdout.trim() || 'null'), error: null }));
    return Object.assign(response, { abortSignal: () => response });
  } };
  try {
    run('initdb', ['-D', pg, '-A', 'trust', '--no-instructions']); start();
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE source_raw_documents(id uuid PRIMARY KEY,document_url text NOT NULL,published_at timestamptz,collected_at timestamptz NOT NULL,metadata jsonb NOT NULL,
        title text,summary text,platform text,symbols jsonb,content_text text);
      GRANT ALL ON source_raw_documents TO service_role;`);
    sql(fs.readFileSync('migrations/20261009_research_publication_source_fence_v2.sql', 'utf8'));
    const ids = { job: randomUUID(), reservation: randomUUID(), company: randomUUID(), priority: randomUUID(), snapshot: 'a'.repeat(64), owner: 'synthetic-private-packet-owner' };
    createAuthorAssignmentFixture(sql, { q, ...ids });
    sql(`CREATE ROLE research_observed_rpc_owner NOLOGIN NOINHERIT NOBYPASSRLS;
      ALTER TABLE stocks ADD COLUMN market text DEFAULT 'TW';
      ALTER TABLE research_model_completions_v1 ADD PRIMARY KEY(reservation_id);
      ALTER TABLE research_model_completions_v1 ADD COLUMN owner text,ADD COLUMN outcome text,ADD COLUMN result_hash text,ADD COLUMN finished_at timestamptz DEFAULT clock_timestamp();
      ALTER TABLE research_model_reservations_v1 ADD COLUMN reserved_seconds integer NOT NULL DEFAULT 1800;
      CREATE TABLE research_deep_admission_charges_v1(job_id uuid,issuer_key text);
      GRANT USAGE ON SCHEMA public TO research_observed_rpc_owner;
      GRANT SELECT ON research_deep_jobs_v1,research_priority_runs_v1,research_observed_priority_store_receipts_v1,research_observed_roster_snapshots_v1,research_observed_roster_members_v1,research_deep_admission_charges_v1,stocks,research_deep_job_attempts_v1,research_model_reservations_v1,research_model_completions_v1 TO research_observed_rpc_owner;
      GRANT INSERT ON research_model_completions_v1 TO research_observed_rpc_owner;
      REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON research_model_completions_v1 FROM service_role;
      ALTER TABLE research_model_completions_v1 ENABLE ROW LEVEL SECURITY;
      CREATE POLICY observed_completion_rpc ON research_model_completions_v1 TO research_observed_rpc_owner USING(true) WITH CHECK(true);`);
    const observedSQL=fs.readFileSync('migrations/20261008_research_observed_claim_v2.sql','utf8');
    sql(observedSQL.slice(observedSQL.indexOf('CREATE FUNCTION public.read_research_observed_claim_v2'),observedSQL.indexOf('CREATE FUNCTION public.claim_research_observed_job_v2')));
    sql(`ALTER FUNCTION read_research_observed_claim_v2(text,text,uuid,integer) OWNER TO research_observed_rpc_owner;
      REVOKE ALL ON FUNCTION read_research_observed_claim_v2(text,text,uuid,integer) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION read_research_observed_claim_v2(text,text,uuid,integer) TO service_role;`);
    sql(observedSQL.slice(observedSQL.indexOf('CREATE FUNCTION public.fence_observed_model_completion_v2'),observedSQL.indexOf('REVOKE ALL ON FUNCTION public.handoff_research_deep_model_v1')));
    sql("UPDATE research_observed_companies_v1 SET symbol='2409';UPDATE research_observed_roster_members_v1 SET symbol='2409';UPDATE research_deep_jobs_v1 SET symbol='2409';");
    // Synthetic fixture must obey the original claim chronology exactly, before any preparation.
    sql(`UPDATE research_deep_jobs_v1 j SET lease_expires_at=r.lease_expires_at FROM research_model_reservations_v1 r WHERE r.work_key='deep:'||j.job_id||':1';
      UPDATE research_deep_job_attempts_v1 a SET claimed_at=r.started_at,lease_expires_at=r.lease_expires_at FROM research_model_reservations_v1 r WHERE r.work_key='deep:'||a.job_id||':1';`);
    const roster = fs.readFileSync('migrations/20261008_research_observed_roster_v1.sql', 'utf8');
    sql(roster.slice(roster.indexOf('CREATE FUNCTION public.research_observed_canonical_json_v1'), roster.indexOf('-- Fail closed beyond PostgreSQL')));
    for (const name of ['research_input_preparations', 'research_input_preparation_assert', 'research_complete_input', 'research_author_assignments', 'research_author_packet', 'research_author_results', 'research_author_handoffs', 'research_reviewer_assignments'])
      sql(fs.readFileSync(`migrations/20261009_${name}_v2.sql`, 'utf8'));
    // Install original reservation/completion functions over the explicit upstream
    // fixture. Synthetic initial rows are not claimed as production admission.
    sql(`ALTER TABLE research_model_reservations_v1 ALTER COLUMN reservation_id SET DEFAULT gen_random_uuid();
      ALTER TABLE research_model_reservations_v1 ADD COLUMN taipei_day date NOT NULL DEFAULT ((clock_timestamp() AT TIME ZONE 'Asia/Taipei')::date);
      ALTER TABLE research_model_reservations_v1 ADD UNIQUE(role,work_key);`);
    const budgetSQL=fs.readFileSync('migrations/20260929_research_agent_state_v1.sql','utf8');
    sql(budgetSQL.slice(budgetSQL.indexOf('CREATE OR REPLACE FUNCTION public.research_model_lease_fits_day_v1'),budgetSQL.indexOf('ALTER TABLE public.research_model_reservations_v1 ENABLE ROW LEVEL SECURITY')));
    sql(`REVOKE ALL ON FUNCTION reserve_research_model_v1(text,text,text),finish_research_model_v1(uuid,text,text,text) FROM PUBLIC,anon,authenticated;
      GRANT EXECUTE ON FUNCTION reserve_research_model_v1(text,text,text),finish_research_model_v1(uuid,text,text,text) TO service_role;
      GRANT EXECUTE ON FUNCTION reserve_research_model_v1(text,text,text) TO research_observed_rpc_owner;`);
    const previous={INTERNAL_API_KEY:process.env.INTERNAL_API_KEY,RESEARCH_REVIEW_KEY:process.env.RESEARCH_REVIEW_KEY,CRON_SECRET:process.env.CRON_SECRET,RESEARCH_TEST_KEY:process.env.RESEARCH_TEST_KEY,STRATEGY_APPROVAL_KEY:process.env.STRATEGY_APPROVAL_KEY};
    process.env.INTERNAL_API_KEY='synthetic-result-writer';process.env.RESEARCH_REVIEW_KEY='synthetic-result-reviewer';for(const key of ['CRON_SECRET','RESEARCH_TEST_KEY','STRATEGY_APPROVAL_KEY'])delete process.env[key];
    t.after(()=>{for(const [key,value]of Object.entries(previous)){if(value===undefined)delete process.env[key];else process.env[key]=value;}});
    const httpRequest=new Request('http://localhost/fixture',{headers:{authorization:'Bearer synthetic-result-writer'}});
    const principal=resolveResearchControllerIdentity(httpRequest,'author').principalId;
    const make = async (changes = {}, assign = true) => {
      const job = randomUUID(), reservation = randomUUID(), source = randomUUID(), url = `https://example.com/synthetic-packet-${source}`;
      const metadata = { canonical_url: url, rights_boundary: 'public_citation', visibility: 'public', subject_scope: 'company_mentions',
        claim_status: 'rumor', first_observed_at: new Date(Date.now() - 5000).toISOString(), catalyst: 'Unconfirmed validation possibility.', risk: 'A competitor may win.', ...changes.metadata };
      sql(`INSERT INTO research_deep_jobs_v1 SELECT ${q(job)},priority_run_id,symbol,stock_id,research_scope,research_company_id,observed_snapshot_hash,status,attempts,lease_owner,lease_expires_at FROM research_deep_jobs_v1 WHERE job_id=${q(ids.job)};
        INSERT INTO research_deep_job_attempts_v1 SELECT ${q(job)},attempt,owner,claimed_at,lease_expires_at FROM research_deep_job_attempts_v1 WHERE job_id=${q(ids.job)};
        INSERT INTO research_model_reservations_v1(reservation_id,role,owner,work_key,started_at,lease_expires_at) SELECT ${q(reservation)},role,owner,${q('deep:' + job + ':1')},started_at,lease_expires_at FROM research_model_reservations_v1 WHERE reservation_id=${q(ids.reservation)};
        SET ROLE service_role;INSERT INTO source_raw_documents VALUES(${q(source)},${q(url)},${q(changes.publishedAt || new Date(Date.now() - 86400000).toISOString())},clock_timestamp()-interval '1 second',${q(JSON.stringify(metadata))},
          ${q(changes.title || 'Synthetic source')},${q(changes.summary || 'Public summary only; not a real catalyst.')},'ptt',${q(JSON.stringify(changes.symbols || ['2409']))},'UNIQUE_PRIVATE_FULLTEXT_SENTINEL');`);
      sql(`INSERT INTO research_deep_admission_charges_v1 VALUES(${q(job)},'TW:2409');`);
      const old = { owner: ids.owner, jobId: job, attempt: 1, reservationId: reservation, bundleId: null, sourceDocumentIds: [source], scope: 'research_observed_v1', snapshotHash: ids.snapshot };
      const prep = JSON.parse(sql(rpc('prepare_research_input_v2', [old])));
      const input = { owner: ids.owner, jobId: job, attempt: 1, reservationId: reservation, scope: old.scope, snapshotHash: ids.snapshot,
        preparationId: prep.preparation_id, preparationHash: prep.input_hash,
        expectedArtifactManifestHash: mapping.companies['2409'].inventoryHash, expectedCalculatorExecutionHash: mapping.sourceClosureHash };
      const material = await completeMaterial(db, input, prep, new FinancialDeadline(), process.cwd());
      const revision = JSON.parse(sql(rpc('seal_research_article_input_revision_v2', [input, material])));
      const binding = [input, revision.revision_id, revision.input_hash, principal];
      if (assign) sql(rpc('assign_research_author_v2', binding));
      return { input, inputRevisionId: revision.revision_id, inputHash: revision.input_hash, binding, source, revision };
    };
    const prepare=async(invocation)=>{const f=await make();const p=await runResearchAuthorPacket(db,f,principal,new FinancialDeadline());return {...f,...authorResultFixture(f,f.revision,p.packet,invocation)};};
    const receive=f=>runResearchAuthorResult(db,f.request,principal,httpRequest,new FinancialDeadline());
    const read=f=>runResearchAuthorResult(db,{...f.request,action:'readAuthorResult'},principal,httpRequest,new FinancialDeadline());
    const f=await prepare(),saved=(await receive(f)).result;
    const pair=resolveConfiguredResearchControllerPrincipals(),reviewRequest={action:'assignReviewer',input:f.input,inputRevisionId:f.inputRevisionId,inputHash:f.inputHash,resultId:saved.result_id,resultHash:saved.result_hash};
    const args=[f.input,f.inputRevisionId,f.inputHash,principal,pair.reviewerPrincipalId,saved.result_id,saved.result_hash];
    await runResearchAuthorHandoff(db,{...reviewRequest,action:'handoffAuthorResult'},principal,new FinancialDeadline());
    sql(`SET ROLE research_observed_rpc_owner;INSERT INTO research_model_completions_v1(reservation_id,owner,outcome,result_hash) VALUES(${q(ids.reservation)},${q(ids.owner)},'failed',${q('f'.repeat(64))});`);
    const assignment=(await runResearchReviewerAssignment(db,reviewRequest,principal,pair.reviewerPrincipalId,new FinancialDeadline())).assignment;
    assert.ok(assignment);
    const packet=(await runResearchReviewerAssignment(db,{...reviewRequest,action:'readReviewerPacket'},principal,pair.reviewerPrincipalId,new FinancialDeadline())).packet;
    // Install registry only after an actual accepted synthetic author result, so
    // migration acceptance checks the locked backfill instead of an empty table.
    sql(fs.readFileSync('migrations/20261009_research_reviewer_results_v2.sql','utf8'));
    const result=syntheticReviewerEnvelope(reviewRequest,{reviewerAssignment:assignment},packet);
    result.request.review=canonicalSizedEditorialReview(result.request.review);result.envelope.rawReview=result.request.review;result.envelope.validatedReview=validateResearchEditorialReview(packet,result.request.review,new Date().toISOString());result.request.observation.outputHash=completeHash(result.request.review);
    const reviewerHTTP=new Request('http://localhost/synthetic',{headers:{authorization:'Bearer synthetic-result-reviewer'}});
    const role=(request=result.request)=>runResearchReviewerResult(db,request,principal,pair.reviewerPrincipalId,reviewerHTTP,new FinancialDeadline());
    const direct=envelope=>sql(rpc('receive_research_reviewer_result_v2',[...args,envelope]));
    const audit=()=>sql(`SELECT jsonb_build_object('reviews',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY result_id),'[]') FROM research_reviewer_results_v2 x),
      'invocations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY invocation_id),'[]') FROM research_execution_invocations_v2 x),
      'completions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_completions_v1 x),
      'models',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_reservations_v1 x),
      'authors',(SELECT jsonb_agg(to_jsonb(x) ORDER BY result_id) FROM research_author_results_v2 x),
      'jobs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY job_id) FROM research_deep_jobs_v1 x));`);
    await check('existing exact author invocation backfilled, null review read without writes',async()=>{
      const before=audit();assert.equal(sql(`SELECT count(*) FROM research_execution_invocations_v2 WHERE role='author' AND result_id=${q(saved.result_id)} AND invocation_id=${q(f.envelope.observation.invocationId)} AND payload_hash=${q(saved.result_hash)}`),'1');assert.equal((await role({...result.request,action:'readReviewerResult'})).result,null);assert.equal(audit(),before);
    });
    await check('same thread/invocation, before-author and changed packet denied without writes',async()=>{
      for(const mutate of [r=>r.observation.threadId=f.envelope.observation.threadId,r=>r.observation.invocationId=f.envelope.observation.invocationId,r=>r.observation.controllerObservedStartAt='2026-01-01T00:00:00Z',r=>r.review.reviewPackHash='f'.repeat(64)]){const bad=structuredClone(result.request);mutate(bad);const before=audit();await assert.rejects(role(bad));assert.equal(audit(),before);}
    });
    await check('registry blocks different existing author invocation before first review commit',()=>{
      // A distinct author registry entry with same real trigger contract is an
      // explicit synthetic existing-history fixture; it is not a new model run.
      const other='synthetic-history-'+randomUUID();sql(`SET ROLE research_input_preparation_owner_v2;INSERT INTO research_execution_invocations_v2 VALUES(${q(other)},'author',gen_random_uuid(),${q('f'.repeat(64))});`);
      const bad=structuredClone(result.envelope);bad.observation.invocationId=other;const before=audit();assert.throws(()=>direct(bad),/duplicate key/);assert.equal(audit(),before);
    });
    await check('shared canonical65536 bytes exact in TS and PG, +1 actual RPC refuses with zero rows',()=>{
      assert.equal(Buffer.byteLength(completeCanonical(result.envelope.rawReview)),65536);assert.equal(sql(`SELECT octet_length(convert_to(research_complete_canonical_v2(${q(JSON.stringify(result.envelope.rawReview))}::jsonb),'UTF8'));`),'65536');
      const bad=structuredClone(result.envelope);bad.rawReview.strongestCounterEvidence+='a';bad.validatedReview.review=bad.rawReview;bad.validatedReview.reviewHash=completeHash(bad.rawReview);bad.observation.outputHash=completeHash(bad.rawReview);assert.equal(Buffer.byteLength(completeCanonical(bad.rawReview)),65537);const before=audit();assert.throws(()=>direct(bad),/research_reviewer_result_review_binding/);assert.equal(audit(),before);
    });
    await check('direct RPC closed nested fields refuse array/object coercion before result/registry/completion',()=>{
      for(const mutate of [r=>r.findings[0].paragraphId=['summary'],r=>r.checks[0].status=['concern'],r=>r.findings[0].severity=['major'],r=>r.decision={},r=>r.checks[0].status=null]){const bad=structuredClone(result.envelope);mutate(bad.rawReview);bad.validatedReview.review=bad.rawReview;bad.validatedReview.reviewHash=completeHash(bad.rawReview);bad.observation.outputHash=completeHash(bad.rawReview);const before=audit();assert.throws(()=>direct(bad),/research_editorial_review_/);assert.equal(audit(),before);}
    });
    await check('injected completion failure rolls back result and invocation together',()=>{
      sql(`CREATE FUNCTION fixture_review_completion_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN IF NEW.reservation_id=${q(assignment.reservation_id)}::uuid THEN RAISE EXCEPTION 'synthetic_completion_insert_abort';END IF;RETURN NEW;END$$;
        CREATE TRIGGER fixture_review_completion_abort BEFORE INSERT ON research_model_completions_v1 FOR EACH ROW EXECUTE FUNCTION fixture_review_completion_abort();`);
      const before=audit();assert.throws(()=>direct(result.envelope),/synthetic_completion_insert_abort/);assert.equal(audit(),before);sql('DROP TRIGGER fixture_review_completion_abort ON research_model_completions_v1;DROP FUNCTION fixture_review_completion_abort();');
    });
    let accepted;
    await check('concurrent exact receive commits one result, one invocation and one original completion',async()=>{
      const before=JSON.parse(audit()),params={p_request:f.input,p_revision_id:f.inputRevisionId,p_input_hash:f.inputHash,p_author_principal:principal,p_reviewer_principal:pair.reviewerPrincipalId,p_result_id:saved.result_id,p_result_hash:saved.result_hash,p_result:result.envelope};
      const responses=await Promise.all([db.rpc('receive_research_reviewer_result_v2',params),db.rpc('receive_research_reviewer_result_v2',params)]);assert.deepEqual(responses[0].data,responses[1].data);accepted=responses[0].data;
      const after=JSON.parse(audit());assert.equal(after.reviews.length,1);assert.equal(after.invocations.length,before.invocations.length+1);assert.equal(after.completions.length,before.completions.length+1);assert.deepEqual(after.models,before.models);assert.deepEqual(after.authors,before.authors);assert.deepEqual(after.jobs,before.jobs);
    });
    await check('real calculation packet revalidation, exact read/replay/restart and active reader rejection',async()=>{
      const before=audit();assert.deepEqual((await role()).result,accepted);assert.deepEqual((await role({...result.request,action:'readReviewerResult'})).result,accepted);
      await assert.rejects(runResearchReviewerAssignment(db,{...reviewRequest,action:'readReviewerPacket'},principal,pair.reviewerPrincipalId,new FinancialDeadline()));
      run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();assert.deepEqual((await role({...result.request,action:'readReviewerResult'})).result,accepted);assert.equal(audit(),before);
    });
    await check('changed review/packet/replay reject with original accepted bytes',async()=>{
      for(const mutate of [x=>x.review.strongestCounterEvidence+='changed',x=>x.observation.invocationId+='changed']){const bad=structuredClone(result.request);mutate(bad);const before=audit();await assert.rejects(role(bad));assert.equal(audit(),before);}
      const bad=structuredClone(result.envelope);bad.packet.articleHash='f'.repeat(64);const before=audit();assert.throws(()=>direct(bad));assert.equal(audit(),before);
    });
    await check('reviewer invocation cannot become later author invocation (opposite insertion order)',async()=>{
      // New upstream job is explicitly synthetic; receiver and registry are real.
      const g=await prepare(result.envelope.observation.invocationId),before=audit();await assert.rejects(receive(g),/duplicate key/);assert.equal(audit(),before);
      g.request.observation.invocationId='synthetic-new-author-'+randomUUID();const fresh=await receive(g);assert.ok(fresh.result.result_id);assert.equal(sql(`SELECT count(*) FROM research_execution_invocations_v2 WHERE invocation_id=${q(g.request.observation.invocationId)} AND role='author' AND result_id=${q(fresh.result.result_id)}`),'1');
    });
    await check('source withdrawal, takeover, expired reservation and conflicting completion reject; histories retained',()=>{
      for(const change of [`UPDATE source_raw_documents SET metadata=metadata||'{"withdrawn":true}'::jsonb WHERE id=${q(f.source)}`,`UPDATE research_deep_jobs_v1 SET lease_owner='synthetic-takeover' WHERE job_id=${q(f.input.jobId)}`,`UPDATE research_model_reservations_v1 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE reservation_id=${q(assignment.reservation_id)}`,`UPDATE research_model_completions_v1 SET result_hash=${q('f'.repeat(64))} WHERE reservation_id=${q(assignment.reservation_id)}`]){const before=audit();assert.throws(()=>sql('BEGIN;'+change+';'+rpc('read_research_reviewer_result_context_v2',args)));assert.equal(audit(),before);}
    });
    await check('author/reviewer credential rotation after completion cannot read or replay stored report',async()=>{
      for(const config of [{INTERNAL_API_KEY:'synthetic-new-B',RESEARCH_REVIEW_KEY:process.env.RESEARCH_REVIEW_KEY},{INTERNAL_API_KEY:process.env.RESEARCH_REVIEW_KEY,RESEARCH_REVIEW_KEY:process.env.INTERNAL_API_KEY},{INTERNAL_API_KEY:process.env.INTERNAL_API_KEY,RESEARCH_REVIEW_KEY:'synthetic-new-S'}]){
        const rotated=resolveConfiguredResearchControllerPrincipals(config),before=audit();for(const action of ['readReviewerResult','receiveReviewerResult'])await assert.rejects(runResearchReviewerResult(db,{...result.request,action},rotated.authorPrincipalId,rotated.reviewerPrincipalId,reviewerHTTP,new FinancialDeadline()));assert.equal(audit(),before);
      }
    });
    await check('private registry/results deny service direct access and owner mutation',()=>{
      const before=audit();for(const table of ['research_execution_invocations_v2','research_reviewer_results_v2']){
        for(const statement of [`SELECT * FROM ${table}`,`UPDATE ${table} SET result_id=result_id`,`DELETE FROM ${table}`,`TRUNCATE ${table}`])assert.throws(()=>sql('SET ROLE service_role;'+statement),/permission denied/);
        const owner=table==='research_execution_invocations_v2'?'research_input_preparation_owner_v2':'research_observed_rpc_owner';for(const statement of [`UPDATE ${table} SET result_id=result_id`,`DELETE FROM ${table}`,`TRUNCATE ${table}`])assert.throws(()=>sql('SET ROLE '+owner+';'+statement),/immutable_source_receipt/);
      }assert.equal(audit(),before);
    });
    passed=!childFailed;
  }finally{if(active)try{run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);}catch{}if(passed)fs.rmSync(tmp,{recursive:true,force:true});else t.diagnostic('Failure evidence retained at '+tmp);}
});
