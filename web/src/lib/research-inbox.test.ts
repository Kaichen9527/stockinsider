import assert from 'node:assert/strict';
import test from 'node:test';
import { buildResearchInboxRow, researchInboxContentHash, validateResearchInboxItem, type ResearchInboxItem } from './research-inbox.ts';

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

