export const ACCEPTANCE_VERSION_V3 = '1.46.0' as const;
export const ENGINE_CONTRACT_V3 = 'source-led-opportunity-v3.6' as const;
export const DETAIL_CONTRACT_V3 = 'opportunity-detail-v3.3' as const;

export type DeploymentStateV3 = 'disabled' | 'drain' | 'shadow';
export type OpportunityModeV3 = 'source_scan' | 'enrich_rank' | 'label_outcomes' | 'shadow_evaluate';
export type RunStatusV3 = 'preparing' | 'running' | 'success' | 'failed' | 'converged';
export type SourceClassV3 = 'official' | 'public_research' | 'curated_thesis' | 'community';
export type HorizonV3 = 'momentum_5_20d' | 'swing_20_60d' | 'thesis_120_250d';
export type FactorKeyV3 = 'priceVolume' | 'chip' | 'catalyst' | 'marketSector' | 'fundamental' | 'valuation';
export type NewPositionActionV3 = 'avoid' | 'valuation_review' | 'wait_trigger' | 'event_starter' | 'starter_now';
export type FormalResearchStatusV3 =
  | 'not_evaluated'
  | 'insufficient_evidence'
  | 'valuation_review'
  | 'formal_watch'
  | 'formal_candidate';

export type MarketGroupV3 = 'trend' | 'breadth' | 'flow' | 'derivatives' | 'global';
export type EvidenceStatusV3 = 'fresh' | 'stale' | 'missing';

export interface SourceDocumentV3 {
  revisionId: string;
  revisionFamilyKey: string;
  sourceKey: string;
  sourceClass: SourceClassV3;
  sourceIdentityAuthorityId: string;
  approvedSourceIdentityId: string;
  stableConnectorDocumentId: string;
  canonicalUrl: string | null;
  publishedAt: string | null;
  collectedAt: string;
  recordedAt: string;
  acquisitionStatus: 'complete' | 'invalid_utf8' | 'required_field_missing' | 'content_overflow';
  fields: string[];
}

export interface ClaimV3 {
  claimId: string;
  canonicalClaimHash: string;
  evidenceRootId: string;
  sourceKey: string;
  sourceClass: SourceClassV3;
  effectiveAt: string;
  confidence: number;
  text: string;
}

export interface MentionV3 {
  token: string;
  context: string;
  explicitTicker: boolean;
  stockContext: boolean;
}

export interface InstrumentV3 {
  stockId: string;
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
  instrumentType: string;
  listingStatus: string;
  officialName: string | null;
  sector: string;
  aliases: string[];
}

export interface LinkResultV3 {
  outcome:
    | 'linked_new'
    | 'linked_refresh'
    | 'linked_duplicate_claim'
    | 'ambiguous_symbol'
    | 'rejected_low_confidence'
    | 'unsupported_instrument';
  reason:
    | 'explicit_ticker_context'
    | 'exact_unique_alias_context'
    | 'ambiguous_number'
    | 'ambiguous_alias'
    | 'fuzzy_below_auto_threshold'
    | 'below_min_confidence'
    | 'inactive_or_unknown_symbol'
    | 'missing_stock_context'
    | 'unsupported_market'
    | 'non_common_stock'
    | 'unsupported_instrument_type'
    | 'duplicate_claim_link';
  symbol: string | null;
  confidence: number;
}

export interface CandidateV3 {
  symbol: string;
  sector: string;
  anchor: ClaimV3;
  claims: ClaimV3[];
  directSource: boolean;
  preResearchScore: number;
}

export interface MarketGroupEvidenceV3 {
  status: EvidenceStatusV3;
  score: number | null;
}

export interface MarketContextV3 {
  contractVersion: 'market-context-v3.6';
  regime: 'risk_off' | 'unknown' | 'selective' | 'risk_on';
  completeness: 'sufficient' | 'insufficient';
  composite: number | null;
  newPositionBudgetPct: 0 | 15 | 35 | 60;
  groups: Record<MarketGroupV3, MarketGroupEvidenceV3>;
  missingGroups: MarketGroupV3[];
  overrideReason: 'trend_below_25' | 'breadth_below_25' | null;
  asOf: string;
}

export interface FactorValueV3 {
  value: number | null;
  status: EvidenceStatusV3;
}

export interface HorizonScoreV3 {
  horizon: HorizonV3;
  score: number;
  confidence: number;
  availableWeight: number;
  factors: Record<FactorKeyV3, FactorValueV3 & { contribution: number }>;
}

