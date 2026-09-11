import { buildReconciledEarningsProjection, type EarningsProjectionOptions } from './company-earnings-projection.ts';

export type ReportedFinancialFact = {
  factId: string;
  factKey: string;
  periodStart: string | null;
  periodEnd: string;
  durationKind?: 'quarterly' | 'instant' | 'quarter_end' | null;
  value: number;
  unit: string | null;
  sourceRef: string;
  filingRestatementId?: string | null;
  filingPublishedAt?: string | null;
  provider?: string | null;
  authorityTier?: string | null;
};

type QuarterlyPoint = { periodEnd: string; value: number; factIds: string[] };
type SeriesDiagnosis = { points: QuarterlyPoint[]; issues: string[] };

function authorityIdentity(fact: ReportedFinancialFact) {
  const duration = fact.durationKind === 'quarter_end' ? 'instant' : String(fact.durationKind || '');
  return `${fact.factKey}|${fact.periodStart || ''}|${fact.periodEnd}|${duration}`;
}

function finite(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function round(value: number, digits = 4) { const scale = 10 ** digits; return Math.round((value + Number.EPSILON) * scale) / scale; }
function quarterStart(periodEnd: string) {
  const year = periodEnd.slice(0, 4);
  const month = Number(periodEnd.slice(5, 7));
  return `${year}-${String(Math.floor((month - 1) / 3) * 3 + 1).padStart(2, '0')}-01`;
}
function quarterNumber(periodEnd: string) { return Math.floor((Number(periodEnd.slice(5, 7)) - 1) / 3) + 1; }
function closeEnough(left: number, right: number) { return Math.abs(left - right) <= Math.max(0.0001, Math.abs(left) * 0.01, Math.abs(right) * 0.01); }

/** A bridge needs eight *adjacent* fiscal quarters.  Counting eight rows is
 * insufficient: a missing Q2 otherwise turns two annual periods into a
 * deceptively plausible TTM. */
export function hasConsecutiveQuarterEnds(points: Array<{ periodEnd: string }>, count: number): boolean {
  if (points.length !== count) return false;
  const ordinal = (periodEnd: string) => {
    const match = periodEnd.match(/^(\d{4})-(03|06|09|12)-\d{2}$/u);
    return match ? Number(match[1]) * 4 + ['03', '06', '09', '12'].indexOf(match[2]) : null;
  };
  const values = points.map((point) => ordinal(point.periodEnd));
  return !values.some((value) => value == null)
    && values.every((value, index) => index === 0 || value === values[index - 1]! + 1);
}

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
  // EPS and weighted-average shares are ratios/averages, not additive flows.
  // A YTD EPS must never be subtracted from the prior YTD EPS because the
  // denominator can change between periods. Only an explicitly discrete
  // quarter is accepted here; cumulative disclosures must be reconciled from
  // attributable profit and diluted shares by a dedicated bridge.
  if (factKey === 'quarterly_basic_eps' || factKey === 'quarterly_diluted_eps' || factKey.includes('weighted_average_shares')) {
    return reportedQuarterValues(facts, factKey).points;
  }
  return diagnoseDiscreteQuarters(facts, factKey).points;
}

/** Prefer official facts without losing a mirror quarter that an official YTD
 * disclosure cannot yet reconstruct. Once the official series can derive that
 * quarter, remove the mirror so downstream provenance and conflicts are based
 * only on the authoritative filing. */
