'use strict';

const { invariant } = require('./codec');

const AXIS_WEIGHTS = Object.freeze({
  valuation: 0.30,
  fundamentalQuality: 0.25,
  momentumTechnical: 0.20,
  sourceCatalyst: 0.15,
  marketLiquidity: 0.10,
});

function round(value, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function validScore(value) {
  return Number.isFinite(value) && value >= 0 && value <= 100;
}

function computeResearchRankingV314(input) {
  invariant(input && typeof input === 'object' && !Array.isArray(input), 'ranking axes required');
  let coverage = 0;
  let weighted = 0;
  const missingAxes = [];
  for (const [axis, weight] of Object.entries(AXIS_WEIGHTS)) {
    const score = input[axis];
    if (!validScore(score)) {
      missingAxes.push(axis);
      continue;
    }
    coverage += weight;
    weighted += weight * score;
  }
  coverage = round(coverage);
  const rankingScore = round(Math.max(0, Math.min(100, weighted - 20 * (1 - coverage))), 1);
  const trustworthyAxes=Object.freeze(Object.keys(AXIS_WEIGHTS).filter((axis)=>validScore(input[axis])));
  const softBlockers=Object.freeze(Array.isArray(input.softBlockers)
    ?[...new Set(input.softBlockers.filter((value)=>typeof value==='string'&&value.length>0))].slice(0,4):[]);
  const conflict=input.conflict===true;
  const coreAxes=['valuation','fundamentalQuality','momentumTechnical'].every((axis)=>trustworthyAxes.includes(axis));
  const lane=!conflict&&rankingScore>=70&&coverage>=0.75&&coreAxes&&softBlockers.length<=1?'near_buy'
    :!conflict&&rankingScore>=60&&coverage>=0.6?'waiting':'research_pending';
  return Object.freeze({
    version: 'research-ranking-envelope-v3.14.0',
    rankingScore,
    coverage,
    missingAxes: Object.freeze(missingAxes),
    trustworthyAxes,conflict,softBlockers,lane,
    axes: Object.freeze(Object.fromEntries(Object.keys(AXIS_WEIGHTS).map((axis) =>
      [axis, validScore(input[axis]) ? input[axis] : null]))),
  });
}

module.exports = { AXIS_WEIGHTS, computeResearchRankingV314 };
