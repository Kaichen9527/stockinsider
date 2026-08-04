import type { InternalOpportunityCardV3 } from './contracts.ts';

export function allocateResearchBasket(
  cards: InternalOpportunityCardV3[],
  grossCapPct: number,
  sectorOf: (symbol: string) => string = () => 'unknown',
): InternalOpportunityCardV3[] {
  let gross = 0;
  const sectorExposure = new Map<string, number>();
  let accepted = 0;
  return [...cards]
    .sort((a, b) => {
      const classOrder = (action: string) => action === 'starter_now' ? 0 : action === 'event_starter' ? 1 : 2;
      return classOrder(a.actionDecision.newPositionAction) - classOrder(b.actionDecision.newPositionAction) ||
        b.score - a.score ||
        b.actionDecision.confidence - a.actionDecision.confidence ||
        a.symbol.localeCompare(b.symbol);
    })
    .map((card) => {
      const action = card.actionDecision.newPositionAction;
      if (action !== 'starter_now' && action !== 'event_starter') return card;
      const requested = card.actionDecision.initialPositionPct;
      const sector = sectorOf(card.symbol);
      const capacity = Math.max(0, Math.min(10, 25 - (sectorExposure.get(sector) ?? 0), grossCapPct - gross));
      const minimum = action === 'starter_now' ? 3 : 2;
      if (accepted >= 6 || capacity < minimum) {
        return {
          ...card,
          candidateState: 'avoid' as const,
          actionDecision: {
            ...card.actionDecision,
            newPositionAction: 'avoid' as const,
            initialPositionPct: 0,
            maximumPositionPct: 0,
            blockReasons: ['capacity_exhausted'],
          },
        };
      }
      const allocated = Math.min(requested, capacity);
      gross += allocated;
      sectorExposure.set(sector, (sectorExposure.get(sector) ?? 0) + allocated);
      accepted += 1;
      return { ...card, actionDecision: { ...card.actionDecision, initialPositionPct: allocated } };
    });
}
