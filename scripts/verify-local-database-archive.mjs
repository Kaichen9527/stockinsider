// Integrity/format check only; this is NOT a database restoration.
import { open, readFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { verifyBackupChunks, BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';

const [manifestPath, keyDirectory, pgRestore] = process.argv.slice(2);
let key, file, child;
let phase = 'arguments';
try {
  if (process.argv.length !== 5 || ![manifestPath, keyDirectory, pgRestore].every(path.isAbsolute)) throw Error();
  phase = 'manifest';
  const receipt = JSON.parse(await readFile(manifestPath, 'utf8'));
  const contextSha256 = createHash('sha256').update(JSON.stringify(receipt.manifest)).digest('hex');
  if (contextSha256 !== receipt.contextSha256 || !/^[a-zA-Z0-9_-]+\.sib$/.test(receipt.result.filename)) throw Error();
  file = await open(path.join(path.dirname(manifestPath), receipt.result.filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  const info = await file.stat();
  if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) throw Error();
  phase = 'key';
  key = await loadLocalBackupKey(keyDirectory);
  phase = 'envelope';
  const verification = await verifyBackupChunks(file.createReadStream({ start: 0, autoClose: false }),
    { key, contextSha256, maxPlaintextBytes: 8 * 1024 ** 3 });
  if (verification.plaintextSha256 !== receipt.result.plaintextSha256) throw Error();
  phase = 'decode';
  const header = Buffer.alloc(layout.headerBytes), tag = Buffer.alloc(layout.tagBytes);
  await file.read(header, 0, header.length, 0);
  await file.read(tag, 0, tag.length, info.size - tag.length);
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  child = spawn(pgRestore, ['--file=/dev/null'], { stdio: ['pipe', 'ignore', 'pipe'] });
  // Do not log names or SQL from archive contents.
  child.stderr.resume();
  const terminal = new Promise(resolve => {
    child.once('error', () => resolve(-1));
    child.once('close', code => resolve(code));
  });
  await pipeline(file.createReadStream({ start: layout.headerBytes, end: info.size - layout.tagBytes - 1, autoClose: false }), decipher, child.stdin);
  if (await terminal !== 0) throw Error();
  console.log(JSON.stringify({ envelopeVerified: true, archiveDecoded: true,
    plaintextBytes: verification.plaintextBytes, restoreVerified: false }));
} catch (error) {
  console.error(JSON.stringify({ error: 'database_archive_verification_failed', phase,
    code: ['ENOENT', 'EACCES', 'EPIPE', 'EBADF'].includes(error.code) ? error.code : 'validation_failed' }));
  process.exitCode = 1;
} finally {
  if (child && child.exitCode === null) child.kill('SIGTERM');
  key?.fill(0); await file?.close();
}
