/** Bounded licensed11370 byte replay and same-scope institutional denominator.
 * No acquisition, technical-turnover, qualification or publication authority.
 * Only this parser and its validated binder write the private proof registry. */
import { createHash } from 'node:crypto';
import { types } from 'node:util';
import type { TwEntryAuthorityRequest, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';
import { launchNativeContentDigest, readTwLaunchInstitutionalSelection } from '../tw-entry-plan-authority.ts';
import { evidenceKnownAt, evidenceInstant } from './evidence-clock.ts';
import { isHistoryDate } from '../candidate-price-history.ts';
import { sha256Canonical } from '../opportunity-v3/canonical.ts';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';
import { bindLaunchOfficialReplay, type LaunchOfficialReplayRead } from './launch-official-replay.ts';
import type { LaunchChipEvidence } from './launch-score-rules.ts';

export const INSTITUTIONAL_VOLUME_SCHEMA = 'launch-tpex-11370-institutional-volume-v1';
export const INSTITUTIONAL_VOLUME_PARSER = 'sfb-11370-all-session-shares-issued-v1';
export const INSTITUTIONAL_VOLUME_HEADERS = Object.freeze(['資料日期','代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額','成交筆數','最後買價','最後賣價','發行股數','次日參考價','次日漲停價','次日跌停價']);
export const INSTITUTIONAL_VOLUME_ATTRIBUTION = Object.freeze({ datasetId: 11370, datasetUrl: 'https://data.gov.tw/dataset/11370',
  owner: 'Securities and Futures Bureau, Financial Supervisory Commission / Taipei Exchange',
  license: 'Taiwan Open Government Data License 1.0', licenseUrl: 'https://data.gov.tw/license', exchange: 'TPEX' });
// Registered current report and dated Nov13 report have identical observed
// bytes in20c961b. The legacy endpoint ignored date filters; it is NEVER used
// as a historical fallback. This mapping is not an acquisition attestation.
export const INSTITUTIONAL_RESOURCE_MAPPING = Object.freeze({ version: 'tpex-11370-dated-csv-resource-map-v1',
  evidenceCommit: '20c961ba458428800d4234e7c33d92ebf06228a0',
  registeredCurrentUrl: 'https://www.tpex.org.tw/web/stock/aftertrading/DAILY_CLOSE_quotes/stk_quote_result.php?l=zh-tw&o=data',
  observedSession: '2026-11-13', identicalBytesSha256: '51c8a90f766f9416a3991273f1c20ad5ea83b15696da5c813a736440d3cde55a',
  legacyHistoricalFallback: false });
const MAX_PAGE = 3 * 1024 * 1024, MAX_TOTAL = 64 * 1024 * 1024;
type NativeRow = Readonly<{ session: string; shares: number; issuedShares: number; tradedNtd: number;
  rawSha256: string; csvRowsSha256: string; sourceUrl: string; availableAt: string }>;
type ReplayState = { symbol: string; cutoff: string; revisionId: string; availableAt: string; rows: readonly NativeRow[]; incomplete: boolean; gaps: readonly string[] };
const replays = new WeakMap<object, ReplayState>();
function fail(code: string): never { throw Error(code); }
const exact = (value: unknown, keys: string): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value)) && Reflect.ownKeys(value).length === keys.split(' ').length
  && keys.split(' ').every(key => Object.hasOwn(value, key));
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
/** Raw base64 can exceed the small selected-metadata digest budget. Inspect
 * descriptors without serialization/hooks under this source's own byte caps. */
