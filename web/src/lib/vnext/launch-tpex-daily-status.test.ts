import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { inspectTpexDailyStatus, TPEX_DAILY_STATUS_SOURCE } from './launch-tpex-daily-status.ts';

const header = '資料日期,證券代號,證券名稱,變更交易,分盤交易,管理股票,分盤或管理股票撮合循環時間,停止交易,財務重點專區';
const rows = ['1151113,1234,測試A,,,,,Ｙ,Ｙ', '1151113,4567,測試B,Ｙ,Ｙ,,030,,Ｙ', '1151113,7890,測試C,Ｙ,,,,,Ｙ'];
const cutoff = '2026-11-13T21:30:00+08:00';
function capture(content = rows, receivedAt = '2026-11-13T21:24:00+08:00') {
  const body = Buffer.from('\uFEFF' + [header, ...content].join('\r\n') + '\r\n');
  return { datasetId: 11736, url: TPEX_DAILY_STATUS_SOURCE.url, receivedAt, bytes: body.length,
    sha256: createHash('sha256').update(body).digest('hex'), body };
}

test('only the explicit exchange stop flag yields positive suspension evidence', () => {
  const actual = inspectTpexDailyStatus(capture(), '2026-11-13', cutoff);
  assert.equal(actual.summary.sameSessionByCutoff, true);
  assert.equal(actual.summary.reportedRows, 3);
  assert.equal(actual.summary.positiveSuspensions, 1);
  assert.equal(actual.summary.completeAbsenceProved, false);
  assert.deepEqual([...actual.timelySuspensions], ['1234']);
});

test('the same report downloaded later is useful for history and never replayed as known by cutoff', () => {
  const actual = inspectTpexDailyStatus(capture(rows, '2026-11-15T21:24:00+08:00'), '2026-11-13', cutoff);
  assert.equal(actual.summary.reportDate, '2026-11-13');
  assert.equal(actual.summary.positiveSuspensions, 1);
  assert.equal(actual.summary.sameSessionByCutoff, false);
  assert.equal(actual.timelySuspensions.size, 0);
  const epsilonLate = inspectTpexDailyStatus(capture(rows, '2026-11-13T13:30:00.000001Z'), '2026-11-13', cutoff);
  assert.equal(epsilonLate.timelySuspensions.size, 0);
});

test('an empty report does not carry its own session and never asserts all-clear', () => {
  const result = inspectTpexDailyStatus(capture([]), '2026-11-13', cutoff);
  assert.equal(result.summary.reportDate, null);
  assert.equal(result.summary.sameSessionByCutoff, false);
  assert.equal(result.summary.completeAbsenceProved, false);
});

test('rejects changed status codes, duplicate or mixed date rows, redirects, and mismatched bytes', () => {
  const invalidRows = [rows.join('\n').replace('Ｙ', 'Y').split('\n'), [...rows, rows[0]],
    [rows[0], rows[1].replace('1151113', '1151112')], [rows[0].replace('1151113', '1150231')]];
  for (const invalid of invalidRows) assert.throws(() => inspectTpexDailyStatus(capture(invalid), '2026-11-13', cutoff));
  assert.throws(() => inspectTpexDailyStatus({ ...capture(), url: 'https://other.invalid/' }, '2026-11-13', cutoff));
  assert.throws(() => inspectTpexDailyStatus({ ...capture(), bytes: 1 }, '2026-11-13', cutoff));
  assert.throws(() => inspectTpexDailyStatus({ ...capture(), sha256: '0'.repeat(64) }, '2026-11-13', cutoff));
});
