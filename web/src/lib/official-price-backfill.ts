import { createHash } from 'node:crypto';

export type OfficialPriceBackfillPage = {
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
  sourceUrl: string;
  responseText: string;
  responseSha256: string;
};

export type OfficialPriceBackfillRow = {
  symbol: string;
  exchange: 'TWSE' | 'TPEX';
  sessionDate: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceUrl: string;
  responseSha256: string;
};

const PAGE_KEYS = ['exchange','responseSha256','responseText','sourceUrl','symbol'];

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function finite(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/gu, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function calendarDate(value: unknown) {
  const match = String(value || '').match(/^(\d{3,4})\/(\d{2})\/(\d{2})$/u);
  if (!match) return null;
  const year = Number(match[1]) < 1911 ? Number(match[1]) + 1911 : Number(match[1]);
  const output = `${year}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${output}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === output ? output : null;
}

const TWSE_PRICE_FIELDS = ['日期','成交股數','成交金額','開盤價','最高價','最低價','收盤價'];

export function boundTwseStockDayMonth(payload: Record<string, unknown>, sourceUrl: string) {
  let url: URL;
  try { url = new URL(sourceUrl); } catch { return null; }
  if (url.origin !== 'https://www.twse.com.tw' || url.username || url.password || url.hash
    || !['/exchangeReport/STOCK_DAY', '/rwd/zh/afterTrading/STOCK_DAY'].includes(url.pathname)
    || url.searchParams.size !== 3 || url.searchParams.get('response') !== 'json') return null;
  const date = url.searchParams.get('date') || '';
  const symbol = url.searchParams.get('stockNo') || '';
  const title = typeof payload.title === 'string'
    ? /^(\d{1,3})年[ \t]*(\d{1,2})月[ \t]+(\d{4,6})[ \t]+[^\r\n]+[ \t]+各日成交資訊$/u.exec(payload.title.trim())
    : null;
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(4, 6));
  const fields = payload.fields;
  if (!/^\d{6}01$/u.test(date) || !/^\d{4,6}$/u.test(symbol) || month < 1 || month > 12
    || !title || Number(title[1]) + 1911 !== year || Number(title[2]) !== month || title[3] !== symbol
    || payload.date !== date || !Array.isArray(fields)
    || !TWSE_PRICE_FIELDS.every((field, index) => fields[index] === field)) return null;
  return date.slice(0, 4) + '-' + date.slice(4, 6);
}

function pageMonth(page: OfficialPriceBackfillPage) {
  let url: URL;
  try { url = new URL(page.sourceUrl); } catch { return null; }
  if (url.protocol !== 'https:') return null;
  if (page.exchange === 'TWSE') {
    const date = url.searchParams.get('date') || '';
    if (url.hostname !== 'www.twse.com.tw' || url.pathname !== '/exchangeReport/STOCK_DAY'
      || url.searchParams.get('response') !== 'json' || url.searchParams.get('stockNo') !== page.symbol
      || !/^\d{6}01$/u.test(date)) return null;
    return `${date.slice(0, 4)}-${date.slice(4, 6)}`;
  }
  const date = url.searchParams.get('date') || '';
  if (url.hostname !== 'www.tpex.org.tw' || url.pathname !== '/www/zh-tw/afterTrading/tradingStock'
    || url.searchParams.get('code') !== page.symbol || url.searchParams.get('response') !== 'json'
    || !/^\d{4}\/\d{2}\/01$/u.test(date)) return null;
  return date.slice(0, 7).replace('/', '-');
}

export function parseOfficialPriceBackfillPage(value: unknown): OfficialPriceBackfillRow[] | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const page = value as OfficialPriceBackfillPage;
  if (!exactKeys(value as Record<string, unknown>, PAGE_KEYS) || !/^\d{4}$/u.test(String(page.symbol))
    || !['TWSE','TPEX'].includes(String(page.exchange)) || typeof page.responseText !== 'string'
    || Buffer.byteLength(page.responseText) < 2 || Buffer.byteLength(page.responseText) > 100_000
    || !/^[0-9a-f]{64}$/u.test(String(page.responseSha256))
    || createHash('sha256').update(page.responseText).digest('hex') !== page.responseSha256) return null;
  const month = pageMonth(page);
  if (!month || /<html|<!doctype/iu.test(page.responseText)) return null;
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(page.responseText) as Record<string, unknown>; } catch { return null; }
  if (!payload || String(payload.stat || '').toLowerCase() !== 'ok') return null;
  if (page.exchange === 'TWSE' && boundTwseStockDayMonth(payload, page.sourceUrl) !== month) return null;
  const table = (payload.tables as Array<{ fields?: unknown; data?: unknown }> | undefined)?.[0];
  const fields = table?.fields;
  const expectedTpexFields = ['日 期','成交張數','成交仟元','開盤','最高','最低','收盤'];
  if (page.exchange === 'TPEX'
    && (!Array.isArray(fields) || !expectedTpexFields.every((field, index) => fields[index] === field))) return null;
  const rows = page.exchange === 'TWSE' ? payload.data : table?.data;
  if (!Array.isArray(rows)) return null;
  const output = rows.flatMap((row): OfficialPriceBackfillRow[] => {
    if (!Array.isArray(row)) return [];
    const sessionDate = calendarDate(row[0]);
    const multiplier = page.exchange === 'TPEX' ? 1000 : 1;
    const volume = finite(row[1]); const open = finite(row[3]); const high = finite(row[4]); const low = finite(row[5]); const close = finite(row[6]);
    if (!sessionDate || sessionDate.slice(0, 7) !== month || [volume, open, high, low, close].some((item) => item == null)
      || volume! < 0 || open! <= 0 || high! < Math.max(open!, close!) || low! > Math.min(open!, close!)) return [];
    return [{ symbol: page.symbol, exchange: page.exchange, sessionDate, open: open!, high: high!, low: low!, close: close!,
      volume: volume! * multiplier, sourceUrl: page.sourceUrl, responseSha256: page.responseSha256 }];
  });
  return output.length > 0 ? output : null;
}

export function officialPriceBackfillBatchHash(pages: OfficialPriceBackfillPage[]) {
  return createHash('sha256').update(JSON.stringify(pages)).digest('hex');
}

export async function collectPagedOfficialAuthorityRows<T>(fetchPage: (from: number, to: number) => PromiseLike<{
  data: T[] | null;
  error: { message: string } | null;
}>) {
  const rows: T[] = [];
  for (let offset = 0; ; offset += 1000) {
    const result = await fetchPage(offset, offset + 999);
    if (result.error) return { rows: [] as T[], error: result.error.message };
    const page = result.data || [];
    rows.push(...page);
    if (page.length < 1000) return { rows, error: null };
  }
}
