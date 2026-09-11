import { createHash } from 'node:crypto';
import {
  CANDIDATE_FINANCIAL_DOCUMENT_BUCKET,
  MAX_CANDIDATE_FINANCIAL_DOCUMENT_BYTES,
  parseCandidateFinancialDocumentFacts,
  validateCandidateFinancialDocument,
} from './candidate-financial-documents.ts';
import { runCandidateFinancialLocalParser, type CandidateFinancialLocalParserResult } from './candidate-financial-local-parser.ts';
import { validatePendingOfficialFinancials } from './official-financial-validation-worker.ts';
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

export function filterArelleValidatedFacts(
  facts: ReturnType<typeof parseCandidateFinancialDocumentFacts>,
  parse: CandidateFinancialLocalParserResult,
) {
  const validated = new Map<string, Array<{
    value: number; unit: string; entityIdentifier: string; periodStart: string | null;
    periodEnd: string; durationKind: string; dimensionCount: number;
  }>>();
  for (const row of parse.validatedFacts || []) {
    const key = `${row.xbrl_context}\u0000${row.xbrl_concept}`;
    const values = validated.get(key) || [];
    values.push({ value: Number(row.value), unit: row.unit,
      entityIdentifier: row.entity_identifier, periodStart: row.period_start,
      periodEnd: row.period_end, durationKind: row.duration_kind,
      dimensionCount: row.dimension_count });
    validated.set(key, values);
  }
  return facts.filter((fact) => {
    const context = String(fact.locator?.xbrl_context || '');
    const concept = String(fact.locator?.xbrl_concept || '');
    const matches = validated.get(`${context}\u0000${concept}`) || [];
    return matches.some((match) => match.unit === fact.unit
      && match.entityIdentifier === fact.symbol
      && match.periodStart === fact.periodStart && match.periodEnd === fact.periodEnd
      && match.durationKind === fact.durationKind && match.dimensionCount === 0
      && Math.abs(match.value - fact.value) <= Math.max(1e-6, Math.abs(match.value) * 1e-12));
  });
}

function parserEvidence(parse: CandidateFinancialLocalParserResult, documentSha256: string) {
  return {
    schema: 'candidate-financial-parser-evidence-v8',
    documentSha256,
    parser: parse.parser,
    parserVersion: parse.parser === 'arelle' ? parse.runtimeVersion : `${parse.parser}-bounded-v1`,
    taxonomySha256: parse.parser === 'arelle' ? parse.taxonomySha256 : null,
    validation: parse.validation || null,
    validatedFacts: parse.validatedFacts || [],
  };
}

async function reconcilePendingDocumentValidations(client: ReturnType<typeof getOpportunityV3ServerClient>, owner: string) {
  const now = new Date().toISOString();
  const pending = await client.from('candidate_financial_document_receipts_v6')
    .select('receipt_id,stock_id').eq('financial_validation_status', 'pending')
    .or(`financial_validation_next_attempt_at.is.null,financial_validation_next_attempt_at.lte.${now}`)
    .order('financial_validation_next_attempt_at', { ascending: true, nullsFirst: true })
    .order('accepted_at').limit(20);
  if (pending.error) return [{ receiptId: null, error: `candidate_financial_validation_pending_read_failed:${pending.error.message}` }];
  const rows = (pending.data || []) as Row[];
  const errors: Array<{ receiptId: string | null; error: string }> = [];
  for (const stockId of [...new Set(rows.map((row) => String(row.stock_id || '')).filter(Boolean))]) {
    try { await validatePendingOfficialFinancials([stockId]); }
    catch (error) { errors.push({ receiptId: null, error: error instanceof Error ? error.message : 'candidate_financial_validation_failed' }); }
  }
  for (const row of rows) {
    const receiptId = String(row.receipt_id || '');
    try {
      const finalized = await client.rpc('finalize_candidate_financial_document_validation_v8', {
        p_receipt_id: receiptId, p_caller_principal: owner, p_completed_at: new Date().toISOString(),
      });
      if (finalized.error) throw new Error(`candidate_financial_validation_finalize_failed:${finalized.error.message}`);
      const finalizedRow = Array.isArray(finalized.data) ? finalized.data[0] as Row | undefined : finalized.data as Row | null;
      const status = String(finalizedRow?.validation_status || 'pending');
      if (status !== 'validated') throw new Error(`candidate_financial_validation_${status}`);
    } catch (error) {
      errors.push({ receiptId, error: error instanceof Error ? error.message : 'candidate_financial_validation_finalize_failed' });
    }
  }
  return errors;
}