function rawInput(value: unknown) {
  let nodes=0, characters=0;
  const visit=(item: unknown, depth: number): void=>{
    if (++nodes>5000 || depth>12) fail('institutional_volume_manifest_bound');
    if (typeof item==='string') {
      characters+=item.length;
      if(item.length>Math.ceil(MAX_PAGE/3)*4 || characters>Math.ceil(MAX_TOTAL/3)*4+1048576) fail('institutional_volume_manifest_bound');
      return;
    }
    if(item===null || typeof item==='boolean' || typeof item==='number'&&Number.isFinite(item))return;
    if(!item || typeof item!=='object' || types.isProxy(item))fail('institutional_volume_manifest_invalid');
    const array=Array.isArray(item);
    if(!(array ? Object.getPrototypeOf(item)===Array.prototype : [Object.prototype,null].includes(Object.getPrototypeOf(item))))fail('institutional_volume_manifest_invalid');
    for(const key of Reflect.ownKeys(item)) {
      const descriptor=Object.getOwnPropertyDescriptor(item,key)!;
      if(typeof key!=='string' || key.length>180 || !Object.hasOwn(descriptor,'value') || !descriptor.enumerable&&!(array&&key==='length'))fail('institutional_volume_manifest_invalid');
      if(array&&key==='length')continue;
      visit(descriptor.value,depth+1);
    }
  };
  visit(value,0);
}
function integer(value: string): number | null {
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/u.test(value.trim())) return null;
  const number = Number(value.replace(/,/gu, '').trim()); return Number.isSafeInteger(number) && number >= 0 ? number : null;
}
function sourceDate(value: string): string | null {
  if (isHistoryDate(String(value))) return value;
  const match = /^(\d{3,4})[/-]?(\d{2})[/-]?(\d{2})$/u.exec(value.trim());
  if (!match) return null;
  const day = `${Number(match[1]) < 1911 ? Number(match[1]) + 1911 : match[1]}-${match[2]}-${match[3]}`;
  return isHistoryDate(day) ? day : null;
}
export function tpexInstitutionalVolumeCsvUrl(session: string): string {
  if (!isHistoryDate(session)) fail('institutional_volume_session_invalid');
  return `https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${encodeURIComponent(session.replace(/-/gu, '/'))}&response=data&type=DailyClose`;
}
function bytesOf(page: Record<string, unknown>, files: ReadonlyMap<string, Uint8Array>): Uint8Array | null {
  if (!Number.isSafeInteger(page.bytes) || Number(page.bytes) < 2 || Number(page.bytes) > MAX_PAGE || !hash(page.rawSha256)) fail('institutional_volume_bytes_invalid');
  const body = page.body; if (exact(body, 'encoding') && body.encoding === 'absent') return null;
  let bytes: Uint8Array | undefined;
  if (exact(body, 'encoding data') && body.encoding === 'base64' && typeof body.data === 'string' && body.data.length <= Math.ceil(MAX_PAGE / 3) * 4) {
    bytes = Buffer.from(body.data, 'base64'); if (Buffer.from(bytes).toString('base64') !== body.data) fail('institutional_volume_base64_invalid');
  } else if (exact(body, 'encoding path') && body.encoding === 'file' && typeof body.path === 'string' && body.path.length <= 180
    && /^bodies\/[A-Za-z0-9_./-]+$/u.test(body.path) && body.path.split('/').every(part => part && part !== '.' && part !== '..')) bytes = files.get(body.path);
  else fail('institutional_volume_body_invalid');
  if (!bytes) return null;
  if (bytes.byteLength !== page.bytes || sha(bytes) !== page.rawSha256) fail('institutional_volume_raw_hash_mismatch');
  return new Uint8Array(bytes);
}
/** One symbol per replay; observed dates are not an official session calendar.
 * Missing bytes remain missing and cannot register a denominator proof. */
