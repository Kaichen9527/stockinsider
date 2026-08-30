import fs from 'fs/promises';
import path from 'path';
import { createHash, randomUUID } from 'crypto';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { getSupabaseServerClient } from './supabase-server';
import { THREADS_CANONICAL_ORIGIN } from './source-auth';
import { APPROVED_TELEGRAM_PUBLIC_CHANNELS, RETIRED_SOURCE_CONNECTORS } from './source-policy';
import { fetchTextWithRetry, sourceFetchFailureCode } from './source-fetch';
import { getThreadsTokenForRun, threadsTokenRegistryMetadata } from './threads-token';

type Row = Record<string, unknown>;
const AUTHORIZED_BROKER_SOURCE_MODES = ['manual_pdf', 'manual_csv', 'imported_pdf'] as const;

const ROOT_DIR = path.resolve(process.cwd(), '..');
const MATERIALS_DIR = path.join(ROOT_DIR, 'materials');
const BROKER_REPORT_IMPORT_DIR = path.join(MATERIALS_DIR, 'broker-reports');
const ARTIFACTS_DIR = process.env.VERCEL
  ? path.join('/tmp', 'stockinsider', 'source-audits')
  : path.join(ROOT_DIR, '.agent', 'artifacts', 'source-audits');
const execFileAsync = promisify(execFile);

const SOURCE_RAW_CONTENT_MAX_CHARS = Math.max(500, Number(process.env.SOURCE_RAW_CONTENT_MAX_CHARS || 4000));
const DEFAULT_STORY_CANDIDATE_TOP_N = 50;
const DEFAULT_SOURCE_SYNC_LOOKBACK_HOURS = 24;
const US_BROKER_KEYWORDS = [
  'Morgan Stanley',
  'Goldman',
  'Goldman Sachs',
  'JPMorgan',
  'JP Morgan',
  'Citi',
  'Citigroup',
  'BofA',
  'Bank of America',
  'UBS',
  'Bernstein',
  'Jefferies',
  'FactSet',
  '美系外資',
  '外資報告',
  '券商報告',
];
const BROKER_VALUATION_KEYWORDS = ['target price', '目標價', 'EPS', 'Forward EPS', '本益比', 'PE', '評等', '調升', '調降', '上修', '下修'];
const BROKER_DISCOVERY_SEARCH_TERMS = [
  '台股 美系外資 目標價',
  '台股 FactSet EPS 目標價',
  'Morgan Stanley 台股 目標價',
  'Goldman Sachs 台股 EPS',
  'JPMorgan 台股 評等',
  '外資報告 台股 調升',
];

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
      rssUrl: 'https://feeds.soundon.fm/podcasts/954689a5-3096-43a4-a80b-7810b219cef3.xml',
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
      rssUrl: 'https://feeds.soundon.fm/podcasts/686ddd56-9b4d-4585-8e9d-31e722f989cf.xml',
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
    profileUrl: `${THREADS_CANONICAL_ORIGIN}/@ikala_stevecc`,
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
    displayName: '游庭皓的財經皓角',
    primaryPlatform: 'youtube',
    followerCount: 600000,
    contentFocus: 'tw_macro_tw_stocks',
    profileUrl: 'https://www.youtube.com/@yutinghaofinance',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/@yutinghaofinance',
      youtubeChannelId: 'UC0lbAQVpenvfA2QqzsRtL_g',
      podcastName: '游庭皓的財經皓角',
      rssUrl: 'https://feeds.soundcloud.com/users/soundcloud:users:735679489/sounds.rss',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1488295306',
      keywords: ['台股', '產業趨勢', '資金流向', '總經', '財經皓角'],
      sourcePriority: 0.74,
    },
  },
  {
    displayName: 'M觀點',
    primaryPlatform: 'youtube',
    followerCount: 180000,
    contentFocus: 'technology_investing',
    profileUrl: 'https://www.youtube.com/channel/UCT3uWFvKLVpRnEealmRwvrw',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/channel/UCT3uWFvKLVpRnEealmRwvrw',
      youtubeChannelId: 'UCT3uWFvKLVpRnEealmRwvrw',
      podcastName: 'M觀點 | 科技X商業X投資',
      rssUrl: 'https://feeds.soundon.fm/podcasts/b8f5a471-f4f7-4763-9678-65887beda63a.xml',
      websiteUrl: 'https://miula.tw/miula_perspective/',
      keywords: ['科技趨勢', 'AI', '半導體', '商業模式', '投資觀點'],
      sourcePriority: 0.68,
    },
  },
  {
    displayName: '財經M平方',
    primaryPlatform: 'youtube',
    followerCount: 120000,
    contentFocus: 'macro_market',
    profileUrl: 'https://www.youtube.com/channel/UC6LU7FUBvbFCh_cQasrHZ_Q',
    metadata: {
      youtubeUrl: 'https://www.youtube.com/channel/UC6LU7FUBvbFCh_cQasrHZ_Q',
      youtubeChannelId: 'UC6LU7FUBvbFCh_cQasrHZ_Q',
      podcastName: 'MacroMicro 財經M平方',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1522682178',
      websiteUrl: 'https://www.macromicro.me/video',
      keywords: ['總經', '台股', '半導體', '景氣循環', '資金流向'],
      sourcePriority: 0.66,
    },
  },
  {
    displayName: '財報狗',
    primaryPlatform: 'podcast',
    followerCount: 90000,
    contentFocus: 'tw_us_fundamentals',
    profileUrl: 'https://podcasts.apple.com/tw/podcast/id1513810531',
    metadata: {
      podcastName: '財報狗 - 掌握台股美股時事議題',
      rssUrl: 'https://feed.firstory.me/rss/user/clcftm46z000201z45w1c47fi',
      appleUrl: 'https://podcasts.apple.com/tw/podcast/id1513810531',
      youtubeUrl: 'https://www.youtube.com/@StatementdogAcademy',
      websiteUrl: 'https://statementdog.com/',
      keywords: ['財報', '產業循環', '台股', '美股', '基本面'],
      sourcePriority: 0.7,
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
  { platform: 'threads', watch_type: 'keyword', watch_value: '800G 光模組' },
  { platform: 'threads', watch_type: 'keyword', watch_value: 'AOI 檢測' },
  { platform: 'threads', watch_type: 'hashtag', watch_value: '台股' },
  { platform: 'threads', watch_type: 'hashtag', watch_value: 'AI伺服器' },
  { platform: 'threads', watch_type: 'hashtag', watch_value: '先進封裝' },
  { platform: 'threads', watch_type: 'hashtag', watch_value: 'CPO' },
  // Threads authors - known TW stock KOLs
  { platform: 'threads', watch_type: 'author', watch_value: 'stockcancer' },       // 股癌
  { platform: 'threads', watch_type: 'author', watch_value: 'chenweytai' },        // 陳唯泰
  { platform: 'threads', watch_type: 'author', watch_value: 'twstock888' },        // 小車
  { platform: 'threads', watch_type: 'author', watch_value: 'agerli.tw' },         // 阿格力
  { platform: 'threads', watch_type: 'author', watch_value: 'ikala_stevecc' },     // 程世嘉
  { platform: 'threads', watch_type: 'author', watch_value: 'investaddict_tw' },   // 投資癮
  { platform: 'threads', watch_type: 'author', watch_value: 'zhangzhenqing' },    // 張真卿（補漏）
  { platform: 'threads', watch_type: 'author', watch_value: 's178178' },          // 郭哲榮分析師
  { platform: 'threads', watch_type: 'author', watch_value: 'yutinghaofinance' }, // 游庭皓的財經皓角
  { platform: 'threads', watch_type: 'keyword', watch_value: '財經皓角' },
  { platform: 'threads', watch_type: 'keyword', watch_value: '財報狗' },
  { platform: 'threads', watch_type: 'keyword', watch_value: '財經M平方' },
  { platform: 'threads', watch_type: 'keyword', watch_value: 'M觀點' },
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
  { platform: 'kol', watch_type: 'author', watch_value: '游庭皓的財經皓角' },
  { platform: 'kol', watch_type: 'author', watch_value: 'M觀點' },
  { platform: 'kol', watch_type: 'author', watch_value: '財經M平方' },
  { platform: 'kol', watch_type: 'author', watch_value: '財報狗' },
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
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@yutinghaofinance' },          // 游庭皓的財經皓角
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/channel/UCT3uWFvKLVpRnEealmRwvrw' }, // M觀點
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/channel/UC6LU7FUBvbFCh_cQasrHZ_Q' }, // 財經M平方
  { platform: 'podcast', watch_type: 'url', watch_value: 'https://www.youtube.com/@StatementdogAcademy' },       // 財報狗
];

function nowIso() {
  return new Date().toISOString();
}

function resolveTimeoutMs(envKey: string, fallbackMs: number) {
  const raw = process.env[envKey];
  if (!raw) return fallbackMs;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallbackMs;
  return Math.floor(parsed);
}

function asDate(iso = nowIso()) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return nowIso().slice(0, 10);
  return date.toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
}

function toFiniteNumber(value: unknown, fallback = 0) {
  const num = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(num) ? num : fallback;
}

function positiveNumberOrNull(value: unknown) {
  const num = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(num) && num > 0 ? num : null;
}

function nonZeroNumberOrNull(value: unknown) {
  const num = toFiniteNumber(value, Number.NaN);
  return Number.isFinite(num) && num !== 0 ? num : null;
}

function hasMeaningfulRevenueRow(row: Row | null | undefined) {
  if (!row) return false;
  return positiveNumberOrNull(row.monthly_revenue) != null;
}

function hasMeaningfulFundamentalRow(row: Row | null | undefined) {
  if (!row) return false;
  return [
    nonZeroNumberOrNull(row.eps_ttm),
    positiveNumberOrNull(row.gross_margin),
    nonZeroNumberOrNull(row.operating_margin),
    nonZeroNumberOrNull(row.pe_ratio),
    positiveNumberOrNull(row.pb_ratio),
    positiveNumberOrNull(row.revenue_run_rate),
  ].some((value) => value != null);
}

function selectLatestPreferredRow(rows: Row[], predicate: (row: Row) => boolean) {
  let fallback: Row | null = null;
  for (const row of rows) {
    fallback ||= row;
    if (predicate(row)) return row;
  }
  return fallback;
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

function sourceKeySegment(value: string) {
  const ascii = slugify(value);
  if (ascii) return ascii;
  return encodeURIComponent(value)
    .replace(/%/g, '')
    .toLowerCase()
    .slice(0, 100);
}

function compactText(value: unknown) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function unique<T>(values: T[]) {
  return Array.from(new Set(values));
}





function extractTwSymbolsWithContext(text: string, validSymbols?: Set<string>) {
  const symbols = new Set<string>();
  const symbolRegex = /\b([1-9]\d{3})\b/g;
  const yearPattern = /^(19|20)\d{2}$/;
  const stockContextToken = /股|股票|代號|標的|公司|台股|上市|上櫃|買|賣|法說|營收|eps|pe|目標價|停損|轉讓|董監|內部人|外資|投信|自營/i;

  let match: RegExpExecArray | null;
  while ((match = symbolRegex.exec(text)) !== null) {
    const symbol = match[1];
    if (validSymbols && !validSymbols.has(symbol)) continue;
    const contextStart = Math.max(0, match.index - 16);
    const contextEnd = Math.min(text.length, match.index + symbol.length + 16);
    const context = text.slice(contextStart, contextEnd);
    if (yearPattern.test(symbol) && !stockContextToken.test(context)) continue;
    symbols.add(symbol);
  }
  return [...symbols];
}

type ExtractedTwSymbols = {
  symbols: string[];
  excludedFalsePositives: Array<{ token: string; reason: string }>;
};

function extractTwSymbolsWithEvidence(
  text: string,
  options?: {
    validSymbols?: Set<string>;
    stockNamesBySymbol?: Map<string, string>;
    aliasesBySymbol?: Map<string, string[]>;
  },
): ExtractedTwSymbols {
  const symbols = new Set<string>();
  const excludedFalsePositives: Array<{ token: string; reason: string }> = [];
  const symbolRegex = /\b([1-9]\d{3})\b/g;
  const stockContextToken = /股|股票|代號|股號|標的|公司|台股|上市|上櫃|買|賣|法說|營收|eps|pe|目標價|停損|外資|投信|自營|漲停|跌停|轉強|轉弱|突破|回測/i;
  const explicitTickerMarker = /[$#]$/;
  const explicitTickerSuffix = /^(\.TW|\.TWO)\b/i;
  const ambiguousNumber = /^(19|20)\d{2}$|^(1000|1200|1500|1600|1700|1800|2000|3000|5000)$/;
  let match: RegExpExecArray | null;

  while ((match = symbolRegex.exec(text)) !== null) {
    const symbol = match[1];
    const contextStart = Math.max(0, match.index - 28);
    const contextEnd = Math.min(text.length, match.index + symbol.length + 28);
    const context = text.slice(contextStart, contextEnd);
    const rawName = compactText(options?.stockNamesBySymbol?.get(symbol) || '');
    const name = rawName && rawName !== symbol && !/^\d+$/.test(rawName) ? rawName : '';
    const aliases = (options?.aliasesBySymbol?.get(symbol) || [])
      .map(compactText)
      .filter((alias) => alias && alias !== symbol && !/^\d+$/.test(alias));
    const hasNameNearby = Boolean(name && context.includes(name)) || aliases.some((alias) => context.includes(alias));
    const before = text.slice(Math.max(0, match.index - 3), match.index);
    const after = text.slice(match.index + symbol.length, Math.min(text.length, match.index + symbol.length + 6));
    const hasTickerFormat =
      explicitTickerMarker.test(before.trimEnd()) ||
      explicitTickerSuffix.test(after);
    const hasStockContext = stockContextToken.test(context);

    if (options?.validSymbols && !options.validSymbols.has(symbol)) {
      excludedFalsePositives.push({ token: symbol, reason: 'not_twse_tpex_symbol' });
      continue;
    }
    if (ambiguousNumber.test(symbol) && !hasNameNearby && !hasTickerFormat && !/代號|股號|股票代碼/i.test(context)) {
      excludedFalsePositives.push({ token: symbol, reason: 'ambiguous_year_or_price_without_stock_name' });
      continue;
    }
    if (!hasNameNearby && !hasTickerFormat && !hasStockContext) {
      excludedFalsePositives.push({ token: symbol, reason: 'no_stock_context_nearby' });
      continue;
    }
    symbols.add(symbol);
  }

  return { symbols: [...symbols], excludedFalsePositives };
}

function roundTo(value: number, precision = 2) {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function medianNumber(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? roundTo((sorted[mid - 1] + sorted[mid]) / 2, 2) : roundTo(sorted[mid], 2);
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
  const componentByStock = new Map<
    string,
    {
      storyStrength: number;
      industryStrength: number;
      sourceStrength: number;
      hybridBonus: number;
    }
  >();
  const fromStory = new Set<string>();
  const fromTheme = new Set<string>();
  const fromSource = new Set<string>();

  const ensure = (stockId: string) => {
    const current = scoreByStock.get(stockId) || { score: 0, reasons: [] };
    scoreByStock.set(stockId, current);
    return current;
  };
  const ensureComponents = (stockId: string) => {
    const current =
      componentByStock.get(stockId) || {
        storyStrength: 0,
        industryStrength: 0,
        sourceStrength: 0,
        hybridBonus: 0,
      };
    componentByStock.set(stockId, current);
    return current;
  };

  for (const story of stories) {
    const stockId = String(story.stock_id || '');
    if (!stockId) continue;
    fromStory.add(stockId);
    const current = ensure(stockId);
    const component = ensureComponents(stockId);
    const evidence = clamp(toFiniteNumber(story.evidence_score, 0.45));
    const timing = clamp(toFiniteNumber(story.timing_score, 0.45));
    const storyScore = 5 + evidence * 2.2 + timing * 1.4;
    current.score += storyScore;
    component.storyStrength += storyScore;
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
        const component = ensureComponents(stockId);
        const themeScore = 0.8 + heat * 0.65;
        current.score += themeScore;
        component.industryStrength += themeScore;
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
      const component = ensureComponents(stockId);
      const sourceScore = 0.45 + confidence * 0.9;
      current.score += sourceScore;
      component.sourceStrength += sourceScore;
      current.reasons.push(`source:${String(doc.platform || 'raw')}`);
    }
  }

  for (const [stockId, current] of scoreByStock.entries()) {
    const component = ensureComponents(stockId);
    const hasStory = fromStory.has(stockId);
    const hasTheme = fromTheme.has(stockId);
    const hasSource = fromSource.has(stockId);
    let hybridBonus = 0;
    if (hasStory && hasTheme) hybridBonus += 1.4;
    if (hasStory && hasSource) hybridBonus += 1.1;
    if (hasTheme && hasSource) hybridBonus += 0.8;
    if (hasStory && hasTheme && hasSource) hybridBonus += 1.6;
    if (hybridBonus > 0) {
      current.score += hybridBonus;
      component.hybridBonus += hybridBonus;
      const axes = [
        hasStory ? 'stock' : null,
        hasTheme ? 'industry' : null,
        hasSource ? 'source' : null,
      ].filter((item): item is string => Boolean(item));
      current.reasons.push(`hybrid:${axes.join('+')}`);
    }
  }

  const ranked = Array.from(scoreByStock.entries())
    .map(([stockId, value]) => {
      const component = ensureComponents(stockId);
      return {
        stockId,
        score: roundTo(value.score, 4),
        reasons: unique(value.reasons),
        storyStrength: roundTo(component.storyStrength, 4),
        industryStrength: roundTo(component.industryStrength, 4),
        sourceStrength: roundTo(component.sourceStrength, 4),
        hybridBonus: roundTo(component.hybridBonus, 4),
      };
    })
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
      hybridConfirmed: selected.filter((item) => item.hybridBonus > 0).length,
      topN,
      preview: selected.slice(0, 10).map((item) => ({
        stockId: item.stockId,
        score: item.score,
        reasons: item.reasons.slice(0, 4),
        components: {
          story: item.storyStrength,
          industry: item.industryStrength,
          source: item.sourceStrength,
          hybrid: item.hybridBonus,
        },
      })),
    },
  };
}

