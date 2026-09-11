import { buildFinancialPbRoeInputs, buildNormalizedCycleEarnings } from './candidate-financial-normalization.ts';
import { discreteReportedQuarters, type ReportedFinancialFact } from './forward-earnings-bridge.ts';
import { DILUTED_EPS_RECONCILIATION_VERSION, reconcileDilutedEpsToCommonIncome } from './financial-eps-reconciliation.ts';

type InstantPoint = { periodEnd: string; value: number; factIds: string[] };

function instantSeries(facts: ReportedFinancialFact[], factKey: string): InstantPoint[] {
  const byPeriod = new Map<string, ReportedFinancialFact[]>();
  for (const fact of facts) {
    if (fact.factKey !== factKey || !['instant', 'quarter_end'].includes(fact.durationKind || '')
      || fact.periodStart !== null || !Number.isFinite(fact.value)) continue;
    byPeriod.set(fact.periodEnd, [...(byPeriod.get(fact.periodEnd) || []), fact]);
  }
  return [...byPeriod.entries()].flatMap(([periodEnd, rows]) => {
    const values = [...new Set(rows.map((row) => row.value))];
    return values.length === 1 ? [{ periodEnd, value: values[0], factIds: rows.map((row) => row.factId) }] : [];
  }).sort((left, right) => left.periodEnd.localeCompare(right.periodEnd));
}

function priorQuarterEnd(periodEnd: string) {
  const match = periodEnd.match(/^(\d{4})-(03|06|09|12)-\d{2}$/u);
  if (!match) return null;
  const year = Number(match[1]);
  const month = match[2];
  if (month === '03') return `${year - 1}-12-31`;
  return ({ '06': `${year}-03-31`, '09': `${year}-06-30`, '12': `${year}-09-30` } as Record<string, string>)[month];
}

export function buildCandidateValuationInputs(facts: ReportedFinancialFact[]) {
  const triadKeys = ['quarterly_diluted_eps', 'diluted_weighted_average_shares', 'quarterly_net_income_attributable_to_common'];
  const expectedUnits = ['TWD_per_share', 'share', 'TWD'];
  const reportedTriad = facts.filter((fact) => fact.durationKind === 'quarterly'
    && triadKeys.includes(fact.factKey) && fact.unit === expectedUnits[triadKeys.indexOf(fact.factKey)]);
  const dilutedEps = discreteReportedQuarters(reportedTriad, triadKeys[0]).slice(-20);
  const dilutedShares = new Map(discreteReportedQuarters(reportedTriad, triadKeys[1]).map((point) => [point.periodEnd, point]));
  const commonQuarterIncome = new Map(discreteReportedQuarters(reportedTriad, triadKeys[2]).map((point) => [point.periodEnd, point]));
  const reconciledQuarters = dilutedEps.flatMap((point) => {
    const shares = dilutedShares.get(point.periodEnd);
    const income = commonQuarterIncome.get(point.periodEnd);
    if (!shares || !income || !reconcileDilutedEpsToCommonIncome({ dilutedEps: point.value,
      dilutedShares: shares.value, commonNetIncome: income.value }).reconciled) return [];
    // A prior `validated` label is not evidence of this identity. Require the
    // actual reported triad in one exact discrete context; neither YTD values
    // nor another provider/restatement may fill a missing operand.
    const quarterStart = `${point.periodEnd.slice(0, 4)}-${['01', '04', '07', '10'][Math.floor((Number(point.periodEnd.slice(5, 7)) - 1) / 3)]}-01`;
    const contexts = new Map<string, ReportedFinancialFact[]>();
    for (const row of reportedTriad.filter((row) => row.periodEnd === point.periodEnd && row.periodStart === quarterStart)) {
      const identity = JSON.stringify([row.provider ?? null, row.authorityTier ?? null, row.filingRestatementId ?? null]);
      contexts.set(identity, [...(contexts.get(identity) ?? []), row]);
    }
    const expected = [point.value, shares.value, income.value];
    const complete = [...contexts.values()].filter((rows) => triadKeys.every((key, index) => {
      const values = [...new Set(rows.filter((row) => row.factKey === key).map((row) => row.value))];
      return values.length === 1 && values[0] === expected[index];
    }));
    return complete.length === 0 ? [] : [{ periodEnd: point.periodEnd, dilutedEps: point.value,
      factIds: [...new Set(complete.flat().map((row) => row.factId))] }];
  });
  const normalizedCycle = { ...(reconciledQuarters.length !== dilutedEps.length
    ? { status: 'insufficient' as const, reason: 'twenty_reconciled_discrete_quarters_required' as const }
    : buildNormalizedCycleEarnings(reconciledQuarters)),
  reconciliationVersion: DILUTED_EPS_RECONCILIATION_VERSION };

  const commonIncome = discreteReportedQuarters(facts, 'quarterly_net_income_attributable_to_common').slice(-8);
  const equityByPeriod = new Map(instantSeries(facts, 'common_equity_attributable_to_owners').map((point) => [point.periodEnd, point]));
  const sharesByPeriod = new Map(instantSeries(facts, 'common_shares_outstanding').map((point) => [point.periodEnd, point]));
  const bookValueByPeriod = new Map(instantSeries(facts, 'book_value_per_share').map((point) => [point.periodEnd, point]));
  const financialRows = commonIncome.flatMap((income) => {
    const ending = equityByPeriod.get(income.periodEnd);
    const beginning = equityByPeriod.get(priorQuarterEnd(income.periodEnd) || '');
    const reportedShares = sharesByPeriod.get(income.periodEnd);
    const bookValue = bookValueByPeriod.get(income.periodEnd);
    const derivedShares = !reportedShares && ending && bookValue && bookValue.value > 0
      ? { periodEnd: income.periodEnd, value: ending.value / bookValue.value, factIds: [...ending.factIds, ...bookValue.factIds] }
      : null;
    const shares = reportedShares || derivedShares;
    return ending && beginning && shares ? [{
      periodEnd: income.periodEnd,
      commonNetIncome: income.value,
      beginningCommonEquity: beginning.value,
      endingCommonEquity: ending.value,
      commonSharesOutstanding: shares.value,
      factIds: [...new Set([...income.factIds, ...beginning.factIds, ...ending.factIds, ...shares.factIds])],
    }] : [];
  });
  // Do not pad a partially joined series: the builder must see the exact
  // continuous window and fail closed if an opening balance or common-share
  // disclosure is missing.
  const financialPbRoe = commonIncome.length === 8 && financialRows.length === commonIncome.length
    ? buildFinancialPbRoeInputs(financialRows)
    : { status: 'insufficient' as const, reason: 'common_equity_opening_balance_or_shares_missing' as const };

  return { normalizedCycle, financialPbRoe };
}
