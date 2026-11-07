import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { candidateDisplayPriceHistory, candidatePriceDisplayFrom, dailyCandidatePrices, isHistoryDate, monthlyCandidatePrices, isOfficialCandidatePriceSource, isOfficialCandidatePriceProvider } from './candidate-price-history.ts';

test('official price coverage recognizes actual adapters and never a mirror or hostname suffix', () => {
  for (const url of ['https://www.twse.com.tw/exchangeReport/STOCK_DAY?stockNo=2330',
    'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=20260910',
    'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=6488']) assert.equal(isOfficialCandidatePriceSource(url),true);
  for (const url of ['https://api.finmindtrade.com/api/v4/data',
    'https://example.test/https://www.twse.com.tw/exchangeReport/STOCK_DAY',
    'https://www.twse.com.tw.evil.test/exchangeReport/STOCK_DAY',
    'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?stockNo=2330']) assert.equal(isOfficialCandidatePriceSource(url),false);
  for (const provider of ['twse','tpex']) assert.equal(isOfficialCandidatePriceProvider(provider),true);
  for (const provider of ['finmind',null,undefined,'unknown']) assert.equal(isOfficialCandidatePriceProvider(provider),false);
});

test('monthly history retains real session dates regardless of input order', () => {
  assert.deepEqual(monthlyCandidatePrices([
    { time: '2026-02-26', close: 100 }, { time: '2026-01-30', close: 95 },
    { time: '2026-02-25', close: 99 }, { time: '2026-02-26', close: 100 },
  ]), [
    { date: '2026-01-30', month: '2026-01', frequency: 'monthly', close: 95 },
    { date: '2026-02-26', month: '2026-02', frequency: 'monthly', close: 100 },
  ]);
});
test('history does not turn month-only labels or invalid dates into trading sessions', () => {
  for (const value of ['2026-02', '2026-02-30', '2026-13-01', undefined]) assert.equal(isHistoryDate(value), false);
  assert.equal(isHistoryDate('2024-02-29'), true);
  assert.deepEqual(monthlyCandidatePrices([{ time: '2026-02', close: 100 }]), []);
  assert.throws(() => monthlyCandidatePrices([
    { time: '2026-02-26', close: 100 }, { time: '2026-02-26', close: 101 },
  ]), /conflicting_session/);
});

test('daily history includes rolling moving averages without inventing sessions', () => {
  const rows = dailyCandidatePrices(Array.from({ length: 20 }, (_, index) => ({
    time: `2026-01-${String(index + 1).padStart(2, '0')}`, close: index + 1,
  })));
  assert.equal(rows.length, 20);
  assert.equal(rows[3].ma5, null);
  assert.equal(rows[4].ma5, 3);
  assert.equal(rows[19].ma20, 10.5);
  assert.equal(rows[19].ma60, null);
});

// A fixture ledger, not a production weekday-calendar inference.
const sessions = Array.from({ length: 2200 }, (_, index) => new Date(Date.UTC(2021, 0, 1 + index)))
  .filter((date) => date.getUTCDay() !== 0 && date.getUTCDay() !== 6)
  .map((date) => date.toISOString().slice(0, 10)).filter((date) => date <= '2026-11-06').slice(-1320);
const bars = sessions.map((time, index) => ({ time, close: index + 1 }));
const latestSession = sessions.at(-1)!;
const projection = (changes: Partial<Parameters<typeof candidateDisplayPriceHistory>[0]> = {}) => candidateDisplayPriceHistory({
  bars, officialSessions: sessions, verifiedSessions: sessions, latestSession, ...changes,
});

test('three calendar years use the anniversary boundary and earlier observations warm up the first MA240', () => {
  assert.equal(candidatePriceDisplayFrom('2026-11-06'), '2023-11-06');
  assert.equal(candidatePriceDisplayFrom('2024-02-29'), '2021-02-28');
  const { dailyPrices, coverage } = projection();
  assert.equal(coverage.displayFrom, '2023-11-06');
  assert.deepEqual(dailyPrices.map((row) => row.date), sessions.filter((date) => date >= coverage.displayFrom));
  assert.ok(dailyPrices.length > 700);
  const firstIndex = sessions.indexOf(dailyPrices[0].date);
  assert.equal(dailyPrices[0].ma240, firstIndex + 1 - 239 / 2);
  assert.equal(coverage.coveredWarmupSessions, 239);
  assert.equal(coverage.status, 'supplied_sessions_covered');
  assert.equal(coverage.calendarCompleteness, 'unknown');
  assert.equal(coverage.listingStatus, 'unknown');
  assert.equal(coverage.suspensionStatus, 'unknown');
  assert.ok(dailyCandidatePrices(bars).length > 260);
});