export function parseTpexInstitutionalVolumeReplay(value: unknown, files: ReadonlyMap<string, Uint8Array> = new Map()) {
  // Reject Proxy/accessor/toJSON/function/undefined hooks before dereference.
  rawInput(value);
  if (!exact(value, 'schema datasetId symbol cutoff capture sessions responses') || value.schema !== INSTITUTIONAL_VOLUME_SCHEMA || value.datasetId !== 11370
    || typeof value.symbol !== 'string' || !/^\d{4}$/u.test(value.symbol) || typeof value.cutoff !== 'string' || evidenceInstant(value.cutoff) === null
    || !exact(value.capture, 'repository sourceCommit workflowPath runId runAttempt startedAt completedAt')
    || typeof value.capture.repository !== 'string' || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(value.capture.repository)
    || typeof value.capture.sourceCommit !== 'string' || !/^[a-f0-9]{40}$/u.test(value.capture.sourceCommit)
    || typeof value.capture.completedAt !== 'string' || !evidenceKnownAt(value.capture.completedAt, value.cutoff) || evidenceInstant(value.capture.completedAt)! >= evidenceInstant(value.cutoff)!
    || value.capture.startedAt !== null && !evidenceKnownAt(value.capture.startedAt, value.capture.completedAt)
    || !Array.isArray(value.sessions) || value.sessions.length < 1 || value.sessions.length > 21
    || value.sessions.some((day, index) => !isHistoryDate(day) || index > 0 && day <= (value.sessions as string[])[index - 1])
    || !Array.isArray(value.responses) || value.responses.length > 21) fail('institutional_volume_manifest_invalid');
  const capture = value.capture, cutoff = value.cutoff, symbol = value.symbol, completedAt = value.capture.completedAt;
  const noWorkflow = capture.workflowPath === null && capture.runId === null && capture.runAttempt === null;
  if (!noWorkflow && !(typeof capture.workflowPath === 'string' && /^\.github\/workflows\/[A-Za-z0-9_-]+\.ya?ml$/u.test(capture.workflowPath)
    && typeof capture.runId === 'string' && /^\d{1,20}$/u.test(capture.runId) && Number.isSafeInteger(capture.runAttempt) && Number(capture.runAttempt) >= 1)) fail('institutional_volume_capture_invalid');
  const rows: NativeRow[] = [], seen = new Set<string>(), paths = new Set<string>(); let total = 0, decodedBytes = 0;
  const gaps = ['institutional_volume_original_publication_clock_unverified', 'institutional_volume_parser_not_acquisition_or_publication_authority'];
  if (noWorkflow) gaps.push('institutional_volume_capture_workflow_identity_unverified');
  for (const page of value.responses) {
    if (!exact(page, 'session sourceUrl observedAt publisherPublishedAt httpStatus redirectCount contentType bytes rawSha256 body')
      || typeof page.session !== 'string' || !(value.sessions as string[]).includes(page.session) || seen.has(page.session)
      || page.sourceUrl !== tpexInstitutionalVolumeCsvUrl(page.session) || page.publisherPublishedAt !== null
      || ![200, null].includes(page.httpStatus as number | null) || ![0, null].includes(page.redirectCount as number | null)
      || page.contentType !== null && (typeof page.contentType !== 'string' || page.contentType.length > 128)
      || typeof page.observedAt !== 'string' || !evidenceKnownAt(page.observedAt, completedAt) || capture.startedAt !== null && !evidenceKnownAt(capture.startedAt, page.observedAt)) fail('institutional_volume_response_invalid');
    seen.add(page.session); total += Number(page.bytes);
    if (!Number.isSafeInteger(total) || total > MAX_TOTAL) fail('institutional_volume_total_bound');
    const body = page.body as Record<string, unknown>;
    if (body && typeof body.path === 'string') { if (paths.has(body.path)) fail('institutional_volume_duplicate_file'); paths.add(body.path); }
    const bytes = bytesOf(page, files); if (!bytes) { gaps.push('institutional_volume_raw_body_missing'); continue; }
    decodedBytes += bytes.byteLength;
    const records = decodeLicensedCsvRecords(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes), 16001);
    if (records.length < 2 || JSON.stringify(records[0]) !== JSON.stringify(INSTITUTIONAL_VOLUME_HEADERS) || records.some(row => row.length !== 18)) fail('institutional_volume_header_or_width_invalid');
    const symbols = new Set<string>(); let selected: string[] | null = null;
    for (const row of records.slice(1)) {
      if (sourceDate(row[0]) !== page.session || !/^[0-9A-Za-z]{2,12}$/u.test(row[1]) || symbols.has(row[1])) fail('institutional_volume_row_identity_invalid');
      symbols.add(row[1]); if (row[1] === symbol) selected = row;
    }
    if (!selected) fail('institutional_volume_candidate_missing');
    const shares = integer(selected[9]), tradedNtd = integer(selected[10]), issuedShares = integer(selected[14]);
    if (shares === null || tradedNtd === null || issuedShares === null || issuedShares <= 0) fail('institutional_volume_candidate_numbers_invalid');
    rows.push(Object.freeze({ session: page.session, shares, tradedNtd, issuedShares, rawSha256: page.rawSha256 as string,
      csvRowsSha256: sha256Canonical(records), sourceUrl: page.sourceUrl as string, availableAt: page.observedAt as string }));
  }
  rows.sort((a,b)=>a.session.localeCompare(b.session)); if (seen.size !== value.sessions.length) gaps.push('institutional_volume_planned_response_missing');
  const revisionId = `institutional-11370:${launchNativeContentDigest([INSTITUTIONAL_VOLUME_PARSER, INSTITUTIONAL_VOLUME_ATTRIBUTION, INSTITUTIONAL_RESOURCE_MAPPING, value.capture, value.sessions, rows])}`;
  const changes = rows.slice(1).flatMap((row,index)=>row.issuedShares === rows[index].issuedShares ? [] : [Object.freeze({
    previousSession: rows[index].session, currentSession: row.session, previousIssuedShares: rows[index].issuedShares,
    currentIssuedShares: row.issuedShares, deltaShares: row.issuedShares - rows[index].issuedShares, effectiveSession: null, eventKind: null, adjustmentFactor: null })]);
  const result = Object.freeze({ schema: INSTITUTIONAL_VOLUME_SCHEMA, parserVersion: INSTITUTIONAL_VOLUME_PARSER, datasetId: 11370, symbol, cutoff,
    revisionId, attribution: INSTITUTIONAL_VOLUME_ATTRIBUTION, resourceMapping: INSTITUTIONAL_RESOURCE_MAPPING, declaredBytes: total, decodedBytes,
    parsedSessions: rows.length, availableAt: capture.completedAt as string, issuedShareChanges: Object.freeze(changes),
    // Bounded public licensed observations support external integer/sum checks.
    // These labels do not establish official calendar or denominator authority.
    observedShareRows: Object.freeze(rows.map(row=>Object.freeze({session:row.session,shares:row.shares,issuedShares:row.issuedShares,observedAt:row.availableAt}))),
    responseReceipts: Object.freeze(rows.map(row=>Object.freeze({session:row.session,sourceUrl:row.sourceUrl,rawSha256:row.rawSha256,csvRowsSha256:row.csvRowsSha256,observedAt:row.availableAt}))),
    sourceAuthority: false, publicationAuthority: false, rankingAuthority: false, instrumentQualificationAuthority: false, liquidityQualificationAuthority: false,
    gaps: Object.freeze([...new Set(gaps)].sort()) });
  replays.set(result, {symbol,cutoff,revisionId,availableAt:capture.completedAt as string,rows:Object.freeze(rows),incomplete:rows.length!==value.sessions.length,gaps:result.gaps});
  return result;
}
export type InstitutionalVolumeReplay = ReturnType<typeof parseTpexInstitutionalVolumeReplay>;
export function isInstitutionalVolumeReplay(value: unknown): value is InstitutionalVolumeReplay { return !!value && typeof value === 'object' && replays.has(value); }

