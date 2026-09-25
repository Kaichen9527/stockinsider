"""Bounded daily auction execution proxy; never an order router.

Signals are fixed after close. Only the next market session may enter. Cash
dividends without payment dates are receivables, never spendable cash. Results
are retrospective research on a declared panel, not verified historical fills.
"""
from dataclasses import dataclass, asdict
from datetime import date
from math import floor, isfinite, sqrt
from statistics import mean, median, stdev


@dataclass(frozen=True)
class Assumptions:
    initial_cash: float = 10_000_000
    commission: float = .001425
    minimum_commission: float = 20
    sell_tax: float = .003
    slippage_bps: float = 10
    max_weight: float = .10
    max_turnover_participation: float = .01
    lot: int = 1000


def tick(p):
    return .01 if p < 10 else .05 if p < 50 else .1 if p < 100 else .5 if p < 500 else 1 if p < 1000 else 5


def round_price(p, up=False):
    t = tick(p)
    q = p / t
    from math import ceil
    return round((ceil(q - 1e-9) if up else floor(q + 1e-9)) * t, 8)


def _ma(bars, session, period, events):
    window = [b for b in bars if b['date'] <= session][-period:]
    if len(window) != period:
        return None
    values = []
    for bar in window:
        value = bar['close']
        for event in events:
            if bar['date'] < event['session'] <= session:
                value *= event['price_factor']
        values.append(value)
    return mean(values)


def performance(curve, trades, costs, assumptions):
    start, end = curve[0], curve[-1]
    total = end['equity'] / start['equity'] - 1
    years = (date.fromisoformat(end['date']) - date.fromisoformat(start['date'])).days / 365.2425
    returns = [b['equity'] / a['equity'] - 1 for a, b in zip(curve, curve[1:])]
    peak, mdd, underwater, longest = start['equity'], 0., 0, 0
    weekly, monthly = {}, {}
    for row in curve[1:]:
        peak = max(peak, row['equity'])
        mdd = min(mdd, row['equity'] / peak - 1)
        underwater = underwater + 1 if row['equity'] < peak else 0
        longest = max(longest, underwater)
        dt = date.fromisoformat(row['date'])
        weekly[dt.isocalendar()[:2]] = row['equity']
        monthly[row['date'][:7]] = row['equity']
    def period_returns(groups):
        # Exclude the first, potentially partial calendar bucket. Later returns
        # use the preceding bucket's last close. Final bucket may be partial.
        levels = list(groups.values())
        return [b / a - 1 for a, b in zip(levels, levels[1:])]
    wr, mr = period_returns(weekly), period_returns(monthly)
    sd = stdev(returns) if len(returns) > 1 else 0
    return {
        'net_total_return': total, 'net_cagr': (1 + total) ** (1 / years) - 1 if years > 0 else None,
        'maximum_drawdown': mdd, 'longest_underwater_sessions': longest,
        'sharpe_zero_cash_rate': mean(returns) / sd * sqrt(252) if sd else None,
        'completed_trades': len(trades), 'winning_trade_fraction': sum(t['net_pnl'] > 0 for t in trades) / len(trades) if trades else None,
        'average_exposure': mean(r['exposure'] for r in curve[1:]) if len(curve) > 1 else 0,
        'weekly_above_5pct_fraction': sum(r >= .05 for r in wr) / len(wr) if wr else None,
        'monthly_above_10pct_fraction': sum(r >= .10 for r in mr) / len(mr) if mr else None,
        'worst_month_return': min(mr) if mr else None, 'calendar_period_last_may_be_partial': True,
        'costs_twd': costs, 'turnover_over_initial_capital': costs['traded_notional'] / assumptions.initial_cash,
        'cost_addback_return_same_filled_shares': total + (costs['commission'] + costs['sell_tax'] + costs['slippage']) / assumptions.initial_cash,
        'cost_addback_note': 'Diagnostic on the same filled share path; not a no-cost counterfactual portfolio.',
        'ending_equity': end['equity'], 'ending_cash': end['cash'], 'ending_receivables': end['receivables'],
    }


