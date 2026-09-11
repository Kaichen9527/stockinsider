/** Fixed-host, read-only release export. Remote tar plaintext is streamed directly
 * into the existing AES-GCM envelope and is never written to the Mac filesystem.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rmdir, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory, CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { MAX_RELEASE_MANIFEST_BYTES, verifyReleaseTreeManifest } from './vps-release-tar.mjs';
import { VPS_HOST, validateReleaseExportInput } from './vps-release-identity.mjs';

export { VPS_HOST, validateReleaseExportInput };
const canonical = value => value && typeof value === 'object'
  ? Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
  : JSON.stringify(value);

function tarUpperBound(tree) {
  const manifestBytes = Buffer.byteLength(canonical(tree));
  if (manifestBytes > MAX_RELEASE_MANIFEST_BYTES) throw new Error('release_manifest_too_large');
  const raw = 1024 + 512 + Math.ceil(manifestBytes / 512) * 512
    + tree.files.reduce((sum, item) => sum + 512 + Math.ceil(item.bytes / 512) * 512, 0);
  return Math.ceil(raw / 10240) * 10240;
}

export async function exportVpsReleaseBackup({ directory, keyDirectory, releasePath,
  host = VPS_HOST }) {
  const identity = validateReleaseExportInput({ host, releasePath });
  const remoteProgram = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remote-vps-release-stream.py');
  if (directory !== CONFIRMED_BACKUP_DIRECTORY) throw new Error('confirmed_project_backup_directory_required');
  await inspectLocalBackupDirectory(directory);
  if (![directory, keyDirectory, remoteProgram].every(value => path.isAbsolute(value || ''))
    || keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw new Error('backup_paths_invalid');
  const lock = path.join(directory, '.vps-release-export-lock');
  await mkdir(lock, { mode: 0o700 });
  let key, child, terminal, timeout;
  try {
    const program = await readFile(remoteProgram, 'utf8');
    child = spawn('/usr/bin/ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'ConnectTimeout=15', `root@${host}`, 'python3', '-', releasePath],
    { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stdin.end(program);
    let metadataBuffer = '', before, after, remoteFailure;
    let resolveBefore, rejectBefore;
    const beforeReady = new Promise((resolve, reject) => { resolveBefore = resolve; rejectBefore = reject; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      metadataBuffer += chunk;
      if (metadataBuffer.length > 32 * 1024 * 1024) { child.kill('SIGTERM'); rejectBefore(new Error('remote_metadata_limit_exceeded')); return; }
      const lines = metadataBuffer.split('\n'); metadataBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('STOCKINSIDER_META\t')) continue;
        try {
          const value = JSON.parse(line.slice('STOCKINSIDER_META\t'.length));
          if (value.phase === 'before' && !before) { before = value.tree; resolveBefore(before); }
          else if (value.phase === 'after') after = value.tree;
          else if (value.phase === 'failed') remoteFailure = value.reason;
        } catch { remoteFailure = 'remote_metadata_invalid'; }
      }
    });
    terminal = new Promise(resolve => {
      child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    timeout = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
    const tree = await Promise.race([beforeReady, terminal.then(() => { throw new Error('remote_manifest_missing'); })]);
    if (tree.releasePath !== releasePath || tree.schema !== 'stockinsider-vps-release-tree-v1'
      || !/^[0-9a-f]{64}$/.test(tree.treeSha256 || '') || !Number.isSafeInteger(tree.fileCount)
      || tree.fileCount < 1 || tree.fileCount !== tree.files?.length) throw new Error('remote_manifest_invalid');
    verifyReleaseTreeManifest(tree, tree);
    const manifest = { schema: 'stockinsider-vps-release-export-v1', host, releasePath,
      createdAt: new Date().toISOString(), tree, plaintextStoredOnMac: false,
      remoteDeletePerformed: false, restoreVerified: false,
      keyReference: 'private-local-file:aes256-v1' };
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    key = await loadLocalBackupKey(keyDirectory);
    async function* tarChunks() {
      for await (const chunk of child.stdout) yield Buffer.from(chunk);
      const result = await terminal;
      clearTimeout(timeout);
      if (result.code !== 0 || result.signal || remoteFailure || !after
        || canonical(after) !== canonical(before)) throw new Error('remote_release_stream_failed_or_changed');
    }
    const id = `vps-release-${identity.application}-${identity.release}-${randomUUID()}`;
    const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`,
      input: tarChunks(), key, contextSha256, maxPlaintextBytes: tarUpperBound(tree), timeoutMs: 3_600_000 });
    const receipt = { manifest, contextSha256, result, postTreeSha256: after.treeSha256,
      treeStable: true, restoreVerified: false, completeReleaseBackup: false };
    const receiptPath = path.join(directory, `${id}.manifest.json`);
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { receiptPath, artifact: result.filename, treeSha256: tree.treeSha256,
      files: tree.fileCount, bytes: tree.totalBytes, restoreVerified: false };
  } finally {
    if (timeout) clearTimeout(timeout);
    if (child && child.exitCode === null && !child.killed) child.kill('SIGTERM');
    if (terminal) await terminal.catch(() => {});
    key?.fill(0);
    await rmdir(lock).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, keyDirectory, releasePath, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('usage');
    console.log(JSON.stringify(await exportVpsReleaseBackup({ directory, keyDirectory, releasePath })));
  } catch (error) {
    console.error(JSON.stringify({ error: 'vps_release_export_failed', reason: error.message,
      plaintextStoredOnMac: false, remoteDeletePerformed: false })); process.exitCode = 1;
  }
}
