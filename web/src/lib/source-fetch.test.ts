import assert from 'node:assert/strict';
import test from 'node:test';
import { fetchTextWithRetry, SourceFetchError } from './source-fetch.ts';

const request = {
  url: 'https://source.example.test/feed',
  headers: { 'user-agent': 'StockInsiderTest/1.0' },
  timeoutMs: 10,
  retryDelayMs: 0,
  sleep: async () => {},
};

test('retries a transient network error and returns the succeeding response', async () => {
  let calls = 0;
  const result = await fetchTextWithRetry({
    ...request,
    fetchImplementation: async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('network failed');
      return new Response('ok');
    },
  });
  assert.deepEqual(result, { text: 'ok', attempts: 2 });
  assert.equal(calls, 2);
});

test('retries a retryable HTTP response but does not retry a permanent one', async () => {
  let retryableCalls = 0;
  await assert.rejects(
    fetchTextWithRetry({
      ...request,
      attempts: 2,
      fetchImplementation: async () => {
        retryableCalls += 1;
        return new Response('unavailable', { status: 503 });
      },
    }),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'http_503',
  );
  assert.equal(retryableCalls, 2);

  let permanentCalls = 0;
  await assert.rejects(
    fetchTextWithRetry({
      ...request,
      attempts: 3,
      fetchImplementation: async () => {
        permanentCalls += 1;
        return new Response('missing', { status: 404 });
      },
    }),
    (error: unknown) => error instanceof SourceFetchError && error.code === 'http_404',
  );
  assert.equal(permanentCalls, 1);
});
