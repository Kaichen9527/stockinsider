import assert from 'node:assert/strict';
import test from 'node:test';
import { buildShadowReplayInputs, replayFrozenCandidateClassification, shadowReplayConflicts } from './shadow-policy-v2.ts';

test('Shadow replay hashes only the frozen manifest universe', () => {
  assert.deepEqual(buildShadowReplayInputs(['2330'], [
    { symbol: '2454', stage: 'waiting', replayHash: 'late-source-change' },
    { symbol: '2330', stage: 'found', replayHash: 'stable' },
  ]), [{ symbol: '2330', stage: 'found', replayHash: 'stable' }]);
});

test('a changed publication payload is audit evidence, not a classification replay conflict', () => {
  assert.equal(shadowReplayConflicts({
    existingManifestId: 'manifest-1', existingReplayHash: 'same-classification', existingStatus: 'matched',
    manifestId: 'manifest-1', replayHash: 'same-classification',
  }), false);
  assert.equal(shadowReplayConflicts({
    existingManifestId: 'manifest-1', existingReplayHash: 'different-classification', existingStatus: 'matched',
    manifestId: 'manifest-1', replayHash: 'same-classification',
  }), true);
});

test('shadow replay recomputes classification from the persisted immutable input', () => {
  const result = replayFrozenCandidateClassification({
    discovery: { independentSources: 100, platformDiversity: 100, discussionBurst: 50, recency: 100, sourceReliability: 100, platformCount: 3 },
    research: { valuationMarginOfSafety: 100, financialBridge: 100, officialEvidenceAndCounterEvidence: 100, brokerEvidence: 100, industryRotation: 100, overseasPeers: 100 },
    actionability: { movingAveragesAndRelativeStrength: 100, priceVolume: 100, institutionalFlows: 100, marketRegime: 100, industryRotation: 100, overseasPrice: 100, overheatRisk: 100 },
    confidence: { completeness: 100, freshness: 100, traceability: 100, crossSourceConsistency: 100 },
    valuation: { hasBearBaseBull: true, baseUpsidePct: 20, rewardRiskRatio: 2, hasMaterialOfficialCounterEvidence: false },
    technical: { close: 118, ma20: 110, ma60: 100, ma120: 90, ma240: 80, ma60Slope: 1, volumeRatio20Median: 1.5, atr14: 4, rsi14: 60 },
    marketRegime: 'risk_on', peerCatchdownBlock: false, staleOrFallback: false,
    consecutiveActionableCloses: 2, previousStage: 'waiting',
  });
  assert.equal(result?.stage, 'actionable');
  assert.equal(replayFrozenCandidateClassification(null), null);
});
