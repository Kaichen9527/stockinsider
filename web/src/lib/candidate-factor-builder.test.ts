import assert from 'node:assert/strict';
import test from 'node:test';
import { brokerResearchFactor, officialResearchEvidenceFactor, relationshipFactor } from './candidate-factor-builder.ts';

test('official evidence is not capped at fifty and becomes complete only with all named evidence', () => {
  const factor = officialResearchEvidenceFactor({
    factKeys: ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps'],
    hasPriceHistory: true, hasInstitutionalFlow: true, hasMarketEvidence: true, asOf: '2026-09-04',
  });
  assert.equal(factor.score, 100);
  assert.equal(factor.status, 'available');
});

test('missing broker and peer evidence stays explicit instead of receiving free points', () => {
  assert.deepEqual(brokerResearchFactor([]).reasons, ['missing:licensed_broker_evidence']);
  assert.equal(relationshipFactor([], 'overseas_peer').score, 0);
  assert.equal(relationshipFactor([], 'domestic_rotation').status, 'missing');
});
