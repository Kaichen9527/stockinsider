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
const BACKUP_HOST = '5.104.83.211';
const DIRECT_DB_HOST = `db.${PROJECT}.supabase.co`;
const PG_IMAGE = 'postgres@sha256:18cfe3ef5e6815560c98237d6216d1e5119702fb0f3894c8785dd58b8bbe5d73';
const SSH = '/usr/bin/ssh';
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3'];
const [directory, envFile, caFile, keyHelper, pgDump, pgModule] = process.argv.slice(2);
if (process.argv.length !== 8 || [directory, envFile, caFile, keyHelper, pgDump, pgModule]
  .some(value => !value || !path.isAbsolute(value))) throw new Error('six_absolute_paths_required');

const require = createRequire(import.meta.url);
const { Client } = require(pgModule);
let client, key, lockOwned = false, remoteCredentialDirectory;
const lock = path.join(directory, '.database-export-lock');
let dumpProcess;

async function sshCommand(command, input) {
  const child = spawn(SSH, [...SSH_OPTIONS, `root@${BACKUP_HOST}`, command],
    { stdio: ['pipe', 'ignore', 'pipe'] });
  child.stdin.on('error', () => {});
  child.stderr.resume();
  child.stdin.end(input);
  const result = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal) throw new Error('remote_backup_credential_io_failed');
}

async function stageRemoteCredentials(password, ca) {
  const remote = `/run/stockinsider-supabase-backup-${randomUUID()}`;
  const escapePgpass = value => String(value).replace(/([:\\])/gu, '\\$1');
  const pgpass = Buffer.from(`${escapePgpass(DIRECT_DB_HOST)}:5432:postgres:postgres:${escapePgpass(password)}\n`);
  const caBytes = Buffer.from(ca);
  const command = `umask 077; mkdir '${remote}' && head -c ${pgpass.length} > '${remote}/pgpass'`
    + ` && head -c ${caBytes.length} > '${remote}/ca.crt' && chmod 600 '${remote}/pgpass' '${remote}/ca.crt'`;
  try {
    await sshCommand(command, Buffer.concat([pgpass, caBytes]));
    return remote;
  } catch (error) {
    await removeRemoteCredentials(remote).catch(() => {});
    throw error;
  } finally { pgpass.fill(0); }
}

