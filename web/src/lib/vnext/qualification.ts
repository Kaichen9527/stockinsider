import {FINANCIAL_SQL_PARITY_GAP, financialRowsAtCutoff, selectFinancialObservationHeads} from './financial-observation.ts';
import {evidenceInstant, evidenceKnownAt} from './evidence-clock.ts';
import { command } from './store.ts';
import type { VnextIdentity } from './auth.ts';
import type { Artifact,Evidence,Review } from './research.ts';
import {reviewedValuation} from './reviewed-valuation.ts';
import { getSupabaseServerClient } from '../supabase-server';
import { financialCoverageSummary } from '../candidate-financial-coverage.ts';
import { acquireTwEntryForwardCalendar, loadTwEntryHistoricalPriceAuthority, loadTwEntryPlanAuthority, type TwEntryAuthorityRequest } from '../tw-entry-plan-authority.ts';
import { inputHash } from './policy.ts';
type Row = Record<string, unknown>;
const validationFlags = ['schema_valid','unit_valid','point_in_time_valid','consistency_valid'];
const validationFields = new Set([...validationFlags,'validation_status','validation_recorded_at']);

function validatedReportedFactAt(fact: Row, cutoff: string) {
  return typeof fact.fact_id === 'string' && typeof fact.value === 'number' && Number.isFinite(fact.value)
    && fact.validation_status === 'validated' && fact.estimate_kind === 'reported' && fact.estimate_horizon === 'reported_period'
    && ['official_primary','official_filing'].includes(String(fact.authority_tier))
    && validationFlags.every((key) => fact[key] === true)
    && evidenceKnownAt(fact.validation_recorded_at, cutoff)
    && evidenceKnownAt(fact.recorded_at, String(fact.validation_recorded_at))
    && (fact.filing_published_at == null || evidenceKnownAt(fact.filing_published_at, cutoff));
}

// The as-of RPC overlays validation receipts. Re-validation may change those
// fields while the reviewed filing values and every other field stay fixed.
function immutableFactHash(fact: Row) {
  return inputHash(Object.fromEntries(Object.entries(fact).filter(([key]) => !validationFields.has(key))));
}

