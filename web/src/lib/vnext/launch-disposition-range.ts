import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { inspectLaunchDisposition, TWSE_DISPOSITION_FIELDS } from './launch-disposition-status.ts';

export type DispositionMarket = 'TWSE' | 'TPEX';
type Capture = { url: string; body: Uint8Array; observedAt: string; recordedAt: string; sha256: string };
type Row = Record<string, unknown>;

const endpoints = {
  TWSE: 'https://www.twse.com.tw/rwd/zh/announcement/punish',
  TPEX: 'https://www.tpex.org.tw/www/zh-tw/bulletin/disposal',
};
const tpexFields = ['編號', '公布日期', '證券代號', '證券名稱', '累計', '處置起訖時間', '處置原因', '處置措施', '處置內容', '收盤價', '本益比', ' '];
const allOTC = '全部上櫃有價證券';
const maximumRows = 4000;
export const DISPOSITION_RANGE_MAX_BYTES = 512 * 1024;

function invalid(): never { throw Error('launch_disposition_range_refused'); }
function record(value: unknown): Row {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return invalid();
  return value as Row;
}
function validDay(day: string) {
  return /^20\d{2}-\d{2}-\d{2}$/u.test(day) && evidenceInstant(day + 'T00:00:00Z') !== null;
}
function taipeiDay(instant: bigint) {
  return new Date(Number(instant / BigInt(1000)) + 28_800_000).toISOString().slice(0, 10);
}
function rocDay(value: string) {
  const match = /^([0-9]{3})\/([0-9]{2})\/([0-9]{2})$/u.exec(value);
  if (!match || match[1] === '000') return invalid();
  const day = [String(1911 + Number(match[1])), match[2], match[3]].join('-');
  if (!validDay(day)) return invalid();
  return day;
}

export function launchDispositionRangeUrl(market: DispositionMarket, day: string) {
  if (!validDay(day) || !Object.hasOwn(endpoints, market)) return invalid();
  const key = day.replaceAll('-', market === 'TWSE' ? '' : '/');
  const query = new URLSearchParams({ startDate: key, endDate: key, response: 'json' });
  return endpoints[market] + '?' + query.toString();
}

function reportRows(raw: Row, market: DispositionMarket, day: string) {
  const roc = String(Number(day.slice(0, 4)) - 1911) + day.slice(4).replaceAll('-', '/');
  if (market === 'TWSE') {
    if (raw.stat !== 'OK' || raw.title !== '公布處置有價證券資訊 (' + roc + ' 至 ' + roc + ')'
        || !Number.isSafeInteger(raw.total) || !Number.isSafeInteger(raw.count)
        || Number(raw.count) < 0 || Number(raw.count) > Number(raw.total)) return invalid();
    return { report: raw, fields: TWSE_DISPOSITION_FIELDS, total: Number(raw.total), symbols: null };
  }
  if (raw.stat !== 'ok' || raw.date !== day.replaceAll('-', '') + '~' + day.replaceAll('-', '')
      || !Array.isArray(raw.tables) || raw.tables.length !== 1) return invalid();
  const report = record(raw.tables[0]);
  if (report.title !== '上櫃處置有價證券' || report.title2 !== '處置期間為 ' + roc + ' ~ ' + roc
      || report.startDate !== roc || report.endDate !== roc || report.searchArea !== allOTC
      || report.subtitle2 !== '查詢範圍：' + allOTC || typeof report.subtitle !== 'string') return invalid();
  const counts = /^證券個數:(\d{1,4}) 總累計次數: (\d{1,4})$/u.exec(report.subtitle);
  if (!counts) return invalid();
  return { report, fields: tpexFields, symbols: Number(counts[1]), total: Number(counts[2]) };
}

/** Replays the exchange's all-securities query for an exact effective date.
 * This is evidence about disposition intervals only. Suspension and ranking
 * eligibility have their own gates. Capture timestamps require writer receipts
 * before use in production. */
