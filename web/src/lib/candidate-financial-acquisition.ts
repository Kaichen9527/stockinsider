import { createHash } from 'crypto';

export const TPEX_FINANCIAL_ENDPOINTS = {
  generalIncome: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_ci',
  brokerIncome: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap06_O_bd',
  generalBalance: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_ci',
  brokerBalance: 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap07_O_bd',
} as const;

export type FinancialAcquisitionTerminalReason =
  | 'complete' | 'empty_official_response' | 'http_not_found' | 'http_rate_limited'
  | 'http_server_error' | 'network_error' | 'timeout' | 'html_rejected'
  | 'security_blocked' | 'schema_unrecognized' | 'unsupported_issuer'
  | 'invalid_cursor' | 'write_failed';

export type TpexFinancialFact = {
  symbol: string;
  factKey: string;
  periodStart: string | null;
  periodEnd: string;
  durationKind: 'quarterly' | 'instant';
  value: number;
  unit: 'TWD_thousand' | 'TWD_per_share';
  sourceRef: string;
  sourceTimestamp: string;
  filingRestatementId: string;
};

type EndpointKind = keyof typeof TPEX_FINANCIAL_ENDPOINTS;
type Row = Record<string, unknown>;
type HeaderMapping = readonly [headers: readonly string[], factKey: string];

// TPEx publishes cumulative (year-to-date) statement columns.  These are
// header aliases, not positional fallbacks: the first populated documented
// header wins, so alternate presentation labels cannot create two competing
// facts for one immutable identity.
const INCOME_HEADERS: Record<'generalIncome' | 'brokerIncome', readonly HeaderMapping[]> = {
  generalIncome: [
    [['營業收入'], 'quarterly_revenue'], [['營業毛利（毛損）淨額', '營業毛利（毛損）'], 'quarterly_gross_profit'],
    [['營業費用'], 'quarterly_operating_expense'], [['營業利益（損失）'], 'quarterly_operating_income'],
    [['營業外收入及支出'], 'quarterly_non_operating_income'], [['稅前淨利（淨損）'], 'quarterly_pretax_income'],
    [['所得稅費用（利益）'], 'quarterly_income_tax_expense'], [['本期淨利（淨損）'], 'quarterly_net_income'],
    [['淨利（淨損）歸屬於母公司業主', '淨利（損）歸屬於母公司業主'], 'quarterly_net_income_attributable_to_common'],
    [['基本每股盈餘（元）', '基本每股盈餘'], 'quarterly_basic_eps'], [['稀釋每股盈餘（元）', '稀釋每股盈餘'], 'quarterly_diluted_eps'],
  ],
  brokerIncome: [
    // Securities/futures issuers publish 收益 rather than a manufacturing sales
    // field. Keep the endpoint identity in provenance; do not reuse the general
    // industry mapping by positional column.
    [['收益'], 'quarterly_revenue'], [['支出及費用'], 'quarterly_operating_expense'], [['營業利益'], 'quarterly_operating_income'],
    [['營業外損益'], 'quarterly_non_operating_income'], [['稅前淨利（淨損）'], 'quarterly_pretax_income'],
    [['所得稅費用（利益）'], 'quarterly_income_tax_expense'], [['本期淨利（淨損）'], 'quarterly_net_income'],
    [['淨利（淨損）歸屬於母公司業主', '淨利（損）歸屬於母公司業主'], 'quarterly_net_income_attributable_to_common'],
    [['基本每股盈餘（元）', '基本每股盈餘'], 'quarterly_basic_eps'], [['稀釋每股盈餘（元）', '稀釋每股盈餘'], 'quarterly_diluted_eps'],
  ],
};

const BALANCE_HEADERS: readonly HeaderMapping[] = [
  [['資產總計'], 'total_assets'],
  // "負債總計" is total liabilities, not the interest-bearing debt required
  // by EV.  Publishing it as total_debt would manufacture enterprise value.
  [['歸屬於母公司業主之權益合計', '歸屬於母公司業主權益合計', '歸屬於母公司業主之權益', '歸屬於母公司業主權益'], 'total_equity'],
  [['權益總計'], 'total_equity'],
  [['每股參考淨值'], 'book_value_per_share'],
];

