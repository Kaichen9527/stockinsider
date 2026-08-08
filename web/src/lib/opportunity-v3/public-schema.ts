import {
  ACCEPTANCE_VERSION_V3,
  ENGINE_CONTRACT_V3,
  type AssistiveArtifactSummaryV3,
  type ChangedBecauseV3,
  type EngineWarningV3,
  type FactorKeyV3,
  type FormalResearchStatusV3,
  type HorizonV3,
  type MissedSourceAuditV3,
  type NewPositionActionV3,
  type OpportunityCardV3,
  type OpportunityEngineAvailableV3,
  type PublicActionDecisionV3,
  type PublicMarketContextV3,
  type SectorCycleV3,
  type SourceClassV3,
  type SourceConnectorAccountingV3,
  type SourceFunnelSummaryV3,
  type ValuationDistributionV3,
  type VerifiedChangeBriefV3,
  type VerifiedChangeKindV3,
  type VerifiedChangeLaneKeyV3,
  type VerifiedChangeWorkspaceV3,
} from './contracts.ts';
import { canonicalJson } from './canonical.ts';
import { validActionDecisionV3 } from './decision.ts';
import { marketContext as deriveMarketContext } from './market.ts';

type JsonRecord = Record<string, unknown>;

const HORIZONS: HorizonV3[] = ['momentum_5_20d', 'swing_20_60d', 'thesis_120_250d'];
export const FACTORS: FactorKeyV3[] = ['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'];
const SOURCE_CLASSES: SourceClassV3[] = ['official', 'public_research', 'curated_thesis', 'community'];
const FORMAL_STATES: FormalResearchStatusV3[] = [
  'not_evaluated', 'insufficient_evidence', 'valuation_review', 'formal_watch', 'formal_candidate',
];
const ACTIONS: NewPositionActionV3[] = ['avoid', 'valuation_review', 'wait_trigger', 'event_starter', 'starter_now'];
export const LANE_KEYS: VerifiedChangeLaneKeyV3[] = [
  'new_verified_change', 'strengthened_thesis', 'contradiction_or_review',
];
const CHANGE_KINDS: VerifiedChangeKindV3[] = [
  'official_event', 'fundamental_update', 'valuation_update', 'source_corroboration', 'contradiction',
];
const WARNINGS: EngineWarningV3[] = [
  'connector_degraded', 'market_incomplete', 'sector_cycle_unknown', 'source_audit_pending',
  'prior_lineage_missing', 'valuation_missing', 'shadow_only',
];
const SOURCE_KEYS = [
  'bulltalk', 'earnings_call', 'instagram', 'investanchors', 'mops_material_event', 'podcast',
  'ptt', 'public_broker_research', 'telegram', 'threads', 'youtube',
];
const DOCUMENT_OUTCOMES = [
  'duplicate_document', 'expired_document', 'parse_failure', 'processed_no_claim', 'processed_with_claims',
] as const;
const CLAIM_OUTCOMES = ['unique_claim', 'duplicate_claim'] as const;
const MENTION_OUTCOMES = [
  'linked_new', 'linked_refresh', 'linked_duplicate_claim', 'ambiguous_symbol',
  'rejected_low_confidence', 'unsupported_instrument',
] as const;
const MENTION_REASONS = [
  'explicit_ticker_context', 'exact_unique_alias_context', 'ambiguous_number', 'ambiguous_alias',
  'fuzzy_below_auto_threshold', 'below_min_confidence', 'inactive_or_unknown_symbol',
  'missing_stock_context', 'unsupported_market', 'non_common_stock',
  'unsupported_instrument_type', 'duplicate_claim_link',
] as const;
const VALUATION_METHODS = ['pe','normalized_pe','ev_ebitda','pb_roe','residual_income','nav','ev_sales'] as const;
const VALUATION_REASONS = [
  'no_eligible_method','missing_required_inputs','insufficient_series','insufficient_multiple_reference',
  'cross_check_unavailable','missing_financial_manifest','stale_financial_inputs',
  'conflicting_point_in_time_fact','invalid_unit','missing_bridge_inputs','nonconsecutive_quarters',
  'operating_bridge_mismatch','pretax_bridge_mismatch','net_income_bridge_mismatch','share_count_conflict',
  'reported_eps_mismatch','tax_rate_outlier','capital_structure_conflict','non_finite_bridge',
  'negative_equity_value','invalid_capital_structure','non_finite_distribution','distribution_ordering',
  'unverified_base_upside','unverified_scenario_upside','consensus_divergence','method_divergence',
] as const;
const REPORTED_PE_REASONS = [
  'authority_conflict','non_positive_reported_pe','insufficient_own_history','sector_reference_insufficient',
  'missing_official_pe','missing_shares_outstanding','calendar_authority_mismatch','manifest_missing',
  'manifest_hash_mismatch',
] as const;
const BIAS_REASONS = [
  'technical_unavailable','insufficient_own_history','sector_reference_insufficient','manifest_missing',
  'manifest_hash_mismatch',
] as const;

