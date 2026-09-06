import { getSupabaseServerClient } from './supabase-server';
import type { CandidateStageCard } from './types';
import { chunkCandidateFactIds } from './candidate-detail-fact-batches';
import { candidateDossierInputHash, factReferenceNumbers, isPaidInvestAnchorsReference, numberedCandidateSources } from './candidate-dossier-contract';
import type { CandidateDossierClaim } from './candidate-dossier-validation';

type Row = Record<string, unknown>;

export type CandidateDetailSection = {
  key: string;
  title: string;
  body: string;
  factIds: string[];
  sourceReferences?: number[];
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
  sources: Array<{ referenceNumber: number; label: string; url: string; publishedAt?: string | null; locator?: string }>;
  claims: Array<Omit<CandidateDossierClaim, 'factIds'> & { sourceReferences: number[] }>;
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
  scores: CandidateStageCard['scores'];
  facts: Array<{ factId: string; referenceNumber?: number; factKey: string; periodEnd: string; value: number | null; unit: string | null; sourceUrl: string | null; availableAt: string }>;
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
  sector?: string | null;
  facts?: Array<{ factId: string; factKey: string; value: number | null; periodEnd?: string | null }>;
  earningsBridge?: Record<string, unknown> | null;
  factorEvidence?: Record<string, { status?: string; score?: number; reasons?: string[] }>;
}): CandidateDetailSection[] {
  const { card } = input;
  const valuation = card.valuation;
  const technical = card.technical;
  const factIds = input.factIds;
  const factIdsFor = (...keys: string[]) => (input.facts || []).filter((fact) => keys.includes(fact.factKey)).map((fact) => fact.factId);
  const cited = (...keys: string[]) => factIdsFor(...keys);
  const bridge = input.earningsBridge || {};
  const actual = bridge.actual && typeof bridge.actual === 'object' ? bridge.actual as Record<string, unknown> : null;
  const scenarios = bridge.scenarios && typeof bridge.scenarios === 'object' ? bridge.scenarios as Record<string, Record<string, unknown>> : null;
  const valuationText = valuation.status === 'complete'
    ? `目前價格 ${n(valuation.currentPrice, ' 元')}；Bear/Base/Bull 為 ${n(valuation.bearTarget, ' 元')}／${n(valuation.baseTarget, ' 元')}／${n(valuation.bullTarget, ' 元')}，Base 潛在幅度 ${n(valuation.baseUpsidePct, '%')}、風險報酬比 ${n(valuation.rewardRiskRatio)}。估值依據為 ${input.valuationBasis}，五年倍數覆蓋 ${input.multipleMonthsCovered}/60 個月。`
    : `目前價格 ${n(valuation.currentPrice, ' 元')}；正式估值尚未成立，原因列在資料缺口。系統不會用缺少官方橋接的資料捏造目標價。`;
  const sourceText = `最近來源共 ${input.sourceCount} 次有效命中，來自 ${input.publisherCount} 個發布者、${input.platformCount} 個平台；來源熱度只用於發現，不直接等同買進判斷。`;
  const bridgeText = actual && scenarios
    ? `最近四季營收 ${n(Number(actual.latestRevenue), ' 元')}、毛利率 ${n(Number(actual.grossMargin) * 100, '%')}、營業利益率 ${n(Number(actual.operatingMargin) * 100, '%')}、稀釋 EPS ${n(Number(actual.latestEps), ' 元')}。模型以已公告八季資料推估未來四季 Bear/Base/Bull EPS ${n(Number(scenarios.bear?.dilutedEps), ' 元')}／${n(Number(scenarios.base?.dilutedEps), ' 元')}／${n(Number(scenarios.bull?.dilutedEps), ' 元')}；這些是可重算假設，不是公司指引。`
    : '尚未集齊八個離散季度的營收、毛利、營業利益、歸屬普通股淨利與稀釋 EPS，因此不建立未來四季獲利橋接。';
  const factorEntries = Object.entries(input.factorEvidence || {}).filter(([, value]) => value.status && value.status !== 'missing');
  const factorText = factorEntries.map(([key, value]) => `${key}:${value.status} ${n(value.score)}`).join('；');
  const sections: CandidateDetailSection[] = [{
    key: 'viewpoint',
    title: '研究結論',
    body: `${card.chineseName}（${card.symbol}，${input.sector || '產業分類待補'}）目前位於「${card.lifecycleStage}」。${sourceText} Research ${n(card.scores.research)}、資料信心 ${n(card.scores.dataConfidence)}；這兩個分數代表研究證據與模型支持度，不是上漲機率。`,
    factIds: cited('close', 'base_target', 'base_upside_pct'),
  }];
  if (actual) {
    sections.push({
      key: 'mix', title: '營運與獲利輪廓',
      body: `${card.chineseName}目前可核對的量化輪廓為最近四季營收 ${n(Number(actual.latestRevenue), ' 元')}、毛利 ${n(Number(actual.latestGross), ' 元')}。產品別營收若未在公司官方文件揭露，本文不反推或補造。`,
      factIds: cited('quarterly_revenue', 'quarterly_gross_profit', 'monthly_revenue'),
    });
  }
  if (factorText) {
    sections.push({
      key: 'demand', title: '產業、同業與海外訊號',
      body: `${card.chineseName}目前可用的產業／海外證據為：${factorText}。海外基本面只影響研究價值，海外價格只影響行動時點；正向 lead-lag 不能單獨產生買點，重大負向傳導可阻擋進場。`,
      factIds: cited('industry_peer_evidence', 'overseas_peer_evidence'),
    });
  }
  if (actual && scenarios) {
    sections.push({
      key: 'bridge', title: '營收 → 毛利 → EPS 橋接', body: bridgeText,
      factIds: cited('quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps', 'forward_base_eps'),
    });
  }
  sections.push({
    key: 'valuation', title: '估值與價格情境', body: valuationText,
    factIds: cited('close', 'pe_ratio', 'pb_ratio', 'bear_target', 'base_target', 'bull_target', 'base_upside_pct'),
  });
  sections.push({
    key: 'technical', title: '價格、均線與進場條件',
    body: `收盤 ${n(technical.close)}；MA20 ${n(technical.ma20)}、MA60 ${n(technical.ma60)}、MA120 ${n(technical.ma120)}、MA240 ${n(technical.ma240)}；RSI14 ${n(technical.rsi14)}、20 日量比 ${n(technical.volumeRatio20Median)}；大盤狀態 ${technical.marketRegime}。技術條件只決定是否適合現在行動，不會提高公司的合理價值。`,
    factIds: cited('close', 'ma20', 'ma60', 'ma120', 'ma240', 'rsi14', 'volume_ratio_20_median'),
  });
  sections.push({
    key: 'risk', title: '催化劑、反證與失效條件',
    body: card.unmetConditions.length ? `目前未達條件：${card.unmetConditions.join('、')}。重大官方反證會阻擋升級；買點失效但投資論點仍成立時退回等待條件，論點或估值失效則退回全部來源命中。` : '目前沒有尚未達成的已知硬門檻；仍需持續監控官方反證與估值變化。',
    factIds: cited('major_counter_evidence', 'close', 'ma60'),
  });
  const gapLabels = [
    actual ? null : '八個可勾稽的離散季度與未來四季獲利橋接',
    input.sector ? null : '官方產業分類',
    factIdsFor('customer_certification_shipment').length ? null : '客戶／認證／出貨時程的官方文件位置',
    factIdsFor('capacity_yield_asp_company_actions').length ? null : '產能／良率／ASP／公司動作的官方證據',
    factorEntries.length ? null : '產業與海外同業的可用證據',
  ].filter((value): value is string => Boolean(value));
  if (gapLabels.length) {
    sections.push({
      key: 'gaps', title: '尚待確認',
      body: `下一輪研究集中補齊：${gapLabels.join('、')}。缺口在此一次列清楚，不以空白段落冒充完整文章。`,
      factIds: [],
    });
  }
  sections.push({
    key: 'sources', title: '證據與原始連結',
    body: `本次研究保存 ${factIds.length} 項可追溯證據；公開頁只顯示可讀的編號來源，原始識別碼保留在後端稽核。社群原文只作發現線索，估值與營運結論由官方資料重新推導。`,
    factIds,
  });
  return sections;
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
  const [dossiers, factBatchResults, stageRead, trackingRead] = await Promise.all([
    supabase.from('candidate_research_dossiers')
      .select('narrative_kind,content,validation_status,bundle_hash,input_hash,published_at,created_at')
      .eq('detail_snapshot_id', String(row.id)).eq('narrative_kind', 'codex_enriched').eq('validation_status', 'valid')
      .order('created_at', { ascending: false }).limit(1),
    Promise.all(chunkCandidateFactIds(factIds).map((batch) => supabase.from('candidate_official_facts')
      .select('fact_id,stock_id,fact_key,fact_kind,period_end,value,unit,as_of,available_at,source_url,provenance,derivation')
      .in('fact_id', batch).order('period_end', { ascending: false }).limit(batch.length))),
    supabase.from('candidate_daily_stage_snapshots')
      .select('discovery_score,research_score,actionability_score,data_confidence_score')
      .eq('detail_revision_id', String(row.id)).limit(1).maybeSingle(),
    supabase.from('candidate_signal_tracking')
      .select('risk_action,action_reasons')
      .eq('stock_id', stockRead.data.id).eq('session_date', String(row.session_date))
      .order('available_at', { ascending: false }).limit(1).maybeSingle(),
  ]);
  const factsError = factBatchResults.find((result) => result.error)?.error;
  if (dossiers.error || factsError || stageRead.error || trackingRead.error) throw new Error(`candidate_detail_evidence_read_failed:${dossiers.error?.message || factsError?.message || stageRead.error?.message || trackingRead.error?.message}`);
  const factRows = factBatchResults.flatMap((result) => (result.data as Row[]) || []).filter((fact) => !isPaidInvestAnchorsReference(fact.source_url));
  const expectedInputHash = candidateDossierInputHash({ ...row, fact_ids: factRows.map((fact) => String(fact.fact_id)), stocks: { symbol: stock.symbol, name: stock.name } }, factRows);
  const enriched = ((dossiers.data || []) as Row[]).find((dossier) =>
    String(dossier.bundle_hash || dossier.input_hash || '') === expectedInputHash && Boolean(dossier.published_at)) || null;
  const sources = numberedCandidateSources(row, factRows);
  const references = factReferenceNumbers(factRows, sources);
  const publicSections = (sections: CandidateDetailSection[]) => sections.map((section) => {
    const sourceReferences = [...new Set((section.factIds || []).map((factId) => references.get(String(factId))).filter((reference): reference is number => reference != null))];
    return { ...section, factIds: sourceReferences.map((reference) => `[${reference}]`), sourceReferences };
  });
  const publicFactIds = [...new Set(factIds.map((factId) => references.get(factId)).filter((reference): reference is number => reference != null))].map((reference) => `[${reference}]`);
  const base = {
    revisionId: String(row.id), symbol: String(stock.symbol || symbol), chineseName: String(stock.name || symbol),
    sessionDate: String(row.session_date), lifecycleStage: String(row.lifecycle_stage) as CandidateDetailPayload['lifecycleStage'],
    detailKind: String(row.detail_kind) as CandidateDetailPayload['detailKind'], title: String(row.title), summary: String(row.summary),
    sections: publicSections((Array.isArray(row.sections) ? row.sections : []) as CandidateDetailSection[]), factIds: publicFactIds,
    sources, claims: [],
    sourceLinks: ((Array.isArray(row.source_links) ? row.source_links : []) as CandidateDetailPayload['sourceLinks']).filter((source) => !isPaidInvestAnchorsReference(`${source.label} ${source.url}`)),
    valuation: (row.valuation || {}) as CandidateDetailPayload['valuation'], technical: (row.technical || {}) as CandidateStageCard['technical'],
    scores: {
      discovery: Number(stageRead.data?.discovery_score || 0),
      research: Number(stageRead.data?.research_score || 0),
      actionability: Number(stageRead.data?.actionability_score || 0),
      dataConfidence: Number(stageRead.data?.data_confidence_score || 0),
    },
    facts: factRows.map((fact, index) => ({ factId: `source-${references.get(String(fact.fact_id)) || index + 1}-${String(fact.fact_key)}`, referenceNumber: references.get(String(fact.fact_id)), factKey: String(fact.fact_key), periodEnd: String(fact.period_end), value: fact.value == null ? null : Number(fact.value), unit: fact.unit ? String(fact.unit) : null, sourceUrl: isPaidInvestAnchorsReference(fact.source_url) ? null : publicHttpUrl(fact.source_url), availableAt: String(fact.available_at) })),
    unmetConditions: Array.isArray((row.valuation as Row | null)?.unmetConditions) ? ((row.valuation as Row).unmetConditions as unknown[]).map(String) : [],
    riskAction: trackingRead.data ? { state: String(trackingRead.data.risk_action || 'data_incomplete'), reasons: Array.isArray(trackingRead.data.action_reasons) ? trackingRead.data.action_reasons.map(String) : [] } : null,
    asOf: String(row.as_of), availableAt: String(row.available_at), narrativeKind: 'deterministic_fact' as const,
  };
  if (enriched?.content && typeof enriched.content === 'object' && !Array.isArray(enriched.content)) {
    const overlay = enriched.content as Row;
    const claims = (Array.isArray(overlay.claims) ? overlay.claims : []).map((value) => {
      const claim = value as CandidateDossierClaim;
      const { factIds: claimFactIds, ...publicClaim } = claim;
      return { ...publicClaim, sourceReferences: [...new Set((claimFactIds || []).map((factId) => references.get(String(factId))).filter((reference): reference is number => reference != null))] };
    });
    return { ...base, summary: typeof overlay.summary === 'string' ? overlay.summary : base.summary, sections: Array.isArray(overlay.sections) ? publicSections(overlay.sections as CandidateDetailSection[]) : base.sections, claims, narrativeKind: 'codex_enriched' };
  }
  return base;
}
