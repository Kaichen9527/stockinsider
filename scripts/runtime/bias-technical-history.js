'use strict';

const { percentile, unavailable } = require('./codec');

function mean(values) { return values.reduce((sum, value) => sum + value, 0) / values.length; }

function labelBias(value, quantiles) {
  if (value <= quantiles.p10) return 'extreme_low';
  if (value <= quantiles.p25) return 'low';
  if (value <= quantiles.p75) return 'normal';
  if (value < quantiles.p90) return 'high';
  return 'extended';
}

function calculateBiasEndpoint(window) {
  const closes = window.map((row) => row.close);
  const current = closes.at(-1);
  const ma20 = mean(closes.slice(-20));
  const ma60 = mean(closes.slice(-60));
  const ma120 = mean(closes.slice(-120));
  const trueRanges = window.slice(-15).slice(1).map((row, index) => {
    const prior = window.slice(-15)[index].close;
    return Math.max(row.high - row.low, Math.abs(row.high - prior), Math.abs(row.low - prior));
  });
  const atr14 = mean(trueRanges);
  return Object.freeze({ session: window.at(-1).session, bias20Pct: 100 * (current / ma20 - 1),
    bias60Pct: 100 * (current / ma60 - 1), bias120Pct: 100 * (current / ma120 - 1),
    bias20Atr: atr14 > 0 ? (current - ma20) / atr14 : null, ma20, ma60, ma120, atr14, adjustedClose: current });
}

function selectBiasTechnicalHistory({ rows = [], asOf }) {
  const cutoff = Date.parse(asOf);
  if (!Number.isFinite(cutoff)) return unavailable('invalid_bias_cutoff');
  const complete = rows.filter((row) => Date.parse(row.session) < cutoff);
  if (complete.length > 877) return unavailable('bias_selection_bound_violation', { count: complete.length });
  if (complete.some((row, index) => !Number.isFinite(Date.parse(row.session))
    || (index > 0 && Date.parse(row.session) <= Date.parse(complete[index - 1].session))
    || ![row.open, row.high, row.low, row.close].every(Number.isFinite)
    || row.high < Math.max(row.open, row.close) || row.low > Math.min(row.open, row.close))) return unavailable('invalid_adjusted_history');
  if (complete.length < 120) return unavailable('insufficient_technical_history', { count: complete.length });
  const endpoints = complete.slice(119).map((_, index) => calculateBiasEndpoint(complete.slice(index, index + 120)));
  if (endpoints.length < 252) return unavailable('insufficient_own_history', { endpointCount: endpoints.length });
  const retained = endpoints.slice(-758);
  const orderedBias = retained.map((row) => row.bias20Pct).sort((a, b) => a - b);
  const quantiles = Object.freeze({ p10: percentile(orderedBias, 0.1), p25: percentile(orderedBias, 0.25),
    p50: percentile(orderedBias, 0.5), p75: percentile(orderedBias, 0.75), p90: percentile(orderedBias, 0.9) });
  return Object.freeze({ availability: 'available', rows: complete, endpoints: retained, endpointCount: retained.length,
    current: Object.freeze({ ...retained.at(-1), label: labelBias(retained.at(-1).bias20Pct, quantiles) }), quantiles });
}

module.exports = { calculateBiasEndpoint, labelBias, selectBiasTechnicalHistory };
