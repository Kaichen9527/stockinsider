import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeCandidateHistoryInputs, parseCandidateHistoryBatchRequest, runCandidateHistoryBackfillBatch } from './candidate-history-backfill-batch.ts';
import { candidateHistoryBackfillResponse } from './candidate-history-backfill-api.ts';
import { runCandidateHistoryBackfill } from './candidate-history-backfill.ts';
import { twStockHistoryMonthUrl } from './tw-market.ts';

const defaults = { requestBudget: 80, perStockBudget: 4 };
const source = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2330';
const metadata = [{ stockId: 'stock-a', symbol: '2330', exchange: 'TWSE' as const }];
const cached = { stock_id: 'stock-a', session_date: '2026-09-10', open: 100, high: 105, low: 99, close: 101, volume: 1000, source_url: source, provenance: { provider: 'official_primary' } };
const authority = { stock_id: 'stock-a', session_id: '2026-09-10', raw_open: 100, raw_high: 105, raw_low: 99, raw_close: 101, volume: 1000, provider: 'twse', source_ref: 'twse:daily' };
const multiple = { stock_id: 'stock-a', month_end: '2026-09-10', pe_ratio: 20, pb_ratio: 3,
  source_url: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260910', quality_status: 'valid', provenance: { provider: 'official_primary' } };

test('backfill accepts only bounded budgets and no caller-controlled cutoff, universe or URLs', () => {
  assert.deepEqual(parseCandidateHistoryBatchRequest({}), defaults);
  assert.deepEqual(parseCandidateHistoryBatchRequest({ requestBudget: 400, perStockBudget: 12 }), { requestBudget: 400, perStockBudget: 12 });
  for (const row of [{ requestBudget: 0 }, { requestBudget: 401 }, { requestBudget: '80' }, { perStockBudget: 13 },
    { perStockBudget: 0 }, { requestBudget: 1.2 }, { requestBudget: null }, { perStockBudget: null },
    { evaluationAt: '2026-01-01' }, { symbols: ['2330'] }, { sourceUrl: source }, []]) {
    assert.equal(parseCandidateHistoryBatchRequest(row), null);
  }
});

test('only official validated history is known; mirror, quarantined, spoofed and conflicting rows remain gaps', () => {
  const valid = normalizeCandidateHistoryInputs(metadata, [cached], [authority], [multiple], '2026-09-10');
  assert.deepEqual(valid.candidates[0].knownPriceSessions, ['2026-09-10']);
  assert.deepEqual(valid.candidates[0].knownMultipleSessions, ['2026-09-10']);
  assert.deepEqual(valid.conflicts, []);
  const rejected = normalizeCandidateHistoryInputs(metadata,
    [{ ...cached, provenance: { provider: 'finmind' } }, { ...cached, source_url: 'https://attacker.example/?official=' + source }],
    [{ ...authority, provider: 'finmind' }], [{ ...multiple, quality_status: 'quarantined' },
      { ...multiple, source_url: 'https://attacker.example/?official=' + multiple.source_url }], '2026-09-10');
  assert.deepEqual(rejected.candidates[0].knownPriceSessions, []);
  assert.deepEqual(rejected.candidates[0].knownMultipleSessions, []);
  for (const bad of [{ ...authority, raw_close: 102 }, { ...authority, volume: 1100 }]) {
    const conflict = normalizeCandidateHistoryInputs(metadata, [cached], [bad], [], '2026-09-10');
    assert.equal(conflict.conflicts.length, 1);
    assert.deepEqual(conflict.candidates[0].knownPriceSessions, []);
  }
  const marked = normalizeCandidateHistoryInputs(metadata, [{ ...cached, provenance: { integrityStatus: 'conflict' } }], [authority], [], '2026-09-10');
  assert.equal(marked.conflicts.length, 1);
  assert.deepEqual(marked.candidates[0].knownPriceSessions, []);
});

function fixtureClient(options: { calendarCount?: number; shortPage?: number; stockCount?: number; complete?: boolean; failTable?: string } = {}) {
  const calendar = Array.from({ length: 1950 }, (_, i) => new Date(Date.UTC(2021, 0, 1 + i)))
    .filter((date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6).slice(-(options.calendarCount ?? 1320))
    .map((date) => date.toISOString().slice(0, 10));
  const stocks = Array.from({ length: options.stockCount ?? 1 }, (_, index) => ({ stock_id: `stock-${index}`, symbol: String(2000 + index), exchange: 'TWSE', name: `Company ${index}` }));
  const tableCalls: Array<{ table: string; ids: string[]; from: number; to: number }> = [];
  const rpcCalls: Array<{ name: string; from: number }> = [];
  const knownPrices = options.complete ? stocks.flatMap((stock) => calendar.map((session_date) => ({ ...cached, stock_id: stock.stock_id, session_date }))) : [];
  const byMonth = new Map<string, string>(); calendar.forEach((date) => byMonth.set(date.slice(0, 7), date));
  const knownMultiples = options.complete ? stocks.flatMap((stock) => [...byMonth.values()].map((month_end) => ({ ...multiple, stock_id: stock.stock_id, month_end }))) : [];
  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      const from = Number(args.p_page_offset || 0); rpcCalls.push({ name, from });
      if (name === 'complete_candidate_history_month_v1') return { data: { status: args.p_status, terminal_reason: args.p_terminal_reason }, error: null };
      if (name === 'read_taiwan_data_candidate_universe_v6') return { data: stocks.filter((row) => row.symbol > String(args.p_after_symbol)).slice(0, options.shortPage ?? Number(args.p_limit)).map(({ symbol, exchange }) => ({ symbol, exchange })), error: null };
      const rows = name === 'candidate_research_official_sessions_page' ? calendar.slice().reverse().map((session_date) => ({ session_date })) : stocks;
      return { data: rows.slice(from, from + Math.min(Number(args.p_page_limit), options.shortPage ?? 500)), error: null };
    },
    from(table: string) {
      let ids: string[] = [];
      const query = {
        select() { return this; }, in(_key: string, value: string[]) { ids = value; return this; },
        gte() { return this; }, lte() { return this; }, order() { return this; },
        range(from: number, to: number) {
          tableCalls.push({ table, ids, from, to });
          if (table === options.failTable) return Promise.resolve({ data: null, error: { message: 'fixture database failure' } });
          const rows = table === 'official_price_history' ? knownPrices : table === 'official_multiple_history' ? knownMultiples : [];
          return Promise.resolve({ data: rows.filter((row) => ids.includes(row.stock_id)).slice(from, Math.min(to + 1, from + (options.shortPage ?? 500))), error: null });
        },
      }; return query;
    },
  } as unknown as SupabaseClient;
  return { client, calendar, stocks, tableCalls, rpcCalls };
}
const now = () => new Date('2026-09-11T10:00:00Z');

