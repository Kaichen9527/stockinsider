import assert from 'node:assert/strict';
import test from 'node:test';
import { latestMonthlyPositiveValues } from './candidate-research-policy.ts';

test('valuation histories keep only the latest positive observation per month', () => {
  assert.deepEqual(latestMonthlyPositiveValues([
    { date: '2026-01-05', value: 0.7 }, { date: '2026-01-28', value: 0.9 },
    { date: '2026-02-27', value: 0.8 }, { date: '2026-02-28', value: null },
    { date: 'bad', value: 4 }, { date: '2026-03-31', value: -1 },
  ]), [
    { date: '2026-01-28', value: 0.9 }, { date: '2026-02-27', value: 0.8 },
  ]);
});
