import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCandidateDossierSubmission } from './candidate-dossier-validation.ts';

const factId = '11111111-1111-4111-8111-111111111111';
const targetFactId = '22222222-2222-4222-8222-222222222222';

test('numeric summary and section claims require allowed fact IDs', () => {
  const rejected = validateCandidateDossierSubmission({
    summary: '未引用的 EPS 3.2 元不可進入正式摘要。',
    summaryFactIds: [],
    sections: [{ key: 'valuation', title: '估值', body: 'Base target 為 120 元。', factIds: [] }],
    allowedFactIds: [factId, targetFactId],
    factValues: new Map([[factId, [3.2]], [targetFactId, [120]]]),
  });
  assert.deepEqual(rejected.rejectionReasons, [
    'summary_missing_fact_id',
    'section_1_missing_fact_id',
    'section_1_numeric_claim_without_fact_id',
  ]);

  const accepted = validateCandidateDossierSubmission({
    summary: '依官方資料，EPS 3.2 元已完成來源對應。',
    summaryFactIds: [factId],
    sections: [{ key: 'valuation', title: '估值', body: 'Base target 為 120 元。', factIds: [targetFactId] }],
    allowedFactIds: [factId, targetFactId],
    factValues: new Map([[factId, [3.2]], [targetFactId, [120]]]),
  });
  assert.deepEqual(accepted.rejectionReasons, []);

  const mismatch = validateCandidateDossierSubmission({
    summary: '依官方資料，EPS 9.9 元但引用內容不一致。',
    summaryFactIds: [factId],
    sections: [{ key: 'valuation', title: '估值', body: 'Base target 為 120 元。', factIds: [targetFactId] }],
    allowedFactIds: [factId, targetFactId],
    factValues: new Map([[factId, [3.2]], [targetFactId, [120]]]),
  });
  assert.ok(mismatch.rejectionReasons.includes('summary_numeric_claim_mismatch'));
});

test('paid InvestAnchors content and unknown fact IDs are rejected', () => {
  const result = validateCandidateDossierSubmission({
    summary: '這是一段長度足夠的定錨會員文章整理內容，不能進入公開研究。',
    summaryFactIds: [],
    sections: [{ key: 'view', title: '觀點', body: '這段敘事本身沒有數字但仍屬付費來源。', factIds: ['unknown'] }],
    allowedFactIds: [factId],
  });
  assert.ok(result.rejectionReasons.includes('section_1_unknown_fact_id'));
  assert.ok(result.rejectionReasons.includes('paid_reference_content_forbidden'));
});
