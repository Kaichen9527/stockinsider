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
  assert.equal(conservative.shares, 1000);
  assert.equal(growth.shares, 3000);
  assert.ok(conservative.riskAmount <= 5_000 && conservative.riskAmount > 3_000);
  assert.ok(growth.riskAmount <= 10_000 && growth.riskAmount > 9_000);
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
  const gap = fillPaperOrder({ book, order, shares: 1000, markPrices: {},
    bar: { ...bar, open: 35, high: 36, low: 32, close: 34 } });
  assert.equal(gap.outcome, 'no_fill');
  const filled = fillPaperOrder({ book, order, shares: 1000, bar, markPrices: {} });
  assert.equal(filled.outcome, 'filled');
  assert.equal(filled.fillPrice, 31);
  assert.equal(filled.book.cash, 1_000_000 - 31_000 - 44.175);
  assert.ok(filled.book.positions[0].initialRisk > 3_000);
  assert.ok(Math.abs(filled.book.costs.commission - 44.175) < 1e-6);
  assert.throws(() => fillPaperOrder({ book: filled.book, order, shares: 1000, bar,
    markPrices: { '2409': 30.9 } }),
    /paper_fill_risk_not_admissible/u);
});

test('same-bar stop is conservatively resolved as a loss, not a winning trade', () => {
  const stopped = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 1000,
    markPrices: {},
    bar: { ...bar, low: 27.5, close: 29 } });
  assert.equal(stopped.outcome, 'stop_same_bar');
  assert.equal(stopped.book.positions.length, 0);
  assert.ok(stopped.book.realizedPnl < -3_000);
  assert.ok(stopped.book.costs.commission > 80);
  assert.ok(stopped.book.costs.sellTax > 0);
});

test('existing positions keep their original strategy and are monitored after thesis invalidation', () => {
  const filled = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 1000, bar,
    markPrices: {} });
  const marked = markPaperPositions({ book: filled.book, session: '2026-09-24',
    bars: [{ ...bar, session: '2026-09-24', open: 27, high: 29, low: 26, close: 28 }] });
  assert.equal(marked.positions.length, 0);
  assert.ok(marked.cash < 996_000);
  assert.ok(Math.abs(marked.realizedPnl - (marked.cash - 1_000_000)) < 1e-6);
  assert.ok(marked.costs.sellTax > 0);
});
test('same session processes old-position risk, multiple distinct orders and rejects replay', () => {
  const prior = fillPaperOrder({ book: newPaperBook('growth'), order,
    shares: 1000, bar, markPrices: {} }).book;
  const session = '2026-09-24';
  const nextOrder = { ...order, symbol: '2330', signalSession: '2026-09-23',
    executionSession: session };
  const nextBar = { ...bar, symbol: '2330', session };
  assert.throws(() => fillPaperOrder({ book: prior, order: nextOrder, shares: 1000,
    bar: nextBar, markPrices: { '2409': 30 } }), /paper_fill_risk_not_admissible/);
  const marked = markPaperPositions({ book: prior, session,
    bars: [{ ...bar, session, open: 27, high: 29, low: 26, close: 28 }] });
  assert.equal(marked.positions.length, 0);
  const first = fillPaperOrder({ book: marked, order: nextOrder, shares: 1000,
    bar: nextBar, markPrices: {} });
  assert.equal(first.outcome, 'filled');
  const thirdOrder = { ...nextOrder, symbol: '2317' };
  const second = fillPaperOrder({ book: first.book, order: thirdOrder, shares: 1000,
    bar: { ...nextBar, symbol: '2317' }, markPrices: { '2330': 30.9 } });
  assert.equal(second.outcome, 'filled');
  assert.equal(second.book.positions.length, 2);
  assert.throws(() => fillPaperOrder({ book: second.book, order: nextOrder, shares: 1000,
    bar: nextBar, markPrices: { '2330': 30.9, '2317': 30.9 } }), /paper_fill_risk_not_admissible/);
  assert.throws(() => markPaperPositions({ book: second.book, session, bars: [] }),
    /paper_session_replay_or_reorder/);
});
test('an unfilled order does not consume the other symbol\'s same-day opportunity', () => {
  const first = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 1000,
    bar: { ...bar, open: 35, high: 36, low: 32, close: 34 }, markPrices: {} });
  assert.equal(first.outcome, 'no_fill');
  const second = fillPaperOrder({ book: first.book, order: { ...order, symbol: '2330' },
    shares: 1000, bar: { ...bar, symbol: '2330' }, markPrices: {} });
  assert.equal(second.outcome, 'filled');
});

test('unofficial data and same-session execution are rejected', () => {
  assert.throws(() => fillPaperOrder({ book: newPaperBook('growth'), order, shares: 100,
    bar, markPrices: {} }), /paper_fill_quantity_invalid/u);
  assert.throws(() => fillPaperOrder({ book: newPaperBook('growth'), order, shares: 10,
    bar: { ...bar, officialFinal: false }, markPrices: {} }), /paper_fill_session_invalid/u);
  assert.throws(() => fillPaperOrder({ book: newPaperBook('conservative'), order,
    shares: 5000, bar, markPrices: {} }), /paper_fill_risk_not_admissible/u);
  assert.throws(() => sizePaperOrder({ book: newPaperBook('growth'),
    order: { ...order, executionSession: order.signalSession }, markPrices: {} }),
  /paper_order_geometry_invalid/u);
});
