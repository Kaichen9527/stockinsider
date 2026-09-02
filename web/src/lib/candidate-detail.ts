import { getSupabaseServerClient } from './supabase-server';
import type { CandidateStageCard } from './types';

type Row = Record<string, unknown>;

export type CandidateDetailSection = {
  key: string;
  title: string;
  body: string;
  factIds: string[];
};

export type CandidateDetailPayload = {
  revisionId: string;
  symbol: string;
  chineseName: string;
  sessionDate: string;
  lifecycleStage: 'found' | 'waiting' | 'actionable';
  detailKind: 'fact' | 'full';
  title: string;
  summary: string;
  sections: CandidateDetailSection[];
  factIds: string[];
  sourceLinks: Array<{ label: string; url: string; publishedAt?: string | null }>;
  valuation: CandidateStageCard['valuation'] & {
    basis?: string;
    monthsCovered?: number;
    next12mBridgeComplete?: boolean;
    historicalPercentile?: number | null;
    historicalMultiples?: Array<{ date: string; peRatio: number | null; pbRatio: number | null }>;
    historicalPrices?: Array<{ month: string; close: number }>;
  };
  technical: CandidateStageCard['technical'];
  facts: Array<{ factId: string; factKey: string; periodEnd: string; value: number | null; unit: string | null; sourceUrl: string | null; availableAt: string }>;
  unmetConditions: string[];
  riskAction?: { state: string; reasons: string[] } | null;
  asOf: string;
  availableAt: string;
  narrativeKind: 'deterministic_fact' | 'codex_enriched';
};

function n(value: number | null | undefined, suffix = '') {
  return value == null || !Number.isFinite(value) ? '資料待補' : `${Math.round(value * 100) / 100}${suffix}`;
}

function publicHttpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

export function buildDeterministicCandidateSections(input: {
  card: CandidateStageCard;
  factIds: string[];
  valuationBasis: string;
  multipleMonthsCovered: number;
  sourceCount: number;
  publisherCount: number;
  platformCount: number;
}): CandidateDetailSection[] {
  const { card } = input;
  const valuation = card.valuation;
  const technical = card.technical;
  const factIds = input.factIds;
  const valuationText = valuation.status === 'complete'
    ? `目前價格 ${n(valuation.currentPrice, ' 元')}；Bear/Base/Bull 為 ${n(valuation.bearTarget, ' 元')}／${n(valuation.baseTarget, ' 元')}／${n(valuation.bullTarget, ' 元')}，Base 潛在幅度 ${n(valuation.baseUpsidePct, '%')}、風險報酬比 ${n(valuation.rewardRiskRatio)}。估值依據為 ${input.valuationBasis}，五年倍數覆蓋 ${input.multipleMonthsCovered}/60 個月。`
    : `目前價格 ${n(valuation.currentPrice, ' 元')}；正式估值尚未成立，原因列在資料缺口。系統不會用缺少官方橋接的資料捏造目標價。`;
  const sourceText = `最近來源共 ${input.sourceCount} 次有效命中，來自 ${input.publisherCount} 個發布者、${input.platformCount} 個平台；來源熱度只用於發現，不直接等同買進判斷。`;
  return [
    { key: 'viewpoint', title: '營運觀點摘要', body: `${card.chineseName}（${card.symbol}）目前位於「${card.lifecycleStage}」。${sourceText}`, factIds },
    { key: 'mix', title: '產品與營收組合', body: '本版只呈現已進入官方 fact bundle 的產品與營收資料；若未列數字，表示 MOPS 結構化欄位尚待補齊。', factIds },
    { key: 'demand', title: '需求、產業與海外同類', body: '產業需求與海外同業只在有可追溯官方或公司 IR 證據時加權；正向 lead-lag 不會單獨形成買點，負向 catch-down 可阻擋升級。', factIds },
    { key: 'customers', title: '客戶、認證與出貨時程', body: '未經公司公告、法說或公開 IR 驗證的客戶名稱與出貨時程不列為事實。', factIds },
    { key: 'operations', title: '產能、良率、ASP 與公司動作', body: '依 MOPS、重大訊息與公司 IR 持續更新；目前缺失項目會保留在下方門檻清單。', factIds },
    { key: 'bridge', title: '營收 → 毛利 → EPS／FCF 橋接', body: input.valuationBasis === 'forward_12m' ? '已具備可驗證的未來十二個月橋接；各假設均需對應 fact ID。' : '目前僅有歷史或 TTM 參考，尚未具備完整未來十二個月橋接，不稱為 forward valuation。', factIds },
    { key: 'valuation', title: '五年估值與目標情境', body: valuationText, factIds },
    { key: 'risk', title: '催化劑、反證與失效條件', body: card.unmetConditions.length ? `目前未達條件：${card.unmetConditions.join('、')}。任何重大官方反證都會阻擋或降低階段。` : '目前沒有尚未達成的已知硬門檻；仍需持續監控官方反證。', factIds },
    { key: 'technical', title: 'MA、量價、籌碼與大盤', body: `收盤 ${n(technical.close)}；MA20 ${n(technical.ma20)}、MA60 ${n(technical.ma60)}、MA120 ${n(technical.ma120)}、MA240 ${n(technical.ma240)}；RSI14 ${n(technical.rsi14)}、20 日量比 ${n(technical.volumeRatio20Median)}；大盤狀態 ${technical.marketRegime}。`, factIds },
    { key: 'sources', title: '官方證據與原始連結', body: `本 revision 保存 ${factIds.length} 個 fact ID；社群原文只作發現線索，估值與營運結論必須由官方資料重新推導。`, factIds },
  ];
}

