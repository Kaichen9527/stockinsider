import assert from 'node:assert/strict';
import test from 'node:test';
import { calculatePosition, decodeLocalResearchState, emptyLocalResearchState, parseLocalResearchState } from './local-research-state.ts';

test('local research state fails closed on corrupt or future data', () => {
  assert.deepEqual(decodeLocalResearchState('{broken'), emptyLocalResearchState());
  assert.deepEqual(parseLocalResearchState({ version: 99, watchlist: ['2330'] }), emptyLocalResearchState());
});

test('local state removes invalid symbols and does not accept invalid decisions', () => {
  const result = parseLocalResearchState({ version: 1, watchlist: ['2330', 'bad', '2330'], decisions: { bad: { symbol: '2330', revisionId: 'r1', decision: 'buy' } } });
  assert.deepEqual(result.watchlist, ['2330']);
  assert.deepEqual(result.decisions, {});
});

test('local state rejects mismatched record keys', () => {
  const parsed = parseLocalResearchState({
    version: 1,
    simulations: { forged: { symbol: '2330', revisionId: 'r1', entryPrice: 100 } },
    decisions: { '2330:r2': { symbol: '2330', revisionId: 'r1', decision: 'watch' } },
  });
  assert.deepEqual(parsed.simulations, {});
  assert.deepEqual(parsed.decisions, {});
});

test('position calculator separates trade reward/risk from valuation reward/risk', () => {
  assert.deepEqual(calculatePosition({ capital: 100_000, maxLoss: 2_000, entryPrice: 100, stopPrice: 95, baseTarget: 115 }), { shares: 400, exposure: 40_000, riskAmount: 2_000, tradeRewardRisk: 3 });
  assert.equal(calculatePosition({ capital: 100_000, maxLoss: 2_000, entryPrice: 100, stopPrice: 100, baseTarget: 115 }), null);
});
