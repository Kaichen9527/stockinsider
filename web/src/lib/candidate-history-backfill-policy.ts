import { isHistoryDate } from './candidate-price-history.ts';

export const CANDIDATE_HISTORY_POLICY_VERSION = 'candidate-history-month-v1';
export type HistoryDataset = 'price' | 'multiple';
export type HistoryMonthCheckpoint = {
  stock_id: string; dataset: HistoryDataset; month: string; status: 'complete' | 'retry' | 'conflict';
  attempted_at: string; next_attempt_at: string | null; attempts: number;
  observed_through: string | null; observed_sessions: string[]; terminal_reason: string;
};
export type CandidateHistoryInput = {
  stockId: string; symbol: string; exchange: 'TWSE' | 'TPEx';
  knownPriceSessions: string[]; knownMultipleSessions: string[];
  /** Never infer listing age from the first downloaded row or a 404. */
  listing?: { date: string; sourceUrl: string };
};
export type CandidateHistoryMonthJob = {
  stockId: string; symbol: string; exchange: 'TWSE' | 'TPEx'; dataset: HistoryDataset;
  month: string; lastSession: string | null; expectedSessions: string[];
  previous: HistoryMonthCheckpoint | null;
};

function validListing(input: CandidateHistoryInput) {
  if (!input.listing) return null;
  if (!isHistoryDate(input.listing.date)) throw new Error('candidate_listing_date_invalid');
  const url = new URL(input.listing.sourceUrl);
  if (url.protocol !== 'https:' || !/^(?:[a-z0-9-]+\.)*(?:twse\.com\.tw|tpex\.org\.tw)$/u.test(url.hostname)) {
    throw new Error('candidate_listing_provenance_invalid');
  }
  return input.listing.date;
}

