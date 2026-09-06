/**
 * Candidate technical research needs a point-in-time, 520-session official
 * price history. A deployment can explicitly disable that work when its
 * network cannot obtain the historical official response. This is a
 * fail-closed operational switch: source-hit cards continue to publish, but
 * no stock is reclassified from incomplete price data.
 */
export function isCandidateHistoricalPriceAccessEnabled(value = process.env.CANDIDATE_HISTORICAL_PRICE_ACCESS_ENABLED) {
  return value !== 'false';
}

export function candidatePriceRefreshDepth(knownSessions: string[], latestMarketSession: string) {
  const unique = [...new Set(knownSessions.filter((session) => /^\d{4}-\d{2}-\d{2}$/u.test(session)))].sort();
  if (unique.length < 240) return 1320;
  return unique.at(-1) === latestMarketSession ? 0 : 5;
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
  fact: { filing_published_at?: unknown; source_timestamp?: unknown; collected_at?: unknown; recorded_at?: unknown },
  evaluationAt: string,
) {
  const cutoff = Date.parse(evaluationAt);
  if (!Number.isFinite(cutoff)) return false;
  return [fact.filing_published_at, fact.source_timestamp, fact.collected_at, fact.recorded_at]
    .every((value) => typeof value === 'string' && Number.isFinite(Date.parse(value)) && Date.parse(value) <= cutoff);
}

export async function collectPagedAuthorityRows<T>(
  readPage: (from: number, to: number) => Promise<T[]>,
  options: { pageSize?: number; maxRows: number },
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
  return rows;
}

export async function collectBatchedAuthorityRows<TInput, TRow>(
  inputs: TInput[],
  readPage: (batch: TInput[], from: number, to: number) => Promise<TRow[]>,
  options: { batchSize?: number; pageSize?: number; maxRowsPerBatch: number },
): Promise<TRow[]> {
  const batchSize = options.batchSize || 20;
  if (!Number.isInteger(batchSize) || batchSize <= 0) throw new Error('invalid_authority_batch_size');
  const rows: TRow[] = [];
  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const batch = inputs.slice(offset, offset + batchSize);
    rows.push(...await collectPagedAuthorityRows(
      (from, to) => readPage(batch, from, to),
      { pageSize: options.pageSize, maxRows: options.maxRowsPerBatch },
    ));
  }
  return rows;
}
