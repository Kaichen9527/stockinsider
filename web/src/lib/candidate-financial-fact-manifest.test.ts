import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { filterArelleValidatedFacts } from './candidate-financial-document-worker.ts';
import { parseCandidateFinancialDocumentFacts } from './candidate-financial-documents.ts';
import { parseCandidateFinancialLocalParserResult, type CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';
import type { ParsedFact } from './candidate-official-financials.ts';

function partialScopeFixture() {
  return JSON.parse(readFileSync(new URL('../../../scripts/fixtures/candidate-financial-document-parser/partial-scope-contract.json', import.meta.url), 'utf8'));
}
function canonicalFixture(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalFixture);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value)
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([key, item]) => [key, canonicalFixture(item)]));
  return value;
}
function sealFixture(report: ReturnType<typeof partialScopeFixture>) {
  report.errorManifestSha256 = createHash('sha256').update(JSON.stringify(canonicalFixture(report.factAcceptance))).digest('hex');
  return report as CandidateFinancialLocalParserResult;
}
function partialCandidate() {
  return { ...fact({ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' }),
    locator: { xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue',
      structural_fact_key: 'c'.repeat(64), concept_namespace: 'urn:stockinsider:acceptance:tifrs-full' } };
}

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
    schema: 'candidate-financial-document-parser-v1', status: 'complete', parser: 'arelle',
    inputSha256: 'a'.repeat(64), runtimeVersion: '2.44.7', taxonomySha256: 'b'.repeat(64), missingRequirements: [],
    locators: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' }],
    validatedFacts: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue', value: '100', unit: 'TWD',
      entity_identifier: '2330', period_start: '2026-04-01', period_end: '2026-06-30',
      duration_kind: 'quarterly', dimension_count: 0 }],
    validation: { errorCount: 0, errorCodes: [], validFactCount: 1, errorsTruncated: false },
  });
  assert.equal(result.length, 1);
  assert.equal(result[0]?.sourceRef, accepted.sourceRef);
  assert.equal(result[0]?.validation, undefined,
    'structural xValid must not be promoted to an accounting-consistency receipt');
});

