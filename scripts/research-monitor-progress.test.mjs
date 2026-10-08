import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createServer } from 'node:http';
import { monitorControllerCommand } from './research-monitor-controller.mjs';
import { monitorCycleDate, MONITOR_JOURNAL_BYTES, MONITOR_RECEIPT_BYTES } from './research-monitor-progress.mjs';
import { researchCanonicalHash } from '../web/src/lib/research-agent-qualification.ts';

const clock = '2026-10-08T10:00:00.000Z';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const hash = 'a'.repeat(64);
const writer = 'synthetic-private-writer-key';
function list(count = 70, held = 40, now = clock) {
  return { ok: true, asOf: now, bookHeads: { conservative: hash, growth: null },
    accountedTheses: count, heldSymbols: Array.from({ length: held }, (_, i) => String(1000 + i)),
    technicalSymbols: Array.from({ length: count }, (_, i) => ({ symbol: String(1000 + i),
      existingPaperPosition: i < held, newEntryQualified: i >= held })), monthlyReviewsDue: [] };
}
const snapshot = (symbol, now = clock) => ({ ok: true, snapshotId: id, idempotentReplay: false, decision: {
  schemaVersion: 'technical-monitoring-v1', symbol, observedAt: now, marketSession: '2026-10-08',
  thesisRevisionId: id, articleRevisionId: id, articleHash: hash, reviewReceiptHash: hash,
  marketDatasetHash: hash, calendarHash: hash, signalState: 'waiting', entryResearchEligible: false,
  monitorExistingPosition: false, blockers: ['waiting_for_pattern'] } });
async function fixture(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'si-monitor-progress-'));
  const file = name => path.join(dir, name);
  const args = (name, previous, origin = 'https://example.org') => ['batch', '--origin', origin,
    '--output', file(`${name}.json`), '--journal', file(`${name}.jsonl`),
    ...previous ? ['--previous-output', file(`${previous}.json`), '--previous-journal', file(`${previous}.jsonl`)] : []];
  let current = list(); let now = clock; const calls = [];
  const dependencies = { env: { INTERNAL_API_KEY: writer }, source: () => ({ commit: 'b'.repeat(40), dirty: false }),
    now: () => now, monotonic: () => 0, post: async (url, body) => {
      calls.push({ url, body }); return { rejected: false, body: url.endsWith('worklist') ? current : snapshot(body.symbol, now) };
    } };
  try { await fn({ dir, file, args, dependencies, calls, setList: value => { current = value; }, setNow: value => { now = value; } }); }
  finally { await fs.rm(dir, { recursive: true, force: true }); }
}

test('70 members continue32/32/6 held-first, preserve observation and immutable predecessor', () => fixture(async f => {
  const first = await monitorControllerCommand(f.args('one'), f.dependencies);
  assert.equal(first.outcomes.length, 32); assert.equal(first.progress.length, 32);
  const original = await fs.readFile(f.file('one.jsonl'), 'utf8');
  f.setNow('2026-10-08T10:01:00.000Z'); f.setList(list(70, 40, '2026-10-08T10:01:00.000Z'));
  const second = await monitorControllerCommand(f.args('two', 'one'), f.dependencies);
  assert.deepEqual(second.outcomes.slice(0, 8).map(row => row.symbol), Array.from({ length: 8 }, (_, i) => String(1032 + i)));
  assert.equal(second.outcomes.length, 32); assert.equal(second.progress.length, 64);
  assert.equal(second.predecessorReceiptHash, first.receiptHash);
  assert.deepEqual(second.progress[0], first.progress[0]); // Never re-date carried observations.
  const third = await monitorControllerCommand(f.args('three', 'two'), f.dependencies);
  assert.equal(third.outcomes.length, 6); assert.equal(third.progress.length, 70);
  assert.equal(third.allCurrentSymbolsAccounted, true); assert.equal(third.allTechnicalSnapshotsSaved, true);
  assert.equal(f.calls.filter(row => row.url.endsWith('worklist')).length, 3);
  assert.equal(new Set(f.calls.filter(row => row.body.symbol).map(row => row.body.symbol)).size, 70);
  assert.equal(await fs.readFile(f.file('one.jsonl'), 'utf8'), original);
  assert.equal(JSON.stringify(third).includes(writer), false);
}));

