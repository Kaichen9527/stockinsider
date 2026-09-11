/** Arithmetic-only projection. A company's outlook remains guidance, never an
 * observed financial fact. Unexplained below-operating items remain an explicit
 * residual rather than being renamed as tax or minority interest. */
export const EARNINGS_PROJECTION_VERSION = 'reconciled-operating-bridge-v1';
export type EarningsScenarioName = 'bear' | 'base' | 'bull';
export type EarningsDriver = 'revenue_growth' | 'gross_margin' | 'operating_expense_ratio'
  | 'non_operating_income_ratio' | 'effective_tax_rate' | 'noncontrolling_interest_ratio'
  | 'below_operating_residual_ratio' | 'diluted_share_change';
type ScenarioValues = Record<EarningsScenarioName, number>;

export type CompanyEarningsGuidance = {
  metric: Exclude<EarningsDriver, 'below_operating_residual_ratio'>;
  issuerSymbol: string;
  /** Only an exact twelve-month outlook is accepted; a quarterly outlook may
   * not silently be annualised or carried into a different forecast period. */
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  availableAt: string;
  authorityTier: 'official_filing' | 'company_ir';
  validationStatus: 'validated';
  sourceRef: string;
  factIds: string[];
  unit: 'ratio';
  scenarios: ScenarioValues;
};

export type EarningsProjectionOptions = {
  symbol?: string;
  evaluationAt?: string;
  guidance?: CompanyEarningsGuidance[];
};

export type EarningsProjectionActuals = {
  revenue: number;
  grossProfit: number;
  operatingIncome: number;
  commonNetIncome: number;
  dilutedShares: number;
  historicalGrowth: number;
  latestPeriodEnd: string;
  /** Complete and reconciled pretax/tax/consolidated-net disclosures only. */
  decomposition: null | { nonOperatingIncome: number; pretaxIncome: number; incomeTaxExpense: number; netIncome: number; noncontrollingInterest: number };
  factIdsByMetric: Record<string, string[]>;
};

type DriverAssumption = {
  key: EarningsDriver;
  kind: 'model_assumption' | 'company_guidance';
  value: number;
  scenarios: ScenarioValues;
  basis: string;
  factIds: string[];
  sourceRefs: string[];
};

const names: EarningsScenarioName[] = ['bear', 'base', 'bull'];
function clamp(value: number, low: number, high: number) { return Math.max(low, Math.min(high, value)); }
function ordered(values: ScenarioValues) { return names.every((name) => Number.isFinite(values[name])); }
function nextDay(date: string) { const parsed = new Date(`${date}T00:00:00Z`); parsed.setUTCDate(parsed.getUTCDate() + 1); return parsed.toISOString().slice(0, 10); }

function validGuidance(row: CompanyEarningsGuidance, options: EarningsProjectionOptions, period: { start: string; end: string }) {
  if (!row.scenarios || typeof row.scenarios !== 'object' || !Array.isArray(row.factIds)) return false;
  const cutoff = Date.parse(options.evaluationAt || '');
  const available = Date.parse(row.availableAt);
  const published = Date.parse(row.publishedAt);
  let httpsSource = false;
  try { const url = new URL(row.sourceRef); httpsSource = url.protocol === 'https:' && !url.username && !url.password; } catch { /* reject malformed provenance */ }
  const bounds: Record<CompanyEarningsGuidance['metric'], [number, number]> = {
    revenue_growth: [-0.99, 5], gross_margin: [-1, 1], operating_expense_ratio: [0, 2],
    non_operating_income_ratio: [-2, 2], effective_tax_rate: [0, 1], noncontrolling_interest_ratio: [-1, 1],
    diluted_share_change: [-0.9, 5],
  };
  const bound = bounds[row.metric];
  const lowerIsBetter = ['operating_expense_ratio', 'effective_tax_rate', 'noncontrolling_interest_ratio', 'diluted_share_change'].includes(row.metric);
  const directionValid = lowerIsBetter
    ? row.scenarios.bear >= row.scenarios.base && row.scenarios.base >= row.scenarios.bull
    : row.scenarios.bear <= row.scenarios.base && row.scenarios.base <= row.scenarios.bull;
  return !!options.symbol && row.issuerSymbol === options.symbol && Number.isFinite(cutoff)
    && Number.isFinite(available) && Number.isFinite(published) && published <= available && available <= cutoff
    && row.periodStart === period.start && row.periodEnd === period.end
    && row.validationStatus === 'validated' && ['official_filing', 'company_ir'].includes(row.authorityTier)
    && row.unit === 'ratio' && httpsSource && row.factIds.length > 0 && row.factIds.every((id) => typeof id === 'string' && id.trim().length > 0)
    && !!bound && ordered(row.scenarios) && directionValid && names.every((name) => row.scenarios[name] >= bound[0] && row.scenarios[name] <= bound[1]);
}

