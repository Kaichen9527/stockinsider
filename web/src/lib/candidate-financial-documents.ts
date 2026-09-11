import { createHash } from 'node:crypto';
import { parseCandidateMopsFacts, type CandidateOfficialFinancial, type ParsedFact } from './candidate-official-financials.ts';
import type { CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';
import { candidateFinancialStructuralAdmission } from './candidate-financial-fact-acceptance.ts';

export const CANDIDATE_FINANCIAL_DOCUMENT_BUCKET = 'candidate-financial-documents-v6';
export const MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES = 50 * 1024 * 1024;
const MAX_METADATA_BYTES = 8_192;
const OFFICIAL_DOCUMENT_HOSTS = new Set([
  'mops.twse.com.tw', 'mopsov.twse.com.tw', 'www.twse.com.tw', 'www.tpex.org.tw',
]);

export type CandidateFinancialDocumentMetadata = {
  stockId: string;
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
  periodEnd: string;
  sourceUrl: string;
  publishedAt: string | null;
  acquisitionJobId: string | null;
};

export type StoredCandidateFinancialDocument = {
  bytes: Uint8Array;
  sha256: string;
  byteLength: number;
};

export type CandidateFinancialDocumentFormat = 'pdf' | 'html' | 'xbrl';

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
}

function isDate(value: string) {
  return /^\d{4}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/u.test(value)
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function isTimestamp(value: string) {
  return Boolean(value) && Number.isFinite(Date.parse(value));
}

function isExactMetadata(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const keys = Object.keys(value).sort();
  const expected = ['acquisitionJobId', 'exchange', 'periodEnd', 'publishedAt', 'sourceUrl', 'stockId', 'symbol'];
  return keys.length === expected.length && keys.every((key, index) => key === expected[index]);
}

/** The metadata travels in a bounded JSON header, so uploads are one raw
 * document stream. We deliberately do not accept a caller supplied fact list
 * or parser manifest at this trust boundary. */
export function parseCandidateFinancialDocumentMetadata(header: string | null): CandidateFinancialDocumentMetadata | null {
  if (!header || Buffer.byteLength(header, 'utf8') > MAX_METADATA_BYTES) return null;
  let value: unknown;
  try { value = JSON.parse(header); } catch { return null; }
  if (!isExactMetadata(value)) return null;
  const item = value as Record<string, unknown>;
  const stockId = String(item.stockId || '');
  const symbol = String(item.symbol || '');
  const exchange = String(item.exchange || '');
  const periodEnd = String(item.periodEnd || '');
  const sourceUrl = String(item.sourceUrl || '');
  const publishedAt = item.publishedAt === null ? null : String(item.publishedAt || '');
  const acquisitionJobId = item.acquisitionJobId === null ? null : String(item.acquisitionJobId || '');
  if (!isUuid(stockId) || !/^\d{4,6}$/u.test(symbol) || !['TWSE', 'TPEX'].includes(exchange)
    || !isDate(periodEnd) || (publishedAt !== null && !isTimestamp(publishedAt))
    || (acquisitionJobId !== null && !isUuid(acquisitionJobId)) || !isApprovedDocumentUrl(sourceUrl)) return null;
  return { stockId, symbol, exchange: exchange as 'TWSE' | 'TPEX', periodEnd, sourceUrl, publishedAt, acquisitionJobId };
}

export function isApprovedDocumentUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && url.pathname.length > 1 && url.search.length <= 2_048 && !url.hash;
  } catch {
    return false;
  }
}

export function isOfficialDocumentHost(host: string) {
  return OFFICIAL_DOCUMENT_HOSTS.has(host.toLowerCase());
}

/** Reads an upload incrementally, cutting the connection at the documented
 * limit. Storage receives one immutable object only after magic validation;
 * this avoids persisting a partial/untrusted object. */
export async function readBoundedCandidateFinancialDocument(stream: ReadableStream<Uint8Array> | null): Promise<StoredCandidateFinancialDocument> {
  if (!stream) throw new Error('document_body_missing');
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  const hash = createHash('sha256');
  let byteLength = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      byteLength += next.value.byteLength;
      if (byteLength > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES) {
        await reader.cancel('candidate_financial_document_too_large');
        throw new Error('candidate_financial_document_too_large');
      }
      hash.update(next.value);
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteLength === 0) throw new Error('document_body_empty');
  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { bytes, sha256: hash.digest('hex'), byteLength };
}

