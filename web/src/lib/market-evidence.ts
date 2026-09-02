import { getSupabaseServerClient } from './supabase-server.ts';
import type { MarketRiskRegime } from './stage-classifier.ts';
import { fetchOfficialJson, fetchTwseMarketDailyRows } from './tw-market.ts';

type Row = Record<string, unknown>;
export const MARKET_EVIDENCE_MODEL_VERSION = 'market-evidence-v2.0.0';
const OFFICIAL_MARKET_HISTORY_MODEL_VERSION = 'official-market-history-v1.0.0';

function numberOrNull(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rocDate(value: unknown) {
  const match = String(value || '').trim().match(/^(\d{3})[\/-](\d{2})[\/-](\d{2})$/u);
  return match ? `${Number(match[1]) + 1911}-${match[2]}-${match[3]}` : null;
}

function tableWithFields(payload: Record<string, unknown>, required: string[]) {
  return (Array.isArray(payload.tables) ? payload.tables : []).find((candidate) => {
    if (!candidate || typeof candidate !== 'object') return false;
    const fields = Array.isArray((candidate as Row).fields) ? ((candidate as Row).fields as unknown[]).map(String) : [];
    return required.every((field) => fields.includes(field));
  }) as Row | undefined;
}

export function parseTaiexHistory(payload: Record<string, unknown>) {
  const fields = Array.isArray(payload.fields) ? payload.fields.map(String) : [];
  const dateIndex = fields.indexOf('日期');
  const closeIndex = fields.indexOf('收盤指數');
  if (dateIndex < 0 || closeIndex < 0 || !Array.isArray(payload.data)) return [];
  return payload.data.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const date = rocDate(row[dateIndex]);
    const close = numberOrNull(String(row[closeIndex] || '').replace(/,/gu, ''));
    return date && close != null && close > 0 ? [{ date, close }] : [];
  });
}

export function parseTpexIndex(payload: Record<string, unknown>) {
  const table = tableWithFields(payload, ['日期', '櫃買指數']);
  const fields = Array.isArray(table?.fields) ? (table!.fields as unknown[]).map(String) : [];
  const rows = Array.isArray(table?.data) ? table!.data as unknown[] : [];
  const dateIndex = fields.indexOf('日期');
  const closeIndex = fields.indexOf('櫃買指數');
  return rows.flatMap((row) => {
    if (!Array.isArray(row)) return [];
    const date = rocDate(row[dateIndex]);
    const close = numberOrNull(String(row[closeIndex] || '').replace(/,/gu, ''));
    return date && close != null && close > 0 ? [{ date, close }] : [];
  });
}

export function parseTpexDailyCloses(payload: Record<string, unknown>) {
  const table = tableWithFields(payload, ['代號', '收盤']);
  const fields = Array.isArray(table?.fields) ? (table!.fields as unknown[]).map(String) : [];
  const rows = Array.isArray(table?.data) ? table!.data as unknown[] : [];
  const symbolIndex = fields.indexOf('代號');
  const closeIndex = fields.indexOf('收盤');
  const result = new Map<string, number>();
  for (const row of rows) {
    if (!Array.isArray(row)) continue;
    const symbol = String(row[symbolIndex] || '').trim();
    const close = numberOrNull(String(row[closeIndex] || '').replace(/,/gu, ''));
    if (/^\d{4}$/u.test(symbol) && close != null && close > 0) result.set(symbol, close);
  }
  return result;
}

export function parseForeignNetTwd(payload: Record<string, unknown>, market: 'TWSE' | 'TPEX') {
  const table = market === 'TWSE'
    ? { fields: payload.fields, data: payload.data }
    : tableWithFields(payload, ['單位名稱', '買賣超(元)']);
  const fields = Array.isArray((table as Row | undefined)?.fields) ? ((table as Row).fields as unknown[]).map(String) : [];
  const rows = Array.isArray((table as Row | undefined)?.data) ? (table as Row).data as unknown[] : [];
  const nameIndex = fields.indexOf('單位名稱');
  const valueIndex = market === 'TWSE' ? fields.indexOf('買賣差額') : fields.indexOf('買賣超(元)');
  const row = rows.find((candidate) => Array.isArray(candidate) && (
    market === 'TWSE'
      ? String(candidate[nameIndex] || '').includes('外資及陸資(不含外資自營商)')
      : String(candidate[nameIndex] || '').trim() === '外資及陸資合計'
  ));
  return Array.isArray(row) ? numberOrNull(String(row[valueIndex] || '').replace(/,/gu, '')) : null;
}

