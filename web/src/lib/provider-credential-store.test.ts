import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import test from 'node:test';
import { encryptProviderSecret } from './provider-secret-envelope.ts';
import { readProviderCredential, replaceProviderCredential } from './provider-credential-store.ts';

const key = randomBytes(32);
const keyFile = () => Buffer.from(key.toString('base64'));

test('decrypts a database envelope with a version-bound systemd root key', async () => {
  const identity = { provider: 'threads' as const, credentialId: randomUUID(), generation: 4, keyVersion: 'v2' };
  const token = Buffer.from('threads-test-token-1234567890');
  const envelope = encryptProviderSecret(identity, token, key);
  const result = await readProviderCredential({ provider: 'threads', readCredential: keyFile,
    client: { rpc: async () => ({ data: { provider: envelope.provider,
      credential_id: envelope.credentialId, generation: envelope.generation,
      key_version: envelope.keyVersion, iv: envelope.iv, tag: envelope.tag,
      ciphertext: envelope.ciphertext, token_sha256: envelope.tokenSha256,
      expires_at: '2026-11-01T00:00:00Z', owner_user_id_hash: 'a'.repeat(64) }, error: null }) } as never });
  assert.equal(result.plaintext.toString(), token.toString());
  assert.equal(result.identity.generation, 4);
  result.plaintext.fill(0); token.fill(0);
});

test('writes generation+1 and rejects a non-CAS response', async () => {
  const token = Buffer.from('finmind-test-token-123456789');
  const calls: Array<Record<string, unknown>> = [];
  const result = await replaceProviderCredential({ provider: 'finmind', plaintext: token,
    expectedGeneration: 8, credentialId: randomUUID(), keyVersion: 'v3', expiresAt: null,
    ownerUserIdHash: null, readCredential: keyFile,
    client: { rpc: async (_name: string, args: Record<string, unknown>) => {
      calls.push(args); return { data: { generation: 9 }, error: null };
    } } as never });
  assert.equal(result.generation, 9);
  assert.equal(calls[0]?.p_expected_generation, 8);
  assert.notEqual(calls[0]?.p_ciphertext, token.toString());
  await assert.rejects(() => replaceProviderCredential({ provider: 'finmind', plaintext: token,
    expectedGeneration: 9, credentialId: randomUUID(), keyVersion: 'v3', expiresAt: null,
    ownerUserIdHash: null, readCredential: keyFile,
    client: { rpc: async () => ({ data: { generation: 9 }, error: null }) } as never }), /generation_mismatch/u);
  token.fill(0);
});
