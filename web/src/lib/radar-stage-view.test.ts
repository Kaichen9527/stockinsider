import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CANDIDATE_STAGE_FILTERS, candidateStageFilterOptions, filterAndSortCandidateStages } from './radar-stage-view.ts';
import type { CandidateStageCard } from './types.ts';

function card(symbol: string, input: Partial<CandidateStageCard> = {}): CandidateStageCard {
  return {
    symbol, chineseName: `公司${symbol}`, sector: '半導體', market: 'TW', lifecycleStage: 'found',
    latestMentionAt: `2026-09-${symbol.slice(-2)}T01:00:00Z`, mentionCount: 1, rawMentionCount: 1, effectiveMentionCount: 1,
    publisherCount: 1, positivePublisherCount: 0, negativePublisherCount: 0, generalPublisherCount: 1, platformCount: 1,
    dominantPlatformShare: 1, sources: [{ platform: 'ptt', sourceName: 'PTT', publisherName: '作者', author: '作者', sourceUrl: `https://example.com/${symbol}`, stance: 'neutral', mentionedAt: '2026-09-01T01:00:00Z' }],
    scores: { discovery: 10, research: 20, actionability: 30, dataConfidence: 40 },
    valuation: { status: 'missing', currentPrice: null, bearTarget: null, baseTarget: null, bullTarget: null, probabilityWeightedTarget: null, baseUpsidePct: null, bearDownsidePct: null, rewardRiskRatio: null, method: null },
    technical: { sessionDate: null, close: null, ma20: null, ma60: null, ma120: null, ma240: null, rsi14: null, volumeRatio20Median: null, marketRegime: 'unknown', hardGatePassed: false },
    consecutiveCloses: { passed: 0, required: 2, technicalSessionDate: null }, classificationReplayHash: null,
    unmetConditions: [], promotionReasons: [], dataAsOf: null, stale: false, detailRevisionId: null, riskAction: null, detailHref: `/stock/${symbol}`,
    ...input,
  };
}

test('filters the complete stage snapshot by query, sector, source, signal and local watchlist', () => {
  const all = [
    card('2330', { chineseName: '台積電', positivePublisherCount: 2, sources: [{ platform: 'telegram', sourceName: '頻道', publisherName: null, author: null, sourceUrl: 'https://example.com/t', stance: 'positive', mentionedAt: '2026-09-09T01:00:00Z' }] }),
    card('2303', { chineseName: '聯電', negativePublisherCount: 1, sector: '晶圓代工' }),
    card('2881', { chineseName: '富邦金', sector: '金融', valuation: { ...card('1').valuation, status: 'complete', baseUpsidePct: 12 } }),
  ];
  assert.deepEqual(filterAndSortCandidateStages(all, { ...DEFAULT_CANDIDATE_STAGE_FILTERS, query: '台積' }).map((item) => item.symbol), ['2330']);
  assert.deepEqual(filterAndSortCandidateStages(all, { ...DEFAULT_CANDIDATE_STAGE_FILTERS, source: 'telegram' }).map((item) => item.symbol), ['2330']);
  assert.deepEqual(filterAndSortCandidateStages(all, { ...DEFAULT_CANDIDATE_STAGE_FILTERS, signal: 'negative' }).map((item) => item.symbol), ['2303']);
  assert.deepEqual(filterAndSortCandidateStages(all, { ...DEFAULT_CANDIDATE_STAGE_FILTERS, watchedOnly: true }, new Set(['2881'])).map((item) => item.symbol), ['2881']);
  assert.deepEqual(candidateStageFilterOptions(all).sectors, ['半導體', '金融', '晶圓代工']);
});

test('sorts by valuation upside without treating missing values as zero', () => {
  const all = [card('1001'), card('1002', { valuation: { ...card('1').valuation, baseUpsidePct: -3 } }), card('1003', { valuation: { ...card('1').valuation, baseUpsidePct: 18 } })];
  assert.deepEqual(filterAndSortCandidateStages(all, { ...DEFAULT_CANDIDATE_STAGE_FILTERS, sort: 'upside' }).map((item) => item.symbol), ['1003', '1002', '1001']);
});
