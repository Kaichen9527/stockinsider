import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { deepControllerCommand } from './research-deep-controller.mjs';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

const clock = '2026-10-05T01:01:00.000Z';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const source = 'b'.repeat(40);
const key = 'synthetic-deep-writer-12345';
const owner = 'author-test';
const context = () => ({ schemaVersion: 'research-deep-claim-context-v1', observedAt: clock,
  job: { jobId: id, symbol: '2409', priorityRunId: id, attempt: 1, owner, leaseExpiresAt: '2026-10-05T01:30:00.010Z' },
  modelReservation: { reservationId: id, role: 'company_research', owner, workKey: `deep:${id}:1`,
    startedAt: '2026-10-05T01:00:00.000Z', leaseExpiresAt: '2026-10-05T01:30:00.000Z' }, modelCompletion: null });
const success = () => ({ rejected: false, body: { ok: true, context: context(), gap: null } });
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'si-deep-'));
  const file = name => path.join(dir, name);
  const args = (action = 'claim') => [action, '--origin', 'https://example.org', '--owner', owner,
    '--output', file(`${action}.json`), '--journal', file(`${action}.jsonl`),
    ...(action === 'recover' ? ['--request-journal', file('claim.jsonl')] : [])];
  const dependencies = { env: { INTERNAL_API_KEY: key }, source: () => ({ commit: source, dirty: false }), now: () => clock };
  try { await fn({ file, args, dependencies }); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}
