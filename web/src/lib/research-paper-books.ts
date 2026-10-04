import { researchCanonicalHash } from './research-agent-qualification.ts';
import { PAPER_BOOKS, type StrategyApprovalReceipt } from './research-strategy-governance.ts';

export const PAPER_BOOK_POLICY = 'paper-books-v5' as const;
// Keep the auction-proxy assumptions aligned with PR #284's engine.py.
export const PAPER_EXECUTION_COSTS = Object.freeze({
  commission: 0.001425, minimumCommission: 20, sellTax: 0.003, slippageBps: 10, lot: 1000,
});
export const PAPER_EXIT_RULES = Object.freeze({ maximumHoldingSessions: 20, exitBelowMa20: true });
export type PaperBookId = keyof typeof PAPER_BOOKS;
export type PaperPosition = {
  symbol: string; sector: string; shares: number; entryPrice: number; stopPrice: number;
  initialRisk: number; entryCostBasis: number; strategyVersion: string; openedSession: string;
  holdingSessions?: number; pendingExitAfterSession?: string | null;
  // Absence denotes a predecessor position: preserve its stop-only rules.
  exitRules?: { maximumHoldingSessions: number; exitBelowMa20: boolean };
};
export type PaperBook = {
  policyVersion: typeof PAPER_BOOK_POLICY; bookId: PaperBookId;
  cash: number; realizedPnl: number; equityPeak: number;
  positions: PaperPosition[];
  settledPrices: Record<string, number>;
  sessionRisk: { session: string; cash: number; equity: number;
    positions: Array<{ symbol: string; sector: string; value: number; risk: number }> } | null;
  lastProcessedSession: string | null;
  inceptionAt: string | null;
  markedSession: string | null;
  settledSession: string | null;
  processedOrderKeys: string[];
  costs: { commission: number; sellTax: number; slippage: number };
};
export type PaperOrder = {
  symbol: string; sector: string; strategyVersion: string;
  signalSession: string; executionSession: string;
  entryLower: number; entryUpper: number; stopPrice: number;
  technicalSnapshotEligible: boolean; thesisQualified: boolean; liquidityVerified: boolean;
  approval: StrategyApprovalReceipt | null; expectedCodeHash: string; parameterHash: string;
};
export type PaperSessionBar = {
  symbol: string; session: string; open: number; high: number; low: number; close: number;
  officialFinal: boolean;
  volumeShares?: number;
};
export const PAPER_RISK_POLICY_HASH = researchCanonicalHash({ version: PAPER_BOOK_POLICY, books: PAPER_BOOKS,
  executionCosts: PAPER_EXECUTION_COSTS, exitRules: PAPER_EXIT_RULES });
const HASH = /^[a-f0-9]{64}$/u;
const finite = (value: number) => typeof value === 'number' && Number.isFinite(value);
const commission = (notional: number) => Math.max(PAPER_EXECUTION_COSTS.minimumCommission,
  notional * PAPER_EXECUTION_COSTS.commission);
const tick = (price: number) => price < 10 ? 0.01 : price < 50 ? 0.05 : price < 100
  ? 0.1 : price < 500 ? 0.5 : price < 1000 ? 1 : 5;
const slip = (price: number) => Math.max(price * PAPER_EXECUTION_COSTS.slippageBps / 10_000, tick(price));
const orderKey = (order: PaperOrder) => [order.symbol, order.strategyVersion, order.signalSession,
  order.executionSession, order.entryLower, order.entryUpper, order.stopPrice].join('|');
const estimatedRisk = (shares: number, entry: number, stop: number) => shares * (entry - stop + slip(stop))
  + commission(shares * entry) + commission(shares * stop) + shares * stop * PAPER_EXECUTION_COSTS.sellTax;
