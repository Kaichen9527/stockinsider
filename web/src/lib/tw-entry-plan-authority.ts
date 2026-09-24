import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validAdjustedEvidence } from './generated/official-authority/official-market-authority-v314.js';
import { loadOfficialTradingCalendarV314 } from './generated/official-authority/official-calendar-v314.js';
import type { TwEntryBar, TwEntryCalendar, TwEntryPriceBasis } from './tw-entry-plan-contract.ts';

type Row = Record<string, unknown>;
type Exchange = 'TWSE' | 'TPEX';
export type TwEntryAuthorityClient = Pick<SupabaseClient, 'from'>;
export type TwEntryForwardCalendar = {
  schema: 'official-calendar-acquisition-v3.14';
  /** Actual response completion time, never the request start or a replay cutoff. */
  availableAt: string;
  calendarSessions: Row[];
};
export type TwEntryAuthorityRequest = {
  stockId: string; symbol: string; exchange: Exchange; signalSession: string; cutoff: string;
  forwardCalendar?: TwEntryForwardCalendar | null;
};
export type TwEntryAuthorityResult = {
  bars: TwEntryBar[]; calendar: TwEntryCalendar | null; priceBasis: TwEntryPriceBasis | null;
  sourceDatasetRevision: string; availableAt: string; missingData: string[];
};
const HISTORY = 240;
const DAY = 86_400_000;
const HASH = /^[0-9a-f]{64}$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const VERSION = 'tw-entry-authority-v0.1';
const FEEDS = {
  TWSE: ['twse:twt49u:v1', 'twse:twtauu:v1', 'twse:twtb8u:v1'],
  TPEX: ['tpex:exright-cal:v1', 'tpex:reduction-reference:v1', 'tpex:change-reference:v1'],
};
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const text = (value: unknown) => typeof value === 'string' ? value : '';
const timestamp = (value: unknown) => typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value)
  && Number.isFinite(Date.parse(value)) ? Date.parse(value) : NaN;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
  && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const maxTime = (...values: unknown[]) => new Date(Math.max(...values.map(timestamp))).toISOString();
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const civilTaipei = (value: unknown) => new Date(timestamp(value) + 8 * 3_600_000).toISOString().slice(0, 10);
function requireAuthority(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
function knownAt(row: Row, cutoff: string, keys = ['source_timestamp', 'collected_at', 'recorded_at']) {
  const values = keys.map((key) => timestamp(row[key]));
  return values.every((value, i) => Number.isFinite(value) && value <= timestamp(cutoff) && (i === 0 || values[i - 1] <= value));
}
function canonicalPgTimestamp(value: unknown) {
  // PostgreSQL's jsonb timestamptz representation is UTC with a numeric offset.
  // Preserve sub-millisecond digits when PostgREST supplied them.
  const raw = text(value).replace(/Z$/u, '+00:00');
  requireAuthority(Number.isFinite(timestamp(raw)) && /\+00:00$/u.test(raw), 'corporate_action_timestamp_invalid');
  return raw.replace(/\.(\d*?)0+(?=\+00:00$)/u, (_match, digits: string) => digits ? `.${digits}` : '');
}
async function readRows(query: (from: number, to: number) => PromiseLike<{ data: Row[] | null; error: unknown }>, maximum: number) {
  const rows: Row[] = [];
  for (let from = 0; from <= maximum; from += 500) {
    const count = Math.min(500, maximum + 1 - from);
    const result = await query(from, from + count - 1);
    requireAuthority(!result.error && Array.isArray(result.data), 'entry_authority_read_failed');
    rows.push(...result.data);
    requireAuthority(rows.length <= maximum, 'entry_authority_bound_exceeded');
    if (result.data.length < count) return rows;
  }
  return rows;
}
function selectedHeads(rows: Row[], key: string, clocks: string[], semantics: string[]) {
  const groups = new Map<string, Row[]>();
  for (const row of rows) {
    const id = text(row[key]);
    requireAuthority(id, 'entry_authority_identity_missing');
    groups.set(id, [...(groups.get(id) || []), row]);
  }
  return new Map([...groups].map(([id, members]) => {
    members.sort((a, b) => {
      for (const clock of clocks) { const diff = timestamp(b[clock]) - timestamp(a[clock]); if (diff) return diff; }
      return 0;
    });
    const head = members[0];
    const tied = members.filter((row) => clocks.every((clock) => timestamp(row[clock]) === timestamp(head[clock])));
    requireAuthority(tied.every((row) => semantics.every((field) => JSON.stringify(row[field]) === JSON.stringify(head[field]))), 'entry_authority_conflict');
    return [id, head];
  }));
}

/** Optional fresh acquisition for the producer, before it fixes its source cutoff.
 * The existing database calendar intentionally stores completed/cancelled only.
 * Never call this from a GET reader or retroactively use it for a historical run.
 */
export async function acquireTwEntryForwardCalendar(): Promise<TwEntryForwardCalendar | null> {
  try {
    const start = new Date().toISOString();
    const readCalendar = loadOfficialTradingCalendarV314 as unknown as (input: { cutoff: string; collectedAt: string }) => Promise<{ calendarSessions: Row[] }>;
    const result = await readCalendar({ cutoff: start, collectedAt: start });
    return { schema: 'official-calendar-acquisition-v3.14', availableAt: new Date().toISOString(), calendarSessions: [...result.calendarSessions] };
  } catch { return null; }
}

type SharedAuthority = { sessions: string[]; calendarRows: Map<string, Row>; calendarById: Map<string, Row>; snapshots: Map<string, Row>; events: Map<string, Row[]>; availableAt: string };
const sharedByClient = new WeakMap<object, Map<string, Promise<SharedAuthority>>>();
function sharedAuthority(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest) {
  let cache = sharedByClient.get(client);
  if (!cache) { cache = new Map(); sharedByClient.set(client, cache); }
  const key = `${request.exchange}:${request.signalSession}:${request.cutoff}`;
  if (!cache.has(key)) {
    if (cache.size >= 8) cache.clear();
    cache.set(key, readSharedAuthority(client, request));
  }
  return cache.get(key)!;
}
async function readSharedAuthority(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest): Promise<SharedAuthority> {
  const { exchange, cutoff, signalSession } = request;
  const lower = new Date(Date.parse(`${signalSession}T00:00:00Z`) - 550 * DAY).toISOString().slice(0, 10);
  const upper = new Date(Date.parse(`${signalSession}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10);
  const calendarRows = await readRows((from, to) => client.from('tw_trading_sessions_v3')
    .select('session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at')
    .eq('market', exchange).gte('session_id', lower).lte('session_id', upper)
    .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
    .order('session_id').order('recorded_at', { ascending: false }).order('session_authority_id').range(from, to), 20_000);
  requireAuthority(calendarRows.length, 'official_calendar_history_missing');
  for (const row of calendarRows) requireAuthority(date(row.session_id) && row.market === exchange && row.provider === exchange.toLowerCase()
    && UUID.test(text(row.session_authority_id)) && knownAt(row, cutoff)
    && ['completed', 'cancelled'].includes(text(row.status)) && timestamp(row.open_at) < timestamp(row.close_at)
    && civilTaipei(row.open_at) === row.session_id && civilTaipei(row.close_at) === row.session_id && text(row.source_ref), 'official_calendar_authority_invalid');
  const heads = selectedHeads(calendarRows, 'session_id', ['recorded_at'], ['status', 'open_at', 'close_at', 'provider', 'source_timestamp', 'collected_at', 'source_ref']);
  const sessions = [...heads].filter(([session, row]) => session <= signalSession && row.status === 'completed' && timestamp(row.close_at) <= timestamp(cutoff))
    .map(([session]) => session).sort().slice(-HISTORY);
  requireAuthority(sessions.length === HISTORY && sessions.at(-1) === signalSession, 'adjusted_history_below_240');
  const snapshots = await readRows((from, to) => client.from('opportunity_corporate_action_snapshots_v3')
    .select('snapshot_id,exchange,session_id,session_authority_id,corporate_action_version,provider,collected_at,declared_event_count,dataset_hash,recorded_at')
    .eq('exchange', exchange).gt('session_id', sessions[0]).lte('session_id', signalSession)
    .lte('collected_at', cutoff).lte('recorded_at', cutoff)
    .order('session_id').order('collected_at', { ascending: false }).order('recorded_at', { ascending: false }).order('snapshot_id').range(from, to), 10_000);
  for (const row of snapshots) requireAuthority(knownAt(row, cutoff, ['collected_at', 'recorded_at'])
    && row.exchange === exchange && row.provider === exchange.toLowerCase() && row.corporate_action_version === 'tw-corporate-action-v3.1'
    && UUID.test(text(row.snapshot_id)) && HASH.test(text(row.dataset_hash)), 'corporate_action_authority_invalid');
  const actionHeads = selectedHeads(snapshots.filter((row) => heads.get(text(row.session_id))?.session_authority_id === row.session_authority_id),
    'session_id', ['collected_at', 'recorded_at'], ['dataset_hash', 'declared_event_count', 'session_authority_id']);
  requireAuthority(sessions.slice(1).every((session) => actionHeads.has(session)), 'corporate_action_authority_missing');
  const selected = sessions.slice(1).map((session) => actionHeads.get(session)!);
  const ids = selected.map((row) => text(row.snapshot_id));
  const feeds: Row[] = []; const events: Row[] = [];
  // Keep IN URLs below common reverse-proxy request-line limits. All batches
  // still share one fixed cutoff and retain a global row bound.
  for (let start = 0; start < ids.length; start += 80) {
    const batch = ids.slice(start, start + 80);
    const [feedPage, eventPage] = await Promise.all([
      readRows((from, to) => client.from('opportunity_corporate_action_feed_evidence_v3')
        .select('snapshot_id,feed_ordinal,feed_identity,response_byte_count,response_sha256,parsed_row_count,recorded_at')
        .in('snapshot_id', batch).lte('recorded_at', cutoff).order('snapshot_id').order('feed_ordinal').range(from, to), HISTORY * 3 - feeds.length),
      readRows((from, to) => client.from('opportunity_corporate_action_events_v3')
        .select('snapshot_id,event_ordinal,symbol,event_kind,pre_action_reference_price,post_action_reference_price,feed_identity,source_row_ref,daily_adjustment_factor,recorded_at')
        .in('snapshot_id', batch).lte('recorded_at', cutoff).order('snapshot_id').order('event_ordinal').range(from, to), 30_000 - events.length),
    ]);
    feeds.push(...feedPage); events.push(...eventPage);
  }
  const eventMap = new Map<string, Row[]>();
  for (const snapshot of selected) {
    const snapshotFeeds = feeds.filter((row) => row.snapshot_id === snapshot.snapshot_id).sort((a, b) => Number(a.feed_ordinal) - Number(b.feed_ordinal));
    const snapshotEvents = events.filter((row) => row.snapshot_id === snapshot.snapshot_id).sort((a, b) => Number(a.event_ordinal) - Number(b.event_ordinal));
    requireAuthority(snapshotFeeds.length === 3 && snapshotFeeds.every((row, i) => row.feed_ordinal === i && row.feed_identity === FEEDS[exchange][i]
      && HASH.test(text(row.response_sha256)) && Number.isInteger(row.response_byte_count) && Number(row.response_byte_count) >= 0
      && Number.isInteger(row.parsed_row_count) && Number(row.parsed_row_count) >= 0 && timestamp(row.recorded_at) <= timestamp(cutoff))
      && snapshotEvents.length === snapshot.declared_event_count
      && snapshotFeeds.reduce((sum, row) => sum + Number(row.parsed_row_count), 0) === snapshotEvents.length, 'corporate_action_evidence_incomplete');
    for (let i = 0; i < snapshotEvents.length; i++) {
      const row = snapshotEvents[i];
      const kind = ['ex_right_dividend', 'capital_reduction', 'par_value_change'].indexOf(text(row.event_kind));
      requireAuthority(row.event_ordinal === i && /^\d{4}$/u.test(text(row.symbol)) && (i === 0 || text(row.symbol) > text(snapshotEvents[i - 1].symbol))
        && kind >= 0 && row.feed_identity === FEEDS[exchange][kind] && finitePositive(row.pre_action_reference_price) && finitePositive(row.post_action_reference_price)
        && finitePositive(row.daily_adjustment_factor) && Math.abs(row.daily_adjustment_factor - row.post_action_reference_price / row.pre_action_reference_price) < 1e-10
        && timestamp(row.recorded_at) <= timestamp(cutoff)
        && row.source_row_ref === hash(['corporate-action-source-row-v3.1', exchange, snapshot.session_id, row.symbol, row.event_kind,
          row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity]), 'corporate_action_event_invalid');
    }
    const feedTuples = snapshotFeeds.map((row) => [row.feed_identity, row.response_byte_count, row.response_sha256, row.parsed_row_count]);
    const eventTuples = snapshotEvents.map((row) => [row.symbol, row.event_kind, row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity, row.source_row_ref]);
    requireAuthority(snapshot.dataset_hash === hash(['corporate-action-snapshot-v3.1', exchange, snapshot.session_id, snapshot.session_authority_id,
      snapshot.corporate_action_version, snapshot.provider, canonicalPgTimestamp(snapshot.collected_at), feedTuples, eventTuples]), 'corporate_action_hash_mismatch');
    eventMap.set(text(snapshot.snapshot_id), snapshotEvents);
  }
  return { sessions, calendarRows: heads, calendarById: new Map(calendarRows.map((row) => [text(row.session_authority_id), row])), snapshots: actionHeads, events: eventMap,
    availableAt: maxTime(...sessions.map((session) => heads.get(session)!.recorded_at), ...selected.map((row) => row.recorded_at),
      ...feeds.map((row) => row.recorded_at), ...events.map((row) => row.recorded_at)) };
}

function forwardCalendar(authority: SharedAuthority, request: TwEntryAuthorityRequest): TwEntryCalendar {
  const evidence = request.forwardCalendar;
  requireAuthority(evidence?.schema === 'official-calendar-acquisition-v3.14'
    && timestamp(evidence.availableAt) <= timestamp(request.cutoff) && Array.isArray(evidence.calendarSessions)
    && evidence.calendarSessions.length <= 1200, 'official_next_session_missing');
  const forward = evidence.calendarSessions.filter((row) => row.market === request.exchange && date(row.session) && row.session >= authority.sessions[0])
    .sort((a, b) => text(a.session).localeCompare(text(b.session)));
  const byDate = new Map<string, Row>();
  for (const row of forward) {
    const sourceHash = text(row.sourceSha256);
    requireAuthority(HASH.test(sourceHash) && row.provider === request.exchange.toLowerCase()
      && row.sourceRef === `${request.exchange.toLowerCase()}-annual-calendar:${text(row.session).slice(0, 4)}:${row.session}:${sourceHash}`
      && ['completed', 'scheduled', 'holiday'].includes(text(row.status)) && timestamp(row.collectedAt) <= timestamp(evidence.availableAt)
      && timestamp(row.sourceTimestamp) <= timestamp(row.collectedAt) && !byDate.has(text(row.session)), 'official_next_calendar_invalid');
    const url = new URL(text(row.sourceUrl));
    requireAuthority(url.protocol === 'https:' && url.hostname === (request.exchange === 'TWSE' ? 'www.twse.com.tw' : 'www.tpex.org.tw'), 'official_next_calendar_invalid');
    byDate.set(text(row.session), row);
  }
  const knownCancellations: Row[] = [];
  for (let instant = Date.parse(`${authority.sessions[0]}T00:00:00Z`); instant <= Date.parse(`${request.signalSession}T00:00:00Z`); instant += DAY) {
    const day = new Date(instant); const session = day.toISOString().slice(0, 10); const row = byDate.get(session);
    if (!row && [0, 6].includes(day.getUTCDay())) continue;
    const recorded = authority.calendarRows.get(session);
    if (recorded?.status === 'cancelled') {
      requireAuthority(!authority.sessions.includes(session), 'official_calendar_history_gap');
      knownCancellations.push(recorded); continue;
    }
    requireAuthority(row && (row.status === 'holiday' || row.status === 'completed'), 'official_calendar_history_gap');
    requireAuthority(row.status === 'holiday' ? !authority.sessions.includes(session) : authority.sessions.includes(session), 'official_calendar_history_gap');
  }
  let next: Row | undefined;
  const intervening: Row[] = [];
  // The existing validated annual acquisition enumerates every weekday and omits
  // weekends. Never skip an absent weekday or synthesize an opening from one.
  for (let offset = 1; offset <= 30; offset++) {
    const instant = new Date(Date.parse(`${request.signalSession}T00:00:00Z`) + offset * DAY);
    const session = instant.toISOString().slice(0, 10);
    const row = byDate.get(session);
    if (!row && [0, 6].includes(instant.getUTCDay())) continue;
    requireAuthority(row, 'official_next_calendar_gap');
    requireAuthority(row.status === 'holiday' || row.status === 'scheduled', 'official_next_calendar_invalid');
    intervening.push(row);
    // Official ad-hoc cancellations already known at the cutoff override the
    // annual schedule (for example an announced exchange closure).
    const recorded = authority.calendarRows.get(session);
    if (recorded?.status === 'cancelled') { knownCancellations.push(recorded); continue; }
    if (row.status === 'scheduled') { next = row; break; }
  }
  requireAuthority(next && timestamp(next.openAt) < timestamp(next.scheduledCloseAt)
    && civilTaipei(next.openAt) === next.session && civilTaipei(next.scheduledCloseAt) === next.session, 'official_next_session_missing');
  const signal = authority.calendarRows.get(request.signalSession)!;
  requireAuthority(timestamp(signal.close_at) < timestamp(next.openAt), 'official_next_calendar_invalid');
  return {
    version: `${VERSION}:${hash([authority.sessions.map((session) => [session, authority.calendarRows.get(session)!.session_authority_id]), intervening, knownCancellations])}`,
    knownAt: maxTime(evidence.availableAt, ...authority.sessions.map((session) => authority.calendarRows.get(session)!.recorded_at), ...knownCancellations.map((row) => row.recorded_at)),
    completedSessions: [...authority.sessions], signalSession: request.signalSession, signalCloseAt: text(signal.close_at),
    nextSession: text(next.session), nextOpenAt: text(next.openAt), nextCloseAt: text(next.scheduledCloseAt),
  };
}

/** Read-only producer adapter. Missing authority becomes an attachment data gap,
 * never a replacement of the candidate's existing formal policy or raw chart. */
export async function loadTwEntryPlanAuthority(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest): Promise<TwEntryAuthorityResult> {
  const base: TwEntryAuthorityResult = { bars: [], calendar: null, priceBasis: null, sourceDatasetRevision: `${VERSION}:unavailable`,
    availableAt: request.cutoff, missingData: [] };
  try {
    requireAuthority(UUID.test(request.stockId) && /^\d{4}$/u.test(request.symbol) && ['TWSE', 'TPEX'].includes(request.exchange)
      && date(request.signalSession) && Number.isFinite(timestamp(request.cutoff)), 'entry_authority_request_invalid');
    const shared = await sharedAuthority(client, request);
    // The existing authority proves price factors, not share-volume factors.
    // A recent split/reduction can make raw volume ratios incomparable; do not
    // infer a share adjustment from a price adjustment (cash events differ).
    const volumeBasisChanged = shared.sessions.slice(-21).some((session) => {
      const snapshot = shared.snapshots.get(session);
      return snapshot && (shared.events.get(text(snapshot.snapshot_id)) || []).some((event) => event.symbol === request.symbol
        && ['capital_reduction', 'par_value_change'].includes(text(event.event_kind)));
    });
    requireAuthority(!volumeBasisChanged, 'volume_basis_changed_within_lookback');
    const { cutoff, stockId, exchange, signalSession } = request;
    const raw = await readRows((from, to) => client.from('opportunity_price_observations_v3')
      .select('observation_id,stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,raw_close,volume,provider,source_timestamp,collected_at,source_ref,recorded_at')
      .eq('stock_id', stockId).eq('exchange', exchange).eq('provider', exchange.toLowerCase())
      .gte('session_id', shared.sessions[0]).lte('session_id', signalSession)
      .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
      .order('session_id').order('source_timestamp', { ascending: false }).order('collected_at', { ascending: false })
      .order('recorded_at', { ascending: false }).order('observation_id').range(from, to), 4000);
    for (const row of raw) requireAuthority(knownAt(row, cutoff) && row.stock_id === stockId && row.exchange === exchange
      && row.provider === exchange.toLowerCase() && UUID.test(text(row.observation_id))
      && text(row.source_ref).startsWith(`${exchange.toLowerCase()}-`)
      && shared.calendarById.get(text(row.session_authority_id))?.session_id === row.session_id
      && shared.calendarById.get(text(row.session_authority_id))?.status === 'completed',
    'raw_price_authority_invalid');
    const heads = selectedHeads(raw, 'session_id', ['source_timestamp', 'collected_at', 'recorded_at'],
      ['raw_open', 'raw_high', 'raw_low', 'raw_close', 'volume', 'session_authority_id']);
    requireAuthority(shared.sessions.every((session) => heads.has(session)), 'adjusted_history_below_240');
    const evidenceHashes: string[] = [];
    const bars = shared.sessions.map((session) => {
      const row = heads.get(session)!;
      requireAuthority(typeof row.volume === 'number' && Number.isFinite(row.volume) && row.volume >= 0
        && timestamp(row.source_timestamp) >= timestamp(shared.calendarRows.get(session)!.close_at), 'raw_price_authority_invalid');
      const actionDays = shared.sessions.filter((day) => day > session).map((day) => {
        const snapshot = shared.snapshots.get(day)!;
        const action = shared.events.get(text(snapshot.snapshot_id))!.find((event) => event.symbol === request.symbol);
        return [day, snapshot.session_authority_id, snapshot.snapshot_id, snapshot.dataset_hash,
          action ? [action.event_kind, action.pre_action_reference_price, action.post_action_reference_price, action.feed_identity, action.source_row_ref] : null,
          action?.daily_adjustment_factor ?? 1];
      });
      const factor = actionDays.reduce((product, member) => product * Number(member[5]), 1);
      const adjusted = [row.raw_open, row.raw_high, row.raw_low, row.raw_close].map((value) => Number(value) * factor);
      const evidence = ['adjusted-price-evidence-v3.1', signalSession, row.observation_id, row.source_ref, row.session_authority_id,
        row.raw_open, row.raw_high, row.raw_low, row.raw_close, actionDays, factor, ...adjusted];
      const ref = hash(evidence);
      const candidate = { session, exchange, open: adjusted[0], high: adjusted[1], low: adjusted[2], close: adjusted[3],
        rawSourceRef: row.source_ref, rawSourceUrl: exchange === 'TWSE' ? 'https://www.twse.com.tw/' : 'https://www.tpex.org.tw/', adjustmentEvidence: evidence, adjustmentEvidenceRef: ref };
      const validateEvidence = validAdjustedEvidence as unknown as (row: unknown, sessions: Set<string>) => boolean;
      requireAuthority(validateEvidence(candidate, new Set(shared.sessions)), 'adjusted_price_evidence_invalid');
      evidenceHashes.push(ref);
      // Every historical point on the signal-session scale becomes knowable only
      // after the final action snapshot, even when its raw bar is much older.
      return { session, open: adjusted[0], high: adjusted[1], low: adjusted[2], close: adjusted[3], volume: row.volume,
        availableAt: maxTime(row.recorded_at, shared.availableAt), sourceRef: ref };
    });
    const priceBasis: TwEntryPriceBasis = { kind: 'adjusted_to_signal_session', anchorSession: signalSession,
      adjustmentVersion: 'tw-corporate-action-v3.1', adjustmentEvidenceHash: hash(evidenceHashes), status: 'verified' };
    const calendar = forwardCalendar(shared, request);
    return { bars, calendar, priceBasis, sourceDatasetRevision: `${VERSION}:${hash([evidenceHashes, calendar.version])}`,
      availableAt: maxTime(calendar.knownAt, ...bars.map((bar) => bar.availableAt)), missingData: [] };
  } catch (error) {
    return { ...base, missingData: [error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : 'entry_authority_read_failed'] };
  }
}
