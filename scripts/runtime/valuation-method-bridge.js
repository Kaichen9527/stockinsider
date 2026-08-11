'use strict';

const { unavailable } = require('./codec');
const { buildPointInTimeOperatingBridge } = require('./valuation-operating-bridge');

function available(method, values) {
  return Object.freeze({ availability: 'available', status: 'normal', method, ...values });
}

function requireFinite(facts, keys, method) {
  const missing = keys.filter((key) => !Number.isFinite(facts?.[key]));
  return missing.length ? unavailable('missing_method_bridge_inputs', { method, missing, status: 'valuation_review' }) : null;
}

function buildMethodSpecificValuationBridge(method, facts = {}) {
  if (method === 'pe' || method === 'normalized_pe') {
    return buildPointInTimeOperatingBridge(facts);
  }
  if (method === 'ev_sales' || method === 'ev_ebitda') {
    const operatingKey = method === 'ev_sales' ? 'revenue' : 'ebitda';
    const missing = requireFinite(facts, [operatingKey, 'dilutedShares'], method);
    if (missing) return missing;
    const netDebt = Number.isFinite(facts.netDebt) ? facts.netDebt
      : Number.isFinite(facts.totalDebt) && Number.isFinite(facts.cash) ? facts.totalDebt - facts.cash : null;
    if (!Number.isFinite(netDebt)) return unavailable('missing_method_bridge_inputs', {
      method, missing: ['netDebt|totalDebt+cash'], status: 'valuation_review',
    });
    if (!(facts[operatingKey] > 0 && facts.dilutedShares > 0)) {
      return unavailable('contradictory_bridge_inputs', { method, status: 'valuation_review' });
    }
    return available(method, { [operatingKey]: facts[operatingKey], dilutedShares: facts.dilutedShares, netDebt, eps: null });
  }
  if (method === 'pb_roe' || method === 'residual_income') {
    const missing = requireFinite(facts, ['bookValue', 'roe'], method);
    if (missing) return missing;
    if (!(facts.bookValue > 0) || !(facts.roe > 0)) {
      return unavailable('contradictory_bridge_inputs', { method, status: 'valuation_review' });
    }
    return available(method, { bookValue: facts.bookValue, roe: facts.roe, eps: null });
  }
  if (method === 'nav') {
    const missing = requireFinite(facts, ['nav','dilutedShares'], method);
    if (missing) return missing;
    if (!(facts.nav > 0) || !(facts.dilutedShares > 0)) return unavailable('contradictory_bridge_inputs', { method, status: 'valuation_review' });
    return available(method, { nav: facts.nav,dilutedShares:facts.dilutedShares, eps: null });
  }
  return unavailable('missing_valuation_method', { method: null, status: 'valuation_review' });
}

module.exports = { buildMethodSpecificValuationBridge };
