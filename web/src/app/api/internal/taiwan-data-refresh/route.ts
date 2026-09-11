import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { needsCompletedTradingSession } from '@/lib/taiwan-data-provider';
import { parseTaiwanQueueRequest, requireActiveVpsWriter, resolveLatestCompletedTaiwanSession } from '@/lib/taiwan-data-runtime';
import { enqueueTaiwanRefreshScope, readTaiwanCandidateUniverse } from '@/lib/taiwan-candidate-refresh';

const BODY_LIMIT = 100_000;

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
  const hasExplicitSessionDate = Object.prototype.hasOwnProperty.call(requestBody, 'sessionDate');
  let sessionDate = input.sessionDate;
  if (!hasExplicitSessionDate && needsCompletedTradingSession(input.datasets)) {
    try {
      sessionDate = await resolveLatestCompletedTaiwanSession(writer.supabase, input.sessionDate);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'latest_completed_trading_session_missing';
      return NextResponse.json({ ok: false, error: message }, { status: message.startsWith('latest_completed_trading_session_read_failed:') ? 500 : 503 });
    }
  }
  // Official valuation and revenue endpoints are exchange-wide batches. Only
  // price and statement requests are candidate-scoped; this prevents N
  // candidates from requesting the identical official response N times.
  // Financial history has its own durable, period-aware acquisition queue.
  // Enqueuing every candidate here on every close would duplicate that queue
  // and could never drain before the 21:00 final publication.
  const queuedAt = new Date().toISOString();
  try {
    const symbols = input.symbols.length === 0 && input.datasets.includes('daily_price')
      ? await readTaiwanCandidateUniverse(writer.supabase, queuedAt) : input.symbols;
    const result = await enqueueTaiwanRefreshScope(writer.supabase, { ...input, sessionDate }, symbols, queuedAt);
    return NextResponse.json({ ok: result.enqueueComplete,
      ...(result.enqueueComplete ? {} : { error: 'taiwan_refresh_scope_enqueue_incomplete' }),
      result: { ...result, candidateUniverse: symbols.length, phase: input.phase, sessionDate, releaseId: writer.releaseId },
    }, { status: result.enqueueComplete ? 200 : 503 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'taiwan_refresh_enqueue_failed' }, { status: 500 });
  }
}
