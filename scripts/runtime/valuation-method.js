'use strict';

const { unavailable } = require('./codec');

const METHODS = Object.freeze(['pe', 'normalized_pe', 'ev_ebitda', 'pb_roe', 'residual_income', 'nav', 'ev_sales']);

function selectSectorValuationMethod({ sector, netIncome, ebitda, revenue, bookValue, nav, cycleHistory = [], crossCheck = null }) {
  let method;
  if (sector === 'financial' || sector === 'finance_insurance') method = Number.isFinite(bookValue) ? (Number.isFinite(netIncome) && netIncome > 0 ? 'residual_income' : 'pb_roe') : null;
  else if (sector === 'asset') method = Number.isFinite(nav) ? 'nav' : null;
  else if (netIncome > 0 && sector === 'semiconductor') method = 'normalized_pe';
  else if (netIncome > 0) method = 'pe';
  else if (ebitda > 0) method = 'ev_ebitda';
  else if (revenue > 0) method = 'ev_sales';
  else method = null;
  if (!method) return unavailable('missing_valuation_method', { status: 'valuation_review', method: null });
  if (method === 'normalized_pe' && cycleHistory.length < 12) return unavailable('insufficient_series', { status: 'valuation_review', method: null });
  if (method === 'normalized_pe' && (!crossCheck || !Number.isFinite(crossCheck.primary) || !Number.isFinite(crossCheck.secondary))) {
    return unavailable('cross_check_unavailable', { status: 'valuation_review', method: null });
  }
  if (crossCheck && Number.isFinite(crossCheck.primary) && Number.isFinite(crossCheck.secondary)) {
    const divergence = Math.abs(crossCheck.primary - crossCheck.secondary) / Math.max(Math.abs(crossCheck.primary), Math.abs(crossCheck.secondary), 1);
    if (divergence > 0.35) return unavailable('method_divergence', { status: 'valuation_review', method: null, divergence });
  }
  return Object.freeze({ availability: 'available', status: 'normal', method, methods: METHODS });
}

module.exports = { METHODS, selectSectorValuationMethod };
