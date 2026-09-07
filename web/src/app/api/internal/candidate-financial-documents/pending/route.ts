import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

export const runtime = 'nodejs';

export async function GET(request: Request) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  const rawLimit = new URL(request.url).searchParams.get('limit') || '5';
  if (!/^\d{1,2}$/u.test(rawLimit) || Number(rawLimit) < 1 || Number(rawLimit) > 20) {
    return NextResponse.json({ ok: false, error: 'invalid_pending_document_limit' }, { status: 422 });
  }
  // Issuer-document acquisition jobs are a separate, human/Browser-assisted
  // lane. They must not occupy the deterministic MOPS/TPEx queue lookahead.
  const acquisitionJobs = await writer.supabase.from('candidate_financial_acquisition_jobs_v4')
    .select('job_id,stock_id,exchange,period_end,status,source_url,terminal_detail,created_at')
    .eq('endpoint_key', 'issuer_ir_document').eq('status', 'queued')
    .order('created_at', { ascending: true }).limit(Number(rawLimit));
  if (acquisitionJobs.error) return NextResponse.json({ ok: false, error: `candidate_financial_pending_read_failed:${acquisitionJobs.error.message}` }, { status: 500 });
  const stockIds = [...new Set((acquisitionJobs.data || []).map((row) => String(row.stock_id || '')).filter(Boolean))];
  const [stocks, queueHints] = await Promise.all([
    stockIds.length ? writer.supabase.from('stocks').select('id,symbol,name').in('id', stockIds) : Promise.resolve({ data: [], error: null }),
    stockIds.length ? writer.supabase.from('candidate_issuer_ir_document_queue_v4')
      .select('document_id,stock_id,listing_source_url,document_url,title,published_at,mime_type,metadata,recorded_at')
      .in('stock_id', stockIds).eq('acquisition_status', 'queued').order('recorded_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (stocks.error || queueHints.error) return NextResponse.json({ ok: false, error: `candidate_financial_pending_join_failed:${stocks.error?.message || queueHints.error?.message}` }, { status: 500 });
  const stockById = new Map((stocks.data || []).map((row) => [String(row.id), row]));
  const queueByStock = new Map((queueHints.data || []).map((row) => [String(row.stock_id), row]));
  return NextResponse.json({
    ok: true,
    result: (acquisitionJobs.data || []).map((row) => ({
      acquisitionJobId: row.job_id,
      stockId: row.stock_id,
      exchange: row.exchange,
      periodEnd: row.period_end,
      officialFilingUrl: row.source_url,
      symbol: stockById.get(String(row.stock_id))?.symbol || null,
      companyName: stockById.get(String(row.stock_id))?.name || null,
      issuerDocumentHint: queueByStock.get(String(row.stock_id)) || null,
    })),
    releaseId: writer.releaseId,
  });
}
