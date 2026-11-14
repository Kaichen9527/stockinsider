import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadTwEntryHistoricalPriceAuthority, type TwEntryAuthorityClient, type TwEntryAuthorityRequest } from '../tw-entry-plan-authority.ts';
import { evidenceInstant } from './evidence-clock.ts';
import { readLaunchPatterns } from './launch-pattern-read.ts';

type Row = Record<string, unknown>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const tables = { calendar: 'tw_trading_sessions_v3', prices: 'opportunity_price_observations_v3',
  snapshots: 'opportunity_corporate_action_snapshots_v3', feeds: 'opportunity_corporate_action_feed_evidence_v3', events: 'opportunity_corporate_action_events_v3' };
const feeds = ['twse:twt49u:v1', 'twse:twtauu:v1', 'twse:twtb8u:v1'];
const collected = '2026-09-24T07:00:00+00:00';
function rehash(data: Record<string, Row[]>, snapshot: Row) {
  const selectedFeeds = data[tables.feeds].filter(row => row.snapshot_id === snapshot.snapshot_id).sort((a, b) => Number(a.feed_ordinal) - Number(b.feed_ordinal));
  const events = data[tables.events].filter(row => row.snapshot_id === snapshot.snapshot_id);
  snapshot.dataset_hash = hash(['corporate-action-snapshot-v3.1', 'TWSE', snapshot.session_id, snapshot.session_authority_id,
    'tw-corporate-action-v3.1', 'twse', collected,
    selectedFeeds.map(row => [row.feed_identity, row.response_byte_count, row.response_sha256, row.parsed_row_count]),
    events.map(row => [row.symbol, row.event_kind, row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity, row.source_row_ref])]);
}
/** Invented protocol-shaped cache. This is no acquisition/DB/session authority. */
function fixture(action?: { index: number; kind: 'par_value_change' | 'capital_reduction' | 'ex_right_dividend'; symbol?: string; factor?: number }) {
  const sessions: string[] = [];
  for (let cursor = Date.parse('2026-09-24T00:00:00Z'); sessions.length < 240; cursor -= 86_400_000) {
    const day = new Date(cursor);
    if (![0, 6].includes(day.getUTCDay())) sessions.unshift(day.toISOString().slice(0, 10));
  }
  const data: Record<string, Row[]> = Object.fromEntries(Object.values(tables).map(table => [table, []]));
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    data[tables.calendar].push({ session_authority_id: id(i + 1), session_id: session, market: 'TWSE',
      open_at: `${session}T01:00:00Z`, close_at: `${session}T05:30:00Z`, status: 'completed', provider: 'twse',
      source_timestamp: collected, collected_at: collected, recorded_at: '2026-09-24T08:00:00Z', source_ref: `twse-annual-calendar:${session}` });
    data[tables.prices].push({ observation_id: id(i + 1000), stock_id: id(9999), exchange: 'TWSE', session_id: session,
      session_authority_id: id(i + 1), raw_open: 100, raw_high: 102, raw_low: 98, raw_close: 100, volume: 1000,
      provider: 'twse', source_timestamp: `${session}T06:00:00Z`, collected_at: collected,
      recorded_at: '2026-09-24T08:10:00Z', source_ref: `twse-openapi:${session}:2330` });
    if (!i) continue;
    const snapshot = { snapshot_id: id(i + 2000), exchange: 'TWSE', session_id: session, session_authority_id: id(i + 1),
      corporate_action_version: 'tw-corporate-action-v3.1', provider: 'twse', collected_at: collected,
      recorded_at: '2026-09-24T08:00:00Z', declared_event_count: action?.index === i ? 1 : 0, dataset_hash: '' };
    const ordinal = action?.kind === 'ex_right_dividend' ? 0 : action?.kind === 'capital_reduction' ? 1 : 2;
    data[tables.feeds].push(...feeds.map((feed, feedOrdinal) => ({ snapshot_id: snapshot.snapshot_id,
      feed_ordinal: feedOrdinal, feed_identity: feed, response_byte_count: 20, response_sha256: 'a'.repeat(64),
      parsed_row_count: action?.index === i && feedOrdinal === ordinal ? 1 : 0, recorded_at: '2026-09-24T08:00:00Z' })));
    if (action?.index === i) {
      const symbol = action.symbol ?? '2330', factor = action.factor ?? .5;
      data[tables.events].push({ snapshot_id: snapshot.snapshot_id, event_ordinal: 0, symbol, event_kind: action.kind,
        pre_action_reference_price: 100, post_action_reference_price: 100 * factor, feed_identity: feeds[ordinal],
        daily_adjustment_factor: factor, recorded_at: '2026-09-24T08:00:00Z',
        source_row_ref: hash(['corporate-action-source-row-v3.1', 'TWSE', session, symbol, action.kind, 100, 100 * factor, feeds[ordinal]]) });
    }
    rehash(data, snapshot); data[tables.snapshots].push(snapshot);
  }
  const annual = (session: string, status: string) => ({ market: 'TWSE', session, status, provider: 'twse',
    openAt: `${session}T01:00:00Z`, scheduledCloseAt: `${session}T05:30:00Z`, closeAt: status === 'holiday' ? null : `${session}T05:30:00Z`,
    sourceTimestamp: collected, collectedAt: collected, sourceUrl: 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=20260101',
    sourceSha256: 'b'.repeat(64), sourceRef: `twse-annual-calendar:${session.slice(0, 4)}:${session}:${'b'.repeat(64)}` });
  const request: TwEntryAuthorityRequest = { stockId: id(9999), symbol: '2330', exchange: 'TWSE', signalSession: sessions.at(-1)!, cutoff: '2026-09-24T12:00:00Z',
    forwardCalendar: { schema: 'official-calendar-acquisition-v3.14', availableAt: '2026-09-24T09:00:00Z',
      calendarSessions: [...sessions.map(session => annual(session, 'completed')), annual('2026-09-25', 'holiday'), annual('2026-09-28', 'scheduled')] } };
  return { data, request, sessions };
}
function mockClient(data: Record<string, Row[]>, failTable?: string) {
  const reads: string[] = [];
  class Query {
    filters: Array<(row: Row) => boolean> = []; orders: Array<{ field: string; ascending: boolean }> = [];
    first = 0; last = 999;
    readonly table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push(row => row[field] === value); return this; }
    gte(field: string, value: string) { this.filters.push(row => String(row[field]) >= value); return this; }
    gt(field: string, value: string) { this.filters.push(row => String(row[field]) > value); return this; }
    lte(field: string, value: string) { this.filters.push(row => field.endsWith('_at') || field.endsWith('_timestamp')
      ? evidenceInstant(row[field]) !== null && evidenceInstant(row[field])! <= evidenceInstant(value)! : String(row[field]) <= value); return this; }
    in(field: string, values: unknown[]) { this.filters.push(row => values.includes(row[field])); return this; }
    order(field: string, options?: { ascending?: boolean }) { this.orders.push({ field, ascending: options?.ascending !== false }); return this; }
    range(first: number, last: number) { this.first = first; this.last = last; return this; }
    then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown, reject?: (error: unknown) => unknown) {
      reads.push(this.table);
      const selected = (data[this.table] ?? []).filter(row => this.filters.every(filter => filter(row))).sort((a, b) => {
        for (const { field, ascending } of this.orders) { const diff = String(a[field]).localeCompare(String(b[field])); if (diff) return ascending ? diff : -diff; }
        return 0;
      }).slice(this.first, this.last + 1);
      return Promise.resolve(this.table === failTable ? { data: null, error: 'fixture-denial' } : { data: selected, error: null }).then(resolve, reject);
    }
  }
  return { client: { from: (table: string) => new Query(table) } as unknown as TwEntryAuthorityClient, reads };
}