function record(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exact(value: unknown, keys: readonly string[]): value is JsonRecord {
  if (!record(value)) return false;
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function member<T extends string>(value: unknown, values: readonly T[]): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function text(value: unknown, maximum = 512, minimum = 1): value is string {
  return typeof value === 'string' && [...value].length >= minimum && [...value].length <= maximum;
}

function normalizedText(value: unknown, maximum: number): value is string {
  return text(value, maximum) &&
    value === value.normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function nullableText(value: unknown, maximum = 512): value is string | null {
  return value === null || text(value, maximum);
}

function finite(value: unknown, minimum = -Number.MAX_VALUE, maximum = Number.MAX_VALUE): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function integer(value: unknown, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): value is number {
  return Number.isSafeInteger(value) && Number(value) >= minimum && Number(value) <= maximum;
}

function utc(value: unknown): value is string {
  return typeof value === 'string' &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(value) &&
    Number.isFinite(Date.parse(value));
}

function symbol(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9A-Z]{4,10}$/u.test(value);
}

function uuid(value: unknown): value is string {
  return typeof value === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(value);
}

function uniqueStrings(value: unknown, maximum: number, allowEmpty = true): value is string[] {
  return Array.isArray(value) &&
    (allowEmpty || value.length > 0) &&
    value.length <= maximum &&
    value.every((item) => text(item, 120)) &&
    new Set(value).size === value.length;
}

function exactCountMap(value: unknown, keys: readonly string[]): value is Record<string, number> {
  return exact(value, keys) && keys.every((key) => integer(value[key]));
}

function validPublicDecision(
  value: unknown,
  sourceCutoff?: string,
): value is PublicActionDecisionV3 {
  return validActionDecisionV3(value, { publicShape: true, sourceCutoff });
}

function validQuantiles(value: unknown): boolean {
  return value === null ||
    (exact(value, ['p10', 'p50', 'p90']) &&
      finite(value.p10) && finite(value.p50) && finite(value.p90) &&
      value.p10 <= value.p50 && value.p50 <= value.p90);
}

function validValuationScenario(value: unknown, caseName: 'bear'|'base'|'bull'): boolean {
  if (value === null) return true;
  if (!exact(value, ['case','value','asOf','inputs','sensitivity']) || value.case !== caseName ||
    !finite(value.value) || !utc(value.asOf) || !Array.isArray(value.inputs) ||
    value.inputs.length < 1 || value.inputs.length > 24 || !Array.isArray(value.sensitivity) ||
    value.sensitivity.length !== 4) return false;
  const inputsValid = value.inputs.every((input) => exact(input, ['key','value','unit','sourceRef','asOf']) &&
    text(input.key, 80) && finite(input.value) && text(input.unit, 40) &&
    text(input.sourceRef, 160) && utc(input.asOf));
  const hasOfficialFormulaInput = value.inputs.some((input) => record(input) &&
    typeof input.sourceRef === 'string' && /^(?:official|mops|twse|tpex|company):/u.test(input.sourceRef));
  const expectedSensitivity = [
    ['fundamental', -0.1], ['fundamental', 0.1],
    ['multiple_or_discount', -0.1], ['multiple_or_discount', 0.1],
  ] as const;
  const sensitivityValid = value.sensitivity.every((row, index) =>
    exact(row, ['key','delta','result']) && row.key === expectedSensitivity[index][0] &&
    row.delta === expectedSensitivity[index][1] && finite(row.result));
  return inputsValid && hasOfficialFormulaInput && sensitivityValid;
}

function validValuationCrossChecks(value: unknown): boolean {
  return Array.isArray(value) && value.length <= 2 && value.every((row) => exact(row,
    ['method','bear','base','bull','asOf','evidenceRefs'])
    && member(row.method, ['pe','normalized_pe','ev_ebitda','pb_roe','residual_income','nav','ev_sales'])
    && finite(row.bear) && finite(row.base) && finite(row.bull) && row.bear <= row.base && row.base <= row.bull
    && utc(row.asOf) && uniqueStrings(row.evidenceRefs, 8));
}

function validValuation(value: unknown): value is ValuationDistributionV3 {
  if (!exact(value, [
    'status', 'method', 'p10', 'p50', 'p90', 'bear', 'base', 'bull', 'crossChecks', 'confidence', 'reasons', 'asOf', 'evidenceRefs',
    'verificationRef', 'referenceManifestRef', 'historicalSampleCount', 'peerSampleCount',
    'historicalReferenceQuantiles', 'peerReferenceQuantiles', 'relativeMultiple',
  ]) || !member(value.status, ['normal', 'missing', 'stale', 'outlier_review']) ||
    !(value.method === null || member(value.method, VALUATION_METHODS)) ||
    !validValuationScenario(value.bear, 'bear') || !validValuationScenario(value.base, 'base') ||
    !validValuationScenario(value.bull, 'bull') || !validValuationCrossChecks(value.crossChecks) ||
    !Array.isArray(value.reasons) || value.reasons.length > 8 ||
    !value.reasons.every((reason, index) => member(reason, VALUATION_REASONS) &&
      (index === 0 || VALUATION_REASONS.indexOf((value.reasons as string[])[index - 1] as never) < VALUATION_REASONS.indexOf(reason))) ||
    !utc(value.asOf) ||
    !uniqueStrings(value.evidenceRefs, 8) ||
    !nullableText(value.verificationRef, 120) ||
    !nullableText(value.referenceManifestRef, 120) ||
    !integer(value.historicalSampleCount, 0, 20) ||
    !integer(value.peerSampleCount, 0, 20_000) ||
    !validQuantiles(value.historicalReferenceQuantiles) ||
    !validQuantiles(value.peerReferenceQuantiles) || !validRelativeMultiple(value.relativeMultiple)) return false;
  const values = [value.p10, value.p50, value.p90];
  const nullDistribution = values.every((item) => item === null) && value.confidence === null &&
    value.bear === null && value.base === null && value.bull === null;
  const fullDistribution = value.method !== null && values.every((item) => finite(item, 0, 1_000_000_000)) &&
    Number(value.p10) <= Number(value.p50) && Number(value.p50) <= Number(value.p90) &&
    finite(value.confidence, 0, 1) && record(value.bear) && record(value.base) && record(value.bull) &&
    value.bear.value === value.p10 && value.base.value === value.p50 && value.bull.value === value.p90;
  if (value.status === 'normal') return fullDistribution && value.reasons.length === 0;
  if (value.status === 'missing') return value.method === null && nullDistribution;
  if (value.status === 'stale') return value.method !== null && nullDistribution &&
    value.reasons.includes('stale_financial_inputs');
  const bridgeFailure = member(value.reasons[0], [
    'missing_bridge_inputs','operating_bridge_mismatch','pretax_bridge_mismatch','net_income_bridge_mismatch',
    'share_count_conflict','reported_eps_mismatch','tax_rate_outlier','capital_structure_conflict',
    'non_finite_bridge','negative_equity_value','invalid_capital_structure','non_finite_distribution',
  ]);
  return value.reasons.length > 0 && (fullDistribution || nullDistribution) &&
    (value.method !== null || bridgeFailure);
}

function validRelativeMultiple(value: unknown): boolean {
  if (!exact(value, ['exchangeReportedPe', 'ownHistory', 'sector', 'modelComparablePe'])) return false;
  const current = value.exchangeReportedPe;
  const own = value.ownHistory;
  const sector = value.sector;
  if (!record(current) || !record(own) || !record(sector)) return false;
  const currentValid = current.status === 'available'
    ? exact(current, ['status','reason','value','asOf','sourceRef','manifestRef']) && current.reason === null && finite(current.value, 0) && utc(current.asOf) && text(current.sourceRef, 120) && text(current.manifestRef, 120)
    : exact(current, ['status','reason','value','asOf','sourceRef','manifestRef']) && current.status === 'unavailable' && member(current.reason, REPORTED_PE_REASONS) && current.value === null && current.asOf === null && current.sourceRef === null && nullableText(current.manifestRef, 120);
  const ownValid = own.status === 'available'
    ? exact(own, ['status','reason','count','p10','p25','p50','p75','p90','currentPercentile','asOf','manifestRef']) && own.reason === null && integer(own.count, 252) && [own.p10,own.p25,own.p50,own.p75,own.p90].every((item) => finite(item, 0)) && Number(own.p10) <= Number(own.p25) && Number(own.p25) <= Number(own.p50) && Number(own.p50) <= Number(own.p75) && Number(own.p75) <= Number(own.p90) && finite(own.currentPercentile, 0, 1) && utc(own.asOf) && text(own.manifestRef, 120)
    : exact(own, ['status','reason','count','p10','p25','p50','p75','p90','currentPercentile','asOf','manifestRef']) && own.status === 'unavailable' && integer(own.count) && member(own.reason, REPORTED_PE_REASONS) && [own.p10,own.p25,own.p50,own.p75,own.p90,own.currentPercentile,own.asOf].every((item) => item === null) && nullableText(own.manifestRef, 120);
  const sectorValid = sector.status === 'available'
    ? exact(sector, ['status','reason','count','p25','p50','p75','capWeightedAggregate','asOf','manifestRef']) && sector.reason === null && integer(sector.count, 8) && [sector.p25,sector.p50,sector.p75,sector.capWeightedAggregate].every((item) => finite(item, 0)) && Number(sector.p25) <= Number(sector.p50) && Number(sector.p50) <= Number(sector.p75) && utc(sector.asOf) && text(sector.manifestRef, 120)
    : exact(sector, ['status','reason','count','p25','p50','p75','capWeightedAggregate','asOf','manifestRef']) && sector.status === 'unavailable' && integer(sector.count) && member(sector.reason, REPORTED_PE_REASONS) && [sector.p25,sector.p50,sector.p75,sector.capWeightedAggregate,sector.asOf].every((item) => item === null) && nullableText(sector.manifestRef, 120);
  const model = value.modelComparablePe;
  const modelValid = model === null || (exact(model, ['value','method','asOf','sourceRefs','reason']) && (
    (finite(model.value, 0) && member(model.method, ['pe','normalized_pe']) && utc(model.asOf) &&
      uniqueStrings(model.sourceRefs, 8) && model.reason === null) ||
    (model.value === null && model.method === null && model.asOf === null && Array.isArray(model.sourceRefs) &&
      model.sourceRefs.length === 0 && member(model.reason, ['negative_eps','method_not_pe','valuation_review']))
  ));
  return currentValid && ownValid && sectorValid && modelValid;
}

function validSectorCycle(value: unknown): value is SectorCycleV3 {
  if (!exact(value, [
    'contractVersion', 'state', 'levelScore', 'changeScore', 'marketScore', 'matchedRule',
    'inputs', 'reasons', 'asOf',
  ])) return false;
  const inputKeys = [
    'sector_revenue_yoy_median', 'sector_eps_yoy_median', 'sector_revenue_acceleration_median',
    'sector_operating_margin_delta_median', 'sector_excess_return_20d',
    'sector_excess_return_60d', 'sector_ad_breadth_20d',
  ];
  return value.contractVersion === 'sector-cycle-v3.0' &&
    member(value.state, ['early_recovery', 'expansion', 'late_expansion', 'contraction', 'unknown']) &&
    [value.levelScore, value.changeScore, value.marketScore].every((item) => item === null || finite(item, 0, 100)) &&
    member(value.matchedRule, ['unavailable', 'contraction', 'early_recovery', 'expansion', 'late_expansion', 'no_rule_match']) &&
    Array.isArray(value.inputs) &&
    value.inputs.length <= inputKeys.length &&
    value.inputs.every((item) =>
      exact(item, ['key', 'value', 'observedAt', 'sourceRef', 'status']) &&
      member(item.key, inputKeys) &&
      (item.value === null || finite(item.value)) &&
      (item.observedAt === null || utc(item.observedAt)) &&
      nullableText(item.sourceRef, 120) &&
      member(item.status, ['fresh', 'stale', 'missing'])) &&
    new Set(value.inputs.map((item) => item.key)).size === value.inputs.length &&
    Array.isArray(value.reasons) &&
    value.reasons.length <= 5 &&
    value.reasons.every((item) => member(item, [
      'missing_level_inputs', 'missing_change_inputs', 'missing_market_inputs',
      'insufficient_sector_reference', 'no_rule_match',
    ])) &&
    new Set(value.reasons).size === value.reasons.length &&
    utc(value.asOf);
}

function validChangedBecause(value: unknown): value is ChangedBecauseV3[] {
  return Array.isArray(value) && value.length <= 3 && value.every((item) => {
    if (!record(item) || !member(item.code, [
      'candidate_state_changed', 'new_position_action_changed',
      'formal_status_changed', 'factor_contribution_changed',
    ])) return false;
    if (item.code === 'factor_contribution_changed') {
      return exact(item, ['code', 'factor', 'delta']) && member(item.factor, FACTORS) && finite(item.delta);
    }
    if (!exact(item, ['code', 'from', 'to'])) return false;
    if (item.code === 'candidate_state_changed') {
      return member(item.from, ['actionable_now', 'waiting_trigger', 'valuation_review', 'avoid']) &&
        member(item.to, ['actionable_now', 'waiting_trigger', 'valuation_review', 'avoid']);
    }
    if (item.code === 'new_position_action_changed') {
      return member(item.from, ACTIONS) && member(item.to, ACTIONS);
    }
    return member(item.from, FORMAL_STATES) && member(item.to, FORMAL_STATES);
  });
}

function validFactorAxes(value: unknown): boolean {
  if (!exact(value, ['discovery','quality','valuation','timingRisk'])) return false;
  const discovery = value.discovery;
  const quality = value.quality;
  const valuation = value.valuation;
  const timing = value.timingRisk;
  if (!record(discovery) || !record(quality) || !record(valuation) || !record(timing)) return false;
  const discoveryValid = exact(discovery, ['status','reason','score']) && (
    (member(discovery.status, ['new','continued']) && discovery.reason === null && finite(discovery.score, 0, 100)) ||
    (discovery.status === 'unavailable' && discovery.reason === 'insufficient_source_evidence' && discovery.score === null)
  );
  const componentKeys = ['roicOrRoe','growthAcceleration','marginTrend','cashConversionAccruals','leverageInterestCover','revisions'];
  const qualityComponents = record(quality.components) ? quality.components : null;
  const qualityCommon = exact(qualityComponents, componentKeys) && componentKeys.every((key) =>
    qualityComponents[key] === null || finite(qualityComponents[key], 0, 100)) &&
    finite(quality.availableWeight, 0, 1);
  const qualityValid = exact(quality, ['status','reason','score','availableWeight','components','referenceManifestRef']) && qualityCommon && (
    (quality.status === 'available' && quality.reason === null && finite(quality.score, 0, 100) && text(quality.referenceManifestRef, 120)) ||
    (quality.status === 'unavailable' && member(quality.reason, ['insufficient_quality_inputs','quality_reference_insufficient']) &&
      quality.score === null && nullableText(quality.referenceManifestRef, 120))
  );
  const valuationValid = exact(valuation, ['status','score','reason']) && (
    (valuation.status === 'normal' && finite(valuation.score, 0, 100) && valuation.reason === null) ||
    (valuation.status === 'valuation_review' && valuation.score === null && member(valuation.reason, [
      'valuation_review','authority_conflict','missing_official_pe','non_positive_reported_pe',
      'insufficient_own_history','sector_reference_insufficient','calendar_authority_mismatch',
      'manifest_missing','manifest_hash_mismatch',
    ]))
  );
  const shadow = timing.shadowBiasPoints;
  const shadowValid = exact(shadow, HORIZONS) && HORIZONS.every((horizon) =>
    shadow[horizon] === null || finite(shadow[horizon], -100, 100));
  const timingValid = exact(timing, ['status','score','reason','shadowBiasPoints']) && shadowValid && (
    (member(timing.status, ['buy_eligible','wait_trigger']) && finite(timing.score, 0, 100) && timing.reason === null) ||
    (timing.status === 'observe_only' && timing.score === null && timing.reason === 'bias_observe_only') ||
    (timing.status === 'blocked' && timing.score === null && member(timing.reason, ['below_support','reclaim_required','invalidated'])) ||
    (timing.status === 'unavailable' && timing.score === null && timing.reason === 'technical_unavailable' &&
      HORIZONS.every((horizon) => shadow[horizon] === null))
  );
  return discoveryValid && qualityValid && valuationValid && timingValid;
}

function validBiasHistory(value: unknown, sector = false): boolean {
  const keys = sector
    ? ['status','reason','count','p10','p25','p50','p75','p90','asOf','manifestRef']
    : ['status','reason','count','p10','p25','p50','p75','p90','label','asOf','manifestRef'];
  if (!exact(value, keys) || !integer(value.count)) return false;
  const quantileKeys = ['p10','p25','p50','p75','p90'];
  if (value.status === 'available') return value.reason === null &&
    quantileKeys.every((key) => finite(value[key])) && Number(value.p10) <= Number(value.p25) && Number(value.p25) <= Number(value.p50) &&
    Number(value.p50) <= Number(value.p75) && Number(value.p75) <= Number(value.p90) && utc(value.asOf) && text(value.manifestRef, 120) &&
    (sector || member(value.label, ['extreme_low','low','normal','high','extended']));
  return value.status === 'unavailable' && member(value.reason, BIAS_REASONS) &&
    quantileKeys.every((key) => value[key] === null) && value.asOf === null && nullableText(value.manifestRef, 120) &&
    (sector || value.label === null);
}

function validMaDeviation(value: unknown): boolean {
  if (!exact(value, [
    'availability','reason','bias20Pct','bias60Pct','bias120Pct','bias20Atr','ownHistory','sector',
  ]) || !validBiasHistory(value.ownHistory) || !validBiasHistory(value.sector, true)) return false;
  if (value.availability === 'available') return value.reason === null &&
    ['bias20Pct','bias60Pct','bias120Pct','bias20Atr'].every((key) => finite(value[key]));
  return value.availability === 'unavailable' && member(value.reason, BIAS_REASONS) &&
    ['bias20Pct','bias60Pct','bias120Pct','bias20Atr'].every((key) => value[key] === null);
}

function validTechnicalDecision(value: unknown): boolean {
  if (!record(value) || value.contractVersion !== 'opportunity-technical-decision-v3.11.1' || !utc(value.asOf) || !validMaDeviation(value.maDeviation)) return false;
  if (value.availability === 'unavailable') {
    return exact(value, ['contractVersion','availability','state','reason','asOf','trigger','entryZone','invalidation','indicators','maDeviation']) &&
      value.state === null && member(value.reason, [
        'insufficient_adjusted_history','corporate_action_authority_missing','invalid_ohlcv',
        'nonconsecutive_sessions','future_observation','volume_reference_unavailable',
        'taiex_reference_unavailable','insufficient_support_structure','invalid_entry_geometry',
      ]) && value.trigger === null && value.entryZone === null && value.invalidation === null && value.indicators === null;
  }
  if (value.availability !== 'available' || !exact(value, [
    'contractVersion','availability','state','reason','asOf','currentPrice','support','resistance',
    'trigger','entryZone','invalidation','indicators','maDeviation',
  ]) || !member(value.state, ['below_support','reclaim_required','at_support','breakout_pending','breakout_confirmed','extended','invalidated']) ||
    value.reason !== null || !finite(value.currentPrice) || value.currentPrice <= 0 ||
    !finite(value.support) || value.support <= 0 || !finite(value.resistance) || value.resistance <= value.support) return false;
  const trigger = value.trigger;
  const triggerValid = trigger === null || (exact(trigger, ['kind','threshold','volumeRatioMinimum']) &&
    member(trigger.kind, ['reclaim','breakout','pullback']) && finite(trigger.threshold) && trigger.threshold > 0 &&
    (trigger.volumeRatioMinimum === null || finite(trigger.volumeRatioMinimum, 0)));
  const entry = value.entryZone;
  const entryValid = entry === null || (exact(entry, ['kind','lower','upper']) &&
    member(entry.kind, ['market_zone','trigger_zone']) && finite(entry.lower) && entry.lower > 0 &&
    finite(entry.upper) && entry.upper >= entry.lower);
  const invalidation = value.invalidation;
  const invalidationValid = invalidation === null || (exact(invalidation, ['stop','thesisLevel']) &&
    finite(invalidation.stop) && invalidation.stop > 0 && finite(invalidation.thesisLevel) &&
    invalidation.thesisLevel === value.support && record(entry) && invalidation.stop < Number(entry.lower));
  const indicators = value.indicators;
  const indicatorKeys = ['ma20','ma60','ma120','rsi14','macd','macdSignal','macdHistogram','atr14',
    'volumeRatio20','relativeStrengthTaiex20','relativeStrengthSector20'];
  const indicatorsValid = exact(indicators, indicatorKeys) &&
    ['ma20','ma60','ma120'].every((key) => finite(indicators[key]) && indicators[key] > 0) &&
    finite(indicators.rsi14, 0, 100) && finite(indicators.macd) && finite(indicators.macdSignal) &&
    finite(indicators.macdHistogram) && finite(indicators.atr14) && indicators.atr14 > 0 &&
    finite(indicators.volumeRatio20, 0) && finite(indicators.relativeStrengthTaiex20) &&
    (indicators.relativeStrengthSector20 === null || finite(indicators.relativeStrengthSector20));
  if (!triggerValid || !entryValid || !invalidationValid || !indicatorsValid) return false;
  if (value.state === 'invalidated') return trigger === null && entry === null && invalidation === null;
  if (value.state === 'below_support' || value.state === 'reclaim_required') {
    return record(trigger) && trigger.kind === 'reclaim' && trigger.volumeRatioMinimum === 1.2 &&
      entry === null && invalidation === null;
  }
  if (value.state === 'extended') {
    return record(trigger) && trigger.kind === 'pullback' && trigger.volumeRatioMinimum === null &&
      entry === null && invalidation === null;
  }
  if (value.state === 'breakout_pending') {
    return record(trigger) && trigger.kind === 'breakout' && trigger.volumeRatioMinimum === 1.2 &&
      record(entry) && entry.kind === 'trigger_zone' && value.currentPrice < Number(entry.lower) && record(invalidation);
  }
  return trigger === null && record(entry) && entry.kind === 'market_zone' &&
    Number(entry.lower) <= value.currentPrice && value.currentPrice <= Number(entry.upper) && record(invalidation);
}

export function validOpportunityCardV3(
  value: unknown,
  runId?: string,
  sourceCutoff?: string,
): value is OpportunityCardV3 {
  if (!exact(value, [
    'symbol', 'chineseName', 'detailPath', 'directSource', 'candidateState', 'primaryHorizon',
    'rank', 'score', 'scoreDelta', 'factorScores', 'factorAxes', 'availableWeight', 'sourceRefs', 'sourceSummary',
    'researchMaturity', 'fundamental', 'formalResearchStatus', 'actionDecision', 'valuation',
    'technicalDecision', 'sectorCycle', 'changedBecause', 'lastEvaluatedAt', 'analysisGeneratedAt',
    'materialChangeHash', 'materialChangedBecause', 'noChangeMessage',
  ])) return false;
  const expectedPath = runId === undefined ? null : `/opportunity-v3/${runId}/${String(value.symbol)}`;
  const action = record(value.actionDecision) ? String(value.actionDecision.newPositionAction) : '';
  const expectedState = ['starter_now', 'event_starter'].includes(action) ? 'actionable_now'
    : action === 'wait_trigger' ? 'waiting_trigger'
      : action === 'valuation_review' ? 'valuation_review' : 'avoid';
  const stopMatchesTechnical = !['starter_now', 'event_starter'].includes(action) ||
    (record(value.technicalDecision) && record(value.technicalDecision.invalidation) &&
      record(value.actionDecision) && record(value.actionDecision.invalidation) &&
      value.actionDecision.invalidation.stopPrice === value.technicalDecision.invalidation.stop);
  const technicalEntry = record(value.technicalDecision)
    ? record(value.technicalDecision.entryZone) ? canonicalJson(value.technicalDecision.entryZone).slice(0, 160)
      : record(value.technicalDecision.trigger) ? canonicalJson(value.technicalDecision.trigger).slice(0, 160) : null
    : null;
  const actionableGeometry = !['starter_now', 'event_starter'].includes(action) ||
    (record(value.technicalDecision) &&
      ['at_support','breakout_confirmed'].includes(String(value.technicalDecision.state)) &&
      record(value.technicalDecision.entryZone) && record(value.technicalDecision.invalidation) &&
      record(value.actionDecision) && value.actionDecision.entryTrigger === technicalEntry);
  const waitGeometry = action !== 'wait_trigger' ||
    (record(value.technicalDecision) &&
      ['breakout_pending','extended'].includes(String(value.technicalDecision.state)) &&
      record(value.technicalDecision.trigger) && record(value.actionDecision) &&
      value.actionDecision.entryTrigger === technicalEntry);
  const horizonMatches = record(value.actionDecision) &&
    value.primaryHorizon === value.actionDecision.primaryHorizon;
  return symbol(value.symbol) &&
    nullableText(value.chineseName, 40) &&
    text(value.detailPath, 80) &&
    (expectedPath === null || value.detailPath === expectedPath) &&
    typeof value.directSource === 'boolean' &&
    value.candidateState === expectedState &&
    member(value.primaryHorizon, HORIZONS.slice(0, 2)) &&
    integer(value.rank, 1) &&
    finite(value.score, 0, 100) &&
    (value.scoreDelta === null || finite(value.scoreDelta, -100, 100)) &&
    exact(value.factorScores, FACTORS) &&
    FACTORS.every((factor) => finite((value.factorScores as JsonRecord)[factor], 0, 100)) &&
    validFactorAxes(value.factorAxes) &&
    finite(value.availableWeight, 0, 100) &&
    uniqueStrings(value.sourceRefs, 5, false) &&
    exact(value.sourceSummary, [
      'anchorSourceKey', 'anchorSourceClass', 'anchorEffectiveAt', 'independentRootCount',
    ]) &&
    member(value.sourceSummary.anchorSourceKey, SOURCE_KEYS) &&
    member(value.sourceSummary.anchorSourceClass, SOURCE_CLASSES) &&
    utc(value.sourceSummary.anchorEffectiveAt) &&
    integer(value.sourceSummary.independentRootCount, 1, 4_000_000) &&
    member(value.researchMaturity, ['source_signal','fundamental_review','decision_ready']) &&
    exact(value.fundamental, ['thesis','latestChange','risks','evidenceRefs','asOf']) &&
    text(value.fundamental.thesis, 500) && text(value.fundamental.latestChange, 500) &&
    uniqueStrings(value.fundamental.risks, 8) && uniqueStrings(value.fundamental.evidenceRefs, 8) && utc(value.fundamental.asOf) &&
    member(value.formalResearchStatus, FORMAL_STATES) &&
    validPublicDecision(value.actionDecision, sourceCutoff) && horizonMatches &&
    validValuation(value.valuation) &&
    validTechnicalDecision(value.technicalDecision) && stopMatchesTechnical && actionableGeometry && waitGeometry &&
    validSectorCycle(value.sectorCycle) &&
    validChangedBecause(value.changedBecause) &&
    utc(value.lastEvaluatedAt) && utc(value.analysisGeneratedAt) &&
    typeof value.materialChangeHash === 'string' && /^[0-9a-f]{64}$/.test(value.materialChangeHash) &&
    uniqueStrings(value.materialChangedBecause, 7, true) && nullableText(value.noChangeMessage, 160);
}

export function validVerifiedChangeBriefV3(
  value: unknown,
  runId?: string,
  expectedSymbol?: string,
): value is VerifiedChangeBriefV3 {
  if (!exact(value, [
    'briefVersion', 'changeKind', 'headline', 'whatChanged', 'whyItMatters', 'verifiedAt',
    'sourceCutoff', 'evidenceRefs', 'independentSourceClassCount', 'contradictions',
    'formalResearchStatus', 'primaryHorizon', 'scoreDelta', 'detailPath', 'disclosure',
  ])) return false;
  const expectedPath = runId && expectedSymbol ? `/opportunity-v3/${runId}/${expectedSymbol}` : null;
  const contradictionOrder = [
    'conflicting_source', 'missing_official_confirmation', 'stale_evidence', 'valuation_outlier',
  ];
  const formalLabels = ['未評估', '證據不足', '估值待覆核', '正式觀察', '正式候選'];
  const horizonLabels = ['5–20 個交易日', '20–60 個交易日'];
  const copy = {
    official_event: ['已確認官方事件', '官方或公司事件已由不可變來源確認。'],
    fundamental_update: ['基本面證據更新', '基本面因子相較前次可比快照出現變化。'],
    valuation_update: ['估值證據更新', '估值因子或狀態相較前次可比快照出現變化。'],
    source_corroboration: ['取得獨立來源佐證', '新增或保留的獨立來源強化目前研究依據。'],
    contradiction: ['存在待覆核矛盾', '證據存在衝突、確認缺口、過期或估值異常。'],
  } as const;
  const kind = value.changeKind as VerifiedChangeKindV3;
  const symbolValue = expectedSymbol ?? (
    typeof value.detailPath === 'string' ? value.detailPath.split('/').at(-1) : undefined
  );
  const formalIndex = FORMAL_STATES.indexOf(value.formalResearchStatus as FormalResearchStatusV3);
  const horizonIndex = HORIZONS.slice(0, 2).indexOf(value.primaryHorizon as HorizonV3);
  const contradictions = Array.isArray(value.contradictions) ? value.contradictions : [];
  return value.briefVersion === 'verified-change-brief-v3.0' &&
    member(value.changeKind, CHANGE_KINDS) &&
    normalizedText(value.headline, 96) &&
    normalizedText(value.whatChanged, 280) &&
    normalizedText(value.whyItMatters, 280) &&
    typeof symbolValue === 'string' &&
    value.headline === `${symbolValue} ${copy[kind][0]}` &&
    value.whatChanged === copy[kind][1] &&
    formalIndex >= 0 && horizonIndex >= 0 &&
    value.whyItMatters ===
      `研究狀態：${formalLabels[formalIndex]}；主要觀察週期：${horizonLabels[horizonIndex]}。` &&
    utc(value.verifiedAt) &&
    utc(value.sourceCutoff) &&
    Date.parse(value.verifiedAt) <= Date.parse(value.sourceCutoff) &&
    uniqueStrings(value.evidenceRefs, 3, false) &&
    integer(value.independentSourceClassCount, 1, 4) &&
    contradictions.length <= 3 &&
    contradictions.every((item) =>
      exact(item, ['code', 'evidenceRef']) &&
      member(item.code, contradictionOrder) &&
      nullableText(item.evidenceRef, 120)) &&
    contradictions.every((item, index) =>
      index === 0 ||
      contradictionOrder.indexOf(String(contradictions[index - 1].code)) <
        contradictionOrder.indexOf(String(item.code))) &&
    (kind === 'contradiction') === (contradictions.length > 0) &&
    member(value.formalResearchStatus, FORMAL_STATES) &&
    member(value.primaryHorizon, HORIZONS.slice(0, 2)) &&
    (value.scoreDelta === null || finite(value.scoreDelta, -100, 100)) &&
    text(value.detailPath, 80) &&
    (expectedPath === null || value.detailPath === expectedPath) &&
    value.disclosure === 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
}

function compareWorkspaceItems(left: JsonRecord, right: JsonRecord): number {
  const leftBrief = left.brief as JsonRecord;
  const rightBrief = right.brief as JsonRecord;
  const verified = Date.parse(String(rightBrief.verifiedAt)) - Date.parse(String(leftBrief.verifiedAt));
  if (verified !== 0) return verified;
  const leftDelta = typeof leftBrief.scoreDelta === 'number' ? Math.abs(leftBrief.scoreDelta) : -1;
  const rightDelta = typeof rightBrief.scoreDelta === 'number' ? Math.abs(rightBrief.scoreDelta) : -1;
  if (leftDelta !== rightDelta) return rightDelta - leftDelta;
  return String(left.symbol).localeCompare(String(right.symbol), 'en', { sensitivity: 'variant' });
}

function validWorkspace(value: unknown, runId: string, sourceCutoff: string): value is VerifiedChangeWorkspaceV3 {
  if (!exact(value, ['status', 'lanes']) || !member(value.status, ['empty', 'available']) ||
      !Array.isArray(value.lanes) || value.lanes.length !== LANE_KEYS.length) return false;
  const symbols = new Set<string>();
  for (const [laneIndex, lane] of value.lanes.entries()) {
    if (!exact(lane, ['key', 'items']) || lane.key !== LANE_KEYS[laneIndex] ||
        !Array.isArray(lane.items) || lane.items.length > 8) return false;
    for (const [itemIndex, item] of lane.items.entries()) {
      if (!exact(item, ['symbol', 'chineseName', 'lane', 'brief', 'card']) ||
          item.lane !== lane.key || !symbol(item.symbol) || symbols.has(item.symbol) ||
          !nullableText(item.chineseName, 40) ||
          !validOpportunityCardV3(item.card, runId, sourceCutoff) ||
          !validVerifiedChangeBriefV3(item.brief, runId, item.symbol)) return false;
      const card = item.card;
      const brief = item.brief;
      if (card.symbol !== item.symbol ||
          card.chineseName !== item.chineseName ||
          card.detailPath !== brief.detailPath ||
          card.formalResearchStatus !== brief.formalResearchStatus ||
          card.primaryHorizon !== brief.primaryHorizon ||
          card.scoreDelta !== brief.scoreDelta ||
          brief.sourceCutoff !== sourceCutoff ||
          Date.parse(card.valuation.asOf) > Date.parse(sourceCutoff) ||
          Date.parse(card.fundamental.asOf) > Date.parse(sourceCutoff) ||
          Date.parse(String(card.technicalDecision.asOf)) > Date.parse(sourceCutoff) ||
          !brief.evidenceRefs.every((evidenceRef) => card.sourceRefs.includes(evidenceRef)) ||
          (lane.key === 'contradiction_or_review') !== (
            brief.contradictions.length > 0 ||
            ['insufficient_evidence', 'valuation_review'].includes(card.formalResearchStatus) ||
            card.actionDecision.newPositionAction === 'valuation_review'
          ) ||
          (itemIndex > 0 && compareWorkspaceItems(lane.items[itemIndex - 1], item) > 0)) return false;
      symbols.add(item.symbol);
    }
  }
  return symbols.size <= 18 && (value.status === 'empty') === (symbols.size === 0);
}

function validHomepageSummary(value: unknown, projection: OpportunityEngineAvailableV3): boolean {
  if (!exact(value, ['workspacePath', 'asOf', 'status', 'totalCount', 'laneCounts', 'topItems']) ||
      value.workspacePath !== '/opportunity-v3' || value.asOf !== projection.asOf ||
      value.status !== projection.verifiedChangeWorkspace.status ||
      !integer(value.totalCount, 0, 18) ||
      !exactCountMap(value.laneCounts, LANE_KEYS) ||
      !Array.isArray(value.topItems) || value.topItems.length > 3) return false;
  const workspace = projection.verifiedChangeWorkspace;
  const allItems = workspace.lanes.flatMap((lane) => lane.items);
  const laneCounts = value.laneCounts as Record<VerifiedChangeLaneKeyV3, number>;
  if (LANE_KEYS.reduce((sum, key) => sum + laneCounts[key], 0) !== allItems.length ||
      value.totalCount !== allItems.length ||
      workspace.lanes.some((lane) => laneCounts[lane.key] !== lane.items.length)) return false;
  const roundRobin = Array.from({ length: 8 }, (_, index) =>
    workspace.lanes.map((lane) => lane.items[index]).filter(Boolean)).flat().slice(0, 3);
  return value.topItems.every((item, index) => {
    const source = roundRobin[index];
    return Boolean(source) &&
      exact(item, ['symbol', 'chineseName', 'changeKind', 'headline', 'verifiedAt', 'detailPath']) &&
      item.symbol === source.symbol &&
      item.chineseName === source.chineseName &&
      item.changeKind === source.brief.changeKind &&
      item.headline === source.brief.headline &&
      item.verifiedAt === source.brief.verifiedAt &&
      item.detailPath === source.brief.detailPath;
  }) && value.topItems.length === roundRobin.length;
}

function validConnector(value: unknown): value is SourceConnectorAccountingV3 {
  if (!exact(value, [
    'sourceKey', 'eligibleDocuments', 'selectedDocuments', 'deferredDueScanCap', 'documentOutcomes',
    'extractedClaims', 'claimOutcomes', 'rawMentions', 'mentionOutcomes', 'mentionReasonCounts',
    'linkedCandidateCount', 'status', 'failureReason',
  ])) return false;
  return member(value.sourceKey, SOURCE_KEYS) &&
    integer(value.eligibleDocuments) && integer(value.selectedDocuments) && integer(value.deferredDueScanCap) &&
    value.eligibleDocuments === value.selectedDocuments + value.deferredDueScanCap &&
    exactCountMap(value.documentOutcomes, DOCUMENT_OUTCOMES) &&
    Object.values(value.documentOutcomes).reduce((sum, count) => sum + count, 0) === value.selectedDocuments &&
    integer(value.extractedClaims) &&
    exactCountMap(value.claimOutcomes, CLAIM_OUTCOMES) &&
    Object.values(value.claimOutcomes).reduce((sum, count) => sum + count, 0) === value.extractedClaims &&
    integer(value.rawMentions) &&
    exactCountMap(value.mentionOutcomes, MENTION_OUTCOMES) &&
    Object.values(value.mentionOutcomes).reduce((sum, count) => sum + count, 0) === value.rawMentions &&
    exactCountMap(value.mentionReasonCounts, MENTION_REASONS) &&
    Object.values(value.mentionReasonCounts).reduce((sum, count) => sum + count, 0) === value.rawMentions &&
    integer(value.linkedCandidateCount) &&
    value.linkedCandidateCount <=
      value.mentionOutcomes.linked_new + value.mentionOutcomes.linked_refresh + value.mentionOutcomes.linked_duplicate_claim &&
    member(value.status, ['ok', 'degraded', 'failed']) &&
    nullableText(value.failureReason, 120);
}

function validSourceFunnel(value: unknown): value is SourceFunnelSummaryV3 {
  if (!exact(value, [
    'eligibleDocuments', 'selectedDocuments', 'deferredDueScanCap', 'documentOutcomes',
    'extractedClaims', 'claimOutcomes', 'rawMentions', 'mentionOutcomes', 'mentionReasonCounts',
    'activeCandidateCount', 'shallowPlannedCount', 'shallowSucceededCount', 'shallowFailedCount',
    'deferredBeforeShallowCount', 'deepPlannedCount', 'deepSucceededCount', 'deepFailedCount',
    'deferredBeforeDeepCount', 'quotaUnderfillReasons', 'connectorAccounting',
  ])) return false;
  const scalarKeys = [
    'eligibleDocuments', 'selectedDocuments', 'deferredDueScanCap', 'extractedClaims', 'rawMentions',
    'activeCandidateCount', 'shallowPlannedCount', 'shallowSucceededCount', 'shallowFailedCount',
    'deferredBeforeShallowCount', 'deepPlannedCount', 'deepSucceededCount', 'deepFailedCount',
    'deferredBeforeDeepCount',
  ];
  if (!scalarKeys.every((key) => integer(value[key])) ||
      !exactCountMap(value.documentOutcomes, DOCUMENT_OUTCOMES) ||
      !exactCountMap(value.claimOutcomes, CLAIM_OUTCOMES) ||
      !exactCountMap(value.mentionOutcomes, MENTION_OUTCOMES) ||
      !exactCountMap(value.mentionReasonCounts, MENTION_REASONS) ||
      !Array.isArray(value.quotaUnderfillReasons) ||
      value.quotaUnderfillReasons.some((reason) => !member(reason, [
        'connector_cap', 'sector_cap', 'enrichment_failure', 'quota_underfill',
      ])) ||
      new Set(value.quotaUnderfillReasons).size !== value.quotaUnderfillReasons.length ||
      !Array.isArray(value.connectorAccounting) ||
      value.connectorAccounting.length > 11 ||
      !value.connectorAccounting.every(validConnector) ||
      new Set(value.connectorAccounting.map((row) => row.sourceKey)).size !== value.connectorAccounting.length) return false;
  const funnel = value as unknown as SourceFunnelSummaryV3;
  const sums = (field: keyof SourceConnectorAccountingV3) =>
    funnel.connectorAccounting.reduce((sum, row) => sum + Number(row[field]), 0);
  const sumMap = (field: 'documentOutcomes'|'claimOutcomes'|'mentionOutcomes'|'mentionReasonCounts', key: string) =>
    funnel.connectorAccounting.reduce((sum, row) =>
      sum + Number((row[field] as unknown as Record<string, number>)[key]), 0);
  return funnel.eligibleDocuments === funnel.selectedDocuments + funnel.deferredDueScanCap &&
    Object.values(funnel.documentOutcomes).reduce((sum, count) => sum + count, 0) === funnel.selectedDocuments &&
    Object.values(funnel.claimOutcomes).reduce((sum, count) => sum + count, 0) === funnel.extractedClaims &&
    Object.values(funnel.mentionOutcomes).reduce((sum, count) => sum + count, 0) === funnel.rawMentions &&
    Object.values(funnel.mentionReasonCounts).reduce((sum, count) => sum + count, 0) === funnel.rawMentions &&
    funnel.eligibleDocuments === sums('eligibleDocuments') &&
    funnel.selectedDocuments === sums('selectedDocuments') &&
    funnel.deferredDueScanCap === sums('deferredDueScanCap') &&
    funnel.extractedClaims === sums('extractedClaims') &&
    funnel.rawMentions === sums('rawMentions') &&
    DOCUMENT_OUTCOMES.every((key) => funnel.documentOutcomes[key] === sumMap('documentOutcomes', key)) &&
    CLAIM_OUTCOMES.every((key) => funnel.claimOutcomes[key] === sumMap('claimOutcomes', key)) &&
    MENTION_OUTCOMES.every((key) => funnel.mentionOutcomes[key] === sumMap('mentionOutcomes', key)) &&
    MENTION_REASONS.every((key) => funnel.mentionReasonCounts[key] === sumMap('mentionReasonCounts', key)) &&
    funnel.activeCandidateCount === sums('linkedCandidateCount') &&
    funnel.activeCandidateCount === funnel.shallowPlannedCount + funnel.deferredBeforeShallowCount &&
    funnel.shallowPlannedCount === funnel.shallowSucceededCount + funnel.shallowFailedCount &&
    funnel.shallowSucceededCount === funnel.deepPlannedCount + funnel.deferredBeforeDeepCount &&
    funnel.deepPlannedCount === funnel.deepSucceededCount + funnel.deepFailedCount;
}

function validMarketContext(value: unknown): value is PublicMarketContextV3 {
  if (!exact(value, [
    'contractVersion', 'regime', 'completeness', 'composite', 'newPositionBudgetPct',
    'groupEvidence', 'missingGroups', 'overrideReason', 'asOf',
  ]) || value.contractVersion !== 'market-context-v3.6' ||
      !member(value.regime, ['risk_off', 'unknown', 'selective', 'risk_on']) ||
      !member(value.completeness, ['sufficient', 'insufficient']) ||
      !(value.composite === null || finite(value.composite, 0, 100)) ||
      ![0, 15, 35, 60].includes(value.newPositionBudgetPct as number) ||
      !exact(value.groupEvidence, ['trend', 'breadth', 'flow', 'derivatives', 'global']) ||
      !Array.isArray(value.missingGroups) ||
      value.missingGroups.some((group) => !member(group, ['trend', 'breadth', 'flow', 'derivatives', 'global'])) ||
      new Set(value.missingGroups).size !== value.missingGroups.length ||
      !(value.overrideReason === null || member(value.overrideReason, ['trend_below_25', 'breadth_below_25'])) ||
      !utc(value.asOf)) return false;
  const groupsValid = Object.entries(value.groupEvidence).every(([groupKey, group]) =>
    exact(group, ['status', 'score', 'inputs', 'reason']) &&
    member(group.status, ['fresh', 'stale', 'missing']) &&
    (group.score === null || finite(group.score, 0, 100)) &&
    Array.isArray(group.inputs) &&
    group.inputs.length <= (groupKey === 'trend' ? 6 : 3) &&
    group.inputs.every((input) =>
      exact(input, ['key', 'value', 'observedAt', 'sourceRef', 'status']) &&
      text(input.key, 80) &&
      (input.value === null || finite(input.value)) &&
      (input.observedAt === null || utc(input.observedAt)) &&
      nullableText(input.sourceRef, 120) &&
      member(input.status, ['fresh', 'stale', 'missing'])) &&
    (group.reason === null || member(group.reason, [
      'missing_trend', 'missing_breadth', 'missing_flow', 'missing_derivatives', 'missing_global',
      'stale_input', 'insufficient_breadth_coverage', 'provider_conflict',
    ])) &&
    (group.status === 'fresh'
      ? finite(group.score, 0, 100) && group.reason === null
      : group.score === null && group.reason !== null));
  if (!groupsValid) return false;
  const groups = Object.fromEntries(Object.entries(value.groupEvidence).map(([key, groupValue]) => [key, {
    status: (groupValue as JsonRecord).status,
    score: (groupValue as JsonRecord).score,
  }]));
  const derived = deriveMarketContext(
    groups as Parameters<typeof deriveMarketContext>[0],
    value.asOf,
  );
  return value.regime === derived.regime && value.completeness === derived.completeness &&
    value.composite === derived.composite && value.newPositionBudgetPct === derived.newPositionBudgetPct &&
    canonicalJson(value.missingGroups) === canonicalJson(derived.missingGroups) &&
    value.overrideReason === derived.overrideReason;
}

function validAssistiveArtifact(value: unknown): value is AssistiveArtifactSummaryV3 {
  return exact(value, [
    'artifactRef', 'artifactHash', 'artifactKind', 'licenseId', 'licenseEvidenceRef',
    'trainingCutoff', 'evaluationManifestRef', 'comparisonBaselineKey', 'outOfSample', 'influence',
  ]) &&
    text(value.artifactRef, 120) &&
    typeof value.artifactHash === 'string' && /^[0-9a-f]{64}$/u.test(value.artifactHash) &&
    member(value.artifactKind, ['news_sentiment', 'embedding', 'time_series']) &&
    text(value.licenseId, 120) && text(value.licenseEvidenceRef, 120) &&
    utc(value.trainingCutoff) && text(value.evaluationManifestRef, 120) &&
    text(value.comparisonBaselineKey, 120) &&
    exact(value.outOfSample, ['precisionAt20', 'ndcgAt20', 'worstDecileMae20Pct']) &&
    finite(value.outOfSample.precisionAt20, 0, 1) &&
    finite(value.outOfSample.ndcgAt20, 0, 1) &&
    finite(value.outOfSample.worstDecileMae20Pct, 0) &&
    value.influence === 'none';
}

function validMissedAudit(value: unknown): value is MissedSourceAuditV3 {
  return exact(value, [
    'auditedSessionDate', 'auditedCloseAt', 'auditWindowClosesAt', 'sourceCollectionCutoff',
    'maturity', 'moverCount', 'laterMentionedCount', 'sourceRecallPct', 'symbols',
  ]) &&
    typeof value.auditedSessionDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value.auditedSessionDate) &&
    utc(value.auditedCloseAt) && utc(value.auditWindowClosesAt) && utc(value.sourceCollectionCutoff) &&
    member(value.maturity, ['pending', 'matured']) &&
    integer(value.moverCount, 0, 20) &&
    integer(value.laterMentionedCount, 0, value.moverCount) &&
    (value.sourceRecallPct === null || finite(value.sourceRecallPct, 0, 100)) &&
    Array.isArray(value.symbols) && value.symbols.length === value.moverCount &&
    value.symbols.every(symbol) && new Set(value.symbols).size === value.symbols.length;
}

const ENTRANT_REASONS = [
  'new_in_seed_symbol','new_out_of_seed_symbol','new_source_evidence','material_source_change',
] as const;

function validDiscoveryDelta(value: unknown, asOf: string, activeCount: number): boolean {
  if (!exact(value, ['asOf','entrants','exits','continuations','unchangedReasonCounts']) ||
      value.asOf !== asOf || !Array.isArray(value.entrants) || value.entrants.length > 30 ||
      !Array.isArray(value.exits) || value.exits.length > 30 ||
      !Array.isArray(value.continuations) || value.continuations.length > 60 ||
      !exactCountMap(value.unchangedReasonCounts, [
        'same_material_evidence','duplicate_claim','candidate_cap','shallow_cap','deep_cap',
      ])) return false;
  const entrantsValid = value.entrants.every((row) => exact(row, ['symbol','reason']) &&
    symbol(row.symbol) && member(row.reason, ENTRANT_REASONS));
  const exitsValid = value.exits.every((row) => exact(row, ['symbol','reason']) && symbol(row.symbol) &&
    member(row.reason, ['evidence_expired','roster_ineligible','material_contradiction','ranking_cap']));
  const continuationsValid = value.continuations.every((row) => exact(row, ['symbol','reason']) &&
    symbol(row.symbol) && member(row.reason, ['refreshed','unchanged']));
  const currentSymbols = [...value.entrants, ...value.continuations].map((row) => row.symbol);
  const allSymbols = [...currentSymbols, ...value.exits.map((row) => row.symbol)];
  return entrantsValid && exitsValid && continuationsValid &&
    new Set(currentSymbols).size === currentSymbols.length && new Set(allSymbols).size === allSymbols.length &&
    currentSymbols.length === activeCount &&
    value.unchangedReasonCounts.same_material_evidence ===
      value.continuations.filter((row) => row.reason === 'unchanged').length;
}

function validSourceSignal(value: unknown): boolean {
  if (!exact(value, [
    'symbol','chineseName','researchMaturity','newPositionAction','discoveredAt','sourceClass',
    'sourceSummary','evidenceRefs','valuationStatus','technicalState','changedBecause',
  ])) return false;
  return symbol(value.symbol) && nullableText(value.chineseName, 40) &&
    value.researchMaturity === 'source_signal' && value.newPositionAction === 'valuation_review' &&
    utc(value.discoveredAt) && member(value.sourceClass, SOURCE_CLASSES) &&
    normalizedText(value.sourceSummary, 180) && new TextEncoder().encode(value.sourceSummary).length <= 720 &&
    uniqueStrings(value.evidenceRefs, 5, false) && member(value.valuationStatus, ['pending','review_required']) &&
    member(value.technicalState, [
      'below_support','reclaim_required','at_support','breakout_pending','breakout_confirmed',
      'extended','invalidated','unavailable',
    ]) && member(value.changedBecause, ENTRANT_REASONS);
}

export function validAvailableProjectionPayload(value: unknown): value is OpportunityEngineAvailableV3 {
  if (!exact(value, [
    'contractVersion', 'availability', 'featureVersion', 'decisionVersion', 'mode', 'runId', 'sourceRunId',
    'asOf', 'decisionContext', 'sourceFunnel', 'sourceSignals', 'discoveryDelta', 'marketContext', 'rankedLanes', 'actionableNow',
    'waitingForTrigger', 'valuationReview', 'verifiedChangeWorkspace', 'homepageSummary',
    'missedSourceAudit', 'engineHealth',
  ]) || value.contractVersion !== ENGINE_CONTRACT_V3 || value.availability !== 'available' ||
      value.mode !== 'shadow' || !text(value.featureVersion, 80) || !text(value.decisionVersion, 80) ||
      !uuid(value.runId) || !uuid(value.sourceRunId) || !utc(value.asOf) ||
      !exact(value.decisionContext, ['mode', 'personalized', 'sizingVisible']) ||
      value.decisionContext.mode !== 'research_only' || value.decisionContext.personalized !== false ||
      value.decisionContext.sizingVisible !== false ||
      !validSourceFunnel(value.sourceFunnel) ||
      !Array.isArray(value.sourceSignals) || value.sourceSignals.length > 30 ||
      !value.sourceSignals.every(validSourceSignal) ||
      new Set(value.sourceSignals.map((signal) => signal.symbol)).size !== value.sourceSignals.length ||
      !validDiscoveryDelta(value.discoveryDelta, value.asOf, value.sourceFunnel.activeCandidateCount) ||
      !validMarketContext(value.marketContext) ||
      !Array.isArray(value.rankedLanes) || value.rankedLanes.length !== HORIZONS.length ||
      !Array.isArray(value.actionableNow) || value.actionableNow.length > 6 ||
      !Array.isArray(value.waitingForTrigger) ||
      value.actionableNow.length + value.waitingForTrigger.length > 12 ||
      !Array.isArray(value.valuationReview) || value.valuationReview.length > 8 ||
      !validWorkspace(value.verifiedChangeWorkspace, value.runId, value.asOf) ||
      !validMissedAudit(value.missedSourceAudit) ||
      !exact(value.engineHealth, [
        'status', 'sourceCutoff', 'acceptanceVersion', 'modelInfluence', 'assistiveArtifacts', 'warnings',
      ]) ||
      !member(value.engineHealth.status, ['ok', 'degraded']) ||
      value.engineHealth.sourceCutoff !== value.asOf ||
      value.engineHealth.acceptanceVersion !== ACCEPTANCE_VERSION_V3 ||
      value.engineHealth.modelInfluence !== 'none' ||
      !Array.isArray(value.engineHealth.assistiveArtifacts) ||
      value.engineHealth.assistiveArtifacts.length > 3 ||
      !value.engineHealth.assistiveArtifacts.every(validAssistiveArtifact) ||
      !Array.isArray(value.engineHealth.warnings) ||
      value.engineHealth.warnings.length > WARNINGS.length ||
      value.engineHealth.warnings.some((warning) => !member(warning, WARNINGS)) ||
      new Set(value.engineHealth.warnings).size !== value.engineHealth.warnings.length) return false;
  for (const [index, lane] of value.rankedLanes.entries()) {
    if (!exact(lane, ['horizon', 'cards']) || lane.horizon !== HORIZONS[index] ||
        !Array.isArray(lane.cards) || lane.cards.length > 20 ||
        lane.cards.some((card, cardIndex) =>
          !exact(card, ['symbol', 'rank', 'score', 'scoreDelta', 'formalResearchStatus']) ||
          !symbol(card.symbol) || card.rank !== cardIndex + 1 || !finite(card.score, 0, 100) ||
          !(card.scoreDelta === null || finite(card.scoreDelta, -100, 100)) ||
          !member(card.formalResearchStatus, FORMAL_STATES)) ||
        new Set(lane.cards.map((card) => card.symbol)).size !== lane.cards.length) return false;
  }
  const cardGroups = [value.actionableNow, value.waitingForTrigger, value.valuationReview];
  if (!cardGroups.flat().every((card) => validOpportunityCardV3(
    card, value.runId as string, value.asOf as string,
  ))) return false;
  if (new Set(cardGroups.flat().map((card) => card.symbol)).size !== cardGroups.flat().length) return false;
  if (value.sourceSignals.some((signal) => cardGroups.flat().some((card) => card.symbol === signal.symbol))) return false;
  if (value.actionableNow.some((card) => !['starter_now', 'event_starter'].includes(card.actionDecision.newPositionAction)) ||
      value.waitingForTrigger.some((card) => card.actionDecision.newPositionAction !== 'wait_trigger') ||
      value.valuationReview.some((card) => card.actionDecision.newPositionAction !== 'valuation_review')) return false;
  return validHomepageSummary(value.homepageSummary, value as OpportunityEngineAvailableV3) &&
    canonicalJson(value).length <= 1_048_576;
}
