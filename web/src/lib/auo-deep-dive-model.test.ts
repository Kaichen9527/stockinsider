import assert from 'node:assert/strict';
import test from 'node:test';
import priceHistory from '../data/auo-price-history-v1.json' with { type: 'json' };
import pbHistory from '../data/auo-pb-history-v1.json' with { type: 'json' };
import {
  AUO_COMMON_EQUITY_MILLION,
  AUO_DILUTED_SHARES_MILLION,
  AUO_ENDING_COMMON_SHARES_MILLION,
  AUO_AS_OF,
  AUO_PRICE,
  auoAnnouncedAssetDisposals,
  auoAssetDisposalSensitivity,
  auoArticleSections,
  auoMarketContext,
  auoForecastBaseQuarters,
  auoScenarioAdjustments,
} from './auo-deep-dive-v1.ts';
import {
  buildEntryPlan,
  buildForecastScenario,
  calculateCommercializationBridge,
  calculateForwardPe,
  calculateQuarter,
  calculateRelativePerformance,
  calculateTechnicalSnapshot,
  classifyResearchVerdict,
  combineActualAndForecastYear,
  historicalPbQuartiles,
  evaluateFrozenBreakoutSetup,
  discountedFutureValue,
  requiredFutureEps,
  reverseCommercializationRevenue,
  requiredEarningsAtMultiple,
  validateResearchInputs,
  type PriceBar,
} from './auo-deep-dive-model.ts';

test('segment rows add back to consolidated revenue and operating profit', () => {
  const row = calculateQuarter(auoForecastBaseQuarters[0], AUO_DILUTED_SHARES_MILLION);
  assert.equal(row.revenue, Object.values(row.segments).reduce((sum, segment) => sum + segment.revenue, 0));
  assert.equal(row.operatingIncome, Math.round(Object.values(row.segments)
    .reduce((sum, segment) => sum + segment.revenue * segment.operatingMargin, 0)
    + row.corporateAndOtherOperatingIncome));
  assert.equal(row.reportedEps, row.normalizedEps, 'future one-offs default to zero');
});

test('announced asset gains stay conditional and separate from normalized operating EPS', () => {
  assert.deepEqual(auoAnnouncedAssetDisposals.map((transaction) => transaction.expectedGainAfterEstimatedCostsAndTaxMillion), [13_390, 4_280]);
  assert.equal(auoAssetDisposalSensitivity.expectedGainMillion, 17_670);
  assert.equal(Number(auoAssetDisposalSensitivity.perShareIfFullyAttributable.toFixed(2)), 2.34);
  assert.equal(auoAssetDisposalSensitivity.recognitionYear, null);
  assert.equal(auoAssetDisposalSensitivity.attributableShare, null);
  const valuation = auoArticleSections.find((section) => section.id === 'valuation');
  assert.ok(valuation?.paragraphs.some((paragraph) => paragraph.text.includes('不是 2027 年預測')
    && paragraph.sources.join(',').includes('S34') && paragraph.sources.join(',').includes('S35')));
  assert.equal(auoForecastBaseQuarters.every((quarter) => quarter.oneOffAfterTax === 0), true);
});

test('AUO P/B anchors are recalculated from 60 point-in-time TWSE monthly observations', () => {
  const result = historicalPbQuartiles(pbHistory, '2026-09-18');
  assert.equal(result.rows.length, 60);
  assert.deepEqual({ p25: result.p25, p50: result.p50, p75: result.p75, max: result.max }, { p25: 0.7, p50: 0.77, p75: 0.85, max: 1.65 });
  assert.throws(() => historicalPbQuartiles(pbHistory.slice(0, 47), '2026-09-18'), /evidence_incomplete/u);
});

