/** Build a portable provider recovery member from the Contabo data plane.
 * Encrypted database envelopes and the systemd credential are read over SSH;
 * provider plaintext exists only in process memory and is immediately wrapped
 * in the operator's local AES-GCM backup envelope.
 */
import { createDecipheriv, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, rmdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';

const HOST = '5.104.83.211';
const SSH = '/usr/bin/ssh';
const SSH_OPTIONS = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', 'ConnectTimeout=15',
  '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3'];
const ENVELOPES_COMMAND = `sudo -u postgres psql -X --no-psqlrc --set ON_ERROR_STOP=1 --dbname=stockinsider --tuples-only --no-align --command "SELECT json_build_object('credentials',COALESCE(json_agg(row_to_json(c) ORDER BY provider),'[]'::json),'registry',COALESCE((SELECT json_agg(row_to_json(r)) FROM public.source_credentials_registry r),'[]'::json),'roles','[]'::json,'memberships','[]'::json)::text FROM public.provider_credentials_encrypted_v1 c WHERE status='valid'"`;
const KEY_COMMAND = 'systemd-creds decrypt --name=provider-secrets-v1.key /etc/credstore.encrypted/stockinsider-provider-secrets-v1-key -';
const EXPECTED = new Map([['finmind', 'stockinsider_finmind_api_token'], ['threads', 'threads_access_token']]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;

async function remoteBuffer(command, maximum) {
  const child = spawn(SSH, [...SSH_OPTIONS, `root@${HOST}`, command], { stdio: ['ignore', 'pipe', 'pipe'] });
  const chunks = [];
  let bytes = 0, diagnostic = '';
  child.stdout.on('data', chunk => { bytes += chunk.length; chunks.push(chunk); if (bytes > maximum) child.kill('SIGTERM'); });
  child.stderr.setEncoding('utf8'); child.stderr.on('data', chunk => { diagnostic = (diagnostic + chunk).slice(-8192); });
  const result = await new Promise(resolve => {
    child.once('error', () => resolve({ code: null, signal: 'spawn_error' }));
    child.once('close', (code, signal) => resolve({ code, signal }));
  });
  if (result.code !== 0 || result.signal || bytes < 1 || bytes > maximum) {
    for (const chunk of chunks) chunk.fill(0);
    throw new Error('contabo_provider_transport_failed');
  }
  const output = Buffer.concat(chunks);
  for (const chunk of chunks) chunk.fill(0);
  return output;
}

function exactBase64(value, bytes, maximum = bytes) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/u.test(value)) throw new Error('contabo_provider_envelope_invalid');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || decoded.length < bytes || decoded.length > maximum) {
    decoded.fill(0); throw new Error('contabo_provider_envelope_invalid');
  }
  return decoded;
}

function decrypt(row, key) {
  if (!EXPECTED.has(row?.provider) || !UUID.test(row?.credential_id || '')
    || !Number.isSafeInteger(Number(row?.generation)) || Number(row.generation) < 1
    || !/^[A-Za-z0-9_-]{1,64}$/u.test(row?.key_version || '') || !SHA256.test(row?.token_sha256 || '')) {
    throw new Error('contabo_provider_envelope_invalid');
  }
  const identity = ['stockinsider-provider-secret-v1', row.provider, row.credential_id,
    Number(row.generation), row.key_version, row.token_sha256];
  let iv, tag, ciphertext, plaintext;
  try {
    iv = exactBase64(row.iv, 12); tag = exactBase64(row.tag, 16); ciphertext = exactBase64(row.ciphertext, 16, 16_384);
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(Buffer.from(JSON.stringify(identity))); decipher.setAuthTag(tag);
    plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const expected = Buffer.from(row.token_sha256, 'hex');
    const actual = createHash('sha256').update(plaintext).digest();
    if (plaintext.length < 16 || plaintext.length > 16_384
      || !plaintext.every(byte => byte >= 0x21 && byte <= 0x7e)
      || !timingSafeEqual(expected, actual)) throw new Error('contabo_provider_envelope_invalid');
    return plaintext;
  } finally {
    iv?.fill(0); tag?.fill(0); ciphertext?.fill(0);
  }
}

