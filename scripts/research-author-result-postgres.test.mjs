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
test('private author results against real original PG fences; synthetic execution, actual fixed AUO calculation', async t => {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required, not skipped');
  const tmp = fs.mkdtempSync('/tmp/si-result-'), pg = path.join(tmp, 'pg'), port = 55000 + process.pid % 5000;
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', tmp, '-p', String(port), '-d', 'postgres'];
  let active = false, passed = false;
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
    sql("UPDATE research_observed_companies_v1 SET symbol='2409';UPDATE research_observed_roster_members_v1 SET symbol='2409';UPDATE research_deep_jobs_v1 SET symbol='2409';");
    const roster = fs.readFileSync('migrations/20261008_research_observed_roster_v1.sql', 'utf8');
    sql(roster.slice(roster.indexOf('CREATE FUNCTION public.research_observed_canonical_json_v1'), roster.indexOf('-- Fail closed beyond PostgreSQL')));
    for (const name of ['research_input_preparations', 'research_input_preparation_assert', 'research_complete_input', 'research_author_assignments', 'research_author_packet', 'research_author_results'])
      sql(fs.readFileSync(`migrations/20261009_${name}_v2.sql`, 'utf8'));
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
        INSERT INTO research_model_reservations_v1 SELECT ${q(reservation)},role,owner,${q('deep:' + job + ':1')},started_at,lease_expires_at FROM research_model_reservations_v1 WHERE reservation_id=${q(ids.reservation)};
        SET ROLE service_role;INSERT INTO source_raw_documents VALUES(${q(source)},${q(url)},${q(changes.publishedAt || new Date(Date.now() - 86400000).toISOString())},clock_timestamp()-interval '1 second',${q(JSON.stringify(metadata))},
          ${q(changes.title || 'Synthetic source')},${q(changes.summary || 'Public summary only; not a real catalyst.')},'ptt',${q(JSON.stringify(changes.symbols || ['2409']))},'UNIQUE_PRIVATE_FULLTEXT_SENTINEL');`);
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
    const audit=()=>sql("SELECT count(*) FROM research_author_results_v2;SELECT count(*) FROM research_model_completions_v1;SELECT count(*) FROM research_model_reservations_v1;SELECT sum(logical_bytes) FROM research_input_preparations_v2;");
    const prepare=async(invocation)=>{const f=await make();const p=await runResearchAuthorPacket(db,f,principal,new FinancialDeadline());return {...f,...authorResultFixture(f,f.revision,p.packet,invocation)};};
    const receive=f=>runResearchAuthorResult(db,f.request,principal,httpRequest,new FinancialDeadline());
    const read=f=>runResearchAuthorResult(db,{...f.request,action:'readAuthorResult'},principal,httpRequest,new FinancialDeadline());
    const f=await prepare();let original;
    await t.test('no result before receive, all original rows and budget unchanged',async()=>{const before=audit();assert.equal((await read(f)).result,null);assert.equal(audit(),before);});
    await t.test('actual calculator and authenticated binding persist one private draft only',async()=>{const before=audit().split('\n');original=(await receive(f)).result;assert.equal(original.payload.observation.modelIdentity,null);assert.equal(original.payload.validatedArticle.publishableResearch,false);assert.equal(original.result_hash,completeHash(original.payload));const after=audit().split('\n');assert.equal(Number(after[0]),Number(before[0])+1);assert.deepEqual(after.slice(1),before.slice(1));});
    await t.test('exact receive replay/read and PostgreSQL restart preserve original bytes and charge',async()=>{const before=audit();assert.deepEqual((await receive(f)).result,original);assert.deepEqual((await read(f)).result,original);run('pg_ctl',['-D',pg,'-m','fast','-w','stop']);active=false;start();assert.deepEqual((await read(f)).result,original);assert.equal(audit(),before);});
    await t.test('changed article or execution bindings fail with no new row',async()=>{for(const mutate of [x=>x.article.summary.text+='更改',x=>x.observation.outputHash='f'.repeat(64),x=>x.observation.assignmentId=randomUUID(),x=>x.observation.controllerObservedEndAt='2099-01-01T00:00:00Z',x=>x.article.authoredAt=new Date(Date.now()-86400000).toISOString()]){const bad=structuredClone(f);mutate(bad.request);const before=audit();await assert.rejects(receive(bad));assert.equal(audit(),before);}});
    await t.test('same assignment conflicting immutable envelope is rejected by SQL',()=>{const changed=structuredClone(f.envelope);changed.observation.turnId=randomUUID();const before=audit();assert.throws(()=>sql(rpc('receive_research_author_result_v2',[...f.binding,changed])),/replay_conflict/);assert.equal(audit(),before);});
    await t.test('concurrent exact first receive creates one result and no completion',async()=>{const c=await prepare();const before=audit().split('\n');const args={p_request:c.input,p_revision_id:c.inputRevisionId,p_input_hash:c.inputHash,p_principal:principal,p_result:c.envelope};const results=await Promise.all([db.rpc('receive_research_author_result_v2',args),db.rpc('receive_research_author_result_v2',args)]);assert.deepEqual(results[0].data,results[1].data);const after=audit().split('\n');assert.equal(Number(after[0]),Number(before[0])+1);assert.deepEqual(after.slice(1),before.slice(1));});
    await t.test('invocation cannot be reused across different original assignments',async()=>{const other=await prepare(f.envelope.observation.invocationId),before=audit();await assert.rejects(receive(other),/unique|duplicate/);assert.equal(audit(),before);});
    await t.test('SQL canonical envelope exact1MiB/+1 quota, synthetic validation-limit text only',async()=>{
      const c=await prepare(),payload=structuredClone(c.envelope);payload.validatedArticle.limitations.push('');
      const rehash=()=>{const v=payload.validatedArticle;const without={...v};delete without.articleHash;v.articleHash=completeHash(without);payload.observation.articleHash=v.articleHash;};
      rehash();const base=Buffer.byteLength(completeCanonical(payload)),remaining=1048576-base;payload.validatedArticle.limitations[payload.validatedArticle.limitations.length-1]='界'.repeat(Math.floor(remaining/3))+'a'.repeat(remaining%3);rehash();assert.equal(Buffer.byteLength(completeCanonical(payload)),1048576);
      const saved=JSON.parse(sql(rpc('receive_research_author_result_v2',[...c.binding,payload])));assert.equal(saved.logical_bytes,1048576);const before=audit();payload.validatedArticle.limitations[payload.validatedArticle.limitations.length-1]+='a';rehash();assert.equal(Buffer.byteLength(completeCanonical(payload)),1048577);assert.throws(()=>sql(rpc('receive_research_author_result_v2',[...c.binding,payload])),/result_bound/);assert.equal(audit(),before);
    });
    await t.test('SQL null identities, changed calculation and promoted capabilities reject',async()=>{
      const c=await prepare();for(const change of [p=>p.observation.threadId=null,p=>p.validatedArticle.entryEligible=true,p=>delete p.validatedArticle.financialVerified,p=>p.validatedArticle.calculation={},p=>p.validatedArticle.sources=[],p=>p.extra=true]){const p=structuredClone(c.envelope);change(p);const before=audit();assert.throws(()=>sql(rpc('receive_research_author_result_v2',[...c.binding,p])));assert.equal(audit(),before);}
    });
    await t.test('service table mutations denied; owner UPDATE DELETE TRUNCATE rejected',()=>{const before=audit();for(const statement of ['SELECT * FROM research_author_results_v2','DELETE FROM research_author_results_v2','UPDATE research_author_results_v2 SET payload=payload','TRUNCATE research_author_results_v2'])assert.throws(()=>sql('SET ROLE service_role;'+statement),/permission denied/);for(const statement of ['DELETE FROM research_author_results_v2','UPDATE research_author_results_v2 SET payload=payload','TRUNCATE research_author_results_v2'])assert.throws(()=>sql('SET ROLE research_input_preparation_owner_v2;'+statement),/immutable_source_receipt/);assert.equal(audit(),before);});
    await t.test('withdrawal rejects read/replay without changing stored draft',async()=>{sql(`UPDATE source_raw_documents SET metadata=metadata||'{"retracted_at":"2026-10-09T00:00:00Z"}'::jsonb WHERE id=${q(f.source)};`);const before=audit(),saved=sql('SET ROLE research_input_preparation_owner_v2;SELECT jsonb_agg(to_jsonb(x)) FROM research_author_results_v2 x');await assert.rejects(read(f));await assert.rejects(receive(f));assert.equal(audit(),before);assert.equal(sql('SET ROLE research_input_preparation_owner_v2;SELECT jsonb_agg(to_jsonb(x)) FROM research_author_results_v2 x'),saved);});
    await t.test('expired original job cannot read or receive a private result',async()=>{const c=await prepare();sql(`UPDATE research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 second' WHERE job_id=${q(c.input.jobId)};`);const before=audit();await assert.rejects(receive(c));await assert.rejects(read(c));assert.equal(audit(),before);});
    passed=true;
  }finally{if(active)try{run('pg_ctl',['-D',pg,'-m','immediate','-w','stop']);}catch{}if(passed)fs.rmSync(tmp,{recursive:true,force:true});else t.diagnostic('Failure evidence retained at '+tmp);}
});
