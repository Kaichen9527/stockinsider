import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

export const LISTED_ROSTER_REPLAY_SCHEMA = 'launch-listed-roster-source-replay-v1';
export const LISTED_ROSTER_MAX_BYTES = 20_000_000;
export const LISTED_ROSTER_TOTAL_BYTES = 22_000_000;
const MOPS_MAX_BYTES = 1_000_000;

const sources = {
  TWSE: {
    id: 18419, owner: '金融監督管理委員會證券期貨局／臺灣證券交易所', name: '上市公司基本資料',
    url: 'https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv', listingField: '上市日期', custodyVenue: '上市',
  },
  TPEX: {
    id: 25036, owner: '金融監督管理委員會證券期貨局／證券櫃檯買賣中心', name: '上櫃公司基本資料',
    url: 'https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv', listingField: '上櫃日期', custodyVenue: '上櫃',
  },
  TDCC: {
    id: 11425, owner: '金融監督管理委員會證券期貨局／臺灣集中保管結算所', name: '證券基本資料',
    url: 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-1',
  },
} as const;

export const LISTED_ROSTER_SOURCES = Object.freeze(
  (['TWSE', 'TPEX', 'TDCC'] as const).map(source => Object.freeze({
    datasetId: sources[source].id,
    url: sources[source].url,
    maxBytes: source === 'TDCC' ? LISTED_ROSTER_MAX_BYTES : MOPS_MAX_BYTES,
  })),
);

const companyHeaders = [
  '出表日期', '公司代號', '公司名稱', '公司簡稱', '外國企業註冊地國', '產業別', '住址', '營利事業統一編號',
  '董事長', '總經理', '發言人', '發言人職稱', '代理發言人', '總機電話', '成立日期', '上市日期', '普通股每股面額',
  '實收資本額', '私募股數', '特別股', '編制財務報表類型', '股票過戶機構', '過戶電話', '過戶地址',
  '簽證會計師事務所', '簽證會計師1', '簽證會計師2', '英文簡稱', '英文通訊地址', '傳真機號碼',
  '電子郵件信箱', '網址', '已發行普通股數或TDR原股發行股數',
];
const custodyHeaders = [
  '證券代號', '證券名稱', '市場別', '股務單位', '停止過戶領回', '證券狀態', '無面無實體', '歸戶領回',
  '限制部分帳簿劃撥功能註記', '發行幣別', '每股面額(元)', '更新日期',
];
const venueKeys = ['TWSE', 'TPEX'] as const;
type Venue = typeof venueKeys[number];
type Source = keyof typeof sources;
type JsonObject = Record<string, unknown>;

function refuse(): never {
  throw Error('launch_listed_roster_source_replay_refused');
}

function exactObject(value: unknown, keys: readonly string[]): asserts value is JsonObject {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype
    || Reflect.ownKeys(value).length !== keys.length
    || keys.some(key => !Object.hasOwn(value, key))) refuse();
}

function isoDate(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value)
    || evidenceInstant(value + 'T00:00:00Z') === null) refuse();
}

function civil(value: string, roc = false) {
  if (!(roc ? /^\d{7}$/u : /^\d{8}$/u).test(value)) refuse();
  const yearLength = roc ? 3 : 4;
  const year = Number(value.slice(0, yearLength)) + (roc ? 1911 : 0);
  const date = `${year}-${value.slice(-4, -2)}-${value.slice(-2)}`;
  isoDate(date);
  return date;
}

function taipei(instant: bigint) {
  return new Date(Number(instant / 1000n) + 28_800_000).toISOString().slice(0, 10);
}

const sha256 = (bytes: Uint8Array | string) => createHash('sha256').update(bytes).digest('hex');
const fourDigitCompany = (symbol: string) => /^[1-9]\d{3}$/u.test(symbol);

function readRecords(bytes: Uint8Array, headers: string[], maximumRows: number) {
  const records = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true }).decode(bytes), maximumRows + 1, headers.length);
  const header = records.shift();
  if (!header || header.length !== headers.length || headers.some((name, index) => header[index] !== name)
    || records.length === 0 || records.some(row => row.length !== headers.length)) refuse();
  return records;
}

