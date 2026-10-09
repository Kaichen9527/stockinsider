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
import mapping from '../web/src/lib/research-complete-mapping.json' with { type: 'json' };

const bin = process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || (() => {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
})();
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
test('reviewer assignment: real original reservation budget/claim/fences, synthetic source and actual AUO calculation', async t => {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required, not skipped');
  const tmp = fs.mkdtempSync('/tmp/si-review-'), pg = path.join(tmp, 'pg'), port = 55000 + process.pid % 5000;
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
    const pair=resolveConfiguredResearchControllerPrincipals();assert.equal(pair.ok,true);assert.equal(pair.authorPrincipalId,principal);
    const reviewRequest={action:'assignReviewer',input:f.input,inputRevisionId:f.inputRevisionId,inputHash:f.inputHash,resultId:saved.result_id,resultHash:saved.result_hash};
    const reviewArgs=[f.input,f.inputRevisionId,f.inputHash,principal,pair.reviewerPrincipalId,saved.result_id,saved.result_hash];
    const role=()=>runResearchReviewerAssignment(db,reviewRequest,principal,pair.reviewerPrincipalId,new FinancialDeadline());
    const readRole=()=>runResearchReviewerAssignment(db,{...reviewRequest,action:'readReviewerAssignment'},principal,pair.reviewerPrincipalId,new FinancialDeadline());
    const packet=()=>runResearchReviewerAssignment(db,{...reviewRequest,action:'readReviewerPacket'},principal,pair.reviewerPrincipalId,new FinancialDeadline());
    const audit=()=>sql(`SELECT jsonb_build_object('assignments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY assignment_id),'[]') FROM research_reviewer_assignments_v2 x),'models',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_reservations_v1 x),'completions',(SELECT jsonb_agg(to_jsonb(x) ORDER BY reservation_id) FROM research_model_completions_v1 x),'results',(SELECT jsonb_agg(to_jsonb(x) ORDER BY result_id) FROM research_author_results_v2 x),'jobs',(SELECT jsonb_agg(to_jsonb(x) ORDER BY job_id) FROM research_deep_jobs_v1 x),'charge',(SELECT sum(reserved_seconds) FROM research_model_reservations_v1));`);
    await check('no reviewer reservation before exact author handoff',async()=>{const before=audit();await assert.rejects(role(),/author_handoff_missing/);assert.equal(audit(),before);});
    await runResearchAuthorHandoff(db,{...reviewRequest,action:'handoffAuthorResult'},principal,new FinancialDeadline());
    await check('server configuration author rotation, A-R swap and old-author-as-reviewer reject before reservation',async()=>{
      const frozen={INTERNAL_API_KEY:process.env.INTERNAL_API_KEY,RESEARCH_REVIEW_KEY:process.env.RESEARCH_REVIEW_KEY};
      for(const config of [{...frozen,INTERNAL_API_KEY:'synthetic-new-B'},{INTERNAL_API_KEY:frozen.RESEARCH_REVIEW_KEY,RESEARCH_REVIEW_KEY:frozen.INTERNAL_API_KEY},{INTERNAL_API_KEY:'synthetic-new-B',RESEARCH_REVIEW_KEY:frozen.INTERNAL_API_KEY}]){
        const changed=resolveConfiguredResearchControllerPrincipals(config);assert.equal(changed.ok,true);const before=audit();await assert.rejects(runResearchReviewerAssignment(db,reviewRequest,changed.authorPrincipalId,changed.reviewerPrincipalId,new FinancialDeadline()));assert.equal(audit(),before);
      }
    });
    await check('global active fixture slot blocks with null and zero reservation/assignment writes',async()=>{const before=audit();const r=await role();assert.equal(r.assignment,null);assert.equal(r.blockedReason,'global_lease_or_daily_budget_exhausted');assert.equal(audit(),before);});
    // Close the separate original upstream seed; retain its nonrefundable1800.
    sql(`SET ROLE research_observed_rpc_owner;INSERT INTO research_model_completions_v1(reservation_id,owner,outcome,result_hash) VALUES(${q(ids.reservation)},${q(ids.owner)},'failed',${q('f'.repeat(64))});`);
    await check('original7200 daily budget blocks with no active slot or writes; synthetic temporary quota rows rollback',()=>{
      const statements=[];for(let n=0;n<2;n++)statements.push(`INSERT INTO research_model_reservations_v1(reservation_id,role,owner,work_key,started_at,lease_expires_at) VALUES(gen_random_uuid(),'discovery','synthetic-quota','synthetic-quota-${n}',clock_timestamp()-interval '1 minute',clock_timestamp()+interval '29 minutes');
        SELECT finish_research_model_v1(reservation_id,owner,'failed',${q('e'.repeat(64))}) FROM research_model_reservations_v1 WHERE work_key='synthetic-quota-${n}';`);
      const before=audit();const rows=sql('BEGIN;'+statements.join('\n')+`SELECT sum(reserved_seconds) FROM research_model_reservations_v1;
        SELECT count(*) FROM research_model_reservations_v1 r WHERE r.lease_expires_at>clock_timestamp() AND NOT EXISTS(SELECT FROM research_model_completions_v1 c WHERE c.reservation_id=r.reservation_id);`+rpc('assign_research_reviewer_v2',reviewArgs)+`RESET ROLE;SELECT count(*) FROM research_reviewer_assignments_v2;SELECT count(*) FROM research_model_reservations_v1;ROLLBACK;`).split('\n');
      assert.deepEqual(rows,['t','t','7200','0','','0','4']);assert.equal(audit(),before);
    });
    await check('injected assignment insertion failure rolls back original reservation and charge atomically',async()=>{
      sql(`CREATE FUNCTION fixture_reviewer_insert_abort() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN RAISE EXCEPTION 'synthetic_assignment_insert_abort';END$$;
        CREATE TRIGGER fixture_reviewer_insert_abort BEFORE INSERT ON research_reviewer_assignments_v2 FOR EACH ROW EXECUTE FUNCTION fixture_reviewer_insert_abort();`);
      const before=audit();await assert.rejects(role(),/synthetic_assignment_insert_abort/);assert.equal(audit(),before);sql('DROP TRIGGER fixture_reviewer_insert_abort ON research_reviewer_assignments_v2;DROP FUNCTION fixture_reviewer_insert_abort();');
    });
    let assignment,firstPacket;
    await check('concurrent exact admission creates one assignment and only one original1800 charge',async()=>{
      const args={p_request:f.input,p_revision_id:f.inputRevisionId,p_input_hash:f.inputHash,p_author_principal:principal,p_reviewer_principal:pair.reviewerPrincipalId,p_result_id:saved.result_id,p_result_hash:saved.result_hash};
      const before=JSON.parse(audit()),responses=await Promise.all([db.rpc('assign_research_reviewer_v2',args),db.rpc('assign_research_reviewer_v2',args)]);assert.deepEqual(responses[0].data,responses[1].data);assignment=responses[0].data;const after=JSON.parse(audit());assert.equal(after.assignments.length,1);assert.equal(after.models.length,before.models.length+1);assert.equal(after.charge,before.charge+1800);assert.deepEqual(after.completions,before.completions);assert.deepEqual(after.results,before.results);assert.deepEqual(after.jobs,before.jobs);
    });
    await check('actual calculator and selected public source packet, no principals/owner/fulltext/model dispatch',async()=>{
      firstPacket=await packet();assert.equal(firstPacket.packetHash,completeHash(firstPacket.packet));assert.equal(firstPacket.packet.articleHash,saved.payload.validatedArticle.articleHash);assert.equal(firstPacket.packet.research.sources.length,1);assert.equal(firstPacket.packet.research.sources[0].descriptor.publication.precision,'unknown');assert.equal(firstPacket.packet.reviewerDispatched,false);assert.equal(firstPacket.packet.publishableResearch,false);
      const encoded=JSON.stringify(firstPacket.packet);for(const privateValue of [principal,pair.reviewerPrincipalId,ids.owner,f.input.jobId,f.input.reservationId,assignment.reservation_id,'UNIQUE_PRIVATE_FULLTEXT_SENTINEL'])assert.equal(encoded.includes(privateValue),false);
    });
    await check('exact admission/read/packet and actual PG restart preserve original bytes, clocks and budget',async()=>{
      const before=audit(),a=(await role()).assignment;assert.deepEqual(a,(await readRole()).assignment);assert.deepEqual((await packet()).packet,firstPacket.packet);run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();assert.deepEqual((await packet()).packet,firstPacket.packet);assert.equal(audit(),before);
    });
    await check('reviewer rotation cannot adopt existing assignment; old author reader stays rejected',async()=>{
      const changed=resolveConfiguredResearchControllerPrincipals({INTERNAL_API_KEY:process.env.INTERNAL_API_KEY,RESEARCH_REVIEW_KEY:'synthetic-new-S'}),before=audit();await assert.rejects(runResearchReviewerAssignment(db,reviewRequest,principal,changed.reviewerPrincipalId,new FinancialDeadline()));await assert.rejects(read(f));assert.equal(audit(),before);
    });
    await check('withdrawal/expiry/takeover fail inside transaction and rollback without altering original history',()=>{
      for(const change of [`UPDATE source_raw_documents SET metadata=metadata||'{"withdrawn":true}'::jsonb WHERE id=${q(f.source)}`,`UPDATE research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_id=${q(f.input.jobId)}`,`UPDATE research_deep_jobs_v1 SET lease_owner='takeover-owner' WHERE job_id=${q(f.input.jobId)}`]){
        const before=audit();assert.throws(()=>sql('BEGIN;'+change+';'+rpc('read_research_reviewer_context_v2',reviewArgs)));assert.equal(audit(),before);
      }
    });
    await check('reviewer assignment immutable and service direct read/mutation denied',()=>{
      const before=audit();for(const statement of ['SELECT * FROM research_reviewer_assignments_v2','UPDATE research_reviewer_assignments_v2 SET work_owner=work_owner','DELETE FROM research_reviewer_assignments_v2','TRUNCATE research_reviewer_assignments_v2'])assert.throws(()=>sql('SET ROLE service_role;'+statement),/permission denied/);
      for(const statement of ['UPDATE research_reviewer_assignments_v2 SET work_owner=work_owner','DELETE FROM research_reviewer_assignments_v2','TRUNCATE research_reviewer_assignments_v2'])assert.throws(()=>sql('SET ROLE research_observed_rpc_owner;'+statement),/immutable_source_receipt/);assert.equal(audit(),before);
    });
    await check('closed counter-review reservation rejects read/replay/packet without renewing or refunding',async()=>{
      sql(rpc('finish_research_model_v1',[assignment.reservation_id,ids.owner,'failed','d'.repeat(64)]));const before=audit();await assert.rejects(role());await assert.rejects(readRole());await assert.rejects(packet());assert.equal(audit(),before);
    });
    passed=!childFailed;
  }finally{if(active)try{run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);}catch{}if(passed)fs.rmSync(tmp,{recursive:true,force:true});else t.diagnostic('Failure evidence retained at '+tmp);}
});
