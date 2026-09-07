import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidateValuationInputs } from './candidate-valuation-inputs.ts';
import type { ReportedFinancialFact } from './forward-earnings-bridge.ts';

function date(index: number) {
  const year = 2021 + Math.floor(index / 4);
  return `${year}-${['03-31', '06-30', '09-30', '12-31'][index % 4]}`;
}
function quarterFact(factKey: string, index: number, value: number): ReportedFinancialFact {
  return { factId: `${factKey}-${index}`, factKey, periodStart: `${date(index).slice(0, 4)}-${['01-01', '04-01', '07-01', '10-01'][index % 4]}`, periodEnd: date(index), durationKind: 'quarterly', value, unit: 'TWD', sourceRef: 'official', authorityTier: 'official_filing' };
}
function instantFact(factKey: string, index: number, value: number): ReportedFinancialFact {
  return { factId: `${factKey}-${index}`, factKey, periodStart: null, periodEnd: date(index), durationKind: 'instant', value, unit: 'TWD', sourceRef: 'official', authorityTier: 'official_filing' };
}

test('valuation input integration only normalizes reconciled diluted quarters', () => {
  const facts = Array.from({ length: 20 }, (_, index) => quarterFact('quarterly_diluted_eps', index, 1));
  const output = buildCandidateValuationInputs(facts);
  assert.equal(output.normalizedCycle.status, 'complete');
  if (output.normalizedCycle.status === 'complete') assert.equal(output.normalizedCycle.normalizedAnnualEps, 4);
  assert.deepEqual(output.financialPbRoe, { status: 'insufficient', reason: 'common_equity_opening_balance_or_shares_missing' });
});

test('financial PB/ROE requires common equity, opening balances and common shares—not total equity', () => {
  const facts: ReportedFinancialFact[] = [];
  for (let index = 0; index < 9; index += 1) facts.push(instantFact('common_equity_attributable_to_owners', index, 100 + index * 10));
  for (let index = 1; index < 9; index += 1) {
    facts.push(quarterFact('quarterly_net_income_attributable_to_common', index, 10));
    facts.push(instantFact('common_shares_outstanding', index, 10));
  }
  const complete = buildCandidateValuationInputs(facts).financialPbRoe;
  assert.equal(complete.status, 'complete');
  if (complete.status === 'complete') assert.equal(complete.bookValuePerShare, 18);

  const totalEquityOnly = facts.filter((fact) => fact.factKey !== 'common_equity_attributable_to_owners').concat(
    Array.from({ length: 9 }, (_, index) => instantFact('total_equity', index, 100 + index * 10)),
  );
  assert.deepEqual(buildCandidateValuationInputs(totalEquityOnly).financialPbRoe, { status: 'insufficient', reason: 'common_equity_opening_balance_or_shares_missing' });
});

test('financial PB/ROE may derive common shares only from matching common equity and reported BVPS', () => {
  const facts: ReportedFinancialFact[] = [];
  for (let index = 0; index < 9; index += 1) {
    facts.push(instantFact('common_equity_attributable_to_owners', index, 100 + index * 10));
    facts.push(instantFact('book_value_per_share', index, (100 + index * 10) / 10));
  }
  for (let index = 1; index < 9; index += 1) facts.push(quarterFact('quarterly_net_income_attributable_to_common', index, 10));
  const result = buildCandidateValuationInputs(facts).financialPbRoe;
  assert.equal(result.status, 'complete');
  if (result.status === 'complete') assert.equal(result.bookValuePerShare, 18);
});
