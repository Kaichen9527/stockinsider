import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateOfficialWeeklyBars } from './research-weekly-bars.ts';

const bar = (session: string, close: number) => ({ session, high: close + 1, low: close - 1, close, volume: 100 });
test('a short holiday week is one complete Taiwan calendar week', () => {
  const result = aggregateOfficialWeeklyBars({
    bars: [bar('2026-09-23', 10), bar('2026-09-24', 12)],
    officialCompletedSessions: ['2026-09-23', '2026-09-24'],
    asOfSession: '2026-09-24', nextOfficialSession: '2026-09-29',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].weekStart, '2026-09-21');
  assert.equal(result[0].sessionCount, 2);
  assert.equal(result[0].status, 'complete');
  assert.equal(result[0].close, 12);
  assert.equal(result[0].volume, 200);
});
test('unfinished or missing sessions never create a completed weekly signal', () => {
  const pending = aggregateOfficialWeeklyBars({
    bars: [bar('2026-09-29', 11)], officialCompletedSessions: ['2026-09-29'], asOfSession: '2026-09-29',
    nextOfficialSession: '2026-09-30',
  });
  assert.equal(pending[0].status, 'partial');
  const missing = aggregateOfficialWeeklyBars({
    bars: [bar('2026-09-28', 11), bar('2026-09-30', 12)],
    officialCompletedSessions: ['2026-09-28', '2026-09-29', '2026-09-30'],
    asOfSession: '2026-10-04',
  });
  assert.equal(missing[0].status, 'partial');
});
test('a Friday week is complete after the official next session moves to Monday', () => {
  const result = aggregateOfficialWeeklyBars({
    bars: [bar('2026-10-02', 10)], officialCompletedSessions: ['2026-10-02'],
    asOfSession: '2026-10-02', nextOfficialSession: '2026-10-05',
  });
  assert.equal(result[0].status, 'complete');
});
test('month crossing does not split a calendar week', () => {
  const sessions = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02'];
  const result = aggregateOfficialWeeklyBars({
    bars: sessions.map((session, index) => bar(session, index + 10)), officialCompletedSessions: sessions,
    asOfSession: '2026-10-04',
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].status, 'complete');
});
