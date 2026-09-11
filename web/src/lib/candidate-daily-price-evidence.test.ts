import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { persistCandidateDailyPriceEvidence } from './candidate-history-backfill.ts';
import type { TwMarketDailyBar } from './tw-market.ts';

const sourceUrl = 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2330&date=20260901';
const bar = (time: string, change: Partial<TwMarketDailyBar> = {}): TwMarketDailyBar => ({
  time, open: 100, high: 102, low: 99, close: 101, volume: 1000,
  provider: 'official_primary', authorityTier: 'official_primary', integrityStatus: 'valid', sourceUrl, ...change,
});
const calendar = ['2026-08-31', '2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-07'];
function clientWithRpc(handler?: (args: Record<string, unknown>) => unknown) {
  const calls: Array<Record<string, unknown>> = [];
  const client = { from() { throw new Error('raw_history_upsert_forbidden'); }, async rpc(name: string, args: Record<string, unknown>) {
    assert.equal(name, 'complete_candidate_history_month_v1'); calls.push(args);
    return handler ? handler(args) : { data: { status: args.p_status, terminal_reason: args.p_terminal_reason }, error: null };
  } } as unknown as SupabaseClient;
  return { client, calls };
}
function input(client: SupabaseClient, bars: TwMarketDailyBar[]) {
  return { client, stockId: 'stock-a', bars, officialSessions: calendar, latestSession: '2026-09-07' };
}

test('same-value daily replay uses only the append RPC and leaves first available_at to the database', async () => {
  const { client, calls } = clientWithRpc();
  const evidence = bar('2026-09-07');
  const first = await persistCandidateDailyPriceEvidence(input(client, [evidence]));
  const replay = await persistCandidateDailyPriceEvidence(input(client, [evidence]));
  assert.deepEqual(first.acceptedBars, [evidence]);
  assert.deepEqual(replay.acceptedBars, first.acceptedBars);
  assert.equal(calls.length, 2);
  assert.equal(calls.every((call) => call.p_status === 'retry' && call.p_terminal_reason === 'daily_refresh_partial'), true);
  assert.equal(calls.every((call) => Date.parse(String(call.p_next_attempt_at)) > Date.parse(String(call.p_attempted_at))), true);
  assert.notEqual(calls[0].p_attempted_at, calls[1].p_attempted_at);
  assert.deepEqual(calls[0].p_prices, [evidence]);
  assert.equal('available_at' in (calls[0].p_prices as Record<string, unknown>[])[0], false);
  assert.deepEqual(calls[0].p_multiples, []);
});

test('only submitted rows covering every official session can complete a month', async () => {
  const { client, calls } = clientWithRpc();
  const rows = calendar.slice(1).map((date) => bar(date));
  const result = await persistCandidateDailyPriceEvidence(input(client, rows));
  assert.equal(calls[0].p_status, 'complete');
  assert.equal(calls[0].p_next_attempt_at, null);
  assert.equal(result.acceptedBars.length, 5);
  const distinctSources = clientWithRpc();
  await persistCandidateDailyPriceEvidence(input(distinctSources.client,
    rows.map((row) => ({ ...row, sourceUrl: `https://www.twse.com.tw/exchangeReport/MI_INDEX?date=${row.time}` }))));
  assert.equal(distinctSources.calls.length, 5);
  assert.equal(distinctSources.calls.every((call) => call.p_status === 'retry'), true);
  for (const call of distinctSources.calls) {
    assert.equal((call.p_prices as TwMarketDailyBar[]).every((row) => row.sourceUrl === call.p_source_url), true);
  }
});

test('database conflicts propagate and prevent accepting any evidence from the conflicted month', async () => {
  const { client, calls } = clientWithRpc((args) => ({ data: args.p_source_url === `${sourceUrl}&revision=2`
    ? { status: 'conflict', terminal_reason: 'official_history_existing_row_conflict' }
    : { status: args.p_status, terminal_reason: args.p_terminal_reason }, error: null }));
  const result = await persistCandidateDailyPriceEvidence(input(client, [bar('2026-09-07'),
    bar('2026-09-07', { close: 102, sourceUrl: `${sourceUrl}&revision=2` })]));
  assert.equal(calls.length, 2);
  assert.deepEqual(result.acceptedBars, []);
  assert.deepEqual(result.conflicts, [{ stockId: 'stock-a', dataset: 'price', month: '2026-09-01',
    terminalReason: 'official_history_existing_row_conflict' }]);
});

