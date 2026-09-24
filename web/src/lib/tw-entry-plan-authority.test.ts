import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadTwEntryPlanAuthority, type TwEntryAuthorityClient, type TwEntryAuthorityRequest } from './tw-entry-plan-authority.ts';

type Row = Record<string, unknown>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const stockId = id(9999);
const cutoff = '2026-09-24T12:00:00Z';
const feeds = ['twse:twt49u:v1', 'twse:twtauu:v1', 'twse:twtb8u:v1'];
const tables = { calendar: 'tw_trading_sessions_v3', prices: 'opportunity_price_observations_v3',
  snapshots: 'opportunity_corporate_action_snapshots_v3', feeds: 'opportunity_corporate_action_feed_evidence_v3', events: 'opportunity_corporate_action_events_v3' };
function fixture(split = false, pastCancellation = false, splitIndex = 200) {
  const sessions: string[] = [];
  for (let cursor = Date.parse('2026-09-24T00:00:00Z'); sessions.length < (pastCancellation ? 241 : 240); cursor -= 86_400_000) {
    const day = new Date(cursor); if (![0, 6].includes(day.getUTCDay())) sessions.unshift(day.toISOString().slice(0, 10));
  }
  const data: Record<string, Row[]> = Object.fromEntries(Object.values(tables).map((table) => [table, []]));
  const collected = '2026-09-24T07:00:00+00:00';
  for (let i = 0; i < sessions.length; i++) {
    const session = sessions[i];
    data[tables.calendar].push({ session_authority_id: id(i + 1), session_id: session, market: 'TWSE',
      open_at: `${session}T01:00:00Z`, close_at: `${session}T05:30:00Z`, status: pastCancellation && i === 50 ? 'cancelled' : 'completed', provider: 'twse',
      source_timestamp: collected, collected_at: collected, recorded_at: '2026-09-24T08:00:00Z', source_ref: `twse-annual-calendar:${session}` });
    if (pastCancellation && i === 50) continue;
    data[tables.prices].push({ observation_id: id(i + 1000), stock_id: stockId, exchange: 'TWSE', session_id: session,
      session_authority_id: id(i + 1), raw_open: split && i < splitIndex ? 200 : 100, raw_high: split && i < splitIndex ? 204 : 102,
      raw_low: split && i < splitIndex ? 196 : 98, raw_close: split && i < splitIndex ? 200 : 100, volume: 1000,
      provider: 'twse', source_timestamp: `${session}T06:00:00Z`, collected_at: collected, recorded_at: '2026-09-24T08:10:00Z', source_ref: `twse-openapi:${session}:2330` });
    if (!i) continue;
    const events: Row[] = split && i === splitIndex ? [{ snapshot_id: id(i + 2000), event_ordinal: 0, symbol: '2330', event_kind: 'par_value_change',
      pre_action_reference_price: 200, post_action_reference_price: 100, feed_identity: feeds[2], daily_adjustment_factor: .5,
      source_row_ref: hash(['corporate-action-source-row-v3.1', 'TWSE', session, '2330', 'par_value_change', 200, 100, feeds[2]]), recorded_at: '2026-09-24T08:00:00Z' }] : [];
    const feedRows = feeds.map((feed, ordinal) => ({ snapshot_id: id(i + 2000), feed_ordinal: ordinal, feed_identity: feed,
      response_byte_count: 20, response_sha256: 'a'.repeat(64), parsed_row_count: events.length && ordinal === 2 ? 1 : 0, recorded_at: '2026-09-24T08:00:00Z' }));
    const digest = hash(['corporate-action-snapshot-v3.1', 'TWSE', session, id(i + 1), 'tw-corporate-action-v3.1', 'twse', collected,
      feedRows.map((row) => [row.feed_identity, row.response_byte_count, row.response_sha256, row.parsed_row_count]),
      events.map((row) => [row.symbol, row.event_kind, row.pre_action_reference_price, row.post_action_reference_price, row.feed_identity, row.source_row_ref])]);
    data[tables.snapshots].push({ snapshot_id: id(i + 2000), exchange: 'TWSE', session_id: session, session_authority_id: id(i + 1),
      corporate_action_version: 'tw-corporate-action-v3.1', provider: 'twse', collected_at: collected, recorded_at: '2026-09-24T08:00:00Z',
      declared_event_count: events.length, dataset_hash: digest });
    data[tables.feeds].push(...feedRows); data[tables.events].push(...events);
  }
  const annual = (session: string, status: string) => ({ market: 'TWSE', session, status, provider: 'twse',
    openAt: `${session}T01:00:00Z`, scheduledCloseAt: `${session}T05:30:00Z`, closeAt: status === 'holiday' ? null : `${session}T05:30:00Z`,
    sourceTimestamp: collected, collectedAt: collected, sourceUrl: 'https://www.twse.com.tw/rwd/zh/holidaySchedule/holidaySchedule?response=json&date=20260101',
    sourceSha256: 'b'.repeat(64), sourceRef: `twse-annual-calendar:${session.slice(0, 4)}:${session}:${'b'.repeat(64)}` });
  const request: TwEntryAuthorityRequest = { stockId, symbol: '2330', exchange: 'TWSE', signalSession: sessions.at(-1)!, cutoff,
    forwardCalendar: { schema: 'official-calendar-acquisition-v3.14', availableAt: '2026-09-24T09:00:00Z',
      calendarSessions: [...sessions.map((session) => annual(session, 'completed')), annual('2026-09-25', 'holiday'), annual('2026-09-28', 'scheduled')] } };
  return { data, request, sessions };
}
function mockClient(data: Record<string, Row[]>, failTable?: string) {
  const reads: string[] = [];
  class Query {
    filters: ((row: Row) => boolean)[] = []; orders: { field: string; ascending: boolean }[] = [];
    first = 0; last = 999;
    readonly table: string;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push((row) => row[field] === value); return this; }
    gte(field: string, value: string) { this.filters.push((row) => String(row[field]) >= value); return this; }
    gt(field: string, value: string) { this.filters.push((row) => String(row[field]) > value); return this; }
    lte(field: string, value: string) { this.filters.push((row) => field.endsWith('_at') || field.endsWith('_timestamp')
      ? Date.parse(String(row[field])) <= Date.parse(value) : String(row[field]) <= value); return this; }
    in(field: string, values: unknown[]) { this.filters.push((row) => values.includes(row[field])); return this; }
    order(field: string, options?: { ascending?: boolean }) { this.orders.push({ field, ascending: options?.ascending !== false }); return this; }
    range(first: number, last: number) { this.first = first; this.last = last; return this; }
    then(resolve: (value: { data: Row[] | null; error: unknown }) => unknown, reject?: (error: unknown) => unknown) {
      reads.push(this.table);
      const rows = (data[this.table] || []).filter((row) => this.filters.every((filter) => filter(row))).sort((a, b) => {
        for (const { field, ascending } of this.orders) { const diff = String(a[field]).localeCompare(String(b[field])); if (diff) return ascending ? diff : -diff; }
        return 0;
      }).slice(this.first, this.last + 1);
      return Promise.resolve(this.table === failTable ? { data: null, error: { message: 'denied' } } : { data: rows, error: null }).then(resolve, reject);
    }
  }
  return { client: { from: (table: string) => new Query(table) } as unknown as TwEntryAuthorityClient, reads };
}

