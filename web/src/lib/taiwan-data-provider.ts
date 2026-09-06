import { createHash } from 'node:crypto';

/**
 * A deliberately small boundary around Taiwan market-data providers.  The
 * caller persists every terminal attempt; this module never labels a mirror as
 * an exchange or filing authority.
 */
export const TAIWAN_DATASETS = ['daily_price', 'daily_valuation', 'monthly_revenue', 'financial_statement', 'institutional_flow', 'margin_short', 'market_index', 'stock_master', 'trading_calendar'] as const;
export type TaiwanDataset = typeof TAIWAN_DATASETS[number];
export type TaiwanExchange = 'TWSE' | 'TPEX';
export type TaiwanRefreshPhase = 'preliminary' | 'final';

export function needsCompletedTradingSession(datasets: readonly TaiwanDataset[]) {
  return datasets.some((dataset) => dataset !== 'stock_master' && dataset !== 'trading_calendar');
}
export type TaiwanProvider = 'twse' | 'tpex' | 'finmind';
export type TaiwanAuthorityTier = 'official_primary' | 'finmind_fallback';
export type TaiwanProviderTerminal =
  | 'complete'
  | 'empty'
  | 'timeout'
  | 'usage_limited'
  | 'auth_failed'
  | 'http_error'
  | 'network_error'
  | 'schema_invalid'
  | 'not_configured';

export type TaiwanProviderAttempt = {
  provider: TaiwanProvider;
  authorityTier: TaiwanAuthorityTier;
  terminal: TaiwanProviderTerminal;
  sourceUrl: string;
  fetchedAt: string;
  httpStatus: number | null;
  responseSha256: string | null;
  responseBytes: number;
  apiUsage: { limit: number | null; remaining: number | null; resetAt: string | null } | null;
  normalizedPayload: Record<string, unknown> | null;
  detail: string | null;
};

export type TaiwanProviderResult = {
  schema: 'taiwan-data-provider-result-v1';
  dataset: TaiwanDataset;
  symbol: string | null;
  exchange: TaiwanExchange;
  phase: TaiwanRefreshPhase;
  terminal: TaiwanProviderTerminal;
  actionEligible: boolean;
  selectedProvider: TaiwanProvider | null;
  selectedAuthorityTier: TaiwanAuthorityTier | null;
  canonical: { schema: 'taiwan-data-canonical-v1'; expectedSessionDate: string; records: Record<string, unknown>[] } | null;
  attempts: TaiwanProviderAttempt[];
};

export type TaiwanProviderInput = {
  dataset: TaiwanDataset;
  symbol?: string | null;
  exchange: TaiwanExchange;
  phase: TaiwanRefreshPhase;
  sessionDate?: string;
};

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export type TaiwanProviderOptions = {
  fetchImpl?: FetchLike;
  officialTimeoutMs?: number;
  finMindTimeoutMs?: number;
  finMindToken?: string;
  now?: () => Date;
};

const OFFICIAL_TIMEOUT_MS = 8_000;
const FINMIND_TIMEOUT_MS = 12_000;
const MAX_RESPONSE_BYTES = 2_000_000;
const FINMIND_DATA_URL = 'https://api.finmindtrade.com/api/v4/data';

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

function validSymbol(symbol: string | null | undefined) {
  return symbol == null || /^\d{4}$/u.test(symbol);
}

function validDate(value: string | undefined) {
  return !value || /^\d{4}-\d{2}-\d{2}$/u.test(value);
}

function compactDate(value: string | undefined) {
  return (value || new Date().toISOString().slice(0, 10)).replace(/-/gu, '');
}

