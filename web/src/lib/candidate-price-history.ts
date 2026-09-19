export type MonthlyCandidatePrice = {
  date: string; month: string; frequency: 'monthly'; close: number;
};

export type DailyCandidatePrice = {
  date: string; frequency: 'daily'; close: number;
  ma5: number | null; ma20: number | null; ma60: number | null; ma120: number | null; ma240: number | null;
};

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
export function dailyCandidatePrices(bars: readonly { time: string; close: number }[]): DailyCandidatePrice[] {
  const byDate = new Map<string, number>();
  for (const bar of bars) {
    if (!isHistoryDate(bar.time) || !Number.isFinite(bar.close) || bar.close <= 0) continue;
    const previous = byDate.get(bar.time);
    if (previous != null && previous !== bar.close) throw new Error('candidate_history_conflicting_session');
    byDate.set(bar.time, bar.close);
  }
  const rows = [...byDate.entries()].sort(([left], [right]) => left.localeCompare(right));
  return rows.slice(-260).map(([date, close], visibleIndex) => {
    const sourceIndex = Math.max(0, rows.length - 260) + visibleIndex;
    const average = (window: 5 | 20 | 60 | 120 | 240) => sourceIndex + 1 < window ? null
      : Math.round(rows.slice(sourceIndex + 1 - window, sourceIndex + 1).reduce((sum, [, value]) => sum + value, 0) / window * 10000) / 10000;
    return { date, frequency: 'daily' as const, close, ma5: average(5), ma20: average(20), ma60: average(60), ma120: average(120), ma240: average(240) };
  });
}
