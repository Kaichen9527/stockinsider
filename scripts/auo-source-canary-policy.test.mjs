import assert from 'node:assert/strict';
import test from 'node:test';
import { validateAuoHistoricalPbRows } from './auo-source-canary-policy.ts';

function rows(count = 48) {
  return Array.from({ length: count }, (_, index) => {
    const year = 2022 + Math.floor(index / 12);
    const month = index % 12 + 1;
    const date = `${year}-${String(month).padStart(2, '0')}-28`;
    return {
      date,
      close: 20,
      pb: 1,
      bookValuePerShare: 20,
      bookValuePeriodEnd: `${year - 2}-12-31`,
      bookValueAvailableAt: `${year - 1}-03-15`,
      bookValueSourceRef: `official-bvps-${year}`,
      sourceUrl: `https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=${date.replaceAll('-', '')}&selectType=ALL&response=json`,
    };
  });
}

test('AUO historical P/B requires 48 distinct official months paired to then-public BVPS', () => {
  assert.equal(validateAuoHistoricalPbRows(rows()).length, 48);
  assert.throws(() => validateAuoHistoricalPbRows(rows(47)), /incomplete/u);
  const duplicate = rows();
  duplicate[47] = { ...duplicate[46] };
  assert.throws(() => validateAuoHistoricalPbRows(duplicate), /month_duplicate/u);
  const futureBvps = rows();
  futureBvps[0] = { ...futureBvps[0], bookValueAvailableAt: '2023-01-01' };
  assert.throws(() => validateAuoHistoricalPbRows(futureBvps), /row_invalid/u);
  const untrusted = rows();
  untrusted[0] = { ...untrusted[0], sourceUrl: 'https://example.com/BWIBBU_d' };
  assert.throws(() => validateAuoHistoricalPbRows(untrusted), /row_invalid/u);
});