test('1,320 observations cannot hide a missing official session or bridge its MA window', () => {
  const missing = sessions.at(-30)!;
  const earlier = { time: new Date(Date.parse(`${sessions[0]}T00:00:00Z`) - 86400000).toISOString().slice(0, 10), close: 1 };
  const supplied = [earlier, ...bars.filter((row) => row.time !== missing)];
  assert.equal(supplied.length, 1320);
  const { dailyPrices, coverage } = projection({ bars: supplied, verifiedSessions: supplied.map((row) => row.time) });
  assert.equal(coverage.status, 'incomplete');
  assert.deepEqual(coverage.missingSessions, [missing]);
  assert.equal(coverage.missingSessionCause, 'unresolved_listing_suspension_or_missing_data');
  assert.equal(dailyPrices.at(-1)!.ma20, 1310.5);
  assert.equal(dailyPrices.at(-1)!.ma60, null);
  assert.equal(dailyPrices.at(-1)!.ma240, null);
});

test('unverified or conflicted rows may be shown but never count toward coverage or display MAs', () => {
  const missing = sessions.at(-3)!;
  const { coverage, dailyPrices } = projection({ verifiedSessions: sessions.filter((date) => date !== missing) });
  assert.deepEqual(coverage.missingSessions, [missing]);
  assert.equal(dailyPrices.at(-1)!.ma5, null);
  assert.equal(dailyPrices.at(-1)!.ma240, null);
  const research = readFileSync(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(research, /candidateDisplayPriceHistory\(\{ bars, officialSessions: marketSessions,/u);
  assert.match(research, /verifiedSessions: bars\.filter\(\(bar\) => bar\.authorityTier === 'official_primary'\s*&& bar\.integrityStatus !== 'conflict'\)/u);
  assert.match(research, /priceHistoryCoverage: displayPriceHistory\.coverage/u);
});

test('short histories and absent calendars remain explicit gaps without inferring listing or suspension', () => {
  const short = projection({ bars: bars.slice(-50), verifiedSessions: sessions.slice(-50) });
  assert.equal(short.coverage.status, 'incomplete');
  assert.equal(short.coverage.listingStatus, 'unknown');
  assert.equal(short.coverage.coveredWarmupSessions, 0);
  assert.equal(short.coverage.warmupShortfallSessions, 239);
  assert.ok(short.coverage.missingSessions.length > 600);
  const noCalendar = projection({ officialSessions: [] });
  assert.equal(noCalendar.coverage.status, 'incomplete');
  assert.equal(noCalendar.coverage.calendarCoverage, 'insufficient');
  assert.equal(noCalendar.coverage.warmupShortfallSessions, 239);
  assert.equal(noCalendar.dailyPrices.at(-1)!.ma5, null);
  const warmupGap = projection({ verifiedSessions: sessions.filter((date) => date !== sessions.filter((date) => date < '2023-11-06').at(-1)) });
  assert.equal(warmupGap.coverage.status, 'incomplete');
  assert.equal(warmupGap.coverage.missingSessions.length, 0);
  assert.equal(warmupGap.coverage.missingWarmupSessions.length, 1);
  assert.equal(warmupGap.dailyPrices[0].ma240, null);
});

test('matching a supplied ledger never certifies that the ledger itself is exhaustive', () => {
  const omitted = '2025-11-05';
  const supplied = sessions.filter((date) => date !== omitted);
  const { coverage } = projection({ officialSessions: supplied, verifiedSessions: supplied,
    bars: bars.filter((row) => row.time !== omitted) });
  assert.equal(coverage.status, 'supplied_sessions_covered');
  assert.equal(coverage.calendarCoverage, 'supplied_sessions_only');
  assert.equal(coverage.calendarCompleteness, 'unknown');
  assert.deepEqual(coverage.missingSessions, []);
});

test('cutoff excludes future rows and a stale observed endpoint cannot claim full coverage', () => {
  const future = projection({ bars: [...bars, { time: '2026-11-09', close: 99999 }] });
  assert.equal(future.dailyPrices.at(-1)!.date, latestSession);
  const stale = projection({ bars: bars.slice(0, -1) });
  assert.deepEqual(stale.coverage.missingSessions, [latestSession]);
  assert.equal(stale.coverage.status, 'incomplete');
  assert.throws(() => projection({ bars: [...bars, { ...bars[0], close: bars[0].close + 1 }] }), /conflicting_session/u);
  assert.throws(() => dailyCandidatePrices(Array.from({ length: 10001 }, () => bars[0])), /window_invalid/u);
  const chart = readFileSync(new URL('./candidate-history-chart.tsx', import.meta.url), 'utf8');
  assert.ok(chart.includes('上市日期與停牌狀態尚未驗證'));
  assert.ok(chart.includes('此研究版本尚未驗證三個日曆年'));
});
