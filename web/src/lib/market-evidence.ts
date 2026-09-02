import { getSupabaseServerClient } from './supabase-server.ts';
import type { MarketRiskRegime } from './stage-classifier.ts';

type Row = Record<string, unknown>;
export const MARKET_EVIDENCE_MODEL_VERSION = 'market-evidence-v2.0.0';

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function indexState(values: Array<{ date: string; close: number }>) {
  const sorted = [...new Map(values.map((row) => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const closes = sorted.map((row) => row.close);
  const avg = (period: number) => closes.length >= period ? closes.slice(-period).reduce((sum, value) => sum + value, 0) / period : null;
  const ma20 = avg(20);
  const ma60 = avg(60);
  const prior60 = closes.length >= 65 ? closes.slice(-65, -5).reduce((sum, value) => sum + value, 0) / 60 : null;
  const close = closes.at(-1) ?? null;
  const peak = closes.length ? Math.max(...closes) : null;
  return {
    bars: closes.length, close, ma20, ma60,
    ma60Slope: ma60 != null && prior60 != null && prior60 !== 0 ? (ma60 - prior60) / prior60 : null,
    drawdownPct: close != null && peak != null && peak > 0 ? (close - peak) / peak * 100 : null,
    asOf: sorted.at(-1)?.date || null,
  };
}

export function deriveMarketEvidence(input: {
  sessionDate: string;
  taiex: Array<{ date: string; close: number }>;
  tpex: Array<{ date: string; close: number }>;
  breadth: Array<{ market: 'TWSE' | 'TPEX'; numerator: number; observed: number; eligible: number; date: string }>;
  foreignFlows: Array<{ date: string; value: number }>;
}) {
  const taiex = indexState(input.taiex);
  const tpex = indexState(input.tpex);
  const currentBreadth = input.breadth.filter((row) => row.date === input.sessionDate);
  const observed = currentBreadth.reduce((sum, row) => sum + row.observed, 0);
  const eligible = currentBreadth.reduce((sum, row) => sum + row.eligible, 0);
  const above = currentBreadth.reduce((sum, row) => sum + row.numerator, 0);
  const rosterCoveragePct = eligible ? observed / eligible * 100 : 0;
  const breadthState = currentBreadth.length >= 2 && eligible > 0
    ? { aboveMa20Pct: above / observed * 100, observed, eligible, rosterCoveragePct }
    : null;
  const flows = [...new Map(input.foreignFlows.map((row) => [row.date, row])).values()].sort((a, b) => a.date.localeCompare(b.date));
  const latestFlows = flows.filter((row) => row.date <= input.sessionDate).slice(-5);
  const foreignFlowState = latestFlows.length >= 5
    ? { oneDayTwd: latestFlows.at(-1)!.value, fiveDayTwd: latestFlows.reduce((sum, row) => sum + row.value, 0), sessions: latestFlows.map((row) => row.date) }
    : null;
  const missingComponents = [
    taiex.bars < 520 || taiex.asOf !== input.sessionDate ? 'taiex_520_daily_bars' : null,
    tpex.bars < 520 || tpex.asOf !== input.sessionDate ? 'tpex_520_daily_bars' : null,
    !breadthState || rosterCoveragePct < 95 ? 'twse_tpex_breadth_95pct' : null,
    !foreignFlowState ? 'twse_tpex_foreign_flow_1d_5d' : null,
  ].filter((value): value is string => Boolean(value));
  const breadthPct = breadthState?.aboveMa20Pct ?? 0;
  let regime: MarketRiskRegime = 'unknown';
  if (missingComponents.length === 0) {
    const breakdown = (taiex.close || 0) < (taiex.ma60 || Infinity) && (tpex.close || 0) < (tpex.ma60 || Infinity) && breadthPct < 35;
    const riskOn = (taiex.close || 0) > (taiex.ma20 || Infinity) && (taiex.close || 0) > (taiex.ma60 || Infinity) && (taiex.ma60Slope || 0) >= 0 && breadthPct >= 55;
    regime = breakdown ? 'breakdown' : riskOn ? 'risk_on' : breadthPct < 45 ? 'risk_off' : 'selective';
  }
  return {
    status: missingComponents.length ? 'data_incomplete' as const : 'complete' as const,
    regime,
    taiexState: taiex,
    tpexState: tpex,
    breadthState,
    foreignFlowState,
    completenessPct: (4 - missingComponents.length) / 4 * 100,
    rosterCoveragePct,
    missingComponents,
    riskBudget: missingComponents.length ? null : regime === 'risk_on' ? 'normal' : regime === 'selective' ? 'reduced' : 'none',
  };
}

export async function buildMarketEvidenceSnapshot(sessionDate: string, evaluatedAt: string) {
  const supabase = getSupabaseServerClient();
  const [market, flows] = await Promise.all([
    supabase.from('opportunity_market_observations_v3')
      .select('observation_id,fact_key,scope_key,value,authority_date,breadth_numerator_count,breadth_observed_count,breadth_eligible_count,recorded_at,source_ref')
      .lte('recorded_at', evaluatedAt).lte('authority_date', sessionDate)
      .order('authority_date', { ascending: false }).order('recorded_at', { ascending: false }).limit(8000),
    supabase.from('opportunity_stock_flow_observations_v3')
      .select('observation_id,stock_id,exchange,session_id,value,provider,recorded_at,source_ref')
      .eq('fact_key', 'foreign_net_twd').in('provider', ['twse','tpex'])
      .lte('recorded_at', evaluatedAt).lte('session_id', sessionDate)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).limit(20000),
  ]);
  if (market.error || flows.error) throw new Error(`market_evidence_read_failed:${market.error?.message || flows.error?.message}`);
  const marketRows = (market.data as Row[]) || [];
  const latestObservation = new Map<string, Row>();
  for (const row of marketRows) {
    const key = `${row.fact_key}:${row.scope_key}:${row.authority_date}`;
    if (!latestObservation.has(key)) latestObservation.set(key, row);
  }
  const rows = [...latestObservation.values()];
  const taiex = rows.filter((row) => row.fact_key === 'taiex_close' && row.scope_key === 'TAIEX')
    .flatMap((row) => numberOrNull(row.value) == null ? [] : [{ date: String(row.authority_date), close: Number(row.value) }]);
  const tpex = rows.filter((row) => row.fact_key === 'otc_close' && row.scope_key === 'OTC')
    .flatMap((row) => numberOrNull(row.value) == null ? [] : [{ date: String(row.authority_date), close: Number(row.value) }]);
  const breadth = rows.filter((row) => row.fact_key === 'above_ma20' && ['TWSE_ACTIVE_COMMON','TPEX_ACTIVE_COMMON'].includes(String(row.scope_key)))
    .flatMap((row) => {
      const numerator = numberOrNull(row.breadth_numerator_count);
      const observed = numberOrNull(row.breadth_observed_count);
      const eligible = numberOrNull(row.breadth_eligible_count);
      return numerator == null || observed == null || eligible == null ? [] : [{ market: row.scope_key === 'TWSE_ACTIVE_COMMON' ? 'TWSE' as const : 'TPEX' as const, numerator, observed, eligible, date: String(row.authority_date) }];
    });
  const latestFlowByObservation = new Map<string, Row>();
  for (const row of (flows.data as Row[]) || []) {
    const key = `${row.stock_id}:${row.exchange}:${row.session_id}:${row.provider}`;
    if (!latestFlowByObservation.has(key)) latestFlowByObservation.set(key, row);
  }
  const flowByDate = new Map<string, number>();
  for (const row of latestFlowByObservation.values()) {
    const date = String(row.session_id);
    flowByDate.set(date, (flowByDate.get(date) || 0) + Number(row.value || 0));
  }
  const derived = deriveMarketEvidence({ sessionDate, taiex, tpex, breadth, foreignFlows: [...flowByDate].map(([date, value]) => ({ date, value })) });
  const write = await supabase.from('market_evidence_snapshots').upsert({
    session_date: sessionDate, status: derived.status, regime: derived.regime,
    taiex_state: derived.taiexState, tpex_state: derived.tpexState, breadth_state: derived.breadthState,
    foreign_flow_state: derived.foreignFlowState, completeness_pct: derived.completenessPct,
    roster_coverage_pct: derived.rosterCoveragePct, missing_components: derived.missingComponents,
    risk_budget: derived.riskBudget, as_of: `${sessionDate}T13:30:00+08:00`, available_at: evaluatedAt,
    provenance: { sources: ['opportunity_market_observations_v3','opportunity_stock_flow_observations_v3'], official_only: true },
    model_version: MARKET_EVIDENCE_MODEL_VERSION,
  }, { onConflict: 'session_date,model_version' }).select('id').single();
  if (write.error || !write.data) throw new Error(`market_evidence_write_failed:${write.error?.message || 'missing_row'}`);
  return {
    id: String(write.data.id),
    ...derived,
    // Internal research-cycle aid only; the persisted public evidence stays
    // compact while signal tracking can calculate relative TAIEX performance.
    taiexCloseByDate: Object.fromEntries(taiex.map((row) => [row.date, row.close])),
  };
}
