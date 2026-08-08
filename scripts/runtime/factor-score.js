'use strict';

const { calculateFundamentalQualityAxes } = require('./fundamental-quality');

function calculateFactorScore(facts) {
  const result = calculateFundamentalQualityAxes(facts);
  return Object.freeze({ ...result, eligibleForDeepResearch: result.qualityActionEligible, biasPromotedWeight: 0 });
}

module.exports = { calculateFactorScore };
