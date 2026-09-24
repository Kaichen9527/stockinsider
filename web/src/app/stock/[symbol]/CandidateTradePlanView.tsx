import type { TwEntryPlanBundle } from '@/lib/tw-entry-plan-contract';
import { TW_ENTRY_PLAN_SCHEMA } from '@/lib/tw-entry-plan-contract';
import { tradeEligibilityLabel, tradePlanDisplayState, tradePlanReasonLabel, tradePlanStateLabel, tradeSignalLabel, tradeStrategyLabel } from '@/lib/tw-entry-plan-display';
import CandidateTradePlanChart from '@/lib/candidate-trade-plan-chart';

function price(value: number | null) {
  return value != null && Number.isFinite(value) ? `NT$${value.toFixed(2)}` : '尚無有效價位';
}
function time(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false }) : '尚待確認';
}

export default function CandidateTradePlanView({ bundle, revisionId, publicationState = 'preliminary', asOf = new Date().toISOString() }: {
  bundle?: TwEntryPlanBundle | null; revisionId: string; publicationState?: 'confirmed' | 'preliminary' | 'stale_readonly'; asOf?: string;
}) {
  const supported = bundle?.schemaVersion === TW_ENTRY_PLAN_SCHEMA && bundle.candidateRevisionId === revisionId
    && bundle.plans.every((plan) => plan.candidateRevisionId === revisionId);
  return <section id="trade-plans" aria-labelledby="trade-plans-title" data-testid="candidate-trade-plans" className="mt-8 min-w-0 space-y-4">
    <div>
      <p className="research-kicker">DAILY TRADE RESEARCH</p>
      <h2 id="trade-plans-title" className="mt-2 text-xl font-semibold">進出場計畫</h2>
      <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-400">兩套日線策略的研究觀察；績效尚未驗證。技術成立與正式資格分開顯示，不改變既有研究分類，也不代表已成交。</p>
      {publicationState !== 'confirmed' ? <p data-testid="trade-plan-publication-block" className="mt-3 rounded-xl border border-amber-300/70 bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{publicationState === 'stale_readonly' ? '舊版研究，只供回看；目前正式資格停用。' : '初步研究版本；目前正式資料尚未完整，價位只供條件研究。'} 下方技術與資格為當時快照，不代表現在可進場。</p> : null}
    </div>
    {!supported || !bundle ? <p data-testid="trade-plan-unavailable" className="rounded-2xl border border-dashed border-amber-300 p-5 text-sm leading-6 text-amber-800 dark:text-amber-200">這份研究版本尚無可驗證的進出場計畫。保留原有歷史圖表；不以最新行情補寫舊版本，也不由收盤價補造 K 線。</p> : <>
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        {bundle.plans.map((plan) => {
          const displayState = tradePlanDisplayState(plan, asOf);
          const expired = displayState === 'expired';
          const reasonLabels = [...new Set([...plan.eligibility.reasonCodes, ...plan.reasonCodes, ...plan.missingData].map(tradePlanReasonLabel))];
          return <article key={plan.planId} data-testid={`trade-plan-${plan.strategyId}`} data-plan-id={plan.planId} className="min-w-0 rounded-2xl border border-line bg-[var(--surface)] p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-semibold">{tradeStrategyLabel[plan.strategyId]}</h3>
              <span className="rounded-full border border-amber-300/70 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">研究用 · 日線波段</span>
            </div>
            <p className="mt-3 text-sm font-semibold" data-testid="trade-plan-display-state">{publicationState !== 'confirmed' && !expired ? '當時計畫：' : ''}{tradePlanStateLabel[displayState]}</p>
            <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-xs text-stone-500">原始技術訊號</dt><dd className="mt-1 font-medium" data-testid="trade-plan-raw-signal">{tradeSignalLabel[plan.rawSignalState]}</dd></div>
              <div><dt className="text-xs text-stone-500">正式資格（訊號當時）</dt><dd className="mt-1 font-medium" data-testid="trade-plan-eligibility">{tradeEligibilityLabel[plan.eligibility.state]}</dd></div>
              <div><dt className="text-xs text-stone-500">訊號交易日</dt><dd className="mt-1">{plan.signalSession ?? '尚待確認'}</dd></div>
              <div><dt className="text-xs text-stone-500">唯一適用交易日</dt><dd className="mt-1 font-medium">{plan.validFromSession ?? '尚待確認'}{expired ? '（已到期）' : ''}</dd></div>
              <div className="sm:col-span-2"><dt className="text-xs text-stone-500">當時計算的條件區間{expired ? '（歷史參考）' : ''}</dt><dd className="mt-1 break-words font-semibold">{plan.entryLower != null && plan.entryUpper != null ? `${price(plan.entryLower)} – ${price(plan.entryUpper)}` : '尚無有效進場區間'}</dd></div>
              <div><dt className="text-xs text-stone-500">不追價上限</dt><dd className="mt-1 font-medium">{price(plan.noChaseAbove)}</dd></div>
              <div><dt className="text-xs text-stone-500">初始失效線</dt><dd className="mt-1 font-medium">{price(plan.invalidationPrice)}</dd></div>
            </dl>
            {plan.eligibility.state !== 'eligible' || expired ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-sm leading-6 text-amber-900 dark:bg-amber-950/30 dark:text-amber-100">{expired ? '計畫已到期，價位僅供回看。需等待新研究版本重新檢查。' : '即使技術條件成立，目前仍保留觀察；未通過正式門檻不升級為進場資格。'}</p> : null}
            {reasonLabels.length ? <ul aria-label="計畫依據與待補條件" className="mt-3 list-disc space-y-1 pl-5 text-xs leading-5 text-stone-600 dark:text-stone-400">{reasonLabels.map((label) => <li key={label}>{label}</li>)}</ul> : null}
            <p className="mt-4 text-xs leading-5 text-stone-600 dark:text-stone-400">若依本策略進場：依初始風險線管理；收盤跌破 MA20 或持有滿 20 個交易日，於下一可交易時點評估退出。計畫到期不代表已持有部位必須退出。未推定你的持倉。</p>
            <dl className="mt-4 space-y-1 border-t border-line pt-3 text-xs leading-5 text-stone-500">
              <div><dt className="inline">資料可用：</dt><dd className="inline">{time(plan.availableAt)}</dd></div>
              <div><dt className="inline">有效截止：</dt><dd className="inline">{plan.expiresAt ? time(plan.expiresAt) : '尚待確認'}</dd></div>
              <div className="break-words"><dt className="inline">研究規則：</dt><dd className="inline">{plan.rulesetVersion}；正式政策 {plan.policyVersion}</dd></div>
            </dl>
          </article>;
        })}
      </div>
      <CandidateTradePlanChart key={bundle.inputHash} bundle={bundle} />
    </>}
  </section>;
}
