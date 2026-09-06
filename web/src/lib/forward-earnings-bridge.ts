export type ReportedFinancialFact = {
  factId: string;
  factKey: string;
  periodStart: string | null;
  periodEnd: string;
  value: number;
  unit: string | null;
  sourceRef: string;
  filingRestatementId?: string | null;
  filingPublishedAt?: string | null;
};

type QuarterlyPoint = { periodEnd: string; value: number; factIds: string[] };
type SeriesDiagnosis = { points: QuarterlyPoint[]; issues: string[] };

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function round(value: number, digits = 4) { const scale = 10 ** digits; return Math.round((value + Number.EPSILON) * scale) / scale; }
function quarterStart(periodEnd: string) {
  const year = periodEnd.slice(0, 4);
  const month = Number(periodEnd.slice(5, 7));
  return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}
function quarterNumber(periodEnd: string) { return Math.floor((Number(periodEnd.slice(5, 7)) - 1) / 3) + 1; }
function closeEnough(left: number, right: number) { return Math.abs(left - right) <= Math.max(0.0001, Math.abs(left) * 0.01, Math.abs(right) * 0.01); }

/** Decumulates only annual-to-date flows. Quarter-context facts are already
 * discrete; periodStart decides this, never an upstream duration label. */
function diagnoseDiscreteQuarters(facts: ReportedFinancialFact[], factKey: string): SeriesDiagnosis {
  const byYear = new Map<string, Map<string, ReportedFinancialFact[]>>();
  for (const fact of facts) {
    if (fact.factKey !== factKey || finite(fact.value) == null || !/^\d{4}-\d{2}-\d{2}$/u.test(fact.periodEnd)) continue;
    const year = fact.periodEnd.slice(0, 4);
    const periods = byYear.get(year) || new Map<string, ReportedFinancialFact[]>();
    periods.set(fact.periodEnd, [...(periods.get(fact.periodEnd) || []), fact]);
    byYear.set(year, periods);
  }
  const points: QuarterlyPoint[] = [];
  const issues: string[] = [];
  for (const [year, periods] of byYear) {
    const discrete = new Map<number, QuarterlyPoint>();
    for (const end of [...periods.keys()].sort()) {
      const quarter = quarterNumber(end);
      const rows = periods.get(end)!;
      const expectedQuarterStart = quarterStart(end);
      const ytdStart = `${year}-01-01`;
      const direct = rows.filter((row) => row.periodStart === expectedQuarterStart);
      const ytd = rows.filter((row) => row.periodStart === ytdStart);
      if (direct.length === 0 && ytd.length === 0) { issues.push(`${factKey}:${end}:unsupported_period_context`); continue; }
      const directValues = [...new Set(direct.map((row) => row.value))];
      const ytdValues = [...new Set(ytd.map((row) => row.value))];
      if (directValues.length > 1 || ytdValues.length > 1) { issues.push(`${factKey}:${end}:conflicting_restatement`); continue; }
      const sourceIds = rows.map((row) => row.factId);
      if (quarter === 1) { discrete.set(quarter, { periodEnd: end, value: directValues[0] ?? ytdValues[0], factIds: sourceIds }); continue; }
      const prior = Array.from({ length: quarter - 1 }, (_, index) => discrete.get(index + 1));
      const priorValue = prior.every(Boolean) ? prior.reduce((total, row) => total + row!.value, 0) : null;
      const directValue = directValues[0];
      const ytdValue = ytdValues[0];
      if (directValue != null && ytdValue != null && priorValue != null && !closeEnough(ytdValue - priorValue, directValue)) {
        issues.push(`${factKey}:${end}:ytd_discrete_continuity_failed`); continue;
      }
      if (directValue != null) discrete.set(quarter, { periodEnd: end, value: directValue, factIds: sourceIds });
      else if (ytdValue != null && priorValue != null) discrete.set(quarter, { periodEnd: end, value: ytdValue - priorValue, factIds: [...sourceIds, ...prior.flatMap((row) => row!.factIds)] });
      else issues.push(`${factKey}:${end}:missing_prior_period_for_ytd`);
    }
    points.push(...discrete.values());
  }
  return { points: points.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)), issues };
}

export function discreteReportedQuarters(facts: ReportedFinancialFact[], factKey: string): QuarterlyPoint[] {
  if (factKey === 'quarterly_basic_eps' || factKey === 'quarterly_diluted_eps' || factKey.includes('weighted_average_shares')) {
    return reportedQuarterValues(facts, factKey).points;
  }
  return diagnoseDiscreteQuarters(facts, factKey).points;
}

/** Weighted shares and EPS are rates/averages, not additive flows. */
function reportedQuarterValues(facts: ReportedFinancialFact[], factKey: string): SeriesDiagnosis {
  const byEnd = new Map<string, ReportedFinancialFact[]>();
  for (const fact of facts) {
    if (fact.factKey !== factKey || finite(fact.value) == null) continue;
    byEnd.set(fact.periodEnd, [...(byEnd.get(fact.periodEnd) || []), fact]);
  }
  const points: QuarterlyPoint[] = [];
  const issues: string[] = [];
  for (const [end, rows] of byEnd) {
    const start = quarterStart(end);
    const selected = rows.filter((row) => row.periodStart === start || (quarterNumber(end) === 1 && row.periodStart === `${end.slice(0, 4)}-01-01`));
    const values = [...new Set(selected.map((row) => row.value))];
    if (selected.length === 0) { issues.push(`${factKey}:${end}:non_discrete_period_context`); continue; }
    if (values.length !== 1) { issues.push(`${factKey}:${end}:conflicting_restatement`); continue; }
    points.push({ periodEnd: end, value: values[0], factIds: selected.map((row) => row.factId) });
  }
  return { points: points.sort((left, right) => left.periodEnd.localeCompare(right.periodEnd)), issues };
}

