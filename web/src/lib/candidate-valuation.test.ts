import assert from 'node:assert/strict';
import test from 'node:test';
import { buildFinancialPbRoeScenario } from './candidate-valuation.ts';

test('financial PB/ROE scenario remains labelled as PB/ROE rather than forward PE', () => {
  const scenario = buildFinancialPbRoeScenario({
    price: 10,
    bookValuePerShare: 10,
    roe: 0.12,
    historicalPbRatios: Array.from({ length: 48 }, (_, index) => 1.4 + index / 100),
  });
  assert.ok(scenario);
  assert.equal(scenario?.primaryMethod, 'financial_pb_roe');
  assert.equal(scenario?.operatingDriverSource, 'average_common_equity_roe_and_bvps');
  assert.equal(scenario?.rewardRiskRatio, null, 'a non-downside bear case must not imply infinite RR');
});
