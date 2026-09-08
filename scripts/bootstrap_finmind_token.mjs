#!/usr/bin/env node

const MAX_TOKEN_BYTES = 4096;
const chunks = [];
let size = 0;

for await (const chunk of process.stdin) {
  size += chunk.length;
  if (size > MAX_TOKEN_BYTES) {
    process.stderr.write('FinMind token input exceeds the allowed size.\n');
    process.exit(2);
  }
  chunks.push(chunk);
}

const token = Buffer.concat(chunks).toString('utf8').trim();
const internalKey = String(process.env.INTERNAL_API_KEY || '').trim();
const endpoint = String(
  process.env.STOCKINSIDER_FINMIND_BOOTSTRAP_URL
    || 'http://127.0.0.1:3100/api/internal/finmind-token-bootstrap',
).trim();

if (!token || !internalKey) {
  process.stderr.write('Token on stdin and INTERNAL_API_KEY are required.\n');
  process.exit(2);
}

let response;
try {
  response = await fetch(endpoint, {
    method: 'POST',
    redirect: 'error',
    headers: {
      authorization: `Bearer ${internalKey}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ token }),
    signal: AbortSignal.timeout(20_000),
  });
} catch (error) {
  process.stderr.write(`FinMind bootstrap request failed: ${error instanceof Error ? error.message : 'unknown_error'}\n`);
  process.exit(1);
}

let result = null;
try {
  result = await response.json();
} catch {
  // Do not echo arbitrary response bodies from a credential bootstrap endpoint.
}

if (!response.ok || result?.ok !== true || result?.verified !== true) {
  process.stderr.write(`FinMind bootstrap rejected (${response.status}): ${String(result?.error || 'invalid_response')}\n`);
  process.exit(1);
}

process.stdout.write(`FinMind Vault bootstrap verified; canary rows: ${Number(result.canaryRows || 0)}.\n`);
