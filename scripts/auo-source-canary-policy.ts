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
