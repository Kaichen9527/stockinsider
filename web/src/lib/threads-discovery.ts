export type ThreadsDiscoveryPost = { id: string; username: string; text: string; symbols: string[]; publishedAt: string | null };

const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const PUBLIC_SEARCH_CANARY_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

type ThreadsPublicSearchCanary = {
  observedAt?: unknown;
  selfUsernameHash?: unknown;
  publicPostIdHash?: unknown;
  queryHash?: unknown;
  tokenHash?: unknown;
};

export type ThreadsReadiness = {
  publicSearchVerified: boolean;
  zeroRowStreak: number;
  reason: string | null;
};

function boundedCount(value: unknown): number {
  const count = Number(value);
  return Number.isInteger(count) && count >= 0 ? Math.min(count, 10_000) : 0;
}

/**
 * One hash-bound readiness rule is shared by the scheduler guard and the
 * operator endpoint. A successful `/me` request or an HTTP 200 with no public
 * rows is deliberately insufficient.
 */
export function evaluateThreadsReadiness(
  metadata: Record<string, unknown>,
  credentialStatus: string | null,
  nowMs = Date.now(),
): ThreadsReadiness {
  const tokenHash = typeof metadata.token_hash === 'string' ? metadata.token_hash : '';
  const expiresAt = typeof metadata.expires_at === 'string' ? Date.parse(metadata.expires_at) : Number.NaN;
  const receipt = metadata.non_self_public_search_canary as ThreadsPublicSearchCanary | null | undefined;
  const observedAt = typeof receipt?.observedAt === 'string' ? Date.parse(receipt.observedAt) : Number.NaN;
  const receiptHashesValid = SHA256_PATTERN.test(String(receipt?.selfUsernameHash || ''))
    && SHA256_PATTERN.test(String(receipt?.publicPostIdHash || ''))
    && SHA256_PATTERN.test(String(receipt?.queryHash || ''));
  const zeroRowStreak = boundedCount(metadata.public_search_zero_row_streak);
  if (credentialStatus !== 'valid') return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_credential_not_valid' };
  if (!SHA256_PATTERN.test(tokenHash)) return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_token_hash_missing' };
  if (!Number.isFinite(expiresAt) || expiresAt <= nowMs) return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_token_expired' };
  if (!receipt) return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_public_search_canary_missing' };
  if (receipt.tokenHash !== tokenHash) return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_canary_token_hash_mismatch' };
  if (!receiptHashesValid) return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_canary_evidence_invalid' };
  if (!Number.isFinite(observedAt) || observedAt > nowMs || nowMs - observedAt > PUBLIC_SEARCH_CANARY_MAX_AGE_MS) {
    return { publicSearchVerified: false, zeroRowStreak, reason: 'threads_canary_stale' };
  }
  return { publicSearchVerified: true, zeroRowStreak, reason: null };
}

export function mergeThreadsRunMetadata(existing: Record<string, unknown>, next: Record<string, unknown>) {
  if(existing.token_hash && next.token_hash && existing.token_hash!==next.token_hash) throw new Error('threads_token_changed_during_run');
  const tokenHash = String(next.token_hash || existing.token_hash || '');
  const nextReceipt = (next.non_self_public_search_canary || existing.non_self_public_search_canary) as ThreadsPublicSearchCanary | null | undefined;
  if (nextReceipt?.tokenHash && nextReceipt.tokenHash !== tokenHash) throw new Error('threads_canary_token_hash_mismatch');
  const merged = {...existing,...next};
  if (Object.hasOwn(next, 'public_search_result_count')) {
    const resultCount = boundedCount(next.public_search_result_count);
    merged.public_search_zero_row_streak = resultCount === 0
      ? boundedCount(existing.public_search_zero_row_streak) + 1
      : 0;
  }
  const readiness = evaluateThreadsReadiness(merged, 'valid');
  merged.public_search_verified = readiness.publicSearchVerified;
  merged.public_search_readiness_reason = readiness.reason;
  return merged;
}

export function normalizeThreadsAuthor(value: string) {
  const author = value.trim().replace(/^@/u, '').toLowerCase();
  return /^[a-z0-9_.]{1,64}$/u.test(author) ? author : null;
}

export function normalizeThreadsPermalink(value: string): string | null {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password
      || !['threads.com', 'www.threads.com', 'threads.net', 'www.threads.net'].includes(host)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeThreadsCursor(value: unknown): string | null {
  const cursor = typeof value === 'string' ? value.trim() : '';
  return /^[A-Za-z0-9_-]{1,512}$/u.test(cursor) ? cursor : null;
}

export function threadsMarketQueries(configured: string[] = []) {
  return [...new Set(['股票', '台股', '財報', '籌碼', '產業輪動', '法說會', '目標價', ...configured]
    .map(value => value.trim()).filter(value => value.length >= 2 && value.length <= 80))].slice(0, 12);
}

/** Discovery evidence, not an investment-performance or author reliability score. */
export function summarizeThreadsAuthors(posts: ThreadsDiscoveryPost[], tracked: Set<string>) {
  const authors = new Map<string, { ids: Set<string>; symbols: Set<string>; evidencePosts: number; latestAt: string | null }>();
  for (const post of posts) {
    const username = normalizeThreadsAuthor(post.username);
    if (!username || !post.id || post.symbols.length === 0) continue;
    const row = authors.get(username) || { ids: new Set<string>(), symbols: new Set<string>(), evidencePosts: 0, latestAt: null };
    if (row.ids.has(post.id)) continue;
    row.ids.add(post.id);
    post.symbols.forEach(symbol => row.symbols.add(symbol));
    // A textual research cue is explicitly not a verified official citation.
    if (/EPS|本益比|毛利|營收|現金流|法說|財報|估值/iu.test(post.text)) row.evidencePosts++;
    if (post.publishedAt && Number.isFinite(Date.parse(post.publishedAt)) && (!row.latestAt || post.publishedAt > row.latestAt)) row.latestAt = post.publishedAt;
    authors.set(username, row);
  }
  return [...authors].map(([username,row]) => ({ username, tracked: tracked.has(username),
    uniquePosts: row.ids.size, symbols: [...row.symbols].sort(), researchCuePosts: row.evidencePosts,
    latestPostAt: row.latestAt, assessment: 'discovery_only_unverified' as const,
  })).sort((a,b) => b.researchCuePosts-a.researchCuePosts || b.uniquePosts-a.uniquePosts || a.username.localeCompare(b.username));
}
