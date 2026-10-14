/** Fixed, calculation-only historical cash operands. No file/DB/network access,
 * source verification, admission, forecast cash, model dispatch or publication.
 * A future versioned server adapter must bind actual artifact bytes and clocks.
 */
const PERIODS = ['2026-01-01/2026-06-30', '2025-01-01/2025-06-30'] as const;
const AUO_NONCASH = ['depreciation', 'amortization', 'fvGain', 'interestExpenseAdjustment',
  'interestIncomeAdjustment', 'dividendIncomeAdjustment', 'shareCompensation', 'equityMethodAdjustment',
  'ppeDisposalGainAdjustment', 'rouDisposalLoss', 'heldForSaleGainAdjustment', 'investmentGainAdjustment',
  'impairment', 'unrealizedFx', 'otherAdjustment'] as const;
const AUO_WORKING_CAPITAL = ['receivables', 'relatedReceivables', 'inventory', 'contractCosts',
  'otherOperatingAssets', 'contractLiabilities', 'payables', 'relatedPayables', 'provisions', 'otherOperatingLiabilities'] as const;
const AUO_KEYS = ['pretax', ...AUO_NONCASH, ...AUO_WORKING_CAPITAL, 'generatedCash',
  'interestReceived', 'dividendReceived', 'interestPaid', 'taxPaid', 'operatingCash', 'ppeCash',
  'intangibleCash', 'ppeDisposalCash', 'heldForSaleDisposalCash', 'subsidiaryDisposalCash', 'investingCash',
  'shortBorrowings', 'shortRepayments', 'longBorrowings', 'longRepayments', 'leasePrincipal',
  'financingCash', 'fxCash', 'cashChange', 'openingCash', 'closingCash', 'revenue',
  'netProfit', 'ownersNetProfit', 'nonControllingNetProfit'] as const;
const EMC_KEYS = ['pretax', 'nonCashAdjustments', 'operatingAssetChange', 'operatingLiabilityChange',
  'workingCapital', 'adjustmentsTotal', 'receivables', 'notesReceivable', 'inventory', 'payables',
  'generatedCash', 'interestReceived', 'interestPaid', 'taxPaid', 'operatingCash', 'ppeCash',
  'intangibleCash', 'rouCash', 'ppeDisposalCash', 'investingCash', 'shortBorrowingsNet', 'longBorrowings',
  'longRepayments', 'leasePrincipal', 'financingCash', 'fxCash', 'cashChange', 'openingCash',
  'closingCash', 'revenue', 'netProfit', 'ownersNetProfit', 'nonControllingNetProfit'] as const;
const CAPITAL_KEYS = ['instant', 'ownersEquityTwdThousands', 'nonControllingEquityTwdThousands',
  'groupEquityTwdThousands', 'paidCapitalTwdThousands', 'parTwd', 'issuedSharesThousands',
  'treasuryCarryingAmountTwdThousands', 'treasurySharesThousands'] as const;
type Row = Record<string, unknown>;
type Capital = { instant: '2026-06-30'; ownersEquityTwdThousands: number;
  nonControllingEquityTwdThousands: number; groupEquityTwdThousands: number;
  paidCapitalTwdThousands: number; parTwd: number; issuedSharesThousands: number;
  treasuryCarryingAmountTwdThousands: number; treasurySharesThousands: null };
type Operands = { schemaVersion: 'historical-cash-operands-v1'; symbol: '2409' | '2383';
  unit: 'TWD_thousands'; consolidated: true; grain: 'half_year_cumulative';
  periods: typeof PERIODS; facts: Record<string, [number, number]>; capital: Capital | null };