test('claim journals before one guarded request and saves real reservation without dispatch/publication', async () => fixture(async ({ file, args, dependencies }) => {
  let calls = 0;
  const result = await deepControllerCommand(args(), { ...dependencies, post: async (url, body, token, timeout) => {
    calls++; assert.equal(url, 'https://example.org/api/internal/research-deep-job');
    assert.deepEqual(body, { action: 'claim', owner }); assert.equal(token, key); assert.equal(timeout, 15000);
    assert.match(await fs.readFile(file('claim.jsonl'), 'utf8'), /request_pending/); return success();
  } });
  assert.equal(calls, 1); assert.deepEqual(result.context, context());
  const { receiptHash, ...material } = result; assert.equal(receiptHash, researchCanonicalHash(material));
  for (const field of ['modelDispatchable', 'draftPersisted', 'authoritativePublication', 'strategyApproved', 'automaticRetry', 'recoveryMutatesLease'])
    assert.equal(result[field], false);
  assert.equal(result.modelCalls, 0);
  for (const name of ['claim.json', 'claim.jsonl']) {
    assert.equal((await fs.stat(file(name))).mode & 0o777, 0o600);
    assert.equal((await fs.readFile(file(name), 'utf8')).includes(key), false);
  }
}));
test('lost claim response recovers owner status once instead of claiming a second slot', async () => fixture(async ({ file, args, dependencies }) => {
  let calls = 0;
  await assert.rejects(deepControllerCommand(args(), { ...dependencies, post: async () => { calls++; throw new Error(`lost:${key}`); } }), /uncertain_recover_status/);
  assert.equal(calls, 1); assert.match(await fs.readFile(file('claim.jsonl'), 'utf8'), /outcome_uncertain/);
  const result = await deepControllerCommand(args('recover'), { ...dependencies, post: async (_url, body) => {
    calls++; assert.deepEqual(body, { action: 'status', owner }); return success();
  } });
  assert.equal(calls, 2); assert.deepEqual(result.context, context());
  assert.equal(result.context.modelReservation.startedAt, context().modelReservation.startedAt);
}));
test('completed accounting remains a handoff, and exact known attempt fences status recovery', async () => fixture(async ({ args, dependencies }) => {
  const reply = success(); reply.body.context.modelCompletion = { outcome: 'completed', resultHash: 'c'.repeat(64), completedAt: '2026-10-05T01:00:30Z' };
  await deepControllerCommand(args(), { ...dependencies, post: async () => reply });
  const result = await deepControllerCommand(args('recover'), { ...dependencies, post: async (_url, body) => {
    assert.deepEqual(body, { action: 'status', owner, jobId: id, attempt: 1 }); return reply;
  } });
  assert.equal(result.context.modelCompletion.outcome, 'completed');
  assert.equal(result.draftPersisted, false); assert.equal(result.authoritativePublication, false);
}));
test('empty claim and expired/lost owned job have different explicit gaps', async () => fixture(async ({ args, dependencies }) => {
  const first = await deepControllerCommand(args(), { ...dependencies, post: async () => ({ rejected: false, body: { ok: true, context: null, gap: 'no_claimable_job' } }) });
  assert.equal(first.gap, 'no_claimable_job');
  const second = await deepControllerCommand(args('recover'), { ...dependencies, post: async () => ({ rejected: false, body: { ok: true, context: null, gap: 'no_active_owned_job' } }) });
  assert.equal(second.gap, 'no_active_owned_job'); assert.equal(second.modelDispatchable, false);
}));
test('claim server rejection remains uncertain because RPC may already have committed', async () => fixture(async ({ file, args, dependencies }) => {
  let calls = 0;
  await assert.rejects(deepControllerCommand(args(), { ...dependencies, post: async () => { calls++; return { rejected: true, status: 409, secret: key }; } }), /uncertain_recover_status/);
  assert.equal(calls, 1); const saved = await fs.readFile(file('claim.jsonl'), 'utf8');
  assert.match(saved, /server_rejected/); assert.match(saved, /outcome_uncertain/); assert.equal(saved.includes(key), false);
}));
test('foreign owner, wrong role, extended deadline, changed attempt, stale clock and extra secrets fail closed', async () => {
  for (const mutate of [
    row => { row.job.owner = 'foreign'; }, row => { row.modelReservation.role = 'counter_review'; },
    row => { row.modelReservation.leaseExpiresAt = '2026-10-05T02:00:00Z'; },
    row => { row.job.attempt = 2; }, row => { row.observedAt = '2026-10-05T00:58:59Z'; },
    row => { row.secret = key; }, row => { row.job.symbol = 2409; },
  ]) await fixture(async ({ args, dependencies }) => {
    const reply = success(); mutate(reply.body.context);
    await assert.rejects(deepControllerCommand(args(), { ...dependencies, post: async () => reply }), /uncertain_recover_status/);
  });
});
test('recovery binds original owner, origin, source and saved receipt before requests', async () => {
  for (const field of ['owner', 'origin', 'source', 'receipt']) await fixture(async ({ file, args, dependencies }) => {
    await deepControllerCommand(args(), { ...dependencies, post: async () => success() });
    let recoveryArgs = args('recover'); let recoveryDeps = { ...dependencies }; let calls = 0;
    if (field === 'owner') recoveryArgs[4] = 'another-author';
    if (field === 'origin') recoveryArgs[2] = 'https://other.example';
    if (field === 'source') recoveryDeps.source = () => ({ commit: 'c'.repeat(40), dirty: false });
    if (field === 'receipt') {
      const entries = (await fs.readFile(file('claim.jsonl'), 'utf8')).trim().split('\n').map(JSON.parse);
      entries.find(row => row.phase === 'response_verified').saved.context.job.attempt = 2;
      await fs.writeFile(file('claim.jsonl'), entries.map(row => JSON.stringify(row)).join('\n') + '\n');
    }
    await assert.rejects(deepControllerCommand(recoveryArgs, { ...recoveryDeps, post: async () => { calls++; return success(); } }), /recovery_/);
    assert.equal(calls, 0);
  });
});
test('recovery rejects symlinks, public permissions and truncated journals', async () => {
  for (const mode of ['symlink', 'public', 'truncated']) await fixture(async ({ file, args, dependencies }) => {
    await deepControllerCommand(args(), { ...dependencies, post: async () => success() });
    if (mode === 'symlink') { await fs.rename(file('claim.jsonl'), file('original')); await fs.symlink(file('original'), file('claim.jsonl')); }
    if (mode === 'public') await fs.chmod(file('claim.jsonl'), 0o644);
    if (mode === 'truncated') await fs.writeFile(file('claim.jsonl'), '{}');
    let calls = 0;
    await assert.rejects(deepControllerCommand(args('recover'), { ...dependencies, post: async () => { calls++; return success(); } }));
    assert.equal(calls, 0);
  });
});
test('unsafe origins, dirty source, shared key, caller stock selection and invalid owner send nothing', async () => fixture(async ({ args, dependencies }) => {
  let calls = 0; const post = async () => { calls++; return success(); };
  for (const origin of ['http://5.104.83.211', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org/?key=x']) {
    const invalid = args(); invalid[2] = origin;
    await assert.rejects(deepControllerCommand(invalid, { ...dependencies, post }), /origin_invalid/);
  }
  await assert.rejects(deepControllerCommand([...args(), '--symbol', '2409'], { ...dependencies, post }), /arguments_invalid/);
  const invalid = args(); invalid[4] = 'name.with.dot';
  await assert.rejects(deepControllerCommand(invalid, { ...dependencies, post }), /owner_invalid/);
  await assert.rejects(deepControllerCommand(args(), { ...dependencies, post, source: () => ({ commit: source, dirty: true }) }), /clean_source/);
  await assert.rejects(deepControllerCommand(args(), { ...dependencies, post, env: { INTERNAL_API_KEY: key, RESEARCH_REVIEW_KEY: key } }), /distinct_writer/);
  assert.equal(calls, 0);
}));
test('existing destination preserves prior receipt and prevents mutation', async () => fixture(async ({ file, args, dependencies }) => {
  await fs.writeFile(file('claim.json'), 'original'); let calls = 0;
  await assert.rejects(deepControllerCommand(args(), { ...dependencies, post: async () => { calls++; return success(); } }), /output_unavailable/);
  assert.equal(calls, 0); assert.equal(await fs.readFile(file('claim.json'), 'utf8'), 'original');
}));
test('actual local HTTP lost response recovers identical reservation without a second claim', async () => fixture(async ({ args, dependencies }) => {
  let claims = 0; let statuses = 0;
  const server = createServer(async (request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${key}`);
    let raw = ''; for await (const chunk of request) raw += chunk;
    const body = JSON.parse(raw);
    if (body.action === 'claim') { claims++; request.socket.destroy(); return; }
    assert.equal(body.action, 'status'); statuses++;
    response.writeHead(200, { 'content-type': 'application/json' }); response.end(JSON.stringify(success().body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const claimArgs = args(); claimArgs[2] = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(deepControllerCommand(claimArgs, dependencies), /uncertain_recover_status/);
    const recoveredArgs = args('recover'); recoveredArgs[2] = claimArgs[2];
    const result = await deepControllerCommand(recoveredArgs, dependencies);
    assert.equal(claims, 1); assert.equal(statuses, 1); assert.equal(result.context.modelReservation.reservationId, id);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
