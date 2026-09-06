import { createHash } from 'crypto';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';
import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';

const MOPS_INLINE_URL = 'https://mopsov.twse.com.tw/server-java/t164sb01';
const FLOW_FACTS: Record<string, string> = {
  revenue: 'quarterly_revenue', revenuefromcontractswithcustomers: 'quarterly_revenue',
  grossprofit: 'quarterly_gross_profit', grossprofitlossfromoperations: 'quarterly_gross_profit',
  netoperatingincomeloss: 'quarterly_operating_income', profitlossfromoperatingactivities: 'quarterly_operating_income',
  profitloss: 'quarterly_net_income', profitlossattributabletoownersofparent: 'quarterly_net_income_attributable_to_common',
};
const EPS_CONCEPTS = new Set(['dilutedearningspershare', 'dilutedearningslosspershare']);
const SHARE_CONCEPTS = new Set(['weightedaveragenumberofdilutedsharesoutstanding', 'dilutedweightedaveragenumberofsharesoutstanding']);

export type CandidateOfficialFinancial = {
  stockId: string;
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
};

type ParsedFact = {
  stockId: string;
  factKey: string;
  periodStart: string;
  periodEnd: string;
  durationKind: 'quarterly';
  value: number;
  unit: 'TWD' | 'TWD_per_share' | 'share';
  provider: 'mops';
  authorityTier: 'official_filing';
  estimateKind: 'reported';
  estimateHorizon: 'reported_period';
  filingPublishedAt: string;
  sourceTimestamp: string;
  collectedAt: string;
  filingRestatementId: null;
  sourceRef: string;
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function attributes(text: string) {
  const output: Record<string, string> = {};
  for (const match of text.matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/gu)) output[match[1].toLowerCase()] = match[3];
  return output;
}

function plainText(value: string) {
  return value.replace(/<[^>]+>/gu, '').replace(/&nbsp;|&#160;/giu, ' ').replace(/&minus;/giu, '-').replace(/&amp;/giu, '&').trim();
}

function finiteFact(value: string, scale = '0', sign: string | undefined = undefined) {
  const normalized = plainText(value).replace(/,/gu, '').replace(/[()]/gu, '');
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const parsed = Number(normalized) * (value.includes('(') || sign === '-' ? -1 : 1) * (10 ** Number(scale || 0));
  return Number.isFinite(parsed) ? parsed : null;
}

function conceptSuffix(value: string | undefined) {
  return String(value || '').split(':').at(-1)?.replace(/[^A-Za-z0-9]/gu, '').toLowerCase() || '';
}

function parseContexts(html: string) {
  const output = new Map<string, { start: string; end: string }>();
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/giu)) {
    const id = attributes(match[1]).id;
    if (!id || /<(?:[A-Za-z0-9_-]+:)?(?:segment|scenario|explicitMember|typedMember)\b/iu.test(match[2])) continue;
    const start = match[2].match(/<xbrli:startDate>(\d{4}-\d{2}-\d{2})<\/xbrli:startDate>/iu)?.[1];
    const end = match[2].match(/<xbrli:endDate>(\d{4}-\d{2}-\d{2})<\/xbrli:endDate>/iu)?.[1];
    if (start && end && start === `${end.slice(0, 4)}-01-01`) output.set(id, { start, end });
  }
  return output;
}

function parseAuditDate(html: string) {
  for (const match of html.matchAll(/<ix:(?:nonNumeric|nonFraction)\b([^>]*)>([\s\S]*?)<\/ix:(?:nonNumeric|nonFraction)>/giu)) {
    if (conceptSuffix(attributes(match[1]).name) !== 'reviewauditdate') continue;
    const raw = plainText(match[2]).replace(/[/.]/gu, '-');
    const roc = raw.match(/^(\d{3})-(\d{1,2})-(\d{1,2})$/u);
    const gregorian = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
    const year = roc ? Number(roc[1]) + 1911 : gregorian ? Number(gregorian[1]) : null;
    const month = roc?.[2] || gregorian?.[2];
    const day = roc?.[3] || gregorian?.[3];
    if (!year || !month || !day) continue;
    const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    if (new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) === date) return date;
  }
  return null;
}