export interface ValuationDistributionV3 {
  status: 'normal' | 'missing' | 'stale' | 'outlier_review';
  method: 'pe' | 'normalized_pe' | 'ev_ebitda' | 'pb_roe' | 'residual_income' | 'nav' | 'ev_sales' | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  bear: ValuationScenarioV3 | null;
  base: ValuationScenarioV3 | null;
  bull: ValuationScenarioV3 | null;
  crossChecks: Array<{ method: Exclude<ValuationDistributionV3['method'], null>; bear: number; base: number; bull: number;
    asOf: string; evidenceRefs: string[] }>;
  confidence: number | null;
  reasons: string[];
  asOf: string;
  evidenceRefs: string[];
  verificationRef: string | null;
  referenceManifestRef: string | null;
  historicalSampleCount: number;
  peerSampleCount: number;
  historicalReferenceQuantiles: { p10: number; p50: number; p90: number } | null;
  peerReferenceQuantiles: { p10: number; p50: number; p90: number } | null;
}

export interface ValuationScenarioV3 {
  case: 'bear' | 'base' | 'bull';
  value: number;
  asOf: string;
  inputs: Array<{ key: string; value: number; unit: string; sourceRef: string; asOf: string }>;
  sensitivity: Array<{ key: string; delta: number; result: number }>;
}

export interface DecisionInputV3 {
  formalStatus: FormalResearchStatusV3;
  market: MarketContextV3;
  momentum: HorizonScoreV3 | null;
  swing: HorizonScoreV3 | null;
  valuation: ValuationDistributionV3;
  sourceClass: SourceClassV3;
  sourceConfidence: number;
  independentRootCount: number;
  criticalDataInvalid: boolean;
  entryConfirmed: boolean;
  technicallyExtended: boolean;
}

export interface ActionDecisionV3 {
  decisionAuthority: 'research_only';
  publicationEligible: false;
  newPositionAction: NewPositionActionV3;
  existingPositionAction: 'no_position' | 'manual_review' | 'hold' | 'trim' | 'exit';
  existingTargetExposurePct: number | null;
  existingReason: 'portfolio_context_unavailable' | 'no_position' | 'stop_breached' | 'thesis_invalidated' | 'valuation_uncertainty' | 'data_integrity' | 'market_risk_off' | 'price_at_or_above_p90' | 'stock_cap_exceeded' | 'sector_cap_exceeded' | 'gross_cap_exceeded' | 'hold';
  primaryHorizon: Exclude<HorizonV3, 'thesis_120_250d'> | null;
  initialPositionPct: number;
  maximumPositionPct: number;
  blockReasons: string[];
  confidence: number;
  entryTrigger: string | null;
  invalidation:
    | { code: 'data_integrity_review'; stopPrice: null; evidenceExpiresAt: null }
    | { code: 'evidence_expiry_only'; stopPrice: null; evidenceExpiresAt: string }
    | { code: 'price_stop_or_evidence_expiry'; stopPrice: number; evidenceExpiresAt: string };
}

export type PublicActionDecisionV3 = Omit<
  ActionDecisionV3,
  'existingTargetExposurePct' | 'initialPositionPct' | 'maximumPositionPct'
>;

export type CardStateV3 = 'actionable_now' | 'waiting_trigger' | 'valuation_review' | 'avoid';
export type ChangedBecauseV3 =
  | { code: 'candidate_state_changed'; from: CardStateV3; to: CardStateV3 }
  | { code: 'new_position_action_changed'; from: NewPositionActionV3; to: NewPositionActionV3 }
  | { code: 'formal_status_changed'; from: FormalResearchStatusV3; to: FormalResearchStatusV3 }
  | { code: 'factor_contribution_changed'; factor: FactorKeyV3; delta: number };

export interface FactorCorrectnessV311 {
  researchMaturity: 'source_signal' | 'fundamental_review' | 'decision_ready';
  technical: {
    availability: 'available' | 'unavailable';
    state: 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' | 'breakout_confirmed' | 'extended' | 'invalidated' | null;
    unavailableReason: string | null;
    maDeviation: number | null;
    trigger: { kind: 'reclaim' | 'breakout' | 'pullback'; threshold: number; volumeRatioMinimum: number | null } | null;
    entryZone: { kind: 'market_zone' | 'trigger_zone'; lower: number; upper: number } | null;
    invalidation: { stop: number; thesisLevel: number } | null;
  };
  valuation: {
    status: 'normal' | 'valuation_review';
    targetPrice: number | null;
    exchangeReportedPe: { availability: 'available'; current: number; ownPercentile: number; sectorAggregate: number }
      | { availability: 'unavailable'; reason: string };
    modelComparablePe: { availability: 'available'; value: number; method: 'pe' | 'normalized_pe' } | null;
  };
  factorAxes: { availability: 'available'; axes: Record<string, number>; availableWeight: number; qualityActionEligible: boolean }
    | { availability: 'unavailable'; reason: string };
  timingRisk: { status: 'eligible' | 'blocked' | 'observe_only' | 'unavailable'; reason: string | null };
  lastEvaluatedAt: string;
  analysisGeneratedAt: string | null;
  materialChangeHash: string;
  materialChangedBecause: string[];
  noChangeMessage: string | null;
}

