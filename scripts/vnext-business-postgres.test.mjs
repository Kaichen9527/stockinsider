import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { inputHash } from '../web/src/lib/vnext/policy.ts';
import { validateArtifact, validateReview, REQUIRED_SECTIONS } from '../web/src/lib/vnext/research.ts';
const container = process.env.VNEXT_TEST_CONTAINER;
const output = process.env.VNEXT_NATIVE_ARTIFACTS;
const scenario = process.env.VNEXT_BUSINESS_SCENARIO || 'durable';
if (!['durable','revision'].includes(scenario)) throw Error('closed_business_scenario_required');
if (!/^stockinsider-vnext-oct22-[a-z0-9-]+$/u.test(container || '') || !output || !path.isAbsolute(output) || fs.existsSync(output)) throw Error('fresh_owned_fixture_required');
fs.mkdirSync(output, { mode: 0o700 });
const hash = b => createHash('sha256').update(b).digest('hex');
const docker = (args, input) => spawnSync('docker', ['--host=unix:///var/run/docker.sock', ...args], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const identity = JSON.parse(docker(['inspect', container]).stdout)[0];
assert.equal(identity.Config.Labels['codex.task'], 'stockinsider-vnext-oct22'); assert.equal(identity.HostConfig.NetworkMode, 'none');
const database = process.env.VNEXT_BUSINESS_DATABASE || 'vnext_business_01';
if (!/^vnext_business_[0-9]{2}$/u.test(database)) throw Error('closed_fixture_database_required');
const created = docker(['exec', container, 'createdb', '-U', 'postgres', database]); assert.equal(created.status, 0, created.stderr);
const save = (name, value) => fs.writeFileSync(path.join(output, name + '.json'), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
const events = [];
function sql(text, rejection) {
  const p = docker(['exec', '-i', container, 'psql', '-X', '-qAt', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1'], `\\set VERBOSITY verbose\nSET statement_timeout='30s';\n${text}\n`);
  events.push({ sqlHash: hash(text), exit: p.status, stdoutHash: hash(p.stdout), stderrHash: hash(p.stderr), settled: p.status !== null });
  if (rejection) { assert.notEqual(p.status, 0); assert.match(p.stderr, rejection); return; }
  assert.equal(p.status, 0, p.stderr); return p.stdout.trim();
}
const literal = x => "'" + String(x).replaceAll("'", "''") + "'";
const rpcSQL = (actor, action, body) => `SET ROLE service_role;SELECT vnext_command_v1(${literal(actor)},${literal(action)},${literal(JSON.stringify(body))}::jsonb);`;
const rpc = (actor, action, body) => JSON.parse(sql(rpcSQL(actor, action, body)).split('\n').at(-1));
const read = symbol => JSON.parse(sql(`SET ROLE service_role;SELECT vnext_read_v1(${symbol ? literal(symbol) : 'NULL'});`).split('\n').at(-1));
function state() {
  return Object.fromEntries(sql(`SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'vnext_%' ORDER BY 1;`).split('\n').filter(Boolean).map(name => {
    const text = sql(`SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text),'[]'::jsonb)::text FROM ${name} t;`);
    return [name, { count: JSON.parse(text).length, sha256: hash(text) }];
  }));
}
const actors = { operator: 'business-operator', author: 'business-author', reviewer: 'business-reviewer' };
const now = new Date().toISOString(); const budgetDate = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()); const date = now.slice(0, 10); const priorDate = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
const migration = fs.readFileSync('migrations/20261022_stockinsider_vnext_20_v1.sql');
const captured = zlib.gunzipSync(fs.readFileSync('scripts/opportunity-v3/fixtures/vps-schema-20261011.sql.gz')).toString();
const capture = (kind, name) => {
  const m = captured.match(kind === 'FUNCTION' ? new RegExp(`CREATE FUNCTION public\\.${name}\\(.*?\\n\\$\\$;`, 'su') : new RegExp(`CREATE TABLE public\\.${name} \\(.*?\\n\\);`, 'su'));
  assert.ok(m, name); return m[0];
};
function build(symbol, revised = false) {
  const evidence = [{ id: 'eps', key: 'annual_eps', kind: 'fact', sourceTier: 'official', contentHash: hash(revised ? 'synthetic eps12 corrected source' : 'synthetic eps10'), value: revised ? 12 : 10, unit: 'TWD/share', period: '2026', source: 'https://synthetic-local.invalid/eps', eventAt: now, availableAt: now }, { id: 'pe', key: 'pe', kind: 'assumption', sourceTier: 'public', contentHash: hash('synthetic assumption15'), value: 15, unit: 'multiple', period: '2026', source: 'https://synthetic-local.invalid/pe', eventAt: now, availableAt: now }];
  const frozen = { symbol, eligible: true, tradingValid: true, contraindication: false, roots: ['synthetic-single-publisher'], eventAt: now, cutoff: now, evidence, gaps: ['synthetic engineering fixture, not formal financial facts'] };
  const input = { ...frozen, hash: inputHash(frozen) };
  const claim = { id: 'scenario', text: 'Synthetic test scenario, not an investment forecast.', kind: 'derived', evidenceIds: ['eps', 'pe'], numeric: { value: revised ? 180 : 150, unit: 'TWD/share', period: '2026', key: 'scenario_price', formula: { operation: 'multiply', evidenceIds: ['eps', 'pe'] } } };
  const annualClaim = { id: 'annual_eps', text: 'Synthetic original annual EPS fixture, not actual financial facts.', kind: 'fact', evidenceIds: ['eps'], numeric: { value: revised ? 12 : 10, unit: 'TWD/share', period: '2026', key: 'annual_eps' } };
  const artifact = { schemaVersion: 'stockinsider-vnext-research-v1', model: 'synthetic-no-model-executed', modelVersion: 'fixture1', inputHash: input.hash, outputHash: '', sections: Object.fromEntries(REQUIRED_SECTIONS.map(key => [key, { text: key === 'conclusion' ? (revised ? 'Synthetic revised source research conclusion' : 'Synthetic isolated research conclusion') : `Synthetic ${key} fixture; no actual author execution.`, evidenceIds: ['eps', 'pe'], claimIds: ['scenario', 'annual_eps'] }])), claims: [claim, annualClaim], quoteDate: date, valuationDate: date, annualEps: revised ? 12 : 10, nextFourQuarterEps: null, gaps: ['next_four_quarter_eps_missing', 'quote_authority_missing', 'synthetic engineering fixture'] };
  artifact.outputHash = inputHash({ ...artifact, outputHash: undefined });
  const review = { approved: true, authorOutputHash: artifact.outputHash, modelVersion: 'synthetic-independent-review-instance', findings: [], factsChecked: true, valuationChecked: true, claimsChecked: true, claimChecks: [{ claimId: 'scenario', verdict: 'supported', reason: 'Synthetic fixture source hashes and 10*15 arithmetic checked; no semantic investment approval.', sources: evidence.map(e => ({ id: e.id, contentHash: e.contentHash })) }, { claimId: 'annual_eps', verdict: 'supported', reason: 'Synthetic source-bound annual EPS comparison only; not semantic financial approval.', sources: [{ id: 'eps', contentHash: evidence[0].contentHash }] }] };
  assert.equal(validateArtifact(artifact, evidence, input.hash).valid, true); assert.deepEqual(validateReview(review, artifact, evidence), []);
  return { input, artifact, review };
}

await test('actual durable research/review/publish boundary with synthetic evidence only', { timeout: 240000 }, async t => {
  const results = [];
  const step = async (name, body) => {
    let failed = false;
    await t.test(name, async () => { try { await body(); } catch (error) { failed = true; throw error; } });
    if (failed) throw Error('vnext_dependent_native_stage_failed');
  };
  try {
    await step('candidate installs in separate private-ACL database, existing writer fence remains effective', () => {
      sql(`REVOKE ALL ON SCHEMA public FROM PUBLIC;GRANT USAGE ON SCHEMA public TO service_role;${capture('TABLE','production_writer_releases')}\n${capture('TABLE','production_write_leases')}\n${capture('FUNCTION','enforce_production_writer_fence')}`);
      sql(migration.toString());
      // Synthetic isolated new-ledger fixture; not the actual legacy fence
      // activation proof performed in vnext-legacy-fence-postgres.test.mjs.
      sql('UPDATE public.vnext_mode_v1 SET enabled=true,legacy_fenced=true');
      sql(`INSERT INTO vnext_principals_v1 VALUES('${actors.operator}','operator',true),('${actors.author}','author',true),('${actors.reviewer}','reviewer',true);INSERT INTO vnext_sessions_v1 VALUES('${priorDate}','${priorDate}T06:00:00Z',true),('${date}','${date}T06:00:00Z',true);`);
      if (budgetDate !== date) sql(`INSERT INTO vnext_sessions_v1 VALUES('${budgetDate}','${budgetDate}T06:00:00Z',false);`);
      const before = state();
      sql(`INSERT INTO production_writer_releases(release_id,writer_kind,active,activated_at) VALUES('${'a'.repeat(40)}','vps',true,clock_timestamp());`);
      sql(rpcSQL(actors.operator, 'enqueue', { symbols: [], requestKey: 'empty' })); // no writes are attempted
      sql(rpcSQL(actors.operator, 'enqueue', { symbols: ['2409'], requestKey: 'wrong-release', inputs: { '2409': build('2409').input } }), /42501.*production_writer_release_rejected|production_writer_release_rejected/su);
      assert.deepEqual(state(), before);
      sql('UPDATE production_writer_releases SET active=false;');
      save('installed-state', state());
    });
    for (const symbol of (scenario === 'revision' ? ['2409'] : ['2409', '2383'])) await step(symbol + ' exact sources/arithmetic author, distinct review and durable publication', () => {
      const data = build(symbol);
      const enqueue = rpc(actors.operator, 'enqueue', { requestKey: 'business-' + symbol, symbols: [symbol], inputs: { [symbol]: data.input } });
      const job = enqueue.jobs.find(j => j.jobId); assert.ok(job);
      const claim = rpc(actors.author, 'claim', { jobId: job.jobId }); assert.equal(claim.execute, true);
      const before = state();
      const mutant = structuredClone(data.artifact); mutant.claims[0].numeric.value++;
      mutant.outputHash = inputHash({ ...mutant, outputHash: undefined });
      sql(rpcSQL(actors.author, 'author', { jobId: job.jobId, executionId: claim.executionId, inputHash: data.input.hash, artifact: mutant }), /vnext_.*(?:formula|claim|numeric)/su);
      assert.deepEqual(state(), before);
      rpc(actors.author, 'author', { jobId: job.jobId, executionId: claim.executionId, inputHash: data.input.hash, artifact: data.artifact });
      sql(rpcSQL(actors.author, 'review-claim', { jobId: job.jobId }), /vnext_independent_reviewer_required/u);
      const reviewClaim = rpc(actors.reviewer, 'review-claim', { jobId: job.jobId }); assert.notEqual(reviewClaim.executionId, claim.executionId);
      sql(rpcSQL(actors.reviewer, 'review', { jobId: job.jobId, executionId: reviewClaim.executionId, inputHash: data.input.hash, review: data.review }), /vnext_review_binding/u);
      const originals = rpc(actors.reviewer, 'review-sources', { jobId: job.jobId, executionId: reviewClaim.executionId });
      assert.deepEqual(originals.evidence.evidence, data.input.evidence);
      rpc(actors.reviewer, 'review', { jobId: job.jobId, executionId: reviewClaim.executionId, inputHash: data.input.hash, review: data.review });
      const request = { jobId: job.jobId, executionId: reviewClaim.executionId, inputHash: data.input.hash };
      const receipt = rpc(actors.reviewer, 'publish', request); assert.equal(receipt.published, true);
      assert.equal(read(symbol).history.length, 1);
      const counters = sql(`SELECT count(*) FROM vnext_jobs_v1 WHERE started_at IS NOT NULL;`);
      const again = rpc(actors.reviewer, 'publish', request); assert.equal(again.revisionId, receipt.revisionId);
      assert.equal(sql(`SELECT count(*) FROM vnext_jobs_v1 WHERE started_at IS NOT NULL;`), counters);
      const detail = read(symbol); assert.deepEqual(detail.history[0].content, data.artifact);
      results.push({ symbol, jobId: job.jobId, receipt, artifactBytes: Buffer.byteLength(JSON.stringify(data.artifact)), artifactHash: data.artifact.outputHash, actualAuthorReviewerExecutionsDiffer: true, formalRightsOrModelExecution: false });
      save(symbol + '-publication', { result: results.at(-1), state: state() });
    });
    if (scenario === 'durable') await step('rejected review consumes attempt, exact replay does not recount, one charged retry exits after second failure', () => {
      const data = build('2412');
      const enqueue = rpc(actors.operator, 'enqueue', { requestKey: 'review-failure', symbols: ['2412'], inputs: { '2412': data.input } });
      const job = enqueue.jobs.find(j => j.jobId); assert.ok(job);
      const claim = rpc(actors.author, 'claim', { jobId: job.jobId });
      rpc(actors.author, 'author', { jobId: job.jobId, executionId: claim.executionId, inputHash: data.input.hash, artifact: data.artifact });
      const reviewer = rpc(actors.reviewer, 'review-claim', { jobId: job.jobId });
      rpc(actors.reviewer, 'review-sources', { jobId: job.jobId, executionId: reviewer.executionId });
      const review = { ...data.review, approved: false, findings: ['Synthetic contrary evidence requires a new attempt.'] };
      const request = { jobId: job.jobId, executionId: reviewer.executionId, inputHash: data.input.hash, review };
      rpc(actors.reviewer, 'review', request);
      const member = () => JSON.parse(sql("SELECT jsonb_build_object('state',state,'failures',failures)::text FROM vnext_members_v1 WHERE symbol='2412';"));
      assert.deepEqual(member(), { state: 'waiting', failures: 1 });
      const before = state(); assert.equal(rpc(actors.reviewer, 'review', request).replay, true); assert.deepEqual(state(), before);
      const retry = rpc(actors.operator, 'retry', { jobId: job.jobId }); assert.ok(retry.jobId);
      const retryAgain = rpc(actors.operator, 'retry', { jobId: job.jobId }); assert.equal(retryAgain.jobId, retry.jobId);
      const second = rpc(actors.author, 'claim', { jobId: retry.jobId }); assert.equal(second.execute, true);
      assert.equal(sql('SELECT count(*) FROM vnext_jobs_v1 WHERE started_at IS NOT NULL;'), '4');
      rpc(actors.author, 'fail', { jobId: retry.jobId, executionId: second.executionId, permanent: false, reason: 'synthetic-second-failure' });
      assert.deepEqual(member(), { state: 'exited', failures: 2 });
      sql(rpcSQL(actors.operator, 'retry', { jobId: retry.jobId }), /vnext_retry_forbidden/u);
      save('rejected-review-retry-state', state());
    });
    if (scenario === 'revision') await step('new structured source bytes create a second durable revision while fetch-clock-only repeats do no work', () => {
      const first = read('2409').history[0];
      const market = { risk: 'selective', confidence: 'limited', session: date, sourceAt: now, expiresAt: new Date(Date.now()+3600000).toISOString(), continuity: true, provenance: ['synthetic-local.invalid/shared-market'], gaps: ['synthetic market; no actual upstream acquisition'], overseas: [], sessions: [{ id: date, closeAt: date+'T06:00:00Z', completed: true }], snapshotHash: hash('synthetic-common-market') };
      rpc(actors.operator,'market',{market}); save('home-before',read()); save('detail-before',read('2409'));
      const item = { symbol:'2409',source:'ptt',root:'synthetic-shared-root',authorRoot:'synthetic-author',eventAt:now,availableAt:now,contentHash:hash('synthetic corrected source bytes') };
      assert.equal(rpc(actors.operator,'content',{items:[item]}).parsed,1);
      assert.equal(rpc(actors.operator,'content',{items:[{...item,fetchedAt:new Date().toISOString()}]}).parsed,0);
      const original=build('2409');
      const noWork=rpc(actors.operator,'enqueue',{requestKey:'fetch-clock-only',symbols:['2409'],inputs:{'2409':original.input}});
      assert.ok(noWork.jobs.every(j=>!j.jobId)); assert.equal(read('2409').history.length,1);
      const updated=build('2409',true); assert.notEqual(updated.input.hash,original.input.hash);
      const admitted=rpc(actors.operator,'enqueue',{requestKey:'actual-source-change',symbols:['2409'],inputs:{'2409':updated.input}});
      const job=admitted.jobs.find(j=>j.jobId);assert.ok(job);
      const author=rpc(actors.author,'claim',{jobId:job.jobId});
      rpc(actors.author,'author',{jobId:job.jobId,executionId:author.executionId,inputHash:updated.input.hash,artifact:updated.artifact});
      const reviewer=rpc(actors.reviewer,'review-claim',{jobId:job.jobId});
      rpc(actors.reviewer,'review-sources',{jobId:job.jobId,executionId:reviewer.executionId});
      rpc(actors.reviewer,'review',{jobId:job.jobId,executionId:reviewer.executionId,inputHash:updated.input.hash,review:updated.review});
      const published=rpc(actors.reviewer,'publish',{jobId:job.jobId,executionId:reviewer.executionId,inputHash:updated.input.hash});
      assert.notEqual(published.revisionId,first.revisionId);
      const detail=read('2409');assert.equal(detail.history.length,2);assert.deepEqual(detail.history[1],first);
      assert.deepEqual(detail.history[0].content,updated.artifact);assert.equal(read().members[0].revisionId,published.revisionId);
      assert.equal(sql('SELECT count(*) FROM vnext_jobs_v1 WHERE started_at IS NOT NULL'),'2');
      save('home',read());save('detail',detail);save('source-revision-proof',{firstRevision:first.revisionId,secondRevision:published.revisionId,oldInput:original.input.hash,newInput:updated.input.hash,sourceRows:sql('SELECT count(*) FROM vnext_content_v1'),starts:2,scope:'synthetic source bytes and actual durable DB revisions; no real-news/model or semantic content approval'});
    });
    if (scenario === 'durable') await step('exit rechecks publication, removes public active membership and retains immutable history', () => {
      rpc(actors.operator, 'exit', { symbol: '2383', reason: 'verified_contraindication', evidence: ['synthetic-public-withdrawal-receipt'] });
      const market = { risk: 'selective', confidence: 'limited', session: date, sourceAt: now, expiresAt: new Date(Date.now()+3600000).toISOString(), continuity: true, provenance: ['synthetic-local.invalid/shared-market'], gaps: ['synthetic market fixture; overseas not acquired'], overseas: [], sessions: [{ id: date, closeAt: date+'T06:00:00Z', completed: true }], snapshotHash: hash('synthetic-common-market') };
      rpc(actors.operator, 'market', { market });
      const home = read(); assert.equal(home.members.length, 1); assert.equal(home.members[0].symbol, '2409');
      save('home', home); save('detail', read('2409'));
      const oldPublication = read('2409').history;
      rpc(actors.operator, 'exit', { symbol: '2409', reason: 'verified_contraindication', evidence: ['synthetic-withdrawal'] });
      assert.equal(read().members.length, 0); assert.deepEqual(read('2409').history, oldPublication);
      const result = results.find(r => r.symbol === '2409'); const before = state();
      sql(rpcSQL(actors.reviewer, 'publish', { jobId: result.jobId, executionId: '00000000-0000-4000-8000-000000000000', inputHash: build('2409').input.hash }), /vnext_.*(?:stale|binding|approved)/su);
      assert.deepEqual(state(), before); save('post-exit-state', before);
    });
  } finally {
    save('source-seal', { migrationSha256: hash(migration), nodeVersion: process.version, fixtureSourceSha256: hash(fs.readFileSync(new URL(import.meta.url))), actualDatabase: database, scenario, container: container, sourceScope: 'synthetic fixture and inactive captured release, not formal author/reviewer/source/model approval' });
    save('query-events', events); save('results', results);
  }
});
