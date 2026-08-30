import assert from 'node:assert/strict';
import test from 'node:test';
import { assertUsableThreadsToken, shouldRefreshThreadsToken } from './threads-token-policy.ts';

const nowMs = Date.parse('2026-08-30T00:00:00.000Z');

test('Threads token refresh stays idle before the 30-day boundary', () => {
  assert.equal(shouldRefreshThreadsToken({
    lastRefreshedAt: '2026-08-01T00:00:01.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    nowMs,
  }), false);
});

test('Threads token refresh activates at 30 days and before expiry', () => {
  assert.equal(shouldRefreshThreadsToken({
    lastRefreshedAt: '2026-07-31T00:00:00.000Z',
    expiresAt: '2026-09-30T00:00:00.000Z',
    nowMs,
  }), true);
  assert.equal(shouldRefreshThreadsToken({
    lastRefreshedAt: null,
    expiresAt: '2026-09-15T00:00:00.000Z',
    nowMs,
  }), true);
  assert.equal(shouldRefreshThreadsToken({ lastRefreshedAt: null, expiresAt: null, nowMs }), true);
});

test('Threads token validation rejects a missing or expired Vault token', () => {
  assert.throws(
    () => assertUsableThreadsToken({ token: '', expiresAt: null, nowMs }),
    /threads_vault_token_missing/u,
  );
  assert.throws(
    () => assertUsableThreadsToken({ token: 'vault-token', expiresAt: '2026-08-29T23:59:59.000Z', nowMs }),
    /threads_vault_token_expired/u,
  );
  assert.doesNotThrow(
    () => assertUsableThreadsToken({ token: 'vault-token', expiresAt: '2026-09-30T00:00:00.000Z', nowMs }),
  );
});