export function inspectLaunchDispositionRange(market: DispositionMarket, capture: Capture, day: string, cutoff: string) {
  const through = evidenceInstant(cutoff), observed = evidenceInstant(capture.observedAt), recorded = evidenceInstant(capture.recordedAt);
  if (capture.url !== launchDispositionRangeUrl(market, day) || through === null || observed === null || recorded === null
    || taipeiDay(through) !== day || observed > recorded || !(capture.body instanceof Uint8Array)
    || capture.body.byteLength < 2 || capture.body.byteLength > DISPOSITION_RANGE_MAX_BYTES) return invalid();
  if (createHash('sha256').update(capture.body).digest('hex') !== capture.sha256) return invalid();

  let raw: Row;
  try {
    raw = record(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(capture.body)));
  } catch {
    return invalid();
  }
  const { report, fields, total, symbols: symbolCount } = reportRows(raw, market, day);
  if (!Array.isArray(report.fields) || report.fields.length !== fields.length
    || !fields.every((field, i) => (report.fields as unknown[])[i] === field)
    || !Array.isArray(report.data) || report.data.length > maximumRows
    || total < 0 || total > maximumRows) return invalid();

  let notices = 0;
  let noNewNoticeRow = false;
  let sameDayAnnouncement = false;
  const codes = new Set<string>();
  for (const row of report.data) {
    if (!Array.isArray(row) || row.length !== fields.length || !Number.isSafeInteger(row[0]) || row[0] < 1
      || typeof row[1] !== 'string') return invalid();
    const announced = rocDay(row[1]);
    if (row[2] === '' && market === 'TPEX') {
      // This sentence concerns new announcements on the date. Old effective
      // intervals may still be present and must be counted.
      if (noNewNoticeRow || announced !== day || row[8] !== '本日無處置資料'
        || row.some((value, index) => index !== 0 && index !== 1 && index !== 8
          && (typeof value !== 'string' || value.trim() !== ''))) return invalid();
      noNewNoticeRow = true;
      continue;
    }
    if (typeof row[2] !== 'string' || !/^[0-9A-Z]{4,6}$/u.test(row[2])
      || typeof row[3] !== 'string' || !row[3].trim() || !Number.isSafeInteger(row[4]) || row[4] < 1) return invalid();
    const interval = row[market === 'TWSE' ? 6 : 5];
    if (typeof interval !== 'string') return invalid();
    const parts = interval.split(market === 'TWSE' ? '～' : '~');
    if (parts.length !== 2) return invalid();
    const starts = rocDay(parts[0]), ends = rocDay(parts[1]);
    if (announced > starts || starts > day || day > ends) return invalid();
    if (announced === day) sameDayAnnouncement = true;
    codes.add(row[2]);
    notices++;
  }
  if (notices !== total || (symbolCount !== null && symbolCount !== codes.size)
    || (noNewNoticeRow && sameDayAnnouncement)) return invalid();

  return {
    market, day, sha256: capture.sha256, bytes: capture.body.byteLength, noticeCount: notices, symbolCount: codes.size,
    observedAt: capture.observedAt, recordedAt: capture.recordedAt,
    timely: taipeiDay(observed) === day && recorded <= through,
    restrictedSymbols: new Set([...codes].filter(code => /^\d{4}$/u.test(code))),
  };
}

/** Require agreement with the separately archived licensed notice stream.
 * A disagreement, stale report or a missing clock cannot clear a symbol. */
export function compareLaunchDispositionReports(market: DispositionMarket, range: Capture,
  licensed: Parameters<typeof inspectLaunchDisposition>[1], day: string, cutoff: string) {
  const report = inspectLaunchDispositionRange(market, range, day, cutoff);
  const corroboration = inspectLaunchDisposition(market, licensed, day, cutoff);
  const recordedByCutoff = report.timely && corroboration.summary.usableAtCutoff;
  const csvSymbols = new Set([...corroboration.observedRestrictedSymbols].filter(code => /^\d{4}$/u.test(code)));
  const reportsAgree = report.restrictedSymbols.size === csvSymbols.size
    && [...report.restrictedSymbols].every(code => csvSymbols.has(code));
  return { reportsAgree, confirmed: recordedByCutoff && reportsAgree, report, corroboration: corroboration.summary };
}
