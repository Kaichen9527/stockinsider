import assert from 'node:assert/strict';
import test from 'node:test';
import { acquireTaiwanDataset, finMindTaiwanDataUrl, officialTaiwanDataUrl } from './taiwan-data-provider.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

const input = { dataset: 'daily_price' as const, symbol: '2330', exchange: 'TWSE' as const, phase: 'final' as const, sessionDate: '2026-09-04' };
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
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'daily_valuation', symbol: null }) || '', /BWIBBU/u);
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

test('pins FinMind credentials to its official API host and uses the bounded TWSE index endpoint', () => {
  assert.equal(new URL(finMindTaiwanDataUrl(input)).origin, 'https://api.finmindtrade.com');
  assert.match(officialTaiwanDataUrl({ ...input, dataset: 'market_index', symbol: null }) || '', /exchangeReport\/FMTQIK/u);
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
