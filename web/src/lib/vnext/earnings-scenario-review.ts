import { calculateEarningsBridge, type EarningsBridgeInput } from './earnings-bridge.ts';
import { inputHash, taipeiDate } from './policy.ts';

const caseNames = ['bear', 'base', 'bull'] as const;
type CaseName = (typeof caseNames)[number];
export type EarningsScenarioReviewInput = Omit<EarningsBridgeInput, 'operands' | 'classification'> & {
  schemaVersion: 'vnext-earnings-scenario-input-v1';
  cases: Record<CaseName, EarningsBridgeInput['operands']>;
};

type Bridge = ReturnType<typeof calculateEarningsBridge>;

function priceFraction(bridge: Bridge) {
  if (!bridge.valuation || !bridge.eps || !bridge.receipts.peMultiple) return null;
  return {
    numerator: BigInt(bridge.eps.numeratorTwd) * BigInt(bridge.receipts.peMultiple.value),
    shares: BigInt(bridge.eps.denominatorShares),
    displayTwd: bridge.valuation.targetPriceTwd,
  };
}

function ordered(left: NonNullable<ReturnType<typeof priceFraction>>, right: NonNullable<ReturnType<typeof priceFraction>>) {
  return left.numerator * right.shares <= right.numerator * left.shares;
}

/** A private handoff for a separate reviewer. A complete calculation neither
 * approves its assumptions nor grants permission to persist or publish it. */
export function buildEarningsScenarioReview(input: EarningsScenarioReviewInput) {
  if (input?.schemaVersion !== 'vnext-earnings-scenario-input-v1' || !input.cases ||
      typeof input.cases !== 'object' || Array.isArray(input.cases) ||
      Object.keys(input.cases).length !== caseNames.length ||
      !caseNames.every(name => Object.hasOwn(input.cases, name))) {
    throw Error('vnext_earnings_scenario_exact_case_set_required');
  }
  const { symbol, periodStart, periodEnd, periodKind, shareBasis, cutoff } = input;
  const scope = { symbol, periodStart, periodEnd, periodKind, shareBasis, cutoff };
  const calculate = (name: CaseName) => calculateEarningsBridge({
    ...scope, classification: 'modeled_scenario', operands: input.cases[name],
  });
  const scenarios = { bear: calculate('bear'), base: calculate('base'), bull: calculate('bull') };
  const cutoffDay = taipeiDate(cutoff);
  const gaps: string[] = [];
  if (periodEnd < cutoffDay) gaps.push('model_period_ended');
  if (periodKind === 'next_four_quarters') {
    const earliestCutoff = new Date(periodStart + 'T00:00:00Z');
    earliestCutoff.setUTCMonth(earliestCutoff.getUTCMonth() - 3);
    if (periodStart <= cutoffDay || cutoffDay < earliestCutoff.toISOString().slice(0, 10)) {
      gaps.push('not_next_wholly_future_four_quarters');
    }
  }

  for (const name of caseNames) {
    const bridge = scenarios[name];
    gaps.push(...bridge.missing.map(operand => name + ':missing:' + operand));
    if (bridge.valuationGap !== null) gaps.push(name + ':' + bridge.valuationGap);
  }
  const bear = priceFraction(scenarios.bear);
  const base = priceFraction(scenarios.base);
  const bull = priceFraction(scenarios.bull);
  if (bear && base && bull && (!ordered(bear, base) || !ordered(base, bull))) {
    gaps.push('scenario_prices_unordered');
  }

  if ([bear, base, bull].some(price => price?.displayTwd === '0.00')) {
    gaps.push('scenario_display_price_nonpositive');
  }

  const packet = {
    schemaVersion: 'vnext-earnings-scenario-review-v1' as const,
    reviewState: 'pending' as const,
    ...scope,
    scenarios,
    gaps,
    scenarioPricesTwd: !gaps.length && bear && base && bull
      ? { bear: bear.displayTwd, base: base.displayTwd, bull: bull.displayTwd }
      : null,
  };
  return { ...packet, calculationHash: inputHash(packet) };
}
