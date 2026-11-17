import type { PodcastMentionView } from './types.ts';
import { authorizedPodcastRssAllowlist, podcastContentAnalyzable } from './source-policy.ts';

type Row = Record<string, unknown>;
type Locator = { symbol: string; startSeconds: number; endSeconds: number };

function object(value: unknown): Row | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}

function publicEpisodeUrl(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) return null;
    if (!url.search) return url.href;
    const params = [...url.searchParams.entries()];
    if (params.length !== 1) return null;
    const [[key, id]] = params;
    const youtube = url.origin === 'https://www.youtube.com' && url.pathname === '/watch'
      && key === 'v' && /^[\w-]{11}$/u.test(id);
    const apple = url.origin === 'https://podcasts.apple.com' && key === 'i' && /^\d{1,20}$/u.test(id);
    return youtube || apple ? url.href : null;
  } catch {
    return null;
  }
}

function publicPodcastEvidence(row: Row) {
  const metadata = object(row.metadata);
  if (row.platform !== 'podcast'
    || metadata?.connector !== 'podcast_sync'
    || metadata.spoken_locator_version !== 'podcast-spoken-locator-v1'
    || metadata.license_basis !== 'recorded_creator_content_rights'
    || metadata.content_source !== 'publisher_transcript'
    || metadata.content_analyzable !== true
    || typeof metadata.rss_url !== 'string'
    || !podcastContentAnalyzable(metadata.rss_url)
    || !authorizedPodcastRssAllowlist().includes(metadata.rss_url)
    || metadata.weak_signal_only !== true
    || !Array.isArray(metadata.spoken_stock_mentions)
    || metadata.spoken_stock_mentions.length > 20
    || !Array.isArray(row.symbols)
    || typeof row.published_at !== 'string'
    || !Number.isFinite(Date.parse(row.published_at))) return null;
  const episodeUrl = publicEpisodeUrl(row.document_url);
  if (!episodeUrl) return null;
  const symbols = new Set(row.symbols);
  const locators: Locator[] = [];
  for (const value of metadata.spoken_stock_mentions) {
    const locator = object(value);
    if (!locator
      || typeof locator.symbol !== 'string' || !/^[1-9]\d{3}$/u.test(locator.symbol) || !symbols.has(locator.symbol)
      || typeof locator.startSeconds !== 'number' || !Number.isFinite(locator.startSeconds) || locator.startSeconds < 0
      || typeof locator.endSeconds !== 'number' || !Number.isFinite(locator.endSeconds) || locator.endSeconds <= locator.startSeconds
      || locators.some(previous => previous.symbol === locator.symbol)) return null;
    locators.push({ symbol: locator.symbol, startSeconds: locator.startSeconds, endSeconds: locator.endSeconds });
  }
  if (!locators.length) return null;
  return { episodeUrl, publishedAt: row.published_at, locators };
}

function spokenPosition({ symbol, startSeconds, endSeconds }: Locator): string {
  return `股票代號 ${symbol}，${startSeconds}–${endSeconds} 秒`;
}

export function publicPodcastMention(row: Row, symbol: string): PodcastMentionView | null {
  const evidence = publicPodcastEvidence(row);
  const locator = evidence?.locators.find(item => item.symbol === symbol);
  if (!evidence || !locator) return null;
  return {
    podcastName: 'Podcast',
    episodeTitle: '口述定位',
    platform: 'rss',
    episodeUrl: evidence.episodeUrl,
    publishedAt: evidence.publishedAt,
    transcriptStatus: 'ready',
    excerpt: spokenPosition(locator),
    thesisHighlights: [],
    riskHighlights: [],
  };
}

export function projectPublicPodcastSource(row: Row): Row | null {
  const metadata = object(row.metadata);
  // Historical YouTube transcription rows belong to the retired connector.
  if (row.platform === 'youtube' && (
    metadata?.connector === 'podcast_transcript'
    || metadata?.connector === 'podcast_sync'
    || metadata?.evidence_class === 'kol_av_transcript_signal'
  )) return null;
  if (row.platform !== 'podcast') return row;
  const evidence = publicPodcastEvidence(row);
  if (!evidence) return null;
  return {
    id: row.id,
    platform: 'podcast',
    title: 'Podcast 口述定位',
    summary: evidence.locators.map(spokenPosition).join('。'),
    symbols: evidence.locators.map(locator => locator.symbol),
    document_url: evidence.episodeUrl,
    published_at: evidence.publishedAt,
    collected_at: row.collected_at,
    source_entity_id: row.source_entity_id,
    confidence: row.confidence,
    metadata: {
      connector: 'podcast_sync',
      evidence_class: 'kol_av_transcript_signal',
      weak_signal_only: true,
    },
  };
}
