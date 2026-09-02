import { createHash } from 'node:crypto';

export type OfficialCalendarBackfillPage = {
  market: 'TWSE' | 'TPEX';
  sourceUrl: string;
  responseText: string;
  responseSha256: string;
};

export type OfficialCalendarBackfillEvidence = {
  market: 'TWSE' | 'TPEX';
  month: string;
  dates: string[];
  closes: Record<string, number>;
  sourceUrl: string;
  responseSha256: string;
};

const PAGE_KEYS = ['market','responseSha256','responseText','sourceUrl'];

function exactKeys(value: Record<string, unknown>, expected: string[]) {
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function rocSession(value: unknown) {
  const match = String(value || '').trim().match(/^(\d{3,4})[\/\-](\d{2})[\/\-](\d{2})$/u);
  if (!match) return null;
  const year = Number(match[1]) < 1911 ? Number(match[1]) + 1911 : Number(match[1]);
  const output = `${year}-${match[2]}-${match[3]}`;
  const parsed = new Date(`${output}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === output ? output : null;
}

function finitePositive(value: unknown) {
  const parsed = Number(String(value ?? '').replace(/,/gu, '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function pageMonth(page: OfficialCalendarBackfillPage) {
  let url: URL;
  try { url = new URL(page.sourceUrl); } catch { return null; }
  if (url.protocol !== 'https:' || url.searchParams.get('response') !== 'json' || [...url.searchParams.keys()].sort().join(',') !== 'date,response') return null;
  const date = url.searchParams.get('date') || '';
  if (page.market === 'TWSE') {
    if (url.hostname !== 'www.twse.com.tw' || url.pathname !== '/rwd/zh/TAIEX/MI_5MINS_HIST' || !/^\d{6}01$/u.test(date)) return null;
    return `${date.slice(0, 4)}-${date.slice(4, 6)}`;
  }
  if (url.hostname !== 'www.tpex.org.tw' || url.pathname !== '/www/zh-tw/afterTrading/tradingIndex' || !/^\d{4}\/\d{2}\/01$/u.test(date)) return null;
  return date.slice(0, 7).replace('/', '-');
}

export function parseOfficialCalendarBackfillPage(value: unknown): OfficialCalendarBackfillEvidence | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const page = value as OfficialCalendarBackfillPage;
  if (!exactKeys(value as Record<string, unknown>, PAGE_KEYS) || !['TWSE','TPEX'].includes(String(page.market))
    || typeof page.responseText !== 'string' || Buffer.byteLength(page.responseText) < 2 || Buffer.byteLength(page.responseText) > 500_000
    || !/^[0-9a-f]{64}$/u.test(String(page.responseSha256))
    || createHash('sha256').update(page.responseText).digest('hex') !== page.responseSha256
    || /<html|<!doctype/iu.test(page.responseText)) return null;
  const month = pageMonth(page);
  if (!month) return null;
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(page.responseText) as Record<string, unknown>; } catch { return null; }
  let fields: unknown[] | undefined;
  let rows: unknown[] | undefined;
  if (page.market === 'TWSE') {
    fields = Array.isArray(payload.fields) ? payload.fields : undefined;
    rows = Array.isArray(payload.data) ? payload.data : undefined;
    if (String(payload.stat || '').toLowerCase() !== 'ok' || !fields?.includes('日期')) return null;
  } else {
    const table = (Array.isArray(payload.tables) ? payload.tables : []).find((candidate) => {
      const candidateFields = candidate && typeof candidate === 'object' && Array.isArray((candidate as Record<string, unknown>).fields)
        ? ((candidate as Record<string, unknown>).fields as unknown[]) : [];
      return candidateFields.includes('日期') && candidateFields.includes('櫃買指數');
    }) as Record<string, unknown> | undefined;
    fields = Array.isArray(table?.fields) ? table!.fields as unknown[] : undefined;
    rows = Array.isArray(table?.data) ? table!.data as unknown[] : undefined;
  }
  if (!fields || !rows) return null;
  const names = fields.map(String);
  const dateIndex = names.indexOf('日期');
  const closeIndex = names.indexOf(page.market === 'TWSE' ? '收盤指數' : '櫃買指數');
  if (closeIndex < 0) return null;
  const closes: Record<string, number> = {};
  const dates = [...new Set(rows.flatMap((row) => {
    const date = Array.isArray(row) ? rocSession(row[dateIndex]) : null;
    const close = Array.isArray(row) ? finitePositive(row[closeIndex]) : null;
    if (!date || date.slice(0, 7) !== month || close == null) return [];
    closes[date] = close;
    return [date];
  }))].sort();
  return dates.length > 0 ? { market: page.market, month, dates, closes, sourceUrl: page.sourceUrl, responseSha256: page.responseSha256 } : null;
}

export function officialCalendarBackfillBatchHash(pages: OfficialCalendarBackfillPage[]) {
  return createHash('sha256').update(JSON.stringify(pages)).digest('hex');
}

export function intersectOfficialCalendarPages(evidence: OfficialCalendarBackfillEvidence[]) {
  if (evidence.length !== 2 || new Set(evidence.map((item) => item.market)).size !== 2 || new Set(evidence.map((item) => item.month)).size !== 1) return null;
  const twse = evidence.find((item) => item.market === 'TWSE')!;
  const tpex = evidence.find((item) => item.market === 'TPEX')!;
  const tpexDates = new Set(tpex.dates);
  const dates = twse.dates.filter((date) => tpexDates.has(date));
  return dates.length > 0 ? { dates, twse, tpex } : null;
}
