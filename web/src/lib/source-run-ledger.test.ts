import assert from 'node:assert/strict';
import test from 'node:test';
import { aggregateSourceRuns24h } from './source-run-ledger-metrics.ts';

test('source-center 24-hour totals aggregate every run instead of copying the latest run', () => {
  const totals = aggregateSourceRuns24h([
    { connector: 'telegram', fetched: 20, matched: 4, new_count: 3, duplicate: 1, written: 3 },
    { connector: 'telegram', fetched: 18, matched: 5, new_count: 1, duplicate: 4, written: 1 },
    { connector: 'ptt', fetched: 100, matched: 10, new_count: 8, duplicate: 2, written: 8 },
  ]);
  assert.deepEqual(totals.get('telegram'), { runs: 2, fetched: 38, matched: 9, newCount: 4, duplicate: 5, written: 4 });
  assert.deepEqual(totals.get('ptt'), { runs: 1, fetched: 100, matched: 10, newCount: 8, duplicate: 2, written: 8 });
});
