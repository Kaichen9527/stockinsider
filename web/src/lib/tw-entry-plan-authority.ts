import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { validAdjustedEvidence } from './generated/official-authority/official-market-authority-v314.js';
import { loadOfficialTradingCalendarV314 } from './generated/official-authority/official-calendar-v314.js';
import type { LaunchOutcomeInput } from './vnext/launch-outcomes.ts';
import type { TwEntryBar, TwEntryCalendar, TwEntryPriceBasis } from './tw-entry-plan-contract.ts';
import {evidenceInstant, evidenceKnownAt, compareEvidenceClocks} from './vnext/evidence-clock.ts';

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
const maxTime = (...values: unknown[]) => {
  const latest = [...values].sort(compareEvidenceClocks).at(-1);
  requireAuthority(typeof latest === 'string' && evidenceInstant(latest) !== null, 'entry_authority_clock_invalid');
  // Keep established millisecond serialization; never truncate a PostgreSQL
  // microsecond maximum into an earlier availability time.
  return evidenceInstant(latest)! % BigInt(1000) === BigInt(0) ? new Date(timestamp(latest)).toISOString() : latest;
};
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const civilTaipei = (value: unknown) => new Date(timestamp(value) + 8 * 3_600_000).toISOString().slice(0, 10);
function requireAuthority(ok: unknown, code: string): asserts ok { if (!ok) throw new Error(code); }
function knownAt(row: Row, cutoff: string, keys = ['source_timestamp', 'collected_at', 'recorded_at']) {
  return keys.every((key, i) => evidenceKnownAt(row[key], cutoff)
    && (i === 0 || compareEvidenceClocks(row[keys[i - 1]], row[key]) <= 0));
}
function canonicalPgTimestamp(value: unknown) {
  // PostgreSQL's jsonb timestamptz representation is UTC with a numeric offset.
  // Preserve sub-millisecond digits when PostgREST supplied them.
  const raw = text(value).replace(/Z$/u, '+00:00');
  requireAuthority(evidenceInstant(raw) !== null && /\+00:00$/u.test(raw), 'corporate_action_timestamp_invalid');
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
      for (const clock of clocks) { const diff = compareEvidenceClocks(b[clock], a[clock]); if (diff) return diff; }
      return 0;
    });
    const head = members[0];
    const tied = members.filter((row) => clocks.every((clock) => compareEvidenceClocks(row[clock], head[clock]) === 0));
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
  requireAuthority(evidenceKnownAt(request.cutoff, new Date().toISOString()), 'entry_authority_request_invalid');
  let cache = sharedByClient.get(client);
  if (!cache) { cache = new Map(); sharedByClient.set(client, cache); }
  const key = `${request.exchange}:${request.signalSession}:${request.cutoff}`;
  if (!cache.has(key)) {
    if (cache.size >= 8) cache.clear();
    cache.set(key, readSharedAuthority(client, request));
  }
  return cache.get(key)!;
}
async function readCalendarSelection(client: TwEntryAuthorityClient, exchange: Exchange, cutoff: string, lower: string, upper: string) {
  const calendarRows = await readRows((from, to) => client.from('tw_trading_sessions_v3')
    .select('session_authority_id,session_id,market,open_at,close_at,status,provider,source_timestamp,collected_at,source_ref,recorded_at')
    .eq('market', exchange).gte('session_id', lower).lte('session_id', upper)
    .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
    .order('session_id').order('recorded_at', { ascending: false }).order('session_authority_id').range(from, to), 20_000);
  for (const row of calendarRows) requireAuthority(date(row.session_id) && row.market === exchange && row.provider === exchange.toLowerCase()
    && UUID.test(text(row.session_authority_id)) && knownAt(row, cutoff)
    && ['completed', 'cancelled'].includes(text(row.status)) && evidenceInstant(row.open_at) !== null && evidenceInstant(row.close_at) !== null && compareEvidenceClocks(row.open_at, row.close_at) < 0
    && civilTaipei(row.open_at) === row.session_id && civilTaipei(row.close_at) === row.session_id && text(row.source_ref), 'official_calendar_authority_invalid');
  const heads = selectedHeads(calendarRows, 'session_id', ['recorded_at'], ['status', 'open_at', 'close_at', 'provider', 'source_timestamp', 'collected_at', 'source_ref']);
  return { rows: calendarRows, heads };
}

