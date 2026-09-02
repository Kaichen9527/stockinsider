import { atr, obv, rsi, sma } from 'indicatorts';

export const TECHNICAL_FEATURE_RULESET_VERSION = 'technical-features-v2.0.0';
export const MINIMUM_TECHNICAL_HISTORY_BARS = 240;

export function technicalHistoryCoverageTerminalReason(barCount: number) {
  return Number.isInteger(barCount) && barCount >= MINIMUM_TECHNICAL_HISTORY_BARS
    ? null
    : `official_price_history_coverage_below_${MINIMUM_TECHNICAL_HISTORY_BARS}`;
}

export type TechnicalBar = {
  session: string;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type InstitutionalFlowDay = {
  session: string;
  net: number | null;
  volume: number | null;
};

function lastFinite(values: number[], minimumLength: number): number | null {
  if (values.length < minimumLength) return null;
  const value = values.at(-1);
  return value != null && Number.isFinite(value) ? value : null;
}

function median(values: number[]): number | null {
  const finite = values.filter((value) => Number.isFinite(value)).sort((left, right) => left - right);
  if (finite.length === 0) return null;
  const mid = Math.floor(finite.length / 2);
  return finite.length % 2 ? finite[mid] : (finite[mid - 1] + finite[mid]) / 2;
}

export function normalizeInstitutionalFlows(days: InstitutionalFlowDay[]) {
  const uniqueBySession = new Map<string, InstitutionalFlowDay>();
  for (const day of days
    .filter((candidate) => /^\d{4}-\d{2}-\d{2}$/u.test(candidate.session))
    .sort((left, right) => right.session.localeCompare(left.session))) {
    if (!uniqueBySession.has(day.session)) uniqueBySession.set(day.session, day);
  }
  const uniqueDays = [...uniqueBySession.values()];
  const normalized = (window: number) => {
    const selected = uniqueDays.slice(0, window).filter((day) => day.net != null && Number.isFinite(day.net));
    const volume = selected.reduce((sum, day) => sum + (day.volume != null && Number.isFinite(day.volume) && day.volume > 0 ? day.volume : 0), 0);
    if (selected.length === 0 || volume <= 0) return null;
    const net = selected.reduce((sum, day) => sum + Number(day.net), 0);
    return Math.max(-1, Math.min(1, net / volume));
  };
  return { normalized5d: normalized(5), normalized20d: normalized(20) };
}

export function calculateTechnicalFeatures(
  bars: TechnicalBar[],
  institutionalFlows?: { normalized5d?: number | null; normalized20d?: number | null },
) {
  if (bars.length === 0) throw new Error('technical_bars_missing');
  if (bars.some((bar, index) => !Number.isFinite(bar.high) || !Number.isFinite(bar.low)
    || !Number.isFinite(bar.close) || !Number.isFinite(bar.volume) || bar.close <= 0
    || bar.high < Math.max(bar.low, bar.close) || bar.low > bar.close || bar.volume < 0
    || (index > 0 && bar.session <= bars[index - 1].session))) throw new Error('invalid_technical_bars');

  const closes = bars.map((bar) => bar.close);
  const highs = bars.map((bar) => bar.high);
  const lows = bars.map((bar) => bar.low);
  const volumes = bars.map((bar) => bar.volume);
  const ma = (period: number) => lastFinite(sma(closes, { period }), period);
  const ma60Series = sma(closes, { period: 60 });
  const ma60Slope = bars.length >= 65
    ? (Number(ma60Series.at(-1)) - Number(ma60Series.at(-6))) / 5
    : null;
  const medianVolume20 = median(volumes.slice(-20));
  const latestVolume = volumes.at(-1)!;
  const atr14 = lastFinite(atr(highs, lows, closes, { period: 14 }).atrLine, 14);
  const rsi14 = lastFinite(rsi(closes, { period: 14 }), 15);
  const obvValue = lastFinite(obv(closes, volumes), 1);
  return {
    sessionDate: bars.at(-1)!.session,
    close: closes.at(-1)!,
    volume: latestVolume,
    ma5: ma(5),
    ma20: ma(20),
    ma60: ma(60),
    ma120: ma(120),
    ma240: ma(240),
    ma60Slope,
    volumeRatio20Median: medianVolume20 && medianVolume20 > 0 ? latestVolume / medianVolume20 : null,
    atr14,
    rsi14,
    obv: obvValue,
    institutionalFlow5dNorm: institutionalFlows?.normalized5d ?? null,
    institutionalFlow20dNorm: institutionalFlows?.normalized20d ?? null,
    rulesetVersion: TECHNICAL_FEATURE_RULESET_VERSION,
  };
}
