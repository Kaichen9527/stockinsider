import assert from 'node:assert/strict';
import test from 'node:test';
import { filterArelleValidatedFacts } from './candidate-financial-document-worker.ts';
import { parseCandidateFinancialDocumentFacts } from './candidate-financial-documents.ts';
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
    validatedFacts: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue', value: '100', unit: 'TWD',
      entity_identifier: '2330', period_start: '2026-04-01', period_end: '2026-06-30',
      duration_kind: 'quarterly', dimension_count: 0 }],
    validation: { errorCount: 801, errorCodes: ['lxml.SCHEMAV_ELEMENT_CONTENT'], validFactCount: 1, errorsTruncated: false },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceRef, accepted.sourceRef);
  assert.equal(result[0]?.validation, undefined,
    'structural xValid must not be promoted to an accounting-consistency receipt');
});

test('regex comments cannot replace the Arelle-validated entity or period', () => {
  const sha = 'b'.repeat(64);
  const markup = `<?xml version="1.0"?><xbrli:xbrl xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:tifrs-full="urn:test">
  <xbrli:context id="ctx"><xbrli:entity><xbrli:identifier scheme="http://www.twse.com.tw">2330</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2025-12-31</xbrli:instant></xbrli:period></xbrli:context>
  <!-- <xbrli:context id="ctx"><xbrli:entity><xbrli:identifier scheme="http://www.twse.com.tw">2330</xbrli:identifier></xbrli:entity><xbrli:period><xbrli:instant>2026-03-31</xbrli:instant></xbrli:period></xbrli:context> -->
  <xbrli:unit id="TWD"><xbrli:measure>iso4217:TWD</xbrli:measure></xbrli:unit>
  <ix:nonNumeric name="tifrs-full:ReviewAuditDate" contextRef="ctx">2026-04-30</ix:nonNumeric>
  <ix:nonFraction name="tifrs-full:Assets" contextRef="ctx" unitRef="TWD" decimals="0">100</ix:nonFraction></xbrli:xbrl>`;
  const parsed = parseCandidateFinancialDocumentFacts({
    bytes: new TextEncoder().encode(markup), format: 'xbrl', documentSha256: sha,
    candidate: { stockId: '11111111-1111-4111-8111-111111111111', symbol: '2330', exchange: 'TWSE' },
    periodEnd: '2026-03-31', sourceUrl: 'https://mops.twse.com.tw/server-java/FileDownLoad',
    collectedAt: '2026-05-01T00:00:00Z',
  });
  assert.equal(parsed.length, 1, 'the legacy extractor reproduces the comment-context ambiguity');
  assert.equal(parsed[0]?.periodEnd, '2026-03-31');
  const admitted = filterArelleValidatedFacts(parsed, {
    schema: 'candidate-financial-document-parser-v1', status: 'complete', parser: 'arelle',
    inputSha256: sha, missingRequirements: [], locators: [{ xbrl_context: 'ctx', xbrl_concept: 'tifrs-full:Assets' }],
    validatedFacts: [{ xbrl_context: 'ctx', xbrl_concept: 'tifrs-full:Assets', value: '100', unit: 'TWD',
      entity_identifier: '2330', period_start: null, period_end: '2025-12-31', duration_kind: 'instant', dimension_count: 0 }],
    validation: { errorCount: 0, errorCodes: [], validFactCount: 1, errorsTruncated: false },
  });
  assert.deepEqual(admitted, []);
});