export async function exportContaboProviderRecovery({ directory, keyDirectory }) {
  await inspectLocalBackupDirectory(directory);
  const lock = path.join(directory, '.contabo-provider-export-lock');
  await mkdir(lock, { mode: 0o700 });
  let localKey, rootKeyBytes, rootKey, envelopeBytes, payloadBytes;
  const plaintexts = [];
  let payload;
  try {
    if (keyDirectory === directory || keyDirectory.startsWith(directory + path.sep)) throw new Error('backup_key_invalid');
    envelopeBytes = await remoteBuffer(ENVELOPES_COMMAND, 1024 * 1024);
    const envelopeSet = JSON.parse(envelopeBytes.toString('utf8').trim());
    if (!Array.isArray(envelopeSet?.credentials) || envelopeSet.credentials.length !== EXPECTED.size
      || !Array.isArray(envelopeSet.registry) || !Array.isArray(envelopeSet.roles)
      || !Array.isArray(envelopeSet.memberships)) throw new Error('contabo_provider_envelope_invalid');
    rootKeyBytes = await remoteBuffer(KEY_COMMAND, 4096);
    const encodedKey = rootKeyBytes.toString('utf8').trim();
    if (!/^[A-Za-z0-9+/]{43}=$/u.test(encodedKey)) throw new Error('contabo_provider_root_key_invalid');
    rootKey = Buffer.from(encodedKey, 'base64');
    if (rootKey.length !== 32 || rootKey.toString('base64') !== encodedKey) throw new Error('contabo_provider_root_key_invalid');
    const credentials = envelopeSet.credentials.map(row => {
      const plaintext = decrypt(row, rootKey); plaintexts.push(plaintext);
      return { id: row.credential_id, name: EXPECTED.get(row.provider),
        decrypted_secret: plaintext.toString('utf8'), created_at: row.updated_at, updated_at: row.updated_at };
    });
    if (new Set(credentials.map(item => item.name)).size !== EXPECTED.size) throw new Error('contabo_provider_envelope_invalid');
    const manifest = { schema: 'stockinsider-provider-recovery-v1', project: 'stockinsider-contabo',
      source: 'contabo_encrypted_provider_store', createdAt: new Date().toISOString(), credentialCount: credentials.length,
      keyReference: 'private-local-file:aes256-v1', productionRecoveryVerified: false,
      independentKeyEscrowVerified: true };
    const contextSha256 = createHash('sha256').update(JSON.stringify(manifest)).digest('hex');
    payload = { manifest, credentials, registry: envelopeSet.registry, roles: [], memberships: [] };
    payloadBytes = Buffer.from(JSON.stringify(payload));
    for (const item of credentials) item.decrypted_secret = null;
    localKey = await loadLocalBackupKey(keyDirectory);
    const id = `provider-recovery-${randomUUID()}`;
    const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: [payloadBytes],
      key: localKey, contextSha256, maxPlaintextBytes: 1024 * 1024, timeoutMs: 60_000 });
    const manifestPath = path.join(directory, `${id}.manifest.json`);
    await writeFile(manifestPath, `${JSON.stringify({ manifest, contextSha256, result }, null, 2)}\n`,
      { flag: 'wx', mode: 0o600 });
    return { phase: 'provider_recovery_encrypted', manifestPath, credentialCount: credentials.length,
      encryptedEnvelopeVerified: true, productionRecoveryVerified: false };
  } finally {
    if (payload?.credentials) for (const item of payload.credentials) item.decrypted_secret = null;
    for (const plaintext of plaintexts) plaintext.fill(0);
    payloadBytes?.fill(0); envelopeBytes?.fill(0); rootKeyBytes?.fill(0); rootKey?.fill(0); localKey?.fill(0);
    await rmdir(lock).catch(() => {});
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [directory, keyDirectory, ...extra] = process.argv.slice(2);
    if (extra.length || ![directory, keyDirectory].every(value => path.isAbsolute(value || ''))) {
      throw new Error('two_absolute_paths_required');
    }
    console.log(JSON.stringify(await exportContaboProviderRecovery({ directory, keyDirectory })));
  } catch (error) {
    const safe = new Set(['two_absolute_paths_required', 'backup_key_invalid', 'contabo_provider_transport_failed',
      'contabo_provider_envelope_invalid', 'contabo_provider_root_key_invalid', 'local_backup_budget_exceeded']);
    console.error(JSON.stringify({ error: 'provider_recovery_export_failed',
      reason: safe.has(error.message) ? error.message : 'contabo_provider_export_failed',
      productionRecoveryVerified: false }));
    process.exitCode = 1;
  }
}
