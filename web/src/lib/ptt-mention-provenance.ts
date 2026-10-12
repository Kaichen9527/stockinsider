import { createHash } from 'node:crypto';

export type PttBodyReadStatus = 'body_read_bounded' | 'title_only_fetch_failed' | 'title_only_body_missing';

/** Only already retained public metadata. No body/title matching, root resolution,
 * cross-platform identity or admission authority is inferred here. */
export function buildPttMentionProvenance(input: {
  platform: string; documentUrl: string; symbol: string; metadata?: Record<string, unknown>;
}) {
  if (input.platform !== 'ptt') return null;
  const issues = new Set<string>();
  const field = (key: string): unknown => {
    const metadata = input.metadata;
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return undefined;
    const descriptor = Object.getOwnPropertyDescriptor(metadata, key);
    if (descriptor && !('value' in descriptor)) { issues.add('metadata_accessor_rejected'); return undefined; }
    return descriptor?.value;
  };
  const text = (value: unknown, limit: number): string | null => {
    if (value === undefined || value === null) return null;
    if (typeof value !== 'string' || value.length > limit || /[\u0000-\u001f\u007f]/u.test(value)) {
      issues.add('invalid_or_overbound_metadata'); return null;
    }
    return value.trim() || null;
  };
  const articleUrl = (value: unknown, allowReply: boolean): string | null => {
    const raw = text(value, 2048);
    if (!raw) return null;
    try {
      const url = new URL(raw);
      if (url.protocol !== 'https:' || !['www.ptt.cc', 'ptt.cc'].includes(url.hostname)
        || url.username || url.password || url.port || url.search
        || !/^\/bbs\/Stock\/[A-Za-z0-9._-]{1,100}\.html$/u.test(url.pathname)
        || (url.hash && (!allowReply || !/^#push-[1-9]\d{0,5}$/u.test(url.hash)))) throw new Error('url');
      return url.href;
    } catch { issues.add('invalid_ptt_url'); return null; }
  };
  const surface = field('source_surface');
  const reply = surface === 'ptt_stock_push' || (typeof input.documentUrl === 'string'
    && input.documentUrl.length <= 2048 && /#push-/u.test(input.documentUrl));
  const symbol = typeof input.symbol === 'string' && /^\d{4}$/u.test(input.symbol) ? input.symbol : null;
  if (!symbol) issues.add('invalid_mention_symbol');
  const documentUrl = articleUrl(input.documentUrl, reply);
  let parentUrl = reply ? articleUrl(field('parent_document_url'), false) : null;
  const author = text(field('author_name'), 128);
  const rawIndex = field('comment_index');
  const index = reply && typeof rawIndex === 'number' && Number.isSafeInteger(rawIndex)
    && rawIndex >= 1 && rawIndex <= 100_000 ? rawIndex : null;
  if (reply && (!parentUrl || !author || !index)) issues.add('reply_lineage_missing');
  if (reply && documentUrl && parentUrl && documentUrl.split('#')[0] !== parentUrl) {
    parentUrl = null; issues.add('reply_parent_mismatch');
  }
  if (reply && documentUrl && index && new URL(documentUrl).hash !== `#push-${index}`)
    issues.add('reply_index_mismatch');
  const rawSymbols = field('matched_symbols');
  const symbols = Array.isArray(rawSymbols) && rawSymbols.length <= 12
    && rawSymbols.every(value => typeof value === 'string' && /^\d{4}$/u.test(value))
    ? [...new Set(rawSymbols)] as string[] : [];
  if (rawSymbols !== undefined && symbols.length === 0) issues.add('symbol_basis_missing_or_invalid');
  const expectedBasis = reply ? 'comment_local_tw_symbol_or_name_proximity' : 'tw_symbol_or_name_proximity';
  const basis = field('matched_symbol_reason') === expectedBasis ? expectedBasis : null;
  const rawRead = field('body_read_status');
  const readStatus: PttBodyReadStatus | 'unknown' = rawRead === 'body_read_bounded'
    || rawRead === 'title_only_fetch_failed' || rawRead === 'title_only_body_missing' ? rawRead : 'unknown';
  // Never retain post text; reply excerpt must already be inside its existing
  // metadata_local_excerpt allowance. Invalid/oversized excerpts are omitted.
  const retention = field('retention_mode');
  const retentionMode = retention === 'metadata_link_only' || retention === 'metadata_local_excerpt' ? retention : 'unknown';
  if (retentionMode === 'unknown') issues.add('retention_basis_unknown');
  const excerpt = reply && retentionMode === 'metadata_local_excerpt' ? text(field('evidence_excerpt'), 240) : null;
  if (!basis || !symbol || !symbols.includes(symbol)) issues.add('stock_local_basis_missing');
  if (readStatus !== 'body_read_bounded') issues.add('body_read_incomplete');
  const localMatch = symbol !== null && symbols.includes(symbol) && basis !== null
    && readStatus === 'body_read_bounded' && documentUrl !== null
    && (!reply || (parentUrl !== null && author !== null && index !== null && !issues.has('reply_index_mismatch')));
  return {
    schema: 'ptt-mention-provenance-v1', kind: reply ? 'reply' : 'article',
    document_url_basis: reply ? 'collector_push_index_fragment' : 'public_article_url',
    document_url: documentUrl, parent_document_url: parentUrl,
    author_name: author, author_identity_scope: 'ptt_local_unresolved', cross_platform_identity_resolved: false,
    comment_index: index, comment_tag: reply ? text(field('comment_tag'), 8) : null,
    matched_symbols: symbols, mention_symbol: symbol, matched_symbol_reason: basis,
    stock_local_match_basis_retained: localMatch,
    evidence_excerpt: excerpt,
    evidence_excerpt_sha256: excerpt ? createHash('sha256').update(excerpt, 'utf8').digest('hex') : null,
    retention_mode: retentionMode, body_read_status: readStatus,
    body_retained: false, replies_read_completeness: 'partial',
    reply_sample_truncated: typeof field('reply_sample_truncated') === 'boolean' ? field('reply_sample_truncated') : null,
    evidence_completeness: localMatch && issues.size === 0 ? 'bounded_local_basis' : 'partial',
    parent_is_independent_news_root: false, independent_root_resolved: false,
    independent_confirmation: false, research_admission_evaluated: false,
    issues: [...issues],
  };
}
