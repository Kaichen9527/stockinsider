import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMarketFlowPairReplay, parseTpexMarketFlowCsv, parseTpexMarketFlowReplay, parseTwseMarketFlowCsv, tpexMarketFlowCsvUrl,
  twseMarketFlowCsvUrl, MARKET_FLOW_PAIR_SCHEMA, TPEX_MARKET_FLOW_SCHEMA } from './launch-market-foreign-flow.ts';

const sessions = ['2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13'];
const day = sessions.at(-1)!;
const capture = '2026-11-15T12:41:18Z';
const cutoff = '2026-11-15T12:42:00Z';

function csv(session: string, correction?: (value: string) => string) {
  const date = '115' + session.slice(5).replace('-', '');
  const detail = [
    ['外資及陸資合計', '1,200', '2,600', '-1,400'],
    ['　外資及陸資(不含自營商)', '1,000', '2,500', '-1,500'],
    ['　外資自營商', '200', '100', '100'],
    ['投信', '70', '70', '0'],
    ['自營商合計', '310', '270', '40'],
    ['　自營商(自行買賣)', '300', '200', '100'],
    ['　自營商(避險)', '10', '70', '-60'],
    ['三大法人合計*', '1,380', '2,840', '-1,460'],
  ];
  const lines = [['資料日期', '單位名稱', '買進金額', '賣出金額', '買賣超'], ...detail.map(row => [date, ...row])];
  const source = '\uFEFF' + lines.map(row => row.map(x => '"' + x + '"').join(',')).join('\r\n') + '\r\n';
  return new TextEncoder().encode(correction ? correction(source) : source);
}

function replay() {
  const bodies = new Map(sessions.map(session => ['bodies/' + session + '.csv', csv(session)]));
  const responses = sessions.map(session => {
    const path = 'bodies/' + session + '.csv';
    const bytes = bodies.get(path)!;
    return { session, body: { encoding: 'file', path }, bytes: bytes.byteLength,
      capturedAt: capture, httpStatus: 200, mediaType: 'application/csv;charset=utf-8',
      sourceUrl: tpexMarketFlowCsvUrl(session), rawSha256: createHash('sha256').update(bytes).digest('hex') };
  });
  return { bodies, manifest: { schema: TPEX_MARKET_FLOW_SCHEMA, cutoff, sessions: [...sessions], responses } };
}

test('date-bearing licensed URL and two foreign scopes stay distinct', () => {
  assert.match(tpexMarketFlowCsvUrl(day), /[&]d=115%2F11%2F13$/u);
  const record = parseTpexMarketFlowCsv(day, csv(day));
  assert.equal(record.foreignExcludingDealersNetTwd, -1500);
  assert.equal(record.foreignIncludingDealersNetTwd, -1400);
  assert.match(record.rawSha256, /^[a-f0-9]{64}$/u);
});

test('a missing or duplicated row, different date, wrong header or inconsistent official total refuses the report', () => {
  assert.throws(() => parseTpexMarketFlowCsv('2026-11-12', csv(day)));
  for (const edit of [
    (s: string) => s.replace('買賣超', '買賣超股數'),
    (s: string) => s.replace('外資及陸資(不含自營商)', '外資及陸資合計'),
    (s: string) => s.replace('-1,400', '-1,401'),
    (s: string) => s.replace('2,840","-1,460', '2,840","-1,459'),
    (s: string) => s.replace('300","200","100', '301","200","101'),
    (s: string) => s.replace(/[^\n]+三大法人合計[^\n]+\n/u, ''),
  ]) assert.throws(() => parseTpexMarketFlowCsv(day, csv(day, edit)));
});

