import { researchCanonicalHash } from './research-agent-qualification.ts';

export const STRATEGY_EXPERIMENT_POLICY = 'strategy-experiment-v1' as const;
export const PAPER_BOOKS = Object.freeze({
  conservative: Object.freeze({
    initialCapital: 1_000_000, initialRiskFraction: 0.005, stockExposureFraction: 0.15,
    sectorExposureFraction: 0.30, totalExposureFraction: 0.80, totalInitialRiskFraction: 0.03,
    drawdownActionFraction: 0.15,
  }),
  growth: Object.freeze({
    initialCapital: 1_000_000, initialRiskFraction: 0.01, stockExposureFraction: 0.20,
    sectorExposureFraction: 0.40, totalExposureFraction: 1.00, totalInitialRiskFraction: 0.05,
    drawdownActionFraction: 0.25,
  }),
});
export type StrategyArm = 'technical_baseline' | 'technical_research' | 'technical_research_kol';
export type StrategyExperimentProposal = {
  policyVersion: typeof STRATEGY_EXPERIMENT_POLICY;
  authorId: string;
  registeredAt: string;
  codeHash: string;
  inputDatasetHash: string;
  hypothesis: string;
  primaryFailureCategory: 'stock_selection' | 'entry' | 'exit' | 'cost' | 'liquidity' | 'regime';
  variants: Array<{ id: string; parameterHash: string; explanation: string }>;
  arms: StrategyArm[];
  sampleStart: string;
  sampleEnd: string;
  holdoutStartsAt: '2024-01-01';
  sourceAvailabilityPolicy: 'point_in_time';
};
export type StrategyExperimentObservation = {
  arm: StrategyArm;
  variantId: string;
  symbol: string;
  signalAt: string;
  sourceAvailableAt: string;
  researchArticlePublishedAt: string | null;
  kolClaimObservedAt: string | null;
  grossReturnFraction: number;
  roundTripCostFraction: number;
  maximumDrawdownFraction: number;
  regime: string;
};
export type StrategyExperimentAssessment = {
  proposalHash: string;
  status: 'researching' | 'candidate_for_independent_review';
  reasons: string[];
  byArm: Array<{
    arm: StrategyArm; trades: number; meanNetReturnFraction: number | null;
    worstDrawdownFraction: number | null; topFiveProfitShare: number | null;
    regimes: string[];
  }>;
};
export type StrategyApprovalReceipt = {
  schemaVersion: 'strategy-user-approval-v1';
  proposalHash: string;
  assessmentHash: string;
  independentValidationHash: string;
  codeHash: string;
  parameterHashes: string[];
  riskPolicyHash: string;
  approvedBy: string;
  approvedAt: string;
  effectiveFrom: string;
  receiptHash: string;
};
const HASH = /^[0-9a-f]{64}$/u;
const stamp = (value: string) => Number.isFinite(Date.parse(value)) && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
const date = (value: string) => /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`));
const arms: StrategyArm[] = ['technical_baseline', 'technical_research', 'technical_research_kol'];

export function validateStrategyExperimentProposal(proposal: StrategyExperimentProposal) {
  if (proposal.policyVersion !== STRATEGY_EXPERIMENT_POLICY || !proposal.authorId
    || !stamp(proposal.registeredAt) || !HASH.test(proposal.codeHash)
    || !HASH.test(proposal.inputDatasetHash) || proposal.hypothesis.trim().length < 20
    || proposal.variants.length < 1 || proposal.variants.length > 3
    || new Set(proposal.variants.map((variant) => variant.id)).size !== proposal.variants.length
    || proposal.variants.some((variant) => !/^[a-z0-9_-]{2,40}$/u.test(variant.id)
      || !HASH.test(variant.parameterHash) || variant.explanation.trim().length < 10)
    || proposal.arms.length !== 3 || proposal.arms.some((arm, index) => arm !== arms[index])
    || !date(proposal.sampleStart) || !date(proposal.sampleEnd) || proposal.sampleEnd < proposal.sampleStart
    || proposal.sampleEnd >= proposal.holdoutStartsAt || proposal.holdoutStartsAt !== '2024-01-01'
    || proposal.sourceAvailabilityPolicy !== 'point_in_time') {
    throw new Error('strategy_experiment_preregistration_invalid');
  }
  return researchCanonicalHash(proposal);
}

/** Evaluation can suggest review; it never promotes a production strategy. */
export function assessStrategyExperiment(input: {
  proposal: StrategyExperimentProposal;
  observations: StrategyExperimentObservation[];
  independentReviewerId: string;
  evaluatedAt: string;
}): StrategyExperimentAssessment {
  const proposalHash = validateStrategyExperimentProposal(input.proposal);
  if (!input.independentReviewerId || input.independentReviewerId === input.proposal.authorId
    || !stamp(input.evaluatedAt) || Date.parse(input.evaluatedAt) < Date.parse(input.proposal.registeredAt)
    || input.observations.length > 100_000) throw new Error('strategy_experiment_reviewer_or_size_invalid');
  const variants = new Set(input.proposal.variants.map((variant) => variant.id));
  for (const row of input.observations) {
    if (!variants.has(row.variantId) || !arms.includes(row.arm) || !/^\d{4}$/u.test(row.symbol)
      || !stamp(row.signalAt) || !stamp(row.sourceAvailableAt)
      || row.signalAt.slice(0, 10) < input.proposal.sampleStart
      || row.signalAt.slice(0, 10) > input.proposal.sampleEnd
      || Date.parse(row.sourceAvailableAt) > Date.parse(row.signalAt)
      || ![row.grossReturnFraction, row.roundTripCostFraction, row.maximumDrawdownFraction].every(Number.isFinite)
      || row.roundTripCostFraction < 0 || row.maximumDrawdownFraction < 0 || !row.regime.trim()) {
      throw new Error('strategy_experiment_point_in_time_or_cost_invalid');
    }
    if (row.arm !== 'technical_baseline' && (!row.researchArticlePublishedAt
      || !stamp(row.researchArticlePublishedAt)
      || Date.parse(row.researchArticlePublishedAt) > Date.parse(row.signalAt))) {
      throw new Error('strategy_experiment_research_lookahead');
    }
    if (row.arm === 'technical_research_kol' && (!row.kolClaimObservedAt
      || !stamp(row.kolClaimObservedAt) || Date.parse(row.kolClaimObservedAt) > Date.parse(row.signalAt))) {
      throw new Error('strategy_experiment_kol_lookahead');
    }
  }
  const byArm = arms.map((arm) => {
    const trades = input.observations.filter((row) => row.arm === arm);
    const net = trades.map((row) => row.grossReturnFraction - row.roundTripCostFraction);
    const profit = net.filter((value) => value > 0).sort((left, right) => right - left);
    const totalProfit = profit.reduce((sum, value) => sum + value, 0);
    return {
      arm, trades: trades.length,
      meanNetReturnFraction: trades.length ? net.reduce((sum, value) => sum + value, 0) / trades.length : null,
      worstDrawdownFraction: trades.length ? Math.max(...trades.map((row) => row.maximumDrawdownFraction)) : null,
      topFiveProfitShare: totalProfit > 0 ? profit.slice(0, 5).reduce((sum, value) => sum + value, 0) / totalProfit : null,
      regimes: [...new Set(trades.map((row) => row.regime))].sort(),
    };
  });
  const reasons: string[] = [];
  if (byArm.some((row) => row.trades < 30)) reasons.push('sample_below_30_per_arm');
  if (byArm.some((row) => row.regimes.length < 2)) reasons.push('market_regime_coverage_incomplete');
  if (byArm.some((row) => row.topFiveProfitShare != null && row.topFiveProfitShare > 0.5)) reasons.push('profit_concentration_above_half');
  if (byArm.some((row) => row.meanNetReturnFraction == null || row.meanNetReturnFraction <= 0)) reasons.push('cost_adjusted_expectancy_not_positive');
  return { proposalHash, status: reasons.length ? 'researching' : 'candidate_for_independent_review',
    reasons, byArm };
}

/** Exact user approval is a separate act; an experiment assessment never enables trading. */
export function issueStrategyApproval(input: {
  proposal: StrategyExperimentProposal;
  assessment: StrategyExperimentAssessment;
  independentReviewerId: string;
  independentValidation: {
    receiptHash: string; status: 'passed' | 'failed'; reviewerId: string;
    validatedAt: string; holdoutAndForwardChecked: boolean;
  };
  approvedBy: string;
  approvedAt: string;
  effectiveFrom: string;
  riskPolicyHash: string;
}): StrategyApprovalReceipt {
  const proposalHash = validateStrategyExperimentProposal(input.proposal);
  if (input.assessment.proposalHash !== proposalHash
    || input.assessment.status !== 'candidate_for_independent_review'
    || input.assessment.reasons.length !== 0
    || !input.independentReviewerId || input.independentReviewerId === input.proposal.authorId
    || !HASH.test(input.independentValidation.receiptHash)
    || input.independentValidation.status !== 'passed'
    || input.independentValidation.holdoutAndForwardChecked !== true
    || !input.independentValidation.reviewerId
    || [input.proposal.authorId, input.independentReviewerId].includes(input.independentValidation.reviewerId)
    || !stamp(input.independentValidation.validatedAt)
    || Date.parse(input.independentValidation.validatedAt) > Date.parse(input.approvedAt)
    || !input.approvedBy || [input.proposal.authorId, input.independentReviewerId].includes(input.approvedBy)
    || !stamp(input.approvedAt) || !stamp(input.effectiveFrom)
    || Date.parse(input.effectiveFrom) < Date.parse(input.approvedAt)
    || !HASH.test(input.riskPolicyHash)) {
    throw new Error('strategy_user_approval_not_independent_or_exact');
  }
  const assessmentHash = researchCanonicalHash(input.assessment);
  const receipt = {
    schemaVersion: 'strategy-user-approval-v1' as const,
    proposalHash, assessmentHash,
    independentValidationHash: input.independentValidation.receiptHash,
    codeHash: input.proposal.codeHash,
    parameterHashes: input.proposal.variants.map((variant) => variant.parameterHash),
    riskPolicyHash: input.riskPolicyHash, approvedBy: input.approvedBy,
    approvedAt: input.approvedAt, effectiveFrom: input.effectiveFrom,
  };
  return { ...receipt, receiptHash: researchCanonicalHash(receipt) };
}
