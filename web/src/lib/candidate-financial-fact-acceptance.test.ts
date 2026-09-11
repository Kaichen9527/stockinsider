import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { candidateFinancialStructuralAdmission, canonicalFinancialManifest, financialFactAcceptanceHash,
  isFinancialFactAcceptanceShape, MAX_FINANCIAL_PARSER_EVIDENCE_BYTES } from './candidate-financial-fact-acceptance.ts';
import { parseCandidateFinancialLocalParserResult, type CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';
import { candidateFinancialFactsFromValidatedManifest } from './candidate-financial-documents.ts';
import { candidateFinancialParserEvidence, filterArelleValidatedFacts } from './candidate-financial-document-worker.ts';

function fixture(): CandidateFinancialLocalParserResult {
  return JSON.parse(readFileSync(new URL('../../../scripts/fixtures/candidate-financial-document-parser/partial-scope-contract.json', import.meta.url), 'utf8'));
}
function reseal(value: CandidateFinancialLocalParserResult) {
  value.errorManifestSha256 = financialFactAcceptanceHash(value.factAcceptance!); return value;
}

test('canonical manifest includes every nested error/reference and uses deterministic compact UTF8 keys', () => {
  assert.equal(canonicalFinancialManifest({ z: [{ b: '台積電', a: 1 }], a: null }), '{"a":null,"z":[{"a":1,"b":"台積電"}]}');
  const parse = fixture();
  assert.equal(financialFactAcceptanceHash(parse.factAcceptance!), parse.errorManifestSha256);
  parse.factAcceptance!.errors[0].refs[0].sourceLine = 92;
  assert.notEqual(financialFactAcceptanceHash(parse.factAcceptance!), parse.errorManifestSha256);
  assert.throws(() => canonicalFinancialManifest({ unsafe: 1.5 }), /noncanonical/);
});

test('raw instance does not invent an extraction pass and no legacy downgrade can drop error proof', () => {
  const parse = fixture();
  parse.factAcceptance!.extractedInstanceSha256 = null;
  parse.factAcceptance!.extractedValidationCompleted = false;
  parse.validatedFacts![0].extractedFactId = parse.validatedFacts![0].sourceFactId;
  assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), true);
  parse.factAcceptance!.extractedValidationCompleted = true;
  assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), false);
  const downgraded = fixture();
  downgraded.schema = 'candidate-financial-document-parser-v1';
  downgraded.status = 'complete'; downgraded.missingRequirements = [];
  downgraded.validation!.errorCount = 0; downgraded.validation!.errorCodes = [];
  assert.equal(candidateFinancialStructuralAdmission(downgraded), false);
});

test('error-manifest overflow is diagnostic only and the full serialized boundary is still 2MiB', () => {
  const parse = fixture();
  parse.validatedFacts = []; parse.validation!.validFactCount = 0;
  parse.validation!.errorCount = 20_000; parse.validation!.errorsTruncated = true;
  parse.factAcceptance!.manifestComplete = false;
  reseal(parse);
  assert.equal(parseCandidateFinancialLocalParserResult(JSON.stringify(parse), parse.inputSha256).status, 'partial');
  assert.equal(candidateFinancialStructuralAdmission(parse), false);
  assert.throws(() => parseCandidateFinancialLocalParserResult(' '.repeat(MAX_FINANCIAL_PARSER_EVIDENCE_BYTES + 1), parse.inputSha256), /output_too_large/);
});

test('unknown or unresolved errors are fatal, not safe-scoped solely because a fact has xValid', () => {
  const parse = fixture();
  parse.factAcceptance!.errors[0].code = 'unknown:validationCondition';
  assert.equal(isFinancialFactAcceptanceShape(parse.factAcceptance), false);
  parse.factAcceptance!.errors[0].fatal = true; parse.factAcceptance!.documentFatal = true;
  assert.equal(isFinancialFactAcceptanceShape(parse.factAcceptance), true);
  assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), false);
  parse.factAcceptance!.errors[0].refs = [];
  assert.equal(isFinancialFactAcceptanceShape(parse.factAcceptance), true, 'fatal unscoped diagnostic remains auditable');
});

test('conflicting duplicate facts use an explicit scoped error and their rejection closure still applies', () => {
  const parse = fixture();
  parse.factAcceptance!.errors[0].code = 'stockinsider:conflictingFactDuplicates';
  parse.validation!.errorCodes = ['stockinsider:conflictingFactDuplicates'];
  assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), true, 'an unrelated rejected duplicate does not poison this fact');
  parse.factAcceptance!.rejections[0].factKey = parse.validatedFacts![0].factKey!;
  assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), false);
});

test('all emitted fact identities, namespaces and duplicate/rejection keys are checked at the shared boundary', () => {
  for (const mutate of [
    (parse: CandidateFinancialLocalParserResult) => { parse.validatedFacts![0].xValid = undefined; },
    (parse: CandidateFinancialLocalParserResult) => { parse.validatedFacts![0].concept_namespace = ''; },
    (parse: CandidateFinancialLocalParserResult) => { parse.validatedFacts![0].sourceFactId = 'not-a-phase-index'; },
    (parse: CandidateFinancialLocalParserResult) => { parse.validatedFacts!.push({ ...parse.validatedFacts![0] }); parse.validation!.validFactCount = 2; },
    (parse: CandidateFinancialLocalParserResult) => { parse.factAcceptance!.rejections[0].errorIndexes = [0, 0]; },
  ]) { const parse = fixture(); mutate(parse); assert.equal(candidateFinancialStructuralAdmission(reseal(parse)), false); }
});

test('v10 worker evidence retains errors and semantic mapper emits only a hash-bound pending fact', () => {
  const bytes = new TextEncoder().encode('<html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"/>');
  const hash = createHash('sha256').update(bytes).digest('hex');
  const parse = fixture(); parse.inputSha256 = hash; parse.factAcceptance!.documentSha256 = hash; reseal(parse);
  const evidence = candidateFinancialParserEvidence(parse, hash);
  assert.equal(evidence.schema, 'candidate-financial-parser-evidence-v10');
  assert.equal(evidence.documentStatus, 'partial');
  assert.deepEqual(evidence.factAcceptance?.errors, parse.factAcceptance!.errors);
  assert.equal(evidence.validation?.errorCount, 1);
  const input = { bytes, documentSha256: hash, parse, candidate: { stockId: '11111111-1111-4111-8111-111111111111',
    symbol: '2330', exchange: 'TWSE' as const }, periodEnd: '2026-06-30',
    sourceUrl: 'https://mopsov.twse.com.tw/server-java/FileDownLoad', collectedAt: '2026-08-15T12:00:00Z' };
  const facts = candidateFinancialFactsFromValidatedManifest(input);
  assert.equal(facts.length, 1);
  assert.equal(facts[0].validation, undefined);
  assert.equal(facts[0].locator?.structural_fact_key, parse.validatedFacts![0].factKey);
  assert.equal(facts[0].locator?.concept_namespace, parse.validatedFacts![0].concept_namespace);
  assert.deepEqual(filterArelleValidatedFacts([{ ...facts[0], value: facts[0].value + 0.0000001 }], parse), [],
    'a close numeric value is not the exact validated fact');
  parse.factAcceptance!.extractedInstanceSha256 = null;
  parse.factAcceptance!.extractedValidationCompleted = false;
  parse.validatedFacts![0].extractedFactId = parse.validatedFacts![0].sourceFactId;
  reseal(parse);
  assert.deepEqual(candidateFinancialFactsFromValidatedManifest(input), [], 'inline cannot claim raw-instance no-extraction exemption');
});
