import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

// Run the actual route up to its authority boundary, with deterministic clock
// and acquisition completion. This catches ordering regressions across awaits.
async function captureTechnicalCutoff(historical) {
  let now = Date.parse('2026-09-30T10:00:00.000Z');
  let acquiredAt;
  let captured;
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-technical-snapshot/route.ts', import.meta.url), 'utf8');
  const rows = {
    stocks: { id: 'stock', symbol: '2409' },
    stock_instruments_v3: [{ exchange: 'TWSE' }],
    tw_trading_sessions_v3: [{ session_id: '2026-09-30', close_at: '2026-09-30T05:30:00Z' }],
    candidate_thesis_qualifications_v1: { payload: { symbol: '2409', status: 'qualified', articleHash: 'hash',
      reviewReceiptHash: 'review', articleRevisionId: 'article' }, status: 'qualified', article_hash: 'hash', review_receipt_hash: 'review' },
    candidate_research_dossiers: { content: { deepResearch: { sourceDocumentIds: ['source'] } } },
  };
  const db = { from(table) {
    const result = { data: rows[table], error: null };
    const query = { then: (resolve, reject) => Promise.resolve(result).then(resolve, reject), maybeSingle: async () => result };
    for (const method of ['select', 'eq', 'lte', 'or', 'order', 'limit']) query[method] = () => query;
    return query;
  } };
  const deps = {
    'next/server': { NextResponse: { json: (body, init) => ({ body, status: init?.status ?? 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer: () => true },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db },
    '@/lib/tw-entry-plan-authority': {
      acquireTwEntryForwardCalendar: async () => { now += 100; acquiredAt = new Date(now).toISOString(); return { availableAt: acquiredAt }; },
      loadTwEntryPlanAuthority: async (_db, input) => { captured = input; throw new Error('test_stop_after_authority_boundary'); },
    },
    '@/lib/research-agent-qualification': { researchCanonicalHash: () => 'hash' },
    '@/lib/research-deep-evidence': { loadDeepArticleEvidence: async () => [{ publicCitation: true, retracted: false }] },
    '@/lib/tw-entry-plan': {}, '@/lib/technical-features-v2': {}, '@/lib/tw-entry-plan-contract': {}, '@/lib/research-weekly-bars': {},
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022,
  } }).outputText, { exports, require: (name) => { assert.ok(name in deps, name); return deps[name]; }, Date: Clock });
  await exports.POST({ json: async () => ({ symbol: '2409', ...(historical ? { observedAt: historical } : {}) }) });
  assert.ok(captured, 'actual route must reach the authority boundary');
  return { captured, acquiredAt };
}

test('live technical snapshot freezes cutoff after the official calendar acquisition', async () => {
  const { captured, acquiredAt } = await captureTechnicalCutoff();
  assert.ok(Date.parse(captured.cutoff) >= Date.parse(acquiredAt));
});
test('historical cutoff is not moved to admit calendar evidence first observed later', async () => {
  const historical = '2026-09-29T10:00:00Z';
  const { captured, acquiredAt } = await captureTechnicalCutoff(historical);
  assert.equal(captured.cutoff, historical);
  assert.ok(Date.parse(captured.cutoff) < Date.parse(acquiredAt));
});
