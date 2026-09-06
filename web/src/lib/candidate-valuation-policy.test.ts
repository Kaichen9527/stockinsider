import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateValuationPolicy, VALUATION_REMEDIATION_SYMBOLS } from './candidate-valuation-policy.ts';

test('valuation routing is evidence-driven and fail closed', () => {
  assert.equal(VALUATION_REMEDIATION_SYMBOLS.size, 0);
  assert.equal(candidateValuationPolicy({ symbol: '2002', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }).reason, 'next_12m_earnings_bridge_incomplete');
  assert.deepEqual(candidateValuationPolicy({ symbol: '2332', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false, normalizedCycle: { normalizedEps: 8, cycleYearsObserved: 5 } }), { basis: 'normalized_cycle', canPublishTarget: true, reason: null });
  assert.deepEqual(candidateValuationPolicy({ symbol: '0000', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false, businessModel: 'financial', financial: { commonEquity: 100, bookValuePerShare: 10, roe: 0.12, pbMultiple: 1.2, roePeriodsObserved: 8 } }), { basis: 'financial_pb_roe', canPublishTarget: true, reason: null });
  assert.equal(candidateValuationPolicy({ symbol: '2332', multipleMonthsCovered: 60, next12mBridgeComplete: true, verifiedTurnaroundPath: false, lossMaking: true }).reason, 'loss_making_investigation_required');
  assert.equal(candidateValuationPolicy({ symbol: '2332', multipleMonthsCovered: 60, next12mBridgeComplete: true, verifiedTurnaroundPath: true, lossMaking: true }).canPublishTarget, false);
  const turnaround = {
    officialCommercializationEvidence: true, revenueGrossProfitBridgeComplete: true,
    cashRunwayMonths: 18, dilutionPct: 0.05, ttmRevenue: 100, ttmGrossProfit: 25,
    cashAndEquivalents: 50, totalDebt: 20, dilutedShares: 10, evSalesMultiplesObserved: 48,
  };
  assert.deepEqual(candidateValuationPolicy({ symbol: '9999', multipleMonthsCovered: 0, next12mBridgeComplete: false, verifiedTurnaroundPath: true, lossMaking: true, turnaround }), {
    basis: 'turnaround_conditional', canPublishTarget: true, reason: null,
  });
  assert.equal(candidateValuationPolicy({ symbol: '9999', multipleMonthsCovered: 0, next12mBridgeComplete: false, verifiedTurnaroundPath: true, lossMaking: true, turnaround: { ...turnaround, cashRunwayMonths: 11 } }).canPublishTarget, false);
  assert.equal(candidateValuationPolicy({ symbol: '2330', multipleMonthsCovered: 47, next12mBridgeComplete: true, verifiedTurnaroundPath: false }).canPublishTarget, false);
  assert.equal(candidateValuationPolicy({ symbol: '2330', multipleMonthsCovered: 60, next12mBridgeComplete: false, verifiedTurnaroundPath: false }).canPublishTarget, false);
});
