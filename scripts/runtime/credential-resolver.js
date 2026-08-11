'use strict';

const { spawnSync } = require('node:child_process');
const { invariant } = require('./codec');

const KEYCHAIN_REFERENCES = Object.freeze({
  'keychain:stockinsider-runtime:database-url': Object.freeze({ service: 'stockinsider-runtime', account: 'database-url' }),
  'keychain:stockinsider-runtime:internal-api-key': Object.freeze({ service: 'stockinsider-runtime', account: 'internal-api-key' }),
  'keychain:stockinsider-runtime:activation-authority-hmac': Object.freeze({ service: 'stockinsider-runtime', account: 'activation-authority-hmac' }),
  'keychain:stockinsider-runtime:threads-access-token': Object.freeze({ service: 'stockinsider-runtime', account: 'threads-access-token' }),
  'keychain:stockinsider-runtime:youtube-api-key': Object.freeze({ service: 'stockinsider-runtime', account: 'youtube-api-key' }),
  'keychain:stockinsider-runtime:youtube-oauth-token': Object.freeze({ service: 'stockinsider-runtime', account: 'youtube-oauth-token' }),
});
const RUNTIME_ENVIRONMENT_KEYS = Object.freeze([
  'HOME', 'INTERNAL_API_KEY_REF', 'NODE_ENV', 'PATH', 'STOCKINSIDER_DATABASE_URL_REF',
  'STOCKINSIDER_REVIEWED_COMMIT_SHA', 'TZ',
]);
const DARWIN_TEXT_ENCODING_KEY = '__CF_USER_TEXT_ENCODING';

function isOwnedDarwinTextEncoding(value) {
  const match = /^0x([0-9a-f]+):0x([0-9a-f]+):0x([0-9a-f]+)$/iu.exec(value ?? '');
  return Boolean(match) && Number.parseInt(match[1], 16) === process.getuid();
}

function assertExactRuntimeEnvironment(environment = process.env, platform = process.platform) {
  const environmentIsObject = environment && typeof environment === 'object';
  const keys = environmentIsObject ? Object.keys(environment) : [];
  const hasOwnedDarwinTextEncoding = environmentIsObject && platform === 'darwin' &&
    isOwnedDarwinTextEncoding(environment[DARWIN_TEXT_ENCODING_KEY]);
  const reviewedKeys = hasOwnedDarwinTextEncoding
    ? keys.filter((key) => key !== DARWIN_TEXT_ENCODING_KEY)
    : keys;
  invariant(environmentIsObject &&
    JSON.stringify(reviewedKeys.sort()) === JSON.stringify([...RUNTIME_ENVIRONMENT_KEYS].sort()),
  'runtime environment not isolated');
  invariant(typeof environment.HOME === 'string' && environment.HOME.startsWith('/') &&
    environment.PATH === '/usr/bin:/bin' && environment.NODE_ENV === 'production' && environment.TZ === 'Asia/Taipei' &&
    /^[0-9a-f]{40}$/u.test(environment.STOCKINSIDER_REVIEWED_COMMIT_SHA ?? ''), 'runtime environment invalid');
}

function resolveCredentialReference(reference, spawn = spawnSync) {
  const selected = KEYCHAIN_REFERENCES[reference];
  invariant(selected, 'runtime credential reference not allowed');
  const result = spawn('/usr/bin/security', [
    'find-generic-password', '-s', selected.service, '-a', selected.account, '-w',
  ], { encoding: 'utf8', env: { PATH: '/usr/bin:/bin', TZ: 'Asia/Taipei' }, maxBuffer: 65536 });
  invariant(result && result.status === 0 && result.signal === null && typeof result.stdout === 'string',
    'runtime credential unavailable');
  const value = result.stdout.replace(/[\r\n]+$/u, '');
  invariant(value.length >= 16 && value.length <= 8192 && !/[\r\n\0]/u.test(value), 'runtime credential invalid');
  return value;
}

function hydrateRuntimeCredentials(environment = process.env, resolver = resolveCredentialReference, { requireReferences = false } = {}) {
  if (requireReferences) {
    invariant(environment.STOCKINSIDER_DATABASE_URL_REF === 'keychain:stockinsider-runtime:database-url' &&
      environment.INTERNAL_API_KEY_REF === 'keychain:stockinsider-runtime:internal-api-key' &&
      !environment.STOCKINSIDER_DATABASE_URL && !environment.INTERNAL_API_KEY,
    'runtime credential references required');
  }
  const result = { ...environment };
  if (!result.STOCKINSIDER_DATABASE_URL && result.STOCKINSIDER_DATABASE_URL_REF) {
    result.STOCKINSIDER_DATABASE_URL = resolver(result.STOCKINSIDER_DATABASE_URL_REF);
  }
  if (!result.INTERNAL_API_KEY && result.INTERNAL_API_KEY_REF) {
    result.INTERNAL_API_KEY = resolver(result.INTERNAL_API_KEY_REF);
  }
  invariant(typeof result.STOCKINSIDER_DATABASE_URL === 'string' && result.STOCKINSIDER_DATABASE_URL.length >= 16,
    'runtime database credential unavailable');
  invariant(typeof result.INTERNAL_API_KEY === 'string' && result.INTERNAL_API_KEY.length >= 16,
    'runtime internal credential unavailable');
  return Object.freeze(result);
}

module.exports = { KEYCHAIN_REFERENCES, RUNTIME_ENVIRONMENT_KEYS, assertExactRuntimeEnvironment,
  hydrateRuntimeCredentials, resolveCredentialReference };
