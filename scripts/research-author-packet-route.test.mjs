import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import ts from '../web/node_modules/typescript/lib/typescript.js';
import * as packetAdapter from '../web/src/lib/research-author-packet.ts';
import { readCompleteBody, parseCompleteRequest, runCompleteInput } from '../web/src/lib/research-complete-input.ts';
import { completeHash } from '../web/src/lib/research-complete-canonical.ts';
import { FinancialDeadline } from '../web/src/lib/research-financial-file-reader.ts';
import { authorPacketFixture } from './research-author-packet-fixture.mjs';

// Actual auth/parser/route/packet/recalculation, explicitly synthetic DB transport.
// Not compiled HTTP or platform model execution evidence.
const nativeRequire = createRequire(import.meta.url);
const credentials = { INTERNAL_API_KEY: 'isolated-packet-writer', RESEARCH_REVIEW_KEY: 'isolated-packet-review',
  CRON_SECRET: 'isolated-packet-cron', RESEARCH_TEST_KEY: 'isolated-packet-test' };
function load(file, dependencies = {}, env = credentials) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: name => name in dependencies ? dependencies[name] : nativeRequire(name),
    process: { env }, Buffer, Response, Request, Date, console });
  return exports;
}
async function fixture({ mutate, env = credentials, stall = false, fail = false } = {}) {
  const f = await authorPacketFixture(), calls = []; let clients = 0;
  const auth = load('web/src/lib/internal-auth.ts', {}, env), identity = load('web/src/lib/research-execution-binding.ts', {}, env);
  const principal = identity.resolveResearchControllerIdentity(new Request('https://example.com', {
    headers: { authorization: `Bearer ${credentials.INTERNAL_API_KEY}` },
  }), 'author', credentials).principalId;
  const privateAssignment = { ...f.assignment, controller_principal: principal, canonical_request: f.request.input };
  const db = { rpc(name, args) {
    calls.push({ name, args });
    let response;
    if (stall) response = new Promise(() => {});
    else response = Promise.resolve({ data: name === 'read_research_article_input_revision_v2' ? f.revision
      : name === 'read_research_author_assignment_v2' ? privateAssignment : f.response, error: fail ? { message: 'fixture DB unavailable' } : null });
    return Object.assign(response, { abortSignal: () => response });
  } };
  mutate?.(f);
  const assignment = load('web/src/lib/research-author-assignment.ts', {
    './internal-auth.ts': auth, './research-execution-binding.ts': identity,
    './supabase-server.ts': { getSupabaseServerClient() { clients++; return db; } },
    './research-complete-input.ts': { readCompleteBody, parseCompleteRequest, runCompleteInput },
    './research-complete-canonical.ts': { completeHash }, './research-financial-file-reader.ts': { FinancialDeadline },
    './research-author-packet.ts': packetAdapter,
  }, env);
  const route = load('web/src/app/api/internal/research-model-reservation/route.ts', {
    'next/server': { NextResponse: { json: Response.json } }, '@/lib/internal-auth': auth,
    '@/lib/supabase-server': { getSupabaseServerClient() { clients++; return db; } },
    '@/lib/research-author-assignment': assignment,
  }, env);
  const send = async (body = { action: 'readAuthorPacket', ...f.request }, token = credentials.INTERNAL_API_KEY, headers = {}) => {
    const response = await route.POST(new Request('https://example.com/api/internal/research-model-reservation', { method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'x-research-execution-version': '2', ...headers }, body: JSON.stringify(body) }));
    return { status: response.status, body: await response.json() };
  };
  return { f, calls, clients: () => clients, send };
}
test('readAuthorPacket author-only auth fails before DB; no caller principal or public-key substitute', async () => {
  for (const token of ['wrong', credentials.RESEARCH_REVIEW_KEY, credentials.RESEARCH_TEST_KEY, credentials.CRON_SECRET]) {
    const f = await fixture(); assert.equal((await f.send(undefined, token)).status, 401); assert.equal(f.clients(), 0);
  }
  const f = await fixture(); assert.equal((await f.send(undefined, credentials.INTERNAL_API_KEY, { 'x-internal-key': credentials.INTERNAL_API_KEY })).status, 401);
  assert.equal((await f.send({ action: 'readAuthorPacket', ...f.f.request, principal: 'e'.repeat(64) })).status, 400);
  assert.equal(f.clients(), 0);
});
test('existing marker2 read-only packet uses original current-input/assignment/transaction reads only', async () => {
  const f = await fixture(), response = await f.send(); assert.equal(response.status, 200); assert.equal(response.body.ok, true);
  assert.equal(response.body.packetHash, completeHash(response.body.packet));
  assert.deepEqual(f.calls.map(c => c.name), ['read_research_article_input_revision_v2', 'read_research_author_assignment_v2',
    'read_research_article_input_revision_v2', 'read_research_author_packet_v2']);
  assert.equal(response.body.dispatchReady, false); assert.equal(response.body.modelDispatched, false);
  assert.equal(JSON.stringify(response.body).includes(f.f.request.input.owner), false);
});
test('DB failure, changed sources and revision cannot emit a partial packet or retry claim', async () => {
  for (const options of [{ fail: true }, { mutate: f => { f.response.sources[0].descriptor.rowHash = 'f'.repeat(64); } },
    { mutate: f => { f.response.inputRevisionId = f.request.input.jobId; } }]) {
    const f = await fixture(options), response = await f.send(); assert.equal(response.status, 409);
    assert.equal(response.body.error, 'research_author_packet_unavailable'); assert.equal(response.body.recoveryAction, 'readAuthorPacket');
    assert.equal(response.body.retryClaim, false); assert.equal('packet' in response.body, false);
    assert.equal(f.calls.some(c => /assign_|reserve_|finish_|seal_/.test(c.name)), false);
  }
});
test('one stalled original RPC exhausts the same10-second request deadline and does not reserve or renew', async () => {
  const f = await fixture({ stall: true }), start = performance.now(), response = await f.send();
  assert.equal(response.status, 409); assert.ok(performance.now() - start < 11500);
  assert.equal(f.calls.length, 1); assert.equal(response.body.retryClaim, false);
});
