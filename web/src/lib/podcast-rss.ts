export const PODCAST_NAMESPACE = 'https://podcastindex.org/namespace/1.0';

export type PodcastArtifactReference = {
  url: string;
  type: string;
  language: string | null;
};

export type PodcastNamespaceEpisode = {
  title: string;
  link: string;
  guid: string;
  publishedAt: string | null;
  audioUrl: string | null;
  description: string | null;
  transcript: PodcastArtifactReference | null;
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
    const transcriptAttrs = namespacedTag('transcript');
    const chapterAttrs = namespacedTag('chapters');
    const enclosureAttrs = (/<enclosure\b([^>]*)\/?\s*>/iu.exec(body) || [])[1] || '';
    return [{
      title,
      link: decodeXml(rawLink),
      guid: decodeXml(guid),
      publishedAt: element(body, ['pubDate', 'published', 'updated']),
      audioUrl: attribute(enclosureAttrs, 'url'),
      description: element(body, ['description', 'summary', 'itunes:summary']),
      transcript: transcriptAttrs ? approvedArtifactReference(transcriptAttrs, true) : null,
      chapters: chapterAttrs ? approvedArtifactReference(chapterAttrs, false) : null,
    }];
  });
}

function parseClock(value: string): number | null {
  const parts = value.trim().replace(',', '.').split(':').map(Number);
  if (parts.some((part) => !Number.isFinite(part)) || parts.length < 2 || parts.length > 3) return null;
  const seconds = parts.length === 3 ? parts[0] * 3600 + parts[1] * 60 + parts[2] : parts[0] * 60 + parts[1];
  return seconds >= 0 ? seconds : null;
}

export function parsePublisherTranscript(type: string, body: string): TimedPodcastSegment[] {
  if (Buffer.byteLength(body, 'utf8') > 2_000_000) throw new Error('podcast_transcript_too_large');
  const normalizedType = type.split(';')[0].trim().toLowerCase();
  if (normalizedType === 'text/vtt' || normalizedType === 'application/x-subrip' || normalizedType === 'application/srt') {
    return body.split(/\r?\n\r?\n/gu).flatMap((block) => {
      const lines = block.split(/\r?\n/gu).map((line) => line.trim()).filter(Boolean);
      const timingIndex = lines.findIndex((line) => line.includes('-->'));
      if (timingIndex < 0) return [];
      const [rawStart, rawEnd] = lines[timingIndex].split('-->').map((value) => value.trim().split(/\s/u)[0]);
      const startSeconds = parseClock(rawStart);
      const endSeconds = parseClock(rawEnd);
      const text = lines.slice(timingIndex + 1).join(' ').replace(/<[^>]+>/gu, '').trim();
      return startSeconds === null || !text ? [] : [{ startSeconds, endSeconds, text }];
    }).slice(0, 5000);
  }
  if (normalizedType === 'application/json') {
    const value = JSON.parse(body) as unknown;
    const rows = Array.isArray(value) ? value
      : value && typeof value === 'object' && Array.isArray((value as { segments?: unknown }).segments)
        ? (value as { segments: unknown[] }).segments : [];
    return rows.flatMap((raw) => {
      if (!raw || typeof raw !== 'object') return [];
      const row = raw as Record<string, unknown>;
      const startSeconds = Number(row.startTime ?? row.start ?? row.start_seconds);
      const endValue = row.endTime ?? row.end ?? row.end_seconds;
      const endSeconds = endValue == null ? null : Number(endValue);
      const text = String(row.body ?? row.text ?? row.title ?? '').replace(/\s+/gu, ' ').trim();
      return Number.isFinite(startSeconds) && startSeconds >= 0 && text
        ? [{ startSeconds, endSeconds: Number.isFinite(endSeconds) ? endSeconds : null, text }] : [];
    }).slice(0, 5000);
  }
  if (normalizedType === 'text/plain' || normalizedType === 'text/html') {
    const text = (normalizedType === 'text/html' ? body.replace(/<[^>]+>/gu, ' ') : body).replace(/\s+/gu, ' ').trim();
    return text ? [{ startSeconds: 0, endSeconds: null, text }] : [];
  }
  throw new Error('podcast_transcript_type_not_supported');
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
