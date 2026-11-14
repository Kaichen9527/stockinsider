import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { officialLicensedCsvUrl, parseLaunchLicensedCsvReplay, parseLaunchOfficialReplay, bindLaunchOfficialReplay, LICENSED_CSV_SCHEMA, LICENSED_CSV_PARSER } from './launch-official-replay.ts';
import { readLaunchPatterns } from './launch-pattern-read.ts';
import type { TwEntryAuthorityClient, TwLaunchPatternReadEvidence } from '../tw-entry-plan-authority.ts';

const FLOW_HEADER = ['資料日期', '代號', '名稱', '外資及陸資不含外資自營商買進股數', '外資及陸資不含外資自營商賣出股數', '外資及陸資不含外資自營商買賣超股數',
  '外資自營商買進股數', '外資自營商賣出股數', '外資自營商買賣超股數', '外資及陸資買進股數', '外資及陸資賣出股數', '外資及陸資買賣超股數',
  '投信買進股數', '投信賣出股數', '投信買賣超股數', '自營商自行買賣買進股數', '自營商自行買賣賣出股數', '自營商自行買賣買賣超股數',
  '自營商避險買進股數', '自營商避險賣出股數', '自營商避險買賣超股數', '自營商買進股數', '自營商賣出股數', '自營商買賣超股數', '三大法人買賣超股數合計'];
