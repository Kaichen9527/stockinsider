import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createTechnicalDecisionSnapshot, invalidateThesis, issueThesisQualification,
  renewThesisReview, researchEntryQualification,
} from './research-agent-qualification.ts';

const hash = 'a'.repeat(64);
const otherHash = 'b'.repeat(64);
function reviewed(overrides: Record<string, unknown> = {}) {
  return issueThesisQualification({
    symbol: '2409', thesisRevisionId: 'thesis-1', articleRevisionId: 'article-1',
    articleHash: hash, evidenceSnapshotHash: hash, reviewerReadEvidenceHash: hash,
    acceptedArticle: true, authorId: 'author-1', reviewerId: 'independent-review-1',
    financialBridgeVerified: true, decision: 'qualified', horizon: '6-18m',
    support: ['公司公告可核對'], counterEvidence: ['新供給可能壓低毛利'],
    invalidationConditions: ['客戶驗證被否認'], materialEventIds: ['event-1'],
    reviewedAt: '2026-09-28T10:00:00Z', ...overrides,
  });
}

function snapshot(overrides: Record<string, unknown> = {}) {
  return createTechnicalDecisionSnapshot({
    thesis: reviewed(), observedAt: '2026-09-29T10:00:00Z', marketSession: '2026-09-29',
    marketDatasetHash: hash, calendarHash: otherHash, finalDatasetConfirmed: true,
    featureVersion: 'technical-v3', strategyVersion: 'approved-v1', rawSignalConfirmed: true,
    evidenceCurrent: true,
    liquidityVerified: true, approvedStrategyVersion: 'approved-v1', existingPaperPosition: false,
    ...overrides,
  });
}

test('publishing an article cannot by itself qualify a stock for entry research', () => {
  assert.throws(() => reviewed({ reviewerId: 'author-1' }), /identity/);
  assert.throws(() => reviewed({ financialBridgeVerified: false }), /evidence_incomplete/);
  assert.throws(() => reviewed({ reviewerReadEvidenceHash: otherHash }), /identity/);
  assert.equal(reviewed({ decision: 'rejected' }).status, 'rejected');
  assert.equal(researchEntryQualification(reviewed({ decision: 'rejected' }), '2026-09-29T10:00:00Z').allowed, false);
});

test('technical confirmation does not cross data, thesis, liquidity, or strategy gates', () => {
  assert.equal(snapshot().entryResearchEligible, true);
  const data = snapshot({ finalDatasetConfirmed: false });
  assert.equal(data.signalState, 'pending_data');
  assert.equal(data.entryResearchEligible, false);
  assert.ok(data.blockers.includes('official_final_dataset_pending'));
  assert.equal(snapshot({ liquidityVerified: false }).entryResearchEligible, false);
  assert.equal(snapshot({ approvedStrategyVersion: 'older-version' }).entryResearchEligible, false);
  assert.equal(snapshot({ thesis: reviewed({ decision: 'needs_evidence' }) }).entryResearchEligible, false);
  const retracted = snapshot({ evidenceCurrent: false });
  assert.equal(retracted.entryResearchEligible, false);
  assert.ok(retracted.blockers.includes('article_source_retracted_or_missing'));
});

test('material counterevidence stops new entries but preserves paper-position monitoring', () => {
  const original = reviewed();
  const changed = invalidateThesis({ thesis: original, eventId: 'denial-1',
    observedAt: '2026-09-29T09:00:00Z', status: 'invalidated' });
  const result = snapshot({ thesis: changed, existingPaperPosition: true });
  assert.equal(result.entryResearchEligible, false);
  assert.equal(result.monitorExistingPosition, true);
  assert.equal(original.status, 'qualified');
  assert.deepEqual(changed.materialEventIds, ['denial-1', 'event-1']);
});

test('a no-change monthly review extends the deadline without changing the article hash', () => {
  const original = reviewed();
  const renewed = renewThesisReview({ thesis: original, evidenceSnapshotHash: hash,
    reviewerId: 'independent-review-2', reviewedAt: '2026-10-28T10:00:00Z' });
  assert.equal(renewed.articleHash, original.articleHash);
  assert.notEqual(renewed.reviewReceiptHash, original.reviewReceiptHash);
  assert.equal(researchEntryQualification(original, '2026-10-29T10:00:00Z').allowed, false);
  assert.equal(researchEntryQualification(renewed, '2026-10-29T10:00:00Z').allowed, true);
  assert.throws(() => renewThesisReview({ thesis: original, evidenceSnapshotHash: otherHash,
    reviewerId: 'reviewer', reviewedAt: '2026-10-28T10:00:00Z' }), /revision_changed/);
});

test('future research or a future market session cannot be used', () => {
  assert.throws(() => researchEntryQualification(reviewed(), '2026-09-27T10:00:00Z'), /future_review/);
  assert.throws(() => snapshot({ marketSession: '2026-09-30' }), /input_invalid/);
});
