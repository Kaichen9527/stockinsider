import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { intersectOfficialCalendarPages, officialCalendarBackfillBatchHash, parseOfficialCalendarBackfillPage } from './official-calendar-backfill.ts';

function page(market: 'TWSE' | 'TPEX') {
  const responseText = market === 'TWSE'
    ? JSON.stringify({ stat: 'OK', fields: ['日期','收盤指數'], data: [['114/01/02','1'],['114/01/03','2']] })
    : JSON.stringify({ tables: [{ fields: ['日期','櫃買指數'], data: [['114/01/02',250],['114/01/03',251]] }] });
  const sourceUrl = market === 'TWSE'
    ? 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=20250101&response=json'
    : 'https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?date=2025/01/01&response=json';
  return { market, sourceUrl, responseText, responseSha256: createHash('sha256').update(responseText).digest('hex') };
}

test('accepts only hash-bound official monthly calendar evidence and intersects both markets', () => {
  const pages = [page('TWSE'), page('TPEX')];
  const parsed = pages.map(parseOfficialCalendarBackfillPage);
  assert.deepEqual(parsed.map((item) => item?.dates), [['2025-01-02','2025-01-03'],['2025-01-02','2025-01-03']]);
  assert.deepEqual(intersectOfficialCalendarPages(parsed.flatMap((item) => item ? [item] : []) )?.dates, ['2025-01-02','2025-01-03']);
  assert.match(officialCalendarBackfillBatchHash(pages), /^[0-9a-f]{64}$/u);
  assert.equal(parseOfficialCalendarBackfillPage({ ...pages[0], sourceUrl: 'https://example.com/?date=20250101&response=json' }), null);
  assert.equal(parseOfficialCalendarBackfillPage({ ...pages[0], responseSha256: '0'.repeat(64) }), null);
});
