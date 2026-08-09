export type SignalFreshness = 'fresh' | 'stale' | 'missing';

export type StrategyState = 'active' | 'hit_target' | 'hit_stop_loss' | 'invalidated' | 'closed';
export type RecommendationState = 'signal_candidate' | 'partially_verified' | 'validated_thesis' | 'actionable_setup';
export type StoryType =
  | 'product_upgrade'
  | 'supply_chain_win'
  | 'shortage_pricing'
  | 'operating_turnaround'
  | 'policy_benefit'
  | 'inventory_reversal'
  | 'valuation_reset'
  | 'conference_guidance';
export type VerificationStatus = '未證實' | '部分證實' | '已證實';
export type ValuationSource = 'valuation_cases' | 'broker_report' | 'thesis_model' | 'missing' | 'demo_seed';
export type RecommendationBucket = 'early_formal' | 'high_conviction' | 'scenario_upside' | 'historical_fallback' | 'early_watch';
export type RecommendationDisplayBucket =
  | 'formal'
  | 'scenario'
  | 'early'
  | 'hot_tracking'
  | 'historical_observation'
  | 'revaluation_queue'
  | 'valuation_reflected_archive'
  | 'archived_over_target';
export type RecommendationDisplayTargetMode =
  | 'actionable'
  | 'scenario_only'
  | 'early_potential'
  | 'needs_revaluation'
  | 'hidden_over_target';
export type ValuationQuality = 'broker_anchored' | 'story_modeled' | 'financial_proxy' | 'fallback_proxy';
export type ScenarioDriverType = 'story_tam' | 'broker_target' | 'financial_proxy' | 'fallback_proxy' | 'unknown';
export type ValuationSanityStatus =
  | 'normal'
  | 'outlier_review'
  | 'insufficient_verified_basis'
  | 'stale_multiple'
  | 'unit_mismatch'
  | 'over_target';
export type RecommendationGateStatus =
  | 'formal_pass'
  | 'scenario_only'
  | 'over_target'
  | 'needs_revaluation'
  | 'entry_blocked'
  | 'insufficient_bridge';
export type TargetCoverageStatus = 'base_upside' | 'scenario_only' | 'over_base_and_scenario' | 'missing_target';
export type RevaluationJobState =
  | 'queued'
  | 'running'
  | 'repriced'
  | 'unchanged_with_reason'
  | 'promoted_scenario_to_base'
  | 'blocked_insufficient_evidence'
  | 'archived_reflected';
export type ScenarioPromotionStatus =
  | 'eligible'
  | 'price_led_fundamentals_pending'
  | 'price_led_market_rerating_pending_evidence'
  | 'insufficient_evidence'
  | 'no_independent_scenario'
  | 'not_ready';
export type EntryDecisionAction =
  | '建議買進'
  | '建議小量買進'
  | '可分批買進'
  | '突破追蹤買進'
  | '突破後小量追蹤'
  | '等回測買點'
  | '等回測'
  | '不追價'
  | '不買'
  | '減碼'
  | '停利'
  | '出場';

export type EntryStyle = 'aggressive_fractional' | 'conservative_confirmed';

export type RevaluationSlaStatus = 'fresh' | 'due' | 'overdue' | 'blocked' | 'missing_job';

export interface EntryIndicatorStack {
  adx?: number | null;
  atr?: number | null;
  bollinger?: {
    upper: number | null;
    middle: number | null;
    lower: number | null;
    bandwidthPct: number | null;
    position: 'below_lower' | 'lower_half' | 'middle' | 'upper_half' | 'above_upper' | 'unknown';
  } | null;
  stochastic?: {
    k: number | null;
    d: number | null;
  } | null;
  mfi?: number | null;
  obv?: number | null;
  cmf?: number | null;
  volumeRatio20d?: number | null;
}

export interface EntryBuyPlan {
  initialSizePct: number;
  addSizePct: number;
  maxSizePct: number;
  buyZone: string;
  breakoutTrigger: string;
  pullbackTrigger: string;
  stopLoss: string;
  takeProfit: string;
  invalidation: string;
}

export interface BrokerEvidenceSearchStatus {
  status: 'hit' | 'miss' | 'pending' | 'stale' | 'not_attempted';
  summary: string;
  lastAttemptAt: string | null;
  nextAttemptAt?: string | null;
  sourceCount?: number | null;
  usBrokerCount?: number | null;
}

export type MarketGateStatus =
  | 'risk_on_can_attack'
  | 'selective_only'
  | 'risk_off_reduce'
  | 'market_breakdown_no_chase'
  | 'market_data_missing';

export interface MarketIndexSignal {
  status: MarketGateStatus;
  label: string;
  summary: string;
  asOf: string | null;
  trendScore: number | null;
  taiexState: string | null;
  otcState: string | null;
  breadthState: string | null;
  foreignFlowState: string | null;
  riskBudget: string;
  entryBias: string;
  exitBias: string;
  reasons: string[];
}

export type MarketReratingStatus = 'supports_multiple_expansion' | 'neutral' | 'compressing' | 'missing';
export type RepricingTriggerStrength = 'high' | 'medium' | 'low' | 'blocked' | 'missing';

export interface MarketValuationAdjustment {
  marketReratingStatus: MarketReratingStatus;
  marketReratingReason: string;
  targetPeAdjustmentHint: string;
  repricingTriggerStrength: RepricingTriggerStrength;
  requiredEvidence: string[];
  summary: string;
  asOf: string | null;
}

export interface RelativeStrengthSignal {
  status: 'outperforming' | 'inline' | 'lagging' | 'pending';
  summary: string;
  stockReturnPct: number | null;
  marketReturnPct: number | null;
  sectorReturnPct: number | null;
  relativeToMarketPct: number | null;
  relativeToSectorPct: number | null;
  asOf: string | null;
}

export interface TradeDecision {
  action: EntryDecisionAction;
  positionSize: string;
  entryZone: string;
  addCondition: string;
  stopLoss: string;
  takeProfit: string;
  exitCondition: string;
  marketGateReason: string;
  validUntil: string;
  confidence: number;
  reasons: string[];
  entryTriggers: NonNullable<EntryDecision['entryTriggers']>;
  exitTriggers: Array<{
    label: string;
    condition: string;
    action: Extract<EntryDecisionAction, '減碼' | '停利' | '出場' | '不買'>;
    status: 'active' | 'waiting' | 'blocked';
  }>;
}

export interface RevaluationJobSummary {
  jobId?: string | null;
  status: RevaluationJobState;
  queuedAt: string | null;
  lastAttemptAt: string | null;
  lastResult: string;
  requiredEvidence: string[];
  slaHours: number;
  slaStatus?: RevaluationSlaStatus;
  nextAttemptAt?: string | null;
  missingEvidence?: string[];
  triggerReason?: string | null;
  triggerSource?: string | null;
  brokerSearchSummary?: string | null;
  brokerEvidenceSearchStatus?: BrokerEvidenceSearchStatus | null;
}

export interface ScenarioPromotionGate {
  status: ScenarioPromotionStatus;
  canPromoteToBase: boolean;
  score: number | null;
  requiredScore: number;
  achievedEvidenceCount: number;
  requiredEvidenceCount: number;
  criticalChecks: Array<{
    label: string;
    passed: boolean;
    reason: string;
  }>;
  oldBaseTarget?: number | null;
  oldScenarioTarget?: number | null;
  proposedBaseTarget?: number | null;
  promotionEvidenceRefs: string[];
  summary: string;
}

export interface EntryDecision {
  action: EntryDecisionAction;
  positionSize: string;
  buyZone: string;
  addCondition: string;
  stopLoss: string;
  invalidation: string;
  validUntil: string;
  confidence: number;
  reasons: string[];
  actionabilityScore?: number | null;
  buyNowAllowed?: boolean;
  entryStyle?: EntryStyle;
  buyPlan?: EntryBuyPlan | null;
  indicatorStack?: EntryIndicatorStack | null;
  takeProfit?: string;
  exitCondition?: string;
  marketGateReason?: string;
  entryTriggers?: Array<{
    label: string;
    triggerType: 'buy_now' | 'pullback_buy' | 'breakout_buy' | 'add' | 'risk_off';
    condition: string;
    action: EntryDecisionAction;
    positionSize: string;
    invalidation: string;
    status: 'active' | 'waiting' | 'blocked';
  }>;
}

export interface SourceCoverageView {
  sourceName: string;
  sourceType:
    | 'official'
    | 'financial'
    | 'broker_report'
    | 'public_research'
    | 'threads'
    | 'bulltalk'
    | 'ptt'
    | 'kol'
    | 'news'
    | 'industry'
    | 'investanchors'
    | 'instagram'
    | 'telegram'
    | 'podcast'
    | 'youtube'
    | 'twse_insider';
  summary: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
  symbols: string[];
  directHit?: boolean;
  verificationStatus: VerificationStatus;
  confidence: number;
  weight: number;
}

