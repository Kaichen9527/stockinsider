import { createHash } from 'node:crypto';
import type { ReportedFinancialFact } from '../web/src/lib/forward-earnings-bridge.ts';

export type AuoHistoricalPbRow = {
  date: string;
  pb: number;
  close: number;
  bookValuePerShare: number;
  bookValuePeriodEnd: string;
  bookValueAvailableAt: string;
  bookValueSourceRef: string;
  sourceUrl: string;
};

export type AuoAdmittedLedgerFact = ReportedFinancialFact & {
  provider: 'mops';
  authorityTier: 'official_filing';
  validationStatus: 'validated';
  schemaValid: true;
  unitValid: true;
  pointInTimeValid: true;
  consistencyValid: true;
  recordedAt: string;
  receipt: {
    receiptId: string;
    validationReceiptId: string;
    documentSha256: string;
    inputHash: string;
    factSha256: string;
    sourceUrl: string;
    recordedAt: string;
  };
};

function officialFinancialSource(value: unknown) {
  try {
    const host = new URL(String(value || '')).hostname.toLowerCase();
    return host === 'mopsov.twse.com.tw' || host === 'mops.twse.com.tw';
  } catch { return false; }
}

const uuid = (value: unknown) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
  .test(String(value || ''));

export function auoLedgerFactHash(fact: ReportedFinancialFact) {
  return createHash('sha256').update(JSON.stringify({
    factId: fact.factId,
    factKey: fact.factKey,
    periodStart: fact.periodStart,
    periodEnd: fact.periodEnd,
    durationKind: fact.durationKind ?? null,
    value: fact.value,
    unit: fact.unit,
    sourceRef: fact.sourceRef,
    filingRestatementId: fact.filingRestatementId ?? null,
    filingPublishedAt: fact.filingPublishedAt ?? null,
    provider: fact.provider ?? null,
    authorityTier: fact.authorityTier ?? null,
  }), 'utf8').digest('hex');
}

export function validateAuoLedgerFacts(value: unknown, cutoff: string): AuoAdmittedLedgerFact[] {
  const cutoffMs = Date.parse(cutoff);
  if (!Array.isArray(value) || value.length !== 32 || !Number.isFinite(cutoffMs)) {
    throw new Error('auo_canary_fact_receipts_incomplete');
  }
  const seen = new Set<string>();
  return value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('auo_canary_fact_receipt_invalid');
    const fact = item as AuoAdmittedLedgerFact;
    const receipt = fact.receipt;
    const publishedMs = Date.parse(String(fact.filingPublishedAt || ''));
    const recordedMs = Date.parse(String(fact.recordedAt || ''));
    const receiptMs = Date.parse(String(receipt?.recordedAt || ''));
    if (!uuid(fact.factId) || seen.has(fact.factId)
      || fact.provider !== 'mops' || fact.authorityTier !== 'official_filing'
      || fact.validationStatus !== 'validated' || fact.schemaValid !== true || fact.unitValid !== true
      || fact.pointInTimeValid !== true || fact.consistencyValid !== true
      || !receipt || !uuid(receipt.receiptId) || !uuid(receipt.validationReceiptId)
      || !/^[0-9a-f]{64}$/u.test(receipt.documentSha256) || !/^[0-9a-f]{64}$/u.test(receipt.inputHash)
      || receipt.factSha256 !== auoLedgerFactHash(fact) || !officialFinancialSource(receipt.sourceUrl)
      || fact.sourceRef !== receipt.sourceUrl || !Number.isFinite(publishedMs) || !Number.isFinite(recordedMs)
      || !Number.isFinite(receiptMs) || publishedMs > cutoffMs || recordedMs > cutoffMs || receiptMs > cutoffMs) {
      throw new Error(`auo_canary_fact_receipt_invalid:${String(fact.factId || 'unknown')}`);
    }
    seen.add(fact.factId);
    return fact;
  });
}

function canonicalDate(value: unknown) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function officialPbSource(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' && url.hostname === 'www.twse.com.tw'
      && /^\/rwd\/(?:zh|en)\/afterTrading\/BWIBBU(?:_d)?$/u.test(url.pathname);
  } catch {
    return false;
  }
}

export function validateAuoHistoricalPbRows(value: unknown): AuoHistoricalPbRow[] {
  if (!Array.isArray(value) || value.length < 48) throw new Error('auo_historical_pb_evidence_incomplete');
  const rows = value.map((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error('auo_historical_pb_row_invalid');
    const row = item as Record<string, unknown>;
    const date = String(row.date || '');
    const pb = Number(row.pb);
    const close = Number(row.close);
    const bookValuePerShare = Number(row.bookValuePerShare);
    const bookValuePeriodEnd = String(row.bookValuePeriodEnd || '');
    const bookValueAvailableAt = String(row.bookValueAvailableAt || '');
    const sourceUrl = String(row.sourceUrl || '');
    const bookValueSourceRef = String(row.bookValueSourceRef || '');
    if (!canonicalDate(date) || !canonicalDate(bookValuePeriodEnd) || !canonicalDate(bookValueAvailableAt)
      || !(pb > 0) || !(close > 0) || !(bookValuePerShare > 0)
      || bookValuePeriodEnd > bookValueAvailableAt || bookValueAvailableAt > date
      || !officialPbSource(sourceUrl) || bookValueSourceRef.length < 8
      || Math.abs(close / bookValuePerShare - pb) > Math.max(0.02, pb * 0.02)) {
      throw new Error(`auo_historical_pb_row_invalid:${date || 'unknown'}`);
    }
    return { date, pb, close, bookValuePerShare, bookValuePeriodEnd,
      bookValueAvailableAt, sourceUrl, bookValueSourceRef };
  }).sort((left, right) => left.date.localeCompare(right.date));
  const months = rows.map((row) => row.date.slice(0, 7));
  if (new Set(months).size !== rows.length) throw new Error('auo_historical_pb_month_duplicate');
  return rows;
}