export interface OpportunityCardV3 {
  symbol: string;
  chineseName: string | null;
  detailPath: string;
  directSource: boolean;
  candidateState: CardStateV3;
  primaryHorizon: Exclude<HorizonV3, 'thesis_120_250d'>;
  rank: number;
  score: number;
  scoreDelta: number | null;
  factorScores: Record<FactorKeyV3, number>;
  factorAxes: Record<string, unknown>;
  availableWeight: number;
  sourceRefs: string[];
  sourceSummary: {
    anchorSourceKey: string;
    anchorSourceClass: SourceClassV3;
    anchorEffectiveAt: string;
    independentRootCount: number;
  };
  researchMaturity: 'source_signal' | 'fundamental_review' | 'decision_ready';
  fundamental: {
    thesis: string;
    latestChange: string;
    risks: string[];
    evidenceRefs: string[];
    asOf: string;
  };
  formalResearchStatus: FormalResearchStatusV3;
  actionDecision: PublicActionDecisionV3;
  valuation: ValuationDistributionV3 & { relativeMultiple: Record<string, unknown> };
  technicalDecision: Record<string, unknown>;
  sectorCycle: SectorCycleV3;
  changedBecause: ChangedBecauseV3[];
  lastEvaluatedAt: string;
  analysisGeneratedAt: string;
  materialChangeHash: string;
  materialChangedBecause: string[];
  noChangeMessage: string | null;
}

export interface SectorCycleV3 {
  contractVersion: 'sector-cycle-v3.0';
  state: 'early_recovery' | 'expansion' | 'late_expansion' | 'contraction' | 'unknown';
  levelScore: number | null;
  changeScore: number | null;
  marketScore: number | null;
  matchedRule: 'unavailable' | 'contraction' | 'early_recovery' | 'expansion' | 'late_expansion' | 'no_rule_match';
  inputs: Array<{
    key: 'sector_revenue_yoy_median' | 'sector_eps_yoy_median' | 'sector_revenue_acceleration_median' | 'sector_operating_margin_delta_median' | 'sector_excess_return_20d' | 'sector_excess_return_60d' | 'sector_ad_breadth_20d';
    value: number | null;
    observedAt: string | null;
    sourceRef: string | null;
    status: EvidenceStatusV3;
  }>;
  reasons: Array<'missing_level_inputs' | 'missing_change_inputs' | 'missing_market_inputs' | 'insufficient_sector_reference' | 'no_rule_match'>;
  asOf: string;
}

export type InternalOpportunityCardV3 = Omit<OpportunityCardV3, 'actionDecision'> & {
  actionDecision: ActionDecisionV3;
};

export type VerifiedChangeKindV3 =
  | 'official_event'
  | 'fundamental_update'
  | 'valuation_update'
  | 'source_corroboration'
  | 'contradiction';
export type VerifiedChangeLaneKeyV3 =
  | 'new_verified_change'
  | 'strengthened_thesis'
  | 'contradiction_or_review';
export type VerifiedChangeContradictionCodeV3 =
  | 'conflicting_source'
  | 'missing_official_confirmation'
  | 'stale_evidence'
  | 'valuation_outlier';

export interface VerifiedEvidenceRowV3 {
  sourceSelectionOrdinal: number;
  claimOrdinal: number;
  evidenceRef: string;
  evidenceRootId: string;
  sourceClass: SourceClassV3;
  sourceKey: string;
  effectiveAt: string;
  freshness: 'fresh' | 'stale';
  verificationTier: 'provenance_verified' | 'publisher_verified';
  stance: 'supports' | 'contradicts';
  runId: string;
  revisionId: string;
  stockId: string;
  symbol: string;
  mentionOutcome: 'linked_new' | 'linked_refresh' | 'linked_duplicate_claim';
}

