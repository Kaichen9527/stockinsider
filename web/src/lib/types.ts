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

export interface SourceCoverageView {
  sourceName: string;
  sourceType:
    | 'official'
    | 'financial'
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
    | 'youtube';
  summary: string;
  sourceUrl: string | null;
  sourceTimestamp: string | null;
  symbols: string[];
  verificationStatus: VerificationStatus;
  confidence: number;
  weight: number;
}

export interface BrokerView {
  brokerName: string;
  reportDate: string | null;
  rating: string | null;
  targetPrice: number | null;
  thesisTitle: string | null;
  summary: string;
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

export interface RecommendationCard {
  recommendationId: string;
  symbol: string;
  name: string;
  market: 'TW' | 'US';
  score: number;
  confidence: number;
  action: 'buy' | 'watch' | 'reduce';
  rationale: string;
  targetPrice?: number | null;
  stopLoss?: number | null;
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
  connector: 'investanchors' | 'threads' | 'instagram' | 'telegram';
  credentialStatus: string;
  lastCheckedAt: string | null;
  lastRunStatus: string;
  lastSuccessAt: string | null;
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
  price: number | null;
  changePct: number | null;
  currentPrice: number | null;
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
}

export interface RadarDailyPayload {
  asOf: string;
  marketRegime: string;
  focusSummary: string;
  hotThemes: ThemeHeatCard[];
  opportunities: RecommendationCard[];
  earlyWatchlist: RecommendationCard[];
  earlySignals?: RecommendationCard[];
  partiallyVerified?: RecommendationCard[];
  validatedIdeas?: RecommendationCard[];
  discoveredStocks: DiscoveredStockCard[];
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
}

export interface StockDeepDivePayload extends StockInsightPayload {
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
    monthlyRevenue: number;
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
  thesisModel: ThesisModelView | null;
  riskCounterpoints: RiskCounterpointView[];
  evidenceMatrix: EvidenceMatrixView[];
  valuationCompleteness?: {
    requiredCases: Array<'base' | 'upside' | 'invalidation'>;
    availableCases: string[];
    isComplete: boolean;
  };
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
