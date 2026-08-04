'use strict';

const { unavailable } = require('./codec');

function selectComparableValuationInputs({ subjectStockId, roster = [], multiples = [], minimumPeers = 5, cutoff, sector = null }) {
  const cutoffMs = Date.parse(cutoff ?? '9999-12-31T23:59:59Z');
  if (!subjectStockId || !Array.isArray(roster) || !Array.isArray(multiples) || !Number.isFinite(cutoffMs)) return unavailable('missing_comparable_authority');
  const subject = roster.find((row) => row.stockId === subjectStockId);
  const canonicalSector = sector ?? subject?.sector ?? null;
  const allowed = new Set(roster.filter((row) => row.active !== false && row.stockId !== subjectStockId
    && (!canonicalSector || row.sector === canonicalSector)).map((row) => row.stockId));
  const latest = new Map();
  for (const row of multiples) {
    const asOfMs = Date.parse(row.asOf);
    if (!allowed.has(row.stockId) || !Number.isFinite(row.value) || row.value <= 0 || !row.method || !Number.isFinite(asOfMs) || asOfMs > cutoffMs) continue;
    const key = `${row.stockId}:${row.method}`;
    if (!latest.has(key) || Date.parse(latest.get(key).asOf) < asOfMs) latest.set(key, row);
  }
  const rows = [...latest.values()].sort((a, b) => `${a.stockId}:${a.method}`.localeCompare(`${b.stockId}:${b.method}`));
  if (new Set(rows.map((row) => row.stockId)).size < minimumPeers) return unavailable('insufficient_series', { rows });
  return Object.freeze({ availability: 'available', rows, peerStockIds: [...new Set(rows.map((row) => row.stockId))], sector: canonicalSector });
}

module.exports = { selectComparableValuationInputs };
