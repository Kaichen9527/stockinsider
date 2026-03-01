import { getSupabaseServerClient } from './supabase-server';
import type { DailyMarketFocus, LinePreference, RecommendationCard, StockInsightPayload, StrategyActionView } from './types';
import { randomUUID } from 'crypto';

const RISK_DISCLOSURE = '本服務僅提供研究資訊，非投資建議，投資決策與風險由使用者自行承擔。';

type Row = Record<string, unknown>;

function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Number(value);
  return Number.NaN;
}

function mapRecommendation(raw: Row): RecommendationCard {
  const stock = (raw.stocks as Row | undefined) || {};
  const strategy = (raw.strategy_actions as Row | undefined) || {};

  return {
    recommendationId: String(raw.id || ''),
    symbol: String(stock.symbol || 'UNKNOWN'),
    name: String(stock.name || stock.symbol || 'Unknown'),
    market: (stock.market as 'TW' | 'US') || 'TW',
    score: toNumber(raw.score),
    confidence: toNumber(raw.confidence),
    action: (raw.action as 'buy' | 'watch' | 'reduce') || 'watch',
    rationale: String(raw.rationale || ''),
    targetPrice: strategy.target_price ? toNumber(strategy.target_price) : null,
    stopLoss: strategy.stop_loss ? toNumber(strategy.stop_loss) : null,
    strategyState: strategy.state as RecommendationCard['strategyState'],
  };
}

export async function getDailyDashboardData() {
  const supabaseServer = getSupabaseServerClient();
  const [tw, us, recs] = await Promise.all([
    supabaseServer.from('market_snapshots').select('*').eq('market', 'TW').order('as_of', { ascending: false }).limit(1),
    supabaseServer.from('market_snapshots').select('*').eq('market', 'US').order('as_of', { ascending: false }).limit(1),
    supabaseServer
      .from('recommendations')
      .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
      .eq('is_blocked', false)
      .order('as_of', { ascending: false })
      .order('score', { ascending: false })
      .limit(20),
  ]);

  if (tw.error || us.error || recs.error) {
    throw new Error(tw.error?.message || us.error?.message || recs.error?.message || 'Failed to fetch dashboard data');
  }

  const marketFocus: DailyMarketFocus[] = [tw.data?.[0], us.data?.[0]]
    .filter(Boolean)
    .map((value) => {
      const row = value as Row;
      return {
        market: (row.market as 'TW' | 'US') || 'TW',
        asOf: String(row.as_of || ''),
        sectorFlows: (row.sector_flows as Record<string, number>) || {},
        indexState: (row.index_state as Record<string, unknown>) || {},
        freshness: (row.freshness_status as DailyMarketFocus['freshness']) || 'missing',
      };
    });

  const recommendations = ((recs.data as Row[]) || []).map(mapRecommendation);
  return { marketFocus, recommendations, riskDisclosure: RISK_DISCLOSURE };
}

export async function getRecommendationList(_market?: string, minScore?: number) {
  const supabaseServer = getSupabaseServerClient();
  let query = supabaseServer
    .from('recommendations')
    .select('*, stocks(symbol,name,market), strategy_actions(state,target_price,stop_loss)')
    .eq('is_blocked', false)
    .order('as_of', { ascending: false })
    .order('score', { ascending: false })
    .limit(50);

  if (typeof minScore === 'number' && Number.isFinite(minScore)) {
    query = query.gte('score', minScore);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(error.message);
  }

  return ((data as Row[]) || []).map(mapRecommendation);
}