test('existing selector evidence feeds240-bar offline arithmetic with explicit false authorities', async () => {
  const { data, request, sessions } = fixture(), before = structuredClone(data);
  const { client, reads } = mockClient(data);
  const result = await readLaunchPatterns(client, request);
  assert.equal(result.scope, 'selected_read_evidence_with_offline_arithmetic');
  assert.equal(result.sourceAuthority, false); assert.equal(result.publicationAuthority, false);
  assert.equal(result.entryAuthority, false); assert.equal(result.rankingAuthority, false);
  assert.equal(result.evidence.calendar?.status, 'validated_selected_window');
  assert.equal(result.evidence.corporateActions?.snapshots.length, 239);
  assert.equal(result.evidence.shareVolume?.snapshotIds.length, 51);
  assert.equal(result.evidence.shareVolume?.fromSession, sessions[189]);
  assert.equal(result.arithmetic.scope, 'offline_fixture_only');
  assert.equal(result.arithmetic.close, 100);
  assert.equal(result.arithmetic.breakout.volumeRatio, 1);
  assert.equal(result.arithmetic.originalBreakout, null);
  assert.deepEqual(result.evidence.missingData, []);
  assert.deepEqual(data, before);
  assert.ok(reads.every(table => Object.values(tables).includes(table)));
});

