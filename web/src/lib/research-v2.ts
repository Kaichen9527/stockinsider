import fs from 'fs/promises';
import path from 'path';
import { randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSupabaseServerClient } from './supabase-server';

type Row = Record<string, unknown>;

const ROOT_DIR = path.resolve(process.cwd(), '..');
const MATERIALS_DIR = path.join(ROOT_DIR, 'materials');
const ARTIFACTS_DIR = path.join(ROOT_DIR, '.agent', 'artifacts', 'source-audits');
const execFileAsync = promisify(execFile);

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT_TOKEN || '';
const DEFAULT_STORY_CANDIDATE_TOP_N = 50;
const DEFAULT_SOURCE_SYNC_LOOKBACK_HOURS = 24;

const KOL_SEEDS = [
  {
    displayName: '股癌',
    primaryPlatform: 'youtube',
    followerCount: 500000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@stockcancer',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@stockcancer',
      instagramUrl: 'https://www.instagram.com/stockcancer/',
      threadsUsername: 'stockcancer',
      telegramUrl: 'https://t.me/s/Gooaye',
      podcastName: '股癌 Gooaye',
      spotifyUrl: 'https://open.spotify.com/show/6xkNsQwVfWaB6MvdYhD5pW',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/%E8%82%A1%E7%99%8C/id1535838033',
    },
  },
  {
    displayName: '麥克風的市場開講',
    primaryPlatform: 'youtube',
    followerCount: 200000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@MicMarket',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@MicMarket',
      podcastName: '麥克風的市場開講',
    },
  },
  {
    displayName: '陳唯泰',
    primaryPlatform: 'youtube',
    followerCount: 120000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@chenweytai',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@chenweytai',
      threadsUsername: 'chenweytai',
      telegramUrl: 'https://t.me/s/eaglewealth',
      podcastName: '台股趨勢分析',
    },
  },
  {
    displayName: '小車',
    primaryPlatform: 'youtube',
    followerCount: 100000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@twstock888',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@twstock888',
      threadsUsername: 'twstock888',
      instagramUrl: 'https://www.instagram.com/sscar0202/',
      podcastName: '小車の股市研究室',
    },
  },
  {
    displayName: '艾倫的財經筆記',
    primaryPlatform: 'youtube',
    followerCount: 60000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@allenfinance',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@allenfinance',
      instagramUrl: 'https://www.instagram.com/allen_finance_note/',
      podcastName: '艾倫的財經筆記 Podcast',
    },
  },
  {
    displayName: '阿格力',
    primaryPlatform: 'youtube',
    followerCount: 50000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@agerli',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@agerli',
      instagramUrl: 'https://www.instagram.com/agerli.tw/',
      threadsUsername: 'agerli.tw',
    },
  },
  {
    displayName: '投資癮',
    primaryPlatform: 'youtube',
    followerCount: 40000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@investaddict',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@investaddict',
      instagramUrl: 'https://www.instagram.com/investaddict_tw/',
      podcastName: '投資癮',
    },
  },
  {
    displayName: '股市隱者',
    primaryPlatform: 'youtube',
    followerCount: 35000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@stockhermit',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@stockhermit',
      instagramUrl: 'https://www.instagram.com/hermittaiwan/',
      podcastName: '股市隱者',
    },
  },
  {
    displayName: '張真卿',
    primaryPlatform: 'youtube',
    followerCount: 30000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.youtube.com/@zhangzhenqing',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@zhangzhenqing',
      threadsUsername: 'zhangzhenqing',
      podcastName: '張真卿的投資觀點',
    },
  },
  {
    displayName: '程世嘉',
    primaryPlatform: 'threads',
    followerCount: 25000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://www.threads.net/@ikala_stevecc',
    metadata: {
      threadsUsername: 'ikala_stevecc',
      instagramUrl: 'https://www.instagram.com/ikala_stevecc/',
    },
  },
  {
    displayName: '定錨投筆',
    primaryPlatform: 'investanchors',
    followerCount: 15000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://investanchors.com/',
    metadata: {
      investanchorsUrl: 'https://investanchors.com/',
      podcastName: '定錨投筆',
      telegramUrl: 'https://t.me/s/investanchors',
    },
  },
  {
    displayName: 'John 林睿閔',
    primaryPlatform: 'telegram',
    followerCount: 30000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://t.me/johnstock888',
    metadata: {
      telegramUrl: 'https://t.me/s/johnstock888',
    },
  },
  {
    displayName: '郭哲榮分析師',
    primaryPlatform: 'telegram',
    followerCount: 80000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://t.me/a178178',
    metadata: {
      telegramUrl: 'https://t.me/s/a178178',
      threadsUsername: 's178178',
      instagramUrl: 'https://www.instagram.com/s178178/',
    },
  },
  {
    displayName: '股海筋肉人',
    primaryPlatform: 'telegram',
    followerCount: 3000,
    contentFocus: 'tw_stocks',
    profileUrl: 'https://t.me/musclestock',
    metadata: {
      telegramUrl: 'https://t.me/s/musclestock',
    },
  },
];

const COMPANY_ALIAS_MAP: Record<string, { symbol: string; market: 'TW' | 'US'; name: string }> = {
  旺宏: { symbol: '2337', market: 'TW', name: '旺宏' },
  旺宏電子: { symbol: '2337', market: 'TW', name: '旺宏' },
  台積電: { symbol: '2330', market: 'TW', name: 'TSMC' },
  聯發科: { symbol: '2454', market: 'TW', name: 'MediaTek' },
  緯穎: { symbol: '6669', market: 'TW', name: 'Wiwynn' },
  廣達: { symbol: '2382', market: 'TW', name: 'Quanta' },
};

const DEFAULT_WATCHLISTS = [
  // Threads keywords
  { platform: 'threads', watch_type: 'keyword', watch_value: '台股' },
  { platform: 'threads', watch_type: 'keyword', watch_value: '先進封裝' },
  { platform: 'threads', watch_type: 'keyword', watch_value: 'AI 伺服器' },
  { platform: 'threads', watch_type: 'keyword', watch_value: '半導體' },
  // Threads authors - known TW stock KOLs
  { platform: 'threads', watch_type: 'author', watch_value: 'stockcancer' },       // 股癌
  { platform: 'threads', watch_type: 'author', watch_value: 'chenweytai' },        // 陳唯泰
  { platform: 'threads', watch_type: 'author', watch_value: 'twstock888' },        // 小車
  { platform: 'threads', watch_type: 'author', watch_value: 'agerli.tw' },         // 阿格力
  { platform: 'threads', watch_type: 'author', watch_value: 'ikala_stevecc' },     // 程世嘉
  { platform: 'threads', watch_type: 'author', watch_value: 'investaddict_tw' },   // 投資癮
  { platform: 'threads', watch_type: 'author', watch_value: 'zhangzhenqing' },    // 張真卿（補漏）
  { platform: 'threads', watch_type: 'author', watch_value: 's178178' },          // 郭哲榮分析師
  // Instagram authors
  { platform: 'instagram', watch_type: 'author', watch_value: 'stockcancer' },
  { platform: 'instagram', watch_type: 'author', watch_value: 'investanchors' },
  { platform: 'instagram', watch_type: 'author', watch_value: 'allen_finance_note' }, // 艾倫的財經筆記
  { platform: 'instagram', watch_type: 'author', watch_value: 'agerli.tw' },          // 阿格力
  { platform: 'instagram', watch_type: 'author', watch_value: 'investaddict_tw' },    // 投資癮
  { platform: 'instagram', watch_type: 'author', watch_value: 'ikala_stevecc' },     // 程世嘉（補漏）
  { platform: 'instagram', watch_type: 'author', watch_value: 'sscar0202' },         // 小車
  { platform: 'instagram', watch_type: 'author', watch_value: 's178178' },           // 郭哲榮分析師
  { platform: 'instagram', watch_type: 'author', watch_value: 'hermittaiwan' },      // 股市隱者
  // Telegram public channels
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/investanchors' },
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/twstockanalysis' },
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/Gooaye', priority: 8 },       // 股癌 gooaye
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/johnstock888', priority: 7 }, // John 林睿閔
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/eaglewealth', priority: 6 }, // 陳唯泰
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/a178178',     priority: 7 }, // 郭哲榮分析師
  { platform: 'telegram', watch_type: 'url', watch_value: 'https://t.me/s/musclestock',  priority: 5 }, // 股海筋肉人
  // InvestAnchors
  { platform: 'investanchors', watch_type: 'url', watch_value: 'https://investanchors.com/' },
  // KOL tracking
  { platform: 'kol', watch_type: 'author', watch_value: '股癌' },
  { platform: 'kol', watch_type: 'author', watch_value: '股市隱者' },
  { platform: 'kol', watch_type: 'author', watch_value: '投資癮' },
  { platform: 'kol', watch_type: 'author', watch_value: '麥克風的市場開講' },
  { platform: 'kol', watch_type: 'author', watch_value: '陳唯泰' },
  { platform: 'kol', watch_type: 'author', watch_value: '小車' },
  { platform: 'kol', watch_type: 'author', watch_value: '艾倫的財經筆記' },
  { platform: 'kol', watch_type: 'author', watch_value: '阿格力' },
  { platform: 'kol', watch_type: 'author', watch_value: '張真卿' },
  { platform: 'kol', watch_type: 'author', watch_value: '程世嘉' },
  { platform: 'kol', watch_type: 'author', watch_value: '定錨投筆' },
  { platform: 'kol', watch_type: 'author', watch_value: 'John 林睿閔' },
  { platform: 'kol', watch_type: 'author', watch_value: '郭哲榮分析師' },
  { platform: 'kol', watch_type: 'author', watch_value: '股海筋肉人' },
  // Podcasts (YouTube channels)
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@stockcancer' },              // 股癌
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@mic_market' },               // 麥克風的市場開講
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@chenweytai' },               // 陳唯泰
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@allenfinancenote' },         // 艾倫的財經筆記
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@agerli' },                   // 阿格力
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@investaddict' },             // 投資癮
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@StockHideaway' },            // 股市隱者
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@ChangChenkuei' },            // 張真卿
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@investanchors' },            // 定錨投筆（補漏）
];

function nowIso() {
  return new Date().toISOString();
}

function asDate(iso = nowIso()) {
  return iso.slice(0, 10);
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? num : fallback;
}

function clamp(value: number, min = 0, max = 1) {
  return Math.min(max, Math.max(min, value));
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}

function roundTo(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function resolveStoryCandidateTopN() {
  const parsed = Number(process.env.STORY_CANDIDATE_TOP_N || DEFAULT_STORY_CANDIDATE_TOP_N);
  if (!Number.isFinite(parsed)) return DEFAULT_STORY_CANDIDATE_TOP_N;
  return Math.max(5, Math.floor(parsed));
}

function resolveSourceSyncLookbackHours() {
  const parsed = Number(process.env.SOURCE_SYNC_LOOKBACK_HOURS || DEFAULT_SOURCE_SYNC_LOOKBACK_HOURS);
  if (!Number.isFinite(parsed)) return DEFAULT_SOURCE_SYNC_LOOKBACK_HOURS;
  return Math.max(1, Math.floor(parsed));
}

function scoreStoryDrivenCandidates(params: {
  stocks: Row[];
  stories: Row[];
  themes: Row[];
  rawDocs: Row[];
  topN: number;
}) {
  const { stocks, stories, themes, rawDocs, topN } = params;
  const symbolToStockId = new Map<string, string>(
    stocks
      .map((row) => ({
        symbol: String(row.symbol || ''),
        stockId: String(row.id || ''),
      }))
      .filter((row) => row.symbol && row.stockId)
      .map((row) => [row.symbol, row.stockId]),
  );

  const scoreByStock = new Map<string, { score: number; reasons: string[] }>();
  const fromStory = new Set<string>();
  const fromTheme = new Set<string>();
  const fromSource = new Set<string>();

  const ensure = (stockId: string) => {
    const current = scoreByStock.get(stockId) || { score: 0, reasons: [] };
    scoreByStock.set(stockId, current);
    return current;
  };

  for (const story of stories) {
    const stockId = String(story.stock_id || '');
    if (!stockId) continue;
    fromStory.add(stockId);
    const current = ensure(stockId);
    const evidence = clamp(toFiniteNumber(story.evidence_score, 0.45));
    const timing = clamp(toFiniteNumber(story.timing_score, 0.45));
    current.score += 5 + evidence * 2.2 + timing * 1.4;
    current.reasons.push(`story:${String(story.story_type || 'unknown')}`);
  }

  if (themes.length > 0) {
    const latestThemeDate = String(themes[0]?.as_of_date || '');
    for (const theme of themes.filter((item) => String(item.as_of_date || '') === latestThemeDate)) {
      const heat = clamp(toFiniteNumber(theme.heat_score, 0.5), 0, 5);
      const relatedSymbols = Array.isArray(theme.related_symbols) ? (theme.related_symbols as unknown[]).map(String) : [];
      for (const symbol of relatedSymbols) {
        const stockId = symbolToStockId.get(symbol);
        if (!stockId) continue;
        fromTheme.add(stockId);
        const current = ensure(stockId);
        current.score += 0.8 + heat * 0.65;
        current.reasons.push(`theme:${String(theme.theme_key || 'unknown')}`);
      }
    }
  }

  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  for (const doc of rawDocs) {
    const collectedAt = new Date(String(doc.collected_at || doc.published_at || '')).getTime();
    if (Number.isFinite(collectedAt) && collectedAt < sevenDaysAgo) continue;
    const confidence = clamp(toFiniteNumber(doc.confidence, 0.42));
    const symbols = Array.isArray(doc.symbols) ? (doc.symbols as unknown[]).map(String) : [];
    for (const symbol of symbols) {
      const stockId = symbolToStockId.get(symbol);
      if (!stockId) continue;
      fromSource.add(stockId);
      const current = ensure(stockId);
      current.score += 0.45 + confidence * 0.9;
      current.reasons.push(`source:${String(doc.platform || 'raw')}`);
    }
  }

  const ranked = Array.from(scoreByStock.entries())
    .map(([stockId, value]) => ({ stockId, score: roundTo(value.score, 4), reasons: unique(value.reasons) }))
    .sort((a, b) => b.score - a.score);

  const storyFirst = ranked.filter((item) => fromStory.has(item.stockId));
  const fallback = ranked.filter((item) => !fromStory.has(item.stockId));
  const selected = [...storyFirst, ...fallback].slice(0, Math.max(1, topN));

  return {
    selected,
    diagnostics: {
      candidateCount: selected.length,
      fromStory: fromStory.size,
      fromTheme: fromTheme.size,
      fromSource: fromSource.size,
      topN,
      preview: selected.slice(0, 10).map((item) => ({ stockId: item.stockId, score: item.score, reasons: item.reasons.slice(0, 3) })),
    },
  };
}

function buildPeScenario(params: {
  currentPrice: number | null;
  epsTtm: number | null;
  peRatio: number | null;
  monthlyRevenue: number | null;
  yoyGrowth: number | null;
  momGrowth: number | null;
  revenueRunRate: number | null;
  brokerTargetPrice: number | null;
}) {
  const currentPrice = params.currentPrice && params.currentPrice > 0 ? params.currentPrice : null;
  const basePe = clamp(params.peRatio && params.peRatio > 0 ? params.peRatio : 14, 8, 35);
  const growthYoy = clamp((params.yoyGrowth || 0) / 100, -0.45, 1.5);
  const growthMom = clamp((params.momGrowth || 0) / 100, -0.2, 0.35);
  const growthBlend = clamp(growthYoy * 0.7 + growthMom * 0.3, -0.4, 0.85);

  const baseRevenueAnnual = params.revenueRunRate && params.revenueRunRate > 0
    ? params.revenueRunRate * (1 + growthBlend * 0.25)
    : params.monthlyRevenue && params.monthlyRevenue > 0
      ? params.monthlyRevenue * 12 * (1 + growthBlend * 0.35)
      : null;
  const upsideRevenueAnnual = baseRevenueAnnual ? baseRevenueAnnual * 1.12 : null;
  const bearRevenueAnnual = baseRevenueAnnual ? baseRevenueAnnual * 0.9 : null;

  const impliedCurrentEps = currentPrice && basePe > 0 ? currentPrice / basePe : null;
  const epsAnchor = params.epsTtm && params.epsTtm > 0 ? params.epsTtm : impliedCurrentEps;
  const baseEps = epsAnchor ? epsAnchor * (1 + growthBlend * 0.55) : null;
  const upsideEps = baseEps ? baseEps * 1.16 : null;
  const bearEps = baseEps ? baseEps * 0.82 : null;

  const basePeScenario = basePe;
  const upsidePeScenario = clamp(basePe * 1.08, 9, 40);
  const bearPeScenario = clamp(basePe * 0.88, 6, 30);

  const peBaseTarget = baseEps ? baseEps * basePeScenario : null;
  const baseTarget = params.brokerTargetPrice && params.brokerTargetPrice > 0
    ? (peBaseTarget ? params.brokerTargetPrice * 0.65 + peBaseTarget * 0.35 : params.brokerTargetPrice)
    : peBaseTarget;
  let upsideTarget = upsideEps ? upsideEps * upsidePeScenario : (baseTarget ? baseTarget * 1.15 : null);
  let bearTarget = bearEps ? bearEps * bearPeScenario : (baseTarget ? baseTarget * 0.82 : null);
  if (baseTarget && upsideTarget && upsideTarget < baseTarget) {
    upsideTarget = baseTarget * 1.12;
  }
  if (baseTarget && bearTarget && bearTarget > baseTarget) {
    bearTarget = baseTarget * 0.88;
  }

  const expectedReturn = (target: number | null) => (target && currentPrice ? roundTo(((target - currentPrice) / currentPrice) * 100, 2) : null);

  return {
    base: {
      revenueAnnual: baseRevenueAnnual ? roundTo(baseRevenueAnnual, 0) : null,
      eps: baseEps ? roundTo(baseEps, 2) : null,
      pe: roundTo(basePeScenario, 2),
      targetPrice: baseTarget ? roundTo(baseTarget, 2) : null,
      expectedReturnPct: expectedReturn(baseTarget),
    },
    upside: {
      revenueAnnual: upsideRevenueAnnual ? roundTo(upsideRevenueAnnual, 0) : null,
      eps: upsideEps ? roundTo(upsideEps, 2) : null,
      pe: roundTo(upsidePeScenario, 2),
      targetPrice: upsideTarget ? roundTo(upsideTarget, 2) : null,
      expectedReturnPct: expectedReturn(upsideTarget),
    },
    bear: {
      revenueAnnual: bearRevenueAnnual ? roundTo(bearRevenueAnnual, 0) : null,
      eps: bearEps ? roundTo(bearEps, 2) : null,
      pe: roundTo(bearPeScenario, 2),
      targetPrice: bearTarget ? roundTo(bearTarget, 2) : null,
      expectedReturnPct: expectedReturn(bearTarget),
    },
    missingFields: [
      ...(baseEps ? [] : ['eps']),
      ...(baseRevenueAnnual ? [] : ['revenue']),
      ...(currentPrice ? [] : ['price']),
    ],
  };
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

function extractJsonText(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function firstNonEmpty(...values: Array<unknown>) {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return '';
}

function safeDateString(value: unknown) {
  const text = compactText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseFollowerCount(text: string) {
  const match = compactText(text).match(/([\d.,]+)\s*([KMB萬]?)\s*(followers|位追蹤者|追蹤者|subscribers|訂閱者)/i);
  if (!match) return null;
  const raw = Number(match[1].replace(/,/g, ''));
  if (!Number.isFinite(raw)) return null;
  const unit = match[2];
  if (unit === 'K') return Math.round(raw * 1000);
  if (unit === 'M') return Math.round(raw * 1000000);
  if (unit === 'B') return Math.round(raw * 1000000000);
  if (unit === '萬') return Math.round(raw * 10000);
  return Math.round(raw);
}

function normalizeMetaCookieSeed() {
  const shared = [
    { name: 'sessionid', value: process.env.sessionid || '' },
    { name: 'csrftoken', value: process.env.csrftoken || '' },
    { name: 'ds_user_id', value: process.env.ds_user_id || '' },
    { name: 'ig_did', value: process.env.ig_did || '' },
    { name: 'mid', value: process.env.mid || '' },
    { name: 'datr', value: process.env.datr || '' },
    { name: 'ps_l', value: process.env.ps_l || '' },
    { name: 'ps_n', value: process.env.ps_n || '' },
  ].filter((item) => item.value);
  return {
    instagram: shared.map((item) => ({ ...item, domain: '.instagram.com', path: '/', httpOnly: false, secure: true })),
    threads: shared.map((item) => ({ ...item, domain: '.threads.net', path: '/', httpOnly: false, secure: true })),
  };
}

async function startConnectorRun(connectorName: string, platform: string, metadata?: Record<string, unknown>) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('connector_runs')
    .insert({ connector_name: connectorName, platform, status: 'running', metadata: metadata || {} })
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || `failed starting connector run ${connectorName}`);
  return String(data.id);
}

async function finishConnectorRun(runId: string, status: 'success' | 'failed' | 'partial' | 'skipped', recordsWritten: number, extra?: Partial<Row>) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('connector_runs').update({
    status,
    records_written: recordsWritten,
    error_summary: extra?.error_summary || null,
    metadata: extra?.metadata || {},
    finished_at: nowIso(),
  }).eq('id', runId);
  if (error) throw new Error(error.message);
}

async function createSourceAudit(params: {
  connectorRunId: string;
  platform: string;
  sourceEntityId?: string | null;
  targetUrl?: string | null;
  status: 'success' | 'failed' | 'partial';
  htmlContent?: string | null;
  screenshotBase64?: string | null;
  notes?: string | null;
  metadata?: Record<string, unknown>;
}) {
  await ensureDir(ARTIFACTS_DIR);
  const auditId = randomUUID();
  const snapshotPath = path.join(ARTIFACTS_DIR, `${auditId}.html`);
  const screenshotPath = params.screenshotBase64 ? path.join(ARTIFACTS_DIR, `${auditId}.png`) : null;
  if (params.htmlContent) await fs.writeFile(snapshotPath, params.htmlContent, 'utf8');
  if (params.screenshotBase64 && screenshotPath) await fs.writeFile(screenshotPath, Buffer.from(params.screenshotBase64, 'base64'));
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('source_audits').insert({
    connector_run_id: params.connectorRunId,
    platform: params.platform,
    source_entity_id: params.sourceEntityId || null,
    target_url: params.targetUrl || null,
    snapshot_path: params.htmlContent ? snapshotPath : null,
    screenshot_path: screenshotPath,
    status: params.status,
    notes: params.notes || null,
    metadata: params.metadata || {},
  });
  if (error) throw new Error(error.message);
}

async function startAgentRun(runType: string, context: Record<string, unknown>) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('agent_runs').insert({
    run_type: runType,
    status: 'running',
    initiated_by: 'system',
    context,
  }).select('*').single();
  if (error || !data) throw new Error(error?.message || `failed starting agent run ${runType}`);
  return String(data.id);
}

