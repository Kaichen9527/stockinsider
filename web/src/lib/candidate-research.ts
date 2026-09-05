import { createHash, randomUUID } from 'crypto';
import { getSupabaseServerClient } from './supabase-server';
import { calculateTechnicalFeatures, normalizeInstitutionalFlows, technicalHistoryCoverageTerminalReason, type InstitutionalFlowDay } from './technical-features-v2';
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
  fetchTwStockRevenue,
  isOfficialValuationSourceUrl,
  type TwValuationHistoryPoint,
} from './tw-market';
import { buildConservativeOfficialScenario, buildForwardEarningsScenario } from './candidate-valuation';
import { candidatePriceRefreshDepth, collectBatchedAuthorityRows, collectPagedAuthorityRows, isCandidateHistoricalPriceAccessEnabled, isTransientResearchInfrastructureError, rotatingShard } from './candidate-research-policy';
import { scheduledSourceConnectorKeys, sourceExecutionPolicy } from './source-policy';
import { loadLatestSourceRunLedger } from './source-run-ledger';
import type { CandidateShadowProgress, CandidateStageCard } from './types';
import { candidateValuationPolicy, VALUATION_REMEDIATION_SYMBOLS } from './candidate-valuation-policy';
import { buildDeterministicCandidateSections } from './candidate-detail';
import { candidateRiskAction, runningMaxDrawdown } from './candidate-risk-action';
import { buildMarketEvidenceSnapshot } from './market-evidence';
import { candidateMentionDiscoveryEligible, publisherKeyFor, relativeDiscussionBurst, roundRobinSourceLinks, sourceConcentration } from './source-content-semantics';
import { buildShadowReplayInputs, shadowReplayConflicts } from './shadow-policy-v2';
import { buildForwardEarningsBridge, discreteReportedQuarters, type ReportedFinancialFact } from './forward-earnings-bridge';
import { brokerResearchFactor, officialResearchEvidenceFactor, relationshipFactor } from './candidate-factor-builder';
import { refreshCandidateOfficialFinancials } from './candidate-official-financials';

type Row = Record<string, unknown>;

export const CANDIDATE_RESEARCH_MODEL_VERSION = 'candidate-research-v3.0.0';
export const CANDIDATE_STAGE_MODEL_VERSION = 'candidate-stage-v3.0.0';
export const CANDIDATE_VALUATION_MODEL_VERSION = 'valuation-v3.0.0';
export const SHADOW_POLICY_VERSION = 'shadow-policy-v2';
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

