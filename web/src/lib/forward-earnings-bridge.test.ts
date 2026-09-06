import assert from 'node:assert/strict';
import test from 'node:test';
import { buildForwardEarningsBridge, discreteReportedQuarters, type ReportedFinancialFact } from './forward-earnings-bridge.ts';

function fact(factKey: string, year: number, quarter: number, value: number, discrete = false): ReportedFinancialFact {
  const end = [`${year}-03-31`, `${year}-06-30`, `${year}-09-30`, `${year}-12-31`][quarter - 1];
  const start = [`${year}-01-01`, `${year}-04-01`, `${year}-07-01`, `${year}-10-01`][quarter - 1];
  return { factId: `${factKey}-${end}`, factKey, periodStart: discrete ? start : `${year}-01-01`, periodEnd: end, value, unit: 'TWD', sourceRef: `mops:${end}` };
}

test('MOPS year-to-date rows are de-cumulated into discrete quarters', () => {
  const rows = discreteReportedQuarters([
    fact('quarterly_revenue', 2025, 1, 100), fact('quarterly_revenue', 2025, 2, 230),
    fact('quarterly_revenue', 2025, 3, 390), fact('quarterly_revenue', 2025, 4, 600),
  ], 'quarterly_revenue');
  assert.deepEqual(rows.map((row) => row.value), [100, 130, 160, 210]);
});

test('a direct quarter and its YTD comparator coexist only when their algebra reconciles', () => {
  const rows = discreteReportedQuarters([
    fact('quarterly_revenue', 2025, 1, 100), fact('quarterly_revenue', 2025, 2, 230),
    { ...fact('quarterly_revenue', 2025, 2, 130, true), factId: 'direct-q2' },
  ], 'quarterly_revenue');
  assert.deepEqual(rows.map((row) => row.value), [100, 130]);
});

test('forward bridge is explicit, reproducible, and separates assumptions from reported facts', () => {
  const facts: ReportedFinancialFact[] = [];
  const metrics = {
    quarterly_revenue: [100, 210, 330, 460, 125, 260, 405, 560],
    quarterly_gross_profit: [40, 84, 132, 184, 50, 104, 162, 224],
    quarterly_operating_income: [20, 42, 66, 92, 25, 52, 81, 112],
    quarterly_net_income_attributable_to_common: [16, 34, 54, 76, 20, 42, 66, 92],
    quarterly_diluted_eps: [1.6, 1.8, 2, 2.2, 2, 2.2, 2.4, 2.6],
    diluted_weighted_average_shares: [10, 10, 10, 10, 10, 10, 10, 10],
  };
  for (const [key, values] of Object.entries(metrics)) {
    values.forEach((value, index) => facts.push(fact(key, index < 4 ? 2024 : 2025, index % 4 + 1, value, key.includes('eps') || key.includes('shares'))));
  }
  const bridge = buildForwardEarningsBridge(facts);
  assert.equal(bridge.status, 'complete');
  if (bridge.status !== 'complete') return;
  assert.ok(bridge.scenarios.bear.dilutedEps < bridge.scenarios.base.dilutedEps);
  assert.ok(bridge.scenarios.base.dilutedEps < bridge.scenarios.bull.dilutedEps);
  assert.equal(bridge.assumptions.every((row) => row.kind === 'model_assumption'), true);
  assert.ok(bridge.factIds.length >= 40);
});

test('YTD EPS and weighted-average shares are never subtracted as additive flows', () => {
  const eps = discreteReportedQuarters([
    fact('quarterly_diluted_eps', 2025, 1, 1), fact('quarterly_diluted_eps', 2025, 2, 3),
  ], 'quarterly_diluted_eps');
  assert.deepEqual(eps.map((row) => row.value), [1]);
  const basic = discreteReportedQuarters([
    fact('quarterly_basic_eps', 2025, 1, 1.2), fact('quarterly_basic_eps', 2025, 2, 3.5),
  ], 'quarterly_basic_eps');
  assert.deepEqual(basic.map((row) => row.value), [1.2]);
  const shares = discreteReportedQuarters([
    fact('diluted_weighted_average_shares', 2025, 1, 100, true), fact('diluted_weighted_average_shares', 2025, 2, 105, true),
  ], 'diluted_weighted_average_shares');
  assert.deepEqual(shares.map((row) => row.value), [100, 105]);
});

test('restatement conflicts fail closed', () => {
  const conflicting: ReportedFinancialFact[] = [
    fact('quarterly_revenue', 2025, 1, 100),
    { ...fact('quarterly_revenue', 2025, 1, 101), factId: 'restated-q1', filingRestatementId: 'mops:changed' },
  ];
  assert.deepEqual(discreteReportedQuarters(conflicting, 'quarterly_revenue'), []);
  assert.equal(buildForwardEarningsBridge(conflicting).status, 'insufficient');
});

test('missing eight-quarter bridge inputs fail closed', () => {
  assert.deepEqual(buildForwardEarningsBridge([fact('quarterly_revenue', 2025, 1, 100)]), {
    status: 'insufficient',
    missing: [
      'diluted_weighted_average_shares_8_actual_quarters', 'quarterly_diluted_eps_8_actual_quarters',
      'quarterly_gross_profit_8_discrete_quarters', 'quarterly_net_income_attributable_to_common_8_discrete_quarters',
      'quarterly_operating_income_8_discrete_quarters', 'quarterly_revenue_8_discrete_quarters',
    ],
  });
});
