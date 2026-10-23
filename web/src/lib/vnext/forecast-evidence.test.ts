import test from 'node:test';
import assert from 'node:assert/strict';
import { FORECAST_DESCRIPTOR_VERSION, FORECAST_SERVER_CHECK, projectDiagnosticForecasts, type ForecastSourceDescriptor, type ForecastKind } from './forecast-evidence.ts';

// All descriptors below are synthetic structural fixtures, never DB authority.
const stockId = '11111111-1111-4111-8111-111111111111';
const scope = { stockId, symbol: '2330', cutoff: '2026-10-23T08:00:00.000Z' };
function fixture(kind: ForecastKind = 'next_four_quarters'): ForecastSourceDescriptor {
  const field = (start: string, end: string, value: number, year: number | null, quarter: number | null, index = 0) => ({ path: `/synthetic/forecast/${index}`, rowHash: String(index + 1).repeat(64), value, unit: 'TWD_per_share' as const, periodStart: start, periodEnd: end, fiscalYear: year, fiscalQuarter: quarter });
  return {
    schemaVersion: FORECAST_DESCRIPTOR_VERSION, kind, issuer: { stockId, symbol: '2330' },
    document: { stockId, revisionId: 'synthetic-revision-1', documentId: 'synthetic-document-1', contentHash: 'a'.repeat(64), publicUrl: 'https://issuer.example.org/synthetic-guidance.pdf', publishedAt: '2026-10-23T01:00:00.000Z', availableAt: '2026-10-23T02:00:00.000Z' },
    publisher: { identityId: 'synthetic-publisher', institutionId: 'synthetic-institution', verificationId: 'synthetic-verification', revisionId: 'synthetic-revision-1', contentHash: 'a'.repeat(64), manifestId: 'synthetic-manifest', verifiedAt: '2026-10-23T03:00:00.000Z' },
    manifest: { id: 'synthetic-manifest', rootHash: 'b'.repeat(64), revisionId: 'synthetic-revision-1', contentHash: 'a'.repeat(64), recordedAt: '2026-10-23T04:00:00.000Z' },
    rights: { receiptId: 'synthetic-rights-receipt', publisherId: 'synthetic-publisher', revisionId: 'synthetic-revision-1', contentHash: 'a'.repeat(64), licenseBasis: 'public_issuer_guidance', permittedUse: 'structured_numeric_forecast', validFrom: '2026-10-23T00:00:00.000Z', validUntil: '2027-10-23T00:00:00.000Z', revokedAt: null, recordedAt: '2026-10-23T04:00:00.000Z' },
    shareBasis: kind === 'target_12m' ? null : { kind: 'diluted', basisId: 'synthetic-disclosed-constant-basis', denominatorShares: 1000000, numerator: 'common_shareholders_income', adjustment: 'source_disclosed_constant_denominator' },
    fiscalCalendar: kind === 'annual_forecast' || kind === 'next_four_quarters' ? { id: 'synthetic-calendar', revisionHash: 'c'.repeat(64), issuerStockId: stockId, yearStartMonth: 1 } : null,
    fields: kind === 'next_four_quarters' ? [field('2027-01-01', '2027-03-31', 1, 2027, 1), field('2027-04-01', '2027-06-30', 2, 2027, 2, 1), field('2027-07-01', '2027-09-30', 3, 2027, 3, 2), field('2027-10-01', '2027-12-31', 4, 2027, 4, 3)] :
      kind === 'annual_forecast' ? [field('2027-01-01', '2027-12-31', 10, 2027, null)] : [field('2026-10-23', '2027-10-22', kind === 'target_12m' ? 150 : 10, null, null)],
  };
}
const run = (...rows: unknown[]) => projectDiagnosticForecasts(rows, scope);
const rejected = (row: unknown, reason: string) => { const result = run(row); assert.equal(result.candidates.length, 0); assert.ok(result.gaps.includes(reason), result.gaps.join(',')); };