function finMindDataset(dataset: TaiwanDataset) {
  return ({
    daily_price: 'TaiwanStockPrice',
    daily_valuation: 'TaiwanStockPER',
    monthly_revenue: 'TaiwanStockMonthRevenue',
    financial_statement: 'TaiwanStockFinancialStatements',
    institutional_flow: 'TaiwanStockInstitutionalInvestorsBuySell',
    margin_short: 'TaiwanStockMarginPurchaseShortSale',
    market_index: 'TaiwanStockTotalReturnIndex',
    stock_master: 'TaiwanStockInfo',
    trading_calendar: 'TaiwanStockTradingDate',
  } as const)[dataset];
}

/** Official URLs are allowlisted here instead of being caller supplied. */
export function officialTaiwanDataUrl(input: TaiwanProviderInput): string | null {
  const symbol = input.symbol || '';
  const date = compactDate(input.sessionDate);
  if (!validSymbol(input.symbol) || !validDate(input.sessionDate)) return null;
  if (input.exchange === 'TWSE') {
    if (input.dataset === 'stock_master') return 'https://openapi.twse.com.tw/v1/opendata/t187ap03_L';
    if (input.dataset === 'trading_calendar') return `https://www.twse.com.tw/holidaySchedule/holidaySchedule?response=json&queryYear=${date.slice(0, 4)}`;
    if (input.dataset === 'daily_price' && symbol) return `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&date=${date.slice(0, 6)}01&stockNo=${symbol}`;
    if (input.dataset === 'daily_valuation') return `https://www.twse.com.tw/exchangeReport/BWIBBU?response=json&date=${date}&selectType=ALL`;
    if (input.dataset === 'monthly_revenue') return 'https://openapi.twse.com.tw/v1/opendata/t187ap05_L';
    if (input.dataset === 'financial_statement' && symbol) return `https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=${symbol}`;
    if (input.dataset === 'institutional_flow') return `https://www.twse.com.tw/fund/T86?response=json&date=${date}&selectType=ALLBUT0999`;
    if (input.dataset === 'margin_short') return `https://www.twse.com.tw/exchangeReport/MI_MARGN?response=json&date=${date}&selectType=ALL`;
    // MI_INDEX?type=ALL is several megabytes and includes the full board. FMTQIK
    // is the official, bounded monthly TAIEX series needed by this dataset.
    if (input.dataset === 'market_index') return `https://www.twse.com.tw/exchangeReport/FMTQIK?response=json&date=${date}`;
  }
  if (input.exchange === 'TPEX') {
    const slashDate = `${date.slice(0, 4)}/${date.slice(4, 6)}/${date.slice(6, 8)}`;
    if (input.dataset === 'stock_master') return 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O';
    if (input.dataset === 'daily_price' && symbol) return `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${symbol}&date=${encodeURIComponent(`${date.slice(0, 4)}/${date.slice(4, 6)}/01`)}&response=json`;
    if (input.dataset === 'daily_valuation') return `https://www.tpex.org.tw/www/zh-tw/afterTrading/DAILYVAL?date=${encodeURIComponent(slashDate)}&response=json`;
    if (input.dataset === 'monthly_revenue') return 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O';
    if (input.dataset === 'institutional_flow') return `https://www.tpex.org.tw/www/zh-tw/3insti/dailyTrade?date=${encodeURIComponent(slashDate)}&response=json`;
    if (input.dataset === 'margin_short') return `https://www.tpex.org.tw/www/zh-tw/marginTrading/margin_balance?date=${encodeURIComponent(slashDate)}&response=json`;
    if (input.dataset === 'market_index') return `https://www.tpex.org.tw/www/zh-tw/indices/taq?date=${encodeURIComponent(slashDate)}&response=json`;
  }
  return null;
}

export function finMindTaiwanDataUrl(input: TaiwanProviderInput) {
  // Never make the credential destination configurable: a deployment typo or
  // poisoned environment variable must not redirect the FinMind bearer token.
  const url = new URL(FINMIND_DATA_URL);
  url.searchParams.set('dataset', finMindDataset(input.dataset));
  if (input.symbol) url.searchParams.set('data_id', input.symbol);
  if (input.sessionDate) url.searchParams.set('start_date', input.sessionDate);
  return url.toString();
}

