# Data Contract: source-led-opportunity-engine-v3

Contract version: `source-led-opportunity-v3.6`

All arrays and strings below are egress bounded. Optional database inputs become explicit `null`; required discriminators and counts never become null.

```ts
type EngineModeV3 = 'shadow';
type FormalResearchStatusV3 =
  | 'not_evaluated'
  | 'insufficient_evidence'
  | 'valuation_review'
  | 'formal_watch'
  | 'formal_candidate';
type NewPositionActionV3 = 'avoid' | 'valuation_review' | 'wait_trigger' | 'event_starter' | 'starter_now';
type ExistingPositionActionV3 = 'no_position' | 'manual_review' | 'hold' | 'trim' | 'exit';
type HorizonV3 = 'momentum_5_20d' | 'swing_20_60d' | 'thesis_120_250d';
type MentionOutcomeV3 = 'linked_new'|'linked_refresh'|'linked_duplicate_claim'|'ambiguous_symbol'|'rejected_low_confidence'|'unsupported_instrument';
type MentionReasonV3 = 'explicit_ticker_context'|'exact_unique_alias_context'|'ambiguous_number'|'ambiguous_alias'|'fuzzy_below_auto_threshold'|'below_min_confidence'|'inactive_or_unknown_symbol'|'missing_stock_context'|'unsupported_market'|'non_common_stock'|'unsupported_instrument_type'|'duplicate_claim_link';
type MarketGroupV3 = 'trend'|'breadth'|'flow'|'derivatives'|'global';
type MarketInputKeyV3 = 'taiex_close'|'taiex_ma20'|'taiex_ma60'|'otc_close'|'otc_ma20'|'otc_ma60'|'active_common_above_ma20_pct'|'active_common_above_ma60_pct'|'foreign_cash_net_5d'|'investment_trust_net_5d'|'aggregate_margin_balance_change_5d'|'foreign_index_futures_net_oi'|'put_call_ratio'|'taiwan_vix'|'sox_return_5d'|'nasdaq_return_5d'|'usd_twd_return_5d';
type SectorCycleInputKeyV3 = 'sector_revenue_yoy_median'|'sector_eps_yoy_median'|'sector_revenue_acceleration_median'|'sector_operating_margin_delta_median'|'sector_excess_return_20d'|'sector_excess_return_60d'|'sector_ad_breadth_20d';
type RunFailureReasonV3 = 'cold_start'|'no_matching_success'|'matching_run_in_progress'|'latest_matching_failed'|'missing_source_run'|'multiple_source_runs'|'source_revision_unavailable'|'eligible_volume_exceeded'|'deep_candidate_bound_exceeded'|'roster_volume_exceeded'|'identity_manifest_overflow'|'valuation_verification_overflow'|'manifest_missing'|'manifest_hash_mismatch'|'conservation_failure'|'bound_violation'|'data_integrity_failure'|'provider_unavailable'|'v3_service_role_unavailable'|'job_attempts_exhausted'|'orphaned_run';
type QuotaUnderfillReasonV3 = 'connector_cap'|'sector_cap'|'enrichment_failure'|'quota_underfill';
type ValuationReasonV3 = 'no_eligible_method'|'missing_required_inputs'|'insufficient_series'|'insufficient_multiple_reference'|'cross_check_unavailable'|'missing_financial_manifest'|'stale_financial_inputs'|'conflicting_point_in_time_fact'|'invalid_unit'|'missing_bridge_inputs'|'nonconsecutive_quarters'|'operating_bridge_mismatch'|'pretax_bridge_mismatch'|'net_income_bridge_mismatch'|'share_count_conflict'|'reported_eps_mismatch'|'tax_rate_outlier'|'capital_structure_conflict'|'non_finite_bridge'|'negative_equity_value'|'invalid_capital_structure'|'non_finite_distribution'|'distribution_ordering'|'unverified_base_upside'|'unverified_scenario_upside'|'consensus_divergence'|'method_divergence';
type DecisionBlockReasonV3 = 'data_integrity'|'market_risk_off'|'capacity_exhausted'|'invalid_exposure_input'|'score_below_threshold'|'confidence_below_threshold'|'valuation_unavailable'|'valuation_reward_risk'|'entry_data_unavailable'|'entry_invalidated'|'entry_unconfirmed'|'bias_observe_only'|'quality_insufficient'|ValuationReasonV3;
type EngineWarningV3 = 'connector_degraded'|'market_incomplete'|'sector_cycle_unknown'|'source_audit_pending'|'prior_lineage_missing'|'valuation_missing'|'shadow_only';
type MarketReasonV3 = 'missing_trend'|'missing_breadth'|'missing_flow'|'missing_derivatives'|'missing_global'|'stale_input'|'insufficient_breadth_coverage'|'provider_conflict';
type MarketOverrideReasonV3 = 'trend_below_25'|'breadth_below_25';
type SectorCycleReasonV3 = 'missing_level_inputs'|'missing_change_inputs'|'missing_market_inputs'|'insufficient_sector_reference'|'no_rule_match';
type SectorCycleRuleV3 = 'unavailable'|'contraction'|'early_recovery'|'expansion'|'late_expansion'|'no_rule_match';
type ExistingReasonV3 = 'portfolio_context_unavailable'|'no_position'|'stop_breached'|'thesis_invalidated'|'valuation_uncertainty'|'data_integrity'|'market_risk_off'|'price_at_or_above_p90'|'stock_cap_exceeded'|'sector_cap_exceeded'|'gross_cap_exceeded'|'hold';

type SourceConnectorAccountingV3 = {
  sourceKey: string; // 1..40 chars, approved enum at runtime
  eligibleDocuments: number;
  selectedDocuments: number;
  deferredDueScanCap: number;
  documentOutcomes: Record<'duplicate_document'|'expired_document'|'parse_failure'|'processed_no_claim'|'processed_with_claims', number>;
  extractedClaims: number;
  claimOutcomes: Record<'unique_claim'|'duplicate_claim', number>;
  rawMentions: number;
  mentionOutcomes: Record<MentionOutcomeV3, number>;
  mentionReasonCounts: Record<MentionReasonV3, number>;
  linkedCandidateCount: number; // unique candidates whose deterministic connector quota owner is this sourceKey
  status: 'ok'|'degraded'|'failed';
  failureReason: RunFailureReasonV3|null;
};

type SourceFunnelSummaryV3 = {
  eligibleDocuments: number;
  selectedDocuments: number;
  deferredDueScanCap: number;
  documentOutcomes: Record<'duplicate_document'|'expired_document'|'parse_failure'|'processed_no_claim'|'processed_with_claims', number>;
  extractedClaims: number;
  claimOutcomes: Record<'unique_claim'|'duplicate_claim', number>;
  rawMentions: number;
  mentionOutcomes: Record<MentionOutcomeV3, number>;
  mentionReasonCounts: Record<MentionReasonV3, number>;
  activeCandidateCount: number;
  shallowPlannedCount: number;
  shallowSucceededCount: number;
  shallowFailedCount: number;
  deferredBeforeShallowCount: number;
  deepPlannedCount: number;
  deepSucceededCount: number;
  deepFailedCount: number;
  deferredBeforeDeepCount: number;
  quotaUnderfillReasons: QuotaUnderfillReasonV3[]; // max 5, unique in enum order
  connectorAccounting: SourceConnectorAccountingV3[]; // exactly one row per attempted approved connector, max 20
};

type MarketContextV3 = {
  contractVersion: 'market-context-v3.6';
  regime: 'risk_off'|'unknown'|'selective'|'risk_on';
  completeness: 'sufficient'|'insufficient';
  composite: number|null;
  newPositionBudgetPct: 0|15|35|60;
  groupEvidence: Record<MarketGroupV3, {
    status: 'fresh'|'stale'|'missing';
    score: number|null;
    inputs: Array<{key:MarketInputKeyV3; value:number|null; observedAt:string|null; sourceRef:string|null; status:'fresh'|'stale'|'missing'}>; // exact group-owned canonical order; trend max 6, every other group max 3, refs max 120 chars
    reason: MarketReasonV3|null;
  }>;
  missingGroups: MarketGroupV3[]; // max 5, canonical group order
  overrideReason: MarketOverrideReasonV3|null;
  asOf: string; // exactly the enclosing run sourceCutoff, ISO-8601
};

type SectorCycleV3 = {
  contractVersion: 'sector-cycle-v3.0';
  state: 'early_recovery'|'expansion'|'late_expansion'|'contraction'|'unknown';
  levelScore: number|null;
  changeScore: number|null;
  marketScore: number|null;
  matchedRule: SectorCycleRuleV3;
  inputs: Array<{key:SectorCycleInputKeyV3; value:number|null; observedAt:string|null; sourceRef:string|null; status:'fresh'|'stale'|'missing'}>; // exactly 7 in enum order; ref max 120
  reasons: SectorCycleReasonV3[]; // max 3, unique in enum order
  asOf: string; // exactly the enclosing run sourceCutoff, ISO-8601
};

type ValuationDistributionV3 = {
  status: 'normal'|'missing'|'stale'|'outlier_review';
  method: 'pe'|'normalized_pe'|'ev_ebitda'|'pb_roe'|'residual_income'|'nav'|'ev_sales'|null;
  p10: number|null;
  p50: number|null;
  p90: number|null;
  bear: ValuationScenarioV3|null; // value equals p10
  base: ValuationScenarioV3|null; // value equals p50
  bull: ValuationScenarioV3|null; // value equals p90
  crossChecks: Array<{
    method:'pe'|'normalized_pe'|'ev_ebitda'|'pb_roe'|'residual_income'|'nav'|'ev_sales';
    bear:number;base:number;bull:number;
    asOf:string;evidenceRefs:string[];
  }>; // max 2
  confidence: number|null;
  asOf: string;
  evidenceRefs: string[]; // max 8, 120 chars each
  verificationRef: string|null; // max 120 chars
  referenceManifestRef: string|null; // max 120 chars
  historicalSampleCount: number; // integer 0..20
  peerSampleCount: number; // integer 0..20,000 roster contract bound
  historicalReferenceQuantiles: {p10:number;p50:number;p90:number}|null;
  peerReferenceQuantiles: {p10:number;p50:number;p90:number}|null;
  reasons: ValuationReasonV3[]; // max 8, unique in enum order
};

type ValuationScenarioV3 = {
  case:'bear'|'base'|'bull';
  value:number;
  asOf:string;
  inputs:Array<{key:string;value:number;unit:string;sourceRef:string;asOf:string}>; // max 24
  sensitivity:Array<{key:string;delta:number;result:number}>; // exact -10/+10 fundamental then multiple/discount, max 4
};

type TechnicalDecisionV3 =
  | {
      contractVersion:'opportunity-technical-decision-v3.11.1';
      availability:'unavailable';
      state:null;
      reason:'insufficient_adjusted_history'|'corporate_action_authority_missing'|
        'invalid_ohlcv'|'nonconsecutive_sessions'|'future_observation'|
        'volume_reference_unavailable'|'taiex_reference_unavailable'|
        'insufficient_support_structure'|'invalid_entry_geometry';
      asOf:string;trigger:null;entryZone:null;invalidation:null;indicators:null;
    }
  | {
      contractVersion:'opportunity-technical-decision-v3.11.1';
      availability:'available';
      state:'below_support'|'reclaim_required'|'at_support'|'breakout_pending'|
        'breakout_confirmed'|'extended'|'invalidated';
      reason:null;asOf:string;currentPrice:number;support:number;resistance:number;
      trigger:null|{kind:'reclaim'|'breakout'|'pullback';threshold:number;volumeRatioMinimum:number|null};
      entryZone:null|{kind:'market_zone'|'trigger_zone';lower:number;upper:number};
      invalidation:null|{stop:number;thesisLevel:number};
      indicators:{ma20:number;ma60:number;ma120:number;rsi14:number;macd:number;
        macdSignal:number;macdHistogram:number;atr14:number;volumeRatio20:number;
        relativeStrengthTaiex20:number;relativeStrengthSector20:number|null};
    };

type InternalActionDecisionV3 = {
  decisionAuthority: 'research_only';
  publicationEligible: false;
  newPositionAction: NewPositionActionV3;
  existingPositionAction: ExistingPositionActionV3;
  existingTargetExposurePct: number|null; // 0..10
  existingReason: ExistingReasonV3;
  primaryHorizon: Exclude<HorizonV3,'thesis_120_250d'>|null;
  initialPositionPct: number; // 0..5
  maximumPositionPct: number; // 0..10
  entryTrigger: string|null; // max 160 chars
  invalidation:
    | {code:'data_integrity_review';stopPrice:null;evidenceExpiresAt:null}
    | {code:'evidence_expiry_only';stopPrice:null;evidenceExpiresAt:string}
    | {code:'price_stop_or_evidence_expiry';stopPrice:number;evidenceExpiresAt:string};
  blockReasons: DecisionBlockReasonV3[]; // max 5, unique in enum order
  confidence: number; // 0..1
};

type PublicActionDecisionV3 = Omit<InternalActionDecisionV3,
  'existingTargetExposurePct'|'initialPositionPct'|'maximumPositionPct'>;

type CardStateV3 = 'actionable_now'|'waiting_trigger'|'valuation_review'|'avoid';
type FactorKeyV3 = 'priceVolume'|'chip'|'catalyst'|'marketSector'|'fundamental'|'valuation';
type BiasLabelV311 = 'extreme_low'|'low'|'normal'|'high'|'extended';
type DiscoveryUnavailableReasonV311 = 'insufficient_source_evidence';
type QualityUnavailableReasonV311 = 'insufficient_quality_inputs'|'quality_reference_insufficient';
type BiasUnavailableReasonV311 = 'technical_unavailable'|'insufficient_own_history'|'sector_reference_insufficient'|'manifest_missing'|'manifest_hash_mismatch';
type ReportedPeUnavailableReasonV311 = 'authority_conflict'|'non_positive_reported_pe'|'insufficient_own_history'|'sector_reference_insufficient'|'missing_official_pe'|'missing_shares_outstanding'|'calendar_authority_mismatch'|'manifest_missing'|'manifest_hash_mismatch';
type ClosedAxisScoreV311 = number; // finite, serialized half-away-from-zero to two decimals, 0..100
type FactorAxesV311 = {
  discovery:
    | {status:'new'|'continued';reason:null;score:ClosedAxisScoreV311}
    | {status:'unavailable';reason:DiscoveryUnavailableReasonV311;score:null};
  quality:
    | {status:'available';reason:null;score:ClosedAxisScoreV311;availableWeight:number;components:Record<'roicOrRoe'|'growthAcceleration'|'marginTrend'|'cashConversionAccruals'|'leverageInterestCover'|'revisions',ClosedAxisScoreV311|null>;referenceManifestRef:string}
    | {status:'unavailable';reason:QualityUnavailableReasonV311;score:null;availableWeight:number;components:Record<'roicOrRoe'|'growthAcceleration'|'marginTrend'|'cashConversionAccruals'|'leverageInterestCover'|'revisions',ClosedAxisScoreV311|null>;referenceManifestRef:string|null};
  valuation:
    | {status:'normal';score:ClosedAxisScoreV311;reason:null}
    | {status:'valuation_review';score:null;reason:'valuation_review'|'authority_conflict'|'missing_official_pe'|'non_positive_reported_pe'|'insufficient_own_history'|'sector_reference_insufficient'|'calendar_authority_mismatch'|'manifest_missing'|'manifest_hash_mismatch'};
  timingRisk:
    | {status:'buy_eligible'|'wait_trigger';score:ClosedAxisScoreV311;reason:null;shadowBiasPoints:Record<Exclude<HorizonV3,'thesis_120_250d'>| 'thesis_120_250d',number|null>}
    | {status:'observe_only';score:null;reason:'bias_observe_only';shadowBiasPoints:Record<Exclude<HorizonV3,'thesis_120_250d'>| 'thesis_120_250d',number|null>}
    | {status:'blocked';score:null;reason:'below_support'|'reclaim_required'|'invalidated';shadowBiasPoints:Record<Exclude<HorizonV3,'thesis_120_250d'>| 'thesis_120_250d',number|null>}
    | {status:'unavailable';score:null;reason:'technical_unavailable';shadowBiasPoints:Record<Exclude<HorizonV3,'thesis_120_250d'>| 'thesis_120_250d',null>};
};
type ReportedPeCurrentV311 =
  | {status:'available';reason:null;value:number;asOf:string;sourceRef:string;manifestRef:string}
  | {status:'unavailable';reason:ReportedPeUnavailableReasonV311;value:null;asOf:null;sourceRef:null;manifestRef:string|null};
type ReportedPeOwnHistoryV311 =
  | {status:'available';reason:null;count:number;p10:number;p25:number;p50:number;p75:number;p90:number;currentPercentile:number;asOf:string;manifestRef:string}
  | {status:'unavailable';reason:ReportedPeUnavailableReasonV311;count:number;p10:null;p25:null;p50:null;p75:null;p90:null;currentPercentile:null;asOf:null;manifestRef:string|null};
type ReportedPeSectorV311 =
  | {status:'available';reason:null;count:number;p25:number;p50:number;p75:number;capWeightedAggregate:number;asOf:string;manifestRef:string}
  | {status:'unavailable';reason:ReportedPeUnavailableReasonV311;count:number;p25:null;p50:null;p75:null;capWeightedAggregate:null;asOf:null;manifestRef:string|null};
type RelativeMultipleV311 = {
  exchangeReportedPe:ReportedPeCurrentV311;
  ownHistory:ReportedPeOwnHistoryV311;
  sector:ReportedPeSectorV311;
  modelComparablePe:null|{value:number;method:'pe'|'normalized_pe';asOf:string;sourceRefs:string[];reason:null}|{value:null;method:null;asOf:null;sourceRefs:[];reason:'negative_eps'|'method_not_pe'|'valuation_review'};
};
type BiasOwnHistoryV311 =
  | {status:'available';reason:null;count:number;p10:number;p25:number;p50:number;p75:number;p90:number;label:BiasLabelV311;asOf:string;manifestRef:string}
  | {status:'unavailable';reason:BiasUnavailableReasonV311;count:number;p10:null;p25:null;p50:null;p75:null;p90:null;label:null;asOf:null;manifestRef:string|null};
type BiasSectorV311 =
  | {status:'available';reason:null;count:number;p10:number;p25:number;p50:number;p75:number;p90:number;asOf:string;manifestRef:string}
  | {status:'unavailable';reason:BiasUnavailableReasonV311;count:number;p10:null;p25:null;p50:null;p75:null;p90:null;asOf:null;manifestRef:string|null};
type MaDeviationV311 =
  | {availability:'unavailable';reason:BiasUnavailableReasonV311;bias20Pct:null;bias60Pct:null;bias120Pct:null;bias20Atr:null;ownHistory:BiasOwnHistoryV311;sector:BiasSectorV311}
  | {availability:'available';reason:null;bias20Pct:number;bias60Pct:number;bias120Pct:number;bias20Atr:number;ownHistory:BiasOwnHistoryV311;sector:BiasSectorV311};
type ChangedBecauseV3 =
  | {code:'candidate_state_changed';from:CardStateV3;to:CardStateV3}
  | {code:'new_position_action_changed';from:NewPositionActionV3;to:NewPositionActionV3}
  | {code:'formal_status_changed';from:FormalResearchStatusV3;to:FormalResearchStatusV3}
  | {code:'factor_contribution_changed';factor:FactorKeyV3;delta:number};

type OpportunityCardV3 = {
  symbol: string; // 4..10 chars
  chineseName: string|null; // exact nullable generated roster officialName, max 40 chars; long legal names are never truncated
  detailPath: string; // exactly /opportunity-v3/{available enrich run UUID}/{symbol}, max 80 chars
  directSource: boolean;
  candidateState: CardStateV3;
  primaryHorizon: Exclude<HorizonV3,'thesis_120_250d'>;
  rank: number;
  score: number;
  scoreDelta: number|null;
  factorScores: Record<FactorKeyV3, number>;
  factorAxes:FactorAxesV311;
  availableWeight: number;
  sourceRefs: string[]; // max 5 opaque refs
  sourceSummary: {anchorSourceKey:string;anchorSourceClass:'official'|'public_research'|'curated_thesis'|'community';anchorEffectiveAt:string;independentRootCount:number};
  researchMaturity:'source_signal'|'fundamental_review'|'decision_ready';
  fundamental:{thesis:string;latestChange:string;risks:string[];evidenceRefs:string[];asOf:string};
  formalResearchStatus: FormalResearchStatusV3;
  actionDecision: PublicActionDecisionV3;
  valuation: ValuationDistributionV3 & {relativeMultiple:RelativeMultipleV311};
  technicalDecision: TechnicalDecisionV3 & {maDeviation:MaDeviationV311};
  sectorCycle: SectorCycleV3;
  changedBecause: ChangedBecauseV3[]; // max 3
  lastEvaluatedAt:string;
  analysisGeneratedAt:string;
  materialChangeHash:string; // exactly 64 lowercase hex
  materialChangedBecause:Array<'source_evidence_changed'|'financial_fact_changed'|
    'price_trigger_changed'|'technical_state_changed'|'valuation_changed'|'risk_changed'|'factor_correctness_changed'>; // max 7
  noChangeMessage:string|null;
};

type OpportunitySourceSignalV3 = {
  symbol:string;chineseName:string|null;
  researchMaturity:'source_signal';
  newPositionAction:'valuation_review';
  discoveredAt:string;
  sourceClass:'official'|'public_research'|'curated_thesis'|'community';
  sourceSummary:string; // NFC single line, 1..180 code points and <=720 UTF-8 bytes
  evidenceRefs:string[]; // 1..5 unique opaque refs, each 1..120 code points/480 bytes
  valuationStatus:'pending'|'review_required';
  technicalState:'below_support'|'reclaim_required'|'at_support'|'breakout_pending'|
    'breakout_confirmed'|'extended'|'invalidated'|'unavailable';
  changedBecause:'new_in_seed_symbol'|'new_out_of_seed_symbol'|
    'new_source_evidence'|'material_source_change';
};

`chineseName` is exactly the nullable database-generated public name from
`instrument-roster-contract.md`; a 41..120-code-point legal-only official name remains
null and is never truncated. Source-signal summary/ref bounds are byte-identical to
`legacy-radar-correctness-contract.md`; control characters, raw connector text,
duplicate refs and over-bound strings fail serialization.

type OpportunityDiscoveryDeltaV3 = {
  asOf:string;
  entrants:Array<{symbol:string;reason:'new_in_seed_symbol'|'new_out_of_seed_symbol'|
    'new_source_evidence'|'material_source_change'}>;
  exits:Array<{symbol:string;reason:'evidence_expired'|'roster_ineligible'|
    'material_contradiction'|'ranking_cap'}>;
  continuations:Array<{symbol:string;reason:'refreshed'|'unchanged'}>;
  unchangedReasonCounts:Record<'same_material_evidence'|'duplicate_claim'|
    'candidate_cap'|'shallow_cap'|'deep_cap',number>;
};

type VerifiedChangeKindV3 = 'official_event'|'fundamental_update'|'valuation_update'|'source_corroboration'|'contradiction';
type VerifiedChangeLaneKeyV3 = 'new_verified_change'|'strengthened_thesis'|'contradiction_or_review';
type VerifiedChangeBriefV3 = {
  briefVersion:'verified-change-brief-v3.0';
  changeKind:VerifiedChangeKindV3;
  headline:string;
  whatChanged:string;
  whyItMatters:string;
  verifiedAt:string;
  sourceCutoff:string;
  evidenceRefs:string[];
  independentSourceClassCount:1|2|3|4;
  contradictions:Array<{code:'conflicting_source'|'missing_official_confirmation'|'stale_evidence'|'valuation_outlier';evidenceRef:string|null}>;
  formalResearchStatus:FormalResearchStatusV3;
  primaryHorizon:Exclude<HorizonV3,'thesis_120_250d'>;
  scoreDelta:number|null;
  detailPath:string;
  disclosure:'V3_SHADOW_RESEARCH_NOT_INVESTMENT_ADVICE';
};
type VerifiedChangeItemV3 = {symbol:string;chineseName:string|null;lane:VerifiedChangeLaneKeyV3;brief:VerifiedChangeBriefV3;card:OpportunityCardV3};
type VerifiedChangeWorkspaceV3 = {status:'empty'|'available';lanes:Array<{key:VerifiedChangeLaneKeyV3;items:VerifiedChangeItemV3[]}>};
type OpportunityHomepageSummaryV3 = {
  workspacePath:'/opportunity-v3';
  asOf:string;
  status:'empty'|'available';
  totalCount:number;
  laneCounts:Record<VerifiedChangeLaneKeyV3,number>;
  topItems:Array<Pick<VerifiedChangeBriefV3,'changeKind'|'headline'|'verifiedAt'|'detailPath'> & {symbol:string;chineseName:string|null}>;
};

type AssistiveArtifactSummaryV3 = {
  artifactRef: string; // opaque, 1..120 chars
  artifactHash: string; // exactly 64 lowercase SHA-256 hex chars
  artifactKind: 'news_sentiment'|'embedding'|'time_series';
  licenseId: string; // 1..80 chars
  licenseEvidenceRef: string; // opaque, 1..120 chars
  trainingCutoff: string; // ISO-8601
  evaluationManifestRef: string; // opaque, 1..120 chars
  comparisonBaselineKey: string; // exactly the consuming run/evaluation manifest comparisonContractKey, 64 lowercase SHA-256 hex chars
  outOfSample: {precisionAt20:number;ndcgAt20:number;worstDecileMae20Pct:number};
  influence: 'none';
};

type OpportunityEngineAvailableV3 = {
  contractVersion: 'source-led-opportunity-v3.6';
  availability: 'available';
  featureVersion: string; // 1..80 chars
  decisionVersion: string; // 1..80 chars
  mode: EngineModeV3;
  runId: string; // UUID, 36 chars
  sourceRunId: string; // bound source_scan UUID, 36 chars
  asOf: string; // exactly the selected run sourceCutoff, ISO-8601
  decisionContext: {mode:'research_only'; personalized:false; sizingVisible:false};
  sourceFunnel: SourceFunnelSummaryV3;
  sourceSignals: OpportunitySourceSignalV3[]; // max 30
  discoveryDelta: OpportunityDiscoveryDeltaV3;
  marketContext: MarketContextV3;
  rankedLanes: Array<{horizon:HorizonV3; cards:Array<Pick<OpportunityCardV3,'symbol'|'rank'|'score'|'scoreDelta'|'formalResearchStatus'>>}>; // exactly 3 lanes, max 20 each
  actionableNow: OpportunityCardV3[]; // max 6
  waitingForTrigger: OpportunityCardV3[]; // actionable + waiting <= 12
  valuationReview: OpportunityCardV3[]; // max 8
  verifiedChangeWorkspace: VerifiedChangeWorkspaceV3;
  homepageSummary: OpportunityHomepageSummaryV3;
  missedSourceAudit: {auditedSessionDate:string; auditedCloseAt:string; auditWindowClosesAt:string; sourceCollectionCutoff:string; maturity:'pending'|'matured'; moverCount:number; laterMentionedCount:number; sourceRecallPct:number|null; symbols:string[]}; // max 20 canonical symbols, never actionable
  engineHealth: {status:'ok'|'degraded'; sourceCutoff:string; acceptanceVersion:'1.44.6'; modelInfluence:'none'; assistiveArtifacts:AssistiveArtifactSummaryV3[]; warnings:EngineWarningV3[]}; // max 3 artifacts and 7 unique warnings
};

type OpportunityEngineUnavailableV3 = {
  contractVersion: 'source-led-opportunity-v3.6';
  availability: 'unavailable';
  mode: 'shadow';
  asOf: string; // exactly requestProjectionCutoff C
  runId: null;
  sourceRunId: null;
  engineHealth:
    | {status:'pending'; sourceCutoff:string; acceptanceVersion:'1.44.6'; modelInfluence:'none'; reason:'cold_start'|'no_matching_success'|'matching_run_in_progress'; assistiveArtifacts:[]; warnings:EngineWarningV3[]}
    | {status:'failed'; sourceCutoff:string; acceptanceVersion:'1.44.6'; modelInfluence:'none'; reason:'latest_matching_failed'; assistiveArtifacts:[]; warnings:EngineWarningV3[]};
};

type OpportunityEngineV3 = OpportunityEngineAvailableV3 | OpportunityEngineUnavailableV3;
```

