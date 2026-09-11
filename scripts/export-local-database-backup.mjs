/** Read-only, fixed-project export. No migration/deployment or automatic pruning.
 * Caller supplies reviewed executables and public CA, never passwords in args.
 */
import { readFile, mkdir, rmdir, writeFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { createRequire } from 'node:module';
import { spawn, execFileSync } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import path from 'node:path';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';

const PROJECT = 'mgqpxfbdhmiygdytgswi';
const [directory, envFile, caFile, keyHelper, pgDump, pgModule] = process.argv.slice(2);
if (process.argv.length !== 8 || [directory, envFile, caFile, keyHelper, pgDump, pgModule]
  .some(value => !value || !path.isAbsolute(value))) throw new Error('six_absolute_paths_required');

const require = createRequire(import.meta.url);
const { Client } = require(pgModule);
let client, key, lockOwned = false;
const lock = path.join(directory, '.database-export-lock');
let dumpProcess;
try {
  await inspectLocalBackupDirectory(directory);
  await mkdir(lock, { mode: 0o700 });
  lockOwned = true;
  const e = parseEnv(await readFile(envFile, 'utf8'));
  if (e.SUPABASE_PROJECT_REF !== PROJECT || e.SUPABASE_DB_HOST !== 'aws-1-ap-southeast-1.pooler.supabase.com'
    || e.SUPABASE_DB_USER !== `postgres.${PROJECT}` || e.SUPABASE_DB_DATABASE !== 'postgres'
    || !e.SUPABASE_DB_PASSWORD) throw new Error('database_target_invalid');
  const ca = await readFile(caFile, 'utf8');
  client = new Client({ host: e.SUPABASE_DB_HOST, port: 5432, user: e.SUPABASE_DB_USER,
    database: 'postgres', password: e.SUPABASE_DB_PASSWORD, ssl: { rejectUnauthorized: true, ca },
    connectionTimeoutMillis: 15000, statement_timeout: 15000, application_name: 'stockinsider-local-backup' });
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  const { rows: [metadata] } = await client.query(`SELECT pg_export_snapshot() AS snapshot,
    current_setting('transaction_read_only') AS read_only, current_setting('server_version_num') AS version_num,
    current_setting('server_version') AS version, pg_database_size(current_database())::text AS database_bytes`);
  if (metadata.read_only !== 'on' || !/^[0-9A-F]+-[0-9A-F]+-[0-9]+$/i.test(metadata.snapshot)) {
    throw new Error('read_only_snapshot_required');
  }
  const versionOutput = execFileSync(pgDump, ['--version'], { encoding: 'utf8' });
  const major = Number(versionOutput.match(/PostgreSQL\) (\d+)/)?.[1]);
  if (!major || major < Math.floor(Number(metadata.version_num) / 10000)) throw new Error('pg_dump_version_too_old');
  const fileKeyMode = process.env.STOCKINSIDER_BACKUP_KEY_MODE === 'private-file';
  if (fileKeyMode && (keyHelper === directory || keyHelper.startsWith(directory + path.sep))) {
    throw new Error('backup_key_invalid');
  }
  key = fileKeyMode ? await loadLocalBackupKey(keyHelper) :
    execFileSync(keyHelper, ['--read'], { maxBuffer: 64, stdio: ['ignore', 'pipe', 'pipe'] });
  if (key.length !== 32) throw new Error('backup_key_invalid');
  const id = `database-${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID()}`;
  const manifest = { schema: 'stockinsider-database-export-v1', id, project: PROJECT,
    createdAt: new Date().toISOString(), snapshot: metadata.snapshot, databaseBytes: metadata.database_bytes,
    serverVersion: metadata.version, format: 'pg_dump_custom', ownersAndGrantsIncluded: true,
    storageFileBytesIncluded: false, vaultRecoveryVerified: false, restoreVerified: false,
    keyReference: fileKeyMode ? 'private-local-file:aes256-v1' : 'keychain:stockinsider-local-backup:aes256-v1',
    independentKeyEscrowVerified: false };
  const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  dumpProcess = spawn(pgDump, ['--format=custom', '--compress=6', '--no-password', '--lock-wait-timeout=15s',
    `--snapshot=${metadata.snapshot}`], { env: {
      PATH: '/opt/homebrew/bin:/usr/bin:/bin', PGHOST: e.SUPABASE_DB_HOST, PGPORT: '5432',
      PGUSER: e.SUPABASE_DB_USER, PGDATABASE: 'postgres', PGPASSWORD: e.SUPABASE_DB_PASSWORD,
      PGSSLMODE: 'verify-full', PGSSLROOTCERT: caFile, PGCONNECT_TIMEOUT: '15',
    }, stdio: ['ignore', 'pipe', 'pipe'] });
  // Drain stderr but never log SQL, row content or credentials from a failed dump.
  dumpProcess.stderr.resume();
  const closed = new Promise(resolve => {
    dumpProcess.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    dumpProcess.once('close', (code, signal) => resolve({ code, signal }));
  });
  let transferred = 0, lastReport = Date.now();
  async function* dumpChunks() {
    for await (const chunk of dumpProcess.stdout) {
      transferred += chunk.length;
      if (Date.now() - lastReport >= 20_000) {
        console.log(JSON.stringify({ phase: 'encrypted_export', bytes: transferred }));
        lastReport = Date.now();
      }
      yield chunk;
    }
    const terminal = await closed;
    if (terminal.code !== 0 || terminal.signal) throw new Error('pg_dump_failed');
  }
  console.log(JSON.stringify({ phase: 'snapshot_acquired', databaseBytes: metadata.database_bytes }));
  const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`,
    input: dumpChunks(), key, contextSha256, maxPlaintextBytes: 8 * 1024 ** 3, timeoutMs: 3_600_000 });
  await client.query('ROLLBACK');
  await writeFile(path.join(directory, `${id}.manifest.json`), JSON.stringify({ manifest, contextSha256, result }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: 'database_artifact_verified', ...result,
    storageFilesBackedUp: false, completeSystemBackup: false }));
} catch (error) {
  const safeReasons = ['database_target_invalid', 'read_only_snapshot_required', 'pg_dump_version_too_old',
    'backup_key_invalid', 'pg_dump_failed', 'backup_size_limit_exceeded', 'backup_authentication_failed'];
  console.error(JSON.stringify({ phase: 'failed', reason: safeReasons.includes(error.message) ? error.message
    : error.code === '28P01' ? 'database_authentication_failed' : 'backup_export_failed', completeSystemBackup: false }));
  process.exitCode = 1;
} finally {
  if (dumpProcess && dumpProcess.exitCode === null && !dumpProcess.killed) dumpProcess.kill('SIGTERM');
  if (client) await client.end().catch(() => {});
  if (key) key.fill(0);
  if (lockOwned) await rmdir(lock);
}
