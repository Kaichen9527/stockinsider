#!/usr/bin/env node

import http from 'node:http';
import https from 'node:https';

const CANONICAL_APP_URL = 'https://stockinsider-three.vercel.app';

function fail(message, details = null) {
  if (details !== null) process.stderr.write(`${JSON.stringify(details)}\n`);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

const [endpoint, payloadText = '{}'] = process.argv.slice(2);
if (!endpoint || !endpoint.startsWith('/api/internal/')) fail('internal endpoint is required');

const appUrl = String(process.env.APP_URL || '').replace(/\/$/u, '');
const expectedAppUrl = String(process.env.EXPECTED_APP_URL || CANONICAL_APP_URL).replace(/\/$/u, '');
if (appUrl !== expectedAppUrl) fail('APP_URL does not match the canonical production origin', { appUrl, expectedAppUrl });

const internalApiKey = process.env.INTERNAL_API_KEY || '';
if (!internalApiKey) fail('INTERNAL_API_KEY is not configured');

let payload;
try {
  payload = JSON.parse(payloadText);
} catch {
  fail('payload must be valid JSON');
}

const timeoutMs = Number(process.env.INTERNAL_API_TIMEOUT_MS || 25 * 60 * 1000);
if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) fail('INTERNAL_API_TIMEOUT_MS must be a positive number');

function postJson(urlText, bodyText) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlText);
    const transport = url.protocol === 'https:' ? https : http;
    const request = transport.request(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${internalApiKey}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(bodyText),
      },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        clearTimeout(deadline);
        resolve({
          ok: Boolean(response.statusCode && response.statusCode >= 200 && response.statusCode < 300),
          status: response.statusCode || 0,
          bodyText: Buffer.concat(chunks).toString('utf8'),
        });
      });
    });
    const deadline = setTimeout(() => {
      request.destroy(new Error(`internal endpoint timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    request.on('error', (error) => {
      clearTimeout(deadline);
      reject(error);
    });
    request.end(bodyText);
  });
}

const response = await postJson(`${appUrl}${endpoint}`, JSON.stringify(payload));
const bodyText = response.bodyText;
let body;
try {
  body = JSON.parse(bodyText);
} catch {
  fail('internal endpoint returned non-JSON', { endpoint, status: response.status, body: bodyText.slice(0, 500) });
}

process.stdout.write(`${JSON.stringify(body)}\n`);
if (!response.ok || body?.ok !== true) {
  fail('internal endpoint failed', { endpoint, status: response.status, error: body?.error || null });
}

if (endpoint.endsWith('/source-sync')) {
  if (body?.meta?.statusOnly === true || String(body?.result?.degradedReason || '').includes('status_only')) {
    fail('status-only source sync is not a successful acquisition', body);
  }
  const rows = Array.isArray(body?.result?.results) ? body.result.results : [body?.result];
  for (const row of rows) {
    if (!row || row.timedOut || row.errorCode || ['parser_failed', 'auth_failed', 'license_blocked', 'retired', 'manual_only', 'failed', 'partial'].includes(row.terminalReason)) {
      fail('source connector did not reach an accepted terminal state', row);
    }
    const fetched = Number(row.fetchedPosts || row.fetched || 0);
    const written = Number(row.recordsWritten || row.written || 0);
    const duplicates = Number(row.duplicatesSkipped || row.duplicate || 0);
    if (written === 0 && fetched > 0 && duplicates < fetched && !['successful_empty', 'duplicate_only'].includes(String(row.terminalReason))) {
      fail('source connector fetched records but did not explain zero writes', row);
    }
  }
}