async function readActionSelection(client: TwEntryAuthorityClient, exchange: Exchange, cutoff: string, anchor: string, sessions: string[], heads: Map<string, Row>) {
  if (!sessions.length) return { actionHeads: new Map<string, Row>(), eventMap: new Map<string, Row[]>(),
    selected: [], feeds: [], events: [] };
  const snapshots = await readRows((from, to) => client.from('opportunity_corporate_action_snapshots_v3')
    .select('snapshot_id,exchange,session_id,session_authority_id,corporate_action_version,provider,collected_at,declared_event_count,dataset_hash,recorded_at')
    .eq('exchange', exchange).gt('session_id', anchor).lte('session_id', sessions.at(-1)!)
    .lte('collected_at', cutoff).lte('recorded_at', cutoff)
    .order('session_id').order('collected_at', { ascending: false }).order('recorded_at', { ascending: false }).order('snapshot_id').range(from, to), 10_000);
  for (const row of snapshots) requireAuthority(knownAt(row, cutoff, ['collected_at', 'recorded_at'])
    && row.exchange === exchange && row.provider === exchange.toLowerCase() && row.corporate_action_version === 'tw-corporate-action-v3.1'
    && UUID.test(text(row.snapshot_id)) && HASH.test(text(row.dataset_hash)), 'corporate_action_authority_invalid');
  const actionHeads = selectedHeads(snapshots.filter((row) => heads.get(text(row.session_id))?.session_authority_id === row.session_authority_id),
    'session_id', ['collected_at', 'recorded_at'], ['dataset_hash', 'declared_event_count', 'session_authority_id']);
  requireAuthority(sessions.every((session) => actionHeads.has(session)), 'corporate_action_authority_missing');
  const selected = sessions.map((session) => actionHeads.get(session)!);
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
      && Number.isInteger(row.parsed_row_count) && Number(row.parsed_row_count) >= 0 && knownAt(row, cutoff, ['recorded_at']))
      && snapshotEvents.length === snapshot.declared_event_count
      && snapshotFeeds.reduce((sum, row) => sum + Number(row.parsed_row_count), 0) === snapshotEvents.length, 'corporate_action_evidence_incomplete');
    for (let i = 0; i < snapshotEvents.length; i++) {
      const row = snapshotEvents[i];
      const kind = ['ex_right_dividend', 'capital_reduction', 'par_value_change'].indexOf(text(row.event_kind));
      requireAuthority(row.event_ordinal === i && /^[0-9A-Za-z]{2,12}$/u.test(text(row.symbol)) && (i === 0 || text(row.symbol) > text(snapshotEvents[i - 1].symbol))
        && kind >= 0 && row.feed_identity === FEEDS[exchange][kind] && finitePositive(row.pre_action_reference_price) && finitePositive(row.post_action_reference_price)
        && finitePositive(row.daily_adjustment_factor) && Math.abs(row.daily_adjustment_factor - row.post_action_reference_price / row.pre_action_reference_price) < 1e-10
        && knownAt(row, cutoff, ['recorded_at'])
        && row.source_row_ref === hash(['corporate-action-source-row-v3.1', exchange, snapshot.session_id, row.symbol, row.event_kind,
          row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity]), 'corporate_action_event_invalid');
    }
    const feedTuples = snapshotFeeds.map((row) => [row.feed_identity, row.response_byte_count, row.response_sha256, row.parsed_row_count]);
    const eventTuples = snapshotEvents.map((row) => [row.symbol, row.event_kind, row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity, row.source_row_ref]);
    requireAuthority(snapshot.dataset_hash === hash(['corporate-action-snapshot-v3.1', exchange, snapshot.session_id, snapshot.session_authority_id,
      snapshot.corporate_action_version, snapshot.provider, canonicalPgTimestamp(snapshot.collected_at), feedTuples, eventTuples]), 'corporate_action_hash_mismatch');
    eventMap.set(text(snapshot.snapshot_id), snapshotEvents);
  }
  return { actionHeads, eventMap, selected, feeds, events };
}

async function readSharedAuthority(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest): Promise<SharedAuthority> {
  const { exchange, cutoff, signalSession } = request;
  const lower = new Date(Date.parse(`${signalSession}T00:00:00Z`) - 550 * DAY).toISOString().slice(0, 10);
  const upper = new Date(Date.parse(`${signalSession}T00:00:00Z`) + 30 * DAY).toISOString().slice(0, 10);
  const { rows: calendarRows, heads } = await readCalendarSelection(client, exchange, cutoff, lower, upper);
  requireAuthority(calendarRows.length, 'official_calendar_history_missing');
  const sessions = [...heads].filter(([session, row]) => session <= signalSession && row.status === 'completed' && evidenceKnownAt(row.close_at, cutoff))
    .map(([session]) => session).sort().slice(-HISTORY);
  requireAuthority(sessions.length === HISTORY && sessions.at(-1) === signalSession, 'adjusted_history_below_240');
  const { actionHeads, eventMap, selected, feeds, events } = await readActionSelection(client, exchange, cutoff, sessions[0], sessions.slice(1), heads);
  return { sessions, calendarRows: heads, calendarById: new Map(calendarRows.map((row) => [text(row.session_authority_id), row])), snapshots: actionHeads, events: eventMap,
    availableAt: maxTime(...sessions.map((session) => heads.get(session)!.recorded_at), ...selected.map((row) => row.recorded_at),
      ...feeds.map((row) => row.recorded_at), ...events.map((row) => row.recorded_at)) };
}

function selectAnnualCalendar(request: TwEntryAuthorityRequest, lower: string) {
  const evidence = request.forwardCalendar;
  requireAuthority(evidence?.schema === 'official-calendar-acquisition-v3.14'
    && evidenceKnownAt(evidence.availableAt, request.cutoff) && Array.isArray(evidence.calendarSessions)
    && evidence.calendarSessions.length <= 1200, 'official_next_session_missing');
  const forward = evidence.calendarSessions.filter((row) => row.market === request.exchange && date(row.session) && row.session >= lower)
    .sort((a, b) => text(a.session).localeCompare(text(b.session)));
  const byDate = new Map<string, Row>();
  for (const row of forward) {
    const sourceHash = text(row.sourceSha256);
    requireAuthority(HASH.test(sourceHash) && row.provider === request.exchange.toLowerCase()
      && row.sourceRef === `${request.exchange.toLowerCase()}-annual-calendar:${text(row.session).slice(0, 4)}:${row.session}:${sourceHash}`
      && ['completed', 'scheduled', 'holiday'].includes(text(row.status)) && evidenceKnownAt(row.collectedAt, evidence.availableAt)
      && evidenceKnownAt(row.sourceTimestamp, text(row.collectedAt)) && !byDate.has(text(row.session)), 'official_next_calendar_invalid');
    const url = new URL(text(row.sourceUrl));
    requireAuthority(url.protocol === 'https:' && url.hostname === (request.exchange === 'TWSE' ? 'www.twse.com.tw' : 'www.tpex.org.tw'), 'official_next_calendar_invalid');
    byDate.set(text(row.session), row);
  }
  return { evidence, byDate };
}

