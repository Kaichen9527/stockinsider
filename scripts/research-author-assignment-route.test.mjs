import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import { readCompleteBody, parseCompleteRequest } from '../web/src/lib/research-complete-input.ts';
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { FinancialDeadline } from '../web/src/lib/research-financial-file-reader.ts';

// Actual route/auth/identity/body parser/assignment adapter; DB and current-input
// transport are fixtures. This is not compiled HTTP, PostgreSQL or model proof.
const nativeRequire = createRequire(import.meta.url);
const uuid = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const env = { INTERNAL_API_KEY: 'isolated-author', RESEARCH_REVIEW_KEY: 'isolated-review',
  CRON_SECRET: 'isolated-cron', RESEARCH_TEST_KEY: 'isolated-test' };
const input = { owner: 'original-owner', jobId: uuid(1), attempt: 1, reservationId: uuid(2),
  scope: 'research_observed_v1', snapshotHash: 'a'.repeat(64), preparationId: uuid(3),
  preparationHash: 'b'.repeat(64), expectedArtifactManifestHash: 'c'.repeat(64), expectedCalculatorExecutionHash: 'd'.repeat(64) };
const packet = { action: 'assignAuthor', input, inputRevisionId: uuid(4), inputHash: 'e'.repeat(64) };
function load(file, deps = {}, credentials = env) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => name in deps ? deps[name] : nativeRequire(name),
    process: { env: credentials }, Buffer, Response, Request, Date, console });
  return exports;
}
function fixture({ credentials = env, currentFailure = false, rpcFailure = false, savedChange, currentChange } = {}) {
  const calls = []; let dbReads = 0;
  const auth = load('web/src/lib/internal-auth.ts', {}, credentials);
  const identity = load('web/src/lib/research-execution-binding.ts', {}, credentials);
  const revision = { status: 'sealed', revision_id: packet.inputRevisionId, input_hash: packet.inputHash,
    research_company_id: uuid(5), canonical_payload: { originalJob: { leaseExpiresAt: '2026-10-09T10:30:00.123456+00:00' },
      originalReservation: { startedAt: '2026-10-09T10:00:00.123456+00:00', leaseExpiresAt: '2026-10-09T10:30:00.123456+00:00' } } };
  currentChange?.(revision);
  const principal = identity.resolveResearchControllerIdentity(new Request('https://example.invalid', {
    headers: { authorization: `Bearer ${env.INTERNAL_API_KEY}` },
  }), 'author', env).principalId;
  const saved = { assignment_id: uuid(6), job_id: input.jobId, attempt: input.attempt,
    reservation_id: input.reservationId, input_revision_id: packet.inputRevisionId, input_hash: packet.inputHash,
    research_company_id: uuid(5), snapshot_hash: input.snapshotHash, controller_principal: principal,
    work_owner: input.owner, canonical_request: input, assigned_at: '2026-10-09T10:00:01.123456+00:00',
    reservation_started_at: '2026-10-09T10:00:00.123456+00:00', reservation_expires_at: '2026-10-09T10:30:00.123456+00:00',
    original_job_deadline: '2026-10-09T10:30:00.123456+00:00' };
  savedChange?.(saved);
  let persisted = false;
  const db = { rpc(name, args) {
    calls.push({ name, args });
    const result = Promise.resolve().then(() => {
      if (name === 'assign_research_author_v2') { persisted = true; if (rpcFailure) throw new Error('lost_response'); }
      return { data: persisted ? saved : null, error: null };
    });
    return Object.assign(result, { abortSignal(signal) { assert.equal(signal.aborted, false); return result; } });
  } };
  const adapter = load('web/src/lib/research-author-assignment.ts', {
    './internal-auth.ts': auth, './research-execution-binding.ts': identity,
    './supabase-server.ts': { getSupabaseServerClient() { dbReads++; return db; } },
    './research-complete-input.ts': { readCompleteBody, parseCompleteRequest,
      async runCompleteInput(dbArg, request, seal, deadline) {
        assert.equal(dbArg, db); assert.deepEqual(request, input); assert.equal(seal, false); deadline.check();
        calls.push({ name: 'current_compiled_input_read' });
        if (currentFailure) throw new Error('mapping_or_source_or_original_lease_changed'); return revision;
      } },
    './research-complete-canonical.ts': { completeHash }, './research-financial-file-reader.ts': { FinancialDeadline },
  }, credentials);
  const route = load('web/src/app/api/internal/research-model-reservation/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/internal-auth': auth,
    '@/lib/supabase-server': { getSupabaseServerClient() { dbReads++; return db; } },
    '@/lib/research-author-assignment': adapter,
  }, credentials);
  async function send(body = packet, headers = {}, token = env.INTERNAL_API_KEY) {
    const request = new Request('https://example.invalid/api/internal/research-model-reservation', { method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-research-execution-version': '2', ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body) });
    const response = await route.POST(request); return { status: response.status, body: await response.json() };
  }
  return { send, calls, saved, principal, dbReads: () => dbReads };
}

test('v2 assignment is writer-only, exact bearer, distinct from reviewer/test/cron; no DB work on denial', async () => {
  for (const [headers, token] of [[{}, 'wrong'], [{}, env.RESEARCH_REVIEW_KEY], [{}, env.RESEARCH_TEST_KEY],
    [{}, env.CRON_SECRET], [{ 'x-internal-key': env.INTERNAL_API_KEY }, env.INTERNAL_API_KEY], [{ authorization: env.INTERNAL_API_KEY }, env.INTERNAL_API_KEY]]) {
    const f = fixture(); const r = await f.send(packet, headers, token);
    assert.equal(r.status, 401); assert.equal(f.dbReads(), 0); assert.equal(f.calls.length, 0);
  }
  for (const credentials of [{ ...env, RESEARCH_REVIEW_KEY: env.INTERNAL_API_KEY }, { ...env, CRON_SECRET: env.INTERNAL_API_KEY },
    { ...env, CRON_SECRET: env.RESEARCH_REVIEW_KEY }, { ...env, RESEARCH_TEST_KEY: env.INTERNAL_API_KEY },
    { ...env, STRATEGY_APPROVAL_KEY: env.INTERNAL_API_KEY }, { ...env, RESEARCH_TEST_KEY: env.RESEARCH_REVIEW_KEY },
    { ...env, STRATEGY_APPROVAL_KEY: env.RESEARCH_REVIEW_KEY }, { INTERNAL_API_KEY: env.INTERNAL_API_KEY }]) {
    const f = fixture({ credentials }); assert.equal((await f.send()).status, 401); assert.equal(f.dbReads(), 0);
  }
});
test('closed marker, body keys, original input shape and bounded streaming parser reject before DB', async () => {
  const bad = [{ ...packet, principal: 'f'.repeat(64) }, { ...packet, authorId: 'author' }, { ...packet, role: 'company_research' },
    { ...packet, action: 'finish' }, { ...packet, inputRevisionId: 'bad' }, { ...packet, inputHash: 'bad' },
    { ...packet, input: { ...input, owner: 'bad space' } }, { ...packet, input: { ...input, authorId: 'author' } },
    JSON.stringify(packet).replace('"action":', '"action":"assignAuthor","action":'), ' '.repeat(8193), '{}', '[]'];
  for (const body of bad) { const f = fixture(); assert.equal((await f.send(body)).status, 400); assert.equal(f.dbReads(), 0); }
  const f = fixture(); assert.equal((await f.send(packet, { 'x-research-execution-version': '3' })).status, 400);
  assert.equal((await f.send(packet, { 'content-type': 'text/plain' })).status, 400); assert.equal(f.dbReads(), 0);
});
test('current compiled validated read precedes assignment, principal is server derived, private fields omitted', async () => {
  const f = fixture(); const r = await f.send(); assert.equal(r.status, 200); assert.equal(r.body.ok, true);
  assert.equal(r.body.dispatchReady, false); assert.equal(r.body.modelDispatched, false);
  assert.deepEqual(f.calls.map(c => c.name), ['current_compiled_input_read', 'assign_research_author_v2']);
  assert.equal(f.calls[1].args.p_principal, f.principal); assert.equal(f.calls[1].args.p_revision_id, packet.inputRevisionId);
  assert.equal(r.body.assignment.original_job_deadline, f.saved.original_job_deadline);
  assert.equal(r.body.assignment.reservation_started_at, f.saved.reservation_started_at);
  assert.equal('controller_principal' in r.body.assignment, false); assert.equal('canonical_request' in r.body.assignment, false);
  assert.equal(JSON.stringify(r.body).includes(f.principal), false);
});
test('exact read is null before admission; response-loss recovery reads same immutable assignment without reservation', async () => {
  const f = fixture({ rpcFailure: true }); const read = { ...packet, action: 'readAuthorAssignment' };
  const before = await f.send(read); assert.equal(before.status, 200); assert.equal(before.body.assignment, null);
  const lost = await f.send(); assert.equal(lost.status, 409); assert.equal(lost.body.outcome, 'uncertain');
  assert.equal(lost.body.recoveryAction, 'readAuthorAssignment'); assert.equal(lost.body.retryClaim, false);
  const recovered = await f.send(read); assert.equal(recovered.status, 200);
  assert.equal(recovered.body.assignment.assignment_id, f.saved.assignment_id);
  assert.deepEqual(f.calls.filter(c => c.name !== 'current_compiled_input_read').map(c => c.name),
    ['read_research_author_assignment_v2', 'assign_research_author_v2', 'read_research_author_assignment_v2']);
});
test('current mapping/source/lease rejection or wrong sealed revision cannot call assignment RPC', async () => {
  for (const config of [{ currentFailure: true }, { currentChange: r => { r.status = 'absent'; } },
    { currentChange: r => { r.revision_id = uuid(99); } }, { currentChange: r => { r.input_hash = 'f'.repeat(64); } }]) {
    for (const action of ['assignAuthor', 'readAuthorAssignment']) {
      const f = fixture(config); assert.equal((await f.send({ ...packet, action })).status, 409);
      assert.deepEqual(f.calls.map(c => c.name), ['current_compiled_input_read']);
    }
  }
});
test('unexpected DB bindings cannot return successful assignment or leak principal', async () => {
  for (const key of ['assignment_id', 'job_id', 'attempt', 'reservation_id', 'input_revision_id', 'input_hash',
    'research_company_id', 'snapshot_hash', 'controller_principal', 'work_owner', 'canonical_request',
    'assigned_at', 'reservation_started_at', 'reservation_expires_at', 'original_job_deadline']) {
    const f = fixture({ savedChange: row => { row[key] = null; } }); const r = await f.send();
    assert.equal(r.status, 409, key); assert.equal(JSON.stringify(r.body).includes(f.principal), false);
  }
  const f = fixture({ savedChange: row => { row.unexpectedAuthority = true; } }); assert.equal((await f.send()).status, 409);
});

test('unmarked v1 reserve keeps original role separation and does not invoke v2 assignment', async () => {
  const auth = load('web/src/lib/internal-auth.ts'); const calls = [];
  const route = load('web/src/app/api/internal/research-model-reservation/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/internal-auth': auth,
    '@/lib/supabase-server': { getSupabaseServerClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args }); return { error: null, data: [{ reservation_id: uuid(7) }] };
    } }) },
    '@/lib/research-author-assignment': { handleResearchAuthorAssignment() { assert.fail('unmarked v1 must not invoke v2'); } },
  });
  for (const [token, allowed, denied] of [[env.INTERNAL_API_KEY, 'technical', 'company_research'],
    [env.RESEARCH_REVIEW_KEY, 'counter_review', 'technical'], [env.RESEARCH_TEST_KEY, 'independent_test', 'counter_review']]) {
    for (const [role, status] of [[allowed, 200], [denied, 400]]) {
      const response = await route.POST(new Request('https://example.invalid', { method: 'POST', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json',
      }, body: JSON.stringify({ action: 'reserve', owner: input.owner, role, workKey: 'original-work' }) }));
      assert.equal(response.status, status);
    }
  }
  assert.deepEqual(calls.map(c => c.name), Array(3).fill('reserve_research_model_v1'));
  const response = await route.POST(new Request('https://example.invalid', { method: 'POST', headers: {
    authorization: `Bearer ${env.INTERNAL_API_KEY}`, 'content-type': 'application/json',
  }, body: JSON.stringify({ ...packet, owner: input.owner }) }));
  assert.equal(response.status, 400); assert.equal(calls.length, 3);
});