export interface BrokerView {
  brokerName: string;
  reportDate: string | null;
  rating: string | null;
  targetPrice: number | null;
  forwardEps?: number | null;
  sourceMode?: string | null;
  isUsBroker?: boolean;
  thesisTitle: string | null;
  summary: string;
  sourceUrl?: string | null;
}

export interface ThesisModelView {
  thesisTitle: string;
  thesisSummary: string;
  recommendationTier: RecommendationState;
  verificationStatus: VerificationStatus;
  storySourceSummary: string | null;
  verificationSummary: string | null;
  financialProjectionSummary: string | null;
  valuationSummary: string | null;
  invalidationSummary: string | null;
  targetPriceLow: number | null;
  targetPriceHigh: number | null;
  confidence: number;
}

export interface RiskCounterpointView {
  label: string;
  summary: string;
}

export interface DeepDiveArticleSection {
  id: 'highlights' | 'stance' | 'market_story' | 'validation' | 'scenario_valuation' | 'risks';
  kicker: string;
  title: string;
  paragraphs: string[];
  bullets?: string[];
}

export interface DeepDiveNumberTrailItem {
  label: string;
  value: string;
  detail: string;
}

export interface DeepDiveScenarioNarrative {
  key: 'base' | 'upside' | 'invalidation';
  label: string;
  narrative: string;
  targetPrice: number | null;
  expectedReturnPct: number | null;
  assumptions: string[];
  bridgeCompleteness?: 'complete' | 'insufficient';
  insufficientBridgeReason?: string | null;
  estimatedFields?: string[];
  driverLabel?: string | null;
  driver?: string | null;
  marketSizingBridge?: string | null;
  operatingBridge?: string | null;
  revenueBridge?: string | null;
  marginBridge?: string | null;
  earningsBridge?: string | null;
  operatingAssumptions?: Array<{
    label: string;
    value: string;
    isEstimated?: boolean;
  }>;
  financialBridge?: string[];
  multipleBridge?: string | null;
  priceBridge?: string | null;
  projectedRevenueAnnual?: number | null;
  projectedGrossMarginPct?: number | null;
  projectedOperatingMarginPct?: number | null;
  projectedEps?: number | null;
  rawTargetPrice?: number | null;
  currentPeRatio?: number | null;
  currentPbRatio?: number | null;
  targetPeRatio?: number | null;
  targetPbRatio?: number | null;
  benchmarkMultipleRange?: string | null;
  evidenceRefs?: string[];
  evidenceBasis?: string[];
  customerExposure?: string | null;
  transcriptEvidence?: string | null;
  monthlyRevenueEvidence?: string | null;
  productMixEvidence?: string | null;
  marketShareEvidence?: string | null;
}

export interface DeepDiveSummaryCard {
  currentPrice: number | null;
  baseTarget: number | null;
  upsidePct: number | null;
  lastUpdatedAt: string | null;
  latestSourceAt: string | null;
  freshness: SignalFreshness;
}

export interface DeepDiveTargetSnapshot {
  currentPrice: number | null;
  baseTarget: number | null;
  upsideTarget: number | null;
  bearTarget: number | null;
  displayBaseUpsidePct: number | null;
  displayScenarioUpsidePct: number | null;
  cardPrimaryUpsidePct: number | null;
  cardPrimaryUpsideLabel: 'Base 空間' | '情境空間' | '已接近反映';
  displayTarget: number | null;
  displayTargetLabel: '正式目標價' | '情境目標價' | '已接近反映';
  displayUpsidePct: number | null;
  verdict: 'formal' | 'scenario' | 'reflected';
  bridgeCompleteness?: 'complete' | 'insufficient';
  estimatedFields?: string[];
  latestSourceAt: string | null;
  reportUpdatedAt: string | null;
  priceAsOf: string | null;
  priceRefreshStatus?: 'fresh' | 'stale' | 'missing' | 'pending' | null;
  repricedAt?: string | null;
  repricingReason?: string | null;
  unchangedReason?: string | null;
  revaluationStatus?: 'rebuilt' | 'repriced' | 'unchanged' | 'pending' | null;
  targetCoverageStatus?: TargetCoverageStatus;
  overTargetReason?: string | null;
  staleReason?: string | null;
  archiveReason?: string | null;
  valuationSanityStatus?: ValuationSanityStatus | null;
  valuationSanityReason?: string | null;
  valuationConfidenceGate?: DeepDiveValuationConfidenceGate | null;
  repricingRequiredEvidence?: string[];
  revaluationJobId?: string | null;
  revaluationJobStatus?: RevaluationJobSummary | null;
  revaluationSlaStatus?: RevaluationSlaStatus | null;
  nextRevaluationAt?: string | null;
  missingRepricingEvidence?: string[];
  brokerEvidenceSearchStatus?: BrokerEvidenceSearchStatus | null;
  lastRevaluationAttemptAt?: string | null;
  lastRevaluationResult?: string | null;
  scenarioPromotionStatus?: ScenarioPromotionStatus | null;
  marketValuationAdjustment?: MarketValuationAdjustment | null;
}

export interface DeepDiveChaseAssessment {
  verdict: 'can_chase' | 'wait_pullback' | 'story_over' | 'stale_data';
  label: string;
  reason: string;
  trigger: string;
  invalidation: string;
}

export interface DeepDiveLatestFact {
  id?: string;
  label: string;
  summary: string;
  asOf: string | null;
  sourceName: string;
  sourceUrl: string | null;
  sourceType: SourceCoverageView['sourceType'] | 'company_event' | 'valuation' | 'system';
  supportCase?: 'base' | 'scenario';
  sourceRefId?: string | null;
}

export interface DeepDiveThesisSnapshot {
  whyNow: string;
  story: string;
  validation: string;
  valuation: string;
  risk: string;
}

export interface DeepDiveAppendix {
  technicalSummary: string | null;
  sourceAppendix: Array<{
    label: string;
    items: SourceCoverageView[];
  }>;
  evidenceMatrix: EvidenceMatrixView[];
  connectorStatus: ConnectorStatusView[];
  coverageStatus?: Array<{
    id: string;
    label: string;
    status: 'hit' | 'missing' | 'degraded' | 'stale';
    summary: string;
    sourceTypes: string[];
    searched?: boolean;
    matched?: boolean;
    written?: boolean;
    cited?: boolean;
    failureReason?: string | null;
  }>;
  emptyState?: {
    technical?: string | null;
    evidence?: string | null;
    sources?: string | null;
  };
}

export interface DeepDiveReportSection {
  id:
    | 'analysis'
    | 'base_case'
    | 'scenario_case'
    | 'latest_evidence'
    | 'capital_flow'
    | 'investment'
    | 'risk';
  heading: string;
  paragraphs: string[];
  bullets?: string[];
  sourceRefs?: string[];
}

export interface DeepDiveReportSnapshot {
  title: string;
  subtitle: string | null;
  summaryBullets?: string[];
  sections: DeepDiveReportSection[];
}

export interface DeepDiveValuationBridge {
  driverLabel: string | null;
  storyDrivers: string[];
  operatingAssumptions: Array<{
    label: string;
    value: string;
    isEstimated?: boolean;
  }>;
  financialBridge: string[];
  multipleBridge: string | null;
  priceBridge: string | null;
  bridgeSummary: string | null;
}

export interface DeepDiveValuationCaseDetail {
  label: string;
  driver: string | null;
  bridgeCompleteness: 'complete' | 'insufficient';
  insufficientBridgeReason: string | null;
  estimatedFields: string[];
  sharedBasisRefs?: string[];
  deltaAssumptions?: string[];
  hasIndependentDelta?: boolean;
  promotionGate?: ScenarioPromotionGate | null;
  promotionEvidenceRefs?: string[];
  canPromoteToBase?: boolean;
  achievementChecklist?: Array<{
    label: string;
    status: '已達成' | '部分達成' | '尚待驗證' | '資料過期';
    score?: number | null;
    scoreReason?: string | null;
    summary: string;
    actualValue?: string | null;
    targetValue?: string | null;
    currentValue?: string | null;
    threshold?: string | null;
    updatedAt?: string | null;
    sourceRefs?: string[];
  }>;
  marketSizingBridge: string | null;
  revenueBridge: string | null;
  marginBridge: string | null;
  earningsBridge: string | null;
  multipleBridge: string | null;
  priceBridge: string | null;
  benchmarkRange: string | null;
  currentPeRatio: number | null;
  currentPbRatio: number | null;
  targetPeRatio: number | null;
  targetPbRatio: number | null;
  projectedRevenueAnnual: number | null;
  projectedGrossMarginPct: number | null;
  projectedOperatingMarginPct: number | null;
  projectedEps: number | null;
  targetPrice: number | null;
  expectedReturnPct: number | null;
  assumptions: string[];
  evidenceRefs: string[];
  evidenceBasis: string[];
  sourceRefs?: DeepDiveSourceCitationRef[];
  customerExposure: string | null;
  transcriptEvidence: string | null;
  monthlyRevenueEvidence: string | null;
  productMixEvidence: string | null;
  marketShareEvidence: string | null;
  isEstimated: boolean;
}

