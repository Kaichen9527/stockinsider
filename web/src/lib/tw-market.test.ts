import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOfficialJson, isOfficialValuationSourceUrl, parseTpexTradingStockRows, parseTpexValuationPanel, parseTwseStockValuationHistory, parseTwseValuationPanel, resetOfficialMarketRequestStateForTests, selectOfficialValuationBackfillMonths } from './tw-market.ts';

test('a single transient official-host failure does not blackhole the next request', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async () => {
    calls += 1;
    if (calls === 1) throw new Error('transient_official_timeout');
    return new Response(JSON.stringify({ stat: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  assert.equal(await fetchOfficialJson<{ stat: string }>('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=2330&response=json', 1_000), null);
  assert.deepEqual(await fetchOfficialJson<{ stat: string }>('https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=2330&response=json', 1_000), { stat: 'OK' });
});

test('a non-retryable official response breaks the host failure streak', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async () => {
    calls += 1;
    if ([1, 3, 5].includes(calls)) throw new Error('transient_official_timeout');
    if ([2, 4].includes(calls)) return new Response('', { status: 404 });
    return new Response(JSON.stringify({ stat: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const url = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=2330&response=json';
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(await fetchOfficialJson<{ stat: string }>(url, 1_000), null);
  assert.deepEqual(await fetchOfficialJson<{ stat: string }>(url, 1_000), { stat: 'OK' });
});

test('valuation cache accepts only official TWSE and TPEx history endpoints', () => {
  assert.equal(isOfficialValuationSourceUrl('https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260828&selectType=ALL&response=json'), true);
  assert.equal(isOfficialValuationSourceUrl('https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20240801&stockNo=2330&response=json'), true);
  assert.equal(isOfficialValuationSourceUrl('https://www.tpex.org.tw/www/zh-tw/afterTrading/peQryDate?date=2026/08/28&response=json'), true);
  assert.equal(isOfficialValuationSourceUrl('https://example.com/BWIBBU?stockNo=2330'), false);
});

test('official valuation backfill is bounded and advances through missing months', () => {
  const months = Array.from({ length: 24 }, (_, index) => {
    const date = new Date(Date.UTC(2024, index, 1));
    return `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, '0')}01`;
  });
  const first = selectOfficialValuationBackfillMonths(months, new Set());
  assert.equal(first.length, 12);
  assert.deepEqual(first, months.slice(-12));
  const known = new Set(first.map((month) => `${month.slice(0, 4)}-${month.slice(4, 6)}`));
  assert.deepEqual(selectOfficialValuationBackfillMonths(months, known), months.slice(0, 12));
});

test('TPEx official monthly rows normalize ROC dates and trading lots', () => {
  const rows = parseTpexTradingStockRows({
    tables: [{
      fields: ['日 期', '成交張數', '成交仟元', '開盤', '最高', '最低', '收盤', '漲跌', '筆數'],
      data: [['115/08/28', '1,234', '33,000', '27.65', '30.15', '27.60', '27.60', '-0.05', '81']],
    }],
  });
  assert.deepEqual(rows, [{
    time: '2026-08-28',
    open: 27.65,
    high: 30.15,
    low: 27.6,
    close: 27.6,
    volume: 1_234_000,
  }]);
});

test('TWSE valuation panel preserves official monthly PE/PB evidence for requested symbols', () => {
  const rows = parseTwseValuationPanel({
    data: [
      ['2330', '台積電', '1,180.00', '0.93', 114, '31.86', '10.43', '115/1'],
      ['2303', '聯電', '45.00', '5.00', 114, '-', '1.20', '115/1'],
      ['9999', '未請求', '10.00', '0', 114, '10.00', '1.00', '115/1'],
    ],
  }, '2026-08-28', new Set(['2330', '2303']));
  assert.deepEqual(rows.get('2330'), {
    date: '2026-08-28',
    peRatio: 31.86,
    pbRatio: 10.43,
    sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260828&selectType=ALL&response=json',
  });
  assert.equal(rows.get('2303')?.peRatio, null);
  assert.equal(rows.get('2303')?.pbRatio, 1.2);
  assert.equal(rows.has('9999'), false);
});

test('TPEx valuation panel maps the official all-stock table without scraping HTML', () => {
  const rows = parseTpexValuationPanel({
    tables: [{ data: [
      ['5347', '世界', '120.00', '3.5', 114, '18.50', '4.25', '115Q2'],
      ['8358', '金居', '60.00', '2.0', 114, '-', '-', '115Q2'],
    ] }],
  }, '2026-08-28', new Set(['5347', '8358']));
  assert.equal(rows.get('5347')?.peRatio, 18.5);
  assert.equal(rows.get('5347')?.pbRatio, 4.25);
  assert.match(rows.get('5347')?.sourceUrl || '', /peQryDate\?date=2026\/08\/28/u);
  assert.equal(rows.has('8358'), false);
});

test('TWSE per-stock monthly history normalizes ROC dates for the five-year backfill', () => {
  const sourceUrl = 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU?date=20240801&stockNo=2330&response=json';
  const rows = parseTwseStockValuationHistory({ data: [
    ['113年08月29日', '1.20', 112, '24.50', '7.10', '113/2'],
    ['113年08月30日', '1.18', 112, '24.80', '7.20', '113/2'],
  ] }, sourceUrl);
  assert.deepEqual(rows.at(-1), { date: '2024-08-30', peRatio: 24.8, pbRatio: 7.2, sourceUrl });
});
