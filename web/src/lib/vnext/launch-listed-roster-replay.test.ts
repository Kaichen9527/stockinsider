import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { decodeLicensedCsvRecords } from './licensed-csv-decoder.ts';
import { LISTED_ROSTER_REPLAY_SCHEMA, analyzeListedRosterReplay, parseListedRosterReplay } from './launch-listed-roster-replay.ts';

const mops = [
  '出表日期', '公司代號', '公司名稱', '公司簡稱', '外國企業註冊地國', '產業別', '住址', '營利事業統一編號',
  '董事長', '總經理', '發言人', '發言人職稱', '代理發言人', '總機電話', '成立日期', '上市日期', '普通股每股面額',
  '實收資本額', '私募股數', '特別股', '編制財務報表類型', '股票過戶機構', '過戶電話', '過戶地址',
  '簽證會計師事務所', '簽證會計師1', '簽證會計師2', '英文簡稱', '英文通訊地址', '傳真機號碼', '電子郵件信箱',
  '網址', '已發行普通股數或TDR原股發行股數',
];
const custody = [
  '證券代號', '證券名稱', '市場別', '股務單位', '停止過戶領回', '證券狀態', '無面無實體', '歸戶領回',
  '限制部分帳簿劃撥功能註記', '發行幣別', '每股面額(元)', '更新日期',
];
const sampleSymbol = '8146';
const capture = '2026-11-13T12:00:00Z';
const cutoff = '2026-11-13T21:30:00+08:00';
const sourceUrls = ['https://mopsfin.twse.com.tw/opendata/t187ap03_L.csv', 'https://mopsfin.twse.com.tw/opendata/t187ap03_O.csv',
  'https://opendata.tdcc.com.tw/getOD.ashx?id=1-1'];

function csv(rows: string[][]) {
  return Buffer.from('\uFEFF' + rows.map(row => row.map(cell => '"' + cell.replaceAll('"', '""') + '"').join(',')).join('\r\n') + '\r\n');
}

function company(symbol: string, listingDay = '20001123', reportDay = '1151113') {
  const row = Array<string>(mops.length).fill('');
  row[0] = reportDay; row[1] = symbol; row[2] = 'SYNTHETIC, "private name"';
  row[15] = listingDay;
  return row;
}

function holding(symbol: string, venue: string, status = '正常', reportDay = '20261113') {
  const row = Array<string>(custody.length).fill('');
  row[0] = symbol; row[1] = 'SYNTHETIC'; row[2] = venue; row[5] = status; row[11] = reportDay;
  return row;
}

function fixture() {
  const listed = [company(sampleSymbol), company('2330'), company('2718', '20261130'), company('3333'),
    company('4444'), company('5555'), company('910001')];
  const otc = [company('5274'), company('2330')];
  const holdings = [
    holding(sampleSymbol, '上市'), holding('2330', '上市'), holding('2718', '上市'), holding('3333', '終止上市櫃', '減資/停止帳簿劃撥'),
    holding('5555', '上市', '減資/停止帳簿劃撥'), holding('5274', '上櫃'), holding('7384', '上市'), holding('0050', '上市'),
  ];
  const write = () => {
    const bodies = [
      csv([mops, ...listed]),
      csv([mops.map(name => name === '上市日期' ? '上櫃日期' : name), ...otc]),
      csv([custody, ...holdings]),
    ];
    const files = new Map<string, Uint8Array>();
    const responses = bodies.map((bytes, index) => {
      const path = 'bodies/source-' + index + '.csv';
      files.set(path, bytes);
      return { datasetId: [18419, 25036, 11425][index], url: sourceUrls[index], receivedAt: capture,
        sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.byteLength, body: { encoding: 'file', path } };
    });
    return { value: { schema: LISTED_ROSTER_REPLAY_SCHEMA, targetSession: '2026-11-13', cutoff, responses }, files };
  };
  return { listed, otc, holdings, write };
}

test('preserves every cutoff roster mismatch without treating custody as exchange authority', () => {
  const { value, files } = fixture().write();
  const actual = parseListedRosterReplay(value, files);
  assert.equal(actual.qualified, false);
  assert.equal(actual.sameSessionByCutoff, true);
  assert.equal(actual.custodianOtherFourDigitRows, 1);
  assert.deepEqual(actual.venues?.TWSE.gaps, { crossVenueCompanyClaim: 1, futureListing: 1, custodyMissing: 1,
    custodyMarketMismatch: 1, custodyStatusRestricted: 1, custodyOnly: 1 });
  assert.equal(actual.venues?.TWSE.corroboratedCodes, 1);
  assert.equal(actual.venues?.TWSE.excludedOtherCodes, 1);
  assert.equal(actual.venues?.TPEX.corroboratedCodes, 1);
  assert.equal(actual.venues?.TPEX.gaps.crossVenueCompanyClaim, 1);
  assert.ok(!JSON.stringify(actual).includes('SYNTHETIC'));
  assert.ok(!JSON.stringify(actual).includes('"8146"'));
});

