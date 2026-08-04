import assert from 'node:assert/strict';
import { test } from 'node:test';
import { layerHomepageOpportunityV3, preserveLegacyRadarV3 } from './deployment.ts';

test('disabled V3 preserves legacy radar object identity and performs no shadow load', async () => {
  const legacy = Object.freeze({ opportunities: [{ symbol: '2330' }], earlyWatchlist: [] });
  let queried = false;
  const result = await layerHomepageOpportunityV3({
    legacyRadar: legacy,
    shadowEnabled: false,
    loadShadowEngine: async () => {
      queried = true;
      return { availability: 'available' };
    },
  });
  assert.equal(preserveLegacyRadarV3(legacy), legacy);
  assert.equal(result.radar, legacy);
  assert.equal(result.opportunityEngineV3, null);
  assert.equal(queried, false);
});

test('legacy radar keeps the reviewed fields without V3 placeholder values', () => {
  const payload = {
    opportunities: [{ symbol: '2330', currentPrice: 100, stopLoss: null }],
    scenarioUpsideCandidates: [],
    earlyWatchlist: [],
  };
  assert.deepEqual(preserveLegacyRadarV3(payload), payload);
  assert.doesNotMatch(JSON.stringify(payload), /"-"/u);
});