function readCompanyRoster(bytes: Uint8Array, venue: Venue) {
  const headers = companyHeaders.map((field, index) => index === 15 ? sources[venue].listingField : field);
  const rows = readRecords(bytes, headers, 4_000);
  const sourceDate = civil(rows[0][0], true);
  const codes = new Set<string>();
  const listings = new Map<string, string>();
  for (const row of rows) {
    const symbol = row[1];
    if (civil(row[0], true) !== sourceDate || !/^[0-9A-Z]{4,6}$/u.test(symbol) || codes.has(symbol)) refuse();
    codes.add(symbol);
    if (fourDigitCompany(symbol)) listings.set(symbol, civil(row[15]));
  }
  if (!listings.size) refuse();
  return { sourceDate, listings, rawRows: rows.length };
}

type CustodyRecord = { market: string; status: string };

function readCustodyRoster(bytes: Uint8Array) {
  const rows = readRecords(bytes, custodyHeaders, 200_000);
  const sourceDate = civil(rows[0][11]);
  const entries = new Map<string, CustodyRecord>();
  let nonCompanyFourDigit = 0;
  for (const row of rows) {
    if (row[11] !== rows[0][11]) refuse();
    const [symbol, , market, , , status] = row;
    if (/^0\d{3}$/u.test(symbol) && (market === '上市' || market === '上櫃')) nonCompanyFourDigit++;
    if (!fourDigitCompany(symbol)) continue;
    if (!['上市', '上櫃', '終止上市櫃', '興櫃', '未上市櫃'].includes(market) || !status || entries.has(symbol)) refuse();
    entries.set(symbol, { market, status });
  }
  if (!entries.size) refuse();
  return { sourceDate, entries, rawRows: rows.length, nonCompanyFourDigit };
}

function loadResponse(input: unknown, source: Source, files: ReadonlyMap<string, Uint8Array>) {
  exactObject(input, ['datasetId', 'url', 'receivedAt', 'sha256', 'bytes', 'body']);
  if (input.datasetId !== sources[source].id || input.url !== sources[source].url || typeof input.receivedAt !== 'string'
    || evidenceInstant(input.receivedAt) === null || typeof input.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(input.sha256)
    || typeof input.bytes !== 'number' || !Number.isSafeInteger(input.bytes) || input.bytes < 1
    || input.bytes > (source === 'TDCC' ? LISTED_ROSTER_MAX_BYTES : MOPS_MAX_BYTES)) refuse();
  exactObject(input.body, ['encoding', 'path']);
  if (input.body.encoding !== 'file' || typeof input.body.path !== 'string' || !/^bodies\/[A-Za-z0-9_-]+\.csv$/u.test(input.body.path)) refuse();
  const bytes = files.get(input.body.path);
  if (!bytes || bytes.byteLength !== input.bytes || sha256(bytes) !== input.sha256) refuse();
  return { bytes, receivedAt: input.receivedAt, sha256: input.sha256, datasetId: sources[source].id,
    url: sources[source].url, bodyPath: input.body.path };
}

function compareCatalogs(venue: Venue, companies: ReturnType<typeof readCompanyRoster>,
  alternate: ReturnType<typeof readCompanyRoster>, custody: ReturnType<typeof readCustodyRoster>, sourceDate: string) {
  const expected = sources[venue].custodyVenue;
  const confirmed: string[] = [];
  const reviews = [];
  const gaps = { crossVenueCompanyClaim: 0, futureListing: 0, custodyMissing: 0, custodyMarketMismatch: 0,
    custodyStatusRestricted: 0, custodyOnly: 0 };
  for (const [code, listingDate] of [...companies.listings].sort(([a], [b]) => a.localeCompare(b))) {
    const state = custody.entries.get(code);
    let finding: keyof typeof gaps | 'corroborated';
    if (alternate.listings.has(code)) finding = 'crossVenueCompanyClaim';
    else if (listingDate > sourceDate) finding = 'futureListing';
    else if (!state) finding = 'custodyMissing';
    else if (state.market !== expected) finding = 'custodyMarketMismatch';
    else if (state.status !== '正常') finding = 'custodyStatusRestricted';
    else finding = 'corroborated';
    if (finding === 'corroborated') confirmed.push(code);
    else gaps[finding]++;
    reviews.push({ code, listingDate, finding, custodyMarket: state?.market ?? null });
  }
  for (const [code, state] of [...custody.entries].sort(([a], [b]) => a.localeCompare(b))) {
    if (state.market !== expected || companies.listings.has(code)) continue;
    gaps.custodyOnly++;
    reviews.push({ code, listingDate: null, finding: 'custodyOnly', custodyMarket: state.market });
  }
  return {
    summary: {
      companyRows: companies.rawRows,
      companyCodes: companies.listings.size,
      excludedOtherCodes: companies.rawRows - companies.listings.size,
      corroboratedCodes: confirmed.length,
      corroboratedSetHash: sha256(JSON.stringify([venue, ...confirmed])),
      gaps,
    },
    reviews,
  };
}

