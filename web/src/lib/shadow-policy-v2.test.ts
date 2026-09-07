import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildFrozenShadowReplayPayload,
  buildShadowReplayInputs,
  countQualifyingShadowSessions,
  replayFrozenCandidateClassification,
  shadowReplayHash,
  shadowReplayConflicts,
  verifiesFrozenShadowReplayPayload,
} from './shadow-policy-v2.ts';

const actionableInput = {
  discovery: { independentSources: 100, platformDiversity: 100, discussionBurst: 50, recency: 100, sourceReliability: 100, platformCount: 3 },
  research: { valuationMarginOfSafety: 100, financialBridge: 100, officialEvidenceAndCounterEvidence: 100, brokerEvidence: 100, industryRotation: 100, overseasPeers: 100 },
  actionability: { movingAveragesAndRelativeStrength: 100, priceVolume: 100, institutionalFlows: 100, marketRegime: 100, industryRotation: 100, overseasPrice: 100, overheatRisk: 100 },
  confidence: { completeness: 100, freshness: 100, traceability: 100, crossSourceConsistency: 100 },
  valuation: { hasBearBaseBull: true, baseUpsidePct: 20, rewardRiskRatio: 2, hasMaterialOfficialCounterEvidence: false },
  technical: { close: 118, ma20: 110, ma60: 100, ma120: 90, ma240: 80, ma60Slope: 1, volumeRatio20Median: 1.5, atr14: 4, rsi14: 60 },
  marketRegime: 'risk_on' as const, peerCatchdownBlock: false, staleOrFallback: false,
  consecutiveActionableCloses: 2, previousStage: 'waiting' as const,
};

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
  const result = replayFrozenCandidateClassification(actionableInput);
  assert.equal(result?.stage, 'actionable');
  assert.equal(replayFrozenCandidateClassification(null), null);
});

test('frozen replay payload is ordered, publication-bound, and rejects a changed classification', () => {
  const payload = buildFrozenShadowReplayPayload({
    manifestId: 'manifest-1', manifestHash: 'a'.repeat(64), finalPublicationId: 'publication-1',
    finalPublicationHash: 'b'.repeat(64), sessionDate: '2026-09-07',
    rulesetVersion: 'source-ranking-v2.1.0', modelVersion: 'candidate-research-v4.0.0',
    cards: [{ symbol: '2454', expectedStage: 'actionable', classificationInput: actionableInput }, { symbol: '2330', expectedStage: 'actionable', classificationInput: actionableInput }],
  });
  assert.deepEqual(payload.cards.map((card) => card.symbol), ['2330', '2454']);
  assert.equal(verifiesFrozenShadowReplayPayload(payload), true);
  assert.equal(shadowReplayHash(payload.cards[0].classificationInput), shadowReplayHash(actionableInput));
  const changed = structuredClone(payload);
  changed.cards[0].expectedStage = 'waiting';
  assert.equal(verifiesFrozenShadowReplayPayload(changed), false);
});

test('only distinct final official-session payloads advance Shadow progress', () => {
  const payloadHash = 'c'.repeat(64);
  assert.deepEqual(countQualifyingShadowSessions([
    { sessionDate: '2026-09-04', sessionKind: 'official_trading', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
    { sessionDate: '2026-09-04', sessionKind: 'official_trading', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
    { sessionDate: '2026-09-05', sessionKind: 'preliminary', publicationPhase: 'preliminary', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
    { sessionDate: '2026-09-06', sessionKind: 'weekend', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
    { sessionDate: '2026-09-03', sessionKind: 'backtest', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
  ]), { qualifying: 1, observed: 1, ignored: 3 });
  assert.deepEqual(countQualifyingShadowSessions([
    { sessionDate: '2026-09-04', sessionKind: 'official_trading', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash },
    { sessionDate: '2026-09-04', sessionKind: 'official_trading', publicationPhase: 'final', reproducibilityStatus: 'matched', qualifying: true, payloadHash: 'd'.repeat(64) },
  ]), { qualifying: 0, observed: 0, ignored: 1 });
});
