import assert from 'node:assert/strict';
import test from 'node:test';
import { researchLiquidityCapacity } from './research-execution-context.ts';
const sessions = Array.from({ length: 20 }, (_, i) =>
  new Date(Date.UTC(2026, 8, i + 1)).toISOString().slice(0, 10));
const rows = sessions.map((session) => ({ session, rawLow: 10, volumeShares: 1_000_000 }));
test('official low times shares admits only conservative whole lots and complete windows', () => {
  assert.equal(researchLiquidityCapacity(rows, sessions, 31).maximumShares, 3000);
  assert.equal(researchLiquidityCapacity(rows, sessions, 31).verified, true);
  for (const changed of [rows.slice(1), [...rows.slice(1), rows[1]],
    rows.map((row) => ({ ...row, volumeShares: 0 }))])
    assert.equal(researchLiquidityCapacity(changed, sessions, 31).verified, false);
  assert.equal(researchLiquidityCapacity(rows, sessions, NaN).verified, false);
});