function forwardCalendar(authority: SharedAuthority, request: TwEntryAuthorityRequest): TwEntryCalendar {
  const { evidence, byDate } = selectAnnualCalendar(request, authority.sessions[0]);
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
  requireAuthority(next && evidenceInstant(next.openAt) !== null && evidenceInstant(next.scheduledCloseAt) !== null && compareEvidenceClocks(next.openAt, next.scheduledCloseAt) < 0
    && civilTaipei(next.openAt) === next.session && civilTaipei(next.scheduledCloseAt) === next.session, 'official_next_session_missing');
  const signal = authority.calendarRows.get(request.signalSession)!;
  requireAuthority(compareEvidenceClocks(signal.close_at, next.openAt) < 0, 'official_next_calendar_invalid');
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

export type TwEntryHistoricalAuthorityResult={notEntryAuthority:true;nextSessionAuthority:false;completedSessions:string[];bars:Array<TwEntryBar & {observationId:string;rawClose:number;sourceTimestamp:string;recordedAt:string;sourceUrl:string}>;priceBasis:TwEntryPriceBasis|null;sourceDatasetRevision:string;availableAt:string;missingData:string[]};
/** Read-only historical comparison authority. It grants no next-session entry
 * authority and never fetches a calendar, prices or corporate actions. */
export async function loadTwEntryHistoricalPriceAuthority(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest): Promise<TwEntryHistoricalAuthorityResult> {
  const base: TwEntryHistoricalAuthorityResult = { notEntryAuthority:true,nextSessionAuthority:false,completedSessions:[],bars: [], priceBasis: null, sourceDatasetRevision: `${VERSION}:unavailable`,
    availableAt: request.cutoff, missingData: [] };
  try {
    requireAuthority(UUID.test(request.stockId) && /^\d{4}$/u.test(request.symbol) && ['TWSE', 'TPEX'].includes(request.exchange)
      && date(request.signalSession) && evidenceKnownAt(request.cutoff, new Date().toISOString()), 'entry_authority_request_invalid');
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
        && evidenceKnownAt(shared.calendarRows.get(session)!.close_at, text(row.source_timestamp)), 'raw_price_authority_invalid');
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
        availableAt: maxTime(row.recorded_at, shared.availableAt), sourceRef: ref,observationId:text(row.observation_id),rawClose:Number(row.raw_close),sourceTimestamp:text(row.source_timestamp),recordedAt:text(row.recorded_at),sourceUrl:exchange==='TWSE'?'https://www.twse.com.tw/':'https://www.tpex.org.tw/' };
    });
    const priceBasis: TwEntryPriceBasis = { kind: 'adjusted_to_signal_session', anchorSession: signalSession,
      adjustmentVersion: 'tw-corporate-action-v3.1', adjustmentEvidenceHash: hash(evidenceHashes), status: 'verified' };
    return {notEntryAuthority:true,nextSessionAuthority:false,completedSessions:[...shared.sessions],bars,priceBasis,sourceDatasetRevision:`${VERSION}:historical:${hash(evidenceHashes)}`,availableAt:maxTime(shared.availableAt,...bars.map((bar)=>bar.availableAt)),missingData:[]};
  } catch (error) {
    return { ...base, missingData: [error instanceof Error && /^[a-z0-9_]+$/u.test(error.message) ? error.message : 'entry_authority_read_failed'] };
  }
}

type LaunchOutcomeSignalRow = Omit<LaunchOutcomeInput['signal'], 'normalizedClose'> & {
  stockId: string;
  closeObservationId: string;
  calendarAuthorityId: string;
  calendarRevision: string;
  actionsRevision: string;
  publishedAt: string;
};

const OUTCOME_SCALE = BigInt(100_000_000);
function outcomePriceUnits(value: unknown): bigint {
  requireAuthority(finitePositive(value) && value < 1e12 && Number(value.toFixed(8)) === value, 'launch_outcome_raw_price_precision');
  return BigInt(value.toFixed(8).replace('.', ''));
}
function outcomePrice(value: unknown, numerator = BigInt(1), denominator = BigInt(1)) {
  const units = (outcomePriceUnits(value) * numerator + denominator / BigInt(2)) / denominator;
  requireAuthority(units > BigInt(0) && units < OUTCOME_SCALE * BigInt(1e12), 'launch_outcome_adjusted_price_precision');
  return `${units / OUTCOME_SCALE}.${String(units % OUTCOME_SCALE).padStart(8, '0')}`;
}

async function readOutcomePrices(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest,
  anchor: LaunchOutcomeSignalRow, calendarRows: Row[], selected: string[]) {
  const { stockId, exchange, cutoff, signalSession } = request;
  const byId = new Map(calendarRows.map(row => [row.session_authority_id, row]));
  const closes = new Set([signalSession, ...selected]);
  const result = await readRows((from, to) => client.from('opportunity_price_observations_v3')
    .select('observation_id,stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,raw_close,provider,source_timestamp,collected_at,source_ref,recorded_at')
    .eq('stock_id', stockId).eq('exchange', exchange).eq('provider', exchange.toLowerCase())
    .gte('session_id', signalSession).lte('session_id', selected.at(-1) ?? signalSession)
    .lte('source_timestamp', cutoff).lte('collected_at', cutoff).lte('recorded_at', cutoff)
    .order('session_id').order('source_timestamp', { ascending: false }).order('collected_at', { ascending: false })
    .order('recorded_at', { ascending: false }).order('observation_id').range(from, to), 2400);
  const rows = result.filter(row => closes.has(text(row.session_id)));
  for (const row of rows) {
    const calendar = byId.get(row.session_authority_id);
    requireAuthority(row.stock_id === stockId && row.exchange === exchange && row.provider === exchange.toLowerCase()
      && UUID.test(text(row.observation_id)) && text(row.source_ref).startsWith(`${exchange.toLowerCase()}-`)
      && knownAt(row, cutoff) && calendar && calendar.session_id === row.session_id && calendar.status === 'completed'
      && evidenceKnownAt(calendar.close_at, text(row.source_timestamp)), 'launch_outcome_raw_price_authority');
  }
  const frozen = rows.find(row => row.observation_id === anchor.closeObservationId);
  requireAuthority(frozen && frozen.session_id === signalSession && frozen.session_authority_id === anchor.calendarAuthorityId
    && knownAt(frozen, anchor.cutoff) && knownAt(byId.get(anchor.calendarAuthorityId)!, anchor.cutoff)
    && outcomePrice(frozen.raw_close) === outcomePrice(Number(anchor.rawClose)), 'launch_outcome_frozen_close_mismatch');
  return { frozen, rows };
}

