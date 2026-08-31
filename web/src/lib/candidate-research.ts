import { createHash, randomUUID } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';
import { calculateTechnicalFeatures, normalizeInstitutionalFlows, type InstitutionalFlowDay } from './technical-features-v2';
import {
  advanceActionableCloseStreak,
  classifyCandidateStage,
  STAGE_RULESET_VERSION,
  type CandidateLifecycleStage,
  type MarketRiskRegime,
} from './stage-classifier';
import {
  fetchTwStockDailyBars,
  fetchTwStockEpsTtm,
  fetchTwStockInstitutional,
  fetchTwMarketValuationHistory,
  fetchTwMarketTradingSessions,
  fetchTwStockMaster,
  fetchTwStockRevenue,
  isOfficialValuationSourceUrl,
  type TwValuationHistoryPoint,
} from './tw-market';
import { buildConservativeOfficialScenario } from './candidate-valuation';
import { scheduledSourceConnectorKeys, sourceExecutionPolicy } from './source-policy';
import { loadLatestSourceRunLedger } from './source-run-ledger';
import type { CandidateShadowProgress, CandidateStageCard } from './types';

type Row = Record<string, unknown>;

export const CANDIDATE_RESEARCH_MODEL_VERSION = 'candidate-research-v2.1.0';
export const CANDIDATE_STAGE_MODEL_VERSION = 'candidate-stage-v2.1.0';
export const CANDIDATE_VALUATION_MODEL_VERSION = 'valuation-v2.1.0';
export const SHADOW_REQUIRED_SESSIONS = 30 as const;

function numberOrNull(value: unknown): number | null {
  if (value == null || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function bounded(value: number) {
  return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function stableHash(value: unknown) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function rowRelation(value: unknown): Row | null {
  if (Array.isArray(value)) return (value[0] as Row | undefined) || null;
  return value && typeof value === 'object' ? value as Row : null;
}

function publicHttpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : null;
  } catch {
    return null;
  }
}

function marketRegimeScore(regime: MarketRiskRegime) {
  return ({ risk_on: 100, selective: 60, risk_off: 20, breakdown: 0, unknown: 0 } as const)[regime];
}

async function mapLimit<T, R>(items: T[], limit: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let index = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index;
      index += 1;
      results[current] = await work(items[current]);
    }
  });
  await Promise.all(workers);
  return results;
}

