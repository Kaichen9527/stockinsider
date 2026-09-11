import { taiwanRefreshQueueKey, type TaiwanQueueRequest } from './taiwan-data-runtime.ts';
import type { TaiwanDataset, TaiwanExchange } from './taiwan-data-provider.ts';

type RpcClient = { rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> };
export type TaiwanRefreshSymbol = { symbol: string; exchange: TaiwanExchange };
export type TaiwanRefreshEntry = { dataset: TaiwanDataset; symbol: string | null; exchange: TaiwanExchange };
export const TAIWAN_UNIVERSE_PAGE_SIZE = 200;
export const TAIWAN_ENQUEUE_BATCH_SIZE = 100;
const MAX_REFRESH_ENTRIES = 20_000;

/** Keyset pagination at one PIT cutoff. A provider-side page cap must not turn
 * a short nonempty page into an apparently complete universe. */
export async function readTaiwanCandidateUniverse(client: RpcClient, cutoff: string) {
  const symbols: TaiwanRefreshSymbol[] = [];
  let after = '';
  for (;;) {
    const result = await client.rpc('read_taiwan_data_candidate_universe_v6', {
      p_cutoff: cutoff, p_after_symbol: after, p_limit: TAIWAN_UNIVERSE_PAGE_SIZE,
    });
    if (result.error) throw new Error(`taiwan_candidate_universe_read_failed:${result.error.message}`);
    if (!Array.isArray(result.data)) throw new Error('taiwan_candidate_universe_invalid_page');
    if (result.data.length === 0) break;
    for (const value of result.data) {
      const row = value as Partial<TaiwanRefreshSymbol> | null;
      if (!row || typeof row.symbol !== 'string' || !/^\d{4}$/u.test(row.symbol)
        || !['TWSE', 'TPEX'].includes(String(row.exchange)) || row.symbol <= after) {
        throw new Error('taiwan_candidate_universe_invalid_order_or_identity');
      }
      after = row.symbol;
      symbols.push({ symbol: row.symbol, exchange: row.exchange as TaiwanExchange });
      if (symbols.length > MAX_REFRESH_ENTRIES) throw new Error('taiwan_candidate_universe_safety_bound_exceeded');
    }
  }
  return symbols;
}

export function taiwanRefreshEntries(input: TaiwanQueueRequest, symbols: TaiwanRefreshSymbol[]) {
  const entries: TaiwanRefreshEntry[] = [];
  for (const dataset of input.datasets) {
    if (dataset === 'daily_price') entries.push(...symbols.map(({ symbol, exchange }) => ({ dataset, symbol: String(symbol), exchange })));
    else if (dataset === 'trading_calendar') entries.push({ dataset, symbol: null, exchange: 'TWSE' });
    else entries.push(...(['TWSE', 'TPEX'] as const).map((exchange) => ({ dataset, symbol: null, exchange })));
  }
  const unique = [...new Map(entries.map((entry) => [`${entry.dataset}:${entry.exchange}:${entry.symbol || ''}`, entry])).values()]
    .sort((left, right) => `${left.dataset}:${left.exchange}:${left.symbol || ''}`.localeCompare(`${right.dataset}:${right.exchange}:${right.symbol || ''}`));
  if (unique.length > MAX_REFRESH_ENTRIES) throw new Error('taiwan_refresh_scope_safety_bound_exceeded');
  return unique;
}

/** Register the entire expected scope before the first bounded enqueue. A
 * failed later batch stays visible as missing work, including after restart. */
