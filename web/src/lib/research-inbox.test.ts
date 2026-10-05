import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import * as inbox from './research-inbox.ts';
import { buildResearchInboxRow, researchInboxContentHash, validateResearchInboxItem, validateResearchInboxItemAt, type ResearchInboxItem } from './research-inbox.ts';

const item: ResearchInboxItem = {
  sourcePlatform: 'threads',
  sourceUrl: 'https://www.threads.net/@analyst/post/example',
  author: 'analyst',
  publishedAt: '2026-09-20T10:00:00+08:00',
  observedAt: '2026-09-20T18:02:00+08:00',
  symbols: ['2409'],
  shortSummary: '市場討論友達可能與國際晶片廠合作，仍待查證。',
  catalyst: '若有具名客戶驗證，可能提高 CPO 商業化可見度。',
  risk: '目前沒有公司公告、訂單或量產時程。',
  claimStatus: 'rumor',
  visibility: 'public',
};

test('research inbox validates bounded point-in-time summaries', () => {
  assert.equal(validateResearchInboxItem(item), true);
  assert.equal(validateResearchInboxItem({ ...item, observedAt: '2026-09-19T10:00:00+08:00' }), false);
  assert.equal(validateResearchInboxItem({ ...item, sourceUrl: 'http://example.com' }), false);
});

test('research inbox produces immutable deterministic revisions', () => {
  const left = buildResearchInboxRow(item);
  const right = buildResearchInboxRow(item);
  assert.equal(left.document_url, right.document_url);
  assert.equal(left.canonical_content_hash, researchInboxContentHash(item));
  assert.equal(left.metadata.first_observed_at, '2026-09-20T10:02:00.000Z');
  assert.equal(left.metadata.rights_boundary, 'public_citation');
  assert.equal(buildResearchInboxRow({ ...item, claimStatus: 'confirmed' }).document_url === left.document_url, false);
});

test('authenticated content stores only the submitted bounded summary', () => {
  const row = buildResearchInboxRow({ ...item, visibility: 'authenticated_summary' });
  assert.equal(row.metadata.rights_boundary, 'bounded_summary_only');
  assert.equal(row.content_text.includes('cookie'), false);
  assert.equal(row.content_text.includes('session'), false);
});

const industry: ResearchInboxItem = {
  ...item, symbols: [], subjectScope: 'industry_context', industryTerms: ['CPO', '光學測試'],
  shortSummary: '合成產業案例：討論光學互連測試需求，未提及任何公司。',
  catalyst: '測試需求可作產業研究問題，尚未建立個別公司關聯。',
  risk: '產業需求不代表任一公司取得訂單。', claimStatus: 'reported',
};
const cutoff = '2026-10-05T00:00:00Z';

test('IS01 industry-only source preserves empty direct symbols and bounded metadata', () => {
  assert.equal(validateResearchInboxItemAt(industry, cutoff), true);
  const row = buildResearchInboxRow(industry);
  assert.deepEqual(row.symbols, []);
  assert.equal(row.metadata.subject_scope, 'industry_context');
  assert.deepEqual(row.metadata.industry_terms, ['CPO', '光學測試']);
  assert.equal(row.content_semantics, 'editorial_discussion');
  assert.equal(row.metadata.rights_boundary, 'public_citation');
  assert.equal(row.content_text.includes('2409'), false);
  assert.equal('associations' in row.metadata, false);
});

test('IS02 industry-only symbols cannot nominate a company or bypass explicit subject scope', () => {
  for (const bad of [
    { ...industry, symbols: ['2409'] }, { ...industry, symbols: ['AUO'] },
    { ...industry, subjectScope: 'company_mentions' }, { ...industry, subjectScope: undefined },
    { ...industry, subjectScope: 'researcher_hypothesis' }, { ...industry, subjectScope: null },
    { ...industry, industryTerms: undefined }, { ...item, symbols: [2409] },
  ]) assert.equal(validateResearchInboxItemAt(bad, cutoff), false);
});

test('IS03 industry terms require bounded trimmed unique strings and exact source shape', () => {
  for (const terms of [[], [''], [' CPO'], ['CPO '], ['CPO\n測試'], ['a'.repeat(81)],
    Array.from({ length: 13 }, (_, i) => `term${i}`), ['CPO', 'cpo'], ['ＣＰＯ', 'CPO'],
    [42], ['CPO', { symbol: '2409' }]]) {
    assert.equal(validateResearchInboxItemAt({ ...industry, industryTerms: terms }, cutoff), false);
  }
  assert.equal(validateResearchInboxItemAt({ ...industry, industryTerms: ['a'.repeat(80)] }, cutoff), true);
  assert.equal(validateResearchInboxItemAt({ ...industry, industryTerms: Array.from({ length: 12 }, (_, i) => `term${i}`) }, cutoff), true);
  for (const extra of [{ associationSymbols: ['2409'] }, { metadata: { symbols: ['2409'] } },
    { fullText: 'member text' }, { cookie: 'private' }]) {
    assert.equal(validateResearchInboxItemAt({ ...industry, ...extra }, cutoff), false);
  }
});

