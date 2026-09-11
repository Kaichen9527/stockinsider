import assert from 'node:assert/strict';
import test from 'node:test';
import { isHistoryDate, monthlyCandidatePrices, isOfficialCandidatePriceSource, isOfficialCandidatePriceProvider } from './candidate-price-history.ts';

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
