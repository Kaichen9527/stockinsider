'use strict';

const { immutableBundle, percentile, unavailable } = require('./codec');

function currentBias20(rows) {
  if (!Array.isArray(rows) || rows.length < 20) return null;
  const closes = rows.slice(-20).map((row) => row.close);
  if (!closes.every((value) => Number.isFinite(value) && value > 0)) return null;
  const average = closes.reduce((sum, value) => sum + value, 0) / 20;
  return 100 * (closes.at(-1) / average - 1);
}

function buildBiasUniverseManifest({ roster = [], histories = [] }) {
  if (roster.length > 20000) return unavailable('bias_roster_exceeds_cap', { count: roster.length });
  const orderedRoster = [...roster].sort((a, b) => String(a.stockId).localeCompare(String(b.stockId)));
  if (orderedRoster.some((row, index) => !row.stockId || (index > 0 && row.stockId === orderedRoster[index - 1].stockId))) return unavailable('invalid_bias_roster');
  const rosterById = new Map(orderedRoster.map((row) => [row.stockId, row]));
  const selected = histories.filter((row) => rosterById.has(row.stockId)).sort((a, b) => String(a.stockId).localeCompare(String(b.stockId))).map((row) => ({ stockId: row.stockId, rows: row.rows.slice(-877), bias20Pct: currentBias20(row.rows) }));
  const sectorGroups = new Map();
  for (const history of selected) {
    if (!Number.isFinite(history.bias20Pct)) continue;
    const sector = rosterById.get(history.stockId)?.sector;
    if (!sector) continue;
    if (!sectorGroups.has(sector)) sectorGroups.set(sector, []);
    sectorGroups.get(sector).push(history.bias20Pct);
  }
  const sectors = Object.fromEntries([...sectorGroups].sort(([left], [right]) => left.localeCompare(right)).map(([sector, values]) => {
    const ordered = values.sort((a, b) => a - b);
    return [sector, ordered.length < 8 ? unavailable('insufficient_sector_bias_population', { count: ordered.length }) : {
      availability: 'available', count: ordered.length, p10: percentile(ordered, 0.1), p90: percentile(ordered, 0.9),
    }];
  }));
  const payload = { roster: orderedRoster, histories: selected, sectors };
  return Object.freeze({ availability: 'available', ...payload, bundle: immutableBundle('bias_universe_manifest_v3_11', payload) });
}

module.exports = { buildBiasUniverseManifest, currentBias20 };
