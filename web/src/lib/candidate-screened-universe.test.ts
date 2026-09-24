import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';
import { loadPublishedCandidateSymbols, screenedCandidateSymbols } from './candidate-screened-universe.ts';
import { sha256Canonical } from './opportunity-v3/canonical.ts';

type Row = Record<string, unknown>;
const PUBLIC = 'radar_public_snapshots';
const LEGACY = 'legacy_radar_projections_v3_11';
const cutoff = '2026-09-24T12:00:00Z';
const before = '2026-09-24T10:00:00Z';
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
test('a freshly built screen has the same bounded discovery membership before and after publication', () => {
  const payload = { sourceSignals: [{ symbol: '2330' }, { symbol: '1101' }],
    discoveredStocks: [{ symbol: '2409' }], stages: { found: [{ symbol: '2330', market: 'TW' }] },
    opportunities: [{ symbol: '6758', market: 'JP' }, { symbol: 'AAPL', market: 'US' }] };
  assert.deepEqual(screenedCandidateSymbols(payload), ['1101', '2330', '2409']);
  assert.throws(() => screenedCandidateSymbols({ ...payload, ignoredMetadata: 'x'.repeat(4 * 1024 * 1024) }), /payload_bound_exceeded/);
});
function publicRow(payload: Row, window = 'home', overrides: Row = {}): Row {
  const body = { asOf: before, ...payload };
  const digest = hash(body);
  return { id: `public-${window}`, window_key: window, schema_version: 'radar-public-v2', status: 'valid', published_at: before,
    created_at: before, content_as_of: before, payload_json: body, payload_hash: digest, etag: `"${digest}"`, ...overrides };
}
function legacyRow(payload: Row, window = 'daily', overrides: Row = {}): Row {
  const body = { asOf: before, sourceLedCorrectness: { schema: 'legacy-radar-v3.11.3', window: window === 'three_day' ? 'hot' : window, asOf: before },
    opportunities: [], ...payload };
  return { projection_id: `legacy-${window}`, window, as_of: before, created_at: before, payload_json: body, payload_sha256: sha256Canonical(body), ...overrides };
}
function mockClient(data: Record<string, Row[]> = {}, errors: Record<string, Row> = {}) {
  const reads: { table: string; filters: [string, string, unknown][]; limit: number }[] = [];
  class Query {
    readonly table: string;
    filters: [string, string, unknown][] = [];
    orders: { field: string; ascending: boolean }[] = [];
    count = 1000;
    constructor(table: string) { this.table = table; }
    select() { return this; }
    eq(field: string, value: unknown) { this.filters.push(['eq', field, value]); return this; }
    lte(field: string, value: string) { this.filters.push(['lte', field, value]); return this; }
    order(field: string, options?: { ascending?: boolean }) { this.orders.push({ field, ascending: options?.ascending !== false }); return this; }
    limit(count: number) { this.count = count; return this; }
    then(resolve: (value: { data: Row[] | null; error: Row | null }) => unknown, reject?: (error: unknown) => unknown) {
      reads.push({ table: this.table, filters: [...this.filters], limit: this.count });
      const rows = (data[this.table] || []).filter((row) => this.filters.every(([operation, field, value]) => operation === 'eq'
        ? row[field] === value : Date.parse(String(row[field])) <= Date.parse(String(value)))).sort((a, b) => {
        for (const { field, ascending } of this.orders) { const diff = String(a[field]).localeCompare(String(b[field])); if (diff) return ascending ? diff : -diff; }
        return 0;
      }).slice(0, this.count);
      return Promise.resolve(errors[this.table] ? { data: null, error: errors[this.table] } : { data: rows, error: null }).then(resolve, reject);
    }
  }
  return { client: { from: (table: string) => new Query(table) } as unknown as Pick<SupabaseClient, 'from'>, reads };
}

