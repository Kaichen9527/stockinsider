import type { SupabaseClient } from '@supabase/supabase-js';
import { sha256Canonical } from './opportunity-v3/canonical.ts';
import { validateCompactRadarProjectionRow } from './opportunity-v3/compact-radar-validation.ts';

type Row = Record<string, unknown>;
type Reader = Pick<SupabaseClient, 'from'>;
type PublicWindow = 'home' | 'daily' | 'hot' | 'weekly';
const WINDOWS: PublicWindow[] = ['home', 'daily', 'hot', 'weekly'];
const MAX_PAYLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SYMBOLS = 5000;
const MAX_TIED_ROWS = 32;
const CARD_BUCKETS = [
  'sourceSignals', 'opportunities', 'scenarioUpsideCandidates', 'hotTracking',
  'recentFormal7d', 'fallbackOpportunities90d', 'earlyWatchlist', 'earlySignals',
  'partiallyVerified', 'validatedIdeas', 'discoveredStocks', 'candidates',
  'watchlist', 'watchlists', 'trackedStocks',
] as const;
const HASH = /^[0-9a-f]{64}$/u;
function record(value: unknown): Row | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Row : null;
}
function instant(value: unknown): number {
  return typeof value === 'string' && /T.*(?:Z|[+-]\d{2}:\d{2})$/u.test(value) ? Date.parse(value) : NaN;
}
function ensure(value: unknown, reason: string): asserts value {
  if (!value) throw new Error(reason);
}
function missingTable(error: unknown, table: string) {
  const value = record(error);
  if (value?.code === '42P01' || value?.code === 'PGRST205') return true;
  // A missing column, permission error, timeout, or generic schema-cache error
  // must not silently turn a partially read roster into a complete result.
  const message = typeof value?.message === 'string' ? value.message : '';
  return message.includes(table) && /relation .* does not exist|could not find the table .* in the schema cache/iu.test(message);
}
function checkedPayload(row: Row, cutoff: string): Row {
  const payload = record(row.payload_json);
  ensure(payload, 'published_candidate_payload_invalid');
  let encoded: string;
  try { encoded = JSON.stringify(payload); } catch { throw new Error('published_candidate_payload_invalid'); }
  ensure(Buffer.byteLength(encoded, 'utf8') <= MAX_PAYLOAD_BYTES, 'published_candidate_payload_bound_exceeded');
  const correctness = record(payload.sourceLedCorrectness);
  // The live publisher preserves civil session dates for asOf/dataCutoffAt.
  // They identify content, not the timestamp at which it became knowable.
  // Publication/insertion clocks are independently required on storage rows.
  const cutoffSession = new Date(instant(cutoff) + 8 * 3_600_000).toISOString().slice(0, 10);
  for (const value of [payload.asOf, payload.dataCutoffAt, correctness?.asOf, correctness?.contentAsOf]) {
    if (value === undefined || value === null) continue;
    const civil = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
      && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
      && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
    ensure(civil ? value <= cutoffSession : Number.isFinite(instant(value)) && instant(value) <= instant(cutoff), 'published_candidate_future_payload');
  }
  for (const value of [payload.snapshotPublishedAt, correctness?.evaluatedAt, correctness?.publishedAt]) {
    if (value === undefined || value === null) continue;
    ensure(Number.isFinite(instant(value)) && instant(value) <= instant(cutoff), 'published_candidate_future_payload');
  }
  return payload;
}
function symbolsFromPayload(payload: Row, symbols: Set<string>) {
  let nodes = 0;
  const add = (value: unknown, market?: unknown) => {
    // A missing market is allowed only as a discovery seed. The producer must
    // intersect these four-digit strings with the current official TW roster.
    if (market !== undefined && market !== null && market !== 'TW') return;
    if (typeof value !== 'string' || !/^\d{4}$/u.test(value)) return;
    symbols.add(value);
    ensure(symbols.size <= MAX_SYMBOLS, 'published_candidate_symbol_bound_exceeded');
  };
  const visit = (value: unknown, depth = 0, inheritedMarket?: unknown): void => {
    ensure(++nodes <= 50_000 && depth <= 8, 'published_candidate_collection_bound_exceeded');
    if (value === null || value === undefined) return;
    if (typeof value === 'string') { add(value, inheritedMarket); return; }
    if (Array.isArray(value)) { for (const item of value) visit(item, depth + 1, inheritedMarket); return; }
    const item = record(value);
    ensure(item, 'published_candidate_collection_invalid');
    const market = item.market ?? inheritedMarket;
    if (market !== undefined && market !== null && market !== 'TW') return;
    if (Object.hasOwn(item, 'symbol')) {
      add(item.symbol, market);
      // Never pull overseas peers, citations, targets, prices, or related assets
      // from a card into the screened universe by recursively traversing it.
      return;
    }
    // Supports named watchlists and grouped candidate buckets, but ignores
    // scalar metadata (e.g. a watchlist title that happens to contain digits).
    for (const nested of Object.values(item)) if (Array.isArray(nested) || record(nested)) visit(nested, depth + 1, market);
  };
  for (const bucket of CARD_BUCKETS) if (payload[bucket] !== undefined && payload[bucket] !== null) visit(payload[bucket]);
  const stages = record(payload.stages);
  ensure(payload.stages == null || stages, 'published_candidate_collection_invalid');
  if (stages) for (const stage of ['found', 'waiting', 'actionable']) if (stages[stage] != null) visit(stages[stage]);
}

