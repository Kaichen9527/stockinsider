import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireTaiwanDataset, finMindTaiwanDataUrl, needsCompletedTradingSession, officialTaiwanDataUrl } from './taiwan-data-provider.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

const input = { dataset: 'daily_price' as const, symbol: '2330', exchange: 'TWSE' as const, phase: 'final' as const, sessionDate: '2026-09-04' };

test('close datasets use a completed market session while calendar-only refreshes keep the requested date', () => {
  assert.equal(needsCompletedTradingSession(['daily_price']), true);
  assert.equal(needsCompletedTradingSession(['market_index', 'institutional_flow']), true);
  assert.equal(needsCompletedTradingSession(['stock_master', 'trading_calendar']), false);
});
function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

test('uses an allowlisted official endpoint before the FinMind mirror', async () => {
  const urls: string[] = [];
  const result = await acquireTaiwanDataset(input, {
    finMindToken: 'token',
    fetchImpl: async (url) => { urls.push(url); return jsonResponse({ stat: 'OK', date: '20260904', fields: ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'], data: [['115/09/04','1','1','1','1','1','1']] }); },
  });
  assert.equal(result.terminal, 'complete');
  assert.equal(result.selectedProvider, 'twse');
  assert.equal(result.selectedAuthorityTier, 'official_primary');
  assert.equal(result.actionEligible, false, 'fetch success is not persisted canonical success');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /^https:\/\/www\.twse\.com\.tw\//u);
});

test('persists only the requested session from a monthly official price response', async () => {
  const result = await acquireTaiwanDataset(input, {
    fetchImpl: async () => jsonResponse({
      stat: 'OK', date: '20260904',
      fields: ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'],
      data: [
        ['115/09/01','10','100','10','11','9','10.5'],
        ['115/09/04','20','220','11','12','10','11.5'],
      ],
    }),
  });
  assert.equal(result.terminal, 'complete');
  assert.equal(result.canonical?.records.length, 1);
  assert.equal(result.canonical?.records[0]['日期'], '115/09/04');
});

test('accepts TPEx spaced date and lot-volume headers without losing the requested session', async () => {
  const result = await acquireTaiwanDataset({ ...input, symbol: '5347', exchange: 'TPEX' }, {
    fetchImpl: async () => jsonResponse({ tables: [{
      fields: ['日 期','成交張數','成交仟元','開盤','最高','最低','收盤'],
      data: [['115/09/04','1,234','33,000','27.65','30.15','27.60','27.60']],
    }] }),
  });
  assert.equal(result.terminal, 'complete');
  assert.equal(result.canonical?.records.length, 1);
  assert.equal(result.canonical?.records[0]['日 期'], '115/09/04');
});

test('does not replace a meaningful official empty result with FinMind data', async () => {
  const result = await acquireTaiwanDataset(input, {
    finMindToken: 'token',
    fetchImpl: async () => jsonResponse({ stat: 'OK', data: [] }),
  });
  assert.equal(result.terminal, 'empty');
  assert.equal(result.selectedAuthorityTier, 'official_primary');
  assert.equal(result.attempts.length, 1);
});

test('records a FinMind fallback as a mirror with independent usage and schema terminals', async () => {
  let count = 0;
  const result = await acquireTaiwanDataset(input, {
    finMindToken: 'token',
    fetchImpl: async () => {
      count += 1;
      return count === 1
        ? jsonResponse({ unexpected: true })
        : jsonResponse({ data: [{ date: '2026-09-04', stock_id: '2330' }] }, 200, { 'x-ratelimit-remaining': '9' });
    },
  });
  assert.equal(result.attempts[0].terminal, 'schema_invalid');
  assert.equal(result.attempts[1].provider, 'finmind');
  assert.equal(result.attempts[1].authorityTier, 'finmind_fallback');
  assert.equal(result.attempts[1].apiUsage?.remaining, 9);
  assert.equal(result.selectedAuthorityTier, 'finmind_fallback');
});

test('makes timeout, rate-limit and invalid endpoint identity terminal distinctions explicit', async () => {
  const limited = await acquireTaiwanDataset(input, { finMindToken: 'token', fetchImpl: async () => jsonResponse({ message: 'slow down' }, 429) });
  assert.equal(limited.attempts[0].terminal, 'usage_limited');
  assert.equal(limited.attempts[1].terminal, 'usage_limited');
  assert.equal(officialTaiwanDataUrl({ ...input, symbol: null }), null);
  assert.match(finMindTaiwanDataUrl(input), /dataset=TaiwanStockPrice/u);
});

test('supports valuation, revenue and financial-statement provider contracts without treating them as interchangeable', () => {
  assert.match(finMindTaiwanDataUrl({ ...input, dataset: 'daily_valuation' }), /dataset=TaiwanStockPER/u);
  assert.match(finMindTaiwanDataUrl({ ...input, dataset: 'monthly_revenue' }), /dataset=TaiwanStockMonthRevenue/u);
  assert.match(finMindTaiwanDataUrl({ ...input, dataset: 'financial_statement' }), /dataset=TaiwanStockFinancialStatements/u);
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'daily_valuation', symbol: null }) || '', /rwd\/zh\/afterTrading\/BWIBBU_d/u);
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'monthly_revenue', symbol: null }) || '', /openapi\.twse/u);
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'financial_statement' }) || '', /mopsov\.twse/u);
});

