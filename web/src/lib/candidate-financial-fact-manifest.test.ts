import assert from 'node:assert/strict';
import test from 'node:test';
import { filterArelleValidatedFacts } from './candidate-financial-document-worker.ts';
import type { ParsedFact } from './candidate-official-financials.ts';

function fact(locator: { xbrl_context: string; xbrl_concept: string }): ParsedFact {
  return {
    stockId: '11111111-1111-4111-8111-111111111111', symbol: '2330',
    factKey: 'quarterly_revenue', periodStart: '2026-04-01', periodEnd: '2026-06-30',
    durationKind: 'quarterly', value: 100, unit: 'TWD', provider: 'mops',
    authorityTier: 'official_filing', estimateKind: 'reported', estimateHorizon: 'reported_period',
    filingPublishedAt: '2026-08-10T00:00:00Z', sourceTimestamp: '2026-08-10T00:00:00Z',
    collectedAt: '2026-08-10T01:00:00Z', filingRestatementId: null,
    sourceRef: 'issuer-document:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa:abc',
    locator,
  };
}

test('document facts cross the boundary only when Arelle validated the exact context and QName', () => {
  const accepted = fact({ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' });
  const wrongContext = fact({ xbrl_context: 'D-2025Q2', xbrl_concept: 'tifrs-full:Revenue' });
  const result = filterArelleValidatedFacts([accepted, wrongContext], {
    schema: 'candidate-financial-document-parser-v1', status: 'partial', parser: 'arelle',
    inputSha256: 'a'.repeat(64), missingRequirements: ['arelle_validation_errors'],
    locators: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' }],
    validatedFacts: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue', value: '100', unit: 'TWD' }],
    validation: { errorCount: 801, errorCodes: ['lxml.SCHEMAV_ELEMENT_CONTENT'], validFactCount: 1, errorsTruncated: false },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceRef, accepted.sourceRef);
  assert.equal(result[0]?.validation, undefined,
    'structural xValid must not be promoted to an accounting-consistency receipt');
});