test('fresh membership removes prior dispositions; rejoining, new and flag-changed companies run again', () => fixture(async f => {
  f.setList(list(2, 1)); await monitorControllerCommand(f.args('one'), f.dependencies);
  const next = list(2, 0); next.technicalSymbols = [{ symbol: '1001', existingPaperPosition: true, newEntryQualified: false },
    { symbol: '9000', existingPaperPosition: false, newEntryQualified: true }]; next.heldSymbols = ['1001'];
  f.setList(next); const second = await monitorControllerCommand(f.args('two', 'one'), f.dependencies);
  assert.deepEqual(second.outcomes.map(row => row.symbol), ['1001', '9000']);
  assert.equal(second.progress.some(row => row[0] === '1000'), false);
  next.technicalSymbols.push({ symbol: '1000', existingPaperPosition: true, newEntryQualified: false });
  next.heldSymbols.push('1000'); next.accountedTheses = 3;
  const third = await monitorControllerCommand(f.args('three', 'two'), f.dependencies);
  assert.deepEqual(third.outcomes.map(row => row.symbol), ['1000']);
}));

test('explicit rejection counts as a disposition and never as saved; later batches still progress', () => fixture(async f => {
  const post = f.dependencies.post;
  const dependencies = { ...f.dependencies, post: (url, body) => body.symbol === '1000'
    ? { rejected: true, status: 409 } : post(url, body) };
  await monitorControllerCommand(f.args('one'), dependencies);
  await monitorControllerCommand(f.args('two', 'one'), dependencies);
  const third = await monitorControllerCommand(f.args('three', 'two'), dependencies);
  assert.equal(third.allCurrentSymbolsAccounted, true); assert.equal(third.allTechnicalSnapshotsSaved, false);
  assert.equal(third.progress[0][3], 'server_rejected');
}));

test('fresh server invalidation is preserved; controller sends no old cutoff or eligibility', () => fixture(async f => {
  await monitorControllerCommand(f.args('one'), f.dependencies);
  const post = f.dependencies.post;
  const second = await monitorControllerCommand(f.args('two', 'one'), { ...f.dependencies, post: async (url, body) => {
    if (url.endsWith('worklist')) return post(url, body);
    assert.deepEqual(Object.keys(body), ['symbol']);
    const row = snapshot(body.symbol); row.decision.blockers = ['thesis_invalidated'];
    return { rejected: false, body: row };
  } });
  assert.equal(second.outcomes.every(row => row.blockers[0] === 'thesis_invalidated'), true);
}));

for (const kind of ['date', 'future', 'source', 'origin', 'hash', 'truncate', 'uncertain', 'extra_phase', 'duplicate_progress']) {
  test(`reject ${kind} predecessor before network`, () => fixture(async f => {
    await monitorControllerCommand(f.args('one'), f.dependencies);
    let dependencies = f.dependencies; let args = f.args('two', 'one');
    if (kind === 'date') f.setNow('2026-10-09T10:00:00.000Z');
    if (kind === 'future') f.setNow('2026-10-08T09:59:59.000Z');
    if (kind === 'source') dependencies = { ...dependencies, source: () => ({ commit: 'c'.repeat(40), dirty: false }) };
    if (kind === 'origin') args[2] = 'https://different.example.org';
    if (kind === 'hash' || kind === 'duplicate_progress') {
      const receipt = JSON.parse(await fs.readFile(f.file('one.json'), 'utf8'));
      if (kind === 'hash') receipt.totalSymbols = 1; else receipt.progress.push(receipt.progress[0]);
      await fs.writeFile(f.file('one.json'), JSON.stringify(receipt, null, 2) + '\n');
    }
    if (kind === 'truncate') await fs.truncate(f.file('one.jsonl'), 100);
    if (kind === 'uncertain') await fs.appendFile(f.file('one.jsonl'), JSON.stringify({ phase: 'outcome_uncertain', observedAt: clock }) + '\n');
    if (kind === 'extra_phase') await fs.appendFile(f.file('one.jsonl'), JSON.stringify({ phase: 'response_saved', receiptHash: hash, observedAt: clock }) + '\n');
    f.calls.length = 0;
    await assert.rejects(monitorControllerCommand(args, dependencies), /previous_progress_invalid/);
    assert.equal(f.calls.length, 0); await assert.rejects(fs.stat(f.file('two.jsonl')), /ENOENT/);
  }));
}

