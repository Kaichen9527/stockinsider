import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { officialTaiwanDataUrl } from '../taiwan-data-provider.ts';
import { officialLaunchHistoricalUrl, parseLaunchOfficialReplay, bindLaunchOfficialReplay, officialReplayObservationPlan } from './launch-official-replay.ts';
import type { TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';

type Market = 'TWSE' | 'TPEX';
const sha = (value: string) => createHash('sha256').update(value).digest('hex');
const observedAt = '2026-11-14T17:00:00.000001Z', cutoff = '2026-11-15T00:00:00Z';
function body(payload: unknown) { const raw = JSON.stringify(payload, null, 2) + '\n'; return { bytes: Buffer.byteLength(raw), rawSha256: sha(raw), body: { encoding: 'base64' as const, data: Buffer.from(raw).toString('base64') } }; }
function header() {
  const fields = Array.from({ length: 25 }, (_, i) => `其他${i}`);
  fields[0] = '代號'; fields[1] = '名稱';
  for (const start of [2, 11]) { fields[start] = '買進'; fields[start + 1] = '賣出'; fields[start + 2] = '買賣超'; }
  const first: string[] = [], second = '<th>買進</th><th>賣出</th><th>買賣超</th>'.repeat(2);
  for (let i = 0; i < 25; i++) {
    if (i === 2 || i === 11) { first.push(`<th colspan="3">${i === 2 ? '外資及陸資(不含外資自營商)' : '投信'}</th>`); i += 2; }
    else first.push(`<th rowspan="2">${fields[i]}</th>`);
  }
  const html = `<table><thead><tr>${first.join('')}</tr><tr>${second}</tr></thead><tbody></tbody></table>`;
  return { fields, descriptor: { kind: 'tpex_flow_group_header', sourceUrl: 'https://www.tpex.org.tw/zh-tw/mainboard/trading/major-institutional/detail/day.html', observedAt,
    bytes: Buffer.byteLength(html), rawSha256: sha(html), body: { encoding: 'base64' as const, data: Buffer.from(html).toString('base64') } } };
}
/** Synthetic observed dates and invented values, never exchange acquisition. */
function fixture() {
  const sessions = Array.from({ length: 240 }, (_, i) => new Date(Date.UTC(2026, 10, 13) - (239 - i) * 86400000).toISOString().slice(0, 10));
  const h = header(), months = [...new Set(sessions.map(day => day.slice(0, 7)))], flowSessions = sessions.slice(-21);
  const pages: Array<{ market: Market; kind: 'index_month' | 'institutional_day'; requestKey: string; sourceUrl: string; observedAt: string;
    publisherPublishedAt: null; httpStatus: 200 | null; redirectCount: 0 | null; contentType: string | null; bytes: number; rawSha256: string; body: { encoding: 'base64'; data: string } }> = [];
  const add = (market: Market, kind: 'index_month' | 'institutional_day', key: string, payload: unknown) => pages.push({ market, kind, requestKey: key,
    sourceUrl: officialLaunchHistoricalUrl(market, kind, key), observedAt, publisherPublishedAt: null, httpStatus: 200, redirectCount: 0, contentType: 'application/json', ...body(payload) });
  for (const market of ['TWSE', 'TPEX'] as const) {
    for (const month of months) {
      const fields = ['日期', market === 'TWSE' ? '收盤指數' : '收市'];
      const data = sessions.filter(day => day.startsWith(month)).map(day => [`${Number(day.slice(0, 4)) - 1911}/${day.slice(5, 7)}/${day.slice(8)}`, '1,000.5']);
      add(market, 'index_month', month, { stat: 'ok', fields, data });
    }
    for (const day of flowSessions) {
      if (market === 'TWSE') add(market, 'institutional_day', day, { stat: 'OK', date: day.replace(/-/gu, ''),
        fields: ['證券代號', '外陸資買進股數(不含外資自營商)', '外陸資賣出股數(不含外資自營商)', '外陸資買賣超股數(不含外資自營商)',
          '投信買進股數', '投信賣出股數', '投信買賣超股數'], data: [['2330', '2', '1', '1', '1', '3', '-2']] });
      else {
        const values = Array.from({ length: 25 }, () => '0'); values[0] = '6488'; values[1] = 'fixture';
        values[2] = '2'; values[3] = '1'; values[4] = '1'; values[11] = '1'; values[12] = '3'; values[13] = '-2';
        add(market, 'institutional_day', day, { stat: 'ok', date: day, fields: h.fields, data: [values] });
      }
    }
  }
  return { sessions, manifest: { schema: 'launch-official-public-replay-v1', parserContract: 'twse-t86-taiex-and-tpex-dailytrade-inx-v1',
    targets: [{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }], throughSessions: ['2026-11-12', '2026-11-13'], cutoff,
    capture: { repository: 'fixture/offline-only', sourceCommit: 'a'.repeat(40), workflowPath: '.github/workflows/fixture.yml', runId: '1', runAttempt: 1,
      startedAt: '2026-11-14T16:00:00Z', completedAt: observedAt }, indexMonths: { TWSE: months, TPEX: months }, flowSessions,
    responses: pages, schemaEvidence: [h.descriptor] } };
}
function selected(sessions: string[], market: Market): TwLaunchPatternReadEvidence {
  const signal = sessions.at(-1)!;
  return { scope: 'selected_cache_protocol_evidence', sourceAuthority: false, publicationAuthority: false, entryAuthority: false, missingData: [],
    history: { notEntryAuthority: true, nextSessionAuthority: false, completedSessions: sessions, sourceDatasetRevision: 'fixture-price', availableAt: observedAt,
      missingData: [], priceBasis: { status: 'verified', kind: 'adjusted_to_signal_session', anchorSession: signal, adjustmentVersion: 'fixture', adjustmentEvidenceHash: 'b'.repeat(64) },
      bars: sessions.map((session, i) => ({ session, open: 10, high: 11, low: 9, close: 10, rawClose: 10, volume: 100,
        sourceRef: `fixture-price-${i}`, observationId: `fixture-obs-${i}`, sourceTimestamp: observedAt, recordedAt: observedAt, availableAt: observedAt,
        sourceUrl: market === 'TWSE' ? 'https://www.twse.com.tw/' : 'https://www.tpex.org.tw/' })) },
    calendar: { status: 'validated_selected_window', revisionId: 'fixture-calendar', availableAt: observedAt, sessions: sessions.map((session, i) =>
      ({ session, closeAt: `${session}T13:30:00+08:00`, authorityId: `fixture-${i}`, sourceRef: 'fixture', sourceTimestamp: observedAt, collectedAt: observedAt, recordedAt: observedAt })) },
    corporateActions: { version: 'tw-corporate-action-v3.1', revisionId: 'fixture-actions', availableAt: observedAt, snapshots: [] },
    shareVolume: { status: 'no_candidate_events_in_selected_51', revisionId: 'fixture-volume', sourceDatasetRevision: 'fixture-price', availableAt: observedAt,
      fromSession: sessions.at(-51)!, throughSession: signal, snapshotIds: sessions.slice(-51).map((_, i) => `fixture-snapshot-${i}`) } };
}
const request = (market: Market) => ({ stockId: '00000000-0000-4000-8000-000000009999', symbol: market === 'TWSE' ? '2330' : '6488', exchange: market, signalSession: '2026-11-13', cutoff });

test('historical constructors preserve latest provider defaults and canonical route/query identities', () => {
  assert.equal(officialLaunchHistoricalUrl('TWSE', 'institutional_day', '2026-11-13'), 'https://www.twse.com.tw/rwd/zh/fund/T86?date=20261113&selectType=ALL&response=json');
  assert.equal(officialLaunchHistoricalUrl('TWSE', 'index_month', '2026-11'), 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261101');
  assert.equal(officialLaunchHistoricalUrl('TPEX', 'institutional_day', '2026-11-13'), 'https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?date=2026%2F11%2F13&type=Daily&response=json&sect=EW');
  assert.equal(officialTaiwanDataUrl({ dataset: 'institutional_flow', exchange: 'TPEX', phase: 'final', sessionDate: '2026-11-13' }), 'https://www.tpex.org.tw/openapi/v1/tpex_3insti_daily_trading');
});

test('real byte hashing differs from canonical JSON; bounded synthetic rows bind200 index/20 share flows without authority', () => {
  const { manifest, sessions } = fixture(), before = structuredClone(manifest), read = parseLaunchOfficialReplay(manifest);
  assert.equal(read.sourceAuthority, false); assert.equal(read.redistributionAuthority, false);
  assert.equal(read.parsedPages, manifest.responses.length);
  assert.notEqual(read.responseReceipts[0].rawSha256, read.responseReceipts[0].canonicalPayloadSha256);
  const twse = bindLaunchOfficialReplay(read, request('TWSE'), selected(sessions, 'TWSE'));
  assert.equal(twse.external.index?.rows.length, 200); assert.equal(twse.external.chips?.rows.length, 20);
  assert.equal(twse.external.chips?.rows[0].foreignNetShares, 1);
  assert.equal(twse.external.chips?.rows[0].sourceTimestamp, observedAt);
  const tpex = bindLaunchOfficialReplay(read, request('TPEX'), selected(sessions, 'TPEX'));
  assert.equal(tpex.external.index?.rows.length, 200);
  assert.equal(tpex.external.chips, undefined, 'integer scaled lots cannot prove exact native shares');
  assert.ok(tpex.gaps.includes('tpex_exact_native_share_volume_20_and_51_not_proven'));
  assert.deepEqual(manifest, before);
  assert.throws(() => bindLaunchOfficialReplay(structuredClone(read), request('TWSE'), selected(sessions, 'TWSE')), /foreign_or_cloned/u);
});

test('missing grouped header proof leavesTPEx flow null while independentTWSE/index replay succeeds', () => {
  const { manifest } = fixture(); manifest.schemaEvidence = [];
  const read = parseLaunchOfficialReplay(manifest);
  assert.ok(read.responseReceipts.filter(row => row.kind === 'institutional_day' && row.market === 'TPEX').every(row => row.candidateFlowRows === 0));
  assert.ok(read.responseReceipts.filter(row => row.kind === 'institutional_day' && row.market === 'TWSE').every(row => row.candidateFlowRows === 1));
  assert.ok(read.gaps.includes('tpex_complete_grouped_header_proof_missing'));
});

test('nonworkflow capture uses allnull workflow tuple without inventing identity; mixed tuples fail', () => {
  const { manifest } = fixture();
  const capture = manifest.capture as unknown as { workflowPath: string | null; runId: string | null; runAttempt: number | null };
  capture.workflowPath = null; capture.runId = null; capture.runAttempt = null;
  const read = parseLaunchOfficialReplay(manifest);
  assert.ok(read.gaps.includes('capture_workflow_identity_unverified'));
  assert.equal(read.sourceAuthority, false);
  for (const property of ['workflowPath', 'runId', 'runAttempt'] as const) {
    const mixed = fixture(); Object.assign(mixed.manifest.capture, { [property]: null });
    assert.throws(() => parseLaunchOfficialReplay(mixed.manifest), /capture_workflow_invalid/u);
  }
  const late = structuredClone(manifest); late.capture.completedAt = late.cutoff;
  assert.throws(() => parseLaunchOfficialReplay(late), /manifest_invalid/u);
});

test('property-like mutations reject sources, hashes, duplicate pages/rows, dates, cutoffs and unsupported header fields', () => {
  for (const change of ['source', 'order', 'hash', 'duplicate_page', 'date', 'duplicate_row', 'fractional', 'header', 'net', 'pair_missing', 'clock', 'before_start', 'cutoff'] as const) {
    const { manifest } = fixture();
    const page = manifest.responses.find(row => row.market === 'TWSE' && row.kind === 'institutional_day')!;
    const payload = JSON.parse(Buffer.from(page.body.data, 'base64').toString('utf8'));
    if (change === 'source') page.sourceUrl = page.sourceUrl.replace('www.twse.com.tw', 'example.test');
    if (change === 'order') page.sourceUrl = page.sourceUrl.replace('date=', 'response=json&date=');
    if (change === 'hash') page.rawSha256 = '0'.repeat(64);
    if (change === 'duplicate_page') manifest.responses.push(structuredClone(page));
    if (change === 'date') payload.date = '20261101';
    if (change === 'duplicate_row') payload.data.push(payload.data[0]);
    if (change === 'fractional') payload.data[0][1] = '1.5';
    if (change === 'header') payload.fields[1] = 'foreign';
    if (change === 'net') payload.data[0][3] = '9';
    if (change === 'pair_missing') { payload.fields.splice(1, 1); payload.data[0].splice(1, 1); }
    if (['date', 'duplicate_row', 'fractional', 'header', 'net', 'pair_missing'].includes(change)) Object.assign(page, body(payload));
    if (change === 'clock') page.observedAt = '2026-11-15T00:00:00.000001Z';
    if (change === 'before_start') page.observedAt = '2026-11-14T15:59:59Z';
    if (change === 'cutoff') manifest.cutoff = observedAt;
    assert.throws(() => parseLaunchOfficialReplay(manifest), /official_replay/u, change);
  }
  const tpex = fixture(), page = tpex.manifest.responses.find(row => row.market === 'TPEX' && row.kind === 'institutional_day')!;
  const payload = JSON.parse(Buffer.from(page.body.data, 'base64').toString('utf8')); payload.data[0][4] = '9'; Object.assign(page, body(payload));
  assert.throws(() => parseLaunchOfficialReplay(tpex.manifest), /flow_net_mismatch/u);
});

test('physical missing bytes are gaps, not zeros; metadata-only receipt cannot impersonate parsed cache', () => {
  const { manifest, sessions } = fixture();
  const metadata = structuredClone(manifest) as unknown as Record<string, unknown>;
  metadata.responses = manifest.responses.map(page => ({ ...page, body: { encoding: 'absent' } })); metadata.schemaEvidence = [];
  const read = parseLaunchOfficialReplay(metadata), bound = bindLaunchOfficialReplay(read, request('TWSE'), selected(sessions, 'TWSE'));
  assert.equal(read.parsedPages, 0); assert.equal(bound.external.index, undefined); assert.equal(bound.external.chips, undefined);
  assert.ok(read.gaps.some(gap => gap.startsWith('raw_body_missing:')));
  const receipt = { schema: 'stockinsider-official-launch-window-observation-v1', marketIndex: { months: [] }, chipWindow: { rows: [] } };
  const plan = officialReplayObservationPlan(receipt);
  assert.equal(plan.rawBodiesAvailable, false);
  assert.throws(() => bindLaunchOfficialReplay(plan as unknown as ReturnType<typeof parseLaunchOfficialReplay>, request('TWSE'), selected(sessions, 'TWSE')), /foreign_or_cloned/u);
});

test('selected calendar/action availability and exact integerTWSE volume remain mandatory, with no earlier-cutoff replay', () => {
  const { manifest, sessions } = fixture(), read = parseLaunchOfficialReplay(manifest);
  for (const mode of ['clock', 'calendar', 'action', 'volume'] as const) {
    const source = selected(sessions, 'TWSE');
    if (mode === 'clock') source.history.availableAt = '2026-11-16T00:00:00Z';
    if (mode === 'calendar') source.calendar!.status = 'selected_rows_only';
    if (mode === 'action') source.corporateActions = null;
    if (mode === 'volume') source.history.bars.at(-1)!.volume = 1.5;
    const bound = bindLaunchOfficialReplay(read, request('TWSE'), source);
    assert.equal(bound.external.chips, undefined, mode);
  }
  assert.equal(bindLaunchOfficialReplay(read, { ...request('TWSE'), cutoff: '2026-11-13T21:30:00+08:00' }, selected(sessions, 'TWSE')).external.index, undefined);
});
