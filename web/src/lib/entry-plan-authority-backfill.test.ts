import assert from 'node:assert/strict';
import test from 'node:test';
import { parseAuthorityBackfillRequest, planAuthorityJobs } from './entry-plan-authority-backfill.ts';
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
