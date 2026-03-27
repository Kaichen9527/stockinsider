import { randomUUID } from 'crypto';
import { Client as LineClient } from '@line/bot-sdk';
import { getSupabaseServerClient } from './supabase-server';
import { isDemoMode } from './data-mode';
import type {
  AgentStatusSummary,
  BrokerView,
  ConnectorStatusView,
  DailyMarketFocus,
  DiscoveredStockCard,
  DiscoveredStockSource,
  EvidenceMatrixView,
  LinePreference,
  RadarDailyPayload,
  RecommendationCard,
  RecommendationState,
  RiskCounterpointView,
  ResearchMemoView,
  SignalFreshness,
  SourceCoverageView,
  StockDeepDivePayload,
  StockDeepDivePendingPayload,
  StockInsightPayload,
  StoryEvidenceItemView,
  StoryType,
  StrategyActionView,
  ThemeDetailPayload,
  ThemeHeatCard,
  ThesisModelView,
  ValuationCaseView,
  ValuationSource,
  VerificationStatus,
} from './types';

const RISK_DISCLOSURE = '本服務僅提供研究資訊，非投資建議，投資決策與風險由使用者自行承擔。';

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
  return iso.slice(0, 10);
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

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
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
};

const REQUIRED_SOURCE_TYPES: Array<SourceCoverageView['sourceType']> = ['threads', 'bulltalk', 'ptt', 'kol', 'official', 'financial'];

