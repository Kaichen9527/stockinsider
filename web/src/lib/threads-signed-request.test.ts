import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import test from 'node:test';
import {
  createThreadsDeletionConfirmationCode,
  hashThreadsDeletionConfirmationCode,
  hashThreadsUserId,
  threadsDeletionStatusUrl,
  verifyThreadsSignedRequest,
} from './threads-signed-request.ts';

const secret = 'fixture-threads-secret-1234567890';
const now = 1_788_796_800;

function signed(payload: Record<string, unknown>, signingSecret = secret) {
  const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = createHmac('sha256', signingSecret).update(encodedPayload).digest('base64url');
  return `${signature}.${encodedPayload}`;
}

test('Threads lifecycle verifies an authentic signed_request', () => {
  const payload = verifyThreadsSignedRequest(signed({
    algorithm: 'HMAC-SHA256',
    issued_at: now,
    user_id: '123456789012345',
  }), secret, now);
  assert.equal(payload.user_id, '123456789012345');
});

test('Threads lifecycle rejects tampering, unknown users, and expired requests', () => {
  assert.throws(() => verifyThreadsSignedRequest(signed({ user_id: '123' }, 'another-valid-secret-123456'), secret, now),
    /signature_invalid/u);
  assert.throws(() => verifyThreadsSignedRequest(signed({ user_id: 'name-not-id' }), secret, now),
    /user_invalid/u);
  assert.throws(() => verifyThreadsSignedRequest(signed({ user_id: '123' }), secret, now),
    /expired/u);
  assert.throws(() => verifyThreadsSignedRequest(signed({ user_id: '123', issued_at: now - 86_401 }), secret, now),
    /expired/u);
});

test('Threads lifecycle uses capability-safe confirmation hashes', () => {
  assert.match(hashThreadsDeletionConfirmationCode('A'.repeat(32)), /^[0-9a-f]{64}$/u);
  assert.notEqual(hashThreadsDeletionConfirmationCode('A'.repeat(32)), hashThreadsDeletionConfirmationCode('B'.repeat(32)));
  const signedRequest = signed({ user_id: '123', issued_at: now });
  assert.equal(
    createThreadsDeletionConfirmationCode(signedRequest, secret),
    createThreadsDeletionConfirmationCode(signedRequest, secret),
  );
  assert.match(createThreadsDeletionConfirmationCode(signedRequest, secret), /^[A-Za-z0-9_-]{43}$/u);
  assert.match(hashThreadsUserId('123', '1088710103702295'), /^[0-9a-f]{64}$/u);
  assert.equal(
    threadsDeletionStatusUrl('A'.repeat(43), 'https://stockinsider-three.vercel.app/api/auth/threads/callback'),
    `https://stockinsider-three.vercel.app/api/auth/threads/data-deletion?code=${'A'.repeat(43)}`,
  );
  assert.throws(
    () => threadsDeletionStatusUrl('A'.repeat(43), 'https://untrusted.example/callback'),
    /origin_invalid/u,
  );
});
