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

test('an unrelated price fact cannot support a customer certification claim', () => {
  const result = validateCandidateDossierSubmission({
    summary: '公司研究摘要已有正式價格資料作為現況參考。',
    summaryFactIds: [factId],
    sections: [{ key: 'customers', title: '客戶與認證', body: '主要客戶認證已經完成並開始出貨。', factIds: [factId] }],
    allowedFactIds: [factId],
    factKeys: new Map([[factId, 'close']]),
  });
  assert.ok(result.rejectionReasons.includes('section_1_fact_semantic_mismatch'));
});

test('a data-gap fact cannot be cited as proof that an operating milestone happened', () => {
  const gapId = '00000000-0000-4000-8000-000000000002';
  const result = validateCandidateDossierSubmission({
    summary: '客戶認證已經完成', summaryFactIds: [gapId],
    sections: [{ key: 'customers', title: '客戶', body: '客戶認證已經完成並開始出貨。', factIds: [gapId] }],
    allowedFactIds: [gapId], factKeys: new Map([[gapId, 'gap_customer_certification_shipment']]),
    factKinds: new Map([[gapId, 'data_gap']]),
  });
  assert(result.rejectionReasons.includes('summary_data_gap_used_as_positive_evidence'));
  assert(result.rejectionReasons.includes('section_1_data_gap_used_as_positive_evidence'));
});