export async function runCandidateResearchCycle(options: {
  dryRun?: boolean;
  pipelineRunId?: string | null;
  seedSymbols?: Array<{ symbol: string; name: string; market: 'TW' | 'US'; sector: string | null }>;
}) {
  const dryRun = Boolean(options.dryRun);
  const evaluatedAt = new Date().toISOString();
  if (dryRun) return { runId: randomUUID(), dryRun: true, candidateCount: 0, completedCount: 0, failedCount: 0, technicalSessionDate: null, items: [] };
  const supabase = getSupabaseServerClient();
  const runId = randomUUID();
  const [master, persistedSessionsRes] = await Promise.all([
    fetchTwStockMaster(),
    supabase.rpc('candidate_research_official_sessions', { p_cutoff: evaluatedAt, p_limit: 1320 }),
  ]);
  if (persistedSessionsRes.error) throw new Error(`official_trading_calendar_read_failed:${persistedSessionsRes.error.message}`);
  let marketSessions = (((persistedSessionsRes.data as Array<{ session_date?: unknown }>) || [])
    .map((row) => String(row.session_date || ''))
    .filter((session) => /^\d{4}-\d{2}-\d{2}$/u.test(session)))
    .sort();
  // The database plane is an official, cutoff-bound authority cache maintained by
  // the ingestion pipeline. Only bootstrap from the live endpoint when that plane
  // has not yet accumulated enough sessions to classify two adjacent closes.
  if (marketSessions.length < 2) marketSessions = await fetchTwMarketTradingSessions(1320);
  if (master.length === 0) throw new Error('official_stock_master_missing');
  if (marketSessions.length < 2) throw new Error('official_trading_calendar_missing');
  const latestMarketSession = marketSessions.at(-1)!;
  const evaluationReferenceMs = Date.parse(`${latestMarketSession}T13:30:00+08:00`);
  const cutoff = new Date(evaluationReferenceMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [mentionsRes, priorStagesRes, marketRes] = await Promise.all([
    supabase.from('candidate_source_mentions')
      .select('stock_id,platform,source_name,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,confidence,stocks(id,symbol,name,market,sector)')
      .gte('available_at', cutoff).order('available_at', { ascending: false }).limit(10000),
    supabase.from('candidate_daily_stage_snapshots')
      .select('stock_id,session_date,lifecycle_stage,hard_gate_results,stocks(id,symbol,name,market,sector)')
      .in('lifecycle_stage', ['waiting', 'actionable']).order('session_date', { ascending: false }).limit(3000),
    supabase.from('market_snapshots').select('index_state,as_of').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
  ]);
  if (mentionsRes.error || priorStagesRes.error || marketRes.error) throw new Error(mentionsRes.error?.message || priorStagesRes.error?.message || marketRes.error?.message || 'candidate_universe_failed');
  const stockMaster = new Map(master.map((item) => [item.symbol, item]));
  const candidates = new Map<string, { id: string; symbol: string; name: string; market: 'TW' | 'US'; sector: string | null }>();
  const mentionsByStock = new Map<string, Row[]>();
  for (const mention of (mentionsRes.data as Row[]) || []) {
    const stock = rowRelation(mention.stocks);
    if (!stock) continue;
    const id = String(stock.id || mention.stock_id || '');
    const symbol = String(stock.symbol || '');
    if (!id || !/^\d{4}$/u.test(symbol)) continue;
    const official = stockMaster.get(symbol);
    candidates.set(id, { id, symbol, name: official?.name || String(stock.name || symbol), market: 'TW', sector: stock.sector ? String(stock.sector) : null });
    const stockMentions = mentionsByStock.get(id);
    if (stockMentions) stockMentions.push(mention);
    else mentionsByStock.set(id, [mention]);
  }
  for (const stage of (priorStagesRes.data as Row[]) || []) {
    const stock = rowRelation(stage.stocks);
    if (!stock) continue;
    const id = String(stock.id || stage.stock_id || '');
    const symbol = String(stock.symbol || '');
    if (!id || !/^\d{4}$/u.test(symbol) || candidates.has(id)) continue;
    const official = stockMaster.get(symbol);
    candidates.set(id, { id, symbol, name: official?.name || String(stock.name || symbol), market: 'TW', sector: stock.sector ? String(stock.sector) : null });
  }
  const seedSymbols = (options.seedSymbols || []).filter((seed) => seed.market === 'TW');
  if (seedSymbols.length > 0) {
    const seedRes = await supabase.from('stocks').select('id,symbol,name,market,sector').in('symbol', seedSymbols.map((seed) => seed.symbol)).eq('market', 'TW');
    if (seedRes.error) throw new Error(seedRes.error.message);
    for (const stock of (seedRes.data as Row[]) || []) {
      const id = String(stock.id || '');
      const symbol = String(stock.symbol || '');
      const seed = seedSymbols.find((item) => item.symbol === symbol);
      if (id && seed) candidates.set(id, { id, symbol, name: stockMaster.get(symbol)?.name || String(stock.name || seed.name), market: 'TW', sector: stock.sector ? String(stock.sector) : seed.sector });
    }
  }
  const universe = [...candidates.values()];
  const exchangeBySymbol = new Map(master.map((stock) => [stock.symbol, stock.exchange]));
  const historyStart = new Date(evaluationReferenceMs);
  historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 5);
  const cachedFundamentalsRes = universe.length === 0
    ? { data: [] as Row[], error: null }
    : await supabase.from('fundamental_snapshots')
      .select('stock_id,as_of_date,pe_ratio,pb_ratio,source_url')
      .in('stock_id', universe.map((stock) => stock.id))
      .gte('as_of_date', historyStart.toISOString().slice(0, 10))
      .lte('as_of_date', latestMarketSession)
      .order('as_of_date', { ascending: true })
      .limit(10000);
  if (cachedFundamentalsRes.error) throw new Error(cachedFundamentalsRes.error.message);
  const symbolByStockId = new Map(universe.map((stock) => [stock.id, stock.symbol]));
  const cachedOfficialHistory = new Map<string, TwValuationHistoryPoint[]>();
  for (const row of (cachedFundamentalsRes.data as Row[]) || []) {
    const symbol = symbolByStockId.get(String(row.stock_id || ''));
    const sourceUrl = String(row.source_url || '');
    const date = String(row.as_of_date || '');
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !isOfficialValuationSourceUrl(sourceUrl)) continue;
    const point = { date, peRatio: numberOrNull(row.pe_ratio), pbRatio: numberOrNull(row.pb_ratio), sourceUrl };
    const history = cachedOfficialHistory.get(symbol);
    if (history) history.push(point);
    else cachedOfficialHistory.set(symbol, [point]);
  }
  const officialValuationHistory = await fetchTwMarketValuationHistory(
    universe.map((stock) => stock.symbol), marketSessions, 60, exchangeBySymbol, cachedOfficialHistory,
  );
  const indexState = rowRelation(((marketRes.data as Row[]) || [])[0]?.index_state) || {};
  const marketAsOf = String(((marketRes.data as Row[]) || [])[0]?.as_of || '').slice(0, 10);
  const marketRegime = (marketAsOf === latestMarketSession && ['risk_on', 'selective', 'risk_off', 'breakdown'].includes(String(indexState.regime)) ? String(indexState.regime) : 'unknown') as MarketRiskRegime;
  const runInsert = await supabase.from('candidate_research_runs').insert({
    id: runId,
    evaluation_at: evaluatedAt,
    status: 'running',
    candidate_count: universe.length,
    ruleset_version: STAGE_RULESET_VERSION,
    model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
    pipeline_run_id: options.pipelineRunId || null,
  });
  if (runInsert.error) throw new Error(runInsert.error.message);

  const items = await mapLimit(universe, 4, async (stock) => {
    const startedAt = new Date().toISOString();
    const result: Row = { symbol: stock.symbol, stockId: stock.id };
    try {
      // The source plane may have created a placeholder whose name is just its
      // ticker. Normalize it from the official roster before requesting prices:
      // a temporary market-data outage must never leak a ticker as a company
      // name in the found-stage card.
      const officialName = stockMaster.get(stock.symbol)?.name;
      if (officialName && officialName !== stock.name) {
        const update = await supabase.from('stocks').update({ name: officialName, updated_at: evaluatedAt }).eq('id', stock.id);
        if (update.error) throw new Error(update.error.message);
        stock.name = officialName;
      }
      const officialMultiples = officialValuationHistory.get(stock.symbol) || [];
      const values = officialMultiples.at(-1) || null;
      const [bars, institutional, eps, fetchedRevenue, priorRevenueRes, historicalFundamentalsRes, priorStageRes, priorFlowsRes] = await Promise.all([
        fetchTwStockDailyBars(stock.symbol, 520),
        fetchTwStockInstitutional(stock.symbol).catch(() => null),
        fetchTwStockEpsTtm(stock.symbol).catch(() => null),
        fetchTwStockRevenue(stock.symbol, 16).catch(() => null),
        supabase.from('revenue_signals').select('*').eq('stock_id', stock.id).lte('as_of_date', evaluatedAt.slice(0, 10)).order('as_of_date', { ascending: false }).limit(1),
        supabase.from('fundamental_snapshots').select('as_of_date,pe_ratio,pb_ratio,source_url').eq('stock_id', stock.id).lte('as_of_date', evaluatedAt.slice(0, 10)).gte('as_of_date', new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10)).order('as_of_date', { ascending: false }).limit(1500),
        supabase.from('candidate_daily_stage_snapshots').select('*').eq('stock_id', stock.id).eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION).order('session_date', { ascending: false }).limit(1),
        supabase.from('stock_signals').select('as_of,volume,chip_metrics').eq('stock_id', stock.id).order('as_of', { ascending: false }).limit(30),
      ]);
      if (!bars || bars.length === 0) throw new Error('official_price_history_missing');
      const queryError = priorRevenueRes.error || historicalFundamentalsRes.error || priorStageRes.error || priorFlowsRes.error;
      if (queryError) throw new Error(queryError.message);
      const latestBar = bars.at(-1)!;
      const priceMatchesMarketSession = latestBar.time === latestMarketSession;
      const valuationMatchesMarketSession = values?.date === latestBar.time;
      const priorFlows: InstitutionalFlowDay[] = (((priorFlowsRes.data as Row[]) || []).map((row) => {
        const chip = rowRelation(row.chip_metrics) || {};
        const nets = [chip.foreign_net, chip.investment_trust_net, chip.dealer_net].map(numberOrNull).filter((item): item is number => item != null);
        return { session: String(chip.institutional_date || row.as_of || '').slice(0, 10), net: nets.length ? nets.reduce((sum, item) => sum + item, 0) : null, volume: numberOrNull(row.volume) };
      }));
      const institutionalNet = institutional
        ? [institutional.foreignNet, institutional.investmentTrustNet, institutional.dealerNet].filter((item): item is number => item != null).reduce((sum, item) => sum + item, 0)
        : null;
      const flows = normalizeInstitutionalFlows([{ session: institutional?.date || latestBar.time, net: institutionalNet, volume: latestBar.volume }, ...priorFlows]);
      const technical = calculateTechnicalFeatures(bars.map((bar) => ({ session: bar.time, high: bar.high, low: bar.low, close: bar.close, volume: bar.volume || 0 })), flows);
      const technicalUpsert = await supabase.from('technical_feature_snapshots').upsert({
        stock_id: stock.id, session_date: technical.sessionDate, close: technical.close, volume: technical.volume,
        ma5: technical.ma5, ma20: technical.ma20, ma60: technical.ma60, ma120: technical.ma120, ma240: technical.ma240,
        ma60_slope: technical.ma60Slope, volume_ratio_20_median: technical.volumeRatio20Median, atr14: technical.atr14,
        rsi14: technical.rsi14, obv: technical.obv, institutional_flow_5d_norm: technical.institutionalFlow5dNorm,
        institutional_flow_20d_norm: technical.institutionalFlow20dNorm, market_regime: marketRegime, peer_catchdown_block: false,
        as_of: `${technical.sessionDate}T13:30:00+08:00`, available_at: evaluatedAt,
        provenance: { source: 'twse_tpex_official_market_data', research_run_id: runId }, ruleset_version: technical.rulesetVersion,
      }, { onConflict: 'stock_id,session_date,ruleset_version' });
      if (technicalUpsert.error) throw new Error(technicalUpsert.error.message);
      const signalUpsert = await supabase.from('stock_signals').upsert({
        stock_id: stock.id, as_of: `${technical.sessionDate}T13:30:00+08:00`, source: 'twse-tpex-open-data',
        source_key: `candidate-research.${stock.symbol}`, price: technical.close, volume: technical.volume,
        ma_short: technical.ma5, ma_mid: technical.ma20, ma_long: technical.ma60, rsi: technical.rsi14,
        chip_metrics: { foreign_net: institutional?.foreignNet ?? null, investment_trust_net: institutional?.investmentTrustNet ?? null, dealer_net: institutional?.dealerNet ?? null, institutional_date: institutional?.date ?? null },
        technical_meta: { indicator_set: ['MA5','MA20','MA60','MA120','MA240','ATR14','RSI14','OBV'], official_history: true },
        freshness_status: priceMatchesMarketSession ? 'fresh' : 'stale', source_timestamp: `${technical.sessionDate}T13:30:00+08:00`, ingested_at: evaluatedAt,
      }, { onConflict: 'stock_id,as_of' });
      if (signalUpsert.error) throw new Error(signalUpsert.error.message);
      if (fetchedRevenue) {
        const revenueUpsert = await supabase.from('revenue_signals').upsert({ stock_id: stock.id, as_of_date: fetchedRevenue.asOfDate, monthly_revenue: fetchedRevenue.revenue, yoy_growth: null, mom_growth: null, source_url: `https://mops.twse.com.tw/mops/web/t21sc04_ifrs` }, { onConflict: 'stock_id,as_of_date' });
        if (revenueUpsert.error) throw new Error(revenueUpsert.error.message);
      }
      const priorRevenue = ((priorRevenueRes.data as Row[]) || [])[0] || null;
      const revenueYoy = numberOrNull(priorRevenue?.yoy_growth);
      const historicalFundamentals = (historicalFundamentalsRes.data as Row[]) || [];
      if (officialMultiples.length > 0) {
        const historyWrite = await supabase.from('fundamental_snapshots').upsert(officialMultiples.map((point) => ({
          stock_id: stock.id,
          as_of_date: point.date,
          pe_ratio: point.peRatio,
          pb_ratio: point.pbRatio,
          source_url: point.sourceUrl,
        })), { onConflict: 'stock_id,as_of_date' });
        if (historyWrite.error) throw new Error(historyWrite.error.message);
      }
      const peByDate = new Map<string, number>();
      const pbByDate = new Map<string, number>();
      const trustedHistoricalFundamentals = historicalFundamentals.filter((row) => isOfficialValuationSourceUrl(row.source_url));
      for (const row of trustedHistoricalFundamentals) {
        const pe = numberOrNull(row.pe_ratio);
        const pb = numberOrNull(row.pb_ratio);
        const date = String(row.as_of_date || '');
        if (pe != null && pe > 0) peByDate.set(date, pe);
        if (pb != null && pb > 0) pbByDate.set(date, pb);
      }
      for (const point of officialMultiples) {
        if (point.peRatio != null && point.peRatio > 0) peByDate.set(point.date, point.peRatio);
        if (point.pbRatio != null && point.pbRatio > 0) pbByDate.set(point.date, point.pbRatio);
      }
      const historicalPeRatios = [...peByDate.values()];
      const historicalPbRatios = [...pbByDate.values()];
      if (eps?.epsTtm != null || values?.peRatio != null || values?.pbRatio != null) {
        const fundamental = await supabase.from('fundamental_snapshots').upsert({
          stock_id: stock.id, as_of_date: values?.date || technical.sessionDate, eps_ttm: eps?.epsTtm ?? null,
          gross_margin: null, operating_margin: null, pe_ratio: values?.peRatio ?? null, pb_ratio: values?.pbRatio ?? null,
          revenue_run_rate: null, source_url: values?.sourceUrl || `https://www.twse.com.tw/zh/trading/historical/bwibbu-day.html?stockNo=${stock.symbol}`,
        }, { onConflict: 'stock_id,as_of_date' });
        if (fundamental.error) throw new Error(fundamental.error.message);
      }
      const valuation = buildConservativeOfficialScenario({ price: technical.close, epsTtm: eps?.epsTtm ?? null, peRatio: values?.peRatio ?? null, pbRatio: values?.pbRatio ?? null, revenueYoyPct: revenueYoy, sector: stock.sector, historicalPeRatios, historicalPbRatios });
      if (valuation) {
        const valuationWrite = await supabase.from('valuation_snapshots').upsert({
          stock_id: stock.id, session_date: technical.sessionDate, valuation_horizon_months: 12,
          primary_method: valuation.primaryMethod, cross_check_method: null, current_price: valuation.currentPrice,
          historical_pe_percentile: valuation.primaryMethod === 'forward_pb' ? null : valuation.historicalPercentile,
          historical_pb_percentile: valuation.primaryMethod === 'forward_pb' ? valuation.historicalPercentile : null, bear_target: valuation.bearTarget,
          base_target: valuation.baseTarget, bull_target: valuation.bullTarget, probability_weighted_target: valuation.probabilityWeightedTarget,
          base_upside_pct: valuation.baseUpsidePct, bear_downside_pct: valuation.bearDownsidePct, reward_risk_ratio: valuation.rewardRiskRatio,
          earnings_bridge: { eps_ttm: eps?.epsTtm ?? null, exchange_implied_eps: valuation.operatingDriverSource === 'exchange_implied_ttm_eps' ? valuation.operatingDriver : null, operating_driver_source: valuation.operatingDriverSource, revenue_yoy_pct: revenueYoy, conservative_growth_factor: valuation.growthFactor },
          assumption_ledger: [{ source: 'official_five_year_multiple_distribution', median_multiple: valuation.baseMultiple, sample_count: valuation.historicalSampleCount }, { source: 'official_monthly_revenue', half_pass_through_cap: 0.15 }],
          catalysts: [], invalidation_conditions: ['official earnings bridge deteriorates'], as_of: `${technical.sessionDate}T13:30:00+08:00`,
          available_at: evaluatedAt, provenance: { research_run_id: runId, sources: ['TWSE/TPEx','MOPS'] }, model_version: CANDIDATE_VALUATION_MODEL_VERSION,
        }, { onConflict: 'stock_id,session_date,model_version' });
        if (valuationWrite.error) throw new Error(valuationWrite.error.message);
      }
      const recentMentions = mentionsByStock.get(stock.id) || [];
      const independent = new Set(recentMentions.map((row) => String(row.independent_content_hash || row.source_url || '')).filter(Boolean));
      const platforms = new Set(recentMentions.map((row) => String(row.platform || '')).filter(Boolean));
      const latestMentionMs = Math.max(0, ...recentMentions.map((row) => Date.parse(String(row.mentioned_at || row.available_at || ''))).filter(Number.isFinite));
      const previous = ((priorStageRes.data as Row[]) || [])[0] || null;
      const priorHardGates = rowRelation(previous?.hard_gate_results) || {};
      const baseUpsidePct = valuation?.baseUpsidePct ?? null;
      const financialCompleteness = [eps?.epsTtm, values?.peRatio, values?.pbRatio, priorRevenue?.monthly_revenue, revenueYoy].filter((item) => item != null).length / 5 * 100;
      const officialEvidenceCount = [bars.length >= 240, institutional != null, values != null, eps != null, priorRevenue != null, marketRegime !== 'unknown'].filter(Boolean).length;
      const baseInput = {
        discovery: {
          independentSources: Math.min(100, independent.size / 3 * 100), platformDiversity: Math.min(100, platforms.size / 3 * 100),
          discussionBurst: Math.min(100, recentMentions.length * 20), recency: latestMentionMs ? Math.max(0, 100 - (evaluationReferenceMs - latestMentionMs) / (7 * 86_400_000) * 100) : 0,
          sourceReliability: recentMentions.length ? recentMentions.reduce((sum, row) => sum + (numberOrNull(row.confidence) || 0), 0) / recentMentions.length : 50,
        },
        research: {
          valuationMarginOfSafety: baseUpsidePct == null ? 0 : bounded(baseUpsidePct / 25 * 100), financialBridge: financialCompleteness,
          officialEvidenceAndCounterEvidence: Math.min(50, officialEvidenceCount / 6 * 50), brokerEvidence: 0, industryRotation: 0, overseasPeers: 0,
        },
        actionability: {
          movingAveragesAndRelativeStrength: technical.close > (technical.ma20 || Infinity) && technical.close > (technical.ma60 || Infinity) ? 100 : 0,
          priceVolume: technical.volumeRatio20Median == null ? 0 : bounded(technical.volumeRatio20Median / 1.3 * 100),
          institutionalFlows: technical.institutionalFlow20dNorm == null ? 0 : bounded(50 + technical.institutionalFlow20dNorm * 50),
          marketRegime: marketRegimeScore(marketRegime), industryRotation: 0, overseasPeers: 0,
          overheatRisk: technical.rsi14 != null && technical.atr14 != null && technical.ma20 != null && technical.rsi14 < 75 && technical.close <= technical.ma20 + 2 * technical.atr14 ? 100 : 0,
        },
        confidence: {
          completeness: [technical.ma20, technical.ma60, technical.atr14, technical.rsi14, eps?.epsTtm, values?.peRatio, valuation?.baseTarget].filter((item) => item != null).length / 7 * 100,
          freshness: priceMatchesMarketSession && valuationMatchesMarketSession && marketRegime !== 'unknown' ? 100 : 0,
          traceability: officialEvidenceCount / 6 * 100,
          crossSourceConsistency: Math.min(100, Math.max(35, platforms.size / 3 * 100)),
        },
        valuation: { hasBearBaseBull: Boolean(valuation), baseUpsidePct, rewardRiskRatio: valuation?.rewardRiskRatio ?? null, hasMaterialOfficialCounterEvidence: false },
        technical: {
          close: technical.close, ma20: technical.ma20, ma60: technical.ma60, ma120: technical.ma120, ma240: technical.ma240,
          ma60Slope: technical.ma60Slope, volumeRatio20Median: technical.volumeRatio20Median, atr14: technical.atr14, rsi14: technical.rsi14,
          breakoutAboveLongMa: technical.volumeRatio20Median != null && technical.volumeRatio20Median >= 1.3 && technical.close > (technical.ma240 || technical.ma120 || Infinity),
        },
        marketRegime, peerCatchdownBlock: false, staleOrFallback: !priceMatchesMarketSession || !valuationMatchesMarketSession || marketRegime === 'unknown',
        previousStage: previous?.lifecycle_stage ? String(previous.lifecycle_stage) as CandidateLifecycleStage : null,
      };
      const preStreak = classifyCandidateStage({ ...baseInput, consecutiveActionableCloses: 2 });
      const streak = advanceActionableCloseStreak({
        eligibleThisRun: preStreak.stage === 'actionable', currentTechnicalSessionDate: technical.sessionDate,
        previousTechnicalSessionDate: priorHardGates.technical_session_date ? String(priorHardGates.technical_session_date) : null,
        expectedPreviousTechnicalSessionDate: marketSessions[marketSessions.indexOf(technical.sessionDate) - 1] || null,
        previousEligible: priorHardGates.actionable_eligible_pre_streak === true,
        previousConsecutiveCloses: numberOrNull(priorHardGates.consecutive_actionable_closes) || 0,
      });
      const stage = classifyCandidateStage({ ...baseInput, consecutiveActionableCloses: streak });
      const replayStage = classifyCandidateStage({ ...baseInput, consecutiveActionableCloses: streak });
      const classificationReplayHash = stableHash(replayStage);
      if (classificationReplayHash !== stableHash(stage)) throw new Error('classification_replay_conflict');
      const snapshot = await supabase.from('candidate_daily_stage_snapshots').upsert({
        stock_id: stock.id, session_date: technical.sessionDate, lifecycle_stage: stage.stage, discovery_score: stage.scores.discovery,
        research_score: stage.scores.research, actionability_score: stage.scores.actionability, data_confidence_score: stage.scores.dataConfidence,
        base_upside_pct: valuation?.baseUpsidePct ?? null, bear_downside_pct: valuation?.bearDownsidePct ?? null,
        reward_risk_ratio: valuation?.rewardRiskRatio ?? null, market_regime: marketRegime,
        hard_gate_results: { technical_passed: stage.technicalHardGatePassed, actionable_eligible_pre_streak: preStreak.stage === 'actionable', consecutive_actionable_closes: streak, technical_session_date: technical.sessionDate, stale_or_fallback: baseInput.staleOrFallback, peer_catchdown_block: false, classification_replay_hash: classificationReplayHash, classification_replay_consistent: true },
        unmet_conditions: stage.unmetConditions, promotion_reasons: stage.promotionReasons, as_of: evaluatedAt, available_at: evaluatedAt,
        ruleset_version: STAGE_RULESET_VERSION, model_version: CANDIDATE_STAGE_MODEL_VERSION,
        provenance: { candidate_research_run_id: runId, official_sources: ['TWSE','TPEx','MOPS'] },
      }, { onConflict: 'stock_id,session_date,ruleset_version,model_version' }).select('id').single();
      if (snapshot.error || !snapshot.data) throw new Error(snapshot.error?.message || 'candidate_stage_snapshot_failed');
      const previousStage = previous?.lifecycle_stage ? String(previous.lifecycle_stage) : null;
      if (previousStage !== stage.stage) {
        const event = await supabase.from('candidate_stage_events').upsert({ stock_id: stock.id, from_stage: previousStage, to_stage: stage.stage, reason_codes: stage.promotionReasons.length ? stage.promotionReasons : stage.unmetConditions, consecutive_sessions_passed: streak, as_of: evaluatedAt, available_at: evaluatedAt, ruleset_version: STAGE_RULESET_VERSION, snapshot_id: snapshot.data.id }, { onConflict: 'stock_id,snapshot_id,to_stage', ignoreDuplicates: true });
        if (event.error) throw new Error(event.error.message);
      }
      Object.assign(result, { status: 'success', stage: stage.stage, technicalSessionDate: technical.sessionDate, valuationStatus: valuation ? 'complete' : 'missing', scores: stage.scores, unmetConditions: stage.unmetConditions, classificationReplayHash });
      const itemWrite = await supabase.from('candidate_research_run_items').upsert({ run_id: runId, stock_id: stock.id, symbol: stock.symbol, status: valuation ? 'success' : 'partial', price_status: 'success', technical_status: 'success', fundamental_status: eps || values || priorRevenue ? 'success' : 'missing', valuation_status: valuation ? 'complete' : 'missing', classification_status: 'success', lifecycle_stage: stage.stage, terminal_reason: valuation ? null : 'valuation_inputs_missing', technical_session_date: technical.sessionDate, metrics: result, started_at: startedAt, finished_at: new Date().toISOString() }, { onConflict: 'run_id,stock_id' });
      if (itemWrite.error) throw new Error(itemWrite.error.message);
      return result;
    } catch (error) {
      const reason = (error as Error).message.slice(0, 500);
      Object.assign(result, { status: 'failed', terminalReason: reason });
      // A failed refresh must revoke any older waiting/actionable authority immediately.
      // Persist a fail-closed found snapshot for the current official session so the
      // publisher cannot accidentally reuse an older successful classification.
      const failedSnapshot = await supabase.from('candidate_daily_stage_snapshots').upsert({
        stock_id: stock.id,
        session_date: latestMarketSession,
        lifecycle_stage: 'found',
        discovery_score: 0,
        research_score: 0,
        actionability_score: 0,
        data_confidence_score: 0,
        base_upside_pct: null,
        bear_downside_pct: null,
        reward_risk_ratio: null,
        market_regime: 'unknown',
        hard_gate_results: {
          technical_passed: false,
          actionable_eligible_pre_streak: false,
          consecutive_actionable_closes: 0,
          technical_session_date: latestMarketSession,
          stale_or_fallback: true,
          research_cycle_failed: true,
          terminal_reason: reason,
        },
        unmet_conditions: ['candidate_research_failed', 'stale_or_fallback_data'],
        promotion_reasons: [],
        as_of: evaluatedAt,
        available_at: evaluatedAt,
        ruleset_version: STAGE_RULESET_VERSION,
        model_version: CANDIDATE_STAGE_MODEL_VERSION,
        provenance: { candidate_research_run_id: runId, failure: true },
      }, { onConflict: 'stock_id,session_date,ruleset_version,model_version' });
      if (failedSnapshot.error) result.snapshotError = failedSnapshot.error.message;
      const failureWrite = await supabase.from('candidate_research_run_items').upsert({ run_id: runId, stock_id: stock.id, symbol: stock.symbol, status: 'failed', price_status: /price|bar/iu.test(reason) ? 'failed' : 'unknown', technical_status: 'failed', fundamental_status: 'unknown', valuation_status: 'missing', classification_status: 'failed', lifecycle_stage: 'found', terminal_reason: reason, technical_session_date: null, metrics: result, started_at: startedAt, finished_at: new Date().toISOString() }, { onConflict: 'run_id,stock_id' });
      if (failureWrite.error) result.ledgerError = failureWrite.error.message;
      return result;
    }
  });
  const failedCount = items.filter((item) => item.status === 'failed').length;
  const failClosedWriteFailures = items.filter((item) => item.snapshotError).length;
  const completedCount = items.length - failedCount;
  const technicalSessionDate = items.map((item) => String(item.technicalSessionDate || '')).filter(Boolean).sort().at(-1) || null;
  const runUpdate = await supabase.from('candidate_research_runs').update({ status: failedCount === 0 ? 'success' : completedCount > 0 ? 'partial' : 'failed', completed_count: completedCount, failed_count: failedCount, technical_session_date: technicalSessionDate, terminal_reason: failedCount ? 'per_stock_failures' : null, summary: { items }, finished_at: new Date().toISOString() }).eq('id', runId);
  if (runUpdate.error) throw new Error(runUpdate.error.message);
  if (failClosedWriteFailures > 0) throw new Error(`candidate_fail_closed_snapshot_failed:${failClosedWriteFailures}`);
  return { runId, dryRun: false, candidateCount: universe.length, completedCount, failedCount, technicalSessionDate, items };
}

