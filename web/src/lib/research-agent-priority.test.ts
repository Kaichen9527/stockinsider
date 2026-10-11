import assert from 'node:assert/strict';
import test from 'node:test';
import { selectResearchPriority, type ResearchPriorityCandidate } from './research-agent-priority.ts';

const asOf = '2026-09-29T10:00:00Z';
function candidate(symbol: string, overrides: Partial<ResearchPriorityCandidate> = {}): ResearchPriorityCandidate {
  return {
    symbol, sector: '電子', lane: 'general', inProgress: false, disposition: 'queued',
    roots: [{ rootId: `story-${symbol}`, url: `https://example.org/${symbol}`,
      publishedAt: '2026-09-27T10:00:00Z', firstObservedAt: '2026-09-28T10:00:00Z',
      kind: 'news', status: 'current' }],
    attempts: [{ platform: 'news', status: 'success', attemptedAt: asOf }],
    profitImpact: { level: 2, reason: '獲利傳導仍需估算' },
    novelty: { level: 2, reason: '本週出現新的線索' },
    researchability: { level: 2, reason: '可取得公開資料' }, ...overrides,
  };
}

test('one original story shared by many reposts gives one attention root', () => {
  const first = candidate('2409');
  first.roots.push({ ...first.roots[0], url: 'https://example.net/repost' });
  const result = selectResearchPriority({ candidates: [first], asOf });
  assert.equal(result.queue[0].independentRootCount, 1);
  assert.equal(result.queue[0].rootIds.length, 1);
});

test('a retraction removes evidence, and a failed source is not scored as zero attention', () => {
  const known = candidate('2409');
  const unavailable = candidate('3481', {
    attempts: [{ platform: 'news', status: 'failed', attemptedAt: asOf }],
  });
  const changed = candidate('2360', {
    roots: [candidate('2360').roots[0], { ...candidate('2360').roots[0],
      status: 'retracted', firstObservedAt: '2026-09-29T09:00:00Z' }],
  });
  const result = selectResearchPriority({ candidates: [known, unavailable, changed], asOf });
  assert.equal(result.rows.find((row) => row.symbol === '2360')?.independentRootCount, 0);
  assert.equal(result.rows.find((row) => row.symbol === '3481')?.scoreStatus, 'partial_source_failure');
  assert.ok(result.rows.find((row) => row.symbol === '3481')!.score > 0);
  assert.equal(result.rows.find((row) => row.symbol === '2409')?.scoreStatus, 'complete');
});

test('in-progress research retains its lane seat, with a bounded emerging lane', () => {
  const candidates = Array.from({ length: 22 }, (_, index) => candidate(String(1000 + index), {
    lane: index >= 16 ? 'emerging' : 'general',
    inProgress: index === 15,
    profitImpact: { level: index === 15 ? 0 : 3, reason: '有明確的產品收入路徑' },
  }));
  const result = selectResearchPriority({ candidates, asOf });
  assert.equal(result.queue.length, 20);
  assert.ok(result.queue.some((row) => row.symbol === '1015'));
  assert.equal(result.queue.filter((row) => row.lane === 'emerging').length, 5);
  assert.equal(result.expectedCount, result.accountedCount);
  assert.equal(result.unselected.length, 2);
});

test('future evidence, duplicates, and missing reasons fail closed', () => {
  assert.throws(() => selectResearchPriority({ candidates: [candidate('2409'), candidate('2409')], asOf }), /duplicate/);
  assert.throws(() => selectResearchPriority({ candidates: [candidate('2409', {
    roots: [{ ...candidate('2409').roots[0], firstObservedAt: '2026-09-30T00:00:00Z' }],
  })], asOf }), /future/);
  assert.throws(() => selectResearchPriority({ candidates: [candidate('2409', {
    profitImpact: { level: 4, reason: '' },
  })], asOf }), /invalid/);
});