export function preferOfficialReportedFinancialFacts(facts: ReportedFinancialFact[]) {
  const official = facts.filter((fact) => fact.authorityTier === 'official_filing');
  const officialIdentities = new Set(official.map(authorityIdentity));
  const officialQuarterKeys = new Set<string>();
  for (const factKey of new Set(official.map((fact) => fact.factKey))) {
    const points = discreteReportedQuarters(official, factKey);
    points.forEach((point) => officialQuarterKeys.add(`${factKey}|${point.periodEnd}`));
  }
  return facts.filter((fact) => fact.authorityTier === 'official_filing'
    || (!officialIdentities.has(authorityIdentity(fact))
      && !officialQuarterKeys.has(`${fact.factKey}|${fact.periodEnd}`)));
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

export function buildForwardEarningsBridge(facts: ReportedFinancialFact[], options: EarningsProjectionOptions = {}) {
  const flowKeys = ['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income', 'quarterly_net_income_attributable_to_common'] as const;
  const series = Object.fromEntries(flowKeys.map((key) => [key, diagnoseDiscreteQuarters(facts, key)])) as Record<(typeof flowKeys)[number], SeriesDiagnosis>;
  const shares = reportedQuarterValues(facts, 'diluted_weighted_average_shares');
  const disclosedEps = reportedQuarterValues(facts, 'quarterly_diluted_eps');
  const requiredPeriods = series.quarterly_revenue.points.slice(-8).map((row) => row.periodEnd);
  const contiguousWindow = hasConsecutiveQuarterEnds(series.quarterly_revenue.points.slice(-8), 8);
  const missing = [
    ...(contiguousWindow ? [] : ['eight_consecutive_fiscal_quarters_required']),
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
  if (shareValues.some((value) => !(value > 0))) return { status: 'insufficient' as const, missing: ['positive_reported_diluted_shares_required'] };
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
  const grossMargin = latestGross / latestRevenue;
  const operatingMargin = latestOperating / latestRevenue;
  const netMargin = latestNet / latestRevenue;
  const latestPeriods = requiredPeriods.slice(-4);
  const optionalKeys = ['quarterly_operating_expense', 'quarterly_non_operating_income', 'quarterly_pretax_income', 'quarterly_income_tax_expense', 'quarterly_net_income', 'quarterly_noncontrolling_interest'];
  const optionalSeries = Object.fromEntries(optionalKeys.map((key) => [key, diagnoseDiscreteQuarters(facts, key)]));
  const optionalIssues = optionalKeys.flatMap((key) => optionalSeries[key].issues.filter((issue) => latestPeriods.some((period) => issue.includes(period))));
  // Additional disclosures may be annual-only or use a period that cannot be
  // reconstructed into quarters. Their absence of usable context does not
  // invalidate the complete required bridge. Keep these gaps visible and use
  // the explicit below-operating residual; actual conflicts still fail closed.
  const optionalComponentGaps = optionalIssues.filter((issue) => /:(?:missing_prior_period_for_ytd|unsupported_period_context)$/u.test(issue)).sort();
  const optionalConflicts = optionalIssues.filter((issue) => !optionalComponentGaps.includes(issue)).sort();
  if (optionalConflicts.length) return { status: 'insufficient' as const, missing: optionalConflicts };
  const optionalTtm = (key: string) => latestPeriods.every((period) => optionalSeries[key].points.some((row) => row.periodEnd === period))
    ? sum(latestPeriods.map((period) => optionalSeries[key].points.find((row) => row.periodEnd === period)!.value)) : null;
  const pretax = optionalTtm('quarterly_pretax_income');
  const tax = optionalTtm('quarterly_income_tax_expense');
  const consolidatedNet = optionalTtm('quarterly_net_income');
  const expense = optionalTtm('quarterly_operating_expense');
  const nonOperating = optionalTtm('quarterly_non_operating_income');
  const minority = optionalTtm('quarterly_noncontrolling_interest');
  const reconciliationIssues = [
    ...(expense != null && !closeEnough(latestGross - expense, latestOperating) ? ['reported_gross_expense_operating_inconsistent'] : []),
    ...(pretax != null && nonOperating != null && !closeEnough(latestOperating + nonOperating, pretax) ? ['reported_operating_non_operating_pretax_inconsistent'] : []),
    ...(pretax != null && tax != null && consolidatedNet != null && !closeEnough(pretax - tax, consolidatedNet) ? ['reported_pretax_tax_net_income_inconsistent'] : []),
    ...(consolidatedNet != null && minority != null && !closeEnough(consolidatedNet - minority, latestNet) ? ['reported_net_minority_common_income_inconsistent'] : []),
    ...(latestGross < latestOperating ? ['negative_implied_operating_expense_requires_investigation'] : []),
  ];
  // Annual offsets can hide contradictory quarters. Reconcile each disclosed
  // component before aggregating, even when only some optional quarters exist.
  for (const period of latestPeriods) {
    const required = (key: (typeof flowKeys)[number]) => series[key].points.find((row) => row.periodEnd === period)!.value;
    const optional = (key: string) => optionalSeries[key].points.find((row) => row.periodEnd === period)?.value ?? null;
    const quarterlyExpense = optional('quarterly_operating_expense');
    const quarterlyNonOperating = optional('quarterly_non_operating_income');
    const quarterlyPretax = optional('quarterly_pretax_income');
    const quarterlyTax = optional('quarterly_income_tax_expense');
    const quarterlyNet = optional('quarterly_net_income');
    const quarterlyMinority = optional('quarterly_noncontrolling_interest');
    if (quarterlyExpense != null && !closeEnough(required('quarterly_gross_profit') - quarterlyExpense, required('quarterly_operating_income'))) reconciliationIssues.push(`quarterly_gross_expense_operating_inconsistent:${period}`);
    if (quarterlyPretax != null && quarterlyNonOperating != null && !closeEnough(required('quarterly_operating_income') + quarterlyNonOperating, quarterlyPretax)) reconciliationIssues.push(`quarterly_operating_non_operating_pretax_inconsistent:${period}`);
    if (quarterlyPretax != null && quarterlyTax != null && quarterlyNet != null && !closeEnough(quarterlyPretax - quarterlyTax, quarterlyNet)) reconciliationIssues.push(`quarterly_pretax_tax_net_income_inconsistent:${period}`);
    if (quarterlyNet != null && quarterlyMinority != null && !closeEnough(quarterlyNet - quarterlyMinority, required('quarterly_net_income_attributable_to_common'))) reconciliationIssues.push(`quarterly_net_minority_common_income_inconsistent:${period}`);
  }
  if (reconciliationIssues.length) return { status: 'insufficient' as const, missing: reconciliationIssues };
  const factIdsByMetric: Record<string, string[]> = Object.fromEntries([
    ...flowKeys.map((key) => [key, series[key].points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)]),
    ['diluted_weighted_average_shares', shares.points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)],
    ['quarterly_diluted_eps', disclosedEps.points.filter((row) => requiredPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)],
    ...optionalKeys.map((key) => [key, optionalSeries[key].points.filter((row) => latestPeriods.includes(row.periodEnd)).flatMap((row) => row.factIds)]),
  ]);
  const projection = buildReconciledEarningsProjection({ revenue: latestRevenue, grossProfit: latestGross, operatingIncome: latestOperating,
    commonNetIncome: latestNet, dilutedShares: latestDilutedShares, historicalGrowth, latestPeriodEnd: requiredPeriods.at(-1)!, factIdsByMetric,
    decomposition: pretax != null && tax != null && consolidatedNet != null ? {
      nonOperatingIncome: pretax - latestOperating, pretaxIncome: pretax, incomeTaxExpense: tax, netIncome: consolidatedNet, noncontrollingInterest: consolidatedNet - latestNet,
    } : null,
  }, options);
  if (Object.values(projection.scenarios).some((row) => Object.values(row).some((value) => value != null && !Number.isFinite(value)))) {
    return { status: 'insufficient' as const, missing: ['non_finite_forward_projection'] };
  }
  return {
    status: 'complete' as const,
    actual: { latestRevenue, latestGross, latestOperating, latestNet, latestEps, latestDilutedShares: round(latestDilutedShares, 2), historicalGrowth: round(historicalGrowth), grossMargin: round(grossMargin), operatingMargin: round(operatingMargin), netMargin: round(netMargin), impliedShares: round(latestDilutedShares, 2) },
    ...projection,
    optionalComponentGaps,
    researchDepth: 'financial_statement_projection' as const,
    verifiedTurnaroundPath: latestNet > 0 && sum(netIncome.slice(0, 4)) <= 0 && netIncome.slice(-2).every((value) => value > 0),
  };
}
