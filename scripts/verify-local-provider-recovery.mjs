// Authenticate, decrypt and structurally validate the bounded provider recovery
// archive. Plaintext credentials stay in memory and are never included in output.
import { constants, createReadStream } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { lstat, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { decryptSmallBackupPayload } from './local-backup-envelope.mjs';

const PROJECT = 'mgqpxfbdhmiygdytgswi';
const EXPECTED_NAMES = ['stockinsider_finmind_api_token', 'threads_access_token'];
const MAX_BYTES = 1024 * 1024;
const SHA256 = /^[a-f0-9]{64}$/u;
const SAFE_FILE = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,180}$/u;

const hash = value => createHash('sha256').update(value).digest('hex');
const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function assertPrivateFile(filename) {
  const info = await lstat(filename);
  if (!info.isFile() || info.isSymbolicLink() || info.uid !== process.getuid()
    || (info.mode & 0o777) !== 0o600 || info.nlink !== 1) throw new Error('provider_recovery_file_not_private');
  return info;
}

function validatePayload(payload, outerManifest) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || !sameJson(Object.keys(payload).sort(), ['credentials', 'manifest', 'memberships', 'registry', 'roles'])
    || !sameJson(payload.manifest, outerManifest)
    || !Array.isArray(payload.credentials) || !Array.isArray(payload.registry)
    || !Array.isArray(payload.roles) || !Array.isArray(payload.memberships)) {
    throw new Error('provider_recovery_payload_invalid');
  }
  const credentialNames = payload.credentials.map(item => item?.name).sort();
  if (payload.credentials.length !== EXPECTED_NAMES.length
    || new Set(payload.credentials.map(item => item?.id)).size !== EXPECTED_NAMES.length
    || !sameJson(credentialNames, EXPECTED_NAMES)
    || payload.credentials.some(item => typeof item?.id !== 'string' || item.id.length < 8
      || typeof item?.decrypted_secret !== 'string' || item.decrypted_secret.length < 16
      || item.decrypted_secret.length > 16384
      || typeof item?.created_at !== 'string' || Number.isNaN(Date.parse(item.created_at)))) {
    throw new Error('provider_recovery_credentials_invalid');
  }
  return { credentialNames, credentialCount: payload.credentials.length,
    registryRows: payload.registry.length, roleRows: payload.roles.length,
    membershipRows: payload.memberships.length };
}

export async function verifyLocalProviderRecovery({ manifestPath, keyDirectory, receiptDirectory }) {
  if (![manifestPath, keyDirectory, receiptDirectory].every(value => path.isAbsolute(value || ''))) {
    throw new Error('absolute_paths_required');
  }
  if ((await lstat(manifestPath)).isSymbolicLink() || (await lstat(receiptDirectory)).isSymbolicLink()) {
    throw new Error('provider_recovery_path_symlink_rejected');
  }
  const manifestReal = await realpath(manifestPath);
  const receiptReal = await realpath(receiptDirectory);
  await assertPrivateFile(manifestReal);
  const receiptFileInfo = await lstat(receiptReal);
  if (!receiptFileInfo.isDirectory() || receiptFileInfo.isSymbolicLink()
    || receiptFileInfo.uid !== process.getuid() || (receiptFileInfo.mode & 0o077) !== 0) {
    throw new Error('receipt_directory_not_private');
  }
  const outer = JSON.parse(await readFile(manifestReal, 'utf8'));
  if (outer?.manifest?.schema !== 'stockinsider-provider-recovery-v1'
    || outer.manifest.project !== PROJECT || outer.manifest.credentialCount !== EXPECTED_NAMES.length
    || outer.manifest.keyReference !== 'private-local-file:aes256-v1'
    || outer.manifest.productionRecoveryVerified !== false
    || !SHA256.test(outer.contextSha256 || '')
    || hash(JSON.stringify(outer.manifest)) !== outer.contextSha256
    || outer.result?.envelopeVerified !== true
    || !SHA256.test(outer.result?.plaintextSha256 || '')
    || !SAFE_FILE.test(outer.result?.filename || '')) {
    throw new Error('provider_recovery_manifest_invalid');
  }
  const artifactPath = path.join(path.dirname(manifestReal), outer.result.filename);
  const artifactInfo = await assertPrivateFile(artifactPath);
  if (artifactInfo.size <= 0 || artifactInfo.size > MAX_BYTES + 128) throw new Error('provider_recovery_artifact_size_invalid');
  let key;
  let plaintext;
  let payload;
  try {
    key = await loadLocalBackupKey(keyDirectory);
    plaintext = await decryptSmallBackupPayload(createReadStream(artifactPath,
      { flags: constants.O_RDONLY | constants.O_NOFOLLOW }), {
      key, contextSha256: outer.contextSha256, maxPlaintextBytes: MAX_BYTES,
    });
    if (plaintext.length !== outer.result.plaintextBytes || hash(plaintext) !== outer.result.plaintextSha256) {
      throw new Error('provider_recovery_plaintext_mismatch');
    }
    payload = JSON.parse(plaintext.toString('utf8'));
    const counts = validatePayload(payload, outer.manifest);
    const artifactSha256 = hash(await readFile(artifactPath));
    const receipt = {
      schema: 'stockinsider-provider-recovery-verification-v1',
      createdAt: new Date().toISOString(),
      source: { manifestFilename: path.basename(manifestReal), artifactFilename: outer.result.filename,
        contextSha256: outer.contextSha256, artifactSha256, plaintextSha256: outer.result.plaintextSha256 },
      ...counts,
      credentialsDecryptedAndValidated: true,
      secretsPrinted: false,
      targetDatabaseRestoreVerified: false,
      productionRecoveryVerified: false,
    };
    const filename = `provider-recovery-verification-${randomUUID()}.json`;
    await writeFile(path.join(receiptReal, filename), JSON.stringify(receipt, null, 2) + '\n',
      { flag: 'wx', mode: 0o600 });
    return { filename, ...receipt };
  } finally {
    if (payload?.credentials) for (const item of payload.credentials) item.decrypted_secret = null;
    plaintext?.fill(0);
    key?.fill(0);
    payload = null;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [manifestPath, keyDirectory, receiptDirectory, ...extra] = process.argv.slice(2);
  try {
    if (extra.length) throw new Error('unexpected_arguments');
    const result = await verifyLocalProviderRecovery({ manifestPath, keyDirectory, receiptDirectory });
    console.log(JSON.stringify({ schema: result.schema, filename: result.filename,
      credentialCount: result.credentialCount, credentialsDecryptedAndValidated: true,
      secretsPrinted: false, productionRecoveryVerified: false }));
  } catch (error) {
    console.error(JSON.stringify({ error: 'provider_recovery_verification_failed', reason: error.message,
      credentialsDecryptedAndValidated: false, secretsPrinted: false, productionRecoveryVerified: false }));
    process.exitCode = 1;
  }
}