function apiUsage(headers: Headers) {
  const number = (name: string) => {
    const value = headers.get(name);
    return value && /^\d+$/u.test(value) ? Number(value) : null;
  };
  const reset = headers.get('x-ratelimit-reset') || headers.get('x-rate-limit-reset');
  const resetAt = reset && /^\d+$/u.test(reset)
    ? new Date(Number(reset) * 1000).toISOString()
    : null;
  const usage = {
    limit: number('x-ratelimit-limit') ?? number('x-rate-limit-limit'),
    remaining: number('x-ratelimit-remaining') ?? number('x-rate-limit-remaining'),
    resetAt,
  };
  return usage.limit != null || usage.remaining != null || usage.resetAt != null ? usage : null;
}

function responseShapeIsUsable(payload: unknown, provider: TaiwanProvider, input: TaiwanProviderInput) {
  if (provider !== 'finmind' && Array.isArray(payload)) return true;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return false;
  const object = payload as Record<string, unknown>;
  if (provider === 'finmind') return Array.isArray(object.data);
  if (input.dataset === 'financial_statement') return false; // MOPS is HTML; a typed official adapter must parse it before promotion.
  if (input.dataset === 'market_index' && input.exchange === 'TWSE') {
    return Array.isArray(object.fields)
      && object.fields.map(String).includes('發行量加權股價指數')
      && Array.isArray(object.data);
  }
  if (Array.isArray(object.data)) return true;
  return Array.isArray((object.tables as Record<string, unknown>[] | undefined)?.[0]?.data);
}

function payloadRows(payload: unknown, provider: TaiwanProvider) {
  if (Array.isArray(payload)) return payload;
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.rows)) return object.rows;
  if (provider === 'finmind' || Array.isArray(object.data)) return object.data as unknown[];
  return ((object.tables as Record<string, unknown>[] | undefined)?.[0]?.data || []) as unknown[];
}

function fieldsFor(payload: unknown) {
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.fields)) return object.fields.map(String);
  const fields = (object.tables as Record<string, unknown>[] | undefined)?.[0]?.fields;
  return Array.isArray(fields) ? fields.map(String) : [];
}

function normalizedSessionDate(value: unknown) {
  const text = String(value || '').trim();
  if (/^\d{4}-\d{2}-\d{2}$/u.test(text)) return text;
  const roc = text.match(/^(\d{3})\/(\d{2})\/(\d{2})$/u);
  return roc ? `${Number(roc[1]) + 1911}-${roc[2]}-${roc[3]}` : null;
}

