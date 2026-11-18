import { createHash } from 'node:crypto';
import { isHistoryDate } from '../candidate-price-history.ts';
import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';
import { evaluateLaunchOutcome, type LaunchOutcomeInput } from './launch-outcomes.ts';

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

function capturedText(capture: TwseLimitCapture, url: string, maximum = maxBytes) {
  const observed = evidenceInstant(capture.observedAt), recorded = evidenceInstant(capture.recordedAt);
  if (capture.url !== url || !(capture.body instanceof Uint8Array) || capture.body.length < 2 ||
      capture.body.length > maximum || observed === null || recorded === null || observed > recorded) return reject();
  const bytes = Buffer.from(capture.body);
  if (hash(bytes) !== capture.sha256) return reject();
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

function twseReportPrice(text: string) {
  return /^(?:[0-9]{1,8}|[1-9][0-9]{0,2}(?:,[0-9]{3}){1,2})(?:\.[0-9]{1,4})?$/u.test(text)
    ? Number(text.replaceAll(',', '')) : NaN;
}

function readLimit(rows: unknown, symbol: string): LimitRow {
  if (!Array.isArray(rows) || rows.length > maxRows ||
    rows.some(row => !Array.isArray(row) || row.length !== csvFields.length || row.some(value => typeof value !== 'string'))) return reject();
  const found = rows.filter(row => row[0] === symbol);
  if (found.length !== 1) return reject();
  const [upperLimit, openingReference, lowerLimit] = found[0].slice(2, 5).map(twseReportPrice);
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

const regularQuoteFields = ['證券代號', '證券名稱', '成交股數', '成交筆數', '成交金額', '開盤價', '最高價',
  '最低價', '收盤價', '漲跌(+/-)', '漲跌價差', '最後揭示買價', '最後揭示買量', '最後揭示賣價', '最後揭示賣量', '本益比'];

export function twseOpeningReplayQuoteUrl(session: string) {
  if (!isHistoryDate(session)) throw Error('launch_twse_limit_session_invalid');
  return 'https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=' + session.replaceAll('-', '')
    + '&type=ALLBUT0999&response=json';
}

/** Use the separately dated official quote as evidence of an all-day upper
 * lock. Below-limit OHLC never provides a positive auction execution. */
export function replayTwseLockedOpening(input: LaunchOutcomeInput, csv: TwseLimitCapture, dated: TwseLimitCapture,
  quote: TwseLimitCapture) {
  if (input.scope !== 'historical_price_replay' || input.signal.market !== 'TWSE' || input.opening !== null)
    throw Error('launch_twse_locked_open_replay_only');
  const historical = evaluateLaunchOutcome(input);
  const next = input.sessions.find(day => day.status !== 'cancelled');
  const bar = input.bars.find(row => row.session === next?.session);
  if (!next || next.status !== 'completed' || !bar) throw Error('launch_twse_locked_open_session_unverified');
  const { session } = next;
  const { symbol } = input.signal;
  const limits = accepted.get(parseTwseLimitReplay(session, symbol, csv, dated))!;
  const report = JSON.parse(capturedText(quote, twseOpeningReplayQuoteUrl(session), 2 * 1024 * 1024));
  const closeAt = evidenceInstant(next.closeAt)!;
  const cutoff = evidenceInstant(input.asOf)!;
  const sourceTimes = [csv.observedAt, dated.observedAt, quote.observedAt, limits.availableAt, quote.recordedAt, bar.availableAt];
  if (sourceTimes.some(time => evidenceInstant(time)! < closeAt || evidenceInstant(time)! > cutoff))
    throw Error('launch_twse_locked_open_cutoff');
  if (!report || report.stat !== 'OK' || report.date !== session.replaceAll('-', '') || !Array.isArray(report.tables)
    || report.tables.length > 32) throw Error('launch_twse_locked_open_quote_scope');
  const tables = report.tables.filter((table: { fields?: unknown } | null) => sameFields(table?.fields, regularQuoteFields));
  if (tables.length !== 1 || !Array.isArray(tables[0].data) || tables[0].data.length > maxRows
    || tables[0].data.some((row: unknown) => !Array.isArray(row) || row.length !== regularQuoteFields.length
      || row.some(value => typeof value !== 'string'))) throw Error('launch_twse_locked_open_quote_scope');
  const rows: string[][] = tables[0].data.filter((row: string[]) => row[0] === symbol);
  const count = (value: string) => /^(?:[1-9]\d{0,15}|[1-9][0-9]{0,2}(?:,\d{3}){1,5})$/u.test(value)
    && Number.isSafeInteger(Number(value.replaceAll(',', '')));
  if (rows.length !== 1 || !count(rows[0][2]) || !count(rows[0][3])) throw Error('launch_twse_locked_open_untraded');
  const prices = rows[0].slice(5, 9).map(twseReportPrice);
  if (prices.some(price => !Number.isFinite(price) || price < limits.lowerLimit || price > limits.upperLimit)
    || prices[0] !== Number(bar.rawOpen) || prices[2] > Math.min(prices[0], prices[3])
    || prices[1] < Math.max(prices[0], prices[3])) throw Error('launch_twse_locked_open_quote_binding');
  const locked = prices.every(price => price === limits.upperLimit);
  if (locked && ![bar.high, bar.low, bar.close].every(price => Number(price) === Number(bar.open)))
    throw Error('launch_twse_locked_open_price_basis_conflict');
  const knownAt = [limits.availableAt, quote.recordedAt, bar.availableAt]
    .reduce((latest, time) => evidenceInstant(latest)! >= evidenceInstant(time)! ? latest : time);
  const revision = hash(JSON.stringify(['twse-opening-lock-v1', session, symbol, limits.revisionId,
    [quote.url, quote.sha256, quote.observedAt, quote.recordedAt], bar.priceRevision]));
  const outcome = locked ? evaluateLaunchOutcome({ ...input, opening: {
    status: 'unfillable', reason: 'one_price_upper_limit', session, knownAt, revision, rawOpen: null, priceRevision: null,
  } }) : historical;
  return { scope: input.scope, session, symbol, knownAt, revision, officialUpperLimit: limits.upperLimit,
    onePriceLocked: locked, outcome };
}
