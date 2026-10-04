import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { cloudArticleFixture } from './fixtures/research-cloud-article.ts';
import * as cloud from '../web/src/lib/research-cloud-work.ts';
import * as deep from '../web/src/lib/research-deep-article.ts';
const now = '2026-10-04T00:10:00Z';
function fixture() {
  const { schemaVersion: _schema, workHash: _hash, ...input } = cloudArticleFixture();
  input.dataScope = 'research_snapshot'; input.deadlineAt = '2026-10-04T00:30:00Z';
  const work = cloud.createCloudWork(input);
  const result = cloud.createCloudResult({ work, sourceCommit: work.sourceCommit,
    startedAt: '2026-10-04T00:01:00Z', completedAt: now, status: 'completed', output: cloud.recomputeCloudArticle(work, now) });
  return { work, result };
}
async function run({ pair = fixture(), authorized = true, sourceRevoked = false, mismatch = false, completion = null,
  time = now, dbExpired = false } = {}) {
  const calls = [];
  const reservation = { reservation_id: pair.work.reservationId, role: pair.work.role, owner: pair.work.owner,
    work_key: mismatch ? 'another' : cloud.cloudReservationWorkKey(pair.work), started_at: pair.work.issuedAt, lease_expires_at: pair.work.deadlineAt };
  const db = { from(table) {
    const value = { data: table === 'research_model_reservations_v1' ? reservation : completion, error: null };
    const q = { then: (resolve, reject) => Promise.resolve(value).then(resolve, reject), maybeSingle: async () => value };
    for (const method of ['select', 'eq']) q[method] = () => q;
    return q;
  }, rpc: async (name, args) => { calls.push({ name, args }); return { data: !dbExpired, error: null }; } };
  const deps = { 'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status || 200 }) } },
    '@/lib/internal-auth': { requireInternalAuth: () => ({ ok: authorized, authSource: authorized ? 'research_test_key' : 'internal_key' }) },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db }, '@/lib/research-cloud-work': cloud,
    '@/lib/research-deep-article': deep, '@/lib/research-deep-evidence': { loadDeepArticleEvidence: async () =>
      pair.work.input.documents.map((d) => ({ ...d, retracted: sourceRevoked })) } };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return Date.parse(time); } }
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-cloud-result/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022 } }).outputText, { exports, require: (name) => { assert.ok(name in deps, name); return deps[name]; },
    Date: Clock, Buffer, JSON });
  const response = await exports.POST(new Request('http://localhost/api/internal/research-cloud-result', { method: 'POST',
    headers: { authorization: 'Bearer test-controller' }, body: JSON.stringify(pair) }));
  return { response, calls };
}
test('Cloud receive requires distinct tester auth and completes the existing reservation, never publishes', async () => {
  const denied = await run({ authorized: false }); assert.equal(denied.response.status, 401); assert.equal(denied.calls.length, 0);
  const accepted = await run(); assert.equal(accepted.response.status, 200);
  assert.equal(accepted.calls[0].name, 'finish_research_model_v1'); assert.equal(accepted.response.body.authoritativePublication, false);
  assert.equal(accepted.response.body.strategyApproved, false);
});
test('withdrawal, incorrect live binding, expiry during persistence and synthetic packets reject before acceptance', async () => {
  for (const option of [{ sourceRevoked: true }, { mismatch: true }, { dbExpired: true },
    { time: '2026-10-04T00:30:00Z' }]) assert.equal((await run(option)).response.status, 409);
  const pair = fixture(); pair.work = cloudArticleFixture();
  assert.equal((await run({ pair })).response.status, 409);
});
test('durable identical replay survives expiry; changed bytes do not recreate a completion', async () => {
  const pair = fixture();
  const completion = { owner: pair.work.owner, outcome: pair.result.status, result_hash: pair.result.resultHash };
  const replay = await run({ pair, completion, time: '2026-10-05T00:10:00Z', sourceRevoked: true });
  assert.equal(replay.response.status, 200); assert.equal(replay.response.body.idempotentReplay, true); assert.equal(replay.calls.length, 0);
  pair.result.output.changed = true;
  assert.equal((await run({ pair, completion, time: '2026-10-05T00:10:00Z' })).response.status, 409);
});
