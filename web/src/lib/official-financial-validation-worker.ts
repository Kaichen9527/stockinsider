import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';
import { collectPagedAuthorityRows } from './candidate-research-policy.ts';
import { validateOfficialFinancialFact, officialFinancialValidationSubjects, type OfficialValidationRow } from './official-financial-validation.ts';
import { fixedRunnerPrincipal } from './opportunity-v3/internal.ts';

export type OfficialFinancialValidationFailure = {
  stockId: string;
  factId: string;
  recordedAt: string;
  status: 'failed';
  terminalReason: 'official_validation_structural_proof_missing';
};

/** Called only from an authenticated VPS writer, never from a public reader. */
export async function validatePendingOfficialFinancials(stockIds: string[], dependencies: {
  client?: ReturnType<typeof getOpportunityV3ServerClient>;
  now?: () => Date;
} = {}) {
  const db = dependencies.client ?? getOpportunityV3ServerClient();
  const validatorPrincipal = fixedRunnerPrincipal();
  if (!validatorPrincipal) throw new Error('official_validation_runner_principal_unavailable');
  const counts = { checked: 0, validated: 0, rejected: 0, missingProvenance: 0, unchanged: 0, failed: 0 };
  const failedItems: OfficialFinancialValidationFailure[] = [];
  for (const stockId of [...new Set(stockIds)]) {
    const evaluatedAt = (dependencies.now?.() ?? new Date()).toISOString();
    const domainRows = await db.from('candidate_issuer_document_domains_v6').select('host').eq('stock_id', stockId);
    if (domainRows.error) throw new Error(`official_validation_issuer_domains_read_failed:${domainRows.error.message}`);
    const approvedHosts = new Set((domainRows.data || []).map((row) => String(row.host || '').toLowerCase()));
    const facts = await collectPagedAuthorityRows<OfficialValidationRow>(async (from, to) => {
      const r = await db.from('opportunity_financial_facts_v3').select('*').eq('stock_id', stockId)
        .eq('authority_tier','official_filing').lte('recorded_at',evaluatedAt)
        .order('period_end').order('fact_id').range(from,to);
      if (r.error) throw new Error(`official_validation_read_failed:${r.error.message}`);
      return r.data || [];
    }, { pageSize: 500, maxRows: 10000 });
    // A truncated evidence set cannot support a consistency judgment.
    if (facts.length === 10000) throw new Error('official_validation_subject_overflow');
    const subjects = officialFinancialValidationSubjects(facts);
    for (let offset = 0; offset < subjects.length; offset += 100) {
      const batch = subjects.slice(offset,offset + 100);
      const provenance = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('candidate_financial_fact_provenance_v4')
          .select('fact_id,source_url,source_sha256,locator').in('fact_id',batch.map((f) => String(f.fact_id)))
          .order('fact_id').order('source_sha256').range(from,to);
        if (r.error) throw new Error(`official_validation_provenance_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 5000 });
      if (provenance.length === 5000) throw new Error('official_validation_provenance_overflow');
      const priorReceipts = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('official_financial_validation_receipts')
          .select('fact_id,input_hash,validator_version,validator_principal,effective_validation')
          .in('fact_id',batch.map((f) => String(f.fact_id)))
          .order('fact_id').order('receipt_sequence').range(from,to);
        if (r.error) throw new Error(`official_validation_receipt_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 10000 });
      if (priorReceipts.length === 10000) throw new Error('official_validation_receipt_overflow');
      const acceptedHashes = new Set(priorReceipts.filter((r) =>
        r.validator_version === 'official-financial-v2' && typeof r.validator_principal === 'string'
        && (r.effective_validation as OfficialValidationRow | null)?.validation_status === 'validated')
        .map((r) => `${r.fact_id}:${r.input_hash}`));
      for (const fact of batch) {
        const rawSource = provenance.find((p) => p.fact_id === fact.fact_id) || null;
        let source = rawSource;
        if (rawSource) {
          let host = '';
          try { host = new URL(String(rawSource.source_url || '')).hostname.toLowerCase(); } catch { host = ''; }
          source = { ...rawSource, issuer_host_approved: approvedHosts.has(host) };
        }
        const receipt = validateOfficialFinancialFact(fact, facts, source, evaluatedAt);
        counts.checked++;
        if (receipt.reasons.includes('official_provenance_missing')) { counts.missingProvenance++; continue; }
        if (fact.validation_status === 'validated' && receipt.status === 'validated'
          && fact.schema_valid === true && fact.unit_valid === true && fact.point_in_time_valid === true
          && fact.consistency_valid === true && acceptedHashes.has(`${fact.fact_id}:${receipt.inputHash}`)) {
          counts.unchanged++; continue;
        }
        const result = await db.rpc('record_official_financial_validation', {
          p_fact_id: fact.fact_id, p_recorded_at: fact.recorded_at,
          p_source_sha256: source!.source_sha256, p_input_hash: receipt.inputHash, p_validation: receipt,
          p_validator_principal: validatorPrincipal,
        });
        if (result.error) {
          // Old issuer-document rows may predate the fact-level parser link.
          // Do not credit that fact as validated: expose a failed item without
          // cancelling unrelated facts that possess the required proof. Only
          // this exact SQL guard is fact-local; auth/DB/other errors stay fatal.
          if (result.error.code === 'P0001'
            && result.error.message === 'official_validation_structural_proof_missing'
            && String(fact.source_ref).startsWith('issuer-document:')) {
            counts.failed++;
            failedItems.push({ stockId, factId: String(fact.fact_id), recordedAt: String(fact.recorded_at),
              status: 'failed', terminalReason: 'official_validation_structural_proof_missing' });
            continue;
          }
          throw new Error(`official_validation_write_failed:${result.error.message}`);
        }
        if (result.data === true) counts.validated++; else counts.rejected++;
      }
    }
  }
  return { ...counts, failedItems,
    status: counts.failed > 0 || counts.rejected > 0 || counts.missingProvenance > 0 ? 'partial' as const : 'success' as const };
}
