import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

export const TWSE_DISPOSITION_FIELDS = ['編號', '公布日期', '證券代號', '證券名稱', '累計', '處置條件', '處置起迄時間', '處置措施', '處置內容', '備註'] as const;

const profiles = {
  TWSE: {
    datasetId: 29082,
    url: 'https://www.twse.com.tw/announcement/punish?response=open_data',
    fields: TWSE_DISPOSITION_FIELDS,
    indexes: { notice: 1, symbol: 2, period: 6 },
    period: /^([0-9]{3})\/([0-9]{2})\/([0-9]{2})～([0-9]{3})\/([0-9]{2})\/([0-9]{2})$/u,
  },
  TPEX: {
    datasetId: 11396,
    url: 'https://www.tpex.org.tw/web/bulletin/disposal_information/disposal_information_result.php?l=zh-tw&o=data',
    fields: ['公布日期', '證券代號', '證券名稱', '處置起訖時間', '處置原因', '處置內容'],
    indexes: { notice: 0, symbol: 1, period: 3 },
    period: /^([0-9]{3})([0-9]{2})([0-9]{2})~([0-9]{3})([0-9]{2})([0-9]{2})$/u,
  },
} as const;
const maxBytes = 256 * 1024, maxRows = 4000;
type Market = keyof typeof profiles;
type Capture = { datasetId: number; url: string; observedAt: string; recordedAt: string; sha256: string; body: Uint8Array };
type Notice = { symbol: string; announced: string; starts: string; ends: string };

const refuse = (): never => { throw Error('launch_disposition_report_refused'); };
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/u.test(date) && evidenceInstant(date + 'T00:00:00Z') !== null;
const taipeiDate = (instant: bigint) => new Date(Number(instant / BigInt(1000)) + 28_800_000).toISOString().slice(0, 10);

export function launchDispositionSource(market: Market, session?: string) {
  const { datasetId, url } = profiles[market];
  if (session === undefined) return { datasetId, url, maxBytes };
  if (market !== 'TWSE' || !dateValid(session)) return refuse();
  const key = session.replaceAll('-', '');
  return { datasetId, url: url + '&startDate=' + key + '&endDate=' + key, maxBytes };
}

function rocDate(year: string, month: string, day: string) {
  const date = [String(1911 + Number(year)), month, day].join('-');
  if (year === '000' || !dateValid(date)) refuse();
  return date;
}

function parseNotice(row: string[], profile: (typeof profiles)[Market]): Notice {
  const { notice, symbol, period } = profile.indexes;
  const published = /^([0-9]{3})([0-9]{2})([0-9]{2})$/u.exec(row[notice]);
  const interval = profile.period.exec(row[period]);
  if (row.length !== profile.fields.length || !/^[0-9A-Z]{4,6}$/u.test(row[symbol])
      || !row[symbol + 1]?.trim() || (notice === 1 && !/^[1-9][0-9]*$/u.test(row[0]))) return refuse();
  if (!published || !interval) return refuse();
  const announced = rocDate(published[1], published[2], published[3]);
  const starts = rocDate(interval[1], interval[2], interval[3]);
  const ends = rocDate(interval[4], interval[5], interval[6]);
  if (announced > starts || starts > ends) return refuse();
  return { symbol: row[symbol], announced, starts, ends };
}

/** These feeds publish notices with explicit intervals, without declaring an
 * exhaustive market state for a trading session. A timely matching notice
 * establishes an observed restriction. An absent symbol or late capture stays
 * unknown. Prices, liquidity and a temporary trading halt are separate facts. */
export function inspectLaunchDisposition(market: Market, capture: Capture, session: string, cutoff: string) {
  const profile = profiles[market];
  const observed = evidenceInstant(capture.observedAt), recorded = evidenceInstant(capture.recordedAt);
  const through = evidenceInstant(cutoff);
  const dated = market === 'TWSE' && dateValid(session) && capture.url === launchDispositionSource('TWSE', session).url;
  if (capture.datasetId !== profile.datasetId || (!dated && capture.url !== profile.url) || !(capture.body instanceof Uint8Array)
      || capture.body.byteLength < 1 || capture.body.byteLength > maxBytes || !dateValid(session)
      || observed === null || recorded === null || through === null || observed > recorded
      || taipeiDate(through) !== session) return refuse();
  const body = Buffer.from(capture.body);
  const sha256 = createHash('sha256').update(body).digest('hex');
  if (sha256 !== capture.sha256) return refuse();
  const [header, ...rows] = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true }).decode(body), maxRows + 1);
  if (!header || header.length !== profile.fields.length || !profile.fields.every((field, index) => header[index] === field)) return refuse();
  const notices = rows.map(row => parseNotice(row, profile));
  if (notices.some(row => row.announced > taipeiDate(observed))) return refuse();

  const current = notices.filter(row => row.starts <= session && session <= row.ends);
  if (dated && current.length !== notices.length) return refuse();
  const timely = taipeiDate(observed) === session && recorded <= through;
  const observedRestrictedSymbols = new Set(current.map(row => row.symbol));
  return {
    summary: { datasetId: profile.datasetId, market, session, sha256, bytes: body.byteLength,
      observedAt: capture.observedAt, recordedAt: capture.recordedAt, requestScope: dated ? 'exact_session' : 'current_feed',
      publishedNotices: notices.length,
      noticesInEffect: current.length, usableAtCutoff: timely, completeAbsenceProved: false as const },
    restrictedSymbols: new Set(timely ? observedRestrictedSymbols : []),
    observedRestrictedSymbols,
  };
}
