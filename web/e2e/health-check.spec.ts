import { expect, test } from '@playwright/test';

test('health-check returns env configuration status', async ({ request }) => {
  const unauthorized = await request.get('/api/internal/health-check');
  expect([401, 500]).toContain(unauthorized.status());
  const internalKey = process.env.E2E_INTERNAL_API_KEY || process.env.INTERNAL_API_KEY;
  test.skip(!internalKey, 'authenticated health smoke requires an internal key');
  const res = await request.get('/api/internal/health-check', {
    headers: { authorization: `Bearer ${internalKey}` },
  });
  expect(res.status()).toBe(200);

  const json = await res.json();
  expect(json.ok).toBe(true);

  // Env section: all values must be booleans (never actual secrets)
  expect(typeof json.env.INTERNAL_API_KEY).toBe('boolean');
  expect(typeof json.env.CRON_SECRET).toBe('boolean');
  expect(typeof json.env.SUPABASE_URL).toBe('boolean');
  expect(typeof json.env.meta_cookies).toBe('boolean');

  // Connectors and cron runs: arrays (may be empty in dev)
  expect(Array.isArray(json.connectors)).toBe(true);
  expect(Array.isArray(json.lastCronRuns)).toBe(true);

  // Timestamp
  expect(typeof json.checkedAt).toBe('string');
});
