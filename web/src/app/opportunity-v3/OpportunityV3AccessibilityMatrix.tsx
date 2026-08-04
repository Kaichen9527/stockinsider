import type { OpportunityCardV3 } from '@/lib/opportunity-v3/contracts';

const stateLabels: Record<string, string> = {
  source_signal: '來源訊號', fundamental_review: '基本面研究中', decision_ready: '決策資料完整', valuation_review: '估值待覆核',
  wait_trigger: '等待技術觸發', starter_now: '可評估試單', event_starter: '事件型試單', avoid: '暫時避開',
  below_support: '剛跌破支撐', reclaim_required: '需先收復支撐', at_support: '接近支撐', breakout_pending: '等待突破',
  breakout_confirmed: '突破已確認', extended: '乖離過大', invalidated: '研究假設失效', unavailable: '技術資料不足',
};

export function OpportunityV3AccessibilityMatrix({ card }: { card: OpportunityCardV3 }) {
  const technical = card.technicalDecision as { state?: string | null; maDeviation?: { bias20Pct?: number | null };
    trigger?: { kind: string; threshold: number } | null; invalidation?: { stop: number } | null };
  const technicalLabel = technical.state ? stateLabels[technical.state] ?? technical.state : stateLabels.unavailable;
  const actionLabel = stateLabels[card.actionDecision.newPositionAction] ?? card.actionDecision.newPositionAction;
  return (
    <section aria-label="研究決策摘要" className="rounded-2xl border border-line bg-surface p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-h-11 rounded-full bg-slate-950/5 px-3 py-2 dark:bg-white/10" aria-label={`研究成熟度：${card.researchMaturity}`}>{stateLabels[card.researchMaturity] ?? card.researchMaturity}</span>
        <span className="min-h-11 rounded-full bg-amber-500/15 px-3 py-2" aria-label={`新倉動作：${actionLabel}`}>{actionLabel}</span>
      </div>
      <dl className="mt-4 grid gap-3 sm:grid-cols-2">
        <div><dt className="text-slate-500">技術狀態</dt><dd>{technicalLabel}</dd></div>
        <div><dt className="text-slate-500">估值</dt><dd>{card.valuation.status === 'normal' ? `基準價 ${card.valuation.p50 ?? '未提供'}` : '估值待覆核'}</dd></div>
        <div><dt className="text-slate-500">乖離率（MA20）</dt><dd>{typeof technical.maDeviation?.bias20Pct === 'number' ? `${technical.maDeviation.bias20Pct.toFixed(2)}%` : '資料不足'}</dd></div>
        <div><dt className="text-slate-500">進場觸發</dt><dd>{technical.trigger ? `${technical.trigger.kind} ${technical.trigger.threshold}` : '等待確認'}</dd></div>
        <div><dt className="text-slate-500">失效點</dt><dd>{technical.invalidation?.stop ?? '不適用'}</dd></div>
        <div><dt className="text-slate-500">最近檢查</dt><dd><time dateTime={card.lastEvaluatedAt}>{card.lastEvaluatedAt}</time></dd></div>
      </dl>
      {card.materialChangedBecause.length ? <p className="mt-3 break-words text-slate-600 dark:text-slate-300">變更原因：{card.materialChangedBecause.join('、')}</p> : null}
      {card.noChangeMessage ? <p className="mt-3 break-words text-slate-600 dark:text-slate-300">{card.noChangeMessage}</p> : null}
    </section>
  );
}
