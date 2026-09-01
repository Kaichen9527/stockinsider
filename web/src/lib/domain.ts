Y��x-���jם��i��+��j[h��ܢ��߽{��7�4o+^����םimport { randomUUID } from 'crypto';
import { normalizeRelatedStockSymbols, normalizeSourceDocumentSymbols } from './stock-symbol';
import { loadActiveCandidateSourceErrors, loadCandidateShadowProgress, loadCandidateStageCards, recordCandidateShadowObservation, runCandidateResearchCycle } from './candidate-research';
import { markRadarPublicSnapshotsFailed, publishRadarPublicSnapshots } from './radar-public-snapshot';
import { calculateTechnicalFeatures, normalizeInstitutionalFlows, type InstitutionalFlowDay } from './technical-features-v2';
import { advanceActionableCloseStreak, classifyCandidateStage, sourceSignalLifecycleStage, STAGE_RULESET_VERSION, type MarketRiskRegime } from './stage-classifier';
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { Client as LineClient } from '@line/bot-sdk';
import { getSupabaseServerClient } from './supabase-server';
import { loadLatestSourceRunLedger, type SourceRunLedgerView } from './source-run-ledger';
import { scheduledSourceConnectorKeys, sourceExecutionPolicy } from './source-policy';
import { isDemoMode } from './data-mode';
import { mergeAuthoritativeDeepDiveLeaves } from './deep-dive-merge';
import type {
  AgentStatusSummary,
  BrokerView,
  ConnectorStatusView,
  DailyMarketFocus,
  DeepDiveArticleSection,
  DeepDiveChipEntryVerdict,
  DeepDiveChipSnapshot,
  DeepDiveChaseAssessment,
  DeepDiveLatestFact,
  DeepDiveMlForecastBand,
  DeepDiveNumberTrailItem,
  DeepDiveSourceCitationRef,
  DeepDiveSummaryCard,
  DeepDiveTargetSnapshot,
  DeepDiveBrokerConsensus,
  DeepDiveForwardPeBridge,
  DeepDivePeerValuationRange,
  DeepDiveValuationAssumptionLedgerItem,
  DeepDiveValuationBridge,
  DeepDiveValuationCaseDetail,
  DeepDiveValuationConfidenceGate,
  DeepDiveValuationModelDivergence,
  DeepDiveValuationReviewFlag,
  DeepDiveScenarioNarrative,
  DeepDiveSharedVerifiedBasis,
  DeepDiveThesisSnapshot,
  DiscoveredStockCard,
  DiscoveredStockSource,
  EvidenceMatrixView,
  EntryDecision,
  LinePreference,
  MarketIndexSignal,
  MarketValuationAdjustment,
  RadarDailyPayload,
  RecommendationCard,
  RecommendationBucket,
  RecommendationGateStatus,
  RevaluationJobSummary,
  RevaluationJobState,
  RecommendationState,
  RiskCounterpointView,
  ResearchMemoView,
  ScenarioDriverType,
  SignalFreshness,
  SourceCoverageView,
  SourceSearchPayload,
  SourceSearchResultItem,
  SourceSignalCard,
  StockDeepDivePayload,
  StockDeepDivePendingPayload,
  StockInsightPayload,
  TargetCoverageStatus,
  StoryEvidenceItemView,
  StoryType,
  StrategyActionView,
  ThemeDetailPayload,
  ThemeHeatCard,
  ThesisModelView,
  TradeDecision,
  ValuationCaseView,
  ValuationQuality,
  ValuationSanityStatus,
  ValuationSource,
  VerificationStatus,
} from './types';
import {
  fetchTwStockDailyBars,
  fetchTwStockEpsTtm,
  fetchTwStockInstitutional,
  fetchTwMarketTradingSessions,
  fetchTwStockMarginTrades,
  fetchTwStockQuote,
  fetchTwStockRevenue,
  fetchTwStockShortSales,
  fetchTwStockValues,
  fetchTwseOfficialSblShortSales,
} from './tw-market';

const RISK_DISCLOSURE = '本服務僅提供研究資訊，非投資建議，投資決策與風險由使用者自行承擔。';
const AUTHORIZED_BROKER_SOURCE_MODES = ['manual_pdf', 'manual_csv', 'imported_pdf'] as const;

type Row = Record<string, unknown>;

type PipelineResult = {
  runId: string;
  dryRun: boolean;
};

type IngestionResult = PipelineResult & {
  asOf: string;
  snapshots: number;
  stockSignals: number;
  institutionalSignals: number;
  socialSignals: number;
};

type AgentWorkflowResult = PipelineResult & {
  startedRoles: string[];
  recordsWritten: number;
  meta?: Record<string, unknown>;
};

type AgencyAgentProfile = {
  profileKey: string;
  sourceLibrary: string;
  mappedRole: string;
  sourceUrl: string;
};

type AgencyAgentPolicy = {
  mode: string;
  publishRecommendationsDirectly: boolean;
  requiresHybridJudge: boolean;
  requiresAgentFindingsLog: boolean;
};

type AgentReviewRequest = {
  reason: string;
  evidence?: Record<string, unknown>;
};

type AgentTaskWorkOutput<T> = {
  outputSummary: string;
  findings?: Array<{
    stockId?: string | null;
    themeKey?: string | null;
    findingType: string;
    summary: string;
    confidence?: number;
    evidence?: unknown[];
    sourceRefs?: unknown[];
  }>;
  reviewQueueItems?: AgentReviewRequest[];
  result: T;
};

type StoryThesisState = RecommendationState | 'review' | 'rejected';

type StoryVerificationOutcome = {
  nextState: StoryThesisState;
  evidenceScore: number;
  verificationStatus: VerificationStatus;
  reviewQueueItems: AgentReviewRequest[];
  note: string;
  governance: {
    supportiveCount: number;
    contradictingCount: number;
    hasOfficialCompanyEvidence: boolean;
    hasPublicCorroboration: boolean;
    socialOnly: boolean;
    strongestContradiction: number;
  };
};

type ResearchMemoCandidate = {
  row: Record<string, unknown>;
  slug: string;
  reportKind: string;
  title: string;
  recommendationState: RecommendationState | null;
  evidenceScore: number | null;
  sourceUpdatedAt: string | null;
  index: number;
};

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}

function nowIso() {
  return new Date().toISOString();
}

function asIsoDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso.slice(0, 10);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function taipeiScheduledIso(hour: number, minute: number, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${lookup.year}-${lookup.month}-${lookup.day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00+08:00`;
}

function priceRefreshStatusFromAsOf(asOf: string | null | undefined): 'fresh' | 'stale' | 'missing' | 'pending' {
  if (!asOf) return 'missing';
  const ms = new Date(asOf).getTime();
  if (!Number.isFinite(ms)) return 'missing';
  const ageHours = (Date.now() - ms) / (1000 * 60 * 60);
  if (ageHours <= 20) return 'fresh';
  if (ageHours <= 96) return 'pending';
  return 'stale';
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const parsed = toNumber(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEEP_DIVE_DAILY_BAR_TARGET = 504;
const DEEP_DIVE_DAILY_BAR_BUFFER = 520;

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

async function withFallbackTimeout<T>(work: PromiseLike<T>, fallback: T, timeoutMs = 4000): Promise<T> {
  return await Promise.race([
    work,
    new Promise<T>((resolve) => {
      setTimeout(() => resolve(fallback), timeoutMs);
    }),
  ]);
}

async function withQueryTimeout<T>(
  work: PromiseLike<{ data: T; error: { message?: string } | null }>,
  fallbackData: T,
  timeoutMs = 4000,
): Promise<{ data: T; error: { message?: string } | null }> {
  return await withFallbackTimeout(work, { data: fallbackData, error: null }, timeoutMs);
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function safeErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || 'unknown_error');
  return compactText(raw)
    .replace(/(Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/(key=)[^&\s]+/gi, '$1[redacted]')
    .slice(0, 220);
}

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function stripHtmlTags(value: string) {
  return value.replace(/<[^>]+>/g, ' ');
}

function stripUrls(value: string) {
  return value.replace(/https?:\/\/\S+/gi, ' ');
}

function sanitizeNarrativeText(value: unknown) {
  return compactText(stripUrls(stripHtmlTags(decodeHtmlEntities(String(value || '')))))
    .replace(/\bvaluation_cases\b/gi, '估值情境')
    .replace(/\bfundamental_snapshots\b/gi, '基本面資料')
    .replace(/\brevenue_signals\b/gi, '營收資料')
    .replace(/\bpublic-research-digest\b/gi, '公開研究摘要')
    .replace(/\bnull\b/gi, '')
    .replace(/[；;]\s*(?:0(?:\.\d+)?|null|-)\b/gi, '')
    .replace(/\s+[|/]\s+/g, ' / ')
    .replace(/\s*·\s*/g, ' · ')
    .replace(/\b(EPS|GM)\s*0(?:\.0+)?[,，]?\s*/gi, '')
    .replace(/\bYoY\s*[-+]?\d+(?:\.\d+)?%\s*[,，]?\s*MoM\s*[-+]?\d+(?:\.\d+)?%/gi, '')
    .replace(/\b(?:Yahoo股市|聯合新聞網|Vocus|方格子|鉅亨網|CMoney|工商時報|經濟日報|MoneyDJ|Google News)\s*$/gi, '')
    .replace(/\bNew thread Search Activity Profile Insights Saved More Thread\b/gi, '')
    .replace(/約\s*約/g, '約 ')
    .replace(/\b\d+\s+views?\b/gi, '')
    .replace(/\b\d+\s+(?:likes?|reposts?|replies?|followers?)\b/gi, '')
    .replace(/\b[a-z0-9_.-]+\s+\d+[mhds]\b/gi, '')
    .replace(/\b(?:Search|Activity|Profile|Insights|Saved|Thread|More|Follow|Following|Like|Reply|Repost)\b/gi, '')
    .replace(/週[一二三四五六日天][^。！？]{0,20}(?:豆漿|早晨|餐桌)[^。！？]*/g, '')
    .replace(/([。！？]){2,}/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function isNumericOnlyFragment(value: string) {
  const compact = value.replace(/[，,\s。％%元億萬+:-]/g, '');
  return compact.length > 0 && /^\d+(?:\.\d+)?$/.test(compact);
}

function looksLikeNarrativeNoise(value: string) {
  const clean = sanitizeNarrativeText(value);
  if (!clean) return true;
  if (/^(?:null|undefined|n\/a|na|-|待補)$/i.test(clean)) return true;
  if (isNumericOnlyFragment(clean)) return true;
  if (/^(?:valuation_cases|risk_control|financial_proxy|story_modeled|eps_pe_[a-z_]+)$/i.test(clean)) return true;
  if (/^\d{9,}$/.test(clean)) return true;
  return false;
}

function looksLikeHeadlineDump(value: string) {
  const clean = sanitizeNarrativeText(value);
  if (!clean) return true;
  if (clean.includes('；') && clean.split('；').length >= 3) return true;
  if (/(Yahoo股市|聯合新聞網|工商時報|經濟日報|鉅亨網|Vocus|方格子|MoneyDJ|Google News|中央社|三立|東森|今周刊)/.test(clean) && !/[。！？]/.test(clean)) return true;
  if (/(Search|Activity|Profile|Insights|views|Saved)/i.test(clean)) return true;
  if (/[:：｜|]/.test(clean) && !/[。！？]/.test(clean)) return true;
  return false;
}

function normalizeNarrativeSentence(value: unknown) {
  const clean = sanitizeNarrativeText(value);
  if (!clean || looksLikeNarrativeNoise(clean) || looksLikeHeadlineDump(clean)) return null;
  const normalized = clean
    .replace(/\s*；\s*/g, '，')
    .split(/(?<=[。！？])/)
    .slice(0, 2)
    .join('')
    .replace(/\s{2,}/g, ' ')
    .trim();
  return normalized ? (/[。！？]$/.test(normalized) ? normalized : `${normalized}。`) : null;
}

function narrativeCandidates(items: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const normalized = normalizeNarrativeSentence(item);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    lines.push(normalized);
    if (lines.length >= limit) break;
  }
  return lines;
}

function tokenizeNarrativeKeywords(value: string | null | undefined) {
  const clean = sanitizeNarrativeText(value);
  if (!clean) return [];
  return Array.from(
    new Set(
      clean
        .split(/[^A-Za-z0-9\u4e00-\u9fff]+/g)
        .map((token) => token.trim())
        .filter((token) => token.length >= 2 && !/^\d+$/.test(token)),
    ),
  );
}

function formatNarrativeMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  const abs = Math.abs(value);
  if (abs >= 100000000) return `${formatNumberLocal(value / 100000000)} 億`;
  if (abs >= 10000) return `${formatNumberLocal(value / 10000)} 萬`;
  return `${round(toFiniteNumber(value), 0).toLocaleString('zh-TW')} 元`;
}

function isRelevantRiskNarrative(value: string | null | undefined, keywords: string[]) {
  const clean = sanitizeNarrativeText(value);
  if (!clean || looksLikeNarrativeNoise(clean)) return false;
  if (keywords.some((keyword) => clean.includes(keyword))) return true;
  return /(營收|毛利|獲利|訂單|需求|出貨|法說|庫存|估值|股價|均線|供應鏈|價格|客戶|產品|AI|server|手機|記憶體|NAND|eMMC|SoC|CSP)/i.test(clean);
}

function summarizeRevenueNarrative(monthlyRevenue: number | null | undefined, yoyGrowth: number | null | undefined, momGrowth: number | null | undefined) {
  if (monthlyRevenue == null || !Number.isFinite(monthlyRevenue) || monthlyRevenue <= 0) return null;
  const revenueText = formatNarrativeMoney(monthlyRevenue) || `${round(toFiniteNumber(monthlyRevenue), 0).toLocaleString('zh-TW')} 元`;
  const yoyText = yoyGrowth == null ? 'YoY 尚待更新' : `YoY ${toFiniteNumber(yoyGrowth) > 0 ? '+' : ''}${formatNumberLocal(toFiniteNumber(yoyGrowth))}%`;
  const momText = momGrowth == null ? 'MoM 尚待更新' : `MoM ${toFiniteNumber(momGrowth) > 0 ? '+' : ''}${formatNumberLocal(toFiniteNumber(momGrowth))}%`;
  return `最新月營收約 ${revenueText}，${yoyText}、${momText}，這是目前判斷故事是否繼續往上走的第一個觀察點。`;
}

function valuationAssumptionPhrase(raw: string) {
  const clean = sanitizeNarrativeText(raw);
  if (!clean || looksLikeNarrativeNoise(clean) || looksLikeHeadlineDump(clean)) return null;
  if (/^(moderate|measured)$/i.test(clean)) return '估值僅做溫和上修';
  if (/^(strong|stronger)$/i.test(clean)) return '市場願意給更高的評價';
  if (/^(source|seed_override)$/i.test(clean)) return null;
  return clean;
}

function compactBridgeClause(value: string | null | undefined) {
  const clean = sanitizeNarrativeText(value);
  if (!clean || looksLikeNarrativeNoise(clean) || looksLikeHeadlineDump(clean)) return null;
  return clean.replace(/[。！？]+$/g, '').trim() || null;
}

function proseJoin(items: Array<string | null | undefined>, fallback = '') {
  const normalized = items
    .map((item) => compactBridgeClause(item))
    .filter((item): item is string => Boolean(item));
  if (normalized.length === 0) return fallback;
  return normalized.join('，');
}

function buildScenarioBridgeNarrative(
  label: string,
  driverLabel: string | null | undefined,
  operatingBridge: string | null | undefined,
  earningsBridge: string | null | undefined,
  assumptions: string[],
  financialBridge: string[],
  multipleBridge: string | null | undefined,
  targetPrice: number | null | undefined,
  expectedReturnPct: number | null | undefined,
  priceBridge: string | null | undefined,
) {
  const targetText = targetPrice == null || !Number.isFinite(targetPrice) ? '目標價仍待補' : `目標價約 NT$${formatNumberLocal(toFiniteNumber(targetPrice))}`;
  const returnText =
    expectedReturnPct == null || !Number.isFinite(expectedReturnPct)
      ? '對現價空間仍待補'
      : `對現價約 ${expectedReturnPct > 0 ? '+' : ''}${formatNumberLocal(expectedReturnPct)}%`;
  const driverSentence = compactBridgeClause(
    driverLabel ? `${label}的核心驅動來自 ${driverLabel}` : `${label}的核心驅動仍以故事主軸延續為主`,
  );
  const operatingSentence = compactBridgeClause(operatingBridge) || (assumptions.length > 0 ? `營運假設為 ${assumptions.join('，')}` : null);
  const earningsSentence = compactBridgeClause(earningsBridge) || proseJoin(financialBridge);
  const multipleSentence = compactBridgeClause(multipleBridge) ? `評價端 ${compactBridgeClause(multipleBridge)}` : null;
  const priceSentence = compactBridgeClause(priceBridge);
  const text = sentenceFromBridgeSegments(
    [
      driverSentence,
      operatingSentence,
      earningsSentence,
      multipleSentence,
      priceSentence,
      `${targetText}，${returnText}`,
    ],
    `${label}先以 ${targetText} 與 ${returnText} 評估風險報酬。`,
  );
  return sanitizeNarrativeText(text);
}

function sentenceFromBridgeSegments(segments: Array<string | null | undefined>, fallback: string) {
  const overlapClean = (value: string) => sanitizeNarrativeText(value).replace(/[\s，。！？、；;:：,.%+()（）/-]/g, '').toLowerCase();
  const overlapClauses = (value: string) =>
    sanitizeNarrativeText(value)
      .split(/[，。！？；;:：]/)
      .map((item) => item.trim())
      .filter((item) => item.length >= 6);
  const hasOverlap = (left: string, right: string) => {
    const leftClean = overlapClean(left);
    const rightClean = overlapClean(right);
    if (!leftClean || !rightClean) return false;
    if (leftClean.includes(rightClean) || rightClean.includes(leftClean)) return true;
    const leftClauseList = overlapClauses(left);
    const rightClauseList = overlapClauses(right);
    return leftClauseList.some((leftClause) =>
      rightClauseList.some((rightClause) => {
        const a = overlapClean(leftClause);
        const b = overlapClean(rightClause);
        return Boolean(a && b) && (a.includes(b) || b.includes(a));
      }),
    );
  };
  const text = narrativeCandidates(segments, 4)
    .reduce<string[]>((acc, candidate) => {
      if (acc.some((existing) => hasOverlap(existing, candidate))) return acc;
      acc.push(candidate);
      return acc;
    }, [])
    .slice(0, 3)
    .join(' ');
  return text || fallback;
}

function formatAssumptionValue(value: unknown) {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return null;
    const abs = Math.abs(value);
    if (abs >= 100000000) return `${formatNumberLocal(value / 100000000)} 億`;
    if (abs >= 10000) return `${formatNumberLocal(value / 10000)} 萬`;
    if (abs >= 100) return round(toFiniteNumber(value), 0).toLocaleString('zh-TW');
    return formatNumberLocal(value);
  }
  const clean = sanitizeNarrativeText(value);
  return clean || null;
}

function normalizedAssumptionItems(valuation: ValuationCaseView) {
  const assumptions = (valuation.assumptions || {}) as Record<string, unknown>;
  const operating = Array.isArray(assumptions.operating_assumptions)
    ? (assumptions.operating_assumptions as Array<Record<string, unknown>>)
        .map((item) => {
          const label = compactText(item.label || item.key || '');
          const value = formatAssumptionValue(item.value);
          if (!label || !value) return null;
          return {
            label,
            value,
            isEstimated: Boolean(item.isEstimated ?? item.is_estimated ?? true),
          };
        })
        .filter((item): item is { label: string; value: string; isEstimated: boolean } => Boolean(item))
    : [];
  if (operating.length > 0) return operating.slice(0, 6);

  const fallbackPairs: Array<[string, unknown]> = [
    ['年化營收', assumptions.revenue_annual],
    ['營收年增率', assumptions.revenue_yoy_pct],
    ['毛利率', assumptions.gross_margin_pct],
    ['營益率', assumptions.operating_margin_pct],
    ['EPS', assumptions.eps],
    ['估值倍數', assumptions.pe ?? assumptions.pb],
  ];
  return fallbackPairs
    .map(([label, rawValue]) => {
      const value = formatAssumptionValue(rawValue);
      if (!value) return null;
      return { label, value, isEstimated: true };
    })
    .filter((item): item is { label: string; value: string; isEstimated: boolean } => Boolean(item));
}

function normalizedBridgeSentences(value: unknown) {
  if (Array.isArray(value)) {
    return narrativeCandidates(
      value.map((item) => sanitizeNarrativeText(item)).filter(Boolean),
      4,
    );
  }
  return narrativeCandidates([sanitizeNarrativeText(value)], 1);
}

type ValuationBridgeContext = {
  symbol: string;
  thesisTitle: string | null;
  thesisSummary: string | null;
  currentPrice: number | null;
  monthlyRevenue: number | null;
  yoyGrowth: number | null;
  momGrowth: number | null;
  revenueAnnual: number | null;
  epsTtm: number | null;
  peRatio: number | null;
  pbRatio: number | null;
  grossMargin: number | null;
  operatingMargin: number | null;
};

type ValuationBridgeProfile = {
  driverLabel: string;
  peerLabel: string;
  benchmarkPeRange: [number, number];
  benchmarkText: string;
  volumeLabel: string;
  aspLabel: string;
  mixLabel: string;
  mixStart: number;
  mixTargets: Record<ValuationCaseView['caseType'], number>;
  volumeGrowthTargets: Record<ValuationCaseView['caseType'], number>;
  aspGrowthTargets: Record<ValuationCaseView['caseType'], number>;
  grossMarginTargets: Record<ValuationCaseView['caseType'], number>;
  operatingMarginTargets: Record<ValuationCaseView['caseType'], number>;
  storyLines: [string, string];
};

type StockSpecificBridgeSeed = {
  driverLabel?: string;
  tamRange: string;
  marketShareRange: string;
  mixTarget: number;
  orderVisibility: string;
  revenueAnnual: number;
  grossMarginPct: number;
  operatingMarginPct: number;
  eps: number;
  targetPe: number;
  evidenceRefs: string[];
  estimatedFields?: string[];
  baselineRevenueAnnual?: number;
  baselineGrossMarginPct?: number;
  baselineOperatingMarginPct?: number;
  baselinePeRatio?: number;
  baselinePbRatio?: number;
  evidenceBasis?: string[];
  customerExposure?: string | null;
  transcriptEvidence?: string | null;
  monthlyRevenueEvidence?: string | null;
  productMixEvidence?: string | null;
  marketShareEvidence?: string | null;
  multipleRationale?: string | null;
};

type StockSpecificBridgeScenarioMap = Partial<Record<ValuationCaseView['caseType'], StockSpecificBridgeSeed>>;

const OPPORTUNITIES_FIRST_BRIDGE_ROLLOUT_SYMBOLS = new Set([
  '2408', '2421', '6230', '3017', '2344', '3711', '3231', '2449', '4958', '3008', '2308', '3037',
  '3189', '3034', '6285', '6415', '2356', '2345', '2301', '3533', '5388',
  '2330', '6669', '2382', '3324', '5347', '2303', '2454', '2379', '2337',
]);

// Retained only as historical research fixtures while the point-in-time producer
// replaces each scenario. These values are deliberately unreachable from Web
// decisions: hard-coded estimates must never become valuation authority.
const RETIRED_NON_AUTHORITATIVE_BRIDGE_FIXTURES: Record<string, StockSpecificBridgeScenarioMap> = {
  '3008': {
    base: {
      tamRange: '約 NT$1,180–1,230 億',
      marketShareRange: '25%–27%',
      mixTarget: 45,
      orderVisibility: 'iPhone 17 Pro 潛望式鏡頭升規、Android 旗艦潛望式滲透率提升、Vision Pro 2 光學模組小量出貨',
      revenueAnnual: 64800000000,
      grossMarginPct: 60.5,
      operatingMarginPct: 44.5,
      eps: 130.95,
      targetPe: 21,
      evidenceRefs: [
        '支撐 Base｜公司法說與媒體追蹤都指向 2026 年高階鏡頭與可變光圈新案放量，ASP 與產品組合有改善空間。',
        '支撐 Base｜大立光為全球大型手機鏡頭供應商，高階 7P 以上鏡頭與潛望式供應地位支撐市場份額推估。',
        '支撐 Base｜近期月營收已回到年增，代表新機拉貨與高階鏡頭需求並非停留在題材層。 ',
      ],
      estimatedFields: ['高階光學 TAM', '市場份額', '潛望式滲透率', 'XR 模組貢獻'],
      baselineRevenueAnnual: 57600000000,
      baselineGrossMarginPct: 58,
      baselineOperatingMarginPct: 42,
      baselinePeRatio: 24.7,
    },
    upside: {
      tamRange: '約 NT$1,250–1,350 億',
      marketShareRange: '28%–30%',
      mixTarget: 52,
      orderVisibility: 'Apple 高階機種與 Android 旗艦同步拉高潛望式導入，XR 光學模組由試產走向量產',
      revenueAnnual: 70200000000,
      grossMarginPct: 62.5,
      operatingMarginPct: 46.5,
      eps: 137.78,
      targetPe: 22.5,
      evidenceRefs: [
        '支撐情境｜若潛望式鏡頭滲透率高於預期，單機鏡頭顆數與 ASP 都有機會同步上修。',
        '支撐情境｜XR 光學模組若從驗證轉為量產，市場對大立光的估值框架會更接近高階新應用供應鏈。',
        '支撐情境｜可變光圈與更複雜鏡頭設計提高良率門檻，若良率爬升順利，毛利率彈性會高於 Base。 ',
      ],
      estimatedFields: ['高階光學 TAM', '市場份額', 'XR 模組量產節奏'],
      baselineRevenueAnnual: 57600000000,
      baselineGrossMarginPct: 58,
      baselineOperatingMarginPct: 42,
      baselinePeRatio: 24.7,
    },
    invalidation: {
      tamRange: '約 NT$980–1,040 億',
      marketShareRange: '20%–22%',
      mixTarget: 33,
      orderVisibility: '潛望式導入速度不如預期，XR 模組維持試產與驗證階段',
      revenueAnnual: 59000000000,
      grossMarginPct: 56.5,
      operatingMarginPct: 39.5,
      eps: 105.56,
      targetPe: 18,
      evidenceRefs: [
        '失效情境｜若高階鏡頭導入率不及預期，產品組合就會回到傳統手機鏡頭框架。',
        '失效情境｜若良率或匯率壓力拖累獲利，市場不會願意給接近高階光學上緣的倍數。 ',
      ],
      estimatedFields: ['高階光學 TAM', '市場份額'],
      baselineRevenueAnnual: 57600000000,
      baselineGrossMarginPct: 58,
      baselineOperatingMarginPct: 42,
      baselinePeRatio: 24.7,
    },
  },
  '3450': {
    base: {
      tamRange: '約 NT$210–250 億',
      marketShareRange: '6%–8%',
      mixTarget: 24,
      orderVisibility: 'AOC、COS 封裝與 LD 封測訂單延續，2026 年產能擴張開始轉成營收',
      revenueAnnual: 12350000000,
      grossMarginPct: 35,
      operatingMarginPct: 18,
      eps: 13.86,
      targetPe: 50,
      evidenceRefs: [
        '支撐 Base｜法人與產業觀察都指出 AOC / COS 需求增長，2026 年營收有機會挑戰百億元以上。',
        '支撐 Base｜2025 年以來毛利率明顯走高，轉型到高毛利光通訊封裝的方向已開始反映在財務面。',
      ],
      estimatedFields: ['CPO / COS TAM', '市場份額', '訂單轉換節奏'],
      baselineRevenueAnnual: 8580000000,
      baselineGrossMarginPct: 30.5,
      baselineOperatingMarginPct: 13.2,
      baselinePeRatio: 62.8,
    },
    upside: {
      tamRange: '約 NT$260–320 億',
      marketShareRange: '8%–10%',
      mixTarget: 32,
      orderVisibility: '800G / 1.6T 光模組與 CPO 相關產品需求加速，COS 產能利用率大幅提升',
      revenueAnnual: 13400000000,
      grossMarginPct: 40,
      operatingMarginPct: 24,
      eps: 17.9,
      targetPe: 60,
      evidenceRefs: [
        '支撐情境｜若博通與美系客戶的訂單驗證更快落地，市場會把聯鈞視為 CPO 主線受惠股。',
        '支撐情境｜高毛利 COS 與 AOC 佔比若持續拉高，EPS 與估值倍數都會高於 Base。 ',
      ],
      estimatedFields: ['CPO / COS TAM', '市場份額', '1.6T 導入節奏'],
      baselineRevenueAnnual: 8580000000,
      baselineGrossMarginPct: 30.5,
      baselineOperatingMarginPct: 13.2,
      baselinePeRatio: 62.8,
    },
    invalidation: {
      tamRange: '約 NT$160–190 億',
      marketShareRange: '4%–5%',
      mixTarget: 16,
      orderVisibility: 'AOC 與 COS 僅維持保守放量，CPO 題材延後',
      revenueAnnual: 11300000000,
      grossMarginPct: 30,
      operatingMarginPct: 15,
      eps: 10.46,
      targetPe: 45,
      evidenceRefs: [
        '失效情境｜若 CPO 訂單驗證延後，聯鈞的評價會回到 AOC / 既有業務框架。',
      ],
      estimatedFields: ['CPO / COS TAM', '市場份額'],
      baselineRevenueAnnual: 8580000000,
      baselineGrossMarginPct: 30.5,
      baselineOperatingMarginPct: 13.2,
      baselinePeRatio: 62.8,
    },
  },
  '2337': {
    base: {
      tamRange: '約 71,000–74,000M Gb',
      marketShareRange: '約 51%',
      mixTarget: 34,
      orderVisibility: 'MLC NAND 退出供給持續發酵，長尾 eMMC 客戶轉單至旺宏',
      revenueAnnual: 56390000000,
      grossMarginPct: 28,
      operatingMarginPct: 10,
      eps: 30.04,
      targetPe: 10,
      evidenceRefs: [
        '支撐 Base｜三大原廠退出 MLC NAND 後，旺宏承接低容量 eMMC 長尾需求的故事已有供給端佐證。',
        '支撐 Base｜若 eMMC 佔比持續提升，獲利彈性會明顯高於市場對一般記憶體股的預期。 ',
      ],
      estimatedFields: ['eMMC 長尾需求 TAM', '市場份額'],
      baselineRevenueAnnual: 28800000000,
      baselineGrossMarginPct: 17.8,
      baselineOperatingMarginPct: -12.8,
      baselinePeRatio: -55.9,
    },
    upside: {
      tamRange: '約 74,000–78,000M Gb',
      marketShareRange: '55%–58%',
      mixTarget: 40,
      orderVisibility: '供需缺口維持更久，ASP 與高毛利產品占比同步提升',
      revenueAnnual: 69200000000,
      grossMarginPct: 33,
      operatingMarginPct: 14,
      eps: 34.8,
      targetPe: 11.5,
      evidenceRefs: [
        '支撐情境｜若供需缺口未被快速填補，旺宏可承接更多高毛利長尾需求，市場會願意給高於一般循環股的倍數。',
      ],
      estimatedFields: ['eMMC 長尾需求 TAM', '市場份額'],
      baselineRevenueAnnual: 28800000000,
      baselineGrossMarginPct: 17.8,
      baselineOperatingMarginPct: -12.8,
      baselinePeRatio: -55.9,
    },
    invalidation: {
      tamRange: '約 63,000–67,000M Gb',
      marketShareRange: '35%–40%',
      mixTarget: 22,
      orderVisibility: '價格回升不延續，長尾需求回到保守採購',
      revenueAnnual: 18000000000,
      grossMarginPct: 18,
      operatingMarginPct: 2,
      eps: 5,
      targetPe: 12,
      evidenceRefs: [
        '失效情境｜若 ASP 回升與供需缺口無法延續，旺宏就會回到傳統記憶體評價框架。 ',
      ],
      estimatedFields: ['eMMC 長尾需求 TAM', '市場份額'],
      baselineRevenueAnnual: 28800000000,
      baselineGrossMarginPct: 17.8,
      baselineOperatingMarginPct: -12.8,
      baselinePeRatio: -55.9,
    },
  },
  '2317': {
    base: {
      tamRange: '約 NT$35–40 兆 AI server / EMS 可服務市場',
      marketShareRange: '18%–22%',
      mixTarget: 34,
      orderVisibility: 'CSP AI server 與 rack-level 整機訂單延續，GB 系列與 ASIC 伺服器帶動高階組裝占比提升',
      revenueAnnual: 7800000000000,
      grossMarginPct: 7.2,
      operatingMarginPct: 3.6,
      eps: 14.5,
      targetPe: 16,
      evidenceRefs: [
        '支撐 Base｜鴻海持續揭露 AI server 為主要成長動能，CSP 客戶需求與 rack-level 出貨讓營收基底具可驗證性。',
        '支撐 Base｜月營收 run-rate 維持高檔，代表 AI server 不是單季題材，而是正在進入 EMS 營收結構。',
        '支撐 Base｜高階伺服器與機櫃組裝占比提高，毛利率與營益率有機會小幅高於傳統 EMS。',
      ],
      estimatedFields: ['AI server 可服務市場', 'CSP 客戶占比', 'rack-level 出貨占比', 'EPS'],
      baselineRevenueAnnual: 6900000000000,
      baselineGrossMarginPct: 6.4,
      baselineOperatingMarginPct: 3.1,
      baselinePeRatio: 14,
    },
    upside: {
      tamRange: '約 NT$40–46 兆 AI server / rack-level 可服務市場',
      marketShareRange: '22%–25%',
      mixTarget: 42,
      orderVisibility: '更多 CSP 將 GPU / ASIC rack 交由鴻海承接，液冷與整櫃出貨提高 ASP 與服務價值',
      revenueAnnual: 8600000000000,
      grossMarginPct: 7.8,
      operatingMarginPct: 4.2,
      eps: 18,
      targetPe: 18,
      evidenceRefs: [
        '支撐情境｜若 rack-level 交付與液冷整合放量速度快於 Base，鴻海不只是組裝，而是承接更高 ASP 的整櫃系統。',
        '支撐情境｜AI ASIC 客戶若擴大委外，市場會把鴻海評價從傳統 EMS 上修到 AI server 平台供應鏈。',
      ],
      estimatedFields: ['rack-level 出貨占比', '液冷整合 ASP', 'AI ASIC 客戶滲透'],
      baselineRevenueAnnual: 6900000000000,
      baselineGrossMarginPct: 6.4,
      baselineOperatingMarginPct: 3.1,
      baselinePeRatio: 14,
    },
    invalidation: {
      tamRange: '約 NT$30–34 兆 AI server / EMS 可服務市場',
      marketShareRange: '15%–17%',
      mixTarget: 25,
      orderVisibility: 'AI server 拉貨延後，rack-level 占比低於預期，傳統 EMS 稼動率壓回毛利率',
      revenueAnnual: 7200000000000,
      grossMarginPct: 6.2,
      operatingMarginPct: 2.9,
      eps: 11.5,
      targetPe: 13,
      evidenceRefs: [
        '失效情境｜若 CSP 拉貨延後或 rack-level 良率/交付不順，鴻海仍會被市場用傳統 EMS 倍數評價。',
      ],
      estimatedFields: ['AI server 可服務市場', 'rack-level 出貨占比'],
      baselineRevenueAnnual: 6900000000000,
      baselineGrossMarginPct: 6.4,
      baselineOperatingMarginPct: 3.1,
      baselinePeRatio: 14,
    },
  },
  '6223': {
    base: {
      tamRange: '約 NT$900–1,100 億高階 probe card / 測試介面可服務市場',
      marketShareRange: '10%–12%',
      mixTarget: 44,
      orderVisibility: 'AI/HPC 晶片、HBM 與先進封裝測試需求提高高階探針卡與測試座出貨',
      revenueAnnual: 15000000000,
      grossMarginPct: 48,
      operatingMarginPct: 31,
      eps: 28,
      targetPe: 26,
      evidenceRefs: [
        '支撐 Base｜旺矽受惠 AI/HPC 與先進封裝測試複雜度提升，高階探針卡需求具產業邏輯支撐。',
        '支撐 Base｜月營收與測試介面需求改善，可驗證產品組合正往高毛利應用移動。',
        '支撐 Base｜同業高階測試介面廠多以 normalized forward PE 評價，旺矽可享高於一般電子零組件的倍數。',
      ],
      estimatedFields: ['probe card TAM', 'AI/HPC 營收占比', 'HBM 測試滲透', 'EPS'],
      baselineRevenueAnnual: 12500000000,
      baselineGrossMarginPct: 45,
      baselineOperatingMarginPct: 28,
      baselinePeRatio: 24,
    },
    upside: {
      tamRange: '約 NT$1,100–1,350 億高階 probe card / HBM 測試可服務市場',
      marketShareRange: '12%–15%',
      mixTarget: 52,
      orderVisibility: 'AI accelerator 與 HBM 測試需求加速，高階探針卡供給吃緊使 ASP 與毛利率上修',
      revenueAnnual: 17800000000,
      grossMarginPct: 51,
      operatingMarginPct: 34,
      eps: 36,
      targetPe: 30,
      evidenceRefs: [
        '支撐情境｜若 HBM 與先進封裝測試需求持續超預期，旺矽高階產品 ASP 與稼動率會同步提高。',
        '支撐情境｜AI 晶片客戶導入週期若縮短，市場會提高對測試介面供應鏈的成長倍數。',
      ],
      estimatedFields: ['HBM 測試 TAM', '高階 probe card ASP', 'AI/HPC 客戶滲透'],
      baselineRevenueAnnual: 12500000000,
      baselineGrossMarginPct: 45,
      baselineOperatingMarginPct: 28,
      baselinePeRatio: 24,
    },
    invalidation: {
      tamRange: '約 NT$750–850 億 probe card 可服務市場',
      marketShareRange: '8%–9%',
      mixTarget: 34,
      orderVisibility: 'AI/HPC 測試需求放緩，客戶拉貨遞延，高階產品占比回落',
      revenueAnnual: 13000000000,
      grossMarginPct: 44,
      operatingMarginPct: 26,
      eps: 22,
      targetPe: 20,
      evidenceRefs: [
        '失效情境｜若 AI/HPC 測試需求遞延或價格競爭升高，旺矽將回到一般測試介面循環評價。',
      ],
      estimatedFields: ['probe card TAM', '高階產品占比'],
      baselineRevenueAnnual: 12500000000,
      baselineGrossMarginPct: 45,
      baselineOperatingMarginPct: 28,
      baselinePeRatio: 24,
    },
  },
  '2340': {
    base: {
      tamRange: '約 NT$450–550 億化合物半導體 / 光電元件可服務市場',
      marketShareRange: '5%–7%',
      mixTarget: 28,
      orderVisibility: '光通訊、車用與感測元件需求回升，低基期下產品組合逐步改善',
      revenueAnnual: 5200000000,
      grossMarginPct: 24,
      operatingMarginPct: 8,
      eps: 1.4,
      targetPe: 26,
      evidenceRefs: [
        '支撐 Base｜台亞具光電與化合物半導體製程基礎，若光通訊與車用需求修復，營收低基期具回升彈性。',
        '支撐 Base｜月營收 run-rate 若連續改善，可驗證產品組合從傳統 LED 往較高毛利應用修復。',
        '支撐 Base｜目前仍屬研究推估，需以法說與月營收確認毛利率改善是否落地。',
      ],
      estimatedFields: ['化合物半導體 TAM', '光通訊/車用 mix', '毛利率', 'EPS'],
      baselineRevenueAnnual: 4500000000,
      baselineGrossMarginPct: 20,
      baselineOperatingMarginPct: 3,
      baselinePeRatio: 24,
    },
    upside: {
      tamRange: '約 NT$550–700 億化合物半導體 / 光通訊可服務市場',
      marketShareRange: '7%–9%',
      mixTarget: 38,
      orderVisibility: '光通訊或感測元件新案放量，車用與高階應用占比提升，低基期轉折速度快於 Base',
      revenueAnnual: 6400000000,
      grossMarginPct: 30,
      operatingMarginPct: 14,
      eps: 2.4,
      targetPe: 30,
      evidenceRefs: [
        '支撐情境｜若光通訊與高階感測元件訂單放量，台亞的毛利率修復會比單純 LED 循環更快。',
        '支撐情境｜低基期個股若同時出現月營收與毛利率上修，市場容易給予轉機股 rerating。',
      ],
      estimatedFields: ['光通訊 TAM', '高階產品 mix', '訂單放量節奏'],
      baselineRevenueAnnual: 4500000000,
      baselineGrossMarginPct: 20,
      baselineOperatingMarginPct: 3,
      baselinePeRatio: 24,
    },
    invalidation: {
      tamRange: '約 NT$380–430 億光電元件可服務市場',
      marketShareRange: '4%–5%',
      mixTarget: 20,
      orderVisibility: '新案放量不如預期，產品組合仍停留在傳統 LED 與低毛利應用',
      revenueAnnual: 4600000000,
      grossMarginPct: 20,
      operatingMarginPct: 3,
      eps: 0.6,
      targetPe: 18,
      evidenceRefs: [
        '失效情境｜若月營收與毛利率無法連續修復，台亞仍應回到低基期光電零組件評價。',
      ],
      estimatedFields: ['高階產品 mix', '毛利率'],
      baselineRevenueAnnual: 4500000000,
      baselineGrossMarginPct: 20,
      baselineOperatingMarginPct: 3,
      baselinePeRatio: 24,
    },
  },
  '2408': {
    base: {
      tamRange: '約 NT$9,000 億–1.1 兆',
      marketShareRange: '18%–22%',
      mixTarget: 35,
      orderVisibility: 'Q1 2026 DRAM ASP 季增超過七十位數百分比，DDR5 與客製化 AI UWIO 開始貢獻，部分客戶以 LTA 提升訂單與價格能見度',
      revenueAnnual: 196350000000,
      grossMarginPct: 66,
      operatingMarginPct: 58,
      eps: 32,
      targetPe: 10,
      evidenceRefs: [
        '支撐 Base｜南亞科 2026Q1 自結營收 490.87 億、毛利率 67.9%、營益率 61.3%、EPS 8.41，顯示本輪不是只靠題材，而是已反映在財務數字。',
        '支撐 Base｜公司說明 DRAM ASP 季增超過七十位數百分比，DDR5 約占 10% 且可視需求彈性增加，客製化 AI UWIO 已開始貢獻營收。',
        '支撐 Base｜四大客戶參與私募普通股認購，搭配 LTA 訂單能見度，提高 DDR4 / DDR5 供給吃緊延續的可驗證性。',
      ],
      estimatedFields: ['DRAM TAM', '有效市場份額', 'DDR5 / AI UWIO 營收占比', 'normalized memory-cycle PE'],
      baselineRevenueAnnual: 196350000000,
      baselineGrossMarginPct: 67.9,
      baselineOperatingMarginPct: 61.3,
      baselinePeRatio: -68,
      baselinePbRatio: 3.4,
    },
    upside: {
      tamRange: '約 NT$1.05–1.25 兆',
      marketShareRange: '21%–25%',
      mixTarget: 48,
      orderVisibility: 'HBM 排擠一般 DRAM 產能延續，DDR5 占比提升快於 Base，1C / 1D 製程與 AI UWIO 產品拉高 ASP 與毛利率',
      revenueAnnual: 225000000000,
      grossMarginPct: 70,
      operatingMarginPct: 63,
      eps: 38.5,
      targetPe: 11,
      evidenceRefs: [
        '支撐情境｜若 DDR5 占比由目前約 10% 更快提升，且 AI UWIO 從開始貢獻營收走向放量，產品 mix 對 ASP 與毛利率的拉動會高於 Base。',
        '支撐情境｜若 HBM 投片排擠效應延長、一般 DRAM 供給維持緊俏，市場會用更高 normalized PE 反映南亞科的週期獲利彈性。',
        '支撐情境｜1C / 1D 製程與 EUV 開發按計畫推進，若良率與產能轉換順利，EPS 可在高 ASP 基底上再上修。',
      ],
      estimatedFields: ['DRAM TAM', '有效市場份額', 'DDR5 / AI UWIO 放量速度', 'LTA 價格能見度'],
      baselineRevenueAnnual: 196350000000,
      baselineGrossMarginPct: 67.9,
      baselineOperatingMarginPct: 61.3,
      baselinePeRatio: -68,
      baselinePbRatio: 3.4,
    },
    invalidation: {
      tamRange: '約 NT$6,500–7,500 億',
      marketShareRange: '13%–16%',
      mixTarget: 18,
      orderVisibility: 'DRAM ASP 回落，DDR5 / AI UWIO 貢獻停留在低占比，客戶 LTA 只能支撐短期訂單而無法延續價格',
      revenueAnnual: 145000000000,
      grossMarginPct: 42,
      operatingMarginPct: 30,
      eps: 16,
      targetPe: 8,
      evidenceRefs: [
        '失效情境｜若 DRAM ASP 快速反轉，Q1 2026 高毛利率將被視為週期高點而非新基底。',
        '失效情境｜若 DDR5 與 AI UWIO 無法擴大營收占比，南亞科仍會被市場用較保守的傳統 DRAM 週期倍數評價。',
      ],
      estimatedFields: ['DRAM TAM', '有效市場份額', 'DDR5 / AI UWIO 營收占比'],
      baselineRevenueAnnual: 196350000000,
      baselineGrossMarginPct: 67.9,
      baselineOperatingMarginPct: 61.3,
      baselinePeRatio: -68,
      baselinePbRatio: 3.4,
    },
  },
  '2344': {
    base: {
      tamRange: '約 NT$320–360 億',
      marketShareRange: '8%–10%',
      mixTarget: 30,
      orderVisibility: '車規 NOR Flash 與 Specialty DRAM 補庫存延續，工控與車用客戶回補需求',
      revenueAnnual: 45500000000,
      grossMarginPct: 24,
      operatingMarginPct: 9,
      eps: 4.8,
      targetPe: 28,
      evidenceRefs: [
        '支撐 Base｜車規 NOR Flash 與 Specialty DRAM 需求回溫，代表華邦電的復甦不只靠景氣低基期。',
        '支撐 Base｜若車用與工控高毛利產品占比提升，毛利率與營益率不應停留在過去低點。 ',
      ],
      estimatedFields: ['Specialty 記憶體 TAM', '市場份額'],
      baselineRevenueAnnual: 38400000000,
      baselineGrossMarginPct: 18,
      baselineOperatingMarginPct: -5,
    },
    upside: {
      tamRange: '約 NT$360–420 億',
      marketShareRange: '10%–12%',
      mixTarget: 35,
      orderVisibility: '車規 NOR Flash 與 Specialty DRAM 拉貨快於預期，ASP 與高毛利產品占比同步提升',
      revenueAnnual: 49500000000,
      grossMarginPct: 27,
      operatingMarginPct: 12,
      eps: 5.9,
      targetPe: 30,
      evidenceRefs: [
        '支撐情境｜若車規與工控客戶補庫存延續更久，市場會把華邦電從低基期修復股重新定價成 Specialty 記憶體復甦股。',
      ],
      estimatedFields: ['Specialty 記憶體 TAM', '市場份額'],
      baselineRevenueAnnual: 38400000000,
      baselineGrossMarginPct: 18,
      baselineOperatingMarginPct: -5,
    },
    invalidation: {
      tamRange: '約 NT$260–300 億',
      marketShareRange: '6%–8%',
      mixTarget: 22,
      orderVisibility: '車規與工控需求只維持溫和修復，ASP 回升不延續',
      revenueAnnual: 37200000000,
      grossMarginPct: 18,
      operatingMarginPct: 4,
      eps: 3.2,
      targetPe: 24,
      evidenceRefs: [
        '失效情境｜若車規 NOR Flash 與 Specialty DRAM 補庫存不延續，華邦電會回到一般循環記憶體的保守評價框架。 ',
      ],
      estimatedFields: ['Specialty 記憶體 TAM', '市場份額'],
      baselineRevenueAnnual: 38400000000,
      baselineGrossMarginPct: 18,
      baselineOperatingMarginPct: -5,
    },
  },
  '2382': {
    base: {
      tamRange: '約 NT$5.0–5.4 兆',
      marketShareRange: '14%–15%',
      mixTarget: 38,
      orderVisibility: 'AI server 機櫃與整機訂單能見度延伸到 2027 年',
      revenueAnnual: 1970000000000,
      grossMarginPct: 9.5,
      operatingMarginPct: 5.4,
      eps: 19.5,
      targetPe: 18,
      evidenceRefs: [
        '支撐 Base｜雲端客戶 capex 與 AI server 出貨追蹤持續支持高階機櫃產品放量。',
        '支撐 Base｜AI server 營收占比提高後，毛利率與營益率有望快於營收成長改善。 ',
      ],
      estimatedFields: ['AI server TAM', '市場份額'],
      baselineRevenueAnnual: 1833600000000,
      baselineGrossMarginPct: 8.5,
      baselineOperatingMarginPct: 4.2,
      baselinePeRatio: 19.5,
    },
    upside: {
      tamRange: '約 NT$5.6–6.0 兆',
      marketShareRange: '16%–17%',
      mixTarget: 45,
      orderVisibility: 'rack-level 產品與高階整機 ASP 升級同步實現',
      revenueAnnual: 2090000000000,
      grossMarginPct: 10.4,
      operatingMarginPct: 6.2,
      eps: 20.01,
      targetPe: 20,
      evidenceRefs: [
        '支撐情境｜若 rack-level 與高階整機占比提升速度更快，市場會提高對 EPS 彈性的定價。 ',
      ],
      estimatedFields: ['AI server TAM', '市場份額'],
      baselineRevenueAnnual: 1833600000000,
      baselineGrossMarginPct: 8.5,
      baselineOperatingMarginPct: 4.2,
      baselinePeRatio: 19.5,
    },
    invalidation: {
      tamRange: '約 NT$4.6–4.9 兆',
      marketShareRange: '12%–13%',
      mixTarget: 30,
      orderVisibility: 'AI server 需求只維持溫和成長，產品組合改善不如預期',
      revenueAnnual: 1780000000000,
      grossMarginPct: 8.1,
      operatingMarginPct: 3.8,
      eps: 15.96,
      targetPe: 15,
      evidenceRefs: [
        '失效情境｜若 AI server 訂單能見度未能延伸到 2027，廣達仍會被用傳統伺服器框架估值。 ',
      ],
      estimatedFields: ['AI server TAM', '市場份額'],
      baselineRevenueAnnual: 1833600000000,
      baselineGrossMarginPct: 8.5,
      baselineOperatingMarginPct: 4.2,
      baselinePeRatio: 19.5,
    },
  },
  '2454': {
    base: {
      tamRange: '約 NT$3,500–4,000 億',
      marketShareRange: '40%–42%',
      mixTarget: 42,
      orderVisibility: '旗艦 SoC、Wi-Fi 7 與車用新品放量，帶動高階產品組合提升',
      revenueAnnual: 580000000000,
      grossMarginPct: 49.8,
      operatingMarginPct: 22.5,
      eps: 85,
      targetPe: 22,
      evidenceRefs: [
        '支撐 Base｜旗艦 SoC 與邊緣 AI 功能升級，有助 ASP 與毛利率高於手機整體出貨增速。',
        '支撐 Base｜新產品線像 Wi-Fi 7 與車用 SoC 使高階產品 mix 改善不只靠單一手機週期。 ',
      ],
      estimatedFields: ['高階 SoC TAM', '市場份額'],
      baselineRevenueAnnual: 535200000000,
      baselineGrossMarginPct: 48.7,
      baselineOperatingMarginPct: 21.4,
      baselinePeRatio: 26.4,
    },
    upside: {
      tamRange: '約 NT$4,000–4,400 億',
      marketShareRange: '46%–48%',
      mixTarget: 48,
      orderVisibility: '旗艦 SoC 與 edge AI 導入更快，ASP 提升與市占擴張同時發生',
      revenueAnnual: 610000000000,
      grossMarginPct: 51.5,
      operatingMarginPct: 24,
      eps: 87.5,
      targetPe: 24,
      evidenceRefs: [
        '支撐情境｜若高階產品占比提升速度快於預期，EPS 修復會比市場現在的 Base 更快。 ',
      ],
      estimatedFields: ['高階 SoC TAM', '市場份額'],
      baselineRevenueAnnual: 535200000000,
      baselineGrossMarginPct: 48.7,
      baselineOperatingMarginPct: 21.4,
      baselinePeRatio: 26.4,
    },
    invalidation: {
      tamRange: '約 NT$3,000–3,300 億',
      marketShareRange: '34%–36%',
      mixTarget: 31,
      orderVisibility: '旗艦 SoC 放量不如預期，手機與 edge AI 需求僅溫和回升',
      revenueAnnual: 520000000000,
      grossMarginPct: 46,
      operatingMarginPct: 18,
      eps: 72.5,
      targetPe: 20,
      evidenceRefs: [
        '失效情境｜若高階 SoC 與新產品 mix 未如期改善，聯發科會回到較保守的手機晶片評價區間。 ',
      ],
      estimatedFields: ['高階 SoC TAM', '市場份額'],
      baselineRevenueAnnual: 535200000000,
      baselineGrossMarginPct: 48.7,
      baselineOperatingMarginPct: 21.4,
      baselinePeRatio: 26.4,
    },
  },
};

const STOCK_SPECIFIC_BRIDGE_SEEDS: Readonly<Record<string, StockSpecificBridgeScenarioMap>> = Object.freeze({});

// Keep the fixture declaration explicit so a future cleanup can move it into the
// test package without accidentally restoring it to the production read path.
void RETIRED_NON_AUTHORITATIVE_BRIDGE_FIXTURES;

function stockSpecificBridgeSeed(
  symbol: string,
  caseType: ValuationCaseView['caseType'],
) {
  return STOCK_SPECIFIC_BRIDGE_SEEDS[symbol]?.[caseType] || null;
}

function generatedShareRangeForProfile(
  symbol: string,
  profile: ValuationBridgeProfile,
  caseType: ValuationCaseView['caseType'],
) {
  if (symbol === '2330') {
    return caseType === 'upside' ? [54, 58] : caseType === 'base' ? [48, 52] : [40, 44];
  }
  if (symbol === '3450') {
    return caseType === 'upside' ? [8, 10] : caseType === 'base' ? [6, 8] : [4, 5];
  }
  const peer = profile.peerLabel.toLowerCase();
  if (peer.includes('ic 設計') || peer.includes('soc')) {
    return caseType === 'upside' ? [44, 48] : caseType === 'base' ? [36, 42] : [28, 34];
  }
  if (peer.includes('光學')) {
    return caseType === 'upside' ? [28, 30] : caseType === 'base' ? [24, 27] : [20, 22];
  }
  if (peer.includes('記憶體') || peer.includes('儲存')) {
    return caseType === 'upside' ? [18, 22] : caseType === 'base' ? [12, 16] : [8, 10];
  }
  if (peer.includes('封測') || peer.includes('封裝')) {
    return caseType === 'upside' ? [10, 14] : caseType === 'base' ? [8, 11] : [5, 8];
  }
  if (peer.includes('網通') || peer.includes('交換器')) {
    return caseType === 'upside' ? [10, 13] : caseType === 'base' ? [7, 10] : [4, 6];
  }
  if (peer.includes('載板') || peer.includes('pcb')) {
    return caseType === 'upside' ? [14, 17] : caseType === 'base' ? [10, 13] : [7, 9];
  }
  if (peer.includes('odm') || peer.includes('ems') || peer.includes('server')) {
    return caseType === 'upside' ? [14, 18] : caseType === 'base' ? [11, 14] : [8, 10];
  }
  if (peer.includes('散熱') || peer.includes('液冷')) {
    return caseType === 'upside' ? [12, 15] : caseType === 'base' ? [9, 12] : [6, 8];
  }
  return caseType === 'upside' ? [12, 16] : caseType === 'base' ? [8, 12] : [5, 7];
}

function formatShareRange(lowPct: number, highPct: number) {
  return `${formatNumberLocal(lowPct)}%–${formatNumberLocal(highPct)}%`;
}

function formatTamRangeFromRevenue(productRevenue: number | null, lowSharePct: number, highSharePct: number) {
  if (productRevenue == null || !Number.isFinite(productRevenue) || productRevenue <= 0) {
    return '研究推估不足';
  }
  const lowTam = productRevenue / Math.max(highSharePct / 100, 0.0001);
  const highTam = productRevenue / Math.max(lowSharePct / 100, 0.0001);
  return `約 ${formatNarrativeMoney(lowTam)}–${formatNarrativeMoney(highTam)}`;
}

function scenarioTargetPeForProfile(
  profile: ValuationBridgeProfile,
  caseType: ValuationCaseView['caseType'],
) {
  const [low, high] = profile.benchmarkPeRange;
  if (caseType === 'upside') return round(high, 1);
  if (caseType === 'invalidation') return round(Math.max(low - 2, Math.min(low, 6)), 1);
  return round((low + high) / 2, 1);
}

function generatedStockSpecificSeedFromOverride(
  symbol: string,
  caseType: ValuationCaseView['caseType'],
  profile: ValuationBridgeProfile,
): StockSpecificBridgeSeed | null {
  if (!OPPORTUNITIES_FIRST_BRIDGE_ROLLOUT_SYMBOLS.has(symbol)) return null;
  const override = SEED_RESEARCH_OVERRIDES[symbol];
  if (!override) return null;
  const baselineRevenueAnnual =
    override.monthlyRevenue > 0 && Number.isFinite(override.monthlyRevenue) ? override.monthlyRevenue * 12 : null;
  if (baselineRevenueAnnual == null || baselineRevenueAnnual <= 0) return null;

  const mixTarget = profile.mixTargets[caseType];
  const volumeGrowth = profile.volumeGrowthTargets[caseType];
  const aspGrowth = profile.aspGrowthTargets[caseType];
  const revenueLift =
    caseType === 'base'
      ? 1 + volumeGrowth / 100 * 0.55 + aspGrowth / 100 * 0.22
      : caseType === 'upside'
        ? 1 + volumeGrowth / 100 * 0.58 + aspGrowth / 100 * 0.26
        : 1 + volumeGrowth / 100 * 0.45 + aspGrowth / 100 * 0.18;
  const revenueAnnual = round(baselineRevenueAnnual * revenueLift, 0);
  const grossMarginPct =
    caseType === 'base'
      ? round(Math.max(override.grossMargin + 1.2, profile.grossMarginTargets.base), 2)
      : caseType === 'upside'
        ? round(Math.max(override.grossMargin + 3.2, profile.grossMarginTargets.upside), 2)
        : round(Math.min(override.grossMargin - 2.2, profile.grossMarginTargets.invalidation), 2);
  const operatingMarginPct =
    caseType === 'base'
      ? round(Math.max(override.operatingMargin + 1.5, profile.operatingMarginTargets.base), 2)
      : caseType === 'upside'
        ? round(Math.max(override.operatingMargin + 3.5, profile.operatingMarginTargets.upside), 2)
        : round(Math.min(override.operatingMargin - 2.4, profile.operatingMarginTargets.invalidation), 2);
  const eps = buildBridgeDerivedEps({
    currentRevenueAnnual: baselineRevenueAnnual,
    projectedRevenueAnnual: revenueAnnual,
    currentGrossMargin: override.grossMargin,
    projectedGrossMargin: grossMarginPct,
    currentOperatingMargin: override.operatingMargin,
    projectedOperatingMargin: operatingMarginPct,
    currentEps: override.epsTtm,
  });
  if (eps == null || !Number.isFinite(eps) || eps <= 0) return null;

  const targetPe = scenarioTargetPeForProfile(profile, caseType);
  const [lowSharePct, highSharePct] = generatedShareRangeForProfile(symbol, profile, caseType);
  const productRevenue = revenueAnnual * (mixTarget / 100);
  const tamRange = formatTamRangeFromRevenue(productRevenue, lowSharePct, highSharePct);
  const supportLabel = caseType === 'upside' ? '支撐情境' : caseType === 'invalidation' ? '失效情境' : '支撐 Base';
  const evidenceRefs = uniqueNarrativeLines(
    [
      override.thesisSummary ? `${supportLabel}｜${override.thesisSummary}` : null,
      override.catalystSummary ? `${supportLabel}｜${override.catalystSummary}` : null,
    ],
    3,
  );
  return {
    driverLabel: profile.driverLabel,
    tamRange,
    marketShareRange: formatShareRange(lowSharePct, highSharePct),
    mixTarget,
    orderVisibility: override.catalystSummary || override.thesisTitle || profile.storyLines[0] || profile.driverLabel,
    revenueAnnual,
    grossMarginPct,
    operatingMarginPct,
    eps,
    targetPe,
    evidenceRefs,
    estimatedFields: ['市場份額', 'TAM', profile.volumeLabel, profile.aspLabel],
    baselineRevenueAnnual,
    baselineGrossMarginPct: override.grossMargin,
    baselineOperatingMarginPct: override.operatingMargin,
    baselinePeRatio: override.peRatio,
  };
}

type StockSpecificEvidenceBundle = {
  evidenceBasis: string[];
  customerExposure: string | null;
  transcriptEvidence: string | null;
  monthlyRevenueEvidence: string | null;
  productMixEvidence: string | null;
  marketShareEvidence: string | null;
  multipleRationale: string | null;
};

function buildSampleStockEvidenceBundle(
  context: ValuationBridgeContext,
  caseType: ValuationCaseView['caseType'],
  seed: StockSpecificBridgeSeed,
) {
  const revenueSignal = summarizeRevenueNarrative(context.monthlyRevenue, context.yoyGrowth, context.momGrowth);
  const caseLabel = caseType === 'upside' ? '情境' : caseType === 'invalidation' ? '失效' : 'Base';
  if (context.symbol === '2382') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：依據公司法說、供應鏈追蹤與 hyperscaler capex 討論，${caseLabel} 情境主要對應 Meta、Microsoft、Google 等 CSP 的 AI server 與 rack-level 機櫃拉貨；研究推估整機與 rack-level 產品仍是 2026 年 ASP 與 mix 上修的主引擎。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：公司多次強調 AI server 產品比重持續拉高，毛利率改善不只來自營收放大，也來自高單價整機、機櫃與系統整合服務比重上升；因此毛利率與營益率假設需與產品 mix 一起上修，不能只單改 EPS。',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境以 AI server 營收占比由 28% ${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}% 為核心假設，並把機櫃 / 整機 ASP、出貨台數與高毛利系統整合收入一併納入。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以全球 AI server ODM / rack 可服務市場 ${seed.tamRange} 為底，廣達在 hyperscaler ODM 鏈的有效接單份額約 ${seed.marketShareRange}；這個份額假設來自既有 CSP 客戶結構、月營收 run-rate 與同業出貨格局，而非單一社群傳聞。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，因廣達仍屬低毛利 ODM/EMS，本質上不會直接套最樂觀 AI 純概念股倍數；只有在 rack-level 與整機 mix 驗證更快時，才往同業區間上緣靠攏。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據法說、CSP capex 討論與月營收 run-rate，研究推估 AI server 營收占比可由 28% ${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、有效接單份額 ${seed.marketShareRange} 與產品 mix 改善，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '2454') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應 Android 旗艦 OEM、Wi‑Fi 7 網通客戶與車用 SoC 專案；研究推估並非把單一手機品牌銷量直接線性外推，而是看旗艦 SoC 滲透、ASP 與新產品占比是否同步提升。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：公司對旗艦 SoC、端側 AI、Wi‑Fi 7 與車用新品的描述，支持高階產品組合改善；因此 EPS 上修不是單靠出貨量，而是 ASP、毛利率與費用率共同改善後的結果。',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境把旗艦 SoC / 高階連網產品占比視為關鍵變數，假設高階產品 mix 由 35% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並搭配 Wi‑Fi 7 與車用新品放量。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以高階 Android / edge AI SoC 可服務市場 ${seed.tamRange} 為底，聯發科在旗艦與準旗艦 SoC 的營收份額約 ${seed.marketShareRange}；這裡看的是高階營收份額，而不是整體手機出貨市占。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，是在高階 IC 設計同業常見區間內、偏向 normalized / forward PE 的寫法；若目前 TTM PE 失真，會優先用產品組合升級後的 normalized 獲利看待。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據旗艦 SoC 世代升級、Wi‑Fi 7 與車用新品節奏，研究推估高階產品 mix 可由 35% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、營收份額 ${seed.marketShareRange} 與高階 ASP 上修，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '2337') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應長尾工控、車用與低容量 eMMC 客戶在三星、SK hynix、Kioxia、Micron 退出 MLC NAND 後的轉單需求；研究推估並非假設所有需求都由旺宏承接，而是只計入其可供應規格與長尾缺口。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：供給端重點不是單一季度價格彈跳，而是 MLC NAND 退出與低容量 eMMC 長尾需求仍在，這使 EPS 推導必須同時反映 ASP/Gb、產品組合與供給缺口，而非只用價格乘上倍數。',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境把 eMMC / MLC 長尾產品占比視為核心變數，假設高毛利產品 mix 由 22% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並把 ASP/Gb 與出貨缺口一起帶進毛利率。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以低容量 eMMC / MLC 長尾需求 ${seed.tamRange} 為底，旺宏可承接約 ${seed.marketShareRange} 的供應份額；這個份額假設來自供給退出幅度、可替代供應商數量與公司產品線位置。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，仍低於高成長半導體股常見上緣，因市場對記憶體循環與供需缺口可維持多久仍保留折價。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          '依據供給端退出、長尾 eMMC 轉單與產品規格缺口，研究推估旺宏可承接更高的高毛利 eMMC / MLC 需求。',
          revenueSignal,
          `研究推估以需求缺口 ${seed.tamRange}、可承接份額 ${seed.marketShareRange} 與 ASP/Gb 改善，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '2408') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境以南亞科公告四大客戶參與私募、部分客戶簽訂 LTA、以及多元 DRAM 產品穩定供應需求作為已驗證基底；若延伸到 HBM 排擠效應與 DDR5 / AI UWIO 放量，這部分仍列為研究推估，不直接視為已公告訂單。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：南亞科 2026Q1 自結營收 490.87 億元、毛利率 67.9%、營益率 61.3%、EPS 8.41；公司同時說明第一季 DRAM ASP 季增超過七十位數百分比，DDR5 約占 10% 且可視需求增加，客製化 AI UWIO 已開始貢獻營收。',
      ),
      monthlyRevenueEvidence: sanitizeNarrativeText(
        `月營收 / run-rate：以 2026Q1 營收 490.87 億元年化，run-rate 約 1,963.5 億元；${revenueSignal || '若單月 MOPS 數字尚未刷新，則以最新官方季度營收作為有效非零基底。'}`,
      ),
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境把 DDR5、AI UWIO 與高 ASP DDR4 / DDR5 產品 mix 視為核心變數，假設高毛利 DRAM 組合由官方揭露的 DDR5 約 10% 基底 ${caseType === 'invalidation' ? '只提升到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%；毛利率與營益率變動必須跟 ASP、製程與產品組合一起驗證。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以一般 DRAM / DDR4 / DDR5 可服務市場 ${seed.tamRange} 為底，南亞科在可供應產品鏈的有效營收份額約 ${seed.marketShareRange}；這裡看的是 DDR4 / DDR5 與客製化 DRAM 產品的有效營收份額，不是整體 HBM 市占。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x normalized memory-cycle PE；由於南亞科剛由虧轉盈、TTM PE 會被過去虧損扭曲，估值不直接使用表面 TTM PE，而以 Q1 2026 有效獲利基底與週期 normalized PE 評價。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          '依據南亞科官方 2026Q1 自結財報、DRAM ASP 季增超過七十位數百分比、DDR5 約 10% 與 AI UWIO 開始貢獻營收，建立本輪非零財務基底。',
          '依據四大客戶私募認購、LTA 訂單能見度與 HBM 投片排擠一般 DRAM 供給，研究推估 DDR4 / DDR5 供需緊俏仍可支撐 Base。',
          `研究推估以可服務市場 ${seed.tamRange}、有效營收份額 ${seed.marketShareRange} 與高毛利 DRAM 組合 ${formatNumberLocal(seed.mixTarget)}%，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '2344') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應車規 NOR Flash、工控與網通客戶對 Specialty DRAM 的回補需求；若沒有公司直接揭露單一客戶採購量，相關拉貨節奏一律視為研究推估，而非已公告訂單。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：華邦電的重點不是全面記憶體景氣復甦，而是 Specialty DRAM 與車規 NOR Flash 產品組合是否改善，讓毛利率與營益率從低基期回升；因此這套模型同時上修營收、毛利率與營益率，而不是只看價格反彈。',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境假設車規與高毛利 NOR Flash / Specialty DRAM 營收占比由 24% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並把車規 ASP 溢價、工控需求回補與低基期利用率改善一起帶入。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以車規 NOR Flash 與 Specialty DRAM 可服務市場 ${seed.tamRange} 為底，華邦電在可量產規格中的有效營收份額約 ${seed.marketShareRange}；這裡看的不是整體 DRAM 市占，而是高毛利 Specialty 記憶體營收份額。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，主要反映市場把華邦電視為低基期修復 + Specialty 記憶體組合改善標的；若目前 TTM PE 因虧損或低基期失真，則以 normalized / forward PE 為主。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據車規 NOR Flash、工控與網通客戶補庫存節奏，以及公司產品組合改善方向，研究推估高毛利產品占比可由 24% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、有效營收份額 ${seed.marketShareRange} 與車規 / Specialty ASP 溢價，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '3008') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應 iPhone Pro 系列、Android 旗艦鏡頭升規、潛望式導入率提升與 XR 光學模組驗證節奏；研究推估看的是高階鏡頭 ASP 與顆數，而不是單純用整體手機出貨量外推。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：高階鏡頭、可變光圈與更複雜光學模組的良率與產品組合，才是毛利率與 EPS 變動核心；因此本模型不允許只改 EPS 而不改毛利率與營益率。 ',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境假設高階鏡頭 / 潛望式 / XR 光學模組占比由 32% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並把鏡頭顆數、ASP 與潛望式滲透率一起帶入。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以旗艦手機高階鏡頭、潛望式鏡頭與 XR 光學模組可服務市場 ${seed.tamRange} 為底，大立光在高階光學鏈有效營收份額約 ${seed.marketShareRange}；這裡看的不是整體手機市占，而是高階鏡頭營收份額。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，是在高階光學同業區間內、但未直接套最樂觀新題材上緣；只有 XR 或更高階鏡頭滲透超預期時，才會往上緣再靠。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據高階鏡頭升規、潛望式滲透與 XR 驗證進度，研究推估高毛利光學占比可由 32% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、有效營收份額 ${seed.marketShareRange} 與高階 ASP 上修，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '3450') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應 AOC、COS 封裝、LD 封測與 CPO 生態鏈相關需求；若提到 Broadcom 或北美高速光互連客戶，這部分一律視為供應鏈研究推估，不直接視為已公告訂單。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：公司近年毛利率走高與光通訊產品占比提升，支持轉型方向成立；但 CPO 與 1.6T 的放量節奏仍需持續用法說、接單與產能利用率驗證，而不是單靠市場傳聞。 ',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境把 AOC / COS / CPO / LD 封測等高毛利產品占比視為關鍵變數，假設高毛利光通訊 mix 由 16% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並把 800G / 1.6T 滲透節奏一起納入。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以高速光互連、AOC / COS 封裝與相關光模組可服務市場 ${seed.tamRange} 為底，聯鈞可承接約 ${seed.marketShareRange} 的有效營收份額；這個份額假設來自產能、產品線位置與可量產節奏，而非單篇喊單文章。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，代表市場把聯鈞視為具轉型彈性的高速光通訊標的，但仍未直接套到最極端的題材倍數上緣。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據 AOC / COS 需求、800G / 1.6T 滲透與產能利用率提升，研究推估高毛利光通訊產品占比可由 16% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、有效營收份額 ${seed.marketShareRange} 與產品 mix 改善，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  if (context.symbol === '2330') {
    return {
      customerExposure: sanitizeNarrativeText(
        `客戶 / 訂單依據：${caseLabel} 情境主要對應 NVIDIA、AMD、Broadcom、Marvell 與北美 hyperscaler 自研 ASIC 等先進製程與先進封裝需求；其中個別客戶採購量若未由公司直接揭露，一律只作研究推估，不把單一供應鏈傳聞直接視為已公告訂單。`,
      ),
      transcriptEvidence: sanitizeNarrativeText(
        '法說 / 官方依據：公司法說持續提到 AI 需求強勁、CoWoS / SoIC 等先進封裝仍偏緊，且毛利率韌性來自 3nm / 5nm 與先進封裝組合改善。因此本模型把 ASP、先進節點 mix、先進封裝占比與毛利率一併上修，而不是只單改 EPS。',
      ),
      monthlyRevenueEvidence: revenueSignal,
      productMixEvidence: sanitizeNarrativeText(
        `${caseLabel} 情境假設 3nm / 5nm 與先進封裝營收占比由 18% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%，並把 3nm / 5nm wafer ASP、CoWoS 產能利用率與 AI 加速器相關封裝貢獻一起帶入。`,
      ),
      marketShareEvidence: sanitizeNarrativeText(
        `市場份額依據：研究推估以 AI 先進製程 wafer 與 CoWoS / SoIC 先進封裝可服務市場 ${seed.tamRange} 為底，台積電在這段高階製程與封裝鏈的有效營收份額約 ${seed.marketShareRange}；這裡看的不是整體晶圓代工市占，而是 AI 與先進製程相關營收份額。`,
      ),
      multipleRationale: sanitizeNarrativeText(
        `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，主要參考先進製程晶圓代工與先進封裝受惠股的 normalized / forward PE 區間；若目前 TTM PE 受景氣或獲利基期影響失真，會優先以 normalized PE 看待，而不直接拿表面 TTM PE 當唯一依據。`,
      ),
      evidenceBasis: uniqueNarrativeLines(
        [
          `依據公司法說對 AI 需求與 CoWoS 產能偏緊的表述、月營收 run-rate 與先進節點產品組合，研究推估 3nm / 5nm 與先進封裝營收占比可由 18% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%。`,
          revenueSignal,
          `研究推估以可服務市場 ${seed.tamRange}、有效營收份額 ${seed.marketShareRange} 與先進製程 ASP 韌性，共同推導 ${caseLabel} 目標價。`,
        ],
        4,
      ),
    } satisfies StockSpecificEvidenceBundle;
  }

  return null;
}

function buildGenericEvidenceBundle(
  context: ValuationBridgeContext,
  profile: ValuationBridgeProfile,
  caseType: ValuationCaseView['caseType'],
  seed: StockSpecificBridgeSeed,
  marketSizingBridge: string | null,
) {
  const caseLabel = caseType === 'upside' ? '情境' : caseType === 'invalidation' ? '失效' : 'Base';
  const revenueSignal = summarizeRevenueNarrative(context.monthlyRevenue, context.yoyGrowth, context.momGrowth);
  const customerExposure = sanitizeNarrativeText(
    `客戶 / 訂單依據：未取得具名客戶或公告訂單；本段僅以 ${profile.driverLabel} 的上下游供應鏈位置、產品線與既有營收結構作為供應鏈映射推估，不納入已驗證 Base，只能列為情境待驗證條件。`,
  );
  const transcriptEvidence = sanitizeNarrativeText(
    `法說 / 官方依據：目前以 ${context.thesisTitle || '既有研究主軸'} 與公開法說 / 財務摘要為主要參考，重點驗證 ${profile.mixLabel}、${profile.volumeLabel} 與 ${profile.aspLabel} 是否同時支持獲利上修。`,
  );
  const monthlyRevenueEvidence =
    revenueSignal ||
    '月營收依據：目前缺少可直接年化的最新月營收 run-rate，因此這段營收與 EPS 推導仍有較高研究推估成分。';
  const productMixEvidence = sanitizeNarrativeText(
    `${caseLabel} 情境以 ${profile.mixLabel} 為核心變數，假設由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(seed.mixTarget)}%；${profile.volumeLabel} 與 ${profile.aspLabel} 需同步驗證，否則不會直接把 EPS 上修視為已成立。`,
  );
  const marketShareEvidence = sanitizeNarrativeText(
    marketSizingBridge ||
      `市場份額依據：研究推估以 ${profile.peerLabel} 可服務市場 ${seed.tamRange} 與公司既有營收結構推估，核心產品有效營收份額約 ${seed.marketShareRange}。`,
  );
  const multipleRationale = sanitizeNarrativeText(
    `倍數依據：本情境採用 ${formatNumberLocal(seed.targetPe)}x，需同時參考 ${profile.peerLabel} 常見區間與公司目前獲利品質；若 TTM PE 失真，則以 normalized / forward PE 為主。`,
  );
  return {
    customerExposure,
    transcriptEvidence,
    monthlyRevenueEvidence,
    productMixEvidence,
    marketShareEvidence,
    multipleRationale,
    evidenceBasis: uniqueNarrativeLines(
      [
        transcriptEvidence,
        monthlyRevenueEvidence,
        productMixEvidence,
        marketShareEvidence,
      ],
      4,
    ),
  } satisfies StockSpecificEvidenceBundle;
}

function buildScenarioEvidenceBundle(
  context: ValuationBridgeContext,
  profile: ValuationBridgeProfile,
  caseType: ValuationCaseView['caseType'],
  seed: StockSpecificBridgeSeed,
  marketSizingBridge: string | null,
) {
  return (
    buildSampleStockEvidenceBundle(context, caseType, seed) ||
    buildGenericEvidenceBundle(context, profile, caseType, seed, marketSizingBridge)
  );
}

function buildStockSpecificScenarioBridge(
  valuation: ValuationCaseView,
  context: ValuationBridgeContext,
  profile: ValuationBridgeProfile,
  caseSeed: StockSpecificBridgeSeed,
) {
  const rawTargetPrice = valuation.targetPrice ?? null;
  const currentPrice = context.currentPrice ?? null;
  const targetPrice = round(caseSeed.eps * caseSeed.targetPe, 2);
  const expectedReturnPct =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0
      ? round(((targetPrice - currentPrice) / currentPrice) * 100, 2)
      : null;
  const caseType = valuation.caseType;
  const caseLabel =
    caseType === 'base' ? '基本情境' : caseType === 'upside' ? '樂觀情境' : '悲觀 / 失效情境';
  const currentRevenueAnnual =
    context.revenueAnnual ??
    (context.monthlyRevenue != null && Number.isFinite(context.monthlyRevenue) && context.monthlyRevenue > 0 ? context.monthlyRevenue * 12 : null) ??
    caseSeed.baselineRevenueAnnual ??
    null;
  const currentGrossMargin =
    context.grossMargin != null && Number.isFinite(context.grossMargin) ? context.grossMargin : caseSeed.baselineGrossMarginPct ?? null;
  const currentOperatingMargin =
    context.operatingMargin != null && Number.isFinite(context.operatingMargin) ? context.operatingMargin : caseSeed.baselineOperatingMarginPct ?? null;
  const currentPeRatio =
    context.peRatio != null && Number.isFinite(context.peRatio) ? context.peRatio : caseSeed.baselinePeRatio ?? null;
  const currentPbRatio =
    context.pbRatio != null && Number.isFinite(context.pbRatio) ? context.pbRatio : caseSeed.baselinePbRatio ?? null;
  const operatingAssumptions = [
    { label: '可服務市場 TAM', value: `${caseSeed.tamRange}（研究推估）`, isEstimated: true },
    { label: '市場份額', value: `${caseSeed.marketShareRange}（研究推估）`, isEstimated: true },
    { label: profile.mixLabel, value: `${formatNumberLocal(profile.mixStart)}% -> ${formatNumberLocal(caseSeed.mixTarget)}%`, isEstimated: true },
    { label: '訂單能見度', value: `${caseSeed.orderVisibility}（研究推估）`, isEstimated: true },
    { label: '年化營收', value: `${formatNarrativeMoney(caseSeed.revenueAnnual)}（研究推估）`, isEstimated: true },
    { label: '毛利率', value: `${currentGrossMargin != null ? `${formatNumberLocal(currentGrossMargin)}% -> ` : ''}${formatNumberLocal(caseSeed.grossMarginPct)}%`, isEstimated: true },
    { label: '營益率', value: `${currentOperatingMargin != null ? `${formatNumberLocal(currentOperatingMargin)}% -> ` : ''}${formatNumberLocal(caseSeed.operatingMarginPct)}%`, isEstimated: true },
    { label: 'EPS', value: formatNumberLocal(caseSeed.eps), isEstimated: true },
    { label: '目標 PE', value: `${formatNumberLocal(caseSeed.targetPe)}x`, isEstimated: true },
  ];
  const marketSizingBridge = sanitizeNarrativeText(
    `研究推估：以 ${profile.peerLabel} 的可服務市場規模 ${caseSeed.tamRange} 估算，${context.symbol} 在核心產品鏈的有效營收份額約 ${caseSeed.marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(caseSeed.mixTarget)}%，這是本情境能否成立的第一個關鍵。`,
  );
  const evidenceBundle = buildScenarioEvidenceBundle(context, profile, caseType, caseSeed, marketSizingBridge);
  const revenueBridge = sanitizeNarrativeText(
    `${caseLabel}假設 ${caseSeed.orderVisibility}，在此條件下，高階產品 mix、出貨量與 ASP 一起推動年化營收約 ${formatNarrativeMoney(caseSeed.revenueAnnual)}。`,
  );
  const marginBridge = sanitizeNarrativeText(
    [
      `毛利率${currentGrossMargin != null ? `由 ${formatNumberLocal(currentGrossMargin)}% ` : ''}${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(caseSeed.grossMarginPct)}%`,
      `營益率${currentOperatingMargin != null ? `由 ${formatNumberLocal(currentOperatingMargin)}% ` : ''}${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(caseSeed.operatingMarginPct)}%`,
    ].join('，'),
  );
  const earningsBridge = sanitizeNarrativeText(
    `若以年化營收 ${formatNarrativeMoney(caseSeed.revenueAnnual)}、毛利率 ${formatNumberLocal(caseSeed.grossMarginPct)}%、營益率 ${formatNumberLocal(caseSeed.operatingMarginPct)}% 估算，稅後 EPS 約 ${formatNumberLocal(caseSeed.eps)}。`,
  );
  const multipleBridge = sanitizeNarrativeText(
    sentenceFromBridgeSegments(
      [
        currentPeRatio != null && Number.isFinite(currentPeRatio) && currentPeRatio > 0
          ? `目前市場給公司的 TTM PE 約 ${formatNumberLocal(currentPeRatio)}x`
          : null,
        currentPbRatio != null && Number.isFinite(currentPbRatio) && currentPbRatio > 0
          ? `PB 約 ${formatNumberLocal(currentPbRatio)}x`
          : null,
        `${profile.benchmarkText}；本情境採用 ${formatNumberLocal(caseSeed.targetPe)}x`,
        caseSeed.targetPe > (profile.benchmarkPeRange[0] + profile.benchmarkPeRange[1]) / 2
          ? '代表我們假設新產品與訂單能見度驗證較 Base 更順利，但仍未直接用市場最樂觀上緣。'
          : '代表我們仍保留對需求落地節奏與高評價持續性的折價。',
        evidenceBundle.multipleRationale,
      ],
      `${profile.benchmarkText}；本情境採用 ${formatNumberLocal(caseSeed.targetPe)}x。`,
    ),
  );
  const priceBridge = sanitizeNarrativeText(
    `以 ${formatNumberLocal(caseSeed.eps)} 元 EPS 搭配 ${formatNumberLocal(caseSeed.targetPe)}x forward PE，12 個月目標價約 ${formatMoney(targetPrice)}；對現價 ${expectedReturnPct != null ? formatSignedPctLocal(expectedReturnPct) : '空間待補'}。`,
  );
  const bridgeStatus = evaluateBridgeCompleteness({
    currentRevenueAnnual,
    projectedRevenueAnnual: caseSeed.revenueAnnual,
    currentGrossMargin,
    projectedGrossMargin: caseSeed.grossMarginPct,
    currentOperatingMargin,
    projectedOperatingMargin: caseSeed.operatingMarginPct,
    projectedEps: caseSeed.eps,
    targetPeRatio: caseSeed.targetPe,
    estimatedFields: caseSeed.estimatedFields || [],
  });
  return {
    driver: caseSeed.driverLabel || profile.driverLabel,
    operatingBridge: revenueBridge,
    revenueBridge: `年化營收推估約 ${formatNarrativeMoney(caseSeed.revenueAnnual)}。`,
    marginBridge,
    earningsBridge,
    multipleBridge,
    priceBridge: bridgeStatus.bridgeCompleteness === 'complete' ? priceBridge : null,
    benchmarkRange: `${formatNumberLocal(profile.benchmarkPeRange[0])}x–${formatNumberLocal(profile.benchmarkPeRange[1])}x`,
    revenueAnnual: caseSeed.revenueAnnual,
    grossMargin: caseSeed.grossMarginPct,
    operatingMargin: caseSeed.operatingMarginPct,
    eps: caseSeed.eps,
    targetPrice: bridgeStatus.bridgeCompleteness === 'complete' ? targetPrice : null,
    expectedReturnPct: bridgeStatus.bridgeCompleteness === 'complete' ? expectedReturnPct : null,
    currentPeRatio,
    currentPbRatio,
    targetPeRatio: caseSeed.targetPe,
    targetPbRatio: null,
    operatingAssumptions,
    financialBridge: [revenueBridge, marginBridge, earningsBridge].filter((item): item is string => Boolean(item)),
    bridgeCompleteness: bridgeStatus.bridgeCompleteness,
    insufficientBridgeReason: bridgeStatus.insufficientBridgeReason,
    estimatedFields: bridgeStatus.estimatedFields,
    rawTargetPrice: rawTargetPrice != null && Number.isFinite(rawTargetPrice) ? rawTargetPrice : null,
    marketSizingBridge,
    evidenceRefs: caseSeed.evidenceRefs,
    evidenceBasis: evidenceBundle.evidenceBasis,
    customerExposure: evidenceBundle.customerExposure,
    transcriptEvidence: evidenceBundle.transcriptEvidence,
    monthlyRevenueEvidence: evidenceBundle.monthlyRevenueEvidence,
    productMixEvidence: evidenceBundle.productMixEvidence,
    marketShareEvidence: evidenceBundle.marketShareEvidence,
  };
}

function inferValuationBridgeProfile(context: ValuationBridgeContext): ValuationBridgeProfile {
  const narrative = compactText([context.symbol, context.thesisTitle || '', context.thesisSummary || ''].join(' ')).toLowerCase();
  if (context.symbol === '2382') {
    return {
      driverLabel: 'AI server 機櫃與整機出貨放量，帶動產品組合與毛利率改善',
      peerLabel: 'AI server ODM / EMS',
      benchmarkPeRange: [16, 22],
      benchmarkText: 'AI server ODM 同業的 forward PE 多落在 16x–22x',
      volumeLabel: 'AI server 機櫃出貨',
      aspLabel: '高階整機 ASP',
      mixLabel: 'AI server 營收占比',
      mixStart: 28,
      mixTargets: { base: 38, upside: 45, invalidation: 30 },
      volumeGrowthTargets: { base: 18, upside: 28, invalidation: 6 },
      aspGrowthTargets: { base: 5, upside: 9, invalidation: 1 },
      grossMarginTargets: { base: 9.5, upside: 10.4, invalidation: 8.1 },
      operatingMarginTargets: { base: 5.4, upside: 6.2, invalidation: 3.8 },
      storyLines: [
        '市場現在交易的主線不是傳統伺服器，而是 AI server 訂單能見度是否真的延伸到 2027，並讓高階整機與 rack-level 產品的營收占比持續墊高。',
        '只要 AI server 產品組合繼續往上，廣達的毛利率與營益率改善速度就會快於營收成長，EPS 彈性也會比市場用舊框架想得更大。',
      ],
    };
  }
  if (context.symbol === '2454') {
    return {
      driverLabel: '旗艦 SoC mix 與高階 ASP 提升，帶動毛利率與 EPS 上修',
      peerLabel: '高階 IC 設計',
      benchmarkPeRange: [18, 24],
      benchmarkText: '高階 IC 設計同業的 forward PE 多落在 18x–24x',
      volumeLabel: '旗艦 SoC 出貨',
      aspLabel: '旗艦 SoC ASP',
      mixLabel: '高階產品營收占比',
      mixStart: 34,
      mixTargets: { base: 42, upside: 48, invalidation: 31 },
      volumeGrowthTargets: { base: 8, upside: 14, invalidation: -2 },
      aspGrowthTargets: { base: 6, upside: 12, invalidation: -3 },
      grossMarginTargets: { base: 49, upside: 51.5, invalidation: 44.5 },
      operatingMarginTargets: { base: 21, upside: 23.5, invalidation: 16.5 },
      storyLines: [
        '聯發科這段故事的關鍵不是單純手機復甦，而是旗艦 SoC、邊緣 AI 與新產品組合是否能讓 ASP 與毛利率一併上修。',
        '如果高階產品占比繼續往上，EPS 修復速度會比營收成長更快；但若市場先把這段樂觀預期全部反映在股價上，Base 目標價就會落後於現價。',
      ],
    };
  }
  if (context.symbol === '3008') {
    return {
      driverLabel: '旗艦手機潛望式鏡頭升規與 XR 光學模組放量，帶動 ASP 與獲利提升',
      peerLabel: '高階光學鏡頭 / XR 光學',
      benchmarkPeRange: [18, 24],
      benchmarkText: '高階光學鏡頭與 XR 光學同業的 forward PE 多落在 18x–24x',
      volumeLabel: '高階鏡頭模組出貨',
      aspLabel: '高階鏡頭 ASP',
      mixLabel: '高階鏡頭與 XR 營收占比',
      mixStart: 36,
      mixTargets: { base: 45, upside: 52, invalidation: 33 },
      volumeGrowthTargets: { base: 12, upside: 20, invalidation: 2 },
      aspGrowthTargets: { base: 8, upside: 12, invalidation: 1 },
      grossMarginTargets: { base: 60.5, upside: 62.5, invalidation: 56.5 },
      operatingMarginTargets: { base: 45, upside: 48, invalidation: 39 },
      storyLines: [
        '大立光這段故事的核心不是單純手機銷量，而是旗艦機鏡頭規格升級、潛望式鏡頭滲透率，以及 XR 光學模組能否把 ASP 與產品組合持續往上推。',
        '如果高階鏡頭與 XR 模組營收占比真的拉高，毛利率與營益率就不該維持原地踏步；估值也會更接近高階光學與新應用供應鏈，而不是傳統手機零組件。',
      ],
    };
  }
  if (context.symbol === '3450') {
    return {
      driverLabel: 'CPO / COS 封裝與雷射封測滲透率提升，帶動 ASP 與獲利結構轉型',
      peerLabel: 'CPO / 光通訊封裝',
      benchmarkPeRange: [35, 55],
      benchmarkText: 'CPO 與高速光模組供應鏈在題材發酵期的 forward PE 多落在 35x–55x',
      volumeLabel: 'CPO / COS 模組出貨',
      aspLabel: '光通訊封裝 ASP',
      mixLabel: 'CPO 與高速光模組營收占比',
      mixStart: 14,
      mixTargets: { base: 24, upside: 32, invalidation: 16 },
      volumeGrowthTargets: { base: 20, upside: 32, invalidation: 6 },
      aspGrowthTargets: { base: 10, upside: 18, invalidation: 2 },
      grossMarginTargets: { base: 35, upside: 40, invalidation: 28 },
      operatingMarginTargets: { base: 18, upside: 24, invalidation: 12 },
      storyLines: [
        '聯鈞的主線不是舊本業，而是 CPO / COS 封裝與 LD 封測是否真的承接到國際客戶訂單，讓高毛利光通訊業務變成新的獲利核心。',
        '如果 CPO 相關訂單與產品組合持續落地，市場對它的評價方式就會逐步轉向高速光通訊供應鏈，而不再只用過去的保守框架去看。',
      ],
    };
  }
  if (context.symbol === '2344') {
    return {
      driverLabel: '車規 NOR Flash 與 Specialty DRAM 補庫存回溫，帶動產品組合與獲利修復',
      peerLabel: 'Specialty 記憶體 / NOR Flash',
      benchmarkPeRange: [24, 32],
      benchmarkText: 'Specialty 記憶體與車規 NOR Flash 修復股的 normalized / forward PE 多落在 24x–32x',
      volumeLabel: '車規 / 工控記憶體出貨',
      aspLabel: 'Specialty 記憶體 ASP',
      mixLabel: '車規與高毛利 NOR Flash 營收占比',
      mixStart: 24,
      mixTargets: { base: 30, upside: 35, invalidation: 22 },
      volumeGrowthTargets: { base: 12, upside: 18, invalidation: 0 },
      aspGrowthTargets: { base: 6, upside: 12, invalidation: -4 },
      grossMarginTargets: { base: 24, upside: 27, invalidation: 18 },
      operatingMarginTargets: { base: 9, upside: 12, invalidation: 4 },
      storyLines: [
        '華邦電這段故事的重點不是整體記憶體景氣全面復甦，而是車規 NOR Flash 與 Specialty DRAM 補庫存是否讓高毛利產品組合回升，帶動毛利率與營益率從低基期修復。',
        '只要車規與工控需求回來、且高毛利產品占比上升，市場對它的評價就會從一般循環 DRAM 股轉向 Specialty 記憶體修復股，normalized PE 也會高於純 commodity memory 框架。',
      ],
    };
  }
  if (context.symbol === '2337') {
    return {
      driverLabel: '高毛利 eMMC / MLC 供需缺口擴大，帶動 ASP 與產品組合改善',
      peerLabel: '儲存 / 記憶體',
      benchmarkPeRange: [10, 13],
      benchmarkText: '傳統記憶體同業景氣上行時多落在 10x–13x，但若市場把它視為供需缺口與轉型題材，倍數會高於一般循環股',
      volumeLabel: '儲存位元出貨',
      aspLabel: 'ASP / Gb',
      mixLabel: '高毛利產品占比',
      mixStart: 26,
      mixTargets: { base: 34, upside: 40, invalidation: 22 },
      volumeGrowthTargets: { base: 10, upside: 18, invalidation: -5 },
      aspGrowthTargets: { base: 7, upside: 14, invalidation: -6 },
      grossMarginTargets: { base: 28, upside: 33, invalidation: 18 },
      operatingMarginTargets: { base: 10, upside: 14, invalidation: 2 },
      storyLines: [
        '旺宏這段故事的核心不是一般景氣循環，而是 MLC / 低容量 eMMC 供給退場後，公司是否能吃下結構性缺口，讓 ASP 與高毛利產品占比持續上升。',
        '只要供需缺口沒有被快速填補，毛利率與 EPS 的彈性就可能顯著高於目前市場對傳統記憶體股的預期，估值方法也會更接近轉型題材而不是單純景氣股。',
      ],
    };
  }
  if (context.symbol === '2330') {
    return {
      driverLabel: 'AI 晶圓代工與 CoWoS / 先進封裝產能擴張，帶動 ASP 與獲利韌性提升',
      peerLabel: '先進製程晶圓代工 / 先進封裝',
      benchmarkPeRange: [18, 24],
      benchmarkText: '先進製程晶圓代工與先進封裝受惠股的 normalized / forward PE 多落在 18x–24x',
      volumeLabel: '先進製程 wafer 出貨',
      aspLabel: '先進製程 ASP',
      mixLabel: '3nm / 5nm 與先進封裝營收占比',
      mixStart: 18,
      mixTargets: { base: 24, upside: 30, invalidation: 16 },
      volumeGrowthTargets: { base: 9, upside: 14, invalidation: 2 },
      aspGrowthTargets: { base: 5, upside: 9, invalidation: 0 },
      grossMarginTargets: { base: 54.5, upside: 56.5, invalidation: 50.5 },
      operatingMarginTargets: { base: 43.8, upside: 45.8, invalidation: 39.5 },
      storyLines: [
        '台積電這段故事的重點不是成熟製程景氣，而是 AI 加速器、客製化 ASIC 與 CoWoS / SoIC 先進封裝需求是否持續高於市場原先預期，讓先進節點 ASP 與產能利用率維持在高檔。',
        '只要 3nm / 5nm 與先進封裝營收占比繼續上升，毛利率與營益率就會比市場只看總營收成長更有韌性，估值方法也應更接近高品質先進製程供應鏈，而不是單純景氣循環股。',
      ],
    };
  }
  if (context.symbol === '2382' || /ai server|伺服器|機櫃|odm|rack|csp|雲端客戶/.test(narrative)) {
    return {
      driverLabel: 'AI server 機櫃與整機出貨放量，帶動產品組合與毛利率改善',
      peerLabel: 'AI server ODM / EMS',
      benchmarkPeRange: [16, 22],
      benchmarkText: 'AI server ODM 同業的 forward PE 多落在 16x–22x',
      volumeLabel: 'AI server 機櫃出貨',
      aspLabel: '高階整機 ASP',
      mixLabel: 'AI server 營收占比',
      mixStart: 28,
      mixTargets: { base: 38, upside: 45, invalidation: 30 },
      volumeGrowthTargets: { base: 18, upside: 28, invalidation: 6 },
      aspGrowthTargets: { base: 5, upside: 9, invalidation: 1 },
      grossMarginTargets: { base: 9.5, upside: 10.4, invalidation: 8.1 },
      operatingMarginTargets: { base: 5.4, upside: 6.2, invalidation: 3.8 },
      storyLines: [
        '市場現在交易的主線不是傳統伺服器，而是 AI server 訂單能見度是否真的延伸到 2027，並讓高階整機與 rack-level 產品的營收占比持續墊高。',
        '只要 AI server 產品組合繼續往上，廣達的毛利率與營益率改善速度就會快於營收成長，EPS 彈性也會比市場用舊框架想得更大。',
      ],
    };
  }
  if (context.symbol === '2454' || /soc|手機|旗艦|edge ai|邊緣 ai|晶片|ic design/.test(narrative)) {
    return {
      driverLabel: '旗艦 SoC mix 與高階 ASP 提升，帶動毛利率與 EPS 上修',
      peerLabel: '高階 IC 設計',
      benchmarkPeRange: [18, 24],
      benchmarkText: '高階 IC 設計同業的 forward PE 多落在 18x–24x',
      volumeLabel: '旗艦 SoC 出貨',
      aspLabel: '旗艦 SoC ASP',
      mixLabel: '高階產品營收占比',
      mixStart: 34,
      mixTargets: { base: 42, upside: 48, invalidation: 31 },
      volumeGrowthTargets: { base: 8, upside: 14, invalidation: -2 },
      aspGrowthTargets: { base: 6, upside: 12, invalidation: -3 },
      grossMarginTargets: { base: 49, upside: 51.5, invalidation: 44.5 },
      operatingMarginTargets: { base: 21, upside: 23.5, invalidation: 16.5 },
      storyLines: [
        '聯發科這段故事的關鍵不是單純手機復甦，而是旗艦 SoC、邊緣 AI 與新產品組合是否能讓 ASP 與毛利率一併上修。',
        '如果高階產品占比繼續往上，EPS 修復速度會比營收成長更快；但若市場先把這段樂觀預期全部反映在股價上，Base 目標價就會落後於現價。',
      ],
    };
  }
  if (context.symbol === '3008' || /鏡頭|光學|潛望|xr|vision pro|camera/.test(narrative)) {
    return {
      driverLabel: '旗艦手機潛望式鏡頭升規與 XR 光學模組放量，帶動 ASP 與獲利提升',
      peerLabel: '高階光學鏡頭 / XR 光學',
      benchmarkPeRange: [18, 24],
      benchmarkText: '高階光學鏡頭與 XR 光學同業的 forward PE 多落在 18x–24x',
      volumeLabel: '高階鏡頭模組出貨',
      aspLabel: '高階鏡頭 ASP',
      mixLabel: '高階鏡頭與 XR 營收占比',
      mixStart: 36,
      mixTargets: { base: 45, upside: 52, invalidation: 33 },
      volumeGrowthTargets: { base: 12, upside: 20, invalidation: 2 },
      aspGrowthTargets: { base: 8, upside: 12, invalidation: 1 },
      grossMarginTargets: { base: 60.5, upside: 62.5, invalidation: 56.5 },
      operatingMarginTargets: { base: 45, upside: 48, invalidation: 39 },
      storyLines: [
        '高階光學的重點是規格升級能不能把單機 ASP、鏡頭顆數與產品 mix 一起往上推，而不只是單看出貨量。',
        '如果高階鏡頭與 XR 光學占比提升，毛利率與 EPS 彈性就會高於市場對傳統手機鏡頭股的預期。',
      ],
    };
  }
  if (context.symbol === '3450' || /cpo|cos|光通訊|800g|雷射|broadcom/.test(narrative)) {
    return {
      driverLabel: 'CPO / COS 封裝與雷射封測滲透率提升，帶動 ASP 與獲利結構轉型',
      peerLabel: 'CPO / 光通訊封裝',
      benchmarkPeRange: [35, 55],
      benchmarkText: 'CPO 與高速光模組供應鏈在題材發酵期的 forward PE 多落在 35x–55x',
      volumeLabel: 'CPO / COS 模組出貨',
      aspLabel: '光通訊封裝 ASP',
      mixLabel: 'CPO 與高速光模組營收占比',
      mixStart: 14,
      mixTargets: { base: 24, upside: 32, invalidation: 16 },
      volumeGrowthTargets: { base: 20, upside: 32, invalidation: 6 },
      aspGrowthTargets: { base: 10, upside: 18, invalidation: 2 },
      grossMarginTargets: { base: 35, upside: 40, invalidation: 28 },
      operatingMarginTargets: { base: 18, upside: 24, invalidation: 12 },
      storyLines: [
        'CPO 供應鏈的核心不是短期題材，而是公司能不能真的把新訂單轉成可持續放大的高毛利營收。',
        '只要 CPO / COS 與高速光模組占比拉升，評價方式就會更像成長轉型股，而不是舊本業的線性外推。',
      ],
    };
  }
  if (context.symbol === '2337' || /emmc|nand|flash|ssd|記憶體|mlc|tlc|儲存/.test(narrative)) {
    return {
      driverLabel: '高毛利 eMMC / MLC 供需缺口擴大，帶動 ASP 與產品組合改善',
      peerLabel: '儲存 / 記憶體',
      benchmarkPeRange: [10, 13],
      benchmarkText: '傳統記憶體同業景氣上行時多落在 10x–13x，但若市場把它視為供需缺口與轉型題材，倍數會高於一般循環股',
      volumeLabel: '儲存位元出貨',
      aspLabel: 'ASP / Gb',
      mixLabel: '高毛利產品占比',
      mixStart: 26,
      mixTargets: { base: 34, upside: 40, invalidation: 22 },
      volumeGrowthTargets: { base: 10, upside: 18, invalidation: -5 },
      aspGrowthTargets: { base: 7, upside: 14, invalidation: -6 },
      grossMarginTargets: { base: 28, upside: 33, invalidation: 18 },
      operatingMarginTargets: { base: 10, upside: 14, invalidation: 2 },
      storyLines: [
        '旺宏這段故事的核心不是一般景氣循環，而是 MLC / 低容量 eMMC 供給退場後，公司是否能吃下結構性缺口，讓 ASP 與高毛利產品占比持續上升。',
        '只要供需缺口沒有被快速填補，毛利率與 EPS 的彈性就可能顯著高於目前市場對傳統記憶體股的預期，估值方法也會更接近轉型題材而不是單純景氣股。',
      ],
    };
  }
  return {
    driverLabel: '營收動能與產品組合改善，帶動 EPS 與估值上修',
    peerLabel: '同產業成長股',
    benchmarkPeRange: [15, 20],
    benchmarkText: '同產業成長股的 forward PE 通常落在 15x–20x',
    volumeLabel: '核心產品出貨',
    aspLabel: '產品 ASP',
    mixLabel: '高毛利產品占比',
    mixStart: 22,
    mixTargets: { base: 28, upside: 33, invalidation: 19 },
    volumeGrowthTargets: { base: 8, upside: 14, invalidation: -3 },
    aspGrowthTargets: { base: 4, upside: 8, invalidation: -2 },
    grossMarginTargets: { base: 22, upside: 26, invalidation: 16 },
    operatingMarginTargets: { base: 8, upside: 11, invalidation: 4 },
    storyLines: [
      '這家公司現在交易的主線，是核心產品出貨與產品組合改善能不能延續到未來幾季，讓營收與獲利雙雙上修。',
      '如果毛利率與營益率同步墊高，市場通常會願意用更高的 forward PE / PB 重新定價，反之就會回到保守區間。',
    ],
  };
}

function assumptionNumber(rawAssumptions: Record<string, unknown>, key: string) {
  const value = toFiniteNumber(rawAssumptions[key], Number.NaN);
  return Number.isFinite(value) ? value : null;
}

function bridgePctText(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value > 0 ? '+' : ''}${formatNumberLocal(value)}%`;
}

function benchmarkSentence(pe: number | null, profile: ValuationBridgeProfile, pbRatio: number | null | undefined) {
  if (pe == null || !Number.isFinite(pe)) return profile.benchmarkText;
  const [low, high] = profile.benchmarkPeRange;
  const midpoint = round((low + high) / 2, 1);
  const peSentence =
    pe > high + 2
      ? `${profile.benchmarkText}；本輪使用 ${formatNumberLocal(pe)}x，已高於常見區間上緣 ${formatNumberLocal(high)}x，等同把轉型/供需缺口成功率一併計入`
      : pe < low - 1
        ? `${profile.benchmarkText}；本輪僅使用 ${formatNumberLocal(pe)}x，低於常見區間下緣 ${formatNumberLocal(low)}x，反映市場仍保守看待這段成長能否落地`
        : Math.abs(pe - midpoint) <= 1
          ? `${profile.benchmarkText}；本輪採用 ${formatNumberLocal(pe)}x，位在 ${formatNumberLocal(low)}x–${formatNumberLocal(high)}x 區間中位，代表我們沒有直接用最保守的 ${formatNumberLocal(low)}x，也不預設樂觀上緣 ${formatNumberLocal(high)}x 會完全實現`
          : pe >= midpoint
            ? `${profile.benchmarkText}；本輪採用 ${formatNumberLocal(pe)}x，略靠近上緣 ${formatNumberLocal(high)}x，代表成長落地與資金願意提前交易的假設都比 Base 更積極`
            : `${profile.benchmarkText}；本輪採用 ${formatNumberLocal(pe)}x，略靠近下緣 ${formatNumberLocal(low)}x，代表我們仍保留對需求驗證與評價擴張節奏的折價`;
  if (pbRatio != null && Number.isFinite(pbRatio) && pbRatio > 0) {
    return `${peSentence}。目前股價淨值比約 ${formatNumberLocal(pbRatio)}x。`;
  }
  return `${peSentence}。`;
}

function buildMarketSizingBridge(
  caseType: ValuationCaseView['caseType'],
  context: ValuationBridgeContext,
  profile: ValuationBridgeProfile,
  synthesized: { revenueAnnual: number | null | undefined },
) {
  const mixTo = profile.mixTargets[caseType];
  const annualRevenue = synthesized.revenueAnnual ?? context.revenueAnnual ?? null;
  const productRevenue =
    annualRevenue != null && Number.isFinite(annualRevenue) ? annualRevenue * (mixTo / 100) : null;
  const estimatedTag = '研究推估';

  if (context.symbol === '2382') {
    const marketSizeRange =
      caseType === 'upside' ? '約 NT$5.6–6.0 兆' : caseType === 'base' ? '約 NT$5.0–5.4 兆' : '約 NT$4.6–4.9 兆';
    const marketShareRange =
      caseType === 'upside' ? '16%–17%' : caseType === 'base' ? '14%–15%' : '12%–13%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據公司法說持續提到 AI server 比重上升、Meta / Microsoft / Google 等 hyperscaler 新一代機櫃拉貨節奏，以及目前月營收 run-rate 已明顯高於傳統 server 週期，我們以 2026 全球 AI server ODM / rack 可服務市場規模 ${marketSizeRange} 估算，廣達在 hyperscaler ODM 鏈的有效接單份額約 ${marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應 AI 相關年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  if (context.symbol === '2454') {
    const marketSizeRange =
      caseType === 'upside' ? '約 NT$4,000–4,400 億' : caseType === 'base' ? '約 NT$3,500–4,000 億' : '約 NT$3,000–3,300 億';
    const marketShareRange =
      caseType === 'upside' ? '46%–48%' : caseType === 'base' ? '40%–42%' : '34%–36%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據旗艦 SoC 世代升級、端側 AI 功能增加、Wi-Fi 7 與車用 SoC 新品放量節奏，我們以 2026 高階 Android / edge AI SoC 可服務市場規模 ${marketSizeRange} 估算，聯發科在旗艦與準旗艦 SoC 的營收份額約 ${marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應高階產品年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  if (context.symbol === '3008') {
    const marketSizeRange =
      caseType === 'upside' ? '約 NT$1,250–1,350 億' : caseType === 'base' ? '約 NT$1,100–1,200 億' : '約 NT$980–1,040 億';
    const marketShareRange =
      caseType === 'upside' ? '28%–30%' : caseType === 'base' ? '24%–26%' : '20%–22%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據 iPhone / Android 旗艦鏡頭規格升級、潛望式鏡頭滲透率提升，以及 XR 光學模組仍在驗證中的新品曲線，我們以 2026 旗艦手機高階鏡頭、潛望式鏡頭與 XR 光學模組可服務市場規模 ${marketSizeRange} 估算，大立光在高階光學鏈的有效營收份額約 ${marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應高階光學年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  if (context.symbol === '3450') {
    const marketSizeRange =
      caseType === 'upside' ? '約 NT$260–320 億' : caseType === 'base' ? '約 NT$210–250 億' : '約 NT$160–190 億';
    const marketShareRange =
      caseType === 'upside' ? '8%–10%' : caseType === 'base' ? '6%–8%' : '4%–5%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據 AOC / COS 封裝與 LD 封測產能擴張、800G / 1.6T 滲透率提升，以及 Broadcom 相關高速光互連題材的訂單驗證節奏，我們以 2027 CPO / COS 封裝與高速光模組可服務市場規模 ${marketSizeRange} 估算，聯鈞在 COS 封裝、LD 封測與相關模組鏈的有效營收份額約 ${marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應高毛利光通訊年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  if (context.symbol === '2337') {
    const marketSizeRange =
      caseType === 'upside' ? '約 74,000–78,000M Gb' : caseType === 'base' ? '約 71,000–74,000M Gb' : '約 63,000–67,000M Gb';
    const marketShareRange =
      caseType === 'upside' ? '55%–58%' : caseType === 'base' ? '約 51%' : '35%–40%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據 Samsung / SK hynix / Kioxia / Micron 逐步退出 MLC NAND、低容量 eMMC 長尾需求轉單，以及公司在 MLC / TLC eMMC 的供應位置，我們以 2027 低容量 eMMC / MLC 長尾需求 ${marketSizeRange} 估算，旺宏可承接約 ${marketShareRange} 的供應份額。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應高毛利產品年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  if (context.symbol === '2330') {
    const marketSizeRange =
      caseType === 'upside' ? '約 NT$1.55–1.70 兆' : caseType === 'base' ? '約 NT$1.35–1.50 兆' : '約 NT$1.05–1.20 兆';
    const marketShareRange =
      caseType === 'upside' ? '54%–58%' : caseType === 'base' ? '48%–52%' : '40%–44%';
    return sanitizeNarrativeText(
      `${estimatedTag}：依據公司法說對 AI 需求延續、CoWoS / SoIC 先進封裝擴產、以及先進節點 ASP 韌性的說法，我們以 AI 加速器相關先進製程 wafer 與先進封裝可服務市場 ${marketSizeRange} 估算，台積電在這段高階製程與封裝鏈的有效營收份額約 ${marketShareRange}。${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%，對應 AI 與先進節點相關年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
    );
  }

  return sanitizeNarrativeText(
    `${estimatedTag}：以 ${profile.peerLabel} 的可服務市場與公司既有營收結構推估，${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回到' : '提升到'} ${formatNumberLocal(mixTo)}%。若 ${profile.volumeLabel} 與 ${profile.aspLabel} 按本情境推進，對應核心產品年化營收約 ${formatNarrativeMoney(productRevenue)}。`,
  );
}

function relativeBridgeDelta(current: number | null | undefined, next: number | null | undefined) {
  if (current == null || next == null) return null;
  if (!Number.isFinite(current) || !Number.isFinite(next)) return null;
  const base = Math.max(Math.abs(current), 0.0001);
  return Math.abs(next - current) / base;
}

function buildBridgeDerivedEps(params: {
  currentRevenueAnnual: number | null;
  projectedRevenueAnnual: number | null;
  currentGrossMargin: number | null;
  projectedGrossMargin: number | null;
  currentOperatingMargin: number | null;
  projectedOperatingMargin: number | null;
  currentEps: number | null;
}) {
  const {
    currentRevenueAnnual,
    projectedRevenueAnnual,
    currentGrossMargin,
    projectedGrossMargin,
    currentOperatingMargin,
    projectedOperatingMargin,
    currentEps,
  } = params;
  if (currentEps == null || !Number.isFinite(currentEps) || currentEps <= 0) return null;
  if (currentRevenueAnnual == null || projectedRevenueAnnual == null || currentRevenueAnnual <= 0 || projectedRevenueAnnual <= 0) return null;

  const revenueFactor = projectedRevenueAnnual / currentRevenueAnnual;
  const currentProfitability =
    currentOperatingMargin != null && Number.isFinite(currentOperatingMargin) && currentOperatingMargin > 0
      ? currentOperatingMargin
      : currentGrossMargin != null && Number.isFinite(currentGrossMargin) && currentGrossMargin > 0
        ? currentGrossMargin
        : null;
  const projectedProfitability =
    projectedOperatingMargin != null && Number.isFinite(projectedOperatingMargin) && projectedOperatingMargin > 0
      ? projectedOperatingMargin
      : projectedGrossMargin != null && Number.isFinite(projectedGrossMargin) && projectedGrossMargin > 0
        ? projectedGrossMargin
        : null;
  const profitabilityFactor =
    currentProfitability != null && projectedProfitability != null && currentProfitability > 0
      ? projectedProfitability / currentProfitability
      : 1;

  if (!Number.isFinite(revenueFactor) || revenueFactor <= 0) return null;
  if (!Number.isFinite(profitabilityFactor) || profitabilityFactor <= 0) return null;
  if (Math.abs(revenueFactor - 1) < 0.03 && Math.abs(profitabilityFactor - 1) < 0.03) return null;

  return round(currentEps * revenueFactor * profitabilityFactor, 2);
}

function evaluateBridgeCompleteness(params: {
  currentRevenueAnnual: number | null;
  projectedRevenueAnnual: number | null;
  currentGrossMargin: number | null;
  projectedGrossMargin: number | null;
  currentOperatingMargin: number | null;
  projectedOperatingMargin: number | null;
  projectedEps: number | null;
  targetPeRatio: number | null;
  estimatedFields: string[];
}) {
  const {
    currentRevenueAnnual,
    projectedRevenueAnnual,
    currentGrossMargin,
    projectedGrossMargin,
    currentOperatingMargin,
    projectedOperatingMargin,
    projectedEps,
    targetPeRatio,
    estimatedFields,
  } = params;
  const revenueDelta = relativeBridgeDelta(currentRevenueAnnual, projectedRevenueAnnual);
  const grossMarginDelta = relativeBridgeDelta(currentGrossMargin, projectedGrossMargin);
  const operatingMarginDelta = relativeBridgeDelta(currentOperatingMargin, projectedOperatingMargin);
  const hasMeaningfulBridge =
    (revenueDelta != null && revenueDelta >= 0.04) ||
    (grossMarginDelta != null && grossMarginDelta >= 0.03) ||
    (operatingMarginDelta != null && operatingMarginDelta >= 0.03);

  let insufficientBridgeReason: string | null = null;
  if (projectedRevenueAnnual == null || !Number.isFinite(projectedRevenueAnnual) || projectedRevenueAnnual <= 0) {
    insufficientBridgeReason = '缺少可驗證的營收橋接，暫時不能把這個情境當成正式目標價。';
  } else if (projectedEps == null || !Number.isFinite(projectedEps) || projectedEps <= 0) {
    insufficientBridgeReason = '缺少可驗證的 EPS 推導，暫時不能把這個情境當成正式目標價。';
  } else if (targetPeRatio == null || !Number.isFinite(targetPeRatio) || targetPeRatio <= 0) {
    insufficientBridgeReason = '缺少可解釋的目標估值倍數，暫時不能把這個情境當成正式目標價。';
  } else if (!hasMeaningfulBridge) {
    insufficientBridgeReason = '營收、毛利率與營益率沒有形成足夠變化，暫時不能支持新的目標價。';
  }

  return {
    bridgeCompleteness: insufficientBridgeReason ? ('insufficient' as const) : ('complete' as const),
    insufficientBridgeReason,
    estimatedFields: unique(estimatedFields.filter(Boolean)),
  };
}

function assumptionItemsAlignWithProfile(
  assumptions: Array<{ label: string; value: string; isEstimated?: boolean }>,
  profile: ValuationBridgeProfile,
) {
  const markers = [profile.volumeLabel, profile.aspLabel, profile.mixLabel].map((item) => sanitizeNarrativeText(item)).filter(Boolean);
  if (markers.length === 0 || assumptions.length === 0) return false;
  const labels = assumptions.map((item) => sanitizeNarrativeText(item.label));
  return markers.some((marker) => labels.some((label) => label.includes(marker) || marker.includes(label)));
}

function bridgeTextAlignsWithProfile(value: string | null | undefined, profile: ValuationBridgeProfile) {
  const clean = sanitizeNarrativeText(value);
  if (!clean) return false;
  const markers = [profile.driverLabel, profile.peerLabel, profile.volumeLabel, profile.aspLabel, profile.mixLabel]
    .map((item) => sanitizeNarrativeText(item))
    .filter(Boolean);
  return markers.some((marker) => clean.includes(marker) || marker.includes(clean));
}

function buildSyntheticScenarioBridge(
  valuation: ValuationCaseView,
  context: ValuationBridgeContext,
  profile: ValuationBridgeProfile,
  assumptions: Array<{ label: string; value: string; isEstimated?: boolean }>,
) {
  const rawAssumptions = (valuation.assumptions || {}) as Record<string, unknown>;
  const specificSeed = stockSpecificBridgeSeed(context.symbol, valuation.caseType) ?? generatedStockSpecificSeedFromOverride(context.symbol, valuation.caseType, profile);
  if (specificSeed) {
    return buildStockSpecificScenarioBridge(valuation, context, profile, specificSeed);
  }
  const alignedRawAssumptions = assumptionItemsAlignWithProfile(assumptions, profile);
  const sourceAssumptions = alignedRawAssumptions ? rawAssumptions : {};
  const rawTargetPrice = valuation.targetPrice ?? null;
  const currentRevenueAnnual =
    context.revenueAnnual ??
    (context.monthlyRevenue != null && Number.isFinite(context.monthlyRevenue) && context.monthlyRevenue > 0
      ? context.monthlyRevenue * 12
      : null);
  const caseType = valuation.caseType;
  const caseLabel =
    caseType === 'base' ? '基本情境' : caseType === 'upside' ? '樂觀情境' : '悲觀 / 失效情境';
  const scenarioPe =
    assumptionNumber(sourceAssumptions, 'pe') ??
    (caseType === 'base'
      ? round((profile.benchmarkPeRange[0] + profile.benchmarkPeRange[1]) / 2, 1)
      : caseType === 'upside'
        ? profile.benchmarkPeRange[1]
        : Math.max(profile.benchmarkPeRange[0] - 2, 6));
  const scenarioRevenueLift =
    caseType === 'base'
      ? 1 + profile.volumeGrowthTargets.base / 100 * 0.55 + profile.aspGrowthTargets.base / 100 * 0.22
      : caseType === 'upside'
        ? 1 + profile.volumeGrowthTargets.upside / 100 * 0.58 + profile.aspGrowthTargets.upside / 100 * 0.26
        : 1 + profile.volumeGrowthTargets.invalidation / 100 * 0.45 + profile.aspGrowthTargets.invalidation / 100 * 0.18;
  const alignedRevenueAnnual =
    assumptionNumber(sourceAssumptions, 'revenue_annual') ?? (currentRevenueAnnual != null ? currentRevenueAnnual * scenarioRevenueLift : null);
  const currentGrossMargin = context.grossMargin != null && Number.isFinite(context.grossMargin) ? context.grossMargin : null;
  const currentOperatingMargin = context.operatingMargin != null && Number.isFinite(context.operatingMargin) ? context.operatingMargin : null;
  const grossMargin =
    assumptionNumber(sourceAssumptions, 'gross_margin_pct') ??
    (context.grossMargin != null && Number.isFinite(context.grossMargin) && context.grossMargin > 0
      ? caseType === 'base'
        ? Math.max(context.grossMargin, profile.grossMarginTargets.base)
        : caseType === 'upside'
          ? Math.max(context.grossMargin, profile.grossMarginTargets.upside)
          : Math.min(context.grossMargin, profile.grossMarginTargets.invalidation)
      : profile.grossMarginTargets[caseType]);
  const operatingMargin =
    assumptionNumber(sourceAssumptions, 'operating_margin_pct') ??
    (context.operatingMargin != null && Number.isFinite(context.operatingMargin)
      ? caseType === 'base'
        ? Math.max(context.operatingMargin, profile.operatingMarginTargets.base)
        : caseType === 'upside'
          ? Math.max(context.operatingMargin, profile.operatingMarginTargets.upside)
          : Math.min(context.operatingMargin, profile.operatingMarginTargets.invalidation)
      : profile.operatingMarginTargets[caseType]);
  const explicitEps = assumptionNumber(sourceAssumptions, 'eps');
  const eps =
    explicitEps ??
    buildBridgeDerivedEps({
      currentRevenueAnnual,
      projectedRevenueAnnual: alignedRevenueAnnual,
      currentGrossMargin,
      projectedGrossMargin: grossMargin,
      currentOperatingMargin,
      projectedOperatingMargin: operatingMargin,
      currentEps: context.epsTtm != null && Number.isFinite(context.epsTtm) ? context.epsTtm : null,
    });
  const candidateDriver = compactText(valuation.driverLabel || sourceAssumptions.driver_label || sourceAssumptions.driver || '');
  const driver = candidateDriver && bridgeTextAlignsWithProfile(candidateDriver, profile) ? candidateDriver : profile.driverLabel;
  const mixTo = profile.mixTargets[caseType];
  const volumeGrowth = profile.volumeGrowthTargets[caseType];
  const aspGrowth = profile.aspGrowthTargets[caseType];
  const operatingBridge = sanitizeNarrativeText(
    caseType === 'invalidation'
      ? `${caseLabel}假設 ${profile.volumeLabel}${volumeGrowth >= 0 ? '僅年增' : '轉為年減'} ${bridgePctText(volumeGrowth) || formatNumberLocal(volumeGrowth)}，${profile.aspLabel}${aspGrowth >= 0 ? '僅小幅回升' : '轉為下滑'} ${bridgePctText(aspGrowth) || formatNumberLocal(aspGrowth)}，${profile.mixLabel}回落到 ${formatNumberLocal(mixTo)}%。毛利率${currentGrossMargin != null ? `由 ${formatNumberLocal(currentGrossMargin)}% 回到 ${formatNumberLocal(grossMargin)}%` : `約 ${formatNumberLocal(grossMargin)}%`}。`
      : `${caseLabel}假設 ${profile.volumeLabel}年增 ${bridgePctText(volumeGrowth) || formatNumberLocal(volumeGrowth)}，${profile.aspLabel}${bridgePctText(aspGrowth) || formatNumberLocal(aspGrowth)}，${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% 提升到 ${formatNumberLocal(mixTo)}%。毛利率${currentGrossMargin != null ? `由 ${formatNumberLocal(currentGrossMargin)}% 提升到 ${formatNumberLocal(grossMargin)}%` : `約 ${formatNumberLocal(grossMargin)}%`}。`,
  );
  const earningsBridge = sanitizeNarrativeText(
    [
      alignedRevenueAnnual != null ? `在此前提下，年化營收估約 ${formatNarrativeMoney(alignedRevenueAnnual)}` : null,
      operatingMargin != null
        ? currentOperatingMargin != null
          ? `營益率由 ${formatNumberLocal(currentOperatingMargin)}% ${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(operatingMargin)}%`
          : `營益率約 ${formatNumberLocal(operatingMargin)}%`
        : null,
      eps != null ? `稅後 EPS 約 ${formatNumberLocal(eps)}` : null,
    ]
      .filter(Boolean)
      .join('，'),
  );
  const syntheticAssumptions =
    alignedRawAssumptions && assumptions.length > 0
      ? assumptions
      : [
          { label: profile.volumeLabel, value: bridgePctText(volumeGrowth) || formatNumberLocal(volumeGrowth), isEstimated: true },
          { label: profile.aspLabel, value: bridgePctText(aspGrowth) || formatNumberLocal(aspGrowth), isEstimated: true },
          { label: profile.mixLabel, value: `${formatNumberLocal(profile.mixStart)}% -> ${formatNumberLocal(mixTo)}%`, isEstimated: true },
          grossMargin != null ? { label: '毛利率', value: `${currentGrossMargin != null ? `${formatNumberLocal(currentGrossMargin)}% -> ` : ''}${formatNumberLocal(grossMargin)}%`, isEstimated: true } : null,
          operatingMargin != null ? { label: '營益率', value: `${currentOperatingMargin != null ? `${formatNumberLocal(currentOperatingMargin)}% -> ` : ''}${formatNumberLocal(operatingMargin)}%`, isEstimated: true } : null,
          eps != null ? { label: 'EPS', value: formatNumberLocal(eps), isEstimated: explicitEps == null } : null,
        ].filter((item): item is { label: string; value: string; isEstimated: boolean } => Boolean(item));
  const marketSizingBridge = sanitizeNarrativeText(
    `研究推估：以 ${profile.peerLabel} 的可服務市場推估 ${context.symbol} 的有效營收份額，${profile.mixLabel}由 ${formatNumberLocal(profile.mixStart)}% ${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(mixTo)}%，並把 ${profile.volumeLabel} 與 ${profile.aspLabel} 的變化一起納入。`,
  );
  const evidenceSeed: StockSpecificBridgeSeed = {
    driverLabel: driver,
    tamRange: marketSizingBridge,
    marketShareRange: '研究推估',
    orderVisibility:
      caseType === 'upside'
        ? `${profile.volumeLabel} 與 ${profile.aspLabel} 驗證優於 Base`
        : caseType === 'invalidation'
          ? `${profile.volumeLabel} 與 ${profile.aspLabel} 驗證不如預期`
          : `${profile.volumeLabel} 與 ${profile.aspLabel} 依既有 run-rate 緩步改善`,
    mixTarget: mixTo,
    revenueAnnual: alignedRevenueAnnual ?? 0,
    grossMarginPct: grossMargin ?? 0,
    operatingMarginPct: operatingMargin ?? 0,
    eps: eps ?? 0,
    targetPe: scenarioPe,
    evidenceRefs: [],
    estimatedFields: syntheticAssumptions.filter((item) => item.isEstimated).map((item) => item.label),
  };
  const evidenceBundle = buildScenarioEvidenceBundle(context, profile, caseType, evidenceSeed, marketSizingBridge);
  const multipleBridge = sanitizeNarrativeText(
    sentenceFromBridgeSegments(
      [benchmarkSentence(scenarioPe, profile, context.pbRatio), evidenceBundle.multipleRationale],
      benchmarkSentence(scenarioPe, profile, context.pbRatio),
    ),
  );
  const benchmarkRange = `${formatNumberLocal(profile.benchmarkPeRange[0])}x–${formatNumberLocal(profile.benchmarkPeRange[1])}x`;
  const bridgeStatus = evaluateBridgeCompleteness({
    currentRevenueAnnual,
    projectedRevenueAnnual: alignedRevenueAnnual,
    currentGrossMargin,
    projectedGrossMargin: grossMargin,
    currentOperatingMargin,
    projectedOperatingMargin: operatingMargin,
    projectedEps: eps,
    targetPeRatio: scenarioPe,
    estimatedFields: syntheticAssumptions.filter((item) => item.isEstimated).map((item) => item.label),
  });
  const targetPrice =
    bridgeStatus.bridgeCompleteness === 'complete' && eps != null && scenarioPe != null && Number.isFinite(scenarioPe) && scenarioPe > 0
      ? round(eps * scenarioPe, 2)
      : null;
  const priceBridge =
    targetPrice != null && eps != null && scenarioPe != null
      ? sanitizeNarrativeText(
          `以 ${formatNumberLocal(eps)} 元 EPS 搭配 ${formatNumberLocal(scenarioPe)}x forward PE，12 個月目標價約 ${formatMoney(targetPrice)}；對現價 ${bridgePctText(valuation.expectedReturnPct) || '空間待補'}。`,
        )
      : null;
  return {
    driver,
    operatingBridge,
    revenueBridge: alignedRevenueAnnual != null ? `年化營收推估約 ${formatNarrativeMoney(alignedRevenueAnnual)}。` : null,
    marginBridge:
      grossMargin != null || operatingMargin != null
        ? sanitizeNarrativeText(
            [
              grossMargin != null
                ? `毛利率${currentGrossMargin != null ? `由 ${formatNumberLocal(currentGrossMargin)}% ` : ''}${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(grossMargin)}%`
                : null,
              operatingMargin != null
                ? `營益率${currentOperatingMargin != null ? `由 ${formatNumberLocal(currentOperatingMargin)}% ` : ''}${caseType === 'invalidation' ? '回落到' : '提升到'} ${formatNumberLocal(operatingMargin)}%`
                : null,
            ]
              .filter(Boolean)
              .join('，'),
          )
        : null,
    earningsBridge,
    multipleBridge,
    priceBridge,
    benchmarkRange,
    revenueAnnual: alignedRevenueAnnual,
    grossMargin,
    operatingMargin,
    eps,
    targetPrice,
    expectedReturnPct:
      targetPrice != null && context.currentPrice != null && Number.isFinite(context.currentPrice) && context.currentPrice > 0
        ? round(((targetPrice - context.currentPrice) / context.currentPrice) * 100, 2)
        : null,
    currentPeRatio: context.peRatio,
    currentPbRatio: context.pbRatio,
    targetPeRatio: scenarioPe,
    targetPbRatio: null,
    operatingAssumptions: syntheticAssumptions,
    financialBridge: [operatingBridge, earningsBridge].filter((item): item is string => Boolean(item)),
    bridgeCompleteness: bridgeStatus.bridgeCompleteness,
    insufficientBridgeReason: bridgeStatus.insufficientBridgeReason,
    estimatedFields: bridgeStatus.estimatedFields,
    rawTargetPrice: rawTargetPrice != null && Number.isFinite(rawTargetPrice) ? rawTargetPrice : null,
    marketSizingBridge,
    evidenceRefs: [] as string[],
    evidenceBasis: evidenceBundle.evidenceBasis,
    customerExposure: evidenceBundle.customerExposure,
    transcriptEvidence: evidenceBundle.transcriptEvidence,
    monthlyRevenueEvidence: evidenceBundle.monthlyRevenueEvidence,
    productMixEvidence: evidenceBundle.productMixEvidence,
    marketShareEvidence: evidenceBundle.marketShareEvidence,
  };
}

function buildValuationBridgeSummary(valuationCases: ValuationCaseView[], context: ValuationBridgeContext): {
  valuationBridge: DeepDiveValuationBridge | null;
  scenarioBridges: DeepDiveScenarioNarrative[];
  priceTargetRationale: string | null;
} {
  const scenarioOrder: Array<ValuationCaseView['caseType']> = ['base', 'upside', 'invalidation'];
  const byType = new Map(valuationCases.map((item) => [item.caseType, item]));
  const profile = inferValuationBridgeProfile(context);
  const scenarioBridges: DeepDiveScenarioNarrative[] = scenarioOrder
    .map((caseType) => byType.get(caseType))
    .filter((item): item is ValuationCaseView => Boolean(item))
    .map((valuation) => {
      const rawAssumptions = normalizedAssumptionItems(valuation);
      const rawOperatingBridge = sentenceFromBridgeSegments(
        [sanitizeNarrativeText((valuation.assumptions || {}).operating_bridge)],
        '',
      ) || null;
      const rawEarningsBridge = sentenceFromBridgeSegments(
        [
          sanitizeNarrativeText((valuation.assumptions || {}).earnings_bridge),
          ...normalizedBridgeSentences((valuation.assumptions || {}).financial_bridge),
        ],
        '',
      ) || null;
      const rawFinancialBridge = normalizedBridgeSentences((valuation.assumptions || {}).financial_bridge);
      const rawMultipleBridge =
        sentenceFromBridgeSegments(
          [
            sanitizeNarrativeText((valuation.assumptions || {}).multiple_bridge),
          ],
          '',
        ) || null;
      const caseLabel =
        valuation.caseType === 'base' ? '基本情境' : valuation.caseType === 'upside' ? '樂觀情境' : '悲觀 / 失效情境';
      const rawPriceBridge = sanitizeNarrativeText((valuation.assumptions || {}).price_bridge);
      const synthesized = buildSyntheticScenarioBridge(valuation, context, profile, rawAssumptions);
      const useRawAssumptions = assumptionItemsAlignWithProfile(rawAssumptions, profile);
      const assumptions = useRawAssumptions ? rawAssumptions : synthesized.operatingAssumptions;
      const assumptionPhrases = assumptions.map((item) => `${item.label}${item.isEstimated ? '約' : ''}${item.value}`);
      const operatingBridge =
        rawOperatingBridge && bridgeTextAlignsWithProfile(rawOperatingBridge, profile)
          ? rawOperatingBridge
          : synthesized.operatingBridge;
      const earningsBridge =
        rawEarningsBridge && bridgeTextAlignsWithProfile(rawEarningsBridge, profile)
          ? rawEarningsBridge
          : synthesized.earningsBridge;
      const financialBridge =
        rawFinancialBridge.length > 0 && rawFinancialBridge.some((item) => bridgeTextAlignsWithProfile(item, profile))
          ? rawFinancialBridge
          : synthesized.financialBridge;
      const multipleBridge =
        rawMultipleBridge && bridgeTextAlignsWithProfile(rawMultipleBridge, profile)
          ? rawMultipleBridge
          : synthesized.multipleBridge;
      const priceBridge = synthesized.priceBridge || (synthesized.bridgeCompleteness === 'complete' ? rawPriceBridge : null);
      const marketSizingBridge =
        synthesized.marketSizingBridge ||
        buildMarketSizingBridge(valuation.caseType, context, profile, {
          revenueAnnual: synthesized.revenueAnnual ?? null,
        });
      const rawDriverLabel = compactText(valuation.driverLabel || (valuation.assumptions || {}).driver_label || '');
      const driverLabel =
        rawDriverLabel && bridgeTextAlignsWithProfile(rawDriverLabel, profile) ? rawDriverLabel : synthesized.driver || null;
      const scenarioTargetPrice = synthesized.targetPrice ?? null;
      const scenarioExpectedReturnPct =
        scenarioTargetPrice != null && context.currentPrice != null && Number.isFinite(context.currentPrice) && context.currentPrice > 0
          ? round(((scenarioTargetPrice - context.currentPrice) / context.currentPrice) * 100, 2)
          : null;
      return {
        key: valuation.caseType,
        label: caseLabel,
        narrative: buildScenarioBridgeNarrative(
          caseLabel,
          driverLabel,
          operatingBridge,
          earningsBridge,
          assumptionPhrases.length > 0 ? assumptionPhrases : synthesized.operatingAssumptions.map((item) => `${item.label}${item.isEstimated ? '約' : ''}${item.value}`),
          financialBridge,
          multipleBridge,
          scenarioTargetPrice,
          scenarioExpectedReturnPct,
          priceBridge,
        ),
        targetPrice: scenarioTargetPrice,
        expectedReturnPct: scenarioExpectedReturnPct,
        assumptions: (assumptionPhrases.length > 0
          ? assumptionPhrases
          : synthesized.operatingAssumptions.map((item) => `${item.label}${item.isEstimated ? '約' : ''}${item.value}`))
          .map(valuationAssumptionPhrase)
          .filter((item): item is string => Boolean(item)),
        driverLabel,
        driver: driverLabel,
        marketSizingBridge,
        operatingBridge,
        revenueBridge: synthesized.revenueBridge || null,
        marginBridge: synthesized.marginBridge || null,
        earningsBridge,
        operatingAssumptions: assumptions.length > 0 ? assumptions : synthesized.operatingAssumptions,
        financialBridge,
        multipleBridge,
        priceBridge,
        projectedRevenueAnnual: synthesized.revenueAnnual ?? null,
        projectedGrossMarginPct: synthesized.grossMargin ?? null,
        projectedOperatingMarginPct: synthesized.operatingMargin ?? null,
        projectedEps: synthesized.eps ?? null,
        currentPeRatio: synthesized.currentPeRatio ?? null,
        currentPbRatio: synthesized.currentPbRatio ?? null,
        targetPeRatio: synthesized.targetPeRatio ?? null,
        targetPbRatio: synthesized.targetPbRatio ?? null,
        benchmarkMultipleRange: synthesized.benchmarkRange ?? null,
        evidenceRefs: uniqueNarrativeLines(synthesized.evidenceRefs || [], 5),
        evidenceBasis: uniqueNarrativeLines(synthesized.evidenceBasis || [], 5),
        customerExposure: synthesized.customerExposure || null,
        transcriptEvidence: synthesized.transcriptEvidence || null,
        monthlyRevenueEvidence: synthesized.monthlyRevenueEvidence || null,
        productMixEvidence: synthesized.productMixEvidence || null,
        marketShareEvidence: synthesized.marketShareEvidence || null,
        bridgeCompleteness: synthesized.bridgeCompleteness,
        insufficientBridgeReason: synthesized.insufficientBridgeReason,
        estimatedFields: synthesized.estimatedFields,
      };
    });

  const baseScenario = scenarioBridges.find((item) => item.key === 'base') || scenarioBridges[0] || null;
  const baseValuation = byType.get('base') || null;

  const baseValuationStoryDrivers = normalizedBridgeSentences((baseValuation?.assumptions || {}).story_drivers).filter((item) =>
    bridgeTextAlignsWithProfile(item, profile),
  );
  const baseValuationBridgeSummary = sanitizeNarrativeText(baseValuation?.bridgeSummary);
  const alignedBaseBridgeSummary =
    baseValuationBridgeSummary && bridgeTextAlignsWithProfile(baseValuationBridgeSummary, profile) ? baseValuationBridgeSummary : null;
  const alignedBaseBridgeSummaryFromAssumption = sanitizeNarrativeText((baseValuation?.assumptions || {}).bridge_summary);
  const alignedBaseAssumptionBridgeSummary =
    alignedBaseBridgeSummaryFromAssumption && bridgeTextAlignsWithProfile(alignedBaseBridgeSummaryFromAssumption, profile)
      ? alignedBaseBridgeSummaryFromAssumption
      : null;

  const valuationBridge = baseScenario
    ? {
        driverLabel: baseScenario.driverLabel || profile.driverLabel || null,
        storyDrivers: narrativeCandidates(
          [
            ...baseValuationStoryDrivers,
            profile.storyLines[0],
            profile.storyLines[1],
          ],
          3,
        ),
        operatingAssumptions: baseScenario.operatingAssumptions || [],
        financialBridge: baseScenario.financialBridge || [],
        multipleBridge: baseScenario.multipleBridge || profile.benchmarkText,
        priceBridge: sentenceFromBridgeSegments(
          [
            bridgeTextAlignsWithProfile(sanitizeNarrativeText((baseValuation?.assumptions || {}).price_bridge), profile)
              ? sanitizeNarrativeText((baseValuation?.assumptions || {}).price_bridge)
              : null,
            baseScenario.priceBridge,
          ],
          baseScenario.narrative,
        ),
        bridgeSummary: sentenceFromBridgeSegments(
          [
            alignedBaseBridgeSummary,
            alignedBaseAssumptionBridgeSummary,
            baseScenario.operatingBridge,
            baseScenario.earningsBridge,
            baseScenario.multipleBridge,
            baseScenario.priceBridge,
          ],
          baseScenario.narrative,
        ),
      }
    : null;

  const priceTargetRationale = valuationBridge
    ? sentenceFromBridgeSegments(
        [
          valuationBridge.bridgeSummary,
          scenarioBridges.find((item) => item.key === 'base')?.priceBridge || null,
          scenarioBridges.find((item) => item.key === 'base')?.multipleBridge || null,
          scenarioBridges.find((item) => item.key === 'upside')?.priceBridge || null,
        ],
        valuationBridge.priceBridge || '',
      )
    : null;

  return { valuationBridge, scenarioBridges, priceTargetRationale };
}

function uniqueNarrativeLines(items: Array<string | null | undefined>, limit = 4) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    const clean = sanitizeNarrativeText(item);
    if (!clean) continue;
    if (clean.includes('<a href') || clean.includes('http://') || clean.includes('https://')) continue;
    if (/^Threads?:/i.test(clean)) continue;
    if (/(上車|下車我會通知|閉眼買|漲停|衝衝衝|我幹|強勢黑馬|放心買|膽大吃四方|買車買房)/.test(clean)) continue;
    const normalized = normalizeNarrativeSentence(clean);
    if (!normalized) continue;
    if (seen.has(normalized)) continue;
    seen.add(normalized);
    lines.push(normalized);
    if (lines.length >= limit) break;
  }
  return lines;
}

function findAssumptionValue(
  assumptions: Array<{ label: string; value: string; isEstimated?: boolean }> | null | undefined,
  matcher: RegExp,
) {
  const matched = (assumptions || []).find((item) => matcher.test(item.label));
  return matched?.value || null;
}

function buildValuationBridgeBullet(
  scenario: DeepDiveScenarioNarrative | null | undefined,
  fallback: string | null | undefined,
) {
  if (!scenario) return normalizeNarrativeSentence(fallback);
  const mixValue = findAssumptionValue(scenario.operatingAssumptions, /(占比|mix)/i);
  const grossMarginValue = findAssumptionValue(scenario.operatingAssumptions, /毛利率/i);
  const epsValue = findAssumptionValue(scenario.operatingAssumptions, /^EPS$/i);
  const peValue = findAssumptionValue(scenario.operatingAssumptions, /(目標 PE|估值倍數|PE)/i);
  const targetText = scenario.targetPrice == null ? null : formatMoney(scenario.targetPrice);
  const pctText = scenario.expectedReturnPct == null ? null : formatSignedPctLocal(scenario.expectedReturnPct);
  const bullet = sentenceFromBridgeSegments(
    [
      scenario.driver,
      scenario.operatingBridge,
      scenario.earningsBridge,
      mixValue ? `高毛利/高階產品占比推估為 ${mixValue}` : null,
      grossMarginValue ? `毛利率推估 ${grossMarginValue}` : null,
      epsValue ? `EPS 推估 ${epsValue}` : null,
      peValue ? `評價倍數約 ${peValue}` : null,
      targetText ? `對應目標價 ${targetText}${pctText ? `，相對現價 ${pctText}` : ''}` : null,
    ],
    fallback || '',
  );
  return normalizeNarrativeSentence(bullet || fallback);
}

function buildPeerComparisonSentence(
  baseScenario: DeepDiveScenarioNarrative | null | undefined,
  valuationBridge: DeepDiveValuationBridge | null | undefined,
  fundamentalPeRatio: number | null | undefined,
  fundamentalPbRatio: number | null | undefined,
) {
  const currentMultipleSentence = buildCurrentMultipleReferenceSentence(fundamentalPeRatio, fundamentalPbRatio);
  const baseMultiple = normalizeNarrativeSentence(baseScenario?.multipleBridge || valuationBridge?.multipleBridge || null);
  const sentence = sentenceFromBridgeSegments(
    [
      currentMultipleSentence,
      baseMultiple,
    ],
    baseMultiple || '',
  );
  return normalizeNarrativeSentence(sentence);
}

function scenarioBridgeEvidenceRefs(
  sources: Array<{ summary?: string | null; sourceName?: string | null; sourceType?: string | null }>,
  limit = 3,
) {
  return uniqueNarrativeLines(
    sources.map((item) => {
      const summary = normalizeNarrativeSentence(item.summary || null);
      if (!summary) return null;
      const prefix = compactText(item.sourceName || '') || compactText(item.sourceType || '');
      return prefix ? `${prefix}：${summary}` : summary;
    }),
    limit,
  );
}

function buildValuationCaseDetail(
  label: string,
  scenario: DeepDiveScenarioNarrative | null | undefined,
  valuationBridge: DeepDiveValuationBridge | null | undefined,
  evidenceRefs: string[],
  isEstimated: boolean,
): DeepDiveValuationCaseDetail | null {
  if (!scenario) return null;
  const bridgeCompleteness = scenario.bridgeCompleteness || 'insufficient';
  const insufficientBridgeReason =
    scenario.insufficientBridgeReason ||
    (bridgeCompleteness === 'insufficient' ? '研究推估不足，暫不產出正式目標價。' : null);
  const mergedEvidenceRefs = uniqueNarrativeLines([...(scenario.evidenceRefs || []), ...evidenceRefs], 5);
  return {
    label,
    driver: scenario.driver || valuationBridge?.driverLabel || null,
    bridgeCompleteness,
    insufficientBridgeReason,
    estimatedFields: scenario.estimatedFields || [],
    marketSizingBridge: scenario.marketSizingBridge || null,
    revenueBridge: scenario.revenueBridge || scenario.operatingBridge || null,
    marginBridge: scenario.marginBridge || null,
    earningsBridge: scenario.earningsBridge || null,
    multipleBridge: scenario.multipleBridge || valuationBridge?.multipleBridge || null,
    priceBridge: bridgeCompleteness === 'complete' ? scenario.priceBridge || valuationBridge?.priceBridge || null : null,
    benchmarkRange: scenario.benchmarkMultipleRange || null,
    currentPeRatio: scenario.currentPeRatio ?? null,
    currentPbRatio: scenario.currentPbRatio ?? null,
    targetPeRatio: scenario.targetPeRatio ?? null,
    targetPbRatio: scenario.targetPbRatio ?? null,
    projectedRevenueAnnual: scenario.projectedRevenueAnnual ?? null,
    projectedGrossMarginPct: scenario.projectedGrossMarginPct ?? null,
    projectedOperatingMarginPct: scenario.projectedOperatingMarginPct ?? null,
    projectedEps: scenario.projectedEps ?? null,
    targetPrice: bridgeCompleteness === 'complete' ? scenario.targetPrice ?? null : null,
    expectedReturnPct: bridgeCompleteness === 'complete' ? scenario.expectedReturnPct ?? null : null,
    assumptions: scenario.assumptions || [],
    sharedBasisRefs: [],
    deltaAssumptions: [],
    hasIndependentDelta: label !== '情境估值框架',
    achievementChecklist: [],
    evidenceRefs: mergedEvidenceRefs,
    evidenceBasis: scenario.evidenceBasis || [],
    sourceRefs: [],
    customerExposure: scenario.customerExposure || null,
    transcriptEvidence: scenario.transcriptEvidence || null,
    monthlyRevenueEvidence: scenario.monthlyRevenueEvidence || null,
    productMixEvidence: scenario.productMixEvidence || null,
    marketShareEvidence: scenario.marketShareEvidence || null,
    isEstimated,
  };
}

function normalizedNarrativeSet(items: Array<string | null | undefined>) {
  const set = new Set<string>();
  for (const item of items) {
    const normalized = normalizeNarrativeSentence(item);
    if (!normalized) continue;
    set.add(normalized);
  }
  return set;
}

function cleanEvidenceDirectionPrefix(value: string | null | undefined) {
  const clean = sanitizeNarrativeText(value);
  if (!clean) return null;
  return normalizeNarrativeSentence(
    clean.replace(/^(支撐\s*Base|支撐\s*情境|削弱\s*Base|削弱\s*情境|失效情境)\s*[：:｜|\-]\s*/i, ''),
  );
}

function makeSourceCitationRef(params: {
  id: string;
  label: string;
  sourceType: string;
  sourceName: string;
  sourceUrl?: string | null;
  asOf?: string | null;
  evidenceClass?: string | null;
}): DeepDiveSourceCitationRef {
  return {
    id: params.id,
    label: sanitizeNarrativeText(params.label) || params.id,
    sourceType: params.sourceType,
    sourceName: sanitizeNarrativeText(params.sourceName) || params.sourceType,
    sourceUrl: params.sourceUrl || null,
    asOf: params.asOf || null,
    evidenceClass: params.evidenceClass || 'research_basis',
  };
}

function buildSourceCitationMap(params: {
  latestEvidence?: DeepDiveLatestFact[];
  freshSources?: SourceCoverageView[];
  sourceAppendix?: Array<{ label: string; items: SourceCoverageView[] }>;
}) {
  const refs: DeepDiveSourceCitationRef[] = [];
  const seen = new Set<string>();
  const push = (ref: Omit<DeepDiveSourceCitationRef, 'id'>) => {
    const key = `${ref.sourceType}::${ref.sourceName}::${ref.sourceUrl || ''}::${ref.asOf || ''}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const next = makeSourceCitationRef({ ...ref, id: `S${refs.length + 1}` });
    refs.push(next);
    return next;
  };

  // Prefer externally auditable sources as S1/S2. Internal bridge snapshots can
  // support traceability, but should never crowd out official / financial refs.
  for (const item of params.freshSources || []) {
    push({
      label: item.sourceName,
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      asOf: item.sourceTimestamp,
      evidenceClass: item.directHit === false ? 'indirect_source' : 'direct_hit',
    });
  }
  for (const group of params.sourceAppendix || []) {
    for (const item of group.items || []) {
      push({
        label: item.sourceName,
        sourceType: item.sourceType,
        sourceName: item.sourceName,
        sourceUrl: item.sourceUrl,
        asOf: item.sourceTimestamp,
        evidenceClass: group.label,
      });
    }
  }
  for (const item of params.latestEvidence || []) {
    push({
      label: item.label,
      sourceType: item.sourceType,
      sourceName: item.sourceName,
      sourceUrl: item.sourceUrl,
      asOf: item.asOf,
      evidenceClass: item.supportCase === 'scenario' ? 'scenario_evidence' : 'base_evidence',
    });
  }

  if (!refs.some((item) => isExternalCitationRef(item))) {
    refs.push(
      makeSourceCitationRef({
        id: `S${refs.length + 1}`,
        label: '官方資料入口',
        sourceType: 'official',
        sourceName: 'MOPS / TWSE',
        sourceUrl: 'https://mops.twse.com.tw/',
        asOf: null,
        evidenceClass: 'external_source_pending',
      }),
    );
  }
  return refs.slice(0, 8);
}

function isExternalCitationRef(ref: DeepDiveSourceCitationRef | null | undefined) {
  if (!ref) return false;
  return ref.sourceType !== 'system' && Boolean(ref.sourceUrl || ref.sourceType === 'official' || ref.sourceType === 'financial' || ref.sourceType === 'broker_report');
}

function isVerifiedExternalCitationRef(ref: DeepDiveSourceCitationRef | null | undefined) {
  if (!ref) return false;
  if (ref.evidenceClass === 'external_source_pending') return false;
  const type = String(ref.sourceType || '').toLowerCase();
  return (
    ['official', 'financial', 'broker_report', 'public_research', 'industry', 'company_event'].some((candidate) => type.includes(candidate)) &&
    Boolean(ref.sourceUrl || type === 'official' || type === 'financial' || type === 'broker_report')
  );
}

function assumptionSourceFromRef(ref: DeepDiveSourceCitationRef): DeepDiveValuationAssumptionLedgerItem['sourceTypes'][number] {
  const type = String(ref.sourceType || '').toLowerCase();
  const name = String(ref.sourceName || '').toLowerCase();
  const evidenceClass = String(ref.evidenceClass || '').toLowerCase();
  if (type.includes('broker') || name.includes('券商') || name.includes('投顧') || name.includes('factset')) {
    return evidenceClass.includes('manual') || evidenceClass.includes('pdf') ? 'imported_pdf' : 'broker';
  }
  if (type.includes('official') || type.includes('financial') || type.includes('company_event')) return 'official';
  if (type.includes('news') || type.includes('public_research') || type.includes('industry')) return 'news_summary';
  if (type.includes('threads') || type.includes('instagram') || type.includes('telegram') || type.includes('kol') || type.includes('podcast') || type.includes('youtube')) {
    return 'social';
  }
  return 'internal_estimate';
}

function sourceRefsForLedger(refs: DeepDiveSourceCitationRef[] | undefined, fallback: DeepDiveValuationAssumptionLedgerItem['sourceTypes'] = ['internal_estimate']) {
  const sourceRefs = refs || [];
  const verifiedRefs = sourceRefs.filter(isVerifiedExternalCitationRef);
  const sourceTypes = unique(
    (verifiedRefs.length > 0 ? verifiedRefs : sourceRefs)
      .map(assumptionSourceFromRef),
  ) as DeepDiveValuationAssumptionLedgerItem['sourceTypes'];
  const finalSourceTypes = sourceTypes.length > 0 ? sourceTypes : fallback;
  const trustLevel =
    finalSourceTypes.every((item) => item === 'internal_estimate')
      ? ('internal_only' as const)
      : finalSourceTypes.includes('internal_estimate')
        ? ('mixed' as const)
        : ('verified' as const);
  return {
    sourceTypes: finalSourceTypes,
    trustLevel,
    sourceRefIds: verifiedRefs.length > 0 ? citationIds(verifiedRefs) : citationIds(sourceRefs),
  };
}

function formatLedgerMoney(value: number | null | undefined) {
  if (value == null || !Number.isFinite(Number(value))) return null;
  return formatNarrativeMoney(Number(value));
}

function buildCaseAssumptionLedger(
  caseLabel: 'Base' | '情境',
  detail: DeepDiveValuationCaseDetail | null | undefined,
): DeepDiveValuationAssumptionLedgerItem[] {
  if (!detail) return [];
  const trust = sourceRefsForLedger(detail.sourceRefs, detail.isEstimated ? ['internal_estimate'] : ['official']);
  const sourceRefs = trust.sourceRefIds;
  const make = (
    key: DeepDiveValuationAssumptionLedgerItem['key'],
    label: string,
    value: string | null,
    formula: string | null,
    note: string | null = null,
  ): DeepDiveValuationAssumptionLedgerItem => ({
    caseLabel,
    key,
    label,
    value,
    formula,
    sourceTypes: trust.sourceTypes,
    trustLevel: trust.trustLevel,
    sourceRefs,
    note,
  });
  return [
    make('revenue', '預估營收', formatLedgerMoney(detail.projectedRevenueAnnual), detail.revenueBridge),
    make('gross_margin', '毛利率', detail.projectedGrossMarginPct == null ? null : `${formatNumberLocal(detail.projectedGrossMarginPct)}%`, detail.marginBridge),
    make('operating_margin', '營益率', detail.projectedOperatingMarginPct == null ? null : `${formatNumberLocal(detail.projectedOperatingMarginPct)}%`, detail.marginBridge),
    make('eps', '預估 EPS', detail.projectedEps == null ? null : formatNumberLocal(detail.projectedEps), detail.earningsBridge),
    make('multiple', '目標 PE/PB', detail.targetPeRatio == null && detail.targetPbRatio == null ? null : `PE ${detail.targetPeRatio == null ? '待補' : `${formatNumberLocal(detail.targetPeRatio)}x`} / PB ${detail.targetPbRatio == null ? '待補' : `${formatNumberLocal(detail.targetPbRatio)}x`}`, detail.multipleBridge),
    make(
      'target_price',
      '目標價公式',
      detail.targetPrice == null ? null : formatMoney(detail.targetPrice),
      detail.projectedEps != null && detail.targetPeRatio != null ? `${formatNumberLocal(detail.projectedEps)} EPS × ${formatNumberLocal(detail.targetPeRatio)}x PE` : detail.priceBridge,
      detail.bridgeCompleteness === 'insufficient' ? detail.insufficientBridgeReason : null,
    ),
  ];
}

function buildValuationAssumptionLedger(params: {
  baseCaseDetail?: DeepDiveValuationCaseDetail | null;
  scenarioCaseDetail?: DeepDiveValuationCaseDetail | null;
}): DeepDiveValuationAssumptionLedgerItem[] {
  return [
    ...buildCaseAssumptionLedger('Base', params.baseCaseDetail),
    ...buildCaseAssumptionLedger('情境', params.scenarioCaseDetail),
  ];
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? round((sorted[mid - 1] + sorted[mid]) / 2, 2) : round(sorted[mid], 2);
}

function buildBrokerConsensus(brokerViews: BrokerView[]): DeepDiveBrokerConsensus | null {
  if (!brokerViews.length) return null;
  const targets = brokerViews
    .map((item) => item.targetPrice)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const forwardEpsValues = brokerViews
    .map((item) => item.forwardEps)
    .filter((value): value is number => value != null && Number.isFinite(value) && value > 0);
  const usBrokerCount = brokerViews.filter((item) => item.isUsBroker).length;
  const ratingDistribution = brokerViews.reduce<Record<string, number>>((acc, item) => {
    const key = compactText(item.rating || '未提供評等') || '未提供評等';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  const latestReportDate =
    brokerViews
      .map((item) => item.reportDate)
      .filter((value): value is string => Boolean(value))
      .sort()
      .pop() || null;
  const latestMs = latestReportDate ? new Date(`${latestReportDate}T00:00:00+08:00`).getTime() : Number.NaN;
  const stale = !Number.isFinite(latestMs) || Date.now() - latestMs > 90 * 24 * 60 * 60 * 1000;
  const freshnessStatus = brokerViews.length === 0 ? 'missing' : stale ? 'stale' : 'fresh';
  const verifiedForBase =
    !stale &&
    (targets.length >= 2 ||
      (targets.length >= 1 && (usBrokerCount > 0 || forwardEpsValues.length > 0)) ||
      brokerViews.some((item) => ['imported_pdf', 'manual_csv', 'broker_summary', 'news_summary', 'public_summary'].includes(String(item.sourceMode || ''))));
  const summary =
    targets.length > 0
      ? `外資/券商公開來源共 ${brokerViews.length} 筆，其中美系/外資 ${usBrokerCount} 筆；目標價區間 ${formatMoney(Math.min(...targets))}–${formatMoney(Math.max(...targets))}，中位數 ${formatMoney(median(targets))}。`
      : `外資/券商公開來源共 ${brokerViews.length} 筆，但尚未取得可用目標價。`;
  return {
    sourceCount: brokerViews.length,
    usBrokerCount,
    latestReportDate,
    minTargetPrice: targets.length > 0 ? Math.min(...targets) : null,
    medianTargetPrice: median(targets),
    maxTargetPrice: targets.length > 0 ? Math.max(...targets) : null,
    forwardEpsLow: forwardEpsValues.length > 0 ? Math.min(...forwardEpsValues) : null,
    forwardEpsMedian: median(forwardEpsValues),
    forwardEpsHigh: forwardEpsValues.length > 0 ? Math.max(...forwardEpsValues) : null,
    freshnessStatus,
    verifiedForBase,
    ratingDistribution,
    stale,
    summary: stale ? `${summary} 最新券商資料已超過 90 天，僅作輔助。` : verifiedForBase ? `${summary} 可作 Base 估值佐證之一。` : `${summary} 仍需更多交叉驗證才可支撐 Base。`,
  };
}

function benchmarkHighFromText(value: string | null | undefined) {
  const text = compactText(value);
  if (!text) return null;
  const matches = [...text.matchAll(/([0-9]+(?:\.[0-9]+)?)\s*x/gi)].map((match) => Number(match[1])).filter(Number.isFinite);
  return matches.length > 0 ? Math.max(...matches) : null;
}

function evaluateValuationConfidenceGate(params: {
  baseCaseDetail?: DeepDiveValuationCaseDetail | null;
  sharedVerifiedBasis?: DeepDiveSharedVerifiedBasis | null;
  brokerConsensus?: DeepDiveBrokerConsensus | null;
  currentPrice?: number | null;
}): DeepDiveValuationConfidenceGate {
  const base = params.baseCaseDetail || null;
  if (!base || base.bridgeCompleteness !== 'complete') {
    return {
      status: 'insufficient_verified_basis',
      reason: base?.insufficientBridgeReason || 'Base 橋接尚未完整，不能作正式目標價。',
      baseTargetFormal: false,
      externalCitationCount: 0,
      brokerCitationCount: 0,
      officialCitationCount: 0,
    };
  }
  const refs = [...(base.sourceRefs || []), ...(params.sharedVerifiedBasis?.sourceRefs || [])];
  const verifiedRefs = refs.filter(isVerifiedExternalCitationRef);
  const brokerCitationCount = verifiedRefs.filter((ref) => assumptionSourceFromRef(ref) === 'broker' || assumptionSourceFromRef(ref) === 'imported_pdf').length;
  const officialCitationCount = verifiedRefs.filter((ref) => assumptionSourceFromRef(ref) === 'official').length;
  const externalCitationCount = verifiedRefs.length;
  const baseUpside = upsidePctFromTarget(params.currentPrice ?? null, base.targetPrice ?? null) ?? 0;
  const benchmarkHigh = benchmarkHighFromText(base.benchmarkRange || base.multipleBridge);
  const targetPeAbovePeer = base.targetPeRatio != null && benchmarkHigh != null && base.targetPeRatio > benchmarkHigh + 0.5;
  const hasBrokerConsensus = Boolean(params.brokerConsensus?.verifiedForBase || (params.brokerConsensus && params.brokerConsensus.sourceCount > 0 && !params.brokerConsensus.stale));
  const hasStrongExternal = officialCitationCount > 0 || brokerCitationCount > 0 || hasBrokerConsensus;
  const ledgerTrust = sourceRefsForLedger(base.sourceRefs, base.isEstimated ? ['internal_estimate'] : ['official']).trustLevel;

  if (containsUnverifiedCustomerEvidence(detailText(base.customerExposure, base.evidenceBasis, params.sharedVerifiedBasis?.customerExposure))) {
    return {
      status: 'insufficient_verified_basis',
      reason: 'Base 含未具名客戶/供應鏈映射，未取得官方、券商或具名來源前，不作正式目標價。',
      baseTargetFormal: false,
      externalCitationCount,
      brokerCitationCount,
      officialCitationCount,
    };
  }
  if (ledgerTrust === 'internal_only') {
    return {
      status: 'research_estimate_only',
      reason: 'Base 關鍵假設目前只有內部研究推估，缺外部來源註腳；先顯示為研究推估區間，不作正式目標價。',
      baseTargetFormal: false,
      externalCitationCount,
      brokerCitationCount,
      officialCitationCount,
    };
  }
  if ((baseUpside > 30 || targetPeAbovePeer) && !hasStrongExternal) {
    return {
      status: 'insufficient_verified_basis',
      reason:
        baseUpside > 30
          ? 'Base 空間超過 30%，但缺官方/券商/具名供應鏈來源支撐，先降級為研究推估。'
          : '目標 PE 高於同業區間上緣，但缺券商或官方證據支撐，先降級為研究推估。',
      baseTargetFormal: false,
      externalCitationCount,
      brokerCitationCount,
      officialCitationCount,
    };
  }
  return {
    status: 'verified',
    reason: null,
    baseTargetFormal: true,
    externalCitationCount,
    brokerCitationCount,
    officialCitationCount,
  };
}

function parsePeRange(value: string | null | undefined) {
  const matches = Array.from(String(value || '').matchAll(/([0-9]+(?:\.[0-9]+)?)\s*x/gi))
    .map((match) => Number(match[1]))
    .filter((item) => Number.isFinite(item) && item > 0);
  if (matches.length === 0) return { low: null, mid: null, high: null };
  const low = Math.min(...matches);
  const high = Math.max(...matches);
  return { low, mid: round((low + high) / 2, 2), high };
}

function buildForwardPeBridge(params: {
  currentPrice?: number | null;
  baseCaseDetail?: DeepDiveValuationCaseDetail | null;
}): DeepDiveForwardPeBridge {
  const base = params.baseCaseDetail || null;
  const forwardEps = base?.projectedEps != null && Number.isFinite(base.projectedEps) && base.projectedEps > 0 ? base.projectedEps : null;
  const currentForwardPe =
    params.currentPrice != null && forwardEps != null && params.currentPrice > 0 ? round(Number(params.currentPrice) / forwardEps, 2) : null;
  const targetForwardPe = base?.targetPeRatio != null && Number.isFinite(base.targetPeRatio) && base.targetPeRatio > 0 ? base.targetPeRatio : null;
  const formula =
    forwardEps != null && targetForwardPe != null
      ? `${formatNumberLocal(forwardEps)} forward EPS × ${formatNumberLocal(targetForwardPe)}x target forward PE = ${formatMoney(round(forwardEps * targetForwardPe, 2))}`
      : base?.priceBridge || null;
  const sourceRefs = citationIds((base?.sourceRefs || []).filter(isVerifiedExternalCitationRef));
  const status =
    !base
      ? 'missing_forward_eps'
      : base.priceBridge && !/EPS|PE|本益比|forward/i.test(base.priceBridge)
        ? 'non_pe_model'
        : forwardEps == null
          ? 'missing_forward_eps'
          : sourceRefs.length > 0
            ? 'verified'
            : 'estimated';
  const summary =
    status === 'verified'
      ? `Base 以 forward EPS ${formatNumberLocal(forwardEps)} 與目標 PE ${targetForwardPe == null ? '待補' : `${formatNumberLocal(targetForwardPe)}x`} 推導。`
      : status === 'estimated'
        ? 'Base 有 forward EPS / PE 公式，但來源仍以研究推估為主，不能單獨作正式推薦。'
        : status === 'non_pe_model'
          ? '本輪 Base 並非單純 PE 模型，需另看估值公式與來源。'
          : 'Base 缺可用 forward EPS，不能驗證 forward PE 推導。';
  return {
    currentForwardPe,
    targetForwardPe,
    forwardEps,
    targetPriceFormula: formula,
    sourceRefs,
    status,
    summary,
  };
}

function buildPeerValuationRange(baseCaseDetail?: DeepDiveValuationCaseDetail | null): DeepDivePeerValuationRange {
  const base = baseCaseDetail || null;
  const parsed = parsePeRange(base?.benchmarkRange || base?.multipleBridge);
  const adoptedPe = base?.targetPeRatio != null && Number.isFinite(base.targetPeRatio) ? base.targetPeRatio : null;
  const inRange = adoptedPe == null || parsed.low == null || parsed.high == null ? null : adoptedPe >= parsed.low - 0.1 && adoptedPe <= parsed.high + 0.1;
  const source = base?.benchmarkRange || base?.multipleBridge || null;
  return {
    lowPe: parsed.low,
    midPe: parsed.mid,
    highPe: parsed.high,
    adoptedPe,
    source,
    inRange,
    summary:
      parsed.low != null && parsed.high != null
        ? `同業/可比 forward PE 區間約 ${formatNumberLocal(parsed.low)}x–${formatNumberLocal(parsed.high)}x，本輪採用 ${adoptedPe == null ? '待補' : `${formatNumberLocal(adoptedPe)}x`}${inRange === false ? '，已超出區間需覆核。' : '。'}`
        : '同業 forward PE 區間待補；不可只用單一倍數作正式估值依據。',
  };
}

function buildValuationReviewFlags(params: {
  currentPrice?: number | null;
  baseCaseDetail?: DeepDiveValuationCaseDetail | null;
  scenarioCaseDetail?: DeepDiveValuationCaseDetail | null;
  gate?: DeepDiveValuationConfidenceGate | null;
  forwardPeBridge?: DeepDiveForwardPeBridge | null;
  peerValuationRange?: DeepDivePeerValuationRange | null;
}): DeepDiveValuationReviewFlag[] {
  const flags: DeepDiveValuationReviewFlag[] = [];
  const baseUpside = upsidePctFromTarget(params.currentPrice ?? null, params.baseCaseDetail?.targetPrice ?? null) ?? null;
  const scenarioUpside = upsidePctFromTarget(params.currentPrice ?? null, params.scenarioCaseDetail?.targetPrice ?? null) ?? null;
  if (baseUpside != null && baseUpside > 30) {
    flags.push({ code: 'base_upside_gt_30', severity: params.gate?.baseTargetFormal ? 'warning' : 'blocker', summary: `Base 空間 ${formatNumberLocal(baseUpside)}% 超過 30%，必須有官方/券商/具名來源支撐。` });
  }
  if (scenarioUpside != null && scenarioUpside > 100) {
    flags.push({ code: 'scenario_upside_gt_100', severity: 'warning', summary: `情境空間 ${formatNumberLocal(scenarioUpside)}% 超過 100%，只能列為上行 checklist，不能當正式 Base。` });
  }
  if (params.peerValuationRange?.inRange === false) {
    flags.push({ code: 'target_pe_above_peer', severity: 'blocker', summary: '目標 PE 超出同業區間，缺券商或產業 rerating 佐證前需覆核。' });
  }
  if (params.forwardPeBridge?.status === 'missing_forward_eps') {
    flags.push({ code: 'missing_forward_eps', severity: 'blocker', summary: '缺 forward EPS，無法驗證 EPS × PE 目標價公式。' });
  }
  if (params.gate?.status === 'research_estimate_only') {
    flags.push({ code: 'internal_estimate_only', severity: 'blocker', summary: params.gate.reason || 'Base 只有內部研究推估，不能作正式目標價。' });
  }
  return flags;
}

function buildForwardPeSignalFromBridge(bridge: DeepDiveForwardPeBridge | null | undefined): NonNullable<RecommendationCard['forwardPeSignal']> | null {
  if (!bridge) return null;
  return {
    currentForwardPe: bridge.currentForwardPe,
    targetForwardPe: bridge.targetForwardPe,
    forwardEps: bridge.forwardEps,
    status: bridge.status,
    summary: bridge.summary,
  };
}

function buildCrossThemeSignalsFromText(params: {
  symbol?: string | null;
  name?: string | null;
  text?: string | null;
  sourceRefs?: string[];
}): NonNullable<RecommendationCard['crossThemeSignals']> {
  const text = compactText(`${params.symbol || ''} ${params.name || ''} ${params.text || ''}`);
  const signals: NonNullable<RecommendationCard['crossThemeSignals']> = [];
  const add = (themeKey: string, label: string, pattern: RegExp, directOnly = false) => {
    if (!pattern.test(text)) return;
    signals.push({
      themeKey,
      label,
      evidenceLevel: directOnly ? 'direct_source' : 'inferred_watch',
      sourceRefs: params.sourceRefs || [],
      reason: directOnly ? `來源文字直接提到「${label}」相關題材。` : `依據公司產業與來源文字，列入「${label}」交叉觀察。`,
    });
  };
  add('optical-lens', '高階光學鏡頭', /大立光|3008|鏡頭|光學|潛望|lens|periscope|xr/i);
  add('smartphone-upgrade', '旗艦手機升規', /iphone|android|手機|旗艦|相機|鏡頭|三星/i);
  add('xr-optics', 'XR 光學', /vision pro|xr|ar|vr|頭戴|空間運算/i);
  add('optical-communication-watch', '光通訊交叉題材', /光通訊|光模組|cpo|800g|1\.6t|矽光|光互連/i, true);
  add('passive-components-mlcc', '被動元件 / MLCC', /mlcc|被動元件|電感|tlvr|鉭電容|晶片電阻/i, true);
  return signals;
}

function downgradeBaseCaseForConfidenceGate(baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined, gate: DeepDiveValuationConfidenceGate) {
  if (!baseCaseDetail || gate.baseTargetFormal) return;
  baseCaseDetail.bridgeCompleteness = 'insufficient';
  baseCaseDetail.insufficientBridgeReason = gate.reason || 'Base 缺外部驗證，暫不產出正式目標價。';
  baseCaseDetail.targetPrice = null;
  baseCaseDetail.expectedReturnPct = null;
  baseCaseDetail.priceBridge = null;
  baseCaseDetail.estimatedFields = unique([...baseCaseDetail.estimatedFields, 'external_verification']);
}

function latestExternalCitationTimestamp(refs: DeepDiveSourceCitationRef[], fallback: string | null) {
  const candidates = refs
    .filter((item) => isExternalCitationRef(item) && item.asOf)
    .map((item) => String(item.asOf))
    .sort((a, b) => b.localeCompare(a));
  return candidates[0] || fallback;
}

function firstCitationRefs(citationMap: DeepDiveSourceCitationRef[], preferredTypes: string[], limit = 2) {
  const external = citationMap.filter(isExternalCitationRef);
  const preferred = external.filter((item) => preferredTypes.includes(item.sourceType)).slice(0, limit);
  const fallback = external.slice(0, limit);
  return preferred.length > 0 ? preferred : fallback;
}

function citationIds(refs: Array<DeepDiveSourceCitationRef | null | undefined>) {
  return refs.map((item) => item?.id).filter((item): item is string => Boolean(item));
}

function appendCitationIds(sentence: string | null | undefined, refs: string[] | undefined) {
  const clean = normalizeNarrativeSentence(sentence);
  if (!clean) return null;
  const suffix = (refs || []).slice(0, 3).map((id) => `[${id}]`).join(' ');
  if (!suffix) return clean;
  if (refs?.some((id) => clean.includes(`[${id}]`))) return clean;
  return `${clean} ${suffix}`;
}

function inferCustomerEvidenceStatus(customerExposure: string | null | undefined): NonNullable<DeepDiveSharedVerifiedBasis['customerEvidenceStatus']> {
  const text = normalizeNarrativeSentence(customerExposure) || '';
  if (!text) return '未取得可引用來源';
  if (/未取得|待補|不納入已驗證|供應鏈映射|研究推估|非已公告|不直接視為已公告/.test(text)) {
    return '供應鏈映射推估';
  }
  if (/客戶|訂單|法說|公告|LTA|私募|Meta|Microsoft|Google|NVIDIA|AMD|Broadcom|Marvell|hyperscaler|CSP/i.test(text)) {
    return '具名官方/法說證據';
  }
  return '供應鏈映射推估';
}

function buildSupplyChainMapFromBasis(params: {
  customerExposure: string | null;
  productMixEvidence: string | null;
  marketShareEvidence: string | null;
  status: NonNullable<DeepDiveSharedVerifiedBasis['customerEvidenceStatus']>;
  sourceRefs: string[];
}): NonNullable<DeepDiveSharedVerifiedBasis['supplyChainMap']> {
  const text = [params.customerExposure, params.productMixEvidence, params.marketShareEvidence].filter(Boolean).join(' ');
  const lower = text.toLowerCase();
  const profile = /ai server|server|rack|csp|hyperscaler|機櫃|伺服器/.test(lower)
    ? {
        upstream: ['GPU / CPU / Networking 零組件', '電源與散熱模組'],
        downstream: ['北美 CSP / AI server OEM', '企業 AI data center'],
        potentialCustomers: ['CSP 採購鏈', 'AI server OEM / ODM 專案'],
      }
    : /dram|nand|emmc|nor|memory|記憶體/.test(lower)
      ? {
          upstream: ['晶圓 / 製程 / 封測產能'],
          downstream: ['模組廠', '工控 / 車用 / 網通客戶'],
          potentialCustomers: ['長尾記憶體客戶', '工控與車用供應鏈'],
        }
      : /soc|wi.?fi|ic design|edge ai|車用|旗艦/.test(lower)
        ? {
            upstream: ['晶圓代工 / 封測 / IP'],
            downstream: ['手機 OEM', '網通品牌', '車用 Tier 1'],
            potentialCustomers: ['Android 旗艦 OEM', 'Wi-Fi / 車用產品客戶'],
          }
        : /optical|lens|xr|periscope|鏡頭|光學/.test(lower)
          ? {
              upstream: ['玻璃 / 鏡片 / 致動器', '精密模具與鍍膜'],
              downstream: ['智慧手機品牌', 'XR 裝置供應鏈'],
              potentialCustomers: ['旗艦手機 OEM', 'XR 光學模組客戶'],
            }
          : /cpo|aoc|800g|1\.6t|cos|ld|光通訊|光模組/.test(lower)
            ? {
                upstream: ['LD / 光晶片 / 封測材料'],
                downstream: ['高速網通設備商', '北美 AI data center 供應鏈'],
                potentialCustomers: ['CPO / AOC 生態鏈客戶', '高速光互連供應鏈'],
              }
            : {
                upstream: ['上游關鍵零組件與產能'],
                downstream: ['下游客戶與系統整合商'],
                potentialCustomers: ['該產業核心客戶群'],
              };
  const summary =
    params.status === '具名官方/法說證據'
      ? '已有可引用來源指向客戶、訂單或法說證據，可作為共同基底的一部分。'
      : params.status === '供應鏈映射推估'
        ? '目前以供應鏈位置、產品線與公開產業追蹤推估客戶群；未具名或未公告部分不納入 Base，只列為情境待驗證。'
        : '尚未取得可引用客戶或訂單來源；不納入 Base。';
  return {
    ...profile,
    evidenceStatus: params.status,
    summary,
    sourceRefs: params.sourceRefs,
  };
}

function buildSharedVerifiedBasis(params: {
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  monthlyRevenue?: number | null;
  revenueAnnual?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  epsTtm?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
}): DeepDiveSharedVerifiedBasis | null {
  const baseCaseDetail = params.baseCaseDetail;
  const scenarioCaseDetail = params.scenarioCaseDetail;
  const customerExposure = normalizeNarrativeSentence(baseCaseDetail?.customerExposure || scenarioCaseDetail?.customerExposure || null);
  const transcriptEvidence = normalizeNarrativeSentence(baseCaseDetail?.transcriptEvidence || scenarioCaseDetail?.transcriptEvidence || null);
  const monthlyRevenueEvidence = normalizeNarrativeSentence(
    baseCaseDetail?.monthlyRevenueEvidence || scenarioCaseDetail?.monthlyRevenueEvidence || null,
  );
  const productMixEvidence = normalizeNarrativeSentence(baseCaseDetail?.productMixEvidence || scenarioCaseDetail?.productMixEvidence || null);
  const marketShareEvidence = normalizeNarrativeSentence(
    baseCaseDetail?.marketShareEvidence || scenarioCaseDetail?.marketShareEvidence || null,
  );
  const customerEvidenceStatus = inferCustomerEvidenceStatus(customerExposure);
  const evidenceBasis = uniqueNarrativeLines(
    [
      ...(baseCaseDetail?.evidenceBasis || []),
      ...(scenarioCaseDetail?.evidenceBasis || []).filter(
        (item) => normalizedNarrativeSet(baseCaseDetail?.evidenceBasis || []).has(normalizeNarrativeSentence(item) || ''),
      ),
    ],
    5,
  );
  const currentFinancialBaseline = sentenceFromBridgeSegments(
    [
      params.monthlyRevenue != null ? `最新月營收約 ${formatNarrativeMoney(params.monthlyRevenue)}` : null,
      params.revenueAnnual != null ? `年化營收基底約 ${formatNarrativeMoney(params.revenueAnnual)}` : null,
      params.grossMargin != null ? `毛利率基底約 ${formatNumberLocal(params.grossMargin)}%` : null,
      params.operatingMargin != null ? `營益率基底約 ${formatNumberLocal(params.operatingMargin)}%` : null,
      params.epsTtm != null ? `EPS(TTM) 約 ${formatNumberLocal(params.epsTtm)}` : null,
      params.peRatio != null ? `目前 PE ${params.peRatio > 0 && params.peRatio <= 120 ? `${formatNumberLocal(params.peRatio)}x` : '不具參考性'}` : null,
      params.pbRatio != null ? `PB ${params.pbRatio > 0 ? `${formatNumberLocal(params.pbRatio)}x` : '待補'}` : null,
    ],
    '',
  );
  const summary = sentenceFromBridgeSegments(
    [
      customerExposure,
      transcriptEvidence,
      monthlyRevenueEvidence,
      productMixEvidence,
      marketShareEvidence,
    ],
    customerExposure || transcriptEvidence || monthlyRevenueEvidence || productMixEvidence || marketShareEvidence || '',
  );
  const sharedBasisRefs = uniqueNarrativeLines(
    [
      customerExposure,
      transcriptEvidence,
      monthlyRevenueEvidence,
      productMixEvidence,
      marketShareEvidence,
      ...evidenceBasis,
    ],
    6,
  );
  if (
    !summary &&
    !currentFinancialBaseline &&
    !customerExposure &&
    !transcriptEvidence &&
    !monthlyRevenueEvidence &&
    !productMixEvidence &&
    !marketShareEvidence &&
    evidenceBasis.length === 0
  ) {
    return null;
  }
  return {
    summary: summary || null,
    customerExposure,
    transcriptEvidence,
    monthlyRevenueEvidence,
    productMixEvidence,
    marketShareEvidence,
    currentFinancialBaseline: currentFinancialBaseline || null,
    evidenceBasis,
    sharedBasisRefs,
    sourceRefs: [],
    supplyChainMap: buildSupplyChainMapFromBasis({
      customerExposure,
      productMixEvidence,
      marketShareEvidence,
      status: customerEvidenceStatus,
      sourceRefs: [],
    }),
    customerEvidenceStatus,
    customerEvidenceRefs: [],
  };
}

function buildScenarioDeltaAssumptions(
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
) {
  if (!scenarioCaseDetail) return [];
  const baseSet = normalizedNarrativeSet([
    baseCaseDetail?.driver,
    ...(baseCaseDetail?.assumptions || []),
    ...(baseCaseDetail?.evidenceBasis || []),
    baseCaseDetail?.marketSizingBridge,
    baseCaseDetail?.revenueBridge,
    baseCaseDetail?.marginBridge,
    baseCaseDetail?.earningsBridge,
    baseCaseDetail?.multipleBridge,
    baseCaseDetail?.priceBridge,
  ]);
  const rawDeltaLines = [
    scenarioCaseDetail.driver &&
    (!baseCaseDetail?.driver || normalizeNarrativeSentence(scenarioCaseDetail.driver) !== normalizeNarrativeSentence(baseCaseDetail.driver))
      ? scenarioCaseDetail.driver
      : null,
    ...(scenarioCaseDetail.assumptions || []),
    ...((scenarioCaseDetail.evidenceBasis || []).map(cleanEvidenceDirectionPrefix)),
  ]
    .map((item) => normalizeNarrativeSentence(item))
    .filter((item): item is string => Boolean(item))
    .filter((item) => !baseSet.has(item));

  return uniqueNarrativeLines(rawDeltaLines.map((item) => `待驗證上行假設：${item}`), 4);
}

function hasIndependentScenarioDelta(
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
) {
  if (!scenarioCaseDetail) return false;
  return buildScenarioDeltaAssumptions(baseCaseDetail, scenarioCaseDetail).length > 0;
}

function buildScenarioIncrementalImpactSentence(
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
) {
  if (!baseCaseDetail || !scenarioCaseDetail) return null;
  const parts = [
    baseCaseDetail.projectedRevenueAnnual != null && scenarioCaseDetail.projectedRevenueAnnual != null
      ? `若上行假設成立，年化營收可由 Base 的 ${formatNarrativeMoney(baseCaseDetail.projectedRevenueAnnual)} 進一步提高到 ${formatNarrativeMoney(
          scenarioCaseDetail.projectedRevenueAnnual,
        )}`
      : null,
    baseCaseDetail.projectedGrossMarginPct != null && scenarioCaseDetail.projectedGrossMarginPct != null
      ? `毛利率由 ${formatNumberLocal(baseCaseDetail.projectedGrossMarginPct)}% 進一步提升到 ${formatNumberLocal(
          scenarioCaseDetail.projectedGrossMarginPct,
        )}%`
      : null,
    baseCaseDetail.projectedOperatingMarginPct != null && scenarioCaseDetail.projectedOperatingMarginPct != null
      ? `營益率由 ${formatNumberLocal(baseCaseDetail.projectedOperatingMarginPct)}% 提高到 ${formatNumberLocal(
          scenarioCaseDetail.projectedOperatingMarginPct,
        )}%`
      : null,
    baseCaseDetail.projectedEps != null && scenarioCaseDetail.projectedEps != null
      ? `EPS 由 ${formatNumberLocal(baseCaseDetail.projectedEps)} 增加到 ${formatNumberLocal(scenarioCaseDetail.projectedEps)}`
      : null,
    baseCaseDetail.targetPeRatio != null && scenarioCaseDetail.targetPeRatio != null && scenarioCaseDetail.targetPeRatio !== baseCaseDetail.targetPeRatio
      ? `估值倍數則由 Base 的 ${formatNumberLocal(baseCaseDetail.targetPeRatio)}x 擴張到 ${formatNumberLocal(
          scenarioCaseDetail.targetPeRatio,
        )}x`
      : null,
  ];
  return sentenceFromBridgeSegments(parts, parts[0] || '');
}

function checklistStatusFromScore(score: number) {
  if (score >= 0.86) return '已達成' as const;
  if (score >= 0.46) return '部分達成' as const;
  if (score > 0.05) return '尚待驗證' as const;
  return '資料過期' as const;
}

function scoreFromEvidenceText(value: string | null | undefined, sourceRefs: string[], options?: { noDirectEvidencePenalty?: boolean }) {
  const text = normalizeNarrativeSentence(value);
  if (!text) return 0.08;
  if (isWeakEvidenceText(text)) return options?.noDirectEvidencePenalty ? 0.12 : 0.24;
  const refScore = Math.min(0.22, sourceRefs.length * 0.055);
  const officialBonus = /官方|法說|財報|月營收|公告|年報|客戶|訂單|市占|良率|出貨/i.test(text) ? 0.14 : 0.04;
  const specificityBonus = text.length > 80 ? 0.08 : text.length > 36 ? 0.04 : 0;
  return clamp(0.38 + refScore + officialBonus + specificityBonus, 0.08, 0.92);
}

function ratioScore(actual: number | null | undefined, target: number | null | undefined) {
  if (actual == null || target == null || !Number.isFinite(actual) || !Number.isFinite(target) || target <= 0) return 0.05;
  return clamp(actual / target, 0, 1);
}

function buildScenarioAchievementChecklist(params: {
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  monthlyRevenue?: number | null;
  technicalEntrySignal?: StockDeepDivePayload['technicalEntrySignal'] | null;
  chipEntryAssessment?: StockDeepDivePayload['chipEntryAssessment'] | null;
  sourceRefs?: string[];
}): NonNullable<DeepDiveValuationCaseDetail['achievementChecklist']> {
  const scenario = params.scenarioCaseDetail;
  if (!scenario?.hasIndependentDelta) return [];
  const base = params.baseCaseDetail;
  const sourceRefs = (params.sourceRefs || []).slice(0, 3);
  const scenarioRevenue = scenario.projectedRevenueAnnual;
  const currentRunRate = params.monthlyRevenue != null && params.monthlyRevenue > 0 ? params.monthlyRevenue * 12 : null;
  const updatedAt = nowIso();
  const customerScore = scoreFromEvidenceText(scenario.customerExposure || scenario.driver, sourceRefs, { noDirectEvidencePenalty: true });
  const revenueScore = ratioScore(currentRunRate, scenarioRevenue);
  const grossMarginScore = ratioScore(base?.projectedGrossMarginPct, scenario.projectedGrossMarginPct);
  const epsBridgeScore = ratioScore(base?.projectedEps, scenario.projectedEps);
  const marginEpsScore = clamp(((grossMarginScore || 0) * 0.45 + (epsBridgeScore || 0) * 0.55), 0.05, 0.96);
  const mixScore = clamp(
    scoreFromEvidenceText(scenario.productMixEvidence || scenario.marketShareEvidence || scenario.marketSizingBridge, sourceRefs) +
      Math.min(0.12, (scenario.deltaAssumptions?.length || 0) * 0.03) -
      Math.min(0.16, (scenario.estimatedFields?.length || 0) * 0.025),
    0.06,
    0.94,
  );
  const technicalVerdict = params.technicalEntrySignal?.verdict || null;
  const chipVerdict = params.chipEntryAssessment?.verdict || null;
  const pricePositionState = params.technicalEntrySignal?.pricePositionState || null;
  const breakoutAchieved = Boolean(params.technicalEntrySignal?.breakoutAchieved);

  const technicalBaseScore =
    technicalVerdict === '適合分批'
      ? breakoutAchieved
        ? 0.9
        : 0.82
      : technicalVerdict === '等回測'
        ? breakoutAchieved
          ? 0.72
          : 0.58
        : technicalVerdict === '過熱不追'
          ? breakoutAchieved
            ? 0.48
            : 0.3
          : technicalVerdict === '趨勢轉弱'
            ? 0.12
            : 0.36;
  const chipPenalty =
    chipVerdict === '籌碼偏亂先不買'
      ? 0.18
	      : chipVerdict === '資料不足不買' || chipVerdict === '資料不足暫緩'
        ? 0.22
        : chipVerdict === '過熱不追'
          ? 0.12
          : 0;
  const technicalScore = clamp(technicalBaseScore - chipPenalty, 0.08, 0.96);

  return [
    {
      label: '客戶 / 訂單驗證',
      status: checklistStatusFromScore(customerScore),
      score: round(customerScore * 100, 0),
      scoreReason: customerScore >= 0.7 ? '已有較明確外部或法說依據' : '多為供應鏈映射或待驗證客戶假設',
      summary: evidenceOrPending(
        scenario.customerExposure || scenario.driver,
        '直接客戶 / 訂單來源待補；未取得具名客戶、官方公告或法說前，不納入已驗證 Base，只能作情境追蹤。',
      ),
      actualValue: scenario.customerExposure && !isWeakEvidenceText(scenario.customerExposure) ? '有可引用敘述' : '直接證據待補',
      targetValue: '具名客戶、官方公告、法說或高可信研究來源',
      currentValue: scenario.customerExposure && !isWeakEvidenceText(scenario.customerExposure) ? '已有來源文字' : '待補',
      threshold: '具名客戶、官方公告、法說或高可信研究來源',
      updatedAt,
      sourceRefs,
    },
    {
      label: '月營收門檻',
      status: checklistStatusFromScore(revenueScore),
      score: round(revenueScore * 100, 0),
      scoreReason: currentRunRate == null || scenarioRevenue == null ? '缺少可比對 run-rate 或情境營收門檻' : `run-rate / 情境門檻約 ${formatNumberLocal(revenueScore * 100)}%`,
      summary:
        scenarioRevenue != null
          ? `情境需要月營收 run-rate 支撐年化營收約 ${formatNarrativeMoney(scenarioRevenue)}；目前 run-rate ${
              currentRunRate == null ? '待補' : `約 ${formatNarrativeMoney(currentRunRate)}`
            }。`
          : '情境需要看到月營收 run-rate 明顯高於 Base，但目前缺少可量化門檻。',
      actualValue: currentRunRate == null ? '待補' : formatNarrativeMoney(currentRunRate),
      targetValue: scenarioRevenue == null ? '待補' : formatNarrativeMoney(scenarioRevenue),
      currentValue: currentRunRate == null ? '待補' : formatNarrativeMoney(currentRunRate),
      threshold: scenarioRevenue == null ? '待補' : formatNarrativeMoney(scenarioRevenue),
      updatedAt,
      sourceRefs,
    },
    {
      label: '毛利率 / EPS 門檻',
      status: checklistStatusFromScore(marginEpsScore),
      score: round(marginEpsScore * 100, 0),
      scoreReason:
        base?.projectedEps != null && scenario.projectedEps != null
          ? `Base EPS / 情境 EPS 約 ${formatNumberLocal(epsBridgeScore * 100)}%`
          : '缺少可比對 EPS 或毛利率橋接',
      summary: sentenceFromBridgeSegments(
        [
          base?.projectedGrossMarginPct != null && scenario.projectedGrossMarginPct != null
            ? `毛利率需由 Base 的 ${formatNumberLocal(base.projectedGrossMarginPct)}% 進一步提升到 ${formatNumberLocal(
                scenario.projectedGrossMarginPct,
              )}%`
            : null,
          base?.projectedEps != null && scenario.projectedEps != null
            ? `EPS 需由 ${formatNumberLocal(base.projectedEps)} 提升到 ${formatNumberLocal(scenario.projectedEps)}`
            : null,
        ],
        scenario.earningsBridge || '需要看到毛利率、營益率或 EPS 明確優於 Base。',
      ),
      currentValue:
        base?.projectedGrossMarginPct != null || base?.projectedEps != null
          ? `Base GM ${base?.projectedGrossMarginPct == null ? '待補' : `${formatNumberLocal(base.projectedGrossMarginPct)}%`} / EPS ${
              base?.projectedEps == null ? '待補' : formatNumberLocal(base.projectedEps)
            }`
          : '待補',
      actualValue:
        base?.projectedGrossMarginPct != null || base?.projectedEps != null
          ? `Base GM ${base?.projectedGrossMarginPct == null ? '待補' : `${formatNumberLocal(base.projectedGrossMarginPct)}%`} / EPS ${
              base?.projectedEps == null ? '待補' : formatNumberLocal(base.projectedEps)
            }`
          : '待補',
      targetValue:
        scenario.projectedGrossMarginPct != null || scenario.projectedEps != null
          ? `情境 GM ${scenario.projectedGrossMarginPct == null ? '待補' : `${formatNumberLocal(scenario.projectedGrossMarginPct)}%`} / EPS ${
              scenario.projectedEps == null ? '待補' : formatNumberLocal(scenario.projectedEps)
            }`
          : '待補',
      threshold:
        scenario.projectedGrossMarginPct != null || scenario.projectedEps != null
          ? `情境 GM ${scenario.projectedGrossMarginPct == null ? '待補' : `${formatNumberLocal(scenario.projectedGrossMarginPct)}%`} / EPS ${
              scenario.projectedEps == null ? '待補' : formatNumberLocal(scenario.projectedEps)
            }`
          : '待補',
      updatedAt,
      sourceRefs,
    },
    {
      label: '產品 mix / 市占驗證',
      status: checklistStatusFromScore(mixScore),
      score: round(mixScore * 100, 0),
      scoreReason: mixScore >= 0.65 ? '已有產品 mix / TAM / 市占推導與來源註腳' : '產品 mix 或市占仍多為研究推估',
      summary: evidenceOrPending(
        scenario.productMixEvidence || scenario.marketShareEvidence || scenario.marketSizingBridge,
        '產品 mix / 市占直接證據待補；目前只追蹤高毛利產品占比、市占或 TAM 滲透是否高於 Base。',
      ),
      actualValue: scenario.productMixEvidence || scenario.marketShareEvidence ? '已有部分來源' : '待補',
      targetValue: '產品 mix、市占或 TAM 滲透率明確高於 Base',
      currentValue: scenario.productMixEvidence || scenario.marketShareEvidence ? '部分來源已整理' : '待補',
      threshold: '產品 mix、市占或 TAM 滲透率明確高於 Base',
      updatedAt,
      sourceRefs,
    },
    {
      label: '技術量價確認',
      status: checklistStatusFromScore(technicalScore),
      score: round(technicalScore * 100, 0),
      scoreReason: technicalVerdict
        ? `技術 verdict：${technicalVerdict}${pricePositionState ? ` / ${pricePositionState}` : ''}${chipVerdict ? `；籌碼：${chipVerdict}` : ''}`
        : 'Radar 快照未取得完整技術 verdict，先以 light snapshot 補分',
      summary:
        breakoutAchieved && params.technicalEntrySignal?.breakoutRetestLevel != null
          ? `突破條件已達成，${formatMoney(params.technicalEntrySignal.breakoutRetestLevel)} 轉為回測支撐；仍需確認量能、MACD 與籌碼沒有惡化。`
          : params.technicalEntrySignal?.entryPlan?.strategy ||
            params.technicalEntrySignal?.summary ||
            '需要看到股價站穩關鍵均線、MACD 動能不轉弱，且突破或回測時有量能配合。',
      actualValue: [technicalVerdict, pricePositionState, chipVerdict].filter(Boolean).join(' / ') || '待補',
      targetValue: '適合分批 / 帶量突破 / 回測支撐量縮止穩',
      currentValue: [technicalVerdict, pricePositionState].filter(Boolean).join(' / ') || '待補',
      threshold: '適合分批 / 帶量突破 / 回測支撐量縮止穩',
      updatedAt,
      sourceRefs: [],
    },
  ];
}

type ScenarioChecklistItem = NonNullable<DeepDiveValuationCaseDetail['achievementChecklist']>[number];

function scenarioChecklistWeight(label: string) {
  if (label.includes('客戶') || label.includes('訂單')) return 0.25;
  if (label.includes('月營收')) return 0.2;
  if (label.includes('毛利率') || label.includes('EPS')) return 0.2;
  if (label.includes('產品') || label.includes('市占')) return 0.2;
  if (label.includes('技術') || label.includes('籌碼')) return 0.15;
  return 0.2;
}

function scenarioChecklistStatusScore(status: ScenarioChecklistItem['status']) {
  if (status === '已達成') return 1;
  if (status === '部分達成') return 0.55;
  if (status === '尚待驗證') return 0.15;
  return 0;
}

function scenarioChecklistItemScore(item: ScenarioChecklistItem) {
  if (item.score != null && Number.isFinite(Number(item.score))) {
    return clamp(Number(item.score) / 100, 0, 1);
  }
  return scenarioChecklistStatusScore(item.status);
}

function scenarioChecklistBreakdown(checklist: ScenarioChecklistItem[] | null | undefined) {
  const items = checklist || [];
  return {
    achieved: items.filter((item) => item.status === '已達成').length,
    partial: items.filter((item) => item.status === '部分達成').length,
    pending: items.filter((item) => item.status === '尚待驗證').length,
    stale: items.filter((item) => item.status === '資料過期').length,
    total: items.length,
  };
}

function scenarioChecklistProgress(checklist: ScenarioChecklistItem[] | null | undefined) {
  const items = checklist || [];
  if (items.length === 0) return 0;
  const weighted = items.reduce(
    (acc, item) => {
      const weight = scenarioChecklistWeight(item.label);
      acc.score += weight * scenarioChecklistItemScore(item);
      acc.weight += weight;
      return acc;
    },
    { score: 0, weight: 0 },
  );
  if (weighted.weight <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((weighted.score / weighted.weight) * 100)));
}

function scenarioChecklistScoreDetails(checklist: ScenarioChecklistItem[] | null | undefined) {
  return (checklist || []).map((item) => ({
    label: item.label,
    score: Math.round(scenarioChecklistItemScore(item) * 100),
    status: item.status,
    reason: item.scoreReason || null,
  }));
}

function scenarioPromotionEvidenceCount(scenario: DeepDiveValuationCaseDetail | null | undefined) {
  const sourceRefCount = (scenario?.sourceRefs || []).filter(isVerifiedExternalCitationRef).length;
  const evidenceRefCount = new Set([...(scenario?.evidenceRefs || []), ...(scenario?.promotionEvidenceRefs || [])].filter(Boolean)).size;
  return Math.max(sourceRefCount, evidenceRefCount);
}

function buildScenarioPromotionGate(params: {
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined;
  targetSnapshot?: Pick<DeepDiveTargetSnapshot, 'currentPrice' | 'baseTarget' | 'upsideTarget' | 'valuationSanityStatus' | 'targetCoverageStatus' | 'staleReason'> | null;
}) {
  const base = params.baseCaseDetail || null;
  const scenario = params.scenarioCaseDetail || null;
  const checklist = scenario?.achievementChecklist || [];
  const progress = scenarioChecklistProgress(checklist);
  const evidenceCount = scenarioPromotionEvidenceCount(scenario);
  const monthlyRevenueCheck = checklist.find((item) => item.label.includes('月營收'));
  const marginEpsCheck = checklist.find((item) => item.label.includes('毛利率') || item.label.includes('EPS'));
  const mixCheck = checklist.find((item) => item.label.includes('產品') || item.label.includes('市占'));
  const customerCheck = checklist.find((item) => item.label.includes('客戶') || item.label.includes('訂單'));
  const targetPeSupported = scenario?.targetPeRatio != null && scenario.targetPeRatio > 0 && evidenceCount >= 1;
  const sanityNormal = !params.targetSnapshot?.valuationSanityStatus || params.targetSnapshot.valuationSanityStatus === 'normal';
  const externalBridgeChecks = [monthlyRevenueCheck, marginEpsCheck, mixCheck, customerCheck].filter(
    (item) => item && (item.status === '已達成' || item.status === '部分達成') && (item.sourceRefs?.length || 0) > 0,
  ).length;
  const criticalChecks = [
    {
      label: '情境 checklist >= 85%',
      passed: progress >= 85,
      reason: `目前 ${progress}%`,
    },
    {
      label: '至少三項外部證據支撐',
      passed: externalBridgeChecks >= 3 || evidenceCount >= 3,
      reason: `外部證據 ${Math.max(externalBridgeChecks, evidenceCount)} / 3`,
    },
    {
      label: 'Forward EPS / target PE 有來源',
      passed: targetPeSupported || evidenceCount >= 3,
      reason: targetPeSupported ? 'target PE 有可引用來源或券商/研究佐證' : 'Forward EPS / target PE 來源仍待補',
    },
    {
      label: '估值 sanity normal',
      passed: sanityNormal,
      reason: sanityNormal ? '估值安全檢查正常' : '估值安全檢查仍需覆核',
    },
  ];
  const canPromoteToBase = Boolean(scenario?.hasIndependentDelta && criticalChecks.every((item) => item.passed));
  const crossedBase = params.targetSnapshot?.targetCoverageStatus === 'scenario_only' || params.targetSnapshot?.staleReason === 'target_stale_due_price_crossed_base';
  const proposedBaseTarget =
    canPromoteToBase && base?.targetPrice != null && scenario?.targetPrice != null && scenario.targetPrice > base.targetPrice
      ? round(base.targetPrice + (scenario.targetPrice - base.targetPrice) * clamp(progress / 100, 0.85, 0.95), 2)
      : null;
  const status =
    !scenario?.hasIndependentDelta
      ? ('no_independent_scenario' as const)
      : canPromoteToBase
        ? ('eligible' as const)
        : crossedBase && progress >= 60
          ? ('price_led_fundamentals_pending' as const)
          : evidenceCount < 3
            ? ('insufficient_evidence' as const)
            : ('not_ready' as const);
  const summary =
    status === 'eligible'
      ? `情境條件已接近可升級為新 Base；建議用實際月營收/EPS/Forward PE 重新計算，新 Base 參考約 ${formatMoney(proposedBaseTarget)}。`
      : status === 'price_led_fundamentals_pending'
        ? '股價已先反映情境，但財務或券商證據尚未足以把情境升為 Base。'
        : status === 'insufficient_evidence'
          ? '情境仍缺外部證據，不能升級為 Base。'
          : status === 'no_independent_scenario'
            ? '目前沒有獨立上行情境，Base 已涵蓋主要已知故事。'
            : '情境仍在驗證中，尚未達升級 Base 的門檻。';
  return {
    status,
    canPromoteToBase,
    score: scenario?.hasIndependentDelta ? progress : null,
    requiredScore: 85,
    achievedEvidenceCount: Math.max(externalBridgeChecks, evidenceCount),
    requiredEvidenceCount: 3,
    criticalChecks,
    oldBaseTarget: base?.targetPrice ?? null,
    oldScenarioTarget: scenario?.targetPrice ?? null,
    proposedBaseTarget,
    promotionEvidenceRefs: unique([...(scenario?.evidenceRefs || []), ...(scenario?.sourceRefs || []).map((ref) => ref.id)]).slice(0, 6),
    summary,
  };
}

function attachScenarioPromotionGate(
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  targetSnapshot?: DeepDiveTargetSnapshot | null,
) {
  if (!scenarioCaseDetail) return null;
  const promotionGate = buildScenarioPromotionGate({ baseCaseDetail, scenarioCaseDetail, targetSnapshot });
  scenarioCaseDetail.promotionGate = promotionGate;
  scenarioCaseDetail.canPromoteToBase = promotionGate.canPromoteToBase;
  scenarioCaseDetail.promotionEvidenceRefs = promotionGate.promotionEvidenceRefs;
  return promotionGate;
}

function refreshBridgeBundlePromotionAndRevaluation(bundle: BridgeAwareSnapshotBundle) {
  const promotionGate = attachScenarioPromotionGate(bundle.baseCaseDetail, bundle.scenarioCaseDetail, bundle.targetSnapshot);
  bundle.targetSnapshot.scenarioPromotionStatus = promotionGate?.status || null;
  applyRevaluationSlaToTargetSnapshot(bundle.targetSnapshot, buildRevaluationJobSummary({ targetSnapshot: bundle.targetSnapshot, promotionGate }));
  return promotionGate;
}

function buildRevaluationJobSummary(params: {
  targetSnapshot: Pick<
    DeepDiveTargetSnapshot,
    | 'staleReason'
    | 'archiveReason'
    | 'reportUpdatedAt'
    | 'repricedAt'
    | 'repricingReason'
    | 'unchangedReason'
    | 'bridgeCompleteness'
    | 'repricingRequiredEvidence'
    | 'targetCoverageStatus'
  >;
  promotionGate?: ReturnType<typeof buildScenarioPromotionGate> | null;
}) {
  const snapshot = params.targetSnapshot;
  const queuedAt = snapshot.reportUpdatedAt || snapshot.repricedAt || nowIso();
  const lastAttemptAt = snapshot.repricedAt || snapshot.reportUpdatedAt || null;
  const requiredEvidence = snapshot.repricingRequiredEvidence?.length
    ? snapshot.repricingRequiredEvidence
    : [
        '最新月營收 / EPS / 毛利率或營益率上修',
        'Forward EPS 或 target PE 有券商/官方佐證',
        '具名客戶、訂單或產品 mix 證據',
      ];
  const status =
    params.promotionGate?.canPromoteToBase
      ? ('promoted_scenario_to_base' as const)
      : snapshot.bridgeCompleteness !== 'complete'
        ? ('blocked_insufficient_evidence' as const)
        : snapshot.staleReason === 'target_stale_due_price_crossed_scenario' || snapshot.targetCoverageStatus === 'over_base_and_scenario'
          ? ('archived_reflected' as const)
          : snapshot.staleReason === 'target_stale_due_price_crossed_base'
            ? ('queued' as const)
            : snapshot.unchangedReason
              ? ('unchanged_with_reason' as const)
              : ('repriced' as const);
  const lastResult =
    status === 'promoted_scenario_to_base'
      ? params.promotionGate?.summary || '情境達成率與證據已達升 Base 門檻。'
      : status === 'queued'
        ? snapshot.repricingReason || '現價已越過 Base，已排入重估並追蹤情境是否可升 Base。'
        : status === 'archived_reflected'
          ? snapshot.archiveReason || snapshot.unchangedReason || '現價已高於情境，留在熱股追蹤/估值已反映。'
          : status === 'blocked_insufficient_evidence'
            ? 'bridge 尚未完整，無法重新產生正式 Base。'
            : status === 'unchanged_with_reason'
              ? snapshot.unchangedReason || '本輪沒有足以改變基本面 target 的新證據。'
              : snapshot.repricingReason || 'bridge-aware target snapshot 已重建。';
  return finalizeRevaluationJobSummary({
    status,
    queuedAt,
    lastAttemptAt,
    lastResult,
    requiredEvidence,
    slaHours: status === 'queued' ? 2 : 24,
  });
}

function normalizeRevaluationJobState(value: unknown): RevaluationJobState {
  const text = String(value || '');
  if (
    text === 'queued' ||
    text === 'running' ||
    text === 'repriced' ||
    text === 'unchanged_with_reason' ||
    text === 'promoted_scenario_to_base' ||
    text === 'blocked_insufficient_evidence' ||
    text === 'archived_reflected'
  ) {
    return text;
  }
  return 'queued';
}

function textArrayFromUnknown(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map(compactText).filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function brokerSearchSummaryFromRows(rows: Row[]) {
  if (!rows.length) return null;
  const hits = rows.filter((row) => String(row.status || '') === 'hit').length;
  const written = rows.reduce((sum, row) => sum + Math.max(0, Number(row.records_written || 0)), 0);
  const surfaces = unique(rows.map((row) => compactText(row.search_surface)).filter(Boolean)).slice(0, 3);
  return `券商搜尋 ${rows.length} 輪；命中 ${hits} 輪、寫入 ${written} 筆；來源 ${surfaces.join('、') || '待補'}。`;
}

function addHoursIso(value: string | null | undefined, hours: number) {
  if (!value) return null;
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return null;
  return new Date(timestamp + hours * 60 * 60 * 1000).toISOString();
}

function inferRevaluationSlaStatus(params: {
  status: RevaluationJobState;
  queuedAt: string | null;
  lastAttemptAt: string | null;
  nextAttemptAt?: string | null;
  slaHours: number;
}) {
  if (params.status === 'blocked_insufficient_evidence' || params.status === 'archived_reflected') return 'blocked' as const;
  const nowMs = Date.now();
  const nextMs = params.nextAttemptAt ? Date.parse(params.nextAttemptAt) : Number.NaN;
  const lastAttemptMs = params.lastAttemptAt ? Date.parse(params.lastAttemptAt) : Number.NaN;
  const queuedMs = params.queuedAt ? Date.parse(params.queuedAt) : Number.NaN;
  if (params.status === 'queued' || params.status === 'running') {
    const dueAt = Number.isFinite(nextMs)
      ? nextMs
      : Number.isFinite(queuedMs)
        ? queuedMs + params.slaHours * 60 * 60 * 1000
        : Number.NaN;
    if (!Number.isFinite(dueAt)) return 'due' as const;
    return nowMs > dueAt ? 'overdue' : 'due';
  }
  if (!Number.isFinite(lastAttemptMs)) return 'due' as const;
  return nowMs - lastAttemptMs > params.slaHours * 60 * 60 * 1000 ? 'due' : 'fresh';
}

function brokerEvidenceSearchStatusFromRows(
  rows: Row[],
  fallbackSummary: string | null | undefined,
  nextAttemptAt?: string | null,
): RevaluationJobSummary['brokerEvidenceSearchStatus'] {
  if (!rows.length) {
    return {
      status: fallbackSummary ? 'pending' : 'not_attempted',
      summary: fallbackSummary || '尚未看到本輪授權券商研究紀錄；下一輪重估需補授權 API、使用者有權上傳的 PDF、公司 IR 或法說資料。',
      lastAttemptAt: null,
      nextAttemptAt: nextAttemptAt || null,
      sourceCount: 0,
      usBrokerCount: 0,
    };
  }
  const lastAttemptAt = rows
    .map((row) => (row.searched_at ? String(row.searched_at) : null))
    .filter((value): value is string => Boolean(value))
    .sort()
    .at(-1) || null;
  const hits = rows.filter((row) => String(row.status || '') === 'hit').length;
  const written = rows.reduce((sum, row) => sum + Math.max(0, Number(row.records_written || 0)), 0);
  const surfaces = unique(rows.map((row) => compactText(row.search_surface)).filter(Boolean));
  return {
    status: hits > 0 || written > 0 ? 'hit' : 'miss',
    summary:
      fallbackSummary ||
      `券商雷達已搜尋 ${rows.length} 輪；命中 ${hits} 輪、寫入 ${written} 筆；來源 ${surfaces.slice(0, 3).join('、') || '待補'}。`,
    lastAttemptAt,
    nextAttemptAt: nextAttemptAt || null,
    sourceCount: surfaces.length,
    usBrokerCount: rows.filter((row) => /Morgan|Goldman|JPMorgan|Citi|BofA|UBS|Bernstein|Jefferies/i.test(String(row.summary || row.search_surface || ''))).length,
  };
}

function finalizeRevaluationJobSummary(summary: RevaluationJobSummary): RevaluationJobSummary {
  const nextAttemptAt =
    summary.nextAttemptAt ||
    (summary.status === 'queued' || summary.status === 'running'
      ? addHoursIso(summary.queuedAt, Math.max(1, summary.slaHours))
      : addHoursIso(summary.lastAttemptAt, Math.max(1, summary.slaHours))) ||
    null;
  const missingEvidence = summary.requiredEvidence?.length ? summary.requiredEvidence : ['券商/官方/財務證據待補'];
  const slaStatus = inferRevaluationSlaStatus({
    status: summary.status,
    queuedAt: summary.queuedAt,
    lastAttemptAt: summary.lastAttemptAt,
    nextAttemptAt,
    slaHours: summary.slaHours,
  });
  return {
    ...summary,
    nextAttemptAt,
    missingEvidence,
    slaStatus,
    brokerEvidenceSearchStatus:
      summary.brokerEvidenceSearchStatus ||
      brokerEvidenceSearchStatusFromRows([], summary.brokerSearchSummary, nextAttemptAt),
  };
}

function applyRevaluationSlaFields<T extends {
  revaluationJobSummary?: RevaluationJobSummary | null;
  revaluationSlaStatus?: RecommendationCard['revaluationSlaStatus'] | DeepDiveTargetSnapshot['revaluationSlaStatus'];
  nextRevaluationAt?: string | null;
  missingRepricingEvidence?: string[];
  brokerEvidenceSearchStatus?: RecommendationCard['brokerEvidenceSearchStatus'] | DeepDiveTargetSnapshot['brokerEvidenceSearchStatus'];
}>(item: T, job: RevaluationJobSummary | null | undefined): T {
  if (!job) return item;
  const finalJob = finalizeRevaluationJobSummary(job);
  return {
    ...item,
    revaluationJobSummary: finalJob,
    revaluationSlaStatus: finalJob.slaStatus,
    nextRevaluationAt: finalJob.nextAttemptAt || null,
    missingRepricingEvidence: finalJob.missingEvidence || finalJob.requiredEvidence || [],
    brokerEvidenceSearchStatus: finalJob.brokerEvidenceSearchStatus || null,
  };
}

function applyRevaluationSlaToTargetSnapshot(targetSnapshot: DeepDiveTargetSnapshot, job: RevaluationJobSummary | null | undefined) {
  if (!job) return;
  const finalJob = finalizeRevaluationJobSummary(job);
  targetSnapshot.revaluationJobStatus = finalJob;
  targetSnapshot.revaluationSlaStatus = finalJob.slaStatus;
  targetSnapshot.nextRevaluationAt = finalJob.nextAttemptAt || null;
  targetSnapshot.missingRepricingEvidence = finalJob.missingEvidence || finalJob.requiredEvidence || [];
  targetSnapshot.brokerEvidenceSearchStatus = finalJob.brokerEvidenceSearchStatus || null;
  targetSnapshot.lastRevaluationAttemptAt = finalJob.lastAttemptAt;
  targetSnapshot.lastRevaluationResult = finalJob.lastResult;
}

function revaluationJobSummaryFromRow(job: Row, brokerAttempts: Row[] = []): RevaluationJobSummary {
  const status = normalizeRevaluationJobState(job.status);
  const requiredEvidence = textArrayFromUnknown(job.required_evidence);
  const lastResult =
    compactText(job.last_result) ||
    (status === 'queued'
      ? '已排入 durable bridge-aware 重估佇列，等待券商、月營收、EPS、Forward PE 與社群券商線索補抓。'
      : status === 'running'
        ? '重估執行中，正在補抓券商/財務/社群來源。'
        : '重估已完成，等待頁面刷新呈現結果。');
  return finalizeRevaluationJobSummary({
    jobId: job.id ? String(job.id) : null,
    status,
    queuedAt: job.queued_at ? String(job.queued_at) : null,
    lastAttemptAt: job.last_attempt_at ? String(job.last_attempt_at) : null,
    nextAttemptAt: job.next_attempt_at ? String(job.next_attempt_at) : null,
    lastResult,
    requiredEvidence:
      requiredEvidence.length > 0
        ? requiredEvidence
        : ['最新月營收、毛利率或 EPS 基底上修', 'Forward EPS 或 normalized PE/PB 有外部佐證', '券商 consensus / target PE 上修'],
    slaHours: status === 'queued' || status === 'running' ? 2 : 24,
    triggerReason: job.trigger_reason ? String(job.trigger_reason) : null,
    triggerSource: job.trigger_source ? String(job.trigger_source) : null,
    brokerSearchSummary: brokerSearchSummaryFromRows(brokerAttempts),
    brokerEvidenceSearchStatus: brokerEvidenceSearchStatusFromRows(brokerAttempts, brokerSearchSummaryFromRows(brokerAttempts), job.next_attempt_at ? String(job.next_attempt_at) : null),
  });
}

async function loadLatestRevaluationJobsByStockIds(stockIds: string[]): Promise<Map<string, RevaluationJobSummary>> {
  const uniqueStockIds = unique(stockIds.map(String).filter(Boolean));
  const result = new Map<string, RevaluationJobSummary>();
  if (uniqueStockIds.length === 0) return result;
  try {
    const supabaseServer = getSupabaseServerClient();
    const jobRes = await withQueryTimeout(
      supabaseServer
        .from('revaluation_jobs')
        .select('*')
        .in('stock_id', uniqueStockIds)
        .order('updated_at', { ascending: false })
        .limit(uniqueStockIds.length * 4),
      [],
      2500,
    );
    const jobs = ((jobRes.data as Row[]) || []).filter((row) => row.stock_id);
    const jobIds = jobs.map((row) => String(row.id || '')).filter(Boolean);
    const attemptRows =
      jobIds.length > 0
        ? ((await withQueryTimeout(
            supabaseServer
              .from('broker_search_attempts')
              .select('job_id,search_surface,status,records_found,records_written,summary,searched_at')
              .in('job_id', jobIds)
              .order('searched_at', { ascending: false })
              .limit(jobIds.length * 5),
            [],
            2500,
          )).data as Row[]) || []
        : [];
    const attemptsByJobId = new Map<string, Row[]>();
    for (const row of attemptRows) {
      const jobId = String(row.job_id || '');
      if (!jobId) continue;
      attemptsByJobId.set(jobId, [...(attemptsByJobId.get(jobId) || []), row]);
    }
    for (const job of jobs) {
      const stockId = String(job.stock_id || '');
      if (!stockId || result.has(stockId)) continue;
      result.set(stockId, revaluationJobSummaryFromRow(job, attemptsByJobId.get(String(job.id || '')) || []));
    }
  } catch {
    return result;
  }
  return result;
}

function mergeRevaluationJobSummary<T extends { revaluationJobSummary?: RevaluationJobSummary | null; revaluationStatus?: RecommendationCard['revaluationStatus']; revaluationReason?: string | null }>(
  item: T,
  job: RevaluationJobSummary | null | undefined,
): T {
  if (!job) return item;
  const finalJob = finalizeRevaluationJobSummary(job);
  const revaluationStatus: RecommendationCard['revaluationStatus'] =
    finalJob.status === 'repriced' || finalJob.status === 'promoted_scenario_to_base'
      ? 'repriced'
      : finalJob.status === 'unchanged_with_reason'
        ? 'unchanged'
        : finalJob.status === 'blocked_insufficient_evidence' || finalJob.status === 'archived_reflected'
          ? 'pending'
          : item.revaluationStatus || 'pending';
  return applyRevaluationSlaFields({
    ...item,
    revaluationJobSummary: finalJob,
    revaluationStatus,
    revaluationReason: finalJob.lastResult || item.revaluationReason || null,
  }, finalJob);
}

function upsidePctFromTarget(currentPrice: number | null | undefined, targetPrice: number | null | undefined) {
  if (currentPrice == null || targetPrice == null) return null;
  if (!Number.isFinite(currentPrice) || !Number.isFinite(targetPrice) || currentPrice <= 0 || targetPrice <= currentPrice) return null;
  return round(((targetPrice - currentPrice) / currentPrice) * 100, 2);
}

function targetCoverageStatus(
  currentPrice: number | null | undefined,
  baseTarget: number | null | undefined,
  upsideTarget: number | null | undefined,
): TargetCoverageStatus {
  const current = currentPrice == null ? null : toFiniteNumber(currentPrice);
  const base = baseTarget == null ? null : toFiniteNumber(baseTarget);
  const upside = upsideTarget == null ? null : toFiniteNumber(upsideTarget);
  if (current == null || !Number.isFinite(current) || current <= 0) return 'missing_target';
  if (base != null && Number.isFinite(base) && base > current) return 'base_upside';
  if (upside != null && Number.isFinite(upside) && upside > current) return 'scenario_only';
  if ((base != null && Number.isFinite(base)) || (upside != null && Number.isFinite(upside))) return 'over_base_and_scenario';
  return 'missing_target';
}

function overTargetReasonForStatus(
  status: TargetCoverageStatus,
  currentPrice: number | null | undefined,
  baseTarget: number | null | undefined,
  upsideTarget: number | null | undefined,
) {
  const current = currentPrice == null ? null : toFiniteNumber(currentPrice);
  const base = baseTarget == null ? null : toFiniteNumber(baseTarget);
  const upside = upsideTarget == null ? null : toFiniteNumber(upsideTarget);
  if (status === 'base_upside') return null;
  if (status === 'scenario_only') {
    return `現價 ${formatMoney(current)} 已高於 Base 目標價 ${formatMoney(base)}，只剩情境價差可追蹤，不能列為正式推薦。`;
  }
  if (status === 'over_base_and_scenario') {
    return `現價 ${formatMoney(current)} 已高於 Base ${formatMoney(base)} 與情境 ${formatMoney(upside)} 目標價，等待重新估值或回測，不應列為推薦。`;
  }
  return '缺少可比對的現價或目標價，等待 bridge-aware 重估。';
}

function buildTargetSnapshot(
  currentPrice: number | null | undefined,
  baseTarget: number | null | undefined,
  upsideTarget: number | null | undefined,
  bearTarget: number | null | undefined,
  latestSourceAt: string | null,
  reportUpdatedAt: string | null,
  priceAsOf: string | null,
) {
  const normalizedBaseTarget = baseTarget == null ? null : toFiniteNumber(baseTarget);
  const normalizedUpsideTarget = upsideTarget == null ? null : toFiniteNumber(upsideTarget);
  const normalizedBearTarget = bearTarget == null ? null : toFiniteNumber(bearTarget);
  const displayBaseUpsidePct = upsidePctFromTarget(currentPrice ?? null, normalizedBaseTarget);
  const displayScenarioUpsidePct = upsidePctFromTarget(currentPrice ?? null, normalizedUpsideTarget);
  const coverageStatus = targetCoverageStatus(currentPrice ?? null, normalizedBaseTarget, normalizedUpsideTarget);
  const overTargetReason = overTargetReasonForStatus(coverageStatus, currentPrice ?? null, normalizedBaseTarget, normalizedUpsideTarget);
  const staleReason =
    coverageStatus === 'scenario_only'
      ? 'target_stale_due_price_crossed_base'
      : coverageStatus === 'over_base_and_scenario'
        ? 'target_stale_due_price_crossed_scenario'
      : coverageStatus === 'missing_target'
        ? 'missing_target_or_current_price'
        : null;
	  const archiveReason =
	    coverageStatus === 'over_base_and_scenario'
	      ? '現價已高於 Base 與情境目標價，除非重新估值上修，否則應歸檔為估值已反映。'
	      : null;
	  const repricingRequiredEvidence =
	    staleReason === 'target_stale_due_price_crossed_base' || staleReason === 'target_stale_due_price_crossed_scenario'
	      ? [
	          '最新月營收、毛利率或 EPS 基底上修',
	          'Forward EPS 或 normalized PE/PB 有外部佐證',
	          '券商 consensus / target PE 上修',
	          '具名客戶、訂單或法說證據補強',
	        ]
	      : staleReason === 'missing_target_or_current_price'
	        ? ['補齊最新現價與可驗證 Base / 情境 bridge']
	        : [];
  const verdict =
    displayBaseUpsidePct != null ? ('formal' as const) : displayScenarioUpsidePct != null ? ('scenario' as const) : ('reflected' as const);
  const displayTarget =
    verdict === 'formal'
      ? normalizedBaseTarget
      : verdict === 'scenario'
        ? normalizedUpsideTarget
        : (normalizedUpsideTarget ?? normalizedBaseTarget ?? null);
  const displayTargetLabel =
    verdict === 'formal'
      ? ('正式目標價' as const)
      : verdict === 'scenario'
        ? ('情境目標價' as const)
        : ('已接近反映' as const);
  const cardPrimaryUpsidePct = verdict === 'formal' ? displayBaseUpsidePct : verdict === 'scenario' ? displayScenarioUpsidePct : null;
  const cardPrimaryUpsideLabel =
    verdict === 'formal'
      ? ('Base 空間' as const)
      : verdict === 'scenario'
        ? ('情境空間' as const)
        : ('已接近反映' as const);

  return {
    currentPrice: currentPrice ?? null,
    baseTarget: normalizedBaseTarget,
    upsideTarget: normalizedUpsideTarget,
    bearTarget: normalizedBearTarget,
    displayBaseUpsidePct,
    displayScenarioUpsidePct,
    cardPrimaryUpsidePct,
    cardPrimaryUpsideLabel,
    displayTarget,
    displayTargetLabel,
    displayUpsidePct: cardPrimaryUpsidePct,
    verdict,
    targetCoverageStatus: coverageStatus,
    overTargetReason,
	    staleReason,
	    archiveReason,
	    repricingRequiredEvidence,
	    latestSourceAt,
    reportUpdatedAt,
    priceAsOf,
    priceRefreshStatus: priceRefreshStatusFromAsOf(priceAsOf),
  };
}

function buildBridgeAwareTargetSnapshot(
  initialTargetSnapshot: ReturnType<typeof buildTargetSnapshot>,
  baseCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null | undefined,
  invalidationScenario: DeepDiveScenarioNarrative | null | undefined,
) {
  const baseTarget = baseCaseDetail?.bridgeCompleteness === 'complete' ? baseCaseDetail.targetPrice : null;
  const upsideTarget = scenarioCaseDetail?.bridgeCompleteness === 'complete' ? scenarioCaseDetail.targetPrice : null;
  const bearTarget =
    invalidationScenario?.bridgeCompleteness === 'complete' ? invalidationScenario.targetPrice ?? null : initialTargetSnapshot.bearTarget;
  const targetSnapshot = buildTargetSnapshot(
    initialTargetSnapshot.currentPrice,
    baseTarget,
    upsideTarget,
    bearTarget,
    initialTargetSnapshot.latestSourceAt,
    initialTargetSnapshot.reportUpdatedAt,
    initialTargetSnapshot.priceAsOf,
  );
  const bridgeCompleteness =
    baseCaseDetail?.bridgeCompleteness === 'complete' || scenarioCaseDetail?.bridgeCompleteness === 'complete'
      ? ('complete' as const)
      : ('insufficient' as const);
	  const sanity = evaluateValuationSanity(
    {
      currentPrice: targetSnapshot.currentPrice,
      baseTarget: targetSnapshot.baseTarget,
      targetPrice: targetSnapshot.baseTarget,
      upsideTarget: targetSnapshot.upsideTarget,
      displayBaseUpsidePct: targetSnapshot.displayBaseUpsidePct,
      displayScenarioUpsidePct: targetSnapshot.displayScenarioUpsidePct,
      valuationQuality: bridgeCompleteness === 'complete' ? 'story_modeled' : 'fallback_proxy',
      valuationSource: bridgeCompleteness === 'complete' ? 'valuation_cases' : 'missing',
      isFallbackValuation: bridgeCompleteness !== 'complete',
    },
	    { baseCaseDetail: baseCaseDetail || null, scenarioCaseDetail: scenarioCaseDetail || null, sharedVerifiedBasis: null },
	  );
	  const needsPriceMoveRevaluation =
	    targetSnapshot.staleReason === 'target_stale_due_price_crossed_base' ||
	    targetSnapshot.staleReason === 'target_stale_due_price_crossed_scenario';
	  const bridgeAwareSnapshot = {
	    ...targetSnapshot,
	    revaluationStatus: bridgeCompleteness === 'complete' && !needsPriceMoveRevaluation ? ('rebuilt' as const) : ('pending' as const),
	    repricedAt: targetSnapshot.reportUpdatedAt || nowIso(),
	    repricingReason:
	      needsPriceMoveRevaluation
	        ? '現價已達或超過既有 Base / 情境估值，已排入重估；只有 EPS、毛利率、Forward PE、券商或官方證據上修時才會調高目標價。'
	        : targetSnapshot.verdict === 'formal'
	        ? '已依最新 bridge-aware 財務橋接重建 Base 目標價；資金輪動與籌碼只影響信心和進場狀態。'
        : targetSnapshot.verdict === 'scenario'
          ? '已依最新 bridge-aware 財務橋接重建情境目標價；Base 尚未高於現價，需等待情境 checklist 驗證。'
          : targetSnapshot.targetCoverageStatus === 'over_base_and_scenario'
            ? '本輪已重建 bridge-aware target snapshot，但現價已高於 Base 與情境目標，需等待重估或回測。'
            : null,
	    unchangedReason:
	      needsPriceMoveRevaluation
	        ? '單純股價上漲不會自動上修 Base / 情境目標；需等待新的財務或券商證據。'
	        : targetSnapshot.verdict === 'reflected'
	        ? targetSnapshot.overTargetReason ||
          '本輪資料未改變營收、毛利率、EPS 或 multiple 的正式橋接，目標價暫不升級；資金/籌碼變化會反映在推薦信心。'
        : null,
    bridgeCompleteness,
    estimatedFields: unique([...(baseCaseDetail?.estimatedFields || []), ...(scenarioCaseDetail?.estimatedFields || [])]),
    valuationSanityStatus: sanity.valuationSanityStatus,
    valuationSanityReason: sanity.valuationSanityReason,
  };
	  return {
	    ...bridgeAwareSnapshot,
	    revaluationJobStatus: buildRevaluationJobSummary({ targetSnapshot: bridgeAwareSnapshot }),
	    lastRevaluationAttemptAt: bridgeAwareSnapshot.repricedAt,
	    lastRevaluationResult: buildRevaluationJobSummary({ targetSnapshot: bridgeAwareSnapshot }).lastResult,
	  };
	}

function isReferenceablePeRatio(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 && value <= 120;
}

function isReferenceablePbRatio(value: number | null | undefined) {
  return value != null && Number.isFinite(value) && value > 0 && value <= 50;
}

function buildCurrentMultipleReferenceSentence(
  peRatio: number | null | undefined,
  pbRatio: number | null | undefined,
) {
  const currentPe = isReferenceablePeRatio(peRatio) ? `${formatNumberLocal(peRatio)}x` : null;
  const currentPb = isReferenceablePbRatio(pbRatio) ? `${formatNumberLocal(pbRatio)}x` : null;
  const invalidPeNote =
    peRatio != null && Number.isFinite(peRatio) && peRatio <= 0
      ? '目前 TTM PE 不具參考性，主因是公司獲利仍在轉正階段或低基期扭曲尚未消退。'
      : peRatio != null && Number.isFinite(peRatio) && peRatio > 120
        ? `目前 TTM PE 約 ${formatNumberLocal(peRatio)}x，但已偏離常態區間，宜優先參考 normalized / forward PE。`
        : null;
  if (currentPe || currentPb || invalidPeNote) {
    return sentenceFromBridgeSegments(
      [
        currentPe ? `目前市場給這檔股票的 TTM PE 約為 ${currentPe}` : null,
        currentPb ? `PB 約為 ${currentPb}` : null,
        invalidPeNote,
      ],
      currentPe || currentPb || invalidPeNote || '',
    );
  }
  return null;
}

function seedFallbackValuationCases(symbol: string, currentPrice: number | null | undefined): ValuationCaseView[] {
  const seedOverride = SEED_RESEARCH_OVERRIDES[symbol];
  if (!seedOverride) return [];
  const normalizedCurrentPrice =
    currentPrice != null && Number.isFinite(currentPrice) && currentPrice > 0 ? currentPrice : null;
  const buildCase = (caseType: ValuationCaseView['caseType'], targetPrice: number) => ({
    caseType,
    targetPrice,
    expectedReturnPct:
      normalizedCurrentPrice != null ? round(((targetPrice - normalizedCurrentPrice) / normalizedCurrentPrice) * 100, 2) : null,
    assumptions: { source: 'seed_override_snapshot' },
    bridgeSummary: null,
    driverLabel: null,
  });
  return [
    buildCase('base', seedOverride.targetPrice),
    buildCase('upside', seedOverride.upsidePrice),
    buildCase('invalidation', seedOverride.invalidationPrice),
  ];
}

function shouldPreferSeedBridgeSnapshot(symbol: string, currentPrice: number | null | undefined) {
  const fallbackCases = seedFallbackValuationCases(symbol, currentPrice);
  if (fallbackCases.length === 0) return false;
  return Boolean(
    SEED_RESEARCH_OVERRIDES[symbol] ||
      stockSpecificBridgeSeed(symbol, 'base') ||
      stockSpecificBridgeSeed(symbol, 'upside') ||
      OPPORTUNITIES_FIRST_BRIDGE_ROLLOUT_SYMBOLS.has(symbol),
  );
}

type BridgeAwareSnapshotBundle = {
  targetSnapshot: DeepDiveTargetSnapshot;
  baseCaseDetail: DeepDiveValuationCaseDetail | null;
  scenarioCaseDetail: DeepDiveValuationCaseDetail | null;
  sharedVerifiedBasis: DeepDiveSharedVerifiedBasis | null;
  assumptionLedger?: DeepDiveValuationAssumptionLedgerItem[];
  valuationConfidenceGate?: DeepDiveValuationConfidenceGate | null;
  scenarioNote: string | null;
  scenarioBridges: DeepDiveScenarioNarrative[];
  valuationBridge: DeepDiveValuationBridge | null;
  priceTargetRationale: string | null;
  peerComparison: string | null;
};

function buildBridgeAwareSnapshotBundle(params: {
  symbol: string;
  currentPrice: number | null;
  latestSourceAt?: string | null;
  reportUpdatedAt?: string | null;
  priceAsOf?: string | null;
  thesisTitle?: string | null;
  thesisSummary?: string | null;
  valuationCases?: ValuationCaseView[] | null;
  monthlyRevenue?: number | null;
  yoyGrowth?: number | null;
  momGrowth?: number | null;
  revenueAnnual?: number | null;
  epsTtm?: number | null;
  peRatio?: number | null;
  pbRatio?: number | null;
  grossMargin?: number | null;
  operatingMargin?: number | null;
  baseEvidenceRefs?: string[];
  scenarioEvidenceRefs?: string[];
}): BridgeAwareSnapshotBundle {
  const normalizedMonthlyRevenue = nullIfMissingMetric(params.monthlyRevenue);
  const normalizedRevenueAnnual = nullIfMissingMetric(params.revenueAnnual);
  const normalizedGrossMargin = nullIfMissingMetric(params.grossMargin);
  const normalizedPbRatio = nullIfMissingMetric(params.pbRatio);
  const normalizedEpsTtm = nullIfZeroMetric(params.epsTtm);
  const normalizedPeRatio = nullIfZeroMetric(params.peRatio);
  const normalizedOperatingMargin = nullIfZeroMetric(params.operatingMargin);
  const fallbackValuationCases = seedFallbackValuationCases(params.symbol, params.currentPrice);
  const rawValuationCases =
    shouldPreferSeedBridgeSnapshot(params.symbol, params.currentPrice)
      ? fallbackValuationCases
      : params.valuationCases && params.valuationCases.length > 0
      ? params.valuationCases
      : fallbackValuationCases;
  const { valuationCases } = ensureValuationCaseCompleteness(rawValuationCases);
  const initialTargetSnapshot = buildTargetSnapshot(
    params.currentPrice,
    valuationCases.find((item) => item.caseType === 'base')?.targetPrice ?? null,
    valuationCases.find((item) => item.caseType === 'upside')?.targetPrice ?? null,
    valuationCases.find((item) => item.caseType === 'invalidation')?.targetPrice ?? null,
    params.latestSourceAt ?? null,
    params.reportUpdatedAt ?? null,
    params.priceAsOf ?? null,
  );
  const { valuationBridge, scenarioBridges, priceTargetRationale } = buildValuationBridgeSummary(valuationCases, {
    symbol: params.symbol,
    thesisTitle: params.thesisTitle ?? null,
    thesisSummary: params.thesisSummary ?? null,
    currentPrice: params.currentPrice ?? null,
    monthlyRevenue: normalizedMonthlyRevenue,
    yoyGrowth: params.yoyGrowth ?? null,
    momGrowth: params.momGrowth ?? null,
    revenueAnnual: normalizedRevenueAnnual,
    epsTtm: normalizedEpsTtm,
    peRatio: normalizedPeRatio,
    pbRatio: normalizedPbRatio,
    grossMargin: normalizedGrossMargin,
    operatingMargin: normalizedOperatingMargin,
  });
  const baseScenarioBridge = scenarioBridges.find((item) => item.key === 'base') || null;
  const upsideScenarioBridge = scenarioBridges.find((item) => item.key === 'upside') || null;
  const invalidationScenario = scenarioBridges.find((item) => item.key === 'invalidation') || null;
  const baseCaseDetail = buildValuationCaseDetail(
    'Base 估值框架',
    baseScenarioBridge,
    valuationBridge,
    params.baseEvidenceRefs || [],
    Boolean(
      (baseScenarioBridge?.operatingAssumptions || []).some((item) => item.isEstimated) ||
        (baseScenarioBridge?.estimatedFields || []).length > 0,
    ),
  );
  const scenarioCaseDetail = buildValuationCaseDetail(
    '情境估值框架',
    upsideScenarioBridge,
    valuationBridge,
    params.scenarioEvidenceRefs || [],
    Boolean(
      (upsideScenarioBridge?.operatingAssumptions || []).some((item) => item.isEstimated) ||
      (upsideScenarioBridge?.estimatedFields || []).length > 0,
    ),
  );
  const sharedVerifiedBasis = buildSharedVerifiedBasis({
    baseCaseDetail,
    scenarioCaseDetail,
    monthlyRevenue: normalizedMonthlyRevenue,
    revenueAnnual: normalizedRevenueAnnual,
    grossMargin: normalizedGrossMargin,
    operatingMargin: normalizedOperatingMargin,
    epsTtm: normalizedEpsTtm,
    peRatio: normalizedPeRatio,
    pbRatio: normalizedPbRatio,
  });
  if (baseCaseDetail && sharedVerifiedBasis) {
    baseCaseDetail.sharedBasisRefs = sharedVerifiedBasis.sharedBasisRefs;
  }
  if (scenarioCaseDetail) {
    scenarioCaseDetail.sharedBasisRefs = sharedVerifiedBasis?.sharedBasisRefs || [];
    scenarioCaseDetail.deltaAssumptions = buildScenarioDeltaAssumptions(baseCaseDetail, scenarioCaseDetail);
    scenarioCaseDetail.hasIndependentDelta = hasIndependentScenarioDelta(baseCaseDetail, scenarioCaseDetail);
    scenarioCaseDetail.achievementChecklist = buildScenarioAchievementChecklist({
      baseCaseDetail,
      scenarioCaseDetail,
      monthlyRevenue: normalizedMonthlyRevenue,
      technicalEntrySignal: null,
      sourceRefs: params.scenarioEvidenceRefs || [],
    });
  }
  const scenarioNote =
    scenarioCaseDetail && scenarioCaseDetail.hasIndependentDelta === false
      ? '目前尚無獨立上行情境，Base 已涵蓋主要已知故事。'
      : null;
  const targetSnapshot: DeepDiveTargetSnapshot = buildBridgeAwareTargetSnapshot(
    initialTargetSnapshot,
    baseCaseDetail,
    scenarioCaseDetail,
    invalidationScenario,
  );
  const promotionGate = attachScenarioPromotionGate(baseCaseDetail, scenarioCaseDetail, targetSnapshot);
  targetSnapshot.scenarioPromotionStatus = promotionGate?.status || null;
  applyRevaluationSlaToTargetSnapshot(targetSnapshot, buildRevaluationJobSummary({ targetSnapshot, promotionGate }));
  return {
    targetSnapshot,
    baseCaseDetail,
    scenarioCaseDetail,
    sharedVerifiedBasis,
    scenarioNote,
    scenarioBridges,
    valuationBridge,
    priceTargetRationale,
    peerComparison: buildPeerComparisonSentence(
      baseScenarioBridge,
      valuationBridge,
      normalizedPeRatio,
      normalizedPbRatio,
    ),
  };
}

function syncRecommendationCardToBridgeSnapshot(
  rec: RecommendationCard,
  bundle: BridgeAwareSnapshotBundle,
): RecommendationCard {
  const targetSnapshot = bundle.targetSnapshot;
  const confidence = buildRecommendationConfidence(rec, bundle);
  const draftModelSignal = modelSignalForRecommendation(rec);
  const mlForecastBand = buildAssistiveMlForecastBand({
    currentPrice: targetSnapshot.currentPrice ?? rec.currentPrice ?? null,
    modelSignal: draftModelSignal,
    brokerConsensus: null,
    sourceRefs: citationIds([...(bundle.baseCaseDetail?.sourceRefs || []), ...(bundle.scenarioCaseDetail?.sourceRefs || [])].filter(isExternalCitationRef)),
    entryVerdict: confidence.entryReadinessLabel,
  });
  const draft: RecommendationCard = {
    ...rec,
    currentPrice: targetSnapshot.currentPrice ?? rec.currentPrice ?? null,
    priceAsOf: targetSnapshot.priceAsOf ?? rec.priceAsOf ?? null,
    priceRefreshStatus: targetSnapshot.priceRefreshStatus ?? rec.priceRefreshStatus ?? null,
    targetPrice: targetSnapshot.baseTarget ?? null,
    baseTarget: targetSnapshot.baseTarget ?? null,
    upsideTarget: targetSnapshot.upsideTarget ?? null,
    expectedUpsidePct: targetSnapshot.displayBaseUpsidePct ?? null,
    displayBaseUpsidePct: targetSnapshot.displayBaseUpsidePct ?? null,
    displayScenarioUpsidePct: targetSnapshot.displayScenarioUpsidePct ?? null,
    cardPrimaryUpsidePct: targetSnapshot.cardPrimaryUpsidePct ?? null,
    cardPrimaryUpsideLabel: targetSnapshot.cardPrimaryUpsideLabel,
    isFallbackValuation: targetSnapshot.bridgeCompleteness !== 'complete',
    recommendationConfidenceScore: confidence.score,
    researchConfidenceScore: confidence.score,
    scenarioChecklistProgress: confidence.scenarioProgress,
    scenarioChecklistBreakdown: confidence.scenarioBreakdown,
    scenarioChecklistScoreDetails: confidence.scenarioScoreDetails,
    entryReadinessLabel: confidence.entryReadinessLabel,
    entryReadinessReasons: confidence.entryReadinessReasons,
    baseVerificationLabel: confidence.baseVerificationLabel,
    confidenceScoreBreakdown: confidence.scoreBreakdown,
    revaluationStatus: targetSnapshot.revaluationStatus ?? (targetSnapshot.bridgeCompleteness === 'complete' ? 'rebuilt' : 'pending'),
    revaluationJobSummary: targetSnapshot.revaluationJobStatus || null,
    revaluationSlaStatus: targetSnapshot.revaluationSlaStatus || null,
    nextRevaluationAt: targetSnapshot.nextRevaluationAt || null,
    missingRepricingEvidence: targetSnapshot.missingRepricingEvidence || targetSnapshot.repricingRequiredEvidence || [],
    brokerEvidenceSearchStatus: targetSnapshot.brokerEvidenceSearchStatus || null,
    scenarioPromotionStatus: targetSnapshot.scenarioPromotionStatus || bundle.scenarioCaseDetail?.promotionGate?.status || null,
    scenarioPromotionGate: bundle.scenarioCaseDetail?.promotionGate || null,
    revaluationReason:
      targetSnapshot.repricingReason ||
      (targetSnapshot.bridgeCompleteness === 'complete'
        ? '本輪已重建 bridge-aware target snapshot；資金輪動與籌碼技術只調整信心與進場狀態。'
        : 'bridge 資料不足，等待來源刷新後重建 target snapshot。'),
    peValuationSignal: buildPeValuationSignal(rec, {
      baseCaseDetail: bundle.baseCaseDetail,
      scenarioCaseDetail: bundle.scenarioCaseDetail,
    }),
    forwardPeSignal: buildForwardPeSignalFromBridge(buildForwardPeBridge({ currentPrice: targetSnapshot.currentPrice, baseCaseDetail: bundle.baseCaseDetail })),
    crossThemeSignals: buildCrossThemeSignalsFromText({
      symbol: rec.symbol,
      name: rec.name,
      text: detailText(rec.thesisTitle, rec.thesisSummary, rec.catalystSummary, bundle.baseCaseDetail?.driver, bundle.scenarioCaseDetail?.driver),
      sourceRefs: citationIds([...(bundle.baseCaseDetail?.sourceRefs || []), ...(bundle.scenarioCaseDetail?.sourceRefs || [])].filter(isExternalCitationRef)),
    }),
    globalThemeLeadLagSignal: rec.globalThemeLeadLagSignal || globalLeadLagSignalForSymbol(rec.symbol),
    globalLeadLagSummary:
      rec.globalLeadLagSummary ||
      (rec.globalThemeLeadLagSignal || globalLeadLagSignalForSymbol(rec.symbol))?.summary ||
      null,
    recommendationLifecycleStage: null,
    thesisMomentumScore: null,
    recommendationStabilityScore: null,
    whyChanged: null,
    modelSignal: draftModelSignal,
    mlUpsideProbability: mlForecastBand?.horizons.find((item) => item.days === 120)?.upsideProbability ?? rec.mlUpsideProbability ?? null,
    mlForecastSummary: mlForecastSummaryFor(mlForecastBand) || rec.mlForecastSummary || null,
    whyModelDidNotPromote:
      rec.whyModelDidNotPromote ||
      'ML/PTT/社群訊號只作 discovery 與覆核提示；正式推薦仍需公式估值、外部來源、籌碼與技術 gate。',
    repricingRequiredEvidence: targetSnapshot.repricingRequiredEvidence,
  };
  const enrichedDraft = {
    ...draft,
    recommendationLifecycleStage: recommendationLifecycleStageFor(draft),
    thesisMomentumScore: thesisMomentumScoreFor(draft),
    recommendationStabilityScore: recommendationStabilityScoreFor(draft),
    whyChanged:
      targetSnapshot.verdict === 'formal'
        ? 'bridge-aware snapshot 已重建且仍有 Base 價差。'
        : targetSnapshot.verdict === 'scenario'
          ? 'Base 已接近反映，改列上行情境追蹤。'
          : targetSnapshot.targetCoverageStatus === 'over_base_and_scenario'
            ? '現價已高於 Base/情境，改為估值已反映。'
            : '本輪資料更新後仍待 gate 驗證。',
  } satisfies RecommendationCard;
  const sanity = evaluateValuationSanity(draft, {
    baseCaseDetail: bundle.baseCaseDetail,
    scenarioCaseDetail: bundle.scenarioCaseDetail,
    sharedVerifiedBasis: bundle.sharedVerifiedBasis,
  });
  return applyRecommendationGateMetadata({
    ...enrichedDraft,
    valuationSanityStatus: sanity.valuationSanityStatus,
    valuationSanityReason: sanity.valuationSanityReason,
    baseTargetVerificationStatus: sanity.valuationSanityStatus === 'normal' ? 'verified' : 'insufficient_verified_basis',
    whyBaseIsFormal:
      sanity.valuationSanityStatus === 'normal' && targetSnapshot.verdict === 'formal'
        ? 'Base 目標價由 bridge-aware 財務推導支撐，且通過估值安全 gate。'
        : null,
    whyBaseIsNotFormal:
      sanity.valuationSanityStatus === 'normal' && targetSnapshot.verdict === 'formal'
        ? null
        : sanity.valuationSanityReason || targetSnapshot.overTargetReason || 'Base 尚未通過正式推薦 gate。',
  });
}

function ensureRecommendationRevaluationMetadata(rec: RecommendationCard): RecommendationCard {
  const peValuationSignal = rec.peValuationSignal || buildPeValuationSignal(rec);
  const forwardPeSignal =
    rec.forwardPeSignal ||
    (rec.peValuationSignal
      ? {
          currentForwardPe: rec.peValuationSignal.currentPe,
          targetForwardPe: rec.peValuationSignal.normalizedPe,
          forwardEps: null,
          status: rec.peValuationSignal.normalizedPe ? ('estimated' as const) : ('missing_forward_eps' as const),
          summary: rec.peValuationSignal.reratingReason,
        }
      : null);
  const base: RecommendationCard = {
    ...rec,
    peValuationSignal,
    forwardPeSignal,
    crossThemeSignals:
      rec.crossThemeSignals ||
      buildCrossThemeSignalsFromText({
        symbol: rec.symbol,
        name: rec.name,
        text: detailText(rec.thesisTitle, rec.thesisSummary, rec.catalystSummary),
      }),
    globalThemeLeadLagSignal: rec.globalThemeLeadLagSignal || globalLeadLagSignalForSymbol(rec.symbol),
    globalLeadLagSummary:
      rec.globalLeadLagSummary ||
      (rec.globalThemeLeadLagSignal || globalLeadLagSignalForSymbol(rec.symbol))?.summary ||
      null,
    modelSignal: rec.modelSignal || modelSignalForRecommendation(rec),
  };
  const lifecycleStage = base.recommendationLifecycleStage || recommendationLifecycleStageFor(base);
  return applyRecommendationGateMetadata({
    ...base,
    recommendationLifecycleStage: lifecycleStage,
    thesisMomentumScore: base.thesisMomentumScore ?? thesisMomentumScoreFor(base),
    recommendationStabilityScore: base.recommendationStabilityScore ?? recommendationStabilityScoreFor(base),
    whyChanged: base.whyChanged || '尚未取得會改變基本面 bridge 的新資料，保留在觀察/候選生命週期。',
    revaluationStatus: base.revaluationStatus || 'unchanged',
    revaluationJobSummary:
      base.revaluationJobSummary ||
      buildRevaluationJobSummary({
        targetSnapshot: {
          staleReason: base.staleReason || null,
          archiveReason: base.archiveReason || null,
          reportUpdatedAt: base.lastValidatedAt || null,
          repricedAt: base.lastValidatedAt || null,
          repricingReason: base.revaluationReason || null,
          unchangedReason: base.revaluationStatus === 'unchanged' ? base.revaluationReason || '本輪尚未取得足以重估 target 的新資料。' : null,
          bridgeCompleteness: base.baseTarget != null || base.upsideTarget != null ? 'complete' : 'insufficient',
          repricingRequiredEvidence: base.repricingRequiredEvidence || [],
          targetCoverageStatus: base.targetCoverageStatus || recommendationTargetCoverage(base),
        },
      }),
    revaluationReason:
      base.revaluationReason ||
      '本輪未取得完整 bridge-aware 重估輸入，暫沿用最近正式推薦 target；資金輪動與籌碼技術仍會影響排序與進場狀態。',
    confidenceScoreBreakdown: {
      bridgeEvidence: base.confidenceScoreBreakdown?.bridgeEvidence ?? Math.round((base.evidenceScore ?? 0.5) * 100),
      freshness: base.confidenceScoreBreakdown?.freshness ?? 50,
      scenario: base.confidenceScoreBreakdown?.scenario ?? base.scenarioChecklistProgress ?? 0,
      entryReadiness: base.confidenceScoreBreakdown?.entryReadiness ?? Math.round((base.timingScore ?? 0.5) * 100),
      upsideQuality: base.confidenceScoreBreakdown?.upsideQuality ?? Math.round(Math.min(1, Math.max(0, base.expectedUpsidePct ?? 0) / 80) * 100),
      sectorRotationImpact: base.confidenceScoreBreakdown?.sectorRotationImpact ?? Math.round((base.timingScore ?? 0.5) * 100),
    },
  });
}

function buildRecommendationConfidence(
  rec: RecommendationCard,
  bundle: BridgeAwareSnapshotBundle,
): {
  score: number;
  scenarioProgress: number;
  scenarioBreakdown: RecommendationCard['scenarioChecklistBreakdown'];
  scenarioScoreDetails: RecommendationCard['scenarioChecklistScoreDetails'];
  entryReadinessLabel: string;
  entryReadinessReasons: string[];
  baseVerificationLabel: string;
  scoreBreakdown: NonNullable<RecommendationCard['confidenceScoreBreakdown']>;
} {
  const targetSnapshot = bundle.targetSnapshot;
  const sourceRefCount = new Set([
    ...(bundle.baseCaseDetail?.sourceRefs || []),
    ...(bundle.scenarioCaseDetail?.sourceRefs || []),
    ...(bundle.sharedVerifiedBasis?.sharedBasisRefs || []),
  ]).size;
  const estimatedFieldPenalty = Math.min(0.18, ((bundle.baseCaseDetail?.estimatedFields?.length || 0) + (bundle.scenarioCaseDetail?.estimatedFields?.length || 0)) * 0.018);
  const bridgeEvidence =
    targetSnapshot.bridgeCompleteness === 'complete'
      ? clamp(0.48 + ((rec.evidenceScore ?? 0.5) * 0.18) + Math.min(0.24, sourceRefCount * 0.035) - estimatedFieldPenalty, 0.32, 1)
      : 0.28;
  const sourceAgeHours =
    rec.evidenceAgeHours ??
    (targetSnapshot.latestSourceAt ? Math.max(0, (Date.now() - new Date(targetSnapshot.latestSourceAt).getTime()) / (1000 * 60 * 60)) : null);
  const freshness = sourceAgeHours == null ? 0.5 : clamp(Math.exp(-sourceAgeHours / 168), 0.18, 1);
  const checklist = bundle.scenarioCaseDetail?.achievementChecklist || [];
  const scenarioProgress = bundle.scenarioCaseDetail?.hasIndependentDelta ? scenarioChecklistProgress(checklist) : 0;
  const scenarioBreakdown = scenarioChecklistBreakdown(checklist);
  const scenarioScoreDetails = scenarioChecklistScoreDetails(checklist);
  const entryRaw = rec.timingScore ?? (rec.recommendationState === 'actionable_setup' ? 0.82 : rec.recommendationState === 'validated_thesis' ? 0.68 : 0.48);
  const technicalChecklist = checklist.find((item) => item.label.includes('技術'));
  const technicalScore = technicalChecklist ? scenarioChecklistItemScore(technicalChecklist) : 0.35;
  const entryReadiness = clamp(entryRaw * 0.52 + technicalScore * 0.28 + bridgeEvidence * 0.1 + freshness * 0.1);
  const upsideRaw = Math.max(0, targetSnapshot.cardPrimaryUpsidePct ?? rec.expectedUpsidePct ?? 0);
  const entryReadinessLabel =
    technicalScore < 0.22
      ? '資料不足暫緩'
      : rec.recommendationBucket === 'scenario_upside'
        ? '突破確認再追'
        : entryReadiness >= 0.86 && upsideRaw >= 12 && upsideRaw <= 85
          ? '可小量分批'
          : entryReadiness >= 0.7 && upsideRaw >= 35
            ? '等回測'
            : entryReadiness >= 0.64 && upsideRaw < 35
              ? '突破確認再追'
              : entryReadiness < 0.42
                ? '資料不足暫緩'
                : '等回測';
  const entryReadinessReasons = [
    technicalChecklist ? `${technicalChecklist.label}：${technicalChecklist.status}，分數 ${Math.round(technicalScore * 100)}` : null,
    sourceAgeHours != null ? `來源新鮮度 ${Math.round(freshness * 100)}（約 ${Math.round(sourceAgeHours)} 小時）` : null,
    rec.timingScore != null ? `籌碼/技術 timing ${Math.round(rec.timingScore * 100)}%` : null,
  ].filter((item): item is string => Boolean(item));
  const upsideQuality = Math.min(1, upsideRaw / 80);
  const sectorRotationImpact = clamp((rec.timingScore ?? 0.5) * 0.65 + freshness * 0.2 + bridgeEvidence * 0.15, 0, 1);
  const scoreBreakdown = {
    bridgeEvidence: Math.round(bridgeEvidence * 100),
    freshness: Math.round(freshness * 100),
    scenario: scenarioProgress,
    entryReadiness: Math.round(entryReadiness * 100),
    upsideQuality: Math.round(upsideQuality * 100),
    sectorRotationImpact: Math.round(sectorRotationImpact * 100),
  };
  const score = Math.round(
    (
      bridgeEvidence * 0.28 +
      freshness * 0.22 +
      (scenarioProgress / 100) * 0.2 +
      entryReadiness * 0.13 +
      upsideQuality * 0.09 +
      sectorRotationImpact * 0.08
    ) * 100,
  );
  return {
    score,
    scenarioProgress,
    scenarioBreakdown,
    scenarioScoreDetails,
    entryReadinessLabel,
    entryReadinessReasons,
    scoreBreakdown,
    baseVerificationLabel:
      targetSnapshot.bridgeCompleteness === 'complete'
        ? freshness >= 0.78
          ? 'Base 已有近期證據'
          : 'Base 完整但來源需刷新'
        : 'Base 橋接不足',
  };
}

function buildRadarTechnicalSnapshotFromSignalRow(row: Row | null | undefined): StockDeepDivePayload['technicalSnapshot'] | null {
  if (!row) return null;
  // The legacy stock_signals schema stores 5/10/20-day averages in the
  // short/mid/long columns.  Never relabel them as MA20/60/120.
  const ma5 = row.ma_short != null ? toFiniteNumber(row.ma_short, Number.NaN) : Number.NaN;
  const ma10 = row.ma_mid != null ? toFiniteNumber(row.ma_mid, Number.NaN) : Number.NaN;
  const ma20 = row.ma_long != null ? toFiniteNumber(row.ma_long, Number.NaN) : Number.NaN;
  const rsi = row.rsi != null ? toFiniteNumber(row.rsi, Number.NaN) : Number.NaN;
  const macd = row.macd != null ? toFiniteNumber(row.macd, Number.NaN) : Number.NaN;
  const macdSignal = row.macd_signal != null ? toFiniteNumber(row.macd_signal, Number.NaN) : Number.NaN;
  const hasTechnical = [ma5, ma10, ma20, rsi, macd, macdSignal].some((value) => Number.isFinite(value));
  if (!hasTechnical) return null;
  return {
    ma5: Number.isFinite(ma5) ? ma5 : null,
    ma10: Number.isFinite(ma10) ? ma10 : null,
    ma20: Number.isFinite(ma20) ? ma20 : null,
    ma60: null,
    ma120: null,
    ma240: null,
    rsi: Number.isFinite(rsi) ? rsi : null,
    macd: Number.isFinite(macd) ? macd : null,
    macdSignal: Number.isFinite(macdSignal) ? macdSignal : null,
    fibonacci: null,
    dataSource: 'stock_signals',
    missingReason: null,
  };
}

function alignRecommendationEntryReadiness(
  card: RecommendationCard,
  chipEntryAssessment: StockDeepDivePayload['chipEntryAssessment'] | null,
  technicalEntrySignal: StockDeepDivePayload['technicalEntrySignal'] | null,
  chipOnlyOverride?: { label: string; reason: string } | null,
): RecommendationCard {
  if (!chipEntryAssessment && !technicalEntrySignal && !chipOnlyOverride) return card;
  const chipVerdict = chipEntryAssessment?.verdict || null;
  const technicalVerdict = technicalEntrySignal?.verdict || null;
	  const label =
	    chipOnlyOverride?.label ||
	    (chipVerdict === '資料不足不買' || chipVerdict === '資料不足暫緩'
	      ? '資料不足暫緩'
	      : chipVerdict === '籌碼偏亂先不買'
	        ? '籌碼偏亂先不買'
          : chipVerdict === '趨勢轉弱' || technicalVerdict === '趨勢轉弱'
            ? '趨勢轉弱'
	            : chipVerdict === '可小量分批' || technicalVerdict === '適合分批'
	              ? '可小量分批'
	              : chipVerdict === '突破後小量追蹤'
	                ? '突破後小量追蹤'
	                : chipVerdict === '突破確認再追'
	                  ? '突破確認再追'
                    : chipVerdict === '過熱不追' || technicalVerdict === '過熱不追'
                      ? '過熱不追'
	                  : card.entryReadinessLabel);
  const reasons = uniqueNarrativeLines(
    [
      chipOnlyOverride?.reason || null,
      chipEntryAssessment?.summary ? `籌碼/買點：${chipEntryAssessment.summary}` : null,
      technicalEntrySignal?.summary ? `技術：${technicalEntrySignal.summary}` : null,
      ...(card.entryReadinessReasons || []),
    ],
    3,
  );
  return {
    ...card,
    entryReadinessLabel: label,
    entryReadinessReasons: reasons,
    entryActionLabel: chipEntryAssessment?.entryDecision?.action || technicalEntrySignal?.entryDecision?.action || null,
    entryDecision: chipEntryAssessment?.entryDecision || technicalEntrySignal?.entryDecision || null,
  };
}

function buildRadarChipOnlyOverride(chipSnapshot: DeepDiveChipSnapshot | null): { label: string; reason: string } | null {
  if (!chipSnapshot || chipSnapshot.dataStatus?.status === 'missing') return null;
  const foreign5d = chipSnapshot.institutionalFlows.foreign.net5d ?? null;
  const trust5d = chipSnapshot.institutionalFlows.investmentTrust.net5d ?? null;
  const dealer5d = chipSnapshot.institutionalFlows.dealer.net5d ?? null;
  const marginChange = chipSnapshot.marginFinancing.change ?? null;
  const marginUsage = chipSnapshot.marginFinancing.usageRatio ?? null;
  const shortUsage = chipSnapshot.shortInterest.usageRatio ?? null;
  const sblBalance = chipSnapshot.shortInterest.sblBalance ?? null;
  const institutionalSelling = (foreign5d ?? 0) < 0 && (trust5d ?? 0) <= 0;
  const marginCrowded = (marginUsage ?? 0) >= 24 || ((marginChange ?? 0) > 0 && (foreign5d ?? 0) <= 0);
  const shortPressure = (shortUsage ?? 0) >= 8 || ((sblBalance ?? 0) > 0 && (dealer5d ?? 0) < 0);
  if (institutionalSelling && (marginCrowded || shortPressure)) {
    return {
      label: '籌碼偏亂先不買',
      reason: sentenceFromBridgeSegments(
        [
          `籌碼 gate：外資/投信近 5 日 ${signedLots(foreign5d)} / ${signedLots(trust5d)}。`,
          marginCrowded ? `融資變化 ${signedLots(marginChange)}、使用率 ${pctText(marginUsage)}，追價籌碼較亂。` : null,
          shortPressure ? `融券/借券壓力偏高，短線波動風險上升。` : null,
        ],
        '籌碼 gate：法人、融資或借券結構尚未支持追價。',
      ),
    };
  }
  const institutionalBuying = (foreign5d ?? 0) > 0 && ((trust5d ?? 0) > 0 || (foreign5d ?? 0) > 0);
  if (institutionalBuying && !marginCrowded && !shortPressure) {
    return {
      label: '可小量分批',
      reason: `籌碼 gate：外資/投信近 5 日 ${signedLots(foreign5d)} / ${signedLots(trust5d)}，融資與借券未構成主要扣分。`,
    };
  }
  return null;
}

function syncDiscoveredStockToBridgeSnapshot(
  stock: DiscoveredStockCard,
  bundle: BridgeAwareSnapshotBundle,
): DiscoveredStockCard {
  const targetSnapshot = bundle.targetSnapshot;
  const canonicalTarget = targetSnapshot.baseTarget ?? targetSnapshot.upsideTarget ?? null;
  const canonicalUpsidePct = targetSnapshot.displayBaseUpsidePct ?? targetSnapshot.displayScenarioUpsidePct ?? null;
  return {
    ...stock,
    price: targetSnapshot.currentPrice ?? stock.price ?? null,
    currentPrice: targetSnapshot.currentPrice ?? stock.currentPrice ?? null,
    priceAsOf: targetSnapshot.priceAsOf ?? stock.priceAsOf ?? stock.latestMentionAt ?? null,
    targetPrice: canonicalTarget,
    expectedUpsidePct: canonicalUpsidePct,
    whyNotRecommended:
      canonicalUpsidePct == null
        ? stock.whyNotRecommended || whyNotRecommendedLabel(canonicalTarget == null ? 'valuation_missing' : 'base_target_below_price')
        : stock.whyNotRecommended,
  };
}

function chipNumber(value: unknown) {
  if (value == null) return null;
  const num =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(String(value).replace(/,/g, ''))
        : Number.NaN;
  return Number.isFinite(num) ? num : null;
}

function sumChipMetricWindow(rows: Row[], key: string, windowSize: number) {
  const values = rows
    .slice(0, windowSize)
    .map((row) => chipNumber((row.chip_metrics as Record<string, unknown> | null)?.[key]))
    .filter((value): value is number => value != null);
  if (values.length === 0) return null;
  return round(values.reduce((sum, value) => sum + value, 0), 0);
}

function chipTrendFromFlows(net5d: number | null, net20d: number | null) {
  if ((net5d ?? 0) > 0 && (net20d ?? 0) > 0) return 'buying' as const;
  if ((net5d ?? 0) < 0 && (net20d ?? 0) < 0) return 'selling' as const;
  if ((net5d ?? 0) === 0 && (net20d ?? 0) === 0) return 'neutral' as const;
  return 'mixed' as const;
}

function buildChipTimingAssessment(snapshot: DeepDiveChipSnapshot, verdict: 'formal' | 'scenario' | 'reflected') {
  const marginUsage = snapshot.marginFinancing.usageRatio ?? 0;
  const marginChange = snapshot.marginFinancing.change ?? 0;
  const shortUsage = snapshot.shortInterest.usageRatio ?? 0;
  const foreign5d = snapshot.institutionalFlows.foreign.net5d ?? 0;
  const trust5d = snapshot.institutionalFlows.investmentTrust.net5d ?? 0;
  const dealer5d = snapshot.institutionalFlows.dealer.net5d ?? 0;

  if (marginUsage >= 24 && marginChange > 0 && foreign5d <= 0) {
    return '融資使用率偏高且近期仍在增加，但外資沒有同步回補，追價風險偏高，較適合等待籌碼沉澱後再看。';
  }
  if (foreign5d > 0 && trust5d > 0 && marginUsage < 18) {
    return '外資與投信近五日仍偏買方，融資使用率沒有失控，籌碼結構較適合分批布局。';
  }
  if (shortUsage >= 8 && dealer5d < 0) {
    return '融券與借券賣出偏高，短線容易放大波動；若要進場，需更重視價格回檔與量縮是否止穩。';
  }
  if (verdict === 'scenario') {
    return '目前仍屬情境候選，籌碼面尚未提供足夠的追價安全邊際，較適合等法人與融資結構更乾淨時再評估。';
  }
  return '目前籌碼沒有失真到需要立即轉空，但也沒有出現非常舒服的進場結構；建議配合下一個營運驗證點分批處理。';
}

function buildChipSnapshotFromMetrics(chipMetrics: Record<string, unknown> | null | undefined, verdict: 'formal' | 'scenario' | 'reflected'): DeepDiveChipSnapshot | null {
  const metrics = chipMetrics || {};
  const marginBalance = chipNumber(metrics.margin_balance);
  const marginBuy = chipNumber(metrics.margin_buy);
  const marginSell = chipNumber(metrics.margin_sell);
  const marginChange = chipNumber(metrics.margin_balance_change) ?? (marginBuy != null || marginSell != null ? (marginBuy ?? 0) - (marginSell ?? 0) : null);
  const shortBalance = chipNumber(metrics.short_balance ?? metrics.margin_short_balance);
  const shortBuy = chipNumber(metrics.short_buy);
  const shortSell = chipNumber(metrics.short_sell);
  const shortChange =
    chipNumber(metrics.short_balance_change ?? metrics.margin_short_balance_change) ??
    (shortBuy != null || shortSell != null ? (shortSell ?? 0) - (shortBuy ?? 0) : null);
  const sblShortBalance = chipNumber(metrics.sbl_short_balance);
  const borrowAuxiliaryVolume = chipNumber(metrics.sbl_short_sale_volume);
  const borrowAuxiliaryOnly = Boolean(metrics.borrow_auxiliary_only || (sblShortBalance == null && borrowAuxiliaryVolume != null));
  const missingGroups = chipMissingGroups(metrics);
  const status =
    missingGroups.length === 0
      ? ('available' as const)
      : missingGroups.length >= 4
        ? ('missing' as const)
        : ('partial' as const);
  const dataStatus: NonNullable<DeepDiveChipSnapshot['dataStatus']> = {
    status,
    asOf: chipSourceAsOf(metrics),
    source: compactText(metrics.chip_source || metrics.source || '') || 'stock_signals/public-market-refresh',
    missingGroups,
    missingReasons: chipMissingReasons(metrics, missingGroups),
    fallbackUsed: Boolean(metrics.fallback_used || metrics.chip_source === 'stock_signals'),
    officialSblAsOf: compactText(metrics.official_sbl_as_of || '') || null,
    officialSblSourceUrl: compactText(metrics.official_sbl_source_url || '') || null,
    borrowAuxiliaryOnly,
    fallbackSourceUsed: compactText(metrics.fallback_source_used || metrics.fallback_source || '') || null,
  };
  const hasChipSignal =
    marginBalance != null ||
    shortBalance != null ||
    sblShortBalance != null ||
    chipNumber(metrics.foreign_net_5d) != null ||
    chipNumber(metrics.foreign_net_20d) != null;

  const snapshot: DeepDiveChipSnapshot = {
	    marginFinancing: {
	      balance: marginBalance,
	      change: marginChange,
	      usageRatio: chipNumber(metrics.margin_usage_ratio),
	      note: compactText(metrics.margin_note || '') || null,
	    },
	    shortInterest: {
	      balance: shortBalance,
	      change: shortChange,
      usageRatio: chipNumber(metrics.short_usage_ratio ?? metrics.margin_short_usage_ratio),
      note:
        compactText(metrics.short_note || metrics.margin_short_note || metrics.borrow_note || '') ||
        (borrowAuxiliaryOnly ? 'FinMind 目前僅提供借券成交量輔助，不把它當作借券賣出餘額。' : null),
      sblBalance: sblShortBalance,
    },
    institutionalFlows: {
      foreign: {
        latestNet: chipNumber(metrics.foreign_net),
        net5d: chipNumber(metrics.foreign_net_5d),
        net20d: chipNumber(metrics.foreign_net_20d),
        trend: chipTrendFromFlows(chipNumber(metrics.foreign_net_5d), chipNumber(metrics.foreign_net_20d)),
      },
      investmentTrust: {
        latestNet: chipNumber(metrics.investment_trust_net),
        net5d: chipNumber(metrics.investment_trust_net_5d),
        net20d: chipNumber(metrics.investment_trust_net_20d),
        trend: chipTrendFromFlows(chipNumber(metrics.investment_trust_net_5d), chipNumber(metrics.investment_trust_net_20d)),
      },
      dealer: {
        latestNet: chipNumber(metrics.dealer_net),
        net5d: chipNumber(metrics.dealer_net_5d),
        net20d: chipNumber(metrics.dealer_net_20d),
        trend: chipTrendFromFlows(chipNumber(metrics.dealer_net_5d), chipNumber(metrics.dealer_net_20d)),
      },
    },
    timingAssessment: hasChipSignal ? null : '法人、融資融券與借券來源尚未回傳有效數字；基本面即使正向，也先降為進場暫緩。',
    dataStatus,
  };
  snapshot.timingAssessment =
    dataStatus.status === 'missing'
      ? snapshot.timingAssessment
      : sentenceFromBridgeSegments(
          [
            dataStatus.status === 'partial' ? `${chipStatusLabel(dataStatus.status)}：${dataStatus.missingReasons.slice(0, 2).join(' ')}` : null,
            buildChipTimingAssessment(snapshot, verdict),
          ],
          buildChipTimingAssessment(snapshot, verdict),
        );
  return snapshot;
}

function sectorMatchesNarrative(sector: string, keywords: string[]) {
  const normalizedSector = sector.toLowerCase();
  const keywordText = keywords.join(' ').toLowerCase();
  const rules = [
    {
      sectorHints: ['ai', 'server', 'cloud', 'compute', 'odm'],
      keywordHints: ['ai', 'server', 'rack', 'odm', 'gb200', 'b200', '機櫃', '伺服器'],
    },
    {
      sectorHints: ['semi', 'chip', 'ic', 'foundry', 'memory'],
      keywordHints: ['半導體', '晶片', 'ic', 'soc', '記憶體', 'dram', 'ddr', 'nand', 'emmc'],
    },
    {
      sectorHints: ['network', 'optical', 'photonics', 'cpo'],
      keywordHints: ['cpo', '光通訊', '光模組', '800g', 'switch', 'network'],
    },
    {
      sectorHints: ['storage'],
      keywordHints: ['ssd', '儲存', 'nand', '記憶體', 'emmc'],
    },
  ];
  if (keywords.some((keyword) => keyword && normalizedSector.includes(keyword.toLowerCase()))) return true;
  return rules.some(
    (rule) =>
      rule.sectorHints.some((hint) => normalizedSector.includes(hint)) &&
      rule.keywordHints.some((hint) => keywordText.includes(hint.toLowerCase())),
  );
}

function buildMarketRotationSnapshot(focus: DailyMarketFocus | null, keywords: string[]) {
  if (!focus) {
    return {
      marketRotation: null,
      sectorFlow: null,
      sectorFlowScore: null,
    };
  }
  const rankedSectors = Object.entries(focus.sectorFlows || {})
    .filter((entry) => Number.isFinite(entry[1]))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4);
  if (rankedSectors.length === 0) {
    return {
      marketRotation: '目前缺少可用的族群資金輪動資料，暫時只能以前述個股與財務證據判斷。',
      sectorFlow: '市場輪動資料尚未刷新，暫時無法確認這檔股票是否處於資金主線。',
      sectorFlowScore: null,
    };
  }
  const topSectorsText = rankedSectors
    .map(([sector, score]) => `${sector}（${formatNumberLocal(score * 100)}）`)
    .join('、');
  const matchedSector = rankedSectors.find(([sector]) => sectorMatchesNarrative(sector, keywords));
  const matchedScore = matchedSector?.[1] ?? null;
  return {
    marketRotation: `目前台股資金主要輪向 ${topSectorsText}，代表大盤仍在優先交易這些族群的成長與題材延續。`,
    sectorFlow:
      matchedSector && matchedScore != null
        ? `${matchedSector[0]} 仍是近期相對強勢的資金主線之一，這檔股票若要維持推薦分數，就要持續看到法人與量價配合同步跟上。`
        : `目前資金主線與這檔股票的產業故事沒有完全重疊，代表即使基本面 thesis 成立，也可能先進入較長時間的整理期。`,
    sectorFlowScore: matchedScore == null ? 45 : round(50 + matchedScore * 50, 0),
  };
}

function readIndexNumber(indexState: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = toFiniteNumber(indexState?.[key], Number.NaN);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function readIndexText(indexState: Record<string, unknown> | null | undefined, keys: string[]) {
  for (const key of keys) {
    const value = indexState?.[key];
    if (value == null) continue;
    const text = compactText(value);
    if (text) return text;
  }
  return null;
}

function buildMarketIndexSignal(focus: DailyMarketFocus | null, topThemes: ThemeHeatCard[] = []): MarketIndexSignal {
  const indexState = focus?.indexState || {};
  const trendScore = readIndexNumber(indexState, [
    'trend_score',
    'market_trend_score',
    'taiex_trend_score',
    'risk_score',
    'regime_score',
  ]);
  const breadthScore = readIndexNumber(indexState, ['breadth_score', 'market_breadth_score', 'advance_decline_score']);
  const foreignFlow = readIndexNumber(indexState, ['foreign_net_5d', 'foreign_flow_5d', 'foreign_buy_sell_5d']);
  const taiexClose = readIndexNumber(indexState, ['taiex_close', 'twse_close', 'index_close', 'close']);
  const taiexMa20 = readIndexNumber(indexState, ['taiex_ma20', 'twse_ma20', 'ma20']);
  const taiexMa60 = readIndexNumber(indexState, ['taiex_ma60', 'twse_ma60', 'ma60']);
  const otcClose = readIndexNumber(indexState, ['otc_close', 'tpex_close']);
  const otcMa20 = readIndexNumber(indexState, ['otc_ma20', 'tpex_ma20']);
  const topThemeNames = topThemes.slice(0, 3).map((theme) => theme.themeName).filter(Boolean);
  const isFresh = focus?.freshness === 'fresh';
  const effectiveTrendScore =
    trendScore != null
      ? trendScore
      : isFresh && topThemeNames.length > 0
        ? 0.55
        : null;
  const status: MarketIndexSignal['status'] =
    effectiveTrendScore == null
      ? 'market_data_missing'
      : !isFresh
        ? 'market_data_missing'
        : effectiveTrendScore >= 0.68
          ? 'risk_on_can_attack'
          : effectiveTrendScore >= 0.55
            ? 'selective_only'
            : effectiveTrendScore >= 0.42
              ? 'risk_off_reduce'
              : 'market_breakdown_no_chase';
  const label =
    status === 'risk_on_can_attack'
      ? '風險偏好擴張，可攻主線'
      : status === 'selective_only'
        ? '選股盤，只做強勢主線'
        : status === 'risk_off_reduce'
          ? '大盤轉保守，降低部位'
          : status === 'market_breakdown_no_chase'
            ? '大盤轉弱，不追價'
            : '大盤資料待補';
  const riskBudget =
    status === 'risk_on_can_attack'
      ? '可用 10%–15% 分批建立主線股部位'
      : status === 'selective_only'
        ? '單檔以 5%–10% 為上限，只做相對強勢'
        : status === 'risk_off_reduce'
          ? '新倉 0%–5%，以回測買點與風控為主'
          : status === 'market_breakdown_no_chase'
            ? '停止追價，既有部位優先檢查停損/停利'
            : '資料待補前不提高風險預算';
  const entryBias =
    status === 'risk_on_can_attack'
      ? '趨勢股可用小部位先進場，突破或回測成功再加碼。'
      : status === 'selective_only'
        ? '只買主線與相對強勢股，避開弱勢族群。'
        : status === 'risk_off_reduce'
          ? '只等回測支撐，避免紅 K 追價。'
          : status === 'market_breakdown_no_chase'
            ? '不新增追價部位，等待指數站回關鍵均線。'
            : '等待大盤資料刷新後再決定進場節奏。';
  const exitBias =
    status === 'risk_on_can_attack'
      ? '跌破個股停損才降風險，趨勢未壞可續抱。'
      : status === 'selective_only'
        ? '跌破 MA20 或族群資金退潮先降一段。'
        : status === 'risk_off_reduce'
          ? '反彈到壓力優先減碼，弱勢股不戀戰。'
          : status === 'market_breakdown_no_chase'
            ? '跌破 MA60、情境價已反映或籌碼轉弱時直接出場。'
            : '資料不足時以個股停損與部位控管為主。';
  const taiexState =
    readIndexText(indexState, ['taiex_state', 'twse_state', 'index_state']) ||
    (taiexClose != null && taiexMa20 != null
      ? `加權指數 ${formatMoney(taiexClose)}，${taiexClose >= taiexMa20 ? '站上' : '跌破'} MA20${taiexMa60 != null ? `，MA60 ${formatMoney(taiexMa60)}` : ''}`
      : null);
  const otcState =
    readIndexText(indexState, ['otc_state', 'tpex_state']) ||
    (otcClose != null && otcMa20 != null ? `櫃買 ${formatMoney(otcClose)}，${otcClose >= otcMa20 ? '站上' : '跌破'} MA20` : null);
  const breadthState =
    readIndexText(indexState, ['breadth_state', 'advance_decline_state']) ||
    (breadthScore != null ? `市場廣度分數 ${formatNumberLocal(breadthScore * 100, 0)}` : null);
  const foreignFlowState =
    readIndexText(indexState, ['foreign_flow_state']) ||
    (foreignFlow != null ? `外資近 5 日 ${signedLots(foreignFlow)}` : null);
  const reasons = uniqueNarrativeLines(
    [
      taiexState,
      otcState,
      breadthState,
      foreignFlowState,
      topThemeNames.length > 0 ? `主線題材：${topThemeNames.join('、')}` : null,
      !isFresh ? '大盤資料偏舊，進場 Gate 先降級。' : null,
    ],
    6,
  );
  return {
    status,
    label,
    summary: `${label}；${entryBias}`,
    asOf: focus?.asOf || null,
    trendScore: effectiveTrendScore == null ? null : round(effectiveTrendScore, 3),
    taiexState,
    otcState,
    breadthState,
    foreignFlowState,
    riskBudget,
    entryBias,
    exitBias,
    reasons,
  };
}

function buildRelativeStrengthSignal(card: Pick<RecommendationCard, 'symbol' | 'timingScore' | 'globalThemeLeadLagSignal' | 'priceAsOf'>): NonNullable<RecommendationCard['relativeStrengthSignal']> {
  const leadLag = card.globalThemeLeadLagSignal || null;
  const stockReturnPct = leadLag?.twMovePct ?? null;
  const sectorReturnPct = leadLag?.foreignMovePct ?? null;
  const relativeToSectorPct =
    stockReturnPct != null && sectorReturnPct != null ? round(stockReturnPct - sectorReturnPct, 2) : null;
  const status: NonNullable<RecommendationCard['relativeStrengthSignal']>['status'] =
    relativeToSectorPct != null
      ? relativeToSectorPct >= 3
        ? 'outperforming'
        : relativeToSectorPct <= -3
          ? 'lagging'
          : 'inline'
      : (card.timingScore ?? 0) >= 68
        ? 'outperforming'
        : (card.timingScore ?? 50) <= 42
          ? 'lagging'
          : 'pending';
  const summary =
    relativeToSectorPct != null
      ? status === 'lagging'
        ? `台股同族群仍落後海外約 ${formatSignedPctLocal(relativeToSectorPct)}，可列補漲候選但需等個股 Gate。`
        : status === 'outperforming'
          ? `個股/台股映射已相對海外領先 ${formatSignedPctLocal(relativeToSectorPct)}，追價需更嚴格。`
          : '個股與海外同族群表現大致同步，回到估值與買點判斷。'
      : '相對大盤/海外族群資料待補；先用個股技術、籌碼與主題資金替代。';
  return {
    status,
    summary,
    stockReturnPct,
    marketReturnPct: null,
    sectorReturnPct,
    relativeToMarketPct: null,
    relativeToSectorPct,
    asOf: leadLag?.asOf || card.priceAsOf || null,
  };
}

function buildTradeDecision(params: {
  entryDecision: EntryDecision | null | undefined;
  marketIndexSignal: MarketIndexSignal;
  targetSnapshot?: Pick<DeepDiveTargetSnapshot, 'currentPrice' | 'baseTarget' | 'upsideTarget' | 'targetCoverageStatus' | 'staleReason' | 'overTargetReason' | 'repricingRequiredEvidence'> | null;
  card?: RecommendationCard | null;
  relativeStrengthSignal?: NonNullable<RecommendationCard['relativeStrengthSignal']> | null;
}): TradeDecision {
  const cleanTradePlanText = (value: string) =>
    value
      .replace(/站回\s*-\s*或回測/g, '站回關鍵均線或帶量突破前高，或回測')
      .replace(/突破\s*-\s*或回測/g, '突破前高或壓力，或回測')
      .replace(/重新帶量站上\s*-\s*後/g, '重新帶量站上前高或壓力後')
      .replace(/帶量突破\s*-\s*/g, '帶量突破前高或壓力 ')
      .replace(/站上\s*-\s*/g, '站上前高或壓力 ')
      .replace(/站回\s*-\s*/g, '站回關鍵均線 ')
      .replace(/突破\s*-\s*/g, '突破前高或壓力 ')
      .replace(/NT\$-/g, '關鍵價');
  const entryDecision = params.entryDecision || {
    action: '不買' as const,
    positionSize: '暫不新增部位',
    buyZone: '等待量價、籌碼與大盤資料補齊。',
    addCondition: '重新站回關鍵均線且大盤 Gate 解除後再評估。',
    stopLoss: '資料不足時不建立新倉。',
    invalidation: '資料不足時不建立新倉。',
    validUntil: '下一次資料刷新前',
    confidence: 20,
    reasons: ['缺少可操作進場資料。'],
    entryTriggers: [],
  };
  const target = params.targetSnapshot || params.card || null;
  const currentPrice = target?.currentPrice ?? params.card?.currentPrice ?? null;
  const baseTarget = target?.baseTarget ?? params.card?.baseTarget ?? null;
  const scenarioTarget = target?.upsideTarget ?? params.card?.upsideTarget ?? null;
  const targetCoverageStatus = target?.targetCoverageStatus ?? params.card?.targetCoverageStatus ?? null;
  const marketStatus = params.marketIndexSignal.status;
  const crossedScenario =
    targetCoverageStatus === 'over_base_and_scenario' ||
    (currentPrice != null && scenarioTarget != null && currentPrice >= scenarioTarget);
  const crossedBase =
    targetCoverageStatus === 'scenario_only' ||
    (currentPrice != null && baseTarget != null && currentPrice >= baseTarget && (scenarioTarget == null || currentPrice < scenarioTarget));
  let action = entryDecision.action;
  let positionSize = entryDecision.positionSize;
  let entryZone = cleanTradePlanText(entryDecision.buyZone);
  let addCondition = cleanTradePlanText(entryDecision.addCondition);
  let confidence = entryDecision.confidence;
  const reasons = uniqueNarrativeLines([params.marketIndexSignal.summary, ...(entryDecision.reasons || [])], 6);
  const reasonText = reasons.join(' ');
  const hasHardDataBlock = /資料不足|缺少可操作|缺法人|缺融資|缺融券|缺借券/.test(reasonText);
  const hasHardChipBlock = /籌碼 gate|籌碼結構不夠乾淨|融券\/借券|法人\/投信近 5 日|追價籌碼較亂/.test(reasonText);
  const hasScenarioRoom =
    !crossedScenario &&
    (targetCoverageStatus === 'base_upside' ||
      targetCoverageStatus === 'scenario_only' ||
      (currentPrice != null && scenarioTarget != null && currentPrice < scenarioTarget));
  const constructiveMarket = marketStatus === 'risk_on_can_attack' || marketStatus === 'selective_only';
  const marketGateReason = `${params.marketIndexSignal.label}：${params.marketIndexSignal.riskBudget}`;
  if (crossedScenario) {
    action = '停利';
    positionSize = '不新增部位；已有部位分批停利或降到 0%–30% 追蹤倉';
    entryZone = '現價已高於情境目標，等待重估或明確回測，不做新買點。';
    addCondition = `只有新增 ${((target?.repricingRequiredEvidence || params.card?.repricingRequiredEvidence || ['EPS / Forward PE / 券商或官方證據上修']) as string[]).slice(0, 3).join('、')} 後，才重新開放買點。`;
    confidence = Math.max(30, Math.min(confidence, 58));
  } else if (marketStatus === 'market_breakdown_no_chase') {
    action = crossedBase ? '減碼' : '不買';
    positionSize = crossedBase ? '已有獲利先降 1/3–1/2，新倉暫停' : '停止新倉，等待指數站回關鍵均線';
    entryZone = '大盤轉弱時不追價，只等個股回測支撐且大盤 Gate 轉回選股盤。';
    addCondition = '加碼條件：大盤站回 MA20、個股守住支撐、MACD 不再轉弱。';
    confidence = Math.max(25, Math.min(confidence, 52));
  } else if (marketStatus === 'risk_off_reduce' && ['建議買進', '建議小量買進', '可分批買進', '突破追蹤買進', '突破後小量追蹤'].includes(action)) {
    action = '等回測';
    positionSize = '最多 0%–5% 試單，偏向等回測，不追紅 K';
    entryZone = `只接受 ${cleanTradePlanText(entryDecision.buyZone)} 內的量縮回測，不追突破延伸。`;
    addCondition = `大盤 Gate 回到選股盤，且 ${cleanTradePlanText(entryDecision.addCondition)}`;
    confidence = Math.max(30, Math.min(confidence, 60));
  } else if (marketStatus === 'selective_only' && action === '建議小量買進') {
    action = '可分批買進';
    positionSize = '選股盤先 5%–10% 分批，不一次買滿';
    confidence = Math.max(45, Math.min(confidence, 72));
  }
  if (
    constructiveMarket &&
    hasScenarioRoom &&
    !hasHardDataBlock &&
    !hasHardChipBlock &&
    (action === '等回測' || action === '不追價' || action === '不買')
  ) {
    if (action === '等回測' || action === '不追價') {
      action = '突破追蹤買進';
      positionSize = marketStatus === 'risk_on_can_attack' ? '先 3%–5% 小量追蹤，回測守住再加到 10%' : '先 3% 以內試單，等待選股盤確認';
      entryZone = `非正式情境買點：${cleanTradePlanText(entryDecision.buyZone)}；若已站上壓力，第一筆只用追蹤倉，不一次買滿。`;
      addCondition = `加碼條件：${cleanTradePlanText(entryDecision.addCondition)}；且大盤 Gate 維持 ${params.marketIndexSignal.label}。`;
      confidence = Math.max(confidence, marketStatus === 'risk_on_can_attack' ? 62 : 56);
    } else {
      action = '等回測買點';
      positionSize = '目前不追價；觸發回測/突破條件後先 3%–5% 試單';
      entryZone = `可買條件：${cleanTradePlanText(entryDecision.buyZone)}`;
      addCondition = `觸發後再買：${cleanTradePlanText(entryDecision.addCondition)}；若大盤 Gate 轉弱則取消。`;
      confidence = Math.max(confidence, 54);
    }
  }
  if (crossedBase && !crossedScenario && action === '建議小量買進') {
    action = '突破追蹤買進';
    positionSize = 'Base 已反映，只能 3%–5% 追蹤情境，不當正式買進';
    entryZone = '等待情境 checklist 續達成；回測 Base/原壓力守住才可小量追蹤。';
  }
  const takeProfit =
    scenarioTarget != null
      ? `接近情境目標 ${formatMoney(scenarioTarget)} 分批停利；若已超過情境，直接轉熱股追蹤。`
      : baseTarget != null
        ? `接近 Base ${formatMoney(baseTarget)} 先停利或等重估。`
        : '目標價待補，先用技術停利與停損管理。';
  const exitCondition =
    crossedScenario
      ? target?.overTargetReason || params.card?.overTargetReason || '現價已高於情境目標，除非重估上修，否則不追價。'
      : marketStatus === 'market_breakdown_no_chase'
        ? params.marketIndexSignal.exitBias
        : `跌破停損或大盤 Gate 轉弱時減碼；${params.marketIndexSignal.exitBias}`;
  const exitTriggers: TradeDecision['exitTriggers'] = [
    {
      label: crossedScenario ? '情境已反映' : '停損失效',
      condition: crossedScenario ? exitCondition : entryDecision.stopLoss,
      action: crossedScenario ? '停利' : '出場',
      status: crossedScenario ? 'active' : 'waiting',
    },
    {
      label: '大盤 Gate 轉弱',
      condition: params.marketIndexSignal.exitBias,
      action: marketStatus === 'risk_off_reduce' || marketStatus === 'market_breakdown_no_chase' ? '減碼' : '不買',
      status: marketStatus === 'risk_off_reduce' || marketStatus === 'market_breakdown_no_chase' ? 'active' : 'waiting',
    },
  ];
  const entryTriggers = (entryDecision.entryTriggers || []).map((trigger) => {
    if (action === '不買' || action === '減碼' || action === '停利' || action === '出場') {
      return { ...trigger, status: 'blocked' as const, action: '不買' as const, positionSize };
    }
    if ((action === '等回測' || action === '等回測買點') && trigger.triggerType === 'buy_now') {
      return { ...trigger, status: 'waiting' as const, action, positionSize };
    }
    return { ...trigger, action: trigger.status === 'active' ? action : trigger.action, positionSize: trigger.positionSize || positionSize };
  });
  return {
    action,
    positionSize,
    entryZone: cleanTradePlanText(entryZone),
    addCondition: cleanTradePlanText(addCondition),
    stopLoss: cleanTradePlanText(entryDecision.stopLoss),
    takeProfit,
    exitCondition: cleanTradePlanText(exitCondition),
    marketGateReason,
    validUntil: entryDecision.validUntil,
    confidence: Math.round(clamp(confidence, 0, 100)),
    reasons,
    entryTriggers: entryTriggers.map((trigger) => ({
      ...trigger,
      condition: cleanTradePlanText(trigger.condition),
      invalidation: cleanTradePlanText(trigger.invalidation),
    })),
    exitTriggers: exitTriggers.map((trigger) => ({
      ...trigger,
      condition: cleanTradePlanText(trigger.condition),
    })),
  };
}

function buildMarketValuationAdjustment(params: {
  marketIndexSignal: MarketIndexSignal;
  targetCoverageStatus?: TargetCoverageStatus | null;
  staleReason?: string | null;
  scenarioPromotionGate?: RecommendationCard['scenarioPromotionGate'] | null;
  brokerEvidenceSearchStatus?: RecommendationCard['brokerEvidenceSearchStatus'] | DeepDiveTargetSnapshot['brokerEvidenceSearchStatus'] | null;
  globalThemeLeadLagSignal?: RecommendationCard['globalThemeLeadLagSignal'] | null;
}): MarketValuationAdjustment {
  const marketStatus = params.marketIndexSignal.status;
  const coverage = params.targetCoverageStatus || null;
  const scenarioScore = params.scenarioPromotionGate?.score ?? null;
  const brokerStatus = params.brokerEvidenceSearchStatus?.status || null;
  const brokerHit = brokerStatus === 'hit';
  const usBrokerHit = (params.brokerEvidenceSearchStatus?.usBrokerCount || 0) > 0;
  const leadLagSpread = params.globalThemeLeadLagSignal?.lagSpreadPct ?? null;
  const leadLagSupports = leadLagSpread != null && leadLagSpread >= 5;
  const crossedBase =
    coverage === 'scenario_only' ||
    params.staleReason === 'target_stale_due_price_crossed_base';
  const crossedScenario =
    coverage === 'over_base_and_scenario' ||
    params.staleReason === 'target_stale_due_price_crossed_scenario';
  const softScore =
    (marketStatus === 'risk_on_can_attack' ? 2 : marketStatus === 'selective_only' ? 1 : 0) +
    (crossedBase ? 1 : 0) +
    (scenarioScore != null && scenarioScore >= 70 ? 1 : 0) +
    (brokerHit ? 1 : 0) +
    (usBrokerHit ? 1 : 0) +
    (leadLagSupports ? 1 : 0);
  const marketReratingStatus: MarketValuationAdjustment['marketReratingStatus'] =
    marketStatus === 'market_data_missing'
      ? 'missing'
      : crossedScenario || marketStatus === 'risk_off_reduce' || marketStatus === 'market_breakdown_no_chase'
        ? 'compressing'
        : softScore >= 3
          ? 'supports_multiple_expansion'
          : 'neutral';
  const repricingTriggerStrength: MarketValuationAdjustment['repricingTriggerStrength'] =
    marketReratingStatus === 'missing'
      ? 'missing'
      : crossedScenario || marketReratingStatus === 'compressing'
        ? 'blocked'
        : softScore >= 4
          ? 'high'
          : softScore >= 2
            ? 'medium'
            : 'low';
  const requiredEvidence = uniqueNarrativeLines(
    [
      '最新月營收、毛利率或 EPS 基底上修',
      'Forward EPS 或 normalized PE/PB 有外部佐證',
      '券商 consensus / target PE 上修',
      '具名客戶、訂單、法說或官方公告補強',
      brokerHit ? null : '授權券商 API、使用者有權上傳的 PDF 或公司 IR 命中',
      scenarioScore != null && scenarioScore >= 85 ? null : '情境 checklist 達成率提高到可升 Base 門檻',
      leadLagSupports ? null : '海外同族群 lead-lag 或台股族群資金輪動確認',
    ],
    5,
  );
  const marketReratingReason =
    marketReratingStatus === 'supports_multiple_expansion'
      ? `${params.marketIndexSignal.label}，且情境/券商/海外族群至少部分支持 target PE 重新檢查。`
      : marketReratingStatus === 'compressing'
        ? crossedScenario
          ? '現價已高於情境目標，除非外部 EPS / target PE 證據上修，否則不把價格延伸視為新 Base。'
          : `${params.marketIndexSignal.label} 偏保守，multiple expansion 需要更強外部證據。`
        : marketReratingStatus === 'missing'
          ? '大盤資料待補，暫不能用市場 rerating 支撐估值上修。'
          : `${params.marketIndexSignal.label} 目前只支援選股與部位控管，尚不足以單獨支持估值上修。`;
  const targetPeAdjustmentHint =
    marketReratingStatus === 'supports_multiple_expansion'
      ? '可提高重估優先級，但 target Forward PE 必須落在同業區間或有券商/官方 rerating 佐證。'
      : marketReratingStatus === 'compressing'
        ? '暫不提高 target PE；先等待回測、重估或外部證據。'
        : '維持既有 target PE 假設，下一輪重估需補券商、月營收與 Forward EPS。';
  return {
    marketReratingStatus,
    marketReratingReason,
    targetPeAdjustmentHint,
    repricingTriggerStrength,
    requiredEvidence,
    summary:
      `${marketReratingReason} ${targetPeAdjustmentHint}`,
    asOf: params.marketIndexSignal.asOf,
  };
}

function applyMarketReratingToPromotionGate(
  gate: RecommendationCard['scenarioPromotionGate'] | null | undefined,
  adjustment: MarketValuationAdjustment,
): RecommendationCard['scenarioPromotionGate'] | null {
  if (!gate) return gate || null;
  if (gate.status !== 'price_led_fundamentals_pending' || adjustment.marketReratingStatus !== 'supports_multiple_expansion') return gate;
  return {
    ...gate,
    status: 'price_led_market_rerating_pending_evidence',
    summary:
      `股價與市場 rerating 已先反映情境，但仍需 ${adjustment.requiredEvidence.slice(0, 3).join('、')}，才能把情境重新計算成新 Base。`,
    criticalChecks: [
      ...gate.criticalChecks,
      {
        label: '市場 rerating 支持重估',
        passed: true,
        reason: adjustment.marketReratingReason,
      },
    ],
  };
}

function applyMarketAwareDecisionToCard(card: RecommendationCard, marketIndexSignal: MarketIndexSignal): RecommendationCard {
  const relativeStrengthSignal = buildRelativeStrengthSignal(card);
  const entryDecision = card.entryDecision || null;
  const tradeDecision = buildTradeDecision({
    entryDecision,
    marketIndexSignal,
    card,
    relativeStrengthSignal,
  });
  const marketValuationAdjustment = buildMarketValuationAdjustment({
    marketIndexSignal,
    targetCoverageStatus: card.targetCoverageStatus || null,
    staleReason: card.staleReason || null,
    scenarioPromotionGate: card.scenarioPromotionGate || null,
    brokerEvidenceSearchStatus: card.brokerEvidenceSearchStatus || card.revaluationJobSummary?.brokerEvidenceSearchStatus || null,
    globalThemeLeadLagSignal: card.globalThemeLeadLagSignal || null,
  });
  const scenarioPromotionGate = applyMarketReratingToPromotionGate(card.scenarioPromotionGate || null, marketValuationAdjustment);
  const confidenceScoreBreakdown = {
    bridgeEvidence: card.confidenceScoreBreakdown?.bridgeEvidence ?? Math.round((card.evidenceScore ?? 0.5) * 100),
    freshness: card.confidenceScoreBreakdown?.freshness ?? 50,
    scenario: card.confidenceScoreBreakdown?.scenario ?? card.scenarioChecklistProgress ?? 0,
    entryReadiness: card.confidenceScoreBreakdown?.entryReadiness ?? Math.round((card.timingScore ?? 0.5) * 100),
    upsideQuality:
      card.confidenceScoreBreakdown?.upsideQuality ??
      Math.round(Math.min(1, Math.max(0, card.cardPrimaryUpsidePct ?? card.expectedUpsidePct ?? 0) / 80) * 100),
    sectorRotationImpact: card.confidenceScoreBreakdown?.sectorRotationImpact ?? Math.round((card.timingScore ?? 0.5) * 100),
  };
  return {
    ...card,
    confidenceScoreBreakdown,
    marketGateStatus: marketIndexSignal.status,
    marketIndexSignal,
    marketValuationAdjustment,
    scenarioPromotionGate,
    scenarioPromotionStatus: scenarioPromotionGate?.status || card.scenarioPromotionStatus || null,
    relativeStrengthSignal,
    tradeDecision,
    entryActionLabel: tradeDecision.action,
    whyBuyNow:
      tradeDecision.action === '建議買進' ||
      tradeDecision.action === '建議小量買進' ||
      tradeDecision.action === '可分批買進' ||
      tradeDecision.action === '突破追蹤買進' ||
      tradeDecision.action === '突破後小量追蹤'
        ? `${tradeDecision.positionSize}；${tradeDecision.marketGateReason}`
        : null,
    whyExitNow:
      tradeDecision.action === '減碼' || tradeDecision.action === '停利' || tradeDecision.action === '出場'
        ? tradeDecision.exitCondition
        : null,
  };
}

function buildChipTimingScore(snapshot: DeepDiveChipSnapshot | null, sectorFlowScore: number | null) {
  if (!snapshot) return sectorFlowScore;
  let score = sectorFlowScore ?? 50;
  const foreign5d = snapshot.institutionalFlows.foreign.net5d ?? 0;
  const trust5d = snapshot.institutionalFlows.investmentTrust.net5d ?? 0;
  const marginUsage = snapshot.marginFinancing.usageRatio ?? 0;
  const shortUsage = snapshot.shortInterest.usageRatio ?? 0;
  if (foreign5d > 0) score += 8;
  if (trust5d > 0) score += 6;
  if (marginUsage >= 24) score -= 10;
  if (shortUsage >= 8) score -= 6;
  return clamp(round(score, 0), 0, 100);
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items));
}

function shouldUseDemoFallback() {
  return isDemoMode();
}

const STORY_TYPE_LABELS: Record<StoryType, string> = {
  product_upgrade: '產品升級',
  supply_chain_win: '供應鏈打入',
  shortage_pricing: '缺貨漲價',
  operating_turnaround: '營運轉折',
  policy_benefit: '政策受惠',
  inventory_reversal: '庫存反轉',
  valuation_reset: '估值錯殺',
  conference_guidance: '法說會新指引',
};

const RECOMMENDATION_STATE_LABELS: Record<RecommendationState, string> = {
  signal_candidate: '未證實題材',
  partially_verified: '部分證實',
  validated_thesis: '已證實 thesis',
  actionable_setup: '可執行進場',
};

const SOURCE_TYPE_LABELS: Record<SourceCoverageView['sourceType'], string> = {
  official: '官方資料',
  financial: '財務數據',
  broker_report: '外資 / 券商評等',
  public_research: '公開研究',
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  bulltalk: '股市爆料同學會',
  ptt: 'PTT Stock',
  kol: '台股 KOL',
  news: '新聞',
  industry: '產業資料',
  podcast: 'Podcast',
  youtube: 'YouTube',
  twse_insider: '董監持股揭露',
};

const REQUIRED_SOURCE_TYPES: Array<SourceCoverageView['sourceType']> = ['threads', 'bulltalk', 'ptt', 'kol', 'official', 'financial', 'twse_insider'];
const CONNECTOR_KEYS = ['investanchors', 'threads', 'instagram', 'telegram', 'podcast', 'youtube', 'ptt', 'bulltalk', 'googlenews', 'anue', 'udn', 'mobile01', 'twse_insider'] as const;
const SOCIAL_REFRESH_CONNECTORS = new Set(['investanchors', 'threads', 'instagram', 'telegram', 'podcast', 'youtube']);
const HOURLY_SOCIAL_CONNECTORS = new Set(['threads', 'instagram', 'telegram']);
const DAILY_KOL_CONNECTORS = new Set(['investanchors', 'podcast', 'youtube']);
const HOURLY_SOCIAL_REFRESH_CADENCE_HOURS = 1;
const DAILY_KOL_REFRESH_CADENCE_HOURS = 24;
const CANONICAL_RECOMMENDATION_STATES = ['signal_candidate', 'partially_verified', 'validated_thesis', 'actionable_setup'] as const;

function refreshCadenceHoursForConnector(connector: string) {
  if (HOURLY_SOCIAL_CONNECTORS.has(connector)) return HOURLY_SOCIAL_REFRESH_CADENCE_HOURS;
  if (DAILY_KOL_CONNECTORS.has(connector)) return DAILY_KOL_REFRESH_CADENCE_HOURS;
  return SOCIAL_REFRESH_CONNECTORS.has(connector) ? 6 : 12;
}

function refreshTierForConnector(connector: string): NonNullable<ConnectorStatusView['refreshTier']> {
  if (HOURLY_SOCIAL_CONNECTORS.has(connector)) return 'hourly_social';
  if (DAILY_KOL_CONNECTORS.has(connector)) return 'daily_kol';
  if (['twse_insider'].includes(connector)) return 'fundamentals';
  if (['googlenews', 'anue', 'udn', 'mobile01', 'ptt', 'bulltalk'].includes(connector)) return 'market_data';
  return 'other';
}

const DEFAULT_AGENCY_AGENT_ALLOWLIST: AgencyAgentProfile[] = [
  {
    profileKey: 'agency-agents/engineering-data-engineer',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Theme Scout Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/engineering',
  },
  {
    profileKey: 'agency-agents/engineering-ai-engineer',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Story Scout Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/engineering',
  },
  {
    profileKey: 'agency-agents/engineering-backend-architect',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Coordinator Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/engineering',
  },
  {
    profileKey: 'agency-agents/engineering-software-architect',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Fundamental Impact Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/engineering',
  },
  {
    profileKey: 'agency-agents/engineering-technical-writer',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Research Editor Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/engineering',
  },
  {
    profileKey: 'agency-agents/testing-evidence-collector',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Evidence Verifier Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/testing',
  },
  {
    profileKey: 'agency-agents/testing-test-results-analyzer',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Technical Timing Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/testing',
  },
] as const;

const DEFAULT_AGENCY_AGENT_POLICY: AgencyAgentPolicy = {
  mode: 'prompt-library-only',
  publishRecommendationsDirectly: false,
  requiresHybridJudge: true,
  requiresAgentFindingsLog: true,
};

function resolveAgencyAllowlistPath() {
  const candidates = [
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), '.agent', 'vendor', 'agency-agents', 'allowlist.json'),
    path.resolve(/*turbopackIgnore: true*/ process.cwd(), '..', '.agent', 'vendor', 'agency-agents', 'allowlist.json'),
  ];
  return candidates.find((candidate) => existsSync(/*turbopackIgnore: true*/ candidate)) || null;
}

function loadAgencyAgentConfig(): { profiles: AgencyAgentProfile[]; policy: AgencyAgentPolicy; source: 'vendored_allowlist' | 'built_in_fallback' } {
  const allowlistPath = resolveAgencyAllowlistPath();
  if (!allowlistPath) {
    return {
      profiles: [...DEFAULT_AGENCY_AGENT_ALLOWLIST],
      policy: { ...DEFAULT_AGENCY_AGENT_POLICY },
      source: 'built_in_fallback',
    };
  }

  try {
    const parsed = JSON.parse(readFileSync(/*turbopackIgnore: true*/ allowlistPath, 'utf8')) as {
      library?: string;
      policy?: Partial<AgencyAgentPolicy> & {
        publish_recommendations_directly?: boolean;
        requires_hybrid_judge?: boolean;
        requires_agent_findings_log?: boolean;
      };
      profiles?: Array<{ profile_key?: string; mapped_role?: string; source_url?: string }>;
    };
    const sourceLibrary = String(parsed.library || 'agency-agents');
    const profiles = (parsed.profiles || [])
      .map((profile) => ({
        profileKey: String(profile.profile_key || ''),
        sourceLibrary,
        mappedRole: String(profile.mapped_role || ''),
        sourceUrl: String(profile.source_url || ''),
      }))
      .filter((profile) => profile.profileKey && profile.mappedRole);
    if (profiles.length > 0) {
      return {
        profiles,
        policy: {
          mode: String(parsed.policy?.mode || DEFAULT_AGENCY_AGENT_POLICY.mode),
          publishRecommendationsDirectly: Boolean(parsed.policy?.publishRecommendationsDirectly ?? parsed.policy?.publish_recommendations_directly ?? DEFAULT_AGENCY_AGENT_POLICY.publishRecommendationsDirectly),
          requiresHybridJudge: Boolean(parsed.policy?.requiresHybridJudge ?? parsed.policy?.requires_hybrid_judge ?? DEFAULT_AGENCY_AGENT_POLICY.requiresHybridJudge),
          requiresAgentFindingsLog: Boolean(parsed.policy?.requiresAgentFindingsLog ?? parsed.policy?.requires_agent_findings_log ?? DEFAULT_AGENCY_AGENT_POLICY.requiresAgentFindingsLog),
        },
        source: 'vendored_allowlist',
      };
    }
  } catch {
    // Fall back to built-in defaults if the vendored JSON is malformed.
  }

  return {
    profiles: [...DEFAULT_AGENCY_AGENT_ALLOWLIST],
    policy: { ...DEFAULT_AGENCY_AGENT_POLICY },
    source: 'built_in_fallback',
  };
}

const AGENCY_AGENT_CONFIG = loadAgencyAgentConfig();
const AGENCY_AGENT_ALLOWLIST = AGENCY_AGENT_CONFIG.profiles;
const AGENCY_AGENT_POLICY = AGENCY_AGENT_CONFIG.policy;

const PASSIVE_COMPONENT_MLCC_THEME = {
  themeKey: 'passive-components-mlcc',
  themeName: '被動元件 / MLCC 漲價循環',
  keywords: ['MLCC', '被動元件', '電感', 'TLVR', '鉭電容', '晶片電阻', '村田', '太陽誘電', '三星電機', '漲價', '交期', 'AI 電源'],
  symbols: [
    { symbol: '2327', name: '國巨', sector: 'Passive Components' },
    { symbol: '2492', name: '華新科', sector: 'Passive Components' },
    { symbol: '3026', name: '禾伸堂', sector: 'Passive Components' },
    { symbol: '2472', name: '立隆電', sector: 'Passive Components' },
    { symbol: '2375', name: '凱美', sector: 'Passive Components' },
    { symbol: '3357', name: '臺慶科', sector: 'Passive Components' },
    { symbol: '8042', name: '金山電', sector: 'Passive Components' },
    { symbol: '6207', name: '雷科', sector: 'Passive Components' },
    { symbol: '6224', name: '聚鼎', sector: 'Passive Components' },
    { symbol: '4760', name: '勤凱', sector: 'Passive Components' },
    { symbol: '3624', name: '光頡', sector: 'Passive Components' },
    { symbol: '5328', name: '華容', sector: 'Passive Components' },
    { symbol: '6127', name: '九豪', sector: 'Passive Components' },
    { symbol: '6432', name: '今展科', sector: 'Passive Components' },
  ],
  externalEvidence: [
    {
      sourceName: 'FTNN 新聞網',
      sourceUrl: 'https://www.ftnn.com.tw/news/543087',
      summary: '被動元件因 AI 應用帶動需求，市場追蹤國巨、華新科、禾伸堂等漲價與資金回流。',
    },
    {
      sourceName: '聯合新聞網 / 經濟日報',
      sourceUrl: 'https://udn.com/news/story/7240/9442035',
      summary: '太陽誘電跟進調升報價，市場將國巨、華新科、凱美、臺慶科等列為台系受惠供應鏈。',
    },
    {
      sourceName: '鉅亨網',
      sourceUrl: 'https://news.cnyes.com/news/print/6423983',
      summary: 'AI server 推升 MLCC 與 TLVR 電感用量，高階被動元件供需缺口與報價上修成為產業主線。',
    },
  ],
} as const;

const ADDITIONAL_DISCOVERY_THEMES = [
  {
    themeKey: 'cpu-ai-pc',
    themeName: 'CPU / AI PC 換機循環',
    keywords: ['CPU', 'AI PC', 'x86', 'ARM PC', '筆電', 'PC', 'Intel', 'AMD', 'Lunar Lake', 'Arrow Lake', 'Zen', '換機'],
    symbols: [
      { symbol: '2356', name: '英業達', sector: 'AI PC / ODM' },
      { symbol: '2324', name: '仁寶', sector: 'AI PC / ODM' },
      { symbol: '2376', name: '技嘉', sector: 'AI PC / 主機板' },
      { symbol: '2377', name: '微星', sector: 'AI PC / 主機板' },
      { symbol: '2382', name: '廣達', sector: 'ODM' },
      { symbol: '3231', name: '緯創', sector: 'ODM' },
    ],
  },
  {
    themeKey: 'mature-node-recovery',
    themeName: '成熟製程與特殊製程復甦',
    keywords: ['成熟製程', '28nm', '40nm', '55nm', '8吋', '12吋', 'MCU', 'PMIC', 'Driver IC', '晶圓代工', '補庫��my��$z{-���jם      {
              id: 'scenario_case' as const,
              heading: '情境目標價推導',
              paragraphs: scenarioCaseParagraphs.map((line) => appendCitationIds(line, scenarioCitationIds)).filter((item): item is string => Boolean(item)),
              bullets: uniqueNarrativeLines(
                [...(scenarioCaseDetail?.deltaAssumptions || []), ...(scenarioCaseDetail?.evidenceRefs || [])],
                3,
              ),
              sourceRefs: scenarioCitationIds,
            },
          ]
        : []),
      {
        id: 'latest_evidence' as const,
        heading: '最新證據',
        paragraphs: uniqueNarrativeLines(
          [
            latestEvidence[0]
              ? `最近進來的高品質證據中，${latestEvidence[0].label} 是目前最值得優先追蹤的一筆；這筆資料目前主要支撐 ${latestEvidence[0].supportCase === 'base' ? 'Base' : '情境'} 推導，若後續同方向資料持續出現，Base 情境也有上修空間。`
              : '目前缺少足以改寫 Base 或情境價格的高品質最新證據。',
          ],
          1,
        ).map((line) => appendCitationIds(line, latestCitationIds)).filter((item): item is string => Boolean(item)),
        bullets: latestEvidenceBullets,
        sourceRefs: latestCitationIds,
      },
      {
        id: 'capital_flow' as const,
        heading: '資金與籌碼',
        paragraphs: capitalFlowParagraphs,
      },
      {
        id: 'investment' as const,
        heading: '投資建議',
        paragraphs: uniqueNarrativeLines(
          [
            investmentAdviceParagraph,
            investmentExecutionParagraph,
            nextValidationParagraph,
          ],
          4,
        ),
      },
      {
        id: 'risk' as const,
        heading: '投資風險',
        paragraphs: [primaryRiskParagraph],
        bullets: uniqueNarrativeLines(
          [
            riskBullets[0] || null,
            riskBullets[1] || null,
            riskBullets[2] || null,
          ],
          3,
        ),
      },
    ];
    const focusBullets = uniqueNarrativeLines(
      [
        buildValuationBridgeBullet(
          baseScenarioBridge,
          targetSnapshot.verdict === 'formal'
            ? `正式目標價 ${bridgeAwareBaseTarget == null ? '待重估' : formatMoney(bridgeAwareBaseTarget)} 仍高於現價，Base 空間約 ${formatSignedPctLocal(bridgeAwareBaseUpsidePct)}。`
            : targetSnapshot.verdict === 'scenario'
              ? `Base 目標價 ${bridgeAwareBaseTarget == null ? '待重估' : formatMoney(bridgeAwareBaseTarget)} 已低於現價，但情境目標價 ${bridgeAwareScenarioTarget == null ? '待重估' : formatMoney(bridgeAwareScenarioTarget)} 仍保留 ${formatSignedPctLocal(bridgeAwareScenarioUpsidePct)} 的上行空間。`
              : `股價已接近既有目標價區間，除非後續營運再上修，否則上行空間有限。`,
        ),
        normalizeNarrativeSentence(
          sentenceFromBridgeSegments(
            [
              analysisStoryLineOne,
              analysisStoryLineTwo,
            ],
            analysisStoryLineOne || analysisStoryLineTwo || '',
          ),
        ),
        normalizeNarrativeSentence(
          sentenceFromBridgeSegments(
            [
              peerComparisonParagraph,
              casePriceSentence(baseCaseDetail, 'Base'),
              scenarioCaseDetail?.targetPrice != null
                ? `若樂觀假設成立，情境目標價可上看 ${formatMoney(scenarioCaseDetail.targetPrice)}。`
                : null,
            ],
            casePriceSentence(baseCaseDetail, 'Base'),
          ),
        ),
      ],
      3,
    );
    const technicalSummary = uniqueNarrativeLines([
      deepDiveTechnicalSourceNarrative(insight.chartSource, insight.chartMissingReason),
      technicalSnapshot.ma5 && technicalSnapshot.ma20
        ? technicalSnapshot.ma5 >= technicalSnapshot.ma20
          ? '短均線仍維持上彎，短線趨勢尚未破壞。'
          : '短均線動能轉弱，短線追價要保守。'
        : null,
      technicalSnapshot.rsi != null
        ? technicalSnapshot.rsi >= 70
          ? '短線已接近過熱區，若追價需更重視風險控管。'
          : technicalSnapshot.rsi <= 35
            ? '技術面進入相對低檔區，留意是否出現止穩訊號。'
            : '技術面仍在正常震盪區間，觀察量價是否持續配合。'
        : null,
      technicalSnapshot.fibonacci
        ? technicalSnapshot.fibonacci.bias === 'support'
          ? `目前股價接近費波那契 ${formatNumberLocal(technicalSnapshot.fibonacci.retracement618)} 附近的支撐區，若量能不再擴大下殺，可觀察是否形成較佳切入點。`
          : technicalSnapshot.fibonacci.bias === 'resistance'
            ? `目前股價已逼近費波那契 ${formatNumberLocal(technicalSnapshot.fibonacci.retracement236)} 以上的壓力帶，追價需觀察是否能帶量站穩。`
            : `股價目前位於費波那契 ${formatNumberLocal(technicalSnapshot.fibonacci.retracement382)} 到 ${formatNumberLocal(technicalSnapshot.fibonacci.retracement618)} 的中段整理區，較適合等待方向確認。`
        : null,
      insight.volume != null && insight.volume > 0 ? `最新成交量約 ${Math.round(insight.volume).toLocaleString('zh-TW')}，後續要觀察量能是否延續。` : null,
    ], 2).join(' ');
    const reportSnapshot = {
      title: deepDiveTitle(seedOverride, story, insight, normalizedSymbol),
      subtitle:
        `投資主張：${recommendationStance.displayLabel}。大盤 Gate、籌碼與技術面給出的現在動作是「${tradeDecision.action}」。`,
      summaryBullets: focusBullets,
      sections: reportSections.filter((section) => section.paragraphs.length > 0 || (section.bullets?.length || 0) > 0),
    };
    const articleSections: DeepDiveArticleSection[] = reportSnapshot.sections.map((section) => ({
      id:
        section.id === 'analysis'
          ? 'market_story'
          : section.id === 'base_case' || section.id === 'scenario_case'
            ? 'scenario_valuation'
            : section.id === 'latest_evidence'
              ? 'validation'
              : section.id === 'risk'
                ? 'risks'
                : 'stance',
      kicker: section.heading,
      title: section.heading,
      paragraphs: section.paragraphs,
      ...(section.bullets && section.bullets.length > 0 ? { bullets: section.bullets } : {}),
    }));
    const valuationPanel = {
      monthlyRevenue: revenueSignalView?.monthlyRevenue ?? null,
      yoyGrowth: revenueSignalView?.yoyGrowth ?? null,
      momGrowth: revenueSignalView?.momGrowth ?? null,
      epsTtm: fundamentalSnapshotView?.epsTtm ?? null,
      peRatio: fundamentalSnapshotView?.peRatio ?? null,
      pbRatio: fundamentalSnapshotView?.pbRatio ?? null,
      baseTarget: bridgeAwareBaseTarget,
      upsideTarget: bridgeAwareScenarioTarget,
      bearTarget: bridgeAwareBearTarget,
      nextValidationPoint: chaseAssessment.trigger || revenueNarrative || cleanVerificationLine || null,
      dataAsOf: reportUpdatedAt,
      coreAssumptions: (baseScenarioBridge?.operatingAssumptions || valuationBridge?.operatingAssumptions || [])
        .slice(0, 5)
        .map((item) => `${item.label}${item.isEstimated ? '約' : ''}${item.value}${item.isEstimated ? '（研究推估）' : ''}`),
      multipleMapping: baseScenarioBridge?.multipleBridge || valuationBridge?.multipleBridge || null,
      industryBenchmark: scenarioCaseDetail?.benchmarkRange || baseCaseDetail?.benchmarkRange || valuationBridge?.multipleBridge || null,
      peerComparison: peerComparisonParagraph,
      sourceCitationMap,
      assumptionLedger,
      brokerConsensus,
      valuationConfidenceGate,
      forwardPeBridge,
      peerValuationRange,
      valuationReviewFlags,
      mlForecastBand,
      valuationModelDivergence,
      modelSignalSummary: modelSignalSummaryFor(assistiveModelSignal),
      sharedVerifiedBasis,
      scenarioNote,
      baseCaseDetail,
      scenarioCaseDetail,
      priceTargetRationale: sentenceFromBridgeSegments(
        [
          estimateDisclosure,
          baseCaseDetail?.bridgeCompleteness === 'insufficient' ? baseCaseDetail.insufficientBridgeReason : null,
          baseCaseDetail?.priceBridge || priceTargetRationale,
          baseCaseDetail?.multipleBridge || baseScenarioBridge?.multipleBridge,
          valuationBridge?.bridgeSummary,
        ],
        baseCaseDetail?.bridgeCompleteness === 'insufficient'
          ? baseCaseDetail.insufficientBridgeReason || ''
          : priceTargetRationale || valuationBridge?.bridgeSummary || '',
      ) || null,
    };
    const sourceFreshnessView = {
      freshness: sourceFreshness,
      latestSourceAt,
      reportUpdatedAt,
      priceAsOf: insight.asOf ?? null,
    };

    return {
      ...insight,
      targetSnapshot,
      reportSnapshot,
      valuationPanel,
      marketIndexSignal,
      relativeStrengthSignal,
      tradeDecision,
      marketRotationSnapshot,
      chipSnapshot,
      dataHealth,
      recommendationStance,
      chipEntryAssessment,
      sourceFreshness: sourceFreshnessView,
      summaryCard,
      chaseAssessment,
      latestFacts,
      latestEvidence,
      thesisSnapshot,
      freshSourceHighlights,
      appendix: {
        technicalSummary,
        sourceAppendix,
        evidenceMatrix,
        connectorStatus,
        coverageStatus: sourceCoverageStatus,
        emptyState: {
          technical:
            technicalSnapshot.ma5 == null &&
            technicalSnapshot.ma20 == null &&
            technicalSnapshot.rsi == null &&
            technicalSnapshot.macd == null
              ? '目前缺少足夠的日線資料，暫時無法完整計算 MA / RSI / MACD。'
              : null,
          evidence: evidenceMatrix.length > 0 ? null : '目前還沒有足夠的高品質證據矩陣，可能是 direct-hit 不足或研究資料尚未刷新。',
          sources: sourceAppendix.some((group) => group.items.length > 0) ? null : '目前沒有可展示的高品質來源分組，可能是資料尚未刷新或尚無直接命中來源。',
        },
      },
      investmentConclusion,
      keyAssumptions,
      verificationSummary,
      valuationSummary,
      storyNarrative,
      articleSections,
      numberTrail,
      scenarioNarratives: scenarioBridges,
      valuationBridge,
      scenarioBridges,
      priceTargetRationale,
      marketHypothesis,
      validationChecks,
      entryExitPlan,
      technicalSummary,
      technicalEntrySignal,
      sourceAppendix,
      technicalSnapshot,
      thesisState: recommendationState,
      verificationStatus,
      storyType: (story?.story_type as StoryType | null | undefined) || insight.recommendation?.storyType || null,
      thesisTitle: seedOverride?.thesisTitle ?? (story?.title ? String(story.title) : insight.recommendation?.thesisTitle || null),
      thesisSummary: seedOverride?.thesisSummary ?? (story?.summary ? String(story.summary) : insight.recommendation?.thesisSummary || null),
      catalystSummary: seedOverride?.catalystSummary ?? (story?.catalyst_summary ? String(story.catalyst_summary) : insight.recommendation?.catalystSummary || null),
      expectedUpsidePct: targetSnapshot.cardPrimaryUpsidePct ?? targetSnapshot.displayBaseUpsidePct,
      evidenceScore: story?.evidence_score == null ? insight.recommendation?.evidenceScore ?? null : toFiniteNumber(story.evidence_score),
      timingScore: story?.timing_score == null ? insight.recommendation?.timingScore ?? null : toFiniteNumber(story.timing_score),
      evidenceItems,
      valuationCases: effectiveValuationCases,
      companyEvents,
      revenueSignal: revenueSignalView,
      fundamentalSnapshot: fundamentalSnapshotView,
      memo:
        memo && String(memo.slug || '').startsWith('demo-')
          ? ((reportRes.data?.[0] as Row | undefined)
              ? {
                  title: String((reportRes.data?.[0] as Row).title || ''),
                  slug: `research-report-${normalizedSymbol.toLowerCase()}`,
                  summary: String((reportRes.data?.[0] as Row).summary || ''),
                  memoMarkdown: String((reportRes.data?.[0] as Row).report_markdown || ''),
                  reportKind: 'deep_dive',
                  recommendationState,
                  catalystCalendar: [],
                  entryExitRules: {},
                  relatedSymbols: [normalizedSymbol],
                }
              : mapResearchMemo(memo, new Map([[String(stock.id || ''), normalizedSymbol]])))
          : memo
            ? mapResearchMemo(memo, new Map([[String(stock.id || ''), normalizedSymbol]]))
            : ((reportRes.data?.[0] as Row | undefined)
                ? {
                    title: String((reportRes.data?.[0] as Row).title || ''),
                    slug: `research-report-${normalizedSymbol.toLowerCase()}`,
                    summary: String((reportRes.data?.[0] as Row).summary || ''),
                    memoMarkdown: String((reportRes.data?.[0] as Row).report_markdown || ''),
                    reportKind: 'deep_dive',
                    recommendationState,
                    catalystCalendar: [],
                    entryExitRules: {},
                    relatedSymbols: [normalizedSymbol],
                  }
                : null),
      agentStatus,
      communitySignals,
      verificationTimeline: verificationTimelineFromState(recommendationState),
      conditionalRecommendationNote: story?.conditional_recommendation_note ? String(story.conditional_recommendation_note) : buildConditionalRecommendationNote(recommendationState),
      themeHypothesis,
      calculationTable,
      counterEvidence,
      brokerViews,
      sourceCoverage,
      missingCoverage: findMissingSources(sourceCoverage),
      kolCoverage,
      podcastMentions,
      sourceDiscoveryStatus,
      connectorStatus,
      thesisModel: thesisModelView,
      riskCounterpoints,
      evidenceMatrix,
      valuationCompleteness,
      missingFields,
      financialProjectionMetrics: {
        baseRevenueAnnual: quantitative.base_revenue_annual == null ? null : toFiniteNumber(quantitative.base_revenue_annual),
        baseEps: quantitative.base_eps == null ? null : toFiniteNumber(quantitative.base_eps),
        basePe: quantitative.base_pe == null ? null : toFiniteNumber(quantitative.base_pe),
        upsideRevenueAnnual: quantitative.upside_revenue_annual == null ? null : toFiniteNumber(quantitative.upside_revenue_annual),
        upsideEps: quantitative.upside_eps == null ? null : toFiniteNumber(quantitative.upside_eps),
        upsidePe: quantitative.upside_pe == null ? null : toFiniteNumber(quantitative.upside_pe),
        bearRevenueAnnual: quantitative.bear_revenue_annual == null ? null : toFiniteNumber(quantitative.bear_revenue_annual),
        bearEps: quantitative.bear_eps == null ? null : toFiniteNumber(quantitative.bear_eps),
        bearPe: quantitative.bear_pe == null ? null : toFiniteNumber(quantitative.bear_pe),
      },
      timeframeCharts,
      sourceGroups,
    };
  } catch (error) {
    console.error('[getStockDeepDive] failed', { symbol, error: error instanceof Error ? error.message : String(error) });
    return shouldUseDemoFallback() ? await fallbackStockDeepDive(symbol) : null;
  }
}

type StockResearchRefreshResult = {
  runId: string;
  symbol: string;
  status: 'queued' | 'completed';
  queuedSteps: string[];
  freshnessBefore: SignalFreshness;
  targetSnapshotBefore?: {
    displayTarget: number | null;
    displayUpsidePct: number | null;
    baseTarget: number | null;
    upsideTarget: number | null;
    targetCoverageStatus: TargetCoverageStatus | null;
    bridgeCompleteness: string | null;
    reportUpdatedAt: string | null;
  } | null;
  targetSnapshotAfter?: {
    displayTarget: number | null;
    displayUpsidePct: number | null;
    baseTarget: number | null;
    upsideTarget: number | null;
    targetCoverageStatus: TargetCoverageStatus | null;
    bridgeCompleteness: string | null;
    reportUpdatedAt: string | null;
  } | null;
  reportUpdated?: boolean;
  sourceRefreshSummary?: {
    latestSourceAtBefore: string | null;
    latestSourceAtAfter: string | null;
  } | null;
  connectorResults?: Array<{
    connector: string;
    recordsWritten: number;
    fetchedPosts: number;
    errorCode: string | null;
    matchedDirectHits?: number;
    matchedIndustryHits?: number;
    timedOut?: boolean;
    degradedReason?: string | null;
    sessionMode?: 'persisted_session' | 'fresh_login' | 'cookie_fallback' | 'missing' | 'not_applicable';
  }>;
};

const SOURCE_SYNC_CONNECTORS = ['threads', 'telegram', 'ptt', 'bulltalk', 'gdelt', 'twse_insider'] as const;

function compactTargetSnapshot(payload: StockDeepDivePayload | null) {
  if (!payload) return null;
  return {
    displayTarget: payload.targetSnapshot?.displayTarget ?? null,
    displayUpsidePct: payload.targetSnapshot?.displayUpsidePct ?? payload.summaryCard?.upsidePct ?? null,
    baseTarget: payload.targetSnapshot?.baseTarget ?? null,
    upsideTarget: payload.targetSnapshot?.upsideTarget ?? null,
    targetCoverageStatus: payload.targetSnapshot?.targetCoverageStatus ?? null,
    bridgeCompleteness: payload.targetSnapshot?.bridgeCompleteness ?? null,
    reportUpdatedAt: payload.targetSnapshot?.reportUpdatedAt ?? payload.summaryCard?.lastUpdatedAt ?? null,
  };
}

function shouldBackgroundRefreshDeepDive(payload: StockDeepDivePayload) {
  if (payload.summaryCard?.freshness === 'stale') return true;
  const updatedAt = payload.targetSnapshot?.reportUpdatedAt || payload.summaryCard?.lastUpdatedAt || null;
  if (!updatedAt) return true;
  const updatedMs = new Date(updatedAt).getTime();
  if (!Number.isFinite(updatedMs)) return true;
  return Date.now() - updatedMs >= 15 * 60 * 1000;
}

async function refreshSingleStockMarketData(symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  const supabaseServer = getSupabaseServerClient();
  const now = nowIso();
  const asOfDate = asIsoDate(now);
  const [twQuote, liveSnapshot, historicalBars, revenueData, valuesData, epsData, institutionalData, marginTrades, shortSales, officialSbl] = await Promise.all([
    fetchTwStockQuote(normalizedSymbol).catch(() => null),
    fetchTWSELivePrice(normalizedSymbol).catch(() => null),
    fetchTwStockDailyBars(normalizedSymbol, DEEP_DIVE_DAILY_BAR_BUFFER).catch(() => null),
    fetchTwStockRevenue(normalizedSymbol).catch(() => null),
    fetchTwStockValues(normalizedSymbol).catch(() => null),
    fetchTwStockEpsTtm(normalizedSymbol).catch(() => null),
    fetchTwStockInstitutional(normalizedSymbol).catch(() => null),
    fetchTwStockMarginTrades(normalizedSymbol).catch(() => null),
    fetchTwStockShortSales(normalizedSymbol).catch(() => null),
    fetchTwseOfficialSblShortSales(normalizedSymbol).catch(() => null),
  ]);

  const quoteName = twQuote?.name || normalizedSymbol;
  const stock = await ensureStock(normalizedSymbol, 'TW', quoteName, null);
  const latestPrice = twQuote?.price ?? liveSnapshot?.price ?? historicalBars?.[historicalBars.length - 1]?.close ?? null;
  const latestVolume = twQuote?.volume ?? liveSnapshot?.volume ?? null;
  const historyCloses = (historicalBars || []).map((item) => item.close).filter((value) => Number.isFinite(value) && value > 0);
  const technicalSeries =
    latestPrice && historyCloses.length > 0
      ? [...historyCloses.slice(0, -1), latestPrice]
      : historyCloses.length > 0
        ? historyCloses
        : latestPrice
          ? [latestPrice]
          : [];

  if (latestPrice && technicalSeries.length > 0) {
    const technical = computeTechnicalSnapshot(technicalSeries);
    await supabaseServer.from('stock_signals').upsert(
      {
        stock_id: stock.id,
        as_of: now,
        source: twQuote ? 'node-twstock' : 'twse-tpex-open-data',
        source_key: `single-stock-refresh:${normalizedSymbol}`,
        price: latestPrice,
        volume: latestVolume,
        ma_short: technical.maShort,
        ma_mid: technical.maMid,
        ma_long: technical.maLong,
        rsi: technical.rsi,
        macd: technical.macd,
        macd_signal: technical.macdSignal,
        chip_metrics: {
          foreign_net: institutionalData?.foreignNet ?? null,
          investment_trust_net: institutionalData?.investmentTrustNet ?? null,
          dealer_net: institutionalData?.dealerNet ?? null,
          margin_balance: marginTrades?.marginBalance ?? null,
          margin_balance_change:
            marginTrades?.marginBalance != null && marginTrades?.marginBalancePrev != null
              ? marginTrades.marginBalance - marginTrades.marginBalancePrev
              : null,
          margin_usage_ratio: marginTrades?.marginUsageRatio ?? null,
          margin_note: marginTrades?.note ?? null,
          short_balance: marginTrades?.shortBalance ?? null,
          short_balance_change:
            marginTrades?.shortBalance != null && marginTrades?.shortBalancePrev != null
              ? marginTrades.shortBalance - marginTrades.shortBalancePrev
              : null,
          short_usage_ratio: marginTrades?.shortUsageRatio ?? null,
          short_note: marginTrades?.note ?? null,
          margin_short_balance: shortSales?.marginShortBalance ?? null,
          margin_short_balance_change:
            shortSales?.marginShortBalance != null && shortSales?.marginShortBalancePrev != null
              ? shortSales.marginShortBalance - shortSales.marginShortBalancePrev
              : null,
          margin_short_usage_ratio: shortSales?.marginShortUsageRatio ?? null,
          margin_short_note: shortSales?.note ?? null,
          sbl_short_balance: officialSbl?.sblShortBalance ?? shortSales?.sblShortBalance ?? null,
          sbl_short_balance_change:
            officialSbl?.sblShortBalance != null && officialSbl?.sblShortBalancePrev != null
              ? officialSbl.sblShortBalance - officialSbl.sblShortBalancePrev
              : null,
          sbl_short_usage_ratio: officialSbl?.sblShortUsageRatio ?? shortSales?.sblShortUsageRatio ?? null,
          official_sbl_as_of: officialSbl?.date ?? null,
          official_sbl_source_url: officialSbl?.sourceUrl ?? null,
          sbl_source: officialSbl?.source ?? shortSales?.source ?? null,
          open: twQuote?.openPrice ?? liveSnapshot?.open ?? null,
          high: twQuote?.highPrice ?? liveSnapshot?.high ?? null,
          low: twQuote?.lowPrice ?? liveSnapshot?.low ?? null,
          change_pct: twQuote?.changePct ?? null,
          quote_date: twQuote?.date ?? null,
          chip_source_as_of: twQuote?.date ? `${twQuote.date}T00:00:00.000+08:00` : now,
          chip_source: officialSbl ? 'twse-official+node-twstock/live-refresh' : twQuote ? 'node-twstock/live-refresh' : 'public-market-refresh',
          fallback_used: false,
        },
        technical_meta: { indicator_set: ['MA', 'RSI', 'MACD'], refresh_mode: 'single_stock' },
        freshness_status: 'fresh',
        source_timestamp: twQuote?.date ? `${twQuote.date}T00:00:00.000+08:00` : now,
        ingested_at: now,
      },
      { onConflict: 'stock_id,as_of' },
    );
  }

  if (revenueData?.revenue != null && revenueData.revenue > 0) {
    await supabaseServer.from('revenue_signals').upsert(
      {
        stock_id: stock.id,
        as_of_date: revenueData.asOfDate,
        monthly_revenue: revenueData.revenue,
        yoy_growth: null,
        mom_growth: null,
        source_url: `https://www.twse.com.tw/zh/announcement/revenue.html?stockNo=${normalizedSymbol}`,
      },
      { onConflict: 'stock_id,as_of_date' },
    );
  }

  const peRatio = valuesData?.peRatio ?? null;
  const pbRatio = valuesData?.pbRatio ?? null;
  const epsTtm = epsData?.epsTtm ?? null;
  const revenueRunRate = revenueData?.revenue != null ? revenueData.revenue * 12 : null;
  const grossMargin = null;
  const operatingMargin = null;
  const hasFundamentalValue = [peRatio, pbRatio, epsTtm, revenueRunRate, grossMargin, operatingMargin].some((value) => value != null && value !== 0);
  if (hasFundamentalValue) {
    await supabaseServer.from('fundamental_snapshots').upsert(
      {
        stock_id: stock.id,
        as_of_date: asOfDate,
        eps_ttm: epsTtm,
        gross_margin: grossMargin,
        operating_margin: operatingMargin,
        pe_ratio: peRatio,
        pb_ratio: pbRatio,
        revenue_run_rate: revenueRunRate,
        source_url: `https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html?stockNo=${normalizedSymbol}`,
      },
      { onConflict: 'stock_id,as_of_date' },
    );
  }

  return { stockId: String(stock.id || ''), latestPrice };
}

const stockResearchRefreshLocks = new Map<string, Promise<StockResearchRefreshResult>>();

export async function runStockResearchRefresh(options: {
  symbol: string;
  force?: boolean;
  reason?: string;
  dryRun?: boolean;
  connectors?: string[];
}): Promise<StockResearchRefreshResult> {
  const normalizedSymbol = String(options.symbol || '').toUpperCase();
  if (!normalizedSymbol) {
    throw new Error('symbol is required');
  }

  const deepDiveBefore = await getStockDeepDive(normalizedSymbol);
  const freshnessBefore = deepDiveBefore?.summaryCard?.freshness || 'missing';
  const targetSnapshotBefore = compactTargetSnapshot(deepDiveBefore);
  const latestSourceAtBefore = deepDiveBefore?.targetSnapshot?.latestSourceAt || deepDiveBefore?.summaryCard?.latestSourceAt || null;
  const requestedConnectors = (options.connectors || SOURCE_SYNC_CONNECTORS)
    .map((item) => String(item))
    .filter((connector) => sourceExecutionPolicy(connector).disposition === 'active');
  const queuedSteps = ['source_sync', 'single_stock_market_refresh', 'thesis_refresh', 'research_report_build', 'deep_dive_build'];
  if (options.dryRun) {
    return {
      runId: randomUUID(),
      symbol: normalizedSymbol,
      status: 'completed',
      queuedSteps,
      freshnessBefore,
      targetSnapshotBefore,
      targetSnapshotAfter: targetSnapshotBefore,
      reportUpdated: false,
      sourceRefreshSummary: {
        latestSourceAtBefore,
        latestSourceAtAfter: latestSourceAtBefore,
      },
      connectorResults: requestedConnectors.map((connector) => ({
        connector,
        recordsWritten: 0,
        fetchedPosts: 0,
        errorCode: null,
        matchedDirectHits: 0,
        matchedIndustryHits: 0,
        timedOut: false,
        degradedReason: null,
        sessionMode: connector === 'threads' || connector === 'instagram' ? 'missing' : 'not_applicable',
      })),
    };
  }

  const existing = stockResearchRefreshLocks.get(normalizedSymbol);
  if (existing && !options.force) {
    return existing;
  }

  const run = (async () => {
    const runId = randomUUID();
    const researchV2 = await import('./research-v2');
    const connectorResults: StockResearchRefreshResult['connectorResults'] = [];
    for (const connector of requestedConnectors) {
      const result = await researchV2.runSourceSync({ connector, symbol: normalizedSymbol, dryRun: false });
      connectorResults.push({
        connector,
        recordsWritten: Number(result.recordsWritten || 0),
        fetchedPosts: Number(result.fetchedPosts ?? result.recordsWritten ?? 0),
        errorCode: result.errorCode ?? null,
        matchedDirectHits: Number(result.matchedDirectHits || 0),
        matchedIndustryHits: Number(result.matchedIndustryHits || 0),
        timedOut: Boolean(result.timedOut),
        degradedReason: result.degradedReason ?? null,
        sessionMode: result.sessionMode ?? (connector === 'threads' || connector === 'instagram' ? 'missing' : 'not_applicable'),
      });
    }
    await refreshSingleStockMarketData(normalizedSymbol);
    await researchV2.runThesisRefresh({ dryRun: false, symbols: [normalizedSymbol], topN: 20 });
    await researchV2.runResearchReportBuild({ dryRun: false, symbols: [normalizedSymbol], topN: 20 });
    await runDeepDiveBuild({ dryRun: false, symbol: normalizedSymbol });
    const deepDiveAfter = await getStockDeepDive(normalizedSymbol);
    const targetSnapshotAfter = compactTargetSnapshot(deepDiveAfter);
    const latestSourceAtAfter = deepDiveAfter?.targetSnapshot?.latestSourceAt || deepDiveAfter?.summaryCard?.latestSourceAt || null;
    return {
      runId,
      symbol: normalizedSymbol,
      status: 'completed' as const,
      queuedSteps,
      freshnessBefore,
      targetSnapshotBefore,
      targetSnapshotAfter,
      reportUpdated: targetSnapshotBefore?.reportUpdatedAt !== targetSnapshotAfter?.reportUpdatedAt,
      sourceRefreshSummary: {
        latestSourceAtBefore,
        latestSourceAtAfter,
      },
      connectorResults,
    };
  })().finally(() => {
    stockResearchRefreshLocks.delete(normalizedSymbol);
  });

  stockResearchRefreshLocks.set(normalizedSymbol, run);
  return run;
}

function queueStockResearchRefresh(symbol: string, reason: string, force = false) {
  const normalizedSymbol = symbol.toUpperCase();
  const existing = stockResearchRefreshLocks.get(normalizedSymbol);
  if (existing && !force) return;
  void runStockResearchRefresh({ symbol: normalizedSymbol, reason, force }).catch((error) => {
    console.warn(`[stock-refresh] ${normalizedSymbol} failed`, (error as Error).message);
  });
}

function revaluationRequiredEvidenceForCard(card: RecommendationCard) {
  return card.repricingRequiredEvidence && card.repricingRequiredEvidence.length > 0
    ? card.repricingRequiredEvidence
    : ['最新月營收、毛利率或 EPS 基底上修', 'Forward EPS 或 normalized PE/PB 有外部佐證', '券商 consensus / target PE 上修', '具名客戶、訂單或法說證據補強'];
}

function revaluationTriggerReasonForCard(card: RecommendationCard) {
  if (card.staleReason === 'target_stale_due_price_crossed_scenario' || card.targetStaleKind === 'crossed_scenario') return 'target_stale_due_price_crossed_scenario';
  if (card.staleReason === 'target_stale_due_price_crossed_base' || card.targetStaleKind === 'crossed_base') return 'target_stale_due_price_crossed_base';
  if (card.displayTargetMode === 'needs_revaluation' || card.recommendationGateStatus === 'needs_revaluation') return 'needs_bridge_aware_revaluation';
  if (card.targetCoverageStatus === 'missing_target') return 'missing_target_or_current_price';
  if (card.brokerSocialLeakSummary) return 'social_broker_leak';
  return 'visible_stock_revaluation_sla';
}

function revaluationNeedsJob(card: RecommendationCard) {
  return Boolean(
    card.revaluationStatus === 'pending' ||
      card.displayTargetMode === 'needs_revaluation' ||
      card.staleReason ||
      card.targetStaleKind ||
      card.displayBucket === 'hot_tracking' ||
      card.displayBucket === 'revaluation_queue' ||
      card.recommendationGateStatus === 'needs_revaluation',
  );
}

async function countBrokerDocsForStock(stockId: string) {
  try {
    const res = await getSupabaseServerClient()
      .from('broker_report_documents')
      .select('id', { count: 'exact', head: true })
      .eq('stock_id', stockId)
      .in('source_mode', [...AUTHORIZED_BROKER_SOURCE_MODES]);
    return Number(res.count || 0);
  } catch {
    return 0;
  }
}

async function findOrCreateRevaluationJob(params: {
  stockId: string;
  symbol: string;
  triggerReason: string;
  requiredEvidence: string[];
  priority: number;
  dryRun?: boolean;
}) {
  const supabaseServer = getSupabaseServerClient();
  if (params.dryRun) {
    return {
      id: `dry-run-${params.symbol}`,
      stock_id: params.stockId,
      symbol: params.symbol,
      trigger_reason: params.triggerReason,
      trigger_source: 'stockinsider',
      status: 'queued',
      priority: params.priority,
      required_evidence: params.requiredEvidence,
      last_result: 'dryRun：會建立 durable revaluation job 並補抓券商/財務/社群來源。',
      queued_at: nowIso(),
      last_attempt_at: null,
      updated_at: nowIso(),
    } as Row;
  }
  const openRes = await supabaseServer
    .from('revaluation_jobs')
    .select('*')
    .eq('stock_id', params.stockId)
    .eq('trigger_reason', params.triggerReason)
    .in('status', ['queued', 'running'])
    .order('updated_at', { ascending: false })
    .limit(1);
  const openJob = ((openRes.data as Row[]) || [])[0];
  if (openJob?.id) {
    const updateRes = await supabaseServer
      .from('revaluation_jobs')
      .update({
        priority: params.priority,
        required_evidence: params.requiredEvidence,
        last_result: openJob.last_result || '已在重估佇列中，等待下一輪執行。',
        next_attempt_at: nowIso(),
        updated_at: nowIso(),
      })
      .eq('id', String(openJob.id))
      .select('*')
      .single();
    return (updateRes.data as Row) || openJob;
  }
  const insertRes = await supabaseServer
    .from('revaluation_jobs')
    .insert({
      stock_id: params.stockId,
      symbol: params.symbol,
      trigger_reason: params.triggerReason,
      trigger_source: 'stockinsider',
      status: 'queued',
      priority: params.priority,
      required_evidence: params.requiredEvidence,
      last_result: '已排入 durable bridge-aware 重估佇列，等待券商、月營收、EPS、Forward PE 與社群券商線索補抓。',
      queued_at: nowIso(),
      next_attempt_at: nowIso(),
      metadata: { source: 'radar_visible_revaluation' },
    })
    .select('*')
    .single();
  if (insertRes.error) throw new Error(insertRes.error.message);
  return insertRes.data as Row;
}

function pickRevaluationCards(radar: RadarDailyPayload, symbols: string[], maxSymbols: number) {
  const requested = new Set(symbols.map((item) => item.toUpperCase()));
  const allCards = [
    ...(radar.opportunities || []),
    ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []),
    ...(radar.hotTracking || []),
  ].filter((card, index, arr) => card.symbol && arr.findIndex((item) => item.symbol === card.symbol) === index);
  return allCards
    .filter((card) => (requested.size > 0 ? requested.has(card.symbol) : revaluationNeedsJob(card)))
    .sort((a, b) => (b.revaluationPriority || 0) - (a.revaluationPriority || 0))
    .slice(0, maxSymbols);
}

export async function runRevaluationQueue(options?: {
  dryRun?: boolean;
  symbols?: string[];
  maxSymbols?: number;
  connectors?: string[];
}) {
  const dryRun = Boolean(options?.dryRun);
  const maxSymbols = Math.max(1, Math.min(24, Number(options?.maxSymbols || options?.symbols?.length || 8)));
  const requestedSymbols = unique((options?.symbols || []).map((item) => String(item || '').toUpperCase()).filter(Boolean));
  const radar = await getDailyRadarData();
  const pickedCards = pickRevaluationCards(radar, requestedSymbols, maxSymbols);
  const supabaseServer = getSupabaseServerClient();
  const stocksRes = pickedCards.length
    ? await supabaseServer.from('stocks').select('id,symbol').in('symbol', pickedCards.map((card) => card.symbol))
    : { data: [], error: null };
  if (stocksRes.error) throw new Error(stocksRes.error.message);
  const stockIdBySymbol = new Map(((stocksRes.data as Row[]) || []).map((row) => [String(row.symbol || '').toUpperCase(), String(row.id || '')]));
  const researchV2 = await import('./research-v2');
  const results: Array<{
    symbol: string;
    jobId: string | null;
    status: RevaluationJobState;
    triggerReason: string;
    result: string;
    brokerRecordsBefore: number;
    brokerRecordsAfter: number;
  }> = [];

  for (const card of pickedCards) {
    const symbol = card.symbol.toUpperCase();
    const stockId = stockIdBySymbol.get(symbol) || '';
    if (!stockId) continue;
    const triggerReason = revaluationTriggerReasonForCard(card);
    const requiredEvidence = revaluationRequiredEvidenceForCard(card);
    const job = await findOrCreateRevaluationJob({
      stockId,
      symbol,
      triggerReason,
      requiredEvidence,
      priority: Number(card.revaluationPriority || 50),
      dryRun,
    });
    const jobId = String(job.id || '');
    let attemptId: string | null = null;
    let resultStatus: RevaluationJobState = 'running';
    let resultSummary = '重估執行中。';
    const brokerRecordsBefore = await countBrokerDocsForStock(stockId);
    try {
      if (!dryRun) {
        const attemptRes = await supabaseServer
          .from('revaluation_job_attempts')
          .insert({
            job_id: jobId,
            stock_id: stockId,
            symbol,
            attempt_status: 'running',
            metadata: { triggerReason, connectors: options?.connectors || null },
          })
          .select('id')
          .single();
        if (attemptRes.error) throw new Error(attemptRes.error.message);
        attemptId = String((attemptRes.data as Row)?.id || '');
        await supabaseServer
          .from('revaluation_jobs')
          .update({ status: 'running', last_attempt_at: nowIso(), updated_at: nowIso(), last_result: '重估執行中：補抓券商/社群/財務來源。' })
          .eq('id', jobId);
      }

      await researchV2.runBrokerReportIngest({ dryRun, symbols: [symbol], topN: 1 });
      const brokerRecordsAfter = await countBrokerDocsForStock(stockId);
      if (!dryRun) {
        await supabaseServer.from('broker_search_attempts').insert({
          stock_id: stockId,
          symbol,
          job_id: jobId,
          search_surface: 'authorized_broker_sources',
          search_keywords: ['授權券商 API', '使用者上傳 PDF', '公司 IR', '目標價', 'Forward EPS', symbol],
          status: brokerRecordsAfter > brokerRecordsBefore ? 'hit' : 'miss',
          records_found: Math.max(0, brokerRecordsAfter - brokerRecordsBefore),
          records_written: Math.max(0, brokerRecordsAfter - brokerRecordsBefore),
          summary:
            brokerRecordsAfter > brokerRecordsBefore
              ? `授權券商或使用者提供來源新增 ${brokerRecordsAfter - brokerRecordsBefore} 筆。`
              : '授權券商或使用者提供來源本輪未新增可驗證資料。',
          metadata: { before: brokerRecordsBefore, after: brokerRecordsAfter },
        });
      }

      const connectors = options?.connectors || ['telegram', 'ptt', 'bulltalk', 'gdelt', 'twse_insider'];
      const refreshResult = await runStockResearchRefresh({
        symbol,
        force: true,
        reason: `revaluation_job:${triggerReason}`,
        dryRun,
        connectors,
      });
      const before = refreshResult.targetSnapshotBefore;
      const after = refreshResult.targetSnapshotAfter;
      const baseChanged = before?.baseTarget !== after?.baseTarget || before?.upsideTarget !== after?.upsideTarget;
      const detailAfter = dryRun ? null : await getStockDeepDive(symbol);
      const promotionStatus = detailAfter?.targetSnapshot?.scenarioPromotionStatus || null;
      const coverageStatus = detailAfter?.targetSnapshot?.targetCoverageStatus || after?.targetCoverageStatus || null;
      if (promotionStatus === 'eligible') {
        resultStatus = 'promoted_scenario_to_base';
        resultSummary = '情境 promotion gate 已達標；需以最新財務與券商來源重算新 Base。';
      } else if (baseChanged) {
        resultStatus = 'repriced';
        resultSummary = '已取得足以改變 target snapshot 的新證據，本輪已重新定價。';
      } else if (coverageStatus === 'over_base_and_scenario') {
        resultStatus = 'archived_reflected';
        resultSummary = '現價已高於 Base 與情境，且本輪未取得可上修 EPS/Forward PE/券商共識的新證據；列為估值已反映。';
      } else if (after?.bridgeCompleteness === 'insufficient') {
        resultStatus = 'blocked_insufficient_evidence';
        resultSummary = 'bridge 仍缺可驗證財務或券商資料，無法產生正式 Base。';
      } else {
        resultStatus = 'unchanged_with_reason';
        resultSummary = '已完成重估補抓；本輪沒有足以改變營收、毛利率、EPS、Forward PE 或券商共識的新證據，target 暫不調整。';
      }

      if (!dryRun) {
        await supabaseServer
          .from('revaluation_jobs')
          .update({
            status: resultStatus,
            last_result: resultSummary,
            last_attempt_at: nowIso(),
            completed_at: nowIso(),
            old_base_target: before?.baseTarget ?? null,
            old_scenario_target: before?.upsideTarget ?? null,
            new_base_target: after?.baseTarget ?? null,
            new_scenario_target: after?.upsideTarget ?? null,
            updated_at: nowIso(),
            metadata: { refreshRunId: refreshResult.runId, sourceRefreshSummary: refreshResult.sourceRefreshSummary },
          })
          .eq('id', jobId);
        if (attemptId) {
          await supabaseServer
            .from('revaluation_job_attempts')
            .update({
              attempt_status: 'completed',
              finished_at: nowIso(),
              result_status: resultStatus,
              result_summary: resultSummary,
              evidence_found: {
                brokerRecordsBefore,
                brokerRecordsAfter,
                connectorResults: refreshResult.connectorResults,
              },
            })
            .eq('id', attemptId);
        }
      }
      results.push({ symbol, jobId, status: resultStatus, triggerReason, result: resultSummary, brokerRecordsBefore, brokerRecordsAfter });
    } catch (error) {
      resultStatus = 'blocked_insufficient_evidence';
      resultSummary = safeErrorMessage(error);
      if (!dryRun) {
        await supabaseServer
          .from('revaluation_jobs')
          .update({ status: resultStatus, last_result: resultSummary, last_attempt_at: nowIso(), updated_at: nowIso() })
          .eq('id', jobId);
        if (attemptId) {
          await supabaseServer
            .from('revaluation_job_attempts')
            .update({ attempt_status: 'failed', finished_at: nowIso(), error_message: resultSummary, result_summary: resultSummary })
            .eq('id', attemptId);
        }
      }
      results.push({ symbol, jobId, status: resultStatus, triggerReason, result: resultSummary, brokerRecordsBefore, brokerRecordsAfter: brokerRecordsBefore });
    }
  }

  return {
    runId: randomUUID(),
    dryRun,
    checkedAt: nowIso(),
    requestedSymbols,
    processed: results.length,
    results,
  };
}

async function buildLightStockDeepDiveSnapshot(stock: Row, symbol: string): Promise<StockDeepDivePayload | null> {
  const normalizedSymbol = symbol.toUpperCase();
  const fastInsight = await withFallbackTimeout(getFastLightStockInsight(stock, normalizedSymbol), null, 2800);
  const needsRicherChart = !fastInsight || (fastInsight.chart?.length || 0) < 120;
  const minimalInsight = needsRicherChart
    ? await withFallbackTimeout(getMinimalStockInsight(stock, normalizedSymbol), null, 4500)
    : null;
  const insight =
    (minimalInsight && (minimalInsight.chart?.length || 0) >= (fastInsight?.chart?.length || 0) ? minimalInsight : null) ||
    fastInsight ||
    minimalInsight;
  if (!insight) return null;

  const stockId = String(stock.id || '');
  const supabaseServer = getSupabaseServerClient();
  const [bridgeSupport, marketRes, agentStatus, connectorStatus] = await Promise.all([
    loadBridgeSupportDataForStockIds(stockId ? [stockId] : []),
    withQueryTimeout(
      supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      [],
      2500,
    ),
    withFallbackTimeout(getAgentStatusSummary(), fallbackAgentStatusSummary(), 2500),
    withFallbackTimeout(getConnectorStatusSummary(), [], 2500),
  ]);

  const revenueRow = bridgeSupport.revenueByStockId.get(stockId) || null;
  const revenueRows = bridgeSupport.revenueRowsByStockId.get(stockId) || [];
  const fundamentalRows = bridgeSupport.fundamentalRowsByStockId.get(stockId) || [];
  const storyRow = bridgeSupport.storyByStockId.get(stockId) || null;
  const thesisRow = bridgeSupport.thesisByStockId.get(stockId) || null;
  const valuationCases =
    bridgeSupport.valuationCasesByStockId.get(stockId) ||
    seedFallbackValuationCases(normalizedSymbol, insight.price ?? null);
  const revenueView = buildRevenueSignalViewFromRows(
    revenueRows,
    normalizedSymbol,
    (storyRow?.updated_at ? String(storyRow.updated_at) : null) || (thesisRow?.updated_at ? String(thesisRow.updated_at) : null) || insight.asOf || null,
  );
  const fundamentalView = buildFundamentalSnapshotViewFromRows(
    fundamentalRows,
    normalizedSymbol,
    (storyRow?.updated_at ? String(storyRow.updated_at) : null) || (thesisRow?.updated_at ? String(thesisRow.updated_at) : null) || insight.asOf || null,
  );
  const evidenceRefSeed = uniqueNarrativeLines(
    [
      storyRow?.summary ? String(storyRow.summary) : null,
      thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : null,
      thesisRow?.story_source_summary ? String(thesisRow.story_source_summary) : null,
    ],
    4,
  );
  const bundle = buildBridgeAwareSnapshotBundle({
    symbol: normalizedSymbol,
    currentPrice: insight.price ?? null,
    latestSourceAt:
      (revenueRow?.as_of_date ? `${String(revenueRow.as_of_date)}T00:00:00+08:00` : null) ||
      (storyRow?.updated_at ? String(storyRow.updated_at) : null) ||
      (thesisRow?.updated_at ? String(thesisRow.updated_at) : null) ||
      null,
    reportUpdatedAt:
      (storyRow?.updated_at ? String(storyRow.updated_at) : null) ||
      (thesisRow?.updated_at ? String(thesisRow.updated_at) : null) ||
      insight.asOf ||
      null,
    priceAsOf: insight.asOf || null,
    thesisTitle:
      (storyRow?.title ? String(storyRow.title) : null) ||
      (thesisRow?.thesis_title ? String(thesisRow.thesis_title) : null) ||
      null,
    thesisSummary:
      (storyRow?.summary ? String(storyRow.summary) : null) ||
      (thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : null) ||
      null,
    valuationCases,
    monthlyRevenue: revenueView?.monthlyRevenue ?? null,
    yoyGrowth: revenueView?.yoyGrowth ?? null,
    momGrowth: revenueView?.momGrowth ?? null,
    revenueAnnual: fundamentalView?.revenueRunRate ?? (revenueView?.monthlyRevenue != null ? revenueView.monthlyRevenue * 12 : null),
    epsTtm: fundamentalView.epsTtm ?? null,
    peRatio: fundamentalView.peRatio ?? null,
    pbRatio: fundamentalView.pbRatio ?? null,
    grossMargin: fundamentalView.grossMargin ?? null,
    operatingMargin: fundamentalView.operatingMargin ?? null,
    baseEvidenceRefs: evidenceRefSeed,
    scenarioEvidenceRefs: evidenceRefSeed,
  });

  const technicalSnapshot = buildTechnicalSnapshotFromCandles(
    insight.chart,
    insight.indicators,
    insight.chartSource || (insight.chart.length > 0 ? 'stock_signals' : 'missing'),
    insight.chart.length > 0 ? null : insight.chartMissingReason || '目前缺少足夠的日線資料，暫時無法完整計算技術指標。',
  );
  const timeframeCharts = {
    daily: insight.chart,
    weekly: aggregateCandles(insight.chart, 5),
    monthly: aggregateCandles(insight.chart, 21),
    quarterly: aggregateCandles(insight.chart, 63),
    halfYear: aggregateCandles(insight.chart, 126),
    yearly: aggregateCandles(insight.chart, 252),
  };
  const latestMarket = (marketRes.data?.[0] as Row | undefined) || null;
  const marketFocus: DailyMarketFocus | null = latestMarket
    ? {
        market: 'TW',
        asOf: String(latestMarket.as_of || ''),
        sectorFlows: (latestMarket.sector_flows as Record<string, number>) || {},
        indexState: (latestMarket.index_state as Record<string, unknown>) || {},
        freshness: (latestMarket.freshness_status as SignalFreshness) || 'missing',
      }
    : null;
  const narrativeKeywords = unique(
    [
      normalizedSymbol,
      String(stock.name || ''),
      storyRow?.title ? String(storyRow.title) : '',
      storyRow?.summary ? String(storyRow.summary) : '',
      thesisRow?.thesis_title ? String(thesisRow.thesis_title) : '',
      thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : '',
    ].filter(Boolean),
  );
  const marketRotationSnapshot = buildMarketRotationSnapshot(marketFocus, narrativeKeywords);
  const marketIndexSignal = buildMarketIndexSignal(marketFocus, []);
  const chipSnapshot = buildChipSnapshotFromMetrics((insight.chipMetrics as Record<string, unknown>) || null, bundle.targetSnapshot.verdict);
  if (chipSnapshot) {
    chipSnapshot.marketRotation = marketRotationSnapshot.marketRotation;
    chipSnapshot.sectorFlow = marketRotationSnapshot.sectorFlow;
    chipSnapshot.timingScore = buildChipTimingScore(chipSnapshot, marketRotationSnapshot.sectorFlowScore);
    chipSnapshot.timingAssessment =
      sentenceFromBridgeSegments(
        [chipSnapshot.timingAssessment, marketRotationSnapshot.sectorFlow],
        chipSnapshot.timingAssessment || marketRotationSnapshot.sectorFlow || '籌碼與資金輪動資料整理中。',
      ) || '籌碼與資金輪動資料整理中。';
  }

  const latestEvidence: DeepDiveLatestFact[] = [
    ...(revenueView?.monthlyRevenue != null
      ? [
          {
            id: 'light-revenue-evidence',
            label: '支撐 Base',
            summary: `月營收資料已回補到 ${revenueView.asOfDate}，作為 Base 營收 run-rate 與估值橋接基底。`,
            asOf: `${revenueView.asOfDate}T00:00:00+08:00`,
            sourceName: 'MOPS 月營收',
            sourceUrl: 'https://mops.twse.com.tw/mops/web/t05st10_ifrs',
            sourceType: 'financial' as const,
            supportCase: 'base' as const,
          },
        ]
      : []),
    ...(fundamentalView.dataQuality !== 'missing'
      ? [
          {
            id: 'light-fundamental-evidence',
            label: '支撐 Base',
            summary: `基本面快照已回補到 ${fundamentalView.asOfDate}，用於 EPS、PE/PB 與毛利率/營益率基底。`,
            asOf: `${fundamentalView.asOfDate}T00:00:00+08:00`,
            sourceName: 'MOPS / TWSE 財報快照',
            sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb03',
            sourceType: 'financial' as const,
            supportCase: 'base' as const,
          },
        ]
      : []),
    ...(insight.asOf
      ? [
          {
            id: 'light-market-evidence',
            label: '支撐進場 timing',
            summary: `市場價格與技術資料時間為 ${insight.asOf}，用於日 K、均線、RSI、MACD 與買點劇本。`,
            asOf: insight.asOf,
            sourceName: 'TWSE / node-twstock 市場資料',
            sourceUrl: 'https://www.twse.com.tw/zh/trading/historical/stock-day.html',
            sourceType: 'official' as const,
            supportCase: 'base' as const,
          },
        ]
      : []),
    ...(bundle.baseCaseDetail?.evidenceRefs || []).map((summary, index) => ({
      id: `light-base-evidence-${index}`,
      label: '支撐 Base',
      summary: cleanEvidenceDirectionPrefix(summary) || sanitizeNarrativeText(summary),
      asOf: bundle.targetSnapshot.latestSourceAt || null,
      sourceName: 'bridge_snapshot',
      sourceUrl: null,
      sourceType: 'system' as const,
      supportCase: 'base' as const,
    })),
    ...(bundle.scenarioCaseDetail?.evidenceRefs || []).map((summary, index) => ({
      id: `light-scenario-evidence-${index}`,
      label: '支撐情境',
      summary: cleanEvidenceDirectionPrefix(summary) || sanitizeNarrativeText(summary),
      asOf: bundle.targetSnapshot.latestSourceAt || null,
      sourceName: 'bridge_snapshot',
      sourceUrl: null,
      sourceType: 'system' as const,
      supportCase: 'scenario' as const,
    })),
  ]
    .filter((item) => Boolean(item.summary))
    .slice(0, 5);
  const sourceCitationMap = buildSourceCitationMap({ latestEvidence });
  const externalResearchSourceAt = latestExternalCitationTimestamp(sourceCitationMap, bundle.targetSnapshot.latestSourceAt || null);
  const sharedSourceRefs = firstCitationRefs(sourceCitationMap, ['official', 'financial', 'system'], 2);
  const baseSourceRefs = firstCitationRefs(sourceCitationMap, ['official', 'financial', 'system'], 2);
  const scenarioSourceRefs = firstCitationRefs(sourceCitationMap, ['industry', 'threads', 'instagram', 'system'], 2);
  for (const item of latestEvidence) {
    item.sourceRefId = sourceCitationMap.find((ref) => ref.sourceName === item.sourceName && ref.sourceType === item.sourceType)?.id || null;
  }
  const sharedCitationIds = citationIds(sharedSourceRefs);
  const baseCitationIds = citationIds(baseSourceRefs);
  const scenarioCitationIds = citationIds(scenarioSourceRefs);
  if (bundle.sharedVerifiedBasis) {
    bundle.sharedVerifiedBasis.sourceRefs = sharedSourceRefs;
    bundle.sharedVerifiedBasis.customerEvidenceRefs = sharedCitationIds;
    if (bundle.sharedVerifiedBasis.supplyChainMap) {
      bundle.sharedVerifiedBasis.supplyChainMap.sourceRefs = sharedCitationIds;
    }
  }
  if (bundle.baseCaseDetail) bundle.baseCaseDetail.sourceRefs = baseSourceRefs;
  if (bundle.scenarioCaseDetail) bundle.scenarioCaseDetail.sourceRefs = scenarioSourceRefs;
  const brokerConsensus = null;
  let assumptionLedger = buildValuationAssumptionLedger({
    baseCaseDetail: bundle.baseCaseDetail,
    scenarioCaseDetail: bundle.scenarioCaseDetail,
  });
  const valuationConfidenceGate = evaluateValuationConfidenceGate({
    baseCaseDetail: bundle.baseCaseDetail,
    sharedVerifiedBasis: bundle.sharedVerifiedBasis,
    brokerConsensus,
    currentPrice: insight.price ?? null,
  });
  if (!valuationConfidenceGate.baseTargetFormal) {
    downgradeBaseCaseForConfidenceGate(bundle.baseCaseDetail, valuationConfidenceGate);
    assumptionLedger = buildValuationAssumptionLedger({
      baseCaseDetail: bundle.baseCaseDetail,
      scenarioCaseDetail: bundle.scenarioCaseDetail,
    });
    const lightInitialTargetSnapshot = buildTargetSnapshot(
      bundle.targetSnapshot.currentPrice,
      bundle.targetSnapshot.baseTarget,
      bundle.targetSnapshot.upsideTarget,
      bundle.targetSnapshot.bearTarget,
      bundle.targetSnapshot.latestSourceAt || null,
      bundle.targetSnapshot.reportUpdatedAt || null,
      bundle.targetSnapshot.priceAsOf || null,
    );
    Object.assign(
      bundle.targetSnapshot,
      buildBridgeAwareTargetSnapshot(
        lightInitialTargetSnapshot,
        bundle.baseCaseDetail,
        bundle.scenarioCaseDetail,
        bundle.scenarioBridges.find((item) => item.key === 'invalidation') || null,
      ),
    );
    bundle.targetSnapshot.valuationSanityStatus = 'insufficient_verified_basis';
    bundle.targetSnapshot.valuationSanityReason = valuationConfidenceGate.reason;
    refreshBridgeBundlePromotionAndRevaluation(bundle);
  }
  bundle.targetSnapshot.valuationConfidenceGate = valuationConfidenceGate;
  const forwardPeBridge = buildForwardPeBridge({ currentPrice: insight.price ?? null, baseCaseDetail: bundle.baseCaseDetail });
  const peerValuationRange = buildPeerValuationRange(bundle.baseCaseDetail);
  const valuationReviewFlags = buildValuationReviewFlags({
    currentPrice: insight.price ?? null,
    baseCaseDetail: bundle.baseCaseDetail,
    scenarioCaseDetail: bundle.scenarioCaseDetail,
    gate: valuationConfidenceGate,
    forwardPeBridge,
    peerValuationRange,
  });
  const latestCitationIds = citationIds(sourceCitationMap.filter(isExternalCitationRef).slice(0, 3));
  const lightSourceItems: SourceCoverageView[] = sourceCitationMap
    .filter((ref) => isExternalCitationRef(ref))
    .map((ref) => ({
      sourceName: ref.sourceName,
      sourceType: (['official', 'financial'].includes(ref.sourceType) ? ref.sourceType : 'public_research') as SourceCoverageView['sourceType'],
      summary: `${ref.label}：${ref.evidenceClass}`,
      sourceUrl: ref.sourceUrl,
      sourceTimestamp: ref.asOf,
      symbols: [normalizedSymbol],
      directHit: true,
      verificationStatus: '部分證實',
      confidence: ref.sourceUrl ? 0.7 : 0.45,
      weight: ref.sourceUrl ? 0.2 : 0.08,
    }));
  const thesisState = normalizeRecommendationState(storyRow?.thesis_state);
  const verificationStatus = verificationStatusFromState(thesisState);
  const reportUpdatedAt = bundle.targetSnapshot.reportUpdatedAt || insight.asOf || nowIso();
  const latestSourceAt = bundle.targetSnapshot.latestSourceAt || null;
  const freshness = freshnessFromTimestamp(latestSourceAt, 72);
  const technicalSummary =
    deepDiveTechnicalSourceNarrative(insight.chartSource, insight.chartMissingReason || technicalSnapshot.missingReason) ||
    '技術圖表與量價節奏會持續隨日線更新。';
  const technicalEntrySignal = buildTechnicalEntrySignal(technicalSnapshot, insight.price ?? null, insight.volume ?? null, insight.chart);
  const chipEntryAssessment = buildChipEntryAssessment({
    chipSnapshot,
    technicalEntrySignal,
    technicalSnapshot,
    volume: insight.volume ?? null,
    chart: insight.chart,
    marketRotationSnapshot,
    targetVerdict: bundle.targetSnapshot.verdict,
    sourceRefs: sharedCitationIds,
  });
  const relativeStrengthSignal = buildRelativeStrengthSignal({
    symbol: normalizedSymbol,
    timingScore: chipSnapshot?.timingScore ?? null,
    globalThemeLeadLagSignal: null,
    priceAsOf: bundle.targetSnapshot.priceAsOf || insight.asOf || null,
  });
  const tradeDecision = buildTradeDecision({
    entryDecision: chipEntryAssessment.entryDecision,
    marketIndexSignal,
    targetSnapshot: bundle.targetSnapshot,
    relativeStrengthSignal,
  });
  const dataHealth = buildDataHealth({
    marketDataAsOf: bundle.targetSnapshot.priceAsOf || insight.asOf || null,
    researchSourceAsOf: externalResearchSourceAt,
    reportBuiltAt: reportUpdatedAt,
    chipDataStatus: chipSnapshot?.dataStatus || null,
    sourceStatuses: buildSourceStatuses({
      coverageStatus: [
        {
          id: 'official_financial',
          label: '官方 / 財報 / 月營收',
          status: latestEvidence.some((item) => item.sourceType === 'financial' || item.sourceType === 'official') ? 'hit' : 'missing',
          summary:
            latestEvidence.some((item) => item.sourceType === 'financial' || item.sourceType === 'official')
              ? 'Light snapshot 已回補官方/財務來源註腳。'
              : 'Light snapshot 尚未取得官方/財務來源註腳，需等待盤前資料刷新。',
          sourceTypes: ['official', 'financial'],
        },
      ],
      citationMap: sourceCitationMap,
      chipDataStatus: chipSnapshot?.dataStatus || null,
      technicalAsOf: bundle.targetSnapshot.priceAsOf || insight.asOf || null,
    }),
  });
  const recommendationStance = buildRecommendationStance(bundle.targetSnapshot, chipEntryAssessment, tradeDecision);
  if (bundle.scenarioCaseDetail) {
    bundle.scenarioCaseDetail.achievementChecklist = buildScenarioAchievementChecklist({
      baseCaseDetail: bundle.baseCaseDetail,
      scenarioCaseDetail: bundle.scenarioCaseDetail,
      monthlyRevenue: revenueView?.monthlyRevenue ?? null,
      technicalEntrySignal,
      chipEntryAssessment,
      sourceRefs: scenarioCitationIds,
    });
    refreshBridgeBundlePromotionAndRevaluation(bundle);
  }
  bundle.targetSnapshot.marketValuationAdjustment = buildMarketValuationAdjustment({
    marketIndexSignal,
    targetCoverageStatus: bundle.targetSnapshot.targetCoverageStatus || null,
    staleReason: bundle.targetSnapshot.staleReason || null,
    scenarioPromotionGate: bundle.scenarioCaseDetail?.promotionGate || null,
    brokerEvidenceSearchStatus: bundle.targetSnapshot.brokerEvidenceSearchStatus || null,
    globalThemeLeadLagSignal: null,
  });
  if (bundle.scenarioCaseDetail?.promotionGate) {
    bundle.scenarioCaseDetail.promotionGate = applyMarketReratingToPromotionGate(
      bundle.scenarioCaseDetail.promotionGate,
      bundle.targetSnapshot.marketValuationAdjustment,
    );
    bundle.targetSnapshot.scenarioPromotionStatus = bundle.scenarioCaseDetail.promotionGate?.status || null;
  }
  const lightAssistiveModelSignal: NonNullable<RecommendationCard['modelSignal']> = {
    sourceSentimentScore: latestEvidence.length > 0 ? clamp(0.48 + latestEvidence.length * 0.035, 0.48, 0.68) : null,
    extractionConfidence: clamp(sourceCitationMap.filter(isExternalCitationRef).length / 5, 0.22, 0.78),
    summaryModel: 'StockInsider HF/規則證據模型',
    boundary: 'assistive_only',
    promotionImpact: 'none',
    latestAt: externalResearchSourceAt || latestSourceAt || null,
  };
  const mlForecastBand = buildAssistiveMlForecastBand({
    currentPrice: insight.price ?? null,
    modelSignal: lightAssistiveModelSignal,
    brokerConsensus,
    sourceRefs: latestCitationIds,
    entryVerdict: chipEntryAssessment.verdict,
    technicalVerdict: technicalEntrySignal.verdict,
  });
  const valuationModelDivergence = buildValuationModelDivergence({
    formulaTarget: bundle.targetSnapshot.baseTarget,
    mlForecastBand,
    currentPrice: insight.price ?? null,
  });
  if (valuationModelDivergence?.status === 'valuation_model_divergence_review') {
    valuationReviewFlags.push({
      code: 'ml_formula_divergence',
      severity: 'blocker',
      summary: valuationModelDivergence.summary,
    });
  }
  const scenarioHasIndependentDelta = Boolean(bundle.scenarioCaseDetail?.hasIndependentDelta);

  return {
    ...insight,
    targetSnapshot: bundle.targetSnapshot,
    reportSnapshot: {
      title: (storyRow?.title ? String(storyRow.title) : null) || `${normalizedSymbol} 深度分析報告`,
      subtitle: `投資主張：${recommendationStance.displayLabel}。目前交易動作是「${tradeDecision.action}」，部位建議為 ${tradeDecision.positionSize}。`,
      summaryBullets: uniqueNarrativeLines(
        [
          bundle.baseCaseDetail?.driver ? `Base 驅動：${bundle.baseCaseDetail.driver}` : null,
          scenarioHasIndependentDelta && bundle.scenarioCaseDetail?.driver ? `情境驅動：${bundle.scenarioCaseDetail.driver}` : null,
          marketRotationSnapshot.sectorFlow,
        ],
        3,
      ),
      sections: [
        {
          id: 'analysis',
          heading: '評論及分析',
          paragraphs: uniqueNarrativeLines(
            [
              `${normalizedSymbol} 的投資判斷不再重複來源清單；重點是 ${bundle.baseCaseDetail?.driver || '核心營運動能'} 是否持續轉成月營收、毛利率與 EPS 上修。`,
              bundle.baseCaseDetail?.driver ? `Base 估值只承接已可驗證的財務主軸：${bundle.baseCaseDetail.driver}。` : null,
              scenarioHasIndependentDelta
                ? `情境只追蹤 Base 之外的待驗證上行條件：${bundle.scenarioCaseDetail?.deltaAssumptions?.[0] || '等待新的客戶、產品 mix 或月營收證據。'}`
                : '目前尚無獨立上行情境；重點是 Base 是否持續被新資料支持。',
            ],
            4,
          )
            .filter((line) => !reportParagraphIsInternal(line))
            .map((line) => appendCitationIds(line, sharedCitationIds))
            .filter((item): item is string => Boolean(item)),
          sourceRefs: sharedCitationIds,
        },
        {
          id: 'base_case',
          heading: 'Base 目標價推導',
          paragraphs: uniqueNarrativeLines(
            [
                    'Base 估值建立在目前已驗證、足以支撐正式估值的需求與財務基底上。',
              bundle.baseCaseDetail?.marketSizingBridge,
              bundle.baseCaseDetail?.revenueBridge,
              bundle.baseCaseDetail?.marginBridge,
              bundle.baseCaseDetail?.earningsBridge,
              bundle.baseCaseDetail?.multipleBridge,
              bundle.baseCaseDetail?.priceBridge || bundle.baseCaseDetail?.insufficientBridgeReason || 'Base 橋接仍在更新中。',
            ],
            5,
          ).map((line) => appendCitationIds(line, baseCitationIds)).filter((item): item is string => Boolean(item)),
          sourceRefs: baseCitationIds,
        },
        ...(scenarioHasIndependentDelta
          ? [
              {
                id: 'scenario_case' as const,
                heading: '情境目標價推導',
                paragraphs: uniqueNarrativeLines(
                  [
                    ...(bundle.scenarioCaseDetail?.deltaAssumptions || []),
                    buildScenarioIncrementalImpactSentence(bundle.baseCaseDetail, bundle.scenarioCaseDetail),
                    bundle.scenarioCaseDetail?.earningsBridge,
                    bundle.scenarioCaseDetail?.multipleBridge,
                    bundle.scenarioCaseDetail?.priceBridge || bundle.scenarioCaseDetail?.insufficientBridgeReason || '情境橋接仍在更新中。',
                  ],
                  5,
                ).map((line) => appendCitationIds(line, scenarioCitationIds)).filter((item): item is string => Boolean(item)),
                sourceRefs: scenarioCitationIds,
              },
            ]
          : []),
        {
          id: 'latest_evidence',
          heading: '最新證據',
          paragraphs: latestEvidence.map((item) => `${item.label}：${cleanEvidenceDirectionPrefix(item.summary) || item.summary}${item.sourceRefId ? ` [${item.sourceRefId}]` : ''}`),
          sourceRefs: latestCitationIds,
        },
        {
          id: 'capital_flow',
          heading: '資金與籌碼',
          paragraphs: [
            chipEntryAssessment.chipRead,
            chipEntryAssessment.supportResistance.summary,
            '盤中微結構資料（內外盤比、分價量表、分點進出）尚未接入，本段不硬推估；目前先以法人、融資融券、借券、族群資金與日線量價判斷。',
          ],
        },
        {
          id: 'investment',
          heading: '投資建議',
          paragraphs: [
            bundle.targetSnapshot.verdict === 'formal'
              ? '目前 Base 目標價仍高於現價，但是否適合立即進場仍要搭配技術面與資金輪動判讀。'
              : '目前先以 bridge-aware light snapshot 回傳，等完整證據與報告補齊後再決定是否升級推薦。',
	            `交易決策：${tradeDecision.action}。${tradeDecision.positionSize}；${tradeDecision.marketGateReason}`,
	            `技術進場判讀：${technicalEntrySignal.summary}`,
	            `籌碼判讀：${chipEntryAssessment.chipRead}`,
          ],
        },
        {
          id: 'risk',
          heading: '投資風險',
          paragraphs: [
            bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.insufficientBridgeReason ||
              '若客戶拉貨與產品 mix 無法落地，需回到觀察。',
            '若後續新資料無法補強 Base / 情境假設，目標價與推薦等級都應重新調整。',
          ],
        },
      ],
    },
    valuationPanel: {
      monthlyRevenue: revenueView?.monthlyRevenue ?? null,
      yoyGrowth: revenueView?.yoyGrowth ?? null,
      momGrowth: revenueView?.momGrowth ?? null,
      epsTtm: fundamentalView.epsTtm ?? null,
      peRatio: fundamentalView.peRatio ?? null,
      pbRatio: fundamentalView.pbRatio ?? null,
      baseTarget: bundle.targetSnapshot.baseTarget,
      upsideTarget: bundle.targetSnapshot.upsideTarget,
      bearTarget: bundle.targetSnapshot.bearTarget,
      nextValidationPoint: latestEvidence[0]?.summary || null,
      dataAsOf: reportUpdatedAt,
      multipleMapping: bundle.priceTargetRationale,
      peerComparison: bundle.peerComparison,
      priceTargetRationale: bundle.priceTargetRationale,
      sourceCitationMap,
      assumptionLedger,
      brokerConsensus,
      valuationConfidenceGate,
      forwardPeBridge,
      peerValuationRange,
      valuationReviewFlags,
      mlForecastBand,
      valuationModelDivergence,
      modelSignalSummary: modelSignalSummaryFor(lightAssistiveModelSignal),
      sharedVerifiedBasis: bundle.sharedVerifiedBasis,
      scenarioNote: bundle.scenarioNote,
      baseCaseDetail: bundle.baseCaseDetail,
      scenarioCaseDetail: bundle.scenarioCaseDetail,
    },
    chipSnapshot,
    dataHealth,
    recommendationStance,
    chipEntryAssessment,
    marketIndexSignal,
    relativeStrengthSignal,
    tradeDecision,
    marketRotationSnapshot,
    sourceFreshness: {
      freshness,
      latestSourceAt,
      reportUpdatedAt,
      priceAsOf: insight.asOf || null,
    },
    summaryCard: {
      currentPrice: insight.price ?? null,
      baseTarget: bundle.targetSnapshot.baseTarget ?? null,
      upsidePct: bundle.targetSnapshot.cardPrimaryUpsidePct ?? null,
      lastUpdatedAt: reportUpdatedAt,
      latestSourceAt,
      freshness,
    },
    chaseAssessment:
      bundle.targetSnapshot.verdict === 'formal'
        ? {
            verdict: 'can_chase',
            label: '仍可追，但要控風險',
            reason: 'Base 情境仍高於現價，但仍需搭配技術面與族群資金確認進場節奏。',
            trigger: chipSnapshot?.timingAssessment || '等待量價結構更乾淨的進場點。',
            invalidation: bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.insufficientBridgeReason || '若核心故事鈍化，需重新檢查 thesis。',
          }
        : {
            verdict: 'wait_pullback',
            label: '先等拉回或補驗證',
            reason: '目前先回傳 bridge-aware snapshot，完整報告與更多證據正在背景更新。',
            trigger: chipSnapshot?.timingAssessment || '等待完整 deep-dive payload 刷新完成。',
            invalidation: '若新資料無法補強故事，應維持觀察。',
          },
    latestFacts: latestEvidence,
    latestEvidence,
    thesisSnapshot: {
      whyNow: latestEvidence[0]?.summary || '目前優先先回傳 bridge-aware snapshot，讓估值與證據同源。',
      story:
        sanitizeNarrativeText(storyRow?.summary ? String(storyRow.summary) : thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : '') ||
        '目前市場故事仍在補抓更完整證據。',
      validation: latestEvidence.length > 0 ? '已回補最新 bridge-aware 證據摘要，完整證據矩陣會背景更新。' : '目前可見證據仍不足。',
      valuation: bundle.priceTargetRationale || '估值橋接仍在整理中。',
      risk: bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.insufficientBridgeReason || '若客戶拉貨與產品 mix 無法落地，需回到觀察。',
    },
    freshSourceHighlights: lightSourceItems,
    appendix: {
      technicalSummary,
      sourceAppendix: lightSourceItems.length > 0 ? [{ label: '官方 / 財務 / 市場來源', items: lightSourceItems }] : [],
      evidenceMatrix: [],
      connectorStatus,
      coverageStatus: [
        {
          id: 'light_snapshot',
          label: 'Light snapshot',
          status: latestEvidence.length > 0 ? 'hit' : 'missing',
          summary:
            latestEvidence.length > 0
              ? 'Light snapshot 已先回傳 bridge-aware 證據摘要與外部來源註腳；完整來源覆蓋會由背景 deep-dive 補齊。'
              : 'Light snapshot 目前缺少完整來源覆蓋，等待背景 deep-dive 補齊。',
          sourceTypes: ['official', 'financial', 'system'],
        },
        {
          id: 'broker_reports',
          label: '外資 / 券商評等',
          status: 'missing',
          summary: 'Light snapshot 尚未載入完整外資/券商評等；可透過 broker-report-ingest 或 materials/broker-reports 匯入後作 consensus 佐證。',
          sourceTypes: ['broker_report', 'public_research'],
          failureReason: '外資 / 券商評等 direct-hit 待完整 deep-dive 或匯入資料補齊。',
          matched: false,
          written: false,
          cited: false,
        },
      ],
      emptyState: {
        technical: insight.chart.length > 0 ? null : insight.chartMissingReason || technicalSnapshot.missingReason || null,
        evidence: latestEvidence.length > 0 ? null : '完整證據矩陣正在背景更新中。',
        sources: '完整來源分組正在背景更新中。',
      },
    },
    investmentConclusion:
      `現在動作：${tradeDecision.action}。${tradeDecision.positionSize}；${tradeDecision.exitCondition}`,
    keyAssumptions: uniqueNarrativeLines(
      [
        bundle.baseCaseDetail?.marketSizingBridge,
        bundle.baseCaseDetail?.multipleBridge,
        bundle.scenarioCaseDetail?.marketSizingBridge,
      ],
      3,
    ),
    verificationSummary:
      latestEvidence.length > 0
        ? '目前已先用最新 bridge-aware 證據摘要補齊 Base / 情境推導，完整法說與來源矩陣會背景更新。'
        : '目前證據仍在補抓中。',
    valuationSummary: bundle.priceTargetRationale,
    storyNarrative:
      sanitizeNarrativeText(storyRow?.summary ? String(storyRow.summary) : thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : '') || null,
    articleSections: [],
    numberTrail: [],
    scenarioNarratives: bundle.scenarioBridges,
    marketHypothesis: uniqueNarrativeLines(
      [bundle.baseCaseDetail?.marketSizingBridge, bundle.scenarioCaseDetail?.marketSizingBridge],
      2,
    ),
    validationChecks: [
      {
        label: '目標價快照',
        status: bundle.targetSnapshot.bridgeCompleteness === 'complete' ? 'completed' : 'at_risk',
        summary:
          bundle.targetSnapshot.bridgeCompleteness === 'complete'
            ? '已先回傳 bridge-aware target snapshot，首頁與內頁應使用同一來源。'
            : '目前 bridge 尚未完整，暫不產出正式目標價。',
      },
      {
        label: '技術面與圖表',
        status: insight.chart.length > 0 ? 'completed' : 'pending',
        summary: insight.chart.length > 0 ? technicalSummary : insight.chartMissingReason || '技術資料仍在補抓中。',
      },
    ],
    entryExitPlan: {
      entry: tradeDecision.entryZone,
      addOn: tradeDecision.addCondition,
      stopLoss: tradeDecision.stopLoss,
      exit: tradeDecision.exitCondition || tradeDecision.takeProfit,
    },
    technicalSummary,
    technicalEntrySignal,
    sourceAppendix: [],
    technicalSnapshot,
    thesisState,
    verificationStatus,
    storyType: (storyRow?.story_type as StoryType | null | undefined) || null,
    thesisTitle:
      (storyRow?.title ? String(storyRow.title) : null) ||
      (thesisRow?.thesis_title ? String(thesisRow.thesis_title) : null) ||
      null,
    thesisSummary:
      (storyRow?.summary ? String(storyRow.summary) : null) ||
      (thesisRow?.thesis_summary ? String(thesisRow.thesis_summary) : null) ||
      null,
    catalystSummary: (thesisRow?.story_source_summary ? String(thesisRow.story_source_summary) : null) || null,
    expectedUpsidePct: bundle.targetSnapshot.cardPrimaryUpsidePct ?? null,
    evidenceScore: null,
    timingScore: chipSnapshot?.timingScore ?? null,
    evidenceItems: [],
    valuationCases,
    companyEvents: [],
    revenueSignal: revenueView,
    fundamentalSnapshot: fundamentalView,
    memo: null,
    agentStatus,
    communitySignals: [],
    verificationTimeline: verificationTimelineFromState(thesisState),
    conditionalRecommendationNote:
      bundle.targetSnapshot.verdict === 'formal'
        ? `目前估值與故事層仍偏正向；交易動作是「${tradeDecision.action}」，需同步遵守大盤 Gate 與停損。`
        : `目前先回傳 bridge-aware 快照；交易動作是「${tradeDecision.action}」，等待完整證據補齊後再決定是否升級。`,
    themeHypothesis: null,
    calculationTable: [],
    counterEvidence: [],
    brokerViews: [],
    sourceCoverage: [],
    missingCoverage: ['official', 'financial', 'public_research'],
    kolCoverage: [],
    podcastMentions: [],
    sourceDiscoveryStatus: {
      approvedCount: 0,
      pendingCount: 0,
      monitorOnlyCount: 0,
    },
    connectorStatus,
    timeframeCharts,
    sourceGroups: {
      investanchors: [],
      officialAndFinancial: [],
      brokerAndResearch: [],
      socialAndCommunity: [],
    },
    thesisModel: null,
    riskCounterpoints: [],
    evidenceMatrix: [],
    valuationCompleteness: {
      requiredCases: ['base', 'upside', 'invalidation'],
      availableCases: valuationCases.map((item) => item.caseType),
      isComplete: bundle.targetSnapshot.bridgeCompleteness === 'complete',
    },
    valuationBridge: bundle.valuationBridge,
    scenarioBridges: bundle.scenarioBridges,
    priceTargetRationale: bundle.priceTargetRationale,
    missingFields: unique([...(bundle.baseCaseDetail?.estimatedFields || []), ...(bundle.scenarioCaseDetail?.estimatedFields || [])]),
    financialProjectionMetrics: {
      baseRevenueAnnual: bundle.baseCaseDetail?.projectedRevenueAnnual ?? null,
      baseEps: bundle.baseCaseDetail?.projectedEps ?? null,
      basePe: bundle.baseCaseDetail?.targetPeRatio ?? null,
      upsideRevenueAnnual: bundle.scenarioCaseDetail?.projectedRevenueAnnual ?? null,
      upsideEps: bundle.scenarioCaseDetail?.projectedEps ?? null,
      upsidePe: bundle.scenarioCaseDetail?.targetPeRatio ?? null,
      bearRevenueAnnual: bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.projectedRevenueAnnual ?? null,
      bearEps: bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.projectedEps ?? null,
      bearPe: bundle.scenarioBridges.find((item) => item.key === 'invalidation')?.targetPeRatio ?? null,
    },
  };
}

function shouldAugmentWithLightSnapshot(payload: StockDeepDivePayload) {
  return (
    !payload.targetSnapshot?.bridgeCompleteness ||
    payload.chart.length === 0 ||
    !payload.technicalSnapshot ||
    (payload.technicalSnapshot.ma5 == null &&
      payload.technicalSnapshot.ma20 == null &&
      payload.technicalSnapshot.rsi == null &&
      payload.technicalSnapshot.macd == null)
  );
}

export function mergeDeepDiveWithLightSnapshot(
  fullPayload: StockDeepDivePayload,
  lightPayload: StockDeepDivePayload,
): StockDeepDivePayload {
  return mergeAuthoritativeDeepDiveLeaves(fullPayload, lightPayload);
}

type StockDeepDiveLookup =
  | { status: 'ready'; data: StockDeepDivePayload }
  | { status: 'pending'; data: StockDeepDivePendingPayload }
  | { status: 'not_found' };

export async function getStockTechnicalLookup(symbol: string): Promise<StockDeepDiveLookup> {
  const normalizedSymbol = symbol.toUpperCase();
  const stock = await getLatestStockRecord(normalizedSymbol);
  if (!stock) {
    if (/^\d{4}$/.test(normalizedSymbol)) {
      queueStockResearchRefresh(normalizedSymbol, 'technical_stock_profile_missing');
      return {
        status: 'pending',
        data: {
          status: 'pending',
          symbol: normalizedSymbol,
          reason: 'stock_profile_missing',
          triggeredJobs: ['stock-research-refresh'],
          retryAfterSec: 8,
          chipEntryAssessment: buildPendingChipEntryAssessment('stock_profile_missing'),
        },
      };
    }
    return { status: 'not_found' };
  }

  const lightSnapshot = await withFallbackTimeout(buildLightStockDeepDiveSnapshot(stock, normalizedSymbol), null, 2800);
  if (lightSnapshot) {
    return { status: 'ready', data: lightSnapshot };
  }

  queueStockResearchRefresh(normalizedSymbol, 'technical_light_snapshot_missing', true);
  return {
    status: 'pending',
    data: {
      status: 'pending',
      symbol: normalizedSymbol,
      reason: 'technical_light_snapshot_missing',
      triggeredJobs: ['stock-research-refresh'],
      retryAfterSec: 8,
      chipEntryAssessment: buildPendingChipEntryAssessment('technical_light_snapshot_missing'),
    },
  };
}

export async function getStockDeepDiveLookup(symbol: string): Promise<StockDeepDiveLookup> {
  const normalizedSymbol = symbol.toUpperCase();
  const stock = await getLatestStockRecord(normalizedSymbol);
  if (!stock) {
    if (/^\d{4}$/.test(normalizedSymbol)) {
      queueStockResearchRefresh(normalizedSymbol, 'missing_stock_profile');
      return {
        status: 'pending',
        data: {
          status: 'pending',
          symbol: normalizedSymbol,
          reason: 'stock_profile_missing',
          triggeredJobs: ['stock-research-refresh'],
          retryAfterSec: 12,
          chipEntryAssessment: buildPendingChipEntryAssessment('stock_profile_missing'),
        },
      };
    }
    return { status: 'not_found' };
  }

  const lightSnapshotPromise = buildLightStockDeepDiveSnapshot(stock, normalizedSymbol).catch((error) => {
    console.warn('[getStockDeepDiveLookup] light snapshot failed', {
      symbol: normalizedSymbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });
  const fullDeepDivePromise = getStockDeepDive(normalizedSymbol).catch((error) => {
    console.warn('[getStockDeepDiveLookup] full payload failed', {
      symbol: normalizedSymbol,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  });

  let deepDive = await withFallbackTimeout(fullDeepDivePromise, null, 4500);
  if (deepDive && shouldAugmentWithLightSnapshot(deepDive)) {
    const lightSnapshot = await withFallbackTimeout(lightSnapshotPromise, null, 1800);
    if (lightSnapshot) {
      deepDive = mergeDeepDiveWithLightSnapshot(deepDive, lightSnapshot);
    }
  }
  if (deepDive) {
    if (shouldBackgroundRefreshDeepDive(deepDive)) {
      queueStockResearchRefresh(normalizedSymbol, 'page_open_background_refresh');
      return {
        status: 'ready',
        data: {
          ...deepDive,
          autoRefreshTriggered: true,
        },
      };
    }
    return { status: 'ready', data: deepDive };
  }

  const lightSnapshot = await withFallbackTimeout(lightSnapshotPromise, null, 3200);
  if (lightSnapshot) {
    queueStockResearchRefresh(normalizedSymbol, 'light_snapshot_background_refresh');
    return {
      status: 'ready',
      data: {
        ...lightSnapshot,
        autoRefreshTriggered: true,
      },
    };
  }

  queueStockResearchRefresh(normalizedSymbol, 'deep_dive_missing', true);
  return {
    status: 'pending',
    data: {
      status: 'pending',
      symbol: normalizedSymbol,
      reason: 'deep_dive_data_missing_or_stale',
      triggeredJobs: ['stock-research-refresh'],
      retryAfterSec: 8,
      chipEntryAssessment: buildPendingChipEntryAssessment('deep_dive_data_missing_or_stale'),
    },
  };
}

async function getAgentStatusSummary(hours = 24): Promise<AgentStatusSummary> {
  if (shouldUseDemoFallback()) {
    return fallbackAgentStatusSummary();
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const [runsRes, tasksRes, profilesRes] = await Promise.all([
      supabaseServer.from('agent_runs').select('run_type,status,started_at,finished_at').gte('started_at', sinceIso).order('started_at', { ascending: false }).limit(100),
      supabaseServer.from('agent_tasks').select('agent_role,status,started_at').gte('started_at', sinceIso).order('started_at', { ascending: false }).limit(200),
      supabaseServer.from('agent_profiles').select('profile_key,status').eq('status', 'active').limit(100),
    ]);

    if (runsRes.error || tasksRes.error || profilesRes.error) {
      throw new Error(runsRes.error?.message || tasksRes.error?.message || profilesRes.error?.message || 'Failed to load agent status');
    }

    const runs = (runsRes.data as Row[]) || [];
    const tasks = (tasksRes.data as Row[]) || [];
    const profiles = (profilesRes.data as Row[]) || [];

    const activeRun = runs.find((row) => String(row.status || '') === 'running') || null;
    const successfulRuns = runs.filter((row) => String(row.status || '') === 'success');
    const startedRoles = Array.from(new Set(tasks.filter((row) => String(row.status || '') !== 'failed').map((row) => String(row.agent_role || ''))));

    return {
      activeRunType: activeRun ? String(activeRun.run_type || '') : null,
      runCount24h: runs.length,
      lastSuccessfulRunAt: successfulRuns[0]?.finished_at ? String(successfulRuns[0].finished_at) : null,
      startedRoles,
      allowlistedProfiles: profiles.map((row) => String(row.profile_key || '')),
    };
  } catch {
    return shouldUseDemoFallback()
      ? fallbackAgentStatusSummary()
      : {
          activeRunType: 'unavailable',
          runCount24h: 0,
          lastSuccessfulRunAt: null,
          startedRoles: [],
          allowlistedProfiles: [],
        };
  }
}

function findStoryForRecommendation(storiesByKey: Map<string, Row>, fallbackStoriesByStock: Map<string, Row>, recommendation: Row) {
  const stockId = String(recommendation.stock_id || '');
  const storyType = String(recommendation.story_type || '');
  const asOfDate = String(recommendation.as_of || '').slice(0, 10);
  const exactKey = `${stockId}|${storyType}|${asOfDate}`;
  return storiesByKey.get(exactKey) || fallbackStoriesByStock.get(stockId) || null;
}

function memoTraceabilityState(memo: Row) {
  const entryExitRules = (memo.entry_exit_rules as Row | undefined) || {};
  const traceability = (entryExitRules.traceability as Row | undefined) || {};
  const storyCandidateIds = Array.isArray(traceability.storyCandidateIds) ? traceability.storyCandidateIds.map(String).filter(Boolean) : [];
  const recommendationIds = Array.isArray(traceability.recommendationIds) ? traceability.recommendationIds.map(String).filter(Boolean) : [];
  return {
    traceability,
    storyCandidateIds,
    recommendationIds,
    hasStoryLink: Boolean(memo.story_candidate_id) || storyCandidateIds.length > 0,
    hasRecommendationLink: recommendationIds.length > 0,
  };
}

export async function getGovernanceContractSummary() {
  const supabaseServer = getSupabaseServerClient();
  const [recsRes, storiesRes, evidenceRes, valuationRes, memosRes, agentReviewsRes, sourceReviewsRes] = await Promise.all([
    supabaseServer.from('recommendations').select('id,stock_id,as_of,story_type,recommendation_state,published_at').not('published_at', 'is', null).order('published_at', { ascending: false }).limit(200),
    supabaseServer.from('story_candidates').select('id,stock_id,story_type,as_of_date,thesis_state').order('updated_at', { ascending: false }).limit(400),
    supabaseServer.from('story_evidence_items').select('story_candidate_id').order('created_at', { ascending: false }).limit(4000),
    supabaseServer.from('valuation_cases').select('story_candidate_id').order('updated_at', { ascending: false }).limit(4000),
    supabaseServer.from('research_memos').select('id,slug,report_kind,story_candidate_id,entry_exit_rules').order('updated_at', { ascending: false }).limit(200),
    supabaseServer.from('agent_review_queue').select('id', { count: 'exact', head: true }).eq('state', 'pending'),
    supabaseServer.from('source_review_queue').select('id', { count: 'exact', head: true }).eq('state', 'pending'),
  ]);

  if (recsRes.error || storiesRes.error || evidenceRes.error || valuationRes.error || memosRes.error || agentReviewsRes.error || sourceReviewsRes.error) {
    throw new Error(
      recsRes.error?.message ||
        storiesRes.error?.message ||
        evidenceRes.error?.message ||
        valuationRes.error?.message ||
        memosRes.error?.message ||
        agentReviewsRes.error?.message ||
        sourceReviewsRes.error?.message ||
        'Failed to load governance contract summary',
    );
  }

  const storyRows = (storiesRes.data as Row[]) || [];
  const storiesByKey = new Map<string, Row>();
  const fallbackStoriesByStock = new Map<string, Row>();
  for (const story of storyRows) {
    const stockId = String(story.stock_id || '');
    const storyType = String(story.story_type || '');
    const asOfDate = String(story.as_of_date || '').slice(0, 10);
    if (stockId && storyType && asOfDate) storiesByKey.set(`${stockId}|${storyType}|${asOfDate}`, story);
    if (stockId && !fallbackStoriesByStock.has(stockId)) fallbackStoriesByStock.set(stockId, story);
  }

  const evidenceCountByStoryId = new Map<string, number>();
  for (const row of (evidenceRes.data as Row[]) || []) {
    const storyId = String(row.story_candidate_id || '');
    if (!storyId) continue;
    evidenceCountByStoryId.set(storyId, (evidenceCountByStoryId.get(storyId) || 0) + 1);
  }

  const valuationCountByStoryId = new Map<string, number>();
  for (const row of (valuationRes.data as Row[]) || []) {
    const storyId = String(row.story_candidate_id || '');
    if (!storyId) continue;
    valuationCountByStoryId.set(storyId, (valuationCountByStoryId.get(storyId) || 0) + 1);
  }

  const publishedRecommendations = ((recsRes.data as Row[]) || []).map((recommendation) => {
    const matchedStory = findStoryForRecommendation(storiesByKey, fallbackStoriesByStock, recommendation);
    const storyId = matchedStory ? String(matchedStory.id || '') : '';
    const evidenceCount = storyId ? (evidenceCountByStoryId.get(storyId) || 0) : 0;
    const valuationCount = storyId ? (valuationCountByStoryId.get(storyId) || 0) : 0;
    return {
      recommendationId: String(recommendation.id || ''),
      stockId: String(recommendation.stock_id || ''),
      storyId: storyId || null,
      passed: Boolean(storyId) && evidenceCount > 0 && valuationCount > 0,
      evidenceCount,
      valuationCount,
    };
  });

  const memoRows = (memosRes.data as Row[]) || [];
  const researchMemos = memoRows.map((memo) => {
    const traceability = memoTraceabilityState(memo);
    const reportKind = String(memo.report_kind || '');
    const passed =
      reportKind === 'deep_dive'
        ? traceability.hasStoryLink
        : traceability.hasStoryLink || traceability.hasRecommendationLink;
    const hotWindowValid = reportKind !== 'hot_theme' || String(traceability.traceability.windowType || '') === 'three_day';
    return {
      memoId: String(memo.id || ''),
      slug: String(memo.slug || ''),
      reportKind,
      passed: passed && hotWindowValid,
      hotWindowValid,
      traceability,
    };
  });

  return {
    canonicalStates: [...CANONICAL_RECOMMENDATION_STATES],
    allowlist: {
      source: AGENCY_AGENT_CONFIG.source,
      mode: AGENCY_AGENT_POLICY.mode,
      publishRecommendationsDirectly: AGENCY_AGENT_POLICY.publishRecommendationsDirectly,
      profiles: AGENCY_AGENT_ALLOWLIST.map((profile) => ({
        profileKey: profile.profileKey,
        mappedRole: profile.mappedRole,
      })),
    },
    routeMappings: {
      hotRadarCanonicalWindow: 'three_day',
      hotRadarRoute: '/api/radar/hot',
    },
    publishedRecommendations: {
      checked: publishedRecommendations.length,
      passed: publishedRecommendations.filter((item) => item.passed).length,
      failed: publishedRecommendations.filter((item) => !item.passed).slice(0, 20),
    },
    researchMemos: {
      checked: researchMemos.length,
      passed: researchMemos.filter((item) => item.passed).length,
      failed: researchMemos.filter((item) => !item.passed).slice(0, 20),
    },
    reviewQueues: {
      pendingAgentReviews: agentReviewsRes.count || 0,
      pendingSourceReviews: sourceReviewsRes.count || 0,
    },
    checkedAt: nowIso(),
  };
}

async function getConnectorStatusSummary(): Promise<ConnectorStatusView[]> {
  if (shouldUseDemoFallback()) {
    return [];
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const [credsRes, runsRes, workerStatesRes] = await Promise.all([
      supabaseServer
        .from('source_credentials_registry')
        .select('platform,status,updated_at')
        .in('platform', [...CONNECTOR_KEYS])
        .order('updated_at', { ascending: false }),
      supabaseServer
        .from('connector_runs')
        .select('connector_name,platform,status,records_written,error_summary,started_at,finished_at,metadata')
        .in('platform', [...CONNECTOR_KEYS])
        .order('started_at', { ascending: false })
        .limit(160),
      Promise.resolve(
        supabaseServer
          .from('worker_job_states')
          .select('job_id,status,last_run_at,last_scheduled_at,last_schedule_slot,last_summary,last_error,metadata,updated_at')
          .in('job_id', [
            'hourly-social-source-refresh',
            'daily-kol-source-refresh',
            'social-source-refresh-6h',
            'threads-session-health',
            'threads-stock-refresh',
            'investanchors-stock-refresh',
            'kol-content-refresh',
          ]),
      ).catch((error) => ({ data: [], error })),
    ]);

    if (credsRes.error || runsRes.error) {
      throw new Error(credsRes.error?.message || runsRes.error?.message || 'Failed to load connector status');
    }

    const latestCreds = new Map<string, { status: string; updatedAt: string | null }>();
    for (const row of (credsRes.data as Row[]) || []) {
      const platform = String(row.platform || '');
      if (!platform || latestCreds.has(platform)) continue;
      latestCreds.set(platform, {
        status: String(row.status || 'unknown'),
        updatedAt: row.updated_at ? String(row.updated_at) : null,
      });
    }

    const latestRuns = new Map<string, { status: string; finishedAt: string | null; startedAt: string | null }>();
    const latestTerminalRuns = new Map<
      string,
      { status: string; finishedAt: string | null; startedAt: string | null; recordsWritten: number; errorSummary: string | null }
    >();
    const latestRunMeta = new Map<string, { recordsWritten: number; errorSummary: string | null }>();
    const latestSuccess = new Map<string, string | null>();
    const latestSuccessfulWrite = new Map<string, { recordsWritten: number; at: string | null }>();
    const latestApiAttempt = new Map<string, { status: string; startedAt: string | null; errorSummary: string | null }>();
    const latestChannelBreakdown = new Map<string, NonNullable<ConnectorStatusView['channelBreakdown']>>();
    const latestKolBreakdown = new Map<string, NonNullable<ConnectorStatusView['kolBreakdown']>>();
    const latestPodcastStats = new Map<
      string,
      { episodesFound: number; transcriptsReady: number; weakSignalsWritten: number; failureReasonByKol: Record<string, string> }
    >();
    const latestWorkerScriptVersion = new Map<string, string>();
    const latestCookieDiagnostics = new Map<string, Row>();
    const latestSearchedTargets = new Map<string, string[]>();
    const latestMatchedSymbols = new Map<string, string[]>();
    const latestConnectorMetadata = new Map<string, Row>();
    const recordsWritten24h = new Map<string, number>();
    const isAmbiguousSocialToken = (symbol: string) =>
      /^(19|20)\d{2}$/.test(symbol) || /^(0800|1000|1200|1300|1400|1500|1600|1700|1800|2000|3000|5000)$/.test(symbol);
    const workerStateByJob = new Map<string, Row>();
    for (const row of ((workerStatesRes as { data?: Row[]; error?: unknown }).data || [])) {
      const jobId = String(row.job_id || '');
      if (jobId) workerStateByJob.set(jobId, row);
    }
    const hourlySocialWorkerState = workerStateByJob.get('hourly-social-source-refresh') || null;
    const dailyKolWorkerState = workerStateByJob.get('daily-kol-source-refresh') || null;
    const socialWorkerState = workerStateByJob.get('social-source-refresh-6h') || null;
    const dayAgoMs = Date.now() - 24 * 60 * 60 * 1000;
    for (const row of (runsRes.data as Row[]) || []) {
      const connector = String(row.platform || row.connector_name || '');
      if (!connector) continue;
      const startedAt = row.started_at ? String(row.started_at) : null;
      const recordsWritten = Number(row.records_written || 0);
      const metadata = ((row.metadata as Row | null) || {}) as Row;
      const status = String(row.status || '');
      const workerScriptVersion = metadata.worker_script_version
        ? String(metadata.worker_script_version)
        : metadata.workerScriptVersion
          ? String(metadata.workerScriptVersion)
          : null;
      if (workerScriptVersion && !latestWorkerScriptVersion.has(connector)) {
        latestWorkerScriptVersion.set(connector, workerScriptVersion);
      }
      if (metadata.cookie_diagnostics && typeof metadata.cookie_diagnostics === 'object' && !latestCookieDiagnostics.has(connector)) {
        latestCookieDiagnostics.set(connector, metadata.cookie_diagnostics as Row);
      }
      const statusOnly = metadata.mode === 'vercel_status_only' || row.error_summary === 'playwright_runtime_unavailable';
      const startedMs = startedAt ? new Date(startedAt).getTime() : Number.NaN;
      if (Number.isFinite(startedMs) && startedMs >= dayAgoMs) {
        recordsWritten24h.set(connector, (recordsWritten24h.get(connector) || 0) + recordsWritten);
      }
      if (statusOnly && !latestApiAttempt.has(connector)) {
        latestApiAttempt.set(connector, {
          status: status || 'skipped',
          startedAt,
          errorSummary: row.error_summary ? String(row.error_summary) : null,
        });
      }
      const existingConnectorMetadata = latestConnectorMetadata.get(connector);
      const metadataHasPttFullTextStats =
        connector === 'ptt' &&
        (Number(metadata.articles_fetched ?? metadata.articlesFetched ?? 0) > 0 ||
          Number(metadata.push_comments_parsed ?? metadata.pushCommentsParsed ?? 0) > 0);
      const existingHasPttFullTextStats =
        connector === 'ptt' &&
        existingConnectorMetadata != null &&
        (Number(existingConnectorMetadata.articles_fetched ?? existingConnectorMetadata.articlesFetched ?? 0) > 0 ||
          Number(existingConnectorMetadata.push_comments_parsed ?? existingConnectorMetadata.pushCommentsParsed ?? 0) > 0);
      if (!statusOnly && (!existingConnectorMetadata || (metadataHasPttFullTextStats && !existingHasPttFullTextStats))) {
        latestConnectorMetadata.set(connector, metadata);
      }
      if (Array.isArray(metadata.channel_breakdown) && !latestChannelBreakdown.has(connector)) {
        const aggregated = new Map<string, NonNullable<ConnectorStatusView['channelBreakdown']>[number]>();
        for (const rawItem of metadata.channel_breakdown as Row[]) {
          const channel = String(rawItem.channel || '').replace(/^@/, '');
          if (!channel) continue;
          const key = channel.toLowerCase();
          const existing = aggregated.get(key);
          const matchedSymbols = Array.isArray(rawItem.matched_symbols)
            ? rawItem.matched_symbols
                .map((symbol: unknown) => String(symbol))
                .filter((symbol) => /^\d{4}$/.test(symbol) && !isAmbiguousSocialToken(symbol))
            : [];
          const rawMatchedSymbols = Array.isArray(rawItem.matched_symbols)
            ? rawItem.matched_symbols.map((symbol: unknown) => String(symbol)).filter((symbol) => /^\d{4}$/.test(symbol))
            : [];
          const sanitizedFalsePositives = rawMatchedSymbols.filter((symbol) => isAmbiguousSocialToken(symbol));
          const next = {
            channel,
            searched: Boolean(rawItem.searched),
            fetchedPosts: Number(rawItem.fetched_posts ?? rawItem.fetchedPosts ?? 0),
            matchedSymbols,
            recordsWritten: Number(rawItem.records_written ?? rawItem.recordsWritten ?? 0),
            lastSuccessAt: rawItem.last_success_at ? String(rawItem.last_success_at) : rawItem.lastSuccessAt ? String(rawItem.lastSuccessAt) : null,
            failureReason: rawItem.failure_reason ? String(rawItem.failure_reason) : rawItem.failureReason ? String(rawItem.failureReason) : null,
            excludedFalsePositives:
              Number(rawItem.excluded_false_positives ?? rawItem.excludedFalsePositives ?? 0) + sanitizedFalsePositives.length,
            excludedExamples: Array.isArray(rawItem.excluded_examples)
              ? Array.from(
                  new Set([
                    ...rawItem.excluded_examples.map((item: unknown) => String(item)).filter(Boolean),
                    ...sanitizedFalsePositives.map((symbol) => `${symbol}:ambiguous_year_or_price_summary_filter`),
                  ]),
                ).slice(0, 8)
              : Array.isArray(rawItem.excludedExamples)
                ? Array.from(
                    new Set([
                      ...rawItem.excludedExamples.map((item: unknown) => String(item)).filter(Boolean),
                      ...sanitizedFalsePositives.map((symbol) => `${symbol}:ambiguous_year_or_price_summary_filter`),
                    ]),
                  ).slice(0, 8)
                : sanitizedFalsePositives.map((symbol) => `${symbol}:ambiguous_year_or_price_summary_filter`).slice(0, 8),
          };
          if (!existing) {
            aggregated.set(key, next);
          } else {
            aggregated.set(key, {
              ...existing,
              searched: existing.searched || next.searched,
              fetchedPosts: existing.fetchedPosts + next.fetchedPosts,
              matchedSymbols: Array.from(new Set([...existing.matchedSymbols, ...next.matchedSymbols])),
              recordsWritten: existing.recordsWritten + next.recordsWritten,
              lastSuccessAt: next.lastSuccessAt || existing.lastSuccessAt,
              failureReason: existing.failureReason && next.failureReason ? `${existing.failureReason}; ${next.failureReason}` : existing.failureReason || next.failureReason,
              excludedFalsePositives: (existing.excludedFalsePositives || 0) + (next.excludedFalsePositives || 0),
              excludedExamples: Array.from(new Set([...(existing.excludedExamples || []), ...(next.excludedExamples || [])])).slice(0, 8),
            });
          }
        }
        latestChannelBreakdown.set(connector, Array.from(aggregated.values()));
      }
      if (Array.isArray(metadata.kol_breakdown) && !latestKolBreakdown.has(connector)) {
        latestKolBreakdown.set(
          connector,
          metadata.kol_breakdown.map((item: Row) => ({
            kol: String(item.kol || ''),
            searchedUrls: Array.isArray(item.searchedUrls)
              ? item.searchedUrls.map((url: unknown) => String(url)).filter(Boolean)
              : Array.isArray(item.searched_urls)
                ? item.searched_urls.map((url: unknown) => String(url)).filter(Boolean)
                : [],
            episodesFound: Number(item.episodesFound ?? item.episodes_found ?? 0),
            youtubeEpisodes: Number(item.youtubeEpisodes ?? item.youtube_episodes ?? 0),
            weakSignalsWritten: Number(item.weakSignalsWritten ?? item.weak_signals_written ?? 0),
            transcriptsReady: Number(item.transcriptsReady ?? item.transcripts_ready ?? 0),
            failureReason: item.failureReason ? String(item.failureReason) : item.failure_reason ? String(item.failure_reason) : null,
          })),
        );
      }
      if ((connector === 'podcast' || connector === 'youtube') && !latestPodcastStats.has(connector)) {
        latestPodcastStats.set(connector, {
          episodesFound: Number(metadata.episodes_found ?? metadata.episodesFound ?? 0),
          transcriptsReady: Number(metadata.transcripts_ready ?? metadata.transcriptsReady ?? 0),
          weakSignalsWritten: Number(metadata.weak_signals_written ?? metadata.weakSignalsWritten ?? 0),
          failureReasonByKol:
            metadata.failure_reason_by_kol && typeof metadata.failure_reason_by_kol === 'object'
              ? (metadata.failure_reason_by_kol as Record<string, string>)
              : {},
        });
      }
      const searchedTargets = Array.isArray(metadata.searched_targets)
        ? metadata.searched_targets
        : Array.isArray(metadata.searchedTargets)
          ? metadata.searchedTargets
          : Array.isArray(metadata.source_surfaces)
            ? metadata.source_surfaces
            : Array.isArray(metadata.sourceSurfaces)
              ? metadata.sourceSurfaces
          : Array.isArray(metadata.searched_keywords)
            ? metadata.searched_keywords
            : Array.isArray(metadata.searchedKeywords)
              ? metadata.searchedKeywords
              : null;
      const normalizedSearchedTargets = [
        ...(searchedTargets ? searchedTargets.map((item: unknown) => String(item)).filter(Boolean) : []),
        ...(metadata.account_feed_attempted && (connector === 'threads' || connector === 'instagram') ? [`${connector}_account_feed`] : []),
      ];
      if (normalizedSearchedTargets.length > 0 && !latestSearchedTargets.has(connector)) {
        latestSearchedTargets.set(connector, Array.from(new Set(normalizedSearchedTargets)));
      } else if (normalizedSearchedTargets.length > 0) {
        latestSearchedTargets.set(
          connector,
          Array.from(
            new Set([
              ...(latestSearchedTargets.get(connector) || []),
              ...normalizedSearchedTargets,
            ]),
          ),
        );
      }
      const matchedSymbols = Array.isArray(metadata.matched_symbols)
        ? metadata.matched_symbols
        : Array.isArray(metadata.matchedSymbols)
          ? metadata.matchedSymbols
          : null;
      if (matchedSymbols && !latestMatchedSymbols.has(connector)) {
        latestMatchedSymbols.set(
          connector,
          matchedSymbols.map((item: unknown) => String(item)).filter((item) => /^\d{4}$/.test(item) && !isAmbiguousSocialToken(item)),
        );
      } else if (matchedSymbols) {
        latestMatchedSymbols.set(
          connector,
          Array.from(
            new Set([
              ...(latestMatchedSymbols.get(connector) || []),
              ...matchedSymbols.map((item: unknown) => String(item)).filter((item) => /^\d{4}$/.test(item) && !isAmbiguousSocialToken(item)),
            ]),
          ),
        );
      }
      if (statusOnly) continue;
      if (!latestRuns.has(connector)) {
        latestRuns.set(connector, {
          status: status || 'unknown',
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          startedAt,
        });
        latestRunMeta.set(connector, {
          recordsWritten,
          errorSummary: row.error_summary ? String(row.error_summary) : null,
        });
      }
      if (status !== 'running' && !latestTerminalRuns.has(connector)) {
        latestTerminalRuns.set(connector, {
          status: status || 'unknown',
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          startedAt,
          recordsWritten,
          errorSummary: row.error_summary ? String(row.error_summary) : null,
        });
      }
      if (status === 'success' && !latestSuccess.has(connector)) {
        latestSuccess.set(connector, row.finished_at ? String(row.finished_at) : null);
      }
      if (recordsWritten > 0 && !latestSuccessfulWrite.has(connector)) {
        latestSuccessfulWrite.set(connector, {
          recordsWritten,
          at: row.finished_at ? String(row.finished_at) : startedAt,
        });
      }
    }

    const nowMs = Date.now();
    const staleRunningThresholdMs = 25 * 60 * 1000;

    return [...CONNECTOR_KEYS].map((connector) => {
      const latest = latestRuns.get(connector);
      const terminal = latestTerminalRuns.get(connector);
      const latestStatus = (() => {
        if (!latest) return 'idle';
        if (latest.status !== 'running') return latest.status;
        const startedMs = latest.startedAt ? new Date(latest.startedAt).getTime() : 0;
        return startedMs > 0 && nowMs - startedMs > staleRunningThresholdMs ? 'timed_out' : 'running';
      })();
      const latestError = latestRunMeta.get(connector)?.errorSummary || null;
      const terminalError = terminal?.errorSummary || null;
      const terminalRecords = terminal?.recordsWritten || 0;
      const written24h = recordsWritten24h.get(connector) || 0;
      const successfulWrite = latestSuccessfulWrite.get(connector) || null;
      const apiAttempt = latestApiAttempt.get(connector) || null;
      const connectorWorkerState =
        connector === 'threads'
          ? (hourlySocialWorkerState || workerStateByJob.get('threads-stock-refresh') || workerStateByJob.get('threads-session-health') || socialWorkerState)
          : connector === 'investanchors'
            ? (dailyKolWorkerState || workerStateByJob.get('investanchors-stock-refresh') || socialWorkerState)
            : ['instagram', 'telegram'].includes(connector)
              ? (hourlySocialWorkerState || workerStateByJob.get('kol-content-refresh') || socialWorkerState)
              : ['podcast', 'youtube'].includes(connector)
                ? (dailyKolWorkerState || workerStateByJob.get('kol-content-refresh') || socialWorkerState)
              : null;
      const workerMetadata = ((connectorWorkerState?.metadata as Row | null) || {}) as Row;
      const workerScriptVersion =
        (workerMetadata.worker_script_version ? String(workerMetadata.worker_script_version) : null) ||
        latestWorkerScriptVersion.get(connector) ||
        null;
      const cookieDiagnostics = latestCookieDiagnostics.get(connector) || {};
      const canonicalWorkerStatus = latestStatus === 'idle' ? (terminal?.status || null) : latestStatus;
      const statusOwner = apiAttempt && !latest ? 'serverless_status' : 'local_worker';
      const sourceSurfaces24h =
        latestSearchedTargets.get(connector) ||
        (Array.isArray(workerMetadata.source_surfaces) ? workerMetadata.source_surfaces.map((item: unknown) => String(item)).filter(Boolean) : []);
      const falsePositiveExcluded24h = (latestChannelBreakdown.get(connector) || []).reduce(
        (sum, item) => sum + Number(item.excludedFalsePositives || 0),
        0,
      );
      const authLikeReason = [latestError, terminalError, workerMetadata.failure_reason, workerMetadata.auth_failure_reason]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const accountFeedStatus: ConnectorStatusView['accountFeedStatus'] =
        connector === 'threads' || connector === 'instagram'
          ? sourceSurfaces24h.some((item) => /account_feed|登入首頁|following|recommended|explore/i.test(item))
            ? 'attempted'
            : /cookie|session|auth|credential|missing_credentials|login/.test(authLikeReason)
              ? 'auth_degraded'
              : 'not_attempted'
          : 'not_applicable';
      return {
        connector,
        credentialStatus: latestCreds.get(connector)?.status || 'unknown',
        lastCheckedAt: latestCreds.get(connector)?.updatedAt || null,
        lastRunStatus: latestStatus as ConnectorStatusView['lastRunStatus'],
        lastRunAt: latest?.startedAt || null,
        lastAttemptAt: latest?.startedAt || null,
        lastSuccessAt: latestSuccess.get(connector) || null,
        lastRecordsWritten: written24h > 0 ? written24h : terminalRecords || latestRunMeta.get(connector)?.recordsWritten || 0,
        lastErrorSummary: latestError || terminalError,
        lastScheduledAt: connectorWorkerState?.last_scheduled_at
            ? String(connectorWorkerState.last_scheduled_at)
            : SOCIAL_REFRESH_CONNECTORS.has(connector) && socialWorkerState?.last_scheduled_at
              ? String(socialWorkerState.last_scheduled_at)
              : null,
        lastTerminalStatus: terminal?.status || null,
        lastTerminalAt: terminal?.finishedAt || terminal?.startedAt || null,
        lastTerminalRunAt: terminal?.finishedAt || terminal?.startedAt || null,
        lastTerminalRecordsWritten: terminalRecords,
        recordsWrittenThisRun: terminalRecords,
        lastSuccessfulRecordsWritten: successfulWrite?.recordsWritten || 0,
        lastSuccessfulRecordsAt: successfulWrite?.at || null,
        metadata: latestConnectorMetadata.get(connector) || null,
        lastRunMetadata: latestConnectorMetadata.get(connector) || null,
        recordsWritten24h: written24h,
        failureReason: latestError || terminalError,
        canonicalWorkerStatus: canonicalWorkerStatus || (connectorWorkerState?.status ? String(connectorWorkerState.status) : null),
        latestApiAttemptStatus: apiAttempt?.status || null,
        latestApiAttemptAt: apiAttempt?.startedAt || null,
        statusOwner,
        ignoredServerlessSkip: Boolean(apiAttempt),
        refreshTier: refreshTierForConnector(connector),
        refreshCadenceHours: SOCIAL_REFRESH_CONNECTORS.has(connector) ? refreshCadenceHoursForConnector(connector) : null,
        workerFreshnessStatus: null,
        workerScriptVersion,
        fallbackCookieSource: cookieDiagnostics.fallback_cookie_source ? String(cookieDiagnostics.fallback_cookie_source) : null,
        fallbackCookieNames: Array.isArray(cookieDiagnostics.fallback_cookie_names)
          ? cookieDiagnostics.fallback_cookie_names.map((item: unknown) => String(item)).filter(Boolean)
          : [],
        missingRecommendedCookieNames: Array.isArray(cookieDiagnostics.missing_recommended_cookie_names)
          ? cookieDiagnostics.missing_recommended_cookie_names.map((item: unknown) => String(item)).filter(Boolean)
          : [],
        envLastModifiedAt: cookieDiagnostics.env_last_modified_at ? String(cookieDiagnostics.env_last_modified_at) : null,
        sourceSurfaces24h,
        falsePositiveExcluded24h,
        accountFeedStatus,
        channelBreakdown: latestChannelBreakdown.get(connector) || [],
        kolBreakdown: latestKolBreakdown.get(connector) || [],
        episodesFound: latestPodcastStats.get(connector)?.episodesFound || 0,
        transcriptsReady: latestPodcastStats.get(connector)?.transcriptsReady || 0,
        weakSignalsWritten: latestPodcastStats.get(connector)?.weakSignalsWritten || 0,
        failureReasonByKol: latestPodcastStats.get(connector)?.failureReasonByKol || {},
        searchedTargets:
          connector === 'telegram'
            ? ['investanchors', 'twstockanalysis', 'Gooaye', 'johnstock888', 'eaglewealth', 'a178178', 'musclestock']
            : latestSearchedTargets.get(connector) || (latest ? ['visible_symbols', 'theme_keywords'] : []),
        matchedSymbols: latestMatchedSymbols.get(connector) || ((written24h > 0 || terminalRecords > 0) ? ['records_written'] : []),
      };
    });
  } catch {
    return [];
  }
}

function verificationStatusFromConfidence(confidence: number | null): VerificationStatus {
  if (confidence == null) return '未證實';
  if (confidence >= 0.65) return '已證實';
  if (confidence >= 0.35) return '部分證實';
  return '未證實';
}

function parseDateBoundary(input: string | null, endOfDay = false) {
  if (!input) return null;
  const normalized = input.trim();
  if (!normalized) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    return `${normalized}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}+08:00`;
  }
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function truncateSourceSearchText(input: unknown, max = 160) {
  const text = compactText(input);
  if (!text) return null;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function compactSourceSearchConnectorStatus(row: ConnectorStatusView) {
  return {
    connector: row.connector,
    credentialStatus: row.credentialStatus,
    lastCheckedAt: row.lastCheckedAt,
    lastRunStatus: row.lastRunStatus,
    lastRunAt: row.lastRunAt,
    lastSuccessAt: row.lastSuccessAt,
    lastRecordsWritten: row.lastRecordsWritten,
    lastErrorSummary: truncateSourceSearchText(row.lastErrorSummary, 120),
    recordsWritten24h: row.recordsWritten24h || 0,
    failureReason: truncateSourceSearchText(row.failureReason || row.lastErrorSummary, 120),
    refreshTier: row.refreshTier || null,
    workerFreshnessStatus: row.workerFreshnessStatus || null,
    accountFeedStatus: row.accountFeedStatus || null,
    searchedTargets: Array.isArray(row.searchedTargets) ? row.searchedTargets.slice(0, 4) : [],
    matchedSymbols: Array.isArray(row.matchedSymbols) ? row.matchedSymbols.slice(0, 6) : [],
  };
}

export async function searchSourceDocuments(params?: {
  q?: string | null;
  symbol?: string | null;
  platform?: string | null;
  verificationStatus?: VerificationStatus | null;
  themeKey?: string | null;
  runId?: string | null;
  evidenceLevel?: '傳言層' | '佐證層' | '估值層' | null;
  from?: string | null;
  to?: string | null;
  includeContentSearch?: boolean;
  page?: number;
  pageSize?: number;
}): Promise<SourceSearchPayload> {
  const page = Math.max(1, Number(params?.page || 1));
  const pageSize = Math.min(100, Math.max(10, Number(params?.pageSize || 25)));
  const q = compactText(params?.q || '') || null;
  const symbol = compactText(params?.symbol || '').toUpperCase() || null;
  const platform = compactText(params?.platform || '') || null;
  const verificationStatus = (params?.verificationStatus as VerificationStatus | undefined) || null;
  const themeKey = compactText(params?.themeKey || '') || null;
  const runId = compactText(params?.runId || '') || null;
  const evidenceLevel = (params?.evidenceLevel as '傳言層' | '佐證層' | '估值層' | undefined) || null;
  const includeContentSearch = Boolean(params?.includeContentSearch);
  const from = params?.from ? String(params.from) : null;
  const to = params?.to ? String(params.to) : null;
  const defaultRecentFromIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const fromIso = parseDateBoundary(from, false) || defaultRecentFromIso;
  const toIso = parseDateBoundary(to, true);

  const supabase = getSupabaseServerClient();
  const themeRes = themeKey
    ? await supabase
        .from('theme_heat')
        .select('related_symbols')
        .eq('theme_key', themeKey)
        .order('as_of_date', { ascending: false })
        .limit(1)
    : { data: [] as unknown[], error: null };
  if (themeRes.error) throw new Error(themeRes.error.message);
  const themeSymbols = (((themeRes.data as Row[])?.[0]?.related_symbols as unknown[]) || [])
    .map(String)
    .filter((value) => /^[A-Z0-9.-]{1,20}$/u.test(value));
  const evidenceVerificationStatus: VerificationStatus | null = evidenceLevel === '估值層'
    ? '已證實'
    : evidenceLevel === '佐證層'
      ? '部分證實'
      : evidenceLevel === '傳言層'
        ? '未證實'
        : null;
  const effectiveVerificationStatus = verificationStatus || evidenceVerificationStatus;

  let query = supabase
    .from('source_raw_documents')
    .select('id,platform,title,summary,document_url,published_at,collected_at,symbols,confidence,source_entity_id,metadata,source_entities(display_name,entity_type)', { count: 'estimated' })
    .order('collected_at', { ascending: false });

  if (platform && platform !== 'all') {
    query = query.eq('platform', platform);
  }
  if (fromIso) {
    query = query.gte('collected_at', fromIso);
  }
  if (toIso) {
    query = query.lte('collected_at', toIso);
  }
  if (q) {
    const escaped = q.replace(/,/g, ' ').replace(/\./g, ' ').trim();
    const fields = includeContentSearch
      ? `title.ilike.%${escaped}%,summary.ilike.%${escaped}%,content_text.ilike.%${escaped}%`
      : `title.ilike.%${escaped}%,summary.ilike.%${escaped}%`;
    query = query.or(fields);
  }
  if (symbol) query = query.contains('symbols', [symbol]);
  if (effectiveVerificationStatus === '已證實') query = query.gte('confidence', 0.65);
  if (effectiveVerificationStatus === '部分證實') query = query.gte('confidence', 0.35).lt('confidence', 0.65);
  if (effectiveVerificationStatus === '未證實') query = query.or('confidence.is.null,confidence.lt.0.35');
  if (themeSymbols.length > 0) {
    query = query.or(themeSymbols.map((item) => `symbols.cs.${JSON.stringify([item])}`).join(','));
  }

  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;
  const needsClientSideFiltering = Boolean(runId);
  const fetchStart = needsClientSideFiltering ? 0 : start;
  const fetchEnd = needsClientSideFiltering ? Math.max(9_999, end) : end;
  let auditsQuery = supabase
    .from('source_audits')
    .select('id,connector_run_id,platform,target_url,status,notes,created_at,snapshot_path,screenshot_path')
    .order('created_at', { ascending: false });
  auditsQuery = runId ? auditsQuery.eq('connector_run_id', runId).limit(500) : auditsQuery.limit(20);
  const [docsRes, runsRes, auditsRes, coverageRes, sourceRunLedger] = await Promise.all([
    query.range(fetchStart, fetchEnd),
    supabase
      .from('connector_runs')
      .select('id,connector_name,platform,status,records_written,error_summary,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(20),
    auditsQuery,
    supabase.rpc('source_document_coverage', {
      p_from: fromIso,
      p_to: toIso,
      p_platform: platform && platform !== 'all' ? platform : null,
      p_query: q,
      p_symbol: symbol,
      p_verification_status: effectiveVerificationStatus,
      p_theme_symbols: themeSymbols.length > 0 ? themeSymbols : null,
    }),
    loadLatestSourceRunLedger(),
  ]);
  const { data, error, count } = docsRes;
  if (error) throw new Error(error.message);
  if (runsRes.error) throw new Error(runsRes.error.message);
  if (auditsRes.error) throw new Error(auditsRes.error.message);
  if (coverageRes.error) throw new Error(coverageRes.error.message);

  let mapped = ((data as Row[]) || [])
    .filter((row) => !isSourceDocNoise(row))
    .map((row): SourceSearchResultItem => {
      const confidence = row.confidence == null ? null : toFiniteNumber(row.confidence, 0);
      const sourceEntity = Array.isArray(row.source_entities) ? (row.source_entities[0] as Row | undefined) : (row.source_entities as Row | undefined);
      const symbols = Array.isArray(row.symbols) ? (row.symbols as unknown[]).map(String) : [];
      const crawlMode = sourceDocMetadataValue(row, 'crawl_mode') as SourceSearchResultItem['crawlMode'];
      const matchType = sourceDocMetadataValue(row, 'match_type') as SourceSearchResultItem['matchType'];
      const directHit = symbol
        ? (crawlMode === 'symbol_scoped' && sourceDocMetadataValue(row, 'query_symbol') === symbol
            ? matchType === 'direct_symbol' || matchType === 'alias'
            : looksLikeDirectSymbolHit({
                symbol,
                symbols,
                platform: row.platform,
                title: row.title,
                summary: row.summary,
                content_text: row.content_text,
                document_url: row.document_url,
              }))
        : false;
      return {
        id: String(row.id || ''),
        platform: String(row.platform || ''),
        title: String(row.title || ''),
        summary: row.summary ? String(row.summary) : null,
        documentUrl: String(row.document_url || ''),
        publishedAt: row.published_at ? String(row.published_at) : null,
        collectedAt: String(row.collected_at || ''),
        symbols,
        directHit,
        crawlMode: crawlMode || null,
        matchType: matchType || null,
        confidence,
        verificationStatus: verificationStatusFromConfidence(confidence),
        sourceEntityName: sourceEntity?.display_name ? String(sourceEntity.display_name) : null,
        sourceEntityType: sourceEntity?.entity_type ? String(sourceEntity.entity_type) : null,
      };
    })
    .filter((item) => (symbol ? item.symbols.includes(symbol) || item.directHit : true))
    .filter((item) => (verificationStatus ? item.verificationStatus === verificationStatus : true));

  if (evidenceLevel) {
    mapped = mapped.filter((item) => {
      if (evidenceLevel === '估值層') return item.verificationStatus === '已證實';
      if (evidenceLevel === '佐證層') return item.verificationStatus === '部分證實';
      return item.verificationStatus === '未證實';
    });
  }

  if (runId) {
    const matchingAudits = ((auditsRes.data as Row[]) || []).filter((row) => String(row.connector_run_id || '') === runId);
    const targetUrls = matchingAudits.map((row) => String(row.target_url || '')).filter(Boolean);
    const runPlatforms = new Set(matchingAudits.map((row) => String(row.platform || '')).filter(Boolean));
    mapped = mapped.filter((item) => {
      const urlMatched = targetUrls.some((targetUrl) => item.documentUrl.startsWith(targetUrl));
      const platformMatched = runPlatforms.has(item.platform);
      return urlMatched || platformMatched;
    });
  }

  mapped = mapped.sort((a, b) => {
    const aTs = a.publishedAt || a.collectedAt;
    const bTs = b.publishedAt || b.collectedAt;
    return bTs.localeCompare(aTs);
  });
  const filteredTotal = mapped.length;
  const pagedItems = needsClientSideFiltering ? mapped.slice(start, start + pageSize) : mapped;

  return {
    page,
    pageSize,
    total: needsClientSideFiltering ? filteredTotal : Number(count || 0),
    query: {
      q,
      symbol,
      platform: platform || null,
      verificationStatus,
      themeKey,
      runId,
      evidenceLevel,
      from,
      to,
    },
    latestSourceAt: mapped[0]?.publishedAt || mapped[0]?.collectedAt || null,
    coverage: ((coverageRes.data as Row[]) || []).map((row) => ({
      platform: String(row.platform || ''),
      count: Number(row.count || 0),
    })),
    coverageScope: 'complete_filtered_result',
    items: pagedItems,
    sourceRunLedger,
    connectorStatus: (await getConnectorStatusSummary()).map(compactSourceSearchConnectorStatus),
    recentRuns: ((runsRes.data as Row[]) || []).map((row) => ({
      id: String(row.id || ''),
      connector: String(row.platform || row.connector_name || ''),
      status: String(row.status || 'unknown'),
      startedAt: row.started_at ? String(row.started_at) : null,
      finishedAt: row.finished_at ? String(row.finished_at) : null,
      recordsWritten: Number(row.records_written || 0),
      errorSummary: truncateSourceSearchText(row.error_summary, 120),
    })),
    recentAudits: ((auditsRes.data as Row[]) || []).map((row) => ({
      id: String(row.id || ''),
      connectorRunId: row.connector_run_id ? String(row.connector_run_id) : null,
      platform: String(row.platform || ''),
      targetUrl: truncateSourceSearchText(row.target_url, 180),
      status: String(row.status || 'unknown'),
      notes: truncateSourceSearchText(row.notes, 140),
      createdAt: String(row.created_at || nowIso()),
      snapshotPath: row.snapshot_path ? String(row.snapshot_path) : null,
      screenshotPath: row.screenshot_path ? String(row.screenshot_path) : null,
    })),
  };
}

export async function getDailyDashboardData() {
  if (shouldUseDemoFallback()) {
    return fallbackDailyDashboardData();
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const [tw, us, recs] = await Promise.all([
      supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      supabaseServer.from('market_snapshots').select('*').eq('market', 'US').order('as_of', { ascending: false }).limit(1),
      supabaseServer
        .from('recommendations')
        .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
        .eq('is_blocked', false)
        .order('as_of', { ascending: false })
        .order('score', { ascending: false })
        .limit(20),
    ]);

    if (tw.error || us.error || recs.error) {
      throw new Error(tw.error?.message || us.error?.message || recs.error?.message || 'Failed to fetch dashboard data');
    }

    const marketFocus: DailyMarketFocus[] = [tw.data?.[0], us.data?.[0]]
      .filter(Boolean)
      .map((value) => {
        const row = value as Row;
        return {
          market: (row.market as 'TW' | 'US') || 'TW',
          asOf: String(row.as_of || ''),
          sectorFlows: (row.sector_flows as Record<string, number>) || {},
          indexState: (row.index_state as Record<string, unknown>) || {},
          freshness: (row.freshness_status as DailyMarketFocus['freshness']) || 'missing',
        };
      });

    const recommendations = ((recs.data as Row[]) || []).map(mapRecommendation);
    return { marketFocus, recommendations, riskDisclosure: RISK_DISCLOSURE };
  } catch {
    return shouldUseDemoFallback() ? fallbackDailyDashboardData() : { marketFocus: [], recommendations: [], riskDisclosure: RISK_DISCLOSURE };
  }
}

export async function getRecommendationList(_market?: string, minScore?: number) {
  if (shouldUseDemoFallback()) {
    const mapped = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation);
    const byMarket = _market ? mapped.filter((row) => row.market === _market) : mapped;
    return typeof minScore === 'number' ? byMarket.filter((row) => row.score >= minScore) : byMarket;
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    let query = supabaseServer
      .from('recommendations')
      .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
      .eq('is_blocked', false)
      .order('as_of', { ascending: false })
      .order('score', { ascending: false })
      .limit(50);

    if (typeof minScore === 'number' && Number.isFinite(minScore)) {
      query = query.gte('score', minScore);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message);
    }

    const mapped = ((data as Row[]) || []).map(mapRecommendation);
    const filteredByMarket = _market ? mapped.filter((row) => row.market === _market) : mapped;
    return filteredByMarket;
  } catch {
    if (shouldUseDemoFallback()) {
      const mapped = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation);
      const byMarket = _market ? mapped.filter((row) => row.market === _market) : mapped;
      return typeof minScore === 'number' ? byMarket.filter((row) => row.score >= minScore) : byMarket;
    }
    return [];
  }
}

export async function getStockInsight(symbol: string): Promise<StockInsightPayload | null> {
  if (shouldUseDemoFallback()) {
    return await fallbackStockInsight(symbol);
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const stock = await getLatestStockRecord(symbol);
    if (!stock) return null;

    const [signalRes, recommendationRes, twQuote, twInstitutional, twMarginTrades, twShortSales, twOfficialSbl] = await Promise.all([
      supabaseServer
        .from('stock_signals')
        .select('*')
        .eq('stock_id', stock.id as string)
        .order('as_of', { ascending: false })
        .limit(DEEP_DIVE_DAILY_BAR_BUFFER),
      supabaseServer
        .from('recommendations')
        .select('*, stocks(symbol,name,market), strategy_actions(*)')
        .eq('stock_id', stock.id as string)
        .order('as_of', { ascending: false })
        .limit(1),
      stock.market === 'TW' ? fetchTwStockQuote(String(stock.symbol)).catch(() => null) : Promise.resolve(null),
      stock.market === 'TW' ? fetchTwStockInstitutional(String(stock.symbol)).catch(() => null) : Promise.resolve(null),
      stock.market === 'TW' ? fetchTwStockMarginTrades(String(stock.symbol)).catch(() => null) : Promise.resolve(null),
      stock.market === 'TW' ? fetchTwStockShortSales(String(stock.symbol)).catch(() => null) : Promise.resolve(null),
      stock.market === 'TW' ? fetchTwseOfficialSblShortSales(String(stock.symbol)).catch(() => null) : Promise.resolve(null),
    ]);

    if (signalRes.error || recommendationRes.error) {
      throw new Error(signalRes.error?.message || recommendationRes.error?.message || 'Failed to fetch stock insight');
    }

    const latestSignal = (signalRes.data?.[0] as Row | undefined) || null;
    if (!latestSignal) return null;

    // Official TWSE/TPEx daily bars are authoritative; stored signals are the only fallback.
    const officialDailyBars = stock.market === 'TW'
      ? await withFallbackTimeout(fetchTwStockDailyBars(String(stock.symbol), DEEP_DIVE_DAILY_BAR_BUFFER).catch(() => null), null, 4500)
      : null;
    let chart: StockInsightPayload['chart'];
    let chartSource: StockInsightPayload['chartSource'] = 'missing';
    let chartMissingReason: string | null = null;
    if (officialDailyBars && officialDailyBars.length >= 5) {
      chart = officialDailyBars.slice(-DEEP_DIVE_DAILY_BAR_TARGET).map(({ time, open, high, low, close }) => ({ time, open, high, low, close }));
      chartSource = 'twstock';
    } else {
      chart = buildChartFromSignalRows((signalRes.data as Row[]) || []);
      chartSource = chart.length > 0 ? 'stock_signals' : 'missing';
      chartMissingReason = chart.length > 0 ? null : 'TWSE／TPEx 與 stock_signals 都沒有足夠日線，暫時無法建立 K 線。';
    }
    const chartCloses = chart.map((item) => item.close).filter((value) => Number.isFinite(value) && value > 0);
    const derivedTechnical = chartCloses.length >= 2 ? computeTechnicalSnapshot(chartCloses) : null;

    const recommendationRaw = (recommendationRes.data?.[0] as Row | undefined) || undefined;
    const recommendation = recommendationRaw ? mapRecommendation(recommendationRaw) : undefined;
    const strategyRaw = Array.isArray(recommendationRaw?.strategy_actions)
      ? ((recommendationRaw?.strategy_actions as Row[])[0] as Row | undefined)
      : ((recommendationRaw?.strategy_actions as Row | undefined) || undefined);

    const strategy: StrategyActionView | undefined = strategyRaw
      ? {
          id: String(strategyRaw.id || ''),
          recommendationId: String(strategyRaw.recommendation_id || ''),
          entryRule: String(strategyRaw.entry_rule || ''),
          positionSizeRule: String(strategyRaw.position_size_rule || ''),
          targetPrice: strategyRaw.target_price ? toNumber(strategyRaw.target_price) : null,
          stopLoss: strategyRaw.stop_loss ? toNumber(strategyRaw.stop_loss) : null,
          reviewHorizon: strategyRaw.review_horizon ? String(strategyRaw.review_horizon) : null,
          state: (strategyRaw.state as StrategyActionView['state']) || 'active',
        }
      : undefined;

    // Fetch live price from TWSE for TW stocks to ensure up-to-date display
    const liveSnapshot = stock.market === 'TW' ? await fetchTWSELivePrice(String(stock.symbol)).catch(() => null) : null;
    const displayPrice = twQuote?.price ?? liveSnapshot?.price ?? toNumber(latestSignal.price);
    const displayVolume = twQuote?.volume ?? liveSnapshot?.volume ?? (latestSignal.volume ? Number(latestSignal.volume) : null);
    const latestChipMetrics = ((latestSignal.chip_metrics as Record<string, unknown>) || {});
    const recentSignalRows = ((signalRes.data as Row[]) || []).slice(0, 20);
    const fallbackChipMetrics = hasAnyChipMetric(latestChipMetrics) ? latestChipMetrics : latestNonEmptyChipMetricsFromRows(recentSignalRows);
    const chipMetricsBase = ((fallbackChipMetrics as Record<string, unknown> | null) || latestChipMetrics);
    const foreignNet5d = sumChipMetricWindow(recentSignalRows, 'foreign_net', 5);
    const foreignNet20d = sumChipMetricWindow(recentSignalRows, 'foreign_net', 20);
    const investmentTrustNet5d = sumChipMetricWindow(recentSignalRows, 'investment_trust_net', 5);
    const investmentTrustNet20d = sumChipMetricWindow(recentSignalRows, 'investment_trust_net', 20);
    const dealerNet5d = sumChipMetricWindow(recentSignalRows, 'dealer_net', 5);
    const dealerNet20d = sumChipMetricWindow(recentSignalRows, 'dealer_net', 20);

    return {
      symbol: String(stock.symbol || ''),
      name: String(stock.name || ''),
      market: (stock.market as 'TW' | 'US') || 'TW',
      price: displayPrice,
      volume: displayVolume,
      asOf: twQuote?.date ? `${twQuote.date}T00:00:00.000+08:00` : String(latestSignal.as_of || ''),
      freshness: twQuote?.price || liveSnapshot ? 'fresh' : ((latestSignal.freshness_status as StockInsightPayload['freshness']) || 'missing'),
      chart,
      chartSource,
      chartMissingReason,
      indicators: {
        maShort: latestSignal.ma_short ? toNumber(latestSignal.ma_short) : derivedTechnical?.maShort ?? null,
        maMid: latestSignal.ma_mid ? toNumber(latestSignal.ma_mid) : derivedTechnical?.maMid ?? null,
        maLong: latestSignal.ma_long ? toNumber(latestSignal.ma_long) : derivedTechnical?.maLong ?? null,
        rsi: latestSignal.rsi ? toNumber(latestSignal.rsi) : derivedTechnical?.rsi ?? null,
        macd: latestSignal.macd ? toNumber(latestSignal.macd) : derivedTechnical?.macd ?? null,
        macdSignal: latestSignal.macd_signal ? toNumber(latestSignal.macd_signal) : derivedTechnical?.macdSignal ?? null,
      },
      chipMetrics: {
        ...chipMetricsBase,
        foreign_net: twInstitutional?.foreignNet ?? chipMetricsBase.foreign_net ?? null,
        foreign_net_5d: foreignNet5d ?? chipNumber(chipMetricsBase.foreign_net_5d),
        foreign_net_20d: foreignNet20d ?? chipNumber(chipMetricsBase.foreign_net_20d),
        investment_trust_net: twInstitutional?.investmentTrustNet ?? chipMetricsBase.investment_trust_net ?? null,
        investment_trust_net_5d: investmentTrustNet5d ?? chipNumber(chipMetricsBase.investment_trust_net_5d),
        investment_trust_net_20d: investmentTrustNet20d ?? chipNumber(chipMetricsBase.investment_trust_net_20d),
        dealer_net: twInstitutional?.dealerNet ?? chipMetricsBase.dealer_net ?? null,
        dealer_net_5d: dealerNet5d ?? chipNumber(chipMetricsBase.dealer_net_5d),
        dealer_net_20d: dealerNet20d ?? chipNumber(chipMetricsBase.dealer_net_20d),
        margin_balance: twMarginTrades?.marginBalance ?? chipNumber(chipMetricsBase.margin_balance),
        margin_balance_change:
          (twMarginTrades?.marginBalance != null && twMarginTrades?.marginBalancePrev != null
            ? twMarginTrades.marginBalance - twMarginTrades.marginBalancePrev
            : chipNumber(chipMetricsBase.margin_balance_change)),
        margin_usage_ratio: twMarginTrades?.marginUsageRatio ?? chipNumber(chipMetricsBase.margin_usage_ratio),
        margin_note: twMarginTrades?.note ?? chipMetricsBase.margin_note ?? null,
        short_balance: twMarginTrades?.shortBalance ?? chipNumber(chipMetricsBase.short_balance),
        short_balance_change:
          (twMarginTrades?.shortBalance != null && twMarginTrades?.shortBalancePrev != null
            ? twMarginTrades.shortBalance - twMarginTrades.shortBalancePrev
            : chipNumber(chipMetricsBase.short_balance_change)),
        short_usage_ratio: twMarginTrades?.shortUsageRatio ?? chipNumber(chipMetricsBase.short_usage_ratio),
        short_note: twMarginTrades?.note ?? chipMetricsBase.short_note ?? null,
        margin_short_balance: twShortSales?.marginShortBalance ?? chipNumber(chipMetricsBase.margin_short_balance),
        margin_short_balance_change:
          (twShortSales?.marginShortBalance != null && twShortSales?.marginShortBalancePrev != null
            ? twShortSales.marginShortBalance - twShortSales.marginShortBalancePrev
            : chipNumber(chipMetricsBase.margin_short_balance_change)),
        margin_short_usage_ratio: twShortSales?.marginShortUsageRatio ?? chipNumber(chipMetricsBase.margin_short_usage_ratio),
        margin_short_note: twShortSales?.note ?? chipMetricsBase.margin_short_note ?? null,
        sbl_short_balance: twOfficialSbl?.sblShortBalance ?? twShortSales?.sblShortBalance ?? chipNumber(chipMetricsBase.sbl_short_balance),
        sbl_short_balance_change:
          (twOfficialSbl?.sblShortBalance != null && twOfficialSbl?.sblShortBalancePrev != null
            ? twOfficialSbl.sblShortBalance - twOfficialSbl.sblShortBalancePrev
            : chipNumber(chipMetricsBase.sbl_short_balance_change)),
        sbl_short_usage_ratio: twOfficialSbl?.sblShortUsageRatio ?? twShortSales?.sblShortUsageRatio ?? chipNumber(chipMetricsBase.sbl_short_usage_ratio),
        official_sbl_as_of: twOfficialSbl?.date ?? chipMetricsBase.official_sbl_as_of ?? null,
        official_sbl_source_url: twOfficialSbl?.sourceUrl ?? chipMetricsBase.official_sbl_source_url ?? null,
        sbl_source: twOfficialSbl?.source ?? chipMetricsBase.sbl_source ?? null,
        chip_source_as_of: twQuote?.date
          ? `${twQuote.date}T00:00:00.000+08:00`
          : String(chipMetricsBase.chip_source_as_of || latestSignal.as_of || ''),
        chip_source: twOfficialSbl
          ? 'twse-official+node-twstock/live'
          : twQuote || twInstitutional || twMarginTrades || twShortSales
            ? 'node-twstock/live'
            : chipMetricsBase.chip_source || 'stock_signals',
        fallback_used: !(twInstitutional || twMarginTrades || twShortSales || twOfficialSbl) || chipMetricsBase !== latestChipMetrics,
      },
      strategy,
      recommendation,
      riskDisclosure: RISK_DISCLOSURE,
    };
  } catch {
    return shouldUseDemoFallback() ? await fallbackStockInsight(symbol) : null;
  }
}

export async function getLatestIngestionState(maxAgeMinutes = 120) {
  const supabaseServer = getSupabaseServerClient();
  const { data, error } = await supabaseServer
    .from('pipeline_runs')
    .select('*')
    .eq('run_type', 'ingestion')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const latest = (data?.[0] as Row | undefined) || null;
  if (!latest) {
    return { ok: false, reason: 'no ingestion run found', latest: null };
  }

  const startedAt = latest.started_at ? new Date(String(latest.started_at)).getTime() : 0;
  const ageMinutes = startedAt ? (Date.now() - startedAt) / 60000 : Number.POSITIVE_INFINITY;
  if (String(latest.status || '') !== 'success') {
    return { ok: false, reason: 'latest ingestion not success', latest };
  }
  if (ageMinutes > maxAgeMinutes) {
    return { ok: false, reason: `ingestion older than ${maxAgeMinutes} minutes`, latest };
  }
  return { ok: true, reason: null, latest };
}

export async function runIngestionBatch(options?: { dryRun?: boolean }): Promise<IngestionResult> {
  const dryRun = Boolean(options?.dryRun);
  const supabaseServer = getSupabaseServerClient();
  const runId = randomUUID();
  const now = new Date();
  const iso = now.toISOString();
  const asOfDate = asIsoDate(iso);

  const officialMarketRows = dryRun ? [] : await fetchTWSEAllPrices();
  const marketMoves = officialMarketRows.flatMap((row) => {
    const close = Number(String(row.ClosingPrice || '').replace(/,/gu, ''));
    const change = Number(String(row.Change || '').replace(/[^0-9.-]/gu, ''));
    return Number.isFinite(close) && close > 0 && Number.isFinite(change) ? [change / Math.max(0.01, close - change)] : [];
  });
  const advancingRatio = marketMoves.length > 0 ? marketMoves.filter((value) => value > 0).length / marketMoves.length : null;
  const marketRegime = advancingRatio == null
    ? 'unknown'
    : advancingRatio <= 0.3
      ? 'breakdown'
      : advancingRatio <= 0.42
        ? 'risk_off'
        : advancingRatio >= 0.58
          ? 'risk_on'
          : 'selective';
  const snapshotRows = officialMarketRows.length > 0 ? [{
    market: 'TW' as const,
    as_of: iso,
    source: 'twse-openapi',
    source_key: 'api.twse.stock-day-all-breadth',
    sector_flows: {},
    index_state: { regime: marketRegime, advancing_ratio: advancingRatio, securities_observed: marketMoves.length },
    source_timestamp: iso,
  }] : [];
  const allowDemoSeedWrites = shouldUseDemoFallback() && process.env.ALLOW_DEMO_SEED_WRITES === 'true';

  const stockSeeds = TW_STORY_RESEARCH_SEEDS.map((seed) => ({
    symbol: seed.symbol,
    name: seed.name,
    market: seed.market,
    sector: seed.sector,
    source_key: seed.sourceKey,
    source: seed.source,
    prices: [...seed.prices],
    volume: seed.volume,
  }));

  const institutionalSeeds = (allowDemoSeedWrites ? TW_STORY_RESEARCH_SEEDS : []).map((seed) => ({
    symbol: seed.symbol,
    name: seed.name,
    market: seed.market,
    source: 'public-research-digest',
    source_key: `ins.tw.${slugify(seed.symbol)}.${slugify(seed.themeKey)}`,
    report_title: seed.reportTitle,
    expectation_score: seed.expectationScore,
    thesis_summary: seed.reportSummary,
  }));

  const socialSeeds = (allowDemoSeedWrites ? TW_STORY_RESEARCH_SEEDS : []).flatMap((seed) =>
    seed.socialSignals.map((signal) => ({
      symbol: seed.symbol,
      name: seed.name,
      market: seed.market,
      source_type: signal.sourceType,
      source_name: signal.sourceName,
      source_key: signal.sourceKey,
      sentiment_label: signal.sentimentLabel,
      confidence: signal.confidence,
      mention_count: signal.mentionCount,
      summary: signal.summary,
      source_url: signal.sourceUrl || null,
    })),
  );
  let stockSignalsWritten = dryRun ? stockSeeds.length : 0;

  if (!dryRun) {
    await supabaseServer.from('pipeline_runs').insert({
      id: runId,
      run_type: 'ingestion',
      status: 'running',
      details: { step: 'started', as_of: asOfDate },
    });
  }

  try {
    if (!dryRun) {
      await ensureAgentProfiles();

      for (const snapshot of snapshotRows) {
        await upsertSourceRegistry(snapshot.source_key, 'market');
        await recordSourceHealth(snapshot.source_key, 1, 1);
        const status = freshnessStatus(snapshot.source_timestamp, now);
        const { error } = await supabaseServer.from('market_snapshots').upsert(
          {
            ...snapshot,
            freshness_status: status,
            ingested_at: iso,
          },
          { onConflict: 'market,as_of' }
        );
        if (error) throw new Error(error.message);
        stockSignalsWritten += 1;
      }

      for (const seed of stockSeeds) {
        await upsertSourceRegistry(seed.source_key, 'market');
        await recordSourceHealth(seed.source_key, 0.95, 1);
        const stock = await ensureStock(seed.symbol, seed.market, seed.name, seed.sector);

        // Fetch licensed official market history; seed prices never qualify as fresh evidence.
        const [liveData, officialBars, institutionalData, priorFlowSignals] = seed.market === 'TW'
          ? await Promise.all([
              fetchTWSELivePrice(seed.symbol).catch(() => null),
              fetchTwStockDailyBars(seed.symbol, DEEP_DIVE_DAILY_BAR_BUFFER).catch(() => null),
              fetchTwStockInstitutional(seed.symbol).catch(() => null),
              supabaseServer
                .from('stock_signals')
                .select('as_of,volume,chip_metrics')
                .eq('stock_id', stock.id)
                .order('as_of', { ascending: false })
                .limit(30)
                .then(({ data, error }) => {
                  if (error) throw new Error(error.message);
                  return (data as Row[]) || [];
                }),
            ])
          : [null, null, null, [] as Row[]];
        const officialCloses = (officialBars || []).map((bar) => bar.close).filter((value) => Number.isFinite(value) && value > 0);
        const livePrice = liveData?.price ?? officialCloses.at(-1) ?? null;
        if (livePrice == null) continue;
        const liveVolume = liveData?.volume ?? officialBars?.at(-1)?.volume ?? null;
        const institutionalNet = institutionalData
          ? [institutionalData.foreignNet, institutionalData.investmentTrustNet, institutionalData.dealerNet]
              .filter((value): value is number => value != null && Number.isFinite(value))
              .reduce((sum, value) => sum + value, 0)
          : null;
        const priorFlowDays: InstitutionalFlowDay[] = priorFlowSignals.map((row) => {
          const chip = (row.chip_metrics as Row | null) || {};
          const netValues = [chip.foreign_net, chip.investment_trust_net, chip.dealer_net]
            .map((value) => value == null ? null : Number(value))
            .filter((value): value is number => value != null && Number.isFinite(value));
          const volume = row.volume == null ? null : Number(row.volume);
          return {
            session: String(chip.institutional_date || row.as_of || '').slice(0, 10),
            net: netValues.length > 0 ? netValues.reduce((sum, value) => sum + value, 0) : null,
            volume: volume != null && Number.isFinite(volume) ? volume : null,
          };
        });
        const normalizedInstitutional = normalizeInstitutionalFlows([
          {
            session: institutionalData?.date || officialBars?.at(-1)?.time || asOfDate,
            net: institutionalNet,
            volume: liveVolume,
          },
          ...priorFlowDays,
        ]);

        const priceSeries = officialCloses.length > 0
          ? [...officialCloses.slice(0, -1), livePrice]
          : [livePrice];
        const technical = computeTechnicalSnapshot(priceSeries);
        const sourceTimestamp = liveData
          ? new Date(now.getTime() - 5 * 60 * 1000).toISOString()
          : new Date(now.getTime() - 15 * 60 * 1000).toISOString();

        const { error } = await supabaseServer.from('stock_signals').upsert(
          {
            stock_id: stock.id,
            as_of: iso,
            source: 'twse-tpex-open-data',
            source_key: `api.twse-tpex.price.${seed.symbol}`,
            price: livePrice,
            volume: liveVolume,
            ma_short: technical.maShort,
            ma_mid: technical.maMid,
            ma_long: technical.maLong,
            rsi: technical.rsi,
            macd: technical.macd,
            macd_signal: technical.macdSignal,
            chip_metrics: {
              foreign_net: institutionalData?.foreignNet ?? null,
              investment_trust_net: institutionalData?.investmentTrustNet ?? null,
              dealer_net: institutionalData?.dealerNet ?? null,
              institutional_date: institutionalData?.date ?? null,
              open: liveData?.open ?? null,
              high: liveData?.high ?? null,
              low: liveData?.low ?? null,
              change: liveData?.change ?? null,
            },
            technical_meta: { indicator_set: ['MA5', 'MA10', 'MA20', 'RSI', 'MACD'], live_price: liveData !== null, official_history: Boolean(officialBars) },
            freshness_status: 'fresh',
            source_timestamp: sourceTimestamp,
            ingested_at: iso,
          },
          { onConflict: 'stock_id,as_of' }
        );
        if (error) throw new Error(error.message);

        if (seed.market === 'TW' && officialBars && officialBars.length > 1) {
            const historicalRows = officialBars.slice(0, -1).map((bar) => {
              const barIso = `${bar.time}T12:00:00.000Z`;
              return {
                  stock_id: stock.id,
                  as_of: barIso,
                  source: 'twse-tpex-open-data',
                  source_key: `api.twse-tpex.hist.${seed.symbol}`,
                  price: bar.close,
                  volume: null,
                  chip_metrics: { open: bar.open, high: bar.high, low: bar.low },
                  technical_meta: { indicator_set: [], official_history: true },
                  freshness_status: 'stale',
                  source_timestamp: barIso,
                  ingested_at: iso,
                };
            });
            const { error: historyError } = await supabaseServer
              .from('stock_signals')
              .upsert(historicalRows, { onConflict: 'stock_id,as_of' });
            if (historyError) throw new Error(historyError.message);
        }

        if (officialBars && officialBars.length > 0) {
          const technicalFeatures = calculateTechnicalFeatures(officialBars.map((bar) => ({
            session: bar.time,
            high: bar.high,
            low: bar.low,
            close: bar.close,
            volume: bar.volume ?? 0,
          })), normalizedInstitutional);
          const { error: featureError } = await supabaseServer.from('technical_feature_snapshots').upsert({
            stock_id: stock.id,
            session_date: technicalFeatures.sessionDate,
            close: technicalFeatures.close,
            volume: technicalFeatures.volume,
            ma5: technicalFeatures.ma5,
            ma20: technicalFeatures.ma20,
            ma60: technicalFeatures.ma60,
            ma120: technicalFeatures.ma120,
            ma240: technicalFeatures.ma240,
            ma60_slope: technicalFeatures.ma60Slope,
            volume_ratio_20_median: technicalFeatures.volumeRatio20Median,
            atr14: technicalFeatures.atr14,
            rsi14: technicalFeatures.rsi14,
            obv: technicalFeatures.obv,
            institutional_flow_5d_norm: technicalFeatures.institutionalFlow5dNorm,
            institutional_flow_20d_norm: technicalFeatures.institutionalFlow20dNorm,
            market_regime: marketRegime,
            peer_catchdown_block: false,
            as_of: `${technicalFeatures.sessionDate}T13:30:00+08:00`,
            available_at: iso,
            provenance: { source: 'twse_tpex_official_market_data' },
            ruleset_version: technicalFeatures.rulesetVersion,
          }, { onConflict: 'stock_id,session_date,ruleset_version' });
          if (featureError) throw new Error(featureError.message);
        }
      }

      for (const seed of institutionalSeeds) {
        await upsertSourceRegistry(seed.source_key, 'institutional');
        await recordSourceHealth(seed.source_key, 0.9, 1);
        const stock = await ensureStock(seed.symbol, seed.market, seed.name, null);
        const sourceTimestamp = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
        const { error } = await supabaseServer.from('institutional_signals').insert({
          stock_id: stock.id,
          source: seed.source,
          source_key: seed.source_key,
          report_title: seed.report_title,
          expectation_score: seed.expectation_score,
          thesis_summary: seed.thesis_summary,
          source_timestamp: sourceTimestamp,
          ingested_at: iso,
          freshness_status: freshnessStatus(sourceTimestamp, now),
        });
        if (error) throw new Error(error.message);
      }

      for (const seed of socialSeeds) {
        const sourceType = seed.source_type === 'KOL' ? 'kol' : 'social';
        await upsertSourceRegistry(seed.source_key, sourceType);
        await recordSourceHealth(seed.source_key, 0.88, 1);
        const stock = await ensureStock(seed.symbol, seed.market, seed.name, null);
        const sourceTimestamp = new Date(now.getTime() - 20 * 60 * 1000).toISOString();
        const { error } = await supabaseServer.from('social_signals').insert({
          stock_id: stock.id,
          source_type: seed.source_type,
          source_name: seed.source_name,
          source_key: seed.source_key,
          sentiment_label: seed.sentiment_label,
          confidence: seed.confidence,
          mention_count: seed.mention_count,
          summary: seed.summary,
          source_url: seed.source_url,
          source_timestamp: sourceTimestamp,
          ingested_at: iso,
          freshness_status: freshnessStatus(sourceTimestamp, now),
        });
        if (error) throw new Error(error.message);
      }

      for (const seed of allowDemoSeedWrites ? TW_STORY_RESEARCH_SEEDS : []) {
        const stock = await ensureStock(seed.symbol, seed.market, seed.name, seed.sector);
        for (const event of seed.companyEvents) {
          const { error } = await supabaseServer.from('company_events').upsert(
            {
              stock_id: stock.id,
              event_type: event.eventType,
              headline: event.headline,
              summary: event.summary,
              source_url: event.sourceUrl,
              event_timestamp: new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString(),
              extracted_signals: event.extractedSignals,
            },
            { onConflict: 'stock_id,event_type,event_timestamp,headline' },
          );
          if (error) throw new Error(error.message);
        }

        const { error: transcriptError } = await supabaseServer.from('conference_transcripts').upsert(
          {
            stock_id: stock.id,
            event_name: seed.transcript.eventName,
            transcript_excerpt: seed.transcript.excerpt,
            source_url: seed.transcript.sourceUrl,
            event_timestamp: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
            management_tone: seed.transcript.managementTone,
            catalyst_mentions: seed.transcript.catalystMentions,
          },
          { onConflict: 'stock_id,event_name,event_timestamp' },
        );
        if (transcriptError) throw new Error(transcriptError.message);

        const { error: revenueError } = await supabaseServer.from('revenue_signals').upsert(
          {
            stock_id: stock.id,
            as_of_date: asOfDate,
            monthly_revenue: nullIfMissingMetric(seed.revenue.monthlyRevenue),
            yoy_growth: seed.revenue.yoyGrowth == null || !Number.isFinite(seed.revenue.yoyGrowth) ? null : seed.revenue.yoyGrowth,
            mom_growth: seed.revenue.momGrowth == null || !Number.isFinite(seed.revenue.momGrowth) ? null : seed.revenue.momGrowth,
            source_url: seed.revenue.sourceUrl,
          },
          { onConflict: 'stock_id,as_of_date' },
        );
        if (revenueError) throw new Error(revenueError.message);

        const { error: fundamentalError } = await supabaseServer.from('fundamental_snapshots').upsert(
          {
            stock_id: stock.id,
            as_of_date: asOfDate,
            eps_ttm: nullIfZeroMetric(seed.fundamentals.epsTtm),
            gross_margin: nullIfMissingMetric(seed.fundamentals.grossMargin),
            operating_margin: nullIfZeroMetric(seed.fundamentals.operatingMargin),
            pe_ratio: nullIfZeroMetric(seed.fundamentals.peRatio),
            pb_ratio: nullIfMissingMetric(seed.fundamentals.pbRatio),
            revenue_run_rate: nullIfMissingMetric(seed.fundamentals.revenueRunRate),
            source_url: seed.fundamentals.sourceUrl,
          },
          { onConflict: 'stock_id,as_of_date' },
        );
        if (fundamentalError) throw new Error(fundamentalError.message);
      }

      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: {
            as_of: asOfDate,
            snapshots: snapshotRows.length,
            stock_signals: stockSignalsWritten,
            institutional_signals: institutionalSeeds.length,
            social_signals: socialSeeds.length,
            company_events: TW_STORY_RESEARCH_SEEDS.length,
            transcripts: TW_STORY_RESEARCH_SEEDS.length,
            revenue_signals: TW_STORY_RESEARCH_SEEDS.length,
            fundamental_snapshots: TW_STORY_RESEARCH_SEEDS.length,
            dry_run: false,
          },
          finished_at: nowIso(),
        })
        .eq('id', runId);
    }

    return {
      asOf: asOfDate,
      snapshots: snapshotRows.length,
      stockSignals: stockSignalsWritten,
      institutionalSignals: institutionalSeeds.length,
      socialSignals: socialSeeds.length,
      runId,
      dryRun,
    };
  } catch (error) {
    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: { as_of: asOfDate, error: (error as Error).message, dry_run: false },
          finished_at: nowIso(),
        })
        .eq('id', runId);
    }
    throw error;
  }
}

export async function runThemeScan(options?: { dryRun?: boolean }): Promise<AgentWorkflowResult> {
  const dryRun = Boolean(options?.dryRun);
  const asOfDate = asIsoDate(nowIso());
  const startedRoles = ['Theme Scout Agent'];
  if (dryRun) {
    return { runId: randomUUID(), dryRun, startedRoles, recordsWritten: fallbackThemeRows('daily').length * 3 };
  }

  const supabaseServer = getSupabaseServerClient();
  const runId = dryRun ? randomUUID() : await startAgentRun('theme_scan', { as_of: asOfDate });

  try {
    let rowsWritten = 0;
    const [signalsRes, marketRes, socialDocsRes] = await Promise.all([
      supabaseServer.from('stock_signals').select('price,stocks(symbol,market)').order('as_of', { ascending: false }).limit(200),
      supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      supabaseServer
        .from('source_raw_documents')
        .select('symbols,platform,title,summary,document_url,confidence,published_at,collected_at,metadata,source_entities(display_name,entity_type)')
        .order('collected_at', { ascending: false })
        .limit(500),
    ]);
    if (signalsRes.error || marketRes.error) {
      throw new Error(signalsRes.error?.message || marketRes.error?.message || 'Failed to load theme scan sources');
    }
    const allSocialDocs = (socialDocsRes.data as Row[]) || [];

    const latestPrices = new Map<string, number>();
    for (const row of (signalsRes.data as Row[]) || []) {
      const stock = (row.stocks as Row | undefined) || {};
      const symbol = String(stock.symbol || '');
      const market = String(stock.market || '');
      if (!symbol || market !== 'TW' || latestPrices.has(symbol)) continue;
      latestPrices.set(symbol, toFiniteNumber(row.price));
    }

    const twTrend = toFiniteNumber(((marketRes.data?.[0] as Row | undefined)?.index_state as Row | undefined)?.trend_score, 0.6);
    const groupedThemes = new Map<string, ResearchSeed[]>();
    for (const seed of TW_STORY_RESEARCH_SEEDS) {
      const current = groupedThemes.get(seed.themeKey) || [];
      groupedThemes.set(seed.themeKey, [...current, seed]);
    }

    const buildThemeRows = () => {
      const rows: Array<Record<string, unknown>> = [];
      for (const [themeKey, seeds] of groupedThemes.entries()) {
        const themeName = seeds[0]?.themeName || themeKey;
        const avgExpectation = mean(seeds.map((seed) => seed.expectationScore));
        const avgMomentum = mean(
          seeds.map((seed) => {
            const prices = [...seed.prices];
            return clamp((prices[prices.length - 1] - prices[0]) / prices[0], -0.2, 0.3) + 0.5;
          }),
        );
        const relatedSymbols = seeds.map((seed) => seed.symbol);
        const relatedSymbolSet = new Set<string>(relatedSymbols.map(String));
        // Gather real social docs from source_raw_documents that mention any symbol in this theme
        const themeSocialDocs = allSocialDocs.filter((doc) => {
          const docSymbols = normalizeSourceDocumentSymbols(doc.symbols);
          return relatedSymbols.some((sym) => docSymbols.includes(sym));
        });
        const supportingEvidence = mergeSourceCoverage([
          // Social-first: real docs from Supabase take priority
          ...themeSocialDocs.slice(0, 10).map((doc) => {
            const sourceEntity = Array.isArray(doc.source_entities) ? (doc.source_entities[0] as Row | undefined) : (doc.source_entities as Row | undefined);
            const sourceName = String(sourceEntity?.display_name || doc.platform || '社群/新聞');
            const sourceType = sourceTypeFromName(doc.platform, sourceName);
            return mapSourceCoverageItem({
              source_name: sourceName,
              source_type: sourceType,
              summary: String(doc.summary || doc.title || '來源命中此主題關聯股票。'),
              source_url: String(doc.document_url || '') || null,
              source_timestamp: String(doc.published_at || doc.collected_at || nowIso()),
              symbols: normalizeSourceDocumentSymbols(doc.symbols, relatedSymbols).filter((symbol) => relatedSymbolSet.has(symbol)),
              confidence: toFiniteNumber(doc.confidence, 0.35),
              weight: communityWeightForSource(sourceType),
              verification_status: toFiniteNumber(doc.confidence, 0) >= 0.55 ? '部分證實' : '未證實',
            });
          }),
          // Seed social signals as fallback if no real docs
          ...seeds.flatMap((seed) =>
            seed.socialSignals.map((signal) =>
              mapSourceCoverageItem({
                source_name: signal.sourceName,
                source_type: sourceTypeFromName(signal.sourceType, signal.sourceName),
                summary: signal.summary,
                source_url: signal.sourceUrl || null,
                source_timestamp: nowIso(),
                symbols: [seed.symbol],
                confidence: signal.confidence,
                weight: communityWeightForSource(sourceTypeFromName(signal.sourceType, signal.sourceName)),
                verification_status: signal.confidence >= 0.6 ? '部分證實' : '未證實',
              }),
            ),
          ),
          // Official/financial as final validation layer
          ...seeds.flatMap((seed) => [
            mapSourceCoverageItem({
              source_name: '官方/財務資料',
              source_type: 'official',
              summary: seed.catalystSummary,
              source_url: seed.transcript.sourceUrl,
              source_timestamp: nowIso(),
              symbols: [seed.symbol],
              confidence: seed.expectationScore >= 0.8 ? 0.7 : 0.42,
              weight: communityWeightForSource('official'),
              verification_status: seed.expectationScore >= 0.8 ? '已證實' : '部分證實',
            }),
          ]),
        ]);
        const verificationStatus: VerificationStatus = supportingEvidence.some((item) => item.verificationStatus === '已證實')
          ? '已證實'
          : supportingEvidence.some((item) => item.verificationStatus === '部分證實')
            ? '部分證實'
            : '未證實';
        const baseHeat = clamp(avgExpectation * 0.55 + avgMomentum * 0.2 + twTrend * 0.25);
        for (const windowType of ['daily', 'three_day', 'weekly'] as const) {
          const modifier = windowType === 'daily' ? 1 : windowType === 'three_day' ? 0.97 : 0.94;
          rows.push({
            theme_key: themeKey,
            theme_name: themeName,
            window_type: windowType,
            market_regime: twTrend >= 0.65 ? 'risk-on-ai' : 'selective-risk-on',
            heat_score: round(clamp(baseHeat * modifier), 4),
            capital_flow_signals: {
              market_trend_score: twTrend,
              avg_expectation_score: round(avgExpectation, 4),
              avg_price_momentum: round(avgMomentum, 4),
            },
            related_symbols: relatedSymbols,
            supporting_evidence: supportingEvidence,
            verification_status: verificationStatus,
            latest_source_at: latestSourceTimestamp(supportingEvidence),
            as_of_date: asOfDate,
            updated_at: nowIso(),
          });
        }
      }
      const passiveDocs = allSocialDocs.filter(passiveComponentMlccDocMatches);
      const passiveDocSymbols = new Set(passiveDocs.flatMap((doc) => normalizeSourceDocumentSymbols(doc.symbols)));
      const passiveRelatedSymbols = PASSIVE_COMPONENT_MLCC_THEME.symbols.map((item) => item.symbol);
      const passiveCoverage = mergeSourceCoverage([
        ...passiveDocs.slice(0, 12).map((doc) => {
          const sourceEntity = Array.isArray(doc.source_entities) ? (doc.source_entities[0] as Row | undefined) : (doc.source_entities as Row | undefined);
          const sourceName = String(sourceEntity?.display_name || doc.platform || '社群/新聞');
          const sourceType = sourceTypeFromName(doc.platform, sourceName);
          return mapSourceCoverageItem({
            source_name: sourceName,
            source_type: sourceType,
            summary: String(doc.summary || doc.title || ''),
            source_url: String(doc.document_url || '') || null,
            source_timestamp: String(doc.published_at || doc.collected_at || nowIso()),
            symbols: normalizeSourceDocumentSymbols(doc.symbols, passiveRelatedSymbols).filter((symbol) => PASSIVE_COMPONENT_MLCC_SYMBOL_SET.has(String(symbol))),
            confidence: toFiniteNumber(doc.confidence, 0.5),
            weight: communityWeightForSource(sourceType),
            verification_status: toFiniteNumber(doc.confidence, 0.45) >= 0.55 ? '部分證實' : '未證實',
          });
        }),
        ...PASSIVE_COMPONENT_MLCC_THEME.externalEvidence.map((item) =>
          mapSourceCoverageItem({
            source_name: item.sourceName,
            source_type: 'news',
            summary: item.summary,
            source_url: item.sourceUrl,
            source_timestamp: nowIso(),
            symbols: passiveRelatedSymbols,
            confidence: 0.62,
            weight: 0.14,
            verification_status: '部分證實',
          }),
        ),
      ]);
      const passiveMentionRatio = passiveRelatedSymbols.length > 0 ? passiveRelatedSymbols.filter((symbol) => passiveDocSymbols.has(symbol)).length / passiveRelatedSymbols.length : 0;
      const passiveHeat = clamp(0.72 + Math.min(0.18, passiveDocs.length * 0.018) + passiveMentionRatio * 0.12 + twTrend * 0.12, 0, 0.88);
      for (const windowType of ['daily', 'three_day', 'weekly'] as const) {
        const modifier = windowType === 'daily' ? 1 : windowType === 'three_day' ? 0.97 : 0.94;
        rows.push({
          theme_key: PASSIVE_COMPONENT_MLCC_THEME.themeKey,
          theme_name: PASSIVE_COMPONENT_MLCC_THEME.themeName,
          window_type: windowType,
          market_regime: twTrend >= 0.65 ? 'risk-on-passive-components' : 'selective-risk-on',
          heat_score: round(clamp(passiveHeat * modifier), 4),
          capital_flow_signals: {
            market_trend_score: twTrend,
            source_hits: passiveDocs.length,
            mapped_symbols: passiveRelatedSymbols.length,
            candidate_only_until_bridge_pass: true,
            ...globalLeadLagCapitalFlowSignals(PASSIVE_COMPONENT_MLCC_THEME.themeKey, twTrend),
          },
          related_symbols: passiveRelatedSymbols,
          supporting_evidence: passiveCoverage,
          verification_status: passiveDocs.length >= 3 ? '部分證實' : '未證實',
          latest_source_at: latestSourceTimestamp(passiveCoverage),
          as_of_date: asOfDate,
          updated_at: nowIso(),
        });
      }
      for (const discoveryTheme of ADDITIONAL_DISCOVERY_THEMES) {
        const themeDocs = allSocialDocs.filter((doc) => discoveryThemeDocMatches(discoveryTheme, doc));
        const relatedSymbols: string[] = discoveryTheme.symbols.map((item) => String(item.symbol));
        const directSymbolHits = discoveryThemeDocSymbols(discoveryTheme, themeDocs);
        const coverage = mergeSourceCoverage([
          ...themeDocs.slice(0, 12).map((doc) => {
            const sourceEntity = Array.isArray(doc.source_entities) ? (doc.source_entities[0] as Row | undefined) : (doc.source_entities as Row | undefined);
            const sourceName = String(sourceEntity?.display_name || doc.platform || '社群/新聞');
            const sourceType = sourceTypeFromName(doc.platform, sourceName);
            return mapSourceCoverageItem({
              source_name: sourceName,
              source_type: sourceType,
              summary: String(doc.summary || doc.title || ''),
              source_url: String(doc.document_url || '') || null,
              source_timestamp: String(doc.published_at || doc.collected_at || nowIso()),
              symbols: normalizeSourceDocumentSymbols(doc.symbols, relatedSymbols).filter((symbol) => relatedSymbols.includes(symbol)),
              confidence: toFiniteNumber(doc.confidence, 0.48),
              weight: communityWeightForSource(sourceType),
              verification_status: toFiniteNumber(doc.confidence, 0.45) >= 0.55 ? '部分證實' : '未證實',
            });
          }),
          registryIndustrySource({
            sourceName: 'StockInsider 主題 taxonomy',
            summary: `${discoveryTheme.themeName} 由關鍵字與台股供應鏈映射建立；即使本輪社群未命中，也會保留候選追蹤與下一輪補抓。`,
            symbols: relatedSymbols,
            confidence: themeDocs.length > 0 ? 0.42 : 0.34,
            verificationStatus: themeDocs.length > 0 ? '部分證實' : '未證實',
          }),
        ]);
        const heat = clamp(
          0.58 +
            Math.min(0.18, themeDocs.length * 0.02) +
            (directSymbolHits.size / Math.max(1, relatedSymbols.length)) * 0.14 +
            twTrend * 0.12,
          0,
          0.86,
        );
        for (const windowType of ['daily', 'three_day', 'weekly'] as const) {
          const modifier = windowType === 'daily' ? 1 : windowType === 'three_day' ? 0.97 : 0.94;
          rows.push({
            theme_key: discoveryTheme.themeKey,
            theme_name: discoveryTheme.themeName,
            window_type: windowType,
            market_regime: twTrend >= 0.65 ? `risk-on-${discoveryTheme.themeKey}` : 'selective-risk-on',
            heat_score: round(clamp(heat * modifier), 4),
            capital_flow_signals: {
              market_trend_score: twTrend,
              source_hits: themeDocs.length,
              mapped_symbols: relatedSymbols.length,
              candidate_only_until_bridge_pass: true,
              ...globalLeadLagCapitalFlowSignals(discoveryTheme.themeKey, twTrend),
            },
            related_symbols: relatedSymbols,
            supporting_evidence: coverage,
            verification_status: directSymbolHits.size > 0 ? '部分證實' : '未證實',
            latest_source_at: latestSourceTimestamp(coverage),
            as_of_date: asOfDate,
            updated_at: nowIso(),
          });
        }
      }
      for (const basket of GLOBAL_THEME_LEAD_LAG_BASKETS) {
        if (rows.some((row) => row.theme_key === basket.themeKey)) continue;
        const coverage = globalLeadLagThemeSourceCoverage(basket);
        for (const windowType of ['daily', 'three_day', 'weekly'] as const) {
          const modifier = windowType === 'daily' ? 1 : windowType === 'three_day' ? 0.97 : 0.94;
          rows.push({
            theme_key: basket.themeKey,
            theme_name: basket.themeName,
            window_type: windowType,
            market_regime: 'overseas-lead-lag-watch',
            heat_score: round(clamp((0.48 + twTrend * 0.16) * modifier), 4),
            capital_flow_signals: globalLeadLagCapitalFlowSignals(basket.themeKey, twTrend),
            related_symbols: [...basket.twMappedSymbols],
            supporting_evidence: coverage,
            verification_status: '未證實',
            latest_source_at: latestSourceTimestamp(coverage),
            as_of_date: asOfDate,
            updated_at: nowIso(),
          });
        }
      }
      return rows;
    };

    if (!dryRun) {
      await ensureAgentProfiles();
      await runAgentTask(
        runId,
        'Theme Scout Agent',
        'theme-scan',
        profileKeyForRole('Theme Scout Agent'),
        { as_of: asOfDate, universe: 'TWSE_TPEX' },
        async () => {
          const rows = buildThemeRows();
          const { error } = await supabaseServer.from('theme_heat').upsert(rows, { onConflict: 'theme_key,window_type,as_of_date' });
          if (error) throw new Error(error.message);
          rowsWritten = rows.length;
          return {
            outputSummary: `updated ${rows.length} theme heat rows`,
            findings: rows.map((row) => ({
              themeKey: String(row.theme_key || ''),
              findingType: 'theme_heat',
              summary: `${String(row.theme_name || row.theme_key)} heat ${Number(row.heat_score || 0).toFixed(2)}`,
              confidence: Number(row.heat_score || 0),
              evidence: Array.isArray(row.supporting_evidence) ? (row.supporting_evidence as unknown[]) : [],
              sourceRefs: [],
            })),
            result: rows.length,
          };
        },
      );
    }

    if (!dryRun) {
      await finishAgentRun(runId, 'success', {
        as_of: asOfDate,
        records_written: rowsWritten,
        passive_components_mlcc_theme: true,
      });
    }
    return { runId, dryRun, startedRoles, recordsWritten: rowsWritten };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(runId, 'failed', { error: (error as Error).message, as_of: asOfDate }).catch(() => undefined);
    }
    throw error;
  }
}

export async function runStoryScan(options?: { dryRun?: boolean }): Promise<AgentWorkflowResult> {
  const dryRun = Boolean(options?.dryRun);
  const supabaseServer = getSupabaseServerClient();
  const asOfDate = asIsoDate(nowIso());
  const startedRoles = ['Story Scout Agent'];
  const runId = dryRun ? randomUUID() : await startAgentRun('story_scan', { as_of: asOfDate });

  try {
    if (!dryRun) {
      await ensureAgentProfiles();
      await runAgentTask(
        runId,
        'Story Scout Agent',
        'story-scan',
        profileKeyForRole('Story Scout Agent'),
        { as_of: asOfDate, source_boundary: 'public-first' },
        async () => {
          // Fetch recent social docs to boost confidence from real community signals
          const { data: rawSocialDocs } = await supabaseServer
            .from('source_raw_documents')
            .select('symbols,platform,title,summary,confidence,published_at,collected_at')
            .order('collected_at', { ascending: false })
            .limit(500);
          const allSocialDocs = (rawSocialDocs as Row[]) || [];

          const stockRows = await Promise.all(
            TW_STORY_RESEARCH_SEEDS.map((seed) => ensureStock(seed.symbol, seed.market, seed.name, seed.sector)),
          );
          const rows: Array<Record<string, unknown>> = stockRows.map((stock, index) => {
            const seed = TW_STORY_RESEARCH_SEEDS[index];
            // Social-first: prefer real docs from source_raw_documents
            const socialDocs = allSocialDocs.filter((doc) =>
              normalizeSourceDocumentSymbols(doc.symbols).includes(seed.symbol),
            );
            const socialConfidence = socialDocs.length > 0
              ? clamp(mean(socialDocs.map((d) => toFiniteNumber(d.confidence, 0.35))))
              : mean(seed.socialSignals.map((signal) => signal.confidence));
            // Equal weight between fundamental expectation and social signal
            const confidence = round(clamp(seed.expectationScore * 0.50 + (isFinite(socialConfidence) ? socialConfidence : 0.3) * 0.50), 4);
            return {
              stock_id: stock.id,
              story_type: seed.storyType,
              title: seed.thesisTitle,
              summary: seed.thesisSummary,
              catalyst_summary: seed.catalystSummary,
              thesis_state: 'signal_candidate',
              confidence,
              novelty_score: round(clamp(0.5 + (isFinite(socialConfidence) ? socialConfidence : 0.3) * 0.3), 4),
              evidence_score: socialDocs.length > 0 ? round(clamp(socialDocs.length / 10), 4) : 0,
              timing_score: 0,
              verification_status: '未證實',
              conditional_recommendation_note: buildConditionalRecommendationNote('signal_candidate'),
              source_mix: [
                // Social sources first
                ...socialDocs.slice(0, 3).map((doc) => ({
                  source: String(doc.source_name || doc.source_type || '社群'),
                  summary: String(doc.summary || ''),
                  sourceType: String(doc.source_type || ''),
                })),
                { source: 'institutional_signals', title: seed.reportTitle },
                ...seed.socialSignals.map((signal) => ({ source: signal.sourceName, summary: signal.summary })),
              ],
              related_themes: [seed.themeKey],
              discovered_at: nowIso(),
              as_of_date: asOfDate,
              updated_at: nowIso(),
            };
          });
          const passiveDocs = allSocialDocs.filter(passiveComponentMlccDocMatches);
          const passiveStocks = await Promise.all(
            PASSIVE_COMPONENT_MLCC_THEME.symbols.map((item) => ensureStock(item.symbol, 'TW', item.name, item.sector)),
          );
          const passiveRows = passiveStocks.map((stock, index) => {
            const candidate = PASSIVE_COMPONENT_MLCC_THEME.symbols[index];
            const directDocs = passiveDocs.filter((doc) => normalizeSourceDocumentSymbols(doc.symbols).includes(candidate.symbol));
            const evidenceDocs = directDocs.length > 0 ? directDocs : passiveDocs;
            const confidence = round(
              clamp(
                0.32 +
                  Math.min(0.22, evidenceDocs.length * 0.025) +
                  (directDocs.length > 0 ? 0.14 : 0) +
                  mean(evidenceDocs.map((doc) => toFiniteNumber(doc.confidence, 0.42))) * 0.18,
                0.28,
                0.72,
              ),
              4,
            );
            return {
              stock_id: stock.id,
              story_type: 'shortage_pricing' as StoryType,
              title: `${candidate.name} 被動元件 / MLCC 漲價循環候選`,
              summary: `AI 電源、MLCC/TLVR 電感與被動元件漲價線索升溫；${candidate.name} 先進候選池，待官方/月營收/毛利率與籌碼技術驗證後才升級正式推薦。`,
              catalyst_summary: 'MLCC / TLVR 電感漲價、交期拉長、AI server 單機用量提升、日系大廠報價上修。',
              thesis_state: 'signal_candidate',
              confidence,
              novelty_score: round(clamp(0.48 + Math.min(0.2, passiveDocs.length * 0.015)), 4),
              evidence_score: round(clamp(directDocs.length > 0 ? 0.4 + Math.min(0.35, directDocs.length * 0.08) : Math.min(0.35, passiveDocs.length * 0.04)), 4),
              timing_score: 0,
              verification_status: directDocs.length > 0 ? '部分證實' : '未證實',
              conditional_recommendation_note: '被動元件/MLCC 題材已進候選池；需通過 bridge、來源引用、籌碼與技術 audit 才能升首頁推薦。',
              source_mix: [
                ...evidenceDocs.slice(0, 4).map((doc) => ({
                  source: String(doc.source_name || doc.source_type || '公開來源'),
                  summary: String(doc.summary || doc.title || ''),
                  sourceType: String(doc.source_type || ''),
                })),
                ...PASSIVE_COMPONENT_MLCC_THEME.externalEvidence.map((item) => ({
                  source: item.sourceName,
                  summary: item.summary,
                  sourceType: 'news',
                })),
              ],
              related_themes: [PASSIVE_COMPONENT_MLCC_THEME.themeKey],
              discovered_at: nowIso(),
              as_of_date: asOfDate,
              updated_at: nowIso(),
            };
          });
          rows.push(...passiveRows);
          for (const discoveryTheme of ADDITIONAL_DISCOVERY_THEMES) {
            const themeDocs = allSocialDocs.filter((doc) => discoveryThemeDocMatches(discoveryTheme, doc));
            if (themeDocs.length === 0) continue;
            const themeStocks = await Promise.all(
              discoveryTheme.symbols.map((item) => ensureStock(item.symbol, 'TW', item.name, item.sector)),
            );
            const themeRows = themeStocks.map((stock, index) => {
              const candidate = discoveryTheme.symbols[index];
              const directDocs = themeDocs.filter((doc) => normalizeSourceDocumentSymbols(doc.symbols).includes(candidate.symbol));
              const evidenceDocs = directDocs.length > 0 ? directDocs : themeDocs;
              const confidence = round(
                clamp(
                  0.3 +
                    Math.min(0.2, evidenceDocs.length * 0.025) +
                    (directDocs.length > 0 ? 0.16 : 0) +
                    mean(evidenceDocs.map((doc) => toFiniteNumber(doc.confidence, 0.42))) * 0.18,
                  0.28,
                  0.74,
                ),
                4,
              );
              return {
                stock_id: stock.id,
                story_type: 'operating_turnaround' as StoryType,
                title: `${candidate.name} ${discoveryTheme.themeName}候選`,
                summary: `${discoveryTheme.themeName} 來源熱度升溫；${candidate.name} 先進候選池，待官方/月營收/毛利率與籌碼技術驗證後才升級正式推薦。`,
                catalyst_summary: `${discoveryTheme.keywords.slice(0, 5).join('、')} 等關鍵詞出現來源命中；需進一步驗證財務 bridge 與進場條件。`,
                thesis_state: 'signal_candidate',
                confidence,
                novelty_score: round(clamp(0.46 + Math.min(0.2, themeDocs.length * 0.015)), 4),
                evidence_score: round(clamp(directDocs.length > 0 ? 0.4 + Math.min(0.35, directDocs.length * 0.08) : Math.min(0.35, themeDocs.length * 0.04)), 4),
                timing_score: 0,
                verification_status: directDocs.length > 0 ? '部分證實' : '未證實',
                conditional_recommendation_note: `${discoveryTheme.themeName} 題材已進候選池；需通過 bridge、來源引用、籌碼與技術 audit 才能升首頁推薦。`,
                source_mix: evidenceDocs.slice(0, 4).map((doc) => ({
                  source: String(doc.source_name || doc.source_type || '公開來源'),
                  summary: String(doc.summary || doc.title || ''),
                  sourceType: String(doc.source_type || ''),
                })),
                related_themes: [discoveryTheme.themeKey],
                discovered_at: nowIso(),
                as_of_date: asOfDate,
                updated_at: nowIso(),
              };
            });
            rows.push(...themeRows);
          }
          const storyKeySet = new Set(rows.map((row) => `${String(row.stock_id || '')}|${String(row.story_type || '')}`));
          for (const basket of GLOBAL_THEME_LEAD_LAG_BASKETS) {
            const leadLagStocks = await Promise.all(
              basket.twMappedSymbols.map((symbol) => {
                const mapped = discoveryNameForSymbol(symbol);
                return ensureStock(symbol, 'TW', mapped.name, mapped.sector);
              }),
            );
            for (const stock of leadLagStocks) {
              const symbol = String(stock.symbol || '');
              const mapped = discoveryNameForSymbol(symbol);
              const key = `${String(stock.id || '')}|valuation_reset`;
              if (!stock.id || storyKeySet.has(key)) continue;
              storyKeySet.add(key);
              rows.push({
                stock_id: stock.id,
                story_type: 'valuation_reset' as StoryType,
                title: `${mapped.name} ${basket.themeName}落後補漲候選`,
                summary: `${basket.themeName} 已建立海外 peer basket；若海外同族群先漲、台股 ${mapped.name} 尚未反映，先列候選追蹤，需等台股月營收、EPS、券商/官方來源與進場 gate 驗證。`,
                catalyst_summary: '海外同族群領漲、台股同供應鏈落後、後續可能由月營收或券商上修補確認。',
                thesis_state: 'signal_candidate',
                confidence: 0.38,
                novelty_score: 0.5,
                evidence_score: basket.sourceRefs.length > 0 ? 0.32 : 0.22,
                timing_score: 0,
                verification_status: '未證實',
                conditional_recommendation_note: '海外 lead-lag 只作 discovery 與重估觸發；未通過 bridge、來源引用、籌碼與技術 audit 前不得升正式推薦。',
                source_mix: [
                  {
                    source: '海外同族群領漲雷達',
                    summary: basket.summary,
                    sourceType: 'industry',
                    foreignPeers: basket.foreignPeers.map((peer) => peer.symbol),
                  },
                ],
                related_themes: [basket.themeKey],
                discovered_at: nowIso(),
                as_of_date: asOfDate,
                updated_at: nowIso(),
              });
            }
          }
          const { error } = await supabaseServer.from('story_candidates').upsert(rows, { onConflict: 'stock_id,story_type,as_of_date' });
          if (error) throw new Error(error.message);
          return {
            outputSummary: `discovered ${rows.length} TW story candidates`,
            findings: rows.map((row) => ({
              stockId: String(row.stock_id || ''),
              findingType: 'story_candidate',
              summary: String(row.title || ''),
              confidence: Number(row.confidence || 0.5),
              evidence: Array.isArray(row.source_mix) ? (row.source_mix as unknown[]) : [],
              sourceRefs: [],
            })),
            result: rows.length,
          };
        },
      );
      await finishAgentRun(runId, 'success', {
        as_of: asOfDate,
        records_written: TW_STORY_RESEARCH_SEEDS.length + PASSIVE_COMPONENT_MLCC_THEME.symbols.length + GLOBAL_THEME_LEAD_LAG_BASKETS.reduce((sum, basket) => sum + basket.twMappedSymbols.length, 0),
        passive_components_mlcc_candidates: PASSIVE_COMPONENT_MLCC_THEME.symbols.length,
        global_lead_lag_candidates: GLOBAL_THEME_LEAD_LAG_BASKETS.reduce((sum, basket) => sum + basket.twMappedSymbols.length, 0),
      });
    }

    return { runId, dryRun, startedRoles, recordsWritten: TW_STORY_RESEARCH_SEEDS.length + PASSIVE_COMPONENT_MLCC_THEME.symbols.length + GLOBAL_THEME_LEAD_LAG_BASKETS.reduce((sum, basket) => sum + basket.twMappedSymbols.length, 0) };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(runId, 'failed', { error: (error as Error).message, as_of: asOfDate }).catch(() => undefined);
    }
    throw error;
  }
}

export async function runStoryVerify(options?: { dryRun?: boolean }): Promise<AgentWorkflowResult> {
  const dryRun = Boolean(options?.dryRun);
  const asOfDate = asIsoDate(nowIso());
  const startedRoles = ['Evidence Verifier Agent'];
  if (dryRun) {
    return { runId: randomUUID(), dryRun, startedRoles, recordsWritten: TW_STORY_RESEARCH_SEEDS.length * 5 };
  }

  const supabaseServer = getSupabaseServerClient();
  const runId = dryRun ? randomUUID() : await startAgentRun('story_verify', { as_of: asOfDate });

  try {
    const [storiesRes, stocksRes, eventsRes, transcriptsRes, revenueRes, fundamentalsRes, instRes, socialRes] = await Promise.all([
      supabaseServer.from('story_candidates').select('*').eq('as_of_date', asOfDate),
      supabaseServer.from('stocks').select('id,symbol'),
      supabaseServer.from('company_events').select('*'),
      supabaseServer.from('conference_transcripts').select('*'),
      supabaseServer.from('revenue_signals').select('*').eq('as_of_date', asOfDate),
      supabaseServer.from('fundamental_snapshots').select('*').eq('as_of_date', asOfDate),
      supabaseServer.from('institutional_signals').select('*').order('source_timestamp', { ascending: false }).limit(50),
      supabaseServer.from('social_signals').select('*').order('source_timestamp', { ascending: false }).limit(100),
    ]);
    if (storiesRes.error || stocksRes.error || eventsRes.error || transcriptsRes.error || revenueRes.error || fundamentalsRes.error || instRes.error || socialRes.error) {
      throw new Error(
        storiesRes.error?.message ||
          stocksRes.error?.message ||
          eventsRes.error?.message ||
          transcriptsRes.error?.message ||
          revenueRes.error?.message ||
          fundamentalsRes.error?.message ||
          instRes.error?.message ||
          socialRes.error?.message ||
          'Failed to verify stories',
      );
    }

    const symbolByStockId = new Map<string, string>(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), String(row.symbol || '')]));
    const storyRows = (storiesRes.data as Row[]) || [];

    if (!dryRun) {
      await runAgentTask(
        runId,
        'Evidence Verifier Agent',
        'story-verify',
        profileKeyForRole('Evidence Verifier Agent'),
        { as_of: asOfDate, story_count: storyRows.length },
        async () => {
          let evidenceCount = 0;
          const reviewQueueItems: AgentReviewRequest[] = [];
          for (const story of storyRows) {
            const stockId = String(story.stock_id || '');
            const symbol = symbolByStockId.get(stockId) || '';

            const eventItems = ((eventsRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId);
            const transcriptItems = ((transcriptsRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId);
            const revenueItems = ((revenueRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId);
            const fundamentalItems = ((fundamentalsRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId);
            const institutionalItems = ((instRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId).slice(0, 1);
            const socialItems = ((socialRes.data as Row[]) || []).filter((row) => String(row.stock_id || '') === stockId).slice(0, 2);

            const evidenceRows = [
              ...eventItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'company',
                source_name: 'company_events',
                source_url: row.source_url || null,
                headline: String(row.headline || ''),
                excerpt: compactText(row.summary),
                stance: 'supporting',
                evidence_strength: 0.83,
                source_timestamp: String(row.event_timestamp || nowIso()),
              })),
              ...transcriptItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'transcript',
                source_name: 'conference_transcripts',
                source_url: row.source_url || null,
                headline: String(row.event_name || ''),
                excerpt: compactText(row.transcript_excerpt),
                stance: 'supporting',
                evidence_strength: 0.8,
                source_timestamp: String(row.event_timestamp || nowIso()),
              })),
              ...revenueItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'financial',
                source_name: 'revenue_signals',
                source_url: row.source_url || null,
                headline: `${symbol} monthly revenue`,
                excerpt: `YoY ${toFiniteNumber(row.yoy_growth).toFixed(1)}%, MoM ${toFiniteNumber(row.mom_growth).toFixed(1)}%`,
                stance: 'supporting',
                evidence_strength: 0.82,
                source_timestamp: nowIso(),
              })),
              ...fundamentalItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'official',
                source_name: 'fundamental_snapshots',
                source_url: row.source_url || null,
                headline: `${symbol} fundamentals snapshot`,
                excerpt: `EPS ${toFiniteNumber(row.eps_ttm).toFixed(1)}, GM ${toFiniteNumber(row.gross_margin).toFixed(1)}%`,
                stance: 'supporting',
                evidence_strength: 0.78,
                source_timestamp: nowIso(),
              })),
              ...institutionalItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'public_research',
                source_name: String(row.source || 'public_research'),
                source_url: null,
                headline: String(row.report_title || story.title || `${symbol} public research`),
                excerpt: compactText(row.thesis_summary),
                stance: 'supporting',
                evidence_strength: 0.74,
                source_timestamp: String(row.source_timestamp || nowIso()),
              })),
              ...institutionalItems
                .filter((row) => toFiniteNumber(row.expectation_score, 0.5) <= 0.35)
                .map((row) => ({
                  story_candidate_id: story.id,
                  stock_id: stockId,
                  evidence_class: 'public_research',
                  source_name: String(row.source || 'public_research'),
                  source_url: null,
                  headline: String(row.report_title || story.title || `${symbol} negative expectation`),
                  excerpt: compactText(row.thesis_summary || '公開研究觀點轉弱，需人工確認是否推翻原 thesis。'),
                  stance: 'contradicting',
                  evidence_strength: clamp(1 - toFiniteNumber(row.expectation_score, 0.2)),
                  source_timestamp: String(row.source_timestamp || nowIso()),
                })),
              ...socialItems.map((row) => ({
                story_candidate_id: story.id,
                stock_id: stockId,
                evidence_class: 'social',
                source_name: String(row.source_name || 'social'),
                source_url: null,
                headline: `${symbol} social chatter`,
                excerpt: compactText(row.summary),
                stance: 'supporting',
                evidence_strength: clamp(toFiniteNumber(row.confidence, 0.5)),
                source_timestamp: String(row.source_timestamp || nowIso()),
              })),
              ...socialItems
                .filter((row) => String(row.sentiment_label || '').toLowerCase() === 'bearish' && toFiniteNumber(row.confidence, 0) >= 0.6)
                .map((row) => ({
                  story_candidate_id: story.id,
                  stock_id: stockId,
                  evidence_class: 'social',
                  source_name: String(row.source_name || 'social'),
                  source_url: row.source_url || null,
                  headline: `${symbol} bearish social contradiction`,
                  excerpt: compactText(row.summary || '社群出現高信度看空訊號，與主論點矛盾。'),
                  stance: 'contradicting',
                  evidence_strength: clamp(toFiniteNumber(row.confidence, 0.65)),
                  source_timestamp: String(row.source_timestamp || nowIso()),
                })),
              ...revenueItems
                .filter((row) => toFiniteNumber(row.yoy_growth, 0) < 0)
                .map((row) => ({
                  story_candidate_id: story.id,
                  stock_id: stockId,
                  evidence_class: 'financial',
                  source_name: 'revenue_signals',
                  source_url: row.source_url || null,
                  headline: `${symbol} monthly revenue slowdown`,
                  excerpt: `YoY ${toFiniteNumber(row.yoy_growth).toFixed(1)}%, MoM ${toFiniteNumber(row.mom_growth).toFixed(1)}%`,
                  stance: 'contradicting',
                  evidence_strength: clamp(Math.min(1, Math.abs(toFiniteNumber(row.yoy_growth, 0)) / 40)),
                  source_timestamp: nowIso(),
                })),
            ];

            const { error: deleteError } = await supabaseServer.from('story_evidence_items').delete().eq('story_candidate_id', story.id);
            if (deleteError) throw new Error(deleteError.message);
            if (evidenceRows.length > 0) {
              const { error: insertError } = await supabaseServer.from('story_evidence_items').insert(evidenceRows);
              if (insertError) throw new Error(insertError.message);
            }

            const outcome = determineStoryVerificationOutcome(evidenceRows as Row[]);
            const { error: updateError } = await supabaseServer
              .from('story_candidates')
              .update({
                thesis_state: outcome.nextState,
                evidence_score: outcome.evidenceScore,
                verification_status: outcome.verificationStatus,
                conditional_recommendation_note: outcome.note,
                updated_at: nowIso(),
              })
              .eq('id', story.id);
            if (updateError) throw new Error(updateError.message);
            for (const item of outcome.reviewQueueItems) {
              reviewQueueItems.push({
                reason: item.reason,
                evidence: {
                  ...item.evidence,
                  story_candidate_id: String(story.id || ''),
                  stock_id: stockId,
                  symbol,
                  governance: outcome.governance,
                },
              });
            }
            evidenceCount += evidenceRows.length;
          }

          return {
            outputSummary: `verified ${storyRows.length} stories with ${evidenceCount} evidence items`,
            findings: storyRows.map((story) => ({
              stockId: String(story.stock_id || ''),
              findingType: 'story_verification',
              summary: `verified evidence for ${symbolByStockId.get(String(story.stock_id || '')) || 'unknown'}`,
              confidence: Number(story.evidence_score || 0.7),
              evidence: [],
              sourceRefs: [],
            })),
            reviewQueueItems,
            result: evidenceCount,
          };
        },
      );
      await finishAgentRun(runId, 'success', { as_of: asOfDate, records_written: storyRows.length });
    }

    return { runId, dryRun, startedRoles, recordsWritten: storyRows.length };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(runId, 'failed', { error: (error as Error).message, as_of: asOfDate }).catch(() => undefined);
    }
    throw error;
  }
}

export async function runThesisRank(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const now = new Date();
  const nowIsoValue = now.toISOString();
  const asOf = asIsoDate(nowIsoValue);
  const runId = randomUUID();
  const agentRunId = dryRun ? randomUUID() : await startAgentRun('thesis_rank', { as_of: asOf });

  if (dryRun) {
    return {
      asOf,
      written: TW_STORY_RESEARCH_SEEDS.length,
      blocked: 0,
      runId,
      dryRun,
      agentRunId,
      startedRoles: ['Fundamental Impact Agent'],
    };
  }

  const supabaseServer = getSupabaseServerClient();

  const insiderSinceIso = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
  const sourceMentionSinceIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [storiesRes, stocksRes, signalsRes, marketRes, revenueRes, fundamentalsRes, socialRes, valuationRes, brokerRes, thesisRes, insiderRes, mentionsRes, technicalFeaturesRes, priorStagesRes] = await Promise.all([
    supabaseServer.from('story_candidates').select('*').eq('as_of_date', asOf),
    supabaseServer.from('stocks').select('*'),
    supabaseServer.from('stock_signals').select('*').order('as_of', { ascending: false }).limit(300),
    supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
    supabaseServer.from('revenue_signals').select('*').eq('as_of_date', asOf),
    supabaseServer.from('fundamental_snapshots').select('*').eq('as_of_date', asOf),
    supabaseServer.from('social_signals').select('*').order('source_timestamp', { ascending: false }).limit(200),
    supabaseServer.from('valuation_cases').select('stock_id,case_type,target_price,updated_at').order('updated_at', { ascending: false }).limit(2000),
    supabaseServer.from('broker_report_documents').select('stock_id,target_price,report_date,updated_at,source_mode').in('source_mode', [...AUTHORIZED_BROKER_SOURCE_MODES]).order('report_date', { ascending: false }).limit(1000),
    supabaseServer.from('thesis_models').select('stock_id,target_price_low,target_price_high,confidence,as_of_date,updated_at').order('as_of_date', { ascending: false }).limit(1000),
    supabaseServer
      .from('source_raw_documents')
      .select('platform,symbols,sentiment_label,confidence,metadata,collected_at')
      .eq('platform', 'twse_insider')
      .gte('collected_at', insiderSinceIso)
      .order('collected_at', { ascending: false })
      .limit(1500),
    supabaseServer.from('candidate_source_mentions').select('*').gte('available_at', sourceMentionSinceIso).order('available_at', { ascending: false }).limit(10000),
    supabaseServer.from('technical_feature_snapshots').select('*').order('session_date', { ascending: false }).limit(3000),
    supabaseServer.from('candidate_daily_stage_snapshots').select('id,stock_id,session_date,lifecycle_stage,hard_gate_results').lt('session_date', asOf).order('session_date', { ascending: false }).limit(3000),
  ]);

  if (storiesRes.error || stocksRes.error || signalsRes.error || marketRes.error || revenueRes.error || fundamentalsRes.error || socialRes.error || valuationRes.error || brokerRes.error || thesisRes.error || insiderRes.error || mentionsRes.error || technicalFeaturesRes.error || priorStagesRes.error) {
    throw new Error(
      storiesRes.error?.message ||
        stocksRes.error?.message ||
        signalsRes.error?.message ||
        marketRes.error?.message ||
        revenueRes.error?.message ||
        fundamentalsRes.error?.message ||
        valuationRes.error?.message ||
        brokerRes.error?.message ||
        thesisRes.error?.message ||
        insiderRes.error?.message ||
        mentionsRes.error?.message ||
        technicalFeaturesRes.error?.message ||
        priorStagesRes.error?.message ||
        socialRes.error?.message ||
        'Failed to load thesis ranking sources',
    );
  }

  const stockMap = new Map<string, Row>(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), row]));
  const latestSignals = new Map<string, Row>();
  for (const row of (signalsRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (stockId && !latestSignals.has(stockId)) {
      latestSignals.set(stockId, row);
    }
  }
  const revenueByStock = new Map<string, Row>(((revenueRes.data as Row[]) || []).map((row) => [String(row.stock_id || ''), row]));
  const fundamentalsByStock = new Map<string, Row>(((fundamentalsRes.data as Row[]) || []).map((row) => [String(row.stock_id || ''), row]));
  const socialByStock = new Map<string, Row[]>();
  for (const row of (socialRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId) continue;
    const current = socialByStock.get(stockId) || [];
    socialByStock.set(stockId, [...current, row]);
  }
  const mentionsByStock = new Map<string, Row[]>();
  for (const row of (mentionsRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId) continue;
    mentionsByStock.set(stockId, [...(mentionsByStock.get(stockId) || []), row]);
  }
  const technicalFeaturesByStock = new Map<string, Row>();
  const technicalSessionDatesByStock = new Map<string, string[]>();
  for (const row of (technicalFeaturesRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (stockId && !technicalFeaturesByStock.has(stockId)) technicalFeaturesByStock.set(stockId, row);
    const sessionDate = String(row.session_date || '');
    if (!stockId || !sessionDate) continue;
    const sessionDates = technicalSessionDatesByStock.get(stockId) || [];
    if (!sessionDates.includes(sessionDate)) sessionDates.push(sessionDate);
    technicalSessionDatesByStock.set(stockId, sessionDates);
  }
  const priorStageByStock = new Map<string, Row>();
  for (const row of (priorStagesRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (stockId && !priorStageByStock.has(stockId)) priorStageByStock.set(stockId, row);
  }
  const valuationByStock = new Map<string, { baseTarget: number | null; upsideTarget: number | null }>();
  for (const row of (valuationRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId) continue;
    const target = toFiniteNumber(row.target_price, 0);
    if (!(target > 0)) continue;
    const current = valuationByStock.get(stockId) || { baseTarget: null, upsideTarget: null };
    const caseType = String(row.case_type || '');
    if (caseType === 'base' && current.baseTarget == null) current.baseTarget = target;
    if (caseType === 'upside' && current.upsideTarget == null) current.upsideTarget = target;
    valuationByStock.set(stockId, current);
  }

  const brokerByStock = new Map<string, { targetPrice: number; reportDate: string | null }>();
  const brokerFreshnessDays = Number(process.env.BROKER_REPORT_MAX_AGE_DAYS || 120);
  const brokerFreshnessMs = brokerFreshnessDays * 24 * 60 * 60 * 1000;
  for (const row of (brokerRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId || brokerByStock.has(stockId)) continue;
    const targetPrice = toFiniteNumber(row.target_price, 0);
    if (!(targetPrice > 0)) continue;
    const reportDate = row.report_date ? String(row.report_date) : null;
    if (reportDate) {
      const reportMs = new Date(reportDate).getTime();
      if (Number.isFinite(reportMs) && Date.now() - reportMs > brokerFreshnessMs) continue;
    }
    brokerByStock.set(stockId, { targetPrice, reportDate });
  }

  const thesisByStock = new Map<string, { baseTarget: number | null; confidence: number | null; valuationQuality: ValuationQuality; scenarioDriverType: ScenarioDriverType }>();
  for (const row of (thesisRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId || thesisByStock.has(stockId)) continue;
    const low = toFiniteNumber(row.target_price_low, 0);
    const high = toFiniteNumber(row.target_price_high, 0);
    const baseTarget = low > 0 && high > 0 ? round((low + high) / 2, 2) : low > 0 ? low : high > 0 ? high : null;
    if (baseTarget == null) continue;
    const metadata = (row.metadata as Row | undefined) || {};
    thesisByStock.set(stockId, {
      baseTarget,
      confidence: row.confidence == null ? null : toFiniteNumber(row.confidence, 0),
      valuationQuality: ((metadata.valuation_quality as ValuationQuality | undefined) || 'financial_proxy') as ValuationQuality,
      scenarioDriverType: ((metadata.scenario_driver_type as ScenarioDriverType | undefined) || 'financial_proxy') as ScenarioDriverType,
    });
  }

  const twMarket = (marketRes.data?.[0] as Row | undefined) || null;
  const rawMarketRegime = String(((twMarket?.index_state as Row | undefined) || {}).regime || 'unknown');
  const marketRegime: MarketRiskRegime = ['risk_on', 'selective', 'risk_off', 'breakdown'].includes(rawMarketRegime)
    ? rawMarketRegime as MarketRiskRegime
    : 'unknown';
  const symbolByStockId = new Map<string, string>();
  const stockIdBySymbol = new Map<string, string>();
  for (const [stockId, row] of stockMap.entries()) {
    const symbol = String(row.symbol || '');
    symbolByStockId.set(stockId, symbol);
    if (symbol) stockIdBySymbol.set(symbol, stockId);
  }
  const insiderByStock = new Map<string, number[]>();
  for (const row of (insiderRes.data as Row[]) || []) {
    const symbols = Array.isArray(row.symbols) ? (row.symbols as unknown[]).map(String) : [];
    const confidence = clamp(toFiniteNumber(row.confidence, 0.6));
    const metadata = (row.metadata as Row | undefined) || {};
    const deltaHolding = toFiniteNumber(metadata.delta_holding, 0);
    const sentiment = String(row.sentiment_label || 'neutral');
    const directional =
      sentiment === 'bullish'
        ? 0.78
        : sentiment === 'bearish'
          ? 0.35
          : deltaHolding > 0
            ? 0.74
            : deltaHolding < 0
              ? 0.4
              : 0.52;
    const insiderScore = round(clamp(confidence * 0.6 + directional * 0.4), 4);
    for (const symbol of symbols) {
      const stockId = stockIdBySymbol.get(symbol);
      if (!stockId) continue;
      const list = insiderByStock.get(stockId) || [];
      list.push(insiderScore);
      insiderByStock.set(stockId, list);
    }
  }

  if (!dryRun) {
    await supabaseServer.from('pipeline_runs').insert({
      id: runId,
      run_type: 'recommendation',
      status: 'running',
      details: { step: 'story-thesis-ranking', as_of: asOf },
    });
  }

  try {
    let written = 0;
    let blocked = 0;
    let findingsWritten = 0;
    const stories = (storiesRes.data as Row[]) || [];

    const work = async () => {
      for (const story of stories) {
        const stockId = String(story.stock_id || '');
        const stock = stockMap.get(stockId);
        const signal = latestSignals.get(stockId);
        if (!stock || !signal) continue;

        const storySeed = TW_STORY_RESEARCH_SEEDS.find((seed) => seed.symbol === String(stock.symbol || ''));
        const evidenceScore = clamp(toFiniteNumber(story.evidence_score, 0.5));
        const revenue = revenueByStock.get(stockId);
        const fundamentals = fundamentalsByStock.get(stockId);
        const socialRows = socialByStock.get(stockId) || [];
        const marketScore = ({ risk_on: 0.85, selective: 0.55, risk_off: 0.2, breakdown: 0, unknown: 0 } as const)[marketRegime];
        const revenueYoy = revenue?.yoy_growth == null ? null : toFiniteNumber(revenue.yoy_growth, Number.NaN);
        const revenueScore = revenueYoy != null && Number.isFinite(revenueYoy) ? clamp((revenueYoy / 50) * 0.5 + 0.5) : 0;
        const peRatio = fundamentals?.pe_ratio == null ? null : toFiniteNumber(fundamentals.pe_ratio, Number.NaN);
        const valuationRelief = peRatio != null && Number.isFinite(peRatio) && peRatio > 0
          ? clamp(1 - Math.min(peRatio / 40, 1) + 0.35)
          : 0;
        const communitySignalScore = round(
          clamp(
            mean(
              socialRows.map((row) =>
                toFiniteNumber(row.confidence, 0.5) * communityWeightForSource(sourceTypeFromName(row.source_type, row.source_name)),
              ),
            ),
            0,
            0.35,
          ),
          4,
        );
        const sourcePriorityScore = round(
          clamp(
            mean(
              socialRows.map((row) => {
                const sourceType = sourceTypeFromName(row.source_type, row.source_name);
                return toFiniteNumber(row.confidence, 0.5) * sourcePriorityWeight(sourceType, row.source_name);
              }),
            ),
            0,
            1,
          ),
          4,
        );
        const technicalScore = clamp(
          (toFiniteNumber(signal.price) >= toFiniteNumber(signal.ma_short, toFiniteNumber(signal.price)) ? 0.3 : 0.1) +
            (toFiniteNumber(signal.ma_short) >= toFiniteNumber(signal.ma_mid) ? 0.25 : 0.1) +
            (toFiniteNumber(signal.rsi, 50) >= 48 && toFiniteNumber(signal.rsi, 50) <= 72 ? 0.2 : 0.05) +
            (toFiniteNumber(signal.macd) >= toFiniteNumber(signal.macd_signal) ? 0.25 : 0.1),
        );
        const timingScore = round(clamp(technicalScore * 0.7 + marketScore * 0.3), 4);
        const insiderSignalScore = round(
          clamp(
            mean(insiderByStock.get(stockId) || []),
            0,
            1,
          ),
          4,
        );
        const score = round(
          clamp(
            evidenceScore * 0.29 +
              revenueScore * 0.1 +
              valuationRelief * 0.1 +
              timingScore * 0.16 +
              sourcePriorityScore * 0.27 +
              insiderSignalScore * 0.08,
          ),
          4,
        );
        const confidence = round(clamp(score * 0.92 + evidenceScore * 0.08), 4);
        const latestEvidenceAt = socialRows
          .map((row) => row.source_timestamp || row.ingested_at || null)
          .filter((item): item is string => Boolean(item))
          .sort()
          .at(-1) || String(story.updated_at || story.as_of_date || nowIsoValue);
        const evidenceAgeHours = round(Math.max(0, (Date.now() - new Date(latestEvidenceAt).getTime()) / (1000 * 60 * 60)), 2);

        const isBlocked = String(signal.freshness_status || 'missing') !== 'fresh' || String(twMarket?.freshness_status || 'missing') !== 'fresh';
        const storyStateRaw = String(story.thesis_state || 'signal_candidate');
        const storyState = storyStateRaw === 'review' || storyStateRaw === 'rejected'
          ? storyStateRaw
          : normalizeRecommendationState(storyStateRaw);
        const recommendationState =
          storyState === 'review' || storyState === 'rejected'
            ? 'signal_candidate'
            : storyState === 'validated_thesis'
              ? recommendationStateFromVerification(evidenceScore, timingScore, isBlocked)
              : storyState;
        const conditionalRecommendationNote =
          storyState === 'review'
            ? '偵測到矛盾證據，已送人工覆核；在 review 完成前不升級為正式推薦。'
            : buildConditionalRecommendationNote(recommendationState);

        const blockReason = isBlocked
          ? String(signal.freshness_status || 'missing') !== 'fresh'
            ? 'stock signal stale'
            : 'market snapshot stale'
          : null;
        const price = toFiniteNumber(signal.price);
        const valuationCase = valuationByStock.get(stockId) || null;
        const brokerValuation = brokerByStock.get(stockId) || null;
        const thesisValuation = thesisByStock.get(stockId) || null;

        let valuationSource: ValuationSource = 'missing';
        let valuationConfidence: number | null = null;
        let baseTarget: number | null = null;
        let upsideTarget: number | null = null;
        let isFallbackValuation = false;
        let valuationQuality: ValuationQuality = 'fallback_proxy';
        let scenarioDriverType: ScenarioDriverType = 'unknown';

        if ((valuationCase?.baseTarget || 0) > 0) {
          valuationSource = 'valuation_cases';
          valuationConfidence = 0.8;
          baseTarget = valuationCase?.baseTarget || null;
          upsideTarget = valuationCase?.upsideTarget || valuationCase?.baseTarget || null;
          valuationQuality = 'story_modeled';
          scenarioDriverType = 'story_tam';
        } else if ((brokerValuation?.targetPrice || 0) > 0) {
          valuationSource = 'broker_report';
          valuationConfidence = 0.68;
          baseTarget = brokerValuation?.targetPrice || null;
          upsideTarget = brokerValuation?.targetPrice || null;
          valuationQuality = 'broker_anchored';
          scenarioDriverType = 'broker_target';
        } else if ((thesisValuation?.baseTarget || 0) > 0) {
          valuationSource = 'thesis_model';
          valuationConfidence = thesisValuation?.confidence ?? 0.6;
          baseTarget = thesisValuation?.baseTarget || null;
          upsideTarget = thesisValuation?.baseTarget || null;
          valuationQuality = thesisValuation?.valuationQuality || 'financial_proxy';
          scenarioDriverType = thesisValuation?.scenarioDriverType || 'financial_proxy';
        } else {
          valuationSource = 'missing';
          valuationConfidence = 0;
          isFallbackValuation = true;
          valuationQuality = 'fallback_proxy';
          scenarioDriverType = 'fallback_proxy';
        }
        if (baseTarget && !upsideTarget) {
          upsideTarget = round(
            baseTarget *
              (valuationQuality === 'broker_anchored'
                ? 1.08
                : valuationQuality === 'story_modeled'
                  ? 1.14
                  : valuationQuality === 'financial_proxy'
                    ? 1.09
                    : 1.05),
            2,
          );
        }
        if (baseTarget && upsideTarget && upsideTarget < baseTarget) {
          upsideTarget = round(baseTarget * (valuationQuality === 'story_modeled' ? 1.12 : 1.06), 2);
        }

        const rawExpectedUpsidePct = baseTarget && price > 0 ? round(((baseTarget - price) / price) * 100, 2) : null;
        const valuationEligible = valuationSource !== 'missing' && (baseTarget || 0) > price && (rawExpectedUpsidePct || 0) > 0;
        const reviewRequired = storyState === 'review' || storyState === 'rejected';
        const canonicalEvidenceMissing = storyState === 'partially_verified' && isFormalRecommendationState(recommendationState);
        const socialOnlyEvidence = storyState === 'signal_candidate' && evidenceScore >= 0.35;
        const finalRecommendationState = reviewRequired
          ? 'signal_candidate'
          : valuationEligible
            ? recommendationState
          : evidenceScore >= 0.35
            ? 'partially_verified'
            : 'signal_candidate';
        const finalVerificationStatus = verificationStatusFromState(finalRecommendationState);
        const sourceSignalPresentation = sourceSignalPresentationFromRows(socialRows, finalVerificationStatus, timingScore);
        const finalAction: RecommendationCard['action'] = finalRecommendationState === 'actionable_setup' ? 'buy' : 'watch';
        const expectedUpsidePct = valuationEligible ? rawExpectedUpsidePct : null;
        const stopLoss = round(price * (finalRecommendationState === 'actionable_setup' ? 0.93 : 0.95), 2);
        const whyNotRecommended =
          reviewRequired
            ? 'review_required'
            : canonicalEvidenceMissing
              ? 'canonical_evidence_missing'
              : socialOnlyEvidence
                ? 'social_only_evidence'
                : valuationSource === 'missing'
            ? 'valuation_missing'
            : (baseTarget || 0) <= price
              ? 'base_target_below_price'
              : expectedUpsidePct == null
                ? 'non_positive_upside'
                : null;
        const finalIsBlocked = isBlocked || !valuationEligible || reviewRequired || canonicalEvidenceMissing || socialOnlyEvidence;
        const finalBlockReason = isBlocked ? blockReason : whyNotRecommended;

        if (!dryRun) {
          const recRes = await supabaseServer
            .from('recommendations')
            .upsert(
              {
                stock_id: stockId,
                as_of: asOf,
                market_scope: 'TW_PRIMARY',
                score,
                confidence,
                action: finalAction,
                rationale: `story=${String(story.story_type || '')} evidence=${evidenceScore.toFixed(2)} timing=${timingScore.toFixed(2)} revenue=${revenueScore.toFixed(2)} valuation=${valuationRelief.toFixed(2)} insider=${insiderSignalScore.toFixed(2)}`,
                signal_breakdown: {
                  evidence: evidenceScore,
                  timing: timingScore,
                  revenue: revenueScore,
                  valuation: valuationRelief,
                  market: marketScore,
                  community: communitySignalScore,
                  source_priority_score: sourcePriorityScore,
                  source_signal_badges: sourceSignalPresentation.sourceSignalBadges,
                  source_signal_summary: sourceSignalPresentation.sourceSignalSummary,
                  social_mention_stats: sourceSignalPresentation.socialMentionStats,
                  evidence_age_hours: evidenceAgeHours,
                  last_validated_at: String(story.updated_at || nowIsoValue),
                  insider: insiderSignalScore,
                  valuation_source: valuationSource,
                  valuation_confidence: valuationConfidence,
                  valuation_quality: valuationQuality,
                  scenario_driver_type: scenarioDriverType,
                  is_fallback_valuation: isFallbackValuation,
                  current_price: price,
                  base_target: baseTarget,
                  upside_target: upsideTarget,
                  why_not_recommended: whyNotRecommended,
                },
                is_blocked: finalIsBlocked,
                block_reason: finalBlockReason,
                published_at: finalIsBlocked ? null : nowIsoValue,
                recommendation_state: finalRecommendationState,
                story_type: story.story_type,
                thesis_title: story.title || storySeed?.thesisTitle || null,
                thesis_summary: story.summary || storySeed?.thesisSummary || null,
                catalyst_summary: story.catalyst_summary || storySeed?.catalystSummary || null,
                expected_upside_pct: expectedUpsidePct,
                evidence_score: evidenceScore,
                timing_score: timingScore,
                community_signal_score: communitySignalScore,
                verification_status: finalVerificationStatus,
                conditional_recommendation_note: buildConditionalRecommendationNote(finalRecommendationState),
              },
              { onConflict: 'stock_id,as_of' },
            )
            .select('id')
            .single();
          if (recRes.error || !recRes.data) throw new Error(recRes.error?.message || 'Failed writing thesis recommendation');

          await supabaseServer.from('strategy_actions').upsert(
            {
              recommendation_id: recRes.data.id,
              entry_rule:
                finalRecommendationState === 'actionable_setup'
                  ? `Scale in while price holds above MA5 (${toFiniteNumber(signal.ma_short, price).toFixed(2)}) and theme heat remains positive`
                  : 'Wait for evidence confirmation and technical alignment before committing full size',
              position_size_rule:
                finalRecommendationState === 'actionable_setup'
                  ? 'Initial 8-12% portfolio, add on catalyst confirmation'
                  : finalRecommendationState === 'validated_thesis'
                    ? 'Pilot position only after confirmation candle'
                    : 'No position yet; keep on radar',
              target_price: valuationEligible ? (finalRecommendationState === 'actionable_setup' ? (upsideTarget ?? baseTarget) : baseTarget) : null,
              stop_loss: stopLoss,
              review_horizon: finalRecommendationState === 'actionable_setup' ? '1-3 months' : 'Review every 3 trading days',
              state: finalRecommendationState === 'actionable_setup' && valuationEligible ? 'active' : 'invalidated',
              state_changed_at: nowIsoValue,
              updated_at: nowIsoValue,
            },
            { onConflict: 'recommendation_id' },
          );

          const storyId = String(story.id || '');
          const valuationRows = [
            {
              story_candidate_id: storyId,
              stock_id: stockId,
              case_type: 'base',
              target_price: baseTarget,
              expected_return_pct: expectedUpsidePct,
              assumptions: {
                source: valuationSource,
                confidence: valuationConfidence,
                price,
                why_not_recommended: whyNotRecommended,
              },
              updated_at: nowIsoValue,
            },
            {
              story_candidate_id: storyId,
              stock_id: stockId,
              case_type: 'upside',
              target_price: upsideTarget ?? baseTarget,
              expected_return_pct: upsideTarget && price > 0 ? round(((upsideTarget - price) / price) * 100, 2) : expectedUpsidePct,
              assumptions: {
                source: valuationSource,
                confidence: valuationConfidence,
                price,
                why_not_recommended: whyNotRecommended,
              },
              updated_at: nowIsoValue,
            },
            {
              story_candidate_id: storyId,
              stock_id: stockId,
              case_type: 'invalidation',
              target_price: stopLoss,
              expected_return_pct: price > 0 ? round(((stopLoss - price) / price) * 100, 2) : null,
              assumptions: {
                source: 'risk_control',
                price,
              },
              updated_at: nowIsoValue,
            },
          ];
          if (valuationRows.length > 0) {
            const { error: valuationError } = await supabaseServer.from('valuation_cases').upsert(valuationRows, { onConflict: 'story_candidate_id,case_type' });
            if (valuationError) throw new Error(valuationError.message);
          }

          const mentionRows = mentionsByStock.get(stockId) || [];
          const recentMentionCutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const recentMentions = mentionRows.filter((row) => new Date(String(row.mentioned_at || row.available_at || '')).getTime() >= recentMentionCutoff);
          const olderMentions = mentionRows.filter((row) => new Date(String(row.mentioned_at || row.available_at || '')).getTime() < recentMentionCutoff);
          const independentHashes = new Set(recentMentions.map((row) => String(row.independent_content_hash || row.source_url || '')).filter(Boolean));
          const mentionPlatforms = new Set(recentMentions.map((row) => String(row.platform || '')).filter(Boolean));
          const latestMentionMs = Math.max(0, ...recentMentions.map((row) => new Date(String(row.mentioned_at || row.available_at || '')).getTime()).filter(Number.isFinite));
          const discussionBurst = olderMentions.length > 0
            ? Math.min(100, (recentMentions.length / 7) / Math.max(0.01, olderMentions.length / 23) * 50)
            : Math.min(100, recentMentions.length * 20);
          const sourceReliability = mean(recentMentions.map((row) => toFiniteNumber(row.confidence, 0)));
          const financialFields = [revenue?.monthly_revenue, revenue?.yoy_growth, fundamentals?.eps_ttm, fundamentals?.pe_ratio, fundamentals?.pb_ratio];
          const financialCompleteness = financialFields.filter((value) => value != null && Number.isFinite(Number(value))).length / financialFields.length * 100;
          const feature = technicalFeaturesByStock.get(stockId) || null;
          const featureNumber = (key: string): number | null => {
            if (feature?.[key] == null) return null;
            const value = Number(feature[key]);
            return Number.isFinite(value) ? value : null;
          };
          const technicalClose = featureNumber('close');
          const technicalMa20 = featureNumber('ma20');
          const technicalMa60 = featureNumber('ma60');
          const technicalMa120 = featureNumber('ma120');
          const technicalMa240 = featureNumber('ma240');
          const technicalAtr14 = featureNumber('atr14');
          const technicalRsi14 = featureNumber('rsi14');
          const technicalVolumeRatio = featureNumber('volume_ratio_20_median');
          const technicalMa60Slope = featureNumber('ma60_slope');
          const trendAligned = technicalClose != null && technicalMa20 != null && technicalMa60 != null
            && technicalClose > technicalMa20 && technicalClose > technicalMa60 && technicalMa20 > technicalMa60
            && technicalMa60Slope != null && technicalMa60Slope >= 0;
          const breakoutLong = technicalClose != null && technicalVolumeRatio != null && technicalVolumeRatio >= 1.3
            && ((technicalMa240 != null && technicalClose > technicalMa240) || (technicalMa240 == null && technicalMa120 != null && technicalClose > technicalMa120));
          const baseUpsidePct = baseTarget && price > 0 ? round(((baseTarget - price) / price) * 100, 2) : null;
          const bearDownsidePct = stopLoss && price > 0 ? round(((stopLoss - price) / price) * 100, 2) : null;
          const rewardRiskRatio = baseTarget && stopLoss < price && price > 0 ? round((baseTarget - price) / (price - stopLoss), 3) : null;
          const baseInput = {
            discovery: {
              independentSources: Math.min(100, independentHashes.size / 3 * 100),
              platformDiversity: Math.min(100, mentionPlatforms.size / 3 * 100),
              discussionBurst,
              recency: latestMentionMs > 0 ? Math.max(0, 100 - (Date.now() - latestMentionMs) / (7 * 24 * 60 * 60 * 1000) * 100) : 0,
              sourceReliability,
            },
            research: {
              valuationMarginOfSafety: baseUpsidePct == null ? 0 : Math.max(0, Math.min(100, baseUpsidePct / 25 * 100)),
              financialBridge: financialCompleteness,
              officialEvidenceAndCounterEvidence: evidenceScore * 100,
              brokerEvidence: brokerValuation ? 80 : 0,
              industryRotation: timingScore * 100,
              overseasPeers: 0,
            },
            actionability: {
              movingAveragesAndRelativeStrength: trendAligned || breakoutLong ? 100 : technicalClose != null && technicalMa20 != null && technicalClose > technicalMa20 ? 45 : 0,
              priceVolume: technicalVolumeRatio == null ? 0 : Math.min(100, technicalVolumeRatio / 1.3 * 100),
              institutionalFlows: featureNumber('institutional_flow_20d_norm') == null ? 0 : Math.max(0, Math.min(100, 50 + Number(feature?.institutional_flow_20d_norm) * 50)),
              marketRegime: ({ risk_on: 100, selective: 60, risk_off: 20, breakdown: 0, unknown: 0 } as const)[marketRegime],
              industryRotation: timingScore * 100,
              overseasPeers: 0,
              overheatRisk: technicalRsi14 == null || technicalAtr14 == null || technicalMa20 == null || technicalClose == null
                ? 0
                : technicalRsi14 < 75 && technicalClose <= technicalMa20 + 2 * technicalAtr14 ? 100 : 0,
            },
            confidence: {
              completeness: ([baseTarget, upsideTarget, stopLoss, technicalMa20, technicalMa60, fundamentals?.eps_ttm, revenue?.monthly_revenue]
                .filter((value) => value != null && Number.isFinite(Number(value))).length / 7) * 100,
              freshness: isBlocked ? 0 : 100,
              traceability: valuationSource === 'valuation_cases' ? 90 : valuationSource === 'broker_report' ? 80 : valuationSource === 'thesis_model' ? 60 : 0,
              crossSourceConsistency: Math.min(100, mentionPlatforms.size / 3 * 100),
            },
            valuation: {
              hasBearBaseBull: Boolean(stopLoss > 0 && baseTarget && upsideTarget),
              baseUpsidePct,
              rewardRiskRatio,
              hasMaterialOfficialCounterEvidence: reviewRequired,
            },
            technical: {
              close: technicalClose,
              ma20: technicalMa20,
              ma60: technicalMa60,
              ma120: technicalMa120,
              ma240: technicalMa240,
              ma60Slope: technicalMa60Slope,
              volumeRatio20Median: technicalVolumeRatio,
              atr14: technicalAtr14,
              rsi14: technicalRsi14,
              breakoutAboveLongMa: breakoutLong,
            },
            marketRegime,
            peerCatchdownBlock: Boolean(feature?.peer_catchdown_block),
            staleOrFallback: isBlocked || isFallbackValuation || !feature,
            previousStage: (priorStageByStock.get(stockId)?.lifecycle_stage as 'found' | 'waiting' | 'actionable' | undefined) || null,
          };
          const preStreakEvaluation = classifyCandidateStage({ ...baseInput, consecutiveActionableCloses: 2 });
          const actionableEligiblePreStreak = preStreakEvaluation.stage === 'actionable';
          const priorHardGates = (priorStageByStock.get(stockId)?.hard_gate_results as Row | undefined) || {};
          const technicalSessionDates = technicalSessionDatesByStock.get(stockId) || [];
          const technicalSessionDate = technicalSessionDates[0] || null;
          const expectedPreviousTechnicalSessionDate = technicalSessionDates[1] || null;
          const consecutiveActionableCloses = advanceActionableCloseStreak({
            eligibleThisRun: actionableEligiblePreStreak,
            currentTechnicalSessionDate: technicalSessionDate,
            previousTechnicalSessionDate: priorHardGates.technical_session_date ? String(priorHardGates.technical_session_date) : null,
            expectedPreviousTechnicalSessionDate,
            previousEligible: priorHardGates.actionable_eligible_pre_streak === true,
            previousConsecutiveCloses: toFiniteNumber(priorHardGates.consecutive_actionable_closes, 0),
          });
          const stageResult = classifyCandidateStage({ ...baseInput, consecutiveActionableCloses });
          const snapshotRes = await supabaseServer.from('candidate_daily_stage_snapshots').upsert({
            stock_id: stockId,
            session_date: asOf,
            lifecycle_stage: stageResult.stage,
            discovery_score: stageResult.scores.discovery,
            research_score: stageResult.scores.research,
            actionability_score: stageResult.scores.actionability,
            data_confidence_score: stageResult.scores.dataConfidence,
            base_upside_pct: baseUpsidePct,
            bear_downside_pct: bearDownsidePct,
            reward_risk_ratio: rewardRiskRatio,
            market_regime: marketRegime,
            hard_gate_results: {
              technical_passed: stageResult.technicalHardGatePassed,
              actionable_eligible_pre_streak: actionableEligiblePreStreak,
              consecutive_actionable_closes: consecutiveActionableCloses,
              technical_session_date: technicalSessionDate,
              stale_or_fallback: baseInput.staleOrFallback,
              peer_catchdown_block: baseInput.peerCatchdownBlock,
            },
            unmet_conditions: stageResult.unmetConditions,
            promotion_reasons: stageResult.promotionReasons,
            as_of: nowIsoValue,
            available_at: nowIsoValue,
            ruleset_version: STAGE_RULESET_VERSION,
            model_version: 'candidate-stage-v2.0.0',
            provenance: { recommendation_id: recRes.data.id, story_candidate_id: storyId },
          }, { onConflict: 'stock_id,session_date,ruleset_version,model_version' }).select('id').single();
          if (snapshotRes.error || !snapshotRes.data) throw new Error(snapshotRes.error?.message || 'Failed writing lifecycle snapshot');
          const previousStage = priorStageByStock.get(stockId)?.lifecycle_stage ? String(priorStageByStock.get(stockId)?.lifecycle_stage) : null;
          if (previousStage !== stageResult.stage) {
            const { error: eventError } = await supabaseServer.from('candidate_stage_events').upsert({
              stock_id: stockId,
              from_stage: previousStage,
              to_stage: stageResult.stage,
              reason_codes: stageResult.promotionReasons.length > 0 ? stageResult.promotionReasons : stageResult.unmetConditions,
              consecutive_sessions_passed: consecutiveActionableCloses,
              as_of: nowIsoValue,
              available_at: nowIsoValue,
              ruleset_version: STAGE_RULESET_VERSION,
              snapshot_id: snapshotRes.data.id,
            }, { onConflict: 'stock_id,snapshot_id,to_stage', ignoreDuplicates: true });
            if (eventError) throw new Error(eventError.message);
          }

          if (stopLoss > 0 && baseTarget && upsideTarget && price > 0) {
            const sector = String(stock.sector || '').toLowerCase();
            const primaryMethod = sector.includes('financial') || sector.includes('bank') ? 'forward_pb'
              : sector.includes('memory') || sector.includes('cyclical') ? 'normalized_pe'
                : 'forward_pe';
            const { error: snapshotError } = await supabaseServer.from('valuation_snapshots').insert({
              stock_id: stockId,
              valuation_horizon_months: 12,
              primary_method: primaryMethod,
              cross_check_method: null,
              current_price: price,
              historical_pe_percentile: null,
              historical_pb_percentile: null,
              bear_target: stopLoss,
              base_target: baseTarget,
              bull_target: upsideTarget,
              probability_weighted_target: round(stopLoss * 0.25 + baseTarget * 0.5 + upsideTarget * 0.25, 2),
              base_upside_pct: baseUpsidePct,
              bear_downside_pct: bearDownsidePct,
              reward_risk_ratio: rewardRiskRatio,
              earnings_bridge: { financial_completeness: financialCompleteness },
              assumption_ledger: [{ source: valuationSource, confidence: valuationConfidence }],
              catalysts: story.catalyst_summary ? [story.catalyst_summary] : [],
              invalidation_conditions: [stopLoss],
              as_of: nowIsoValue,
              available_at: nowIsoValue,
              provenance: { recommendation_id: recRes.data.id, story_candidate_id: storyId },
              model_version: 'valuation-v2.0.0',
            });
            if (snapshotError) throw new Error(snapshotError.message);
          }

          const persistedStoryState: StoryThesisState =
            storyState === 'review' || storyState === 'rejected'
              ? storyState
              : finalRecommendationState === 'actionable_setup'
                ? 'actionable_setup'
                : storyState;
          const { error: storyUpdateError } = await supabaseServer
            .from('story_candidates')
            .update({
              thesis_state: persistedStoryState,
              evidence_score: evidenceScore,
              timing_score: timingScore,
              verification_status: verificationStatusFromStoryState(persistedStoryState),
              conditional_recommendation_note: conditionalRecommendationNote,
              updated_at: nowIsoValue,
            })
            .eq('id', storyId);
          if (storyUpdateError) throw new Error(storyUpdateError.message);
        }

        findingsWritten += 1;
        if (finalIsBlocked) blocked += 1;
        written += 1;
      }

      return findingsWritten;
    };

    if (!dryRun) {
      await runAgentTask(
        agentRunId,
        'Fundamental Impact Agent',
        'thesis-rank',
        profileKeyForRole('Fundamental Impact Agent'),
        { as_of: asOf, universe: 'TWSE_TPEX' },
        async () => {
          const result = await work();
          return {
            outputSummary: `ranked ${result} thesis records`,
            findings: stories.map((story) => ({
              stockId: String(story.stock_id || ''),
              findingType: 'thesis_rank',
              summary: String(story.title || ''),
              confidence: Number(story.evidence_score || 0.6),
              evidence: [],
              sourceRefs: [],
            })),
            result,
          };
        },
      );
      await finishAgentRun(agentRunId, 'success', { as_of: asOf, records_written: written });
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: { written, blocked, as_of: asOf, dry_run: false, recommendation_model: 'hybrid_judge' },
          finished_at: nowIsoValue,
        })
        .eq('id', runId);
    } else {
      await work();
    }

    return { asOf, written, blocked, runId, dryRun, agentRunId };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(agentRunId, 'failed', { error: (error as Error).message, as_of: asOf }).catch(() => undefined);
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: { as_of: asOf, dry_run: false, error: (error as Error).message },
          finished_at: nowIso(),
        })
        .eq('id', runId);
    }
    throw error;
  }
}

export async function runReportBuild(options?: { dryRun?: boolean }): Promise<AgentWorkflowResult> {
  const dryRun = Boolean(options?.dryRun);
  const asOfDate = asIsoDate(nowIso());
  const startedRoles = ['Research Editor Agent'];
  if (dryRun) {
    return { runId: randomUUID(), dryRun, startedRoles, recordsWritten: fallbackResearchMemos().length };
  }

  const supabaseServer = getSupabaseServerClient();
  const runId = dryRun ? randomUUID() : await startAgentRun('report_build', { as_of: asOfDate });
  let reportBuildMeta: Record<string, unknown> | undefined;

  try {
    const [dailyThemesRes, threeDayThemesRes, recsRes, storiesRes, stocksRes] = await Promise.all([
      supabaseServer.from('theme_heat').select('*').eq('window_type', 'daily').eq('as_of_date', asOfDate).order('heat_score', { ascending: false }).limit(10),
      supabaseServer.from('theme_heat').select('*').eq('window_type', 'three_day').eq('as_of_date', asOfDate).order('heat_score', { ascending: false }).limit(10),
      supabaseServer.from('recommendations').select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)').eq('as_of', asOfDate).eq('market_scope', 'TW_PRIMARY').order('score', { ascending: false }).limit(10),
      supabaseServer.from('story_candidates').select('*').eq('as_of_date', asOfDate),
      supabaseServer.from('stocks').select('id,symbol,name'),
    ]);
    if (dailyThemesRes.error || threeDayThemesRes.error || recsRes.error || storiesRes.error || stocksRes.error) {
      throw new Error(dailyThemesRes.error?.message || threeDayThemesRes.error?.message || recsRes.error?.message || storiesRes.error?.message || stocksRes.error?.message || 'Failed to load report sources');
    }

    const stockMap = new Map<string, Row>(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), row]));
    const topRecs = ((recsRes.data as Row[]) || []).map(mapRecommendation);
    const topDailyThemes = ((dailyThemesRes.data as Row[]) || []).map(mapThemeHeatRow);
    const topThreeDayThemes = ((threeDayThemesRes.data as Row[]) || []).map(mapThemeHeatRow);
    const stories = (storiesRes.data as Row[]) || [];
    const storyByStockId = new Map<string, Row>();
    for (const story of stories) {
      const stockId = String(story.stock_id || '');
      if (stockId && !storyByStockId.has(stockId)) storyByStockId.set(stockId, story);
    }
    const stockIdBySymbol = new Map<string, string>();
    for (const [stockId, stock] of stockMap.entries()) {
      const symbol = String(stock.symbol || '');
      if (symbol) stockIdBySymbol.set(symbol, stockId);
    }
    const recommendationIds = topRecs.map((rec) => rec.recommendationId).filter(Boolean);
    const storyIdsForSymbols = (symbols: string[]) =>
      unique(
        symbols
          .map((symbol) => stockIdBySymbol.get(symbol))
          .map((stockId) => (stockId ? storyByStockId.get(stockId) : null))
          .filter((story): story is Row => Boolean(story))
          .map((story) => String(story.id || ''))
          .filter(Boolean),
      );

    if (!dryRun) {
      await runAgentTask(
        runId,
        'Research Editor Agent',
        'report-build',
        profileKeyForRole('Research Editor Agent'),
        { as_of: asOfDate, top_recommendations: topRecs.length, daily_themes: topDailyThemes.length, hot_themes: topThreeDayThemes.length },
        async () => {
          const memoCandidates: ResearchMemoCandidate[] = [];
          const pushMemoCandidate = (
            row: Record<string, unknown>,
            meta?: Partial<Pick<ResearchMemoCandidate, 'recommendationState' | 'evidenceScore' | 'sourceUpdatedAt'>>,
          ) => {
            const slug = String(row.slug || '');
            if (!slug) return;
            memoCandidates.push({
              row,
              slug,
              reportKind: String(row.report_kind || ''),
              title: String(row.title || ''),
              recommendationState: meta?.recommendationState ?? (row.recommendation_state ? normalizeRecommendationState(row.recommendation_state) : null),
              evidenceScore: meta?.evidenceScore ?? null,
              sourceUpdatedAt: meta?.sourceUpdatedAt ?? (row.updated_at ? String(row.updated_at) : null),
              index: memoCandidates.length,
            });
          };

          pushMemoCandidate({
            report_kind: 'daily_radar',
            title: `StockInsider 每日雷達 ${asOfDate}`,
            slug: `daily-radar-${asOfDate}`,
            summary: '每日台股故事雷達，整合主題熱度、條件式推薦與可執行進場標的。',
            memo_markdown: [
              '# 每日雷達',
              '',
              '## 市場最熱的故事群',
              ...topDailyThemes.slice(0, 3).map((theme) => `- ${theme.themeName}: 熱度 ${theme.heatScore.toFixed(2)} / 驗證 ${theme.verificationStatus} / 股票 ${theme.relatedSymbols.join(', ')}`),
              '',
              '## 推薦重點',
              ...topRecs.slice(0, 5).map((rec) => `- ${rec.symbol}: ${rec.thesisTitle || rec.rationale} / ${rec.verificationStatus || '未證實'}`),
            ].join('\n'),
            recommendation_state: null,
            catalyst_calendar: [],
            entry_exit_rules: {
              traceability: {
                route: '/api/radar/daily',
                windowType: 'daily',
                recommendationIds: recommendationIds.slice(0, 5),
                storyCandidateIds: storyIdsForSymbols(topRecs.slice(0, 5).map((rec) => rec.symbol)),
                canonicalStates: [...new Set(topRecs.slice(0, 5).map((rec) => rec.recommendationState || 'signal_candidate'))],
              },
            },
            related_symbols: topRecs.slice(0, 5).map((rec) => rec.symbol),
            updated_at: nowIso(),
          });

          pushMemoCandidate({
            report_kind: 'weekly_conviction',
            title: `StockInsider 每週高信念清單 ${asOfDate}`,
            slug: `weekly-conviction-${asOfDate}`,
            summary: '聚焦未來一到三個月的台股高信念故事型機會。',
            memo_markdown: [
              '# 每週高信念清單',
              '',
              ...topRecs
                .filter((rec) => rec.recommendationState === 'actionable_setup')
                .slice(0, 5)
                .map((rec) => `- ${rec.symbol}: 上行 ${rec.expectedUpsidePct?.toFixed(1) || '-'}%, 催化 ${rec.catalystSummary || '-'}`),
            ].join('\n'),
            recommendation_state: 'actionable_setup',
            catalyst_calendar: [],
            entry_exit_rules: {
              traceability: {
                route: '/api/radar/weekly',
                windowType: 'weekly',
                recommendationIds: topRecs
                  .filter((rec) => rec.recommendationState === 'actionable_setup')
                  .slice(0, 5)
                  .map((rec) => rec.recommendationId),
                storyCandidateIds: storyIdsForSymbols(
                  topRecs
                    .filter((rec) => rec.recommendationState === 'actionable_setup')
                    .slice(0, 5)
                    .map((rec) => rec.symbol),
                ),
              },
            },
            related_symbols: topRecs.filter((rec) => rec.recommendationState === 'actionable_setup').slice(0, 5).map((rec) => rec.symbol),
            updated_at: nowIso(),
          });

          for (const theme of topThreeDayThemes.slice(0, 3)) {
            pushMemoCandidate({
              report_kind: 'hot_theme',
              title: `${theme.themeName} 主題摘要 ${asOfDate}`,
              slug: `theme-${theme.themeKey}-${asOfDate}`,
              summary: `${theme.themeName} 是目前台股最熱且持續被追蹤的故事群之一。`,
              memo_markdown: [`# ${theme.themeName}`, '', `熱度分數: ${theme.heatScore.toFixed(2)}`, '', `關聯股票: ${theme.relatedSymbols.join(', ')}`].join('\n'),
              recommendation_state: null,
              catalyst_calendar: [],
              entry_exit_rules: {
                traceability: {
                  route: '/api/radar/hot',
                  windowType: 'three_day',
                  themeKey: theme.themeKey,
                  storyCandidateIds: storyIdsForSymbols(theme.relatedSymbols),
                  relatedSymbols: theme.relatedSymbols,
                },
              },
              related_symbols: theme.relatedSymbols,
              updated_at: nowIso(),
            });
          }

          for (const story of stories) {
            const stock = stockMap.get(String(story.stock_id || ''));
            if (!stock) continue;
            pushMemoCandidate(
              {
              stock_id: story.stock_id,
              story_candidate_id: story.id,
              report_kind: 'deep_dive',
              title: `${String(stock.symbol || '')} 深度分析`,
              slug: `deep-dive-${slugify(String(stock.symbol || 'unknown'))}-${asOfDate}`,
              summary: compactText(story.summary),
              memo_markdown: [
                `# ${String(stock.symbol || '')} 深度分析`,
                '',
                `- 題材類型: ${STORY_TYPE_LABELS[(story.story_type as StoryType | undefined) || 'valuation_reset']}`,
                `- 驗證狀態: ${RECOMMENDATION_STATE_LABELS[normalizeRecommendationState(story.thesis_state)]}`,
                `- 催化重點: ${String(story.catalyst_summary || '-')}`,
                '',
                compactText(story.summary),
              ].join('\n'),
              recommendation_state: normalizeRecommendationState(story.thesis_state),
              catalyst_calendar: [{ label: 'Next review', date: asOfDate }],
              entry_exit_rules: {
                traceability: {
                  route: `/stock/${String(stock.symbol || '')}`,
                  windowType: 'deep_dive',
                  storyCandidateIds: [String(story.id || '')],
                  recommendationIds: topRecs.filter((rec) => rec.symbol === String(stock.symbol || '')).map((rec) => rec.recommendationId),
                },
              },
              related_symbols: [String(stock.symbol || '')],
              updated_at: nowIso(),
              },
              {
                recommendationState: normalizeRecommendationState(story.thesis_state),
                evidenceScore: toNumber(story.evidence_score),
                sourceUpdatedAt: story.updated_at ? String(story.updated_at) : null,
              },
            );
          }

          const dedupeStats = dedupeResearchMemoCandidates(memoCandidates);
          reportBuildMeta = {
            rawMemoRows: dedupeStats.rawMemoRows,
            dedupedMemoRows: dedupeStats.dedupedMemoRows,
            droppedDuplicateCount: dedupeStats.droppedDuplicateCount,
            dedupedSlugs: dedupeStats.dedupedSlugs,
            duplicateSlugSamples: dedupeStats.duplicateSlugSamples,
          };

          const { error } = await supabaseServer.from('research_memos').upsert(dedupeStats.rows, { onConflict: 'slug' });
          if (error) throw new Error(error.message);
          return {
            outputSummary:
              dedupeStats.droppedDuplicateCount > 0
                ? `generated ${dedupeStats.dedupedMemoRows} research memos after deduping ${dedupeStats.droppedDuplicateCount} duplicate memo rows`
                : `generated ${dedupeStats.dedupedMemoRows} research memos`,
            findings: dedupeStats.rows.map((row) => ({
              stockId: row.stock_id ? String(row.stock_id) : null,
              findingType: 'research_memo',
              summary: String(row.title || ''),
              confidence: 0.8,
              evidence: [],
              sourceRefs: [],
            })),
            result: reportBuildMeta,
          };
        },
      );
      await finishAgentRun(runId, 'success', { as_of: asOfDate });
    }

    return {
      runId,
      dryRun,
      startedRoles,
      recordsWritten: Number(reportBuildMeta?.dedupedMemoRows || topRecs.length + topDailyThemes.length + topThreeDayThemes.length + stories.length + 2),
      meta: reportBuildMeta,
    };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(runId, 'failed', { error: (error as Error).message, as_of: asOfDate }).catch(() => undefined);
    }
    throw error;
  }
}

export async function runDeepDiveBuild(options?: { dryRun?: boolean; symbol?: string }): Promise<AgentWorkflowResult> {
  const dryRun = Boolean(options?.dryRun);
  const symbol = options?.symbol?.toUpperCase();
  const startedRoles = ['Research Editor Agent', 'Technical Timing Agent'];
  const runId = dryRun ? randomUUID() : await startAgentRun('deep_dive_build', { symbol: symbol || 'all' });

  try {
    if (!dryRun) {
      const stockDeepDive = symbol ? await getStockDeepDive(symbol) : null;
      await runAgentTask(
        runId,
        'Technical Timing Agent',
        'deep-dive-build',
        profileKeyForRole('Technical Timing Agent'),
        { symbol: symbol || 'all' },
        async () => ({
          outputSummary: stockDeepDive ? `validated deep dive timing for ${stockDeepDive.symbol}` : 'no-op deep dive build',
          findings: stockDeepDive
            ? [
                {
                  stockId: null,
                  findingType: 'deep_dive_timing',
                  summary: `${stockDeepDive.symbol} timing score ${stockDeepDive.timingScore?.toFixed(2) || '-'}`,
                  confidence: stockDeepDive.timingScore || 0.6,
                  evidence: [],
                  sourceRefs: [],
                },
              ]
            : [],
          result: stockDeepDive ? 1 : 0,
        }),
      );
      await finishAgentRun(runId, 'success', { symbol: symbol || 'all' });
    }

    return { runId, dryRun, startedRoles, recordsWritten: symbol ? 1 : 0 };
  } catch (error) {
    if (!dryRun) {
      await finishAgentRun(runId, 'failed', { error: (error as Error).message, symbol: symbol || 'all' }).catch(() => undefined);
    }
    throw error;
  }
}

type RecommendationStepStatus = {
  step: string;
  status: 'success' | 'failed' | 'timeout';
  durationMs: number;
  error?: string;
};

export async function runRecommendationBatch(options?: { dryRun?: boolean; timeoutMs?: number }) {
  const dryRun = Boolean(options?.dryRun);
  const timeoutMs = options?.timeoutMs || Number(process.env.RECOMMENDATION_BATCH_TIMEOUT_MS || (dryRun ? 90_000 : 18_000));
  const startedAt = Date.now();
  const stepStatus: RecommendationStepStatus[] = [];

  async function runStep<T>(step: string, work: () => Promise<T>) {
    const stepStartedAt = Date.now();
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => {
        const err = new Error(`recommendation step '${step}' timed out after ${timeoutMs}ms`) as Error & {
          timedOut?: boolean;
          failedStep?: string;
          stepStatus?: RecommendationStepStatus[];
          durationMs?: number;
        };
        err.timedOut = true;
        err.failedStep = step;
        err.durationMs = Date.now() - startedAt;
        stepStatus.push({ step, status: 'timeout', durationMs: Date.now() - stepStartedAt, error: err.message });
        err.stepStatus = [...stepStatus];
        reject(err);
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([work(), timeoutPromise]);
      stepStatus.push({ step, status: 'success', durationMs: Date.now() - stepStartedAt });
      return result as T;
    } catch (error) {
      const err = error as Error & {
        timedOut?: boolean;
        failedStep?: string;
        stepStatus?: RecommendationStepStatus[];
        durationMs?: number;
      };
      if (!err.timedOut) {
        stepStatus.push({ step, status: 'failed', durationMs: Date.now() - stepStartedAt, error: err.message });
        err.failedStep = step;
        err.durationMs = Date.now() - startedAt;
        err.stepStatus = [...stepStatus];
      }
      throw err;
    }
  }

  const theme = await runStep('theme_scan', () => runThemeScan({ dryRun }));
  const story = await runStep('story_scan', () => runStoryScan({ dryRun }));
  const verify = await runStep('story_verify', () => runStoryVerify({ dryRun }));
  const thesis = await runStep('thesis_rank', () => runThesisRank({ dryRun }));
  const report = await runStep('report_build', () => runReportBuild({ dryRun }));

  return {
    ...thesis,
    timedOut: false,
    durationMs: Date.now() - startedAt,
    stepStatus,
    startedRoles: Array.from(new Set([...theme.startedRoles, ...story.startedRoles, ...verify.startedRoles, 'Fundamental Impact Agent', ...report.startedRoles])),
    workflow: {
      themeScanRunId: theme.runId,
      storyScanRunId: story.runId,
      storyVerifyRunId: verify.runId,
      reportBuildRunId: report.runId,
      thesisAgentRunId: thesis.agentRunId,
    },
  };
}

export async function bindLinePreference(input: LinePreference & { userId?: string }) {
  if (!isValidLineUserId(input.lineUserId)) {
    throw new Error('lineUserId format invalid, expected LINE user id like Uxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx');
  }

  const supabaseServer = getSupabaseServerClient();
  const defaultPreferences = {
    hit_target: true,
    hit_stop_loss: true,
    state_changed: true,
    daily_digest: true,
  };

  const payload = {
    user_id: input.userId || null,
    line_user_id: input.lineUserId,
    watchlist: (input.watchlist || []).map((symbol) => symbol.toUpperCase()),
    event_preferences: { ...defaultPreferences, ...(input.eventPreferences || {}) },
    digest_enabled: input.digestEnabled,
    throttle_minutes: input.throttleMinutes,
    updated_at: nowIso(),
  };

  const { data, error } = await supabaseServer
    .from('line_subscriptions')
    .upsert(payload, { onConflict: 'line_user_id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function dispatchLineEvents(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) {
    return { sent: 0, skipped: 0, failed: 0, attempts: 0, runId: randomUUID(), dryRun };
  }

  const supabaseServer = getSupabaseServerClient();
  const runId = randomUUID();
  const pendingRes = await supabaseServer
    .from('line_alert_events')
    .select('id,event_type,payload')
    .eq('delivery_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);
  if (pendingRes.error) throw new Error(pendingRes.error.message);

  const subscriptionsRes = await supabaseServer.from('line_subscriptions').select('*');
  if (subscriptionsRes.error) throw new Error(subscriptionsRes.error.message);

  const subscriptions = (subscriptionsRes.data as Row[]) || [];
  const now = nowIso();
  let sent = 0;
  let skipped = 0;
  let failed = 0;
  let attempts = 0;

  if (!dryRun) {
    await supabaseServer.from('pipeline_runs').insert({
      id: runId,
      run_type: 'line_dispatch',
      status: 'running',
      details: { step: 'started' },
    });
  }

  try {
    const lineClient = dryRun ? null : getLineClient();

    for (const event of (pendingRes.data as Row[]) || []) {
      const eventId = String(event.id || '');
      const eventType = String(event.event_type || '');
      const payload = ((event.payload as Row | undefined) || {});
      const symbol = payload.symbol ? String(payload.symbol).toUpperCase() : null;
      const message = renderLineMessage(event);

      const receivers = subscriptions.filter((sub) => shouldDeliver(sub, eventType, symbol));
      if (receivers.length === 0) {
        if (!dryRun) {
          await supabaseServer
            .from('line_alert_events')
            .update({ delivery_status: 'skipped', sent_at: now, payload: { ...payload, dispatch_result: { reason: 'no_eligible_subscribers' } } })
            .eq('id', eventId);
        }
        skipped += 1;
        continue;
      }

      const validReceivers = receivers.filter((receiver) => isValidLineUserId(String(receiver.line_user_id || '')));
      const invalidReceivers = receivers.filter((receiver) => !isValidLineUserId(String(receiver.line_user_id || '')));

      if (validReceivers.length === 0) {
        if (!dryRun) {
          await supabaseServer
            .from('line_alert_events')
            .update({
              delivery_status: 'skipped',
              sent_at: now,
              payload: {
                ...payload,
                dispatch_result: {
                  reason: 'invalid_line_user_id',
                  receiver_count: receivers.length,
                  delivered: 0,
                  failed: 0,
                  skipped_invalid: invalidReceivers.length,
                  invalid_receivers: invalidReceivers.map((receiver) => maskLineUserId(String(receiver.line_user_id || ''))),
                  errors: [],
                  error_summary: 'all eligible subscriptions have invalid line_user_id',
                },
              },
            })
            .eq('id', eventId);
        }
        skipped += 1;
        continue;
      }

      let delivered = 0;
      const errors: Array<{ receiver: string; status: number | null; reason: string; details: unknown }> = [];

      for (const receiver of validReceivers) {
        attempts += 1;
        if (dryRun) {
          delivered += 1;
          continue;
        }

        try {
          await lineClient!.pushMessage(String(receiver.line_user_id || ''), { type: 'text', text: message });
          delivered += 1;
        } catch (error) {
          const parsed = parseLineError(error);
          errors.push({
            receiver: maskLineUserId(String(receiver.line_user_id || '')),
            status: parsed.status,
            reason: parsed.reason,
            details: parsed.details,
          });
        }
      }

      const nextStatus = delivered === 0 ? 'failed' : 'sent';
      if (!dryRun) {
        await supabaseServer
          .from('line_alert_events')
          .update({
            delivery_status: nextStatus,
            sent_at: now,
            payload: {
              ...payload,
              dispatch_result: {
                receiver_count: receivers.length,
                delivered,
                failed: validReceivers.length - delivered,
                skipped_invalid: invalidReceivers.length,
                invalid_receivers: invalidReceivers.map((receiver) => maskLineUserId(String(receiver.line_user_id || ''))),
                errors,
                error_summary: errors[0]?.reason || null,
              },
            },
          })
          .eq('id', eventId);
      }

      if (nextStatus === 'sent') {
        sent += 1;
      } else {
        failed += 1;
      }
    }

    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: { sent, skipped, failed, attempts, dry_run: false },
          finished_at: now,
        })
        .eq('id', runId);
    }

    return { sent, skipped, failed, attempts, runId, dryRun };
  } catch (error) {
    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: { dry_run: false, error: (error as Error).message },
          finished_at: nowIso(),
        })
        .eq('id', runId);
    }
    throw error;
  }
}

export async function runDynamicMentionScan(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, symbolsFound: 0, signalsWritten: 0 };

  const supabase = getSupabaseServerClient();
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [mentionsRes, stocksRes] = await Promise.all([
    supabase.from('candidate_source_mentions').select('stock_id,stance,platform').gte('available_at', sevenDaysAgo).limit(10000),
    supabase.from('stocks').select('id,symbol').eq('market', 'TW').limit(10000),
  ]);
  if (mentionsRes.error || stocksRes.error) throw new Error(mentionsRes.error?.message || stocksRes.error?.message || 'candidate mention scan failed');
  const symbolByStockId = new Map(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), String(row.symbol || '')]));

  const mentionMap = new Map<string, { count: number; bullish: number; bearish: number; platforms: Set<string> }>();

  function recordMention(sym: string, sentiment: string | null, platform?: string) {
    if (!mentionMap.has(sym)) mentionMap.set(sym, { count: 0, bullish: 0, bearish: 0, platforms: new Set() });
    const entry = mentionMap.get(sym)!;
    entry.count += 1;
    if (sentiment === 'bullish') entry.bullish += 1;
    if (sentiment === 'bearish') entry.bearish += 1;
    if (platform) entry.platforms.add(platform);
  }

  for (const mention of (mentionsRes.data as Row[]) || []) {
    const symbol = symbolByStockId.get(String(mention.stock_id || '')) || '';
    if (!symbol) continue;
    const stance = String(mention.stance || 'neutral');
    recordMention(symbol, stance === 'positive' ? 'bullish' : stance === 'negative' ? 'bearish' : 'neutral', String(mention.platform || 'unknown'));
  }

  const today = asIsoDate(nowIso());
  let signalsWritten = 0;
  const candidates = [...mentionMap.entries()].filter(([, data]) => data.count >= 3);
  const failures: string[] = [];

  for (const [symbol, data] of candidates) {
    try {
      const stock = await ensureStock(symbol, 'TW', symbol, null);
      const sentiment = data.bullish > data.bearish ? 'bullish' : data.bearish > data.bullish ? 'bearish' : 'neutral';
      const confidence = Math.min(0.6, 0.2 + data.count * 0.05);
      const { error } = await supabase.from('social_signals').upsert(
        {
          stock_id: stock.id,
          source_type: 'community_scan',
          source_name: '社群動態掃描',
          source_key: `community_scan.${symbol}.${today}`,
          sentiment_label: sentiment,
          confidence,
          mention_count: data.count,
          summary: `社群近7天提及 ${data.count} 次（平台：${[...data.platforms].join('、') || 'unknown'}）`,
          source_url: 'https://www.ptt.cc/bbs/Stock/',
          ingested_at: nowIso(),
          freshness_status: 'fresh',
        },
        { onConflict: 'source_key' },
      );
      if (error) throw new Error(error.message);
      signalsWritten += 1;
    } catch (error) {
      failures.push(`${symbol}:${(error as Error).message}`);
    }
  }

  if (failures.length > 0) {
    throw new Error(`dynamic_mention_partial_failure:${failures.slice(0, 10).join('|')}`);
  }

  return { runId: randomUUID(), dryRun, symbolsFound: candidates.length, signalsWritten };
}

export async function runRevenueIngestion(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, revenueRecords: 0, fundamentalRecords: 0 };

  const supabase = getSupabaseServerClient();
  const today = asIsoDate(nowIso());
  const now = new Date();
  // Current month for MOPS
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1; // 1-based; MOPS reports previous month ~10th of month
  const revenueMonth = month === 1 ? 12 : month - 1;
  const revenueYear = month === 1 ? year - 1 : year;

  // Fetch all tracked TW stocks
  const { data: stocksData } = await supabase.from('stocks').select('id,symbol,market').eq('market', 'TW');
  const stocks = (stocksData || []) as Array<{ id: string; symbol: string; market: string }>;

  let revenueRecords = 0;
  let fundamentalRecords = 0;

  // Fetch MOPS monthly revenue (public API)
  try {
    const mopsRes = await fetch(
      `https://mops.twse.com.tw/api/v1/monthlyrevenue/list?market=sii&year=${revenueYear}&month=${revenueMonth}`,
      { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(20_000) },
    );
    if (mopsRes.ok) {
      const mopsJson = await mopsRes.json() as { data?: Array<{ company_id?: string; revenue?: string; yoy_growth?: string; mom_growth?: string }> };
      const mopsMap = new Map<string, { revenue: number; yoy: number; mom: number }>();
      for (const row of (mopsJson.data || [])) {
        const sym = String(row.company_id || '');
        const revenue = nullIfMissingMetric(row.revenue);
        if (sym && revenue != null) {
          mopsMap.set(sym, {
            revenue,
            yoy: row.yoy_growth == null || row.yoy_growth === '' ? Number.NaN : Number(row.yoy_growth),
            mom: row.mom_growth == null || row.mom_growth === '' ? Number.NaN : Number(row.mom_growth),
          });
        }
      }

      for (const stock of stocks) {
        const mops = mopsMap.get(stock.symbol);
        const twRevenue = !mops ? await fetchTwStockRevenue(stock.symbol).catch(() => null) : null;
        const monthlyRevenue = mops?.revenue ?? twRevenue?.revenue ?? null;
        if (monthlyRevenue == null) continue;
        await supabase.from('revenue_signals').upsert(
          {
            stock_id: stock.id,
            as_of_date: mops ? `${revenueYear}-${String(revenueMonth).padStart(2, '0')}-01` : String(twRevenue?.asOfDate || ''),
            monthly_revenue: monthlyRevenue,
            yoy_growth: mops && Number.isFinite(mops.yoy) ? mops.yoy : null,
            mom_growth: mops && Number.isFinite(mops.mom) ? mops.mom : null,
            source_url: mops
              ? 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs'
              : `https://www.twse.com.tw/zh/announcement/revenue.html?stockNo=${stock.symbol}`,
          },
          { onConflict: 'stock_id,as_of_date' },
        );
        revenueRecords += 1;
      }
    }
  } catch {
    // non-blocking: MOPS might not be available outside TW market hours
  }

  // Official TWSE/TPEx values only. Missing margin fields remain null.
  for (const stock of stocks.slice(0, 40)) {
    try {
      const [twValues, twEps] = await Promise.all([
        fetchTwStockValues(stock.symbol).catch(() => null),
        fetchTwStockEpsTtm(stock.symbol).catch(() => null),
      ]);
      const epsTtm = twEps?.epsTtm ?? null;
      const peRatio = twValues?.peRatio ?? null;
      const pbRatio = twValues?.pbRatio ?? null;
      const revenueRunRate = null;
      if ([epsTtm, peRatio, pbRatio, revenueRunRate].every((value) => value == null)) continue;
      await supabase.from('fundamental_snapshots').upsert(
        {
          stock_id: stock.id,
          as_of_date: today,
          eps_ttm: epsTtm,
          gross_margin: null,
          operating_margin: null,
          pe_ratio: peRatio,
          pb_ratio: pbRatio,
          revenue_run_rate: revenueRunRate,
          source_url: `https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html?stockNo=${stock.symbol}`,
        },
        { onConflict: 'stock_id,as_of_date' },
      );
      fundamentalRecords += 1;
    } catch {
      // skip individual stock errors
    }
  }

  return { runId: randomUUID(), dryRun, revenueRecords, fundamentalRecords };
}

export async function runPipelineFlow(options?: { dryRun?: boolean; skipIngestion?: boolean; mode?: 'core' | 'full' }) {
  const dryRun = Boolean(options?.dryRun);
  const skipIngestion = Boolean(options?.skipIngestion);
  const mode = options?.mode || (dryRun ? 'full' : 'core');
  const startedAt = Date.now();
  const stepStatus: Array<{ step: string; status: 'success' | 'failed' | 'skipped'; durationMs: number; error?: string }> = [];
  const pipelineRunId = randomUUID();
  const supabaseServer = dryRun ? null : getSupabaseServerClient();

  if (supabaseServer) {
    await supabaseServer.from('pipeline_runs').insert({
      id: pipelineRunId,
      run_type: 'pipeline',
      status: 'running',
      details: { mode, step: 'started' },
    });
  }

  async function executeStep<T>(step: string, work: () => Promise<T>, shouldSkip = false, fallbackValue?: T): Promise<T> {
    const stepStartedAt = Date.now();
    if (shouldSkip) {
      stepStatus.push({ step, status: 'skipped', durationMs: Date.now() - stepStartedAt });
      return fallbackValue as T;
    }
    try {
      const result = await work();
      stepStatus.push({ step, status: 'success', durationMs: Date.now() - stepStartedAt });
      return result;
    } catch (error) {
      const err = error as Error;
      stepStatus.push({ step, status: 'failed', durationMs: Date.now() - stepStartedAt, error: err.message });
      throw error;
    }
  }
  async function executeNonCriticalStep<T>(
    step: string,
    work: () => Promise<T>,
    fallbackValue: T,
    shouldSkip = false,
    terminalFailure?: (result: T) => string | null,
  ): Promise<T> {
    const stepStartedAt = Date.now();
    if (shouldSkip) {
      stepStatus.push({ step, status: 'skipped', durationMs: Date.now() - stepStartedAt });
      return fallbackValue;
    }
    try {
      const result = await work();
      const failure = terminalFailure?.(result) || null;
      if (failure) {
        stepStatus.push({ step, status: 'failed', durationMs: Date.now() - stepStartedAt, error: failure });
        return result;
      }
      stepStatus.push({ step, status: 'success', durationMs: Date.now() - stepStartedAt });
      return result;
    } catch (error) {
      stepStatus.push({ step, status: 'failed', durationMs: Date.now() - stepStartedAt, error: (error as Error).message });
      return fallbackValue;
    }
  }
  try {
    // The scheduled core cycle is candidate-first and already acquires official
    // price, chip, earnings, revenue and valuation inputs per candidate. Keep
    // the legacy fixed-seed ingestion only in the manual full recovery mode so
    // it cannot consume the 19:00 candidate research window.
    const shouldRunIngestion = mode === 'full' && !skipIngestion;
    const ingestion = await executeStep(
      'ingestion',
      async () => runIngestionBatch({ dryRun }),
      !shouldRunIngestion,
      { asOf: asIsoDate(nowIso()), snapshots: 0, stockSignals: 0, institutionalSignals: 0, socialSignals: 0, runId: 'skip-ingestion', dryRun },
    );

    if (!dryRun && skipIngestion && mode === 'full') {
      const ingestionState = await getLatestIngestionState();
      if (!ingestionState.ok) {
        throw new Error(`ingestion precheck failed: ${ingestionState.reason}`);
      }
    }

    const dynamicMentionScan = await executeStep(
      'dynamic_mention_scan',
      async () => runDynamicMentionScan({ dryRun }),
      mode !== 'full',
      { runId: 'skip-dynamic-mention-scan', dryRun, symbolsFound: 0, signalsWritten: 0 },
    );
    const revenueIngestion = await executeStep(
      'revenue_ingestion',
      async () => runRevenueIngestion({ dryRun }),
      mode !== 'full',
      { runId: 'skip-revenue-ingestion', dryRun, revenueRecords: 0, fundamentalRecords: 0 },
    );

    const candidateResearch = await executeStep(
      'candidate_research',
      async () => {
        const result = await runCandidateResearchCycle({
          dryRun,
          pipelineRunId,
          seedSymbols: TW_STORY_RESEARCH_SEEDS.map((seed) => ({ symbol: seed.symbol, name: seed.name, market: seed.market, sector: seed.sector })),
        });
        if (!dryRun && (result.blocked || result.failedCount > 0 || result.partialCount > 0)) {
          throw new Error(`candidate_research_prerequisite_failed:${result.terminalReason || 'partial_or_failed_items'}`);
        }
        return result;
      },
    );

    const recommendationFallback = {
      asOf: asIsoDate(nowIso()), written: 0, blocked: 0, runId: pipelineRunId,
      dryRun: false as const, agentRunId: pipelineRunId, timedOut: false, durationMs: 0,
      stepStatus: [] as RecommendationStepStatus[], startedRoles: [] as string[],
      workflow: { themeScanRunId: pipelineRunId, storyScanRunId: pipelineRunId, storyVerifyRunId: pipelineRunId, reportBuildRunId: pipelineRunId, thesisAgentRunId: pipelineRunId },
    };
    const recommendation = await executeNonCriticalStep('recommendation', async () =>
      runRecommendationBatch({ dryRun, timeoutMs: mode === 'core' && !dryRun ? Number(process.env.RECOMMENDATION_BATCH_TIMEOUT_MS || 600_000) : undefined }),
      recommendationFallback,
      mode !== 'full',
    );
    let reportIngest: Record<string, unknown> = { runId: 'skip-report-ingest', dryRun, filesFound: 0, recordsWritten: 0 };
    let sourceSync: Array<Record<string, unknown>> = [];
    let sourceDiscovery: Record<string, unknown> = { runId: 'skip-source-discovery', dryRun, recordsWritten: 0 };
    let thesisRefresh: Record<string, unknown> = { runId: 'skip-thesis-refresh', dryRun, recordsWritten: 0 };
    let researchReportBuild: Record<string, unknown> = { runId: 'skip-research-report-build', dryRun, recordsWritten: 0 };
    if (mode === 'full') {
      const researchV2 = await import('./research-v2');
      reportIngest = await executeStep('report_ingest', async () => researchV2.runReportIngest({ dryRun }));
      sourceSync = await executeStep('source_sync', async () => Promise.all(
        scheduledSourceConnectorKeys()
          .map((connector) => researchV2.runSourceSync({ connector, dryRun })),
      ));
      sourceDiscovery = await executeStep('source_discovery', async () => researchV2.runSourceDiscovery({ dryRun }));
      thesisRefresh = await executeStep('thesis_refresh', async () => researchV2.runThesisRefresh({ dryRun }));
      researchReportBuild = await executeStep('research_report_build', async () => researchV2.runResearchReportBuild({ dryRun }));
    } else {
      await executeStep('report_ingest', async () => reportIngest, true, reportIngest);
      await executeStep('source_sync', async () => sourceSync, true, sourceSync);
      await executeStep('source_discovery', async () => sourceDiscovery, true, sourceDiscovery);
      await executeStep('thesis_refresh', async () => thesisRefresh, true, thesisRefresh);
      await executeStep('research_report_build', async () => researchReportBuild, true, researchReportBuild);
    }
    const deepDive = await executeStep(
      'deep_dive_build',
      async () => runDeepDiveBuild({ dryRun, symbol: TW_STORY_RESEARCH_SEEDS[0]?.symbol }),
      mode !== 'full',
      { runId: 'skip-deep-dive-build', dryRun, startedRoles: ['Research Editor Agent', 'Technical Timing Agent'], recordsWritten: 0 },
    );
    const dispatch = await executeStep(
      'line_dispatch',
      async () => dispatchLineEvents({ dryRun }),
      mode !== 'full',
      { sent: 0, skipped: 0, failed: 0, attempts: 0, runId: 'skip-line-dispatch', dryRun },
    );

    let publication: Record<string, unknown> = { publishedAt: null, results: [] };
    let shadowObservation: Record<string, unknown> | null = null;
    if (!dryRun) {
      const stages = await executeStep('candidate_stage_projection', async () => loadCandidateStageCards());
      const radarPayload = await executeStep('radar_payload_build', async () => getDailyRadarData());
      const activeSourceErrors = await executeStep('active_source_health', async () => loadActiveCandidateSourceErrors());
      publication = await executeStep('radar_publication', async () => publishRadarPublicSnapshots({ payload: radarPayload, stages, pipelineRunId }));
      shadowObservation = await executeStep('shadow_observation', async () => recordCandidateShadowObservation({
        pipelineRunId,
        publicationId: typeof publication.homePublicationId === 'string' ? publication.homePublicationId : null,
        publicationPayloadHash: typeof publication.homePayloadHash === 'string' ? publication.homePayloadHash : null,
        manifestId: candidateResearch.manifestId,
        manifestHash: candidateResearch.manifestHash,
        researchItems: candidateResearch.items,
        stages,
        technicalSessionDate: candidateResearch.technicalSessionDate || null,
        activeSourceErrors,
      }));
    }

    const durationMs = Date.now() - startedAt;
    if (supabaseServer) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: { mode, timed_out: false, duration_ms: durationMs, step_status: stepStatus },
          finished_at: nowIso(),
        })
        .eq('id', pipelineRunId);
    }

    return {
      mode,
      timedOut: false,
      failedStep: null,
      durationMs,
      stepStatus,
      ingestion,
      dynamicMentionScan,
      revenueIngestion,
      candidateResearch,
      recommendation,
      reportIngest,
      sourceSync,
      sourceDiscovery,
      thesisRefresh,
      researchReportBuild,
      deepDive,
      dispatch,
      publication,
      shadowObservation,
    };
  } catch (error) {
    const err = error as Error & { timedOut?: boolean; failedStep?: string; durationMs?: number; stepStatus?: RecommendationStepStatus[] };
    const durationMs = err.durationMs || Date.now() - startedAt;
    const failedStep = err.failedStep || stepStatus[stepStatus.length - 1]?.step || null;
    const timedOut = Boolean(err.timedOut);
    if (supabaseServer) {
      await markRadarPublicSnapshotsFailed(err.message, nowIso()).catch(() => undefined);
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: {
            mode,
            timed_out: timedOut,
            failed_step: failedStep,
            duration_ms: durationMs,
            step_status: err.stepStatus || stepStatus,
            error: err.message,
          },
          finished_at: nowIso(),
        })
        .eq('id', pipelineRunId);
    }
    err.durationMs = durationMs;
    err.failedStep = failedStep || undefined;
    err.stepStatus = err.stepStatus || (stepStatus as unknown as RecommendationStepStatus[]);
    throw err;
  }
  
}

export async function runPipelineResearchFlow(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = Date.now();
  const researchV2 = await import('./research-v2');
  const reportIngest = await researchV2.runReportIngest({ dryRun });
  const sourceSync = await Promise.all(
    scheduledSourceConnectorKeys()
      .map((connector) => researchV2.runSourceSync({ connector, dryRun })),
  );
  const sourceDiscovery = await researchV2.runSourceDiscovery({ dryRun });
  const thesisRefresh = await researchV2.runThesisRefresh({ dryRun });
  const researchReportBuild = await researchV2.runResearchReportBuild({ dryRun });
  const deepDive = await runDeepDiveBuild({ dryRun, symbol: TW_STORY_RESEARCH_SEEDS[0]?.symbol });

  return {
    dryRun,
    durationMs: Date.now() - startedAt,
    reportIngest,
    sourceSync,
    sourceDiscovery,
    thesisRefresh,
    researchReportBuild,
    deepDive,
  };
}

export async function runPipelineDispatchFlow(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = Date.now();
  const classification = await runThesisRank({ dryRun });
  const dispatch = await dispatchLineEvents({ dryRun });
  return {
    dryRun,
    durationMs: Date.now() - startedAt,
    classification,
    dispatch,
  };
}

export async function getLineDispatchDiagnostics(hours = 24) {
  if (shouldUseDemoFallback()) {
    return {
      hours,
      since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      totalEvents: 0,
      statusBreakdown: {},
      topFailureReasons: [],
      invalidSubscriptionCount: 0,
      invalidSubscriptions: [],
    };
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const sinceIso = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    const [eventsRes, subsRes] = await Promise.all([
      supabaseServer
        .from('line_alert_events')
        .select('id,event_type,delivery_status,payload,created_at,sent_at')
        .gte('created_at', sinceIso)
        .order('created_at', { ascending: false })
        .limit(500),
      supabaseServer.from('line_subscriptions').select('line_user_id,updated_at').limit(500),
    ]);

    if (eventsRes.error || subsRes.error) {
      throw new Error(eventsRes.error?.message || subsRes.error?.message || 'line diagnostics query failed');
    }

    const events = ((eventsRes.data as Row[]) || []);
    const subscriptions = ((subsRes.data as Row[]) || []);

    const byStatus: Record<string, number> = {};
    const reasonCounter: Record<string, number> = {};

    for (const event of events) {
      const status = String(event.delivery_status || 'unknown');
      byStatus[status] = (byStatus[status] || 0) + 1;

      const dispatch = (((event.payload as Row | undefined) || {}).dispatch_result as Row | undefined) || {};
      const reason = String(dispatch.error_summary || dispatch.reason || '');
      if (reason) {
        reasonCounter[reason] = (reasonCounter[reason] || 0) + 1;
      }
    }

    const topFailureReasons = Object.entries(reasonCounter)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const invalidSubscriptions = subscriptions
      .map((sub) => ({
        line_user_id: String(sub.line_user_id || ''),
        updated_at: String(sub.updated_at || ''),
      }))
      .filter((sub) => !isValidLineUserId(sub.line_user_id))
      .map((sub) => ({
        line_user_id_masked: maskLineUserId(sub.line_user_id),
        updated_at: sub.updated_at,
      }));

    return {
      hours,
      since: sinceIso,
      totalEvents: events.length,
      statusBreakdown: byStatus,
      topFailureReasons,
      invalidSubscriptionCount: invalidSubscriptions.length,
      invalidSubscriptions,
    };
  } catch {
    return {
      hours,
      since: new Date(Date.now() - hours * 60 * 60 * 1000).toISOString(),
      totalEvents: 0,
      statusBreakdown: {},
      topFailureReasons: [],
      invalidSubscriptionCount: 0,
      invalidSubscriptions: [],
    };
  }
}

export async function runMonitoringChecks() {
  if (shouldUseDemoFallback()) {
    return {
      checkedAt: nowIso(),
      alerts: [
        {
          type: 'demo_fallback',
          level: 'warning' as const,
          message: 'Development mode is using local fallback data instead of live Supabase',
        },
  ],
};

  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const now = new Date();
    const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

    const [pipelineRes, recRes, sourceHealthRes, sourceLedgerRes, latestTechnicalRes, candidateRunsRes, publicationStateRes, officialSessions] = await Promise.all([
      supabaseServer.from('pipeline_runs').select('*').gte('started_at', sinceIso).order('started_at', { ascending: false }).limit(100),
      supabaseServer.from('recommendations').select('id,is_blocked,created_at').gte('created_at', sinceIso).limit(500),
      supabaseServer.from('source_health_checks').select('*').gte('checked_at', sinceIso).order('checked_at', { ascending: false }).limit(300),
      supabaseServer.from('source_run_ledger')
        .select('connector,attempted_at,succeeded_at,terminal_reason,terminal_detail,auth_status,fetched,matched,written,next_expected_at')
        .gte('attempted_at', new Date(now.getTime() - 72 * 60 * 60 * 1000).toISOString())
        .order('attempted_at', { ascending: false })
        .limit(1000),
      supabaseServer.from('technical_feature_snapshots').select('session_date,available_at').order('session_date', { ascending: false }).limit(1),
      supabaseServer.from('candidate_research_runs').select('status,technical_session_date,started_at,finished_at,terminal_reason').order('started_at', { ascending: false }).limit(3),
      supabaseServer.from('radar_publication_state').select('window_key,status,last_attempt_at,last_success_snapshot_id,terminal_reason').in('window_key', ['home', 'daily']),
      fetchTwMarketTradingSessions(10),
    ]);

    if (pipelineRes.error || recRes.error || sourceHealthRes.error || sourceLedgerRes.error || latestTechnicalRes.error || candidateRunsRes.error || publicationStateRes.error) {
      throw new Error(pipelineRes.error?.message || recRes.error?.message || sourceHealthRes.error?.message || sourceLedgerRes.error?.message || latestTechnicalRes.error?.message || candidateRunsRes.error?.message || publicationStateRes.error?.message || 'monitoring query failed');
    }

    const alerts: Array<{ type: string; level: 'warning' | 'critical'; message: string; context?: Record<string, unknown> }> = [];

    const pipelineRuns = (pipelineRes.data as Row[]) || [];
    const failedRuns = pipelineRuns.filter((row) => String(row.status || '') === 'failed');
    if (failedRuns.length > 0) {
      alerts.push({
        type: 'pipeline_failed',
        level: 'critical',
        message: `${failedRuns.length} pipeline run(s) failed in last 24h`,
        context: { recentFailedRuns: failedRuns.slice(0, 3) },
      });
    }

    const recs = (recRes.data as Row[]) || [];
    if (recs.length > 0) {
      const blocked = recs.filter((r) => Boolean(r.is_blocked)).length;
      const ratio = blocked / recs.length;
      const threshold = Number(process.env.BLOCKED_RECOMMENDATION_ALERT_RATIO || 0.35);
      if (ratio >= threshold) {
        alerts.push({
          type: 'freshness_gate_ratio',
          level: 'warning',
          message: `blocked recommendation ratio high: ${(ratio * 100).toFixed(1)}%`,
          context: { blocked, total: recs.length, threshold },
        });
      }
    }

    const healthRows = (sourceHealthRes.data as Row[]) || [];
    const parseThreshold = Number(process.env.SOURCE_MIN_PARSE_SUCCESS_RATIO || 0.6);
    const monitoredConnectors = new Set(scheduledSourceConnectorKeys());
    const sourceHealthConnectorByKey: Record<string, string> = {
      'site.ptt.stock': 'ptt',
      'authorized.bulltalk.feed': 'bulltalk',
      'site.gdelt.gkg2': 'gdelt',
      'site.telegram.channels': 'telegram',
      'site.twse.insider': 'twse_insider',
    };
    const unhealthy = healthRows.filter((row) => {
      const sourceKey = String(row.source_key || '');
      const isScheduled = monitoredConnectors.has(sourceHealthConnectorByKey[sourceKey] || '');
      return isScheduled && Number(row.parse_success_ratio || 1) < parseThreshold;
    });
    if (unhealthy.length > 0) {
      alerts.push({
        type: 'source_parse_ratio_low',
        level: 'warning',
        message: `${unhealthy.length} source health checks below parse success threshold`,
        context: { threshold: parseThreshold, samples: unhealthy.slice(0, 5) },
      });
    }

    const sourceLedgerRows = (sourceLedgerRes.data as Row[]) || [];
    const successfulTerminals = new Set(['success', 'successful_empty', 'duplicate_only']);
    for (const connector of scheduledSourceConnectorKeys()) {
      const policy = sourceExecutionPolicy(connector);
      const attempts = sourceLedgerRows.filter((row) => String(row.connector || '') === connector);
      const latestTwo = attempts.slice(0, 2);
      const immediateFailure = attempts.find((row) => {
        const attemptedAt = Date.parse(String(row.attempted_at || ''));
        return Number.isFinite(attemptedAt) && attemptedAt >= now.getTime() - 24 * 60 * 60 * 1000
          && ['auth_failed', 'parser_failed'].includes(String(row.terminal_reason || ''));
      });
      if (immediateFailure) {
        alerts.push({
          type: `source_${String(immediateFailure.terminal_reason)}`,
          level: 'critical',
          message: `${connector} ${String(immediateFailure.terminal_reason)}: ${String(immediateFailure.terminal_detail || 'no detail')}`,
          context: { connector, attempt: immediateFailure },
        });
      }
      if (latestTwo.length === 2 && latestTwo.every((row) => !successfulTerminals.has(String(row.terminal_reason || '')))) {
        alerts.push({
          type: 'source_two_consecutive_failures',
          level: 'critical',
          message: `${connector} failed two consecutive scheduled attempts`,
          context: { connector, attempts: latestTwo },
        });
      }
      const lastSuccess = attempts.find((row) => successfulTerminals.has(String(row.terminal_reason || '')));
      const cadenceHours = policy.cadenceHours || 24;
      const lastSuccessMs = lastSuccess ? Date.parse(String(lastSuccess.attempted_at || '')) : Number.NaN;
      if (!Number.isFinite(lastSuccessMs) || now.getTime() - lastSuccessMs > cadenceHours * 2 * 60 * 60 * 1000) {
        alerts.push({
          type: 'source_missed_two_expected_runs',
          level: 'critical',
          message: `${connector} has no successful terminal outcome within two expected cadences`,
          context: { connector, cadenceHours, lastSuccessAt: Number.isFinite(lastSuccessMs) ? new Date(lastSuccessMs).toISOString() : null },
        });
      }
    }

    const taipeiParts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
    const taipeiValue = Object.fromEntries(taipeiParts.map((part) => [part.type, part.value]));
    const taipeiDate = `${taipeiValue.year}-${taipeiValue.month}-${taipeiValue.day}`;
    const latestTechnicalSession = String(((latestTechnicalRes.data as Row[]) || [])[0]?.session_date || '');
    const officialLatestSession = officialSessions.at(-1) || '';
    const candidateRuns = (candidateRunsRes.data as Row[]) || [];
    const latestCandidateRun = candidateRuns[0];
    const currentCandidateRunSucceeded = latestCandidateRun
      && String(latestCandidateRun.technical_session_date || '') === taipeiDate
      && String(latestCandidateRun.status || '') === 'success';
    const failedPublication = ((publicationStateRes.data as Row[]) || []).find((row) => String(row.status || '') === 'failed');
    if (failedPublication) {
      alerts.push({
        type: 'radar_publication_failed',
        level: 'critical',
        message: `${String(failedPublication.window_key)} last publication failed: ${String(failedPublication.terminal_reason || 'unknown')}`,
        context: { publication: failedPublication },
      });
    }
    if (officialLatestSession === taipeiDate && Number(taipeiValue.hour || 0) >= 20 && latestTechnicalSession !== taipeiDate) {
      alerts.push({
        type: 'candidate_research_missing',
        level: 'critical',
        message: `No current candidate research snapshot for trading session ${taipeiDate}`,
        context: { officialLatestSession, latestTechnicalSession },
      });
    }
    if (officialLatestSession === taipeiDate && Number(taipeiValue.hour || 0) >= 20 && !currentCandidateRunSucceeded) {
      alerts.push({
        type: 'candidate_research_run_missing',
        level: 'critical',
        message: `No fully successful candidate research run for trading session ${taipeiDate}`,
        context: { latestCandidateRun: latestCandidateRun || null },
      });
    }
    if (officialLatestSession === taipeiDate && latestTechnicalSession === taipeiDate && Number(taipeiValue.hour || 0) >= 20) {
      const progress = await loadCandidateShadowProgress();
      if (progress.latestSession !== latestTechnicalSession) {
        alerts.push({
          type: 'shadow_session_missing',
          level: 'critical',
          message: `No canonical shadow observation for trading session ${latestTechnicalSession}`,
          context: { latestTechnicalSession, shadowProgress: progress },
        });
      } else if (progress.blockers.length > 0) {
        alerts.push({
          type: 'shadow_session_not_qualifying',
          level: 'warning',
          message: `Shadow observation ${latestTechnicalSession} is not qualifying`,
          context: { blockers: progress.blockers, shadowProgress: progress },
        });
      }
    }

    return {
      checkedAt: now.toISOString(),
      alerts,
    };
  } catch (error) {
    return {
      checkedAt: nowIso(),
      alerts: [
        {
          type: 'monitoring_query_failed',
          level: 'critical' as const,
          message: `Monitoring could not verify production state: ${safeErrorMessage(error)}`,
          context: { terminalReason: 'monitoring_unverified' },
        },
      ],
    };
  }
}
