import assert from 'node:assert/strict';
import test from 'node:test';
import { parsePttArticleHtml, pttBodyProvenance, projectPttBodyObservation, normalizePttOfficialStockName, matchPttFinancialSummarySymbols } from './ptt-article-parser.ts';
import { loadActualPttCollector } from './ptt-collector-test-loader.mjs';
import { projectCachedSourceAdmission } from './vnext/cached-source-admission.ts';
import { buildPttMentionProvenance } from './ptt-mention-provenance.ts';

// Invented NONPRODUCTION HTML, account and article IDs. No real PTT body,
// author or actual fetched fixture is embedded here. External #389 replay is blocked.
const publishedAt = '2026-01-03T04:00:00.000Z';
const epoch = Date.parse(publishedAt) / 1000 + 2;
const url = `https://www.ptt.cc/bbs/Stock/M.${epoch}.A.000.html`;
const observedAt = '2026-01-04T04:00:00.000Z';
function html(body: string, title = '[情報] Synthetic', time = 'Sat Jan 3 12:00:00 2026') {
  return `<html><body><div id="main-content"><div class="article-metaline"><span class="article-meta-tag">作者</span><span class="article-meta-value">NONPRODUCTION_author</span></div><div class="article-metaline-right"><span class="article-meta-tag">看板</span><span class="article-meta-value">Stock</span></div><div class="article-metaline"><span class="article-meta-tag">標題</span><span class="article-meta-value">${title}</span></div><div class="article-metaline"><span class="article-meta-tag">時間</span><span class="article-meta-value">${time}</span></div>${body}</div><div id="article-polling"></div></body></html>`;
}
const context = { validSymbols: new Set(['4763','2330','3443']), stockNamesBySymbol: new Map([['4763','合成公司甲'],['2330','合成公司乙'],['3443','合成公司丙']]), aliasesBySymbol: new Map<string, string[]>() };
const collector = loadActualPttCollector().projectPttCollectorArticle as (input: { html: string; documentUrl: string; title: string; observedAt: string } & typeof context) => {
  article: ReturnType<typeof parsePttArticleHtml>; publicationValid: boolean; bodyExtracted: { symbols: string[] }; legacyExtracted: { symbols: string[] }; provenance: ReturnType<typeof pttBodyProvenance>;
};
const collect = (body: string, title = '[情報] Synthetic') => collector({ html: html(body, title), documentUrl: url, title, observedAt, ...context });