function canonicalizePayload(payload: unknown, provider: TaiwanProvider, input: TaiwanProviderInput) {
  const rows = payloadRows(payload, provider);
  const fields = fieldsFor(payload);
  const normalizedFields = fields.map((field) => field.replace(/\s+/gu, ''));
  const expected = input.sessionDate || new Date().toISOString().slice(0, 10);
  if (rows.length === 0) return { records: [] as Record<string, unknown>[], detail: null };
  if (provider === 'finmind') {
    if (!rows.every((row) => row && typeof row === 'object' && !Array.isArray(row))) return { records: null, detail: 'finmind_rows_not_objects' };
    const records = (rows as Record<string, unknown>[]).filter((row) => !input.symbol || String(row.stock_id || row.data_id || row.company_id || row['公司代號'] || input.symbol) === input.symbol);
    const dated = input.dataset === 'monthly_revenue' || input.dataset === 'financial_statement'
      ? records
      : records.filter((row) => String(row.date || row.trading_date || '') === expected);
    return dated.length > 0 ? { records: dated, detail: null } : { records: null, detail: 'expected_session_missing' };
  }
  const requiresFields: Partial<Record<TaiwanDataset, string[]>> = {
    daily_price: ['日期'], daily_valuation: ['本益比'], institutional_flow: ['證券代號'], margin_short: ['證券代號'],
    market_index: input.exchange === 'TWSE' ? ['發行量加權股價指數'] : ['日期'],
  };
  const required = requiresFields[input.dataset] || [];
  if (required.some((name) => !normalizedFields.includes(name))) return { records: null, detail: 'official_fields_unrecognized' };
  if (!rows.every(Array.isArray) && !Array.isArray(payload)) return { records: null, detail: 'official_rows_unrecognized' };
  const dateIndex = normalizedFields.indexOf('日期');
  const dateRequired = ['daily_price', 'daily_valuation', 'institutional_flow', 'margin_short', 'market_index'].includes(input.dataset);
  if (dateRequired && dateIndex >= 0 && !rows.some((row) => normalizedSessionDate((row as unknown[])[dateIndex]) === expected)) return { records: null, detail: 'expected_session_missing' };
  if (dateRequired && dateIndex < 0) {
    const sourceDate = String((payload as Record<string, unknown>).date || '').replace(/-/gu, '');
    if (sourceDate !== expected.replace(/-/gu, '')) return { records: null, detail: 'expected_session_missing' };
  }
  const symbolIndex = normalizedFields.findIndex((field) => ['股票代號', '證券代號', '代號'].includes(field));
  let records = rows.map((row) => Array.isArray(row)
    ? { ...Object.fromEntries(fields.map((field, index) => [field, row[index]])), fields, values: row }
    : row as Record<string, unknown>)
    .filter((row) => !input.symbol || symbolIndex < 0 || !Array.isArray(row['values']) || String(row['values'][symbolIndex] || '') === input.symbol);
  // Monthly price endpoints return every session in the requested month. The
  // persistence RPC writes one row for requested_session_date, so retain only
  // that session instead of accidentally relabelling the month's first row.
  if (input.dataset === 'daily_price' && dateIndex >= 0) {
    records = records.filter((row) => Array.isArray(row.values)
      && normalizedSessionDate(row.values[dateIndex]) === expected);
  }
  return records.length ? { records, detail: null } : { records: null, detail: 'candidate_symbol_missing' };
}