export function parseCandidateMopsFacts(html: string, input: CandidateOfficialFinancial & { sourceUrl: string; collectedAt: string }): ParsedFact[] {
  if (html.length < 100 || html.length > 12_000_000 || !input.sourceUrl.startsWith(MOPS_INLINE_URL)) return [];
  const contexts = parseContexts(html);
  const auditDate = parseAuditDate(html);
  if (!auditDate) return [];
  const auditSignedAt = `${auditDate}T00:00:00Z`;
  if (Date.parse(auditSignedAt) > Date.parse(input.collectedAt)) return [];
  // The signing date is not proof that the filing was public at midnight on
  // that date. Collection time is the first availability instant this adapter
  // can defend, which prevents point-in-time research from looking ahead.
  const filingPublishedAt = new Date(input.collectedAt).toISOString();
  const rows: ParsedFact[] = [];
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/giu)) {
    const attrs = attributes(match[1]);
    const context = contexts.get(attrs.contextref);
    const value = finiteFact(match[2], attrs.scale, attrs.sign);
    if (!context || value == null) continue;
    const concept = conceptSuffix(attrs.name);
    let factKey = FLOW_FACTS[concept] || null;
    let unit: ParsedFact['unit'] = 'TWD';
    if (EPS_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'EarningsPerShare') continue;
      factKey = 'quarterly_diluted_eps'; unit = 'TWD_per_share';
    } else if (SHARE_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'Shares') continue;
      factKey = 'diluted_weighted_average_shares'; unit = 'share';
    } else if (factKey && !/^TWD(?:\w+)?$/u.test(attrs.unitref || '')) continue;
    if (!factKey) continue;
    rows.push({
      stockId: input.stockId, factKey, periodStart: context.start, periodEnd: context.end,
      durationKind: 'quarterly', value, unit, provider: 'mops',
      authorityTier: 'official_filing', estimateKind: 'reported', estimateHorizon: 'reported_period',
      filingPublishedAt, sourceTimestamp: filingPublishedAt, collectedAt: filingPublishedAt,
      filingRestatementId: null,
      sourceRef: `${input.exchange.toLowerCase()}-mops-inline:${context.end}:${input.symbol}:${sha256(`${input.sourceUrl}:${attrs.name}:${attrs.contextref}:${attrs.unitref}`)}`,
    });
  }
  const deduped = new Map(rows.map((row) => [`${row.factKey}:${row.periodStart}:${row.periodEnd}:${row.sourceRef}`, row]));
  return [...deduped.values()];
}

function completedQuarters(cutoff: string, count = 8) {
  const date = new Date(cutoff);
  const currentQuarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return Array.from({ length: count }, (_, offset) => {
    const serial = date.getUTCFullYear() * 4 + currentQuarter - 2 - offset;
    return { year: Math.floor(serial / 4), quarter: (serial % 4) + 1 };
  });
}

async function fetchFiling(candidate: CandidateOfficialFinancial, year: number, quarter: number, collectedAt: string) {
  const sourceUrl = `${MOPS_INLINE_URL}?step=1&CO_ID=${candidate.symbol}&SYEAR=${year - 1911}&SSEASON=${quarter}&REPORT_ID=C`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const response = await fetch(sourceUrl, { headers: { Accept: 'text/html', 'user-agent': 'StockInsider/3.0' }, redirect: 'error', signal: AbortSignal.timeout(12_000) });
      if (!response.ok || response.redirected) throw new Error(`mops_http_${response.status}`);
      return parseCandidateMopsFacts(await response.text(), { ...candidate, sourceUrl, collectedAt });
    } catch (error) {
      lastError = error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error('mops_unavailable');
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>) {
  const output = new Array<R>(items.length);
  let index = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      output[current] = await work(items[current]);
    }
  }));
  return output;
}

export async function refreshCandidateOfficialFinancials(candidates: CandidateOfficialFinancial[], cutoff: string) {
  const runnerPrincipal = fixedRunnerPrincipal();
  if (!runnerPrincipal) throw new Error('candidate_financial_runner_principal_missing');
  const collectedAt = new Date().toISOString();
  const requests = completedQuarters(cutoff).flatMap(({ year, quarter }) => candidates.map((candidate) => ({ candidate, year, quarter })));
  const outcomes = await mapLimit(requests, 2, async ({ candidate, year, quarter }) => {
    try {
      const facts = await fetchFiling(candidate, year, quarter, collectedAt);
      return { facts, error: null };
    } catch (error) {
      return { facts: [] as ParsedFact[], error: `${candidate.symbol}:${year}Q${quarter}:${error instanceof Error ? error.message : String(error)}` };
    }
  });
  const facts = outcomes.flatMap((row) => row.facts);
  const failures = outcomes.flatMap((row) => row.error ? [row.error] : []);
  const client = getOpportunityV3ServerClient();
  const writes = await mapLimit(facts, 8, async (fact) => {
    const result = await client.rpc('append_financial_fact_v3', {
      input: {
        stock_id: fact.stockId, fact_key: fact.factKey, period_start: fact.periodStart,
        period_end: fact.periodEnd, duration_kind: fact.durationKind, value: fact.value, unit: fact.unit,
        provider: fact.provider, authority_tier: fact.authorityTier, estimate_kind: fact.estimateKind,
        estimate_horizon: fact.estimateHorizon, filing_published_at: fact.filingPublishedAt,
        source_timestamp: fact.sourceTimestamp, collected_at: fact.collectedAt,
        filing_restatement_id: fact.filingRestatementId, source_ref: fact.sourceRef,
      },
      caller_principal: runnerPrincipal,
    });
    return result.error ? { ok: false, error: result.error.message } : { ok: true, error: null };
  });
  const writeFailures = writes.filter((row) => !row.ok);
  if (writeFailures.length > 0) throw new Error(`candidate_financial_fact_write_failed:${writeFailures[0].error}`);
  return { candidateCount: candidates.length, fetchedFilings: requests.length - failures.length, parsedFacts: facts.length, writtenFacts: writes.length, failures };
}