test('fallback, unverified, non-price and spoofed sources never reach the append RPC', async () => {
  const { client, calls } = clientWithRpc();
  const result = await persistCandidateDailyPriceEvidence(input(client, [
    bar('2026-09-07', { provider: 'finmind_fallback' }),
    bar('2026-09-07', { authorityTier: 'unverified' }),
    bar('2026-09-07', { sourceUrl: 'https://www.twse.com.tw.evil.example/exchangeReport/STOCK_DAY' }),
    bar('2026-09-07', { sourceUrl: 'https://www.twse.com.tw/exchangeReport/BWIBBU_d' }),
    bar('2026-09-07', { sourceUrl: sourceUrl.replace('https:', 'http:') }),
  ]));
  assert.deepEqual(result, { acceptedBars: [], conflicts: [], items: [] });
  assert.equal(calls.length, 0);
});

test('an acquisition provider conflict persists quarantine without inserting disputed bars', async () => {
  const { client, calls } = clientWithRpc();
  const result = await persistCandidateDailyPriceEvidence(input(client, [bar('2026-09-04'),
    bar('2026-09-07', { integrityStatus: 'conflict', conflictProviders: ['official_primary', 'finmind_fallback'] })]));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].p_status, 'conflict');
  assert.deepEqual(calls[0].p_prices, []);
  assert.deepEqual(calls[0].p_multiples, []);
  assert.equal(calls[0].p_source_url, sourceUrl);
  assert.deepEqual(result.acceptedBars, []);
  assert.deepEqual(result.conflicts, [{ stockId: 'stock-a', dataset: 'price', month: '2026-09-01',
    terminalReason: 'official_history_provider_conflict' }]);
});

test('a later clean daily batch cannot turn a persisted month conflict into accepted evidence', async () => {
  const { client } = clientWithRpc(() => ({ data: { status: 'conflict',
    terminal_reason: 'official_history_existing_row_conflict' }, error: null }));
  const first = await persistCandidateDailyPriceEvidence(input(client, [bar('2026-09-04', { close: 102 })]));
  const later = await persistCandidateDailyPriceEvidence(input(client, [bar('2026-09-07')]));
  assert.deepEqual(first.acceptedBars, []);
  assert.deepEqual(later.acceptedBars, []);
  assert.deepEqual(later.conflicts, first.conflicts);
});

test('nonofficial sessions, stale batches and invalid prices are excluded, TPEx daily evidence is accepted', async () => {
  const { client, calls } = clientWithRpc();
  const valid = bar('2026-09-07', { sourceUrl: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes' });
  const result = await persistCandidateDailyPriceEvidence(input(client, [bar('2026-09-06'), bar('2026-08-31'),
    bar('2026-09-07', { high: 100 }), bar('2026-09-07', { volume: -1 }), valid]));
  assert.deepEqual(result.acceptedBars, [valid]);
  assert.equal(calls.length, 1);
});

test('calendar, batch bound, write errors and invalid terminal statuses fail closed', async () => {
  const { client } = clientWithRpc();
  await assert.rejects(persistCandidateDailyPriceEvidence(input(client, Array.from({ length: 6 }, () => bar('2026-09-07')))), /batch_exceeds_limit/);
  await assert.rejects(persistCandidateDailyPriceEvidence({ ...input(client, [bar('2026-09-07')]), officialSessions: [] }), /calendar_invalid/);
  const failed = clientWithRpc(() => ({ data: null, error: { message: 'unavailable' } }));
  await assert.rejects(persistCandidateDailyPriceEvidence(input(failed.client, [bar('2026-09-07')])), /candidate_daily_price_write_failed:unavailable/);
  const malformed = clientWithRpc(() => ({ data: { status: 'complete', terminal_reason: 'complete' }, error: null }));
  await assert.rejects(persistCandidateDailyPriceEvidence(input(malformed.client, [bar('2026-09-07')])), /candidate_daily_price_completion_invalid/);
});
