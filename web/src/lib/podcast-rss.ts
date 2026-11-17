import { createHash } from 'node:crypto';

export const PODCAST_NAMESPACE = 'https://podcastindex.org/namespace/1.0';

const INVEST_J_THINGS_CHANNEL = 'UCXB8cCqwOHP3BmyhYLAUs0g';
const YOUTUBE_ORIGIN = 'https://www.youtube.com';
export const INVEST_J_THINGS_FEED = YOUTUBE_ORIGIN + '/feeds/videos.xml?channel_id=' + INVEST_J_THINGS_CHANNEL;
export const INVEST_J_THINGS_PROGRAM = '投資 J 件事';
export const INVEST_J_THINGS_AUTHOR = '林睿閎';
export const INVEST_J_THINGS_PROFILE = 'https://t.me/johnstock888';
export const INVEST_J_THINGS_FEED_LIMIT_BYTES = 262_144;

export type PodcastArtifactReference = {
  url: string;
  type: string;
  language: string | null;
  utf8Sha256?: string;
};

export type PodcastNamespaceEpisode = {
  title: string;
  link: string;
  guid: string;
  publishedAt: string | null;
  audioUrl: string | null;
  description: string | null;
  transcript: PodcastArtifactReference | null;
  transcripts: PodcastArtifactReference[];
  chapters: PodcastArtifactReference | null;
};

export type TimedPodcastSegment = { startSeconds: number; endSeconds: number | null; text: string };

export function derivePodcastLedgerSemantics(input: {
  episodesIndexed: number;
  analyzableEpisodes: number;
  validMatches: number;
}) {
  return {
    indexUpdated: input.episodesIndexed > 0,
    contentAnalyzable: input.analyzableEpisodes > 0,
    validMatches: Math.max(0, Math.floor(input.validMatches)),
  };
}

function decodeXml(value: string): string {
  return value.replace(/<!\[CDATA\[|\]\]>/gu, '')
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&quot;/gu, '"')
    .replace(/&#39;/gu, "'").replace(/&amp;/gu, '&').replace(/\s+/gu, ' ').trim();
}

function attribute(source: string, name: string): string | null {
  const match = new RegExp(`(?:^|\\s)${name}=["']([^"']+)["']`, 'iu').exec(source);
  return match ? decodeXml(match[1]) : null;
}