/** Verify captures against the government catalog resources. Agreement is
 * corroboration only. Neither a custody operation nor missing transport
 * evidence can create/revoke an exchange listing or admit a ranking input.
 */
export function analyzeListedRosterReplay(value: unknown, files: ReadonlyMap<string, Uint8Array>) {
  exactObject(value, ['schema', 'targetSession', 'cutoff', 'responses']);
  if (value.schema !== LISTED_ROSTER_REPLAY_SCHEMA || typeof value.cutoff !== 'string') refuse();
  isoDate(value.targetSession);
  const cutoff = evidenceInstant(value.cutoff);
  if (cutoff === null || taipei(cutoff) !== value.targetSession || !Array.isArray(value.responses)
    || value.responses.length !== 3) refuse();

  const twseFeed = loadResponse(value.responses[0], 'TWSE', files);
  const tpexFeed = loadResponse(value.responses[1], 'TPEX', files);
  const custodyFeed = loadResponse(value.responses[2], 'TDCC', files);
  const feeds = [twseFeed, tpexFeed, custodyFeed];
  if (new Set(feeds.map(row => row.bodyPath)).size !== feeds.length || files.size !== feeds.length) refuse();
  const twse = readCompanyRoster(twseFeed.bytes, 'TWSE');
  const tpex = readCompanyRoster(tpexFeed.bytes, 'TPEX');
  const custody = readCustodyRoster(custodyFeed.bytes);
  const sourceDates = [twse.sourceDate, tpex.sourceDate, custody.sourceDate];

  const comparableSourceDates = new Set(sourceDates).size === 1;
  const compared = comparableSourceDates ? {
    TWSE: compareCatalogs('TWSE', twse, tpex, custody, twse.sourceDate),
    TPEX: compareCatalogs('TPEX', tpex, twse, custody, tpex.sourceDate),
  } : null;
  const receipts = feeds.map((feed, index) => {
    const id = index === 0 ? 'TWSE' : index === 1 ? 'TPEX' : 'TDCC';
    const { owner, name } = sources[id];
    return { datasetId: feed.datasetId, url: feed.url, name, owner, license: 'Taiwan Open Government Data License 1.0',
      licenseUrl: 'https://data.gov.tw/license', sourceDate: sourceDates[index], receivedAt: feed.receivedAt,
      bytes: feed.bytes.byteLength, sha256: feed.sha256 };
  });
  const sameSessionByCutoff = comparableSourceDates && sourceDates[0] === value.targetSession && feeds.every(row => {
    const instant = evidenceInstant(row.receivedAt)!;
    return instant <= cutoff && taipei(instant) === value.targetSession;
  });
  const summary = {
    schema: LISTED_ROSTER_REPLAY_SCHEMA, targetSession: value.targetSession, cutoff: value.cutoff,
    scope: 'company_and_custody_reconciliation', comparableSourceDates, sameSessionByCutoff,
    qualified: false, custodianRows: custody.rawRows, custodianOtherFourDigitRows: custody.nonCompanyFourDigit,
    receipts, venues: compared ? { TWSE: compared.TWSE.summary, TPEX: compared.TPEX.summary } : null,
  };
  const reviews = compared ? { TWSE: compared.TWSE.reviews, TPEX: compared.TPEX.reviews } : null;
  return { summary, reviews };
}

export function parseListedRosterReplay(value: unknown, files: ReadonlyMap<string, Uint8Array> = new Map()) {
  return analyzeListedRosterReplay(value, files).summary;
}