test('rejects a source-shaped daily result when it does not contain the requested session', async () => {
  let calls = 0;
  const result = await acquireTaiwanDataset(input, {
    finMindToken: 'token',
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse({ stat: 'OK', date: '20260903', fields: ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'], data: [['115/09/03','1','1','1','1','1','1']] })
        : jsonResponse({ data: [{ date: '2026-09-04', stock_id: '2330' }] });
    },
  });
  assert.equal(result.attempts[0].terminal, 'schema_invalid');
  assert.equal(result.selectedAuthorityTier, 'finmind_fallback');
  assert.ok(result.canonical?.records.length);
});

test('pins FinMind credentials to its official API host and uses the VPS-reachable official TAIEX endpoint', () => {
  assert.equal(new URL(finMindTaiwanDataUrl(input)).origin, 'https://api.finmindtrade.com');
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'market_index', symbol: null }) || '', /rwd\/zh\/TAIEX\/MI_5MINS_HIST/u);
});

test('canonicalizes only the requested session from official monthly TAIEX history', async () => {
  const result = await acquireTaiwanDataset({ ...input, dataset: 'market_index', symbol: null }, {
    fetchImpl: async () => jsonResponse({
      stat: 'OK', date: '20260904',
      fields: ['日期', '開盤指數', '最高指數', '最低指數', '收盤指數'],
      data: [
        ['115/09/03', '46,325.48', '46,517.45', '45,839.36', '45,857.66'],
        ['115/09/04', '45,991.28', '46,620.96', '45,966.86', '46,551.13'],
      ],
    }),
  });
  assert.equal(result.terminal, 'complete');
  assert.equal(result.selectedProvider, 'twse');
  assert.equal(result.canonical?.records.length, 1);
  assert.equal(result.canonical?.records[0]['日期'], '115/09/04');
  assert.equal(result.canonical?.records[0]['收盤指數'], '46,551.13');
});

test('uses current TPEx OpenAPI endpoints for exchange-wide valuation and index evidence', () => {
  assert.equal(
    officialTaiwanDataUrl({ ...input, exchange: 'TPEX', dataset: 'daily_valuation', symbol: null }),
    'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis',
  );
  assert.equal(
    officialTaiwanDataUrl({ ...input, exchange: 'TPEX', dataset: 'market_index', symbol: null }),
    'https://www.tpex.org.tw/openapi/v1/tpex_daily_trading_index',
  );
});

