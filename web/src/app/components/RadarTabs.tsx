'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { DiscoveredStockCard, RadarDailyPayload, RecommendationCard, SourceSignalCard, ThemeHeatCard } from '@/lib/types';

type Props = {
  radar: RadarDailyPayload;
};

const sourceTypeLabel: Record<string, string> = {
  official: '官方資料',
  financial: '財務數據',
  public_research: '公開研究',
  investanchors: '定錨投筆',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram',
  bulltalk: '股市爆料同學會',
  ptt: 'PTT Stock',
  kol: '台股 KOL',
  news: '新聞',
  industry: '產業資料',
  twse_insider: '董監持股揭露',
};

const marketRegimeLabel: Record<string, string> = {
  'risk-on': '風險偏好擴張',
  'risk-on-ai': 'AI 風險偏好',
  'selective-risk-on': '選股型風險偏好',
  'live-unavailable': '資料來源異常',
};

const valuationSourceLabel: Record<string, string> = {
  valuation_cases: '估值情境',
  broker_report: '券商/投顧目標價',
  thesis_model: 'thesis 推估',
  missing: '估值不足',
  demo_seed: '示範 seed',
};

function pct(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value) || value <= 0) return null;
  return `+${value.toFixed(1)}%`;
}

function isScenarioCandidate(rec: RecommendationCard) {
  return rec.displayBucket === 'scenario' || rec.recommendationBucket === 'scenario_upside';
}

function isHistoricalObservation(rec: RecommendationCard) {
  return rec.displayBucket === 'historical_observation' || rec.displayBucket === 'revaluation_queue' || rec.recommendationBucket === 'historical_fallback';
}

function shouldHideTargetPresentation(rec: RecommendationCard) {
  if (rec.targetCoverageStatus === 'scenario_only' && rec.upsideTarget != null) return false;
  return rec.displayTargetMode === 'needs_revaluation' || rec.displayTargetMode === 'hidden_over_target' || isHistoricalObservation(rec);
}

function cardUpsideLabel(rec: RecommendationCard) {
  if (rec.displayTargetMode === 'early_potential') {
    return rec.cardPrimaryUpsideLabel === '情境空間' ? '潛在情境空間（未正式）' : '潛在 Base 空間（未正式）';
  }
  return rec.cardPrimaryUpsideLabel || (isScenarioCandidate(rec) ? '情境空間' : 'Base 空間');
}

function baseUpsidePct(rec: RecommendationCard) {
  return rec.displayBaseUpsidePct ?? null;
}

function scenarioUpsidePct(rec: RecommendationCard) {
  return rec.displayScenarioUpsidePct ?? null;
}

function cardPrimaryUpsidePct(rec: RecommendationCard) {
  if (shouldHideTargetPresentation(rec)) return null;
  return rec.cardPrimaryUpsidePct ?? (isScenarioCandidate(rec) ? scenarioUpsidePct(rec) : baseUpsidePct(rec)) ?? rec.expectedUpsidePct ?? null;
}

function valuationLine(rec: RecommendationCard) {
  if (rec.displayTargetMode === 'hidden_over_target') {
    return rec.overTargetReason || '現價已高於 Base 與情境目標，等待重新估值或回測。';
  }
  if (rec.targetCoverageStatus === 'scenario_only') {
    const job = rec.revaluationJobSummary?.status ? ` · 重估 ${rec.revaluationJobSummary.status}` : ' · 已排重估';
    return `Base 已反映，外部先看情境 ${rec.upsideTarget ? rec.upsideTarget.toFixed(0) : '待補'}${job}，非正式買點。`;
  }
  if (shouldHideTargetPresentation(rec)) {
    return rec.revaluationJobSummary?.lastResult || rec.whyNotPromoted || rec.revaluationReason || '等待 bridge-aware 重新估值；暫不把舊 target 當作今日買點。';
  }
  if (isScenarioCandidate(rec)) {
    return `Base ${pct(baseUpsidePct(rec)) || '未過現價'}${rec.upsideTarget ? ` / 情境 ${rec.upsideTarget.toFixed(0)}` : ''}${rec.estimatedCatalystDate ? ` · 等待驗證 ${rec.estimatedCatalystDate}` : ' · 等待驗證'}`;
  }
  if (rec.targetPrice || rec.baseTarget || rec.upsideTarget) {
    return `Base ${rec.baseTarget?.toFixed(0) || rec.targetPrice?.toFixed(0) || '未知'}${rec.upsideTarget ? ` / 情境 ${rec.upsideTarget.toFixed(0)}` : ''}${rec.estimatedCatalystDate ? ` · 催化劑 ${rec.estimatedCatalystDate}` : ''}`;
  }
  return null;
}

function stockDisplayName(rec: RecommendationCard) {
  return rec.chineseName ? `${rec.symbol} ${rec.chineseName}` : rec.name ?? rec.symbol;
}

function confidenceLabel(value: number | null | undefined) {
  if (value == null || !Number.isFinite(value)) return '待補';
  if (value >= 80) return '高';
  if (value >= 60) return '中高';
  if (value >= 42) return '觀察';
  return '低';
}

function scenarioBreakdownLine(rec: RecommendationCard) {
  const breakdown = rec.scenarioChecklistBreakdown;
  if (!breakdown || breakdown.total === 0) return '尚無獨立上行情境 checklist';
  return `已達成 ${breakdown.achieved} / 部分 ${breakdown.partial} / 待驗 ${breakdown.pending} / 過期 ${breakdown.stale}`;
}

function formatMoney(value: number | null | undefined, precision = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  return `NT$${value.toFixed(precision)}`;
}

function targetCoverageLine(rec: RecommendationCard) {
  const current = rec.currentPrice ?? null;
  const base = rec.baseTarget ?? rec.targetPrice ?? null;
  const scenario = rec.upsideTarget ?? null;
  if (current == null || !Number.isFinite(current) || current <= 0) return '股價待更新，暫不判斷是否達標';
  if (scenario != null && Number.isFinite(scenario) && current >= scenario) return '已高於情境目標，等待重估或回測';
  if (base != null && Number.isFinite(base) && current >= base) return 'Base 已達標，只剩情境追蹤';
  if (base != null && Number.isFinite(base)) return '尚未達 Base，仍需搭配進場 Gate';
  return 'Base/情境目標待補';
}

