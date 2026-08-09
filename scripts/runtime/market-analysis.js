'use strict';

const { bounded, invariant } = require('./codec');

function buildMarketAnalysis(input) {
  invariant(input && typeof input.asOf === 'string' && Number.isFinite(Date.parse(input.asOf)), 'market analysis as-of');
  const components = ['taiex', 'otc', 'breadth', 'foreignFlow'];
  const cutoff=Date.parse(input.asOf); const fresh=(value)=>value&&typeof value==='object'
    && typeof (value.session??value.asOf)==='string'&&Number.isFinite(Date.parse(`${String(value.session??value.asOf).slice(0,10)}T00:00:00Z`))
    && cutoff-Date.parse(`${String(value.session??value.asOf).slice(0,10)}T00:00:00Z`)>=0
    && cutoff-Date.parse(`${String(value.session??value.asOf).slice(0,10)}T00:00:00Z`)<=10*86400000;
  const normalized=Object.fromEntries(components.map((key)=>[key,fresh(input[key])?input[key]:null]));
  const present = components.filter((key) => normalized[key]);
  const completeness = present.length / components.length;
  const status = completeness < 1 ? 'data_incomplete'
    : normalized.taiex.state === 'uptrend' && normalized.otc.state === 'uptrend' && normalized.breadth.aboveMa20Pct >= 50
      && (normalized.foreignFlow.net5d ?? normalized.foreignFlow.net1d) >= 0 ? 'risk_on' : 'selective_or_defensive';
  const summary = [
    normalized.taiex ? `加權：${normalized.taiex.state}${Number.isFinite(normalized.taiex.drawdownPct) ? `（回落 ${Math.abs(normalized.taiex.drawdownPct)}%）` : ''}` : '加權：資料待補或過期',
    normalized.otc ? `櫃買：${normalized.otc.state}${Number.isFinite(normalized.otc.drawdownPct) ? `（回落 ${Math.abs(normalized.otc.drawdownPct)}%）` : ''}` : '櫃買：資料待補或過期',
    normalized.breadth ? `市場廣度：MA20 之上 ${normalized.breadth.aboveMa20Pct}%` : '市場廣度：資料待補或過期',
    normalized.foreignFlow ? `外資${Number.isFinite(normalized.foreignFlow.net5d) ? '五日' : '單日'}：${normalized.foreignFlow.net5d ?? normalized.foreignFlow.net1d}` : '外資：資料待補或過期',
  ].join('；');
  const result = {
    asOf: new Date(input.asOf).toISOString().replace('.000Z', 'Z'),
    status,
    completeness,
    riskBudget: completeness < 1 ? null : status === 'risk_on' ? '單一新倉上限 5%，總新倉上限 15%' : '只追蹤確認型機會；新倉總額上限 5%',
    summary,
    components: normalized,
    missingComponents: components.filter((key) => !present.includes(key)),
  };
  bounded(result, 5000, 'market analysis');
  return Object.freeze(result);
}

module.exports = { buildMarketAnalysis };