export async function loadCandidateStageCards(): Promise<{ found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] }> {
  const supabase = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const latest = (rows: Row[]) => {
    const selected = new Map<string, Row>();
    for (const row of rows) {
      const stockId = String(row.stock_id || '');
      if (stockId && !selected.has(stockId)) selected.set(stockId, row);
    }
    return selected;
  };
  const [mentionsRes, stageRes] = await Promise.all([
    supabase.from('candidate_source_mentions')
      .select('stock_id,platform,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,stocks(id,symbol,name,market)')
      .gte('available_at', cutoff).order('available_at', { ascending: false }).limit(10000),
    supabase.from('candidate_daily_stage_snapshots')
      .select('*,stocks(id,symbol,name,market)').eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION)
      .order('session_date', { ascending: false }).order('available_at', { ascending: false }).limit(5000),
  ]);
  if (mentionsRes.error || stageRes.error) throw new Error(mentionsRes.error?.message || stageRes.error?.message || 'candidate_stage_read_failed');
  const recentMentions = (mentionsRes.data as Row[]) || [];
  const recentStockIds = [...new Set(recentMentions.map((row) => String(row.stock_id || '')).filter(Boolean))];
  const stageByStock = latest((stageRes.data as Row[]) || []);
  const persistedStockIds = [...stageByStock.entries()].filter(([, stage]) => ['waiting', 'actionable'].includes(String(stage.lifecycle_stage))).map(([stockId]) => stockId);
  const stockIds = [...new Set([...recentStockIds, ...persistedStockIds])];
  if (stockIds.length === 0) return { found: [], waiting: [], actionable: [] };
  const historicalOnlyIds = persistedStockIds.filter((stockId) => !recentStockIds.includes(stockId));
  const [historicalMentionsRes, technicalRes, valuationRes] = await Promise.all([
    historicalOnlyIds.length > 0
      ? supabase.from('candidate_source_mentions').select('stock_id,platform,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,stocks(id,symbol,name,market)').in('stock_id', historicalOnlyIds).order('available_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('technical_feature_snapshots').select('*').in('stock_id', stockIds).order('session_date', { ascending: false }).limit(5000),
    supabase.from('valuation_snapshots').select('*').in('stock_id', stockIds).eq('model_version', CANDIDATE_VALUATION_MODEL_VERSION).order('session_date', { ascending: false }).limit(5000),
  ]);
  if (historicalMentionsRes.error || technicalRes.error || valuationRes.error) throw new Error(historicalMentionsRes.error?.message || technicalRes.error?.message || valuationRes.error?.message || 'candidate_stage_read_failed');
  const mentions = [...recentMentions, ...((historicalMentionsRes.data as Row[]) || [])];
  const technicalByStock = latest((technicalRes.data as Row[]) || []);
  const valuationByStock = latest((valuationRes.data as Row[]) || []);
  const grouped = new Map<string, Row[]>();
  for (const mention of mentions) {
    const stockId = String(mention.stock_id);
    const stockMentions = grouped.get(stockId);
    if (stockMentions) stockMentions.push(mention);
    else grouped.set(stockId, [mention]);
  }
  const cardsByStock = new Map<string, CandidateStageCard>();
  for (const stockId of stockIds) {
    const stockMentions = grouped.get(stockId) || [];
    const stage = stageByStock.get(stockId);
    const stock = rowRelation(stockMentions[0]?.stocks) || rowRelation(stage?.stocks);
    if (!stock) continue;
    const stageSession = stage?.session_date ? String(stage.session_date) : null;
    const latestTechnical = technicalByStock.get(stockId);
    const latestValuation = valuationByStock.get(stockId);
    const technical = stageSession && String(latestTechnical?.session_date || '') === stageSession ? latestTechnical : undefined;
    const valuation = stageSession && String(latestValuation?.session_date || '') === stageSession ? latestValuation : undefined;
    const hard = rowRelation(stage?.hard_gate_results) || {};
    const storedLifecycleStage = (stage?.lifecycle_stage ? String(stage.lifecycle_stage) : 'found') as CandidateLifecycleStage;
    const latestMentionAt = stockMentions.map((row) => String(row.mentioned_at || row.available_at || '')).sort().at(-1) || String(stage?.available_at || cutoff);
    const seenSources = new Set<string>();
    const sources = stockMentions.flatMap((row) => {
      const sourceUrl = publicHttpUrl(row.source_url);
      const sourceKey = String(row.independent_content_hash || sourceUrl || '');
      if (!sourceUrl || !sourceKey || seenSources.has(sourceKey) || seenSources.size >= 5) return [];
      seenSources.add(sourceKey);
      return [{ platform: String(row.platform || 'unknown'), author: row.author_name ? String(row.author_name) : null, sourceUrl, stance: row.stance ? String(row.stance) as CandidateStageCard['sources'][number]['stance'] : null, mentionedAt: String(row.mentioned_at || row.available_at || '') }];
    });
    const dataAsOf = technical?.available_at ? String(technical.available_at) : stage?.available_at ? String(stage.available_at) : null;
    const stale = hard.stale_or_fallback === true || !dataAsOf || Date.now() - Date.parse(dataAsOf) > 7 * 86_400_000;
    const lifecycleStage: CandidateLifecycleStage = storedLifecycleStage === 'actionable' && stale ? 'waiting' : storedLifecycleStage;
    const unmetConditions = stringArray(stage?.unmet_conditions);
    if (stale && !unmetConditions.includes('stale_or_fallback_data')) unmetConditions.push('stale_or_fallback_data');
    const valuationStale = !valuation?.available_at || Date.now() - Date.parse(String(valuation.available_at)) > 7 * 86_400_000;
    cardsByStock.set(stockId, {
      symbol: String(stock.symbol || ''), chineseName: String(stock.name || stock.symbol || ''), market: String(stock.market || 'TW') === 'US' ? 'US' : 'TW', lifecycleStage,
      latestMentionAt, mentionCount: stockMentions.length, sources,
      scores: { discovery: numberOrNull(stage?.discovery_score) || 0, research: numberOrNull(stage?.research_score) || 0, actionability: numberOrNull(stage?.actionability_score) || 0, dataConfidence: numberOrNull(stage?.data_confidence_score) || 0 },
      valuation: { status: valuation ? valuationStale ? 'stale' : 'complete' : 'missing', currentPrice: numberOrNull(valuation?.current_price) ?? numberOrNull(technical?.close), bearTarget: numberOrNull(valuation?.bear_target), baseTarget: numberOrNull(valuation?.base_target), bullTarget: numberOrNull(valuation?.bull_target), probabilityWeightedTarget: numberOrNull(valuation?.probability_weighted_target), baseUpsidePct: valuation ? numberOrNull(stage?.base_upside_pct) : null, bearDownsidePct: valuation ? numberOrNull(stage?.bear_downside_pct) : null, rewardRiskRatio: valuation ? numberOrNull(stage?.reward_risk_ratio) : null, method: valuation?.primary_method ? String(valuation.primary_method) : null },
      technical: { sessionDate: technical?.session_date ? String(technical.session_date) : null, close: numberOrNull(technical?.close), ma20: numberOrNull(technical?.ma20), ma60: numberOrNull(technical?.ma60), ma120: numberOrNull(technical?.ma120), ma240: numberOrNull(technical?.ma240), rsi14: numberOrNull(technical?.rsi14), volumeRatio20Median: numberOrNull(technical?.volume_ratio_20_median), marketRegime: String(stage?.market_regime || technical?.market_regime || 'unknown'), hardGatePassed: hard.technical_passed === true },
      consecutiveCloses: { passed: Math.max(0, Math.min(2, Math.floor(numberOrNull(hard.consecutive_actionable_closes) || 0))), required: 2, technicalSessionDate: hard.technical_session_date ? String(hard.technical_session_date) : null },
      classificationReplayHash: hard.classification_replay_consistent === true && hard.classification_replay_hash ? String(hard.classification_replay_hash) : null,
      unmetConditions, promotionReasons: stringArray(stage?.promotion_reasons), dataAsOf, stale, detailHref: `/stock/${String(stock.symbol || '')}`,
    });
  }
  const sortCards = (cards: CandidateStageCard[]) => cards.sort((a, b) => b.scores.discovery - a.scores.discovery || Date.parse(b.latestMentionAt) - Date.parse(a.latestMentionAt));
  const allCards = [...cardsByStock.values()];
  return {
    found: sortCards(recentStockIds.flatMap((stockId) => cardsByStock.get(stockId) ? [cardsByStock.get(stockId)!] : [])),
    waiting: sortCards(allCards.filter((card) => card.lifecycleStage === 'waiting')),
    actionable: sortCards(allCards.filter((card) => card.lifecycleStage === 'actionable' && !card.stale)),
  };
}

