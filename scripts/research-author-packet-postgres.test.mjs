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
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { FinancialDeadline } from '../web/src/lib/research-financial-file-reader.ts';
import mapping from '../web/src/lib/research-complete-mapping.json' with { type: 'json' };

const bin = process.env.RESEARCH_LOCAL_DATAPLANE_PG_BIN || (() => {
  try { return execFileSync('pg_config', ['--bindir'], { encoding: 'utf8', timeout: 5000 }).trim(); } catch { return ''; }
})();
const q = v => "'" + String(v).replaceAll("'", "''") + "'";
test('actual original PG input/assignment and read-only author packet; synthetic source/role fixtures, real fixed AUO calculator', async t => {
  assert.ok(bin && ['initdb', 'pg_ctl', 'psql'].every(n => fs.existsSync(path.join(bin, n))), 'actual PostgreSQL required, not skipped');
  const tmp = fs.mkdtempSync('/tmp/si-packet-'), pg = path.join(tmp, 'pg'), port = 55000 + process.pid % 5000;
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
    for (const name of ['research_input_preparations', 'research_input_preparation_assert', 'research_complete_input', 'research_author_assignments', 'research_author_packet'])
      sql(fs.readFileSync(`migrations/20261009_${name}_v2.sql`, 'utf8'));
    const principal = 'e'.repeat(64);
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
    const tables = ['source_raw_documents', 'research_source_seals_v2', 'research_source_fence_events_v2', 'research_source_seal_invalidations_v2',
      'research_input_preparations_v2', 'research_article_input_revisions_v2', 'research_author_assignments_v2', 'research_deep_jobs_v1',
      'research_deep_job_attempts_v1', 'research_model_reservations_v1', 'research_model_completions_v1', 'stocks'];
    const audit = () => sql(`SELECT jsonb_build_object(${tables.map(name => `${q(name)},(SELECT jsonb_build_object('count',count(*),'hash',encode(sha256(convert_to(coalesce(jsonb_agg(to_jsonb(x) ORDER BY to_jsonb(x)::text)::text,'[]'),'UTF8')),'hex')) FROM ${name} x)`).join(',')},
      'logicalCharge',(SELECT coalesce(sum(logical_bytes),0) FROM (SELECT logical_bytes FROM research_input_preparations_v2 UNION ALL SELECT logical_bytes FROM research_article_input_revisions_v2) x));`);
    const read = f => JSON.parse(sql(rpc('read_research_author_packet_v2', f.binding)));
    const f = await make(); let saved;
    await t.test('existing original assignment returns exact public summary and seal receipt; actual server recomputes without writes', async () => {
      const before = audit(); saved = read(f);
      assert.equal(saved.inputHash, f.inputHash); assert.equal(saved.sources.length, 1);
      const s = saved.sources[0]; assert.equal(s.descriptor.rowHash, f.revision.canonical_payload.sources.manifest[0].rowHash);
      assert.equal(s.descriptor.admittedAt, saved.sourceSealReceivedAt);
      assert.notEqual(s.collectedAt, s.descriptor.admittedAt); assert.equal(s.descriptor.publication.precision, 'unknown');
      assert.equal(s.descriptor.publication.instant, null); assert.equal(JSON.stringify(saved).includes('UNIQUE_PRIVATE_FULLTEXT_SENTINEL'), false);
      const packet = await runResearchAuthorPacket(db, f, principal, new FinancialDeadline());
      assert.equal(completeHash(packet.packet), packet.packetHash); assert.equal(packet.packet.sources[0].summary, s.summary);
      assert.equal(JSON.stringify(packet).includes(ids.owner), false); assert.equal(JSON.stringify(packet).includes(principal), false);
      assert.deepEqual(packet.packet.financial.calculation, f.revision.canonical_payload.financial.material.calculation);
      assert.ok(Object.values(packet.packet.capabilities).every(v => v === false)); assert.equal(audit(), before);
    });
    await t.test('exact replay and actual restart return same sources/deadlines without any new charge or state', () => {
      const before = audit(); assert.deepEqual(read(f), saved);
      run('pg_ctl', ['-D', pg, '-m', 'fast', '-w', 'stop']); active = false; start();
      assert.deepEqual(read(f), saved); assert.equal(audit(), before);
    });
    await t.test('missing assignment, rotated principal and mismatched input reject without writes', async () => {
      const absent = await make({}, false), before = audit();
      assert.throws(() => read(absent), /assignment_missing/);
      assert.throws(() => sql(rpc('read_research_author_packet_v2', [...f.binding.slice(0, 3), 'f'.repeat(64)])), /replay_conflict/);
      assert.throws(() => sql(rpc('read_research_author_packet_v2', [f.input, randomUUID(), f.inputHash, principal])), /input_invalid/);
      assert.equal(audit(), before);
    });
    for (const [label, changes, expected] of [
      ['private summary rights', { metadata: { visibility: 'authenticated_summary', rights_boundary: 'bounded_summary_only' } }, /rights_or_scope/],
      ['different company', { symbols: ['9999'] }, /rights_or_scope/],
      ['missing metadata scope', { metadata: { subject_scope: null } }, /rights_or_scope/],
      ['first observation after collection', { metadata: { first_observed_at: new Date(Date.now() + 86400000).toISOString() } }, /source_clock/],
      ['summary4097 bytes', { summary: 'x'.repeat(4097) }, /content_bound/],
    ]) await t.test(label + ' cannot become a partial packet', async () => {
      const bad = await make(changes), before = audit(); assert.throws(() => read(bad), expected); assert.equal(audit(), before);
    });
    await t.test('exact4096-byte summary accepted; publication midnight is still unknown precision', async () => {
      const midnight = new Date(Date.now() - 86400000).toISOString().slice(0, 10) + 'T00:00:00.000Z';
      const exact = await make({ summary: 'x'.repeat(4096), publishedAt: midnight }), before = audit();
      const packet = read(exact); assert.equal(Buffer.byteLength(packet.sources[0].summary), 4096);
      assert.equal(packet.sources[0].descriptor.publication.instant, null); assert.equal(audit(), before);
      assert.equal(Date.parse(packet.sources[0].unverifiedPublicationClaim), Date.parse(midnight));
    });
    await t.test('real source change/retraction invalidates original packet while immutable financial input/assignment persists', () => {
      const old = sql(`SELECT input_hash FROM research_article_input_revisions_v2 WHERE revision_id=${q(f.inputRevisionId)};`);
      sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||jsonb_build_object('retracted_at',clock_timestamp()) WHERE id=${q(f.source)};`);
      const before = audit(); assert.throws(() => read(f), /source/); assert.equal(audit(), before);
      assert.equal(sql(`SELECT input_hash FROM research_article_input_revisions_v2 WHERE revision_id=${q(f.inputRevisionId)};`), old);
    });
    await t.test('completed and expired original fences reject; fixture rollback does not renew saved clocks', async () => {
      const good = await make(), before = audit(), call = rpc('read_research_author_packet_v2', good.binding);
      for (const mutation of [
        `INSERT INTO research_model_completions_v1 VALUES(${q(good.input.reservationId)});`,
        `UPDATE research_deep_jobs_v1 SET lease_expires_at=clock_timestamp()-interval '1 microsecond' WHERE job_id=${q(good.input.jobId)};`,
        `UPDATE research_model_reservations_v1 SET lease_expires_at=clock_timestamp()-interval '1 microsecond' WHERE reservation_id=${q(good.input.reservationId)};`,
      ]) { assert.throws(() => sql('BEGIN;' + mutation + call), /original_lease_lost/); assert.equal(audit(), before); }
      assert.ok(read(good)); assert.equal(audit(), before);
    });
    await t.test('source rights restored after revocation cannot resurrect the old sealed input (sequential ABA, not concurrent race proof)', async () => {
      const good = await make();
      sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"authenticated_summary","rights_boundary":"bounded_summary_only"}' WHERE id=${q(good.source)};`);
      sql(`SET ROLE service_role;UPDATE source_raw_documents SET metadata=metadata||'{"visibility":"public","rights_boundary":"public_citation"}' WHERE id=${q(good.source)};`);
      const before = audit(); assert.throws(() => read(good), /source/); assert.equal(audit(), before);
    });
    await t.test('anon/authenticated cannot read RPC; service cannot bypass original private assignment/context ACL', () => {
      const call = rpc('read_research_author_packet_v2', f.binding), before = audit();
      for (const role of ['anon', 'authenticated']) assert.throws(() => sql(call.replace('SET ROLE service_role', 'SET ROLE ' + role)), /permission denied/);
      assert.throws(() => sql('SET ROLE service_role;SELECT * FROM research_author_assignments_v2;'), /permission denied/);
      assert.throws(() => sql(rpc('research_author_assignment_context_v2', f.binding)), /permission denied/); assert.equal(audit(), before);
    });
    passed = true;
  } finally {
    if (active) { run('pg_ctl', ['-D', pg, '-m', 'fast', '-w', 'stop']); active = false; }
    const destination = process.env.RESEARCH_AUTHOR_PACKET_ARTIFACTS;
    if (destination) { fs.mkdirSync(destination, { recursive: true }); fs.copyFileSync(path.join(tmp, 'pg.log'), path.join(destination, 'pg.log'));
      fs.writeFileSync(path.join(destination, 'cleanup.json'), JSON.stringify({ cluster: tmp, stopped: !active, passed, syntheticFixture: true }) + '\n'); }
    if (passed) fs.rmSync(tmp, { recursive: true }); else console.error('Failed isolated packet fixture retained: ' + tmp);
  }
});