export function buildForwardEarningsBridge(facts: ReportedFinancialFact[]) {
  const flowKeys = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common'] as const;
  const series = Object.fromEntries(flowKeys.map((key) => [key, diagnoseDiscreteQuarters(facts, key)])) as Record<(typeof flowKeys)[number], SeriesDiagnosis>;
  const shares = reportedQuarterValues(facts, 'diluted_weighted_average_shares');
  const disclosedEps = reportedQuarterValues(facts, 'quarterly_diluted_eps');
  const requiredPeriods = series.quarterly_revenue.points.slice(-8).map((row) => row.periodEnd);
  const missing = [
    ...flowKeys.filter((key) => requiredPeriods.length < 8 || requiredPeriods.some((period) => !series[key].points.some((row) => row.periodEnd === period))).map((key) => `${key}_8_discrete_quarters`),
    ...(requiredPeriods.length < 8 || requiredPeriods.some((period) => !shares.points.some((row) => row.periodEnd === period)) ? ['diluted_weighted_average_shares_8_actual_quarters'] : []),
    ...(requiredPeriods.length < 8 || requiredPeriods.some((period) => !disclosedEps.points.some((row) => row.periodEnd === period)) ? ['quarterly_diluted_eps_8_actual_quarters'] : []),
  ];
  const issues = [...flowKeys.flatMap((key) => series[key].issues), ...shares.issues, ...disclosedEps.issues];
  if (missing.length > 0 || issues.length > 0) return { status: 'insufficient' as const, missing: [...missing, ...issues].sort() };

  const values = (key: (typeof flowKeys)[number]) => requiredPeriods.map((period) => series[key].points.find((row) => row.periodEnd === period)!.value);
  const revenue = values('quarterly_revenue');
  const grossProfit = values('quarterly_gross_profit');
  const operatingIncome = values('quarterly_operating_income');
  const netIncome = values('quarterly_net_income_attributable_to_common');
  const shareValues = requiredPeriods.map((period) => shares.points.find((row) => row.periodEnd === period)!.value);
  const derivedEps = netIncome.map((income, index) => income / shareValues[index]);
  if (!derivedEps.every((eps, index) => closeEnough(eps, disclosedEps.points.find((row) => row.periodEnd === requiredPeriods[index])!.value))) {
    return { status: 'insufficient' as const, missing: ['diluted_eps_share_net_income_inconsistent'] };
  }
  const sum = (rows: number[]) => rows.reduce((total, value) => total + value, 0);
  const priorRevenue = sum(revenue.slice(0, 4));
  const latestRevenue = sum(revenue.slice(4));
  const latestGross = sum(grossProfit.slice(4));
  const latestOperating = sum(operatingIncome.slice(4));
  const latestNet = sum(netIncome.slice(4));
  const latestEps = sum(derivedEps.slice(4));
  const latestDilutedShares = shareValues.slice(4).reduce((total, value) => total + value, 0) / 4;
  if (!(priorRevenue > 0 && latestRevenue > 0 && latestEps !== 0 && latestDilutedShares > 0)) return { status: 'insufficient' as const, missing: ['positive_reported_ttm_denominator'] };
  const historicalGrowth = latestRevenue / priorRevenue - 1;
  const baseGrowth = clamp(historicalGrowth * 0.5, -0.15, 0.2);
  const grossMargin = latestGross / latestRevenue;
  const operatingMargin = latestOperating / latestRevenue;
  const netMargin = latestNet / latestRevenue;
  const scenario = (growthDelta: number, marginDelta: number) => {
    const forwardRevenue = latestRevenue * (1 + clamp(baseGrowth + growthDelta, -0.25, 0.3));
    const forwardNetIncome = forwardRevenue * (netMargin + marginDelta);
    return { revenue: round(forwardRevenue, 2), grossMargin: round(grossMargin + marginDelta * 0.5), operatingMargin: round(operatingMargin + marginDelta * 0.75), netMargin: round(netMargin + marginDelta), netIncome: round(forwardNetIncome, 2), dilutedEps: round(forwardNetIncome / latestDilutedShares, 4) };
  };
  const allFactIds = [...new Set([
    ...flowKeys.flatMap((key) => series[key].points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)),
    ...shares.points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds),
    ...disclosedEps.points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds),
  ])];
  return {
    status: 'complete' as const,
    actual: { latestRevenue, latestGross, latestOperating, latestNet, latestEps, latestDilutedShares: round(latestDilutedShares, 2), historicalGrowth: round(historicalGrowth), grossMargin: round(grossMargin), operatingMargin: round(operatingMargin), netMargin: round(netMargin), impliedShares: round(latestDilutedShares, 2) },
    scenarios: { bear: scenario(-0.08, -0.02), base: scenario(0, 0), bull: scenario(0.08, 0.02) },
    assumptions: [
      { key: 'revenue_growth', kind: 'model_assumption', value: round(baseGrowth), basis: '50% pass-through of latest four-quarter reported growth, capped -15%/+20%' },
      { key: 'net_margin', kind: 'model_assumption', value: round(netMargin), basis: 'latest four discrete reported quarters' },
      { key: 'scenario_margin_delta', kind: 'model_assumption', value: 0.02, basis: 'bear/base/bull sensitivity, not management guidance' },
    ], factIds: allFactIds,
    verifiedTurnaroundPath: latestNet > 0 && sum(netIncome.slice(0, 4)) <= 0 && netIncome.slice(-2).every((value) => value > 0),
  };
}
