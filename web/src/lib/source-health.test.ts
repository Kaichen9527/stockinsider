import test from 'node:test';
import assert from 'node:assert/strict';
import { activeSourceHealthFailures, classifySourceSyncTerminal, type SourceHealthRun } from './source-health.ts';

function run(overrides: Partial<SourceHealthRun> = {}): SourceHealthRun {
  return {
    connector: 'telegram',
    attemptedAt: '2026-08-30T12:00:00.000Z',
    terminalReason: 'success',
    authStatus: 'authorized',
    ...overrides,
  };
}

test('active source health alerts immediately for auth and parser failures', () => {
  assert.equal(activeSourceHealthFailures(['telegram'], [run({ terminalReason: 'auth_failed' })])[0]?.reason, 'auth_failed');
  assert.equal(activeSourceHealthFailures(['telegram'], [run({ terminalReason: 'parser_failed' })])[0]?.reason, 'parser_failed');
});

test('active source health waits for two ordinary failures', () => {
  assert.deepEqual(activeSourceHealthFailures(['telegram'], [run({ terminalReason: 'failed' })]), []);
  assert.equal(activeSourceHealthFailures(['telegram'], [
    run({ terminalReason: 'failed' }),
    run({ attemptedAt: '2026-08-30T06:00:00.000Z', terminalReason: 'partial' }),
  ])[0]?.reason, 'consecutive_failures');
});

test('a successful latest run clears an older failure and missing history is unhealthy', () => {
  assert.deepEqual(activeSourceHealthFailures(['telegram'], [
    run(),
    run({ attemptedAt: '2026-08-30T06:00:00.000Z', terminalReason: 'failed' }),
  ]), []);
  assert.equal(activeSourceHealthFailures(['telegram'], [run({ connector: 'gdelt' })])[0]?.reason, 'missing_history');
});

test('an active source that misses its next expected run is unhealthy', () => {
  const failures = activeSourceHealthFailures(['telegram'], [run({
    nextExpectedAt: '2026-08-30T18:00:00.000Z',
  })], Date.parse('2026-08-30T18:00:01.000Z'));
  assert.equal(failures[0]?.reason, 'missed_deadline');
});

test('duplicate Telegram documents are not misclassified from their symbol count', () => {
  assert.equal(classifySourceSyncTerminal({
    fetchedPosts: 82,
    recordsWritten: 0,
    duplicatesSkipped: 12,
    candidateDocuments: 12,
    matchedDirectHits: 36,
    matchedIndustryHits: 0,
  }), 'duplicate_only');
});

test('unwritten candidates remain a parser failure when they are not duplicates', () => {
  assert.equal(classifySourceSyncTerminal({
    fetchedPosts: 12,
    recordsWritten: 0,
    duplicatesSkipped: 0,
    candidateDocuments: 3,
    matchedDirectHits: 3,
    matchedIndustryHits: 0,
  }), 'parser_failed');
});

test('approved Telegram roster returning zero parsed messages is a parser failure, not an empty success', () => {
  assert.equal(classifySourceSyncTerminal({
    fetchedPosts: 0,
    recordsWritten: 0,
    duplicatesSkipped: 0,
    matchedDirectHits: 0,
    matchedIndustryHits: 0,
    candidateDocuments: 0,
    errorCode: 'telegram_parser_zero_messages',
    degradedReason: 'telegram_channels_failed:7',
    timedOut: false,
  }), 'parser_failed');
});