test('loads 240 proved observations and an official next session after a holiday and weekend', async () => {
  const { data, request, sessions } = fixture();
  const { client } = mockClient(data);
  const result = await loadTwEntryPlanAuthority(client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.bars.length, 240);
  assert.deepEqual(result.calendar?.completedSessions, sessions);
  assert.equal(result.calendar?.nextSession, '2026-09-28');
  assert.equal(result.calendar?.nextOpenAt, '2026-09-28T01:00:00Z');
  assert.equal(result.availableAt, '2026-09-24T09:00:00.000Z');
  assert.equal(result.priceBasis?.status, 'verified');
  assert.match(result.priceBasis!.adjustmentEvidenceHash, /^[a-f0-9]{64}$/u);
});

test('verified event chain rescales prior prices to the unchanged signal-session price', async () => {
  const { data, request } = fixture(true);
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.bars[0].close, 100);
  assert.equal(result.bars.at(-1)?.close, 100);
  assert.equal(data[tables.prices][0].raw_close, 200, 'immutable source remains raw');
});

test('market-wide corporate-action snapshots retain non-four-digit instruments without adjusting the candidate', async () => {
  const { data, request } = fixture();
  const snapshot = data[tables.snapshots][120];
  const session = String(snapshot.session_id);
  const event = { snapshot_id: snapshot.snapshot_id, event_ordinal: 0, symbol: '00984D',
    event_kind: 'ex_right_dividend', pre_action_reference_price: 20, post_action_reference_price: 19,
    feed_identity: feeds[0], daily_adjustment_factor: .95,
    source_row_ref: hash(['corporate-action-source-row-v3.1', 'TWSE', session, '00984D', 'ex_right_dividend', 20, 19, feeds[0]]),
    recorded_at: '2026-09-24T08:00:00Z' };
  data[tables.events].push(event);
  const feed = data[tables.feeds].find((row) => row.snapshot_id === snapshot.snapshot_id && row.feed_ordinal === 0)!;
  feed.parsed_row_count = 1;
  snapshot.declared_event_count = 1;
  snapshot.dataset_hash = hash(['corporate-action-snapshot-v3.1', 'TWSE', session, snapshot.session_authority_id,
    'tw-corporate-action-v3.1', 'twse', snapshot.collected_at,
    data[tables.feeds].filter((row) => row.snapshot_id === snapshot.snapshot_id)
      .map((row) => [row.feed_identity, row.response_byte_count, row.response_sha256, row.parsed_row_count]),
    [[event.symbol, event.event_kind, event.pre_action_reference_price, event.post_action_reference_price,
      event.feed_identity, event.source_row_ref]]]);
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.bars[0].close, 100);
  assert.equal(result.bars.at(-1)?.close, 100);
});

