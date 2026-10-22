import { getSupabaseServerClient } from '../supabase-server';
import { deriveMarketEvidence } from '../market-evidence.ts';
import { latestCompletedSession, type Session } from './policy.ts';
import { marketJudgment, type MarketInput } from './market.ts';
import { publicCitation } from './citations.ts';
type Row = Record<string, unknown>;
const overseasScopes = { 'S&P500': ['SPX', 'SP500'], NASDAQ: ['NASDAQ', 'IXIC'], SOX: ['SOX'], Japan: ['NIKKEI225'], Korea: ['KOSPI'] };
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? value : null;
/** Cached, point-in-time quantitative producer. It never ingests or calls a model. */
export async function cachedMarketSnapshot(cutoff = new Date().toISOString()) {
  const client = getSupabaseServerClient();
  const calendarRows: Row[] = []; let calendarError = false;
  for (let offset = 0; offset < 6000; offset += 1000) {
    const page = await client.from('tw_trading_sessions_v3').select('session_id,close_at,status,recorded_at,source_timestamp')
      .eq('market', 'TWSE').lte('source_timestamp', cutoff).lte('recorded_at', cutoff).lte('close_at', cutoff)
      .order('session_id', { ascending: false }).order('recorded_at', { ascending: false }).range(offset, offset + 999);
    if (page.error) { calendarError = true; break; }
    calendarRows.push(...(page.data || []) as Row[]);
    if ((page.data || []).length < 1000 || new Set(calendarRows.map((r) => r.session_id)).size >= 520) break;
  }
  const reads = await Promise.all([
    ...['TWSE', 'TPEX'].map((market) => client.from('official_market_evidence_history')
      .select('market,session_date,index_close,breadth_above_ma20,breadth_observed,breadth_eligible,foreign_net_twd,source_urls,as_of,available_at,provenance')
      .eq('market', market).lte('available_at', cutoff).order('session_date', { ascending: false }).limit(520)),
    client.from('opportunity_market_observations_v3').select('*').in('scope_key', Object.values(overseasScopes).flat())
      .lte('recorded_at', cutoff).order('authority_date', { ascending: false }).limit(100),
  ]);
  const heads = new Map<string, Row>(); const conflicting = new Set<string>();
  for (const row of calendarRows) {
    const id = String(row.session_id); const prior = heads.get(id);
    if (!prior) heads.set(id, row);
    else if (row.recorded_at === prior.recorded_at && (row.status !== prior.status || row.close_at !== prior.close_at)) conflicting.add(id);
  }
  const sessions: Session[] = [...heads.values()].filter((row) => !conflicting.has(String(row.session_id)))
    .map((row) => ({ id: String(row.session_id), closeAt: String(row.close_at), completed: row.status === 'completed' }));
  const latest = latestCompletedSession(sessions, cutoff); const gaps: string[] = [];
  if (calendarError || conflicting.size) gaps.push('official_session_cache_unavailable_or_conflicting');
  const rows = reads.slice(0, 2).flatMap((read) => (read.data || []) as Row[]).filter((row) =>
    Array.isArray(row.source_urls) && row.source_urls.some((url) => publicCitation(url)) && Number.isFinite(Date.parse(String(row.as_of))) && Date.parse(String(row.as_of)) <= Date.parse(cutoff));
  const forMarket = (market: string) => rows.filter((row) => row.market === market && number(row.index_close) !== null).map((row) => ({ date: String(row.session_date), close: number(row.index_close)! }));
  const breadth = rows.filter((row) => row.session_date === latest && ['breadth_above_ma20', 'breadth_observed', 'breadth_eligible'].every((key) => number(row[key]) !== null))
    .map((row) => ({ market: row.market as 'TWSE' | 'TPEX', date: String(row.session_date), numerator: Number(row.breadth_above_ma20), observed: Number(row.breadth_observed), eligible: Number(row.breadth_eligible) }));
  const flows = [...new Set(rows.map((r) => String(r.session_date)))].flatMap((date) => {
    const daily = rows.filter((r) => r.session_date === date && number(r.foreign_net_twd) !== null);
    return daily.some((r) => r.market === 'TWSE') && daily.some((r) => r.market === 'TPEX') ? [{ date, value: daily.reduce((sum, r) => sum + Number(r.foreign_net_twd), 0) }] : [];
  });
  const quantitative = deriveMarketEvidence({ sessionDate: latest || '', taiex: forMarket('TWSE'), tpex: forMarket('TPEX'), breadth, foreignFlows: flows });
  gaps.push(...quantitative.missingComponents);
  if (reads[0].error || reads[1].error) gaps.push('official_market_cache_unavailable');
  const latestRows = rows.filter((row) => row.session_date === latest);
  const sourceAt = latestRows.map((row) => String(row.as_of)).sort().at(-1) || null;
  // This is an expiry rule, not a fabricated source acquisition timestamp.
  const expiry = latest ? new Date(Date.parse(`${latest}T00:15:00Z`) + 86400000).toISOString() : null;
  const foreign = (reads[2].data || []) as Row[];
  const overseas = Object.entries(overseasScopes).map(([name, scopes]) => {
    const observation = foreign.find((row) => scopes.includes(String(row.scope_key)) && number(row.value) !== null
      && row.session_completed === true && row.calendar_verified === true && publicCitation(row.source_ref)
      && Number.isFinite(Date.parse(String(row.source_timestamp))) && Date.parse(String(row.source_timestamp)) <= Date.parse(cutoff));
    return { name, value: observation ? number(observation.value) : null, sourceAt: observation ? String(observation.source_timestamp) : null,
      provenance: observation ? publicCitation(observation.source_ref) : null };
  });
  const observedDates = new Set(rows.map((r) => `${r.market}:${r.session_date}`));
  const required = sessions.filter((s) => s.completed && (!latest || s.id <= latest)).map((s) => s.id).sort().slice(-520);
  const continuity = required.length === 520 && required.every((date) => ['TWSE', 'TPEX'].every((market) => observedDates.has(`${market}:${date}`)));
  const backgroundSessions = required.slice(-61);
  const backgroundReturn = (market: string) => {
    const points = backgroundSessions.map((date) => rows.find((r) => r.market === market && r.session_date === date));
    if (points.length !== 61 || points.some((r) => !r || number(r.index_close) === null || Number(r.index_close) <= 0)) return null;
    return Number(points.at(-1)!.index_close) / Number(points[0]!.index_close) - 1;
  };
  const taiexReturn = backgroundReturn('TWSE'); const tpexReturn = backgroundReturn('TPEX');
  const reasons = [
    `加權收盤 ${quantitative.taiexState.close ?? '缺口'}；MA20 ${quantitative.taiexState.ma20 ?? '缺口'}；MA60 ${quantitative.taiexState.ma60 ?? '缺口'}`,
    `櫃買收盤 ${quantitative.tpexState.close ?? '缺口'}；MA60 ${quantitative.tpexState.ma60 ?? '缺口'}`,
    `廣度 ${quantitative.breadthState?.aboveMa20Pct ?? '缺口'}%；名單覆蓋 ${quantitative.rosterCoveragePct}%`,
    `外資單日 ${quantitative.foreignFlowState?.oneDayTwd ?? '缺口'} TWD；五日 ${quantitative.foreignFlowState?.fiveDayTwd ?? '缺口'} TWD`,
  ];
  const coreIncomplete = gaps.length > 0;
  gaps.push('supplemental_unavailable:fx_margin_operations_cycle');
  const input: MarketInput = { risk: quantitative.regime, confidence: coreIncomplete ? 'insufficient' : 'limited', session: latest, sourceAt,
    expiresAt: expiry, continuity, gaps, provenance: [...new Set(latestRows.flatMap((r) => (r.source_urls as unknown[]).map(publicCitation).filter((u): u is string => Boolean(u))))], overseas,
    reasons, risks: [...gaps, ...overseas.filter((item) => item.value === null).map((item) => `海外資料缺口：${item.name}`)],
    conditions: ['資料完整後，TAIEX 高於 MA20／MA60、MA60 斜率非負且廣度至少 55% 時可評估。',
      '廣度低於 45% 時等待；兩市場均低於 MA60 且廣度低於 35% 時視為結構轉弱。', '個股仍須完成獨立研究審查、財務與調整股價驗證；市場改善本身不授予進場條件。'],
    background: { status: taiexReturn !== null && tpexReturn !== null ? 'observed' : 'gap', sessions: 60,
      from: backgroundSessions[0] || null, to: latest, taiexReturn, tpexReturn },
    aiInterpretation: { status: 'unavailable', reason: '尚無經驗證的凍結模型事件解讀；目前為既有量化規則判斷。' } };
  return { ...marketJudgment(input, sessions, cutoff), sessions, quantitative, producerVersion: 'cached-official-market-vnext-v1' };
}