export async function loadCandidateDetail(symbol: string, revisionId?: string | null): Promise<CandidateDetailPayload | null> {
  const supabase = getSupabaseServerClient();
  const stockRead = await supabase.from('stocks').select('id,symbol,name').eq('symbol', symbol).eq('market', 'TW').maybeSingle();
  if (stockRead.error) throw new Error(`candidate_detail_stock_read_failed:${stockRead.error.message}`);
  if (!stockRead.data) return null;
  let query = supabase.from('candidate_detail_snapshots')
    .select('id,session_date,lifecycle_stage,detail_kind,title,summary,sections,fact_ids,source_links,valuation,technical,as_of,available_at')
    .eq('stock_id', stockRead.data.id)
    .order('available_at', { ascending: false })
    .limit(1);
  if (revisionId) query = query.eq('id', revisionId);
  const { data, error } = await query.maybeSingle();
  if (error) {
    if (/does not exist|schema cache/iu.test(error.message)) return null;
    throw new Error(`candidate_detail_read_failed:${error.message}`);
  }
  if (!data) return null;
  const row = data as Row;
  const stock = stockRead.data as Row;
  const factIds = (Array.isArray(row.fact_ids) ? row.fact_ids : []).map(String);
  const [dossiers, facts] = await Promise.all([
    supabase.from('candidate_research_dossiers')
      .select('narrative_kind,content,validation_status,created_at')
      .eq('detail_snapshot_id', String(row.id)).eq('validation_status', 'valid')
      .order('created_at', { ascending: false }).limit(1),
    factIds.length ? supabase.from('candidate_official_facts')
      .select('fact_id,fact_key,period_end,value,unit,source_url,available_at')
      .in('fact_id', factIds).order('period_end', { ascending: false }).limit(500) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dossiers.error || facts.error) throw new Error(`candidate_detail_evidence_read_failed:${dossiers.error?.message || facts.error?.message}`);
  const enriched = (dossiers.data?.[0] as Row | undefined) || null;
  const base = {
    revisionId: String(row.id), symbol: String(stock.symbol || symbol), chineseName: String(stock.name || symbol),
    sessionDate: String(row.session_date), lifecycleStage: String(row.lifecycle_stage) as CandidateDetailPayload['lifecycleStage'],
    detailKind: String(row.detail_kind) as CandidateDetailPayload['detailKind'], title: String(row.title), summary: String(row.summary),
    sections: (Array.isArray(row.sections) ? row.sections : []) as CandidateDetailSection[], factIds,
    sourceLinks: (Array.isArray(row.source_links) ? row.source_links : []) as CandidateDetailPayload['sourceLinks'],
    valuation: (row.valuation || {}) as CandidateDetailPayload['valuation'], technical: (row.technical || {}) as CandidateStageCard['technical'],
    facts: ((facts.data as Row[]) || []).map((fact) => ({ factId: String(fact.fact_id), factKey: String(fact.fact_key), periodEnd: String(fact.period_end), value: fact.value == null ? null : Number(fact.value), unit: fact.unit ? String(fact.unit) : null, sourceUrl: publicHttpUrl(fact.source_url), availableAt: String(fact.available_at) })),
    unmetConditions: Array.isArray((row.valuation as Row | null)?.unmetConditions) ? ((row.valuation as Row).unmetConditions as unknown[]).map(String) : [],
    asOf: String(row.as_of), availableAt: String(row.available_at), narrativeKind: 'deterministic_fact' as const,
  };
  if (enriched?.content && typeof enriched.content === 'object' && !Array.isArray(enriched.content)) {
    const overlay = enriched.content as Row;
    return { ...base, summary: typeof overlay.summary === 'string' ? overlay.summary : base.summary, sections: Array.isArray(overlay.sections) ? overlay.sections as CandidateDetailSection[] : base.sections, narrativeKind: 'codex_enriched' };
  }
  return base;
}
