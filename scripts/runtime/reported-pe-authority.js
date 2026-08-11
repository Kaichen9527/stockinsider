'use strict';

const { percentile, unavailable } = require('./codec');

const CLOSED_REASONS = new Set(['authority_conflict','non_positive_reported_pe','insufficient_own_history',
  'sector_reference_insufficient','missing_official_pe','missing_shares_outstanding',
  'calendar_authority_mismatch','manifest_missing','manifest_hash_mismatch']);

function closedReason(reason) {
  if (CLOSED_REASONS.has(reason)) return reason;
  if (reason === 'insufficient_reported_pe_history' || reason === 'reported_pe_selection_bound_violation') return 'insufficient_own_history';
  if (reason === 'insufficient_sector_reported_pe_population') return 'sector_reference_insufficient';
  if (reason === 'invalid_pe_cutoff') return 'manifest_hash_mismatch';
  return 'missing_official_pe';
}

function unavailableReportedPe(reason, { ownCount = 0, sectorCount = 0 } = {}) {
  const closed = closedReason(reason);
  return Object.freeze({ availability:'unavailable',reason:closed,
    current:Object.freeze({ status:'unavailable',reason:closed,value:null,asOf:null,sourceRef:null,manifestRef:null }),
    ownHistory:Object.freeze({ status:'unavailable',reason:closed,count:ownCount,p10:null,p25:null,p50:null,
      p75:null,p90:null,currentPercentile:null,asOf:null,manifestRef:null }),
    sector:Object.freeze({ status:'unavailable',reason:closed,count:sectorCount,p25:null,p50:null,p75:null,
      capWeightedAggregate:null,asOf:null,manifestRef:null }),
  });
}

function quantiles(values) {
  const ordered = [...values].sort((a, b) => a - b);
  return Object.freeze({ p10: percentile(ordered, 0.1), p25: percentile(ordered, 0.25), p50: percentile(ordered, 0.5),
    p75: percentile(ordered, 0.75), p90: percentile(ordered, 0.9) });
}

function selectOfficialReportedPe({ stockId, asOf, rows = [], sector = null, tradingSessionAuthorityHash = null }) {
  const cutoff = Date.parse(asOf);
  if (!stockId || !Number.isFinite(cutoff)) return unavailableReportedPe('invalid_pe_cutoff');
  const accepted = rows.filter((row) => row.authority === 'official' && Number.isFinite(row.value) && row.value > 0 && Date.parse(row.asOf) <= cutoff);
  if (accepted.some((row) => !/^[0-9a-f]{64}$/u.test(row.tradingSessionAuthorityHash ?? ''))) return unavailableReportedPe('calendar_authority_mismatch');
  const ownAll = accepted.filter((row) => row.stockId === stockId).sort((a, b) => String(a.asOf).localeCompare(String(b.asOf)));
  const collision = ownAll.some((row, index) => index > 0 && row.asOf === ownAll[index - 1].asOf && row.value !== ownAll[index - 1].value);
  if (collision) return unavailableReportedPe('authority_conflict', { ownCount:ownAll.length });
  const own = ownAll.filter((row, index, all) => index === all.findIndex((candidate) => candidate.asOf === row.asOf));
  if (own.length > 1260) return unavailableReportedPe('reported_pe_selection_bound_violation', { ownCount:own.length });
  if (own.length < 252) return unavailableReportedPe('insufficient_reported_pe_history', { ownCount:own.length });
  const current = own.at(-1);
  if (tradingSessionAuthorityHash && current.tradingSessionAuthorityHash !== tradingSessionAuthorityHash) {
    return unavailableReportedPe('calendar_authority_mismatch', { ownCount:own.length });
  }
  const ownQuantiles = quantiles(own.map((row) => row.value));
  const ownPercentile = own.filter((row) => row.value <= current.value).length / own.length;
  const sameSession = sector && sector !== 'unknown'
    ? accepted.filter((row) => row.sector === sector && row.asOf === current.asOf && row.stockId !== stockId) : [];
  const eligibleSector = sameSession.filter((row) => Number.isFinite(row.close) && row.close > 0
    && Number.isFinite(row.sharesOutstanding) && row.sharesOutstanding > 0);
  const sectorReference = eligibleSector.length < 8 ? unavailable('insufficient_sector_reported_pe_population', { count: eligibleSector.length }) : Object.freeze({
    availability: 'available', count: eligibleSector.length, ...quantiles(eligibleSector.map((row) => row.value)),
    capWeighted: eligibleSector.reduce((sum, row) => sum + row.value * row.close * row.sharesOutstanding, 0)
      / eligibleSector.reduce((sum, row) => sum + row.close * row.sharesOutstanding, 0),
    weightingAuthority: 'market_cap_official_shares',
  });
  const manifestRef=`reported-pe-reference:${current.tradingSessionAuthorityHash}`;
  const currentBranch=Object.freeze({ status:'available',reason:null,value:current.value,asOf:current.asOf,
    sourceRef:current.sourceRef,manifestRef });
  const ownBranch=Object.freeze({ status:'available',reason:null,count:own.length,...ownQuantiles,
    currentPercentile:ownPercentile,asOf:current.asOf,manifestRef });
  const sectorBranch=sectorReference.availability==='available'
    ?Object.freeze({ status:'available',reason:null,count:sectorReference.count,p25:sectorReference.p25,
      p50:sectorReference.p50,p75:sectorReference.p75,capWeightedAggregate:sectorReference.capWeighted,
      asOf:current.asOf,manifestRef })
    :unavailableReportedPe(sectorReference.reason,{ ownCount:own.length,sectorCount:eligibleSector.length }).sector;
  return Object.freeze({ availability: 'available', currentValue: current.value, current:currentBranch,
    currentObservation: current, observations: own, ownHistory:ownBranch,
    ownReference: Object.freeze({ ...ownQuantiles, percentile: ownPercentile, count: own.length }),
    sector:sectorBranch,sectorReference });
}

module.exports = { selectOfficialReportedPe, unavailableReportedPe };
