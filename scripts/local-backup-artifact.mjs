import { createReadStream, createWriteStream, constants } from 'node:fs';
import { link, open, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { encryptBackupChunks, verifyBackupChunks, BACKUP_ENVELOPE_OVERHEAD_BYTES } from './local-backup-envelope.mjs';
import { inspectLocalBackupDirectory, assessLocalBackupCapacity } from './local-backup-preflight.mjs';

/** Call under an exclusive backup lock. Input must throw on exporter nonzero exit,
 * not simply end when pg_dump stdout closes. Only encrypted bytes reach disk.
 * This publishes an authenticated artifact, NOT a DB restore-completion receipt.
 */
export async function writeEncryptedBackupArtifact({ directory, filename, input, key,
  contextSha256, maxPlaintextBytes, timeoutMs = 600_000 }) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,100}\.sib$/.test(filename || '')) throw new Error('backup_filename_invalid');
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 3_600_000) throw new Error('backup_timeout_invalid');
  const inventory = await inspectLocalBackupDirectory(directory);
  const admission = assessLocalBackupCapacity({ ...inventory,
    incomingBytes: maxPlaintextBytes + BACKUP_ENVELOPE_OVERHEAD_BYTES, temporaryBytes: 0 });
  if (!admission.allowed) throw new Error(admission.blockers.join(','));
  const temporary = path.join(inventory.directory, `.partial-${randomUUID()}`);
  const destination = path.join(inventory.directory, filename);
  const options = { key, contextSha256, maxPlaintextBytes };
  const signal = AbortSignal.timeout(timeoutMs);
  let created = false;
  try {
    const file = await open(temporary, 'wx', 0o600);
    created = true;
    await file.close();
    await pipeline(Readable.from(encryptBackupChunks(input, options)),
      createWriteStream(temporary, { flags: constants.O_WRONLY | constants.O_NOFOLLOW }), { signal });
    const verification = await verifyBackupChunks(createReadStream(temporary,
      { flags: constants.O_RDONLY | constants.O_NOFOLLOW, signal }), options);
    const fileToSync = await open(temporary, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await fileToSync.sync(); } finally { await fileToSync.close(); }
    // link is exclusive: unlike rename it never replaces an older backup.
    await link(temporary, destination);
    const directoryToSync = await open(inventory.directory, constants.O_RDONLY | constants.O_NOFOLLOW);
    try { await directoryToSync.sync(); } finally { await directoryToSync.close(); }
    return { filename, ...verification, backupComplete: false };
  } finally {
    // Remove only the uniquely named partial created by this invocation.
    if (created) await unlink(temporary);
  }
}
