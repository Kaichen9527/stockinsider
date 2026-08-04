import { clampScore, roundHalfAwayFromZero } from './canonical.ts';
import type { FactorKeyV3, FactorValueV3, HorizonScoreV3, HorizonV3 } from './contracts.ts';

const FACTORS: FactorKeyV3[] = ['priceVolume', 'chip', 'catalyst', 'marketSector', 'fundamental', 'valuation'];
const WEIGHTS: Record<HorizonV3, Record<FactorKeyV3, number>> = {
  momentum_5_20d: { priceVolume: 35, chip: 20, catalyst: 15, marketSector: 15, fundamental: 10, valuation: 5 },
  swing_20_60d: { priceVolume: 20, chip: 15, catalyst: 15, marketSector: 10, fundamental: 25, valuation: 15 },
  thesis_120_250d: { priceVolume: 5, chip: 5, catalyst: 15, marketSector: 10, fundamental: 35, valuation: 30 },
};

export function type7Quantile(values: number[], p: number): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];
  const h = (sorted.length - 1) * Math.min(1, Math.max(0, p));
  const low = Math.floor(h);
  const high = Math.ceil(h);
  return sorted[low] + (h - low) * (sorted[high] - sorted[low]);
}

export function percentile(value: number, reference: number[], inverse = false): number | null {
  const finite = reference.filter(Number.isFinite).sort((a, b) => a - b);
  if (!finite.length || !Number.isFinite(value)) return null;
  const q01 = type7Quantile(finite, 0.01) ?? value;
  const q99 = type7Quantile(finite, 0.99) ?? value;
  const winsorized = Math.min(q99, Math.max(q01, value));
  const prepared = finite.map((item) => Math.min(q99, Math.max(q01, item)));
  const below = prepared.filter((item) => item < winsorized).length;
  const equal = prepared.filter((item) => item === winsorized).length;
  const score = (100 * (below + 0.5 * equal)) / prepared.length;
  return roundHalfAwayFromZero(inverse ? 100 - score : score, 2);
}

export function weightedFactor(parts: Array<{ value: number | null; status: FactorValueV3['status']; weight: number }>): FactorValueV3 {
  const availableWeight = parts
    .filter((part) => part.status === 'fresh' && part.value !== null)
    .reduce((sum, part) => sum + part.weight, 0);
  if (availableWeight < 0.5) return { value: null, status: parts.some((part) => part.status === 'stale') ? 'stale' : 'missing' };
  return {
    value: clampScore(parts.reduce((sum, part) => sum + (part.status === 'fresh' ? (part.value ?? 0) * part.weight : 0), 0)),
    status: 'fresh',
  };
}

export function valuationFactor(p10: number, p50: number, currentPrice: number): number {
  if (![p10, p50, currentPrice].every(Number.isFinite) || currentPrice <= 0) throw new TypeError('invalid valuation factor');
  const p10Upside = 100 * (p10 / currentPrice - 1);
  const p50Upside = 100 * (p50 / currentPrice - 1);
  return clampScore(50 + 2 * p50Upside + p10Upside);
}

export function scoreHorizon(
  horizon: HorizonV3,
  factors: Record<FactorKeyV3, FactorValueV3>,
  sourceConfidence: number,
  valuationConfidence: number | null,
): HorizonScoreV3 {
  let score = 0;
  let availableWeight = 0;
  const output = {} as HorizonScoreV3['factors'];
  for (const factor of FACTORS) {
    const weight = WEIGHTS[horizon][factor];
    const input = factors[factor];
    const contribution = input.status === 'fresh' && input.value !== null ? (weight * input.value) / 100 : 0;
    if (input.status === 'fresh' && input.value !== null) availableWeight += weight;
    score += contribution;
    output[factor] = { ...input, contribution: roundHalfAwayFromZero(contribution, 2) };
  }
  const confidence = (availableWeight / 100) * Math.min(sourceConfidence, valuationConfidence ?? 0);
  return {
    horizon,
    score: roundHalfAwayFromZero(score, 2),
    confidence: roundHalfAwayFromZero(Math.min(1, Math.max(0, confidence)), 4),
    availableWeight,
    factors: output,
  };
}

export function sourcePriority(input: {
  strongestPrior: number;
  independentSourceClasses: number;
  recencyFactor: number;
  deduplicatedReach: number;
  linkConfidence: number;
}): number {
  return clampScore(
    45 * input.strongestPrior +
    20 * Math.min(input.independentSourceClasses / 3, 1) +
    20 * input.recencyFactor +
    10 * Math.min(Math.log2(1 + input.deduplicatedReach) / 4, 1) +
    5 * input.linkConfidence,
  );
}
