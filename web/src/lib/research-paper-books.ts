import { PAPER_BOOKS } from './research-strategy-governance.ts';

export const PAPER_BOOK_POLICY = 'paper-books-v1' as const;
export type PaperBookId = keyof typeof PAPER_BOOKS;
export type PaperPosition = {
  symbol: string; sector: string; shares: number; entryPrice: number; stopPrice: number;
  initialRisk: number; strategyVersion: string; openedSession: string;
};
export type PaperBook = {
  policyVersion: typeof PAPER_BOOK_POLICY; bookId: PaperBookId;
  cash: number; realizedPnl: number; equityPeak: number;
  positions: PaperPosition[];
  lastProcessedSession: string | null;
};
export type PaperOrder = {
  symbol: string; sector: string; strategyVersion: string;
  signalSession: string; executionSession: string;
  entryLower: number; entryUpper: number; stopPrice: number;
  technicalSnapshotEligible: boolean; thesisQualified: boolean; liquidityVerified: boolean;
  approvedCodeHash: string | null; expectedCodeHash: string;
};
export type PaperSessionBar = {
  symbol: string; session: string; open: number; high: number; low: number; close: number;
  officialFinal: boolean;
};
const HASH = /^[a-f0-9]{64}$/u;
const finite = (value: number) => typeof value === 'number' && Number.isFinite(value);
function prices(book: PaperBook, marks: Record<string, number>) {
  if (book.positions.some((position) => !finite(marks[position.symbol]) || marks[position.symbol] <= 0)) {
    throw new Error('paper_book_mark_missing');
  }
  return book.positions.reduce((sum, position) => sum + position.shares * marks[position.symbol], 0);
}
export function newPaperBook(bookId: PaperBookId): PaperBook {
  const policy = PAPER_BOOKS[bookId];
  if (!policy) throw new Error('paper_book_id_invalid');
  return { policyVersion: PAPER_BOOK_POLICY, bookId, cash: policy.initialCapital,
    realizedPnl: 0, equityPeak: policy.initialCapital, positions: [], lastProcessedSession: null };
}
export function sizePaperOrder(input: {
  book: PaperBook; order: PaperOrder; markPrices: Record<string, number>;
}): { shares: number; maxEntryPrice: number; riskAmount: number; blockers: string[] } {
  const { book, order } = input;
  const policy = PAPER_BOOKS[book.bookId];
  const blockers: string[] = [];
  if (book.policyVersion !== PAPER_BOOK_POLICY || !policy) throw new Error('paper_book_policy_invalid');
  if (!/^\d{4}$/u.test(order.symbol) || !order.sector || !order.strategyVersion
    || !/^\d{4}-\d{2}-\d{2}$/u.test(order.signalSession)
    || !/^\d{4}-\d{2}-\d{2}$/u.test(order.executionSession)
    || order.executionSession <= order.signalSession
    || ![order.entryLower, order.entryUpper, order.stopPrice].every(finite)
    || !(0 < order.stopPrice && order.stopPrice < order.entryLower && order.entryLower <= order.entryUpper)) {
    throw new Error('paper_order_geometry_invalid');
  }
  const heldValue = prices(book, input.markPrices);
  const equity = book.cash + heldValue;
  if (!(equity > 0)) throw new Error('paper_book_equity_invalid');
  if (!order.technicalSnapshotEligible) blockers.push('technical_snapshot_not_eligible');
  if (!order.thesisQualified) blockers.push('thesis_not_qualified');
  if (!order.liquidityVerified) blockers.push('liquidity_not_verified');
  if (!HASH.test(order.expectedCodeHash) || order.approvedCodeHash !== order.expectedCodeHash) {
    blockers.push('exact_strategy_code_not_user_approved');
  }
  if (book.positions.some((position) => position.symbol === order.symbol)) blockers.push('stock_already_held');
  if ((book.equityPeak - equity) / book.equityPeak >= policy.drawdownActionFraction) {
    blockers.push('book_drawdown_action_threshold');
  }
  const existingSector = book.positions.filter((position) => position.sector === order.sector)
    .reduce((sum, position) => sum + position.shares * input.markPrices[position.symbol], 0);
  const existingRisk = book.positions.reduce((sum, position) => sum + position.initialRisk, 0);
  const perShareRisk = order.entryUpper - order.stopPrice;
  const caps = [
    Math.floor(equity * policy.initialRiskFraction / perShareRisk),
    Math.floor(equity * policy.stockExposureFraction / order.entryUpper),
    Math.floor((equity * policy.sectorExposureFraction - existingSector) / order.entryUpper),
    Math.floor((equity * policy.totalExposureFraction - heldValue) / order.entryUpper),
    Math.floor((equity * policy.totalInitialRiskFraction - existingRisk) / perShareRisk),
    Math.floor(book.cash / order.entryUpper),
  ];
  const shares = Math.max(0, Math.min(...caps));
  if (shares < 1) blockers.push('paper_order_risk_or_exposure_limit');
  return { shares: blockers.length ? 0 : shares, maxEntryPrice: order.entryUpper,
    riskAmount: blockers.length ? 0 : shares * perShareRisk, blockers };
}
/** A limit order can fill only after the signal session on final official OHLC. */
export function fillPaperOrder(input: {
  book: PaperBook; order: PaperOrder; shares: number; bar: PaperSessionBar;
  markPrices: Record<string, number>;
}): { book: PaperBook; fillPrice: number | null; outcome: 'filled' | 'no_fill' | 'stop_same_bar' } {
  const { book, order, bar } = input;
  if (!bar.officialFinal || bar.symbol !== order.symbol || bar.session !== order.executionSession
    || book.lastProcessedSession && book.lastProcessedSession >= bar.session
    || ![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0)
    || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
    throw new Error('paper_fill_session_invalid');
  }
  if (!Number.isInteger(input.shares) || input.shares < 0) throw new Error('paper_fill_quantity_invalid');
  const sized = sizePaperOrder({ book, order, markPrices: input.markPrices });
  if (input.shares > sized.shares) throw new Error('paper_fill_risk_not_admissible');
  if (!input.shares || bar.open < order.stopPrice || bar.low > order.entryUpper
    || bar.high < order.entryLower || book.cash < input.shares * order.entryUpper) {
    return { book: { ...book, lastProcessedSession: bar.session }, fillPrice: null, outcome: 'no_fill' };
  }
  // OHLC cannot reveal whether the stop came before or after a same-day fill.
  // Use the upper limit and stop-first ordering so the simulation is not optimistic.
  const fillPrice = order.entryUpper;
  const cost = input.shares * fillPrice;
  if (bar.low <= order.stopPrice) {
    const exitPrice = Math.min(order.stopPrice, bar.open);
    const loss = input.shares * (fillPrice - exitPrice);
    const updated = { ...book, cash: book.cash - cost + input.shares * exitPrice,
      realizedPnl: book.realizedPnl - loss, lastProcessedSession: bar.session };
    return { book: updated, fillPrice, outcome: 'stop_same_bar' };
  }
  const position: PaperPosition = {
    symbol: order.symbol, sector: order.sector, shares: input.shares,
    entryPrice: fillPrice, stopPrice: order.stopPrice,
    initialRisk: input.shares * (fillPrice - order.stopPrice),
    strategyVersion: order.strategyVersion, openedSession: bar.session,
  };
  return { book: { ...book, cash: book.cash - cost, positions: [...book.positions, position],
    lastProcessedSession: bar.session }, fillPrice, outcome: 'filled' };
}

