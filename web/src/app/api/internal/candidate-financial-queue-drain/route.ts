import { NextResponse } from 'next/server';
import { refreshCandidateOfficialFinancials, type CandidateOfficialFinancial } from '@/lib/candidate-official-financials';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter, resolveLatestCompletedTaiwanSession } from '@/lib/taiwan-data-runtime';
import { validatePendingOfficialFinancials } from '@/lib/official-financial-validation-worker';
import type { SupabaseClient } from '@supabase/supabase-js';

const BODY_LIMIT = 10_000;
// The acquisition layer keeps MOPS at two concurrent requests and caps each
// TPEx endpoint claim at 60. A larger batch therefore improves backlog
// throughput without increasing the per-provider concurrency ceiling.
const MAX_DRAIN_LIMIT = 240;
const JOB_PAGE_SIZE = 1_000;
const MAX_JOB_SCAN_ROWS = 10_000;

function parseLimit(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value as Record<string, unknown>).sort().join(',') !== 'limit') return null;
  const limit = (value as Record<string, unknown>).limit;
  return Number.isInteger(limit) && Number(limit) >= 1 && Number(limit) <= MAX_DRAIN_LIMIT ? Number(limit) : null;
}

async function readDueFinancialJobs(client: SupabaseClient, now: string) {
  const rows: Array<{ stock_id: unknown; exchange: unknown; created_at: unknown }> = [];
  for (let offset = 0; offset < MAX_JOB_SCAN_ROWS; offset += JOB_PAGE_SIZE) {
    const page = await client.from('candidate_financial_acquisition_jobs_v4')
      .select('stock_id,exchange,created_at')
      .eq('status', 'queued')
      .neq('endpoint_key', 'issuer_ir_document')
      .or(`next_attempt_at.is.null,next_attempt_at.lte.${now}`)
      .order('created_at', { ascending: true })
      .order('job_id', { ascending: true })
      .range(offset, offset + JOB_PAGE_SIZE - 1);
    if (page.error) throw new Error(`candidate_financial_backlog_read_failed:${page.error.message}`);
    rows.push(...(page.data || []));
    if ((page.data || []).length < JOB_PAGE_SIZE) return rows;
  }
  throw new Error('candidate_financial_backlog_scan_limit_exceeded');
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
  let jobs: Awaited<ReturnType<typeof readDueFinancialJobs>>;
  try { jobs = await readDueFinancialJobs(writer.supabase, now); }
  catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'candidate_financial_backlog_read_failed' }, { status: 500 });
  }

  const exchangeByStock = new Map<string, CandidateOfficialFinancial['exchange']>();
  for (const row of jobs) {
    const stockId = String(row.stock_id || '');
    const exchange = String(row.exchange || '');
    if (stockId && (exchange === 'TWSE' || exchange === 'TPEX')) exchangeByStock.set(stockId, exchange);
  }
  const stockIds = [...exchangeByStock.keys()];
  if (stockIds.length === 0) return NextResponse.json({ ok: true, result: { sessionDate, claimed: 0, writtenFacts: 0, failures: [], releaseId: writer.releaseId } });
  const stocks = await writer.supabase.from('stocks').select('id,symbol,name,sector').in('id', stockIds);
  if (stocks.error) return NextResponse.json({ ok: false, error: `candidate_financial_stock_read_failed:${stocks.error.message}` }, { status: 500 });
  const instruments = await writer.supabase.from('stock_instruments_v3')
    .select('stock_id,valid_from,recorded_at,source_timestamp')
    .in('stock_id', stockIds)
    .eq('listing_status', 'active')
    .eq('instrument_type', 'common_stock')
    .lte('recorded_at', now)
    .lte('source_timestamp', now)
    .lte('valid_from', now)
    .or(`valid_to.is.null,valid_to.gt.${now}`)
    .order('stock_id')
    .order('recorded_at', { ascending: false })
    .order('source_timestamp', { ascending: false })
    .limit(1_000);
  if (instruments.error) return NextResponse.json({ ok: false, error: `candidate_financial_listing_authority_read_failed:${instruments.error.message}` }, { status: 500 });
  const listedOnByStock = new Map<string, string>();
  for (const instrument of instruments.data || []) {
    const stockId = String(instrument.stock_id || '');
    const validFrom = String(instrument.valid_from || '');
    if (stockId && !listedOnByStock.has(stockId) && /^\d{4}-\d{2}-\d{2}/u.test(validFrom)) {
      listedOnByStock.set(stockId, validFrom);
    }
  }
  const candidates = (stocks.data || []).flatMap((stock) => {
    const stockId = String(stock.id || '');
    const symbol = String(stock.symbol || '');
    const exchange = exchangeByStock.get(stockId);
    return exchange && /^\d{4}$/u.test(symbol) ? [{ stockId, symbol, exchange, listedOn: listedOnByStock.get(stockId) || null,
      statementKind: /證券|期貨|securities|futures/iu.test(`${stock.name || ''} ${stock.sector || ''}`) ? 'broker' as const : 'general' as const }] : [];
  });
  const result = await refreshCandidateOfficialFinancials(candidates, `${sessionDate}T13:30:00+08:00`, {
    enqueueMissing: false,
    maxJobs: limit,
  });
  const validation = await validatePendingOfficialFinancials(candidates.map((stock) => stock.stockId));
  const ok = result.failures.length === 0 && validation.status === 'success';
  return NextResponse.json({
    ok,
    ...(!ok ? { error: validation.status !== 'success' ? 'official_validation_incomplete' : 'candidate_financial_acquisition_failures' } : {}),
    result: { ...result, validation, sessionDate, claimed: result.claimedJobs, releaseId: writer.releaseId },
  }, { status: ok ? 200 : 500 });
}