test('unions every published window and screened bucket; filters explicit foreign markets and unrelated metadata', async () => {
  const data = { [PUBLIC]: [
    publicRow({ stages: { found: [{ symbol: '2330', market: 'TW' }], waiting: [{ symbol: '2303' }], actionable: [{ symbol: '2382', market: 'TW' }] },
      sourceSignals: [{ symbol: '3231', currentPrice: 999999, foreignPeers: [{ symbol: '9998' }] }, { symbol: '9999', market: 'US' }],
      opportunities: [{ symbol: '2454', market: 'TW' }, { symbol: 'AAPL', market: 'US' }, { symbol: '6762', market: 'JP' }],
      discoveredStocks: [{ symbol: '2409' }], reports: [{ symbol: '9876' }], unrelatedPrice: { symbol: '8765' } }),
    publicRow({ scenarioUpsideCandidates: [{ symbol: '3008' }], earlyWatchlist: [{ symbol: '3443' }], hotTracking: [{ symbol: '6669' }] }, 'daily'),
    publicRow({ recentFormal7d: [{ symbol: '3017' }], fallbackOpportunities90d: [{ symbol: '3037' }], earlySignals: [{ symbol: '2345' }],
      partiallyVerified: [{ symbol: '2379' }], validatedIdeas: [{ symbol: '2308' }] }, 'hot'),
    publicRow({ candidates: [{ symbol: '2449' }], watchlists: { growth: ['2421', { symbol: '2356' }], foreign: { market: 'US', symbols: ['1000'] } },
      trackedStocks: [{ symbol: '6230' }] }, 'weekly'),
  ], [LEGACY]: [legacyRow({ sourceSignals: [{ symbol: '5347' }, { symbol: '2330' }] }), legacyRow({ earlyWatchlist: [{ symbol: '3533' }] }, 'three_day'),
    legacyRow({ discoveredStocks: [{ symbol: '6285' }] }, 'home'), legacyRow({ watchlist: ['6415'] }, 'weekly')] };
  const { client, reads } = mockClient(data);
  assert.deepEqual(await loadPublishedCandidateSymbols(client, cutoff), ['2303','2308','2330','2345','2356','2379','2382','2409','2421','2449','2454','3008','3017','3037','3231','3443','3533','5347','6230','6285','6415','6669']);
  assert.equal(reads.length, 8);
  assert.ok(reads.every((read) => read.limit === 2));
});

test('selects only the latest valid known row per window, excluding both future publication and insertion', async () => {
  const { client } = mockClient({ [PUBLIC]: [
    publicRow({ sourceSignals: [{ symbol: '2303' }] }, 'home', { id: 'old', published_at: '2026-09-24T09:00:00Z', content_as_of: '2026-09-24T09:00:00Z' }),
    publicRow({ sourceSignals: [{ symbol: '2330' }] }),
    publicRow({ sourceSignals: [{ symbol: '9991' }] }, 'home', { status: 'failed', published_at: '2026-09-24T11:00:00Z' }),
    publicRow({ sourceSignals: [{ symbol: '9992' }] }, 'home', { published_at: '2026-09-24T13:00:00Z' }),
    publicRow({ sourceSignals: [{ symbol: '9993' }] }, 'home', { published_at: '2026-09-24T11:00:00Z', created_at: '2026-09-24T13:00:00Z' }),
  ], [LEGACY]: [legacyRow({ sourceSignals: [{ symbol: '2454' }] }),
    legacyRow({ sourceSignals: [{ symbol: '9994' }] }, 'daily', { as_of: '2026-09-24T13:00:00Z' }),
    legacyRow({ sourceSignals: [{ symbol: '9995' }] }, 'daily', { created_at: '2026-09-24T13:00:00Z' })] });
  assert.deepEqual(await loadPublishedCandidateSymbols(client, cutoff), ['2330', '2454']);
});

test('missing tables are optional; denied, missing-column, and transport failures stay visible', async () => {
  for (const error of [{ code: '42P01' }, { code: 'PGRST205' }]) {
    const { client } = mockClient({ [PUBLIC]: [publicRow({ candidates: [{ symbol: '2330' }] })] }, { [LEGACY]: error });
    assert.deepEqual(await loadPublishedCandidateSymbols(client, cutoff), ['2330']);
  }
  for (const error of [{ code: '42501', message: 'permission denied' }, { code: 'PGRST204', message: 'missing column in schema cache' }, { message: 'fetch failed' }]) {
    await assert.rejects(loadPublishedCandidateSymbols(mockClient({}, { [PUBLIC]: error }).client, cutoff), /published_candidate_read_failed/u);
  }
  assert.deepEqual(await loadPublishedCandidateSymbols(mockClient().client, cutoff), []);
});

