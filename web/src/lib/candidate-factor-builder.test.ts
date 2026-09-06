import assert from 'node:assert/strict';
import test from 'node:test';
import { brokerResearchFactor, evidenceGrade, industryRotationActionabilityFactor, officialResearchEvidenceFactor, overseasPriceActionabilityFactor, relationshipFactor } from './candidate-factor-builder.ts';
import { classifyCandidateStage } from './stage-classifier.ts';

test('official evidence is not capped at fifty and becomes complete only with all named evidence', () => {
  const factor = officialResearchEvidenceFactor({
    factKeys: ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps'],
    hasPriceHistory: true, hasInstitutionalFlow: true, hasMarketEvidence: true, hasCounterEvidenceReview: true, asOf: '2026-09-04',
  });
  assert.equal(factor.score, 100);
  assert.equal(factor.status, 'available');
  assert.equal(factor.evidenceGrade, 100);
  assert.equal(factor.coveredWeight, 100);
});

test('missing broker and peer evidence stays explicit instead of receiving free points', () => {
  assert.deepEqual(brokerResearchFactor([]).reasons, ['missing:licensed_broker_evidence']);
  assert.equal(relationshipFactor([], 'overseas_peer').score, 0);
  assert.equal(relationshipFactor([], 'domestic_rotation').status, 'missing');
});

test('research factors expose coarse evidence grades and reject unlawful broker rows', () => {
  assert.equal(evidenceGrade(0), 0);
  assert.equal(evidenceGrade(26), 50);
  const unlawful = brokerResearchFactor([{ sourceCount: 3, freshness: 'fresh', lawful: false, asOf: '2026-09-04' }]);
  assert.equal(unlawful.score, 0);
  assert.deepEqual(unlawful.reasons, ['missing:lawful_broker_evidence']);
  assert.equal(brokerResearchFactor([{ sourceCount: 3, freshness: 'fresh', lawful: true, asOf: '2026-09-04' }]).score, 100);
});

test('fundamental and overseas price evidence remain distinct factor inputs', () => {
  const rows = [
    { market: 'US', score: 1, weight: 1, asOf: '2026-09-04', evidenceKind: 'fundamental' as const },
    { market: 'US', score: -1, weight: 1, asOf: '2026-09-04', evidenceKind: 'price' as const },
  ];
  assert.equal(relationshipFactor(rows, 'overseas_peer').score, 50);
  assert.equal(overseasPriceActionabilityFactor(rows).score, 0);
});

test('builder evidence reaches the classifier without a hand-authored score fixture', () => {
  const official = officialResearchEvidenceFactor({
    factKeys: ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps'],
    hasPriceHistory: true, hasInstitutionalFlow: true, hasMarketEvidence: true, hasCounterEvidenceReview: true, asOf: '2026-09-04',
  });
  const broker = brokerResearchFactor([{ sourceCount: 3, freshness: 'fresh', lawful: true, asOf: '2026-09-04' }]);
  const domestic = relationshipFactor([{ market: 'TW', score: 1, weight: 1, asOf: '2026-09-04', evidenceKind: 'fundamental' }], 'domestic_rotation');
  const overseasFundamentals = relationshipFactor([{ market: 'US', score: 1, weight: 1, asOf: '2026-09-04', evidenceKind: 'fundamental' }], 'overseas_peer');
  const rotationPrice = industryRotationActionabilityFactor([{ market: 'TW', score: 1, weight: 1, asOf: '2026-09-04', evidenceKind: 'price' }]);
  const overseasPrice = overseasPriceActionabilityFactor([{ market: 'US', score: 1, weight: 1, asOf: '2026-09-04', evidenceKind: 'price' }]);
  const result = classifyCandidateStage({
    discovery: { independentSources: 100, platformDiversity: 100, discussionBurst: 100, recency: 100, sourceReliability: 100, platformCount: 3 },
    research: { valuationMarginOfSafety: 100, financialBridge: 100, officialEvidenceAndCounterEvidence: official.score, brokerEvidence: broker.score, industryRotation: domestic.score, overseasPeers: overseasFundamentals.score },
    actionability: { movingAveragesAndRelativeStrength: 100, priceVolume: 100, institutionalFlows: 100, marketRegime: 100, industryRotation: rotationPrice.score, overseasPrice: overseasPrice.score, overheatRisk: 100 },
    confidence: { completeness: 100, freshness: 100, traceability: 100, crossSourceConsistency: 100 },
    valuation: { hasBearBaseBull: true, baseUpsidePct: 20, rewardRiskRatio: 2, hasMaterialOfficialCounterEvidence: false },
    technical: { close: 110, ma20: 105, ma60: 100, ma120: 95, ma240: 90, ma60Slope: 1, volumeRatio20Median: 1, atr14: 3, rsi14: 60 },
    marketRegime: 'risk_on', peerCatchdownBlock: false, staleOrFallback: false, consecutiveActionableCloses: 2,
  });
  assert.equal(result.stage, 'actionable');
  assert.equal(result.scores.research, 90, 'one relationship per fundamental factor is explicitly 50% evidence coverage');
});
