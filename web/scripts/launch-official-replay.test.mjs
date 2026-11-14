import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const repo = fileURLToPath(new URL('../../', import.meta.url)), script = fileURLToPath(new URL('./launch-official-replay.mjs', import.meta.url));
const work = path.join(repo, 'work');
const receipt = { schema: 'stockinsider-official-launch-window-observation-v1', marketIndex: { months: [] }, chipWindow: { rows: [] } };
function fixture() {
  const root = fs.mkdtempSync(path.join(work, 'official-replay-cli-fixture-'));
  fs.chmodSync(root, 0o700);
  const input = path.join(root, 'metadata.json'); fs.writeFileSync(input, JSON.stringify(receipt), { mode: 0o600 });
  return { root, input };
}
function run(root, mode, input) {
  return spawnSync(process.execPath, ['--no-warnings', '--experimental-strip-types', script, '--root', root, mode, input],
    { cwd: repo, encoding: 'utf8', timeout: 10000, env: { PATH: '/usr/bin:/bin' } });
}
// Synthetic native-share rows exercise the byte importer, not real acquisition
// or the private selected-price/calendar/action overlay required by scoring.
function nativeFixture({ changedIssuedShares = false, absent = false } = {}) {
  const { root } = fixture(), directory = path.join(root, 'bodies'); fs.mkdirSync(directory, { mode: 0o700 });
  const sessions = ['2026-11-12', '2026-11-13'], observedAt = '2026-11-14T18:00:00Z';
  const headers = ['資料日期', '代號', '名稱', '收盤', '漲跌', '開盤', '最高', '最低', '成交股數', '成交金額', '成交筆數', '最後買價', '最後賣價', '發行股數', '次日漲停價', '次日跌停價'];
  const responses = sessions.map((session, index) => {
    const issued = changedIssuedShares && index === 1 ? '1,100,000' : '1,000,000';
    const rows = ['5274', '6488'].map(symbol => [`115/11/${session.slice(8)}`, symbol, 'SYNTHETIC_NATIVE_FIXTURE', '101', '1', '100', '102', '99', '10,000', '1,010,000', '100', '100', '101', issued, '111', '91']);
    const bytes = '\uFEFF' + [headers, ...rows].map(row => row.map(cell => `"${cell.replaceAll('"', '""')}"`).join(',')).join('\r\n') + '\r\n';
    const filename = `bodies/${session}.csv`; fs.writeFileSync(path.join(root, filename), bytes, { mode: 0o600 });
    return { session, sourceUrl: `https://www.tpex.org.tw/web/stock/aftertrading/otc_quotes_no1430/stk_wn1430_result.php?l=zh-tw&o=data&se=EW&d=115%2F11%2F${session.slice(8)}`,
      observedAt, publisherPublishedAt: null, httpStatus: 200, redirectCount: 0, contentType: 'text/csv', bytes: Buffer.byteLength(bytes),
      rawSha256: createHash('sha256').update(bytes).digest('hex'), body: absent ? { encoding: 'absent' } : { encoding: 'file', path: filename } };
  });
  const manifest = { schema: 'launch-tpex-11371-native-shares-v1', datasetId: 11371, symbol: '6488', cutoff: '2026-11-15T00:00:00Z',
    capture: { repository: 'fixture/offline', sourceCommit: 'f'.repeat(40), workflowPath: null, runId: null, runAttempt: null, startedAt: '2026-11-14T17:00:00Z', completedAt: observedAt },
    sessions, responses };
  const input = path.join(root, 'native-manifest.json');
  const save = () => fs.writeFileSync(input, JSON.stringify(manifest), { mode: 0o600 }); save();
  return { root, input, manifest, save };
}
function refused(result) {
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.equal(result.stderr, 'official_exchange_replay_refused\n');
}
function institutionalFixture({ absent=false, large=false }={}) {
  const f=nativeFixture();
  Object.assign(f.manifest,{schema:'launch-tpex-11370-institutional-volume-v1',datasetId:11370});
  const header=['資料日期','代號','名稱','收盤','漲跌','開盤','最高','最低','均價','成交股數','成交金額','成交筆數','最後買價','最後賣價','發行股數','次日參考價','次日漲停價','次日跌停價'];
  for(const [index,page] of f.manifest.responses.entries()) {
    const row=symbol=>[`115/11/${page.session.slice(8)}`,symbol,'SYNTHETIC_ALL_SESSION','101','0','100','102','99','101','50,001','5,000,000','100','100','101','150,000,000','100','110','90'];
    const rows=[header,row('6488'),row('5274'),...(large&&index===0?Array.from({length:15998},(_,i)=>row(`W${String(i).padStart(5,'0')}`)):[])];
    const bytes='\uFEFF'+rows.map(values=>values.map(value=>`"${value}"`).join(',')).join('\r\n')+'\r\n';
    fs.writeFileSync(path.join(f.root,page.body.path),bytes,{mode:0o600});
    Object.assign(page,{sourceUrl:`https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=2026%2F11%2F${page.session.slice(8)}&response=data&type=DailyClose`,
      bytes:Buffer.byteLength(bytes),rawSha256:createHash('sha256').update(bytes).digest('hex'),body:absent?{encoding:'absent'}:page.body});
  }
  f.save();return f;
}
test('offline CLI reads only explicit private work inputs and emits metadata, never raw data or rights', () => {
  const { root, input } = fixture(), result = run(root, '--receipt', input);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.scope, 'externally_reported_metadata_only');
  assert.equal(output.rawBodiesAvailable, false); assert.equal(output.redistributionAuthority, false);
});
test('offline CLI imports an actual bounded synthetic byte member without emitting its rows or transient contents', () => {
  const { root } = fixture(), directory = path.join(root, 'bodies'); fs.mkdirSync(directory, { mode: 0o700 });
  const marker = 'transient_fixture_marker_do_not_emit', bytes = JSON.stringify({ stat: 'OK', fields: ['日期', '收盤指數'], data: [['115/11/13', '1000']], marker }, null, 2);
  fs.writeFileSync(path.join(directory, 'index.json'), bytes, { mode: 0o600 });
  const observedAt = '2026-11-14T17:00:00Z', input = path.join(root, 'manifest.json');
  fs.writeFileSync(input, JSON.stringify({ schema: 'launch-official-public-replay-v1', parserContract: 'twse-t86-taiex-and-tpex-dailytrade-inx-v1',
    targets: [{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }], throughSessions: ['2026-11-12', '2026-11-13'], cutoff: '2026-11-15T00:00:00Z',
    capture: { repository: 'fixture/offline', sourceCommit: 'a'.repeat(40), workflowPath: '.github/workflows/fixture.yml', runId: '1', runAttempt: 1, startedAt: null, completedAt: observedAt },
    indexMonths: { TWSE: ['2026-11'], TPEX: [] }, flowSessions: [], schemaEvidence: [], responses: [{ market: 'TWSE', kind: 'index_month', requestKey: '2026-11',
      sourceUrl: 'https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?response=json&date=20261101', observedAt, publisherPublishedAt: null,
      httpStatus: 200, redirectCount: 0, contentType: 'application/json', bytes: Buffer.byteLength(bytes), rawSha256: createHash('sha256').update(bytes).digest('hex'),
      body: { encoding: 'file', path: 'bodies/index.json' } }] }), { mode: 0o600 });
  const result = run(root, '--manifest', input); assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.parsedPages, 1); assert.equal(output.responseReceipts[0].indexRows, 1);
  assert.equal(output.sourceAuthority, false); assert.ok(!result.stdout.includes(marker)); assert.ok(!result.stdout.includes('"close"'));
});
test('offline CLI dispatches licensed CSV with resource attribution and separate CSV hash provenance', () => {
  const { root } = fixture(), directory = path.join(root, 'bodies'); fs.mkdirSync(directory, { mode: 0o700 });
  const bytes = '\uFEFF"日期","開盤指數","最高指數","最低指數","收盤指數"\r\n"115/11/13","1,000","1,100","900","1,001"\r\n';
  fs.writeFileSync(path.join(directory, 'index.csv'), bytes, { mode: 0o600 });
  const observedAt = '2026-11-14T18:00:00Z', input = path.join(root, 'csv-manifest.json');
  fs.writeFileSync(input, JSON.stringify({ schema: 'launch-official-licensed-csv-v1', parserContract: 'gov-open-data-11755-11391-11856-csv-v1',
    targets: [{ market: 'TWSE', symbol: '2330' }, { market: 'TPEX', symbol: '6488' }], throughSessions: ['2026-11-12', '2026-11-13'], cutoff: '2026-11-15T00:00:00Z',
    capture: { repository: 'fixture/offline', sourceCommit: 'e'.repeat(40), workflowPath: null, runId: null, runAttempt: null, startedAt: null, completedAt: observedAt },
    indexMonths: { TWSE: ['2026-11'], TPEX: [] }, flowSessions: [], responses: [{ datasetId: 11755, market: 'TWSE', kind: 'index_month', requestKey: '2026-11',
      sourceUrl: 'https://www.twse.com.tw/indicesReport/MI_5MINS_HIST?response=open_data&date=20261101', observedAt, publisherPublishedAt: null,
      httpStatus: 200, redirectCount: 0, contentType: 'text/csv', bytes: Buffer.byteLength(bytes), rawSha256: createHash('sha256').update(bytes).digest('hex'),
      body: { encoding: 'file', path: 'bodies/index.csv' } }] }), { mode: 0o600 });
  const result = run(root, '--manifest', input); assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout); assert.equal(output.schema, 'launch-official-licensed-csv-v1');
  assert.equal(output.attributions[0].datasetId, 11755); assert.equal(output.attributions[0].datasetUrl, 'https://data.gov.tw/dataset/11755');
  assert.equal(output.attributions[0].licenseUrl, 'https://data.gov.tw/license'); assert.equal(output.sourceAuthority, false);
  assert.equal(output.responseReceipts[0].canonicalPayloadSha256, undefined);
  assert.notEqual(output.responseReceipts[0].rawSha256, output.responseReceipts[0].canonicalCsvRowsSha256);
});
test('offline CLI dispatches native11371 bytes once per symbol with attribution and no selected overlay authority', () => {
  const { root, input, manifest, save } = nativeFixture();
  for (const symbol of ['5274', '6488']) {
    manifest.symbol = symbol; save();
    const result = run(root, '--manifest', input); assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.schema, manifest.schema); assert.equal(output.symbol, symbol); assert.equal(output.parsedSessions, 2);
    assert.equal(output.declaredBytes, manifest.responses.reduce((sum, response) => sum + response.bytes, 0));
    assert.equal(output.decodedBytes, output.declaredBytes); assert.deepEqual(output.issuedShareChanges, []);
    assert.equal(output.attribution.datasetId, 11371); assert.equal(output.attribution.datasetUrl, 'https://data.gov.tw/dataset/11371');
    assert.equal(output.attribution.licenseUrl, 'https://data.gov.tw/license'); assert.equal(output.attribution.exchange, 'TPEX');
    assert.equal(output.sourceAuthority, false); assert.equal(output.publicationAuthority, false);
    assert.equal(output.instrumentQualificationAuthority, false); assert.equal(output.liquidityQualificationAuthority, false);
    assert.ok(output.gaps.includes('native_share_capture_workflow_identity_unverified'));
    assert.equal(output.responseReceipts.length, 2);
    assert.equal(output.responseReceipts[0].rawSha256, manifest.responses[0].rawSha256);
    assert.notEqual(output.responseReceipts[0].rawSha256, output.responseReceipts[0].csvRowsSha256);
    for (const quote of output.nextDayLimitQuotes) {
      assert.equal(quote.targetSession, null); assert.equal(quote.currentLimitAuthority, false); assert.equal(quote.onePriceLocked, null);
    }
    assert.ok(!result.stdout.includes('SYNTHETIC_NATIVE_FIXTURE')); assert.ok(!result.stdout.includes('"shares"'));
  }
});
test('offline CLI exposes an observed issued-share change interval without inventing event, effective session or factor', () => {
  const { root, input } = nativeFixture({ changedIssuedShares: true }), result = run(root, '--manifest', input);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.deepEqual(output.issuedShareChanges, [{ previousSession: '2026-11-12', currentSession: '2026-11-13',
    previousIssuedShares: 1000000, currentIssuedShares: 1100000, deltaShares: 100000, effectiveSession: null, eventKind: null, adjustmentFactor: null }]);
  assert.equal(output.sourceAuthority, false); assert.equal(output.publicationAuthority, false);
});
test('offline CLI native metadata-only manifests decode zero bytes and cannot establish native rows', () => {
  const { root, input, manifest } = nativeFixture({ absent: true }), result = run(root, '--manifest', input);
  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.decodedBytes, 0); assert.equal(output.parsedSessions, 0);
  assert.equal(output.declaredBytes, manifest.responses.reduce((sum, response) => sum + response.bytes, 0));
  assert.deepEqual(output.responseReceipts, []); assert.deepEqual(output.issuedShareChanges, []); assert.deepEqual(output.nextDayLimitQuotes, []);
  assert.ok(output.gaps.includes('native_share_raw_body_missing')); assert.equal(output.sourceAuthority, false);
});
test('offline CLI native import refuses hash, native page bound, symlink and private-path violations without disclosure', () => {
  const { root, input, manifest, save } = nativeFixture();
  const original = structuredClone(manifest.responses[0]);
  manifest.responses[0].rawSha256 = '0'.repeat(64); save(); refused(run(root, '--manifest', input));
  manifest.responses[0] = structuredClone(original);
  const oversized = path.join(root, 'bodies', 'large.csv'); fs.writeFileSync(oversized, ''); fs.truncateSync(oversized, 500001);
  manifest.responses[0].body.path = 'bodies/large.csv'; manifest.responses[0].bytes = 500001; save(); refused(run(root, '--manifest', input));
  manifest.responses[0] = structuredClone(original);
  const outside = fixture(); fs.symlinkSync(outside.input, path.join(root, 'bodies', 'linked.csv'));
  manifest.responses[0].body.path = 'bodies/linked.csv'; save(); refused(run(root, '--manifest', input));
  manifest.responses[0].body.path = 'bodies/../../private.csv'; save(); refused(run(root, '--manifest', input));
  manifest.responses[0] = original; save(); refused(run(root, '--manifest', outside.input));
  fs.chmodSync(root, 0o755); refused(run(root, '--manifest', input));
});
test('offline CLI dispatches distinct11370 profile with16000 data rows above11371 cap and immutable resource attribution',()=>{
  const {root,input,manifest,save}=institutionalFixture({large:true});
  assert.ok(manifest.responses[0].bytes>500000);assert.ok(manifest.responses[0].bytes<3*1024*1024);
  for(const symbol of ['5274','6488']) {
    manifest.symbol=symbol;save();const result=run(root,'--manifest',input);assert.equal(result.status,0,result.stderr);
    const output=JSON.parse(result.stdout);
    assert.equal(output.schema,'launch-tpex-11370-institutional-volume-v1');assert.equal(output.symbol,symbol);assert.equal(output.parsedSessions,2);
    assert.equal(output.decodedBytes,manifest.responses.reduce((sum,page)=>sum+page.bytes,0));assert.equal(output.declaredBytes,output.decodedBytes);
    assert.equal(output.attribution.datasetId,11370);assert.equal(output.attribution.datasetUrl,'https://data.gov.tw/dataset/11370');
    assert.equal(output.attribution.licenseUrl,'https://data.gov.tw/license');assert.equal(output.resourceMapping.legacyHistoricalFallback,false);
    assert.equal(output.sourceAuthority,false);assert.equal(output.publicationAuthority,false);assert.equal(output.rankingAuthority,false);
    assert.equal(output.observedShareRows.length,2);
    for(const [index,row] of output.observedShareRows.entries()) {
      assert.deepEqual(Object.keys(row).sort(),['issuedShares','observedAt','session','shares']);
      assert.equal(row.session,manifest.sessions[index]);assert.equal(row.observedAt,manifest.responses[index].observedAt);
      assert.equal(row.shares,50001);assert.equal(row.issuedShares,150000000);assert.ok(Number.isSafeInteger(row.shares)&&Number.isSafeInteger(row.issuedShares));
    }
    assert.notEqual(output.responseReceipts[0].rawSha256,output.responseReceipts[0].csvRowsSha256);
    assert.ok(!result.stdout.includes('SYNTHETIC_ALL_SESSION'));assert.ok(!result.stdout.includes('"tradedNtd"'));
  }
});
test('offline CLI11370 absence decodeszero; hash, legacydatedroute, profilepagebound and symlink negatives stay generic',()=>{
  const absent=institutionalFixture({absent:true}), result=run(absent.root,'--manifest',absent.input);assert.equal(result.status,0,result.stderr);
  const output=JSON.parse(result.stdout);assert.equal(output.decodedBytes,0);assert.equal(output.parsedSessions,0);assert.ok(output.declaredBytes>0);
  assert.deepEqual(output.observedShareRows,[]);
  assert.ok(output.gaps.includes('institutional_volume_raw_body_missing'));
  const {root,input,manifest,save}=institutionalFixture(), original=structuredClone(manifest.responses[0]);
  manifest.responses[0].rawSha256='0'.repeat(64);save();refused(run(root,'--manifest',input));
  manifest.responses[0]=structuredClone(original);manifest.responses[0].sourceUrl='https://www.tpex.org.tw/web/stock/aftertrading/DAILY_CLOSE_quotes/stk_quote_result.php?l=zh-tw&o=data&date=20261113';save();refused(run(root,'--manifest',input));
  manifest.responses[0]=structuredClone(original);const huge=path.join(root,'bodies','large11370.csv');fs.writeFileSync(huge,'');fs.truncateSync(huge,3*1024*1024+1);
  manifest.responses[0].body.path='bodies/large11370.csv';manifest.responses[0].bytes=3*1024*1024+1;save();refused(run(root,'--manifest',input));
  manifest.responses[0]=structuredClone(original);const outside=fixture();fs.symlinkSync(outside.input,path.join(root,'bodies','linked11370.csv'));
  manifest.responses[0].body.path='bodies/linked11370.csv';save();refused(run(root,'--manifest',input));
});
test('offline CLI rejects outside roots, symlinks, broad permissions and oversized input without path disclosure', () => {
  const { root, input } = fixture(), outside = fixture(), link = path.join(root, 'linked.json'); fs.symlinkSync(input, link);
  const huge = path.join(root, 'large.json'); fs.writeFileSync(huge, ''); fs.truncateSync(huge, 1048577);
  for (const candidate of [outside.input, link, huge]) {
    const result = run(root, '--receipt', candidate);
    assert.equal(result.status, 1);
    assert.equal(result.stdout, ''); assert.match(result.stderr, /official_exchange_replay_refused\s*$/u);
    assert.ok(!result.stderr.includes(candidate));
  }
  fs.chmodSync(root, 0o755);
  assert.equal(run(root, '--receipt', input).status, 1);
});
test('offline CLI refuses traversal/member symlinks and never follows a manifest descriptor outside its allowed directory', () => {
  const { root } = fixture(), outside = fixture(); fs.mkdirSync(path.join(root, 'bodies'), { mode: 0o700 });
  const memberLink = path.join(root, 'bodies', 'linked.json'); fs.symlinkSync(outside.input, memberLink);
  const input = path.join(root, 'manifest.json');
  for (const member of ['bodies/../../outside.json', 'bodies/linked.json']) {
    fs.writeFileSync(input, JSON.stringify({ responses: [{ bytes: 2, body: { encoding: 'file', path: member } }], schemaEvidence: [] }), { mode: 0o600 });
    const result = run(root, '--manifest', input);
    assert.equal(result.status, 1); assert.equal(result.stdout, '');
    assert.match(result.stderr, /official_exchange_replay_refused\s*$/u); assert.ok(!result.stderr.includes(outside.input));
  }
});
