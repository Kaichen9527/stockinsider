import assert from 'node:assert/strict';
import test from 'node:test';
import { advanceRiskEpisode, adjacentSessionBelowMa60, candidateRiskAction, runningMaxDrawdown, wilderAtr14 } from './candidate-risk-action.ts';

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

test('ATR uses Wilder smoothing rather than assuming a library SMA convention', () => {
  const bars = Array.from({ length: 14 }, () => ({ high: 11, low: 9, close: 10 }));
  bars.push({ high: 13, low: 11, close: 12 }); // true range is 3 vs prior close 10
  assert.equal(wilderAtr14(bars), 29 / 14);
  assert.equal(wilderAtr14(bars.slice(0, 13)), null);
});

test('risk episode sets reference at t+1, freezes initial ATR, and resets on a new episode', () => {
  const started = advanceRiskEpisode({ stage: 'actionable', previousStage: 'waiting', sessionDate: '2026-09-01', priorSessionDate: '2026-08-29', expectedPreviousSessionDate: '2026-08-29', close: 100, atr14: 5, episodeId: 'episode-a', prior: null });
  assert.deepEqual({ referencePrice: started.referencePrice, initialAtr14: started.initialAtr14, initialStopPrice: started.initialStopPrice }, { referencePrice: null, initialAtr14: 5, initialStopPrice: null });
  const referenced = advanceRiskEpisode({ stage: 'actionable', previousStage: 'actionable', sessionDate: '2026-09-02', priorSessionDate: '2026-09-01', expectedPreviousSessionDate: '2026-09-01', close: 102, atr14: 20, episodeId: 'unused', prior: started });
  assert.deepEqual({ referencePrice: referenced.referencePrice, initialAtr14: referenced.initialAtr14, initialStopPrice: referenced.initialStopPrice, peakClose: referenced.peakClose }, { referencePrice: 102, initialAtr14: 5, initialStopPrice: 92, peakClose: 102 });
  const reset = advanceRiskEpisode({ stage: 'waiting', previousStage: 'actionable', sessionDate: '2026-09-03', priorSessionDate: '2026-09-02', expectedPreviousSessionDate: '2026-09-02', close: 101, atr14: 8, episodeId: 'episode-b', prior: referenced });
  assert.equal(reset.signalEpisodeId, null);
});

test('MA60 exit only accepts the immediately prior official session', () => {
  assert.equal(adjacentSessionBelowMa60({ currentSessionDate: '2026-09-03', expectedPreviousSessionDate: '2026-09-02', priorSessionDate: '2026-09-01', priorClose: 80, priorMa60: 90 }), false);
  assert.equal(adjacentSessionBelowMa60({ currentSessionDate: '2026-09-03', expectedPreviousSessionDate: '2026-09-02', priorSessionDate: '2026-09-02', priorClose: 80, priorMa60: 90 }), true);
  const nonAdjacent = candidateRiskAction({ ...base, close: 80, initialStopPrice: 70, currentSessionDate: '2026-09-03', expectedPreviousSessionDate: '2026-09-02', priorSessionDate: '2026-09-01', priorClose: 80, priorMa60: 90, priorCloseBelowMa60: true });
  assert.equal(nonAdjacent.state, 'trim_no_chase');
  assert(!nonAdjacent.reasons.includes('two_closes_below_ma60'));
});
