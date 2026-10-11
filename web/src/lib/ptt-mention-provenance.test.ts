import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { buildPttMentionProvenance } from './ptt-mention-provenance.ts';
const parent = 'https://www.ptt.cc/bbs/Stock/M.1791737000.A.123.html';
const metadata = () => ({ source_surface: 'ptt_stock_push', parent_document_url: parent,
  author_name: 'reader1', comment_index: 1, comment_tag: '推', evidence_excerpt: '2409 尚待查證',
  matched_symbols: ['2409'], matched_symbol_reason: 'comment_local_tw_symbol_or_name_proximity',
  body_read_status: 'body_read_bounded', retention_mode: 'metadata_local_excerpt', reply_sample_truncated: true });
const reply = (changes = {}) => buildPttMentionProvenance({ platform: 'ptt', documentUrl: parent + '#push-1', symbol: '2409', metadata: { ...metadata(), ...changes } })!;
test('reply retains bounded local lineage and exact excerpt hash without independent authority', () => {
  const value = reply(); assert.equal(value.parent_document_url, parent); assert.equal(value.comment_index, 1);
  assert.equal(value.author_name, 'reader1'); assert.equal(value.stock_local_match_basis_retained, true);
  assert.equal(value.evidence_excerpt_sha256, createHash('sha256').update('2409 尚待查證').digest('hex'));
  assert.equal(value.replies_read_completeness, 'partial'); assert.equal(value.independent_confirmation, false);
  assert.equal(value.independent_root_resolved, false); assert.equal(value.cross_platform_identity_resolved, false);
});
test('article keeps no body or pooled reply evidence', () => {
  const value = buildPttMentionProvenance({ platform: 'ptt', documentUrl: parent, symbol: '2409', metadata: {
    source_surface: 'ptt_stock_board', author_name: 'writer', body_read_status: 'body_read_bounded',
    retention_mode: 'metadata_link_only', matched_symbols: ['2409'], matched_symbol_reason: 'tw_symbol_or_name_proximity',
    evidence_excerpt: 'do not export post', comment_evidence: [{ author: 'reader', excerpt: '2409' }] } })!;
  assert.equal(value.kind, 'article'); assert.equal(value.evidence_excerpt, null); assert.equal(value.body_retained, false);
  assert.equal(value.parent_document_url, null); assert.equal(value.stock_local_match_basis_retained, true);
});
for (const key of ['parent_document_url', 'author_name', 'comment_index']) test(`missing ${key} stays partial`, () => {
  const value = reply({ [key]: undefined }); assert.equal(value.evidence_completeness, 'partial'); assert.equal(value.stock_local_match_basis_retained, false);
});
test('same article authors remain local observations, never separate news roots', () => {
  const values = ['a', 'b', 'c'].map(author_name => reply({ author_name }));
  assert.equal(new Set(values.map(x => x.author_name)).size, 3);
  assert.equal(new Set(values.map(x => x.parent_document_url)).size, 1);
  assert.ok(values.every(x => !x.parent_is_independent_news_root && !x.independent_confirmation));
});
test('non PTT metadata is not projected', () => assert.equal(buildPttMentionProvenance({ platform: 'threads', documentUrl: parent, symbol: '2409', metadata: metadata() }), null));
test('stock-specific matched symbols do not inherit article or other stock context', () => {
  assert.equal(reply({ matched_symbols: ['2383'] }).stock_local_match_basis_retained, false);
  assert.equal(reply({ matched_symbol_reason: 'tw_symbol_or_name_proximity' }).stock_local_match_basis_retained, false);
  assert.equal(reply({ matched_symbols: undefined, push_count: 1000 }).stock_local_match_basis_retained, false);
});
for (const status of ['title_only_fetch_failed', 'title_only_body_missing', undefined]) test(`${status || 'unknown'} body read cannot prove full text or local body basis`, () => {
  const value = reply({ body_read_status: status }); assert.equal(value.stock_local_match_basis_retained, false);
  assert.equal(value.evidence_completeness, 'partial'); assert.equal(value.body_retained, false);
});
test('malicious metadata never copies fulltext, credentials or overbound excerpt', () => {
  const value = reply({ evidence_excerpt: 'x'.repeat(241), author_name: 'x'.repeat(129), comment_index: 100001,
    matched_symbols: Array(13).fill('2409'), secret: 'synthetic-secret-probe', fulltext: 'x'.repeat(10000) });
  assert.equal(value.evidence_excerpt, null); assert.equal(value.evidence_excerpt_sha256, null);
  assert.equal(value.author_name, null); assert.equal(value.comment_index, null); assert.deepEqual(value.matched_symbols, []);
  assert.doesNotMatch(JSON.stringify(value), /synthetic-secret-probe|fulltext/); assert.ok(Buffer.byteLength(JSON.stringify(value)) < 4096);
});
test('getters and prototype inheritance cannot supply authority', () => {
  let reads = 0; const m = { ...metadata() }; Object.defineProperty(m, 'author_name', { get() { reads++; return 'hidden'; } });
  const value = buildPttMentionProvenance({ platform: 'ptt', documentUrl: parent + '#push-1', symbol: '2409', metadata: m })!;
  assert.equal(reads, 0); assert.equal(value.author_name, null); assert.equal(value.stock_local_match_basis_retained, false);
});
test('foreign parent, invalid URL and index mismatch reject local linkage', () => {
  for (const changes of [{ parent_document_url: 'https://evil.example/bbs/Stock/M.1.html' },
    { parent_document_url: parent.replace('123', '456') }, { comment_index: 2 }, { comment_index: '1' }])
    assert.equal(reply(changes).stock_local_match_basis_retained, false);
});
test('metadata-only retention cannot export even a small reply excerpt', () => assert.equal(reply({ retention_mode: 'metadata_link_only' }).evidence_excerpt, null));
test('invalid stock symbol is bounded, cannot be serialized as arbitrary metadata', () => {
  const value = buildPttMentionProvenance({ platform: 'ptt', documentUrl: parent, symbol: 'x'.repeat(10000), metadata: metadata() })!;
  assert.equal(value.mention_symbol, null); assert.equal(value.stock_local_match_basis_retained, false);
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 4096);
});
test('exact240 UTF-16 excerpt bound preserves Unicode bytes; plus1 is omitted', () => {
  const value = reply({ evidence_excerpt: '友'.repeat(240) }); assert.equal(value.evidence_excerpt?.length, 240);
  assert.equal(value.evidence_excerpt_sha256, createHash('sha256').update('友'.repeat(240)).digest('hex'));
  assert.equal(reply({ evidence_excerpt: '友'.repeat(241) }).evidence_excerpt, null);
});
