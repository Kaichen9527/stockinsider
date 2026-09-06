import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateRiskAction, runningMaxDrawdown } from './candidate-risk-action.ts';

const base = { close: 100, referencePrice: 95, atr14: 5, initialStopPrice: 85, ma20: 96, ma60: 90, priorCloseBelowMa60: false, rsi14: 60, baseTarget: 120, marketBreakdown: false, materialOfficialCounterEvidence: false };

test('balanced risk action prefers hard exits over trim signals', () => {
  assert.equal(candidateRiskAction({ ...base, close: 80 }).state, 'hard_exit');
  assert.equal(candidateRiskAction({ ...base, close: 121 }).state, 'trim_no_chase');
  assert.equal(candidateRiskAction(base).state, 'hold');
  assert.equal(candidateRiskAction({ ...base, ma60: null }).state, 'data_incomplete');
});

test('the initial stop does not widen when current ATR later rises', () => {
  assert.equal(candidateRiskAction({ ...base, close: 86, atr14: 20 }).state, 'trim_no_chase');
  assert.equal(candidateRiskAction({ ...base, close: 85, atr14: 20 }).state, 'hard_exit');
});

test('maximum drawdown preserves the worst peak-to-close observation in an episode', () => {
  assert.equal(runningMaxDrawdown(null, 120, 108), -10);
  assert.equal(runningMaxDrawdown(-10, 125, 120), -10);
  assert.equal(runningMaxDrawdown(-10, 125, 100), -20);
});
