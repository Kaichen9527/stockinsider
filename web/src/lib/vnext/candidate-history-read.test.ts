import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { POLICY } from './policy.ts';
import { readCandidateHistory } from './candidate-history-read.ts';
import { candidateHistoryPage, candidateQuery, candidateRankingRunId } from './candidate-page.ts';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const candidate = (symbol: number) => ({ symbol: String(symbol), state: 'waiting', date: '2026-11-01', revisionId: id(symbol), entryEligible: true, source: null, industry: null, inputHash: 'private hash', reasons: ['private reason'] });
const snapshot = (n: number, symbols: number[], previous: number | null) => ({ schemaVersion: 'vnext-ranking-snapshot-v1', policyVersion: POLICY.version, rankingRunId: id(n), previousRankingRunId: previous === null ? null : id(previous), cutoff: `2026-11-0${n}T12:30:00.000Z`, candidates: symbols.map(candidate), privateEvidence: 'private evidence' });
const fixture = () => ({ snapshot: snapshot(2, [1001, 1002], 1), previousSnapshot: snapshot(1, [1000, 1001], null), nextSnapshot: { rankingRunId: id(3), previousRankingRunId: id(2), cutoff: '2026-11-03T12:30:00.000Z', privateIdentity: 'private identity' } });

test('saved versions expose prior publication and conservative observed exit with exact event date', () => {
  const result = candidateHistoryPage(fixture(), candidateQuery({ status: 'exited' }));
  assert.equal(result.scope, 'saved_adjacent_active_pool_snapshots');
  assert.deepEqual(result.rows, [{ symbol: '1000', state: 'exited', date: '2026-11-01', revisionId: id(1000), entryEligible: false, source: null, industry: null, stateBasis: 'absent_from_successor', observedAt: '2026-11-02T12:30:00.000Z', lastObservedAt: '2026-11-01T12:30:00.000Z' }]);
  assert.ok(result.gaps.includes('exact_exit_time_and_reason_not_available'));
  assert.deepEqual(result.previousSnapshot, { rankingRunId: id(1), cutoff: '2026-11-01T12:30:00.000Z' });
  assert.deepEqual(result.nextSnapshot, { rankingRunId: id(3), cutoff: '2026-11-03T12:30:00.000Z' });
});
test('only active-pool absence implies observed exit; losing a top10 rank never implies membership exit', () => {
  const result = candidateHistoryPage(fixture(), candidateQuery({ status: 'waiting' }));
  assert.deepEqual(result.rows.map(row => row.symbol), ['1001', '1002']);
  assert.ok(result.rows.every(row => row.stateBasis === 'saved_active_pool'));
});
test('genesis and latest version are navigable without fabricated adjacent snapshots', () => {
  const result = candidateHistoryPage({ snapshot: snapshot(1, [], null), previousSnapshot: null, nextSnapshot: null }, candidateQuery({}));
  assert.deepEqual(result.rows, []); assert.equal(result.previousSnapshot, null); assert.equal(result.nextSnapshot, null);
});
test('forty observed candidates paginate on one immutable version despite a new successor', () => {
  const value = { snapshot: snapshot(2, Array.from({ length: 20 }, (_, n) => 1020 + n), 1), previousSnapshot: snapshot(1, Array.from({ length: 20 }, (_, n) => 1000 + n), null), nextSnapshot: null as ReturnType<typeof fixture>['nextSnapshot'] | null };
  const seen: string[] = []; let cursor: string | null = null;
  for (let page = 0; page < 4; page++) {
    const query = candidateQuery({ ...(cursor ? { cursor } : {}) });
    const result = candidateHistoryPage(value, query); seen.push(...result.rows.map(row => row.symbol)); cursor = result.nextCursor;
    value.nextSnapshot = fixture().nextSnapshot;
    value.snapshot.candidates.reverse(); value.previousSnapshot.candidates.reverse();
  }
  assert.equal(cursor, null); assert.equal(new Set(seen).size, 40); assert.deepEqual(seen, Array.from({ length: 40 }, (_, n) => String(1000 + n)));
});
test('explicit version/cursor/filter mismatch and changed prior history fail closed', () => {
  const first = candidateHistoryPage(fixture(), candidateQuery({ limit: '1' }));
  const cursor = first.nextCursor!;
  assert.equal(candidateRankingRunId(candidateQuery({ rankingRunId: id(2), cursor })), id(2));
  assert.throws(() => candidateRankingRunId(candidateQuery({ rankingRunId: id(1), cursor })), /invalid/u);
  assert.throws(() => candidateHistoryPage(fixture(), candidateQuery({ rankingRunId: id(1) })), /invalid/u);
  assert.throws(() => candidateHistoryPage(fixture(), candidateQuery({ cursor, status: 'exited' })), /invalid/u);
  const changed = fixture(); changed.previousSnapshot.candidates[0].date = '2026-10-30';
  assert.throws(() => candidateHistoryPage(changed, candidateQuery({ cursor })), /invalid/u);
  assert.throws(() => candidateQuery({ rankingRunId: 'latest' }), /invalid/u);
});
test('broken lineage, missing prior, invalid ordering and overfull prior fail closed', () => {
  for (const mutate of [
    (v: ReturnType<typeof fixture>) => { v.previousSnapshot.rankingRunId = id(4); },
    (v: ReturnType<typeof fixture>) => { v.snapshot.candidates[0].state = 'exited'; },
    (v: ReturnType<typeof fixture>) => { v.previousSnapshot.candidates[0].state = 'exited'; },
    (v: ReturnType<typeof fixture>) => { v.previousSnapshot.cutoff = '2026-11-04T12:30:00.000Z'; },
    (v: ReturnType<typeof fixture>) => { v.nextSnapshot.previousRankingRunId = id(1); },
    (v: ReturnType<typeof fixture>) => { v.nextSnapshot.cutoff = '2026-11-01T12:30:00.000Z'; },
    (v: ReturnType<typeof fixture>) => { v.previousSnapshot.candidates = Array.from({ length: 21 }, (_, n) => candidate(1000 + n)); },
  ]) { const value = fixture(); mutate(value); assert.throws(() => candidateHistoryPage(value, candidateQuery({})), /invalid/u); }
  assert.throws(() => candidateHistoryPage({ ...fixture(), previousSnapshot: null }, candidateQuery({})), /invalid/u);
  assert.throws(() => candidateHistoryPage({ ...fixture(), snapshot: snapshot(1, [], null) }, candidateQuery({})), /invalid/u);
});
test('history public allowlist strips raw evidence/hashes/reasons/identities and never mutates inputs', () => {
  const input = fixture(), before = structuredClone(input); const result = candidateHistoryPage(input, candidateQuery({}));
  assert.equal(JSON.stringify(result).includes('private'), false);
  result.rows[0].state = 'eligible'; assert.deepEqual(input, before);
  for (const params of [{ source: 'ptt' }, { industry: '半導體' }, { date: '2026-11-02' }]) assert.equal(candidateHistoryPage(input, candidateQuery(params)).rows.length, 0);
});
test('adapter source uses one readonly RPC, explicit run binding and installed feature gate', () => {
  const source = readFileSync(new URL('./candidate-history-read.ts', import.meta.url), 'utf8');
  assert.ok(source.includes("if (!rankingEnabled()) throw Error('vnext_ranking_disabled')"));
  assert.ok(source.indexOf('candidateRankingRunId(query)') < source.indexOf('await client.rpc('));
  assert.equal([...source.matchAll(/\.rpc\(/gu)].length, 1);
  assert.ok(source.includes("client.rpc('vnext_candidate_history_read_v1', { p_ranking_run_id: rankingRunId })"));
  assert.equal(/\b(?:enqueue|prepare|claim|publish|dispatch|record|runResearch)\s*\(/u.test(source), false);
});
test('page pins filters/pagination to selected version and exposes prior/next navigation with truthful absence', () => {
  const source = readFileSync(new URL('../../app/candidates/page.tsx', import.meta.url), 'utf8');
  for (const fragment of ['name="rankingRunId"', "params.set('rankingRunId', rankingRunId)", 'data.previousSnapshot.rankingRunId', 'data.nextSnapshot.rankingRunId', "row.stateBasis === 'absent_from_successor'", '確切退出時間／原因未保存']) assert.ok(source.includes(fragment));
});

// Injected transport only. No real source/model/database or environment files.
test('injected adapter actually requests the selected immutable run and rejects wrong-run/RPC failures', async () => {
  const priorEnabled = process.env.STOCKINSIDER_VNEXT_ENABLED, priorRanking = process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED;
  try {
    process.env.STOCKINSIDER_VNEXT_ENABLED = 'true'; process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED = 'true';
    const calls: unknown[] = [];
    const query = candidateQuery({ rankingRunId: id(2) });
    const result = await readCandidateHistory(query, { rpc: async (name, args) => { calls.push({ name, args }); return { data: fixture(), error: null }; } });
    assert.equal(result.rankingRunId, id(2));
    assert.deepEqual(calls, [{ name: 'vnext_candidate_history_read_v1', args: { p_ranking_run_id: id(2) } }]);
    await assert.rejects(readCandidateHistory(candidateQuery({ rankingRunId: id(1) }), { rpc: async () => ({ data: fixture(), error: null }) }), /invalid/u);
    await assert.rejects(readCandidateHistory(query, { rpc: async () => ({ data: fixture(), error: { message: 'unavailable' } }) }), /unavailable/u);
    await assert.rejects(readCandidateHistory(query, { rpc: async () => ({ data: null, error: null }) }), /invalid/u);
    let io = 0;
    process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED = 'false';
    await assert.rejects(readCandidateHistory(query, { rpc: async () => { io++; return { data: fixture(), error: null }; } }), /disabled/u);
    assert.equal(io, 0);
    process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED = 'true';
    const first = candidateHistoryPage(fixture(), candidateQuery({ limit: '1' }));
    await assert.rejects(readCandidateHistory(candidateQuery({ rankingRunId: id(1), cursor: first.nextCursor! }), { rpc: async () => { io++; return { data: fixture(), error: null }; } }), /invalid/u);
    assert.equal(io, 0);
  } finally {
    if (priorEnabled === undefined) delete process.env.STOCKINSIDER_VNEXT_ENABLED; else process.env.STOCKINSIDER_VNEXT_ENABLED = priorEnabled;
    if (priorRanking === undefined) delete process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED; else process.env.STOCKINSIDER_VNEXT_TOP10_ENABLED = priorRanking;
  }
});

test('historical cutoffs reject invalid civil dates, non-ISO clocks and future observations at the actual read boundary', () => {
  const readAt = '2026-11-03T12:30:00.000001Z';
  for (const cutoff of ['2026-02-30T12:30:00Z', '2026-11-02', 'November 2, 2026 12:30:00 UTC', '2026-11-03T12:30:00.000002Z', '2026-11-02T24:00:00Z']) {
    const value = { snapshot: snapshot(1, [], null), previousSnapshot: null, nextSnapshot: null };
    value.snapshot.cutoff = cutoff;
    assert.throws(() => candidateHistoryPage(value, candidateQuery({}), readAt), /invalid/u);
  }
  assert.throws(() => candidateHistoryPage(fixture(), candidateQuery({}), '2026-02-30T12:30:00Z'), /invalid/u);
  const futureNext = fixture(); futureNext.nextSnapshot.cutoff = '2026-11-03T12:30:00.000002Z';
  assert.throws(() => candidateHistoryPage(futureNext, candidateQuery({}), readAt), /invalid/u);
});

test('microsecond predecessor/successor ordering and offset-equivalent boundaries never collapse to milliseconds', () => {
  const value = fixture();
  value.previousSnapshot.cutoff = '2026-11-02T12:30:00.000001Z';
  value.snapshot.cutoff = '2026-11-02T12:30:00.000002Z';
  value.nextSnapshot.cutoff = '2026-11-02T20:30:00.000003+08:00';
  const readAt = '2026-11-02T12:30:00.000003Z';
  assert.equal(candidateHistoryPage(value, candidateQuery({}), readAt).rows.length, 3);
  const laterPrior = structuredClone(value); laterPrior.previousSnapshot.cutoff = '2026-11-02T12:30:00.000003Z';
  assert.throws(() => candidateHistoryPage(laterPrior, candidateQuery({}), readAt), /invalid/u);
  const earlierNext = structuredClone(value); earlierNext.nextSnapshot.cutoff = '2026-11-02T12:30:00.000001Z';
  assert.throws(() => candidateHistoryPage(earlierNext, candidateQuery({}), readAt), /invalid/u);
});

test('cursor binds predecessor identity and observation clock even when no candidate disappeared', () => {
  const value = fixture(); value.previousSnapshot.candidates = structuredClone(value.snapshot.candidates);
  const first = candidateHistoryPage(value, candidateQuery({ limit: '1' }));
  const query = candidateQuery({ cursor: first.nextCursor! });
  const changedIdentity = structuredClone(value);
  changedIdentity.snapshot.previousRankingRunId = id(4); changedIdentity.previousSnapshot.rankingRunId = id(4);
  assert.throws(() => candidateHistoryPage(changedIdentity, query), /invalid/u);
  const changedClock = structuredClone(value); changedClock.previousSnapshot.cutoff = '2026-11-01T12:30:00.000001Z';
  assert.throws(() => candidateHistoryPage(changedClock, query), /invalid/u);
  const noSuccessor = { ...value, nextSnapshot: null };
  const withoutNext = candidateHistoryPage(noSuccessor, candidateQuery({ limit: '1' }));
  assert.deepEqual(candidateHistoryPage(value, candidateQuery({ cursor: withoutNext.nextCursor! })).rows.map(row => row.symbol), ['1002']);
});

test('immediate predecessor cannot point to any identity in the visible current/prior/next fragment', () => {
  for (const previousRankingRunId of [id(1), id(2), id(3), 'invalid']) {
    const value = fixture(); value.previousSnapshot.previousRankingRunId = previousRankingRunId;
    assert.throws(() => candidateHistoryPage(value, candidateQuery({})), /invalid/u);
  }
});
