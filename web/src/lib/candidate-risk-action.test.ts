import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateRiskAction } from './candidate-risk-action.ts';

const base = { close: 100, referencePrice: 95, atr14: 5, ma20: 96, ma60: 90, priorCloseBelowMa60: false, rsi14: 60, baseTarget: 120, marketBreakdown: false, materialOfficialCounterEvidence: false };

test('balanced risk action prefers hard exits over trim signals', () => {
  assert.equal(candidateRiskAction({ ...base, close: 80 }).state, 'hard_exit');
  assert.equal(candidateRiskAction({ ...base, close: 121 }).state, 'trim_no_chase');
  assert.equal(candidateRiskAction(base).state, 'hold');
  assert.equal(candidateRiskAction({ ...base, ma60: null }).state, 'data_incomplete');
});
