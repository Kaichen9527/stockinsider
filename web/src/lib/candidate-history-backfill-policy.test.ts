import assert from 'node:assert/strict';
import test from 'node:test';
import {
  candidateHistoryCoverage, candidateHistoryMonths, historyRetryAt, planCandidateHistoryBackfill,
  type CandidateHistoryInput, type HistoryMonthCheckpoint,
} from './candidate-history-backfill-policy.ts';

const candidate: CandidateHistoryInput = { stockId: 'stock-a', symbol: '2330', exchange: 'TWSE', knownPriceSessions: [], knownMultipleSessions: [] };
const common = { candidates: [candidate], latestSession: '2026-09-10', evaluationAt: '2026-09-10T12:00:00.000Z',
  officialSessions: ['2026-07-31','2026-08-28','2026-08-31','2026-09-09','2026-09-10'], checkpoints: [] as HistoryMonthCheckpoint[] };
function checkpoint(overrides: Partial<HistoryMonthCheckpoint> = {}): HistoryMonthCheckpoint {
  return { stock_id: 'stock-a', dataset: 'price', month: '2026-09-01', status: 'retry', attempted_at: '2026-09-09T12:00:00.000Z',
    next_attempt_at: '2026-09-12T12:00:00.000Z', attempts: 1, observed_through: '2026-09-09', observed_sessions: [],
    terminal_reason: 'official_timeout', ...overrides };
}

test('historical plan obeys both global and per-stock request limits, with cross-stock fair rotation', () => {
  const candidates = Array.from({ length: 80 }, (_, i) => ({ ...candidate, stockId: `stock-${String(i).padStart(3, '0')}` }));
  const first = planCandidateHistoryBackfill({ ...common, candidates, requestBudget: 40 });
  assert.equal(first.length, 40);
  assert.equal(new Set(first.map((job) => job.stockId)).size, 40);
  const second = planCandidateHistoryBackfill({ ...common, candidates, requestBudget: 40,
    checkpoints: first.map((job) => checkpoint({ stock_id: job.stockId, dataset: job.dataset, month: job.month })) });
  assert.equal(second.length, 40);
  assert.equal(second.some((job) => first.some((prior) => prior.stockId === job.stockId)), false);
  const bounded = planCandidateHistoryBackfill({ ...common, requestBudget: 400, perStockBudget: 4 });
  assert.equal(bounded.length, 4);
  assert.deepEqual(bounded.map((job) => job.dataset), ['price','multiple','price','multiple']);
});

test('an existing earlier month sample does not conceal a missing month-end multiple', () => {
  const jobs = planCandidateHistoryBackfill({ ...common, candidates: [{ ...candidate, knownMultipleSessions: ['2026-09-09','2026-08-28'] }], perStockBudget: 8 });
  assert.deepEqual(jobs.filter((job) => job.dataset === 'multiple').map((job) => [job.month,job.lastSession]),
    [['2026-09-01','2026-09-10'],['2026-08-01','2026-08-31'],['2026-07-01','2026-07-31']]);
});

test('monthly checkpoints prevent repeated deep history but never hide a lost unpersisted result', () => {
  const completed = checkpoint({ status: 'complete', next_attempt_at: null, observed_through: '2026-09-10', observed_sessions: ['2026-09-09','2026-09-10'] });
  const known = { ...candidate, knownPriceSessions: completed.observed_sessions };
  const done = planCandidateHistoryBackfill({ ...common, candidates: [known], checkpoints: [completed] });
  assert.equal(done.some((job) => job.dataset === 'price' && job.month === completed.month), false);
  const lost = planCandidateHistoryBackfill({ ...common, checkpoints: [completed] });
  assert.equal(lost.some((job) => job.dataset === 'price' && job.month === completed.month), true);
  const blocked = planCandidateHistoryBackfill({ ...common, checkpoints: [checkpoint()] });
  assert.equal(blocked.some((job) => job.dataset === 'price' && job.month === completed.month), false);
});

test('true 1,320-session coverage checks actual missing sessions, not merely a count of arbitrary dates', () => {
  const sessions = Array.from({ length: 1400 }, (_, i) => new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const latestSession = sessions.at(-1)!;
  const almost = candidateHistoryCoverage({ ...candidate, knownPriceSessions: sessions.slice(0,1399) }, sessions, latestSession);
  assert.equal(almost.coveredSessions,1319);
  assert.deepEqual(almost.missingSessions,[latestSession]);
  assert.equal(almost.terminalReason,'price_sessions_pending');
  const complete = candidateHistoryCoverage({ ...candidate, knownPriceSessions: sessions.slice(-1320) }, sessions, latestSession);
  assert.equal(complete.terminalReason,'complete');
  assert.equal(complete.coveredSessions,1320);
  assert.equal(candidateHistoryCoverage(candidate, sessions.slice(-240), latestSession).terminalReason,'official_calendar_history_incomplete');
});

test('only an official listing date limits required history; empty responses never imply pre-listing', () => {
  const sessions = Array.from({ length: 1400 }, (_, i) => new Date(Date.UTC(2020,0,1+i)).toISOString().slice(0,10));
  const latestSession = sessions.at(-1)!;
  const recent = sessions.slice(-90);
  const listed = { ...candidate, knownPriceSessions: recent, listing: { date: recent[0], sourceUrl: 'https://www.twse.com.tw/zh/listed/listed.html' } };
  const coverage = candidateHistoryCoverage(listed,sessions,latestSession);
  assert.equal(coverage.terminalReason,'listing_limited_history_complete');
  assert.equal(coverage.expectedSessions,90);
  const unknown = candidateHistoryCoverage({ ...listed, listing: undefined },sessions,latestSession);
  assert.equal(unknown.listingLimited,false);
  assert.equal(unknown.missingSessions.length,1230);
  assert.throws(() => candidateHistoryCoverage({ ...listed, listing: { date: recent[0], sourceUrl: 'https://twse.com.tw.attacker.example/listing' } },sessions,latestSession), /provenance_invalid/);
  const jobs = planCandidateHistoryBackfill({ ...common, candidates: [{ ...candidate, listing: { date: '2026-08-18', sourceUrl: 'https://www.tpex.org.tw/' } }], perStockBudget:12 });
  assert.equal(jobs.some((job) => job.month < '2026-08-01'),false);
});

test('60-month valuation and wider 1,320-trading-day price windows anchor to evaluation session, not wall clock', () => {
  const months = candidateHistoryMonths('2026-09-10',60);
  assert.equal(months.length,60);
  assert.equal(months[0],'2026-09-01');
  assert.equal(months.at(-1),'2021-10-01');
  assert.equal(candidateHistoryMonths('2026-09-10',76).at(-1),'2020-06-01');
  const checkpoints = [checkpoint({ month:'2026-09-01',status:'conflict',next_attempt_at:null })];
  assert.equal(planCandidateHistoryBackfill({ ...common,checkpoints }).some((job) => job.dataset==='price' && job.month==='2026-09-01'),false);
});

test('empty history has honest backed-off retries, separate from temporary network failures', () => {
  assert.equal(historyRetryAt(common.evaluationAt,1,'official_timeout'),'2026-09-10T13:00:00.000Z');
  assert.equal(historyRetryAt(common.evaluationAt,1,'official_no_rows'),'2026-09-11T12:00:00.000Z');
  assert.equal(historyRetryAt(common.evaluationAt,20,'official_no_rows'),'2026-09-17T12:00:00.000Z');
  assert.equal(historyRetryAt(common.evaluationAt,20,'official_timeout'),'2026-09-11T12:00:00.000Z');
});
