/** Invented NONPRODUCTION data. Weekday labels here are a supplied synthetic
 * calendar fixture, never actual market/session or acquisition evidence. */
import { createHash } from 'node:crypto';
import { evidenceInstant } from './evidence-clock.ts';
import { NATIVE_SHARE_HEADERS, NATIVE_SHARE_SCHEMA, tpexNativeShareCsvUrl } from './launch-native-volume.ts';
import type { TwEntryAuthorityClient, TwEntryAuthorityRequest } from '../tw-entry-plan-authority.ts';
import { officialLicensedCsvUrl, LICENSED_CSV_SCHEMA, LICENSED_CSV_PARSER } from './launch-official-replay.ts';
type Row = Record<string, unknown>;
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const collected = '2026-11-14T07:00:00+00:00', observedAt = '2026-11-14T10:00:00.000001Z';
export const nativeTables = { calendar: 'tw_trading_sessions_v3', prices: 'opportunity_price_observations_v3',
  snapshots: 'opportunity_corporate_action_snapshots_v3', feeds: 'opportunity_corporate_action_feed_evidence_v3', events: 'opportunity_corporate_action_events_v3' };
const feeds = ['tpex:exright-cal:v1','tpex:reduction-reference:v1','tpex:change-reference:v1'];
const csv = (fields: unknown[]) => fields.map(value => `"${String(value).replace(/"/gu, '""')}"`).join(',');
export function nativeVolumeFixture(options: { capitalChangeIndex?: number; cashEvent?: boolean } = {}) {
  const sessions: string[] = [];
  for (let cursor = Date.parse('2026-11-13T00:00:00Z'); sessions.length < 240; cursor -= 86400000) {
    const value = new Date(cursor); if (![0,6].includes(value.getUTCDay())) sessions.unshift(value.toISOString().slice(0,10));
  }
  const data: Record<string, Row[]> = Object.fromEntries(Object.values(nativeTables).map(table => [table, []]));
  const nativeShares = (index: number) => index === 239 ? 14002 : index >= 235 ? 2001 : 10001;
  for (let index = 0; index < 240; index++) {
    const session = sessions[index], close = index === 239 ? 101 : Math.round((80 + index * .08) * 100) / 100;
    const spread = index === 239 ? 0 : index >= 214 ? .5 : 5;
    data[nativeTables.calendar].push({ session_authority_id: id(index + 1), session_id: session, market: 'TPEX', provider: 'tpex', status: 'completed',
      open_at: `${session}T01:00:00Z`, close_at: `${session}T05:30:00Z`, source_timestamp: collected, collected_at: collected,
      recorded_at: '2026-11-14T08:00:00Z', source_ref: `tpex-annual-calendar:${session}` });
    data[nativeTables.prices].push({ observation_id: id(index + 1000), stock_id: id(9999), exchange: 'TPEX', provider: 'tpex', session_id: session,
      session_authority_id: id(index + 1), raw_open: close, raw_high: Math.round((close + spread) * 100) / 100,
      raw_low: Math.round((close - spread) * 100) / 100, raw_close: close, volume: Math.round(nativeShares(index) / 1000) * 1000,
      source_timestamp: `${session}T06:00:00Z`, collected_at: collected, recorded_at: '2026-11-14T08:10:00Z', source_ref: `tpex-openapi:${session}:6488` });
    if (index === 0) continue;
    const hasEvent = options.cashEvent && index === 220;
    const snapshot: Row = { snapshot_id: id(index + 2000), exchange: 'TPEX', session_id: session, session_authority_id: id(index + 1),
      corporate_action_version: 'tw-corporate-action-v3.1', provider: 'tpex', collected_at: collected, recorded_at: '2026-11-14T08:00:00Z',
      declared_event_count: hasEvent ? 1 : 0, dataset_hash: '' };
    const snapshotFeeds = feeds.map((feed, ordinal) => ({ snapshot_id: snapshot.snapshot_id, feed_ordinal: ordinal, feed_identity: feed,
      response_byte_count: 20, response_sha256: 'a'.repeat(64), parsed_row_count: hasEvent && ordinal === 0 ? 1 : 0, recorded_at: '2026-11-14T08:00:00Z' }));
    const events: Row[] = hasEvent ? [{ snapshot_id: snapshot.snapshot_id, event_ordinal: 0, symbol: '6488', event_kind: 'ex_right_dividend',
      pre_action_reference_price: 100, post_action_reference_price: 100, feed_identity: feeds[0], daily_adjustment_factor: 1,
      recorded_at: '2026-11-14T08:00:00Z', source_row_ref: hash(['corporate-action-source-row-v3.1','TPEX',session,'6488','ex_right_dividend',100,100,feeds[0]]) }] : [];
    snapshot.dataset_hash = hash(['corporate-action-snapshot-v3.1','TPEX',session,snapshot.session_authority_id,'tw-corporate-action-v3.1','tpex',collected,
      snapshotFeeds.map(row => [row.feed_identity,row.response_byte_count,row.response_sha256,row.parsed_row_count]),
      events.map(row => [row.symbol,row.event_kind,row.pre_action_reference_price,row.post_action_reference_price,row.feed_identity,row.source_row_ref])]);
    data[nativeTables.snapshots].push(snapshot); data[nativeTables.feeds].push(...snapshotFeeds); data[nativeTables.events].push(...events);
  }
  const annual = (session: string, status: string) => ({ market: 'TPEX', session, status, provider: 'tpex', openAt: `${session}T01:00:00Z`,
    scheduledCloseAt: `${session}T05:30:00Z`, closeAt: status === 'holiday' ? null : `${session}T05:30:00Z`, sourceTimestamp: collected, collectedAt: collected,
    sourceUrl: 'https://www.tpex.org.tw/fixture-annual-calendar', sourceSha256: 'b'.repeat(64), sourceRef: `tpex-annual-calendar:${session.slice(0,4)}:${session}:${'b'.repeat(64)}` });
  // Invented analysis cutoff is already past on the authorized Nov14 task.
  const request: TwEntryAuthorityRequest = { stockId: id(9999), symbol: '6488', exchange: 'TPEX', signalSession: sessions.at(-1)!, cutoff: '2026-11-14T12:00:00Z',
    forwardCalendar: { schema: 'official-calendar-acquisition-v3.14', availableAt: '2026-11-14T09:00:00Z',
      calendarSessions: [...sessions.map(day => annual(day,'completed')), annual('2026-11-16','scheduled')] } };
  const responses = sessions.slice(-57).map((session, index) => {
    const actualIndex = index + 183, price = data[nativeTables.prices][actualIndex], issued = actualIndex >= (options.capitalChangeIndex ?? 999) ? 150000000 : 100000000;
    const date = `${Number(session.slice(0,4))-1911}/${session.slice(5,7)}/${session.slice(8)}`;
    const fields = [date,'6488','NONPRODUCTION issuer',price.raw_close,0,price.raw_open,price.raw_high,price.raw_low,nativeShares(actualIndex),1000000,100,
      price.raw_close,price.raw_close,issued,110,90];
    const body = csv([...NATIVE_SHARE_HEADERS]) + '\r\n' + csv(fields) + '\r\n';
    return { session, sourceUrl: tpexNativeShareCsvUrl(session), observedAt, publisherPublishedAt: null, httpStatus: 200, redirectCount: 0,
      contentType: 'text/csv', bytes: Buffer.byteLength(body), rawSha256: createHash('sha256').update(body).digest('hex'), body: { encoding: 'base64', data: Buffer.from(body).toString('base64') } };
  });
  const manifest = { schema: NATIVE_SHARE_SCHEMA, datasetId: 11371, symbol: '6488', cutoff: request.cutoff,
    capture: { repository: 'NONPRODUCTION/offline-only', sourceCommit: 'a'.repeat(40), workflowPath: null, runId: null, runAttempt: null,
      startedAt: '2026-11-14T09:00:00Z', completedAt: observedAt }, sessions: sessions.slice(-57), responses };
  const reads: string[] = [];
  class Query {
    filters: Array<(row: Row) => boolean> = []; orders: Array<{ field: string; asc: boolean }> = []; start = 0; end = 9999;
    readonly table: string;
    constructor(table: string) { this.table=table; }
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push(row => row[field] === value); return this; }
    in(field: string, values: unknown[]) { this.filters.push(row => values.includes(row[field])); return this; }
    gte(field: string, value: string) { this.filters.push(row => String(row[field]) >= value); return this; }
    gt(field: string, value: string) { this.filters.push(row => String(row[field]) > value); return this; }
    lte(field: string, value: string) { this.filters.push(row => field.endsWith('_at') || field.endsWith('_timestamp')
      ? evidenceInstant(row[field]) !== null && evidenceInstant(row[field])! <= evidenceInstant(value)! : String(row[field]) <= value); return this; }
    order(field: string, options?: { ascending?: boolean }) { this.orders.push({ field, asc: options?.ascending !== false }); return this; }
    range(start: number, end: number) { this.start = start; this.end = end; return this; }
    then(resolve: (result: { data: Row[]; error: null }) => unknown) {
      reads.push(this.table);
      const rows = data[this.table].filter(row => this.filters.every(filter => filter(row))).sort((a,b) => {
        for (const order of this.orders) { const n = String(a[order.field]).localeCompare(String(b[order.field])); if (n) return order.asc ? n : -n; } return 0;
      }).slice(this.start,this.end+1);
      return Promise.resolve({ data: rows, error: null }).then(resolve);
    }
  }
  return { sessions, request, data, manifest, nativeShares, reads, client: { from: (table: string) => new Query(table) } as unknown as TwEntryAuthorityClient };
}