/** Reads only official cache rows and the annual calendar evidence. Call from
 * the writer with a trusted immutable signal row. The quote/corporate-action
 * basis is pinned to the observation cutoff and never modifies the signal.
 * OHLC alone conveys no opening execution eligibility. */
export async function loadTwLaunchOutcomeInput(client: TwEntryAuthorityClient,
  anchor: LaunchOutcomeSignalRow, asOf: string, annual: TwEntryForwardCalendar): Promise<LaunchOutcomeInput> {
  const { stockId, symbol, market, session: signalSession, cutoff } = anchor;
  requireAuthority([stockId, anchor.calendarAuthorityId, anchor.closeObservationId, anchor.rankingRunId, anchor.firstRankingRunId].every(id => UUID.test(id))
    && [anchor.actionsRevision, anchor.calendarRevision, anchor.priceRevision, anchor.inputHash].every(revision => HASH.test(revision))
    && /^\d{4}$/u.test(symbol) && ['TWSE', 'TPEX'].includes(market) && date(signalSession)
    && /^(?:0|[1-9]\d{0,11})(?:\.\d{1,8})?$/u.test(anchor.rawClose)
    && evidenceKnownAt(cutoff, anchor.publishedAt) && evidenceKnownAt(anchor.publishedAt, asOf)
    && evidenceKnownAt(asOf, new Date().toISOString()), 'launch_outcome_authority_request');
  const request: TwEntryAuthorityRequest = { stockId, symbol, exchange: market, signalSession, cutoff: asOf, forwardCalendar: annual };
  const upper = new Date(Date.parse(`${signalSession}T00:00:00Z`) + 370 * DAY).toISOString().slice(0, 10);
  const { byDate } = selectAnnualCalendar(request, signalSession);
  const { rows: calendarRows, heads } = await readCalendarSelection(client, market, asOf, signalSession, upper);
  const sessions: LaunchOutcomeInput['sessions'] = [];
  const pins: Array<{ day: string; annual: Row; recorded: Row | null }> = [];
  const completed: string[] = [];
  let positions = 0;
  for (let current = Date.parse(`${signalSession}T00:00:00Z`) + DAY; current <= Date.parse(`${upper}T00:00:00Z`); current += DAY) {
    const civil = new Date(current);
    const day = civil.toISOString().slice(0, 10);
    const planned = byDate.get(day);
    const recorded = heads.get(day);
    if (!planned && !recorded && [0, 6].includes(civil.getUTCDay())) continue;
    requireAuthority(planned, 'launch_outcome_annual_calendar_gap');
    pins.push({ day, annual: planned, recorded: recorded ?? null });
    if (planned.status === 'holiday') {
      requireAuthority(recorded?.status !== 'completed', 'launch_outcome_calendar_conflict');
      continue;
    }
    const openAt = text(recorded?.open_at ?? planned.openAt);
    const closeAt = text(recorded?.close_at ?? planned.scheduledCloseAt);
    requireAuthority(evidenceKnownAt(openAt, closeAt) && compareEvidenceClocks(openAt, closeAt) < 0
      && civilTaipei(openAt) === day && civilTaipei(closeAt) === day, 'launch_outcome_calendar_clocks');
    const status = recorded?.status === 'cancelled' ? 'cancelled'
      : recorded?.status === 'completed' && evidenceKnownAt(closeAt, text(recorded.recorded_at)) ? 'completed' : 'scheduled';
    requireAuthority(recorded?.status !== 'completed' || status === 'completed', 'launch_outcome_early_calendar_observation');
    sessions.push({ session: day, openAt, closeAt, status, knownAt: maxTime(annual.availableAt, ...(recorded ? [recorded.recorded_at] : [])) });
    if (status === 'cancelled') continue;
    positions++;
    // Keep the first unresolved session in the sequence. A later quote cannot
    // bridge it, since an unseen corporate action would change the price basis.
    if (status !== 'completed') break;
    completed.push(day);
    if (positions === 120) break;
  }
  requireAuthority((positions === 120 || sessions.at(-1)?.status === 'scheduled') && sessions.length <= 180, 'launch_outcome_calendar_window_missing');

  const { actionHeads, eventMap, selected, feeds, events } = await readActionSelection(client, market, asOf, signalSession, completed, heads);
  const { frozen, rows } = await readOutcomePrices(client, request, anchor, calendarRows, completed);
  const forwardPrices = selectedHeads(rows.filter(row => completed.includes(text(row.session_id))
    && heads.get(text(row.session_id))?.session_authority_id === row.session_authority_id),
    'session_id', ['source_timestamp', 'collected_at', 'recorded_at'], ['raw_open', 'raw_high', 'raw_low', 'raw_close', 'session_authority_id']);
  const basisRevision = hash(['tw-launch-outcome-price-basis-v1', market, symbol, anchor.closeObservationId, anchor.actionsRevision,
    completed.map(day => {
      const snapshot = actionHeads.get(day)!;
      return [day, snapshot.snapshot_id, snapshot.session_authority_id, snapshot.dataset_hash];
    })]);
  const actionsKnownAt = maxTime(anchor.cutoff, ...selected.map(row => row.recorded_at), ...feeds.map(row => row.recorded_at), ...events.map(row => row.recorded_at));
  const bars: LaunchOutcomeInput['bars'] = [];
  let numerator = BigInt(1), denominator = BigInt(1);
  for (const day of [...completed].reverse()) {
    const row = forwardPrices.get(day);
    if (row) bars.unshift({ session: day, basisRevision,
      priceRevision: hash(['tw-launch-outcome-official-price-v1', row]),
      availableAt: maxTime(row.recorded_at, heads.get(day)!.recorded_at, actionsKnownAt),
      rawOpen: outcomePrice(row.raw_open), open: outcomePrice(row.raw_open, numerator, denominator),
      high: outcomePrice(row.raw_high, numerator, denominator), low: outcomePrice(row.raw_low, numerator, denominator),
      close: outcomePrice(row.raw_close, numerator, denominator) });
    const snapshot = actionHeads.get(day)!;
    const event = eventMap.get(text(snapshot.snapshot_id))!.find(item => item.symbol === symbol);
    if (event) {
      numerator *= outcomePriceUnits(event.post_action_reference_price);
      denominator *= outcomePriceUnits(event.pre_action_reference_price);
    }
  }
  return {
    scope: 'published_rank', asOf, basisRevision, sessions, bars, opening: null,
    calendarRevision: hash(['tw-launch-outcome-calendar-v1', anchor.calendarRevision, pins]),
    signal: { rankingRunId: anchor.rankingRunId, firstRankingRunId: anchor.firstRankingRunId, symbol, market,
      session: signalSession, cutoff, inputHash: anchor.inputHash, priceRevision: anchor.priceRevision,
      rawClose: anchor.rawClose, normalizedClose: outcomePrice(frozen.raw_close, numerator, denominator) },
  };
}