function monthStarts(sessions: string[]) {
  return [...new Set(sessions.map((date) => `${date.slice(0, 7)}-01`))];
}

function breadthForRoster(history: Map<string, Array<{ date: string; close: number }>>, roster: Set<string>) {
  let numerator = 0;
  let observed = 0;
  for (const symbol of roster) {
    const rows = (history.get(symbol) || []).sort((a, b) => a.date.localeCompare(b.date)).slice(-20);
    if (rows.length < 20) continue;
    observed += 1;
    const average = rows.reduce((sum, row) => sum + row.close, 0) / rows.length;
    if (rows.at(-1)!.close > average) numerator += 1;
  }
  return { numerator, observed, eligible: roster.size };
}

async function ingestOfficialMarketEvidence(sessionDate: string, evaluatedAt: string) {
  const supabase = getSupabaseServerClient();
  const [sessionsRes, rosterRes, existingRes] = await Promise.all([
    supabase.from('tw_trading_sessions_v3').select('session_id,status').eq('status', 'completed').lte('session_id', sessionDate).order('session_id', { ascending: false }).limit(700),
    supabase.from('stock_instruments_v3').select('symbol,exchange,instrument_type,listing_status,valid_from,valid_to,recorded_at').eq('instrument_type', 'common_stock').eq('listing_status', 'active').lte('valid_from', evaluatedAt).order('recorded_at', { ascending: false }).limit(10000),
    supabase.from('official_market_evidence_history').select('market,session_date,index_close,breadth_above_ma20,breadth_observed,breadth_eligible,foreign_net_twd,source_urls,available_at').lte('available_at', evaluatedAt).lte('session_date', sessionDate).order('session_date', { ascending: false }).limit(1400),
  ]);
  if (sessionsRes.error || rosterRes.error) throw new Error(`official_market_prerequisite_failed:${sessionsRes.error?.message || rosterRes.error?.message}`);
  // The additive migration can be deployed independently. A missing table is a
  // critical deployment error, not permission to silently fall back to unknown.
  if (existingRes.error) throw new Error(`official_market_history_read_failed:${existingRes.error.message}`);
  const sessions = [...new Set(((sessionsRes.data as Row[]) || []).map((row) => String(row.session_id)).filter((date) => /^\d{4}-\d{2}-\d{2}$/u.test(date)))].sort().slice(-520);
  if (sessions.length < 520 || sessions.at(-1) !== sessionDate) throw new Error('official_market_session_history_below_520');
  const existing = (existingRes.data as Row[]) || [];
  const marketCount = (market: string) => existing.filter((row) => row.market === market && numberOrNull(row.index_close) != null).length;
  const latestRows = existing.filter((row) => row.session_date === sessionDate);
  const complete = marketCount('TWSE') >= 520 && marketCount('TPEX') >= 520
    && latestRows.length === 2 && latestRows.every((row) => numberOrNull(row.breadth_observed) != null)
    && sessions.slice(-5).every((date) => ['TWSE','TPEX'].every((market) => existing.some((row) => row.market === market && row.session_date === date && numberOrNull(row.foreign_net_twd) != null)));
  if (complete) return;

  const latestInstrument = new Map<string, Row>();
  for (const row of (rosterRes.data as Row[]) || []) {
    const symbol = String(row.symbol || '');
    if (!latestInstrument.has(symbol) && (!row.valid_to || String(row.valid_to) > evaluatedAt)) latestInstrument.set(symbol, row);
  }
  const twseRoster = new Set([...latestInstrument.values()].filter((row) => row.exchange === 'TWSE').map((row) => String(row.symbol)));
  const tpexRoster = new Set([...latestInstrument.values()].filter((row) => row.exchange === 'TPEX').map((row) => String(row.symbol)));
  if (twseRoster.size === 0 || tpexRoster.size === 0) throw new Error('official_market_active_common_roster_missing');

  const taiexMonths = monthStarts(sessions);
  const taiexPayloads = await Promise.all(taiexMonths.map(async (month) => {
    const date = month.replace(/-/gu, '');
    const url = `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${date}&response=json`;
    const payload = await fetchOfficialJson<Record<string, unknown>>(url, 12_000);
    return { url, rows: payload ? parseTaiexHistory(payload) : [] };
  }));
  const taiex = new Map(taiexPayloads.flatMap((result) => result.rows).filter((row) => sessions.includes(row.date)).map((row) => [row.date, row.close]));
  const tpexIndexPayloads = await Promise.all(sessions.map(async (date) => {
    const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingIndex?date=${date.replace(/-/gu, '/')}&response=json`;
    const payload = await fetchOfficialJson<Record<string, unknown>>(url, 12_000);
    return { date, url, close: payload ? parseTpexIndex(payload).find((row) => row.date === date)?.close ?? null : null };
  }));
  const last20 = sessions.slice(-20);
  const [twseDaily, tpexDaily] = await Promise.all([
    Promise.all(last20.map(async (date) => ({ date, rows: await fetchTwseMarketDailyRows(date) }))),
    Promise.all(last20.map(async (date) => {
      const url = `https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${date.replace(/-/gu, '/')}&id=&response=json`;
      const payload = await fetchOfficialJson<Record<string, unknown>>(url, 15_000);
      return { date, url, rows: payload ? parseTpexDailyCloses(payload) : new Map<string, number>() };
    })),
  ]);
  const histories = (daily: Array<{ date: string; rows: Map<string, { close: number } | number> }>) => {
    const result = new Map<string, Array<{ date: string; close: number }>>();
    for (const day of daily) for (const [symbol, value] of day.rows) {
      const close = typeof value === 'number' ? value : value.close;
      const rows = result.get(symbol) || [];
      rows.push({ date: day.date, close });
      result.set(symbol, rows);
    }
    return result;
  };
  const twseBreadth = breadthForRoster(histories(twseDaily), twseRoster);
  const tpexBreadth = breadthForRoster(histories(tpexDaily), tpexRoster);
  const flowSessions = sessions.slice(-5);
  const flows = await Promise.all(flowSessions.flatMap((date) => ([
    (async () => {
      const url = `https://www.twse.com.tw/fund/BFI82U?response=json&dayDate=${date.replace(/-/gu, '')}&type=day`;
      const payload = await fetchOfficialJson<Record<string, unknown>>(url, 12_000);
      return { market: 'TWSE' as const, date, url, value: payload ? parseForeignNetTwd(payload, 'TWSE') : null };
    })(),
    (async () => {
      const url = `https://www.tpex.org.tw/www/zh-tw/insti/summary?date=${date.replace(/-/gu, '/')}&response=json`;
      const payload = await fetchOfficialJson<Record<string, unknown>>(url, 12_000);
      return { market: 'TPEX' as const, date, url, value: payload ? parseForeignNetTwd(payload, 'TPEX') : null };
    })(),
  ])));
  const flowByKey = new Map(flows.map((row) => [`${row.market}:${row.date}`, row]));
  const tpexByDate = new Map(tpexIndexPayloads.map((row) => [row.date, row]));
  const rows = sessions.flatMap((date) => (['TWSE','TPEX'] as const).map((market) => {
    const isLatest = date === sessionDate;
    const flow = flowByKey.get(`${market}:${date}`);
    const breadth = market === 'TWSE' ? twseBreadth : tpexBreadth;
    const indexClose = market === 'TWSE' ? taiex.get(date) ?? null : tpexByDate.get(date)?.close ?? null;
    const indexUrl = market === 'TWSE'
      ? `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${date.slice(0, 7).replace(/-/gu, '')}01&response=json`
      : tpexByDate.get(date)?.url;
    return {
      market, session_date: date, index_close: indexClose,
      breadth_above_ma20: isLatest ? breadth.numerator : null,
      breadth_observed: isLatest ? breadth.observed : null,
      breadth_eligible: isLatest ? breadth.eligible : null,
      foreign_net_twd: flow?.value ?? null,
      source_urls: [indexUrl, isLatest ? (market === 'TWSE' ? 'https://www.twse.com.tw/exchangeReport/MI_INDEX' : 'https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes') : null, flow?.url].filter(Boolean),
      as_of: `${date}T13:30:00+08:00`, available_at: evaluatedAt,
      provenance: { provider: market.toLowerCase(), official_only: true, model_version: OFFICIAL_MARKET_HISTORY_MODEL_VERSION },
    };
  }));
  for (let offset = 0; offset < rows.length; offset += 500) {
    const write = await supabase.from('official_market_evidence_history').upsert(rows.slice(offset, offset + 500), { onConflict: 'market,session_date' });
    if (write.error) throw new Error(`official_market_history_write_failed:${write.error.message}`);
  }
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
  await ingestOfficialMarketEvidence(sessionDate, evaluatedAt);
  const [official, market, flows] = await Promise.all([
    supabase.from('official_market_evidence_history')
      .select('market,session_date,index_close,breadth_above_ma20,breadth_observed,breadth_eligible,foreign_net_twd,source_urls,available_at')
      .lte('available_at', evaluatedAt).lte('session_date', sessionDate)
      .order('session_date', { ascending: false }).limit(1400),
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
  if (official.error || market.error || flows.error) throw new Error(`market_evidence_read_failed:${official.error?.message || market.error?.message || flows.error?.message}`);
  const marketRows = (market.data as Row[]) || [];
  const latestObservation = new Map<string, Row>();
  for (const row of marketRows) {
    const key = `${row.fact_key}:${row.scope_key}:${row.authority_date}`;
    if (!latestObservation.has(key)) latestObservation.set(key, row);
  }
  const rows = [...latestObservation.values()];
  const officialRows = (official.data as Row[]) || [];
  const officialTaiex = officialRows.filter((row) => row.market === 'TWSE')
    .flatMap((row) => numberOrNull(row.index_close) == null ? [] : [{ date: String(row.session_date), close: Number(row.index_close) }]);
  const officialTpex = officialRows.filter((row) => row.market === 'TPEX')
    .flatMap((row) => numberOrNull(row.index_close) == null ? [] : [{ date: String(row.session_date), close: Number(row.index_close) }]);
  const legacyTaiex = rows.filter((row) => row.fact_key === 'taiex_close' && row.scope_key === 'TAIEX')
    .flatMap((row) => numberOrNull(row.value) == null ? [] : [{ date: String(row.authority_date), close: Number(row.value) }]);
  const legacyTpex = rows.filter((row) => row.fact_key === 'otc_close' && row.scope_key === 'OTC')
    .flatMap((row) => numberOrNull(row.value) == null ? [] : [{ date: String(row.authority_date), close: Number(row.value) }]);
  const taiex = [...new Map([...legacyTaiex, ...officialTaiex].map((row) => [row.date, row])).values()];
  const tpex = [...new Map([...legacyTpex, ...officialTpex].map((row) => [row.date, row])).values()];
  const officialBreadth = officialRows.filter((row) => row.session_date === sessionDate && numberOrNull(row.breadth_observed) != null)
    .map((row) => ({
      market: row.market === 'TWSE' ? 'TWSE' as const : 'TPEX' as const,
      numerator: Number(row.breadth_above_ma20), observed: Number(row.breadth_observed), eligible: Number(row.breadth_eligible), date: String(row.session_date),
    }));
  const legacyBreadth = rows.filter((row) => row.fact_key === 'above_ma20' && ['TWSE_ACTIVE_COMMON','TPEX_ACTIVE_COMMON'].includes(String(row.scope_key)))
    .flatMap((row) => {
      const numerator = numberOrNull(row.breadth_numerator_count);
      const observed = numberOrNull(row.breadth_observed_count);
      const eligible = numberOrNull(row.breadth_eligible_count);
      return numerator == null || observed == null || eligible == null ? [] : [{ market: row.scope_key === 'TWSE_ACTIVE_COMMON' ? 'TWSE' as const : 'TPEX' as const, numerator, observed, eligible, date: String(row.authority_date) }];
    });
  const breadth = officialBreadth.length >= 2 ? officialBreadth : legacyBreadth;
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
  for (const date of [...new Set(officialRows.filter((row) => numberOrNull(row.foreign_net_twd) != null).map((row) => String(row.session_date)))]) {
    const perMarket = officialRows.filter((row) => row.session_date === date && numberOrNull(row.foreign_net_twd) != null);
    if (perMarket.some((row) => row.market === 'TWSE') && perMarket.some((row) => row.market === 'TPEX')) {
      flowByDate.set(date, perMarket.reduce((sum, row) => sum + Number(row.foreign_net_twd), 0));
    }
  }
  const derived = deriveMarketEvidence({ sessionDate, taiex, tpex, breadth, foreignFlows: [...flowByDate].map(([date, value]) => ({ date, value })) });
  const write = await supabase.from('market_evidence_snapshots').upsert({
    session_date: sessionDate, status: derived.status, regime: derived.regime,
    taiex_state: derived.taiexState, tpex_state: derived.tpexState, breadth_state: derived.breadthState,
    foreign_flow_state: derived.foreignFlowState, completeness_pct: derived.completenessPct,
    roster_coverage_pct: derived.rosterCoveragePct, missing_components: derived.missingComponents,
    risk_budget: derived.riskBudget, as_of: `${sessionDate}T13:30:00+08:00`, available_at: evaluatedAt,
    provenance: { sources: ['official_market_evidence_history','opportunity_market_observations_v3','opportunity_stock_flow_observations_v3'], official_only: true },
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