def simulate(bars_by_symbol, signals, sessions, *, start, end, actions_by_symbol=None, assumptions=None):
    a = assumptions or Assumptions()
    if not (a.initial_cash > 0 and a.lot >= 1 and 0 < a.max_weight <= 1 and 0 < a.max_turnover_participation <= 1
            and min(a.commission, a.minimum_commission, a.sell_tax, a.slippage_bps) >= 0):
        raise ValueError('invalid_assumptions')
    if end >= '2024-01-01':
        raise ValueError('holdout_locked_2024_onward')
    if sessions != sorted(set(sessions)):
        raise ValueError('invalid_calendar')
    active = [s for s in sessions if start <= s <= end]
    if len(active) < 2:
        raise ValueError('insufficient_sessions')
    if any(x['date'] not in sessions for x in signals):
        raise ValueError('signal_not_on_calendar')
    actions = actions_by_symbol or {}
    lookup = {symbol: {b['date']: b for b in bars} for symbol, bars in bars_by_symbol.items()}
    for symbol, events in actions.items():
        for event in events:
            if event['status'] != 'verified' or event.get('share_factor') != 1 or event.get('cash_dividend', 0) < 0:
                raise ValueError(f'unresolved_or_share_changing_event:{symbol}:{event["session"]}')
            if not (isfinite(event['price_factor']) and event['price_factor'] > 0):
                raise ValueError('invalid_action_factor')
    incoming = {}
    next_session = dict(zip(sessions, sessions[1:]))
    for signal in signals:
        if signal.get('plan_state') == 'eligible_proxy' and signal['date'] in next_session:
            incoming.setdefault(next_session[signal['date']], []).append(signal)
    cash, receivables = float(a.initial_cash), 0.
    positions, marks, pending_exits, trades, fills, skips, problems = {}, {}, set(), [], [], [], []
    costs = dict(commission=0., sell_tax=0., slippage=0., traded_notional=0.)
    payments = {}
    prior_session = next((s for s in reversed(sessions) if s < active[0]), None)
    if prior_session is None:
        raise ValueError('initial_valuation_session_missing')
    curve = [dict(date=prior_session, equity=cash, cash=cash, receivables=0., exposure=0.)]
    for session in active:
        sold_today = set()
        # Freeze share quantities and reserve cash BEFORE seeing this opening.
        # Same-auction sale proceeds are not assumed available for new orders.
        order_cash, planned = cash, {}
        orders = sorted(incoming.get(session, []), key=lambda x: (-x['rank'], x['symbol']))
        for signal in orders:
            symbol = signal['symbol']
            if symbol in planned:
                raise ValueError('duplicate_symbol_signal_session')
            previous = [b for b in bars_by_symbol.get(symbol, []) if b['date'] < session]
            if symbol in positions or len(previous) < 20:
                planned[symbol] = 0
                continue
            liquidity = median(b.get('turnover_twd', 0.) for b in previous[-20:]) * a.max_turnover_participation
            budget = min(curve[-1]['equity'] * a.max_weight, liquidity, order_cash)
            limit = signal['buy_limit']
            shares = max(0, floor((budget - a.minimum_commission) / (limit * (1 + a.commission)) / a.lot) * a.lot)
            reservation = shares * limit + max(a.minimum_commission, shares * limit * a.commission) if shares else 0
            planned[symbol] = shares
            order_cash -= reservation
        paid = sum(payments.pop(due) for due in sorted(list(payments)) if due <= session)
        cash += paid
        receivables -= paid
        todays_actions = {}
        for symbol, events in actions.items():
            on_date = [e for e in events if e['session'] == session]
            if on_date:
                todays_actions[symbol] = on_date
            if symbol not in positions:
                continue
            pos = positions[symbol]
            for event in on_date:
                entitlement = pos['shares'] * event.get('cash_dividend', 0)
                receivables += entitlement
                pos['dividends'] += entitlement
                pos['stop'] *= event['price_factor']
                marks[symbol] *= event['price_factor']
                payment = event.get('payment_date')
                if payment:
                    if payment < session:
                        raise ValueError('payment_before_entitlement')
                    if payment == session:
                        cash += entitlement
                        receivables -= entitlement
                    else:
                        payments[payment] = payments.get(payment, 0) + entitlement
        # Existing exit intentions precede entries; no same-session signal fill.
        for symbol in sorted(list(pending_exits)):
            bar = lookup[symbol].get(session)
            pos = positions[symbol]
            previous = [b for b in bars_by_symbol[symbol] if b['date'] < session]
            if not bar or not previous or bar['volume'] <= 0:
                skips.append(dict(date=session, symbol=symbol, side='sell', reason='missing_or_halted'))
                continue
            reference = previous[-1]['close']
            for event in todays_actions.get(symbol, []):
                reference *= event['price_factor']
            lower_limit = round_price(reference * .9, up=True)
            slip = max(bar['open'] * a.slippage_bps / 10000, tick(bar['open']))
            price = round_price(bar['open'] - slip)
            if bar['open'] <= lower_limit + 1e-8 or price < lower_limit:
                skips.append(dict(date=session, symbol=symbol, side='sell', reason='limit_down_proxy'))
                continue
            notional = pos['shares'] * price
            fee, tax = max(a.minimum_commission, notional * a.commission), notional * a.sell_tax
            cash += notional - fee - tax
            costs['commission'] += fee
            costs['sell_tax'] += tax
            costs['slippage'] += pos['shares'] * (bar['open'] - price)
            costs['traded_notional'] += notional
            pnl = notional - fee - tax - pos['cost_basis'] + pos['dividends']
            trades.append(dict(symbol=symbol, entry_date=pos['entry_date'], exit_date=session,
                               shares=pos['shares'], net_pnl=pnl, net_return=pnl / pos['cost_basis']))
            fills.append(dict(date=session, symbol=symbol, side='sell', price=price, shares=pos['shares']))
            del positions[symbol]
            sold_today.add(symbol)
            pending_exits.remove(symbol)
        for signal in orders:
            symbol = signal['symbol']
            def skip(reason):
                skips.append(dict(date=session, symbol=symbol, side='buy', reason=reason))
            if symbol in positions:
                skip('already_held')
                continue
            if symbol in sold_today:
                skip('no_same_open_reentry')
                continue
            bar = lookup.get(symbol, {}).get(session)
            previous = [b for b in bars_by_symbol.get(symbol, []) if b['date'] < session]
            if not bar or len(previous) < 20 or bar['volume'] <= 0:
                skip('missing_or_halted')
                continue
            if symbol in todays_actions:
                skip('corporate_action_day_order_cancelled')
                continue
            upper_limit = round_price(previous[-1]['close'] * 1.1)
            limit = signal['buy_limit']
            if bar['open'] > limit - tick(bar['open']) + 1e-8 or bar['open'] >= upper_limit - 1e-8:
                skip('limit_not_crossed_or_limit_up')
                continue
            slip = max(bar['open'] * a.slippage_bps / 10000, tick(bar['open']))
            price = round_price(bar['open'] + slip, up=True)
            if price > limit + 1e-8:
                skip('impact_exceeds_precommitted_limit')
                continue
            # There is deliberately no test of opening price against entry_lower:
            # a precommitted buy limit also fills a gap below that lower bound.
            shares = planned[symbol]
            if not shares:
                skip('capital_lot_or_liquidity_capacity')
                continue
            notional = shares * price
            fee = max(a.minimum_commission, notional * a.commission)
            if notional + fee > cash + 1e-6:
                raise AssertionError('cash_overdraft')
            cash -= notional + fee
            costs['commission'] += fee
            costs['slippage'] += shares * (price - bar['open'])
            costs['traded_notional'] += notional
            positions[symbol] = dict(shares=shares, entry_date=session, cost_basis=notional + fee,
                                     stop=signal['stop'], exit_ma=signal['exit_ma'], exit_ma_direction=signal.get('exit_ma_direction', 'below'),
                                     max_hold=signal['max_hold'], held=0, dividends=0.)
            marks[symbol] = price
            fills.append(dict(date=session, symbol=symbol, side='buy', price=price, shares=shares,
                              signal_date=signal['date'], gap_below_entry_lower=bar['open'] < signal['entry_lower']))
        for symbol, pos in positions.items():
            bar = lookup[symbol].get(session)
            pos['held'] += 1
            if not bar:
                problems.append(dict(date=session, symbol=symbol, reason='missing_mark_unresolved'))
                continue
            marks[symbol] = bar['close']
            ma = _ma(bars_by_symbol[symbol], session, pos['exit_ma'], actions.get(symbol, []))
            ma_exit = ma is not None and (bar['close'] >= ma if pos['exit_ma_direction'] == 'above' else bar['close'] < ma)
            if bar['close'] < pos['stop'] or ma_exit or pos['held'] >= pos['max_hold']:
                pending_exits.add(symbol)
        market_value = sum(p['shares'] * marks[s] for s, p in positions.items())
        equity = cash + receivables + market_value
        curve.append(dict(date=session, equity=equity, cash=cash, receivables=receivables, exposure=market_value / equity if equity else 0))
    return dict(execution_model='daily_auction_limit_proxy', assumptions=asdict(a),
                status='invalid_missing_marks' if problems else 'exploratory',
                metrics=performance(curve, trades, costs, a), curve=curve, trades=trades, fills=fills,
                skipped_orders=skips, unresolved=problems, open_positions=positions,
                limitations=['Fixed survivor panel; not historical App selection.',
                             'Auction queues and historical daily price-limit exceptions are unverified.',
                             'Slippage is charged through adverse execution prices; reported separately, not deducted twice.',
                             'Unpaid dividend receivables remain non-spendable; terminal holdings are marked, not sold.',
                             'Official historical data reconstructed today, not an immutable historical PIT archive.'])