/** Additive selected-cache evidence for Launch Radar arithmetic. Existing
 * selectors retain their original bounds, price gate and return contracts.
 * Protocol validation does not prove external acquisition or publication. */
import { types as launchNativeNodeTypes } from 'node:util';
export type TwLaunchPatternReadEvidence = {
  scope: 'selected_cache_protocol_evidence'; sourceAuthority: false; publicationAuthority: false; entryAuthority: false;
  history: TwEntryHistoricalAuthorityResult;
  calendar: null | {
    status: 'validated_selected_window' | 'selected_rows_only'; revisionId: string; availableAt: string;
    sessions: Array<{ session: string; closeAt: string; authorityId: string; sourceRef: string;
      sourceTimestamp: string; collectedAt: string; recordedAt: string }>;
  };
  corporateActions: null | { revisionId: string; version: 'tw-corporate-action-v3.1'; availableAt: string;
    snapshots: Array<{ session: string; snapshotId: string; sessionAuthorityId: string; datasetHash: string;
      collectedAt: string; recordedAt: string }> };
  shareVolume: null | { revisionId: string; sourceDatasetRevision: string; availableAt: string;
    fromSession: string; throughSession: string; snapshotIds: string[]; status: 'no_candidate_events_in_selected_51';
    coverage?: 'supported_feeds_only'; completeCapitalCoverage?: false };
  missingData: string[];
};

type LaunchShared = Awaited<ReturnType<typeof sharedAuthority>>;
/** New additive digests inspect data descriptors and encode owned primitive
 * values directly. No serialization hook/accessor/custom prototype is invoked. */
export function launchNativeContentDigest(value: unknown): string {
  let nodes = 0; const ancestors = new Set<object>();
  const encode = (item: unknown, depth: number): string => {
    requireAuthority(++nodes <= 100000 && depth <= 32, 'native_volume_digest_bound');
    if (item === null || typeof item === 'boolean') return String(item);
    if (typeof item === 'string') { requireAuthority(item.length <= 524288, 'native_volume_digest_bound'); return JSON.stringify(item); }
    if (typeof item === 'number') { requireAuthority(Number.isFinite(item), 'native_volume_digest_invalid'); return JSON.stringify(item); }
    requireAuthority(typeof item === 'object' && item !== null && !ancestors.has(item), 'native_volume_digest_invalid');
    requireAuthority(!launchNativeNodeTypes.isProxy(item), 'native_volume_digest_invalid');
    const prototype = Object.getPrototypeOf(item);
    requireAuthority(Array.isArray(item) ? prototype === Array.prototype : prototype === Object.prototype || prototype === null, 'native_volume_digest_invalid');
    ancestors.add(item);
    try {
      const keys = Reflect.ownKeys(item);
      requireAuthority(keys.every(key => typeof key === 'string') && !keys.includes('toJSON'), 'native_volume_digest_invalid');
      if (Array.isArray(item)) {
        const length = Object.getOwnPropertyDescriptor(item, 'length')?.value;
        requireAuthority(Number.isSafeInteger(length) && length >= 0 && length <= 10000 && keys.length === length + 1, 'native_volume_digest_invalid');
        const values: string[] = [];
        for (let index = 0; index < length; index++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, String(index));
          requireAuthority(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'native_volume_digest_invalid');
          values.push(encode(descriptor.value, depth + 1));
        }
        return `[${values.join(',')}]`;
      }
      const values: string[] = [];
      for (const key of (keys as string[]).sort()) {
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        requireAuthority(descriptor && descriptor.enumerable && Object.hasOwn(descriptor, 'value'), 'native_volume_digest_invalid');
        values.push(`${JSON.stringify(key)}:${encode(descriptor.value, depth + 1)}`);
      }
      return `{${values.join(',')}}`;
    } finally { ancestors.delete(item); }
  };
  const encoded = encode(value, 0);
  requireAuthority(Buffer.byteLength(encoded) <= 2 * 1024 * 1024, 'native_volume_digest_bound');
  return createHash('sha256').update(encoded).digest('hex');
}
const launchSelections = new WeakMap<object, { requestDigest: string; publicDigest: string;
  history: TwEntryHistoricalAuthorityResult; shared: LaunchShared }>();
