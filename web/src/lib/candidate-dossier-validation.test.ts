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

test('arbitrary prose cannot become a public fact merely by citing an allowed ID', () => {
  const result = validateCandidateDossierSubmission({
    summary: '測試公司摘要引用一筆官方價格，並等待更多營運證據。', summaryFactIds: [factId],
    sections: [{ key: 'viewpoint', title: '摘要', body: '測試公司目前只有官方價格資料。', factIds: [factId] }],
    claims: [{ id: 'fabricated_fact', kind: 'fact', text: '這是一段無法由資料驗證的虛構敘述。', factIds: [factId] }],
    allowedFactIds: [factId], factKeys: new Map([[factId, 'close']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'close', factKind: 'official_numeric', unit: 'TWD', period: '2026-06-30', locator: 'close:2026-06-30', values: [100] }]]),
  });
  assert.ok(result.rejectionReasons.includes('claim_fabricated_fact_fact_semantic_mismatch'));
  assert.ok(result.rejectionReasons.includes('claim_fabricated_fact_structured_context_required'));
  assert.ok(result.rejectionReasons.includes('claim_fabricated_fact_official_numeric_value_required'));
});

test('arbitrary summary and section prose cannot borrow an unrelated allowed fact', () => {
  const result = validateCandidateDossierSubmission({
    summary: '測試公司已取得重要客戶，後續營運成長值得期待。', summaryFactIds: [factId],
    sections: [{ key: 'viewpoint', title: '摘要', body: '管理團隊執行力很好，未來可望持續成長。', factIds: [factId] }],
    allowedFactIds: [factId], factKeys: new Map([[factId, 'close']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'close', factKind: 'official_numeric', unit: 'TWD', period: '2026-06-30', locator: 'close:2026-06-30', values: [100] }]]),
  });
  assert.ok(result.rejectionReasons.includes('summary_fact_semantic_mismatch'));
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

test('typed operational claims require semantically relevant facts and numeric context', () => {
  const result = validateCandidateDossierSubmission({
    summary: '測試公司研究摘要已綁定官方價格事實，但沒有營運證據。', summaryFactIds: [factId],
    sections: [{ key: 'viewpoint', title: '摘要', body: '測試公司目前價格資料可供核對。', factIds: [factId] }],
    claims: [{ id: 'customer_ship', kind: 'fact', text: '客戶認證完成並已經開始出貨 100 件。', factIds: [factId], metric: 'shipment', unit: 'units', period: '2026-Q2', locator: 'p.7' }],
    allowedFactIds: [factId], factValues: new Map([[factId, [100]]]), factKeys: new Map([[factId, 'close']]),
    factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'close', factKind: 'official_numeric', unit: 'TWD', period: '2026-06-30', locator: 'close:2026-06-30', values: [100] }]]),
  });
  assert(result.rejectionReasons.includes('claim_customer_ship_fact_semantic_mismatch'));
  assert(result.rejectionReasons.includes('claim_customer_ship_fact_metadata_mismatch'));
});

test('derived calculation formulas must form a closed acyclic claim DAG', () => {
  const result = validateCandidateDossierSubmission({
    summary: '測試公司研究摘要引用官方事實，並將計算與假設分開揭露。', summaryFactIds: [factId],
    sections: [{ key: 'viewpoint', title: '摘要', body: '測試公司的官方收盤價事實與推導分開呈現。', factIds: [factId] }],
    claims: [
      { id: 'derived_a', kind: 'derived_calculation', text: '推導值 A', factIds: [], formula: { expression: 'b * 2', inputs: ['derived_b'] } },
      { id: 'derived_b', kind: 'derived_calculation', text: '推導值 B', factIds: [], formula: { expression: 'a / 2', inputs: ['derived_a'] } },
    ],
    allowedFactIds: [factId], factKeys: new Map([[factId, 'close']]), factKinds: new Map([[factId, 'official_numeric']]),
  });
  assert(result.rejectionReasons.includes('claim_formula_dag_cycle'));
});

test('a disclosed assumption and an acyclic calculation are accepted as distinct claim kinds', () => {
  const result = validateCandidateDossierSubmission({
    summary: '測試公司研究摘要引用官方收盤價事實，並將模型假設清楚標示。', summaryFactIds: [factId],
    sections: [{ key: 'viewpoint', title: '摘要', body: '測試公司的官方資料與估值假設分開呈現。', factIds: [factId] }],
    claims: [
      { id: 'base_fact', kind: 'fact', text: '收盤價 100 元。', factIds: [factId], metric: 'close', unit: 'TWD', period: '2026-06-30', locator: 'close:2026-06-30' },
      { id: 'growth_assumption', kind: 'assumption', text: 'Base 情境假設成長率維持不變。', factIds: [] },
      { id: 'target', kind: 'derived_calculation', text: '依基礎值推導目標價。', factIds: [], formula: { expression: 'base_fact * 1.1', inputs: ['base_fact', 'growth_assumption'] } },
    ],
    allowedFactIds: [factId], factValues: new Map([[factId, [100]]]), factKeys: new Map([[factId, 'close']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'close', factKind: 'official_numeric', unit: 'TWD', period: '2026-06-30', locator: 'close:2026-06-30', values: [100] }]]),
  });
  assert.deepEqual(result.rejectionReasons, []);
});

