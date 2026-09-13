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

// Facts written by the retired predecessor collectors before the provenance
// contract shipped cannot be reconstructed safely: the response bytes and
// row locators no longer exist. Keep those rows queryable for audit, but never
// let them become valuation authority or make every later drain fail forever.
// A fact written at or after this cutover remains a hard failure when proof is
// missing, so a regression in the current collector cannot be hidden here.
const LEGACY_PROVENANCE_CUTOVER = Date.parse('2026-09-01T00:00:00Z');
const LEGACY_PROVENANCE_SOURCE = /^(?:twse|tpex)-(?:mops-inline|openapi):/u;

export function isLegacyUnprovedFinancialFact(fact: OfficialValidationRow) {
  const recordedAt = Date.parse(String(fact.recorded_at || ''));
  return Number.isFinite(recordedAt) && recordedAt < LEGACY_PROVENANCE_CUTOVER
    && LEGACY_PROVENANCE_SOURCE.test(String(fact.source_ref || ''));
}

/** Called only from an authenticated VPS writer, never from a public reader. */
export async function validatePendingOfficialFinancials(stockIds: string[], dependencies: {
  client?: ReturnType<typeof getOpportunityV3ServerClient>;
  now?: () => Date;
  runnerPrincipal?: () => string | null;
} = {}) {
  const db = dependencies.client ?? getOpportunityV3ServerClient();
  const validatorPrincipal = dependencies.runnerPrincipal?.() ?? fixedRunnerPrincipal();
  if (!validatorPrincipal) throw new Error('official_validation_runner_principal_unavailable');
  const counts = { checked: 0, validated: 0, rejected: 0, missingProvenance: 0,
    legacyUnproved: 0, unchanged: 0, unchangedRejected: 0, failed: 0 };
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
    const cohorts = new Map<string, OfficialValidationRow[]>();
    for (const fact of subjects) {
      const key = [fact.period_start ?? '', fact.period_end ?? '', fact.duration_kind ?? '',
        fact.filing_restatement_id ?? '', fact.provider ?? ''].join('|');
      cohorts.set(key, [...(cohorts.get(key) ?? []), fact]);
    }
    for (const batch of cohorts.values()) {
      // Validation identities are period-local. Keeping an entire cohort in one
      // bounded read prevents page boundaries from hiding a duplicate or one
      // side of an accounting identity.
      if (batch.length > 200) throw new Error('official_validation_cohort_overflow');
      const factIds = batch.map((fact) => String(fact.fact_id));
      const provenance = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('candidate_financial_fact_provenance_v4')
          .select('fact_id,source_url,source_sha256,locator').in('fact_id',factIds)
          .order('fact_id').order('source_sha256').range(from,to);
        if (r.error) throw new Error(`official_validation_provenance_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 5000 });
      if (provenance.length === 5000) throw new Error('official_validation_provenance_overflow');
      const priorReceipts = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('official_financial_validation_receipts')
          .select('fact_id,input_hash,validator_version,validator_principal,effective_validation')
          .in('fact_id',factIds)
          .order('fact_id').order('receipt_sequence').range(from,to);
        if (r.error) throw new Error(`official_validation_receipt_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 10000 });
      if (priorReceipts.length === 10000) throw new Error('official_validation_receipt_overflow');
      const structuralLinks = await collectPagedAuthorityRows<OfficialValidationRow>(async (from,to) => {
        const r = await db.from('candidate_financial_document_fact_links_v8')
          .select('fact_id').in('fact_id',factIds).order('fact_id').range(from,to);
        if (r.error) throw new Error(`official_validation_structural_links_read_failed:${r.error.message}`);
        return r.data || [];
      }, { pageSize: 500, maxRows: 5000 });
      if (structuralLinks.length === 5000) throw new Error('official_validation_structural_links_overflow');
      const structurallyLinked = new Set(structuralLinks.map((row) => String(row.fact_id)));
      const latestTrustedReceipt = new Map<string, OfficialValidationRow>();
      for (const receipt of priorReceipts) {
        if (receipt.validator_version === 'official-financial-v2' && typeof receipt.validator_principal === 'string') {
          latestTrustedReceipt.set(String(receipt.fact_id), receipt);
        }
      }
      const acceptedHashes = new Set([...latestTrustedReceipt.values()].filter((receipt) =>
        (receipt.effective_validation as OfficialValidationRow | null)?.validation_status === 'validated')
        .map((receipt) => `${receipt.fact_id}:${receipt.input_hash}`));
      const peerFacts = batch.filter((peer) => {
        const latest = latestTrustedReceipt.get(String(peer.fact_id));
        if (latest) return (latest.effective_validation as OfficialValidationRow | null)?.validation_status === 'validated';
        return !String(peer.source_ref || '').startsWith('issuer-document:')
          || structurallyLinked.has(String(peer.fact_id));
      });
      for (const fact of batch) {
        const rawSource = provenance.find((p) => p.fact_id === fact.fact_id) || null;
        let source = rawSource;
        if (rawSource) {
          let host = '';
          try { host = new URL(String(rawSource.source_url || '')).hostname.toLowerCase(); } catch { host = ''; }
          source = { ...rawSource, issuer_host_approved: approvedHosts.has(host) };
        }
        // The subject remains visible to its own shape/unit checks even when an
        // old issuer row has no structural link. Such a row then fails locally
        // at the SQL proof boundary instead of poisoning every valid peer.
        const peers = peerFacts.some((peer) => peer.fact_id === fact.fact_id)
          ? peerFacts : [...peerFacts, fact];
        const receipt = validateOfficialFinancialFact(fact, peers, source, evaluatedAt);
        counts.checked++;
        if (receipt.reasons.includes('official_provenance_missing')) {
          if (isLegacyUnprovedFinancialFact(fact)) counts.legacyUnproved++;
          else counts.missingProvenance++;
          continue;
        }
        const prior = latestTrustedReceipt.get(String(fact.fact_id));
        const priorStatus = (prior?.effective_validation as OfficialValidationRow | null)?.validation_status;
        if (prior?.input_hash === receipt.inputHash) {
          // The SQL authority boundary can reject an otherwise locally valid
          // fact (for example, because another persisted row conflicts).  Its
          // effective terminal state is the authoritative result for this
          // exact evidence hash.  Re-submitting the same hash cannot change
          // that result and only creates duplicate receipts on every drain.
          // A changed fact, peer set, provenance record, validator version or
          // accounting policy changes the hash and therefore re-enters RPC.
          if (priorStatus === 'rejected') { counts.unchangedRejected++; continue; }
          if (fact.validation_status === 'validated'
            && priorStatus === receipt.status
            && fact.schema_valid === true && fact.unit_valid === true && fact.point_in_time_valid === true
            && fact.consistency_valid === true && acceptedHashes.has(`${fact.fact_id}:${receipt.inputHash}`)) {
            counts.unchanged++; continue;
          }
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