export async function getStockInsight(symbol: string): Promise<StockInsightPayload | null> {
  const supabaseServer = getSupabaseServerClient();
  const stockRes = await supabaseServer.from('stocks').select('*').eq('symbol', symbol).limit(1);
  if (stockRes.error) throw new Error(stockRes.error.message);
  const stock = (stockRes.data?.[0] as Row | undefined) || null;
  if (!stock) return null;

  const [signalRes, recommendationRes] = await Promise.all([
    supabaseServer.from('stock_signals').select('*').eq('stock_id', stock.id as string).order('as_of', { ascending: false }).limit(60),
    supabaseServer
      .from('recommendations')
      .select('*, stocks(symbol,name,market), strategy_actions(*)')
      .eq('stock_id', stock.id as string)
      .order('as_of', { ascending: false })
      .limit(1),
  ]);

  if (signalRes.error || recommendationRes.error) {
    throw new Error(signalRes.error?.message || recommendationRes.error?.message || 'Failed to fetch stock insight');
  }

  const latestSignal = (signalRes.data?.[0] as Row | undefined) || null;
  if (!latestSignal) return null;

  const chartSource = ((signalRes.data as Row[]) || []).slice(0, 30).reverse();
  const chart = chartSource.map((row, idx) => {
    const close = toNumber(row.price);
    const spread = Math.max(3, close * 0.015);
    const open = close - (idx % 2 === 0 ? spread * 0.4 : -spread * 0.3);
    const high = Math.max(open, close) + spread * 0.6;
    const low = Math.min(open, close) - spread * 0.5;
    return {
      time: String(row.as_of || '').slice(0, 10),
      open: Number(open.toFixed(2)),
      high: Number(high.toFixed(2)),
      low: Number(low.toFixed(2)),
      close: Number(close.toFixed(2)),
    };
  });

  const recommendationRaw = (recommendationRes.data?.[0] as Row | undefined) || undefined;
  const recommendation = recommendationRaw ? mapRecommendation(recommendationRaw) : undefined;
  const strategyRaw = (recommendationRaw?.strategy_actions as Row | undefined) || undefined;

  const strategy: StrategyActionView | undefined = strategyRaw
    ? {
        id: String(strategyRaw.id || ''),
        recommendationId: String(strategyRaw.recommendation_id || ''),
        entryRule: String(strategyRaw.entry_rule || ''),
        positionSizeRule: String(strategyRaw.position_size_rule || ''),
        targetPrice: strategyRaw.target_price ? toNumber(strategyRaw.target_price) : null,
        stopLoss: strategyRaw.stop_loss ? toNumber(strategyRaw.stop_loss) : null,
        reviewHorizon: strategyRaw.review_horizon ? String(strategyRaw.review_horizon) : null,
        state: (strategyRaw.state as StrategyActionView['state']) || 'active',
      }
    : undefined;

  return {
    symbol: String(stock.symbol || ''),
    name: String(stock.name || ''),
    market: (stock.market as 'TW' | 'US') || 'TW',
    price: toNumber(latestSignal.price),
    volume: latestSignal.volume ? Number(latestSignal.volume) : null,
    asOf: String(latestSignal.as_of || ''),
    freshness: (latestSignal.freshness_status as StockInsightPayload['freshness']) || 'missing',
    chart,
    indicators: {
      maShort: latestSignal.ma_short ? toNumber(latestSignal.ma_short) : null,
      maMid: latestSignal.ma_mid ? toNumber(latestSignal.ma_mid) : null,
      maLong: latestSignal.ma_long ? toNumber(latestSignal.ma_long) : null,
      rsi: latestSignal.rsi ? toNumber(latestSignal.rsi) : null,
      macd: latestSignal.macd ? toNumber(latestSignal.macd) : null,
      macdSignal: latestSignal.macd_signal ? toNumber(latestSignal.macd_signal) : null,
    },
    chipMetrics: (latestSignal.chip_metrics as Record<string, unknown>) || {},
    strategy,
    recommendation,
    riskDisclosure: RISK_DISCLOSURE,
  };
}

function scoreToAction(score: number): 'buy' | 'watch' | 'reduce' {
  if (score >= 0.7) return 'buy';
  if (score >= 0.5) return 'watch';
  return 'reduce';
}

export async function getLatestIngestionState(maxAgeMinutes = 120) {
  const supabaseServer = getSupabaseServerClient();
  const { data, error } = await supabaseServer
    .from('pipeline_runs')
    .select('*')
    .eq('run_type', 'ingestion')
    .order('started_at', { ascending: false })
    .limit(1);
  if (error) throw new Error(error.message);

  const latest = (data?.[0] as Row | undefined) || null;
  if (!latest) {
    return { ok: false, reason: 'no ingestion run found', latest: null };
  }

  const startedAt = latest.started_at ? new Date(String(latest.started_at)).getTime() : 0;
  const ageMinutes = startedAt ? (Date.now() - startedAt) / 60000 : Number.POSITIVE_INFINITY;
  if (String(latest.status || '') !== 'success') {
    return { ok: false, reason: 'latest ingestion not success', latest };
  }
  if (ageMinutes > maxAgeMinutes) {
    return { ok: false, reason: `ingestion older than ${maxAgeMinutes} minutes`, latest };
  }
  return { ok: true, reason: null, latest };
}

