import { completeHash } from './research-complete-canonical.ts';
import { validateCompleteResponse, type CompleteRequest } from './research-complete-input.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
import { financialInstant } from './research-financial-clock.ts';
import { DEEP_ARTICLE_SECTION_ORDER } from './research-deep-article.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;
export const BUSINESS_ARTICLE_SCHEMA = 'candidate-deep-research-v2';
export type ArticleSourceV2 = {
  id: string; rowHash: string; url: string; observedAt: string; admittedAt: string;
  publication: { precision: 'instant' | 'date' | 'unknown'; raw: string | null; timezone: string | null; instant: string | null };
  scope: 'company_mentions' | 'industry_context'; symbols: string[];
  rights: 'public_summary_only'; retracted: boolean; superseded: boolean;
};
type Reference = { kind: 'source'; documentId: string; rowHash: string; locator: string }
  | { kind: 'reported_observation' | 'calculation' | 'assumption'; pointer: string }
  | { kind: 'gap'; reason: string };
export type ArticleParagraphV2 = { id: string; text: string;
  kind: 'reported' | 'rumor' | 'inference' | 'scenario' | 'gap'; references: Reference[] };
export type BusinessArticleV2 = {
  schemaVersion: typeof BUSINESS_ARTICLE_SCHEMA; businessModel: 'business_scenarios_v2';
  symbol: string; researchCompanyId: string; inputRevisionId: string; inputHash: string;
  authoredAt: string; evidenceCutoffAt: string; summary: ArticleParagraphV2;
  sections: { key: typeof DEEP_ARTICLE_SECTION_ORDER[number]; title: string; paragraphs: ArticleParagraphV2[] }[];
  catalysts: { name: string; stage: 'rumor' | 'discussion' | 'customer_validation' | 'pilot' | 'reported_order' | 'production';
    paragraphIds: string[]; affectedBusiness: string; earliestFinancialPeriod: string;
    financialTransmission: string; strongestCounterEvidence: string; falsifier: string }[];
  valuation: { scenarioId: 'bear' | 'base' | 'bull'; period: 'next_four_unreported' | 'full_forecast_year';
    fiscalYear: string | null; peMultiple: number | null; yearsToValue: number; discountRate: number; rationale: string }[];
  tables: { id: string; title: string; rows: { label: string; reference: Exclude<Reference, {kind: 'source' | 'gap'}> }[] }[];
  companyBackground: string | null;
};
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_business_article_invalid'); }
function object(value: unknown): Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  return value as Row;
}
function exact(value: unknown, keys: string[]): Row {
  const row = object(value); ensure(Object.keys(row).sort().join(',') === keys.sort().join(',')); return row;
}
function list(value: unknown, min: number, max: number): unknown[] { ensure(Array.isArray(value) && value.length >= min && value.length <= max); return value; }
function text(value: unknown, min = 1, max = 2000): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length >= min && value.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]/iu.test(value));
}
function finite(value: unknown, min: number, max: number): asserts value is number {
  ensure(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}
type NumericNode = { value: number; unit: string; periods: string[]; scenarioId: string | null };
const AMOUNTS = new Set(['revenue', 'grossProfit', 'operatingExpenses', 'operatingProfit', 'nonOperating', 'pretaxProfit',
  'taxExpense', 'netProfit', 'nonControllingNetProfit', 'ownersNetProfit', 'taxFloor', 'nci', 'interestIncome',
  'financeCosts', 'otherIncome', 'equityMethodProfit', 'fxAndOtherRecurring', 'bankInterest', 'financeCost', 'fx', 'otherGainsExFx']);
function numericNodes(value: unknown, prefix = '', out = new Map<string, NumericNode>(), depth = 0,
  periods: string[] = [], scenarioId: string | null = null): Map<string, NumericNode> {
  ensure(depth <= 12 && out.size <= 4096);
  if (typeof value === 'number') {
    ensure(Number.isFinite(value)); const key = prefix.split('/').at(-1)!;
    const unit = key.endsWith('EpsConditional') ? 'TWD_per_share' : key.endsWith('Million') ? 'million_shares'
      : ['grossMargin', 'operatingMargin', 'opexRatio', 'taxRate', 'fractionOutstanding'].includes(key) ? 'fraction'
        : AMOUNTS.has(key) ? 'TWD_million' : null;
    if (unit) out.set(prefix, { value, unit, periods, scenarioId });
  } else if (value && typeof value === 'object') {
    const row = value as Row;
    const selectedPeriods = typeof row.period === 'string' ? [row.period] : Array.isArray(row.periods) ? row.periods as string[] : periods;
    const selectedScenario = ['bear', 'base', 'bull'].includes(String(row.id)) ? row.id as string : scenarioId;
    for (const [key, node] of Object.entries(value)) numericNodes(node,
      `${prefix}/${key.replace(/~/gu, '~0').replace(/\//gu, '~1')}`, out, depth + 1, selectedPeriods, selectedScenario);
  }
  return out;
}
function sourceTime(source: ArticleSourceV2, cutoff: bigint) {
  ensure(financialInstant(source.observedAt) <= financialInstant(source.admittedAt) && financialInstant(source.admittedAt) <= cutoff);
  const p = exact(source.publication, ['precision', 'raw', 'timezone', 'instant']);
  if (p.raw !== null) text(p.raw, 1, 100);
  if (p.timezone !== null) text(p.timezone, 1, 80);
  if (p.precision === 'unknown') ensure(p.instant === null);
  else if (p.precision === 'instant') {
    text(p.raw, 1, 100); text(p.timezone, 1, 80); text(p.instant, 1, 100);
    ensure(financialInstant(p.raw) === financialInstant(p.instant) && financialInstant(p.instant) <= financialInstant(source.observedAt));
  } else {
    ensure(p.precision === 'date' && p.instant === null); text(p.raw, 10, 10);
    ensure(/^\d{4}-\d{2}-\d{2}$/u.test(p.raw) && new Date(`${p.raw}T00:00:00Z`).toISOString().slice(0, 10) === p.raw);
    // Compare civil dates without manufacturing a publication timestamp.
    ensure(p.timezone === null || p.timezone === 'Asia/Taipei');
    ensure(p.raw <= new Date(Number(financialInstant(source.observedAt) / BigInt(1_000_000)) + 8 * 3600_000).toISOString().slice(0, 10));
  }
}

/** Pure contract/recomputation only, called after a trusted server read. No DB,
 * model invocation, role proof, live rights check, publication or entry approval.
 * Sources must come from the server's exact sealed revision resolver, never from
 * a model/HTTP body. Semantic citation support still needs independent review. */
export function validateBusinessResearchArticle(context: {
  request: CompleteRequest; revision: Row; sources: ArticleSourceV2[]; now: string;
}, value: unknown) {
  // Reject non-JSON/oversize work before walking author content. The tagged
  // canonical hash also rejects non-finite numbers and invalid Unicode.
  completeHash(value); ensure(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 262_144);
  validateCompleteResponse(context.request, context.revision); ensure(context.revision.status === 'sealed');
  const payload = object(context.revision.canonical_payload), identity = object(payload.researchIdentity), clocks = object(payload.clocks);
  const financial = object(object(payload.financial).material), projection = object(financial.projection);
  const calculated = recalculateResearchBusinessScenarios(projection.projected, context.now);
  const { inputHash: _input, resultHash: _result, executionCodeHash: _code, ...material } = calculated;
  void _input; void _result; void _code;
  ensure(completeHash(material) === completeHash(financial.calculation));
  const a = exact(value, ['schemaVersion', 'businessModel', 'symbol', 'researchCompanyId', 'inputRevisionId', 'inputHash',
    'authoredAt', 'evidenceCutoffAt', 'summary', 'sections', 'catalysts', 'valuation', 'tables', 'companyBackground']);
  ensure(a.schemaVersion === BUSINESS_ARTICLE_SCHEMA && a.businessModel === 'business_scenarios_v2'
    && a.symbol === identity.symbol && a.researchCompanyId === identity.researchCompanyId
    && a.inputRevisionId === context.revision.revision_id && a.inputHash === context.revision.input_hash);
  const cutoff = financialInstant(a.evidenceCutoffAt), authored = financialInstant(a.authoredAt);
  ensure(cutoff === financialInstant(clocks.researchCutoff) && cutoff <= authored && authored <= financialInstant(context.now));
  const job = object(payload.originalJob), reservation = object(payload.originalReservation);
  ensure(financialInstant(reservation.startedAt) <= authored && authored <= financialInstant(job.leaseExpiresAt)
    && authored <= financialInstant(reservation.leaseExpiresAt));
  if (a.companyBackground !== null) text(a.companyBackground, 0, 6000);
  const manifest = list(object(payload.sources).manifest, 0, 30).map(object), sources = new Map<string, ArticleSourceV2>();
  for (const source of list(context.sources, 0, 30) as ArticleSourceV2[]) {
    exact(source, ['id', 'rowHash', 'url', 'observedAt', 'admittedAt', 'publication', 'scope', 'symbols', 'rights', 'retracted', 'superseded']);
    ensure(UUID.test(source.id) && HASH.test(source.rowHash) && !sources.has(source.id)
      && manifest.some(d => d.id === source.id && d.rowHash === source.rowHash)
      && source.rights === 'public_summary_only' && source.retracted === false && source.superseded === false
      && ['company_mentions', 'industry_context'].includes(source.scope)
      && Array.isArray(source.symbols) && source.symbols.length <= 50 && source.symbols.every(s => /^\d{4}$/u.test(s))
      && (source.scope === 'industry_context' || source.symbols.includes(String(a.symbol)))
      && typeof source.url === 'string' && source.url.length <= 800 && source.url.startsWith('https://') && sanitizePublicSourceUrl(source.url) === source.url);
    sourceTime(source, cutoff); sources.set(source.id, source);
  }
  ensure(sources.size === manifest.length);
  const facts = new Map<string, NumericNode>();
  // Only the printed observation value is a financial fact. PDF page numbers,
  // rounding endpoints and other numeric provenance cannot be cited as earnings.
  for (const key of ['reportedFacts', 'monthlyFacts']) list(projection[key], 0, 64).forEach((value, index) => {
    const f = object(value); ensure(typeof f.value === 'number' && Number.isFinite(f.value));
    ensure(typeof f.unit === 'string' && typeof f.period === 'string');
    facts.set(`/${key}/${index}/value`, { value: f.value, unit: f.unit, periods: [f.period], scenarioId: null });
  });
  const nodes = { reported_observation: facts, calculation: numericNodes(material), assumption: numericNodes(projection.projected) };
  const gaps = new Set(list(projection.gaps, 0, 64));
  const reference = (value: unknown) => {
    const r = object(value);
    if (r.kind === 'source') {
      exact(r, ['kind', 'documentId', 'rowHash', 'locator']); text(r.documentId); text(r.locator, 1, 500);
      ensure(sources.has(r.documentId) && sources.get(r.documentId)!.rowHash === r.rowHash); return r;
    }
    if (r.kind === 'gap') { exact(r, ['kind', 'reason']); ensure(gaps.has(r.reason)); return r; }
    exact(r, ['kind', 'pointer']); ensure(r.kind === 'reported_observation' || r.kind === 'calculation' || r.kind === 'assumption');
    text(r.pointer, 1, 500); ensure(nodes[r.kind].has(r.pointer)); return r;
  };
  const paragraphs = new Map<string, Row>();
  const paragraph = (value: unknown) => {
    const p = exact(value, ['id', 'text', 'kind', 'references']); text(p.id, 1, 80); text(p.text, 20, 2000);
    ensure(/^[a-z][a-z0-9_-]*$/u.test(p.id) && !paragraphs.has(p.id)
      && ['reported', 'rumor', 'inference', 'scenario', 'gap'].includes(String(p.kind)));
    const refs = list(p.references, 1, 30).map(reference);
    ensure(new Set(refs.map(completeHash)).size === refs.length);
    if (p.kind === 'reported') ensure(refs.some(r => r.kind === 'source' || r.kind === 'reported_observation'));
    if (p.kind === 'rumor') ensure(refs.some(r => r.kind === 'source' && sources.get(String(r.documentId))!.scope === 'company_mentions'));
    if (p.kind === 'scenario') ensure(refs.some(r => r.kind === 'assumption' || r.kind === 'calculation'));
    if (p.kind === 'gap') ensure(refs.every(r => r.kind === 'gap'));
    else ensure(refs.some(r => r.kind !== 'gap'));
    paragraphs.set(p.id, p); return p;
  };
  paragraph(a.summary);
  list(a.sections, 7, 7).forEach((value, i) => {
    const section = exact(value, ['key', 'title', 'paragraphs']); ensure(section.key === DEEP_ARTICLE_SECTION_ORDER[i]);
    text(section.title, 2, 80); list(section.paragraphs, 1, 20).forEach(paragraph);
  });
  for (const value of list(a.catalysts, 1, 15)) {
    const c = exact(value, ['name', 'stage', 'paragraphIds', 'affectedBusiness', 'earliestFinancialPeriod', 'financialTransmission', 'strongestCounterEvidence', 'falsifier']);
    for (const key of ['name', 'affectedBusiness', 'earliestFinancialPeriod']) text(c[key], 2, 100);
    for (const key of ['financialTransmission', 'strongestCounterEvidence', 'falsifier']) text(c[key], 20, 1000);
    ensure(['rumor', 'discussion', 'customer_validation', 'pilot', 'reported_order', 'production'].includes(String(c.stage)));
    const ids = list(c.paragraphIds, 1, 20); ensure(new Set(ids).size === ids.length && ids.every(id => typeof id === 'string' && paragraphs.has(id)));
    // An industry-only article cannot manufacture company order/production evidence.
    if (['reported_order', 'production'].includes(String(c.stage))) ensure(ids.some(id =>
      paragraphs.get(String(id))!.kind === 'reported'
      && (paragraphs.get(String(id))!.references as Row[]).some(r => r.kind === 'source' && sources.get(String(r.documentId))!.scope === 'company_mentions')));
  }
  const valuations = list(a.valuation, 3, 3).map((value, index) => {
    const v = exact(value, ['scenarioId', 'period', 'fiscalYear', 'peMultiple', 'yearsToValue', 'discountRate', 'rationale']);
    const scenario = calculated.scenarios[index]; ensure(v.scenarioId === scenario.id); text(v.rationale, 20, 1000);
    finite(v.yearsToValue, 0, 10); finite(v.discountRate, 0, 0.5);
    if (v.peMultiple !== null) finite(v.peMultiple, 0.000001, 100);
    let period: { dilutedEpsConditional: number; periods: string[] };
    if (v.period === 'next_four_unreported') { ensure(v.fiscalYear === null); period = scenario.nextFourUnreported; }
    else {
      ensure(v.period === 'full_forecast_year' && typeof v.fiscalYear === 'string');
      const full = scenario.fullForecastYears.find(row => row.year === v.fiscalYear); ensure(full); period = full;
    }
    const eps = period.dilutedEpsConditional;
    const futurePrice = eps > 0 && typeof v.peMultiple === 'number' ? eps * v.peMultiple : null;
    return { ...v, periods: period.periods, epsConditional: eps, peApplicable: eps > 0 && v.peMultiple !== null,
      futurePriceSensitivity: futurePrice, presentValueSensitivity: futurePrice === null ? null : futurePrice / (1 + v.discountRate) ** v.yearsToValue,
      valuationStatus: 'uncalibrated_multiple_sensitivity', targetPrice: null };
  });
  const tableIds = new Set<string>();
  const tables = list(a.tables, 0, 12).map(value => {
    const t = exact(value, ['id', 'title', 'rows']); text(t.id, 1, 80); text(t.title, 2, 100);
    ensure(!tableIds.has(t.id)); tableIds.add(t.id);
    return { ...t, rows: list(t.rows, 1, 64).map(value => {
      const r = exact(value, ['label', 'reference']); text(r.label, 1, 100); const ref = reference(r.reference);
      ensure(ref.kind === 'reported_observation' || ref.kind === 'calculation' || ref.kind === 'assumption');
      return { ...r, ...nodes[ref.kind].get(String(ref.pointer))!, valueStatus: ref.kind };
    }) };
  });
  const result = { schemaVersion: 'validated-business-article-v2', validatorVersion: 'business-article-contract-v2.1',
    calculatorExecutionHash: calculated.executionCodeHash, sourceClosureHash: object(payload.hashes).sourceClosureHash,
    article: a, calculation: material, sources: [...sources.values()].sort((left, right) => left.id.localeCompare(right.id)),
    tables, valuations, validationStatus: 'contract_valid_only', originalModelCutoff: clocks.originalModelCutoff,
    researchCutoff: clocks.researchCutoff, financialVerified: false, publishableResearch: false,
    researchQualified: false, strategyApproved: false, entryEligible: false,
    limitations: ['prose/citation support and completeness require independent review', 'live source and assignment fences required at receive/publication',
      'no verified normalized EPS or reported YTD bridge', 'no actual author/reviewer execution proof', 'multiples are sensitivity, not fair-value targets'] };
  // Do not retain mutable aliases to the caller's article/source/context objects.
  const snapshot = JSON.parse(JSON.stringify(result)) as typeof result;
  return { ...snapshot, articleHash: completeHash(snapshot) };
}
