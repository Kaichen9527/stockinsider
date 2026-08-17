'use strict';

const { sha256 } = require('./codec');

const MOPS_INLINE_URL = 'https://mopsov.twse.com.tw/server-java/t164sb01';
const MONEY_FACTS = Object.freeze({
  revenue:'quarterly_revenue', revenuefromcontractswithcustomers:'quarterly_revenue',
  grossprofit:'quarterly_gross_profit', grossprofitlossfromoperations:'quarterly_gross_profit',
  operatingexpense:'quarterly_operating_expense', operatingexpenses:'quarterly_operating_expense',
  netoperatingincomeloss:'quarterly_operating_income', profitlossfromoperatingactivities:'quarterly_operating_income',
  nonoperatingincomeandexpenses:'quarterly_non_operating_income',
  profitlossbeforetax:'quarterly_pretax_income', incometaxexpensecontinuingoperations:'quarterly_income_tax_expense',
  profitloss:'quarterly_net_income', profitlossattributabletoownersofparent:'quarterly_net_income_attributable_to_common',
  profitlossattributabletononcontrollinginterests:'quarterly_noncontrolling_interest',
  cashandcashequivalents:'cash_and_equivalents', assets:'total_assets', equity:'total_equity',
});
const DEBT_CATEGORIES = Object.freeze(Object.assign(Object.create(null),{
  shorttermborrowings:'short_term_borrowings', shorttermloans:'short_term_borrowings',
  longtermborrowings:'long_term_borrowings', longtermloans:'long_term_borrowings',
  noncurrentportionofnoncurrentloansreceived:'long_term_borrowings',
  bondspayable:'bonds', noncurrentportionofnoncurrentbondsissued:'bonds',
  currentportionoflongtermliabilities:'current_portion', longtermliabilitiescurrentportion:'current_portion',
}));
const EPS_CONCEPTS = Object.freeze(new Set(['dilutedearningspershare', 'dilutedearningslosspershare']));
const BOOK_VALUE_CONCEPTS = Object.freeze(new Set(['bookvaluepershare', 'netassetspershare']));
const SHARE_CONCEPTS = Object.freeze(new Set(['weightedaveragenumberofdilutedsharesoutstanding',
  'dilutedweightedaveragenumberofsharesoutstanding']));

async function fetchMopsWithRetry(request, fetchImpl, attempts = 4) {
  let failure = null;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(request.url, { headers:{ Accept:'text/html', 'user-agent':'StockInsider/3.14' },
        redirect:'error', signal:AbortSignal.timeout(12000) });
      if (!response?.ok || response.redirected) throw new Error('mops_unavailable');
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 100 || bytes.length > 12_000_000) throw new Error('mops_size');
      return { request, bytes };
    } catch (error) {
      failure = error;
      if (attempt + 1 < attempts) await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  throw failure ?? new Error('mops_unavailable');
}