async function waitForResearchRetry(attempt: number) {
  await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
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

function officialAuthoritySourceUrl(value: unknown): string {
  const reference = String(value || '');
  const mops = reference.match(/^(?:twse|tpex)-mops-inline:(\d{4})-(\d{2})-\d{2}:(\d{4}):/u);
  if (mops) {
    return `https://mopsov.twse.com.tw/server-java/t164sb01?step=1&CO_ID=${mops[3]}&SYEAR=${Number(mops[1]) - 1911}&SSEASON=${Math.ceil(Number(mops[2]) / 3)}&REPORT_ID=C`;
  }
  if (reference.startsWith('tpex-')) return 'https://www.tpex.org.tw/openapi/';
  if (reference.startsWith('twse-')) return 'https://openapi.twse.com.tw/';
  return 'https://mops.twse.com.tw/';
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

async function loadStockAuthority(supabase: ReturnType<typeof getSupabaseServerClient>, cutoff: string) {
  return collectPagedAuthorityRows<Row>(async (from, to) => {
    try {
      const page = await supabase.rpc('candidate_research_stock_authority', { p_cutoff: cutoff }).range(from, to);
      if (page.error) throw page.error;
      return (page.data as Row[]) || [];
    } catch (error) {
      throw new Error(`official_stock_authority_read_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }, { maxRows: 5000 });
}

async function loadOfficialSessions(supabase: ReturnType<typeof getSupabaseServerClient>, cutoff: string) {
  return collectPagedAuthorityRows<{ session_date?: unknown }>(async (from, to) => {
    try {
      const page = await supabase.rpc('candidate_research_official_sessions', { p_cutoff: cutoff, p_limit: 1320 }).range(from, to);
      if (page.error) throw page.error;
      return (page.data as Array<{ session_date?: unknown }>) || [];
    } catch (error) {
      throw new Error(`official_trading_calendar_read_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }, { maxRows: 1320 });
}

async function loadCandidateMentions(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  historyCutoff: string,
  sourceCutoff: string,
) {
  return collectPagedAuthorityRows<Row>(async (from, to) => {
    try {
      const page = await supabase.from('candidate_source_mentions')
        .select('stock_id,platform,source_name,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,confidence,publisher_key,publisher_name,content_semantics,provenance,stocks(id,symbol,name,market,sector)')
        .gte('available_at', historyCutoff).lte('available_at', sourceCutoff)
        .order('available_at', { ascending: false }).range(from, to);
      if (page.error) throw page.error;
      return (page.data as Row[]) || [];
    } catch (error) {
      throw new Error(`candidate_mentions_read_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }, { maxRows: 20000 });
}

async function loadPriorCandidateStages(supabase: ReturnType<typeof getSupabaseServerClient>) {
  return collectPagedAuthorityRows<Row>(async (from, to) => {
    try {
      const page = await supabase.from('candidate_daily_stage_snapshots')
        .select('stock_id,session_date,lifecycle_stage,hard_gate_results,stocks(id,symbol,name,market,sector)')
        .in('lifecycle_stage', ['waiting', 'actionable'])
        .order('session_date', { ascending: false }).range(from, to);
      if (page.error) throw page.error;
      return (page.data as Row[]) || [];
    } catch (error) {
      throw new Error(`prior_candidate_stages_read_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }, { maxRows: 3000 });
}

async function loadCachedFundamentalHistory(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  stockIds: string[],
  historyStart: string,
  latestMarketSession: string,
) {
  return collectBatchedAuthorityRows<string, Row>(stockIds, async (batch, from, to) => {
    try {
      const page = await supabase.from('fundamental_snapshots')
        .select('stock_id,as_of_date,pe_ratio,pb_ratio,source_url,valuation_parser_version,quality_status')
        .in('stock_id', batch)
        .gte('as_of_date', historyStart)
        .lte('as_of_date', latestMarketSession)
        .order('stock_id', { ascending: true })
        .order('as_of_date', { ascending: true })
        .range(from, to);
      if (page.error) throw page.error;
      return (page.data as Row[]) || [];
    } catch (error) {
      throw new Error(`candidate_fundamental_history_read_failed:${error instanceof Error ? error.message : String(error)}`);
    }
  }, { batchSize: 20, maxRowsPerBatch: 5000 });
}

export async function runCandidateResearchCycle(options: {
  dryRun?: boolean;
  pipelineRunId?: string | null;
  seedSymbols?: Array<{ symbol: string; name: string; market: 'TW' | 'US'; sector: string | null }>;
}) {
  const dryRun = Boolean(options.dryRun);
  const evaluatedAt = new Date().toISOString();
  if (dryRun) return {
    runId: randomUUID(), dryRun: true, candidateCount: 0, completedCount: 0, failedCount: 0,
    partialCount: 0, technicalSessionDate: null, blocked: false, terminalReason: null, marketEvidence: null,
    manifestId: null, manifestHash: null, items: [],
  };
  const supabase = getSupabaseServerClient();
  const runId = randomUUID();
  const [authorityRows, persistedSessionRows] = await Promise.all([
    loadStockAuthority(supabase, evaluatedAt),
    loadOfficialSessions(supabase, evaluatedAt),
  ]);
  const master = (authorityRows.map((row) => ({
    stockId: String(row.stock_id || ''), symbol: String(row.symbol || ''), name: String(row.name || ''),
    exchange: String(row.exchange || '').toUpperCase() === 'TPEX' ? 'TPEx' as const : 'TWSE' as const,
    sector: row.sector ? String(row.sector) : null,
  })).filter((row) => row.stockId && /^\d{4}$/u.test(row.symbol) && row.name));
  let marketSessions = (persistedSessionRows
    .map((row) => String(row.session_date || ''))
    .filter((session) => /^\d{4}-\d{2}-\d{2}$/u.test(session)))
    .sort();
  // The database authority remains primary, but its append-only calendar can be
  // younger than the 1,320-session research horizon. Fill only the missing
  // historical dates from TWSE's official monthly market feed, then keep the
  // cutoff-bound union. This is real exchange history, never synthesized dates.
  const latestOfficialWindow = await fetchTwMarketTradingSessions(marketSessions.length < 1320 ? 1320 : 90);
  if (latestOfficialWindow.length > 0) {
    const officialHistory = latestOfficialWindow;
    marketSessions = [...new Set([...marketSessions, ...officialHistory])]
      .filter((session) => session <= evaluatedAt.slice(0, 10))
      .sort()
      .slice(-1320);
  }
  if (master.length === 0) throw new Error('official_stock_authority_missing');
  if (marketSessions.length < 2) throw new Error('official_trading_calendar_missing');
  const latestMarketSession = marketSessions.at(-1)!;
  const evaluationReferenceMs = Date.parse(`${latestMarketSession}T13:30:00+08:00`);
  const sourceCutoff = `${latestMarketSession}T18:30:00+08:00`;
  const cutoff = new Date(evaluationReferenceMs - 7 * 24 * 60 * 60 * 1000).toISOString();
  const historyCutoff = new Date(evaluationReferenceMs - 35 * 24 * 60 * 60 * 1000).toISOString();
  const [allMentions, priorStages] = await Promise.all([
    loadCandidateMentions(supabase, historyCutoff, sourceCutoff),
    loadPriorCandidateStages(supabase),
  ]);
  const stockMaster = new Map(master.map((item) => [item.symbol, item]));
  const candidates = new Map<string, { id: string; symbol: string; name: string; storedName: string; market: 'TW' | 'US'; sector: string | null }>();
  const mentionsByStock = new Map<string, Row[]>();
  const eligibleMentions = allMentions.filter((mention) => candidateMentionDiscoveryEligible(mention.provenance, String(mention.platform || '')));
  const recentMentions = eligibleMentions.filter((mention) => String(mention.available_at || '') >= cutoff && String(mention.content_semantics || 'editorial_discussion') !== 'bulk_institutional_ranking');
  const olderMentionsByStock = new Map<string, Row[]>();
  for (const mention of eligibleMentions.filter((mention) => String(mention.available_at || '') < cutoff)) {
    const stockId = String(mention.stock_id || '');
    if (!stockId) continue;
    const rows = olderMentionsByStock.get(stockId) || [];
    rows.push(mention);
    olderMentionsByStock.set(stockId, rows);
  }
  for (const mention of recentMentions) {
    const stock = rowRelation(mention.stocks);
    if (!stock) continue;
    const id = String(stock.id || mention.stock_id || '');
    const symbol = String(stock.symbol || '');
    if (!id || !/^\d{4}$/u.test(symbol)) continue;
    const official = stockMaster.get(symbol);
    if (!official) continue;
    const storedName = String(stock.name || symbol);
    candidates.set(id, { id, symbol, name: official.name, storedName, market: 'TW', sector: official.sector || (stock.sector ? String(stock.sector) : null) });
    const stockMentions = mentionsByStock.get(id);
    if (stockMentions) stockMentions.push(mention);
    else mentionsByStock.set(id, [mention]);
  }
  for (const stage of priorStages) {
    const stock = rowRelation(stage.stocks);
    if (!stock) continue;
    const id = String(stock.id || stage.stock_id || '');
    const symbol = String(stock.symbol || '');
    if (!id || !/^\d{4}$/u.test(symbol) || candidates.has(id)) continue;
    const official = stockMaster.get(symbol);
    if (!official) continue;
    const storedName = String(stock.name || symbol);
    candidates.set(id, { id, symbol, name: official.name, storedName, market: 'TW', sector: official.sector || (stock.sector ? String(stock.sector) : null) });
  }
  const seedSymbols = (options.seedSymbols || []).filter((seed) => seed.market === 'TW');
  const seedBySymbol = new Map(seedSymbols.map((seed) => [seed.symbol, seed]));
  for (const symbol of VALUATION_REMEDIATION_SYMBOLS) {
    if (!seedBySymbol.has(symbol)) seedBySymbol.set(symbol, { symbol, name: symbol, market: 'TW', sector: null });
  }
  const persistentResearchSeeds = [...seedBySymbol.values()];
  if (persistentResearchSeeds.length > 0) {
    const seedRes = await supabase.from('stocks').select('id,symbol,name,market,sector').in('symbol', persistentResearchSeeds.map((seed) => seed.symbol)).eq('market', 'TW');
    if (seedRes.error) throw new Error(seedRes.error.message);
    for (const stock of (seedRes.data as Row[]) || []) {
      const id = String(stock.id || '');
      const symbol = String(stock.symbol || '');
      const seed = seedBySymbol.get(symbol);
      const official = stockMaster.get(symbol);
      if (id && seed && official) {
        const storedName = String(stock.name || seed.name);
        candidates.set(id, { id, symbol, name: official.name, storedName, market: 'TW', sector: official.sector || (stock.sector ? String(stock.sector) : seed.sector) });
      }
    }
  }
  const proposedUniverse = [...candidates.values()].sort((left, right) => left.symbol.localeCompare(right.symbol));
  const exchangeBySymbol = new Map(master.map((stock) => [stock.symbol, stock.exchange]));
  const existingCoreFinancialFacts = proposedUniverse.length === 0 ? [] : await collectBatchedAuthorityRows<string, Row>(
    proposedUniverse.map((stock) => stock.id),
    async (batch, from, to) => {
      const page = await supabase.from('opportunity_financial_facts_v3')
        .select('stock_id,fact_key,period_end')
        .in('stock_id', batch)
        .in('fact_key', ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps','diluted_weighted_average_shares'])
        .lte('recorded_at', evaluatedAt)
        .range(from, to);
      if (page.error) throw new Error(`candidate_financial_coverage_read_failed:${page.error.message}`);
      return (page.data as Row[]) || [];
    },
    { batchSize: 20, maxRowsPerBatch: 5000 },
  );
  const coverageByStock = new Map<string, Map<string, Set<string>>>();
  for (const fact of existingCoreFinancialFacts) {
    const stockId = String(fact.stock_id || '');
    const factKey = String(fact.fact_key || '');
    const periodEnd = String(fact.period_end || '');
    if (!stockId || !factKey || !/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)) continue;
    const byKey = coverageByStock.get(stockId) || new Map<string, Set<string>>();
    const periods = byKey.get(factKey) || new Set<string>();
    periods.add(periodEnd); byKey.set(factKey, periods); coverageByStock.set(stockId, byKey);
  }
  const requiredBridgeKeys = ['quarterly_revenue','quarterly_gross_profit','quarterly_operating_income','quarterly_net_income_attributable_to_common','quarterly_diluted_eps'];
  const financialRefreshBacklog = proposedUniverse.filter((stock) => requiredBridgeKeys.some((key) => (coverageByStock.get(stock.id)?.get(key)?.size || 0) < 8));
  const priorFinancialRefreshState = await supabase.from('candidate_research_runs')
    .select('summary')
    .order('evaluation_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (priorFinancialRefreshState.error) throw new Error(`candidate_financial_refresh_state_read_failed:${priorFinancialRefreshState.error.message}`);
  const priorFinancialSummary = rowRelation(priorFinancialRefreshState.data?.summary);
  const priorFinancialCursor = Math.max(0, Math.floor(numberOrNull(priorFinancialSummary?.officialFinancialRefreshNextCursor) || 0));
  // MOPS throttles individual filing reads. Rotate the deterministic 30-symbol
  // shard after every cycle so an issuer whose statements can never form the
  // generic bridge cannot permanently starve later candidates.
  const financialRefreshShard = rotatingShard(financialRefreshBacklog, priorFinancialCursor, 30);
  const selectedFinancialRefreshStocks = financialRefreshShard.items;
  const nextFinancialRefreshCursor = financialRefreshShard.nextCursor;
  const financialRefreshTargets = selectedFinancialRefreshStocks.flatMap((stock) => {
    const exchange = exchangeBySymbol.get(stock.symbol);
    return exchange ? [{ stockId: stock.id, symbol: stock.symbol, exchange: exchange === 'TPEx' ? 'TPEX' as const : 'TWSE' as const }] : [];
  });
  const officialFinancialRefresh = financialRefreshTargets.length > 0
    ? await refreshCandidateOfficialFinancials(financialRefreshTargets, evaluatedAt)
    : { candidateCount: 0, fetchedFilings: 0, parsedFacts: 0, writtenFacts: 0, failures: [] as string[] };
  const authorityFrozenAt = new Date().toISOString();
  const [latestFinancialRevision, latestPriceRevision] = await Promise.all([
    supabase.from('opportunity_financial_facts_v3').select('recorded_at').lte('recorded_at', authorityFrozenAt).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('opportunity_price_observations_v3').select('recorded_at').lte('recorded_at', authorityFrozenAt).order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (latestFinancialRevision.error || latestPriceRevision.error) throw new Error(`shadow_input_revision_read_failed:${latestFinancialRevision.error?.message || latestPriceRevision.error?.message}`);
  const manifestInputVersions = {
    ruleset: STAGE_RULESET_VERSION,
    researchModel: CANDIDATE_RESEARCH_MODEL_VERSION,
    valuationModel: CANDIDATE_VALUATION_MODEL_VERSION,
    marketModel: 'market-evidence-v2.0.0',
    sourceMentionRevisionHash: stableHash(eligibleMentions.map((row) => [row.stock_id, row.independent_content_hash, row.available_at]).sort()),
    financialFactsRecordedThrough: latestFinancialRevision.data?.recorded_at || null,
    priceFactsRecordedThrough: latestPriceRevision.data?.recorded_at || null,
    officialFinancialRefreshBacklog: financialRefreshBacklog.length,
  };
  const proposedManifestHash = stableHash({ sessionDate: latestMarketSession, sourceCutoff, candidateSymbols: proposedUniverse.map((stock) => stock.symbol), inputVersions: manifestInputVersions });
  const manifestInsert = await supabase.from('candidate_shadow_manifests').upsert({
    session_date: latestMarketSession, policy_version: SHADOW_POLICY_VERSION, source_cutoff: sourceCutoff,
    candidate_symbols: proposedUniverse.map((stock) => stock.symbol), input_versions: manifestInputVersions,
    manifest_hash: proposedManifestHash, frozen_at: authorityFrozenAt,
  }, { onConflict: 'session_date,policy_version', ignoreDuplicates: true });
  if (manifestInsert.error) throw new Error(`shadow_manifest_write_failed:${manifestInsert.error.message}`);
  const manifestRead = await supabase.from('candidate_shadow_manifests').select('id,candidate_symbols,manifest_hash,input_versions,frozen_at').eq('session_date', latestMarketSession).eq('policy_version', SHADOW_POLICY_VERSION).single();
  if (manifestRead.error || !manifestRead.data) throw new Error(`shadow_manifest_read_failed:${manifestRead.error?.message || 'missing'}`);
  const frozenSymbols = new Set((Array.isArray(manifestRead.data.candidate_symbols) ? manifestRead.data.candidate_symbols : []).map(String));
  const universe = proposedUniverse.filter((stock) => frozenSymbols.has(stock.symbol));
  const manifestId = String(manifestRead.data.id);
  const manifestHash = String(manifestRead.data.manifest_hash);
  const authorityCutoff = String(manifestRead.data.frozen_at || evaluatedAt);
  if (!isCandidateHistoricalPriceAccessEnabled()) {
    const terminalReason = 'official_historical_price_access_unavailable';
    const blockedRun = await supabase.from('candidate_research_runs').insert({
      id: runId,
      evaluation_at: evaluatedAt,
      status: 'failed',
      candidate_count: universe.length,
      completed_count: 0,
      failed_count: 0,
      terminal_reason: terminalReason,
      ruleset_version: STAGE_RULESET_VERSION,
      model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
      pipeline_run_id: options.pipelineRunId || null,
      summary: {
        blocked: true,
        terminal_reason: terminalReason,
        latest_market_session: latestMarketSession,
        candidate_count: universe.length,
        remediation: 'configure an authorized historical TWSE/TPEx price feed before enabling candidate research',
      },
      finished_at: new Date().toISOString(),
    });
    if (blockedRun.error) throw new Error(blockedRun.error.message);
    return {
      runId,
      dryRun: false,
      candidateCount: universe.length,
      completedCount: 0,
      failedCount: 0,
      partialCount: 0,
      technicalSessionDate: null,
      blocked: true,
      terminalReason,
      marketEvidence: null,
      manifestId,
      manifestHash,
      items: [],
    };
  }
  const historyStart = new Date(evaluationReferenceMs);
  historyStart.setUTCFullYear(historyStart.getUTCFullYear() - 5);
  const cachedFundamentalRows = universe.length === 0
    ? []
    : await loadCachedFundamentalHistory(
      supabase,
      universe.map((stock) => stock.id),
      historyStart.toISOString().slice(0, 10),
      latestMarketSession,
    );
  const symbolByStockId = new Map(universe.map((stock) => [stock.id, stock.symbol]));
  const cachedOfficialHistory = new Map<string, TwValuationHistoryPoint[]>();
  for (const row of cachedFundamentalRows) {
    const symbol = symbolByStockId.get(String(row.stock_id || ''));
    const sourceUrl = String(row.source_url || '');
    const date = String(row.as_of_date || '');
    if (!symbol || !/^\d{4}-\d{2}-\d{2}$/u.test(date) || !isOfficialValuationSourceUrl(sourceUrl) || row.quality_status !== 'valid') continue;
    const parserVersion = String(row.valuation_parser_version || '');
    if (sourceUrl.includes('tpex.org.tw') && parserVersion !== 'tpex-header-v2') continue;
    const point = { date, peRatio: numberOrNull(row.pe_ratio), pbRatio: numberOrNull(row.pb_ratio), sourceUrl, parserVersion };
    const history = cachedOfficialHistory.get(symbol);
    if (history) history.push(point);
    else cachedOfficialHistory.set(symbol, [point]);
  }
  let officialValuationHistory: Map<string, TwValuationHistoryPoint[]>;
  try {
    officialValuationHistory = await fetchTwMarketValuationHistory(
      universe.map((stock) => stock.symbol), marketSessions, 60, exchangeBySymbol, cachedOfficialHistory,
    );
  } catch (error) {
    throw new Error(`official_valuation_history_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  let marketEvidence: Awaited<ReturnType<typeof buildMarketEvidenceSnapshot>>;
  try {
    marketEvidence = await buildMarketEvidenceSnapshot(latestMarketSession, evaluatedAt, marketSessions);
  } catch (error) {
    throw new Error(`official_market_evidence_failed:${error instanceof Error ? error.message : String(error)}`);
  }
  const marketRegime = marketEvidence.regime as MarketRiskRegime;
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

  const researchStock = async (stock: (typeof universe)[number], attempt = 0): Promise<Row> => {
    const startedAt = new Date().toISOString();
    const result: Row = { symbol: stock.symbol, stockId: stock.id };
    try {
      // The source plane may have created a placeholder whose name is just its
      // ticker. Normalize it from the official roster before requesting prices:
      // a temporary market-data outage must never leak a ticker as a company
      // name in the found-stage card.
      const officialName = stockMaster.get(stock.symbol)?.name;
      if (officialName && officialName !== stock.storedName) {
        const update = await supabase.from('stocks').update({ name: officialName, updated_at: evaluatedAt }).eq('id', stock.id);
        if (update.error) throw new Error(update.error.message);
        stock.name = officialName;
        stock.storedName = officialName;
      }
      // Cache and live official history may overlap on a monthly publication
      // date. Deduplicate before the bulk UPSERT: PostgreSQL correctly rejects
      // an ON CONFLICT batch that would update the same row twice.
      const officialMultiples = [...new Map(
        (officialValuationHistory.get(stock.symbol) || []).map((point) => [point.date, point]),
      ).values()].sort((left, right) => left.date.localeCompare(right.date));
      const values = officialMultiples.at(-1) || null;
      const [institutional, eps, fetchedRevenue, priorRevenueRes, historicalFundamentalsRes, priorStageRes, priorFlowsRes, cachedBarsRes, authorityBarsRes, authorityFactsRes, peerRelationshipsRes, priorTechnicalRes, trackingRes, brokerConsensusRes] = await Promise.all([
        fetchTwStockInstitutional(stock.symbol).catch(() => null),
        fetchTwStockEpsTtm(stock.symbol).catch(() => null),
        fetchTwStockRevenue(stock.symbol, 16).catch(() => null),
        supabase.from('revenue_signals').select('*').eq('stock_id', stock.id).lte('as_of_date', evaluatedAt.slice(0, 10)).order('as_of_date', { ascending: false }).limit(1),
        supabase.from('fundamental_snapshots').select('as_of_date,pe_ratio,pb_ratio,source_url,valuation_parser_version,quality_status').eq('stock_id', stock.id).lte('as_of_date', evaluatedAt.slice(0, 10)).gte('as_of_date', new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10)).order('as_of_date', { ascending: false }).limit(1500),
        supabase.from('candidate_daily_stage_snapshots').select('*').eq('stock_id', stock.id).eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION).order('session_date', { ascending: false }).limit(1),
        supabase.from('stock_signals').select('as_of,volume,chip_metrics').eq('stock_id', stock.id).order('as_of', { ascending: false }).limit(30),
        supabase.from('official_price_history').select('session_date,open,high,low,close,volume').eq('stock_id', stock.id).lte('available_at', evaluatedAt).order('session_date', { ascending: true }).limit(1320),
        supabase.from('opportunity_price_observations_v3').select('session_id,raw_open,raw_high,raw_low,raw_close,volume,source_ref,source_timestamp,collected_at,recorded_at').eq('stock_id', stock.id).lte('recorded_at', authorityCutoff).order('session_id', { ascending: true }).order('recorded_at', { ascending: true }).limit(4000),
        supabase.from('opportunity_financial_facts_v3').select('fact_id,fact_key,period_start,period_end,duration_kind,value,unit,filing_published_at,source_timestamp,collected_at,recorded_at,source_ref,estimate_kind,estimate_horizon').eq('stock_id', stock.id).lte('recorded_at', authorityCutoff).order('period_end', { ascending: false }).order('recorded_at', { ascending: false }).limit(2000),
        supabase.from('peer_relationships').select('id,peer_ticker,peer_market,relationship_type,product_subcategory,directionality,relationship_weight,version').eq('stock_id', stock.id).lte('effective_from', latestMarketSession).or(`effective_to.is.null,effective_to.gte.${latestMarketSession}`).limit(100),
        supabase.from('technical_feature_snapshots').select('session_date,close,ma60').eq('stock_id', stock.id).eq('ruleset_version', 'technical-features-v2.0.0').lt('session_date', latestMarketSession).order('session_date', { ascending: false }).limit(1),
        supabase.from('candidate_signal_tracking').select('session_date,reference_session_date,reference_price,max_drawdown_pct,close,signal_episode_id,initial_atr14,initial_stop_price,peak_close').eq('stock_id', stock.id).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION).order('session_date', { ascending: false }).limit(1),
        supabase.from('broker_consensus_snapshots').select('as_of_date,source_count,freshness_status').eq('stock_id', stock.id).lte('as_of_date', latestMarketSession).order('as_of_date', { ascending: false }).limit(1),
      ]);
      // A price feed may expose a newer provisional date before that date is in
      // the official completed-session ledger. It is not eligible for technical
      // features, stage transitions, or the two-adjacent-close confirmation.
      const cachedBars = ((cachedBarsRes.data as Row[]) || []).flatMap((row) => {
        const open = numberOrNull(row.open); const high = numberOrNull(row.high); const low = numberOrNull(row.low); const close = numberOrNull(row.close);
        return open == null || high == null || low == null || close == null ? [] : [{ time: String(row.session_date), open, high, low, close, volume: numberOrNull(row.volume) }];
      });
      const authorityBars = ((authorityBarsRes.data as Row[]) || []).flatMap((row) => {
        const open = numberOrNull(row.raw_open); const high = numberOrNull(row.raw_high); const low = numberOrNull(row.raw_low); const close = numberOrNull(row.raw_close);
        return open == null || high == null || low == null || close == null ? [] : [{ time: String(row.session_id), open, high, low, close, volume: numberOrNull(row.volume), sourceUrl: String(row.source_ref || '') }];
      });
      const refreshDepth = candidatePriceRefreshDepth([...cachedBars, ...authorityBars].map((bar) => bar.time), latestMarketSession);
      const fetchedBars = refreshDepth === 0 ? [] : await fetchTwStockDailyBars(
        stock.symbol,
        refreshDepth,
        refreshDepth === 5 ? marketSessions.slice(-5) : marketSessions,
        exchangeBySymbol.get(stock.symbol) || null,
      );
      const bars = [...new Map([...authorityBars, ...cachedBars, ...(fetchedBars || [])].filter((bar) => bar.time <= latestMarketSession).map((bar) => [bar.time, bar])).values()]
        .sort((left, right) => left.time.localeCompare(right.time)).slice(-1320);
      if (!bars || bars.length === 0) throw new Error('official_price_history_missing');
      const priceCoverageTerminal = technicalHistoryCoverageTerminalReason(bars.length);
      const queryError = priorRevenueRes.error || historicalFundamentalsRes.error || priorStageRes.error || priorFlowsRes.error || cachedBarsRes.error || authorityBarsRes.error || authorityFactsRes.error || peerRelationshipsRes.error || priorTechnicalRes.error || trackingRes.error || brokerConsensusRes.error;
      if (queryError) throw new Error(queryError.message);
      const peerRelationships = (peerRelationshipsRes.data as Row[]) || [];
      const peerSnapshotsRes = peerRelationships.length ? await supabase.from('peer_market_snapshots')
        .select('peer_relationship_id,price_return_5d,price_return_20d,fundamental_signal,availability_status,catchdown_block,as_of,available_at')
        .in('peer_relationship_id', peerRelationships.map((row) => String(row.id))).lte('available_at', evaluatedAt)
        .order('available_at', { ascending: false }).limit(1000) : { data: [], error: null };
      if (peerSnapshotsRes.error) throw new Error(peerSnapshotsRes.error.message);
      const latestPeerSnapshot = new Map<string, Row>();
      for (const row of (peerSnapshotsRes.data as Row[]) || []) {
        const relationshipId = String(row.peer_relationship_id || '');
        if (relationshipId && !latestPeerSnapshot.has(relationshipId)) latestPeerSnapshot.set(relationshipId, row);
      }
      const availablePeerSignals = peerRelationships.flatMap((relationship) => {
        const snapshot = latestPeerSnapshot.get(String(relationship.id || ''));
        if (!snapshot || snapshot.availability_status !== 'available') return [];
        const fundamental = numberOrNull(snapshot.fundamental_signal);
        const return20d = numberOrNull(snapshot.price_return_20d);
        const raw = fundamental ?? (return20d == null ? null : Math.max(-1, Math.min(1, return20d / 20)));
        return raw == null ? [] : [{ relationship, snapshot, score: raw }];
      });
      const relationshipSignals = availablePeerSignals.map(({ relationship, snapshot, score }) => ({
        market: String(relationship.peer_market || ''), score,
        weight: numberOrNull(relationship.relationship_weight) ?? 0.5,
        asOf: snapshot.as_of ? String(snapshot.as_of) : null,
      }));
      const industryRotationFactor = relationshipFactor(relationshipSignals, 'domestic_rotation');
      const overseasPeerFactor = relationshipFactor(relationshipSignals, 'overseas_peer');
      const peerCatchdownBlock = availablePeerSignals.some(({ relationship, snapshot }) => relationship.directionality === 'negative_catchdown' && snapshot.catchdown_block === true);
      const overseasPeerScore = overseasPeerFactor.score;
      const latestBar = bars.at(-1)!;
      const authoritativePriceRows = [...new Map([...authorityBars, ...(fetchedBars || [])].map((bar) => [bar.time, bar])).values()];
      if (authoritativePriceRows.length > 0) {
        const priceWrite = await supabase.from('official_price_history').upsert(authoritativePriceRows.map((bar) => ({
          stock_id: stock.id, session_date: bar.time, open: bar.open, high: bar.high, low: bar.low, close: bar.close,
          volume: bar.volume, source_url: 'sourceUrl' in bar && bar.sourceUrl ? bar.sourceUrl : exchangeBySymbol.get(stock.symbol) === 'TPEx'
            ? `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${stock.symbol}`
            : `https://www.twse.com.tw/exchangeReport/STOCK_DAY?response=json&stockNo=${stock.symbol}`,
          as_of: `${bar.time}T13:30:00+08:00`, available_at: evaluatedAt,
          provenance: { research_run_id: runId, provider: 'sourceUrl' in bar ? 'opportunity-v3-official-authority' : exchangeBySymbol.get(stock.symbol) || 'TWSE' },
        })), { onConflict: 'stock_id,session_date' });
        if (priceWrite.error) throw new Error(priceWrite.error.message);
      }
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
        institutional_flow_20d_norm: technical.institutionalFlow20dNorm, market_regime: marketRegime, peer_catchdown_block: peerCatchdownBlock,
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
          valuation_parser_version: point.parserVersion || null,
          quality_status: 'valid',
        })), { onConflict: 'stock_id,as_of_date' });
        if (historyWrite.error) throw new Error(historyWrite.error.message);
        const multipleWrite = await supabase.from('official_multiple_history').upsert(officialMultiples.map((point) => ({
          stock_id: stock.id, month_end: point.date, close: null, pe_ratio: point.peRatio, pb_ratio: point.pbRatio,
          source_url: point.sourceUrl, as_of: `${point.date}T13:30:00+08:00`, available_at: evaluatedAt,
          provenance: { research_run_id: runId, official: true, valuation_parser_version: point.parserVersion || null },
          valuation_parser_version: point.parserVersion || null, quality_status: 'valid',
        })), { onConflict: 'stock_id,month_end' });
        if (multipleWrite.error) throw new Error(multipleWrite.error.message);
      }
      const peByDate = new Map<string, number>();
      const pbByDate = new Map<string, number>();
      const trustedHistoricalFundamentals = historicalFundamentals.filter((row) => {
        if (!isOfficialValuationSourceUrl(row.source_url) || row.quality_status !== 'valid') return false;
        return !String(row.source_url || '').includes('tpex.org.tw') || row.valuation_parser_version === 'tpex-header-v2';
      });
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
          valuation_parser_version: values?.parserVersion || null, quality_status: 'valid',
        }, { onConflict: 'stock_id,as_of_date' });
        if (fundamental.error) throw new Error(fundamental.error.message);
      }
      const multipleMonthsCovered = new Set(officialMultiples.map((point) => point.date.slice(0, 7))).size;
      const reportedFacts: ReportedFinancialFact[] = ((authorityFactsRes.data as Row[]) || []).flatMap((fact) => {
        const value = numberOrNull(fact.value);
        const factId = String(fact.fact_id || '');
        const factKey = String(fact.fact_key || '');
        const periodStart = String(fact.period_start || '');
        const periodEnd = String(fact.period_end || '');
        if (String(fact.estimate_kind || '') !== 'reported' || value == null || !factId || !factKey || !/^\d{4}-\d{2}-\d{2}$/u.test(periodStart) || !/^\d{4}-\d{2}-\d{2}$/u.test(periodEnd)) return [];
        return [{ factId, factKey, periodStart, periodEnd, value, unit: fact.unit ? String(fact.unit) : null, sourceRef: String(fact.source_ref || '') }];
      });
      const earningsBridge = buildForwardEarningsBridge(reportedFacts);
      const operatingQuarterHistory = discreteReportedQuarters(reportedFacts, 'quarterly_operating_income');
      const commonIncomeQuarterHistory = discreteReportedQuarters(reportedFacts, 'quarterly_net_income_attributable_to_common');
      const hasMaterialOfficialCounterEvidence = operatingQuarterHistory.slice(-2).length === 2
        && operatingQuarterHistory.slice(-2).every((row) => row.value < 0)
        && commonIncomeQuarterHistory.slice(-2).length === 2
        && commonIncomeQuarterHistory.slice(-2).every((row) => row.value < 0);
      const next12mBridgeComplete = earningsBridge.status === 'complete';
      const verifiedTurnaroundPath = earningsBridge.status === 'complete' && earningsBridge.verifiedTurnaroundPath;
      const valuationPolicy = candidateValuationPolicy({ symbol: stock.symbol, multipleMonthsCovered, next12mBridgeComplete, verifiedTurnaroundPath });
      const rawValuation = valuationPolicy.basis === 'forward_12m' || valuationPolicy.basis === 'turnaround_conditional'
        ? earningsBridge.status === 'complete'
          ? buildForwardEarningsScenario({
              price: technical.close,
              bearEps: earningsBridge.scenarios.bear.dilutedEps,
              baseEps: earningsBridge.scenarios.base.dilutedEps,
              bullEps: earningsBridge.scenarios.bull.dilutedEps,
              historicalPeRatios,
            })
          : null
        : buildConservativeOfficialScenario({ price: technical.close, epsTtm: eps?.epsTtm ?? null, peRatio: values?.peRatio ?? null, pbRatio: values?.pbRatio ?? null, revenueYoyPct: revenueYoy, sector: stock.sector, historicalPeRatios, historicalPbRatios });
      const valuation = valuationPolicy.canPublishTarget ? rawValuation : null;
      const publishedPrimaryMethod = valuation
        ? valuationPolicy.basis === 'ttm_multiple_reference'
          ? valuation.primaryMethod === 'forward_pb' ? 'ttm_pb_reference' : 'ttm_pe_reference'
          : valuationPolicy.basis === 'normalized_cycle' && valuation.primaryMethod === 'forward_pe'
            ? 'normalized_pe'
          : valuation.primaryMethod
        : null;
      if (valuation) {
        const valuationWrite = await supabase.from('valuation_snapshots').upsert({
          stock_id: stock.id, session_date: technical.sessionDate, valuation_horizon_months: 12,
          primary_method: publishedPrimaryMethod, cross_check_method: null, current_price: valuation.currentPrice,
          historical_pe_percentile: valuation.primaryMethod === 'forward_pb' ? null : valuation.historicalPercentile,
          historical_pb_percentile: valuation.primaryMethod === 'forward_pb' ? valuation.historicalPercentile : null, bear_target: valuation.bearTarget,
          base_target: valuation.baseTarget, bull_target: valuation.bullTarget, probability_weighted_target: valuation.probabilityWeightedTarget,
          base_upside_pct: valuation.baseUpsidePct, bear_downside_pct: valuation.bearDownsidePct, reward_risk_ratio: valuation.rewardRiskRatio,
          earnings_bridge: earningsBridge.status === 'complete'
            ? earningsBridge
            : { status: earningsBridge.status, missing: earningsBridge.missing, eps_ttm: eps?.epsTtm ?? null, exchange_implied_eps: valuation.operatingDriverSource === 'exchange_implied_ttm_eps' ? valuation.operatingDriver : null, operating_driver_source: valuation.operatingDriverSource, revenue_yoy_pct: revenueYoy, conservative_growth_factor: valuation.growthFactor },
          assumption_ledger: [{ source: 'official_five_year_multiple_distribution', median_multiple: valuation.baseMultiple, sample_count: valuation.historicalSampleCount }, ...(earningsBridge.status === 'complete' ? earningsBridge.assumptions : [{ source: 'official_monthly_revenue', half_pass_through_cap: 0.15 }])],
          catalysts: [], invalidation_conditions: ['official earnings bridge deteriorates'], as_of: `${technical.sessionDate}T13:30:00+08:00`,
          available_at: evaluatedAt, provenance: { research_run_id: runId, sources: ['TWSE/TPEx','MOPS'] }, model_version: CANDIDATE_VALUATION_MODEL_VERSION,
          valuation_basis: valuationPolicy.basis, multiple_months_covered: multipleMonthsCovered, next_12m_bridge_complete: next12mBridgeComplete,
        }, { onConflict: 'stock_id,session_date,model_version' });
        if (valuationWrite.error) throw new Error(valuationWrite.error.message);
      }
      const recentMentions = mentionsByStock.get(stock.id) || [];
      const concentration = sourceConcentration(recentMentions.map((row) => ({
        platform: String(row.platform || 'unknown'),
        publisherKey: String(row.publisher_key || publisherKeyFor({ platform: String(row.platform || 'unknown'), author: row.author_name ? String(row.author_name) : null, sourceUrl: row.source_url ? String(row.source_url) : null, sourceName: row.source_name ? String(row.source_name) : null })),
        contentHash: String(row.independent_content_hash || row.source_url || randomUUID()),
      })));
      const platforms = new Set(recentMentions.map((row) => String(row.platform || '')).filter(Boolean));
      const olderMentions = olderMentionsByStock.get(stock.id) || [];
      const latestMentionMs = Math.max(0, ...recentMentions.map((row) => Date.parse(String(row.mentioned_at || row.available_at || ''))).filter(Number.isFinite));
      const previous = ((priorStageRes.data as Row[]) || [])[0] || null;
      const priorHardGates = rowRelation(previous?.hard_gate_results) || {};
      const baseUpsidePct = valuation?.baseUpsidePct ?? null;
      const financialCompleteness = [eps?.epsTtm, values?.peRatio, values?.pbRatio, priorRevenue?.monthly_revenue, revenueYoy].filter((item) => item != null).length / 5 * 100;
      const officialEvidenceCount = [bars.length >= 240, institutional != null, values != null, eps != null, priorRevenue != null, marketEvidence.status === 'complete'].filter(Boolean).length;
      const officialEvidenceFactor = officialResearchEvidenceFactor({
        factKeys: reportedFacts.map((fact) => fact.factKey),
        hasPriceHistory: bars.length >= 240,
        hasInstitutionalFlow: institutional != null,
        hasMarketEvidence: marketEvidence.status === 'complete',
        asOf: latestMarketSession,
      });
      const brokerFactor = brokerResearchFactor(((brokerConsensusRes.data as Row[]) || []).map((row) => ({
        sourceCount: Number(row.source_count || 0),
        freshness: String(row.freshness_status || 'missing'),
        asOf: row.as_of_date ? String(row.as_of_date) : null,
      })));
      const baseInput = {
        discovery: {
          independentSources: Math.min(100, concentration.publisherCount / 3 * 100), platformDiversity: Math.min(100, concentration.platformCount / 3 * 100),
          discussionBurst: relativeDiscussionBurst(concentration.effectiveMentions, olderMentions.length), recency: latestMentionMs ? Math.max(0, 100 - (evaluationReferenceMs - latestMentionMs) / (7 * 86_400_000) * 100) : 0,
          sourceReliability: recentMentions.length ? recentMentions.reduce((sum, row) => sum + (numberOrNull(row.confidence) || 0), 0) / recentMentions.length : 50,
          platformCount: concentration.platformCount,
        },
        research: {
          valuationMarginOfSafety: baseUpsidePct == null ? 0 : bounded(baseUpsidePct / 25 * 100),
          financialBridge: earningsBridge.status === 'complete' ? 100 : financialCompleteness,
          officialEvidenceAndCounterEvidence: officialEvidenceFactor.score,
          brokerEvidence: brokerFactor.score,
          industryRotation: industryRotationFactor.score,
          overseasPeers: overseasPeerFactor.score,
        },
        actionability: {
          movingAveragesAndRelativeStrength: technical.close > (technical.ma20 || Infinity) && technical.close > (technical.ma60 || Infinity) ? 100 : 0,
          priceVolume: technical.volumeRatio20Median == null ? 0 : bounded(technical.volumeRatio20Median / 1.3 * 100),
          institutionalFlows: technical.institutionalFlow20dNorm == null ? 0 : bounded(50 + technical.institutionalFlow20dNorm * 50),
          marketRegime: marketRegimeScore(marketRegime), industryRotation: industryRotationFactor.score, overseasPeers: overseasPeerScore,
          overheatRisk: technical.rsi14 != null && technical.atr14 != null && technical.ma20 != null && technical.rsi14 < 75 && technical.close <= technical.ma20 + 2 * technical.atr14 ? 100 : 0,
        },
        confidence: {
          completeness: [technical.ma20, technical.ma60, technical.atr14, technical.rsi14, eps?.epsTtm, values?.peRatio, valuation?.baseTarget].filter((item) => item != null).length / 7 * 100,
          freshness: priceMatchesMarketSession && (valuation ? valuationMatchesMarketSession : true) && marketEvidence.status === 'complete' ? 100 : 0,
          traceability: officialEvidenceCount / 6 * 100,
          crossSourceConsistency: Math.min(100, Math.max(35, platforms.size / 3 * 100)),
        },
        valuation: { hasBearBaseBull: Boolean(valuation), baseUpsidePct, rewardRiskRatio: valuation?.rewardRiskRatio ?? null, hasMaterialOfficialCounterEvidence },
        technical: {
          close: technical.close, ma20: technical.ma20, ma60: technical.ma60, ma120: technical.ma120, ma240: technical.ma240,
          ma60Slope: technical.ma60Slope, volumeRatio20Median: technical.volumeRatio20Median, atr14: technical.atr14, rsi14: technical.rsi14,
          breakoutAboveLongMa: technical.volumeRatio20Median != null && technical.volumeRatio20Median >= 1.3 && technical.close > (technical.ma240 || technical.ma120 || Infinity),
        },
        marketRegime, peerCatchdownBlock, staleOrFallback: Boolean(priceCoverageTerminal) || !priceMatchesMarketSession || marketEvidence.status !== 'complete' || (valuation ? !valuationMatchesMarketSession : false),
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
        hard_gate_results: { technical_passed: stage.technicalHardGatePassed, actionable_eligible_pre_streak: preStreak.stage === 'actionable', consecutive_actionable_closes: streak, technical_session_date: technical.sessionDate, stale_or_fallback: baseInput.staleOrFallback, peer_catchdown_block: peerCatchdownBlock, classification_replay_hash: classificationReplayHash, classification_replay_consistent: true, factor_evidence: { official: officialEvidenceFactor, broker: brokerFactor, industry_rotation: industryRotationFactor, overseas_peer: overseasPeerFactor } },
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
      const officialFacts = [
        { fact_key: 'close', value: technical.close, unit: 'TWD', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'official_numeric', derivation: {} },
        { fact_key: 'eps_ttm', value: eps?.epsTtm ?? null, unit: 'TWD/share', source_url: 'https://mops.twse.com.tw/', fact_kind: 'official_numeric', derivation: {} },
        { fact_key: 'pe_ratio', value: values?.peRatio ?? null, unit: 'multiple', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'official_numeric', derivation: {} },
        { fact_key: 'pb_ratio', value: values?.pbRatio ?? null, unit: 'multiple', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'official_numeric', derivation: {} },
        { fact_key: 'monthly_revenue', value: numberOrNull(priorRevenue?.monthly_revenue), unit: 'TWD', source_url: 'https://mops.twse.com.tw/mops/web/t21sc04_ifrs', fact_kind: 'official_numeric', derivation: {} },
        { fact_key: 'forward_base_eps', value: earningsBridge.status === 'complete' ? earningsBridge.scenarios.base.dilutedEps : null, unit: 'TWD/share', source_url: 'https://mops.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { model_version: CANDIDATE_VALUATION_MODEL_VERSION, reported_fact_ids: earningsBridge.status === 'complete' ? earningsBridge.factIds : [] } },
        { fact_key: 'bear_target', value: valuation?.bearTarget ?? null, unit: 'TWD', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { model_version: CANDIDATE_VALUATION_MODEL_VERSION, formula: 'scenario_eps_x_historical_pe_p25' } },
        { fact_key: 'base_target', value: valuation?.baseTarget ?? null, unit: 'TWD', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { model_version: CANDIDATE_VALUATION_MODEL_VERSION, formula: 'scenario_eps_x_historical_pe_p50' } },
        { fact_key: 'bull_target', value: valuation?.bullTarget ?? null, unit: 'TWD', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { model_version: CANDIDATE_VALUATION_MODEL_VERSION, formula: 'scenario_eps_x_historical_pe_p75' } },
        { fact_key: 'base_upside_pct', value: valuation?.baseUpsidePct ?? null, unit: 'percent', source_url: values?.sourceUrl || 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { model_version: CANDIDATE_VALUATION_MODEL_VERSION, formula: '(base_target-close)/close*100' } },
        { fact_key: 'ma20', value: technical.ma20, unit: 'TWD', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'simple_moving_average_20' } },
        { fact_key: 'ma60', value: technical.ma60, unit: 'TWD', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'simple_moving_average_60' } },
        { fact_key: 'ma120', value: technical.ma120, unit: 'TWD', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'simple_moving_average_120' } },
        { fact_key: 'ma240', value: technical.ma240, unit: 'TWD', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'simple_moving_average_240' } },
        { fact_key: 'rsi14', value: technical.rsi14, unit: 'index', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'rsi_14' } },
        { fact_key: 'volume_ratio_20_median', value: technical.volumeRatio20Median, unit: 'ratio', source_url: exchangeBySymbol.get(stock.symbol) === 'TPEx' ? 'https://www.tpex.org.tw/' : 'https://www.twse.com.tw/', fact_kind: 'derived_calculation', derivation: { ruleset_version: technical.rulesetVersion, formula: 'volume_divided_by_20_session_median' } },
        { fact_key: 'gap_customer_certification_shipment', value: null, unit: null, source_url: 'https://mops.twse.com.tw/', fact_kind: 'data_gap', derivation: { checked_sources: ['MOPS_structured_facts'], missing: true } },
        { fact_key: 'gap_capacity_yield_asp_company_actions', value: null, unit: null, source_url: 'https://mops.twse.com.tw/', fact_kind: 'data_gap', derivation: { checked_sources: ['MOPS_structured_facts'], missing: true } },
        { fact_key: 'gap_industry_peer_evidence', value: null, unit: null, source_url: 'https://mops.twse.com.tw/', fact_kind: 'data_gap', derivation: { industry_factor: industryRotationFactor.status, overseas_factor: overseasPeerFactor.status, missing: industryRotationFactor.status === 'missing' && overseasPeerFactor.status === 'missing' } },
      ].filter((fact) => fact.value != null || fact.fact_kind === 'data_gap');
      const authorityFacts = ((authorityFactsRes.data as Row[]) || []).filter((fact) => String(fact.estimate_kind || '') === 'reported').map((fact) => ({
        stock_id: stock.id,
        fact_key: String(fact.fact_key || ''),
        period_end: String(fact.period_end || ''),
        value: numberOrNull(fact.value),
        unit: String(fact.unit || ''),
        as_of: String(fact.source_timestamp || fact.filing_published_at || ''),
        available_at: String(fact.collected_at || fact.source_timestamp || ''),
        source_url: officialAuthoritySourceUrl(fact.source_ref),
        fact_kind: 'official_numeric', derivation: {},
        provenance: { upstream_fact_id: String(fact.fact_id || ''), upstream_source_ref: String(fact.source_ref || ''), provider: 'opportunity-v3-official-authority' },
      })).filter((fact) => fact.fact_key && /^\d{4}-\d{2}-\d{2}$/u.test(fact.period_end) && fact.value != null && fact.as_of && fact.available_at);
      const authorityFactWrite = authorityFacts.length ? await supabase.from('candidate_official_facts').upsert(authorityFacts, {
        onConflict: 'stock_id,fact_key,period_end,available_at', ignoreDuplicates: true,
      }).select('fact_id') : { data: [], error: null };
      if (authorityFactWrite.error) throw new Error(authorityFactWrite.error.message);
      const factWrite = officialFacts.length ? await supabase.from('candidate_official_facts').upsert(officialFacts.map((fact) => ({
        stock_id: stock.id, ...fact, period_end: technical.sessionDate, as_of: `${technical.sessionDate}T13:30:00+08:00`,
        available_at: evaluatedAt, provenance: { research_run_id: runId, official: fact.fact_kind === 'official_numeric' },
      })), { onConflict: 'stock_id,fact_key,period_end,available_at', ignoreDuplicates: true }).select('fact_id') : { data: [], error: null };
      if (factWrite.error) throw new Error(factWrite.error.message);
      const factRead = await supabase.from('candidate_official_facts').select('fact_id,fact_key,value,period_end').eq('stock_id', stock.id)
        .lte('available_at', evaluatedAt).order('available_at', { ascending: false }).limit(500);
      if (factRead.error) throw new Error(factRead.error.message);
      const factIds = ((factRead.data as Row[]) || []).map((row) => String(row.fact_id)).filter(Boolean);
      const sectionFacts = ((factRead.data as Row[]) || []).map((row) => ({ factId: String(row.fact_id), factKey: String(row.fact_key), value: numberOrNull(row.value), periodEnd: String(row.period_end || '') }));
      const sourceLinks = roundRobinSourceLinks(recentMentions.flatMap((row) => {
        const url = publicHttpUrl(row.source_url);
        return url ? [{ platform: String(row.platform || 'unknown'), label: String(row.source_name || row.author_name || row.platform || '來源'), url, publishedAt: String(row.mentioned_at || row.available_at || '') }] : [];
      }));
      const detailCard: CandidateStageCard = {
        symbol: stock.symbol, chineseName: stock.name, market: 'TW', lifecycleStage: stage.stage,
        latestMentionAt: latestMentionMs ? new Date(latestMentionMs).toISOString() : evaluatedAt,
        mentionCount: recentMentions.length, rawMentionCount: concentration.rawMentions, effectiveMentionCount: concentration.effectiveMentions,
        publisherCount: concentration.publisherCount, platformCount: concentration.platformCount, dominantPlatformShare: concentration.dominantPlatformShare,
        sources: sourceLinks.map((source) => ({ platform: source.platform, author: null, sourceUrl: source.url, stance: null, mentionedAt: source.publishedAt })),
        scores: stage.scores,
        valuation: { status: valuation ? 'complete' : 'missing', currentPrice: technical.close, bearTarget: valuation?.bearTarget ?? null, baseTarget: valuation?.baseTarget ?? null, bullTarget: valuation?.bullTarget ?? null, probabilityWeightedTarget: valuation?.probabilityWeightedTarget ?? null, baseUpsidePct: valuation?.baseUpsidePct ?? null, bearDownsidePct: valuation?.bearDownsidePct ?? null, rewardRiskRatio: valuation?.rewardRiskRatio ?? null, method: publishedPrimaryMethod ?? valuationPolicy.basis },
        technical: { sessionDate: technical.sessionDate, close: technical.close, ma20: technical.ma20, ma60: technical.ma60, ma120: technical.ma120, ma240: technical.ma240, rsi14: technical.rsi14, volumeRatio20Median: technical.volumeRatio20Median, marketRegime, hardGatePassed: stage.technicalHardGatePassed },
        consecutiveCloses: { passed: streak, required: 2, technicalSessionDate: technical.sessionDate }, classificationReplayHash,
        unmetConditions: [...stage.unmetConditions, ...(priceCoverageTerminal ? [priceCoverageTerminal] : []), ...(valuationPolicy.reason ? [valuationPolicy.reason] : [])], promotionReasons: stage.promotionReasons,
        dataAsOf: evaluatedAt, stale: baseInput.staleOrFallback, detailRevisionId: null, riskAction: null, detailHref: `/stock/${stock.symbol}`,
      };
      const factorEvidence = { official: officialEvidenceFactor, broker: brokerFactor, industry_rotation: industryRotationFactor, overseas_peer: overseasPeerFactor };
      const sections = buildDeterministicCandidateSections({
        card: detailCard, factIds, valuationBasis: valuationPolicy.basis, multipleMonthsCovered,
        sourceCount: recentMentions.length, publisherCount: concentration.publisherCount, platformCount: concentration.platformCount,
        sector: stock.sector, facts: sectionFacts,
        earningsBridge: earningsBridge.status === 'complete' ? earningsBridge as unknown as Record<string, unknown> : null,
        factorEvidence,
      });
      const historicalPrices = [...new Map(bars.map((bar) => [bar.time.slice(0, 7), { month: bar.time.slice(0, 7), close: bar.close }])).values()].slice(-60);
      const historicalMultiples = officialMultiples.slice(-60).map((point) => ({ date: point.date, peRatio: point.peRatio, pbRatio: point.pbRatio }));
      const detailWrite = await supabase.from('candidate_detail_snapshots').upsert({
        stock_id: stock.id, session_date: technical.sessionDate, lifecycle_stage: stage.stage,
        detail_kind: stage.stage === 'found' ? 'fact' : 'full', title: `${stock.name}（${stock.symbol}）營運與估值研究`,
        summary: sections[0].body, sections, fact_ids: factIds, source_links: sourceLinks,
        valuation: { ...detailCard.valuation, basis: valuationPolicy.basis, monthsCovered: multipleMonthsCovered, next12mBridgeComplete, historicalPercentile: valuation?.historicalPercentile ?? null, historicalMultiples, historicalPrices, earningsBridge, factorEvidence, unmetConditions: detailCard.unmetConditions },
        technical: detailCard.technical, market_evidence_snapshot_id: marketEvidence.id, research_run_id: runId,
        ruleset_version: STAGE_RULESET_VERSION, model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
        as_of: `${technical.sessionDate}T13:30:00+08:00`, available_at: evaluatedAt,
        provenance: { official_fact_ids: factIds, source: 'deterministic_candidate_research' },
      }, { onConflict: 'stock_id,session_date,model_version' }).select('id').single();
      if (detailWrite.error || !detailWrite.data) throw new Error(detailWrite.error?.message || 'candidate_detail_write_failed');
      const dossierWrite = await supabase.from('candidate_research_dossiers').insert({
        detail_snapshot_id: detailWrite.data.id, narrative_kind: 'deterministic_fact',
        content: { summary: sections[0].body, sections }, claim_fact_map: Object.fromEntries(sections.map((section) => [section.key, section.factIds])),
        validation_status: 'valid', rejection_reasons: [],
      });
      if (dossierWrite.error) throw new Error(dossierWrite.error.message);
      const snapshotDetail = await supabase.from('candidate_daily_stage_snapshots').update({ detail_revision_id: detailWrite.data.id }).eq('id', snapshot.data.id);
      if (snapshotDetail.error) throw new Error(snapshotDetail.error.message);
      const priorTracking = ((trackingRes.data as Row[]) || [])[0] || null;
      const priorTechnical = ((priorTechnicalRes.data as Row[]) || [])[0] || null;
      const startsActionableEpisode = stage.stage === 'actionable' && previousStage !== 'actionable';
      const signalEpisodeId = startsActionableEpisode
        ? stableHash({ stockId: stock.id, sessionDate: technical.sessionDate, modelVersion: CANDIDATE_STAGE_MODEL_VERSION }).slice(0, 32)
        : priorTracking?.signal_episode_id ? String(priorTracking.signal_episode_id) : null;
      const initialAtr14 = startsActionableEpisode ? technical.atr14 : numberOrNull(priorTracking?.initial_atr14);
      const canSetReference = Boolean(!startsActionableEpisode && signalEpisodeId && priorTracking && String(priorTracking.session_date) < technical.sessionDate);
      const referencePrice = startsActionableEpisode ? null : numberOrNull(priorTracking?.reference_price) ?? (canSetReference ? technical.close : null);
      const referenceSessionDate = startsActionableEpisode ? null : priorTracking?.reference_session_date ? String(priorTracking.reference_session_date) : referencePrice != null ? technical.sessionDate : null;
      const initialStopPrice = startsActionableEpisode ? null : numberOrNull(priorTracking?.initial_stop_price) ?? (referencePrice != null && initialAtr14 != null ? referencePrice - 2 * initialAtr14 : null);
      const priorTechnicalClose = numberOrNull(priorTechnical?.close);
      const priorTechnicalMa60 = numberOrNull(priorTechnical?.ma60);
      const risk = candidateRiskAction({ close: technical.close, referencePrice, atr14: technical.atr14, initialStopPrice, ma20: technical.ma20, ma60: technical.ma60, priorCloseBelowMa60: priorTechnicalClose != null && priorTechnicalMa60 != null && priorTechnicalClose < priorTechnicalMa60, rsi14: technical.rsi14, baseTarget: valuation?.baseTarget ?? null, marketBreakdown: marketRegime === 'breakdown', materialOfficialCounterEvidence: hasMaterialOfficialCounterEvidence });
      const returnPct = referencePrice && referencePrice > 0 ? (technical.close - referencePrice) / referencePrice * 100 : null;
      const taiexReference = referenceSessionDate ? numberOrNull(marketEvidence.taiexCloseByDate[referenceSessionDate]) : null;
      const taiexCurrent = numberOrNull(marketEvidence.taiexCloseByDate[technical.sessionDate]);
      const taiexReturnPct = taiexReference && taiexReference > 0 && taiexCurrent != null
        ? (taiexCurrent - taiexReference) / taiexReference * 100
        : null;
      const taiexRelativeReturnPct = returnPct != null && taiexReturnPct != null ? returnPct - taiexReturnPct : null;
      const peakClose = referencePrice == null ? numberOrNull(priorTracking?.peak_close) : Math.max(referencePrice, numberOrNull(priorTracking?.peak_close) ?? referencePrice, technical.close);
      const priorMaxDrawdownPct = numberOrNull(priorTracking?.max_drawdown_pct);
      const maxDrawdownPct = runningMaxDrawdown(priorMaxDrawdownPct, peakClose, technical.close);
      const trackingWrite = await supabase.from('candidate_signal_tracking').upsert({
        stock_id: stock.id, session_date: technical.sessionDate, reference_session_date: referenceSessionDate, reference_price: referencePrice,
        signal_episode_id: signalEpisodeId, initial_atr14: initialAtr14, initial_stop_price: initialStopPrice, peak_close: peakClose,
        close: technical.close, taiex_relative_return_pct: taiexRelativeReturnPct, max_drawdown_pct: maxDrawdownPct,
        target_hit: valuation?.baseTarget != null && technical.close >= valuation.baseTarget,
        stop_hit: risk.state === 'hard_exit' && risk.reasons.includes('initial_2atr_stop'), risk_action: risk.state,
        action_reasons: risk.reasons, as_of: `${technical.sessionDate}T13:30:00+08:00`, available_at: evaluatedAt, model_version: CANDIDATE_STAGE_MODEL_VERSION,
      }, { onConflict: 'stock_id,session_date,model_version' });
      if (trackingWrite.error) throw new Error(trackingWrite.error.message);
      const valuationTerminalReason = valuation ? null : valuationPolicy.reason || 'no_defensible_valuation_method_from_official_inputs';
      const researchTerminalReason = [priceCoverageTerminal, valuationTerminalReason].filter(Boolean).join(';') || null;
      const valuationStatus = valuation ? 'complete' : valuationPolicy.basis === 'no_defensible_valuation_method' ? 'no_defensible_method' : 'insufficient_official_evidence';
      // An explicit, evidence-backed inability to value is a completed research
      // terminal, not a partial run. It remains found and cannot pass valuation
      // gates, while operational completeness and Shadow can still be measured.
      const researchReadiness = valuation ? 'valuation_ready' : 'evidence_gap';
      Object.assign(result, { status: 'success', executionStatus: 'success', researchReadiness, stage: stage.stage, technicalSessionDate: technical.sessionDate, technicalCoverageStatus: priceCoverageTerminal ? 'insufficient_history' : 'complete', valuationStatus, valuationBasis: valuationPolicy.basis, detailRevisionId: String(detailWrite.data.id), scores: stage.scores, unmetConditions: detailCard.unmetConditions, classificationReplayHash, riskAction: risk });
      const itemWrite = await supabase.from('candidate_research_run_items').upsert({ run_id: runId, stock_id: stock.id, symbol: stock.symbol, status: 'success', execution_status: 'success', research_readiness: researchReadiness, valuation_method: valuationPolicy.basis, narrative_kind: 'deterministic_fact', price_status: 'success', technical_status: priceCoverageTerminal ? 'insufficient_history' : 'success', fundamental_status: eps || values || priorRevenue || authorityFacts.length ? 'success' : 'missing', valuation_status: valuationStatus, classification_status: 'success', lifecycle_stage: stage.stage, terminal_reason: researchTerminalReason, technical_session_date: technical.sessionDate, metrics: result, started_at: startedAt, finished_at: new Date().toISOString() }, { onConflict: 'run_id,stock_id' });
      if (itemWrite.error) throw new Error(itemWrite.error.message);
      return result;
    } catch (error) {
      const reason = (error as Error).message.slice(0, 500);
      // Official APIs and Supabase can occasionally return a transient edge
      // error after earlier idempotent writes have succeeded. Retry the whole
      // stock task with the same run/session identity; every write is an upsert,
      // so this closes the operational gap without changing research inputs.
      if (attempt < 2 && isTransientResearchInfrastructureError(reason)) {
        await waitForResearchRetry(attempt);
        return researchStock(stock, attempt + 1);
      }
      Object.assign(result, { status: 'failed', terminalReason: reason, technicalSessionDate: latestMarketSession, classificationReplayHash: stableHash({ stage: 'found', terminalReason: reason, failClosed: true }) });
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
  };
  const items = await mapLimit(universe, 4, (stock) => researchStock(stock));
  const failedCount = items.filter((item) => item.status === 'failed').length;
  const partialCount = items.filter((item) => item.status === 'partial').length;
  const failClosedWriteFailures = items.filter((item) => item.snapshotError).length;
  const completedCount = items.length - failedCount;
  const technicalSessionDate = items.map((item) => String(item.technicalSessionDate || '')).filter(Boolean).sort().at(-1) || null;
  const runStatus = failedCount === items.length && items.length > 0 ? 'failed' : failedCount > 0 || partialCount > 0 ? 'partial' : 'success';
  const terminalReason = failedCount > 0 ? 'per_stock_failures' : partialCount > 0 ? 'per_stock_partial_research' : null;
  const runUpdate = await supabase.from('candidate_research_runs').update({ status: runStatus, completed_count: completedCount, failed_count: failedCount, technical_session_date: technicalSessionDate, terminal_reason: terminalReason, summary: { items, partialCount, marketEvidence, officialFinancialRefresh, officialFinancialRefreshTargets: financialRefreshTargets.map((target) => target.symbol), officialFinancialRefreshBacklog: financialRefreshBacklog.length, officialFinancialRefreshNextCursor: nextFinancialRefreshCursor }, finished_at: new Date().toISOString() }).eq('id', runId);
  if (runUpdate.error) throw new Error(runUpdate.error.message);
  if (failClosedWriteFailures > 0) throw new Error(`candidate_fail_closed_snapshot_failed:${failClosedWriteFailures}`);
  return {
    runId,
    dryRun: false,
    candidateCount: universe.length,
    completedCount,
    failedCount,
    partialCount,
    technicalSessionDate,
    blocked: false,
    terminalReason,
    marketEvidence,
    manifestId,
    manifestHash,
    items,
  };
}

