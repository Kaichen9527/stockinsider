'use strict';

const { finite, unavailable } = require('./codec');

// This bridge deliberately has no revenue multiplier or stock-symbol fallback.  A
// target can only be discussed after every point-in-time link to diluted EPS exists.
function buildPointInTimeOperatingBridge(facts) {
  const completeOfficial = facts?.periodReadiness === 'ttm_from_four_official_quarters';
  const keys = completeOfficial ? ['revenue', 'grossProfit', 'operatingIncome', 'nonOperatingIncome', 'pretaxIncome',
    'incomeTaxExpense', 'totalNetIncome', 'netIncome', 'dilutedShares'] :
    ['revenue', 'grossProfit', 'operatingIncome', 'pretaxIncome', 'netIncome', 'dilutedShares'];
  const missing = keys.filter((key) => !Number.isFinite(facts?.[key]));
  if (missing.length) return unavailable('missing_bridge_inputs', { missing, status: 'valuation_review', eps: null, targetPrice: null });
  const { revenue, grossProfit, operatingIncome, nonOperatingIncome, pretaxIncome, incomeTaxExpense,
    totalNetIncome, netIncome, dilutedShares, cash, totalDebt, totalAssets, totalEquity, bookValue } = facts;
  try {
    keys.forEach((key) => finite(facts[key], key));
    if (revenue <= 0 || dilutedShares <= 0 || grossProfit > revenue || operatingIncome > grossProfit || pretaxIncome < operatingIncome - Math.abs(revenue * 2)) {
      return unavailable('contradictory_bridge_inputs', { status: 'valuation_review', eps: null, targetPrice: null });
    }
    const tolerance = Math.max(1, Math.abs(revenue) * 0.02);
    const capitalInputs=[cash,totalDebt,totalAssets,totalEquity,bookValue];
    const completeCapital=capitalInputs.every(Number.isFinite);
    if (completeOfficial && (Math.abs(operatingIncome + nonOperatingIncome - pretaxIncome) > tolerance
      || Math.abs(pretaxIncome - incomeTaxExpense - totalNetIncome) > tolerance
      || Math.abs(netIncome) > Math.abs(totalNetIncome) + tolerance
      || completeCapital&&(totalAssets + tolerance < totalEquity
        || totalAssets + tolerance < cash || bookValue <= 0 || totalDebt < 0))) {
      return unavailable('accounting_reconciliation_conflict', { status: 'valuation_review', eps: null, targetPrice: null });
    }
    const eps = netIncome / dilutedShares;
    return Object.freeze({
      availability: 'available', status: 'normal', revenue, grossProfit, operatingIncome, pretaxIncome, netIncome, dilutedShares,
      nonOperatingIncome,incomeTaxExpense,totalNetIncome,cash,totalDebt,totalAssets,totalEquity,bookValue,
      eps, taxRate: pretaxIncome > 0 ? Math.max(0, Math.min(1, completeOfficial
        ? incomeTaxExpense / pretaxIncome : 1 - netIncome / pretaxIncome)) : null,
    });
  } catch {
    return unavailable('contradictory_bridge_inputs', { status: 'valuation_review', eps: null, targetPrice: null });
  }
}

module.exports = { buildPointInTimeOperatingBridge };
