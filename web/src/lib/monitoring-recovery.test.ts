import assert from 'node:assert/strict';
import test from 'node:test';
import { unrecoveredPipelineFailures } from './domain.ts';

test('a later success clears earlier failures only for the same pipeline mode', () => {
  const failures = unrecoveredPipelineFailures([
    { id: 'core-old', run_type: 'pipeline', status: 'failed', started_at: '2026-09-06T01:00:00Z', details: { mode: 'core' } },
    { id: 'core-recovered', run_type: 'pipeline', status: 'success', started_at: '2026-09-06T06:30:00Z', details: { mode: 'core' } },
    { id: 'source-current', run_type: 'pipeline', status: 'failed', started_at: '2026-09-06T07:00:00Z', details: { mode: 'source' } },
  ]);

  assert.deepEqual(failures.map((row) => row.id), ['source-current']);
});

test('a failure after the latest success remains an active incident', () => {
  const failures = unrecoveredPipelineFailures([
    { id: 'success', run_type: 'pipeline', status: 'success', started_at: '2026-09-06T06:30:00Z', details: { mode: 'core' } },
    { id: 'failure', run_type: 'pipeline', status: 'failed', started_at: '2026-09-06T06:45:00Z', details: { mode: 'core' } },
  ]);

  assert.deepEqual(failures.map((row) => row.id), ['failure']);
});

test('malformed failure timestamps fail closed', () => {
  const failures = unrecoveredPipelineFailures([
    { id: 'unknown-time', run_type: 'pipeline', status: 'failed', started_at: null, details: { mode: 'core' } },
  ]);

  assert.deepEqual(failures.map((row) => row.id), ['unknown-time']);
});
