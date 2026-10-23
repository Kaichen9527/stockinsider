import assert from 'node:assert/strict';
import test from 'node:test';
import { loadActualDiscovery } from './discovery-test-loader.mjs';
const { scanCachedCandidates } = loadActualDiscovery() as { scanCachedCandidates: typeof import('./discovery.ts').scanCachedCandidates };
import { inputHash } from './policy.ts';
import type { command, enqueue } from './store.ts';
import type { getSupabaseServerClient } from '../supabase-server';

test('VN06/VN07 actual cache scan transport screens an incumbent without fresh clues and persists separate current evidence', async () => {
 const now = '2026-10-21T11:00:00Z';
 const clues = [{ symbol: '2330', source: 'ptt', root: 'root', authorRoot: 'author', contentHash: inputHash('old_event'), eventAt: '2026-10-20T01:00:00Z', availableAt: '2026-10-20T02:00:00Z' }];
 const frozen = { hash: inputHash('immutable'), clues }; const before = JSON.stringify(frozen);
 const dates = Array.from({ length: 21 }, (_, i) => new Date(Date.parse('2026-10-21T00:00:00Z') - i * 86400000).toISOString().slice(0,10)); // explicit synthetic calendar, not a weekday resolver
 const calls: Array<{ action: string; body: Record<string, unknown> }> = []; const reads: string[] = [];
 const context = { session: dates[0], completed: true, postclose: true, weeklyDue: true, priceSessions: dates, clues: [], active: [{ symbol: '2330', state: 'eligible', evidence: frozen }], market: null };
 const send: typeof command = async (_identity, action, body) => { calls.push({ action, body }); return action === 'screen-context' ? context : { recorded: true }; };
 const client = { from(table: string) {
  reads.push(table);
  const data = table === 'stocks' ? [{id:'10000000-0000-4000-8000-000000000001',symbol:'2330',market:'TW'}] : table === 'stock_instruments_v3' ? [{instrument_authority_id:'20000000-0000-4000-8000-000000000001',symbol:'2330',stock_id:'10000000-0000-4000-8000-000000000001',exchange:'TWSE',instrument_type:'common_stock',listing_status:'active',provider:'twse',source_timestamp:'2026-10-20T00:00:00Z',valid_from:'2026-10-20T00:00:00Z',valid_to:null,roster_version:'tw-instrument-roster-v3.0',recorded_at:'2026-10-20T00:01:00Z'}]
    : table === 'official_price_history' ? dates.map((date,i) => ({ stock_id: '10000000-0000-4000-8000-000000000001', session_date: date, close: 100-i, source_url: 'https://fixture.invalid/price', provenance: { adjustment_status: 'verified' } })) : [];
  const query: Record<string, unknown> = {}; for (const method of ['select','in','eq','lte','gte','or','order']) query[method] = () => query;
  query.limit = async () => ({ data, error: null }); return query;
 } } as unknown as ReturnType<typeof getSupabaseServerClient>;
 const admit: typeof enqueue = async (_identity, body) => { calls.push({ action: 'enqueue', body }); return { jobs: [] }; };
 await scanCachedCandidates({ principal: 'synthetic-operator', role: 'operator' }, { client, command: send, enqueue: admit, now });
 assert.deepEqual(reads.sort(), ['stocks','official_price_history','revenue_signals','stock_instruments_v3','stock_instruments_v3','technical_feature_snapshots'].sort());
 const observations = calls.find((c) => c.action === 'screen-observations')!.body.observations as Array<{ symbol: string; input: { eventAt: string; priceEvidence: boolean } }>;
 assert.equal(observations[0].symbol, '2330'); assert.equal(observations[0].input.eventAt, clues[0].eventAt);
 assert.equal(observations[0].input.priceEvidence, false); // no verified technical adjustment authority; no imputation
 assert.deepEqual(calls.find((c) => c.action === 'weekly-audit')!.body.symbols, ['2330']);
 assert.equal(JSON.stringify(frozen), before);
 assert.equal(calls.some((c) => c.action === 'exit' || c.action === 'swap'), false);
});
