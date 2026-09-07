import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CANDIDATE_FINANCIAL_FACT_KEYS,
  candidateResearchItemStatus,
  isCandidateFinancialFactKey,
  isPromotionEligibleEvidence,
  normalizeCandidateFactKind,
} from './evidence-valuation-contract.ts';

test('legacy official numeric facts read as reported numeric without admitting arbitrary kinds', () => {
  assert.equal(normalizeCandidateFactKind('official_numeric'), 'reported_numeric');
  assert.equal(normalizeCandidateFactKind('reported_numeric'), 'reported_numeric');
  assert.equal(normalizeCandidateFactKind('fallback_numeric'), null);
});

test('validated FinMind mirrors are admissible only when every required validation passes', () => {
  const validMirror = {
    provider: 'finmind', authorityTier: 'finmind_mirror', validationStatus: 'validated',
    schemaValid: true, unitValid: true, pointInTimeValid: true, consistencyValid: true,
  } as const;
  assert.equal(isPromotionEligibleEvidence(validMirror), true);
  for (const key of ['schemaValid', 'unitValid', 'pointInTimeValid', 'consistencyValid'] as const) {
    assert.equal(isPromotionEligibleEvidence({ ...validMirror, [key]: false }), false, `${key} must fail closed`);
  }
  assert.equal(isPromotionEligibleEvidence({ ...validMirror, validationStatus: 'stale' }), false);
  assert.equal(isPromotionEligibleEvidence({ ...validMirror, synthetic: true }), false);
});

test('financial PB/ROE instant fact keys are explicit, finite contract members', () => {
  for (const key of ['common_equity_attributable_to_owners', 'common_shares_outstanding']) {
    assert.equal(isCandidateFinancialFactKey(key), true);
    assert.ok(CANDIDATE_FINANCIAL_FACT_KEYS.includes(key as typeof CANDIDATE_FINANCIAL_FACT_KEYS[number]));
  }
  assert.equal(isCandidateFinancialFactKey('unreviewed_document_fact'), false);
});

test('missing valuation evidence is partial while an investigated no-method conclusion is terminal', () => {
  assert.equal(candidateResearchItemStatus({ executionFailed: false, valuationComplete: false, noDefensibleMethod: false }), 'partial');
  assert.equal(candidateResearchItemStatus({ executionFailed: false, valuationComplete: false, noDefensibleMethod: true }), 'success');
  assert.equal(candidateResearchItemStatus({ executionFailed: true, valuationComplete: true, noDefensibleMethod: false }), 'failed');
});