export type TwLaunchNativePriceBinding = Readonly<{
  requestDigest: string; publicDigest: string; priceRevision: string; calendarRevision: string; actionsRevision: string;
  availableAt: string; snapshotIds: readonly string[];
  rows: readonly Readonly<{ session: string; observationId: string; sourceRef: string; calendarId: string;
    rawOpen: number; rawHigh: number; rawLow: number; rawClose: number; factor: 1; legacyVolume: number;
    sourceTimestamp: string; recordedAt: string; availableAt: string }>[];
}>;
const launchNativeBindings = new WeakMap<object, TwLaunchNativePriceBinding>();

export async function loadTwLaunchPatternReadEvidence(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest): Promise<TwLaunchPatternReadEvidence> {
  const history = await loadTwEntryHistoricalPriceAuthority(client, request);
  const result: TwLaunchPatternReadEvidence = { scope: 'selected_cache_protocol_evidence', sourceAuthority: false,
    publicationAuthority: false, entryAuthority: false, history, calendar: null, corporateActions: null, shareVolume: null,
    missingData: [...history.missingData] };
  if (history.missingData.length) return result;
  const gap = (error: unknown) => error instanceof Error && /^[a-z0-9_]+$/u.test(error.message)
    ? error.message : 'launch_selected_evidence_read_failed';
  let selectedShared: LaunchShared | null = null;
  try {
    // Reuse exactly the same cutoff-bound selected maps, including complete
    // three-feed receipts/hash checks for all239 price-adjustment transitions.
    const shared = await sharedAuthority(client, request);
    selectedShared = shared;
    const sessions = shared.sessions.map((session) => {
      const row = shared.calendarRows.get(session)!;
      return { session, closeAt: text(row.close_at), authorityId: text(row.session_authority_id),
        sourceRef: text(row.source_ref), sourceTimestamp: text(row.source_timestamp),
        collectedAt: text(row.collected_at), recordedAt: text(row.recorded_at) };
    });
    result.calendar = { status: 'selected_rows_only', revisionId: `${VERSION}:launch-calendar:${hash(sessions)}`,
      availableAt: shared.availableAt, sessions };
    try {
      // A table containing240 completed rows alone cannot prove continuity.
      // Reuse annual-history/cancellation validation; do not acquire a calendar.
      const annual = forwardCalendar(shared, request);
      result.calendar = { ...result.calendar, status: 'validated_selected_window', availableAt: maxTime(shared.availableAt, annual.knownAt),
        revisionId: `${VERSION}:launch-calendar:${hash([sessions, annual.version, request.forwardCalendar])}` };
    } catch (error) { result.missingData.push('launch_calendar_continuity_unproven', gap(error)); }
    const snapshots = shared.sessions.slice(1).map((session) => {
      const row = shared.snapshots.get(session)!;
      return { session, snapshotId: text(row.snapshot_id), sessionAuthorityId: text(row.session_authority_id),
        datasetHash: text(row.dataset_hash), collectedAt: text(row.collected_at), recordedAt: text(row.recorded_at) };
    });
    result.corporateActions = { version: 'tw-corporate-action-v3.1', availableAt: shared.availableAt,
      revisionId: `${VERSION}:launch-actions:${hash(snapshots)}`, snapshots };
    // Raw share-volume comparability is local to the51 consumed bars. Older
    // events still affect the verified price basis, but do not veto this window.
    // Even a price-factor1 ex-right/dividend event may change share counts:
    // this legacy feed has no separate cash-only proof, so every target event
    // inside the window refuses comparability rather than inventing a factor.
    const volumeSessions = shared.sessions.slice(-51);
    const volumeSnapshots = volumeSessions.map((session) => shared.snapshots.get(session)!);
    const candidateEvents = volumeSnapshots.flatMap((snapshot) =>
      shared.events.get(text(snapshot.snapshot_id))!.filter((event) => event.symbol === request.symbol));
    // No-event evidence does not prove the precision/unit of a volume number.
    // TPEx monthly thousand-share/lot data may have been multiplied by1000;
    // that cannot establish native exact shares over the required51 sessions.
    if (candidateEvents.length) result.missingData.push('launch_share_volume_candidate_action_within_51');
    if (request.exchange === 'TPEX') result.missingData.push('launch_tpex_exact_native_share_volume_51_not_proven');
    else if (!history.bars.slice(-51).every(bar => Number.isSafeInteger(bar.volume) && bar.volume >= 0)) {
      result.missingData.push('launch_twse_exact_integer_share_volume_51_not_proven');
    }
    else if (!candidateEvents.length) {
      const snapshotIds = volumeSnapshots.map((snapshot) => text(snapshot.snapshot_id));
      result.shareVolume = { status: 'no_candidate_events_in_selected_51',
        revisionId: `${VERSION}:launch-share-volume:${hash([request.exchange, request.symbol, request.cutoff,
          history.sourceDatasetRevision, volumeSessions, volumeSnapshots.map((snapshot) =>
            [snapshot.snapshot_id, snapshot.dataset_hash, snapshot.session_authority_id])])}`,
        sourceDatasetRevision: history.sourceDatasetRevision, availableAt: maxTime(shared.availableAt, history.availableAt),
        fromSession: volumeSessions[0], throughSession: volumeSessions.at(-1)!, snapshotIds,
        coverage: 'supported_feeds_only', completeCapitalCoverage: false };
    }
  } catch (error) { result.missingData.push(gap(error)); }
  result.missingData = [...new Set(result.missingData)].sort();
  result.missingData.push('launch_supported_feeds_do_not_prove_capital_continuity');
  if (selectedShared) {
    try { launchSelections.set(result, { requestDigest: launchNativeContentDigest(request), publicDigest: launchNativeContentDigest(result),
      history, shared: structuredClone(selectedShared) }); }
    catch { result.missingData.push('native_volume_selected_registration_invalid'); }
  }
  return result;
}

