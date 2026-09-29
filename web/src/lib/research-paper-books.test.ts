import assert from 'node:assert/strict';
import test from 'node:test';
import { fillPaperOrder, markPaperPositions, newPaperBook, sizePaperOrder, type PaperOrder } from './research-paper-books.ts';

const hash = 'a'.repeat(64);
const order: PaperOrder = {
  symbol: '2409', sector: 'electronics', strategyVersion: 'approved-v1',
  signalSession: '2026-09-22', executionSession: '2026-09-23',
  entryLower: 30, entryUpper: 31, stopPrice: 28,
  technicalSnapshotEligible: true, thesisQualified: true, liquidityVerified: true,
  approvedCodeHash: hash, expectedCodeHash: hash,
};
const bar = { symbol: '2409', session: '2026-09-23', open: 30.5,
  high: 31.2, low: 29.8, close: 30.9, officialFinal: true };

test('two separately funded books enforce their risk and exposure caps', () => {
  const conservative = sizePaperOrder({ book: newPaperBook('conservative'), order, markPrices: {} });
  const growth = sizePaperOrder({ book: newPaperBook('growth'), order, markPrices: {} });
  assert.equal(conservative.shares, 1666);
  assert.equal(growth.shares, 3333);
  assert.equal(conservative.riskAmount, 4998);
  assert.equal(growth.riskAmount, 9999);
});

test('unapproved strategy, missing qualification and missing liquidity never fill', () => {
  const blocked = sizePaperOrder({ book: newPaperBook('conservative'),
    order: { ...order, approvedCodeHash: null, thesisQualified: false, liquidityVerified: false },
    markPrices: {} });
  assert.equal(blocked.shares, 0);
  assert.deepEqual(blocked.blockers, ['thesis_not_qualified', 'liquidity_not_verified',
    'exact_strategy_code_not_user_approved']);
});

test('a final next-session bar can fill, but a gap above the entry zone cannot', () => {
  const book = newPaperBook('conservative');
  const gap = fillPaperOrder({ book, order, shares: 100, markPrices: {},
    bar: { ...bar, open: 35, high: 36, low: 32, close: 34 } });
  assert.equal(gap.outcome, 'no_fill');
  const filled = fillPaperOrder({ book, order, shares: 100, bar, markPrices: {} });
  assert.equal(filled.outcome, 'filled');
  assert.equal(filled.fillPrice, 31);
  assert.equal(filled.book.cash, 996_900);
  assert.equal(filled.book.positions[0].initialRisk, 300);
  assert.throws(() => fillPaperOrder({ book: filled.book, order, shares: 100, bar,
    markPrices: { '2409': 30.9 } }),
    /paper_fill_session_invalid/u);
});

test('same-bar stop is conservatively resolved as a loss, not a winning trade', () => {
  const stopped = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 100,
    markPrices: {},
    bar: { ...bar, low: 27.5, close: 29 } });
  assert.equal(stopped.outcome, 'stop_same_bar');
  assert.equal(stopped.book.positions.length, 0);
  assert.equal(stopped.book.realizedPnl, -300);
});

test('existing positions keep their original strategy and are monitored after thesis invalidation', () => {
  const filled = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 100, bar,
    markPrices: {} });
  const marked = markPaperPositions({ book: filled.book, session: '2026-09-24',
    bars: [{ ...bar, session: '2026-09-24', open: 27, high: 29, low: 26, close: 28 }] });
  assert.equal(marked.positions.length, 0);
  assert.equal(marked.cash, 999_600);
  assert.equal(marked.realizedPnl, -400);
});

test('unofficial data and same-session execution are rejected', () => {
  assert.throws(() => fillPaperOrder({ book: newPaperBook('growth'), order, shares: 10,
    bar: { ...bar, officialFinal: false }, markPrices: {} }), /paper_fill_session_invalid/u);
  assert.throws(() => fillPaperOrder({ book: newPaperBook('conservative'), order,
    shares: 5000, bar, markPrices: {} }), /paper_fill_risk_not_admissible/u);
  assert.throws(() => sizePaperOrder({ book: newPaperBook('growth'),
    order: { ...order, executionSession: order.signalSession }, markPrices: {} }),
  /paper_order_geometry_invalid/u);
});
