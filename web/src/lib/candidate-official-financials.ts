import { createHash } from 'crypto';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';
import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';
import { classifyFinancialResponse, issuerIrDocumentQueueKey, parseTpexFinancialEndpoint, TPEX_FINANCIAL_ENDPOINTS } from './candidate-financial-acquisition.ts';
import { fetchFinMindFinancialFallback, finMindFinancialErrorDetail } from './finmind-financial-fallback.ts';

const MOPS_INLINE_URL = 'https://mopsov.twse.com.tw/server-java/t164sb01';
// 60 MOPS jobs × three 12s attempts at concurrency two is ~18 minutes before
// persistence. Keep a conservative lease envelope so slow official responses
// cannot turn successful downloads into false write failures.
const FINANCIAL_JOB_LEASE_MS = 45 * 60_000;
const TPEX_JOB_KEYS = {
  generalIncome: 'tpex_general_income', brokerIncome: 'tpex_broker_income',
  generalBalance: 'tpex_general_balance', brokerBalance: 'tpex_broker_balance',
} as const;
const VERIFIED_ISSUER_IR_FALLBACKS: Record<string, { listingUrl: string; documentUrl: string; title: string }> = {
  '2408': {
    listingUrl: 'https://www.nanya.com/en/IR/39/Financial%20Reports?Year=2025',
    documentUrl: 'https://www.nanya.com/en/Activity?Action=Get_IRFinancialReport_FileName&Id=125',
    title: '2025 Q2 Consolidated Financial Report',
  },
};
const FLOW_FACTS: Record<string, string> = {
  revenue: 'quarterly_revenue', revenuefromcontractswithcustomers: 'quarterly_revenue',
  grossprofit: 'quarterly_gross_profit', grossprofitlossfromoperations: 'quarterly_gross_profit',
  netoperatingincomeloss: 'quarterly_operating_income', profitlossfromoperatingactivities: 'quarterly_operating_income',
  operatingexpenses: 'quarterly_operating_expense', operatingexpense: 'quarterly_operating_expense',
  nonoperatingincomeexpense: 'quarterly_non_operating_income', othernonoperatingincomeexpense: 'quarterly_non_operating_income',
  profitlossbeforetax: 'quarterly_pretax_income', incometaxexpensebenefit: 'quarterly_income_tax_expense',
  profitloss: 'quarterly_net_income', profitlossattributabletoownersofparent: 'quarterly_net_income_attributable_to_common',
  profitlossattributabletononcontrollinginterest: 'quarterly_noncontrolling_interest', profitlossattributabletononcontrollinginterests: 'quarterly_noncontrolling_interest',
};
const BALANCE_FACTS: Record<string, string> = {
  assets: 'total_assets', totalassets: 'total_assets', equity: 'total_equity', equityattributabletoownersofparent: 'total_equity',
  cashandcashequivalents: 'cash_and_equivalents', cashandcashequivalentsatcarryingvalue: 'cash_and_equivalents',
  bookvaluepershare: 'book_value_per_share',
};
const DILUTED_EPS_CONCEPTS = new Set(['dilutedearningspershare', 'dilutedearningslosspershare']);
const BASIC_EPS_CONCEPTS = new Set(['basicearningspershare', 'basicearningslosspershare']);
const DILUTED_SHARE_CONCEPTS = new Set(['weightedaveragenumberofdilutedsharesoutstanding', 'dilutedweightedaveragenumberofsharesoutstanding']);
const BASIC_SHARE_CONCEPTS = new Set(['weightedaveragenumberofsharesoutstanding', 'basicweightedaveragenumberofsharesoutstanding']);
const SHARES_OUTSTANDING_CONCEPTS = new Set(['numberofsharesoutstanding']);

export type CandidateOfficialFinancial = {
  stockId: string;
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
};

export type ParsedFact = {
  stockId: string;
  symbol: string;
  factKey: string;
  periodStart: string | null;
  periodEnd: string;
  durationKind: 'quarterly' | 'instant';
  value: number;
  unit: 'TWD' | 'TWD_per_share' | 'share';
  provider: 'mops' | 'tpex' | 'finmind';
  authorityTier: 'official_filing' | 'finmind_mirror';
  estimateKind: 'reported';
  estimateHorizon: 'reported_period';
  filingPublishedAt: string;
  sourceTimestamp: string;
  collectedAt: string;
  filingRestatementId: string | null;
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
  const output = new Map<string, { start: string | null; end: string; instant: boolean }>();
  for (const match of html.matchAll(/<xbrli:context\b([^>]*)>([\s\S]*?)<\/xbrli:context>/giu)) {
    const id = attributes(match[1]).id;
    if (!id || /<(?:[A-Za-z0-9_-]+:)?(?:segment|scenario|explicitMember|typedMember)\b/iu.test(match[2])) continue;
    const start = match[2].match(/<xbrli:startDate>(\d{4}-\d{2}-\d{2})<\/xbrli:startDate>/iu)?.[1];
    const end = match[2].match(/<xbrli:endDate>(\d{4}-\d{2}-\d{2})<\/xbrli:endDate>/iu)?.[1];
    const instant = match[2].match(/<xbrli:instant>(\d{4}-\d{2}-\d{2})<\/xbrli:instant>/iu)?.[1];
    if (start && end) output.set(id, { start, end, instant: false });
    else if (instant) output.set(id, { start: null, end: instant, instant: true });
  }
  return output;
}