test('absent price/session/action authority and read failure never abort the candidate run', async () => {
  for (const table of [tables.calendar, tables.prices, tables.snapshots]) {
    const { data, request } = fixture(); data[table] = [];
    const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
    assert.equal(result.priceBasis, null); assert.equal(result.bars.length, 0); assert.ok(result.missingData.length);
  }
  const { data, request } = fixture();
  const denied = await loadTwEntryPlanAuthority(mockClient(data, tables.calendar).client, request);
  assert.deepEqual(denied.missingData, ['entry_authority_read_failed']);
});

test('corporate-action hash corruption and changed daily factor fail closed', async () => {
  const corrupted = fixture(); corrupted.data[tables.snapshots][30].dataset_hash = 'f'.repeat(64);
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(corrupted.data).client, corrupted.request)).missingData, ['corporate_action_hash_mismatch']);
  const changed = fixture(true); changed.data[tables.events][0].daily_adjustment_factor = .6;
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(changed.data).client, changed.request)).missingData, ['corporate_action_event_invalid']);
});

test('post-cutoff source and post-cutoff annual acquisition cannot backfill a plan', async () => {
  const latePrice = fixture(); latePrice.data[tables.prices][239].recorded_at = '2026-09-24T13:00:00Z';
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(latePrice.data).client, latePrice.request)).missingData, ['adjusted_history_below_240']);
  const lateCalendar = fixture(); lateCalendar.request.forwardCalendar!.availableAt = '2026-09-24T13:00:00Z';
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(lateCalendar.data).client, lateCalendar.request)).missingData, ['official_next_session_missing']);
});