export type ValuationAssumptionSource =
  | 'official'
  | 'broker'
  | 'imported_pdf'
  | 'news_summary'
  | 'social'
  | 'internal_estimate';

export interface DeepDiveValuationAssumptionLedgerItem {
  caseLabel: 'Base' | '情境';
  key: 'revenue' | 'gross_margin' | 'operating_margin' | 'eps' | 'multiple' | 'target_price';
  label: string;
  value: string | null;
  formula?: string | null;
  sourceTypes: ValuationAssumptionSource[];
  trustLevel: 'verified' | 'mixed' | 'internal_only';
  sourceRefs?: string[];
  note?: string | null;
}

export interface DeepDiveForwardPeBridge {
  currentForwardPe: number | null;
  targetForwardPe: number | null;
  forwardEps: number | null;
  targetPriceFormula: string | null;
  sourceRefs: string[];
  status: 'verified' | 'estimated' | 'missing_forward_eps' | 'non_pe_model';
  summary: string;
}

export interface DeepDivePeerValuationRange {
  lowPe: number | null;
  midPe: number | null;
  highPe: number | null;
  adoptedPe: number | null;
  source: string | null;
  inRange: boolean | null;
  summary: string;
}

export interface DeepDiveValuationReviewFlag {
  code:
    | 'base_upside_gt_30'
    | 'scenario_upside_gt_100'
    | 'target_pe_above_peer'
    | 'missing_forward_eps'
    | 'internal_estimate_only'
    | 'ml_formula_divergence';
  severity: 'info' | 'warning' | 'blocker';
  summary: string;
}

export interface DeepDiveBrokerConsensus {
  sourceCount: number;
  usBrokerCount?: number;
  latestReportDate: string | null;
  minTargetPrice: number | null;
  medianTargetPrice: number | null;
  maxTargetPrice: number | null;
  forwardEpsLow?: number | null;
  forwardEpsMedian?: number | null;
  forwardEpsHigh?: number | null;
  freshnessStatus?: 'fresh' | 'stale' | 'missing';
  verifiedForBase?: boolean;
  ratingDistribution: Record<string, number>;
  stale: boolean;
  summary: string;
}

export interface DeepDiveValuationConfidenceGate {
  status: 'verified' | 'research_estimate_only' | 'insufficient_verified_basis';
  reason: string | null;
  baseTargetFormal: boolean;
  externalCitationCount: number;
  brokerCitationCount: number;
  officialCitationCount: number;
}

export interface DeepDiveMlForecastBand {
  status: 'available' | 'baseline' | 'missing';
  summary: string;
  horizons: Array<{
    days: 20 | 60 | 120;
    lowerPrice: number | null;
    medianPrice: number | null;
    upperPrice: number | null;
    upsideProbability: number | null;
    confidence: number | null;
  }>;
  modelVersion: string;
  trainingWindow: string | null;
  featureSet: string[];
  featureAttribution: Array<{
    feature: string;
    direction: 'positive' | 'negative' | 'neutral';
    contribution: number;
    summary: string;
  }>;
  confidence: number | null;
  sourceRefs?: string[];
  formalPromotionAllowed: false;
  boundary: 'assistive_only';
}

export interface DeepDiveValuationModelDivergence {
  status: 'normal' | 'valuation_model_divergence_review';
  formulaTarget: number | null;
  mlMedianTarget: number | null;
  gapPct: number | null;
  summary: string;
  reviewReason: string | null;
}

export interface DeepDiveSourceCitationRef {
  id: string;
  label: string;
  sourceType: string;
  sourceName: string;
  sourceUrl: string | null;
  asOf: string | null;
  evidenceClass: string;
}

export interface DeepDiveSharedVerifiedBasis {
  summary: string | null;
  customerExposure: string | null;
  transcriptEvidence: string | null;
  monthlyRevenueEvidence: string | null;
  productMixEvidence: string | null;
  marketShareEvidence: string | null;
  currentFinancialBaseline: string | null;
  evidenceBasis: string[];
  sharedBasisRefs: string[];
  sourceRefs?: DeepDiveSourceCitationRef[];
  supplyChainMap?: {
    upstream: string[];
    downstream: string[];
    potentialCustomers: string[];
    evidenceStatus: '具名官方/法說證據' | '供應鏈映射推估' | '未取得可引用來源';
    summary: string;
    sourceRefs?: string[];
  } | null;
  customerEvidenceStatus?: '具名官方/法說證據' | '供應鏈映射推估' | '未取得可引用來源';
  customerEvidenceRefs?: string[];
}

export interface DeepDiveValuationPanel {
  monthlyRevenue: number | null;
  yoyGrowth: number | null;
  momGrowth: number | null;
  epsTtm: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  baseTarget: number | null;
  upsideTarget: number | null;
  bearTarget: number | null;
  nextValidationPoint: string | null;
  dataAsOf: string | null;
  coreAssumptions?: string[];
  multipleMapping?: string | null;
  industryBenchmark?: string | null;
  priceTargetRationale?: string | null;
  peerComparison?: string | null;
  sourceCitationMap?: DeepDiveSourceCitationRef[];
  assumptionLedger?: DeepDiveValuationAssumptionLedgerItem[];
  brokerConsensus?: DeepDiveBrokerConsensus | null;
  valuationConfidenceGate?: DeepDiveValuationConfidenceGate | null;
  forwardPeBridge?: DeepDiveForwardPeBridge | null;
  peerValuationRange?: DeepDivePeerValuationRange | null;
  valuationReviewFlags?: DeepDiveValuationReviewFlag[];
  mlForecastBand?: DeepDiveMlForecastBand | null;
  valuationModelDivergence?: DeepDiveValuationModelDivergence | null;
  modelSignalSummary?: string | null;
  sharedVerifiedBasis?: DeepDiveSharedVerifiedBasis | null;
  scenarioNote?: string | null;
  baseCaseDetail?: DeepDiveValuationCaseDetail | null;
  scenarioCaseDetail?: DeepDiveValuationCaseDetail | null;
}

export interface DeepDiveChipBucket {
  balance: number | null;
  change: number | null;
  usageRatio: number | null;
  note?: string | null;
}

export interface DeepDiveInstitutionalFlow {
  latestNet: number | null;
  net5d: number | null;
  net20d: number | null;
  trend: 'buying' | 'selling' | 'mixed' | 'neutral';
}

export interface DeepDiveChipSnapshot {
  marginFinancing: DeepDiveChipBucket;
  shortInterest: DeepDiveChipBucket & {
    sblBalance: number | null;
  };
  institutionalFlows: {
    foreign: DeepDiveInstitutionalFlow;
    investmentTrust: DeepDiveInstitutionalFlow;
    dealer: DeepDiveInstitutionalFlow;
  };
  marketRotation?: string | null;
  sectorFlow?: string | null;
  timingScore?: number | null;
  timingAssessment: string | null;
  dataStatus?: {
    status: 'available' | 'partial' | 'missing';
    asOf: string | null;
    source: string | null;
    missingGroups: Array<'institutional' | 'margin' | 'short' | 'borrow'>;
    missingReasons: string[];
    fallbackUsed: boolean;
    officialSblAsOf?: string | null;
    officialSblSourceUrl?: string | null;
    borrowAuxiliaryOnly?: boolean;
    fallbackSourceUsed?: string | null;
  };
}

export type DeepDiveChipEntryVerdict =
  | '可小量分批'
  | '等回測'
  | '突破後小量追蹤'
  | '突破確認再追'
  | '過熱不追'
  | '籌碼偏亂先不買'
  | '趨勢轉弱'
  | '資料不足不買'
  | '資料不足暫緩';

