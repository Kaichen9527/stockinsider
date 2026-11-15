import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { loadTwEntryPlanAuthority, loadTwLaunchOutcomeInput, type TwEntryAuthorityClient, type TwEntryAuthorityRequest } from './tw-entry-plan-authority.ts';

import { evaluateLaunchOutcome } from './vnext/launch-outcomes.ts';

import { runLaunchOutcomeCycle, runLaunchOutcomesWithLease } from './vnext/launch-outcome-cycle.ts';

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

const outcomeAsOf = '2026-09-29T09:00:00Z';
function outcomeFixture() {
  const { data, request } = fixture();
  const annual = request.forwardCalendar!;
  annual.availableAt = '2026-09-29T08:00:00Z';
  const last = data[tables.calendar].at(-1)!;
  for (const [i, session] of ['2026-09-28', '2026-09-29', '2026-09-30'].entries()) {
    const source = { ...annual.calendarSessions.at(-1)!, session,
      status: i < 2 ? 'completed' : 'scheduled',
      openAt: `${session}T01:00:00Z`, scheduledCloseAt: `${session}T05:30:00Z`,
      sourceRef: `twse-annual-calendar:2026:${session}:${'b'.repeat(64)}` };
    if (i === 0) annual.calendarSessions.pop();
    annual.calendarSessions.push(source);
    if (i === 2) continue;
    const calendarId = id(31001 + i), snapshotId = id(32001 + i);
    const observed = `${session}T06:00:00+00:00`, recordedAt = `${session}T07:00:00Z`;
    const event = i === 1 ? { snapshot_id: snapshotId, event_ordinal: 0,
      symbol: '2330', event_kind: 'par_value_change', pre_action_reference_price: 100, post_action_reference_price: 50,
      feed_identity: feeds[2], daily_adjustment_factor: .5, source_row_ref: hash(['corporate-action-source-row-v3.1','TWSE',session,'2330','par_value_change',100,50,feeds[2]]),
      recorded_at: recordedAt } : null;
    const evidence = feeds.map((feed, ordinal) => ({ snapshot_id: snapshotId, feed_ordinal: ordinal, feed_identity: feed,
      response_byte_count: 100, response_sha256: 'c'.repeat(64), parsed_row_count: Number(event !== null && ordinal === 2), recorded_at: recordedAt }));
    const digest = hash(['corporate-action-snapshot-v3.1','TWSE',session,calendarId,'tw-corporate-action-v3.1','twse',observed,
      evidence.map(row => [row.feed_identity,row.response_byte_count,row.response_sha256,row.parsed_row_count]),
      event ? [[event.symbol,event.event_kind,event.pre_action_reference_price,event.post_action_reference_price,event.feed_identity,event.source_row_ref]] : []]);
    data[tables.calendar].push({ ...last, session_authority_id: calendarId, session_id: session,
      open_at: source.openAt, close_at: source.scheduledCloseAt, source_timestamp: observed, collected_at: observed,
      recorded_at: recordedAt, source_ref: source.sourceRef });
    data[tables.prices].push({ observation_id: id(33001 + i), stock_id: stockId, exchange: 'TWSE', session_id: session,
      session_authority_id: calendarId, raw_open: i === 0 ? 104 : 55, raw_high: i === 0 ? 110 : 62, raw_low: i === 0 ? 100 : 51,
      raw_close: i === 0 ? 108 : 60, provider: 'twse', source_timestamp: observed, collected_at: observed, recorded_at: recordedAt,
      source_ref: `twse-openapi:${session}:2330` });
    data[tables.snapshots].push({ snapshot_id: snapshotId, exchange: 'TWSE', session_id: session, session_authority_id: calendarId,
      corporate_action_version: 'tw-corporate-action-v3.1', provider: 'twse', collected_at: observed,
      recorded_at: recordedAt, declared_event_count: Number(event !== null), dataset_hash: digest });
    data[tables.feeds].push(...evidence);
    if (event) data[tables.events].push(event);
  }
  const original = data[tables.prices].find(row => row.session_id === request.signalSession)!;
  data[tables.prices].push({ ...original, observation_id: id(34000), raw_close: 98, recorded_at: '2026-09-25T11:00:00Z' });
  const anchor = { rankingRunId: id(35000), firstRankingRunId: id(34999), stockId, symbol: '2330', market: 'TWSE' as const,
    session: request.signalSession, cutoff: request.cutoff, publishedAt: '2026-09-24T13:30:00Z',
    inputHash: 'a'.repeat(64), priceRevision: 'b'.repeat(64), rawClose: '100.00',
    closeObservationId: String(original.observation_id), calendarAuthorityId: String(original.session_authority_id),
    calendarRevision: 'c'.repeat(64), actionsRevision: 'd'.repeat(64) };
  return { anchor, annual, data };
}

