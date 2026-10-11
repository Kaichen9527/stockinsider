import type { BusinessArticleV2, ArticleSourceV2, ArticleParagraphV2 } from './research-business-article.ts';
import { completeHash } from './research-complete-canonical.ts';
import { financialInstant } from './research-financial-clock.ts';
import { DEEP_ARTICLE_SECTION_ORDER } from './research-deep-article.ts';
import { sanitizePublicSourceUrl } from './public-source-url.ts';

type Row = Record<string, unknown>;
type Reference = ArticleParagraphV2['references'][number];
export type PublishedValuation = BusinessArticleV2['valuation'][number] & {
  periods: string[]; epsConditional: number; peApplicable: boolean;
  futurePriceSensitivity: number | null; presentValueSensitivity: number | null;
  valuationStatus: 'uncalibrated_multiple_sensitivity'; targetPrice: null;
};
export type PublishedTable = { id: string; title: string; rows: {
  label: string; reference: Reference; value: number; unit: string; periods: string[];
  scenarioId: 'bear' | 'base' | 'bull' | null; valueStatus: string;
}[] };
/** A display projection, never a replacement for the original hashed content. */
export type ResearchPublicationView = {
  schemaVersion: 'research-company-publication-view-v2'; researchCompanyId: string; symbol: string;
  publishedAt: string; researchState: 'published' | 'withdrawn'; article: BusinessArticleV2;
  sources: ArticleSourceV2[]; tables: PublishedTable[]; valuations: PublishedValuation[];
  originalModelCutoff: string; researchCutoff: string; limitations: string[];
  researchQualified: false; strategyApproved: false; entryEligible: false;
};
function ensure(value: unknown): asserts value { if (!value) throw new Error('research_publication_view_invalid'); }
function exact(value: unknown, keys: string[]): Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype);
  const row = value as Row; ensure(Object.keys(row).sort().join(',') === [...keys].sort().join(',')); return row;
}
function list(value: unknown, min: number, max: number): unknown[] { ensure(Array.isArray(value) && value.length >= min && value.length <= max); return value; }
function text(value: unknown, max = 2000): asserts value is string {
  ensure(typeof value === 'string' && value.trim().length > 0 && value.length <= max
    && !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)
    && !/\bBearer\s+\S+|-----BEGIN .*PRIVATE KEY-----|\b(?:password|api[_-]?key|access[_-]?token|cookie)\s*[:=]/iu.test(value));
}
function number(value: unknown, min = -1e15, max = 1e15): asserts value is number { ensure(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max); }
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
const scenarioIds = ['bear','base','bull'];
function periods(value: unknown): string[] {
  const rows = list(value, 1, 4); ensure(rows.every(p => typeof p === 'string' && /^\d{4}Q[1-4]$/u.test(p)) && new Set(rows).size === rows.length);
  const result = rows as string[]; ensure(result.every((p,i) => !i || p > result[i-1])); return result;
}
export function publicationPreviewSelection(query: Record<string, string | string[] | undefined>): {kind:'draft'} | {kind:'published';companyId:string} {
  ensure(Object.keys(query).every(k => k === 'researchCompanyId'));
  if (!Object.hasOwn(query,'researchCompanyId')) return {kind:'draft'};
  const id = query.researchCompanyId; ensure(typeof id === 'string' && UUID.test(id)); return {kind:'published',companyId:id};
}
export function researchDisplayKind(article: unknown, draft: unknown, publication: unknown) {
  ensure([article,draft,publication].filter(Boolean).length <= 1);
  return publication ? 'published' : draft ? 'draft' : article ? 'legacy' : 'empty';
}
/** Checks stored public structure and hash, not private financial recomputation
 * or semantic citation support. The immutable completed SQL reader owns lineage. */
