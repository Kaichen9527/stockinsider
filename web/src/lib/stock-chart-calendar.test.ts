import assert from 'node:assert/strict';
import test from 'node:test';
import type { CandlestickData, UTCTimestamp } from 'lightweight-charts';
import { calendarStockCandles, taiwanChartDate, selectStockChartSeries } from './stock-chart-calendar.ts';

const bar = (time: string, close = 12, volume: number | null = 10) => ({ time, open: 10, high: Math.max(15, close), low: 8, close, volume });

test('calendar weeks split Monday independently of holiday/missing row counts and preserve exact OHLCV', () => {
  const source = [bar('2026-11-03', 14, 5), bar('2026-10-30', 11, 8), bar('2026-11-02', 13, 0)];
  const before = structuredClone(source);
  const result = calendarStockCandles(source, 'weekly', '2026-11-03T13:00:00Z');
  assert.deepEqual(result.candles, [
    { time: '2026-10-30', open: 10, high: 15, low: 8, close: 11 },
    { time: '2026-11-03', open: 10, high: 15, low: 8, close: 14 },
  ]);
  assert.deepEqual(result.periods, [
    { periodStart: '2026-10-26', sourceDates: ['2026-10-30'], provisional: false, volume: 8 },
    { periodStart: '2026-11-02', sourceDates: ['2026-11-02', '2026-11-03'], provisional: true, volume: 5 },
  ]);
  assert.equal(result.coverage, 'supplied_sessions_only'); assert.deepEqual(source, before);
  result.periods[0].sourceDates.push('mutated'); result.candles[0].close = 99;
  assert.deepEqual(source, before);
});
test('calendar month and year boundaries do not group 21 sessions; incomplete monthly volume remains null', () => {
  const result = calendarStockCandles([bar('2026-01-02'), bar('2025-12-31', 10, null), bar('2026-01-05', 11)], 'monthly', '2026-01-05T13:00:00Z');
  assert.deepEqual(result.periods.map(p => [p.periodStart, p.provisional, p.volume]), [['2025-12-01', false, null], ['2026-01-01', true, 20]]);
  assert.deepEqual(result.candles.map(c => c.time), ['2025-12-31', '2026-01-05']);
  assert.equal(calendarStockCandles([bar('2026-01-02', 10, 0)], 'monthly').periods[0].provisional, null);
});
test('Taipei timestamps use local calendar and valid leap day/business-day formats', () => {
  const timestamp = (Date.parse('2026-02-28T16:30:00Z') / 1000) as UTCTimestamp;
  assert.equal(taiwanChartDate(timestamp), '2026-03-01');
  assert.equal(taiwanChartDate({ year: 2024, month: 2, day: 29 }), '2024-02-29');
  assert.throws(() => taiwanChartDate({ year: 2026, month: 2, day: 30 }), /date_invalid/u);
  assert.throws(() => taiwanChartDate('2026-02'), /date_invalid/u);
});
test('past week/month closure is calendar-only; current bucket remains provisional', () => {
  const result = calendarStockCandles([bar('2026-11-06'), bar('2026-11-09')], 'weekly', '2026-11-08T16:00:00Z');
  assert.deepEqual(result.periods.map(p => p.provisional), [false, true]);
  const month = calendarStockCandles([bar('2026-10-30')], 'monthly', '2026-10-31T16:00:00Z');
  assert.equal(month.periods[0].provisional, false);
});
test('duplicates dedupe once; conflicting prices/volume, invalid OHLC/date/cutoff fail without invented bars', () => {
  assert.equal(calendarStockCandles([bar('2026-11-02'), bar('2026-11-02')], 'weekly').periods[0].volume, 10);
  assert.throws(() => calendarStockCandles([bar('2026-11-02'), bar('2026-11-02', 13)], 'weekly'), /conflicting_session/u);
  assert.throws(() => calendarStockCandles([bar('2026-11-02'), bar('2026-11-02', 12, 0)], 'weekly'), /conflicting_session/u);
  assert.throws(() => calendarStockCandles([{ ...bar('2026-11-02'), low: 14 }], 'weekly'), /ohlc_invalid/u);
  assert.throws(() => calendarStockCandles([bar('2026-11-02', 12, -1)], 'weekly'), /volume_invalid/u);
  assert.throws(() => calendarStockCandles([bar('2026-02-30')], 'monthly'), /date_invalid/u);
  assert.throws(() => calendarStockCandles([], 'weekly', 'unknown'), /cutoff_invalid/u);
  assert.throws(() => calendarStockCandles([bar('2026-11-10')], 'weekly', '2026-11-09T13:00:00Z'), /future_session/u);
  assert.throws(() => calendarStockCandles([bar('2026-11-02', 12, Number.MAX_VALUE), bar('2026-11-03', 12, Number.MAX_VALUE)], 'weekly'), /volume_invalid/u);
  assert.deepEqual(calendarStockCandles([], 'weekly').candles, []);
});
test('other calendar period fallbacks preserve year/quarter/half-year boundary', () => {
  const rows = [bar('2026-03-31'), bar('2026-04-01'), bar('2026-07-01'), bar('2027-01-04')];
  assert.equal(calendarStockCandles(rows, 'quarterly').candles.length, 4);
  assert.equal(calendarStockCandles(rows, 'halfYear').candles.length, 3);
  assert.equal(calendarStockCandles(rows, 'yearly').candles.length, 2);
  const candles: CandlestickData[] = calendarStockCandles(rows, 'monthly').candles;
  assert.equal(candles.length, 4);
});

test('supplied missing period stays empty rather than relabelling available daily bars', () => {
  const daily = [bar('2026-11-02')];
  const supplied = { daily: [], weekly: [], monthly: [], quarterly: [], halfYear: [], yearly: [] };
  for (const timeframe of ['weekly', 'monthly', 'quarterly', 'halfYear', 'yearly'] as const) {
    assert.deepEqual(selectStockChartSeries(supplied, timeframe, daily), []);
  }
  assert.deepEqual(selectStockChartSeries(supplied, 'daily', daily), daily);
  assert.deepEqual(selectStockChartSeries({ ...supplied, weekly: daily }, 'weekly', []), daily);
});