async function finishAgentRun(runId: string, status: 'success' | 'failed', context?: Record<string, unknown>) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('agent_runs').update({
    status,
    finished_at: nowIso(),
    context: context || {},
  }).eq('id', runId);
  if (error) throw new Error(error.message);
}

async function writeAgentTask(params: {
  agentRunId: string;
  agentRole: string;
  taskType: string;
  status: 'success' | 'failed';
  inputPayload?: Record<string, unknown>;
  outputSummary?: string | null;
  errorMessage?: string | null;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('agent_tasks').insert({
    agent_run_id: params.agentRunId,
    agent_role: params.agentRole,
    task_type: params.taskType,
    status: params.status,
    input_payload: params.inputPayload || {},
    output_summary: params.outputSummary || null,
    error_message: params.errorMessage || null,
    finished_at: nowIso(),
  }).select('*').single();
  if (error || !data) throw new Error(error?.message || `failed writing agent task ${params.taskType}`);
  return String(data.id);
}

async function writeAgentFinding(taskId: string, summary: string, params?: Partial<Row>) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('agent_findings').insert({
    agent_task_id: taskId,
    stock_id: params?.stock_id || null,
    theme_key: params?.theme_key || null,
    finding_type: params?.finding_type || 'source_signal',
    summary,
    confidence: params?.confidence || 0.5,
    evidence: params?.evidence || [],
    source_refs: params?.source_refs || [],
  });
  if (error) throw new Error(error.message);
}

function splitParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((item) => compactText(item))
    .filter(Boolean);
}

async function ensureStock(symbol: string, market: 'TW' | 'US', name: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('stocks')
    .upsert({ symbol, market, name, updated_at: nowIso() }, { onConflict: 'symbol,market' })
    .select('id,symbol,market,name')
    .single();
  if (error || !data) throw new Error(error?.message || `failed ensuring stock ${symbol}`);
  return data as Row;
}

