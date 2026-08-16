import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { runControlledProjectionPerformanceOracle } from './performance-harness.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const require = createRequire(import.meta.url);
const { landingLane, publishCompactRadarProjection, selectLandingSourceSignals } = require(path.join(root, 'scripts/runtime/compact-radar-projection.js'));
const { compactProducerRadarPayload, producerRadarPayloadBytes } = require(path.join(root, 'web/src/lib/radar-producer-payload.js'));

test('compact radar projection is bounded and has deterministic cache identity', () => {
  const decisions = Array.from({ length: 60 }, (_, index) => ({
    symbol: String(7000 + index), claimId: `claim-${index}`, action: 'valuation_review', researchMaturity: 'source_signal',
    sourceKey:'mops',sourceName:'公開資訊觀測站',sourceUrl:'https://mops.twse.com.tw/mops/web/index',
    claimAsOf:'2026-08-01T00:00:00Z',sourceCollectedAt:'2026-08-01T00:00:00Z',
    decisionBrief:{thesis:['來源訊號可追溯。','本次評估已記錄。','決策 revision 已固定。'],
      risks:['估值資料待補。','技術資料待補。','過期時停用動作。'],evidence:[
        {point:'thesis:0',refs:[`claim-${index}`]},{point:'thesis:1',refs:[`claim-${index}`]},
        {point:'thesis:2',refs:[`claim-${index}`]},{point:'risk:0',refs:[`claim-${index}`]},
        {point:'risk:1',refs:[`claim-${index}`]},{point:'risk:2',refs:[`claim-${index}`]}]},
    fundamental: { thesis: `${String(7000 + index)} 已有可追溯來源訊號。`, latestChange: '本次重新檢查基本面品質。',
      risks: ['基本面輸入尚待補齊。'], evidenceRefs: [`claim-${index}`], asOf: '2026-08-01T00:00:00Z' },
    technical: { technicalState: 'unavailable' }, valuation: { status: 'valuation_review' },
    changedBecause: [`source-${index}`], lastEvaluatedAt: '2026-08-01T00:00:00Z', analysisGeneratedAt: '2026-08-01T00:00:00Z',
  }));
  const legacyPayload = { generatedAt: '2026-08-01T00:00:00Z', opportunities: [] };
  const first = publishCompactRadarProjection({ decisions, legacyPayload, window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'r' } });
  const second = publishCompactRadarProjection({ decisions, legacyPayload, window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'r' } });
  assert.ok(Buffer.byteLength(JSON.stringify(first.payload)) <= 150000);
  assert.equal(first.etag, second.etag);
  assert.equal(first.payload.opportunities.length, 0);
  assert.equal(first.payload.sourceSignals.length, 12);
  assert.ok(first.payload.sourceSignals.every((card) => !Object.hasOwn(card, 'sourceProvenances')));
  assert.equal(first.storageWindow, 'daily');
  assert.equal(first.projectionKey, `legacy-radar-v3.11:daily:2026-08-01T00:00:00Z:${first.payloadChecksum}`);

  const oversized = 'x'.repeat(4000);
  const card = (index) => ({
    recommendationId: `recommendation-${index}`, symbol: String(8000 + index), name: `stock-${index}`,
    currentPrice: 100 + index, score: 80, confidence: 'medium', action: 'watch',
    rationale: oversized, thesisSummary: oversized, catalystSummary: oversized,
    entryReadinessReasons: [oversized, oversized, oversized, oversized],
    entryDecision: { action: 'wait_trigger', buyZone: oversized, stopLoss: oversized, invalidation: oversized,
      buyNowAllowed: false, indicatorStack: { oversized } },
    tradeDecision: { action: 'wait_trigger', entryZone: oversized, stopLoss: oversized, takeProfit: oversized,
      confidence: 'medium', entryTriggers: [{ condition: oversized }] },
    marketValuationAdjustment: { summary: oversized, requiredEvidence: [oversized] },
    revaluationJobSummary: { lastResult: oversized, missingEvidence: [oversized] },
    sourceSignalSummary: oversized, ignoredNestedPayload: { oversized },
  });
  const producerInput = compactProducerRadarPayload({
    generatedAt: '2026-08-01T00:00:00Z', opportunities: [card(0)],
    earlyWatchlist: Array.from({ length: 12 }, (_, index) => card(index + 1)),
    hotTracking: Array.from({ length: 4 }, (_, index) => card(index + 20)),
    partiallyVerified: [card(30)],
    sourceHealthSummary: { successfulSources: 10, degradedSources: 2, connectorDetails: oversized },
    connectorStatus: Array.from({ length: 13 }, (_, index) => ({ connector: `source-${index}`,
      lastRunStatus: 'success', lastErrorSummary: oversized, metadata: oversized })),
    hotThemes: Array.from({ length: 12 }, (_, index) => ({ themeKey: `theme-${index}`,
      themeName: oversized, relatedSymbols: ['2330', '2454'], sourceCoverage: [oversized], ignored: oversized })),
  });
  assert.ok(producerRadarPayloadBytes(producerInput) < 110000);
  assert.equal(producerInput.sourceHealthSummary.connectorDetails, undefined);
  assert.equal(producerInput.earlyWatchlist[0].ignoredNestedPayload, undefined);
  assert.equal(producerInput.earlyWatchlist[0].entryDecision.action, 'wait_trigger');
  const producerProjection = publishCompactRadarProjection({ decisions: [], legacyPayload: producerInput,
    window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'bootstrap' } });
  assert.ok(Buffer.byteLength(JSON.stringify(producerProjection.payload)) <= 150000);
  const combinedProjection = publishCompactRadarProjection({ decisions, legacyPayload: producerInput,
    window: 'daily', asOf: '2026-08-01T00:00:00Z', producerIdentity: { runId: 'production-shaped' } });
  assert.ok(Buffer.byteLength(JSON.stringify(combinedProjection.payload)) <= 150000);
  assert.ok(combinedProjection.payload.sourceSignals.length > 0);
  assert.ok(combinedProjection.payload.sourceSignals.length <= 12);
  for (const route of ['daily', 'hot', 'weekly']) {
    const routeSource = readFileSync(path.join(root, `web/src/app/api/radar/${route}/route.ts`), 'utf8');
    assert.match(routeSource, /producerRead[\s\S]*compactProducerRadarPayload/u);
  }
});