function element(source: string, names: string[]): string | null {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escaped}>`, 'iu').exec(source);
    if (match) return decodeXml(match[1]);
  }
  return null;
}

function approvedArtifactReference(attributes: string, withLanguage: boolean): PodcastArtifactReference | null {
  const url = attribute(attributes, 'url');
  const type = attribute(attributes, 'type');
  if (!url || !type) return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) return null;
  } catch {
    return null;
  }
  return { url, type: type.toLowerCase(), language: withLanguage ? attribute(attributes, 'language') : null };
}

export function parsePodcastNamespaceFeed(xml: string): PodcastNamespaceEpisode[] {
  if (Buffer.byteLength(xml, 'utf8') > 8_000_000) throw new Error('podcast_feed_too_large');
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw new Error('podcast_feed_unsafe_xml');
  const prefixes = [...xml.matchAll(/xmlns:([A-Za-z_][\w.-]*)=["']([^"']+)["']/gu)]
    .filter((match) => match[2] === PODCAST_NAMESPACE || match[2] === 'https://github.com/Podcastindex-org/podcast-namespace/blob/main/docs/1.0.md')
    .map((match) => match[1]);
  const namespacePrefixes = prefixes.length > 0 ? prefixes : [];
  const itemMatches = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu)].slice(0, 20);
  return itemMatches.flatMap((match) => {
    const body = match[1];
    const title = element(body, ['title']);
    const rawLink = element(body, ['link']) || attribute((/<link\b([^>]*)\/?\s*>/iu.exec(body) || [])[1] || '', 'href');
    const guid = element(body, ['guid']) || rawLink;
    if (!title || !rawLink || !guid) return [];
    const namespacedTag = (tag: string) => {
      for (const prefix of namespacePrefixes) {
        const found = new RegExp(`<${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:${tag}\\b([^>]*)\/?\\s*>`, 'iu').exec(body);
        if (found) return found[1];
      }
      return null;
    };
    const transcripts = [...body.matchAll(/<([A-Za-z_][\w.-]*):transcript\b([^>]*)\/?\s*>/gu)]
      .filter(match => namespacePrefixes.includes(match[1]))
      .map(match => approvedArtifactReference(match[2], true))
      .filter((reference): reference is PodcastArtifactReference => reference !== null);
    const chapterAttrs = namespacedTag('chapters');
    const enclosureAttrs = (/<enclosure\b([^>]*)\/?\s*>/iu.exec(body) || [])[1] || '';
    return [{
      title,
      link: decodeXml(rawLink),
      guid: decodeXml(guid),
      publishedAt: element(body, ['pubDate', 'published', 'updated']),
      audioUrl: attribute(enclosureAttrs, 'url'),
      description: element(body, ['description', 'summary', 'itunes:summary']),
      transcript: transcripts[0] ?? null,
      transcripts,
      chapters: chapterAttrs ? approvedArtifactReference(chapterAttrs, false) : null,
    }];
  });
}

/** Use YouTube only to verify the creator's original episode identity and date.
 * The channel mixes programs. Only an explicitly registered episode can enter
 * this feed, and captions are supplied independently by the rightsholder. */
export function parseInvestJThingsFeed(xml: string, registeredTracks: ReadonlyMap<string, PodcastArtifactReference>) {
  if (Buffer.byteLength(xml, 'utf8') > INVEST_J_THINGS_FEED_LIMIT_BYTES) throw Error('podcast_feed_too_large');
  if (/<!DOCTYPE|<!ENTITY/iu.test(xml)) throw Error('podcast_feed_unsafe_xml');
  const feed = /^(?:<\?xml[^>]*\?>\s*)?<feed\s([^>]*)>([\s\S]*)<\/feed>\s*$/u.exec(xml.trim());
  if (!feed || attribute(feed[1], 'xmlns') !== 'http://www.w3.org/2005/Atom'
    || attribute(feed[1], 'xmlns:yt') !== 'http://www.youtube.com/xml/schemas/2015') {
    throw Error('invest_j_things_feed_invalid');
  }
  const [, , body] = feed;
  const header = body.split(/<entry\s*>/u, 1)[0];
  const feedChannel = element(header, ['yt:channelId']);
  if (feedChannel !== INVEST_J_THINGS_CHANNEL && feedChannel !== INVEST_J_THINGS_CHANNEL.slice(2)) {
    throw Error('invest_j_things_channel_mismatch');
  }
  const entries = [...body.matchAll(/<entry\s*>([\s\S]*?)<\/entry>/gu)];
  if (entries.length > 20) throw Error('invest_j_things_feed_invalid');
  const episodes = new Map<string, { title: string; link: string; publishedAt: string }>();
  for (const [, entry] of entries) {
    const id = element(entry, ['yt:videoId']);
    if (!id || !/^[A-Za-z0-9_-]{11}$/u.test(id)) continue;
    const link = YOUTUBE_ORIGIN + '/watch?v=' + id;
    if (!registeredTracks.has(podcastTranscriptTrackKey(INVEST_J_THINGS_FEED, link))) continue;
    const alternate = [...entry.matchAll(/<link\s([^>]*)\/?>/gu)]
      .filter((match) => attribute(match[1], 'rel') === 'alternate');
    const href = alternate.length === 1 ? attribute(alternate[0][1], 'href') : null;
    if (element(entry, ['yt:channelId']) !== INVEST_J_THINGS_CHANNEL
      || element(entry, ['id']) !== 'yt:video:' + id
      || (href !== link && href !== YOUTUBE_ORIGIN + '/shorts/' + id)) continue;
    const title = element(entry, ['title']);
    const date = element(entry, ['published']);
    if (!title || /請\s*支\s*援\s*輸\s*贏/u.test(title.normalize('NFKC')) || !date
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/u.test(date)) continue;
    const time = Date.parse(date);
    if (!Number.isFinite(time)) continue;
    if (episodes.has(id)) throw Error('invest_j_things_duplicate_episode');
    episodes.set(id, { title, link, publishedAt: new Date(time).toISOString() });
  }
  return [...episodes.values()];
}

function mediaType(value: string) {
  return value.split(';')[0].trim().toLowerCase();
}

function parseClock(value: string, isVtt: boolean): number {
  const match = isVtt
    ? /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/u.exec(value)
    : /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/u.exec(value);
  if (!match) throw Error('podcast_transcript_cue_invalid');
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

function timedTranscriptType(mimeType: string) {
  return ['text/vtt', 'application/x-subrip', 'application/srt', 'application/json'].includes(mediaType(mimeType));
}

export function parsePublisherTranscript(type: string, body: string): TimedPodcastSegment[] {
  if (Buffer.byteLength(body, 'utf8') > 2_000_000) throw Error('podcast_transcript_too_large');
  const normalizedType = mediaType(type);
  if (!timedTranscriptType(type)) throw Error('podcast_transcript_type_not_supported');
  const segments = normalizedType === 'application/json' ? jsonTranscript(body) : captionTranscript(body, normalizedType === 'text/vtt');
  if (segments.length > 5000) throw Error('podcast_transcript_too_many_cues');
  let previous = 0;
  for (const cue of segments) {
    if (!Number.isFinite(cue.startSeconds) || cue.startSeconds < previous || !Number.isFinite(cue.endSeconds)
      || cue.endSeconds === null || cue.endSeconds <= cue.startSeconds || !cue.text) throw Error('podcast_transcript_cue_invalid');
    previous = cue.startSeconds;
  }
  return segments;
}

function jsonTranscript(body: string): TimedPodcastSegment[] {
  const value = JSON.parse(body) as unknown;
  const rows = Array.isArray(value) ? value
    : value && typeof value === 'object' && 'segments' in value && Array.isArray(value.segments) ? value.segments : null;
  if (!rows) throw Error('podcast_transcript_cue_invalid');
  if (rows.length > 5000) throw Error('podcast_transcript_too_many_cues');
  return rows.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw Error('podcast_transcript_cue_invalid');
    const row = raw as Record<string, unknown>;
    const startSeconds = row.startTime ?? row.start ?? row.start_seconds;
    const endSeconds = row.endTime ?? row.end ?? row.end_seconds;
    const text = row.body ?? row.text;
    if (typeof startSeconds !== 'number' || typeof endSeconds !== 'number' || typeof text !== 'string') {
      throw Error('podcast_transcript_cue_invalid');
    }
    return { startSeconds, endSeconds, text: decodeXml(text.replace(/<[^>]+>/gu, '')) };
  });
}

function captionTranscript(body: string, isVtt: boolean): TimedPodcastSegment[] {
  const blocks = body.replace(/^\uFEFF/u, '').replace(/\r\n?/gu, '\n').trimEnd().split(/\n[ \t]*\n+/u);
  if (isVtt) {
    const header = blocks.shift() ?? '';
    if (!/^WEBVTT(?:[ \t][^\n]*)?(?:\n|$)/u.test(header) || header.includes('-->')) throw Error('podcast_transcript_header_invalid');
  }
  const segments: TimedPodcastSegment[] = [];
  for (const block of blocks) {
    if (!block.trim() || isVtt && /^(?:NOTE(?:[ \t]|\n|$)|STYLE(?:\n|$)|REGION(?:\n|$))/u.test(block)) continue;
    if (segments.length === 5000) throw Error('podcast_transcript_too_many_cues');
    const lines = block.split('\n');
    const timingIndex = lines[0].includes('-->') ? 0 : 1;
    const timing = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+[^\n]*)?$/u.exec(lines[timingIndex]?.trim() ?? '');
    if (!timing) throw Error('podcast_transcript_cue_invalid');
    segments.push({
      startSeconds: parseClock(timing[1], isVtt), endSeconds: parseClock(timing[2], isVtt),
      text: decodeXml(lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/gu, '')),
    });
  }
  return segments;
}

/** Register approved sidecar tracks without treating an index entry as speech.
 * Keyed to both the allowlisted feed and its exact public episode link. */
export function configuredPodcastTranscriptTracks(input: string | undefined, allowedFeeds: ReadonlySet<string>) {
  const tracks = new Map<string, PodcastArtifactReference>();
  if (!input) return tracks;
  if (Buffer.byteLength(input, 'utf8') > 32_768) throw Error('podcast_transcript_registry_invalid');
  let rows: unknown;
  try { rows = JSON.parse(input); } catch { throw Error('podcast_transcript_registry_invalid'); }
  if (!Array.isArray(rows) || rows.length > 40) throw Error('podcast_transcript_registry_invalid');
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error('podcast_transcript_registry_invalid');
    const { feedUrl, episodeUrl, url, language, type, utf8Sha256 } = row;
    const john = feedUrl === INVEST_J_THINGS_FEED;
    const fields = john ? 'episodeUrl|feedUrl|language|program|type|url|utf8Sha256' : 'episodeUrl|feedUrl|language|type|url|utf8Sha256';
    if (Object.keys(row).sort().join('|') !== fields
      || !allowedFeeds.has(feedUrl) || !registeredPodcastUrl(episodeUrl) || !registeredPodcastUrl(url, true)
      || (john && (row.program !== INVEST_J_THINGS_PROGRAM
        || !/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/u.test(episodeUrl)))
      || typeof type !== 'string' || type !== mediaType(type) || !timedTranscriptType(type)
      || (language !== null && (typeof language !== 'string' || !/^[a-z]{2,3}(?:-[a-z0-9]{2,8}){0,3}$/iu.test(language)))
      || typeof utf8Sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(utf8Sha256)) {
      throw Error('podcast_transcript_registry_invalid');
    }
    const key = podcastTranscriptTrackKey(feedUrl, episodeUrl);
    if (tracks.has(key)) throw Error('podcast_transcript_registry_duplicate_episode');
    tracks.set(key, { url, type, language, utf8Sha256 });
  }
  return tracks;
}

function registeredPodcastUrl(value: unknown, forbidQuery = false): value is string {
  if (typeof value !== 'string' || value.length > 1024) return false;
  try {
    const url = new URL(value);
    return url.href === value && url.protocol === 'https:' && !url.username && !url.password
      && !url.hash && (!forbidQuery || !url.search);
  } catch { return false; }
}

export function podcastTranscriptTrackKey(feedUrl: string, episodeUrl: string) {
  return feedUrl + '\n' + episodeUrl;
}

type TranscriptResult =
  | { status: 'ready'; reference: PodcastArtifactReference; artifactHash: string; segments: TimedPodcastSegment[] }
  | { status: 'rights_required' | 'timed_transcript_missing' | 'timed_transcript_unavailable' };

export async function selectTimedPublisherTranscript(
  contentRights: boolean,
  references: readonly PodcastArtifactReference[],
  read: (reference: PodcastArtifactReference) => Promise<string>,
): Promise<TranscriptResult> {
  if (!contentRights) return { status: 'rights_required' };
  const candidates = [...new Map(references.filter(item => timedTranscriptType(item.type))
    .map(item => [item.url + '\n' + mediaType(item.type), item] as const)).values()].slice(0, 3);
  if (!candidates.length) return { status: 'timed_transcript_missing' };

  for (const reference of candidates) {
    try {
      const body = await read(reference);
      const artifactHash = createHash('sha256').update(body, 'utf8').digest('hex');
      if (reference.utf8Sha256 !== undefined && artifactHash !== reference.utf8Sha256) continue;
      const segments = parsePublisherTranscript(reference.type, body);
      if (segments.length) {
        return { status: 'ready', reference, segments, artifactHash };
      }
    } catch {
      // A malformed or unavailable timed track must not suppress another
      // approved rendition of the same episode or expose its raw URL.
    }
  }
  return { status: 'timed_transcript_unavailable' };
}

export function podcastStockCodes(text: string, validSymbols: ReadonlySet<string>): string[] {
  const normalized = text.normalize('NFKC');
  const stockCode = /(?<![a-z0-9_])(?:台股|股票(?:代號|代碼)?|股號|標的|ticker|TWSE|TPEX)\s*[:#]?\s*([1-9]\d{3})(?![a-z0-9_])/giu;
  const otherInstrument = /(?:指數|期貨|期指|選擇權|不是|並非|非)\s*$/u;
  const numericValue = /^\s*(?:[.,]\d|年|點|元|圓|倍|%|張|股(?!價))/u;
  const symbols = new Set<string>();
  for (const match of normalized.matchAll(stockCode)) {
    const symbol = match[1];
    if (!validSymbols.has(symbol)) continue;
    const start = match.index;
    const end = start + match[0].length;
    if (otherInstrument.test(normalized.slice(Math.max(0, start - 20), start))
      || numericValue.test(normalized.slice(end))) continue;
    symbols.add(symbol);
  }
  return [...symbols];
}

export function locatePodcastStockMentions(segments: readonly TimedPodcastSegment[], validSymbols: ReadonlySet<string>) {
  const found = new Map<string, { symbol: string; startSeconds: number; endSeconds: number }>();
  for (const segment of segments) {
    if (segment.endSeconds === null) continue;
    for (const symbol of podcastStockCodes(segment.text, validSymbols)) {
      if (!found.has(symbol)) found.set(symbol, { symbol, startSeconds: segment.startSeconds, endSeconds: segment.endSeconds });
      if (found.size === 20) return [...found.values()];
    }
  }
  return [...found.values()];
}

export function parsePublisherChapters(type: string, body: string): TimedPodcastSegment[] {
  if (type.split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('podcast_chapters_type_not_supported');
  if (Buffer.byteLength(body, 'utf8') > 1_000_000) throw new Error('podcast_chapters_too_large');
  const value = JSON.parse(body) as { chapters?: unknown };
  if (!Array.isArray(value.chapters)) return [];
  return value.chapters.flatMap((raw, index, rows) => {
    if (!raw || typeof raw !== 'object') return [];
    const row = raw as Record<string, unknown>;
    const startSeconds = Number(row.startTime);
    const next = rows[index + 1] as Record<string, unknown> | undefined;
    const text = String(row.title || '').replace(/\s+/gu, ' ').trim();
    return Number.isFinite(startSeconds) && startSeconds >= 0 && text
      ? [{ startSeconds, endSeconds: next && Number.isFinite(Number(next.startTime)) ? Number(next.startTime) : null, text }] : [];
  }).slice(0, 1000);
}
