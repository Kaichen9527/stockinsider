function fiscalQuarterOrdinal(periodEnd: string) {
  const match = periodEnd.match(/^(\d{4})-(03|06|09|12)-\d{2}$/u);
  return match ? Number(match[1]) * 4 + ['03', '06', '09', '12'].indexOf(match[2]) : null;
}

export function hasConsecutiveFiscalQuarters(points: Array<{ periodEnd: string }>, count: number) {
  if (points.length !== count) return false;
  const ordinals = points.map((point) => fiscalQuarterOrdinal(point.periodEnd));
  return !ordinals.some((ordinal) => ordinal == null)
    && ordinals.every((ordinal, index) => index === 0 || ordinal === ordinals[index - 1]! + 1);
}

export function normalizedCycleYearsObserved(points: Array<{ periodEnd: string }>) {
  const window = points.slice(-20);
  if (!hasConsecutiveFiscalQuarters(window, 20)) return 0;
  // Twenty consecutive reported quarters are the five fiscal-year observation
  // window. Calendar distance from the first quarter-end to the last is only
  // 4.75 years, so measuring timestamps makes the policy unattainable.
  return window.length / 4;
}

export type NormalizedCycleQuarter = {
  periodEnd: string;
  /** Reconciled diluted EPS for the discrete quarter; never a decumulated EPS. */
  dilutedEps: number;
  factIds?: string[];
};

export type FinancialRoeQuarter = {
  periodEnd: string;
  commonNetIncome: number;
  beginningCommonEquity: number;
  endingCommonEquity: number;
  commonSharesOutstanding: number;
  factIds?: string[];
};

function finitePositive(value: number) { return Number.isFinite(value) && value > 0; }
function round(value: number, digits = 6) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

/**
 * Five fiscal years of reconciled, discrete EPS support the cycle route.  A
 * raw reported YTD EPS is intentionally not accepted here, because it cannot
 * be safely subtracted when weighted shares change during the year.
 */
export function buildNormalizedCycleEarnings(points: NormalizedCycleQuarter[]) {
  const window = points.slice(-20);
  if (!hasConsecutiveFiscalQuarters(window, 20)) {
    return { status: 'insufficient' as const, reason: 'twenty_consecutive_discrete_quarters_required' as const };
  }
  if (window.some((point) => !Number.isFinite(point.dilutedEps))) {
    return { status: 'insufficient' as const, reason: 'finite_reconciled_diluted_eps_required' as const };
  }
  const totalEps = window.reduce((sum, point) => sum + point.dilutedEps, 0);
  const annualizedEps = totalEps / 5;
  const annualEps = Array.from({ length: 5 }, (_, index) => window.slice(index * 4, index * 4 + 4)
    .reduce((sum, point) => sum + point.dilutedEps, 0));
  return {
    status: 'complete' as const,
    normalizedAnnualEps: round(annualizedEps),
    annualEps: annualEps.map((value) => round(value)),
    cycleYearsObserved: 5 as const,
    factIds: [...new Set(window.flatMap((point) => point.factIds || []))],
  };
}

/**
 * Financial issuers are valued from common equity and ROE, not an arbitrary
 * PE.  ROE is based on TTM common income divided by the mean of the four
 * same-period quarterly average-common-equity observations.
 */
export function buildFinancialPbRoeInputs(points: FinancialRoeQuarter[]) {
  const window = points.slice(-8);
  if (!hasConsecutiveFiscalQuarters(window, 8)) {
    return { status: 'insufficient' as const, reason: 'eight_consecutive_financial_quarters_required' as const };
  }
  if (window.some((point) => !Number.isFinite(point.commonNetIncome)
    || !finitePositive(point.beginningCommonEquity)
    || !finitePositive(point.endingCommonEquity)
    || !finitePositive(point.commonSharesOutstanding))) {
    return { status: 'insufficient' as const, reason: 'common_equity_income_and_shares_required' as const };
  }
  const latestFour = window.slice(-4);
  const ttmCommonIncome = latestFour.reduce((sum, point) => sum + point.commonNetIncome, 0);
  const averageCommonEquity = latestFour.reduce(
    (sum, point) => sum + (point.beginningCommonEquity + point.endingCommonEquity) / 2,
    0,
  ) / latestFour.length;
  const latest = latestFour.at(-1)!;
  const bookValuePerShare = latest.endingCommonEquity / latest.commonSharesOutstanding;
  if (!finitePositive(averageCommonEquity) || !finitePositive(bookValuePerShare)) {
    return { status: 'insufficient' as const, reason: 'positive_average_common_equity_and_bvps_required' as const };
  }
  return {
    status: 'complete' as const,
    ttmCommonIncome: round(ttmCommonIncome),
    averageCommonEquity: round(averageCommonEquity),
    roe: round(ttmCommonIncome / averageCommonEquity),
    bookValuePerShare: round(bookValuePerShare),
    roePeriodsObserved: 8 as const,
    factIds: [...new Set(window.flatMap((point) => point.factIds || []))],
  };
}
