import { notFound } from 'next/navigation';
import { StockCard } from '@/app/components/RadarTabs';
import type { RecommendationCard, ResearchDecisionV311 } from '@/lib/types';

export const dynamic = 'force-dynamic';

const baseDecision: ResearchDecisionV311 = {
  researchMaturity: 'decision_ready',
  newPositionAction: 'wait_trigger',
  technical: {
    availability: 'available',
    state: 'at_support',
    maDeviation: -0.042,
    bias: { availability: 'available', bias20Pct: -4.2, bias60Pct: -7.1, ownHistory: { label: 'low', p10: -6.4, p50: 0.3, p90: 8.2 } },
    trigger: { kind: 'pullback', threshold: 98, volumeRatioMinimum: 1.2 },
    entryZone: { kind: 'trigger_zone', lower: 97, upper: 99 },
    invalidation: { stop: 92, thesisLevel: 93 },
  },
  valuation: {
    status: 'normal',
    exchangeReportedPe: { availability: 'available', current: 12.8, ownReference: { p50: 16.2, percentile: 23 }, sectorReference: { capWeighted: 18.4, count: 14 } },
    modelComparablePe: { availability: 'available', value: 13.4, method: 'normalized_pe', asOf: '2026-08-01T00:00:00Z', sourceRefs: ['fixture-official'] },
  },
  factorAxes: { availability: 'available', axes: { discovery: 77, quality: 72, valuation: 81, timingRisk: 55 } },
  lastEvaluatedAt: '2026-08-01T00:00:00Z',
  analysisGeneratedAt: '2026-07-31T00:00:00Z',
  materialChangeHash: 'a'.repeat(64),
  materialChangedBecause: [],
};

function card(id: string, symbol: string, decision: ResearchDecisionV311): RecommendationCard {
  return {
    recommendationId: id,
    symbol,
    name: `測試股票 ${symbol}`,
    chineseName: `測試股票 ${symbol}`,
    market: 'TW',
    score: 70,
    confidence: 65,
    action: 'watch',
    rationale: '只供受控 UI 正確性測試，不是投資建議。',
    researchDecision: decision,
  };
}

const cards = [
  card('fixture-discovery', '9001', { ...baseDecision, researchMaturity: 'source_signal', newPositionAction: 'valuation_review', valuation: { status: 'valuation_review', exchangeReportedPe: { availability: 'unavailable', reason: 'official_pe_unavailable' }, modelComparablePe: { value: null, reason: 'valuation_review' } } }),
  card('fixture-valuation', '9002', { ...baseDecision, newPositionAction: 'valuation_review', valuation: { status: 'valuation_review', exchangeReportedPe: { availability: 'unavailable', reason: 'authority_conflict' }, modelComparablePe: { value: null, reason: 'method_divergence' } } }),
  card('fixture-reclaim', '9003', { ...baseDecision, technical: { ...baseDecision.technical, state: 'reclaim_required', trigger: { kind: 'reclaim', threshold: 102, volumeRatioMinimum: 1.3 }, entryZone: { kind: 'trigger_zone', lower: 102, upper: 104 }, invalidation: { stop: 96, thesisLevel: 97 } } }),
  card('fixture-unavailable', '9004', { ...baseDecision, newPositionAction: 'wait_trigger', technical: { availability: 'unavailable', state: null, bias: { availability: 'unavailable', reason: 'insufficient_adjusted_history' } }, factorAxes: { availability: 'unavailable', reason: 'factor_inputs_unavailable' } }),
  card('fixture-no-change', '9005', baseDecision),
];

export default function V3CorrectnessFixturePage() {
  if (process.env.OPPORTUNITY_V3_UI_FIXTURE !== 'enabled') notFound();
  return (
    <main className="min-h-screen min-w-0 bg-background px-4 py-6 text-foreground" aria-label="V3.11 UI correctness fixture">
      <h1 className="text-xl font-semibold">V3.11 研究決策無障礙測試</h1>
      <p className="mt-2 text-sm">受環境變數封閉的非正式資料測試面。</p>
      <section aria-label="研究決策狀態矩陣" className="mt-5 grid min-w-0 gap-4">
        {cards.map((item, index) => <StockCard key={item.recommendationId} rec={item} isPrimary={index === 0} />)}
      </section>
    </main>
  );
}