export interface DeepDiveChipEntryAssessment {
  verdict: DeepDiveChipEntryVerdict;
  summary: string;
  chipRead: string;
  technicalRead: string;
  supportResistance: {
    supportLevel: number | null;
    resistanceLevel: number | null;
    invalidationLevel: number | null;
    summary: string;
  };
  watchNumbers: Array<{
    label: string;
    value: string;
    interpretation: string;
  }>;
  nextSessionPlaybook: Array<{
    scenario: '強勢開高' | '健康換手' | '弱勢轉弱';
    condition: string;
    action: string;
    riskControl: string;
  }>;
  microstructureStatus: Array<{
    key: 'innerOuterRatio' | 'priceDistribution' | 'brokerBranchFlow';
    label: string;
    status: 'available' | 'missing';
    summary: string;
    missingReason?: string | null;
  }>;
  missingReasons: string[];
  sourceRefs?: string[];
  actionabilityScore?: number | null;
  actionabilityReasons?: string[];
  entryDecision?: EntryDecision | null;
  buyZone?: string | null;
  positionSize?: string | null;
  stopLoss?: string | null;
}

export interface DeepDiveSourceFreshness {
  freshness: SignalFreshness;
  latestSourceAt: string | null;
  reportUpdatedAt: string | null;
  priceAsOf: string | null;
}

export interface DeepDiveDataHealth {
  marketDataAsOf: string | null;
  researchSourceAsOf: string | null;
  reportBuiltAt: string | null;
  freshnessStatus: 'healthy' | 'research_stale' | 'market_stale' | 'missing';
  staleReasons: string[];
  refreshQueued: boolean;
  priceRefreshLastSuccessAt?: string | null;
  priceRefreshScheduledAt?: string | null;
  priceRefreshStatus?: 'fresh' | 'stale' | 'missing' | 'pending';
  priceRefreshRecordsWritten?: number | null;
  priceRefreshFailureReason?: string | null;
  sourceStatuses?: Array<{
    id: 'official' | 'revenue' | 'financial' | 'investanchors' | 'kol' | 'chip' | 'technical' | string;
    label: string;
    status: 'hit' | 'missing' | 'degraded' | 'stale';
    lastSuccessAt: string | null;
    symbolsUpdated?: number | null;
    recordsWritten?: number | null;
    failureReason?: string | null;
  }>;
}

export interface DeepDiveRecommendationStance {
  fundamentalStance: '基本面買進' | '情境觀察' | '已反映' | '資料不足';
  entryStance: DeepDiveChipEntryVerdict;
  displayLabel: string;
  summary: string;
}

export interface EvidenceMatrixView {
  evidenceType: 'official' | 'conference' | 'financial' | 'broker_report' | 'industry' | 'social';
  sourceLabel: string;
  sourceUrl: string | null;
  stance: 'supporting' | 'neutral' | 'contradicting';
  strength: number;
  summary: string;
}

export interface DailyMarketFocus {
  market: 'TW' | 'US';
  asOf: string;
  sectorFlows: Record<string, number>;
  indexState: Record<string, unknown>;
  freshness: SignalFreshness;
}

type ResearchDecisionChangeReasonV311 =
  | 'source_evidence_changed'
  | 'financial_fact_changed'
  | 'price_trigger_changed'
  | 'technical_state_changed'
  | 'valuation_changed'
  | 'risk_changed'
  | 'factor_correctness_changed';

export interface AvailableResearchDecisionV311 {
  version: 'legacy-research-decision-v3.11.0';
  availability: 'available';
  symbol?: string;
  name?: string;
  researchMaturity: 'source_signal' | 'fundamental_review' | 'decision_ready';
  newPositionAction: 'avoid' | 'valuation_review' | 'wait_trigger' | 'event_starter' | 'starter_now';
  fundamental: {
    thesis: string;
    latestChange: string;
    risks: string[];
    evidenceRefs: string[];
    asOf: string;
  };
  technical: {
    availability: 'available' | 'unavailable';
    state: 'below_support' | 'reclaim_required' | 'at_support' | 'breakout_pending' | 'breakout_confirmed' | 'extended' | 'invalidated' | null;
    maDeviation?: number | null;
    bias?: {
      availability: 'available';
      bias20Pct: number;
      bias60Pct?: number | null;
      bias120Pct?: number | null;
      bias20Atr?: number | null;
      ownHistory?: { label?: 'extreme_low' | 'low' | 'normal' | 'high' | 'extended' | null; p10?: number | null; p50?: number | null; p90?: number | null };
      sector?: { p10?: number | null; p50?: number | null; p90?: number | null; count?: number };
    } | { availability: 'unavailable'; reason: string } | null;
    trigger?: { kind: 'reclaim' | 'breakout' | 'pullback'; threshold: number; volumeRatioMinimum: number | null } | null;
    entryZone?: { kind: 'market_zone' | 'trigger_zone'; lower: number; upper: number } | null;
    invalidation?: { stop: number; thesisLevel: number } | null;
  };
  valuation: {
    status: 'normal' | 'valuation_review';
    targetPrice?: number | null;
    valuationRange?: { bear: number; base: number; bull: number } | null;
    relativeMultiple?: { current: number; reference: number; ratio: number } | { availability: 'unavailable'; reason: string } | null;
    exchangeReportedPe?: { availability: 'available'; current?: number; value?: number; ownReference?: { p50?: number; percentile?: number }; sectorReference?: { capWeighted?: number; count?: number } }
      | { availability: 'unavailable'; reason: string } | null;
    modelComparablePe?: { availability?: 'available'; value: number; method: 'pe' | 'normalized_pe'; asOf?: string; sourceRefs?: string[] }
      | { value: null; reason: string } | null;
  };
  factorAxes?: { availability: 'available'; axes: {
    discovery: number;
    quality: number;
    valuation: number;
    timingRisk: number;
  }} | { availability: 'unavailable'; reason: string } | null;
  timingRisk: {
    status: 'blocked' | 'observe_only' | 'eligible' | 'unavailable';
    reason: string | null;
  };
  lastEvaluatedAt: string;
  analysisGeneratedAt: string;
  materialChangeHash: string;
  materialChangedBecause: ResearchDecisionChangeReasonV311[];
  noChangeMessage: string | null;
}

export interface UnavailableResearchDecisionV311 {
  version: 'legacy-research-decision-v3.11.0';
  availability: 'unavailable';
  reason:
    | 'projection_missing'
    | 'projection_stale'
    | 'source_unavailable'
    | 'insufficient_adjusted_history'
    | 'financial_inputs_missing';
  researchMaturity: 'source_signal';
  newPositionAction: 'valuation_review';
  lastEvaluatedAt: string | null;
  analysisGeneratedAt: null;
  materialChangeHash: null;
  materialChangedBecause: [];
  noChangeMessage: string | null;
}

export type ResearchDecisionV311 = AvailableResearchDecisionV311 | UnavailableResearchDecisionV311;

