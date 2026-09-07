import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialPbRoeInputs, buildNormalizedCycleEarnings } from './candidate-financial-normalization.ts';

function period(index: number) {
  const year = 2021 + Math.floor(index / 4);
  return `${year}-${['03-31', '06-30', '09-30', '12-31'][index % 4]}`;
}

test('normalized cycle requires twenty adjacent reconciled discrete quarters', () => {
  const complete = buildNormalizedCycleEarnings(Array.from({ length: 20 }, (_, index) => ({ periodEnd: period(index), dilutedEps: index % 4 + 1, factIds: [`eps-${index}`] })));
  assert.equal(complete.status, 'complete');
  if (complete.status === 'complete') {
    assert.equal(complete.normalizedAnnualEps, 10);
    assert.equal(complete.cycleYearsObserved, 5);
    assert.equal(complete.factIds.length, 20);
  }
  const gapped = buildNormalizedCycleEarnings(Array.from({ length: 20 }, (_, index) => ({ periodEnd: period(index + (index >= 8 ? 1 : 0)), dilutedEps: 1 })));
  assert.deepEqual(gapped, { status: 'insufficient', reason: 'twenty_consecutive_discrete_quarters_required' });
});

test('financial PB/ROE uses common income and same-period average common equity', () => {
  const result = buildFinancialPbRoeInputs(Array.from({ length: 8 }, (_, index) => ({
    periodEnd: period(index + 12), commonNetIncome: 10, beginningCommonEquity: 100, endingCommonEquity: 120,
    commonSharesOutstanding: 10, factIds: [`financial-${index}`],
  })));
  assert.equal(result.status, 'complete');
  if (result.status === 'complete') {
    assert.equal(result.ttmCommonIncome, 40);
    assert.equal(result.averageCommonEquity, 110);
    assert.equal(result.roe, 0.363636);
    assert.equal(result.bookValuePerShare, 12);
  }
});