/** Independent invented index/flow CSVs for the full reader/scorer positive. */
export function officialCsvForNativeFixture(fixture: ReturnType<typeof nativeVolumeFixture>) {
  const flowHeader = ['資料日期','代號','名稱','外資及陸資不含外資自營商買進股數','外資及陸資不含外資自營商賣出股數','外資及陸資不含外資自營商買賣超股數',
    '外資自營商買進股數','外資自營商賣出股數','外資自營商買賣超股數','外資及陸資買進股數','外資及陸資賣出股數','外資及陸資買賣超股數',
    '投信買進股數','投信賣出股數','投信買賣超股數','自營商自行買賣買進股數','自營商自行買賣賣出股數','自營商自行買賣買賣超股數',
    '自營商避險買進股數','自營商避險賣出股數','自營商避險買賣超股數','自營商買進股數','自營商賣出股數','自營商買賣超股數','三大法人買賣超股數合計'];
  const months = [...new Set(fixture.sessions.map(day => day.slice(0,7)))];
  const responses: Array<Record<string, unknown>> = [];
  const day = (session: string) => `${Number(session.slice(0,4))-1911}/${session.slice(5,7)}/${session.slice(8)}`;
  const add = (datasetId: 11391 | 11856, key: string, records: unknown[][]) => {
    const body = records.map(csv).join('\r\n') + '\r\n';
    responses.push({ datasetId, market: 'TPEX', kind: datasetId === 11391 ? 'index_month' : 'institutional_day', requestKey: key,
      sourceUrl: officialLicensedCsvUrl(datasetId,key), observedAt, publisherPublishedAt: null, httpStatus: 200, redirectCount: 0,
      contentType: 'text/csv', bytes: Buffer.byteLength(body), rawSha256: createHash('sha256').update(body).digest('hex'), body: { encoding: 'base64', data: Buffer.from(body).toString('base64') } });
  };
  for (const month of months) add(11391, month, [['資料日期','開市','最高價','最低價','收市','漲跌'],
    ...fixture.sessions.filter(session => session.startsWith(month)).map(session => {
      const close = Math.round((1000 + fixture.sessions.indexOf(session) * .1) * 10) / 10;
      return [day(session), close, close+1, close-1, close, 0];
    })]);
  for (const session of fixture.sessions.slice(-21)) {
    const values: unknown[] = Array(25).fill('0'); values[0] = day(session); values[1] = '6488'; values[2] = 'NONPRODUCTION issuer';
    values[3] = '2'; values[4] = '1'; values[5] = '1'; values[12] = '3'; values[13] = '1'; values[14] = '2';
    add(11856, session, [flowHeader,values]);
  }
  return { schema: LICENSED_CSV_SCHEMA, parserContract: LICENSED_CSV_PARSER, targets: [{market:'TWSE',symbol:'2330'},{market:'TPEX',symbol:'6488'}],
    throughSessions: ['2026-11-12','2026-11-13'], cutoff: fixture.request.cutoff, capture: fixture.manifest.capture,
    indexMonths: { TWSE: [], TPEX: months }, flowSessions: fixture.sessions.slice(-21), responses };
}
