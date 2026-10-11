import { researchCanonicalHash } from './research-agent-qualification.ts';

export const DEEP_ARTICLE_SCHEMA = 'candidate-deep-research-v1' as const;
export const DEEP_ARTICLE_SECTION_ORDER = [
  'market_expectation', 'industry_position', 'rumors_and_orders', 'earnings_transmission',
  'valuation', 'entry_conditions', 'next_evidence',
] as const;
export type DeepArticleSectionKey = typeof DEEP_ARTICLE_SECTION_ORDER[number];
export type DeepResearchParagraph = {
  text: string;
  kind: 'verified' | 'reported' | 'rumor' | 'inference' | 'scenario';
  /** Industry context is not a direct company mention or commercial evidence. */
  evidenceScope?: 'company_mentions' | 'industry_context';
  sourceDocumentIds: string[];
  officialFactIds: string[];
};
export type DeepResearchSection = {
  key: DeepArticleSectionKey;
  title: string;
  paragraphs: DeepResearchParagraph[];
};
export type DeepResearchCatalyst = {
  name: string;
  evidenceDocumentIds: string[];
  stage: 'rumor' | 'discussion' | 'customer_validation' | 'pilot' | 'production' | 'reported_order';
  earliestFinancialPeriod: string;
  affectedBusiness: string;
  financialTransmission: string;
  strongestCounterEvidence: string;
  falsifier: string;
};
export type BaselineEarningsBridge = {
  segmentBasis: 'issuer_reported' | 'consolidated_only' | 'research_estimate';
  segmentNote: string;
  segments: Array<{
    business: string;
    revenueMillions: number; grossMargin: number; operatingExpenseMillions: number;
  }>;
  otherOperatingIncomeMillions: number;
  corporateOperatingIncomeMillions: number;
  nonOperatingMillions: number;
  taxRate: number;
  nonControllingIncomeMillions: number;
  oneOffAfterTaxMillions: number;
  dilutedSharesMillions: number;
};
export type DeepResearchScenario = {
  name: 'existing_business' | 'conditional_commercialization' | 'delay_or_failure';
  fiscalYear: number;
  baselineEps: number;
  baselineBridge: BaselineEarningsBridge;
  incrementalRevenueMillions: number;
  /** Required to quantify a commercialized case; unconfirmed inputs remain scenario assumptions. */
  commercialization?: {
    annualCapacityUnits: number;
    utilization: number;
    yieldRate: number;
    averageSellingPriceMillion: number;
    intercompanyRevenueMillions: number;
    incrementalDepreciationMillions: number;
  } | null;
  grossMargin: number;
  incrementalOperatingExpenseMillions: number;
  nonOperatingMillions: number;
  taxRate: number;
  ownershipFraction: number;
  dilutedSharesMillions: number;
  peMultiple: number | null;
  yearsToValue: number;
  discountRate: number;
  evidenceDocumentIds: string[];
  officialFactIds: string[];
  assumptionNotes: string;
};
export type CalculatedDeepScenario = DeepResearchScenario & {
  baselineRevenueMillions: number;
  baselineOperatingIncomeMillions: number;
  baselineAttributableIncomeMillions: number;
  baselineReportedEps: number;
  incrementalOperatingIncomeMillions: number;
  incrementalAttributableIncomeMillions: number;
  incrementalEps: number;
  totalEps: number;
  futurePrice: number | null;
  presentValue: number | null;
};
export type DeepResearchArticle = {
  schemaVersion: typeof DEEP_ARTICLE_SCHEMA;
  symbol: string;
  authoredAt: string;
  evidenceCutoffAt: string;
  summary: string;
  sections: DeepResearchSection[];
  catalysts: DeepResearchCatalyst[];
  scenarios: DeepResearchScenario[];
  companyBackground?: string;
};
export type ValidatedDeepArticle = Omit<DeepResearchArticle, 'scenarios'> & {
  scenarios: CalculatedDeepScenario[];
  articleHash: string;
  sourceDocumentIds: string[];
};
export type EvidenceDocument = {
  id: string; symbols: string[]; publishedAt: string; observedAt: string;
  sourceUrl: string; retracted: boolean; publicCitation: boolean; superseded?: boolean;
  substantiveEvidence?: boolean;
  subjectScope?: 'company_mentions' | 'industry_context' | 'unknown';
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const instant = (value: string) => typeof value === 'string' && Number.isFinite(Date.parse(value))
  && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value);