async function readBoundedResponseText(response: Response) {
  const contentLength = Number(response.headers.get('content-length'));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
  if (!response.body) {
    const text = await response.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_RESPONSE_BYTES) throw new Error('response_too_large');
    return text;
  }
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_RESPONSE_BYTES) {
      await reader.cancel('response_too_large');
      throw new Error('response_too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function responseIsEmpty(payload: unknown, provider: TaiwanProvider) {
  if (provider !== 'finmind' && Array.isArray(payload)) return payload.length === 0;
  const object = payload as Record<string, unknown>;
  if (Array.isArray(object.rows)) return object.rows.length === 0;
  if (provider === 'finmind') return Array.isArray(object.data) && object.data.length === 0;
  if (Array.isArray(object.data)) return object.data.length === 0;
  const tables = object.tables as Record<string, unknown>[] | undefined;
  return Array.isArray(tables?.[0]?.data) && tables![0].data.length === 0;
}

function normalizedPayload(payload: unknown): Record<string, unknown> {
  // The durable database contract always stores an object. Some official
  // OpenAPI catalogue endpoints legitimately return a top-level array.
  return Array.isArray(payload) ? { rows: payload } : payload as Record<string, unknown>;
}

function terminalAttempt(input: Omit<TaiwanProviderAttempt, 'fetchedAt'>, now: () => Date): TaiwanProviderAttempt {
  return { ...input, fetchedAt: now().toISOString() };
}

async function acquireOne(
  provider: TaiwanProvider,
  authorityTier: TaiwanAuthorityTier,
  sourceUrl: string,
  timeoutMs: number,
  fetchImpl: FetchLike,
  now: () => Date,
  headers?: HeadersInit,
  input?: TaiwanProviderInput,
): Promise<TaiwanProviderAttempt> {
  try {
    const response = await fetchImpl(sourceUrl, {
      headers: { accept: 'application/json', 'user-agent': 'StockInsider/taiwan-data-provider-v1', ...headers },
      signal: AbortSignal.timeout(timeoutMs),
    });
    const text = await readBoundedResponseText(response);
    const bytes = Buffer.byteLength(text, 'utf8');
    const base = { provider, authorityTier, sourceUrl, httpStatus: response.status, responseSha256: sha256(text), responseBytes: bytes, apiUsage: apiUsage(response.headers) };
    if (response.status === 429) return terminalAttempt({ ...base, terminal: 'usage_limited', normalizedPayload: null, detail: 'http_429' }, now);
    if (response.status === 401 || response.status === 403) return terminalAttempt({ ...base, terminal: 'auth_failed', normalizedPayload: null, detail: `http_${response.status}` }, now);
    if (!response.ok) return terminalAttempt({ ...base, terminal: 'http_error', normalizedPayload: null, detail: `http_${response.status}` }, now);
    let payload: unknown;
    try { payload = JSON.parse(text); } catch { return terminalAttempt({ ...base, terminal: 'schema_invalid', normalizedPayload: null, detail: 'invalid_json' }, now); }
    if (provider === 'finmind' && payload && typeof payload === 'object' && !Array.isArray(payload)) {
      const message = String((payload as Record<string, unknown>).msg || (payload as Record<string, unknown>).message || '');
      const status = Number((payload as Record<string, unknown>).status);
      if (status === 429 || /rate.?limit|quota|usage.?limit/iu.test(message)) return terminalAttempt({ ...base, terminal: 'usage_limited', normalizedPayload: null, detail: 'provider_usage_limit' }, now);
      if (status === 401 || status === 403 || /token|authori[sz]/iu.test(message)) return terminalAttempt({ ...base, terminal: 'auth_failed', normalizedPayload: null, detail: 'provider_authentication_failed' }, now);
    }
    if (!input || !responseShapeIsUsable(payload, provider, input)) return terminalAttempt({ ...base, terminal: 'schema_invalid', normalizedPayload: null, detail: 'unexpected_response_schema' }, now);
    if (responseIsEmpty(payload, provider)) return terminalAttempt({ ...base, terminal: 'empty', normalizedPayload: normalizedPayload(payload), detail: null }, now);
    return terminalAttempt({ ...base, terminal: 'complete', normalizedPayload: normalizedPayload(payload), detail: null }, now);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message === 'response_too_large') {
      return terminalAttempt({ provider, authorityTier, terminal: 'schema_invalid', sourceUrl, httpStatus: null, responseSha256: null, responseBytes: MAX_RESPONSE_BYTES + 1, apiUsage: null, normalizedPayload: null, detail: 'response_too_large' }, now);
    }
    const timeout = /abort|timeout/iu.test(message);
    return terminalAttempt({ provider, authorityTier, terminal: timeout ? 'timeout' : 'network_error', sourceUrl, httpStatus: null, responseSha256: null, responseBytes: 0, apiUsage: null, normalizedPayload: null, detail: timeout ? 'request_timeout' : 'network_failure' }, now);
  }
}

/**
 * Official exchange endpoints always run first. FinMind is a mirror fallback
 * only after an unavailable/invalid official response; an official empty
 * response is meaningful and must stay empty rather than being overwritten.
 */
