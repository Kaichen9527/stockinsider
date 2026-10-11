import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { buildResearchInboxRow, validateResearchInboxItem } from '../web/src/lib/research-inbox.ts';
const require = createRequire(import.meta.url);
const ts = require('../web/node_modules/typescript');
const source = readFileSync(new URL('../web/src/app/api/internal/research-inbox/route.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const item = { sourcePlatform: 'official', sourceUrl: 'https://example.com/official', author: 'synthetic',
  publishedAt: '2026-10-08T00:00:00Z', observedAt: '2026-10-11T00:00:00Z', symbols: ['2409'],
  shortSummary: 'Synthetic bounded summary.', catalyst: 'Unverified.', risk: 'No order claim.', claimStatus: 'reported', visibility: 'public' };
function fixture(options = {}) {
  const calls = [], owner = 'synthetic-owner-only'; let capturedRows;
  const modules = {
    'next/server': { NextResponse: { json: (value, init) => Response.json(value, init) } },
    '@/lib/internal-auth': { requireInternalAuth: () => options.unauthorized ? { ok: false, status: 401, error: 'unauthorized' } : { ok: true, authSource: 'synthetic_internal' } },
    '@/lib/research-inbox': { buildResearchInboxRow, validateResearchInboxItem },
    '@/lib/production-write-lease': {
      acquireProductionWriteLease: async ttl => { calls.push(['acquire', ttl]); if (options.acquireError) throw Error('synthetic-private-acquire'); return options.busy ? null : owner; },
      releaseProductionWriteLease: async value => { calls.push(['release', value]); if (options.releaseError) throw Error('synthetic-private-release'); },
    },
    '@/lib/supabase-server': { getSupabaseServerClient: () => {
      calls.push(['client']); if (options.clientError) throw Error('synthetic-private-client');
      return { from: table => { calls.push(['from', table]); return { upsert: (rows, settings) => {
        calls.push(['upsert', settings]); capturedRows = rows;
        return { select: async columns => { calls.push(['select', columns]); if (options.writeThrow) throw Error('synthetic-private-write');
          return { error: options.dbError ? { message: 'synthetic_database_error' } : null,
            data: options.duplicate ? [] : [{ id: 'synthetic-row', document_url: rows[0].document_url }] }; } };
      } }; } };
    } },
  };
  const exports = {};
  vm.runInNewContext(compiled, { exports, require: key => { assert.ok(modules[key], key); return modules[key]; } });
  return { calls, rows: () => capturedRows, async invoke(body = { items: [item] }) {
    const request = new Request('http://localhost/api/internal/research-inbox', { method: 'POST', body: typeof body === 'string' ? body : JSON.stringify(body) });
    const response = await exports.POST(request); return { status: response.status, body: await response.json() };
  } };
}
for (const [name, body] of [['invalid JSON', '{'], ['missing items', {}], ['empty items', { items: [] }], ['over limit', { items: Array(101).fill(item) }], ['invalid item', { items: [{ ...item, sourceUrl: 'http://example.com' }] }]]) {
  test(`inbox ${name} cannot acquire or write`, async () => { const f = fixture(); assert.equal((await f.invoke(body)).status, 400); assert.deepEqual(f.calls, []); });
}
test('unauthorized inbox cannot acquire or write', async () => { const f = fixture({ unauthorized: true }); assert.equal((await f.invoke()).status, 401); assert.deepEqual(f.calls, []); });
test('busy owner rejects without upsert or foreign release', async () => { const f = fixture({ busy: true }); assert.equal((await f.invoke()).status, 409); assert.deepEqual(f.calls, [['acquire', 3600]]); });
test('lease acquisition failure rejects without writes or release', async () => { const f = fixture({ acquireError: true }); assert.equal((await f.invoke()).status, 503); assert.deepEqual(f.calls, [['acquire', 3600]]); });
for (const options of [{}, { duplicate: true }]) test(`success and dedup preserve revision rows and release own lease (${!!options.duplicate})`, async () => {
  const f = fixture(options), result = await f.invoke(); assert.equal(result.status, 200); assert.equal(result.body.accepted, options.duplicate ? 0 : 1);
  assert.equal(JSON.stringify(f.rows()), JSON.stringify([buildResearchInboxRow(item)]));
  assert.equal(JSON.stringify(f.calls.find(row => row[0] === 'upsert')[1]), JSON.stringify({ onConflict: 'platform,document_url', ignoreDuplicates: true }));
  assert.deepEqual(f.calls.at(-1), ['release', 'synthetic-owner-only']); assert.equal(JSON.stringify(result.body).includes('synthetic-owner-only'), false);
});
test('existing 100 item boundary remains valid under one lease', async () => { const f = fixture(); assert.equal((await f.invoke({ items: Array(100).fill(item) })).status, 200); assert.equal(f.rows().length, 100); assert.equal(f.calls.filter(row => row[0] === 'acquire').length, 1); });
for (const options of [{ dbError: true }, { clientError: true }, { writeThrow: true }]) test(`database failures release own lease (${Object.keys(options)[0]})`, async () => {
  const f = fixture(options), result = await f.invoke(); assert.equal(result.status, 500); assert.deepEqual(f.calls.at(-1), ['release', 'synthetic-owner-only']);
  assert.equal(result.body.error, options.dbError ? 'synthetic_database_error' : 'research_inbox_write_failed');
});
test('release failure after write cannot report complete success', async () => { const f = fixture({ releaseError: true }); const result = await f.invoke(); assert.equal(result.status, 500); assert.equal(result.body.ok, false); assert.equal(result.body.writeMayHaveSucceeded, true); assert.equal(result.body.error, 'production_writer_release_failed'); });
test('write plus release failure preserves primary error and exposes cleanup gap', async () => { const f = fixture({ dbError: true, releaseError: true }); const result = await f.invoke(); assert.equal(result.status, 500); assert.equal(result.body.error, 'synthetic_database_error'); assert.equal(result.body.cleanupError, 'production_writer_release_failed'); });