test('canonical legacy checksum and public receipt/ETag inconsistencies fail closed', async () => {
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [LEGACY]: [legacyRow({ sourceSignals: [{ symbol: '2330' }] }, 'daily', { payload_sha256: 'a'.repeat(64) })] }).client, cutoff), /legacy_checksum_or_schema_invalid/u);
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [publicRow({ candidates: [{ symbol: '2330' }] }, 'home', { etag: '"bad"' })] }).client, cutoff), /checksum_conflict/u);
});

test('public JSONB key reordering cannot be mistaken for a verifiable canonical digest', async () => {
  const row = publicRow({ sourceSignals: [{ symbol: '2330' }] });
  row.payload_json = { sourceSignals: [{ symbol: '2330' }], asOf: before };
  assert.notEqual(hash(row.payload_json), row.payload_hash, 'JSONB need not preserve publisher insertion order');
  assert.deepEqual(await loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [row] }).client, cutoff), ['2330']);
});

test('checks every bounded tied head, including a conflict beyond the two-row sentinel', async () => {
  const first = publicRow({ sourceSignals: [{ symbol: '2330' }] }, 'home', { id: '1' });
  const second = { ...first, id: '2' };
  const third = publicRow({ sourceSignals: [{ symbol: '2454' }] }, 'home', { id: '3' });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [first, second, third] }).client, cutoff), /checksum_conflict/u);
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: Array.from({ length: 33 }, (_, index) => ({ ...first, id: String(index).padStart(3, '0') })) }).client, cutoff), /head_bound_exceeded/u);
  assert.deepEqual(await loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [first, second] }).client, cutoff), ['2330']);
});

test('payload and unique-symbol bounds throw instead of silently losing screened stocks', async () => {
  const tooLarge = publicRow({ padding: 'x'.repeat(4 * 1024 * 1024), sourceSignals: [{ symbol: '2330' }] });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [tooLarge] }).client, cutoff), /payload_bound_exceeded/u);
  const tooMany = publicRow({ watchlist: Array.from({ length: 5001 }, (_, index) => String(index).padStart(4, '0')) });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [tooMany] }).client, cutoff), /symbol_bound_exceeded/u);
});

test('rejects future payload knowledge and invalid cutoff before returning any seeds', async () => {
  const row = publicRow({ asOf: '2026-09-24T13:00:00Z', candidates: [{ symbol: '2330' }] });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [row] }).client, cutoff), /future_payload/u);
  await assert.rejects(loadPublishedCandidateSymbols(mockClient().client, 'not-a-cutoff'), /cutoff_invalid/u);
});


test('the actual public publisher civil-date content shape remains readable without backdating knowledge', async () => {
  const published = publicRow({ schemaVersion: 'radar-public-v2', asOf: '2026-09-24', dataCutoffAt: '2026-09-24',
    snapshotPublishedAt: before, snapshotPhase: 'final', stages: { found: [{ symbol: '2330', market: 'TW' }], waiting: [], actionable: [] } });
  assert.deepEqual(await loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [published] }).client, cutoff), ['2330']);
  const futureDate = publicRow({ asOf: '2026-09-25', sourceSignals: [{ symbol: '2330' }] });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [futureDate] }).client, cutoff), /future_payload/u);
  const invalidDate = publicRow({ asOf: '2026-02-30', sourceSignals: [{ symbol: '2330' }] });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [invalidDate] }).client, cutoff), /future_payload/u);
  const dateOnlyPublication = publicRow({ asOf: '2026-09-24', snapshotPublishedAt: '2026-09-24', sourceSignals: [{ symbol: '2330' }] });
  await assert.rejects(loadPublishedCandidateSymbols(mockClient({ [PUBLIC]: [dateOnlyPublication] }).client, cutoff), /future_payload/u);
});
