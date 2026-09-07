import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFinMindToken, verifyFinMindToken } from './finmind-token-bootstrap.ts';

test('FinMind token bootstrap rejects malformed credentials', () => {
  assert.equal(normalizeFinMindToken('short'), null);
  assert.equal(normalizeFinMindToken('valid-token-with whitespace'), null);
  assert.equal(normalizeFinMindToken('  valid-token-1234567890  '), 'valid-token-1234567890');
});

test('FinMind token bootstrap requires a real successful 2330 canary payload', async () => {
  const calls: Array<{ authorization: string | null; redirect: RequestRedirect | undefined }> = [];
  const verified = await verifyFinMindToken('valid-token-1234567890', async (_url, init) => {
    calls.push({ authorization: new Headers(init?.headers).get('authorization'), redirect: init?.redirect });
    return new Response(JSON.stringify({ status: 200, data: [{ stock_id: '2330' }] }), { status: 200, headers: { 'content-type': 'application/json' } });
  });
  assert.equal(verified.rowCount, 1);
  assert.match(verified.tokenHash, /^[0-9a-f]{64}$/u);
  assert.equal(calls[0]?.authorization, 'Bearer valid-token-1234567890');
  assert.equal(calls[0]?.redirect, 'error');
  await assert.rejects(verifyFinMindToken('valid-token-1234567890', async () => new Response(JSON.stringify({ status: 401, data: [] }), { status: 200 })), /invalid_payload_401/u);
});
