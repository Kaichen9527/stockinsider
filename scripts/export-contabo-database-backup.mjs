/** Export the current Contabo StockInsider database over the operator SSH
 * channel. PostgreSQL authentication stays on the server's Unix socket and
 * only AES-GCM encrypted bytes are persisted on the Mac.
 */
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';

const BACKUP_HOST = '5.104.83.211';
const DATABASE = 'stockinsider';
const SSH = '/usr/bin/ssh';
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3'];
const METADATA_COMMAND = "sudo -u postgres psql -X --no-psqlrc --set ON_ERROR_STOP=1 --dbname=stockinsider --tuples-only --no-align --command \"select json_build_object('version_num',current_setting('server_version_num'),'version',current_setting('server_version'),'database_bytes',pg_database_size(current_database())::text)::text\"";
const DUMP_COMMAND = 'sudo -u postgres pg_dump --dbname=stockinsider --format=custom --compress=6 --lock-wait-timeout=5min';

async function captureRemote(command) {
  const child = spawn(SSH, [...SSH_OPTIONS, `root@${BACKUP_HOST}`, command],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-65536); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
  const terminal = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (terminal.code !== 0 || terminal.signal) throw new Error('contabo_database_metadata_failed');
  return stdout.trim();
}

export async function exportContaboDatabaseBackup({ directory, keyDirectory }) {
  await inspectLocalBackupDirectory(directory);
  const lock = path.join(directory, '.contabo-database-export-lock');
  await mkdir(lock, { mode: 0o700 });
  let key, dumpProcess;
  try {
    if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) {
      throw new Error('backup_key_invalid');
    }
    key = await loadLocalBackupKey(keyDirectory);
    if (key.length !== 32) throw new Error('backup_key_invalid');
    let metadata;
    try { metadata = JSON.parse(await captureRemote(METADATA_COMMAND)); }
    catch (error) { if (error.message === 'contabo_database_metadata_failed') throw error; throw new Error('contabo_database_metadata_invalid'); }
    if (!/^\d+$/u.test(metadata.version_num || '') || !/^\d+$/u.test(metadata.database_bytes || '')
      || Number(metadata.database_bytes) <= 0) throw new Error('contabo_database_metadata_invalid');
    const id = `contabo-database-${new Date().toISOString().replace(/[:.]/gu, '-')}-${randomUUID()}`;
    const manifest = {
      schema: 'stockinsider-database-export-v3', id, project: 'stockinsider-contabo',
      createdAt: new Date().toISOString(), snapshot: null,
      snapshotStrategy: 'pg_dump_internal_consistent_snapshot', databaseBytes: metadata.database_bytes,
      serverVersion: metadata.version, format: 'pg_dump_custom', ownersAndGrantsIncluded: true,
      transport: 'contabo_ssh_local_unix_socket', sourceEndpoint: 'local-unix-socket:stockinsider',
      credentialsInCommandOrArtifact: false, remoteEphemeralCredentialsUsed: false,
      storageFileBytesIncluded: false, providerRecoveryIncluded: true, restoreVerified: false,
      keyReference: 'private-local-file:aes256-v1', independentKeyEscrowVerified: false,
    };
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    dumpProcess = spawn(SSH, [...SSH_OPTIONS, `root@${BACKUP_HOST}`, DUMP_COMMAND],
      { stdio: ['ignore', 'pipe', 'pipe'] });
    let diagnostic = '', transferred = 0, lastReport = Date.now();
    dumpProcess.stderr.setEncoding('utf8');
    dumpProcess.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-65536); });
    const terminal = new Promise(resolve => {
      dumpProcess.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
      dumpProcess.once('close', (code, signal) => resolve({ code, signal }));
    });
    async function* dumpChunks() {
      for await (const chunk of dumpProcess.stdout) {
        transferred += chunk.length;
        if (Date.now() - lastReport >= 20_000) {
          console.log(JSON.stringify({ phase: 'encrypted_export', bytes: transferred }));
          lastReport = Date.now();
        }
        yield chunk;
      }
      const result = await terminal;
      if (result.code !== 0 || result.signal) {
        if (/lock timeout/iu.test(diagnostic)) throw new Error('pg_dump_lock_timeout');
        if (/connection .*lost|server closed|connection reset/iu.test(diagnostic)) {
          throw new Error('database_transport_interrupted');
        }
        throw new Error('pg_dump_failed');
      }
    }
    console.log(JSON.stringify({ phase: 'snapshot_acquired', databaseBytes: metadata.database_bytes }));
    const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: dumpChunks(), key,
      contextSha256, maxPlaintextBytes: 8 * 1024 ** 3, timeoutMs: 14_400_000 });
    const manifestPath = path.join(directory, `${id}.manifest.json`);
    await writeFile(manifestPath, JSON.stringify({ manifest, contextSha256, result }, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    return { phase: 'database_artifact_verified', manifestPath, ...result,
      source: 'contabo_current', completeSystemBackup: false };
  } finally {
    if (dumpProcess && dumpProcess.exitCode === null && !dumpProcess.killed) dumpProcess.kill('SIGTERM');
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
    console.log(JSON.stringify(await exportContaboDatabaseBackup({ directory, keyDirectory })));
  } catch (error) {
    const safe = new Set(['two_absolute_paths_required', 'backup_key_invalid', 'contabo_database_metadata_failed',
      'contabo_database_metadata_invalid', 'pg_dump_lock_timeout', 'database_transport_interrupted', 'pg_dump_failed',
      'backup_size_limit_exceeded', 'backup_authentication_failed', 'local_backup_budget_exceeded']);
    console.error(JSON.stringify({ phase: 'failed', reason: safe.has(error.message) ? error.message : 'backup_export_failed',
      completeSystemBackup: false }));
    process.exitCode = 1;
  }
}
