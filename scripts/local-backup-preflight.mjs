/** Read-only preflight. This is not an export, restore verification or pruning tool. */
import { lstat, readdir, realpath, statfs } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const LOCAL_BACKUP_BUDGET_BYTES = 25 * 1024 ** 3;
export const CONFIRMED_BACKUP_DIRECTORY = '/Users/kaerchen/Desktop/Desktop - KC9527/20_stock/StockInsider/backup';

export function assessLocalBackupCapacity({ availableBytes, existingBytes, incomingBytes,
  temporaryBytes, budgetBytes = LOCAL_BACKUP_BUDGET_BYTES }) {
  const values = { availableBytes, existingBytes, incomingBytes, temporaryBytes, budgetBytes };
  for (const [key, value] of Object.entries(values)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`invalid_byte_budget:${key}`);
  }
  if (incomingBytes === 0 || budgetBytes === 0) throw new Error('empty_backup_or_budget');
  const additionalPeakBytes = incomingBytes + temporaryBytes;
  const peakBackupBytes = existingBytes + additionalPeakBytes;
  if (!Number.isSafeInteger(peakBackupBytes)) throw new Error('byte_budget_overflow');
  const blockers = [];
  if (additionalPeakBytes > availableBytes) blockers.push('insufficient_local_disk_space');
  if (peakBackupBytes > budgetBytes) blockers.push('local_backup_budget_exceeded');
  return { allowed: blockers.length === 0, blockers, ...values, additionalPeakBytes, peakBackupBytes,
    authority: 'capacity_preflight_only', backupVerified: false, restoreVerified: false };
}

export async function inspectLocalBackupDirectory(directory) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory) || path.resolve(directory) === '/') {
    throw new Error('dedicated_absolute_backup_directory_required');
  }
  const normalized = path.resolve(directory);
  // Reject symlinks in every user-selected path component, not only the leaf.
  let component = path.parse(normalized).root;
  for (const segment of normalized.slice(component.length).split(path.sep)) {
    component = path.join(component, segment);
    if ((await lstat(component)).isSymbolicLink()) throw new Error('backup_path_symlink_rejected');
  }
  const root = await realpath(normalized);
  const rootStat = await lstat(root);
  if (!rootStat.isDirectory()) throw new Error('backup_directory_required');
  if ((rootStat.mode & 0o077) !== 0) throw new Error('backup_directory_must_be_private');
  if (typeof process.getuid === 'function' && rootStat.uid !== process.getuid()) {
    throw new Error('backup_directory_owner_mismatch');
  }
  let existingBytes = 0;
  let entriesVisited = 0;
  const pending = [root];
  while (pending.length > 0) {
    const currentDirectory = pending.pop();
    for (const name of await readdir(currentDirectory)) {
      // Paths are supplied only by readdir, never by a manifest or caller.
      // The directory is user-owned and private; rerun under the backup lock
      // before admission because a preflight is not an atomic reservation.
      if (++entriesVisited > 100_000) throw new Error('backup_inventory_limit_exceeded');
      const entry = path.join(currentDirectory, name);
      const metadata = await lstat(entry);
      if (metadata.isSymbolicLink()) throw new Error('backup_entry_symlink_rejected');
      if (metadata.isDirectory()) pending.push(entry);
      else if (metadata.isFile()) existingBytes += metadata.size;
      else throw new Error('backup_special_file_rejected');
      if (!Number.isSafeInteger(existingBytes)) throw new Error('backup_inventory_overflow');
    }
  }
  const volume = await statfs(root, { bigint: true });
  const available = volume.bavail * volume.bsize;
  if (available > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('filesystem_capacity_overflow');
  return { directory: root, availableBytes: Number(available), existingBytes,
    observedAt: new Date().toISOString() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, incoming, temporary, ...extra] = process.argv.slice(2);
    if (extra.length || !/^\d+$/.test(incoming || '') || !/^\d+$/.test(temporary || '')) {
      throw new Error('usage: local-backup-preflight.mjs ABSOLUTE_DIRECTORY INCOMING_BYTES TEMPORARY_BYTES');
    }
    const inventory = await inspectLocalBackupDirectory(directory);
    const result = assessLocalBackupCapacity({ ...inventory, incomingBytes: Number(incoming), temporaryBytes: Number(temporary) });
    console.log(JSON.stringify({ ...inventory, ...result }));
    process.exitCode = result.allowed ? 0 : 1;
  } catch (error) {
    // Do not include filesystem exception paths, credentials, or a stack trace.
    const reason = error?.code ? `filesystem_${error.code}` : error.message;
    console.error(JSON.stringify({ allowed: false, reason }));
    process.exitCode = 1;
  }
}