test('new consumer reuses existing cached selection and keeps old historical result contract', async () => {
  const { data, request } = fixture(), { client, reads } = mockClient(data);
  const old = await loadTwEntryHistoricalPriceAuthority(client, request);
  const result = await readLaunchPatterns(client, request);
  assert.deepEqual(result.evidence.history, old);
  assert.equal(reads.filter(table => table === tables.calendar).length, 1);
  assert.equal(reads.filter(table => table === tables.snapshots).length, 1);
});

test('a share-changing event40 sessions ago passes legacy recent21 but refuses new51-volume proof', async () => {
  for (const kind of ['par_value_change', 'capital_reduction'] as const) {
    const { data, request } = fixture({ index: 199, kind });
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.history.bars.length, 240, kind);
    assert.equal(result.arithmetic.close, 100, kind);
    assert.equal(result.evidence.shareVolume, null, kind);
    assert.equal(result.arithmetic.breakout.volumeRatio, null, kind);
    assert.ok(result.gaps.includes('launch_share_volume_candidate_action_within_51'), kind);
  }
});

test('cash/ex-right combined event cannot prove unchanged shares even with price factor1', async () => {
  for (const factor of [1, .95]) {
    const { data, request } = fixture({ index: 199, kind: 'ex_right_dividend', factor });
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.history.bars.length, 240);
    assert.equal(result.evidence.shareVolume, null);
    assert.equal(result.arithmetic.contraction.volumeContractionRatio, null);
  }
});

test('volume evidence covers exact51 bars conservatively including the first window session', async () => {
  for (const index of [188, 189]) {
    const { data, request } = fixture({ index, kind: 'ex_right_dividend', factor: .95 });
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.history.bars.length, 240);
    assert.equal(result.evidence.shareVolume !== null, index === 188);
    assert.equal(result.arithmetic.originalBreakout, null);
  }
});

test('unrelated instrument events do not become candidate share changes', async () => {
  const { data, request } = fixture({ index: 199, kind: 'ex_right_dividend', symbol: '00984D' });
  const result = await readLaunchPatterns(mockClient(data).client, request);
  assert.equal(result.evidence.shareVolume?.status, 'no_candidate_events_in_selected_51');
  assert.equal(result.arithmetic.breakout.volumeRatio, 1);
});

test('recent21 share-change refusal remains exactly the original historical guard', async () => {
  const { data, request } = fixture({ index: 230, kind: 'par_value_change' });
  const result = await readLaunchPatterns(mockClient(data).client, request);
  assert.deepEqual(result.evidence.history.missingData, ['volume_basis_changed_within_lookback']);
  assert.equal(result.evidence.calendar, null);
  assert.equal(result.arithmetic.close, null);
});

