import assert from 'node:assert/strict';
import test from 'node:test';
import { fillPaperOrder, markPaperPositions, newPaperBook, settlePaperSession,
  sizePaperOrder, PAPER_RISK_POLICY_HASH, type PaperOrder } from './research-paper-books.ts';

import { researchCanonicalHash } from './research-agent-qualification.ts';
const hash = 'a'.repeat(64);
// Synthetic receipt fixture: no live approval is persisted by these unit tests.
const approvalPayload = { schemaVersion: 'strategy-user-approval-v1' as const,
  proposalHash: hash, assessmentHash: hash, independentValidationHash: hash,
  codeHash: hash, parameterHashes: [hash], riskPolicyHash: PAPER_RISK_POLICY_HASH,
  approvedBy: 'fixture-owner', approvedAt: '2026-09-21T00:00:00Z', effectiveFrom: '2026-09-22T00:00:00Z' };
const approval = { ...approvalPayload, receiptHash: researchCanonicalHash(approvalPayload) };
const order: PaperOrder = {
  symbol: '2409', sector: 'electronics', strategyVersion: approval.receiptHash,
  signalSession: '2026-09-22', executionSession: '2026-09-23',
  entryLower: 30, entryUpper: 31, stopPrice: 28,
  technicalSnapshotEligible: true, thesisQualified: true, liquidityVerified: true,
  approval, expectedCodeHash: hash, parameterHash: hash,
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
    order: { ...order, approval: null, thesisQualified: false, liquidityVerified: false },
    markPrices: {} });
  assert.equal(blocked.shares, 0);
  assert.deepEqual(blocked.blockers, ['thesis_not_qualified', 'liquidity_not_verified',
    'exact_strategy_version_not_user_approved']);
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
  const firstClose = settlePaperSession({ book: filled.book, session: order.executionSession, bars: [bar] });
  const marked = markPaperPositions({ book: firstClose, session: '2026-09-24',
    bars: [{ ...bar, session: '2026-09-24', open: 27, high: 29, low: 26, close: 28 }] });
  assert.equal(marked.positions.length, 0);
  assert.ok(marked.cash < 996_000);
  assert.ok(Math.abs(marked.realizedPnl - (marked.cash - 1_000_000)) < 1e-6);
  assert.ok(marked.costs.sellTax > 0);
});
test('same session processes old-position risk, multiple distinct orders and rejects replay', () => {
  const opened = fillPaperOrder({ book: newPaperBook('growth'), order,
    shares: 1000, bar, markPrices: {} }).book;
  const prior = settlePaperSession({ book: opened, session: order.executionSession, bars: [bar] });
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
test('the final close records new-position peak exactly once after same-day orders', () => {
  const session = order.executionSession;
  const premarked = markPaperPositions({ book: newPaperBook('growth'), session, bars: [] });
  const risen = { ...bar, high: 33, close: 33 };
  const filled = fillPaperOrder({ book: premarked, order, shares: 3000,
    bar: risen, markPrices: {} });
  assert.equal(filled.book.equityPeak, 1_000_000);
  const settled = settlePaperSession({ book: filled.book, session, bars: [risen] });
  assert.ok(settled.equityPeak > 1_005_000);
  assert.throws(() => settlePaperSession({ book: settled, session, bars: [risen] }), /settlement_invalid/u);
  assert.equal(sizePaperOrder({ book: settled, order: { ...order, symbol: '2330' },
    markPrices: { '2409': 33 } }).shares, 0);
  assert.throws(() => markPaperPositions({ book: filled.book, session: '2026-09-24',
    bars: [{ ...risen, session: '2026-09-24' }] }), /prior_session_not_settled/u);
});
test('an unfilled order does not consume the other symbol\'s same-day opportunity', () => {
  const first = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 1000,
    bar: { ...bar, open: 35, high: 36, low: 32, close: 34 }, markPrices: {} });
  assert.equal(first.outcome, 'no_fill');
  const second = fillPaperOrder({ book: first.book, order: { ...order, symbol: '2330' },
    shares: 1000, bar: { ...bar, symbol: '2330' }, markPrices: {} });
  assert.equal(second.outcome, 'filled');
});