export async function processCandidateFinancialDocumentReceipts(limit = 5) {
  const owner = fixedRunnerPrincipal();
  if (!owner) throw new Error('candidate_financial_document_runner_principal_missing');
  const client = getOpportunityV3ServerClient();
  const reconciliationErrors = await reconcilePendingDocumentValidations(client, owner);
  const now = new Date().toISOString();
  const claim = await client.rpc('claim_candidate_financial_document_receipts_v6', {
    p_limit: Math.max(1, Math.min(20, Math.floor(limit))), p_owner: owner,
    p_claimed_at: now, p_lease_expires_at: new Date(Date.now() + 20 * 60_000).toISOString(),
  });
  if (claim.error) throw new Error(`candidate_financial_document_claim_failed:${claim.error.message}`);
  const claimed = (claim.data || []) as Row[];
  const results: Array<{ receiptId: string; status: string; parser: string | null; locatorCount: number; error: string | null; missingRequirements?: string[]; rejectionReasons?: string[]; validation?: Awaited<ReturnType<typeof validatePendingOfficialFinancials>> }> = [];
  for (const receipt of claimed) {
    const receiptId = String(receipt.receipt_id || '');
    const completedAt = new Date().toISOString();
    let facts: ReturnType<typeof parseCandidateFinancialDocumentFacts> = [];
    const missing: string[] = [];
    let rejected: string[] = [];
    let localParse: CandidateFinancialLocalParserResult | null = null;
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
      // This adapter is a mandatory local validation boundary. It runs Arelle
      // for XBRL/iXBRL and pdfplumber for PDFs with no shell or network access.
      // A parser deployment gap remains a receipt gap; raw regex output must
      // never become financial facts without the independent local validator.
      localParse = await runCandidateFinancialLocalParser({
        bytes, documentSha256: String(receipt.document_sha256), format: verified.format,
        allowDocling: true,
      });
      missing.push(...localParse.missingRequirements);
      const stock = await client.from('stocks').select('id,symbol').eq('id', String(receipt.stock_id || '')).maybeSingle();
      if (stock.error || !stock.data || !/^\d{4,6}$/u.test(String(stock.data.symbol || ''))) throw new Error('document_stock_identity_missing');
      if (verified.format === 'xbrl' && localParse.locators.length > 0) {
        facts = filterArelleValidatedFacts(parseCandidateFinancialDocumentFacts({
          bytes, format: verified.format, documentSha256: String(receipt.document_sha256),
          candidate: {
            stockId: String(stock.data.id), symbol: String(stock.data.symbol),
            exchange: String(receipt.exchange) === 'TPEX' ? 'TPEX' : 'TWSE',
          },
          periodEnd: String(receipt.period_end), sourceUrl: String(receipt.source_url), collectedAt: completedAt,
        }), localParse);
      }
      if (verified.format !== 'xbrl') missing.push('structured_xbrl_or_validated_pdf_manifest_required');
      if (facts.length === 0) missing.push('no_verified_financial_facts_extracted');
    } catch (error) {
      const message = error instanceof Error ? error.message.slice(0, 240) : 'document_parser_failed';
      // A local-runtime outage is an acquisition gap, not proof that a valid
      // issuer file is malicious. Integrity/magic failures above remain reject.
      if (/^candidate_financial_local_parser_(?:not_configured|timeout|failed|spawn_failed|output_too_large|stdin_failed|socket_unavailable|invalid_json|invalid_shape|invalid_result)/u.test(message)) {
        missing.push(message);
      } else {
        rejected = [message];
      }
      facts = [];
    }
    const evidence = localParse ? parserEvidence(localParse, String(receipt.document_sha256 || '')) : {
      schema: 'candidate-financial-parser-evidence-v8', documentSha256: String(receipt.document_sha256 || ''),
      parser: null, parserVersion: null, taxonomySha256: null, validation: null, validatedFacts: [],
    };
    const result = await client.rpc('complete_candidate_financial_document_receipt_parser_v8', {
      p_receipt_id: receiptId, p_owner: owner, p_caller_principal: owner,
      p_facts: facts.map((fact) => ({ input: factInput(fact), locator: fact.locator || {} })),
      p_parser_locators: localParse?.locators || [],
      p_parser_evidence: evidence,
      p_missing_requirements: missing, p_rejection_reasons: rejected, p_completed_at: completedAt,
    });
    const row = Array.isArray(result.data) ? result.data[0] as Row | undefined : result.data as Row | null;
    if (result.error || !row) {
      results.push({ receiptId, status: 'error', parser: localParse?.parser || null, locatorCount: localParse?.locators.length || 0, error: result.error?.message || 'document_receipt_completion_failed' });
      continue;
    }
    try {
      const validation = facts.length > 0
        ? await validatePendingOfficialFinancials([String(receipt.stock_id || '')])
        : undefined;
      if (facts.length > 0) {
        const finalized = await client.rpc('finalize_candidate_financial_document_validation_v8', {
          p_receipt_id: receiptId, p_caller_principal: owner, p_completed_at: new Date().toISOString(),
        });
        if (finalized.error) throw new Error(`candidate_financial_validation_finalize_failed:${finalized.error.message}`);
        const finalizedRow = Array.isArray(finalized.data) ? finalized.data[0] as Row | undefined : finalized.data as Row | null;
        const finalValidationStatus = String(finalizedRow?.validation_status || 'pending');
        if (finalValidationStatus === 'pending') {
          results.push({ receiptId, status: 'validation_pending', parser: localParse?.parser || null,
            locatorCount: localParse?.locators.length || 0,
            missingRequirements: [...missing, 'official_fact_validation_pending'], rejectionReasons: rejected,
            validation, error: 'official_fact_validation_pending' });
          continue;
        }
        if (finalValidationStatus !== 'validated') {
          results.push({ receiptId, status: 'partial', parser: localParse?.parser || null,
            locatorCount: localParse?.locators.length || 0,
            missingRequirements: [...missing, 'official_fact_validation_rejected'], rejectionReasons: rejected,
            validation, error: `official_fact_validation_${finalValidationStatus}` });
          continue;
        }
        const receiptState = await client.from('candidate_financial_document_receipts_v6')
          .select('receipt_status').eq('receipt_id', receiptId).maybeSingle();
        if (receiptState.error || !receiptState.data) {
          throw new Error(`candidate_financial_validation_receipt_read_failed:${receiptState.error?.message || 'missing'}`);
        }
        row.receipt_status = receiptState.data.receipt_status;
      }
      const finalStatus = String(row.receipt_status || 'unknown');
      results.push({ receiptId, status: finalStatus, parser: localParse?.parser || null,
        locatorCount: localParse?.locators.length || 0, missingRequirements: missing, rejectionReasons: rejected,
        validation, error: null });
    } catch (error) {
      results.push({ receiptId, status: 'partial', parser: localParse?.parser || null,
        locatorCount: localParse?.locators.length || 0, missingRequirements: [...missing, 'official_fact_validation_failed'],
        rejectionReasons: rejected, error: error instanceof Error ? error.message.slice(0, 240) : 'official_fact_validation_failed' });
    }
  }
  return { claimed: claimed.length, reconciliationErrors, results };
}
