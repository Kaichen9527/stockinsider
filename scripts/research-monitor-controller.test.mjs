import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { monitorControllerCommand, validateMonitorWorklist } from './research-monitor-controller.mjs';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

const clock = '2026-10-05T01:00:00.000Z';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hash = 'a'.repeat(64);
const key = 'synthetic-monitor-writer-12345';
const worklist = () => ({ ok: true, asOf: clock, bookHeads: { conservative: hash, growth: null },
  technicalSymbols: [{ symbol: '1101', existingPaperPosition: false, newEntryQualified: true },
    { symbol: '2409', existingPaperPosition: true, newEntryQualified: false }],
  heldSymbols: ['2409'], accountedTheses: 2,
  monthlyReviewsDue: [{ symbol: '2409', thesisRevisionId: id, articleRevisionId: id, nextReviewAt: clock }] });
const snapshot = symbol => ({ ok: true, snapshotId: id, idempotentReplay: false, decision: {
  schemaVersion: 'technical-monitoring-v1', symbol, observedAt: clock, marketSession: '2026-10-02',
  thesisRevisionId: id, articleRevisionId: id, articleHash: hash, reviewReceiptHash: hash,
  marketDatasetHash: hash, calendarHash: hash, signalState: 'confirmed', entryResearchEligible: false,
  monitorExistingPosition: symbol === '2409', blockers: ['thesis_review_due'] } });
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'si-monitor-'));
  try {
    const file = name => path.join(dir, name);
    const args = ['batch', '--origin', 'https://example.org', '--output', file('receipt.json'), '--journal', file('batch.jsonl')];
    const dependencies = { env: { INTERNAL_API_KEY: key }, source: () => ({ commit: 'b'.repeat(40), dirty: false }),
      now: () => clock, monotonic: () => 0 };
    await fn({ file, args, dependencies });
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('consumes server membership held-first, accounts expiry, and never renews or adopts a strategy', async () => fixture(async ({ file, args, dependencies }) => {
  const calls = [];
  const saved = await monitorControllerCommand(args, { ...dependencies, post: async (url, body, token) => {
    calls.push({ url, body }); assert.equal(token, key);
    return { rejected: false, body: calls.length === 1 ? worklist() : { ...snapshot(body.symbol), arbitrary: key } };
  } });
  assert.deepEqual(calls.map(item => item.body), [{}, { symbol: '2409' }, { symbol: '1101' }]);
  assert.equal(saved.allTechnicalSnapshotsSaved, true);
  assert.equal(saved.outcomes.every(item => !item.entryResearchEligible), true); // Breakout != eligibility.
  assert.equal(saved.monthlyReviewsDue[0].disposition, 'independent_review_required');
  for (const field of ['independentRenewalsPerformed', 'paperRiskProcessed', 'actualOrders', 'automaticRetry', 'fairResumeImplemented'])
    assert.equal(saved[field], false);
  assert.equal(saved.modelCalls, 0);
  const { receiptHash, ...material } = saved;
  assert.equal(receiptHash, researchCanonicalHash(material));
  assert.equal((await fs.stat(file('receipt.json'))).mode & 0o777, 0o600);
  assert.equal((await fs.stat(file('batch.jsonl'))).mode & 0o777, 0o600);
  assert.equal((await fs.readFile(file('batch.jsonl'), 'utf8')).includes(key), false);
  assert.equal((await fs.readFile(file('receipt.json'), 'utf8')).includes(key), false);
}));

test('server rechecks latest invalidation and does not receive a stale cutoff or caller eligibility', async () => fixture(async ({ args, dependencies }) => {
  const saved = await monitorControllerCommand(args, { ...dependencies, post: async (url, body) => {
    if (url.endsWith('worklist')) return { rejected: false, body: worklist() };
    assert.deepEqual(Object.keys(body), ['symbol']);
    const response = snapshot(body.symbol); response.decision.blockers = ['thesis_invalidated'];
    return { rejected: false, body: response };
  } });
  assert.deepEqual(saved.outcomes[1].blockers, ['thesis_invalidated']);
  assert.equal(saved.outcomes[1].entryResearchEligible, false);
}));

test('32 tasks bound accounts every leftover, including held stocks outside the batch', async () => fixture(async ({ args, dependencies }) => {
  const list = worklist(); list.monthlyReviewsDue = []; list.accountedTheses = 70;
  list.technicalSymbols = Array.from({ length: 70 }, (_, index) => ({ symbol: String(1000 + index),
    existingPaperPosition: index < 40, newEntryQualified: index >= 40 }));
  list.heldSymbols = list.technicalSymbols.slice(0, 40).map(item => item.symbol);
  let requests = 0;
  const saved = await monitorControllerCommand(args, { ...dependencies, post: async (url, body) => {
    requests++; return { rejected: false, body: url.endsWith('worklist') ? list : snapshot(body.symbol) };
  } });
  assert.equal(requests, 33); assert.equal(saved.outcomes.length, 32); assert.equal(saved.deferred.length, 38);
  assert.equal(saved.deferred.filter(item => item.existingPaperPosition).length, 8);
  assert.equal(saved.deferred.every(item => item.reason === 'batch_task_bound'), true);
  assert.equal(saved.allTechnicalSnapshotsSaved, false);
  assert.equal(new Set([...saved.outcomes, ...saved.deferred].map(item => item.symbol)).size, 70);
}));

test('total deadline defers work instead of pretending the monitoring run completed', async () => fixture(async ({ args, dependencies }) => {
  const list = worklist(); list.technicalSymbols = Array.from({ length: 30 }, (_, index) => ({ symbol: String(1000 + index),
    existingPaperPosition: false, newEntryQualified: true })); list.heldSymbols = [];
  list.accountedTheses = 30;
  let elapsed = 0;
  const saved = await monitorControllerCommand(args, { ...dependencies, monotonic: () => elapsed, post: async (url, body, _key, timeoutMs) => {
    assert.ok(timeoutMs > 0 && timeoutMs <= 15_000); elapsed += 5000;
    return { rejected: false, body: url.endsWith('worklist') ? list : snapshot(body.symbol) };
  } });
  assert.equal(saved.outcomes.length, 10); assert.equal(saved.deferred.length, 20);
  assert.equal(saved.deferred.every(item => item.reason === 'batch_deadline'), true);
}));

test('explicit server gaps remain visible and do not stop another held stock from being checked', async () => fixture(async ({ args, dependencies }) => {
  const saved = await monitorControllerCommand(args, { ...dependencies, post: async (url, body) => {
    if (url.endsWith('worklist')) return { rejected: false, body: worklist() };
    return body.symbol === '2409' ? { rejected: true, status: 409, secret: key }
      : { rejected: false, body: snapshot(body.symbol) };
  } });
  assert.deepEqual(saved.outcomes[0], { symbol: '2409', status: 'server_rejected', httpStatus: 409 });
  assert.equal(saved.outcomes[1].status, 'snapshot_saved'); assert.equal(saved.allTechnicalSnapshotsSaved, false);
  assert.equal(JSON.stringify(saved).includes(key), false);
}));

test('network ambiguity stops further mutations and preserves original worklist and completed responses', async () => fixture(async ({ file, args, dependencies }) => {
  let requests = 0;
  const post = async (url, body) => {
    requests++;
    if (url.endsWith('worklist')) return { rejected: false, body: worklist() };
    if (body.symbol === '2409') return { rejected: false, body: snapshot(body.symbol) };
    throw new Error(`lost reply ${key}`);
  };
  await assert.rejects(monitorControllerCommand(args, { ...dependencies, post }), /outcome_uncertain/);
  assert.equal(requests, 3); assert.equal((await fs.stat(file('receipt.json'))).size, 0);
  const journal = await fs.readFile(file('batch.jsonl'), 'utf8');
  assert.match(journal, /worklist_verified/); assert.match(journal, /response_verified/);
  assert.match(journal, /outcome_uncertain/); assert.equal(journal.includes(key), false);
  await assert.rejects(monitorControllerCommand(args, { ...dependencies, post }), /EEXIST/);
  assert.equal(requests, 3);
}));

test('missing held membership, duplicates, future or stale server clock, invalid renewal fail closed', () => {
  for (const mutate of [
    list => { list.technicalSymbols.pop(); },
    list => { list.technicalSymbols.push(list.technicalSymbols[0]); },
    list => { list.asOf = '2026-10-05T01:00:01Z'; },
    list => { list.asOf = '2026-10-05T00:57:59Z'; },
    list => { list.monthlyReviewsDue[0].nextReviewAt = '2026-10-05T01:00:01Z'; },
    list => { list.bookHeads.growth = 'unknown'; },
    list => { list.accountedTheses = 0; list.monthlyReviewsDue = []; },
    list => { list.technicalSymbols[1].newEntryQualified = true; },
    list => { list.monthlyReviewsDue[0].symbol = 2409; list.technicalSymbols[1].newEntryQualified = true; },
    list => { list.heldSymbols[0] = 2409; },
  ]) { const list = worklist(); mutate(list); assert.throws(() => validateMonitorWorklist(list, clock)); }
});

test('mismatched response, future snapshot and manufactured eligibility become uncertain without retry', async () => {
  for (const mutate of [
    row => { row.decision.symbol = '9999'; },
    row => { row.decision.observedAt = '2026-10-05T01:00:01Z'; },
    row => { row.decision.entryResearchEligible = true; },
  ]) await fixture(async ({ file, args, dependencies }) => {
    let requests = 0;
    await assert.rejects(monitorControllerCommand(args, { ...dependencies, post: async (url, body) => {
      requests++; if (url.endsWith('worklist')) return { rejected: false, body: worklist() };
      const response = snapshot(body.symbol); mutate(response); return { rejected: false, body: response };
    } }), /outcome_uncertain/);
    assert.equal(requests, 2); assert.match(await fs.readFile(file('batch.jsonl'), 'utf8'), /outcome_uncertain/);
  });
});

test('unsafe origin, shared writer key, dirty source, caller stock selection reject before any request', async () => fixture(async ({ args, dependencies }) => {
  let calls = 0; const post = async () => { calls++; };
  for (const origin of ['http://5.104.83.211', 'https://user:password@example.org', 'https://example.org/path', 'https://example.org/?key=x']) {
    const bad = [...args]; bad[2] = origin;
    await assert.rejects(monitorControllerCommand(bad, { ...dependencies, post }), /origin_invalid/);
  }
  await assert.rejects(monitorControllerCommand([...args, '--symbols', '2409'], { ...dependencies, post }), /arguments_invalid/);
  await assert.rejects(monitorControllerCommand(args, { ...dependencies, post,
    env: { INTERNAL_API_KEY: key, RESEARCH_REVIEW_KEY: key } }), /distinct_writer/);
  await assert.rejects(monitorControllerCommand(args, { ...dependencies, post,
    source: () => ({ commit: 'b'.repeat(40), dirty: true }) }), /clean_source/);
  assert.equal(calls, 0);
}));

test('existing output blocks all requests, preserving previous receipt', async () => fixture(async ({ file, args, dependencies }) => {
  await fs.writeFile(file('receipt.json'), 'keep'); let calls = 0;
  await assert.rejects(monitorControllerCommand(args, { ...dependencies, post: async () => { calls++; } }), /output_unavailable/);
  assert.equal(calls, 0); assert.equal(await fs.readFile(file('receipt.json'), 'utf8'), 'keep');
}));

test('real transport uses finite authenticated routes and rejects redirects without forwarding the bearer', async () => fixture(async ({ file, args, dependencies }) => {
  const calls = []; let redirectCalls = 0;
  const server = createServer(async (request, reply) => {
    if (request.url === '/escape') { redirectCalls++; reply.end('{}'); return; }
    let text = ''; for await (const bytes of request) text += bytes.toString();
    calls.push({ route: request.url, method: request.method, auth: request.headers.authorization, body: JSON.parse(text) });
    reply.writeHead(302, { location: '/escape' }); reply.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const real = [...args]; real[2] = `http://127.0.0.1:${server.address().port}`;
    await assert.rejects(monitorControllerCommand(real, dependencies), /outcome_uncertain/);
    assert.equal(redirectCalls, 0); assert.equal(calls.length, 1);
    assert.deepEqual(calls[0], { route: '/api/internal/research-monitor-worklist', method: 'POST', auth: `Bearer ${key}`, body: {} });
    server.removeAllListeners('request');
    server.on('request', async (request, reply) => {
      let text = ''; for await (const bytes of request) text += bytes.toString();
      reply.setHeader('content-type', 'application/json'); reply.end(JSON.stringify(request.url.endsWith('worklist')
        ? worklist() : snapshot(JSON.parse(text).symbol)));
    });
    real[4] = file('second.json'); real[6] = file('second.jsonl');
    assert.equal((await monitorControllerCommand(real, dependencies)).allTechnicalSnapshotsSaved, true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));

test('GC cannot cancel the strongly held body deadline after response headers', async () => fixture(async ({ file }) => {
  let snapshots = 0;
  const server = createServer(async (request, reply) => {
    for await (const _bytes of request) { /* drain request */ }
    reply.setHeader('content-type', 'application/json');
    if (request.url.endsWith('worklist')) reply.end(JSON.stringify(worklist()));
    else { snapshots++; reply.writeHead(200); reply.write('{'); } // Body never completes.
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const emergency = setTimeout(() => server.closeAllConnections(), 4000);
  try {
    const args = ['batch', '--origin', `http://127.0.0.1:${server.address().port}`,
      '--output', file('gc.json'), '--journal', file('gc.jsonl')];
    const code = `import { monitorControllerCommand } from ${JSON.stringify(new URL('./research-monitor-controller.mjs', import.meta.url).href)};
      let tick=0; const interval=setInterval(()=>global.gc(),50); const start=performance.now();
      try { await monitorControllerCommand(${JSON.stringify(args)}, {env:{INTERNAL_API_KEY:${JSON.stringify(key)}},
        source:()=>({commit:'b'.repeat(40),dirty:false}),now:()=>${JSON.stringify(clock)},
        monotonic:()=>tick++<2?0:54000}); console.log(JSON.stringify({unexpectedSuccess:true})); }
      catch(error) { console.log(JSON.stringify({error:error.message,elapsed:performance.now()-start})); }
      finally { clearInterval(interval); }`;
    const child = await promisify(execFile)(process.execPath, ['--expose-gc', '--experimental-strip-types', '--input-type=module', '-e', code],
      { timeout: 6000, maxBuffer: 32_000, env: { PATH: process.env.PATH } });
    const result = JSON.parse(child.stdout.trim());
    assert.match(result.error, /outcome_uncertain/); assert.ok(result.elapsed >= 800 && result.elapsed < 3000, JSON.stringify(result));
    assert.equal(snapshots, 1); assert.equal((await fs.stat(file('gc.json'))).size, 0);
    assert.match(await fs.readFile(file('gc.jsonl'), 'utf8'), /outcome_uncertain/);
  } finally { clearTimeout(emergency); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