test('240 completed table rows cannot substitute for missing or incomplete annual continuity evidence', async () => {
  for (const mode of ['missing', 'gap', 'late'] as const) {
    const { data, request, sessions } = fixture();
    if (mode === 'missing') request.forwardCalendar = null;
    if (mode === 'gap') request.forwardCalendar!.calendarSessions = request.forwardCalendar!.calendarSessions.filter(row => row.session !== sessions[100]);
    if (mode === 'late') request.forwardCalendar!.availableAt = '2026-09-24T12:00:00.000001Z';
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.history.bars.length, 240, mode);
    assert.equal(result.evidence.calendar?.status, 'selected_rows_only', mode);
    assert.ok(result.gaps.includes('launch_calendar_continuity_unproven'), mode);
    assert.equal(result.arithmetic.close, null, mode);
  }
});

test('missing feeds/snapshots and hash corruption retain exact existing price-basis failures', async () => {
  for (const mode of ['feed', 'snapshot', 'hash'] as const) {
    const { data, request } = fixture();
    if (mode === 'feed') data[tables.feeds].splice(0, 1);
    if (mode === 'snapshot') data[tables.snapshots].splice(0, 1);
    if (mode === 'hash') data[tables.snapshots][0].dataset_hash = '0'.repeat(64);
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.arithmetic.close, null, mode);
    assert.equal(result.evidence.shareVolume, null, mode);
    assert.deepEqual(result.evidence.history.missingData, [mode === 'feed' ? 'corporate_action_evidence_incomplete'
      : mode === 'snapshot' ? 'corporate_action_authority_missing' : 'corporate_action_hash_mismatch']);
  }
});

test('valid immutable action evidence revisions change bound source/action/volume versions without mutating cache rows', async () => {
  const first = fixture(), corrected = fixture();
  const snapshot = corrected.data[tables.snapshots].at(-1)!;
  corrected.data[tables.feeds].find(row => row.snapshot_id === snapshot.snapshot_id)!.response_sha256 = 'c'.repeat(64);
  rehash(corrected.data, snapshot);
  const before = structuredClone(corrected.data);
  const a = await readLaunchPatterns(mockClient(first.data).client, first.request);
  const b = await readLaunchPatterns(mockClient(corrected.data).client, corrected.request);
  assert.notEqual(a.evidence.history.sourceDatasetRevision, b.evidence.history.sourceDatasetRevision);
  assert.notEqual(a.evidence.corporateActions!.revisionId, b.evidence.corporateActions!.revisionId);
  assert.notEqual(a.evidence.shareVolume!.revisionId, b.evidence.shareVolume!.revisionId);
  assert.equal(a.arithmetic.close, b.arithmetic.close);
  assert.deepEqual(corrected.data, before);
});

test('derived evidence availability includes every bound action and price revision clock', async () => {
  const { data, request } = fixture();
  data[tables.snapshots].at(-1)!.recorded_at = '2026-09-24T09:45:00Z';
  data[tables.prices].at(-1)!.recorded_at = '2026-09-24T10:15:00Z';
  const result = await readLaunchPatterns(mockClient(data).client, request);
  assert.equal(result.evidence.calendar!.availableAt, '2026-09-24T09:45:00.000Z');
  assert.equal(result.evidence.shareVolume!.availableAt, '2026-09-24T10:15:00.000Z');
  assert.equal(result.evidence.history.availableAt, '2026-09-24T10:15:00.000Z');
  assert.equal(result.arithmetic.close, 100);
});

test('post-cutoff microsecond snapshot and price evidence never backfill the read result', async () => {
  for (const mode of ['snapshot', 'price'] as const) {
    const { data, request } = fixture();
    if (mode === 'snapshot') data[tables.snapshots].at(-1)!.recorded_at = '2026-09-24T12:00:00.000001Z';
    if (mode === 'price') data[tables.prices].at(-1)!.recorded_at = '2026-09-24T12:00:00.000001Z';
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.shareVolume, null, mode);
    assert.equal(result.arithmetic.close, null, mode);
    assert.ok(result.evidence.history.missingData.length > 0, mode);
  }
});