test('a successful bounded batch never claims the cold universe is fully backfilled', async () => {
  const fixture = fixtureClient({ stockCount: 85, shortPage: 79 });
  let calls = 0;
  const result = await runCandidateHistoryBackfillBatch(fixture.client, defaults, { now, runBackfill: async (input) => {
    calls += 1; assert.equal(input.candidates.length, 85); assert.equal(input.officialSessions.length, 1320);
    assert.equal(input.requestBudget, 80); assert.equal(input.perStockBudget, 4);
    return { policyVersion: 'candidate-history-month-v1', attempted: 1, prices: new Map(), multiples: new Map(), conflicts: [],
      items: [{ stockId: input.candidates[0].stockId, dataset: 'price', month: '2026-05-01', status: 'retry', terminalReason: 'official_timeout', rows: 0 }] };
  } });
  assert.equal(calls, 1);
  assert.equal(result.batchComplete, true);
  assert.equal(result.universeCoverageComplete, false);
  assert.equal(result.retryJobs, 1);
  assert.equal(result.remaining.candidates, 85);
  assert.equal(result.remaining.priceSessions, 85 * 1320);
  assert.equal(fixture.tableCalls.every((call) => call.ids.length <= 40 && call.to - call.from < 500), true);
  assert(fixture.rpcCalls.some((call) => call.name === 'candidate_research_official_sessions_page' && call.from > 1000));
});