export async function acquireTaiwanDataset(input: TaiwanProviderInput, options: TaiwanProviderOptions = {}): Promise<TaiwanProviderResult> {
  const now = options.now || (() => new Date());
  if (!TAIWAN_DATASETS.includes(input.dataset) || !['TWSE', 'TPEX'].includes(input.exchange) || !['preliminary', 'final'].includes(input.phase) || !validSymbol(input.symbol) || !validDate(input.sessionDate)) {
    throw new Error('invalid_taiwan_provider_input');
  }
  const fetchImpl = options.fetchImpl || fetch;
  const officialUrl = officialTaiwanDataUrl(input);
  const officialProvider: TaiwanProvider = input.exchange === 'TWSE' ? 'twse' : 'tpex';
  const attempts: TaiwanProviderAttempt[] = [];
  if (!officialUrl) {
    attempts.push(terminalAttempt({ provider: officialProvider, authorityTier: 'official_primary', terminal: 'schema_invalid', sourceUrl: '', httpStatus: null, responseSha256: null, responseBytes: 0, apiUsage: null, normalizedPayload: null, detail: 'unsupported_official_dataset_identity' }, now));
  } else {
    attempts.push(await acquireOne(officialProvider, 'official_primary', officialUrl, options.officialTimeoutMs || OFFICIAL_TIMEOUT_MS, fetchImpl, now, undefined, input));
  }
  const official = attempts[0];
  if (official.terminal === 'complete' || official.terminal === 'empty') {
    const canonicalized = official.normalizedPayload ? canonicalizePayload(official.normalizedPayload, officialProvider, input) : { records: [], detail: null };
    if (canonicalized.records === null) {
      official.terminal = 'schema_invalid'; official.normalizedPayload = null; official.detail = canonicalized.detail;
    } else {
      return { schema: 'taiwan-data-provider-result-v1', dataset: input.dataset, symbol: input.symbol || null, exchange: input.exchange, phase: input.phase, terminal: official.terminal, actionEligible: false, selectedProvider: officialProvider, selectedAuthorityTier: 'official_primary', canonical: official.terminal === 'complete' ? { schema: 'taiwan-data-canonical-v1', expectedSessionDate: input.sessionDate || new Date().toISOString().slice(0, 10), records: canonicalized.records } : null, attempts };
    }
  }
  const token = options.finMindToken ?? process.env.FINMIND_API_TOKEN ?? '';
  const fallbackUrl = finMindTaiwanDataUrl(input);
  if (!token) {
    attempts.push(terminalAttempt({ provider: 'finmind', authorityTier: 'finmind_fallback', terminal: 'not_configured', sourceUrl: fallbackUrl, httpStatus: null, responseSha256: null, responseBytes: 0, apiUsage: null, normalizedPayload: null, detail: 'finmind_api_token_missing' }, now));
  } else {
    attempts.push(await acquireOne('finmind', 'finmind_fallback', fallbackUrl, options.finMindTimeoutMs || FINMIND_TIMEOUT_MS, fetchImpl, now, { authorization: `Bearer ${token}` }, input));
  }
  const fallback = attempts.at(-1)!;
  const canonicalized = fallback.normalizedPayload ? canonicalizePayload(fallback.normalizedPayload, 'finmind', input) : { records: [], detail: null };
  if ((fallback.terminal === 'complete' || fallback.terminal === 'empty') && canonicalized.records === null) {
    fallback.terminal = 'schema_invalid'; fallback.normalizedPayload = null; fallback.detail = canonicalized.detail;
  }
  const selected = fallback.terminal === 'complete' || fallback.terminal === 'empty';
  return { schema: 'taiwan-data-provider-result-v1', dataset: input.dataset, symbol: input.symbol || null, exchange: input.exchange, phase: input.phase, terminal: fallback.terminal, actionEligible: false, selectedProvider: selected ? 'finmind' : null, selectedAuthorityTier: selected ? 'finmind_fallback' : null, canonical: fallback.terminal === 'complete' && canonicalized.records ? { schema: 'taiwan-data-canonical-v1', expectedSessionDate: input.sessionDate || new Date().toISOString().slice(0, 10), records: canonicalized.records } : null, attempts };
}

export function taiwanProviderResultHash(result: TaiwanProviderResult) {
  return sha256(JSON.stringify(result));
}
