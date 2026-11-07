/** Cached observations for the existing operator audit. This is deliberately
 * not a publication qualification producer: no proof, expiry or writer call. */
import type { getSupabaseServerClient } from '../supabase-server.ts';
import type { TwEntryHistoricalAuthorityResult } from '../tw-entry-plan-authority.ts';
import { resolveFinancialEvidenceSources } from './financial-evidence-sources.ts';
import { historicalPriceFactors, currentPriceEvidence } from './cached-price-factors.ts';
import { inputHash } from './policy.ts';
import type { Evidence } from './research.ts';
import type { AuditQuote } from './thesis-audit.ts';
import {evidenceInstant as micros,evidenceKnownAt as known} from './evidence-clock.ts';
type Row = Record<string, unknown>;
type Client = Pick<ReturnType<typeof getSupabaseServerClient>, 'rpc' | 'from'>;
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/iu;
const hash = /^[a-f0-9]{64}$/u;
/** Existing readers attest these narrower scopes only. None returns the
 * published-revision authority at the weekly audit's shared cutoff. Keep this
 * a closed refusal inventory, rather than accepting a caller qualification. */
export type WeeklyFormalAuthorityGap =
  | 'financial_structural_hidden_newer_revision_unknown'
  | 'published_financial_current_rights_authority_missing'
  | 'published_action_target_authority_missing'
  | 'published_price_dataset_binding_authority_missing'
  | 'published_weekly_single_cutoff_authority_missing'
  | 'published_requalification_protocol_unavailable';
export type WeeklyFormalEligibility = {
  status: 'blocked';
  authorityScope: 'cached_comparison_only';
  publication: 'missing' | 'binding_invalid' | 'input_changed' | 'input_matches';
  financialComparison: 'available' | 'unavailable';
  priceComparison: 'available' | 'unavailable';
  missingAuthority: WeeklyFormalAuthorityGap[];
};
const missingWeeklyAuthority: WeeklyFormalAuthorityGap[] = [
  'financial_structural_hidden_newer_revision_unknown',
  'published_financial_current_rights_authority_missing',
  'published_action_target_authority_missing',
  'published_price_dataset_binding_authority_missing',
  'published_weekly_single_cutoff_authority_missing',
  'published_requalification_protocol_unavailable',
];
export type CurrentFinancialCache = {
  cutoff: string; stockIds: string[]; evidence: Evidence[];
  revisions: Array<{ stockId: string; factId: string; recordedAt: string; validationRecordedAt: string; restatementId: string | null; contentHash: string }>;
  receipts: Row[]; gaps: string[];
};
/** The original service-role as-of reader applies validation/structural proofs.
 * The extra row detects truncation; never treat a full page as complete. */
export async function readCurrentFinancialCache(client: Client, stockIds: string[], cutoff: string): Promise<CurrentFinancialCache> {
  if (!known(cutoff, new Date().toISOString()) || stockIds.length > 20 || new Set(stockIds).size !== stockIds.length || stockIds.some(id => !uuid.test(id))) throw Error('vnext_current_evidence_scope');
  const base: CurrentFinancialCache = { cutoff, stockIds: [...stockIds], evidence: [], revisions: [], receipts: [], gaps: [] };
  if (!stockIds.length) return base;
  try {
    const result = await client.rpc('read_financial_facts_for_stocks_as_of', { p_cutoff: cutoff, p_stock_ids: stockIds }).limit(2001);
    if (result.error || !Array.isArray(result.data)) throw Error('financial_cache_unavailable');
    if (result.data.length > 2000) throw Error('financial_cache_bound_exceeded');
    const heads = new Map<string, Row>();
    // Select the latest revision BEFORE validation. A withdrawn/invalid newer
    // correction must never fall back to an older validated value.
    for (const row of result.data as Row[]) {
      if (!stockIds.includes(String(row.stock_id)) || !uuid.test(String(row.fact_id)) || !known(row.recorded_at, cutoff)) throw Error('financial_cache_binding_invalid');
      // Unit/start/duration are revision content, not separate identities: a
      // correction to one of them must supersede the preceding cache row too.
      const key = JSON.stringify([row.stock_id, row.fact_key, row.period_end, row.estimate_kind, row.estimate_horizon]);
      const previous = heads.get(key);
      if (!previous || micros(row.recorded_at)! > micros(previous.recorded_at)!) heads.set(key, row);
      else if (micros(row.recorded_at) === micros(previous.recorded_at) && inputHash(row) !== inputHash(previous)) throw Error('financial_revision_conflict');
    }
    const selected = [...heads.values()];
    const valid = selected.filter(row => ['source_timestamp', 'collected_at', 'recorded_at', 'validation_recorded_at'].every(key => known(row[key], cutoff))
      && micros(row.source_timestamp)! <= micros(row.collected_at)! && micros(row.collected_at)! <= micros(row.recorded_at)!);
    const sources = await resolveFinancialEvidenceSources(client, valid, cutoff);
    if (sources.evidence.some(e => !known(e.eventAt, cutoff) || !known(e.availableAt, cutoff)) || sources.receipts.some(r => !known(r.factRecordedAt, cutoff) || !known(r.knownAt, cutoff))) throw Error('financial_source_cache_clock_invalid');
    const accepted = new Set(sources.evidence.map(e => e.id));
    return { ...base, evidence: sources.evidence, receipts: sources.receipts,
      revisions: valid.filter(row => accepted.has(String(row.fact_id))).map(row => ({ stockId: String(row.stock_id), factId: String(row.fact_id), recordedAt: String(row.recorded_at), validationRecordedAt: String(row.validation_recorded_at), restatementId: typeof row.filing_restatement_id === 'string' ? row.filing_restatement_id : null, contentHash: inputHash(row) })),
      gaps: [...(valid.length < selected.length ? ['financial_revision_clock_invalid'] : []), ...sources.gaps, ...(!sources.evidence.length ? ['financial_cache_missing'] : [])] };
  } catch (error) {
    // Only typed refusal codes leave this boundary; provider/client messages can
    // contain endpoint or credential context and are never part of the envelope.
    const reason = error instanceof Error && /^(financial_cache_(unavailable|bound_exceeded|binding_invalid)|financial_revision_conflict|financial_source_cache_clock_invalid)$/u.test(error.message) ? error.message : 'financial_source_cache_unavailable';
    return { ...base, gaps: [reason] };
  }
}

