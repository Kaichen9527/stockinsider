import { clampScore, roundHalfAwayFromZero } from './canonical.ts';
import type { MarketContextV3, MarketGroupEvidenceV3, MarketGroupV3 } from './contracts.ts';

const GROUPS: MarketGroupV3[] = ['trend', 'breadth', 'flow', 'derivatives', 'global'];
const WEIGHTS: Record<MarketGroupV3, number> = { trend: 30, breadth: 20, flow: 20, derivatives: 15, global: 15 };

export function marketContext(groups: Record<MarketGroupV3, MarketGroupEvidenceV3>, asOf: string): MarketContextV3 {
  const missingGroups = GROUPS.filter((group) => groups[group].status !== 'fresh' || groups[group].score === null);
  const coreComplete =
    groups.trend.status === 'fresh' &&
    groups.breadth.status === 'fresh' &&
    (groups.flow.status === 'fresh' || groups.derivatives.status === 'fresh');
  if (!coreComplete) {
    return {
      contractVersion: 'market-context-v3.6',
      regime: 'unknown',
      completeness: 'insufficient',
      composite: null,
      newPositionBudgetPct: 15,
      groups,
      missingGroups,
      overrideReason: null,
      asOf,
    };
  }
  const available = GROUPS.filter((group) => groups[group].status === 'fresh' && groups[group].score !== null);
  const denominator = available.reduce((sum, group) => sum + WEIGHTS[group], 0);
  const rawComposite =
    available.reduce((sum, group) => sum + (groups[group].score ?? 0) * WEIGHTS[group], 0) / denominator;
  const composite = roundHalfAwayFromZero(rawComposite, 2);
  const trend = groups.trend.score ?? 0;
  const breadth = groups.breadth.score ?? 0;
  const overrideReason = trend < 25 ? 'trend_below_25' : breadth < 25 ? 'breadth_below_25' : null;
  const regime = overrideReason ? 'risk_off'
    : rawComposite < 35 ? 'risk_off'
      : rawComposite < 65 ? 'selective'
        : 'risk_on';
  return {
    contractVersion: 'market-context-v3.6',
    regime,
    completeness: 'sufficient',
    composite: clampScore(composite),
    newPositionBudgetPct: regime === 'risk_off' ? 0 : regime === 'selective' ? 35 : 60,
    groups,
    missingGroups,
    overrideReason,
    asOf,
  };
}
