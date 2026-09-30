import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEEP_ARTICLE_SCHEMA, DEEP_ARTICLE_SECTION_ORDER, validateDeepResearchArticle,
  type DeepResearchArticle, type DeepResearchScenario,
} from './research-deep-article.ts';

const sourceId = '11111111-1111-4111-8111-111111111111';
const document = {
  id: sourceId, symbols: ['2409'], publishedAt: '2026-09-27T01:00:00Z',
  observedAt: '2026-09-27T02:00:00Z', sourceUrl: 'https://example.org/auo',
  retracted: false, publicCitation: true,
};
const common: Omit<DeepResearchScenario, 'name' | 'incrementalRevenueMillions' | 'incrementalOperatingExpenseMillions'> = {
  fiscalYear: 2028, baselineEps: 0.6, grossMargin: 0.3, nonOperatingMillions: 0,
  baselineBridge: {
    segmentBasis: 'issuer_reported', segmentNote: '依公司揭露事業分類重組，與合併損益對帳。',
    segments: [
      { business: 'display', revenueMillions: 2000, grossMargin: 0.3, operatingExpenseMillions: 100 },
      { business: 'mobility', revenueMillions: 1000, grossMargin: 0.3, operatingExpenseMillions: 100 },
      { business: 'vertical', revenueMillions: 500, grossMargin: 0.3, operatingExpenseMillions: 100 },
    ],
    otherOperatingIncomeMillions: 0, corporateOperatingIncomeMillions: 0,
    nonOperatingMillions: 0, taxRate: 0.2, nonControllingIncomeMillions: 0,
    oneOffAfterTaxMillions: 100, dilutedSharesMillions: 1000,
  },
  taxRate: 0.2, ownershipFraction: 0.8, dilutedSharesMillions: 1000,
  peMultiple: 20, yearsToValue: 2, discountRate: 0.1,
  evidenceDocumentIds: [sourceId], officialFactIds: [],
  assumptionNotes: '假設基於來源，但未經公司確認，需用後續訂單與良率查證。',
};
function article(): DeepResearchArticle {
  return {
    schemaVersion: DEEP_ARTICLE_SCHEMA, symbol: '2409',
    authoredAt: '2026-09-29T00:00:00Z', evidenceCutoffAt: '2026-09-28T00:00:00Z',
    summary: '友達的關鍵問題是玻璃基板商業化能否從展示與驗證轉成可量產的訂單，現階段仍有很大證據缺口。股價已反映部分期待，但獲利時程與歸屬比例必須另行驗證。',
    sections: DEEP_ARTICLE_SECTION_ORDER.map((key) => ({
      key, title: key, paragraphs: [{ kind: 'inference',
        text: '目前這項進展尚未證明訂單與利潤，必須追蹤客戶驗證、良率與正式量產時間。',
        sourceDocumentIds: [sourceId], officialFactIds: [] }],
    })),
    catalysts: [{ name: '玻璃核心基板', evidenceDocumentIds: [sourceId], stage: 'customer_validation',
      earliestFinancialPeriod: '2028-Q1', affectedBusiness: '顯示科技之外的新應用',
      financialTransmission: '驗證通過後才可能取得量產訂單，營收需扣除投入與折舊。',
      strongestCounterEvidence: '尚未有可核對的訂單、良率與價格資訊。',
      falsifier: '客戶驗證延後或替代技術取得主要採購。' }],
    scenarios: [
      { ...common, baselineBridge: structuredClone(common.baselineBridge), name: 'existing_business', incrementalRevenueMillions: 0, incrementalOperatingExpenseMillions: 0 },
      { ...common, baselineBridge: structuredClone(common.baselineBridge), name: 'conditional_commercialization', incrementalRevenueMillions: 1000, incrementalOperatingExpenseMillions: 100,
        commercialization: { annualCapacityUnits: 10_000, utilization: 0.5, yieldRate: 0.5,
          averageSellingPriceMillion: 0.4, intercompanyRevenueMillions: 0, incrementalDepreciationMillions: 0 } },
      { ...common, baselineBridge: structuredClone(common.baselineBridge), name: 'delay_or_failure', incrementalRevenueMillions: 0, incrementalOperatingExpenseMillions: 50 },
    ],
  };
}
const options = () => ({ article: article(), documents: [document], allowedOfficialFactIds: new Set<string>(),
  expectedSymbol: '2409', now: '2026-09-29T01:00:00Z' });