export interface RecommendationCard {
  recommendationId: string;
  symbol: string;
  name: string;
  market: 'TW' | 'US';
  currentPrice?: number | null;
  priceAsOf?: string | null;
  priceRefreshStatus?: 'fresh' | 'stale' | 'missing' | 'pending' | null;
  score: number;
  confidence: number;
  action: 'buy' | 'watch' | 'reduce';
  rationale: string;
  targetPrice?: number | null;
  stopLoss?: number | null;
  researchDecision?: ResearchDecisionV311 | null;
  strategyState?: StrategyState;
  recommendationState?: RecommendationState;
  storyType?: StoryType | null;
  thesisTitle?: string | null;
  thesisSummary?: string | null;
  catalystSummary?: string | null;
  expectedUpsidePct?: number | null;
  valuationSource?: ValuationSource;
  valuationConfidence?: number | null;
  isFallbackValuation?: boolean;
  evidenceScore?: number | null;
  timingScore?: number | null;
  communitySignalScore?: number | null;
  verificationStatus?: VerificationStatus;
  conditionalRecommendationNote?: string | null;
  whyNotRecommended?: string | null;
  chineseName?: string | null;
  firstRecommendedAt?: string | null;
  estimatedCatalystDate?: string | null;
  sourcePriorityScore?: number | null;
  evidenceAgeHours?: number | null;
  lastValidatedAt?: string | null;
  recommendationBucket?: RecommendationBucket;
  valuationQuality?: ValuationQuality | null;
  scenarioDriverType?: ScenarioDriverType | null;
  whyNotPromoted?: string | null;
  baseTarget?: number | null;
  upsideTarget?: number | null;
  displayBaseUpsidePct?: number | null;
  displayScenarioUpsidePct?: number | null;
  cardPrimaryUpsidePct?: number | null;
  cardPrimaryUpsideLabel?: 'Base 空間' | '情境空間' | '已接近反映';
  recommendationConfidenceScore?: number | null;
  scenarioChecklistProgress?: number | null;
  scenarioChecklistBreakdown?: {
    achieved: number;
    partial: number;
    pending: number;
    stale: number;
    total: number;
  } | null;
  scenarioChecklistScoreDetails?: Array<{
    label: string;
    score: number;
    status: string;
    reason?: string | null;
  }> | null;
  entryReadinessLabel?: string | null;
  entryReadinessReasons?: string[];
  baseVerificationLabel?: string | null;
  confidenceScoreBreakdown?: {
    bridgeEvidence: number;
    freshness: number;
    scenario: number;
    entryReadiness: number;
    upsideQuality: number;
    sectorRotationImpact?: number;
  } | null;
  recommendationIndex?: number | null;
  recommendationIndexBreakdown?: {
    valuationValidity: number;
    externalEvidence: number;
    financialBridge: number;
    peValuationGap?: number;
    entryCondition: number;
    stability?: number;
    upsideQuality: number;
  } | null;
  researchConfidenceScore?: number | null;
  recommendationLifecycleStage?:
    | 'discovered'
    | 'watchlist'
    | 'validated_thesis'
    | 'scenario_candidate'
    | 'formal_recommendation'
    | 'archived_reflected'
    | null;
  thesisMomentumScore?: number | null;
  recommendationStabilityScore?: number | null;
  whyChanged?: string | null;
  peValuationSignal?: {
    currentPe: number | null;
    normalizedPe: number | null;
    peerPeRange: string | null;
    sectorAveragePe: number | null;
    peDiscountPct: number | null;
    earningsInflection: boolean;
    reratingReason: string;
  } | null;
  forwardPeSignal?: {
    currentForwardPe: number | null;
    targetForwardPe: number | null;
    forwardEps: number | null;
    status: 'verified' | 'estimated' | 'missing_forward_eps' | 'non_pe_model';
    summary: string;
  } | null;
  crossThemeSignals?: Array<{
    themeKey: string;
    label: string;
    evidenceLevel: 'direct_source' | 'inferred_watch' | 'not_supported';
    sourceRefs?: string[];
    reason: string;
  }>;
  globalThemeLeadLagSignal?: {
    themeKey: string;
    themeName: string;
    foreignPeers: Array<{ symbol: string; name: string; market: 'US' | 'JP' | 'KR'; movePct3d?: number | null; movePct5d?: number | null; movePct10d?: number | null }>;
    twMappedSymbols: string[];
    foreignMovePct: number | null;
    twMovePct: number | null;
    lagSpreadPct: number | null;
    sourceRefs: string[];
    asOf: string | null;
    sourceStatus: 'measured' | 'pending_price_refresh' | 'source_unavailable';
    summary: string;
  } | null;
  globalLeadLagSummary?: string | null;
  scenarioOnlyDisplayAllowed?: boolean;
  targetStaleKind?: 'crossed_base' | 'crossed_scenario' | 'missing_target' | null;
  repricingRequiredEvidence?: string[];
  candidateReason?: string | null;
  candidateSourceType?: 'market_mover' | 'social_heat' | 'broker_leak' | 'global_lead_lag' | string | null;
  hotMoverSignal?: {
    signalType: 'limit_up' | 'near_limit_up' | 'unusual_volume' | 'momentum_3d' | 'momentum_5d' | 'momentum_10d' | string;
    changePct: number | null;
    volume: number | null;
    volumeRatio?: number | null;
    source: string;
    asOf: string | null;
    summary: string;
  } | null;
  excludedReason?: string | null;
  discoveryRunAt?: string | null;
  missedHotSymbolReason?: string | null;
  socialHitSummary?: string | null;
  hotTrackingReason?: string | null;
  modelSignal?: {
    sourceSentimentScore: number | null;
    extractionConfidence: number | null;
    summaryModel: string | null;
    boundary: 'assistive_only';
    promotionImpact: 'none';
    latestAt: string | null;
  } | null;
  modelSignalSummary?: string | null;
  mlUpsideProbability?: number | null;
  mlForecastSummary?: string | null;
  pttSignalSummary?: string | null;
  brokerSocialLeakSummary?: string | null;
  whyModelDidNotPromote?: string | null;
  valuationSanityStatus?: ValuationSanityStatus | null;
  valuationSanityReason?: string | null;
  baseTargetVerificationStatus?: 'verified' | 'research_estimate_only' | 'insufficient_verified_basis' | null;
  brokerConsensusSummary?: string | null;
  whyBaseIsFormal?: string | null;
  whyBaseIsNotFormal?: string | null;
  dedupeBucket?: string | null;
  revaluationStatus?: 'rebuilt' | 'repriced' | 'unchanged' | 'pending' | null;
  revaluationReason?: string | null;
  recommendationGateStatus?: RecommendationGateStatus | null;
  formalGateStatus?: RecommendationGateStatus | null;
  scenarioActionabilityStatus?: 'actionable_scenario' | 'wait_pullback' | 'blocked' | 'not_applicable' | null;
  targetCoverageStatus?: TargetCoverageStatus | null;
  overTargetReason?: string | null;
  staleReason?: string | null;
  archiveReason?: string | null;
  revaluationJobSummary?: RevaluationJobSummary | null;
  revaluationSlaStatus?: RevaluationSlaStatus | null;
  nextRevaluationAt?: string | null;
  missingRepricingEvidence?: string[];
  brokerEvidenceSearchStatus?: BrokerEvidenceSearchStatus | null;
  nextEvidenceSearchPlan?: string[] | null;
  scenarioPromotionStatus?: ScenarioPromotionStatus | null;
  scenarioPromotionGate?: ScenarioPromotionGate | null;
  marketValuationAdjustment?: MarketValuationAdjustment | null;
  entryActionLabel?: EntryDecisionAction | null;
  entryDecision?: EntryDecision | null;
  marketGateStatus?: MarketGateStatus | null;
  marketIndexSignal?: MarketIndexSignal | null;
  relativeStrengthSignal?: RelativeStrengthSignal | null;
  tradeDecision?: TradeDecision | null;
  whyBuyNow?: string | null;
  whyExitNow?: string | null;
  isActionableRecommendation?: boolean;
  displayBucket?: RecommendationDisplayBucket | null;
  displayTargetMode?: RecommendationDisplayTargetMode | null;
  whyNotFormal?: string | null;
  whyNoFormalRecommendation?: string | null;
  whyNotVisible?: string | null;
  revaluationPriority?: number | null;
  sourceSignalBadges?: string[];
  sourceSignalSummary?: string | null;
  socialMentionStats?: {
    sourceCount: number;
    mentions24h: number;
    kolMentions: number;
    podcastMentions: number;
    youtubeMentions: number;
    threadsMentions: number;
    instagramMentions: number;
    telegramMentions: number;
    investanchorsMentions: number;
    weakSignals: number;
    transcriptSignals: number;
    latestAt: string | null;
  } | null;
}

export interface StrategyActionView {
  id: string;
  recommendationId: string;
  entryRule: string;
  positionSizeRule: string;
  targetPrice: number | null;
  stopLoss: number | null;
  reviewHorizon: string | null;
  state: StrategyState;
}

export interface StockInsightPayload {
  symbol: string;
  name: string;
  market: 'TW' | 'US';
  price: number;
  volume: number | null;
  asOf: string;
  freshness: SignalFreshness;
  chart: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  chartSource?: 'yahoo' | 'twstock' | 'stock_signals' | 'minimal' | 'fallback' | 'missing';
  chartMissingReason?: string | null;
  indicators: {
    maShort: number | null;
    maMid: number | null;
    maLong: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
  };
  chipMetrics: Record<string, unknown>;
  strategy?: StrategyActionView;
  recommendation?: RecommendationCard;
  riskDisclosure: string;
}

export interface ThemeHeatCard {
  themeKey: string;
  themeName: string;
  windowType: 'daily' | 'three_day' | 'weekly';
  marketRegime: string | null;
  heatScore: number;
  capitalFlowSignals: Record<string, unknown>;
  relatedSymbols: string[];
  evidenceCount: number;
  asOfDate: string;
  verificationStatus: VerificationStatus;
  sourceCoverage: SourceCoverageView[];
  missingSources: string[];
  latestSourceAt: string | null;
  foreignPeerBasket?: Array<{ symbol: string; name: string; market: 'US' | 'JP' | 'KR' }>;
  leadLagSpreadPct?: number | null;
  overseasMomentumAsOf?: string | null;
}

export interface StoryEvidenceItemView {
  evidenceClass: 'official' | 'company' | 'industry' | 'public_research' | 'news' | 'social' | 'financial' | 'transcript';
  sourceName: string;
  sourceUrl: string | null;
  headline: string;
  excerpt: string | null;
  stance: 'supporting' | 'contradicting' | 'neutral';
  evidenceStrength: number;
  sourceTimestamp: string;
}