// Freeze funding and exposure before observing the execution session. Intraday
// exits and unfilled reservations become available only at the next session.
function sessionRisk(book: PaperBook, session: string): NonNullable<PaperBook['sessionRisk']> {
  if (book.sessionRisk?.session === session) return book.sessionRisk;
  const positions = book.positions.map((position) => {
    const price = book.settledPrices[position.symbol];
    if (!finite(price) || price <= 0) throw new Error('paper_book_prior_close_missing');
    return { symbol: position.symbol, sector: position.sector,
      value: position.shares * price, risk: position.initialRisk };
  });
  return { session, cash: book.cash,
    equity: book.cash + positions.reduce((sum, position) => sum + position.value, 0), positions };
}
export function newPaperBook(bookId: PaperBookId, inceptionAt: string | null = null): PaperBook {
  const policy = PAPER_BOOKS[bookId];
  if (!policy) throw new Error('paper_book_id_invalid');
  return { policyVersion: PAPER_BOOK_POLICY, bookId, cash: policy.initialCapital,
    realizedPnl: 0, equityPeak: policy.initialCapital, positions: [], lastProcessedSession: null,
    markedSession: null, settledSession: null, inceptionAt, processedOrderKeys: [], settledPrices: {}, sessionRisk: null,
    costs: { commission: 0, sellTax: 0, slippage: 0 } };
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
  // Caller-supplied marks are intentionally not used for funding. Only the
  // prior completed session's official closes can influence order quantity.
  if (book.lastProcessedSession && book.lastProcessedSession < order.executionSession
    && book.settledSession !== book.lastProcessedSession) {
    return { shares: 0, maxEntryPrice: order.entryUpper, riskAmount: 0, blockers: ['prior_session_not_settled'] };
  }
  const risk = sessionRisk(book, order.executionSession);
  const heldValue = risk.positions.reduce((sum, position) => sum + position.value, 0);
  const equity = risk.equity;
  if (!(equity > 0)) throw new Error('paper_book_equity_invalid');
  if (!order.technicalSnapshotEligible) blockers.push('technical_snapshot_not_eligible');
  if (!order.thesisQualified) blockers.push('thesis_not_qualified');
  if (!order.liquidityVerified) blockers.push('liquidity_not_verified');
  const { receiptHash, ...approvalPayload } = order.approval || {};
  const signalCloseAt = Date.parse(`${order.signalSession}T13:30:00+08:00`);
  if (!order.approval || receiptHash !== researchCanonicalHash(approvalPayload)
    || order.approval.schemaVersion !== 'strategy-user-approval-v1'
    || !HASH.test(order.expectedCodeHash) || order.approval.codeHash !== order.expectedCodeHash
    || !HASH.test(order.parameterHash) || !order.approval.parameterHashes.includes(order.parameterHash)
    || order.approval.riskPolicyHash !== PAPER_RISK_POLICY_HASH
    || order.strategyVersion !== receiptHash
    || !Number.isFinite(Date.parse(order.approval.effectiveFrom))
    || !Number.isFinite(Date.parse(order.approval.approvedAt))
    || Date.parse(order.approval.approvedAt) > Date.parse(order.approval.effectiveFrom)
    || Date.parse(order.approval.effectiveFrom) > signalCloseAt) {
    blockers.push('exact_strategy_version_not_user_approved');
  }
  if (risk.positions.some((position) => position.symbol === order.symbol)) blockers.push('stock_already_held');
  if (book.lastProcessedSession && book.lastProcessedSession > order.executionSession) blockers.push('paper_order_past_session');
  if (book.settledSession === order.executionSession) blockers.push('paper_session_already_settled');
  if (book.lastProcessedSession && book.lastProcessedSession < order.executionSession
    && book.settledSession !== book.lastProcessedSession) blockers.push('prior_session_not_settled');
  if (book.lastProcessedSession === order.executionSession && book.processedOrderKeys.includes(orderKey(order))) {
    blockers.push('paper_order_already_processed');
  }
  if (book.positions.some((position) => position.openedSession < order.executionSession)
    && book.markedSession !== order.executionSession) blockers.push('prior_positions_not_marked');
  if ((book.equityPeak - equity) / book.equityPeak >= policy.drawdownActionFraction) {
    blockers.push('book_drawdown_action_threshold');
  }
  const existingSector = risk.positions.filter((position) => position.sector === order.sector)
    .reduce((sum, position) => sum + position.value, 0);
  const existingRisk = risk.positions.reduce((sum, position) => sum + position.risk, 0);
  const perShareRisk = order.entryUpper - order.stopPrice + slip(order.stopPrice)
    + order.entryUpper * PAPER_EXECUTION_COSTS.commission
    + order.stopPrice * (PAPER_EXECUTION_COSTS.commission + PAPER_EXECUTION_COSTS.sellTax);
  const caps = [
    Math.floor(Math.max(0, equity * policy.initialRiskFraction - 2 * PAPER_EXECUTION_COSTS.minimumCommission) / perShareRisk),
    Math.floor(equity * policy.stockExposureFraction / order.entryUpper),
    Math.floor((equity * policy.sectorExposureFraction - existingSector) / order.entryUpper),
    Math.floor((equity * policy.totalExposureFraction - heldValue) / order.entryUpper),
    Math.floor(Math.max(0, equity * policy.totalInitialRiskFraction - existingRisk
      - 2 * PAPER_EXECUTION_COSTS.minimumCommission) / perShareRisk),
    Math.floor(Math.max(0, risk.cash - PAPER_EXECUTION_COSTS.minimumCommission)
      / (order.entryUpper * (1 + PAPER_EXECUTION_COSTS.commission))),
  ];
  let shares = Math.floor(Math.max(0, Math.min(...caps)) / PAPER_EXECUTION_COSTS.lot) * PAPER_EXECUTION_COSTS.lot;
  while (shares > 0 && (estimatedRisk(shares, order.entryUpper, order.stopPrice) > equity * policy.initialRiskFraction
    || existingRisk + estimatedRisk(shares, order.entryUpper, order.stopPrice) > equity * policy.totalInitialRiskFraction
    || shares * order.entryUpper + commission(shares * order.entryUpper) > risk.cash)) shares -= PAPER_EXECUTION_COSTS.lot;
  if (shares < PAPER_EXECUTION_COSTS.lot) blockers.push('paper_order_risk_or_exposure_limit');
  return { shares: blockers.length ? 0 : shares, maxEntryPrice: order.entryUpper,
    riskAmount: blockers.length ? 0 : estimatedRisk(shares, order.entryUpper, order.stopPrice), blockers };
}
/** A limit order can fill only after the signal session on final official OHLC. */
export function fillPaperOrder(input: {
  book: PaperBook; order: PaperOrder; shares: number; bar: PaperSessionBar;
  markPrices: Record<string, number>;
}): { book: PaperBook; fillPrice: number | null; outcome: 'filled' | 'no_fill' | 'stop_same_bar' } {
  const { book, order, bar } = input;
  if (!bar.officialFinal || bar.symbol !== order.symbol || bar.session !== order.executionSession
    || book.lastProcessedSession && book.lastProcessedSession > bar.session
    || bar.volumeShares != null && (!finite(bar.volumeShares) || bar.volumeShares < 0)
    || ![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0)
    || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
    throw new Error('paper_fill_session_invalid');
  }
  if (!Number.isInteger(input.shares) || input.shares < 0
    || input.shares % PAPER_EXECUTION_COSTS.lot !== 0) throw new Error('paper_fill_quantity_invalid');
  const sized = sizePaperOrder({ book, order, markPrices: input.markPrices });
  if (input.shares > sized.shares || sized.blockers.length > 0) {
    throw new Error('paper_fill_risk_not_admissible');
  }
  const processedOrderKeys = book.lastProcessedSession === bar.session
    ? [...book.processedOrderKeys, orderKey(order)] : [orderKey(order)];
  const risk = sessionRisk(book, bar.session);
  const reservation = input.shares * order.entryUpper;
  const sessionBook = { ...book, lastProcessedSession: bar.session, processedOrderKeys,
    sessionRisk: { ...risk, cash: risk.cash - reservation - commission(reservation),
      positions: [...risk.positions, { symbol: order.symbol, sector: order.sector,
        value: reservation, risk: estimatedRisk(input.shares, order.entryUpper, order.stopPrice) }] } };
  if (!input.shares || bar.volumeShares != null && bar.volumeShares < input.shares
    || bar.high === bar.low || bar.open < order.stopPrice || bar.low > order.entryUpper
    || bar.high < order.entryLower || book.cash < input.shares * order.entryUpper) {
    return { book: sessionBook, fillPrice: null, outcome: 'no_fill' };
  }
  // OHLC cannot reveal whether the stop came before or after a same-day fill.
  // Use the upper limit and stop-first ordering so the simulation is not optimistic.
  const fillPrice = Math.min(order.entryUpper, bar.high);
  const notional = input.shares * fillPrice;
  const entryCommission = commission(notional);
  const cost = notional + entryCommission;
  const entrySlippage = input.shares * Math.max(0, fillPrice - bar.open);
  if (bar.low <= order.stopPrice) {
    const reference = Math.min(order.stopPrice, bar.open);
    const exitPrice = Math.max(tick(reference), reference - slip(reference));
    const proceeds = input.shares * exitPrice;
    const exitCommission = commission(proceeds);
    const sellTax = proceeds * PAPER_EXECUTION_COSTS.sellTax;
    const updated = { ...sessionBook, cash: book.cash - cost + proceeds - exitCommission - sellTax,
      realizedPnl: book.realizedPnl + proceeds - exitCommission - sellTax - cost,
      costs: { commission: book.costs.commission + entryCommission + exitCommission,
        sellTax: book.costs.sellTax + sellTax,
        slippage: book.costs.slippage + entrySlippage + input.shares * (reference - exitPrice) } };
    return { book: updated, fillPrice, outcome: 'stop_same_bar' };
  }
  const position: PaperPosition = {
    symbol: order.symbol, sector: order.sector, shares: input.shares,
    entryPrice: fillPrice, stopPrice: order.stopPrice,
    initialRisk: estimatedRisk(input.shares, fillPrice, order.stopPrice),
    entryCostBasis: cost,
    strategyVersion: order.strategyVersion, openedSession: bar.session, holdingSessions: 1, pendingExitAfterSession: null,
    exitRules: { ...PAPER_EXIT_RULES },
  };
  return { book: { ...sessionBook, cash: book.cash - cost, positions: [...book.positions, position],
    costs: { ...book.costs, commission: book.costs.commission + entryCommission,
      slippage: book.costs.slippage + entrySlippage } }, fillPrice, outcome: 'filled' };
}

