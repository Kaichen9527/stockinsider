// Full archive rehearsal in a NEW, private Unix-socket-only cluster. Never targets
// an existing server. A successful restore is not a production cutover approval.
import { mkdtemp, mkdir, open, readFile, statfs, writeFile } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash, createDecipheriv } from 'node:crypto';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { verifyBackupChunks, BACKUP_ENVELOPE_LAYOUT as layout } from './local-backup-envelope.mjs';

const [manifestPath, keyDirectory] = process.argv.slice(2);
const bin = '/opt/homebrew/bin';
let directory, file, key, started = false, phase = 'preflight';
// No inherited PG* variables: an accidental environment setting must not select
// a remote database, password file, service definition, or logging location.
const env = { PATH: '/opt/homebrew/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C' };
async function run(name, args, input) {
  const child = spawn(path.join(bin, name), args, { env, stdio: ['pipe', 'ignore', 'pipe'] });
  const categories = new Map(); let pending = '';
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', chunk => {
    pending = (pending + chunk).slice(-65536);
    const lines = pending.split('\n'); pending = lines.pop();
    for (const line of lines) {
      // SQL, COPY values and function bodies must not enter receipts or chat.
      if (!line.includes('ERROR:')) continue;
      const category = /extension .* is not available/.test(line) ? 'extension_unavailable'
        : /role .* does not exist/.test(line) ? 'role_missing'
        : /schema .* does not exist/.test(line) ? 'schema_missing'
        : /function .* does not exist/.test(line) ? 'function_missing'
        : /relation .* does not exist/.test(line) ? 'relation_missing' : 'other_sql_error';
      categories.set(category, (categories.get(category) || 0) + 1);
    }
  });
  const terminal = new Promise(resolve => {
    child.once('error', () => resolve(-1)); child.once('close', code => resolve(code));
  });
  const timer = setTimeout(() => child.kill('SIGTERM'), 30 * 60 * 1000);
  try {
    if (input) await input(child.stdin); else child.stdin.end();
    return { exitCode: await terminal, errors: Object.fromEntries(categories) };
  } catch (error) { child.kill('SIGTERM'); await terminal; throw error; }
  finally { clearTimeout(timer); }
}

try {
  if (process.argv.length !== 4 || ![manifestPath, keyDirectory].every(path.isAbsolute)) throw Error();
  const volume = await statfs('/private/tmp', { bigint: true });
  if (volume.bavail * volume.bsize < 25n * 1024n ** 3n) throw Error();
  const receipt = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (receipt.manifest.project !== 'mgqpxfbdhmiygdytgswi') throw Error();
  const contextSha256 = createHash('sha256').update(JSON.stringify(receipt.manifest)).digest('hex');
  if (contextSha256 !== receipt.contextSha256 || !/^[a-zA-Z0-9_-]+\.sib$/.test(receipt.result.filename)) throw Error();
  file = await open(path.join(path.dirname(manifestPath), receipt.result.filename), constants.O_RDONLY | constants.O_NOFOLLOW);
  const info = await file.stat();
  if (!info.isFile() || info.uid !== process.getuid() || (info.mode & 0o777) !== 0o600) throw Error();
  key = await loadLocalBackupKey(keyDirectory);
  phase = 'authentication';
  const verification = await verifyBackupChunks(file.createReadStream({ start: 0, autoClose: false }),
    { key, contextSha256, maxPlaintextBytes: 8 * 1024 ** 3 });
  if (verification.plaintextSha256 !== receipt.result.plaintextSha256) throw Error();
  directory = await mkdtemp('/private/tmp/stockinsider-restore-');
  const data = path.join(directory, 'data'), socket = path.join(directory, 'socket');
  await mkdir(socket, { mode: 0o700 });
  phase = 'initdb';
  if ((await run('initdb', ['-D', data, '-U', 'stockinsider_rehearsal', '--auth-local=trust', '--auth-host=reject', '--encoding=UTF8', '--no-locale'])).exitCode !== 0) throw Error();
  phase = 'start';
  if ((await run('pg_ctl', ['-D', data, '-l', path.join(directory, 'postgres.log'), '-o', `-k ${socket} -c listen_addresses='' -c log_statement=none -c log_min_error_statement=panic`, '-w', 'start'])).exitCode !== 0) throw Error();
  started = true;
  phase = 'restore';
  const header = Buffer.alloc(layout.headerBytes), tag = Buffer.alloc(layout.tagBytes);
  await file.read(header, 0, header.length, 0); await file.read(tag, 0, tag.length, info.size - tag.length);
  const decipher = createDecipheriv('aes-256-gcm', key, header.subarray(layout.ivStart, layout.ivEnd));
  decipher.setAAD(header); decipher.setAuthTag(tag);
  const result = await run('pg_restore', ['--host', socket, '--username=stockinsider_rehearsal', '--dbname=postgres', '--no-owner', '--no-acl'],
    stdin => pipeline(file.createReadStream({ start: layout.headerBytes, end: info.size - layout.tagBytes - 1, autoClose: false }), decipher, stdin));
  const outcome = { schema: 'stockinsider-restore-rehearsal-v1', createdAt: new Date().toISOString(),
    contextSha256, sourcePlaintextSha256: verification.plaintextSha256, directory,
    archiveSqlExecuted: true, archiveRestoreSucceeded: result.exitCode === 0,
    rolesAndAclRestored: false, applicationValidationPassed: false, restoreVerified: false,
    ...result };
  await writeFile(path.join(directory, 'receipt.json'), JSON.stringify(outcome, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify(outcome));
  if (result.exitCode !== 0) process.exitCode = 1;
} catch {
  console.error(JSON.stringify({ error: 'local_restore_rehearsal_failed', phase, directory, restoreVerified: false }));
  process.exitCode = 1;
} finally {
  key?.fill(0); await file?.close();
  if (started) {
    const stopped = await run('pg_ctl', ['-D', path.join(directory, 'data'), '-m', 'fast', '-w', 'stop']);
    if (stopped.exitCode !== 0) { console.error(JSON.stringify({ error: 'rehearsal_shutdown_failed', directory })); process.exitCode = 1; }
  }
}