async function upsertSourceEntity(params: {
  platform: string;
  entityType: 'broker' | 'kol' | 'forum_user' | 'channel' | 'site' | 'report_house';
  displayName: string;
  sourceKey: string;
  profileUrl?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('source_entities')
    .upsert(
      {
        platform: params.platform,
        entity_type: params.entityType,
        display_name: params.displayName,
        source_key: params.sourceKey,
        profile_url: params.profileUrl || null,
        metadata: params.metadata || {},
        status: 'active',
        updated_at: nowIso(),
      },
      { onConflict: 'source_key' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || `failed ensuring source entity ${params.sourceKey}`);
  return data as Row;
}

async function upsertKolProfile(params: {
  sourceEntityId?: string | null;
  displayName: string;
  primaryPlatform: string;
  profileUrl?: string | null;
  followerCount?: number | null;
  contentFocus?: string;
  discoveryState?: 'approved' | 'rejected' | 'monitor_only' | 'pending';
  metadata?: Record<string, unknown>;
}) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('kol_profiles')
    .upsert(
      {
        source_entity_id: params.sourceEntityId || null,
        display_name: params.displayName,
        primary_platform: params.primaryPlatform,
        profile_url: params.profileUrl || null,
        follower_count: params.followerCount ?? null,
        content_focus: params.contentFocus || 'tw_stocks',
        discovery_state: params.discoveryState || 'approved',
        metadata: params.metadata || {},
        updated_at: nowIso(),
      },
      { onConflict: 'primary_platform,display_name' },
    )
    .select('*')
    .single();
  if (error || !data) throw new Error(error?.message || `failed upserting kol profile ${params.displayName}`);
  return data as Row;
}

async function upsertCredentialRegistry(platform: string, status: 'missing' | 'configured' | 'valid' | 'invalid', extra?: Partial<Row>) {
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('source_credentials_registry').upsert(
    {
      platform,
      status,
      last_validated_at: status === 'valid' ? nowIso() : null,
      error_message: extra?.error_message || null,
      credential_ref: extra?.credential_ref || null,
      session_ref: extra?.session_ref || null,
      metadata: extra?.metadata || {},
      updated_at: nowIso(),
    },
    { onConflict: 'platform' },
  );
  if (error) throw new Error(error.message);
}

async function ensureDefaultWatchlists() {
  const supabase = getSupabaseServerClient();
  const rows = DEFAULT_WATCHLISTS.map((item) => ({
    platform: item.platform,
    watch_type: item.watch_type,
    watch_value: item.watch_value,
    enabled: true,
    priority: 50,
    metadata: { seeded_by: 'research-v2' },
    updated_at: nowIso(),
  }));
  const { error } = await supabase.from('source_watchlists').upsert(rows, { onConflict: 'platform,watch_type,watch_value' });
  if (error) throw new Error(error.message);
}

async function ensureDefaultKolProfiles() {
  for (const seed of KOL_SEEDS) {
    const sourceEntity = await upsertSourceEntity({
      platform: seed.primaryPlatform,
      entityType: 'kol',
      displayName: seed.displayName,
      sourceKey: `kol.${slugify(seed.displayName)}.${seed.primaryPlatform}`,
      profileUrl: seed.profileUrl,
      metadata: seed.metadata,
    });
    await upsertKolProfile({
      sourceEntityId: String(sourceEntity.id),
      displayName: seed.displayName,
      primaryPlatform: seed.primaryPlatform,
      profileUrl: seed.profileUrl,
      followerCount: seed.followerCount,
      contentFocus: seed.contentFocus,
      discoveryState: seed.followerCount >= 10000 ? 'approved' : 'monitor_only',
      metadata: seed.metadata,
    });
  }
}

function resolveStockAlias(text: string, fileName?: string) {
  const bundle = `${fileName || ''}\n${text}`;
  const symbolMatch = bundle.match(/\((\d{4})\.TW\/\d{4}/);
  if (symbolMatch) {
    const symbol = symbolMatch[1];
    const alias = Object.entries(COMPANY_ALIAS_MAP).find(([, value]) => value.symbol === symbol)?.[1];
    return alias || { symbol, market: 'TW' as const, name: symbol };
  }
  for (const [alias, company] of Object.entries(COMPANY_ALIAS_MAP)) {
    if (bundle.includes(alias)) return company;
  }
  return null;
}

function extractSection(text: string, startMarker: string, endMarkers: string[]) {
  const start = text.indexOf(startMarker);
  if (start < 0) return '';
  const afterStart = text.slice(start + startMarker.length);
  const endOffsets = endMarkers.map((marker) => afterStart.indexOf(marker)).filter((index) => index >= 0);
  const end = endOffsets.length > 0 ? Math.min(...endOffsets) : afterStart.length;
  return compactText(afterStart.slice(0, end));
}

function parseReportDate(text: string) {
  const match = text.match(/([一二三四五六七八九十十一十二]+月\s+\d{1,2},\s+\d{4})|([A-Z][a-z]+\s+\d{1,2},\s+\d{4})/);
  if (!match) return null;
  const raw = match[0];
  const normalized = raw
    .replace('一月', 'January')
    .replace('二月', 'February')
    .replace('三月', 'March')
    .replace('四月', 'April')
    .replace('五月', 'May')
    .replace('六月', 'June')
    .replace('七月', 'July')
    .replace('八月', 'August')
    .replace('九月', 'September')
    .replace('十月', 'October')
    .replace('十一月', 'November')
    .replace('十二月', 'December');
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function parseBrokerReportText(text: string, fileName: string) {
  const normalized = text.replace(/\r/g, '\n');
  const stock = resolveStockAlias(normalized, fileName);
  const lines = normalized.split('\n').map((item) => compactText(item)).filter(Boolean);
  const stockIndex = lines.findIndex((line) => stock && (line.includes(stock.name) || line.includes(stock.symbol)));
  const thesisTitle = stockIndex >= 0 ? lines.slice(stockIndex + 1, stockIndex + 4).find((line) => line.length >= 8) || fileName.replace(/\.pdf$/i, '') : fileName.replace(/\.pdf$/i, '');
  const summary = extractSection(normalized, '評論及分析', ['投資建議', '投資風險', '焦點內容']);
  const investmentView = extractSection(normalized, '投資建議', ['投資風險', '焦點內容', '交易資料表']);
  const risk = extractSection(normalized, '投資風險', ['增加持股', '交易資料表', '焦點內容']);
  const focus = extractSection(normalized, '焦點內容', ['交易資料表', '主 要 財 務 數 據 及 估 值']);
  const projection = extractSection(normalized, '主 要 財 務 數 據 及 估 值', ['-- 1 of', '資料來源：公司資料']);
  const targetMatch = normalized.match(/12\s*個月目標價\s*\(NT\$\)\s*([0-9.]+)/);
  const ratingMatch = normalized.match(/(增加持股|持有|減碼|買進|中立|賣出)/);
  const brokerMatch = normalized.match(/(凱基投顧|高盛|元大投顧|摩根士丹利|摩根大通|美林|永豐投顧|群益投顧|國泰證券|富邦投顧)/);

  const assumptions = splitParagraphs(summary)
    .filter((item) => /^[(（]?\d+/.test(item) || item.includes('我們認為') || item.includes('我們預估'))
    .slice(0, 8);
  const risks = splitParagraphs(risk).slice(0, 5);
  const focusBullets = splitParagraphs(focus).slice(0, 5);

  return {
    brokerName: brokerMatch?.[1] || '未識別券商/投顧',
    reportDate: parseReportDate(normalized),
    stock,
    rating: ratingMatch?.[1] || null,
    targetPrice: targetMatch ? toFiniteNumber(targetMatch[1], 0) : null,
    thesisTitle: compactText(thesisTitle),
    extractedSummary: compactText(summary || investmentView).slice(0, 4000),
    sections: [
      { sectionKind: 'investment_view', sectionTitle: '投資建議', sectionContent: compactText(investmentView) },
      { sectionKind: 'analysis', sectionTitle: '評論及分析', sectionContent: compactText(summary) },
      { sectionKind: 'projection', sectionTitle: '財務推估', sectionContent: compactText(projection) },
      { sectionKind: 'valuation', sectionTitle: '焦點內容', sectionContent: compactText(focus) },
      { sectionKind: 'risk', sectionTitle: '投資風險', sectionContent: compactText(risk) },
    ].filter((item) => item.sectionContent),
    assumptions,
    risks,
    focusBullets,
    rawText: normalized,
  };
}

async function readPdfByPdfJs(filePath: string) {
  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const raw = await fs.readFile(filePath);
    const loadingTask = pdfjs.getDocument({ data: new Uint8Array(raw) });
    const pdf = await loadingTask.promise;
    const pages: string[] = [];
    for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
      const page = await pdf.getPage(pageNum);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => {
          if (typeof item === 'object' && item && 'str' in item) return String(item.str || '');
          return '';
        })
        .join(' ');
      pages.push(compactText(pageText));
    }
    return pages.join('\n');
  } catch {
    return '';
  }
}

async function readPdfReport(filePath: string, fileName: string) {
  const [cliText, pdfJsText] = await Promise.all([
    execFileAsync('npx', ['pdf-parse', 'text', filePath, '--format', 'json'], {
      cwd: process.cwd(),
      maxBuffer: 16 * 1024 * 1024,
    })
      .then(({ stdout }) => {
        const parsed = JSON.parse(stdout) as { text?: string };
        return compactText(parsed.text || '');
      })
      .catch(() => ''),
    readPdfByPdfJs(filePath),
  ]);
  const merged = [cliText, pdfJsText]
    .filter(Boolean)
    .join('\n')
    .trim();
  return parseBrokerReportText(merged, fileName);
}

async function upsertSourceRawDocuments(items: Array<{
  sourceEntityId: string | null;
  platform: string;
  documentUrl: string;
  title: string;
  summary: string;
  contentText: string;
  publishedAt?: string | null;
  symbols?: string[];
  sentimentLabel?: string | null;
  confidence?: number | null;
  metadata?: Record<string, unknown>;
}>) {
  if (items.length === 0) return 0;
  const lookbackHours = resolveSourceSyncLookbackHours();
  const cutoffMs = Date.now() - lookbackHours * 60 * 60 * 1000;
  const filteredItems = items.filter((item) => {
    if (!item.publishedAt) return true;
    const publishedMs = new Date(item.publishedAt).getTime();
    if (!Number.isFinite(publishedMs)) return true;
    return publishedMs >= cutoffMs;
  });
  if (filteredItems.length === 0) return 0;
  const dedupedItems = Array.from(
    new Map(
      filteredItems.map((item) => [`${item.platform}::${item.documentUrl}`, item] as const),
    ).values(),
  );
  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from('source_raw_documents').upsert(
    dedupedItems.map((item) => ({
      source_entity_id: item.sourceEntityId,
      platform: item.platform,
      document_url: item.documentUrl,
      title: item.title,
      summary: item.summary,
      content_text: item.contentText,
      published_at: item.publishedAt || null,
      symbols: item.symbols || [],
      sentiment_label: item.sentimentLabel || null,
      confidence: item.confidence ?? null,
      metadata: { ...(item.metadata || {}), lookback_hours: lookbackHours },
    })),
    { onConflict: 'platform,document_url' },
  );
  if (error) throw new Error(error.message);
  return dedupedItems.length;
}

function buildBrokerSourceCoverage(parsed: ReturnType<typeof parseBrokerReportText>) {
  return [
    {
      sourceName: parsed.brokerName,
      sourceType: 'public_research',
      summary: parsed.extractedSummary,
      sourceUrl: null,
      sourceTimestamp: parsed.reportDate ? `${parsed.reportDate}T00:00:00.000Z` : null,
      symbols: parsed.stock ? [parsed.stock.symbol] : [],
      verificationStatus: '已證實',
      confidence: 0.88,
      weight: 0.2,
    },
  ];
}

async function scrapeInvestAnchors() {
  const { chromium } = await import('playwright');
  await ensureDefaultWatchlists();
  await ensureDefaultKolProfiles();
  const connectorRunId = await startConnectorRun('source-sync', 'investanchors', { mode: 'playwright_login' });
  const agentRunId = await startAgentRun('source_sync', { connector: 'investanchors' });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const account = process.env.Account || process.env.INVESTANCHORS_ACCOUNT || '';
  const password = process.env.Password || process.env.INVESTANCHORS_PASSWORD || '';
  const records: Array<{ title: string; summary: string; contentText: string; publishedAt: string | null; documentUrl: string; symbols: string[] }> = [];
  let entityId = '';

  try {
    await page.goto('https://investanchors.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    if (account && password) {
      try {
        await page.goto('https://investanchors.com/user/register/new', { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.locator('input[placeholder*="Email"], input[type="email"]').first().fill(account);
        await page.locator('input[placeholder*="密碼"], input[type="password"]').first().fill(password);
        await page.getByRole('button', { name: '登入' }).first().click();
        await page.waitForTimeout(2000);
        await upsertCredentialRegistry('investanchors', 'valid', { credential_ref: 'Account/Password', metadata: { mode: 'playwright_login' } });
      } catch (error) {
        await upsertCredentialRegistry('investanchors', 'invalid', {
          credential_ref: 'Account/Password',
          error_message: (error as Error).message,
          metadata: { mode: 'playwright_login' },
        });
        await page.goto('https://investanchors.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      }
    } else {
      await upsertCredentialRegistry('investanchors', 'missing', { credential_ref: 'Account/Password' });
    }

    const bodyText = compactText(await page.locator('body').innerText());
    const links = await page.$$eval('a', (els) => els.map((el) => ({ text: (el.textContent || '').trim(), href: (el as HTMLAnchorElement).href })));
    const articleLinks = unique(
      links
        .map((item) => item.href)
        .filter((href) => href && href.startsWith('https://investanchors.com/') && !href.includes('/user/') && href.split('/').length > 4),
    ).slice(0, 12);
    const dedup = new Set<string>();

    for (const link of articleLinks) {
      try {
        await page.goto(link, { waitUntil: 'domcontentloaded', timeout: 60_000 });
        await page.waitForTimeout(1200);
        const title = firstNonEmpty(
          await page.locator('h1').first().textContent().catch(() => ''),
          await page.title(),
          link.split('/').filter(Boolean).pop(),
        );
        if (!title || dedup.has(title)) continue;
        dedup.add(title);
        const text = compactText(await page.locator('body').innerText());
        const publishedAt = safeDateString(
          await page.locator('time').first().getAttribute('datetime').catch(() => '') ||
            text.match(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{2},\s+\d{4}\s+\d{2}:\d{2}/)?.[0],
        );
        const summary = text.slice(0, 900);
        const symbols = unique((text.match(/\b\d{4}\b/g) || []).filter((code) => code.length === 4)).slice(0, 8);
        records.push({ title, summary, contentText: text.slice(0, 8000), publishedAt, documentUrl: link, symbols });
        const screenshot = await page.screenshot({ type: 'png', fullPage: true });
        await createSourceAudit({
          connectorRunId,
          platform: 'investanchors',
          targetUrl: link,
          status: 'success',
          htmlContent: await page.content(),
          screenshotBase64: screenshot.toString('base64'),
          notes: title,
        });
      } catch (error) {
        await createSourceAudit({
          connectorRunId,
          platform: 'investanchors',
          targetUrl: link,
          status: 'failed',
          notes: (error as Error).message,
        });
      }
      if (records.length >= 10) break;
    }

    if (records.length === 0) {
      records.push({
        title: '定錨首頁產業摘要',
        summary: bodyText.slice(0, 1200),
        contentText: bodyText.slice(0, 5000),
        publishedAt: null,
        documentUrl: 'https://investanchors.com/',
        symbols: unique((bodyText.match(/\b\d{4}\b/g) || []).slice(0, 5)),
      });
    }
  } finally {
    await page.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const entity = await upsertSourceEntity({
    platform: 'investanchors',
    entityType: 'site',
    displayName: '定錨產業筆記',
    sourceKey: 'site.investanchors',
    profileUrl: 'https://investanchors.com/',
    metadata: { connector: 'playwright' },
  });
  entityId = String(entity.id);

  const count = await upsertSourceRawDocuments(
    records.map((item) => ({
      sourceEntityId: String(entity.id),
      platform: 'investanchors',
      documentUrl: item.documentUrl,
      title: item.title,
      summary: item.summary,
      contentText: item.contentText,
      publishedAt: item.publishedAt,
      symbols: item.symbols,
      sentimentLabel: 'bullish',
      confidence: 0.72,
      metadata: { connector: 'playwright', origin: 'investanchors' },
    })),
  );
  const taskId = await writeAgentTask({
    agentRunId,
    agentRole: 'Source Connector Agent',
    taskType: 'source-sync',
    status: 'success',
    inputPayload: { connector: 'investanchors' },
    outputSummary: `synced ${count} investanchors records`,
  });
  await writeAgentFinding(taskId, `定錨投筆同步 ${count} 筆內容`, { source_refs: records.map((item) => item.documentUrl), confidence: 0.77 });
  await finishAgentRun(agentRunId, 'success', { connector: 'investanchors', records_written: count });
  await finishConnectorRun(connectorRunId, 'success', count, { metadata: { entity_id: entity.id } });
  return { connector: 'investanchors', recordsWritten: count, entityId };
}

async function scrapePttStock() {
  const baseUrl = 'https://www.ptt.cc/bbs/Stock/index.html';
  const headers = { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', cookie: 'over18=1' };

  // Fetch index page to find prev-page links, then scrape up to 4 pages total (~80 articles)
  const allMatches: Array<{ href: string; title: string }> = [];
  let currentUrl = baseUrl;
  for (let page = 0; page < 4; page++) {
    try {
      const html = await fetch(currentUrl, { headers, signal: AbortSignal.timeout(8_000) }).then((res) => res.text());
      const titleMatches = Array.from(html.matchAll(/class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/g));
      for (const m of titleMatches) {
        allMatches.push({ href: m[1], title: m[2] });
      }
      // Find "上頁" (prev page) link
      const prevMatch = html.match(/href="([^"]+)"[^>]*>‹ 上頁/);
      if (!prevMatch) break;
      currentUrl = `https://www.ptt.cc${prevMatch[1]}`;
    } catch {
      break;
    }
  }

  const entity = await upsertSourceEntity({
    platform: 'ptt',
    entityType: 'site',
    displayName: 'PTT Stock',
    sourceKey: 'site.ptt.stock',
    profileUrl: baseUrl,
  });

  // For articles with stock-like patterns in title, fetch article body for richer content
  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
  }> = [];

  for (const match of allMatches.slice(0, 80)) {
    const title = compactText(match.title);
    const articleUrl = `https://www.ptt.cc${match.href}`;
    let contentText = title;
    let symbols = unique((String(match.title).match(/\b\d{4}\b/g) || []));

    // Fetch article body for posts that look stock-related (have 4-digit numbers or common tags)
    if (/\b\d{4}\b|標的|請益|心得|閒聊|情報/.test(match.title)) {
      try {
        const bodyHtml = await fetch(articleUrl, { headers, signal: AbortSignal.timeout(6_000) }).then((r) => r.text());
        const bodyText = compactText(bodyHtml.replace(/<[^>]+>/g, ' ')).slice(0, 2000);
        contentText = bodyText || title;
        // Extract symbols from body as well
        const bodySymbols = unique((bodyText.match(/\b\d{4}\b/g) || []));
        symbols = unique([...symbols, ...bodySymbols]);
      } catch {
        // Use title only on fetch failure
      }
    }

    // Detect sentiment from title keywords
    const sentimentLabel = /多|漲|噴|飆|利多|看好/.test(match.title) ? 'bullish'
      : /空|跌|崩|利空|看壞/.test(match.title) ? 'bearish' : 'neutral';

    docs.push({
      sourceEntityId: String(entity.id),
      platform: 'ptt',
      documentUrl: articleUrl,
      title,
      summary: title,
      contentText,
      symbols,
      sentimentLabel,
      confidence: symbols.length > 0 ? 0.62 : 0.45,
      metadata: { connector: 'http', page_depth: Math.floor(allMatches.indexOf(match) / 20) },
    });
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'ptt', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeBullTalk() {
  const baseUrl = 'https://www.cmoney.tw/forum/';
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  const entity = await upsertSourceEntity({
    platform: 'bulltalk',
    entityType: 'site',
    displayName: '股市爆料同學會',
    sourceKey: 'site.bulltalk',
    profileUrl: baseUrl,
  });

  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
  }> = [];

  // Scrape multiple CMoney forum sections for stock discussions
  const sections = [
    { url: 'https://www.cmoney.tw/forum/', label: '首頁' },
    { url: 'https://www.cmoney.tw/forum/article-list?topicId=1', label: '台股' },
    { url: 'https://www.cmoney.tw/forum/article-list?topicId=5', label: '熱門' },
  ];

  for (const section of sections) {
    try {
      const html = await fetch(section.url, { headers, signal: AbortSignal.timeout(10_000) }).then((r) => r.text());

      // Extract article links and titles from HTML
      // CMoney forum uses patterns like <a href="/forum/article/...">title</a>
      const articlePattern = /href="(\/forum\/article[^"]+)"[^>]*>([^<]{4,})<\/a>/g;
      const articleMatches = Array.from(html.matchAll(articlePattern));

      // Also try extracting from data attributes or JSON-LD if present
      const titlePattern = /class="[^"]*(?:article-title|post-title|title)[^"]*"[^>]*>([^<]{4,})<\/a>/g;
      const titleMatches = Array.from(html.matchAll(titlePattern));

      const seen = new Set<string>();
      const rawMatches = [...articleMatches, ...titleMatches];

      for (const m of rawMatches.slice(0, 30)) {
        const href = m[1] || '';
        const title = compactText(m[2] || m[1] || '');
        if (!title || title.length < 4) continue;
        const docUrl = href.startsWith('http') ? href : `https://www.cmoney.tw${href}`;
        if (seen.has(docUrl)) continue;
        seen.add(docUrl);

        const symbols = unique((String(m[2] || '').match(/\b\d{4}\b/g) || []));
        const sentimentLabel = /多|漲|噴|飆|利多|看好|翻倍/.test(title) ? 'bullish'
          : /空|跌|崩|利空|看壞|套牢/.test(title) ? 'bearish' : 'neutral';

        docs.push({
          sourceEntityId: String(entity.id),
          platform: 'bulltalk',
          documentUrl: docUrl,
          title,
          summary: title,
          contentText: title,
          symbols,
          sentimentLabel,
          confidence: symbols.length > 0 ? 0.58 : 0.42,
          metadata: { connector: 'http', section: section.label },
        });
      }

      // Fallback: if no article links found, extract text content with stock symbols
      if (docs.length === 0) {
        const plainText = compactText(html.replace(/<[^>]+>/g, ' ')).slice(0, 6000);
        const symbols = unique((plainText.match(/\b\d{4}\b/g) || []));
        docs.push({
          sourceEntityId: String(entity.id),
          platform: 'bulltalk',
          documentUrl: section.url,
          title: `股市爆料同學會 ${section.label}`,
          summary: `股市爆料同學會 ${section.label} 頁面摘要`,
          contentText: plainText,
          symbols,
          sentimentLabel: 'neutral',
          confidence: 0.40,
          metadata: { connector: 'http', section: section.label, fallback: true },
        });
      }
    } catch {
      // Non-fatal per section
    }
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'bulltalk', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeGoogleNewsTW() {
  const queries = [
    '台股+分析', '台股+投資報告', '半導體+台股', 'AI+伺服器+台股', '台股+法人買賣',
    '外資+買超+台股', '投信+買超+台股', '台股+法說會', '台股+財報+超預期',
    '台股+漲停+主力', '台股+突破+季線', '台股+轉機股', '電動車+台股概念股',
    '台積電+分析', '聯發科+展望', '台股+小型股+飆漲',
  ];
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  const entity = await upsertSourceEntity({
    platform: 'googlenews',
    entityType: 'site',
    displayName: 'Google News 台股',
    sourceKey: 'site.googlenews.tw',
    profileUrl: 'https://news.google.com',
  });

  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
  }> = [];
  const seen = new Set<string>();

  for (const query of queries) {
    try {
      const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=zh-TW&gl=TW&ceid=TW:zh-Hant`;
      const xml = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).then((r) => r.text());

      // Parse RSS items
      const items = Array.from(xml.matchAll(/<item>([\s\S]*?)<\/item>/g));
      for (const item of items.slice(0, 25)) {
        const block = item[1];
        const titleMatch = block.match(/<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/);
        const linkMatch = block.match(/<link>(.*?)<\/link>/);
        const descMatch = block.match(/<description>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/description>/);
        const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/);

        const title = compactText(titleMatch?.[1] || '');
        const link = (linkMatch?.[1] || '').trim();
        const description = compactText((descMatch?.[1] || '').replace(/<[^>]+>/g, ' '));
        if (!title || !link || seen.has(link)) continue;
        seen.add(link);

        const allText = `${title} ${description}`;
        const symbols = unique((allText.match(/\b[1-9]\d{3}\b/g) || []).filter((s) => Number(s) >= 1101 && Number(s) <= 9999));
        if (symbols.length === 0) continue;

        const sentimentLabel = /利多|漲|看好|買進|強勢|突破|創高|翻倍/.test(allText) ? 'bullish'
          : /利空|跌|看壞|賣出|破底|警示|下修/.test(allText) ? 'bearish' : 'neutral';

        const pubDate = pubDateMatch?.[1] ? new Date(pubDateMatch[1]).toISOString() : null;

        docs.push({
          sourceEntityId: String(entity.id),
          platform: 'googlenews',
          documentUrl: link,
          title,
          summary: description || title,
          contentText: allText.slice(0, 3000),
          symbols,
          sentimentLabel,
          confidence: 0.60,
          metadata: { connector: 'http', query, publishedAt: pubDate },
        });
      }
    } catch {
      // Non-fatal per query
    }
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'googlenews', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeAnueNews() {
  const entity = await upsertSourceEntity({
    platform: 'anue',
    entityType: 'site',
    displayName: '鉅亨網台股新聞',
    sourceKey: 'site.anue.tw_stock',
    profileUrl: 'https://news.cnyes.com/news/cat/tw_stock',
  });

  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
    publishedAt?: string;
  }> = [];

  // Anue REST API — tw_stock category + analyst picks
  const categories = ['tw_stock', 'tw_stock_news', 'tw_report'];
  for (const cat of categories) {
    try {
      const url = `https://news.cnyes.com/api/v3/news/category/${cat}?limit=30`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 StockInsiderBot/1.0', 'Accept': 'application/json' },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const items: Array<Record<string, unknown>> = data?.items?.data || [];
      for (const item of items) {
        const title = compactText(String(item.title || ''));
        if (!title) continue;
        const docUrl = String(item.url || `https://news.cnyes.com/news/id/${item.newsId}`);
        const summary = compactText(String(item.summary || item.intro || ''));
        const symbols = unique((Array.isArray(item.stocks) ? item.stocks : []).map((s: Record<string, unknown>) => String(s.code || '')).filter(Boolean));
        const allText = `${title} ${summary}`;
        const sentimentLabel = /利多|漲|看好|買進|強勢|突破|創高/.test(allText) ? 'bullish'
          : /利空|跌|看壞|賣出|破底|警示|下修/.test(allText) ? 'bearish' : 'neutral';
        const pubAt = item.publishAt ? new Date(Number(item.publishAt) * 1000).toISOString() : undefined;
        docs.push({
          sourceEntityId: String(entity.id),
          platform: 'anue',
          documentUrl: docUrl,
          title,
          summary: summary || title,
          contentText: allText.slice(0, 3000),
          symbols,
          sentimentLabel,
          confidence: symbols.length > 0 ? 0.65 : 0.50,
          metadata: { connector: 'http', category: cat },
          ...(pubAt ? { publishedAt: pubAt } : {}),
        });
      }
    } catch {
      // Non-fatal per category
    }
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'anue', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeUdnFinance() {
  const pages = [
    { url: 'https://money.udn.com/money/cate/5591', label: '台股新聞' },
    { url: 'https://money.udn.com/money/cate/12017', label: '台股焦點' },
  ];
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  const entity = await upsertSourceEntity({
    platform: 'udn',
    entityType: 'site',
    displayName: 'UDN 經濟日報',
    sourceKey: 'site.udn.finance',
    profileUrl: 'https://money.udn.com',
  });

  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
  }> = [];
  const seen = new Set<string>();

  for (const page of pages) {
    try {
      const html = await fetch(page.url, { headers, signal: AbortSignal.timeout(10_000) }).then((r) => r.text());

      // UDN uses <a href="/money/story/xxxx/yyyy">title</a> pattern
      const articlePattern = /href="(\/money\/story\/[^"]+)"[^>]*>([^<]{4,})<\/a>/g;
      const matches = Array.from(html.matchAll(articlePattern));

      for (const m of matches.slice(0, 30)) {
        const href = m[1];
        const title = compactText(m[2]);
        if (!title || title.length < 6) continue;
        const docUrl = `https://money.udn.com${href}`;
        if (seen.has(docUrl)) continue;
        seen.add(docUrl);

        const symbols = unique((title.match(/\b[1-9]\d{3}\b/g) || []).filter((s) => Number(s) >= 1101 && Number(s) <= 9999));

        const sentimentLabel = /利多|漲|看好|買進|強勢|突破|創高/.test(title) ? 'bullish'
          : /利空|跌|看壞|賣出|破底|警示|下修/.test(title) ? 'bearish' : 'neutral';

        docs.push({
          sourceEntityId: String(entity.id),
          platform: 'udn',
          documentUrl: docUrl,
          title,
          summary: title,
          contentText: title,
          symbols,
          sentimentLabel,
          confidence: symbols.length > 0 ? 0.58 : 0.40,
          metadata: { connector: 'http', section: page.label },
        });
      }
    } catch {
      // Non-fatal per page
    }
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'udn', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeMobile01Finance() {
  const url = 'https://www.mobile01.com/topiclist.php?f=291';
  const headers = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' };

  const entity = await upsertSourceEntity({
    platform: 'mobile01',
    entityType: 'site',
    displayName: 'Mobile01 投資理財',
    sourceKey: 'site.mobile01.finance',
    profileUrl: url,
  });

  const docs: Array<{
    sourceEntityId: string; platform: string; documentUrl: string;
    title: string; summary: string; contentText: string;
    symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
  }> = [];

  try {
    const html = await fetch(url, { headers, signal: AbortSignal.timeout(10_000) }).then((r) => r.text());

    // Mobile01 topic links: <a href="topicdetail.php?f=291&t=XXXXX...">title</a>
    const topicPattern = /href="(topicdetail\.php\?[^"]*f=291[^"]*)"[^>]*>([^<]{4,})<\/a>/g;
    const matches = Array.from(html.matchAll(topicPattern));

    const seen = new Set<string>();
    for (const m of matches.slice(0, 40)) {
      const href = m[1];
      const title = compactText(m[2]);
      if (!title || title.length < 6) continue;
      const docUrl = `https://www.mobile01.com/${href}`;
      if (seen.has(docUrl)) continue;
      seen.add(docUrl);

      const symbols = unique((title.match(/\b[1-9]\d{3}\b/g) || []).filter((s) => Number(s) >= 1101 && Number(s) <= 9999));

      const sentimentLabel = /利多|漲|看好|買進|強勢|賺/.test(title) ? 'bullish'
        : /利空|跌|看壞|賣出|賠|套牢/.test(title) ? 'bearish' : 'neutral';

      docs.push({
        sourceEntityId: String(entity.id),
        platform: 'mobile01',
        documentUrl: docUrl,
        title,
        summary: title,
        contentText: title,
        symbols,
        sentimentLabel,
        confidence: symbols.length > 0 ? 0.52 : 0.38,
        metadata: { connector: 'http' },
      });
    }
  } catch {
    // Non-fatal
  }

  const count = await upsertSourceRawDocuments(docs);
  return { connector: 'mobile01', recordsWritten: count, entityId: String(entity.id) };
}

async function syncGenericWatchlistConnector(platform: 'threads' | 'instagram' | 'telegram') {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('source_watchlists').select('*').eq('platform', platform).eq('enabled', true).order('priority', { ascending: false });
  if (error) throw new Error(error.message);
  const watchlists = (data as Row[]) || [];
  if (watchlists.length === 0) {
    await upsertCredentialRegistry(platform, 'missing', { metadata: { reason: 'no watchlist' } });
    return { connector: platform, recordsWritten: 0, entityId: null };
  }

  const entity = await upsertSourceEntity({
    platform,
    entityType: platform === 'telegram' ? 'channel' : 'site',
    displayName: platform === 'threads' ? 'Threads watchlist' : platform === 'instagram' ? 'Instagram watchlist' : 'Telegram watchlist',
    sourceKey: `site.${platform}.watchlist`,
  });

  const count = await upsertSourceRawDocuments(
    watchlists.map((item) => ({
      sourceEntityId: String(entity.id),
      platform,
      documentUrl: String(item.watch_value || ''),
      title: `${platform} watchlist: ${String(item.watch_value || '')}`,
      summary: `${platform} 目前採 watchlist 模式，等待登入 session 或 cookies 後做實際增量抓取。`,
      contentText: `${platform} watchlist seed ${String(item.watch_value || '')}`,
      sentimentLabel: 'neutral',
      confidence: 0.35,
      metadata: { watch_type: item.watch_type, placeholder: true },
    })),
  );
  await upsertCredentialRegistry(platform, 'missing', { metadata: { reason: 'watchlist_only_seed' } });
  return { connector: platform, recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeThreads() {
  try {
    return await _scrapeThreadsInner();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/executable|chromium|browser|playwright/i.test(msg)) {
      console.warn('[source-sync] threads: Playwright not available in serverless, falling back to watchlist');
      return syncGenericWatchlistConnector('threads');
    }
    throw err;
  }
}

async function _scrapeThreadsInner() {
  const supabase = getSupabaseServerClient();
  const connectorRunId = await startConnectorRun('source-sync', 'threads', { mode: 'playwright_cookie' });
  const agentRunId = await startAgentRun('source_sync', { connector: 'threads' });

  const metaCookies = normalizeMetaCookieSeed();
  const hasCookies = metaCookies.threads.length > 0;

  if (!hasCookies) {
    console.warn('[source-sync] threads connector skipped: Meta session cookies not configured. Set sessionid, csrftoken, ds_user_id, ig_did, mid, datr, ps_l, ps_n in Vercel env.');
    await upsertCredentialRegistry('threads', 'missing', { metadata: { reason: 'no_meta_cookies' } });
    await finishConnectorRun(connectorRunId, 'skipped', 0, { metadata: { reason: 'missing_credentials' } });
    await finishAgentRun(agentRunId, 'failed', { reason: 'missing_credentials' });
    return await syncGenericWatchlistConnector('threads');
  }

  const { data, error } = await supabase.from('source_watchlists').select('*').eq('platform', 'threads').eq('enabled', true).order('priority', { ascending: false });
  if (error) throw new Error(error.message);
  const watchlists = (data as Row[]) || [];

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  await context.addCookies(metaCookies.threads);
  const page = await context.newPage();

  const entity = await upsertSourceEntity({
    platform: 'threads',
    entityType: 'site',
    displayName: 'Threads KOL',
    sourceKey: 'site.threads.kol',
  });

  const records: Array<{ title: string; summary: string; contentText: string; publishedAt: string | null; documentUrl: string; symbols: string[] }> = [];
  let failedFetches = 0;

  try {
    for (const watchItem of watchlists.slice(0, 6)) {
      const watchType = String(watchItem.watch_type || '');
      const watchValue = String(watchItem.watch_value || '');
      let targetUrl = '';
      if (watchType === 'author') targetUrl = `https://www.threads.net/@${watchValue}`;
      else if (watchType === 'keyword' || watchType === 'hashtag') targetUrl = `https://www.threads.net/search?q=${encodeURIComponent(watchValue)}`;
      else if (watchType === 'url') targetUrl = watchValue;
      if (!targetUrl) continue;

      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(3000);
        const bodyText = compactText(await page.locator('body').innerText());
        if (bodyText.length < 100) {
          failedFetches += 1;
          await createSourceAudit({ connectorRunId, platform: 'threads', targetUrl, status: 'failed', notes: 'body too short, likely blocked' });
          continue;
        }
        const paragraphs = bodyText.split('\n').map(compactText).filter((t) => t.length > 20).slice(0, 20);
        for (const para of paragraphs) {
          const symbols = unique((para.match(/\b\d{4}\b/g) || []));
          const docUrl = `${targetUrl}#${slugify(para.slice(0, 40))}`;
          records.push({ title: `Threads: ${watchValue} - ${para.slice(0, 60)}`, summary: para.slice(0, 300), contentText: para, publishedAt: null, documentUrl: docUrl, symbols });
        }
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        await createSourceAudit({ connectorRunId, platform: 'threads', sourceEntityId: String(entity.id), targetUrl, status: 'success', htmlContent: await page.content(), screenshotBase64: screenshot.toString('base64'), notes: watchValue });
      } catch (err) {
        failedFetches += 1;
        await createSourceAudit({ connectorRunId, platform: 'threads', targetUrl, status: 'failed', notes: (err as Error).message });
      }
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const count = await upsertSourceRawDocuments(
    records.map((item) => ({
      sourceEntityId: String(entity.id),
      platform: 'threads',
      documentUrl: item.documentUrl,
      title: item.title,
      summary: item.summary,
      contentText: item.contentText,
      publishedAt: item.publishedAt,
      symbols: item.symbols,
      sentimentLabel: 'neutral',
      confidence: 0.55,
      metadata: { connector: 'playwright_cookie' },
    })),
  );

  const credStatus: 'valid' | 'invalid' = count > 0 && failedFetches < watchlists.length ? 'valid' : 'invalid';
  await upsertCredentialRegistry('threads', credStatus, {
    credential_ref: 'sessionid/csrftoken',
    metadata: { mode: 'playwright_cookie', records_written: count, failed_fetches: failedFetches, watchlist_count: watchlists.length },
  });

  const taskId = await writeAgentTask({ agentRunId, agentRole: 'Source Connector Agent', taskType: 'source-sync', status: 'success', inputPayload: { connector: 'threads' }, outputSummary: `synced ${count} threads records` });
  await writeAgentFinding(taskId, `Threads 同步 ${count} 筆內容`, { confidence: 0.6 });
  await finishAgentRun(agentRunId, 'success', { connector: 'threads', records_written: count });
  await finishConnectorRun(connectorRunId, count > 0 ? 'success' : 'partial', count, { metadata: { entity_id: entity.id } });
  return { connector: 'threads', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeInstagram() {
  try {
    return await _scrapeInstagramInner();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (/executable|chromium|browser|playwright/i.test(msg)) {
      console.warn('[source-sync] instagram: Playwright not available in serverless, falling back to watchlist');
      return syncGenericWatchlistConnector('instagram');
    }
    throw err;
  }
}

async function _scrapeInstagramInner() {
  const supabase = getSupabaseServerClient();
  const connectorRunId = await startConnectorRun('source-sync', 'instagram', { mode: 'playwright_cookie' });
  const agentRunId = await startAgentRun('source_sync', { connector: 'instagram' });

  const metaCookies = normalizeMetaCookieSeed();
  const hasCookies = metaCookies.instagram.length > 0;

  if (!hasCookies) {
    console.warn('[source-sync] instagram connector skipped: Meta session cookies not configured. Set sessionid, csrftoken, ds_user_id, ig_did, mid, datr, ps_l, ps_n in Vercel env.');
    await upsertCredentialRegistry('instagram', 'missing', { metadata: { reason: 'no_meta_cookies' } });
    await finishConnectorRun(connectorRunId, 'skipped', 0, { metadata: { reason: 'missing_credentials' } });
    await finishAgentRun(agentRunId, 'failed', { reason: 'missing_credentials' });
    return await syncGenericWatchlistConnector('instagram');
  }

  const { data, error } = await supabase.from('source_watchlists').select('*').eq('platform', 'instagram').eq('watch_type', 'author').eq('enabled', true).order('priority', { ascending: false });
  if (error) throw new Error(error.message);
  const watchlists = (data as Row[]) || [];

  const { chromium } = await import('playwright');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' });
  await context.addCookies(metaCookies.instagram);
  const page = await context.newPage();

  const entity = await upsertSourceEntity({
    platform: 'instagram',
    entityType: 'site',
    displayName: 'Instagram KOL',
    sourceKey: 'site.instagram.kol',
  });

  const records: Array<{ title: string; summary: string; contentText: string; publishedAt: string | null; documentUrl: string; symbols: string[] }> = [];
  let failedFetches = 0;

  try {
    for (const watchItem of watchlists.slice(0, 5)) {
      const author = String(watchItem.watch_value || '');
      const targetUrl = `https://www.instagram.com/${author}/`;
      try {
        await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
        await page.waitForTimeout(3000);
        const bodyText = compactText(await page.locator('body').innerText());
        if (bodyText.length < 100) {
          failedFetches += 1;
          await createSourceAudit({ connectorRunId, platform: 'instagram', targetUrl, status: 'failed', notes: 'body too short, likely blocked' });
          continue;
        }
        const captions = bodyText.split('\n').map(compactText).filter((t) => t.length > 30 && !t.startsWith('http')).slice(0, 15);
        for (const caption of captions) {
          const symbols = unique((caption.match(/\b\d{4}\b/g) || []));
          const docUrl = `${targetUrl}#${slugify(caption.slice(0, 40))}`;
          records.push({ title: `IG @${author}: ${caption.slice(0, 60)}`, summary: caption.slice(0, 300), contentText: caption, publishedAt: null, documentUrl: docUrl, symbols });
        }
        const screenshot = await page.screenshot({ type: 'png', fullPage: false });
        await createSourceAudit({ connectorRunId, platform: 'instagram', sourceEntityId: String(entity.id), targetUrl, status: 'success', htmlContent: await page.content(), screenshotBase64: screenshot.toString('base64'), notes: author });
      } catch (err) {
        failedFetches += 1;
        await createSourceAudit({ connectorRunId, platform: 'instagram', targetUrl, status: 'failed', notes: (err as Error).message });
      }
    }
  } finally {
    await page.close().catch(() => undefined);
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  const count = await upsertSourceRawDocuments(
    records.map((item) => ({
      sourceEntityId: String(entity.id),
      platform: 'instagram',
      documentUrl: item.documentUrl,
      title: item.title,
      summary: item.summary,
      contentText: item.contentText,
      publishedAt: item.publishedAt,
      symbols: item.symbols,
      sentimentLabel: 'neutral',
      confidence: 0.52,
      metadata: { connector: 'playwright_cookie' },
    })),
  );

  const credStatus: 'valid' | 'invalid' = count > 0 && failedFetches < watchlists.length ? 'valid' : 'invalid';
  await upsertCredentialRegistry('instagram', credStatus, {
    credential_ref: 'sessionid/csrftoken',
    metadata: { mode: 'playwright_cookie', records_written: count, failed_fetches: failedFetches, watchlist_count: watchlists.length },
  });

  const taskId = await writeAgentTask({ agentRunId, agentRole: 'Source Connector Agent', taskType: 'source-sync', status: 'success', inputPayload: { connector: 'instagram' }, outputSummary: `synced ${count} instagram records` });
  await writeAgentFinding(taskId, `Instagram 同步 ${count} 筆內容`, { confidence: 0.57 });
  await finishAgentRun(agentRunId, 'success', { connector: 'instagram', records_written: count });
  await finishConnectorRun(connectorRunId, count > 0 ? 'success' : 'partial', count, { metadata: { entity_id: entity.id } });
  return { connector: 'instagram', recordsWritten: count, entityId: String(entity.id) };
}

async function scrapeTelegram() {
  const supabase = getSupabaseServerClient();
  const connectorRunId = await startConnectorRun('source-sync', 'telegram', { mode: 'public_channel_html' });
  const agentRunId = await startAgentRun('source_sync', { connector: 'telegram' });

  const { data, error } = await supabase.from('source_watchlists').select('*').eq('platform', 'telegram').eq('enabled', true).order('priority', { ascending: false });
  if (error) throw new Error(error.message);
  const watchlists = (data as Row[]) || [];

  if (watchlists.length === 0) {
    await upsertCredentialRegistry('telegram', 'missing', { metadata: { reason: 'no watchlist' } });
    await finishConnectorRun(connectorRunId, 'skipped', 0, { metadata: { reason: 'no_watchlist' } });
    await finishAgentRun(agentRunId, 'failed', { reason: 'no_watchlist' });
    return { connector: 'telegram', recordsWritten: 0, entityId: null };
  }

  const entity = await upsertSourceEntity({
    platform: 'telegram',
    entityType: 'channel',
    displayName: 'Telegram channels',
    sourceKey: 'site.telegram.channels',
  });

  const records: Array<{ title: string; summary: string; contentText: string; publishedAt: string | null; documentUrl: string; symbols: string[] }> = [];

  for (const watchItem of watchlists.slice(0, 8)) {
    const rawUrl = String(watchItem.watch_value || '');
    const channelMatch = rawUrl.match(/t\.me\/(?:s\/)?([^/?]+)/);
    if (!channelMatch) continue;
    const channelName = channelMatch[1];
    const previewUrl = `https://t.me/s/${channelName}`;

    try {
      const html = await fetch(previewUrl, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(15_000) }).then((res) => res.text());
      const messageMatches = Array.from(html.matchAll(/<div class="tgme_widget_message_text[^"]*"[^>]*>([\s\S]*?)<\/div>/g));
      const dateMatches = Array.from(html.matchAll(/<time[^>]+datetime="([^"]+)"/g));
      const msgCount = Math.min(messageMatches.length, 20);
      for (let i = 0; i < msgCount; i++) {
        const rawMsg = (messageMatches[i]?.[1] || '').replace(/<[^>]+>/g, ' ');
        const msgText = compactText(rawMsg);
        if (msgText.length < 15) continue;
        const publishedAt = safeDateString(dateMatches[i]?.[1] || null);
        const symbols = unique((msgText.match(/\b\d{4}\b/g) || []));
        const docUrl = `${previewUrl}#msg-${i}`;
        records.push({ title: `Telegram @${channelName}: ${msgText.slice(0, 60)}`, summary: msgText.slice(0, 300), contentText: msgText, publishedAt, documentUrl: docUrl, symbols });
      }

      await createSourceAudit({ connectorRunId, platform: 'telegram', sourceEntityId: String(entity.id), targetUrl: previewUrl, status: records.length > 0 ? 'success' : 'partial', notes: channelName });
    } catch (err) {
      await createSourceAudit({ connectorRunId, platform: 'telegram', targetUrl: previewUrl, status: 'failed', notes: (err as Error).message });
    }
  }

  // Bot token mode: always collect from all groups the bot is a member of (public + private)
  let botTokenValid = false;
  if (TELEGRAM_BOT_TOKEN) {
    try {
      const meRes = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`, { signal: AbortSignal.timeout(10_000) })
        .then((res) => res.json()) as { ok?: boolean };
      botTokenValid = Boolean(meRes.ok);

      const botRes = await fetch(
        `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=100&allowed_updates=["message","channel_post"]`,
        { signal: AbortSignal.timeout(10_000) },
      ).then((res) => res.json()) as { ok: boolean; result?: Array<{ message?: { text?: string; date?: number; chat?: { id?: number; username?: string; title?: string } }; channel_post?: { text?: string; date?: number; chat?: { id?: number; username?: string; title?: string } } }> };
      if (botRes.ok && Array.isArray(botRes.result)) {
        const seenChatIds = new Set<number>();
        for (const update of botRes.result) {
          const msg = update.message || update.channel_post;
          if (!msg?.text) continue;
          const msgText = compactText(msg.text);
          if (msgText.length < 15) continue;
          const chatTitle = msg.chat?.title || msg.chat?.username || String(msg.chat?.id || 'unknown');
          const chatHandle = msg.chat?.username ? `https://t.me/${msg.chat.username}` : `tg://chat?id=${msg.chat?.id}`;
          const publishedAt = msg.date ? new Date(msg.date * 1000).toISOString() : null;
          const symbols = unique((msgText.match(/\b\d{4}\b/g) || []));
          records.push({ title: `Telegram @${chatTitle}: ${msgText.slice(0, 60)}`, summary: msgText.slice(0, 300), contentText: msgText, publishedAt, documentUrl: chatHandle, symbols });
          // Auto-register newly seen private groups (chat_id based)
          const chatId = msg.chat?.id;
          if (chatId && !seenChatIds.has(chatId)) {
            seenChatIds.add(chatId);
            await supabase.from('source_watchlists').upsert(
              { platform: 'telegram', watch_type: 'chat_id', watch_value: String(chatId), enabled: true, priority: 6, updated_at: new Date().toISOString() },
              { onConflict: 'platform,watch_value' },
            );
          }
        }
      }
    } catch (_botErr) {
      // bot token errors are non-fatal; HTML-scraped records still proceed
    }
  }

  const telegramCredStatus: 'valid' | 'invalid' | 'missing' = !TELEGRAM_BOT_TOKEN
    ? 'missing'
    : records.length > 0
      ? 'valid'
      : 'invalid';
  await upsertCredentialRegistry('telegram', telegramCredStatus, {
    credential_ref: TELEGRAM_BOT_TOKEN ? 'TELEGRAM_BOT_TOKEN' : null,
    metadata: {
      mode: TELEGRAM_BOT_TOKEN ? 'html_plus_bot_getUpdates' : 'public_channel_html',
      bot_token_valid: botTokenValid,
      records_written: records.length,
    },
  });

  const count = await upsertSourceRawDocuments(
    records.map((item) => ({
      sourceEntityId: String(entity.id),
      platform: 'telegram',
      documentUrl: item.documentUrl,
      title: item.title,
      summary: item.summary,
      contentText: item.contentText,
      publishedAt: item.publishedAt,
      symbols: item.symbols,
      sentimentLabel: 'neutral',
      confidence: 0.5,
      metadata: { connector: 'public_channel_html' },
    })),
  );

  const taskId = await writeAgentTask({ agentRunId, agentRole: 'Source Connector Agent', taskType: 'source-sync', status: 'success', inputPayload: { connector: 'telegram' }, outputSummary: `synced ${count} telegram records` });
  await writeAgentFinding(taskId, `Telegram 同步 ${count} 筆訊息`, { confidence: 0.55 });
  await finishAgentRun(agentRunId, 'success', { connector: 'telegram', records_written: count });
  await finishConnectorRun(connectorRunId, count > 0 ? 'success' : 'partial', count, { metadata: { entity_id: entity.id } });
  return { connector: 'telegram', recordsWritten: count, entityId: String(entity.id) };
}

export async function runReportIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  let files: string[] = [];
  try {
    files = (await fs.readdir(MATERIALS_DIR)).filter((file) => file.toLowerCase().endsWith('.pdf'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  if (dryRun) return { runId: randomUUID(), dryRun, filesFound: files.length, recordsWritten: files.length };

  const supabase = getSupabaseServerClient();
  let recordsWritten = 0;
  for (const fileName of files) {
    const filePath = path.join(MATERIALS_DIR, fileName);
    const parsed = await readPdfReport(filePath, fileName);
    const stock = parsed.stock ? await ensureStock(parsed.stock.symbol, parsed.stock.market, parsed.stock.name) : null;
    const brokerEntity = await upsertSourceEntity({
      platform: 'broker_report',
      entityType: 'broker',
      displayName: parsed.brokerName,
      sourceKey: `broker.${slugify(parsed.brokerName)}`,
      metadata: { source_mode: 'manual_pdf' },
    });
    const { data, error } = await supabase
      .from('broker_report_documents')
      .upsert(
        {
          stock_id: stock?.id || null,
          broker_name: parsed.brokerName,
          report_date: parsed.reportDate,
          file_name: fileName,
          file_path: filePath,
          source_mode: 'manual_pdf',
          rating: parsed.rating,
          target_price: parsed.targetPrice,
          thesis_title: parsed.thesisTitle,
          extracted_summary: parsed.extractedSummary,
          raw_text: parsed.rawText,
          metadata: {
            assumptions: parsed.assumptions,
            risks: parsed.risks,
            focus_bullets: parsed.focusBullets,
            source_entity_id: brokerEntity.id,
            source_coverage: buildBrokerSourceCoverage(parsed),
          },
          updated_at: nowIso(),
        },
        { onConflict: 'file_path' },
      )
      .select('*')
      .single();
    if (error || !data) throw new Error(error?.message || `failed storing broker report ${fileName}`);
    await supabase.from('broker_report_sections').delete().eq('broker_report_document_id', data.id);
    if (parsed.sections.length > 0) {
      const { error: sectionError } = await supabase.from('broker_report_sections').insert(
        parsed.sections.map((section, index) => ({
          broker_report_document_id: data.id,
          section_kind: section.sectionKind,
          section_title: section.sectionTitle,
          section_content: section.sectionContent,
          sort_order: index,
          page_from: index === 0 ? 1 : 2,
          page_to: index === 0 ? 1 : 2,
        })),
      );
      if (sectionError) throw new Error(sectionError.message);
    }
    recordsWritten += 1;
  }
  return { runId: randomUUID(), dryRun, filesFound: files.length, recordsWritten };
}

export async function runSourceSync(options?: { connector?: string; dryRun?: boolean }) {
  const connector = options?.connector || 'investanchors';
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, connector, recordsWritten: 0 };

  const mapping: Record<string, () => Promise<{ connector: string; recordsWritten: number; entityId: string | null }>> = {
    investanchors: scrapeInvestAnchors,
    ptt: scrapePttStock,
    bulltalk: scrapeBullTalk,
    googlenews: scrapeGoogleNewsTW,
    anue: scrapeAnueNews,
    udn: scrapeUdnFinance,
    mobile01: scrapeMobile01Finance,
    threads: scrapeThreads,
    instagram: scrapeInstagram,
    telegram: scrapeTelegram,
  };
  const runner = mapping[connector];
  if (!runner) throw new Error(`unsupported connector: ${connector}`);
  const result = await runner();
  return { runId: randomUUID(), dryRun, ...result };
}

export async function runSourceDiscovery(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('source_raw_documents')
    .select('*')
    .order('collected_at', { ascending: false })
    .limit(80);
  if (error) throw new Error(error.message);
  const documents = (data as Row[]) || [];
  const candidates: Array<{ platform: string; candidate_name: string; candidate_url: string | null; reason: string; evidence: Record<string, unknown> }> = [];

  for (const doc of documents) {
    const content = `${doc.title || ''}\n${doc.summary || ''}\n${doc.content_text || ''}`;
    const urls = Array.from(String(content).matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0]);
    for (const url of urls) {
      let platform = 'unknown';
      if (url.includes('threads.net')) platform = 'threads';
      else if (url.includes('instagram.com')) platform = 'instagram';
      else if (url.includes('t.me')) platform = 'telegram';
      else if (url.includes('youtube.com') || url.includes('youtu.be')) platform = 'kol';
      if (platform === 'unknown') continue;
      candidates.push({
        platform,
        candidate_name: url.replace(/^https?:\/\//, ''),
        candidate_url: url,
        reason: `由 ${String(doc.platform || 'unknown')} 來源文件轉載或提及`,
        evidence: { source_document_url: doc.document_url, title: doc.title },
      });
    }
  }

  const deduped = unique(candidates.map((item) => `${item.platform}|${item.candidate_url}`))
    .map((key) => candidates.find((item) => `${item.platform}|${item.candidate_url}` === key))
    .filter(Boolean) as typeof candidates;

  if (!dryRun && deduped.length > 0) {
    const { error: insertError } = await supabase.from('source_discovery_queue').insert(deduped);
    if (insertError) throw new Error(insertError.message);
  }

  return { runId: randomUUID(), dryRun, recordsWritten: deduped.length };
}

export async function runBrokerReportIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, reportsIngested: 0, sectionsWritten: 0 };

  const supabase = getSupabaseServerClient();
  // Get all tracked TW stocks
  const topN = resolveStoryCandidateTopN();
  const queryLimit = Math.max(topN, 60);
  const { data: stocksData } = await supabase.from('stocks').select('id,symbol,name,market').eq('market', 'TW').limit(queryLimit);
  const stocks = (stocksData as Row[]) || [];
  const today = asDate();

  let reportsIngested = 0;
  let sectionsWritten = 0;

  for (const stock of stocks.slice(0, topN)) {
    const symbol = String(stock.symbol || '');
    const stockId = String(stock.id || '');
    try {
      // Fetch Anue news for this stock (public, no auth)
      const anueRes = await fetch(
        `https://news.cnyes.com/api/v3/news/category/tw_stock?limit=5&stock_code=${symbol}`,
        { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!anueRes.ok) continue;
      type AnueItem = { title?: string; content?: string; publishAt?: number; summary?: string };
      const anueJson = await anueRes.json() as { items?: { data?: AnueItem[] } };
      const articles = anueJson.items?.data || [];
      if (articles.length === 0) continue;

      // Build a summary from recent articles
      const latestArticle = articles[0];
      const extractedSummary = [
        ...articles.map((a) => a.title || '').filter(Boolean).slice(0, 5),
      ].join('；');
      if (!extractedSummary) continue;

      // Detect rating keywords in title/summary
      const allText = articles.map((a) => `${a.title || ''} ${a.summary || ''}`).join(' ');
      const rating = /買進|增持|強烈推薦|buy|strong buy/i.test(allText) ? '買進'
        : /持有|neutral|維持/i.test(allText) ? '持有'
        : /賣出|減碼|sell|underperform/i.test(allText) ? '賣出' : null;

      // Extract target price from text (e.g. "目標價 XXX 元")
      const targetPriceMatch = allText.match(/目標價\s*[：:＄$]?\s*(\d{2,5}(?:\.\d{1,2})?)/);
      const targetPrice = targetPriceMatch ? Number(targetPriceMatch[1]) : null;

      const reportDate = latestArticle.publishAt
        ? new Date(Number(latestArticle.publishAt) * 1000).toISOString().slice(0, 10)
        : today;

      const { data: docData } = await supabase.from('broker_report_documents').upsert(
        {
          stock_id: stockId,
          broker_name: 'Anue 鉅亨',
          report_date: reportDate,
          file_name: `anue_${symbol}_${reportDate}`,
          file_path: `public_summary/anue/${symbol}/${reportDate}`,
          source_mode: 'public_summary',
          rating: rating || null,
          target_price: targetPrice,
          thesis_title: String(latestArticle.title || `${symbol} 近期市場觀點`).slice(0, 200),
          extracted_summary: extractedSummary.slice(0, 2000),
          raw_text: allText.slice(0, 8000),
          metadata: { source: 'anue', article_count: articles.length },
          updated_at: nowIso(),
        },
        { onConflict: 'file_path' },
      ).select('id').single();

      if (docData?.id) {
        const docId = String(docData.id);
        const sectionContent = articles
          .map((a) => `【${a.title || ''}】${a.summary || ''}`)
          .join('\n\n')
          .slice(0, 4000);
        await supabase.from('broker_report_sections').upsert(
          {
            broker_report_document_id: docId,
            section_kind: 'investment_view',
            section_title: '近期市場資訊彙整',
            section_content: sectionContent,
            sort_order: 1,
          },
          { onConflict: 'broker_report_document_id,sort_order' },
        );
        sectionsWritten += 1;
      }

      reportsIngested += 1;

      // Also scrape MoneyDJ for analyst ratings/targets for this stock
      try {
        const moneydjRes = await fetch(
          `https://www.moneydj.com/KMDJ/StockStat/StockStat.djhtm?a=${symbol}`,
          { headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36', accept: 'text/html' }, signal: AbortSignal.timeout(8_000) },
        );
        if (moneydjRes.ok) {
          const html = await moneydjRes.text();
          // Extract broker name, rating, and target price from MoneyDJ HTML tables
          // Pattern: "凱基投顧 買進 2200" or similar analyst consensus rows
          const brokerPattern = /([\u4e00-\u9fa5]{2,6}(?:投顧|證券|金控|資產管理))[^<]{0,50}?(買進|增持|持有|中立|賣出|減碼)[^<]{0,100}?(\d{3,5}(?:\.\d{1,2})?)/g;
          const brokerMatches = [...html.matchAll(brokerPattern)];
          for (const match of brokerMatches.slice(0, 5)) {
            const [, brokerName, ratingText, tpText] = match;
            const tp = Number(tpText);
            if (!brokerName || !ratingText || !tp || tp < 10 || tp > 100000) continue;
            const ratingNorm = /買進|增持/.test(ratingText) ? '買進' : /賣出|減碼/.test(ratingText) ? '賣出' : '持有';
            await supabase.from('broker_report_documents').upsert(
              {
                stock_id: stockId,
                broker_name: brokerName,
                report_date: today,
                file_name: `moneydj_${symbol}_${brokerName.replace(/\s/g, '')}_${today}`,
                file_path: `public_summary/moneydj/${symbol}/${brokerName.replace(/\s/g, '')}/${today}`,
                source_mode: 'public_summary',
                rating: ratingNorm,
                target_price: tp,
                thesis_title: `${brokerName} 投資評等：${ratingNorm}，目標價 ${tp}`,
                extracted_summary: `來源：MoneyDJ。${brokerName} 對 ${symbol} 給予${ratingNorm}評等，目標價 ${tp} 元。`,
                raw_text: `${brokerName} ${ratingText} ${tp}`,
                metadata: { source: 'moneydj', scraped_at: today },
                updated_at: nowIso(),
              },
              { onConflict: 'file_path' },
            );
            reportsIngested += 1;
          }
        }
      } catch {
        // MoneyDJ scrape failure is non-fatal
      }
    } catch {
      // skip individual stock errors
    }
  }

  // --- Anue general TW stock news scan (not limited to tracked stocks) ---
  // This discovers new stocks mentioned in recent market news
  try {
    const generalNewsUrls = [
      'https://news.cnyes.com/api/v3/news/category/tw_stock_news?limit=30',
      'https://news.cnyes.com/api/v3/news/category/tw_stock_front_page?limit=20',
    ];
    const generalEntity = await upsertSourceEntity({
      platform: 'anue',
      entityType: 'site',
      displayName: 'Anue 鉅亨台股新聞',
      sourceKey: 'site.anue.tw_stock_general',
      profileUrl: 'https://news.cnyes.com',
    });

    for (const newsUrl of generalNewsUrls) {
      try {
        const res = await fetch(newsUrl, {
          headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) continue;
        type AnueNewsItem = { title?: string; summary?: string; content?: string; publishAt?: number; newsId?: string };
        const json = await res.json() as { items?: { data?: AnueNewsItem[] } };
        const articles = json.items?.data || [];

        const generalDocs: Array<{
          sourceEntityId: string; platform: string; documentUrl: string;
          title: string; summary: string; contentText: string;
          symbols: string[]; sentimentLabel: string; confidence: number; metadata: Record<string, unknown>;
        }> = [];

        for (const article of articles) {
          const title = compactText(article.title || '');
          if (!title) continue;
          const summary = compactText(article.summary || article.title || '');
          const allText = `${title} ${summary}`;
          // Extract TW stock symbols (4-digit numbers that look like stock codes)
          const symbols = unique((allText.match(/\b[1-9]\d{3}\b/g) || []).filter((s) => Number(s) >= 1101 && Number(s) <= 9999));
          if (symbols.length === 0) continue; // Only save articles that mention specific stocks

          const publishDate = article.publishAt
            ? new Date(Number(article.publishAt) * 1000).toISOString()
            : nowIso();
          const docUrl = article.newsId
            ? `https://news.cnyes.com/news/id/${article.newsId}`
            : `https://news.cnyes.com`;

          const sentimentLabel = /利多|漲|看好|買進|強勢|突破|創高/.test(allText) ? 'bullish'
            : /利空|跌|看壞|賣出|破底|警示/.test(allText) ? 'bearish' : 'neutral';

          generalDocs.push({
            sourceEntityId: String(generalEntity.id),
            platform: 'anue',
            documentUrl: docUrl,
            title,
            summary,
            contentText: allText.slice(0, 3000),
            symbols,
            sentimentLabel,
            confidence: 0.65,
            metadata: { connector: 'http', source: 'anue_general_news', publishedAt: publishDate },
          });
        }

        if (generalDocs.length > 0) {
          const generalCount = await upsertSourceRawDocuments(generalDocs);
          reportsIngested += generalCount;
        }
      } catch {
        // Non-fatal per news URL
      }
    }
  } catch {
    // General news scan failure is non-fatal
  }

  return { runId: randomUUID(), dryRun, reportsIngested, sectionsWritten };
}

function ratingToTier(hasBrokerReport: boolean, evidenceScore: number, timingScore: number) {
  if (hasBrokerReport && evidenceScore >= 0.7 && timingScore >= 0.67) return 'actionable_setup' as const;
  if (hasBrokerReport && evidenceScore >= 0.65) return 'validated_thesis' as const;
  if (evidenceScore >= 0.35) return 'partially_verified' as const;
  return 'signal_candidate' as const;
}

function verificationLabelForTier(tier: 'signal_candidate' | 'partially_verified' | 'validated_thesis' | 'actionable_setup') {
  if (tier === 'signal_candidate') return '未證實' as const;
  if (tier === 'partially_verified') return '部分證實' as const;
  return '已證實' as const;
}

export async function runThesisRefresh(options?: { dryRun?: boolean; symbols?: string[]; topN?: number }) {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = Date.now();
  const supabase = getSupabaseServerClient();
  const today = asDate();
  const topN = Number.isFinite(Number(options?.topN)) && Number(options?.topN) > 0
    ? Number(options?.topN)
    : resolveStoryCandidateTopN();
  const requestedSymbols = unique((options?.symbols || []).map((item) => String(item || '').toUpperCase()).filter(Boolean));

  const [stocksRes, reportsRes, recsRes, evidenceRes, rawDocsRes, valuationsRes, revenueRes, fundamentalsRes, podcastRes, themesRes, storiesRes, signalsRes] = await Promise.all([
    supabase.from('stocks').select('*'),
    supabase.from('broker_report_documents').select('*').order('report_date', { ascending: false }),
    supabase.from('recommendations').select('*').eq('as_of', today).order('score', { ascending: false }),
    supabase.from('story_evidence_items').select('*').order('source_timestamp', { ascending: false }),
    supabase.from('source_raw_documents').select('*').order('collected_at', { ascending: false }).limit(300),
    supabase.from('valuation_cases').select('*'),
    supabase.from('revenue_signals').select('*').order('as_of_date', { ascending: false }).limit(200),
    supabase.from('fundamental_snapshots').select('*').order('as_of_date', { ascending: false }).limit(200),
    supabase.from('podcast_transcripts').select('podcast_episode_id,extracted_thesis,extracted_mentions,confidence').order('created_at', { ascending: false }).limit(100),
    supabase.from('theme_heat').select('theme_key,as_of_date,heat_score,related_symbols,window_type').eq('window_type', 'daily').order('as_of_date', { ascending: false }).limit(80),
    supabase.from('story_candidates').select('id,stock_id,as_of_date,evidence_score,timing_score,story_type,title,summary,catalyst_summary').order('as_of_date', { ascending: false }).order('updated_at', { ascending: false }).limit(400),
    supabase.from('stock_signals').select('stock_id,price,as_of').order('as_of', { ascending: false }).limit(800),
  ]);
  if (stocksRes.error || reportsRes.error || recsRes.error || evidenceRes.error || rawDocsRes.error || valuationsRes.error || themesRes.error || storiesRes.error || signalsRes.error) {
    throw new Error(
      stocksRes.error?.message ||
        reportsRes.error?.message ||
        recsRes.error?.message ||
        evidenceRes.error?.message ||
        rawDocsRes.error?.message ||
        valuationsRes.error?.message ||
        themesRes.error?.message ||
        storiesRes.error?.message ||
        signalsRes.error?.message ||
        'failed loading thesis refresh sources',
    );
  }

  const stocks = (stocksRes.data as Row[]) || [];
  const reports = (reportsRes.data as Row[]) || [];
  const recommendations = (recsRes.data as Row[]) || [];
  const evidenceItems = (evidenceRes.data as Row[]) || [];
  const rawDocs = (rawDocsRes.data as Row[]) || [];
  const valuationCases = (valuationsRes.data as Row[]) || [];
  const themes = (themesRes.data as Row[]) || [];
  const stories = (storiesRes.data as Row[]) || [];
  const latestSignals = (signalsRes.data as Row[]) || [];
  const revenueSignals = (revenueRes.data as Row[]) || [];
  const fundamentalSnapshots = (fundamentalsRes.data as Row[]) || [];
  const podcastTranscripts = (podcastRes.data as Row[]) || [];
  const latestStoryDate = String(stories[0]?.as_of_date || today);
  const storiesForRanking = stories.filter((row) => String(row.as_of_date || '') === latestStoryDate);

  const reportByStock = new Map<string, Row[]>();
  for (const row of reports) {
    const key = String(row.stock_id || '');
    if (!key) continue;
    reportByStock.set(key, [...(reportByStock.get(key) || []), row]);
  }
  const rawDocsBySymbol = new Map<string, Row[]>();
  for (const row of rawDocs) {
    const symbols = Array.isArray(row.symbols) ? (row.symbols as unknown[]).map(String) : [];
    for (const symbol of symbols) {
      rawDocsBySymbol.set(symbol, [...(rawDocsBySymbol.get(symbol) || []), row]);
    }
  }
  const recommendationByStock = new Map<string, Row>();
  for (const row of recommendations) {
    const key = String(row.stock_id || '');
    if (key && !recommendationByStock.has(key)) recommendationByStock.set(key, row);
  }
  const signalByStock = new Map<string, Row>();
  for (const row of latestSignals) {
    const key = String(row.stock_id || '');
    if (key && !signalByStock.has(key)) signalByStock.set(key, row);
  }
  const latestStoryByStock = new Map<string, Row>();
  for (const row of storiesForRanking) {
    const key = String(row.stock_id || '');
    if (key && !latestStoryByStock.has(key)) latestStoryByStock.set(key, row);
  }
  // Revenue and fundamental lookup by stock_id (latest entry first)
  const revenueByStock = new Map<string, Row>();
  for (const row of revenueSignals) {
    const key = String(row.stock_id || '');
    if (key && !revenueByStock.has(key)) revenueByStock.set(key, row);
  }
  const fundamentalByStock = new Map<string, Row>();
  for (const row of fundamentalSnapshots) {
    const key = String(row.stock_id || '');
    if (key && !fundamentalByStock.has(key)) fundamentalByStock.set(key, row);
  }
  // Podcast thesis extraction by symbol (cross-ref via extracted_mentions)
  const podcastThesisBySymbol = new Map<string, string[]>();
  for (const tr of podcastTranscripts) {
    const mentions = Array.isArray(tr.extracted_mentions) ? (tr.extracted_mentions as unknown[]).map(String) : [];
    const theses = Array.isArray(tr.extracted_thesis) ? (tr.extracted_thesis as Array<{ text?: string }>).map((t) => t.text || '').filter(Boolean) : [];
    for (const sym of mentions) {
      podcastThesisBySymbol.set(sym, [...(podcastThesisBySymbol.get(sym) || []), ...theses].slice(0, 3));
    }
  }

  const candidateScoring = scoreStoryDrivenCandidates({
    stocks,
    stories: storiesForRanking,
    themes,
    rawDocs,
    topN,
  });
  const stockIdBySymbol = new Map<string, string>();
  for (const row of stocks) {
    const stockId = String(row.id || '');
    const symbol = String(row.symbol || '').toUpperCase();
    if (stockId && symbol) stockIdBySymbol.set(symbol, stockId);
  }
  const forcedStockIds = requestedSymbols
    .map((symbol) => stockIdBySymbol.get(symbol))
    .filter((item): item is string => Boolean(item));
  const candidateStockIds = new Set([...candidateScoring.selected.map((item) => item.stockId), ...forcedStockIds]);

  let recordsWritten = 0;
  let missingDataCount = 0;
  for (const stock of stocks) {
    const stockId = String(stock.id || '');
    const symbol = String(stock.symbol || '');
    if (!candidateStockIds.has(stockId)) continue;
    const brokerViews = reportByStock.get(stockId) || [];
    const rec = recommendationByStock.get(stockId);
    const sourceDocs = rawDocsBySymbol.get(symbol) || [];
    const stockEvidence = evidenceItems.filter((item) => String(item.stock_id || '') === stockId).slice(0, 12);
    if (!rec && brokerViews.length === 0 && sourceDocs.length === 0) continue;

    const latestBroker = brokerViews[0];
    const baseValuation = valuationCases.find((item) => String(item.stock_id || '') === stockId && String(item.case_type || '') === 'base');
    const signal = signalByStock.get(stockId);
    const currentPrice = signal ? toFiniteNumber(signal.price, 0) : null;
    const evidenceScore = clamp(toFiniteNumber(rec?.evidence_score, stockEvidence.length > 0 ? 0.58 : 0.28));
    const timingScore = clamp(toFiniteNumber(rec?.timing_score, 0.45));
    const tier = ratingToTier(brokerViews.length > 0, evidenceScore, timingScore);
    const verificationStatus = verificationLabelForTier(tier);
    const thesisTitle = compactText(latestBroker?.thesis_title || rec?.thesis_title || sourceDocs[0]?.title || `${symbol} 研究主論點`);
    const thesisSummary = compactText(latestBroker?.extracted_summary || rec?.thesis_summary || sourceDocs[0]?.summary || '等待更多來源驗證與財務推估。').slice(0, 4000);
    const scenario = buildPeScenario({
      currentPrice,
      epsTtm: fundamentalByStock.get(stockId) ? toFiniteNumber(fundamentalByStock.get(stockId)?.eps_ttm, 0) : null,
      peRatio: fundamentalByStock.get(stockId) ? toFiniteNumber(fundamentalByStock.get(stockId)?.pe_ratio, 0) : null,
      monthlyRevenue: revenueByStock.get(stockId) ? toFiniteNumber(revenueByStock.get(stockId)?.monthly_revenue, 0) : null,
      yoyGrowth: revenueByStock.get(stockId) ? toFiniteNumber(revenueByStock.get(stockId)?.yoy_growth, 0) : null,
      momGrowth: revenueByStock.get(stockId) ? toFiniteNumber(revenueByStock.get(stockId)?.mom_growth, 0) : null,
      revenueRunRate: fundamentalByStock.get(stockId) ? toFiniteNumber(fundamentalByStock.get(stockId)?.revenue_run_rate, 0) : null,
      brokerTargetPrice: latestBroker ? toFiniteNumber(latestBroker.target_price, 0) : toFiniteNumber(baseValuation?.target_price, 0),
    });
    const targetPrice = scenario.base.targetPrice || null;
    const targetLow = scenario.bear.targetPrice || null;
    const targetHigh = scenario.upside.targetPrice || null;
    const invalidation = compactText(
      latestBroker?.metadata && typeof latestBroker.metadata === 'object'
        ? ((latestBroker.metadata as Row).risks as string[] | undefined)?.join('；')
        : ''
    ) || '若官方驗證遲遲未到位、產業價格反轉、或技術面失守，thesis 需重新檢討。';
    const storySourceSummary = unique(sourceDocs.map((item) => String(item.title || item.summary || '')).filter(Boolean)).slice(0, 4).join('；');
    const verificationSummary = brokerViews.length > 0
      ? `已有 ${brokerViews.length} 份券商/投顧報告或摘要納入評估，並與 ${stockEvidence.length} 筆官方/財務/法說證據交叉檢查。`
      : `目前尚無完整券商報告，主要依賴 ${sourceDocs.length} 筆來源文件與 ${stockEvidence.length} 筆證據交叉驗證。`;
    const revenue = revenueByStock.get(stockId);
    const fundamental = fundamentalByStock.get(stockId);
    const podcastTheses = podcastThesisBySymbol.get(symbol) || [];
    const financialProjectionSummary = (() => {
      const parts: string[] = [];
      if (revenue) {
        const rev = toFiniteNumber(revenue.monthly_revenue, 0);
        const yoy = toFiniteNumber(revenue.yoy_growth, 0);
        const mom = toFiniteNumber(revenue.mom_growth, 0);
        if (rev > 0) parts.push(`月營收 ${(rev / 1e8).toFixed(1)} 億（YoY ${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%，MoM ${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%）`);
      }
      if (fundamental) {
        const pe = toFiniteNumber(fundamental.pe_ratio, 0);
        const gm = toFiniteNumber(fundamental.gross_margin, 0);
        const eps = toFiniteNumber(fundamental.eps_ttm, 0);
        if (eps !== 0) parts.push(`EPS TTM ${eps.toFixed(2)} 元`);
        if (gm > 0) parts.push(`毛利率 ${gm.toFixed(1)}%`);
        if (pe > 0) parts.push(`本益比 ${pe.toFixed(1)}x`);
      }
      if (latestBroker) {
        const match = compactText(String(latestBroker.raw_text || '')).match(/每股盈餘[\s\S]{0,100}/);
        if (match) parts.push(match[0]);
      }
      return parts.length > 0 ? parts.join('；') : '目前財務推估主要來自月營收、毛利率與產業價格循環。';
    })();
    const valuationSummary = targetPrice
      ? `目標價以 ${targetPrice} 元為核心區間（Upside ${targetHigh ?? '-'} / Bear ${targetLow ?? '-'}），採 EPS×PE 情境法。`
      : '目前尚未形成穩定的估值區間。';
    if (scenario.missingFields.length > 0) missingDataCount += 1;

    let thesisModelId = '';
    if (!dryRun) {
      const { data, error } = await supabase
        .from('thesis_models')
        .upsert(
          {
            stock_id: stockId,
            as_of_date: today,
            thesis_title: thesisTitle,
            thesis_summary: thesisSummary,
            recommendation_tier: tier,
            verification_status: verificationStatus,
            story_source_summary: storySourceSummary || null,
            verification_summary: verificationSummary,
            financial_projection_summary: financialProjectionSummary,
            valuation_summary: valuationSummary,
            invalidation_summary: invalidation,
            target_price_low: targetLow,
            target_price_high: targetHigh,
            confidence: clamp((evidenceScore * 0.6) + (timingScore * 0.2) + (brokerViews.length > 0 ? 0.2 : 0.05)),
            metadata: {
              broker_report_count: brokerViews.length,
              source_document_count: sourceDocs.length,
              recommendation_id: rec?.id || null,
              candidate_score: candidateScoring.selected.find((item) => item.stockId === stockId)?.score || 0,
              candidate_reasons: candidateScoring.selected.find((item) => item.stockId === stockId)?.reasons || [],
              missing_fields: scenario.missingFields,
              quantitative: {
                current_price: currentPrice,
                base_revenue_annual: scenario.base.revenueAnnual,
                base_eps: scenario.base.eps,
                base_pe: scenario.base.pe,
                upside_revenue_annual: scenario.upside.revenueAnnual,
                upside_eps: scenario.upside.eps,
                upside_pe: scenario.upside.pe,
                bear_revenue_annual: scenario.bear.revenueAnnual,
                bear_eps: scenario.bear.eps,
                bear_pe: scenario.bear.pe,
              },
            },
            updated_at: nowIso(),
          },
          { onConflict: 'stock_id,as_of_date' },
        )
        .select('*')
        .single();
      if (error || !data) throw new Error(error?.message || `failed upserting thesis model for ${symbol}`);
      thesisModelId = String(data.id);

      await supabase.from('thesis_evidence_matrix').delete().eq('thesis_model_id', thesisModelId);
      const evidenceRows = [
        ...brokerViews.slice(0, 3).map((item) => ({
          thesis_model_id: thesisModelId,
          evidence_type: 'broker_report',
          source_label: String(item.broker_name || '券商/投顧'),
          source_url: null,
          stance: 'supporting',
          strength: 0.84,
          summary: compactText(item.extracted_summary).slice(0, 500),
        })),
        ...stockEvidence.slice(0, 6).map((item) => ({
          thesis_model_id: thesisModelId,
          evidence_type:
            String(item.evidence_class || '').includes('financial')
              ? 'financial'
              : String(item.evidence_class || '').includes('transcript') || String(item.evidence_class || '').includes('company')
                ? 'conference'
                : 'official',
          source_label: String(item.source_name || 'evidence'),
          source_url: item.source_url ? String(item.source_url) : null,
          stance: String(item.stance || 'supporting'),
          strength: toFiniteNumber(item.evidence_strength, 0.6),
          summary: compactText(item.headline || item.excerpt || '').slice(0, 500),
        })),
        ...sourceDocs.slice(0, 4).map((item) => ({
          thesis_model_id: thesisModelId,
          evidence_type: 'social',
          source_label: String(item.platform || 'source'),
          source_url: String(item.document_url || ''),
          stance: 'supporting',
          strength: toFiniteNumber(item.confidence, 0.45),
          summary: compactText(item.summary || item.title || '').slice(0, 500),
        })),
        ...podcastTheses.slice(0, 2).map((text) => ({
          thesis_model_id: thesisModelId,
          evidence_type: 'social',
          source_label: 'KOL Podcast',
          source_url: null,
          stance: 'supporting',
          strength: 0.55,
          summary: compactText(text).slice(0, 500),
        })),
      ];
      if (evidenceRows.length > 0) {
        const { error: evidenceInsertError } = await supabase.from('thesis_evidence_matrix').insert(evidenceRows);
        if (evidenceInsertError) throw new Error(evidenceInsertError.message);
      }

      await supabase.from('valuation_scenarios').upsert(
        [
          {
            thesis_model_id: thesisModelId,
            scenario_type: 'base',
            revenue_assumption: `年化營收 ${scenario.base.revenueAnnual ?? '-'}，YoY/MoM 混合因子推估`,
            eps_assumption: `EPS ${scenario.base.eps ?? '-'}，PE ${scenario.base.pe}`,
            valuation_method: 'eps_pe_base',
            target_price: scenario.base.targetPrice,
            expected_return_pct: scenario.base.expectedReturnPct,
            updated_at: nowIso(),
          },
          {
            thesis_model_id: thesisModelId,
            scenario_type: 'upside',
            revenue_assumption: `年化營收 ${scenario.upside.revenueAnnual ?? '-'}，催化劑提前落地`,
            eps_assumption: `EPS ${scenario.upside.eps ?? '-'}，PE ${scenario.upside.pe}`,
            valuation_method: 'eps_pe_upside',
            target_price: scenario.upside.targetPrice,
            expected_return_pct: scenario.upside.expectedReturnPct,
            updated_at: nowIso(),
          },
          {
            thesis_model_id: thesisModelId,
            scenario_type: 'bear',
            revenue_assumption: `年化營收 ${scenario.bear.revenueAnnual ?? '-'}，需求遞延或驗證不成立`,
            eps_assumption: `EPS ${scenario.bear.eps ?? '-'}，PE ${scenario.bear.pe}`,
            valuation_method: 'eps_pe_bear',
            target_price: scenario.bear.targetPrice,
            expected_return_pct: scenario.bear.expectedReturnPct,
            updated_at: nowIso(),
          },
        ],
        { onConflict: 'thesis_model_id,scenario_type' },
      );

      const linkedStory = latestStoryByStock.get(stockId);
      if (linkedStory) {
        await supabase.from('valuation_cases').upsert(
          [
            {
              story_candidate_id: String(linkedStory.id),
              stock_id: stockId,
              case_type: 'base',
              target_price: scenario.base.targetPrice,
              expected_return_pct: scenario.base.expectedReturnPct,
              assumptions: { revenue_annual: scenario.base.revenueAnnual, eps: scenario.base.eps, pe: scenario.base.pe, method: 'eps_pe_base' },
              updated_at: nowIso(),
            },
            {
              story_candidate_id: String(linkedStory.id),
              stock_id: stockId,
              case_type: 'upside',
              target_price: scenario.upside.targetPrice,
              expected_return_pct: scenario.upside.expectedReturnPct,
              assumptions: { revenue_annual: scenario.upside.revenueAnnual, eps: scenario.upside.eps, pe: scenario.upside.pe, method: 'eps_pe_upside' },
              updated_at: nowIso(),
            },
            {
              story_candidate_id: String(linkedStory.id),
              stock_id: stockId,
              case_type: 'invalidation',
              target_price: scenario.bear.targetPrice,
              expected_return_pct: scenario.bear.expectedReturnPct,
              assumptions: { revenue_annual: scenario.bear.revenueAnnual, eps: scenario.bear.eps, pe: scenario.bear.pe, method: 'eps_pe_bear' },
              updated_at: nowIso(),
            },
          ],
          { onConflict: 'story_candidate_id,case_type' },
        );
      }
    }

    recordsWritten += 1;
    void thesisModelId;
  }

  return {
    runId: randomUUID(),
    dryRun,
    recordsWritten,
    candidateCount: candidateStockIds.size || candidateScoring.diagnostics.candidateCount,
    missingCount: missingDataCount,
    sourceBreakdown: {
      fromStory: candidateScoring.diagnostics.fromStory,
      fromTheme: candidateScoring.diagnostics.fromTheme,
      fromSource: candidateScoring.diagnostics.fromSource,
    },
    asOf: latestStoryDate,
    durationMs: Date.now() - startedAt,
  };
}

export async function runResearchReportBuild(options?: { dryRun?: boolean; symbols?: string[]; topN?: number }) {
  const dryRun = Boolean(options?.dryRun);
  const startedAt = Date.now();
  const today = asDate();
  const topN = Number.isFinite(Number(options?.topN)) && Number(options?.topN) > 0 ? Number(options?.topN) : 20;
  const requestedSymbols = unique((options?.symbols || []).map((item) => String(item || '').toUpperCase()).filter(Boolean));
  const supabase = getSupabaseServerClient();
  const [thesisRes, stockRes, evidenceRes, valuationRes] = await Promise.all([
    supabase.from('thesis_models').select('*').eq('as_of_date', today),
    supabase.from('stocks').select('*'),
    supabase.from('thesis_evidence_matrix').select('*'),
    supabase.from('valuation_scenarios').select('*'),
  ]);
  if (thesisRes.error || stockRes.error || evidenceRes.error || valuationRes.error) {
    throw new Error(thesisRes.error?.message || stockRes.error?.message || evidenceRes.error?.message || valuationRes.error?.message || 'failed loading research report sources');
  }
  const stocks = new Map<string, Row>(((stockRes.data as Row[]) || []).map((row) => [String(row.id || ''), row]));
  const evidence = (evidenceRes.data as Row[]) || [];
  const scenarios = (valuationRes.data as Row[]) || [];
  const allThesisModels = (thesisRes.data as Row[]) || [];
  const thesisModels = allThesisModels
    .filter((model) => {
      if (requestedSymbols.length === 0) return true;
      const stock = stocks.get(String(model.stock_id || ''));
      if (!stock) return false;
      return requestedSymbols.includes(String(stock.symbol || '').toUpperCase());
    })
    .slice(0, topN);
  let recordsWritten = 0;
  const candidateCount = thesisModels.length;

  if (!dryRun) {
    for (const thesis of thesisModels) {
      const stock = stocks.get(String(thesis.stock_id || ''));
      if (!stock) continue;
      const thesisId = String(thesis.id || '');
      const stockId = String(stock.id || '');
      const relatedEvidence = evidence.filter((item) => String(item.thesis_model_id || '') === thesisId);
      const relatedScenarios = scenarios.filter((item) => String(item.thesis_model_id || '') === thesisId);
      const metadata = ((thesis.metadata as Row | undefined) || {});
      const quantitative = ((metadata.quantitative as Row | undefined) || {});
      const missingFields = Array.isArray(metadata.missing_fields) ? (metadata.missing_fields as unknown[]).map(String) : [];
      const scenarioMap = new Map<string, Row>(relatedScenarios.map((item) => [String(item.scenario_type || ''), item]));
      const base = scenarioMap.get('base');
      const upside = scenarioMap.get('upside');
      const bear = scenarioMap.get('bear');
      const reportMarkdown = [
        `# ${String(stock.symbol || '')} ${String(stock.name || '')} 投顧風格深度報告`,
        '',
        `## 1) 投資主軸（1-3 個月）`,
        String(thesis.thesis_summary || '尚未形成完整主軸。'),
        '',
        `## 2) 故事鏈與催化劑時間線`,
        String(thesis.story_source_summary || '目前主要根據來源文件與報告追蹤。'),
        '',
        `## 3) 驗證矩陣（官方/法說/財務/供應鏈/券商/社群）`,
        String(thesis.verification_summary || ''),
        ...relatedEvidence.slice(0, 10).map((item) => `- [${String(item.evidence_type || '')}] ${String(item.source_label || '')}: ${String(item.summary || '')}`),
        '',
        `## 4) 財務推估（營收→EPS→PE）`,
        String(thesis.financial_projection_summary || ''),
        `- Base 年化營收：${String(quantitative.base_revenue_annual ?? '-')}`,
        `- Base EPS：${String(quantitative.base_eps ?? '-')}`,
        `- Base PE：${String(quantitative.base_pe ?? '-')}`,
        `- Upside 年化營收：${String(quantitative.upside_revenue_annual ?? '-')}`,
        `- Upside EPS：${String(quantitative.upside_eps ?? '-')}`,
        `- Upside PE：${String(quantitative.upside_pe ?? '-')}`,
        `- Bear 年化營收：${String(quantitative.bear_revenue_annual ?? '-')}`,
        `- Bear EPS：${String(quantitative.bear_eps ?? '-')}`,
        `- Bear PE：${String(quantitative.bear_pe ?? '-')}`,
        '',
        `## 5) 估值情境（Base/Upside/Bear）`,
        `- Base: 目標價 ${String(base?.target_price ?? '-')}, 預期報酬 ${String(base?.expected_return_pct ?? '-')}%, 方法 ${String(base?.valuation_method ?? '-')}`,
        `- Upside: 目標價 ${String(upside?.target_price ?? '-')}, 預期報酬 ${String(upside?.expected_return_pct ?? '-')}%, 方法 ${String(upside?.valuation_method ?? '-')}`,
        `- Bear: 目標價 ${String(bear?.target_price ?? '-')}, 預期報酬 ${String(bear?.expected_return_pct ?? '-')}%, 方法 ${String(bear?.valuation_method ?? '-')}`,
        '',
        `## 6) 風險與反證`,
        String(thesis.invalidation_summary || ''),
        '',
        `## 7) 進出場規則`,
        `- 建議倉位分層：先小倉位試單，驗證後加碼。`,
        `- 風險控管：若核心催化未兌現或技術面失守，回到觀察名單。`,
        '',
        `## 8) 來源清單與缺漏來源`,
        ...relatedEvidence.slice(0, 12).map((item) => `- ${String(item.source_label || '')}${item.source_url ? ` (${String(item.source_url)})` : ''}`),
        missingFields.length > 0 ? `- 缺漏欄位：${missingFields.join('、')}` : '- 缺漏欄位：無',
      ].join('\n');

      const { error } = await supabase.from('research_reports').insert({
        stock_id: stockId,
        thesis_model_id: thesisId,
        report_kind: 'broker_style',
        title: `${String(stock.symbol || '')} 投顧風格深度報告`,
        summary: `${String(thesis.thesis_summary || '').slice(0, 260)}${missingFields.length > 0 ? `（缺漏：${missingFields.join('、')}）` : ''}`,
        report_markdown: reportMarkdown,
        source_coverage: relatedEvidence.map((item) => ({ type: item.evidence_type, label: item.source_label, url: item.source_url })),
        updated_at: nowIso(),
      });
      if (error && !String(error.message).includes('duplicate')) throw new Error(error.message);
      recordsWritten += 1;
    }
  }

  return {
    runId: randomUUID(),
    dryRun,
    recordsWritten,
    candidateCount,
    missingCount: Math.max(0, candidateCount - recordsWritten),
    durationMs: Date.now() - startedAt,
  };
}

export async function getSourceEntityDetail(entityId: string) {
  const supabase = getSupabaseServerClient();
  const [entityRes, docsRes, watchlistsRes, discoveryRes] = await Promise.all([
    supabase.from('source_entities').select('*').eq('id', entityId).single(),
    supabase.from('source_raw_documents').select('*').eq('source_entity_id', entityId).order('collected_at', { ascending: false }).limit(30),
    supabase.from('source_watchlists').select('*').eq('source_entity_id', entityId).order('priority', { ascending: false }),
    supabase.from('source_discovery_queue').select('*').order('created_at', { ascending: false }).limit(20),
  ]);
  if (entityRes.error) throw new Error(entityRes.error.message);
  return {
    entity: entityRes.data,
    documents: docsRes.data || [],
    watchlists: watchlistsRes.data || [],
    discoveryQueue: (discoveryRes.data || []).filter((item) => String(item.platform || '') === String(entityRes.data?.platform || '')),
  };
}

function extractYoutubeVideoId(url: string) {
  const match = url.match(/(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/);
  return match ? match[1] : null;
}

function parseRssItems(xmlText: string) {
  const items: Array<{ title: string; link: string; pubDate: string | null; audioUrl: string | null }> = [];
  const itemMatches = Array.from(xmlText.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g));
  for (const match of itemMatches.slice(0, 10)) {
    const body = match[1];
    const title = compactText((body.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/) || [])[1] || '');
    const link = compactText((body.match(/<link>([\s\S]*?)<\/link>/) || [])[1] || (body.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || '');
    const pubDate = safeDateString((body.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1] || '');
    const audioUrl = compactText((body.match(/<enclosure[^>]+url="([^"]+)"/) || [])[1] || '');
    if (title && link) items.push({ title, link, pubDate, audioUrl: audioUrl || null });
  }
  return items;
}

async function fetchYoutubePlaylist(channelUrl: string) {
  try {
    const html = await fetch(channelUrl, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(15_000) }).then((res) => res.text());
    const videoIds = unique(Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)).map((m) => m[1])).slice(0, 10);
    const titles = Array.from(html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)).map((m) => compactText(m[1])).slice(0, 10);
    return videoIds.map((id, i) => ({ title: titles[i] || `Episode ${i + 1}`, link: `https://www.youtube.com/watch?v=${id}`, pubDate: null, audioUrl: null }));
  } catch {
    return [];
  }
}

async function fetchYoutubeTranscript(videoId: string) {
  const langs = ['zh-TW', 'zh-Hant', 'zh', 'en'];
  for (const lang of langs) {
    try {
      const res = await fetch(`https://www.youtube.com/api/timedtext?v=${videoId}&lang=${lang}&fmt=json3`, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(15_000) });
      if (!res.ok) continue;
      const json = await res.json() as { events?: Array<{ segs?: Array<{ utf8?: string }> }> };
      const text = (json.events || []).flatMap((ev) => (ev.segs || []).map((seg) => seg.utf8 || '')).join(' ').replace(/\n/g, ' ');
      if (text.trim().length > 50) return { text: compactText(text), lang };
    } catch {
      continue;
    }
  }
  return null;
}

async function fetchYoutubeAudioUrl(videoId: string): Promise<string | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?key=AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': 'com.google.android.youtube/17.31.35 (Linux; U; Android 11)' },
      body: JSON.stringify({ videoId, context: { client: { clientName: 'ANDROID', clientVersion: '17.31.35', androidSdkVersion: 30, hl: 'zh-TW' } } }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { streamingData?: { adaptiveFormats?: Array<{ mimeType?: string; url?: string; bitrate?: number }> } };
    const audioFormats = (json.streamingData?.adaptiveFormats || [])
      .filter((f) => f.mimeType?.startsWith('audio/') && f.url)
      .sort((a, b) => (a.bitrate || 0) - (b.bitrate || 0));
    return audioFormats[0]?.url || null;
  } catch {
    return null;
  }
}

async function transcribeWithWhisper(audioUrl: string): Promise<{ text: string; lang: string } | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  try {
    // Download first 25MB of audio (Whisper API limit)
    const audioRes = await fetch(audioUrl, { headers: { Range: 'bytes=0-26214400' }, signal: AbortSignal.timeout(30_000) });
    if (!audioRes.ok && audioRes.status !== 206) return null;
    const audioBlob = await audioRes.blob();
    if (audioBlob.size < 1000) return null;

    const form = new FormData();
    form.append('file', audioBlob, 'audio.mp4');
    form.append('model', 'whisper-1');
    form.append('language', 'zh');
    form.append('response_format', 'text');

    const whisperRes = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal: AbortSignal.timeout(120_000),
    });
    if (!whisperRes.ok) return null;
    const text = await whisperRes.text();
    if (!text || text.trim().length < 50) return null;
    return { text: compactText(text), lang: 'zh' };
  } catch {
    return null;
  }
}

function extractPodcastInsights(text: string) {
  const symbols = unique((text.match(/\b\d{4}\b/g) || [])).slice(0, 20);
  const thesisPhrases = text.match(/[^。！？]*(?:看好|看多|目標|進場|買進|上漲|突破)[^。！？]*/g) || [];
  const riskPhrases = text.match(/[^。！？]*(?:風險|看空|看壞|下跌|停損|謹慎|回檔)[^。！？]*/g) || [];
  return {
    symbols,
    thesis: thesisPhrases.slice(0, 5).map((t) => ({ text: compactText(t), confidence: 0.6 })),
    risks: riskPhrases.slice(0, 5).map((t) => ({ text: compactText(t), confidence: 0.6 })),
  };
}

export async function runPodcastSync(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, recordsWritten: 0, episodesFound: 0, platforms: [] as string[] };

  const supabase = getSupabaseServerClient();
  const { data: kolData, error: kolError } = await supabase.from('kol_profiles').select('*').eq('discovery_state', 'approved');
  if (kolError) throw new Error(kolError.message);
  const kols = (kolData as Row[]) || [];

  let totalEpisodes = 0;
  const platformsUsed = new Set<string>();

  for (const kol of kols) {
    const meta = (kol.metadata || {}) as Record<string, unknown>;
    const kolId = String(kol.id);
    const sourceEntityId = kol.source_entity_id ? String(kol.source_entity_id) : null;

    const episodeItems: Array<{ title: string; link: string; pubDate: string | null; audioUrl: string | null; platform: string }> = [];

    const youtubeUrl = String(meta.youtubeUrl || '');
    if (youtubeUrl) {
      platformsUsed.add('youtube');
      const ytItems = await fetchYoutubePlaylist(youtubeUrl);
      episodeItems.push(...ytItems.map((item) => ({ ...item, platform: 'youtube' })));
    }

    const podcastName = String(meta.podcastName || String(kol.display_name || ''));
    if (episodeItems.length === 0 && podcastName) {
      const rssGuesses = [
        `https://feeds.soundon.fm/podcasts/${slugify(podcastName)}.xml`,
      ];
      for (const rssUrl of rssGuesses) {
        try {
          const xml = await fetch(rssUrl, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(10_000) }).then((res) => res.text());
          if (xml.includes('<rss') || xml.includes('<feed')) {
            const items = parseRssItems(xml);
            episodeItems.push(...items.map((item) => ({ ...item, platform: 'rss' })));
            platformsUsed.add('rss');
            break;
          }
        } catch {
          continue;
        }
      }
    }

    for (const ep of episodeItems.slice(0, 8)) {
      const { error } = await supabase.from('podcast_episodes').upsert(
        {
          source_entity_id: sourceEntityId,
          kol_profile_id: kolId,
          platform: ep.platform,
          podcast_name: podcastName,
          episode_title: ep.title,
          episode_url: ep.link,
          audio_url: ep.audioUrl || null,
          external_id: extractYoutubeVideoId(ep.link) || null,
          published_at: ep.pubDate,
          transcript_status: 'pending',
          metadata: { synced_by: 'runPodcastSync' },
          updated_at: nowIso(),
        },
        { onConflict: 'platform,episode_url' },
      );
      if (error && !String(error.message).includes('duplicate')) throw new Error(error.message);
      totalEpisodes += 1;
    }
  }

  return { runId: randomUUID(), dryRun, recordsWritten: totalEpisodes, episodesFound: totalEpisodes, platforms: Array.from(platformsUsed) };
}

export async function runPodcastTranscribe(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, transcribed: 0, unavailable: 0, failed: 0 };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase.from('podcast_episodes').select('*').eq('transcript_status', 'pending').order('published_at', { ascending: false }).limit(10);
  if (error) throw new Error(error.message);
  const episodes = (data as Row[]) || [];

  let transcribed = 0;
  let unavailable = 0;
  let failed = 0;

  for (const ep of episodes) {
    const epId = String(ep.id);
    const epUrl = String(ep.episode_url || '');
    const videoId = ep.external_id ? String(ep.external_id) : extractYoutubeVideoId(epUrl);
    const platform = String(ep.platform || '');
    const podcastName = String(ep.podcast_name || '');
    const episodeTitle = String(ep.episode_title || '');

    try {
      let transcriptResult: { text: string; lang: string } | null = null;

      let transcriptSource = 'youtube_caption';

      if (platform === 'youtube' && videoId) {
        transcriptResult = await fetchYoutubeTranscript(videoId);
        if (!transcriptResult) {
          // Fallback: download audio and transcribe via Whisper
          const audioUrl = await fetchYoutubeAudioUrl(videoId);
          if (audioUrl) {
            transcriptResult = await transcribeWithWhisper(audioUrl);
            if (transcriptResult) transcriptSource = 'whisper';
          }
        }
      }

      if (!transcriptResult) {
        await supabase.from('podcast_episodes').update({ transcript_status: 'transcript_unavailable', updated_at: nowIso() }).eq('id', epId);
        unavailable += 1;
        continue;
      }

      const insights = extractPodcastInsights(transcriptResult.text);
      const { error: insertErr } = await supabase.from('podcast_transcripts').upsert(
        {
          podcast_episode_id: epId,
          transcript_text: transcriptResult.text.slice(0, 50000),
          language: transcriptResult.lang,
          transcript_source: transcriptSource,
          extracted_mentions: insights.symbols,
          extracted_thesis: insights.thesis,
          extracted_risks: insights.risks,
          confidence: 0.6,
          updated_at: nowIso(),
        },
        { onConflict: 'podcast_episode_id' },
      );
      if (insertErr) throw new Error(insertErr.message);

      await supabase.from('podcast_episodes').update({ transcript_status: 'ready', updated_at: nowIso() }).eq('id', epId);

      await upsertSourceRawDocuments([{
        sourceEntityId: ep.source_entity_id ? String(ep.source_entity_id) : null,
        platform: 'podcast',
        documentUrl: epUrl,
        title: `[Podcast] ${podcastName}: ${episodeTitle}`,
        summary: transcriptResult.text.slice(0, 600),
        contentText: transcriptResult.text.slice(0, 8000),
        publishedAt: ep.published_at ? String(ep.published_at) : null,
        symbols: insights.symbols,
        sentimentLabel: insights.thesis.length > 0 ? 'bullish' : 'neutral',
        confidence: 0.6,
        metadata: { connector: 'podcast_transcript', video_id: videoId, lang: transcriptResult.lang, source: transcriptSource },
      }]);

      transcribed += 1;
    } catch (err) {
      await supabase.from('podcast_episodes').update({ transcript_status: 'failed', metadata: { error: (err as Error).message }, updated_at: nowIso() }).eq('id', epId);
      failed += 1;
    }
  }

  return { runId: randomUUID(), dryRun, transcribed, unavailable, failed };
}