test('bear base and bull cases preserve ordered 2027 earnings and valuation', () => {
  const rows = Object.entries(auoScenarioAdjustments).map(([id, adjustment]) => buildForecastScenario({
    id,
    baseQuarters: auoForecastBaseQuarters,
    adjustment,
    dilutedSharesMillion: AUO_DILUTED_SHARES_MILLION,
    startingCommonEquityMillion: AUO_COMMON_EQUITY_MILLION,
    endingCommonSharesMillion: AUO_ENDING_COMMON_SHARES_MILLION,
    forwardQuarterCount: 5,
    valuationYear: 2027,
  }));
  const eps = rows.map((row) => row.annual.find((annual) => annual.year === 2027)!.normalizedEps);
  assert.ok(eps[0] < eps[1] && eps[1] < eps[2]);
  assert.equal(rows[0].valuation.peValue, null, 'negative or near-break-even bear EPS cannot use P/E');
  assert.equal(rows[1].valuation.referenceValue, rows[1].valuation.peValue, 'usable normalized earnings drive the scenario value');
  assert.equal(rows[2].valuation.referenceValue, rows[2].valuation.peValue, 'P/B remains a separate asset cross-check');
  assert.ok((rows[1].valuation.peValue ?? 0) < (rows[2].valuation.peValue ?? 0));
  assert.ok(rows[0].valuation.forwardBvps < rows[1].valuation.forwardBvps);
  assert.ok(rows[1].valuation.forwardBvps < rows[2].valuation.forwardBvps);
  assert.equal(rows.every((row) => row.valuation.projectedDividends === 0
    && row.valuation.projectedCapitalAndOci === 0), true);
});

test('P/E fails closed for negative and near-zero EPS', () => {
  assert.equal(calculateForwardPe(30, -0.5), null);
  assert.equal(calculateForwardPe(30, 0.1), null);
  assert.equal(calculateForwardPe(30, 1.5), 20);
});

test('reverse valuation reconciles EPS, net income and margin', () => {
  const result = requiredEarningsAtMultiple(30.35, 20, 7_547, 283_000);
  assert.deepEqual(result, { eps: 1.52, netIncome: 11_453, netMargin: 0.0405 });
});

test('2026 annual view combines published H1 with scenario H2 without mixing EPS denominators', () => {
  const result = combineActualAndForecastYear({
    actual: { revenue: 139_922, operatingIncome: -418, normalizedNetIncome: -450, reportedNetIncome: 199 },
    forecast: { revenue: 138_100, operatingIncome: 1_500, normalizedNetIncome: 800, reportedNetIncome: 800 },
    dilutedSharesMillion: 7_547,
  });
  assert.deepEqual(result, {
    revenue: 278_022,
    operatingIncome: 1_082,
    normalizedNetIncome: 350,
    reportedNetIncome: 999,
    normalizedEps: 0.05,
    reportedEps: 0.13,
  });
});

test('official daily history reproduces the page indicators and calculated entry levels', () => {
  const pointInTimeBars = (priceHistory as PriceBar[]).filter((bar) => bar.date <= '115/09/18');
  const snapshot = calculateTechnicalSnapshot(
    pointInTimeBars,
    new Date('2026-09-19T00:00:00+08:00'),
  );
  assert.ok(snapshot);
  assert.deepEqual({ close: snapshot.close, ma20: snapshot.ma20, ma60: snapshot.ma60, ma240: snapshot.ma240 }, {
    close: 30.35, ma20: 27.84, ma60: 27.17, ma240: 18.87,
  });
  assert.equal(snapshot.atr14, 1.59);
  assert.equal(snapshot.stale, false);
  const plan = buildEntryPlan(snapshot);
  assert.equal(plan.status, 'wait');
  assert.equal(plan.breakout.trigger, 32.2);
  assert.ok((plan.pullback.invalidation ?? 0) < (plan.pullback.lower ?? 0));
});

test('latest official session binds the article price, market comparison and reverse EPS', () => {
  const latest = (priceHistory as PriceBar[]).at(-1);
  assert.ok(latest);
  assert.deepEqual(latest, {
    date: '115/09/24', volume: 542_503_236, turnover: 18_709_123_996,
    open: 34.75, high: 35.95, low: 33.75, close: 34.2,
  });
  assert.equal(AUO_AS_OF, '2026-09-24');
  assert.equal(AUO_PRICE, latest.close);
  assert.equal(auoMarketContext.latest.stockClose, latest.close);
  assert.equal(auoMarketContext.latest.indexClose, 48_024.60);
  assert.equal(requiredEarningsAtMultiple(AUO_PRICE, 20, AUO_DILUTED_SHARES_MILLION, 283_000).eps, 1.71);
});