function buildPeScenario(params: {
  symbol?: string | null;
  thesisTitle?: string | null;
  thesisSummary?: string | null;
  currentPrice: number | null;
  epsTtm: number | null;
  peRatio: number | null;
  pbRatio?: number | null;
  monthlyRevenue: number | null;
  yoyGrowth: number | null;
  momGrowth: number | null;
  revenueRunRate: number | null;
  grossMarginPct?: number | null;
  operatingMarginPct?: number | null;
  brokerTargetPrice: number | null;
  evidenceCount?: number | null;
  sourceDocumentCount?: number | null;
  brokerReportCount?: number | null;
}) {
  type ScenarioProfileKey = 'odm_ai_server' | 'ic_design' | 'memory_storage' | 'optical_cpo' | 'generic_growth';
  type ScenarioProfile = {
    key: ScenarioProfileKey;
    driverLabel: string;
    peerLabel: string;
    benchmarkLabel: string;
    volumeLabel: string;
    aspLabel: string;
    mixLabel: string;
    mixStart: number;
    mixBase: number;
    mixUpside: number;
    mixBear: number;
    volumeGrowthBase: number;
    volumeGrowthUpside: number;
    volumeGrowthBear: number;
    aspGrowthBase: number;
    aspGrowthUpside: number;
    aspGrowthBear: number;
    grossMarginStart: number;
    grossMarginBase: number;
    grossMarginUpside: number;
    grossMarginBear: number;
    operatingMarginStart: number;
    operatingMarginBase: number;
    operatingMarginUpside: number;
    operatingMarginBear: number;
    benchmarkPeBase: number;
    benchmarkPeUpside: number;
    benchmarkPeBear: number;
    defaultDrivers: string[];
  };
  const formatScenarioMoney = (value: number | null) => {
    if (value == null || !Number.isFinite(value)) return null;
    const abs = Math.abs(value);
    if (abs >= 100000000) return `${roundTo(value / 100000000, 1).toLocaleString('en-US')} 億`;
    if (abs >= 10000) return `${roundTo(value / 10000, 1).toLocaleString('en-US')} 萬`;
    return roundTo(value, 2).toLocaleString('en-US');
  };
  const percentText = (value: number | null | undefined) =>
    value == null || !Number.isFinite(value) ? null : `${value > 0 ? '+' : ''}${roundTo(value, 2)}%`;
  const safeRatioText = (value: number | null | undefined, suffix = 'x') =>
    value == null || !Number.isFinite(value) ? null : `${roundTo(value, 2)}${suffix}`;
  const formatPctPointRange = (fromValue: number | null | undefined, toValue: number | null | undefined) => {
    if (fromValue == null || toValue == null || !Number.isFinite(fromValue) || !Number.isFinite(toValue)) return null;
    return `${roundTo(fromValue, 2)}% -> ${roundTo(toValue, 2)}%`;
  };
  const inferScenarioProfile = (symbol: string, contextText: string): ScenarioProfile => {
    const text = contextText.toLowerCase();
    if (
      symbol === '2382' ||
      /ai server|伺服器|機櫃|odm|rack|server|cloud capex|雲端客戶/.test(text)
    ) {
      return {
        key: 'odm_ai_server',
        driverLabel: 'AI server 機櫃與整機出貨放量',
        peerLabel: 'AI server ODM / EMS',
        benchmarkLabel: '同業 forward PE 多落在 16x–22x',
        volumeLabel: 'AI server 機櫃出貨',
        aspLabel: '高階整機 ASP',
        mixLabel: 'AI server 營收占比',
        mixStart: 28,
        mixBase: 38,
        mixUpside: 45,
        mixBear: 30,
        volumeGrowthBase: 18,
        volumeGrowthUpside: 28,
        volumeGrowthBear: 6,
        aspGrowthBase: 5,
        aspGrowthUpside: 9,
        aspGrowthBear: 1,
        grossMarginStart: 8.5,
        grossMarginBase: 9.5,
        grossMarginUpside: 10.4,
        grossMarginBear: 8.1,
        operatingMarginStart: 4.2,
        operatingMarginBase: 5.4,
        operatingMarginUpside: 6.2,
        operatingMarginBear: 3.8,
        benchmarkPeBase: 18,
        benchmarkPeUpside: 22,
        benchmarkPeBear: 15,
        defaultDrivers: [
          '國際 CSP 資本支出延伸到 2027，AI server 訂單能見度仍在拉長',
          '高階機櫃與 rack-level 產品滲透，讓 ASP 與毛利率都比傳統伺服器更好',
          '若出貨節奏沒有掉速，市場願意用 forward PE 重新定價這段轉型獲利',
        ],
      };
    }
    if (symbol === '2454' || /soc|手機|旗艦|edge ai|邊緣 ai|ic design|晶片/.test(text)) {
      return {
        key: 'ic_design',
        driverLabel: '旗艦 SoC mix 與高階 ASP 提升',
        peerLabel: '高階 IC 設計',
        benchmarkLabel: '同業 forward PE 多落在 18x–24x',
        volumeLabel: '旗艦 SoC 出貨',
        aspLabel: '旗艦 SoC ASP',
        mixLabel: '高階產品營收占比',
        mixStart: 34,
        mixBase: 42,
        mixUpside: 48,
        mixBear: 31,
        volumeGrowthBase: 8,
        volumeGrowthUpside: 14,
        volumeGrowthBear: -2,
        aspGrowthBase: 6,
        aspGrowthUpside: 12,
        aspGrowthBear: -3,
        grossMarginStart: 46,
        grossMarginBase: 49,
        grossMarginUpside: 51.5,
        grossMarginBear: 44.5,
        operatingMarginStart: 18,
        operatingMarginBase: 21,
        operatingMarginUpside: 23.5,
        operatingMarginBear: 16.5,
        benchmarkPeBase: 20,
        benchmarkPeUpside: 24,
        benchmarkPeBear: 17,
        defaultDrivers: [
          '旗艦 SoC 與 AI 邊緣運算產品組合改善，是下一段獲利彈性的主因',
          '高階 ASP 與毛利率只要再往上墊高，EPS 會比營收成長更快',
          '市場通常以同業成長股的 forward PE 來反映高階產品 mix 上升',
        ],
      };
    }
    if (symbol === '2337' || /emmc|nand|flash|ssd|儲存|記憶體|mlc|tlc/.test(text)) {
      return {
        key: 'memory_storage',
        driverLabel: '高毛利 eMMC / MLC 供需缺口帶動 ASP 與 product mix 改善',
        peerLabel: '儲存 / 記憶體',
        benchmarkLabel: '同業景氣上行時 forward PE 多落在 10x–13x',
        volumeLabel: '儲存位元出貨',
        aspLabel: 'ASP/Gb',
        mixLabel: '高毛利產品占比',
        mixStart: 26,
        mixBase: 34,
        mixUpside: 40,
        mixBear: 22,
        volumeGrowthBase: 10,
        volumeGrowthUpside: 18,
        volumeGrowthBear: -5,
        aspGrowthBase: 7,
        aspGrowthUpside: 14,
        aspGrowthBear: -6,
        grossMarginStart: 20,
        grossMarginBase: 28,
        grossMarginUpside: 33,
        grossMarginBear: 18,
        operatingMarginStart: 4,
        operatingMarginBase: 10,
        operatingMarginUpside: 14,
        operatingMarginBear: 2,
        benchmarkPeBase: 10,
        benchmarkPeUpside: 13,
        benchmarkPeBear: 8,
        defaultDrivers: [
          '高毛利 eMMC / MLC 產品供給吃緊，ASP/Gb 與產品組合都有改善空間',
          '記憶體週期只要從供需失衡走向缺貨，毛利率彈性通常大於營收彈性',
          '這類股票往往先由 EPS 修復，再用景氣上行區間的 PE 重新定價',
        ],
      };
    }
    if (/cpo|800g|光模組|optical|ld|cos/.test(text)) {
      return {
        key: 'optical_cpo',
        driverLabel: '高速光模組 / CPO 滲透率提升',
        peerLabel: '光通訊 / CPO',
        benchmarkLabel: '同業 forward PE 多落在 20x–30x',
        volumeLabel: '高速光模組出貨',
        aspLabel: '高階光通訊 ASP',
        mixLabel: '高階產品營收占比',
        mixStart: 18,
        mixBase: 30,
        mixUpside: 38,
        mixBear: 15,
        volumeGrowthBase: 20,
        volumeGrowthUpside: 32,
        volumeGrowthBear: 4,
        aspGrowthBase: 8,
        aspGrowthUpside: 15,
        aspGrowthBear: -2,
        grossMarginStart: 24,
        grossMarginBase: 31,
        grossMarginUpside: 36,
        grossMarginBear: 22,
        operatingMarginStart: 8,
        operatingMarginBase: 13,
        operatingMarginUpside: 17,
        operatingMarginBear: 6,
        benchmarkPeBase: 24,
        benchmarkPeUpside: 30,
        benchmarkPeBear: 18,
        defaultDrivers: [
          'CPO / 800G 滲透率上升，讓高毛利產品占比比一般光模組更快擴大',
          '國際大客戶訂單可見度是估值提升的關鍵驗證點',
          '市場通常用同業的高成長倍數去定價落後補漲股',
        ],
      };
    }
    return {
      key: 'generic_growth',
      driverLabel: '營收動能與產品組合改善',
      peerLabel: '可比成長股',
      benchmarkLabel: '以同產業 forward PE / PB 區間作為估值錨點',
      volumeLabel: '核心產品出貨',
      aspLabel: '產品 ASP',
      mixLabel: '高毛利產品占比',
      mixStart: 22,
      mixBase: 28,
      mixUpside: 33,
      mixBear: 19,
      volumeGrowthBase: 8,
      volumeGrowthUpside: 14,
      volumeGrowthBear: -3,
      aspGrowthBase: 4,
      aspGrowthUpside: 8,
      aspGrowthBear: -2,
      grossMarginStart: 18,
      grossMarginBase: 22,
      grossMarginUpside: 26,
      grossMarginBear: 16,
      operatingMarginStart: 5,
      operatingMarginBase: 8,
      operatingMarginUpside: 11,
      operatingMarginBear: 4,
      benchmarkPeBase: 15,
      benchmarkPeUpside: 19,
      benchmarkPeBear: 11,
      defaultDrivers: [
        '市場正在交易營收成長與產品組合改善能否延續',
        '若毛利率與營益率同步墊高，EPS 修復速度會比營收更快',
        '最後仍要看同產業估值倍數是否願意往上給',
      ],
    };
  };
  const driverLabelFromType = (driverType: 'story_tam' | 'broker_target' | 'financial_proxy' | 'fallback_proxy' | 'unknown') => {
    if (driverType === 'broker_target') return '券商目標價與市場預期';
    if (driverType === 'story_tam') return '故事驅動的營收與產品組合推估';
    if (driverType === 'financial_proxy') return '財務代理變數推估';
    return '保守代理估值';
  };
  const symbol = compactText(params.symbol || '').toUpperCase();
  const contextText = compactText([symbol, params.thesisTitle || '', params.thesisSummary || ''].filter(Boolean).join(' '));
  const profile = inferScenarioProfile(symbol, contextText);
  const currentPrice = params.currentPrice && params.currentPrice > 0 ? params.currentPrice : null;
  const brokerTargetPrice = params.brokerTargetPrice && params.brokerTargetPrice > 0 ? params.brokerTargetPrice : null;
  const hasRevenueSignal = Boolean((params.revenueRunRate && params.revenueRunRate > 0) || (params.monthlyRevenue && params.monthlyRevenue > 0));
  const hasFinancialSignal = Boolean((params.epsTtm && params.epsTtm > 0) || (params.peRatio && params.peRatio > 0));
  const valuationQuality =
    brokerTargetPrice != null ? 'broker_anchored' : hasRevenueSignal && hasFinancialSignal ? 'story_modeled' : hasFinancialSignal ? 'financial_proxy' : 'fallback_proxy';
  const scenarioDriverType =
    brokerTargetPrice != null
      ? 'broker_target'
      : hasRevenueSignal
        ? 'story_tam'
        : hasFinancialSignal
          ? 'financial_proxy'
          : 'fallback_proxy';
  const currentPeObserved = params.peRatio && params.peRatio > 0 ? clamp(params.peRatio, 6, 140) : brokerTargetPrice && currentPrice ? clamp(brokerTargetPrice / currentPrice, 6, 140) : null;
  const currentPbObserved = params.pbRatio && params.pbRatio > 0 ? clamp(params.pbRatio, 0.4, 20) : null;
  const basePe = clamp(currentPeObserved ?? profile.benchmarkPeBase, 8, 60);
  const growthYoy = clamp((params.yoyGrowth || 0) / 100, -0.45, 1.5);
  const growthMom = clamp((params.momGrowth || 0) / 100, -0.2, 0.35);
  const growthBlend = clamp(growthYoy * 0.7 + growthMom * 0.3, -0.4, 0.85);
  const brokerPremium = brokerTargetPrice && currentPrice ? clamp((brokerTargetPrice - currentPrice) / currentPrice, -0.2, 0.8) : 0;
  const evidenceLift = clamp(((params.evidenceCount || 0) - 1) * 0.012, 0, 0.08);
  const sourceLift = clamp(((params.sourceDocumentCount || 0) - 1) * 0.008, 0, 0.05);
  const brokerLift = clamp((params.brokerReportCount || 0) * 0.018, 0, 0.08);
  const scenarioIntensity = clamp(
    0.05 +
      Math.max(growthBlend, 0) * 0.22 +
      Math.max(brokerPremium, 0) * 0.35 +
      (hasRevenueSignal ? 0.05 : 0) +
      (hasFinancialSignal ? 0.03 : 0) +
      evidenceLift +
      sourceLift +
      brokerLift,
    0.05,
    0.42,
  );

  const baseRevenueRunRate =
    params.revenueRunRate && params.revenueRunRate > 0
      ? params.revenueRunRate
      : params.monthlyRevenue && params.monthlyRevenue > 0
        ? params.monthlyRevenue * 12
        : null;
  const revenueLiftFrom = (volumeGrowthPct: number, aspGrowthPct: number, mixFrom: number, mixTo: number) =>
    clamp(
      volumeGrowthPct / 100 * 0.58 +
        aspGrowthPct / 100 * 0.24 +
        Math.max(mixTo - mixFrom, 0) / 100 * 0.72 +
        Math.max(growthBlend, -0.1) * 0.12 +
        evidenceLift +
        sourceLift +
        brokerLift,
      -0.18,
      0.62,
    );
  const baseRevenueLift = revenueLiftFrom(profile.volumeGrowthBase, profile.aspGrowthBase, profile.mixStart, profile.mixBase);
  const upsideRevenueLift = revenueLiftFrom(profile.volumeGrowthUpside, profile.aspGrowthUpside, profile.mixStart, profile.mixUpside);
  const bearRevenueLift = clamp(
    revenueLiftFrom(profile.volumeGrowthBear, profile.aspGrowthBear, profile.mixStart, profile.mixBear) - scenarioIntensity * 0.18,
    -0.28,
    0.18,
  );
  const baseRevenueAnnual = baseRevenueRunRate ? baseRevenueRunRate * (1 + baseRevenueLift) : null;
  const upsideRevenueAnnual = baseRevenueRunRate ? baseRevenueRunRate * (1 + upsideRevenueLift) : null;
  const bearRevenueAnnual = baseRevenueRunRate ? baseRevenueRunRate * (1 + bearRevenueLift) : null;

  const impliedCurrentEps = currentPrice && basePe > 0 ? currentPrice / basePe : null;
  const epsAnchor = params.epsTtm && params.epsTtm > 0 ? params.epsTtm : impliedCurrentEps;
  const currentGrossMargin = params.grossMarginPct && params.grossMarginPct > 0 ? params.grossMarginPct : profile.grossMarginStart;
  const currentOperatingMargin = params.operatingMarginPct && params.operatingMarginPct > 0 ? params.operatingMarginPct : profile.operatingMarginStart;
  const baseGrossMargin = clamp(Math.max(currentGrossMargin, profile.grossMarginBase), 6, 65);
  const upsideGrossMargin = clamp(Math.max(baseGrossMargin, profile.grossMarginUpside), 6, 70);
  const bearGrossMargin = clamp(Math.min(Math.max(currentGrossMargin - 2, profile.grossMarginBear), baseGrossMargin - 0.5), 4, 60);
  const baseOperatingMargin = clamp(Math.max(currentOperatingMargin, profile.operatingMarginBase), 1, 35);
  const upsideOperatingMargin = clamp(Math.max(baseOperatingMargin, profile.operatingMarginUpside), 2, 40);
  const bearOperatingMargin = clamp(Math.min(Math.max(currentOperatingMargin - 1.5, profile.operatingMarginBear), baseOperatingMargin - 0.4), 0.5, 30);
  const epsGrowthFrom = (revenueLift: number, grossMarginTo: number, operatingMarginTo: number) => {
    const grossDelta = grossMarginTo - currentGrossMargin;
    const operatingDelta = operatingMarginTo - currentOperatingMargin;
    return clamp(1 + revenueLift * 0.52 + grossDelta * 0.11 + operatingDelta * 0.12, 0.45, 3.4);
  };
  const baseEps = epsAnchor ? epsAnchor * epsGrowthFrom(baseRevenueLift, baseGrossMargin, baseOperatingMargin) : null;
  const upsideEps = epsAnchor ? epsAnchor * epsGrowthFrom(upsideRevenueLift, upsideGrossMargin, upsideOperatingMargin) : null;
  const bearEps = epsAnchor ? epsAnchor * epsGrowthFrom(bearRevenueLift, bearGrossMargin, bearOperatingMargin) : null;

  const basePeScenario = clamp(
    brokerTargetPrice && currentPrice ? ((brokerTargetPrice / currentPrice) * 0.35 + profile.benchmarkPeBase * 0.65) : profile.benchmarkPeBase,
    8,
    60,
  );
  const upsidePeScenario = clamp(profile.benchmarkPeUpside + Math.max(scenarioIntensity * 8, 0), 9, 70);
  const bearPeScenario = clamp(Math.min(profile.benchmarkPeBear, basePeScenario - 2), 6, 40);

  const peBaseTarget = baseEps ? baseEps * basePeScenario : null;
  const baseTarget = brokerTargetPrice
    ? (peBaseTarget ? brokerTargetPrice * 0.72 + peBaseTarget * 0.28 : brokerTargetPrice)
    : peBaseTarget;
  let upsideTarget = upsideEps ? upsideEps * upsidePeScenario : (baseTarget ? baseTarget * (1 + scenarioIntensity) : null);
  let bearTarget = bearEps ? bearEps * bearPeScenario : (baseTarget ? baseTarget * (1 - clamp(scenarioIntensity * 0.85, 0.12, 0.32)) : null);
  if (baseTarget && upsideTarget && upsideTarget < baseTarget) {
    upsideTarget = baseTarget * (1 + clamp(scenarioIntensity, 0.08, 0.2));
  }
  if (baseTarget && bearTarget && bearTarget > baseTarget) {
    bearTarget = baseTarget * (1 - clamp(scenarioIntensity * 0.8, 0.1, 0.25));
  }

  const expectedReturn = (target: number | null) => (target && currentPrice ? roundTo(((target - currentPrice) / currentPrice) * 100, 2) : null);
  const driverLabel = profile.driverLabel || driverLabelFromType(scenarioDriverType);
  const buildOperatingAssumptions = (
    scenarioLabel: 'base' | 'upside' | 'bear',
    revenueAnnual: number | null,
    eps: number | null,
    pe: number | null,
    grossMargin: number | null,
    operatingMargin: number | null,
  ) => {
    const mixTo = scenarioLabel === 'upside' ? profile.mixUpside : scenarioLabel === 'bear' ? profile.mixBear : profile.mixBase;
    const volumeGrowth = scenarioLabel === 'upside' ? profile.volumeGrowthUpside : scenarioLabel === 'bear' ? profile.volumeGrowthBear : profile.volumeGrowthBase;
    const aspGrowth = scenarioLabel === 'upside' ? profile.aspGrowthUpside : scenarioLabel === 'bear' ? profile.aspGrowthBear : profile.aspGrowthBase;
    return [
      { label: '年化營收', value: formatScenarioMoney(revenueAnnual), isEstimated: true },
      { label: profile.volumeLabel, value: `+${roundTo(volumeGrowth, 1)}%`, isEstimated: true },
      { label: profile.aspLabel, value: `${aspGrowth >= 0 ? '+' : ''}${roundTo(aspGrowth, 1)}%`, isEstimated: true },
      { label: profile.mixLabel, value: `${roundTo(profile.mixStart, 1)}% -> ${roundTo(mixTo, 1)}%`, isEstimated: true },
      { label: '毛利率', value: formatPctPointRange(currentGrossMargin, grossMargin), isEstimated: true },
      { label: '營益率', value: formatPctPointRange(currentOperatingMargin, operatingMargin), isEstimated: true },
      { label: 'EPS', value: eps == null ? null : `${roundTo(eps, 2)}`, isEstimated: true },
      { label: '目標 PE', value: safeRatioText(pe), isEstimated: true },
    ].filter((item): item is { label: string; value: string; isEstimated: boolean } => Boolean(item.value));
  };
  const buildScenarioDetails = (
    scenarioLabel: 'base' | 'upside' | 'bear',
    revenueAnnual: number | null,
    eps: number | null,
    pe: number | null,
    targetPrice: number | null,
    grossMargin: number | null,
    operatingMargin: number | null,
  ) => {
    const priorRevenueAnnual = baseRevenueRunRate;
    const mixTo = scenarioLabel === 'upside' ? profile.mixUpside : scenarioLabel === 'bear' ? profile.mixBear : profile.mixBase;
    const volumeGrowth = scenarioLabel === 'upside' ? profile.volumeGrowthUpside : scenarioLabel === 'bear' ? profile.volumeGrowthBear : profile.volumeGrowthBase;
    const aspGrowth = scenarioLabel === 'upside' ? profile.aspGrowthUpside : scenarioLabel === 'bear' ? profile.aspGrowthBear : profile.aspGrowthBase;
    const caseLabel =
      scenarioLabel === 'base' ? '基本情境' : scenarioLabel === 'upside' ? '樂觀情境' : '悲觀 / 失效情境';
    const storyDrivers = unique([
      ...profile.defaultDrivers,
      brokerTargetPrice != null ? '市場已有外部目標價可供比對，因此估值不只看單一內部模型。' : null,
      hasRevenueSignal ? '最新營收訊號仍提供第一層驗證。' : null,
      hasFinancialSignal ? '獲利結構與估值倍數會一起決定最終股價彈性。' : null,
    ].filter((item): item is string => Boolean(item)));
    const operatingBridge = compactText(
      `${profile.volumeLabel}假設約 ${volumeGrowth >= 0 ? '+' : ''}${roundTo(volumeGrowth, 1)}%，${profile.aspLabel}${aspGrowth >= 0 ? '+' : ''}${roundTo(aspGrowth, 1)}%，${profile.mixLabel}由 ${roundTo(profile.mixStart, 1)}% 提升至 ${roundTo(mixTo, 1)}%。`,
    );
    const earningsBridge = compactText(
      [
        priorRevenueAnnual && revenueAnnual
          ? `對應年化營收由 ${formatScenarioMoney(priorRevenueAnnual)} 推到 ${formatScenarioMoney(revenueAnnual)}`
          : revenueAnnual
            ? `年化營收約 ${formatScenarioMoney(revenueAnnual)}`
            : null,
        grossMargin != null ? `毛利率由 ${roundTo(currentGrossMargin, 2)}% 提升至 ${roundTo(grossMargin, 2)}%` : null,
        operatingMargin != null ? `營益率由 ${roundTo(currentOperatingMargin, 2)}% 推到 ${roundTo(operatingMargin, 2)}%` : null,
        eps != null ? `推估 EPS 約 ${roundTo(eps, 2)}` : null,
      ]
        .filter(Boolean)
        .join('，'),
    );
    const multipleBridge = compactText(
      [
        `${caseLabel}對照 ${profile.peerLabel}，${profile.benchmarkLabel}`,
        currentPeObserved != null ? `目前市場 TTM PE 約 ${roundTo(currentPeObserved, 2)}x` : null,
        currentPbObserved != null ? `PB 約 ${roundTo(currentPbObserved, 2)}x` : null,
        pe != null ? `本輪以 ${roundTo(pe, 2)}x 作為目標估值倍數` : null,
      ]
        .filter(Boolean)
        .join('，'),
    ) || null;
    const financialBridge = [operatingBridge, earningsBridge].filter((item): item is string => Boolean(item));
    const priceBridge =
      targetPrice != null && eps != null && pe != null
        ? `${caseLabel}以 EPS ${roundTo(eps, 2)} × ${roundTo(pe, 2)}x，推得目標價約 NT$${roundTo(targetPrice, 2)}；${currentPrice ? `相對現價 ${percentText(expectedReturn(targetPrice))}` : '相對現價空間待補'}。`
        : null;
    const bridgeSummary = [operatingBridge, earningsBridge, multipleBridge, priceBridge].filter(Boolean).join(' ');
    return {
      driver: driverLabel,
      storyDrivers,
      operatingBridge,
      earningsBridge,
      operatingAssumptions: buildOperatingAssumptions(scenarioLabel, revenueAnnual, eps, pe, grossMargin, operatingMargin),
      financialBridge,
      multipleBridge,
      priceBridge,
      bridgeSummary,
      grossMarginPct: grossMargin == null ? null : roundTo(grossMargin, 2),
      operatingMarginPct: operatingMargin == null ? null : roundTo(operatingMargin, 2),
    };
  };

  return {
    base: {
      revenueAnnual: baseRevenueAnnual ? roundTo(baseRevenueAnnual, 0) : null,
      eps: baseEps ? roundTo(baseEps, 2) : null,
      pe: roundTo(basePeScenario, 2),
      targetPrice: baseTarget ? roundTo(baseTarget, 2) : null,
      expectedReturnPct: expectedReturn(baseTarget),
      ...buildScenarioDetails('base', baseRevenueAnnual, baseEps, basePeScenario, baseTarget, baseGrossMargin, baseOperatingMargin),
    },
    upside: {
      revenueAnnual: upsideRevenueAnnual ? roundTo(upsideRevenueAnnual, 0) : null,
      eps: upsideEps ? roundTo(upsideEps, 2) : null,
      pe: roundTo(upsidePeScenario, 2),
      targetPrice: upsideTarget ? roundTo(upsideTarget, 2) : null,
      expectedReturnPct: expectedReturn(upsideTarget),
      ...buildScenarioDetails('upside', upsideRevenueAnnual, upsideEps, upsidePeScenario, upsideTarget, upsideGrossMargin, upsideOperatingMargin),
    },
    bear: {
      revenueAnnual: bearRevenueAnnual ? roundTo(bearRevenueAnnual, 0) : null,
      eps: bearEps ? roundTo(bearEps, 2) : null,
      pe: roundTo(bearPeScenario, 2),
      targetPrice: bearTarget ? roundTo(bearTarget, 2) : null,
      expectedReturnPct: expectedReturn(bearTarget),
      ...buildScenarioDetails('bear', bearRevenueAnnual, bearEps, bearPeScenario, bearTarget, bearGrossMargin, bearOperatingMargin),
    },
    valuationQuality,
    scenarioDriverType,
    driverLabel,
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

type SourceSyncRunShape = {
  connector: string;
  recordsWritten: number;
  fetchedPosts?: number;
  entityId: string | null;
  watermarkBefore?: string | null;
  watermarkAfter?: string | null;
  duplicatesSkipped?: number;
  sessionRefreshed?: boolean;
  errorCode?: string | null;
  matchedDirectHits?: number;
  matchedIndustryHits?: number;
  searchedKeywords?: string[];
  matchedSymbols?: string[];
  authFailureReason?: string | null;
  degradedReason?: string | null;
  timedOut?: boolean;
  sessionMode?: 'persisted_session' | 'fresh_login' | 'cookie_fallback' | 'missing' | 'not_applicable';
  loginStage?: string | null;
  failureReason?: string | null;
  configWarning?: string | null;
  legacyDomainDetected?: boolean;
  legacyDomainMigrated?: boolean;
  validatedUrlFinal?: string | null;
  cookieDiagnostics?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type SourceSyncOptions = {
  connector?: string;
  dryRun?: boolean;
  symbol?: string;
};

type SourceDocMatchType = 'direct_symbol' | 'alias' | 'indirect' | 'none';
type SourceDocCrawlMode = 'symbol_scoped' | 'market_scan' | 'account_feed' | 'public_search' | 'author_watch' | 'channel_scan';
type SourceStoryAxis = 'stock' | 'industry' | 'kol';


type SymbolScopedStockContext = {
  symbol: string;
  market: 'TW';
  name: string;
  aliases: string[];
  sector: string | null;
  themeName: string | null;
  stockQueryTerms: string[];
  industryQueryTerms: string[];
  queryTerms: string[];
};

type SourceRawDocInput = {
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
};

async function getSourceWatermark(platform: string) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('source_raw_documents')
    .select('collected_at')
    .eq('platform', platform)
    .order('collected_at', { ascending: false })
    .limit(1);
  if (error) return null;
  const row = (data?.[0] as Row | undefined) || null;
  return row?.collected_at ? String(row.collected_at) : null;
}

function sha256Hex(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function truncateSourceContent(value: string) {
  const text = String(value || '');
  if (text.length <= SOURCE_RAW_CONTENT_MAX_CHARS) {
    return { contentText: text, originalChars: text.length, truncated: false };
  }
  return {
    contentText: text.slice(0, SOURCE_RAW_CONTENT_MAX_CHARS),
    originalChars: text.length,
    truncated: true,
  };
}

function sourceRawKey(item: Pick<SourceRawDocInput, 'platform' | 'documentUrl'>) {
  return `${item.platform}::${item.documentUrl}`;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getSymbolAliases(symbol: string, stockName?: string | null) {
  const aliases = new Set<string>();
  for (const [alias, company] of Object.entries(COMPANY_ALIAS_MAP)) {
    if (company.market === 'TW' && company.symbol === symbol) {
      aliases.add(alias);
      if (company.name) aliases.add(company.name);
    }
  }
  if (stockName) aliases.add(stockName);
  aliases.delete(symbol);
  return Array.from(aliases)
    .map((item) => compactText(item))
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
}

async function resolveSymbolScopedStockContext(symbol: string): Promise<SymbolScopedStockContext> {
  const normalizedSymbol = compactText(symbol).toUpperCase();
  if (!/^\d{4}$/.test(normalizedSymbol)) {
    throw new Error('symbol must be a 4-digit TW stock code');
  }
  const supabase = getSupabaseServerClient();
  const [{ data, error }, latestThemeRes] = await Promise.all([
    supabase
      .from('stocks')
      .select('symbol,name,market,sector')
      .eq('symbol', normalizedSymbol)
      .eq('market', 'TW')
      .limit(1)
      .maybeSingle(),
    supabase
      .from('theme_heat')
      .select('theme_name,related_symbols,as_of_date')
      .order('as_of_date', { ascending: false })
      .limit(200),
  ]);
  if (error || latestThemeRes.error) throw new Error(error?.message || latestThemeRes.error?.message || 'failed resolving symbol context');
  const stockName = compactText((data as Row | null)?.name || '') || getSymbolAliases(normalizedSymbol)[0] || normalizedSymbol;
  const sector = compactText((data as Row | null)?.sector || '') || null;
  const latestThemeMatch = ((latestThemeRes.data as Row[] | undefined) || []).find((row) => {
    const related = row?.related_symbols;
    if (Array.isArray(related)) {
      return related.map((item) => compactText(item).toUpperCase()).includes(normalizedSymbol);
    }
    const text = compactText(related);
    return text.includes(normalizedSymbol);
  }) || null;
  const themeName = compactText(latestThemeMatch?.theme_name || '') || null;
  const aliases = getSymbolAliases(normalizedSymbol, stockName);
  const stockQueryTerms = unique(
    [
      normalizedSymbol,
      `${normalizedSymbol} ${stockName}`,
      `${stockName} 台股`,
      stockName,
      ...aliases,
    ].map((item) => compactText(item)).filter(Boolean),
  );
  const industryQueryTerms = unique(
    [
      sector ? `${sector} 台股` : null,
      sector ? `${sector} 產業` : null,
      themeName,
      themeName ? `${themeName} 台股` : null,
      themeName ? `${themeName} 供應鏈` : null,
    ].map((item) => compactText(item)).filter(Boolean),
  );
  const queryTerms = unique([...stockQueryTerms, ...industryQueryTerms]);
  return {
    symbol: normalizedSymbol,
    market: 'TW',
    name: stockName,
    aliases,
    sector,
    themeName,
    stockQueryTerms,
    industryQueryTerms,
    queryTerms,
  };
}

function classifySymbolScopedMatch(params: {
  context: SymbolScopedStockContext;
  title?: unknown;
  summary?: unknown;
  contentText?: unknown;
  documentUrl?: unknown;
  symbols?: string[];
}) {
  const { context } = params;
  const title = compactText(params.title);
  const summary = compactText(params.summary);
  const contentText = compactText(params.contentText).slice(0, 4000);
  const text = `${title}\n${summary}\n${contentText}`;
  const lowerText = text.toLowerCase();
  const url = String(params.documentUrl || '');
  const upperUrl = url.toUpperCase();
  const taggedSymbols = (params.symbols || []).map((item) => String(item).toUpperCase());
  const symbolRegex = new RegExp(`(^|[^\\d])${context.symbol}([^\\d]|$)`);
  const yearRegex = new RegExp(`${context.symbol}\\s*年`);
  const hasDirectSymbol =
    taggedSymbols.includes(context.symbol) ||
    (symbolRegex.test(text) && !yearRegex.test(text)) ||
    upperUrl.includes(`/${context.symbol}`) ||
    upperUrl.includes(`=${context.symbol}`) ||
    upperUrl.includes(context.symbol);
  if (hasDirectSymbol) return 'direct_symbol' as const;
  const aliasMatched = [context.name, ...context.aliases]
    .map((item) => compactText(item))
    .filter(Boolean)
    .some((alias) => lowerText.includes(alias.toLowerCase()) || url.toLowerCase().includes(encodeURIComponent(alias.toLowerCase())));
  if (aliasMatched) return 'alias' as const;
  const queryMentioned = context.queryTerms.some((term) => lowerText.includes(term.toLowerCase()));
  return queryMentioned ? ('indirect' as const) : ('none' as const);
}

function buildSourceDocMetadata(params: {
  connector: string;
  context?: SymbolScopedStockContext | null;
  title?: unknown;
  summary?: unknown;
  contentText?: unknown;
  documentUrl?: unknown;
  symbols?: string[];
  metadata?: Record<string, unknown>;
}) {
  const baseMetadata = (params.metadata || {}) as Record<string, unknown>;
  const requestedCrawlMode = compactText(baseMetadata.crawl_mode) as SourceDocCrawlMode | '';
  if (!params.context) {
    return {
      ...baseMetadata,
      connector_name: params.connector,
      crawl_mode: requestedCrawlMode || ('market_scan' as SourceDocCrawlMode),
      query_symbol: null,
      query_terms: [],
      match_type: 'none' as SourceDocMatchType,
      story_axis: String(baseMetadata.story_axis || 'kol') as SourceStoryAxis,
    };
  }
  const matchType = classifySymbolScopedMatch({
    context: params.context,
    title: params.title,
    summary: params.summary,
    contentText: params.contentText,
    documentUrl: params.documentUrl,
    symbols: params.symbols,
  });
  return {
    ...baseMetadata,
    connector_name: params.connector,
    crawl_mode: requestedCrawlMode || ('symbol_scoped' as SourceDocCrawlMode),
    query_symbol: params.context.symbol,
    query_terms: params.context.queryTerms,
    match_type: matchType,
    story_axis: String(baseMetadata.story_axis || 'stock') as SourceStoryAxis,
  };
}

function extractMatchedTerms(text: string, terms: string[]) {
  const lower = text.toLowerCase();
  return terms.filter((term) => compactText(term) && lower.includes(compactText(term).toLowerCase()));
}

function resolveContextSymbols(params: {
  text: string;
  validSymbols?: Set<string>;
  stockNamesBySymbol?: Map<string, string>;
  aliasesBySymbol?: Map<string, string[]>;
  context?: SymbolScopedStockContext | null;
  matchedStockTerms?: string[];
  matchedIndustryTerms?: string[];
}) {
  const evidence = extractTwSymbolsWithEvidence(params.text, {
    validSymbols: params.validSymbols,
    stockNamesBySymbol: params.stockNamesBySymbol,
    aliasesBySymbol: params.aliasesBySymbol,
  });
  const extracted = new Set(evidence.symbols);
  if (!params.context) {
    const text = params.text || '';
    for (const [symbol, name] of params.stockNamesBySymbol || new Map<string, string>()) {
      const normalizedSymbol = compactText(symbol).toUpperCase();
      if (!normalizedSymbol || (params.validSymbols && !params.validSymbols.has(normalizedSymbol))) continue;
      const candidates = [name, ...((params.aliasesBySymbol?.get(normalizedSymbol) || []))]
        .map(compactText)
        .filter((item) => item.length >= 2 && !/^\d+$/.test(item));
      if (candidates.some((candidate) => text.includes(candidate))) extracted.add(normalizedSymbol);
    }
    return unique([...extracted]);
  }
  const extractedList = [...extracted];
  if (extracted.has(params.context.symbol)) return unique(extractedList);
  if ((params.matchedStockTerms || []).length > 0 || (params.matchedIndustryTerms || []).length > 0) {
    return unique([params.context.symbol, ...extractedList]);
  }
  return unique(extractedList);
}

function computeDirectHitStrength(params: {
  context?: SymbolScopedStockContext | null;
  title?: unknown;
  summary?: unknown;
  contentText?: unknown;
  documentUrl?: unknown;
  symbols?: string[];
  storyAxis?: SourceStoryAxis;
  matchedStockTerms?: string[];
  matchedIndustryTerms?: string[];
}) {
  if (!params.context) return 0.5;
  const matchType = classifySymbolScopedMatch({
    context: params.context,
    title: params.title,
    summary: params.summary,
    contentText: params.contentText,
    documentUrl: params.documentUrl,
    symbols: params.symbols,
  });
  if (matchType === 'direct_symbol') return 1;
  if (matchType === 'alias') return 0.84;
  if (params.storyAxis === 'industry' && (params.matchedIndustryTerms || []).length > 0) return 0.56;
  if ((params.matchedStockTerms || []).length > 0) return 0.66;
  return 0.28;
}

function shouldRetainSymbolScopedDoc(metadata: Record<string, unknown>, context?: SymbolScopedStockContext | null) {
  if (!context) return true;
  const matchType = String(metadata.match_type || 'none') as SourceDocMatchType;
  const storyAxis = String(metadata.story_axis || 'stock') as SourceStoryAxis;
  const queryMode = String(metadata.query_mode || '');
  if (matchType === 'direct_symbol' || matchType === 'alias') return true;
  if (storyAxis === 'industry' && matchType === 'indirect' && (queryMode === 'industry_search' || queryMode === 'industry_card')) return true;
  return false;
}

function filterSymbolScopedDocs(
  docs: SourceRawDocInput[],
  connector: string,
  context?: SymbolScopedStockContext | null,
) {
  return docs
    .map((doc) => {
      const metadata = buildSourceDocMetadata({
        connector,
        context,
        title: doc.title,
        summary: doc.summary,
        contentText: doc.contentText,
        documentUrl: doc.documentUrl,
        symbols: doc.symbols,
        metadata: doc.metadata,
      });
      if (!shouldRetainSymbolScopedDoc(metadata, context)) return null;
      return {
        ...doc,
        symbols: context ? unique([context.symbol, ...((doc.symbols || []).map((item) => String(item).toUpperCase()))]) : doc.symbols,
        metadata,
      };
    })
    .filter(Boolean) as SourceRawDocInput[];
}

async function startConnectorRun(connectorName: string, platform: string, metadata?: Record<string, unknown>) {
  const supabase = getSupabaseServerClient();
  // Auto-close stale running rows so a previous interrupted local run does not pollute status.
  const staleThresholdIso = new Date(Date.now() - 30 * 60 * 1000).toISOString();
  await supabase
    .from('connector_runs')
    .update({
      status: 'failed',
      error_summary: 'stale_running_auto_closed',
      finished_at: nowIso(),
      metadata: { auto_closed: true, reason: 'stale_running' },
    })
    .eq('platform', platform)
    .eq('status', 'running')
    .lt('started_at', staleThresholdIso);
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

async function markLatestRunningConnectorFailed(platform: string, errorMessage: string) {
  await finishLatestRunningConnector(platform, 'failed', 0, errorMessage);
}

async function finishLatestRunningConnector(
  platform: string,
  status: 'success' | 'failed' | 'partial' | 'skipped',
  recordsWritten: number,
  errorMessage?: string,
) {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('connector_runs')
    .select('id')
    .eq('platform', platform)
    .eq('status', 'running')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) return;
  const runId = String((data?.[0] as Row | undefined)?.id || '');
  if (!runId) return;
  await finishConnectorRun(runId, status, recordsWritten, {
    error_summary: errorMessage ? errorMessage.slice(0, 500) : null,
  });
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
  // DB has unique constraint on (platform, watch_value), so dedupe defaults first.
  const deduped = new Map<string, Row>();
  for (const item of DEFAULT_WATCHLISTS) {
    const key = `${item.platform}::${item.watch_value}`;
    deduped.set(key, {
      platform: item.platform,
      watch_type: item.watch_type,
      watch_value: item.watch_value,
      enabled: true,
      priority: 50,
      metadata: { seeded_by: 'research-v2' },
      updated_at: nowIso(),
    });
  }
  const rows = Array.from(deduped.values());
  const { error } = await supabase.from('source_watchlists').upsert(rows, { onConflict: 'platform,watch_value' });
  if (error) throw new Error(error.message);
}

async function ensureDefaultKolProfiles() {
  for (const seed of KOL_SEEDS) {
    const sourceEntity = await upsertSourceEntity({
      platform: seed.primaryPlatform,
      entityType: 'kol',
      displayName: seed.displayName,
      sourceKey: `kol.${sourceKeySegment(seed.displayName)}.${seed.primaryPlatform}`,
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

async function upsertSourceRawDocuments(items: SourceRawDocInput[]) {
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
      filteredItems.map((item) => [sourceRawKey(item), item] as const),
    ).values(),
  );
  const supabase = getSupabaseServerClient();

  const existingKeys = new Set<string>();
  const urlsByPlatform = new Map<string, string[]>();
  for (const item of dedupedItems) {
    if (!item.documentUrl) continue;
    urlsByPlatform.set(item.platform, [...(urlsByPlatform.get(item.platform) || []), item.documentUrl]);
  }
  for (const [platform, urls] of urlsByPlatform) {
    for (const urlChunk of chunkArray(Array.from(new Set(urls)), 80)) {
      const { data, error } = await supabase
        .from('source_raw_documents')
        .select('platform,document_url')
        .eq('platform', platform)
        .in('document_url', urlChunk);
      if (error) throw new Error(error.message);
      for (const row of (data as Row[]) || []) {
        existingKeys.add(`${String(row.platform || platform)}::${String(row.document_url || '')}`);
      }
    }
  }

  const newItems = dedupedItems.filter((item) => !existingKeys.has(sourceRawKey(item)));
  if (newItems.length === 0) return 0;

  const { error } = await supabase.from('source_raw_documents').upsert(
    newItems.map((item) => {
      const compacted = truncateSourceContent(item.contentText);
      const contentHash = sha256Hex(item.contentText || `${item.title}\n${item.summary}\n${item.documentUrl}`);
      return {
      source_entity_id: item.sourceEntityId,
      platform: item.platform,
      document_url: item.documentUrl,
      title: item.title,
      summary: item.summary,
      content_text: compacted.contentText,
      published_at: item.publishedAt || null,
      symbols: item.symbols || [],
      sentiment_label: item.sentimentLabel || null,
      confidence: item.confidence ?? null,
      metadata: {
        crawl_mode: 'market_scan',
        query_symbol: null,
        query_terms: [],
        match_type: 'none',
        ...(item.metadata || {}),
        lookback_hours: lookbackHours,
        content_hash: contentHash,
        content_chars: compacted.originalChars,
        content_truncated: compacted.truncated,
        content_max_chars: SOURCE_RAW_CONTENT_MAX_CHARS,
      },
    };
    }),
    { onConflict: 'platform,document_url', ignoreDuplicates: true },
  );
  if (error) throw new Error(error.message);

  const mentionedSymbols = unique(newItems.flatMap((item) => item.symbols || []).filter((symbol) => /^\d{4}$/u.test(symbol)));
  if (mentionedSymbols.length > 0) {
    const { data: stocks, error: stocksError } = await supabase
      .from('stocks')
      .select('id,symbol')
      .in('symbol', mentionedSymbols);
    if (stocksError) throw new Error(stocksError.message);
    const stockIdBySymbol = new Map(((stocks as Row[]) || []).map((row) => [compactText(row.symbol), compactText(row.id)]));
    const availableAt = nowIso();
    const mentionRows = newItems.flatMap((item) => (item.symbols || []).flatMap((symbol) => {
      const stockId = stockIdBySymbol.get(symbol);
      if (!stockId || !item.documentUrl) return [];
      const stance = item.sentimentLabel === 'bullish'
        ? 'positive'
        : item.sentimentLabel === 'bearish'
          ? 'negative'
          : item.sentimentLabel === 'mixed'
            ? 'mixed'
            : 'neutral';
      return [{
        stock_id: stockId,
        source_document_id: null,
        platform: item.platform,
        source_name: compactText(item.metadata?.source_name || item.platform),
        author_name: compactText(item.metadata?.author_name) || null,
        source_url: item.documentUrl,
        stance,
        independent_content_hash: sha256Hex(compactText(`${item.title}\n${item.summary}`).toLowerCase()),
        mentioned_at: item.publishedAt || availableAt,
        as_of: item.publishedAt || availableAt,
        available_at: availableAt,
        confidence: Math.max(0, Math.min(100, Number(item.confidence ?? 0.5) * 100)),
        provenance: { retention_mode: item.metadata?.retention_mode || 'source_document', source_entity_id: item.sourceEntityId },
        ruleset_version: 'source-ranking-v2.0.0',
      }];
    }));
    if (mentionRows.length > 0) {
      const { error: mentionError } = await supabase
        .from('candidate_source_mentions')
        .upsert(mentionRows, { onConflict: 'stock_id,platform,source_url' });
      if (mentionError) throw new Error(mentionError.message);
    }
  }
  return newItems.length;
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

async function storeParsedBrokerReportDocument(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  parsed: ReturnType<typeof parseBrokerReportText>,
  fileName: string,
  filePath: string,
  sourceMode: 'manual_pdf' | 'imported_pdf' = 'manual_pdf',
) {
  const stock = parsed.stock ? await ensureStock(parsed.stock.symbol, parsed.stock.market, parsed.stock.name) : null;
  const brokerEntity = await upsertSourceEntity({
    platform: 'broker_report',
    entityType: 'broker',
    displayName: parsed.brokerName,
    sourceKey: `broker.${slugify(parsed.brokerName)}`,
    metadata: { source_mode: sourceMode },
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
        source_mode: sourceMode,
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
  let sectionsWritten = 0;
  if (parsed.sections.length > 0) {
    const { error: sectionError } = await supabase.from('broker_report_sections').insert(
      parsed.sections.map((section, index) => ({
        broker_report_document_id: data.id,
        section_kind: section.sectionKind,
        section_title: section.sectionTitle,
        section_content: section.sectionContent,
        sort_order: index + 1,
      })),
    );
    if (sectionError) throw new Error(sectionError.message);
    sectionsWritten = parsed.sections.length;
  }
  return { docId: String(data.id), sectionsWritten };
}

async function listBrokerReportImportFiles() {
  const dirs = [BROKER_REPORT_IMPORT_DIR];
  const files: Array<{ fileName: string; filePath: string }> = [];
  for (const dir of dirs) {
    try {
      const entries = await fs.readdir(dir);
      for (const fileName of entries) {
        if (!/\.(pdf|csv)$/i.test(fileName)) continue;
        files.push({ fileName, filePath: path.join(dir, fileName) });
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  return files;
}

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
      continue;
    }
    if (ch === '"') {
      quoted = !quoted;
      continue;
    }
    if (ch === ',' && !quoted) {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function normalizeCsvHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

function rowsFromBrokerCsv(content: string) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map(normalizeCsvHeader);
  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    return headers.reduce<Record<string, string>>((acc, header, index) => {
      acc[header] = cells[index] || '';
      return acc;
    }, {});
  });
}

async function ingestManualBrokerImports(supabase: ReturnType<typeof getSupabaseServerClient>) {
  const files = await listBrokerReportImportFiles();
  let reportsIngested = 0;
  let sectionsWritten = 0;
  for (const file of files) {
    if (file.fileName.toLowerCase().endsWith('.pdf')) {
      const parsed = await readPdfReport(file.filePath, file.fileName);
      const stored = await storeParsedBrokerReportDocument(supabase, parsed, file.fileName, file.filePath, 'imported_pdf');
      reportsIngested += 1;
      sectionsWritten += stored.sectionsWritten;
      continue;
    }
    const content = await fs.readFile(file.filePath, 'utf8');
    const rows = rowsFromBrokerCsv(content);
    for (const row of rows) {
      const symbol = compactText(row.symbol || row.code || row.stock || row['股票代號']);
      if (!/^\d{4}$/.test(symbol)) continue;
      const stock = await ensureStock(symbol, 'TW', compactText(row.name || row.stock_name || row['股票名稱']) || symbol);
      const brokerName = compactText(row.broker_name || row.broker || row.source || row['券商'] || '手動匯入券商');
      const reportDate = compactText(row.report_date || row.date || row.as_of || row['日期']) || asDate();
      const rating = compactText(row.rating || row.recommendation || row['評等']) || null;
      const targetPrice = positiveNumberOrNull(row.target_price || row.target || row['目標價']);
      const sourceUrl = compactText(row.source_url || row.url || row['來源連結']) || null;
      const summary = compactText(row.summary || row.thesis || row.note || row['摘要']) || `${brokerName} 對 ${symbol} 的手動匯入券商觀點。`;
      const filePath = `manual_csv/${file.fileName}/${symbol}/${slugify(brokerName)}/${reportDate}`;
      const { data, error } = await supabase
        .from('broker_report_documents')
        .upsert(
          {
            stock_id: stock.id,
            broker_name: brokerName,
            report_date: reportDate,
            file_name: file.fileName,
            file_path: filePath,
            source_mode: 'manual_csv',
            rating,
            target_price: targetPrice,
            thesis_title: compactText(row.thesis_title || row.title || row['標題']) || `${brokerName} 評等${rating ? `：${rating}` : ''}${targetPrice ? `，目標價 ${targetPrice}` : ''}`,
            extracted_summary: summary.slice(0, 2000),
            raw_text: JSON.stringify(row),
            metadata: { source: 'manual_csv', source_url: sourceUrl, imported_from: file.filePath },
            updated_at: nowIso(),
          },
          { onConflict: 'file_path' },
        )
        .select('id')
        .single();
      if (error || !data) throw new Error(error?.message || `failed storing broker CSV row ${file.fileName}`);
      await supabase.from('broker_report_sections').upsert(
        {
          broker_report_document_id: data.id,
          section_kind: 'investment_view',
          section_title: '手動匯入摘要',
          section_content: summary,
          sort_order: 1,
        },
        { onConflict: 'broker_report_document_id,sort_order' },
      );
      reportsIngested += 1;
      sectionsWritten += 1;
    }
  }
  return { reportsIngested, sectionsWritten };
}

async function rebuildBrokerConsensusSnapshots(supabase: ReturnType<typeof getSupabaseServerClient>, asOfDate: string) {
  const { data } = await supabase.from('broker_report_documents').select('*').in('source_mode', [...AUTHORIZED_BROKER_SOURCE_MODES]).order('report_date', { ascending: false }).limit(2000);
  const rows = ((data as Row[]) || []).filter((row) => row.stock_id);
  const byStock = new Map<string, Row[]>();
  for (const row of rows) {
    const stockId = String(row.stock_id || '');
    if (!stockId) continue;
    const reportDate = row.report_date ? new Date(`${String(row.report_date)}T00:00:00+08:00`).getTime() : Date.now();
    if (Number.isFinite(reportDate) && Date.now() - reportDate > 180 * 24 * 60 * 60 * 1000) continue;
    byStock.set(stockId, [...(byStock.get(stockId) || []), row]);
  }
  let snapshotsWritten = 0;
  for (const [stockId, docs] of byStock.entries()) {
    const targets = docs.map((row) => positiveNumberOrNull(row.target_price)).filter((value): value is number => value != null);
    const forwardEpsValues = docs
      .map((row) => positiveNumberOrNull((row.metadata as Row | undefined)?.forward_eps))
      .filter((value): value is number => value != null);
    const ratingDistribution = docs.reduce<Record<string, number>>((acc, row) => {
      const key = compactText(row.rating || '未提供評等') || '未提供評等';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
    const usBrokerCount = docs.filter((row) => String((row.metadata as Row | undefined)?.broker_region || '').toLowerCase() === 'us' || /美系|高盛|摩根|美林|花旗|Goldman|Morgan|JPMorgan|Citi|Jefferies/i.test(String(row.broker_name || ''))).length;
    const factsetCount = docs.filter((row) => /factset/i.test(String((row.metadata as Row | undefined)?.consensus_provider || row.broker_name || ''))).length;
    const summary =
      targets.length > 0
        ? `近 180 日公開券商/外資來源 ${docs.length} 筆，目標價中位數 ${medianNumber(targets)}，美系券商 ${usBrokerCount} 筆，FactSet/共識 ${factsetCount} 筆。`
        : `近 180 日公開券商/外資來源 ${docs.length} 筆，但未取得可用目標價。`;
    const { error } = await supabase.from('broker_consensus_snapshots').upsert(
      {
        stock_id: stockId,
        as_of_date: asOfDate,
        source_count: docs.length,
        us_broker_count: usBrokerCount,
        factset_count: factsetCount,
        min_target_price: targets.length ? Math.min(...targets) : null,
        median_target_price: medianNumber(targets),
        max_target_price: targets.length ? Math.max(...targets) : null,
        forward_eps: medianNumber(forwardEpsValues),
        forward_year: docs.map((row) => compactText((row.metadata as Row | undefined)?.forward_year)).find(Boolean) || null,
        rating_distribution: ratingDistribution,
        source_document_ids: docs.map((row) => row.id).filter(Boolean),
        freshness_status: docs.length > 0 ? 'fresh' : 'missing',
        summary,
        metadata: { rebuilt_at: nowIso() },
        updated_at: nowIso(),
      },
      { onConflict: 'stock_id,as_of_date' },
    );
    if (!error) snapshotsWritten += 1;
  }
  return snapshotsWritten;
}

function stripHtmlForBrokerText(html: string) {
  return compactText(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/<[^>]+>/g, ' '),
  );
}

function parseCnyesForeignRatingRows(html: string, symbol: string, today: string) {
  const text = stripHtmlForBrokerText(html);
  const rows: Array<{
    brokerName: string;
    rating: string | null;
    targetPrice: number | null;
    summary: string;
    reportDate: string;
    forwardEps?: number | null;
    forwardYear?: string | null;
    isUsBroker?: boolean;
    isConsensus?: boolean;
  }> = [];
  const brokerPattern =
    /(Factset|美系券商|外資|高盛|摩根士丹利|摩根大通|美林|瑞銀|花旗|里昂|麥格理|野村|大和|匯豐|巴克萊|德意志|Jefferies|Goldman|Morgan Stanley|JPMorgan|UBS|Citi|CLSA|Macquarie)[\s\S]{0,160}?(買進|加碼|增持|優於大盤|超越市場表現|中立|持有|劣於大盤|減碼|賣出|Buy|Overweight|Outperform|Neutral|Hold|Underweight|Sell)?[\s\S]{0,160}?(?:目標價|target price|TP)?\s*(\d{2,5}(?:\.\d{1,2})?)/gi;
  for (const match of text.matchAll(brokerPattern)) {
    const brokerName = compactText(match[1]);
    const ratingRaw = compactText(match[2] || '');
    const targetPrice = positiveNumberOrNull(match[3]);
    if (!brokerName || !targetPrice) continue;
    const rating =
      /買進|加碼|增持|優於|buy|overweight/i.test(ratingRaw)
        ? '買進'
        : /賣出|減碼|劣於|sell|underweight/i.test(ratingRaw)
          ? '賣出'
          : ratingRaw
            ? '持有'
            : null;
    const summary = `${brokerName} 於鉅亨外資評等公開頁提及 ${symbol}${rating ? ` ${rating}` : ''}，目標價 ${targetPrice} 元。`;
    rows.push({
      brokerName,
      rating,
      targetPrice,
      summary,
      reportDate: today,
      isUsBroker: /美系|高盛|摩根|美林|花旗|Goldman|Morgan|JPMorgan|Citi|Jefferies/i.test(brokerName),
      isConsensus: /factset/i.test(brokerName),
    });
  }

  const compact = text.replace(/\s+/g, ' ');
  const rowPattern =
    /(\d{8})\s+(Factset|美系券商|歐系券商|亞系券商|澳系券商|高盛|摩根士丹利|摩根大通|美林|瑞銀|花旗|里昂|麥格理|野村|大和|匯豐|巴克萊|德意志)[^\d]{0,80}?(?:(買進|加碼|增持|優於大盤|超越市場表現|中立|持有|劣於大盤|減碼|賣出|Buy|Overweight|Outperform|Neutral|Hold|Underweight|Sell)[^\d]{0,80})?(?:(\d+(?:\.\d+)?)\s*\((20\d{2})\))?[^\d]{0,60}?(\d{2,5}(?:\.\d{1,2})?)\s+\d{2,5}(?:,\d{3})?(?:\.\d+)?/gi;
  for (const match of compact.matchAll(rowPattern)) {
    const reportDateRaw = compactText(match[1]);
    const brokerName = compactText(match[2]);
    const ratingRaw = compactText(match[3] || '');
    const forwardEps = positiveNumberOrNull(match[4]);
    const forwardYear = compactText(match[5] || '');
    const targetPrice = positiveNumberOrNull(match[6]);
    if (!brokerName || !targetPrice) continue;
    const rating =
      /買進|加碼|增持|優於|超越|buy|overweight|outperform/i.test(ratingRaw)
        ? '買進'
        : /賣出|減碼|劣於|sell|underweight/i.test(ratingRaw)
          ? '賣出'
          : ratingRaw
            ? '持有'
            : null;
    const reportDate = reportDateRaw.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3');
    const summary = `${brokerName} 於鉅亨外資評等公開頁 ${reportDate} 提及 ${symbol}${rating ? ` ${rating}` : ''}，${
      forwardEps ? `${forwardYear || 'forward'} EPS ${forwardEps}，` : ''
    }目標價 ${targetPrice} 元。`;
    rows.push({
      brokerName,
      rating,
      targetPrice,
      summary,
      reportDate,
      forwardEps,
      forwardYear: forwardYear || null,
      isUsBroker: /美系|高盛|摩根|美林|花旗|Goldman|Morgan|JPMorgan|Citi|Jefferies/i.test(brokerName),
      isConsensus: /factset/i.test(brokerName),
    });
  }
  return Array.from(new Map(rows.map((row) => [`${row.brokerName}-${row.targetPrice}-${row.reportDate}`, row] as const)).values()).slice(0, 12);
}

function parseFactsetConsensusFromText(text: string) {
  const compact = compactText(text);
  const epsMatch = compact.match(/EPS預估(?:上修|下修)?至\s*([0-9]+(?:\.[0-9]+)?)\s*元/i);
  const targetMatch = compact.match(/預估目標價為\s*([0-9]+(?:\.[0-9]+)?)\s*元/i) || compact.match(/目標價\s*([0-9]+(?:\.[0-9]+)?)\s*元/i);
  const analystMatch = compact.match(/共\s*(\d+)\s*位分析師/);
  const yearMatch = compact.match(/做出\s*(20\d{2})\s*年EPS預估/);
  return {
    forwardEps: positiveNumberOrNull(epsMatch?.[1]),
    targetPrice: positiveNumberOrNull(targetMatch?.[1]),
    analystCount: analystMatch ? Number(analystMatch[1]) : null,
    forwardYear: yearMatch?.[1] || null,
  };
}

function detectCrossThemeKeys(text: string) {
  const normalized = compactText(text);
  const themes: Array<{ key: string; label: string; evidenceLevel: 'direct_source' | 'inferred_watch'; reason: string }> = [];
  const add = (key: string, label: string, pattern: RegExp, evidenceLevel: 'direct_source' | 'inferred_watch' = 'direct_source') => {
    if (!pattern.test(normalized)) return;
    themes.push({ key, label, evidenceLevel, reason: `來源文字命中 ${label} 題材關鍵字。` });
  };
  add('optical-communication-watch', '光通訊 / CPO', /光通訊|光模組|cpo|800g|1\.6t|矽光|光互連/i);
  add('optical-lens', '高階光學鏡頭', /大立光|鏡頭|光學|潛望|lens|periscope|xr/i, 'inferred_watch');
  add('passive-components-mlcc', '被動元件 / MLCC', /mlcc|被動元件|電感|tlvr|鉭電容|晶片電阻|漲價/i);
  add('cpu-ai-pc', 'CPU / AI PC', /cpu|ai pc|nb|筆電|pc/i);
  add('mature-node-recovery', '成熟製程復甦', /成熟製程|28nm|40nm|driver ic|mcu|pmic/i);
  add('consumer-electronics-rebound', '消費性電子復甦', /消費性電子|手機|nb|電視|穿戴/i);
  return themes;
}

async function scrapePttStock(symbolContext?: SymbolScopedStockContext | null) {
  const supabase = getSupabaseServerClient();
  const baseUrl = 'https://www.ptt.cc/bbs/Stock/index.html';
  const headers = { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', cookie: 'over18=1' };

  const allMatches: Array<{ href: string; title: string }> = [];
  const [{ data: stocksData, error: stocksError }] = await Promise.all([
    supabase.from('stocks').select('id,symbol,name').eq('market', 'TW'),
  ]);
  if (stocksError) throw new Error(stocksError.message);
  const stocksRows = ((stocksData as Row[]) || []).filter((row) => /^\d{4}$/.test(compactText(row.symbol)));
  const validSymbols = new Set(stocksRows.map((row) => compactText(row.symbol).toUpperCase()));
  const stockBySymbol = new Map(stocksRows.map((row) => [compactText(row.symbol).toUpperCase(), row] as const));
  const stockNamesBySymbol = new Map(stocksRows.map((row) => [compactText(row.symbol).toUpperCase(), compactText(row.name)] as const));
  const aliasesBySymbol = new Map(stocksRows.map((row) => {
    const symbol = compactText(row.symbol).toUpperCase();
    return [symbol, getSymbolAliases(symbol, compactText(row.name))] as const;
  }));

  const searchTerms = symbolContext
    ? symbolContext.queryTerms.slice(0, 8)
    : [
        '標的',
        '情報',
        '請益',
        '心得',
        '美系外資',
        '目標價',
        'EPS',
        '被動元件',
        'MLCC',
        '大立光',
        '記憶體',
      ];
  const targetPages = [
    baseUrl,
    ...searchTerms.map((term) => `https://www.ptt.cc/bbs/Stock/search?page=1&q=${encodeURIComponent(term)}`),
  ];
  let failedPageFetches = 0;
  const pageFetchFailures = new Set<string>();
  for (const targetPage of targetPages) {
    let currentUrl = targetPage;
    for (let page = 0; page < (symbolContext ? 1 : targetPage === baseUrl ? 4 : 2); page++) {
      try {
        const { text: html } = await fetchTextWithRetry({
          url: currentUrl,
          headers,
          timeoutMs: 8_000,
        });
        const titleMatches = Array.from(html.matchAll(/class="title">\s*<a href="([^"]+)">([^<]+)<\/a>/g));
        for (const m of titleMatches) {
          allMatches.push({ href: m[1], title: m[2] });
        }
        const prevMatch = html.match(/href="([^"]+)"[^>]*>‹ 上頁/);
        if (!prevMatch || symbolContext) break;
        currentUrl = `https://www.ptt.cc${prevMatch[1]}`;
      } catch (error) {
        failedPageFetches += 1;
        pageFetchFailures.add(sourceFetchFailureCode(error));
        break;
      }
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
  const docs: SourceRawDocInput[] = [];
  const pttSignalRows: Array<Record<string, unknown>> = [];
  let articlesFetched = 0;
  let articleFetchFailures = 0;
  const articleFetchFailureReasons = new Set<string>();
  let pushCommentsParsed = 0;
  const matchedSymbols = new Set<string>();

  const postTypeFromTitle = (title: string) => {
    const tag = title.match(/\[(標的|情報|請益|心得|新聞|閒聊|其他|公告)\]/);
    return tag?.[1] || (/標的/.test(title) ? '標的' : /情報/.test(title) ? '情報' : /請益/.test(title) ? '請益' : /心得/.test(title) ? '心得' : /新聞/.test(title) ? '新聞' : '討論');
  };
  const stripHtml = (html: string) => compactText(html.replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' '));
  const parsePushComments = (html: string) => {
    const comments: Array<{ tag: string; text: string }> = [];
    for (const match of html.matchAll(/<div class="push">([\s\S]*?)<\/div>/g)) {
      const block = match[1] || '';
      const tag = compactText(block.match(/<span[^>]*class="[^"]*\bpush-tag\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] || '');
      const text = compactText(block.match(/<span[^>]*class="[^"]*\bpush-content\b[^"]*"[^>]*>([\s\S]*?)<\/span>/)?.[1] || '').replace(/^:\s*/, '');
      if (tag || text) comments.push({ tag, text });
    }
    return comments;
  };
  const commentSentimentFrom = (comments: Array<{ tag: string; text: string }>) => {
    const text = comments.map((item) => item.text).join(' ');
    const bullish = (text.match(/噴|漲|利多|看好|突破|買|上修|目標價|轉強/g) || []).length;
    const bearish = (text.match(/跌|崩|利空|看壞|出貨|套|停損|轉弱|下修/g) || []).length;
    if (bullish > bearish + 1) return 'bullish';
    if (bearish > bullish + 1) return 'bearish';
    return 'neutral';
  };

  const seenArticles = new Set<string>();
  for (const match of allMatches.slice(0, symbolContext ? 60 : 140)) {
    const title = compactText(match.title);
    if (!match.href || seenArticles.has(match.href)) continue;
    seenArticles.add(match.href);
    const articleUrl = `https://www.ptt.cc${match.href}`;
    let contentText = title;
    let comments: Array<{ tag: string; text: string }> = [];

    try {
      const { text: bodyHtml } = await fetchTextWithRetry({
        url: articleUrl,
        headers,
        timeoutMs: 7_000,
      });
      articlesFetched += 1;
      comments = parsePushComments(bodyHtml);
      pushCommentsParsed += comments.length;
      const mainBlock = bodyHtml.match(/<div id="main-content">([\s\S]*?)<\/div>\s*<div id="article-polling"/)?.[1] ||
        bodyHtml.match(/<div id="main-content">([\s\S]*?)<\/div>/)?.[1] ||
        bodyHtml;
      const bodyWithoutPushes = mainBlock.replace(/<div class="push">[\s\S]*?<\/div>/g, ' ');
      const bodyText = stripHtml(bodyWithoutPushes).slice(0, 5000);
      const commentText = comments.map((item) => `${item.tag} ${item.text}`).join('\n').slice(0, 3000);
      contentText = compactText([bodyText, commentText].filter(Boolean).join('\n\n推噓留言：\n')) || title;
    } catch (error) {
      articleFetchFailures += 1;
      articleFetchFailureReasons.add(sourceFetchFailureCode(error));
      // Use title only on fetch failure.
    }

    const extracted = extractTwSymbolsWithEvidence(`${title}\n${contentText}`, { validSymbols, stockNamesBySymbol, aliasesBySymbol });
    const symbols = extracted.symbols;
    for (const symbol of symbols) matchedSymbols.add(symbol);
    const pushCount = comments.filter((item) => item.tag.includes('推')).length;
    const booCount = comments.filter((item) => item.tag.includes('噓')).length;
    const neutralCount = comments.filter((item) => item.tag.includes('→')).length;
    const pushScore = pushCount - booCount;
    const ratioDenominator = pushCount + booCount;
    const pushBullBearRatio = ratioDenominator > 0 ? roundTo(pushCount / ratioDenominator, 4) : null;
    const commentSentiment = commentSentimentFrom(comments);
    const titleSentiment = /多|漲|噴|飆|利多|看好|上修|調升/.test(title)
      ? 'bullish'
      : /空|跌|崩|利空|看壞|下修|調降/.test(title)
        ? 'bearish'
        : 'neutral';
    const sentimentLabel = commentSentiment !== 'neutral' ? commentSentiment : titleSentiment;
    const postType = postTypeFromTitle(title);

    docs.push({
      sourceEntityId: String(entity.id),
      platform: 'ptt',
      documentUrl: articleUrl,
      title,
      summary: title,
      // Use full text only transiently for symbol/sentiment extraction.  The
      // retained record is metadata + title + original URL, not a copied post.
      contentText: title,
      symbols,
      sentimentLabel,
      confidence: symbols.length > 0 ? Math.min(0.82, 0.58 + Math.min(0.18, Math.abs(pushScore) / 80)) : 0.42,
      metadata: {
        connector: 'http',
        source_surface: 'ptt_stock_board',
        crawl_mode: symbolContext ? 'symbol_scoped' : 'board_scan',
        post_type: postType,
        push_score: pushScore,
        push_count: pushCount,
        boo_count: booCount,
        neutral_count: neutralCount,
        push_bull_bear_ratio: pushBullBearRatio,
        comment_sentiment: commentSentiment,
        matched_symbol_reason: symbols.length > 0 ? 'tw_symbol_or_name_proximity' : null,
        excluded_false_positives: extracted.excludedFalsePositives,
        page_depth: Math.floor(allMatches.indexOf(match) / 20),
        query_mode: symbolContext ? 'search' : 'board_scan',
        retention_mode: 'metadata_link_only',
      },
    });
    for (const symbol of symbols) {
      pttSignalRows.push({
        stock_id: stockBySymbol.get(symbol)?.id || null,
        symbol,
        document_url: articleUrl,
        title,
        post_type: postType,
        push_score: pushScore,
        push_count: pushCount,
        boo_count: booCount,
        neutral_count: neutralCount,
        push_bull_bear_ratio: pushBullBearRatio,
        comment_sentiment: commentSentiment,
        matched_symbol_reason: 'tw_symbol_or_name_proximity',
        metadata: {
          source_surface: 'ptt_stock_board',
          crawl_mode: symbolContext ? 'symbol_scoped' : 'board_scan',
          excluded_false_positives: extracted.excludedFalsePositives,
        },
        collected_at: nowIso(),
      });
    }
  }

  const count = await upsertSourceRawDocuments(filterSymbolScopedDocs(docs, 'ptt', symbolContext));
  if (pttSignalRows.length > 0) {
    const { error: pttSignalError } = await supabase
      .from('ptt_post_signals')
      .upsert(pttSignalRows, { onConflict: 'document_url,symbol' });
    if (pttSignalError && !/does not exist|schema cache|Could not find/i.test(pttSignalError.message)) {
      throw new Error(pttSignalError.message);
    }
  }
  return {
    connector: 'ptt',
    recordsWritten: count,
    fetchedPosts: articlesFetched,
    duplicatesSkipped: Math.max(0, docs.length - count),
    matchedDirectHits: matchedSymbols.size,
    matchedIndustryHits: 0,
    entityId: String(entity.id),
    errorCode: failedPageFetches > 0 || articleFetchFailures > 0 ? 'provider_partial' : null,
    degradedReason: failedPageFetches > 0 || articleFetchFailures > 0
      ? `ptt_fetch_partial:pages=${failedPageFetches},articles=${articleFetchFailures},page_errors=${[...pageFetchFailures].join('|') || 'none'},article_errors=${[...articleFetchFailureReasons].join('|') || 'none'}`
      : null,
    sessionMode: 'not_applicable' as const,
    articlesFetched,
    pushCommentsParsed,
    matchedSymbols: [...matchedSymbols],
    metadata: {
      source_surface: 'ptt_stock_board',
      pages_scanned: targetPages.length,
      page_fetch_errors: [...pageFetchFailures],
      article_fetch_errors: [...articleFetchFailureReasons],
      articles_fetched: articlesFetched,
      push_comments_parsed: pushCommentsParsed,
      matched_symbols: [...matchedSymbols],
    },
  };
}

async function scrapeBullTalk(symbolContext?: SymbolScopedStockContext | null) {
  const feedUrl = compactText(process.env.BULLTALK_AUTHORIZED_FEED_URL);
  if (process.env.BULLTALK_LICENSED !== 'true' || !feedUrl) {
    return { connector: 'bulltalk', recordsWritten: 0, fetchedPosts: 0, entityId: null,
      errorCode: 'license_missing', degradedReason: 'bulltalk_authorized_feed_missing', sessionMode: 'not_applicable' as const };
  }
  const parsedFeedUrl = new URL(feedUrl);
  if (parsedFeedUrl.protocol !== 'https:') throw new Error('bulltalk_authorized_feed_requires_https');
  const entity = await upsertSourceEntity({
    platform: 'bulltalk',
    entityType: 'site',
    displayName: '股市爆料同學會授權熱門榜',
    sourceKey: 'authorized.bulltalk.feed',
    profileUrl: feedUrl,
  });
  const token = compactText(process.env.BULLTALK_AUTHORIZED_FEED_TOKEN);
  const response = await fetch(feedUrl, {
    headers: { accept: 'application/json,text/csv', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`bulltalk_authorized_feed_http_${response.status}`);
  const contentType = response.headers.get('content-type') || '';
  let rows: Row[] = [];
  if (contentType.includes('json')) {
    const payload = await response.json() as unknown;
    rows = (Array.isArray(payload) ? payload : (payload && typeof payload === 'object' && Array.isArray((payload as Row).data) ? (payload as Row).data : [])) as Row[];
  } else {
    const lines = (await response.text()).split(/\r?\n/u).filter(Boolean);
    const headers = (lines.shift() || '').split(',').map((item) => compactText(item).toLowerCase());
    rows = lines.map((line) => Object.fromEntries(line.split(',').map((value, index) => [headers[index], compactText(value)])));
  }
  const docs: SourceRawDocInput[] = rows.slice(0, 500).flatMap((row) => {
    const title = compactText(row.title || row.name || row.summary);
    const documentUrl = compactText(row.url || row.document_url || row.source_url);
    const rawSymbols = Array.isArray(row.symbols) ? row.symbols.map(String) : compactText(row.symbols || row.symbol).split(/[|;\s]+/u);
    const symbols = unique(rawSymbols.map((item) => item.toUpperCase()).filter((item) => /^\d{4}$/u.test(item)));
    if (!title || !documentUrl || !/^https:\/\//u.test(documentUrl) || symbols.length === 0) return [];
    if (symbolContext && !symbols.includes(symbolContext.symbol)) return [];
    const stance = compactText(row.stance || row.sentiment).toLowerCase();
    const sentimentLabel = ['bullish', 'positive'].includes(stance) ? 'bullish' : ['bearish', 'negative'].includes(stance) ? 'bearish' : 'neutral';
    return [{
      sourceEntityId: String(entity.id), platform: 'bulltalk', documentUrl, title,
      summary: title, contentText: title, symbols, sentimentLabel, confidence: 0.7,
      publishedAt: safeDateString(row.published_at || row.publishedAt || null),
      metadata: {
        connector: 'authorized_feed', retention_mode: 'metadata_link_only',
        mention_count: Number(row.mention_count || row.mentions || 0),
        comment_count: Number(row.comment_count || row.comments || 0),
        engagement_count: Number(row.engagement_count || row.engagement || 0),
        rank: Number(row.rank || 0), license_basis: 'cmoney_partner_or_api_license',
      },
    }];
  });
  const count = await upsertSourceRawDocuments(filterSymbolScopedDocs(docs, 'bulltalk', symbolContext));
  return { connector: 'bulltalk', recordsWritten: count, fetchedPosts: rows.length,
    duplicatesSkipped: Math.max(0, docs.length - count), matchedDirectHits: new Set(docs.flatMap((doc) => doc.symbols)).size,
    matchedIndustryHits: 0, entityId: String(entity.id), errorCode: null, sessionMode: 'not_applicable' as const };
}

const GDELT_RETIRED_HOSTS = [
  'news.google.com',
  'youtube.com',
  'youtu.be',
  'udn.com',
  'money.udn.com',
  'anue.com',
  'news.cnyes.com',
  'mobile01.com',
] as const;

function parseGdeltSeenDate(value: unknown): string | null {
  const raw = compactText(value);
  const match = raw.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/u);
  if (!match) return safeDateString(raw || null);
  return `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
}

function isRetiredNewsHost(value: string): boolean {
  try {
    const host = new URL(value).hostname.toLowerCase().replace(/^www\./u, '');
    return GDELT_RETIRED_HOSTS.some((item) => host === item || host.endsWith(`.${item}`));
  } catch {
    return true;
  }
}

async function scrapeGdeltMetadata(symbolContext?: SymbolScopedStockContext | null): Promise<SourceSyncRunShape> {
  const supabase = getSupabaseServerClient();
  const { data: stockData, error: stockError } = await supabase
    .from('stocks')
    .select('symbol,name')
    .eq('market', 'TW')
    .limit(10000);
  if (stockError) throw new Error(stockError.message);
  const stocks = ((stockData as Row[]) || [])
    .map((row) => ({ symbol: compactText(row.symbol).toUpperCase(), name: compactText(row.name) }))
    .filter((row) => /^\d{4}$/u.test(row.symbol) && row.name.length >= 2)
    .filter((row) => !symbolContext || row.symbol === symbolContext.symbol);

  const endpoint = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  endpoint.searchParams.set('query', symbolContext
    ? `("${symbolContext.symbol}" OR "${symbolContext.name}") sourcecountry:Taiwan`
    : '("台股" OR "臺股" OR "台灣股市") sourcecountry:Taiwan');
  endpoint.searchParams.set('mode', 'ArtList');
  endpoint.searchParams.set('format', 'json');
  endpoint.searchParams.set('maxrecords', '250');
  endpoint.searchParams.set('timespan', '1d');
  endpoint.searchParams.set('sort', 'HybridRel');
  const response = await fetch(endpoint, {
    headers: { accept: 'application/json', 'user-agent': 'StockInsider/2.0 metadata-discovery' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`gdelt_http_${response.status}`);
  const payload = await response.json() as { articles?: Array<Record<string, unknown>> };
  if (!Array.isArray(payload.articles)) throw new Error('gdelt_parser_missing_articles');

  const entity = await upsertSourceEntity({
    platform: 'gdelt',
    entityType: 'site',
    displayName: 'GDELT DOC 2.0',
    sourceKey: 'site.gdelt.doc2',
    profileUrl: 'https://www.gdeltproject.org/',
    metadata: { retention_mode: 'metadata_link_only' },
  });
  const docs: SourceRawDocInput[] = payload.articles.flatMap((article) => {
    const title = compactText(article.title);
    const documentUrl = compactText(article.url);
    if (!title || !/^https:\/\//u.test(documentUrl) || isRetiredNewsHost(documentUrl)) return [];
    const symbols = stocks
      .filter((stock) => title.includes(stock.symbol) || title.includes(stock.name))
      .map((stock) => stock.symbol);
    if (symbols.length === 0) return [];
    return [{
      sourceEntityId: String(entity.id),
      platform: 'gdelt',
      documentUrl,
      title,
      summary: title,
      contentText: title,
      publishedAt: parseGdeltSeenDate(article.seendate),
      symbols: unique(symbols),
      sentimentLabel: 'neutral',
      confidence: 0.62,
      metadata: {
        connector: 'gdelt_doc_2',
        retention_mode: 'metadata_link_only',
        original_domain: compactText(article.domain),
        source_country: compactText(article.sourcecountry),
        language: compactText(article.language),
        license_basis: 'gdelt_metadata_and_source_links',
      },
    }];
  });
  const count = await upsertSourceRawDocuments(docs);
  const matchedSymbols = unique(docs.flatMap((doc) => doc.symbols || []));
  return {
    connector: 'gdelt',
    recordsWritten: count,
    fetchedPosts: payload.articles.length,
    duplicatesSkipped: Math.max(0, docs.length - count),
    matchedDirectHits: docs.length,
    matchedIndustryHits: 0,
    matchedSymbols,
    entityId: String(entity.id),
    errorCode: null,
    degradedReason: null,
    sessionMode: 'not_applicable',
    metadata: { retained_metadata_rows: docs.length, excluded_retired_domains: true },
  };
}

async function scrapeThreadsOfficialApi(symbolContext?: SymbolScopedStockContext | null): Promise<SourceSyncRunShape> {
  const supabase = getSupabaseServerClient();
  const tokenState = await getThreadsTokenForRun();
  const connectorRunId = await startConnectorRun('source-sync', 'threads', {
    mode: 'threads_official_keyword_api',
    crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
    query_symbol: symbolContext?.symbol || null,
  });
  const agentRunId = await startAgentRun('source_sync', { connector: 'threads', mode: 'official_api', symbol: symbolContext?.symbol || null });
  const watermarkBefore = await getSourceWatermark('threads');
  const [{ data: watchlistData, error: watchlistError }, { data: stockData, error: stockError }] = await Promise.all([
    supabase.from('source_watchlists').select('*').eq('platform', 'threads').eq('enabled', true).order('priority', { ascending: false }),
    supabase.from('stocks').select('symbol,name').eq('market', 'TW'),
  ]);
  if (watchlistError || stockError) throw new Error(watchlistError?.message || stockError?.message || 'threads_context_unavailable');
  const watchlists = (watchlistData as Row[]) || [];
  const stocksRows = (stockData as Row[]) || [];
  const validSymbols = new Set(stocksRows.map((row) => compactText(row.symbol).toUpperCase()).filter((item) => /^\d{4}$/u.test(item)));
  const stockNamesBySymbol = new Map(stocksRows.map((row) => [compactText(row.symbol).toUpperCase(), compactText(row.name)] as const));
  const aliasesBySymbol = new Map(stocksRows.map((row) => {
    const symbol = compactText(row.symbol).toUpperCase();
    return [symbol, getSymbolAliases(symbol, compactText(row.name))] as const;
  }));
  const approvedAuthors = new Set([
    ...KOL_SEEDS.map((seed) => compactText(seed.metadata?.threadsUsername)).filter(Boolean),
    ...watchlists.filter((row) => String(row.watch_type || '') === 'author').map((row) => compactText(row.watch_value)),
  ].map((value) => value.replace(/^@/u, '').toLocaleLowerCase('en-US')));
  const queries = unique(symbolContext
    ? [symbolContext.symbol, symbolContext.name, ...symbolContext.aliases, ...symbolContext.industryQueryTerms]
    : [
        '台股', '財報', '籌碼', '產業輪動', '法說會', '目標價',
        ...watchlists.filter((row) => ['keyword', 'hashtag'].includes(String(row.watch_type || ''))).map((row) => compactText(row.watch_value)),
      ]).filter((value) => value.length >= 2).slice(0, 12);
  const entity = await upsertSourceEntity({
    platform: 'threads',
    entityType: 'site',
    displayName: 'Threads official keyword API',
    sourceKey: 'api.threads.keyword_search',
  });
  const records: SourceRawDocInput[] = [];
  let fetchedPosts = 0;
  let failedQueries = 0;
  let firstFailure: string | null = null;
  let authRejected = false;
  const seenIds = new Set<string>();
  for (const query of queries) {
    try {
      const endpoint = new URL('https://graph.threads.net/keyword_search');
      endpoint.searchParams.set('q', query);
      endpoint.searchParams.set('search_type', 'RECENT');
      endpoint.searchParams.set('fields', 'id,username,text,permalink,timestamp');
      endpoint.searchParams.set('access_token', tokenState.token);
      const response = await fetch(endpoint, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) {
        if (response.status === 401 || response.status === 403) authRejected = true;
        throw new Error(`threads_api_http_${response.status}`);
      }
      const payload = await response.json() as { data?: Array<{ id?: string; username?: string; text?: string; permalink?: string; timestamp?: string }> };
      for (const row of payload.data || []) {
        if (!row.id || seenIds.has(row.id)) continue;
        seenIds.add(row.id);
        fetchedPosts += 1;
        const username = compactText(row.username).replace(/^@/u, '').toLocaleLowerCase('en-US');
        if (approvedAuthors.size > 0 && !approvedAuthors.has(username)) continue;
        const text = compactText(row.text).slice(0, 1200);
        if (!text || !row.permalink) continue;
        const extracted = extractTwSymbolsWithEvidence(text, { validSymbols, stockNamesBySymbol, aliasesBySymbol });
        if (extracted.symbols.length === 0) continue;
        records.push({
          sourceEntityId: String(entity.id),
          platform: 'threads',
          documentUrl: row.permalink,
          title: `Threads @${username}: ${text.slice(0, 72)}`,
          summary: text.slice(0, 300),
          contentText: text,
          publishedAt: safeDateString(row.timestamp || null),
          symbols: extracted.symbols,
          sentimentLabel: 'neutral',
          confidence: 0.55,
          metadata: {
            connector: 'threads_official_keyword_api',
            stable_id: row.id,
            source_account: username,
            query_keyword: query,
            crawl_mode: symbolContext ? 'symbol_scoped' : 'public_search',
            source_surface: 'threads_official_api',
            excluded_false_positives: extracted.excludedFalsePositives,
          },
        });
      }
    } catch (error) {
      failedQueries += 1;
      firstFailure ||= compactText((error as Error).message) || 'threads_api_query_failed';
    }
  }
  if (authRejected) {
    await upsertCredentialRegistry('threads', 'invalid', {
      credential_ref: 'SUPABASE_VAULT:threads_access_token',
      error_message: firstFailure || 'threads_api_auth_rejected',
      metadata: { ...threadsTokenRegistryMetadata(tokenState), failed_queries: failedQueries },
    });
    await finishConnectorRun(connectorRunId, 'failed', 0, { error_summary: firstFailure || 'threads_api_auth_rejected' });
    await finishAgentRun(agentRunId, 'failed', { connector: 'threads', error: firstFailure || 'threads_api_auth_rejected' });
    throw new Error(`threads_api_auth_rejected:${firstFailure || 'unknown'}`);
  }
  const count = await upsertSourceRawDocuments(filterSymbolScopedDocs(records, 'threads', symbolContext));
  const duplicatesSkipped = Math.max(0, records.length - count);
  const watermarkAfter = await getSourceWatermark('threads');
  const degradedReason = failedQueries > 0 ? `threads_api_failed_queries:${failedQueries}:${firstFailure || 'unknown'}` : null;
  await finishConnectorRun(connectorRunId, degradedReason ? 'partial' : 'success', count, {
    error_summary: degradedReason,
    metadata: {
      mode: 'threads_official_keyword_api',
      fetched_posts: fetchedPosts,
      matched_posts: records.length,
      records_written: count,
      duplicates_skipped: duplicatesSkipped,
      searched_keywords: queries,
      approved_author_count: approvedAuthors.size,
    },
  });
  await upsertCredentialRegistry('threads', 'valid', {
    credential_ref: 'SUPABASE_VAULT:threads_access_token',
    metadata: { ...threadsTokenRegistryMetadata(tokenState), records_written: count, fetched_posts: fetchedPosts },
  });
  await finishAgentRun(agentRunId, degradedReason ? 'failed' : 'success', { connector: 'threads', records_written: count, fetched_posts: fetchedPosts });
  return {
    connector: 'threads',
    recordsWritten: count,
    fetchedPosts,
    entityId: String(entity.id),
    watermarkBefore,
    watermarkAfter,
    duplicatesSkipped,
    sessionRefreshed: tokenState.refreshed,
    errorCode: degradedReason ? 'provider_partial' : null,
    matchedDirectHits: records.reduce((sum, row) => sum + (row.symbols?.length || 0), 0),
    matchedIndustryHits: 0,
    searchedKeywords: queries,
    matchedSymbols: unique(records.flatMap((row) => row.symbols || [])),
    degradedReason,
    timedOut: false,
    sessionMode: 'not_applicable',
  };
}

async function scrapeThreads(symbolContext?: SymbolScopedStockContext | null) {
  return scrapeThreadsOfficialApi(symbolContext);
}

async function scrapeTelegram(symbolContext?: SymbolScopedStockContext | null) {
  if (process.env.TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED !== 'true') {
    return { connector: 'telegram', recordsWritten: 0, fetchedPosts: 0, entityId: null,
      errorCode: 'not_authorized', degradedReason: 'telegram_public_channel_use_not_attested',
      sessionMode: 'not_applicable' as const };
  }
  try {
    return await _scrapeTelegramInner(symbolContext);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    await finishLatestRunningConnector('telegram', 'failed', 0, msg);
    await upsertCredentialRegistry('telegram', 'invalid', {
      credential_ref: 'TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED',
      error_message: msg.slice(0, 500),
      metadata: { mode: symbolContext ? 'symbol_scoped_failed' : 'public_channel_failed', records_written: 0 },
    });
    throw new Error(`telegram_connector_failed:${msg}`);
  }
}

async function _scrapeTelegramInner(symbolContext?: SymbolScopedStockContext | null) {
  const supabase = getSupabaseServerClient();
  const connectorRunId = await startConnectorRun('source-sync', 'telegram', {
    mode: symbolContext ? 'channel_symbol_filter' : 'public_channel_html',
    crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
    query_symbol: symbolContext?.symbol || null,
    query_terms: symbolContext?.queryTerms || [],
  });
  const agentRunId = await startAgentRun('source_sync', { connector: 'telegram', symbol: symbolContext?.symbol || null });

  const [stocksRes, priorDocumentsRes] = await Promise.all([
    supabase.from('stocks').select('symbol,name').eq('market', 'TW'),
    supabase.from('source_raw_documents').select('document_url,metadata').eq('platform', 'telegram').order('collected_at', { ascending: false }).limit(5000),
  ]);
  if (stocksRes.error || priorDocumentsRes.error) throw new Error(stocksRes.error?.message || priorDocumentsRes.error?.message || 'failed loading telegram context');
  const stocksRows = (stocksRes.data as Row[]) || [];
  const validSymbols = new Set(stocksRows.map((row) => compactText(row.symbol).toUpperCase()).filter((item) => /^\d{4}$/.test(item)));
  const stockNamesBySymbol = new Map(stocksRows.map((row) => [compactText(row.symbol).toUpperCase(), compactText(row.name)] as const));
  const aliasesBySymbol = new Map(stocksRows.map((row) => {
    const symbol = compactText(row.symbol).toUpperCase();
    return [symbol, getSymbolAliases(symbol, compactText(row.name))] as const;
  }));
  const cursorBefore = new Map<string, number>();
  for (const row of (priorDocumentsRes.data as Row[]) || []) {
    const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata as Row : {};
    const channel = compactText(metadata.channel_name).replace(/^@/u, '').toLowerCase();
    const messageId = Number(metadata.stable_message_id || /t\.me\/[^/]+\/(\d+)/u.exec(String(row.document_url || ''))?.[1]);
    if (channel && Number.isInteger(messageId)) cursorBefore.set(channel, Math.max(cursorBefore.get(channel) || 0, messageId));
  }
  const cursorAfter = new Map(cursorBefore);

  const entity = await upsertSourceEntity({
    platform: 'telegram',
    entityType: 'channel',
    displayName: 'Telegram channels',
    sourceKey: 'site.telegram.channels',
  });

  const records: Array<{ title: string; summary: string; contentText: string; publishedAt: string | null; documentUrl: string; symbols: string[]; metadata?: Record<string, unknown> }> = [];
  const channelBreakdown: Array<{
    channel: string;
    searched: boolean;
    fetched_posts: number;
    matched_symbols: string[];
    records_written: number;
    last_success_at: string | null;
    failure_reason: string | null;
    excluded_false_positives: number;
    excluded_examples: string[];
  }> = [];
  let fetchedPosts = 0;
  let cursorDuplicatesSkipped = 0;

  const channelNames = [...APPROVED_TELEGRAM_PUBLIC_CHANNELS];

  for (const channelNameRaw of channelNames) {
    const channelName = channelNameRaw.replace(/^@/, '');
    const previewUrl = `https://t.me/s/${channelName}`;
    const channelRecordsBefore = records.length;
    const channelSymbols = new Set<string>();
    const channelExclusions: Array<{ token: string; reason: string }> = [];
    let channelFetchedPosts = 0;
    let channelFailure: string | null = null;

    try {
      const response = await fetch(previewUrl, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/2.0' }, signal: AbortSignal.timeout(15_000) });
      if (!response.ok) throw new Error(`telegram_public_http_${response.status}`);
      const html = await response.text();
      const messageMatches = Array.from(html.matchAll(/data-post="[^/"]+\/(\d+)"([\s\S]*?)(?=data-post="|$)/gu)).slice(-20);
      for (const messageMatch of messageMatches) {
        const messageId = Number(messageMatch[1]);
        const scope = messageMatch[2] || '';
        const textMatch = /tgme_widget_message_text[^>]*>([\s\S]*?)<\/div>/u.exec(scope);
        const rawMsg = (textMatch?.[1] || '').replace(/<[^>]+>/g, ' ');
        const msgText = compactText(rawMsg);
        if (!Number.isInteger(messageId) || msgText.length < 15) continue;
        fetchedPosts += 1;
        channelFetchedPosts += 1;
        const cursorKey = channelName.toLowerCase();
        cursorAfter.set(cursorKey, Math.max(cursorAfter.get(cursorKey) || 0, messageId));
        if (messageId <= (cursorBefore.get(cursorKey) || 0)) {
          cursorDuplicatesSkipped += 1;
          continue;
        }
        const publishedAt = safeDateString(/<time\b[^>]*\bdatetime=["']([^"']+)["']/u.exec(scope)?.[1] || null);
        const extracted = extractTwSymbolsWithEvidence(msgText, { validSymbols, stockNamesBySymbol, aliasesBySymbol });
        const symbols = extracted.symbols;
        channelExclusions.push(...extracted.excludedFalsePositives);
        for (const symbol of symbols) channelSymbols.add(symbol);
        const docUrl = `https://t.me/${channelName}/${messageId}`;
        if (symbols.length === 0) continue;
        records.push({
          title: `Telegram @${channelName}: ${msgText.slice(0, 60)}`,
          summary: msgText.slice(0, 160),
          contentText: `Telegram @${channelName}: ${msgText.slice(0, 60)}`,
          publishedAt,
          documentUrl: docUrl,
          symbols,
          metadata: {
            channel_name: channelName,
            stable_message_id: messageId,
            source_mode: 'public_channel_html',
            source_surface: 'telegram_public_channel',
            retention_mode: 'metadata_link_only',
            crawl_mode: 'channel_scan',
            match_reason: 'tw_symbol_with_name_or_stock_context',
            excluded_false_positives: extracted.excludedFalsePositives,
          },
        });
      }

      await createSourceAudit({
        connectorRunId,
        platform: 'telegram',
        sourceEntityId: String(entity.id),
        targetUrl: previewUrl,
        status: records.length > channelRecordsBefore ? 'success' : 'partial',
        notes: `${channelName}; fetched=${channelFetchedPosts}; matched=${channelSymbols.size}`,
      });
    } catch (err) {
      channelFailure = (err as Error).message;
      await createSourceAudit({ connectorRunId, platform: 'telegram', targetUrl: previewUrl, status: 'failed', notes: channelFailure });
    }
    channelBreakdown.push({
      channel: channelName,
      searched: true,
      fetched_posts: channelFetchedPosts,
      matched_symbols: [...channelSymbols],
      records_written: Math.max(0, records.length - channelRecordsBefore),
      last_success_at: channelFetchedPosts > 0 ? new Date().toISOString() : null,
      failure_reason: channelFailure,
      excluded_false_positives: channelExclusions.length,
      excluded_examples: channelExclusions.slice(0, 8).map((item) => `${item.token}:${item.reason}`),
    });
  }

  const telegramCredStatus: 'valid' | 'invalid' = fetchedPosts > 0 ? 'valid' : 'invalid';
  await upsertCredentialRegistry('telegram', telegramCredStatus, {
    credential_ref: 'TELEGRAM_PUBLIC_CHANNELS_AUTHORIZED',
    metadata: {
      mode: 'public_channel_html',
      records_written: records.length,
      channel_breakdown: channelBreakdown,
    },
  });

  const count = await upsertSourceRawDocuments(
    filterSymbolScopedDocs(records.map((item) => ({
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
      metadata: { connector: 'public_channel_html', ...(item.metadata || {}) },
    })), 'telegram', symbolContext),
  );

  const taskId = await writeAgentTask({ agentRunId, agentRole: 'Source Connector Agent', taskType: 'source-sync', status: 'success', inputPayload: { connector: 'telegram' }, outputSummary: `synced ${count} telegram records` });
  await writeAgentFinding(taskId, `Telegram 同步 ${count} 筆訊息`, { confidence: 0.55 });
  await finishAgentRun(agentRunId, 'success', { connector: 'telegram', records_written: count, symbol: symbolContext?.symbol || null });
  await finishConnectorRun(connectorRunId, count > 0 ? 'success' : 'partial', count, {
    metadata: {
      entity_id: entity.id,
      fetched_posts: fetchedPosts,
      channel_breakdown: channelBreakdown,
      crawl_mode: symbolContext ? 'symbol_scoped' : 'channel_scan',
      source_surface: 'telegram_public_channels',
      query_symbol: symbolContext?.symbol || null,
      query_terms: symbolContext?.queryTerms || [],
    },
  });
  return {
    connector: 'telegram',
    recordsWritten: count,
    fetchedPosts,
    duplicatesSkipped: cursorDuplicatesSkipped + Math.max(0, records.length - count),
    matchedDirectHits: new Set(records.flatMap((record) => record.symbols)).size,
    matchedIndustryHits: 0,
    entityId: String(entity.id),
    watermarkBefore: JSON.stringify(Object.fromEntries([...cursorBefore.entries()].sort())),
    watermarkAfter: JSON.stringify(Object.fromEntries([...cursorAfter.entries()].sort())),
    errorCode: null,
    degradedReason: channelBreakdown.some((channel) => channel.failure_reason)
      ? `telegram_channels_failed:${channelBreakdown.filter((channel) => channel.failure_reason).length}`
      : null,
    sessionMode: 'not_applicable' as const,
  };
}

function parseTwNumber(value: unknown) {
  const text = compactText(value).replace(/[,\s]/g, '');
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRocDateToIso(input: unknown) {
  const digits = compactText(input).replace(/\D/g, '');
  if (digits.length < 6) return null;
  if (digits.length === 7) {
    const rocYear = Number(digits.slice(0, 3));
    const month = Number(digits.slice(3, 5));
    const day = Number(digits.slice(5, 7));
    if (!Number.isFinite(rocYear) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    const year = rocYear + 1911;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`;
  }
  if (digits.length === 8) {
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    if (!Number.isFinite(year) || month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00+08:00`;
  }
  return null;
}

async function scrapeTwseInsider(symbolContext?: SymbolScopedStockContext | null) {
  const connectorRunId = await startConnectorRun('source-sync', 'twse_insider', {
    mode: symbolContext ? 'openapi_twse_symbol' : 'openapi_twse',
    crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
    query_symbol: symbolContext?.symbol || null,
    query_terms: symbolContext?.queryTerms || [],
  });
  const agentRunId = await startAgentRun('source_sync', { connector: 'twse_insider', symbol: symbolContext?.symbol || null });
  const entity = await upsertSourceEntity({
    platform: 'twse_insider',
    entityType: 'site',
    displayName: 'TWSE 內部人持股揭露',
    sourceKey: 'site.twse.insider',
    profileUrl: 'https://openapi.twse.com.tw/',
  });

  const datasets = [
    {
      url: 'https://openapi.twse.com.tw/v1/opendata/t187ap11_L',
      kind: 'holding',
      label: '上市公司董監事持股餘額',
    },
    {
      url: 'https://openapi.twse.com.tw/v1/opendata/t187ap11_P',
      kind: 'holding',
      label: '公發公司董監事持股餘額',
    },
    {
      url: 'https://openapi.twse.com.tw/v1/opendata/t187ap12_L',
      kind: 'transfer',
      label: '內部人持股轉讓申報',
    },
  ] as const;

  const records: Array<{
    sourceEntityId: string;
    platform: string;
    documentUrl: string;
    title: string;
    summary: string;
    contentText: string;
    publishedAt: string | null;
    symbols: string[];
    sentimentLabel: 'bullish' | 'neutral' | 'bearish';
    confidence: number;
    metadata: Record<string, unknown>;
  }> = [];

  for (const dataset of datasets) {
    try {
      const rows = await fetch(dataset.url, {
        headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'application/json' },
        signal: AbortSignal.timeout(20_000),
      }).then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`)))) as Row[];
      const selected = Array.isArray(rows)
        ? rows
            .filter((row) => {
              if (!symbolContext) return true;
              return compactText(row['公司代號']) === symbolContext.symbol;
            })
            .slice(0, symbolContext ? 60 : 500)
        : [];
      for (const row of selected) {
        const symbol = compactText(row['公司代號']);
        if (!/^[1-9]\d{3}$/.test(symbol)) continue;
        const companyName = compactText(row['公司名稱']) || symbol;
        const role = compactText(row['職稱'] || row['申報人身分']) || '內部人';
        const person = compactText(row['姓名']) || '未揭露';
        const issueDate = compactText(row['出表日期']) || compactText(row['申報日期']) || '';
        const publishedAt = parseRocDateToIso(issueDate);
        const currentHolding = parseTwNumber(row['目前持股']);
        const electedHolding = parseTwNumber(row['選任時持股'] || row['選任時持股 ']);
        const transferMethod = compactText(row['預定轉讓方式及股數-轉讓方式']);
        const transferShares = parseTwNumber(row['預定轉讓方式及股數-擬轉讓股數']);
        const deltaHolding =
          currentHolding != null && electedHolding != null
            ? currentHolding - electedHolding
            : null;
        const sentimentLabel: 'bullish' | 'neutral' | 'bearish' =
          dataset.kind === 'transfer'
            ? 'bearish'
            : deltaHolding != null && deltaHolding > 0
              ? 'bullish'
              : 'neutral';
        const deltaText =
          deltaHolding == null
            ? '持股變化資料不足'
            : `選任時 ${electedHolding?.toLocaleString() || '-'} 股，現在 ${currentHolding?.toLocaleString() || '-'} 股，變化 ${deltaHolding > 0 ? '+' : ''}${deltaHolding.toLocaleString()} 股`;
        const summary =
          dataset.kind === 'transfer'
            ? `${companyName}(${symbol}) ${role} ${person} 申報轉讓 ${transferShares?.toLocaleString() || '-'} 股（${transferMethod || '方式未標記'}）。`
            : `${companyName}(${symbol}) ${role} ${person} 董監持股揭露：${deltaText}。`;
        records.push({
          sourceEntityId: String(entity.id),
          platform: 'twse_insider',
          documentUrl: dataset.url,
          title: `${dataset.label}｜${companyName}(${symbol})`,
          summary: summary.slice(0, 500),
          contentText: JSON.stringify(row).slice(0, 4000),
          publishedAt,
          symbols: [symbol],
          sentimentLabel,
          confidence: dataset.kind === 'transfer' ? 0.58 : 0.66,
          metadata: {
            connector: 'openapi_twse',
            dataset: dataset.url,
            issue_date: issueDate || null,
            role,
            person,
            delta_holding: deltaHolding,
            transfer_shares: transferShares,
          },
        });
      }
      await createSourceAudit({
        connectorRunId,
        platform: 'twse_insider',
        sourceEntityId: String(entity.id),
        targetUrl: dataset.url,
        status: selected.length > 0 ? 'success' : 'partial',
        notes: `${dataset.label} rows=${selected.length}`,
      });
    } catch (error) {
      await createSourceAudit({
        connectorRunId,
        platform: 'twse_insider',
        sourceEntityId: String(entity.id),
        targetUrl: dataset.url,
        status: 'failed',
        notes: (error as Error).message.slice(0, 500),
      });
    }
  }

  const count = await upsertSourceRawDocuments(filterSymbolScopedDocs(records, 'twse_insider', symbolContext));
  await upsertCredentialRegistry('twse_insider', count > 0 ? 'valid' : 'invalid', {
    credential_ref: 'public_openapi',
    metadata: { mode: 'openapi_twse', records_written: count },
  });
  const taskId = await writeAgentTask({
    agentRunId,
    agentRole: 'Source Connector Agent',
    taskType: 'source-sync',
    status: 'success',
    inputPayload: { connector: 'twse_insider' },
    outputSummary: `synced ${count} twse insider records`,
  });
  await writeAgentFinding(taskId, `TWSE 內部人揭露同步 ${count} 筆`, {
    finding_type: 'source_signal',
    confidence: 0.63,
  });
  await finishAgentRun(agentRunId, 'success', { connector: 'twse_insider', records_written: count, symbol: symbolContext?.symbol || null });
  await finishConnectorRun(connectorRunId, count > 0 ? 'success' : 'partial', count, {
    metadata: {
      entity_id: entity.id,
      crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
      query_symbol: symbolContext?.symbol || null,
      query_terms: symbolContext?.queryTerms || [],
    },
  });
  return { connector: 'twse_insider', recordsWritten: count, entityId: String(entity.id) };
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

export async function runSourceSync(options?: SourceSyncOptions): Promise<SourceSyncRunShape & { runId: string; dryRun: boolean }> {
  const connector = options?.connector || 'twse_insider';
  const dryRun = Boolean(options?.dryRun);
  const symbolContext = options?.symbol ? await resolveSymbolScopedStockContext(options.symbol) : null;
  const defaultSessionMode: SourceSyncRunShape['sessionMode'] = 'not_applicable';
  if (dryRun) {
    return {
      runId: randomUUID(),
      dryRun,
      connector,
      recordsWritten: 0,
      fetchedPosts: 0,
      entityId: null,
      watermarkBefore: null,
      watermarkAfter: null,
      duplicatesSkipped: 0,
      sessionRefreshed: false,
      errorCode: null,
      matchedDirectHits: 0,
      matchedIndustryHits: 0,
      degradedReason: null,
      timedOut: false,
      sessionMode: defaultSessionMode,
    };
  }

  const mapping: Record<string, (context?: SymbolScopedStockContext | null) => Promise<SourceSyncRunShape>> = {
    ptt: scrapePttStock,
    bulltalk: scrapeBullTalk,
    threads: scrapeThreads,
    telegram: scrapeTelegram,
    gdelt: scrapeGdeltMetadata,
    twse_insider: scrapeTwseInsider,
  };
  const runner = mapping[connector];
  if (!runner) throw new Error(`unsupported connector: ${connector}`);
  const watermarkBefore = await getSourceWatermark(connector);
  const selfManagedConnector = new Set(['threads', 'telegram', 'twse_insider']).has(connector);
  if (selfManagedConnector) {
    const result = await runner(symbolContext);
    return {
      runId: randomUUID(),
      dryRun,
      ...result,
      fetchedPosts: result.fetchedPosts ?? result.recordsWritten,
      watermarkBefore: result.watermarkBefore ?? watermarkBefore,
      watermarkAfter: result.watermarkAfter ?? (await getSourceWatermark(connector)),
      duplicatesSkipped: result.duplicatesSkipped ?? 0,
      sessionRefreshed: result.sessionRefreshed ?? false,
      errorCode: result.errorCode ?? null,
      matchedDirectHits: result.matchedDirectHits ?? 0,
      matchedIndustryHits: result.matchedIndustryHits ?? 0,
      degradedReason: result.degradedReason ?? null,
      timedOut: result.timedOut ?? false,
      sessionMode: result.sessionMode ?? defaultSessionMode,
    };
  }

  const connectorRunId = await startConnectorRun('source-sync', connector, { mode: 'public_http' });
  const startedAtMs = Date.now();
  let result: SourceSyncRunShape | null = null;
  try {
    result = await runner(symbolContext);
    const durationMs = Date.now() - startedAtMs;
    await finishConnectorRun(
      connectorRunId,
      result.recordsWritten > 0 ? 'success' : 'partial',
      result.recordsWritten,
      {
        metadata: {
          mode: symbolContext ? 'symbol_scoped_http' : 'public_http',
          duration_ms: durationMs,
          entity_id: result.entityId,
          crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
          query_symbol: symbolContext?.symbol || null,
          query_terms: symbolContext?.queryTerms || [],
          matched_direct_hits: result.matchedDirectHits ?? 0,
          matched_industry_hits: result.matchedIndustryHits ?? 0,
          degraded_reason: result.degradedReason ?? null,
          ...(result.metadata || {}),
        },
      },
    );
    await upsertCredentialRegistry(connector, result.recordsWritten > 0 ? 'valid' : 'invalid', {
      credential_ref: 'public_http',
      error_message: result.recordsWritten > 0 ? null : 'no_records_written',
      metadata: {
        mode: symbolContext ? 'symbol_scoped_http' : 'public_http',
        duration_ms: durationMs,
        records_written: result.recordsWritten,
        crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
        query_symbol: symbolContext?.symbol || null,
        matched_direct_hits: result.matchedDirectHits ?? 0,
        matched_industry_hits: result.matchedIndustryHits ?? 0,
        degraded_reason: result.degradedReason ?? null,
        ...(result.metadata || {}),
      },
    });
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    const message = (error as Error).message || String(error);
    await finishConnectorRun(connectorRunId, 'failed', 0, {
      error_summary: message.slice(0, 500),
      metadata: {
        mode: symbolContext ? 'symbol_scoped_http' : 'public_http',
        duration_ms: durationMs,
        crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
        query_symbol: symbolContext?.symbol || null,
      },
    });
    await upsertCredentialRegistry(connector, 'invalid', {
      credential_ref: 'public_http',
      error_message: message.slice(0, 500),
      metadata: {
        mode: symbolContext ? 'symbol_scoped_http' : 'public_http',
        duration_ms: durationMs,
        records_written: 0,
        crawl_mode: symbolContext ? 'symbol_scoped' : 'market_scan',
        query_symbol: symbolContext?.symbol || null,
      },
    });
    throw error;
  }
  if (!result) throw new Error(`connector result missing: ${connector}`);
  return {
    runId: randomUUID(),
    dryRun,
    ...result,
    fetchedPosts: result.fetchedPosts ?? result.recordsWritten,
    watermarkBefore,
    watermarkAfter: await getSourceWatermark(connector),
    duplicatesSkipped: 0,
    sessionRefreshed: false,
    errorCode: result.errorCode ?? null,
    matchedDirectHits: result.matchedDirectHits ?? 0,
    matchedIndustryHits: result.matchedIndustryHits ?? 0,
    degradedReason: result.degradedReason ?? null,
    timedOut: result.timedOut ?? false,
    sessionMode: result.sessionMode ?? 'not_applicable',
  };
}

function detectSocialBrokerSignal(text: string) {
  const normalized = compactText(text);
  if (!normalized) return null;
  const brokerName =
    US_BROKER_KEYWORDS.find((keyword) => new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(normalized)) || null;
  const hasValuationKeyword = BROKER_VALUATION_KEYWORDS.some((keyword) =>
    new RegExp(keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(normalized),
  );
  if (!brokerName || !hasValuationKeyword) return null;
  const targetMatch =
    normalized.match(/(?:目標價|target price|TP|上看|調升至)\s*(?:NT\$|新台幣|台幣|TWD|\$|：|:)?\s*(\d{2,5}(?:\.\d{1,2})?)/i) ||
    normalized.match(/(?:目標價|target price|TP)[^\d]{0,20}(\d{2,5}(?:\.\d{1,2})?)/i);
  const epsMatch =
    normalized.match(/(?:Forward\s*)?EPS(?:\s*\(?\d{4}\)?)?[^\d]{0,20}(\d{1,4}(?:\.\d{1,2})?)/i) ||
    normalized.match(/(?:每股盈餘|EPS預估|EPS估)[^\d]{0,20}(\d{1,4}(?:\.\d{1,2})?)/i);
  return {
    brokerName,
    targetPrice: targetMatch ? Number(targetMatch[1]) : null,
    forwardEps: epsMatch ? Number(epsMatch[1]) : null,
    summary: normalized.slice(0, 700),
  };
}

export async function runSourceDiscovery(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const supabase = getSupabaseServerClient();
  const [docsRes, stocksRes] = await Promise.all([
    supabase
      .from('source_raw_documents')
      .select('id,platform,title,summary,document_url,symbols,collected_at,published_at,metadata,source_entity_id,confidence')
      .neq('platform', 'investanchors')
      .order('collected_at', { ascending: false })
      .limit(80),
    supabase.from('stocks').select('id,symbol,name,market').eq('market', 'TW').limit(3000),
  ]);
  if (docsRes.error || stocksRes.error) {
    throw new Error(docsRes.error?.message || stocksRes.error?.message || 'Failed to load source discovery inputs');
  }
  const documents = ((docsRes.data as Row[]) || []).filter((doc) =>
    !(RETIRED_SOURCE_CONNECTORS as readonly string[]).includes(compactText(doc.platform).toLowerCase()));
  const stockBySymbol = new Map<string, Row>();
  for (const stock of (stocksRes.data as Row[]) || []) {
    const symbol = String(stock.symbol || '');
    if (symbol) stockBySymbol.set(symbol, stock);
  }
  const candidates: Array<{ platform: string; candidate_name: string; candidate_url: string | null; reason: string; evidence: Record<string, unknown> }> = [];

  for (const doc of documents) {
    const content = `${doc.title || ''}\n${doc.summary || ''}\n${doc.document_url || ''}`;
    const urls = Array.from(String(content).matchAll(/https?:\/\/[^\s)]+/g)).map((match) => match[0]);
    for (const url of urls) {
      let platform = 'unknown';
      if (url.includes('threads.net') || url.includes('threads.com')) platform = 'threads';
      else if (url.includes('instagram.com')) platform = 'instagram';
      else if (url.includes('t.me')) platform = 'telegram';
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

  const asOfDate = asDate();
  const investanchorsRows: Array<Record<string, unknown>> = [];
  const extractMentionedSymbols = (doc: Row) => {
    const explicit = Array.isArray(doc.symbols) ? (doc.symbols as unknown[]).map(String) : [];
    const text = `${doc.title || ''}\n${doc.summary || ''}`;
    const textSymbols = Array.from(text.matchAll(/[【\[(（]\s*(\d{4})\s*[】\])）]/g)).map((match) => match[1]);
    return unique([...explicit, ...textSymbols])
      .map((symbol) => symbol.trim())
      .filter((symbol) => {
        if (!/^\d{4}$/.test(symbol)) return false;
        const stock = stockBySymbol.get(symbol);
        if (!stock) return false;
        const stockName = compactText(stock.name || '');
        return textSymbols.includes(symbol) || (stockName.length >= 2 && stockName !== symbol && !/^\d+$/.test(stockName) && text.includes(stockName));
      });
  };

  const socialBrokerMentionRows: Array<Record<string, unknown>> = [];
  const socialBrokerCandidateRows: Array<Record<string, unknown>> = [];
  const socialBrokerSeen = new Set<string>();
  for (const doc of documents) {
    const platform = compactText(doc.platform || '').toLowerCase();
    if (!['threads', 'instagram', 'telegram', 'bulltalk', 'ptt', 'kol', 'podcast'].includes(platform)) continue;
    const text = `${doc.title || ''}\n${doc.summary || ''}\n${doc.content_text || ''}`;
    const brokerSignal = detectSocialBrokerSignal(text);
    if (!brokerSignal) continue;
    const symbols = extractMentionedSymbols(doc);
    if (symbols.length === 0) continue;
    for (const symbol of symbols) {
      const stock = stockBySymbol.get(symbol);
      if (!stock) continue;
      const stockId = String(stock.id || '');
      const sourceUrl = String(doc.document_url || '');
      const key = `${stockId}|${sourceUrl}|${brokerSignal.brokerName}`;
      if (!stockId || socialBrokerSeen.has(key)) continue;
      socialBrokerSeen.add(key);
      socialBrokerMentionRows.push({
        stock_id: stockId,
        symbol,
        source_document_id: doc.id || null,
        platform,
        broker_name: brokerSignal.brokerName,
        target_price: brokerSignal.targetPrice,
        forward_eps: brokerSignal.forwardEps,
        source_url: sourceUrl || null,
        summary: brokerSignal.summary,
        source_mode: 'social_broker_leak',
        verification_status: 'pending',
        metadata: {
          source_document_url: sourceUrl || null,
          crawl_mode: (doc.metadata as Row | null)?.crawl_mode || null,
          source_surface: (doc.metadata as Row | null)?.source_surface || null,
          query_keyword: (doc.metadata as Row | null)?.query_keyword || null,
          formal_base_eligible: false,
          boundary: 'social_broker_leak_requires_public_or_imported_confirmation',
        },
        collected_at: nowIso(),
      });
      socialBrokerCandidateRows.push({
        stock_id: stockId,
        story_type: 'valuation_reset',
        title: `社群轉述外資估值線索：${symbol} ${brokerSignal.brokerName}`,
        summary: `社群來源轉述 ${brokerSignal.brokerName} 對 ${symbol} 的 EPS / 目標價線索；目前只作券商雷達候選，需原始報告、新聞或官方財務資料確認後才可納入 Base。`,
        catalyst_summary: `疑似外資/FactSet 估值訊號：${brokerSignal.summary.slice(0, 220)}`,
        thesis_state: 'signal_candidate',
        confidence: 0.38,
        novelty_score: 0.62,
        evidence_score: 0.3,
        timing_score: 0,
        verification_status: '未證實',
        conditional_recommendation_note: '社群轉述券商線索只能進候選池；未取得原始券商/新聞佐證前，不支撐正式 Base 目標價。',
        source_mix: [
          {
            source: platform,
            sourceType: 'social_broker_leak',
            title: compactText(doc.title || `${platform} broker leak`).slice(0, 160),
            summary: brokerSignal.summary,
            sourceUrl: sourceUrl || null,
            verification: 'pending',
          },
        ],
        related_themes: ['broker_rerating_watch', 'social_broker_leak'],
        discovered_at: nowIso(),
        as_of_date: asOfDate,
        updated_at: nowIso(),
      });
    }
  }

  if (!dryRun && deduped.length > 0) {
    const { error: insertError } = await supabase.from('source_discovery_queue').insert(deduped);
    if (insertError) throw new Error(insertError.message);
  }
  if (!dryRun && socialBrokerMentionRows.length > 0) {
    const { error: brokerMentionError } = await supabase
      .from('social_broker_mentions')
      .upsert(socialBrokerMentionRows, { onConflict: 'stock_id,source_url,broker_name' });
    if (brokerMentionError && !/does not exist|schema cache|Could not find/i.test(brokerMentionError.message)) {
      throw new Error(brokerMentionError.message);
    }
  }
  if (!dryRun && investanchorsRows.length > 0) {
    const { error: candidateError } = await supabase.from('story_candidates').upsert(investanchorsRows, { onConflict: 'stock_id,story_type,as_of_date' });
    if (candidateError) throw new Error(candidateError.message);
  }
  if (!dryRun && socialBrokerCandidateRows.length > 0) {
    const { error: brokerCandidateError } = await supabase
      .from('story_candidates')
      .upsert(socialBrokerCandidateRows, { onConflict: 'stock_id,story_type,as_of_date' });
    if (brokerCandidateError) throw new Error(brokerCandidateError.message);
  }

  return {
    runId: randomUUID(),
    dryRun,
    recordsWritten: deduped.length + investanchorsRows.length + socialBrokerMentionRows.length + socialBrokerCandidateRows.length,
    discoveryQueueRecordsWritten: deduped.length,
    investanchorsCandidateRecordsWritten: investanchorsRows.length,
    socialBrokerLeakDocumentsWritten: 0,
    socialBrokerMentionsWritten: socialBrokerMentionRows.length,
    socialBrokerCandidateRecordsWritten: socialBrokerCandidateRows.length,
    socialBrokerLeakSymbols: unique(
      socialBrokerCandidateRows
        .map((row) => [...stockBySymbol.values()].find((item) => String(item.id || '') === String(row.stock_id || ''))?.symbol)
        .filter((item): item is string => Boolean(item)),
    ),
    investanchorsCandidateSymbols: investanchorsRows.map((row) => {
      const stock = [...stockBySymbol.values()].find((item) => String(item.id || '') === String(row.stock_id || ''));
      return String(stock?.symbol || row.stock_id || '');
    }),
  };
}

export async function runBrokerReportIngest(options?: { dryRun?: boolean; symbols?: string[]; topN?: number }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, reportsIngested: 0, sectionsWritten: 0 };

  const supabase = getSupabaseServerClient();
  const today = asDate();

  let reportsIngested = 0;
  let sectionsWritten = 0;
  const manualImports = await ingestManualBrokerImports(supabase).catch(() => ({ reportsIngested: 0, sectionsWritten: 0 }));
  reportsIngested += manualImports.reportsIngested;
  sectionsWritten += manualImports.sectionsWritten;
  const authorizedConsensusSnapshotsWritten = await rebuildBrokerConsensusSnapshots(supabase, today).catch(() => 0);
  return {
    runId: randomUUID(),
    dryRun,
    reportsIngested,
    sectionsWritten,
    consensusSnapshotsWritten: authorizedConsensusSnapshotsWritten,
    sourceMode: 'user_owned_manual_imports_only',
    retiredSourcesSkipped: ['anue', 'cnyes', 'moneydj'],
  };

  /* Retired 2026-08-30: historical implementation retained temporarily for audit only.
     This block is not compiled and cannot issue Anue/Cnyes/MoneyDJ requests.
  for (const stock of stocks.slice(0, topN)) {
    const symbol = String(stock.symbol || '');
    const stockId = String(stock.id || '');
    try {
      try {
        const sourceUrl = `https://www.cnyes.com/twstock/foreignrating.aspx?code=${symbol}`;
        const cnyesRatingRes = await fetch(sourceUrl, {
          headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0', accept: 'text/html' },
          signal: AbortSignal.timeout(10_000),
        });
        if (cnyesRatingRes.ok) {
          const html = await cnyesRatingRes.text();
          const ratingRows = parseCnyesForeignRatingRows(html, symbol, today);
          for (const row of ratingRows) {
            const { data: cnyesDoc } = await supabase.from('broker_report_documents').upsert(
              {
                stock_id: stockId,
                broker_name: row.brokerName,
                report_date: row.reportDate || today,
                file_name: `cnyes_foreignrating_${symbol}_${slugify(row.brokerName)}_${row.reportDate || today}`,
                file_path: `public_summary/cnyes_foreignrating/${symbol}/${slugify(row.brokerName)}/${row.reportDate || today}`,
                source_mode: 'public_summary',
                rating: row.rating,
                target_price: row.targetPrice,
                thesis_title: `${row.brokerName} 外資評等${row.rating ? `：${row.rating}` : ''}，目標價 ${row.targetPrice}`,
                extracted_summary: row.summary,
                raw_text: row.summary,
                metadata: {
                  source: 'cnyes_foreignrating',
                  source_url: sourceUrl,
                  scraped_at: today,
                  forward_eps: row.forwardEps ?? null,
                  forward_year: row.forwardYear ?? null,
                  broker_region: row.isUsBroker ? 'us' : 'unknown',
                  consensus_provider: row.isConsensus ? 'factset' : null,
                  source_quality: row.isConsensus ? 'consensus' : row.isUsBroker ? 'us_broker_public_summary' : 'broker_public_summary',
                },
                updated_at: nowIso(),
              },
              { onConflict: 'file_path' },
            ).select('id').single();
            if (cnyesDoc?.id) {
              await supabase.from('broker_report_sections').upsert(
                {
                  broker_report_document_id: cnyesDoc.id,
                  section_kind: 'valuation',
                  section_title: '鉅亨外資評等',
                  section_content: row.summary,
                  sort_order: 1,
                },
                { onConflict: 'broker_report_document_id,sort_order' },
              );
              sectionsWritten += 1;
            }
            reportsIngested += 1;
          }
        }
      } catch {
        // Cnyes foreign rating scrape failure is non-fatal.
      }
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
      const factsetConsensus = parseFactsetConsensusFromText(allText);
      const rating = /買進|增持|強烈推薦|buy|strong buy/i.test(allText) ? '買進'
        : /持有|neutral|維持/i.test(allText) ? '持有'
        : /賣出|減碼|sell|underperform/i.test(allText) ? '賣出' : null;

      // Extract target price from text (e.g. "目標價 XXX 元")
      const targetPriceMatch = allText.match(/目標價\s*[：:＄$]?\s*(\d{2,5}(?:\.\d{1,2})?)/);
      const targetPrice = factsetConsensus.targetPrice || (targetPriceMatch ? Number(targetPriceMatch[1]) : null);

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
          metadata: {
            source: /FactSet/i.test(allText) ? 'anue_factset_news' : 'anue',
            article_count: articles.length,
            forward_eps: factsetConsensus.forwardEps,
            forward_year: factsetConsensus.forwardYear,
            analyst_count: factsetConsensus.analystCount,
            consensus_provider: factsetConsensus.forwardEps || factsetConsensus.analystCount ? 'factset' : null,
            source_quality: factsetConsensus.forwardEps || factsetConsensus.targetPrice ? 'consensus_news_summary' : 'news_summary',
          },
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
          const crossThemes = detectCrossThemeKeys(allText);
          if (crossThemes.length > 0) {
            for (const symbol of symbols) {
              const stock = await ensureStock(symbol, 'TW', symbol);
              for (const theme of crossThemes) {
                await supabase.from('cross_theme_discovery_events').upsert(
                  {
                    stock_id: stock.id,
                    symbol,
                    primary_theme: null,
                    cross_theme: theme.key,
                    evidence_level: theme.evidenceLevel,
                    source_refs: [docUrl],
                    reason: `${theme.reason} 來源：${title}`,
                    event_date: asDate(publishDate),
                    metadata: { label: theme.label, source_url: docUrl, title },
                    updated_at: nowIso(),
                  },
                  { onConflict: 'symbol,cross_theme,event_date' },
                );
              }
              if (/噴出|創高|漲停|大漲|突破|爆量|外資調升|目標價上修/i.test(allText)) {
                await supabase.from('missed_hot_symbol_reports').upsert(
                  {
                    symbol,
                    name: stock.name || symbol,
                    reason: `新聞/公開來源顯示 ${symbol} 出現價量或券商上修熱度：${title}`,
                    social_mentions: 0,
                    broker_target_revisions: /目標價|外資|券商|FactSet/i.test(allText) ? 1 : 0,
                    visible_state: 'needs_visibility_check',
                    report_date: asDate(publishDate),
                    metadata: { source_url: docUrl, title, cross_themes: crossThemes.map((theme) => theme.key) },
                  },
                  { onConflict: 'symbol,report_date' },
                );
              }
            }
          }
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

  const consensusSnapshotsWritten = await rebuildBrokerConsensusSnapshots(supabase, today).catch(() => 0);
  return { runId: randomUUID(), dryRun, reportsIngested, sectionsWritten, consensusSnapshotsWritten };
  */
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
    supabase.from('broker_report_documents').select('*').in('source_mode', [...AUTHORIZED_BROKER_SOURCE_MODES]).order('report_date', { ascending: false }),
    supabase.from('recommendations').select('*').eq('as_of', today).order('score', { ascending: false }),
    supabase.from('story_evidence_items').select('*').order('source_timestamp', { ascending: false }),
    supabase.from('source_raw_documents').select('platform,title,summary,symbols,confidence,collected_at,published_at,metadata,source_entity_id').order('collected_at', { ascending: false }).limit(300),
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
  const revenueRowsByStock = new Map<string, Row[]>();
  for (const row of revenueSignals) {
    const key = String(row.stock_id || '');
    if (!key) continue;
    revenueRowsByStock.set(key, [...(revenueRowsByStock.get(key) || []), row]);
  }
  for (const [key, rows] of revenueRowsByStock.entries()) {
    const preferred = selectLatestPreferredRow(rows, hasMeaningfulRevenueRow);
    if (preferred) revenueByStock.set(key, preferred);
  }
  const fundamentalByStock = new Map<string, Row>();
  const fundamentalRowsByStock = new Map<string, Row[]>();
  for (const row of fundamentalSnapshots) {
    const key = String(row.stock_id || '');
    if (!key) continue;
    fundamentalRowsByStock.set(key, [...(fundamentalRowsByStock.get(key) || []), row]);
  }
  for (const [key, rows] of fundamentalRowsByStock.entries()) {
    const preferred = selectLatestPreferredRow(rows, hasMeaningfulFundamentalRow);
    if (preferred) fundamentalByStock.set(key, preferred);
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
      symbol,
      thesisTitle,
      thesisSummary,
      currentPrice,
      epsTtm: fundamentalByStock.get(stockId) ? nonZeroNumberOrNull(fundamentalByStock.get(stockId)?.eps_ttm) : null,
      peRatio: fundamentalByStock.get(stockId) ? nonZeroNumberOrNull(fundamentalByStock.get(stockId)?.pe_ratio) : null,
      pbRatio: fundamentalByStock.get(stockId) ? positiveNumberOrNull(fundamentalByStock.get(stockId)?.pb_ratio) : null,
      monthlyRevenue: revenueByStock.get(stockId) ? positiveNumberOrNull(revenueByStock.get(stockId)?.monthly_revenue) : null,
      yoyGrowth: revenueByStock.get(stockId) ? nonZeroNumberOrNull(revenueByStock.get(stockId)?.yoy_growth) : null,
      momGrowth: revenueByStock.get(stockId) ? nonZeroNumberOrNull(revenueByStock.get(stockId)?.mom_growth) : null,
      revenueRunRate: fundamentalByStock.get(stockId) ? positiveNumberOrNull(fundamentalByStock.get(stockId)?.revenue_run_rate) : null,
      grossMarginPct: fundamentalByStock.get(stockId) ? positiveNumberOrNull(fundamentalByStock.get(stockId)?.gross_margin) : null,
      operatingMarginPct: fundamentalByStock.get(stockId) ? nonZeroNumberOrNull(fundamentalByStock.get(stockId)?.operating_margin) : null,
      brokerTargetPrice: latestBroker ? toFiniteNumber(latestBroker.target_price, 0) : toFiniteNumber(baseValuation?.target_price, 0),
      evidenceCount: stockEvidence.length,
      sourceDocumentCount: sourceDocs.length,
      brokerReportCount: brokerViews.length,
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
        const rev = positiveNumberOrNull(revenue.monthly_revenue);
        const yoy = revenue.yoy_growth == null ? null : toFiniteNumber(revenue.yoy_growth, Number.NaN);
        const mom = revenue.mom_growth == null ? null : toFiniteNumber(revenue.mom_growth, Number.NaN);
        if (rev != null && rev > 0) {
          const yoyText = yoy != null && Number.isFinite(yoy)
            ? `${yoy >= 0 ? '+' : ''}${yoy.toFixed(1)}%`
            : '待補';
          const momText = mom != null && Number.isFinite(mom)
            ? `${mom >= 0 ? '+' : ''}${mom.toFixed(1)}%`
            : '待補';
          parts.push(`月營收 ${(rev / 1e8).toFixed(1)} 億（YoY ${yoyText}，MoM ${momText}）`);
        }
      }
      if (fundamental) {
        const pe = nonZeroNumberOrNull(fundamental.pe_ratio);
        const gm = positiveNumberOrNull(fundamental.gross_margin);
        const eps = nonZeroNumberOrNull(fundamental.eps_ttm);
        if (eps != null) parts.push(`EPS TTM ${eps.toFixed(2)} 元`);
        if (gm != null && gm > 0) parts.push(`毛利率 ${gm.toFixed(1)}%`);
        if (pe != null && pe > 0) parts.push(`本益比 ${pe.toFixed(1)}x`);
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
              valuation_quality: scenario.valuationQuality,
              scenario_driver_type: scenario.scenarioDriverType,
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
            assumptions: {
              ...(((baseValuation?.assumptions as Record<string, unknown> | null) || {})),
              valuation_quality: scenario.valuationQuality,
              scenario_driver_type: scenario.scenarioDriverType,
              driver_label: scenario.driverLabel,
              story_drivers: scenario.base.storyDrivers,
              operating_bridge: scenario.base.operatingBridge,
              earnings_bridge: scenario.base.earningsBridge,
              operating_assumptions: scenario.base.operatingAssumptions,
              financial_bridge: scenario.base.financialBridge,
              multiple_bridge: scenario.base.multipleBridge,
              price_bridge: scenario.base.priceBridge,
              bridge_summary: scenario.base.bridgeSummary,
              revenue_annual: scenario.base.revenueAnnual,
              gross_margin_pct: scenario.base.grossMarginPct,
              operating_margin_pct: scenario.base.operatingMarginPct,
              eps: scenario.base.eps,
              pe: scenario.base.pe,
            },
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
            assumptions: {
              valuation_quality: scenario.valuationQuality,
              scenario_driver_type: scenario.scenarioDriverType,
              driver_label: scenario.driverLabel,
              story_drivers: scenario.upside.storyDrivers,
              operating_bridge: scenario.upside.operatingBridge,
              earnings_bridge: scenario.upside.earningsBridge,
              operating_assumptions: scenario.upside.operatingAssumptions,
              financial_bridge: scenario.upside.financialBridge,
              multiple_bridge: scenario.upside.multipleBridge,
              price_bridge: scenario.upside.priceBridge,
              bridge_summary: scenario.upside.bridgeSummary,
              revenue_annual: scenario.upside.revenueAnnual,
              gross_margin_pct: scenario.upside.grossMarginPct,
              operating_margin_pct: scenario.upside.operatingMarginPct,
              eps: scenario.upside.eps,
              pe: scenario.upside.pe,
            },
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
            assumptions: {
              valuation_quality: scenario.valuationQuality,
              scenario_driver_type: scenario.scenarioDriverType,
              driver_label: scenario.driverLabel,
              story_drivers: scenario.bear.storyDrivers,
              operating_bridge: scenario.bear.operatingBridge,
              earnings_bridge: scenario.bear.earningsBridge,
              operating_assumptions: scenario.bear.operatingAssumptions,
              financial_bridge: scenario.bear.financialBridge,
              multiple_bridge: scenario.bear.multipleBridge,
              price_bridge: scenario.bear.priceBridge,
              bridge_summary: scenario.bear.bridgeSummary,
              revenue_annual: scenario.bear.revenueAnnual,
              gross_margin_pct: scenario.bear.grossMarginPct,
              operating_margin_pct: scenario.bear.operatingMarginPct,
              eps: scenario.bear.eps,
              pe: scenario.bear.pe,
            },
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
              assumptions: {
                revenue_annual: scenario.base.revenueAnnual,
                eps: scenario.base.eps,
                pe: scenario.base.pe,
                method: 'eps_pe_base',
                driver_label: scenario.driverLabel,
                story_drivers: scenario.base.storyDrivers,
                operating_bridge: scenario.base.operatingBridge,
                earnings_bridge: scenario.base.earningsBridge,
                operating_assumptions: scenario.base.operatingAssumptions,
                financial_bridge: scenario.base.financialBridge,
                multiple_bridge: scenario.base.multipleBridge,
                price_bridge: scenario.base.priceBridge,
                bridge_summary: scenario.base.bridgeSummary,
                gross_margin_pct: scenario.base.grossMarginPct,
                operating_margin_pct: scenario.base.operatingMarginPct,
              },
              updated_at: nowIso(),
            },
            {
              story_candidate_id: String(linkedStory.id),
              stock_id: stockId,
              case_type: 'upside',
              target_price: scenario.upside.targetPrice,
              expected_return_pct: scenario.upside.expectedReturnPct,
              assumptions: {
                revenue_annual: scenario.upside.revenueAnnual,
                eps: scenario.upside.eps,
                pe: scenario.upside.pe,
                method: 'eps_pe_upside',
                driver_label: scenario.driverLabel,
                story_drivers: scenario.upside.storyDrivers,
                operating_bridge: scenario.upside.operatingBridge,
                earnings_bridge: scenario.upside.earningsBridge,
                operating_assumptions: scenario.upside.operatingAssumptions,
                financial_bridge: scenario.upside.financialBridge,
                multiple_bridge: scenario.upside.multipleBridge,
                price_bridge: scenario.upside.priceBridge,
                bridge_summary: scenario.upside.bridgeSummary,
                gross_margin_pct: scenario.upside.grossMarginPct,
                operating_margin_pct: scenario.upside.operatingMarginPct,
              },
              updated_at: nowIso(),
            },
            {
              story_candidate_id: String(linkedStory.id),
              stock_id: stockId,
              case_type: 'invalidation',
              target_price: scenario.bear.targetPrice,
              expected_return_pct: scenario.bear.expectedReturnPct,
              assumptions: {
                revenue_annual: scenario.bear.revenueAnnual,
                eps: scenario.bear.eps,
                pe: scenario.bear.pe,
                method: 'eps_pe_bear',
                driver_label: scenario.driverLabel,
                story_drivers: scenario.bear.storyDrivers,
                operating_bridge: scenario.bear.operatingBridge,
                earnings_bridge: scenario.bear.earningsBridge,
                operating_assumptions: scenario.bear.operatingAssumptions,
                financial_bridge: scenario.bear.financialBridge,
                multiple_bridge: scenario.bear.multipleBridge,
                price_bridge: scenario.bear.priceBridge,
                bridge_summary: scenario.bear.bridgeSummary,
                gross_margin_pct: scenario.bear.grossMarginPct,
                operating_margin_pct: scenario.bear.operatingMarginPct,
              },
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
    supabase.from('source_raw_documents').select('id,platform,title,summary,document_url,symbols,collected_at,published_at,metadata,confidence,source_entity_id').eq('source_entity_id', entityId).order('collected_at', { ascending: false }).limit(30),
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

type PodcastEpisodeCandidate = {
  title: string;
  link: string;
  pubDate: string | null;
  audioUrl: string | null;
  description?: string | null;
  platform: 'youtube' | 'rss' | 'apple_podcast' | 'spotify' | 'other';
  sourceMode?: string;
};

function decodeXmlText(value: unknown) {
  return compactText(value)
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function firstXmlValue(body: string, tags: string[]) {
  for (const tag of tags) {
    const escaped = tag.replace(':', '\\:');
    const match = body.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${escaped}>`, 'i'));
    if (match?.[1]) return decodeXmlText(match[1]);
  }
  return '';
}

function parseRssItems(xmlText: string) {
  const items: PodcastEpisodeCandidate[] = [];
  const itemMatches = [
    ...Array.from(xmlText.matchAll(/<item[\s>]([\s\S]*?)<\/item>/g)).map((match) => ({ body: match[1], kind: 'rss' as const })),
    ...Array.from(xmlText.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)).map((match) => ({ body: match[1], kind: 'youtube_feed' as const })),
  ];
  for (const match of itemMatches.slice(0, 10)) {
    const body = match.body;
    const title = firstXmlValue(body, ['title', 'media:title']);
    const hrefLink = (body.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || '';
    const link = decodeXmlText(firstXmlValue(body, ['link']) || hrefLink || (body.match(/<enclosure[^>]+url="([^"]+)"/i) || [])[1] || '');
    const pubDate = safeDateString(firstXmlValue(body, ['pubDate', 'published', 'updated']));
    const audioUrl = decodeXmlText((body.match(/<enclosure[^>]+url="([^"]+)"/i) || [])[1] || '');
    const description = firstXmlValue(body, ['description', 'summary', 'media:description', 'itunes:summary']);
    if (title && link) {
      items.push({
        title,
        link,
        pubDate,
        audioUrl: audioUrl || null,
        description: description || null,
        platform: match.kind === 'youtube_feed' || link.includes('youtube.com') || link.includes('youtu.be') ? 'youtube' : 'rss',
        sourceMode: match.kind,
      });
    }
  }
  return items;
}

function arrayFromMetadata(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => compactText(item)).filter(Boolean);
  const text = compactText(value);
  return text ? [text] : [];
}

function youtubeHandleFromUrl(url: string) {
  const match = url.match(/youtube\.com\/@([^/?#]+)/i);
  return match ? `@${match[1]}` : null;
}

function youtubeChannelIdFromUrl(url: string, meta?: Record<string, unknown>) {
  const metaId = compactText(meta?.youtubeChannelId);
  if (/^UC[A-Za-z0-9_-]{20,}$/.test(metaId)) return metaId;
  const match = url.match(/youtube\.com\/channel\/(UC[A-Za-z0-9_-]+)/i);
  return match ? match[1] : null;
}

async function fetchYoutubeViaApi(channelUrl: string, meta?: Record<string, unknown>) {
  const apiKey = process.env.YOUTUBE_API_KEY || '';
  if (!apiKey) return [] as PodcastEpisodeCandidate[];
  try {
    let channelId = youtubeChannelIdFromUrl(channelUrl, meta);
    const handle = youtubeHandleFromUrl(channelUrl);
    if (!channelId && handle) {
      const channelRes = await fetch(
        `https://www.googleapis.com/youtube/v3/channels?part=contentDetails,snippet&forHandle=${encodeURIComponent(handle)}&key=${apiKey}`,
        { signal: AbortSignal.timeout(15_000) },
      );
      if (channelRes.ok) {
        const channelJson = await channelRes.json() as { items?: Array<{ id?: string }> };
        channelId = channelJson.items?.[0]?.id || null;
      }
    }
    if (!channelId) return [];
    const searchRes = await fetch(
      `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${encodeURIComponent(channelId)}&order=date&type=video&maxResults=10&key=${apiKey}`,
      { signal: AbortSignal.timeout(15_000) },
    );
    if (!searchRes.ok) return [];
    const searchJson = await searchRes.json() as {
      items?: Array<{ id?: { videoId?: string }; snippet?: { title?: string; description?: string; publishedAt?: string } }>;
    };
    return (searchJson.items || [])
      .map((item): PodcastEpisodeCandidate | null => {
        const videoId = item.id?.videoId || '';
        const title = decodeXmlText(item.snippet?.title || '');
        if (!videoId || !title) return null;
        return {
          title,
          link: `https://www.youtube.com/watch?v=${videoId}`,
          pubDate: safeDateString(item.snippet?.publishedAt || ''),
          audioUrl: null,
          description: decodeXmlText(item.snippet?.description || ''),
          platform: 'youtube',
          sourceMode: 'youtube_data_api',
        };
      })
      .filter((item): item is PodcastEpisodeCandidate => Boolean(item));
  } catch {
    return [];
  }
}

async function fetchYoutubeViaRss(channelUrl: string, meta?: Record<string, unknown>) {
  const channelId = youtubeChannelIdFromUrl(channelUrl, meta);
  if (!channelId) return [] as PodcastEpisodeCandidate[];
  try {
    const xml = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' },
      signal: AbortSignal.timeout(15_000),
    }).then((res) => (res.ok ? res.text() : ''));
    if (!xml) return [];
    return parseRssItems(xml).map((item) => ({ ...item, platform: 'youtube' as const, sourceMode: item.sourceMode || 'youtube_rss' }));
  } catch {
    return [];
  }
}

async function fetchYoutubePlaylist(channelUrl: string, meta?: Record<string, unknown>) {
  const apiItems = await fetchYoutubeViaApi(channelUrl, meta);
  if (apiItems.length > 0) return apiItems;
  const rssItems = await fetchYoutubeViaRss(channelUrl, meta);
  if (rssItems.length > 0) return rssItems;
  try {
    const html = await fetch(channelUrl, { headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' }, signal: AbortSignal.timeout(15_000) }).then((res) => res.text());
    const videoIds = unique(Array.from(html.matchAll(/"videoId":"([A-Za-z0-9_-]{11})"/g)).map((m) => m[1])).slice(0, 10);
    const titles = Array.from(html.matchAll(/"title":\{"runs":\[\{"text":"([^"]+)"/g)).map((m) => compactText(m[1])).slice(0, 10);
    return videoIds.map((id, i) => ({
      title: decodeXmlText(titles[i] || `Episode ${i + 1}`),
      link: `https://www.youtube.com/watch?v=${id}`,
      pubDate: null,
      audioUrl: null,
      description: null,
      platform: 'youtube' as const,
      sourceMode: 'youtube_html',
    }));
  } catch {
    return [];
  }
}

function applePodcastIdFromUrl(url: string) {
  const match = url.match(/\/id(\d+)/);
  return match ? match[1] : null;
}

async function fetchApplePodcastRssItems(appleUrl: string) {
  const podcastId = applePodcastIdFromUrl(appleUrl);
  if (!podcastId) return [] as PodcastEpisodeCandidate[];
  try {
    const lookupRes = await fetch(`https://itunes.apple.com/lookup?id=${encodeURIComponent(podcastId)}`, {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!lookupRes.ok) return [];
    const lookupJson = await lookupRes.json() as { results?: Array<{ feedUrl?: string }> };
    const feedUrl = lookupJson.results?.[0]?.feedUrl || '';
    if (!feedUrl) return [];
    const xml = await fetch(feedUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' },
      signal: AbortSignal.timeout(12_000),
    }).then((res) => (res.ok ? res.text() : ''));
    return parseRssItems(xml).map((item) => ({ ...item, platform: 'apple_podcast' as const, sourceMode: 'apple_lookup_feed' }));
  } catch {
    return [];
  }
}

async function fetchExplicitRssItems(rssUrl: string) {
  try {
    const xml = await fetch(rssUrl, {
      headers: { 'user-agent': 'Mozilla/5.0 StockInsiderBot/1.0' },
      signal: AbortSignal.timeout(12_000),
    }).then((res) => (res.ok ? res.text() : ''));
    return parseRssItems(xml).map((item) => ({ ...item, platform: 'rss' as const, sourceMode: 'explicit_rss' }));
  } catch {
    return [] as PodcastEpisodeCandidate[];
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
  await ensureDefaultKolProfiles();
  const podcastRunId = await startConnectorRun('podcast-sync', 'podcast', { source: 'kol_profiles' });
  try {
    const { data: kolData, error: kolError } = await supabase.from('kol_profiles').select('*').eq('discovery_state', 'approved');
    if (kolError) throw new Error(kolError.message);
    const kols = (kolData as Row[]) || [];

    let totalEpisodes = 0;
    let weakSignalsWritten = 0;
    const platformsUsed = new Set<string>();
    const searchedKeywords = unique([
      ...KOL_SEEDS.map((seed) => seed.displayName),
      '台股 KOL',
      'Podcast',
      'CPU',
      'MLCC',
      '成熟製程',
      '消費性電子',
    ]);
    const kolBreakdown: Array<{
      kol: string;
      searchedUrls: string[];
      episodesFound: number;
      youtubeEpisodes: number;
      weakSignalsWritten: number;
      transcriptsReady: number;
      failureReason: string | null;
    }> = [];
    const failureReasonByKol: Record<string, string> = {};
    const matchedSymbols = new Set<string>();

    for (const kol of kols) {
      const meta = (kol.metadata || {}) as Record<string, unknown>;
      const kolId = String(kol.id);
      const sourceEntityId = kol.source_entity_id ? String(kol.source_entity_id) : null;
      const kolName = String(kol.display_name || meta.podcastName || 'KOL');
      const searchedUrls: string[] = [];

      const episodeItems: PodcastEpisodeCandidate[] = [];

      const podcastName = String(meta.podcastName || String(kol.display_name || ''));
      const explicitRssUrls = arrayFromMetadata(meta.rssUrl).concat(arrayFromMetadata(meta.rssUrls));
      for (const rssUrl of unique(explicitRssUrls)) {
        searchedUrls.push(rssUrl);
        const rssItems = await fetchExplicitRssItems(rssUrl);
        if (rssItems.length > 0) {
          platformsUsed.add('rss');
          episodeItems.push(...rssItems);
        }
      }

      const uniqueEpisodes = Array.from(new Map(episodeItems.map((item) => [`${item.platform}::${item.link}`, item] as const)).values()).slice(0, 10);
      let kolWeakSignals = 0;
      for (const ep of uniqueEpisodes) {
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
            metadata: {
              synced_by: 'runPodcastSync',
              kol_name: kolName,
              source_mode: ep.sourceMode || null,
              description: ep.description || null,
            },
            updated_at: nowIso(),
          },
          { onConflict: 'platform,episode_url' },
        );
        if (error && !String(error.message).includes('duplicate')) throw new Error(error.message);
        totalEpisodes += 1;

        const weakText = compactText(`${ep.title}。${ep.description || ''}`);
        const weakInsights = extractPodcastInsights(weakText);
        for (const symbol of weakInsights.symbols) matchedSymbols.add(symbol);
        if (weakInsights.symbols.length > 0) {
          const docsWritten = await upsertSourceRawDocuments([{
            sourceEntityId,
            platform: 'podcast',
            documentUrl: ep.link,
            title: `[KOL影音弱訊號] ${kolName}: ${ep.title}`,
            summary: weakText.slice(0, 600),
            contentText: weakText.slice(0, 3000),
            publishedAt: ep.pubDate,
            symbols: weakInsights.symbols,
            sentimentLabel: weakInsights.thesis.length > 0 ? 'bullish' : weakInsights.risks.length > 0 ? 'bearish' : 'neutral',
            confidence: 0.34,
            metadata: {
              connector: 'podcast_sync',
              evidence_class: 'kol_av_weak_signal',
              kol_name: kolName,
              weak_signal_only: true,
              source_mode: ep.sourceMode || null,
              license_basis: 'creator_published_rss',
            },
          }]);
          weakSignalsWritten += docsWritten;
          kolWeakSignals += docsWritten;
        }
      }

      const failureReason =
        uniqueEpisodes.length > 0
          ? null
          : searchedUrls.length === 0
            ? 'missing_creator_rss_endpoint'
            : 'no_recent_episode_found';
      if (failureReason) failureReasonByKol[kolName] = failureReason;
      kolBreakdown.push({
        kol: kolName,
        searchedUrls,
        episodesFound: uniqueEpisodes.length,
        youtubeEpisodes: 0,
        weakSignalsWritten: kolWeakSignals,
        transcriptsReady: 0,
        failureReason,
      });
    }

    const recordsWritten = totalEpisodes + weakSignalsWritten;
    await finishConnectorRun(podcastRunId, recordsWritten > 0 ? 'success' : 'partial', recordsWritten, {
      error_summary: recordsWritten > 0 ? null : 'no_creator_authorized_rss_episodes_found',
      metadata: {
        searched_keywords: searchedKeywords,
        searched_targets: searchedKeywords,
        platforms: Array.from(platformsUsed),
        episodes_found: totalEpisodes,
        youtube_episodes: 0,
        weak_signals_written: weakSignalsWritten,
        matched_symbols: Array.from(matchedSymbols),
        kol_breakdown: kolBreakdown,
        failure_reason_by_kol: failureReasonByKol,
        youtube_retired: true,
      },
    });

    return {
      runId: podcastRunId,
      dryRun,
      recordsWritten,
      episodesFound: totalEpisodes,
      weakSignalsWritten,
      platforms: Array.from(platformsUsed),
      kolBreakdown,
    };
  } catch (error) {
    const message = (error as Error).message;
    await finishConnectorRun(podcastRunId, 'failed', 0, { error_summary: message });
    throw error;
  }
}

export async function runPodcastTranscribe(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, transcribed: 0, unavailable: 0, failed: 0 };

  return {
    runId: randomUUID(),
    dryRun,
    transcribed: 0,
    unavailable: 0,
    failed: 0,
    terminalReason: 'manual_authorized_transcript_required',
  };

  /* Retired 2026-08-30: YouTube caption/audio transcription is intentionally inert.
     Only manually supplied or creator-authorized transcripts may be processed.
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
        platform: platform === 'youtube' ? 'youtube' : 'podcast',
        documentUrl: epUrl,
        title: `[Podcast] ${podcastName}: ${episodeTitle}`,
        summary: transcriptResult.text.slice(0, 600),
        contentText: transcriptResult.text.slice(0, 8000),
        publishedAt: ep.published_at ? String(ep.published_at) : null,
        symbols: insights.symbols,
        sentimentLabel: insights.thesis.length > 0 ? 'bullish' : 'neutral',
        confidence: 0.6,
        metadata: {
          connector: 'podcast_transcript',
          evidence_class: 'kol_av_transcript_signal',
          weak_signal_only: false,
          video_id: videoId,
          lang: transcriptResult.lang,
          source: transcriptSource,
          kol_name: podcastName,
        },
      }]);

      transcribed += 1;
    } catch (err) {
      await supabase.from('podcast_episodes').update({ transcript_status: 'failed', metadata: { error: (err as Error).message }, updated_at: nowIso() }).eq('id', epId);
      failed += 1;
    }
  }

  return { runId: randomUUID(), dryRun, transcribed, unavailable, failed };
  */
}

// ────────────────────────────────────────────────
// Earnings Call / 法說會 Ingest
// ────────────────────────────────────────────────

type OfficialDisclosureRow = {
  symbol: string;
  title: string;
  description: string;
  eventTimestamp: string;
  sourceUrl: string;
  market: 'TWSE' | 'TPEx';
};

async function fetchOfficialDisclosureRows(): Promise<OfficialDisclosureRow[]> {
  const sources = [
    { market: 'TWSE' as const, url: 'https://openapi.twse.com.tw/v1/opendata/t187ap04_L' },
    { market: 'TPEx' as const, url: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap04_O' },
  ];
  const responses = await Promise.all(sources.map(async (source) => {
    const response = await fetch(source.url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error(`${source.market.toLowerCase()}_material_information_http_${response.status}`);
    return { source, rows: await response.json() as Row[] };
  }));
  return responses.flatMap(({ source, rows }) => rows.flatMap((row) => {
    const symbol = compactText(row['公司代號'] || row.SecuritiesCompanyCode).toUpperCase();
    const title = compactText(row['主旨 '] || row['主旨']);
    const description = compactText(row['說明']);
    const eventTimestamp = parseRocDateToIso(row['發言日期'] || row.Date) || nowIso();
    if (!/^\d{4}$/u.test(symbol) || !title) return [];
    return [{ symbol, title, description, eventTimestamp, sourceUrl: source.url, market: source.market }];
  }));
}

function disclosureTone(text: string): 'bullish' | 'cautious' | 'neutral' {
  if (/看好|成長|展望正面|樂觀|上修|超預期|擴產|增資/u.test(text)) return 'bullish';
  if (/謹慎|下修|保守|衰退|風險|挑戰|虧損|減資/u.test(text)) return 'cautious';
  return 'neutral';
}

export async function runEarningsCallIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, transcriptsIngested: 0, errors: 0, terminalReason: 'successful_empty' };
  const supabase = getSupabaseServerClient();
  const [{ data: stocksData, error: stocksError }, disclosures] = await Promise.all([
    supabase.from('stocks').select('id,symbol').eq('market', 'TW'),
    fetchOfficialDisclosureRows(),
  ]);
  if (stocksError) throw new Error(stocksError.message);
  const stockIds = new Map(((stocksData as Row[]) || []).map((row) => [String(row.symbol || ''), String(row.id || '')]));
  const calls = disclosures.filter((row) => /法說|法人說明會|業績說明會/u.test(`${row.title} ${row.description}`));
  let transcriptsIngested = 0;
  for (const call of calls) {
    const stockId = stockIds.get(call.symbol);
    if (!stockId) continue;
    const { error } = await supabase.from('conference_transcripts').upsert({
      stock_id: stockId,
      event_name: call.title.slice(0, 200),
      transcript_excerpt: (call.description || call.title).slice(0, 2000),
      source_url: call.sourceUrl,
      event_timestamp: call.eventTimestamp,
      management_tone: disclosureTone(`${call.title} ${call.description}`),
      catalyst_mentions: ['官方法說公告', call.market],
    }, { onConflict: 'stock_id,event_name,event_timestamp' });
    if (error) throw new Error(error.message);
    transcriptsIngested += 1;
  }
  return { runId: randomUUID(), dryRun, transcriptsIngested, errors: 0,
    terminalReason: transcriptsIngested > 0 ? 'success' : 'successful_empty', source: 'TWSE_TPEx_OpenAPI' };
}

// ────────────────────────────────────────────────
// MOPS 重大訊息公告 Ingest
// ────────────────────────────────────────────────

export async function runMopsFilingIngest(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  if (dryRun) return { runId: randomUUID(), dryRun, filingsIngested: 0, errors: 0, terminalReason: 'successful_empty' };
  const supabase = getSupabaseServerClient();
  const [{ data: stocksData, error: stocksError }, disclosures] = await Promise.all([
    supabase.from('stocks').select('id,symbol').eq('market', 'TW'),
    fetchOfficialDisclosureRows(),
  ]);
  if (stocksError) throw new Error(stocksError.message);
  const stockIds = new Map(((stocksData as Row[]) || []).map((row) => [String(row.symbol || ''), String(row.id || '')]));
  let filingsIngested = 0;
  for (const disclosure of disclosures) {
    const stockId = stockIds.get(disclosure.symbol);
    if (!stockId) continue;
    const { error } = await supabase.from('conference_transcripts').upsert({
      stock_id: stockId,
      event_name: `[MOPS] ${disclosure.title.slice(0, 190)}`,
      transcript_excerpt: (disclosure.description || disclosure.title).slice(0, 2000),
      source_url: disclosure.sourceUrl,
      event_timestamp: disclosure.eventTimestamp,
      management_tone: disclosureTone(`${disclosure.title} ${disclosure.description}`),
      catalyst_mentions: ['官方重大訊息', disclosure.market],
    }, { onConflict: 'stock_id,event_name,event_timestamp' });
    if (error) throw new Error(error.message);
    filingsIngested += 1;
  }
  return { runId: randomUUID(), dryRun, filingsIngested, errors: 0,
    terminalReason: filingsIngested > 0 ? 'success' : 'successful_empty', source: 'TWSE_TPEx_OpenAPI' };
}