export interface ValuationCaseView {
  caseType: 'base' | 'upside' | 'invalidation';
  targetPrice: number | null;
  expectedReturnPct: number | null;
  assumptions: Record<string, unknown>;
  bridgeSummary?: string | null;
  driverLabel?: string | null;
}

export interface ResearchMemoView {
  title: string;
  slug: string;
  summary: string;
  memoMarkdown: string;
  reportKind: 'daily_radar' | 'hot_theme' | 'weekly_conviction' | 'deep_dive';
  recommendationState: RecommendationState | null;
  catalystCalendar: Array<Record<string, unknown>>;
  entryExitRules: Record<string, unknown>;
  relatedSymbols: string[];
}

export interface AgentStatusSummary {
  activeRunType: string | null;
  runCount24h: number;
  lastSuccessfulRunAt: string | null;
  startedRoles: string[];
  allowlistedProfiles: string[];
}

export interface ConnectorStatusView {
  connector: string;
  credentialStatus: string;
  lastCheckedAt: string | null;
  lastRunStatus: string;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastRecordsWritten: number;
  lastErrorSummary: string | null;
  lastAttemptAt?: string | null;
  lastTerminalStatus?: string | null;
  lastTerminalAt?: string | null;
  lastTerminalRecordsWritten?: number;
  lastSuccessfulRecordsWritten?: number;
  lastSuccessfulRecordsAt?: string | null;
  metadata?: Record<string, unknown> | null;
  lastRunMetadata?: Record<string, unknown> | null;
  recordsWritten24h?: number;
  failureReason?: string | null;
  searchedTargets?: string[];
  matchedSymbols?: string[];
  canonicalWorkerStatus?: string | null;
  latestApiAttemptStatus?: string | null;
  latestApiAttemptAt?: string | null;
  statusOwner?: 'local_worker' | 'serverless_status' | 'unknown' | string;
  ignoredServerlessSkip?: boolean;
  refreshTier?: 'hourly_social' | 'daily_kol' | 'market_data' | 'fundamentals' | 'other' | null;
  refreshCadenceHours?: number | null;
  lastTerminalRunAt?: string | null;
  recordsWrittenThisRun?: number;
  noNewDataReason?: string | null;
  lastScheduledAt?: string | null;
  workerFreshnessStatus?: 'fresh' | 'stale' | 'missing' | 'degraded' | null;
  channelBreakdown?: Array<{
    channel: string;
    searched: boolean;
    fetchedPosts: number;
    matchedSymbols: string[];
    recordsWritten: number;
    lastSuccessAt: string | null;
    failureReason: string | null;
    excludedFalsePositives?: number;
    excludedExamples?: string[];
  }>;
  kolBreakdown?: Array<{
    kol: string;
    searchedUrls: string[];
    episodesFound: number;
    youtubeEpisodes: number;
    weakSignalsWritten: number;
    transcriptsReady: number;
    failureReason: string | null;
  }>;
  episodesFound?: number;
  transcriptsReady?: number;
  weakSignalsWritten?: number;
  failureReasonByKol?: Record<string, string>;
  workerScriptVersion?: string | null;
  sourceSurfaces24h?: string[];
  falsePositiveExcluded24h?: number;
  accountFeedStatus?: 'attempted' | 'not_attempted' | 'auth_degraded' | 'not_applicable' | null;
  fallbackCookieSource?: string | null;
  fallbackCookieNames?: string[];
  missingRecommendedCookieNames?: string[];
  envLastModifiedAt?: string | null;
}

export interface SourceConnectorRunView {
  id: string;
  connector: string;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  recordsWritten: number;
  errorSummary: string | null;
}

export interface SourceAuditView {
  id: string;
  connectorRunId: string | null;
  platform: string;
  targetUrl: string | null;
  status: string;
  notes: string | null;
  createdAt: string;
  snapshotPath: string | null;
  screenshotPath: string | null;
}

export interface PodcastMentionView {
  podcastName: string;
  episodeTitle: string;
  platform: 'youtube' | 'spotify' | 'apple_podcast' | 'rss' | 'other';
  episodeUrl: string;
  publishedAt: string | null;
  transcriptStatus: 'pending' | 'ready' | 'transcript_unavailable' | 'failed';
  excerpt: string;
  thesisHighlights: string[];
  riskHighlights: string[];
}

export interface DiscoveredStockSource {
  sourceType: string;
  sourceName: string;
  summary: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
}

export interface DiscoveredStockCard {
  symbol: string;
  name: string | null;
  chineseName: string | null;
  price: number | null;
  changePct: number | null;
  currentPrice: number | null;
  priceAsOf?: string | null;
  targetPrice: number | null;
  expectedUpsidePct: number | null;
  valuationSource: ValuationSource;
  thesisTitle: string | null;
  storySummary: string | null;
  verificationStatus: VerificationStatus;
  recommendationState: RecommendationState;
  whyNotRecommended: string | null;
  mentionCount: number;
  sources: DiscoveredStockSource[];
  sourceCoverage: Array<{ label: string; count: number }>;
  latestMentionAt: string;
  storyStrength?: number | null;
  financialInflection?: number | null;
  valuationGap?: number | null;
  chipTiming?: number | null;
  hybridScore?: number | null;
}

export interface SourceSignalCard {
  symbol: string;
  chineseName: string | null;
  researchMaturity: 'source_signal';
  newPositionAction: 'valuation_review';
  discoveredAt: string;
  sourceClass: string;
  sourceSummary: string;
  evidenceRefs: string[];
  valuationStatus: 'pending';
  technicalState: string;
  changedBecause: string;
  underreactionScore?: number;
  scoreCoverage?: number;
  scoreConfidence?: number;
  researchDisposition?: 'research_now' | 'watch_reclaim' | 'watch_evidence' | 'avoid';
  positiveReasons?: string[];
  riskReasons?: string[];
  missingAxes?: string[];
  currentPrice?: number | null;
  drawdown60Pct?: number | null;
  drawdown120Pct?: number | null;
  bias20Pct?: number | null;
  bias60Pct?: number | null;
  bias120Pct?: number | null;
  rsi14?: number | null;
  volumeRatio20?: number | null;
  relativeStrength20Pct?: number | null;
  revenueYoy?: number | null;
  currentPe?: number | null;
  sectorPe?: number | null;
  historyPeMedian?: number | null;
  historyPeMin?: number | null;
  historyPeMax?: number | null;
  historyPeSampleCount?: number;
  valuationAsOf?: string | null;
  valuationAuthority?: 'exchange_reported' | null;
  valuationExchange?: 'TWSE' | 'TPEx' | null;
  historyPeSessions?: string[];
  researchDecision?: RecommendationCard['researchDecision'];
}

export interface DiscoveryDeltaV311 {
  added: string[];
  exited: string[];
  continued: string[];
  unchangedReasons: Array<{ symbol: string; reason: string }>;
}

