import type { CandidateStageCard } from '@/lib/types';
import { TW_ENTRY_PLAN_SCHEMA } from '@/lib/tw-entry-plan-contract';
import { tradePlanReasonLabel, tradePlanStateLabel, tradeSignalLabel, tradeStrategyLabel } from '@/lib/tw-entry-plan-display';

export default function CandidateTradePlanSummary({ card, asOf = new Date().toISOString() }: {
  card: Pick<CandidateStageCard, 'tradePlanSummary' | 'detailRevisionId' | 'stale' | 'lifecycleStage' | 'unmetConditions'>;
  asOf?: string;
}) {
  const summary = card.tradePlanSummary;
  if (!summary || summary.schemaVersion !== TW_ENTRY_PLAN_SCHEMA || summary.candidateRevisionId !== card.detailRevisionId) return null;
  const expires = summary.expiresAt ? Date.parse(summary.expiresAt) : Number.NaN;
  const expired = Number.isFinite(expires) && Date.parse(asOf) >= expires;
  const blocked = card.stale || card.lifecycleStage !== 'actionable' || card.unmetConditions.length > 0;
  return <section data-testid="candidate-trade-summary" className="mt-4 min-w-0 rounded-xl border border-line p-3 text-xs leading-5">
    <p className="font-semibold">進出場研究 · 績效尚未驗證</p>
    <p className="mt-1 text-stone-500">訊號 {summary.signalSession ?? '待補'} · 僅適用 {summary.validFromSession ?? '待補'}{expired ? '（已到期）' : ''}</p>
    <p className="mt-1 font-medium text-amber-800 dark:text-amber-200">{card.stale ? '舊版快照：目前正式資格停用' : blocked ? '目前正式資格未通過；保留技術觀察' : '目前正式研究分類：條件已通過'}{expired ? '；計畫僅供歷史回看' : ''}</p>
    <ul className="mt-2 space-y-2">{summary.plans.map((plan) => <li key={plan.strategyId}>
      <span className="font-medium">{tradeStrategyLabel[plan.strategyId]}：</span>{tradeSignalLabel[plan.rawSignalState]}
      <span className="block text-stone-500">當時計畫：{tradePlanStateLabel[expired ? 'expired' : plan.planState]}</span>
      {plan.eligibility.reasonCodes.length > 0 ? <span className="block text-stone-500">{[...new Set(plan.eligibility.reasonCodes.map(tradePlanReasonLabel))].slice(0, 2).join('；')}</span> : null}
    </li>)}</ul>
  </section>;
}
