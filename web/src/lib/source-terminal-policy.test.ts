import assert from 'node:assert/strict';
import test from 'node:test';
import { isHealthySourceTerminal } from './source-terminal-policy.ts';

test('empty and duplicate-only source runs remain healthy UI terminals', () => {
  for (const status of ['success', 'valid', 'successful_empty', 'duplicate_only']) {
    assert.equal(isHealthySourceTerminal(status), true, status);
  }
  for (const status of ['partial', 'failed', 'timed_out', 'blocked_auth', null]) {
    assert.equal(isHealthySourceTerminal(status), false, String(status));
  }
});