async function readPublicWindow(client: Reader, window: PublicWindow, cutoff: string): Promise<Row | null> {
  const table = 'radar_public_snapshots';
  const query = () => client.from(table)
    .select('id,window_key,schema_version,status,published_at,created_at,content_as_of,payload_json,payload_hash,etag')
    .eq('window_key', window).eq('status', 'valid').lte('published_at', cutoff).lte('created_at', cutoff)
    .order('published_at', { ascending: false }).order('id', { ascending: true });
  const result = await query().limit(2);
  if (result.error) {
    if (missingTable(result.error, table)) return null;
    throw new Error(`published_candidate_read_failed:${table}:${window}`);
  }
  ensure(Array.isArray(result.data), 'published_candidate_rows_invalid');
  if (!result.data.length) return null;
  let rows = result.data as Row[];
  const first = rows[0];
  if (rows[1] && instant(rows[1].published_at) === instant(first.published_at)) {
    const ties = await query().eq('published_at', String(first.published_at)).limit(MAX_TIED_ROWS + 1);
    ensure(!ties.error && Array.isArray(ties.data), `published_candidate_read_failed:${table}:${window}`);
    ensure(ties.data.length <= MAX_TIED_ROWS, 'published_candidate_head_bound_exceeded');
    rows = ties.data as Row[];
    ensure(rows.length >= 2, 'published_candidate_head_changed');
  } else rows = [first];
  const signatures = new Set<string>();
  let selected: Row | null = null;
  for (const row of rows) {
    ensure(row.window_key === window && row.status === 'valid'
      && Number.isFinite(instant(row.published_at)) && instant(row.published_at) <= instant(cutoff)
      && Number.isFinite(instant(row.created_at)) && instant(row.created_at) <= instant(cutoff)
      && Number.isFinite(instant(row.content_as_of)) && instant(row.content_as_of) <= instant(row.published_at), 'published_candidate_row_invalid');
    const payload = checkedPayload(row, cutoff);
    ensure(typeof row.payload_hash === 'string' && HASH.test(row.payload_hash)
      && row.etag === `"${row.payload_hash}"`, 'published_candidate_checksum_conflict');
    // Public v2 stores a hash of insertion-order JSON.stringify bytes, then
    // persists only JSONB, which discards that order. Its body digest cannot be
    // reliably recomputed here. Check the receipt/ETag and equal-head semantic
    // consistency; do not claim this grants evidence or recommendation authority.
    // Unlike this public format, the legacy format below has a canonical hash.
    signatures.add(`${row.payload_hash}:${sha256Canonical(payload)}`);
    selected = payload;
  }
  ensure(signatures.size === 1, 'published_candidate_checksum_conflict');
  return selected;
}