export interface PriorComparableV3 {
  sourceCutoff: string;
  anchorEffectiveAt: string;
  formalResearchStatus: FormalResearchStatusV3;
  independentSourceClassCount: 1 | 2 | 3 | 4;
  valuationStatus: ValuationDistributionV3['status'];
}

export interface VerifiedChangeBriefV3 {
  briefVersion: 'verified-change-brief-v3.0';
  changeKind: VerifiedChangeKindV3;
  headline: string;
  whatChanged: string;
  whyItMatters: string;
  verifiedAt: string;
  sourceCutoff: string;
  evidenceRefs: string[];
  independentSourceClassCount: 1 | 2 | 3 | 4;
  contradictions: Array<{ code: VerifiedChangeContradictionCodeV3; evidenceRef: string | null }>;
  formalResearchStatus: FormalResearchStatusV3;
  primaryHorizon: Exclude<HorizonV3, 'thesis_120_250d'>;
  scoreDelta: number | null;
  detailPath: string;
  disclosure: 'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
}

export interface VerifiedChangeItemV3 {
  symbol: string;
  chineseName: string | null;
  lane: VerifiedChangeLaneKeyV3;
  brief: VerifiedChangeBriefV3;
  card: OpportunityCardV3;
}

export interface VerifiedChangeWorkspaceV3 {
  status: 'empty' | 'available';
  lanes: Array<{ key: VerifiedChangeLaneKeyV3; items: VerifiedChangeItemV3[] }>;
}

export interface OpportunityHomepageSummaryV3 {
  workspacePath: '/opportunity-v3';
  asOf: string;
  status: 'empty' | 'available';
  totalCount: number;
  laneCounts: Record<VerifiedChangeLaneKeyV3, number>;
  topItems: Array<{
    symbol: string;
    chineseName: string | null;
    changeKind: VerifiedChangeKindV3;
    headline: string;
    verifiedAt: string;
    detailPath: string;
  }>;
}

export type EngineWarningV3 =
  | 'connector_degraded'
  | 'market_incomplete'
  | 'sector_cycle_unknown'
  | 'source_audit_pending'
  | 'prior_lineage_missing'
  | 'valuation_missing'
  | 'shadow_only';

export interface SourceConnectorAccountingV3 {
  sourceKey: string;
  eligibleDocuments: number;
  selectedDocuments: number;
  deferredDueScanCap: number;
  documentOutcomes: Record<'duplicate_document' | 'expired_document' | 'parse_failure' | 'processed_no_claim' | 'processed_with_claims', number>;
  extractedClaims: number;
  claimOutcomes: Record<'unique_claim' | 'duplicate_claim', number>;
  rawMentions: number;
  mentionOutcomes: Record<LinkResultV3['outcome'], number>;
  mentionReasonCounts: Record<LinkResultV3['reason'], number>;
  linkedCandidateCount: number;
  status: 'ok' | 'degraded' | 'failed';
  failureReason: string | null;
}

export interface SourceFunnelSummaryV3 {
  eligibleDocuments: number;
  selectedDocuments: number;
  deferredDueScanCap: number;
  documentOutcomes: SourceConnectorAccountingV3['documentOutcomes'];
  extractedClaims: number;
  claimOutcomes: SourceConnectorAccountingV3['claimOutcomes'];
  rawMentions: number;
  mentionOutcomes: SourceConnectorAccountingV3['mentionOutcomes'];
  mentionReasonCounts: SourceConnectorAccountingV3['mentionReasonCounts'];
  activeCandidateCount: number;
  shallowPlannedCount: number;
  shallowSucceededCount: number;
  shallowFailedCount: number;
  deferredBeforeShallowCount: number;
  deepPlannedCount: number;
  deepSucceededCount: number;
  deepFailedCount: number;
  deferredBeforeDeepCount: number;
  quotaUnderfillReasons: Array<'connector_cap' | 'sector_cap' | 'enrichment_failure' | 'quota_underfill'>;
  connectorAccounting: SourceConnectorAccountingV3[];
}

export type DiscoveryEntrantReasonV3 =
  | 'new_in_seed_symbol' | 'new_out_of_seed_symbol' | 'new_source_evidence' | 'material_source_change';

export interface OpportunitySourceSignalV3 {
  symbol: string;
  chineseName: string | null;
  researchMaturity: 'source_signal';
  newPositionAction: 'valuation_review';
  discoveredAt: string;
  sourceClass: SourceClassV3;
  sourceSummary: string;
  evidenceRefs: string[];
  valuationStatus: 'pending' | 'review_required';
  technicalState: 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' |
    'breakout_confirmed' | 'extended' | 'invalidated' | 'unavailable';
  changedBecause: DiscoveryEntrantReasonV3;
}

