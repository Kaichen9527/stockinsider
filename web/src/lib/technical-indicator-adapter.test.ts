import assert from 'node:assert/strict';
import test from 'node:test';
import { holdsLongMaConfirmation, trueLongMaCrossover, wilderAtr } from './technical-indicator-adapter.ts';

test('golden Wilder ATR seed and recurrence are stable independently of indicator packages', () => {
  const bars = Array.from({ length: 14 }, () => ({ high: 11, low: 9, close: 10 }));
  bars.push({ high: 13, low: 11, close: 12 });
  assert.equal(wilderAtr(bars), 29 / 14);
});

test('a long-MA confirmation is a held close, not an invented second crossover', () => {
  assert.equal(trueLongMaCrossover({ close: 101, movingAverage: 100, priorClose: 99, priorMovingAverage: 100 }), true);
  assert.equal(trueLongMaCrossover({ close: 102, movingAverage: 100, priorClose: 101, priorMovingAverage: 100 }), false);
  assert.equal(holdsLongMaConfirmation({ priorBreakoutRecorded: true, close: 102, movingAverage: 100 }), true);
  assert.equal(holdsLongMaConfirmation({ priorBreakoutRecorded: true, close: 99, movingAverage: 100 }), false);
});
