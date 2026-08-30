import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRelatedStockSymbols } from './stock-symbol.ts';

test('stock UUID is resolved through provenance map and never rendered as a symbol', () => {
  const stockId = 'e2f247e3-e32a-4f2f-ae6f-2f1345405c55';
  assert.deepEqual(normalizeRelatedStockSymbols([stockId, '2330'], new Map([[stockId, '2454']])), ['2454', '2330']);
  assert.deepEqual(normalizeRelatedStockSymbols([stockId]), []);
});
