'use strict';

const { percentile, unavailable } = require('./codec');

function quantiles(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return Object.freeze({ p10: percentile(ordered, 0.1), p25: percentile(ordered, 0.25), p50: percentile(ordered, 0.5),
    p75: percentile(ordered, 0.75), p90: percentile(ordered, 0.9) });
}

function selectOfficialReportedPe({ stockId, asOf, rows = [], sector = null, tradingSessionAuthorityHash = null }) {
  const cutoff = Date.parse(asOf);
  if (!stockId || !Number.isFinite(cutoff)) return unavailable('invalid_pe_cutoff');
  const accepted = rows.filter((row) => row.authority === 'official' && Number.isFinite(row.value) && row.value > 0 && Date.parse(row.asOf) <= cutoff);
  if (accepted.some((row) => tradingSessionAuthorityHash && row.tradingSessionAuthorityHash !== tradingSessionAuthorityHash)) return unavailable('calendar_authority_mismatch');
  const ownAll = accepted.filter((row) => row.stockId === stockId).sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)));
  const collision = ownAll.some((row, index) => index > 0 && row.asOf === ownAll[index - 1].asOf && row.value !== ownAll[index - 1].value);
  if (collision) return unavailable('authority_conflict');
  const own = ownAll.filter((row, index, all) => index === all.findIndex((candidate) => candidate.asOf === row.asOf));
  if (own.length > 1260) return unavailable('reported_pe_selection_bound_violation', { ownCount: own.length });
  if (own.length < 252) return unavailable('insufficient_reported_pe_history', { ownCount: own.length });
  const current = own.at(-1);
  const ownQuantiles = quantiles(own.map((row) => row.value));
  const ownPercentile = own.filter((row) => row.value <= current.value).length / own.length;
  const sameSession = sector ? accepted.filter((row) => row.sector === sector && row.asOf === current.asOf && row.stockId !== stockId) : [];
  const eligibleSector = sameSession.filter((row) => Number.isFinite(row.close) && row.close > 0 && Number.isFinite(row.sharesOutstanding) && row.sharesOutstanding > 0);
  const sectorReference = eligibleSector.length < 8 ? unavailable('insufficient_sector_reported_pe_population', { count: eligibleSector.length }) : Object.freeze({
    availability: 'available', count: eligibleSector.length, ...quantiles(eligibleSector.map((row) => row.value)),
    capWeighted: eligibleSector.reduce((sum, row) => sum + row.value * row.close * row.sharesOutstanding, 0)
      / eligibleSector.reduce((sum, row) => sum + row.close * row.sharesOutstanding, 0),
  });
  return Object.freeze({ availability: 'available', current: current.value, currentObservation: current, ownHistory: own,
    ownReference: Object.freeze({ ...ownQuantiles, percentile: ownPercentile, count: own.length }), sectorReference });
}

module.exports = { selectOfficialReportedPe };
