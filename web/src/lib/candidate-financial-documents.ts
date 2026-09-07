import { createHash } from 'node:crypto';
import { parseCandidateMopsFacts, type CandidateOfficialFinancial, type ParsedFact } from './candidate-official-financials.ts';

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
    && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
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
  if (/<!entity|\b(?:system|public)\s+["']/iu.test(head)
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
  if (!text || /<!entity|\b(?:system|public)\s+["']/iu.test(text.slice(0, 16_384))) return [];
  const parsed = parseCandidateMopsFacts(text, {
    ...input.candidate,
    sourceUrl: input.sourceUrl,
    collectedAt: input.collectedAt,
    sourceRefPrefix: `issuer-document:${input.documentSha256}`,
  });
  return parsed.filter((fact) => fact.periodEnd === input.periodEnd);
}
