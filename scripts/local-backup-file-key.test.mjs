import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, chmod, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { realpath } from 'node:fs/promises';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';

test('private key is persistent, 32 bytes, and never overwritten', async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'si-key-test-'));
  try {
    const key = await loadLocalBackupKey(root, { create: true });
    assert.equal(key.length, 32);
    const again = await loadLocalBackupKey(root, { create: true });
    assert.deepEqual(again, key);
    key.fill(0); again.fill(0);
    await chmod(root, 0o755);
    await assert.rejects(loadLocalBackupKey(root), /permissions/);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('rejects symlinks and malformed existing keys without replacement', async () => {
  const root = await mkdtemp(path.join(await realpath(os.tmpdir()), 'si-key-test-'));
  try {
    await writeFile(path.join(root, 'aes256-v1.key'), 'short', { mode: 0o600 });
    await assert.rejects(loadLocalBackupKey(root, { create: true }), /key_file_invalid/);
    await symlink(root, path.join(root, 'alias'));
    await assert.rejects(loadLocalBackupKey(path.join(root, 'alias')), /directory_invalid/);
  } finally { await rm(root, { recursive: true, force: true }); }
});