/** Additive exact-ID read. Legacy historical selectors and their byte prefix,
 * volumes and revisions are unchanged. Only an actual selected result can be
 * prepared; public/caller-created data never becomes a binding credential. */
export async function prepareTwLaunchNativeVolumeBinding(client: TwEntryAuthorityClient, request: TwEntryAuthorityRequest, selected: TwLaunchPatternReadEvidence) {
  try {
    const saved = launchSelections.get(selected);
    requireAuthority(saved && saved.requestDigest === launchNativeContentDigest(request)
      && saved.publicDigest === launchNativeContentDigest(selected) && saved.history === selected.history, 'native_volume_selected_read_not_original');
    requireAuthority(request.exchange === 'TPEX' && selected.calendar?.status === 'validated_selected_window'
      && selected.corporateActions && selected.history.missingData.length === 0 && selected.history.bars.length >= 240
      && evidenceKnownAt(selected.history.availableAt, request.cutoff) && evidenceKnownAt(selected.calendar.availableAt, request.cutoff)
      && evidenceKnownAt(selected.corporateActions.availableAt, request.cutoff), 'native_volume_selected_basis_missing');
    const shared = saved.shared, bars = selected.history.bars.slice(-51), days = shared.sessions.slice(-51);
    requireAuthority(bars.length === 51 && days.length === 51 && days.at(-1) === request.signalSession
      && bars.every((bar, index) => bar.session === days[index]), 'native_volume_session_binding_invalid');
    const snapshots = days.map(day => shared.snapshots.get(day)!);
    requireAuthority(snapshots.every(snapshot => snapshot && !(shared.events.get(text(snapshot.snapshot_id)) ?? []).some(event => event.symbol === request.symbol)),
      'native_volume_supported_feed_target_event');
    const ids = bars.map(bar => bar.observationId);
    requireAuthority(new Set(ids).size === 51 && ids.every(value => UUID.test(value)), 'native_volume_observation_ids_invalid');
    const read = await client.from('opportunity_price_observations_v3')
      .select('observation_id,stock_id,exchange,session_id,session_authority_id,raw_open,raw_high,raw_low,raw_close,volume,provider,source_timestamp,collected_at,source_ref,recorded_at')
      .eq('stock_id', request.stockId).eq('exchange', request.exchange).eq('provider', 'tpex').in('observation_id', ids)
      .lte('source_timestamp', request.cutoff).lte('collected_at', request.cutoff).lte('recorded_at', request.cutoff).range(0, 51);
    requireAuthority(!read.error && Array.isArray(read.data) && read.data.length === 51 && saved.publicDigest === launchNativeContentDigest(selected)
      && saved.requestDigest === launchNativeContentDigest(request) && saved.history === selected.history, 'native_volume_raw_read_changed');
    const raw = read.data as Row[], rows: Array<TwLaunchNativePriceBinding['rows'][number]> = [];
    requireAuthority(new Set(raw.map(row => row.observation_id)).size === 51, 'native_volume_raw_duplicate');
    for (const bar of bars) {
      const row = raw.find(item => item.observation_id === bar.observationId);
      requireAuthority(row && row.stock_id === request.stockId && row.exchange === 'TPEX' && row.provider === 'tpex'
        && row.session_id === bar.session && row.session_authority_id === shared.calendarRows.get(bar.session)?.session_authority_id
        && knownAt(row, request.cutoff) && text(row.source_ref).startsWith('tpex-')
        && compareEvidenceClocks(row.source_timestamp, bar.sourceTimestamp) === 0 && compareEvidenceClocks(row.recorded_at, bar.recordedAt) === 0
        && row.volume === bar.volume, 'native_volume_raw_row_binding_invalid');
      const actionDays = shared.sessions.filter(day => day > bar.session).map(day => {
        const snapshot = shared.snapshots.get(day)!;
        const action = shared.events.get(text(snapshot.snapshot_id))!.find(event => event.symbol === request.symbol);
        return [day, snapshot.session_authority_id, snapshot.snapshot_id, snapshot.dataset_hash,
          action ? [action.event_kind, action.pre_action_reference_price, action.post_action_reference_price, action.feed_identity, action.source_row_ref] : null,
          action?.daily_adjustment_factor ?? 1];
      });
      const factor = actionDays.reduce((value, member) => value * Number(member[5]), 1);
      const prices = [row.raw_open, row.raw_high, row.raw_low, row.raw_close];
      requireAuthority(factor === 1 && prices.every(finitePositive) && prices.every((value, index) => value === [bar.open, bar.high, bar.low, bar.close][index])
        && row.raw_close === bar.rawClose && hash(['adjusted-price-evidence-v3.1', request.signalSession, row.observation_id, row.source_ref,
          row.session_authority_id, ...prices, actionDays, factor, ...prices]) === bar.sourceRef, 'native_volume_raw_ohlc_or_revision_mismatch');
      rows.push(Object.freeze({ session: bar.session, observationId: bar.observationId, sourceRef: bar.sourceRef, calendarId: text(row.session_authority_id),
        rawOpen: Number(row.raw_open), rawHigh: Number(row.raw_high), rawLow: Number(row.raw_low), rawClose: Number(row.raw_close), factor: 1,
        legacyVolume: bar.volume, sourceTimestamp: bar.sourceTimestamp, recordedAt: bar.recordedAt, availableAt: bar.availableAt }));
    }
    requireAuthority(saved.publicDigest === launchNativeContentDigest(selected), 'native_volume_selected_read_changed');
    launchNativeBindings.set(selected, Object.freeze({ requestDigest: saved.requestDigest, publicDigest: saved.publicDigest,
      priceRevision: selected.history.sourceDatasetRevision, calendarRevision: selected.calendar.revisionId, actionsRevision: selected.corporateActions.revisionId,
      availableAt: maxTime(selected.history.availableAt, selected.calendar.availableAt, selected.corporateActions.availableAt),
      snapshotIds: Object.freeze(snapshots.map(snapshot => text(snapshot.snapshot_id))), rows: Object.freeze(rows) }));
    return { ready: true, gaps: [] as string[] };
  } catch (error) {
    launchNativeBindings.delete(selected);
    return { ready: false, gaps: [error instanceof Error && /^native_volume_[a-z_]+$/u.test(error.message) ? error.message : 'native_volume_binding_unavailable'] };
  }
}
/** Read-only private-brand lookup; never accepts a caller-provided sidecar. */
export function readTwLaunchNativeVolumeBinding(selected: TwLaunchPatternReadEvidence, request: TwEntryAuthorityRequest): TwLaunchNativePriceBinding | null {
  try {
    const saved = launchSelections.get(selected), binding = launchNativeBindings.get(selected);
    return saved && binding && saved.requestDigest === launchNativeContentDigest(request)
      && binding.publicDigest === launchNativeContentDigest(selected) && saved.history === selected.history ? binding : null;
  } catch { return null; }
}

