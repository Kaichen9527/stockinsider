import { roundHalfAwayFromZero } from './canonical.ts';
import type { ActionDecisionV3, DecisionInputV3, FormalResearchStatusV3, HorizonScoreV3 } from './contracts.ts';

export const DECISION_BLOCK_REASONS_V3 = [
  'data_integrity', 'market_risk_off', 'capacity_exhausted', 'invalid_exposure_input',
  'score_below_threshold', 'confidence_below_threshold', 'valuation_unavailable',
  'valuation_reward_risk', 'entry_data_unavailable', 'entry_invalidated',
  'entry_unconfirmed', 'bias_observe_only', 'quality_insufficient',
  'no_eligible_method', 'missing_required_inputs', 'insufficient_series',
  'insufficient_multiple_reference', 'cross_check_unavailable', 'missing_financial_manifest',
  'stale_financial_inputs', 'conflicting_point_in_time_fact', 'invalid_unit',
  'missing_bridge_inputs', 'nonconsecutive_quarters', 'operating_bridge_mismatch',
  'pretax_bridge_mismatch', 'net_income_bridge_mismatch', 'share_count_conflict',
  'reported_eps_mismatch', 'tax_rate_outlier', 'capital_structure_conflict',
  'non_finite_bridge', 'negative_equity_value', 'invalid_capital_structure',
  'non_finite_distribution', 'distribution_ordering', 'unverified_base_upside',
  'unverified_scenario_upside', 'consensus_divergence', 'method_divergence',
] as const;

const VALUATION_BLOCK_REASONS = new Set<string>(DECISION_BLOCK_REASONS_V3.slice(13));
const AVOID_BLOCK_REASONS = new Set<string>([
  'data_integrity', 'market_risk_off', 'capacity_exhausted', 'invalid_exposure_input',
  'score_below_threshold', 'confidence_below_threshold', 'valuation_reward_risk',
  'entry_data_unavailable', 'entry_invalidated', 'entry_unconfirmed', 'bias_observe_only',
  'quality_insufficient',
]);

