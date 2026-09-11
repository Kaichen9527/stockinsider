import assert from 'node:assert/strict';
import test from 'node:test';
import { buildReconciledEarningsProjection, type CompanyEarningsGuidance, type EarningsProjectionActuals } from './company-earnings-projection.ts';
import { buildForwardEarningsBridge, type ReportedFinancialFact } from './forward-earnings-bridge.ts';

const actual: EarningsProjectionActuals = {
  revenue: 1000, grossProfit: 400, operatingIncome: 200, commonNetIncome: 160, dilutedShares: 100,
  historicalGrowth: 0.2, latestPeriodEnd: '2026-06-30',
  decomposition: { nonOperatingIncome: 20, pretaxIncome: 220, incomeTaxExpense: 44, netIncome: 176, noncontrollingInterest: 16 },
  factIdsByMetric: Object.fromEntries(['quarterly_revenue', 'quarterly_gross_profit', 'quarterly_operating_income',
    'quarterly_net_income_attributable_to_common', 'quarterly_pretax_income', 'quarterly_income_tax_expense',
    'quarterly_net_income', 'diluted_weighted_average_shares'].map((key) => [key, [key]])),
};
const guidance: CompanyEarningsGuidance = {
  metric: 'revenue_growth', issuerSymbol: '2330', periodStart: '2026-07-01', periodEnd: '2027-06-30',
  publishedAt: '2026-08-01T00:00:00Z', availableAt: '2026-08-01T01:00:00Z', authorityTier: 'company_ir',
  validationStatus: 'validated', sourceRef: 'https://investor.tsmc.com/english/quarterly-results/2026/q2',
  factIds: ['issuer-outlook-1'], unit: 'ratio', scenarios: { bear: 0.2, base: 0.3, bull: 0.4 },
};
const options = { symbol: '2330', evaluationAt: '2026-09-11T00:00:00Z' };
function close(left: number, right: number) { assert(Math.abs(left - right) < 1e-9, `${left} != ${right}`); }

test('every projected scenario reconciles revenue through common earnings and diluted EPS', () => {
  const bridge = buildReconciledEarningsProjection(actual);
  assert.equal(bridge.decompositionStatus, 'reconciled_tax_and_minority');
  for (const row of Object.values(bridge.scenarios)) {
    close(row.revenue * row.grossMargin, row.grossProfit);
    close(row.grossProfit - row.operatingExpense, row.operatingIncome);
    close(row.operatingIncome + row.nonOperatingIncome!, row.pretaxIncome!);
    close(row.pretaxIncome! - row.incomeTaxExpense!, row.consolidatedNetIncome!);
    close(row.consolidatedNetIncome! - row.noncontrollingInterest!, row.netIncome);
    close(row.netIncome / row.dilutedShares, row.dilutedEps);
  }
  close(bridge.scenarios.base.netIncome, 176);
  assert(bridge.assumptions.every((row) => row.kind === 'model_assumption' && row.factIds.length > 0));
  assert(bridge.sensitivities.find((row) => row.driver === 'gross_margin')!.dilutedEpsChange > 0);
  assert(bridge.sensitivities.find((row) => row.driver === 'operating_expense_ratio')!.dilutedEpsChange < 0);
  assert(bridge.sensitivities.find((row) => row.driver === 'diluted_share_change')!.dilutedEpsChange < 0);
});

test('missing below-operating disclosures remain a residual, never fabricated zero tax or minority', () => {
  const bridge = buildReconciledEarningsProjection({ ...actual, decomposition: null });
  assert.equal(bridge.decompositionStatus, 'below_operating_residual');
  for (const row of Object.values(bridge.scenarios)) {
    assert.equal(row.incomeTaxExpense, null);
    assert.equal(row.noncontrollingInterest, null);
    assert.equal(row.nonOperatingIncome, null);
    close(row.operatingIncome + row.belowOperatingResidual!, row.netIncome);
  }
  assert(bridge.assumptions.some((row) => row.key === 'below_operating_residual_ratio' && row.basis.includes('not assumed to be zero')));
});

test('only PIT-valid exact-period issuer guidance replaces an assumption and carries its own provenance', () => {
  const bridge = buildReconciledEarningsProjection(actual, { ...options, guidance: [guidance] });
  assert.equal(bridge.companyGuidanceUsed, true);
  close(bridge.scenarios.base.revenue, 1300);
  assert.deepEqual(bridge.assumptions.find((row) => row.key === 'revenue_growth')?.factIds, ['issuer-outlook-1']);
  assert(bridge.factIds.includes('issuer-outlook-1'));
  assert.deepEqual(bridge.forecastPeriod, { start: '2026-07-01', end: '2027-06-30' });
});

