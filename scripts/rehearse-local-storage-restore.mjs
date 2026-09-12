// Restore every encrypted Supabase Storage member into the same immutable,
// hash-addressed layout used on Contabo, verify it, then remove the rehearsal
// directory. No document bytes or original paths are printed.
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { createDecipheriv, createHash, randomUUID } from 'node:crypto';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { chmod, lstat, link, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';

const PROJECT = 'mgqpxfbdhmiygdytgswi';
const SHA256 = /^[a-f0-9]{64}$/u;
const STORAGE_MANIFEST = /^storage-[a-zA-Z0-9-]+[.]manifest[.]json$/u;
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_OBJECT_BYTES = 128 * 1024 * 1024;

const digest = value => createHash('sha256').update(value).digest('hex');

async function assertPrivateFile(filename, maximum = Number.MAX_SAFE_INTEGER) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o600 || info.nlink !== 1 || info.size <= 0 || info.size > maximum) {
    throw new Error('storage_recovery_file_invalid');
  }
  return info;
}

async function readPrivateJson(filename) {
  await assertPrivateFile(filename, MAX_JSON_BYTES);
  return JSON.parse(await readFile(filename, 'utf8'));
}

async function assertPrivateRoot(root) {
  const resolved = await realpath(root);
  if (resolved !== root || resolved === '/') throw new Error('storage_restore_root_invalid');
  let current = path.parse(root).root;
  for (const segment of root.slice(current.length).split(path.sep).filter(Boolean)) {
    current = path.join(current, segment);
    const info = await lstat(current);
    if (!info.isDirectory() || info.isSymbolicLink()
      || (info.uid !== 0 && info.uid !== process.getuid())
      || ((info.mode & 0o022) !== 0 && !(info.uid === 0 && (info.mode & 0o1000) !== 0))) {
      throw new Error('storage_restore_root_untrusted');
    }
  }
  const info = await lstat(root);
  if (info.uid !== process.getuid() || (info.mode & 0o077) !== 0) throw new Error('storage_restore_root_not_private');
}

async function verifyStored(filename, expectedHash, expectedBytes) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o077) !== 0 || info.size !== expectedBytes) throw new Error('restored_storage_file_invalid');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) hash.update(chunk);
  if (hash.digest('hex') !== expectedHash) throw new Error('restored_storage_hash_mismatch');
}