test('synthetic explicit consecutive source quarters produce diagnostic EPS only, never reported annual authority', () => {
  const d = fixture(); const result = run(d);
  assert.equal(result.authority, 'diagnostic_only'); assert.equal(result.reportedAnnualEps, null); assert.deepEqual(result.gaps, [FORECAST_SERVER_CHECK]);
  assert.equal(result.candidates[0].value, 10); assert.equal(result.candidates[0].key, 'next_four_quarter_eps'); assert.equal(result.candidates[0].period, '2027-Q1/2027-Q4');
  assert.equal(result.candidates[0].serverCurrentCheck, FORECAST_SERVER_CHECK);
  d.fields[0].value = 999; assert.equal(result.candidates[0].sourceDescriptor.fields[0].value, 1);
});
test('annual forecast, NTM and target12m retain separate keys and cannot fill reported annual/next4 fields', () => {
  const result = run(fixture('annual_forecast'), fixture('ntm'), fixture('target_12m'));
  assert.deepEqual(result.candidates.map(c => c.key).sort(), ['annual_forecast_eps', 'ntm_eps', 'target_price_12m']);
  assert.equal(result.reportedAnnualEps, null); assert.ok(result.candidates.every(c => c.key !== 'next_four_quarter_eps'));
});
test('missing, duplicate and nonconsecutive quarter vectors reject instead of estimating missing periods', () => {
  const missing = fixture(); missing.fields.pop(); rejected(missing, 'forecast_source_vector_invalid');
  const duplicate = fixture(); duplicate.fields[1] = { ...duplicate.fields[0], path: '/synthetic/forecast/other' }; rejected(duplicate, 'forecast_quarters_not_consecutive');
  const wrongQuarter = fixture(); wrongQuarter.fields[1].fiscalQuarter = 3; rejected(wrongQuarter, 'forecast_quarters_not_consecutive');
  const later = fixture(); later.fields.forEach(f => { f.fiscalYear = 2028; f.periodStart = f.periodStart.replace('2027', '2028'); f.periodEnd = f.periodEnd.replace('2027', '2028'); }); rejected(later, 'forecast_quarters_not_next');
});
test('unit, share denominator and calendar issuer mismatches cannot be scalar EPS shortcuts', () => {
  const wrongUnit = fixture(); Object.assign(wrongUnit.fields[2], { unit: 'TWD' }); rejected(wrongUnit, 'forecast_numeric_field_invalid');
  const wrongTargetUnit = fixture('target_12m'); Object.assign(wrongTargetUnit.fields[0], { unit: 'TWD' }); rejected(wrongTargetUnit, 'forecast_numeric_field_invalid');
  const missingBasis = fixture(); missingBasis.shareBasis = null; rejected(missingBasis, 'forecast_share_basis_missing');
  const unknownDenominator = fixture(); unknownDenominator.shareBasis!.denominatorShares = 0; rejected(unknownDenominator, 'forecast_share_basis_missing');
  const wrongCalendar = fixture(); wrongCalendar.fiscalCalendar!.issuerStockId = '22222222-2222-4222-8222-222222222222'; rejected(wrongCalendar, 'forecast_fiscal_calendar_missing');
});
test('crossissuer document, mismatched revision/hash/manifest and publisher binding reject', () => {
  const issuer = fixture(); issuer.issuer.symbol = '2408'; rejected(issuer, 'forecast_issuer_scope_mismatch');
  const doc = fixture(); doc.document.stockId = '22222222-2222-4222-8222-222222222222'; rejected(doc, 'forecast_original_document_missing');
  const hash = fixture(); hash.publisher.contentHash = 'd'.repeat(64); rejected(hash, 'forecast_publisher_revision_binding_missing');
  const manifest = fixture(); manifest.manifest.revisionId = 'another-revision'; rejected(manifest, 'forecast_manifest_binding_missing');
  const publisher = fixture(); publisher.rights.publisherId = 'another-publisher'; rejected(publisher, 'forecast_rights_receipt_missing');
});
test('revocation, expiration, absent rights and paid/private source descriptors remain gaps', () => {
  const revoked = fixture(); revoked.rights.revokedAt = '2026-10-23T05:00:00.000Z'; rejected(revoked, 'forecast_rights_not_current');
  const expired = fixture(); expired.rights.validUntil = scope.cutoff; rejected(expired, 'forecast_rights_not_current');
  const absent = { ...fixture(), rights: null }; rejected(absent, 'forecast_rights_receipt_missing');
  for (const url of ['https://issuer.example.org/member/report', 'https://t.me/private', 'http://issuer.example.org/report', 'https://user:secret@issuer.example.org/report']) { const d = fixture(); d.document.publicUrl = url; rejected(d, 'forecast_original_document_missing'); }
});
test('future original clocks and stale source publication reject; later receipt clocks cannot refresh publication age', () => {
  const future = fixture(); future.publisher.verifiedAt = '2026-10-24T00:00:00.000Z'; rejected(future, 'forecast_original_clock_invalid');
  const reversed = fixture(); reversed.document.availableAt = '2026-10-22T00:00:00.000Z'; rejected(reversed, 'forecast_original_clock_invalid');
  const stale = fixture(); stale.document.publishedAt = '2026-01-01T00:00:00.000Z'; rejected(stale, 'forecast_source_stale');
});
test('annual year/calendar and NTM period crosswiring reject, including leap-day and invalid dates', () => {
  const annual = fixture('annual_forecast'); annual.fields[0].fiscalYear = 2026; rejected(annual, 'forecast_annual_period_invalid');
  const ntm = fixture('ntm'); ntm.fields[0].fiscalQuarter = 4; rejected(ntm, 'forecast_horizon_crosswired');
  const wrongEnd = fixture('ntm'); wrongEnd.fields[0].periodEnd = '2027-10-23'; rejected(wrongEnd, 'forecast_rolling_horizon_end_invalid');
  const invalidDate = fixture(); invalidDate.fields[0].periodEnd = '2027-02-29'; rejected(invalidDate, 'forecast_numeric_field_invalid');
  const leap = fixture('ntm'); leap.document.publishedAt = '2028-02-29T01:00:00.000Z'; leap.document.availableAt = '2028-02-29T02:00:00.000Z'; leap.publisher.verifiedAt = '2028-02-29T03:00:00.000Z'; leap.manifest.recordedAt = leap.rights.recordedAt = '2028-02-29T04:00:00.000Z'; leap.rights.validFrom = '2028-02-29T00:00:00.000Z'; leap.rights.validUntil = '2029-03-01T00:00:00.000Z'; leap.fields[0].periodStart = '2028-02-29'; leap.fields[0].periodEnd = '2029-02-27';
  assert.equal(projectDiagnosticForecasts([leap], { ...scope, cutoff: '2028-02-29T08:00:00.000Z' }).candidates.length, 1);
});
test('non-January fiscal calendar and shuffled explicit source vector preserve actual dates', () => {
  const d = fixture(); d.fiscalCalendar!.yearStartMonth = 4;
  const periods = [['2026-10-01', '2026-12-31', 2026, 3], ['2027-01-01', '2027-03-31', 2026, 4], ['2027-04-01', '2027-06-30', 2027, 1], ['2027-07-01', '2027-09-30', 2027, 2]] as const;
  periods.forEach(([start, end, year, quarter], index) => Object.assign(d.fields[index], { periodStart: start, periodEnd: end, fiscalYear: year, fiscalQuarter: quarter }));
  // Current partial fiscal quarter is deliberately not claimed as "next".
  rejected(d, 'forecast_quarters_not_future');
  const shiftedScope = { ...scope, cutoff: '2026-09-23T08:00:00.000Z' }; d.document.publishedAt = '2026-09-23T01:00:00.000Z'; d.document.availableAt = '2026-09-23T02:00:00.000Z'; d.publisher.verifiedAt = '2026-09-23T03:00:00.000Z'; d.manifest.recordedAt = d.rights.recordedAt = '2026-09-23T04:00:00.000Z'; d.rights.validFrom = '2026-09-23T00:00:00.000Z'; d.fields.reverse();
  const result = projectDiagnosticForecasts([d], shiftedScope); assert.equal(result.candidates[0].period, '2026-Q3/2027-Q2'); assert.equal(result.candidates[0].value, 10);
});
test('conflicting original values or share bases suppress the cohort without averaging publishers', () => {
  for (const mutate of [(d: ForecastSourceDescriptor) => { d.fields[0].value = 9; }, (d: ForecastSourceDescriptor) => { d.shareBasis!.kind = 'basic'; }]) {
    const a = fixture(), b = fixture(); mutate(b); const result = run(a, b);
    assert.equal(result.candidates.length, 0); assert.ok(result.gaps.some(g => g.startsWith('forecast_conflicting_source_rows:')));
  }
});
test('closed schemas reject boolean approvals, extra principal/proof fields, NaN, malformed locators and unknown horizons', () => {
  rejected({ ...fixture(), approved: true }, 'forecast_descriptor_schema_invalid');
  const extra = fixture(); Object.assign(extra.publisher, { principal: 'forged' }); rejected(extra, 'forecast_publisher_revision_binding_missing');
  const nan = fixture(); nan.fields[0].value = NaN; rejected(nan, 'forecast_numeric_field_invalid');
  const path = fixture(); path.fields[0].path = 'summary'; rejected(path, 'forecast_numeric_field_invalid');
  rejected({ ...fixture(), kind: 'next_twelve_months_equals_four_quarters' }, 'forecast_descriptor_schema_invalid');
});
test('empty/unbounded scope is a diagnostic gap with no callbacks or IO and no source claim', () => {
  assert.equal(run().candidates.length, 0); assert.ok(run().gaps.includes('forecast_supported_candidate_missing'));
  assert.deepEqual(projectDiagnosticForecasts(Array(33).fill(fixture()), scope).gaps, [FORECAST_SERVER_CHECK, 'forecast_scope_invalid']);
  assert.equal(projectDiagnosticForecasts([fixture()], { ...scope, symbol: '2408' }).candidates.length, 0);
});
