import { createHash } from 'node:crypto';

const FINMIND_DATA_URL = 'https://api.finmindtrade.com/api/v4/data';
const MAX_RESPONSE_BYTES = 4_000_000;

const DATASETS = ['TaiwanStockFinancialStatements', 'TaiwanStockBalanceSheet'] as const;
type FinMindFinancialDataset = typeof DATASETS[number];

export type FinMindCandidate = {
  stockId: string;
  symbol: string;
};

export type FinMindFinancialFact = {
  stockId: string;
  symbol: string;
  factKey: string;
  periodStart: string | null;
  periodEnd: string;
  durationKind: 'quarterly' | 'instant';
  value: number;
  unit: 'TWD' | 'TWD_per_share';
  provider: 'finmind';
  authorityTier: 'finmind_mirror';
  estimateKind: 'reported';
  estimateHorizon: 'reported_period';
  filingPublishedAt: string;
  sourceTimestamp: string;
  collectedAt: string;
  filingRestatementId: string;
  sourceRef: string;
};

type Row = {
  date?: unknown;
  stock_id?: unknown;
  type?: unknown;
  value?: unknown;
  origin_name?: unknown;
};

const INCOME_FACTS: Record<string, { factKey: string; unit: FinMindFinancialFact['unit']; priority: number }> = {
  Revenue: { factKey: 'quarterly_revenue', unit: 'TWD', priority: 1 },
  GrossProfit: { factKey: 'quarterly_gross_profit', unit: 'TWD', priority: 1 },
  OperatingExpenses: { factKey: 'quarterly_operating_expense', unit: 'TWD', priority: 1 },
  OperatingIncome: { factKey: 'quarterly_operating_income', unit: 'TWD', priority: 1 },
  TotalNonoperatingIncomeAndExpense: { factKey: 'quarterly_non_operating_income', unit: 'TWD', priority: 1 },
  PreTaxIncome: { factKey: 'quarterly_pretax_income', unit: 'TWD', priority: 1 },
  TAX: { factKey: 'quarterly_income_tax_expense', unit: 'TWD', priority: 1 },
  IncomeAfterTaxes: { factKey: 'quarterly_net_income', unit: 'TWD', priority: 1 },
  EquityAttributableToOwnersOfParent: { factKey: 'quarterly_net_income_attributable_to_common', unit: 'TWD', priority: 1 },
  NoncontrollingInterests: { factKey: 'quarterly_noncontrolling_interest', unit: 'TWD', priority: 1 },
  // FinMind documents this field as basic, single-quarter EPS. It must never
  // be relabelled diluted or summed across a stock split without a common
  // denominator.
  EPS: { factKey: 'quarterly_basic_eps', unit: 'TWD_per_share', priority: 1 },
};

const BALANCE_FACTS: Record<string, { factKey: string; unit: FinMindFinancialFact['unit']; priority: number }> = {
  TotalAssets: { factKey: 'total_assets', unit: 'TWD', priority: 1 },
  EquityAttributableToOwnersOfParent: { factKey: 'total_equity', unit: 'TWD', priority: 1 },
  Equity: { factKey: 'total_equity', unit: 'TWD', priority: 2 },
  CashAndCashEquivalents: { factKey: 'cash_and_equivalents', unit: 'TWD', priority: 1 },
};

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function quarterStart(periodEnd: string) {
  const match = periodEnd.match(/^(\d{4})-(03-31|06-30|09-30|12-31)$/u);
  if (!match) return null;
  const start = ({ '03-31': '01-01', '06-30': '04-01', '09-30': '07-01', '12-31': '10-01' } as const)[match[2] as '03-31' | '06-30' | '09-30' | '12-31'];
  return `${match[1]}-${start}`;
}