The runtime serializer rejects unknown fields, non-finite numbers, invalid ISO timestamps, negative counts and any bound violation. All IDs/refs are opaque; raw connector text, arbitrary metadata, request/provider config and secrets are forbidden.

Global string limits are: source/enum keys 40 characters, UUIDs 36, ISO timestamps 40, symbols 10, names 40, detail paths 80, contract/feature/decision/license versions 80, evidence/artifact refs 120, and entry triggers 160. Closed reason/warning enums reject unknown strings. The tighter inline limit wins. Global array limits are: 20 connector-accounting rows, 5 quota reasons, 5 source refs, 8 valuation refs, 5 block reasons, 8 valuation reasons, 3 transition/factor changed objects, 7 material-changed reasons, 4 fundamental risks, 8 fundamental refs, 24 scenario inputs, 4 scenario sensitivities, 2 valuation cross-checks, 3 sector reasons, 7 sector inputs, 5 missing market groups, 3 inputs per market group, 30 source-signal cards, 30 discovery entrants, 30 exits, 60 continuations, 3 lanes with 20 compact cards each, 6 actionable cards, 12 combined actionable/waiting cards, 8 valuation-review cards, 20 audit symbols, 3 assistive artifacts and 7 health warnings.

Every count, rank and sample size is a non-negative safe integer. Per connector, eligible/deferred document counts are bounded 0..1,000,000; selected documents and each document outcome are 0..1,000; extracted claims and each claim outcome are 0..200,000; raw mentions and each mention outcome/reason count are 0..1,000,000. Aggregate source counts are bounded by 20 times the applicable per-connector maximum. Active/deferred candidate counts are 0..60, shallow stage counts 0..30 and deep stage counts 0..20. Card/lane rank is 1..20; `sourceSummary.independentRootCount` is the exact distinct fresh-root count from 1 through 4,000,000, the closed maximum from 20 connectors times 200,000 extracted claims.

