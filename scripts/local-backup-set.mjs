import { constants, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, open, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';

const safeName = value => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/.test(value);
const sha256 = value => createHash('sha256').update(value).digest('hex');

async function readPrivateFile(directory, filename) {
  if (!safeName(filename)) throw new Error('backup_member_name_invalid');
  const absolute = path.join(directory, filename);
  const metadata = await lstat(absolute);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.uid !== process.getuid()
    || (metadata.mode & 0o077) !== 0) throw new Error('backup_member_not_private');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolute, { flags: constants.O_RDONLY | constants.O_NOFOLLOW })) {
    hash.update(chunk);
  }
  return { filename, bytes: metadata.size, sha256: hash.digest('hex') };
}

async function readMember(directory, filename) {
  const member = await readPrivateFile(directory, filename);
  if (member.bytes > 16 * 1024 ** 2) throw new Error('backup_json_member_too_large');
  return { ...member, json: JSON.parse(await readFile(path.join(directory, filename), 'utf8')) };
}

export function assessBackupSet({ database, storageInventory, storageManifests, provider, restore }) {
  const reasons = [];
  const databaseSchema = database.json?.manifest?.schema;
  if (!['stockinsider-database-export-v1', 'stockinsider-database-export-v2'].includes(databaseSchema)
    || database.json?.result?.envelopeVerified !== true
    || (databaseSchema === 'stockinsider-database-export-v2'
      && database.json?.remoteEphemeralCredentialsRemoved !== true)) reasons.push('database_export_unverified');
  if (storageInventory.json?.inventoryStable !== true || storageInventory.json?.restoreVerified !== false) {
    reasons.push('storage_inventory_unverified');
  }
  const expectedStorage = storageInventory.json?.receipts || [];
  const actualContexts = new Set(storageManifests.map(item => item.json?.contextSha256));
  if (expectedStorage.length !== storageManifests.length
    || expectedStorage.some(item => !actualContexts.has(item.contextSha256))
    || storageManifests.some(item => item.json?.manifest?.schema !== 'stockinsider-storage-export-v1'
      || item.json?.result?.envelopeVerified !== true)) reasons.push('storage_members_incomplete');
  if (provider.json?.manifest?.schema !== 'stockinsider-provider-recovery-v1'
    || provider.json?.result?.envelopeVerified !== true) reasons.push('provider_recovery_unverified');
  const restoreVerified = restore.json?.schema === 'stockinsider-contabo-restore-rehearsal-v2'
    && restore.json?.restoreVerified === true
    && restore.json?.applicationValidationPassed === true
    && restore.json?.source?.plaintextSha256 === database.json?.result?.plaintextSha256
    && restore.json?.source?.contextSha256 === database.json?.contextSha256
    && restore.json?.restore?.unixSocketOnly === true
    && restore.json?.restore?.plaintextArchiveWritten === false
    && restore.json?.restore?.ownerAndAclReplay === true
    && restore.json?.restore?.portableMigrationApplied === true;
  if (!restoreVerified) reasons.push('clean_restore_not_verified');
  return { completeSystemBackup: reasons.length === 0, restoreVerified, reasons };
}

export async function assembleLocalBackupSet({ directory, spec, now = new Date() }) {
  const inventory = await inspectLocalBackupDirectory(directory);
  const backupDirectory = await realpath(inventory.directory);
  if (!['daily', 'weekly', 'cold-unique'].includes(spec.retentionClass)) throw new Error('retention_class_invalid');
  const database = await readMember(backupDirectory, spec.databaseManifest);
  const databaseArtifact = await readPrivateFile(backupDirectory, database.json?.result?.filename);
  const storageInventory = await readMember(backupDirectory, spec.storageInventory);
  const storageManifests = await Promise.all((spec.storageManifests || []).map(name => readMember(backupDirectory, name)));
  const storageArtifacts = await Promise.all(storageManifests.map(item =>
    readPrivateFile(backupDirectory, item.json?.result?.filename)));
  const provider = await readMember(backupDirectory, spec.providerManifest);
  const providerArtifact = await readPrivateFile(backupDirectory, provider.json?.result?.filename);
  const restore = await readMember(backupDirectory, spec.restoreReceipt);
  const assessment = assessBackupSet({ database, storageInventory, storageManifests, provider, restore });
  const members = [database, databaseArtifact, storageInventory, ...storageManifests, ...storageArtifacts,
    provider, providerArtifact, restore]
    .map(({ filename, sha256: digest }) => ({ filename, sha256: digest }));
  const id = `backup-set-${now.toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const manifest = { schema: 'stockinsider-local-backup-set-v1', id, createdAt: now.toISOString(),
    retentionClass: spec.retentionClass, members, ...assessment,
    localBudgetBytes: 25 * 1024 ** 3, independentOffsiteCopyVerified: false };
  const manifestSha256 = sha256(JSON.stringify(manifest));
  const filename = `${id}.json`;
  await writeFile(path.join(backupDirectory, filename), JSON.stringify({ manifest, manifestSha256 }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  const handle = await open(backupDirectory, constants.O_RDONLY);
  try { await handle.sync(); } finally { await handle.close(); }
  return { filename, manifestSha256, ...assessment };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, specPath, ...extra] = process.argv.slice(2);
    if (extra.length || ![directory, specPath].every(value => path.isAbsolute(value || ''))) throw new Error('absolute_paths_required');
    const spec = JSON.parse(await readFile(specPath, 'utf8'));
    const result = await assembleLocalBackupSet({ directory, spec });
    console.log(JSON.stringify(result));
    process.exitCode = result.completeSystemBackup ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ error: 'backup_set_assembly_failed', reason: error.message,
      completeSystemBackup: false })); process.exitCode = 1;
  }
}