test('read failures become data gaps and the client only exposes readonly selection', async () => {
  const { data, request } = fixture();
  const result = await readLaunchPatterns(mockClient(data, tables.prices).client, request);
  assert.deepEqual(result.evidence.history.missingData, ['entry_authority_read_failed']);
  assert.equal(result.arithmetic.close, null);
  assert.equal(result.publicationAuthority, false);
});

test('launch TWSE share-volume proof refuses fractional generic raw volumes without changing historical price reads', async () => {
  const { data, request } = fixture();
  data[tables.prices].at(-1)!.volume = 1000.5;
  const result = await readLaunchPatterns(mockClient(data).client, request);
  assert.equal(result.evidence.history.bars.length, 240);
  assert.equal(result.arithmetic.close, 100);
  assert.equal(result.evidence.shareVolume, null);
  assert.ok(result.evidence.missingData.includes('launch_twse_exact_integer_share_volume_51_not_proven'));
  assert.equal(result.arithmetic.breakout.volumeRatio, null);
});

test('TPEx integer thousand-share normalization cannot mint native-share proof; action gap is independent', async () => {
  for (const action of [false, true]) {
    const { data, request } = fixture(action ? { index: 199, kind: 'ex_right_dividend', factor: 1 } : undefined);
    request.exchange = 'TPEX'; request.symbol = '6488';
    const tpexFeeds = ['tpex:exright-cal:v1', 'tpex:reduction-reference:v1', 'tpex:change-reference:v1'];
    for (const row of data[tables.calendar]) {
      row.market = 'TPEX'; row.provider = 'tpex'; row.source_ref = String(row.source_ref).replace('twse-', 'tpex-');
    }
    for (const row of data[tables.prices]) {
      row.exchange = 'TPEX'; row.provider = 'tpex'; row.source_ref = `tpex-openapi:${row.session_id}:6488`;
    }
    for (const row of data[tables.feeds]) row.feed_identity = tpexFeeds[Number(row.feed_ordinal)];
    for (const row of data[tables.events]) {
      row.symbol = '6488'; row.feed_identity = tpexFeeds[0];
      const snapshot = data[tables.snapshots].find(item => item.snapshot_id === row.snapshot_id)!;
      row.source_row_ref = hash(['corporate-action-source-row-v3.1', 'TPEX', snapshot.session_id, row.symbol,
        row.event_kind, row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity]);
    }
    for (const row of data[tables.snapshots]) {
      row.exchange = 'TPEX'; row.provider = 'tpex';
      row.dataset_hash = hash(['corporate-action-snapshot-v3.1', 'TPEX', row.session_id, row.session_authority_id,
        row.corporate_action_version, row.provider, row.collected_at,
        data[tables.feeds].filter(feed => feed.snapshot_id === row.snapshot_id).map(feed =>
          [feed.feed_identity, feed.response_byte_count, feed.response_sha256, feed.parsed_row_count]),
        data[tables.events].filter(event => event.snapshot_id === row.snapshot_id).map(event =>
          [event.symbol, event.event_kind, event.pre_action_reference_price, event.post_action_reference_price, event.feed_identity, event.source_row_ref])]);
    }
    for (const row of request.forwardCalendar!.calendarSessions) {
      row.market = 'TPEX'; row.provider = 'tpex'; row.sourceUrl = 'https://www.tpex.org.tw/fixture-annual-calendar';
      row.sourceRef = String(row.sourceRef).replace('twse-', 'tpex-');
    }
    const result = await readLaunchPatterns(mockClient(data).client, request);
    assert.equal(result.evidence.history.bars.length, 240);
    assert.equal(result.evidence.shareVolume, null);
    assert.ok(result.evidence.missingData.includes('launch_tpex_exact_native_share_volume_51_not_proven'));
    assert.equal(result.evidence.missingData.includes('launch_share_volume_candidate_action_within_51'), action);
    assert.equal(result.arithmetic.breakout.volumeRatio, null);
    assert.equal(result.arithmetic.contraction.volumeContractionRatio, null);
  }
});