Scores, factor scores, available weight, market/sector scores, composites and non-null source recall are finite numbers from 0 through 100. Confidence is 0..1; `scoreDelta` and changed factor-contribution `delta` are finite -100..100. Price/value/multiple/reference-quantile fields are finite 0..1,000,000,000. Position percentages obey their tighter inline bounds. Historical and peer sample sizes are respectively 0..20 and 0..20,000. Mover, later-mentioned and audit-symbol counts are 0..20 and `laterMentionedCount <= moverCount`. A pending audit has `sourceCollectionCutoff = sourceCutoff`, later-mentioned count based only on the bounded partial window and null recall. A matured audit has `sourceCollectionCutoff = auditWindowClosesAt`; recall is null exactly when mover count is zero, otherwise it equals `roundHalfAwayFromZero(100 * laterMentionedCount / moverCount, 2)`.

For each assistive artifact, `outOfSample.precisionAt20` and `ndcgAt20` are finite `0..1`, and `worstDecileMae20Pct` is finite `-100..0`. Artifact rows use the exact deterministic cutoff selection/order in `storage-schema-contract.md`; duplicate hashes are forbidden in the public array, all refs are opaque, and every item has zero decision influence.

`missedSourceAudit.symbols` contains exactly `moverCount` unique symbols in the mover selection order: official corporate-action-adjusted one-session return descending, official session turnover descending, symbol ascending. The order never changes as mentions mature; `laterMentionedCount` is a count over that fixed array and does not filter/reorder it.