test('stale technical data disables all executable price levels', () => {
  const snapshot = calculateTechnicalSnapshot(
    priceHistory as PriceBar[],
    new Date('2026-10-01T00:00:00+08:00'),
  );
  assert.equal(snapshot?.stale, true);
  assert.deepEqual(buildEntryPlan(snapshot), {
    status: 'invalid',
    pullback: { lower: null, upper: null, invalidation: null, firstTarget: null, secondTarget: null, rewardRisk: null },
    breakout: { trigger: null, minimumVolume: null, invalidation: null, firstTarget: null, secondTarget: null, rewardRisk: null },
  });
});

test('missing segments and conflicting sources remain visible as research blockers', () => {
  const snapshot = calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date('2026-09-24T18:00:00+08:00'));
  assert.deepEqual(validateResearchInputs({ segmentDataAvailable: false, sourceConflictCount: 2, technical: snapshot }), {
    complete: false,
    warnings: ['segment_data_missing', 'source_conflicts_require_review'],
  });
});

test('expensive valuation and bullish price trend produce separate conclusions', () => {
  const historicalBars = (priceHistory as PriceBar[]).filter((bar) => bar.date <= '115/09/23');
  const snapshot = calculateTechnicalSnapshot(historicalBars, new Date('2026-09-23T18:00:00+08:00'));
  assert.deepEqual(classifyResearchVerdict({ price: 34.70, baseReferenceValue: 20, technical: snapshot }), {
    mediumTerm: 'low_attractiveness',
    shortTerm: 'bullish_wait_for_trigger',
  });
});

test('frozen September breakout advances without moving its published thresholds', () => {
  const evaluated = evaluateFrozenBreakoutSetup(priceHistory as PriceBar[], {
    publishedAt: '115/09/18', trigger: 32.2, minimumVolume: 500_000_000,
    invalidation: 28.4, target: 36.6, expiresAfterTradingSessions: 20,
  });
  assert.deepEqual({ status: evaluated.status, triggerDate: evaluated.triggerDate, terminalDate: evaluated.terminalDate }, {
    status: 'target_reached', triggerDate: '115/09/21', terminalDate: '115/09/22',
  });
  assert.equal(evaluated.trigger, 32.2);
  assert.equal(evaluated.target, 36.6);
});

test('transformation sensitivity is explicit and reversible', () => {
  assert.equal(discountedFutureValue(2, 20, 2.25, 0.12), 31);
  assert.equal(requiredFutureEps(34.70, 20, 2.25, 0.12), 2.24);
  assert.equal(discountedFutureValue(-1, 20, 2, 0.12), null);
});

test('commercialization stays unpriced without volume, price and ownership evidence', () => {
  assert.deepEqual(calculateCommercializationBridge({
    shippedCapacityUnits: null, utilization: null, yieldRate: null, averageSellingPriceMillion: null,
    grossMargin: null, incrementalOpexMillion: null, depreciationMillion: null,
    taxRate: 0.2, attributableShare: null, intercompanyRevenueMillion: null, dilutedSharesMillion: 7_547,
  }), { status: 'incomplete', missing: [
    'shippedCapacityUnits', 'utilization', 'yieldRate', 'averageSellingPriceMillion',
    'grossMargin', 'incrementalOpexMillion', 'depreciationMillion', 'attributableShare',
    'intercompanyRevenueMillion',
  ] });
});

