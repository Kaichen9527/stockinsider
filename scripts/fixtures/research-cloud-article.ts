import { DEEP_ARTICLE_SCHEMA, DEEP_ARTICLE_SECTION_ORDER, type DeepResearchArticle } from '../../web/src/lib/research-deep-article.ts';
import { researchCanonicalHash } from '../../web/src/lib/research-agent-qualification.ts';
import { createCloudWork, type CloudWork } from '../../web/src/lib/research-cloud-work.ts';

/** Deliberately synthetic accounting acceptance case, never live AUO research. */
export function cloudArticleFixture(sourceCommit = 'a'.repeat(40), issuedAt = '2026-10-04T00:00:00Z'): CloudWork {
  const issuedMs = Date.parse(issuedAt);
  const nextTaipeiMidnight = (Math.floor((issuedMs + 8 * 3600_000) / 86400_000) + 1) * 86400_000 - 8 * 3600_000;
  const cutoffAt = '2026-09-28T00:00:00Z';
  const id = '11111111-1111-4111-8111-111111111111';
  const document = { id, symbols: ['2409'], publishedAt: '2026-09-27T01:00:00Z', observedAt: '2026-09-27T02:00:00Z',
    sourceUrl: 'https://example.org/synthetic-acceptance', retracted: false, publicCitation: true };
  const baselineBridge = { segmentBasis: 'research_estimate' as const, segmentNote: '明確的合成會計測試資料，完全不是友達實際財務數字。',
    segments: [{ business: 'synthetic', revenueMillions: 3500, grossMargin: 0.3, operatingExpenseMillions: 300 }],
    otherOperatingIncomeMillions: 0, corporateOperatingIncomeMillions: 0, nonOperatingMillions: 0,
    taxRate: 0.2, nonControllingIncomeMillions: 0, oneOffAfterTaxMillions: 100, dilutedSharesMillions: 1000 };
  const common = { fiscalYear: 2028, baselineEps: 0.6, baselineBridge, grossMargin: 0.3, nonOperatingMillions: 0,
    taxRate: 0.2, ownershipFraction: 0.8, dilutedSharesMillions: 1000, peMultiple: 20, yearsToValue: 2, discountRate: 0.1,
    evidenceDocumentIds: [id], officialFactIds: [], assumptionNotes: '合成情境只驗證程式計算與折現，不是實際訂單或友達投資建議。' };
  const article: DeepResearchArticle = { schemaVersion: DEEP_ARTICLE_SCHEMA, symbol: '2409', authoredAt: '2026-09-29T00:00:00Z', evidenceCutoffAt: cutoffAt,
    summary: '這是明確標示的合成文章驗收案例，所有財務與商業化數字只用來測試會計傳導和折現，不能當成友達的實際資訊、訂單、公司指引或研究結論，也不能發布為投資建議。',
    sections: DEEP_ARTICLE_SECTION_ORDER.map((key) => ({ key, title: key, paragraphs: [{ kind: 'scenario',
      text: '合成驗收資料用來確認來源、會計、估值與工作包綁定，沒有主張任何真實訂單。', sourceDocumentIds: [id], officialFactIds: [] }] })),
    catalysts: [{ name: '合成商業化測試', evidenceDocumentIds: [id], stage: 'rumor', earliestFinancialPeriod: '2028-Q1',
      affectedBusiness: '合成測試業務分類', financialTransmission: '僅測試產能、利用率、良率、售價與利潤的計算傳導。',
      strongestCounterEvidence: '這些數字沒有商業事實依據，不可當作已確認公司資訊。', falsifier: '合成資料不能用來判定任何公司的真實商業化結果。' }],
    scenarios: [
      { ...common, name: 'existing_business', incrementalRevenueMillions: 0, incrementalOperatingExpenseMillions: 0 },
      { ...common, name: 'conditional_commercialization', incrementalRevenueMillions: 1000, incrementalOperatingExpenseMillions: 100,
        commercialization: { annualCapacityUnits: 10000, utilization: 0.5, yieldRate: 0.5, averageSellingPriceMillion: 0.4,
          intercompanyRevenueMillions: 0, incrementalDepreciationMillions: 0 } },
      { ...common, name: 'delay_or_failure', incrementalRevenueMillions: 0, incrementalOperatingExpenseMillions: 50 },
    ] };
  const content = '合成會計測試來源；並非友達官方資料或研究證據。';
  return createCloudWork({ dataScope: 'synthetic_acceptance', kind: 'deep_article_validation', sourceCommit,
    jobId: '22222222-2222-4222-8222-222222222222', attempt: 1, role: 'independent_test', owner: 'synthetic-controller',
    reservationId: '33333333-3333-4333-8333-333333333333', issuedAt,
    deadlineAt: new Date(Math.min(issuedMs + 25 * 60_000, nextTaipeiMidnight - 1)).toISOString(), cutoffAt,
    evidence: [{ id, publishedAt: document.publishedAt, observedAt: document.observedAt, sourceUrl: document.sourceUrl,
      content, contentHash: researchCanonicalHash(content), visibility: 'public', contentForm: 'research_summary' }],
    input: { article, documents: [document], allowedOfficialFactIds: [] } });
}