`rankedLanes` has exactly three unique entries in this order: `momentum_5_20d`, `swing_20_60d`, `thesis_120_250d`. Within a lane ranks are consecutive from one after its score/confidence/symbol ordering. Database begin derives `comparisonContractKey` only from the byte-exact `opportunity-comparison-contract-v3.0` preimage and `staticIdentityMembers` array in `runtime-transaction-contract.md` v3.17. It deliberately excludes mode, purpose, cutoff, run IDs and every point-in-time row/dataset/session/window member. No HTTP/PostgREST argument supplies this key. The immediately preceding comparable success has the same comparison key and greatest earlier cutoff, then greatest terminal-success timestamp. More than one success tied on cutoff and terminal-success timestamp is lineage-integrity failure. An exact zero score change serializes as `0`; only absence of a comparable preceding lineage serializes as null.

The static comparison tuple is closed by the exact 41 named members in that runtime contract, including the literal acceptance inventory version, `factorCorrectnessContractVersion`, V3.11 discovery/technical/revision versions and `priceProviderAllowlistHash`. Changing any literal version or any one of its six static policy/configuration hashes changes `comparisonContractKey` even when every point-in-time manifest remains byte-identical. Acceptance rejects a missing, extra, renamed, reordered or null member and freezes golden canonical bytes plus digest.

