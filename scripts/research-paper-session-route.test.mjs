import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';
import ts from '../web/node_modules/typescript/lib/typescript.js';

test('an inactive unheld entry cannot block monitoring an existing inactive position', async () => {
  const session = '2026-10-02'; const fetched = []; let marked; let saved;
  const book = { bookId: 'growth', positions: [{ symbol: '2409', sector: 'old', shares: 1000 }], lastProcessedSession: null };
  const db = { rpc: async (name, args) => ({ error: null, data: name.includes('instrument')
    ? [{ symbol: args.p_stock_id, instrument_type: 'common_stock', exchange: 'TWSE', listing_status: 'inactive' }]
    : [] }), from(table) {
    let filters = {}; let inserted;
    const value = () => {
      if (table === 'research_paper_book_revisions_v1') {
        if (inserted) { saved = inserted; return { data: null, error: null }; }
        return { data: filters.operation_key ? null : { revision_hash: 'parent', state: book }, error: null };
      }
      if (table === 'tw_trading_sessions_v3') return { data: { session_id: '2026-10-01' }, error: null };
      if (table === 'candidate_technical_decisions_v1') return { data: [{ stock_id: '2330', snapshot: {
        symbol: '2330', entryResearchEligible: true, plans: [{ validFromSession: session, rawSignalState: 'confirmed' }],
      } }], error: null };
      if (table === 'stocks') return { data: { id: filters.symbol, symbol: filters.symbol }, error: null };
      if (table === 'opportunity_corporate_action_events_v3') return { data: [], error: null };
      throw new Error('unexpected_table:' + table);
    };
    const query = { then: (yes, no) => Promise.resolve(value()).then(yes, no), maybeSingle: async () => value() };
    for (const method of ['select','eq','lt','lte','order','limit']) query[method] = (key, val) => {
      if (method === 'eq') filters[key] = val; return query;
    };
    query.insert = (row) => { inserted = row; return query; }; return query;
  } };
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status || 200 }) } },
    '@/lib/internal-auth': { requireExactInternalBearer: () => true },
    '@/lib/supabase-server': { getSupabaseServerClient: () => db },
    '@/lib/research-agent-qualification': { researchCanonicalHash: () => 'fixture', researchEntryQualification: () => { throw new Error('unheld entry must be skipped'); } },
    '@/lib/research-deep-evidence': {},
    '@/lib/research-paper-books': { markPaperPositions: (input) => { marked = input; return input.book; }, settlePaperSession: (input) => input.book },
    '@/lib/research-execution-context': { loadResearchExecutionContext: async () => ({}) },
    '@/lib/tw-entry-plan-authority': { acquireTwEntryForwardCalendar: async () => ({}), loadTwEntryPlanAuthority: async (_db, input) => {
      fetched.push(input.symbol); return { missingData: [], priceBasis: { status: 'verified' }, bars: [{ session, open: 30, high: 31, low: 29, close: 30, volume: 5000 }] };
    } },
    '@/lib/technical-features-v2': { calculateTechnicalFeatures: () => ({ ma20: 30 }) },
  };
  const exports = {};
  const source = fs.readFileSync(new URL('../web/src/app/api/internal/research-paper-session/route.ts', import.meta.url), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: (name) => { assert.ok(name in dependencies, name); return dependencies[name]; }, Date });
  const result = await exports.POST({ json: async () => ({ bookId: 'growth', action: 'session', session }) });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.deepEqual(fetched, ['2409']); assert.equal(marked.bars.length, 1);
  assert.equal(marked.bars[0].symbol, '2409'); assert.equal(saved.parent_hash, 'parent');
  assert.equal(saved.result.outcomes[0].reason, 'listing_not_active_at_entry');
});
