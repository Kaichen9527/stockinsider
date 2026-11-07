import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { calendarStockCandles } from './stock-chart-calendar.ts';

// Exercise the actual two domain supplier expressions without loading the
// legacy domain's DB/provider dependencies. The pure helper is the real module.
const domain = readFileSync(new URL('./domain.ts', import.meta.url), 'utf8');
const suppliers = [...domain.matchAll(/const timeframeCharts = (\{\s*daily: insight\.chart,[\s\S]*?\n\s*\});/gu)];
const bar = (time: string, open: number, close: number) => ({
  time, open, high: Math.max(open, close) + 1, low: Math.min(open, close) - 1, close,
});

test('both real domain chart suppliers use Taiwan calendar boundaries with short, gapped input', () => {
  assert.equal(suppliers.length, 2);
  assert.match(domain, /import \{ calendarStockCandles \} from '\.\/stock-chart-calendar';/u);
  assert.doesNotMatch(domain, /aggregateCandles/u);
  // A Friday/Monday, month, quarter, half-year and year boundary each occurs
  // before five supplied rows. Fixed session-count chunking fails this fixture.
  const rows = [bar('2025-12-31', 10, 12), bar('2026-01-02', 12, 14),
    bar('2026-01-05', 14, 11), bar('2026-04-01', 11, 15), bar('2026-07-01', 15, 16)];
  const original = structuredClone(rows);
  for (const [, expression] of suppliers) {
    const supply = new Function('insight', 'calendarStockCandles', `return (${expression});`);
    const charts = supply({ chart: rows }, calendarStockCandles);
    assert.strictEqual(charts.daily, rows);
    assert.deepEqual(charts.weekly.map((row: { time: string }) => row.time), ['2026-01-02', '2026-01-05', '2026-04-01', '2026-07-01']);
    assert.deepEqual(charts.weekly[0], { time: '2026-01-02', open: 10, high: 15, low: 9, close: 14 });
    assert.deepEqual(charts.monthly.map((row: { time: string }) => row.time), rows.filter((_, index) => index !== 1).map(row => row.time));
    assert.deepEqual(charts.quarterly.map((row: { time: string }) => row.time), ['2025-12-31', '2026-01-05', '2026-04-01', '2026-07-01']);
    assert.deepEqual(charts.halfYear.map((row: { time: string }) => row.time), ['2025-12-31', '2026-04-01', '2026-07-01']);
    assert.deepEqual(charts.yearly.map((row: { time: string }) => row.time), ['2025-12-31', '2026-07-01']);
    assert.deepEqual(rows, original);
    assert.deepEqual(supply({ chart: [] }, calendarStockCandles), {
      daily: [], weekly: [], monthly: [], quarterly: [], halfYear: [], yearly: [],
    });
  }
});

test('supplier grouping retains unknown completion and never claims a complete historical window', () => {
  const result = calendarStockCandles([bar('2026-11-02', 10, 12)], 'weekly');
  assert.equal(result.coverage, 'supplied_sessions_only');
  assert.equal(result.periods[0].provisional, null);
  assert.deepEqual(result.periods[0].sourceDates, ['2026-11-02']);
  assert.equal(result.periods[0].volume, null);
  const chart = readFileSync(new URL('../components/StockChart.tsx', import.meta.url), 'utf8');
  assert.ok(chart.includes('本期完成狀態與交易日覆蓋尚未提供'));
});
