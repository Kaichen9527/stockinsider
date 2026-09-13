/** Export the immutable Contabo private-artifact store over SSH. Each object is
 * authenticated against its hash-addressed filename before an encrypted local
 * backup member is published. No plaintext artifact is written on the Mac.
 */
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';

const HOST = '5.104.83.211';
const ROOT = '/var/lib/stockinsider/artifacts';
const SSH = '/usr/bin/ssh';
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3'];
const INVENTORY_COMMAND = `set -eu; test -d ${ROOT}; test -z "$(find ${ROOT} -type l -print -quit)"; test -z "$(find ${ROOT} -mindepth 1 -maxdepth 1 ! -type d -print -quit)"; test -z "$(find ${ROOT} -mindepth 2 -maxdepth 2 ! -type f -print -quit)"; test -z "$(find ${ROOT} -mindepth 3 -print -quit)"; find ${ROOT} -mindepth 2 -maxdepth 2 -type f -printf '%P\\t%s\\n' | LC_ALL=C sort`;
const MEMBER = /^([0-9a-f]{2})\/([0-9a-f]{64})\t([0-9]+)$/u;
const MAX_OBJECTS = 1000;
const MAX_OBJECT_BYTES = 128 * 1024 * 1024;

async function remoteText(command) {
  const child = spawn(SSH, [...SSH_OPTIONS, `root@${HOST}`, command], { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > 4 * 1024 * 1024) child.kill('SIGTERM'); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-8192); });
  const result = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal) throw new Error('contabo_artifact_inventory_failed');
  return stdout;
}

function parseInventory(text) {
  const rows = text.trim() ? text.trim().split('\n') : [];
  if (rows.length > MAX_OBJECTS) throw new Error('contabo_artifact_inventory_too_large');
  return rows.map(line => {
    const match = MEMBER.exec(line);
    const bytes = Number(match?.[3]);
    if (!match || match[1] !== match[2].slice(0, 2) || !Number.isSafeInteger(bytes)
      || bytes < 1 || bytes > MAX_OBJECT_BYTES) throw new Error('contabo_artifact_inventory_invalid');
    return { name: `${match[1]}/${match[2]}`, hash: match[2], bytes };
  });
}

function remoteObject(item) {
  const child = spawn(SSH, [...SSH_OPTIONS, `root@${HOST}`, `cat -- ${ROOT}/${item.name}`],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8192); });
  const terminal = new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  async function* chunks() {
    let bytes = 0;
    const hash = createHash('sha256');
    for await (const chunk of child.stdout) { bytes += chunk.length; hash.update(chunk); yield chunk; }
    const result = await terminal;
    if (result.code !== 0 || result.signal || bytes !== item.bytes || hash.digest('hex') !== item.hash) {
      throw new Error('contabo_artifact_transfer_invalid');
    }
  }
  return { child, chunks: chunks() };
}

export async function exportContaboPrivateArtifacts({ directory, keyDirectory }) {
  await inspectLocalBackupDirectory(directory);
  const lock = path.join(directory, '.contabo-artifact-export-lock');
  await mkdir(lock, { mode: 0o700 });
  let key;
  try {
    if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw new Error('backup_key_invalid');
    key = await loadLocalBackupKey(keyDirectory);
    const initialText = await remoteText(INVENTORY_COMMAND);
    const initial = parseInventory(initialText);
    const receipts = [];
    for (const item of initial) {
      const manifest = { schema: 'stockinsider-storage-export-v2', project: 'stockinsider-contabo',
        createdAt: new Date().toISOString(), source: 'contabo_private_artifact_store',
        object: { id: item.hash, bucket_id: 'private-artifacts', name: item.name,
          updated_at: null, metadata: { size: item.bytes, sha256: item.hash } },
        keyReference: 'private-local-file:aes256-v1', restoreVerified: false };
      const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
      const id = `storage-${randomUUID()}`;
      const transfer = remoteObject(item);
      try {
        const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: transfer.chunks,
          key, contextSha256, maxPlaintextBytes: item.bytes, timeoutMs: 180_000 });
        await writeFile(path.join(directory, `${id}.manifest.json`),
          `${JSON.stringify({ manifest, contextSha256, result }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
        receipts.push({ filename: result.filename, contextSha256 });
      } finally {
        if (transfer.child.exitCode === null && !transfer.child.killed) transfer.child.kill('SIGTERM');
      }
    }
    const finalText = await remoteText(INVENTORY_COMMAND);
    if (initialText !== finalText) throw new Error('contabo_artifact_inventory_changed');
    const inventory = `storage-inventory-${randomUUID()}.json`;
    await writeFile(path.join(directory, inventory), `${JSON.stringify({
      schema: 'stockinsider-storage-inventory-v2', source: 'stockinsider-contabo', createdAt: new Date().toISOString(),
      objects: initial.length, receipts, inventoryStable: true,
      combinedDatabaseSnapshotVerified: false, restoreVerified: false,
    }, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return { phase: 'storage_export_verified', inventory, objects: initial.length,
      totalBytes: initial.reduce((sum, item) => sum + item.bytes, 0), restoreVerified: false };
  } finally {
    key?.fill(0);
    await rmdir(lock).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, keyDirectory, ...extra] = process.argv.slice(2);
    if (extra.length || ![directory, keyDirectory].every(value => path.isAbsolute(value || ''))) {
      throw new Error('two_absolute_paths_required');
    }
    console.log(JSON.stringify(await exportContaboPrivateArtifacts({ directory, keyDirectory })));
  } catch (error) {
    const safe = new Set(['two_absolute_paths_required', 'backup_key_invalid', 'contabo_artifact_inventory_failed',
      'contabo_artifact_inventory_too_large', 'contabo_artifact_inventory_invalid',
      'contabo_artifact_transfer_invalid', 'contabo_artifact_inventory_changed', 'local_backup_budget_exceeded']);
    console.error(JSON.stringify({ phase: 'storage_export_failed',
      reason: safe.has(error.message) ? error.message : 'contabo_artifact_export_failed', restoreVerified: false }));
    process.exitCode = 1;
  }
}
