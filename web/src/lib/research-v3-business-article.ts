import { completeHash, parseCompleteJson } from './research-v3-material-canonical.ts';
import { parseCompleteRequest, type CompleteRequest } from './research-versioned-input-request.ts';
import { createV3CashCitationConsumer } from './research-v3-article-citations.ts';
import type { VersionedInputRpc } from './research-versioned-complete-input.ts';
import { FinancialIoDeadline } from './research-financial-io-owner.ts';
import { recalculateResearchBusinessScenarios } from './research-business-calculator.ts';
import { financialInstant } from './research-financial-clock.ts';
export const DEEP_ARTICLE_SECTION_ORDER = ['market_expectation','industry_position','rumors_and_orders','earnings_transmission','valuation','entry_conditions','next_evidence'] as const;
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;
export const BUSINESS_ARTICLE_SCHEMA = 'candidate-deep-research-v3';
export type ArticleSourceV2 = {
  id: string; rowHash: string; url: string; observedAt: string; admittedAt: string;
  publication: { precision: 'instant' | 'date' | 'unknown'; raw: string | null; timezone: string | null; instant: string | null };
  scope: 'company_mentions' | 'industry_context'; symbols: string[];
  rights: 'public_summary_only'; retracted: boolean; superseded: boolean;
};
type Reference = { kind: 'source'; documentId: string; rowHash: string; locator: string }
  | { kind: 'reported_observation' | 'calculation' | 'assumption'; pointer: string }
  | { kind: 'cash_citation'; citation: Record<string, unknown> }
  | { kind: 'gap'; namespace: 'source' | 'financial' | 'execution'; reason: string };
export type ArticleParagraphV3 = { id: string; text: string;
  kind: 'reported' | 'rumor' | 'inference' | 'scenario' | 'gap'; references: Reference[] };
