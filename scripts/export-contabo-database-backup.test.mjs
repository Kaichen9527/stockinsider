import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('current Contabo export keeps credentials server-local and plaintext off disk', () => {
  const source = readFileSync(new URL('./export-contabo-database-backup.mjs', import.meta.url), 'utf8');
  assert.match(source, /stockinsider-database-export-v3/u);
  assert.match(source, /contabo_ssh_local_unix_socket/u);
  assert.match(source, /writeEncryptedBackupArtifact/u);
  assert.match(source, /sudo -u postgres pg_dump/u);
  assert.match(source, /credentialsInCommandOrArtifact: false/u);
  assert.match(source, /remoteEphemeralCredentialsUsed: false/u);
  assert.doesNotMatch(source, /SUPABASE_|PGPASSWORD|postgres:\/\//u);
  assert.doesNotMatch(source, /createWriteStream|writeFile\([^,]+\.dump/u);
});

test('current Contabo export uses fixed production identity and bounded SSH behavior', () => {
  const source = readFileSync(new URL('./export-contabo-database-backup.mjs', import.meta.url), 'utf8');
  assert.match(source, /const BACKUP_HOST = '5\.104\.83\.211'/u);
  assert.match(source, /const DATABASE = 'stockinsider'/u);
  assert.match(source, /StrictHostKeyChecking=yes/u);
  assert.match(source, /ServerAliveCountMax=3/u);
  assert.match(source, /maxPlaintextBytes: 8 \* 1024 \*\* 3/u);
  assert.match(source, /timeoutMs: 14_400_000/u);
});