async function removeRemoteCredentials(remote) {
  if (!/^\/run\/stockinsider-supabase-backup-[0-9a-f-]{36}$/u.test(remote || '')) {
    throw new Error('remote_backup_credential_path_invalid');
  }
  await sshCommand(`test ! -e '${remote}/pgpass' || unlink '${remote}/pgpass'; `
    + `test ! -e '${remote}/ca.crt' || unlink '${remote}/ca.crt'; rmdir '${remote}'`, Buffer.alloc(0));
}
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
  const { rows: [metadata] } = await client.query(`SELECT
    current_setting('server_version_num') AS version_num,
    current_setting('server_version') AS version, pg_database_size(current_database())::text AS database_bytes`);
  if (!/^\d+$/u.test(metadata.version_num || '') || !/^\d+$/u.test(metadata.database_bytes || '')) {
    throw new Error('database_metadata_invalid');
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
  // pg_dump owns the only read transaction and therefore its internally
  // consistent snapshot. The dump runs from the Contabo host over its direct
  // IPv6 route, avoiding Supavisor's cross-connection snapshot/state boundary.
  await client.end(); client = null;
  remoteCredentialDirectory = await stageRemoteCredentials(e.SUPABASE_DB_PASSWORD, ca);
  const manifest = { schema: 'stockinsider-database-export-v2', id, project: PROJECT,
    createdAt: new Date().toISOString(), snapshot: null,
    snapshotStrategy: 'pg_dump_internal_consistent_snapshot', databaseBytes: metadata.database_bytes,
    serverVersion: metadata.version, format: 'pg_dump_custom', ownersAndGrantsIncluded: true,
    transport: 'contabo_ipv6_direct_tls', sourceEndpoint: `${DIRECT_DB_HOST}:5432`,
    remoteClientImage: PG_IMAGE, credentialsInCommandOrArtifact: false,
    storageFileBytesIncluded: false, vaultRecoveryVerified: false, restoreVerified: false,
    keyReference: fileKeyMode ? 'private-local-file:aes256-v1' : 'keychain:stockinsider-local-backup:aes256-v1',
    independentKeyEscrowVerified: false };
  const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
  const remoteDump = `docker run --rm --network host -v '${remoteCredentialDirectory}/pgpass:/run/pgpass:ro'`
    + ` -v '${remoteCredentialDirectory}/ca.crt:/run/ca.crt:ro' -e PGPASSFILE=/run/pgpass`
    + ` -e PGHOST=${DIRECT_DB_HOST} -e PGPORT=5432 -e PGUSER=postgres -e PGDATABASE=postgres`
    + ` -e PGSSLMODE=verify-full -e PGSSLROOTCERT=/run/ca.crt -e PGCONNECT_TIMEOUT=15`
    + ` -e PGAPPNAME=stockinsider-vps-direct-backup ${PG_IMAGE}`
    + ' pg_dump --format=custom --compress=6 --no-password --lock-wait-timeout=5min';
  dumpProcess = spawn(SSH, [...SSH_OPTIONS, `root@${BACKUP_HOST}`, remoteDump],
    { stdio: ['ignore', 'pipe', 'pipe'] });
  // Keep only a bounded in-memory diagnostic tail. It is classified below; raw
  // pg_dump output is never printed because it can contain object names.
  let dumpDiagnostic = '';
  dumpProcess.stderr.setEncoding('utf8');
  dumpProcess.stderr.on('data', chunk => { dumpDiagnostic = (dumpDiagnostic + chunk).slice(-65536); });
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
    if (terminal.code !== 0 || terminal.signal) {
      const diagnostic = dumpDiagnostic.toLowerCase();
      if (diagnostic.includes('lock timeout')) throw new Error('pg_dump_lock_timeout');
      if (diagnostic.includes('server closed the connection unexpectedly')
        || diagnostic.includes('ssl syscall error') || diagnostic.includes('connection reset')
        || diagnostic.includes('connection to server was lost')) {
        throw new Error('database_transport_interrupted');
      }
      if (diagnostic.includes('invalid snapshot identifier')) throw new Error('database_snapshot_expired');
      throw new Error('pg_dump_failed');
    }
  }
  console.log(JSON.stringify({ phase: 'snapshot_acquired', databaseBytes: metadata.database_bytes }));
  const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`,
    input: dumpChunks(), key, contextSha256, maxPlaintextBytes: 8 * 1024 ** 3, timeoutMs: 14_400_000 });
  await removeRemoteCredentials(remoteCredentialDirectory); remoteCredentialDirectory = null;
  await writeFile(path.join(directory, `${id}.manifest.json`), JSON.stringify({ manifest, contextSha256, result,
    remoteEphemeralCredentialsRemoved: true }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ phase: 'database_artifact_verified', ...result,
    storageFilesBackedUp: false, completeSystemBackup: false }));
} catch (error) {
  const safeReasons = ['database_target_invalid', 'database_metadata_invalid', 'pg_dump_version_too_old',
    'backup_key_invalid', 'pg_dump_failed', 'pg_dump_lock_timeout', 'database_transport_interrupted',
    'database_snapshot_expired', 'remote_backup_credential_io_failed', 'remote_backup_credential_path_invalid',
    'backup_size_limit_exceeded', 'backup_authentication_failed'];
  console.error(JSON.stringify({ phase: 'failed', reason: safeReasons.includes(error.message) ? error.message
    : error.code === '28P01' ? 'database_authentication_failed' : 'backup_export_failed', completeSystemBackup: false }));
  process.exitCode = 1;
} finally {
  if (dumpProcess && dumpProcess.exitCode === null && !dumpProcess.killed) dumpProcess.kill('SIGTERM');
  if (remoteCredentialDirectory) await removeRemoteCredentials(remoteCredentialDirectory).catch(() => {});
  if (client) await client.end().catch(() => {});
  if (key) key.fill(0);
  if (lockOwned) await rmdir(lock);
}
