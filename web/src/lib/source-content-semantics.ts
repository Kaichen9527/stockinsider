export type SourceContentSemantics =
  | 'editorial_discussion'
  | 'bulk_institutional_ranking'
  | 'official_chip_evidence'
  | 'metadata_only';

export function candidateMentionDiscoveryEligible(provenance: unknown): boolean {
  if (!provenance || typeof provenance !== 'object' || Array.isArray(provenance)) return true;
  const record = provenance as Record<string, unknown>;
  return record.discovery_eligible !== false && record.invalidated !== true;
}

const BULK_INSTITUTIONAL_PATTERNS = [
  /外資.*(?:買超|賣超).*(?:排行|前\s*\d+|TOP\s*\d+)/iu,
  /投信.*(?:買超|賣超).*(?:排行|前\s*\d+|TOP\s*\d+)/iu,
  /三大法人.*(?:買超|賣超|合計|排行)/iu,
  /(?:買超|賣超).*前\s*(?:10|20|30|50)/iu,
  /(?:ETF|法人).*成分股.*(?:調整|排行)/iu,
] as const;

export function classifyPttContentSemantics(title: string, text = ''): SourceContentSemantics {
  const normalized = `${title}\n${text}`.replace(/\s+/gu, ' ').trim();
  return BULK_INSTITUTIONAL_PATTERNS.some((pattern) => pattern.test(normalized))
    ? 'bulk_institutional_ranking'
    : 'editorial_discussion';
}

export function publisherKeyFor(input: {
  platform: string;
  author?: string | null;
  sourceUrl?: string | null;
  sourceName?: string | null;
}) {
  const platform = input.platform.trim().toLowerCase() || 'unknown';
  const author = input.author?.trim().toLowerCase().replace(/^@/u, '');
  if (author) return `${platform}:author:${author}`;
  try {
    const host = new URL(input.sourceUrl || '').hostname.toLowerCase().replace(/^www\./u, '');
    if (host) return `${platform}:publisher:${host}`;
  } catch {
    // Fall through to the declared source name.
  }
  const name = input.sourceName?.trim().toLowerCase();
  return `${platform}:publisher:${name || platform}`;
}

export function roundRobinSourceLinks<T extends { platform: string }>(items: T[], perPlatform = 2, total = 8): T[] {
  const queues = new Map<string, T[]>();
  for (const item of items) {
    const key = item.platform || 'unknown';
    const queue = queues.get(key) || [];
    if (queue.length < perPlatform) queue.push(item);
    queues.set(key, queue);
  }
  const result: T[] = [];
  while (result.length < total && [...queues.values()].some((queue) => queue.length > 0)) {
    for (const queue of queues.values()) {
      const next = queue.shift();
      if (next) result.push(next);
      if (result.length >= total) break;
    }
  }
  return result;
}

export function sourceConcentration(input: Array<{ platform: string; publisherKey: string; contentHash: string }>) {
  const unique = new Map(input.map((item) => [item.contentHash, item]));
  const rows = [...unique.values()];
  const platformCounts = new Map<string, number>();
  for (const row of rows) platformCounts.set(row.platform, (platformCounts.get(row.platform) || 0) + 1);
  const dominant = Math.max(0, ...platformCounts.values());
  return {
    rawMentions: input.length,
    effectiveMentions: rows.length,
    publisherCount: new Set(rows.map((row) => row.publisherKey)).size,
    platformCount: platformCounts.size,
    dominantPlatformShare: rows.length ? dominant / rows.length : 0,
  };
}

export function relativeDiscussionBurst(recentCount: number, prior28DayCount: number) {
  if (recentCount <= 0) return 0;
  if (prior28DayCount <= 0) return Math.min(50, recentCount * 10);
  const recentDaily = recentCount / 7;
  const priorDaily = prior28DayCount / 28;
  return Math.min(100, Math.max(0, (recentDaily / priorDaily - 1) * 50 + 50));
}

export function platformDiscoveryCap(platformCount: number) {
  if (platformCount <= 1) return 60;
  if (platformCount === 2) return 85;
  return 100;
}
