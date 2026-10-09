import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { createAuthorAssignmentFixture } from './research-author-assignment-fixture.sql.mjs';

const dependency = '75a74cd829c04f624c8447c7334d0aa5a62eec84';
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
const bin = process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || process.env.OPPORTUNITY_V3_POSTGRES_BIN || (() => {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8' }).trim(); } catch { return ''; }
})();

test('private author assignment persistence on actual PG; synthetic role/input fixtures, not model execution', async t => {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required');
  const tmp = fs.mkdtempSync('/tmp/si-author-'); const pg = path.join(tmp, 'pg');
  const port = 55000 + process.pid % 5000; let active = false; let passed = false;
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', tmp, '-p', String(port), '-d', 'postgres'];
  const run = (name, argv, input) => execFileSync(path.join(bin, name), argv,
    { input, encoding: 'utf8', timeout: 15000, maxBuffer: 4 * 1024 * 1024 }).trim();
  const sql = s => run('psql', args, `SET statement_timeout='5s';${s}`);
  const start = () => { run('pg_ctl', ['-D', pg, '-l', path.join(tmp, 'pg.log'), '-o', `-h '' -k ${tmp} -p ${port}`, '-w', 'start']); active = true; };
  const callAsync = promisify(execFile);
  const predecessor = name => {
    if (fs.existsSync(name)) return fs.readFileSync(name, 'utf8');
    assert.equal(process.env.STOCKINSIDER_AUTHOR_ASSIGNMENT_GIT_FIXTURE, 'enabled',
      'accepted predecessor migration required; explicit isolated Git fixture fallback is manual-only');
    return execFileSync('git', ['show', `${dependency}:${name}`], { encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  };
  try {
    run('initdb', ['-D', pg, '-A', 'trust', '--no-instructions']); start();
    sql(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE ROLE service_role BYPASSRLS;
      CREATE TABLE source_raw_documents(id uuid PRIMARY KEY,document_url text NOT NULL,published_at timestamptz,collected_at timestamptz NOT NULL,metadata jsonb NOT NULL);
      GRANT ALL ON source_raw_documents TO service_role;`);
    sql(fs.readFileSync('migrations/20261009_research_publication_source_fence_v2.sql', 'utf8'));
    const ids = { job: randomUUID(), reservation: randomUUID(), company: randomUUID(), priority: randomUUID(), snapshot: 'a'.repeat(64), owner: 'synthetic-original-author-owner' };
    createAuthorAssignmentFixture(sql, { q, ...ids });
    // Supported company, still absent from every formal stock table.
    sql(`UPDATE research_observed_companies_v1 SET symbol='2409';UPDATE research_observed_roster_members_v1 SET symbol='2409';UPDATE research_deep_jobs_v1 SET symbol='2409';`);
    const roster = fs.readFileSync('migrations/20261008_research_observed_roster_v1.sql', 'utf8');
    sql(roster.slice(roster.indexOf('CREATE FUNCTION public.research_observed_canonical_json_v1'), roster.indexOf('-- Fail closed beyond PostgreSQL')));
    for (const name of ['20261009_research_input_preparations_v2.sql', '20261009_research_input_preparation_assert_v2.sql']) sql(fs.readFileSync(`migrations/${name}`, 'utf8'));
    // Actual pinned predecessor SQL, never a stubbed RPC or claimed accepted runtime.
    const predecessorSql=predecessor('migrations/20261009_research_complete_input_v2.sql');
    t.diagnostic(`Complete-input predecessor SQL SHA256 ${createHash('sha256').update(predecessorSql).digest('hex')}; seeded assignment fixture is not financial or model acceptance.`);
    sql(predecessorSql);
    const source = randomUUID();
    sql(`SET ROLE service_role;INSERT INTO source_raw_documents VALUES(${q(source)},'https://example.invalid/assignment-fixture',NULL,clock_timestamp()-interval '1 second','{"canonical_url":"https://example.invalid/assignment-fixture","rights_boundary":"public_citation"}');RESET ROLE;`);
    const old = { owner: ids.owner, jobId: ids.job, attempt: 1, reservationId: ids.reservation, bundleId: null,
      sourceDocumentIds: [source], scope: 'research_observed_v1', snapshotHash: ids.snapshot };
    const prep = JSON.parse(sql(`SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(old))});`));
    const mapping = JSON.parse(sql(`SET ROLE research_input_preparation_owner_v2;SELECT research_complete_mapping_v2('2409');`));
    const request = { ...old, preparationId: prep.preparation_id, preparationHash: prep.input_hash,
      expectedArtifactManifestHash: mapping.inventoryHash, expectedCalculatorExecutionHash: mapping.sourceClosureHash };
    delete request.bundleId; delete request.sourceDocumentIds;
    const principal = 'e'.repeat(64);
    const seedCompleteFixture = (request, prep) => {
    const revision = randomUUID();
    // Superuser/private fixture seeding ONLY: no financial schema or model acceptance.
    // All actual parent/source/lease assertions still execute on every assignment.
    sql(`SET ROLE research_input_preparation_owner_v2;
      WITH clock AS (SELECT clock_timestamp() AS n), p AS (SELECT *,jsonb_build_object('schemaVersion','research-article-input-v2',
       'researchIdentity',jsonb_build_object('researchCompanyId',payload->'researchCompanyId','symbol',payload->'symbol','scope',payload->'scope','snapshotHash',payload->'snapshotHash'),
       'originalJob',payload->'originalJob','originalReservation',payload->'originalReservation',
       'capabilities',jsonb_build_object('financialVerified',false,'dispatchReady',false,'modelDispatched',false,'publishableResearch',false,'researchQualified',false,'strategyApproved',false,'entryEligible',false,'historicalPITEligible',false)) AS f
       FROM research_input_preparations_v2 WHERE preparation_id=${q(prep.preparation_id)})
      INSERT INTO research_article_input_revisions_v2 SELECT ${q(revision)},preparation_id,job_id,attempt,reservation_id,(payload->>'researchCompanyId')::uuid,'research_observed_v1',payload->>'snapshotHash',
       research_complete_hash_v2(${q(JSON.stringify(request))}::jsonb),${q(JSON.stringify(request))}::jsonb,research_complete_hash_v2(f),f,100,clock.n,clock.n,source_seal_id FROM p CROSS JOIN clock;`);
    return {revision,inputHash:sql(`SELECT input_hash FROM research_article_input_revisions_v2 WHERE revision_id=${q(revision)};`)};
    };
    const {revision,inputHash}=seedCompleteFixture(request,prep);
    sql(fs.readFileSync('migrations/20261009_research_author_assignments_v2.sql', 'utf8'));
    const invocation = (action = 'assign', actor = principal, rev = revision, hash = inputHash, req = request) =>
      `SET ROLE service_role;SELECT ${action === 'assign' ? 'assign_research_author_v2' : 'read_research_author_assignment_v2'}(${q(JSON.stringify(req))},${q(rev)},${q(hash)},${q(actor)});`;
    const assign = (...values) => JSON.parse(sql(invocation(...values)));
    const counts = () => sql('SELECT count(*) FROM research_author_assignments_v2;SELECT count(*) FROM research_model_reservations_v1;SELECT count(*) FROM research_model_completions_v1;SELECT count(*) FROM stocks;');
    let saved;
    await t.test('read is null before assignment; creation derives original owner, company and both exact deadlines', () => {
      assert.equal(sql(invocation('read')), ''); saved = assign();
      assert.equal(saved.controller_principal, principal); assert.equal(saved.work_owner, ids.owner);
      assert.equal(saved.input_hash, inputHash); assert.equal(saved.input_revision_id, revision); assert.equal(saved.research_company_id, ids.company);
      assert.deepEqual(saved.canonical_request, request);
      assert.equal(saved.original_job_deadline, prep.payload.originalJob.leaseExpiresAt);
      assert.equal(saved.reservation_expires_at, prep.payload.originalReservation.leaseExpiresAt);
      assert.equal(saved.reservation_started_at, prep.payload.originalReservation.startedAt);
      assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('exact replay and PG restart preserve immutable assignment and do not reserve or charge again', () => {
      assert.deepEqual(assign(), saved); assert.deepEqual(assign('read'), saved);
      run('pg_ctl', ['-D', pg, '-m', 'fast', '-w', 'stop']); active = false; start();
      assert.deepEqual(assign(), saved); assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('rotation, changed input/revision, unknown caller identity and changed owner fail closed', () => {
      assert.throws(() => assign('assign', 'f'.repeat(64)), /replay_conflict/u);
      assert.throws(() => assign('assign', principal, randomUUID()), /input_invalid/u);
      assert.throws(() => assign('assign', principal, revision, 'f'.repeat(64)), /input_invalid/u);
      assert.throws(() => assign('assign', 'author-name'), /identity_invalid/u);
      assert.throws(() => assign('assign', principal, revision, inputHash, { ...request, authorId: 'name' }), /complete_request_shape/u);
      assert.throws(() => assign('assign', principal, revision, inputHash, { ...request, owner: 'another-owner' }), /complete_parent_binding/u);
      assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('BYPASSRLS service cannot directly write or read private rows; anon cannot invoke helper or RPC', () => {
      for (const command of ['SELECT * FROM research_author_assignments_v2', 'DELETE FROM research_author_assignments_v2',
        'UPDATE research_author_assignments_v2 SET work_owner=work_owner', 'TRUNCATE research_author_assignments_v2',
        'INSERT INTO research_author_assignments_v2 SELECT * FROM research_author_assignments_v2']) {
        assert.throws(() => sql('SET ROLE service_role;' + command), /permission denied/u);
      }
      assert.throws(() => sql(invocation().replace('SET ROLE service_role', 'SET ROLE anon')), /permission denied/u);
      assert.throws(() => sql(invocation().replace('assign_research_author_v2', 'research_author_assignment_context_v2')), /permission denied/u);
      assert.throws(() => sql('SET ROLE research_input_preparation_owner_v2;DELETE FROM research_author_assignments_v2;'), /immutable/u);
      assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('two actual PG sessions replay the same assignment without duplicate state', async () => {
      const runOne = async () => {
        const { stdout } = await callAsync(path.join(bin, 'psql'), [...args, '-c', invocation()], { encoding: 'utf8', timeout: 10000 });
        return JSON.parse(stdout.trim());
      };
      const results = await Promise.all([runOne(), runOne()]);
      assert.deepEqual(results, [saved, saved]); assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('completion and expiration block even exact replay without changing saved assignment bytes', () => {
      assert.throws(() => sql(`BEGIN;INSERT INTO research_model_completions_v1 VALUES(${q(ids.reservation)});${invocation()}`), /original_lease_lost/u);
      assert.throws(() => sql(`BEGIN;UPDATE research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 microsecond';${invocation()}`), /original_lease_lost/u);
      assert.deepEqual(assign('read'), saved); assert.equal(counts(), '1\n1\n0\n0');
    });
    await t.test('competing first admission in two real PG sessions yields exactly one new original assignment', async () => {
      const job2=randomUUID(),reservation2=randomUUID();
      sql(`INSERT INTO research_deep_jobs_v1 SELECT ${q(job2)},priority_run_id,symbol,stock_id,research_scope,research_company_id,observed_snapshot_hash,status,attempts,lease_owner,lease_expires_at FROM research_deep_jobs_v1 WHERE job_id=${q(ids.job)};
        INSERT INTO research_deep_job_attempts_v1 SELECT ${q(job2)},attempt,owner,claimed_at,lease_expires_at FROM research_deep_job_attempts_v1 WHERE job_id=${q(ids.job)};
        INSERT INTO research_model_reservations_v1 SELECT ${q(reservation2)},role,owner,${q('deep:'+job2+':1')},started_at,lease_expires_at FROM research_model_reservations_v1 WHERE reservation_id=${q(ids.reservation)};`);
      const old2={...old,jobId:job2,reservationId:reservation2};
      const prep2=JSON.parse(sql(`SET ROLE service_role;SELECT prepare_research_input_v2(${q(JSON.stringify(old2))});`));
      const request2={...request,jobId:job2,reservationId:reservation2,preparationId:prep2.preparation_id,preparationHash:prep2.input_hash};
      const sealed=seedCompleteFixture(request2,prep2);
      const call=invocation('assign',principal,sealed.revision,sealed.inputHash,request2);
      const runOne=async()=>JSON.parse((await callAsync(path.join(bin,'psql'),[...args,'-c',call],{encoding:'utf8',timeout:10000})).stdout.trim());
      const results=await Promise.all([runOne(),runOne()]);
      assert.deepEqual(results[0],results[1]);assert.notEqual(results[0].assignment_id,saved.assignment_id);
      assert.equal(results[0].job_id,job2);assert.equal(results[0].input_hash,sealed.inputHash);
      assert.equal(counts(),'2\n2\n0\n0');
    });
    await t.test('actual source withdrawal blocks original assignment read/replay while retaining immutable row', () => {
      sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"withdrawn":true}' WHERE id=${q(source)};`);
      assert.throws(() => assign(), /source/u); assert.throws(() => assign('read'), /source/u);
      assert.deepEqual(JSON.parse(sql(`SELECT row_to_json(a) FROM research_author_assignments_v2 a WHERE assignment_id=${q(saved.assignment_id)};`)), saved);
      assert.equal(counts(), '2\n2\n0\n0');
    });
    passed = true;
  } finally {
    if (active) run('pg_ctl', ['-D', pg, '-m', 'fast', '-w', 'stop']);
    if (passed) fs.rmSync(tmp, { recursive: true });
    else process.stderr.write(`Isolated failed assignment fixture retained: ${tmp}\n`);
  }
});
