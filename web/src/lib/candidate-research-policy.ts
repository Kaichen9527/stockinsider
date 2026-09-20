/**
 * Candidate research needs point-in-time technical and five-year official
 * price history. A deployment can explicitly disable that work when its
 * network cannot obtain the historical official response. This is a
 * fail-closed operational switch: source-hit cards continue to publish, but
 * no stock is reclassified from incomplete price data.
 */
export function isCandidateHistoricalPriceAccessEnabled(value = process.env.CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED) {
  return value !== 'false';
}

export function candidatePriceRefreshDepth(knownSessions: string[], latestMarketSession: string) {
  const unique = [...new Set(knownSessions.filter((session) => /^\d{4}-\d{2}-\d{2}$/u.test(session) && session <= latestMarketSession))].sort();
  if (unique.length < 1320) return 1320;
  return unique.at(-1) === latestMarketSession ? 0 : 5;
}

/** Deep history is handled by the durable monthly backfill queue, not by a
 * repeated 1,320-request catch-up on the critical daily research path. */
export function candidateDailyPriceRefreshDepth(knownSessions: string[], latestMarketSession: string) {
  return knownSessions.includes(latestMarketSession) ? 0 : 5;
}

/** Valuation distributions are monthly samples. When several daily snapshots
 * exist in a month, retain only that month's latest observation so one volatile
 * month cannot receive accidental extra weight. */
export function latestMonthlyPositiveValues(rows: Array<{ date: string; value: number | null }>) {
  const monthly = new Map<string, { date: string; value: number }>();
  for (const row of rows) {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(row.date) || row.value == null || !(row.value > 0)) continue;
    const month = row.date.slice(0, 7);
    const prior = monthly.get(month);
    if (!prior || row.date > prior.date) monthly.set(month, { date: row.date, value: row.value });
  }
  return [...monthly.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export type PointInTimePbObservation = {
  date: string;
  pbRatio: number;
  close: number;
  bookValuePerShare: number;
  bookValuePeriodEnd: string;
  bookValueAvailableAt: string;
  sourceUrl: string;
};

/**
 * A historical P/B observation is usable only when its official exchange
 * numerator and the disclosed denominator period were both knowable then.
 * This prevents a later book value from leaking into an earlier valuation.
 */
export function pointInTimeMonthlyPbObservations(
  points: Array<{
    date: string; pbRatio: number | null; sourceUrl: string;
    authorityTier: string; bookValuePeriodEnd?: string | null; bookValueAvailableAt?: string | null;
  }>,
  bars: Array<{ time: string; close: number; authorityTier: string; integrityStatus?: string }>,
  cutoff: string,
): PointInTimePbObservation[] {
  const cutoffDate = cutoff.slice(0, 10);
  const officialClose = new Map(bars
    .filter((bar) => /^\d{4}-\d{2}-\d{2}$/u.test(bar.time) && bar.time <= cutoffDate
      && bar.authorityTier === 'official_primary' && bar.integrityStatus !== 'conflict'
      && Number.isFinite(bar.close) && bar.close > 0)
    .map((bar) => [bar.time, bar.close]));
  const monthly = new Map<string, PointInTimePbObservation>();
  for (const point of points) {
    const close = officialClose.get(point.date);
    const periodEnd = String(point.bookValuePeriodEnd || '');
    const availableAt = String(point.bookValueAvailableAt || '');
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(point.date) || point.date > cutoffDate
      || point.authorityTier !== 'official_primary'
      || !/https:\/\/www\.(?:twse\.com\.tw|tpex\.org\.tw)\//u.test(point.sourceUrl)
      || point.pbRatio == null || !Number.isFinite(point.pbRatio) || point.pbRatio <= 0
      || close == null || !/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)
      || !/^\d{4}-\d{2}-\d{2}$/u.test(availableAt)
      || periodEnd > availableAt || availableAt > point.date) continue;
    const row = {
      date: point.date, pbRatio: point.pbRatio, close,
      bookValuePerShare: close / point.pbRatio,
      bookValuePeriodEnd: periodEnd, bookValueAvailableAt: availableAt, sourceUrl: point.sourceUrl,
    };
    const month = point.date.slice(0, 7);
    if (!monthly.has(month) || point.date > monthly.get(month)!.date) monthly.set(month, row);
  }
  return [...monthly.values()].sort((left, right) => left.date.localeCompare(right.date));
}

