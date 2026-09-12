import { lstat, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';

export function assessBackupFreshness(sets, now = Date.now(), maxAgeMs = 24 * 60 * 60 * 1000) {
  if (!Number.isSafeInteger(now) || !Number.isSafeInteger(maxAgeMs) || maxAgeMs <= 0) throw new Error('freshness_input_invalid');
  const eligible = sets.filter(item => item?.manifest?.schema === 'stockinsider-local-backup-set-v2'
    && item.manifest.completeSystemBackup === true && item.manifest.restoreVerified === true)
    .map(item => ({ ...item, timestamp: Date.parse(item.manifest.createdAt) }))
    .filter(item => Number.isFinite(item.timestamp) && item.timestamp <= now)
    .sort((a, b) => b.timestamp - a.timestamp);
  if (!eligible.length) return { fresh: false, reason: 'no_complete_restored_backup', latestCreatedAt: null };
  const ageMs = now - eligible[0].timestamp;
  return { fresh: ageMs <= maxAgeMs, reason: ageMs <= maxAgeMs ? null : 'backup_overdue',
    latestCreatedAt: eligible[0].manifest.createdAt, ageMs, maxAgeMs };
}

export async function inspectBackupFreshness(directory, now = Date.now()) {
  const inventory = await inspectLocalBackupDirectory(directory);
  const sets = [];
  for (const name of await readdir(inventory.directory)) {
    if (!/^backup-set-[a-zA-Z0-9._-]+\.json$/.test(name)) continue;
    const absolute = path.join(inventory.directory, name), metadata = await lstat(absolute);
    if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0) continue;
    try { sets.push(JSON.parse(await readFile(absolute, 'utf8'))); } catch { /* invalid receipts never count */ }
  }
  return { ...assessBackupFreshness(sets, now), observedAt: new Date(now).toISOString(),
    backupDirectory: inventory.directory };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, ...extra] = process.argv.slice(2);
    if (extra.length || !path.isAbsolute(directory || '')) throw new Error('absolute_backup_path_required');
    const result = await inspectBackupFreshness(directory);
    console.log(JSON.stringify(result)); process.exitCode = result.fresh ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ fresh: false, reason: error.message })); process.exitCode = 1;
  }
}
