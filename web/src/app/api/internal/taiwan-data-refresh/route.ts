import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import type { TaiwanDataset, TaiwanExchange } from '@/lib/taiwan-data-provider';
import { parseTaiwanQueueRequest, requireActiveVpsWriter, taiwanRefreshQueueKey } from '@/lib/taiwan-data-runtime';

const BODY_LIMIT = 100_000;
const DAILY_CLOSE_CANDIDATE_CAP = 280;

export async function POST(request: Request) {
  // These jobs are production writes. Cron-secret authentication is not enough:
  // the sole VPS writer owns the exact INTERNAL_API_KEY from its protected env.
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let requestBody: unknown;
  try { requestBody = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  const input = parseTaiwanQueueRequest(requestBody);
  if (!input) return NextResponse.json({ ok: false, error: 'invalid_taiwan_refresh_request' }, { status: 422 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  // Official valuation and revenue endpoints are exchange-wide batches. Only
  // price and statement requests are candidate-scoped; this prevents N
  // candidates from requesting the identical official response N times.
  // Financial history has its own durable, period-aware acquisition queue.
  // Enqueuing every candidate here on every close would duplicate that queue
  // and could never drain before the 21:00 final publication.
  const candidateScoped = new Set<TaiwanDataset>(['daily_price']);
  let symbols = input.symbols;
  if (symbols.length === 0 && input.datasets.some((dataset) => candidateScoped.has(dataset))) {
    const universe = await writer.supabase.rpc('read_taiwan_data_candidate_universe_v5', { p_limit: DAILY_CLOSE_CANDIDATE_CAP + 1 });
    if (universe.error) return NextResponse.json({ ok: false, error: `taiwan_candidate_universe_read_failed:${universe.error.message}` }, { status: 500 });
    const universeRows = (universe.data || []) as Array<{ symbol?: unknown; exchange?: unknown }>;
    if (universeRows.length > DAILY_CLOSE_CANDIDATE_CAP) {
      return NextResponse.json({ ok: false, error: 'taiwan_candidate_universe_exceeds_daily_close_capacity', result: { cap: DAILY_CLOSE_CANDIDATE_CAP, observedAtLeast: universeRows.length } }, { status: 503 });
    }
    symbols = universeRows.flatMap((row) => {
      const symbol = String(row.symbol || ''); const exchange = String(row.exchange || '');
      return /^\d{4}$/u.test(symbol) && (exchange === 'TWSE' || exchange === 'TPEX') ? [{ symbol, exchange: exchange as TaiwanExchange }] : [];
    });
  }
  const entries: Array<{ dataset: TaiwanDataset; symbol: string | null; exchange: TaiwanExchange }> = [];
  for (const dataset of input.datasets) {
    if (candidateScoped.has(dataset)) {
      entries.push(...symbols.map(({ symbol, exchange }) => ({ dataset, symbol, exchange })));
    } else if (dataset === 'trading_calendar') {
      entries.push({ dataset, symbol: null, exchange: 'TWSE' });
    } else {
      entries.push(...(['TWSE', 'TPEX'] as const).map((exchange) => ({ dataset, symbol: null, exchange })));
    }
  }
  if (entries.length > 20_000) return NextResponse.json({ ok: false, error: 'queue_limit_exceeded' }, { status: 422 });
  const queuedAt = new Date().toISOString();
  const queue = await Promise.all(entries.map(async (entry) => {
    const queueKey = taiwanRefreshQueueKey({ ...entry, phase: input.phase, sessionDate: input.sessionDate });
    const result = await writer.supabase.rpc('enqueue_taiwan_data_refresh_v5', {
      p_queue_key: queueKey, p_dataset: entry.dataset, p_symbol: entry.symbol, p_exchange: entry.exchange,
      p_refresh_phase: input.phase, p_requested_session_date: input.sessionDate, p_queued_at: queuedAt,
    });
    if (result.error) throw new Error(`taiwan_data_enqueue_failed:${result.error.message}`);
    return String(result.data);
  }));
  return NextResponse.json({ ok: true, result: { queued: queue.length, candidateUniverse: symbols.length, jobIds: queue, phase: input.phase, sessionDate: input.sessionDate, releaseId: writer.releaseId } });
}
