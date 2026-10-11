import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthorityBackfillRequest, planAuthorityJobs, summarizeAuthorityJobPages } from './entry-plan-authority-backfill.ts';

test('authority completion summary includes every page and fails on invalid status', async () => {
  const jobs = Array.from({ length: 1001 }, (_, index) => ({
    status: index === 1000 ? 'pending' : 'complete', accepted_rows: index === 1000 ? 0 : 1,
    missing_rows: 0,
  }));
  const requests: Array<[number, number]> = [];
  const summary = await summarizeAuthorityJobPages(async (from, to) => {
    requests.push([from, to]);
    return jobs.slice(from, to + 1);
  });
  assert.deepEqual(requests, [[0, 999], [1000, 1999]]);
  assert.equal(summary.counts.pending, 1);
  assert.equal(summary.counts.complete, 1000);
  assert.equal(summary.acceptedRows, 1000);
  await assert.rejects(summarizeAuthorityJobPages(async () => [
    { status: 'toString', accepted_rows: 0, missing_rows: 0 },
  ]), /entry_plan_jobs_status_invalid/u);
});
import { loadOfficialPriceHistoryMonth } from './generated/official-authority/official-twse-valuation.js';

test('authority-only request accepts no caller-supplied prices, roster or fabricated sessions', () => {
  assert.deepEqual(parseAuthorityBackfillRequest({ purpose: 'entry_plan_authority' }),
    { purpose: 'entry_plan_authority', runId: null, requestBudget: 12 });
  assert.deepEqual(parseAuthorityBackfillRequest({ purpose: 'entry_plan_authority', requestBudget: 24 }),
    { purpose: 'entry_plan_authority', runId: null, requestBudget: 24 });
  for (const value of [
    { purpose: 'entry_plan_authority', requestBudget: 25 },
    { purpose: 'entry_plan_authority', symbols: ['2330'] },
    { purpose: 'entry_plan_authority', prices: [{ close: 100 }] },
    { purpose: 'entry_plan_authority', sourceCutoff: '2025-01-01T00:00:00Z' },
    { purpose: 'entry_plan_authority', runId: 'not-a-uuid' },
  ]) assert.equal(parseAuthorityBackfillRequest(value), null);
});

test('frozen common-stock roster generates per-stock-month and exchange-range jobs with no candidate omissions', () => {
  const dates = Array.from({ length: 41 }, (_, index) => new Date(Date.UTC(2026, 7, index + 1)).toISOString().slice(0, 10));
  const frozen = (market: 'TWSE' | 'TPEX') => dates.map((session, index) => ({
    market, session, sessionAuthorityId: String(index), status: 'completed' as const,
  }));
  const jobs = planAuthorityJobs({ run_id: 'run', roster: [
    { stockId: 'a', symbol: '2330', exchange: 'TWSE' },
    { stockId: 'b', symbol: '2409', exchange: 'TWSE' },
    { stockId: 'c', symbol: '8299', exchange: 'TPEx' },
  ], calendar: { TWSE: frozen('TWSE'), TPEX: frozen('TPEX') } });
  assert.deepEqual(new Set(jobs.filter((job) => job.kind === 'price_month').map((job) => job.symbol)),
    new Set(['2330', '2409', '8299']));
  assert.equal(jobs.filter((job) => job.kind === 'action_range').length, 4);
  assert.ok(jobs.filter((job) => job.kind === 'action_range').every((job) => (job.sessions as string[]).length <= 20));
  assert.equal(new Set(jobs.map((job) => job.job_key)).size, jobs.length);
});

