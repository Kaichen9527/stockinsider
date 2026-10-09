import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { reviewerResultSqlStdin } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/scripts/research-reviewer-result-psql-transport.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createAuthorAssignmentFixture } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/scripts/research-author-assignment-fixture.sql.mjs';
import { completeMaterial } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-complete-input.ts';
import { runResearchAuthorPacket } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-author-packet.ts';
import { runResearchReviewerAssignment } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-reviewer-assignment.ts';
import { resolveConfiguredResearchControllerPrincipals } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-execution-binding.ts';
import { runResearchAuthorHandoff } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-author-handoff.ts';
import { runResearchAuthorResult } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-author-result.ts';
import { resolveResearchControllerIdentity } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-execution-binding.ts';
import { authorResultFixture } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/scripts/research-author-result-fixture.mjs';
import { completeCanonical, completeHash } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-complete-canonical.ts';
import { FinancialDeadline } from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-financial-file-reader.ts';
import {runResearchReviewerResult} from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-reviewer-result.ts';
import {syntheticReviewerEnvelope,canonicalSizedEditorialReview} from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/scripts/research-reviewer-result-fixture.mjs';
import {validateResearchEditorialReview} from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-editorial-review.ts';
import {validateBusinessResearchArticle} from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-business-article.ts';
import {runResearchPublication,researchPublicationContent} from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-atomic-publication.ts';
import mapping from 'file:///Users/kaerchen/.cache/stockinsider-workspaces/research-author-result-oct09/web/src/lib/research-complete-mapping.json' with { type: 'json' };