function ensure(value: unknown): asserts value {
  if (!value) throw new Error('historical_cash_input_invalid');
}
function exact(value: unknown, keys: readonly string[]): Row {
  ensure(value !== null && typeof value === 'object' && !Array.isArray(value));
  ensure(Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  const own = Reflect.ownKeys(value);
  ensure(own.length === keys.length && own.every(k => typeof k === 'string' && keys.includes(k)));
  for (const key of keys) {
    const d = Object.getOwnPropertyDescriptor(value, key);
    ensure(d && 'value' in d && d.enumerable);
  }
  return value as Row;
}
function integer(value: unknown): number {
  ensure(typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0));
  return value;
}
function tuple(value: unknown): [number, number] {
  ensure(Array.isArray(value) && Object.getPrototypeOf(value) === Array.prototype && value.length === 2);
  ensure(Reflect.ownKeys(value).length === 3);
  const a = Object.getOwnPropertyDescriptor(value, '0'), b = Object.getOwnPropertyDescriptor(value, '1');
  ensure(a && b && 'value' in a && 'value' in b);
  return [integer(a.value), integer(b.value)];
}
function sum(values: number[]): number {
  const total = values.reduce((n, value) => n + BigInt(value), BigInt(0));
  ensure(total <= BigInt(Number.MAX_SAFE_INTEGER) && total >= BigInt(Number.MIN_SAFE_INTEGER));
  return Number(total);
}
function equal(a: number, b: number) { ensure(a === b); }
function freeze<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
function validate(value: unknown): Operands {
  const v = exact(value, ['schemaVersion', 'symbol', 'unit', 'consolidated', 'grain', 'periods', 'facts', 'capital']);
  ensure(v.schemaVersion === 'historical-cash-operands-v1' && (v.symbol === '2409' || v.symbol === '2383')
    && v.unit === 'TWD_thousands' && v.consolidated === true && v.grain === 'half_year_cumulative');
  ensure(Array.isArray(v.periods) && v.periods.length === 2 && Reflect.ownKeys(v.periods).length === 3);
  for (let i = 0; i < 2; i++) {
    const d = Object.getOwnPropertyDescriptor(v.periods, String(i));
    ensure(d && 'value' in d && d.value === PERIODS[i]);
  }
  const keys = v.symbol === '2409' ? AUO_KEYS : EMC_KEYS;
  const raw = exact(v.facts, keys), facts: Record<string, [number, number]> = {};
  for (const key of keys) facts[key] = tuple(raw[key]);
  let capital: Capital | null = null;
  if (v.symbol === '2383') ensure(v.capital === null);
  else {
    const c = exact(v.capital, CAPITAL_KEYS);
    ensure(c.instant === '2026-06-30' && c.treasurySharesThousands === null);
    for (const key of CAPITAL_KEYS.filter(k => k !== 'instant' && k !== 'treasurySharesThousands')) integer(c[key]);
    ensure(Number(c.parTwd) > 0 && Number(c.issuedSharesThousands) > 0 && Number(c.paidCapitalTwdThousands) > 0);
    ensure(Number(c.treasuryCarryingAmountTwdThousands) <= 0);
    ensure(BigInt(Number(c.parTwd)) * BigInt(Number(c.issuedSharesThousands)) === BigInt(Number(c.paidCapitalTwdThousands)));
    equal(sum([Number(c.ownersEquityTwdThousands), Number(c.nonControllingEquityTwdThousands)]), Number(c.groupEquityTwdThousands));
    capital = { ...c } as Capital;
  }
  return { schemaVersion: 'historical-cash-operands-v1', symbol: v.symbol, unit: 'TWD_thousands',
    consolidated: true, grain: 'half_year_cumulative', periods: PERIODS, facts, capital };
}

/** Integer bridges reconcile exactly; ratios retain explicit zero-denominator
 * unavailability. The source operands are not silently repaired or annualized.
 */
