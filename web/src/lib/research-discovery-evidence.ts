import { researchCanonicalHash } from './research-agent-qualification.ts';

export const DISCOVERY_EVIDENCE_POLICY = 'early-discovery-shadow-v1' as const;
export const DISCOVERY_FACTORS = ['independent_discussion', 'rumor', 'broker', 'insider',
  'technical', 'forward_earnings', 'overseas', 'upstream', 'official_fundamentals',
  'relative_valuation', 'price_pattern'] as const;
export type DiscoveryFactor = {
  factor: typeof DISCOVERY_FACTORS[number];
  status: 'available' | 'missing' | 'conflicted' | 'stale';
  explanation: string; documentIds: string[]; rootIds: string[];
  availableAt: string | null;
};
export type DiscoveryPriceBar = { session: string; close: number; availableAt: string };

export function discoverySession(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`))
    && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}
export function discoveryInstant(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d+)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(value)
    && discoverySession(value.slice(0, 10)) && Number.isFinite(Date.parse(value));
}
export function discoveryTaipeiDate(value: string) {
  if (!discoveryInstant(value)) throw new Error('discovery_cutoff_invalid');
  return new Date(Date.parse(value) + 8 * 3600_000).toISOString().slice(0, 10);
}

/** Returns require aligned, complete windows; unknown prices are never "early". */
export function discoveryRelativeReturns(stock: DiscoveryPriceBar[], benchmark: DiscoveryPriceBar[], asOf: string,
  options: { requireComplete61?: boolean } = {}) {
  const cutoff = Date.parse(asOf);
  if (!discoveryInstant(asOf)) throw new Error('discovery_cutoff_invalid');
  const select = (bars: DiscoveryPriceBar[]) => {
    if (bars.length > 1320 || bars.some((bar, i) => !discoverySession(bar.session)
      || !Number.isFinite(bar.close) || bar.close <= 0 || !discoveryInstant(bar.availableAt)
      || Date.parse(bar.availableAt) > cutoff || bar.session > discoveryTaipeiDate(asOf)
      || discoveryTaipeiDate(bar.availableAt) < bar.session
      || (i > 0 && bar.session <= bars[i - 1].session))) throw new Error('discovery_price_invalid');
    return bars.slice(-61);
  };
  const prices = select(stock); const market = select(benchmark);
  // The new enrichment mandates one complete aligned window for all horizons.
  // Retain the existing standalone helper's shorter-window caller contract.
  if (options.requireComplete61 && (prices.length !== 61 || market.length !== 61
    || prices.some((bar, index) => bar.session !== market[index].session)))
    return { relative5d: null, relative20d: null, relative60d: null };
  const result = (days: number) => {
    const own = prices.slice(-(days + 1)); const other = market.slice(-(days + 1));
    if (own.length !== days + 1 || other.length !== days + 1
      || own.some((bar, index) => bar.session !== other[index].session)) return null;
    return (own.at(-1)!.close / own[0].close) / (other.at(-1)!.close / other[0].close) - 1;
  };
  return { relative5d: result(5), relative20d: result(20), relative60d: result(60) };
}

export function discoveryPricePhase(input: {
  close: number | null; ma20: number | null; atr14: number | null; rsi14: number | null;
  breakoutConfirmed: boolean | null; pullbackConfirmed: boolean | null; officialDatasetVerified: boolean;
}) {
  if (input.officialDatasetVerified !== true || [input.close, input.ma20, input.atr14, input.rsi14]
    .some((value) => value === null || !Number.isFinite(value))
    || input.close! <= 0 || input.ma20! <= 0 || input.atr14! <= 0
    || input.rsi14! < 0 || input.rsi14! > 100) return 'unknown' as const;
  // Reuse the existing entry-plan overheating predicates, not a return forecast.
  if (input.rsi14! >= 75 || input.close! > input.ma20! + 2 * input.atr14!) return 'extended' as const;
  if (typeof input.breakoutConfirmed !== 'boolean' || typeof input.pullbackConfirmed !== 'boolean'
    || input.breakoutConfirmed && input.pullbackConfirmed) return 'unknown' as const;
  if (input.breakoutConfirmed) return 'initial_breakout' as const;
  if (input.pullbackConfirmed) return 'trend_pullback' as const;
  return 'research_before_trigger' as const;
}

/** Eleven factors explain baseline scores; they are not eleven extra score bonuses. */
export function validateDiscoveryFactors(factors: DiscoveryFactor[], asOf: string) {
  if (factors.length !== DISCOVERY_FACTORS.length || new Set(factors.map((row) => row.factor)).size !== factors.length
    || factors.some((row) => !DISCOVERY_FACTORS.includes(row.factor)
      || !['available', 'missing', 'conflicted', 'stale'].includes(row.status)
      || row.explanation.trim().length < 4 || row.explanation.length > 800
      || row.documentIds.length > 100 || row.rootIds.length > 100
      || row.status === 'available' && (!row.documentIds.length || !row.rootIds.length || !row.availableAt)
      || row.availableAt !== null && (!Number.isFinite(Date.parse(row.availableAt))
        || Date.parse(row.availableAt) > Date.parse(asOf)))) throw new Error('discovery_factor_evidence_invalid');
  return researchCanonicalHash({ policy: DISCOVERY_EVIDENCE_POLICY, factors, asOf });
}

/** A factor cannot borrow another root or predate its latest source revision. */
export function validateDiscoverySourceBindings(factors: DiscoveryFactor[], sources: Array<{
  documentId: string; rootId: string; availableAt: string; usable: boolean;
}>) {
  const byId = new Map(sources.map((source) => [source.documentId, source]));
  for (const factor of factors) {
    const selected = factor.documentIds.map((id) => byId.get(id));
    if (selected.some((source) => !source || !factor.rootIds.includes(source.rootId))
      || factor.rootIds.some((id) => !selected.some((source) => source?.rootId === id))
      || selected.some((source) => !Number.isFinite(Date.parse(source!.availableAt))
        || !factor.availableAt || Date.parse(factor.availableAt) < Date.parse(source!.availableAt)
        || factor.status === 'available' && !source!.usable)) {
      throw new Error('research_priority_factor_source_binding_invalid');
    }
  }
}
