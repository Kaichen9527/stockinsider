'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { DiscoveredStockCard, RadarDailyPayload, RecommendationCard, SourceSignalCard, ThemeHeatCard } from '@/lib/types';
import { displayResearchDiagnostic } from '@/lib/opportunity-v3/research-display';
import { sourceSignalLifecycleStage, type CandidateLifecycleStage } from '@/lib/stage-classifier';

type Props = {
  radar: RadarDailyPayload;
};

const sourceTypeLabel: Record<string, string> = {
  official: '官方資料',
  financial: '財務數據',
  public_research: '公開研究',
  investanchors: '定錨（需授權結構化摘要）',
  threads: 'Threads',
  instagram: 'Instagram',
  telegram: 'Telegram（需授權訊息）',
  bulltalk: '股市爆料同學會（授權前不自動抓取）',
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

function researchDecisionComplete(rec: RecommendationCard) {
  const decision = rec.researchDecision;
  if (!decision) return true;
  return decision.availability === 'available'
    && decision.researchMaturity === 'decision_ready'
    && decision.valuation.status === 'normal'
    && decision.newPositionAction !== 'valuation_review';
}

function formalResearchPresentationReady(rec: RecommendationCard) {
  return researchDecisionComplete(rec) && rec.researchDecision?.newPositionAction !== 'avoid';
}

export function StockCard({ rec, isPrimary }: { rec: RecommendationCard; isPrimary: boolean }) {
  const cardTitleId = `stock-card-${rec.recommendationId.replace(/[^A-Za-z0-9_-]/gu, '-')}`;
  const researchDecision = rec.researchDecision;
  const availableResearchDecision = researchDecision?.availability === 'available' ? researchDecision : null;
  const researchFailClosed = Boolean(researchDecision) && !researchDecisionComplete(rec);
  const actionBlocked = researchDecisionComplete(rec) && researchDecision?.newPositionAction === 'avoid';
  const stateBadge =
    researchFailClosed
      ? { label: '研究待補', cls: 'bg-amber-500/12 text-amber-700 dark:text-amber-300' }
      : actionBlocked
        ? { label: '暫不進場', cls: 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65' }
      : rec.displayBucket === 'hot_tracking'
      ? { label: '熱股追蹤', cls: 'bg-orange-500/12 text-orange-700 dark:text-orange-300' }
      : rec.displayBucket === 'archived_over_target' || rec.displayBucket === 'valuation_reflected_archive' || rec.displayTargetMode === 'hidden_over_target'
      ? { label: '估值已反映', cls: 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65' }
      : isHistoricalObservation(rec)
        ? { label: '待重估觀察', cls: 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65' }
        : rec.recommendationBucket === 'high_conviction'
      ? { label: '高信念正式推薦', cls: 'cta-primary' }
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
        {researchFailClosed ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">估值狀態</p>
            <span className="text-sm font-bold text-amber-700 dark:text-amber-300">暫停估值</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">非今日買點</p>
          </div>
        ) : actionBlocked ? (
          <div className="shrink-0 text-right">
            <p className="text-[11px] tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">動作狀態</p>
            <span className="text-sm font-bold text-slate-600 dark:text-emerald-100/75">暫不進場</span>
            <p className="mt-1 text-[11px] text-slate-500 dark:text-emerald-100/55">非買進建議</p>
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

      {!researchFailClosed && valuationLine(rec) && (
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
            researchFailClosed || rec.targetCoverageStatus === 'over_base_and_scenario' || rec.displayTargetMode === 'hidden_over_target'
              ? 'bg-slate-950/8 text-slate-600 dark:text-emerald-100/65'
              : rec.targetCoverageStatus === 'scenario_only'
                ? 'bg-sky-600/12 text-sky-700 dark:text-sky-300'
                : 'bg-emerald-600/12 text-emerald-700 dark:text-emerald-300'
          }`}
        >
          {researchFailClosed ? '研究證據待補，暫不判斷估值空間' : targetCoverageLine(rec)}
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
                {availableResearchDecision.valuation.exchangeReportedPe?.status === 'available'
                  ? `交易所 ${availableResearchDecision.valuation.exchangeReportedPe.value}`
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
		          <p className="mt-1 text-sm font-semibold">{researchFailClosed ? '暫不評分' : `${confidenceLabel(rec.recommendationIndex)} ${rec.recommendationIndex ?? ''}`}</p>
	        </div>
	        <div className="rounded-xl border border-line bg-surface px-3 py-2">
	          <p className="text-[10px] tracking-[0.14em] text-slate-500 dark:text-emerald-100/50">情境達成率</p>
		          <p className="mt-1 text-sm font-semibold">{researchFailClosed ? '暫不評分' : rec.scenarioChecklistProgress != null ? `${rec.scenarioChecklistProgress}%` : '待補'}</p>
		          <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-emerald-100/60">{researchFailClosed ? '待研究證據補齊後再評估' : scenarioBreakdownLine(rec)}</p>
	        </div>
		        <div className="rounded-xl border border-line bg-surface px-3 py-2">
		          <p className="text-[10px] tracking-[0.14em] text-slate-500 dark:text-emerald-100/50">進場狀態</p>
		          <p className="mt-1 text-sm font-semibold">
                {researchFailClosed || actionBlocked
                  ? '暫不提供進場建議'
                  : rec.tradeDecision?.action || rec.entryActionLabel || rec.entryReadinessLabel || '等待量價確認'}
              </p>
              <p className="mt-1 text-[11px] leading-4 text-slate-500 dark:text-emerald-100/60">
                {researchFailClosed || actionBlocked
                  ? researchFailClosed ? '待研究證據補齊後再評估' : '研究決策已完成，目前動作為避開'
                  : rec.tradeDecision?.positionSize || rec.marketIndexSignal?.riskBudget || '依大盤與個股 Gate 決定'}
              </p>
		        </div>
		      </div>

	      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
	        <p className="text-xs text-slate-500 dark:text-emerald-100/60">
		          {researchFailClosed
		            ? '研究證據待補 · 非正式'
		            : actionBlocked
		              ? '研究完成 · 暫不進場'
		            : rec.displayTargetMode === 'early_potential'
	            ? '未正式 · 待 gate 補齊'
	            : rec.displayBucket === 'hot_tracking'
	              ? `熱股追蹤 · ${rec.nextRevaluationAt ? `下次重估 ${formatTaipeiDateTime(rec.nextRevaluationAt, 'compact')}` : '等重估'}`
	              : rec.nextRevaluationAt && (rec.revaluationSlaStatus === 'due' || rec.revaluationSlaStatus === 'overdue')
	                ? `重估 ${rec.revaluationSlaStatus} · ${formatTaipeiDateTime(rec.nextRevaluationAt, 'compact')}`
	              : rec.isFallbackValuation
	                ? '待估值補齊'
	                : '點進查看估值與來源'}
	        </p>
	        {rec.projectionReadOnly || !availableResearchDecision?.decisionRevisionId ? <Link href={`/stock/${rec.symbol}`} data-testid="research-only-detail-link" className="inline-flex min-h-11 max-w-full items-center rounded-full border border-line px-3.5 py-1.5 text-center text-sm font-semibold text-slate-600 dark:text-emerald-100/70">
	          {rec.projectionReadOnly?'查看唯讀研究':'查看研究資料'} →
	        </Link> : <Link
	          href={`/stock/${rec.symbol}?decisionRevisionId=${encodeURIComponent(availableResearchDecision.decisionRevisionId)}`}
          data-testid={isPrimary ? 'view-insight-link' : undefined}
          className="cta-primary inline-flex min-h-11 shrink-0 items-center rounded-full px-3.5 py-1.5 text-sm font-semibold transition"
	        >
	          深度分析 →
	        </Link>}
	      </div>
	    </article>
	  );
	}

function StocksTab({ radar }: { radar: RadarDailyPayload }) {
  const [selectedStage, setSelectedStage] = useState<'found' | 'waiting' | 'actionable'>('found');
  const decisionActionOrder = { buy: 0, accumulate: 1, research_starter: 2, wait_value:3,wait_market:4,wait_breakout: 5,
    wait_reclaim: 6, wait_refresh: 7, avoid_chase: 8, unavailable: 9, avoid: 10, data_needed: 11, ready: 12 } as const;
  const effectiveAction=(signal:SourceSignalCard)=>{
    const envelopeAction=signal.decisionEnvelope?.userAction??'unavailable';
    const next=signal.researchNextStep?.kind;
    if(signal.projectionReadOnly)return next==='ready'?'wait_refresh':next??'unavailable';
    if(envelopeAction==='unavailable')return next==='ready'?'wait_refresh':next??envelopeAction;
    return envelopeAction;
  };
  const radarAsOfMs = Date.parse(radar.asOf);
  const sevenDayCutoff = Number.isFinite(radarAsOfMs) ? radarAsOfMs - 7 * 24 * 60 * 60 * 1000 : null;
  const stagedDetailBySymbol = new Map((radar.stages?.found || []).map((signal) => [signal.symbol, signal]));
  const rankedResearch = [...(radar.sourceSignals ?? [])]
    .map((signal) => {
      const staged = stagedDetailBySymbol.get(signal.symbol);
      return staged ? { ...signal, stageAssessment: staged.stageAssessment, sourceProvenances: staged.sourceProvenances ?? signal.sourceProvenances } : signal;
    })
    .filter((signal) => {
      if (sevenDayCutoff == null) return true;
      const discoveredAt = Date.parse(signal.discoveredAt);
      return Number.isFinite(discoveredAt) && discoveredAt >= sevenDayCutoff;
    })
    .sort((left, right) => (decisionActionOrder[effectiveAction(left)]
      - decisionActionOrder[effectiveAction(right)])
      || (right.underreactionScore ?? 0) - (left.underreactionScore ?? 0));
  const persistedStageSymbols = {
    waiting: new Set((radar.stages?.waiting || []).map((signal) => signal.symbol)),
    actionable: new Set((radar.stages?.actionable || []).map((signal) => signal.symbol)),
  };
  const byStage = (stage: CandidateLifecycleStage) => rankedResearch.filter((signal) => {
    if (stage === 'waiting') return persistedStageSymbols.waiting.has(signal.symbol);
    if (stage === 'actionable') return persistedStageSymbols.actionable.has(signal.symbol);
    return sourceSignalLifecycleStage(signal) === stage;
  });
  const waitingItems = byStage('waiting');
  const actionableItems = byStage('actionable');
  const stageSections = [
    { key: 'found' as const, eyebrow: 'ALL SOURCE HITS', title: '全部來源命中', description: '最近來源命中的股票全部保留，包含正面、負面與尚待研究的提及；重複獨立來源會提高排序，並保留作者、原文與立場。', items: rankedResearch },
    { key: 'waiting' as const, eyebrow: 'CONDITION WATCH', title: '等待條件', description: '研究與估值已達最低門檻，但價格、技術、籌碼、大盤、資料信心或海外同業條件尚未全部通過。', items: waitingItems },
    { key: 'actionable' as const, eyebrow: 'ACTIONABLE NOW · SHADOW', title: '現在可行動', description: '嚴格通過估值、資料、技術、籌碼、市場與同業硬門檻，且連續兩個收盤日成立；30 個交易日內仍標示為實驗訊號。', items: actionableItems },
  ];
  const selectedSection = stageSections.find((section) => section.key === selectedStage) ?? stageSections[0];
  const closestWaiting = [...waitingItems].sort((left, right) => {
    const leftAssessment = left.stageAssessment;
    const rightAssessment = right.stageAssessment;
    return (rightAssessment?.actionabilityScore ?? -1) - (leftAssessment?.actionabilityScore ?? -1)
      || (rightAssessment?.dataConfidenceScore ?? -1) - (leftAssessment?.dataConfidenceScore ?? -1)
      || (rightAssessment?.researchScore ?? -1) - (leftAssessment?.researchScore ?? -1);
  }).slice(0, 5);
  const displayedItems = selectedStage === 'actionable' && selectedSection.items.length === 0 ? closestWaiting : selectedSection.items;
  if (['legacy-radar-v3.13.0','legacy-radar-v3.14.0','legacy-radar-v3.17.0','legacy-radar-v3.18.0','legacy-radar-v3.19.0','legacy-radar-v3.20.0'].includes(radar.sourceLedCorrectness?.schema??'') || rankedResearch.length > 0) return (
    <div className="space-y-0">
      {radar.projectionHealth?.status !== 'fresh' ? (
        <section role="status" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-5 py-4 text-sm text-amber-850 dark:text-amber-200">
          {radar.projectionHealth?.researchVisibility === 'last_good_readonly'
            ? `研究投影已漏 ${radar.projectionHealth?.missedExpectedRuns ?? 0} 次預定更新；目前只讀顯示 last-good，所有買進型動作已停用。`
            : '研究投影目前不可用；首頁以降級空狀態顯示，不提供買進型動作。'}
        </section>
      ) : null}
      <div role="tablist" aria-label="股票三層漏斗" className="mb-6 grid gap-2 rounded-2xl border border-line bg-surface-strong p-2 sm:grid-cols-3">
        {stageSections.map((section) => (
          <button key={section.key} role="tab" aria-selected={selectedStage === section.key} onClick={() => setSelectedStage(section.key)}
            className={`rounded-xl px-4 py-3 text-left text-sm font-semibold transition ${selectedStage === section.key ? 'bg-slate-950 text-white shadow-sm dark:bg-emerald-100 dark:text-slate-950' : 'text-slate-600 hover:bg-black/5 dark:text-emerald-100/65 dark:hover:bg-white/5'}`}>
            {section.title}<span className="ml-2 rounded-full bg-current/10 px-2 py-0.5 text-xs">{section.items.length}</span>
          </button>
        ))}
      </div>
      <section aria-labelledby={`signal-section-${selectedSection.key}`} className="mb-8 border-b border-line pb-8">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div className="max-w-3xl">
            <p className="text-[11px] font-medium tracking-[0.2em] text-amber-700 dark:text-amber-300">{selectedSection.eyebrow}</p>
            <h3 id={`signal-section-${selectedSection.key}`} className="mt-1 text-2xl font-semibold tracking-[-0.025em]">{selectedSection.title}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-emerald-100/60">{selectedSection.description}</p>
          </div>
          <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/65">{selectedSection.items.length} 檔</span>
        </div>
        {selectedStage === 'actionable' && selectedSection.items.length === 0 && closestWaiting.length > 0 ? (
          <p className="mb-4 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-5 py-4 text-sm text-amber-800 dark:text-amber-200">
            目前沒有通過全部硬門檻的可行動標的。以下固定顯示最接近達標的 {closestWaiting.length} 檔等待標的；它們不是買進建議，卡片內會列出缺少條件。
          </p>
        ) : null}
        {displayedItems.length > 0 ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {displayedItems.map((signal) => <SourceSignalCardView key={`${selectedSection.key}-${signal.symbol}-${signal.decisionRevisionId}`} signal={signal} />)}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-line px-5 py-6 text-sm text-slate-500 dark:text-emerald-100/55">
            {selectedStage === 'actionable' ? '目前沒有通過完整條件的可行動標的；系統不會用配額製造買進名單。'
              : selectedStage === 'waiting' ? '目前沒有完成最低研究與估值門檻的等待標的。' : '最近七日沒有有效股票來源命中。'}
          </p>
        )}
      </section>
    </div>
  );
  const namedFormal = (radar.opportunities || []).filter((r) => Boolean(r.chineseName));
  const namedScenario = (radar.scenarioUpsideCandidates || []).filter((r) => Boolean(r.chineseName));
  const namedEarly = (radar.earlyWatchlist ?? []).filter((r) => Boolean(r.chineseName));
  const namedHot = (radar.hotTracking || []).filter((r) => Boolean(r.chineseName));
  const researchPendingBySymbol = new Map<string, RecommendationCard>();
  const actionBlockedBySymbol = new Map<string, RecommendationCard>();
  for (const card of [...namedFormal, ...namedScenario, ...namedEarly, ...namedHot]) {
    if (!researchDecisionComplete(card)) {
      if (!researchPendingBySymbol.has(card.symbol)) researchPendingBySymbol.set(card.symbol, card);
      continue;
    }
    if (card.researchDecision?.newPositionAction === 'avoid' && !actionBlockedBySymbol.has(card.symbol)) {
      actionBlockedBySymbol.set(card.symbol, card);
    }
  }
  const researchPending = [...researchPendingBySymbol.values()];
  const actionBlockedCards = [...actionBlockedBySymbol.values()];
  const formalOpportunities = namedFormal.filter(formalResearchPresentationReady);
  const scenarioUpsideCandidates = namedScenario.filter(formalResearchPresentationReady);
  const hotTracking = namedHot.filter(formalResearchPresentationReady);
  const highConviction = formalOpportunities.filter((r) => r.recommendationBucket === 'high_conviction');
  const earlyFormal = formalOpportunities.filter((r) => r.recommendationBucket === 'early_formal');
  const earlyWatchlist = namedEarly.filter(formalResearchPresentationReady);
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
      {radar.projectionHealth?.status !== 'fresh' ? (
        <section role="status" className="mb-6 rounded-2xl border border-amber-500/30 bg-amber-500/8 px-5 py-4 text-sm text-amber-850 dark:text-amber-200">
          {radar.projectionHealth?.researchVisibility === 'last_good_readonly'
            ? `研究投影已漏 ${radar.projectionHealth?.missedExpectedRuns ?? 0} 次預定更新；目前只讀顯示 last-good，所有買進型動作已停用。`
            : '研究投影目前不可用；首頁以降級空狀態顯示，不提供買進型動作。'}
        </section>
      ) : null}
      {stageSections.map((section) => section.items.length > 0 ? (
        <section key={section.key} aria-labelledby={`signal-section-${section.key}`} className="mb-8 border-b border-line pb-8 last:border-b-0">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div className="max-w-3xl">
              <p className="text-[11px] font-medium tracking-[0.2em] text-amber-700 dark:text-amber-300">{section.eyebrow}</p>
              <h3 id={`signal-section-${section.key}`} className="mt-1 text-2xl font-semibold tracking-[-0.025em]">{section.title}</h3>
              <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-emerald-100/60">{section.description}</p>
            </div>
            <span className="rounded-full border border-line px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/65">{section.items.length} 檔</span>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            {section.items.map((signal) => <SourceSignalCardView key={`${section.key}-${signal.symbol}`} signal={signal} />)}
          </div>
        </section>
      ) : null)}
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

      {actionBlockedCards.length > 0 && (
        <section className="mt-10 border-t border-line pt-8">
          <div className="mb-6 flex flex-wrap items-center gap-4">
            <span className="text-2xl">🛑</span>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold">研究完成／暫不進場（非買進建議）</h3>
              <p className="text-xs text-slate-500 dark:text-emerald-100/45">研究與估值已完成，但技術、風險或品質條件要求避開；保留研究脈絡，不列入正式推薦。</p>
            </div>
            <span className="rounded-full bg-slate-950/8 px-3 py-1 text-xs text-slate-600 dark:text-emerald-100/60">{actionBlockedCards.length} 支</span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {actionBlockedCards.map((rec) => <StockCard key={`action-blocked-${rec.recommendationId}`} rec={rec} isPrimary={false} />)}
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
              <Link href={`/stock/${item.symbol}`} key={`${item.symbol}-${item.disposition}`} className="block rounded-2xl border border-line bg-surface px-3 py-2 text-xs leading-5 transition hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600">
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
              </Link>
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
        <div className="cta-primary rounded-2xl px-4 py-3 text-right shrink-0">
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
        <Link href={`/stock/${stock.symbol}`} className="cta-primary shrink-0 rounded-full px-3.5 py-1.5 text-sm font-semibold transition">
          深度分析 →
        </Link>
      </div>
    </article>
  );
}

function SourceSignalDiagnostics({ signal }: { signal: SourceSignalCard }) {
  const actionLabels = {
    setup_ready: '條件成熟候選', wait_breakout: '等待突破', wait_reclaim: '等待收復',
    avoid_chase: '乖離過高／不追價', evidence_watch: '補證據觀察', avoid: '暫時避開',
  } as const;
  const actionDescriptions = {
    selective_high_conviction_at_support: '選股／防守盤中，僅保留完整度高且位於支撐區的候選。',
    selective_high_conviction_breakout_confirmed: '選股／防守盤中，個股已用量價與相對強度確認突破。',
    risk_on_at_support: '大盤條件支持，個股位於合理乖離與支撐區。',
    risk_on_breakout_confirmed: '大盤條件支持，個股突破已由量價與相對強度確認。',
    support_must_be_reclaimed: '股價仍在支撐下方，先收復再重新評估。',
    breakout_not_confirmed: '研究條件足夠，但量價突破尚未確認。',
    price_extended_wait_for_reset: '乖離已過高，等待回到合理區間。',
    relative_evidence_incomplete: '相對估值、基本面或價格證據尚未完整。',
    market_evidence_incomplete: '大盤證據不完整，暫不形成進場候選。',
    market_or_timing_gate_not_met: '大盤或個股時機尚未同時通過。',
    underreaction_score_below_floor: '未反映分數低於研究門檻。',
  } as const;
  const action = signal.opportunityAction ?? 'evidence_watch';
  const dispositionLabel = actionLabels[action];
  const technicalTrigger = signal.technicalState === 'reclaim_required' || signal.technicalState === 'below_support'
    ? '先收復 MA20／原支撐並站穩，才重新評估進場。'
    : signal.technicalState === 'extended' ? '乖離偏高，不追價；等待回到合理乖離區。'
      : signal.technicalState === 'breakout_pending' ? '等待帶量突破或回測確認。'
        : signal.technicalState === 'breakout_confirmed' ? '突破已由成交量與相對強度確認；仍需遵守失效條件。'
          : signal.technicalState === 'at_support' ? '目前接近 MA20 支撐與合理乖離區，可配合基本面評估。'
            : '技術資料不足，不形成進場訊號。';
  const explainReason = (reason: string) => ({
    'f:revenue_ok': '官方月營收尚未惡化','f:revenue_down':'官方月營收正在減弱',
    'v:sector_history': 'PE 已與自身歷史及同產業比較','v:history':'PE 已與自身歷史比較',
    'v:sector':'PE 已與同產業比較','p:drawdown':'股價相對 60／120 日高點明顯回落',
    'p:moderate':'股價出現中度回落','p:extended':'股價乖離偏高','d:dislocation':'全市場跌深掃描納入',
    't:reclaim':'技術面必須先收復','t:breakout_pending':'等待突破確認',
    't:breakout_confirmed':'量價與相對強度已確認突破','t:at_support':'接近 MA20 支撐與合理乖離',
    't:extended':'技術面過度延伸',
  }[reason] ?? '其他研究訊號待覆核');
  const explainRisk = (reason: string) => displayResearchDiagnostic(reason);
  const conditionLabel = (condition: string) => ({
    research_score_below_55: '研究分數未達 55', data_confidence_below_55: '資料信心未達 55',
    bear_base_bull_missing: '缺 Bear／Base／Bull 情境', base_upside_below_8: 'Base 上行空間未達 8%',
    reward_risk_below_1: '報酬風險比未達 1.0', material_official_counter_evidence: '存在重大官方反證',
    research_score_below_70: '研究分數未達 70', actionability_below_65: '行動分數未達 65',
    data_confidence_below_75: '資料信心未達 75', base_upside_below_12: 'Base 上行空間未達 12%',
    reward_risk_below_1_5: '報酬風險比未達 1.5', requires_two_consecutive_closes: '尚未連續兩個收盤日通過',
    technical_hard_gate_failed: '技術硬門檻未通過', negative_overseas_peer_catchdown: '海外同業補跌風險阻擋',
    stale_or_fallback_data: '資料過期或僅有 fallback', market_risk_off_blocks_new_actionable: '大盤 risk-off，禁止新增可行動',
    market_breakdown_forces_downgrade: '大盤 breakdown，強制降級',
  }[condition] ?? condition);
  const stageAssessment = signal.stageAssessment;
  return (
    <article className="rounded-[1.25rem] border border-line bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs tracking-[0.16em] text-amber-700 dark:text-amber-300">未反映研究 · {dispositionLabel}</p>
          <h4 className="mt-1 break-words text-lg font-semibold text-slate-900 dark:text-emerald-50">
            {signal.chineseName ? `${signal.chineseName} ` : ''}{signal.symbol}
          </h4>
        </div>
        <span className="shrink-0 rounded-full border border-amber-500/25 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-700 dark:text-amber-300">
          {Number.isFinite(signal.underreactionScore) ? `${signal.underreactionScore} 分` : '資料不足'}
        </span>
      </div>
      <p className="mt-3 break-words text-sm leading-6 text-slate-600 dark:text-emerald-100/72">{signal.sourceSummary}</p>
      <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/8 px-3 py-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
        {actionDescriptions[signal.actionReason as keyof typeof actionDescriptions] ?? '依基本面、相對估值、價格未反映程度與技術時機持續評估。'}
      </p>
      {Number.isFinite(signal.underreactionScore) ? (
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
          <div className="rounded-xl bg-slate-950/5 p-2 dark:bg-emerald-100/8"><span className="text-slate-500">研究分數</span><strong className="mt-1 block text-base">{signal.underreactionScore}</strong></div>
          <div className="rounded-xl bg-slate-950/5 p-2 dark:bg-emerald-100/8"><span className="text-slate-500">覆蓋率</span><strong className="mt-1 block text-base">{Math.round((signal.scoreCoverage ?? 0) * 100)}%</strong></div>
          <div className="rounded-xl bg-slate-950/5 p-2 dark:bg-emerald-100/8"><span className="text-slate-500">信心</span><strong className="mt-1 block text-base">{Math.round((signal.scoreConfidence ?? 0) * 100)}%</strong></div>
        </div>
      ) : null}
      {signal.axisScores ? (
        <div aria-label="未反映機會四軸評分" className="mt-3 grid grid-cols-4 gap-2 text-xs">
          {([['fundamental','基本面'],['dislocation','未反映'],['valuation','相對估值'],['timing','時機']] as const).map(([key,label]) => (
            <div key={key} className="min-w-0 rounded-xl bg-slate-950/5 p-2 text-center dark:bg-emerald-100/8">
              <span className="text-slate-500">{label}</span><strong className="mt-1 block text-sm">{signal.axisScores?.[key] ?? '—'}</strong>
            </div>
          ))}
        </div>
      ) : null}
      <dl className="mt-3 grid grid-cols-2 gap-2 text-xs">
        <div><dt className="text-slate-500 dark:text-emerald-100/50">來源類型</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{sourceTypeLabel[signal.sourceClass] ?? signal.sourceClass}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">技術狀態</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{technicalStateLabels[signal.technicalState as keyof typeof technicalStateLabels] ?? '資料不足'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">目前股價</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.currentPrice != null ? signal.currentPrice.toFixed(2) : '待補'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">60 日回落</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.drawdown60Pct != null ? `${signal.drawdown60Pct.toFixed(1)}%` : '待補'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">BIAS 20 / 60 / 120</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{[signal.bias20Pct,signal.bias60Pct,signal.bias120Pct].map((value)=>value != null ? `${value.toFixed(1)}%` : '—').join(' / ')}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">RSI14 / 量比</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.rsi14 != null ? signal.rsi14.toFixed(1) : '—'} / {signal.volumeRatio20 != null ? signal.volumeRatio20.toFixed(2) : '—'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">相對加權 20 日</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.relativeStrength20Pct != null ? `${signal.relativeStrength20Pct.toFixed(1)}%` : '待補'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">營收年增</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.revenueYoy != null ? `${signal.revenueYoy.toFixed(1)}%` : '待補'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">PE / 歷史中位 / 同產業</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">{signal.currentPe != null ? signal.currentPe.toFixed(1) : '待補'} / {signal.historyPeMedian != null ? signal.historyPeMedian.toFixed(1) : '待累積'} / {signal.sectorPe != null ? signal.sectorPe.toFixed(1) : '待補'}</dd></div>
        <div><dt className="text-slate-500 dark:text-emerald-100/50">PE 相對折溢價</dt><dd className="mt-1 text-slate-800 dark:text-emerald-50">自身 {signal.ownPeDiscountPct != null ? `${signal.ownPeDiscountPct > 0 ? '+' : ''}${signal.ownPeDiscountPct.toFixed(1)}%` : '待補'} / 產業 {signal.sectorPeDiscountPct != null ? `${signal.sectorPeDiscountPct > 0 ? '+' : ''}${signal.sectorPeDiscountPct.toFixed(1)}%` : '待補'}</dd></div>
      </dl>
      {signal.valuationAuthority === 'exchange_reported' ? <p className="mt-2 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">估值來源：{signal.valuationExchange ?? '交易所'} · 當期 {signal.valuationAsOf ?? '日期待補'}{(signal.historyPeSessions?.length ?? 0) > 0 ? ` · 歷史樣本 ${signal.historyPeSessions?.join('、')}` : ''}</p> : null}
      <p className="mt-3 text-xs leading-5 text-sky-700 dark:text-sky-300">技術觸發：{technicalTrigger}</p>
      {stageAssessment ? (
        <div className="mt-3 rounded-xl border border-line bg-surface-strong p-3 text-xs leading-5">
          <p className="font-semibold text-slate-800 dark:text-emerald-50">三層評分 · {stageAssessment.sessionDate}</p>
          <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
            發現 {stageAssessment.discoveryScore.toFixed(1)} · 研究 {stageAssessment.researchScore.toFixed(1)} · 行動 {stageAssessment.actionabilityScore.toFixed(1)} · 資料信心 {stageAssessment.dataConfidenceScore.toFixed(1)}
          </p>
          <p className="mt-1 text-slate-600 dark:text-emerald-100/70">
            Base 空間 {stageAssessment.baseUpsidePct == null ? '待補' : `${stageAssessment.baseUpsidePct.toFixed(1)}%`} · 報酬風險比 {stageAssessment.rewardRiskRatio == null ? '待補' : stageAssessment.rewardRiskRatio.toFixed(2)}
          </p>
          {stageAssessment.unmetConditions.length > 0 ? <p className="mt-1 text-amber-700 dark:text-amber-300">未達：{stageAssessment.unmetConditions.map(conditionLabel).join('、')}</p> : null}
        </div>
      ) : null}
      {(signal.positiveReasons?.length ?? 0) > 0 ? <p className="mt-1 text-xs leading-5 text-emerald-700 dark:text-emerald-300">加分：{signal.positiveReasons?.map(explainReason).join('、')}</p> : null}
      {(signal.riskReasons?.length ?? 0) > 0 ? <p className="mt-1 text-xs leading-5 text-amber-700 dark:text-amber-300">風險：{signal.riskReasons?.map(explainRisk).join('、')}</p> : null}
      <div className="mt-4 flex items-center justify-between gap-3">
        <time className="text-xs text-slate-500 dark:text-emerald-100/55" dateTime={signal.discoveredAt}>{signal.discoveredAt}</time>
        <Link href={`/stock/${signal.symbol}`} className="cta-primary rounded-full px-3 py-1.5 text-sm font-semibold transition">查看研究 →</Link>
      </div>
    </article>
  );
}

function SourceSignalCardView({ signal }: { signal: SourceSignalCard }) {
  const envelope = signal.decisionEnvelope;
  const nextStep=signal.researchNextStep;
  const envelopeAction=envelope?.userAction ?? 'unavailable';
  const action = signal.projectionReadOnly
    ? (nextStep?.kind==='ready'?'wait_refresh':nextStep?.kind??'unavailable')
    : envelopeAction==='unavailable'
      ? (nextStep?.kind==='ready'?'wait_refresh':nextStep?.kind??envelopeAction)
      : envelopeAction;
  const actionLabels = {
    buy: '可買進', accumulate: '可分批', research_starter: '研究型小量分批',
        wait_value:'等待價格',wait_market:'等待大盤',wait_breakout: '等待突破', wait_reclaim: '等待收復支撐', wait_refresh:'等待資料刷新',
    avoid_chase: '不追價', avoid: '暫時避開', unavailable: '資料待補', data_needed:'資料待補', ready:'待權限恢復',
  } as const;
  const readinessLabel={actionable:'現在可行動',near_action:'接近買點',wait_condition:'等待條件',data_needed:'資料待補'} as const;
  const readiness=signal.researchReadiness?.status;
  const actionLabel=signal.projectionReadOnly&&readiness
    ? `${readinessLabel[readiness]}・唯讀`
    : action==='unavailable'&&signal.proximityToAction===true?'接近買點・待深度驗證':actionLabels[action];
  const actionTone = ['buy', 'accumulate', 'research_starter'].includes(action)
    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
        : ['wait_value','wait_market','wait_breakout', 'wait_reclaim', 'wait_refresh', 'avoid_chase'].includes(action)||signal.proximityToAction===true
      ? 'border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300'
      : 'border-amber-500/25 bg-amber-500/8 text-amber-800 dark:text-amber-300';
  const valuation = envelope?.valuationSummary;
  const provisional=signal.provisionalRelativeValue;
  const band = valuation?.formalRange
    ? { low: valuation.formalRange.bear, base: valuation.formalRange.base, high: valuation.formalRange.bull }
    : valuation?.relativeBand ?? provisional?.referenceBand ?? null;
  const triggerValue = envelope?.entryPlan?.trigger && typeof envelope.entryPlan.trigger === 'object'
    ? envelope.entryPlan.trigger.threshold ?? null
    : nextStep?.trigger?.threshold ?? null;
  const invalidation = envelope?.entryPlan?.invalidation ?? nextStep?.invalidation ?? null;
  const missingCount = new Set([
    ...(envelope?.blockers ?? []),
    ...(signal.missingAxes ?? []),
    ...(!Number.isFinite(signal.currentPrice) ? ['current_price'] : []),
  ]).size;
  const revision = signal.decisionRevisionId ?? envelope?.decisionRevisionId ?? null;
  const href = revision
    ? signal.detailHref ?? `/stock/${signal.symbol}?decisionRevisionId=${encodeURIComponent(revision)}`
    : signal.detailHref ?? `/stock/${signal.symbol}`;
  const provenance = signal.sourceProvenance;
  const provenanceItems = (signal.sourceProvenances?.length ? signal.sourceProvenances : provenance ? [{
    ref: 'primary', ...provenance, stance: null,
  }] : []).slice(0, 6);
  const stanceLabel = { positive: '正向', negative: '負向', neutral: '中性', mixed: '多空混合' } as const;

  return (
    <article data-testid="decision-card" data-numeric-budget="six financial or trigger values; stock identity excluded" aria-label={`${signal.chineseName || signal.symbol} ${signal.symbol} ${actionLabel}`} className="overflow-hidden rounded-[1.35rem] border border-line bg-surface shadow-[0_10px_34px_rgba(8,18,26,0.06)]">
      <div className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-medium tracking-[0.18em] text-slate-500 dark:text-emerald-100/55">
              {envelope?.recommendationAuthority === 'formal' ? '正式決策'
                : envelope?.recommendationAuthority === 'conditional_research' ? '條件式研究' : '來源待研究'}
            </p>
            <h4 className="mt-1 text-xl font-semibold tracking-[-0.02em] text-slate-950 dark:text-emerald-50">
              {signal.chineseName ? `${signal.chineseName} ` : ''}<span className="font-mono text-base text-slate-500">{signal.symbol}</span>
            </h4>
          </div>
          <span className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold ${actionTone}`}>
            {actionLabel}
          </span>
        </div>

        <p className="mt-3 line-clamp-2 text-sm leading-6 text-slate-650 dark:text-emerald-100/72">
          {signal.projectionReadOnly ? `研究投影目前唯讀；${nextStep?.reason === 'support_must_be_reclaimed' ? '需先收復支撐。' : nextStep?.reason === 'breakout_not_confirmed' ? '等待突破確認。' : '暫停所有買進型動作，等待資料刷新。'}`
            :signal.proximityToAction===true&&action==='unavailable'
              ?'研究排序、覆蓋與核心三軸已達接近買點；等待深度估值與正式決策驗證。'
              :envelope?.whyNow || signal.sourceSummary}
        </p>

        <dl data-testid="collapsed-decision-metrics" className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-4">
          <div className="bg-surface-strong p-3">
            <dt className="text-[11px] tracking-[0.12em] text-slate-500">現價</dt>
            <dd className="mt-1 text-base font-semibold">{signal.currentPrice != null ? <span data-decision-numeric-value>{`NT$${signal.currentPrice.toFixed(2)}`}</span> : '待補'}</dd>
          </div>
          <div className="bg-surface-strong p-3 sm:col-span-2">
            <dt className="text-[11px] tracking-[0.12em] text-slate-500">
              {valuation?.kind === 'formal_range' ? 'Bear / Base / Bull'
                : valuation?.kind === 'relative_reference_band' ? '相對估值參考帶'
                  : provisional ? `暫定相對估值帶（${provisional.sampleCount} 日）` : '估值'}
            </dt>
            <dd className="mt-1 text-base font-semibold">
              {band ? <><span data-decision-numeric-value>{band.low.toFixed(1)}</span> / <span data-decision-numeric-value>{band.base.toFixed(1)}</span> / <span data-decision-numeric-value>{band.high.toFixed(1)}</span></>
                : `尚缺 ${Math.max(1, missingCount)} 項`}
            </dd>
          </div>
          <div className="bg-surface-strong p-3">
            <dt className="text-[11px] tracking-[0.12em] text-slate-500">觸發 / 失效</dt>
            <dd className="mt-1 text-sm font-semibold">
              {triggerValue != null ? <span data-decision-numeric-value>{triggerValue.toFixed(1)}</span> : '待條件'} / {invalidation != null ? <span data-decision-numeric-value>{invalidation.toFixed(1)}</span> : '待補'}
            </dd>
          </div>
        </dl>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex min-w-0 flex-wrap gap-1.5 text-xs leading-5 text-slate-500 dark:text-emerald-100/55">
            {provenanceItems.length > 0 ? provenanceItems.map((item) => (
              <a key={`${item.ref}-${item.sourceUrl}`} href={item.sourceUrl || undefined} target="_blank" rel="noreferrer"
                className="rounded-full border border-line bg-surface px-2.5 py-0.5 underline decoration-slate-300 underline-offset-2 hover:text-slate-800 dark:hover:text-emerald-50">
                {item.sourceName || item.kolIdentity || sourceTypeLabel[signal.sourceClass] || signal.sourceClass}{item.stance ? ` · ${stanceLabel[item.stance]}` : ''}
              </a>
            )) : <span>{sourceTypeLabel[signal.sourceClass] || signal.sourceClass}</span>}
            <span className="sr-only">；發布、收集與評估日期請展開研究依據。</span>
          </div>
          <a href={href} data-testid={revision?'decision-detail-link':'research-only-detail-link'} className="cta-primary inline-flex min-h-11 items-center rounded-full px-4 py-2 text-sm font-semibold transition">
            {revision?'查看決策摘要':'查看唯讀研究'} →
          </a>
        </div>
      </div>

      <details className="group border-t border-line bg-slate-950/[0.02] dark:bg-white/[0.02]">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 py-3 text-sm font-medium text-slate-600 marker:hidden dark:text-emerald-100/70">
          研究依據與診斷
          <span aria-hidden="true" className="transition group-open:rotate-45">＋</span>
        </summary>
        <div className="border-t border-line p-3"><SourceSignalDiagnostics signal={signal} /></div>
      </details>
    </article>
  );
}

function DiscoveryTab({ radar }: { radar: RadarDailyPayload }) {
  const stocks = (radar.discoveredStocks ?? []).filter((stock) => Boolean(stock.chineseName));
  const sourceSignals: SourceSignalCard[] = radar.sourceSignals ?? [];
  const delta = radar.discoveryDelta;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-500 dark:text-emerald-100/70">
        這裡只顯示已授權且已完成實體連結的來源訊號。定錨會員內容與 Telegram 只有在授權結構化摘要、原始 citation 與股票連結都齊全時才可形成研究 claim；只有 metadata 的影片或 Podcast 不會被當成投資論點。
      </p>
      {delta ? (
        <section aria-label="每日股票發現變化" className="grid grid-cols-2 gap-2 rounded-[1.25rem] border border-line bg-surface p-3 text-xs sm:grid-cols-4">
          <div><span className="text-slate-500 dark:text-emerald-100/55">候選池新增</span><strong className="mt-1 block text-slate-900 dark:text-emerald-50">{delta.added.length}</strong></div>
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
            <p className="mt-1 text-xs text-slate-500 dark:text-emerald-100/65">尚未完成估值的股票也會先列出；目前顯示候選池排序前 30 檔，在資料補齊前不形成買進建議。</p>
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

  const visibleStockCount = new Set([
    ...(radar.opportunities || []), ...(radar.scenarioUpsideCandidates || []),
    ...(radar.earlyWatchlist || []), ...(radar.hotTracking || []), ...(radar.sourceSignals || []),
  ].filter((item) => Boolean(item.symbol)).map((item) => item.symbol)).size;
  const tabs: { key: TabKey; label: string; count: number }[] = [
    {
      key: 'stocks',
      label: '股票研究',
          count: visibleStockCount,
    },
    { key: 'themes', label: '主題分析', count: radar.hotThemes.length },
    { key: 'discovery', label: '社群發現', count: new Set([
      ...(radar.discoveredStocks || []).filter((item) => Boolean(item.chineseName)).map((item) => item.symbol),
      ...(radar.sourceSignals || []).map((item) => item.symbol),
    ]).size },
  ];

  return (
    <div>
      {/* Tab bar — full-width underline style */}
      <div role="tablist" aria-label="雷達內容" className="mb-8 flex flex-wrap items-center border-b border-line">
        {tabs.map((tab,index) => (
          <button
            key={tab.key}
            id={`radar-tab-${tab.key}`}
            role="tab"
            aria-selected={activeTab===tab.key}
            aria-controls={`radar-panel-${tab.key}`}
            tabIndex={activeTab===tab.key?0:-1}
            onClick={() => setActiveTab(tab.key)}
            onKeyDown={(event)=>{
              if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
              event.preventDefault();
              const next=event.key==='Home'?0:event.key==='End'?tabs.length-1
                :(index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
              setActiveTab(tabs[next].key);
              document.getElementById(`radar-tab-${tabs[next].key}`)?.focus();
            }}
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

      <div id={`radar-panel-${activeTab}`} role="tabpanel" aria-labelledby={`radar-tab-${activeTab}`} tabIndex={0}>
        {activeTab === 'stocks' && <StocksTab radar={radar} />}
        {activeTab === 'themes' && <ThemesTab radar={radar} />}
        {activeTab === 'discovery' && <DiscoveryTab radar={radar} />}
      </div>
    </div>
  );
}
