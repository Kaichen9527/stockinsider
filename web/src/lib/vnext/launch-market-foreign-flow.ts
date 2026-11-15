import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

export const TPEX_MARKET_FLOW_SCHEMA = 'launch-tpex-11743-market-flow-replay-v1';
export const TPEX_MARKET_FLOW_MAX_BYTES = 8_192;
const headers = ['資料日期', '單位名稱', '買進金額', '賣出金額', '買賣超'];
const categories = [
  '外資及陸資合計', '外資及陸資(不含自營商)', '外資自營商', '投信',
  '自營商合計', '自營商(自行買賣)', '自營商(避險)', '三大法人合計*',
];
const attribution = Object.freeze({
  datasetId: 11743,
  datasetUrl: 'https://data.gov.tw/dataset/11743',
  owner: 'Securities and Futures Bureau, Financial Supervisory Commission / Taipei Exchange',
  license: 'Taiwan Open Government Data License 1.0',
  licenseUrl: 'https://data.gov.tw/license',
});

function refuse(): never {
  throw new Error('launch_tpex_market_flow_replay_refused');
}

function sessionDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false;
  const stamp = Date.parse(value + 'T00:00:00Z');
  return Number.isFinite(stamp) && new Date(stamp).toISOString().slice(0, 10) === value;
}

export function tpexMarketFlowCsvUrl(day: string) {
  if (!sessionDate(day) || Number(day.slice(0, 4)) < 1912) refuse();
  const roc = (Number(day.slice(0, 4)) - 1911) + day.slice(4).replaceAll('-', '/');
  return 'https://www.tpex.org.tw/web/stock/3insti/3insti_SUMMARY/3itrdsum_result.php?l=zh-tw&o=data&t=D&d=' + encodeURIComponent(roc);
}

function money(value: string, signed: boolean) {
  if (!/^-?(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(value)) refuse();
  const amount = Number(value.replaceAll(',', ''));
  if (!Number.isSafeInteger(amount) || (!signed && amount < 0)) refuse();
  return amount === 0 ? 0 : amount;
}

type Amounts = { buy: number; sell: number; net: number };

function validateSubtotal(total: Amounts, parts: Amounts[]) {
  for (const field of ['buy', 'sell', 'net'] as const) {
    const sum = parts.reduce((acc, part) => acc + BigInt(part[field]), 0n);
    if (sum !== BigInt(total[field])) refuse();
  }
}

export function parseTpexMarketFlowCsv(day: string, bytes: Uint8Array) {
  const sourceUrl = tpexMarketFlowCsvUrl(day);
  if (bytes.byteLength <= headers.length || bytes.byteLength > TPEX_MARKET_FLOW_MAX_BYTES) refuse();
  const [header, ...rows] = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true }).decode(bytes), 9);
  if (header?.length !== headers.length || headers.some((field, i) => header[i] !== field)
    || rows.length !== categories.length) refuse();

  const amounts = new Map<string, Amounts>();
  const rocDate = (Number(day.slice(0, 4)) - 1911) + day.slice(5).replace('-', '');
  for (const row of rows) {
    if (row.length !== headers.length || row[0] !== rocDate) refuse();
    const category = row[1].trim();
    if (!categories.includes(category) || amounts.has(category)) refuse();
    const buy = money(row[2], false), sell = money(row[3], false), net = money(row[4], true);
    if (buy - sell !== net) refuse();
    amounts.set(category, { buy, sell, net });
  }
  const [foreignTotal, foreign, foreignDealer, trust, dealer, dealerSelf, dealerHedge, institutionTotal]
    = categories.map(category => amounts.get(category)!);
  validateSubtotal(foreignTotal, [foreign, foreignDealer]);
  validateSubtotal(dealer, [dealerSelf, dealerHedge]);
  validateSubtotal(institutionTotal, [foreign, trust, dealer]);
  return {
    session: day,
    sourceUrl,
    rawSha256: createHash('sha256').update(bytes).digest('hex'),
    rawBytes: bytes.byteLength,
    foreignExcludingDealersNetTwd: foreign.net,
    foreignIncludingDealersNetTwd: foreignTotal.net,
  };
}

function record(value: unknown, keys: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) refuse();
  const row = value as Record<string, unknown>;
  if (Object.keys(row).sort().join(' ') !== keys) refuse();
  return row;
}

/** Offline replay of the named five dates. A later retrieval cannot prove the
 * original publish cutoff, and the caller's dates are not an official calendar. */
export function parseTpexMarketFlowReplay(input: unknown, files: ReadonlyMap<string, Uint8Array>) {
  const manifest = record(input, 'cutoff responses schema sessions');
  const manifestCutoff = evidenceInstant(manifest.cutoff);
  if (manifest.schema !== TPEX_MARKET_FLOW_SCHEMA || manifestCutoff === null
    || !Array.isArray(manifest.sessions) || manifest.sessions.length !== 5
    || !Array.isArray(manifest.responses) || manifest.responses.length !== 5) refuse();

  const sessions: string[] = [];
  for (const session of manifest.sessions) {
    const previous = sessions.at(-1);
    if (!sessionDate(session) || (previous && session <= previous)) refuse();
    sessions.push(session);
  }
  const receipts = manifest.responses.map((item: unknown, index: number) => {
    const page = record(item, 'body bytes capturedAt httpStatus mediaType rawSha256 session sourceUrl');
    const day = sessions[index];
    const captured = evidenceInstant(page.capturedAt);
    const earliestSameDay = evidenceInstant(day + 'T00:00:00+08:00')!;
    const body = record(page.body, 'encoding path');
    if (page.session !== day || page.sourceUrl !== tpexMarketFlowCsvUrl(day) || page.httpStatus !== 200
      || typeof page.mediaType !== 'string' || !/^application\/csv\s*;\s*charset=utf-8$/iu.test(page.mediaType)
      || captured === null || captured < earliestSameDay || captured > manifestCutoff
      || body.encoding !== 'file' || typeof body.path !== 'string' || body.path !== 'bodies/' + day + '.csv') refuse();
    const bytes = files.get(body.path);
    if (!bytes || bytes.byteLength !== page.bytes) refuse();
    const parsed = parseTpexMarketFlowCsv(day, bytes);
    if (page.rawSha256 !== parsed.rawSha256) refuse();
    return { ...parsed, capturedAt: page.capturedAt, officialPublishedAt: null };
  });
  const sum = receipts.reduce((acc, row) => acc + BigInt(row.foreignExcludingDealersNetTwd), 0n);
  const fiveDayTwd = Number(sum);
  if (!Number.isSafeInteger(fiveDayTwd)) refuse();
  return {
    schema: TPEX_MARKET_FLOW_SCHEMA,
    attribution,
    market: 'TPEX',
    currency: 'TWD',
    series: 'foreign_and_mainland_excluding_dealers',
    sessions,
    oneDayTwd: receipts.at(-1)!.foreignExcludingDealersNetTwd,
    fiveDayTwd,
    receipts,
    sourceAuthority: false,
    marketAuthority: false,
    publicationAuthority: false,
    gaps: ['launch_market_flow_official_window_unverified', 'launch_market_flow_original_cutoff_unverified',
      'launch_market_twse_daily_flow_rights_unverified', 'launch_market_flow_db_source_bridge_pending'],
  };
}
