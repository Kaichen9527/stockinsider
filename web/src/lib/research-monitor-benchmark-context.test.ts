import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateMonitorBenchmarkContext as calculate, loadMonitorBenchmarkContext as load,
  MONITOR_BENCHMARK_LIMITS as limits, type MonitorBenchmarkInput } from './research-monitor-benchmark-context.ts';
import { researchDeepInstant } from './research-deep-claim-context.ts';

type Row = Record<string, unknown>;
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
function fixture(exchange: 'TWSE' | 'TPEX' = 'TWSE') {
  const sessions: string[] = [];
  for (let day = Date.parse('2025-10-01T00:00:00Z'); sessions.length < 240; day += 86400_000) {
    const date = new Date(day); if (![0, 6].includes(date.getUTCDay())) sessions.push(date.toISOString().slice(0, 10));
  }
  const signalSession = sessions.at(-1)!, cutoff = `${signalSession}T10:00:00Z`;
  const bars = sessions.map((session, i) => ({ session, open: 100 + i, high: 101 + i, low: 99 + i,
    close: 100 + i, volume: 100_000, availableAt: `${session}T06:02:00Z`, sourceRef: 'a'.repeat(64) }));
  const input: MonitorBenchmarkInput = { symbol: '2409', exchange, signalSession, cutoff, authority: {
    bars, missingData: [], sourceDatasetRevision: 'synthetic-official-adjusted-window', availableAt: `${signalSession}T06:02:00Z`,
    priceBasis: { kind: 'adjusted_to_signal_session', anchorSession: signalSession,
      adjustmentVersion: 'tw-corporate-action-v3.1', adjustmentEvidenceHash: 'b'.repeat(64), status: 'verified' },
    calendar: { version: 'synthetic-official-calendar', knownAt: `${signalSession}T06:02:00Z`, completedSessions: sessions,
      signalSession, signalCloseAt: `${signalSession}T05:30:00Z`, nextSession: '2026-12-01',
      nextOpenAt: '2026-12-01T01:00:00Z', nextCloseAt: '2026-12-01T05:30:00Z' },
  } };
  const calendar: Row[] = sessions.slice(-61).map((session, i) => ({ session_authority_id: id(i + 1), session_id: session,
    market: exchange, open_at: `${session}T01:00:00Z`, close_at: `${session}T05:30:00Z`, status: 'completed',
    provider: exchange.toLowerCase(), source_timestamp: `${session}T06:00:00Z`, collected_at: `${session}T06:01:00Z`,
    recorded_at: `${session}T06:02:00Z`, source_ref: `${exchange.toLowerCase()}-synthetic-calendar` }));
  const market: Row[] = calendar.map((row, i) => ({ observation_id: id(i + 1000), fact_key: exchange === 'TWSE' ? 'taiex_close' : 'otc_close',
    scope_key: exchange === 'TWSE' ? 'TAIEX' : 'OTC', session_id: row.session_id, session_authority_id: row.session_authority_id,
    value: 500 + i, unit: 'index_points', provider: exchange.toLowerCase(), provider_identity: null,
    authority_date: row.session_id, provider_session_date: null, observed_at: `${row.session_id}T06:00:00Z`,
    collected_at: `${row.session_id}T06:01:00Z`, recorded_at: `${row.session_id}T06:02:00Z`,
    source_ref: `${exchange.toLowerCase()}-synthetic-index`, provider_revision: 'synthetic-v1' }));
  return { input, calendar, market };
}
function fakeDb(calendar: Row[], market: Row[], options: { truncate?: number; stall?: boolean; countMissing?: boolean;
  beforeResolve?: () => void } = {}) {
  const calls: { table: string; orders: string[]; from: number; to: number; signal?: AbortSignal }[] = [];
  const db = { from(table: string) {
    const source = table === 'tw_trading_sessions_v3' ? calendar : market;
    const filters: ((row: Row) => boolean)[] = [], orders: { key: string; ascending: boolean }[] = [];
    let from = 0, to = 499, signal: AbortSignal | undefined;
    const query = {
      select(_keys: string, config: { count: string }) { assert.equal(config.count, 'exact'); return query; },
      in(key: string, values: unknown[]) { filters.push((row) => values.includes(row[key])); return query; },
      eq(key: string, value: unknown) { filters.push((row) => row[key] === value); return query; },
      lte(key: string, value: string) { filters.push((row) => researchDeepInstant(row[key]) <= researchDeepInstant(value)); return query; },
      order(key: string, config?: { ascending: boolean }) { orders.push({ key, ascending: config?.ascending !== false }); return query; },
      range(a: number, b: number) { from = a; to = b; return query; },
      abortSignal(value: AbortSignal) { signal = value; return query; },
      then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
        calls.push({ table, orders: orders.map((order) => order.key), from, to, signal });
        if (options.stall) return new Promise(() => {});
        const rows = source.filter((row) => filters.every((filter) => filter(row))).sort((a, b) => {
          for (const order of orders) {
            const left = order.key === 'recorded_at' ? researchDeepInstant(a[order.key]) : String(a[order.key]);
            const right = order.key === 'recorded_at' ? researchDeepInstant(b[order.key]) : String(b[order.key]);
            if (left !== right) return (left < right ? -1 : 1) * (order.ascending ? 1 : -1);
          }
          return 0;
        });
        const page = rows.slice(from, to + 1).slice(0, options.truncate ?? Infinity);
        return Promise.resolve().then(() => {
          options.beforeResolve?.();
          return { data: page, error: null, count: options.countMissing ? null : rows.length };
        }).then(resolve, reject);
      },
    }; return query;
  } };
  return { db: db as never, calls };
}
for (const exchange of ['TWSE', 'TPEX'] as const) test(`${exchange}: official aligned61 context returns explicit wealth-ratio fractions`, () => {
  const { input, calendar, market } = fixture(exchange), result = calculate(input, calendar, market);
  assert.equal(result.available, true); assert.equal(result.unit, 'fraction'); assert.equal(result.coverageSessions, 61);
  for (const n of [5, 20, 60] as const) {
    const expected = (339 / (339 - n)) / (560 / (560 - n)) - 1;
    assert.equal(result.returns[n]!.relativeWealthRatioMinusOne, expected);
    assert.notEqual(expected, (339 / (339 - n) - 560 / (560 - n)) * 100);
  }
  assert.equal(result.strategyAuthority, false);
  assert.deepEqual(calculate(input, [...calendar].reverse(), [...market].reverse()), result);
});
test('missing session, insufficient authority and cancelled latest calendar never become zero strength', () => {
  const { input, calendar, market } = fixture();
  const cancelled = { ...calendar[0], session_authority_id: id(9000), status: 'cancelled', recorded_at: `${calendar[0].session_id}T07:00:00Z` };
  for (const result of [calculate(input, calendar, market.slice(1)), calculate(input, [cancelled, ...calendar], market),
    calculate({ ...input, authority: { ...input.authority, missingData: ['unavailable'] } }, calendar, market)]) {
    assert.equal(result.available, false); assert.equal(result.returns[5], null); assert.ok(result.missingData.length);
  }
});
test('latest calendar correction requires a matching latest official index observation', () => {
  const { input, calendar, market } = fixture();
  const revised = { ...calendar[0], session_authority_id: id(9001), recorded_at: `${calendar[0].session_id}T07:00:00.000100Z` };
  const missing = calculate(input, [...calendar, revised], market);
  assert.deepEqual(missing.missingData, ['benchmark_calendar_binding_invalid']);
  const corrected = { ...market[0], observation_id: id(9002), session_authority_id: revised.session_authority_id,
    recorded_at: `${calendar[0].session_id}T07:00:00.000101Z`, provider_revision: 'correction' };
  const result = calculate(input, [...calendar, revised], [...market, corrected]);
  assert.equal(result.available, true); assert.notEqual(result.contextHash, calculate(input, calendar, market).contextHash);
  const obsolete = { ...corrected, observation_id: id(9003), session_authority_id: market[0].session_authority_id,
    recorded_at: `${calendar[0].session_id}T07:00:00.000102Z` };
  assert.equal(calculate(input, [...calendar, revised], [...market, corrected, obsolete]).available, false);
});
test('wrong authority/unit/provider, invalid clocks and conflicts are unavailable', () => {
  const { input, calendar, market } = fixture();
  for (const patch of [{ provider: 'finmind' }, { unit: 'TWD' }, { scope_key: 'OTC' }, { value: 0 },
    { authority_date: '2000-01-01' }, { provider_identity: 'pretend' }, { session_authority_id: id(9999) },
    { observed_at: `${market[0].session_id}T05:00:00Z` }, { recorded_at: '2099-01-01T00:00:00Z' },
    { recorded_at: `${market[0].session_id}T06:02:00.0000001Z` }])
    assert.equal(calculate(input, calendar, [{ ...market[0], ...patch }, ...market.slice(1)]).available, false);
  for (const rows of [[...market, { ...market[0], observation_id: id(9991), value: 100 }],
    [{ ...market[0], observation_id: id(9991), value: 100 }, ...market]])
    assert.deepEqual(calculate(input, calendar, rows).missingData, ['benchmark_conflicting_head']);
  const tie = { ...calendar[0], session_authority_id: id(9990) };
  assert.deepEqual(calculate(input, [tie, ...calendar], market), calculate(input, [...calendar, tie], market));
});
test('corporate action price basis and source revision are bound without changing authority', () => {
  const { input, calendar, market } = fixture(), old = calculate(input, calendar, market);
  const changed = calculate({ ...input, authority: { ...input.authority, sourceDatasetRevision: 'corrected',
    priceBasis: { ...input.authority.priceBasis!, adjustmentEvidenceHash: 'c'.repeat(64) } } }, calendar, market);
  assert.equal(changed.available, true); assert.notEqual(changed.contextHash, old.contextHash);
});
test('actual adapter requests official relations, unique order, exact count and abort signal', async () => {
  const { input, calendar, market } = fixture(), { db, calls } = fakeDb(calendar, market);
  const result = await load(db, input); assert.equal(result.available, true);
  assert.deepEqual(result, calculate(input, calendar, market)); assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].orders, ['session_id', 'recorded_at', 'session_authority_id']);
  assert.deepEqual(calls[1].orders, ['session_id', 'recorded_at', 'observation_id']);
  assert.equal(calls[0].signal, calls[1].signal); assert.equal(calls[0].signal!.aborted, true);
});
test('short server page and absent exact count refuse successful-partial reads', async () => {
  const { input, calendar, market } = fixture();
  for (const options of [{ truncate: 10 }, { countMissing: true }]) {
    const { db } = fakeDb(calendar, market, options);
    assert.deepEqual((await load(db, input)).missingData, ['benchmark_read_incomplete']);
  }
});
test('future revision is excluded by the same frozen server cutoff', async () => {
  const { input, calendar, market } = fixture(), expected = calculate(input, calendar, market);
  const future = { ...market[0], observation_id: id(9009), value: 9999, recorded_at: '2099-01-01T00:00:00Z' };
  assert.deepEqual(await load(fakeDb(calendar, [...market, future]).db, input), expected);
});
test('equal-time conflict across500-row pages is never hidden', async () => {
  const { input, calendar, market } = fixture();
  const revisions = Array.from({ length: 501 }, (_, i) => ({ ...market[0], observation_id: id(100_000 + i),
    recorded_at: `${market[0].session_id}T07:00:00Z`, value: i === 500 ? 999 : market[0].value }));
  const { db, calls } = fakeDb(calendar, [...market, ...revisions]);
  assert.deepEqual((await load(db, input)).missingData, ['benchmark_conflicting_head']);
  assert.equal(calls.filter((call) => call.table === 'opportunity_market_observations_v3').length, 2);
});
test('shared deadline aborts stalled read and never starts another page', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { input, calendar, market } = fixture(), { db, calls } = fakeDb(calendar, market, { stall: true });
  const result = load(db, input); await Promise.resolve();
  t.mock.timers.tick(limits.deadlineMs);
  assert.deepEqual((await result).missingData, ['benchmark_deadline']);
  assert.equal(calls.length, 1); assert.equal(calls[0].signal!.aborted, true);
});
test('successful response delivered after the monotonic deadline is discarded', async (t) => {
  let now = 0;
  t.mock.method(performance, 'now', () => now);
  const { input, calendar, market } = fixture();
  const { db, calls } = fakeDb(calendar, market, { beforeResolve: () => { now = limits.deadlineMs + 1; } });
  assert.deepEqual((await load(db, input)).missingData, ['benchmark_deadline']);
  assert.equal(calls.length, 1); assert.equal(calls[0].signal!.aborted, true);
});
test('row bound exact and+1 remain finite', () => {
  const { input, calendar, market } = fixture();
  const revisions = Array.from({ length: limits.marketRows - market.length }, (_, i) => ({ ...market[0],
    observation_id: id(200_000 + i), recorded_at: `${market[0].session_id}T07:00:00.${String(i + 1).padStart(6, '0')}Z` }));
  const exact = [...market, ...revisions]; assert.equal(calculate(input, calendar, exact).available, true);
  assert.deepEqual(calculate(input, calendar, [...exact, { ...market[0], observation_id: id(999_999) }]).missingData, ['benchmark_row_bound']);
});
test('all-read serialized byte exact and+1 include discarded revisions', async () => {
  const { input, calendar, market } = fixture();
  const revisions = Array.from({ length: 1000 }, (_, i) => ({ ...market[0], observation_id: id(300_000 + i),
    source_ref: 's'.repeat(3500), provider_revision: 'r'.repeat(3500),
    recorded_at: `${market[0].session_id}T07:00:00.${String(i + 1).padStart(6, '0')}Z` }));
  const rows = [...market, ...revisions];
  let remaining = limits.readBytes - Buffer.byteLength(JSON.stringify([calendar, rows]));
  assert.ok(remaining > 0);
  for (const row of revisions) for (const key of ['source_ref', 'provider_revision'] as const) {
    const extra = Math.min(4096 - row[key].length, remaining); row[key] += 'x'.repeat(extra); remaining -= extra;
  }
  assert.equal(remaining, 0); assert.equal(Buffer.byteLength(JSON.stringify([calendar, rows])), limits.readBytes);
  assert.equal(calculate(input, calendar, rows).available, true);
  assert.equal((await load(fakeDb(calendar, rows).db, input)).available, true);
  const row = revisions.find((candidate) => candidate.source_ref.length < 4096)!;
  row.source_ref += 'x';
  assert.deepEqual(calculate(input, calendar, rows).missingData, ['benchmark_byte_bound']);
  assert.deepEqual((await load(fakeDb(calendar, rows).db, input)).missingData, ['benchmark_byte_bound']);
});
