import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { inspectLaunchDisposition, launchDispositionSource } from './launch-disposition-status.ts';

const twse = '編號,公布日期,證券代號,證券名稱,累計,處置條件,處置起迄時間,處置措施,處置內容,備註\n';
const tpex = '公布日期,證券代號,證券名稱,處置起訖時間,處置原因,處置內容\n';
const day = '2026-11-16', cutoff = day + 'T21:30:00+08:00';
function capture(market: 'TWSE' | 'TPEX', text: string) {
  const body = Buffer.from(text);
  return { ...launchDispositionSource(market), body, sha256: createHash('sha256').update(body).digest('hex'),
    observedAt: day + 'T21:28:01.000001+08:00', recordedAt: day + 'T21:28:02+08:00' };
}
const listed = '1,1151109,1234,測試,1,條件,115/11/10～115/11/16,措施,"內容,明細",\n';
const future = '2,1151116,2345,測試,1,條件,115/11/17～115/11/24,措施,內容,\n';
const otc = '1151110,3456,測試,1151111~1151117,原因,內容\n';

test('TWSE preserves inclusive end and ignores a future restriction visible in the same file', () => {
  const observed = inspectLaunchDisposition('TWSE', capture('TWSE', twse + listed + future), day, cutoff);
  assert.deepEqual([...observed.restrictedSymbols], ['1234']);
  assert.equal(observed.summary.noticesInEffect, 1);
  assert.equal(observed.summary.completeAbsenceProved, false);
});

test('TPEx uses its own interval and permits distinct overlapping notices for the same symbol', () => {
  const repeated = '1151112,3456,測試,1151113~1151118,原因,內容\n';
  const observed = inspectLaunchDisposition('TPEX', capture('TPEX', tpex + otc + repeated), day, cutoff);
  assert.deepEqual([...observed.restrictedSymbols], ['3456']);
  assert.equal(observed.summary.noticesInEffect, 2);
});

test('late or other-date capture keeps the restriction unusable and absence unknown', () => {
  const input = capture('TPEX', tpex + otc);
  for (const revision of [{ ...input, recordedAt: cutoff.replace('00+08', '00.000001+08') },
    { ...input, observedAt: '2026-11-15T21:29:00+08:00' }]) {
    const observed = inspectLaunchDisposition('TPEX', revision, day, cutoff);
    assert.equal(observed.summary.usableAtCutoff, false);
    assert.equal(observed.summary.completeAbsenceProved, false);
    assert.equal(observed.restrictedSymbols.size, 0);
  }
  const empty = inspectLaunchDisposition('TPEX', capture('TPEX', tpex), day, cutoff);
  assert.equal(empty.summary.completeAbsenceProved, false);
  assert.equal(empty.restrictedSymbols.size, 0);
});

test('refuses malformed calendar days, intervals, source identity and corrupted bytes', () => {
  for (const reported of [listed.replace('11/10', '02/30'), listed.replace('11/16', '11/09'),
    listed.replace('1151109', '1151117'), listed.replace('1151109', '1151111')]) {
    assert.throws(() => inspectLaunchDisposition('TWSE', capture('TWSE', twse + reported), day, cutoff), /disposition_report_refused/u);
  }
  const input = capture('TWSE', twse + listed);
  for (const revision of [{ ...input, url: input.url + '&date=20261116' }, { ...input, sha256: '0'.repeat(64) },
    { ...input, datasetId: 11396 }, { ...input, recordedAt: day + 'T21:28:01.000000+08:00' }]) {
    assert.throws(() => inspectLaunchDisposition('TWSE', revision, day, cutoff), /disposition_report_refused/u);
  }
});

test('refuses an announcement dated later than the provider observation', () => {
  const input = capture('TWSE', twse + future.replace('1151116', '1151117'));
  assert.throws(() => inspectLaunchDisposition('TWSE', input, day, cutoff), /disposition_report_refused/u);
});

test('exact official TWSE session query is bound to the requested date and interval', () => {
  const input = { ...capture('TWSE', twse + listed), ...launchDispositionSource('TWSE', day) };
  const observed = inspectLaunchDisposition('TWSE', input, day, cutoff);
  assert.equal(observed.summary.requestScope, 'exact_session');
  assert.deepEqual([...observed.restrictedSymbols], ['1234']);
  assert.throws(() => inspectLaunchDisposition('TWSE', { ...input, ...launchDispositionSource('TWSE', '2026-11-15') }, day, cutoff),
    /disposition_report_refused/u);
  const outOfInterval = { ...capture('TWSE', twse + future), ...launchDispositionSource('TWSE', day) };
  assert.throws(() => inspectLaunchDisposition('TWSE', outOfInterval, day, cutoff), /disposition_report_refused/u);
});
