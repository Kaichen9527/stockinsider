import type { CandlestickData, Time } from 'lightweight-charts';
import { isHistoryDate } from './candidate-price-history.ts';

export type CalendarTimeframe = 'weekly' | 'monthly' | 'quarterly' | 'halfYear' | 'yearly';
export type CalendarPeriod = { periodStart: string; sourceDates: string[]; provisional: boolean | null; volume: number | null };

/** String/BusinessDay values name a TW session; timestamps use Asia/Taipei.
 * No trading calendar, split adjustment, suspension or coverage is inferred. */
export function taiwanChartDate(time: Time): string {
  if (typeof time === 'string' && isHistoryDate(time)) return time;
  if (typeof time === 'number' && Number.isFinite(time)) {
    const value = new Date(time * 1000);
    if (!Number.isFinite(value.getTime())) throw new Error('stock_chart_date_invalid');
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
  }
  if (time && typeof time === 'object') {
    const value = `${time.year}-${String(time.month).padStart(2, '0')}-${String(time.day).padStart(2, '0')}`;
    if (isHistoryDate(value)) return value;
  }
  throw new Error('stock_chart_date_invalid');
}

function periodStart(date: string, timeframe: CalendarTimeframe) {
  if (timeframe === 'weekly') {
    const value = new Date(`${date}T00:00:00Z`);
    value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
    return value.toISOString().slice(0, 10);
  }
  const month = Number(date.slice(5, 7));
  const startMonth = timeframe === 'monthly' ? month : timeframe === 'quarterly' ? Math.floor((month - 1) / 3) * 3 + 1 : timeframe === 'halfYear' ? (month <= 6 ? 1 : 7) : 1;
  return `${date.slice(0, 4)}-${String(startMonth).padStart(2, '0')}-01`;
}

/** Aggregate real supplied sessions, never fixed five/21-row chunks. The output
 * time remains the last observed session; missing volume stays null. A historical
 * period is closed in calendar time only, not certified complete acquisition. */
export function calendarStockCandles(data: readonly (CandlestickData & { volume?: number | null })[], timeframe: CalendarTimeframe, cutoff?: string) {
  if (!['weekly', 'monthly', 'quarterly', 'halfYear', 'yearly'].includes(timeframe) || data.length > 10000) throw new Error('stock_chart_calendar_scope_invalid');
  let currentPeriod: string | null = null;
  let cutoffDate: string | null = null;
  if (cutoff !== undefined) {
    const at = Date.parse(cutoff);
    if (!Number.isFinite(at)) throw new Error('stock_chart_cutoff_invalid');
    cutoffDate = taiwanChartDate((at / 1000) as Time);
    currentPeriod = periodStart(cutoffDate, timeframe);
  }
  const sessions = new Map<string, { candle: CandlestickData; volume: number | null }>();
  for (const candle of data) {
    const date = taiwanChartDate(candle.time);
    if (cutoffDate !== null && date > cutoffDate) throw new Error('stock_chart_future_session');
    if (![candle.open, candle.high, candle.low, candle.close].every(value => typeof value === 'number' && Number.isFinite(value) && value > 0)
      || candle.low > Math.min(candle.open, candle.close) || candle.high < Math.max(candle.open, candle.close) || candle.low > candle.high) throw new Error('stock_chart_ohlc_invalid');
    if (candle.volume !== undefined && candle.volume !== null && (!Number.isFinite(candle.volume) || candle.volume < 0)) throw new Error('stock_chart_volume_invalid');
    const row = { candle: { time: date, open: candle.open, high: candle.high, low: candle.low, close: candle.close }, volume: candle.volume ?? null };
    const previous = sessions.get(date);
    if (previous && JSON.stringify(previous) !== JSON.stringify(row)) throw new Error('stock_chart_conflicting_session');
    sessions.set(date, row);
  }
  const candles: CandlestickData[] = []; const periods: CalendarPeriod[] = [];
  for (const [date, row] of [...sessions].sort(([a], [b]) => a.localeCompare(b))) {
    const key = periodStart(date, timeframe); const last = periods.at(-1);
    if (last?.periodStart === key) {
      const target = candles[candles.length - 1];
      target.time = date; target.high = Math.max(target.high, row.candle.high); target.low = Math.min(target.low, row.candle.low); target.close = row.candle.close;
      last.sourceDates.push(date); last.volume = last.volume === null || row.volume === null ? null : last.volume + row.volume;
      if (last.volume !== null && !Number.isFinite(last.volume)) throw new Error('stock_chart_volume_invalid');
    } else {
      candles.push({ ...row.candle });
      periods.push({ periodStart: key, sourceDates: [date], provisional: currentPeriod === null ? null : key >= currentPeriod, volume: row.volume });
    }
  }
  return { candles, periods, coverage: 'supplied_sessions_only' as const };
}

/** A missing period never borrows daily bars under a weekly/monthly label. */
export function selectStockChartSeries(charts: Record<'daily' | CalendarTimeframe, CandlestickData[]>, timeframe: 'daily' | CalendarTimeframe, normalizedDaily: CandlestickData[]) {
  const rows = charts[timeframe];
  return rows?.length ? rows : timeframe === 'daily' ? normalizedDaily : [];
}
