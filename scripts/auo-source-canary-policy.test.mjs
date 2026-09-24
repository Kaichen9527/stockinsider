import assert from 'node:assert/strict';
import test from 'node:test';
import { auoLedgerFactHash, auoOfficialAnchorHash, validateAuoHistoricalPbRows,
  validateAuoLedgerFacts, validateAuoOfficialAnchor } from './auo-source-canary-policy.ts';

const cutoff = '2026-09-19T23:59:59+08:00';

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
  assert.equal(validateAuoHistoricalPbRows(rows(), cutoff).length, 48);
  assert.throws(() => validateAuoHistoricalPbRows(rows(47), cutoff), /incomplete/u);
  const duplicate = rows();
  duplicate[47] = { ...duplicate[46] };
  assert.throws(() => validateAuoHistoricalPbRows(duplicate, cutoff), /month_duplicate/u);
  const futureBvps = rows();
  futureBvps[0] = { ...futureBvps[0], bookValueAvailableAt: '2023-01-01' };
  assert.throws(() => validateAuoHistoricalPbRows(futureBvps, cutoff), /row_invalid/u);
  const untrusted = rows();
  untrusted[0] = { ...untrusted[0], sourceUrl: 'https://example.com/BWIBBU_d' };
  assert.throws(() => validateAuoHistoricalPbRows(untrusted, cutoff), /row_invalid/u);
  const postCutoff = rows();
  postCutoff[47] = { ...postCutoff[47], date: '2026-09-21',
    sourceUrl: 'https://www.twse.com.tw/rwd/zh/afterTrading/BWIBBU_d?date=20260921&selectType=ALL&response=json' };
  assert.throws(() => validateAuoHistoricalPbRows(postCutoff, cutoff), /row_invalid/u);
});

function officialAnchor() {
  const anchor = {
    periodEnd: '2026-06-30', commonEquityTwd: 171_051_000_000,
    issuedCommonShares: 7_547_000_000, reportedBvps: 22.665,
    equitySourceUrl: 'https://openapi.twse.com.tw/v1/opendata/t187ap07_L_ci',
    sharesSourceUrl: 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L',
    equityAvailableAt: '2026-07-30T08:00:00Z', sharesAvailableAt: '2026-09-18T08:00:00Z',
    recordedAt: '2026-09-18T09:00:00Z',
  };
  return { ...anchor, receipt: {
    receiptId: '30000000-0000-4000-8000-000000000001',
    validationReceiptId: '40000000-0000-4000-8000-000000000001',
    documentSha256: 'c'.repeat(64), inputHash: 'd'.repeat(64),
    anchorSha256: auoOfficialAnchorHash(anchor),
  } };
}

test('AUO equity anchor is immutable and cutoff-bound instead of using live endpoints', () => {
  assert.equal(validateAuoOfficialAnchor(officialAnchor(), cutoff).periodEnd, '2026-06-30');
  const edited = officialAnchor(); edited.commonEquityTwd += 1_000_000;
  assert.throws(() => validateAuoOfficialAnchor(edited, cutoff), /anchor_invalid/u);
  const late = officialAnchor(); late.sharesAvailableAt = '2026-09-20T00:00:00Z';
  assert.throws(() => validateAuoOfficialAnchor(late, cutoff), /anchor_invalid/u);
});

function admittedFacts() {
  const keys = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common'];
  return Array.from({ length: 32 }, (_, index) => {
    const quarter = index % 8;
    const year = quarter < 4 ? 2024 : 2025;
    const q = quarter % 4;
    const periodEnd = `${year}-${['03-31', '06-30', '09-30', '12-31'][q]}`;
    const sourceUrl = `https://mopsov.twse.com.tw/server-java/FileDownLoad?fact=${index}`;
    const fact = {
      factId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      factKey: keys[Math.floor(index / 8)], periodStart: `${year}-01-01`, periodEnd,
      durationKind: 'quarterly', value: 100 + index, unit: 'TWD', sourceRef: sourceUrl,
      filingRestatementId: null, filingPublishedAt: '2026-08-15T00:00:00Z',
      provider: 'mops', authorityTier: 'official_filing', validationStatus: 'validated',
      schemaValid: true, unitValid: true, pointInTimeValid: true, consistencyValid: true,
      recordedAt: '2026-08-16T00:00:00Z',
    };
    return { ...fact, receipt: {
      receiptId: `10000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      validationReceiptId: `20000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      documentSha256: 'a'.repeat(64), inputHash: 'b'.repeat(64),
      factSha256: auoLedgerFactHash(fact), sourceUrl, recordedAt: '2026-08-16T00:00:00Z',
    } };
  });
}

test('AUO ledger facts are immutable receipt-bound and point-in-time admitted', () => {
  const facts = admittedFacts();
  assert.equal(validateAuoLedgerFacts(facts, cutoff).length, 32);
  const edited = structuredClone(facts);
  edited[0].value += 1;
  assert.throws(() => validateAuoLedgerFacts(edited, cutoff), /receipt_invalid/u);
  const late = structuredClone(facts);
  late[0].receipt.recordedAt = '2026-09-20T00:00:00Z';
  assert.throws(() => validateAuoLedgerFacts(late, cutoff), /receipt_invalid/u);
  const unvalidated = structuredClone(facts);
  unvalidated[0].validationStatus = 'pending';
  assert.throws(() => validateAuoLedgerFacts(unvalidated, cutoff), /receipt_invalid/u);
});