function finite(value: unknown) {
  const normalized = String(value ?? '').replace(/,/gu, '').trim();
  if (!normalized || !/^-?\d+(?:\.\d+)?$/u.test(normalized)) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function rocDate(value: unknown) {
  const match = String(value ?? '').match(/^(\d{3})(\d{2})(\d{2})$/u);
  if (!match) return null;
  const date = `${Number(match[1]) + 1911}-${match[2]}-${match[3]}`;
  return Number.isNaN(Date.parse(`${date}T00:00:00Z`)) ? null : date;
}

function periodFor(row: Row) {
  const year = Number(row.Year ?? row['年度']);
  const quarter = Number(row.Season ?? row['季別']);
  if (!Number.isInteger(year) || !Number.isInteger(quarter) || quarter < 1 || quarter > 4) return null;
  const gregorian = year + 1911;
  const ends = ['03-31', '06-30', '09-30', '12-31'];
  // The TPEx statement rows are cumulative from fiscal-year start.  Downstream
  // flow/EPS logic explicitly de-cumulates this YTD context; treating it as a
  // standalone quarter would overstate Q2--Q4 earnings.
  return { periodStart: `${gregorian}-01-01`, periodEnd: `${gregorian}-${ends[quarter - 1]}` };
}

function symbolFor(row: Row) {
  const symbol = String(row.SecuritiesCompanyCode ?? row['公司代號'] ?? '').trim();
  return /^\d{4,6}$/u.test(symbol) ? symbol : null;
}

function firstFiniteHeader(row: Row, headers: readonly string[]) {
  for (const header of headers) {
    const value = finite(row[header]);
    if (value != null) return { header, value };
  }
  return null;
}

export function classifyFinancialResponse(
  status: number,
  contentType: string | null,
  body: string,
  expectedBody: 'json' | 'html' = 'json',
): FinancialAcquisitionTerminalReason | null {
  const normalized = body.slice(0, 8_192).toLowerCase();
  if (/captcha|access denied|forbidden|security (?:check|policy|reason)|for security reasons|安全性考量|waf|cloudflare/u.test(normalized)) return 'security_blocked';
  if (status === 404) return 'http_not_found';
  if (status === 429) return 'http_rate_limited';
  if (status >= 500) return 'http_server_error';
  if (status < 200 || status >= 300) return 'network_error';
  if (expectedBody === 'json'
    && (/text\/html|application\/xhtml\+xml/u.test(contentType || '') || /^\s*<(?:!doctype|html|head|body)/u.test(body))) return 'html_rejected';
  if (!body.trim()) return 'empty_official_response';
  return null;
}

/** Parses a single verified TPEx endpoint shape. Unknown headers are ignored;
 * an endpoint with none of its required identity fields is rejected instead of
 * being interpreted by column order. */
export function parseTpexFinancialEndpoint(
  endpoint: EndpointKind,
  payload: unknown,
): { facts: TpexFinancialFact[]; terminalReason: FinancialAcquisitionTerminalReason } {
  if (!Array.isArray(payload)) return { facts: [], terminalReason: 'schema_unrecognized' };
  const sourceUrl = TPEX_FINANCIAL_ENDPOINTS[endpoint];
  const facts: TpexFinancialFact[] = [];
  let recognizableRows = 0;
  for (const raw of payload) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Row;
    const symbol = symbolFor(row);
    const period = periodFor(row);
    const filed = rocDate(row.Date ?? row['出表日期']);
    if (!symbol || !period || !filed) continue;
    recognizableRows += 1;
    const isBalance = endpoint.endsWith('Balance');
    const mappings = isBalance ? BALANCE_HEADERS : INCOME_HEADERS[endpoint as 'generalIncome' | 'brokerIncome'];
    const sourceTimestamp = `${filed}T00:00:00Z`;
    const restatement = createHash('sha256').update(`${sourceUrl}:${symbol}:${period.periodEnd}:${filed}`).digest('hex');
    for (const [headers, factKey] of mappings) {
      const selected = firstFiniteHeader(row, headers);
      if (!selected) continue;
      facts.push({
        symbol, factKey, periodStart: isBalance ? null : period.periodStart, periodEnd: period.periodEnd,
        durationKind: isBalance ? 'instant' : 'quarterly', value: selected.value,
        unit: factKey === 'book_value_per_share' || factKey.endsWith('_eps') ? 'TWD_per_share' : 'TWD_thousand',
        sourceRef: `tpex-openapi:${endpoint}:${symbol}:${period.periodEnd}:${selected.header}`,
        sourceTimestamp, filingRestatementId: `tpex:${restatement}`,
      });
    }
  }
  if (recognizableRows === 0) return { facts: [], terminalReason: 'schema_unrecognized' };
  return { facts, terminalReason: facts.length > 0 ? 'complete' : 'empty_official_response' };
}

export type IssuerIrDocumentQueueItem = {
  issuerId: string;
  sourceUrl: string;
  documentUrl: string;
  title: string;
  publishedAt: string | null;
  mimeType: string | null;
  documentSha256: string | null;
  metadata: Record<string, unknown>;
};

/** Metadata-only queue payload. Facts may cite this immutable document key only
 * after an extractor records a page/table locator and source hash. */
export function issuerIrDocumentQueueKey(item: IssuerIrDocumentQueueItem) {
  return createHash('sha256').update(JSON.stringify({
    issuerId: item.issuerId, documentUrl: item.documentUrl, publishedAt: item.publishedAt,
    documentSha256: item.documentSha256,
  })).digest('hex');
}