test('T04 balanced nested body and Taipei header survive metadata while no body or author enters retained proof', () => {
  const value = collect('<div>股票 4763 合成公司甲<div>營收資訊</div>自己的段落</div>');
  assert.equal(value.article.status, 'body_read'); assert.equal(value.article.sourcePublishedAt, publishedAt);
  assert.equal(value.article.clockDeltaSeconds, -2); assert.equal(value.article.clockConsistent, true);
  assert.equal(value.publicationValid, true);
  assert.match(value.article.bodyText!, /自己的段落/u); assert.deepEqual([...value.bodyExtracted.symbols], ['4763']);
  assert.doesNotMatch(JSON.stringify(value.provenance), /NONPRODUCTION_author|自己的段落|營收資訊/u);
  assert.equal(projectPttBodyObservation(value.provenance, url, observedAt, observedAt).status, 'ready_observation');
});
test('T04 actual collector composition keeps body-local symbols separate from legacy title, pushes, template and signature', () => {
  const value = collect(`<div>1. 標的：00981A ETF</div><div>板規範例 2330 合成公司乙</div><div>(例\n2330 (合成公司乙)\n)</div><div class="push"><span>股票 2330 合成公司乙</span></div>\n--\n股票 3443 合成公司丙`, '[標的] 4763 股票');
  assert.deepEqual([...value.bodyExtracted.symbols], []); assert.deepEqual([...value.legacyExtracted.symbols], ['4763']);
  assert.deepEqual([...value.provenance.body_symbols], []); assert.doesNotMatch(value.article.bodyText!, /2330|3443/u);
});
test('T04 actual numbered original stock field remains after board-template removal', () => {
  const value = collect('<p>1. 標的：2330 合成公司乙</p><p>2. 分類：討論</p><p>3. 分析/正文：營收資料待查證</p>');
  assert.deepEqual([...value.bodyExtracted.symbols], ['2330']);
  const old = '2026-04-04T04:00:00.000Z';
  assert.equal(projectPttBodyObservation(value.provenance, url, old, old).reason, 'source_publication_older_than_30_days');
});
test('T04 unparenthesized English board examples are removed without deleting ordinary author prose', () => {
  for (const marker of ['ex [標的]', 'EX. [標的]', 'e.g. [標的]', 'ex: 1. 標的：']) {
    const value = collect(`<p>1. 標的：00981A ETF</p><p>${marker} 2330 合成公司乙</p>`);
    assert.deepEqual([...value.bodyExtracted.symbols], []); assert.doesNotMatch(value.article.bodyText!, /2330/u);
  }
  const original = collect('<p>1. 標的：2330 合成公司乙</p><p>作者的 exposure 分析。</p>');
  assert.deepEqual([...original.bodyExtracted.symbols], ['2330']); assert.match(original.article.bodyText!, /exposure/u);
  const prose = collect('<p>作者說明 ex [標的] 2330 合成公司乙，保留原作者觀點。</p>');
  assert.match(prose.article.bodyText!, /ex \[標的\]/u);
});
test('T04 same-symbol official-name normalization is limited to width, whitespace and terminal legal markers', () => {
  const normalized = normalizePttOfficialStockName('合成材料*-KY');
  for (const name of ['合成材料－ＫＹ', '合成材料＊－ＫＹ', ' 合成材料 - ky ', '合成材料-KY*']) assert.equal(normalizePttOfficialStockName(name), normalized);
  assert.notEqual(normalizePttOfficialStockName('另一材料-KY'), normalized);
  assert.notEqual(normalizePttOfficialStockName('合成*材料-KY'), normalized);
  assert.notEqual(normalizePttOfficialStockName('合成材料股份有限公司'), normalized);
  assert.equal(normalizePttOfficialStockName('4763'), null);
});
test('T04 actual collector recognizes only same-line issuer financial summaries against the same-code official name', () => {
  // Invented values/names following the externally reported shape; these are
  // not the actual restricted PTT source bytes or financial facts.
  const financialContext = { validSymbols: new Set(['4763','2330']), stockNamesBySymbol: new Map([['4763','合成材料*-KY'], ['2330','另一材料-KY']]), aliasesBySymbol: new Map<string, string[]>() };
  for (const line of ['4763合成材料-KY 115年 Q3:-1.25 累積:0', '４７６３合成材料－ＫＹ　１１５年　Ｑ３：０　累積：－２']) {
    const value = collector({ html: html(line), documentUrl: url, title: 'Synthetic unrelated title', observedAt, ...financialContext });
    assert.deepEqual([...value.bodyExtracted.symbols], ['4763']); assert.equal(value.article.parserVersion, 'ptt-own-body-v2');
    const observation = projectPttBodyObservation(value.provenance, url, observedAt, observedAt);
    assert.equal(observation.status, 'ready_observation'); assert.equal(observation.researchAdmissionAuthority, false);
  }
  for (const body of ['4763另一材料-KY 115年 Q3:1 累積:2', '4763未知材料-KY 115年 Q3:1 累積:2',
    '4763合成材料-KY\n115年 Q3:1 累積:2', '金額：94763.00\n115年 Q3:1 累積:2']) {
    const value = collector({ html: html(body), documentUrl: url, title: '[情報] 4763 股票', observedAt, ...financialContext });
    assert.deepEqual([...value.bodyExtracted.symbols], []);
  }
});
test('T04 summary format refuses amounts, unknown authority, malformed quarter/year/numbers and trailing prose', () => {
  const names = new Map([['4763','合成材料*-KY']]); const valid = new Set(['4763']);
  for (const line of ['4763.00合成材料-KY 115年 Q3:1 累積:2', '94763合成材料-KY 115年 Q3:1 累積:2',
    '前文4763合成材料-KY 115年 Q3:1 累積:2', '4763 合成材料-KY 115年 Q3:1 累積:2',
    '4763合成材料-KY 0年 Q3:1 累積:2', '4763合成材料-KY 200年 Q3:1 累積:2',
    '4763合成材料-KY 115年 Q0:1 累積:2', '4763合成材料-KY 115年 Q5:1 累積:2',
    '4763合成材料-KY 115年 Q3:100000000 累積:2', '4763合成材料-KY 115年 Q3:1e3 累積:2',
    '4763合成材料-KY 115年 Q3:1', '4763合成材料-KY 115年 Q3:1 累積:2 後文']) {
    assert.deepEqual(matchPttFinancialSummarySymbols(line, valid, names), []);
  }
  const line = '4763合成材料-KY 115年 Q3:1 累積:2';
  assert.deepEqual(matchPttFinancialSummarySymbols(line, new Set(), names), []);
  assert.deepEqual(matchPttFinancialSummarySymbols(line, valid, new Map()), []);
});
test('T04 Re/Fw and quoted text never acquire original-root eligibility from a newer reply header', () => {
  for (const [body, title] of [['※ 引述《NONPRODUCTION》\n: 股票 2330 合成公司乙\n合成公司丙觀點', 'Re: [標的] 3443 股票'],
    ['<blockquote>股票 2330 合成公司乙</blockquote><p>自己的股票 4763 合成公司甲</p>', '[情報] Synthetic'], ['股票 4763 合成公司甲', 'Fw: Synthetic']]) {
    const value = collect(body, title);
    assert.equal(value.article.originKind, 'reply_or_repost');
    assert.equal(projectPttBodyObservation(value.provenance, url, observedAt, observedAt).reason, 'quoted_or_reposted_original_unresolved');
    if (title.startsWith('Re')) assert.deepEqual([...value.bodyExtracted.symbols], []);
  }
});
test('T04 pushed/template/footer edits do not alter cleaned body hash, own-body corrections do', () => {
  const first = collect('股票 4763 合成公司甲<div class="push">股票 2330</div><p>板規範例 2330</p>');
  const second = collect('股票 4763 合成公司甲<div class="push">股票 3443 更多留言</div><p>板規範例 3443</p>');
  assert.equal(first.provenance.clean_body_sha256, second.provenance.clean_body_sha256);
  assert.notEqual(first.provenance.clean_body_sha256, collect('股票 4763 合成公司甲 修正').provenance.clean_body_sha256);
});
test('T04 metadata-only, missing/duplicate/unclosed main, unsafe scripts and overbound layouts never claim a usable body', () => {
  assert.equal(parsePttArticleHtml(html(''), url).status, 'body_missing');
  assert.equal(parsePttArticleHtml(html('<script>股票2330</script><style>4763</style>'), url).status, 'body_missing');
  for (const input of [html('股票 4763').replace('id="main-content"', 'id="other"'), html('股票 4763') + '<div id="main-content"></div>',
    html('股票 4763').replace('</div><div id="article-polling">', '<div id="article-polling">'), html('<div>'.repeat(70) + '4763' + '</div>'.repeat(70))]) {
    assert.equal(parsePttArticleHtml(input, url).status, 'layout_unsupported');
  }
  assert.equal(parsePttArticleHtml('x'.repeat(524289), url).status, 'html_overbound');
  assert.equal(parsePttArticleHtml(html('甲'.repeat(11000)), url).status, 'body_overbound');
});
test('T04 timestamp gaps/calendar conflict/ID clock conflict are explicit and never replaced by filename/acquisition time', () => {
  for (const time of ['invalid', 'Sat Feb 30 12:00:00 2026', 'Fri Jan 3 12:00:00 2026']) {
    const read = parsePttArticleHtml(html('股票 4763 合成公司甲', '[情報] Synthetic', time), url);
    assert.equal(read.sourcePublishedAt, null); assert.equal(read.clockConsistent, false);
    assert.equal(projectPttBodyObservation(pttBodyProvenance(read, ['4763']), url, observedAt, observedAt).reason, 'source_publication_time_missing');
  }
  const conflict = parsePttArticleHtml(html('股票 4763 合成公司甲'), url.replace(String(epoch), String(epoch + 60)));
  assert.equal(conflict.sourcePublishedAt, publishedAt); assert.equal(conflict.clockConsistent, false);
  assert.equal(projectPttBodyObservation(pttBodyProvenance(conflict, ['4763']), conflict.canonicalUrl!, observedAt, observedAt).reason, 'article_clock_conflict');
});
test('T04 invalid article URL, duplicate metadata and malformed own proof fail closed without copying arbitrary fields', () => {
  assert.equal(parsePttArticleHtml(html('股票 4763'), 'https://example.invalid/bbs/Stock/article.html').status, 'layout_unsupported');
  const duplicate = html('股票 4763').replace('股票 4763', '<div class="article-metaline"><span class="article-meta-tag">時間</span><span class="article-meta-value">Sat Jan 3 12:00:00 2026</span></div>股票 4763');
  assert.equal(parsePttArticleHtml(duplicate, url).status, 'layout_unsupported');
  const proof = collect('股票 4763 合成公司甲').provenance;
  const projected = projectPttBodyObservation({ ...proof, raw: 'NONPRODUCTION_DROP' }, url, observedAt, observedAt);
  assert.equal(projected.reason, 'body_provenance_invalid'); assert.doesNotMatch(JSON.stringify(projected), /NONPRODUCTION_DROP/u);
});
test('T04 retained clock projection rejects normalized civil dates and microsecond-late acquisition', () => {
  const proof = collect('股票 4763 合成公司甲').provenance;
  for (const [available, cutoff] of [['2026-02-30T04:00:00.000Z', '2026-03-03T04:00:00.000Z'],
    ['2026-01-04T04:00:00.000001Z', '2026-01-04T04:00:00.000000Z']]) {
    assert.equal(projectPttBodyObservation(proof, url, available, cutoff).reason, 'source_availability_clock_invalid');
  }
});
test('T04 actual collector will not mark a header later than acquisition valid for legacy mentions/signals', () => {
  const value = collector({ html: html('股票 4763 合成公司甲'), documentUrl: url, title: 'Synthetic', observedAt: '2026-01-03T03:59:59.999999Z', ...context });
  assert.equal(value.article.clockConsistent, true); assert.equal(value.publicationValid, false);
  const unknown = collector({ html: html('股票 4763 合成公司甲', 'Synthetic', 'invalid'), documentUrl: url, title: 'Synthetic', observedAt, ...context });
  assert.equal(unknown.publicationValid, false);
});
test('T04 actual cache projector refuses body-original observation before reservation despite forged metadata rights', () => {
  const value = collect('股票 4763 合成公司甲');
  const result = projectCachedSourceAdmission({ id: 'NONPRODUCTION_doc', document_url: url, title: 'Synthetic', published_at: publishedAt, collected_at: observedAt,
    symbols: ['4763'], metadata: { retention_mode: 'metadata_link_only', ptt_body_provenance: value.provenance, rights: true, license_basis: 'metadata_link_only_attested' } }, 'ptt', observedAt);
  assert.equal(result.item, null); assert.equal(result.evidence.reason, 'vnext_ptt_body_original_scope_unavailable');
  assert.equal(result.evidence.contentHash, null); assert.ok(result.evidence.gaps.includes('ptt_metadata_scope_rejects_resolved_original_roots'));
});
test('T04 retained mention projection adds bounded own-body observation without upgrading legacy author/root authority', () => {
  const value = collect('股票 4763 合成公司甲');
  const mention = buildPttMentionProvenance({ platform: 'ptt', documentUrl: url, symbol: '4763', metadata: { source_surface: 'ptt_stock_board',
    author_name: 'NONPRODUCTION_author', matched_symbols: ['4763'], matched_symbol_reason: 'tw_symbol_or_name_proximity', body_read_status: 'body_read_bounded',
    retention_mode: 'metadata_link_only', ptt_body_provenance: value.provenance, ptt_body_observed_at: observedAt } })!;
  assert.equal(mention.body_observation?.status, 'ready_observation'); assert.equal(mention.independent_root_resolved, false);
  assert.equal(mention.body_observation?.researchAdmissionAuthority, false); assert.equal(mention.evidence_excerpt, null);
});
