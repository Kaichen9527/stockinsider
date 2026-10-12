import { createHash } from 'node:crypto';
import { admitDiscoveryCandidate, type DiscoveryEvidence } from './candidate-discovery-admission.ts';

/** Reads legacy mention rows, not eight display links. No identity authority is
 * supplied by this table: publisher keys, hashes and URLs never become roots. */
export const LIVE_DISCOVERY_ADAPTER = 'legacy-mention-evidence-audit-v1';
export const LIVE_DISCOVERY_BOUNDS = Object.freeze({ rows: 512, rowBytes: 8192, inputBytes: 1048576 });
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu.test(v);
const platforms = new Set(['official', 'news', 'broker', 'ptt', 'threads', 'instagram', 'facebook', 'investanchors', 'telegram', 'youtube', 'podcast', 'bulltalk']);
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const own = (v: unknown, k: string): unknown => record(v) ? Object.getOwnPropertyDescriptor(v, k)?.value : undefined;
const text = (v: unknown, n: number): string | null => typeof v === 'string' && v.length > 0 && v.length <= n ? v : null;
// Preserve microseconds. These are database availability clocks, NOT inferred
// publisher instants or a proof that a historical snapshot was known then.
function instant(v: unknown): bigint | null {
  if (typeof v !== 'string') return null;
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}:\d{2})$/u.exec(v);
  if (!m) return null;
  const ms = Date.parse(`${m[1]}T${m[2]}${m[4]}`);
  if (!Number.isFinite(ms) || new Date(`${m[1]}T00:00:00Z`).toISOString().slice(0, 10) !== m[1]) return null;
  return BigInt(ms) * BigInt(1000) + BigInt((m[3] || '').padEnd(6, '0'));
}
export type LiveDiscoveryEvidenceSummary = {
  adapter: string; status: 'unsupported'; sourceCutoff: string; windowStart: string;
  inputRows: number; accountedRows: number; examinedRows: number; excludedRows: number;
  explicitPttAuthorsMax: number; gaps: string[]; evidenceComplete: false;
  schedulingIntegrated: false; investmentQualified: false;
};

