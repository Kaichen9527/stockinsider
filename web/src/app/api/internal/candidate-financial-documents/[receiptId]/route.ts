import { NextResponse } from 'next/server';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';

export const runtime = 'nodejs';

export async function GET(request: Request, context: { params: Promise<{ receiptId: string }> }) {
  if (!requireExactInternalBearer(request)) return NextResponse.json({ ok: false, error: 'exact_internal_bearer_required' }, { status: 401 });
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return NextResponse.json({ ok: false, error: writer.error }, { status: 409 });
  const { receiptId } = await context.params;
  if (!/^[0-9a-f-]{36}$/iu.test(receiptId)) return NextResponse.json({ ok: false, error: 'invalid_candidate_financial_document_receipt_id' }, { status: 422 });
  const receipt = await writer.supabase.from('candidate_financial_document_receipts_v6')
    .select('receipt_id,stock_id,acquisition_job_id,source_url,period_end,content_type,document_sha256,byte_length,receipt_status,parser_status,added_fact_count,duplicate_fact_count,missing_requirements,rejection_reasons,accepted_at,completed_at')
    .eq('receipt_id', receiptId).maybeSingle();
  if (receipt.error) return NextResponse.json({ ok: false, error: `candidate_financial_document_receipt_read_failed:${receipt.error.message}` }, { status: 500 });
  if (!receipt.data) return NextResponse.json({ ok: false, error: 'candidate_financial_document_receipt_not_found' }, { status: 404 });
  return NextResponse.json({ ok: true, receipt: receipt.data });
}