export function currentEvidenceRead(input: {
  symbol: string; stockId: string; inputHash: string; revisionId: string | null; publishedInputHash: string | null;
  cutoff: string; signalSession: string; financial: CurrentFinancialCache; history: TwEntryHistoricalAuthorityResult | null;
  original: Evidence[];
}) {
  const { financial, history, cutoff } = input;
  const bindingValid = /^\d{4}$/u.test(input.symbol) && uuid.test(input.stockId) && hash.test(input.inputHash)
    && (input.revisionId === null && input.publishedInputHash === null || uuid.test(input.revisionId || '') && hash.test(input.publishedInputHash || ''))
    && known(cutoff, new Date().toISOString()) && financial.cutoff === cutoff && financial.stockIds.includes(input.stockId);
  const revisions = bindingValid ? financial.revisions.filter(r => r.stockId === input.stockId) : [];
  const ids = new Set(revisions.map(r => r.factId));
  const financialEvidence = bindingValid ? financial.evidence.filter(e => ids.has(e.id)) : [];
  const price = history ? historicalPriceFactors(history) : null;
  const priceValid = bindingValid && history !== null && price?.valid === true && history.missingData.length === 0
    && history.bars.length === 240 && history.completedSessions.at(-1) === input.signalSession && price.session === input.signalSession
    && history.priceBasis?.anchorSession === input.signalSession && history.priceBasis.adjustmentVersion === 'tw-corporate-action-v3.1'
    && hash.test(history.priceBasis.adjustmentEvidenceHash) && /^tw-entry-authority-v0\.1:historical:[a-f0-9]{64}$/u.test(history.sourceDatasetRevision)
    && known(history.availableAt, cutoff) && history.bars.every(bar => known(bar.availableAt, cutoff) && known(bar.sourceTimestamp, cutoff) && known(bar.recordedAt, cutoff) && Number.isFinite(bar.rawClose) && bar.rawClose > 0);
  const priceEvidence = priceValid ? currentPriceEvidence(history!, new Set(input.original.filter(e => e.key === 'current_price').map(e => e.id))) : [];
  const comparisonGaps = [...(!bindingValid ? ['current_evidence_binding_invalid'] : []), ...financial.gaps,
    ...(!financialEvidence.length ? ['financial_cache_missing_for_symbol'] : []), ...(!priceValid ? ['current_price_cache_unavailable', ...(history?.missingData || [])] : [])];
  const publication: WeeklyFormalEligibility['publication'] = !bindingValid ? 'binding_invalid'
    : input.revisionId === null ? 'missing' : input.inputHash !== input.publishedInputHash ? 'input_changed' : 'input_matches';
  const eligibility: WeeklyFormalEligibility = {
    status: 'blocked', authorityScope: 'cached_comparison_only', publication,
    financialComparison: financialEvidence.length ? 'available' : 'unavailable',
    priceComparison: priceValid ? 'available' : 'unavailable', missingAuthority: [...missingWeeklyAuthority],
  };
  // The public target assessment is a current read observation, not a weekly
  // cutoff-bound qualification. Job-scoped action/qualification receipts also
  // cannot authorize a published revision here. Even complete cached lineage
  // must produce the same unusable formal quote until that contract exists.
  const quote: AuditQuote = { close: null, session: null, source: '', adjusted: false,
    volume: null, ma20: null, ma60: null, volumeRatio: null, institutionalFlow: null, provenance: [] };
  return {
    schemaVersion: 'vnext-current-evidence-read-v1' as const, symbol: input.symbol, stockId: input.stockId, cutoff,
    inputHash: input.inputHash, publishedRevisionId: input.revisionId, publishedInputHash: input.publishedInputHash,
    comparisonOnly: true as const, qualification: 'unavailable' as const,
    formalAudit: { eligibility, quote },
    // Source receipts prove cached original lineage, not a fresh current-rights
    // decision or immutable published-target action transformation/review.
    refusalReasons: [...new Set([...comparisonGaps,
      ...(publication === 'missing' ? ['published_revision_missing'] : publication === 'input_changed' ? ['published_revision_input_changed'] : []),
      ...eligibility.missingAuthority])],
    financial: { revisions, receipts: financial.receipts.filter(r => ids.has(String(r.factId))) },
    price: priceValid ? { sourceDatasetRevision: history!.sourceDatasetRevision, availableAt: history!.availableAt, session: input.signalSession, adjustmentEvidenceHash: history!.priceBasis!.adjustmentEvidenceHash } : null,
    // Preserve the real quote as comparison evidence. The actual audit receives
    // no usable price while published-target/current-rights authority is absent.
    evidence: financialEvidence, comparisonPriceEvidence: priceEvidence,
    comparisonPriceFactors: priceValid ? price : null,
  };
}
