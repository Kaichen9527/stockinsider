import { createHash } from 'node:crypto';
import {
  CANDIDATE_FINANCIAL_DOCUMENT_BUCKET,
  MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES,
  parseCandidateFinancialDocumentFacts,
  validateCandidateFinancialDocument,
} from './candidate-financial-documents.ts';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';
import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';

type Row = Record<string, unknown>;

function sha256(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

function factInput(fact: ReturnType<typeof parseCandidateFinancialDocumentFacts>[number]) {
  return {
    stock_id: fact.stockId, fact_key: fact.factKey, period_start: fact.periodStart,
    period_end: fact.periodEnd, duration_kind: fact.durationKind, value: fact.value,
    unit: fact.unit, provider: fact.provider, authority_tier: fact.authorityTier,
    estimate_kind: fact.estimateKind, estimate_horizon: fact.estimateHorizon,
    filing_published_at: fact.filingPublishedAt, source_timestamp: fact.sourceTimestamp,
    collected_at: fact.collectedAt, filing_restatement_id: fact.filingRestatementId,
    source_ref: fact.sourceRef,
  };
}

export async function processCandidateFinancialDocumentReceipts(limit = 5) {
  const owner = fixedRunnerPrincipal();
  if (!owner) throw new Error('candidate_financial_document_runner_principal_missing');
  const client = getOpportunityV3ServerClient();
  const now = new Date().toISOString();
  const claim = await client.rpc('claim_candidate_financial_document_receipts_v6', {
    p_limit: Math.max(1, Math.min(20, Math.floor(limit))), p_owner: owner,
    p_claimed_at: now, p_lease_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  });
  if (claim.error) throw new Error(`candidate_financial_document_claim_failed:${claim.error.message}`);
  const claimed = (claim.data || []) as Row[];
  const results: Array<{ receiptId: string; status: string; error: string | null }> = [];
  for (const receipt of claimed) {
    const receiptId = String(receipt.receipt_id || '');
    const completedAt = new Date().toISOString();
    let facts: ReturnType<typeof parseCandidateFinancialDocumentFacts> = [];
    const missing: string[] = [];
    let rejected: string[] = [];
    try {
      const byteLength = Number(receipt.byte_length || 0);
      if (!receiptId || !Number.isInteger(byteLength) || byteLength < 1 || byteLength > MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES) {
        throw new Error('stored_document_metadata_invalid');
      }
      const object = await client.storage.from(CANDIDATE_FINANCIAL_DOCUMENT_BUCKET).download(String(receipt.object_key || ''));
      if (object.error || !object.data) throw new Error(`stored_document_download_failed:${object.error?.message || 'missing'}`);
      const bytes = new Uint8Array(await object.data.arrayBuffer());
      if (bytes.byteLength !== byteLength || sha256(bytes) !== String(receipt.document_sha256 || '')) {
        throw new Error('stored_document_hash_mismatch');
      }
      const verified = validateCandidateFinancialDocument({ bytes, contentType: String(receipt.content_type || '') });
      if ('error' in verified) throw new Error(verified.error);
      const stock = await client.from('stocks').select('id,symbol').eq('id', String(receipt.stock_id || '')).maybeSingle();
      if (stock.error || !stock.data || !/^\d{4,6}$/u.test(String(stock.data.symbol || ''))) throw new Error('document_stock_identity_missing');
      facts = parseCandidateFinancialDocumentFacts({
        bytes, format: verified.format, documentSha256: String(receipt.document_sha256),
        candidate: {
          stockId: String(stock.data.id), symbol: String(stock.data.symbol),
          exchange: String(receipt.exchange) === 'TPEX' ? 'TPEX' : 'TWSE',
        },
        periodEnd: String(receipt.period_end), sourceUrl: String(receipt.source_url), collectedAt: completedAt,
      });
      if (verified.format !== 'xbrl') missing.push('structured_xbrl_or_validated_pdf_manifest_required');
      if (facts.length === 0) missing.push('no_verified_financial_facts_extracted');
    } catch (error) {
      rejected = [error instanceof Error ? error.message.slice(0, 240) : 'document_parser_failed'];
      facts = [];
    }
    const result = await client.rpc('complete_candidate_financial_document_receipt_v6', {
      p_receipt_id: receiptId, p_owner: owner, p_caller_principal: owner,
      p_facts: facts.map((fact) => ({ input: factInput(fact), locator: fact.locator || {} })),
      p_missing_requirements: missing, p_rejection_reasons: rejected, p_completed_at: completedAt,
    });
    const row = Array.isArray(result.data) ? result.data[0] as Row | undefined : result.data as Row | null;
    if (result.error || !row) {
      results.push({ receiptId, status: 'error', error: result.error?.message || 'document_receipt_completion_failed' });
      continue;
    }
    results.push({ receiptId, status: String(row.receipt_status || 'unknown'), error: null });
  }
  return { claimed: claimed.length, results };
}