Decision arrays are mutually exclusive by symbol. `actionableNow` contains only `starter_now` then `event_starter`, ordered by action class, score descending, confidence descending, symbol ascending, capped at 6. `waitingForTrigger` contains only `wait_trigger`, ordered score/confidence/symbol, and is truncated so actionable plus waiting is at most 12. `valuationReview` contains only `valuation_review`, ordered score/confidence/symbol and capped at 8. `avoid` appears only in ranked lanes. Each ranked lane contains the top 20 deep snapshots for that horizon ordered score, score confidence, symbol; the same symbol may occur once in each lane. `sourceSignals` is a separate non-actionable observation surface, requires `source_signal/valuation_review`, and can include a newly discovered roster symbol before valuation; it never enters an actionable array.

Candidate-state mapping is fixed: starter/event -> `actionable_now`; wait -> `waiting_trigger`; valuation-review -> `valuation_review`; avoid -> `avoid`. A decision-array card's `primaryHorizon` equals action primary horizon; for valuation-review it uses the max momentum/swing ranking horizon with swing on ties. `ActionDecisionV3.primaryHorizon` is null only when critical-data validation prevents both momentum/swing scores; event starter uses momentum and every other scored branch uses the max momentum/swing rule with swing on ties. `deep_research` is an internal pre-decision state and is never emitted in a terminal decision array.