const bin = process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || (() => {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
})();
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
async function publicationFixture(t,scenario='positive') {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required, not skipped');
  const tmp = fs.mkdtempSync('/tmp/si-rresult-'), pg = path.join(tmp, 'pg'), port = 55000 + process.pid % 5000;
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', tmp, '-p', String(port), '-d', 'postgres'];
  let active = false, passed = false, childFailed = false;
  const check=async(name,fn)=>{await t.test(name,async ctx=>{try{await fn(ctx);}catch(error){childFailed=true;throw error;}});if(childFailed)throw Error('dependent_publication_case_stopped');};
  const run = (name, argv, input) => execFileSync(path.join(bin, name), argv, { input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1048576 }).trim();
  const sql = s => run('psql', args, "SET statement_timeout='5s';" + s);
  const start = () => { run('pg_ctl', ['-D', pg, '-l', path.join(tmp, 'pg.log'), '-o', `-h '' -k ${tmp} -p ${port}`, '-w', 'start']); active = true; };
  const rpc = (name, values) => `SET ROLE service_role;SELECT ${name}(${values.map(v => q(typeof v === 'object' ? JSON.stringify(v) : v)).join(',')});`;
  const db = { rpc(name, a) {
    const response = reviewerResultSqlStdin(path.join(bin, 'psql'), args, rpc(name, Object.values(a)),
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
    if(scenario==='expires-waiting') sql("UPDATE research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()+interval '7 seconds';UPDATE research_model_reservations_v1 SET lease_expires_at=(SELECT lease_expires_at FROM research_deep_jobs_v1 LIMIT 1);UPDATE research_deep_job_attempts_v1 SET lease_expires_at=(SELECT lease_expires_at FROM research_deep_jobs_v1 LIMIT 1);");
    const f=await prepare();
    if(scenario==='paid-content') {
      f.request.article.summary.text+=' 定錨會員';
      f.envelope.validatedArticle=validateBusinessResearchArticle({request:f.input,revision:f.revision,sources:f.envelope.validatedArticle.sources,now:new Date().toISOString()},f.request.article);
      f.request.observation.articleHash=f.envelope.validatedArticle.articleHash;f.request.observation.outputHash=completeHash(f.request.article);
    }
    const saved=(await receive(f)).result;
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
    if(scenario==='unaccepted-review') {result.request.review.decision='revision_required';result.request.review.checks[0].status='concern';}
    result.request.review=canonicalSizedEditorialReview(result.request.review);result.envelope.rawReview=result.request.review;result.envelope.validatedReview=validateResearchEditorialReview(packet,result.request.review,new Date().toISOString());result.request.observation.outputHash=completeHash(result.request.review);
    const reviewerHTTP=new Request('http://localhost/synthetic',{headers:{authorization:'Bearer synthetic-result-reviewer'}});
    const role=(request=result.request)=>runResearchReviewerResult(db,request,principal,pair.reviewerPrincipalId,reviewerHTTP,new FinancialDeadline());
    const direct=envelope=>sql(rpc('receive_research_reviewer_result_v2',[...args,envelope]));
    const accepted=(await role()).result;
    // Minimal explicit legacy upstream tables; original bundle, outbox and
    // append-only/paid-content SQL are installed unmodified below.
    sql(`CREATE TABLE candidate_detail_snapshots(id uuid PRIMARY KEY,stock_id uuid REFERENCES stocks(id),session_date date,model_version text);
      CREATE TABLE candidate_daily_stage_snapshots(detail_revision_id uuid);
      CREATE TABLE candidate_research_dossiers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),detail_snapshot_id uuid NOT NULL REFERENCES candidate_detail_snapshots(id),narrative_kind text NOT NULL CHECK(narrative_kind IN('deterministic_fact','codex_enriched')),content jsonb NOT NULL,claim_fact_map jsonb NOT NULL DEFAULT '{}',validation_status text NOT NULL CHECK(validation_status IN('valid','rejected')),rejection_reasons jsonb NOT NULL DEFAULT '[]',created_at timestamptz NOT NULL DEFAULT now());`);
    for(const name of ['20260906_candidate_dossier_v4.sql','20260907_candidate_dossier_outbox_v5.sql','20260929_candidate_dossier_outbox_v6.sql']) sql(fs.readFileSync('migrations/'+name,'utf8'));
    sql(`ALTER TABLE research_deep_jobs_v1 ADD COLUMN receipt_id uuid REFERENCES candidate_dossier_submission_receipts(submission_id),
      ADD COLUMN completion_owner text,ADD COLUMN completion_outbox_owner text,ADD COLUMN completion_outbox_job_id uuid,
      ADD COLUMN completion_review_id uuid,ADD COLUMN completion_article_hash text,ADD COLUMN completion_submission_hash text,
      ADD COLUMN terminal_reason text,ADD COLUMN finished_at timestamptz;
      ALTER TABLE candidate_dossier_outbox_v5 ADD COLUMN deep_job_id uuid REFERENCES research_deep_jobs_v1(job_id),ADD COLUMN deep_attempt integer;`);
    for(const name of ['20261009_research_publication_lineage_v2.sql','20261010_research_atomic_publication_v2.sql']) sql(fs.readFileSync('migrations/'+name,'utf8'));
    sql('GRANT ALL ON candidate_research_dossiers,research_deep_jobs_v1 TO service_role;ALTER TABLE candidate_research_dossiers ENABLE ROW LEVEL SECURITY;');
    const request={action:'publishResearchArticle',input:f.input,inputRevisionId:f.inputRevisionId,inputHash:f.inputHash,
      authorResultId:saved.result_id,authorResultHash:saved.result_hash,reviewerResultId:accepted.result_id,reviewerResultHash:accepted.result_hash};
    const pubArgs={p_request:f.input,p_revision_id:f.inputRevisionId,p_input_hash:f.inputHash,p_author_principal:principal,p_reviewer_principal:pair.reviewerPrincipalId,
      p_author_result_id:saved.result_id,p_author_result_hash:saved.result_hash,p_reviewer_result_id:accepted.result_id,p_reviewer_result_hash:accepted.result_hash,
      p_content_hash:completeHash(researchPublicationContent(saved.payload))};
    const audit=()=>sql(`SELECT jsonb_build_object('bundles',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY bundle_id),'[]') FROM candidate_dossier_bundles x),
      'outbox',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY job_id),'[]') FROM candidate_dossier_outbox_v5 x),
      'dossiers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM candidate_research_dossiers x),
      'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY submission_id),'[]') FROM candidate_dossier_submission_receipts x),
      'jobs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY job_id) FROM research_deep_jobs_v1 x),
      'models',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_reservations_v1 x),
      'completions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_completions_v1 x),
      'sources',(SELECT jsonb_agg(to_jsonb(x) ORDER BY id) FROM source_raw_documents x),
      'inputs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY revision_id) FROM research_article_input_revisions_v2 x));`);
    const wait=async(name,event)=>{const until=performance.now()+5000;while(performance.now()<until){if(sql(`SELECT count(*) FROM pg_stat_activity WHERE application_name=${q(name)} AND wait_event=${q(event)};`)==='1')return;await new Promise(r=>setTimeout(r,20));}throw Error('expected PG wait '+name+'/'+event);};
    const asyncSQL=s=>reviewerResultSqlStdin(path.join(bin,'psql'),['-X','-qAt','-v','ON_ERROR_STOP=1','-h',tmp,'-p',String(port),'-d','postgres'],"SET statement_timeout='5s';"+s,{encoding:'utf8',timeout:6000,maxBuffer:1048576});
    const publish=()=>runResearchPublication(db,request,principal,pair.reviewerPrincipalId,new FinancialDeadline());
    const rejectSQL=(s,pattern)=>{const before=audit();assert.throws(()=>sql(s),pattern);assert.equal(audit(),before);};
    if(['unaccepted-review','paid-content'].includes(scenario)) {
      await check('saved '+scenario+' cannot become a first publication and all effects rollback',async()=>{
        const before=audit();await assert.rejects(publish());assert.equal(audit(),before);
        rejectSQL(rpc('publish_research_article_v2',Object.values(pubArgs)),scenario==='paid-content'?/candidate_research_dossiers_paid_content_check/:/research_publication_live_fence/);
      });passed=true;return;
    }
    if(scenario==='expires-waiting') {
      await check('original live lease expires while awaiting source fence; no extension or writes',async()=>{
        const before=audit(),remainingSQL=`SELECT extract(epoch FROM lease_expires_at-clock_timestamp()) FROM research_deep_jobs_v1 WHERE job_id=${q(f.input.jobId)};`;
        let remaining=Number(sql(remainingSQL));
        if(remaining>4) await new Promise(resolve=>setTimeout(resolve,(remaining-4)*1000));
        remaining=Number(sql(remainingSQL));assert.ok(remaining>0&&remaining<4.5,'bounded original fixture window remaining');
        const b=asyncSQL(`SET application_name='publication-expiry-B';BEGIN;SELECT pg_advisory_xact_lock(610091002::bigint);SELECT pg_sleep(${remaining+0.1});COMMIT;`);
        await wait('publication-expiry-B','PgSleep');
        const a=asyncSQL(`SET application_name='publication-expiry-A';${rpc('publish_research_article_v2',Object.values(pubArgs))}`).then(()=>({ok:true}),e=>({ok:false,error:e.stderr}));
        await wait('publication-expiry-A','advisory');await b;const denied=await a;assert.equal(denied.ok,false);assert.match(denied.error,/research_author_handoff_claim|original_fence|claim_not_active|claim_unavailable|claim_missing/);assert.equal(audit(),before);
      });passed=true;return;
    }
    if(scenario==='publication-first') {
      await check('first uncommitted publication holds original source fence; later committed withdrawal preserves bytes',async()=>{
        const before=JSON.parse(audit());
        const a=asyncSQL(`SET application_name='first-publication-A';BEGIN;${rpc('publish_research_article_v2',Object.values(pubArgs))}SELECT pg_sleep(1);COMMIT;`);
        await wait('first-publication-A','PgSleep');assert.equal(sql('SELECT count(*) FROM candidate_research_dossiers;'),'0');
        const b=asyncSQL(`SET application_name='first-withdrawal-B';SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"private"}' WHERE id=${q(f.source)};`);
        await wait('first-withdrawal-B','advisory');const original=JSON.parse((await a).stdout.trim());await b;
        assert.equal(original.researchState,'published');assert.equal(original.idempotentReplay,false);
        const withdrawn=await publish();assert.equal(withdrawn.researchState,'withdrawn');assert.deepEqual(withdrawn.receipt,original.receipt);assert.deepEqual(withdrawn.content,original.content);
        const after=JSON.parse(audit());for(const key of ['models','completions','inputs'])assert.deepEqual(after[key],before[key]);for(const key of ['bundles','outbox','dossiers','receipts'])assert.equal(after[key].length,1);
      });passed=true;return;
    }
    if(scenario!=='positive') {
      await check('committed source-first '+scenario+' wins shared fence and blocks waiting first publication',async()=>{
        const before=JSON.parse(audit());
        const change=scenario==='new-revision'
          ? `INSERT INTO source_raw_documents SELECT gen_random_uuid(),document_url||'#si-revision-synthetic',published_at,clock_timestamp(),metadata,title,'New public revision','ptt',symbols,content_text FROM source_raw_documents WHERE id=${q(f.source)};`
          : `UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"private"}' WHERE id=${q(f.source)};UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"public"}' WHERE id=${q(f.source)};`;
        const b=asyncSQL(`SET application_name='publication-source-B';BEGIN;SET ROLE service_role;${change}SELECT pg_sleep(1);COMMIT;`);
        await wait('publication-source-B','PgSleep');
        const a=asyncSQL(`SET application_name='publication-source-A';${rpc('publish_research_article_v2',Object.values(pubArgs))}`).then(()=>({ok:true}),e=>({ok:false,error:e.stderr}));
        await wait('publication-source-A','advisory');await b;const denied=await a;assert.equal(denied.ok,false);assert.match(denied.error,/source_seal_/);
        const after=JSON.parse(audit());for(const key of ['bundles','outbox','dossiers','receipts','jobs','models','completions','inputs'])assert.deepEqual(after[key],before[key]);
        assert.ok(Number(sql('SELECT count(*) FROM research_source_seal_invalidations_v2;'))>=1);
      });
      passed=true;return;
    }
    await check('unpublished read, altered hash/result/role and isolation reject without effects',async()=>{
      const before=audit();assert.equal(await runResearchPublication(db,{...request,action:'readResearchPublication'},principal,pair.reviewerPrincipalId,new FinancialDeadline()),null);
      for(const patch of [{p_content_hash:'f'.repeat(64)},{p_reviewer_result_hash:'e'.repeat(64)},{p_author_principal:pair.reviewerPrincipalId}]) rejectSQL(rpc('publish_research_article_v2',Object.values({...pubArgs,...patch})),/research_publication_/);
      rejectSQL('BEGIN ISOLATION LEVEL REPEATABLE READ;'+rpc('publish_research_article_v2',Object.values(pubArgs)),/research_publication_read_committed_required/);assert.equal(audit(),before);
    });
    await check('failure after each durable publication effect rolls back all rows and original lease',()=>{
      const stages=[['candidate_dossier_bundles','INSERT'],['candidate_dossier_outbox_v5','INSERT'],['candidate_dossier_outbox_v5','UPDATE'],['candidate_research_dossiers','INSERT'],['candidate_dossier_submission_receipts','INSERT'],['research_deep_jobs_v1','UPDATE'],['candidate_dossier_outbox_v5','UPDATE','accepted']];
      for(const [table,op,state] of stages){sql(`CREATE FUNCTION fixture_publication_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_publication_abort';END$$;CREATE TRIGGER fixture_publication_abort AFTER ${op} ON ${table} FOR EACH ROW ${state ? "WHEN (NEW.status='accepted') " : ''}EXECUTE FUNCTION fixture_publication_abort();`);
        rejectSQL(rpc('publish_research_article_v2',Object.values(pubArgs)),/synthetic_publication_abort/);sql(`DROP TRIGGER fixture_publication_abort ON ${table};DROP FUNCTION fixture_publication_abort();`);}
    });
    let publication;
    await check('real recalculation and concurrent publish yield one immutable existing receipt with no new charges',async()=>{
      const before=JSON.parse(audit()),responses=await Promise.all([publish(),publish()]);publication=responses[0];
      assert.deepEqual(responses[0].receipt,responses[1].receipt);assert.deepEqual(responses[0].content,responses[1].content);
      assert.deepEqual(responses.map(r=>r.idempotentReplay).sort(),[false,true]);
      const after=JSON.parse(audit());for(const key of ['bundles','outbox','dossiers','receipts'])assert.equal(after[key].length,1);
      for(const key of ['models','completions','sources','inputs'])assert.deepEqual(after[key],before[key]);
      assert.equal(after.jobs.find(j=>j.job_id===f.input.jobId).status,'completed');
      assert.equal(sql('SELECT count(*) FROM stocks;'),'0');assert.equal(sql('SELECT count(*) FROM candidate_detail_snapshots;'),'0');assert.equal(sql('SELECT count(*) FROM candidate_daily_stage_snapshots;'),'0');
      assert.equal(publication.researchQualified,false);assert.equal(publication.strategyApproved,false);assert.equal(publication.entryEligible,false);
      const publicBytes=JSON.stringify({content:publication.content,sources:publication.sourceReferences});for(const secret of [principal,pair.reviewerPrincipalId,ids.owner,'UNIQUE_PRIVATE_FULLTEXT_SENTINEL','controllerObservedStartAt','invocationId'])assert.ok(!publicBytes.includes(secret));
    });
    await check('legacy detail cannot disguise a v2 bundle or v2 dossier through direct service insert',()=>{
      const stock=randomUUID(),detail=randomUUID(),legacyDossier=randomUUID(),bundle=publication.receipt.bundleId,dossier=publication.receipt.dossierId;
      const prefix=`BEGIN;INSERT INTO stocks(id,symbol,market) VALUES(${q(stock)},'9999','TW');INSERT INTO candidate_detail_snapshots(id,stock_id,session_date,model_version,revision_hash) VALUES(${q(detail)},${q(stock)},'2026-10-09','synthetic-only',${q('f'.repeat(64))});`;
      rejectSQL(prefix+`SET ROLE service_role;INSERT INTO candidate_research_dossiers(detail_snapshot_id,narrative_kind,content,validation_status,bundle_id,input_hash,bundle_hash,detail_payload_hash) VALUES(${q(detail)},'codex_enriched','{}','valid',${q(bundle)},${q(f.inputHash)},${q(f.inputHash)},${q(f.inputHash)});COMMIT;`,/research_publication_branch_mismatch/);
      rejectSQL(prefix+`INSERT INTO candidate_research_dossiers(id,detail_snapshot_id,narrative_kind,content,validation_status) VALUES(${q(legacyDossier)},${q(detail)},'deterministic_fact','{}','valid');SET ROLE service_role;INSERT INTO candidate_dossier_submission_receipts(bundle_id,revision_id,input_hash,dossier_id,submission_hash,status) VALUES(${q(bundle)},${q(detail)},${q(f.inputHash)},${q(legacyDossier)},${q('e'.repeat(64))},'accepted');COMMIT;`,/research_publication_branch_mismatch/);
      assert.equal(sql('SELECT count(*) FROM stocks;'),'0');
      // Null legacy revision / mixed explicit v2 identity cannot pass union.
      rejectSQL(`SET ROLE service_role;INSERT INTO candidate_research_dossiers(narrative_kind,content,validation_status) VALUES('codex_enriched','{}','valid');`,/research_dossier_revision_union_v2/);
      rejectSQL(`SET ROLE service_role;INSERT INTO candidate_dossier_submission_receipts(bundle_id,input_hash,dossier_id,submission_hash,status,revision_kind,research_input_revision_id) VALUES(${q(bundle)},${q(f.inputHash)},${q(dossier)},${q('e'.repeat(64))},'accepted','research_input_v2',${q(f.inputRevisionId)});`,/research_publication_writer_required/);
    });
    await check('original valid legacy writer still publishes its own bundle after v2 migration',()=>{
      const stock=randomUUID(),detail=randomUUID(),bundle=randomUUID(),before=audit();
      const result=JSON.parse(sql(`BEGIN;INSERT INTO stocks(id,symbol,market) VALUES(${q(stock)},'9999','TW');INSERT INTO candidate_detail_snapshots(id,stock_id,session_date,model_version,revision_hash) VALUES(${q(detail)},${q(stock)},'2026-10-09','synthetic-legacy',${q('d'.repeat(64))});INSERT INTO candidate_daily_stage_snapshots VALUES(${q(detail)});INSERT INTO candidate_dossier_bundles(bundle_id,revision_id,published_revision_id,input_hash,symbol,payload) VALUES(${q(bundle)},${q(detail)},${q(detail)},${q('d'.repeat(64))},'9999','{}');SET ROLE service_role;SELECT to_jsonb(x) FROM record_candidate_dossier_submission_v4(${q(bundle)},${q(detail)},${q('d'.repeat(64))},${q('c'.repeat(64))},'{}','[]','[]','{}','valid','[]') x;ROLLBACK;`));
      assert.equal(result.status,'accepted');assert.equal(audit(),before);
    });
    await check('independent: legacy bundle cannot point receipt at an actual v2 dossier',()=>{
      const stock=randomUUID(),detail=randomUUID(),bundle=randomUUID();
      const prefix=`BEGIN;INSERT INTO stocks(id,symbol,market) VALUES(${q(stock)},'9998','TW');INSERT INTO candidate_detail_snapshots(id,stock_id,session_date,model_version,revision_hash) VALUES(${q(detail)},${q(stock)},'2026-10-10','independent-legacy',${q('d'.repeat(64))});INSERT INTO candidate_dossier_bundles(bundle_id,revision_id,published_revision_id,input_hash,symbol,payload) VALUES(${q(bundle)},${q(detail)},${q(detail)},${q('d'.repeat(64))},'9998','{}');`;
      rejectSQL(prefix+`SET ROLE service_role;INSERT INTO candidate_dossier_submission_receipts(bundle_id,revision_id,input_hash,dossier_id,submission_hash,status) VALUES(${q(bundle)},${q(detail)},${q('d'.repeat(64))},${q(publication.receipt.dossierId)},${q('b'.repeat(64))},'accepted');COMMIT;`,/research_publication_branch_mismatch/);
    });
    await check('independent: actual service may retain genuine legacy dossier with NULL bundle/input',()=>{
      const stock=randomUUID(),detail=randomUUID(),before=audit();
      const value=JSON.parse(sql(`BEGIN;INSERT INTO stocks(id,symbol,market) VALUES(${q(stock)},'9998','TW');INSERT INTO candidate_detail_snapshots(id,stock_id,session_date,model_version,revision_hash) VALUES(${q(detail)},${q(stock)},'2026-10-10','independent-unbundled',${q('d'.repeat(64))});SET ROLE service_role;WITH inserted AS (INSERT INTO candidate_research_dossiers(detail_snapshot_id,narrative_kind,content,validation_status) VALUES(${q(detail)},'deterministic_fact','{}','valid') RETURNING *) SELECT jsonb_build_object('revision_kind',revision_kind,'detail',detail_snapshot_id,'bundle',bundle_id,'input',input_hash,'v2input',research_input_revision_id) FROM inserted;ROLLBACK;`));
      assert.deepEqual(value,{revision_kind:'legacy_detail_v1',detail,bundle:null,input:null,v2input:null});assert.equal(audit(),before);
    });
    await check('restart and exact replay return original receipt without live claim',async()=>{
      const before=audit();run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();
      const replay=await publish();assert.equal(replay.idempotentReplay,true);assert.deepEqual(replay.receipt,publication.receipt);assert.equal(audit(),before);
      const read=await runResearchPublication(db,{...request,action:'readResearchPublication'},principal,pair.reviewerPrincipalId,new FinancialDeadline());assert.deepEqual(read.receipt,publication.receipt);
    });
    await check('completed replay holds source fence before withdrawal; original bytes remain immutable',async()=>{
      const before=JSON.parse(audit());
      const a=asyncSQL(`SET application_name='publication-first-A';BEGIN;${rpc('publish_research_article_v2',Object.values(pubArgs))}SELECT pg_sleep(1);COMMIT;`);
      await wait('publication-first-A','PgSleep');
      const b=asyncSQL(`SET application_name='publication-first-B';SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"private"}' WHERE id=${q(f.source)};`);
      await wait('publication-first-B','advisory');await a;await b;
      const withdrawn=await publish();assert.equal(withdrawn.researchState,'withdrawn');assert.deepEqual(withdrawn.receipt,publication.receipt);assert.deepEqual(withdrawn.content,publication.content);
      const after=JSON.parse(audit());for(const key of ['bundles','outbox','dossiers','receipts','models','completions','jobs','inputs'])assert.deepEqual(after[key],before[key]);
      assert.equal(sql('SELECT count(*) FROM research_source_seal_invalidations_v2;'),'1');
    });
    await check('direct service mutation, truncate and changed completed replay denied',()=>{
      for(const s of ["UPDATE candidate_research_dossiers SET content='{}';","DELETE FROM candidate_dossier_submission_receipts;","TRUNCATE candidate_research_dossiers CASCADE;","TRUNCATE candidate_dossier_submission_receipts CASCADE;","UPDATE candidate_dossier_outbox_v5 SET status='failed',receipt_id=NULL;"])
        rejectSQL('SET ROLE service_role;'+s,/append_only|research_publication_|permission denied/);
      rejectSQL(rpc('publish_research_article_v2',Object.values({...pubArgs,p_content_hash:'f'.repeat(64)})),/research_publication_replay_content/);
    });
    passed=true;
  } finally {
    if(active) run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);
    if(passed) fs.rmSync(tmp,{recursive:true,force:true});else console.error('preserved atomic publication failure:',tmp);
  }
}
for(const scenario of ['positive']) test('atomic publication: original private pipeline, synthetic reports — '+scenario,t=>publicationFixture(t,scenario));
