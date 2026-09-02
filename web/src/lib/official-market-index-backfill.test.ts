import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { officialMarketIndexBatchHash, parseOfficialMarketIndexPage } from './official-market-index-backfill.ts';

test('official market index backfill accepts only hash-bound official payloads', () => {
  const payload = { fields: ['日期', '收盤指數'], data: [['115/09/01', '24,000.5']] };
  const page = {
    market: 'TWSE' as const,
    sourceUrl: 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=20260901&response=json',
    payload,
    responseSha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  };
  assert.deepEqual(parseOfficialMarketIndexPage(page)?.[0], { market: 'TWSE', sessionDate: '2026-09-01', close: 24000.5, sourceUrl: page.sourceUrl, responseSha256: page.responseSha256 });
  assert.match(officialMarketIndexBatchHash([page]), /^[0-9a-f]{64}$/u);
  assert.equal(parseOfficialMarketIndexPage({ ...page, sourceUrl: 'https://example.com/data' }), null);
  assert.equal(parseOfficialMarketIndexPage({ ...page, responseSha256: '0'.repeat(64) }), null);
});