Every full card's `detailPath` is exactly `/opportunity-v3/${runId}/${symbol}` using the enclosing available enrich-run UUID and that card's canonical symbol. Ranked-lane compact cards deliberately omit the path. The detail route and payload obey `v3-detail-contract.md`; a different run/symbol, legacy route or fallback is invalid.

`scoreDelta` compares the same symbol/horizon with the immediately preceding successful `enrich_rank` selected by `comparisonContractKey`; evolving point-in-time data/manifests are the intended source of the delta. It is null when no comparable success contains that symbol/horizon. With no comparable prior symbol snapshot, `changedBecause` is empty. Otherwise append changed transitions in exact code order `candidate_state_changed`, `new_position_action_changed`, `formal_status_changed`; then compute each primary-horizon factor contribution delta as `roundHalfAwayFromZero(currentContribution-priorContribution,2)`, discard exact zero, sort absolute delta descending then factor enum order, and append until the three-item cap. Typed objects are never prose and transition truncation precedes factor deltas. Every deep card carries a valuation object, using status `missing` and null method/values rather than a null object.

The available and unavailable union is exhaustive. Let C be the server-owned normalized `requestProjectionCutoff`. A matching attempt has the requested server-owned run purpose, deployed comparison contract key, `sourceCutoff <= C` and `createdAt <= C`. Run status at C is derived without reading current status as historical authority: `success|failed|converged` is visible only when the row's immutable terminal kind has `terminalAt <= C`; every row with null `terminalAt` or `terminalAt > C` is active at C, classified `running` exactly when non-null `sealedAt <= C`, otherwise `preparing`. Equality is visible: a seal at C is running and a terminal transition at C takes precedence and is terminal. `createdAt`, `sealedAt` and `terminalAt` are database-owned and write-once as specified by the storage/runtime contracts.

