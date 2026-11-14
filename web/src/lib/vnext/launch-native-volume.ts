/** Licensed11371 byte replay and exact selected-volume overlay. No acquisition,
 * writer, listing/liquidity, publication or current-limit authority. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import { readTwLaunchNativeVolumeBinding, launchNativeContentDigest, type TwEntryAuthorityRequest, type TwEntryHistoricalAuthorityResult, type TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { isHistoryDate } from '../candidate-price-history.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';

export const NATIVE_SHARE_SCHEMA = 'launch-tpex-11371-native-shares-v1';
export const NATIVE_SHARE_PARSER = 'sfb-11371-technical-shares-issued-capital-v2';
export const NATIVE_TECHNICAL_COVERAGE = 'tpex_11371_report_excluding_fixed_price_v1';
export const NATIVE_SHARE_HEADERS = Object.freeze(['資料日期','代號','名稱','收盤','漲跌','開盤','最高','最低','成交股數','成交金額','成交筆數','最後買價','最後賣價','發行股數','次日漲停價','次日跌停價']);
export const NATIVE_SHARE_ATTRIBUTION = Object.freeze({ datasetId: 11371, datasetUrl: 'https://data.gov.tw/dataset/11371',
  owner: 'Securities and Futures Bureau, Financial Supervisory Commission / Taipei Exchange',
  license: 'Taiwan Open Government Data License 1.0', licenseUrl: 'https://data.gov.tw/license', exchange: 'TPEX' });
const MAX_PAGE = 500000, MAX_TOTAL = 32 * 1024 * 1024;
type Row = Readonly<{ session: string; symbol: string; open: number; high: number; low: number; close: number;
  shares: number; tradedNtd: number; trades: number; issuedShares: number; nextUpper: number | null; nextLower: number | null;
  rawSha256: string; csvRowsSha256: string; sourceUrl: string; observedAt: string }>;
type Change = Readonly<{ previousSession: string; currentSession: string; previousIssuedShares: number; currentIssuedShares: number;
  deltaShares: number; effectiveSession: null; eventKind: null; adjustmentFactor: null }>;
type ReplayState = { symbol: string; cutoff: string; revisionId: string; availableAt: string; rows: readonly Row[]; changes: readonly Change[]; incomplete: boolean; gaps: string[] };
const replays = new WeakMap<object, ReplayState>();
type NativeSeriesRow = Readonly<{ session: string; shares: number; issuedShares: number; observedAt: string }>;
export type NativeVolumeOverlay = Readonly<{ schema: 'launch-native-technical-volume-overlay-v2'; revisionId: string; sourceDatasetRevision: string;
  purpose: 'technical_turnover'; coverage: typeof NATIVE_TECHNICAL_COVERAGE; institutionalDenominatorAuthority: false;
  symbol: string; stockId: string; market: 'TPEX';
  calendarRevision: string; actionsRevision: string; availableAt: string; cutoff: string; fromSession: string; throughSession: string;
  capitalRegime: 'observed_issued_shares_constant_with_predecessor'; sourceAuthority: false; publicationAuthority: false }>;
type VolumeContext = { history: TwEntryHistoricalAuthorityResult; selection: TwLaunchPatternReadEvidence | undefined;
  symbol: string | null; stockId: string | null; market: string; signalSession: string | null;
  calendarRevision: string | null; calendarAvailableAt: string | null; calendarRows: readonly { session: string; closeAt: string }[];
  actionsRevision: string | null; cutoff: string };
const overlays = new WeakMap<object, { selection: TwLaunchPatternReadEvidence; contextDigest: string; metadataDigest: string; rows: readonly NativeSeriesRow[] }>();
function fail(code: string): never { throw Error(code); }
const exact = (value: unknown, keys: string): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && !types.isProxy(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.split(' ').length
  && keys.split(' ').every(key => Object.hasOwn(value, key) && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key)!, 'value'));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const known = (at: unknown, cutoff: unknown) => { const a = evidenceInstant(at), b = evidenceInstant(cutoff); return a !== null && b !== null && a <= b; };
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
function dataList(value: unknown, maximum: number): unknown[] | null {
  if (!Array.isArray(value) || types.isProxy(value) || Object.getPrototypeOf(value) !== Array.prototype) return null;
  const length = Object.getOwnPropertyDescriptor(value,'length')?.value;
  if (!Number.isSafeInteger(length) || length < 0 || length > maximum || Reflect.ownKeys(value).length !== length+1) return null;
  const result: unknown[]=[];
  for(let index=0;index<length;index++){
    const descriptor=Object.getOwnPropertyDescriptor(value,String(index));
    if(!descriptor || !descriptor.enumerable || !Object.hasOwn(descriptor,'value'))return null;
    result.push(descriptor.value);
  }
  return result;
}
function integer(value: string): number | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(value.trim())) return null;
  const n = Number(value.replace(/,/gu, '').trim()); return Number.isSafeInteger(n) && n >= 0 ? n : null;
}
function decimal(value: string): number | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,6})?$/u.test(value.trim())) return null;
  const n = Number(value.replace(/,/gu, '').trim()); return Number.isFinite(n) && n > 0 ? n : null;
}
function sourceDate(value: string): string | null {
  if (isHistoryDate(String(value))) return value;
  const match = /^(\d{3,4})[/-]?(\d{2})[/-]?(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const day = `${Number(match[1]) < 1911 ? Number(match[1]) + 1911 : match[1]}-${match[2]}-${match[3]}`;
  return isHistoryDate(day) ? day : null;
}
export function tpexNativeShareCsvUrl(session: string): string {
  if (!isHistoryDate(session) || Number(session.slice(0, 4)) - 1911 < 1) fail('native_share_session_invalid');
  const roc = `${Number(session.slice(0, 4)) - 1911}/${session.slice(5, 7)}/${session.slice(8)}`;
  return `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&o=data&se=EW&d=${encodeURIComponent(roc)}`;
}
function bytesOf(page: Record<string, unknown>, files: ReadonlyMap<string, Uint8Array>): Uint8Array | null {
  if (!Number.isSafeInteger(page.bytes) || Number(page.bytes) < 2 || Number(page.bytes) > MAX_PAGE || !hash(page.rawSha256)) fail('native_share_bytes_invalid');
  const body = page.body;
  if (exact(body, 'encoding') && body.encoding === 'absent') return null;
  let bytes: Uint8Array | undefined;
  if (exact(body, 'encoding data') && body.encoding === 'base64' && typeof body.data === 'string' && body.data.length <= Math.ceil(MAX_PAGE / 3) * 4) {
    bytes = Buffer.from(body.data, 'base64'); if (Buffer.from(bytes).toString('base64') !== body.data) fail('native_share_base64_invalid');
  } else if (exact(body, 'encoding path') && body.encoding === 'file' && typeof body.path === 'string' && body.path.length <= 180
    && /^bodies\/[A-Za-z0-9_./-]+$/u.test(body.path) && body.path.split('/').every(part => part && part !== '.' && part !== '..')) bytes = files.get(body.path);
  else fail('native_share_body_invalid');
  if (!bytes) return null;
  if (bytes.byteLength !== page.bytes || sha(bytes) !== page.rawSha256) fail('native_share_raw_hash_mismatch');
  return new Uint8Array(bytes);
}
/** Independent CSV parse works before any selected-cache/DB binding. Metadata
 * receipts without bytes retain gaps and never establish exact native shares. */
