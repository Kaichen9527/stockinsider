import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { buildPttMentionProvenance } from '../web/src/lib/ptt-mention-provenance.ts';
const require = createRequire(import.meta.url), ts = require('../web/node_modules/typescript');
// Only a fixed immutable baseline is selectable for the explicit red probe.
// The ordinary command always tests the current actual call boundary.
const source = process.env.PTT_PROVENANCE_TEST_SOURCE === 'main169'
  ? execFileSync('/usr/bin/git', ['show', '169aad1b6cfa747f78ae3464b614f43c0749d806:web/src/lib/research-v2.ts'], { encoding: 'utf8' })
  : readFileSync(new URL('../web/src/lib/research-v2.ts', import.meta.url), 'utf8');
const ast = ts.createSourceFile('research-v2.ts', source, ts.ScriptTarget.Latest, true);
function actual(name, bindings) {
  const fn = ast.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(fn, name);
  const code = ts.transpileModule(fn.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const context = { ...bindings, exports: {}, console };
  vm.runInNewContext(code + `\nexports.fn = ${name};`, context); return context.exports.fn;
}
const compactText = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const parent = 'https://www.ptt.cc/bbs/Stock/M.1791737000.A.123.html';
const hash = value => createHash('sha256').update(value).digest('hex');
function upsertHarness() {
  const writes = [];
  const client = { from(table) { return {
    upsert: async rows => { writes.push({ table, rows }); return { error: null }; },
    select() { return { eq() { return { in: async () => ({ data: [], error: null }) }; },
      in: async () => ({ data: [{ id: 'stock-2409', symbol: '2409' }, { id: 'stock-2383', symbol: '2383' }], error: null }) }; },
  }; } };
  const fn = actual('upsertSourceRawDocuments', { getSupabaseServerClient: () => client,
    resolveSourceSyncLookbackHours: () => 24, sourceRawKey: x => `${x.platform}::${x.documentUrl}`,
    chunkArray: (x, n) => Array.from({ length: Math.ceil(x.length / n) }, (_, i) => x.slice(i * n, (i + 1) * n)),
    truncateSourceContent: text => ({ contentText: text, originalChars: text.length, truncated: false }),
    SOURCE_RAW_CONTENT_MAX_CHARS: 4000, classifySourceStance: () => 'neutral', canonicalContentHash: hash,
    canonicalPublisherKey: x => `${x.platform}:${x.author}`, compactText, unique: x => [...new Set(x)],
    nowIso: () => '2026-10-11T16:45:00Z', buildPttMentionProvenance });
  return { fn, writes };
}
function doc(platform = 'ptt', author = 'reader', index = 1) { return { platform, sourceEntityId: 'entity', documentUrl: `${parent}#push-${index}`,
  title: 'PTT 留言｜2409', summary: '2409 尚待查證', contentText: '2409 尚待查證', symbols: ['2409', '2383'],
  metadata: { source_surface: 'ptt_stock_push', parent_document_url: parent, author_name: author, comment_index: index,
    comment_tag: '推', matched_symbols: ['2409'], matched_symbol_reason: 'comment_local_tw_symbol_or_name_proximity',
    evidence_excerpt: '2409 尚待查證', body_read_status: 'body_read_bounded', retention_mode: 'metadata_local_excerpt', extraPrivate: 'do not copy' } }; }
test('actual upsert boundary retains stock-local reply provenance for two authors without ID substitution', async () => {
  const { fn, writes } = upsertHarness(); const docs = [doc('ptt', 'a', 1), doc('ptt', 'b', 2)];
  assert.equal(await fn(docs), 2);
  const rows = writes.find(x => x.table === 'candidate_source_mentions').rows;
  assert.equal(rows.length, 4);
  for (const row of rows) {
    assert.equal(row.source_document_id, null); assert.equal(row.provenance.ptt.parent_document_url, parent);
    assert.equal(row.provenance.ptt.stock_local_match_basis_retained, row.stock_id === 'stock-2409');
    assert.equal(row.provenance.ptt.independent_confirmation, false); assert.doesNotMatch(JSON.stringify(row.provenance), /extraPrivate|do not copy/);
  }
  assert.equal(new Set(rows.map(x => x.provenance.ptt.author_name)).size, 2);
  assert.equal(writes.find(x => x.table === 'source_raw_documents').rows[0].metadata.evidence_excerpt, '2409 尚待查證');
});
test('actual mention boundary leaves non-PTT provenance unchanged', async () => {
  const { fn, writes } = upsertHarness(); await fn([doc('threads')]);
  assert.ok(writes.find(x => x.table === 'candidate_source_mentions').rows.every(row => !('ptt' in row.provenance)));
});
async function collector(body) {
  const docs = [], signalRows = [];
  const fn = actual('scrapePttStock', { getSupabaseServerClient: () => ({ from: () => ({ upsert: async rows => { signalRows.push(...rows); return { error: null }; } }) }),
    loadTwStockAuthority: async () => [{ id: 'stock-2409', symbol: '2409', name: '友達' }, { id: 'stock-2383', symbol: '2383', name: '台光電' }], compactText,
    getSymbolAliases: () => ['友達'], upsertSourceEntity: async () => ({ id: 'entity' }),
    fetchTextWithRetry: async ({ url }) => { if (url === parent) { if (body instanceof Error) throw body; return { text: body }; }
      return { text: '<div class="title"><a href="/bbs/Stock/M.1791737000.A.123.html">[情報] 2409</a></div>' }; },
    sourceFetchFailureCode: () => 'synthetic_failure', isExpectedPttArticleMissing: () => false,
    extractTwSymbolsWithEvidence: actual('extractTwSymbolsWithEvidence', { compactText }),
    roundTo: x => x, classifyPttContentSemantics: () => 'editorial_discussion', publisherKeyFor: x => `ptt:${x.author}`,
    filterSymbolScopedDocs: x => x, upsertSourceRawDocuments: async x => { docs.push(...x); return x.length; }, nowIso: () => '2026-10-11T16:45:00Z' });
  await fn(); return { docs, signalRows };
}
test('actual body-fetch failure stores title-only status and never manufactures reply records', async () => {
  const { docs } = await collector(new Error('synthetic transport failure')); assert.equal(docs.length, 1);
  assert.equal(docs[0].contentText, '[情報] 2409'); assert.equal(docs[0].metadata.body_read_status, 'title_only_fetch_failed');
  const p = buildPttMentionProvenance({ ...docs[0], symbol: '2409' }); assert.equal(p.stock_local_match_basis_retained, false);
});
test('actual bounded collector retains minimum per-comment matches, no post body or full-coverage claim', async () => {
  const push = (author, text) => `<div class="push"><span class="push-tag">推</span><span class="push-userid">${author}</span><span class="push-content">: ${text}</span></div>`;
  const { docs } = await collector(`<div id="main-content">友達 2409 股票 public synthetic body${push('a', '2409 股票未證實')}${push('b', '2409 股票有風險')}${push('c', '無關回覆')}</div><div id="article-polling">`);
  assert.equal(docs.length, 3); assert.equal(docs[0].contentText, '[情報] 2409'); assert.equal(docs[0].metadata.body_read_status, 'body_read_bounded');
  for (const d of docs.slice(1)) { assert.equal(d.metadata.parent_document_url, parent); assert.equal(d.metadata.body_retained, false);
    assert.equal(d.metadata.replies_read_completeness, 'partial'); assert.deepEqual(Array.from(d.metadata.matched_symbols), ['2409']); }
});
test('actual fetched shell reports missing body instead of full text', async () => {
  const { docs } = await collector('<html><title>2409 title only</title></html>');
  assert.equal(docs[0].metadata.body_read_status, 'title_only_body_missing'); assert.equal(docs[0].metadata.body_retained, false);
});
test('actual symbol extractor keeps reply2383 separate from parent2409', async () => {
  const { docs } = await collector('<div id="main-content">友達 2409 股票正文<div class="push"><span class="push-tag">→</span><span class="push-userid">reader</span><span class="push-content">: 2383 股票另有風險</span></div></div><div id="article-polling">');
  assert.equal(docs.length, 2); assert.deepEqual(Array.from(docs[0].symbols), ['2409']);
  assert.deepEqual(Array.from(docs[1].metadata.matched_symbols), ['2383']);
  assert.equal(buildPttMentionProvenance({ ...docs[1], symbol: '2409' }).stock_local_match_basis_retained, false);
  assert.equal(buildPttMentionProvenance({ ...docs[1], symbol: '2383' }).stock_local_match_basis_retained, true);
});
