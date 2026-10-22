import { command } from './store.ts';
import type { VnextIdentity } from './auth.ts';
import type { Evidence } from './research.ts';
import { getSupabaseServerClient } from '../supabase-server';
import { financialCoverageSummary } from '../candidate-financial-coverage.ts';
import { loadTwEntryPlanAuthority } from '../tw-entry-plan-authority.ts';
import { inputHash } from './policy.ts';
type Row = Record<string, unknown>;
/** Server-internal only. No HTTP action accepts a qualification or proof body. */
export async function qualifyPublication(identity: VnextIdentity, jobId: unknown) {
  const context = await command(identity, 'qualification-context', { jobId });
  if (context.alreadyPublished === true) return context;
  try {
  const client = getSupabaseServerClient(); const now = new Date().toISOString();
  const frozen = context.evidence as Row; const symbol = String(context.symbol);
  const cutoff = String(frozen.cutoff || '');
  const stock = await client.from('stocks').select('id,symbol,sector').eq('symbol', symbol).eq('market', 'TW').single();
  if (stock.error || !stock.data) throw new Error('vnext_qualification_stock_missing');
  const [instrument, facts, sessionRead] = await Promise.all([
    client.from('stock_instruments_v3').select('exchange').eq('stock_id', stock.data.id).eq('listing_status', 'active')
      .eq('instrument_type', 'common_stock').lte('recorded_at', now).lte('source_timestamp', now).lte('valid_from', now)
      .or(`valid_to.is.null,valid_to.gt.${now}`).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    client.rpc('read_financial_facts_for_stocks_as_of', { p_cutoff: now, p_stock_ids: [stock.data.id] }).limit(10000),
    client.from('tw_trading_sessions_v3').select('session_id,close_at').eq('status', 'completed').lte('close_at', now).order('session_id', { ascending: false }).limit(1).single(),
  ]);
  if (instrument.error || !instrument.data || facts.error || sessionRead.error || !sessionRead.data) throw new Error('vnext_qualification_authority_missing');
  const evidence = (Array.isArray(frozen.evidence) ? frozen.evidence : []) as Evidence[];
  const originalFacts = (facts.data || []) as Row[];
  const matched = originalFacts.filter((fact) => evidence.some((e) => e.id === String(fact.fact_id) && e.sourceTier === 'official'
    && e.key === fact.fact_key && e.value === fact.value && e.unit === fact.unit && e.period === fact.period_end
    && Date.parse(String(fact.recorded_at)) <= Date.parse(cutoff) && Date.parse(e.availableAt) <= Date.parse(cutoff)));
  const coverage = financialCoverageSummary(matched, String(stock.data.sector || ''), cutoff, symbol);
  const exchange = String(instrument.data.exchange).toUpperCase();
  if (!['TWSE', 'TPEX'].includes(exchange)) throw new Error('vnext_qualification_exchange_missing');
  const prices = await loadTwEntryPlanAuthority(client, { stockId: String(stock.data.id), symbol, exchange: exchange as 'TWSE' | 'TPEX',
    signalSession: String(sessionRead.data.session_id), cutoff: now });
  const proof = { schemaVersion: 'stockinsider-vnext-authority-proof-v1', inputHash: context.inputHash, stockId: stock.data.id,
    financialCoverage: coverage, factIds: matched.map((f) => String(f.fact_id)).sort(), officialSession: sessionRead.data.session_id,
    priceBasis: prices.priceBasis, sourceDatasetRevision: prices.sourceDatasetRevision, priceGaps: prices.missingData,
    qualified: coverage.status === 'complete' && prices.missingData.length === 0 && prices.priceBasis?.status === 'verified',
    checkedAt: now, expiresAt: new Date(Date.parse(now) + 120000).toISOString() };
  return command(identity, 'record-qualification', { jobId, inputHash: context.inputHash, proof: { ...proof, proofHash: inputHash(proof) } });
  } catch (error) {
    const proof = { schemaVersion: 'stockinsider-vnext-authority-proof-v1', inputHash: context.inputHash, qualified: false,
      gaps: [error instanceof Error ? error.message : 'actual_authority_unavailable'], checkedAt: new Date().toISOString() };
    return command(identity, 'record-qualification', { jobId, inputHash: context.inputHash, proof: { ...proof, proofHash: inputHash(proof) } });
  }
}