function attributes(text) {
  const output = {};
  for (const match of String(text).matchAll(/([A-Za-z_:][A-Za-z0-9_.:-]*)\s*=\s*(["'])(.*?)\2/gu))
    output[match[1].toLowerCase()] = match[3];
  return output;
}

function textValue(value) {
  return String(value).replace(/<[^>]+>/gu, '').replace(/&nbsp;|&#160;/giu, ' ')
    .replace(/&minus;/giu, '-').replace(/&amp;/giu, '&').trim();
}

function finiteFact(value, scale = 0, sign = null) {
  const normalized = textValue(value).replace(/,/gu, '').replace(/[()]/gu, '');
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const parsed = Number(normalized) * (String(value).includes('(') || sign === '-' ? -1 : 1) * (10 ** Number(scale || 0));
  return Number.isFinite(parsed) ? parsed : null;
}

function conceptSuffix(name) {
  return String(name ?? '').split(':').at(-1).replace(/[^A-Za-z0-9]/gu, '').toLowerCase();
}

function parseContexts(html) {
  const output = new Map();
  for (const match of String(html).matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/giu)) {
    const id = attributes(match[1]).id; if (!id) continue; const body = match[2];
    // Valuation facts must come from the consolidated issuer context. Inline
    // XBRL segment/scenario members can carry a perfectly valid concept and
    // period while representing only a business unit or other dimension.
    if (/<(?:[A-Za-z0-9_-]+:)?(?:segment|scenario|explicitMember|typedMember)\b/iu.test(body)) continue;
    const start = body.match(/<xbrli:startDate>(\d{4}-\d{2}-\d{2})<\/xbrli:startDate>/iu)?.[1] ?? null;
    const end = body.match(/<xbrli:endDate>(\d{4}-\d{2}-\d{2})<\/xbrli:endDate>/iu)?.[1] ?? null;
    const instant = body.match(/<xbrli:instant>(\d{4}-\d{2}-\d{2})<\/xbrli:instant>/iu)?.[1] ?? null;
    if ((start && end) || instant) output.set(id, { start, end:end ?? instant, durationKind:instant ? 'instant' : 'quarterly' });
  }
  return output;
}

function isYearToDateContext(context) {
  return context?.durationKind === 'quarterly'
    && context.start === `${String(context.end).slice(0, 4)}-01-01`;
}

function parseAuditDate(html) {
  for (const match of String(html).matchAll(/<ix:(?:nonNumeric|nonFraction)\b([^>]*)>([\s\S]*?)<\/ix:(?:nonNumeric|nonFraction)>/giu)) {
    if (conceptSuffix(attributes(match[1]).name) !== 'reviewauditdate') continue;
    const raw = textValue(match[2]).replace(/[/.]/gu, '-');
    const roc = raw.match(/^(\d{3})-(\d{1,2})-(\d{1,2})$/u);
    const gregorian = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/u);
    const year = roc ? Number(roc[1]) + 1911 : gregorian ? Number(gregorian[1]) : null;
    const month = roc?.[2] ?? gregorian?.[2]; const day = roc?.[3] ?? gregorian?.[3];
    if (year && month && day) {
      const date = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const parsed = new Date(`${date}T00:00:00Z`); if (parsed.toISOString().slice(0, 10) === date) return date;
    }
  }
  return null;
}

function parseMopsInlineFacts(html, { symbol, exchange, sourceUrl, collectedAt } = {}) {
  if (typeof html !== 'string' || html.length < 100 || html.length > 12_000_000 || !/^\d{4}$/u.test(String(symbol))
    || !['TWSE', 'TPEX'].includes(exchange) || typeof sourceUrl !== 'string'
    || !sourceUrl.startsWith(MOPS_INLINE_URL) || !Number.isFinite(Date.parse(collectedAt))) return [];
  const contexts = parseContexts(html); const auditDate = parseAuditDate(html); if (!auditDate) return [];
  const filingPublishedAt = `${auditDate}T00:00:00Z`; const sourceTimestamp = filingPublishedAt;
  const collectionTimestamp=new Date(collectedAt).toISOString();
  if (Date.parse(sourceTimestamp) > Date.parse(collectionTimestamp)) return [];
  const provider = exchange.toLowerCase(); const facts = []; const debts = new Map();
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/giu)) {
    const attrs = attributes(match[1]); const context = contexts.get(attrs.contextref); if (!context) continue;
    const concept = conceptSuffix(attrs.name); const value = finiteFact(match[2], attrs.scale, attrs.sign); if (!Number.isFinite(value)) continue;
    let factKey = MONEY_FACTS[concept] ?? null; let unit = 'TWD'; let durationKind = context.durationKind;
    if (EPS_CONCEPTS.has(concept)) { if (!/^EarningsPerShare$/u.test(String(attrs.unitref))) continue;
      factKey = 'quarterly_diluted_eps'; unit = 'TWD_per_share'; }
    else if(BOOK_VALUE_CONCEPTS.has(concept)){if(!/^EarningsPerShare$/u.test(String(attrs.unitref))||durationKind!=='instant')continue;
      factKey='book_value_per_share';unit='TWD_per_share';}
    else if (SHARE_CONCEPTS.has(concept)) { if (!/^Shares$/u.test(String(attrs.unitref))) continue;
      factKey = 'diluted_weighted_average_shares'; unit = 'share'; }
    else if (factKey || DEBT_CATEGORIES[concept]) { if (!/^TWD(?:\w+)?$/u.test(String(attrs.unitref))) continue; }
    else continue;
    if (DEBT_CATEGORIES[concept]) {
      if(durationKind!=='instant')continue;
      const debtKey = `${context.end}:${context.start ?? ''}`;
      const categories=debts.get(debtKey)??new Map();const category=DEBT_CATEGORIES[concept];
      const prior=categories.get(category);
      if(prior===undefined)categories.set(category,value);
      else if(prior!==value)categories.set(category,null);
      debts.set(debtKey,categories);continue;
    }
    const instantFact = ['cash_and_equivalents','total_assets','total_equity','book_value_per_share'].includes(factKey);
    if ((instantFact && durationKind !== 'instant') || (!instantFact && !isYearToDateContext(context))) continue;
    facts.push({ symbol:String(symbol), exchange, factKey, periodStart:durationKind === 'instant' ? null : context.start,
      periodEnd:context.end, durationKind, value, unit, provider, authorityTier:'official_filing',
      estimateKind:'reported', estimateHorizon:'reported_period', filingPublishedAt, sourceTimestamp,
      collectedAt:collectionTimestamp, sourceUrl,
      sourceRef:`${provider}-mops-inline:${context.end}:${symbol}:${sha256(Buffer.from(`${sourceUrl}:${attrs.name}:${attrs.contextref}:${attrs.unitref}`))}` });
  }
  for (const [identity, categories] of debts) {
    if([...categories.values()].some((value)=>!Number.isFinite(value)))continue;
    const value=[...categories.values()].reduce((sum,entry)=>sum+entry,0);
    const [periodEnd, periodStart] = identity.split(':'); facts.push({ symbol:String(symbol), exchange,
      factKey:'total_debt', periodStart:periodStart || null, periodEnd, durationKind:periodStart ? 'quarterly' : 'instant',
      value, unit:'TWD', provider, authorityTier:'official_filing', estimateKind:'reported',
      estimateHorizon:'reported_period', filingPublishedAt, sourceTimestamp, collectedAt:collectionTimestamp, sourceUrl,
      sourceRef:`${provider}-mops-inline:${periodEnd}:${symbol}:${sha256(Buffer.from(`${sourceUrl}:${identity}:${[...categories]
        .sort(([left],[right])=>left.localeCompare(right)).map(([key,entry])=>`${key}=${entry}`).join(',')}`))}` });
  }
  return [...new Map(facts.map((row) => [`${row.factKey}:${row.periodStart}:${row.periodEnd}:${row.sourceRef}`, row])).values()];
}

function selectLatestMopsFacts(facts) {
  const groups = Map.groupBy(facts, (row) => `${row.symbol}:${row.exchange}:${row.factKey}:${row.periodStart ?? ''}:${row.periodEnd}:${row.durationKind}`);
  const heads=[...groups.values()].map((rows) => [...rows].sort((left, right) =>
    String(right.filingPublishedAt).localeCompare(String(left.filingPublishedAt))
      || String(right.sourceTimestamp).localeCompare(String(left.sourceTimestamp))
      || String(left.sourceRef).localeCompare(String(right.sourceRef)))[0]);
  const bounded=[];
  for(const rows of Map.groupBy(heads,(row)=>`${row.symbol}:${row.exchange}:${row.factKey}`).values()){
    const ordered=[...rows].sort((left,right)=>String(left.periodEnd).localeCompare(String(right.periodEnd)));
    const key=ordered[0]?.factKey;const limit=ordered[0]?.durationKind==='instant'?1
      :['quarterly_revenue','quarterly_net_income_attributable_to_common'].includes(key)?12:8;
    bounded.push(...ordered.slice(-limit));
  }
  for(const rows of Map.groupBy(bounded,(row)=>`${row.symbol}:${row.exchange}`).values())
    if(rows.length>128)throw new Error('mops_financial_fact_bound');
  return bounded;
}

function quarterCoordinates(cutoff, count = 6) {
  const date = new Date(cutoff); const currentQuarter = Math.floor(date.getUTCMonth() / 3) + 1; const output = [];
  // The current civil quarter has not closed and therefore cannot have a
  // point-in-time quarterly filing. Start with the most recently completed
  // quarter instead of spending one provider request per candidate on a known
  // non-existent report (and triggering the MOPS WAF before useful work).
  for (let offset = 0; offset < count; offset += 1) {
    const serial = date.getUTCFullYear() * 4 + currentQuarter - 2 - offset;
    output.push({ year:Math.floor(serial / 4), quarter:(serial % 4) + 1 });
  }
  return output;
}

async function loadMopsFinancialHistoryV314({ cutoff, candidates = [], fetchImpl = globalThis.fetch,
  collectedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(candidates) || candidates.length > 30) throw new Error('mops_candidate_bound');
  const coordinates=quarterCoordinates(cutoff);
  const requests = coordinates.flatMap(({year,quarter})=>candidates.map((candidate) => ({
    symbol:String(candidate.symbol), exchange:String(candidate.exchange),
    url:`${MOPS_INLINE_URL}?step=1&CO_ID=${candidate.symbol}&SYEAR=${year}&SSEASON=${quarter}&REPORT_ID=C`,
  }))).filter((row) => /^\d{4}$/u.test(row.symbol) && ['TWSE', 'TPEX'].includes(row.exchange));
  if(typeof collectedAt!=='string'||!Number.isFinite(Date.parse(collectedAt)))throw new Error('mops_collected_at');
  collectedAt = new Date(collectedAt).toISOString().replace('.000Z', 'Z'); const facts = []; const sourceHashes = {}; const sourceFailures = [];
  for (let offset = 0; offset < requests.length; offset += 1) {
    const request = requests[offset];
    const result = await Promise.allSettled([fetchMopsWithRetry(request, fetchImpl)]).then(([entry]) => entry);
    if (result.status === 'rejected') { sourceFailures.push({ url:request.url, reason:'official_source_unavailable' }); continue; }
    sourceHashes[request.url] = sha256(result.value.bytes);
    facts.push(...parseMopsInlineFacts(result.value.bytes.toString('utf8'), {
      ...request, sourceUrl:request.url, collectedAt,
    }));
    if(fetchImpl===globalThis.fetch)await new Promise((resolve)=>setTimeout(resolve,350));
  }
  return Object.freeze({ facts:Object.freeze(selectLatestMopsFacts(facts)), sourceHashes:Object.freeze(sourceHashes),
    sourceFailures:Object.freeze(sourceFailures) });
}

module.exports = { MOPS_INLINE_URL, loadMopsFinancialHistoryV314, parseAuditDate, parseContexts,
  parseMopsInlineFacts, quarterCoordinates, selectLatestMopsFacts };