/** Existing positions are monitored even after a thesis becomes invalid. */
export function markPaperPositions(input: {
  book: PaperBook; session: string; bars: PaperSessionBar[];
  ma20BySymbol?: Record<string, number | null>;
}) {
  const { book } = input;
  if (book.policyVersion !== PAPER_BOOK_POLICY || !/^\d{4}-\d{2}-\d{2}$/u.test(input.session)) {
    throw new Error('paper_book_policy_or_session_invalid');
  }
  if (book.lastProcessedSession && input.session < book.lastProcessedSession
    || book.markedSession === input.session) {
    throw new Error('paper_session_replay_or_reorder');
  }
  if (book.lastProcessedSession && book.lastProcessedSession < input.session
    && book.settledSession !== book.lastProcessedSession) {
    throw new Error('paper_prior_session_not_settled');
  }
  const risk = sessionRisk(book, input.session);
  const bySymbol = new Map(input.bars.map((bar) => [bar.symbol, bar]));
  if (bySymbol.size !== input.bars.length) throw new Error('paper_position_duplicate_bar');
  const remaining: PaperPosition[] = [];
  let cash = book.cash;
  let realizedPnl = book.realizedPnl;
  let exitCommissionTotal = 0;
  let sellTaxTotal = 0;
  let exitSlippageTotal = 0;
  for (const position of book.positions) {
    if (position.openedSession === input.session) { remaining.push(position); continue; }
    const bar = bySymbol.get(position.symbol);
    if (!bar || !bar.officialFinal || bar.session !== input.session) throw new Error('paper_position_final_bar_missing');
    if (bar.volumeShares != null && (!finite(bar.volumeShares) || bar.volumeShares < 0)
      || ![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0)
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      throw new Error('paper_position_bar_invalid');
    }
    const holdingSessions = (position.holdingSessions ?? 0) + 1;
    const rules = position.exitRules;
    if (rules && (!Number.isInteger(rules.maximumHoldingSessions) || rules.maximumHoldingSessions < 1
      || typeof rules.exitBelowMa20 !== 'boolean')) throw new Error('paper_position_exit_rules_invalid');
    const closeSignal = input.ma20BySymbol?.[position.symbol];
    const pendingExitAfterSession = position.pendingExitAfterSession ||
      (rules && holdingSessions >= rules.maximumHoldingSessions
        || (bar.volumeShares != null && bar.volumeShares < position.shares || bar.high === bar.low) && bar.low <= position.stopPrice
        || rules?.exitBelowMa20 && closeSignal != null && finite(closeSignal) && bar.close < closeSignal ? input.session : null);
    // A flat OHLC bar does not prove a queued order could execute at a price
    // limit. Keep risk and the exit pending instead of booking fictitious cash.
    if ((bar.volumeShares == null || bar.volumeShares >= position.shares) && bar.high !== bar.low
      && (bar.open <= position.stopPrice || bar.low <= position.stopPrice
      || position.pendingExitAfterSession && position.pendingExitAfterSession < input.session)) {
      const reference = position.pendingExitAfterSession && position.pendingExitAfterSession < input.session
        ? Math.min(bar.open, bar.low <= position.stopPrice ? position.stopPrice : bar.open)
        : Math.min(bar.open, position.stopPrice);
      const exitPrice = Math.max(tick(reference), reference - slip(reference));
      const proceeds = position.shares * exitPrice;
      const exitCommission = commission(proceeds);
      const sellTax = proceeds * PAPER_EXECUTION_COSTS.sellTax;
      cash += proceeds - exitCommission - sellTax;
      realizedPnl += proceeds - exitCommission - sellTax - position.entryCostBasis;
      exitCommissionTotal += exitCommission;
      sellTaxTotal += sellTax;
      exitSlippageTotal += position.shares * (reference - exitPrice);
    } else remaining.push({ ...position, holdingSessions, pendingExitAfterSession });
  }
  return { ...book, cash, realizedPnl, positions: remaining, sessionRisk: risk,
    costs: { commission: book.costs.commission + exitCommissionTotal,
      sellTax: book.costs.sellTax + sellTaxTotal,
      slippage: book.costs.slippage + exitSlippageTotal },
    lastProcessedSession: input.session,
    markedSession: input.session,
    processedOrderKeys: book.lastProcessedSession === input.session ? book.processedOrderKeys : [] };
}

