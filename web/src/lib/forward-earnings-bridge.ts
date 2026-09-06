export type ReportedFinancialFact = {
  factId: string;
  factKey: string;
  periodStart: string;
  periodEnd: string;
  value: number;
  unit: string | null;
  sourceRef: string;
};

type QuarterlyPoint = { periodEnd: string; value: number; factIds: string[] };

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clamp(value: number, low: number, high: number) {
  return Math.max(low, Math.min(high, value));
}

function round(value: number, digits = 4) {
  const scale = 10 ** digits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}

/**
 * MOPS income-statement facts are frequently year-to-date even when the
 * upstream duration label says "quarterly". Convert cumulative Q2/Q3/Q4 rows
 * into discrete quarters using period boundaries, never by trusting that label.
 */
export function discreteReportedQuarters(facts: ReportedFinancialFact[], factKey: string): QuarterlyPoint[] {
  const latestByPeriod = new Map<string, ReportedFinancialFact>();
  for (const fact of facts) {
    if (fact.factKey !== factKey || finite(fact.value) == null) continue;
    if (!latestByPeriod.has(fact.periodEnd)) latestByPeriod.set(fact.periodEnd, fact);
  }
  const cumulativeByYear = new Map<string, QuarterlyPoint[]>();
  for (const fact of latestByPeriod.values()) {
    const year = fact.periodEnd.slice(0, 4);
    const rows = cumulativeByYear.get(year) || [];
    rows.push({ periodEnd: fact.periodEnd, value: fact.value, factIds: [fact.factId] });
    cumulativeByYear.set(year, rows);
  }
  const result: QuarterlyPoint[] = [];
  for (const rows of cumulativeByYear.values()) {
    rows.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));
    let previousCumulative = 0;
    let previousFacts: string[] = [];
    for (const row of rows) {
      const discrete = row.value - previousCumulative;
      result.push({ periodEnd: row.periodEnd, value: discrete, factIds: [...row.factIds, ...previousFacts] });
      previousCumulative = row.value;
      previousFacts = row.factIds;
    }
  }
  return result.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));
}

export function buildForwardEarningsBridge(facts: ReportedFinancialFact[]) {
  const keys = [
    'quarterly_revenue',
    'quarterly_gross_profit',
    'quarterly_operating_income',
    'quarterly_net_income_attributable_to_common',
    'quarterly_diluted_eps',
  ] as const;
  const series = Object.fromEntries(keys.map((key) => [key, discreteReportedQuarters(facts, key)])) as Record<(typeof keys)[number], QuarterlyPoint[]>;
  const requiredPeriods = series.quarterly_revenue.slice(-8).map((row) => row.periodEnd);
  const missing = keys.filter((key) => requiredPeriods.length < 8 || requiredPeriods.some((period) => !series[key].some((row) => row.periodEnd === period)));
  if (missing.length > 0) return { status: 'insufficient' as const, missing: missing.map((key) => `${key}_8_discrete_quarters`) };

  const values = (key: (typeof keys)[number]) => requiredPeriods.map((period) => series[key].find((row) => row.periodEnd === period)!.value);
  const revenue = values('quarterly_revenue');
  const grossProfit = values('quarterly_gross_profit');
  const operatingIncome = values('quarterly_operating_income');
  const netIncome = values('quarterly_net_income_attributable_to_common');
  const eps = values('quarterly_diluted_eps');
  const sum = (rows: number[]) => rows.reduce((total, value) => total + value, 0);
  const priorRevenue = sum(revenue.slice(0, 4));
  const latestRevenue = sum(revenue.slice(4));
  const latestGross = sum(grossProfit.slice(4));
  const latestOperating = sum(operatingIncome.slice(4));
  const latestNet = sum(netIncome.slice(4));
  const latestEps = sum(eps.slice(4));
  if (!(priorRevenue > 0 && latestRevenue > 0 && latestEps !== 0)) return { status: 'insufficient' as const, missing: ['positive_reported_ttm_denominator'] };

  const historicalGrowth = latestRevenue / priorRevenue - 1;
  const baseGrowth = clamp(historicalGrowth * 0.5, -0.15, 0.2);
  const grossMargin = latestGross / latestRevenue;
  const operatingMargin = latestOperating / latestRevenue;
  const netMargin = latestNet / latestRevenue;
  const impliedShares = latestNet / latestEps;
  if (!(Number.isFinite(impliedShares) && Math.abs(impliedShares) > 0)) return { status: 'insufficient' as const, missing: ['implied_share_count'] };

  const scenario = (growthDelta: number, marginDelta: number) => {
    const forwardRevenue = latestRevenue * (1 + clamp(baseGrowth + growthDelta, -0.25, 0.3));
    const forwardNetIncome = forwardRevenue * (netMargin + marginDelta);
    return {
      revenue: round(forwardRevenue, 2),
      grossMargin: round(grossMargin + marginDelta * 0.5),
      operatingMargin: round(operatingMargin + marginDelta * 0.75),
      netMargin: round(netMargin + marginDelta),
      netIncome: round(forwardNetIncome, 2),
      dilutedEps: round(forwardNetIncome / impliedShares, 4),
    };
  };
  const allFactIds = [...new Set(keys.flatMap((key) => series[key].filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)))];
  return {
    status: 'complete' as const,
    actual: { latestRevenue, latestGross, latestOperating, latestNet, latestEps, historicalGrowth: round(historicalGrowth), grossMargin: round(grossMargin), operatingMargin: round(operatingMargin), netMargin: round(netMargin), impliedShares: round(impliedShares, 2) },
    scenarios: { bear: scenario(-0.08, -0.02), base: scenario(0, 0), bull: scenario(0.08, 0.02) },
    assumptions: [
      { key: 'revenue_growth', kind: 'model_assumption', value: round(baseGrowth), basis: '50% pass-through of latest four-quarter reported growth, capped -15%/+20%' },
      { key: 'net_margin', kind: 'model_assumption', value: round(netMargin), basis: 'latest four discrete reported quarters' },
      { key: 'scenario_margin_delta', kind: 'model_assumption', value: 0.02, basis: 'bear/base/bull sensitivity, not management guidance' },
    ],
    factIds: allFactIds,
    verifiedTurnaroundPath: latestNet > 0 && sum(netIncome.slice(0, 4)) <= 0 && netIncome.slice(-2).every((value) => value > 0),
  };
}