export function calculateHistoricalCash(value: unknown) {
  const input = validate(value), isAuo = input.symbol === '2409';
  const rows = PERIODS.map((period, i) => {
    const v = (key: string) => input.facts[key][i];
    for (const key of ['ppeCash', 'intangibleCash', 'leasePrincipal', 'longRepayments', ...(isAuo ? ['shortRepayments'] : ['rouCash'])]) ensure(v(key) <= 0);
    for (const key of ['revenue', 'openingCash', 'closingCash', 'ppeDisposalCash', 'longBorrowings', ...(isAuo ? ['shortBorrowings', 'heldForSaleDisposalCash', 'subsidiaryDisposalCash'] : [])]) ensure(v(key) >= 0);
    const nonCash = isAuo ? sum(AUO_NONCASH.map(v)) : v('nonCashAdjustments');
    const workingCapital = isAuo ? sum(AUO_WORKING_CAPITAL.map(v)) : v('workingCapital');
    if (!isAuo) {
      equal(sum([v('operatingAssetChange'), v('operatingLiabilityChange')]), workingCapital);
      equal(sum([nonCash, workingCapital]), v('adjustmentsTotal'));
    }
    equal(sum([v('pretax'), nonCash, workingCapital]), v('generatedCash'));
    equal(sum([v('generatedCash'), v('interestReceived'), v('interestPaid'), v('taxPaid'), ...(isAuo ? [v('dividendReceived')] : [])]), v('operatingCash'));
    equal(sum([v('operatingCash'), v('investingCash'), v('financingCash'), v('fxCash')]), v('cashChange'));
    equal(sum([v('openingCash'), v('cashChange')]), v('closingCash'));
    equal(sum([v('ownersNetProfit'), v('nonControllingNetProfit')]), v('netProfit'));
    const proxy = sum([v('operatingCash'), v('ppeCash'), v('intangibleCash')]);
    const borrowingKeys = isAuo ? ['shortBorrowings', 'shortRepayments', 'longBorrowings', 'longRepayments'] : ['shortBorrowingsNet', 'longBorrowings', 'longRepayments'];
    const operands = Object.fromEntries(Object.keys(input.facts).map(k => [k, v(k)]));
    return { period, periodKind: 'half_year_cumulative' as const, operandUnit: 'TWD_thousands' as const, operands,
      calculatedUnit: 'TWD_thousands' as const,
      calculated: { nonCashAdjustments: nonCash, workingCapitalCashEffect: workingCapital,
        generatedCash: v('generatedCash'), cfo: v('operatingCash'), groupNetProfit: v('netProfit'),
        cfoLessPpeCashOutlay: sum([v('operatingCash'), v('ppeCash')]),
        cfoLessPpeAndIntangibleCashOutlay: proxy,
        afterLeasePrincipalSensitivity: sum([proxy, v('leasePrincipal')]),
        rouCashAcquisitionSeparate: isAuo ? null : v('rouCash'),
        netBorrowingCash: sum(borrowingKeys.map(v)), cashChange: v('cashChange'), closingCash: v('closingCash') },
      ratio: { metric: 'cfo_divided_by_group_net_profit' as const, unit: 'dimensionless' as const,
        numerator: v('operatingCash'), denominator: v('netProfit'),
        value: v('netProfit') === 0 ? null : v('operatingCash') / v('netProfit'),
        unavailableReason: v('netProfit') === 0 ? 'zero_group_net_profit' as const : null },
      coverage: isAuo ? 'fifteen_noncash_and_ten_working_capital_components'
        : 'reported_noncash_and_operating_asset_liability_totals; named_AR_inventory_AP_are_partial_components' };
  });
  const capital = input.capital ? { ...input.capital, equityUnit: 'TWD_thousands' as const,
    issuedSharesUnit: 'thousand_shares' as const, perShareUnit: 'TWD_per_share' as const,
    ownersEquityPerIssuedCommonShare: input.capital.ownersEquityTwdThousands / input.capital.issuedSharesThousands,
    denominatorBasis: 'June30_issued_common_shares; not_weighted_diluted_or_October_outstanding' as const,
    octoberOutstandingShares: null, currentPB: null, targetPrice: null,
    treasuryShareCountVerified: false as const } : null;
  return freeze({ schemaVersion: 'historical-cash-calculation-v1' as const, symbol: input.symbol,
    calculatorVersion: 'fixed_two_company_half_year_cash_v1' as const, rows, historicalCapital: capital,
    workload: { originalCashRows: Object.keys(input.facts).length, cashNumericCells: Object.keys(input.facts).length * 2,
      capitalNumericInputs: input.capital ? 7 : 0 },
    proxyDefinition: 'CFO plus signed PPE and intangible acquisition cash only; disposal proceeds excluded; not IFRS FCF, FCFE, maintenance capex or forecast',
    sourceVerification: 'not_performed' as const, financialVerified: false as const, dispatchReady: false as const,
    modelDispatched: false as const, publishableResearch: false as const, researchQualified: false as const,
    historicalPITEligible: false as const, strategyApproved: false as const, entryEligible: false as const,
    published: false as const, valuationApproved: false as const, technicalAdmission: false as const,
    noFutureCash: true as const, forecastCash: null });
}
