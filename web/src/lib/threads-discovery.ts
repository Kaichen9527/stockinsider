export type ThreadsDiscoveryPost = { id: string; username: string; text: string; symbols: string[]; publishedAt: string | null };

export function mergeThreadsRunMetadata(existing: Record<string, unknown>, next: Record<string, unknown>) {
  if(existing.token_hash && next.token_hash && existing.token_hash!==next.token_hash) throw new Error('threads_token_changed_during_run');
  return {...existing,...next};
}

export function normalizeThreadsAuthor(value: string) {
  const author = value.trim().replace(/^@/u, '').toLowerCase();
  return /^[a-z0-9_.]{1,64}$/u.test(author) ? author : null;
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
