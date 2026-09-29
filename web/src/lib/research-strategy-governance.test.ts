import assert from 'node:assert/strict';
import test from 'node:test';
import {
  PAPER_BOOKS, STRATEGY_EXPERIMENT_POLICY, assessStrategyExperiment,
  issueStrategyApproval, validateStrategyExperimentProposal, type StrategyExperimentProposal,
} from './research-strategy-governance.ts';

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
      variantId: 'baseline', symbol: '2409', signalAt: '2023-09-01T06:00:00Z',
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
      holdoutAndForwardChecked: false },
    approvedBy: 'owner', approvedAt: '2026-09-29T03:00:00Z',
    effectiveFrom: '2026-10-01T00:00:00Z', riskPolicyHash: digest };
  assert.throws(() => issueStrategyApproval(input), /not_independent_or_exact/);
  assert.throws(() => issueStrategyApproval({ ...input, approvedBy: 'strategy-agent',
    independentValidation: { ...input.independentValidation, status: 'passed',
      holdoutAndForwardChecked: true } }), /not_independent_or_exact/);
  const receipt = issueStrategyApproval({ ...input, independentValidation: {
    ...input.independentValidation, status: 'passed', holdoutAndForwardChecked: true,
  } });
  assert.equal(receipt.codeHash, proposal().codeHash);
  assert.match(receipt.receiptHash, /^[a-f0-9]{64}$/u);
});
