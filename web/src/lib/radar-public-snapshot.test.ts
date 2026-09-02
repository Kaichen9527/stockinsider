import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCompactPublicRadarPayload } from './radar-public-snapshot.ts';
import type { CandidateStageCard, RadarDailyPayload } from './types.ts';

function stageCard(index: number): CandidateStageCard {
  return {
    symbol: String(1000 + index), chineseName: `測試公司 ${index}`, market: 'TW', lifecycleStage: 'found',
    latestMentionAt: '2026-09-01T13:30:00+08:00', mentionCount: 2, rawMentionCount: 2,
    effectiveMentionCount: 2, publisherCount: 1, platformCount: 1, dominantPlatformShare: 1,
    sources: Array.from({ length: 2 }, (_, sourceIndex) => ({
      platform: 'telegram', author: null, sourceUrl: `https://t.me/example/${index}-${sourceIndex}`,
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

test('public Radar snapshot uses stages as the canonical stock plane and stays within the response budget', () => {
  const cards = Array.from({ length: 131 }, (_, index) => stageCard(index));
  const payload = {
    asOf: '2026-09-01',
    hotThemes: [], sourceSignals: [{ symbol: '2330' }], connectorStatus: [], reports: [], themeHypotheses: [],
    opportunities: [{ symbol: '2330' }], scenarioUpsideCandidates: [{ symbol: '2330' }],
    earlyWatchlist: [{ symbol: '2330' }], recentFormal7d: [{ symbol: '2330' }],
    fallbackOpportunities90d: [{ symbol: '2330' }], hotTracking: [{ symbol: '2330' }],
    discoveredStocks: [{ symbol: '2330' }],
  } as unknown as RadarDailyPayload;
  const compact = buildCompactPublicRadarPayload(payload, { found: cards, waiting: [], actionable: [] }, {
    observed: 0, qualifying: 0, required: 30, remaining: 30, startedOn: null, latestSession: null, blockers: [],
  });

  assert.equal(compact.stages?.found.length, 131);
  assert.equal(compact.discoveredStocks.length, 0);
  assert.equal(compact.opportunities.length, 0);
  assert.equal(compact.sourceSignals?.length, 1, 'one-release sourceSignals compatibility remains available');
  assert.equal('classificationReplayHash' in (compact.stages?.found[0] || {}), false);
  assert.equal('market' in (compact.stages?.found[0] || {}), false);
  assert.equal('mentionCount' in (compact.stages?.found[0] || {}), false);
  assert.equal('promotionReasons' in (compact.stages?.found[0] || {}), false);
  assert.equal('currentPrice' in (compact.stages?.found[0]?.valuation || {}), false);
  assert.equal(compact.stages?.found[0]?.sources.length, 2);
  assert.equal('mentionedAt' in (compact.stages?.found[0]?.sources[0] || {}), false);
  assert.ok(Buffer.byteLength(JSON.stringify(compact)) <= 150_000);
});
