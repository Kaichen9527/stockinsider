#!/usr/bin/env node
// Decrypts the bounded provider archive in memory and sends only the two
// reviewed credentials over SSH stdin to the exact reviewed VPS helper.
import { constants, createReadStream } from 'node:fs';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { decryptSmallBackupPayload } from './local-backup-envelope.mjs';

const [manifestPath, keyDirectory, host, releaseId] = process.argv.slice(2);
const PROJECTS = new Set(['mgqpxfbdhmiygdytgswi', 'stockinsider-contabo']);
const expectedNames = ['stockinsider_finmind_api_token', 'threads_access_token'];
const release = /^[0-9a-f]{40}$/u;
const sha = /^[0-9a-f]{64}$/u;
let key;
let plaintext;
let payload;
let transfer;

const digest = (value) => createHash('sha256').update(value).digest('hex');

try {
  if (process.argv.length !== 6 || !path.isAbsolute(manifestPath || '') || !path.isAbsolute(keyDirectory || '')
    || host !== '5.104.83.211' || !release.test(releaseId || '')) throw new Error('provider_restore_arguments_invalid');
  const manifestInfo = await lstat(manifestPath);
  if (!manifestInfo.isFile() || manifestInfo.isSymbolicLink() || (manifestInfo.mode & 0o077) !== 0) {
    throw new Error('provider_restore_manifest_not_private');
  }
  const outer = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (outer?.manifest?.schema !== 'stockinsider-provider-recovery-v1' || !PROJECTS.has(outer.manifest.project)
    || outer.manifest.credentialCount !== 2 || outer.manifest.productionRecoveryVerified !== false
    || !sha.test(outer.contextSha256 || '') || digest(JSON.stringify(outer.manifest)) !== outer.contextSha256
    || outer.result?.envelopeVerified !== true || !sha.test(outer.result?.plaintextSha256 || '')
    || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/u.test(outer.result?.filename || '')) {
    throw new Error('provider_restore_manifest_invalid');
  }
  const artifactPath = path.join(path.dirname(manifestPath), outer.result.filename);
  const artifactInfo = await lstat(artifactPath);
  if (!artifactInfo.isFile() || artifactInfo.isSymbolicLink() || (artifactInfo.mode & 0o077) !== 0
    || artifactInfo.size < 1 || artifactInfo.size > 1024 * 1024 + 128) throw new Error('provider_restore_artifact_invalid');
  key = await loadLocalBackupKey(keyDirectory);
  plaintext = await decryptSmallBackupPayload(createReadStream(artifactPath,
    { flags: constants.O_RDONLY | constants.O_NOFOLLOW }), {
    key, contextSha256: outer.contextSha256, maxPlaintextBytes: 1024 * 1024,
  });
  if (plaintext.length !== outer.result.plaintextBytes || digest(plaintext) !== outer.result.plaintextSha256) {
    throw new Error('provider_restore_plaintext_mismatch');
  }
  payload = JSON.parse(plaintext.toString('utf8'));
  if (JSON.stringify(payload?.credentials?.map((item) => item?.name).sort()) !== JSON.stringify(expectedNames)
    || payload.credentials.some((item) => typeof item?.decrypted_secret !== 'string'
      || item.decrypted_secret.length < 16 || item.decrypted_secret.length > 16_384)) {
    throw new Error('provider_restore_credentials_invalid');
  }
  const byName = new Map(payload.credentials.map((item) => [item.name, item.decrypted_secret]));
  transfer = Buffer.from(JSON.stringify({ schema: 'stockinsider-contabo-provider-recovery-import-v1', credentials: [
    { provider: 'finmind', token: byName.get('stockinsider_finmind_api_token') },
    { provider: 'threads', token: byName.get('threads_access_token') },
  ] }));
  const remote = `/opt/stockinsider-control/${releaseId}/deployment/vps/import-provider-recovery-client.mjs`;
  const result = spawnSync('ssh', [`root@${host}`, 'node', remote], { input: transfer,
    stdio: ['pipe', 'pipe', 'pipe'], timeout: 120_000, maxBuffer: 1024 * 1024 });
  const receipt = result.status === 0 ? JSON.parse(result.stdout.toString('utf8')) : null;
  result.stdout?.fill(0); result.stderr?.fill(0);
  if (result.status !== 0 || receipt?.schema !== 'stockinsider-contabo-provider-recovery-receipt-v1'
    || JSON.stringify(receipt.imported) !== JSON.stringify(['finmind', 'threads']) || receipt.secretsPrinted !== false) {
    throw new Error('provider_restore_remote_import_failed');
  }
  const receiptPath = path.join(path.dirname(manifestPath), `provider-recovery-production-${releaseId}.json`);
  await writeFile(receiptPath, `${JSON.stringify({ ...receipt, releaseId, host,
    sourceContextSha256: outer.contextSha256, importedAt: new Date().toISOString() }, null, 2)}\n`,
  { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ schema: receipt.schema, imported: receipt.imported,
    productionRecoveryVerified: true, secretsPrinted: false }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'provider_restore_failed',
    productionRecoveryVerified: false, secretsPrinted: false }));
  process.exitCode = 1;
} finally {
  transfer?.fill(0); plaintext?.fill(0); key?.fill(0);
  if (Array.isArray(payload?.credentials)) for (const item of payload.credentials) item.decrypted_secret = null;
  payload = null;
}