export function parseResearchPublicationView(value: unknown, companyId: string, symbol: string): ResearchPublicationView {
  ensure(UUID.test(companyId) && /^\d{4}$/u.test(symbol));
  ensure(Buffer.byteLength(JSON.stringify(value),'utf8') <= 1048576);
  const root = exact(value,['schemaVersion','researchCompanyId','symbol','publishedAt','publication']);
  ensure(root.schemaVersion === 'research-company-publication-v2' && root.researchCompanyId === companyId && root.symbol === symbol);
  const published = financialInstant(root.publishedAt);
  const p = exact(root.publication,['schemaVersion','receipt','content','sourceReferences','researchState','researchQualified','strategyApproved','entryEligible','idempotentReplay']);
  ensure(p.schemaVersion === 'research-publication-receipt-v2' && ['published','withdrawn'].includes(String(p.researchState))
    && p.researchQualified === false && p.strategyApproved === false && p.entryEligible === false && p.idempotentReplay === true);
  const r = exact(p.receipt,['submissionId','dossierId','bundleId','inputRevisionId','inputHash','authorResultId','authorResultHash','reviewerResultId','reviewerResultHash','submissionHash','contentHash','receivedAt']);
  for (const k of ['submissionId','dossierId','bundleId','inputRevisionId','authorResultId','reviewerResultId']) ensure(typeof r[k] === 'string' && UUID.test(r[k] as string));
  for (const k of ['inputHash','authorResultHash','reviewerResultHash','submissionHash','contentHash']) ensure(typeof r[k] === 'string' && HASH.test(r[k] as string));
  financialInstant(r.receivedAt);
  // Verify immutable bytes BEFORE deriving safe display URLs or projections.
  ensure(r.contentHash === completeHash(p.content));
  const c = exact(p.content,['schemaVersion','deepResearch']); ensure(c.schemaVersion === 'research-publication-v2');
  const d = exact(c.deepResearch,['schemaVersion','articleHash','article','tables','valuations','originalModelCutoff','researchCutoff','limitations','researchQualified','strategyApproved','entryEligible']);
  ensure(d.schemaVersion === 'research-published-v2' && typeof d.articleHash === 'string' && HASH.test(d.articleHash)
    && d.researchQualified === false && d.strategyApproved === false && d.entryEligible === false);
  const a = exact(d.article,['schemaVersion','businessModel','symbol','researchCompanyId','inputRevisionId','inputHash','authoredAt','evidenceCutoffAt','summary','sections','catalysts','valuation','tables','companyBackground']);
  ensure(a.schemaVersion === 'candidate-deep-research-v2' && a.businessModel === 'business_scenarios_v2' && a.symbol === symbol
    && a.researchCompanyId === companyId && a.inputRevisionId === r.inputRevisionId && a.inputHash === r.inputHash);
  const cutoff = financialInstant(d.researchCutoff);
  ensure(financialInstant(d.originalModelCutoff) <= cutoff && financialInstant(a.evidenceCutoffAt) === cutoff
    && cutoff <= financialInstant(a.authoredAt) && financialInstant(a.authoredAt) <= published);
  const sources = list(p.sourceReferences,0,30).map(value => {
    const s = exact(value,['id','rowHash','url','observedAt','admittedAt','publication','scope','symbols','rights','retracted','superseded']);
    ensure(typeof s.id === 'string' && UUID.test(s.id) && typeof s.rowHash === 'string' && HASH.test(s.rowHash));
    ensure(s.rights === 'public_summary_only' && ['company_mentions','industry_context'].includes(String(s.scope))
      && typeof s.retracted === 'boolean' && typeof s.superseded === 'boolean');
    ensure(financialInstant(s.observedAt) <= financialInstant(s.admittedAt) && financialInstant(s.admittedAt) <= cutoff);
    ensure(list(s.symbols,0,100).every(v => typeof v === 'string' && /^\d{4}$/u.test(v)));
    const time = exact(s.publication,['precision','raw','timezone','instant']);
    ensure(['instant','date','unknown'].includes(String(time.precision)));
    if (time.raw !== null) text(time.raw,100); if (time.timezone !== null) text(time.timezone,80);
    if (time.precision === 'instant') { ensure(financialInstant(time.instant) <= financialInstant(s.observedAt)); }
    else ensure(time.instant === null);
    text(s.url,2048); const url = sanitizePublicSourceUrl(s.url); ensure(url);
    return {...s,url} as ArticleSourceV2;
  });
  const sourceMap = new Map(sources.map(s => [s.id,s])); ensure(sourceMap.size === sources.length);
  const reference = (value: unknown): Reference => {
    const row = value as Row; ensure(row && typeof row === 'object');
    if (row.kind === 'source') { const ref = exact(row,['kind','documentId','rowHash','locator']);
      text(ref.locator,500); ensure(sourceMap.get(String(ref.documentId))?.rowHash === ref.rowHash); }
    else if (row.kind === 'gap') { const ref = exact(row,['kind','namespace','reason']); ensure(['source','financial','execution'].includes(String(ref.namespace))); text(ref.reason,500); }
    else { const ref = exact(row,['kind','pointer']); ensure(['reported_observation','calculation','assumption'].includes(String(ref.kind))); text(ref.pointer,500); ensure((ref.pointer as string).startsWith('/')); }
    return row as Reference;
  };
  const paragraphIds = new Set<string>();
  const paragraph = (value: unknown) => { const row = exact(value,['id','text','kind','references']); text(row.id,80);
    ensure(/^[a-z][a-z0-9_-]*$/u.test(String(row.id)) && !paragraphIds.has(String(row.id))); paragraphIds.add(String(row.id));
    text(row.text); ensure(['reported','rumor','inference','scenario','gap'].includes(String(row.kind))); list(row.references,1,30).forEach(reference); };
  paragraph(a.summary);
  list(a.sections,7,7).forEach((value,i) => { const s = exact(value,['key','title','paragraphs']); ensure(s.key === DEEP_ARTICLE_SECTION_ORDER[i]); text(s.title,80); list(s.paragraphs,1,20).forEach(paragraph); });
  list(a.catalysts,1,15).forEach(value => { const x = exact(value,['name','stage','paragraphIds','affectedBusiness','earliestFinancialPeriod','financialTransmission','strongestCounterEvidence','falsifier']);
    ensure(['rumor','discussion','customer_validation','pilot','reported_order','production'].includes(String(x.stage)));
    for (const k of ['name','affectedBusiness','earliestFinancialPeriod']) text(x[k],100);
    for (const k of ['financialTransmission','strongestCounterEvidence','falsifier']) text(x[k],1000);
    ensure(list(x.paragraphIds,1,20).every(id => paragraphIds.has(String(id)))); });
  if (a.companyBackground !== null) { ensure(typeof a.companyBackground === 'string'); if (a.companyBackground) text(a.companyBackground,6000); }
  const valuationKeys = ['scenarioId','period','fiscalYear','peMultiple','yearsToValue','discountRate','rationale'];
  const rawValuations = list(a.valuation,3,3);
  const valuations = list(d.valuations,3,3).map((value,i) => {
    const v = exact(value,[...valuationKeys,'periods','epsConditional','peApplicable','futurePriceSensitivity','presentValueSensitivity','valuationStatus','targetPrice']);
    const raw = exact(rawValuations[i],valuationKeys); ensure(valuationKeys.every(k => raw[k] === v[k]) && v.scenarioId === scenarioIds[i]);
    const ps = periods(v.periods); ensure(v.period === 'next_four_unreported' ? v.fiscalYear === null && ps.length === 4
      : v.period === 'full_forecast_year' && typeof v.fiscalYear === 'string' && /^\d{4}$/u.test(v.fiscalYear) && ps.length === 4 && ps.every(p => p.startsWith(v.fiscalYear as string)));
    number(v.epsConditional); number(v.yearsToValue,0,10); number(v.discountRate,0,0.5); text(v.rationale,1000);
    if (v.peMultiple !== null) number(v.peMultiple,0.000001,100);
    const applicable = v.epsConditional > 0 && v.peMultiple !== null;
    ensure(v.peApplicable === applicable && v.targetPrice === null && v.valuationStatus === 'uncalibrated_multiple_sensitivity');
    const future = applicable ? v.epsConditional * (v.peMultiple as number) : null;
    const present = future === null ? null : future / (1 + v.discountRate) ** v.yearsToValue;
    ensure(v.futurePriceSensitivity === future && v.presentValueSensitivity === present);
    return v as PublishedValuation;
  });
  const rawTables = list(a.tables,0,12), tableIds = new Set<string>();
  const tables = list(d.tables,rawTables.length,rawTables.length).map((value,i) => {
    const t = exact(value,['id','title','rows']), raw = exact(rawTables[i],['id','title','rows']);
    text(t.id,80); text(t.title,100); ensure(t.id === raw.id && t.title === raw.title && !tableIds.has(String(t.id))); tableIds.add(String(t.id));
    const rs = list(raw.rows,1,64);
    list(t.rows,rs.length,rs.length).forEach((value,j) => {
      const r = exact(value,['label','reference','value','unit','periods','scenarioId','valueStatus']), original = exact(rs[j],['label','reference']);
      text(r.label,100); ensure(r.label === original.label && completeHash(r.reference) === completeHash(original.reference));
      const ref = reference(r.reference); ensure(['reported_observation','calculation','assumption'].includes(ref.kind) && r.valueStatus === ref.kind);
      number(r.value); text(r.unit,80);
      const ps = list(r.periods,0,4);
      // Reported observations retain the original fiscal/monthly/half-year
      // labels and units. Only forecast valuations require four quarters.
      if (ref.kind === 'reported_observation') ps.forEach(p => text(p,100));
      else if (ps.length) periods(ps);
      ensure(r.scenarioId === null || scenarioIds.includes(String(r.scenarioId)));
    }); return t as PublishedTable;
  });
  const limitations = list(d.limitations,0,20); limitations.forEach(v => text(v,1000));
  return {schemaVersion:'research-company-publication-view-v2',researchCompanyId:companyId,symbol,publishedAt:root.publishedAt as string,
    researchState:p.researchState as 'published'|'withdrawn',article:structuredClone(a) as BusinessArticleV2,
    sources,tables:structuredClone(tables),valuations:structuredClone(valuations),originalModelCutoff:d.originalModelCutoff as string,
    researchCutoff:d.researchCutoff as string,limitations:[...limitations] as string[],researchQualified:false,strategyApproved:false,entryEligible:false};
}
