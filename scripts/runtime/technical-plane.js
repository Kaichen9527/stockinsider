'use strict';

const { percentile, unavailable } = require('./codec');

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function emaSeries(values, period) {
  if (values.length < period) return [];
  const alpha = 2 / (period + 1);
  const result = Array(period - 1).fill(null);
  let current = mean(values.slice(0, period));
  result.push(current);
  for (const value of values.slice(period)) {
    current = (value - current) * alpha + current;
    result.push(current);
  }
  return result;
}

function wilder(values, period) {
  if (values.length < period) return null;
  let current = mean(values.slice(0, period));
  for (const value of values.slice(period)) current = (current * (period - 1) + value) / period;
  return current;
}

function orderedAdjustedRows(rows, cutoff) {
  if (!Array.isArray(rows)) return unavailable('invalid_ohlcv');
  if (rows.some((row) => Number.isFinite(Date.parse(row?.session)) && Date.parse(row.session) > cutoff)) return unavailable('future_observation');
  if (rows.some((row) => !Number.isFinite(Date.parse(row?.session)))) return unavailable('nonconsecutive_sessions');
  if (rows.some((row) => ![row.open, row.high, row.low, row.close, row.volume].every(Number.isFinite)
    || row.open <= 0 || row.high <= 0 || row.low <= 0 || row.close <= 0 || row.volume < 0
    || row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close))) return unavailable('invalid_ohlcv');
  if (rows.some((row, index) => index > 0 && Date.parse(row.session) <= Date.parse(rows[index - 1].session))) return unavailable('nonconsecutive_sessions');
  return { availability: 'available', rows };
}

function alignedReference(own, reference, required) {
  if (!Array.isArray(reference) || reference.length < own.length) return unavailable(required);
  const bySession = new Map();
  for (const row of reference) {
    if (!Number.isFinite(Date.parse(row?.session)) || !Number.isFinite(row?.close) || row.close <= 0 || bySession.has(row.session)) return unavailable(required);
    bySession.set(row.session, row.close);
  }
  const closes = own.map((row) => bySession.get(row.session));
  return closes.every((value) => Number.isFinite(value)) ? { availability: 'available', closes } : unavailable(required);
}

function relativeStrength20(ownCloses, referenceCloses) {
  return 100 * ((ownCloses.at(-1) / ownCloses.at(-21)) - (referenceCloses.at(-1) / referenceCloses.at(-21)));
}

function mostRecentPivot(rows, kind, support = null) {
  const pivots = [];
  const start = Math.max(2, rows.length - 60);
  for (let index = start; index <= rows.length - 3; index += 1) {
    const value = kind === 'low' ? rows[index].low : rows[index].high;
    const neighbors = [rows[index - 2], rows[index - 1], rows[index + 1], rows[index + 2]]
      .map((row) => kind === 'low' ? row.low : row.high);
    const confirmed = kind === 'low' ? neighbors.every((candidate) => value <= candidate) : neighbors.every((candidate) => value >= candidate);
    if (confirmed && (kind === 'low' ? value <= rows.at(-2).close : support === null || value > support)) pivots.push({ index, value, session: rows[index].session });
  }
  return pivots.sort((left, right) => right.index - left.index
    || (kind === 'low' ? left.value - right.value : right.value - left.value)
    || String(left.session).localeCompare(String(right.session)))[0]?.value ?? null;
}

function calculateAdjustedTechnicalPlane({ rows = [], asOf, benchmark = [], sector = [] }) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return unavailable('invalid_as_of');
  const selected = orderedAdjustedRows(rows, cutoff);
  if (selected.availability !== 'available') return selected;
  if (selected.rows.length < 122) return unavailable('insufficient_adjusted_history', { count: selected.rows.length });
  const usable = selected.rows.slice(-122);
  const benchmarkSelection = alignedReference(usable, benchmark, 'taiex_reference_unavailable');
  if (benchmarkSelection.availability !== 'available') return benchmarkSelection;
  const sectorSelection = Array.isArray(sector) && sector.length
    ? alignedReference(usable, sector, 'sector_reference_unavailable') : null;

  const closes = usable.map((row) => row.close);
  const current = closes.at(-1);
  const previousClose = closes.at(-2);
  const ma20 = mean(closes.slice(-20));
  const ma60 = mean(closes.slice(-60));
  const ma120 = mean(closes.slice(-120));
  const priorVolumes = usable.slice(-21, -1).map((row) => row.volume);
  const averageVolume = mean(priorVolumes);
  if (!Number.isFinite(averageVolume) || averageVolume <= 0) return unavailable('volume_reference_unavailable');

  const changes = closes.slice(1).map((close, index) => close - closes[index]);
  const averageGain = wilder(changes.map((value) => Math.max(value, 0)), 14);
  const averageLoss = wilder(changes.map((value) => Math.max(-value, 0)), 14);
  const rsi14 = averageGain === 0 && averageLoss === 0 ? 50 : averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
  const trueRanges = usable.slice(1).map((row, index) => Math.max(row.high - row.low,
    Math.abs(row.high - usable[index].close), Math.abs(row.low - usable[index].close)));
  const atr14 = wilder(trueRanges, 14);

  const ema12 = emaSeries(closes, 12);
  const ema26 = emaSeries(closes, 26);
  const macdSeries = closes.map((_, index) => Number.isFinite(ema12[index]) && Number.isFinite(ema26[index]) ? ema12[index] - ema26[index] : null)
    .filter(Number.isFinite);
  const signalSeries = emaSeries(macdSeries, 9);
  const macd = macdSeries.at(-1);
  const macdSignal = signalSeries.at(-1);
  const macdHistogram = macd - macdSignal;

  const support = mostRecentPivot(usable, 'low');
  const resistance = support === null ? null : mostRecentPivot(usable, 'high', support);
  if (!Number.isFinite(support) || !Number.isFinite(resistance) || resistance <= support) return unavailable('insufficient_support_structure');

  const bias20Pct = 100 * (current / ma20 - 1);
  const bias60Pct = 100 * (current / ma60 - 1);
  const bias120Pct = 100 * (current / ma120 - 1);
  const relativeStrengthTaiex20 = relativeStrength20(closes, benchmarkSelection.closes);
  const relativeStrengthSector20 = sectorSelection?.availability === 'available' ? relativeStrength20(closes, sectorSelection.closes) : null;

  return Object.freeze({
    availability: 'available', asOf: usable.at(-1).session, current, previousClose, ma20, ma60, ma120,
    rsi14, macd, macdSignal, macdHistogram, atr14,
    volumeRatio20: usable.at(-1).volume / averageVolume,
    volumeRatio: usable.at(-1).volume / averageVolume,
    maDeviation: bias20Pct / 100,
    bias: { availability: 'available', bias20Pct, bias60Pct, bias120Pct, bias20Atr: atr14 > 0 ? (current - ma20) / atr14 : null },
    relativeStrengthTaiex20, relativeStrength: relativeStrengthTaiex20,
    relativeStrengthSector20, sectorRelativeStrength: relativeStrengthSector20,
    support, resistance,
    brokeSupportPrior20: usable.slice(-21, -1).some((row) => row.close < support),
    distribution: Object.freeze({ p10: percentile([...closes].sort((a, b) => a - b), 0.1), p90: percentile([...closes].sort((a, b) => a - b), 0.9) }),
  });
}

module.exports = { calculateAdjustedTechnicalPlane, emaSeries, orderedAdjustedRows, relativeStrength20, wilder };
