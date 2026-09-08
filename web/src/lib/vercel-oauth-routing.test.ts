import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const vercel = JSON.parse(readFileSync(new URL('../../vercel.json', import.meta.url), 'utf8')) as { crons: unknown[]; redirects: unknown[] };
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');

test('Vercel stays zero-cron while retaining only the HTTPS Threads and policy surfaces', () => {
  assert.deepEqual(vercel.crons, []);
  assert.deepEqual(vercel.redirects, []);
  assert.match(proxy, /return NextResponse\.redirect\(destination, 308\)/u);
  for (const path of ['/api/auth/threads/callback', '/api/internal/threads-oauth-start', '/privacy', '/data-deletion']) {
    assert.ok(proxy.includes(`'${path}'`));
  }
});