test('malformed UTF-8, out-of-bound bytes and noninteger currency are refused', () => {
  assert.throws(() => parseTpexMarketFlowCsv(day, new Uint8Array(9_000)));
  assert.throws(() => parseTpexMarketFlowCsv(day, new Uint8Array([255, 255, 255, 255, 255, 255])));
  assert.throws(() => parseTpexMarketFlowCsv(day, csv(day, text => text.replace('1,200', '12,00'))));
  assert.throws(() => parseTpexMarketFlowCsv(day, csv(day, text => text.replace('-1,400', '-1400.5'))));
});

test('five exact reports aggregate excluding dealers and preserve the later capture clocks', () => {
  const { bodies, manifest } = replay();
  const result = parseTpexMarketFlowReplay(manifest, bodies);
  assert.equal(result.oneDayTwd, -1500);
  assert.equal(result.fiveDayTwd, -7500);
  assert.deepEqual(result.sessions, sessions);
  assert.equal(result.receipts.every(row => row.officialPublishedAt === null && row.capturedAt === capture), true);
  assert.equal(result.sourceAuthority || result.marketAuthority || result.publicationAuthority, false);
});

test('a historical replay cannot be accepted against a cutoff preceding actual retrieval', () => {
  const { bodies, manifest } = replay();
  manifest.cutoff = day + 'T21:30:00+08:00';
  assert.throws(() => parseTpexMarketFlowReplay(manifest, bodies));
});

test('ambiguous session, URL, content type, provenance and count fail closed', () => {
  for (const edit of [
    (m: ReturnType<typeof replay>['manifest']) => { m.responses.pop(); },
    (m: ReturnType<typeof replay>['manifest']) => { m.sessions[1] = m.sessions[0]; },
    (m: ReturnType<typeof replay>['manifest']) => { m.responses[0].sourceUrl = tpexMarketFlowCsvUrl(day); },
    (m: ReturnType<typeof replay>['manifest']) => { m.responses[0].rawSha256 = '0'.repeat(64); },
    (m: ReturnType<typeof replay>['manifest']) => { m.responses[0].capturedAt = '2026-11-15'; },
    (m: ReturnType<typeof replay>['manifest']) => { m.responses[0].mediaType = 'text/html'; },
  ]) {
    const { bodies, manifest } = replay();
    edit(manifest);
    assert.throws(() => parseTpexMarketFlowReplay(manifest, bodies));
  }
});

/** Synthetic BFI82U report with a nonzero foreign-dealer control. MS950 bytes
 * are literal so the test uses the same decoder as the official report. */
const twseReport = Buffer.from('IjExNaZ+MTGk6zEzpOkgpFSkaqprpEi2Ur3mqvfDQrLOrXCq7SINCiKz5qbsple62SIsIrZStmmq98NCIiwivealWKr3w0IiLCK2Ur3mrnTDQiIsDQoiptvA57DTKKbbpua2Ur3mKSIsIjMwMCIsIjIwMCIsIjEwMCIsDQoiptvA57DTKMHXwEkpIiwiMTAiLCI3MCIsIi02MCIsDQoip+urSCIsIjcwIiwiNzAiLCIwIiwNCiKlfrjqpM6zsLjqKKSjp3SlfrjqptvA57DTKSIsIjIsMDAwIiwiMSwwMDAiLCIxLDAwMCIsDQoipX646qbbwOew0yIsIjIwMCIsIjEwMCIsIjEwMCIsDQoiplitcCIsIjIsMzgwIiwiMSwzNDAiLCIxLDA0MCIsDQoiu6Gp+joiDQoiZml4dHVyZSINCg==', 'base64');
function twseCsv(session: string, edit = (text: string) => text) {
  return Buffer.from(edit(twseReport.toString('latin1').replace('13', session.slice(-2))), 'latin1');
}

