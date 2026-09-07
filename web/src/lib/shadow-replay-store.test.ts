import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFrozenShadowReplayPayload } from './shadow-policy-v2.ts';
import { persistFrozenShadowReplayPayload } from './shadow-replay-store.ts';

const classificationInput = {
  discovery: { independentSources: 100, platformDiversity: 100, discussionBurst: 100, recency: 100, sourceReliability: 100, platformCount: 3 },
  research: { valuationMarginOfSafety: 100, financialBridge: 100, officialEvidenceAndCounterEvidence: 100, brokerEvidence: 100, industryRotation: 100, overseasPeers: 100 },
  actionability: { movingAveragesAndRelativeStrength: 100, priceVolume: 100, institutionalFlows: 100, marketRegime: 100, industryRotation: 100, overseasPrice: 100, overheatRisk: 100 },
  confidence: { completeness: 100, freshness: 100, traceability: 100, crossSourceConsistency: 100 },
  valuation: { hasBearBaseBull: true, baseUpsidePct: 20, rewardRiskRatio: 2, hasMaterialOfficialCounterEvidence: false },
  // Keep the close at the ATR chase ceiling: this is a valid actionable
  // fixture, whereas an overextended close would correctly replay as waiting.
  technical: { close: 118, ma20: 110, ma60: 100, ma120: 90, ma240: 80, ma60Slope: 1, volumeRatio20Median: 1.5, atr14: 4, rsi14: 60 },
  marketRegime: 'risk_on' as const, peerCatchdownBlock: false, staleOrFallback: false,
  consecutiveActionableCloses: 2, previousStage: 'waiting' as const,
};

function payload(finalPublicationHash = 'b'.repeat(64)) {
  return buildFrozenShadowReplayPayload({
    manifestId: 'manifest-1', manifestHash: 'a'.repeat(64), finalPublicationId: 'publication-1',
    finalPublicationHash, sessionDate: '2026-09-07', rulesetVersion: 'rules', modelVersion: 'model',
    cards: [{ symbol: '2330', expectedStage: 'actionable', classificationInput }],
  });
}

function memoryClient() {
  let row: Record<string, unknown> | null = null;
  let writes = 0;
  const client = {
    from: () => ({
      select: () => ({
        eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: row, error: null }) }) }),
      }),
      insert: (value: Record<string, unknown>) => ({
        select: () => ({ single: async () => {
          writes += 1;
          if (row) return { data: null, error: { code: '23505', message: 'duplicate' } };
          row = { id: 'payload-1', payload: value.payload, payload_hash: value.payload_hash };
          return { data: { id: 'payload-1', payload_hash: value.payload_hash }, error: null };
        } }),
      }),
    }),
  };
  return { client, writes: () => writes };
}

test('same manifest/final-publication is idempotent only for the same immutable payload', async () => {
  const memory = memoryClient();
  const first = await persistFrozenShadowReplayPayload({ payload: payload(), manifestId: 'manifest-1', finalPublicationId: 'publication-1' }, memory.client as never);
  const retry = await persistFrozenShadowReplayPayload({ payload: payload(), manifestId: 'manifest-1', finalPublicationId: 'publication-1' }, memory.client as never);
  assert.deepEqual(retry, first);
  assert.equal(memory.writes(), 1);
  await assert.rejects(
    persistFrozenShadowReplayPayload({ payload: payload('c'.repeat(64)), manifestId: 'manifest-1', finalPublicationId: 'publication-1' }, memory.client as never),
    /shadow_replay_manifest_publication_conflict/u,
  );
});
