import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';

function runCaller({ port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const appUrl = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['scripts/call_internal_api.mjs', '/api/internal/test', '{"dryRun":false}'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        APP_URL: appUrl,
        EXPECTED_APP_URL: appUrl,
        INTERNAL_API_KEY: 'test-internal-key',
        INTERNAL_API_TIMEOUT_MS: String(timeoutMs),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.once('error', reject);
    child.once('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function withDelayedServer(delayMs, work) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ authorization: request.headers.authorization, body });
      setTimeout(() => {
        if (!response.destroyed) {
          response.writeHead(200, { 'content-type': 'application/json' });
          response.end('{"ok":true}');
        }
      }, delayMs);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await work(server.address().port, requests);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('internal caller waits for a delayed response within its configured deadline', async () => {
  await withDelayedServer(150, async (port, requests) => {
    const result = await runCaller({ port, timeoutMs: 1_000 });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { ok: true });
    assert.equal(requests[0]?.authorization, 'Bearer test-internal-key');
    assert.deepEqual(JSON.parse(requests[0]?.body || '{}'), { dryRun: false });
  });
});

test('internal caller enforces the configured absolute deadline', async () => {
  await withDelayedServer(200, async (port) => {
    const result = await runCaller({ port, timeoutMs: 50 });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /internal endpoint timed out after 50ms/u);
  });
});