export function buildReconciledEarningsProjection(actual: EarningsProjectionActuals, options: EarningsProjectionOptions = {}) {
  const period = { start: nextDay(actual.latestPeriodEnd), end: `${Number(actual.latestPeriodEnd.slice(0, 4)) + 1}${actual.latestPeriodEnd.slice(4)}` };
  const split = actual.decomposition;
  const grossMargin = actual.grossProfit / actual.revenue;
  const expenseRatio = (actual.grossProfit - actual.operatingIncome) / actual.revenue;
  const belowOperatingRatio = (actual.commonNetIncome - actual.operatingIncome) / actual.revenue;
  const baseGrowth = clamp(actual.historicalGrowth * 0.5, -0.15, 0.2);
  const factIds = (...keys: string[]) => [...new Set(keys.flatMap((key) => actual.factIdsByMetric[key] || []))].sort();
  const assumptions: DriverAssumption[] = [];
  const add = (key: EarningsDriver, values: ScenarioValues, basis: string, ids: string[]) => {
    assumptions.push({ key, kind: 'model_assumption', value: values.base, scenarios: values, basis, factIds: ids, sourceRefs: [] });
  };
  add('revenue_growth', { bear: clamp(baseGrowth - 0.08, -0.25, 0.3), base: baseGrowth, bull: clamp(baseGrowth + 0.08, -0.25, 0.3) },
    '50% of issuer reported TTM revenue growth, capped -15%/+20%; downside/upside sensitivity ±8 percentage points, not company guidance', factIds('quarterly_revenue'));
  add('gross_margin', { bear: clamp(grossMargin - 0.02, -1, 1), base: grossMargin, bull: clamp(grossMargin + 0.02, -1, 1) },
    'Issuer reported TTM gross margin with ±2 percentage-point sensitivity, not company guidance', factIds('quarterly_revenue', 'quarterly_gross_profit'));
  add('operating_expense_ratio', { bear: expenseRatio + 0.005, base: expenseRatio, bull: Math.max(0, expenseRatio - 0.005) },
    'Issuer reported TTM (gross profit − operating income) / revenue; downside/upside expense sensitivity ±0.5 percentage points', factIds('quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income'));
  if (split && split.pretaxIncome > 0 && split.incomeTaxExpense >= 0 && split.incomeTaxExpense <= split.pretaxIncome) {
    const nonOperating = split.nonOperatingIncome / actual.revenue;
    const taxRate = split.incomeTaxExpense / split.pretaxIncome;
    const minority = split.noncontrollingInterest / actual.revenue;
    add('non_operating_income_ratio', { bear: nonOperating, base: nonOperating, bull: nonOperating }, 'Carry reported TTM non-operating income / revenue; does not assert recurrence of one-off gains', factIds('quarterly_pretax_income', 'quarterly_operating_income'));
    add('effective_tax_rate', { bear: taxRate, base: taxRate, bull: taxRate }, 'Reported positive-TTM effective tax rate; loss scenarios recognise no forecast tax benefit', factIds('quarterly_pretax_income', 'quarterly_income_tax_expense'));
    add('noncontrolling_interest_ratio', { bear: minority, base: minority, bull: minority }, 'Reported TTM (consolidated net income − common-attributable income) / revenue', factIds('quarterly_net_income', 'quarterly_net_income_attributable_to_common'));
  } else {
    add('below_operating_residual_ratio', { bear: belowOperatingRatio, base: belowOperatingRatio, bull: belowOperatingRatio },
      'Unseparated TTM common income − operating income, scaled by revenue; non-operating/tax/minority split is unavailable and is not assumed to be zero', factIds('quarterly_net_income_attributable_to_common', 'quarterly_operating_income'));
  }
  add('diluted_share_change', { bear: 0, base: 0, bull: 0 }, 'Hold reported TTM diluted weighted-average shares constant; future dilution is unknown, not a reported zero-dilution fact', factIds('diluted_weighted_average_shares'));

  const rejectedGuidance: Array<{ metric: string; reason: string }> = [];
  for (const metric of [...new Set((options.guidance || []).map((row) => row.metric))].sort()) {
    const rows = (options.guidance || []).filter((row) => row.metric === metric);
    const target = assumptions.find((row) => row.key === metric);
    // Conflicting duplicate outlooks require an explicit upstream revision
    // selection; array order must never choose the favourable forecast.
    if (rows.length !== 1 || !target || !validGuidance(rows[0], options, period)) {
      rejectedGuidance.push({ metric, reason: rows.length !== 1 ? 'conflicting_guidance_requires_revision_selection' : !target ? 'guidance_requires_reported_component_bridge' : 'guidance_pit_issuer_period_or_validation_invalid' });
      continue;
    }
    const guidance = rows[0];
    Object.assign(target, { kind: 'company_guidance', value: guidance.scenarios.base, scenarios: { ...guidance.scenarios },
      basis: 'Validated issuer outlook for this exact forecast period; scenario endpoints remain forward-looking guidance', factIds: [...new Set(guidance.factIds)].sort(), sourceRefs: [guidance.sourceRef] });
  }

  const value = (key: EarningsDriver, name: EarningsScenarioName) => assumptions.find((row) => row.key === key)?.scenarios[name] ?? null;
  const project = (name: EarningsScenarioName, override: Partial<Record<EarningsDriver, number>> = {}) => {
    const driver = (key: EarningsDriver) => override[key] ?? value(key, name)!;
    const revenue = actual.revenue * (1 + driver('revenue_growth'));
    const grossProfit = revenue * driver('gross_margin');
    const operatingExpense = revenue * driver('operating_expense_ratio');
    const operatingIncome = grossProfit - operatingExpense;
    const hasSplit = value('effective_tax_rate', name) != null;
    const nonOperatingIncome = hasSplit ? revenue * driver('non_operating_income_ratio') : null;
    const pretaxIncome = nonOperatingIncome == null ? null : operatingIncome + nonOperatingIncome;
    const incomeTaxExpense = pretaxIncome == null ? null : Math.max(0, pretaxIncome) * driver('effective_tax_rate');
    const consolidatedNetIncome = pretaxIncome == null || incomeTaxExpense == null ? null : pretaxIncome - incomeTaxExpense;
    const noncontrollingInterest = hasSplit ? revenue * driver('noncontrolling_interest_ratio') : null;
    const belowOperatingResidual = hasSplit ? null : revenue * driver('below_operating_residual_ratio');
    const netIncome = consolidatedNetIncome == null ? operatingIncome + belowOperatingResidual! : consolidatedNetIncome - noncontrollingInterest!;
    const dilutedShares = actual.dilutedShares * (1 + driver('diluted_share_change'));
    return { revenue, grossProfit, grossMargin: grossProfit / revenue, operatingExpense, operatingIncome,
      operatingMargin: operatingIncome / revenue, nonOperatingIncome, pretaxIncome, incomeTaxExpense,
      consolidatedNetIncome, noncontrollingInterest, belowOperatingResidual, netMargin: netIncome / revenue,
      netIncome, dilutedShares, dilutedEps: netIncome / dilutedShares };
  };
  const scenarios = { bear: project('bear'), base: project('base'), bull: project('bull') };
  const sensitivities = [
    { driver: 'revenue_growth' as const, delta: 0.01 },
    { driver: 'gross_margin' as const, delta: 0.01 },
    { driver: 'operating_expense_ratio' as const, delta: 0.01 },
    { driver: 'diluted_share_change' as const, delta: 0.01 },
  ].map(({ driver, delta }) => ({ driver, delta, dilutedEpsChange: project('base', { [driver]: value(driver, 'base')! + delta }).dilutedEps - scenarios.base.dilutedEps }));
  return {
    modelVersion: EARNINGS_PROJECTION_VERSION, forecastPeriod: period,
    decompositionStatus: value('effective_tax_rate', 'base') == null ? 'below_operating_residual' as const : 'reconciled_tax_and_minority' as const,
    companyGuidanceUsed: assumptions.some((row) => row.kind === 'company_guidance'),
    missingCompanyDrivers: ['product_mix_volume_asp', 'customer_qualification_shipping', 'capacity_yield', 'future_dilution_plan'],
    assumptions, scenarios, sensitivities, rejectedGuidance,
    factIds: [...new Set([...Object.values(actual.factIdsByMetric).flat(), ...assumptions.flatMap((row) => row.factIds)])].sort(),
  };
}