async function restoreOne({ backupDirectory, root, entry, outer, key }) {
  const expectedHash = outer?.result?.plaintextSha256;
  const expectedBytes = outer?.result?.plaintextBytes;
  const object = outer?.manifest?.object;
  const pathSegments = String(object?.name || '').split('/');
  if (outer?.manifest?.schema !== 'stockinsider-storage-export-v1' || outer.manifest.project !== PROJECT
    || digest(JSON.stringify(outer.manifest)) !== entry.contextSha256
    || outer.contextSha256 !== entry.contextSha256 || outer.result?.envelopeVerified !== true
    || outer.result?.filename !== entry.filename || !SHA256.test(expectedHash || '')
    || !Number.isSafeInteger(expectedBytes) || expectedBytes <= 0 || expectedBytes > MAX_OBJECT_BYTES
    || Number(object?.metadata?.size) !== expectedBytes || pathSegments.some(segment => !segment || segment === '.' || segment === '..')
    || pathSegments.at(-1) !== expectedHash || !/^[a-z0-9][a-z0-9-]{0,100}$/u.test(object?.bucket_id || '')) {
    throw new Error('storage_recovery_manifest_invalid');
  }
  const artifactPath = path.join(backupDirectory, entry.filename);
  const artifactInfo = await assertPrivateFile(artifactPath, MAX_OBJECT_BYTES + 128);
  if (artifactInfo.size !== expectedBytes + layout.headerBytes + layout.tagBytes) throw new Error('storage_recovery_envelope_size_mismatch');
  const file = await open(artifactPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  const prefix = path.join(root, expectedHash.slice(0, 2));
  await mkdir(prefix, { mode: 0o700 }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await chmod(prefix, 0o700);
  const target = path.join(prefix, expectedHash);
  const temporary = path.join(prefix, `.restore-${randomUUID()}`);
  let temporaryCreated = false;
  try {
    const header = Buffer.alloc(layout.headerBytes);
    const tag = Buffer.alloc(layout.tagBytes);
    await file.read(header, 0, header.length, 0);
    await file.read(tag, 0, tag.length, artifactInfo.size - tag.length);
    if (header.subarray(layout.ivEnd).toString('hex') !== entry.contextSha256) throw new Error('storage_recovery_context_mismatch');
    const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
    decipher.setAAD(header); decipher.setAuthTag(tag);
    let bytes = 0;
    const hash = createHash('sha256');
    const meter = new Transform({ transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > expectedBytes) return callback(new Error('storage_recovery_plaintext_too_large'));
      hash.update(chunk); callback(null, chunk);
    } });
    const handle = await open(temporary, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW, 0o600);
    await handle.close(); temporaryCreated = true;
    await pipeline(file.createReadStream({ start: layout.headerBytes,
      end: artifactInfo.size - layout.tagBytes - 1, autoClose: false }), decipher, meter,
    createWriteStream(temporary, { flags: constants.O_WRONLY | constants.O_NOFOLLOW }));
    if (bytes !== expectedBytes || hash.digest('hex') !== expectedHash) throw new Error('storage_recovery_plaintext_mismatch');
    try { await link(temporary, target); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await verifyStored(target, expectedHash, expectedBytes);
    header.fill(0); tag.fill(0);
    return expectedBytes;
  } finally {
    await file.close();
    if (temporaryCreated) await unlink(temporary).catch(() => {});
  }
}

export async function rehearseLocalStorageRestore({ inventoryPath, keyDirectory, receiptDirectory, scratchParent }) {
  if (![inventoryPath, keyDirectory, receiptDirectory, scratchParent].every(value => path.isAbsolute(value || ''))) {
    throw new Error('absolute_paths_required');
  }
  if ((await lstat(inventoryPath)).isSymbolicLink() || (await lstat(receiptDirectory)).isSymbolicLink()
    || (await lstat(scratchParent)).isSymbolicLink()) throw new Error('storage_restore_path_symlink_rejected');
  const inventoryReal = await realpath(inventoryPath);
  const receiptReal = await realpath(receiptDirectory);
  await assertPrivateRoot(receiptReal);
  const backupDirectory = path.dirname(inventoryReal);
  const inventoryBytes = await readFile(inventoryReal);
  const inventory = JSON.parse(inventoryBytes.toString('utf8'));
  if (inventory?.inventoryStable !== true || inventory?.restoreVerified !== false
    || !Number.isSafeInteger(inventory?.objects) || inventory.objects < 1 || inventory.objects > 100
    || !Array.isArray(inventory.receipts) || inventory.receipts.length !== inventory.objects
    || new Set(inventory.receipts.map(item => item.contextSha256)).size !== inventory.objects) {
    throw new Error('storage_inventory_invalid');
  }
  const byContext = new Map();
  for (const name of await readdir(backupDirectory)) {
    if (!STORAGE_MANIFEST.test(name)) continue;
    const outer = await readPrivateJson(path.join(backupDirectory, name));
    if (inventory.receipts.some(item => item.contextSha256 === outer?.contextSha256)) {
      if (byContext.has(outer.contextSha256)) throw new Error('storage_manifest_context_ambiguous');
      byContext.set(outer.contextSha256, outer);
    }
  }
  if (byContext.size !== inventory.objects) throw new Error('storage_manifest_missing');
  const scratchBase = await realpath(scratchParent);
  const scratch = await mkdtemp(path.join(scratchBase, 'stockinsider-storage-restore-'));
  await chmod(scratch, 0o700);
  await assertPrivateRoot(scratch);
  let key;
  let restoredBytes = 0;
  let receipt;
  try {
    key = await loadLocalBackupKey(keyDirectory);
    for (const entry of inventory.receipts) {
      restoredBytes += await restoreOne({ backupDirectory, root: scratch, entry,
        outer: byContext.get(entry.contextSha256), key });
    }
    receipt = {
      schema: 'stockinsider-storage-restore-rehearsal-v1', createdAt: new Date().toISOString(),
      source: { inventoryFilename: path.basename(inventoryReal), inventorySha256: digest(inventoryBytes),
        contextSha256: digest([...byContext.keys()].sort().join('\n')) },
      objectsRestored: inventory.objects, plaintextBytesRestored: restoredBytes,
      privateHashAddressedLayoutVerified: true, objectHashesVerified: true,
      temporaryFilesRemoved: true, restoredPlaintextRetained: false,
      productionRestoreVerified: false,
    };
  } finally {
    key?.fill(0);
    inventoryBytes.fill(0);
    await rm(scratch, { recursive: true, force: true });
  }
  const filename = `storage-restore-rehearsal-${randomUUID()}.json`;
  await writeFile(path.join(receiptReal, filename), JSON.stringify(receipt, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  return { filename, ...receipt };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [inventoryPath, keyDirectory, receiptDirectory, scratchParent, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error('unexpected_arguments');
    const result = await rehearseLocalStorageRestore({ inventoryPath, keyDirectory, receiptDirectory, scratchParent });
    console.log(JSON.stringify({ schema: result.schema, filename: result.filename,
      objectsRestored: result.objectsRestored, plaintextBytesRestored: result.plaintextBytesRestored,
      productionRestoreVerified: false }));
  } catch (error) {
    console.error(JSON.stringify({ error: 'storage_restore_rehearsal_failed', reason: error.message,
      productionRestoreVerified: false }));
    process.exitCode = 1;
  }
}
