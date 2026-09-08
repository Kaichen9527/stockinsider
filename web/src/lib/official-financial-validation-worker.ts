import { getOpportunityV3ServerClient } from './opportunity-v3/service-client.ts';
import { collectPagedAuthorityRows } from './candidate-research-policy.ts';
import { validateOfficialFinancialFact, type OfficialValidationRow } from './official-financial-validation.ts';

/** Called only from an authenticated VPS writer, never from a public reader. */
export async function validatePendingOfficialFinancials(stockIds: string[]) {
  const db = getOpportunityV3ServerClient();
  const counts = { checked: 0, validated: 0, rejected: 0, missingProvenance: 0 };
  for (const stockId of [...new Set(stockIds)].slice(0, 30)) {
    const evaluatedAt = new Date().toISOString();
    const facts = await collectPagedAuthorityRows<OfficialValidationRow>(async (from, to) => {
      const r = await db.from('opportunity_financial_facts_v3').select('*').eq('stock_id', stockId)
        .eq('authority_tier','official_filing').lte('recorded_at',evaluatedAt)
        .order('period_end').order('fact_id').range(from,to);
      if (r.error) throw new Error(`official_validation_read_failed:${r.error.message}`);
      return r.data || [];
    }, { pageSize: 500, maxRows: 10000 });
    // A truncated evidence set cannot support a consistency judgment.
    if (facts.length === 10000) throw new Error('official_validation_subject_overflow');
    const pending = facts.filter((fact) => fact.validation_status === 'pending');
    for (let offset = 0; offset < pending.length; offset += 100) {
      const batch = pending.slice(offset,offset + 100);
      const provenance = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('candidate_financial_fact_provenance_v4')
          .select('fact_id,source_url,source_sha256,locator').in('fact_id',batch.map((f) => String(f.fact_id)))
          .order('fact_id').order('source_sha256').range(from,to);
        if (r.error) throw new Error(`official_validation_provenance_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 5000 });
      if (provenance.length === 5000) throw new Error('official_validation_provenance_overflow');
      for (const fact of batch) {
        const source = provenance.find((p) => p.fact_id === fact.fact_id) || null;
        const receipt = validateOfficialFinancialFact(fact, facts, source, evaluatedAt);
        counts.checked++;
        if (receipt.reasons.includes('official_provenance_missing')) { counts.missingProvenance++; continue; }
        const result = await db.rpc('record_official_financial_validation', {
          p_fact_id: fact.fact_id, p_recorded_at: fact.recorded_at,
          p_source_sha256: source!.source_sha256, p_input_hash: receipt.inputHash, p_validation: receipt,
        });
        if (result.error) throw new Error(`official_validation_write_failed:${result.error.message}`);
        if (result.data === true) counts.validated++; else counts.rejected++;
      }
    }
  }
  return counts;
}
