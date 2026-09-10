import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash, randomBytes } from 'node:crypto';
import { encryptBackupChunks, verifyBackupChunks, BACKUP_ENVELOPE_OVERHEAD_BYTES } from './local-backup-envelope.mjs';

const source = Buffer.from('fixture: financial records and immutable document manifest');
const options = () => ({ key: randomBytes(32), contextSha256: 'a'.repeat(64), maxPlaintextBytes: 1024 });
async function encrypted(input, config) {
  const chunks = [];
  for await (const chunk of encryptBackupChunks(input, config)) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test('arbitrary stream boundaries authenticate and report hash without returning plaintext', async () => {
  const config = options();
  const artifact = await encrypted([source.subarray(0, 7), source.subarray(7)], config);
  assert.equal(artifact.length, source.length + BACKUP_ENVELOPE_OVERHEAD_BYTES);
  assert.equal(artifact.includes(source), false);
  for (const size of [1, 7, 32, 10000]) {
    const chunks = [];
    for (let i = 0; i < artifact.length; i += size) chunks.push(artifact.subarray(i, i + size));
    const result = await verifyBackupChunks(chunks, config);
    assert.equal(result.envelopeVerified, true);
    assert.equal(result.plaintextSha256, createHash('sha256').update(source).digest('hex'));
    assert.equal(result.plaintextBytes, source.length);
    assert.equal(result.restoreVerified, false);
    assert.equal('plaintext' in result, false);
  }
});

test('nonce uniqueness, wrong key, wrong manifest and every modified byte', async () => {
  const config = options();
  const artifact = await encrypted([source], config);
  assert.notDeepEqual(await encrypted([source], config), artifact);
  await assert.rejects(verifyBackupChunks([artifact], { ...config, key: randomBytes(32) }), /authentication/);
  await assert.rejects(verifyBackupChunks([artifact], { ...config, contextSha256: 'b'.repeat(64) }), /context/);
  for (let i = 0; i < artifact.length; i++) {
    const corrupted = Buffer.from(artifact);
    corrupted[i] ^= 1;
    await assert.rejects(verifyBackupChunks([corrupted], config));
  }
});

test('truncation and appended content cannot validate', async () => {
  const config = options();
  const artifact = await encrypted([source], config);
  for (let size = 0; size < artifact.length; size++) {
    await assert.rejects(verifyBackupChunks([artifact.subarray(0, size)], config));
  }
  await assert.rejects(verifyBackupChunks([artifact, Buffer.from('extra')], config));
});

test('empty, non-binary and oversized source is rejected; validation remains bounded', async () => {
  const config = options();
  await assert.rejects(encrypted([], config), /empty_backup/);
  await assert.rejects(encrypted(['not binary'], config), /binary_input/);
  await assert.rejects(encrypted([source], { ...config, maxPlaintextBytes: 1 }), /size_limit/);
  const artifact = await encrypted([source], config);
  await assert.rejects(verifyBackupChunks([artifact], { ...config, maxPlaintextBytes: 1 }), /size_limit/);
  for (const maxPlaintextBytes of [0, -1, NaN, Infinity, '100', 26 * 1024 ** 3]) {
    await assert.rejects(encrypted([source], { ...config, maxPlaintextBytes }), /size_limit/);
  }
  await assert.rejects(encrypted([source], { ...config, key: randomBytes(16) }), /key/);
  await assert.rejects(encrypted([source], { ...config, contextSha256: '' }), /manifest/);
});

test('upstream export failure propagates; partial stream does not authenticate', async () => {
  const config = options();
  async function* failedExport() { yield source; throw new Error('export_failed'); }
  const chunks = [];
  await assert.rejects(async () => {
    for await (const chunk of encryptBackupChunks(failedExport(), config)) chunks.push(chunk);
  }, /export_failed/);
  await assert.rejects(verifyBackupChunks(chunks, config));
});