export interface RadarDailyPayload {
  asOf: string;
  loadStatus?: 'ok' | 'degraded' | 'unavailable';
  loadWarnings?: string[];
  degradedSources?: string[];
  lastUpdatedAt?: string | null;
  evidenceAgeHours?: number | null;
  marketRegime: string;
  underreactionMarket?: {
    asOf: string;
    status: 'data_incomplete' | 'risk_on' | 'selective_or_defensive';
    completeness: number;
    riskBudget: string | null;
    summary: string;
    components: Record<string, unknown>;
    missingComponents: string[];
  } | null;
  marketRegimeUpdatedAt?: string | null;
  themeHeatUpdatedAt?: string | null;
  marketFreshnessStatus?: 'fresh' | 'stale' | 'missing';
  marketFreshnessReason?: string | null;
  focusSummary: string;
  marketHighlightSummary?: {
    headline: string;
    regimeLabel: string;
    regimeExplanation: string;
    capitalFlow: string;
    topThemes: string[];
    riskNote: string;
    nextRefreshHint: string;
  };
  marketIndexSignal?: MarketIndexSignal;
  marketBreadthSummary?: string | null;
  pluginSourceCoverageSummary?: {
    financialData: {
      status: 'available' | 'partial' | 'missing';
      summary: string;
      sources: string[];
    };
    socialDiscovery: {
      status: 'available' | 'partial' | 'missing';
      summary: string;
      sources: string[];
    };
    modelAssist: {
      status: 'available' | 'partial' | 'missing';
      summary: string;
      sources: string[];
    };
    deploymentQa: {
      status: 'available' | 'partial' | 'missing';
      summary: string;
      sources: string[];
    };
  };
  sourceHealthSummary?: {
    successfulSources: number;
    degradedSources: number;
    recordsWritten24h: number;
    lastSuccessfulRunAt: string | null;
    connectorDetails: Array<{
      connector: string;
      label: string;
      status: string;
      recordsWritten: number;
      recordsWritten24h?: number;
      lastSuccessAt: string | null;
      lastAttemptAt?: string | null;
      lastTerminalStatus?: string | null;
      lastAttemptStatus?: string | null;
      lastSuccessfulRecordsWritten?: number;
      lastSuccessfulRecordsAt?: string | null;
      normalizedFailureCode?: string | null;
      displayFailureReason?: string | null;
      canonicalWorkerStatus?: string | null;
      workerFreshnessStatus?: 'fresh' | 'stale' | 'missing' | 'degraded' | null;
      workerSlaStatus?: 'fresh' | 'stale' | 'missing' | 'degraded' | null;
      latestApiAttemptStatus?: string | null;
      statusOwner?: string | null;
      ignoredServerlessSkip?: boolean;
      refreshTier?: 'hourly_social' | 'daily_kol' | 'market_data' | 'fundamentals' | 'other' | null;
      refreshCadenceHours?: number | null;
      lastTerminalRunAt?: string | null;
      recordsWrittenThisRun?: number;
      noNewDataReason?: string | null;
      statusExplanation?: string | null;
      articlesFetched?: number;
      pushCommentsParsed?: number;
      lastScheduledAt?: string | null;
      channelBreakdown?: Array<{
        channel: string;
        searched: boolean;
        fetchedPosts: number;
        matchedSymbols: string[];
        recordsWritten: number;
        lastSuccessAt: string | null;
        failureReason: string | null;
        excludedFalsePositives?: number;
        excludedExamples?: string[];
      }>;
      kolBreakdown?: Array<{
        kol: string;
        searchedUrls: string[];
        episodesFound: number;
        youtubeEpisodes: number;
        weakSignalsWritten: number;
        transcriptsReady: number;
        failureReason: string | null;
      }>;
      episodesFound?: number;
      transcriptsReady?: number;
      weakSignalsWritten?: number;
	      failureReasonByKol?: Record<string, string>;
	      workerScriptVersion?: string | null;
	      fallbackCookieSource?: string | null;
	      fallbackCookieNames?: string[];
	      missingRecommendedCookieNames?: string[];
	      envLastModifiedAt?: string | null;
	      sourceSurfaces24h?: string[];
	      falsePositiveExcluded24h?: number;
	      accountFeedStatus?: 'attempted' | 'not_attempted' | 'auth_degraded' | 'not_applicable' | null;
	      degradedReason: string | null;
      failureReason?: string | null;
      searched: boolean;
      matched: boolean;
      searchedTargets?: string[];
      matchedSymbols?: string[];
      metadata?: Record<string, unknown> | null;
      lastRunMetadata?: Record<string, unknown> | null;
    }>;
  };
  dataHealth?: {
    priceRefreshLastSuccessAt: string | null;
    priceRefreshScheduledAt: string | null;
    priceRefreshStatus: 'fresh' | 'stale' | 'missing' | 'pending';
    priceRefreshRecordsWritten: number;
    priceRefreshFailureReason: string | null;
  };
  discoveryFreshnessSummary?: {
    lastCheckedAt: string | null;
    sourceRuns24h: number;
    recordsWritten24h: number;
    newCandidates24h: number;
    promoted24h: number;
    downgraded24h: number;
    archived24h: number;
    blockedCandidates?: number;
    reflectedCandidates?: number;
    topDiscoverySource?: string | null;
    unchangedReason: string;
    sourceSummary: string;
    candidateSummary: string;
  };
  globalLeadLagSummary?: {
    activeThemes: number;
    pendingPriceRefresh: number;
    measuredThemes: number;
    sourceUnavailable: number;
    summary: string;
  };
  historicalObservationSummary?: {
    total: number;
    revaluationQueue: number;
    scenarioOnlyNeedsRevaluation: number;
    valuationReflectedArchive: number;
    missingNewEvidence: number;
    repricedButNotFormal: number;
    examples: Array<{
      symbol: string;
      name: string;
      disposition:
        | 'revaluation_queue'
        | 'scenario_only_needs_revaluation'
        | 'valuation_reflected_archive'
        | 'missing_new_evidence'
        | 'repriced_but_not_formal';
      reason: string;
    }>;
  };
  themeHypotheses?: Array<{
    themeKey: string;
    title: string;
    summary: string;
    assumptions: string[];
    evidenceLevel: '傳言層' | '佐證層' | '估值層';
    symbols: string[];
    sourceUrls: string[];
    updatedAt: string | null;
  }>;
  hotThemes: ThemeHeatCard[];
  opportunities: RecommendationCard[];
  scenarioUpsideCandidates?: RecommendationCard[];
  hotTracking?: RecommendationCard[];
  recentFormal7d?: RecommendationCard[];
  fallbackOpportunities90d?: RecommendationCard[];
  earlyWatchlist: RecommendationCard[];
  earlySignals?: RecommendationCard[];
  partiallyVerified?: RecommendationCard[];
  validatedIdeas?: RecommendationCard[];
  discoveredStocks: DiscoveredStockCard[];
  sourceSignals?: SourceSignalCard[];
  discoveryDelta?: DiscoveryDeltaV311;
  reports: ResearchMemoView[];
  agentStatus: AgentStatusSummary;
  connectorStatus: ConnectorStatusView[];
  riskDisclosure: string;
}

export interface ThemeDetailPayload {
  theme: ThemeHeatCard;
  opportunities: RecommendationCard[];
  supportingStories: Array<{
    symbol: string;
    title: string;
    storyType: StoryType;
    thesisState: RecommendationState;
    catalystSummary: string | null;
  }>;
  reports: ResearchMemoView[];
  sourceCoverage: SourceCoverageView[];
  missingSources: string[];
  contentStatus?: 'complete' | 'derived_from_registry' | 'partial_live' | 'missing_live_sources';
  themeBrief?: {
    thesis: string;
    whyNow: string;
    trackingFocus: string;
    validationRules: string[];
    overseasLeadLagSummary?: string | null;
  };
  trackedSymbols?: Array<{
    symbol: string;
    name: string | null;
    roleInTheme: string;
    displayBucket?: RecommendationDisplayBucket | string | null;
    targetCoverageStatus?: TargetCoverageStatus | null;
    entryActionLabel?: EntryDecisionAction | string | null;
    whyNotFormal?: string | null;
    sourceRefs: string[];
    latestEvidence?: string | null;
  }>;
  evidenceMatrix?: Array<{
    sourceGroup: string;
    sourceType: SourceCoverageView['sourceType'];
    status: 'hit' | 'missing' | 'pending';
    summary: string;
    symbols: string[];
    sourceUrl: string | null;
    latestAt: string | null;
  }>;
  nextRefreshPlan?: Array<{
    sourceGroup: string;
    action: string;
    reason: string;
    status: 'scheduled' | 'waiting_source' | 'blocked' | 'complete';
  }>;
}

