import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInsiderEvidence, type InsiderEvidence } from './research-insider-evidence.ts';
import { researchRootKind, researchRootFromDocument } from './research-source-roots.ts';
import { validateResearchInboxItem, type ResearchInboxItem } from './research-inbox.ts';
import { selectResearchPriority, type ResearchPriorityCandidate } from './research-agent-priority.ts';
import { discoveryPricePhase, discoveryRelativeReturns, validateDiscoverySourceBindings, type DiscoveryFactor } from './research-discovery-evidence.ts';

test('a factor binds the matching root and cannot predate a withdrawal or revision', () => {
  const factor: DiscoveryFactor = { factor: 'rumor', status: 'available', explanation: '客戶驗證傳聞',
    documentIds: ['document'], rootIds: ['root'], availableAt: '2026-10-02T00:00:00Z' };
  const source = { documentId: 'document', rootId: 'root', availableAt: factor.availableAt!, usable: true };
  validateDiscoverySourceBindings([factor], [source]);
  assert.throws(() => validateDiscoverySourceBindings([{ ...factor, rootIds: ['other'] }], [source]), /binding_invalid/u);
  assert.throws(() => validateDiscoverySourceBindings([factor], [{ ...source, availableAt: '2026-10-03T00:00:00Z' }]), /binding_invalid/u);
  assert.throws(() => validateDiscoverySourceBindings([factor], [{ ...source, usable: false }]), /binding_invalid/u);
  validateDiscoverySourceBindings([{ ...factor, status: 'conflicted' }], [{ ...source, usable: false }]);
});

const item: ResearchInboxItem = { sourcePlatform: 'youtube', sourceUrl: 'https://www.youtube.com/watch?v=abc',
  author: 'publisher', publishedAt: '2026-10-01T00:00:00Z', observedAt: '2026-10-02T00:00:00Z', symbols: ['2409'],
  shortSummary: '公開逐字稿提到客戶仍在驗證', catalyst: '客戶驗證成功後可能試產', risk: '沒有已確認訂單',
  claimStatus: 'rumor', visibility: 'public', contentForm: 'transcript_excerpt', acquisitionMethod: 'publisher_transcript',
  timedExcerpts: [{ startSeconds: 80, endSeconds: 95, text: '驗證仍在進行' }] };