/** Server-internal only. No HTTP action accepts a qualification or proof body. */
export async function qualifyPublication(identity: VnextIdentity, jobId: unknown) {
  const context = await command(identity, 'qualification-context', { jobId });
  if (context.alreadyPublished === true) return context;
  // Current comparison protocol has no independently enforced SQL interval/
  // EPS-basis bridge. This is server-derived, never caller-clearable by
  // removing optional observation metadata, inventory or supplied gap arrays.
  const financialComparisonGaps=[FINANCIAL_SQL_PARITY_GAP];
  try {
  const client = getSupabaseServerClient();
  // Existing role-bound journal inspection returns only the immutable authored
  // artifact/review for this job; no caller artifact or approval flag is used.
  const inspected=await client.rpc('vnext_provider_command_v1',{p_principal:identity.principal,p_command:'inspect',p_request:{jobId}});
  const reviewed=inspected.data as Row|null;
  if(inspected.error || !reviewed || reviewed.state!=='reviewing' || reviewed.inputHash!==context.inputHash)throw new Error('vnext_qualification_current_review_unavailable');
  // This reviewed, admitted job already owns its original execution/global slot.
  // Acquire the original forward-calendar receipt before fixing this cutoff.
  const forwardCalendar=await acquireTwEntryForwardCalendar();
  if(!forwardCalendar)throw new Error('vnext_qualification_forward_calendar_unavailable');
  const now = new Date().toISOString();
  const frozen = context.evidence as Row; const symbol = String(context.symbol);
  const cutoff = String(frozen.cutoff || '');
  if (!evidenceKnownAt(cutoff, now)) throw new Error('vnext_qualification_frozen_clock_invalid');
  const stock = await client.from('stocks').select('id,symbol,sector').eq('symbol', symbol).eq('market', 'TW').single();
  if (stock.error || !stock.data) throw new Error('vnext_qualification_stock_missing');
  const stockId = String(stock.data.id);
  const [instrument, frozenFacts, currentFacts, sessionRead] = await Promise.all([
    client.from('stock_instruments_v3').select('exchange').eq('stock_id', stock.data.id).eq('listing_status', 'active')
      .eq('instrument_type', 'common_stock').lte('recorded_at', now).lte('source_timestamp', now).lte('valid_from', now)
      .or(`valid_to.is.null,valid_to.gt.${now}`).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    client.rpc('read_financial_facts_for_stocks_as_of', { p_cutoff: cutoff, p_stock_ids: [stockId] }).limit(2001),
    client.rpc('read_financial_facts_for_stocks_as_of', { p_cutoff: now, p_stock_ids: [stockId] }).limit(2001),
    client.from('tw_trading_sessions_v3').select('session_id,close_at').eq('status', 'completed').lte('close_at', now).order('session_id', { ascending: false }).limit(1).single(),
  ]);
  if (instrument.error || !instrument.data || frozenFacts.error || currentFacts.error || sessionRead.error || !sessionRead.data) throw new Error('vnext_qualification_authority_missing');
  const originalRows = financialRowsAtCutoff(frozenFacts.data, [stockId], cutoff);
  const currentRows = financialRowsAtCutoff(currentFacts.data, [stockId], now);
  if (!originalRows || !currentRows) throw new Error('vnext_qualification_financial_scope_invalid');

  const evidence = (Array.isArray(frozen.evidence) ? frozen.evidence : []) as Evidence[];
  const officialEvidence = new Map(evidence.filter((row) => row.kind === 'fact' && row.sourceTier === 'official')
    .map((row) => [row.id, row]));
  const matched = selectFinancialObservationHeads(originalRows).heads.filter((fact) => {
    const original = officialEvidence.get(String(fact.fact_id));
    if (!original || !validatedReportedFactAt(fact, original.availableAt) || !evidenceKnownAt(original.availableAt, cutoff)) return false;
    return original.key === fact.fact_key && original.value === fact.value && original.unit === fact.unit && original.period === fact.period_end
      && evidenceInstant(original.eventAt) === evidenceInstant(fact.source_timestamp) && original.contentHash === inputHash(fact);
  });
  const coverage = financialCoverageSummary(matched, String(stock.data.sector || ''), cutoff, symbol);
  const matchedById = new Map(matched.map((fact) => [fact.fact_id, fact]));
  const currentFinancialIds = new Set(selectFinancialObservationHeads(currentRows).heads.flatMap((fact) => {
    const original = matchedById.get(fact.fact_id);
    return original && validatedReportedFactAt(fact, now) && immutableFactHash(fact) === immutableFactHash(original)
      ? [String(fact.fact_id)] : [];
  }));
  const exchange = String(instrument.data.exchange).toUpperCase();
  if (!['TWSE', 'TPEX'].includes(exchange)) throw new Error('vnext_qualification_exchange_missing');
  const priceRequest: TwEntryAuthorityRequest = { stockId, symbol, exchange: exchange as 'TWSE' | 'TPEX',
    signalSession: String(sessionRead.data.session_id), cutoff: now, forwardCalendar };
  const prices = await loadTwEntryPlanAuthority(client, priceRequest);
  const latestPrice=prices.bars.at(-1);
  const adjusted = prices.priceBasis?.status === 'verified' && prices.missingData.length === 0;
  const current=evidence.filter((source)=>{
    if(source.key==='current_price')return latestPrice && source.period===latestPrice.session && source.value===latestPrice.close;
    if(source.sourceTier!=='official')return true; // Current rights were checked by qualification-context.
    return currentFinancialIds.has(source.id);
  });
  let observedAt: string | null = null;
  let availableAt: string | null = null;
  if (adjusted && latestPrice && current.some((source) => source.key === 'current_price')) {
    // The historical authority exposes the original observation clock. Use it
    // only if both cutoff-bound reads prove the same price history and bar.
    const history = await loadTwEntryHistoricalPriceAuthority(client, priceRequest);
    const observation = history.bars.at(-1);
    if (history.missingData.length === 0 && history.priceBasis?.status === 'verified'
      && history.priceBasis.adjustmentEvidenceHash === prices.priceBasis?.adjustmentEvidenceHash
      && observation?.session === latestPrice.session && observation.sourceRef === latestPrice.sourceRef
      && observation.close === latestPrice.close && observation.availableAt === latestPrice.availableAt) {
      observedAt = observation.sourceTimestamp;
      availableAt = latestPrice.availableAt;
    }
  }
  const valuation=reviewedValuation({artifact:reviewed.authorArtifact as Artifact|null,review:reviewed.review as Review|null,original:evidence,current,cutoff:now,
    quote:{close:latestPrice?.close??null,session:latestPrice?.session||null,source:exchange==='TWSE'?'https://www.twse.com.tw/':'https://www.tpex.org.tw/',adjusted,observedAt,availableAt,volume:latestPrice?.volume??null,ma20:null,ma60:null,volumeRatio:null,institutionalFlow:null,provenance:[prices.sourceDatasetRevision]}});
  const proof = { schemaVersion: 'stockinsider-vnext-authority-proof-v1', inputHash: context.inputHash, stockId: stock.data.id,
    financialCoverage: coverage, factIds: matched.map((f) => String(f.fact_id)).sort(), officialSession: sessionRead.data.session_id,
    priceBasis: prices.priceBasis, sourceDatasetRevision: prices.sourceDatasetRevision, priceGaps: prices.missingData,
    valuation,financialComparisonGaps,gaps:financialComparisonGaps,qualified: financialComparisonGaps.length===0 && coverage.status === 'complete' && prices.missingData.length === 0 && prices.priceBasis?.status === 'verified' && valuation.usable,
    checkedAt: now, expiresAt: new Date(Date.parse(now) + 120000).toISOString() };
  return command(identity, 'record-qualification', { jobId, inputHash: context.inputHash, proof: { ...proof, proofHash: inputHash(proof) } });
  } catch (error) {
    const proof = { schemaVersion: 'stockinsider-vnext-authority-proof-v1', inputHash: context.inputHash, qualified: false, financialComparisonGaps,
      gaps: [...financialComparisonGaps,error instanceof Error ? error.message : 'actual_authority_unavailable'], checkedAt: new Date().toISOString() };
    return command(identity, 'record-qualification', { jobId, inputHash: context.inputHash, proof: { ...proof, proofHash: inputHash(proof) } });
  }
}