test('actual full persisted price and monthly evidence can complete coverage without doing unnecessary work', async () => {
  const fixture = fixtureClient({ complete: true, shortPage: 83 });
  const result = await runCandidateHistoryBackfillBatch(fixture.client, defaults, { now, runBackfill: async (input) => {
    assert.equal(input.candidates[0].knownPriceSessions.length, 1320);
    return { policyVersion: 'candidate-history-month-v1', attempted: 0, prices: new Map(), multiples: new Map(), conflicts: [], items: [] };
  } });
  assert.equal(result.universeCoverageComplete, true);
  assert.equal(result.remaining.priceSessions, 0);
  assert.equal(result.remaining.multipleMonths, 0);
  assert(fixture.tableCalls.some((call) => call.table === 'official_price_history' && call.from > 1000));
});

test('one operator batch reuses the real monthly worker with mocked downloads and atomic receipts', async () => {
  const fixture = fixtureClient();
  let downloads = 0;
  const result = await runCandidateHistoryBackfillBatch(fixture.client, { requestBudget: 2, perStockBudget: 2 }, {
    now, runBackfill: (input) => runCandidateHistoryBackfill(input, { fetchMonth: async (job) => {
      downloads += 1;
      const sourceUrl = twStockHistoryMonthUrl(job);
      return { bars: job.dataset === 'price' ? fixture.calendar.filter((session) => session.startsWith(job.month.slice(0, 7))).map((time) => ({ time, open: 100, high: 105, low: 99, close: 101, volume: 1000,
        sourceUrl, provider: 'official_primary' as const, authorityTier: 'official_primary' as const })) : [],
      multiples: job.dataset === 'multiple' ? [{ date: job.lastSession!, peRatio: 20, pbRatio: 3, sourceUrl,
        provider: 'official_primary' as const, authorityTier: 'official_primary' as const }] : [],
      sourceUrl, httpStatus: 200, terminalReason: 'complete' };
    } }),
  });
  assert.equal(downloads, 2);
  assert.equal(fixture.rpcCalls.filter((call) => call.name === 'complete_candidate_history_month_v1').length, 2);
  assert.equal(result.batchComplete, true);
  assert.equal(result.successfulJobs, 2);
  assert.equal(result.universeCoverageComplete, false);
  assert(result.perStock[0].priceSessionsCovered > 0);
  assert.equal(result.perStock[0].multipleMonthsCovered, 1);
});

test('missing authoritative calendar and database-read failures stop before any backfill writes', async () => {
  let called = false;
  const runBackfill = async () => { called = true; throw new Error('must not run'); };
  await assert.rejects(runCandidateHistoryBackfillBatch(fixtureClient({ calendarCount: 1000 }).client, defaults, { now, runBackfill }), /official_calendar_history_incomplete/u);
  await assert.rejects(runCandidateHistoryBackfillBatch(fixtureClient({ failTable: 'official_price_history' }).client, defaults, { now, runBackfill }), /history_cached_price_read_failed/u);
  assert.equal(called, false);
});

test('route boundary rejects unauthorized, malformed and inactive writers before executing a batch', async () => {
  let touched = 0;
  const writer = async () => { touched += 1; return { ok: false as const, error: 'writer_release_not_active' }; };
  const request = (body: string) => new Request('http://localhost/api/internal/candidate-history-backfill', { method: 'POST', body });
  assert.equal((await candidateHistoryBackfillResponse(request('{}'), { authorized: () => false, writer })).status, 401);
  assert.equal((await candidateHistoryBackfillResponse(request('{'), { authorized: () => true, writer })).status, 422);
  assert.equal((await candidateHistoryBackfillResponse(request('{"requestBudget":401}'), { authorized: () => true, writer })).status, 422);
  assert.equal(touched, 0);
  assert.equal((await candidateHistoryBackfillResponse(request('{}'), { authorized: () => true, writer })).status, 409);
  assert.equal(touched, 1);
});
