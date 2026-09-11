import test from 'node:test';
import assert from 'node:assert/strict';
import { DILUTED_EPS_RECONCILIATION_VERSION, reconcileDilutedEpsToCommonIncome } from './financial-eps-reconciliation.ts';

test('v1 freezes two-decimal EPS rounding at a half cent per diluted share', () => {
  assert.equal(DILUTED_EPS_RECONCILIATION_VERSION, 'diluted-eps-common-income-v1');
  for (const sign of [-1, 1]) {
    const edge = { dilutedEps: 0.1, dilutedShares: 100_000_000, commonNetIncome: 10_000_000 + sign * 500_000 };
    assert.equal(reconcileDilutedEpsToCommonIncome(edge).tolerance, 500_000);
    assert.equal(reconcileDilutedEpsToCommonIncome(edge).reconciled, true);
    assert.equal(reconcileDilutedEpsToCommonIncome({ ...edge, commonNetIncome: edge.commonNetIncome + sign }).reconciled, false);
  }
});

test('v1 preserves the TWD 2,000 and 0.5% monetary tolerances at their exact boundaries', () => {
  const floor = { dilutedEps: 5, dilutedShares: 10_000, commonNetIncome: 52_000 };
  assert.equal(reconcileDilutedEpsToCommonIncome(floor).tolerance, 2_000);
  assert.equal(reconcileDilutedEpsToCommonIncome(floor).reconciled, true);
  assert.equal(reconcileDilutedEpsToCommonIncome({ ...floor, commonNetIncome: 52_000.01 }).reconciled, false);
  const percentage = { dilutedEps: 100.5, dilutedShares: 1_000_000, commonNetIncome: 100_000_000 };
  assert.equal(reconcileDilutedEpsToCommonIncome(percentage).tolerance, 500_000);
  assert.equal(reconcileDilutedEpsToCommonIncome(percentage).reconciled, true);
  assert.equal(reconcileDilutedEpsToCommonIncome({ ...percentage, dilutedEps: 100.500001 }).reconciled, false);
});

test('non-finite, overflow, zero and negative diluted denominators cannot reconcile', () => {
  const valid = { dilutedEps: 1, dilutedShares: 100_000_000, commonNetIncome: 100_000_000 };
  for (const value of [NaN, Infinity, -Infinity]) {
    for (const key of ['dilutedEps', 'dilutedShares', 'commonNetIncome']) {
      assert.equal(reconcileDilutedEpsToCommonIncome({ ...valid, [key]: value }).reconciled, false);
    }
  }
  for (const dilutedShares of [0, -100]) assert.equal(reconcileDilutedEpsToCommonIncome({ ...valid, dilutedShares }).reconciled, false);
  assert.equal(reconcileDilutedEpsToCommonIncome({ dilutedEps: Number.MAX_VALUE, dilutedShares: Number.MAX_VALUE, commonNetIncome: 1 }).reconciled, false);
  assert.equal(reconcileDilutedEpsToCommonIncome({ ...valid, dilutedEps: -1, commonNetIncome: -100_000_000 }).reconciled, true);
});
