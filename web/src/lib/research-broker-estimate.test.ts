import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePublicBrokerEps } from './research-broker-estimate.ts';
test('broker EPS keeps annual scope and negative estimates; a year cannot become EPS', () => {
  assert.deepEqual(parsePublicBrokerEps('2027 年 EPS -0.32 元'), { eps: -0.32, estimateYear: 2027, period: 'annual' });
  assert.deepEqual(parsePublicBrokerEps('EPS（2026）約 1.5 元'), { eps: 1.5, estimateYear: 2026, period: 'annual' });
  assert.equal(parsePublicBrokerEps('EPS 2027 尚未預估').eps, null);
  assert.deepEqual(parsePublicBrokerEps('Forward EPS 1.5'), { eps: 1.5, estimateYear: null, period: 'unknown' });
});
