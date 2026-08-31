import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConservativeOfficialScenario } from './candidate-valuation.ts';

const historicalPeRatios = [10, 12, 14, 16, 18, 20, 22, 24, 26, 28];
const historicalPbRatios = [1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7];

test('official PE scenario holds reported multiple and uses conservative revenue pass-through', () => {
  const scenario = buildConservativeOfficialScenario({
    price: 100,
    epsTtm: 5,
    peRatio: 20,
    pbRatio: 3,
    revenueYoyPct: 20,
    sector: 'semiconductor',
    historicalPeRatios,
    historicalPbRatios,
  });
  assert(scenario);
  assert.equal(scenario.primaryMethod, 'forward_pe');
  assert.equal(scenario.growthFactor, 1.1);
  assert.equal(scenario.baseTarget, 110);
  assert.equal(scenario.baseUpsidePct, 10);
  assert(scenario.bearTarget < scenario.baseTarget);
  assert(scenario.bullTarget > scenario.baseTarget);
});

test('missing or loss-making official earnings do not manufacture targets', () => {
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: null, peRatio: 20, pbRatio: null, revenueYoyPct: 40, sector: null, historicalPeRatios, historicalPbRatios }), null);
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: -1, peRatio: null, pbRatio: null, revenueYoyPct: 40, sector: 'technology', historicalPeRatios, historicalPbRatios }), null);
});

test('revenue growth pass-through is capped and cannot create unlimited upside', () => {
  const scenario = buildConservativeOfficialScenario({ price: 100, epsTtm: 5, peRatio: 20, pbRatio: null, revenueYoyPct: 500, sector: 'technology', historicalPeRatios, historicalPbRatios });
  assert(scenario);
  assert.equal(scenario.growthFactor, 1.15);
  assert.equal(scenario.baseTarget, 115);
});

test('reported price and PE stay internally consistent when EPS dates differ', () => {
  const scenario = buildConservativeOfficialScenario({ price: 90, epsTtm: 9, peRatio: 15, pbRatio: null, revenueYoyPct: 0, sector: 'technology', historicalPeRatios, historicalPbRatios });
  assert(scenario);
  assert.equal(scenario.baseTarget, 120, 'the lower exchange-implied earnings driver must constrain a mismatched EPS figure');
  assert.equal(scenario.baseMultiple, 20);
});

test('insufficient historical multiple evidence does not create a target', () => {
  assert.equal(buildConservativeOfficialScenario({ price: 100, epsTtm: 5, peRatio: 20, pbRatio: null, revenueYoyPct: 20, sector: 'technology', historicalPeRatios: [18, 20], historicalPbRatios: [] }), null);
});
