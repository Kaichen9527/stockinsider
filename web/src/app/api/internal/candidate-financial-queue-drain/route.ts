import { NextResponse } from 'next/server';
import { refreshCandidateOfficialFinancials, type CandidateOfficialFinancial } from '@/lib/candidate-official-financials';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter, resolveLatestCompletedTaiwanSession } from '@/lib/taiwan-data-runtime';

const BODY_LIMIT = 10_000;
const MAX_DRAIN_LIMIT = 20;
const JOB_LOOKAHEAD_MULTIPLIER = 8;

function parseLimit(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).sort().join(',') !== 'limit') return null;
  const limit = (value as Record<string, unknown>).limit;
  return Number.isInteger(limit) && Number(limit) >= 1 && Number(limit) <= MAX_DRAIN_LIMIT ? Number(limit) : null;
}

export async function POST(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'unauthorized_internal_writer' }, { status: 401 });
  const raw = await request.text();
  if (Buffer.byteLength(raw, 'utf8') > BODY_LIMIT) return NextResponse.json({ ok: false, error: 'payload_too_large' }, { status: 413 });
  let body: unknown;
  try { body = JSON.parse(raw); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 422 }); }
  const limit = parseLimit(body);
  if (limit == null) return NextResponse.json({ ok: false, error: 'invalid_candidate_financial_drain_request' }, { status: 422 });

  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  const now = new Date().toISOString();
  const sessionDate = await resolveLatestCompletedTaiwanSession(writer.supabase, now.slice(0, 10));
  const jobs = await writer.supabase.from('candidate_financial_acquisition_jobs_v4')
    .select('stock_id,exchange,created_at')
    .eq('status', 'queued')
    .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
    .order('created_at', { ascending: true })
    .limit(limit * JOB_LOOKAHEAD_MULTIPLIER);
  if (jobs.error) return NextResponse.json({ ok: false, error: `candidate_financial_backlog_read_failed:${jobs.error.message}` }, { status: 500 });

  const exchangeByStock = new Map<string, CandidateOfficialFinancial['exchange']>();
  for (const row of jobs.data || []) {
    const stockId = String(row.stock_id || '');
    const exchange = String(row.exchange || '');
    if (stockId && (exchange === 'TWSE' || exchange === 'TPEX')) exchangeByStock.set(stockId, exchange);
  }
  const stockIds = [...exchangeByStock.keys()];
  if (stockIds.length === 0) return NextResponse.json({ ok: true, result: { sessionDate, claimed: 0, writtenFacts: 0, failures: [], releaseId: writer.releaseId } });
  const stocks = await writer.supabase.from('stocks').select('id,symbol').in('id', stockIds);
  if (stocks.error) return NextResponse.json({ ok: false, error: `candidate_financial_stock_read_failed:${stocks.error.message}` }, { status: 500 });
  const candidates = (stocks.data || []).flatMap((stock) => {
    const stockId = String(stock.id || '');
    const symbol = String(stock.symbol || '');
    const exchange = exchangeByStock.get(stockId);
    return exchange && /^\d{4}$/u.test(symbol) ? [{ stockId, symbol, exchange }] : [];
  });
  const result = await refreshCandidateOfficialFinancials(candidates, `${sessionDate}T13:30:00+08:00`, {
    enqueueMissing: false,
    maxJobs: limit,
  });
  return NextResponse.json({
    ok: result.failures.length === 0,
    result: { ...result, sessionDate, claimed: result.claimedJobs, releaseId: writer.releaseId },
  }, { status: result.failures.length === 0 ? 200 : 500 });
}
