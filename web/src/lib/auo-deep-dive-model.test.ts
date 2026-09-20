import assert from 'node:assert/strict';
import test from 'node:test';
import priceHistory from '../data/auo-price-history-v1.json' with { type: 'json' };
import pbHistory from '../data/auo-pb-history-v1.json' with { type: 'json' };
import {
  AUO_COMMON_EQUITY_MILLION,
  AUO_DILUTED_SHARES_MILLION,
  AUO_ENDING_COMMON_SHARES_MILLION,
  AUO_PRICE,
  auoForecastBaseQuarters,
  auoScenarioAdjustments,
} from './auo-deep-dive-v1.ts';
import {
  buildEntryPlan,
  buildForecastScenario,
  calculateForwardPe,
  calculateQuarter,
  calculateTechnicalSnapshot,
  classifyResearchVerdict,
  combineActualAndForecastYear,
  historicalPbQuartiles,
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

test('AUO P/B anchors are recalculated from 60 point-in-time TWSE monthly observations', () => {
  const result = historicalPbQuartiles(pbHistory, '2026-09-18');
  assert.equal(result.rows.length, 60);
  assert.deepEqual({ p25: result.p25, p50: result.p50, p75: result.p75 }, { p25: 0.7, p50: 0.77, p75: 0.85 });
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
  assert.ok(rows[0].valuation.referenceValue < rows[1].valuation.referenceValue);
  assert.ok(rows[1].valuation.referenceValue < rows[2].valuation.referenceValue);
  assert.equal(rows[0].valuation.peValue, null, 'negative or near-break-even bear EPS cannot use P/E');
  assert.equal(rows[1].valuation.referenceValue, rows[1].valuation.pbValue, 'P/E is a cross-check, not a hidden blend');
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
  const snapshot = calculateTechnicalSnapshot(
    priceHistory as PriceBar[],
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
  const snapshot = calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date('2026-09-19T00:00:00+08:00'));
  assert.deepEqual(validateResearchInputs({ segmentDataAvailable: false, sourceConflictCount: 2, technical: snapshot }), {
    complete: false,
    warnings: ['segment_data_missing', 'source_conflicts_require_review'],
  });
});

test('expensive valuation and bullish price trend produce separate conclusions', () => {
  const snapshot = calculateTechnicalSnapshot(priceHistory as PriceBar[], new Date('2026-09-19T00:00:00+08:00'));
  assert.deepEqual(classifyResearchVerdict({ price: AUO_PRICE, baseReferenceValue: 20, technical: snapshot }), {
    mediumTerm: 'low_attractiveness',
    shortTerm: 'bullish_wait_for_trigger',
  });
});