test('new platforms retain timecodes and reject impossible/private transcript excerpts', () => {
  assert.equal(validateResearchInboxItem(item), true);
  for (const sourcePlatform of ['podcast', 'telegram', 'bulltalk', 'twse_insider'])
    assert.equal(validateResearchInboxItem({ ...item, sourcePlatform }), true);
  assert.equal(validateResearchInboxItem({ ...item, visibility: 'authenticated_summary' }), false);
  assert.equal(validateResearchInboxItem({ ...item, timedExcerpts: [{ startSeconds: 90, endSeconds: 80, text: 'x' }] }), false);
  assert.equal(validateResearchInboxItem({ ...item, revisionObservedAt: '2026-10-03T00:00:00Z' }), false);
  assert.equal(validateResearchInboxItem({ ...item, sourceUrl: item.sourceUrl + '&access_token=fixture' }), false);
  assert.equal(validateResearchInboxItem({ ...item, sourceUrl: 'https://user:password@example.com/post' }), false);
});
test('prefixed social summaries and unreviewed issuer domains cannot become official roots', () => {
  assert.equal(researchRootKind('research_inbox_threads', 'www.auo.com', { claim_status: 'confirmed' }), 'social_rumor');
  assert.equal(researchRootKind('official', 'www.auo.com', {}, ['www.auo.com']), 'official_verified');
  assert.equal(researchRootKind('official', 'fake.www.auo.com', {}, ['www.auo.com']), 'news');
  assert.equal(researchRootKind('broker', 'example.com', { visibility: 'authenticated_summary' }), 'news');
});
test('a correction observed tomorrow is excluded from a historical cutoff', () => {
  assert.equal(researchRootFromDocument({ platform: 'research_inbox_threads', document_url: item.sourceUrl,
    published_at: item.publishedAt, collected_at: item.observedAt,
    metadata: { revision_observed_at: '2026-10-03T00:00:00Z' } }, item.observedAt), null);
});
test('same-time retraction wins regardless of input order without creating new attention', () => {
  const root = { rootId: 'r', url: item.sourceUrl, kind: 'social_rumor' as const,
    publishedAt: item.publishedAt, firstObservedAt: item.observedAt, revisionObservedAt: item.observedAt };
  const candidate: ResearchPriorityCandidate = { symbol: '2409', sector: 'display', roots: [], attempts: [],
    profitImpact: { level: 1, reason: '客戶仍待確認' }, novelty: { level: 1, reason: '已知技術驗證' },
    researchability: { level: 1, reason: '缺少公開訂單' }, lane: 'emerging', inProgress: false, disposition: 'queued' };
  for (const roots of [[{ ...root, status: 'current' as const }, { ...root, status: 'retracted' as const }],
    [{ ...root, status: 'retracted' as const }, { ...root, status: 'current' as const }]]) {
    assert.equal(selectResearchPriority({ candidates: [{ ...candidate, roots }], asOf: item.observedAt })
      .rows[0].independentRootCount, 0);
  }
});
test('insider dataset entries remain distinct and intended transfers do not imply actual selling', () => {
  const evidence: InsiderEvidence = { kind: 'transfer_declaration', symbol: '2409', person: '甲', role: '董事',
    reportPeriod: '2026-09', sourceUrl: 'https://openapi.twse.com.tw/dataset', transferMethod: '信託',
    currentShares: 500, comparablePriorShares: null, declaredShares: 100, confirmedShares: null };
  const first = buildInsiderEvidence(evidence);
  assert.notEqual(first.documentUrl, buildInsiderEvidence({ ...evidence, person: '乙' }).documentUrl);
  assert.notEqual(first.documentUrl, buildInsiderEvidence({ ...evidence, symbol: '2330' }).documentUrl);
  assert.equal(first.tradingDirection, 'not_confirmed_transaction');
  assert.equal(first.comparableChange, null);
});
test('missing prices never qualify as early discovery; relative returns require aligned sessions', () => {
  assert.equal(discoveryPricePhase({ close: null, ma20: null, atr14: null, rsi14: null,
    breakoutConfirmed: false, pullbackConfirmed: false, officialDatasetVerified: false }), 'unknown');
  const prices = Array.from({ length: 6 }, (_, i) => ({ session: `2026-09-${20 + i}`,
    close: 10 + i, availableAt: '2026-10-01T00:00:00Z' }));
  assert.equal(discoveryRelativeReturns(prices, [], item.observedAt).relative5d, null);
  assert.equal(discoveryRelativeReturns(prices, prices, item.observedAt).relative5d, 0);
  assert.equal(discoveryRelativeReturns(prices, prices.slice(1), item.observedAt).relative5d, null);
});

test('a successful scope cannot erase another failed scope; chapter indexes contribute no attention', () => {
  const root = { rootId: 'r', url: item.sourceUrl, kind: 'metadata_only' as const,
    publishedAt: item.publishedAt, firstObservedAt: item.observedAt, status: 'current' as const };
  const candidate: ResearchPriorityCandidate = { symbol: '2409', sector: 'display', roots: [root],
    attempts: [{ platform: 'youtube', scope: 'channel A transcript', status: 'failed', attemptedAt: item.observedAt },
      { platform: 'youtube', scope: 'channel B index', status: 'success', attemptedAt: item.observedAt }],
    profitImpact: { level: 0, reason: '未取得內容證據' }, novelty: { level: 0, reason: '只有節目索引' },
    researchability: { level: 0, reason: '內容尚未查核' }, lane: 'general', inProgress: false, disposition: 'needs_evidence' };
  const row = selectResearchPriority({ candidates: [candidate], asOf: item.observedAt }).rows[0];
  assert.equal(row.score, 0);
  assert.equal(row.independentRootCount, 0);
  assert.deepEqual(row.missingPlatforms, ['youtube']);
});

test('later reposts cannot revive an original source withdrawal', () => {
  const root = { rootId: 'original', url: item.sourceUrl, kind: 'social_rumor' as const,
    publishedAt: item.publishedAt, firstObservedAt: item.observedAt };
  const candidate: ResearchPriorityCandidate = { symbol: '2409', sector: 'display',
    roots: [{ ...root, status: 'retracted', isOriginalSource: true },
      { ...root, status: 'current', isOriginalSource: false, revisionObservedAt: '2026-10-03T00:00:00Z' }],
    attempts: [], profitImpact: { level: 0, reason: '傳聞已經撤回' }, novelty: { level: 0, reason: '重貼沒有新證據' },
    researchability: { level: 0, reason: '需等待新證據' }, lane: 'general', inProgress: false, disposition: 'needs_evidence' };
  for (const roots of [candidate.roots, [...candidate.roots].reverse()])
    assert.equal(selectResearchPriority({ candidates: [{ ...candidate, roots }], asOf: '2026-10-04T00:00:00Z' })
      .rows[0].independentRootCount, 0);
});