export interface StockDeepDivePayload extends StockInsightPayload {
  targetSnapshot?: DeepDiveTargetSnapshot;
  reportSnapshot?: DeepDiveReportSnapshot | null;
  valuationPanel?: DeepDiveValuationPanel | null;
  chipSnapshot?: DeepDiveChipSnapshot | null;
  dataHealth?: DeepDiveDataHealth | null;
  recommendationStance?: DeepDiveRecommendationStance | null;
  marketIndexSignal?: MarketIndexSignal | null;
  relativeStrengthSignal?: RelativeStrengthSignal | null;
  tradeDecision?: TradeDecision | null;
  marketRotationSnapshot?: {
    marketRotation: string | null;
    sectorFlow: string | null;
    sectorFlowScore: number | null;
  } | null;
  sourceFreshness?: DeepDiveSourceFreshness | null;
  summaryCard?: DeepDiveSummaryCard;
  chaseAssessment?: DeepDiveChaseAssessment | null;
  latestFacts?: DeepDiveLatestFact[];
  latestEvidence?: DeepDiveLatestFact[];
  thesisSnapshot?: DeepDiveThesisSnapshot | null;
  freshSourceHighlights?: SourceCoverageView[];
  appendix?: DeepDiveAppendix;
  autoRefreshTriggered?: boolean;
  investmentConclusion?: string | null;
  keyAssumptions?: string[];
  verificationSummary?: string | null;
  valuationSummary?: string | null;
  storyNarrative?: string | null;
  articleSections?: DeepDiveArticleSection[];
  numberTrail?: DeepDiveNumberTrailItem[];
  scenarioNarratives?: DeepDiveScenarioNarrative[];
  marketHypothesis?: string[];
  validationChecks?: Array<{
    label: string;
    status: 'completed' | 'pending' | 'at_risk';
    summary: string;
  }>;
  entryExitPlan?: {
    entry: string;
    addOn: string;
    stopLoss: string;
    exit: string;
  } | null;
  technicalSummary?: string | null;
  technicalEntrySignal?: {
    verdict: '適合分批' | '等回測' | '過熱不追' | '趨勢轉弱';
    summary: string;
    reasons: string[];
    supportLevel: number | null;
    resistanceLevel: number | null;
    pricePositionState?:
      | 'below_support'
      | 'below_ma'
      | 'range'
      | 'near_resistance'
      | 'breakout_watch'
      | 'breakout_confirmed'
      | 'breakout_retest'
      | 'overextended';
    activeSupport?: number | null;
    nextResistance?: number | null;
    breakoutAchieved?: boolean;
    breakoutRetestLevel?: number | null;
    volumeRatio20d?: number | null;
    actionabilityScore?: number | null;
    buyNowAllowed?: boolean;
    entryStyle?: EntryStyle;
    indicatorStack?: EntryIndicatorStack | null;
    staleTechnicalReason?: string | null;
    entryPlan?: {
      strategy: string;
      entryZone: string;
      breakoutTrigger: string;
      pullbackSupport: string;
      avoidZone: string;
      invalidationLevel: string;
      volumeSignal: string;
    };
    entryDecision?: EntryDecision | null;
  } | null;
  chipEntryAssessment?: DeepDiveChipEntryAssessment | null;
  sourceAppendix?: Array<{
    label: string;
    items: SourceCoverageView[];
  }>;
  technicalSnapshot?: {
    ma5: number | null;
    ma10: number | null;
    ma20: number | null;
    ma60: number | null;
    ma120: number | null;
    ma240: number | null;
    rsi: number | null;
    macd: number | null;
    macdSignal: number | null;
    fibonacci?: {
      swingHigh: number | null;
      swingLow: number | null;
      retracement236: number | null;
      retracement382: number | null;
      retracement5: number | null;
      retracement618: number | null;
      retracement786: number | null;
      bias: 'support' | 'resistance' | 'range' | null;
    } | null;
    dataSource?: 'yahoo' | 'twstock' | 'stock_signals' | 'minimal' | 'fallback' | 'missing';
    missingReason?: string | null;
  };
  thesisState: RecommendationState;
  verificationStatus: VerificationStatus;
  storyType: StoryType | null;
  thesisTitle: string | null;
  thesisSummary: string | null;
  catalystSummary: string | null;
  expectedUpsidePct: number | null;
  evidenceScore: number | null;
  timingScore: number | null;
  evidenceItems: StoryEvidenceItemView[];
  valuationCases: ValuationCaseView[];
  companyEvents: Array<{
    eventType: string;
    headline: string;
    summary: string;
    sourceUrl: string | null;
    eventTimestamp: string;
  }>;
  revenueSignal: {
    asOfDate: string;
    monthlyRevenue: number | null;
    yoyGrowth: number | null;
    momGrowth: number | null;
  } | null;
  fundamentalSnapshot: {
    asOfDate: string;
    epsTtm: number | null;
    grossMargin: number | null;
    operatingMargin: number | null;
    peRatio: number | null;
    pbRatio: number | null;
    dataQuality?: 'ok' | 'missing' | 'fallback';
    missingReason?: string | null;
  } | null;
  memo: ResearchMemoView | null;
  agentStatus: AgentStatusSummary;
  communitySignals: SourceCoverageView[];
  verificationTimeline: Array<{
    stage: VerificationStatus;
    summary: string;
    completed: boolean;
  }>;
  conditionalRecommendationNote: string;
  themeHypothesis?: {
    title: string;
    summary: string;
    assumptions: string[];
    evidenceLevel: '傳言層' | '佐證層' | '估值層';
    updatedAt: string | null;
  } | null;
  calculationTable?: Array<{
    label: string;
    value: string;
    source: string;
  }>;
  counterEvidence?: Array<{
    label: string;
    summary: string;
    sourceUrl: string | null;
  }>;
  brokerViews: BrokerView[];
  sourceCoverage: SourceCoverageView[];
  missingCoverage: string[];
  kolCoverage: SourceCoverageView[];
  podcastMentions: PodcastMentionView[];
  sourceDiscoveryStatus: {
    approvedCount: number;
    pendingCount: number;
    monitorOnlyCount: number;
  };
  connectorStatus: ConnectorStatusView[];
  timeframeCharts?: {
    daily: Array<{ time: string; open: number; high: number; low: number; close: number }>;
    weekly: Array<{ time: string; open: number; high: number; low: number; close: number }>;
    monthly: Array<{ time: string; open: number; high: number; low: number; close: number }>;
    quarterly: Array<{ time: string; open: number; high: number; low: number; close: number }>;
    halfYear: Array<{ time: string; open: number; high: number; low: number; close: number }>;
    yearly: Array<{ time: string; open: number; high: number; low: number; close: number }>;
  };
  sourceGroups?: {
    investanchors: SourceCoverageView[];
    officialAndFinancial: SourceCoverageView[];
    brokerAndResearch: SourceCoverageView[];
    socialAndCommunity: SourceCoverageView[];
  };
  thesisModel: ThesisModelView | null;
  riskCounterpoints: RiskCounterpointView[];
  evidenceMatrix: EvidenceMatrixView[];
  valuationCompleteness?: {
    requiredCases: Array<'base' | 'upside' | 'invalidation'>;
    availableCases: string[];
    isComplete: boolean;
  };
  valuationBridge?: DeepDiveValuationBridge | null;
  scenarioBridges?: DeepDiveScenarioNarrative[];
  priceTargetRationale?: string | null;
  missingFields?: string[];
  financialProjectionMetrics?: {
    baseRevenueAnnual: number | null;
    baseEps: number | null;
    basePe: number | null;
    upsideRevenueAnnual: number | null;
    upsideEps: number | null;
    upsidePe: number | null;
    bearRevenueAnnual: number | null;
    bearEps: number | null;
    bearPe: number | null;
  } | null;
}

export interface StockDeepDivePendingPayload {
  status: 'pending';
  symbol: string;
  reason: string;
  triggeredJobs: string[];
  retryAfterSec: number;
  chipEntryAssessment?: DeepDiveChipEntryAssessment | null;
  dataHealth?: DeepDiveDataHealth | null;
  recommendationStance?: DeepDiveRecommendationStance | null;
}

export interface SourceSearchResultItem {
  id: string;
  platform: string;
  title: string;
  summary: string | null;
  documentUrl: string;
  publishedAt: string | null;
  collectedAt: string;
  symbols: string[];
  directHit: boolean;
  crawlMode?: 'symbol_scoped' | 'market_scan' | 'account_feed' | 'public_search' | 'author_watch' | 'channel_scan' | null;
  matchType?: 'direct_symbol' | 'alias' | 'indirect' | 'none' | null;
  confidence: number | null;
  verificationStatus: VerificationStatus;
  sourceEntityName: string | null;
  sourceEntityType: string | null;
}

export interface SourceSearchPayload {
  page: number;
  pageSize: number;
  total: number;
  query: {
    q: string | null;
    symbol: string | null;
    platform: string | null;
    verificationStatus: VerificationStatus | null;
    themeKey?: string | null;
    runId?: string | null;
    evidenceLevel?: '傳言層' | '佐證層' | '估值層' | null;
    from: string | null;
    to: string | null;
  };
  latestSourceAt: string | null;
  coverage: Array<{ platform: string; count: number }>;
  items: SourceSearchResultItem[];
  connectorStatus: ConnectorStatusView[];
  recentRuns: SourceConnectorRunView[];
  recentAudits: SourceAuditView[];
}

export interface LinePreference {
  lineUserId: string;
  watchlist: string[];
  eventPreferences: {
    hit_target?: boolean;
    hit_stop_loss?: boolean;
    state_changed?: boolean;
    daily_digest?: boolean;
  };
  digestEnabled: boolean;
  throttleMinutes: number;
}

export interface SourceSyncResult {
  runId: string;
  dryRun: boolean;
  connector: string;
  recordsWritten: number;
  fetchedPosts?: number;
  entityId: string | null;
  watermarkBefore: string | null;
  watermarkAfter: string | null;
  duplicatesSkipped: number;
  sessionRefreshed: boolean;
  errorCode?: string | null;
  matchedDirectHits?: number;
  matchedIndustryHits?: number;
  timedOut?: boolean;
  degradedReason?: string | null;
  sessionMode?: 'persisted_session' | 'fresh_login' | 'cookie_fallback' | 'missing' | 'not_applicable';
}