export async function runRecommendationBatch(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const supabaseServer = getSupabaseServerClient();
  const nowIso = new Date().toISOString();
  const asOf = nowIso.slice(0, 10);
  const runId = randomUUID();

  const [signalsRes, marketRes] = await Promise.all([
    supabaseServer.from('stock_signals').select('*, stocks(*)').eq('freshness_status', 'fresh').order('as_of', { ascending: false }).limit(200),
    supabaseServer.from('market_snapshots').select('*').order('as_of', { ascending: false }).limit(20),
  ]);

  if (signalsRes.error || marketRes.error) {
    throw new Error(signalsRes.error?.message || marketRes.error?.message || 'Failed to query source signals');
  }

  const latestByStock = new Map<string, Row>();
  for (const item of (signalsRes.data as Row[]) || []) {
    const key = String(item.stock_id || '');
    if (!key) continue;
    if (!latestByStock.has(key)) latestByStock.set(key, item);
  }

  const latestByMarket = new Map<string, Row>();
  for (const item of (marketRes.data as Row[]) || []) {
    const key = String(item.market || '');
    if (!key) continue;
    if (!latestByMarket.has(key)) latestByMarket.set(key, item);
  }

  if (!dryRun) {
    await supabaseServer.from('pipeline_runs').insert({
      id: runId,
      run_type: 'recommendation',
      status: 'running',
      details: { step: 'started', as_of: asOf },
    });
  }

  try {
    let written = 0;
    for (const row of latestByStock.values()) {
    const stock = (row.stocks as Row | undefined) || null;
    if (!stock) continue;

    const marketSnapshot = latestByMarket.get(String(stock.market || ''));
    const indexState = ((marketSnapshot?.index_state as Row | undefined) || {});
    const marketScore = Number(indexState.trend_score || 0.5);
    const technicalBase = Number(row.rsi || 50) >= 45 && Number(row.rsi || 50) <= 70 ? 0.7 : 0.45;
    const macdBoost = Number(row.macd || 0) >= Number(row.macd_signal || 0) ? 0.15 : 0;
    const score = Math.min(1, marketScore * 0.35 + technicalBase * 0.45 + macdBoost + 0.1);
    const confidence = Math.min(1, Math.max(0.35, score - 0.05));
    const action = scoreToAction(score);

      if (!dryRun) {
        const recRes = await supabaseServer
        .from('recommendations')
        .upsert(
          {
            stock_id: stock.id,
            as_of: asOf,
            market_scope: stock.market === 'TW' ? 'TW_PRIMARY' : 'US_SECONDARY',
            score,
            confidence,
            action,
            rationale: `market=${marketScore.toFixed(2)} technical=${technicalBase.toFixed(2)} macdBoost=${macdBoost.toFixed(2)}`,
            signal_breakdown: { market: marketScore, technical: technicalBase, macdBoost },
            is_blocked: false,
            published_at: nowIso,
          },
          { onConflict: 'stock_id,as_of' },
        )
        .select('id')
        .single();

        if (recRes.error || !recRes.data) throw new Error(recRes.error?.message || 'Failed writing recommendation');

        await supabaseServer.from('strategy_actions').upsert(
          {
            recommendation_id: recRes.data.id,
            entry_rule: action === 'buy' ? 'Break above MA5 with volume support' : 'Wait for better setup',
            position_size_rule: action === 'buy' ? (stock.market === 'TW' ? '10-20% portfolio' : '5-10% portfolio') : 'Keep defensive sizing',
            target_price: Number(row.price || 0) * (action === 'buy' ? 1.12 : 1.06),
            stop_loss: Number(row.price || 0) * 0.92,
            review_horizon: action === 'buy' ? '7-14 days' : '3-7 days',
            state: action === 'reduce' ? 'invalidated' : 'active',
            state_changed_at: nowIso,
            updated_at: nowIso,
          },
          { onConflict: 'recommendation_id' },
        );
      }

      written += 1;
    }

    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: { written, as_of: asOf, dry_run: false },
          finished_at: nowIso,
        })
        .eq('id', runId);
    }

    return { asOf, written, runId, dryRun };
  } catch (error) {
    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: { as_of: asOf, dry_run: false, error: (error as Error).message },
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
    throw error;
  }
}

