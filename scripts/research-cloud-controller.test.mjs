import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createServer } from 'node:http';
import { cloudControllerCommand } from './research-cloud-controller.mjs';
import { cloudArticleFixture } from './fixtures/research-cloud-article.ts';
import { createCloudWork, createCloudResult, recomputeCloudArticle, verifyCloudResult } from '../web/src/lib/research-cloud-work.ts';

const clock = '2026-10-05T01:00:00.000Z';
const key = 'synthetic-independent-key-12345';
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'si-controller-'));
  try {
    const original = cloudArticleFixture('a'.repeat(40), clock);
    const { schemaVersion: _schema, workHash: _hash, reservationId: _reservation, issuedAt: _issued, deadlineAt: _deadline, ...input } = original;
    input.dataScope = 'research_snapshot'; // Synthetic transport test, not live research evidence.
    const file = name => path.join(dir, name);
    await fs.writeFile(file('input.json'), JSON.stringify(input));
    const args = ['reserve', '--origin', 'https://example.org', '--input', file('input.json'), '--output', file('work.json'), '--journal', file('reserve.jsonl')];
    const deps = { env: { RESEARCH_TEST_KEY: key }, source: () => ({ commit: 'a'.repeat(40), dirty: false }), now: () => clock };
    const response = body => ({ ok: true, reservation: { reservation_id: original.reservationId,
      started_at: clock, lease_expires_at: '2026-10-05T01:30:00.000Z', role: body.role, owner: body.owner, work_key: body.workKey } });
    await fn({ file, input, original, args, deps, response });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('reserve binds server lease and persists original credential-free packet before Cloud dispatch', async () => fixture(async ({ file, args, deps, response }) => {
  let calls = 0;
  const prepared = await cloudControllerCommand(args, { ...deps, post: async (url, body, token) => {
    calls++; assert.equal(url, 'https://example.org/api/internal/research-model-reservation');
    assert.equal(token, key); return response(body);
  } });
  assert.equal(calls, 1); assert.equal(prepared.prepared, true); assert.equal(prepared.automaticRetry, false);
  const work = JSON.parse(await fs.readFile(file('work.json')));
  assert.equal(work.issuedAt, clock); assert.equal(work.deadlineAt, '2026-10-05T01:30:00.000Z');
  assert.equal((await fs.stat(file('work.json'))).mode & 0o777, 0o600);
  const journal = await fs.readFile(file('reserve.jsonl'), 'utf8');
  assert.equal(journal.includes(key), false); assert.match(journal, /response_verified/);
  const result = createCloudResult({ work, sourceCommit: work.sourceCommit, startedAt: clock, completedAt: clock,
    status: 'completed', output: recomputeCloudArticle(work, clock) });
  await fs.writeFile(file('result.json'), JSON.stringify(result));
  const accept = ['accept', '--origin', 'http://127.0.0.1:3200', '--work', file('work.json'), '--result', file('result.json'), '--output', file('receipt.json'), '--journal', file('accept.jsonl')];
  const accepted = await cloudControllerCommand(accept, { ...deps, post: async (url, body, token) => {
    assert.equal(url, 'http://127.0.0.1:3200/api/internal/research-cloud-result'); assert.equal(token, key);
    assert.equal(body.work.workHash, work.workHash);
    return { ok: true, handoff: verifyCloudResult(work, result, clock), idempotentReplay: false,
      authoritativePublication: false, strategyApproved: false, arbitraryServerField: key };
  } });
  assert.equal(accepted.receiptSaved, true); assert.equal(accepted.authoritativePublication, false);
  assert.equal((await fs.readFile(file('receipt.json'), 'utf8')).includes(key), false);
}));

test('offline/ambiguous reserve is attempted once, durably marked, and cannot reuse journal or output', async () => fixture(async ({ file, args, deps }) => {
  let calls = 0;
  const post = async () => { calls++; throw new Error(`network ${key}`); };
  await assert.rejects(cloudControllerCommand(args, { ...deps, post }), /outcome_uncertain/);
  assert.equal(calls, 1);
  const journal = await fs.readFile(file('reserve.jsonl'), 'utf8');
  assert.match(journal, /outcome_uncertain/); assert.equal(journal.includes(key), false);
  await assert.rejects(cloudControllerCommand(args, { ...deps, post }), /EEXIST/);
  assert.equal(calls, 1); assert.equal((await fs.stat(file('work.json'))).size, 0);
}));

test('existing output blocks mutation and records not_sent', async () => fixture(async ({ file, args, deps }) => {
  await fs.writeFile(file('work.json'), 'preserved');
  let calls = 0;
  await assert.rejects(cloudControllerCommand(args, { ...deps, post: async () => { calls++; } }), /output_unavailable/);
  assert.equal(calls, 0); assert.equal(await fs.readFile(file('work.json'), 'utf8'), 'preserved');
  assert.match(await fs.readFile(file('reserve.jsonl'), 'utf8'), /not_sent/);
}));

test('global budget/lease denial is explicit without invented reservation or retry', async () => fixture(async ({ file, args, deps }) => {
  const reply = await cloudControllerCommand(args, { ...deps, post: async () => ({ ok: true, reservation: null, blockedReason: 'global_lease_or_daily_budget_exhausted' }) });
  assert.equal(reply.prepared, false); assert.equal(reply.automaticRetry, false);
  assert.equal((await fs.stat(file('work.json'))).size, 0);
  assert.match(await fs.readFile(file('reserve.jsonl'), 'utf8'), /"phase":"blocked"/);
}));

test('mismatched reservation owner cannot produce a dispatchable packet', async () => fixture(async ({ file, args, deps, response }) => {
  await assert.rejects(cloudControllerCommand(args, { ...deps, post: async (_url, body) => {
    const reply = response(body); reply.reservation.owner = 'other-controller'; return reply;
  } }), /outcome_uncertain/);
  assert.equal((await fs.stat(file('work.json'))).size, 0);
}));

test('untrusted transport, duplicate keys, shared credentials and dirty source reject before request', async () => fixture(async ({ args, deps }) => {
  let calls = 0; const post = async () => { calls++; };
  for (const origin of ['http://5.104.83.211', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org/?token=x']) {
    const bad = [...args]; bad[2] = origin;
    await assert.rejects(cloudControllerCommand(bad, { ...deps, post }), /origin_invalid/);
  }
  await assert.rejects(cloudControllerCommand([...args, '--input', '/tmp/other'], { ...deps, post }), /arguments_invalid/);
  await assert.rejects(cloudControllerCommand(args, { ...deps, post, env: { RESEARCH_TEST_KEY: key, INTERNAL_API_KEY: key } }), /distinct_tester/);
  await assert.rejects(cloudControllerCommand(args, { ...deps, post, source: () => ({ commit: 'a'.repeat(40), dirty: true }) }), /exact_clean_source/);
  assert.equal(calls, 0);
}));

test('Taipei day overflow and synthetic scope cannot claim live budget', async () => fixture(async ({ file, input, args, deps }) => {
  let calls = 0; const post = async () => { calls++; };
  await assert.rejects(cloudControllerCommand(args, { ...deps, post, now: () => '2026-10-05T15:45:00.000Z' }), /binding_invalid/);
  input.dataScope = 'synthetic_acceptance'; await fs.writeFile(file('input.json'), JSON.stringify(input));
  await assert.rejects(cloudControllerCommand(args, { ...deps, post }), /live_validation_only/);
  assert.equal(calls, 0);
}));

test('tampered result is rejected locally before send, late identical replay requires server confirmation', async () => fixture(async ({ file, input, original, deps }) => {
  const work = createCloudWork({ ...input, reservationId: original.reservationId, issuedAt: clock, deadlineAt: '2026-10-05T01:30:00.000Z' });
  await fs.writeFile(file('work.json'), JSON.stringify(work));
  const result = createCloudResult({ work, sourceCommit: work.sourceCommit, startedAt: clock, completedAt: clock, status: 'completed', output: recomputeCloudArticle(work, clock) });
  const args = ['accept', '--origin', 'https://example.org', '--work', file('work.json'), '--result', file('result.json'), '--output', file('receipt.json'), '--journal', file('accept.jsonl')];
  await fs.writeFile(file('result.json'), JSON.stringify({ ...result, resultHash: 'f'.repeat(64) }));
  let calls = 0;
  await assert.rejects(cloudControllerCommand(args, { ...deps, post: async () => { calls++; } }), /hash_mismatch/);
  assert.equal(calls, 0);
  await fs.writeFile(file('result.json'), JSON.stringify(result));
  const response = await cloudControllerCommand(args, { ...deps, now: () => '2026-10-05T02:00:00.000Z', post: async () => {
    calls++; return { ok: true, handoff: verifyCloudResult(work, result, clock), idempotentReplay: true, authoritativePublication: false, strategyApproved: false };
  } });
  assert.equal(response.receiptSaved, true); assert.equal(calls, 1);
}));

test('real loopback transport posts only to existing guarded route and refuses redirect', async () => fixture(async ({ file, args, deps, response }) => {
  let observed; let redirected = 0;
  const server = createServer(async (request, reply) => {
    if (request.url === '/redirected') { redirected++; reply.end('{}'); return; }
    let text = ''; for await (const bytes of request) text += bytes.toString();
    observed = { method: request.method, route: request.url, authorization: request.headers.authorization, body: JSON.parse(text) };
    reply.writeHead(302, { location: '/redirected' }); reply.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const real = [...args]; real[2] = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(cloudControllerCommand(real, deps), /outcome_uncertain/);
    assert.equal(redirected, 0); assert.equal(observed.route, '/api/internal/research-model-reservation');
    assert.equal(observed.method, 'POST'); assert.equal(observed.authorization, `Bearer ${key}`);
    server.removeAllListeners('request');
    server.on('request', async (request, reply) => {
      let text = ''; for await (const bytes of request) text += bytes.toString();
      reply.setHeader('content-type', 'application/json'); reply.end(JSON.stringify(response(JSON.parse(text))));
    });
    real[6] = file('second-work.json'); real[8] = file('second-reserve.jsonl');
    assert.equal((await cloudControllerCommand(real, deps)).prepared, true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));

test('real transport bounds oversized response and preserves uncertain receipt without retry', async () => fixture(async ({ file, args, deps }) => {
  let requests = 0;
  const server = createServer(async (request, reply) => {
    for await (const _chunk of request) { /* Consume finite request. */ }
    requests++; reply.end(' '.repeat(4_000_001));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const real = [...args]; real[2] = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(cloudControllerCommand(real, deps), /outcome_uncertain/);
    assert.equal(requests, 1); assert.equal((await fs.stat(file('work.json'))).size, 0);
    assert.match(await fs.readFile(file('reserve.jsonl'), 'utf8'), /outcome_uncertain/);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));

test('receiver cannot substitute role or strategy authority while reusing hashes', async () => fixture(async ({ file, input, original, deps }) => {
  const work = createCloudWork({ ...input, reservationId: original.reservationId, issuedAt: clock, deadlineAt: '2026-10-05T01:30:00.000Z' });
  const result = createCloudResult({ work, sourceCommit: work.sourceCommit, startedAt: clock, completedAt: clock, status: 'completed', output: recomputeCloudArticle(work, clock) });
  await fs.writeFile(file('work.json'), JSON.stringify(work)); await fs.writeFile(file('result.json'), JSON.stringify(result));
  const args = ['accept', '--origin', 'https://example.org', '--work', file('work.json'), '--result', file('result.json'), '--output', file('receipt.json'), '--journal', file('accept.jsonl')];
  await assert.rejects(cloudControllerCommand(args, { ...deps, post: async () => ({ ok: true,
    handoff: { ...verifyCloudResult(work, result, clock), role: 'strategy_research' }, idempotentReplay: false,
    authoritativePublication: false, strategyApproved: false }) }), /outcome_uncertain/);
  assert.equal((await fs.stat(file('receipt.json'))).size, 0);
}));