export async function enqueueTaiwanRefreshScope(client: RpcClient, input: TaiwanQueueRequest, symbols: TaiwanRefreshSymbol[], queuedAt: string) {
  const entries = taiwanRefreshEntries(input, symbols).map((entry) => ({ ...entry,
    queueKey: taiwanRefreshQueueKey({ ...entry, phase: input.phase, sessionDate: input.sessionDate }),
  }));
  const registered = await client.rpc('register_taiwan_data_refresh_scope_v6', {
    p_session_date: input.sessionDate, p_phase: input.phase, p_queue_keys: entries.map((entry) => entry.queueKey), p_cutoff: queuedAt,
  });
  if (registered.error) throw new Error(`taiwan_refresh_scope_registration_failed:${registered.error.message}`);
  const jobIds: string[] = [];
  const errors: Array<{ offset: number; count: number; error: string }> = [];
  for (let offset = 0; offset < entries.length; offset += TAIWAN_ENQUEUE_BATCH_SIZE) {
    const batch = entries.slice(offset, offset + TAIWAN_ENQUEUE_BATCH_SIZE);
    const queued = await client.rpc('enqueue_taiwan_data_refresh_batch_v6', {
      p_entries: batch, p_phase: input.phase, p_session_date: input.sessionDate, p_queued_at: queuedAt,
    });
    const result = queued.data as { queued?: number; jobIds?: unknown[] } | null;
    if (queued.error || result?.queued !== batch.length || !Array.isArray(result.jobIds) || result.jobIds.length !== batch.length
      || result.jobIds.some((id) => typeof id !== 'string' || id.length === 0)) {
      errors.push({ offset, count: batch.length, error: queued.error?.message || 'taiwan_enqueue_batch_receipt_invalid' });
      continue;
    }
    jobIds.push(...result.jobIds as string[]);
  }
  return { expected: entries.length, queued: jobIds.length, jobIds, errors, enqueueComplete: errors.length === 0 };
}

export type TaiwanDrainOptions = { limit: number; maxBatches: number; requireComplete: boolean; phase: 'preliminary' | 'final' | null; sessionDate: string | null };
export function parseTaiwanDrainOptions(value: unknown): TaiwanDrainOptions | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  if (Object.keys(row).some((key) => !['limit', 'maxBatches', 'requireComplete', 'phase', 'sessionDate'].includes(key))) return null;
  const maxBatches = row.maxBatches ?? 1;
  const requireComplete = row.requireComplete ?? false;
  const phase = row.phase ?? null;
  const sessionDate = row.sessionDate ?? null;
  if (!Number.isInteger(row.limit) || Number(row.limit) < 1 || Number(row.limit) > 100
    || !Number.isInteger(maxBatches) || Number(maxBatches) < 1 || Number(maxBatches) > 30
    || typeof requireComplete !== 'boolean' || (phase !== null && phase !== 'preliminary' && phase !== 'final')
    || (sessionDate !== null && (typeof sessionDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(sessionDate)
      || !Number.isFinite(Date.parse(`${sessionDate}T00:00:00Z`)) || new Date(`${sessionDate}T00:00:00Z`).toISOString().slice(0, 10) !== sessionDate))
    || (requireComplete && phase === null) || (sessionDate !== null && phase === null)) return null;
  return { limit: Number(row.limit), maxBatches: Number(maxBatches), requireComplete, phase, sessionDate: sessionDate as string | null };
}

export type TaiwanRefreshProgress = { expected: number; completed: number; failed: number; queued: number; running: number; missing: number; retrying: number; ready: boolean };
export function isTaiwanRefreshComplete(value: unknown): value is TaiwanRefreshProgress {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['expected', 'completed', 'failed', 'queued', 'running', 'missing', 'retrying'].every((key) => Number.isInteger(row[key]) && Number(row[key]) >= 0)
    && Number(row.expected) > 0 && row.completed === row.expected && row.ready === true
    && ['failed', 'queued', 'running', 'missing', 'retrying'].every((key) => row[key] === 0);
}

/** Research must account for the full queue, but a terminal individual stock
 * gap belongs to that stock's fail-closed research result. It must not prevent
 * every other candidate from being researched. Aggregate failures stay critical. */
export function isTaiwanRefreshResearchReady(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return ['expected', 'completed', 'failed', 'failedCandidate', 'failedCritical', 'queued', 'running', 'missing', 'retrying']
    .every((key) => Number.isInteger(row[key]) && Number(row[key]) >= 0)
    && Number(row.expected) > 0 && row.expected === Number(row.completed) + Number(row.failed)
    && row.failed === row.failedCandidate && row.failedCritical === 0
    && row.settled === true && row.researchReady === true
    && ['queued', 'running', 'missing', 'retrying'].every((key) => row[key] === 0);
}