/** Record the final close once all same-session exits and new orders are done. */
export function settlePaperSession(input: {
  book: PaperBook; session: string; bars: PaperSessionBar[];
}): PaperBook {
  const { book, session } = input;
  if (book.policyVersion !== PAPER_BOOK_POLICY || !/^\d{4}-\d{2}-\d{2}$/u.test(session)
    || book.lastProcessedSession !== session || book.settledSession === session
    || book.positions.some((position) => position.openedSession < session && book.markedSession !== session)) {
    throw new Error('paper_session_settlement_invalid');
  }
  const bars = new Map(input.bars.map((bar) => [bar.symbol, bar]));
  if (bars.size !== input.bars.length) throw new Error('paper_session_settlement_duplicate_bar');
  const equity = book.positions.reduce((total, position) => {
    const bar = bars.get(position.symbol);
    if (!bar || !bar.officialFinal || bar.session !== session
      || ![bar.open, bar.high, bar.low, bar.close].every((value) => finite(value) && value > 0)
      || bar.high < Math.max(bar.open, bar.close) || bar.low > Math.min(bar.open, bar.close)) {
      throw new Error('paper_session_final_bar_missing');
    }
    return total + position.shares * bar.close;
  }, book.cash);
  return { ...book, equityPeak: Math.max(book.equityPeak, equity), settledSession: session,
    settledPrices: Object.fromEntries(book.positions.map((position) => [position.symbol, bars.get(position.symbol)!.close])) };
}