function marketReratingLabel(rec: RecommendationCard) {
  const adjustment = rec.marketValuationAdjustment;
  if (!adjustment) return null;
  if (adjustment.repricingTriggerStrength === 'high') return '市場支持重估';
  if (adjustment.repricingTriggerStrength === 'medium') return '重估線索累積';
  if (adjustment.marketReratingStatus === 'compressing') return '市場不支持追價';
  if (adjustment.marketReratingStatus === 'missing') return '大盤估值待補';
  return null;
}

function formatTaipeiDateTime(value: string | null | undefined, mode: 'full' | 'compact' = 'full') {
  if (!value) return '未記錄';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const taipei = new Date(date.getTime() + 8 * 60 * 60 * 1000);
  const pad = (input: number) => String(input).padStart(2, '0');
  const dateText =
    mode === 'full'
      ? `${taipei.getUTCFullYear()}-${pad(taipei.getUTCMonth() + 1)}-${pad(taipei.getUTCDate())}`
      : `${pad(taipei.getUTCMonth() + 1)}/${pad(taipei.getUTCDate())}`;
  return `${dateText} ${pad(taipei.getUTCHours())}:${pad(taipei.getUTCMinutes())}`;
}

type TabKey = 'stocks' | 'themes' | 'discovery';

const researchMaturityLabels = {
  source_signal: '來源訊號',
  fundamental_review: '基本面待覆核',
  decision_ready: '決策資料完整',
} as const;

const newPositionActionLabels = {
  avoid: '暫時避開',
  valuation_review: '估值待覆核',
  wait_trigger: '等待技術觸發',
  event_starter: '事件型試單',
  starter_now: '可評估試單',
} as const;

const unavailableResearchDecisionLabels = {
  projection_missing: '研究投影尚未建立，系統會在下一輪補齊',
  projection_stale: '研究資料已過期，等待重新整理',
  source_unavailable: '研究來源暫時無法取得，等待來源恢復',
  insufficient_adjusted_history: '還原權息歷史不足，暫不產生進場判斷',
  financial_inputs_missing: '財務資料尚未完整，暫不產生估值或買進建議',
} as const;

const technicalStateLabels = {
  below_support: '股價低於支撐',
  reclaim_required: '需先收復支撐',
  at_support: '位於支撐區',
  breakout_pending: '等待突破確認',
  breakout_confirmed: '突破已確認',
  extended: '漲幅已延伸',
  invalidated: '技術條件失效',
} as const;

