import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { candidateFinancialFactsFromValidatedManifest } from './candidate-financial-documents.ts';
import { parseCandidateFinancialLocalParserResult, type CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';

const bytes = new TextEncoder().encode('<xbrli:xbrl/>');
const sha = createHash('sha256').update(bytes).digest('hex');
type ValidatedFact = NonNullable<CandidateFinancialLocalParserResult['validatedFacts']>[number];
function report(facts: ValidatedFact[]): CandidateFinancialLocalParserResult {
  return { schema: 'candidate-financial-document-parser-v1', status: 'complete', parser: 'arelle',
    inputSha256: sha, runtimeVersion: '2.44.7', taxonomySha256: 'a'.repeat(64),
    locators: facts.map((fact) => ({ xbrl_context: fact.xbrl_context, xbrl_concept: fact.xbrl_concept })),
    missingRequirements: [], validatedFacts: facts,
    validation: { errorCount: 0, errorCodes: [], validFactCount: facts.length, errorsTruncated: false } };
}
function fact(concept = 'Revenue', overrides: Partial<ValidatedFact> = {}): ValidatedFact {
  return { xbrl_context: 'Q2', xbrl_concept: `tifrs:${concept}`, value: '100',
    unit: 'TWD', entity_identifier: '2330', period_start: '2026-04-01', period_end: '2026-06-30',
    duration_kind: 'quarterly', dimension_count: 0, ...overrides };
}
function input(parse = report([fact()])) {
  return { bytes, documentSha256: sha, parse,
    candidate: { stockId: '11111111-1111-4111-8111-111111111111', symbol: '2330', exchange: 'TWSE' as const },
    periodEnd: '2026-06-30', sourceUrl: 'https://mopsov.twse.com.tw/server-java/FileDownLoad',
    collectedAt: '2026-08-15T12:00:00Z' };
}

test('clean structural facts yield pending accounting inputs for general, financial, cyclical and loss-making issuers', () => {
  const families = [
    { symbol: '2330', concept: 'Revenue', key: 'quarterly_revenue', value: '100', unit: 'TWD', instant: false },
    { symbol: '2887', concept: 'EquityAttributableToOwnersOfParent', key: 'common_equity_attributable_to_owners', value: '200', unit: 'TWD', instant: true },
    { symbol: '2002', concept: 'TotalInterestBearingDebt', key: 'total_debt', value: '30', unit: 'TWD', instant: true },
    { symbol: '2332', concept: 'BasicEarningsLossPerShare', key: 'quarterly_basic_eps', value: '-1.25', unit: 'TWD_per_share', instant: false },
  ] as const;
  for (const family of families) {
    const raw = fact(family.concept, { entity_identifier: family.symbol, value: family.value, unit: family.unit,
      duration_kind: family.instant ? 'instant' : 'quarterly', period_start: family.instant ? null : '2026-04-01' });
    const request = input(report([raw]));
    request.candidate.symbol = family.symbol;
    const rows = candidateFinancialFactsFromValidatedManifest(request);
    assert.equal(rows.length, 1, family.symbol);
    assert.equal(rows[0].factKey, family.key);
    assert.equal(rows[0].value, Number(family.value));
    assert.equal(rows[0].filingPublishedAt, '2026-08-15T12:00:00.000Z');
    assert.equal(rows[0].validation, undefined, 'structural validation is not accounting validation');
    assert.match(rows[0].sourceRef, new RegExp(`^issuer-document:${sha}:`));
  }
});

test('document mapping refuses wrong hash, entity, period, unit and duration without fabricating facts', () => {
  assert.deepEqual(candidateFinancialFactsFromValidatedManifest({ ...input(), documentSha256: 'b'.repeat(64) }), []);
  for (const bad of [
    { entity_identifier: '9999' }, { period_end: '2025-06-30' }, { unit: 'share' as const },
    { duration_kind: 'instant' as const, period_start: null }, { period_start: '2026-02-30' },
  ]) assert.deepEqual(candidateFinancialFactsFromValidatedManifest(input(report([fact('Revenue', bad)]))), []);
  assert.deepEqual(candidateFinancialFactsFromValidatedManifest({ ...input(), collectedAt: '2026-06-01T00:00:00Z' }), []);
});

test('any structural validation error blocks facts even when individually typed xValid numbers exist', () => {
  const parse = report([fact()]);
  parse.status = 'partial'; parse.missingRequirements = ['arelle_validation_errors'];
  parse.validation!.errorCount = 1; parse.validation!.errorCodes = ['xbrl.invalid'];
  assert.deepEqual(candidateFinancialFactsFromValidatedManifest(input(parse)), []);
  assert.throws(() => parseCandidateFinancialLocalParserResult(JSON.stringify(parse), sha), /invalid_fact_manifest/u);
});

test('parser result checks complete manifest cardinality, locators, and disallows PDF asserted success', () => {
  const parse = report([fact()]);
  assert.equal(parseCandidateFinancialLocalParserResult(JSON.stringify(parse), sha).validatedFacts?.length, 1);
  assert.throws(() => parseCandidateFinancialLocalParserResult(JSON.stringify({ ...parse,
    validation: { ...parse.validation, validFactCount: 2 } }), sha), /invalid_fact_manifest/u);
  assert.throws(() => parseCandidateFinancialLocalParserResult(JSON.stringify({ ...parse,
    locators: [{ xbrl_context: '' }] }), sha), /invalid_shape/u);
  assert.throws(() => parseCandidateFinancialLocalParserResult(JSON.stringify({ ...parse,
    parser: 'pdfplumber', validatedFacts: [], validation: undefined }), sha), /invalid_fact_manifest/u);
});

test('conflicting duplicate values remain distinct immutable inputs for accounting rejection', () => {
  const rows = candidateFinancialFactsFromValidatedManifest(input(report([fact(), fact('Revenue', { value: '101' })])));
  assert.equal(rows.length, 2);
  assert.notEqual(rows[0].sourceRef, rows[1].sourceRef, 'document completion must not silently deduplicate a conflicting value');
});

test('basic and diluted figures never share a semantic fact key', () => {
  const rows = candidateFinancialFactsFromValidatedManifest(input(report([
    fact('BasicEarningsPerShare', { unit: 'TWD_per_share', value: '2.5' }),
    fact('DilutedEarningsPerShare', { unit: 'TWD_per_share', value: '2.4' }),
    fact('WeightedAverageNumberOfSharesOutstanding', { unit: 'share', value: '100' }),
    fact('WeightedAverageNumberOfDilutedSharesOutstanding', { unit: 'share', value: '104' }),
  ])));
  assert.deepEqual(rows.map((row) => row.factKey), ['quarterly_basic_eps', 'quarterly_diluted_eps',
    'basic_weighted_average_shares', 'diluted_weighted_average_shares']);
});

test('quarterly document facts preserve exact single-quarter and year-to-date periods without converting their values', () => {
  for (const [start, end, semantics] of [
    ['2026-01-01', '2026-03-31', 'discrete_quarter'],
    ['2026-04-01', '2026-06-30', 'discrete_quarter'],
    ['2026-07-01', '2026-09-30', 'discrete_quarter'],
    ['2026-10-01', '2026-12-31', 'discrete_quarter'],
    ['2026-01-01', '2026-06-30', 'year_to_date'],
    ['2026-01-01', '2026-09-30', 'year_to_date'],
    ['2026-01-01', '2026-12-31', 'year_to_date'],
  ]) {
    for (const [concept, unit] of [['Revenue', 'TWD'], ['BasicEarningsPerShare', 'TWD_per_share']] as const) {
      const rows = candidateFinancialFactsFromValidatedManifest({
        ...input(report([fact(concept, { period_start: start, period_end: end, value: '12.25', unit })])),
        periodEnd: end, collectedAt: '2027-03-31T12:00:00Z',
      });
      assert.equal(rows.length, 1, `${concept} ${start}/${end}`);
      assert.equal(rows[0].locator?.period_semantics, semantics);
      assert.equal(rows[0].periodStart, start);
      assert.equal(rows[0].periodEnd, end);
      assert.equal(rows[0].durationKind, 'quarterly', 'preserve the compatible duration enum');
      assert.equal(rows[0].value, 12.25, 'mapper must never decumulate or annualize EPS or revenue');
    }
  }
});

test('document mapper rejects unsupported fiscal intervals and labels quarter-end instant facts', () => {
  for (const [start, end] of [
    ['2026-02-01', '2026-06-30'], ['2026-04-01', '2026-09-30'],
    ['2025-01-01', '2026-06-30'], ['2026-01-02', '2026-06-30'],
    ['2026-01-01', '2026-06-29'], ['2026-01-01', '2026-05-31'],
  ]) {
    assert.deepEqual(candidateFinancialFactsFromValidatedManifest({
      ...input(report([fact('Revenue', { period_start: start, period_end: end })])),
      periodEnd: end,
    }), [], `${start}/${end}`);
  }
  const rows = candidateFinancialFactsFromValidatedManifest(input(report([
    fact('Assets', { period_start: null, duration_kind: 'instant' }),
  ])));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].locator?.period_semantics, 'instant');
  assert.equal(rows[0].periodStart, null);
  assert.deepEqual(candidateFinancialFactsFromValidatedManifest({
    ...input(report([fact('Assets', { period_start: null, duration_kind: 'instant', period_end: '2026-06-29' })])),
    periodEnd: '2026-06-29',
  }), []);
});
