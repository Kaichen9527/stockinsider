import assert from 'node:assert/strict';
import test from 'node:test';
import { enqueueTaiwanRefreshScope, isTaiwanRefreshComplete, isTaiwanRefreshResearchReady, parseTaiwanDrainOptions, readTaiwanCandidateUniverse, taiwanRefreshEntries } from './taiwan-candidate-refresh.ts';

const symbols = Array.from({ length: 705 }, (_, index) => ({ symbol: String(1000 + index), exchange: 'TWSE' as const }));
const request = { datasets: ['daily_price', 'daily_valuation'] as ('daily_price' | 'daily_valuation')[], symbols: [], phase: 'final' as const, sessionDate: '2026-09-11' };
const cutoff = '2026-09-11T11:00:00Z';

test('more than 280 and 500 candidates are fully read through short keyset pages at one cutoff', async () => {
  const calls: string[] = [];
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, 'read_taiwan_data_candidate_universe_v6');
    assert.equal(args.p_cutoff, cutoff);
    calls.push(String(args.p_after_symbol));
    return { data: symbols.filter((row) => row.symbol > String(args.p_after_symbol)).slice(0, 83), error: null };
  } };
  assert.deepEqual(await readTaiwanCandidateUniverse(client, cutoff), symbols);
  assert.equal(calls.length, 10);
});

test('a failed or nonadvancing candidate page cannot silently truncate the universe', async () => {
  let page = 0;
  await assert.rejects(readTaiwanCandidateUniverse({ async rpc() { return ++page === 1
    ? { data: symbols.slice(0, 200), error: null }
    : { data: null, error: { message: 'database unavailable' } }; } }, cutoff), /read_failed/);
  await assert.rejects(readTaiwanCandidateUniverse({ async rpc() { return { data: symbols.slice(0, 2), error: null }; } }, cutoff), /invalid_order/);
});

test('all expected keys are registered before bounded enqueue; failure remains explicit and later batches run', async () => {
  let registered: unknown[] = [];
  const sizes: number[] = [];
  const client = { async rpc(name: string, args: Record<string, unknown>) {
    if (name === 'register_taiwan_data_refresh_scope_v6') { registered = args.p_queue_keys as unknown[]; return { data: { expected: registered.length }, error: null }; }
    assert.equal(name, 'enqueue_taiwan_data_refresh_batch_v6');
    assert.equal(registered.length, 707);
    const batch = args.p_entries as Array<{ queueKey: string }>;
    sizes.push(batch.length);
    if (sizes.length === 2) return { data: null, error: { message: 'transient enqueue error' } };
    return { data: { queued: batch.length, jobIds: batch.map((entry) => entry.queueKey) }, error: null };
  } };
  const result = await enqueueTaiwanRefreshScope(client, request, symbols, cutoff);
  assert.deepEqual(sizes, [100,100,100,100,100,100,100,7]);
  assert.equal(result.expected, 707);
  assert.equal(result.queued, 607);
  assert.equal(result.enqueueComplete, false);
  assert.deepEqual(result.errors, [{ offset: 100, count: 100, error: 'transient enqueue error' }]);
});

test('aggregate datasets are enqueued once per exchange, with duplicate symbols removed', () => {
  const entries = taiwanRefreshEntries(request, [...symbols.slice(0, 2), symbols[0]]);
  assert.equal(entries.length, 4);
  assert.equal(entries.filter((entry) => entry.dataset === 'daily_valuation').length, 2);
});

test('drain bounds preserve legacy one-batch calls and require an explicit completion scope', () => {
  assert.deepEqual(parseTaiwanDrainOptions({ limit: 100 }), { limit: 100, maxBatches: 1, requireComplete: false, phase: null, sessionDate: null });
  assert.deepEqual(parseTaiwanDrainOptions({ limit: 100, maxBatches: 30, requireComplete: true, phase: 'final' }),
    { limit: 100, maxBatches: 30, requireComplete: true, phase: 'final', sessionDate: null });
  for (const bad of [{ limit: 101 }, { limit: 100, maxBatches: 31 }, { limit: 100, requireComplete: true },
    { limit: 100, phase: 'final', sessionDate: '2026-02-31' }, { limit: 100, unknown: true }]) assert.equal(parseTaiwanDrainOptions(bad), null);
});

test('a drained batch, last-good publication or retry is not full-scope completion', () => {
  const all = { expected: 705, completed: 705, failed: 0, queued: 0, running: 0, missing: 0, retrying: 0, ready: true };
  assert.equal(isTaiwanRefreshComplete(all), true);
  for (const incomplete of [{ ...all, completed: 100, queued: 605 }, { ...all, missing: 1 }, { ...all, retrying: 1 },
    { ...all, failed: 1 }, { ...all, ready: false }, { expected: 0, completed: 0, ready: true }, { publication: 'last_good' }]) {
    assert.equal(isTaiwanRefreshComplete(incomplete), false);
  }
});

test('a terminal individual-stock gap is partial data, not a veto on all other stock research', () => {
  const partial = { expected: 705, completed: 704, failed: 1, failedCandidate: 1, failedCritical: 0,
    queued: 0, running: 0, missing: 0, retrying: 0, ready: false, settled: true, researchReady: true };
  assert.equal(isTaiwanRefreshResearchReady(partial), true);
  assert.equal(isTaiwanRefreshComplete(partial), false);
  for (const bad of [{ ...partial, failedCandidate: 0, failedCritical: 1 }, { ...partial, queued: 1 },
    { ...partial, missing: 1 }, { ...partial, retrying: 1 }, { ...partial, settled: false },
    { ...partial, completed: 100 }, { publication: 'last_good' }]) assert.equal(isTaiwanRefreshResearchReady(bad), false);
});
