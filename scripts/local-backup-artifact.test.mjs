import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, realpath, rm, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';

async function fixture(t) {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-artifact-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return { directory, filename: 'fixture.sib', input: [Buffer.from('only encrypted data on disk')],
    key: randomBytes(32), contextSha256: 'a'.repeat(64), maxPlaintextBytes: 1024 };
}

test('publishes private authenticated ciphertext but never claims a complete backup', async (t) => {
  const config = await fixture(t);
  const result = await writeEncryptedBackupArtifact(config);
  assert.equal(result.envelopeVerified, true);
  assert.equal(result.backupComplete, false);
  assert.equal(result.restoreVerified, false);
  assert.deepEqual(await readdir(config.directory), ['fixture.sib']);
  assert.equal((await stat(path.join(config.directory, config.filename))).mode & 0o777, 0o600);
  assert.equal((await readFile(path.join(config.directory, config.filename))).includes(config.input[0]), false);
});

test('existing destination survives; failed export leaves no completed or partial file', async (t) => {
  const config = await fixture(t);
  const previous = Buffer.from('previous_verified_backup');
  await writeFile(path.join(config.directory, config.filename), previous);
  await assert.rejects(writeEncryptedBackupArtifact(config), { code: 'EEXIST' });
  assert.deepEqual(await readFile(path.join(config.directory, config.filename)), previous);
  async function* failed() { yield Buffer.from('incomplete'); throw new Error('export_failed'); }
  await assert.rejects(writeEncryptedBackupArtifact({ ...config, filename: 'failed.sib', input: failed() }), /export_failed/);
  assert.deepEqual(await readdir(config.directory), ['fixture.sib']);
});

test('invalid filename and oversized/empty input never publish a file', async (t) => {
  const config = await fixture(t);
  for (const filename of ['../outside.sib', '/outside.sib', 'file.sql', '.hidden.sib']) {
    await assert.rejects(writeEncryptedBackupArtifact({ ...config, filename }), /filename_invalid/);
  }
  await assert.rejects(writeEncryptedBackupArtifact({ ...config, maxPlaintextBytes: 1 }), /size_limit_exceeded/);
  await assert.rejects(writeEncryptedBackupArtifact({ ...config, input: [] }), /empty_backup/);
  assert.deepEqual(await readdir(config.directory), []);
});