export type BusinessArticleV3 = {
  schemaVersion: typeof BUSINESS_ARTICLE_SCHEMA; businessModel: 'business_scenarios_cash_v3';
  symbol: string; researchCompanyId: string; inputRevisionId: string; inputHash: string;
  authoredAt: string; evidenceCutoffAt: string; summary: ArticleParagraphV3;
  sections: { key: typeof DEEP_ARTICLE_SECTION_ORDER[number]; title: string; paragraphs: ArticleParagraphV3[] }[];
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
const SHARE_FIELDS = new Set(['openingOrdinaryMillion', 'issuedOrdinaryMillion', 'potentialAwardsMillion',
  'potentialIncludedMillion', 'antiDilutiveExcludedMillion', 'ordinaryWeightedSharesMillionAssumed',
  'potentialWeightedSharesMillionAssumed', 'dilutedSharesMillionAssumed']);
// Finite typed paths only. Never enumerate arbitrary numeric metadata.
function numericNodes(value: unknown, assumption = false) {
  const out = new Map<string, NumericNode>();
  const add = (v: Row, keys: readonly string[], prefix: string, periods: string[], scenarioId: string) => {
    for (const key of keys) if (Object.hasOwn(v,key)) {
      const n=v[key]; ensure(typeof n==='number'&&Number.isFinite(n));
      const unit=key.endsWith('EpsConditional')?'TWD_per_share':SHARE_FIELDS.has(key)?'million_shares':['grossMargin','operatingMargin','opexRatio','taxRate','fractionOutstanding'].includes(key)?'fraction':'TWD_million';
      out.set(`${prefix}/${key}`,{value:n,unit,periods,scenarioId});
    }
  };
  const amounts=[...AMOUNTS], totals=[...amounts,...SHARE_FIELDS,'basicEpsConditional','dilutedEpsConditional'];
  list(object(value).scenarios,3,3).forEach((v,s)=>{
    const scenario=object(v);ensure(scenario.id===['bear','base','bull'][s]);const id=String(scenario.id);
    list(scenario.quarters,6,6).forEach((v,q)=>{
      const row=object(v),prefix=`/scenarios/${s}/quarters/${q}`,periods=[String(row.period)];
      add(row,assumption?[...amounts,'grossMargin','opexRatio','taxRate']:totals,prefix,periods,id);
      if(assumption)add(object(row.shares),['openingOrdinaryMillion','issuedOrdinaryMillion','fractionOutstanding','potentialAwardsMillion'],prefix+'/shares',periods,id);
      if(Array.isArray(row.segments))list(row.segments,4,4).forEach((v,i)=>add(object(v),['revenue','grossMargin','operatingMargin',...(assumption?[]:['grossProfit','operatingExpenses','operatingProfit'])],prefix+`/segments/${i}`,periods,id));
      if(!assumption)add(object(row.nonOperatingBreakdown),amounts,prefix+'/nonOperatingBreakdown',periods,id);
    });
    if(!assumption){const next=object(scenario.nextFourUnreported);add(next,totals,`/scenarios/${s}/nextFourUnreported`,next.periods as string[],id);
      list(scenario.fullForecastYears,1,1).forEach((v,i)=>{const year=object(v);add(year,totals,`/scenarios/${s}/fullForecastYears/${i}`,year.periods as string[],id);});}
  });return out;
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
function validateArticle(context: {
  request: CompleteRequest; revision: Row; sources: ArticleSourceV2[]; now: string; citations: Awaited<ReturnType<ReturnType<typeof createV3CashCitationConsumer>['read']>>; deadline: FinancialIoDeadline;
}, value: unknown) {
  // Reject non-JSON/oversize work before walking author content. The tagged
  // canonical hash also rejects non-finite numbers and invalid Unicode.
  completeHash(value); ensure(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 262_144);
  context.deadline.check(); ensure(context.revision.status === 'sealed');
  const payload = object(context.revision.canonical_payload), identity = object(payload.researchIdentity), clocks = object(payload.clocks);
  const financial = object(object(payload.financial).material), projection = object(financial.projection);
  const calculated = recalculateResearchBusinessScenarios(projection.projected, context.now);
  const { inputHash: _input, resultHash: _result, executionCodeHash: _code, ...material } = calculated;
  void _input; void _result; void _code;
  ensure(completeHash(material) === completeHash(financial.calculation));
  const a = exact(value, ['schemaVersion', 'businessModel', 'symbol', 'researchCompanyId', 'inputRevisionId', 'inputHash',
    'authoredAt', 'evidenceCutoffAt', 'summary', 'sections', 'catalysts', 'valuation', 'tables', 'companyBackground']);
  ensure(a.schemaVersion === BUSINESS_ARTICLE_SCHEMA && a.businessModel === 'business_scenarios_cash_v3'
    && a.symbol === identity.symbol && a.researchCompanyId === identity.researchCompanyId
    && a.inputRevisionId === context.revision.revision_id && a.inputHash === context.revision.input_hash);
  const cutoff = financialInstant(a.evidenceCutoffAt), authored = financialInstant(a.authoredAt);
  ensure(cutoff === financialInstant(clocks.researchCutoff) && cutoff <= authored && authored <= financialInstant(context.now));
  const job = object(payload.originalJob), reservation = object(payload.originalReservation);
  ensure(financialInstant(reservation.startedAt) <= authored && authored < financialInstant(job.leaseExpiresAt)
    && authored < financialInstant(reservation.leaseExpiresAt));
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
  const nodes = { reported_observation: facts, calculation: numericNodes(material), assumption: numericNodes(projection.projected,true) };
  const expectedGaps = [{ namespace: 'source', reason: 'source_coverage_incomplete' },
    { namespace: 'financial', reason: 'financial_source_live_rights_unverified' },
    { namespace: 'execution', reason: 'trusted_role_execution_unavailable' },
    ...list(projection.gaps, 0, 64).map(reason => { text(reason, 1, 200); return { namespace: 'financial', reason }; }),
    ...(manifest.length ? [] : [{ namespace: 'source', reason: 'sources_not_selected' }])];
  // Preserve the actual DB assembly's namespaces/order and reject additions,
  // omissions or reclassification rather than inventing a separate gap ledger.
  ensure(completeHash(payload.gaps) === completeHash(expectedGaps));
  const gaps = new Set(expectedGaps.map(g => `${g.namespace}:${g.reason}`));
  const reference = (value: unknown) => {
    context.deadline.check();
    const r = object(value);
    if (r.kind === 'cash_citation') { exact(r,['kind','citation']); context.citations.validateCitation(JSON.stringify(r.citation)); return r; }
    if (r.kind === 'source') {
      exact(r, ['kind', 'documentId', 'rowHash', 'locator']); text(r.documentId); text(r.locator, 1, 500);
      ensure(sources.has(r.documentId) && sources.get(r.documentId)!.rowHash === r.rowHash); return r;
    }
    if (r.kind === 'gap') {
      exact(r, ['kind', 'namespace', 'reason']); text(r.namespace, 1, 20); text(r.reason, 1, 200);
      ensure(gaps.has(`${r.namespace}:${r.reason}`)); return r;
    }
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
    if (p.kind === 'reported') ensure(refs.some(r => r.kind === 'source' || r.kind === 'reported_observation' || (r.kind==='cash_citation' && object(r.citation).kind==='reported_observation')));
    if (p.kind === 'rumor') ensure(refs.some(r => r.kind === 'source' && sources.get(String(r.documentId))!.scope === 'company_mentions'));
    if (p.kind === 'scenario') ensure(refs.some(r => r.kind === 'assumption' || r.kind === 'calculation' || (r.kind==='cash_citation' && object(r.citation).classification==='conditional_scenario')));
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
      if(ref.kind==='cash_citation'){const node=context.citations.validateCitation(JSON.stringify(ref.citation));return {...r,value:node.value,unit:node.unit,periods:[node.period],scenarioId:node.scenarioId,valueStatus:node.kind,basis:node.basis,classification:node.classification,sourcePairs:node.sourcePairs};}
      ensure(ref.kind === 'reported_observation' || ref.kind === 'calculation' || ref.kind === 'assumption');
      return { ...r, ...nodes[ref.kind].get(String(ref.pointer))!, valueStatus: ref.kind };
    }) };
  });
  const result = { schemaVersion: 'validated-business-article-v3-candidate', validatorVersion: 'business-article-cash-contract-v3.1',
    wireVersion:'research-article-input-v3',financialProfile:context.citations.context.financialProfile,bindingCapsuleIdentity:context.citations.context.bindingCapsuleIdentity,inputRevisionId:context.revision.revision_id,inputHash:context.revision.input_hash,citationContext:context.citations.context,
    calculatorExecutionHash: calculated.executionCodeHash, sourceClosureHash: object(payload.hashes).sourceClosureHash,
    article: a, calculation: material, sources: [...sources.values()].sort((left, right) => left.id.localeCompare(right.id)),
    tables, valuations, validationStatus: 'contract_valid_only', originalModelCutoff: clocks.originalModelCutoff,
    researchCutoff: clocks.researchCutoff, financialVerified: false, publishableResearch: false,
    researchQualified: false, strategyApproved: false, entryEligible: false, dispatchReady:false,modelDispatched:false,historicalPITEligible:false,sourceClosureApproved:false,wireDispatchEnabled:false,valuationApproved:false,technicalAdmission:false,forecastCash:null,noFutureCash:true,
    limitations: ['prose/citation support and completeness require independent review', 'live source and assignment fences required at receive/publication',
      'no verified normalized EPS or reported YTD bridge', 'no actual author/reviewer execution proof', 'multiples are sensitivity, not fair-value targets'] };
  // Do not retain mutable aliases to the caller's article/source/context objects.
  const snapshot = JSON.parse(JSON.stringify(result)) as typeof result;
  context.deadline.check();const resultHash=completeHash(snapshot);context.deadline.check();return { ...snapshot, articleHash: resultHash };
}

