import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchOfficialJson, fetchTwMarketTradingSessions, fetchTwStockDailyBars, isOfficialValuationSourceUrl, parseTpexMarketTradingSessions, parseTpexTradingStockRows, parseTpexValuationPanel, parseTwseStockValuationHistory, parseTwseValuationPanel, resetOfficialMarketRequestStateForTests, selectOfficialValuationBackfillMonths } from './tw-market.ts';

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

test('queued official requests respect an open circuit instead of clearing it', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async () => {
    calls += 1;
    throw new Error('official_host_timeout');
  }) as typeof fetch;

  const url = 'https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=2330&response=json';
  const results = await Promise.all(Array.from({ length: 8 }, () => fetchOfficialJson<{ stat: string }>(url, 1_000)));
  assert.deepEqual(results, Array(8).fill(null));
  assert.equal(calls, 3);
});

test('a CDN challenge response opens the official host circuit instead of becoming a false missing-price result', async (t) => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async () => {
    calls += 1;
    return new Response('<html>challenge</html>', { status: 428, headers: { 'content-type': 'text/html' } });
  }) as typeof fetch;

  const url = 'https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20260828&type=ALLBUT0999';
  const results = await Promise.all(Array.from({ length: 8 }, () => fetchOfficialJson<Record<string, unknown>>(url, 1_000)));
  assert.deepEqual(results, Array(8).fill(null));
  assert.equal(calls, 3);
});

test('valuation endpoint failures do not blackhole the price-history endpoint on the same host', async (t) => {
  const originalFetch = globalThis.fetch;
  const calls: string[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async (input) => {
    const url = new URL(String(input));
    calls.push(url.pathname);
    if (url.pathname.includes('BWIBBU_d')) return new Response('', { status: 429 });
    return new Response(JSON.stringify({ stat: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const valuationUrl = 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260828&selectType=ALL&response=json';
  for (let attempt = 0; attempt < 5; attempt += 1) assert.equal(await fetchOfficialJson(valuationUrl, 1_000), null);
  const price = await fetchOfficialJson<{ stat: string }>('https://www.twse.com.tw/exchangeReport/MI_INDEX?response=json&date=20260828&type=ALLBUT0999', 1_000);
  assert.deepEqual(price, { stat: 'OK' });
  assert.equal(calls.filter((path) => path.includes('BWIBBU_d')).length, 3);
  assert.equal(calls.filter((path) => path.includes('MI_INDEX')).length, 1);
});

test('official requests are serialized per host while other work is queued', async (t) => {
  const originalFetch = globalThis.fetch;
  let inFlight = 0;
  let maxInFlight = 0;
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async () => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return new Response(JSON.stringify({ stat: 'OK' }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const results = await Promise.all(['2330', '2303', '2317'].map((symbol) => fetchOfficialJson<{ stat: string }>(`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=20260801&stockNo=${symbol}&response=json`, 1_000)));
  assert.deepEqual(results, [{ stat: 'OK' }, { stat: 'OK' }, { stat: 'OK' }]);
  assert.equal(maxInFlight, 1);
});

test('candidate daily bars share the official all-stock market endpoint rather than the JavaScript-gated per-stock route', async (t) => {
  const originalFetch = globalThis.fetch;
  const requested: URL[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async (input) => {
    requested.push(new URL(String(input)));
    return new Response(JSON.stringify({
      tables: [{
        fields: ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
        data: [['2880', '華南金', '1,234', '100', '30,000', '30.00', '31.00', '29.50', '30.50']],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const bars = await fetchTwStockDailyBars('2880', 2, ['2026-08-27', '2026-08-28'], 'TWSE');
  if (!bars) throw new Error('expected official TWSE daily bars');
  assert.equal(bars.length, 2);
  assert.equal(requested.length, 2);
  assert.ok(requested.every((url) => url.pathname === '/rwd/zh/afterTrading/MI_INDEX'));
  assert.ok(requested.every((url) => url.searchParams.get('response') === 'json'));
  assert.ok(requested.every((url) => url.searchParams.get('type') === 'ALLBUT0999'));
});

test('candidate daily bars fetch recent sessions before an old archive failure opens the endpoint circuit', async (t) => {
  const originalFetch = globalThis.fetch;
  const requestedDates: string[] = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async (input) => {
    const date = new URL(String(input)).searchParams.get('date') || '';
    requestedDates.push(date);
    if (date < '20260801') throw new Error('old_archive_timeout');
    return new Response(JSON.stringify({
      tables: [{
        fields: ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價', '最低價', '收盤價'],
        data: [['1216', '統一', '1,234', '100', '30,000', '75.00', '76.00', '74.50', '75.50']],
      }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const bars = await fetchTwStockDailyBars('1216', 5, ['2026-01-02', '2026-01-05', '2026-01-06', '2026-08-28', '2026-09-01'], 'TWSE');
  assert.deepEqual(bars?.map((bar) => bar.time), ['2026-08-28', '2026-09-01']);
  assert.deepEqual(requestedDates.slice(0, 2), ['20260901', '20260828']);
});

test('TPEx monthly index rows provide official trading sessions when TWSE archives are blocked', async (t) => {
  const originalFetch = globalThis.fetch;
  const requested: Array<{ url: URL; method: string; body: string }> = [];
  t.after(() => {
    globalThis.fetch = originalFetch;
    resetOfficialMarketRequestStateForTests();
  });
  resetOfficialMarketRequestStateForTests();
  globalThis.fetch = (async (input, init) => {
    const url = new URL(String(input));
    requested.push({ url, method: init?.method || 'GET', body: String(init?.body || '') });
    if (url.hostname === 'www.twse.com.tw') {
      return new Response('<html>FOR SECURITY REASONS</html>', { status: 200, headers: { 'content-type': 'text/html' } });
    }
    return new Response(JSON.stringify({
      stat: 'ok',
      tables: [{ data: [
        ['2026/08/28', '270.00', '272.00', '269.00', '271.00', '1.00'],
        ['2026/08/29', '-', '-', '-', '-', '-'],
      ] }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  assert.deepEqual(await fetchTwMarketTradingSessions(1), ['2026-08-28']);
  const tpexRequests = requested.filter((item) => item.url.hostname === 'www.tpex.org.tw');
  assert.ok(tpexRequests.length >= 1);
  assert.ok(tpexRequests.every((item) => item.method === 'POST'));
  assert.ok(tpexRequests.every((item) => item.url.pathname === '/www/zh-tw/indexInfo/inx'));
  assert.ok(tpexRequests.every((item) => /date=\d{4}%2F\d{2}%2F01/u.test(item.body)));
});

test('TPEx official calendar parser rejects malformed dates', () => {
  assert.deepEqual(parseTpexMarketTradingSessions({
    stat: 'ok',
    tables: [{ data: [
      ['2024/07/01', '273.72', '276.88', '273.72', '275.57'],
      ['113/07/02', '275.00', '276.00', '274.00', '275.50'],
      ['2024-07-03', '276.00', '277.00', '275.00', '276.50'],
      ['', '277.00', '278.00', '276.00', '277.50'],
      ['2024/07/04', '-', '-', '-', '-'],
    ] }],
  }), ['2024-07-01']);
  assert.deepEqual(parseTpexMarketTradingSessions({ stat: '日期錯誤', tables: [{ data: [['2024/07/01', '', '', '', '275.57']] }] }), []);
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