test('IS04 legacy identity stays stable while industry metadata creates immutable revisions', () => {
  const legacyHash = 'd66bdf1a8282409b0b70b275b8ea1cf465e57465f983ea564de7816efd50b84c';
  assert.equal(researchInboxContentHash(item), legacyHash);
  assert.equal(researchInboxContentHash({ ...item, subjectScope: 'company_mentions' }), legacyHash);
  assert.equal(buildResearchInboxRow(item).metadata.subject_scope, 'company_mentions');
  const original = structuredClone(industry);
  assert.equal(researchInboxContentHash({ ...industry, industryTerms: [...industry.industryTerms!].reverse() }), researchInboxContentHash(industry));
  const revised = buildResearchInboxRow({ ...industry, industryTerms: ['CPO', '光學封裝'] });
  assert.notEqual(revised.document_url, buildResearchInboxRow(industry).document_url);
  assert.notEqual(revised.canonical_content_hash, buildResearchInboxRow(industry).canonical_content_hash);
  assert.equal(revised.metadata.canonical_url, buildResearchInboxRow(industry).metadata.canonical_url);
  assert.deepEqual(industry, original);
});

test('IS05 inbox itself enforces exact clocks and authenticated summary boundaries', () => {
  for (const bad of [
    { ...industry, publishedAt: '2026-02-30T00:00:00Z' }, { ...industry, observedAt: '2026-10-05T01:00:00Z' },
    { ...industry, firstObservedAt: '2026-09-19T00:00:00Z' }, { ...industry, firstObservedAt: '' },
    { ...industry, revisionObservedAt: '2026-09-21T00:00:00Z' }, { ...industry, publishedAt: '2026-09-20' },
    { ...industry, visibility: 'authenticated_summary', timedExcerpts: [{ startSeconds: 0, endSeconds: 10, text: 'private transcript' }] },
    { ...industry, industryTerms: ['cookie=private'] }, { ...industry, shortSummary: 'Bearer abcdefghijklmnopqrstuvwxyz' },
    { ...industry, timedExcerpts: [{ startSeconds: 0, endSeconds: 10, text: 'public excerpt', fullText: 'private' }] },
  ]) assert.equal(validateResearchInboxItemAt(bad, cutoff), false);
  assert.equal(validateResearchInboxItemAt({ ...industry, visibility: 'authenticated_summary',
    contentForm: 'research_summary', acquisitionMethod: 'authenticated_browser_summary' }, cutoff), true);
});

test('IS06 existing authenticated inbox POST accepts industry rows and rejects invalid input before persistence', async () => {
  const source = readFileSync(new URL('../app/api/internal/research-inbox/route.ts', import.meta.url), 'utf8');
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const writes: ReturnType<typeof buildResearchInboxRow>[][] = [];
  const modules: Record<string, unknown> = {
    'next/server': { NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status || 200 }) } },
    '@/lib/internal-auth': { requireInternalAuth: (request: Request) => request.headers.get('authorization') === 'Bearer synthetic-inbox-test'
      ? { ok: true, authSource: 'synthetic_test' } : { ok: false, error: 'unauthorized', status: 401 } },
    '@/lib/research-inbox': inbox,
    '@/lib/supabase-server': { getSupabaseServerClient: () => ({ from: (table: string) => {
      assert.equal(table, 'source_raw_documents');
      return { upsert: (rows: ReturnType<typeof buildResearchInboxRow>[], options: unknown) => {
        assert.equal(JSON.stringify(options), JSON.stringify({ onConflict: 'platform,document_url', ignoreDuplicates: true }));
        writes.push(rows);
        return { select: async () => ({ data: rows.map((row, i) => ({ id: String(i), document_url: row.document_url })), error: null }) };
      } };
    } }) },
  };
  const exports: Record<string, unknown> = {};
  vm.runInNewContext(compiled, { exports, require: (name: string) => {
    assert.ok(name in modules); return modules[name];
  } }, { timeout: 1000 });
  const post = exports.POST as (request: Request) => Promise<{ status: number; body: { accepted: number } }>;
  const request = (items: unknown[], authorized = true) => new Request('https://example.test/api/internal/research-inbox', {
    method: 'POST', headers: { 'content-type': 'application/json', ...(authorized ? { authorization: 'Bearer synthetic-inbox-test' } : {}) },
    body: JSON.stringify({ items }),
  });
  assert.equal((await post(request([industry], false))).status, 401);
  assert.equal(writes.length, 0);
  // A batch also verifies the validator remains a one-argument Array.every callback.
  const result = await post(request([industry, item]));
  assert.equal(result.status, 200); assert.equal(result.body.accepted, 2);
  assert.deepEqual(writes[0][0].symbols, []);
  assert.equal(writes[0][0].metadata.subject_scope, 'industry_context');
  assert.deepEqual(writes[0][1].symbols, ['2409']);
  for (const bad of [{ ...industry, symbols: ['2409'] }, { ...industry, industryTerms: ['CPO', 'cpo'] },
    { ...industry, observedAt: '2099-01-01T00:00:00Z' }, { ...industry, fullText: 'not allowed' }]) {
    assert.equal((await post(request([bad]))).status, 400);
  }
  assert.equal(writes.length, 1);
});