function decodedText(bytes: Uint8Array) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { return null; }
}

/** Reject DTD/entity-bearing XML before any extraction. The parser is local
 * regex-based and never follows taxonomies, URLs, includes or redirects. */
export function validateCandidateFinancialDocument(input: { bytes: Uint8Array; contentType: string | null }): { format: CandidateFinancialDocumentFormat; normalizedContentType: string } | { error: string } {
  const contentType = String(input.contentType || '').split(';', 1)[0].trim().toLowerCase();
  const prefix = Buffer.from(input.bytes.subarray(0, 32)).toString('ascii');
  if (prefix.startsWith('%PDF-')) {
    return contentType === 'application/pdf'
      ? { format: 'pdf', normalizedContentType: 'application/pdf' }
      : { error: 'document_mime_magic_mismatch' };
  }
  const text = decodedText(input.bytes);
  if (!text) return { error: 'document_utf8_required_for_markup' };
  const head = text.slice(0, 16_384).toLowerCase();
  // HTML's `<!doctype html>` is not an XML DTD. Any other declaration or
  // external-entity syntax is rejected before the local extractor sees it.
  if (/<!entity|\b(?:system|public)\s+["']/iu.test(text)
    || (/<!doctype/iu.test(head) && !/^\s*<!doctype\s+html\s*>/iu.test(text))) return { error: 'document_external_entity_rejected' };
  const isXbrl = /<(?:[\w-]+:)?xbrl\b/iu.test(head) || /<ix:(?:header|nonfraction|nonnumeric)\b/iu.test(head);
  const isHtml = /^\s*(?:<!doctype\s+html|<html\b|<\?xml[^>]*>\s*<html\b)/iu.test(text);
  const isXml = /^\s*<\?xml|^\s*<(?:[\w-]+:)?xbrl\b/iu.test(text);
  if (isXbrl || isXml) {
    return ['application/xml', 'text/xml', 'application/xhtml+xml', 'text/html'].includes(contentType)
      ? { format: 'xbrl', normalizedContentType: contentType }
      : { error: 'document_mime_magic_mismatch' };
  }
  if (isHtml) {
    return ['text/html', 'application/xhtml+xml'].includes(contentType)
      ? { format: 'html', normalizedContentType: contentType }
      : { error: 'document_mime_magic_mismatch' };
  }
  return { error: 'document_magic_unrecognized' };
}

export function candidateFinancialDocumentObjectKey(input: { stockId: string; periodEnd: string; sha256: string }) {
  return `issuer/${input.stockId}/${input.periodEnd}/${input.sha256}`;
}

export function parseCandidateFinancialDocumentFacts(input: {
  bytes: Uint8Array;
  format: CandidateFinancialDocumentFormat;
  documentSha256: string;
  candidate: CandidateOfficialFinancial;
  periodEnd: string;
  sourceUrl: string;
  collectedAt: string;
}): ParsedFact[] {
  if (input.format === 'pdf') return [];
  const text = decodedText(input.bytes);
  if (!text || /<!entity|\b(?:system|public)\s+["']/iu.test(text)) return [];
  const parsed = parseCandidateMopsFacts(text, {
    ...input.candidate,
    sourceUrl: input.sourceUrl,
    collectedAt: input.collectedAt,
    sourceRefPrefix: `issuer-document:${input.documentSha256}`,
  });
  return parsed.filter((fact) => fact.periodEnd === input.periodEnd);
}

// This is a semantic mapping, not a second numeric extractor. Values and their
// complete reporting context come only from the pinned offline validator. In
// particular, plain XBRL is no longer required to contain ix:nonFraction or an
// unvalidated ReviewAuditDate tag to enter accounting validation.
const DOCUMENT_FLOW_KEYS: Record<string, string> = {
  revenue: 'quarterly_revenue', revenuefromcontractswithcustomers: 'quarterly_revenue',
  grossprofit: 'quarterly_gross_profit', grossprofitlossfromoperations: 'quarterly_gross_profit',
  netoperatingincomeloss: 'quarterly_operating_income', profitlossfromoperatingactivities: 'quarterly_operating_income',
  operatingexpenses: 'quarterly_operating_expense', operatingexpense: 'quarterly_operating_expense',
  nonoperatingincomeexpense: 'quarterly_non_operating_income', othernonoperatingincomeexpense: 'quarterly_non_operating_income',
  nonoperatingincomeandexpenses: 'quarterly_non_operating_income', profitlossbeforetax: 'quarterly_pretax_income',
  incometaxexpensebenefit: 'quarterly_income_tax_expense', incometaxexpensecontinuingoperations: 'quarterly_income_tax_expense',
  profitloss: 'quarterly_net_income', profitlossattributabletoownersofparent: 'quarterly_net_income_attributable_to_common',
  profitlossattributabletononcontrollinginterest: 'quarterly_noncontrolling_interest',
  profitlossattributabletononcontrollinginterests: 'quarterly_noncontrolling_interest',
  earningsbeforeinteresttaxesdepreciationandamortization: 'quarterly_ebitda', ebitda: 'quarterly_ebitda',
};
const DOCUMENT_INSTANT_KEYS: Record<string, string> = {
  assets: 'total_assets', totalassets: 'total_assets', equity: 'total_equity',
  equityattributabletoownersofparent: 'common_equity_attributable_to_owners',
  cashandcashequivalents: 'cash_and_equivalents', cashandcashequivalentsatcarryingvalue: 'cash_and_equivalents',
  totalinterestbearingdebt: 'total_debt', interestbearingdebt: 'total_debt', totalborrowings: 'total_debt',
  bookvaluepershare: 'book_value_per_share', numberofsharesoutstanding: 'common_shares_outstanding',
};
const DOCUMENT_PER_SHARE_KEYS: Record<string, string> = {
  dilutedearningspershare: 'quarterly_diluted_eps', dilutedearningslosspershare: 'quarterly_diluted_eps',
  basicearningspershare: 'quarterly_basic_eps', basicearningslosspershare: 'quarterly_basic_eps',
};
const DOCUMENT_SHARE_KEYS: Record<string, string> = {
  weightedaveragenumberofdilutedsharesoutstanding: 'diluted_weighted_average_shares',
  dilutedweightedaveragenumberofsharesoutstanding: 'diluted_weighted_average_shares',
  weightedaveragenumberofsharesoutstanding: 'basic_weighted_average_shares',
  basicweightedaveragenumberofsharesoutstanding: 'basic_weighted_average_shares',
};

export function candidateFinancialFactsFromValidatedManifest(input: {
  bytes: Uint8Array;
  documentSha256: string;
  parse: CandidateFinancialLocalParserResult;
  candidate: CandidateOfficialFinancial;
  periodEnd: string;
  sourceUrl: string;
  collectedAt: string;
}): ParsedFact[] {
  const { parse } = input;
  if (Buffer.from(input.bytes.subarray(0, 5)).toString('ascii') === '%PDF-') return [];
  if (!candidateFinancialStructuralAdmission(parse)
    || !/^[0-9a-f]{64}$/u.test(parse.taxonomySha256 || '') || parse.runtimeVersion !== '2.44.7'
    || parse.inputSha256 !== input.documentSha256
    || createHash('sha256').update(input.bytes).digest('hex') !== input.documentSha256
    || !isDate(input.periodEnd) || !/^\d{4}-(?:03-31|06-30|09-30|12-31)$/u.test(input.periodEnd)
    || !isTimestamp(input.collectedAt)
    || Date.parse(input.periodEnd) > Date.parse(input.collectedAt)
    || !isApprovedDocumentUrl(input.sourceUrl)) return [];
  // Inline extraction must have its own independently validated, hash-bound
  // instance. A source-only result cannot attest inline transformations.
  if (parse.schema === 'candidate-financial-document-parser-v2'
    && /http:\/\/www[.]xbrl[.]org\/(?:2008|2013)\/inlineXBRL/u.test(new TextDecoder().decode(input.bytes))
    && !parse.factAcceptance?.extractedInstanceSha256) return [];
  const collectedAt = new Date(input.collectedAt).toISOString();
  const locators = new Set(parse.locators.map((row) => `${row.xbrl_context}\u0000${row.xbrl_concept}`));
  const facts: ParsedFact[] = [];
  for (const row of parse.validatedFacts || []) {
    if (row.entity_identifier !== input.candidate.symbol || row.dimension_count !== 0
      || row.period_end !== input.periodEnd || !locators.has(`${row.xbrl_context}\u0000${row.xbrl_concept}`)) continue;
    const concept = row.xbrl_concept.split(':').at(-1)?.replace(/[^A-Za-z0-9]/gu, '').toLowerCase() || '';
    const factKey = DOCUMENT_FLOW_KEYS[concept] || DOCUMENT_INSTANT_KEYS[concept]
      || DOCUMENT_PER_SHARE_KEYS[concept] || DOCUMENT_SHARE_KEYS[concept];
    if (!factKey) continue;
    const instant = Boolean(DOCUMENT_INSTANT_KEYS[concept]);
    const unit: ParsedFact['unit'] = DOCUMENT_SHARE_KEYS[concept] || factKey === 'common_shares_outstanding'
      ? 'share' : DOCUMENT_PER_SHARE_KEYS[concept] || factKey === 'book_value_per_share' ? 'TWD_per_share' : 'TWD';
    const value = Number(row.value);
    if (row.unit !== unit || !Number.isFinite(value) || Math.abs(value) > Number.MAX_SAFE_INTEGER
      || (instant ? row.duration_kind !== 'instant' || row.period_start !== null
        : row.duration_kind !== 'quarterly' || !row.period_start || !isDate(row.period_start) || row.period_start > row.period_end)) continue;
    const yearStart = `${row.period_end.slice(0, 4)}-01-01`;
    const quarterStart = `${row.period_end.slice(0, 4)}-${String(Number(row.period_end.slice(5, 7)) - 2).padStart(2, '0')}-01`;
    const periodSemantics = instant ? 'instant' : row.period_start === quarterStart ? 'discrete_quarter'
      : row.period_start === yearStart ? 'year_to_date' : null;
    if (!periodSemantics) continue;
    const identity = createHash('sha256').update(JSON.stringify({ context: row.xbrl_context,
      concept: row.xbrl_concept, unit, factKey, value: row.value, start: row.period_start, end: row.period_end,
      ...(parse.schema === 'candidate-financial-document-parser-v2' ? { namespace: row.concept_namespace,
        structuralFactKey: row.factKey } : {}) })).digest('hex');
    facts.push({
      stockId: input.candidate.stockId, symbol: input.candidate.symbol, factKey,
      periodStart: row.period_start, periodEnd: row.period_end, durationKind: row.duration_kind,
      value, unit, provider: 'mops', authorityTier: 'official_filing', estimateKind: 'reported', estimateHorizon: 'reported_period',
      // Neither an audit date nor caller-supplied publishedAt establishes past
      // public availability. Collection is the conservative known timestamp.
      filingPublishedAt: collectedAt, sourceTimestamp: collectedAt, collectedAt,
      filingRestatementId: `issuer-document:${input.documentSha256}`,
      sourceRef: `issuer-document:${input.documentSha256}:${identity}`,
      locator: { xbrl_context: row.xbrl_context, xbrl_concept: row.xbrl_concept,
        period_semantics: periodSemantics,
        response_url: input.sourceUrl, semantic_mapper: parse.schema === 'candidate-financial-document-parser-v2'
          ? 'validated-document-v2' : 'validated-document-v1',
        ...(parse.schema === 'candidate-financial-document-parser-v2' ? { concept_namespace: row.concept_namespace,
          structural_fact_key: row.factKey, structural_status: row.structuralStatus,
          source_fact_id: row.sourceFactId, extracted_fact_id: row.extractedFactId } : {}) },
    });
  }
  // Keep conflicting facts visible to the accounting validator. Do not select
  // a first/last duplicate whose value happens to make a valuation possible.
  return facts;
}