function restatementId(html: string, auditDate: string) {
  // A content hash is provenance, not a claim that every changed byte is a
  // material restatement. The bridge compares fact values/periods before using
  // a successor disclosure, so a changed filing can never silently mix series.
  return `mops:${auditDate}:${sha256(html.replace(/\s+/gu, ' ').trim())}`;
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
  const filingRestatementId = restatementId(html, auditDate);
  const rows: ParsedFact[] = [];
  for (const match of html.matchAll(/<ix:nonFraction\b([^>]*)>([\s\S]*?)<\/ix:nonFraction>/giu)) {
    const attrs = attributes(match[1]);
    const context = contexts.get(attrs.contextref);
    const value = finiteFact(match[2], attrs.scale, attrs.sign);
    if (!context || value == null) continue;
    const concept = conceptSuffix(attrs.name);
    let factKey = FLOW_FACTS[concept] || BALANCE_FACTS[concept] || null;
    let unit: ParsedFact['unit'] = 'TWD';
    if (DILUTED_EPS_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'EarningsPerShare') continue;
      factKey = 'quarterly_diluted_eps'; unit = 'TWD_per_share';
    } else if (BASIC_EPS_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'EarningsPerShare') continue;
      factKey = 'quarterly_basic_eps'; unit = 'TWD_per_share';
    } else if (DILUTED_SHARE_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'Shares') continue;
      factKey = 'diluted_weighted_average_shares'; unit = 'share';
    } else if (BASIC_SHARE_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'Shares') continue;
      factKey = 'basic_weighted_average_shares'; unit = 'share';
    } else if (SHARES_OUTSTANDING_CONCEPTS.has(concept)) {
      if (attrs.unitref !== 'Shares') continue;
      factKey = 'shares_outstanding'; unit = 'share';
    } else if (factKey === 'book_value_per_share') {
      if (attrs.unitref !== 'EarningsPerShare' && !/^TWD(?:\w+)?$/u.test(attrs.unitref || '')) continue;
      unit = 'TWD_per_share';
    } else if (factKey && !context.instant && !/^TWD(?:\w+)?$/u.test(attrs.unitref || '')) continue;
    if (!factKey) continue;
    const isInstantFact = Boolean(BALANCE_FACTS[concept]) || SHARES_OUTSTANDING_CONCEPTS.has(concept);
    if (isInstantFact !== context.instant) continue;
    rows.push({
      stockId: input.stockId, symbol: input.symbol, factKey, periodStart: context.start, periodEnd: context.end,
      durationKind: context.instant ? 'instant' : 'quarterly', value, unit, provider: 'mops',
      authorityTier: 'official_filing', estimateKind: 'reported', estimateHorizon: 'reported_period',
      filingPublishedAt, sourceTimestamp: filingPublishedAt, collectedAt: input.collectedAt,
      filingRestatementId,
      sourceRef: `${input.exchange.toLowerCase()}-mops-inline:${context.end}:${input.symbol}:${sha256(`${input.sourceUrl}:${attrs.name}:${attrs.contextref}:${attrs.unitref}:${filingRestatementId}`)}`,
    });
  }
  const deduped = new Map(rows.map((row) => [`${row.factKey}:${row.periodStart}:${row.periodEnd}:${row.sourceRef}`, row]));
  return [...deduped.values()];
}

export function selectCandidateFilingPeriodFacts(facts: ParsedFact[], periodEnd: string) {
  return facts.filter((fact) => fact.periodEnd === periodEnd);
}

function completedQuarters(cutoff: string, count = 8) {
  const date = new Date(cutoff);
  const currentQuarter = Math.floor(date.getUTCMonth() / 3) + 1;
  return Array.from({ length: count }, (_, offset) => {
    const serial = date.getUTCFullYear() * 4 + currentQuarter - 2 - offset;
    return { year: Math.floor(serial / 4), quarter: (serial % 4) + 1 };
  });
}

