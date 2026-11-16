import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { compareLaunchDispositionReports, inspectLaunchDispositionRange, launchDispositionRangeUrl } from './launch-disposition-range.ts';
import { launchDispositionSource, TWSE_DISPOSITION_FIELDS } from './launch-disposition-status.ts';

const day = '2026-11-16';
const cutoff = day + 'T21:30:00+08:00';
const twse = {
  stat: 'OK', title: '公布處置有價證券資訊 (115/11/16 至 115/11/16)', fields: TWSE_DISPOSITION_FIELDS,
  count: 1, total: 2,
  data: [[1, '115/11/10', '1234', '測試', 1, '', '115/11/11～115/11/17', '', '', ''],
    [1, '115/11/12', '888881', '測試', 1, '', '115/11/13～115/11/16', '', '', '']],
};
const blank = [1, '115/11/16', '', ' ', '', '', '', '', '本日無處置資料', '', '', ''];
const otc = [2, '115/11/11', '4567', '測試', 1, '115/11/12~115/11/16', '', '', '', '', '', ''];
const tpex = {
  date: '20261116~20261116', stat: 'ok',
  tables: [{
    title: '上櫃處置有價證券', title2: '處置期間為 115/11/16 ~ 115/11/16', startDate: '115/11/16', endDate: '115/11/16',
    searchArea: '全部上櫃有價證券', subtitle2: '查詢範圍：全部上櫃有價證券', subtitle: '證券個數:1 總累計次數: 1',
    fields: ['編號', '公布日期', '證券代號', '證券名稱', '累計', '處置起訖時間', '處置原因', '處置措施', '處置內容', '收盤價', '本益比', ' '],
    data: [blank, otc],
  }],
};

function capture(url: string, text: string) {
  const body = Buffer.from(text);
  return { url, body, sha256: createHash('sha256').update(body).digest('hex'),
    observedAt: day + 'T21:29:00.000001+08:00', recordedAt: day + 'T21:29:01+08:00' };
}
const range = (venue: 'TWSE' | 'TPEX', value: unknown) => capture(launchDispositionRangeUrl(venue, day), JSON.stringify(value));
const csv = (rows: string) => ({ ...capture(launchDispositionSource('TWSE', day).url, TWSE_DISPOSITION_FIELDS.join(',') + '\n' + rows), datasetId: 29082 });
const matching = '1,1151110,1234,測試,1,,115/11/11～115/11/17,,,\n';

test('TWSE uses the declared total and the exact date, independent of the page-size hint', () => {
  const report = inspectLaunchDispositionRange('TWSE', range('TWSE', twse), day, cutoff);
  assert.deepEqual([...report.restrictedSymbols], ['1234']);
  assert.equal(report.noticeCount, 2);
  assert.equal(report.symbolCount, 2);
  assert.equal(report.timely, true);
  for (const doc of [{ ...twse, data: twse.data.slice(0, 1) }, { ...twse, title: twse.title.replaceAll('11/16', '11/15') },
    { ...twse, data: [[1, '115/11/10', '1234', '測試', 1, '', '115/11/11～115/11/15', '', '', ''], twse.data[1]] }]) {
    assert.throws(() => inspectLaunchDispositionRange('TWSE', range('TWSE', doc), day, cutoff), /range_refused/u);
  }
});

test('TPEx reports no new announcement alongside an earlier notice that is still in force', () => {
  const report = inspectLaunchDispositionRange('TPEX', range('TPEX', tpex), day, cutoff);
  assert.deepEqual([...report.restrictedSymbols], ['4567']);
  assert.equal(report.noticeCount, 1);
  const table = tpex.tables[0];
  for (const bad of [{ ...table, subtitle: '證券個數:2 總累計次數: 1' },
    { ...table, subtitle: '證券個數:1 總累計次數: 2' }, { ...table, searchArea: '個別上櫃有價證券' },
    { ...table, data: [blank, blank, otc] }, { ...table, data: [[...blank.slice(0, 8), '其他文字', '', '', ''], otc] },
    { ...table, data: [blank, [2, '115/11/16', '4567', '測試', 1, '115/11/16~115/11/17', '', '', '', '', '', '']] }]) {
    assert.throws(() => inspectLaunchDispositionRange('TPEX', range('TPEX', { ...tpex, tables: [bad] }), day, cutoff), /range_refused/u);
  }
});

test('range proof and notice capture must agree and both must be recorded by the cutoff', () => {
  const input = range('TWSE', twse);
  assert.equal(compareLaunchDispositionReports('TWSE', input, csv(matching), day, cutoff).confirmed, true);
  const disagreement = compareLaunchDispositionReports('TWSE', input, csv(''), day, cutoff);
  assert.equal(disagreement.reportsAgree, false);
  assert.equal(disagreement.confirmed, false);
  const late = compareLaunchDispositionReports('TWSE', { ...input, recordedAt: day + 'T21:30:00.000001+08:00' }, csv(matching), day, cutoff);
  assert.equal(late.reportsAgree, true);
  assert.equal(late.confirmed, false);
});

test('blocks response hash, URL, scope or clock substitutions', () => {
  const input = range('TWSE', twse);
  for (const corrupt of [{ ...input, sha256: '0'.repeat(64) }, { ...input, url: input.url + '&stockNo=1234' },
    { ...input, recordedAt: day + 'T21:28:59+08:00' }]) {
    assert.throws(() => inspectLaunchDispositionRange('TWSE', corrupt, day, cutoff), /range_refused/u);
  }
  assert.throws(() => launchDispositionRangeUrl('TPEX', '2026-02-31'), /range_refused/u);
});

test('empty CSV needs an explicit dated zero-count success from the exchange', () => {
  const empty = range('TWSE', { ...twse, count: 0, total: 0, data: [] });
  assert.equal(compareLaunchDispositionReports('TWSE', empty, csv(''), day, cutoff).confirmed, true);
  const noRecords = range('TWSE', { stat: '很抱歉，沒有符合條件的資料!' });
  assert.throws(() => compareLaunchDispositionReports('TWSE', noRecords, csv(''), day, cutoff), /range_refused/u);
});
