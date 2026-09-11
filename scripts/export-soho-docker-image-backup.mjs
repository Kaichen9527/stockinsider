/** Fixed-host SOHO image backup. Docker-save plaintext travels only through the
 * SSH pipe into the AES-GCM envelope and is never written to the Mac filesystem.
 */
import { createHash, randomUUID } from 'node:crypto';
import { readFile, rmdir, writeFile, mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory, CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { canonical, loadSohoImagePolicy, SOHO_VPS_HOST } from './soho-image-policy.mjs';

const GIB = 1024 ** 3;

function verifyObserved(images, policy) {
  const expectedCount = Object.keys(policy.obsoleteCandidates).length;
  if (!Array.isArray(images) || images.length !== expectedCount) throw new Error('soho_image_manifest_invalid');
  const refs = new Set();
  for (const image of images) {
    if (!image || Object.keys(image).sort().join(',')
      !== 'architecture,configJsonSha256,imageId,os,ref,rootFsLayers,size') throw new Error('soho_image_manifest_shape_invalid');
    if (policy.obsoleteCandidates[image.ref] !== image.imageId
      || refs.has(image.ref) || !Number.isSafeInteger(image.size) || image.size <= 0
      || !/^[0-9a-f]{64}$/u.test(image.configJsonSha256 || '')
      || !['amd64'].includes(image.architecture) || image.os !== 'linux'
      || !Array.isArray(image.rootFsLayers) || image.rootFsLayers.length < 1
      || image.rootFsLayers.some(layer => !/^sha256:[0-9a-f]{64}$/u.test(layer))) {
      throw new Error('soho_image_identity_invalid');
    }
    refs.add(image.ref);
  }
  if (canonical([...refs].sort()) !== canonical(Object.keys(policy.obsoleteCandidates).sort())) {
    throw new Error('soho_image_candidate_set_mismatch');
  }
}

export async function exportSohoDockerImageBackup({ directory, keyDirectory, host = SOHO_VPS_HOST }) {
  if (host !== SOHO_VPS_HOST || directory !== CONFIRMED_BACKUP_DIRECTORY
    || !path.isAbsolute(keyDirectory || '') || keyDirectory === directory
    || keyDirectory.startsWith(directory + path.sep)) throw new Error('soho_backup_input_invalid');
  await inspectLocalBackupDirectory(directory);
  const { policy, policySha256, candidateRefs } = await loadSohoImagePolicy();
  const remoteProgram = path.join(path.dirname(fileURLToPath(import.meta.url)), 'remote-soho-docker-save.py');
  const lock = path.join(directory, '.soho-image-export-lock');
  await mkdir(lock, { mode: 0o700 });
  let key, child, terminal, timeout;
  try {
    const program = await readFile(remoteProgram, 'utf8');
    child = spawn('/usr/bin/ssh', ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes',
      '-o', 'ConnectTimeout=15', '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3',
      `root@${host}`, 'python3', '-', ...candidateRefs],
    { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.on('error', () => {});
    child.stdin.end(program);
    let metadataBuffer = '', before, after, remoteFailure;
    let resolveBefore, rejectBefore;
    const beforeReady = new Promise((resolve, reject) => { resolveBefore = resolve; rejectBefore = reject; });
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => {
      metadataBuffer += chunk;
      if (metadataBuffer.length > 8 * 1024 * 1024) {
        child.kill('SIGTERM'); rejectBefore(new Error('remote_metadata_limit_exceeded')); return;
      }
      const lines = metadataBuffer.split('\n'); metadataBuffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('STOCKINSIDER_META\t')) continue;
        try {
          const value = JSON.parse(line.slice('STOCKINSIDER_META\t'.length));
          if (value.phase === 'before' && !before) { before = value.images; resolveBefore(before); }
          else if (value.phase === 'after') after = value.images;
          else if (value.phase === 'failed') remoteFailure = value.reason;
        } catch { remoteFailure = 'remote_metadata_invalid'; }
      }
    });
    terminal = new Promise(resolve => {
      child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
      child.once('close', (code, signal) => resolve({ code, signal }));
    });
    timeout = setTimeout(() => child.kill('SIGTERM'), 60 * 60 * 1000);
    const images = await Promise.race([beforeReady,
      terminal.then(() => { throw new Error('remote_image_manifest_missing'); })]);
    verifyObserved(images, policy);
    const manifest = { schema: 'stockinsider-soho-image-export-v3', host,
      createdAt: new Date().toISOString(), policySha256, images,
      candidateRefs, plaintextStoredOnMac: false, productionMutationPerformed: false,
      broadPrunePerformed: false, restoreVerified: false,
      externallyAbsentBeforeVerifiedArchive: policy.externallyAbsentBeforeVerifiedArchive,
      externallyAbsentDetectedAt: policy.externallyAbsentDetectedAt,
      externallyAbsentDisposition: policy.externallyAbsentDisposition };
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    const maximumPlaintextBytes = images.reduce((sum, image) => sum + image.size, 0) + 2 * GIB;
    if (!Number.isSafeInteger(maximumPlaintextBytes) || maximumPlaintextBytes >= 25 * GIB) {
      throw new Error('soho_archive_upper_bound_invalid');
    }
    key = await loadLocalBackupKey(keyDirectory);
    async function* saveChunks() {
      for await (const chunk of child.stdout) yield Buffer.from(chunk);
      const result = await terminal;
      clearTimeout(timeout);
      if (result.code !== 0 || result.signal || remoteFailure || !after
        || canonical(after) !== canonical(before)) throw new Error('remote_soho_image_export_failed_or_changed');
    }
    const id = `soho-docker-images-${randomUUID()}`;
    const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`,
      input: saveChunks(), key, contextSha256, maxPlaintextBytes: maximumPlaintextBytes,
      timeoutMs: 3_600_000 });
    const receipt = { manifest, contextSha256, result, postImages: after,
      identitiesStable: true, restoreVerified: false, completeImageBackup: false };
    const receiptPath = path.join(directory, `${id}.manifest.json`);
    await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
    return { receiptPath, artifact: result.filename, imageCount: images.length,
      plaintextBytes: result.plaintextBytes, restoreVerified: false };
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
    const [directory, keyDirectory, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('usage');
    console.log(JSON.stringify(await exportSohoDockerImageBackup({ directory, keyDirectory })));
  } catch (error) {
    console.error(JSON.stringify({ error: 'soho_image_export_failed', reason: error.message,
      plaintextStoredOnMac: false, productionMutationPerformed: false })); process.exitCode = 1;
  }
}
