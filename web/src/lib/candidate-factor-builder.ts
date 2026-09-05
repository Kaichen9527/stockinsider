type FactorEvidence = { score: number; status: 'available' | 'partial' | 'missing'; evidenceCount: number; asOf: string | null; reasons: string[] };

function clamp(value: number) { return Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0)); }

export function officialResearchEvidenceFactor(input: {
  factKeys: string[];
  hasPriceHistory: boolean;
  hasInstitutionalFlow: boolean;
  hasMarketEvidence: boolean;
  asOf: string;
}): FactorEvidence {
  const required = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common', 'quarterly_diluted_eps'];
  const present = new Set(input.factKeys);
  const checks = [...required.map((key) => present.has(key)), input.hasPriceHistory, input.hasInstitutionalFlow, input.hasMarketEvidence];
  const evidenceCount = checks.filter(Boolean).length;
  return {
    score: clamp(evidenceCount / checks.length * 100),
    status: evidenceCount === checks.length ? 'available' : evidenceCount > 0 ? 'partial' : 'missing',
    evidenceCount,
    asOf: input.asOf,
    reasons: required.filter((key) => !present.has(key)).map((key) => `missing:${key}`),
  };
}

export function brokerResearchFactor(rows: Array<{ sourceCount: number; freshness: string; asOf: string | null }>): FactorEvidence {
  const fresh = rows.filter((row) => row.freshness === 'fresh' && row.sourceCount > 0);
  const sources = fresh.reduce((sum, row) => sum + row.sourceCount, 0);
  return {
    score: sources === 0 ? 0 : clamp(35 + Math.min(65, sources / 3 * 65)),
    status: sources === 0 ? 'missing' : sources >= 3 ? 'available' : 'partial', evidenceCount: sources,
    asOf: fresh.map((row) => row.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    reasons: sources === 0 ? ['missing:licensed_broker_evidence'] : [],
  };
}

export function relationshipFactor(input: Array<{ market: string; score: number; weight: number; asOf: string | null }>, kind: 'domestic_rotation' | 'overseas_peer'): FactorEvidence {
  const eligible = input.filter((row) => kind === 'domestic_rotation' ? row.market === 'TW' : row.market !== 'TW');
  const weight = eligible.reduce((sum, row) => sum + Math.max(0, row.weight), 0);
  const weighted = weight > 0 ? eligible.reduce((sum, row) => sum + row.score * Math.max(0, row.weight), 0) / weight : null;
  return {
    score: weighted == null ? 0 : clamp(50 + weighted * 50),
    status: eligible.length === 0 ? 'missing' : eligible.length >= 2 ? 'available' : 'partial', evidenceCount: eligible.length,
    asOf: eligible.map((row) => row.asOf).filter((value): value is string => Boolean(value)).sort().at(-1) || null,
    reasons: eligible.length === 0 ? [`missing:${kind}`] : [],
  };
}
