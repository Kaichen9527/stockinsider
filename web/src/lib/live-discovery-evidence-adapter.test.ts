import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { adaptLegacyDiscoveryEvidence, LIVE_DISCOVERY_BOUNDS } from './live-discovery-evidence-adapter.ts';
import { buildPttMentionProvenance } from './ptt-mention-provenance.ts';
import { collectPagedAuthorityRows } from './candidate-research-policy.ts';
const stockId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const since = '2026-10-05T00:00:00.000000Z', asOf = '2026-10-12T00:00:00.123456Z';
const parent = 'https://www.ptt.cc/bbs/Stock/M.1791737000.A.123.html';
const id = (n: number) => `bbbbbbbb-bbbb-bbbb-bbbb-${String(n).padStart(12, '0')}`;
const row = (n = 1, more: Record<string, unknown> = {}) => ({ id: id(n), stock_id: stockId,
  platform: 'ptt', source_url: parent, as_of: since, created_at: since, available_at: since, mentioned_at: since, provenance: {}, ...more });
const adapt = (rows: unknown[], more = {}) => adaptLegacyDiscoveryEvidence({ symbol: '2409', stockId, rows, since, asOf, rowsComplete: true, ...more });
function reply(n: number, author = `author${n}`, excerpt = '我在回覆中提及2409', article = parent) {
  const ptt = buildPttMentionProvenance({ platform: 'ptt', documentUrl: `${article}#push-${n}`, symbol: '2409', metadata: {
    parent_document_url: article, author_name: author, comment_index: n, comment_tag: '推',
    evidence_excerpt: excerpt, matched_symbols: ['2409'], matched_symbol_reason: 'comment_local_tw_symbol_or_name_proximity',
    retention_mode: 'metadata_local_excerpt', body_read_status: 'body_read_bounded',
  } });
  return { ...row(n), source_url: `${article}#push-${n}`, provenance: { ptt } };
}
test('real retained provenance maps scoped row identity, never URL/hash/publisher authority', () => {
  const r = adapt([row(1, { publisher_key: 'ptt:A', independent_content_hash: 'a'.repeat(64), source_url: parent,
    source_document_id: id(99), provenance: { rootId: 'fake', identityResolved: true } })]);
  assert.equal(r.evidence.sources[0].sourceId, `candidate-mention:${id(1)}`);
  assert.equal(r.evidence.sources[0].publisherId, null); assert.equal(r.evidence.sources[0].rootId, null);
  assert.equal(r.evidence.sources[0].identityResolved, false); assert.equal(r.admission.status, 'unsupported');
});
test('20 retained code-explicit local authors remain unsupported without parent body/revision authority', () => {
  const r = adapt(Array.from({ length: 20 }, (_, i) => reply(i + 1)));
  assert.equal(r.summary.explicitPttAuthorsMax, 20); assert.equal(r.admission.status, 'unsupported');
  assert.equal(r.evidence.pttArticles, null); assert.equal(r.evidence.complete, false);
  assert.ok(r.summary.gaps.includes('ptt_original_stock_bearing_body_missing'));
});
test('authors are counted once within one conversation, never pooled across posts', () => {
  const r = adapt([...Array.from({ length: 10 }, (_, i) => reply(i + 1)),
    ...Array.from({ length: 10 }, (_, i) => reply(i + 11, `author${i}`, '2409', parent.replace('123', '456')))]);
  assert.equal(r.summary.explicitPttAuthorsMax, 10);
  assert.equal(adapt([reply(1, 'Alice'), reply(2, 'alice')]).summary.explicitPttAuthorsMax, 1);
});
for (const excerpt of ['👍👍👍', '推', '台積電', '12409', 'a2409', '2409x']) test(`non-explicit reply ${excerpt} does not count`, () => {
  assert.equal(adapt([reply(1, 'author', excerpt)]).summary.explicitPttAuthorsMax, 0);
});
test('hash mismatch, missing author/parent/index and read failure do not count', () => {
  for (const patch of [{ evidence_excerpt_sha256: '0'.repeat(64) }, { author_name: null },
    { parent_document_url: null }, { comment_index: null }, { body_read_status: 'title_only_fetch_failed' },
    { mention_symbol: '2383' }]) {
    const r = reply(1); Object.assign(r.provenance!.ptt!, patch);
    assert.equal(adapt([r]).summary.explicitPttAuthorsMax, 0);
  }
});
test('withheld/retracted mention never becomes active evidence; missing root heads block all admission', () => {
  const r = reply(1); Object.assign(r.provenance, { retracted: true });
  const a = adapt([r]); assert.equal(a.evidence.sources[0].status, 'retracted');
  assert.equal(a.summary.explicitPttAuthorsMax, 0); assert.equal(a.admission.status, 'unsupported');
  assert.ok(a.summary.gaps.includes('raw_revision_head_and_withdrawal_binding_missing'));
});
test('cutoff comparison preserves one microsecond and original clocks; later acquisition is excluded', () => {
  const a = adapt([row(1, { available_at: asOf }), row(2, { available_at: '2026-10-12T00:00:00.123457Z' })]);
  assert.equal(a.summary.excludedRows, 1); assert.equal(a.summary.sourceCutoff, asOf);
  assert.equal(a.accounting[1].disposition, 'outside_known_window');
});
test('backdated availability cannot admit a newly received row into an older observation', () => {
  const a = adapt([row(1, { created_at: '2026-10-12T00:00:00.123457Z' })]);
  assert.equal(a.summary.excludedRows, 1); assert.equal(a.evidence.sources.length, 0);
});
test('same instant offset notation, exact date validation and invalid clocks', () => {
  assert.equal(adapt([row(1, { available_at: '2026-10-12T08:00:00.123456+08:00' })]).summary.excludedRows, 0);
  assert.equal(adapt([row(1, { available_at: '2026-02-30T00:00:00Z' })]).summary.excludedRows, 1);
  assert.equal(adapt([row(1, { as_of: 'unknown' })]).summary.excludedRows, 1);
});
test('stable accounting retains duplicates, foreign stock and incomplete window as gaps', () => {
  const a = adapt([row(), row(), row(3, { stock_id: id(99) })], { rowsComplete: false });
  assert.equal(a.summary.inputRows, 3); assert.equal(a.summary.accountedRows, 3);
  assert.equal(a.summary.excludedRows, 2); assert.ok(a.summary.gaps.includes('mention_window_incomplete'));
});
test('bound exhaustion reports unexamined rows, never truncation-success', () => {
  const a = adapt(Array.from({ length: LIVE_DISCOVERY_BOUNDS.rows + 1 }, (_, i) => row(i + 1)));
  assert.equal(a.summary.examinedRows, 0); assert.equal(a.unexaminedRows, 513);
  assert.equal(a.summary.accountedRows, 513); assert.equal(a.evidence.sources.length, 0);
  assert.ok(a.summary.gaps.includes('mention_row_bound_exceeded'));
});
test('untrusted getters, prototype and object index cannot execute or acquire authority', () => {
  let reads = 0; const r = row(); Object.defineProperty(r, 'provenance', { get() { reads++; return {}; } });
  adapt([r]); assert.equal(reads, 0);
  assert.equal(adapt([Object.create(row())]).summary.excludedRows, 1);
  const p = reply(2); Object.assign(p.provenance!.ptt!, { comment_index: { toJSON() { throw Error('must not execute'); } } });
  assert.equal(adapt([p]).summary.explicitPttAuthorsMax, 0);
});
test('server real initializer audits complete pre-link rows rather than eight display sources', () => {
  const require = createRequire(import.meta.url), ts: typeof import('typescript') = require('../../node_modules/typescript');
  const src = readFileSync(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  const ast = ts.createSourceFile('candidate-research.ts', src, ts.ScriptTarget.Latest, true);
  let expression = '';
  function visit(n: import('typescript').Node) {
    if (ts.isVariableDeclaration(n) && n.name.getText(ast) === 'discoveryEvidenceAudit') expression = n.initializer!.getText(ast);
    ts.forEachChild(n, visit);
  }
  visit(ast); assert.ok(expression.includes('discoveryRowsByStock.get(stockId)'));
  const ctx = { exports: {} as { summary?: unknown }, adaptLegacyDiscoveryEvidence, stock: { symbol: '2409' }, stockId,
    cutoff: since, sourceCutoff: asOf, discoveryRowsByStock: new Map([[stockId, Array.from({ length: 21 }, (_, i) => reply(i + 1))]]) };
  const code = ts.transpileModule(`exports.summary = (${expression});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, ctx); assert.equal((ctx.exports.summary as { inputRows: number }).inputRows, 21);
  assert.ok((ctx.exports.summary as { gaps: string[] }).gaps.includes('mention_window_incomplete'));
  assert.match(src, /id,stock_id,source_document_id,as_of/);
  assert.match(src, /discoveryEvidenceAudit,\s*symbol:/);
});
test('missing or mismatched row URL cannot borrow retained document provenance', () => {
  for (const source_url of [undefined, parent, parent + '#push-2', 'https://other.example/post']) {
    assert.equal(adapt([{ ...reply(1), source_url }]).summary.explicitPttAuthorsMax, 0);
  }
});
test('two UUIDs claiming one comment with conflicting authors invalidate the whole key in both orders', () => {
  const a = reply(1, 'alice'), b = { ...reply(1, 'bob'), id: id(2) };
  for (const rows of [[a, b], [b, a]]) assert.equal(adapt(rows).summary.explicitPttAuthorsMax, 0);
});
test('conflicting text and correct hashes invalidate the whole key in both orders', () => {
  const a = reply(1, 'alice', '2409新消息'), b = { ...reply(1, 'alice', '2409不同消息'), id: id(2) };
  for (const rows of [[a, b], [b, a]]) assert.equal(adapt(rows).summary.explicitPttAuthorsMax, 0);
});
test('exact comment replay across UUIDs counts once, same author across keys still once', () => {
  const a = reply(1, 'alice'), b = { ...reply(1, 'alice'), id: id(2) };
  assert.equal(adapt([a, b, reply(3, 'alice')]).summary.explicitPttAuthorsMax, 1);
});
test('twenty authors containing one conflicting comment cannot be counted as twenty', () => {
  const a = Array.from({ length: 20 }, (_, i) => reply(i + 1));
  const b = { ...reply(1, 'another-author'), id: id(21) };
  for (const rows of [[...a, b], [b, ...a]]) {
    const r = adapt(rows); assert.equal(r.summary.explicitPttAuthorsMax, 19);
    assert.equal(r.admission.status, 'unsupported');
  }
});
test('same-row UUID conflict cannot hide behind row dedup', () => {
  const a = reply(1, 'alice'), b = reply(1, 'bob');
  for (const rows of [[a, b], [b, a]]) assert.equal(adapt(rows).summary.explicitPttAuthorsMax, 0);
});
test('actual page reader capped at100/request750 cannot prove total200 exhaustion', async () => {
  const all = Array.from({ length: 200 }, (_, i) => row(i + 1));
  const returned = await collectPagedAuthorityRows(async (from, to) => all.slice(from, Math.min(to + 1, from + 100)),
    { pageSize: 750, maxRows: 1000, requireComplete: true });
  assert.equal(returned.length, 100); // Existing reader is deliberately unchanged.
  const source = readFileSync(new URL('./candidate-research.ts', import.meta.url), 'utf8');
  assert.match(source, /since: cutoff, asOf: sourceCutoff, rowsComplete: false/);
  assert.ok(adapt(returned, { rowsComplete: false }).summary.gaps.includes('mention_window_incomplete'));
});
