import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateValuationPolicy } from './candidate-valuation-policy.ts';

test('17-symbol valuation routing is fail closed', () => {
  assert.deepEqual(candidateValuationPolicy({ symbol: '2002', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }), { basis: 'normalized_cycle', canPublishTarget: true, reason: null });
  assert.equal(candidateValuationPolicy({ symbol: '3715', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }).reason, 'next_12m_earnings_bridge_incomplete');
  assert.equal(candidateValuationPolicy({ symbol: '2332', multipleMonthsCovered: 60, next12mBridgeComplete: true, verifiedTurnaroundPath: false }).basis, 'no_defensible_valuation_method');
  assert.equal(candidateValuationPolicy({ symbol: '2330', multipleMonthsCovered: 47, next12mBridgeComplete: true, verifiedTurnaroundPath: false }).canPublishTarget, false);
});