const TWSE_HEADER = ['日期', '開盤指數', '最高指數', '最低指數', '收盤指數'], TPEX_HEADER = ['資料日期', '開市', '最高價', '最低價', '收市', '漲跌'];
// Invented clocks precede this task's actual day so the real selector's
// unchanged no-future-cutoff guard is exercised without a clock override.
const observedAt = '2026-11-14T00:00:00.000001Z', cutoff = '2026-11-14T01:00:00Z';
function encode(rows: string[][], bom = true, ending = '\r\n') {
  return (bom ? '\uFEFF' : '') + rows.map(row => row.map(cell => '"' + cell.replace(/"/gu, '""') + '"').join(',')).join(ending) + ending;
}
function content(rows: string[][], bom = true, ending = '\r\n') {
  const value = encode(rows, bom, ending); return { bytes: Buffer.byteLength(value), rawSha256: createHash('sha256').update(value).digest('hex'), body: { encoding: 'base64' as const, data: Buffer.from(value).toString('base64') } };
}
function decoded(page: { body: { data: string } }) {
  return Buffer.from(page.body.data, 'base64').toString('utf8');
}
/** Invented CSV/selected-calendar fixtures, no real exchange/rights acceptance. */
function fixture() {
  const sessions = Array.from({ length: 240 }, (_, i) => new Date(Date.UTC(2026, 10, 13) - (239 - i) * 86400000).toISOString().slice(0, 10));
  const months = [...new Set(sessions.map(day => day.slice(0, 7)))], flowSessions = sessions.slice(-21);
  const responses: Array<{ datasetId: 11755 | 11391 | 11856; market: 'TWSE' | 'TPEX'; kind: 'index_month' | 'institutional_day'; requestKey: string;
    sourceUrl: string; observedAt: string; publisherPublishedAt: null; httpStatus: 200 | null; redirectCount: 0 | null; contentType: string;
    bytes: number; rawSha256: string; body: { encoding: 'base64'; data: string } }> = [];
  const add = (datasetId: 11755 | 11391 | 11856, key: string, rows: string[][]) => responses.push({ datasetId, market: datasetId === 11755 ? 'TWSE' : 'TPEX',
    kind: datasetId === 11856 ? 'institutional_day' : 'index_month', requestKey: key, sourceUrl: officialLicensedCsvUrl(datasetId, key), observedAt,
    publisherPublishedAt: null, httpStatus: 200, redirectCount: 0, contentType: 'text/csv', ...content(rows) });
  for (const id of [11755, 11391] as const) for (const month of months) {
    add(id, month, [id === 11755 ? TWSE_HEADER : TPEX_HEADER, ...sessions.filter(day => day.startsWith(month)).map(day =>
      [`${Number(day.slice(0, 4)) - 1911}/${day.slice(5, 7)}/${day.slice(8)}`, '1,000.50', '1,100.50', '900.50', '1,001.50', ...(id === 11391 ? ['+1.00'] : [])])]);
  }
  for (const day of flowSessions) {
    const row = Array.from({ length: 25 }, () => '0');
    row[0] = day; row[1] = '6488'; row[2] = 'fictional, "quoted"\nname';
    row[3] = '2'; row[4] = '1'; row[5] = '1'; row[12] = '1'; row[13] = '3'; row[14] = '-2'; add(11856, day, [FLOW_HEADER, row]);
  }
  return { sessions, manifest: { schema: LICENSED_CSV_SCHEMA, parserContract: LICENSED_CSV_PARSER,
    targets: [{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }], throughSessions: ['2026-11-12', '2026-11-13'], cutoff,
    capture: { repository: 'fixture/offline', sourceCommit: 'e'.repeat(40), workflowPath: null, runId: null, runAttempt: null, startedAt: null, completedAt: observedAt },
    indexMonths: { TWSE: months, TPEX: months }, flowSessions, responses } };
}
const request = { stockId: '00000000-0000-4000-8000-000000009999', symbol: '6488', exchange: 'TPEX' as const, signalSession: '2026-11-13', cutoff };

test('three licensed CSV constructors retain exact route/query/ROC identities separate from JSON', () => {
  assert.equal(officialLicensedCsvUrl(11755, '2026-11'), 'https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=open_data&date=20261101');
  assert.equal(officialLicensedCsvUrl(11391, '2026-11'), 'https://www.tpex.org.tw/www/zh-tw/indexInfo/inx?response=data&date=2026%2F11%2F01');
  assert.equal(officialLicensedCsvUrl(11856, '2026-11-12'), 'https://www.tpex.org.tw/web/stock/3insti/DAILY_TradE/3itrade_hedge_result.php?l=zh-tw&o=data&se=EW&t=D&d=115%2F11%2F12');
});
test('BOM/CRLF RFC4180 quotes/commas/newline decode exact25-header flows and index rows with computed attribution', () => {
  const { manifest } = fixture(), before = structuredClone(manifest), read = parseLaunchLicensedCsvReplay(manifest);
  assert.equal(read.parsedPages, manifest.responses.length);
  assert.equal(read.attributions.length, 3); assert.equal(read.sourceAuthority, false); assert.equal(read.redistributionAuthority, false);
  assert.deepEqual(read.attributions.map(row => row.datasetId), [11391, 11755, 11856]);
  assert.equal(read.attributions[0].licenseUrl, 'https://data.gov.tw/license');
  assert.ok(read.attributions.every(row => row.owner === 'Securities and Futures Bureau, Financial Supervisory Commission'));
  assert.ok(read.responseReceipts.filter(row => row.datasetId === 11856).every(row => row.candidateFlowRows === 1));
  assert.ok(read.responseReceipts.every(row => row.rawSha256 !== row.canonicalCsvRowsSha256));
  assert.ok(read.gaps.includes('capture_workflow_identity_unverified')); assert.deepEqual(manifest, before);
  assert.throws(() => parseLaunchOfficialReplay(manifest), /manifest_invalid/u);
});
test('raw BOM/line endings change byte identity while semantic CSV rows retain canonical identity', () => {
  const first = fixture(), second = fixture(), page = second.manifest.responses[0];
  const text = decoded(page).replace(/^\uFEFF/u, '').replace(/\r\n/gu, '\n');
  Object.assign(page, { bytes: Buffer.byteLength(text), rawSha256: createHash('sha256').update(text).digest('hex'), body: { encoding: 'base64', data: Buffer.from(text).toString('base64') } });
  const a = parseLaunchLicensedCsvReplay(first.manifest).responseReceipts[0], b = parseLaunchLicensedCsvReplay(second.manifest).responseReceipts[0];
  assert.notEqual(a.rawSha256, b.rawSha256); assert.equal(a.canonicalCsvRowsSha256, b.canonicalCsvRowsSha256);
});
test('CSV negatives refuse syntax/header/trailing-column/null/unsafe/net/date/duplicate/source/clock corruption', () => {
  for (const mode of ['quote', 'header', 'trailing', 'null', 'unsafe', 'net', 'negative_buy', 'date', 'duplicate', 'route', 'hash', 'clock'] as const) {
    const { manifest } = fixture(), page = manifest.responses.find(row => row.datasetId === 11856)!;
    let text = decoded(page);
    if (mode === 'quote') text = text.slice(0, -3);
    if (mode === 'header') text = text.replace('外資及陸資不含外資自營商買賣超股數', '買賣超');
    if (mode === 'trailing') text = text.replace(/\r\n/gu, ',\r\n');
    if (['null', 'unsafe', 'net', 'negative_buy', 'date', 'duplicate'].includes(mode)) {
      const row = Array.from({ length: 25 }, () => '0'); row[0] = page.requestKey; row[1] = '6488'; row[2] = 'fixture'; row[3] = '2'; row[4] = '1'; row[5] = '1'; row[12] = '1'; row[13] = '3'; row[14] = '-2';
      if (mode === 'null') row[5] = '';
      if (mode === 'unsafe') row[3] = '9007199254740992';
      if (mode === 'net') row[5] = '3';
      if (mode === 'negative_buy') row[3] = '-2';
      if (mode === 'date') row[0] = '2026-01-01';
      text = encode([FLOW_HEADER, row, ...(mode === 'duplicate' ? [row] : [])]);
    }
    Object.assign(page, { bytes: Buffer.byteLength(text), rawSha256: createHash('sha256').update(text).digest('hex'), body: { encoding: 'base64', data: Buffer.from(text).toString('base64') } });
    if (mode === 'route') page.sourceUrl = page.sourceUrl.replace('o=data', 'o=json');
    if (mode === 'hash') page.rawSha256 = '0'.repeat(64);
    if (mode === 'clock') page.observedAt = '2026-11-15T00:00:00.000001Z';
    assert.throws(() => parseLaunchLicensedCsvReplay(manifest), /official_/u, mode);
  }
});
test('missing physical CSV bytes are gaps and CSV licenses never authorize T86 or other unregistered routes', () => {
  const { manifest } = fixture();
  const absent = { ...manifest, responses: manifest.responses.map(page => ({ ...page, body: { encoding: 'absent' } })) };
  const read = parseLaunchLicensedCsvReplay(absent); assert.equal(read.parsedPages, 0); assert.deepEqual(read.attributions, []);
  assert.ok(read.gaps.some(gap => gap.startsWith('raw_body_missing:')));
  const forged = structuredClone(manifest); forged.responses[0].sourceUrl = 'https://www.twse.com.tw/rwd/zh/fund/T86?date=20261113&selectType=ALL&response=json';
  assert.throws(() => parseLaunchLicensedCsvReplay(forged), /source_invalid/u);
  for (const bytes of [Buffer.from([0xc0, 0xaf]), Buffer.from('\uFEFF\uFEFF' + TWSE_HEADER.join(',') + '\n115/11/13,1,2,1,2\n')]) {
    const invalid = fixture(), page = invalid.manifest.responses[0];
    Object.assign(page, { bytes: bytes.byteLength, rawSha256: createHash('sha256').update(bytes).digest('hex'), body: { encoding: 'base64', data: bytes.toString('base64') } });
    assert.throws(() => parseLaunchLicensedCsvReplay(invalid.manifest));
  }
});
test('existing actual reader accepts branded CSV input, retains safe attribution, and does zero external work without selected prerequisites', async () => {
  const { manifest } = fixture(), read = parseLaunchLicensedCsvReplay(manifest); let reads = 0, fetches = 0;
  const originalFetch = globalThis.fetch; globalThis.fetch = async () => { fetches++; throw Error('unexpected external call'); };
  try {
    const query = { select() { return this; }, eq() { return this; }, gte() { return this; }, lte() { return this; }, order() { return this; }, range() { return Promise.resolve({ data: [], error: null }); } };
    const client = { from() { reads++; return query; } } as unknown as TwEntryAuthorityClient;
    const result = await readLaunchPatterns(client, request, read);
    assert.equal(reads, 1); assert.equal(fetches, 0); assert.equal(result.launchScore.totalScore, null);
    assert.equal(result.officialReplay?.parserVersion, LICENSED_CSV_PARSER); assert.equal(result.officialReplay?.attributions.length, 3);
    assert.ok(result.officialReplay?.gaps.includes('official_replay_selected_binding_missing'));
    assert.throws(() => bindLaunchOfficialReplay(structuredClone(read), request, {} as TwLaunchPatternReadEvidence), /foreign_or_cloned/u);
  } finally { globalThis.fetch = originalFetch; }
});