First select a visible matching success by greatest source cutoff then greatest terminal-success timestamp; two successes tied on both fields are lineage-integrity failure and cannot project available. Otherwise: `unavailable/cold_start` means no V3 enrich attempt of any key has `createdAt <= C` and status is `pending`; `no_matching_success` means such attempts exist but none match and status is `pending`; `matching_run_in_progress` with status `pending` means at least one matching attempt is active at C and no matching success exists, regardless of older visible matching failures or visible converged audit attempts; `latest_matching_failed` with status `failed` means visible matching failed attempts exist, none succeeded and none is active at C, selecting failure evidence by greatest source cutoff, greatest terminal timestamp, then run UUID ascending. A convergence visible at C is neither active nor failure evidence; its referenced success can win only when that success is itself terminal-visible at C. No other reason/status pair serializes. Unavailable egress never fabricates run IDs, funnel/context/cards or assistive artifacts and never falls back to legacy data inside the V3 object.

Top-level document/claim/mention scalars, outcomes and reasons must equal the corresponding connector-row sums, and `activeCandidateCount` equals the sum of connector `linkedCandidateCount` ownership counts; mention reason counts and mention outcome counts must each sum to `rawMentions`. Candidate-stage conservation is exact: `activeCandidateCount = shallowPlannedCount + deferredBeforeShallowCount`; `shallowPlannedCount = shallowSucceededCount + shallowFailedCount`; `shallowSucceededCount = deepPlannedCount + deferredBeforeDeepCount`; and `deepPlannedCount = deepSucceededCount + deepFailedCount`. Only `deepSucceededCount` may contribute score snapshots/cards. Valuation `normal` requires non-null ordered values/method/confidence, bear/base/bull whose values equal p10/p50/p90 and every method-required reference/cross-check; `missing` requires null method/values/scenarios/confidence; `stale` requires a selected method but null values/scenarios/confidence. `outlier_review` requires a selected method except when its first reason is a closed operating-bridge failure detected before method eligibility, in which case method is null; no other null-method outlier is valid. High-upside/consensus/ordering/method-divergence outliers may retain finite ordered values as specified; bridge/negative/non-finite/capital-structure outliers require null public values/scenarios/confidence. Reference sample counts/quantile triples and missing-manifest nullability follow `valuation-contract.md`.