test('wrong issuer, future availability, quarterly horizon, unvalidated, non-finite, and reversed outlooks are rejected', () => {
  const changes: Partial<CompanyEarningsGuidance>[] = [
    { issuerSymbol: '2317' }, { availableAt: '2026-09-12T00:00:00Z' }, { periodEnd: '2026-09-30' },
    { validationStatus: 'pending' as 'validated' }, { factIds: [] }, { sourceRef: 'javascript:alert(1)' },
    { scenarios: { bear: 0.2, base: Number.NaN, bull: 0.4 } }, { scenarios: { bear: 0.4, base: 0.3, bull: 0.2 } },
  ];
  const reference = buildReconciledEarningsProjection(actual).scenarios;
  for (const change of changes) {
    const bridge = buildReconciledEarningsProjection(actual, { ...options, guidance: [{ ...guidance, ...change }] });
    assert.equal(bridge.companyGuidanceUsed, false);
    assert.equal(bridge.rejectedGuidance.length, 1);
    assert.deepEqual(bridge.scenarios, reference);
  }
});

test('duplicate guidance cannot be resolved by array order or the more optimistic forecast', () => {
  const conflicting = { ...guidance, scenarios: { bear: 0.3, base: 0.4, bull: 0.5 } };
  const a = buildReconciledEarningsProjection(actual, { ...options, guidance: [guidance, conflicting] });
  const b = buildReconciledEarningsProjection(actual, { ...options, guidance: [conflicting, guidance] });
  assert.equal(a.companyGuidanceUsed, false);
  assert.deepEqual(a, b);
});

test('reported tax benefits or pretax losses do not become an invented forecast tax rate', () => {
  const bridge = buildReconciledEarningsProjection({ ...actual, decomposition: { ...actual.decomposition!, incomeTaxExpense: -20 } });
  assert.equal(bridge.decompositionStatus, 'below_operating_residual');
  assert.equal(bridge.scenarios.base.incomeTaxExpense, null);
});

function reportedFacts(): ReportedFinancialFact[] {
  const keys = { quarterly_revenue: 100, quarterly_gross_profit: 40, quarterly_operating_income: 20,
    quarterly_net_income_attributable_to_common: 16, quarterly_diluted_eps: 1.6, diluted_weighted_average_shares: 10,
    quarterly_operating_expense: 20, quarterly_non_operating_income: 2, quarterly_pretax_income: 22,
    quarterly_income_tax_expense: 4.4, quarterly_net_income: 17.6, quarterly_noncontrolling_interest: 1.6 };
  return Object.entries(keys).flatMap(([factKey, value]) => Array.from({ length: 8 }, (_, index) => {
    const year = 2024 + Math.floor(index / 4), quarter = index % 4;
    const periodEnd = `${year}-${['03-31', '06-30', '09-30', '12-31'][quarter]}`;
    return { factKey, value, factId: `${factKey}-${periodEnd}`, periodStart: `${year}-${['01-01', '04-01', '07-01', '10-01'][quarter]}`,
      periodEnd, unit: 'TWD', sourceRef: `mops:${periodEnd}` };
  }));
}

test('the public bridge exposes reconciled components and rejects accounting contradictions', () => {
  const facts = reportedFacts();
  const bridge = buildForwardEarningsBridge(facts);
  assert.equal(bridge.status, 'complete');
  if (bridge.status !== 'complete') return;
  assert.equal(bridge.decompositionStatus, 'reconciled_tax_and_minority');
  close(bridge.scenarios.base.dilutedEps, 6.4);
  const bad = buildForwardEarningsBridge(facts.map((row) => row.factKey === 'quarterly_income_tax_expense' ? { ...row, value: 2 } : row));
  assert.equal(bad.status, 'insufficient');
  if (bad.status === 'insufficient') assert(bad.missing.includes('reported_pretax_tax_net_income_inconsistent'));
});

test('basic EPS and basic shares never satisfy the diluted bridge contract', () => {
  const bridge = buildForwardEarningsBridge(reportedFacts().map((row) => ({ ...row,
    factKey: row.factKey === 'quarterly_diluted_eps' ? 'quarterly_basic_eps' : row.factKey === 'diluted_weighted_average_shares' ? 'basic_weighted_average_shares' : row.factKey,
  })));
  assert.equal(bridge.status, 'insufficient');
  if (bridge.status === 'insufficient') assert(bridge.missing.includes('quarterly_diluted_eps_8_actual_quarters'));
});

test('offsetting quarterly tax contradictions cannot hide inside a reconciled annual total', () => {
  const bridge = buildForwardEarningsBridge(reportedFacts().map((row) => row.factKey === 'quarterly_income_tax_expense'
    ? { ...row, value: row.periodEnd === '2025-03-31' ? 2.4 : row.periodEnd === '2025-06-30' ? 6.4 : row.value } : row));
  assert.equal(bridge.status, 'insufficient');
  if (bridge.status === 'insufficient') assert(bridge.missing.includes('quarterly_pretax_tax_net_income_inconsistent:2025-03-31'));
});

test('zero or negative diluted shares cannot be hidden inside a positive annual average', () => {
  const bridge = buildForwardEarningsBridge(reportedFacts().map((row) => row.factKey === 'diluted_weighted_average_shares' && row.periodEnd === '2024-03-31'
    ? { ...row, value: -10 } : row));
  assert.deepEqual(bridge, { status: 'insufficient', missing: ['positive_reported_diluted_shares_required'] });
});
