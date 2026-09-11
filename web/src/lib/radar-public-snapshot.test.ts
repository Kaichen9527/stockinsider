import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCanonicalStagePlane } from './radar-stage-pagination.ts';
import type { CandidateStageCard } from './types.ts';

function stageCard(index: number): CandidateStageCard {
  return {
    symbol: String(1000 + index), chineseName: `測試公司 ${index}`, market: 'TW', lifecycleStage: 'found',
    latestMentionAt: '2026-09-01T13:30:00+08:00', mentionCount: 2, rawMentionCount: 2,
    effectiveMentionCount: 2, publisherCount: 1, positivePublisherCount: 0,
    negativePublisherCount: 0, generalPublisherCount: 1, platformCount: 1, dominantPlatformShare: 1,
    sources: Array.from({ length: 2 }, (_, sourceIndex) => ({
      platform: 'telegram', sourceName: '範例頻道', publisherName: '範例頻道', author: null, sourceUrl: `https://t.me/example/${index}-${sourceIndex}`,
      stance: 'neutral', mentionedAt: '2026-09-01T13:30:00+08:00',
    })),
    scores: { discovery: 40, research: 20, actionability: 30, dataConfidence: 55 },
    valuation: {
      status: 'missing', currentPrice: null, bearTarget: null, baseTarget: null, bullTarget: null,
      probabilityWeightedTarget: null, baseUpsidePct: null, bearDownsidePct: null,
      rewardRiskRatio: null, method: null,
    },
    technical: {
      sessionDate: null, close: null, ma20: null, ma60: null, ma120: null, ma240: null,
      rsi14: null, volumeRatio20Median: null, marketRegime: 'unknown', hardGatePassed: false,
    },
    consecutiveCloses: { passed: 0, required: 2, technicalSessionDate: null },
    classificationReplayHash: 'a'.repeat(64),
    unmetConditions: Array.from({ length: 12 }, (_, unmetIndex) => `missing-condition-${unmetIndex}`),
    promotionReasons: [], dataAsOf: null, stale: true, detailRevisionId: null, riskAction: null,
    detailHref: `/stock/${1000 + index}`,
  };
}

test('public Radar snapshot persists the complete canonical stock plane for paged delivery', () => {
  const cards = Array.from({ length: 131 }, (_, index) => stageCard(index));
  const compact = buildCanonicalStagePlane({ found: cards, waiting: [], actionable: [] });

  assert.equal(compact.stages.found.length, 131);
  assert.deepEqual(compact.stageCounts, { found: 131, waiting: 0, actionable: 0 });
  assert.equal('classificationReplayHash' in (compact.stages.found[0] || {}), false);
  assert.equal('market' in (compact.stages.found[0] || {}), false);
  assert.equal('mentionCount' in (compact.stages.found[0] || {}), false);
  assert.equal('promotionReasons' in (compact.stages.found[0] || {}), false);
  // Revision identity and stale authority are transport-critical, not optional
  // diagnostics. Removing them silently changes the research behind a click.
  assert.equal(compact.stages.found[0]?.detailHref, '/stock/1000');
  assert.equal(compact.stages.found[0]?.detailRevisionId, null);
  assert.equal(compact.stages.found[0]?.stale, true);
  assert.equal('currentPrice' in (compact.stages.found[0]?.valuation || {}), false);
  assert.equal(compact.stages.found[0]?.sources.length, 2);
  assert.equal('mentionedAt' in (compact.stages.found[0]?.sources[0] || {}), false);
  assert.equal('ma120' in (compact.stages.found[0]?.technical || {}), false);
  assert.equal('riskAction' in (compact.stages.found[0] || {}), false);
  assert.equal('consecutiveCloses' in (compact.stages.found[0] || {}), false);
  assert.equal(compact.stages.found[0]?.unmetConditions.length, 4);
  // The public HTTP route applies the 40-card transport budget. The immutable
  // snapshot must retain every card so subsequent pages cannot lose matches.
  assert.ok(Buffer.byteLength(JSON.stringify(compact.stages.found.slice(0, 40))) <= 150_000);
});