Internal candidate/allocation rows retain the complete `InternalActionDecisionV3` for conservation and shadow evaluation. Public compact/detail card serialization uses only `PublicActionDecisionV3`, rejects all three sizing keys at every nesting depth, and exposes `decisionContext={mode:'research_only',personalized:false,sizingVisible:false}`. Public existing-position action remains `no_position` with `portfolio_context_unavailable`; its hidden target percentage is not serialized.

`verifiedChangeWorkspace` has exactly three lanes in the order and with the derivation, uniqueness, sorting, per-lane eight-item cap and combined eighteen-item round-robin cap in `hybrid-product-amendment.md`. Brief strings follow the exact NFC/whitespace and `96/280/280` limits there; evidence refs are 1..3 and contradictions 0..3. `homepageSummary` is derived only from that stored workspace, contains at most three round-robin items, and exposes no score, action, sizing or raw evidence. An available run with zero eligible briefs uses workspace/summary status `empty`; unavailable engine payloads contain neither member.

Public projection time is server-owned. Normalize C to UTC RFC-3339 with whole seconds and literal `Z`; fractional seconds are rejected rather than rounded. An available object is read byte-for-byte from `opportunity_public_projections_v3`: its stored `asOf` and `engineHealth.sourceCutoff` both equal the selected run's immutable normalized `sourceCutoff`. C is only the selection boundary and is not serialized or substituted into an available payload. An unavailable object has no selected run, is serialized for C, and sets both `asOf` and `engineHealth.sourceCutoff` to C; it never copies a failed/active attempt's cutoff. The endpoint cannot add a request envelope, mutate/re-canonicalize a stored success or mix fields from different runs. The four unavailable reason/status pairs and their precedence are the exhaustive rules above. Every available or unavailable object sets `engineHealth.acceptanceVersion` to the exact canonical inventory literal `1.44.6`; a different/unknown version fails serialization and cannot claim V3 acceptance traceability. `legacy-compatibility-contract.md` v3.2 executes before this serializer and omits the entire V3 member in `disabled|drain`, with zero V3 query.

Available `engineHealth.warnings` is the unique canonical enum-order set derived from facts: connector failure/degradation -> `connector_degraded`; incomplete market -> `market_incomplete`; any emitted unknown sector cycle from missing inputs -> `sector_cycle_unknown`; pending selected mover audit -> `source_audit_pending`; absent comparison lineage -> `prior_lineage_missing`; any deep-success valuation not normal -> `valuation_missing`; and `shadow_only` is always present. `source_audit_pending` and `shadow_only` are expected informational states; status is `degraded` iff any other warning is present, otherwise `ok`.

For `matching_run_in_progress`, warning authority is exactly one selected active-at-C attempt: greatest `sourceCutoff`, then greatest `createdAt`, then run UUID ascending. Derive only warnings having an append-only `opportunity_run_warning_facts_v3` row with `recordedAt <= C` whose producing job succeeded with `terminalAt <= C`; the fact and job completion are one transaction. Add `shadow_only`, use canonical enum order and never union warnings across attempts. Later terminalization, later completed stages and current retry/lease/job status cannot change the answer at C. For `latest_matching_failed`, use the already selected visible failure attempt and the same cutoff-visible warning-fact rule. `cold_start` and `no_matching_success` have exactly `["shadow_only"]` and cannot invent operational warnings. Visible converged attempts never supply warning metadata. Available warnings come only from the selected run's already frozen stored projection. Warnings and assistive artifacts never affect unavailable-reason precedence.

`sourceSummary` is a typed projection of the anchor claim selected by `scoring-contract.md`: its owning source key, cutoff-bound source class from `source-matrix.md`, effective timestamp and exact count of distinct fresh `evidenceRootId` values. `sourceRefs` begins with the anchor claim's opaque ref, then traverses all fresh unique-root representatives ordered by claim confidence descending, effective timestamp descending, canonical claim ID ascending and opaque ref ascending; append the first unseen refs until five. It contains no generated prose, saturation or database-order choice.

`invalidation` has one stop authority. `criticalDataInvalid` emits
`data_integrity_review`. Otherwise `evidenceExpiresAt` is the earliest TTL expiry
among fresh unique anchor-supporting roots. `starter_now|event_starter` require the
same available typed technical decision that made the branch buy-eligible; emit
`price_stop_or_evidence_expiry` and copy `stopPrice` byte-for-byte from
`technicalDecision.invalidation.stop`. Recomputing a stop from current price, MA20,
support, ATR or any other public-card field is forbidden. `wait_trigger` owns a
typed trigger and emits action-level `evidence_expiry_only` with null public stop.
The separate `technicalDecision` is preserved byte-for-byte:
`breakout_pending` retains its conditional `trigger_zone` plus typed invalidation,
while `below_support|reclaim_required|extended` retain null entry/invalidation.
`valuation_review|avoid` also publish no entry-linked stop even if their informational
technical object contains geometry. Any buy-like branch with a null technical
entry/invalidation, any non-buy action with a non-null public stop, or any buy-like
public stop not exactly equal to the typed technical stop fails serialization.
