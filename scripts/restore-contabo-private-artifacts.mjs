#!/usr/bin/env node
// Authenticates and decrypts each bounded Storage backup as a stream, then
// sends it over SSH stdin to the immutable Contabo receiver. No plaintext file
// is retained locally or remotely outside the final hash-addressed store.
import { constants, createReadStream } from 'node:fs';
import { createDecipheriv, createHash } from 'node:crypto';
import { lstat, open, readFile, readdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';

const [inventoryPath, keyDirectory, host, releaseId] = process.argv.slice(2);
const PROJECT = 'mgqpxfbdhmiygdytgswi';
const SHA256 = /^[0-9a-f]{64}$/u;
const RELEASE = /^[0-9a-f]{40}$/u;
const MANIFEST = /^storage-[a-zA-Z0-9-]+[.]manifest[.]json$/u;
let key;
let inventoryBytes;

const digest = (value) => createHash('sha256').update(value).digest('hex');

async function privateFile(filename, maximum = Number.MAX_SAFE_INTEGER) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || (info.mode & 0o077) !== 0
    || info.size < 1 || info.size > maximum) throw new Error('artifact_recovery_file_invalid');
  return info;
}

function validateManifest(entry, outer) {
  const object = outer?.manifest?.object;
  const expectedHash = outer?.result?.plaintextSha256;
  const expectedBytes = outer?.result?.plaintextBytes;
  if (outer?.manifest?.schema !== 'stockinsider-storage-export-v1' || outer.manifest.project !== PROJECT
    || digest(JSON.stringify(outer.manifest)) !== entry.contextSha256 || outer.contextSha256 !== entry.contextSha256
    || outer.result?.envelopeVerified !== true || outer.result?.filename !== entry.filename
    || !SHA256.test(expectedHash || '') || !Number.isSafeInteger(expectedBytes)
    || expectedBytes < 1 || expectedBytes > 64 * 1024 * 1024
    || Number(object?.metadata?.size) !== expectedBytes
    || String(object?.name || '').split('/').at(-1) !== expectedHash) {
    throw new Error('artifact_recovery_manifest_invalid');
  }
  return { expectedHash, expectedBytes };
}

async function transferOne(entry, outer) {
  const { expectedHash, expectedBytes } = validateManifest(entry, outer);
  const artifactPath = path.join(path.dirname(inventoryPath), entry.filename);
  const info = await privateFile(artifactPath, expectedBytes + 128);
  if (info.size !== expectedBytes + layout.headerBytes + layout.tagBytes) {
    throw new Error('artifact_recovery_envelope_size_mismatch');
  }
  const handle = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const header = Buffer.alloc(layout.headerBytes);
  const tag = Buffer.alloc(layout.tagBytes);
  let child;
  try {
    await handle.read(header, 0, header.length, 0);
    await handle.read(tag, 0, tag.length, info.size - tag.length);
    if (header.subarray(layout.ivEnd).toString('hex') !== entry.contextSha256) {
      throw new Error('artifact_recovery_context_mismatch');
    }
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    let bytes = 0;
    const hash = createHash('sha256');
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > expectedBytes) return callback(new Error('artifact_recovery_plaintext_too_large'));
      hash.update(chunk); callback(null, chunk);
    } });
    const remote = `/opt/stockinsider-control/${releaseId}/deployment/vps/receive-contabo-private-artifact.mjs`;
    child = spawn('ssh', [`root@${host}`, 'node', remote, expectedHash, String(expectedBytes)],
      { stdio: ['pipe', 'pipe', 'pipe'] });
    const output = [];
    let outputBytes = 0;
    child.stdout.on('data', (chunk) => { outputBytes += chunk.length; if (outputBytes <= 64 * 1024) output.push(chunk); });
    child.stderr.on('data', () => {});
    const closed = new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', (code) => code === 0 ? resolve() : reject(new Error('artifact_remote_receive_failed')));
    });
    await pipeline(handle.createReadStream({ start: layout.headerBytes,
      end: info.size - layout.tagBytes - 1, autoClose: false }), decipher, meter, child.stdin);
    await closed;
    if (bytes !== expectedBytes || hash.digest('hex') !== expectedHash) throw new Error('artifact_recovery_plaintext_mismatch');
    const responseBytes = Buffer.concat(output);
    let receipt;
    try { receipt = JSON.parse(responseBytes.toString('utf8')); }
    finally { responseBytes.fill(0); for (const chunk of output) chunk.fill(0); }
    if (receipt?.schema !== 'stockinsider-contabo-private-artifact-receipt-v1'
      || receipt.installed !== true || receipt.bytes !== expectedBytes) throw new Error('artifact_remote_receipt_invalid');
    return { bytes: expectedBytes, created: receipt.created === true };
  } finally {
    header.fill(0); tag.fill(0); await handle.close();
    if (child && child.exitCode === null) child.kill('SIGTERM');
  }
}

try {
  if (process.argv.length !== 6 || !path.isAbsolute(inventoryPath || '') || !path.isAbsolute(keyDirectory || '')
    || host !== '5.104.83.211' || !RELEASE.test(releaseId || '')) throw new Error('artifact_restore_arguments_invalid');
  inventoryBytes = await readFile(inventoryPath);
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  if (inventory?.inventoryStable !== true || inventory.restoreVerified !== false
    || !Number.isSafeInteger(inventory.objects) || inventory.objects < 1 || inventory.objects > 100
    || !Array.isArray(inventory.receipts) || inventory.receipts.length !== inventory.objects) {
    throw new Error('artifact_restore_inventory_invalid');
  }
  const manifests = new Map();
  for (const name of await readdir(path.dirname(inventoryPath))) {
    if (!MANIFEST.test(name)) continue;
    const outer = JSON.parse(await readFile(path.join(path.dirname(inventoryPath), name), 'utf8'));
    if (inventory.receipts.some((entry) => entry.contextSha256 === outer?.contextSha256)) {
      if (manifests.has(outer.contextSha256)) throw new Error('artifact_restore_manifest_ambiguous');
      manifests.set(outer.contextSha256, outer);
    }
  }
  if (manifests.size !== inventory.objects) throw new Error('artifact_restore_manifest_missing');
  key = await loadLocalBackupKey(keyDirectory);
  let totalBytes = 0; let created = 0;
  for (const entry of inventory.receipts) {
    const result = await transferOne(entry, manifests.get(entry.contextSha256));
    totalBytes += result.bytes; if (result.created) created += 1;
  }
  const receipt = { schema: 'stockinsider-contabo-private-artifact-restore-v1', releaseId, host,
    inventorySha256: digest(inventoryBytes), objectsRestored: inventory.objects, objectsCreated: created,
    plaintextBytesRestored: totalBytes, objectHashesVerified: true, productionRestoreVerified: true,
    restoredAt: new Date().toISOString() };
  await writeFile(path.join(path.dirname(inventoryPath), `storage-production-${releaseId}.json`),
    `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ schema: receipt.schema, objectsRestored: receipt.objectsRestored,
    plaintextBytesRestored: receipt.plaintextBytesRestored, productionRestoreVerified: true }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'artifact_restore_failed',
    productionRestoreVerified: false }));
  process.exitCode = 1;
} finally { inventoryBytes?.fill(0); key?.fill(0); }
