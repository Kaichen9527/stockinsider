import { createHash } from 'node:crypto';

export type BullTalkLicensedRow = {
  title: string;
  sourceUrl: string;
  symbols: string[];
  publishedAt: string | null;
  stance: 'bullish' | 'bearish' | 'neutral';
  mentionCount: number;
  commentCount: number;
  engagementCount: number;
  rank: number;
};

function compact(value: unknown): string {
  return String(value ?? '').replace(/\s+/gu, ' ').trim();
}

function boundedCount(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 0;
}

function parseCsvRecords(input: string): Record<string, string>[] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character === '"') {
      if (quoted && input[index + 1] === '"') {
        field += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === ',' && !quoted) {
      row.push(field);
      field = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && input[index + 1] === '\n') index += 1;
      row.push(field);
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (quoted) throw new Error('bulltalk_csv_unclosed_quote');
  row.push(field);
  if (row.some((value) => value.length > 0)) records.push(row);
  const header = (records.shift() || []).map((value) => compact(value).toLowerCase());
  if (header.length === 0 || new Set(header).size !== header.length) throw new Error('bulltalk_csv_invalid_header');
  return records.map((values) => Object.fromEntries(header.map((key, index) => [key, values[index] || ''])));
}

function normalizeRow(raw: Record<string, unknown>): BullTalkLicensedRow | null {
  const title = compact(raw.title || raw.name || raw.summary);
  const sourceUrl = compact(raw.url || raw.document_url || raw.source_url);
  const symbols = [...new Set((Array.isArray(raw.symbols) ? raw.symbols.map(String) : compact(raw.symbols || raw.symbol).split(/[|;\s]+/u))
    .map((value) => value.toUpperCase()).filter((value) => /^\d{4}$/u.test(value)))];
  if (!title || !/^https:\/\//u.test(sourceUrl) || symbols.length === 0) return null;
  const sentiment = compact(raw.stance || raw.sentiment).toLowerCase();
  return {
    title: title.slice(0, 500),
    sourceUrl,
    symbols,
    publishedAt: raw.published_at || raw.publishedAt ? compact(raw.published_at || raw.publishedAt) : null,
    stance: ['bullish', 'positive'].includes(sentiment) ? 'bullish'
      : ['bearish', 'negative'].includes(sentiment) ? 'bearish' : 'neutral',
    mentionCount: boundedCount(raw.mention_count || raw.mentions),
    commentCount: boundedCount(raw.comment_count || raw.comments),
    engagementCount: boundedCount(raw.engagement_count || raw.engagement),
    rank: boundedCount(raw.rank),
  };
}

export function parseLicensedBullTalkFeed(contentType: string, body: string): BullTalkLicensedRow[] {
  if (Buffer.byteLength(body, 'utf8') > 5_000_000) throw new Error('bulltalk_feed_too_large');
  const normalizedType = contentType.split(';')[0].trim().toLowerCase();
  let rows: Record<string, unknown>[];
  if (normalizedType === 'application/json' || normalizedType.endsWith('+json')) {
    const payload = JSON.parse(body) as unknown;
    const candidate = Array.isArray(payload) ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as { data?: unknown }).data)
        ? (payload as { data: unknown[] }).data : [];
    rows = candidate.filter((value): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value)));
  } else if (normalizedType === 'text/csv' || normalizedType === 'application/csv' || normalizedType === 'application/vnd.ms-excel') {
    rows = parseCsvRecords(body);
  } else {
    throw new Error('bulltalk_feed_content_type_not_licensed');
  }
  return rows.slice(0, 500).map(normalizeRow).filter((value): value is BullTalkLicensedRow => value !== null);
}

export function bullTalkLicenseReadiness(environment: Record<string, string | undefined> = process.env): {
  ready: boolean;
  reason: string | null;
  feedUrl: string | null;
  licenseScopeRef: string | null;
  sampleSha256: string | null;
} {
  const feedUrl = compact(environment.BULLTALK_AUTHORIZED_FEED_URL) || null;
  const licenseScopeRef = compact(environment.BULLTALK_LICENSE_SCOPE_REF) || null;
  const sampleSha256 = compact(environment.BULLTALK_REAL_SAMPLE_SHA256).toLowerCase() || null;
  if (environment.BULLTALK_LICENSED !== 'true') return { ready: false, reason: 'bulltalk_signed_license_missing', feedUrl, licenseScopeRef, sampleSha256 };
  if (!licenseScopeRef) return { ready: false, reason: 'bulltalk_license_scope_ref_missing', feedUrl, licenseScopeRef, sampleSha256 };
  if (!sampleSha256 || !/^[0-9a-f]{64}$/u.test(sampleSha256)) return { ready: false, reason: 'bulltalk_real_sample_sha256_missing', feedUrl, licenseScopeRef, sampleSha256 };
  if (!feedUrl) return { ready: false, reason: 'bulltalk_authorized_feed_missing', feedUrl, licenseScopeRef, sampleSha256 };
  try {
    if (new URL(feedUrl).protocol !== 'https:') throw new Error('not_https');
  } catch {
    return { ready: false, reason: 'bulltalk_authorized_feed_requires_https', feedUrl, licenseScopeRef, sampleSha256 };
  }
  return { ready: true, reason: null, feedUrl, licenseScopeRef, sampleSha256 };
}

export function sha256Text(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