test('unscoped structural errors block the low-level fact filter even for individually typed numbers', () => {
  const candidate = fact({ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' });
  const admitted = filterArelleValidatedFacts([candidate], {
    schema: 'candidate-financial-document-parser-v1', status: 'partial', parser: 'arelle',
    inputSha256: 'a'.repeat(64), runtimeVersion: '2.44.7', taxonomySha256: 'b'.repeat(64),
    missingRequirements: ['arelle_validation_errors'],
    locators: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue' }],
    validatedFacts: [{ xbrl_context: 'D-2026Q2', xbrl_concept: 'tifrs-full:Revenue', value: '100', unit: 'TWD',
      entity_identifier: '2330', period_start: '2026-04-01', period_end: '2026-06-30',
      duration_kind: 'quarterly', dimension_count: 0 }],
    validation: { errorCount: 801, errorCodes: ['lxml.SCHEMAV_ELEMENT_CONTENT'], validFactCount: 1, errorsTruncated: false },
  });
  assert.deepEqual(admitted, [], 'xValid and matching locators alone cannot prove independence from unscoped errors');
});

test('scoped v2 admission preserves the entire partial-document error proof and remains pending accounting', () => {
  const report = partialScopeFixture();
  const parsed = parseCandidateFinancialLocalParserResult(JSON.stringify(report), report.inputSha256);
  assert.equal(parsed.status, 'partial');
  assert.deepEqual(parsed.missingRequirements, ['arelle_validation_errors']);
  assert.equal(parsed.validation?.errorCount, 1);
  assert.deepEqual((parsed as unknown as typeof report).factAcceptance, report.factAcceptance);
  assert.equal((parsed as unknown as typeof report).errorManifestSha256, report.errorManifestSha256);
  const admitted = filterArelleValidatedFacts([partialCandidate()], parsed);
  assert.equal(admitted.length, 1);
  assert.equal(admitted[0].validation, undefined, 'structural independence never substitutes for accounting validation');
});

test('raw XBRL declares extraction inapplicable without inventing a second validation pass', () => {
  const report = partialScopeFixture();
  report.factAcceptance.extractedInstanceSha256 = null;
  report.factAcceptance.extractedValidationCompleted = false;
  report.validatedFacts[0].extractedFactId = report.validatedFacts[0].sourceFactId;
  const sealed = sealFixture(report);
  const parsed = parseCandidateFinancialLocalParserResult(JSON.stringify(sealed), report.inputSha256);
  assert.equal(parsed.status, 'partial');
  assert.equal(filterArelleValidatedFacts([partialCandidate()], parsed).length, 1);
  report.validatedFacts[0].extractedFactId = 'source:999';
  assert.deepEqual(filterArelleValidatedFacts([partialCandidate()], sealFixture(report)), []);
});

test('direct, context, concept and calculation-dependent rejections cannot be overridden by xValid', () => {
  for (const [code, objectId] of [
    ['xmlSchema:valueError', 'revenue-safe'], ['xmlSchema:elementOccurrencesError', 'D-2026Q2'],
    ['lxml.SCHEMAV_ELEMENT_CONTENT', 'concept-Revenue'], ['xbrl.5.2.5.2:calcInconsistency', 'calc-total-to-child'],
    ['stockinsider:conflictingFactDuplicates', 'duplicate-revenue-group'],
  ]) {
    const report = partialScopeFixture();
    report.factAcceptance.errors[0] = { phase: 'extracted', code,
      refs: [{ href: `instance.xbrl#${objectId}`, objectId }], fatal: false };
    report.validation.errorCodes = [code];
    // The parser's complete transitive rejection closure explicitly contains
    // the selected fact. A caller cannot declare that same fact safe again.
    report.factAcceptance.rejections[0].factKey = 'c'.repeat(64);
    assert.deepEqual(filterArelleValidatedFacts([partialCandidate()], sealFixture(report)), [], code);
  }
});

test('fatal, unscoped, incomplete and tampered v2 proofs fail closed without dropping their errors', () => {
  const mutations = [
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.documentFatal = true; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.errors[0].refs = []; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.errors[0].fatal = true; },
    (report: ReturnType<typeof partialScopeFixture>) => {
      report.factAcceptance.errors[0].code = 'unknown:validationCondition'; report.validation.errorCodes = ['unknown:validationCondition'];
    },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.manifestComplete = false; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.sourceValidationCompleted = false; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.extractedValidationCompleted = false; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.validation.errorsTruncated = true; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.validation.errorCount = 0; report.validation.errorCodes = []; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.status = 'complete'; report.missingRequirements = []; },
    (report: ReturnType<typeof partialScopeFixture>) => { report.factAcceptance.rejections[0].errorIndexes = [1]; },
  ];
  for (const mutate of mutations) {
    const report = partialScopeFixture(); mutate(report);
    assert.deepEqual(filterArelleValidatedFacts([partialCandidate()], sealFixture(report)), []);
  }
  const tampered = partialScopeFixture();
  tampered.factAcceptance.errors[0].code = 'changed-after-sealing';
  assert.deepEqual(filterArelleValidatedFacts([partialCandidate()], tampered), []);
});

test('dimensional Equity and ProfitLoss cannot enter a scoped partial fact manifest', () => {
  for (const concept of ['Equity', 'ProfitLoss']) {
    const report = partialScopeFixture();
    report.validatedFacts[0].dimension_count = 1;
    report.validatedFacts[0].xbrl_concept = `tifrs-full:${concept}`;
    report.locators[0].xbrl_concept = `tifrs-full:${concept}`;
    const candidate = partialCandidate(); candidate.locator.xbrl_concept = `tifrs-full:${concept}`;
    assert.deepEqual(filterArelleValidatedFacts([candidate], report), [], concept);
  }
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