export function StockCard({ rec, isPrimary }: { rec: RecommendationCard; isPrimary: boolean }) {
  const cardTitleId = `stock-card-${rec.recommendationId.replace(/[^A-Za-z0-9_-]/gu, '-')}`;
  const researchDecision = rec.researchDecision;
  const unavailableResearchDecision = researchDecision?.availability === 'unavailable' ? researchDecision : null;
  const availableResearchDecision = researchDecision?.availability === 'available' ? researchDecision : null;
  const stateBadge =
    unavailableResearchDecision
      ? { label: '研究待補', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' }
      : rec.displayBucket === 'hot_tracking'
      ? { label: '熱股追蹤', cls: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' }
      : rec.displayBucket === 'archived_over_target' || rec.displayBucket === 'valuation_reflected_archive' || rec.displayTargetMode === 'hidden_over_target'
      ? { label: '估值已反映', cls: 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65' }
      : isHistoricalObservation(rec)
        ? { label: '待重估觀察', cls: 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65' }
        : rec.recommendationBucket === 'high_conviction'
      ? { label: '高信念正式推薦', cls: 'bg-accent text-white' }
      : rec.recommendationBucket === 'early_formal'
        ? { label: '正式推薦', cls: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' }
        : rec.recommendationBucket === 'scenario_upside'
          ? { label: '情境上行候選', cls: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' }
          : rec.recommendationBucket === 'historical_fallback'
            ? { label: '近期觀察（非正式）', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' }
          : rec.recommendationState === 'actionable_setup'
      ? { label: '觀察追蹤', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' }
      : rec.recommendationState === 'validated_thesis'
        ? { label: '高信念', cls: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' }
        : rec.recommendationState === 'partially_verified'
          ? { label: '驗證中', cls: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' }
          : { label: '早期觀察', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' };

  return (
    <article aria-labelledby={cardTitleId} className="min-w-0 rounded-2xl border border-line bg-surface-strong p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <h3 id={cardTitleId} className="text-lg font-semibold truncate">{stockDisplayName(rec)}</h3>
          <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${stateBadge.cls}`}>{stateBadge.label}</span>
        </div>
        {unavailableResearchDecision ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">估值狀態</p>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">暫停估值</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">非今日買點</p>
          </div>
        ) : isHistoricalObservation(rec) ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">重估狀態</p>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">等待重估</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">非今日買點</p>
          </div>
        ) : rec.displayTargetMode === 'hidden_over_target' ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">估值狀態</p>
            <span className="text-sm font-bold text-slate-600 dark:text-emerald-100/75">已反映</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">不追價</p>
          </div>
        ) : pct(cardPrimaryUpsidePct(rec)) ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">{cardUpsideLabel(rec)}</p>
            <span className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{pct(cardPrimaryUpsidePct(rec))}</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">
              Base {pct(baseUpsidePct(rec)) || '已反映'} · 情境 {pct(scenarioUpsidePct(rec)) || '已反映'}
            </p>
          </div>
        ) : (
          <span className="shrink-0 rounded-full bg-amber-500/12 px-3 py-1 text-xs font-medium text-amber-700 dark:text-amber-300">
            {rec.displayTargetMode === 'needs_revaluation' ? '等待重估' : '估值待補強'}
          </span>
        )}
      </div>

      {!unavailableResearchDecision && valuationLine(rec) && (
        <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
          {valuationLine(rec)}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full border border-line bg-surface px-3 py-1 font-medium text-slate-700 dark:text-emerald-100/78">
          現價 {formatMoney(rec.currentPrice) || '待補'} · 股價日期 {formatTaipeiDateTime(rec.priceAsOf, 'compact')}
        </span>
        <span
          className={`rounded-full px-3 py-1 ${
            unavailableResearchDecision || rec.targetCoverageStatus === 'over_base_and_scenario' || rec.displayTargetMode === 'hidden_over_target'
              ? 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65'
              : rec.targetCoverageStatus === 'scenario_only'
                ? 'bg-sky-600/12 text-sky-700 dark:text-sky-300'
                : 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {unavailableResearchDecision ? '研究證據待補，暫不判斷估值空間' : targetCoverageLine(rec)}
        </span>
        {rec.priceRefreshStatus && rec.priceRefreshStatus !== 'fresh' ? (
          <span className="rounded-full bg-amber-500/12 px-3 py-1 text-amber-700 dark:text-amber-300">股價待更新</span>
        ) : null}
        {rec.globalThemeLeadLagSignal ? (
          <span className="rounded-full bg-indigo-500/12 px-3 py-1 text-indigo-700 dark:text-indigo-300">
            海外同族群領漲 · 台股尚未反映
          </span>
        ) : null}
        {rec.marketIndexSignal ? (
          <span className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-100/78">
            大盤：{rec.marketIndexSignal.label}
          </span>
        ) : null}
        {marketReratingLabel(rec) ? (
          <span className="rounded-full bg-violet-500/12 px-3 py-1 text-violet-700 dark:text-violet-300">
            {marketReratingLabel(rec)}
          </span>
        ) : null}
      </div>

      {availableResearchDecision ? (
        <section aria-label="研究與進場判斷" className="mt-3 rounded-xl border border-line bg-surface p-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-950/8 px-2.5 py-1 dark:bg-emerald-100/10">研究：{researchMaturityLabels[availableResearchDecision.researchMaturity]}</span>
            <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-amber-800 dark:text-amber-300">動作：{newPositionActionLabels[availableResearchDecision.newPositionAction]}</span>
            <span className="rounded-full bg-sky-500/12 px-2.5 py-1 text-sky-800 dark:text-sky-300">技術：{availableResearchDecision.technical.state ? technicalStateLabels[availableResearchDecision.technical.state] : '資料不足'}</span>
            {availableResearchDecision.technical.maDeviation != null ? (
              <span className="rounded-full bg-violet-500/12 px-2.5 py-1 text-violet-800 dark:text-violet-300">MA20 乖離 {(availableResearchDecision.technical.maDeviation * 100).toFixed(1)}%</span>
            ) : null}
            <span className="rounded-full bg-slate-950/8 px-2.5 py-1 dark:bg-emerald-100/10">估值：{availableResearchDecision.valuation.status === 'normal' ? '可用' : '待覆核'}</span>
          </div>
          {availableResearchDecision.technical.state === 'reclaim_required' ? (
            <p className="mt-2 text-amber-800 dark:text-amber-300">已跌破支撐，原支撐現為收復觸發；未收復前不把它顯示成回測買點。</p>
          ) : null}
          <div aria-label="四軸研究評分" className="mt-3 grid min-w-0 grid-cols-2 gap-2 sm:grid-cols-4">
            {availableResearchDecision.factorAxes?.availability === 'available'
              ? Object.entries(availableResearchDecision.factorAxes.axes).map(([axis, score]) => (
                <div key={axis} className="min-w-0 break-words rounded-lg bg-slate-950/5 px-2 py-2 dark:bg-emerald-100/5">
                  <p className="text-slate-500 dark:text-emerald-100/60">{{ discovery: '發現', quality: '基本面品質', valuation: '估值', timingRisk: '時機風險' }[axis] || axis}</p>
                  <p className="mt-1 font-semibold tabular-nums">{Number(score).toFixed(0)} / 100</p>
                </div>
              ))
              : <p className="col-span-full break-words text-slate-500 dark:text-emerald-100/60">四軸評分：{availableResearchDecision.factorAxes?.reason || '資料不足'}</p>}
          </div>
          <div aria-label="乖離率與本益比脈絡" className="mt-3 grid min-w-0 gap-2 sm:grid-cols-2">
            <div className="min-w-0 break-words rounded-lg bg-violet-500/8 px-3 py-2">
              <p className="font-medium">乖離率（BIAS）</p>
              {availableResearchDecision.technical.bias?.availability === 'available' ? (
                <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
                  MA20 {availableResearchDecision.technical.bias.bias20Pct.toFixed(1)}%
                  {availableResearchDecision.technical.bias.bias60Pct != null ? ` · MA60 ${availableResearchDecision.technical.bias.bias60Pct.toFixed(1)}%` : ''}
                  {availableResearchDecision.technical.bias.ownHistory?.label ? ` · 個股歷史 ${availableResearchDecision.technical.bias.ownHistory.label}` : ''}
                </p>
              ) : <p className="mt-1 text-slate-500 dark:text-emerald-100/60">{availableResearchDecision.technical.bias?.reason || '乖離率歷史不足'}</p>}
            </div>
            <div className="min-w-0 break-words rounded-lg bg-sky-500/8 px-3 py-2">
              <p className="font-medium">本益比比較（官方／模型分列）</p>
              <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
                {availableResearchDecision.valuation.exchangeReportedPe?.availability === 'available'
                  ? `交易所 ${availableResearchDecision.valuation.exchangeReportedPe.current ?? availableResearchDecision.valuation.exchangeReportedPe.value ?? '—'}`
                  : `交易所：${availableResearchDecision.valuation.exchangeReportedPe?.reason || '資料不足'}`}
                {' · '}
                {availableResearchDecision.valuation.modelComparablePe && availableResearchDecision.valuation.modelComparablePe.value != null
                  ? `模型 ${availableResearchDecision.valuation.modelComparablePe.value}`
                  : `模型：${availableResearchDecision.valuation.modelComparablePe?.reason || '不適用'}`}
              </p>
            </div>
          </div>
          {availableResearchDecision.materialChangedBecause.length === 0 && availableResearchDecision.lastEvaluatedAt ? (
            <p className="mt-2 text-slate-500 dark:text-emerald-100/60">已於 {formatTaipeiDateTime(availableResearchDecision.lastEvaluatedAt, 'compact')} 檢查，沒有重大變化。</p>
          ) : null}
        </section>
      ) : researchDecision?.availability === 'unavailable' ? (
        <section aria-label="研究與進場判斷" className="mt-3 rounded-xl border border-amber-500/25 bg-amber-500/8 p-3 text-xs">
          <div className="flex flex-wrap gap-2">
            <span className="rounded-full bg-slate-950/8 px-2.5 py-1 dark:bg-emerald-100/10">研究：{researchMaturityLabels[researchDecision.researchMaturity]}</span>
            <span className="rounded-full bg-amber-500/12 px-2.5 py-1 text-amber-800 dark:text-amber-300">動作：{newPositionActionLabels[researchDecision.newPositionAction]}</span>
          </div>
          <p className="mt-2 break-words text-amber-800 dark:text-amber-300">研究資料待補：{unavailableResearchDecisionLabels[researchDecision.reason]}</p>
        </section>
      ) : null}

		      <div className="mt-3 grid gap-2 sm:grid-cols-3">
	        <div className="rounded-xl border border-line bg-surface px-3 py-2">
	          <p className="text-[10px] tracking-[0.14em] text-slate-500 dark:text-emerald-100/50">推薦指數</p>
	          <p className="mt-1 text-sm font-semibold">{confidenceLabel(rec.recommendationIndex)} {rec.recommendationIndex != null ? `${rec.recommendationIndex}` : ''}</p>
	        </div>
	        <div className="rounded-xl border border-line bg-surface px-3 py-2">
	          <p className="text-[10px] tracking-[0.14em] text-slate-500 dark:text-emerald-100/50">情境達成率</p>
	          <p className="mt-1 text-sm font-semibold">{rec.scenarioChecklistProgress != null ? `${rec.scenarioChecklistProgress}%` : '待補'}</p>
	          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-emerald-100/60">{scenarioBreakdownLine(rec)}</p>
	        </div>
		        <div className="rounded-xl border border-line bg-surface px-3 py-2">
		          <p className="text-[10px] tracking-[0.14em] text-slate-500 dark:text-emerald-100/50">進場狀態</p>
		          <p className="mt-1 text-sm font-semibold">
                {researchDecision?.availability === 'unavailable'
                  ? '暫不提供進場建議'
                  : rec.tradeDecision?.action || rec.entryActionLabel || rec.entryReadinessLabel || '等待量價確認'}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-emerald-100/60">
                {researchDecision?.availability === 'unavailable'
                  ? '待研究證據補齊後再評估'
                  : rec.tradeDecision?.positionSize || rec.marketIndexSignal?.riskBudget || '依大盤與個股 Gate 決定'}
              </p>
		        </div>
		      </div>

	      <div className="mt-3 flex items-center justify-between gap-2">
	        <p className="text-xs text-slate-500 dark:text-emerald-100/60">
	          {rec.displayTargetMode === 'early_potential'
	            ? '未正式 · 待 gate 補齊'
	            : rec.displayBucket === 'hot_tracking'
	              ? `熱股追蹤 · ${rec.nextRevaluationAt ? `下次重估 ${formatTaipeiDateTime(rec.nextRevaluationAt, 'compact')}` : '等重估'}`
	              : rec.nextRevaluationAt && (rec.revaluationSlaStatus === 'due' || rec.revaluationSlaStatus === 'overdue')
	                ? `重估 ${rec.revaluationSlaStatus} · ${formatTaipeiDateTime(rec.nextRevaluationAt, 'compact')}`
	              : rec.isFallbackValuation
	                ? '待估值補齊'
	                : '點進查看估值與來源'}
	        </p>
	        <Link
	          href={`/stock/${rec.symbol}`}
          data-testid={isPrimary ? 'view-insight-link' : undefined}
          className="inline-flex min-h-11 shrink-0 items-center rounded-full bg-amber-300 px-3.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 dark:bg-amber-300 dark:text-slate-950"
	        >
	          深度分析 →
	        </Link>
	      </div>
	    </article>
	  );
	}

function StocksTab({ radar }: { radar: RadarDailyPayload }) {
  const namedFormal = (radar.opportunities || []).filter((r) => Boolean(r.chineseName));
  const namedScenario = (radar.scenarioUpsideCandidates || []).filter((r) => Boolean(r.chineseName));
  const namedEarly = (radar.earlyWatchlist ?? []).filter((r) => Boolean(r.chineseName));
  const namedHot = (radar.hotTracking || []).filter((r) => Boolean(r.chineseName));
  const decisionAvailable = (card: RecommendationCard) => card.researchDecision?.availability !== 'unavailable';
  const researchPendingBySymbol = new Map<string, RecommendationCard>();
  for (const card of [...namedFormal, ...namedScenario, ...namedEarly, ...namedHot]) {
    if (!decisionAvailable(card) && !researchPendingBySymbol.has(card.symbol)) researchPendingBySymbol.set(card.symbol, card);
  }
  const researchPending = [...researchPendingBySymbol.values()];
  const formalOpportunities = namedFormal.filter(decisionAvailable);
  const scenarioUpsideCandidates = namedScenario.filter(decisionAvailable);
  const hotTracking = namedHot.filter(decisionAvailable);
  const highConviction = formalOpportunities.filter((r) => r.recommendationBucket === 'high_conviction');
  const earlyFormal = formalOpportunities.filter((r) => r.recommendationBucket === 'early_formal');
  const earlyWatchlist = namedEarly.filter(decisionAvailable);
  const historicalSummary = radar.historicalObservationSummary;
  const historicalObservationCount = historicalSummary?.total || 0;
  const needsRevaluationCount = (historicalSummary?.revaluationQueue || 0) + earlyWatchlist.filter(
    (item) => item.displayTargetMode === 'needs_revaluation' || item.recommendationGateStatus === 'needs_revaluation',
  ).length;
  const overTargetArchivedCount =
    (historicalSummary?.valuationReflectedArchive || 0) +
    earlyWatchlist.filter((item) => item.targetCoverageStatus === 'over_base_and_scenario' || item.displayBucket === 'archived_over_target' || item.displayBucket === 'valuation_reflected_archive').length;
  const noFormalReasonCounts = [...scenarioUpsideCandidates, ...earlyWatchlist, ...hotTracking].reduce<Record<string, number>>(
    (counts, item) => {
      const reason =
        item.whyNoFormalRecommendation ||
        item.whyNotFormal ||
        item.whyNotPromoted ||
        item.revaluationJobSummary?.lastResult ||
        item.revaluationReason ||
        '等待完整 Gate';
      counts[reason] = (counts[reason] || 0) + 1;
      return counts;
    },
    {},
  );
  const noFormalReasonSummary = Object.entries(noFormalReasonCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([reason, count]) => `${count} 檔：${reason}`);

  const groups: { label: string; emoji: string; items: RecommendationCard[]; desc: string }[] = [
    { label: '高信念正式推薦', emoji: '✅', items: highConviction, desc: '推薦指數 80 以上且通過估值、證據、進場與安全 Gate。' },
    { label: '正式推薦', emoji: '✅', items: earlyFormal, desc: '同樣通過正式 Gate，但推薦指數尚未達高信念門檻。' },
  ];
  const primaryRecommendationId = groups.find((group) => group.items.length > 0)?.items[0]?.recommendationId;

  return (
    <div className="space-y-0">
      <p className="mb-8 text-sm text-slate-500 dark:text-emerald-100/50">
        首頁先顯示正式推薦 {formalOpportunities.length} 支，並依「推薦指數」排序；研究證據待補 {researchPending.length} 支不列入正式推薦；情境上行候選 {scenarioUpsideCandidates.length} 支只代表 upside case 有追蹤價值，不等於正式買點。
        早期可關注 {earlyWatchlist.length} 支會優先於歷史觀察顯示；熱股追蹤 {hotTracking.length} 支只保留市場討論與重估線索；歷史觀察 {historicalObservationCount} 支已收斂為重估/歸檔摘要。
      </p>

      {groups.map(({ label, emoji, items, desc }, groupIndex) =>
        items.length === 0 ? null : (
          <section key={label} className={groupIndex > 0 ? 'border-t border-line pt-8 mt-8' : ''}>
            <div className="mb-6 flex items-center gap-4">
              <span className="text-2xl">{emoji}</span>
              <div>
                <h3 className="text-lg font-semibold">{label}</h3>
                <p className="text-xs text-slate-500 dark:text-emerald-100/45">{desc}</p>
              </div>
              <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
                {items.length} 支
              </span>
            </div>
            <div className="grid gap-4 lg:grid-cols-2">
              {items.map((rec) => (
                <StockCard key={rec.recommendationId} rec={rec} isPrimary={rec.recommendationId === primaryRecommendationId} />
              ))}
            </div>
          </section>
        ),
      )}

      {researchPending.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <span className="text-2xl">🧪</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold">研究證據待補（非建議）</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">保留來源線索供後續研究；財務、估值或投影資料補齊前，不列入正式推薦、上行情境或買點判斷。</p>
            </div>
            <span className="rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              {researchPending.length} 支
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {researchPending.map((rec) => (
              <StockCard key={`research-pending-${rec.recommendationId}`} rec={rec} isPrimary={false} />
            ))}
          </div>
        </section>
      )}

      {formalOpportunities.length === 0 && earlyWatchlist.length === 0 && scenarioUpsideCandidates.length === 0 && (
        <div className="rounded-[1.5rem] border border-dashed border-line p-10 text-center text-slate-500 dark:text-emerald-100/45">
          今日沒有通過完整估值與進場條件的正式推薦。系統會保留觀察名單，但不把舊 target 包裝成買點。
        </div>
      )}

      {formalOpportunities.length === 0 && (
        <div className="mb-8 rounded-[1.5rem] border border-amber-500/25 bg-amber-500/8 p-5 text-sm text-amber-800 dark:text-amber-300">
          目前沒有通過完整 Gate 的正式推薦。{needsRevaluationCount > 0 ? `${needsRevaluationCount} 檔仍待 bridge-aware 重估；` : ''}
          {scenarioUpsideCandidates.length > 0 ? `${scenarioUpsideCandidates.length} 檔只剩情境價差；` : ''}
          {overTargetArchivedCount > 0 ? `${overTargetArchivedCount} 檔已過 Base/情境價，已從首頁推薦流移除。` : '系統不會用歷史觀察補位成買點。'}
          {noFormalReasonSummary.length ? (
            <div className="mt-3 grid gap-2 text-xs leading-5 text-amber-900/80 dark:text-amber-100/80 md:grid-cols-3">
              {noFormalReasonSummary.map((item) => (
                <span key={item} className="rounded-xl bg-white/45 px-3 py-2 dark:bg-slate-950/20">
                  {item}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {scenarioUpsideCandidates.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="text-2xl">⚖️</span>
            <div>
              <h3 className="text-lg font-semibold">情境上行候選（非正式）</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">基準情境尚未高於現價，只代表 upside case 仍有空間，請不要把卡片百分比當成正式目標價。</p>
            </div>
            <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              {scenarioUpsideCandidates.length} 支
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {scenarioUpsideCandidates.map((rec) => (
              <StockCard key={`scenario-${rec.recommendationId}`} rec={rec} isPrimary={false} />
            ))}
          </div>
        </section>
      )}

      {earlyWatchlist.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <div className="mb-6 flex items-center gap-4">
              <span className="text-2xl">🧭</span>
              <div>
                <h3 className="text-lg font-semibold">早期可關注</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">這些標的已有潛在估值空間，但尚未通過正式推薦 Gate；百分比是追蹤用，不是買進建議。</p>
              </div>
            <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              {earlyWatchlist.length} 支
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {earlyWatchlist.map((rec) => (
              <StockCard key={`early-${rec.recommendationId}`} rec={rec} isPrimary={false} />
            ))}
          </div>
        </section>
      )}

      {hotTracking.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <div className="mb-6 flex items-center gap-4">
            <span className="text-2xl">🔥</span>
            <div>
              <h3 className="text-lg font-semibold">熱股追蹤 / 估值已反映</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">
                市場正在討論或價量發動，但現價已高於 Base/情境或需要重新估值；這裡只用來追蹤新證據與回測，不是買進推薦。
              </p>
            </div>
            <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
              {hotTracking.length} 支
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {hotTracking.map((rec) => (
              <StockCard key={`hot-${rec.recommendationId}`} rec={rec} isPrimary={false} />
            ))}
          </div>
        </section>
      )}

      {historicalObservationCount > 0 && (
        <details className="mt-10 rounded-[1.5rem] border border-line bg-surface-strong p-5">
          <summary className="cursor-pointer list-none">
            <div className="flex items-center gap-4">
              <span className="text-2xl">🕘</span>
              <div>
                <h3 className="text-lg font-semibold">歷史觀察 / 重估佇列（非正式）</h3>
                <p className="text-xs text-slate-500 dark:text-emerald-100/45">
                  近 7 日與近 90 日只保留追蹤價值；已反映股票歸檔，仍有價差者進重估佇列，不再顯示舊 target 股票卡片。
                </p>
              </div>
              <span className="ml-auto rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">
                {historicalObservationCount} 支
              </span>
            </div>
          </summary>
          <div className="mt-5 grid gap-3 md:grid-cols-5">
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/50">待重估</p>
              <p className="mt-1 text-xl font-semibold">{historicalSummary?.revaluationQueue || 0}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/50">只剩情境</p>
              <p className="mt-1 text-xl font-semibold">{historicalSummary?.scenarioOnlyNeedsRevaluation || 0}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/50">估值已反映</p>
              <p className="mt-1 text-xl font-semibold">{historicalSummary?.valuationReflectedArchive || 0}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/50">缺新證據</p>
              <p className="mt-1 text-xl font-semibold">{historicalSummary?.missingNewEvidence || 0}</p>
            </div>
            <div className="rounded-2xl border border-line bg-surface p-3">
              <p className="text-[11px] tracking-[0.16em] text-slate-500 dark:text-emerald-100/50">已重估未過</p>
              <p className="mt-1 text-xl font-semibold">{historicalSummary?.repricedButNotFormal || 0}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2 md:grid-cols-2">
            {(historicalSummary?.examples || []).map((item) => (
              <div key={`${item.symbol}-${item.disposition}`} className="rounded-2xl border border-line bg-surface px-3 py-2 text-xs leading-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{item.symbol} {item.name}</span>
                  <span className="text-slate-500 dark:text-emerald-100/55">
                    {item.disposition === 'valuation_reflected_archive'
                      ? '已反映'
                      : item.disposition === 'scenario_only_needs_revaluation'
                        ? '只剩情境'
                        : item.disposition === 'revaluation_queue'
                          ? '待重估'
                          : item.disposition === 'repriced_but_not_formal'
                            ? '已重估未過'
                            : '缺證據'}
                  </span>
                </div>
                <p className="mt-1 text-slate-500 dark:text-emerald-100/58">{item.reason}</p>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

function ThemeCard({ theme, index }: { theme: ThemeHeatCard; index: number }) {
  return (
    <article className="rounded-[1.5rem] border border-line bg-surface-strong p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs tracking-[0.24em] text-slate-500 dark:text-emerald-100/45">主題 {index + 1}</p>
          <Link href={`/themes/${theme.themeKey}`} className="mt-2 block text-xl font-semibold hover:text-accent">
            {theme.themeName}
          </Link>
          <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">
            {(theme.marketRegime && marketRegimeLabel[theme.marketRegime]) || theme.marketRegime || '未標記'}
            {' · '}
            <span className="text-accent font-medium">{theme.relatedSymbols.join(', ')}</span>
          </p>
        </div>
        <div className="rounded-2xl bg-accent px-4 py-3 text-right text-white shrink-0">
          <p className="text-[11px] tracking-[0.2em]">熱度</p>
          <p className="text-2xl font-semibold">{theme.heatScore.toFixed(2)}</p>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-full bg-teal-600/12 px-3 py-1 text-teal-700 dark:text-teal-300">{theme.verificationStatus}</span>
        <span className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:text-emerald-100/72">證據 {theme.evidenceCount}</span>
        <span className="rounded-full bg-slate-950/8 px-3 py-1 text-slate-700 dark:text-emerald-100/72">
          最新來源 {formatTaipeiDateTime(theme.latestSourceAt, 'compact')}
        </span>
      </div>

      <details data-testid="theme-source-panel" className="mt-4 rounded-2xl border border-line bg-surface p-4">
        <summary className="cursor-pointer text-sm font-medium">查看來源與覆蓋狀態</summary>
        <div className="mt-4 space-y-3">
          {theme.sourceCoverage.map((source, sourceIndex) => (
            <article key={`${theme.themeKey}-${source.sourceName}-${sourceIndex}`} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{source.sourceName}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/50">
                    {sourceTypeLabel[source.sourceType] || source.sourceType} · {source.verificationStatus} · 權重 {source.weight.toFixed(2)}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-500 dark:text-emerald-100/50">
                  <p>{formatTaipeiDateTime(source.sourceTimestamp)}</p>
                  <p>{source.symbols.join(', ') || '未綁定股票'}</p>
                </div>
              </div>
              <p className="mt-2 text-sm leading-6 text-slate-700 dark:text-emerald-100/72">{source.summary || '尚無摘要。'}</p>
              {source.sourceUrl ? (
                <a href={source.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-flex text-xs text-accent underline-offset-2 hover:underline">
                  開啟來源
                </a>
              ) : null}
            </article>
          ))}
          <div className="rounded-xl border border-dashed border-line p-3 text-sm text-slate-700 dark:text-emerald-100/72">
            缺漏來源：{theme.missingSources.length > 0 ? theme.missingSources.join('、') : '目前主要來源已覆蓋'}
          </div>
        </div>
      </details>
    </article>
  );
}

function ThemesTab({ radar }: { radar: RadarDailyPayload }) {
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-emerald-100/50">
        主題代表市場正在討論的故事與敘事。點擊主題名稱查看相關股票。
      </p>
      {radar.hotThemes.map((theme, index) => (
        <ThemeCard key={`${theme.themeKey}-${theme.windowType}`} theme={theme} index={index} />
      ))}
    </div>
  );
}

const discoverySourceLabel: Record<string, string> = {
  PTT: 'PTT Stock',
  BullTalk: '股市爆料同學會',
  Threads: 'Threads',
  KOL: '台股 KOL',
  Telegram: 'Telegram',
  Instagram: 'Instagram',
  broker_report: '投顧報告',
  earnings_call: '法說會',
  mops: 'MOPS 重大訊息',
  podcast: 'Podcast',
  twse_insider: '董監持股揭露',
};

function DiscoveredCard({ stock }: { stock: DiscoveredStockCard }) {
  const stateBadge =
    stock.recommendationState === 'validated_thesis'
      ? { label: '已證實 thesis', cls: 'bg-teal-600/12 text-teal-700 dark:text-teal-300' }
      : stock.recommendationState === 'partially_verified'
        ? { label: '部分證實', cls: 'bg-sky-600/12 text-sky-700 dark:text-sky-300' }
        : { label: '未證實題材', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' };

  return (
    <article className="rounded-2xl border border-line bg-surface-strong p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-lg font-semibold">{stock.symbol}</span>
            <span className="truncate text-sm text-slate-600 dark:text-emerald-100/75">{stock.chineseName || stock.name || '-'}</span>
            <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs ${stateBadge.cls}`}>{stateBadge.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
            近 14 天提及 {stock.mentionCount} 次 · 最新 {formatTaipeiDateTime(stock.latestMentionAt, 'compact')}
          </p>
        </div>
        <div className="text-right">
          {stock.expectedUpsidePct != null && stock.expectedUpsidePct > 0 ? (
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">+{stock.expectedUpsidePct.toFixed(1)}%</p>
          ) : (
            <p className="text-sm font-medium text-amber-700 dark:text-amber-300">尚未形成估值</p>
          )}
          <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/68">
            {stock.currentPrice != null ? `現價 NT$${stock.currentPrice.toFixed(1)}` : '現價待補'}{stock.targetPrice != null ? ` · 目標價 NT$${stock.targetPrice.toFixed(1)}` : ''}
          </p>
        </div>
      </div>

      <p className="mt-3 text-sm font-medium leading-snug">{stock.thesisTitle || `${stock.symbol} 社群故事正在成形`}</p>
      <p className="mt-1.5 text-sm leading-6 text-slate-700 dark:text-emerald-50/88 line-clamp-3">
        {stock.storySummary || '目前已出現多來源討論，但尚待更多官方、財務或法說資料完成驗證。'}
      </p>

      <div className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {stock.sourceCoverage.map((item) => (
          <span key={item.label} className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-50/88">
            {(discoverySourceLabel[item.label] || sourceTypeLabel[item.label] || item.label)}({item.count})
          </span>
        ))}
        <span className="rounded-full bg-slate-950/8 px-2.5 py-0.5 text-slate-700 dark:bg-emerald-100/10 dark:text-emerald-50/88">
          估值來源 {valuationSourceLabel[stock.valuationSource]}
        </span>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['故事強度', stock.storyStrength],
          ['財務拐點', stock.financialInflection],
          ['估值落差', stock.valuationGap],
          ['籌碼時機', stock.chipTiming],
        ].map(([label, value]) => (
          <div key={label} className="rounded-xl border border-line bg-surface px-3 py-2 text-xs text-slate-600 dark:text-emerald-100/68">
            <p className="tracking-[0.18em] text-slate-500 dark:text-emerald-100/45">{label}</p>
            <p className="mt-1 text-sm font-semibold text-slate-900 dark:text-emerald-50">
              {typeof value === 'number' && Number.isFinite(value) ? value.toFixed(2) : '待補'}
            </p>
          </div>
        ))}
      </div>

      {stock.hybridScore != null ? (
        <p className="mt-3 text-xs text-slate-500 dark:text-emerald-100/70">
          Hybrid 分數 {stock.hybridScore.toFixed(2)}：只有當產業敘事、個股故事與至少一層數字/來源驗證互相對上時，才會往前排。
        </p>
      ) : null}

      {stock.whyNotRecommended ? (
        <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-700 dark:text-amber-300">
          {stock.whyNotRecommended}
        </p>
      ) : null}

      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 dark:text-emerald-100/70">
          這是社群早期題材卡，代表故事已被市場發現，但還沒全部升級成正式推薦。
        </div>
        <Link href={`/stock/${stock.symbol}`} className="shrink-0 rounded-full bg-amber-300 px-3.5 py-1.5 text-sm font-semibold text-slate-900 transition hover:bg-amber-200 dark:bg-amber-300 dark:text-slate-950">
          深度分析 →
        </Link>
      </div>
    </article>
  );
}

function SourceSignalCardView({ signal }: { signal: SourceSignalCard }) {
  return (
    <article className="rounded-[1.25rem] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.16em] text-amber-700 dark:text-amber-300">SOURCE SIGNAL · 估值待補</p>
          <h4 className="mt-1 break-words text-lg font-semibold text-slate-900 dark:text-emerald-50">
            {signal.chineseName ? `${signal.chineseName} ` : ''}{signal.symbol}
          </h4>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
          僅供研究
        </span>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-slate-600 dark:text-emerald-100/72">{signal.sourceSummary}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-slate-500 dark:text-emerald-100/50">來源類型</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.sourceClass}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">技術狀態</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.technicalState}</dd></div>
      </dl>
      <div className="mt-4 flex items-center justify-between gap-3">
        <time className="text-xs text-slate-500 dark:text-emerald-100/55" dateTime={signal.discoveredAt}>{signal.discoveredAt}</time>
        <Link href={`/stock/${signal.symbol}`} className="rounded-full bg-amber-300 px-3 py-1.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-200">查看研究 →</Link>
      </div>
    </article>
  );
}

function DiscoveryTab({ radar }: { radar: RadarDailyPayload }) {
  const stocks = (radar.discoveredStocks ?? []).filter((stock) => Boolean(stock.chineseName));
  const discoveredSymbols = new Set(stocks.map((stock) => stock.symbol));
  const sourceSignals = (radar.sourceSignals ?? []).filter((signal) => !discoveredSymbols.has(signal.symbol));
  const delta = radar.discoveryDelta;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-emerald-100/70">
        社群發現不是雜訊列表，而是從 PTT、股市爆料同學會、Threads、定錨投筆、Podcast 等來源抓到的早期候選池。這些股票已經有故事，但還在驗證與估值補強階段。
      </p>
      {delta ? (
        <section aria-label="每日股票發現變化" className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-line bg-surface p-3 text-xs sm:grid-cols-4">
          <div><span className="text-slate-500 dark:text-emerald-100/55">今日新增</span><strong className="mt-1 block text-slate-900 dark:text-emerald-50">{delta.added.length}</strong></div>
          <div><span className="text-slate-500 dark:text-emerald-100/55">今日退出</span><strong className="mt-1 block text-slate-900 dark:text-emerald-50">{delta.exited.length}</strong></div>
          <div><span className="text-slate-500 dark:text-emerald-100/55">持續追蹤</span><strong className="mt-1 block text-slate-900 dark:text-emerald-50">{delta.continued.length}</strong></div>
          <div><span className="text-slate-500 dark:text-emerald-100/55">無重大變化</span><strong className="mt-1 block text-slate-900 dark:text-emerald-50">{delta.unchangedReasons.length}</strong></div>
        </section>
      ) : null}
      {stocks.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {stocks.map((stock) => (
            <DiscoveredCard key={stock.symbol} stock={stock} />
          ))}
        </div>
      ) : (
        sourceSignals.length === 0 ? (
        <div className="rounded-[1.5rem] border border-dashed border-line p-10 text-center text-slate-500 dark:text-emerald-100/65">
          目前尚未從社群或投資報告中發現新的潛力股票。資料將在每日凌晨自動更新。
        </div>
        ) : null
      )}
      {sourceSignals.length > 0 ? (
        <section aria-labelledby="source-signals-title" className="space-y-3">
          <div>
            <h3 id="source-signals-title" className="text-base font-semibold text-slate-900 dark:text-emerald-50">新來源訊號</h3>
            <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/65">尚未完成估值的股票也會先列出；在資料補齊前不形成買進建議。</p>
          </div>
          <div className="grid gap-3 lg:grid-cols-2">
            {sourceSignals.map((signal) => <SourceSignalCardView key={`${signal.symbol}-${signal.discoveredAt}`} signal={signal} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}

export function RadarTabs({ radar }: Props) {
  const [activeTab, setActiveTab] = useState<TabKey>('stocks');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setMounted(true), 0);
    return () => window.clearTimeout(timer);
  }, []);

  const tabs: { key: TabKey; label: string; count: number }[] = [
    {
      key: 'stocks',
      label: '股票研究',
      count:
        radar.opportunities.filter((item) => Boolean(item.chineseName)).length +
        (radar.scenarioUpsideCandidates || []).filter((item) => Boolean(item.chineseName)).length +
        (radar.earlyWatchlist || []).filter((item) => Boolean(item.chineseName)).length,
    },
    { key: 'themes', label: '主題分析', count: radar.hotThemes.length },
    { key: 'discovery', label: '社群發現', count: new Set([
      ...(radar.discoveredStocks || []).filter((item) => Boolean(item.chineseName)).map((item) => item.symbol),
      ...(radar.sourceSignals || []).map((item) => item.symbol),
    ]).size },
  ];

  if (!mounted) {
    return (
      <div className="rounded-[1.5rem] border border-line bg-surface-strong p-6 text-sm text-slate-500 dark:text-emerald-100/65">
        推薦股票整理中，正在載入最新估值、情境與社群訊號…
      </div>
    );
  }

  return (
    <div>
      {/* Tab bar — full-width underline style */}
      <div className="mb-8 flex flex-wrap items-center border-b border-line">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`-mb-px flex min-w-0 items-center gap-2 border-b-2 px-3 py-3 text-base font-medium transition sm:px-6 ${
              activeTab === tab.key
                ? 'border-accent text-accent'
                : 'border-transparent text-slate-500 dark:text-emerald-100/55 hover:text-slate-800 dark:hover:text-emerald-100/80'
            }`}
          >
            {tab.label}
            <span
              className={`rounded-full px-2 py-0.5 text-xs ${
                activeTab === tab.key ? 'bg-accent/15 text-accent' : 'bg-slate-950/8 text-slate-500 dark:bg-emerald-100/10 dark:text-emerald-100/60'
              }`}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {activeTab === 'stocks' && <StocksTab radar={radar} />}
      {activeTab === 'themes' && <ThemesTab radar={radar} />}
      {activeTab === 'discovery' && <DiscoveryTab radar={radar} />}
    </div>
  );
}