export function financialBridgeAcquisitionQuarters(cutoff: string, count = 8) {
  const requested = completedQuarters(cutoff, count);
  const oldest = requested.at(-1);
  if (!oldest || oldest.quarter === 1) return requested;
  const prerequisites = Array.from({ length: oldest.quarter - 1 }, (_, index) => ({
    year: oldest.year,
    quarter: index + 1,
  }));
  return [...requested, ...prerequisites];
}

async function fetchFiling(candidate: CandidateOfficialFinancial, year: number, quarter: number, collectedAt: string) {
  const sourceUrl = `${MOPS_INLINE_URL}?step=1&CO_ID=${candidate.symbol}&SYEAR=${year - 1911}&SSEASON=${quarter}&REPORT_ID=C`;
  const periodEnd = `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1]}`;
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      // MOPS returns a 307 body (without a Location header) when its security
      // policy blocks a VPS address. Manual redirect handling keeps that body
      // inspectable instead of reducing it to Node's opaque `fetch failed`.
      const response = await fetch(sourceUrl, { headers: { Accept: 'text/html', 'user-agent': 'StockInsider/5.0' }, redirect: 'manual', signal: AbortSignal.timeout(12_000) });
      const body = await response.text();
      const rejected = classifyFinancialResponse(response.status, response.headers.get('content-type'), body, 'html');
      if (rejected) throw new Error(`mops_${rejected}_http_${response.status}`);
      const facts = selectCandidateFilingPeriodFacts(parseCandidateMopsFacts(body, { ...candidate, sourceUrl, collectedAt }), periodEnd);
      if (facts.length === 0) throw new Error('mops_schema_unrecognized_or_empty');
      return { facts, sourceUrl, sourceSha256: sha256(body), responseBytes: Buffer.byteLength(body, 'utf8'), fallbackUsed: false as const, credentialMode: null };
    } catch (error) {
      lastError = error;
      if (/security_blocked/iu.test(finMindFinancialErrorDetail(error))) break;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw new Error(lastError ? finMindFinancialErrorDetail(lastError) : 'mops_unavailable');
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

async function consecutiveFailureCounts(
  client: ReturnType<typeof getOpportunityV3ServerClient>,
  claimed: Array<Record<string, unknown>>,
) {
  const jobIds = claimed.map((job) => String(job.job_id || '')).filter(Boolean);
  if (jobIds.length === 0) return new Map<string, number>();
  const result = await client.from('candidate_financial_acquisition_jobs_v4')
    .select('job_id,consecutive_failures').in('job_id', jobIds);
  if (result.error) throw new Error(`candidate_financial_failure_count_read_failed:${result.error.message}`);
  return new Map((result.data || []).map((job) => [String(job.job_id), Number(job.consecutive_failures || 0)]));
}

function toParsedTpexFact(fact: ReturnType<typeof parseTpexFinancialEndpoint>['facts'][number], candidate: CandidateOfficialFinancial, collectedAt: string): ParsedFact {
  const perShare = fact.unit === 'TWD_per_share';
  return {
    stockId: candidate.stockId, symbol: candidate.symbol,
    factKey: fact.factKey, periodStart: fact.periodStart, periodEnd: fact.periodEnd,
    durationKind: fact.durationKind, value: perShare ? fact.value : fact.value * 1000,
    unit: perShare ? 'TWD_per_share' : 'TWD', provider: 'tpex', authorityTier: 'official_filing',
    estimateKind: 'reported', estimateHorizon: 'reported_period', filingPublishedAt: fact.sourceTimestamp,
    sourceTimestamp: fact.sourceTimestamp, collectedAt, filingRestatementId: fact.filingRestatementId,
    sourceRef: fact.sourceRef,
  };
}

function financialFactInput(fact: ParsedFact) {
  return {
    stock_id: fact.stockId, fact_key: fact.factKey, period_start: fact.periodStart,
    period_end: fact.periodEnd, duration_kind: fact.durationKind, value: fact.value, unit: fact.unit,
    provider: fact.provider, authority_tier: fact.authorityTier, estimate_kind: fact.estimateKind,
    estimate_horizon: fact.estimateHorizon, filing_published_at: fact.filingPublishedAt,
    source_timestamp: fact.sourceTimestamp, collected_at: fact.collectedAt,
    filing_restatement_id: fact.filingRestatementId, source_ref: fact.sourceRef,
  };
}

async function completeAcquisitionJob(input: {
  client: ReturnType<typeof getOpportunityV3ServerClient>;
  runnerPrincipal: string;
  owner: string;
  jobId: string;
  facts: ParsedFact[];
  sourceSha256: string;
  responseBytes: number;
  collectedAt: string;
}) {
  const result = await input.client.rpc('complete_candidate_financial_acquisition_job_v4', {
    p_job_id: input.jobId, p_owner: input.owner, p_caller_principal: input.runnerPrincipal,
    p_facts: input.facts.map((fact) => ({
      input: financialFactInput(fact),
      locator: { source_ref: fact.sourceRef, period_end: fact.periodEnd, fact_key: fact.factKey },
    })),
    p_source_sha256: input.sourceSha256, p_response_bytes: input.responseBytes,
    p_collected_at: input.collectedAt,
  });
  if (result.error) throw new Error(`candidate_financial_job_completion_failed:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return Number((row as { written_facts?: number } | null)?.written_facts || 0);
}

async function recordFallbackAcquisitionJob(input: {
  client: ReturnType<typeof getOpportunityV3ServerClient>;
  runnerPrincipal: string;
  owner: string;
  jobId: string;
  attempts: number;
  facts: ParsedFact[];
  sourceSha256: string;
  responseBytes: number;
  collectedAt: string;
  primaryError: string;
}) {
  const retryHours = Math.min(24, 2 ** Math.min(4, input.attempts));
  const result = await input.client.rpc('record_candidate_financial_fallback_v5', {
    p_job_id: input.jobId, p_owner: input.owner, p_caller_principal: input.runnerPrincipal,
    p_facts: input.facts.map((fact) => ({
      input: financialFactInput(fact),
      locator: { source_ref: fact.sourceRef, period_end: fact.periodEnd, fact_key: fact.factKey },
    })),
    p_source_sha256: input.sourceSha256, p_response_bytes: input.responseBytes,
    p_collected_at: input.collectedAt,
    p_primary_reason: acquisitionTerminalReason(input.primaryError),
    p_primary_error: input.primaryError.slice(0, 500),
    p_next_attempt_at: new Date(Date.parse(input.collectedAt) + retryHours * 60 * 60_000).toISOString(),
  });
  if (result.error) throw new Error(`candidate_financial_fallback_record_failed:${result.error.message}`);
  const row = Array.isArray(result.data) ? result.data[0] : result.data;
  return Number((row as { written_facts?: number } | null)?.written_facts || 0);
}

async function failAcquisitionJob(input: {
  client: ReturnType<typeof getOpportunityV3ServerClient>;
  jobId: string;
  owner: string;
  attempts: number;
  consecutiveFailures: number;
  error: string;
  collectedAt: string;
}) {
  const attempts = Math.min(input.attempts + 1, 20);
  const consecutiveFailures = Math.min(input.consecutiveFailures + 1, 5);
  const retryable = consecutiveFailures < 5;
  const reason = acquisitionTerminalReason(input.error);
  const update = retryable
    ? {
        status: 'queued', attempts, consecutive_failures: consecutiveFailures, lease_owner: null, lease_expires_at: null, terminal_reason: null,
        terminal_detail: input.error.slice(0, 500),
        next_attempt_at: new Date(Date.now() + (2 ** (consecutiveFailures - 1)) * 60 * 60_000).toISOString(),
        updated_at: input.collectedAt,
      }
    : {
        status: 'terminal', attempts, consecutive_failures: consecutiveFailures, lease_owner: null, lease_expires_at: null,
        terminal_reason: reason, terminal_detail: input.error.slice(0, 500),
        collected_at: input.collectedAt, next_attempt_at: null, updated_at: input.collectedAt,
      };
  const result = await input.client.from('candidate_financial_acquisition_jobs_v4').update(update)
    .eq('job_id', input.jobId).eq('status', 'running').eq('lease_owner', input.owner)
    .select('job_id,stock_id,endpoint_key,period_end,cursor_key').maybeSingle();
  if (result.error || !result.data) throw new Error(`candidate_financial_job_lease_lost:${result.error?.message || input.jobId}`);
  const job = result.data as Record<string, unknown>;
  const cursor = await input.client.from('candidate_financial_acquisition_cursors_v4').upsert({
    stock_id: job.stock_id, endpoint_key: job.endpoint_key,
    cursor_value: { cursor_key: job.cursor_key, job_id: input.jobId, retry_scheduled: retryable },
    last_terminal_reason: reason,
    last_collected_at: input.collectedAt, updated_at: input.collectedAt,
  }, { onConflict: 'stock_id,endpoint_key' });
  if (cursor.error) throw new Error(`candidate_financial_cursor_write_failed:${cursor.error.message}`);
}

async function deferUnpublishedAcquisitionJob(input: {
  client: ReturnType<typeof getOpportunityV3ServerClient>;
  jobId: string;
  owner: string;
  collectedAt: string;
  detail: string;
}) {
  const nextAttemptAt = new Date(Date.parse(input.collectedAt) + 6 * 60 * 60_000).toISOString();
  const result = await input.client.from('candidate_financial_acquisition_jobs_v4').update({
    status: 'queued', lease_owner: null, lease_expires_at: null, terminal_reason: null,
    terminal_detail: input.detail.slice(0, 500), next_attempt_at: nextAttemptAt,
    updated_at: input.collectedAt,
  }).eq('job_id', input.jobId).eq('status', 'running').eq('lease_owner', input.owner)
    .select('job_id').maybeSingle();
  if (result.error || !result.data) throw new Error(`candidate_financial_job_lease_lost:${result.error?.message || input.jobId}`);
}

function acquisitionTerminalReason(message: string) {
  if (/write_failed|completion_failed/iu.test(message)) return 'write_failed';
  if (/timeout/iu.test(message)) return 'timeout';
  if (/security|captcha|forbidden|waf/iu.test(message)) return 'security_blocked';
  if (/html/iu.test(message)) return 'html_rejected';
  if (/schema|empty/iu.test(message)) return 'schema_unrecognized';
  if (/404|not_found/iu.test(message)) return 'http_not_found';
  if (/429|rate/iu.test(message)) return 'http_rate_limited';
  if (/5\d\d|server/iu.test(message)) return 'http_server_error';
  return 'network_error';
}

export type CandidateOfficialFinancialRefreshOptions = {
  enqueueMissing?: boolean;
  maxJobs?: number;
};

export async function refreshCandidateOfficialFinancials(
  candidates: CandidateOfficialFinancial[],
  cutoff: string,
  options: CandidateOfficialFinancialRefreshOptions = {},
) {
  const runnerPrincipal = fixedRunnerPrincipal();
  if (!runnerPrincipal) throw new Error('candidate_financial_runner_principal_missing');
  const collectedAt = new Date().toISOString();
  const enqueueMissing = options.enqueueMissing !== false;
  let remainingJobs = Number.isInteger(options.maxJobs)
    ? Math.max(1, Math.min(240, Number(options.maxJobs)))
    : Number.POSITIVE_INFINITY;
  const mopsCandidates = candidates.filter((candidate) => candidate.exchange === 'TWSE');
  const tpexCandidates = candidates.filter((candidate) => candidate.exchange === 'TPEX');
  const client = getOpportunityV3ServerClient();
  const desiredMopsJobs = financialBridgeAcquisitionQuarters(cutoff).flatMap(({ year, quarter }) => mopsCandidates.map((candidate) => ({
    stock_id: candidate.stockId,
    exchange: candidate.exchange,
    endpoint_key: 'mops_inline',
    period_end: `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1]}`,
    cursor_key: `${candidate.symbol}:${year}Q${quarter}`,
    source_url: `${MOPS_INLINE_URL}?step=1&CO_ID=${candidate.symbol}&SYEAR=${year - 1911}&SSEASON=${quarter}&REPORT_ID=C`,
  })));
  if (enqueueMissing && desiredMopsJobs.length) {
    const queued = await client.from('candidate_financial_acquisition_jobs_v4').upsert(desiredMopsJobs, {
      onConflict: 'stock_id,endpoint_key,period_end,cursor_key',
      ignoreDuplicates: true,
    });
    if (queued.error) throw new Error(`candidate_financial_job_enqueue_failed:${queued.error.message}`);
  }
  const latestQuarter = completedQuarters(cutoff, 1)[0];
  const latestQuarterEnd = `${latestQuarter.year}-${['03-31', '06-30', '09-30', '12-31'][latestQuarter.quarter - 1]}`;
  const desiredTpexJobs = Object.entries(TPEX_FINANCIAL_ENDPOINTS).flatMap(([endpoint, sourceUrl]) =>
    tpexCandidates.map((candidate) => ({
      stock_id: candidate.stockId, exchange: candidate.exchange,
      endpoint_key: TPEX_JOB_KEYS[endpoint as keyof typeof TPEX_JOB_KEYS],
      period_end: latestQuarterEnd, cursor_key: `${candidate.symbol}:${latestQuarter.year}Q${latestQuarter.quarter}`,
      source_url: sourceUrl,
    })),
  );
  if (enqueueMissing && desiredTpexJobs.length) {
    const queued = await client.from('candidate_financial_acquisition_jobs_v4').upsert(desiredTpexJobs, {
      onConflict: 'stock_id,endpoint_key,period_end,cursor_key', ignoreDuplicates: true,
    });
    if (queued.error) throw new Error(`candidate_tpex_financial_job_enqueue_failed:${queued.error.message}`);
  }
  const candidateById = new Map(mopsCandidates.map((candidate) => [candidate.stockId, candidate]));
  const claimRead = mopsCandidates.length && remainingJobs > 0
    ? await client.rpc('claim_candidate_financial_acquisition_jobs_v4', {
      p_stock_ids: mopsCandidates.map((candidate) => candidate.stockId),
      p_endpoint_key: 'mops_inline',
      p_limit: Math.min(60, remainingJobs),
      p_owner: runnerPrincipal,
      p_claimed_at: collectedAt,
      p_lease_expires_at: new Date(Date.now() + FINANCIAL_JOB_LEASE_MS).toISOString(),
    })
    : { data: [], error: null };
  if (claimRead.error) throw new Error(`candidate_financial_job_claim_read_failed:${claimRead.error.message}`);
  const claimedMops = (claimRead.data || []) as Array<Record<string, unknown>>;
  const mopsFailureCounts = await consecutiveFailureCounts(client, claimedMops);
  const claimedRows = claimedMops.flatMap((job) => {
    const candidate = candidateById.get(String(job.stock_id || ''));
    const match = String(job.cursor_key || '').match(/:(\d{4})Q([1-4])$/u);
    if (!candidate || !match) return [];
    return [{ jobId: String(job.job_id), attempts: Number(job.attempts || 0), consecutiveFailures: mopsFailureCounts.get(String(job.job_id)) || 0, candidate, year: Number(match[1]), quarter: Number(match[2]) }];
  });
  let claimedJobCount = claimedRows.length;
  remainingJobs = Number.isFinite(remainingJobs) ? Math.max(0, remainingJobs - claimedRows.length) : remainingJobs;
  const outcomes = await mapLimit(claimedRows, 2, async ({ jobId, attempts, consecutiveFailures, candidate, year, quarter }) => {
    try {
      const fetched = await fetchFiling(candidate, year, quarter, collectedAt);
      return { jobId, attempts, consecutiveFailures, candidate, ...fetched, error: null, primaryError: null };
    } catch (primaryError) {
      const periodEnd = `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter - 1]}`;
      try {
        const fallback = await fetchFinMindFinancialFallback({ candidate, periodEnd, collectedAt });
        return { jobId, attempts, consecutiveFailures, candidate, ...fallback, fallbackUsed: true as const, error: null, primaryError: finMindFinancialErrorDetail(primaryError) };
      } catch (fallbackError) {
        const primary = finMindFinancialErrorDetail(primaryError);
        const fallback = finMindFinancialErrorDetail(fallbackError);
        return {
          jobId, attempts, consecutiveFailures, candidate, facts: [] as ParsedFact[], sourceUrl: '', sourceSha256: '', responseBytes: 0,
          fallbackUsed: false as const, credentialMode: null,
          error: `${candidate.symbol}:${year}Q${quarter}:${primary};${fallback}`,
          primaryError: primary,
        };
      }
    }
  });
  let writtenFacts = 0;
  const persistedMopsFacts: ParsedFact[] = [];
  const mopsFailures: string[] = [];
  await mapLimit(outcomes, 4, async (outcome) => {
    if (outcome.error) {
      await failAcquisitionJob({ client, jobId: outcome.jobId, owner: runnerPrincipal, attempts: outcome.attempts, consecutiveFailures: outcome.consecutiveFailures, error: outcome.error, collectedAt });
      mopsFailures.push(outcome.error);
      return;
    }
    try {
      writtenFacts += outcome.fallbackUsed
        ? await recordFallbackAcquisitionJob({
          client, runnerPrincipal, owner: runnerPrincipal, jobId: outcome.jobId, attempts: outcome.attempts,
          facts: outcome.facts, sourceSha256: outcome.sourceSha256, responseBytes: outcome.responseBytes,
          collectedAt, primaryError: outcome.primaryError || 'mops_unavailable',
        })
        : await completeAcquisitionJob({ client, runnerPrincipal, owner: runnerPrincipal, jobId: outcome.jobId, facts: outcome.facts, sourceSha256: outcome.sourceSha256, responseBytes: outcome.responseBytes, collectedAt });
      persistedMopsFacts.push(...outcome.facts);
    } catch (error) {
      const message = `${outcome.candidate.symbol}:write_failed:${error instanceof Error ? error.message : String(error)}`;
      await failAcquisitionJob({ client, jobId: outcome.jobId, owner: runnerPrincipal, attempts: outcome.attempts, consecutiveFailures: outcome.consecutiveFailures, error: message, collectedAt });
      mopsFailures.push(message);
    }
  });
  const issuerFallbackRows = [...new Map(outcomes.filter((outcome) => outcome.error).flatMap((outcome) => {
    const fallback = VERIFIED_ISSUER_IR_FALLBACKS[outcome.candidate.symbol];
    if (!fallback) return [];
    const item = {
      issuerId: outcome.candidate.symbol,
      sourceUrl: fallback.listingUrl,
      documentUrl: fallback.documentUrl,
      title: fallback.title,
      publishedAt: null,
      mimeType: 'application/pdf',
      documentSha256: null,
      metadata: { exchange: outcome.candidate.exchange, fallback_reason: outcome.error },
    };
    return [[outcome.candidate.stockId, {
      stock_id: outcome.candidate.stockId,
      queue_key: issuerIrDocumentQueueKey(item),
      listing_source_url: fallback.listingUrl,
      document_url: fallback.documentUrl,
      title: fallback.title,
      mime_type: 'application/pdf',
      acquisition_status: 'queued',
      metadata: item.metadata,
    }] as const];
  })).values()];
  if (issuerFallbackRows.length) {
    const queueWrite = await client.from('candidate_issuer_ir_document_queue_v4').upsert(issuerFallbackRows, {
      onConflict: 'stock_id,queue_key',
      ignoreDuplicates: true,
    });
    if (queueWrite.error) throw new Error(`candidate_issuer_ir_queue_write_failed:${queueWrite.error.message}`);
  }
  const tpexById = new Map(tpexCandidates.map((candidate) => [candidate.stockId, candidate]));
  const tpexFacts: ParsedFact[] = [];
  const tpexFailures: string[] = [];
  const attemptedTpexSymbols = new Set<string>();
  let tpexFetchedEndpoints = 0;
  let tpexFinMindFallbackFilings = 0;
  let anonymousTpexFinMindFallbackFilings = 0;
  for (const [endpoint, sourceUrl] of Object.entries(TPEX_FINANCIAL_ENDPOINTS)) {
    if (remainingJobs <= 0) break;
    const endpointKey = TPEX_JOB_KEYS[endpoint as keyof typeof TPEX_JOB_KEYS];
    const claim = tpexCandidates.length ? await client.rpc('claim_candidate_financial_acquisition_jobs_v4', {
      p_stock_ids: tpexCandidates.map((candidate) => candidate.stockId), p_endpoint_key: endpointKey,
      p_limit: Math.min(60, remainingJobs), p_owner: runnerPrincipal, p_claimed_at: collectedAt,
      p_lease_expires_at: new Date(Date.now() + FINANCIAL_JOB_LEASE_MS).toISOString(),
    }) : { data: [], error: null };
    if (claim.error) throw new Error(`candidate_tpex_financial_job_claim_failed:${claim.error.message}`);
    const claimedTpex = (claim.data || []) as Array<Record<string, unknown>>;
    const tpexFailureCounts = await consecutiveFailureCounts(client, claimedTpex);
    const jobs = claimedTpex.flatMap((job) => {
      const candidate = tpexById.get(String(job.stock_id || ''));
      const periodEnd = String(job.period_end || '');
      return candidate && /^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)
        ? [{ jobId: String(job.job_id), attempts: Number(job.attempts || 0), consecutiveFailures: tpexFailureCounts.get(String(job.job_id)) || 0, periodEnd, candidate }]
        : [];
    });
    claimedJobCount += jobs.length;
    remainingJobs = Number.isFinite(remainingJobs) ? Math.max(0, remainingJobs - jobs.length) : remainingJobs;
    for (const job of jobs) attemptedTpexSymbols.add(job.candidate.symbol);
    if (jobs.length === 0) continue;
    try {
      const response = await fetch(sourceUrl, { headers: { Accept: 'application/json', 'user-agent': 'StockInsider/4.0' }, redirect: 'error', signal: AbortSignal.timeout(20_000) });
      const body = await response.text();
      const rejected = classifyFinancialResponse(response.status, response.headers.get('content-type'), body);
      if (rejected) throw new Error(`tpex_${endpoint}_${rejected}`);
      const parsed = parseTpexFinancialEndpoint(endpoint as keyof typeof TPEX_FINANCIAL_ENDPOINTS, JSON.parse(body));
      if (parsed.terminalReason !== 'complete') throw new Error(`tpex_${endpoint}_${parsed.terminalReason}`);
      tpexFetchedEndpoints += 1;
      const sourceSha256 = sha256(body); const responseBytes = Buffer.byteLength(body, 'utf8');
      await mapLimit(jobs, 4, async (job) => {
        const candidateFacts = parsed.facts.filter((fact) => fact.symbol === job.candidate.symbol);
        const facts = candidateFacts.filter((fact) => fact.periodEnd === job.periodEnd).map((fact) => toParsedTpexFact(fact, job.candidate, collectedAt));
        if (facts.length === 0) {
          const returnedPeriods = [...new Set(candidateFacts.map((fact) => fact.periodEnd))].sort();
          const newestReturnedPeriod = returnedPeriods.at(-1) || null;
          const message = newestReturnedPeriod
            ? `${job.candidate.symbol}:${endpoint}:${newestReturnedPeriod < job.periodEnd ? 'requested_period_not_yet_published' : 'requested_period_superseded'}:${job.periodEnd}:returned=${returnedPeriods.join(',')}`
            : `${job.candidate.symbol}:${endpoint}:empty_official_response`;
          if (newestReturnedPeriod && newestReturnedPeriod < job.periodEnd) {
            await deferUnpublishedAcquisitionJob({ client, jobId: job.jobId, owner: runnerPrincipal, collectedAt, detail: message });
            tpexFailures.push(message);
          } else if (newestReturnedPeriod && newestReturnedPeriod > job.periodEnd) {
            try {
              const fallback = await fetchFinMindFinancialFallback({ candidate: job.candidate, periodEnd: job.periodEnd, collectedAt });
              writtenFacts += await completeAcquisitionJob({
                client, runnerPrincipal, owner: runnerPrincipal, jobId: job.jobId, facts: fallback.facts,
                sourceSha256: fallback.sourceSha256, responseBytes: fallback.responseBytes, collectedAt,
              });
              tpexFacts.push(...fallback.facts);
              tpexFinMindFallbackFilings += 1;
              if (fallback.credentialMode === 'anonymous') anonymousTpexFinMindFallbackFilings += 1;
            } catch (fallbackError) {
              const fallbackMessage = `${message}:finmind_fallback_failed:${finMindFinancialErrorDetail(fallbackError)}`;
              await failAcquisitionJob({ client, jobId: job.jobId, owner: runnerPrincipal, attempts: job.attempts, consecutiveFailures: job.consecutiveFailures, error: fallbackMessage, collectedAt });
              tpexFailures.push(fallbackMessage);
            }
          } else {
            await failAcquisitionJob({ client, jobId: job.jobId, owner: runnerPrincipal, attempts: job.attempts, consecutiveFailures: job.consecutiveFailures, error: message, collectedAt });
            tpexFailures.push(message);
          }
          return;
        }
        try {
          writtenFacts += await completeAcquisitionJob({ client, runnerPrincipal, owner: runnerPrincipal, jobId: job.jobId, facts, sourceSha256, responseBytes, collectedAt });
          tpexFacts.push(...facts);
        } catch (error) {
          const message = `${job.candidate.symbol}:${endpoint}:write_failed:${error instanceof Error ? error.message : String(error)}`;
          await failAcquisitionJob({ client, jobId: job.jobId, owner: runnerPrincipal, attempts: job.attempts, consecutiveFailures: job.consecutiveFailures, error: message, collectedAt });
          tpexFailures.push(message);
        }
      });
    } catch (error) {
      const message = `TPEX:${endpoint}:${error instanceof Error ? error.message : String(error)}`;
      tpexFailures.push(message);
      await mapLimit(jobs, 8, (job) => failAcquisitionJob({ client, jobId: job.jobId, owner: runnerPrincipal, attempts: job.attempts, consecutiveFailures: job.consecutiveFailures, error: `${job.candidate.symbol}:${message}`, collectedAt }));
    }
  }
  const facts = [...persistedMopsFacts, ...tpexFacts];
  const failures = [...mopsFailures, ...tpexFailures];
  return {
    candidateCount: candidates.length,
    claimedJobs: claimedJobCount,
    fetchedFilings: Math.max(0, claimedRows.length - outcomes.filter((row) => row.error).length) + tpexFetchedEndpoints,
    parsedFacts: facts.length,
    writtenFacts,
    symbolsWithFacts: [...new Set(facts.map((fact) => fact.symbol))],
    attemptedSymbols: [...new Set([...claimedRows.map((job) => job.candidate.symbol), ...attemptedTpexSymbols])],
    finMindFallbackFilings: outcomes.filter((outcome) => outcome.fallbackUsed).length + tpexFinMindFallbackFilings,
    anonymousFinMindFallbackFilings: outcomes.filter((outcome) => outcome.fallbackUsed && outcome.credentialMode === 'anonymous').length + anonymousTpexFinMindFallbackFilings,
    mopsSecurityBlocks: outcomes.filter((outcome) => /security_blocked/iu.test(outcome.primaryError || '')).length,
    failures,
  };
}