const text = (value: unknown, min = 1, max = 4000) => typeof value === 'string'
  && value.trim().length >= min && value.length <= max;
const unique = (values: string[]) => values.length === new Set(values).size;
function checkSourceIds(ids: string[], documents: Map<string, EvidenceDocument>, article: DeepResearchArticle,
  scope: 'company_mentions' | 'industry_context' = 'company_mentions') {
  if (!Array.isArray(ids) || ids.length > 30 || !unique(ids)) throw new Error('deep_article_sources_invalid');
  for (const id of ids) {
    const source = documents.get(id);
    if (!UUID.test(id) || !source
      || (scope === 'industry_context' ? source.subjectScope !== 'industry_context'
        : (source.subjectScope !== undefined && source.subjectScope !== 'company_mentions')
          || !source.symbols.includes(article.symbol))
      || !instant(source.publishedAt) || !instant(source.observedAt)
      || Date.parse(source.publishedAt) > Date.parse(source.observedAt)
      || Date.parse(source.publishedAt) > Date.parse(article.evidenceCutoffAt)
      || Date.parse(source.observedAt) > Date.parse(article.evidenceCutoffAt)
      || source.retracted || source.superseded || source.substantiveEvidence === false
      || !source.publicCitation) throw new Error('deep_article_source_not_usable');
  }
}
export function deepArticleSourceIds(article: DeepResearchArticle): string[] {
  return [...new Set([
    ...(Array.isArray(article.sections) ? article.sections : []).flatMap((section) =>
      (Array.isArray(section.paragraphs) ? section.paragraphs : []).flatMap((paragraph) =>
        Array.isArray(paragraph.sourceDocumentIds) ? paragraph.sourceDocumentIds : [])),
    ...(Array.isArray(article.catalysts) ? article.catalysts : []).flatMap((catalyst) =>
      Array.isArray(catalyst.evidenceDocumentIds) ? catalyst.evidenceDocumentIds : []),
    ...(Array.isArray(article.scenarios) ? article.scenarios : []).flatMap((scenario) =>
      Array.isArray(scenario.evidenceDocumentIds) ? scenario.evidenceDocumentIds : []),
  ])].sort();
}
function calculatedScenario(row: DeepResearchScenario): CalculatedDeepScenario {
  const bridge = row.baselineBridge;
  if (!bridge || !['issuer_reported', 'consolidated_only', 'research_estimate'].includes(bridge.segmentBasis)
    || !text(bridge.segmentNote, 10, 500)
    || !Array.isArray(bridge.segments) || bridge.segments.length < 1 || bridge.segments.length > 20
    || (bridge.segmentBasis === 'consolidated_only' && bridge.segments.length !== 1)
    || new Set(bridge.segments.map((segment) => segment.business)).size !== bridge.segments.length
    || bridge.segments.some((segment) => ![segment.revenueMillions, segment.grossMargin,
      segment.operatingExpenseMillions].every(Number.isFinite)
      || !text(segment.business, 2, 80)
      || segment.revenueMillions < 0 || segment.grossMargin < -1 || segment.grossMargin > 1
      || segment.operatingExpenseMillions < 0)
    || ![bridge.otherOperatingIncomeMillions, bridge.corporateOperatingIncomeMillions,
      bridge.nonOperatingMillions, bridge.taxRate, bridge.nonControllingIncomeMillions,
      bridge.oneOffAfterTaxMillions, bridge.dilutedSharesMillions].every(Number.isFinite)
    || bridge.taxRate < 0 || bridge.taxRate > 1 || bridge.dilutedSharesMillions <= 0
    || bridge.nonControllingIncomeMillions < 0
    || Math.abs(bridge.dilutedSharesMillions - row.dilutedSharesMillions) > 1e-6) {
    throw new Error('deep_article_baseline_bridge_invalid');
  }
  const baselineRevenueMillions = bridge.segments.reduce((sum, segment) => sum + segment.revenueMillions, 0);
  const baselineOperatingIncomeMillions = bridge.segments.reduce((sum, segment) =>
    sum + segment.revenueMillions * segment.grossMargin - segment.operatingExpenseMillions, 0)
    + bridge.otherOperatingIncomeMillions + bridge.corporateOperatingIncomeMillions;
  const baselinePreTax = baselineOperatingIncomeMillions + bridge.nonOperatingMillions;
  const baselineAttributableIncomeMillions = (baselinePreTax > 0
    ? baselinePreTax * (1 - bridge.taxRate) : baselinePreTax)
    - bridge.nonControllingIncomeMillions;
  const computedBaselineEps = baselineAttributableIncomeMillions / bridge.dilutedSharesMillions;
  if (Math.abs(computedBaselineEps - row.baselineEps) > 1e-6) {
    throw new Error('deep_article_baseline_eps_bridge_mismatch');
  }
  const finite = [
    row.baselineEps, row.incrementalRevenueMillions, row.grossMargin,
    row.incrementalOperatingExpenseMillions, row.nonOperatingMillions, row.taxRate,
    row.ownershipFraction, row.dilutedSharesMillions, row.yearsToValue, row.discountRate,
  ].every((value) => typeof value === 'number' && Number.isFinite(value));
  if (!finite || row.baselineEps < -100
    || row.incrementalRevenueMillions < 0 || row.incrementalOperatingExpenseMillions < 0
    || row.grossMargin < -1 || row.grossMargin > 1 || row.taxRate < 0 || row.taxRate > 1
    || row.ownershipFraction <= 0 || row.ownershipFraction > 1 || row.dilutedSharesMillions <= 0
    || row.yearsToValue < 0 || row.yearsToValue > 10 || row.discountRate < 0 || row.discountRate > 0.5
    || (row.peMultiple !== null && (!Number.isFinite(row.peMultiple) || row.peMultiple <= 0 || row.peMultiple > 100))) {
    throw new Error('deep_article_scenario_assumptions_invalid');
  }
  const incrementalOperatingIncomeMillions = row.incrementalRevenueMillions * row.grossMargin
    - row.incrementalOperatingExpenseMillions - (row.commercialization?.incrementalDepreciationMillions || 0);
  const preTax = incrementalOperatingIncomeMillions + row.nonOperatingMillions;
  const incrementalAttributableIncomeMillions = preTax > 0
    ? preTax * (1 - row.taxRate) * row.ownershipFraction : preTax * row.ownershipFraction;
  const incrementalEps = incrementalAttributableIncomeMillions / row.dilutedSharesMillions;
  const totalEps = row.baselineEps + incrementalEps;
  const futurePrice = totalEps > 0 && row.peMultiple !== null ? totalEps * row.peMultiple : null;
  return {
    ...row, baselineRevenueMillions, baselineOperatingIncomeMillions,
    baselineAttributableIncomeMillions,
    baselineReportedEps: (baselineAttributableIncomeMillions + bridge.oneOffAfterTaxMillions)
      / bridge.dilutedSharesMillions,
    incrementalOperatingIncomeMillions, incrementalAttributableIncomeMillions,
    incrementalEps, totalEps, futurePrice,
    presentValue: futurePrice == null ? null : futurePrice / ((1 + row.discountRate) ** row.yearsToValue),
  };
}

