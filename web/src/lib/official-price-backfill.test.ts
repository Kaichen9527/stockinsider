import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { officialPriceBackfillBatchHash, parseOfficialPriceBackfillPage, type OfficialPriceBackfillPage } from './official-price-backfill.ts';

function page(overrides: Partial<OfficialPriceBackfillPage> = {}): OfficialPriceBackfillPage {
  const responseText = String(overrides.responseText || JSON.stringify({ stat: 'OK',
    fields: ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'],
    data: [['114/08/07','1,234','100,000','100','105','99','103']] }));
  return {
    symbol: '2330', exchange: 'TWSE' as const,
    sourceUrl: 'https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=20250801&stockNo=2330',
    responseText, responseSha256: createHash('sha256').update(responseText).digest('hex'), ...overrides,
  };
}

test('derives an official TWSE observation from hash-bound response evidence', () => {
  const value = page();
  assert.deepEqual(parseOfficialPriceBackfillPage(value)?.[0], {
    symbol: '2330', exchange: 'TWSE', sessionDate: '2025-08-07', open: 100, high: 105, low: 99, close: 103,
    volume: 1234, sourceUrl: value.sourceUrl, responseSha256: value.responseSha256,
  });
  assert.equal(officialPriceBackfillBatchHash([value]), officialPriceBackfillBatchHash([value]));
});

test('rejects wrong origins, hashes, query identity, geometry, dates, and extra keys', () => {
  assert.equal(parseOfficialPriceBackfillPage(page({ sourceUrl: page().sourceUrl.replace('www.twse.com.tw', 'example.com') })), null);
  assert.equal(parseOfficialPriceBackfillPage(page({ responseSha256: 'a'.repeat(64) })), null);
  assert.equal(parseOfficialPriceBackfillPage(page({ sourceUrl: page().sourceUrl.replace('2330', '2317') })), null);
  const fields = ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'];
  assert.equal(parseOfficialPriceBackfillPage(page({ responseText: JSON.stringify({ stat: 'OK', fields, data: [['114/08/07','1','1','100','101','99','103']] }) })), null);
  assert.equal(parseOfficialPriceBackfillPage(page({ responseText: JSON.stringify({ stat: 'OK', fields, data: [['114/02/30','1','1','100','105','99','103']] }) })), null);
  assert.equal(parseOfficialPriceBackfillPage({ ...page(), extra: true }), null);
});

test('derives official TPEx rows and normalizes trading lots to shares', () => {
  const responseText = JSON.stringify({ stat: 'ok', tables: [{ fields: ['日 期','成交張數','成交仟元','開盤','最高','最低','收盤'], data: [['2025/08/07','2','10','50','52','49','51']] }] });
  const value = page({ symbol: '6770', exchange: 'TPEX', responseText,
    responseSha256: createHash('sha256').update(responseText).digest('hex'),
    sourceUrl: 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=6770&date=2025%2F08%2F01&response=json' });
  assert.equal(parseOfficialPriceBackfillPage(value)?.[0]?.volume, 2000);
});
