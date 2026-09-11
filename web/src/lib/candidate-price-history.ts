export type MonthlyCandidatePrice = {
  date: string; month: string; frequency: 'monthly'; close: number;
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