export function adaptLegacyDiscoveryEvidence(input: {
  symbol: string; stockId: string; rows: readonly unknown[];
  since: string; asOf: string; rowsComplete: boolean;
}) {
  const end = instant(input.asOf), start = instant(input.since);
  if (!/^\d{4}$/u.test(input.symbol) || !uuid(input.stockId) || end === null || start === null || start > end
    || !Array.isArray(input.rows)) throw new Error('live_discovery_scope_invalid');
  const gaps = new Set(['canonical_publisher_identity_missing', 'independent_news_root_missing',
    'raw_revision_head_and_withdrawal_binding_missing', 'mutable_rows_not_historical_snapshot']);
  if (input.rowsComplete !== true) gaps.add('mention_window_incomplete');
  const accounting: Array<{ rowId: string | null; disposition: string }> = [];
  const sources: DiscoveryEvidence['sources'] = [];
  const replies = new Map<string, Set<string>>();
  // Resolve a comment key over ALL received rows before counting authors.
  // Different row UUIDs (or repeated UUIDs) cannot make one comment two people.
  const commentKeys = new Map<string, { parent: string; author: string | null;
    fingerprint: string; conflict: boolean; blocked: boolean; rowIds: Set<string> }>();
  const knownRows = new Map<string, { fingerprint: string; conflict: boolean }>();
  let bytes = 0, bounded = input.rows.length <= LIVE_DISCOVERY_BOUNDS.rows;
  if (!bounded) gaps.add('mention_row_bound_exceeded');
  for (const row of bounded ? input.rows : []) {
    const id = own(row, 'id');
    const stock = own(row, 'stock_id'), platform = text(own(row, 'platform'), 32);
    const available = own(row, 'available_at'), received = own(row, 'created_at'), evaluation = own(row, 'as_of'), mentioned = own(row, 'mentioned_at');
    const provenance = own(row, 'provenance'), ptt = own(provenance, 'ptt');
    const view = { id: uuid(id) ? id : null, stock: uuid(stock) ? stock : null, platform,
      sourceUrl: text(own(row, 'source_url'), 512),
      available: text(available, 40), received: text(received, 40), evaluation: text(evaluation, 40), mentioned: text(mentioned, 40),
      ptt: { schema: text(own(ptt, 'schema'), 64), kind: text(own(ptt, 'kind'), 16),
        document: text(own(ptt, 'document_url'), 512), parent: text(own(ptt, 'parent_document_url'), 512),
        author: text(own(ptt, 'author_name'), 128), index: own(ptt, 'comment_index'),
        excerpt: text(own(ptt, 'evidence_excerpt'), 240), hash: text(own(ptt, 'evidence_excerpt_sha256'), 64) } };
    // Only bounded primitive values may enter the byte accounting. An object
    // pretending to be an index cannot invoke serialization hooks.
    if (typeof view.ptt.index !== 'number') view.ptt.index = null;
    const rowBytes = Buffer.byteLength(JSON.stringify(view), 'utf8'); bytes += rowBytes;
    if (rowBytes > LIVE_DISCOVERY_BOUNDS.rowBytes || bytes > LIVE_DISCOVERY_BOUNDS.inputBytes) {
      gaps.add('mention_byte_bound_exceeded'); bounded = false; break;
    }
    let reason = 'mapped_unresolved';
    const availableTime = instant(available), receivedTime = instant(received), evaluationTime = instant(evaluation), mentionedTime = instant(mentioned);
    if (!uuid(id) || stock !== input.stockId || !platform || !platforms.has(platform)
      || availableTime === null || receivedTime === null || evaluationTime === null || mentionedTime === null) reason = 'invalid_row_or_clock';
    else if (availableTime < start || availableTime > end || receivedTime > end || evaluationTime > end || mentionedTime > end) reason = 'outside_known_window';
    // Excluded clocks must never reserve a UUID or enter either conflict map.
    // Only in-cutoff, scope-valid records can assert a known row identity.
    else if (knownRows.has(id.toLowerCase())) reason = 'duplicate_row_identity';
    if (uuid(id) && ['mapped_unresolved', 'duplicate_row_identity'].includes(reason)) {
      const key = id.toLowerCase();
      const fingerprint = JSON.stringify([stock, platform, view.sourceUrl, view.ptt, own(provenance, 'retracted') === true]);
      const prior = knownRows.get(key);
      if (prior) prior.conflict ||= prior.fingerprint !== fingerprint;
      else knownRows.set(key, { fingerprint, conflict: false });
    }
    accounting.push({ rowId: uuid(id) ? id : null, disposition: reason });
    if (reason !== 'mapped_unresolved') gaps.add(reason);
    if (!['mapped_unresolved', 'duplicate_row_identity'].includes(reason)) continue;
    // This is a scoped mention-record ID, NOT a normalized source_document ID.
    // Even a non-null raw FK is not the approved revision/root authority.
    if (reason === 'mapped_unresolved') sources.push({ sourceId: `candidate-mention:${id}`, platform: platform!, publisherId: null, rootId: null,
      identityResolved: false, status: own(provenance, 'retracted') === true ? 'retracted' : 'current',
      kind: platform === 'official' ? 'official' : 'public', mentionedSymbols: [input.symbol] });
    if (platform !== 'ptt') continue;
    gaps.add('ptt_original_stock_bearing_body_missing');
    gaps.add('ptt_reply_and_parent_revision_heads_unverified');
    const parent = view.ptt.parent, doc = view.ptt.document, index = view.ptt.index, excerpt = view.ptt.excerpt;
    if (view.ptt.schema !== 'ptt-mention-provenance-v1' || view.ptt.kind !== 'reply'
      || !parent || !/^https:\/\/www\.ptt\.cc\/bbs\/Stock\/M\.[0-9]+\.A\.[A-Za-z0-9]+\.html$/u.test(parent)
      || !Number.isInteger(index) || Number(index) < 1 || Number(index) > 100000 || doc !== `${parent}#push-${index}`) continue;
    if (!view.sourceUrl || view.sourceUrl !== doc) { gaps.add('ptt_row_document_url_unbound'); continue; }
    const valid = own(provenance, 'retracted') !== true
      && !!view.ptt.author && view.ptt.author === view.ptt.author.trim() && !!excerpt
      && !(
      own(ptt, 'retention_mode') !== 'metadata_local_excerpt' || own(ptt, 'body_read_status') !== 'body_read_bounded'
      || own(ptt, 'stock_local_match_basis_retained') !== true || own(ptt, 'mention_symbol') !== input.symbol
      || own(ptt, 'matched_symbol_reason') !== 'comment_local_tw_symbol_or_name_proximity'
      || !Array.isArray(own(ptt, 'matched_symbols')) || (own(ptt, 'matched_symbols') as unknown[]).length > 12
      || !(own(ptt, 'matched_symbols') as unknown[]).includes(input.symbol)
      || view.ptt.hash !== createHash('sha256').update(excerpt!, 'utf8').digest('hex')
      || !new RegExp(`(?:^|[^0-9A-Za-z])${input.symbol}(?:$|[^0-9A-Za-z])`, 'u').test(excerpt!));
    const author = view.ptt.author?.toLowerCase() || null;
    const fingerprint = JSON.stringify([author, excerpt, view.ptt.hash]);
    const key = JSON.stringify([parent, index]), prior = commentKeys.get(key);
    if (prior) {
      prior.conflict ||= prior.fingerprint !== fingerprint;
      prior.blocked ||= !valid;
      prior.rowIds.add(view.id!.toLowerCase());
    } else commentKeys.set(key, { parent, author, fingerprint, conflict: false, blocked: !valid,
      rowIds: new Set([view.id!.toLowerCase()]) });
  }
  for (const item of accounting) {
    if (item.rowId && knownRows.get(item.rowId.toLowerCase())?.conflict
      && ['mapped_unresolved', 'duplicate_row_identity'].includes(item.disposition)) {
      item.disposition = 'conflicting_known_row_identity'; gaps.add('conflicting_known_row_identity');
    }
  }
  for (const item of commentKeys.values()) {
    if (item.conflict) gaps.add('ptt_comment_key_conflict');
    if (item.conflict || item.blocked || !item.author || [...item.rowIds].some(id => knownRows.get(id)?.conflict)) continue;
    const authors = replies.get(item.parent) || new Set<string>();
    authors.add(item.author); replies.set(item.parent, authors);
  }
  // Current legacy schema cannot establish complete source/root heads. Do not
  // fill in body from title/summary or use parent URL as an independent root.
  const knownSources = sources.filter(source => !knownRows.get(source.sourceId.slice('candidate-mention:'.length).toLowerCase())?.conflict);
  const evidence: DiscoveryEvidence = { complete: false, sources: bounded ? knownSources : [], pttArticles: null };
  const admission = admitDiscoveryCandidate(input.symbol, evidence);
  const summary: LiveDiscoveryEvidenceSummary = { adapter: LIVE_DISCOVERY_ADAPTER, status: 'unsupported',
    sourceCutoff: input.asOf, windowStart: input.since, inputRows: input.rows.length, accountedRows: input.rows.length,
    examinedRows: accounting.length, excludedRows: accounting.filter(r => r.disposition !== 'mapped_unresolved').length,
    explicitPttAuthorsMax: bounded ? Math.max(0, ...[...replies.values()].map(a => a.size)) : 0,
    gaps: [...gaps].sort(), evidenceComplete: false, schedulingIntegrated: false, investmentQualified: false };
  return { evidence, admission, summary, accounting, unexaminedRows: input.rows.length - accounting.length };
}
