import { createHash } from 'node:crypto';
import {
  MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES,
  candidateFinancialDocumentObjectKey, isOfficialDocumentHost,
  parseCandidateFinancialDocumentMetadata, validateCandidateFinancialDocument,
  type CandidateFinancialDocumentMetadata,
} from './candidate-financial-documents.ts';
import { putCandidateFinancialArtifact } from './candidate-financial-artifact.ts';
import type { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';

/** Called only inside an authenticated writer. A successful HTTP download is
 * not a financial fact: the immutable receipt must pass the parser separately. */
export async function persistDownloadedFinancialDocument(
  db: ReturnType<typeof getOpportunityV3ServerClient>,
  input: { metadata: CandidateFinancialDocumentMetadata; bytes: Uint8Array; contentType: string; originalContentType?: string | null; writerReleaseId: string },
) {
  const metadata = parseCandidateFinancialDocumentMetadata(JSON.stringify(input.metadata));
  if (!metadata) throw new Error('invalid_candidate_financial_document_metadata');
  if (!input.bytes.byteLength || input.bytes.byteLength > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES) {
    throw new Error('candidate_financial_document_too_large');
  }
  if (!input.writerReleaseId) throw new Error('candidate_financial_document_writer_missing');
  const principal = metadata.acquisitionJobId ? fixedRunnerPrincipal() : null;
  if (metadata.acquisitionJobId && !principal) throw new Error('candidate_financial_runner_principal_missing');
  const stock = await db.from('stocks').select('id,symbol').eq('id', metadata.stockId).maybeSingle();
  if (stock.error || stock.data?.symbol !== metadata.symbol) throw new Error('candidate_financial_document_stock_mismatch');
  const host = new URL(metadata.sourceUrl).hostname.toLowerCase();
  if (!isOfficialDocumentHost(host)) {
    const domain = await db.from('candidate_issuer_document_domains_v6').select('host')
      .eq('stock_id', metadata.stockId).eq('host', host).maybeSingle();
    if (domain.error || !domain.data) throw new Error('issuer_document_domain_not_approved');
  }
  const verified = validateCandidateFinancialDocument({ bytes: input.bytes, contentType: input.contentType });
  if ('error' in verified) throw new Error(verified.error);
  const hash = createHash('sha256').update(input.bytes).digest('hex');
  const objectKey = candidateFinancialDocumentObjectKey({ stockId: metadata.stockId, periodEnd: metadata.periodEnd, sha256: hash });
  await putCandidateFinancialArtifact({ client: db, objectKey, sha256: hash,
    bytes: input.bytes, contentType: verified.normalizedContentType });
  const receipt = await db.rpc('record_candidate_financial_document_receipt_v6', {
    p_stock_id: metadata.stockId, p_acquisition_job_id: metadata.acquisitionJobId,
    p_source_url: metadata.sourceUrl, p_exchange: metadata.exchange, p_period_end: metadata.periodEnd,
    p_published_at: metadata.publishedAt, p_content_type: verified.normalizedContentType,
    p_document_sha256: hash, p_object_key: objectKey, p_byte_length: input.bytes.byteLength,
    p_metadata: { upload_format: verified.format, writer_release_id: input.writerReleaseId, acquisition: 'official_download',
      original_content_type: input.originalContentType ?? input.contentType,
      publication_time_basis: metadata.publishedAt === null ? 'unknown_first_observed_is_available_at' : 'supplied_publication_metadata' },
  });
  const row = Array.isArray(receipt.data) ? receipt.data[0] : receipt.data;
  if (receipt.error || !row) throw new Error(`candidate_financial_document_receipt_failed:${receipt.error?.message || 'missing'}`);
  if (metadata.acquisitionJobId) {
    const linked = await db.rpc('reconcile_candidate_financial_document_job_v9', {
      p_receipt_id:String(row.receipt_id),p_job_id:metadata.acquisitionJobId,p_caller_principal:principal,
    });
    if (linked.error) throw new Error(`candidate_financial_document_job_link_failed:${linked.error.message}`);
  }
  return { receiptId: String(row.receipt_id), status: String(row.receipt_status),
    idempotentReplay: row.idempotent_replay === true, documentSha256: hash, factWrites: 0 as const };
}