export type InstitutionalFlowCoverage = 'tpex_11856_combined_sessions_v1' | 'unverified_institutional_scope';
export type InstitutionalVolumeSource = Readonly<{ type: 'institutional_same_scope_denominator'; datasetId: number;
  sourceUrl: string; sourceVersion: string; coverage: string; comparableFlowCoverage: InstitutionalFlowCoverage;
  resourceMappingRevision: string; availableAt: string }>;
declare const institutionalProof: unique symbol;
export type InstitutionalVolumeProof = Readonly<{ [institutionalProof]: true }>;
type Request = Pick<TwEntryAuthorityRequest,'symbol'|'exchange'|'signalSession'|'cutoff'> & { stockId?: string };
type DenominatorState = { requestDigest: string; selected: TwLaunchPatternReadEvidence; selectedDigest: string;
  revisionId: string; source: InstitutionalVolumeSource; independentCapitalRevision: string; flowDigest: string; bindingDigest: string;
  rows: readonly Readonly<{ session: string; shares: number; availableAt: string }>[] };
const proofs = new WeakMap<object, DenominatorState>();
/** Authenticates BOTH raw parser brands and the real selected-reader brand.
 * Capital continuity is evaluated only within the consumed20 sessions. */
export function bindTpexInstitutionalVolumeReplay(replay: unknown, flowReplay: LaunchOfficialReplayRead, request: TwEntryAuthorityRequest, selected: TwLaunchPatternReadEvidence) {
  const blocked = (reason: string) => ({ proof: null as InstitutionalVolumeProof | null, gaps: [reason] });
  try {
    const state = replay && typeof replay === 'object' ? replays.get(replay) : null;
    const binding = readTwLaunchInstitutionalSelection(selected, request);
    if (!state || state.incomplete || !binding || state.symbol !== request.symbol || state.cutoff !== request.cutoff || request.exchange !== 'TPEX'
      || !evidenceKnownAt(state.availableAt, request.cutoff)) return blocked('institutional_volume_replay_or_selected_binding_missing');
    if (binding.targetEvents.length) return blocked('institutional_volume_supported_target_event_in_selected_20');
    const bound = bindLaunchOfficialReplay(flowReplay, request, selected), flow = bound.external.chips;
    if (!flow || flow.flowCoverage !== 'tpex_11856_combined_sessions_v1' || flow.rows.length !== 20) return blocked('institutional_volume_11856_aligned_flow_missing');
    const rows = binding.sessions.map(day=>state.rows.find(row=>row.session===day.session));
    if (rows.length !== 20 || rows.some((row,index)=>!row || !evidenceKnownAt(binding.sessions[index].closeAt,row.availableAt)
      || !evidenceKnownAt(row.availableAt, request.cutoff))) return blocked('institutional_volume_20_sessions_or_clock_missing');
    const selectedRows = rows as NativeRow[];
    if (selectedRows.some(row=>row.issuedShares!==selectedRows[0].issuedShares)) return blocked('institutional_volume_issued_count_changed_in_selected_20');
    if (sumInstitutionalShares(selectedRows.map(row=>row.shares)) === null || flow.rows.some((row,index)=>row.session!==selectedRows[index].session
      || !Number.isSafeInteger(row.foreignNetShares) || !Number.isSafeInteger(row.trustNetShares)
      || Math.abs(row.foreignNetShares!)>selectedRows[index].shares || Math.abs(row.trustNetShares!)>selectedRows[index].shares)) return blocked('institutional_volume_flow_units_or_share_bound_invalid');
    const flowDigest = launchNativeContentDigest(flow);
    const independentCapitalRevision = `institutional-capital:${launchNativeContentDigest([selectedRows.map(row=>[row.session,row.issuedShares,row.rawSha256]),binding.actionsRevision,binding.snapshotIds])}`;
    const availableAt = [binding.availableAt,state.availableAt,flow.availableAt].sort((a,b)=>evidenceInstant(a)!<evidenceInstant(b)!?-1:1).at(-1)!;
    const source: InstitutionalVolumeSource = Object.freeze({ type:'institutional_same_scope_denominator',datasetId:11370,sourceUrl:selectedRows.at(-1)!.sourceUrl,
      sourceVersion:state.revisionId,coverage:'tpex_11370_all_sessions_v1',comparableFlowCoverage:'tpex_11856_combined_sessions_v1',
      resourceMappingRevision:launchNativeContentDigest([INSTITUTIONAL_RESOURCE_MAPPING,INSTITUTIONAL_VOLUME_ATTRIBUTION]),availableAt });
    const revisionId = `institutional-volume-proof:${launchNativeContentDigest([request,binding,state.revisionId,selectedRows,flowDigest,independentCapitalRevision,source])}`;
    const proof = Object.freeze({ schema:'launch-institutional-volume-proof-v1',revisionId,source,independentCapitalRevision,
      fromSession:selectedRows[0].session,throughSession:selectedRows.at(-1)!.session,sourceAuthority:false,publicationAuthority:false,rankingAuthority:false }) as unknown as InstitutionalVolumeProof;
    proofs.set(proof,{requestDigest:binding.requestDigest,selected,selectedDigest:binding.publicDigest,revisionId,source,independentCapitalRevision,flowDigest,bindingDigest:launchNativeContentDigest(binding),
      rows:Object.freeze(selectedRows.map(row=>Object.freeze({session:row.session,shares:row.shares,availableAt:row.availableAt}))) });
    return {proof,gaps:[...state.gaps,'institutional_volume_supported_feeds_not_complete_global_action_coverage']};
  } catch { return blocked('institutional_volume_binding_invalid'); }
}
export function sumInstitutionalShares(values: readonly number[]): number | null {
  if (!values.length || !values.every(Number.isSafeInteger)) return null;
  const total=values.reduce((sum,value)=>sum+BigInt(value),BigInt(0)), bound=BigInt(Number.MAX_SAFE_INTEGER);
  return total < -bound || total > bound ? null : Number(total);
}
export function resolveInstitutionalVolumeProof(value: unknown, request: Request, selected: TwLaunchPatternReadEvidence,
  flow: LaunchChipEvidence | null | undefined) {
  try {
    const state = value && typeof value === 'object' ? proofs.get(value) : null;
    const binding = readTwLaunchInstitutionalSelection(selected,request);
    if (!state || !binding || binding.targetEvents.length || !flow || state.selected !== selected || state.requestDigest !== binding.requestDigest
      || state.bindingDigest !== launchNativeContentDigest(binding)
      || state.selectedDigest !== binding.publicDigest || state.flowDigest !== launchNativeContentDigest(flow) || !state.independentCapitalRevision
      || !state.source.resourceMappingRevision || state.source.comparableFlowCoverage !== flow.flowCoverage
      || flow.flowCoverage !== 'tpex_11856_combined_sessions_v1' || !evidenceKnownAt(state.source.availableAt, request.cutoff)
      || state.rows.length !== 20) return null;
    const sessions = selected.calendar?.sessions.slice(-20);
    if (!sessions || sessions.length !== 20 || state.rows.some((row,index)=>row.session!==sessions[index].session || !Number.isSafeInteger(row.shares) || row.shares<0
      || !evidenceKnownAt(sessions[index].closeAt,row.availableAt) || !evidenceKnownAt(row.availableAt,request.cutoff))
      || sumInstitutionalShares(state.rows.map(row=>row.shares)) === null) return null;
    return Object.freeze({ revisionId: state.revisionId, source: state.source, rows: state.rows });
  } catch { return null; }
}
/** Numeric demonstration ONLY. Never registers a denominator or grants actual
 * source/score authority, even when supplied fixture coverage labels agree. */
export function institutionalRatioFixture(netShares: readonly number[], volumeShares: readonly number[], input: {
  flowCoverage: 'synthetic_same_scope'; denominatorCoverage: 'synthetic_same_scope' | 'synthetic_different_scope';
}) {
  const net = sumInstitutionalShares(netShares);
  const volume = input.flowCoverage === input.denominatorCoverage && volumeShares.length === netShares.length
    && volumeShares.every(value=>Number.isSafeInteger(value)&&value>=0) ? sumInstitutionalShares(volumeShares) : null;
  const comparable = net !== null && volume !== null && Number.isSafeInteger(net) && Number.isSafeInteger(volume) && volume>0
    && netShares.every((row,index)=>Math.abs(row)<=volumeShares[index]);
  return { scope: 'offline_same_scope_fixture_only' as const, netShares: net !== null && Number.isSafeInteger(net) ? net : null,
    volumeShares: volume !== null && Number.isSafeInteger(volume) ? volume : null, netVolumeRatio: comparable ? net!/volume! : null,
    sourceAuthority: false as const, scoreAuthority: false as const, publicationAuthority: false as const };
}