// ────────────────────────────────────────────────
// Earnings Call / 法說會 Ingest
// ────────────────────────────────────────────────

export async function runEarningsCallIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, transcriptsIngested: 0, errors: 0 };

  const supabase = getSupabaseServerClient();
  const { data: stocksData } = await supabase.from('stocks').select('id,symbol,name,market').eq('market', 'TW').limit(60);
  const stocks = (stocksData as Row[]) || [];

  let transcriptsIngested = 0;
  let errors = 0;

  for (const stock of stocks.slice(0, 40)) {
    const symbol = String(stock.symbol || '');
    const stockId = String(stock.id || '');
    try {
      // Fetch Anue news with 法說會 keyword for this stock
      const anueRes = await fetch(
        `https://news.cnyes.com/api/v3/news/category/tw_stock?limit=5&stock_code=${symbol}&keyword=${encodeURIComponent('法說會')}`,
        { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!anueRes.ok) continue;
      type AnueItem = { title?: string; content?: string; publishAt?: number; summary?: string };
      const anueJson = await anueRes.json() as { items?: { data?: AnueItem[] } };
      const articles = anueJson.items?.data || [];
      if (articles.length === 0) continue;

      for (const article of articles.slice(0, 3)) {
        const title = String(article.title || '').trim();
        if (!title) continue;

        const eventTimestamp = article.publishAt
          ? new Date(Number(article.publishAt) * 1000).toISOString()
          : nowIso();

        const allText = `${title} ${article.summary || ''} ${article.content || ''}`;

        // Detect management tone
        const bullishKeywords = /看好|成長|展望正面|樂觀|上修|超預期/;
        const cautiousKeywords = /謹慎|下修|保守|衰退|風險|挑戰/;
        const managementTone: 'bullish' | 'cautious' | 'neutral' = bullishKeywords.test(allText)
          ? 'bullish'
          : cautiousKeywords.test(allText) ? 'cautious' : 'neutral';

        // Extract catalyst mentions
        const catalystPatterns = [
          /AI[\s·]?伺服器/g, /液冷/g, /先進封裝/g, /CoWoS/g, /HBM/g,
          /法說會/g, /營收/g, /毛利率/g, /EPS/g, /訂單/g, /產能/g,
          /漲價/g, /擴產/g, /新產品/g, /去庫存/g, /回補/g,
        ];
        const catalystMentions: string[] = [];
        for (const pattern of catalystPatterns) {
          const matches = allText.match(pattern);
          if (matches) catalystMentions.push(...new Set(matches));
        }

        const excerpt = (article.summary || article.content || title).slice(0, 2000);

        await supabase.from('conference_transcripts').upsert(
          {
            stock_id: stockId,
            event_name: title.slice(0, 200),
            transcript_excerpt: excerpt,
            source_url: `https://news.cnyes.com/search?q=${encodeURIComponent(symbol + ' 法說會')}`,
            event_timestamp: eventTimestamp,
            management_tone: managementTone,
            catalyst_mentions: catalystMentions,
          },
          { onConflict: 'stock_id,event_name,event_timestamp' },
        );
        transcriptsIngested += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { runId: randomUUID(), dryRun, transcriptsIngested, errors };
}

// ────────────────────────────────────────────────
// MOPS 重大訊息公告 Ingest
// ────────────────────────────────────────────────

export async function runMopsFilingIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, filingsIngested: 0, errors: 0 };

  const supabase = getSupabaseServerClient();
  const { data: stocksData } = await supabase.from('stocks').select('id,symbol,name,market').eq('market', 'TW').limit(60);
  const stocks = (stocksData as Row[]) || [];

  let filingsIngested = 0;
  let errors = 0;

  for (const stock of stocks.slice(0, 40)) {
    const symbol = String(stock.symbol || '');
    const stockId = String(stock.id || '');
    try {
      // Fetch Anue news for major filings/announcements
      const anueRes = await fetch(
        `https://news.cnyes.com/api/v3/news/category/tw_stock?limit=5&stock_code=${symbol}&keyword=${encodeURIComponent('重大訊息')}`,
        { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' }, signal: AbortSignal.timeout(10_000) },
      );
      if (!anueRes.ok) continue;
      type AnueItem = { title?: string; content?: string; publishAt?: number; summary?: string };
      const anueJson = await anueRes.json() as { items?: { data?: AnueItem[] } };
      const articles = anueJson.items?.data || [];
      if (articles.length === 0) continue;

      for (const article of articles.slice(0, 3)) {
        const title = String(article.title || '').trim();
        if (!title) continue;

        const eventTimestamp = article.publishAt
          ? new Date(Number(article.publishAt) * 1000).toISOString()
          : nowIso();

        const allText = `${title} ${article.summary || ''} ${article.content || ''}`;
        const managementTone: 'bullish' | 'cautious' | 'neutral' = /利多|正面|上修|成長/.test(allText)
          ? 'bullish'
          : /利空|負面|下修|虧損/.test(allText) ? 'cautious' : 'neutral';

        const excerpt = (article.summary || article.content || title).slice(0, 2000);

        await supabase.from('conference_transcripts').upsert(
          {
            stock_id: stockId,
            event_name: `[MOPS] ${title.slice(0, 190)}`,
            transcript_excerpt: excerpt,
            source_url: `https://mops.twse.com.tw/mops/web/t05st01`,
            event_timestamp: eventTimestamp,
            management_tone: managementTone,
            catalyst_mentions: [],
          },
          { onConflict: 'stock_id,event_name,event_timestamp' },
        );
        filingsIngested += 1;
      }
    } catch {
      errors += 1;
    }
  }

  return { runId: randomUUID(), dryRun, filingsIngested, errors };
}