test('changed book heads reject after fresh read and before snapshot writes', () => fixture(async f => {
  await monitorControllerCommand(f.args('one'), f.dependencies);
  const next = list(); next.bookHeads.growth = 'c'.repeat(64); f.setList(next); f.calls.length = 0;
  await assert.rejects(monitorControllerCommand(f.args('two', 'one'), f.dependencies), /output_unavailable/);
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0].url.endsWith('worklist'), true);
  assert.match(await fs.readFile(f.file('two.jsonl'), 'utf8'), /not_sent_or_destination_failed/);
}));

for (const kind of ['symlink', 'fifo', 'permissions', 'oversize']) {
  test(`private predecessor ${kind} rejects without blocking or transport`, () => fixture(async f => {
    await monitorControllerCommand(f.args('one'), f.dependencies);
    if (kind === 'symlink') { await fs.rename(f.file('one.json'), f.file('target')); await fs.symlink(f.file('target'), f.file('one.json')); }
    if (kind === 'fifo') { await fs.unlink(f.file('one.json')); await promisify(execFile)('mkfifo', [f.file('one.json')]); }
    if (kind === 'permissions') await fs.chmod(f.file('one.json'), 0o644);
    if (kind === 'oversize') await fs.truncate(f.file('one.json'), MONITOR_RECEIPT_BYTES + 1);
    f.calls.length = 0;
    await assert.rejects(monitorControllerCommand(f.args('two', 'one'), f.dependencies), /previous_progress_invalid/);
    assert.equal(f.calls.length, 0);
  }));
}

test('paired and distinct paths, normalized aliases, invalid HTTP rejection are rejected', () => fixture(async f => {
  f.calls.length = 0;
  await assert.rejects(monitorControllerCommand([...f.args('two'), '--previous-output', f.file('one.json')], f.dependencies), /arguments_invalid/);
  const args = f.args('two', 'one'); args[8] = f.file('./two.json');
  await assert.rejects(monitorControllerCommand(args, f.dependencies), /distinct_absolute/);
  assert.equal(f.calls.length, 0);
  await assert.rejects(monitorControllerCommand(f.args('bad'), { ...f.dependencies, post: async url => url.endsWith('worklist')
    ? { rejected: false, body: list(1, 0) } : { rejected: true, status: 200 } }), /outcome_uncertain/);
}));

test('Asia/Taipei date, not UTC date, fences continuation', () => {
  assert.equal(monitorCycleDate('2026-10-08T15:59:59.999Z'), '2026-10-08');
  assert.equal(monitorCycleDate('2026-10-08T16:00:00.000Z'), '2026-10-09');
});

for (const failAt of [5, 6, 7]) {
  test(`journal/output sync failure at boundary${failAt} cannot authorize continuation`, () => fixture(async f => {
    f.setList(list(1, 0));
    const probe = await fs.open(f.file('probe'), 'wx', 0o600);
    const prototype = Object.getPrototypeOf(probe); const original = prototype.sync;
    await probe.close(); let count = 0;
    prototype.sync = async function () {
      if (++count === failAt) throw new Error('synthetic_fsync_failure');
      return original.call(this);
    };
    try { await assert.rejects(monitorControllerCommand(f.args('one'), f.dependencies), /output_unavailable/); }
    finally { prototype.sync = original; }
    f.calls.length = 0;
    await assert.rejects(monitorControllerCommand(f.args('two', 'one'), f.dependencies), /previous_progress_invalid/);
    assert.equal(f.calls.length, 0);
  }));
}

