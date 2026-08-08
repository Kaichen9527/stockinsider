'use strict';

const { unavailable } = require('./codec');

const AXES = Object.freeze(['returns', 'growth', 'margin', 'cashFlowQuality', 'leverageCoverage', 'revisions']);
const WEIGHTS = Object.freeze({ returns: 0.25, growth: 0.25, margin: 0.15, cashFlowQuality: 0.15, leverageCoverage: 0.1, revisions: 0.1 });
const clamp = (value) => Math.max(0, Math.min(100, value));

function averageAvailable(values) {
  const finite = values.filter(Number.isFinite);
  return finite.length ? finite.reduce((sum, value) => sum + value, 0) / finite.length : null;
}

function scoreInputs(facts = {}) {
  const returns = averageAvailable([facts.roicScore, facts.roeScore, Number.isFinite(facts.roic) ? facts.roic * 500 : null, Number.isFinite(facts.roe) ? facts.roe * 400 : null]);
  const growth = averageAvailable([facts.growthScore, Number.isFinite(facts.revenueGrowth) ? 50 + facts.revenueGrowth * 200 : null,
    Number.isFinite(facts.earningsGrowth) ? 50 + facts.earningsGrowth * 200 : null, Number.isFinite(facts.growthAcceleration) ? 50 + facts.growthAcceleration * 200 : null]);
  const margin = averageAvailable([facts.marginScore, Number.isFinite(facts.operatingMargin) ? facts.operatingMargin * 300 : null,
    Number.isFinite(facts.marginTrend) ? 50 + facts.marginTrend * 300 : null]);
  const cashFlowQuality = averageAvailable([facts.cashFlowQualityScore, Number.isFinite(facts.freeCashFlowConversion) ? facts.freeCashFlowConversion * 70 : null,
    Number.isFinite(facts.accrualRatio) ? 50 - facts.accrualRatio * 200 : null]);
  const leverageCoverage = averageAvailable([facts.leverageCoverageScore, Number.isFinite(facts.netDebtToEbitda) ? 75 - facts.netDebtToEbitda * 12.5 : null,
    Number.isFinite(facts.interestCoverage) ? Math.min(100, facts.interestCoverage * 10) : null]);
  const revisions = averageAvailable([facts.revisionsScore, Number.isFinite(facts.estimateRevision) ? 50 + facts.estimateRevision * 250 : null,
    Number.isFinite(facts.factRevision) ? 50 + facts.factRevision * 250 : null]);
  return { returns, growth, margin, cashFlowQuality, leverageCoverage, revisions };
}

function calculateFundamentalQualityAxes(facts) {
  const raw = scoreInputs(facts || {});
  const axes = Object.fromEntries(AXES.map((axis) => [axis, Number.isFinite(raw[axis])
    ? Object.freeze({ availability: 'available', score: clamp(raw[axis]) }) : unavailable(`missing_${axis}_facts`)]));
  const available = AXES.filter((axis) => axes[axis].availability === 'available');
  const availableWeight = available.reduce((sum, axis) => sum + WEIGHTS[axis], 0);
  const score = availableWeight > 0 ? available.reduce((sum, axis) => sum + axes[axis].score * WEIGHTS[axis], 0) / availableWeight : null;
  return Object.freeze({ availability: available.length ? 'available' : 'unavailable', axes, availableWeight,
    score, qualityActionEligible: availableWeight >= 0.65 && score >= 50,
    reason: available.length ? null : 'missing_fundamental_quality_facts' });
}

module.exports = { AXES, WEIGHTS, calculateFundamentalQualityAxes };