export interface OpportunityDiscoveryDeltaV3 {
  asOf: string;
  entrants: Array<{ symbol: string; reason: DiscoveryEntrantReasonV3 }>;
  exits: Array<{ symbol: string; reason: 'evidence_expired' | 'roster_ineligible' | 'material_contradiction' | 'ranking_cap' }>;
  continuations: Array<{ symbol: string; reason: 'refreshed' | 'unchanged' }>;
  unchangedReasonCounts: Record<'same_material_evidence' | 'duplicate_claim' | 'candidate_cap' | 'shallow_cap' | 'deep_cap', number>;
}

export interface PublicMarketContextV3 extends Omit<MarketContextV3, 'groups'> {
  groupEvidence: Record<MarketGroupV3, MarketGroupEvidenceV3 & {
    inputs: Array<{
      key: string;
      value: number | null;
      observedAt: string | null;
      sourceRef: string | null;
      status: EvidenceStatusV3;
    }>;
    reason: 'missing_trend' | 'missing_breadth' | 'missing_flow' | 'missing_derivatives' | 'missing_global' | 'stale_input' | 'insufficient_breadth_coverage' | 'provider_conflict' | null;
  }>;
}

export interface AssistiveArtifactSummaryV3 {
  artifactRef: string;
  artifactHash: string;
  artifactKind: 'news_sentiment' | 'embedding' | 'time_series';
  licenseId: string;
  licenseEvidenceRef: string;
  trainingCutoff: string;
  evaluationManifestRef: string;
  comparisonBaselineKey: string;
  outOfSample: { precisionAt20: number; ndcgAt20: number; worstDecileMae20Pct: number };
  influence: 'none';
}

export interface MissedSourceAuditV3 {
  auditedSessionDate: string;
  auditedCloseAt: string;
  auditWindowClosesAt: string;
  sourceCollectionCutoff: string;
  maturity: 'pending' | 'matured';
  moverCount: number;
  laterMentionedCount: number;
  sourceRecallPct: number | null;
  symbols: string[];
}

export type OpportunityEngineUnavailableV3 = {
  contractVersion: typeof ENGINE_CONTRACT_V3;
  availability: 'unavailable';
  mode: 'shadow';
  asOf: string;
  runId: null;
  sourceRunId: null;
  engineHealth: {
    status: 'pending' | 'failed';
    sourceCutoff: string;
    acceptanceVersion: typeof ACCEPTANCE_VERSION_V3;
    modelInfluence: 'none';
    reason: 'cold_start' | 'no_matching_success' | 'matching_run_in_progress' | 'latest_matching_failed';
    assistiveArtifacts: [];
    warnings: EngineWarningV3[];
  };
};

export type OpportunityEngineAvailableV3 = {
  contractVersion: typeof ENGINE_CONTRACT_V3;
  availability: 'available';
  mode: 'shadow';
  featureVersion: string;
  decisionVersion: string;
  runId: string;
  sourceRunId: string;
  asOf: string;
  decisionContext: {
    mode: 'research_only';
    personalized: false;
    sizingVisible: false;
  };
  sourceFunnel: SourceFunnelSummaryV3;
  sourceSignals: OpportunitySourceSignalV3[];
  discoveryDelta: OpportunityDiscoveryDeltaV3;
  marketContext: PublicMarketContextV3;
  rankedLanes: Array<{
    horizon: HorizonV3;
    cards: Array<Pick<OpportunityCardV3, 'symbol' | 'rank' | 'score' | 'scoreDelta' | 'formalResearchStatus'>>;
  }>;
  actionableNow: OpportunityCardV3[];
  waitingForTrigger: OpportunityCardV3[];
  valuationReview: OpportunityCardV3[];
  verifiedChangeWorkspace: VerifiedChangeWorkspaceV3;
  homepageSummary: OpportunityHomepageSummaryV3;
  missedSourceAudit: MissedSourceAuditV3;
  engineHealth: {
    status: 'ok' | 'degraded';
    sourceCutoff: string;
    acceptanceVersion: typeof ACCEPTANCE_VERSION_V3;
    modelInfluence: 'none';
    assistiveArtifacts: AssistiveArtifactSummaryV3[];
    warnings: EngineWarningV3[];
  };
};

export type OpportunityEngineV3 = OpportunityEngineAvailableV3 | OpportunityEngineUnavailableV3;
