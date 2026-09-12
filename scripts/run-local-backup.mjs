/** Complete local backup orchestrator. It serializes export phases, but only a
 * successful clean restore may publish a complete backup-set receipt.
 */
import { mkdir, readdir, readFile, rmdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectLocalBackupDirectory, assessLocalBackupCapacity,
  CONFIRMED_BACKUP_DIRECTORY } from './local-backup-preflight.mjs';
import { assembleLocalBackupSet } from './local-backup-set.mjs';

export { CONFIRMED_BACKUP_DIRECTORY };

export function validateBackupRunConfig(config) {
  const paths = ['directory', 'environmentFile', 'caFile', 'keyDirectory', 'pgDump', 'pgRestore',
    'pgModule', 'restoreScratchDirectory'];
  if (!config || config.schema !== 'stockinsider-local-backup-run-v2'
    || paths.some(key => !path.isAbsolute(config[key] || ''))
    || config.directory !== CONFIRMED_BACKUP_DIRECTORY) throw new Error('backup_run_config_invalid');
  for (const key of ['incomingBytes', 'temporaryBytes']) {
    if (!Number.isSafeInteger(config[key]) || config[key] < 0) throw new Error('backup_run_budget_invalid');
  }
  if (config.incomingBytes === 0) throw new Error('backup_run_budget_invalid');
  return config;
}

async function runNode(script, args, environment = {}) {
  const child = spawn(process.execPath, [script, ...args], { env: {
    PATH: '/opt/homebrew/bin:/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', ...environment,
  }, stdio: ['ignore', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  child.stdout.setEncoding('utf8'); child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout = (stdout + chunk).slice(-262144); });
  child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-65536); });
  const code = await new Promise(resolve => { child.once('error', () => resolve(-1)); child.once('close', resolve); });
  if (code !== 0) {
    const diagnostic = stderr.trim().split('\n').reverse().map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).find(Boolean);
    const reason = typeof diagnostic?.reason === 'string' && /^[a-z][a-z0-9_]{0,80}$/u.test(diagnostic.reason)
      ? diagnostic.reason : 'unknown';
    throw new Error(`backup_phase_failed:${path.basename(script)}:${reason}`);
  }
  return stdout.trim().split('\n').filter(Boolean).map(line => {
    try { return JSON.parse(line); } catch { return null; }
  }).filter(Boolean);
}

const difference = (after, before, expression) => [...after].filter(name => !before.has(name) && expression.test(name));

export async function runLocalBackup(config, scriptsDirectory = path.dirname(fileURLToPath(import.meta.url))) {
  validateBackupRunConfig(config);
  const inventory = await inspectLocalBackupDirectory(config.directory);
  const admission = assessLocalBackupCapacity({ ...inventory, incomingBytes: config.incomingBytes,
    temporaryBytes: config.temporaryBytes });
  if (!admission.allowed) throw new Error(admission.blockers.join(','));
  const lock = path.join(config.directory, '.system-backup-lock');
  await mkdir(lock, { mode: 0o700 });
  try {
    const before = new Set(await readdir(config.directory));
    await runNode(path.join(scriptsDirectory, 'export-local-database-backup.mjs'), [config.directory,
      config.environmentFile, config.caFile, config.keyDirectory, config.pgDump, config.pgModule],
    { STOCKINSIDER_BACKUP_KEY_MODE: 'private-file' });
    const afterDatabase = new Set(await readdir(config.directory));
    const [databaseManifest] = difference(afterDatabase, before, /^database-.+\.manifest\.json$/);
    if (!databaseManifest) throw new Error('database_manifest_missing');
    await runNode(path.join(scriptsDirectory, 'verify-local-database-archive.mjs'),
      [path.join(config.directory, databaseManifest), config.keyDirectory, config.pgRestore]);
    await runNode(path.join(scriptsDirectory, 'export-local-storage-backup.mjs'), [config.directory,
      config.environmentFile, config.caFile, config.keyDirectory, config.pgModule]);
    const afterStorage = new Set(await readdir(config.directory));
    const storageManifests = difference(afterStorage, afterDatabase, /^storage-.+\.manifest\.json$/);
    const [storageInventory] = difference(afterStorage, afterDatabase, /^storage-inventory-.+\.json$/);
    if (!storageInventory) throw new Error('storage_inventory_missing');
    const storageRestoreLines = await runNode(path.join(scriptsDirectory, 'rehearse-local-storage-restore.mjs'),
      [path.join(config.directory, storageInventory), config.keyDirectory, config.directory,
        config.restoreScratchDirectory]);
    const storageRestore = storageRestoreLines.find(item =>
      item.schema === 'stockinsider-storage-restore-rehearsal-v1'
      && item.objectsRestored === storageManifests.length && typeof item.filename === 'string');
    if (!storageRestore) throw new Error('storage_restore_receipt_missing');
    const storageRestoreReceipt = storageRestore.filename;
    await runNode(path.join(scriptsDirectory, 'export-local-provider-recovery.mjs'), [config.directory,
      config.environmentFile, config.caFile, config.keyDirectory, config.pgModule]);
    const afterProvider = new Set(await readdir(config.directory));
    const [providerManifest] = difference(afterProvider, afterStorage, /^provider-recovery-.+\.manifest\.json$/);
    if (!providerManifest) throw new Error('provider_manifest_missing');
    const providerVerificationLines = await runNode(path.join(scriptsDirectory, 'verify-local-provider-recovery.mjs'),
      [path.join(config.directory, providerManifest), config.keyDirectory, config.directory]);
    const providerVerification = providerVerificationLines.find(item =>
      item.schema === 'stockinsider-provider-recovery-verification-v1'
      && item.credentialsDecryptedAndValidated === true && typeof item.filename === 'string');
    if (!providerVerification) throw new Error('provider_verification_receipt_missing');
    const providerVerificationReceipt = providerVerification.filename;
    const restoreLines = await runNode(path.join(scriptsDirectory, 'rehearse-contabo-database-restore.mjs'),
      ['--manifest', path.join(config.directory, databaseManifest), '--key-directory', config.keyDirectory,
        '--receipt-directory', config.directory]);
    const restore = restoreLines.find(item => item.restoreVerified === true
      && item.applicationValidationPassed === true && path.isAbsolute(item.receiptPath || ''));
    if (!restore || path.dirname(restore.receiptPath) !== config.directory) throw new Error('restore_receipt_missing');
    const restoreReceipt = path.basename(restore.receiptPath);
    return await assembleLocalBackupSet({ directory: config.directory, spec: { retentionClass: 'daily',
      databaseManifest, storageInventory, storageManifests, storageRestoreReceipt,
      providerManifest, providerVerificationReceipt, restoreReceipt } });
  } finally {
    await rmdir(lock).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [configPath, ...extra] = process.argv.slice(2);
    if (extra.length || !path.isAbsolute(configPath || '')) throw new Error('absolute_config_path_required');
    const result = await runLocalBackup(JSON.parse(await readFile(configPath, 'utf8')));
    console.log(JSON.stringify(result)); process.exitCode = result.completeSystemBackup ? 0 : 2;
  } catch (error) {
    console.error(JSON.stringify({ error: 'local_backup_run_failed', reason: error.message,
      completeSystemBackup: false })); process.exitCode = 1;
  }
}
