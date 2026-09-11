import assert from 'node:assert/strict';
import test from 'node:test';
import { candidateStageCounts, compactCandidateStageForSnapshot, paginateCandidateStage } from './radar-stage-pagination.ts';
import type { CandidateStageCard, RadarDailyPayload } from './types.ts';

function card(index: number): CandidateStageCard {
  return { symbol: String(1000 + index) } as CandidateStageCard;
}

test('compaction preserves candidate revision and stale authority for found and actionable', () => {
  for (const lifecycleStage of ['found', 'actionable'] as const) {
    const original = { ...card(1), lifecycleStage, valuation: { status: 'missing' }, technical: {},
      consecutiveCloses: { passed: 1, required: 2 }, stale: true,
      detailRevisionId: '11111111-2222-4333-8444-555555555555',
      detailHref: '/stock/1001?candidateRevision=11111111-2222-4333-8444-555555555555',
    } as CandidateStageCard;
    const compact = compactCandidateStageForSnapshot(original);
    assert.equal(compact.detailRevisionId, original.detailRevisionId);
    assert.equal(compact.detailHref, original.detailHref);
    assert.equal(compact.stale, true);
  }
});

test('stage pagination exposes every card from one immutable snapshot without exceeding page size', () => {
  const found = Array.from({ length: 119 }, (_, index) => card(index));
  const payload = {
    snapshotPublishedAt: '2026-09-08T04:49:16.230Z',
    snapshotStale: false,
    stages: { found, waiting: [], actionable: [] },
    stageCounts: { found: 119, waiting: 0, actionable: 0 },
  } as unknown as RadarDailyPayload;

  const first = paginateCandidateStage(payload, 'found', 0, 40);
  const second = paginateCandidateStage(payload, 'found', first.nextOffset ?? -1, 40);
  const third = paginateCandidateStage(payload, 'found', second.nextOffset ?? -1, 40);

  assert.deepEqual(candidateStageCounts(payload), { found: 119, waiting: 0, actionable: 0 });
  assert.equal(first.items.length, 40);
  assert.equal(second.items.length, 40);
  assert.equal(third.items.length, 39);
  assert.equal(third.nextOffset, null);
  assert.deepEqual([...first.items, ...second.items, ...third.items].map((item) => item.symbol), found.map((item) => item.symbol));
});

test('stage pagination clamps invalid offsets and oversized pages', () => {
  const payload = { stages: { found: [card(1), card(2)], waiting: [], actionable: [] } } as unknown as RadarDailyPayload;
  const page = paginateCandidateStage(payload, 'found', -10, 500);
  assert.equal(page.offset, 0);
  assert.equal(page.limit, 40);
  assert.equal(page.total, 2);
  assert.equal(page.nextOffset, null);
});
