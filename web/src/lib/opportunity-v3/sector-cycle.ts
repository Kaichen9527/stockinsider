import { roundHalfAwayFromZero } from './canonical.ts';

export type SectorCycleInputV3 = {
  sectorReferenceCount?: number;
  revenueLevel: number | null;
  epsLevel: number | null;
  revenueChange: number | null;
  marginChange: number | null;
  excess20d: number | null;
  excess60d: number | null;
  breadth20d: number | null;
};

export function sectorCycle(input: SectorCycleInputV3) {
  if (
    input.sectorReferenceCount !== undefined &&
    (!Number.isInteger(input.sectorReferenceCount) || input.sectorReferenceCount < 8)
  ) {
    return {
      state: 'unknown' as const,
      levelScore: null,
      changeScore: null,
      marketScore: null,
      matchedRule: 'unavailable' as const,
    };
  }
  const level = complete([input.revenueLevel, input.epsLevel]);
  const change = complete([input.revenueChange, input.marginChange]);
  const market = complete([input.excess20d, input.excess60d, input.breadth20d]);
  if (level === null || change === null || market === null) {
    return { state: 'unknown' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'unavailable' as const };
  }
  if (level < 45 && change < 50) return { state: 'contraction' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'contraction' as const };
  if (level < 55 && change >= 60 && market >= 55) return { state: 'early_recovery' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'early_recovery' as const };
  if (level >= 55 && change >= 50 && market >= 50) return { state: 'expansion' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'expansion' as const };
  if (level >= 55 && (change < 50 || market < 50)) return { state: 'late_expansion' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'late_expansion' as const };
  return { state: 'unknown' as const, levelScore: level, changeScore: change, marketScore: market, matchedRule: 'no_rule_match' as const };
}

function complete(values: Array<number | null>): number | null {
  if (values.some((value) => value === null || !Number.isFinite(value))) return null;
  return roundHalfAwayFromZero(values.reduce<number>((sum, value) => sum + (value ?? 0), 0) / values.length, 2);
}