test('a late capture, shifted target or mismatched document dates never prove a same-session capture', () => {
  const original = fixture().write();
  original.value.responses[0].receivedAt = '2026-11-13T13:30:00.000001Z';
  assert.equal(parseListedRosterReplay(original.value, original.files).sameSessionByCutoff, false);
  original.value.responses[0].receivedAt = '2026-11-12T17:00:00Z';
  assert.equal(parseListedRosterReplay(original.value, original.files).sameSessionByCutoff, true);
  original.value.responses[0].receivedAt = '2026-11-12T15:00:00Z';
  assert.equal(parseListedRosterReplay(original.value, original.files).sameSessionByCutoff, false);
  original.value.targetSession = '2026-11-12';
  assert.throws(() => parseListedRosterReplay(original.value, original.files));

  const mismatch = fixture();
  for (const row of mismatch.otc) row[0] = '1151112';
  const shifted = mismatch.write();
  const receipt = parseListedRosterReplay(shifted.value, shifted.files);
  assert.equal(receipt.comparableSourceDates, false);
  assert.equal(receipt.sameSessionByCutoff, false);
  assert.equal(receipt.venues, null);
});

test('refuses mismatched byte receipts, host paths, ambiguous company/custody rows and invalid dates', () => {
  const { value, files } = fixture().write();
  value.responses[0].sha256 = '0'.repeat(64);
  assert.throws(() => parseListedRosterReplay(value, files));
  value.responses[0].sha256 = createHash('sha256').update(files.get(value.responses[0].body.path)!).digest('hex');
  value.responses[0].url += '?redirect';
  assert.throws(() => parseListedRosterReplay(value, files));
  for (const variant of ['duplicateCompany', 'duplicateSecurity', 'mixedReportDate', 'invalidListingDate']) {
    const f = fixture();
    if (variant === 'duplicateCompany') f.listed.push(company(sampleSymbol));
    if (variant === 'duplicateSecurity') f.holdings.push(holding(sampleSymbol, '終止上市櫃'));
    if (variant === 'mixedReportDate') f.holdings[0][11] = '20261112';
    if (variant === 'invalidListingDate') f.listed[0][15] = '20260231';
    const n = f.write();
    assert.throws(() => parseListedRosterReplay(n.value, n.files), { name: 'Error' }, variant);
  }
});

test('classifies only corroborated identities from a timely snapshot, preserving unknown values', () => {
  const input = fixture();
  input.listed[0][5] = '36';
  input.listed[1][5] = '24'; // Conflicting venue.
  input.listed[2][5] = '24'; // Future listing.
  input.listed[5][5] = '24'; // Custodian restricted.
  input.otc[0][5] = '99';
  const {value, files} = input.write();
  const result = parseListedRosterReplay(value, files);
  assert.deepEqual(result.industriesAtCutoff, {
    TWSE: {byCode: {'36': 1}, unknown: 0},
    TPEX: {byCode: {}, unknown: 1},
  });
  value.responses[1].receivedAt = '2026-11-13T13:30:00.000001Z';
  assert.equal(parseListedRosterReplay(value, files).industriesAtCutoff, null);
  value.responses[1].receivedAt = '2026-11-12T15:59:59Z';
  assert.equal(parseListedRosterReplay(value, files).industriesAtCutoff, null);

  for (const response of value.responses) response.receivedAt = '2026-11-16T01:00:00Z';
  value.targetSession = '2026-11-16';
  value.cutoff = '2026-11-16T21:30:00+08:00';
  const laterSession = parseListedRosterReplay(value, files);
  assert.equal(laterSession.sameSessionByCutoff, false);
  assert.deepEqual(laterSession.industriesAtCutoff, result.industriesAtCutoff);
});

test('keeps the shared decoder default at 32 columns', () => {
  const line = Array<string>(33).fill('safe').join(',');
  assert.throws(() => decodeLicensedCsvRecords(line, 1), /column_bound/);
  assert.equal(decodeLicensedCsvRecords(line, 1, 33)[0].length, 33);
});

test('private review preserves code-level conflicts and strips names and raw custody fields', () => {
  const { value, files } = fixture().write();
  const { summary, reviews } = analyzeListedRosterReplay(value, files);
  assert.deepEqual(summary, parseListedRosterReplay(value, files));
  assert.deepEqual(reviews?.TWSE.find(row => row.code === '3333'), {
    code: '3333', listingDate: '2000-11-23', finding: 'custodyMarketMismatch', custodyMarket: '終止上市櫃',
  });
  assert.deepEqual(reviews?.TWSE.find(row => row.code === '7384'), {
    code: '7384', listingDate: null, finding: 'custodyOnly', custodyMarket: '上市',
  });
  assert.ok(!JSON.stringify(reviews).includes('SYNTHETIC'));
  assert.ok(!JSON.stringify(reviews).includes('減資'));

  const shifted = fixture();
  for (const row of shifted.otc) row[0] = '1151112';
  const invalid = shifted.write();
  assert.equal(analyzeListedRosterReplay(invalid.value, invalid.files).reviews, null);
});