/** Membership only; calculation evidence must still come from official authority. */
export function screenedCandidateSymbols(payload: unknown): string[] {
  const row = record(payload);
  ensure(row, 'published_candidate_payload_invalid');
  ensure(Buffer.byteLength(JSON.stringify(row), 'utf8') <= MAX_PAYLOAD_BYTES, 'published_candidate_payload_bound_exceeded');
  const symbols = new Set<string>();
  symbolsFromPayload(row, symbols);
  return [...symbols].sort();
}

async function readLegacyWindow(client: Reader, window: PublicWindow, cutoff: string): Promise<Row | null> {
  const table = 'legacy_radar_projections_v3_11';
  const storageWindow = window === 'hot' ? 'three_day' : window;
  const query = () => client.from(table)
    .select('projection_id,window,as_of,created_at,payload_json,payload_sha256')
    .eq('window', storageWindow).lte('as_of', cutoff).lte('created_at', cutoff)
    .order('as_of', { ascending: false }).order('created_at', { ascending: false }).order('projection_id', { ascending: true });
  const result = await query().limit(2);
  if (result.error) {
    if (missingTable(result.error, table)) return null;
    throw new Error(`published_candidate_read_failed:${table}:${window}`);
  }
  ensure(Array.isArray(result.data), 'published_candidate_rows_invalid');
  if (!result.data.length) return null;
  let rows = result.data as Row[];
  const first = rows[0];
  if (rows[1] && instant(rows[1].as_of) === instant(first.as_of) && instant(rows[1].created_at) === instant(first.created_at)) {
    const ties = await query().eq('as_of', String(first.as_of)).eq('created_at', String(first.created_at)).limit(MAX_TIED_ROWS + 1);
    ensure(!ties.error && Array.isArray(ties.data), `published_candidate_read_failed:${table}:${window}`);
    ensure(ties.data.length <= MAX_TIED_ROWS, 'published_candidate_head_bound_exceeded');
    rows = ties.data as Row[];
    ensure(rows.length >= 2, 'published_candidate_head_changed');
  } else rows = [first];
  const signatures = new Set<string>();
  let selected: Row | null = null;
  for (const row of rows) {
    ensure(row.window === storageWindow && Number.isFinite(instant(row.as_of)) && instant(row.as_of) <= instant(cutoff)
      && Number.isFinite(instant(row.created_at)) && instant(row.created_at) <= instant(cutoff), 'published_candidate_row_invalid');
    checkedPayload(row, cutoff);
    const payload = validateCompactRadarProjectionRow(window, row);
    ensure(payload, 'published_candidate_legacy_checksum_or_schema_invalid');
    signatures.add(String(row.payload_sha256));
    selected = payload;
  }
  ensure(signatures.size === 1, 'published_candidate_checksum_conflict');
  return selected;
}

/** Producer-only discovery reader; no network acquisition, writes, or promotions.
 * Published prices and signals never enter calculation evidence through this API.
 * Callers must intersect the result with official active common-stock authority.
 */
export async function loadPublishedCandidateSymbols(client: Reader, cutoff: string): Promise<string[]> {
  ensure(Number.isFinite(instant(cutoff)), 'published_candidate_cutoff_invalid');
  const payloads = await Promise.all(WINDOWS.flatMap((window) => [
    readPublicWindow(client, window, cutoff), readLegacyWindow(client, window, cutoff),
  ]));
  const symbols = new Set<string>();
  for (const payload of payloads) if (payload) symbolsFromPayload(payload, symbols);
  return [...symbols].sort();
}
