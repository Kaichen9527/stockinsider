#!/usr/bin/env node
// Receives the bounded provider recovery payload on SSH stdin and forwards it
// only to the authenticated loopback API. Tokens never enter argv, env or the
// journal, and the helper cannot operate before the Contabo writer is active.
import { readFile } from 'node:fs/promises';

const MAX_BYTES = 40 * 1024;
const expectedProviders = ['finmind', 'threads'];

function internalKey(environment) {
  const marker = Buffer.from('INTERNAL_API_KEY=', 'ascii');
  const start = environment.indexOf(marker);
  if (start < 0 || (start > 0 && environment[start - 1] !== 0x0a)
    || environment.indexOf(marker, start + marker.length) >= 0) {
    throw new Error('provider_recovery_internal_key_invalid');
  }
  const valueStart = start + marker.length;
  const lineEnd = environment.indexOf(0x0a, valueStart);
  const value = environment.subarray(valueStart, lineEnd < 0 ? environment.length : lineEnd)
    .toString('utf8').replace(/\r$/u, '');
  if (value.length < 16 || /[\s\u0000-\u001f\u007f]/u.test(value)) throw new Error('provider_recovery_internal_key_invalid');
  return value;
}

async function inputPayload() {
  const chunks = [];
  let size = 0;
  for await (const chunk of process.stdin) {
    size += chunk.length;
    if (size > MAX_BYTES) throw new Error('provider_recovery_payload_too_large');
    chunks.push(chunk);
  }
  const bytes = Buffer.concat(chunks);
  try { return JSON.parse(bytes.toString('utf8')); }
  finally { bytes.fill(0); for (const chunk of chunks) chunk.fill?.(0); }
}

let payload;
try {
  if (process.getuid?.() !== 0) throw new Error('provider_recovery_root_required');
  payload = await inputPayload();
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)
    || Object.keys(payload).sort().join(',') !== 'credentials,schema'
    || payload.schema !== 'stockinsider-contabo-provider-recovery-import-v1'
    || !Array.isArray(payload.credentials) || payload.credentials.length !== 2
    || JSON.stringify(payload.credentials.map((item) => item?.provider).sort()) !== JSON.stringify(expectedProviders)
    || payload.credentials.some((item) => !item || Object.keys(item).sort().join(',') !== 'provider,token'
      || typeof item.token !== 'string' || item.token.length < 16 || item.token.length > 16_384)) {
    throw new Error('provider_recovery_payload_invalid');
  }
  const environment = await readFile('/etc/stockinsider/stockinsider.env');
  let key;
  try { key = internalKey(environment); }
  finally { environment.fill(0); }
  const imported = [];
  for (const item of payload.credentials) {
    const response = await fetch('http://127.0.0.1:3100/api/internal/provider-recovery-import', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30_000),
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(item),
    });
    const result = await response.json();
    if (!response.ok || result?.ok !== true || result.provider !== item.provider) {
      throw new Error(`provider_recovery_${item.provider}_failed`);
    }
    imported.push(item.provider);
    item.token = '';
  }
  console.log(JSON.stringify({ schema: 'stockinsider-contabo-provider-recovery-receipt-v1',
    imported: imported.sort(), secretsPrinted: false }));
} catch (error) {
  console.error(JSON.stringify({ error: error instanceof Error ? error.message : 'provider_recovery_failed',
    secretsPrinted: false }));
  process.exitCode = 1;
} finally {
  if (Array.isArray(payload?.credentials)) for (const item of payload.credentials) item.token = '';
  payload = null;
}
