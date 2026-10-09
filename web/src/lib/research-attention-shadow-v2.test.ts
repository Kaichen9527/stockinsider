import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResearchPriority, type ResearchSourceRoot } from './research-agent-priority.ts';
import { analyzeResearchAttentionShadow as analyze, type ReviewedResearchOriginBinding } from './research-attention-shadow-v2.ts';

const asOf = '2026-10-09T04:00:00Z';
function root(id: string, patch: Partial<ResearchSourceRoot> = {}): ResearchSourceRoot {
  return { rootId: id, url: `https://example.org/${id}`, publishedAt: '2026-10-08T04:00:00Z',
    firstObservedAt: '2026-10-08T06:00:00Z', revisionObservedAt: '2026-10-08T06:00:00Z',
    revisionId: `revision-${id}`, kind: 'social_rumor', status: 'current', ...patch };
}
function binding(r: ResearchSourceRoot, publisherId = r.rootId, originId = r.rootId): ReviewedResearchOriginBinding {
  return { rootId: r.rootId, revisionId: r.revisionId!, publisherId, originId,
    evidenceRef: 'sha256:' + 'a'.repeat(64), observedAt: asOf, reviewedAt: asOf };
}
const analyzeRoots = (roots: ResearchSourceRoot[], originBindings: ReviewedResearchOriginBinding[] = []) => analyze({ asOf, roots, originBindings });

