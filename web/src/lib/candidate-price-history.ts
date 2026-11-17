export type MonthlyCandidatePrice = {
  date: string; month: string; frequency: 'monthly'; close: number;
};

export type DailyCandidatePrice = {
  date: string; frequency: 'daily'; close: number;
  ma5: number | null; ma20: number | null; ma60: number | null; ma120: number | null; ma240: number | null;
};

export type CandidatePriceHistoryCoverage = {
  status: 'supplied_sessions_covered' | 'incomplete';
  displayFrom: string; displayThrough: string; observedFrom: string | null; observedThrough: string | null;
  calendarCoverage: 'supplied_sessions_only' | 'insufficient'; calendarCompleteness: 'unknown';
  expectedSessions: number; coveredSessions: number; missingSessions: string[];
  requiredWarmupSessions: 239; coveredWarmupSessions: number; warmupShortfallSessions: number; missingWarmupSessions: string[];
  listingStatus: 'unknown'; suspensionStatus: 'unknown'; missingSessionCause: 'unresolved_listing_suspension_or_missing_data' | null;
};

/** A calendar anniversary, clamped to February's last day in non-leap years. */
export function candidatePriceDisplayFrom(latestSession: string) {
  if (!isHistoryDate(latestSession)) throw new Error('candidate_history_window_invalid');
  const year = Number(latestSession.slice(0, 4)) - 3;
  const month = Number(latestSession.slice(5, 7));
  const day = Math.min(Number(latestSession.slice(8)), new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Price provenance is not a PE/PB endpoint. Parse the URL rather than
 * searching for an official hostname inside an untrusted URL string. */
export function isOfficialCandidatePriceSource(value: unknown) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return false;
    if (['www.twse.com.tw','twse.com.tw','openapi.twse.com.tw'].includes(url.hostname)) {
      return /^(?:\/v1)?\/(?:exchangeReport|rwd\/zh\/afterTrading)\/(?:STOCK_DAY(?:_ALL)?|MI_INDEX)$/u.test(url.pathname);
    }
    if (['www.tpex.org.tw','tpex.org.tw','openapi.tpex.org.tw'].includes(url.hostname)) {
      return ['/www/zh-tw/afterTrading/tradingStock','/web/stock/aftertrading/daily_trading_info/st43_result.php'].includes(url.pathname);
    }
    return false;
  } catch { return false; }
}

export function isOfficialCandidatePriceProvider(value: unknown) {
  return value === 'twse' || value === 'tpex';
}

