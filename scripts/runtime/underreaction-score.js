'use strict';

const { bounded, invariant } = require('./codec');

const AXIS_WEIGHTS = Object.freeze({
  discovery: 0.20,
  fundamental: 0.30,
  priceDislocation: 0.25,
  valuation: 0.15,
  timing: 0.10,
});
const RECLAIM_STATES = new Set(['below_support', 'reclaim_required']);

function finiteScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function trustworthyAxis(axis) {
  return axis && axis.trustworthy === true && finiteScore(axis.score);
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function computeUnderreactionResearchScore(input) {
  invariant(input && typeof input.symbol === 'string' && /^\d{4}$/u.test(input.symbol), 'research score symbol');
  const available = Object.entries(AXIS_WEIGHTS)
    .filter(([key]) => trustworthyAxis(input[key]));
  const availableWeight = available.reduce((sum, [key]) => sum + AXIS_WEIGHTS[key], 0);
  const weighted = available.reduce((sum, [key]) => sum + input[key].score * AXIS_WEIGHTS[key], 0);
  const missingAxes = Object.keys(AXIS_WEIGHTS).filter((key) => !trustworthyAxis(input[key]));
  const enoughEvidence = available.length >= 2;
  const underreactionScore = enoughEvidence ? round(weighted / availableWeight, 1) : null;
  const coverage = round(availableWeight, 2);
  const confidence = enoughEvidence ? round(Math.min(1, coverage * (0.72 + 0.07 * available.length)), 2) : round(coverage * 0.5, 2);
  const technicalState = trustworthyAxis(input.timing) ? input.timing.technicalState ?? null : null;
  let researchDisposition = 'watch_evidence';
  if (enoughEvidence && RECLAIM_STATES.has(technicalState)) researchDisposition = 'watch_reclaim';
  else if (enoughEvidence && underreactionScore < 35) researchDisposition = 'avoid';
  else if (enoughEvidence && underreactionScore >= 65 && trustworthyAxis(input.fundamental)
      && trustworthyAxis(input.priceDislocation)) researchDisposition = 'research_now';

  const reasons = available.sort((left, right) => {
    const leftContribution = input[left[0]].score * AXIS_WEIGHTS[left[0]];
    const rightContribution = input[right[0]].score * AXIS_WEIGHTS[right[0]];
    return rightContribution - leftContribution || left[0].localeCompare(right[0]);
  }).map(([key]) => ({ axis: key, score: input[key].score, reason: input[key].reason ?? 'evidence_available' }));
  const risks = [
    missingAxes.length ? `missing:${missingAxes.join(',')}` : null,
    RECLAIM_STATES.has(technicalState) ? 'price_must_reclaim_support_before_entry' : null,
    coverage < 0.7 ? 'research_coverage_below_70_percent' : null,
  ].filter(Boolean);
  const result = {
    symbol: input.symbol,
    underreactionScore,
    coverage,
    confidence,
    researchDisposition,
    reasons,
    risks,
    missingAxes,
    formalTargetPrice: null,
    tradeAction: 'valuation_review',
  };
  bounded(result, 5000, 'underreaction research score');
  return Object.freeze(result);
}

function rankUnderreactionCandidates(rows) {
  invariant(Array.isArray(rows), 'research score rows');
  return [...rows].sort((left, right) => {
    const leftScore = Number.isFinite(left?.underreactionScore) ? left.underreactionScore : -1;
    const rightScore = Number.isFinite(right?.underreactionScore) ? right.underreactionScore : -1;
    return rightScore - leftScore || (right?.confidence ?? 0) - (left?.confidence ?? 0)
      || String(left?.symbol ?? '').localeCompare(String(right?.symbol ?? ''));
  });
}

module.exports = { AXIS_WEIGHTS, computeUnderreactionResearchScore, rankUnderreactionCandidates };
