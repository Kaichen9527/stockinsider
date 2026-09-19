import test from 'node:test';
import assert from 'node:assert/strict';
import { getCandidateBusinessProfile } from './candidate-business-profile.ts';

test('AUO uses an explicit versioned cyclical asset research profile', () => {
  const profile = getCandidateBusinessProfile('2409');
  assert.equal(profile?.version, 'auo-cyclical-asset-v1');
  assert.equal(profile?.primaryValuationMethod, 'forward_bvps_pb');
  assert.equal(profile?.forecastHorizonMonths, 12);
  assert.deepEqual(profile?.requiredFlowFacts, [
    'quarterly_revenue',
    'quarterly_gross_profit',
    'quarterly_operating_income',
    'quarterly_net_income_attributable_to_common',
  ]);
  assert.deepEqual(profile?.requiredInstantFacts, ['common_equity_attributable_to_owners', 'common_shares_outstanding']);
  assert.deepEqual(profile?.operatingSegments, ['Display', 'Mobility Solutions', 'Vertical Solutions']);
});

test('issuer-specific profile does not leak to peers by sector or symbol', () => {
  assert.equal(getCandidateBusinessProfile('2408'), null);
  assert.equal(getCandidateBusinessProfile('optoelectronics'), null);
});