test('an absent weekday and conflicting calendar heads cannot be skipped', async () => {
  const gap = fixture(); gap.request.forwardCalendar!.calendarSessions = gap.request.forwardCalendar!.calendarSessions.filter((row) => row.session !== '2026-09-25');
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(gap.data).client, gap.request)).missingData, ['official_next_calendar_gap']);
  const conflict = fixture(); conflict.data[tables.calendar].push({ ...conflict.data[tables.calendar][239], session_authority_id: id(9998), status: 'cancelled' });
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(conflict.data).client, conflict.request)).missingData, ['entry_authority_conflict']);
});

test('zero observed events need all three explicit feed receipts, never an assumed identity adjustment', async () => {
  const { data, request } = fixture(); data[tables.feeds].shift();
  assert.deepEqual((await loadTwEntryPlanAuthority(mockClient(data).client, request)).missingData, ['corporate_action_evidence_incomplete']);
});

test('shared market authority is acquired once for the immutable run cutoff', async () => {
  const { data, request } = fixture(); const { client, reads } = mockClient(data);
  const [first, second] = await Promise.all([loadTwEntryPlanAuthority(client, request), loadTwEntryPlanAuthority(client, request)]);
  assert.deepEqual(first, second);
  assert.equal(reads.filter((table) => table === tables.calendar).length, 1);
  assert.equal(reads.filter((table) => table === tables.snapshots).length, 1);
});


test('an older raw observation remains valid against its own immutable calendar revision', async () => {
  const { data, request } = fixture();
  // Existing latest authority remains id(51); an older imported price uses
  // a predecessor calendar revision and must not poison the selected head.
  data[tables.calendar].push({ ...data[tables.calendar][50], session_authority_id: id(5000),
    source_timestamp: '2026-09-24T06:00:00Z', collected_at: '2026-09-24T06:00:00Z', recorded_at: '2026-09-24T06:30:00Z' });
  data[tables.prices].push({ ...data[tables.prices][50], observation_id: id(5001), session_authority_id: id(5000),
    collected_at: '2026-09-24T06:00:00Z', recorded_at: '2026-09-24T06:30:00Z' });
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.bars.length, 240);
});


test('a cutoff-known ad-hoc official cancellation overrides the annual scheduled opening', async () => {
  const { data, request } = fixture();
  data[tables.calendar].push({ ...data[tables.calendar][239], session_authority_id: id(6000), session_id: '2026-09-28', status: 'cancelled',
    open_at: '2026-09-28T01:00:00Z', close_at: '2026-09-28T05:30:00Z',
    source_timestamp: '2026-09-24T10:00:00Z', collected_at: '2026-09-24T10:00:00Z', recorded_at: '2026-09-24T10:00:00Z' });
  const next = { ...request.forwardCalendar!.calendarSessions.at(-1)!, session: '2026-09-29', openAt: '2026-09-29T01:00:00Z',
    scheduledCloseAt: '2026-09-29T05:30:00Z', closeAt: '2026-09-29T05:30:00Z',
    sourceRef: `twse-annual-calendar:2026:2026-09-29:${'b'.repeat(64)}` };
  request.forwardCalendar!.calendarSessions.push(next);
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.calendar?.nextSession, '2026-09-29');
  assert.equal(result.calendar?.knownAt, '2026-09-24T10:00:00.000Z');
});


test('a past ad-hoc cancellation does not create a false missing-price day in the 240-session window', async () => {
  const { data, request, sessions } = fixture(false, true);
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, []);
  assert.equal(result.bars.length, 240);
  assert.equal(result.calendar?.completedSessions.includes(sessions[50]), false);
});


test('a recent share-changing action does not manufacture a comparable volume ratio', async () => {
  const { data, request } = fixture(true, false, 235);
  const result = await loadTwEntryPlanAuthority(mockClient(data).client, request);
  assert.deepEqual(result.missingData, ['volume_basis_changed_within_lookback']);
  assert.equal(result.priceBasis, null);
  assert.deepEqual(result.bars, []);
});
