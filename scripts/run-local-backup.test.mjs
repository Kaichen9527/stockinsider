import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { CONFIRMED_BACKUP_DIRECTORY, validateBackupRunConfig } from './run-local-backup.mjs';

const config = { schema: 'stockinsider-local-backup-run-v1', directory: CONFIRMED_BACKUP_DIRECTORY,
  environmentFile: '/private/config/env', caFile: '/private/config/ca.pem', keyDirectory: '/private/key',
  pgDump: '/opt/homebrew/bin/pg_dump', pgRestore: '/opt/homebrew/bin/pg_restore',
  pgModule: '/private/node_modules/pg', incomingBytes: 5_000_000_000, temporaryBytes: 5_000_000_000 };

test('orchestrator is pinned to the confirmed project-root backup and explicit peak budgets', () => {
  assert.equal(validateBackupRunConfig(config), config);
  for (const bad of ['/backup', '/tmp/backup', '/Users/kaerchen/backup']) {
    assert.throws(() => validateBackupRunConfig({ ...config, directory: bad }));
  }
  assert.throws(() => validateBackupRunConfig({ ...config, incomingBytes: 0 }));
  assert.throws(() => validateBackupRunConfig({ ...config, temporaryBytes: undefined }));
});

test('orchestrator requires the portable Contabo restore and its application validation receipt', () => {
  const source = readFileSync(new URL('./run-local-backup.mjs', import.meta.url), 'utf8');
  assert.match(source, /rehearse-contabo-database-restore[.]mjs/u);
  assert.match(source, /applicationValidationPassed === true/u);
  assert.doesNotMatch(source, /rehearse-local-database-restore[.]mjs/u);
});

test('database export uses one pg_dump-owned consistent snapshot over Contabo direct IPv6', () => {
  const source = readFileSync(new URL('./export-local-database-backup.mjs', import.meta.url), 'utf8');
  assert.match(source, /pg_dump_internal_consistent_snapshot/u);
  assert.doesNotMatch(source, /pg_export_snapshot/u);
  assert.doesNotMatch(source, /--snapshot=/u);
  assert.match(source, /--lock-wait-timeout=5min/u);
  assert.match(source, /contabo_ipv6_direct_tls/u);
  assert.match(source, /postgres@sha256:[0-9a-f]{64}/u);
  assert.match(source, /PGPASSFILE=\/run\/pgpass/u);
  assert.doesNotMatch(source, /PGPASSWORD:/u);
  assert.match(source, /remoteEphemeralCredentialsRemoved: true/u);
});