export function isHistoryDate(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

/** Last observed official session in each month, never a synthetic calendar end. */
export function monthlyCandidatePrices(bars: readonly { time: string; close: number }[]): MonthlyCandidatePrice[] {
  const months = new Map<string, MonthlyCandidatePrice>();
  for (const bar of bars) {
    if (!isHistoryDate(bar.time) || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const month = bar.time.slice(0, 7);
    const previous = months.get(month);
    if (!previous || previous.date < bar.time) {
      months.set(month, { date: bar.time, month, frequency: 'monthly', close: bar.close });
    } else if (previous.date === bar.time && previous.close !== bar.close) {
      throw new Error('candidate_history_conflicting_session');
    }
  }
  return [...months.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-60);
}

/** Official daily sessions with rolling simple moving averages. Missing
 * sessions are not interpolated and an MA stays null until its full window is
 * present. */
export function dailyCandidatePrices(bars: readonly { time: string; close: number }[], options?: {
  latestSession: string; officialSessions: readonly string[]; verifiedSessions?: readonly string[];
}): DailyCandidatePrice[] {
  if (bars.length > 10000 || (options?.officialSessions.length || 0) > 10000) throw new Error('candidate_history_window_invalid');
  const byDate = new Map<string, number>();
  for (const bar of bars) {
    if (!isHistoryDate(bar.time) || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const previous = byDate.get(bar.time);
    if (previous != null && previous !== bar.close) throw new Error('candidate_history_conflicting_session');
    byDate.set(bar.time, bar.close);
  }
  const latestSession = options?.latestSession || [...byDate.keys()].sort().at(-1);
  if (!latestSession) return [];
  const displayFrom = candidatePriceDisplayFrom(latestSession);
  // The existing acquisition target stays 1,320. Keep its older observations
  // for MA240 warmup, then select by calendar date rather than a row count.
  const rows = [...byDate.entries()].filter(([date]) => date <= latestSession).sort(([left], [right]) => left.localeCompare(right)).slice(-1320);
  const calendar = options ? [...new Set(options.officialSessions.filter((date) => isHistoryDate(date) && date <= latestSession))].sort() : null;
  const calendarIndex = new Map(calendar?.map((date, index) => [date, index]) || []);
  const verified = options?.verifiedSessions ? new Set(options.verifiedSessions) : null;
  return rows.flatMap(([date, close], sourceIndex) => {
    if (date < displayFrom) return [];
    const average = (window: 5 | 20 | 60 | 120 | 240) => {
      const dates = calendar ? calendar.slice(Math.max(0, (calendarIndex.get(date) ?? -1) + 1 - window), (calendarIndex.get(date) ?? -1) + 1) : null;
      if (calendar && (!calendarIndex.has(date) || dates!.length !== window
        || dates!.some((session) => !byDate.has(session) || (verified && !verified.has(session))))) return null;
      if (sourceIndex + 1 < window) return null;
      return Math.round((dates ? dates.reduce((sum, session) => sum + byDate.get(session)!, 0)
        : rows.slice(sourceIndex + 1 - window, sourceIndex + 1).reduce((sum, [, value]) => sum + value, 0)) / window * 10000) / 10000;
    };
    return { date, frequency: 'daily' as const, close, ma5: average(5), ma20: average(20), ma60: average(60), ma120: average(120), ma240: average(240) };
  });
}

/** Coverage is checked against the supplied official session ledger and
 * verified prices, never inferred from 1,320 rows or the first downloaded row.
 * No listing or suspension authority is available in this projection. */
export function candidateDisplayPriceHistory(options: {
  bars: readonly { time: string; close: number }[]; verifiedSessions: readonly string[];
  officialSessions: readonly string[]; latestSession: string;
}): { dailyPrices: DailyCandidatePrice[]; coverage: CandidatePriceHistoryCoverage } {
  if (options.verifiedSessions.length > 10000) throw new Error('candidate_history_window_invalid');
  const displayFrom = candidatePriceDisplayFrom(options.latestSession);
  const dailyPrices = dailyCandidatePrices(options.bars, options);
  const calendar = [...new Set(options.officialSessions.filter((date) => isHistoryDate(date) && date <= options.latestSession))].sort();
  const expected = calendar.filter((date) => date >= displayFrom);
  const warmup = calendar.filter((date) => date < displayFrom).slice(-239);
  const observed = new Set(dailyPrices.map((row) => row.date));
  const validPriceDates = new Set([...new Set(options.bars.filter((row) => isHistoryDate(row.time) && row.time <= options.latestSession
    && Number.isFinite(row.close) && row.close > 0).map((row) => row.time))].sort().slice(-1320));
  const verified = new Set(options.verifiedSessions.filter((date) => validPriceDates.has(date)));
  const missingSessions = expected.filter((date) => !observed.has(date) || !verified.has(date));
  const missingWarmupSessions = warmup.filter((date) => !verified.has(date));
  const calendarSpansWindow = calendar.at(-1) === options.latestSession && warmup.length === 239;
  const suppliedSessionsCovered = calendarSpansWindow && missingSessions.length === 0 && missingWarmupSessions.length === 0;
  return { dailyPrices, coverage: {
    status: suppliedSessionsCovered ? 'supplied_sessions_covered' : 'incomplete', displayFrom, displayThrough: options.latestSession,
    observedFrom: dailyPrices[0]?.date || null, observedThrough: dailyPrices.at(-1)?.date || null,
    calendarCoverage: calendarSpansWindow ? 'supplied_sessions_only' : 'insufficient', calendarCompleteness: 'unknown', expectedSessions: expected.length,
    coveredSessions: expected.length - missingSessions.length, missingSessions,
    requiredWarmupSessions: 239, coveredWarmupSessions: warmup.length - missingWarmupSessions.length,
    warmupShortfallSessions: 239 - warmup.length + missingWarmupSessions.length, missingWarmupSessions,
    listingStatus: 'unknown', suspensionStatus: 'unknown', missingSessionCause: suppliedSessionsCovered ? null : 'unresolved_listing_suspension_or_missing_data',
  } };
}