export function candidateHistoryMonths(latestSession: string, count: number) {
  if (!isHistoryDate(latestSession) || !Number.isInteger(count) || count < 1 || count > 120) throw new Error('candidate_history_window_invalid');
  const anchor = new Date(`${latestSession.slice(0, 7)}-01T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const value = new Date(anchor);
    value.setUTCMonth(value.getUTCMonth() - index);
    return value.toISOString().slice(0, 10);
  });
}

export function candidateHistoryCoverage(input: CandidateHistoryInput, officialSessions: string[], latestSession: string) {
  const listingDate = validListing(input);
  const sessions = [...new Set(officialSessions.filter((date) => isHistoryDate(date) && date <= latestSession))].sort();
  const target = sessions.slice(-1320).filter((date) => !listingDate || date >= listingDate);
  const known = new Set(input.knownPriceSessions.filter((date) => isHistoryDate(date) && date <= latestSession));
  const missingSessions = target.filter((date) => !known.has(date));
  const listingLimited = Boolean(listingDate && sessions.length >= 1320 && listingDate > sessions.at(-1320)!);
  return {
    requestedSessions: 1320, calendarSessions: sessions.length, expectedSessions: target.length,
    coveredSessions: target.filter((date) => known.has(date)).length, missingSessions,
    listingDate, listingLimited,
    terminalReason: sessions.length < 1320 ? 'official_calendar_history_incomplete'
      : missingSessions.length ? 'price_sessions_pending'
        : listingLimited ? 'listing_limited_history_complete' : 'complete',
  };
}

/** Pure, stable plan: daily refresh and deep acquisition have separate budgets. */
export function planCandidateHistoryBackfill(options: {
  candidates: CandidateHistoryInput[]; officialSessions: string[]; latestSession: string;
  evaluationAt: string; checkpoints: HistoryMonthCheckpoint[]; requestBudget?: number; perStockBudget?: number;
}) {
  const budget = options.requestBudget ?? 80;
  const perStock = options.perStockBudget ?? 4;
  if (!Number.isInteger(budget) || budget < 0 || budget > 400 || !Number.isInteger(perStock) || perStock < 1 || perStock > 12
    || !Number.isFinite(Date.parse(options.evaluationAt)) || !isHistoryDate(options.latestSession)) throw new Error('candidate_history_budget_invalid');
  const sessions = [...new Set(options.officialSessions.filter((date) => isHistoryDate(date) && date <= options.latestSession))].sort();
  const byMonth = new Map<string, string[]>();
  for (const session of sessions) {
    const month = `${session.slice(0, 7)}-01`;
    byMonth.set(month, [...(byMonth.get(month) || []), session]);
  }
  const checkpointByKey = new Map(options.checkpoints.map((row) => [`${row.stock_id}:${row.dataset}:${row.month}`, row]));
  const uniqueStockIds = new Set(options.candidates.map((candidate) => candidate.stockId));
  if (uniqueStockIds.size !== options.candidates.length) throw new Error('candidate_history_duplicate_stock');
  const queues = options.candidates.map((candidate) => {
    if (!/^\d{4,6}$/u.test(candidate.symbol)) throw new Error('candidate_history_symbol_invalid');
    const listingDate = validListing(candidate);
    const price = new Set(candidate.knownPriceSessions.filter(isHistoryDate));
    const multiple = new Set(candidate.knownMultipleSessions.filter(isHistoryDate));
    const coverage = candidateHistoryCoverage(candidate, sessions, options.latestSession);
    const earliestRequired = sessions.length >= 1320 ? sessions.at(-1320)!.slice(0, 7) : null;
    const prices: CandidateHistoryMonthJob[] = [];
    const multiples: CandidateHistoryMonthJob[] = [];
    for (const dataset of ['price', 'multiple'] as const) {
      // The wider price horizon accommodates 1,320 *trading* days, not 1,320
      // calendar days. No calendar dates are fabricated as trading sessions.
      const months = candidateHistoryMonths(options.latestSession, dataset === 'price' ? 76 : 60);
      for (const month of months) {
        if (listingDate && month.slice(0, 7) < listingDate.slice(0, 7)) continue;
        if (dataset === 'price' && earliestRequired && month.slice(0, 7) < earliestRequired) continue;
        const expected = (byMonth.get(month) || []).filter((date) => !listingDate || date >= listingDate);
        const lastSession = expected.at(-1) || null;
        if (dataset === 'multiple' && !lastSession) continue; // Official close-session authority is required for panels.
        const previous = checkpointByKey.get(`${candidate.stockId}:${dataset}:${month}`) || null;
        if (previous?.status === 'conflict') continue;
        if (previous?.next_attempt_at && previous.next_attempt_at > options.evaluationAt) continue;
        if (dataset === 'price') {
          if (coverage.terminalReason === 'complete' || coverage.terminalReason === 'listing_limited_history_complete') continue;
          if (expected.length > 0 && expected.every((date) => price.has(date))) continue;
          // Complete monthly responses may honestly omit suspended sessions.
          // Reuse only after the rows were persisted and the month has not grown.
          if (previous?.status === 'complete' && previous.observed_sessions.length > 0
            && previous.observed_sessions.every((date) => price.has(date))
            && (!lastSession || (previous.observed_through != null && previous.observed_through >= lastSession))) continue;
        } else if (lastSession && multiple.has(lastSession)) continue;
        (dataset === 'price' ? prices : multiples).push({ stockId: candidate.stockId, symbol: candidate.symbol,
          exchange: candidate.exchange, dataset, month, lastSession, expectedSessions: expected, previous });
      }
    }
    // Repair technical data first, while still making valuation progress for
    // each issuer. Round-robin below prevents the first large issuer starving
    // all later issuers under a global request bound.
    const jobs: CandidateHistoryMonthJob[] = [];
    while (prices.length || multiples.length) {
      if (prices.length) jobs.push(prices.shift()!);
      if (multiples.length) jobs.push(multiples.shift()!);
    }
    const latestAttempt = options.checkpoints.filter((row) => row.stock_id === candidate.stockId)
      .map((row) => row.attempted_at).sort().at(-1) || '';
    return { stockId: candidate.stockId, jobs, latestAttempt };
  }).sort((a, b) => a.latestAttempt.localeCompare(b.latestAttempt) || a.stockId.localeCompare(b.stockId));
  const planned: CandidateHistoryMonthJob[] = [];
  for (let round = 0; round < perStock && planned.length < budget; round += 1) {
    for (const queue of queues) {
      if (planned.length >= budget) break;
      const job = queue.jobs[round];
      if (job) planned.push(job);
    }
  }
  return planned;
}

export function historyRetryAt(attemptedAt: string, attempts: number, terminalReason: string) {
  const empty = terminalReason === 'official_no_rows' || terminalReason === 'official_session_rows_missing';
  const hours = Math.min(empty ? 168 : 24, (empty ? 24 : 1) * 2 ** Math.min(8, Math.max(0, attempts - 1)));
  return new Date(Date.parse(attemptedAt) + hours * 3_600_000).toISOString();
}