const AGENCY_AGENT_ALLOWLIST = [
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
    profileKey: 'agency-agents/testing-api-tester',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Coordinator Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/testing',
  },
  {
    profileKey: 'agency-agents/testing-evidence-collector',
    sourceLibrary: 'agency-agents',
    mappedRole: 'Evidence Verifier Agent',
    sourceUrl: 'https://github.com/msitarzewski/agency-agents/tree/main/testing',
  },
  {
    profileKey: 'agency-agents/testing-reality-checker',
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

const TW_STORY_RESEARCH_SEEDS = [
  {
    symbol: '2330',
    name: 'TSMC',
    market: 'TW' as const,
    sector: 'Semiconductors',
    prices: [1749, 1762, 1778, 1795, 1808, 1820, 1830, 1843, 1855, 1865],
    volume: 12000000,
    sourceKey: 'api.twse.price',
    source: 'market-price-adapter',
    storyType: 'conference_guidance' as StoryType,
    themeKey: 'advanced-packaging',
    themeName: '先進封裝',
    thesisTitle: 'AI 晶圓代工需求與 CoWoS 產能仍可能被市場低估',
    thesisSummary: '法說會、公開研究摘要與供應鏈交叉檢查都指向先進封裝需求在未來一到三個月仍高於市場原先預期。',
    catalystSummary: '法說會更新先進封裝產能、AI 需求延續、供應鏈擴產訊號持續。',
    expectationScore: 0.84,
    reportTitle: 'AI 晶圓代工與封裝產能展望',
    reportSummary: '先進封裝與 AI 加速器需求仍明顯強於市場共識。',
    socialSignals: [
      { sourceType: 'PTT' as const, sourceName: 'PTT Stock', sourceKey: 'forum.ptt.stock', sentimentLabel: 'bullish' as const, confidence: 0.66, mentionCount: 128, summary: '討論集中在法說會後毛利率與先進製程需求。', sourceUrl: 'https://www.ptt.cc/bbs/Stock/index.html' },
      { sourceType: 'KOL' as const, sourceName: '股癌', sourceKey: 'kol.tw.stock-cancer', sentimentLabel: 'bullish' as const, confidence: 0.72, mentionCount: 10, summary: '供應鏈優勢與長期護城河仍明確。', sourceUrl: 'https://www.youtube.com/@stockcancer' },
      { sourceType: 'KOL' as const, sourceName: '股市隱者', sourceKey: 'kol.tw.market-hermit', sentimentLabel: 'bullish' as const, confidence: 0.58, mentionCount: 7, summary: '看好先進封裝供給仍偏緊，市場尚未完全反映。', sourceUrl: 'https://www.youtube.com/' },
      { sourceType: 'BullTalk' as const, sourceName: '股市爆料同學會', sourceKey: 'community.bulltalk.2330', sentimentLabel: 'bullish' as const, confidence: 0.54, mentionCount: 35, summary: '市場追蹤 CoWoS 擴產與客戶追單，屬於早期題材。', sourceUrl: 'https://www.cmoney.tw/forum/' },
    ],
    companyEvents: [
      { eventType: 'conference' as const, headline: '法說會重申 AI 需求與先進封裝擴產', summary: '公司對 AI 客戶需求與先進封裝產能維持正向展望。', sourceUrl: 'https://mops.twse.com.tw/mops/web/t100sb15', extractedSignals: { ai_demand: 'strong', packaging: 'expanding' } },
    ],
    transcript: {
      eventName: 'TSMC Investor Conference',
      excerpt: 'Management highlighted continued AI-related demand and advanced packaging tightness.',
      sourceUrl: 'https://mops.twse.com.tw/mops/web/t100sb15',
      managementTone: 'bullish' as const,
      catalystMentions: ['AI demand', 'CoWoS capacity', 'margin resilience'],
    },
    revenue: { monthlyRevenue: 228400000000, yoyGrowth: 24.1, momGrowth: 5.7, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 38.4, grossMargin: 53.1, operatingMargin: 42.4, peRatio: 26.8, pbRatio: 6.9, revenueRunRate: 2740800000000, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [
      { caseType: 'base' as const, targetPrice: 2000, expectedReturnPct: 7.2, assumptions: { thesis: 'packaging demand stays tight', rerating: 'modest' } },
      { caseType: 'upside' as const, targetPrice: 2150, expectedReturnPct: 15.3, assumptions: { thesis: 'AI demand beats consensus', rerating: 'strong' } },
      { caseType: 'invalidation' as const, targetPrice: 1700, expectedReturnPct: -8.8, assumptions: { risk: 'AI capex digestion or packaging relief' } },
    ],
  },
  {
    symbol: '2454',
    name: 'MediaTek',
    market: 'TW' as const,
    sector: 'Semiconductors',
    prices: [1616, 1628, 1645, 1662, 1677, 1690, 1700, 1709, 1716, 1720],
    volume: 9600000,
    sourceKey: 'api.twse.price',
    source: 'market-price-adapter',
    storyType: 'product_upgrade' as StoryType,
    themeKey: 'edge-ai-devices',
    themeName: '邊緣 AI 裝置',
    thesisTitle: '邊緣 AI 與高階 SoC 組合有機會上修獲利預期',
    thesisSummary: '公開研究摘要與產品週期討論顯示，下一波高階手機與邊緣 AI 週期可能比市場預期更快改善產品組合。',
    catalystSummary: '邊緣 AI 裝置升級週期、旗艦 SoC 新品、產品組合改善。',
    expectationScore: 0.78,
    reportTitle: '邊緣 AI 晶片輪動',
    reportSummary: '新一代邊緣 AI 與行動 SoC 組合有機會推升毛利率。',
    socialSignals: [
      { sourceType: 'KOL' as const, sourceName: '投資癮', sourceKey: 'kol.tw.invest-addict', sentimentLabel: 'bullish' as const, confidence: 0.74, mentionCount: 14, summary: '看好 edge AI 需求與產品組合改善。', sourceUrl: 'https://www.youtube.com/' },
      { sourceType: 'Threads' as const, sourceName: 'Threads 台股觀測', sourceKey: 'threads.tw.2454', sentimentLabel: 'bullish' as const, confidence: 0.51, mentionCount: 18, summary: '市場提早討論旗艦 SoC 與端側 AI 的產品週期。', sourceUrl: 'https://www.threads.net/' },
      { sourceType: 'BullTalk' as const, sourceName: '股市爆料同學會', sourceKey: 'community.bulltalk.2454', sentimentLabel: 'bullish' as const, confidence: 0.48, mentionCount: 21, summary: '社群關注高階晶片產品組合改善，但仍待更多官方驗證。', sourceUrl: 'https://www.cmoney.tw/forum/' },
    ],
    companyEvents: [
      { eventType: 'product_launch' as const, headline: '新一代旗艦 SoC 導入更多端側 AI 功能', summary: '新品規格與 AI 功能升級，有助於 ASP 與毛利率。', sourceUrl: 'https://www.mediatek.com/', extractedSignals: { asp: 'up', ai_mix: 'higher' } },
    ],
    transcript: {
      eventName: 'MediaTek Product Briefing',
      excerpt: 'The company sees expanding device-side AI attach rates across premium products.',
      sourceUrl: 'https://www.mediatek.com/',
      managementTone: 'bullish' as const,
      catalystMentions: ['premium mix', 'edge AI', 'ASP expansion'],
    },
    revenue: { monthlyRevenue: 44600000000, yoyGrowth: 18.3, momGrowth: 4.2, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 65.2, grossMargin: 48.7, operatingMargin: 21.4, peRatio: 18.7, pbRatio: 4.3, revenueRunRate: 535200000000, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [
      { caseType: 'base' as const, targetPrice: 1315, expectedReturnPct: 7.3, assumptions: { thesis: 'mix shifts higher', rerating: 'moderate' } },
      { caseType: 'upside' as const, targetPrice: 1380, expectedReturnPct: 12.7, assumptions: { thesis: 'AI attach accelerates', rerating: 'stronger' } },
      { caseType: 'invalidation' as const, targetPrice: 1145, expectedReturnPct: -6.5, assumptions: { risk: 'end-demand weakness or mix disappointment' } },
    ],
  },
  {
    symbol: '2382',
    name: 'Quanta',
    market: 'TW' as const,
    sector: 'AI Servers',
    prices: [271, 274, 277, 280, 283, 285, 286, 287, 288, 289],
    volume: 18200000,
    sourceKey: 'api.twse.price',
    source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'ai-server-supply-chain',
    themeName: 'AI 伺服器供應鏈',
    thesisTitle: '大型雲端客戶擴建 AI Server，廣達可能仍處於被低估的接單週期',
    thesisSummary: '供應鏈追蹤、公開需求評論與資本支出敘事都顯示，廣達的 AI 伺服器出貨成長仍可能未被市場完整建模。',
    catalystSummary: '雲端客戶 AI Server 出貨、供應鏈訂單能見度、機櫃產品滲透提高。',
    expectationScore: 0.76,
    reportTitle: '大型雲端客戶伺服器需求摘要',
    reportSummary: 'AI server ODM 訂單能見度延續到下一季，仍偏正向。',
    socialSignals: [
      { sourceType: 'PTT' as const, sourceName: 'PTT Stock', sourceKey: 'forum.ptt.ai-server', sentimentLabel: 'bullish' as const, confidence: 0.61, mentionCount: 76, summary: '市場持續關注 AI server 出貨與機櫃滲透。', sourceUrl: 'https://www.ptt.cc/bbs/Stock/index.html' },
      { sourceType: 'BullTalk' as const, sourceName: '股市爆料同學會', sourceKey: 'community.bulltalk.2382', sentimentLabel: 'bullish' as const, confidence: 0.56, mentionCount: 26, summary: '提早追蹤雲端客戶拉貨與機櫃訂單，屬於尚未完全證實的供應鏈題材。', sourceUrl: 'https://www.cmoney.tw/forum/' },
    ],
    companyEvents: [
      { eventType: 'supply_chain' as const, headline: 'AI Server 出貨能見度延續到下一季', summary: '供應鏈消息指出關鍵 AI server 訂單仍在加速。', sourceUrl: 'https://mops.twse.com.tw/mops/web/t05sr01_1', extractedSignals: { shipment_visibility: 'improving', hyperscaler: 'active' } },
    ],
    transcript: {
      eventName: 'Quanta Investor Conference',
      excerpt: 'Management described sustained server momentum and stronger AI-related mix.',
      sourceUrl: 'https://mops.twse.com.tw/mops/web/t100sb15',
      managementTone: 'bullish' as const,
      catalystMentions: ['AI server', 'rack scale', 'customer ramp'],
    },
    revenue: { monthlyRevenue: 152800000000, yoyGrowth: 31.6, momGrowth: 6.8, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 14.8, grossMargin: 8.5, operatingMargin: 4.2, peRatio: 18.1, pbRatio: 3.7, revenueRunRate: 1833600000000, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [
      { caseType: 'base' as const, targetPrice: 295, expectedReturnPct: 6.1, assumptions: { thesis: 'AI server demand remains on track', rerating: 'measured' } },
      { caseType: 'upside' as const, targetPrice: 318, expectedReturnPct: 14.4, assumptions: { thesis: 'rack shipments accelerate', rerating: 'strong' } },
      { caseType: 'invalidation' as const, targetPrice: 256, expectedReturnPct: -7.9, assumptions: { risk: 'customer digestion or component bottleneck' } },
    ],
  },
  {
    symbol: '6669',
    name: 'Wiwynn',
    market: 'TW' as const,
    sector: 'AI Servers',
    prices: [3828, 3870, 3910, 3952, 3985, 4006, 4020, 4038, 4055, 4070],
    volume: 2400000,
    sourceKey: 'api.twse.price',
    source: 'market-price-adapter',
    storyType: 'shortage_pricing' as StoryType,
    themeKey: 'ai-server-supply-chain',
    themeName: 'AI 伺服器供應鏈',
    thesisTitle: 'AI 機櫃供給仍偏緊，高單價產品組合有機會支撐緯穎續強',
    thesisSummary: '市場可能仍低估 AI 機櫃供給吃緊的延續性，以及高單價系統組合對未來一季營收與毛利的支撐。',
    catalystSummary: 'AI 機櫃供給吃緊、客戶拉貨加速、高單價產品比重延續。',
    expectationScore: 0.81,
    reportTitle: 'AI 機櫃供需緊張展望',
    reportSummary: '高階 AI 機櫃需求仍領先供給，並支撐毛利率韌性。',
    socialSignals: [
      { sourceType: 'Threads' as const, sourceName: 'Threads 台股 AI 機櫃', sourceKey: 'forum.threads.tw-ai-rack', sentimentLabel: 'bullish' as const, confidence: 0.58, mentionCount: 42, summary: '市場關注高階機櫃供給仍偏緊。', sourceUrl: 'https://www.threads.net/' },
      { sourceType: 'KOL' as const, sourceName: '股市隱者', sourceKey: 'kol.tw.market-hermit.6669', sentimentLabel: 'bullish' as const, confidence: 0.57, mentionCount: 6, summary: '認為高單價 AI 機櫃仍有估值擴張空間，但官方指引尚未完全覆蓋。', sourceUrl: 'https://www.youtube.com/' },
      { sourceType: 'BullTalk' as const, sourceName: '股市爆料同學會', sourceKey: 'community.bulltalk.6669', sentimentLabel: 'bullish' as const, confidence: 0.53, mentionCount: 19, summary: '社群追蹤高階系統拉貨與缺貨議題，屬於早期訊號。', sourceUrl: 'https://www.cmoney.tw/forum/' },
    ],
    companyEvents: [
      { eventType: 'guidance' as const, headline: '高階 AI 系統產品比重提升', summary: '高單價產品組合支撐毛利率與營收表現。', sourceUrl: 'https://mops.twse.com.tw/mops/web/t05sr01_1', extractedSignals: { premium_mix: 'higher', shortage: 'ongoing' } },
    ],
    transcript: {
      eventName: 'Wiwynn Earnings Call',
      excerpt: 'Management pointed to premium system demand and ongoing supply tightness in AI products.',
      sourceUrl: 'https://mops.twse.com.tw/mops/web/t100sb15',
      managementTone: 'bullish' as const,
      catalystMentions: ['premium system demand', 'AI racks', 'margin support'],
    },
    revenue: { monthlyRevenue: 31900000000, yoyGrowth: 44.5, momGrowth: 8.1, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 58.9, grossMargin: 12.4, operatingMargin: 7.7, peRatio: 22.1, pbRatio: 5.2, revenueRunRate: 382800000000, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [
      { caseType: 'base' as const, targetPrice: 2140, expectedReturnPct: 6.2, assumptions: { thesis: 'premium mix persists', rerating: 'moderate' } },
      { caseType: 'upside' as const, targetPrice: 2280, expectedReturnPct: 13.2, assumptions: { thesis: 'supply remains tight and demand expands', rerating: 'strong' } },
      { caseType: 'invalidation' as const, targetPrice: 1880, expectedReturnPct: -6.7, assumptions: { risk: 'supply normalizes or customer push-out' } },
    ],
  },
  // ===== 散熱/液冷板塊 =====
  {
    symbol: '3324', name: '雙鴻', market: 'TW' as const, sector: 'Thermal Management',
    prices: [991, 1000, 1010, 1020, 1030, 1038, 1043, 1047, 1052, 1055], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'thermal-management', themeName: '散熱與液冷',
    thesisTitle: 'AI Server 液冷散熱需求持續擴大，雙鴻為台灣液冷龍頭',
    thesisSummary: '高功耗 AI server 散熱規格升級，液冷滲透率快速提升，雙鴻為主要受益者。',
    catalystSummary: 'AI server 散熱規格升級、客戶拉貨加速、液冷滲透率持續提升。',
    expectationScore: 0.78, reportTitle: '散熱與液冷供應鏈展望', reportSummary: 'AI server 散熱需求高於市場預期，液冷滲透率持續提升。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['liquid cooling', 'AI server', 'thermal'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '3017', name: '奇鋐', market: 'TW' as const, sector: 'Thermal Management',
    prices: [1749, 1762, 1778, 1795, 1808, 1820, 1830, 1843, 1855, 1865], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'thermal-management', themeName: '散熱與液冷',
    thesisTitle: '奇鋐散熱模組受益 AI Server 規格升級',
    thesisSummary: 'AI server 高功耗散熱需求持續帶動奇鋐散熱模組出貨量成長。',
    catalystSummary: 'AI server 散熱模組訂單增加、客戶拉貨能見度佳。',
    expectationScore: 0.72, reportTitle: '散熱模組需求展望', reportSummary: '散熱模組需求受 AI server 拉動，成長動能明確。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['thermal module', 'AI server'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '6230', name: '超眾', market: 'TW' as const, sector: 'Thermal Management',
    prices: [161, 163, 165, 166, 167, 168, 169, 170, 170, 171], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'thermal-management', themeName: '散熱與液冷',
    thesisTitle: '超眾散熱零組件供應 AI Server 供應鏈',
    thesisSummary: 'AI server 散熱零組件需求強勁，超眾受益於供應鏈布局完整。',
    catalystSummary: 'AI server 供應鏈訂單、散熱零組件需求持續。',
    expectationScore: 0.70, reportTitle: '散熱零組件市場展望', reportSummary: 'AI server 散熱零組件需求持續成長。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['thermal components', 'AI server supply chain'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2421', name: '建準', market: 'TW' as const, sector: 'Thermal Management',
    prices: [136, 137, 138, 140, 141, 142, 143, 143, 144, 144.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'thermal-management', themeName: '散熱與液冷',
    thesisTitle: '建準風扇與散熱受益 HPC 及 AI Server 出貨增加',
    thesisSummary: 'HPC 與 AI server 需求帶動建準風扇與散熱模組出貨量持續成長。',
    catalystSummary: 'AI server 風扇訂單、HPC 散熱需求增加。',
    expectationScore: 0.68, reportTitle: '風扇與散熱市場展望', reportSummary: 'AI server 風扇需求強勁，建準受益。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['fan', 'thermal', 'HPC', 'AI server'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 記憶體循環板塊 =====
  {
    symbol: '2337', name: '旺宏', market: 'TW' as const, sector: 'Memory',
    prices: [102, 103, 104, 105, 106, 107, 107, 108, 108, 108.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'inventory_reversal' as StoryType,
    themeKey: 'memory-cycle', themeName: '記憶體循環反轉',
    thesisTitle: '旺宏 NOR Flash 受惠車用/工業需求復甦，循環低點後展望樂觀',
    thesisSummary: 'NOR Flash 車用與工業庫存去化接近尾聲，旺宏作為龍頭廠受益於循環反轉與利基市場需求回溫。',
    catalystSummary: '車用 NOR Flash 需求回溫、庫存去化完成、ASP 回升。',
    expectationScore: 0.74, reportTitle: 'NOR Flash 循環反轉展望', reportSummary: '車用與工業 NOR Flash 需求回溫，旺宏進入循環上升段。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['NOR Flash', 'automotive', 'industrial', 'inventory'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2408', name: '南亞科', market: 'TW' as const, sector: 'Memory',
    prices: [223, 226, 228, 231, 233, 235, 236, 237, 237, 238], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'inventory_reversal' as StoryType,
    themeKey: 'memory-cycle', themeName: '記憶體循環反轉',
    thesisTitle: '南亞科 DRAM 受惠 AI Server HBM 需求拉動傳統 DRAM 價格',
    thesisSummary: 'AI server 對 HBM 的強勁需求排擠傳統 DRAM 產能，帶動 DDR DRAM 供需改善與 ASP 回升。',
    catalystSummary: 'DRAM ASP 回升、AI server 需求排擠效應、庫存去化完成。',
    expectationScore: 0.71, reportTitle: 'DRAM 供需展望', reportSummary: 'AI 需求拉動下 DRAM 供需改善，ASP 有望持續回升。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['DRAM', 'HBM', 'AI server', 'ASP'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2344', name: '華邦電', market: 'TW' as const, sector: 'Memory',
    prices: [102, 104, 105, 106, 107, 107, 108, 108, 109, 109], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'inventory_reversal' as StoryType,
    themeKey: 'memory-cycle', themeName: '記憶體循環反轉',
    thesisTitle: '華邦電 DRAM/NOR Flash 低基期反彈，車規需求帶動',
    thesisSummary: '華邦電在 DRAM 與 NOR Flash 雙線布局下，受惠於循環低點後的需求回溫與車規應用成長。',
    catalystSummary: '車規需求成長、DRAM 供需改善、低基期效應。',
    expectationScore: 0.67, reportTitle: '華邦電記憶體展望', reportSummary: '低基期 + 車規需求帶動，華邦電進入復甦軌道。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['DRAM', 'NOR Flash', 'automotive', 'recovery'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== AI 伺服器供應鏈延伸 =====
  {
    symbol: '2356', name: '英業達', market: 'TW' as const, sector: 'AI Servers',
    prices: [40, 40.5, 41, 41.5, 41.5, 41.8, 42, 42.2, 42.5, 42.65], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'ai-server-supply-chain', themeName: 'AI 伺服器供應鏈',
    thesisTitle: '英業達 AI Server ODM 出貨量大，受惠雲端客戶擴建',
    thesisSummary: '英業達作為主要 AI server ODM 廠，受惠於大型雲端客戶 capex 擴建與 GPU server 需求持續。',
    catalystSummary: '雲端客戶 AI server 拉貨、ODM 訂單能見度佳。',
    expectationScore: 0.73, reportTitle: 'AI Server ODM 需求展望', reportSummary: 'AI server ODM 訂單持續，英業達受益明確。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['AI server', 'ODM', 'hyperscaler', 'GPU server'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '3231', name: '緯創', market: 'TW' as const, sector: 'AI Servers',
    prices: [126, 127, 128, 130, 130, 131, 132, 132, 133, 134], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'ai-server-supply-chain', themeName: 'AI 伺服器供應鏈',
    thesisTitle: '緯創 AI Server 與 GPU Server 組裝受益 CSP 擴建',
    thesisSummary: '緯創在 AI server 與 GPU server 組裝佈局完整，受惠雲端服務提供商持續擴建資料中心。',
    catalystSummary: 'GPU server 訂單增加、CSP capex 擴建、AI PC 轉型。',
    expectationScore: 0.72, reportTitle: '緯創 AI Server 展望', reportSummary: 'AI server 出貨持續成長，緯創受益明確。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['GPU server', 'AI server', 'CSP', 'AI PC'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 特殊製程晶圓廠 =====
  {
    symbol: '2303', name: '聯電', market: 'TW' as const, sector: 'Semiconductors',
    prices: [55.9, 56.5, 57, 57.5, 58, 58.4, 58.7, 59, 59.2, 59.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'operating_turnaround' as StoryType,
    themeKey: 'specialty-foundry', themeName: '特殊製程晶圓廠',
    thesisTitle: '聯電成熟製程受惠車用/工業需求回溫，利用率有望回升',
    thesisSummary: '聯電聚焦成熟製程代工，受惠於車用與工業半導體去庫存結束後的需求回溫。',
    catalystSummary: '晶圓廠利用率回升、車用/工業需求改善、ASP 穩定。',
    expectationScore: 0.65, reportTitle: '成熟製程晶圓廠展望', reportSummary: '成熟製程需求溫和復甦，利用率回升帶動獲利改善。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'neutral' as const, catalystMentions: ['mature node', 'automotive', 'industrial', 'utilization'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '5347', name: '世界先進', market: 'TW' as const, sector: 'Semiconductors',
    prices: [107, 108, 109, 110, 111, 112, 112, 113, 113, 114], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'operating_turnaround' as StoryType,
    themeKey: 'specialty-foundry', themeName: '特殊製程晶圓廠',
    thesisTitle: '世界先進 Analog/Power IC 代工需求受益車用/工業復甦',
    thesisSummary: '專注 Analog 與 Power IC 代工的世界先進，受惠於車用與工業電源管理 IC 需求回溫。',
    catalystSummary: 'Power IC 代工需求回升、車規 Analog 訂單增加。',
    expectationScore: 0.66, reportTitle: 'Analog/Power IC 代工展望', reportSummary: 'Power IC 代工需求溫和復甦，世界先進利用率改善。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'neutral' as const, catalystMentions: ['Analog', 'Power IC', 'automotive', 'foundry'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 封裝測試 =====
  {
    symbol: '3711', name: '日月光投控', market: 'TW' as const, sector: 'Semiconductors',
    prices: [320, 324, 328, 332, 335, 337, 338, 340, 340, 341.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'packaging-testing', themeName: '先進封裝測試',
    thesisTitle: '日月光先進封裝受益 CoWoS 與 AI 晶片封裝需求爆發',
    thesisSummary: '日月光為全球封測龍頭，直接受益於 AI 晶片 CoWoS 先進封裝需求與 HBM 測試需求快速成長。',
    catalystSummary: 'CoWoS 封裝需求、AI 晶片測試、HBM 相關業務擴大。',
    expectationScore: 0.77, reportTitle: '先進封裝需求展望', reportSummary: 'AI 晶片封裝需求持續高速成長，日月光受益最直接。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['CoWoS', 'advanced packaging', 'HBM', 'AI chip'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2449', name: '京元電', market: 'TW' as const, sector: 'Semiconductors',
    prices: [277, 280, 283, 286, 288, 290, 292, 293, 294, 295.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'packaging-testing', themeName: '先進封裝測試',
    thesisTitle: '京元電晶圓測試受惠 AI 晶片測試需求大幅增加',
    thesisSummary: 'AI 晶片測試複雜度與數量快速增加，京元電作為獨立測試廠受益明確。',
    catalystSummary: 'AI 晶片測試需求、晶圓測試利用率提升。',
    expectationScore: 0.70, reportTitle: '晶圓測試需求展望', reportSummary: 'AI 晶片帶動晶圓測試需求成長，京元電利用率持續改善。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['wafer testing', 'AI chip', 'utilization'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 網通/AI 基礎設施 =====
  {
    symbol: '2345', name: '智邦', market: 'TW' as const, sector: 'Networking',
    prices: [1335, 1348, 1363, 1378, 1390, 1400, 1406, 1412, 1417, 1420], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'networking-ai-infra', themeName: 'AI 網通基礎設施',
    thesisTitle: '智邦高速網通交換器為 AI Datacenter 核心受益者',
    thesisSummary: 'AI datacenter 對高速乙太網交換器需求爆發，智邦為台灣高速網通龍頭，受益最直接。',
    catalystSummary: 'AI datacenter 網通升級、400G/800G 交換器訂單、超大規模客戶拉貨。',
    expectationScore: 0.80, reportTitle: 'AI 網通基礎設施展望', reportSummary: 'AI datacenter 帶動高速網通需求，智邦受益最明確。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['switch', 'AI datacenter', '400G', '800G', 'hyperscaler'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '5388', name: '中磊', market: 'TW' as const, sector: 'Networking',
    prices: [73, 74, 75, 75, 76, 76, 77, 77, 77, 78], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'networking-ai-infra', themeName: 'AI 網通基礎設施',
    thesisTitle: '中磊 Router/Switch ODM 受益 Wi-Fi 6/7 與 AI 網通升級',
    thesisSummary: '中磊在 Router 與 Switch ODM 布局完整，受益於 Wi-Fi 7 換機潮與 AI 網通設備升級。',
    catalystSummary: 'Wi-Fi 7 換機潮、AI 網通設備升級、ODM 訂單增加。',
    expectationScore: 0.68, reportTitle: '網通 ODM 展望', reportSummary: 'Wi-Fi 7 換機潮帶動中磊訂單，AI 網通需求加持。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['Wi-Fi 7', 'router', 'switch', 'ODM'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '6285', name: '啟碁', market: 'TW' as const, sector: 'Networking',
    prices: [157, 159, 161, 163, 164, 165, 166, 166, 167, 167.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'networking-ai-infra', themeName: 'AI 網通基礎設施',
    thesisTitle: '啟碁網通解決方案受益 Wi-Fi 7 與 5G CPE 需求',
    thesisSummary: '啟碁在無線網通與 5G CPE 布局完整，受益於 Wi-Fi 7 換機潮與電信商 5G 網路建設。',
    catalystSummary: 'Wi-Fi 7 滲透率提升、5G CPE 訂單、電信商採購。',
    expectationScore: 0.66, reportTitle: '無線網通需求展望', reportSummary: 'Wi-Fi 7 與 5G CPE 帶動啟碁訂單成長。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['Wi-Fi 7', '5G CPE', 'telecom'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 電源與零組件 =====
  {
    symbol: '2308', name: '台達電', market: 'TW' as const, sector: 'Power Components',
    prices: [1301, 1315, 1328, 1342, 1355, 1364, 1370, 1377, 1382, 1385], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'power-components', themeName: '電源與散熱零組件',
    thesisTitle: '台達電電源與散熱解決方案為 AI Server 大宗受益者',
    thesisSummary: '台達電提供完整電源供應器與液冷散熱解決方案，AI server 訂單規模持續擴大，受益最全面。',
    catalystSummary: 'AI server 電源供應器大單、液冷散熱方案採用、資料中心節能需求。',
    expectationScore: 0.79, reportTitle: '電源與散熱解決方案展望', reportSummary: 'AI server 電源需求帶動台達電營收高速成長。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['power supply', 'liquid cooling', 'AI server', 'data center'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2301', name: '光寶科', market: 'TW' as const, sector: 'Power Components',
    prices: [157, 159, 161, 162, 163, 164, 165, 166, 166, 167], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'power-components', themeName: '電源與散熱零組件',
    thesisTitle: '光寶科電源供應器受惠 AI Server 高功耗需求',
    thesisSummary: '光寶科電源供應器與光通訊模組雙線布局，AI server 高功耗電源需求帶動業績成長。',
    catalystSummary: 'AI server 電源供應器訂單、光通訊模組需求、資料中心擴建。',
    expectationScore: 0.71, reportTitle: '電源供應器與光通訊展望', reportSummary: 'AI server 帶動電源與光通訊需求，光寶科雙重受益。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['power supply', 'optical module', 'AI server'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== PCB/高階載板 =====
  {
    symbol: '4958', name: '臻鼎-KY', market: 'TW' as const, sector: 'PCB',
    prices: [177, 179, 181, 182, 184, 185, 186, 187, 188, 188.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'pcb-substrate', themeName: 'PCB 與高階載板',
    thesisTitle: '臻鼎 PCB 龍頭受益 AI Server 高階多層板需求',
    thesisSummary: '臻鼎為台灣 PCB 龍頭，AI server 對高階多層 PCB 需求大幅提升，臻鼎在高端 PCB 布局完整。',
    catalystSummary: 'AI server 高階 PCB 訂單、多層板滲透率提升。',
    expectationScore: 0.72, reportTitle: 'PCB 市場展望', reportSummary: 'AI server 高階 PCB 需求強勁，臻鼎受益最直接。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['PCB', 'AI server', 'high-layer board'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '3037', name: '欣興', market: 'TW' as const, sector: 'PCB',
    prices: [477, 483, 488, 493, 497, 500, 502, 504, 506, 508], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'pcb-substrate', themeName: 'PCB 與高階載板',
    thesisTitle: '欣興 IC 載板直接受益 CoWoS 先進封裝需求',
    thesisSummary: '欣興提供 AI 晶片所需的高階 IC 載板，CoWoS 先進封裝需求爆發直接帶動欣興出貨。',
    catalystSummary: 'CoWoS 載板需求爆發、AI 晶片載板訂單、先進封裝滲透率提升。',
    expectationScore: 0.76, reportTitle: 'IC 載板需求展望', reportSummary: 'CoWoS 先進封裝帶動 IC 載板需求，欣興直接受益。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['IC substrate', 'CoWoS', 'advanced packaging', 'AI chip'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '3189', name: '景碩', market: 'TW' as const, sector: 'PCB',
    prices: [298, 302, 306, 309, 312, 314, 315, 316, 317, 317.5], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'pcb-substrate', themeName: 'PCB 與高階載板',
    thesisTitle: '景碩封裝載板受益先進封裝需求持續擴大',
    thesisSummary: '景碩專注封裝載板，受益於先進封裝技術普及與 AI 晶片封裝載板需求持續成長。',
    catalystSummary: '先進封裝載板需求、AI 晶片封裝需求增加。',
    expectationScore: 0.69, reportTitle: '封裝載板需求展望', reportSummary: '先進封裝帶動景碩封裝載板需求持續成長。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['package substrate', 'advanced packaging', 'AI chip'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== IC 設計多元 =====
  {
    symbol: '3034', name: '聯詠', market: 'TW' as const, sector: 'IC Design',
    prices: [365, 369, 373, 377, 380, 383, 385, 386, 387, 388], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'product_upgrade' as StoryType,
    themeKey: 'ic-design', themeName: 'IC 設計多元化',
    thesisTitle: '聯詠顯示驅動 IC 受益 OLED 滲透率提升與 AI 顯示器需求',
    thesisSummary: '聯詠為顯示驅動 IC 龍頭，受益於 OLED 面板滲透率提升與 AI PC/顯示器升級換代。',
    catalystSummary: 'OLED 滲透率提升、AI PC 顯示器升級、產品組合改善。',
    expectationScore: 0.69, reportTitle: '顯示驅動 IC 展望', reportSummary: 'OLED 換機潮帶動聯詠顯示驅動 IC 需求，ASP 有望提升。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['DDIC', 'OLED', 'AI PC', 'display driver'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '2379', name: '瑞昱', market: 'TW' as const, sector: 'IC Design',
    prices: [441, 445, 450, 455, 459, 463, 465, 467, 469, 470], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'product_upgrade' as StoryType,
    themeKey: 'ic-design', themeName: 'IC 設計多元化',
    thesisTitle: '瑞昱網通/音訊 IC 受益 Wi-Fi 7 與 AI PC 升級換代',
    thesisSummary: '瑞昱在網通 IC 與音訊 IC 雙線布局，受益於 Wi-Fi 7 換機潮與 AI PC 音訊/網路晶片升級。',
    catalystSummary: 'Wi-Fi 7 晶片出貨、AI PC 音訊 IC 升級、網通 IC 需求成長。',
    expectationScore: 0.68, reportTitle: '網通/音訊 IC 展望', reportSummary: 'Wi-Fi 7 與 AI PC 帶動瑞昱 IC 需求成長。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['Wi-Fi 7', 'audio IC', 'AI PC', 'networking IC'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '6415', name: '矽力-KY', market: 'TW' as const, sector: 'IC Design',
    prices: [263, 266, 268, 271, 274, 276, 277, 278, 279, 280], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'ic-design', themeName: 'IC 設計多元化',
    thesisTitle: '矽力電源管理 IC 受益 AI Server 電源需求大幅增加',
    thesisSummary: '矽力為台灣電源管理 IC 設計龍頭，AI server 對高效電源管理 IC 用量大幅增加，直接受益。',
    catalystSummary: 'AI server PMIC 需求、電源管理 IC 用量增加、中國市場回暖。',
    expectationScore: 0.73, reportTitle: '電源管理 IC 展望', reportSummary: 'AI server 電源管理 IC 需求爆發，矽力受益明確。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['PMIC', 'power management', 'AI server'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  {
    symbol: '3533', name: '嘉澤', market: 'TW' as const, sector: 'IC Design',
    prices: [1645, 1660, 1676, 1692, 1706, 1717, 1726, 1737, 1744, 1750], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'supply_chain_win' as StoryType,
    themeKey: 'ic-design', themeName: 'IC 設計多元化',
    thesisTitle: '嘉澤連接器受益 AI Server 高速信號傳輸需求',
    thesisSummary: '嘉澤提供 AI server 所需的高速連接器解決方案，受益於高速信號傳輸規格升級。',
    catalystSummary: 'AI server 高速連接器需求、規格升級、客戶訂單增加。',
    expectationScore: 0.70, reportTitle: '高速連接器需求展望', reportSummary: 'AI server 高速連接器需求持續成長，嘉澤受益。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'bullish' as const, catalystMentions: ['connector', 'high speed', 'AI server', 'signal'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
  // ===== 光學精密 =====
  {
    symbol: '3008', name: '大立光', market: 'TW' as const, sector: 'Optical',
    prices: [2203, 2222, 2244, 2265, 2283, 2298, 2310, 2323, 2335, 2345], volume: 5000000, sourceKey: 'api.twse.price', source: 'market-price-adapter',
    storyType: 'product_upgrade' as StoryType,
    themeKey: 'optical-precision', themeName: '光學與精密製造',
    thesisTitle: '大立光光學鏡頭受益旗艦手機相機規格升級與 XR 裝置',
    thesisSummary: '大立光為全球光學鏡頭技術龍頭，受益於旗艦手機相機持續升規與 XR/AR 裝置鏡頭需求興起。',
    catalystSummary: '旗艦手機相機升規、XR 裝置鏡頭需求、Apple 新品帶動。',
    expectationScore: 0.67, reportTitle: '光學鏡頭市場展望', reportSummary: '旗艦相機升規與 XR 需求帶動大立光出貨，ASP 有望提升。',
    socialSignals: [], companyEvents: [],
    transcript: { eventName: '', excerpt: '', sourceUrl: 'https://mops.twse.com.tw/', managementTone: 'neutral' as const, catalystMentions: ['optical lens', 'smartphone camera', 'XR', 'Apple'] },
    revenue: { monthlyRevenue: 0, yoyGrowth: 0, momGrowth: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs' },
    fundamentals: { epsTtm: 0, grossMargin: 0, operatingMargin: 0, peRatio: 0, pbRatio: 0, revenueRunRate: 0, sourceUrl: 'https://mops.twse.com.tw/mops/web/t164sb04' },
    valuationCases: [],
  },
] as const;

type ResearchSeed = (typeof TW_STORY_RESEARCH_SEEDS)[number];

// Chinese names for seeds whose `name` field is English
const CHINESE_NAME_MAP: Record<string, string> = {
  '2330': '台積電',
  '2454': '聯發科',
  '2382': '廣達',
  '6669': '緯穎',
};

// Estimated catalyst dates (next earnings / key event)
const CATALYST_DATE_MAP: Record<string, string> = {
  '2330': '2026-04-17',
  '2454': '2026-05-15',
  '2382': '2026-04-30',
  '6669': '2026-04-30',
  '3324': '2026-05-15',
  '3017': '2026-05-15',
  '6230': '2026-05-30',
  '2421': '2026-05-30',
  '2337': '2026-06-30',
  '2408': '2026-05-15',
  '2344': '2026-05-15',
  '2356': '2026-04-30',
  '3231': '2026-04-30',
  '2303': '2026-05-15',
  '5347': '2026-05-15',
  '3711': '2026-04-30',
  '2449': '2026-05-30',
  '2345': '2026-04-17',
  '5388': '2026-06-30',
  '6285': '2026-06-30',
  '2308': '2026-04-30',
  '2301': '2026-05-15',
  '4958': '2026-05-30',
  '3037': '2026-04-30',
  '3189': '2026-05-30',
  '3034': '2026-05-15',
  '2379': '2026-05-15',
  '6415': '2026-05-30',
  '3533': '2026-05-15',
  '3008': '2026-04-17',
};

// Per-stock research overrides: target prices derived from each stock's unique market story
const SEED_RESEARCH_OVERRIDES: Record<string, {
  thesisTitle?: string;
  thesisSummary?: string;
  catalystSummary?: string;
  storyType?: StoryType;
  targetPrice: number;
  upsidePrice: number;
  invalidationPrice: number;
  epsTtm: number;
  grossMargin: number;
  operatingMargin: number;
  peRatio: number;
  monthlyRevenue: number;
  revenueYoyGrowth: number;
}> = {
  // ===== 先進封裝 =====
  '2454': {
    thesisTitle: '邊緣 AI SoC 產品組合升級，帶動聯發科毛利率擴張與 EPS 上修',
    thesisSummary: '聯發科天璣 9400/9500 系列導入更多端側 AI 功能，推動旗艦 SoC 佔比從 35% 提升至 45%+，預估 ASP 提升 15-20%。搭配 Wi-Fi 7 晶片與車用 SoC 新品放量，2026 年 EPS 預估從 NT$65 提升至 NT$85+。以 22x PE 估算，12 個月目標價 NT$1,870。',
    catalystSummary: '天璣 9500 量產出貨 2026Q2、Wi-Fi 7 晶片滲透率提升、車用 SoC 新客戶導入。',
    targetPrice: 1870, upsidePrice: 2100, invalidationPrice: 1450,
    epsTtm: 65.2, grossMargin: 48.7, operatingMargin: 21.4, peRatio: 26.4, monthlyRevenue: 44600000000, revenueYoyGrowth: 18.3,
  },
  '2382': {
    thesisTitle: 'AI Server ODM 訂單能見度延伸至 2027，廣達出貨量仍被低估',
    thesisSummary: '廣達為全球最大 AI server ODM，主要客戶包含 Meta、Microsoft、Google。2026 年 AI server 營收佔比預估從 28% 提升至 38%，帶動整體毛利率從 8.5% 改善至 9.5%+。以 2026 EPS NT$19.5、18x PE 估算，目標價 NT$351。供應鏈追蹤顯示雲端客戶 capex 持續上修，AI rack-scale 產品滲透率加速。',
    catalystSummary: '2026Q2 AI server 出貨量 QoQ+25%、Meta 與 Google 新一代 GPU server 訂單確認、機櫃產品營收佔比突破 15%。',
    targetPrice: 351, upsidePrice: 400, invalidationPrice: 240,
    epsTtm: 14.8, grossMargin: 8.5, operatingMargin: 4.2, peRatio: 19.5, monthlyRevenue: 152800000000, revenueYoyGrowth: 31.6,
  },
  '6669': {
    thesisTitle: 'AI 機櫃供給持續吃緊，緯穎高單價產品支撐毛利率韌性',
    thesisSummary: '緯穎為 AI rack-scale 系統龍頭，客戶涵蓋主要 CSP。AI 機櫃 ASP 是傳統伺服器的 5-8 倍，供給端產能擴張速度仍落後需求。2026 年營收預估 YoY+45%，EPS 預估 NT$240+。以 20x PE 估算，目標價 NT$4,800。風險在於客戶推遲擴建或供給快速正常化。',
    catalystSummary: 'B200/B300 機櫃新訂單確認、2026Q2 營收創高、客戶 capex 上修。',
    targetPrice: 4800, upsidePrice: 5500, invalidationPrice: 3200,
    epsTtm: 58.9, grossMargin: 12.4, operatingMargin: 7.7, peRatio: 69.0, monthlyRevenue: 31900000000, revenueYoyGrowth: 44.5,
  },
  // ===== 散熱/液冷 =====
  '3324': {
    thesisTitle: 'AI GPU 功耗從 350W 飆升至 1000W+，雙鴻液冷滲透率加速',
    thesisSummary: '雙鴻為台灣液冷散熱龍頭，直接受益於 NVIDIA B200/B300 世代 GPU 功耗大幅提升。液冷滲透率預估從 2025 年 15% 提升至 2026 年 30%+，雙鴻已打入 AWS、Google 供應鏈。2026Q2 起液冷營收佔比有望突破 40%，帶動毛利率從 25% 提升至 28%+。以 2026 EPS NT$50、28x PE 估算，目標價 NT$1,400。',
    catalystSummary: '2026Q2 液冷產品大量出貨、B300 量產帶動新訂單、月營收持續創高。',
    targetPrice: 1400, upsidePrice: 1650, invalidationPrice: 850,
    epsTtm: 35.0, grossMargin: 25.3, operatingMargin: 15.8, peRatio: 30.1, monthlyRevenue: 3500000000, revenueYoyGrowth: 42.0,
  },
  '3017': {
    thesisTitle: '奇鋐散熱模組受益 AI Server 功耗升級，ASP 大幅提升',
    thesisSummary: 'AI server 散熱模組 ASP 是傳統的 3-5 倍，奇鋐在 heat pipe 與 vapor chamber 技術領先。隨著 B200/B300 量產，散熱模組 ASP 從 NT$200 提升至 NT$800+。2026 年 EPS 預估 NT$75+，以 28x PE 估算目標價 NT$2,100。',
    catalystSummary: 'B200 散熱模組量產出貨、新客戶訂單導入、月營收 QoQ 持續成長。',
    targetPrice: 2100, upsidePrice: 2500, invalidationPrice: 1500,
    epsTtm: 52.0, grossMargin: 28.5, operatingMargin: 18.2, peRatio: 35.9, monthlyRevenue: 4200000000, revenueYoyGrowth: 35.0,
  },
  '6230': {
    thesisTitle: '超眾散熱零組件打入 AI server 供應鏈，營收結構轉型',
    thesisSummary: '超眾從傳統散熱零組件切入 AI server 散熱供應鏈，Heat Pipe 與 Vapor Chamber 產品放量。AI 產品營收佔比預估從 2025 年 15% 提升至 2026 年 30%，帶動毛利率從 20% 改善至 24%。以 2026 EPS NT$12、17x PE 估算，目標價 NT$204。',
    catalystSummary: 'AI server 散熱零組件訂單放量、新客戶認證通過、營收結構改善。',
    targetPrice: 210, upsidePrice: 250, invalidationPrice: 140,
    epsTtm: 8.5, grossMargin: 20.0, operatingMargin: 10.5, peRatio: 20.1, monthlyRevenue: 1200000000, revenueYoyGrowth: 28.0,
  },
  '2421': {
    thesisTitle: '建準風扇受益 HPC 與 AI Server 高轉速需求，出貨量成長',
    thesisSummary: '建準為台灣散熱風扇龍頭，AI server 高功耗需求帶動高轉速風扇用量從每台 6 顆增至 10 顆以上，ASP 同步提升。2026 年 AI 相關營收佔比預估達 25%，帶動整體 EPS 從 NT$7 提升至 NT$9.5。以 18x PE 估算，目標價 NT$171。',
    catalystSummary: 'AI server 風扇訂單放量、HPC 散熱規格升級、新產品線貢獻營收。',
    targetPrice: 175, upsidePrice: 200, invalidationPrice: 120,
    epsTtm: 7.0, grossMargin: 22.0, operatingMargin: 11.0, peRatio: 20.6, monthlyRevenue: 1800000000, revenueYoyGrowth: 22.0,
  },
  // ===== 記憶體 =====
  '2337': {
    storyType: 'shortage_pricing' as StoryType,
    thesisTitle: 'eMMC 供需失衡：MLC NAND 全面 EOL，旺宏成為全球最後 MLC 供應商',
    thesisSummary: 'Samsung、SK Hynix、Kioxia、Micron 陸續停產 MLC NAND，2026-28 年全球 MLC 產能將從 91,772M Gb 大幅縮減至 36,492M Gb（-60%）。旺宏作為全球最後的 MLC/TLC eMMC 供應商，eMMC 營收預估從 2025 年 8.6 億大幅成長至 2026 年 563.9 億（+6,458%）、2027 年 2,301.1 億。以 2026 EPS NT$30.04、10 倍 PE 估算，12 個月目標價 NT$300。凱基投顧首次評等「增加持股」。',
    catalystSummary: '2026Q1 eMMC 價格 QoQ+150%、2026Q2 eMMC 營收佔比突破 80%、Samsung MLC LTS 截止日 3Q26、2026 全年 EPS NT$30.04。',
    targetPrice: 300, upsidePrice: 400, invalidationPrice: 60,
    epsTtm: -1.77, grossMargin: 17.8, operatingMargin: -12.8, peRatio: -55.9, monthlyRevenue: 2400000000, revenueYoyGrowth: 12.0,
  },
  '2408': {
    thesisTitle: 'HBM 產能排擠效應帶動 DDR5 供需改善，南亞科進入獲利回升軌道',
    thesisSummary: 'AI server 對 HBM 的爆發性需求排擠三大原廠 DDR 產能，DDR5 供需持續改善。南亞科已完成 DDR5 1b 製程轉換，良率突破 80%，預估 2026 年 DDR5 營收佔比從 30% 提升至 55%。ASP 回升 + 產品組合改善下，2026 EPS 預估從虧損轉盈至 NT$8+。以 30x 週期 PE 估算，目標價 NT$300。',
    catalystSummary: 'DDR5 ASP 季增 8-12%、1b 製程良率持續改善、AI server 帶動企業端 DDR5 需求加速。',
    targetPrice: 300, upsidePrice: 350, invalidationPrice: 180,
    epsTtm: -3.5, grossMargin: 15.0, operatingMargin: -8.0, peRatio: -68.0, monthlyRevenue: 5800000000, revenueYoyGrowth: 25.0,
  },
  '2344': {
    thesisTitle: '華邦電 DRAM/NOR Flash 雙引擎復甦，車規認證帶動 ASP 溢價',
    thesisSummary: '華邦電在 Specialty DRAM 與 NOR Flash 雙線布局，車規產品佔比提升至 30%+。車規 NOR Flash ASP 為消費級的 2-3 倍，隨著車用半導體去庫存結束，2026 年營收預估 YoY+20%。EPS 預估從虧損轉盈至 NT$4+，以 28x 週期 PE 估算，目標價 NT$135。',
    catalystSummary: '車用 NOR Flash 補庫存啟動、DRAM ASP 季增 5-8%、低基期效應顯現。',
    targetPrice: 135, upsidePrice: 160, invalidationPrice: 85,
    epsTtm: -2.1, grossMargin: 18.0, operatingMargin: -5.0, peRatio: -51.9, monthlyRevenue: 3200000000, revenueYoyGrowth: 20.0,
  },
  // ===== AI 伺服器供應鏈延伸 =====
  '2356': {
    thesisTitle: '英業達 AI Server ODM 出貨爆發，GPU server 帶動毛利率改善',
    thesisSummary: '英業達為前三大 AI server ODM，主要客戶包含 Amazon 與 Meta。AI server 毛利率（6-8%）高於傳統伺服器（3-4%），隨著 AI server 營收佔比從 20% 提升至 35%，整體毛利率預估改善 1-1.5 個百分點。2026 EPS 預估 NT$3.8，以 14x PE 估算，目標價 NT$53。',
    catalystSummary: '2026Q2 GPU server 出貨量 QoQ+30%、Amazon 新訂單確認、AI server 營收佔比持續擴大。',
    targetPrice: 55, upsidePrice: 65, invalidationPrice: 35,
    epsTtm: 2.8, grossMargin: 4.8, operatingMargin: 2.5, peRatio: 15.2, monthlyRevenue: 48000000000, revenueYoyGrowth: 28.0,
  },
  '3231': {
    thesisTitle: '緯創 AI Server + AI PC 雙引擎，營收結構升級帶動重估',
    thesisSummary: '緯創在 GPU server 組裝已獲 CSP 大單，同時 AI PC 出貨佔比持續提升。AI 相關業務（server + PC）營收佔比預估從 25% 提升至 40%，帶動毛利率從 5.5% 改善至 6.5%。2026 EPS 預估 NT$10，以 16x PE 估算，目標價 NT$160。',
    catalystSummary: 'CSP GPU server 訂單放量、AI PC 出貨佔比提升、營收結構改善帶動估值重估。',
    targetPrice: 168, upsidePrice: 195, invalidationPrice: 105,
    epsTtm: 7.5, grossMargin: 5.5, operatingMargin: 3.0, peRatio: 17.9, monthlyRevenue: 72000000000, revenueYoyGrowth: 25.0,
  },
  // ===== 特殊製程晶圓廠 =====
  '2303': {
    thesisTitle: '聯電成熟製程利用率觸底回升，車用/工業需求帶動溫和復甦',
    thesisSummary: '聯電晶圓廠利用率從 2025Q4 低點 65% 回升至 2026Q2 預估 75%+，車用與工業半導體去庫存結束帶動需求回溫。每提升 5% 利用率約貢獻 EPS NT$0.5。2026 EPS 預估 NT$4.2，以 16x PE 估算，目標價 NT$67。復甦幅度溫和，但下行風險有限。',
    catalystSummary: '2026Q2 利用率回升至 75%+、車用半導體補庫存啟動、ASP 穩定不再下滑。',
    targetPrice: 68, upsidePrice: 78, invalidationPrice: 48,
    epsTtm: 3.2, grossMargin: 30.0, operatingMargin: 18.0, peRatio: 18.6, monthlyRevenue: 18500000000, revenueYoyGrowth: 8.0,
  },
  '5347': {
    thesisTitle: '世界先進 Analog/Power IC 代工需求回溫，車規比重提升',
    thesisSummary: '世界先進專注 Analog 與 Power IC 代工，車規客戶佔比已達 25%。隨著車用電源管理 IC 去庫存結束，利用率預估從 60% 回升至 72%。2026 EPS 預估 NT$6.8，以 19x PE 估算，目標價 NT$129。車規產品 ASP 溢價 20-30% 支撐毛利率改善。',
    catalystSummary: '車規 Power IC 訂單回溫、利用率季增 3-5%、日本廠合作進展。',
    targetPrice: 132, upsidePrice: 150, invalidationPrice: 95,
    epsTtm: 5.0, grossMargin: 28.0, operatingMargin: 14.0, peRatio: 22.8, monthlyRevenue: 4200000000, revenueYoyGrowth: 12.0,
  },
  // ===== 封裝測試 =====
  '3711': {
    thesisTitle: '日月光先進封裝 CoWoS/InFO 需求爆發，HBM 測試成為新成長引擎',
    thesisSummary: '日月光為全球封測龍頭，直接受益於 AI 晶片 CoWoS 先進封裝需求與 HBM 測試需求。先進封裝營收佔比預估從 15% 提升至 22%，帶動整體毛利率改善 2 個百分點。2026 EPS 預估 NT$22，以 20x PE 估算，目標價 NT$440。NVIDIA B200/B300 量產直接拉動 CoWoS 封裝需求。',
    catalystSummary: 'CoWoS 封裝產能擴張、HBM 測試營收季增 20%+、B300 封裝訂單確認。',
    targetPrice: 440, upsidePrice: 500, invalidationPrice: 280,
    epsTtm: 16.5, grossMargin: 22.0, operatingMargin: 12.5, peRatio: 20.7, monthlyRevenue: 46000000000, revenueYoyGrowth: 18.0,
  },
  '2449': {
    thesisTitle: '京元電 AI 晶片測試需求激增，利用率創歷史新高',
    thesisSummary: 'AI 晶片（GPU、HBM、ASIC）測試複雜度與時間為傳統晶片的 3-5 倍，京元電利用率預估從 85% 提升至 92%+。測試 ASP 提升 + 利用率改善，2026 EPS 預估 NT$18，以 20x PE 估算，目標價 NT$360。京元電為獨立測試廠中受益 AI 最直接者。',
    catalystSummary: 'AI 晶片測試訂單持續增加、利用率創新高、HBM 測試能力擴充完成。',
    targetPrice: 370, upsidePrice: 420, invalidationPrice: 240,
    epsTtm: 14.0, grossMargin: 35.0, operatingMargin: 22.0, peRatio: 21.1, monthlyRevenue: 3800000000, revenueYoyGrowth: 22.0,
  },
  // ===== 網通/AI 基礎設施 =====
  '2345': {
    thesisTitle: '智邦 400G/800G 交換器訂單爆發，AI Datacenter 核心受益者',
    thesisSummary: '智邦為台灣高速網通交換器龍頭，已打入 Meta、Microsoft 供應鏈。AI datacenter 從 100G 升級至 400G/800G 帶動交換器 ASP 提升 3-5 倍。2026 年 400G+ 營收佔比預估從 25% 提升至 45%，帶動整體毛利率改善。2026 EPS 預估 NT$72，以 25x PE 估算，目標價 NT$1,800。',
    catalystSummary: '800G 交換器量產出貨、Meta 新一代網路架構訂單、月營收持續創高。',
    targetPrice: 1800, upsidePrice: 2100, invalidationPrice: 1150,
    epsTtm: 52.0, grossMargin: 18.0, operatingMargin: 10.5, peRatio: 27.3, monthlyRevenue: 8500000000, revenueYoyGrowth: 35.0,
  },
  '5388': {
    thesisTitle: '中磊 Wi-Fi 7 + AI 網通 ODM 雙題材，訂單能見度提升',
    thesisSummary: '中磊為 Router/Switch ODM 廠，Wi-Fi 7 換機潮帶動 ASP 提升 30-40%。同時 AI 網通設備需求帶動企業級 Switch ODM 訂單增加。2026 EPS 預估 NT$5.5，以 16x PE 估算，目標價 NT$88。相較消費級網通純看換機潮，AI 網通為額外成長動能。',
    catalystSummary: 'Wi-Fi 7 產品放量、企業級 AI Switch 訂單確認、營收 QoQ 持續成長。',
    targetPrice: 95, upsidePrice: 110, invalidationPrice: 62,
    epsTtm: 4.0, grossMargin: 20.0, operatingMargin: 8.0, peRatio: 19.5, monthlyRevenue: 2800000000, revenueYoyGrowth: 18.0,
  },
  '6285': {
    thesisTitle: '啟碁 5G CPE + Wi-Fi 7 雙引擎，電信商採購週期啟動',
    thesisSummary: '啟碁在 5G CPE 與 Wi-Fi 7 解決方案布局完整，受益於歐美電信商新一輪採購週期。5G FWA（Fixed Wireless Access）市場規模預估 2026 年 YoY+25%，啟碁市佔穩固。2026 EPS 預估 NT$11，以 17x PE 估算，目標價 NT$187。',
    catalystSummary: '歐美電信商 5G CPE 採購、Wi-Fi 7 新品量產、FWA 市場成長。',
    targetPrice: 195, upsidePrice: 220, invalidationPrice: 135,
    epsTtm: 8.5, grossMargin: 22.0, operatingMargin: 9.5, peRatio: 19.7, monthlyRevenue: 5200000000, revenueYoyGrowth: 15.0,
  },
  // ===== 電源與零組件 =====
  '2308': {
    thesisTitle: '台達電 AI Server 電源 + 液冷雙線爆發，營收成長加速',
    thesisSummary: '台達電提供 AI server 所需的高功率電源供應器（3kW-6kW）與液冷散熱方案，AI 相關營收佔比預估從 2025 年 18% 提升至 2026 年 28%。AI 電源 ASP 為傳統的 3-4 倍，帶動毛利率從 30% 改善至 33%。2026 EPS 預估 NT$65，以 27x PE 估算，目標價 NT$1,755。',
    catalystSummary: 'AI server 電源大單確認、液冷方案打入新客戶、月營收持續創高。',
    targetPrice: 1750, upsidePrice: 2000, invalidationPrice: 1100,
    epsTtm: 48.0, grossMargin: 30.0, operatingMargin: 13.5, peRatio: 28.9, monthlyRevenue: 36000000000, revenueYoyGrowth: 22.0,
  },
  '2301': {
    thesisTitle: '光寶科高功率電源 + 光通訊模組，AI 雙題材帶動營收升級',
    thesisSummary: '光寶科在高功率 PSU（2kW-4kW）與 800G 光通訊模組雙線布局。AI server 電源訂單帶動 PSU 營收 YoY+40%，光通訊模組受益於 AI datacenter 互聯需求。2026 EPS 預估 NT$12，以 18x PE 估算，目標價 NT$216。雙引擎同時發力帶動營收結構升級。',
    catalystSummary: 'AI server PSU 訂單放量、800G 光模組出貨、電源 + 光通訊營收佔比提升。',
    targetPrice: 210, upsidePrice: 240, invalidationPrice: 135,
    epsTtm: 9.0, grossMargin: 24.0, operatingMargin: 10.0, peRatio: 18.6, monthlyRevenue: 18500000000, revenueYoyGrowth: 20.0,
  },
  // ===== PCB/高階載板 =====
  '4958': {
    thesisTitle: '臻鼎高階多層 PCB 受益 AI Server 需求，ASP 大幅提升',
    thesisSummary: 'AI server 所需 PCB 層數從傳統 8-12 層提升至 20-30 層以上，ASP 提升 3-5 倍。臻鼎為台灣 PCB 龍頭，高階多層板產能持續擴充。2026 年 AI 相關 PCB 營收佔比預估從 12% 提升至 22%，帶動整體毛利率改善。2026 EPS 預估 NT$13，以 18x PE 估算，目標價 NT$234。',
    catalystSummary: 'AI server 高階 PCB 訂單持續增加、新產能開出、月營收創高。',
    targetPrice: 240, upsidePrice: 275, invalidationPrice: 155,
    epsTtm: 9.5, grossMargin: 22.0, operatingMargin: 12.0, peRatio: 19.8, monthlyRevenue: 14000000000, revenueYoyGrowth: 18.0,
  },
  '3037': {
    thesisTitle: '欣興 ABF 載板直接受益 CoWoS 先進封裝，訂單能見度延伸至 2027',
    thesisSummary: '欣興為台灣 ABF 載板龍頭，AI 晶片 CoWoS 封裝需要高階 ABF 載板。NVIDIA B200/B300 量產直接拉動載板需求，稼動率預估從 75% 回升至 85%+。ABF 載板 ASP 穩定且毛利率達 35%+，2026 EPS 預估 NT$28，以 22x PE 估算，目標價 NT$616。',
    catalystSummary: 'CoWoS ABF 載板訂單持續增加、稼動率季增 3-5%、B300 載板規格升級帶動 ASP 提升。',
    targetPrice: 650, upsidePrice: 750, invalidationPrice: 400,
    epsTtm: 20.0, grossMargin: 32.0, operatingMargin: 18.0, peRatio: 25.4, monthlyRevenue: 9500000000, revenueYoyGrowth: 22.0,
  },
  '3189': {
    thesisTitle: '景碩封裝載板受惠先進封裝需求，稼動率回升帶動獲利改善',
    thesisSummary: '景碩專注 IC 封裝載板，受益於先進封裝技術普及與 AI 晶片封裝載板需求。稼動率預估從 70% 回升至 80%，帶動毛利率改善 3 個百分點。2026 EPS 預估 NT$18，以 20x PE 估算，目標價 NT$360。',
    catalystSummary: '先進封裝載板訂單增加、稼動率季增提升、新產能貢獻營收。',
    targetPrice: 390, upsidePrice: 440, invalidationPrice: 260,
    epsTtm: 13.5, grossMargin: 28.0, operatingMargin: 15.0, peRatio: 23.5, monthlyRevenue: 3200000000, revenueYoyGrowth: 18.0,
  },
  // ===== IC 設計 =====
  '3034': {
    thesisTitle: '聯詠 OLED DDIC 滲透率加速，AI 顯示器需求帶動 ASP 提升',
    thesisSummary: '聯詠為全球顯示驅動 IC（DDIC）龍頭，受益於 OLED 面板滲透率從 35% 提升至 45%+。OLED DDIC ASP 為 LCD 的 2-3 倍，產品組合改善帶動毛利率從 42% 提升至 45%。同時 AI PC/顯示器升級帶動新一代 DDIC 需求。2026 EPS 預估 NT$25，以 18x PE 估算，目標價 NT$450。',
    catalystSummary: 'OLED 面板滲透率持續提升、AI PC DDIC 新品出貨、產品組合改善。',
    targetPrice: 470, upsidePrice: 530, invalidationPrice: 320,
    epsTtm: 19.0, grossMargin: 42.0, operatingMargin: 22.0, peRatio: 20.4, monthlyRevenue: 7500000000, revenueYoyGrowth: 15.0,
  },
  '2379': {
    thesisTitle: '瑞昱 Wi-Fi 7 + AI PC 音訊 IC 雙引擎，新品週期啟動',
    thesisSummary: '瑞昱在 Wi-Fi 7 晶片與 AI PC 音訊/網路 IC 雙線布局，Wi-Fi 7 ASP 為 Wi-Fi 6 的 1.5-2 倍。2026 年 Wi-Fi 7 營收佔比預估從 15% 提升至 30%，帶動整體 ASP 提升。2026 EPS 預估 NT$28，以 20x PE 估算，目標價 NT$560。AI PC 滲透率加速帶動額外需求。',
    catalystSummary: 'Wi-Fi 7 晶片放量、AI PC 新品搭載瑞昱音訊 IC、營收 QoQ 成長。',
    targetPrice: 560, upsidePrice: 630, invalidationPrice: 380,
    epsTtm: 22.0, grossMargin: 48.0, operatingMargin: 25.0, peRatio: 21.4, monthlyRevenue: 5800000000, revenueYoyGrowth: 18.0,
  },
  '6415': {
    thesisTitle: '矽力 PMIC 受益 AI Server 電源管理 IC 用量暴增',
    thesisSummary: '矽力為台灣電源管理 IC 設計龍頭，AI server 每台 PMIC 用量為傳統伺服器的 3-4 倍。隨著 AI server 出貨量成長，矽力 server PMIC 營收預估 YoY+50%+。同時中國市場復甦帶動消費端需求回溫。2026 EPS 預估 NT$16，以 22x PE 估算，目標價 NT$352。',
    catalystSummary: 'AI server PMIC 訂單爆發、中國市場需求回暖、營收 QoQ 持續成長。',
    targetPrice: 360, upsidePrice: 420, invalidationPrice: 220,
    epsTtm: 11.0, grossMargin: 50.0, operatingMargin: 28.0, peRatio: 25.5, monthlyRevenue: 2800000000, revenueYoyGrowth: 25.0,
  },
  '3533': {
    thesisTitle: '嘉澤高速連接器受益 AI Server 信號傳輸規格升級',
    thesisSummary: '嘉澤提供 AI server 所需 PCIe Gen5/Gen6 高速連接器，規格升級帶動 ASP 提升 40-60%。每台 AI server 連接器用量為傳統的 2 倍以上。2026 年 AI 相關營收佔比預估達 35%，帶動毛利率從 38% 改善至 42%。2026 EPS 預估 NT$85，以 24x PE 估算，目標價 NT$2,040。',
    catalystSummary: 'PCIe Gen6 連接器量產、AI server 客戶訂單增加、營收佔比持續提升。',
    targetPrice: 2100, upsidePrice: 2400, invalidationPrice: 1400,
    epsTtm: 65.0, grossMargin: 38.0, operatingMargin: 25.0, peRatio: 26.9, monthlyRevenue: 2200000000, revenueYoyGrowth: 20.0,
  },
  // ===== 光學 =====
  '3008': {
    thesisTitle: '大立光旗艦手機鏡頭升規 + XR 裝置，新產品週期帶動 ASP 提升',
    thesisSummary: '大立光受益於 iPhone 17 Pro 潛望式鏡頭升級與 Apple Vision Pro 2 光學模組需求。旗艦鏡頭 ASP 持續提升，XR 裝置為全新成長曲線。2026 EPS 預估 NT$125，以 22x PE 估算，目標價 NT$2,750。光學技術門檻極高，競爭護城河穩固。',
    catalystSummary: 'iPhone 17 Pro 拉貨啟動 2026Q3、Apple Vision Pro 2 鏡頭訂單、旗艦鏡頭 ASP 提升。',
    targetPrice: 2750, upsidePrice: 3100, invalidationPrice: 1900,
    epsTtm: 95.0, grossMargin: 58.0, operatingMargin: 42.0, peRatio: 24.7, monthlyRevenue: 4800000000, revenueYoyGrowth: 12.0,
  },
};

function profileKeyForRole(role: string) {
  return AGENCY_AGENT_ALLOWLIST.find((profile) => profile.mappedRole === role)?.profileKey || null;
}

function normalizeRecommendationState(value: unknown): RecommendationState {
  const raw = String(value || '');
  if (raw === 'validated_thesis' || raw === 'actionable_setup' || raw === 'signal_candidate' || raw === 'partially_verified') {
    return raw;
  }
  if (raw === 'watchlist_candidate') return 'signal_candidate';
  return 'signal_candidate';
}

function verificationStatusFromState(state: RecommendationState): VerificationStatus {
  if (state === 'signal_candidate') return '未證實';
  if (state === 'partially_verified') return '部分證實';
  return '已證實';
}

function sourceTypeFromName(sourceType: unknown, sourceName: unknown): SourceCoverageView['sourceType'] {
  const typeRaw = String(sourceType || '').toLowerCase();
  const nameRaw = String(sourceName || '').toLowerCase();
  if (typeRaw === 'investanchors' || nameRaw.includes('investanchors') || nameRaw.includes('定錨')) return 'investanchors';
  if (typeRaw === 'threads' || nameRaw.includes('threads')) return 'threads';
  if (typeRaw === 'instagram' || nameRaw.includes('instagram')) return 'instagram';
  if (typeRaw === 'telegram' || nameRaw.includes('telegram') || nameRaw.includes('t.me')) return 'telegram';
  if (nameRaw.includes('爆料同學會')) return 'bulltalk';
  if (typeRaw === 'ptt' || nameRaw.includes('ptt')) return 'ptt';
  if (typeRaw === 'kol' || nameRaw.includes('股癌') || nameRaw.includes('投資癮') || nameRaw.includes('股市隱者') || nameRaw.includes('定錨投筆')) return 'kol';
  if (typeRaw === 'official') return 'official';
  if (typeRaw === 'financial') return 'financial';
  if (typeRaw === 'public_research' || nameRaw.includes('research')) return 'public_research';
  if (typeRaw === 'industry') return 'industry';
  return 'news';
}

function mapSourceCoverageItem(raw: Row): SourceCoverageView {
  const sourceName = raw.source_name ?? raw.sourceName;
  const sourceTypeRaw = raw.source_type ?? raw.sourceType;
  const summary = raw.summary ?? raw.excerpt;
  const sourceUrl = raw.source_url ?? raw.sourceUrl;
  const sourceTimestamp = raw.source_timestamp ?? raw.sourceTimestamp;
  const symbols = Array.isArray(raw.symbols) ? raw.symbols : raw.symbol ? [raw.symbol] : [];
  const verificationStatusRaw = raw.verification_status ?? raw.verificationStatus;
  const sourceType = sourceTypeFromName(sourceTypeRaw, sourceName);
  const confidence = round(clamp(toFiniteNumber(raw.confidence, 0.5)), 4);
  return {
    sourceName: String(sourceName || SOURCE_TYPE_LABELS[sourceType]),
    sourceType,
    summary: String(summary || ''),
    sourceUrl: sourceUrl ? String(sourceUrl) : null,
    sourceTimestamp: sourceTimestamp ? String(sourceTimestamp) : null,
    symbols: Array.isArray(symbols) ? symbols.map((item) => String(item)) : [],
    verificationStatus: (verificationStatusRaw as VerificationStatus | undefined) || (confidence >= 0.65 ? '已證實' : confidence >= 0.35 ? '部分證實' : '未證實'),
    confidence,
    weight: round(clamp(toFiniteNumber(raw.weight, sourceType === 'official' || sourceType === 'financial' ? 0.22 : 0.12)), 4),
  };
}

function mergeSourceCoverage(items: SourceCoverageView[]) {
  const merged = new Map<string, SourceCoverageView>();
  for (const item of items) {
    const key = `${item.sourceType}:${item.sourceName}`;
    const current = merged.get(key);
    if (!current || item.confidence > current.confidence || (item.sourceTimestamp || '') > (current.sourceTimestamp || '')) {
      merged.set(key, item);
    }
  }
  return Array.from(merged.values()).sort((a, b) => {
    if (b.weight !== a.weight) return b.weight - a.weight;
    return (b.sourceTimestamp || '').localeCompare(a.sourceTimestamp || '');
  });
}

function findMissingSources(sourceCoverage: SourceCoverageView[]) {
  const present = new Set(sourceCoverage.map((item) => item.sourceType));
  return REQUIRED_SOURCE_TYPES.filter((type) => !present.has(type)).map((type) => SOURCE_TYPE_LABELS[type]);
}

function latestSourceTimestamp(sourceCoverage: SourceCoverageView[]) {
  return sourceCoverage
    .map((item) => item.sourceTimestamp)
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => b.localeCompare(a))[0] || null;
}

function communityWeightForSource(sourceType: SourceCoverageView['sourceType']) {
  if (sourceType === 'kol') return 0.12;
  if (sourceType === 'investanchors') return 0.16;
  if (sourceType === 'bulltalk') return 0.11;
  if (sourceType === 'ptt') return 0.1;
  if (sourceType === 'threads') return 0.09;
  if (sourceType === 'instagram' || sourceType === 'telegram') return 0.08;
  return sourceType === 'official' || sourceType === 'financial' ? 0.22 : 0.08;
}

function buildConditionalRecommendationNote(state: RecommendationState) {
  if (state === 'signal_candidate') {
    return '目前主要由社群與市場話題驅動，官方與財務資料尚未充分證實，適合列入早期觀察名單，不宜直接視為已驗證推薦。';
  }
  if (state === 'partially_verified') {
    return '已有部分官方、財務或法說資料支持，但 thesis 尚未完全閉環，適合小部位提早切入並持續追蹤驗證。';
  }
  if (state === 'validated_thesis') {
    return '故事主軸已獲得較完整驗證，但仍需等待更佳技術進場時機或進一步催化。';
  }
  return '故事、驗證與技術面已同步通過，可依照進出場規則執行。';
}

function recommendationStateFromVerification(verificationScore: number, technicalTimingScore?: number, isBlocked?: boolean): RecommendationState {
  if (verificationScore < 0.35) return 'signal_candidate';
  if (verificationScore < 0.65) return 'partially_verified';
  if (!isBlocked && (technicalTimingScore || 0) >= 0.67) return 'actionable_setup';
  return 'validated_thesis';
}

function verificationTimelineFromState(state: RecommendationState): StockDeepDivePayload['verificationTimeline'] {
  return [
    { stage: '未證實', summary: '【第一層】社群早期訊號 — PTT、股市爆料同學會、台股 KOL 出現討論熱度，作為前置發現來源。', completed: true },
    { stage: '部分證實', summary: '【第二層】多源交叉驗證 — 多個社群平台相互印證，訊息可信度提升。', completed: state !== 'signal_candidate' },
    { stage: '已證實', summary: '【第三層】官方/財務確認 — 法說會、月營收、券商報告最終驗證，完成論點閉環。', completed: state === 'validated_thesis' || state === 'actionable_setup' },
  ];
}

function freshnessStatus(sourceTimestampIso: string, now = new Date()): SignalFreshness {
  const threshold = Number(process.env.SIGNAL_FRESHNESS_THRESHOLD_SECONDS || 3600);
  const sourceMs = new Date(sourceTimestampIso).getTime();
  if (!sourceMs) return 'missing';
  const ageSeconds = (now.getTime() - sourceMs) / 1000;
  return ageSeconds <= threshold ? 'fresh' : 'stale';
}

function mapRecommendation(raw: Row): RecommendationCard {
  const stockRelation = Array.isArray(raw.stocks) ? (raw.stocks[0] as Row | undefined) : (raw.stocks as Row | undefined);
  const strategyRelation = Array.isArray(raw.strategy_actions)
    ? (raw.strategy_actions[0] as Row | undefined)
    : (raw.strategy_actions as Row | undefined);
  const stock = stockRelation || {};
  const strategy = strategyRelation || {};

  const recommendationState = normalizeRecommendationState(raw.recommendation_state);
  const verificationStatus = (raw.verification_status as VerificationStatus | undefined) || verificationStatusFromState(recommendationState);
  const signalBreakdown = (raw.signal_breakdown as Row | undefined) || {};
  const valuationSource = (signalBreakdown.valuation_source as ValuationSource | undefined) || 'missing';
  const valuationConfidenceRaw = signalBreakdown.valuation_confidence;
  const valuationConfidence = valuationConfidenceRaw == null ? null : toFiniteNumber(valuationConfidenceRaw, 0);
  const targetPrice = strategy.target_price ? toNumber(strategy.target_price) : null;
  const expectedUpsidePctRaw = raw.expected_upside_pct == null ? null : toNumber(raw.expected_upside_pct);
  const hasPositiveUpside = valuationSource !== 'missing' && (expectedUpsidePctRaw ?? 0) > 0 && (targetPrice ?? 0) > 0;
  const isFallbackValuation = !hasPositiveUpside || Boolean(signalBreakdown.is_fallback_valuation);
  const expectedUpsidePct = hasPositiveUpside ? expectedUpsidePctRaw : null;
  const whyNotRecommended = whyNotRecommendedLabel((signalBreakdown.why_not_recommended as string | undefined) || null);
  return {
    recommendationId: String(raw.id || ''),
    symbol: String(stock.symbol || 'UNKNOWN'),
    name: String(stock.name || stock.symbol || 'Unknown'),
    market: (stock.market as 'TW' | 'US') || 'TW',
    score: toNumber(raw.score),
    confidence: toNumber(raw.confidence),
    action: (raw.action as 'buy' | 'watch' | 'reduce') || 'watch',
    rationale: String(raw.rationale || ''),
    targetPrice,
    stopLoss: strategy.stop_loss ? toNumber(strategy.stop_loss) : null,
    strategyState: strategy.state as RecommendationCard['strategyState'],
    recommendationState,
    storyType: (raw.story_type as StoryType | null | undefined) || null,
    thesisTitle: raw.thesis_title ? String(raw.thesis_title) : null,
    thesisSummary: raw.thesis_summary ? String(raw.thesis_summary) : null,
    catalystSummary: raw.catalyst_summary ? String(raw.catalyst_summary) : null,
    expectedUpsidePct,
    valuationSource,
    valuationConfidence,
    isFallbackValuation,
    evidenceScore: raw.evidence_score ? toNumber(raw.evidence_score) : null,
    timingScore: raw.timing_score ? toNumber(raw.timing_score) : null,
    communitySignalScore: raw.community_signal_score ? toNumber(raw.community_signal_score) : null,
    verificationStatus,
    conditionalRecommendationNote: raw.conditional_recommendation_note ? String(raw.conditional_recommendation_note) : null,
    chineseName: CHINESE_NAME_MAP[String(stock.symbol || '')] ?? null,
    firstRecommendedAt: raw.first_recommended_at ? String(raw.first_recommended_at) : null,
    estimatedCatalystDate: CATALYST_DATE_MAP[String(stock.symbol || '')] ?? null,
    whyNotRecommended,
  };
}

function round(value: number, precision = 4) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function recommendationHasPositiveUpside(rec: RecommendationCard) {
  return (rec.expectedUpsidePct ?? 0) > 0 && (rec.targetPrice ?? 0) > 0 && (rec.valuationSource || 'missing') !== 'missing';
}

function recommendationMeetsVerification(rec: RecommendationCard) {
  const state = rec.recommendationState || 'signal_candidate';
  return state === 'partially_verified' || state === 'validated_thesis' || state === 'actionable_setup';
}

function recommendationIsFormal(rec: RecommendationCard) {
  return recommendationHasPositiveUpside(rec) && recommendationMeetsVerification(rec);
}

function whyNotRecommendedLabel(reason: string | null) {
  switch (reason) {
    case 'valuation_missing':
      return '估值資料不足，先留在社群早期題材。';
    case 'base_target_below_price':
      return '目前預估價尚未高於現價，因此不升級成正式推薦。';
    case 'non_positive_upside':
      return '目前沒有正向上行空間，因此暫不列入推薦。';
    case 'stock signal stale':
      return '技術與價格資料已過舊，等待刷新後再評估。';
    case 'market snapshot stale':
      return '大盤資料已過舊，等待刷新後再評估。';
    default:
      return null;
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function ema(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i += 1) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

function computeRsi(values: number[], period = 14): number {
  if (values.length < 2) return 50;
  const gains: number[] = [];
  const losses: number[] = [];
  for (let i = 1; i < values.length; i += 1) {
    const delta = values[i] - values[i - 1];
    gains.push(delta > 0 ? delta : 0);
    losses.push(delta < 0 ? -delta : 0);
  }
  const window = Math.min(period, gains.length);
  const avgGain = mean(gains.slice(-window));
  const avgLoss = mean(losses.slice(-window));
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function computeTechnicalSnapshot(priceSeries: number[]) {
  const maShort = mean(priceSeries.slice(-5));
  const maMid = mean(priceSeries.slice(-10));
  const maLong = mean(priceSeries.slice(-20));
  const rsi = computeRsi(priceSeries, 14);

  const ema12 = ema(priceSeries, 12);
  const ema26 = ema(priceSeries, 26);
  const macdSeries = ema12.map((value, idx) => value - (ema26[idx] || value));
  const macdSignalSeries = ema(macdSeries, 9);

  return {
    maShort: round(maShort, 2),
    maMid: round(maMid, 2),
    maLong: round(maLong, 2),
    rsi: round(rsi, 2),
    macd: round(macdSeries[macdSeries.length - 1] || 0, 4),
    macdSignal: round(macdSignalSeries[macdSignalSeries.length - 1] || 0, 4),
  };
}

function getLineClient(): LineClient {
  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not configured');
  }
  return new LineClient({ channelAccessToken });
}

export function isValidLineUserId(lineUserId: string): boolean {
  return /^U[0-9a-f]{32}$/i.test(lineUserId);
}

function maskLineUserId(lineUserId: string): string {
  if (!lineUserId) return '';
  if (lineUserId.length <= 8) return `${lineUserId.slice(0, 2)}***`;
  return `${lineUserId.slice(0, 4)}***${lineUserId.slice(-4)}`;
}

function parseLineError(error: unknown): { status: number | null; reason: string; details: unknown } {
  const err = error as {
    message?: string;
    statusCode?: number;
    status?: number;
    originalError?: { response?: { status?: number; data?: unknown } };
    response?: { status?: number; data?: unknown };
    body?: unknown;
  };

  const status =
    err?.statusCode ??
    err?.status ??
    err?.originalError?.response?.status ??
    err?.response?.status ??
    null;

  const details =
    err?.originalError?.response?.data ??
    err?.response?.data ??
    err?.body ??
    null;

  const reason = err?.message || 'unknown_line_push_error';
  return { status, reason, details };
}

function shouldDeliver(sub: Row, eventType: string, symbol: string | null): boolean {
  const preferences = ((sub.event_preferences as Row | undefined) || {});
  const digestEnabled = Boolean(sub.digest_enabled ?? true);
  const watchlist = Array.isArray(sub.watchlist)
    ? (sub.watchlist as unknown[]).map((item) => String(item).toUpperCase())
    : [];

  if (symbol && watchlist.length > 0 && !watchlist.includes(symbol.toUpperCase())) {
    return false;
  }

  if (eventType === 'daily_digest') {
    return digestEnabled && preferences.daily_digest !== false;
  }

  return preferences[eventType] !== false;
}

function renderLineMessage(event: Row): string {
  const eventType = String(event.event_type || 'unknown');
  const payload = ((event.payload as Row | undefined) || {});

  if (eventType === 'daily_digest') {
    const topRows = Array.isArray(payload.top_recommendations) ? payload.top_recommendations : [];
    const lines = ['StockInsider 每日摘要'];
    for (const row of topRows.slice(0, 5)) {
      const item = (row as Row);
      lines.push(
        `- ${String(item.symbol || 'N/A')} ${String(item.action || 'watch')} score=${toNumber(item.score).toFixed(2)} conf=${(toNumber(item.confidence) * 100).toFixed(0)}%`
      );
    }
    return lines.join('\n');
  }

  return [
    'StockInsider 策略提醒',
    `symbol=${String(payload.symbol || 'N/A')}`,
    `event=${String(payload.event || eventType)}`,
    `price=${String(payload.price || '-')}`,
    `target=${String(payload.target_price || '-')} stop=${String(payload.stop_loss || '-')}`,
  ].join('\n');
}

async function ensureStock(symbol: string, market: 'TW' | 'US', name: string, sector: string | null) {
  const supabaseServer = getSupabaseServerClient();
  const { data, error } = await supabaseServer
    .from('stocks')
    .upsert(
      {
        symbol,
        market,
        name,
        sector,
        updated_at: nowIso(),
      },
      { onConflict: 'symbol,market' }
    )
    .select('id,symbol,market,name')
    .single();

  if (error || !data) {
    throw new Error(error?.message || `failed upserting stock ${symbol}`);
  }

  return data as Row;
}

async function upsertSourceRegistry(sourceKey: string, sourceType: 'market' | 'institutional' | 'social' | 'kol') {
  const supabaseServer = getSupabaseServerClient();
  const { error } = await supabaseServer.from('source_registry').upsert(
    {
      source_key: sourceKey,
      source_type: sourceType,
      status: 'active',
      risk_level: sourceType === 'market' ? 'low' : 'medium',
      metadata: { managed_by: 'web-ingestion' },
      updated_at: nowIso(),
    },
    { onConflict: 'source_key' }
  );

  if (error) {
    throw new Error(error.message);
  }
}

async function recordSourceHealth(sourceKey: string, parseSuccessRatio: number, freshnessPassRate: number) {
  const supabaseServer = getSupabaseServerClient();
  const { error } = await supabaseServer.from('source_health_checks').insert({
    source_key: sourceKey,
    latency_ms: null,
    parse_success_ratio: parseSuccessRatio,
    freshness_pass_rate: freshnessPassRate,
    error_summary: null,
  });

  if (error) {
    throw new Error(error.message);
  }
}

type TWSERow = { Code: string; ClosingPrice: string; OpeningPrice: string; HighestPrice: string; LowestPrice: string; TradeVolume: string; Change: string };
type YahooChartBar = { time: string; open: number; high: number; low: number; close: number };

let twseCacheData: TWSERow[] | null = null;
let twseCacheTime = 0;

async function fetchTWSEAllPrices(): Promise<TWSERow[]> {
  const now = Date.now();
  if (twseCacheData && now - twseCacheTime < 15 * 60 * 1000) return twseCacheData;
  try {
    const res = await fetch('https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL', {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return twseCacheData || [];
    const data = await res.json() as TWSERow[];
    if (Array.isArray(data) && data.length > 0) {
      twseCacheData = data;
      twseCacheTime = now;
    }
    return twseCacheData || [];
  } catch {
    return twseCacheData || [];
  }
}

async function fetchTWSELivePrice(symbol: string): Promise<{ price: number; open: number; high: number; low: number; volume: number; change: number } | null> {
  const rows = await fetchTWSEAllPrices();
  const row = rows.find((item) => item.Code === symbol);
  if (!row) return null;
  const price = parseFloat(String(row.ClosingPrice).replace(/,/g, ''));
  const open = parseFloat(String(row.OpeningPrice).replace(/,/g, ''));
  const high = parseFloat(String(row.HighestPrice).replace(/,/g, ''));
  const low = parseFloat(String(row.LowestPrice).replace(/,/g, ''));
  const volume = parseInt(String(row.TradeVolume).replace(/,/g, ''), 10);
  const change = parseFloat(String(row.Change).replace(/[^0-9.-]/g, '')) || 0;
  if (!Number.isFinite(price) || price <= 0) return null;
  return { price, open: Number.isFinite(open) ? open : price, high: Number.isFinite(high) ? high : price, low: Number.isFinite(low) ? low : price, volume: Number.isFinite(volume) ? volume : 0, change };
}

async function fetchYahooHistChart(symbol: string): Promise<YahooChartBar[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?interval=1d&range=30d`;
    const res = await fetch(url, {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { chart?: { result?: Array<{ timestamp?: number[]; indicators?: { quote?: Array<{ open?: number[]; high?: number[]; low?: number[]; close?: number[] }> } }> } };
    const result = json.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const quote = result.indicators?.quote?.[0];
    if (!quote || timestamps.length === 0) return null;
    const bars: YahooChartBar[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const close = quote.close?.[i];
      const open = quote.open?.[i];
      const high = quote.high?.[i];
      const low = quote.low?.[i];
      if (!Number.isFinite(close) || !close) continue;
      const date = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
      bars.push({
        time: date,
        open: Number.isFinite(open) && open ? Number(open.toFixed(2)) : Number(close.toFixed(2)),
        high: Number.isFinite(high) && high ? Number(high.toFixed(2)) : Number(close.toFixed(2)),
        low: Number.isFinite(low) && low ? Number(low.toFixed(2)) : Number(close.toFixed(2)),
        close: Number(close.toFixed(2)),
      });
    }
    return bars.length > 0 ? bars : null;
  } catch {
    return null;
  }
}

async function ensureAgentProfiles() {
  const supabaseServer = getSupabaseServerClient();
  const payload = AGENCY_AGENT_ALLOWLIST.map((profile) => ({
    profile_key: profile.profileKey,
    source_library: profile.sourceLibrary,
    mapped_role: profile.mappedRole,
    status: 'active',
    execution_mode: 'reference_only',
    metadata: {
      source_url: profile.sourceUrl,
      imported_for: 'tw-story-alpha-radar',
    },
    updated_at: nowIso(),
  }));

  const { error } = await supabaseServer.from('agent_profiles').upsert(payload, { onConflict: 'profile_key' });
  if (error) {
    throw new Error(error.message);
  }
}

async function startAgentRun(runType: string, context: Record<string, unknown>) {
  const supabaseServer = getSupabaseServerClient();
  const runId = randomUUID();
  const { error } = await supabaseServer.from('agent_runs').insert({
    id: runId,
    run_type: runType,
    status: 'running',
    initiated_by: 'system',
    context,
  });
  if (error) {
    throw new Error(error.message);
  }
  return runId;
}

async function finishAgentRun(runId: string, status: 'success' | 'failed', context?: Record<string, unknown>) {
  const supabaseServer = getSupabaseServerClient();
  const { error } = await supabaseServer
    .from('agent_runs')
    .update({
      status,
      context: context || {},
      finished_at: nowIso(),
    })
    .eq('id', runId);
  if (error) {
    throw new Error(error.message);
  }
}

async function runAgentTask<T>(
  agentRunId: string,
  agentRole: string,
  taskType: string,
  profileKey: string | null,
  inputPayload: Record<string, unknown>,
  work: () => Promise<{ outputSummary: string; findings?: Array<{ stockId?: string | null; themeKey?: string | null; findingType: string; summary: string; confidence?: number; evidence?: unknown[]; sourceRefs?: unknown[] }>; result: T }>,
) {
  const supabaseServer = getSupabaseServerClient();
  const taskId = randomUUID();
  const { error: startError } = await supabaseServer.from('agent_tasks').insert({
    id: taskId,
    agent_run_id: agentRunId,
    agent_role: agentRole,
    profile_key: profileKey,
    task_type: taskType,
    status: 'running',
    input_payload: inputPayload,
  });
  if (startError) {
    throw new Error(startError.message);
  }

  try {
    const output = await work();
    const findingRows = (output.findings || []).map((finding) => ({
      agent_task_id: taskId,
      stock_id: finding.stockId || null,
      theme_key: finding.themeKey || null,
      finding_type: finding.findingType,
      summary: finding.summary,
      confidence: finding.confidence ?? 0.6,
      evidence: finding.evidence || [],
      source_refs: finding.sourceRefs || [],
    }));

    if (findingRows.length > 0) {
      const { error: findingsError } = await supabaseServer.from('agent_findings').insert(findingRows);
      if (findingsError) {
        throw new Error(findingsError.message);
      }
    }

    const { error: endError } = await supabaseServer
      .from('agent_tasks')
      .update({
        status: 'success',
        output_summary: output.outputSummary,
        reviewer_state: 'not_required',
        finished_at: nowIso(),
      })
      .eq('id', taskId);
    if (endError) {
      throw new Error(endError.message);
    }

    return { taskId, ...output };
  } catch (error) {
    await supabaseServer
      .from('agent_tasks')
      .update({
        status: 'failed',
        reviewer_state: 'pending',
        error_message: (error as Error).message,
        finished_at: nowIso(),
      })
      .eq('id', taskId);

    await supabaseServer.from('agent_review_queue').insert({
      agent_task_id: taskId,
      reason: (error as Error).message,
      evidence: { task_type: taskType, agent_role: agentRole, input_payload: inputPayload },
      state: 'pending',
    });
    throw error;
  }
}

function mapThemeHeatRow(raw: Row): ThemeHeatCard {
  const evidence = Array.isArray(raw.supporting_evidence) ? (raw.supporting_evidence as unknown[]) : [];
  const sourceCoverage = mergeSourceCoverage(
    evidence.map((item) => mapSourceCoverageItem((item as Row) || {})).filter((item) => item.summary || item.sourceName),
  );
  const symbols = Array.isArray(raw.related_symbols) ? (raw.related_symbols as unknown[]) : [];
  const verificationStatus = (raw.verification_status as VerificationStatus | undefined) || (sourceCoverage.some((item) => item.verificationStatus === '已證實') ? '已證實' : sourceCoverage.some((item) => item.verificationStatus === '部分證實') ? '部分證實' : '未證實');
  return {
    themeKey: String(raw.theme_key || ''),
    themeName: String(raw.theme_name || ''),
    windowType: (raw.window_type as ThemeHeatCard['windowType']) || 'daily',
    marketRegime: raw.market_regime ? String(raw.market_regime) : null,
    heatScore: toFiniteNumber(raw.heat_score),
    capitalFlowSignals: (raw.capital_flow_signals as Record<string, unknown>) || {},
    relatedSymbols: symbols.map((item) => String(item)),
    evidenceCount: evidence.length,
    asOfDate: String(raw.as_of_date || ''),
    verificationStatus,
    sourceCoverage,
    missingSources: findMissingSources(sourceCoverage),
    latestSourceAt: (raw.latest_source_at ? String(raw.latest_source_at) : latestSourceTimestamp(sourceCoverage)),
  };
}

function dedupeChartRows(rows: Row[]) {
  const uniqueByDay = new Map<string, Row>();
  for (const row of rows) {
    const dayKey = String(row.as_of || '').slice(0, 10);
    if (!dayKey) continue;
    const current = uniqueByDay.get(dayKey);
    const currentTs = current ? new Date(String(current.as_of || '')).getTime() : 0;
    const nextTs = new Date(String(row.as_of || '')).getTime();
    if (!current || nextTs > currentTs) {
      uniqueByDay.set(dayKey, row);
    }
  }
  return Array.from(uniqueByDay.entries())
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map((entry) => entry[1]);
}

function mapResearchMemo(raw: Row): ResearchMemoView {
  return {
    title: String(raw.title || ''),
    slug: String(raw.slug || ''),
    summary: String(raw.summary || ''),
    memoMarkdown: String(raw.memo_markdown || ''),
    reportKind: (raw.report_kind as ResearchMemoView['reportKind']) || 'daily_radar',
    recommendationState: raw.recommendation_state ? normalizeRecommendationState(raw.recommendation_state) : null,
    catalystCalendar: Array.isArray(raw.catalyst_calendar) ? (raw.catalyst_calendar as Array<Record<string, unknown>>) : [],
    entryExitRules: (raw.entry_exit_rules as Record<string, unknown>) || {},
    relatedSymbols: Array.isArray(raw.related_symbols) ? raw.related_symbols.map((item) => String(item)) : [],
  };
}

function mapEvidenceItem(raw: Row): StoryEvidenceItemView {
  return {
    evidenceClass: (raw.evidence_class as StoryEvidenceItemView['evidenceClass']) || 'news',
    sourceName: String(raw.source_name || ''),
    sourceUrl: raw.source_url ? String(raw.source_url) : null,
    headline: String(raw.headline || ''),
    excerpt: raw.excerpt ? String(raw.excerpt) : null,
    stance: (raw.stance as StoryEvidenceItemView['stance']) || 'neutral',
    evidenceStrength: toFiniteNumber(raw.evidence_strength),
    sourceTimestamp: String(raw.source_timestamp || ''),
  };
}

function mapValuationCase(raw: Row): ValuationCaseView {
  return {
    caseType: (raw.case_type as ValuationCaseView['caseType']) || 'base',
    targetPrice: raw.target_price == null ? null : toFiniteNumber(raw.target_price),
    expectedReturnPct: raw.expected_return_pct == null ? null : toFiniteNumber(raw.expected_return_pct),
    assumptions: (raw.assumptions as Record<string, unknown>) || {},
  };
}

function ensureValuationCaseCompleteness(valuationCases: ValuationCaseView[]) {
  const requiredCases: Array<ValuationCaseView['caseType']> = ['base', 'upside', 'invalidation'];
  const byType = new Map<ValuationCaseView['caseType'], ValuationCaseView>();
  for (const item of valuationCases) {
    if (!byType.has(item.caseType)) byType.set(item.caseType, item);
  }
  const completed = requiredCases.map((caseType) =>
    byType.get(caseType) || { caseType, targetPrice: null, expectedReturnPct: null, assumptions: { missing: true } },
  );
  return {
    valuationCases: completed,
    valuationCompleteness: {
      requiredCases,
      availableCases: Array.from(byType.keys()),
      isComplete: requiredCases.every((caseType) => byType.has(caseType)),
    },
  };
}

function buildFocusSummary(focus: DailyMarketFocus | null, topThemes: ThemeHeatCard[]) {
  if (!focus) {
    return '台股主題雷達尚未完成資料刷新，等待下一次市場掃描。';
  }

  const topSectors = Object.entries(focus.sectorFlows || {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([sector]) => sector);
  const themeSummary = topThemes.slice(0, 2).map((theme) => theme.themeName);
  const trendScore = toFiniteNumber((focus.indexState as Row).trend_score, 0.5);
  const regime = trendScore >= 0.68 ? 'risk-on' : trendScore >= 0.55 ? 'selective risk-on' : 'range-bound';

  return `目前台股處於 ${regime} 狀態，資金主軸聚焦 ${topSectors.join('、') || '高流動性大型股'}，優先追蹤 ${themeSummary.join('、') || '高熱度主題'}。`;
}

function mapBrokerView(raw: Row): BrokerView {
  return {
    brokerName: String(raw.broker_name || '未識別券商/投顧'),
    reportDate: raw.report_date ? String(raw.report_date) : null,
    rating: raw.rating ? String(raw.rating) : null,
    targetPrice: raw.target_price == null ? null : toFiniteNumber(raw.target_price),
    thesisTitle: raw.thesis_title ? String(raw.thesis_title) : null,
    summary: String(raw.extracted_summary || ''),
  };
}

function mapThesisModel(raw: Row): ThesisModelView {
  return {
    thesisTitle: String(raw.thesis_title || ''),
    thesisSummary: String(raw.thesis_summary || ''),
    recommendationTier: normalizeRecommendationState(raw.recommendation_tier),
    verificationStatus: (raw.verification_status as VerificationStatus | undefined) || '未證實',
    storySourceSummary: raw.story_source_summary ? String(raw.story_source_summary) : null,
    verificationSummary: raw.verification_summary ? String(raw.verification_summary) : null,
    financialProjectionSummary: raw.financial_projection_summary ? String(raw.financial_projection_summary) : null,
    valuationSummary: raw.valuation_summary ? String(raw.valuation_summary) : null,
    invalidationSummary: raw.invalidation_summary ? String(raw.invalidation_summary) : null,
    targetPriceLow: raw.target_price_low == null ? null : toFiniteNumber(raw.target_price_low),
    targetPriceHigh: raw.target_price_high == null ? null : toFiniteNumber(raw.target_price_high),
    confidence: toFiniteNumber(raw.confidence, 0.5),
  };
}

function mapEvidenceMatrix(raw: Row): EvidenceMatrixView {
  return {
    evidenceType: (raw.evidence_type as EvidenceMatrixView['evidenceType']) || 'social',
    sourceLabel: String(raw.source_label || ''),
    sourceUrl: raw.source_url ? String(raw.source_url) : null,
    stance: (raw.stance as EvidenceMatrixView['stance']) || 'neutral',
    strength: toFiniteNumber(raw.strength, 0.5),
    summary: String(raw.summary || ''),
  };
}

function fallbackAgentStatusSummary(): AgentStatusSummary {
  return {
    activeRunType: 'demo-fallback',
    runCount24h: 1,
    lastSuccessfulRunAt: nowIso(),
    startedRoles: Array.from(new Set(AGENCY_AGENT_ALLOWLIST.map((profile) => profile.mappedRole))),
    allowlistedProfiles: AGENCY_AGENT_ALLOWLIST.map((profile) => profile.profileKey),
  };
}

function fallbackRecommendationState(seed: ResearchSeed): RecommendationState {
  if (seed.expectationScore >= 0.82) return 'actionable_setup';
  if (seed.expectationScore >= 0.7) return 'partially_verified';
  return 'signal_candidate';
}

function fallbackRecommendation(seed: ResearchSeed): RecommendationCard {
  const rawPrice = seed.prices[seed.prices.length - 1];
  const price = rawPrice > 0 ? rawPrice : 100;
  const technical = computeTechnicalSnapshot(rawPrice > 0 ? [...seed.prices] : [100]);
  const override = SEED_RESEARCH_OVERRIDES[seed.symbol];
  const foundTarget = override?.targetPrice ?? seed.valuationCases.find((item) => item.caseType === 'base')?.targetPrice;
  const baseTarget = foundTarget && foundTarget > price ? foundTarget : price * 1.05;
  const stopLoss = override ? round(override.invalidationPrice > 0 ? override.invalidationPrice : price * 0.94, 2) : round(price * 0.94, 2);
  const recommendationState = fallbackRecommendationState(seed);
  const timingScore = round(
    clamp(
      (price >= technical.maShort ? 0.34 : 0.14) +
        (technical.maShort >= technical.maMid ? 0.24 : 0.1) +
        (technical.rsi >= 48 && technical.rsi <= 72 ? 0.2 : 0.08) +
        (technical.macd >= technical.macdSignal ? 0.22 : 0.1),
    ),
    4,
  );
  const communitySignalScore = round(clamp(mean(seed.socialSignals.map((signal) => signal.confidence)) * 0.35), 4);
  const evidenceScore = round(clamp(seed.expectationScore * 0.68 + 0.12), 4);
  const verificationStatus = verificationStatusFromState(recommendationState);

  return {
    recommendationId: `demo-${seed.symbol}`,
    symbol: seed.symbol,
    name: seed.name,
    market: seed.market,
    score: round(clamp(seed.expectationScore * 0.82 + timingScore * 0.18), 4),
    confidence: round(clamp(seed.expectationScore * 0.9 + 0.06), 4),
    action: recommendationState === 'actionable_setup' ? 'buy' : 'watch',
    rationale: `${seed.themeName} / ${seed.reportTitle}`,
    targetPrice: baseTarget,
    stopLoss,
    strategyState: recommendationState === 'actionable_setup' ? 'active' : 'invalidated',
    recommendationState,
    storyType: override?.storyType ?? seed.storyType,
    thesisTitle: override?.thesisTitle ?? seed.thesisTitle,
    thesisSummary: override?.thesisSummary ?? seed.thesisSummary,
    catalystSummary: override?.catalystSummary ?? seed.catalystSummary,
    expectedUpsidePct: round(((baseTarget - price) / price) * 100, 2),
    valuationSource: 'demo_seed',
    valuationConfidence: 0.45,
    isFallbackValuation: true,
    evidenceScore,
    timingScore,
    communitySignalScore,
    verificationStatus,
    conditionalRecommendationNote:
      recommendationState === 'signal_candidate'
        ? '目前主要由社群與市場話題驅動，官方與財務資料尚未充分證實，屬於早期觀察名單。'
        : recommendationState === 'partially_verified'
          ? '已有部分法說、財務或產業資料支持，但 thesis 尚未完全閉環，適合小部位提早卡位。'
          : '官方與數據證據已逐步到位，可依技術面與風險控管規則執行。',
    chineseName: CHINESE_NAME_MAP[seed.symbol] ?? null,
    firstRecommendedAt: null,
    estimatedCatalystDate: CATALYST_DATE_MAP[seed.symbol] ?? null,
  };
}

function fallbackThemeRows(windowType: ThemeHeatCard['windowType']): ThemeHeatCard[] {
  const grouped = new Map<string, ResearchSeed[]>();
  for (const seed of TW_STORY_RESEARCH_SEEDS) {
    const current = grouped.get(seed.themeKey) || [];
    grouped.set(seed.themeKey, [...current, seed]);
  }

  return Array.from(grouped.entries())
    .map(([themeKey, seeds]) => {
      const expectation = mean(seeds.map((seed) => seed.expectationScore));
      const momentum = mean(seeds.map((seed) => {
        const last = seed.prices[seed.prices.length - 1];
        const first = seed.prices[0];
        return first > 0 ? (last - first) / first : 0;
      }));
      const modifier = windowType === 'daily' ? 1 : windowType === 'three_day' ? 0.97 : 0.94;
      const sourceCoverage = mergeSourceCoverage(
        seeds.flatMap((seed) =>
          seed.socialSignals.map((signal) =>
            mapSourceCoverageItem({
              source_name: signal.sourceName,
              source_type: signal.sourceType,
              summary: signal.summary,
              source_url: signal.sourceUrl || null,
              source_timestamp: nowIso(),
              symbols: [seed.symbol],
              confidence: signal.confidence,
              weight: signal.sourceType === 'KOL' ? 0.12 : signal.sourceType === 'PTT' ? 0.1 : signal.sourceType === 'BullTalk' ? 0.11 : 0.09,
              verification_status: signal.confidence >= 0.6 ? '部分證實' : '未證實',
            }),
          ),
        ),
      );
      sourceCoverage.push(
        mapSourceCoverageItem({
          source_name: '官方/財務資料',
          source_type: 'official',
          summary: '法說會、財報與月營收資料作為後續驗證基礎。',
          source_url: 'https://mops.twse.com.tw/',
          source_timestamp: nowIso(),
          symbols: seeds.map((seed) => seed.symbol),
          confidence: expectation >= 0.8 ? 0.72 : 0.46,
          weight: 0.22,
          verification_status: expectation >= 0.8 ? '已證實' : '部分證實',
        }),
      );
      sourceCoverage.push(
        mapSourceCoverageItem({
          source_name: '財務/月營收資料',
          source_type: 'financial',
          summary: '月營收、EPS 預估與毛利率趨勢作為財務驗證基礎。',
          source_url: 'https://mops.twse.com.tw/',
          source_timestamp: nowIso(),
          symbols: seeds.map((seed) => seed.symbol),
          confidence: expectation >= 0.75 ? 0.65 : 0.40,
          weight: 0.18,
          verification_status: expectation >= 0.75 ? '部分證實' : '未證實',
        }),
      );
      const hasSocialCoverage = sourceCoverage.some((item) =>
        ['ptt', 'bulltalk', 'kol', 'threads'].includes(item.sourceType.toLowerCase()),
      );
      if (!hasSocialCoverage) {
        for (const [sourceType, sourceName] of [['ptt', 'PTT Stock 板'], ['bulltalk', '股市爆料同學會']] as const) {
          sourceCoverage.push(
            mapSourceCoverageItem({
              source_name: sourceName,
              source_type: sourceType,
              summary: '社群資料收集中，自動排程每日 07:30 執行。',
              source_url: null,
              source_timestamp: nowIso(),
              symbols: seeds.map((s) => s.symbol),
              confidence: 0.30,
              weight: communityWeightForSource(sourceType),
              verification_status: '未證實',
            }),
          );
        }
      }
      const mergedCoverage = mergeSourceCoverage(sourceCoverage);
      const verificationStatus: VerificationStatus = mergedCoverage.some((item) => item.verificationStatus === '已證實')
        ? '已證實'
        : mergedCoverage.some((item) => item.verificationStatus === '部分證實')
          ? '部分證實'
          : '未證實';
      return {
        themeKey,
        themeName: seeds[0]?.themeName || themeKey,
        windowType,
        marketRegime: 'risk-on-ai',
        heatScore: round(clamp((expectation * 0.72 + (momentum + 0.5) * 0.28) * modifier), 4),
        capitalFlowSignals: {
          avgExpectationScore: round(expectation, 4),
          avgPriceMomentum: round(momentum, 4),
          source: 'demo-fallback',
        },
        relatedSymbols: seeds.map((seed) => seed.symbol),
        evidenceCount: mergedCoverage.length,
        asOfDate: asIsoDate(nowIso()),
        verificationStatus,
        sourceCoverage: mergedCoverage,
        missingSources: findMissingSources(mergedCoverage),
        latestSourceAt: latestSourceTimestamp(mergedCoverage),
      };
    })
    .sort((a, b) => b.heatScore - a.heatScore);
}

function fallbackResearchMemos(): ResearchMemoView[] {
  const asOf = asIsoDate(nowIso());
  const recommendations = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation);
  return [
    {
      title: `StockInsider 每日雷達 ${asOf}`,
      slug: `demo-daily-radar-${asOf}`,
      summary: '當 live Supabase 尚未提供完整資料時，使用本地研究種子產生的示範雷達。',
      memoMarkdown: '# 每日雷達',
      reportKind: 'daily_radar',
      recommendationState: null,
      catalystCalendar: [],
      entryExitRules: {},
      relatedSymbols: recommendations.slice(0, 4).map((item) => item.symbol),
    },
    {
      title: `StockInsider 每週高信念清單 ${asOf}`,
      slug: `demo-weekly-conviction-${asOf}`,
      summary: '以台股研究種子整理出的高信念情境與候選標的。',
      memoMarkdown: '# 每週高信念清單',
      reportKind: 'weekly_conviction',
      recommendationState: 'actionable_setup',
      catalystCalendar: [],
      entryExitRules: {},
      relatedSymbols: recommendations.filter((item) => item.recommendationState === 'actionable_setup').map((item) => item.symbol),
    },
    ...fallbackThemeRows('daily').slice(0, 3).map((theme) => ({
      title: `${theme.themeName} 主題摘要`,
      slug: `demo-theme-${theme.themeKey}-${asOf}`,
      summary: `${theme.themeName} 仍是目前最值得追蹤的故事群之一。`,
      memoMarkdown: `# ${theme.themeName}`,
      reportKind: 'hot_theme' as const,
      recommendationState: null,
      catalystCalendar: [],
      entryExitRules: {},
      relatedSymbols: theme.relatedSymbols,
    })),
  ];
}

function fallbackDailyDashboardData() {
  const recommendations = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation);
  const marketFocus: DailyMarketFocus[] = [
    {
      market: 'TW',
      asOf: nowIso(),
      sectorFlows: { Semiconductors: 0.84, 'AI Servers': 0.79, Networking: 0.52 },
      indexState: { taiex: 'bullish', trend_score: 0.72 },
      freshness: 'fresh',
    },
    {
      market: 'US',
      asOf: nowIso(),
      sectorFlows: { Technology: 0.67, Semiconductors: 0.64, Software: 0.58 },
      indexState: { nasdaq: 'bullish', trend_score: 0.63 },
      freshness: 'fresh',
    },
  ];

  return { marketFocus, recommendations, riskDisclosure: RISK_DISCLOSURE };
}

async function fetchHistoricalPrices(symbol: string): Promise<Array<{ time: string; open: number; high: number; low: number; close: number }> | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=6mo&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockInsider/1.0)' },
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result?.timestamp || !result?.indicators?.quote?.[0]) return null;
    const q = result.indicators.quote[0];
    return (result.timestamp as number[])
      .map((ts: number, i: number) => ({
        time: new Date(ts * 1000).toISOString().slice(0, 10),
        open: round(q.open?.[i] ?? 0, 2),
        high: round(q.high?.[i] ?? 0, 2),
        low: round(q.low?.[i] ?? 0, 2),
        close: round(q.close?.[i] ?? 0, 2),
      }))
      .filter((c) => c.close > 0);
  } catch {
    return null;
  }
}

async function fetchStockQuote(symbol: string): Promise<{ name: string; price: number; changePct: number; volume: number | null } | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.TW?range=1d&interval=1d`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; StockInsider/1.0)' },
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    return {
      name: meta.shortName || meta.symbol || symbol,
      price: meta.regularMarketPrice ?? 0,
      changePct: meta.regularMarketChangePercent ?? 0,
      volume: meta.regularMarketVolume ?? null,
    };
  } catch {
    return null;
  }
}

async function fallbackStockInsight(symbol: string): Promise<StockInsightPayload | null> {
  const seed = TW_STORY_RESEARCH_SEEDS.find((item) => item.symbol === symbol.toUpperCase());
  if (!seed) return null;
  const seedPrice = seed.prices[seed.prices.length - 1];
  const realChart = await fetchHistoricalPrices(seed.symbol);
  const price = realChart && realChart.length > 0 ? realChart[realChart.length - 1].close : seedPrice;
  const technical = computeTechnicalSnapshot(realChart ? realChart.map((c) => c.close) : [...seed.prices]);
  const chart = realChart ?? seed.prices.map((close, index) => {
    const spread = Math.max(2, close * 0.015);
    const open = close - (index % 2 === 0 ? spread * 0.45 : -spread * 0.35);
    const high = Math.max(open, close) + spread * 0.6;
    const low = Math.min(open, close) - spread * 0.4;
    return {
      time: new Date(Date.now() - (seed.prices.length - index) * 86400000).toISOString().slice(0, 10),
      open: round(open, 2),
      high: round(high, 2),
      low: round(low, 2),
      close: round(close, 2),
    };
  });
  const recommendation = fallbackRecommendation(seed);

  return {
    symbol: seed.symbol,
    name: seed.name,
    market: seed.market,
    price,
    volume: seed.volume,
    asOf: nowIso(),
    freshness: 'fresh',
    chart,
    indicators: {
      maShort: technical.maShort,
      maMid: technical.maMid,
      maLong: technical.maLong,
      rsi: technical.rsi,
      macd: technical.macd,
      macdSignal: technical.macdSignal,
    },
    chipMetrics: {
      foreign_net: 12400,
      investment_trust_net: 3400,
      dealer_net: -800,
      source: 'demo-fallback',
    },
    strategy: {
      id: `demo-strategy-${seed.symbol}`,
      recommendationId: recommendation.recommendationId,
      entryRule: `Scale in while price holds above MA5 (${technical.maShort.toFixed(2)}) and evidence score remains positive.`,
      positionSizeRule: recommendation.recommendationState === 'actionable_setup' ? '先以 8-12% 部位建立，待催化確認後再加碼' : '僅限試單，等待確認 K 棒後再評估擴大部位',
      targetPrice: recommendation.targetPrice || null,
      stopLoss: recommendation.stopLoss || null,
      reviewHorizon: recommendation.recommendationState === 'actionable_setup' ? '1-3 個月' : '每 3 個交易日檢視一次',
      state: recommendation.recommendationState === 'actionable_setup' ? 'active' : 'invalidated',
    },
    recommendation,
    riskDisclosure: RISK_DISCLOSURE,
  };
}

function fallbackThemeDetail(themeKey: string): ThemeDetailPayload | null {
  const theme = fallbackThemeRows('daily').find((item) => item.themeKey === themeKey) || null;
  if (!theme) return null;
  const relatedSeeds = TW_STORY_RESEARCH_SEEDS.filter((seed) => theme.relatedSymbols.includes(seed.symbol));
  return {
    theme,
    opportunities: relatedSeeds.map(fallbackRecommendation).filter(recommendationIsFormal),
    supportingStories: relatedSeeds.map((seed) => ({
      symbol: seed.symbol,
      title: seed.thesisTitle,
      storyType: seed.storyType,
      thesisState: fallbackRecommendationState(seed),
      catalystSummary: seed.catalystSummary,
    })),
    reports: fallbackResearchMemos().filter((memo) => memo.relatedSymbols.some((symbol) => theme.relatedSymbols.includes(symbol))),
    sourceCoverage: theme.sourceCoverage,
    missingSources: theme.missingSources,
  };
}

async function fallbackStockDeepDive(symbol: string): Promise<StockDeepDivePayload | null> {
  const seed = TW_STORY_RESEARCH_SEEDS.find((item) => item.symbol === symbol.toUpperCase());
  const insight = await fallbackStockInsight(symbol);
  if (!seed || !insight) return null;
  const override = SEED_RESEARCH_OVERRIDES[seed.symbol];

  return {
    ...insight,
    thesisState: fallbackRecommendationState(seed),
    verificationStatus: verificationStatusFromState(fallbackRecommendationState(seed)),
    storyType: override?.storyType ?? seed.storyType,
    thesisTitle: override?.thesisTitle ?? seed.thesisTitle,
    thesisSummary: override?.thesisSummary ?? seed.thesisSummary,
    catalystSummary: override?.catalystSummary ?? seed.catalystSummary,
    expectedUpsidePct: fallbackRecommendation(seed).expectedUpsidePct || null,
    evidenceScore: round(clamp(seed.expectationScore * 0.9), 4),
    timingScore: fallbackRecommendation(seed).timingScore || null,
    evidenceItems: [
      {
        evidenceClass: 'public_research',
        sourceName: 'public-research-digest',
        sourceUrl: null,
        headline: seed.reportTitle,
        excerpt: seed.reportSummary,
        stance: 'supporting',
        evidenceStrength: 0.76,
        sourceTimestamp: nowIso(),
      },
      ...seed.companyEvents.map((event) => ({
        evidenceClass: 'company' as const,
        sourceName: 'company_events',
        sourceUrl: event.sourceUrl,
        headline: event.headline,
        excerpt: event.summary,
        stance: 'supporting' as const,
        evidenceStrength: 0.82,
        sourceTimestamp: nowIso(),
      })),
      {
        evidenceClass: 'transcript',
        sourceName: 'conference_transcripts',
        sourceUrl: seed.transcript.sourceUrl,
        headline: seed.transcript.eventName,
        excerpt: seed.transcript.excerpt,
        stance: 'supporting',
        evidenceStrength: 0.8,
        sourceTimestamp: nowIso(),
      },
    ],
    valuationCases: override
      ? [
          { caseType: 'base' as const, targetPrice: override.targetPrice, expectedReturnPct: round(((override.targetPrice - insight.price) / insight.price) * 100, 1), assumptions: {} },
          { caseType: 'upside' as const, targetPrice: override.upsidePrice, expectedReturnPct: round(((override.upsidePrice - insight.price) / insight.price) * 100, 1), assumptions: {} },
          { caseType: 'invalidation' as const, targetPrice: override.invalidationPrice, expectedReturnPct: round(((override.invalidationPrice - insight.price) / insight.price) * 100, 1), assumptions: {} },
        ]
      : seed.valuationCases.map((item) => ({
          caseType: item.caseType,
          targetPrice: item.targetPrice,
          expectedReturnPct: item.expectedReturnPct,
          assumptions: item.assumptions,
        })),
    companyEvents: seed.companyEvents.map((event) => ({
      eventType: event.eventType,
      headline: event.headline,
      summary: event.summary,
      sourceUrl: event.sourceUrl,
      eventTimestamp: nowIso(),
    })),
    revenueSignal: {
      asOfDate: asIsoDate(nowIso()),
      monthlyRevenue: override?.monthlyRevenue ?? seed.revenue.monthlyRevenue,
      yoyGrowth: override?.revenueYoyGrowth ?? seed.revenue.yoyGrowth,
      momGrowth: seed.revenue.momGrowth,
    },
    fundamentalSnapshot: {
      asOfDate: asIsoDate(nowIso()),
      epsTtm: override?.epsTtm ?? seed.fundamentals.epsTtm,
      grossMargin: override?.grossMargin ?? seed.fundamentals.grossMargin,
      operatingMargin: override?.operatingMargin ?? seed.fundamentals.operatingMargin,
      peRatio: override?.peRatio ?? seed.fundamentals.peRatio,
      pbRatio: seed.fundamentals.pbRatio,
    },
    memo: fallbackResearchMemos().find((memo) => memo.relatedSymbols.includes(seed.symbol)) || null,
    agentStatus: fallbackAgentStatusSummary(),
    communitySignals: mergeSourceCoverage(
      seed.socialSignals.map((signal) =>
        mapSourceCoverageItem({
          source_name: signal.sourceName,
          source_type: signal.sourceType,
          summary: signal.summary,
          source_url: signal.sourceUrl || null,
          source_timestamp: nowIso(),
          symbols: [seed.symbol],
          confidence: signal.confidence,
          weight: signal.sourceType === 'KOL' ? 0.12 : signal.sourceType === 'PTT' ? 0.1 : signal.sourceType === 'BullTalk' ? 0.11 : 0.09,
          verification_status: signal.confidence >= 0.6 ? '部分證實' : '未證實',
        }),
      ),
    ),
    verificationTimeline: [
      { stage: '未證實', summary: '【第一層】社群早期訊號 — PTT、股市爆料同學會、台股 KOL 出現討論熱度，作為前置發現來源。', completed: true },
      { stage: '部分證實', summary: '【第二層】多源交叉驗證 — 多個社群平台相互印證，訊息可信度提升。', completed: fallbackRecommendationState(seed) !== 'signal_candidate' },
      { stage: '已證實', summary: '【第三層】官方/財務確認 — 法說會、月營收、券商報告最終驗證，完成論點閉環。', completed: fallbackRecommendationState(seed) === 'validated_thesis' || fallbackRecommendationState(seed) === 'actionable_setup' },
    ],
    conditionalRecommendationNote: fallbackRecommendation(seed).conditionalRecommendationNote || '',
    brokerViews: [
      {
        brokerName: '公開研究摘要',
        reportDate: asIsoDate(nowIso()),
        rating: fallbackRecommendationState(seed) === 'actionable_setup' ? '可執行進場' : '持續追蹤',
        targetPrice: override?.targetPrice ?? seed.valuationCases.find((item) => item.caseType === 'base')?.targetPrice ?? null,
        thesisTitle: override?.thesisTitle ?? seed.reportTitle,
        summary: override?.thesisSummary ?? seed.reportSummary,
      },
    ],
    sourceCoverage: mergeSourceCoverage([
      ...seed.socialSignals.map((signal) =>
        mapSourceCoverageItem({
          source_name: signal.sourceName,
          source_type: signal.sourceType,
          summary: signal.summary,
          source_url: signal.sourceUrl || null,
          source_timestamp: nowIso(),
          symbols: [seed.symbol],
          confidence: signal.confidence,
          weight: signal.sourceType === 'KOL' ? 0.12 : signal.sourceType === 'PTT' ? 0.1 : signal.sourceType === 'BullTalk' ? 0.11 : 0.09,
          verification_status: signal.confidence >= 0.6 ? '部分證實' : '未證實',
        }),
      ),
      mapSourceCoverageItem({
        source_name: '公開研究摘要',
        source_type: 'public_research',
        summary: seed.reportSummary,
        source_timestamp: nowIso(),
        symbols: [seed.symbol],
        confidence: 0.82,
        weight: 0.2,
        verification_status: '已證實',
      }),
    ]),
    missingCoverage: findMissingSources(
      mergeSourceCoverage([
        ...seed.socialSignals.map((signal) =>
          mapSourceCoverageItem({
            source_name: signal.sourceName,
            source_type: signal.sourceType,
            summary: signal.summary,
            source_url: signal.sourceUrl || null,
            source_timestamp: nowIso(),
            symbols: [seed.symbol],
            confidence: signal.confidence,
            weight: signal.sourceType === 'KOL' ? 0.12 : signal.sourceType === 'PTT' ? 0.1 : signal.sourceType === 'BullTalk' ? 0.11 : 0.09,
            verification_status: signal.confidence >= 0.6 ? '部分證實' : '未證實',
          }),
        ),
        mapSourceCoverageItem({
          source_name: '公開研究摘要',
          source_type: 'public_research',
          summary: seed.reportSummary,
          source_timestamp: nowIso(),
          symbols: [seed.symbol],
          confidence: 0.82,
          weight: 0.2,
          verification_status: '已證實',
        }),
      ]),
    ),
    thesisModel: {
      thesisTitle: override?.thesisTitle ?? seed.thesisTitle,
      thesisSummary: override?.thesisSummary ?? seed.thesisSummary,
      recommendationTier: fallbackRecommendationState(seed),
      verificationStatus: verificationStatusFromState(fallbackRecommendationState(seed)),
      storySourceSummary: override?.catalystSummary ?? seed.catalystSummary,
      verificationSummary: '以公開研究、公司事件、法說會節錄與市場線索交叉整理的 fallback thesis。',
      financialProjectionSummary: override && override.epsTtm > 0
        ? `目前 EPS(TTM) NT$${override.epsTtm}，毛利率 ${override.grossMargin}%。基於${override.thesisTitle || seed.thesisTitle}的邏輯，預估未來 2-3 季營收成長率可達 ${override.revenueYoyGrowth > 0 ? override.revenueYoyGrowth.toFixed(0) : '15'}%+。`
        : override
          ? `目前 EPS(TTM) 為負值（NT$${override.epsTtm}），但基於${override.thesisTitle || seed.thesisTitle}的供需邏輯，預估營收將大幅成長，YoY +${override.revenueYoyGrowth > 0 ? override.revenueYoyGrowth.toFixed(0) : '15'}%。`
          : '目前以 fallback seed 的營收與估值假設作為替代，待 live thesis model 覆蓋。',
      valuationSummary: override
        ? `base case 目標價 NT$${override.targetPrice}，upside NT$${override.upsidePrice}，失效價 NT$${override.invalidationPrice}`
        : `base case 目標價 ${seed.valuationCases.find((item) => item.caseType === 'base')?.targetPrice || '-'}`,
      invalidationSummary: override
        ? `失效價 NT$${override.invalidationPrice}。若核心催化劑未兌現或產業趨勢反轉，需重新檢查 thesis。`
        : '若公司事件未持續驗證、技術面失守或產業需求不如預期，需重新檢查 thesis。',
      targetPriceLow: override?.invalidationPrice ?? seed.valuationCases.find((item) => item.caseType === 'invalidation')?.targetPrice ?? null,
      targetPriceHigh: override?.upsidePrice ?? seed.valuationCases.find((item) => item.caseType === 'upside')?.targetPrice ?? null,
      confidence: 0.68,
    },
    kolCoverage: [],
    podcastMentions: [],
    sourceDiscoveryStatus: { approvedCount: 0, pendingCount: 0, monitorOnlyCount: 0 },
    connectorStatus: [],
    riskCounterpoints: [
      {
        label: '核心失效條件',
        summary: '若市場故事無法被法說會、月營收或產業報價持續驗證，早期題材可能快速失效。',
      },
    ],
    evidenceMatrix: [
      {
        evidenceType: 'broker_report',
        sourceLabel: '公開研究摘要',
        sourceUrl: null,
        stance: 'supporting',
        strength: 0.82,
        summary: seed.reportSummary,
      },
    ],
  };
}

async function getDiscoveredStocks(): Promise<DiscoveredStockCard[]> {
  try {
    const supabase = getSupabaseServerClient();
    const seedSymbols: Set<string> = new Set(TW_STORY_RESEARCH_SEEDS.map((s) => s.symbol));
    const since = new Date(Date.now() - 14 * 86400000).toISOString();

    const [socialRes, brokerRes, transcriptRes, podcastRes, stocksRes, storyRes, valuationRes, thesisRes] = await Promise.all([
      supabase
        .from('source_raw_documents')
        .select('symbols, source_type, source_name, summary, source_url, source_timestamp, content_text')
        .gte('created_at', since)
        .limit(500),
      supabase
        .from('broker_report_documents')
        .select('stock_id, broker_name, summary, rating, target_price, created_at')
        .gte('created_at', since)
        .limit(200),
      supabase
        .from('conference_transcripts')
        .select('stock_id, event_name, transcript_excerpt, management_tone, catalyst_mentions, created_at')
        .gte('created_at', since)
        .limit(200),
      supabase
        .from('podcast_transcripts')
        .select('symbols, podcast_name, episode_title, excerpt, thesis_highlights, created_at')
        .gte('created_at', since)
        .limit(100),
      supabase.from('stocks').select('id,symbol,name').limit(5000),
      supabase
        .from('story_candidates')
        .select('stock_id,title,summary,verification_status,thesis_state,as_of_date')
        .order('as_of_date', { ascending: false })
        .limit(500),
      supabase
        .from('valuation_cases')
        .select('stock_id,case_type,target_price,updated_at')
        .order('updated_at', { ascending: false })
        .limit(2000),
      supabase
        .from('thesis_models')
        .select('stock_id,thesis_title,thesis_summary,verification_status,recommendation_tier,target_price_low,target_price_high,updated_at')
        .order('updated_at', { ascending: false })
        .limit(1000),
    ]);

    const mentionMap = new Map<string, { count: number; sources: DiscoveredStockSource[]; latest: string }>();
    const stockBySymbol = new Map<string, { stockId: string; name: string | null }>();

    for (const row of (stocksRes.data as Row[]) || []) {
      const stockId = String(row.id || '');
      const symbol = String(row.symbol || '');
      if (!stockId || !symbol) continue;
      stockBySymbol.set(symbol, {
        stockId,
        name: row.name ? String(row.name) : null,
      });
    }

    function addMention(sym: string, source: DiscoveredStockSource) {
      const num = parseInt(sym, 10);
      if (isNaN(num) || num < 1101 || num > 9999) return;
      if (seedSymbols.has(sym)) return;
      const existing = mentionMap.get(sym);
      if (existing) {
        existing.count++;
        existing.sources.push(source);
        if (source.sourceTimestamp && source.sourceTimestamp > existing.latest) existing.latest = source.sourceTimestamp;
      } else {
        mentionMap.set(sym, { count: 1, sources: [source], latest: source.sourceTimestamp || nowIso() });
      }
    }

    const symbolRegex = /\b([1-9]\d{3})\b/g;

    // 社群來源
    for (const doc of (socialRes.data as Row[]) || []) {
      const symbols: string[] = [...((doc.symbols as string[]) || [])];
      let match;
      while ((match = symbolRegex.exec(String(doc.content_text || ''))) !== null) {
        if (!symbols.includes(match[1])) symbols.push(match[1]);
      }
      symbolRegex.lastIndex = 0;
      for (const sym of symbols) {
        addMention(sym, {
          sourceType: String(doc.source_type || 'social'),
          sourceName: String(doc.source_name || ''),
          summary: String(doc.summary || '').slice(0, 200),
          sourceUrl: (doc.source_url as string) || null,
          sourceTimestamp: (doc.source_timestamp as string) || null,
        });
      }
    }

    // 投顧報告
    for (const doc of (brokerRes.data as Row[]) || []) {
      const stockId = String(doc.stock_id || '');
      let match;
      while ((match = symbolRegex.exec(stockId)) !== null) {
        addMention(match[1], {
          sourceType: 'broker_report',
          sourceName: String(doc.broker_name || '投顧報告'),
          summary: String(doc.summary || '').slice(0, 200),
          sourceUrl: null,
          sourceTimestamp: (doc.created_at as string) || null,
        });
      }
      symbolRegex.lastIndex = 0;
    }

    // 法說會 + MOPS
    for (const doc of (transcriptRes.data as Row[]) || []) {
      const stockId = String(doc.stock_id || '');
      let match;
      while ((match = symbolRegex.exec(stockId)) !== null) {
        addMention(match[1], {
          sourceType: String(doc.event_name || '').startsWith('[MOPS]') ? 'mops' : 'earnings_call',
          sourceName: String(doc.event_name || '法說會'),
          summary: String(doc.transcript_excerpt || '').slice(0, 200),
          sourceUrl: null,
          sourceTimestamp: (doc.created_at as string) || null,
        });
      }
      symbolRegex.lastIndex = 0;
    }

    // Podcast
    for (const doc of (podcastRes.data as Row[]) || []) {
      const symbols: string[] = (doc.symbols as string[]) || [];
      for (const sym of symbols) {
        addMention(sym, {
          sourceType: 'podcast',
          sourceName: String(doc.podcast_name || ''),
          summary: String(doc.excerpt || '').slice(0, 200),
          sourceUrl: null,
          sourceTimestamp: (doc.created_at as string) || null,
        });
      }
    }

    const latestStoryByStock = new Map<string, Row>();
    for (const row of (storyRes.data as Row[]) || []) {
      const stockId = String(row.stock_id || '');
      if (!stockId || latestStoryByStock.has(stockId)) continue;
      latestStoryByStock.set(stockId, row);
    }

    const valuationByStock = new Map<string, { base: number | null; upside: number | null }>();
    for (const row of (valuationRes.data as Row[]) || []) {
      const stockId = String(row.stock_id || '');
      if (!stockId) continue;
      const target = toFiniteNumber(row.target_price, 0);
      if (!(target > 0)) continue;
      const current = valuationByStock.get(stockId) || { base: null, upside: null };
      const caseType = String(row.case_type || '');
      if (caseType === 'base' && current.base == null) current.base = target;
      if (caseType === 'upside' && current.upside == null) current.upside = target;
      valuationByStock.set(stockId, current);
    }

    const thesisByStock = new Map<string, Row>();
    for (const row of (thesisRes.data as Row[]) || []) {
      const stockId = String(row.stock_id || '');
      if (!stockId || thesisByStock.has(stockId)) continue;
      thesisByStock.set(stockId, row);
    }

    // 過濾至少 2 次提及，排序，取前 30
    const candidates = Array.from(mentionMap.entries())
      .filter(([symbol, v]) => v.count >= 2 && stockBySymbol.has(symbol))
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 30);

    // 批次取得報價
    const results: DiscoveredStockCard[] = await Promise.all(
      candidates.map(async ([symbol, data]) => {
        const quote = await fetchStockQuote(symbol);
        const stockMeta = stockBySymbol.get(symbol) || null;
        const stockId = stockMeta?.stockId || null;
        const story = stockId ? latestStoryByStock.get(stockId) || null : null;
        const thesis = stockId ? thesisByStock.get(stockId) || null : null;
        const valuation = stockId ? valuationByStock.get(stockId) || null : null;
        const thesisLow = thesis ? toFiniteNumber(thesis.target_price_low, 0) : 0;
        const thesisHigh = thesis ? toFiniteNumber(thesis.target_price_high, 0) : 0;
        const thesisTarget = thesisLow > 0 && thesisHigh > 0 ? round((thesisLow + thesisHigh) / 2, 2) : thesisLow > 0 ? thesisLow : thesisHigh > 0 ? thesisHigh : null;

        let valuationSource: ValuationSource = 'missing';
        let targetPrice: number | null = null;
        if ((valuation?.base || 0) > 0) {
          valuationSource = 'valuation_cases';
          targetPrice = valuation?.base || null;
        } else if (thesisTarget && thesisTarget > 0) {
          valuationSource = 'thesis_model';
          targetPrice = thesisTarget;
        }

        const currentPrice = quote?.price ?? null;
        const expectedUpsidePct =
          currentPrice != null && currentPrice > 0 && targetPrice != null && targetPrice > currentPrice
            ? round(((targetPrice - currentPrice) / currentPrice) * 100, 2)
            : null;
        const recommendationState = normalizeRecommendationState(story?.thesis_state || thesis?.recommendation_tier);
        const verificationStatus =
          (story?.verification_status as VerificationStatus | undefined) ||
          (thesis?.verification_status as VerificationStatus | undefined) ||
          verificationStatusFromState(recommendationState);
        const whyNotRecommended =
          expectedUpsidePct == null
            ? targetPrice == null
              ? whyNotRecommendedLabel('valuation_missing')
              : whyNotRecommendedLabel('base_target_below_price')
            : null;
        const sourceCoverage = Object.entries(
          data.sources.reduce<Record<string, number>>((acc, source) => {
            const sourceType = sourceTypeFromName(source.sourceType, source.sourceName);
            const label = sourceType === 'public_research' ? '公開研究' : sourceType;
            acc[label] = (acc[label] || 0) + 1;
            return acc;
          }, {}),
        )
          .map(([label, count]) => ({ label, count }))
          .sort((a, b) => b.count - a.count);

        return {
          symbol,
          name: quote?.name ?? stockMeta?.name ?? null,
          price: currentPrice,
          changePct: quote?.changePct ?? null,
          currentPrice,
          targetPrice: expectedUpsidePct != null ? targetPrice : null,
          expectedUpsidePct,
          valuationSource,
          thesisTitle: story?.title ? String(story.title) : thesis?.thesis_title ? String(thesis.thesis_title) : null,
          storySummary: story?.summary ? String(story.summary) : thesis?.thesis_summary ? String(thesis.thesis_summary) : data.sources[0]?.summary || null,
          verificationStatus,
          recommendationState,
          whyNotRecommended,
          mentionCount: data.count,
          sources: data.sources.slice(0, 10),
          sourceCoverage,
          latestMentionAt: data.latest,
        };
      }),
    );

    return results;
  } catch {
    return [];
  }
}

function discoveredToEarlyWatch(stock: DiscoveredStockCard): RecommendationCard {
  return {
    recommendationId: `discovered-${stock.symbol}`,
    symbol: stock.symbol,
    name: stock.name || stock.symbol,
    market: 'TW',
    score: Math.min(1, stock.mentionCount / 10),
    confidence: stock.verificationStatus === '已證實' ? 0.72 : stock.verificationStatus === '部分證實' ? 0.56 : 0.4,
    action: 'watch',
    rationale: stock.storySummary || `${stock.symbol} 目前由多來源故事驅動，建議列入早期追蹤。`,
    targetPrice: stock.targetPrice,
    recommendationState: stock.recommendationState,
    thesisTitle: stock.thesisTitle,
    thesisSummary: stock.storySummary,
    expectedUpsidePct: stock.expectedUpsidePct,
    valuationSource: stock.valuationSource,
    valuationConfidence: stock.expectedUpsidePct != null ? 0.58 : 0.3,
    isFallbackValuation: stock.expectedUpsidePct == null,
    verificationStatus: stock.verificationStatus,
    whyNotRecommended: stock.whyNotRecommended,
  };
}

function earlyWatchToDiscovered(rec: RecommendationCard): DiscoveredStockCard {
  return {
    symbol: rec.symbol,
    name: rec.name || rec.symbol,
    price: null,
    changePct: null,
    currentPrice: null,
    targetPrice: rec.targetPrice ?? null,
    expectedUpsidePct: rec.expectedUpsidePct ?? null,
    valuationSource: rec.valuationSource || 'missing',
    thesisTitle: rec.thesisTitle || null,
    storySummary: rec.thesisSummary || rec.rationale || null,
    verificationStatus: rec.verificationStatus || verificationStatusFromState(rec.recommendationState || 'signal_candidate'),
    recommendationState: rec.recommendationState || 'signal_candidate',
    whyNotRecommended: rec.whyNotRecommended || whyNotRecommendedLabel('valuation_missing'),
    mentionCount: 0,
    sources: [],
    sourceCoverage: [],
    latestMentionAt: nowIso(),
  };
}

async function getEarlyWatchlistFromStories(limit = 12): Promise<RecommendationCard[]> {
  const supabaseServer = getSupabaseServerClient();
  const [storiesRes, stocksRes] = await Promise.all([
    supabaseServer
    .from('story_candidates')
    .select('id,stock_id,title,summary,thesis_state,verification_status,evidence_score,timing_score,updated_at')
    .order('as_of_date', { ascending: false })
    .order('updated_at', { ascending: false })
      .limit(200),
    supabaseServer.from('stocks').select('id,symbol,name,market'),
  ]);
  if (storiesRes.error || stocksRes.error) return [];
  const rows = (storiesRes.data as Row[]) || [];
  const stockMap = new Map<string, Row>(((stocksRes.data as Row[]) || []).map((item) => [String(item.id || ''), item]));
  const seen = new Set<string>();
  const items: RecommendationCard[] = [];
  for (const row of rows) {
    const stockRelation = stockMap.get(String(row.stock_id || ''));
    const symbol = String(stockRelation?.symbol || '');
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    const state = normalizeRecommendationState(row.thesis_state);
    items.push({
      recommendationId: `story-${String(row.id || symbol)}`,
      symbol,
      name: String(stockRelation?.name || symbol),
      market: (stockRelation?.market as 'TW' | 'US') || 'TW',
      score: clamp(toFiniteNumber(row.evidence_score, 0.35) * 0.7 + toFiniteNumber(row.timing_score, 0.3) * 0.3),
      confidence: clamp(toFiniteNumber(row.evidence_score, 0.38)),
      action: 'watch',
      rationale: String(row.summary || row.title || `${symbol} 題材正在驗證中`),
      recommendationState: state,
      thesisTitle: row.title ? String(row.title) : null,
      thesisSummary: row.summary ? String(row.summary) : null,
      expectedUpsidePct: null,
      valuationSource: 'missing',
      valuationConfidence: 0.25,
      isFallbackValuation: true,
      verificationStatus: (row.verification_status as VerificationStatus | undefined) || verificationStatusFromState(state),
      whyNotRecommended: whyNotRecommendedLabel('valuation_missing'),
    });
    if (items.length >= limit) break;
  }
  return items;
}

function fallbackRadarPayload(windowType: ThemeHeatCard['windowType']): RadarDailyPayload {
  const marketFocus = fallbackDailyDashboardData().marketFocus[0] || null;
  const hotThemes = fallbackThemeRows(windowType);
  const opportunities = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation)
    .filter(recommendationIsFormal)
    .sort((a, b) => (b.expectedUpsidePct ?? 0) - (a.expectedUpsidePct ?? 0));
  const earlyWatchlist = TW_STORY_RESEARCH_SEEDS.map(fallbackRecommendation)
    .filter((r) => !recommendationIsFormal(r))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
  return {
    asOf: asIsoDate(nowIso()),
    marketRegime: 'risk-on-ai',
    focusSummary: buildFocusSummary(marketFocus, hotThemes),
    hotThemes,
    opportunities,
    earlyWatchlist,
    earlySignals: opportunities.filter((item) => item.recommendationState === 'signal_candidate').slice(0, 5),
    partiallyVerified: opportunities.filter((item) => item.recommendationState === 'partially_verified').slice(0, 5),
    validatedIdeas: opportunities.filter((item) => item.recommendationState === 'validated_thesis' || item.recommendationState === 'actionable_setup').slice(0, 5),
    discoveredStocks: [],
    reports: fallbackResearchMemos(),
    agentStatus: fallbackAgentStatusSummary(),
    connectorStatus: [],
    riskDisclosure: RISK_DISCLOSURE,
  };
}

function unavailableRadarPayload(windowType: ThemeHeatCard['windowType']): RadarDailyPayload {
  return {
    asOf: asIsoDate(nowIso()),
    marketRegime: 'live-unavailable',
    focusSummary: `目前設定為 live 模式，但資料來源暫時不可用（${windowType}）。請檢查 Supabase 連線與金鑰設定。`,
    hotThemes: [],
    opportunities: [],
    earlyWatchlist: [],
    earlySignals: [],
    partiallyVerified: [],
    validatedIdeas: [],
    discoveredStocks: [],
    reports: [],
    agentStatus: {
      activeRunType: 'live-unavailable',
      runCount24h: 0,
      lastSuccessfulRunAt: null,
      startedRoles: [],
      allowlistedProfiles: [],
    },
    connectorStatus: [],
    riskDisclosure: RISK_DISCLOSURE,
  };
}

async function getLatestStockRecord(symbol: string) {
  const supabaseServer = getSupabaseServerClient();
  const stockRes = await supabaseServer.from('stocks').select('*').eq('symbol', symbol).limit(1);
  if (stockRes.error) throw new Error(stockRes.error.message);
  return (stockRes.data?.[0] as Row | undefined) || null;
}

async function getMinimalStockInsight(stock: Row, symbol: string): Promise<StockInsightPayload> {
  const quote = await fetchStockQuote(symbol);
  const now = nowIso();
  return {
    symbol,
    name: quote?.name || String(stock.name || symbol),
    market: 'TW',
    price: quote?.price ?? 0,
    volume: quote?.volume ?? null,
    asOf: now,
    freshness: quote ? 'fresh' : 'missing',
    chart: [],
    indicators: {
      maShort: null,
      maMid: null,
      maLong: null,
      rsi: null,
      macd: null,
      macdSignal: null,
    },
    chipMetrics: {},
    riskDisclosure: RISK_DISCLOSURE,
  };
}

async function getRadarPayload(windowType: ThemeHeatCard['windowType']): Promise<RadarDailyPayload> {
  if (shouldUseDemoFallback()) {
    return fallbackRadarPayload(windowType);
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const [themesRes, recsRes, memosRes, marketRes, agentStatus, connectorStatus] = await Promise.all([
      supabaseServer.from('theme_heat').select('*').eq('window_type', windowType).order('as_of_date', { ascending: false }).order('heat_score', { ascending: false }).limit(24),
      supabaseServer
        .from('recommendations')
        .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
        .eq('market_scope', 'TW_PRIMARY')
        .eq('is_blocked', false)
        .order('as_of', { ascending: false })
        .order('score', { ascending: false })
        .limit(24),
      supabaseServer.from('research_memos').select('*').order('updated_at', { ascending: false }).limit(30),
      supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      getAgentStatusSummary(),
      getConnectorStatusSummary(),
    ]);

    if (themesRes.error || recsRes.error || memosRes.error || marketRes.error) {
      throw new Error(themesRes.error?.message || recsRes.error?.message || memosRes.error?.message || marketRes.error?.message || 'Failed to load radar payload');
    }

    const themeRows = ((themesRes.data as Row[]) || []).map(mapThemeHeatRow);
    const latestThemeDate = themeRows[0]?.asOfDate || asIsoDate(String((marketRes.data?.[0] as Row | undefined)?.as_of || nowIso()));
    const supabaseThemes = themeRows.filter((row) => row.asOfDate === latestThemeDate);

    const topThemes = supabaseThemes.sort((a, b) => b.heatScore - a.heatScore).slice(0, 12);

    const recommendationRows = ((recsRes.data as Row[]) || []).map(mapRecommendation);
    const latestRecommendationDate = ((recsRes.data?.[0] as Row | undefined)?.as_of ? String((recsRes.data?.[0] as Row).as_of) : latestThemeDate).slice(0, 10);
    const supabaseRecommendations = recommendationRows
      .filter((row, index) => String(((recsRes.data as Row[])[index]?.as_of || '')).slice(0, 10) === latestRecommendationDate);

    const rankedRecommendations = [...supabaseRecommendations]
      .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.confidence - a.confidence;
      });
    const topRecommendations = rankedRecommendations.filter(recommendationIsFormal).slice(0, 24);
    const earlyWatchlist = rankedRecommendations.filter((row) => !recommendationIsFormal(row)).slice(0, 12);

    const memoRows = ((memosRes.data as Row[]) || []).map(mapResearchMemo);
    const reportKinds: ResearchMemoView['reportKind'][] = windowType === 'weekly' ? ['weekly_conviction', 'hot_theme', 'deep_dive'] : ['daily_radar', 'hot_theme', 'deep_dive'];
    const reports = memoRows.filter((memo) => reportKinds.includes(memo.reportKind)).slice(0, 6);

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

    const discoveredStocks = await getDiscoveredStocks();
    const recommendationSymbols = new Set(topRecommendations.map((item) => item.symbol));
    const earlyFromDiscovery = discoveredStocks
      .filter((item) => !recommendationSymbols.has(item.symbol))
      .slice(0, 12)
      .map(discoveredToEarlyWatch);
    const finalEarlyWatchlist =
      earlyWatchlist.length > 0 ? earlyWatchlist : earlyFromDiscovery.length > 0 ? earlyFromDiscovery : await getEarlyWatchlistFromStories(12);
    const finalDiscoveredStocks = discoveredStocks.length > 0 ? discoveredStocks : finalEarlyWatchlist.map(earlyWatchToDiscovered);

    return {
      asOf: latestThemeDate,
      marketRegime: topThemes[0]?.marketRegime || (toFiniteNumber((marketFocus?.indexState as Row | undefined)?.trend_score, 0.5) >= 0.65 ? 'risk-on-ai' : 'selective-risk-on'),
      focusSummary: buildFocusSummary(marketFocus, topThemes),
      hotThemes: topThemes,
      opportunities: topRecommendations,
      earlyWatchlist: finalEarlyWatchlist,
      earlySignals: topRecommendations.filter((item) => item.recommendationState === 'signal_candidate').slice(0, 5),
      partiallyVerified: topRecommendations.filter((item) => item.recommendationState === 'partially_verified').slice(0, 5),
      validatedIdeas: topRecommendations.filter((item) => item.recommendationState === 'validated_thesis' || item.recommendationState === 'actionable_setup').slice(0, 5),
      discoveredStocks: finalDiscoveredStocks,
      reports,
      agentStatus,
      connectorStatus,
      riskDisclosure: RISK_DISCLOSURE,
    };
  } catch {
    return shouldUseDemoFallback() ? fallbackRadarPayload(windowType) : unavailableRadarPayload(windowType);
  }
}

export async function getDailyRadarData(): Promise<RadarDailyPayload> {
  return getRadarPayload('daily');
}

export async function getHotRadarData(): Promise<RadarDailyPayload> {
  return getRadarPayload('three_day');
}

export async function getWeeklyRadarData(): Promise<RadarDailyPayload> {
  return getRadarPayload('weekly');
}

export async function getThemeDetail(themeKey: string): Promise<ThemeDetailPayload | null> {
  if (shouldUseDemoFallback()) {
    return fallbackThemeDetail(themeKey);
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const [themesRes, stocksRes, recsRes, storiesRes, memosRes] = await Promise.all([
      supabaseServer.from('theme_heat').select('*').eq('theme_key', themeKey).order('as_of_date', { ascending: false }).order('heat_score', { ascending: false }).limit(10),
      supabaseServer.from('stocks').select('id,symbol,name'),
      supabaseServer
        .from('recommendations')
        .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
        .order('as_of', { ascending: false })
        .order('score', { ascending: false })
        .limit(50),
      supabaseServer.from('story_candidates').select('*').order('as_of_date', { ascending: false }).limit(50),
      supabaseServer.from('research_memos').select('*').order('updated_at', { ascending: false }).limit(40),
    ]);

    if (themesRes.error || stocksRes.error || recsRes.error || storiesRes.error || memosRes.error) {
      throw new Error(themesRes.error?.message || stocksRes.error?.message || recsRes.error?.message || storiesRes.error?.message || memosRes.error?.message || 'Failed to load theme detail');
    }

    const themeRows = ((themesRes.data as Row[]) || []).map(mapThemeHeatRow);
    const theme = themeRows[0] || null;
    if (!theme) return null;

    const latestThemeDate = theme.asOfDate;
    const themeSymbols = new Set(theme.relatedSymbols);
    const stockMap = new Map<string, Row>(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), row]));

    const opportunities = ((recsRes.data as Row[]) || [])
      .filter((row) => {
        const stockRelation = Array.isArray(row.stocks) ? (row.stocks[0] as Row | undefined) : (row.stocks as Row | undefined);
        const symbol = String(stockRelation?.symbol || '');
        return themeSymbols.has(symbol) && String(row.as_of || '').slice(0, 10) === latestThemeDate;
      })
      .map(mapRecommendation)
      .filter(recommendationIsFormal)
      .slice(0, 10);

    const supportingStories = ((storiesRes.data as Row[]) || [])
      .filter((row) => {
        const stock = stockMap.get(String(row.stock_id || ''));
        return stock && themeSymbols.has(String(stock.symbol || '')) && String(row.as_of_date || '') === latestThemeDate;
      })
      .map((row) => {
        const stock = stockMap.get(String(row.stock_id || '')) || {};
        return {
          symbol: String(stock.symbol || ''),
          title: String(row.title || ''),
          storyType: (row.story_type as StoryType | undefined) || 'valuation_reset',
          thesisState: normalizeRecommendationState(row.thesis_state) || 'signal_candidate',
          catalystSummary: row.catalyst_summary ? String(row.catalyst_summary) : null,
        };
      })
      .slice(0, 10);

    const reports = ((memosRes.data as Row[]) || [])
      .map(mapResearchMemo)
      .filter((memo) => memo.relatedSymbols.some((symbol) => themeSymbols.has(symbol)) || memo.slug.includes(themeKey))
      .slice(0, 8);

    return {
      theme,
      opportunities,
      supportingStories,
      reports,
      sourceCoverage: theme.sourceCoverage,
      missingSources: theme.missingSources,
    };
  } catch {
    return shouldUseDemoFallback() ? fallbackThemeDetail(themeKey) : null;
  }
}

export async function getStockDeepDive(symbol: string): Promise<StockDeepDivePayload | null> {
  if (shouldUseDemoFallback()) {
    return await fallbackStockDeepDive(symbol);
  }

  try {
    const normalizedSymbol = symbol.toUpperCase();
    const stock = await getLatestStockRecord(normalizedSymbol);
    if (!stock) return shouldUseDemoFallback() ? await fallbackStockDeepDive(normalizedSymbol) : null;

    const insight = (await getStockInsight(normalizedSymbol)) || (await getMinimalStockInsight(stock, normalizedSymbol));

    const supabaseServer = getSupabaseServerClient();
    const [storyRes, evidenceRes, valuationRes, eventRes, revenueRes, fundamentalsRes, memoRes, socialRes, thesisRes, brokerRes, reportRes, rawDocsRes, investanchorsRecentRes, agentStatus, podcastRes, kolRes, discoveryRes, connectorStatus] = await Promise.all([
      supabaseServer.from('story_candidates').select('*').eq('stock_id', String(stock.id)).order('as_of_date', { ascending: false }).order('updated_at', { ascending: false }).limit(1),
      supabaseServer.from('story_evidence_items').select('*').eq('stock_id', String(stock.id)).order('source_timestamp', { ascending: false }).limit(20),
      supabaseServer.from('valuation_cases').select('*').eq('stock_id', String(stock.id)).order('updated_at', { ascending: false }).limit(10),
      supabaseServer.from('company_events').select('*').eq('stock_id', String(stock.id)).order('event_timestamp', { ascending: false }).limit(10),
      supabaseServer.from('revenue_signals').select('*').eq('stock_id', String(stock.id)).order('as_of_date', { ascending: false }).limit(1),
      supabaseServer.from('fundamental_snapshots').select('*').eq('stock_id', String(stock.id)).order('as_of_date', { ascending: false }).limit(1),
      supabaseServer.from('research_memos').select('*').eq('stock_id', String(stock.id)).order('updated_at', { ascending: false }).limit(1),
      supabaseServer.from('social_signals').select('*').eq('stock_id', String(stock.id)).order('source_timestamp', { ascending: false }).limit(20),
      supabaseServer.from('thesis_models').select('*').eq('stock_id', String(stock.id)).order('as_of_date', { ascending: false }).limit(1),
      supabaseServer.from('broker_report_documents').select('*').eq('stock_id', String(stock.id)).order('report_date', { ascending: false }).limit(5),
      supabaseServer.from('research_reports').select('*').eq('stock_id', String(stock.id)).order('created_at', { ascending: false }).limit(3),
      supabaseServer
        .from('source_raw_documents')
        .select('*')
        .order('collected_at', { ascending: false })
        .limit(200),
      supabaseServer
        .from('source_raw_documents')
        .select('*')
        .eq('platform', 'investanchors')
        .order('collected_at', { ascending: false })
        .limit(5),
      getAgentStatusSummary(),
      supabaseServer.from('podcast_transcripts').select('*, podcast_episodes(*)').order('created_at', { ascending: false }).limit(30),
      supabaseServer.from('kol_profiles').select('*, source_entities(*)').eq('discovery_state', 'approved').order('follower_count', { ascending: false }).limit(20),
      supabaseServer.from('source_discovery_queue').select('state').limit(200),
      getConnectorStatusSummary(),
    ]);

    if (storyRes.error || evidenceRes.error || valuationRes.error || eventRes.error || revenueRes.error || fundamentalsRes.error || memoRes.error || socialRes.error || thesisRes.error || brokerRes.error || reportRes.error || rawDocsRes.error || investanchorsRecentRes.error) {
      throw new Error(
        storyRes.error?.message ||
          evidenceRes.error?.message ||
          valuationRes.error?.message ||
          eventRes.error?.message ||
          revenueRes.error?.message ||
          fundamentalsRes.error?.message ||
          socialRes.error?.message ||
          thesisRes.error?.message ||
          brokerRes.error?.message ||
          reportRes.error?.message ||
          rawDocsRes.error?.message ||
          investanchorsRecentRes.error?.message ||
          memoRes.error?.message ||
          'Failed to load deep dive',
      );
    }

    const podcastTranscripts = ((podcastRes.data || []) as Row[]).filter((row) => {
      const ep = row.podcast_episodes as Row | null;
      if (!ep) return false;
      const mentions = Array.isArray(ep.extracted_mentions) ? (ep.extracted_mentions as unknown[]).map(String) : [];
      // podcast_transcripts has extracted_mentions on the transcript itself
      const transcriptMentions = Array.isArray(row.extracted_mentions) ? (row.extracted_mentions as unknown[]).map(String) : [];
      return mentions.includes(normalizedSymbol) || transcriptMentions.includes(normalizedSymbol);
    });
    const podcastMentions = podcastTranscripts.map((row) => {
      const ep = (row.podcast_episodes as Row | null) || {};
      const thesisList = Array.isArray(row.extracted_thesis) ? (row.extracted_thesis as Array<{ text?: string }>) : [];
      const riskList = Array.isArray(row.extracted_risks) ? (row.extracted_risks as Array<{ text?: string }>) : [];
      return {
        podcastName: String(ep.podcast_name || ''),
        episodeTitle: String(ep.episode_title || ''),
        platform: String(ep.platform || 'other') as 'youtube' | 'spotify' | 'apple_podcast' | 'rss' | 'other',
        episodeUrl: String(ep.episode_url || ''),
        publishedAt: ep.published_at ? String(ep.published_at) : null,
        transcriptStatus: String(ep.transcript_status || 'pending') as 'pending' | 'ready' | 'transcript_unavailable' | 'failed',
        excerpt: String(row.transcript_text || '').slice(0, 300),
        thesisHighlights: thesisList.slice(0, 3).map((t) => t.text || '').filter(Boolean),
        riskHighlights: riskList.slice(0, 3).map((t) => t.text || '').filter(Boolean),
      };
    });

    const kolRawDocs = ((rawDocsRes.data as Row[]) || []).filter((row) => {
      const symbols = Array.isArray(row.symbols) ? (row.symbols as unknown[]).map(String) : [];
      return symbols.includes(normalizedSymbol) && ['kol', 'podcast', 'youtube', 'threads', 'instagram', 'telegram'].includes(String(row.platform || ''));
    });
    const kolCoverage: SourceCoverageView[] = ((kolRes.data || []) as Row[]).map((kol) => {
      const recentCount = kolRawDocs.filter((doc) => {
        const se = kol.source_entities as Row | null;
        return se && String(doc.source_entity_id) === String(se.id);
      }).length;
      const lastDoc = kolRawDocs.find((doc) => {
        const se = kol.source_entities as Row | null;
        return se && String(doc.source_entity_id) === String(se.id);
      });
      return {
        sourceName: String(kol.display_name || ''),
        sourceType: String(kol.primary_platform || 'kol') as SourceCoverageView['sourceType'],
        summary: recentCount > 0 ? `最近 ${recentCount} 筆提及` : '無最近提及記錄',
        sourceUrl: kol.profile_url ? String(kol.profile_url) : null,
        sourceTimestamp: lastDoc ? String(lastDoc.collected_at || '') : null,
        symbols: [normalizedSymbol],
        verificationStatus: '未證實',
        confidence: recentCount > 0 ? 0.55 : 0.3,
        weight: 0.06,
      };
    });

    const discoveryRows = ((discoveryRes.data || []) as Row[]);
    const sourceDiscoveryStatus = {
      approvedCount: discoveryRows.filter((r) => r.state === 'approved').length,
      pendingCount: discoveryRows.filter((r) => r.state === 'pending').length,
      monitorOnlyCount: discoveryRows.filter((r) => r.state === 'monitor_only').length,
    };

    const story = (storyRes.data?.[0] as Row | undefined) || null;
    const evidenceItems = ((evidenceRes.data as Row[]) || []).map(mapEvidenceItem);
    const rawValuationCases = ((valuationRes.data as Row[]) || []).map(mapValuationCase);
    const { valuationCases, valuationCompleteness } = ensureValuationCaseCompleteness(rawValuationCases);
    const companyEvents = ((eventRes.data as Row[]) || []).map((row) => ({
      eventType: String(row.event_type || ''),
      headline: String(row.headline || ''),
      summary: String(row.summary || ''),
      sourceUrl: row.source_url ? String(row.source_url) : null,
      eventTimestamp: String(row.event_timestamp || ''),
    }));
    const revenue = (revenueRes.data?.[0] as Row | undefined) || null;
    const fundamentals = (fundamentalsRes.data?.[0] as Row | undefined) || null;
    const memo = (memoRes.data?.[0] as Row | undefined) || null;
    const recommendationState = normalizeRecommendationState(story?.thesis_state || insight.recommendation?.recommendationState);
    const thesisModel = (thesisRes.data?.[0] as Row | undefined) || null;
    const matrixRes = thesisModel
      ? await supabaseServer.from('thesis_evidence_matrix').select('*').eq('thesis_model_id', String(thesisModel.id)).order('created_at', { ascending: false }).limit(20)
      : { data: [], error: null } as { data: unknown[]; error: null };
    if (matrixRes.error) {
      throw new Error(matrixRes.error.message);
    }
    const communitySignals = mergeSourceCoverage(
      ((socialRes.data as Row[]) || []).map((row) =>
        mapSourceCoverageItem({
          source_name: row.source_name,
          source_type: sourceTypeFromName(row.source_type, row.source_name),
          summary: row.summary,
          source_url: row.source_url || null,
          source_timestamp: row.source_timestamp,
          symbols: [normalizedSymbol],
          confidence: row.confidence,
          weight: communityWeightForSource(sourceTypeFromName(row.source_type, row.source_name)),
          verification_status: toFiniteNumber(row.confidence, 0) >= 0.6 ? '部分證實' : '未證實',
        }),
      ),
    );
    const brokerViews = ((brokerRes.data as Row[]) || []).map(mapBrokerView);
    const sourceCoverage = mergeSourceCoverage([
      ...evidenceItems.map((item) =>
        mapSourceCoverageItem({
          source_name: item.sourceName,
          source_type:
            item.evidenceClass === 'official' || item.evidenceClass === 'company'
              ? 'official'
              : item.evidenceClass === 'financial'
                ? 'financial'
                : item.evidenceClass === 'transcript'
                  ? 'official'
                  : item.evidenceClass === 'public_research'
                    ? 'public_research'
                    : item.evidenceClass === 'industry'
                      ? 'industry'
                      : 'news',
          summary: item.excerpt || item.headline,
          source_url: item.sourceUrl,
          source_timestamp: item.sourceTimestamp,
          symbols: [normalizedSymbol],
          confidence: item.evidenceStrength,
          weight:
            item.evidenceClass === 'official' || item.evidenceClass === 'company' || item.evidenceClass === 'transcript'
              ? communityWeightForSource('official')
              : item.evidenceClass === 'financial'
                ? communityWeightForSource('financial')
                : item.evidenceClass === 'public_research'
                  ? 0.18
                  : 0.08,
          verification_status: item.stance === 'contradicting' ? '未證實' : item.evidenceStrength >= 0.65 ? '已證實' : '部分證實',
        }),
      ),
      ...communitySignals,
      ...brokerViews.map((item) =>
        mapSourceCoverageItem({
          sourceName: item.brokerName,
          sourceType: 'public_research',
          summary: item.summary,
          sourceUrl: null,
          sourceTimestamp: item.reportDate ? `${item.reportDate}T00:00:00.000Z` : null,
          symbols: [normalizedSymbol],
          verificationStatus: '已證實',
          confidence: 0.88,
          weight: 0.2,
        }),
      ),
      ...((rawDocsRes.data as Row[]) || [])
        .filter((row) => Array.isArray(row.symbols) && (row.symbols as unknown[]).map(String).includes(normalizedSymbol))
        .map((row) =>
        mapSourceCoverageItem({
          source_name: row.title || row.platform,
          source_type: String(row.platform || '').includes('threads')
            ? 'threads'
            : String(row.platform || '').includes('investanchors')
              ? 'investanchors'
              : String(row.platform || '').includes('instagram')
                ? 'instagram'
                : String(row.platform || '').includes('telegram')
                  ? 'telegram'
                  : String(row.platform || '').includes('ptt')
                    ? 'ptt'
                    : String(row.platform || '').includes('bulltalk')
                      ? 'bulltalk'
                      : 'news',
          summary: row.summary,
          source_url: row.document_url,
          source_timestamp: row.published_at || row.collected_at,
          symbols: [normalizedSymbol],
          confidence: row.confidence,
          weight: 0.08,
          verification_status: toFiniteNumber(row.confidence, 0) >= 0.6 ? '部分證實' : '未證實',
        }),
      ),
      ...((investanchorsRecentRes.data as Row[]) || []).map((row) =>
        mapSourceCoverageItem({
          source_name: row.title || '定錨投筆',
          source_type: 'investanchors',
          summary:
            Array.isArray(row.symbols) && (row.symbols as unknown[]).map(String).includes(normalizedSymbol)
              ? String(row.summary || '')
              : `[未直接命中 ${normalizedSymbol}] ${String(row.summary || '').slice(0, 220)}`,
          source_url: row.document_url || null,
          source_timestamp: row.published_at || row.collected_at,
          symbols: Array.isArray(row.symbols) ? (row.symbols as unknown[]).map(String).slice(0, 6) : [],
          confidence: toFiniteNumber(row.confidence, 0.52),
          weight: 0.16,
          verification_status: '部分證實',
        }),
      ),
    ]);
    const verificationStatus = (story?.verification_status as VerificationStatus | undefined) || verificationStatusFromState(recommendationState);
    const evidenceMatrix = ((matrixRes.data as Row[]) || []).map(mapEvidenceMatrix);
    const thesisModelView = thesisModel ? mapThesisModel(thesisModel) : null;
    const thesisMeta = (thesisModel?.metadata as Row | undefined) || {};
    const quantitative = (thesisMeta.quantitative as Row | undefined) || {};
    const missingFieldsFromModel = Array.isArray(thesisMeta.missing_fields) ? (thesisMeta.missing_fields as unknown[]).map(String) : [];
    const missingFields = Array.from(
      new Set([
        ...missingFieldsFromModel,
        ...(valuationCompleteness.isComplete ? [] : ['valuation_cases']),
        ...(thesisModelView?.financialProjectionSummary ? [] : ['financial_projection_summary']),
      ]),
    );
    const riskCounterpoints: RiskCounterpointView[] = Array.from(
      new Set([
        thesisModel?.invalidation_summary ? String(thesisModel.invalidation_summary) : '',
        ...((reportRes.data as Row[]) || []).map((row) => String(row.summary || '')),
      ].filter(Boolean)),
    )
      .slice(0, 4)
      .map((summary, index) => ({
        label: index === 0 ? '核心失效條件' : `補充風險 ${index}`,
        summary,
      }));

    return {
      ...insight,
      thesisState: recommendationState,
      verificationStatus,
      storyType: (story?.story_type as StoryType | null | undefined) || insight.recommendation?.storyType || null,
      thesisTitle: story?.title ? String(story.title) : insight.recommendation?.thesisTitle || null,
      thesisSummary: story?.summary ? String(story.summary) : insight.recommendation?.thesisSummary || null,
      catalystSummary: story?.catalyst_summary ? String(story.catalyst_summary) : insight.recommendation?.catalystSummary || null,
      expectedUpsidePct: insight.recommendation?.expectedUpsidePct ?? valuationCases.find((item) => item.caseType === 'base')?.expectedReturnPct ?? null,
      evidenceScore: story?.evidence_score == null ? insight.recommendation?.evidenceScore ?? null : toFiniteNumber(story.evidence_score),
      timingScore: story?.timing_score == null ? insight.recommendation?.timingScore ?? null : toFiniteNumber(story.timing_score),
      evidenceItems,
      valuationCases,
      companyEvents,
      revenueSignal: revenue
        ? {
            asOfDate: String(revenue.as_of_date || ''),
            monthlyRevenue: toFiniteNumber(revenue.monthly_revenue),
            yoyGrowth: revenue.yoy_growth == null ? null : toFiniteNumber(revenue.yoy_growth),
            momGrowth: revenue.mom_growth == null ? null : toFiniteNumber(revenue.mom_growth),
          }
        : null,
      fundamentalSnapshot: fundamentals
        ? {
            asOfDate: String(fundamentals.as_of_date || ''),
            epsTtm: fundamentals.eps_ttm == null ? null : toFiniteNumber(fundamentals.eps_ttm),
            grossMargin: fundamentals.gross_margin == null ? null : toFiniteNumber(fundamentals.gross_margin),
            operatingMargin: fundamentals.operating_margin == null ? null : toFiniteNumber(fundamentals.operating_margin),
            peRatio: fundamentals.pe_ratio == null ? null : toFiniteNumber(fundamentals.pe_ratio),
            pbRatio: fundamentals.pb_ratio == null ? null : toFiniteNumber(fundamentals.pb_ratio),
          }
        : null,
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
              : mapResearchMemo(memo))
          : memo
            ? mapResearchMemo(memo)
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
    };
  } catch {
    return shouldUseDemoFallback() ? await fallbackStockDeepDive(symbol) : null;
  }
}

type StockDeepDiveLookup =
  | { status: 'ready'; data: StockDeepDivePayload }
  | { status: 'pending'; data: StockDeepDivePendingPayload }
  | { status: 'not_found' };

const deepDiveRebuildLocks = new Map<string, Promise<void>>();

async function triggerDeepDiveRebuild(symbol: string) {
  const normalizedSymbol = symbol.toUpperCase();
  if (deepDiveRebuildLocks.has(normalizedSymbol)) return;
  const promise = (async () => {
    const researchV2 = await import('./research-v2');
    await researchV2.runThesisRefresh({ dryRun: false, symbols: [normalizedSymbol], topN: 20 });
    await researchV2.runResearchReportBuild({ dryRun: false, symbols: [normalizedSymbol], topN: 20 });
  })()
    .catch((error) => {
      console.warn(`[deep-dive-rebuild] ${normalizedSymbol} failed`, (error as Error).message);
    })
    .finally(() => {
      deepDiveRebuildLocks.delete(normalizedSymbol);
    });
  deepDiveRebuildLocks.set(normalizedSymbol, promise);
}

export async function getStockDeepDiveLookup(symbol: string): Promise<StockDeepDiveLookup> {
  const normalizedSymbol = symbol.toUpperCase();
  const stock = await getLatestStockRecord(normalizedSymbol);
  if (!stock) return { status: 'not_found' };

  const deepDive = await getStockDeepDive(normalizedSymbol);
  if (deepDive) {
    return { status: 'ready', data: deepDive };
  }

  void triggerDeepDiveRebuild(normalizedSymbol);
  return {
    status: 'pending',
    data: {
      status: 'pending',
      symbol: normalizedSymbol,
      reason: 'deep_dive_data_missing_or_stale',
      triggeredJobs: ['thesis-refresh', 'research-report-build'],
      retryAfterSec: 8,
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

async function getConnectorStatusSummary(): Promise<ConnectorStatusView[]> {
  if (shouldUseDemoFallback()) {
    return [];
  }

  try {
    const supabaseServer = getSupabaseServerClient();
    const [credsRes, runsRes] = await Promise.all([
      supabaseServer
        .from('source_credentials_registry')
        .select('platform,status,updated_at')
        .in('platform', ['investanchors', 'threads', 'instagram', 'telegram'])
        .order('updated_at', { ascending: false }),
      supabaseServer
        .from('connector_runs')
        .select('connector_name,platform,status,started_at,finished_at')
        .order('started_at', { ascending: false })
        .limit(200),
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
    const latestSuccess = new Map<string, string | null>();
    for (const row of (runsRes.data as Row[]) || []) {
      const connector = String(row.platform || row.connector_name || '');
      if (!connector) continue;
      if (!latestRuns.has(connector)) {
        latestRuns.set(connector, {
          status: String(row.status || 'unknown'),
          finishedAt: row.finished_at ? String(row.finished_at) : null,
          startedAt: row.started_at ? String(row.started_at) : null,
        });
      }
      if (String(row.status || '') === 'success' && !latestSuccess.has(connector)) {
        latestSuccess.set(connector, row.finished_at ? String(row.finished_at) : null);
      }
    }

    const nowMs = Date.now();
    const staleRunningThresholdMs = 25 * 60 * 1000;

    return (['investanchors', 'threads', 'instagram', 'telegram'] as const).map((connector) => ({
      connector,
      credentialStatus: latestCreds.get(connector)?.status || 'unknown',
      lastCheckedAt: latestCreds.get(connector)?.updatedAt || null,
      lastRunStatus:
        ((() => {
          const latest = latestRuns.get(connector);
          if (!latest) return 'idle';
          if (latest.status !== 'running') return latest.status;
          const startedMs = latest.startedAt ? new Date(latest.startedAt).getTime() : 0;
          return startedMs > 0 && nowMs - startedMs > staleRunningThresholdMs ? 'timed_out' : 'running';
        })() as ConnectorStatusView['lastRunStatus']),
      lastSuccessAt: latestSuccess.get(connector) || null,
    }));
  } catch {
    return [];
  }
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

    const [signalRes, recommendationRes] = await Promise.all([
      supabaseServer.from('stock_signals').select('*').eq('stock_id', stock.id as string).order('as_of', { ascending: false }).limit(60),
      supabaseServer
        .from('recommendations')
        .select('*, stocks(symbol,name,market), strategy_actions(*)')
        .eq('stock_id', stock.id as string)
        .order('as_of', { ascending: false })
        .limit(1),
    ]);

    if (signalRes.error || recommendationRes.error) {
      throw new Error(signalRes.error?.message || recommendationRes.error?.message || 'Failed to fetch stock insight');
    }

    const latestSignal = (signalRes.data?.[0] as Row | undefined) || null;
    if (!latestSignal) return null;

    // Try real Yahoo Finance OHLCV first; fallback to synthetic spread from stock_signals
    const yahooChart = stock.market === 'TW' ? await fetchYahooHistChart(String(stock.symbol)).catch(() => null) : null;
    let chart: StockInsightPayload['chart'];
    if (yahooChart && yahooChart.length >= 5) {
      chart = yahooChart.slice(-30);
    } else {
      const chartSource = dedupeChartRows((signalRes.data as Row[]) || []).slice(-30);
      chart = chartSource
        .map((row, idx) => {
          const close = toNumber(row.price);
          if (!Number.isFinite(close)) return null;
          // Use stored open/high/low from chip_metrics if available (from Yahoo historical ingestion)
          const cm = (row.chip_metrics as Record<string, unknown> | null) || {};
          const storedOpen = typeof cm.open === 'number' ? cm.open : null;
          const storedHigh = typeof cm.high === 'number' ? cm.high : null;
          const storedLow = typeof cm.low === 'number' ? cm.low : null;
          const spread = Math.max(3, close * 0.015);
          const open = storedOpen ?? (close - (idx % 2 === 0 ? spread * 0.4 : -spread * 0.3));
          const high = storedHigh ?? (Math.max(open, close) + spread * 0.6);
          const low = storedLow ?? (Math.min(open, close) - spread * 0.5);
          return {
            time: String(row.as_of || '').slice(0, 10),
            open: Number(open.toFixed(2)),
            high: Number(high.toFixed(2)),
            low: Number(low.toFixed(2)),
            close: Number(close.toFixed(2)),
          };
        })
        .filter(Boolean) as StockInsightPayload['chart'];
    }

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
    const displayPrice = liveSnapshot?.price ?? toNumber(latestSignal.price);
    const displayVolume = liveSnapshot?.volume ?? (latestSignal.volume ? Number(latestSignal.volume) : null);

    return {
      symbol: String(stock.symbol || ''),
      name: String(stock.name || ''),
      market: (stock.market as 'TW' | 'US') || 'TW',
      price: displayPrice,
      volume: displayVolume,
      asOf: String(latestSignal.as_of || ''),
      freshness: liveSnapshot ? 'fresh' : ((latestSignal.freshness_status as StockInsightPayload['freshness']) || 'missing'),
      chart,
      indicators: {
        maShort: latestSignal.ma_short ? toNumber(latestSignal.ma_short) : null,
        maMid: latestSignal.ma_mid ? toNumber(latestSignal.ma_mid) : null,
        maLong: latestSignal.ma_long ? toNumber(latestSignal.ma_long) : null,
        rsi: latestSignal.rsi ? toNumber(latestSignal.rsi) : null,
        macd: latestSignal.macd ? toNumber(latestSignal.macd) : null,
        macdSignal: latestSignal.macd_signal ? toNumber(latestSignal.macd_signal) : null,
      },
      chipMetrics: (latestSignal.chip_metrics as Record<string, unknown>) || {},
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

  const snapshotRows = [
    {
      market: 'TW' as const,
      as_of: iso,
      source: 'tw-market-public',
      source_key: 'api.twse.mi-index',
      sector_flows: { Semiconductors: 0.83, 'AI Servers': 0.71, Shipping: 0.42 },
      index_state: { taiex: 'bullish', trend_score: 0.74 },
      source_timestamp: new Date(now.getTime() - 10 * 60 * 1000).toISOString(),
    },
    {
      market: 'US' as const,
      as_of: iso,
      source: 'us-market-public',
      source_key: 'api.stooq.indices',
      sector_flows: { Technology: 0.68, Healthcare: 0.44, Energy: 0.39 },
      index_state: { sp500: 'neutral', nasdaq: 'bullish', trend_score: 0.61 },
      source_timestamp: new Date(now.getTime() - 25 * 60 * 1000).toISOString(),
    },
  ];

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

  const institutionalSeeds = TW_STORY_RESEARCH_SEEDS.map((seed) => ({
    symbol: seed.symbol,
    name: seed.name,
    market: seed.market,
    source: 'public-research-digest',
    source_key: `ins.tw.${slugify(seed.symbol)}.${slugify(seed.themeKey)}`,
    report_title: seed.reportTitle,
    expectation_score: seed.expectationScore,
    thesis_summary: seed.reportSummary,
  }));

  const socialSeeds = TW_STORY_RESEARCH_SEEDS.flatMap((seed) =>
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
      }

      for (const seed of stockSeeds) {
        await upsertSourceRegistry(seed.source_key, 'market');
        await recordSourceHealth(seed.source_key, 0.95, 1);
        const stock = await ensureStock(seed.symbol, seed.market, seed.name, seed.sector);

        // Fetch live price from TWSE (TW stocks only); fallback to seed data
        const liveData = seed.market === 'TW' ? await fetchTWSELivePrice(seed.symbol) : null;
        const livePrice = liveData?.price ?? seed.prices[seed.prices.length - 1];
        const liveVolume = liveData?.volume ?? seed.volume;

        // Build realistic price series: replace the last value with live price for technical indicators
        const priceSeries = [...seed.prices.slice(0, -1), livePrice];
        const technical = computeTechnicalSnapshot(priceSeries);
        const sourceTimestamp = liveData
          ? new Date(now.getTime() - 5 * 60 * 1000).toISOString()
          : new Date(now.getTime() - 15 * 60 * 1000).toISOString();

        const { error } = await supabaseServer.from('stock_signals').upsert(
          {
            stock_id: stock.id,
            as_of: iso,
            source: liveData ? 'twse-openapi' : seed.source,
            source_key: liveData ? `api.twse.price.${seed.symbol}` : seed.source_key,
            price: livePrice,
            volume: liveVolume,
            ma_short: technical.maShort,
            ma_mid: technical.maMid,
            ma_long: technical.maLong,
            rsi: technical.rsi,
            macd: technical.macd,
            macd_signal: technical.macdSignal,
            chip_metrics: {
              foreign_net: seed.market === 'TW' ? 12000 : null,
              investment_trust_net: seed.market === 'TW' ? 3300 : null,
              dealer_net: seed.market === 'TW' ? -900 : null,
              open: liveData?.open ?? null,
              high: liveData?.high ?? null,
              low: liveData?.low ?? null,
              change: liveData?.change ?? null,
            },
            technical_meta: { indicator_set: ['MA', 'RSI', 'MACD'], live_price: liveData !== null },
            freshness_status: freshnessStatus(sourceTimestamp, now),
            source_timestamp: sourceTimestamp,
            ingested_at: iso,
          },
          { onConflict: 'stock_id,as_of' }
        );
        if (error) throw new Error(error.message);

        // Fetch and store Yahoo historical chart bars as individual daily signals (skip today)
        if (seed.market === 'TW') {
          const histBars = await fetchYahooHistChart(seed.symbol).catch(() => null);
          if (histBars && histBars.length > 1) {
            const barsToStore = histBars.slice(0, -1); // exclude today (already written above)
            for (const bar of barsToStore) {
              const barIso = `${bar.time}T12:00:00.000Z`;
              await supabaseServer.from('stock_signals').upsert(
                {
                  stock_id: stock.id,
                  as_of: barIso,
                  source: 'yahoo-finance',
                  source_key: `api.yahoo.hist.${seed.symbol}`,
                  price: bar.close,
                  volume: null,
                  chip_metrics: { open: bar.open, high: bar.high, low: bar.low },
                  technical_meta: { indicator_set: [], from_yahoo_hist: true },
                  freshness_status: 'stale',
                  source_timestamp: barIso,
                  ingested_at: iso,
                },
                { onConflict: 'stock_id,as_of' }
              );
            }
          }
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

      for (const seed of TW_STORY_RESEARCH_SEEDS) {
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
            monthly_revenue: seed.revenue.monthlyRevenue,
            yoy_growth: seed.revenue.yoyGrowth,
            mom_growth: seed.revenue.momGrowth,
            source_url: seed.revenue.sourceUrl,
          },
          { onConflict: 'stock_id,as_of_date' },
        );
        if (revenueError) throw new Error(revenueError.message);

        const { error: fundamentalError } = await supabaseServer.from('fundamental_snapshots').upsert(
          {
            stock_id: stock.id,
            as_of_date: asOfDate,
            eps_ttm: seed.fundamentals.epsTtm,
            gross_margin: seed.fundamentals.grossMargin,
            operating_margin: seed.fundamentals.operatingMargin,
            pe_ratio: seed.fundamentals.peRatio,
            pb_ratio: seed.fundamentals.pbRatio,
            revenue_run_rate: seed.fundamentals.revenueRunRate,
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
            stock_signals: stockSeeds.length,
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
      stockSignals: stockSeeds.length,
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
    const [signalsRes, marketRes, socialDocsRes] = await Promise.all([
      supabaseServer.from('stock_signals').select('price,stocks(symbol,market)').order('as_of', { ascending: false }).limit(200),
      supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
      supabaseServer
        .from('source_raw_documents')
        .select('symbols,source_type,source_name,summary,confidence,source_timestamp')
        .in('source_type', ['PTT', 'BullTalk', 'KOL', 'Threads'])
        .order('source_timestamp', { ascending: false })
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
        // Gather real social docs from source_raw_documents that mention any symbol in this theme
        const themeSocialDocs = allSocialDocs.filter((doc) => {
          const docSymbols = (doc.symbols as string[]) || [];
          return relatedSymbols.some((sym) => docSymbols.includes(sym));
        });
        const supportingEvidence = mergeSourceCoverage([
          // Social-first: real docs from Supabase take priority
          ...themeSocialDocs.slice(0, 10).map((doc) =>
            mapSourceCoverageItem({
              source_name: String(doc.source_name || '社群'),
              source_type: sourceTypeFromName(String(doc.source_type || 'PTT'), String(doc.source_name || '')),
              summary: String(doc.summary || ''),
              source_url: null,
              source_timestamp: String(doc.source_timestamp || nowIso()),
              symbols: (doc.symbols as string[]) || relatedSymbols,
              confidence: toFiniteNumber(doc.confidence, 0.35),
              weight: communityWeightForSource(sourceTypeFromName(String(doc.source_type || 'PTT'), String(doc.source_name || ''))),
              verification_status: toFiniteNumber(doc.confidence, 0) >= 0.55 ? '部分證實' : '未證實',
            }),
          ),
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
      await finishAgentRun(runId, 'success', { as_of: asOfDate, records_written: groupedThemes.size * 3 });
    }
    return { runId, dryRun, startedRoles, recordsWritten: groupedThemes.size * 3 };
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
            .select('symbols,source_type,source_name,summary,confidence,source_timestamp')
            .in('source_type', ['PTT', 'BullTalk', 'KOL', 'Threads'])
            .order('source_timestamp', { ascending: false })
            .limit(500);
          const allSocialDocs = (rawSocialDocs as Row[]) || [];

          const stockRows = await Promise.all(
            TW_STORY_RESEARCH_SEEDS.map((seed) => ensureStock(seed.symbol, seed.market, seed.name, seed.sector)),
          );
          const rows = stockRows.map((stock, index) => {
            const seed = TW_STORY_RESEARCH_SEEDS[index];
            // Social-first: prefer real docs from source_raw_documents
            const socialDocs = allSocialDocs.filter((doc) =>
              ((doc.symbols as string[]) || []).includes(seed.symbol),
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
      await finishAgentRun(runId, 'success', { as_of: asOfDate, records_written: TW_STORY_RESEARCH_SEEDS.length });
    }

    return { runId, dryRun, startedRoles, recordsWritten: TW_STORY_RESEARCH_SEEDS.length };
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
          for (const story of storyRows) {
            const stockId = String(story.stock_id || '');
            const symbol = symbolByStockId.get(stockId) || '';
            const seed = TW_STORY_RESEARCH_SEEDS.find((item) => item.symbol === symbol);
            if (!seed) continue;

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
                headline: String(row.report_title || seed.reportTitle),
                excerpt: compactText(row.thesis_summary),
                stance: 'supporting',
                evidence_strength: 0.74,
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
            ];

            const { error: deleteError } = await supabaseServer.from('story_evidence_items').delete().eq('story_candidate_id', story.id);
            if (deleteError) throw new Error(deleteError.message);
            if (evidenceRows.length > 0) {
              const { error: insertError } = await supabaseServer.from('story_evidence_items').insert(evidenceRows);
              if (insertError) throw new Error(insertError.message);
            }

            const evidenceScore = round(clamp(mean(evidenceRows.map((row) => Number(row.evidence_strength || 0.5)))), 4);
            const nextState = recommendationStateFromVerification(evidenceScore);
            const { error: updateError } = await supabaseServer
              .from('story_candidates')
              .update({
                thesis_state: nextState,
                evidence_score: evidenceScore,
                verification_status: verificationStatusFromState(nextState),
                conditional_recommendation_note: buildConditionalRecommendationNote(nextState),
                updated_at: nowIso(),
              })
              .eq('id', story.id);
            if (updateError) throw new Error(updateError.message);
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

  const [storiesRes, stocksRes, signalsRes, marketRes, revenueRes, fundamentalsRes, socialRes, valuationRes, brokerRes, thesisRes] = await Promise.all([
    supabaseServer.from('story_candidates').select('*').eq('as_of_date', asOf),
    supabaseServer.from('stocks').select('*'),
    supabaseServer.from('stock_signals').select('*').order('as_of', { ascending: false }).limit(300),
    supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
    supabaseServer.from('revenue_signals').select('*').eq('as_of_date', asOf),
    supabaseServer.from('fundamental_snapshots').select('*').eq('as_of_date', asOf),
    supabaseServer.from('social_signals').select('*').order('source_timestamp', { ascending: false }).limit(200),
    supabaseServer.from('valuation_cases').select('stock_id,case_type,target_price,updated_at').order('updated_at', { ascending: false }).limit(2000),
    supabaseServer.from('broker_report_documents').select('stock_id,target_price,report_date,updated_at').order('report_date', { ascending: false }).limit(1000),
    supabaseServer.from('thesis_models').select('stock_id,target_price_low,target_price_high,confidence,as_of_date,updated_at').order('as_of_date', { ascending: false }).limit(1000),
  ]);

  if (storiesRes.error || stocksRes.error || signalsRes.error || marketRes.error || revenueRes.error || fundamentalsRes.error || socialRes.error || valuationRes.error || brokerRes.error || thesisRes.error) {
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

  const thesisByStock = new Map<string, { baseTarget: number | null; confidence: number | null }>();
  for (const row of (thesisRes.data as Row[]) || []) {
    const stockId = String(row.stock_id || '');
    if (!stockId || thesisByStock.has(stockId)) continue;
    const low = toFiniteNumber(row.target_price_low, 0);
    const high = toFiniteNumber(row.target_price_high, 0);
    const baseTarget = low > 0 && high > 0 ? round((low + high) / 2, 2) : low > 0 ? low : high > 0 ? high : null;
    if (baseTarget == null) continue;
    thesisByStock.set(stockId, {
      baseTarget,
      confidence: row.confidence == null ? null : toFiniteNumber(row.confidence, 0),
    });
  }

  const twMarket = (marketRes.data?.[0] as Row | undefined) || null;

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
        const marketScore = clamp(toFiniteNumber(((twMarket?.index_state as Row | undefined) || {}).trend_score, 0.6));
        const revenueScore = clamp((toFiniteNumber(revenue?.yoy_growth, 0) / 50) * 0.5 + 0.5);
        const valuationRelief = clamp(1 - Math.min(toFiniteNumber(fundamentals?.pe_ratio, 20) / 40, 1) + 0.35);
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
        const technicalScore = clamp(
          (toFiniteNumber(signal.price) >= toFiniteNumber(signal.ma_short, toFiniteNumber(signal.price)) ? 0.3 : 0.1) +
            (toFiniteNumber(signal.ma_short) >= toFiniteNumber(signal.ma_mid) ? 0.25 : 0.1) +
            (toFiniteNumber(signal.rsi, 50) >= 48 && toFiniteNumber(signal.rsi, 50) <= 72 ? 0.2 : 0.05) +
            (toFiniteNumber(signal.macd) >= toFiniteNumber(signal.macd_signal) ? 0.25 : 0.1),
        );
        const timingScore = round(clamp(technicalScore * 0.7 + marketScore * 0.3), 4);
        const score = round(clamp(evidenceScore * 0.4 + revenueScore * 0.13 + valuationRelief * 0.12 + timingScore * 0.2 + communitySignalScore * 0.15), 4);
        const confidence = round(clamp(score * 0.92 + evidenceScore * 0.08), 4);

        const isBlocked = String(signal.freshness_status || 'missing') !== 'fresh' || String(twMarket?.freshness_status || 'missing') !== 'fresh';
        const recommendationState = recommendationStateFromVerification(evidenceScore, timingScore, isBlocked);
        const verificationStatus = verificationStatusFromState(recommendationState);
        const conditionalRecommendationNote = buildConditionalRecommendationNote(recommendationState);

        const action: RecommendationCard['action'] = recommendationState === 'actionable_setup' ? 'buy' : recommendationState === 'validated_thesis' ? 'watch' : 'watch';
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

        if ((valuationCase?.baseTarget || 0) > 0) {
          valuationSource = 'valuation_cases';
          valuationConfidence = 0.8;
          baseTarget = valuationCase?.baseTarget || null;
          upsideTarget = valuationCase?.upsideTarget || valuationCase?.baseTarget || null;
        } else if ((brokerValuation?.targetPrice || 0) > 0) {
          valuationSource = 'broker_report';
          valuationConfidence = 0.68;
          baseTarget = brokerValuation?.targetPrice || null;
          upsideTarget = brokerValuation?.targetPrice || null;
        } else if ((thesisValuation?.baseTarget || 0) > 0) {
          valuationSource = 'thesis_model';
          valuationConfidence = thesisValuation?.confidence ?? 0.6;
          baseTarget = thesisValuation?.baseTarget || null;
          upsideTarget = thesisValuation?.baseTarget || null;
        } else {
          valuationSource = 'missing';
          valuationConfidence = 0;
          isFallbackValuation = true;
        }
        if (baseTarget && upsideTarget && upsideTarget < baseTarget) {
          upsideTarget = round(baseTarget * 1.12, 2);
        }

        const rawExpectedUpsidePct = baseTarget && price > 0 ? round(((baseTarget - price) / price) * 100, 2) : null;
        const valuationEligible = valuationSource !== 'missing' && (baseTarget || 0) > price && (rawExpectedUpsidePct || 0) > 0;
        const finalRecommendationState = valuationEligible
          ? recommendationState
          : evidenceScore >= 0.35
            ? 'partially_verified'
            : 'signal_candidate';
        const finalVerificationStatus = verificationStatusFromState(finalRecommendationState);
        const finalAction: RecommendationCard['action'] = finalRecommendationState === 'actionable_setup' ? 'buy' : 'watch';
        const expectedUpsidePct = valuationEligible ? rawExpectedUpsidePct : null;
        const stopLoss = round(price * (finalRecommendationState === 'actionable_setup' ? 0.93 : 0.95), 2);
        const whyNotRecommended =
          valuationSource === 'missing'
            ? 'valuation_missing'
            : (baseTarget || 0) <= price
              ? 'base_target_below_price'
              : expectedUpsidePct == null
                ? 'non_positive_upside'
                : null;
        const finalIsBlocked = isBlocked || !valuationEligible;
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
                rationale: `story=${String(story.story_type || '')} evidence=${evidenceScore.toFixed(2)} timing=${timingScore.toFixed(2)} revenue=${revenueScore.toFixed(2)} valuation=${valuationRelief.toFixed(2)}`,
                signal_breakdown: {
                  evidence: evidenceScore,
                  timing: timingScore,
                  revenue: revenueScore,
                  valuation: valuationRelief,
                  market: marketScore,
                  community: communitySignalScore,
                  valuation_source: valuationSource,
                  valuation_confidence: valuationConfidence,
                  is_fallback_valuation: isFallbackValuation,
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

          const { error: storyUpdateError } = await supabaseServer
            .from('story_candidates')
            .update({
              thesis_state: recommendationState,
              evidence_score: evidenceScore,
              timing_score: timingScore,
              verification_status: verificationStatus,
              conditional_recommendation_note: conditionalRecommendationNote,
              updated_at: nowIsoValue,
            })
            .eq('id', storyId);
          if (storyUpdateError) throw new Error(storyUpdateError.message);
        }

        findingsWritten += 1;
        if (isBlocked) blocked += 1;
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

  try {
    const [themesRes, recsRes, storiesRes, stocksRes] = await Promise.all([
      supabaseServer.from('theme_heat').select('*').eq('window_type', 'daily').eq('as_of_date', asOfDate).order('heat_score', { ascending: false }).limit(10),
      supabaseServer.from('recommendations').select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)').eq('as_of', asOfDate).eq('market_scope', 'TW_PRIMARY').order('score', { ascending: false }).limit(10),
      supabaseServer.from('story_candidates').select('*').eq('as_of_date', asOfDate),
      supabaseServer.from('stocks').select('id,symbol,name'),
    ]);
    if (themesRes.error || recsRes.error || storiesRes.error || stocksRes.error) {
      throw new Error(themesRes.error?.message || recsRes.error?.message || storiesRes.error?.message || stocksRes.error?.message || 'Failed to load report sources');
    }

    const stockMap = new Map<string, Row>(((stocksRes.data as Row[]) || []).map((row) => [String(row.id || ''), row]));
    const topRecs = ((recsRes.data as Row[]) || []).map(mapRecommendation);
    const topThemes = ((themesRes.data as Row[]) || []).map(mapThemeHeatRow);
    const stories = (storiesRes.data as Row[]) || [];

    if (!dryRun) {
      await runAgentTask(
        runId,
        'Research Editor Agent',
        'report-build',
        profileKeyForRole('Research Editor Agent'),
        { as_of: asOfDate, top_recommendations: topRecs.length, top_themes: topThemes.length },
        async () => {
          const memoRows: Array<Record<string, unknown>> = [];
          memoRows.push({
            report_kind: 'daily_radar',
            title: `StockInsider 每日雷達 ${asOfDate}`,
            slug: `daily-radar-${asOfDate}`,
            summary: '每日台股故事雷達，整合主題熱度、條件式推薦與可執行進場標的。',
            memo_markdown: [
              '# 每日雷達',
              '',
              '## 市場最熱的故事群',
              ...topThemes.slice(0, 3).map((theme) => `- ${theme.themeName}: 熱度 ${theme.heatScore.toFixed(2)} / 驗證 ${theme.verificationStatus} / 股票 ${theme.relatedSymbols.join(', ')}`),
              '',
              '## 推薦重點',
              ...topRecs.slice(0, 5).map((rec) => `- ${rec.symbol}: ${rec.thesisTitle || rec.rationale} / ${rec.verificationStatus || '未證實'}`),
            ].join('\n'),
            recommendation_state: null,
            catalyst_calendar: [],
            entry_exit_rules: {},
            related_symbols: topRecs.slice(0, 5).map((rec) => rec.symbol),
            updated_at: nowIso(),
          });

          memoRows.push({
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
            entry_exit_rules: {},
            related_symbols: topRecs.filter((rec) => rec.recommendationState === 'actionable_setup').slice(0, 5).map((rec) => rec.symbol),
            updated_at: nowIso(),
          });

          for (const theme of topThemes.slice(0, 3)) {
            memoRows.push({
              report_kind: 'hot_theme',
              title: `${theme.themeName} 主題摘要 ${asOfDate}`,
              slug: `theme-${theme.themeKey}-${asOfDate}`,
              summary: `${theme.themeName} 是目前台股最熱且持續被追蹤的故事群之一。`,
              memo_markdown: [`# ${theme.themeName}`, '', `熱度分數: ${theme.heatScore.toFixed(2)}`, '', `關聯股票: ${theme.relatedSymbols.join(', ')}`].join('\n'),
              recommendation_state: null,
              catalyst_calendar: [],
              entry_exit_rules: {},
              related_symbols: theme.relatedSymbols,
              updated_at: nowIso(),
            });
          }

          for (const story of stories) {
            const stock = stockMap.get(String(story.stock_id || ''));
            if (!stock) continue;
            memoRows.push({
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
              entry_exit_rules: {},
              related_symbols: [String(stock.symbol || '')],
              updated_at: nowIso(),
            });
          }

          const { error } = await supabaseServer.from('research_memos').upsert(memoRows, { onConflict: 'slug' });
          if (error) throw new Error(error.message);
          return {
            outputSummary: `generated ${memoRows.length} research memos`,
            findings: memoRows.map((row) => ({
              stockId: row.stock_id ? String(row.stock_id) : null,
              findingType: 'research_memo',
              summary: String(row.title || ''),
              confidence: 0.8,
              evidence: [],
              sourceRefs: [],
            })),
            result: memoRows.length,
          };
        },
      );
      await finishAgentRun(runId, 'success', { as_of: asOfDate });
    }

    return { runId, dryRun, startedRoles, recordsWritten: topRecs.length + topThemes.length + stories.length + 2 };
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
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Fetch recent raw documents and podcast transcripts
  const [docsRes, transcriptsRes] = await Promise.all([
    supabase.from('source_raw_documents').select('content_text, symbols, sentiment_label, platform').gte('collected_at', sevenDaysAgo).limit(500),
    supabase.from('podcast_transcripts').select('transcript_text, extracted_mentions, extracted_thesis').gte('created_at', thirtyDaysAgo).limit(100),
  ]);

  const seedSymbols: Set<string> = new Set(TW_STORY_RESEARCH_SEEDS.map((s) => s.symbol));
  const symbolRegex = /\b([2-9]\d{3})\b/g;
  const mentionMap = new Map<string, { count: number; bullish: number; bearish: number; platforms: Set<string> }>();

  function recordMention(sym: string, sentiment: string | null, platform?: string) {
    if (!mentionMap.has(sym)) mentionMap.set(sym, { count: 0, bullish: 0, bearish: 0, platforms: new Set() });
    const entry = mentionMap.get(sym)!;
    entry.count += 1;
    if (sentiment === 'bullish') entry.bullish += 1;
    if (sentiment === 'bearish') entry.bearish += 1;
    if (platform) entry.platforms.add(platform);
  }

  for (const doc of (docsRes.data || []) as Array<{ content_text?: string; symbols?: unknown; sentiment_label?: string; platform?: string }>) {
    // Use pre-extracted symbols field first
    const syms = Array.isArray(doc.symbols) ? (doc.symbols as string[]) : [];
    for (const sym of syms) recordMention(String(sym), doc.sentiment_label || null, doc.platform);
    // Also regex-scan content_text
    if (doc.content_text) {
      for (const [, sym] of String(doc.content_text).matchAll(symbolRegex)) {
        if (sym.length === 4) recordMention(sym, doc.sentiment_label || null, doc.platform);
      }
    }
  }

  for (const tr of (transcriptsRes.data || []) as Array<{ transcript_text?: string; extracted_mentions?: unknown }>) {
    const mentions = Array.isArray(tr.extracted_mentions) ? (tr.extracted_mentions as string[]) : [];
    for (const sym of mentions) recordMention(String(sym), null, 'podcast');
    if (tr.transcript_text) {
      for (const [, sym] of String(tr.transcript_text).matchAll(symbolRegex)) {
        if (sym.length === 4) recordMention(sym, null, 'podcast');
      }
    }
  }

  const today = asIsoDate(nowIso());
  let signalsWritten = 0;
  const candidates = [...mentionMap.entries()].filter(([sym, d]) => !seedSymbols.has(sym) && d.count >= 3);

  for (const [symbol, data] of candidates) {
    try {
      const stock = await ensureStock(symbol, 'TW', symbol, null);
      const sentiment = data.bullish > data.bearish ? 'bullish' : data.bearish > data.bullish ? 'bearish' : 'neutral';
      const confidence = Math.min(0.6, 0.2 + data.count * 0.05);
      await supabase.from('social_signals').upsert(
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
      signalsWritten += 1;
    } catch {
      // skip individual errors
    }
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
        if (sym) mopsMap.set(sym, { revenue: Number(row.revenue || 0), yoy: Number(row.yoy_growth || 0), mom: Number(row.mom_growth || 0) });
      }

      for (const stock of stocks) {
        const mops = mopsMap.get(stock.symbol);
        if (!mops) continue;
        await supabase.from('revenue_signals').upsert(
          {
            stock_id: stock.id,
            as_of_date: `${revenueYear}-${String(revenueMonth).padStart(2, '0')}-01`,
            monthly_revenue: mops.revenue,
            yoy_growth: mops.yoy,
            mom_growth: mops.mom,
            source_url: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs',
          },
          { onConflict: 'stock_id,as_of_date' },
        );
        revenueRecords += 1;
      }
    }
  } catch {
    // non-blocking: MOPS might not be available outside TW market hours
  }

  // Fetch fundamentals from Yahoo Finance for each TW stock (batched)
  for (const stock of stocks.slice(0, 40)) {
    try {
      const yahooRes = await fetch(
        `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${stock.symbol}.TW?modules=financialData,defaultKeyStatistics,summaryDetail`,
        { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!yahooRes.ok) continue;
      type YahooModule = Record<string, number | undefined>;
      const yahooJson = await yahooRes.json() as { quoteSummary?: { result?: Array<{ financialData?: YahooModule; defaultKeyStatistics?: YahooModule; summaryDetail?: YahooModule }> } };
      const result = yahooJson.quoteSummary?.result?.[0];
      if (!result) continue;
      const fd = result.financialData || {};
      const ks = result.defaultKeyStatistics || {};
      const sd = result.summaryDetail || {};
      await supabase.from('fundamental_snapshots').upsert(
        {
          stock_id: stock.id,
          as_of_date: today,
          eps_ttm: fd.trailingEps ?? null,
          gross_margin: fd.grossMargins != null ? Number(fd.grossMargins) * 100 : null,
          operating_margin: fd.operatingMargins != null ? Number(fd.operatingMargins) * 100 : null,
          pe_ratio: sd.trailingPE ?? ks.forwardPE ?? null,
          pb_ratio: ks.priceToBook ?? null,
          revenue_run_rate: fd.totalRevenue ?? null,
          source_url: `https://finance.yahoo.com/quote/${stock.symbol}.TW`,
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
  try {
    const shouldRunIngestion = !skipIngestion && (mode === 'full' || dryRun);
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

    const recommendation = await executeStep('recommendation', async () =>
      runRecommendationBatch({ dryRun, timeoutMs: mode === 'core' && !dryRun ? Number(process.env.RECOMMENDATION_BATCH_TIMEOUT_MS || 15_000) : undefined }),
    );
    let reportIngest: Record<string, unknown> = { runId: 'skip-report-ingest', dryRun, filesFound: 0, recordsWritten: 0 };
    let sourceSync: Array<Record<string, unknown>> = [];
    let sourceDiscovery: Record<string, unknown> = { runId: 'skip-source-discovery', dryRun, recordsWritten: 0 };
    let thesisRefresh: Record<string, unknown> = { runId: 'skip-thesis-refresh', dryRun, recordsWritten: 0 };
    let researchReportBuild: Record<string, unknown> = { runId: 'skip-research-report-build', dryRun, recordsWritten: 0 };
    if (mode === 'full') {
      const researchV2 = await import('./research-v2');
      reportIngest = await executeStep('report_ingest', async () => researchV2.runReportIngest({ dryRun }));
      sourceSync = await executeStep('source_sync', async () =>
        Promise.all([
          researchV2.runSourceSync({ connector: 'investanchors', dryRun }),
          researchV2.runSourceSync({ connector: 'ptt', dryRun }),
          researchV2.runSourceSync({ connector: 'bulltalk', dryRun }),
          researchV2.runSourceSync({ connector: 'threads', dryRun }),
          researchV2.runSourceSync({ connector: 'instagram', dryRun }),
          researchV2.runSourceSync({ connector: 'telegram', dryRun }),
        ]),
      );
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
      recommendation,
      reportIngest,
      sourceSync,
      sourceDiscovery,
      thesisRefresh,
      researchReportBuild,
      deepDive,
      dispatch,
    };
  } catch (error) {
    const err = error as Error & { timedOut?: boolean; failedStep?: string; durationMs?: number; stepStatus?: RecommendationStepStatus[] };
    const durationMs = err.durationMs || Date.now() - startedAt;
    const failedStep = err.failedStep || stepStatus[stepStatus.length - 1]?.step || null;
    const timedOut = Boolean(err.timedOut);
    if (supabaseServer) {
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
  const sourceSync = await Promise.all([
    researchV2.runSourceSync({ connector: 'investanchors', dryRun }),
    researchV2.runSourceSync({ connector: 'ptt', dryRun }),
    researchV2.runSourceSync({ connector: 'bulltalk', dryRun }),
    researchV2.runSourceSync({ connector: 'threads', dryRun }),
    researchV2.runSourceSync({ connector: 'instagram', dryRun }),
    researchV2.runSourceSync({ connector: 'telegram', dryRun }),
  ]);
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
  const dispatch = await dispatchLineEvents({ dryRun });
  return {
    dryRun,
    durationMs: Date.now() - startedAt,
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

    const [pipelineRes, recRes, sourceHealthRes] = await Promise.all([
      supabaseServer.from('pipeline_runs').select('*').gte('started_at', sinceIso).order('started_at', { ascending: false }).limit(100),
      supabaseServer.from('recommendations').select('id,is_blocked,created_at').gte('created_at', sinceIso).limit(500),
      supabaseServer.from('source_health_checks').select('*').gte('checked_at', sinceIso).order('checked_at', { ascending: false }).limit(300),
    ]);

    if (pipelineRes.error || recRes.error || sourceHealthRes.error) {
      throw new Error(pipelineRes.error?.message || recRes.error?.message || sourceHealthRes.error?.message || 'monitoring query failed');
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
    const unhealthy = healthRows.filter((row) => Number(row.parse_success_ratio || 1) < parseThreshold);
    if (unhealthy.length > 0) {
      alerts.push({
        type: 'source_parse_ratio_low',
        level: 'warning',
        message: `${unhealthy.length} source health checks below parse success threshold`,
        context: { threshold: parseThreshold, samples: unhealthy.slice(0, 5) },
      });
    }

    return {
      checkedAt: now.toISOString(),
      alerts,
    };
  } catch {
    return {
      checkedAt: nowIso(),
      alerts: [
        {
          type: 'demo_fallback',
          level: 'warning' as const,
          message: 'Supabase unreachable, monitoring is running in fallback mode',
        },
      ],
    };
  }
}
