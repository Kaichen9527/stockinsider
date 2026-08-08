'use strict';

const { finite, unavailable } = require('./codec');

// This bridge deliberately has no revenue multiplier or stock-symbol fallback.  A
// target can only be discussed after every point-in-time link to diluted EPS exists.
function buildPointInTimeOperatingBridge(facts) {
  const keys = ['revenue', 'grossProfit', 'operatingIncome', 'pretaxIncome', 'netIncome', 'dilutedShares'];
  const missing = keys.filter((key) => !Number.isFinite(facts?.[key]));
  if (missing.length) return unavailable('missing_bridge_inputs', { missing, status: 'valuation_review', eps: null, targetPrice: null });
  const { revenue, grossProfit, operatingIncome, pretaxIncome, netIncome, dilutedShares } = facts;
  try {
    [revenue, grossProfit, operatingIncome, pretaxIncome, netIncome, dilutedShares].forEach((value, index) => finite(value, keys[index]));
    if (revenue <= 0 || dilutedShares <= 0 || grossProfit > revenue || operatingIncome > grossProfit || pretaxIncome < operatingIncome - Math.abs(revenue * 2)) {
      return unavailable('contradictory_bridge_inputs', { status: 'valuation_review', eps: null, targetPrice: null });
    }
    const eps = netIncome / dilutedShares;
    return Object.freeze({
      availability: 'available', status: 'normal', revenue, grossProfit, operatingIncome, pretaxIncome, netIncome, dilutedShares,
      eps, taxRate: pretaxIncome > 0 ? Math.max(0, Math.min(1, 1 - netIncome / pretaxIncome)) : null,
    });
  } catch {
    return unavailable('contradictory_bridge_inputs', { status: 'valuation_review', eps: null, targetPrice: null });
  }
}

module.exports = { buildPointInTimeOperatingBridge };