test('zero-share orders cannot advance past an unsettled session or reopen a settled session', () => {
  const filled = fillPaperOrder({ book: newPaperBook('growth'), order, shares: 3000,
    bar: { ...bar, high: 33, close: 33 }, markPrices: {} }).book;
  const nextOrder = { ...order, symbol: '2330', signalSession: order.executionSession,
    executionSession: '2026-09-24' };
  assert.throws(() => fillPaperOrder({ book: filled, order: nextOrder, shares: 0,
    bar: { ...bar, symbol: '2330', session: nextOrder.executionSession }, markPrices: { '2409': 33 } }),
  /paper_fill_risk_not_admissible/u);
  const settled = settlePaperSession({ book: filled, session: order.executionSession,
    bars: [{ ...bar, high: 33, close: 33 }] });
  assert.throws(() => fillPaperOrder({ book: settled, order: { ...order, symbol: '2330' }, shares: 0,
    bar: { ...bar, symbol: '2330' }, markPrices: { '2409': 33 } }), /paper_fill_risk_not_admissible/u);
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


test('intraday exits and same-day marks cannot finance or enlarge opening orders', () => {
  let book = newPaperBook('growth');
  const bars = [];
  for (let index = 0; index < 5; index += 1) {
    const symbol = String(2409 + index);
    const oldBar = { ...bar, symbol, open: 31, high: 33, low: 30.85, close: 31 };
    book = fillPaperOrder({ book, order: { ...order, symbol, sector: String(index),
      entryLower: 30.9, stopPrice: 30.8 }, shares: 6000, bar: oldBar, markPrices: {} }).book;
    bars.push(oldBar);
  }
  book = settlePaperSession({ book, session: order.executionSession, bars });
  const openingCash = book.cash;
  book = markPaperPositions({ book, session: '2026-09-24',
    bars: bars.map((prior, index) => ({ ...prior, session: '2026-09-24', low: index ? 30.85 : 30.7 })) });
  assert.ok(book.cash > openingCash);
  const next = { ...order, symbol: '2330', sector: 'new', signalSession: '2026-09-23',
    executionSession: '2026-09-24', entryLower: 30.9, stopPrice: 30.8 };
  const sized = sizePaperOrder({ book, order: next, markPrices: {} });
  assert.ok(sized.shares * next.entryUpper <= openingCash);
  assert.deepEqual(sized, sizePaperOrder({ book, order: next,
    markPrices: Object.fromEntries(bars.map((row) => [row.symbol, 1000])) }));
  assert.throws(() => fillPaperOrder({ book, order: next, shares: 6000, markPrices: {},
    bar: { ...bar, symbol: next.symbol, session: next.executionSession, open: 31, low: 30.85, close: 31 } }),
  /paper_fill_risk_not_admissible/u);
});


test('paper adoption binds parameters, risk policy, effective time and receipt version', () => {
  for (const changed of [{ ...order, parameterHash: 'b'.repeat(64) },
    { ...order, strategyVersion: 'unapproved-name' }]) {
    assert.equal(sizePaperOrder({ book: newPaperBook('growth'), order: changed, markPrices: {} }).shares, 0);
  }
  for (const mutation of [{ riskPolicyHash: 'b'.repeat(64) }, { effectiveFrom: '2026-09-24T00:00:00Z' }]) {
    const payload = { ...approvalPayload, ...mutation };
    const altered = { ...payload, receiptHash: researchCanonicalHash(payload) };
    assert.equal(sizePaperOrder({ book: newPaperBook('growth'),
      order: { ...order, approval: altered, strategyVersion: altered.receiptHash }, markPrices: {} }).shares, 0);
  }
});
