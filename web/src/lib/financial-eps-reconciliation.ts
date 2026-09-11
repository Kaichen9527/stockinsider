/** Frozen accounting tolerance, not a valuation-model or forecast assumption. */
export const DILUTED_EPS_RECONCILIATION_VERSION = 'diluted-eps-common-income-v1';

export function reconcileDilutedEpsToCommonIncome(input: {
  dilutedEps: number;
  dilutedShares: number;
  commonNetIncome: number;
}) {
  const { dilutedEps, dilutedShares, commonNetIncome } = input;
  const impliedIncome = dilutedEps * dilutedShares;
  if (![dilutedEps, dilutedShares, commonNetIncome, impliedIncome].every(Number.isFinite) || dilutedShares <= 0) {
    return { reconciled: false, difference: null, tolerance: null, version: DILUTED_EPS_RECONCILIATION_VERSION };
  }
  // Official EPS is commonly rounded to two decimal places. Allow that half
  // cent per share, the existing TWD 2,000 floor, or 0.5% of common income.
  const tolerance = Math.max(2_000, Math.abs(commonNetIncome) * 0.005, dilutedShares * 0.005);
  const difference = Math.abs(impliedIncome - commonNetIncome);
  const floatSlack = Number.EPSILON * Math.max(1, Math.abs(impliedIncome), Math.abs(commonNetIncome)) * 4;
  return { reconciled: difference <= tolerance + floatSlack, difference, tolerance,
    version: DILUTED_EPS_RECONCILIATION_VERSION };
}