test('compact radar reader remains a projection-only indexed LIMIT 2 read', () => {
  const source = readFileSync(path.join(root, 'web/src/lib/opportunity-v3/compact-radar-read.ts'), 'utf8');
  assert.match(source, /legacy_radar_projections_v3_11/u);
  assert.match(source, /\.limit\(2\)/u);
  assert.doesNotMatch(source, /runAuthSourceWorker|executeSourceRunTransaction|provider|deepResearch/u);
});

test('Landing lane selection applies the exact 6/12/12 caps across mixed actions', () => {
  const cards = [
    ...Array.from({ length: 8 }, (_, index) => ({ symbol:`a${index}`,decisionEnvelope:{userAction:'buy'} })),
    ...Array.from({ length: 10 }, (_, index) => ({ symbol:`w${index}`,decisionEnvelope:{userAction:'wait_breakout'} })),
    ...Array.from({ length: 10 }, (_, index) => ({ symbol:`v${index}`,decisionEnvelope:{userAction:'avoid'} })),
    ...Array.from({ length: 16 }, (_, index) => ({ symbol:`r${index}`,decisionEnvelope:{userAction:'unavailable'} })),
  ];
  const selected=selectLandingSourceSignals(cards);
  const counts=selected.reduce((result,card)=>{
    const lane=landingLane(card);result[lane]=(result[lane]??0)+1;return result;
  },{});
  assert.deepEqual(counts,{actionable:6,waiting:12,research:12});
  assert.equal(selected.filter((card)=>card.decisionEnvelope.userAction==='avoid').length,2,
    'avoid shares the waiting cap instead of leaking through the research lane');
});

test('controlled performance oracle reserves its PostgreSQL port and short socket directory', () => {
  const source = readFileSync(path.join(root, 'scripts/opportunity-v3/performance-harness.mjs'), 'utf8');
  assert.match(source, /const port = await reservePort\(\);/u);
  assert.doesNotMatch(source, /57000 \+ \(process\.pid % 5000\)/u);
  assert.match(source, /mkdtempSync\('\/tmp\/stockinsider-pcr022-'\)/u);
  assert.doesNotMatch(source, /mkdtempSync\(path\.join\(os\.tmpdir\(\), 'stockinsider-pcr022-'\)\)/u);
});

test('PCR-022 runs the controlled production/PostgreSQL projection performance oracle', async () => {
  await runControlledProjectionPerformanceOracle({ root });
});
