import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { buildTwEntryPlans } from './tw-entry-plan.ts';
import { bindCandidateTradePlan, readCandidateTradePlan, readCandidateTradePlanSummary } from './candidate-trade-plan.ts';
import { buildCanonicalStagePlane, compactCandidateStageForSnapshot } from './radar-stage-pagination.ts';
import type { CandidateStageCard } from './types.ts';

function card(index: number): CandidateStageCard {
  const symbol = String(2000 + index);
  const availableAt = '2026-09-22T07:00:00Z';
  const bundle = buildTwEntryPlans({ symbol, candidateRevisionId: 'pending', computedAt: availableAt,
    availableAt, dataAsOf: availableAt, sourceDatasetRevision: 'verified-source-unavailable', bars: [],
    calendar: null, priceBasis: null, liquidityVerified: false,
    formalEligibility: { state: 'blocked', policyVersion: 'existing-policy', reasonCodes: ['requires_two_consecutive_closes', 'negative_overseas_peer_catchdown'] },
  });
  const binding = bindCandidateTradePlan({ session_date: '2026-09-22', available_at: availableAt }, bundle);
  const saved = readCandidateTradePlan(binding.provenance.trade_plan, {
    revisionId: binding.id, symbol, sessionDate: '2026-09-22', availableAt,
  });
  assert.ok(saved);
  const summary = readCandidateTradePlanSummary(binding.provenance.trade_plan_summary, { revisionId: binding.id });
  assert.ok(summary);
  assert.equal(summary.inputHash, saved.inputHash);
  assert.equal(summary.plans[0].rawSignalState, saved.plans[0].rawSignalState);
  return {
    symbol, chineseName: '研究測試公司', market: 'TW', lifecycleStage: 'waiting',
    latestMentionAt: availableAt, mentionCount: 4, rawMentionCount: 4, effectiveMentionCount: 4,
    publisherCount: 4, positivePublisherCount: 2, negativePublisherCount: 1, generalPublisherCount: 1,
    platformCount: 3, dominantPlatformShare: 0.5,
    sources: Array.from({ length: 5 }, (_, i) => ({ platform: 'telegram', sourceName: '公開研究來源',
      publisherName: '研究發布者', author: null, sourceUrl: `https://example.com/research/${index}/${i}`, stance: 'neutral', mentionedAt: availableAt })),
    scores: { discovery: 70, research: 75, actionability: 60, dataConfidence: 80 },
    valuation: { status: 'missing', currentPrice: 50, bearTarget: null, baseTarget: null, bullTarget: null,
      probabilityWeightedTarget: null, baseUpsidePct: null, bearDownsidePct: null, rewardRiskRatio: null, method: null },
    technical: { sessionDate: '2026-09-22', close: 50, ma20: 48, ma60: 45, ma120: 44, ma240: 40,
      rsi14: 55, atr14: 1.5, volumeRatio20Median: 1.8, marketRegime: 'risk_on', hardGatePassed: true },
    consecutiveCloses: { passed: 1, required: 2, technicalSessionDate: '2026-09-22' },
    classificationReplayHash: 'a'.repeat(64), unmetConditions: ['requires_two_consecutive_closes'], promotionReasons: [],
    dataAsOf: availableAt, stale: false, detailRevisionId: binding.id, tradePlanSummary: summary,
    riskAction: { state: 'data_incomplete', reasons: ['research_only'] }, detailHref: `/stock/${symbol}?revision=${binding.id}`,
  };
}

test('P1-06/P1-10: summary preserves the saved revision through compact pagination without embedded OHLCV', () => {
  const original = card(0);
  const compact = compactCandidateStageForSnapshot(original);
  assert.deepEqual(compact.tradePlanSummary, original.tradePlanSummary);
  assert.equal(JSON.stringify(compact).includes('ohlcv'), false);
  assert.equal(JSON.stringify(compact).includes('sourceDatasetRevision'), false);
  const wrong = compactCandidateStageForSnapshot({ ...original, detailRevisionId: 'another-revision' });
  assert.equal(wrong.tradePlanSummary, undefined);
  const stale = compactCandidateStageForSnapshot({ ...original, stale: true });
  assert.equal(stale.stale, true);
  assert.deepEqual(stale.tradePlanSummary, original.tradePlanSummary, 'view staleness never rewrites historical signal');
});

test('P1-10: representative 40-card Radar and 24-per-stage home transports retain existing budgets', () => {
  const cards = Array.from({ length: 40 }, (_, index) => card(index));
  const compact = buildCanonicalStagePlane({ found: cards.map((row) => ({ ...row, lifecycleStage: 'found' })), waiting: cards, actionable: [] });
  const radarBytes = Buffer.byteLength(JSON.stringify(compact.stages.waiting));
  const homeBytes = Buffer.byteLength(JSON.stringify({ found: compact.stages.found.slice(0, 24), waiting: compact.stages.waiting.slice(0, 24), actionable: compact.stages.waiting.slice(0, 24) }));
  assert.ok(radarBytes <= 150_000, `${radarBytes} Radar bytes`);
  assert.ok(homeBytes <= 200_000, `${homeBytes} home card-plane bytes`);
  console.log(JSON.stringify({ fixtureRadarCardBytes: radarBytes, fixtureHomeCardBytes: homeBytes }));
});

test('P1-06: detail reader and public summary transport cannot recalculate or write a plan', () => {
  const detail = readFileSync(new URL('./candidate-detail.ts', import.meta.url), 'utf8');
  assert.match(detail, /readCandidateTradePlan\(/);
  assert.doesNotMatch(detail, /buildTwEntryPlans|loadTwEntryPlanAuthority|\.insert\(|\.upsert\(|\.update\(/);
  const route = readFileSync(new URL('../app/api/radar/daily/route.ts', import.meta.url), 'utf8');
  assert.match(route, /tradePlanSummary: readCandidateTradePlanSummary\(/);
});