/** Trusted server factory. Sources are the exact packet RPC descriptors, never
 * author/body input. No write, claim, seal, publish or legacy fallback. */
export function createV3BusinessArticleValidator(config: {bindingTexts:readonly string[];executorFingerprint:string}) {
  const consumer=createV3CashCitationConsumer(config);
  return Object.freeze({
    /** Complete pure revalidation for a current five-key handoff RPC context.
     * Does not acquire or assert authority; callers must recheck that RPC fence. */
    revalidateStored(requestText:unknown,inputRevisionId:string,inputHash:string,revision:Row,articleText:unknown,sources:ArticleSourceV2[],deadline:FinancialIoDeadline) {
      deadline.check();ensure(typeof articleText==='string'&&articleText.length<=262144&&Buffer.byteLength(articleText,'utf8')<=262144);
      ensure(typeof requestText==='string'&&requestText.length<=8192&&Buffer.byteLength(requestText,'utf8')<=8192);
      const article=parseCompleteJson(articleText),request=parseCompleteRequest(parseCompleteJson(requestText));
      const acquired=consumer.revalidateStoredForArticle(requestText,inputRevisionId,inputHash,revision,deadline);
      const validatedArticle=validateArticle({request,revision:acquired.revision,sources,now:new Date().toISOString(),citations:acquired.citations,deadline},article);
      deadline.check();return {validatedArticle,revision:acquired.revision,citations:acquired.citations};
    },async validate(db:VersionedInputRpc,requestText:unknown,inputRevisionId:string,inputHash:string,articleText:unknown,sources:ArticleSourceV2[],deadline=new FinancialIoDeadline()) {
    deadline.check();ensure(typeof articleText==='string'&&articleText.length<=262144&&Buffer.byteLength(articleText,'utf8')<=262144);
    ensure(typeof requestText==='string'&&requestText.length<=8192&&Buffer.byteLength(requestText,'utf8')<=8192);
    const article=parseCompleteJson(articleText),request=parseCompleteRequest(parseCompleteJson(requestText));
    const acquired=await consumer.readForArticle(db,requestText,inputRevisionId,inputHash,deadline);deadline.check();
    const validatedArticle=validateArticle({request,revision:acquired.revision,sources,now:new Date().toISOString(),citations:acquired.citations,deadline},article);
    deadline.check();return {validatedArticle,revision:acquired.revision};
  }});
}