test('old public material acquired today is a discovery, not recent discussion or attention', () => {
  const r = root('podcast', { publishedAt: '2026-03-16T22:30:00Z', firstObservedAt: asOf, revisionObservedAt: asOf });
  const result = analyzeRoots([r], [binding(r)]);
  assert.equal(result.acquisitionRecentRootCount, 1); assert.equal(result.publicationRecentRootCount, 0);
  assert.equal(result.verifiedIndependentCount, 1); assert.equal(result.recentIndependentCount, 0);
  assert.equal(result.shadowAttentionLevel, 0); assert.equal(result.productionAdopted, false);
  assert.equal(result.authenticatedController, false);
});
test('same canonical publisher keeps different topics/URLs but contributes one reviewed voice', () => {
  const a = root('podcast'), b = root('web');
  const result = analyzeRoots([a, b], [binding(a, 'same-publisher', 'topic-a'), binding(b, 'same-publisher', 'topic-b')]);
  assert.equal(result.currentRootCount, 2); assert.equal(result.publicationRecentRootCount, 2);
  assert.equal(result.verifiedIndependentCount, 1); assert.equal(result.shadowAttentionLevel, 1);
});
test('shared origin across publishers is one confirmation; independent origins and publishers are two', () => {
  const a = root('a'), b = root('b');
  assert.equal(analyzeRoots([a, b], [binding(a, 'p1', 'o'), binding(b, 'p2', 'o')]).verifiedIndependentCount, 1);
  assert.equal(analyzeRoots([a, b], [binding(a, 'p1', 'o1'), binding(b, 'p2', 'o2')]).verifiedIndependentCount, 2);
});
test('legacy original flag or absent parent never supplies reviewed independent identity', () => {
  const a = root('a', { isOriginalSource: true });
  const result = analyzeRoots([a]);
  assert.equal(result.verifiedIndependentCount, 0); assert.deepEqual(result.unknownIndependenceRootIds, ['a']);
  assert.equal(result.independenceCoverage, 'partial_or_unknown'); assert.equal(result.currentRootCount, 1);
});
test('publisher-origin bridge components are conservative and permutation invariant', () => {
  const roots = [root('a'), root('b'), root('c')];
  const edges = [binding(roots[0], 'A', 'X'), binding(roots[1], 'A', 'Y'), binding(roots[2], 'B', 'Y')];
  const result = analyzeRoots(roots, edges); assert.equal(result.verifiedIndependentCount, 1);
  for (const rs of [roots, [...roots].reverse(), [roots[1], roots[0], roots[2]]])
    for (const es of [edges, [...edges].reverse()]) assert.deepEqual(analyzeRoots(rs, es), result);
});
test('new repost cannot move an older origin into the recent publication bucket', () => {
  const old = root('old', { publishedAt: '2026-09-29T04:00:00Z' }), fresh = root('fresh');
  const result = analyzeRoots([old, fresh], [binding(old, 'p1', 'shared'), binding(fresh, 'p2', 'shared')]);
  assert.equal(result.publicationRecentRootCount, 1); assert.equal(result.publicationPriorRootCount, 1);
  assert.equal(result.recentIndependentCount, 0); assert.equal(result.priorIndependentCount, 1);
  assert.equal(result.shadowAttentionLevel, 0);
});
test('exact seven/fourteen-day boundaries are disjoint and acquisition stays separate', () => {
  const roots = [root('cut', { publishedAt: asOf, firstObservedAt: asOf, revisionObservedAt: asOf }),
    root('seven', { publishedAt: '2026-10-02T04:00:00Z' }), root('fourteen', { publishedAt: '2026-09-25T04:00:00Z' })];
  const result = analyzeRoots(roots, roots.map((r) => binding(r)));
  assert.equal(result.publicationRecentRootCount, 1); assert.equal(result.publicationPriorRootCount, 1);
  assert.equal(result.verifiedIndependentCount, 3); assert.equal(result.recentIndependentCount, 1);
  assert.equal(result.priorIndependentCount, 1); assert.equal(result.shadowAttentionLevel, 0);
});
test('distinct prior-week voices reduce attention without deleting current evidence', () => {
  const a = root('a'), b = root('b', { publishedAt: '2026-09-30T04:00:00Z' });
  const result = analyzeRoots([a, b], [binding(a), binding(b)]);
  assert.equal(result.verifiedIndependentCount, 2); assert.equal(result.shadowAttentionLevel, 0);
});
test('stale binding cannot authorize a corrected selected revision', () => {
  const old = root('a'), revised = root('a', { revisionId: 'new', revisionObservedAt: asOf });
  const result = analyzeRoots([old, revised], [binding(old)]);
  assert.equal(result.currentRootCount, 1); assert.equal(result.verifiedIndependentCount, 0);
  assert.equal(result.unusedBindingCount, 1); assert.deepEqual(result.unknownIndependenceRootIds, ['a']);
  const fresh = analyzeRoots([old, revised], [binding(revised)]);
  assert.equal(fresh.verifiedIndependentCount, 1);
});
test('canonical parent root dedup and original withdrawal outrank later repost', () => {
  const original = root('canonical', { isOriginalSource: true, status: 'retracted' });
  const repost = root('canonical', { isOriginalSource: false, revisionId: 'newer', revisionObservedAt: asOf,
    url: 'https://example.net/repost', firstObservedAt: asOf });
  const result = analyzeRoots([repost, original], [binding(original)]);
  assert.equal(result.currentRootCount, 0); assert.equal(result.verifiedIndependentCount, 0);
});
test('metadata-only and contradicted roots do not become confirmations', () => {
  const roots = [root('meta', { kind: 'metadata_only' }), root('denied', { status: 'contradicted' })];
  assert.equal(analyzeRoots(roots, roots.map((r) => binding(r))).verifiedIndependentCount, 0);
  assert.equal(analyzeRoots(roots).currentRootCount, 0);
});
test('v1 root/revision selection stays equivalent and baseline is echoed separately', () => {
  const roots = [root('a'), root('a', { revisionId: 'z', status: 'retracted' }), root('b'),
    root('c', { kind: 'metadata_only' }), root('d', { isOriginalSource: false }),
    root('d', { isOriginalSource: true, revisionId: 'original', status: 'contradicted' })];
  const candidate = { symbol: '5347', sector: '電子', lane: 'general' as const, inProgress: false,
    disposition: 'queued' as const, roots, attempts: [{ platform: 'podcast', status: 'success' as const, attemptedAt: asOf }],
    profitImpact: { level: 0 as const, reason: '未估獲利' }, novelty: { level: 0 as const, reason: '未判新意' },
    researchability: { level: 0 as const, reason: '尚未研究' } };
  const row = selectResearchPriority({ candidates: [candidate], asOf }).rows[0];
  const baseline = { policyVersion: row.policyVersion, score: row.score, independentRootCount: row.independentRootCount };
  const result = analyze({ asOf, roots, originBindings: [], v1Baseline: baseline });
  assert.deepEqual(result.rootIds, row.rootIds); assert.equal(result.currentRootCount, row.independentRootCount);
  assert.deepEqual(result.v1Baseline, baseline); assert.equal(result.shadowAttentionLevel, 0);
  assert.equal(Object.hasOwn(result, 'score'), false);
});
test('equal-time revision ties match v1; contradictory identities reject', () => {
  const a = root('a'), z = root('a', { revisionId: 'zz', status: 'retracted' });
  assert.equal(analyzeRoots([a, z]).currentRootCount, 0);
  assert.deepEqual(analyzeRoots([a, z]), analyzeRoots([z, a]));
  assert.throws(() => analyzeRoots([a, { ...a, kind: 'metadata_only' }]), /shadow_invalid/);
});
test('future or pre-revision origin reviews, duplicate and contradictory bindings reject', () => {
  const r = root('a'), b = binding(r);
  for (const edges of [[b, b], [b, { ...b, originId: 'another' }], [{ ...b, reviewedAt: '2026-10-10T00:00:00Z' }],
    [{ ...b, observedAt: '2026-10-07T00:00:00Z' }], [{ ...b, reviewedAt: '2026-10-08T12:00:00Z' }]])
    assert.throws(() => analyzeRoots([r], edges), /shadow_invalid/);
});
test('sub-millisecond cutoff and source review clocks retain supplied precision', () => {
  const cutoff = '2026-10-09T04:00:00.000100Z';
  const r = root('micro', { revisionObservedAt: '2026-10-09T04:00:00.000090Z' });
  const b = { ...binding(r), observedAt: '2026-10-09T04:00:00.000090Z', reviewedAt: cutoff };
  assert.equal(analyze({ asOf: cutoff, roots: [r], originBindings: [b] }).verifiedIndependentCount, 1);
  for (const invalid of [{ ...b, reviewedAt: '2026-10-09T04:00:00.000200Z' },
    { ...b, observedAt: '2026-10-09T04:00:00.000080Z', reviewedAt: '2026-10-09T04:00:00.000080Z' }])
    assert.throws(() => analyze({ asOf: cutoff, roots: [r], originBindings: [invalid] }), /shadow_invalid/);
});
test('fractional bucket boundaries and equivalent timezone offsets compare exactly', () => {
  const cutoff = '2026-10-09T04:00:00.0000000000000000001Z';
  const roots = [root('exact', { publishedAt: '2026-10-02T04:00:00.0000000000000000001Z' }),
    root('after', { publishedAt: '2026-10-02T04:00:00.0000000000000000002Z' })];
  const bindings = roots.map((r) => ({ ...binding(r), observedAt: asOf,
    reviewedAt: '2026-10-09T12:00:00+08:00' }));
  const result = analyze({ asOf: cutoff, roots, originBindings: bindings });
  assert.equal(result.publicationRecentRootCount, 1); assert.equal(result.publicationPriorRootCount, 1);
  const boundary = root('offset', { publishedAt: '2026-10-02T12:00:00.000100+08:00' });
  assert.equal(analyze({ asOf: '2026-10-09T04:00:00.000100Z', roots: [boundary],
    originBindings: [binding(boundary)] }).publicationPriorRootCount, 1);
});
test('v1-ambiguous fractional revision or Unicode collation ties reject in either permutation', () => {
  const a = root('a', { revisionId: 'é' }), b = { ...a, revisionId: 'e\u0301' };
  const earlier = root('a', { revisionObservedAt: '2026-10-08T06:00:00.000080Z' });
  const later = { ...earlier, revisionObservedAt: '2026-10-08T06:00:00.000090Z' };
  for (const pair of [[a, b], [b, a], [earlier, later], [later, earlier]])
    assert.throws(() => analyzeRoots(pair, [binding(pair[0])]), /shadow_invalid/);
});
test('missing revision leaves independence unknown; no supplied binding is inferred', () => {
  const r = root('a', { revisionId: undefined });
  const result = analyzeRoots([r], [binding(root('a'))]);
  assert.equal(result.verifiedIndependentCount, 0); assert.deepEqual(result.unknownIndependenceRootIds, ['a']);
});
test('invalid enum/clock/identifier/field/prototype and credential URL reject', () => {
  for (const patch of [{ status: 'unknown' }, { kind: 'unknown' }, { firstObservedAt: '2026-03-01T00:00:00Z' },
    { publishedAt: '2026-02-30T00:00:00Z' }, { rootId: '  ' }, { revisionId: '界'.repeat(171) },
    { url: 'https://user:pass@example.org/' }, { authorId: 'pretend' }, { publishedAt: '2026-10-10T00:00:00Z' }])
    assert.throws(() => analyzeRoots([root('a', patch as Partial<ResearchSourceRoot>)]));
  assert.throws(() => analyzeRoots([Object.assign(Object.create({}), root('a'))]));
  assert.throws(() => analyze({ asOf, roots: [], originBindings: [], verified: true } as never));
  assert.throws(() => analyzeRoots([root('a')], [{ ...binding(root('a')), evidenceRef: 'x'.repeat(2049) }]));
});
test('input count and total byte limits reject while 20,000 rows run with bounded graph traversal', () => {
  const roots = Array.from({ length: 20_000 }, (_, i) => root(`r${i}`));
  const result = analyzeRoots(roots, roots.map((r) => binding(r)));
  assert.equal(result.currentRootCount, 20_000); assert.equal(result.recentIndependentCount, 20_000);
  assert.equal(result.shadowAttentionLevel, 4);
  assert.throws(() => analyzeRoots([...roots, root('overflow')]), /shadow_invalid/);
  assert.throws(() => analyzeRoots([], Array.from({ length: 20_001 }, () => binding(root('a')))), /shadow_invalid/);
  const large = roots.slice(0, 9000).map((r) => ({ ...r, url: `https://example.org/${'x'.repeat(1900)}` }));
  assert.throws(() => analyzeRoots(large), /shadow_invalid/);
});
