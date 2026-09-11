import { createHash } from 'node:crypto';
import type { CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';

export const MAX_FINANCIAL_PARSER_EVIDENCE_BYTES = 2 * 1024 * 1024;
export const MAX_FINANCIAL_VALIDATION_ERRORS = 16_384;
export type CandidateFinancialFactAcceptance = {
  policyVersion: 'arelle-fact-scope-v1';
  documentSha256: string;
  taxonomySha256: string;
  extractedInstanceSha256: string | null;
  sourceValidationCompleted: boolean;
  extractedValidationCompleted: boolean;
  manifestComplete: boolean;
  documentFatal: boolean;
  errors: Array<{
    phase: 'source' | 'extracted'; code: string; fatal: boolean;
    refs: Array<{ href: string; objectId?: string; sourceLine?: number; xpath?: string }>;
  }>;
  rejections: Array<{ factKey: string; errorIndexes: number[] }>;
};

const sha256 = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/u.test(value);
const bounded = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length > 0 && value.length <= limit;
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const SCOPED_ERROR_CODES = new Set([
  'lxml.SCHEMAV_ELEMENT_CONTENT', 'xmlSchema:elementOccurrencesError', 'xmlSchema:valueError',
  'ix11.15.1.2:tupleMemberOrderMissing', 'ix11.11.1.2:tupleMemberOrderMissing', 'ix11.10.1.2:tupleMemberOrderMissing',
  'ix:tupleContent', 'xbrldie:PrimaryItemDimensionallyInvalidError', 'xbrl.5.2.5.2:calcInconsistency',
  'stockinsider:conflictingFactDuplicates',
]);

/** Explicit canonical JSON shared with the isolated Python parser and SQL.
 * Numeric values here are bounded integer indexes/line numbers, never floats. */
export function canonicalFinancialManifest(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalFinancialManifest).join(',')}]`;
  if (object(value)) return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalFinancialManifest(value[key])}`).join(',')}}`;
  if (value === null || typeof value === 'boolean' || typeof value === 'string'
    || (typeof value === 'number' && Number.isSafeInteger(value))) return JSON.stringify(value);
  throw new Error('candidate_financial_manifest_noncanonical_value');
}

export function financialFactAcceptanceHash(value: CandidateFinancialFactAcceptance) {
  return createHash('sha256').update(canonicalFinancialManifest(value), 'utf8').digest('hex');
}

/** Validate diagnostic manifests too: incomplete manifests may be retained for
 * audit but cannot authorize even one fact. Never discard errors to fit a cap. */
export function isFinancialFactAcceptanceShape(value: unknown): value is CandidateFinancialFactAcceptance {
  if (!object(value) || value.policyVersion !== 'arelle-fact-scope-v1'
    || !sha256(value.documentSha256) || !sha256(value.taxonomySha256)
    || (value.extractedInstanceSha256 !== null && !sha256(value.extractedInstanceSha256))
    || !['sourceValidationCompleted', 'extractedValidationCompleted', 'manifestComplete', 'documentFatal']
      .every((key) => typeof value[key] === 'boolean')
    || !Array.isArray(value.errors) || value.errors.length > MAX_FINANCIAL_VALIDATION_ERRORS
    || !Array.isArray(value.rejections) || value.rejections.length > 20_000) return false;
  if (!value.errors.every((error) => object(error) && ['source', 'extracted'].includes(String(error.phase))
    && bounded(error.code, 256) && typeof error.fatal === 'boolean' && Array.isArray(error.refs) && error.refs.length <= 4096
    && error.refs.every((ref) => object(ref) && bounded(ref.href, 2048)
      && (ref.objectId === undefined || bounded(ref.objectId, 256))
      && (ref.sourceLine === undefined || (Number.isSafeInteger(ref.sourceLine) && Number(ref.sourceLine) >= 1))
      && (ref.xpath === undefined || (bounded(ref.xpath, 4096) && bounded(ref.objectId, 256))))
    // A location without a resolved node cannot establish a scoped rejection.
    && (error.fatal || (SCOPED_ERROR_CODES.has(String(error.code))
      && error.refs.some((ref: unknown) => object(ref) && bounded(ref.objectId, 256)))))) return false;
  const errors = value.errors as CandidateFinancialFactAcceptance['errors'];
  if (value.documentFatal !== errors.some((error) => error.fatal)) return false;
  const rejectionKeys = new Set<string>();
  return value.rejections.every((row) => {
    if (!object(row) || !sha256(row.factKey) || rejectionKeys.has(row.factKey)
      || !Array.isArray(row.errorIndexes) || row.errorIndexes.length === 0 || row.errorIndexes.length > errors.length
      || !row.errorIndexes.every((index) => Number.isSafeInteger(index) && index >= 0 && index < errors.length)
      || new Set(row.errorIndexes).size !== row.errorIndexes.length) return false;
    rejectionKeys.add(row.factKey); return true;
  });
}

/** Shared fail-closed predicate for parsing, semantic mapping and low-level
 * filtering. Structural admission never substitutes for accounting validation. */
export function candidateFinancialStructuralAdmission(parse: CandidateFinancialLocalParserResult): boolean {
  const report = parse.validation;
  const facts = parse.validatedFacts;
  if (parse.parser !== 'arelle' || parse.runtimeVersion !== '2.44.7' || !sha256(parse.inputSha256)
    || !sha256(parse.taxonomySha256) || !report || !Array.isArray(facts) || facts.length > 200
    || report.validFactCount !== facts.length || report.errorsTruncated
    || !Number.isSafeInteger(report.errorCount) || report.errorCount < 0
    || !Array.isArray(report.errorCodes)) return false;
  if (parse.schema === 'candidate-financial-document-parser-v1') {
    return parse.status === 'complete' && parse.missingRequirements.length === 0
      && report.errorCount === 0 && report.errorCodes.length === 0
      && parse.factAcceptance === undefined && parse.errorManifestSha256 === undefined;
  }
  const manifest = parse.factAcceptance;
  let manifestHash: string;
  try { manifestHash = manifest ? financialFactAcceptanceHash(manifest) : ''; } catch { return false; }
  if (parse.schema !== 'candidate-financial-document-parser-v2' || !isFinancialFactAcceptanceShape(manifest)
    || !sha256(parse.errorManifestSha256) || manifestHash !== parse.errorManifestSha256
    || manifest.documentSha256 !== parse.inputSha256 || manifest.taxonomySha256 !== parse.taxonomySha256
    || !manifest.manifestComplete || !manifest.sourceValidationCompleted
    || manifest.extractedValidationCompleted !== (manifest.extractedInstanceSha256 !== null)
    || manifest.documentFatal || report.errorCount !== manifest.errors.length
    || (report.errorCount > 0 ? parse.status !== 'partial' : parse.status !== 'complete')
    || (parse.status === 'complete' && parse.missingRequirements.length !== 0)) return false;
  try { if (Buffer.byteLength(JSON.stringify(parse), 'utf8') > MAX_FINANCIAL_PARSER_EVIDENCE_BYTES) return false; }
  catch { return false; }
  const rejectedKeys = new Set(manifest.rejections.map((row) => row.factKey));
  const seen = new Set<string>();
  return facts.every((fact) => {
    if (!sha256(fact.factKey) || seen.has(fact.factKey) || rejectedKeys.has(fact.factKey)
      || fact.xValid !== 'VALID' || fact.structuralStatus !== 'structurally_validated'
      || !bounded(fact.sourceFactId, 256) || !bounded(fact.extractedFactId, 256)
      || !/^source:\d+$/u.test(fact.sourceFactId)
      || (manifest.extractedInstanceSha256 === null ? fact.extractedFactId !== fact.sourceFactId
        : !/^extracted:\d+$/u.test(fact.extractedFactId))
      || !bounded(fact.concept_namespace, 512) || !/^[A-Za-z][A-Za-z0-9+.-]*:/u.test(fact.concept_namespace)
      || fact.dimension_count !== 0) return false;
    seen.add(fact.factKey); return true;
  });
}