export async function recordCandidateShadowObservation(input: {
  pipelineRunId: string;
  publicationId: string | null;
  stages: { found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] };
  technicalSessionDate: string | null;
  activeSourceErrors?: string[];
}) {
  const candidateMap = new Map<string, CandidateStageCard>();
  for (const card of [...input.stages.found, ...input.stages.waiting, ...input.stages.actionable]) candidateMap.set(card.symbol, card);
  const candidates = [...candidateMap.values()];
  if (!input.technicalSessionDate || candidates.length === 0) return null;
  const supabase = getSupabaseServerClient();
  const canonicalCandidates = candidates.map((card) => ({ symbol: card.symbol, stage: card.lifecycleStage, scores: card.scores, valuation: card.valuation, technicalSessionDate: card.technical.sessionDate, unmet: card.unmetConditions })).sort((a, b) => a.symbol.localeCompare(b.symbol));
  const replayInputs = candidates
    .map((card) => ({ symbol: card.symbol, stage: card.lifecycleStage, replayHash: card.classificationReplayHash }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const replayMissing = replayInputs.some((item) => !item.replayHash);
  const replayHash = createHash('sha256').update(JSON.stringify(replayInputs)).digest('hex');
  const completeness = round(candidates.reduce((sum, card) => sum + card.scores.dataConfidence, 0) / candidates.length, 2);
  const freshness = round(candidates.filter((card) => !card.stale).length / candidates.length * 100, 2);
  const hash = createHash('sha256').update(JSON.stringify({
    candidates: canonicalCandidates,
    completeness,
    freshness,
    activeSourceErrors: [...(input.activeSourceErrors || [])].sort(),
  })).digest('hex');
  const blockers = [completeness < 95 ? 'data_completeness_below_95' : null, freshness < 95 ? 'data_freshness_below_95' : null, replayMissing ? 'classification_replay_missing' : null, ...(input.activeSourceErrors || []).map((item) => `active_source:${item}`)].filter((item): item is string => Boolean(item));
  const qualifying = blockers.length === 0;
  const observedAt = new Date().toISOString();
  const write = await supabase.rpc('record_candidate_shadow_observation', {
    p_session_date: input.technicalSessionDate,
    p_ruleset_version: STAGE_RULESET_VERSION,
    p_model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
    p_pipeline_run_id: input.pipelineRunId,
    p_publication_id: input.publicationId || null,
    p_counts: {
      candidate: candidates.length,
      found: candidates.filter((card) => card.lifecycleStage === 'found').length,
      waiting: input.stages.waiting.length,
      actionable: input.stages.actionable.length,
    },
    p_completeness_pct: completeness,
    p_freshness_pct: freshness,
    p_active_source_errors: input.activeSourceErrors || [],
    p_canonical_input_hash: hash,
    p_replay_hash: replayHash,
    p_qualifying: qualifying,
    p_blockers: blockers,
    p_observed_at: observedAt,
  });
  if (write.error) throw new Error(write.error.message);
  const result = (write.data || {}) as Row;
  return { sessionDate: input.technicalSessionDate, qualifying: result.qualifying === true, conflict: result.conflict === true, completeness, freshness, blockers: result.conflict === true ? [...new Set([...blockers, 'same_session_replay_conflict'])] : blockers };
}

export async function loadActiveCandidateSourceErrors(now = Date.now()): Promise<string[]> {
  const active = scheduledSourceConnectorKeys();
  const latest = new Map((await loadLatestSourceRunLedger()).map((row) => [row.connector, row]));
  const accepted = new Set(['success', 'successful_empty', 'duplicate_only']);
  const errors: string[] = [];
  for (const connector of active) {
    const row = latest.get(connector);
    if (!row) {
      errors.push(`${connector}:missing_run`);
      continue;
    }
    if (!accepted.has(row.terminalReason)) {
      errors.push(`${connector}:${row.terminalReason}`);
      continue;
    }
    const cadenceHours = sourceExecutionPolicy(connector).cadenceHours || 24;
    const attemptedAt = Date.parse(row.attemptedAt);
    if (!Number.isFinite(attemptedAt) || now - attemptedAt > cadenceHours * 2 * 60 * 60 * 1000) {
      errors.push(`${connector}:stale_run`);
    }
  }
  return errors;
}

export async function loadCandidateShadowProgress(): Promise<CandidateShadowProgress> {
  const supabase = getSupabaseServerClient();
  const rpc = await supabase.rpc('candidate_shadow_progress', { p_ruleset_version: STAGE_RULESET_VERSION, p_model_version: CANDIDATE_RESEARCH_MODEL_VERSION });
  if (!rpc.error && rpc.data) {
    const row = rpc.data as Row;
    return { observed: Number(row.observed || 0), qualifying: Number(row.qualifying || 0), required: SHADOW_REQUIRED_SESSIONS, remaining: Number(row.remaining ?? SHADOW_REQUIRED_SESSIONS), startedOn: row.startedOn ? String(row.startedOn) : null, latestSession: row.latestSession ? String(row.latestSession) : null, blockers: stringArray(row.blockers) };
  }
  const rows = await supabase.from('candidate_shadow_session_observations').select('session_date,qualifying,blockers').eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_RESEARCH_MODEL_VERSION).order('session_date', { ascending: true });
  if (rows.error) throw new Error(rows.error.message);
  const data = (rows.data as Row[]) || [];
  const qualifying = data.filter((row) => row.qualifying === true).length;
  return { observed: data.length, qualifying, required: SHADOW_REQUIRED_SESSIONS, remaining: Math.max(0, SHADOW_REQUIRED_SESSIONS - qualifying), startedOn: data[0]?.session_date ? String(data[0].session_date) : null, latestSession: data.at(-1)?.session_date ? String(data.at(-1)?.session_date) : null, blockers: stringArray(data.at(-1)?.blockers) };
}