test('company-specific article claims bind issuer identity without treating its ticker as a financial number', () => {
  const result = validateCandidateDossierSubmission({
    summary: '台積電（2330）本期營收 100 元，本文只採用該公司官方事實。', summaryFactIds: [factId],
    sections: [{ key: 'operations', title: '營運', body: '台積電營收 100 元，來源與期間可追溯。', factIds: [factId] }],
    claims: [{ id: 'issuer_revenue', kind: 'fact', text: '台積電營收 100 元。', factIds: [factId], metric: 'revenue', unit: 'TWD', period: '2026-06-30', locator: 'revenue:2026-06-30' }],
    allowedFactIds: [factId], factValues: new Map([[factId, [100]]]), factKeys: new Map([[factId, 'revenue']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'revenue', factKind: 'official_numeric', stockId: 'stock-a', symbol: '2330', unit: 'TWD', period: '2026-06-30', locator: 'revenue:2026-06-30', values: [100] }]]),
    companyIdentity: { stockId: 'stock-a', symbol: '2330', name: '台積電' },
  });
  assert.deepEqual(result.rejectionReasons, []);
});

test('company-specific article rejects another issuer fact and generic prose-only output', () => {
  const result = validateCandidateDossierSubmission({
    summary: '這是一段沒有指出研究公司身分的通用營收摘要內容。', summaryFactIds: [factId],
    sections: [{ key: 'operations', title: '營運', body: '本期營收資料有官方來源可以查核。', factIds: [factId] }],
    claims: [{ id: 'issuer_revenue', kind: 'fact', text: '本期營收 100 元。', factIds: [factId], metric: 'revenue', unit: 'TWD', period: '2026-06-30', locator: 'revenue:2026-06-30' }],
    allowedFactIds: [factId], factValues: new Map([[factId, [100]]]), factKeys: new Map([[factId, 'revenue']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'revenue', stockId: 'stock-b', symbol: '2317', unit: 'TWD', period: '2026-06-30', locator: 'revenue:2026-06-30', values: [100] }]]),
    companyIdentity: { stockId: 'stock-a', symbol: '2330', name: '台積電' },
  });
  assert.ok(result.rejectionReasons.includes('claim_issuer_revenue_company_identity_mismatch'));
  assert.ok(result.rejectionReasons.includes('summary_company_identity_mismatch'));
  assert.ok(result.rejectionReasons.includes('section_1_company_identity_mismatch'));
  assert.ok(result.rejectionReasons.includes('article_company_identity_missing'));
});

test('a ticker alone cannot satisfy an official numeric value claim', () => {
  const result = validateCandidateDossierSubmission({
    summary: '台積電（2330）2026 年營收資料仍需由正式數值證據支持。', summaryFactIds: [factId],
    sections: [{ key: 'operations', title: '營運', body: '台積電（2330）2026 年第 2 季營收資料需要核對。', factIds: [factId] }],
    claims: [{ id: 'ticker_only', kind: 'fact', text: '台積電（2330）2026 Q2 營收。', factIds: [factId], metric: 'revenue', locator: 'revenue:2026-06-30' }],
    allowedFactIds: [factId], factKeys: new Map([[factId, 'revenue']]), factKinds: new Map([[factId, 'official_numeric']]),
    factMetadata: new Map([[factId, { factKey: 'revenue', stockId: 'stock-a', symbol: '2330', unit: 'TWD', period: '2026-06-30', locator: 'revenue:2026-06-30', values: [100] }]]),
    companyIdentity: { stockId: 'stock-a', symbol: '2330', name: '台積電' },
  });
  assert.ok(result.rejectionReasons.includes('claim_ticker_only_official_numeric_value_required'));
  assert.ok(!result.rejectionReasons.some((reason) => reason.includes('numeric_claim_mismatch')));
});

test('strict company article mode requires typed claims', () => {
  const result = validateCandidateDossierSubmission({
    summary: '台積電營收研究摘要已採用公司特定的官方證據。', summaryFactIds: [factId],
    sections: [{ key: 'operations', title: '營運', body: '台積電營收資料有官方來源可以查核。', factIds: [factId] }],
    allowedFactIds: [factId], factKeys: new Map([[factId, 'revenue']]), companyIdentity: { symbol: '2330', name: '台積電' },
  });
  assert.ok(result.rejectionReasons.includes('article_claims_required'));
});
