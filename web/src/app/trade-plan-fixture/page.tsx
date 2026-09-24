import { notFound } from 'next/navigation';
import type { CandidateDetailPayload } from '@/lib/candidate-detail';
import type { CandidateStageCard } from '@/lib/types';
import CandidateHistoryChart from '@/lib/candidate-history-chart';
import CandidateTradePlanView from '../stock/[symbol]/CandidateTradePlanView';
import CandidateTradePlanSummary from '../components/CandidateTradePlanSummary';
import { tradePlanFixture } from './fixture-data';

export const dynamic = 'force-dynamic';

export default async function TradePlanFixture({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === 'production' || process.env.OPPORTUNITY_V3_UI_FIXTURE !== 'enabled') notFound();
  const { mode } = await searchParams;
  const bundle = tradePlanFixture();
  const asOf = mode === 'expired' ? '2026-09-22T07:00:00Z' : '2026-09-20T08:00:00Z';
  if (mode === 'missing') bundle.ohlcv = [];
  const summary: NonNullable<CandidateStageCard['tradePlanSummary']> = {
    schemaVersion: bundle.schemaVersion, candidateRevisionId: bundle.candidateRevisionId, inputHash: bundle.inputHash,
    signalSession: bundle.plans[0].signalSession, validFromSession: bundle.plans[0].validFromSession, expiresAt: bundle.plans[0].expiresAt, validationStatus: 'research_only',
    plans: bundle.plans.map(({ strategyId, rawSignalState, planState, eligibility, reasonCodes }) => ({ strategyId, rawSignalState, planState, eligibility, reasonCodes })),
  };
  const history = { valuation: { historicalPrices: [{ date: '2026-09-01', frequency: 'daily', close: 99 }, { date: '2026-09-02', frequency: 'daily', close: 100 }], historicalMultiples: [] } } as unknown as CandidateDetailPayload;
  return <main className="mx-auto min-h-screen max-w-6xl px-4 py-6 text-stone-950 dark:text-stone-100">
    <h1 className="text-xl font-semibold">合成資料測試頁</h1>
    <p className="mt-2 text-sm">僅測試畫面，全部價格、交易日、來源與資格皆為 fixture；不是官方行情、策略驗證或投資建議。</p>
    <CandidateTradePlanSummary asOf={asOf} card={{ tradePlanSummary: summary, detailRevisionId: bundle.candidateRevisionId, stale: mode === 'stale', lifecycleStage: 'waiting', unmetConditions: ['market_risk_off_blocks_new_actionable'] }} />
    <CandidateTradePlanView bundle={mode === 'legacy' ? null : bundle} revisionId={bundle.candidateRevisionId} asOf={asOf} publicationState={mode === 'stale' ? 'stale_readonly' : mode === 'preliminary' ? 'preliminary' : 'confirmed'} />
    {mode === 'legacy' ? <CandidateHistoryChart detail={history} /> : null}
  </main>;
}
