import { createHash } from 'node:crypto';
import { isHistoryDate } from '../candidate-price-history.ts';
import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

const csvUrl = 'https://www.twse.com.tw/exchangeReport/TWT84U?response=open_data';
const jsonUrl = 'https://www.twse.com.tw/rwd/zh/variation/TWT84U';
const maxBytes = 512 * 1024, maxRows = 4000;
const csvFields = ['證券代號', '證券名稱', '本日漲停價', '本日開盤競價基準', '本日跌停價',
  '前日開盤競價基準', '前日收盤價', '前日買進揭示價', '前日賣出揭示價', '最近成交日', '可否零股交易'];
const jsonFields = ['證券代號', '證券名稱', '漲停價', '開盤競價基準', '跌停價',
  '開盤競價基準', '收盤價', '買進揭示價', '賣出揭示價', '最近成交日', '可否零股交易'];
const groups = [[0, 2, ''], [2, 3, '本日'], [5, 4, '前日'], [9, 2, '']];

export type TwseLimitCapture = { url: string; body: Uint8Array; sha256: string; observedAt: string; recordedAt: string };
type LimitRow = { upperLimit: number; openingReference: number; lowerLimit: number };
type Replay = LimitRow & { symbol: string; session: string; availableAt: string; revisionId: string };
const accepted = new WeakMap<object, Replay>();
const symbolPattern = /^[1-9][0-9]{3}$/u;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const reject = () => { throw Error('launch_twse_limit_report_unverified'); };
const sameFields = (actual: unknown, expected: readonly string[]) =>
  Array.isArray(actual) && actual.length === expected.length && expected.every((key, index) => actual[index] === key);

export function twseLimitReplayUrls(session: string) {
  if (!isHistoryDate(session)) throw Error('launch_twse_limit_session_invalid');
  const day = session.replaceAll('-', '');
  return { csv: csvUrl + '&date=' + day, json: jsonUrl + '?date=' + day + '&selectType=ALLBUT0999&response=json' };
}

function capturedText(capture: TwseLimitCapture, url: string) {
  const observed = evidenceInstant(capture.observedAt), recorded = evidenceInstant(capture.recordedAt);
  if (capture.url !== url || !(capture.body instanceof Uint8Array) || capture.body.length < 2 ||
      capture.body.length > maxBytes || observed === null || recorded === null || observed > recorded) return reject();
  const bytes = Buffer.from(capture.body);
  if (hash(bytes) !== capture.sha256) return reject();
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function readLimit(rows: unknown, symbol: string): LimitRow {
  if (!Array.isArray(rows) || rows.length > maxRows ||
    rows.some(row => !Array.isArray(row) || row.length !== csvFields.length || row.some(value => typeof value !== 'string'))) return reject();
  const found = rows.filter(row => row[0] === symbol);
  if (found.length !== 1) return reject();
  const price = (text: string) => /^(?:[0-9]{1,8}|[1-9][0-9]{0,2}(?:,[0-9]{3}){1,2})(?:\.[0-9]{1,4})?$/u.test(text)
    ? Number(text.replaceAll(',', '')) : NaN;
  const [upperLimit, openingReference, lowerLimit] = found[0].slice(2, 5).map(price);
  if (!(0 < lowerLimit && lowerLimit < upperLimit && lowerLimit <= openingReference && openingReference <= upperLimit)) return reject();
  return { upperLimit, openingReference, lowerLimit };
}

/** Pair the licensed CSV with the exchange report that explicitly declares its
 * session. Capture clocks come from the staging recorder. This replay is only
 * an input to read-only arithmetic and grants no publication authority. */
export function parseTwseLimitReplay(session: string, symbol: string, csv: TwseLimitCapture, dated: TwseLimitCapture) {
  if (!symbolPattern.test(symbol)) return reject();
  const urls = twseLimitReplayUrls(session);
  const [header, ...rows] = decodeLicensedCsvRecords(capturedText(csv, urls.csv), maxRows + 1);
  if (!sameFields(header, csvFields)) return reject();
  const limits = readLimit(rows, symbol);
  const report = JSON.parse(capturedText(dated, urls.json));
  if (!report || report.stat !== 'OK' || report.date !== session.replaceAll('-', '') ||
      report.selectType !== 'ALLBUT0999' || !sameFields(report.fields, jsonFields) ||
      !Array.isArray(report.groups) || report.groups.length !== groups.length ||
      !groups.every(([start, span, title], index) => {
        const item = report.groups[index];
        return item?.start === start && item.span === span && item.title === title;
      }) || !Array.isArray(report.data) || report.total !== report.data.length) return reject();
  const check = readLimit(report.data, symbol);
  if (check.openingReference !== limits.openingReference || check.upperLimit !== limits.upperLimit ||
      check.lowerLimit !== limits.lowerLimit) return reject();
  const availableAt = evidenceInstant(csv.recordedAt)! >= evidenceInstant(dated.recordedAt)! ? csv.recordedAt : dated.recordedAt;
  const revisionId = hash(JSON.stringify(['twse-launch-daily-limit-v1', session, symbol, limits,
    [csv.url, csv.sha256, csv.observedAt, csv.recordedAt], [dated.url, dated.sha256, dated.observedAt, dated.recordedAt]]));
  const token = Object.freeze({});
  accepted.set(token, { ...limits, symbol, session, availableAt, revisionId });
  return token;
}

export function bindTwseLimitReplay(token: unknown, request: TwEntryAuthorityRequest,
    { calendar, history }: TwLaunchPatternReadEvidence) {
  const proof = token !== null && typeof token === 'object' ? accepted.get(token) : undefined;
  const bar = history.bars.at(-1), last = calendar?.sessions.at(-1);
  if (!proof || request.exchange !== 'TWSE' || proof.symbol !== request.symbol || proof.session !== request.signalSession ||
    calendar?.status !== 'validated_selected_window' || !bar || !last || bar.session !== proof.session || last.session !== proof.session ||
    history.priceBasis?.anchorSession !== proof.session || bar.rawClose !== bar.close || !(bar.volume > 0)) return null;
  const available = evidenceInstant(proof.availableAt), close = evidenceInstant(last.closeAt), cutoff = evidenceInstant(request.cutoff);
  if (available === null || close === null || cutoff === null || available < close || available > cutoff) return null;
  const prices = [bar.open, bar.high, bar.low, bar.close];
  if (prices.some(value => !Number.isFinite(value) || value < proof.lowerLimit || value > proof.upperLimit)) return null;
  return { market: 'TWSE' as const, session: proof.session, upperLimit: proof.upperLimit, availableAt: proof.availableAt,
    revisionId: proof.revisionId, onePriceLocked: prices.every(price => price === proof.upperLimit) };
}
