import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { extractAndVerifyReleaseTar } from './vps-release-tar.mjs';
import { validateReleaseExportInput, VPS_HOST } from './export-vps-release-backup.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { verifyBackupChunks } from './local-backup-envelope.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { verifyVpsReleaseBackup } from './verify-vps-release-backup.mjs';

const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);

function writeOctal(buffer, offset, length, value) {
  const encoded = value.toString(8).padStart(length - 1, '0') + '\0';
  buffer.write(encoded, offset, length, 'ascii');
}

function tarHeader(name, bytes, { type = '0', mode = 0o644 } = {}) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  writeOctal(header, 100, 8, mode); writeOctal(header, 108, 8, 0); writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, bytes.length); writeOctal(header, 136, 12, 0);
  header.fill(32, 148, 156); header.write(type, 156, 1, 'ascii');
  header.write('ustar\0', 257, 6, 'ascii'); header.write('00', 263, 2, 'ascii');
  const checksum = header.reduce((sum, byte) => sum + byte, 0);
  const encoded = checksum.toString(8).padStart(6, '0') + '\0 ';
  header.write(encoded, 148, 8, 'ascii');
  return header;
}

function tar(entries) {
  const chunks = [];
  for (const entry of entries) {
    const bytes = Buffer.from(entry.bytes || '');
    chunks.push(tarHeader(entry.name, bytes, entry), bytes,
      Buffer.alloc((512 - (bytes.length % 512)) % 512));
  }
  chunks.push(Buffer.alloc(1024));
  const value = Buffer.concat(chunks);
  return Buffer.concat([value, Buffer.alloc((10240 - (value.length % 10240)) % 10240)]);
}

function tree(fileContent = 'hello') {
  const file = { path: 'app/server.js', bytes: Buffer.byteLength(fileContent), mode: 0o755,
    mtimeMs: 0, sha256: createHash('sha256').update(fileContent).digest('hex') };
  const value = { schema: 'stockinsider-vps-release-tree-v1',
    releasePath: '/opt/stockinsider/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    fileCount: 1, totalBytes: file.bytes, files: [file] };
  value.treeSha256 = createHash('sha256').update(canonical(value)).digest('hex');
  return value;
}

function archive(value, fileContent = 'hello') {
  return tar([{ name: '.stockinsider-release-manifest.json', bytes: canonical(value), mode: 0o600 },
    { name: 'app/server.js', bytes: fileContent, mode: 0o755 }]);
}

async function fixture(t) {
  const root = await mkdtemp(path.join(await realpath(tmpdir()), 'stockinsider-release-backup-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const restore = path.join(root, 'restore'), backup = path.join(root, 'backup'), key = path.join(root, 'key');
  for (const directory of [restore, backup]) { await mkdir(directory); await chmod(directory, 0o700); }
  await loadLocalBackupKey(key, { create: true }).then(value => value.fill(0));
  return { root, restore, backup, key };
}

test('host and release path are fixed and shell metacharacters are rejected', () => {
  assert.deepEqual(validateReleaseExportInput({ host: VPS_HOST,
    releasePath: '/opt/stockinsider/releases/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' }),
  { application: 'stockinsider', release: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' });
  for (const input of [
    { host: 'example.com', releasePath: '/opt/stockinsider/releases/a' },
    { host: VPS_HOST, releasePath: '/opt/stockinsider/current' },
    { host: VPS_HOST, releasePath: '/opt/app/releases/a;rm' },
    { host: VPS_HOST, releasePath: '/' },
  ]) assert.throws(() => validateReleaseExportInput(input));
});

test('stream restore verifies the embedded tree and removes only its unique temporary directory', async (t) => {
  const dirs = await fixture(t), expected = tree();
  const result = await extractAndVerifyReleaseTar({ chunks: [archive(expected).subarray(0, 713), archive(expected).subarray(713)],
    expectedTree: expected, temporaryParent: dirs.restore });
  assert.equal(result.restoreVerified, true);
  assert.deepEqual(await readdir(dirs.restore), []);
});

test('path traversal, symlink entries and changed file content fail closed and leave no restore tree', async (t) => {
  const dirs = await fixture(t), expected = tree();
  const cases = [
    tar([{ name: '../escape', bytes: 'x' }]),
    tar([{ name: 'link', bytes: '', type: '2' }]),
    archive(expected, 'other'),
  ];
  for (const bytes of cases) {
    await assert.rejects(extractAndVerifyReleaseTar({ chunks: [bytes], expectedTree: expected,
      temporaryParent: dirs.restore }));
    assert.deepEqual(await readdir(dirs.restore), []);
  }
});

test('release tar streams through the authenticated envelope without a plaintext file', async (t) => {
  const dirs = await fixture(t), expected = tree(), bytes = archive(expected);
  const manifest = { schema: 'stockinsider-vps-release-export-v1', host: VPS_HOST,
    releasePath: expected.releasePath, createdAt: '2026-09-11T00:00:00.000Z', tree: expected,
    plaintextStoredOnMac: false, remoteDeletePerformed: false, restoreVerified: false,
    keyReference: 'private-local-file:aes256-v1' };
  const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const key = await loadLocalBackupKey(dirs.key);
  const result = await writeEncryptedBackupArtifact({ directory: dirs.backup, filename: 'release.sib',
    input: [bytes], key, contextSha256, maxPlaintextBytes: bytes.length });
  key.fill(0);
  const artifact = createReadStream(path.join(dirs.backup, result.filename));
  const verifyKey = await loadLocalBackupKey(dirs.key);
  const verified = await verifyBackupChunks(artifact, { key: verifyKey,
    contextSha256, maxPlaintextBytes: bytes.length });
  verifyKey.fill(0);
  assert.equal(verified.envelopeVerified, true);
  assert.equal(verified.plaintextSha256, createHash('sha256').update(bytes).digest('hex'));
  assert.deepEqual(await readdir(dirs.backup), ['release.sib']);
  assert.deepEqual(await readdir(dirs.restore), []);
  await assert.rejects(verifyVpsReleaseBackup({ manifestPath: path.join(dirs.backup, 'receipt.json'),
    keyDirectory: dirs.key, temporaryParent: dirs.restore }), /confirmed_project_backup_directory_required/);
});
