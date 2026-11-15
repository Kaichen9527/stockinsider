import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import http from 'node:http';
import test from 'node:test';

function runCaller({ port, timeoutMs, endpoint = '/api/internal/test', sequence }) {
  return new Promise((resolve, reject) => {
    const appUrl = `http://127.0.0.1:${port}`;
    const args = sequence
      ? ['scripts/call_internal_api_sequence.mjs', JSON.stringify(sequence)]
      : ['scripts/call_internal_api.mjs', endpoint, '{"dryRun":false}'];
    const child = spawn(process.execPath, args, {
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

async function withDelayedServer(delayMs, work, reply = () => [200, { ok: true }]) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      requests.push({ authorization: request.headers.authorization, body });
      setTimeout(() => {
        if (!response.destroyed) {
          const [status, payload] = reply(request.url);
          response.writeHead(status, { 'content-type': 'application/json' });
          response.end(JSON.stringify(payload));
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

const worker = '/api/internal/candidate-financial-documents/worker';
const followUp = '/api/internal/taiwan-data-queue-drain';
const availableAt = '2026-11-16T07:00:00.000Z';
const recorded = {
  ok: false,
  schemaVersion: 'private-financial-preparation-v1',
  purpose: 'private_financial_data_preparation',
  qualificationAuthority: false,
  rankingAuthority: false,
  claimed: 1,
  recovered: 0,
  gaps: [],
  results: [{ status: 'partial', validation: 'success', availableAt }],
};

test('the scheduled sequence records a verified partial document and continues the independent next step', async () => {
  const paths = [];
  await withDelayedServer(0, async (port) => {
    const result = await runCaller({ port, timeoutMs: 2_000, sequence: [
      { endpoint: worker, payload: { limit: 5 }, timeoutMs: 2_000 },
      { endpoint: followUp, timeoutMs: 2_000 },
    ] });
    assert.equal(result.code, 0, result.stderr);
    assert.deepEqual(paths, [worker, followUp]);
    assert.match(result.stderr, /validated subset with gaps/u);
    assert.deepEqual(result.stdout.trim().split('\n').map((line) => JSON.parse(line)), [recorded, { ok: true }]);
  }, (path) => {
    paths.push(path);
    return path === worker ? [500, recorded] : [200, { ok: true }];
  });
});

test('unverified partial, errors and unresolved work still fail the scheduled caller', async (t) => {
  const cases = [
    ['wrong endpoint', followUp, 500, recorded],
    ['server error', worker, 503, recorded],
    ['unavailable bridge', worker, 500, { ...recorded, error: 'financial_preparation_database_rejected' }],
    ['unverified partial', worker, 500, { ...recorded, results: [{ status: 'partial', validation: 'partial', availableAt }] }],
    ['no committed timestamp', worker, 500, { ...recorded, results: [{ status: 'partial', validation: 'success', availableAt: null }] }],
    ['pending batch', worker, 202, { ...recorded, gaps: ['financial_preparation_operator_reconciliation_required'] }],
    ['mixed rejection', worker, 500, { ...recorded, claimed: 2, results: [...recorded.results, { status: 'rejected', availableAt }] }],
    ['same-job deferral', worker, 500, { ...recorded, results: [{ status: 'deferred', availableAt }] }],
  ];
  for (const [name, endpoint, status, body] of cases) {
    await t.test(name, async () => {
      await withDelayedServer(0, async (port) => {
        const result = await runCaller({ port, timeoutMs: 2_000, endpoint });
        assert.equal(result.code, 1, result.stderr);
        assert.match(result.stderr, /internal endpoint failed/u);
      }, () => [status, body]);
    });
  }
});
