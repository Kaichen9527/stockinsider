#!/usr/bin/env node
// Receives a one-time credential payload on stdin. Secrets never enter argv,
// an environment file, a temporary plaintext file, or the journal. All four
// systemd credentials are verified before their atomic publication.
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmod, chown, mkdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const credentialDirectory = '/etc/credstore.encrypted';
const environmentDirectory = '/etc/stockinsider';
const environmentPath = `${environmentDirectory}/data-plane.env`;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const release = /^[0-9a-f]{40}$/u;
const digest = /^[0-9a-f]{64}$/u;
const expectedKeys = ['backendId','databaseUri','jwtSecret','principalId','providerSecretsKey',
  'releaseId','schema','serviceRoleJwt','serviceRoleJwtSha256'];
const targets = {
  databaseUri: { filename: 'stockinsider-postgrest-database-uri', credentialName: 'database-uri' },
  jwtSecret: { filename: 'stockinsider-postgrest-jwt-secret', credentialName: 'jwt-secret' },
  serviceRoleJwt: { filename: 'stockinsider-postgrest-service-role-jwt', credentialName: 'postgrest-service-role.jwt' },
  providerSecretsKey: { filename: 'stockinsider-provider-secrets-v1-key', credentialName: 'provider-secrets-v1.key' },
};

function fail(code) { throw new Error(code); }
function base64url(value) { return Buffer.from(value, 'base64url'); }
function exactKeys(value) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expectedKeys);
}
function verifyJwt(token, secret) {
  const pieces = token.split('.');
  if (pieces.length !== 3) fail('service_role_jwt_invalid');
  let header, payload;
  try {
    header = JSON.parse(base64url(pieces[0]).toString('utf8'));
    payload = JSON.parse(base64url(pieces[1]).toString('utf8'));
  } catch { fail('service_role_jwt_invalid'); }
  if (JSON.stringify(Object.keys(header).sort()) !== JSON.stringify(['alg', 'typ'])
    || header.alg !== 'HS256' || header.typ !== 'JWT' || payload?.role !== 'service_role') {
    fail('service_role_jwt_claims_invalid');
  }
  const expected = createHmac('sha256', secret).update(`${pieces[0]}.${pieces[1]}`).digest();
  const supplied = base64url(pieces[2]);
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    fail('service_role_jwt_signature_invalid');
  }
}

async function stdinJson() {
  const chunks = [];
  let bytes = 0;
  for await (const chunk of process.stdin) {
    bytes += chunk.length;
    if (bytes > 32768) fail('credential_payload_too_large');
    chunks.push(chunk);
  }
  if (bytes === 0) fail('credential_payload_missing');
  const buffer = Buffer.concat(chunks);
  try { return JSON.parse(buffer.toString('utf8')); }
  finally {
    buffer.fill(0);
    for (const chunk of chunks) chunk.fill?.(0);
  }
}

