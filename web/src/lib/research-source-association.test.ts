import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { buildResearchInboxRow, type ResearchInboxItem } from './research-inbox.ts';
import { researchCanonicalHash } from './research-agent-qualification.ts';
import { ASSOCIATION_DOCUMENT_COLUMNS, ASSOCIATION_LIMITS, loadIndustryAssociations, parseIndustryAssociations,
  type IndustryAssociationInput } from './research-source-association.ts';

type Row = Record<string, unknown>;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cutoff = '2026-10-02T08:00:00.000Z'; const clock = '2026-10-05T09:00:00.000Z';
const root = 'https://www.threads.com/@investanchors/post/Ddaum9QGFr_';
function document(n = 1, symbol?: string): Row {
  const item: ResearchInboxItem = { sourcePlatform: 'threads', sourceUrl: symbol ? `https://example.test/company/${n}` : root,
    author: 'Synthetic contract author', publishedAt: '2026-08-01T01:00:00Z', observedAt: '2026-08-02T01:00:00Z',
    symbols: symbol ? [symbol] : [], subjectScope: symbol ? 'company_mentions' : 'industry_context',
    ...(symbol ? {} : { industryTerms: ['CPO', '光學測試'] }),
    shortSummary: 'Synthetic summary with no order or customer assertion', catalyst: 'Possible industry testing bottleneck',
    risk: 'Alternative solutions could take the addressable market', claimStatus: 'reported', visibility: 'public' };
  return { id: uuid(n), ...buildResearchInboxRow(item) };
}
function input(source = document(), basis: string[] = []): IndustryAssociationInput {
  return { relation: 'industry_hypothesis', sourceDocumentId: String(source.id), sourceContentHash: String(source.canonical_content_hash),
    sourceRootId: String((source.metadata as Row).canonical_url), hypothesis: 'Company might address part of the industry bottleneck',
    rationale: 'Researcher inference needs product and customer validation', companyBasisDocumentIds: basis,
    strongestCounterEvidence: 'No demonstrated customer qualification or production order', associatedAt: '2026-10-01T06:00:00.000Z' };
}
function requests(items: IndustryAssociationInput[] = [input()], symbol = '2409') {
  return parseIndustryAssociations([{ symbol, associations: items }], cutoff);
}
function dbMock(documents: Row[], options: { heads?: Row[]; fail?: boolean; hang?: boolean; duplicateDirect?: boolean; extraHead?: boolean } = {}) {
  const calls: Array<{ kind: string; columns?: string; ids?: string[]; cutoff?: string; limit?: number; filter?: string; signal?: AbortSignal }> = [];
  const db = { from(table: string) {
    assert.equal(table, 'source_raw_documents'); const call: (typeof calls)[number] = { kind: 'select' }; calls.push(call);
    let data = [...documents]; let maximum = Infinity;
    const q = {
      select(columns: string) { call.columns = columns; assert.equal(columns, ASSOCIATION_DOCUMENT_COLUMNS); return q; },
      in(key: string, ids: string[]) { assert.equal(key, 'id'); call.ids = ids; data = data.filter((row) => ids.includes(String(row.id)));
        if (options.duplicateDirect && data.length) data = [data[0], data[0]]; return q; },
      lte(key: string, value: string) { data = data.filter((row) => Date.parse(String(row[key])) <= Date.parse(value)); return q; },
      order() { return q; }, limit(value: number) { maximum = value; call.limit = value; return q; },
      abortSignal(signal: AbortSignal) { call.signal = signal; return q; },
      or(filter: string) {
        call.filter = filter;
        const parts = /^metadata->>canonical_url\.eq\.("(?:\\.|[^"\\])*"),and\(metadata->>canonical_url\.is\.null,document_url\.match\.("(?:\\.|[^"\\])*")\)$/u.exec(filter);
        assert.ok(parts, 'quoted PostgREST canonical/fallback filter');
        const url = JSON.parse(parts[1]); const regex = new RegExp(JSON.parse(parts[2]));
        data = data.filter((row) => (row.metadata as Row)?.canonical_url === url
          || (row.metadata as Row)?.canonical_url == null && regex.test(String(row.document_url))); return q;
      },
      then(resolve: (value: unknown) => void) {
        if (options.hang) return;
        resolve({ data: data.slice(0, maximum), error: options.fail ? { message: 'private connection secret' } : null });
      },
    }; return q;
  }, rpc(name: string, args: { p_ids: string[]; p_cutoff: string }) {
    assert.equal(name, 'research_evidence_heads_v1'); const call: (typeof calls)[number] = { kind: 'heads', ids: args.p_ids, cutoff: args.p_cutoff }; calls.push(call);
    const values = options.heads || documents.filter((doc) => args.p_ids.includes(String(doc.id))).map((doc) => ({ id: doc.id, headId: doc.id, retracted: false, superseded: false }));
    const q = { abortSignal(signal: AbortSignal) { call.signal = signal; return q; }, then(resolve: (value: unknown) => void) {
      resolve({ data: options.extraHead ? [...values, { id: uuid(999), headId: uuid(999), retracted: false, superseded: false }] : values, error: null });
    } }; return q;
  } };
  return { db: db as unknown as Pick<SupabaseClient, 'from' | 'rpc'>, calls };
}
async function resolve(source = document(), basis: Row[] = [], overrides: Partial<IndustryAssociationInput> = {}, heads?: Row[]) {
  const mock = dbMock([source, ...basis], { heads });
  const result = await loadIndustryAssociations(mock.db, requests([{ ...input(source, basis.map((doc) => String(doc.id))), ...overrides }]), cutoff, clock);
  return { receipt: result.get('2409')![0], calls: mock.calls };
}
test('IA01 an old industry-only source creates a current supplementary hypothesis with missing company basis', async () => {
  const { receipt, calls } = await resolve();
  assert.equal(receipt.source?.rootId, root); assert.equal(receipt.evidenceStatus, 'needs_evidence');
  assert.deepEqual(receipt.gaps, ['company_basis_missing']); assert.equal(receipt.hasResearchCue, true);
  assert.equal(receipt.status, 'hypothesis'); assert.equal(receipt.availableAt, clock); assert.equal(receipt.researchObservedAt, clock);
  assert.equal(receipt.usableAtCutoff, false); assert.equal(receipt.rankingInfluence, false); assert.equal(receipt.directSourceContribution, 0);
  assert.ok(calls.every((call) => call.kind !== 'select' || call.columns === ASSOCIATION_DOCUMENT_COLUMNS));
  assert.ok(calls.every((call) => call.signal instanceof AbortSignal));
  assert.equal(calls.find((call) => call.kind === 'heads')!.cutoff, cutoff);
  assert.ok(!JSON.stringify(receipt).includes('shortSummary')); assert.ok(!JSON.stringify(receipt).includes('content_text'));
});
test('IA02 company direct evidence still requires independent review and never means supported or an order', async () => {
  const { receipt } = await resolve(document(), [document(2, '2409')]);
  assert.equal(receipt.evidenceStatus, 'awaiting_independent_review'); assert.equal(receipt.status, 'hypothesis');
  assert.equal(receipt.companyBasis.length, 1); assert.equal(receipt.hasResearchCue, true); assert.deepEqual(receipt.gaps, []);
});
test('IA03 no associations is legacy compatible and performs no DB queries', async () => {
  const mock = dbMock([]); const parsed = parseIndustryAssociations([{ symbol: '2409' }], cutoff);
  assert.equal(parsed.size, 0); assert.equal((await loadIndustryAssociations(mock.db, parsed, cutoff, clock)).size, 0);
  assert.equal(mock.calls.length, 0);
});
test('IA04 bounds enforce 3/company, 50/run, 100 distinct documents and exact keys before reads', () => {
  assert.throws(() => requests(Array(4).fill(input())));
  assert.throws(() => parseIndustryAssociations(Array.from({ length: 17 }, (_, i) => ({ symbol: String(2400 + i), associations: Array(3).fill(input()) })), cutoff));
  assert.throws(() => parseIndustryAssociations(Array.from({ length: 9 }, (_, i) => ({ symbol: String(2400 + i), associations: [
    { ...input(), companyBasisDocumentIds: Array.from({ length: 12 }, (_, j) => uuid(i * 12 + j + 2)) },
  ] })), cutoff));
  for (const invalid of [{ ...input(), verified: true }, { ...input(), sourceDocumentId: 1 }, { ...input(), companyBasisDocumentIds: [uuid(2), uuid(2)] },
    { ...input(), associatedAt: '2026-02-30T00:00:00Z' }, { ...input(), associatedAt: clock },
    { ...input(), hypothesis: 'cookie=synthetic-secret' }, { ...input(), sourceRootId: `${root}?token=secret` },
    { ...input(), hypothesis: ' full member text\n' }, { ...input(), relation: 'official_fact' }]) {
    assert.throws(() => parseIndustryAssociations([{ symbol: '2409', associations: [invalid] }], cutoff));
  }
});
test('IA05 canonical input deduplicates one company hypothesis but never merges different companies', async () => {
  const source = document(); const req = parseIndustryAssociations([
    { symbol: '2409', associations: [input(source), input(source)] }, { symbol: '2410', associations: [input(source)] },
  ], cutoff); const mock = dbMock([source]); const result = await loadIndustryAssociations(mock.db, req, cutoff, clock);
  assert.equal(result.get('2409')!.length, 1); assert.equal(result.get('2410')!.length, 1);
  assert.equal(result.get('2409')![0].source?.rootId, result.get('2410')![0].source?.rootId);
  assert.notEqual(result.get('2409')![0].associationHash, result.get('2410')![0].associationHash);
  assert.ok([...result.values()].flat().every((receipt) => receipt.directSourceContribution === 0));
});
test('IA06 server observation time is hash-bound and cannot be backfilled with writer associatedAt', async () => {
  const mock = dbMock([document()]); const a = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0];
  const b = (await loadIndustryAssociations(mock.db, requests(), cutoff, '2026-10-05T10:00:00.000Z')).get('2409')![0];
  assert.notEqual(a.associationHash, b.associationHash); assert.equal(a.associatedAt, '2026-10-01T06:00:00.000Z');
  assert.equal(a.availableAt, clock); assert.equal(a.usableAtCutoff, false);
  const { associationHash, ...payload } = a; assert.equal(associationHash, researchCanonicalHash(payload));
});
test('IA07 caller cannot bind a different root/hash or inject a direct symbol into industry evidence', async () => {
  for (const overrides of [{ sourceContentHash: 'b'.repeat(64) }, { sourceRootId: 'https://example.test/other' }]) {
    const { receipt } = await resolve(document(), [], overrides); assert.equal(receipt.source, null); assert.ok(receipt.gaps.includes('source_binding_mismatch'));
  }
  const fake = document(); fake.symbols = ['2409']; const { receipt } = await resolve(fake);
  assert.ok(receipt.gaps.includes('source_symbols_scope_invalid')); assert.equal(receipt.hasResearchCue, false);
});
test('IA08 same-row denied source invalidates even when the SQL RPC booleans are false', async () => {
  const source = document(); (source.metadata as Row).claim_status = 'denied';
  const { receipt } = await resolve(source); assert.equal(receipt.evidenceStatus, 'invalidated');
  assert.ok(receipt.gaps.includes('source_denied')); assert.equal(receipt.hasResearchCue, false);
});
test('IA09 direct or RPC retraction invalidates the hypothesis without dropping its input record', async () => {
  for (const rpc of [false, true]) {
    const source = document(); if (!rpc) (source.metadata as Row).retracted_at = '2026-08-02T01:00:00Z';
    const { receipt } = await resolve(source, [], {}, [{ id: source.id, headId: source.id, retracted: rpc, superseded: false }]);
    assert.equal(receipt.evidenceStatus, 'invalidated'); assert.equal(receipt.hypothesis, input().hypothesis);
    assert.ok(receipt.gaps.includes('source_retracted')); assert.equal(receipt.source, null);
  }
});
test('IA10 another head ID is rejected even if SQL reports superseded false', async () => {
  const source = document(); const { receipt } = await resolve(source, [], {}, [{ id: source.id, headId: uuid(4), retracted: false, superseded: false }]);
  assert.equal(receipt.evidenceStatus, 'needs_update'); assert.ok(receipt.gaps.includes('source_superseded'));
});
test('IA11 missing and future source records remain explicit gaps, not evidence', async () => {
  const missing = dbMock([]); const a = (await loadIndustryAssociations(missing.db, requests(), cutoff, clock)).get('2409')![0];
  assert.ok(a.gaps.includes('source_missing')); assert.equal(a.hasResearchCue, false);
  for (const key of ['published_at', 'collected_at']) {
    const source = document(); source[key] = clock; const { receipt } = await resolve(source);
    assert.equal(receipt.source, null); assert.equal(receipt.hasResearchCue, false);
    assert.ok(receipt.gaps.some((gap) => gap === 'source_clock_invalid' || gap === 'source_future_at_cutoff'));
  }
});
test('IA12 all four source clocks must be valid and ordered', async () => {
  for (const patch of [{ first_observed_at: '2026-02-30T01:00:00Z' }, { revision_observed_at: clock },
    { first_observed_at: '2026-07-01T01:00:00Z' }, { first_observed_at: null }]) {
    const source = document(); Object.assign(source.metadata as Row, patch); const { receipt } = await resolve(source);
    assert.equal(receipt.source, null); assert.ok(receipt.gaps.includes('source_clock_invalid'));
  }
});
test('IA13 nonself parent provenance is unresolved; self-parent is accepted as the same root', async () => {
  const source = document(); (source.metadata as Row).parent_source_url = 'https://example.test/original';
  const bad = await resolve(source); assert.ok(bad.receipt.gaps.includes('source_parent_unresolved')); assert.equal(bad.receipt.hasResearchCue, false);
  (source.metadata as Row).parent_source_url = root; assert.equal((await resolve(source)).receipt.source?.rootId, root);
});
test('IA14 contradictory latest same-clock variants fail closed across platform and scope', async () => {
  const source = document(); const sibling = structuredClone(source); sibling.id = uuid(8); sibling.platform = 'other_platform';
  (sibling.metadata as Row).subject_scope = 'company_mentions'; sibling.symbols = ['2409'];
  const mock = dbMock([source, sibling]); const result = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0];
  assert.equal(result.source, null); assert.equal(result.evidenceStatus, 'needs_update'); assert.ok(result.gaps.includes('source_conflicting_head'));
});
test('IA15 legacy fallback variants join the conflict audit while later revisions remain outside cutoff', async () => {
  const source = document(); const legacy = structuredClone(source); legacy.id = uuid(8); delete (legacy.metadata as Row).canonical_url;
  (legacy.metadata as Row).claim_status = 'rumor';
  for (const suffix of ['', '#si-revision-legacy']) {
    legacy.document_url = root + suffix; const mock = dbMock([source, legacy]);
    const receipt = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0];
    assert.ok(receipt.gaps.includes('source_conflicting_head'));
  }
  (legacy.metadata as Row).revision_observed_at = clock;
  const mock = dbMock([source, legacy]); assert.ok((await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0].source);
});
test('IA16 saturated version history is visibly incomplete rather than declaring a single trusted head', async () => {
  const source = document(); const docs = Array.from({ length: 50 }, (_, i) => ({ ...structuredClone(source), id: uuid(i + 1) }));
  const mock = dbMock(docs); const receipt = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0];
  assert.ok(receipt.gaps.includes('source_history_read_bound')); assert.equal(receipt.source, null);
});
test('IA17 basis must be direct company-specific evidence, current, not denied or withdrawn', async () => {
  const cases = [document(2, '2410'), document(2)];
  for (const basis of cases) {
    const { receipt } = await resolve(document(), [basis]); assert.equal(receipt.hasResearchCue, false);
    assert.ok(receipt.gaps.includes('basis_company_mismatch')); assert.equal(receipt.companyBasis.length, 0);
  }
  for (const patch of [{ claim_status: 'denied' }, { retracted_at: '2026-08-02T01:00:00Z' }]) {
    const basis = document(2, '2409'); Object.assign(basis.metadata as Row, patch);
    const { receipt } = await resolve(document(), [basis]); assert.equal(receipt.evidenceStatus, 'invalidated'); assert.equal(receipt.hasResearchCue, false);
  }
});
test('IA18 authenticated summaries retain rights proof without content or timed transcript export', async () => {
  const source = document(); Object.assign(source.metadata as Row, { visibility: 'authenticated_summary', rights_boundary: 'bounded_summary_only', acquisition_method: 'authenticated_browser_summary' });
  const { receipt } = await resolve(source); assert.equal(receipt.source?.rightsBoundary, 'bounded_summary_only');
  assert.ok(!JSON.stringify(receipt).includes('content_text')); assert.ok(!JSON.stringify(receipt).includes('timed_excerpts'));
  (source.metadata as Row).timed_excerpts = [{ text: 'private member text', startSeconds: 0, endSeconds: 10 }];
  assert.ok((await resolve(source)).receipt.gaps.includes('source_rights_invalid'));
});
test('IA19 metadata-only, chapter titles and contradictory rights cannot become a research cue', async () => {
  for (const patch of [{ content_form: 'chapter_titles' }, { rights_boundary: 'full_member_text' }, { acquisition_method: 'credential_export' }]) {
    const source = document(); Object.assign(source.metadata as Row, patch); const { receipt } = await resolve(source);
    assert.equal(receipt.source, null); assert.equal(receipt.hasResearchCue, false);
  }
});
test('IA20 query failure or malicious returned IDs produce bounded unavailable receipts without raw errors', async () => {
  for (const options of [{ fail: true }, { duplicateDirect: true }, { extraHead: true }]) {
    const mock = dbMock([document(), document(2, '2409')], options);
    const receipt = (await loadIndustryAssociations(mock.db, requests([input(document(), [uuid(2)])]), cutoff, clock)).get('2409')![0];
    assert.equal(receipt.evidenceStatus, 'unavailable'); assert.equal(receipt.source, null); assert.equal(receipt.hasResearchCue, false);
    assert.ok(!JSON.stringify(receipt).includes('private connection secret'));
  }
});
test('IA25 malformed SQL-group members cannot vanish from same-root revision audit', async () => {
  for (const malformed of ['scalar', 'array', 'metadata']) {
    const source = document(); const sibling = structuredClone(source); sibling.id = uuid(8);
    if (malformed === 'metadata') sibling.metadata = [];
    else (sibling.metadata as Row).insider_evidence = malformed === 'array' ? [] : 'bad identity';
    const mock = dbMock([source, sibling]); const receipt = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock)).get('2409')![0];
    assert.equal(receipt.source, null); assert.ok(receipt.gaps.includes('source_history_identity_invalid'));
  }
});
test('IA26 non-array transcript metadata is not an authenticated bounded summary', async () => {
  for (const invalid of ['member text', { text: 'member text' }]) {
    const source = document(); Object.assign(source.metadata as Row, { visibility: 'authenticated_summary', rights_boundary: 'bounded_summary_only',
      acquisition_method: 'authenticated_browser_summary', timed_excerpts: invalid });
    assert.ok((await resolve(source)).receipt.gaps.includes('source_rights_invalid'));
  }
});
test('IA21 deadline returns an accounted gap and aborts the bounded database read', async () => {
  const mock = dbMock([document()], { hang: true });
  const receipt = (await loadIndustryAssociations(mock.db, requests(), cutoff, clock, { deadlineMs: 10 })).get('2409')![0];
  assert.equal(receipt.evidenceStatus, 'unavailable'); assert.ok(receipt.gaps.includes('read_deadline'));
  assert.ok(mock.calls[0].signal?.aborted);
});
test('IA22 body/metadata size bound prevents unbounded receipt propagation', async () => {
  const source = document(); (source.metadata as Row).untrusted = 'x'.repeat(ASSOCIATION_LIMITS.responseBytes);
  const { receipt } = await resolve(source); assert.equal(receipt.evidenceStatus, 'unavailable'); assert.ok(receipt.gaps.includes('read_bound_exceeded'));
});
test('IA23 large allowed document sets split direct and RPC reads at 50', async () => {
  const source = document(); const docs = [source, ...Array.from({ length: 59 }, (_, i) => document(i + 2, '2409'))];
  const req = parseIndustryAssociations(Array.from({ length: 5 }, (_, i) => ({ symbol: String(2409 + i), associations: [
    input(source, docs.slice(i * 12 + 1, i * 12 + 13).map((doc) => String(doc.id))),
  ] })), cutoff);
  const mock = dbMock(docs); await loadIndustryAssociations(mock.db, req, cutoff, clock);
  assert.deepEqual(mock.calls.filter((call) => call.kind === 'select' && call.ids).map((call) => call.ids!.length), [50, 10]);
  assert.deepEqual(mock.calls.filter((call) => call.kind === 'heads').map((call) => call.ids!.length), [50, 10]);
  assert.ok(mock.calls.every((call) => call.limit === undefined || call.limit <= 50));
});
test('IA24 escaped canonical URLs cannot broaden the PostgREST conflict query', async () => {
  const source = document(); const url = 'https://example.test/path_%25*?a=(x),y&b=%22z%22';
  (source.metadata as Row).canonical_url = url; source.document_url = url;
  const mock = dbMock([source]); const receipt = (await loadIndustryAssociations(mock.db, requests([input(source)]), cutoff, clock)).get('2409')![0];
  assert.equal(receipt.source?.rootId, url); assert.ok(mock.calls.some((call) => call.filter?.includes('document_url.match.')));
});
test('IA27 requesting an old revision does not erase the valid current receipt for the same root', async () => {
  const old = document(); const current = structuredClone(old); current.id = uuid(2);
  current.canonical_content_hash = 'c'.repeat(64); current.document_url = `${root}#si-revision-${'c'.repeat(16)}`;
  Object.assign(current.metadata as Row, { content_hash: current.canonical_content_hash, revision_observed_at: '2026-09-01T01:00:00Z' });
  current.collected_at = '2026-09-01T01:00:00Z';
  const mock = dbMock([old, current], { heads: [old, current].map((doc) => ({ id: doc.id, headId: current.id, superseded: doc.id !== current.id, retracted: false })) });
  const receipts = (await loadIndustryAssociations(mock.db, requests([input(old), input(current)]), cutoff, clock)).get('2409')!;
  assert.ok(receipts.find((receipt) => receipt.sourceDocumentId === old.id)!.gaps.includes('source_superseded'));
  assert.equal(receipts.find((receipt) => receipt.sourceDocumentId === current.id)!.hasResearchCue, true);
});
for (const [caseId, label, patch] of [
  ['IA28', 'nonempty authenticated excerpts', { timed_excerpts: [{ text: 'not permitted in an authenticated summary', startSeconds: 0, endSeconds: 10 }] }],
  ['IA29', 'string authenticated excerpts', { timed_excerpts: 'malformed private transcript metadata' }],
  ['IA30', 'mismatched metadata content hash', { content_hash: 'f'.repeat(64) }],
] as const) test(`${caseId} the healthy UUID009 winner cannot hide UUID008 with ${label}`, async () => {
  const source = document(); source.id = uuid(9);
  Object.assign(source.metadata as Row, { visibility: 'authenticated_summary', rights_boundary: 'bounded_summary_only',
    acquisition_method: 'authenticated_browser_summary' });
  const sibling = structuredClone(source); sibling.id = uuid(8); sibling.platform = 'legacy_threads'; Object.assign(sibling.metadata as Row, patch);
  // Exact RPC outcome reproduced in PostgreSQL: same root/revision/hash, UUID009
  // wins the final ID tie break and both head booleans remain false.
  const heads = [{ id: source.id, headId: source.id, retracted: false, superseded: false }];
  const mock = dbMock([source, sibling], { heads });
  const receipt = (await loadIndustryAssociations(mock.db, requests([input(source)]), cutoff, clock)).get('2409')![0];
  assert.equal(receipt.source, null); assert.equal(receipt.hasResearchCue, false);
  assert.equal(receipt.evidenceStatus, 'needs_update'); assert.ok(receipt.gaps.includes('source_conflicting_head'));
  assert.equal(receipt.status, 'hypothesis'); assert.equal(receipt.directSourceContribution, 0);
});
test('IA31 every maximum-clock sibling must pass identity and clock invariants beyond signature fields', async () => {
  for (const patch of [{ platform: 'Invalid platform' }, { document_url: `${root}#si-revision-wrong` },
    { collected_at: '2026-08-01T02:00:00Z' }]) {
    const source = document(); source.id = uuid(9); const sibling = structuredClone(source); sibling.id = uuid(8); sibling.platform = 'legacy_threads';
    Object.assign(sibling, patch);
    const mock = dbMock([source, sibling], { heads: [{ id: source.id, headId: source.id, retracted: false, superseded: false }] });
    const receipt = (await loadIndustryAssociations(mock.db, requests([input(source)]), cutoff, clock)).get('2409')![0];
    assert.equal(receipt.source, null); assert.equal(receipt.hasResearchCue, false); assert.equal(receipt.evidenceStatus, 'needs_update');
    assert.ok(receipt.gaps.some((gap) => gap === 'source_history_identity_invalid' || gap === 'source_history_clock_invalid'));
  }
});
test('IA32 null/unknown company-basis sibling scope cannot normalize into a valid legacy mention', async () => {
  for (const scope of [null, 'unknown', 'industry_context']) {
    const source = document(); const basis = document(9, '2409'); const sibling = structuredClone(basis);
    sibling.id = uuid(8); sibling.platform = 'legacy_threads'; (sibling.metadata as Row).subject_scope = scope;
    const mock = dbMock([source, basis, sibling], { heads: [source, basis].map((doc) => ({ id: doc.id, headId: doc.id, retracted: false, superseded: false })) });
    const receipt = (await loadIndustryAssociations(mock.db, requests([input(source, [String(basis.id)])]), cutoff, clock)).get('2409')![0];
    assert.equal(receipt.companyBasis.length, 0); assert.equal(receipt.hasResearchCue, false);
    assert.equal(receipt.evidenceStatus, 'needs_update'); assert.ok(receipt.gaps.includes('basis_conflicting_head'));
  }
});
test('IA33 a genuinely omitted legacy company scope remains compatible with explicit company_mentions', async () => {
  const source = document(); const basis = document(9, '2409'); const sibling = structuredClone(basis);
  sibling.id = uuid(8); sibling.platform = 'legacy_threads'; delete (sibling.metadata as Row).subject_scope;
  const mock = dbMock([source, basis, sibling], { heads: [source, basis].map((doc) => ({ id: doc.id, headId: doc.id, retracted: false, superseded: false })) });
  const receipt = (await loadIndustryAssociations(mock.db, requests([input(source, [String(basis.id)])]), cutoff, clock)).get('2409')![0];
  assert.equal(receipt.evidenceStatus, 'awaiting_independent_review'); assert.equal(receipt.hasResearchCue, true);
  assert.deepEqual(receipt.gaps, []);
});
