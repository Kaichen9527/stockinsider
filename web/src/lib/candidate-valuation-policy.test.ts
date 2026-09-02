import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateValuationPolicy, VALUATION_REMEDIATION_SYMBOLS } from './candidate-valuation-policy.ts';

test('17-symbol valuation routing is fail closed', () => {
  assert.equal(VALUATION_REMEDIATION_SYMBOLS.size, 17);
  assert.deepEqual([...VALUATION_REMEDIATION_SYMBOLS].sort(), ['1101','1301','1312','1314','1326','1802','1815','2002','2332','2337','2369','2408','3049','3715','4171','6230','6770']);
  assert.deepEqual(candidateValuationPolicy({ symbol: '2002', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }), { basis: 'normalized_cycle', canPublishTarget: true, reason: null });
  assert.equal(candidateValuationPolicy({ symbol: '3715', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }).reason, 'next_12m_earnings_bridge_incomplete');
  assert.equal(candidateValuationPolicy({ symbol: '2332', multipleMonthsCovered: 60, next12mBridgeComplete: true, verifiedTurnaroundPath: false }).basis, 'no_defensible_valuation_method');
  assert.equal(candidateValuationPolicy({ symbol: '2330', multipleMonthsCovered: 47, next12mBridgeComplete: true, verifiedTurnaroundPath: false }).canPublishTarget, false);
});
