import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

export const TPEX_DAILY_STATUS_SOURCE = Object.freeze({
  datasetId: 11736,
  datasetUrl: 'https://data.gov.tw/dataset/11736',
  url: 'https://www.tpex.org.tw/web/stock/aftertrading/cmode/chtm_result.php?l=zh-tw&o=data',
  maxBytes: 262_144,
});

const headers = ['資料日期', '證券代號', '證券名稱', '變更交易', '分盤交易', '管理股票',
  '分盤或管理股票撮合循環時間', '停止交易', '財務重點專區'];
const flag = (value: string) => value === '' || value === 'Ｙ';
const checkDate = (day: string) => /^\d{4}-\d{2}-\d{2}$/u.test(day) && evidenceInstant(day + 'T00:00:00Z') !== null;
const taipeiDate = (at: bigint) => new Date(Number(at / 1000n) + 28_800_000).toISOString().slice(0, 10);

type Capture = { datasetId: number; url: string; receivedAt: string; bytes: number; sha256: string; body: Uint8Array };

function refuse(): never {
  throw Error('launch_tpex_daily_status_refused');
}

function readableDate(roc: string) {
  if (!/^[0-9]{7}$/u.test(roc)) refuse();
  const value = String(1911 + Number(roc.slice(0, 3))) + '-' + roc.slice(3, 5) + '-' + roc.slice(5);
  if (!checkDate(value)) refuse();
  return value;
}

/** Positive stopped-trading observations from the TPEx daily status list.
 * This report omits unflagged issuers. Absence, a change of trading method
 * and a custody status are unrelated to legal listing or the next auction.
 */
export function inspectTpexDailyStatus(capture: Capture, targetSession: string, cutoff: string) {
  const received = evidenceInstant(capture.receivedAt), end = evidenceInstant(cutoff);
  const digest = createHash('sha256').update(capture.body).digest('hex');
  if (capture.datasetId !== TPEX_DAILY_STATUS_SOURCE.datasetId || capture.url !== TPEX_DAILY_STATUS_SOURCE.url
    || capture.bytes !== capture.body.byteLength || capture.bytes < 1 || capture.bytes > TPEX_DAILY_STATUS_SOURCE.maxBytes
    || capture.sha256 !== digest || received === null || end === null || !checkDate(targetSession)
    || taipeiDate(end) !== targetSession) refuse();

  const [header, ...rows] = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true }).decode(capture.body), 4001);
  if (!header || header.length !== headers.length || headers.some((field, index) => header[index] !== field)) refuse();
  let reportDate: string | null = null;
  const codes = new Set<string>();
  const suspensions = new Set<string>();
  for (const row of rows) {
    const [rawDay, code, name, altered, periodic, managed, frequency, stopped, financial] = row;
    if (row.length !== headers.length || !/^[A-Z0-9]{4,6}$/u.test(code) || codes.has(code) || !name.trim()
      || ![altered, periodic, managed, stopped, financial].every(flag) || !/^(?:|[0-9]{3})$/u.test(frequency)) refuse();
    const day = readableDate(rawDay);
    if (reportDate !== null && reportDate !== day) refuse();
    reportDate = day;
    codes.add(code);
    if (stopped === 'Ｙ') suspensions.add(code);
  }
  const sameSessionByCutoff = reportDate === targetSession && received <= end && taipeiDate(received) === targetSession;
  return {
    summary: {
      datasetId: TPEX_DAILY_STATUS_SOURCE.datasetId, reportDate, receivedAt: capture.receivedAt, bytes: capture.bytes,
      sha256: digest, reportedRows: rows.length, positiveSuspensions: suspensions.size, sameSessionByCutoff,
      completeAbsenceProved: false, market: 'TPEX',
    },
    timelySuspensions: sameSessionByCutoff ? suspensions : new Set<string>(),
  };
}