function paired() {
  const bodies = new Map<string, Uint8Array>();
  const responses = sessions.flatMap(session => (['TWSE', 'TPEX'] as const).map(market => {
    const twse = market === 'TWSE';
    const path = 'bodies/' + market + '-' + session + '.csv';
    const bytes = twse ? twseCsv(session) : csv(session);
    bodies.set(path, bytes);
    return { market, session, body: { encoding: 'file', path }, bytes: bytes.byteLength,
      capturedAt: capture, httpStatus: 200, mediaType: twse ? 'text/csv;charset=ms950' : 'application/csv;charset=utf-8',
      sourceUrl: twse ? twseMarketFlowCsvUrl(session) : tpexMarketFlowCsvUrl(session), rawSha256: createHash('sha256').update(bytes).digest('hex') };
  }));
  return { bodies, manifest: { schema: MARKET_FLOW_PAIR_SCHEMA, cutoff, sessions: [...sessions], responses } };
}

test('TWSE date-bearing MS950 report excludes foreign dealers from the matched TWD series', () => {
  assert.match(twseMarketFlowCsvUrl(day), /dayDate=20261113&type=day&response=csv$/u);
  const row = parseTwseMarketFlowCsv(day, twseCsv(day));
  assert.equal(row.foreignExcludingDealersNetTwd, 1000);
  assert.equal(row.foreignIncludingDealersNetTwd, 1100);
  assert.throws(() => twseMarketFlowCsvUrl('2004-04-06'));
  assert.throws(() => parseTwseMarketFlowCsv('2026-11-12', twseCsv(day)));
});

test('TWSE refuses wrong titles, duplicate categories, wrong money, and extra data in notes', () => {
  assert.throws(() => parseTwseMarketFlowCsv(day, new TextEncoder().encode('unit,buy,sell,diff')));
  for (const edit of [
    (s: string) => s.replace('115', '114'),
    (s: string) => { const rows = s.split('\r\n'); rows[3] = rows[2]; return rows.join('\r\n'); },
    (s: string) => s.replace('1,040', '1,140'),
    (s: string) => s.replace('2,000', '2,000.5'),
    (s: string) => s.replace('"fixture"', '"fixture",0'),
  ]) assert.throws(() => parseTwseMarketFlowCsv(day, twseCsv(day, edit)), /twse_market_flow_replay_refused/u);
});

test('paired one-day and five-day sums align exact dates and exclude foreign dealers on both venues', () => {
  const { manifest, bodies } = paired();
  const replay = parseMarketFlowPairReplay(manifest, bodies);
  assert.deepEqual(replay.markets, { TWSE: { oneDayTwd: 1000, fiveDayTwd: 5000 }, TPEX: { oneDayTwd: -1500, fiveDayTwd: -7500 } });
  assert.deepEqual(replay.combined, { oneDayTwd: -500, fiveDayTwd: -2500 });
  assert.equal(replay.receipts.TWSE[0].officialPublishedAt, null);
  assert.equal(replay.sourceAuthority, false);
  assert.equal(replay.marketAuthority, false);
  assert.equal(replay.publicationAuthority, false);
});

test('pair rejects missing or swapped venues, wrong report digest, fallback transport, and cutoff leakage', () => {
  type Manifest = ReturnType<typeof paired>['manifest'];
  for (const edit of [
    (m: Manifest) => { m.responses.pop(); },
    (m: Manifest) => { [m.responses[0], m.responses[1]] = [m.responses[1], m.responses[0]]; },
    (m: Manifest) => { m.responses[0].rawSha256 = '0'.repeat(64); },
    (m: Manifest) => { m.responses[0].sourceUrl = m.responses[0].sourceUrl.replace('response=csv', 'response=open_data'); },
    (m: Manifest) => { m.responses[0].mediaType = 'text/csv;charset=utf-8'; },
    (m: Manifest) => { m.responses[0].capturedAt = m.sessions[0] + 'T13:29:59+08:00'; },
    (m: Manifest) => { m.cutoff = '2026-11-13T21:30:00+08:00'; },
  ]) {
    const { manifest, bodies } = paired();
    edit(manifest);
    assert.throws(() => parseMarketFlowPairReplay(manifest, bodies));
  }
});