let payload;
const temporary = [];
let environmentTemporary = null;
try {
  if (process.getuid?.() !== 0) fail('root_required');
  payload = await stdinJson();
  if (!exactKeys(payload) || payload.schema !== 'stockinsider-contabo-credential-payload-v1'
    || payload.databaseUri !== 'postgresql:///stockinsider?host=/run/postgresql'
    || typeof payload.jwtSecret !== 'string' || payload.jwtSecret.length < 43 || payload.jwtSecret.length > 256
    || typeof payload.serviceRoleJwt !== 'string' || payload.serviceRoleJwt.length < 64 || payload.serviceRoleJwt.length > 4096
    || typeof payload.providerSecretsKey !== 'string' || !/^[A-Za-z0-9+/]{43}=$/u.test(payload.providerSecretsKey)
    || !uuid.test(payload.backendId) || !uuid.test(payload.principalId) || !release.test(payload.releaseId)
    || !digest.test(payload.serviceRoleJwtSha256)
    || createHash('sha256').update(payload.serviceRoleJwt).digest('hex') !== payload.serviceRoleJwtSha256
    || Buffer.from(payload.providerSecretsKey, 'base64').length !== 32) fail('credential_payload_invalid');
  verifyJwt(payload.serviceRoleJwt, payload.jwtSecret);
  await mkdir(credentialDirectory, { recursive: true, mode: 0o700 });
  await mkdir(environmentDirectory, { recursive: true, mode: 0o750 });
  for (const { filename } of Object.values(targets)) {
    try {
      await stat(`${credentialDirectory}/${filename}`);
      fail('credential_target_already_exists');
    } catch (error) {
      if (error.message === 'credential_target_already_exists' || error.code !== 'ENOENT') throw error;
    }
  }
  try {
    await stat(environmentPath);
    fail('data_plane_environment_already_exists');
  } catch (error) {
    if (error.message === 'data_plane_environment_already_exists' || error.code !== 'ENOENT') throw error;
  }
  for (const [field, { filename, credentialName }] of Object.entries(targets)) {
    const destination = `${credentialDirectory}/.${filename}.${randomUUID()}`;
    temporary.push(destination);
    const input = Buffer.from(`${payload[field]}\n`);
    const encrypted = spawnSync('systemd-creds', ['encrypt', `--name=${credentialName}`, '-', destination], {
      input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
    });
    input.fill(0);
    encrypted.stdout?.fill(0);
    encrypted.stderr?.fill(0);
    if (encrypted.status !== 0) fail('systemd_credential_encryption_failed');
    const decrypted = spawnSync('systemd-creds', ['decrypt', `--name=${credentialName}`, destination, '-'], {
      stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1024 * 1024,
    });
    decrypted.stderr?.fill(0);
    const expected = Buffer.from(`${payload[field]}\n`);
    if (decrypted.status !== 0 || decrypted.stdout.length !== expected.length
      || !timingSafeEqual(decrypted.stdout, expected)) fail('systemd_credential_verification_failed');
    decrypted.stdout.fill(0);
    expected.fill(0);
    await chmod(destination, 0o600);
    await chown(destination, 0, 0);
  }
  const group = spawnSync('getent', ['group', 'stockinsider'], { encoding: 'utf8' });
  const gid = Number(group.stdout?.split(':')[2]);
  if (group.status !== 0 || !Number.isSafeInteger(gid)) fail('stockinsider_group_missing');
  const environment = [
    'STOCKINSIDER_DATA_PLANE=contabo',
    'STOCKINSIDER_POSTGREST_URL=http://127.0.0.1:3302/',
    `STOCKINSIDER_BACKEND_ID=${payload.backendId}`,
    `OPPORTUNITY_V3_RUNNER_PRINCIPAL_ID=${payload.principalId}`,
    `STOCKINSIDER_WRITER_RELEASE_ID=${payload.releaseId}`,
    'STOCKINSIDER_POSTGREST_JWT_CREDENTIAL=postgrest-service-role.jwt',
    `STOCKINSIDER_POSTGREST_JWT_SHA256=${payload.serviceRoleJwtSha256}`,
    'STOCKINSIDER_PRIVATE_ARTIFACT_ROOT=/var/lib/stockinsider/artifacts',
    '',
  ].join('\n');
  environmentTemporary = `${environmentDirectory}/.data-plane.env.${randomUUID()}`;
  await writeFile(environmentTemporary, environment, { flag: 'wx', mode: 0o640 });
  await chown(environmentTemporary, 0, gid);
  for (const [index, { filename }] of Object.values(targets).entries()) {
    await rename(temporary[index], `${credentialDirectory}/${filename}`);
  }
  temporary.length = 0;
  await rename(environmentTemporary, environmentPath);
  environmentTemporary = null;
  console.log(JSON.stringify({ schema: 'stockinsider-contabo-credential-provision-v1', installed: true,
    credentialCount: 4, dataPlaneEnvironmentInstalled: true, secretsPrinted: false }));
} catch (error) {
  console.error(JSON.stringify({ error: error?.message || 'credential_provision_failed', installed: false,
    secretsPrinted: false }));
  process.exitCode = 1;
} finally {
  for (const value of ['databaseUri', 'jwtSecret', 'serviceRoleJwt', 'providerSecretsKey']) {
    if (typeof payload?.[value] === 'string') payload[value] = '';
  }
  await Promise.all(temporary.map((item) => rm(item, { force: true }).catch(() => {})));
  if (environmentTemporary) await rm(environmentTemporary, { force: true }).catch(() => {});
}