test('outcomes pin frozen close, rebase the split exactly and leave execution unknown', async () => {
  const { anchor, annual, data } = outcomeFixture();
  const { client } = mockClient(data);
  const input = await loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual);
  assert.equal(input.signal.rawClose, '100.00');
  assert.equal(input.signal.normalizedClose, '50.00000000');
  assert.deepEqual(input.sessions.map(row => row.status), ['completed', 'completed', 'scheduled']);
  assert.deepEqual(input.bars.map(row => [row.rawOpen, row.open, row.close]),
    [['104.00000000', '52.00000000', '54.00000000'], ['55.00000000', '55.00000000', '60.00000000']]);
  const result = evaluateLaunchOutcome(input);
  assert.equal(result.research.barrier20.state, 'up_first');
  assert.equal(result.research.barrier20.session, '2026-09-29');
  assert.equal(result.execution.status, 'opening_evidence_gap');
  assert.equal(result.repeatSignal, true);
  assert.deepEqual(await loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual), input);
});

test('outcomes include a price correction only when it was available at cutoff', async () => {
  const { anchor, annual, data } = outcomeFixture();
  const head = data[tables.prices].find(row => row.session_id === '2026-09-29')!;
  data[tables.prices].push({ ...head, observation_id: id(34001), raw_high: 59, raw_close: 58, recorded_at: '2026-09-29T09:30:00Z' });
  const { client } = mockClient(data);
  const before = await loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual);
  const after = await loadTwLaunchOutcomeInput(client, anchor, '2026-09-29T10:00:00Z', annual);
  assert.notEqual(before.bars.at(-1)?.priceRevision, after.bars.at(-1)?.priceRevision);
  assert.equal(evaluateLaunchOutcome(before).research.barrier20.state, 'up_first');
  assert.equal(evaluateLaunchOutcome(after).research.barrier20.state, 'pending');
  assert.deepEqual(before.signal, after.signal);
});

test('outcomes reject a substituted frozen close and a missing corporate action feed', async () => {
  const { anchor, annual, data } = outcomeFixture();
  const { client } = mockClient(data);
  await assert.rejects(loadTwLaunchOutcomeInput(client, { ...anchor, rawClose: '98' }, outcomeAsOf, annual), /launch_outcome_frozen_close_mismatch/);
  data[tables.feeds].pop();
  await assert.rejects(loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual), /corporate_action_evidence_incomplete/);
});

test('outcomes never skip an unproved trading session or an absent annual weekday', async () => {
  const { anchor, annual, data } = outcomeFixture();
  data[tables.calendar] = data[tables.calendar].filter(row => row.session_id !== '2026-09-28');
  const { client } = mockClient(data);
  const input = await loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual);
  assert.deepEqual(input.sessions.map(row => [row.session, row.status]), [['2026-09-28', 'scheduled']]);
  assert.equal(input.bars.length, 0);
  assert.equal(evaluateLaunchOutcome(input).research.barrier20.state, 'calendar_gap');
  annual.calendarSessions = annual.calendarSessions.filter(row => row.session !== '2026-09-28');
  await assert.rejects(loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual), /launch_outcome_annual_calendar_gap/);
});

test('outcomes exclude an exchange cancellation and report a missing price without settling later data', async () => {
  const { anchor, annual, data } = outcomeFixture();
  const cancelled = data[tables.calendar].find(row => row.session_id === '2026-09-28')!;
  cancelled.status = 'cancelled';
  data[tables.prices] = data[tables.prices].filter(row => row.session_id !== '2026-09-29');
  const { client } = mockClient(data);
  const input = await loadTwLaunchOutcomeInput(client, anchor, outcomeAsOf, annual);
  assert.deepEqual(input.sessions.map(row => row.status), ['cancelled', 'completed', 'scheduled']);
  const result = evaluateLaunchOutcome(input);
  assert.equal(result.research.barrier20.state, 'price_data_gap');
  assert.equal(result.execution.nextSession, '2026-09-29');
});

const principal = 'stage-operator';
const owner = '00000000-0000-4000-8000-065555555555';