test('conditional production bridge eliminates intercompany sales and non-controlling interest', () => {
  const result = calculateCommercializationBridge({
    shippedCapacityUnits: 1_000, utilization: 0.8, yieldRate: 0.75, averageSellingPriceMillion: 2,
    grossMargin: 0.3, incrementalOpexMillion: 80, depreciationMillion: 100,
    taxRate: 0.2, attributableShare: 0.7, intercompanyRevenueMillion: 200, dilutedSharesMillion: 7_547,
  });
  assert.deepEqual(result, {
    status: 'modeled', saleableUnits: 600, grossRevenueMillion: 1_200,
    consolidatedRevenueMillion: 1_000, operatingIncomeMillion: 120,
    commonNetIncomeMillion: 67, incrementalEps: 0.01,
  });
  assert.throws(() => calculateCommercializationBridge({
    shippedCapacityUnits: 1, utilization: 1, yieldRate: 1, averageSellingPriceMillion: 1,
    grossMargin: 0.3, incrementalOpexMillion: 0, depreciationMillion: 0,
    taxRate: 0.2, attributableShare: 1, intercompanyRevenueMillion: 2, dilutedSharesMillion: 7_547,
  }), /intercompany_revenue_exceeds_gross/u);
});

test('reverse commercialization is a revenue threshold, not a forecast', () => {
  assert.deepEqual(reverseCommercializationRevenue({
    price: 34.70, multiple: 20, existingEps: 0.62,
    dilutedSharesMillion: 7_547, afterTaxAttributableMargin: 0.1,
  }), { requiredEps: 1.74, incrementalEps: 1.12,
    incrementalCommonProfitMillion: 8_415, incrementalRevenueMillion: 84_149 });
});

test('frozen setup keeps the first terminal event when price later breaks invalidation', () => {
  const setup = { publishedAt: '115/09/18', trigger: 32.2, minimumVolume: 500,
    invalidation: 28.4, target: 36.6, expiresAfterTradingSessions: 20 };
  const bars: PriceBar[] = [
    { date: '115/09/19', open: 32, high: 33, low: 31, close: 33, volume: 600 },
    { date: '115/09/20', open: 34, high: 37, low: 33, close: 36, volume: 600 },
    { date: '115/09/21', open: 29, high: 30, low: 27, close: 28, volume: 600 },
  ];
  assert.deepEqual({ status: evaluateFrozenBreakoutSetup(bars, setup).status,
    terminalDate: evaluateFrozenBreakoutSetup(bars, setup).terminalDate },
  { status: 'target_reached', terminalDate: '115/09/20' });
  assert.equal(evaluateFrozenBreakoutSetup(bars.map((bar) => ({ ...bar, high: Math.min(bar.high, 36) })), setup).status, 'failed');
});

test('freshness uses completed Taiwan sessions and the official 2026 holiday calendar', () => {
  const bars = priceHistory as PriceBar[];
  const throughWednesday = bars.filter((bar) => bar.date <= '115/09/23');
  assert.equal(calculateTechnicalSnapshot(throughWednesday, new Date('2026-09-24T08:00:00+08:00'))?.stale, false,
    'next session has not completed before the open');
  assert.equal(calculateTechnicalSnapshot(throughWednesday, new Date('2026-09-24T18:00:00+08:00'), 0)?.stale, true,
    'missing completed Thursday is visible with zero grace');
  assert.equal(calculateTechnicalSnapshot(bars, new Date('2026-09-25T18:00:00+08:00'), 0)?.stale, false,
    'the completed Thursday remains current during Friday holiday');
  assert.equal(calculateTechnicalSnapshot(bars, new Date('2026-09-28T18:00:00+08:00'), 1)?.stale, false,
    'Friday and Monday were exchange holidays, not missing sessions');
  assert.equal(calculateTechnicalSnapshot(bars, new Date('2027-01-04T18:00:00+08:00'))?.stale, true,
    'unknown next-year calendar fails closed');
});

test('official index and stock closes produce point-in-time relative performance', () => {
  assert.deepEqual(calculateRelativePerformance({ stockStart: 30.35, stockEnd: AUO_PRICE,
    indexStart: 47_180.75, indexEnd: 48_024.60 }), {
    stockReturnPercent: 12.69, indexReturnPercent: 1.79, relativePoints: 10.9,
  });
  assert.equal(calculateRelativePerformance({ stockStart: 0, stockEnd: 34.7,
    indexStart: 47_180.75, indexEnd: 48_157.29 }), null);
});
