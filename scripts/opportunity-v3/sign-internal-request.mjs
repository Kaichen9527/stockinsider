#!/usr/bin/env node
import { createHash, createHmac, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';

const PATH_PATTERN = /^\/(?:api\/internal\/[a-z0-9-]+)(?:\/[a-z0-9-]+)*$/u;

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON rejects non-finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`canonical JSON rejects ${typeof value}`);
}

function usage() {
  return `Usage:
  npm run v3:sign-request -- --path PATH --key-id ID --principal-id ID --body-file FILE [options]

Required environment:
  OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY  HMAC key from the secret manager

Options:
  --method METHOD       HTTP method (default: POST)
  --timestamp UTC       RFC-3339 whole seconds (default: now)
  --nonce HEX           16..64 lowercase hex (default: random 32-byte nonce)
  --help                Show this help

The exact body bytes from FILE are hashed. Output is JSON containing only derived
headers and request metadata; it never prints the HMAC key or bearer token.`;
}

function parseArgs(argv) {
  const allowed = new Set(['--path', '--key-id', '--principal-id', '--body-file', '--method', '--timestamp', '--nonce']);
  const values = {};
  for (let index = 0; index < argv.length; index += 2) {
    const name = argv[index];
    if (!allowed.has(name) || index + 1 >= argv.length) {
      throw new TypeError(`unknown or incomplete argument: ${name ?? '(missing)'}`);
    }
    if (Object.hasOwn(values, name)) throw new TypeError(`duplicate argument: ${name}`);
    values[name] = argv[index + 1];
  }
  return values;
}

if (process.argv.includes('--help')) {
  process.stdout.write(`${usage()}\n`);
  process.exit(0);
}

try {
  const args = parseArgs(process.argv.slice(2));
  const canonicalPath = args['--path'] ?? '';
  const keyId = args['--key-id'] ?? '';
  const principalId = args['--principal-id'] ?? '';
  const bodyFile = args['--body-file'] ?? '';
  const method = (args['--method'] ?? 'POST').toUpperCase();
  const timestamp = args['--timestamp'] ?? new Date().toISOString().replace(/\.\d{3}Z$/u, 'Z');
  const nonce = args['--nonce'] ?? randomBytes(32).toString('hex');
  const hmacKey = process.env.OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY ?? '';

  if (!PATH_PATTERN.test(canonicalPath)) throw new TypeError('invalid canonical path');
  if (!keyId || !bodyFile) throw new TypeError('path, key-id, principal-id and body-file are required');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(principalId)) {
    throw new TypeError('principal-id must be a canonical UUID');
  }
  if (!/^[A-Z]+$/u.test(method)) throw new TypeError('invalid method');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u.test(timestamp)) throw new TypeError('invalid timestamp');
  if (!/^[0-9a-f]{16,64}$/u.test(nonce)) throw new TypeError('invalid nonce');
  if (!hmacKey) throw new TypeError('OPPORTUNITY_V3_PRINCIPAL_HMAC_KEY is required');

  const rawBody = readFileSync(bodyFile);
  const bodySha256 = createHash('sha256').update(rawBody).digest('hex');
  const preimage = canonicalJson([
    'internal-principal-v3.8',
    keyId,
    principalId,
    method,
    canonicalPath,
    timestamp,
    nonce,
    bodySha256,
  ]);
  const signature = createHmac('sha256', hmacKey).update(preimage, 'utf8').digest('hex');
  process.stdout.write(`${JSON.stringify({
    method,
    canonicalPath,
    bodyFile,
    bodySha256,
    headers: {
      'content-type': 'application/json',
      'x-stockinsider-key-id': keyId,
      'x-stockinsider-timestamp': timestamp,
      'x-stockinsider-nonce': nonce,
      'x-stockinsider-signature': signature,
    },
  }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`v3:sign-request: ${error instanceof Error ? error.message : 'unknown error'}\n`);
  process.stderr.write(`${usage()}\n`);
  process.exit(1);
}
