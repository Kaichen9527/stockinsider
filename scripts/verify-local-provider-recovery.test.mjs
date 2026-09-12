import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdtemp, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { verifyLocalProviderRecovery } from './verify-local-provider-recovery.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');

async function fixture(mutate = value => value) {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'stockinsider-provider-verify-')));
  const directory = path.join(root, 'backup');
  const keyDirectory = path.join(root, 'keys');
  await import('node:fs/promises').then(({ mkdir }) => Promise.all([
    mkdir(directory, { mode: 0o700 }), mkdir(keyDirectory, { mode: 0o700 }),
  ]));
  const key = await loadLocalBackupKey(keyDirectory, { create: true });
  const manifest = { schema: 'stockinsider-provider-recovery-v1', project: 'mgqpxfbdhmiygdytgswi',
    createdAt: '2026-09-12T00:00:00.000Z', credentialCount: 2,
    keyReference: 'private-local-file:aes256-v1', productionRecoveryVerified: false,
    independentKeyEscrowVerified: false };
  const payload = mutate({ manifest, credentials: [
    { id: 'credential-one', name: 'threads_access_token', decrypted_secret: 't'.repeat(32),
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
    { id: 'credential-two', name: 'stockinsider_finmind_api_token', decrypted_secret: 'f'.repeat(32),
      created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' },
  ], registry: [], roles: [], memberships: [] });
  const contextSha256 = hash(JSON.stringify(manifest));
  const plaintext = Buffer.from(JSON.stringify(payload));
  const result = await writeEncryptedBackupArtifact({ directory, filename: 'provider.sib', input: [plaintext],
    key, contextSha256, maxPlaintextBytes: 1024 * 1024, timeoutMs: 10_000 });
  const manifestPath = path.join(directory, 'provider.manifest.json');
  await writeFile(manifestPath, JSON.stringify({ manifest, contextSha256, result }), { mode: 0o600 });
  plaintext.fill(0); key.fill(0);
  return { root, directory, keyDirectory, manifestPath };
}

test('provider recovery is authenticated and validated without exposing secrets', async () => {
  const item = await fixture();
  const result = await verifyLocalProviderRecovery({ ...item, receiptDirectory: item.directory });
  assert.equal(result.credentialsDecryptedAndValidated, true);
  assert.equal(result.secretsPrinted, false);
  assert.equal(result.productionRecoveryVerified, false);
  assert.deepEqual(result.credentialNames, ['stockinsider_finmind_api_token', 'threads_access_token']);
  const receipt = JSON.parse(await readFile(path.join(item.directory, result.filename), 'utf8'));
  assert.equal(JSON.stringify(receipt).includes('t'.repeat(32)), false);
  assert.equal(JSON.stringify(receipt).includes('f'.repeat(32)), false);
});

test('provider recovery rejects unexpected credentials and non-private manifests', async () => {
  const unexpected = await fixture(payload => ({ ...payload, credentials: payload.credentials.slice(0, 1) }));
  await assert.rejects(verifyLocalProviderRecovery({ ...unexpected,
    receiptDirectory: unexpected.directory }), /credentials_invalid/);
  const publicFile = await fixture();
  await chmod(publicFile.manifestPath, 0o644);
  await assert.rejects(verifyLocalProviderRecovery({ ...publicFile,
    receiptDirectory: publicFile.directory }), /not_private/);
  assert.equal((await readdir(publicFile.directory)).some(name => name.startsWith('provider-recovery-verification-')), false);
});