function object(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value: unknown, keys: readonly string[]): value is Record<string, unknown> {
  if (!object(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function wholeSecondUtc(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validBlockReasons(value: unknown): value is string[] {
  if (!Array.isArray(value) || value.length > 5) return false;
  let prior = -1;
  for (const reason of value) {
    const index = DECISION_BLOCK_REASONS_V3.indexOf(reason as never);
    if (index <= prior) return false;
    prior = index;
  }
  return true;
}

/** Exact durable/public decision ABI. `publicShape` omits only the three sizing fields. */
export function validActionDecisionV3(
  value: unknown,
  options: { publicShape?: boolean; sourceCutoff?: string } = {},
): value is ActionDecisionV3 {
  const publicShape = options.publicShape === true;
  const publicKeys = [
    'decisionAuthority', 'publicationEligible', 'newPositionAction', 'existingPositionAction',
    'existingReason', 'primaryHorizon', 'blockReasons', 'confidence', 'entryTrigger', 'invalidation',
  ];
  if (!exactKeys(value, publicShape ? publicKeys : [
    ...publicKeys, 'existingTargetExposurePct', 'initialPositionPct', 'maximumPositionPct',
  ])) return false;
  if (value.decisionAuthority !== 'research_only' || value.publicationEligible !== false ||
      value.existingPositionAction !== 'no_position' ||
      value.existingReason !== 'portfolio_context_unavailable' ||
      !['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now']
        .includes(String(value.newPositionAction)) ||
      !(value.primaryHorizon === null || ['momentum_5_20d', 'swing_20_60d'].includes(String(value.primaryHorizon))) ||
      typeof value.confidence !== 'number' || !Number.isFinite(value.confidence) ||
      value.confidence < 0 || value.confidence > 1 ||
      !validBlockReasons(value.blockReasons) ||
      !(value.entryTrigger === null || (typeof value.entryTrigger === 'string' &&
        value.entryTrigger.trim().length > 0 && [...value.entryTrigger].length <= 160)) ||
      !exactKeys(value.invalidation, ['code', 'stopPrice', 'evidenceExpiresAt'])) return false;
  if (!publicShape && (value.existingTargetExposurePct !== null ||
      typeof value.initialPositionPct !== 'number' || !Number.isFinite(value.initialPositionPct) ||
      value.initialPositionPct < 0 || value.initialPositionPct > 5 ||
      typeof value.maximumPositionPct !== 'number' || !Number.isFinite(value.maximumPositionPct) ||
      value.maximumPositionPct < 0 || value.maximumPositionPct > 10 ||
      value.initialPositionPct > value.maximumPositionPct)) return false;
  const invalidation = value.invalidation;
  const expiry = invalidation.evidenceExpiresAt;
  const expiryValid = wholeSecondUtc(expiry) &&
    (options.sourceCutoff === undefined || Date.parse(expiry) > Date.parse(options.sourceCutoff));
  const action = String(value.newPositionAction);
  if (value.primaryHorizon === null && !(action === 'avoid' &&
      JSON.stringify(value.blockReasons) === JSON.stringify(['data_integrity']))) return false;
  if (action === 'event_starter' && value.primaryHorizon !== 'momentum_5_20d') return false;
  const sizesAre = (initial: number | 'positive', maximum: number) => publicShape ||
    (initial === 'positive' ? Number(value.initialPositionPct) > 0 : value.initialPositionPct === initial) &&
      value.maximumPositionPct === maximum;
  if (action === 'starter_now' || action === 'event_starter') {
    return sizesAre('positive', 10) && value.blockReasons.length === 0 &&
      typeof value.entryTrigger === 'string' && invalidation.code === 'price_stop_or_evidence_expiry' &&
      typeof invalidation.stopPrice === 'number' && Number.isFinite(invalidation.stopPrice) &&
      invalidation.stopPrice > 0 && expiryValid;
  }
  if (action === 'wait_trigger') {
    return sizesAre(0, 0) && value.entryTrigger !== null &&
      JSON.stringify(value.blockReasons) === JSON.stringify(['entry_unconfirmed']) &&
      invalidation.code === 'evidence_expiry_only' && invalidation.stopPrice === null && expiryValid;
  }
  if (!sizesAre(0, 0) || value.entryTrigger !== null ||
      invalidation.code !== 'data_integrity_review' || invalidation.stopPrice !== null || expiry !== null ||
      value.blockReasons.length === 0) return false;
  if (action === 'valuation_review') return value.blockReasons.every((reason) =>
    VALUATION_BLOCK_REASONS.has(reason) || reason === 'valuation_unavailable') &&
    (!value.blockReasons.includes('valuation_unavailable') || value.blockReasons.length === 1);
  return action === 'avoid' && value.blockReasons.length === 1 &&
    AVOID_BLOCK_REASONS.has(value.blockReasons[0]);
}

function primaryScore(input: DecisionInputV3): HorizonScoreV3 | null {
  if (!input.momentum) return input.swing;
  if (!input.swing) return input.momentum;
  return input.momentum.score > input.swing.score ? input.momentum : input.swing;
}

export function formalResearchStatus(input: {
  inDeepPool: boolean;
  criticalDataInvalid: boolean;
  valuation: DecisionInputV3['valuation'];
  thesis: HorizonScoreV3 | null;
  sourceConfidence: number;
  independentClasses: number;
  hasOfficialOrResearch: boolean;
}): FormalResearchStatusV3 {
  if (!input.inDeepPool) return 'not_evaluated';
  if (input.criticalDataInvalid) return 'insufficient_evidence';
  if (input.valuation.status !== 'normal') return 'valuation_review';
  if (
    !input.thesis ||
    input.independentClasses < 2 ||
    input.thesis.availableWeight < 80 ||
    input.sourceConfidence < 0.6 ||
    (input.valuation.confidence ?? 0) < 0.6
  ) return 'insufficient_evidence';
  if (input.hasOfficialOrResearch && input.thesis.score >= 60) return 'formal_candidate';
  return 'formal_watch';
}

export function actionDecision(input: DecisionInputV3 & {
  currentPrice: number;
  p50UpsidePct: number | null;
  p10DownsidePct: number | null;
  liquidityFactor: number | null;
  triggerCapable: boolean;
  entryTrigger: string | null;
  stopPrice: number | null;
  evidenceExpiresAt: string | null;
  technicalState: 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' |
    'breakout_confirmed' | 'extended' | 'invalidated' | null;
  qualityActionEligible: boolean;
  biasSafetyObserveOnly: boolean;
}): ActionDecisionV3 {
  const buyInvalidation: ActionDecisionV3['invalidation'] =
    input.stopPrice != null && input.evidenceExpiresAt
      ? { code: 'price_stop_or_evidence_expiry', stopPrice: input.stopPrice, evidenceExpiresAt: input.evidenceExpiresAt }
      : input.stopPrice == null && input.evidenceExpiresAt
        ? { code: 'evidence_expiry_only', stopPrice: null, evidenceExpiresAt: input.evidenceExpiresAt }
        : { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null };
  const waitInvalidation: ActionDecisionV3['invalidation'] = input.evidenceExpiresAt
    ? { code: 'evidence_expiry_only', stopPrice: null, evidenceExpiresAt: input.evidenceExpiresAt }
    : { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null };
  const base = {
    decisionAuthority: 'research_only' as const,
    publicationEligible: false as const,
    primaryHorizon: (primaryScore(input)?.horizon ?? null) as ActionDecisionV3['primaryHorizon'],
    initialPositionPct: 0,
    maximumPositionPct: 0,
    confidence: primaryScore(input)?.confidence ?? 0,
    existingPositionAction: 'no_position' as const,
    existingTargetExposurePct: null,
    existingReason: 'portfolio_context_unavailable' as const,
    entryTrigger: null,
    invalidation: { code: 'data_integrity_review', stopPrice: null, evidenceExpiresAt: null } as ActionDecisionV3['invalidation'],
  };
  if (input.criticalDataInvalid) return { ...base, newPositionAction: 'avoid', blockReasons: ['data_integrity'] };
  if (input.valuation.status !== 'normal') {
    const valuationReasons = input.valuation.reasons.slice(0, 5);
    return {
      ...base,
      newPositionAction: 'valuation_review',
      blockReasons: valuationReasons.length ? valuationReasons : ['valuation_unavailable'],
    };
  }
  if (input.technicalState == null) {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['entry_data_unavailable'] };
  }
  if (input.technicalState === 'invalidated') {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['entry_invalidated'] };
  }
  if (input.technicalState === 'below_support' || input.technicalState === 'reclaim_required') {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['entry_unconfirmed'] };
  }
  if (input.biasSafetyObserveOnly === true) {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['bias_observe_only'] };
  }
  if (input.qualityActionEligible !== true) {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['quality_insufficient'] };
  }
  if (input.market.regime === 'risk_off') return { ...base, newPositionAction: 'avoid', blockReasons: ['market_risk_off'] };
  const buyGeometryValid =
    typeof input.currentPrice === 'number' && Number.isFinite(input.currentPrice) && input.currentPrice > 0 &&
    typeof input.stopPrice === 'number' && Number.isFinite(input.stopPrice) && input.stopPrice > 0 && input.stopPrice < input.currentPrice &&
    typeof input.entryTrigger === 'string' && input.entryTrigger.trim().length > 0;
  if (input.entryConfirmed && input.triggerCapable && !buyGeometryValid) {
    return { ...base, newPositionAction: 'avoid', blockReasons: ['entry_data_unavailable'] };
  }
  const score = primaryScore(input);
  const rewardOkay = (input.p50UpsidePct ?? -Infinity) >= 15 && (input.p10DownsidePct ?? -Infinity) >= -12;
  if (
    input.valuation.status === 'normal' &&
    score &&
    score.score >= 70 &&
    score.confidence >= 0.65 &&
    rewardOkay &&
    input.triggerCapable &&
    input.entryConfirmed &&
    !input.technicallyExtended
  ) {
    return { ...base, newPositionAction: 'starter_now', initialPositionPct: 5, maximumPositionPct: 10,
      blockReasons: [], entryTrigger: input.entryTrigger, invalidation: buyInvalidation };
  }
  const eventConfidence = input.momentum ? (input.momentum.availableWeight / 100) * input.sourceConfidence : 0;
  if (
    input.formalStatus !== 'formal_candidate' &&
    (input.sourceClass === 'official' || input.sourceClass === 'public_research') &&
    (input.momentum?.score ?? 0) >= 70 &&
    eventConfidence >= 0.6 &&
    (input.liquidityFactor ?? 0) >= 50 &&
    input.valuation.status === 'normal' &&
    input.triggerCapable &&
    input.entryConfirmed &&
    !input.technicallyExtended
  ) {
    return {
      ...base,
      primaryHorizon: 'momentum_5_20d',
      newPositionAction: 'event_starter',
      initialPositionPct: 3,
      maximumPositionPct: 10,
      confidence: roundHalfAwayFromZero(eventConfidence, 4),
      blockReasons: [],
      entryTrigger: input.entryTrigger,
      invalidation: buyInvalidation,
    };
  }
  if (score && score.score >= 60 && score.confidence >= 0.45 && rewardOkay && input.triggerCapable && (!input.entryConfirmed || input.technicallyExtended)) {
    return { ...base, newPositionAction: 'wait_trigger', blockReasons: ['entry_unconfirmed'],
      entryTrigger: input.entryTrigger, invalidation: waitInvalidation };
  }
  const reason =
    !score || score.score < 60 ? 'score_below_threshold'
      : score.confidence < 0.45 ? 'confidence_below_threshold'
        : input.valuation.status !== 'normal' ? 'valuation_unavailable'
          : !rewardOkay ? 'valuation_reward_risk'
            : !input.triggerCapable ? 'entry_data_unavailable'
              : 'entry_unconfirmed';
  return { ...base, newPositionAction: 'avoid', blockReasons: [reason] };
}
