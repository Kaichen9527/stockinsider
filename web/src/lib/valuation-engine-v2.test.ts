import assert from 'node:assert/strict';
import test from 'node:test';
import { impliedPriceFromMultiple, scenarioValuationMetrics, selectValuationMethods, validateResearchFrame } from './valuation-engine-v2.ts';

test('valuation method follows company economics rather than one universal PE', () => {
  assert.deepEqual(selectValuationMethods({ profitable: true, cyclicalOrAssetIntensive: false, financialInstitution: false, lossMaking: false, verifiedTurnaroundPath: false, stableCashFlow: true }), { primary: 'forward_pe', crossCheck: 'dcf' });
  assert.deepEqual(selectValuationMethods({ profitable: true, cyclicalOrAssetIntensive: true, financialInstitution: false, lossMaking: false, verifiedTurnaroundPath: false, stableCashFlow: false }), { primary: 'normalized_pe', crossCheck: 'ev_ebitda' });
  assert.deepEqual(selectValuationMethods({ profitable: true, cyclicalOrAssetIntensive: false, financialInstitution: true, lossMaking: false, verifiedTurnaroundPath: false, stableCashFlow: false }), { primary: 'forward_pb', crossCheck: 'forward_pe' });
  assert.deepEqual(selectValuationMethods({ profitable: false, cyclicalOrAssetIntensive: false, financialInstitution: false, lossMaking: true, verifiedTurnaroundPath: true, stableCashFlow: false }), { primary: 'ev_sales', crossCheck: 'ev_gross_profit' });
  assert.deepEqual(selectValuationMethods({ profitable: false, cyclicalOrAssetIntensive: false, financialInstitution: false, lossMaking: true, verifiedTurnaroundPath: false, stableCashFlow: false }), { primary: null, crossCheck: null, blockedReason: 'unverified_turnaround_path' });
});

test('per-share and enterprise-value methods calculate equity value explicitly', () => {
  assert.equal(impliedPriceFromMultiple({ method: 'forward_pe', operatingDriverPerShare: 10, multiple: 15 }), 150);
  assert.equal(impliedPriceFromMultiple({ method: 'ev_ebitda', operatingDriverTotal: 1000, multiple: 8, netDebt: 2000, dilutedShares: 100 }), 60);
});

test('scenario metrics use conservative base for promotion and 25/50/25 display target', () => {
  const result = scenarioValuationMetrics({ currentPrice: 100, bear: 80, base: 120, bull: 160 });
  assert.equal(result.probabilityWeightedTarget, 120);
  assert.equal(result.baseUpsidePct, 20);
  assert.equal(result.bearDownsidePct, -20);
  assert.equal(result.rewardRiskRatio, 1);
  assert.equal(result.promotionTarget, 120);
});

test('structured operating review requires traceable bridge, risks and invalidation', () => {
  const missing = validateResearchFrame({
    productAndRevenueMix: ['memory mix'], demandDrivers: [], customerCertificationShipmentTimeline: [],
    capacityYieldAsp: [], revenueGrossMarginEpsFcfBridge: [], catalysts: [], risks: [], invalidationConditions: [], sourceRefs: [],
  });
  assert(missing.includes('demand_drivers'));
  assert(missing.includes('source_refs'));
});
