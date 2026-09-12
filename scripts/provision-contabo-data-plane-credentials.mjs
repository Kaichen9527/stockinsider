#!/usr/bin/env node
// Creates the Contabo runtime secrets in memory, first writes an authenticated
// local recovery envelope, then sends the one-time payload only over SSH stdin.
// No secret is printed, placed in argv, or persisted as plaintext.
import { createHash, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalBackupKey } from './local-backup-file-key.mjs';
import { inspectLocalBackupDirectory } from './local-backup-preflight.mjs';
import { writeEncryptedBackupArtifact } from './local-backup-artifact.mjs';

const [directory, keyDirectory, host, principalId, releaseId] = process.argv.slice(2);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const release = /^[0-9a-f]{40}$/u;
const target = '/usr/local/libexec/stockinsider-provision-contabo-credentials.mjs';
const source = new URL('../deployment/vps/provision-contabo-data-plane-credentials.mjs', import.meta.url);
let key, plaintext;

function b64url(value) { return Buffer.from(value).toString('base64url'); }
function command(executable, args, options = {}) {
  const result = spawnSync(executable, args, { encoding: options.input ? undefined : 'utf8',
    input: options.input, stdio: options.input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
    maxBuffer: 1024 * 1024, timeout: 60000 });
  if (options.input) {
    result.stdout?.fill(0);
    result.stderr?.fill(0);
  }
  if (result.status !== 0) throw new Error(options.error || 'credential_provision_command_failed');
  return result;
}

try {
  if (process.argv.length !== 7 || ![directory, keyDirectory].every(path.isAbsolute)
    || host !== '5.104.83.211' || !uuid.test(principalId) || !release.test(releaseId)
    || keyDirectory === directory || keyDirectory.startsWith(`${directory}${path.sep}`)) {
    throw new Error('credential_provision_arguments_invalid');
  }
  await inspectLocalBackupDirectory(directory);
  key = await loadLocalBackupKey(keyDirectory);
  const jwtSecret = randomBytes(48).toString('base64');
  const providerSecretsKey = randomBytes(32).toString('base64');
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const claims = b64url(JSON.stringify({ role: 'service_role', iss: 'stockinsider-contabo' }));
  const signature = createHmac('sha256', jwtSecret).update(`${header}.${claims}`).digest('base64url');
  const serviceRoleJwt = `${header}.${claims}.${signature}`;
  const serviceRoleJwtSha256 = createHash('sha256').update(serviceRoleJwt).digest('hex');
  const backendId = randomUUID();
  const payload = { backendId, databaseUri: 'postgresql:///stockinsider?host=/run/postgresql', jwtSecret,
    principalId, providerSecretsKey, releaseId, schema: 'stockinsider-contabo-credential-payload-v1',
    serviceRoleJwt, serviceRoleJwtSha256 };
  const recoveryManifest = { schema: 'stockinsider-contabo-runtime-credential-recovery-v1', backendId,
    principalId, releaseId, createdAt: new Date().toISOString(), keyReference: 'private-local-file:aes256-v1',
    credentialNames: ['database-uri','jwt-secret','postgrest-service-role.jwt','provider-secrets-v1.key'],
    plaintextPersisted: false, remoteProvisioned: false };
  const contextSha256 = createHash('sha256').update(JSON.stringify(recoveryManifest)).digest('hex');
  plaintext = Buffer.from(JSON.stringify({ recoveryManifest, payload }));
  const id = `contabo-runtime-credentials-${randomUUID()}`;
  const result = await writeEncryptedBackupArtifact({ directory, filename: `${id}.sib`, input: [plaintext],
    key, contextSha256, maxPlaintextBytes: 64 * 1024, timeoutMs: 60000 });
  await writeFile(path.join(directory, `${id}.manifest.json`), JSON.stringify({ recoveryManifest,
    contextSha256, result, remoteProvisioned: false }, null, 2), { flag: 'wx', mode: 0o600 });
  const localSource = fileURLToPath(source);
  command('ssh', [`root@${host}`, 'install', '-d', '-o', 'root', '-g', 'root', '-m', '0755', '/usr/local/libexec']);
  command('scp', [localSource, `root@${host}:${target}.new`]);
  command('ssh', [`root@${host}`, 'install', '-o', 'root', '-g', 'root', '-m', '0700', `${target}.new`, target]);
  command('ssh', [`root@${host}`, 'rm', '-f', `${target}.new`]);
  const remoteInput = Buffer.from(`${JSON.stringify(payload)}\n`);
  command('ssh', [`root@${host}`, 'node', target], { input: remoteInput,
    error: 'remote_credential_provision_failed' });
  remoteInput.fill(0);
  await writeFile(path.join(directory, `${id}.provision-receipt.json`), JSON.stringify({
    schema: 'stockinsider-contabo-credential-provision-receipt-v1', contextSha256, backendId,
    principalId, releaseId, remoteProvisioned: true, provisionedAt: new Date().toISOString(),
  }, null, 2), { flag: 'wx', mode: 0o600 });
  console.log(JSON.stringify({ schema: 'stockinsider-contabo-credential-provision-v1',
    recoveryEnvelopeVerified: true, remoteProvisioned: true, backendId, principalId, releaseId,
    secretsPrinted: false }));
} catch (error) {
  console.error(JSON.stringify({ error: error?.message || 'credential_provision_failed',
    remoteProvisioned: false, secretsPrinted: false }));
  process.exitCode = 1;
} finally {
  plaintext?.fill(0);
  key?.fill(0);
}