test('canonicalizes current TPEx OpenAPI valuation rows for the requested ROC session', async () => {
  const result = await acquireTaiwanDataset({ ...input, exchange: 'TPEX', dataset: 'daily_valuation', symbol: null }, {
    fetchImpl: async () => jsonResponse([
      { Date: '1150903', SecuritiesCompanyCode: '5347', PriceEarningRatio: '17.40', PriceBookRatio: '2.10' },
      { Date: '1150904', SecuritiesCompanyCode: '5347', PriceEarningRatio: '18.20', PriceBookRatio: '2.20' },
    ]),
  });
  assert.equal(result.terminal, 'complete');
  assert.equal(result.selectedAuthorityTier, 'official_primary');
  assert.deepEqual(result.canonical?.records, [{
    Date: '1150904', SecuritiesCompanyCode: '5347', PriceEarningRatio: '18.20', PriceBookRatio: '2.20',
    date: '2026-09-04', stock_id: '5347', PER: '18.20', PBR: '2.20',
  }]);
});

test('normalizes unavailable official PE or PB markers without discarding the valid companion multiple', async () => {
  const twse = await acquireTaiwanDataset({ ...input, dataset: 'daily_valuation', symbol: null }, {
    fetchImpl: async () => jsonResponse({
      stat: 'OK', date: '20260904',
      fields: ['證券代號', '證券名稱', '本益比', '股價淨值比'],
      data: [['2330', '台積電', '-', '8.45']],
    }),
  });
  assert.equal(twse.terminal, 'complete');
  assert.equal(twse.canonical?.records[0]['本益比'], null);
  assert.equal(twse.canonical?.records[0]['股價淨值比'], '8.45');
  assert.equal((twse.canonical?.records[0].values as unknown[])[2], null);

  const tpex = await acquireTaiwanDataset({ ...input, exchange: 'TPEX', dataset: 'daily_valuation', symbol: null }, {
    fetchImpl: async () => jsonResponse([
      { Date: '1150904', SecuritiesCompanyCode: '5347', PriceEarningRatio: '-', PriceBookRatio: '2.20' },
    ]),
  });
  assert.equal(tpex.terminal, 'complete');
  assert.equal(tpex.canonical?.records[0].PER, null);
  assert.equal(tpex.canonical?.records[0].PBR, '2.20');
});

test('canonicalizes current TPEx OpenAPI index rows and rejects a missing requested session', async () => {
  const providerInput = { ...input, exchange: 'TPEX' as const, dataset: 'market_index' as const, symbol: null };
  const complete = await acquireTaiwanDataset(providerInput, {
    fetchImpl: async () => jsonResponse([
      { Date: '1150904', TradeVolume: '1000', TPExIndex: '301.25', Change: '1.20' },
    ]),
  });
  assert.equal(complete.terminal, 'complete');
  assert.equal(complete.canonical?.records[0].date, '2026-09-04');

  let calls = 0;
  const missing = await acquireTaiwanDataset(providerInput, {
    finMindToken: 'token',
    fetchImpl: async () => {
      calls += 1;
      return calls === 1
        ? jsonResponse([{ Date: '1150903', TPExIndex: '300.05' }])
        : jsonResponse({ data: [] }, 400);
    },
  });
  assert.equal(missing.attempts[0].terminal, 'schema_invalid');
  assert.equal(missing.attempts[0].detail, 'expected_session_missing');
  assert.equal(missing.terminal, 'http_error');
});

test('stops oversized provider bodies while streaming', async () => {
  const oversized = 'x'.repeat(2_000_001);
  const result = await acquireTaiwanDataset(input, {
    fetchImpl: async () => new Response(oversized, { status: 200 }),
  });
  assert.equal(result.attempts[0].terminal, 'schema_invalid');
  assert.equal(result.attempts[0].detail, 'response_too_large');
});

test('sanitizes public dossier URLs without exposing credentials or private hosts', () => {
  assert.equal(sanitizePublicSourceUrl('https://example.com/report?token=secret&id=7#raw'), 'https://example.com/report?id=7');
  assert.equal(sanitizePublicSourceUrl('https://user:pass@example.com/report'), null);
  assert.equal(sanitizePublicSourceUrl('http://127.0.0.1/private'), null);
  assert.equal(sanitizePublicSourceUrl('http://[::1]/private'), null);
  assert.equal(sanitizePublicSourceUrl('http://[::ffff:127.0.0.1]/private'), null);
});
