import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = name => readFileSync(new URL(name, import.meta.url), 'utf8');

test('private artifact backup uses the fixed private root and authenticates every streamed object', () => {
  const source = read('./export-contabo-private-artifacts.mjs');
  assert.match(source, /\/var\/lib\/stockinsider\/artifacts/u);
  assert.match(source, /StrictHostKeyChecking=yes/u);
  assert.match(source, /stockinsider-storage-export-v2/u);
  assert.match(source, /hash[.]digest\('hex'\) !== item[.]hash/u);
  assert.match(source, /initialText !== finalText/u);
  assert.match(source, /find \$\{ROOT\} -mindepth 3/u);
  assert.doesNotMatch(source, /SUPABASE_/u);
});

test('provider recovery rewraps Contabo envelopes without disk or argv plaintext', () => {
  const source = read('./export-contabo-provider-recovery.mjs');
  assert.match(source, /provider_credentials_encrypted_v1/u);
  assert.match(source, /systemd-creds decrypt --name=provider-secrets-v1[.]key/u);
  assert.match(source, /createDecipheriv\('aes-256-gcm'/u);
  assert.match(source, /stockinsider-provider-recovery-v1/u);
  assert.match(source, /independentKeyEscrowVerified: true/u);
  assert.match(source, /payloadBytes[?][.]fill\(0\)/u);
  assert.doesNotMatch(source, /SUPABASE_|createWriteStream/u);
});

test('complete daily backup no longer reads the retired Supabase data plane', () => {
  const source = read('./run-local-backup.mjs');
  for (const name of ['export-contabo-database-backup.mjs', 'export-contabo-private-artifacts.mjs',
    'export-contabo-provider-recovery.mjs']) assert.match(source, new RegExp(name.replace('.', '[.]'), 'u'));
  assert.doesNotMatch(source, /export-local-(?:database|storage|provider)/u);
});