/** Validate a versioned, source-linked exchange ledger used by a single-stock pilot. */
export function pointInTimePbLedgerObservations(value: unknown, cutoff: string): PointInTimePbObservation[] {
  if (!Array.isArray(value)) return [];
  const cutoffDate = cutoff.slice(0, 10);
  const rows = value.filter((item) => item && typeof item === 'object' && !Array.isArray(item)
    && String((item as Record<string, unknown>).date || '') <= cutoffDate);
  const months = new Set<string>();
  return rows.flatMap((item) => {
    const row = item as Record<string, unknown>;
    const date = String(row.date || '');
    const pbRatio = Number(row.pb);
    const close = Number(row.close);
    const bookValuePerShare = Number(row.bookValuePerShare);
    const bookValuePeriodEnd = String(row.bookValuePeriodEnd || '');
    const bookValueAvailableAt = String(row.bookValueAvailableAt || '');
    const sourceUrl = String(row.sourceUrl || '');
    const month = date.slice(0, 7);
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(date) || !/^\d{4}-\d{2}-\d{2}$/u.test(bookValuePeriodEnd)
      || !/^\d{4}-\d{2}-\d{2}$/u.test(bookValueAvailableAt) || !(pbRatio > 0) || !(close > 0)
      || !(bookValuePerShare > 0) || bookValuePeriodEnd > bookValueAvailableAt || bookValueAvailableAt > date
      || !/^https:\/\/www\.twse\.com\.tw\/rwd\/zh\/afterTrading\/BWIBBU\?/u.test(sourceUrl)
      || String(row.bookValueSourceRef || '') !== sourceUrl
      || Math.abs(close / bookValuePerShare - pbRatio) > Math.max(0.02, pbRatio * 0.02)
      || months.has(month)) return [];
    months.add(month);
    return [{ date, pbRatio, close, bookValuePerShare, bookValuePeriodEnd, bookValueAvailableAt, sourceUrl }];
  }).sort((left, right) => left.date.localeCompare(right.date));
}

export function isTransientResearchInfrastructureError(reason: string) {
  return /(?:\b(?:429|500|502|503|504|520|522|524)\b|timeout|timed out|fetch failed|network|connection reset|econnreset|socket hang up|temporarily unavailable)/iu.test(reason);
}

export function rotatingShard<T>(items: T[], cursor: number, size: number) {
  if (!Number.isInteger(size) || size <= 0) throw new Error('invalid_rotating_shard_size');
  if (items.length === 0) return { items: [] as T[], nextCursor: 0 };
  const start = Math.max(0, Math.floor(Number.isFinite(cursor) ? cursor : 0)) % items.length;
  const rotated = [...items.slice(start), ...items.slice(0, start)];
  const selected = rotated.slice(0, size);
  return { items: selected, nextCursor: (start + selected.length) % items.length };
}

export function financialFactAvailableAt(
  fact: { filing_published_at?: unknown; source_timestamp?: unknown; collected_at?: unknown; recorded_at?: unknown; validation_recorded_at?: unknown },
  evaluationAt: string,
) {
  const cutoff = Date.parse(evaluationAt);
  if (!Number.isFinite(cutoff)) return false;
  if (fact.validation_recorded_at != null && (typeof fact.validation_recorded_at !== 'string'
    || !Number.isFinite(Date.parse(fact.validation_recorded_at)) || Date.parse(fact.validation_recorded_at) > cutoff)) return false;
  return [fact.filing_published_at, fact.source_timestamp, fact.collected_at, fact.recorded_at]
    .every((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= cutoff);
}

/**
 * Production research follows every mention available when the run starts.
 * Shadow evidence is a separate, immutable close-session cohort and therefore
 * only accepts rows that existed at its fixed source cutoff.
 */
export function partitionCandidateMentionsByCutoff<T extends { available_at?: unknown }>(
  mentions: T[],
  productionCutoff: string,
  shadowCutoff: string,
) {
  const productionCutoffMs = Date.parse(productionCutoff);
  const shadowCutoffMs = Date.parse(shadowCutoff);
  if (!Number.isFinite(productionCutoffMs) || !Number.isFinite(shadowCutoffMs)) {
    throw new Error('invalid_candidate_source_cutoff');
  }
  const production = mentions.filter((mention) => {
    const availableAtMs = Date.parse(String(mention.available_at || ''));
    return Number.isFinite(availableAtMs) && availableAtMs <= productionCutoffMs;
  });
  return {
    production,
    shadow: production.filter((mention) => Date.parse(String(mention.available_at)) <= shadowCutoffMs),
  };
}

export async function collectPagedAuthorityRows<T>(
  readPage: (from: number, to: number) => Promise<T[]>,
  options: { pageSize?: number; maxRows: number; requireComplete?: boolean },
): Promise<T[]> {
  const pageSize = options.pageSize || 1000;
  if (!Number.isInteger(pageSize) || pageSize <= 0 || !Number.isInteger(options.maxRows) || options.maxRows <= 0) {
    throw new Error('invalid_authority_pagination');
  }
  const rows: T[] = [];
  while (rows.length < options.maxRows) {
    const requestSize = Math.min(pageSize, options.maxRows - rows.length);
    const page = await readPage(rows.length, rows.length + requestSize - 1);
    rows.push(...page);
    if (page.length < requestSize) break;
  }
  if (options.requireComplete && rows.length === options.maxRows
    && (await readPage(rows.length, rows.length)).length > 0) {
    throw new Error('authority_pagination_overflow');
  }
  return rows;
}

export async function collectBatchedAuthorityRows<TInput, TRow>(
  inputs: TInput[],
  readPage: (batch: TInput[], from: number, to: number) => Promise<TRow[]>,
  options: { batchSize?: number; pageSize?: number; maxRowsPerBatch: number; requireComplete?: boolean },
): Promise<TRow[]> {
  const batchSize = options.batchSize || 20;
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('invalid_authority_batch_size');
  const rows: TRow[] = [];
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize);
    rows.push(...await collectPagedAuthorityRows(
      (from, to) => readPage(batch, from, to),
      { pageSize: options.pageSize, maxRows: options.maxRowsPerBatch, requireComplete: options.requireComplete },
    ));
  }
  return rows;
}
