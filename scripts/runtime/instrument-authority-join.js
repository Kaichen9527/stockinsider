'use strict';

const { invariant } = require('./codec');

function resolveInstrumentAuthorityJoin({ symbol, chineseName = null, roster = [], aliases = [] }) {
  const normalizedSymbol = String(symbol ?? '').trim();
  const bySymbol = roster.filter((row) => row.symbol === normalizedSymbol && row.status === 'active');
  const byAlias = aliases.filter((row) => row.alias === normalizedSymbol && row.status === 'active')
    .map((alias) => roster.find((row) => row.stockId === alias.stockId && row.status === 'active')).filter(Boolean);
  const byName = chineseName === null ? [] : roster.filter((row) => row.officialName === chineseName && row.status === 'active');
  const candidates = [...bySymbol, ...byAlias, ...byName]
    .filter((row, index, all) => all.findIndex((other) => other.stockId === row.stockId) === index);
  if (candidates.length === 0) return { disposition: 'rejected', reason: 'missing_instrument_authority', stockId: null, symbol: null };
  if (candidates.length !== 1) return { disposition: 'rejected', reason: 'ambiguous_symbol', stockId: null, symbol: null };
  const candidate = candidates[0];
  invariant(candidate.symbol === normalizedSymbol || normalizedSymbol === '' || aliases.some((alias) => alias.stockId === candidate.stockId && alias.alias === normalizedSymbol), 'authority join symbol');
  return { disposition: 'linked', reason: null, stockId: candidate.stockId, symbol: candidate.symbol, officialName: candidate.officialName ?? null };
}

module.exports = { resolveInstrumentAuthorityJoin };
