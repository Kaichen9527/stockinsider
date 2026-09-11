import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, mkdir, writeFile, chmod, symlink, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { assessLocalBackupCapacity, inspectLocalBackupDirectory } from './local-backup-preflight.mjs';

const gib = 1024 ** 3;
const budgets = { availableBytes: 74 * gib, existingBytes: 10 * gib,
  incomingBytes: 5 * gib, temporaryBytes: 5 * gib };

test('retained backups, incoming export and temporary bytes all count', () => {
  const result = assessLocalBackupCapacity(budgets);
  assert.equal(result.peakBackupBytes, 20 * gib);
  assert.equal(result.allowed, true);
  assert.equal(result.backupVerified, false);
  assert.equal(result.restoreVerified, false);
  assert.deepEqual(assessLocalBackupCapacity({ ...budgets, existingBytes: 16 * gib }).blockers,
    ['local_backup_budget_exceeded']);
  assert.deepEqual(assessLocalBackupCapacity({ ...budgets, availableBytes: 9 * gib }).blockers,
    ['insufficient_local_disk_space']);
});

test('unknown, negative, fractional and overflowing measurements fail closed', () => {
  for (const key of Object.keys(budgets)) {
    for (const bad of [undefined, null, -1, Infinity, NaN, 0.5, '5']) {
      assert.throws(() => assessLocalBackupCapacity({ ...budgets, [key]: bad }));
    }
  }
  assert.throws(() => assessLocalBackupCapacity({ ...budgets, incomingBytes: 0 }));
  assert.throws(() => assessLocalBackupCapacity({ ...budgets, incomingBytes: Number.MAX_SAFE_INTEGER }));
});

async function fixture(t) {
  const directory = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-backup-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await chmod(directory, 0o700);
  return directory;
}

test('read-only inventory counts nested files without exporting or pruning', async (t) => {
  const directory = await fixture(t);
  await mkdir(path.join(directory, 'previous'));
  await writeFile(path.join(directory, 'latest.age'), 'abcd');
  await writeFile(path.join(directory, 'previous', 'previous.age'), 'xyz');
  const inventory = await inspectLocalBackupDirectory(directory);
  assert.equal(inventory.existingBytes, 7);
  assert.equal(inventory.directory, directory);
  assert.ok(inventory.availableBytes > 0);
});

test('root, relative, nonprivate, file and symlink destinations are rejected', async (t) => {
  const directory = await fixture(t);
  await assert.rejects(inspectLocalBackupDirectory('/'));
  await assert.rejects(inspectLocalBackupDirectory('backup'));
  await chmod(directory, 0o755);
  await assert.rejects(inspectLocalBackupDirectory(directory), /must_be_private/);
  await chmod(directory, 0o700);
  await writeFile(path.join(directory, 'file'), 'x');
  await assert.rejects(inspectLocalBackupDirectory(path.join(directory, 'file')), /directory_required/);
  await symlink(directory, path.join(directory, 'link'));
  await assert.rejects(inspectLocalBackupDirectory(path.join(directory, 'link')), /path_symlink/);
  await assert.rejects(inspectLocalBackupDirectory(directory), /entry_symlink/);
});
