import assert from 'node:assert/strict';
import test from 'node:test';
import {
  classifyCandidateStage,
  scoreActionability,
  scoreDataConfidence,
  scoreDiscovery,
  scoreResearch,
  technicalActionGate,
  type CandidateStageInput,
} from './stage-classifier.ts';

function input(overrides: Partial<CandidateStageInput> = {}): CandidateStageInput {
  return {
    discovery: { independentSources: 80, platformDiversity: 70, discussionBurst: 60, recency: 90, sourceReliability: 80 },
    research: { valuationMarginOfSafety: 80, financialBridge: 80, officialEvidenceAndCounterEvidence: 80, brokerEvidence: 60, industryRotation: 70, overseasPeers: 70 },
    actionability: { movingAveragesAndRelativeStrength: 80, priceVolume: 75, institutionalFlows: 70, marketRegime: 80, industryRotation: 70, overseasPeers: 70, overheatRisk: 90 },
    confidence: { completeness: 90, freshness: 90, traceability: 90, crossSourceConsistency: 85 },
    valuation: { hasBearBaseBull: true, baseUpsidePct: 18, rewardRiskRatio: 2, hasMaterialOfficialCounterEvidence: false },
    technical: { close: 110, ma20: 105, ma60: 100, ma120: 95, ma240: 90, ma60Slope: 0.2, volumeRatio20Median: 1.1, atr14: 4, rsi14: 62, breakoutAboveLongMa: false },
    marketRegime: 'risk_on',
    peerCatchdownBlock: false,
    staleOrFallback: false,
    consecutiveActionableCloses: 2,
    previousStage: 'waiting',
    ...overrides,
  };
}

test('score weights match the approved four scorecards', () => {
  assert.equal(scoreDiscovery({ independentSources: 100, platformDiversity: 0, discussionBurst: 0, recency: 0, sourceReliability: 0 }), 35);
  assert.equal(scoreResearch({ valuationMarginOfSafety: 100, financialBridge: 0, officialEvidenceAndCounterEvidence: 0, brokerEvidence: 0, industryRotation: 0, overseasPeers: 0 }), 30);
  assert.equal(scoreActionability({ movingAveragesAndRelativeStrength: 100, priceVolume: 0, institutionalFlows: 0, marketRegime: 0, industryRotation: 0, overseasPeers: 0, overheatRisk: 0 }), 30);
  assert.equal(scoreDataConfidence({ completeness: 100, freshness: 0, traceability: 0, crossSourceConsistency: 0 }), 30);
});

test('trend and breakout technical gates use explicit MA and overheat rules', () => {
  assert.equal(technicalActionGate(input().technical), true);
  assert.equal(technicalActionGate({ ...input().technical, close: 115, ma20: 100, atr14: 5 }), false, 'price above MA20 + 2 ATR must fail');
  assert.equal(technicalActionGate({ ...input().technical, close: 112, ma20: 108, ma60: 109, ma60Slope: -0.1, ma240: 110, breakoutAboveLongMa: true, volumeRatio20Median: 1.3 }), true);
});

test('candidate reaches actionable only after two qualifying closes', () => {
  assert.equal(classifyCandidateStage(input()).stage, 'actionable');
  const oneClose = classifyCandidateStage(input({ consecutiveActionableCloses: 1 }));
  assert.equal(oneClose.stage, 'waiting');
  assert(oneClose.unmetConditions.includes('requires_two_consecutive_closes'));
});

test('risk-off, breakdown, stale data and peer catch-down block actionable', () => {
  assert.equal(classifyCandidateStage(input({ marketRegime: 'risk_off' })).stage, 'waiting');
  assert.equal(classifyCandidateStage(input({ marketRegime: 'breakdown', previousStage: 'actionable' })).stage, 'waiting');
  assert.equal(classifyCandidateStage(input({ staleOrFallback: true })).stage, 'waiting');
  assert.equal(classifyCandidateStage(input({ peerCatchdownBlock: true })).stage, 'waiting');
});

test('minimum research and conservative valuation gates distinguish found from waiting', () => {
  const waiting = classifyCandidateStage(input({ consecutiveActionableCloses: 0 }));
  assert.equal(waiting.stage, 'waiting');
  const found = classifyCandidateStage(input({
    valuation: { ...input().valuation, baseUpsidePct: 7.9 },
  }));
  assert.equal(found.stage, 'found');
  assert(found.unmetConditions.includes('base_upside_below_8'));
});
