'use strict';

const { unavailable } = require('./codec');

const METHODS = Object.freeze(['pe', 'normalized_pe', 'ev_ebitda', 'pb_roe', 'residual_income', 'nav', 'ev_sales']);
const CYCLICAL_SECTORS = Object.freeze(new Set([
  'semiconductor','steel','shipping_transport','plastics','chemical','cement','paper_pulp',
  'glass_ceramic','rubber','oil_gas_electricity',
]));

function selectSectorValuationMethod({ sector, netIncome, ebitda, revenue, grossProfit, bookValue, nav,
  dilutedShares, depreciationAmortization, roe, roeHistory = [], cycleHistory = [], crossCheck = null }) {
  let method;
  if (sector === 'finance_insurance' && bookValue > 0 && roeHistory.length >= 8
    && roeHistory.slice(-8).every(Number.isFinite)) method = 'residual_income';
  else if (sector === 'finance_insurance' && bookValue > 0 && roe > 0) method = 'pb_roe';
  else if (sector === 'construction' && nav > 0 && dilutedShares > 0) method = 'nav';
  else if (CYCLICAL_SECTORS.has(sector) && cycleHistory.length >= 12
    && cycleHistory.slice(-12).every(Number.isFinite)
    && cycleHistory.slice(-12).reduce((sum,value)=>sum+value,0) / 12 > 0) method = 'normalized_pe';
  else if (netIncome > 0 && revenue > 0 && Number.isFinite(depreciationAmortization)
    && depreciationAmortization / revenue < 0.08) method = 'pe';
  else if (ebitda > 0) method = 'ev_ebitda';
  else if (!(netIncome > 0) && !(ebitda > 0) && revenue > 0 && grossProfit > 0) method = 'ev_sales';
  else method = null;
  if (!method) return unavailable('missing_valuation_method', { status: 'valuation_review', method: null });
  if (method === 'normalized_pe' && cycleHistory.length < 12) return unavailable('insufficient_series', { status: 'valuation_review', method: null });
  return Object.freeze({ availability: 'available', status: 'normal', method, methods: METHODS });
}

module.exports = { CYCLICAL_SECTORS, METHODS, selectSectorValuationMethod };
