import { NextResponse } from 'next/server';
import {
  CANDIDATE_FINANCIAL_DOCUMENT_BUCKET,
  candidateFinancialDocumentObjectKey,
  isOfficialDocumentHost,
  MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES,
  parseCandidateFinancialDocumentMetadata,
  readBoundedCandidateFinancialDocument,
  validateCandidateFinancialDocument,
} from '@/lib/candidate-financial-documents';
import { requireExactInternalBearer } from '@/lib/internal-auth';
import { requireActiveVpsWriter } from '@/lib/taiwan-data-runtime';
import { fixedRunnerPrincipal } from '@/lib/opportunity-v3/internal';

export const runtime = 'nodejs';

function error(status: number, message: string) {
  return NextResponse.json({ ok: false, error: message }, { status });
}

async function requireWriter(request: Request) {
  if (!requireExactInternalBearer(request)) return { response: error(401, 'exact_internal_bearer_required') };
  const writer = await requireActiveVpsWriter();
  if (!writer.ok) return { response: error(409, writer.error) };
  return { writer };
}

export async function POST(request: Request) {
  const identity = await requireWriter(request);
  if ('response' in identity) return identity.response;
  const contentLength = request.headers.get('content-length');
  if (contentLength && (!/^\d+$/u.test(contentLength) || Number(contentLength) > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES)) {
    return error(413, 'candidate_financial_document_too_large');
  }
  const metadata = parseCandidateFinancialDocumentMetadata(request.headers.get('x-candidate-financial-document-metadata'));
  if (!metadata) return error(422, 'invalid_candidate_financial_document_metadata');
  const runnerPrincipal = metadata.acquisitionJobId ? fixedRunnerPrincipal() : null;
  if (metadata.acquisitionJobId && !runnerPrincipal) return error(503, 'candidate_financial_document_runner_principal_missing');
  const stock = await identity.writer.supabase.from('stocks').select('id,symbol').eq('id', metadata.stockId).maybeSingle();
  if (stock.error || !stock.data || String(stock.data.symbol || '') !== metadata.symbol) {
    return error(stock.error ? 500 : 422, stock.error?.message || 'candidate_financial_document_stock_mismatch');
  }
  const host = new URL(metadata.sourceUrl).hostname.toLowerCase();
  if (!isOfficialDocumentHost(host)) {
    const approved = await identity.writer.supabase.from('candidate_issuer_document_domains_v6')
      .select('host').eq('stock_id', metadata.stockId).eq('host', host).maybeSingle();
    if (approved.error) return error(500, `candidate_financial_document_domain_read_failed:${approved.error.message}`);
    if (!approved.data) return error(422, 'issuer_document_domain_not_approved');
  }
  let stored;
  try {
    stored = await readBoundedCandidateFinancialDocument(request.body);
  } catch (cause) {
    return error(String(cause).includes('too_large') ? 413 : 422, cause instanceof Error ? cause.message : 'candidate_financial_document_read_failed');
  }
  const verified = validateCandidateFinancialDocument({ bytes: stored.bytes, contentType: request.headers.get('content-type') });
  if ('error' in verified) return error(422, verified.error);
  const objectKey = candidateFinancialDocumentObjectKey({ stockId: metadata.stockId, periodEnd: metadata.periodEnd, sha256: stored.sha256 });
  // Copy into an ArrayBuffer-backed view: Node's Uint8Array type may also
  // describe SharedArrayBuffer, which Storage's Blob body intentionally rejects.
  const uploadBytes = new Uint8Array(stored.byteLength);
  uploadBytes.set(stored.bytes);
  const upload = await identity.writer.supabase.storage.from(CANDIDATE_FINANCIAL_DOCUMENT_BUCKET).upload(
    objectKey, new Blob([uploadBytes.buffer], { type: verified.normalizedContentType }),
    { contentType: verified.normalizedContentType, upsert: false },
  );
  // A content-addressed replay has the same receipt identity. Do not overwrite
  // immutable private evidence just because the worker retried the request.
  if (upload.error && !/already exists|duplicate/iu.test(upload.error.message)) {
    return error(500, `candidate_financial_document_storage_failed:${upload.error.message}`);
  }
  const receipt = await identity.writer.supabase.rpc('record_candidate_financial_document_receipt_v6', {
    p_stock_id: metadata.stockId, p_acquisition_job_id: metadata.acquisitionJobId,
    p_source_url: metadata.sourceUrl, p_exchange: metadata.exchange, p_period_end: metadata.periodEnd,
    p_published_at: metadata.publishedAt, p_content_type: verified.normalizedContentType,
    p_document_sha256: stored.sha256, p_object_key: objectKey, p_byte_length: stored.byteLength,
    p_metadata: { upload_format: verified.format, writer_release_id: identity.writer.releaseId },
  });
  const row = Array.isArray(receipt.data) ? receipt.data[0] : receipt.data;
  if (receipt.error || !row) return error(500, `candidate_financial_document_receipt_failed:${receipt.error?.message || 'missing'}`);
  if (metadata.acquisitionJobId) {
    // Includes idempotent receipt replays: its original acquisition_job_id is
    // immutable and must not hide the job associated with this upload.
    const linked = await identity.writer.supabase.rpc('reconcile_candidate_financial_document_job_v9', {
      p_receipt_id: row.receipt_id, p_job_id: metadata.acquisitionJobId, p_caller_principal: runnerPrincipal,
    });
    if (linked.error) return error(500, `candidate_financial_document_job_reconciliation_failed:${linked.error.message}`);
  }
  return NextResponse.json({
    ok: true, receiptId: row.receipt_id, status: row.receipt_status,
    idempotentReplay: row.idempotent_replay === true,
  }, { status: 202 });
}

export async function GET(request: Request) {
  const identity = await requireWriter(request);
  if ('response' in identity) return identity.response;
  const receiptId = new URL(request.url).searchParams.get('receiptId') || '';
  if (!/^[0-9a-f-]{36}$/iu.test(receiptId)) return error(422, 'invalid_candidate_financial_document_receipt_id');
  const receipt = await identity.writer.supabase.from('candidate_financial_document_receipts_v6')
    .select('receipt_id,stock_id,acquisition_job_id,source_url,period_end,content_type,document_sha256,byte_length,receipt_status,parser_status,added_fact_count,duplicate_fact_count,missing_requirements,rejection_reasons,accepted_at,completed_at')
    .eq('receipt_id', receiptId).maybeSingle();
  if (receipt.error) return error(500, `candidate_financial_document_receipt_read_failed:${receipt.error.message}`);
  if (!receipt.data) return error(404, 'candidate_financial_document_receipt_not_found');
  return NextResponse.json({ ok: true, receipt: receipt.data });
}
