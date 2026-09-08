import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import { processThreadsLifecycleCallback, type ThreadsLifecycleRevocation } from './threads-lifecycle-callback.ts';

const appId = '1088710103702295';
const appSecret = 'fixture-threads-secret-1234567890';
const issuedAt = Math.floor(Date.now() / 1000);

function signedRequest() {
  const payload = Buffer.from(JSON.stringify({
    algorithm: 'HMAC-SHA256',
    issued_at: issuedAt,
    user_id: '123456789012345',
  }), 'utf8').toString('base64url');
  return `${createHmac('sha256', appSecret).update(payload).digest('base64url')}.${payload}`;
}

function request(value: string) {
  return new Request('https://stockinsider-three.vercel.app/api/auth/threads/data-deletion', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ signed_request: value }),
  });
}

test('data-deletion callback returns Meta response contract and passes owner-bound revocation', async () => {
  const revocations: ThreadsLifecycleRevocation[] = [];
  const body = await processThreadsLifecycleCallback({
    appId,
    appSecret,
    kind: 'data_deletion',
    redirectUri: 'https://stockinsider-three.vercel.app/api/auth/threads/callback',
    request: request(signedRequest()),
    revoke: async (value) => { revocations.push(value); },
  });
  assert.match(String(body.confirmation_code), /^[A-Za-z0-9_-]{43}$/u);
  assert.equal(body.url, `https://stockinsider-three.vercel.app/api/auth/threads/data-deletion?code=${body.confirmation_code}`);
  assert.equal(revocations.length, 1);
  assert.equal(revocations[0]?.requestKind, 'data_deletion');
  assert.match(String(revocations[0]?.userIdHash), /^[0-9a-f]{64}$/u);
  assert.equal(revocations[0]?.signedRequest, signedRequest());
});

test('deauthorize callback is minimal and invalid requests never reach revocation', async () => {
  let calls = 0;
  const body = await processThreadsLifecycleCallback({
    appId,
    appSecret,
    kind: 'deauthorize',
    redirectUri: 'https://stockinsider-three.vercel.app/api/auth/threads/callback',
    request: request(signedRequest()),
    revoke: async () => { calls += 1; },
  });
  assert.deepEqual(body, { success: true });
  assert.equal(calls, 1);
  await assert.rejects(() => processThreadsLifecycleCallback({
    appId,
    appSecret,
    kind: 'deauthorize',
    redirectUri: 'https://stockinsider-three.vercel.app/api/auth/threads/callback',
    request: request('tampered.payload'),
    revoke: async () => { calls += 1; },
  }), /signature|payload|signed_request/u);
  assert.equal(calls, 1);
});