export function parseTpexNativeShareReplay(value: unknown, files: ReadonlyMap<string, Uint8Array> = new Map()) {
  const sessions = value && typeof value==='object' && !types.isProxy(value)
    ? dataList(Object.getOwnPropertyDescriptor(value,'sessions')?.value,57) : null;
  const responses = value && typeof value==='object' && !types.isProxy(value)
    ? dataList(Object.getOwnPropertyDescriptor(value,'responses')?.value,57) : null;
  if (!exact(value, 'schema datasetId symbol cutoff capture sessions responses') || value.schema !== NATIVE_SHARE_SCHEMA || value.datasetId !== 11371
    || typeof value.symbol !== 'string' || !/^\d{4}$/u.test(value.symbol) || evidenceInstant(value.cutoff) === null
    || !exact(value.capture, 'repository sourceCommit workflowPath runId runAttempt startedAt completedAt')
    || typeof value.capture.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value.capture.repository)
    || typeof value.capture.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.capture.sourceCommit)
    || !known(value.capture.completedAt, value.cutoff) || evidenceInstant(value.capture.completedAt)! >= evidenceInstant(value.cutoff)!
    || value.capture.startedAt !== null && !known(value.capture.startedAt, value.capture.completedAt)
    || !sessions || sessions.length < 1 || sessions.some((day,index)=>!isHistoryDate(day)||index>0&&day<=(sessions as string[])[index-1])
    || !responses) fail('native_share_manifest_invalid');
  const capture = value.capture, cutoff = value.cutoff as string, symbol = value.symbol;
  const noWorkflow = capture.workflowPath === null && capture.runId === null && capture.runAttempt === null;
  if (!noWorkflow && !(typeof capture.workflowPath === 'string' && /^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/u.test(capture.workflowPath)
    && typeof capture.runId === 'string' && /^\d{1,20}$/u.test(capture.runId) && Number.isSafeInteger(capture.runAttempt) && Number(capture.runAttempt) >= 1)) fail('native_share_capture_invalid');
  const rows: Row[] = [], seen = new Set<string>(), paths = new Set<string>(); let total = 0, decodedBytes = 0;
  const gaps = ['native_share_original_publication_clock_unverified', 'native_share_parser_not_acquisition_or_publication_authority'];
  if (noWorkflow) gaps.push('native_share_capture_workflow_identity_unverified');
  for (const candidate of responses) {
    if (!exact(candidate, 'session sourceUrl observedAt publisherPublishedAt httpStatus redirectCount contentType bytes rawSha256 body')
      || typeof candidate.session !== 'string' || !(sessions as string[]).includes(candidate.session) || seen.has(candidate.session)
      || candidate.sourceUrl !== tpexNativeShareCsvUrl(candidate.session) || candidate.publisherPublishedAt !== null
      || ![200, null].includes(candidate.httpStatus as number | null) || ![0, null].includes(candidate.redirectCount as number | null)
      || candidate.contentType !== null && (typeof candidate.contentType !== 'string' || candidate.contentType.length > 128)
      || !known(candidate.observedAt, capture.completedAt) || capture.startedAt !== null && !known(capture.startedAt, candidate.observedAt)) fail('native_share_response_invalid');
    seen.add(candidate.session); total += Number(candidate.bytes);
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL) fail('native_share_total_bound');
    const body = candidate.body as Record<string, unknown>;
    if (body && typeof body.path === 'string') { if (paths.has(body.path)) fail('native_share_duplicate_file'); paths.add(body.path); }
    const bytes = bytesOf(candidate, files);
    if (!bytes) { gaps.push('native_share_raw_body_missing'); continue; }
    decodedBytes += bytes.byteLength;
    const records = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), 5001);
    if (records.length < 2 || JSON.stringify(records[0]) !== JSON.stringify(NATIVE_SHARE_HEADERS)
      || records.some(row => row.length !== 16)) fail('native_share_header_or_width_invalid');
    const symbols = new Set<string>(); let selected: string[] | null = null;
    for (const row of records.slice(1)) {
      if (sourceDate(row[0]) !== candidate.session || !/^[0-9A-Za-z]{2,12}$/u.test(row[1]) || symbols.has(row[1])) fail('native_share_row_identity_invalid');
      symbols.add(row[1]); if (row[1] === symbol) selected = row;
    }
    if (!selected) fail('native_share_candidate_missing');
    const close = decimal(selected[3]), open = decimal(selected[5]), high = decimal(selected[6]), low = decimal(selected[7]);
    const shares = integer(selected[8]), tradedNtd = integer(selected[9]), trades = integer(selected[10]), issuedShares = integer(selected[13]);
    if ([close, open, high, low].some(number => number === null) || high! < Math.max(open!, close!) || low! > Math.min(open!, close!) || high! < low!
      || shares === null || tradedNtd === null || trades === null || issuedShares === null || issuedShares <= 0) fail('native_share_candidate_numbers_invalid');
    const nextUpper = decimal(selected[14]), nextLower = decimal(selected[15]);
    if (nextUpper !== null && nextLower !== null && nextUpper < nextLower) fail('native_share_next_quote_invalid');
    rows.push(Object.freeze({ session: candidate.session, symbol, open: open!, high: high!, low: low!, close: close!, shares, tradedNtd, trades, issuedShares,
      nextUpper, nextLower, rawSha256: candidate.rawSha256 as string, csvRowsSha256: sha256Canonical(records),
      sourceUrl: candidate.sourceUrl as string, observedAt: candidate.observedAt as string }));
  }
  rows.sort((a, b) => a.session.localeCompare(b.session));
  if (seen.size !== sessions.length) gaps.push('native_share_planned_response_missing');
  const changes: Change[] = [];
  for (let index = 1; index < rows.length; index++) if (rows[index].issuedShares !== rows[index - 1].issuedShares) {
    changes.push(Object.freeze({ previousSession: rows[index - 1].session, currentSession: rows[index].session,
      previousIssuedShares: rows[index - 1].issuedShares, currentIssuedShares: rows[index].issuedShares,
      deltaShares: rows[index].issuedShares - rows[index - 1].issuedShares, effectiveSession: null, eventKind: null, adjustmentFactor: null }));
  }
  const revisionId = `native-11371:${launchNativeContentDigest([NATIVE_SHARE_PARSER, NATIVE_TECHNICAL_COVERAGE, NATIVE_SHARE_ATTRIBUTION, NATIVE_SHARE_HEADERS, value.capture, sessions, rows])}`;
  const result = Object.freeze({ schema: NATIVE_SHARE_SCHEMA, parserVersion: NATIVE_SHARE_PARSER, datasetId: 11371, symbol, cutoff,
    revisionId, attribution: NATIVE_SHARE_ATTRIBUTION, declaredBytes: total, decodedBytes, parsedSessions: rows.length, availableAt: capture.completedAt as string,
    purpose: 'technical_turnover' as const, coverage: NATIVE_TECHNICAL_COVERAGE, institutionalDenominatorAuthority: false as const,
    issuedShareChanges: Object.freeze(changes), nextDayLimitQuotes: Object.freeze(rows.map(row => Object.freeze({ quotedOnSession: row.session,
      upper: row.nextUpper, lower: row.nextLower, targetSession: null, currentLimitAuthority: false, onePriceLocked: null }))),
    responseReceipts: Object.freeze(rows.map(row => Object.freeze({ session: row.session, sourceUrl: row.sourceUrl, rawSha256: row.rawSha256,
      csvRowsSha256: row.csvRowsSha256, observedAt: row.observedAt }))), sourceAuthority: false, publicationAuthority: false,
    instrumentQualificationAuthority: false, liquidityQualificationAuthority: false, gaps: Object.freeze([...new Set(gaps)].sort()) });
  replays.set(result, { symbol, cutoff, revisionId, availableAt: capture.completedAt as string,
    rows: Object.freeze(rows), changes: Object.freeze(changes), incomplete: rows.length !== sessions.length, gaps: [...new Set(gaps)] });
  return result;
}
export type NativeShareReplay = ReturnType<typeof parseTpexNativeShareReplay>;
export function isNativeShareReplay(value: unknown): value is NativeShareReplay { return typeof value === 'object' && value !== null && replays.has(value); }
export function nativeVolumeContext(selected: TwLaunchPatternReadEvidence, request: Pick<TwEntryAuthorityRequest,'symbol'|'exchange'|'signalSession'|'cutoff'> & { stockId?: string }): VolumeContext | null {
  try {
    launchNativeContentDigest(selected); launchNativeContentDigest(request);
    return { history: selected.history, selection: selected, calendarRevision: selected.calendar?.revisionId ?? null,
    symbol: request.symbol, stockId: request.stockId ?? null, market: request.exchange, signalSession: request.signalSession,
    calendarAvailableAt: selected.calendar?.availableAt ?? null,
    calendarRows: selected.calendar?.sessions.map(row => ({ session: row.session, closeAt: row.closeAt })) ?? [],
      actionsRevision: selected.corporateActions?.revisionId ?? null, cutoff: request.cutoff };
  } catch { return null; }
}
export function bindTpexNativeShareReplay(proof: unknown, request: TwEntryAuthorityRequest, selected: TwLaunchPatternReadEvidence) {
  const blocked = (reason: string) => ({ overlay: null as NativeVolumeOverlay | null, gaps: [reason] });
  try {
    const state = typeof proof === 'object' && proof !== null ? replays.get(proof) : null;
    const binding = readTwLaunchNativeVolumeBinding(selected, request);
    if (!state || state.incomplete || !binding || state.symbol !== request.symbol || request.exchange !== 'TPEX' || state.cutoff !== request.cutoff
      || !known(state.availableAt, request.cutoff)) return blocked('native_share_proof_or_selected_binding_missing');
    const selectedRows: Row[] = [];
    for (const raw of binding.rows) {
      const row = state.rows.find(item => item.session === raw.session);
      const day = selected.calendar!.sessions.find(item => item.session === raw.session);
      if (!row || !day || !known(day.closeAt, row.observedAt) || !known(row.observedAt, request.cutoff)
        || row.open !== raw.rawOpen || row.high !== raw.rawHigh || row.low !== raw.rawLow || row.close !== raw.rawClose || raw.factor !== 1) return blocked('native_share_51_raw_price_or_clock_mismatch');
      selectedRows.push(row);
    }
    if (selectedRows.length !== 51) return blocked('native_share_51_sessions_missing');
    if (!Number.isSafeInteger(selectedRows.reduce((sum,row)=>sum+row.shares,0))) return blocked('native_share_51_aggregate_overflow');
    const first = selectedRows[0].session, last = selectedRows.at(-1)!.session;
    const firstIndex = state.rows.findIndex(row => row.session === first), predecessor = state.rows[firstIndex - 1];
    const preceding = selected.calendar!.sessions[selected.calendar!.sessions.findIndex(day => day.session === first) - 1];
    if (!predecessor || predecessor.session !== preceding?.session) return blocked('native_share_issued_regime_predecessor_missing');
    if (!known(preceding.closeAt, predecessor.observedAt) || !known(predecessor.observedAt, request.cutoff)) return blocked('native_share_issued_regime_predecessor_clock_invalid');
    if (state.changes.some(change => change.currentSession >= first && change.previousSession < last)
      || selectedRows.some(row => row.issuedShares !== predecessor.issuedShares)) return blocked('native_share_issued_count_changed_in_selected_51');
    const context = nativeVolumeContext(selected, request), availableAt = [binding.availableAt, state.availableAt].sort((a, b) => evidenceInstant(a)! < evidenceInstant(b)! ? -1 : 1).at(-1)!;
    if (!context) return blocked('native_share_binding_context_invalid');
    const revisionId = `native-volume-overlay:${launchNativeContentDigest([NATIVE_SHARE_PARSER, state.revisionId, state.rows, binding,
      selectedRows, predecessor, request, context])}`;
    const overlay: NativeVolumeOverlay = Object.freeze({ schema: 'launch-native-technical-volume-overlay-v2', revisionId,
      purpose: 'technical_turnover', coverage: NATIVE_TECHNICAL_COVERAGE, institutionalDenominatorAuthority: false,
      sourceDatasetRevision: binding.priceRevision, symbol: request.symbol, stockId: request.stockId, market: 'TPEX', calendarRevision: binding.calendarRevision, actionsRevision: binding.actionsRevision,
      availableAt, cutoff: request.cutoff, fromSession: first, throughSession: last,
      capitalRegime: 'observed_issued_shares_constant_with_predecessor', sourceAuthority: false, publicationAuthority: false });
    overlays.set(overlay, { selection: selected, contextDigest: launchNativeContentDigest(context), metadataDigest: launchNativeContentDigest(overlay),
      rows: Object.freeze(selectedRows.map(row => Object.freeze({ session: row.session, shares: row.shares, issuedShares: row.issuedShares, observedAt: row.observedAt }))) });
    return { overlay, gaps: [...state.gaps, 'native_share_supported_feeds_not_complete_global_action_coverage'] };
  } catch { return blocked('native_share_binding_invalid'); }
}
/** Fresh branded lookup for every core/scorer consumer. Serialized public
 * metadata, resolved rows supplied by a caller, and changed contexts fail. */
export function resolveNativeVolumeOverlay(value: unknown, context: VolumeContext | null) {
  try {
    if (!value || typeof value !== 'object' || !context) return null;
    const state = overlays.get(value), overlay = value as NativeVolumeOverlay;
    if (!state || context.selection !== state.selection || context.history !== state.selection.history
      || state.contextDigest !== launchNativeContentDigest(context) || state.metadataDigest !== launchNativeContentDigest(value)
      || !known(overlay.availableAt, context.cutoff) || overlay.cutoff !== context.cutoff || state.rows.length !== 51
      || !Number.isSafeInteger(state.rows.reduce((sum,row)=>sum+row.shares,0))
      || overlay.sourceDatasetRevision !== context.history.sourceDatasetRevision || overlay.calendarRevision !== context.calendarRevision
      || overlay.actionsRevision !== context.actionsRevision) return null;
    const shares = new Map(state.rows.map(row => [row.session, row.shares]));
    return Object.freeze({ revisionId: overlay.revisionId, availableAt: overlay.availableAt, fromSession: overlay.fromSession,
      throughSession: overlay.throughSession, rows: state.rows, volumeOf: (session: string) => shares.get(session) ?? null });
  } catch { return null; }
}