test('conditional scenario computes attribution, diluted EPS and dated present value', () => {
  const result = validateDeepResearchArticle(options());
  assert.equal(result.scenarios[0].incrementalEps, 0);
  assert.equal(result.scenarios[0].baselineRevenueMillions, 3500);
  assert.equal(result.scenarios[0].baselineOperatingIncomeMillions, 750);
  assert.equal(result.scenarios[0].baselineReportedEps, 0.7);
  assert.equal(result.scenarios[1].incrementalOperatingIncomeMillions, 200);
  assert.equal(result.scenarios[1].incrementalAttributableIncomeMillions, 128);
  assert.equal(result.scenarios[1].totalEps, 0.728);
  assert.ok(Math.abs(result.scenarios[1].presentValue! - (0.728 * 20 / 1.1 ** 2)) < 1e-10);
  assert.equal(result.sourceDocumentIds.length, 1);
});
test('a different industry can use its actual issuer segments or a disclosed consolidated bridge', () => {
  const input = options();
  input.article.symbol = '2330';
  input.expectedSymbol = '2330';
  input.documents[0] = { ...document, symbols: ['2330'] };
  for (const scenario of input.article.scenarios) {
    scenario.baselineBridge = {
      ...scenario.baselineBridge,
      segmentBasis: 'consolidated_only',
      segmentNote: '發行人只揭露合併營收與利潤，未將研究估計誤列為已揭露分部。',
      segments: [{ business: 'foundry_consolidated', revenueMillions: 3500,
        grossMargin: 0.3, operatingExpenseMillions: 300 }],
    };
  }
  const result = validateDeepResearchArticle(input);
  assert.equal(result.symbol, '2330');
  assert.equal(result.scenarios[0].baselineRevenueMillions, 3500);
  const unsupported = options();
  unsupported.article.scenarios[0].baselineBridge.segmentBasis = 'consolidated_only';
  assert.throws(() => validateDeepResearchArticle(unsupported), /baseline_bridge_invalid/);
});
test('rumor citations, retraction, future sources and unsupported text fail closed', () => {
  const noCitation = options();
  noCitation.article.sections[0].paragraphs[0].sourceDocumentIds = [];
  assert.throws(() => validateDeepResearchArticle(noCitation), /uncited/);
  const withdrawn = options();
  withdrawn.documents[0] = { ...document, retracted: true };
  assert.throws(() => validateDeepResearchArticle(withdrawn), /not_usable/);
  const future = options();
  future.documents[0] = { ...document, observedAt: '2026-09-30T00:00:00Z' };
  assert.throws(() => validateDeepResearchArticle(future), /not_usable/);
});
test('a non-commercialized baseline and negative EPS do not get a fictitious P/E value', () => {
  const input = options();
  input.article.scenarios[0].incrementalRevenueMillions = 1000;
  assert.throws(() => validateDeepResearchArticle(input), /baseline_contains_transformation/);
  const negative = options();
  for (const scenario of negative.article.scenarios) {
    scenario.baselineEps = -0.5;
    scenario.baselineBridge = { ...scenario.baselineBridge, otherOperatingIncomeMillions: -1250 };
  }
  const result = validateDeepResearchArticle(negative);
  assert.equal(result.scenarios[2].futurePrice, null);
  assert.equal(result.scenarios[2].presentValue, null);
  const missingUnits = options();
  missingUnits.article.scenarios[1].commercialization = null;
  assert.throws(() => validateDeepResearchArticle(missingUnits), /commercialization_inputs_missing/);
  const wrongRevenue = options();
  wrongRevenue.article.scenarios[1].commercialization!.yieldRate = 0.2;
  assert.throws(() => validateDeepResearchArticle(wrongRevenue), /revenue_mismatch/);
  const wrongBaseline = options();
  wrongBaseline.article.scenarios[0].baselineEps = 0.8;
  assert.throws(() => validateDeepResearchArticle(wrongBaseline), /baseline_eps_bridge_mismatch/);
  const inconsistent = options();
  inconsistent.article.scenarios[2].baselineBridge = {
    ...inconsistent.article.scenarios[2].baselineBridge, oneOffAfterTaxMillions: 200,
  };
  assert.throws(() => validateDeepResearchArticle(inconsistent), /same_year_baseline_bridge_conflict/);
});