function finite(value: unknown) {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  const normalized = String(value).replace(/,/gu, '').trim();
  if (!/^-?\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseFinMindFinancialFacts(input: {
  dataset: FinMindFinancialDataset;
  rows: unknown;
  candidate: FinMindCandidate;
  periodEnd: string;
  collectedAt: string;
}): FinMindFinancialFact[] {
  if (!Array.isArray(input.rows) || !/^\d{4}-(?:03-31|06-30|09-30|12-31)$/u.test(input.periodEnd)
    || !Number.isFinite(Date.parse(input.collectedAt))) return [];
  const periodStart = quarterStart(input.periodEnd);
  if (input.dataset === 'TaiwanStockFinancialStatements' && !periodStart) return [];
  const mapping = input.dataset === 'TaiwanStockFinancialStatements' ? INCOME_FACTS : BALANCE_FACTS;
  const selected = new Map<string, { row: Row; value: number; type: string; priority: number; factKey: string; unit: FinMindFinancialFact['unit'] }>();
  for (const raw of input.rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Row;
    const type = String(row.type || '');
    const rule = mapping[type];
    const value = finite(row.value);
    if (!rule || value == null || String(row.stock_id || '') !== input.candidate.symbol || String(row.date || '') !== input.periodEnd) continue;
    if (type.endsWith('_per')) continue;
    const current = selected.get(rule.factKey);
    if (!current || rule.priority < current.priority) selected.set(rule.factKey, { row, value, type, ...rule });
  }
  return [...selected.values()].map(({ row, value, type, factKey, unit }) => {
    const rowHash = sha256(JSON.stringify([input.dataset, input.candidate.symbol, input.periodEnd, type, value, String(row.origin_name || '')]));
    return {
      stockId: input.candidate.stockId,
      symbol: input.candidate.symbol,
      factKey,
      periodStart: input.dataset === 'TaiwanStockFinancialStatements' ? periodStart : null,
      periodEnd: input.periodEnd,
      durationKind: input.dataset === 'TaiwanStockFinancialStatements' ? 'quarterly' : 'instant',
      value,
      unit,
      provider: 'finmind',
      authorityTier: 'finmind_mirror',
      estimateKind: 'reported',
      estimateHorizon: 'reported_period',
      // FinMind rows do not expose the original filing publication timestamp.
      // Collection is therefore the first defensible availability instant and
      // prevents this mirror from backfilling knowledge into earlier PIT runs.
      filingPublishedAt: input.collectedAt,
      sourceTimestamp: input.collectedAt,
      collectedAt: input.collectedAt,
      filingRestatementId: `finmind:${input.periodEnd}:${rowHash}`,
      sourceRef: `finmind:${input.dataset}:${input.candidate.symbol}:${input.periodEnd}:${type}`,
    };
  });
}

function finMindUrl(dataset: FinMindFinancialDataset, symbol: string, periodEnd: string) {
  const url = new URL(FINMIND_DATA_URL);
  url.searchParams.set('dataset', dataset);
  url.searchParams.set('data_id', symbol);
  url.searchParams.set('start_date', periodEnd);
  url.searchParams.set('end_date', periodEnd);
  return url.toString();
}

async function boundedText(response: Response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('finmind_response_too_large');
  const text = await response.text();
  if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('finmind_response_too_large');
  return text;
}

function errorDetail(error: unknown) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause instanceof Error ? error.cause.message : error.cause ? String(error.cause) : '';
  return cause ? `${error.message}:${cause}` : error.message;
}

export async function fetchFinMindFinancialFallback(input: {
  candidate: FinMindCandidate;
  periodEnd: string;
  collectedAt: string;
  fetchImpl?: typeof fetch;
  token?: string;
}) {
  const fetchImpl = input.fetchImpl || fetch;
  const token = String(input.token ?? process.env.FINMIND_API_TOKEN ?? '').trim();
  const headers: HeadersInit = { Accept: 'application/json', 'user-agent': 'StockInsider/5.0' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const responses: Array<{ dataset: FinMindFinancialDataset; body: string; rows: unknown[] }> = [];
  for (const dataset of DATASETS) {
    const response = await fetchImpl(finMindUrl(dataset, input.candidate.symbol, input.periodEnd), {
      headers,
      redirect: 'error',
      signal: AbortSignal.timeout(20_000),
    });
    const body = await boundedText(response);
    if (response.status === 401 || response.status === 403) throw new Error(`finmind_auth_failed_http_${response.status}`);
    if (response.status === 429) throw new Error('finmind_http_rate_limited');
    if (!response.ok) throw new Error(`finmind_http_${response.status}`);
    let payload: unknown;
    try { payload = JSON.parse(body); } catch { throw new Error('finmind_schema_invalid_json'); }
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('finmind_schema_invalid_root');
    const object = payload as Record<string, unknown>;
    if (Number(object.status) !== 200 || !Array.isArray(object.data)) throw new Error(`finmind_schema_invalid_status_${String(object.status || 'missing')}`);
    responses.push({ dataset, body, rows: object.data });
  }
  const facts = responses.flatMap((response) => parseFinMindFinancialFacts({
    dataset: response.dataset,
    rows: response.rows,
    candidate: input.candidate,
    periodEnd: input.periodEnd,
    collectedAt: input.collectedAt,
  }));
  const coveredDatasets = new Set(facts.map((fact) => fact.sourceRef.split(':')[1]));
  if (facts.length === 0) throw new Error('finmind_empty_period_response');
  if (DATASETS.some((dataset) => !coveredDatasets.has(dataset))) throw new Error('finmind_incomplete_period_response');
  const combined = responses.map((response) => `${response.dataset}\n${response.body}`).join('\n');
  return {
    facts,
    sourceUrl: FINMIND_DATA_URL,
    sourceSha256: sha256(combined),
    responseBytes: Buffer.byteLength(combined, 'utf8'),
    credentialMode: token ? 'token' as const : 'anonymous' as const,
  };
}

export function finMindFinancialErrorDetail(error: unknown) {
  return errorDetail(error);
}