export async function loadCandidateStageCards(): Promise<{ found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] }> {
  const supabase = getSupabaseServerClient();
  const cutoff = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const mentionSelect = 'stock_id,platform,source_name,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,publisher_key,publisher_name,provenance,stocks(id,symbol,name,market)';
  const latest = (rows: Row[]) => {
    const selected = new Map<string, Row>();
    for (const row of rows) {
      const stockId = String(row.stock_id || '');
      if (stockId && !selected.has(stockId)) selected.set(stockId, row);
    }
    return selected;
  };
  // PostgREST responses containing thousands of joined mention rows can be
  // reset by the upstream proxy before Node receives a response. Page the
  // complete seven-day plane so publication remains complete without one
  // oversized fetch.
  const stagePromise = supabase.from('candidate_daily_stage_snapshots')
    .select('*,stocks(id,symbol,name,market)').eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION)
    .order('session_date', { ascending: false }).order('available_at', { ascending: false }).limit(5000);
  const recentMentions: Row[] = [];
  const mentionPageSize = 750;
  for (let from = 0; from < 10_000; from += mentionPageSize) {
    const page = await supabase.from('candidate_source_mentions').select(mentionSelect)
      .gte('available_at', cutoff).order('available_at', { ascending: false })
      .range(from, from + mentionPageSize - 1);
    if (page.error) throw new Error(page.error.message);
    const rows = (page.data as Row[]) || [];
    recentMentions.push(...rows.filter((row) => candidateMentionDiscoveryEligible(row.provenance, String(row.platform || ''))));
    if (rows.length < mentionPageSize) break;
  }
  const stageRes = await stagePromise;
  if (stageRes.error) throw new Error(stageRes.error.message || 'candidate_stage_read_failed');
  const recentStockIds = [...new Set(recentMentions.map((row) => String(row.stock_id || '')).filter(Boolean))];
  const stageByStock = latest((stageRes.data as Row[]) || []);
  const persistedStockIds = [...stageByStock.entries()].filter(([, stage]) => ['waiting', 'actionable'].includes(String(stage.lifecycle_stage))).map(([stockId]) => stockId);
  const stockIds = [...new Set([...recentStockIds, ...persistedStockIds])];
  if (stockIds.length === 0) return { found: [], waiting: [], actionable: [] };
  const historicalOnlyIds = persistedStockIds.filter((stockId) => !recentStockIds.includes(stockId));
  const [historicalMentionsRes, technicalRes, valuationRes, trackingRes] = await Promise.all([
    historicalOnlyIds.length > 0
      ? supabase.from('candidate_source_mentions').select('stock_id,platform,source_name,author_name,source_url,stance,independent_content_hash,mentioned_at,available_at,publisher_key,publisher_name,provenance,stocks(id,symbol,name,market)').in('stock_id', historicalOnlyIds).order('available_at', { ascending: false }).limit(5000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('technical_feature_snapshots').select('*').in('stock_id', stockIds).order('session_date', { ascending: false }).limit(5000),
    supabase.from('valuation_snapshots').select('*').in('stock_id', stockIds).eq('model_version', CANDIDATE_VALUATION_MODEL_VERSION).order('session_date', { ascending: false }).limit(5000),
    supabase.from('candidate_signal_tracking').select('stock_id,risk_action,action_reasons,session_date').in('stock_id', stockIds).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION).order('session_date', { ascending: false }).limit(5000),
  ]);
  if (historicalMentionsRes.error || technicalRes.error || valuationRes.error || trackingRes.error) throw new Error(historicalMentionsRes.error?.message || technicalRes.error?.message || valuationRes.error?.message || trackingRes.error?.message || 'candidate_stage_read_failed');
  const mentions = [...recentMentions, ...(((historicalMentionsRes.data as Row[]) || []).filter((row) => candidateMentionDiscoveryEligible(row.provenance, String(row.platform || ''))))];
  const technicalByStock = latest((technicalRes.data as Row[]) || []);
  const valuationByStock = latest((valuationRes.data as Row[]) || []);
  const trackingByStock = latest((trackingRes.data as Row[]) || []);
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
    const sourceCandidates = stockMentions.flatMap((row) => {
      const sourceUrl = publicHttpUrl(row.source_url);
      const sourceKey = String(row.independent_content_hash || sourceUrl || '');
      if (!sourceUrl || !sourceKey || seenSources.has(sourceKey)) return [];
      seenSources.add(sourceKey);
      return [{ platform: String(row.platform || 'unknown'), author: row.author_name ? String(row.author_name) : null, sourceUrl, stance: row.stance ? String(row.stance) as CandidateStageCard['sources'][number]['stance'] : null, mentionedAt: String(row.mentioned_at || row.available_at || '') }];
    });
    const sources = roundRobinSourceLinks(sourceCandidates, 2, 8);
    const concentration = sourceConcentration(stockMentions.map((row) => ({
      platform: String(row.platform || 'unknown'),
      publisherKey: String(row.publisher_key || publisherKeyFor({ platform: String(row.platform || 'unknown'), author: row.author_name ? String(row.author_name) : null, sourceUrl: row.source_url ? String(row.source_url) : null, sourceName: row.source_name ? String(row.source_name) : null })),
      contentHash: String(row.independent_content_hash || row.source_url || randomUUID()),
    })));
    const dataAsOf = technical?.available_at ? String(technical.available_at) : stage?.available_at ? String(stage.available_at) : null;
    const stale = hard.stale_or_fallback === true || !dataAsOf || Date.now() - Date.parse(dataAsOf) > 7 * 86_400_000;
    const lifecycleStage: CandidateLifecycleStage = storedLifecycleStage === 'actionable' && stale ? 'waiting' : storedLifecycleStage;
    const unmetConditions = stringArray(stage?.unmet_conditions);
    if (stale && !unmetConditions.includes('stale_or_fallback_data')) unmetConditions.push('stale_or_fallback_data');
    const valuationStale = !valuation?.available_at || Date.now() - Date.parse(String(valuation.available_at)) > 7 * 86_400_000;
    cardsByStock.set(stockId, {
      symbol: String(stock.symbol || ''), chineseName: String(stock.name || stock.symbol || ''), market: String(stock.market || 'TW') === 'US' ? 'US' : 'TW', lifecycleStage,
      latestMentionAt, mentionCount: stockMentions.length, rawMentionCount: concentration.rawMentions,
      effectiveMentionCount: concentration.effectiveMentions, publisherCount: concentration.publisherCount,
      platformCount: concentration.platformCount, dominantPlatformShare: concentration.dominantPlatformShare, sources,
      scores: { discovery: numberOrNull(stage?.discovery_score) || 0, research: numberOrNull(stage?.research_score) || 0, actionability: numberOrNull(stage?.actionability_score) || 0, dataConfidence: numberOrNull(stage?.data_confidence_score) || 0 },
      valuation: { status: valuation ? valuationStale ? 'stale' : 'complete' : 'missing', currentPrice: numberOrNull(valuation?.current_price) ?? numberOrNull(technical?.close), bearTarget: numberOrNull(valuation?.bear_target), baseTarget: numberOrNull(valuation?.base_target), bullTarget: numberOrNull(valuation?.bull_target), probabilityWeightedTarget: numberOrNull(valuation?.probability_weighted_target), baseUpsidePct: valuation ? numberOrNull(stage?.base_upside_pct) : null, bearDownsidePct: valuation ? numberOrNull(stage?.bear_downside_pct) : null, rewardRiskRatio: valuation ? numberOrNull(stage?.reward_risk_ratio) : null, method: valuation?.primary_method ? String(valuation.primary_method) : null },
      technical: { sessionDate: technical?.session_date ? String(technical.session_date) : null, close: numberOrNull(technical?.close), ma20: numberOrNull(technical?.ma20), ma60: numberOrNull(technical?.ma60), ma120: numberOrNull(technical?.ma120), ma240: numberOrNull(technical?.ma240), rsi14: numberOrNull(technical?.rsi14), volumeRatio20Median: numberOrNull(technical?.volume_ratio_20_median), marketRegime: String(stage?.market_regime || technical?.market_regime || 'unknown'), hardGatePassed: hard.technical_passed === true },
      consecutiveCloses: { passed: Math.max(0, Math.min(2, Math.floor(numberOrNull(hard.consecutive_actionable_closes) || 0))), required: 2, technicalSessionDate: hard.technical_session_date ? String(hard.technical_session_date) : null },
      classificationReplayHash: hard.classification_replay_consistent === true && hard.classification_replay_hash ? String(hard.classification_replay_hash) : null,
      unmetConditions, promotionReasons: stringArray(stage?.promotion_reasons), dataAsOf, stale,
      detailRevisionId: stage?.detail_revision_id ? String(stage.detail_revision_id) : null,
      riskAction: trackingByStock.get(stockId) ? {
        state: String(trackingByStock.get(stockId)?.risk_action || 'data_incomplete') as 'hold' | 'trim_no_chase' | 'hard_exit' | 'data_incomplete',
        reasons: stringArray(trackingByStock.get(stockId)?.action_reasons),
      } : null,
      detailHref: `/stock/${String(stock.symbol || '')}`,
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
  publicationPayloadHash: string | null;
  manifestId: string | null;
  manifestHash: string | null;
  researchItems: Row[];
  stages: { found: CandidateStageCard[]; waiting: CandidateStageCard[]; actionable: CandidateStageCard[] };
  technicalSessionDate: string | null;
  activeSourceErrors?: string[];
}) {
  const candidateMap = new Map<string, CandidateStageCard>();
  for (const card of [...input.stages.found, ...input.stages.waiting, ...input.stages.actionable]) candidateMap.set(card.symbol, card);
  const candidates = [...candidateMap.values()];
  if (!input.technicalSessionDate || candidates.length === 0 || !input.manifestId || !input.manifestHash) return null;
  const supabase = getSupabaseServerClient();
  const manifestRead = await supabase.from('candidate_shadow_manifests').select('candidate_symbols,manifest_hash').eq('id', input.manifestId).eq('policy_version', SHADOW_POLICY_VERSION).single();
  if (manifestRead.error || !manifestRead.data) throw new Error(`shadow_manifest_missing:${manifestRead.error?.message || 'not_found'}`);
  if (String(manifestRead.data.manifest_hash) !== input.manifestHash) throw new Error('shadow_manifest_hash_mismatch');
  const manifestSymbols = (Array.isArray(manifestRead.data.candidate_symbols) ? manifestRead.data.candidate_symbols : []).map(String).sort();
  const stageRead = await supabase.from('candidate_daily_stage_snapshots')
    .select('lifecycle_stage,hard_gate_results,available_at,stocks(symbol)')
    .eq('session_date', input.technicalSessionDate).eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_STAGE_MODEL_VERSION);
  if (stageRead.error) throw new Error(`shadow_stage_authority_read_failed:${stageRead.error.message}`);
  const terminalBySymbol = new Map(input.researchItems.filter((item) => ['success','partial','failed'].includes(String(item.status))).map((item) => [String(item.symbol), item]));
  const authoritativeStages = ((stageRead.data as Row[]) || []).flatMap((row) => {
    const stock = rowRelation(row.stocks);
    const hard = rowRelation(row.hard_gate_results) || {};
    const symbol = String(stock?.symbol || '');
    return symbol ? [{
      symbol,
      stage: String(row.lifecycle_stage || 'found'),
      replayHash: hard.classification_replay_hash ? String(hard.classification_replay_hash) : null,
      replayConsistent: hard.classification_replay_consistent === true,
      stale: hard.stale_or_fallback === true,
    }] : [];
  });
  const replayInputs = buildShadowReplayInputs(manifestSymbols, authoritativeStages
    .map((stage) => ({ symbol: stage.symbol, stage: stage.stage, replayHash: stage.replayHash })));
  const replayBySymbol = new Map(replayInputs.map((item) => [item.symbol, item]));
  const stageBySymbol = new Map(authoritativeStages.map((stage) => [stage.symbol, stage]));
  const replayMissing = manifestSymbols.some((symbol) => !stageBySymbol.get(symbol)?.replayConsistent || !String(terminalBySymbol.get(symbol)?.classificationReplayHash || replayBySymbol.get(symbol)?.replayHash || ''));
  const replayHash = createHash('sha256').update(JSON.stringify(replayInputs)).digest('hex');
  // Operational completeness counts a correctly terminal partial/fail-closed
  // result as researched. It does not average investment confidence scores.
  const completeness = round(manifestSymbols.length ? manifestSymbols.filter((symbol) => terminalBySymbol.has(symbol) && stageBySymbol.has(symbol)).length / manifestSymbols.length * 100 : 0, 2);
  const freshness = round(manifestSymbols.length ? manifestSymbols.filter((symbol) => stageBySymbol.has(symbol) && !stageBySymbol.get(symbol)?.stale).length / manifestSymbols.length * 100 : 0, 2);
  const blockers = [
    completeness < 95 ? 'manifest_terminal_coverage_below_95' : null,
    freshness < 95 ? 'official_session_freshness_below_95' : null,
    replayMissing ? 'classification_replay_missing' : null,
    !input.publicationId || !input.publicationPayloadHash ? 'atomic_publication_missing' : null,
    ...(input.activeSourceErrors || []).map((item) => `active_source:${item}`),
  ].filter((item): item is string => Boolean(item));
  const qualifying = blockers.length === 0;
  const observedAt = new Date().toISOString();
  const existing = await supabase.from('candidate_shadow_session_observations').select('id,manifest_id,replay_hash,payload_hash,reproducibility_status')
    .eq('session_date', input.technicalSessionDate).eq('ruleset_version', STAGE_RULESET_VERSION)
    .eq('model_version', CANDIDATE_RESEARCH_MODEL_VERSION).eq('shadow_policy_version', SHADOW_POLICY_VERSION).maybeSingle();
  if (existing.error) throw new Error(existing.error.message);
  const conflict = Boolean(existing.data && shadowReplayConflicts({
    existingManifestId: String(existing.data.manifest_id || '') || null,
    existingReplayHash: String(existing.data.replay_hash || '') || null,
    existingStatus: String(existing.data.reproducibility_status || '') || null,
    manifestId: input.manifestId,
    replayHash,
  }));
  const finalBlockers = conflict ? [...new Set([...blockers, 'same_manifest_replay_conflict'])] : blockers;
  const attempt = await supabase.from('candidate_shadow_attempts').insert({
    manifest_id: input.manifestId, pipeline_run_id: input.pipelineRunId, publication_id: input.publicationId,
    payload_hash: input.publicationPayloadHash, terminal_count: terminalBySymbol.size, candidate_count: manifestSymbols.length,
    completeness_pct: completeness, freshness_pct: freshness, replay_hash: replayHash,
    status: conflict ? 'conflict' : qualifying ? 'qualified' : 'failed', blockers: finalBlockers,
    started_at: observedAt, finished_at: observedAt,
  }).select('id').single();
  if (attempt.error || !attempt.data) throw new Error(`shadow_attempt_write_failed:${attempt.error?.message || 'missing'}`);
  const row = {
    session_date: input.technicalSessionDate, ruleset_version: STAGE_RULESET_VERSION, model_version: CANDIDATE_RESEARCH_MODEL_VERSION,
    pipeline_run_id: input.pipelineRunId, publication_id: input.publicationId, candidate_count: manifestSymbols.length,
    found_count: candidates.filter((card) => card.lifecycleStage === 'found').length, waiting_count: input.stages.waiting.length,
    actionable_count: input.stages.actionable.length, completeness_pct: completeness, freshness_pct: freshness,
    active_source_errors: input.activeSourceErrors || [], canonical_input_hash: input.manifestHash, replay_hash: replayHash,
    reproducibility_status: conflict ? 'conflict' : 'matched', qualifying: qualifying && !conflict, blockers: finalBlockers,
    observed_at: observedAt, published_at: observedAt, shadow_policy_version: SHADOW_POLICY_VERSION,
    manifest_id: input.manifestId, attempt_id: attempt.data.id, payload_hash: input.publicationPayloadHash,
    updated_at: observedAt,
  };
  if (!existing.data) {
    const observation = await supabase.from('candidate_shadow_session_observations').insert(row);
    if (observation.error) throw new Error(`shadow_observation_write_failed:${observation.error.message}`);
  }
  return { sessionDate: input.technicalSessionDate, policyVersion: SHADOW_POLICY_VERSION, qualifying: qualifying && !conflict, conflict, completeness, freshness, blockers: finalBlockers, attemptId: String(attempt.data.id) };
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
  const rows = await supabase.from('candidate_shadow_session_observations').select('session_date,qualifying,blockers').eq('ruleset_version', STAGE_RULESET_VERSION).eq('model_version', CANDIDATE_RESEARCH_MODEL_VERSION).eq('shadow_policy_version', SHADOW_POLICY_VERSION).order('session_date', { ascending: true });
  if (rows.error) throw new Error(rows.error.message);
  const data = (rows.data as Row[]) || [];
  const qualifying = data.filter((row) => row.qualifying === true).length;
  return { observed: data.length, qualifying, required: SHADOW_REQUIRED_SESSIONS, remaining: Math.max(0, SHADOW_REQUIRED_SESSIONS - qualifying), startedOn: data[0]?.session_date ? String(data[0].session_date) : null, latestSession: data.at(-1)?.session_date ? String(data.at(-1)?.session_date) : null, blockers: stringArray(data.at(-1)?.blockers), policyVersion: SHADOW_POLICY_VERSION };
}