test('official monthly price acquisition records the real source and retains OHLCV and turnover', async () => {
  const requested: string[] = [];
  const result = await loadOfficialPriceHistoryMonth({ exchange: 'TWSE', symbol: '2409', month: '2026-09',
    fetchImpl: async (url: RequestInfo | URL, options?: RequestInit) => {
      requested.push(String(url));
      assert.equal(options?.redirect, 'error');
      return new Response(JSON.stringify({ stat: 'OK', title: '115年09月 2409 友達 各日成交資訊',
        fields: ['日期', '成交股數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
        data: [['115/09/23', '1,000', '36,000', '35', '37', '34', '36']] }), { status: 200 });
    } });
  assert.equal(requested.length, 1);
  assert.match(result.url, /stockNo=2409/u);
  assert.match(result.responseSha256, /^[a-f0-9]{64}$/u);
  assert.deepEqual(result.rows.map((row: Record<string, unknown>) => ({ session: row.session, open: row.open,
    high: row.high, low: row.low, close: row.close, volume: row.volume, turnoverTwd: row.turnoverTwd })),
  [{ session: '2026-09-23', open: 35, high: 37, low: 34, close: 36, volume: 1000, turnoverTwd: 36000 }]);
});

test('official monthly source distinguishes a confirmed empty report from a failed or changed schema', async () => {
  const input = { exchange: 'TWSE', symbol: '2409', month: '2026-09' };
  const empty = await loadOfficialPriceHistoryMonth({ ...input, fetchImpl: async () =>
    new Response(JSON.stringify({ stat: '很抱歉，沒有符合條件的資料!', total: 0 }), { status: 200 }) });
  assert.deepEqual(empty.rows, []);
  await assert.rejects(loadOfficialPriceHistoryMonth({ ...input, fetchImpl: async () =>
    new Response(JSON.stringify({ stat: 'maintenance', data: [] }), { status: 200 }) }), /official_price_month_schema/u);
});

import type { SupabaseClient } from '@supabase/supabase-js';
import { calendarFor, AUTHORITY_CALENDAR_LIMITS } from './entry-plan-authority-backfill.ts';

type CalendarRow = Record<string, unknown>;
const calendarCutoff = '2026-10-11T12:00:00.000Z';
const authorityId = (index: number) => `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
function calendarRows(days: number, revisions = 1, market = 'TWSE'): CalendarRow[] {
  return Array.from({ length: days }, (_, index) => {
    const session = new Date(Date.UTC(2026, 9, 10) - index * 86_400_000).toISOString().slice(0, 10);
    return Array.from({ length: revisions }, (_, revision) => ({
      session_id: session, session_authority_id: authorityId(index * revisions + revision), market,
      status: 'completed', provider: market.toLowerCase(),
      source_timestamp: '2026-10-09T00:00:00.000Z', collected_at: '2026-10-09T01:00:00.000Z',
      recorded_at: new Date(Date.UTC(2026, 9, 10, 8) - revision * 1000).toISOString(),
      close_at: `${session}T05:30:00.000Z`,
    }));
  }).flat();
}
function calendarClient(rows: CalendarRow[], options: { stall?: boolean; unfiltered?: boolean; oversize?: boolean } = {}) {
  const state = { requests: [] as Array<[number, number]>, filters: [] as Array<[string, string]>, signal: undefined as AbortSignal | undefined };
  const client = { from(table: string) {
    assert.equal(table, 'tw_trading_sessions_v3');
    const filters: Array<[string, string, string]> = [], orders: Array<[string, boolean]> = [];
    let from = 0, to = 0;
    const query = {
      select(columns: string) { assert.ok(columns.includes('recorded_at')); return query; },
      eq(key: string, value: string) { filters.push(['eq', key, value]); return query; },
      lte(key: string, value: string) { filters.push(['lte', key, value]); state.filters.push([key, value]); return query; },
      order(key: string, options?: { ascending?: boolean }) { orders.push([key, options?.ascending !== false]); return query; },
      range(first: number, last: number) { from = first; to = last; state.requests.push([from, to]); return query; },
      abortSignal(signal: AbortSignal) { state.signal = signal; return query; },
      then(resolve: (value: { data: CalendarRow[]; error: null }) => unknown) {
        if (options.stall) return new Promise(() => {});
        const filtered = options.unfiltered ? [...rows] : rows.filter(row => filters.every(([op, key, value]) =>
          op === 'eq' ? row[key] === value : key === 'session_id' ? String(row[key]) <= value : Date.parse(String(row[key])) <= Date.parse(value)));
        filtered.sort((a, b) => {
          for (const [key, ascending] of orders) {
            const delta = key === 'recorded_at' ? Date.parse(String(a[key])) - Date.parse(String(b[key])) : String(a[key]).localeCompare(String(b[key]));
            if (delta) return ascending ? delta : -delta;
          }
          return 0;
        });
        return Promise.resolve(resolve({ data: filtered.slice(from, to + 1 + (options.oversize ? 1 : 0)), error: null }));
      },
    };
    return query;
  } } as unknown as SupabaseClient;
  return { client, state };
}

test('calendar selects240 date heads beyond3000 revisions for both complete paginated dependencies', async () => {
  const markets = ['TWSE', 'TPEX'] as const;
  const dependencies = markets.map(market => calendarClient(calendarRows(1367, 10, market)));
  const results = await Promise.all(dependencies.map((dep, index) => calendarFor(dep.client, markets[index], calendarCutoff)));
  for (const [index, result] of results.entries()) {
    assert.equal(result.length, 240);
    assert.equal(result.at(-1)?.session, '2026-10-10');
    assert.equal(new Set(result.map(row => row.session)).size, 240);
    assert.equal(result[0].sessionAuthorityId, authorityId(2390));
    assert.ok(dependencies[index].state.requests.length >= 5);
    assert.deepEqual(dependencies[index].state.filters.slice(0, 4), [
      ['session_id', '2026-10-11'], ['source_timestamp', calendarCutoff], ['collected_at', calendarCutoff], ['recorded_at', calendarCutoff],
    ]);
  }
  // Above dependencies model the full disclosed1367-date history. A denser
  // bounded source proves the old3000 cap itself, rather than only many rows.
  const dense = calendarClient(calendarRows(250, 20));
  const result = await calendarFor(dense.client, 'TWSE', calendarCutoff);
  assert.equal(result.length, 240); assert.ok(dense.state.requests.at(-1)![0] > 3000);
});

test('cancelled latest date head never revives an older completed revision', async () => {
  const rows = calendarRows(242, 20); rows[0].status = 'cancelled';
  const result = await calendarFor(calendarClient(rows).client, 'TWSE', calendarCutoff);
  assert.equal(result.length, 240); assert.equal(result.at(-1)?.session, '2026-10-09');
  assert.ok(!result.some(row => row.session === '2026-10-10'));
});

test('boundary date is fully resolved across two full pages before returning240 heads', async () => {
  const rows = calendarRows(242);
  // 239 complete newer heads +261 identical head revisions = exactly500.
  const boundary = rows[239];
  const tied = Array.from({ length: 262 }, (_, index) => ({ ...boundary, session_authority_id: authorityId(1000 + index) }));
  tied[261].status = 'cancelled';
  const source = [...rows.slice(0, 239), ...tied, ...rows.slice(240), ...Array.from({ length: 500 }, (_, index) => ({ ...boundary,
    session_id: '2025-01-01', close_at: '2025-01-01T05:30:00.000Z', session_authority_id: authorityId(5000 + index) }))];
  const dependency = calendarClient(source);
  await assert.rejects(calendarFor(dependency.client, 'TWSE', calendarCutoff), /entry_plan_calendar_head_conflict/u);
  assert.deepEqual(dependency.state.requests.slice(0, 2), [[0, 499], [500, 999]]);
});

test('late/future revisions are excluded at all three original cutoffs; future close and wrong provider do not revive dates', async () => {
  const rows = calendarRows(243);
  const newer = rows.slice(0, 3).map((row, index) => ({ ...row, session_authority_id: authorityId(3000 + index), status: 'cancelled',
    source_timestamp: index === 0 ? '2026-10-12T01:00:00Z' : row.source_timestamp,
    collected_at: index === 1 ? '2026-10-12T01:00:00Z' : row.collected_at,
    recorded_at: '2026-10-12T02:00:00Z' }));
  const known = await calendarFor(calendarClient([...rows, ...newer]).client, 'TWSE', calendarCutoff);
  assert.equal(known.at(-1)?.session, '2026-10-10');
  rows[0].close_at = '2026-10-12T01:00:00Z'; rows[1].provider = 'tpex';
  const excluded = await calendarFor(calendarClient(rows).client, 'TWSE', calendarCutoff);
  assert.equal(excluded.at(-1)?.session, '2026-10-08'); assert.equal(excluded.length, 240);
  const future = { ...rows[2], recorded_at: '2026-10-12T00:00:00Z' };
  await assert.rejects(calendarFor(calendarClient([future], { unfiltered: true }).client, 'TWSE', calendarCutoff), /entry_plan_calendar_clock_invalid/u);
});

test('calendar clocks and same-head conflicts retain microsecond precision', async () => {
  const rows = calendarRows(241);
  rows[0].source_timestamp = '2026-10-10T08:00:00.000002Z'; rows[0].collected_at = '2026-10-10T08:00:00.000001Z';
  await assert.rejects(calendarFor(calendarClient(rows).client, 'TWSE', calendarCutoff), /entry_plan_calendar_clock_invalid/u);
  const original = calendarRows(241);
  original[0].recorded_at = '2026-10-10T08:00:00.000002Z';
  const older = { ...original[0], status: 'cancelled', recorded_at: '2026-10-10T08:00:00.000001Z', session_authority_id: authorityId(9000) };
  const result = await calendarFor(calendarClient([...original, older]).client, 'TWSE', calendarCutoff);
  assert.equal(result.at(-1)?.session, '2026-10-10');
});

test('short history rejects instead of accepting a prefix as240 sessions', async () => {
  await assert.rejects(calendarFor(calendarClient(calendarRows(239, 20)).client, 'TWSE', calendarCutoff), /entry_plan_calendar_240_missing:TWSE/u);
});

test('row cap exhaustion and exactly-full final boundary require proof of end, never truncate success', async () => {
  const repeated = calendarRows(1, AUTHORITY_CALENDAR_LIMITS.rows + 1);
  await assert.rejects(calendarFor(calendarClient(repeated).client, 'TWSE', calendarCutoff), /entry_plan_calendar_row_limit:TWSE/u);
  const exact = calendarClient(repeated.slice(0, AUTHORITY_CALENDAR_LIMITS.rows));
  await assert.rejects(calendarFor(exact.client, 'TWSE', calendarCutoff), /entry_plan_calendar_240_missing:TWSE/u);
  assert.deepEqual(exact.state.requests.at(-1), [20_000, 20_000]);
});

test('oversized page and UTF8 page/aggregate budgets fail closed', async () => {
  await assert.rejects(calendarFor(calendarClient(calendarRows(501), { oversize: true }).client, 'TWSE', calendarCutoff), /entry_plan_calendar_page_oversized/u);
  const large = calendarRows(1); large[0].padding = '字'.repeat(AUTHORITY_CALENDAR_LIMITS.pageBytes / 3);
  await assert.rejects(calendarFor(calendarClient(large).client, 'TWSE', calendarCutoff), /entry_plan_calendar_byte_limit:TWSE/u);
  const aggregate = calendarRows(1, 15_000).map(row => ({ ...row, padding: 'x'.repeat(600) }));
  await assert.rejects(calendarFor(calendarClient(aggregate).client, 'TWSE', calendarCutoff), /entry_plan_calendar_byte_limit:TWSE/u);
});

test('a stalled calendar query aborts within the fixed shared30-second deadline', { timeout: 35_000 }, async () => {
  const dep = calendarClient([], { stall: true }); const begin = performance.now();
  await assert.rejects(calendarFor(dep.client, 'TWSE', calendarCutoff), /entry_plan_calendar_time_limit/u);
  assert.ok(performance.now() - begin < 34_000); assert.equal(dep.state.signal?.aborted, true);
});
