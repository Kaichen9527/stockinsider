import assert from 'node:assert/strict';
import test from 'node:test';
import type { EarningsBridgeOperand } from './earnings-bridge.ts';
import { buildEarningsScenarioReview, type EarningsScenarioReviewInput } from './earnings-scenario-review.ts';

const period = { symbol: '2454', periodStart: '2027-01-01', periodEnd: '2027-12-31' };
const cutoff = '2026-11-18T13:30:00Z';

function operands(operatingIncome: number, scope = period) {
  const row = (value: number, unit: EarningsBridgeOperand['unit'] = 'TWD'): EarningsBridgeOperand => ({
    ...scope, value, unit, basis: 'model_assumption', knownAt: '2026-11-18T05:00:00Z',
    sourceRef: 'controlled-review-input', sourceSha256: 'a'.repeat(64),
  });
  return {
    operatingIncome: row(operatingIncome),
    netNonoperatingIncome: row(-20),
    incomeTaxExpense: row(180),
    noncontrollingIncome: row(30),
    ordinaryNumeratorAdjustment: { ...row(10), shareBasis: 'diluted' as const },
    weightedAverageShares: { ...row(120, 'shares'), shareBasis: 'diluted' as const },
    peMultiple: row(150000, 'multiple_x10000'),
  };
}

function model(scope = period): EarningsScenarioReviewInput {
  return {
    ...scope, schemaVersion: 'vnext-earnings-scenario-input-v1', periodKind: 'next_four_quarters',
    shareBasis: 'diluted', cutoff,
    cases: { bear: operands(800, scope), base: operands(1000, scope), bull: operands(1200, scope) },
  };
}

test('three horizon-consistent cases are reproducible but still pending review', () => {
  const input = model();
  const result = buildEarningsScenarioReview(input);
  assert.deepEqual(result.scenarioPricesTwd, { bear: '72.50', base: '97.50', bull: '122.50' });
  assert.equal(result.scenarios.base.eps?.denominatorShares, '120');
  assert.deepEqual(result.gaps, []);
  assert.equal(result.reviewState, 'pending');
  assert.match(result.calculationHash, /^[a-f0-9]{64}$/u);
  const same = model();
  same.cases = { bull: same.cases.bull, bear: same.cases.bear, base: same.cases.base };
  assert.equal(buildEarningsScenarioReview(same).calculationHash, result.calculationHash);
  same.cases.bull.operatingIncome!.sourceSha256 = 'b'.repeat(64);
  assert.notEqual(buildEarningsScenarioReview(same).calculationHash, result.calculationHash);
});

test('a partially supported or loss-making case keeps the three-price set unavailable', () => {
  const input = model();
  input.cases.bull.incomeTaxExpense = null;
  input.cases.bear.operatingIncome!.value = 200;
  const result = buildEarningsScenarioReview(input);
  assert.equal(result.scenarioPricesTwd, null);
  assert.equal(result.scenarios.base.valuation?.targetPriceTwd, '97.50');
  assert.equal(result.scenarios.bear.eps?.amount, '-0.166667');
  assert.ok(result.gaps.includes('bear:nonpositive_eps'));
  assert.ok(result.gaps.includes('bull:missing:incomeTaxExpense'));
  assert.ok(result.gaps.includes('bull:earnings_incomplete'));
});

test('price order is checked before rounding can hide an inverted case', () => {
  const input = model();
  input.cases = { bear: operands(1001), base: operands(1000), bull: operands(1200) };
  for (const item of Object.values(input.cases)) item.weightedAverageShares!.value = 1200000;
  const result = buildEarningsScenarioReview(input);
  assert.equal(result.scenarios.bear.valuation?.targetPriceTwd, '0.01');
  assert.equal(result.scenarios.base.valuation?.targetPriceTwd, '0.01');
  assert.equal(result.scenarioPricesTwd, null);
  assert.ok(result.gaps.includes('scenario_prices_unordered'));
});

test('the next wholly future quarter is anchored in Taipei at the cutoff', () => {
  const input = model();
  input.cutoff = '2026-12-31T15:59:59.999999Z';
  assert.notEqual(buildEarningsScenarioReview(input).scenarioPricesTwd, null);
  input.cutoff = '2026-12-31T16:00:00Z';
  const elapsed = buildEarningsScenarioReview(input);
  assert.equal(elapsed.scenarioPricesTwd, null);
  assert.ok(elapsed.gaps.includes('not_next_wholly_future_four_quarters'));
  const deferred = model({ ...period, periodStart: '2027-04-01', periodEnd: '2028-03-31' });
  assert.ok(buildEarningsScenarioReview(deferred).gaps.includes('not_next_wholly_future_four_quarters'));
});

test('quarterly work cannot publish group P/E prices or mix bases across cases', () => {
  const quarter = model({ ...period, periodEnd: '2027-03-31' });
  quarter.periodKind = 'fiscal_quarter';
  const result = buildEarningsScenarioReview(quarter);
  assert.equal(result.scenarios.base.eps?.amount, '6.500000');
  assert.equal(result.scenarioPricesTwd, null);
  assert.ok(result.gaps.includes('base:annual_earnings_period_required'));
  const mixed = model();
  mixed.cases.bull.weightedAverageShares!.shareBasis = 'basic';
  assert.throws(() => buildEarningsScenarioReview(mixed), /operand_invalid:weightedAverageShares/u);
  const partial = model();
  Object.assign(partial, { cases: { base: partial.cases.base } });
  assert.throws(() => buildEarningsScenarioReview(partial), /exact_case_set_required/u);
});