/** Existing positions are monitored even after a thesis becomes invalid. */
export function markPaperPositions(input: {
  book: PaperBook; session: string; bars: PaperSessionBar[];
}) {
  const { book } = input;
  if (book.lastProcessedSession && input.session <= book.lastProcessedSession) {
    throw new Error('paper_session_replay_or_reorder');
  }
  const bySymbol = new Map(input.bars.map((bar) => [bar.symbol, bar]));
  const remaining: PaperPosition[] = [];
  let cash = book.cash;
  let realizedPnl = book.realizedPnl;
  for (const position of book.positions) {
    const bar = bySymbol.get(position.symbol);
    if (!bar || !bar.officialFinal || bar.session !== input.session) throw new Error('paper_position_final_bar_missing');
    if (![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0)
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      throw new Error('paper_position_bar_invalid');
    }
    if (bar.open <= position.stopPrice || bar.low <= position.stopPrice) {
      const exitPrice = Math.min(bar.open, position.stopPrice);
      cash += position.shares * exitPrice;
      realizedPnl += position.shares * (exitPrice - position.entryPrice);
    } else remaining.push(position);
  }
  const marked = remaining.reduce((sum, position) => sum + position.shares * bySymbol.get(position.symbol)!.close, 0);
  return { ...book, cash, realizedPnl, positions: remaining,
    equityPeak: Math.max(book.equityPeak, cash + marked), lastProcessedSession: input.session };
}