export type TwLaunchInstitutionalSelection = Readonly<{
  requestDigest: string; publicDigest: string; priceRevision: string; calendarRevision: string; actionsRevision: string;
  availableAt: string; snapshotIds: readonly string[];
  sessions: readonly Readonly<{ session: string; closeAt: string; calendarId: string }>[];
  targetEvents: readonly Readonly<{ session: string; eventKind: string; sourceRowRef: string }>[];
}>;
/** Separate20-session selection provenance for an institutional denominator.
 * Only the genuine prior loader result can be read. Technical51 capital/raw
 * volume preparation is deliberately independent of this window. */
export function readTwLaunchInstitutionalSelection(selected: TwLaunchPatternReadEvidence,
  request: Pick<TwEntryAuthorityRequest, 'symbol' | 'exchange' | 'signalSession' | 'cutoff'> & { stockId?: string }): TwLaunchInstitutionalSelection | null {
  try {
    const saved = launchSelections.get(selected);
    requireAuthority(saved && saved.requestDigest === launchNativeContentDigest(request)
      && saved.publicDigest === launchNativeContentDigest(selected) && saved.history === selected.history,
    'institutional_volume_selected_read_not_original');
    const history = selected.history, calendar = selected.calendar, actions = selected.corporateActions;
    requireAuthority(request.exchange === 'TPEX' && history.missingData.length === 0 && history.bars.length >= 240
      && history.priceBasis?.status === 'verified' && history.priceBasis.anchorSession === request.signalSession
      && calendar?.status === 'validated_selected_window' && actions
      && history.bars.length === calendar.sessions.length && history.bars.length === saved.shared.sessions.length
      && evidenceKnownAt(history.availableAt, request.cutoff) && evidenceKnownAt(calendar.availableAt, request.cutoff)
      && evidenceKnownAt(actions.availableAt, request.cutoff), 'institutional_volume_selected_basis_missing');
    const days = saved.shared.sessions.slice(-20), bars = history.bars.slice(-20), calendarRows = calendar.sessions.slice(-20);
    requireAuthority(days.length === 20 && days.at(-1) === request.signalSession
      && days.every((day, index) => bars[index].session === day && calendarRows[index].session === day
        && calendarRows[index].authorityId === saved.shared.calendarRows.get(day)?.session_authority_id
        && evidenceKnownAt(calendarRows[index].closeAt, request.cutoff)
        && evidenceKnownAt(calendarRows[index].closeAt, bars[index].sourceTimestamp)
        && evidenceKnownAt(bars[index].sourceTimestamp, bars[index].availableAt)
        && evidenceKnownAt(bars[index].availableAt, request.cutoff)), 'institutional_volume_selected_sessions_invalid');
    const snapshots = days.map(day => saved.shared.snapshots.get(day));
    requireAuthority(snapshots.every(snapshot => snapshot && evidenceKnownAt(snapshot.collected_at, request.cutoff)
      && evidenceKnownAt(snapshot.recorded_at, request.cutoff)
      && saved.shared.events.has(text(snapshot.snapshot_id))), 'institutional_volume_selected_actions_missing');
    const targetEvents = days.flatMap((session, index) => saved.shared.events.get(text(snapshots[index]!.snapshot_id))!
      .filter(event => event.symbol === request.symbol).map(event => Object.freeze({ session,
        eventKind: text(event.event_kind), sourceRowRef: text(event.source_row_ref) })));
    return Object.freeze({ requestDigest: saved.requestDigest, publicDigest: saved.publicDigest,
      priceRevision: history.sourceDatasetRevision, calendarRevision: calendar.revisionId, actionsRevision: actions.revisionId,
      availableAt: maxTime(history.availableAt, calendar.availableAt, actions.availableAt),
      snapshotIds: Object.freeze(snapshots.map(snapshot => text(snapshot!.snapshot_id))),
      sessions: Object.freeze(calendarRows.map(day => Object.freeze({ session: day.session, closeAt: day.closeAt, calendarId: day.authorityId }))),
      targetEvents: Object.freeze(targetEvents) });
  } catch { return null; }
}
