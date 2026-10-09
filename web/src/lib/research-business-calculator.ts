import { createHash } from 'node:crypto';
import { financialInstant as sourceControllerInstant } from './research-financial-clock.ts';

/** Pure, fixed dispatch. Input observations remain unsealed until the publication
 * transaction resolves their immutable DB revisions. This is no identity,
 * source-rights, model execution or publication authority. No request code runs. */
export type BusinessCalculatorId = 'auo_four_segment_v1' | 'emc_ccl_v1';
type Row = Record<string, unknown>;
type Shares = { openingOrdinaryMillion: number; issuedOrdinaryMillion: number; fractionOutstanding: number; potentialAwardsMillion: number };
type Common = { period: string; shares: Shares; taxRate: number; taxFloor: number; nci: number };
type Segment = { key: string; revenue: number; grossMargin: number; operatingMargin: number };
type AuoQuarter = Common & { segments: Segment[]; interestIncome: number; financeCosts: number; otherIncome: number; equityMethodProfit: number; fxAndOtherRecurring: number };
type EmcQuarter = Common & { revenue: number; grossMargin: number; opexRatio: number; bankInterest: number; financeCost: number; fx: number; otherGainsExFx: number };
const AUO_KEYS = ['display', 'mobility', 'vertical', 'other'];
const COMMON_KEYS = ['period', 'shares', 'taxRate', 'taxFloor', 'nci'];
const AUO_FIELDS = ['segments', 'interestIncome', 'financeCosts', 'otherIncome', 'equityMethodProfit', 'fxAndOtherRecurring'];
const EMC_FIELDS = ['revenue', 'grossMargin', 'opexRatio', 'bankInterest', 'financeCost', 'fx', 'otherGainsExFx'];
const PROFIT_FIELDS = ['revenue', 'grossProfit', 'operatingExpenses', 'operatingProfit', 'nonOperating', 'pretaxProfit', 'taxExpense', 'netProfit', 'nonControllingNetProfit', 'ownersNetProfit'] as const;
function ensure(ok: unknown): asserts ok { if (!ok) throw new Error('research_business_calculator_invalid'); }
function exact(value: unknown, keys: readonly string[]): Row {
  ensure(value && typeof value === 'object' && !Array.isArray(value));
  const row = value as Row;
  ensure(Object.getPrototypeOf(row) === Object.prototype || Object.getPrototypeOf(row) === null);
  ensure(Object.keys(row).sort().join(',') === [...keys].sort().join(','));
  return row;
}
function finite(value: unknown, min = -1e12, max = 1e12): asserts value is number {
  ensure(typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max);
}
function text(value: unknown, max = 200): asserts value is string { ensure(typeof value === 'string' && value.length > 0 && value.length <= max); }
function hash(value: unknown) { text(value, 64); ensure(/^[0-9a-f]{64}$/u.test(value)); }
function json(value: unknown, depth = 0): void {
  ensure(depth <= 12);
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return;
  if (typeof value === 'number') { finite(value); return; }
  ensure(value && typeof value === 'object');
  ensure(Array.isArray(value) || Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  ensure(Reflect.ownKeys(value).every(key => typeof key === 'string'));
  for (const key of Object.keys(value)) {
    ensure(!/^(?:__proto__|constructor|prototype)$/u.test(key));
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    ensure(descriptor && 'value' in descriptor);
    json(descriptor.value, depth + 1);
  }
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical((value as Row)[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function digest(value: unknown) { return createHash('sha256').update(canonical(value)).digest('hex'); }
function sum(values: number[]) { return values.reduce((a, b) => a + b, 0); }
function periodIndex(value: unknown): number {
  text(value, 6); ensure(/^20\d{2}Q[1-4]$/u.test(value));
  return Number(value.slice(0, 4)) * 4 + Number(value.at(-1)) - 1;
}
function shareInput(value: unknown): Shares {
  const s = exact(value, ['openingOrdinaryMillion', 'issuedOrdinaryMillion', 'fractionOutstanding', 'potentialAwardsMillion']);
  finite(s.openingOrdinaryMillion, 0.000001, 1e6); finite(s.issuedOrdinaryMillion, 0, 1e6);
  finite(s.fractionOutstanding, 0, 1); finite(s.potentialAwardsMillion, 0, 1e6);
  return s as Shares;
}
function eps(owners: number, ordinary: number, potential: number) {
  const included = owners > 0 ? potential : 0;
  return { ordinaryWeightedSharesMillionAssumed: ordinary, potentialWeightedSharesMillionAssumed: potential,
    potentialIncludedMillion: included, antiDilutiveExcludedMillion: potential - included,
    dilutedSharesMillionAssumed: ordinary + included, basicEpsConditional: owners / ordinary,
    dilutedEpsConditional: owners / (ordinary + included),
    shareBasis: 'weighted ordinary issuance plus award-only potential shares without numerator adjustment; losses/zero exclude potential; future assumptions' };
}
function common(q: Row): Common {
  periodIndex(q.period); finite(q.taxRate, 0, 1); finite(q.taxFloor, 0); finite(q.nci);
  return { period: q.period as string, taxRate: q.taxRate, taxFloor: q.taxFloor, nci: q.nci, shares: shareInput(q.shares) };
}
function quarterInput(value: unknown, id: BusinessCalculatorId): AuoQuarter | EmcQuarter {
  const q = exact(value, [...COMMON_KEYS, ...(id === 'auo_four_segment_v1' ? AUO_FIELDS : EMC_FIELDS)]);
  const c = common(q);
  if (id === 'auo_four_segment_v1') {
    ensure(Array.isArray(q.segments) && q.segments.length === 4);
    const segments = q.segments.map((value, i) => {
      const s = exact(value, ['key', 'revenue', 'grossMargin', 'operatingMargin']);
      ensure(s.key === AUO_KEYS[i]); finite(s.revenue, 0); finite(s.grossMargin, -1, 1); finite(s.operatingMargin, -1, 1);
      ensure(s.operatingMargin <= s.grossMargin);
      return s as Segment;
    });
    for (const key of AUO_FIELDS.slice(1)) finite(q[key]);
    ensure((q.financeCosts as number) <= 0);
    return { ...q, ...c, segments } as AuoQuarter;
  }
  for (const key of EMC_FIELDS) finite(q[key]);
  finite(q.revenue, 0); finite(q.grossMargin, 0, 1); finite(q.opexRatio, 0, 1); ensure((q.financeCost as number) <= 0);
  return { ...q, ...c } as EmcQuarter;
}
function auo(q: AuoQuarter) {
  const segments = q.segments.map(s => ({ ...s, grossProfit: s.revenue * s.grossMargin,
    operatingExpenses: s.revenue * (s.grossMargin - s.operatingMargin), operatingProfit: s.revenue * s.operatingMargin,
    status: 'research_allocation_not_disclosed_segment_gross_margin' }));
  return { segments, revenue: sum(segments.map(s => s.revenue)), grossProfit: sum(segments.map(s => s.grossProfit)),
    operatingExpenses: sum(segments.map(s => s.operatingExpenses)),
    nonOperating: q.interestIncome + q.financeCosts + q.otherIncome + q.equityMethodProfit + q.fxAndOtherRecurring,
    nonOperatingBreakdown: { interestIncome: q.interestIncome, financeCosts: q.financeCosts, otherIncome: q.otherIncome, equityMethodProfit: q.equityMethodProfit, fxAndOtherRecurring: q.fxAndOtherRecurring } };
}
function emc(q: EmcQuarter) {
  return { segments: null, revenue: q.revenue, grossProfit: q.revenue * q.grossMargin,
    operatingExpenses: q.revenue * q.opexRatio,
    nonOperating: q.bankInterest + q.financeCost + q.fx + q.otherGainsExFx,
    nonOperatingBreakdown: { bankInterest: q.bankInterest, financeCost: q.financeCost, fx: q.fx, otherGainsExFx: q.otherGainsExFx } };
}
function calculate(q: AuoQuarter | EmcQuarter, id: BusinessCalculatorId) {
  const b = id === 'auo_four_segment_v1' ? auo(q as AuoQuarter) : emc(q as EmcQuarter);
  const operatingProfit = b.grossProfit - b.operatingExpenses, pretaxProfit = operatingProfit + b.nonOperating;
  const taxExpense = Math.max(Math.max(pretaxProfit, 0) * q.taxRate, q.taxFloor), netProfit = pretaxProfit - taxExpense;
  const ownersNetProfit = netProfit - q.nci;
  const ordinary = q.shares.openingOrdinaryMillion + q.shares.issuedOrdinaryMillion * q.shares.fractionOutstanding;
  return { period: q.period, ...b, operatingProfit, pretaxProfit, taxExpense, netProfit, nonControllingNetProfit: q.nci,
    ownersNetProfit, ...eps(ownersNetProfit, ordinary, q.shares.potentialAwardsMillion),
    estimatesOnly: true, newCommercialRevenue: { status: 'not_quantifiable', value: null }, targetPrice: null };
}
type QuarterResult = ReturnType<typeof calculate>;
function aggregate(rows: QuarterResult[]) {
  const profits = Object.fromEntries(PROFIT_FIELDS.map(key => [key, sum(rows.map(r => r[key]))])) as Record<typeof PROFIT_FIELDS[number], number>;
  return { ...profits, ...eps(profits.ownersNetProfit,
    sum(rows.map(r => r.ordinaryWeightedSharesMillionAssumed)) / rows.length,
    sum(rows.map(r => r.potentialWeightedSharesMillionAssumed)) / rows.length),
    periods: rows.map(r => r.period), periodShareWeight: 'equal-quarter weighting sensitivity, not reported annual IAS33 shares' };
}
export function businessCalculatorExecutionHash(): string {
  // Bind the executed financial core, including dependencies, without reading
  // request paths, dynamically importing a module or executing report scripts.
  return digest({ version: 'business-calculator-core-v2.2', profitFields: PROFIT_FIELDS, auoKeys: AUO_KEYS, commonKeys: COMMON_KEYS, auoFields: AUO_FIELDS, emcFields: EMC_FIELDS, functions: [sourceControllerInstant, ensure, exact, finite, text, hash, json, canonical, digest, sum, periodIndex, shareInput, common, quarterInput, eps, auo, emc, calculate, aggregate, recalculateResearchBusinessScenarios].map(fn => fn.toString()) });
}
export function recalculateResearchBusinessScenarios(value: unknown, now = new Date().toISOString()) {
  json(value); ensure(Buffer.byteLength(JSON.stringify(value), 'utf8') <= 160_000);
  const input = exact(value, ['schemaVersion', 'calculatorId', 'symbol', 'unit', 'originalModelCutoff', 'researchCutoff', 'latestReportedQuarter', 'observations', 'scenarios']);
  ensure(input.schemaVersion === 'business-scenarios-v2' && input.unit === 'TWD_million');
  ensure(input.calculatorId === 'auo_four_segment_v1' || input.calculatorId === 'emc_ccl_v1');
  const id = input.calculatorId as BusinessCalculatorId;
  ensure(input.symbol === (id === 'auo_four_segment_v1' ? '2409' : '2383'));
  const cutoff = sourceControllerInstant(input.researchCutoff);
  ensure(sourceControllerInstant(input.originalModelCutoff) <= cutoff && cutoff <= sourceControllerInstant(now));
  const last = periodIndex(input.latestReportedQuarter);
  const year = Math.floor(last / 4), quarter = last % 4;
  // Require that a claimed reported quarter has ended. Future forecast periods
  // remain estimates; this check does not assert source-report authenticity.
  ensure(BigInt(Date.UTC(year, (quarter + 1) * 3, 1)) * BigInt(1_000_000) <= cutoff);
  ensure(Array.isArray(input.observations) && input.observations.length > 0 && input.observations.length <= 64);
  const observations = input.observations.map(value => {
    const o = exact(value, ['sourceArtifactHash', 'observationHash', 'observedAt', 'admittedAt', 'publication']);
    hash(o.sourceArtifactHash); hash(o.observationHash);
    const observed = sourceControllerInstant(o.observedAt), admitted = sourceControllerInstant(o.admittedAt);
    ensure(observed <= admitted && admitted <= cutoff);
    const p = exact(o.publication, ['precision', 'value']);
    if (p.precision === 'unknown') ensure(p.value === null);
    else if (p.precision === 'instant') ensure(sourceControllerInstant(p.value) <= observed);
    else {
      ensure(p.precision === 'date'); text(p.value, 10); ensure(/^\d{4}-\d{2}-\d{2}$/u.test(p.value));
      const ms = Date.parse(`${p.value}T00:00:00Z`); ensure(Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === p.value);
      // Date-only sources have no invented UTC instant. Reject a date later
      // than the observer's Taiwan civil date, retaining its original precision.
      ensure(p.value <= new Date(Number(observed / BigInt(1_000_000)) + 8 * 3600_000).toISOString().slice(0, 10));
    }
    return o;
  });
  ensure(new Set(observations.map(o => o.observationHash)).size === observations.length);
  ensure(Array.isArray(input.scenarios) && input.scenarios.length === 3);
  const scenarios = input.scenarios.map((value, index) => {
    const s = exact(value, ['id', 'quarters']); ensure(s.id === ['bear', 'base', 'bull'][index]);
    ensure(Array.isArray(s.quarters) && s.quarters.length === 6);
    const quarters = s.quarters.map((value, i) => {
      const q = quarterInput(value, id); ensure(periodIndex(q.period) === last + i + 1); return calculate(q, id);
    });
    for (const q of quarters) for (const key of PROFIT_FIELDS) finite(q[key], -1e15, 1e15);
    const fullYears = [...new Set(quarters.map(q => q.period.slice(0, 4)))].flatMap(year => {
      const rows = quarters.filter(q => q.period.startsWith(year)); return rows.length === 4 ? [{ year, ...aggregate(rows) }] : [];
    });
    return { id: s.id as string, quarters, nextFourUnreported: aggregate(quarters.slice(0, 4)), fullForecastYears: fullYears,
      partialYears: [...new Set(quarters.map(q => q.period.slice(0, 4)))].filter(year => !fullYears.some(row => row.year === year)),
      calendarActualPlusForecast: { status: 'incomplete', reason: 'reported YTD bridge must be sealed separately; never add rounded EPS' } };
  });
  const result = { schemaVersion: 'business-calculation-result-v2', calculatorId: id, symbol: input.symbol, unit: input.unit,
    originalModelCutoff: input.originalModelCutoff, researchCutoff: input.researchCutoff,
    inputHash: digest(input), executionCodeHash: businessCalculatorExecutionHash(), observations, scenarios,
    calculationAuthority: 'unsealed_calculation_only', publishableResearch: false, researchQualified: false, strategyApproved: false, entryEligible: false,
    limitations: ['source revisions, rights and financial authenticity require atomic DB sealing', 'no trusted author/reviewer execution proof', 'no calibrated multiple, target, physical capacity, yield, ASP or order assumption'] };
  return { ...result, resultHash: digest(result) };
}
