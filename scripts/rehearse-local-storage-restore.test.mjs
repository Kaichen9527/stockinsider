import assert from 'node:assert/strict';
import test from 'node:test';
import { chmod, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { rehearseLocalStorageRestore } from './rehearse-local-storage-restore.mjs';

const digest = value => createHash('sha256').update(value).digest('hex');

async function fixture() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'stockinsider-storage-rehearse-')));
  const directory = path.join(root, 'backup');
  const keys = path.join(root, 'keys');
  const scratch = path.join(root, 'scratch');
  await Promise.all([mkdir(directory, { mode: 0o700 }), mkdir(keys, { mode: 0o700 }), mkdir(scratch, { mode: 0o700 })]);
  const key = await loadLocalBackupKey(keys, { create: true });
  const receipts = [];
  for (const [index, bytes] of [Buffer.from('%PDF one'), Buffer.from('<html>two</html>')].entries()) {
    const plaintextSha256 = digest(bytes);
    const manifest = { schema: 'stockinsider-storage-export-v1', project: 'mgqpxfbdhmiygdytgswi',
      createdAt: '2026-09-12T00:00:00Z', object: { id: `object-${index}`, bucket_id: 'candidate-financial-documents-v6',
        name: `issuer/company/date/${plaintextSha256}`, metadata: { size: bytes.length } },
      keyReference: 'private-local-file:aes256-v1', restoreVerified: false };
    const contextSha256 = digest(JSON.stringify(manifest));
    const filename = `storage-fixture-${index}.sib`;
    const result = await writeEncryptedBackupArtifact({ directory, filename, input: [bytes], key,
      contextSha256, maxPlaintextBytes: bytes.length, timeoutMs: 10_000 });
    await writeFile(path.join(directory, `storage-fixture-${index}.manifest.json`),
      JSON.stringify({ manifest, contextSha256, result }), { mode: 0o600 });
    receipts.push({ filename, contextSha256 });
  }
  key.fill(0);
  const inventoryPath = path.join(directory, 'storage-inventory-fixture.json');
  await writeFile(inventoryPath, JSON.stringify({ objects: 2, receipts, inventoryStable: true,
    combinedDatabaseSnapshotVerified: false, restoreVerified: false }), { mode: 0o600 });
  return { directory, keys, scratch, inventoryPath };
}

test('every storage member restores into a verified private hash-addressed layout', async () => {
  const item = await fixture();
  const result = await rehearseLocalStorageRestore({ inventoryPath: item.inventoryPath,
    keyDirectory: item.keys, receiptDirectory: item.directory, scratchParent: item.scratch });
  assert.equal(result.objectsRestored, 2);
  assert.equal(result.privateHashAddressedLayoutVerified, true);
  assert.equal(result.objectHashesVerified, true);
  assert.equal(result.restoredPlaintextRetained, false);
  const receipt = JSON.parse(await readFile(path.join(item.directory, result.filename), 'utf8'));
  assert.equal(receipt.productionRestoreVerified, false);
});

test('manifest whose object path is not its content hash is rejected', async () => {
  const item = await fixture();
  const manifestPath = path.join(item.directory, 'storage-fixture-0.manifest.json');
  const outer = JSON.parse(await readFile(manifestPath, 'utf8'));
  outer.manifest.object.name = 'issuer/company/date/not-a-hash';
  outer.contextSha256 = digest(JSON.stringify(outer.manifest));
  await writeFile(manifestPath, JSON.stringify(outer), { mode: 0o600 });
  await assert.rejects(rehearseLocalStorageRestore({ inventoryPath: item.inventoryPath,
    keyDirectory: item.keys, receiptDirectory: item.directory, scratchParent: item.scratch }),
  /storage_manifest_missing|storage_recovery_manifest_invalid/);
});