test('future current worklist, duplicate membership and midnight boundary never mutate snapshots', () => fixture(async f => {
  await monitorControllerCommand(f.args('one'), f.dependencies);
  for (const [name, current, now] of [
    ['future', list(70, 40, '2026-10-08T10:01:00Z'), clock],
    ['duplicate', { ...list(), technicalSymbols: [...list().technicalSymbols, list().technicalSymbols[0]] }, clock],
    ['midnight', list(70, 40, '2026-10-08T15:59:59Z'), '2026-10-08T16:00:00Z'],
  ]) {
    f.setList(current); f.setNow(now); f.calls.length = 0;
    await assert.rejects(monitorControllerCommand(f.args(name, name === 'midnight' ? null : 'one'), f.dependencies));
    assert.equal(f.calls.filter(row => !row.url.endsWith('worklist')).length, 0);
  }
}));

test('clock crosses midnight after response: saved outcomes remain in journal but no resumable success', () => fixture(async f => {
  f.setNow('2026-10-08T15:59:59.500Z'); f.setList(list(1, 0, '2026-10-08T15:59:59.500Z'));
  await assert.rejects(monitorControllerCommand(f.args('one'), { ...f.dependencies, post: async url => {
    if (url.endsWith('worklist')) return { rejected: false, body: list(1, 0, '2026-10-08T15:59:59.500Z') };
    f.setNow('2026-10-08T16:00:00.000Z');
    return { rejected: false, body: snapshot('1000', '2026-10-08T16:00:00.000Z') };
  } }), /output_unavailable/);
  assert.match(await fs.readFile(f.file('one.jsonl'), 'utf8'), /response_verified/);
  f.calls.length = 0;
  await assert.rejects(monitorControllerCommand(f.args('two', 'one'), f.dependencies), /previous_progress_invalid/);
  assert.equal(f.calls.length, 0);
}));

test('largest unique four-digit cohort plus monthly reviews and progress fits both file bounds', () => {
  const count = 10_000; const members = Array.from({ length: count }, (_, i) => ({ symbol: String(i).padStart(4, '0'),
    existingPaperPosition: true, newEntryQualified: false }));
  const due = members.map(row => ({ symbol: row.symbol, thesisRevisionId: id, articleRevisionId: id,
    nextReviewAt: clock, disposition: 'independent_review_required' }));
  const progress = members.map(row => [row.symbol, true, false, 'snapshot_saved', id, clock, hash]);
  const worklist = { technicalSymbols: members, heldSymbols: members.map(row => row.symbol), monthlyReviewsDue: due };
  const receipt = { progress, monthlyReviewsDue: due, outcomes: [], deferred: [] };
  assert.ok(Buffer.byteLength(JSON.stringify(receipt, null, 2)) < MONITOR_RECEIPT_BYTES);
  // Final journal binds the receipt hash without embedding the entire receipt.
  assert.ok(Buffer.byteLength(JSON.stringify(worklist)) + 200_000 < MONITOR_JOURNAL_BYTES);
});

test('real HTTP multi-batch continuation fetches fresh membership and never forwards progress', () => fixture(async f => {
  const requests = []; const server = createServer(async (request, reply) => {
    let body = ''; for await (const chunk of request) body += chunk;
    const input = JSON.parse(body); requests.push({ path: request.url, input });
    reply.setHeader('content-type', 'application/json');
    reply.end(JSON.stringify(request.url.endsWith('worklist') ? list(35, 2) : snapshot(input.symbol)));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const origin = `http://127.0.0.1:${server.address().port}`;
    const dependencies = { ...f.dependencies }; delete dependencies.post;
    await monitorControllerCommand(f.args('one', null, origin), dependencies);
    const second = await monitorControllerCommand(f.args('two', 'one', origin), dependencies);
    assert.equal(second.outcomes.length, 3); assert.equal(second.allCurrentSymbolsAccounted, true);
    assert.equal(requests.filter(row => row.path.endsWith('worklist')).length, 2);
    assert.equal(requests.filter(row => !row.path.endsWith('worklist')).every(row => Object.keys(row.input).join(',') === 'symbol'), true);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}));
