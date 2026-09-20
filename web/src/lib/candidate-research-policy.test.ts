import assert from 'node:assert/strict';
import test from 'node:test';
import { latestMonthlyPositiveValues, pointInTimeMonthlyPbObservations, pointInTimePbLedgerObservations } from './candidate-research-policy.ts';

test('valuation histories keep only the latest positive observation per month', () => {
  assert.deepEqual(latestMonthlyPositiveValues([
    { date: '2026-01-05', value: 0.7 }, { date: '2026-01-28', value: 0.9 },
    { date: '2026-02-27', value: 0.8 }, { date: '2026-02-28', value: null },
    { date: 'bad', value: 4 }, { date: '2026-03-31', value: -1 },
  ]), [
    { date: '2026-01-28', value: 0.9 }, { date: '2026-02-27', value: 0.8 },
  ]);
});

test('versioned P/B ledger filters future rows and rejects untraceable observations', () => {
  const sourceUrl = 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20260101&stockNo=2409&response=json';
  const rows = pointInTimePbLedgerObservations([
    { date: '2026-01-30', pb: 0.7, close: 14, bookValuePerShare: 20, bookValuePeriodEnd: '2025-09-30', bookValueAvailableAt: '2026-01-30', sourceUrl, bookValueSourceRef: sourceUrl },
    { date: '2026-02-27', pb: 0.8, close: 16, bookValuePerShare: 20, bookValuePeriodEnd: '2025-09-30', bookValueAvailableAt: '2026-02-27', sourceUrl: 'https://example.com', bookValueSourceRef: 'https://example.com' },
    { date: '2026-03-31', pb: 0.9, close: 18, bookValuePerShare: 20, bookValuePeriodEnd: '2025-12-31', bookValueAvailableAt: '2026-03-31', sourceUrl, bookValueSourceRef: sourceUrl },
  ], '2026-02-28T23:59:59+08:00');
  assert.deepEqual(rows.map((row) => row.date), ['2026-01-30']);
});

test('point-in-time P/B requires an official same-day close and disclosed denominator period', () => {
  const rows = pointInTimeMonthlyPbObservations([
    { date: '2026-01-28', pbRatio: 0.8, sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?x=1', authorityTier: 'official_primary', bookValuePeriodEnd: '2025-09-30', bookValueAvailableAt: '2026-01-28' },
    { date: '2026-01-29', pbRatio: 0.9, sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?x=2', authorityTier: 'official_primary', bookValuePeriodEnd: null, bookValueAvailableAt: '2026-01-29' },
    { date: '2026-02-27', pbRatio: 1.0, sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?x=3', authorityTier: 'official_primary', bookValuePeriodEnd: '2025-12-31', bookValueAvailableAt: '2026-02-27' },
    { date: '2026-03-31', pbRatio: 1.1, sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?x=4', authorityTier: 'official_primary', bookValuePeriodEnd: '2026-03-31', bookValueAvailableAt: '2026-04-01' },
  ], [
    { time: '2026-01-28', close: 16, authorityTier: 'official_primary' },
    { time: '2026-01-29', close: 18, authorityTier: 'official_primary' },
    { time: '2026-02-27', close: 20, authorityTier: 'official_primary' },
    { time: '2026-03-31', close: 22, authorityTier: 'official_primary' },
  ], '2026-03-31T23:59:59+08:00');
  assert.deepEqual(rows.map((row) => ({ date: row.date, bvps: row.bookValuePerShare })), [
    { date: '2026-01-28', bvps: 20 }, { date: '2026-02-27', bvps: 20 },
  ]);
});
