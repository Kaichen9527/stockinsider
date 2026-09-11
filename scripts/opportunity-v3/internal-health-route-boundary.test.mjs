import assert from 'node:assert/strict';
import test from 'node:test';
import { executeHealthRouteFailureBoundary } from './internal-health-route-harness.mjs';

test('PCR-004 actual health route returns the TS owner closed fail-closed reasons', async () => {
  const { response, body } = await executeHealthRouteFailureBoundary();
  assert.equal(response.status, 503);
  assert.equal(body.ok, false);
  assert.equal(body.databaseHealthy, false);
  assert.equal(body.sourceLedRuntime.schema, 'stockinsider-runtime-health-v1.1');
  assert.equal(body.sourceLedRuntime.status, 'fail');
  assert.deepEqual(body.sourceLedRuntime.reasons.slice(0, 4), [
    'manifest_missing', 'review_binding_invalid', 'worker_hash_mismatch', 'config_hash_mismatch',
  ]);
  assert.ok(body.sourceLedRuntime.reasons.includes('projection_missing'));
  assert.ok(body.sourceLedRuntime.reasons.includes('consumer_producer_incompatible'));
});
