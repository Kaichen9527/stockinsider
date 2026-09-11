import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCandidateValuationInputs } from './candidate-valuation-inputs.ts';
import type { ReportedFinancialFact } from './forward-earnings-bridge.ts';

function date(index: number) {
  const year = 2021 + Math.floor(index / 4);
  return `${year}-${['03-31', '06-30', '09-30', '12-31'][index % 4]}`;
}
function quarterFact(factKey: string, index: number, value: number): ReportedFinancialFact {
  const unit = factKey === 'quarterly_diluted_eps' ? 'TWD_per_share' : factKey.includes('weighted_average_shares') ? 'share' : 'TWD';
  return { factId: `${factKey}-${index}`, factKey, periodStart: `${date(index).slice(0, 4)}-${['01-01', '04-01', '07-01', '10-01'][index % 4]}`, periodEnd: date(index), durationKind: 'quarterly', value, unit, sourceRef: 'official', authorityTier: 'official_filing', provider: 'mops', filingRestatementId: 'v1' };
}
function instantFact(factKey: string, index: number, value: number): ReportedFinancialFact {
  return { factId: `${factKey}-${index}`, factKey, periodStart: null, periodEnd: date(index), durationKind: 'instant', value, unit: 'TWD', sourceRef: 'official', authorityTier: 'official_filing' };
}

function normalizedTriads() {
  return Array.from({ length: 20 }, (_, index) => [quarterFact('quarterly_diluted_eps', index, 1),
    quarterFact('diluted_weighted_average_shares', index, 100_000_000),
    quarterFact('quarterly_net_income_attributable_to_common', index, 100_000_000)]).flat();
}

test('valuation input integration only normalizes reconciled diluted quarters', () => {
  const facts = normalizedTriads();
  const output = buildCandidateValuationInputs(facts);
  assert.equal(output.normalizedCycle.status, 'complete');
  if (output.normalizedCycle.status === 'complete') {
    assert.equal(output.normalizedCycle.normalizedAnnualEps, 4);
    assert.equal(output.normalizedCycle.factIds.length, 60);
    assert.equal(output.normalizedCycle.reconciliationVersion, 'diluted-eps-common-income-v1');
  }
  assert.deepEqual(output.financialPbRoe, { status: 'insufficient', reason: 'common_equity_opening_balance_or_shares_missing' });
});

test('twenty reported or legacy-validated EPS labels cannot bypass missing or contradictory operands', () => {
  for (const key of ['diluted_weighted_average_shares', 'quarterly_net_income_attributable_to_common']) {
    const missing = normalizedTriads().filter((row) => row.factKey !== key);
    assert.equal(buildCandidateValuationInputs(missing).normalizedCycle.status, 'insufficient');
  }
  const fakeValidated = normalizedTriads().map((row) => ({ ...row, validation_status: 'validated',
    consistency_valid: true, value: row.factKey === 'quarterly_diluted_eps' ? 100 : row.value }));
  assert.equal(buildCandidateValuationInputs(fakeValidated).normalizedCycle.status, 'insufficient');
  const singleMissing = normalizedTriads().filter((row) => row.factId !== 'diluted_weighted_average_shares-10');
  assert.equal(buildCandidateValuationInputs(singleMissing).normalizedCycle.status, 'insufficient');
});

test('normalized identities require the same discrete period, provider, restatement and units', () => {
  for (const patch of [
    { provider: 'twse' }, { authorityTier: 'mirror' }, { filingRestatementId: 'another-filing' },
    { periodStart: '2023-01-01' }, { periodEnd: '2023-03-31' }, { durationKind: 'instant' as const },
    { unit: 'TWD_thousand' },
  ]) {
    const mixed = normalizedTriads().map((row) => row.factId === 'quarterly_net_income_attributable_to_common-10'
      ? { ...row, ...patch } : row);
    assert.equal(buildCandidateValuationInputs(mixed).normalizedCycle.status, 'insufficient');
  }
  const wrongDenominator = normalizedTriads().map((row) => row.factKey === 'diluted_weighted_average_shares'
    ? { ...row, factKey: 'basic_weighted_average_shares' } : row);
  assert.equal(buildCandidateValuationInputs(wrongDenominator).normalizedCycle.status, 'insufficient');
});

test('a conflicting duplicate cannot choose a favorable restatement or shift to an older window', () => {
  const facts = normalizedTriads();
  const conflict = { ...facts.find((row) => row.factId === 'quarterly_net_income_attributable_to_common-10')!,
    factId: 'conflicting-income', filingRestatementId: 'another', value: 50_000_000 };
  assert.equal(buildCandidateValuationInputs([...facts, conflict]).normalizedCycle.status, 'insufficient');
  assert.equal(buildCandidateValuationInputs([...facts, conflict].reverse()).normalizedCycle.status, 'insufficient');
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