export async function bindLinePreference(input: LinePreference & { userId?: string }) {
  const supabaseServer = getSupabaseServerClient();
  const payload = {
    user_id: input.userId || null,
    line_user_id: input.lineUserId,
    watchlist: input.watchlist || [],
    event_preferences: input.eventPreferences || {},
    digest_enabled: input.digestEnabled,
    throttle_minutes: input.throttleMinutes,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabaseServer
    .from('line_subscriptions')
    .upsert(payload, { onConflict: 'line_user_id' })
    .select('*')
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function dispatchLineEvents(options?: { dryRun?: boolean }) {
  const dryRun = Boolean(options?.dryRun);
  const supabaseServer = getSupabaseServerClient();
  const runId = randomUUID();
  const pendingRes = await supabaseServer
    .from('line_alert_events')
    .select('id,event_type,payload')
    .eq('delivery_status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200);
  if (pendingRes.error) throw new Error(pendingRes.error.message);

  const subscriptionsRes = await supabaseServer.from('line_subscriptions').select('*');
  if (subscriptionsRes.error) throw new Error(subscriptionsRes.error.message);

  const subscriptions = (subscriptionsRes.data as Row[]) || [];
  const now = new Date().toISOString();
  let sent = 0;
  let skipped = 0;

  if (!dryRun) {
    await supabaseServer.from('pipeline_runs').insert({
      id: runId,
      run_type: 'line_dispatch',
      status: 'running',
      details: { step: 'started' },
    });
  }

  try {
    for (const event of (pendingRes.data as Row[]) || []) {
      const eventType = String(event.event_type || '');
      let canDeliver = false;

      for (const sub of subscriptions) {
        const prefs = ((sub.event_preferences as Row | undefined) || {});
        if (eventType === 'daily_digest') {
          if (Boolean(sub.digest_enabled) && prefs.daily_digest !== false) {
            canDeliver = true;
            break;
          }
        } else if (prefs[eventType] !== false) {
          canDeliver = true;
          break;
        }
      }

      if (canDeliver) {
        if (!dryRun) {
          await supabaseServer.from('line_alert_events').update({ delivery_status: 'sent', sent_at: now }).eq('id', event.id as string);
        }
        sent += 1;
      } else {
        if (!dryRun) {
          await supabaseServer.from('line_alert_events').update({ delivery_status: 'skipped', sent_at: now }).eq('id', event.id as string);
        }
        skipped += 1;
      }
    }

    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'success',
          details: { sent, skipped, dry_run: false },
          finished_at: now,
        })
        .eq('id', runId);
    }

    return { sent, skipped, runId, dryRun };
  } catch (error) {
    if (!dryRun) {
      await supabaseServer
        .from('pipeline_runs')
        .update({
          status: 'failed',
          details: { dry_run: false, error: (error as Error).message },
          finished_at: new Date().toISOString(),
        })
        .eq('id', runId);
    }
    throw error;
  }
}

export async function runMonitoringChecks() {
  const supabaseServer = getSupabaseServerClient();
  const now = new Date();
  const sinceIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const [pipelineRes, recRes, sourceHealthRes] = await Promise.all([
    supabaseServer.from('pipeline_runs').select('*').gte('started_at', sinceIso).order('started_at', { ascending: false }).limit(100),
    supabaseServer.from('recommendations').select('id,is_blocked,created_at').gte('created_at', sinceIso).limit(500),
    supabaseServer.from('source_health_checks').select('*').gte('checked_at', sinceIso).order('checked_at', { ascending: false }).limit(300),
  ]);

  if (pipelineRes.error || recRes.error || sourceHealthRes.error) {
    throw new Error(pipelineRes.error?.message || recRes.error?.message || sourceHealthRes.error?.message || 'monitoring query failed');
  }

  const alerts: Array<{ type: string; level: 'warning' | 'critical'; message: string; context?: Record<string, unknown> }> = [];

  const pipelineRuns = (pipelineRes.data as Row[]) || [];
  const failedRuns = pipelineRuns.filter((row) => String(row.status || '') === 'failed');
  if (failedRuns.length > 0) {
    alerts.push({
      type: 'pipeline_failed',
      level: 'critical',
      message: `${failedRuns.length} pipeline run(s) failed in last 24h`,
      context: { recentFailedRuns: failedRuns.slice(0, 3) },
    });
  }

  const recs = (recRes.data as Row[]) || [];
  if (recs.length > 0) {
    const blocked = recs.filter((r) => Boolean(r.is_blocked)).length;
    const ratio = blocked / recs.length;
    const threshold = Number(process.env.BLOCKED_RECOMMENDATION_ALERT_RATIO || 0.35);
    if (ratio >= threshold) {
      alerts.push({
        type: 'freshness_gate_ratio',
        level: 'warning',
        message: `blocked recommendation ratio high: ${(ratio * 100).toFixed(1)}%`,
        context: { blocked, total: recs.length, threshold },
      });
    }
  }

  const healthRows = (sourceHealthRes.data as Row[]) || [];
  const parseThreshold = Number(process.env.SOURCE_MIN_PARSE_SUCCESS_RATIO || 0.6);
  const unhealthy = healthRows.filter((row) => Number(row.parse_success_ratio || 1) < parseThreshold);
  if (unhealthy.length > 0) {
    alerts.push({
      type: 'source_parse_ratio_low',
      level: 'warning',
      message: `${unhealthy.length} source health checks below parse success threshold`,
      context: { threshold: parseThreshold, samples: unhealthy.slice(0, 5) },
    });
  }

  return {
    checkedAt: now.toISOString(),
    alerts,
  };
}
