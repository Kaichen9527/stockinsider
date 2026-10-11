import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAPER_BOOKS, STRATEGY_EXPERIMENT_POLICY, assessStrategyExperiment,
  issueStrategyApproval, validateStrategyExperimentProposal, type StrategyExperimentProposal,
} from './research-strategy-governance.ts';

import { researchCanonicalHash } from './research-agent-qualification.ts';
const digest = 'a'.repeat(64);
const proposal = (): StrategyExperimentProposal => ({
  policyVersion: STRATEGY_EXPERIMENT_POLICY, authorId: 'strategy-agent',
  registeredAt: '2026-09-29T00:00:00Z', codeHash: digest, inputDatasetHash: digest,
  hypothesis: '研究資格能減少無故事基礎的突破假訊號，扣除成本後勝過技術基準。',
  primaryFailureCategory: 'stock_selection',
  variants: [{ id: 'baseline', parameterHash: digest, explanation: '固定已核准的既有突破規則' }],
  arms: ['technical_baseline', 'technical_research', 'technical_research_kol'],
  sampleStart: '2019-01-01', sampleEnd: '2023-12-31',
  holdoutStartsAt: '2024-01-01', sourceAvailabilityPolicy: 'point_in_time',
});

test('one hypothesis, three arms and at most three pre-registered variants', () => {
  assert.match(validateStrategyExperimentProposal(proposal()), /^[a-f0-9]{64}$/u);
  const many = proposal();
  many.variants = Array.from({ length: 4 }, (_, index) => ({ id: `v${index}`,
    parameterHash: digest, explanation: '已事前登錄的參數版本' }));
  assert.throws(() => validateStrategyExperimentProposal(many), /preregistration/);
  const holdout = proposal(); holdout.sampleEnd = '2024-01-01';
  assert.throws(() => validateStrategyExperimentProposal(holdout), /preregistration/);
  assert.equal(PAPER_BOOKS.conservative.initialCapital, 1_000_000);
  assert.equal(PAPER_BOOKS.growth.initialRiskFraction, 0.01);
});
test('historically unavailable research and KOL claims cannot be backfilled', () => {
  const base = { arm: 'technical_research_kol' as const, variantId: 'baseline', symbol: '2409',
    signalAt: '2023-09-01T06:00:00Z', sourceAvailableAt: '2023-08-31T06:00:00Z',
    researchArticlePublishedAt: '2026-09-29T00:00:00Z', kolClaimObservedAt: '2023-08-31T06:00:00Z',
    grossReturnFraction: 0.05, roundTripCostFraction: 0.01, maximumDrawdownFraction: 0.1, regime: 'bull' };
  assert.throws(() => assessStrategyExperiment({ proposal: proposal(), observations: [base],
    independentReviewerId: 'independent-reviewer', evaluatedAt: '2026-09-29T01:00:00Z' }), /research_lookahead/);
  base.researchArticlePublishedAt = '2023-08-31T06:00:00Z';
  base.kolClaimObservedAt = '2023-09-02T00:00:00Z';
  assert.throws(() => assessStrategyExperiment({ proposal: proposal(), observations: [base],
    independentReviewerId: 'independent-reviewer', evaluatedAt: '2026-09-29T01:00:00Z' }), /kol_lookahead/);
});
test('low sample and weak cost-adjusted expectancy stay research-only', () => {
  const result = assessStrategyExperiment({ proposal: proposal(), observations: [
    { arm: 'technical_baseline', variantId: 'baseline', symbol: '2409',
      signalAt: '2023-09-01T06:00:00Z', sourceAvailableAt: '2023-08-31T06:00:00Z',
      researchArticlePublishedAt: null, kolClaimObservedAt: null,
      grossReturnFraction: 0.005, roundTripCostFraction: 0.01,
      maximumDrawdownFraction: 0.1, regime: 'bull' },
  ], independentReviewerId: 'independent-reviewer', evaluatedAt: '2026-09-29T01:00:00Z' });
  assert.equal(result.status, 'researching');
  assert.ok(result.reasons.includes('sample_below_30_per_arm'));
  assert.ok(result.reasons.includes('cost_adjusted_expectancy_not_positive'));
});
test('a promising backtest cannot approve itself or omit independent holdout validation', () => {
  const observations = ['technical_baseline', 'technical_research', 'technical_research_kol']
    .flatMap((arm) => Array.from({ length: 30 }, (_, index) => ({
      arm: arm as 'technical_baseline' | 'technical_research' | 'technical_research_kol',
      variantId: 'baseline', symbol: '2409', signalAt: `2023-09-${String(index + 1).padStart(2, '0')}T06:00:00Z`,
      sourceAvailableAt: '2023-08-31T06:00:00Z',
      researchArticlePublishedAt: arm === 'technical_baseline' ? null : '2023-08-31T06:00:00Z',
      kolClaimObservedAt: arm === 'technical_research_kol' ? '2023-08-31T06:00:00Z' : null,
      grossReturnFraction: 0.04, roundTripCostFraction: 0.01,
      maximumDrawdownFraction: 0.1, regime: index % 2 ? 'bull' : 'bear',
    })));
  const assessment = assessStrategyExperiment({ proposal: proposal(), observations,
    independentReviewerId: 'independent-reviewer', evaluatedAt: '2026-09-29T01:00:00Z' });
  assert.equal(assessment.status, 'candidate_for_independent_review');
  const input = { proposal: proposal(), assessment, independentReviewerId: 'independent-reviewer',
    independentValidation: { receiptHash: digest, status: 'failed' as 'passed' | 'failed',
      reviewerId: 'holdout-reviewer', validatedAt: '2026-09-29T02:00:00Z',
      holdoutAndForwardChecked: false, proposalHash: researchCanonicalHash(proposal()),
      assessmentHash: researchCanonicalHash(assessment), codeHash: digest,
      parameterHashes: [digest], riskPolicyHash: digest },
    approvedBy: 'owner', approvedAt: '2026-09-29T03:00:00Z',
    effectiveFrom: '2026-10-01T00:00:00Z', riskPolicyHash: digest };
  assert.throws(() => issueStrategyApproval(input), /not_independent_or_exact/);
  assert.throws(() => issueStrategyApproval({ ...input, approvedBy: 'strategy-agent',
    independentValidation: { ...input.independentValidation, status: 'passed',
      holdoutAndForwardChecked: true } }), /not_independent_or_exact/);
  const { receiptHash: _oldHash, ...payload } = input.independentValidation;
  void _oldHash;
  const validation = { ...payload, status: 'passed' as const, holdoutAndForwardChecked: true };
  const valid = { ...input, independentValidation: { ...validation, receiptHash: researchCanonicalHash(validation) } };
  const receipt = issueStrategyApproval(valid);
  assert.throws(() => issueStrategyApproval({ ...valid, approvedBy: validation.reviewerId }), /not_independent_or_exact/);
  assert.throws(() => issueStrategyApproval({ ...valid, assessment: { ...assessment, byArm: [], byVariantArm: [] } }), /not_independent_or_exact/);
  for (const mutation of [{ validatedAt: '2020-01-01T00:00:00Z' }, { codeHash: 'b'.repeat(64) },
    { assessmentHash: 'b'.repeat(64) }, { proposalHash: 'b'.repeat(64) }, { riskPolicyHash: 'b'.repeat(64) }]) {
    const changed = { ...validation, ...mutation };
    assert.throws(() => issueStrategyApproval({ ...valid, independentValidation: {
      ...changed, receiptHash: researchCanonicalHash(changed),
    } }), /not_independent_or_exact/);
  }
  assert.equal(receipt.codeHash, proposal().codeHash);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/u);
});
test('duplicated daily signals cannot manufacture thirty independent trades', () => {
  const rows = proposal().arms.flatMap((arm) => Array.from({ length: 30 }, (_, index) => ({
    arm, variantId: 'baseline', symbol: '2409',
    signalAt: index % 2 ? '2023-09-01T06:00:00Z' : '2023-09-02T06:00:00Z',
    sourceAvailableAt: '2023-08-31T06:00:00Z',
    researchArticlePublishedAt: arm === 'technical_baseline' ? null : '2023-08-31T06:00:00Z',
    kolClaimObservedAt: arm === 'technical_research_kol' ? '2023-08-31T06:00:00Z' : null,
    grossReturnFraction: 0.04, roundTripCostFraction: 0.01,
    maximumDrawdownFraction: 0.1, regime: index % 2 ? 'bull' : 'bear',
  })));
  assert.throws(() => assessStrategyExperiment({ proposal: proposal(), observations: rows,
    independentReviewerId: 'reviewer', evaluatedAt: '2026-09-29T01:00:00Z' }), /duplicate_signal/);
});
test('equivalent timestamps and different times within one Taiwan session are one daily signal', () => {
  const original = { arm: 'technical_baseline' as const, variantId: 'baseline', symbol: '2409',
    signalAt: '2023-09-01T06:00:00Z', sourceAvailableAt: '2023-08-31T06:00:00Z',
    researchArticlePublishedAt: null, kolClaimObservedAt: null,
    grossReturnFraction: 0.04, roundTripCostFraction: 0.01,
    maximumDrawdownFraction: 0.1, regime: 'bull' };
  for (const alias of ['2023-09-01T06:00:00.000Z', '2023-09-01T14:00:00+08:00',
    '2023-09-01T07:00:00Z']) {
    assert.throws(() => assessStrategyExperiment({ proposal: proposal(),
      observations: [original, { ...original, signalAt: alias, grossReturnFraction: 0.5 }],
      independentReviewerId: 'reviewer', evaluatedAt: '2026-09-29T01:00:00Z',
    }), /duplicate_signal/u);
  }
});
test('an omitted registered variant cannot pass on the first variant alone', () => {
  const registered = proposal();
  registered.variants.push({ id: 'untested', parameterHash: 'b'.repeat(64),
    explanation: '預先登錄的第二組參數仍必須留下逐組結果' });
  const rows = registered.arms.flatMap((arm) => Array.from({ length: 30 }, (_, index) => ({
    arm, variantId: 'baseline', symbol: '2409',
    signalAt: `2023-09-${String(index + 1).padStart(2, '0')}T06:00:00Z`,
    sourceAvailableAt: '2023-08-31T06:00:00Z',
    researchArticlePublishedAt: arm === 'technical_baseline' ? null : '2023-08-31T06:00:00Z',
    kolClaimObservedAt: arm === 'technical_research_kol' ? '2023-08-31T06:00:00Z' : null,
    grossReturnFraction: 0.04, roundTripCostFraction: 0.01,
    maximumDrawdownFraction: 0.1, regime: index % 2 ? 'bull' : 'bear',
  })));
  const result = assessStrategyExperiment({ proposal: registered, observations: rows,
    independentReviewerId: 'reviewer', evaluatedAt: '2026-09-29T01:00:00Z' });
  assert.equal(result.status, 'researching');
  assert.ok(result.reasons.includes('variant_arm_run_result_missing_or_zero'));
  assert.equal(result.byVariantArm.filter((arm) => arm.variantId === 'untested').length, 3);
});