function outcomeBatchFixture() {
  const { anchor, annual, data } = outcomeFixture();
  const first = { rankingRunId: anchor.rankingRunId, symbol: anchor.symbol, market: anchor.market, session: anchor.session };
  const second = { ...first, rankingRunId: id(35001), symbol: '1234', market: 'TPEX' };
  const response = { schemaVersion: 'vnext-launch-outcome-batch-v1', asOf: outcomeAsOf,
    available: 3, signals: [first, second], calendars: { TWSE: annual, TPEX: null } };
  const { client, reads } = mockClient(data);
  return { anchor, response, client, reads };
}

test('post-close outcomes use one authorized cutoff and write only evaluated official prices', async () => {
  const { anchor, response, client, reads } = outcomeBatchFixture();
  const calls: string[] = [];
  const result = await runLaunchOutcomesWithLease({ ...client, async rpc(name, args) {
    assert.equal(args.p_lease_owner, owner);
    assert.equal(args.p_principal, principal);
    if (name.endsWith('batch_v1')) {
      assert.equal(args.p_as_of, outcomeAsOf);
      calls.push('batch');
      return { data: response, error: null };
    }
    assert.equal(args.p_run_id, anchor.rankingRunId);
    assert.equal(args.p_symbol, anchor.symbol);
    if (!Object.hasOwn(args, 'p_input')) {
      calls.push('anchor');
      return { data: anchor, error: null };
    }
    calls.push('write');
    const packet = args.p_input as Parameters<typeof evaluateLaunchOutcome>[0];
    assert.equal(packet.asOf, outcomeAsOf);
    assert.equal(packet.signal.rawClose, '100.00');
    const computed = evaluateLaunchOutcome(packet);
    assert.deepEqual(args.p_result, computed);
    assert.equal(computed.research.barrier20.state, 'up_first');
    assert.equal(computed.execution.status, 'opening_evidence_gap');
    return { data: { schemaVersion: 'vnext-launch-outcome-write-v1', rankingRunId: anchor.rankingRunId, symbol: anchor.symbol,
      policyVersion: computed.policyVersion, inputSnapshotHash: computed.inputSnapshotHash, snapshotHash: 'd'.repeat(64),
      asOf: outcomeAsOf.replace('Z', '+00:00'), replay: true }, error: null };
  } }, principal, owner, outcomeAsOf);
  assert.deepEqual(calls, ['batch', 'anchor', 'write']);
  assert.ok(reads.includes(tables.prices));
  assert.deepEqual(result, { status: 'evaluated', asOf: outcomeAsOf, available: 3, attempted: 2, backlog: 1,
    written: 0, replayed: 1, deferred: { official_calendar_unavailable: 1 } });
});

test('post-close outcomes reject a batch that uses a different cutoff before reading prices', async () => {
  const { response, client, reads } = outcomeBatchFixture();
  const writer = { ...client, async rpc() { return { data: { ...response, asOf: '2026-09-29T09:00:01Z' }, error: null }; } };
  await assert.rejects(runLaunchOutcomesWithLease(writer, principal, owner, outcomeAsOf), /launch_outcome_batch_unavailable/);
  assert.deepEqual(reads, []);
});

test('post-close outcomes keep a missing frozen anchor and unknown write distinct', async () => {
  const { anchor, response, client } = outcomeBatchFixture();
  const [first] = response.signals;
  const nextAnchor = { ...anchor, rankingRunId: id(35002) };
  response.signals = [first, { ...first, rankingRunId: nextAnchor.rankingRunId }];
  const result = await runLaunchOutcomesWithLease({ ...client, async rpc(name, args) {
    if (name.endsWith('batch_v1')) return { data: response, error: null };
    if (args.p_run_id === anchor.rankingRunId) return { data: null, error: 'missing' };
    if (!Object.hasOwn(args, 'p_input')) return { data: nextAnchor, error: null };
    return { data: { policyVersion: 'launch-outcomes-v1' }, error: null };
  } }, principal, owner, outcomeAsOf);
  assert.deepEqual(result.deferred, { frozen_anchor_unavailable: 1, write_unconfirmed: 1 });
  assert.equal(result.written, 0);
});

test('post-close outcomes cannot run under an author identity', async () => {
  await assert.rejects(runLaunchOutcomeCycle({ role: 'author', principal: 'stage-author' }, outcomeAsOf), /launch_outcome_operator_required/);
});