/** Evidence is checked server-side; model-authored prose never promotes an unverified source. */
export function validateDeepResearchArticle(input: {
  article: DeepResearchArticle;
  documents: EvidenceDocument[];
  allowedOfficialFactIds: ReadonlySet<string>;
  expectedSymbol: string;
  now: string;
}): ValidatedDeepArticle {
  const { article } = input;
  if (!article || article.schemaVersion !== DEEP_ARTICLE_SCHEMA || article.symbol !== input.expectedSymbol
    || !/^\d{4}$/u.test(article.symbol) || !instant(article.authoredAt) || !instant(article.evidenceCutoffAt)
    || !instant(input.now) || Date.parse(article.authoredAt) > Date.parse(input.now)
    || Date.parse(article.evidenceCutoffAt) > Date.parse(article.authoredAt)
    || !text(article.summary, 50, 1200) || !Array.isArray(article.sections)
    || article.sections.length !== DEEP_ARTICLE_SECTION_ORDER.length
    || !Array.isArray(article.catalysts) || article.catalysts.length < 1 || article.catalysts.length > 15
    || !Array.isArray(article.scenarios) || article.scenarios.length !== 3
    || (article.companyBackground !== undefined && !text(article.companyBackground, 0, 6000))) {
    throw new Error('deep_article_schema_invalid');
  }
  const documents = new Map(input.documents.map((document) => [document.id, document]));
  if (documents.size !== input.documents.length) throw new Error('deep_article_document_duplicate');
  const allDocumentIds: string[] = [];
  for (const [index, section] of article.sections.entries()) {
    if (section.key !== DEEP_ARTICLE_SECTION_ORDER[index] || !text(section.title, 2, 80)
      || !Array.isArray(section.paragraphs) || section.paragraphs.length < 1 || section.paragraphs.length > 20) {
      throw new Error('deep_article_section_invalid');
    }
    for (const paragraph of section.paragraphs) {
      if (!text(paragraph.text, 20, 2000)
        || !['verified', 'reported', 'rumor', 'inference', 'scenario'].includes(paragraph.kind)
        || !Array.isArray(paragraph.officialFactIds) || paragraph.officialFactIds.length > 30
        || !unique(paragraph.officialFactIds) || paragraph.officialFactIds.some((id) => !input.allowedOfficialFactIds.has(id))) {
        throw new Error('deep_article_paragraph_invalid');
      }
      const scope = paragraph.evidenceScope === undefined ? 'company_mentions' : paragraph.evidenceScope;
      if (!['company_mentions', 'industry_context'].includes(scope)
        || (scope === 'industry_context' && (section.key !== 'industry_position'
          || !['reported', 'inference'].includes(paragraph.kind)
          || paragraph.officialFactIds.length !== 0 || !Array.isArray(paragraph.sourceDocumentIds)
          || paragraph.sourceDocumentIds.length === 0))) {
        throw new Error('deep_article_paragraph_evidence_scope_invalid');
      }
      checkSourceIds(paragraph.sourceDocumentIds, documents, article, scope);
      if (paragraph.sourceDocumentIds.length === 0 && paragraph.officialFactIds.length === 0) {
        throw new Error('deep_article_paragraph_uncited');
      }
      allDocumentIds.push(...paragraph.sourceDocumentIds);
    }
  }
  for (const catalyst of article.catalysts) {
    if (!text(catalyst.name, 3, 120) || !text(catalyst.affectedBusiness, 5, 300)
      || !text(catalyst.financialTransmission, 20, 1000)
      || !text(catalyst.strongestCounterEvidence, 10, 1000)
      || !text(catalyst.falsifier, 10, 1000)
      || !/^20\d{2}(?:-Q[1-4])?$/u.test(catalyst.earliestFinancialPeriod)
      || !['rumor', 'discussion', 'customer_validation', 'pilot', 'production', 'reported_order'].includes(catalyst.stage)) {
      throw new Error('deep_article_catalyst_invalid');
    }
    checkSourceIds(catalyst.evidenceDocumentIds, documents, article);
    if (!catalyst.evidenceDocumentIds.length) throw new Error('deep_article_catalyst_uncited');
    allDocumentIds.push(...catalyst.evidenceDocumentIds);
  }
  const names: DeepResearchScenario['name'][] = ['existing_business', 'conditional_commercialization', 'delay_or_failure'];
  const scenarios = article.scenarios.map((scenario, index) => {
    if (scenario.name !== names[index] || !Number.isInteger(scenario.fiscalYear)
      || scenario.fiscalYear < new Date(article.authoredAt).getUTCFullYear()
      || scenario.fiscalYear > new Date(article.authoredAt).getUTCFullYear() + 10
      || !text(scenario.assumptionNotes, 20, 1200)
      || !Array.isArray(scenario.officialFactIds) || !unique(scenario.officialFactIds)
      || scenario.officialFactIds.some((id) => !input.allowedOfficialFactIds.has(id))) {
      throw new Error('deep_article_scenario_invalid');
    }
    checkSourceIds(scenario.evidenceDocumentIds, documents, article);
    if (scenario.officialFactIds.length === 0 && scenario.evidenceDocumentIds.length === 0) {
      throw new Error('deep_article_scenario_uncited');
    }
    if (scenario.name === 'existing_business' && (scenario.incrementalRevenueMillions !== 0
      || scenario.incrementalOperatingExpenseMillions !== 0 || scenario.nonOperatingMillions !== 0
      || scenario.commercialization)) {
      throw new Error('deep_article_baseline_contains_transformation');
    }
    if (scenario.name === 'conditional_commercialization' && scenario.incrementalRevenueMillions === 0
      && scenario.peMultiple !== null) throw new Error('deep_article_unquantified_commercialization_has_target');
    if (scenario.incrementalRevenueMillions > 0) {
      const commercial = scenario.commercialization;
      if (!commercial || ![commercial.annualCapacityUnits, commercial.utilization, commercial.yieldRate,
        commercial.averageSellingPriceMillion, commercial.intercompanyRevenueMillions,
        commercial.incrementalDepreciationMillions].every((value) => Number.isFinite(value) && value >= 0)
        || commercial.annualCapacityUnits <= 0 || commercial.utilization > 1 || commercial.yieldRate > 1
        || commercial.averageSellingPriceMillion <= 0) {
        throw new Error('deep_article_commercialization_inputs_missing');
      }
      const externalRevenue = commercial.annualCapacityUnits * commercial.utilization
        * commercial.yieldRate * commercial.averageSellingPriceMillion - commercial.intercompanyRevenueMillions;
      if (externalRevenue < 0 || Math.abs(externalRevenue - scenario.incrementalRevenueMillions) > 1e-6) {
        throw new Error('deep_article_commercialization_revenue_mismatch');
      }
    }
    const calendarYears = scenario.fiscalYear - new Date(article.authoredAt).getUTCFullYear();
    if (scenario.yearsToValue < Math.max(0, calendarYears - 1)
      || scenario.yearsToValue > calendarYears + 1) {
      throw new Error('deep_article_discount_horizon_mismatch');
    }
    allDocumentIds.push(...scenario.evidenceDocumentIds);
    return calculatedScenario(scenario);
  });
  for (let left = 0; left < scenarios.length; left += 1) {
    for (let right = left + 1; right < scenarios.length; right += 1) {
      if (scenarios[left].fiscalYear === scenarios[right].fiscalYear
        && researchCanonicalHash(scenarios[left].baselineBridge)
          !== researchCanonicalHash(scenarios[right].baselineBridge)) {
        throw new Error('deep_article_same_year_baseline_bridge_conflict');
      }
    }
  }
  const result = { ...article, scenarios, sourceDocumentIds: [...new Set(allDocumentIds)].sort() };
  return { ...result, articleHash: researchCanonicalHash(result) };
}
