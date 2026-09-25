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


def _finite_number(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return False
    try:
        return isfinite(value)
    except OverflowError:
        return False


def _session(value, reason):
    try:
        if not isinstance(value, str) or len(value) != 10 or date.fromisoformat(value).isoformat() != value:
            raise ValueError(reason)
    except (TypeError, ValueError):
        raise ValueError(reason) from None
    return value


def _validate_inputs(bars_by_symbol, signals, sessions, start, end, actions, a):
    """Fail before accounting; never silently sort, deduplicate or repair inputs.

    Missing bars keep the existing missing-mark/expired-order semantics. Missing
    turnover keeps zero capacity. Passive controls may use zero stops/band floors.
    Payment dates may be non-trading days; effective action dates may not.
    Valid v1 inputs retain the exact v1 execution and result object.
    """
    numeric = ('initial_cash', 'commission', 'minimum_commission', 'sell_tax',
               'slippage_bps', 'max_weight', 'max_turnover_participation')
    if (not isinstance(a, Assumptions) or any(not _finite_number(getattr(a, key)) for key in numeric)
            or type(a.lot) is not int or a.lot < 1 or a.initial_cash <= 0
            or not 0 < a.max_weight <= 1 or not 0 < a.max_turnover_participation <= 1
            or min(a.commission, a.minimum_commission, a.sell_tax, a.slippage_bps) < 0):
        raise ValueError('invalid_assumptions')
    _session(start, 'invalid_session_range')
    _session(end, 'invalid_session_range')
    if start > end:
        raise ValueError('invalid_session_range')
    if end >= '2024-01-01':
        raise ValueError('holdout_locked_2024_onward')
    if not isinstance(sessions, (list, tuple)):
        raise ValueError('invalid_calendar')
    for session in sessions:
        _session(session, 'invalid_calendar')
        if session >= '2024-01-01':
            raise ValueError('holdout_locked_2024_onward')
    if list(sessions) != sorted(set(sessions)):
        raise ValueError('invalid_calendar')
    calendar = set(sessions)
    if not isinstance(bars_by_symbol, dict):
        raise ValueError('invalid_bars')
    for symbol, bars in bars_by_symbol.items():
        if not isinstance(symbol, str) or not symbol or not isinstance(bars, (list, tuple)):
            raise ValueError('invalid_bars')
        previous = ''
        for bar in bars:
            if not isinstance(bar, dict):
                raise ValueError('invalid_bars')
            session = _session(bar.get('date'), 'invalid_bar_date')
            if session >= '2024-01-01':
                raise ValueError('holdout_locked_2024_onward')
            if session <= previous:
                raise ValueError('bar_dates_must_be_unique_and_sorted')
            previous = session
            if session not in calendar:
                raise ValueError('bar_not_on_calendar')
            if any(not _finite_number(bar.get(k)) or bar[k] <= 0 for k in ('open', 'high', 'low', 'close')):
                raise ValueError('invalid_ohlc')
            if bar['high'] < max(bar['open'], bar['close']) or bar['low'] > min(bar['open'], bar['close']):
                raise ValueError('invalid_ohlc_geometry')
            if any(not _finite_number(bar.get(k, 0)) or bar.get(k, 0) < 0 for k in ('volume', 'turnover_twd')):
                raise ValueError('invalid_volume_or_turnover')
            if 'volume' not in bar:
                raise ValueError('invalid_volume_or_turnover')
    if not isinstance(signals, (list, tuple)):
        raise ValueError('invalid_signal')
    seen_signals = set()
    for signal in signals:
        if not isinstance(signal, dict):
            raise ValueError('invalid_signal')
        session = _session(signal.get('date'), 'invalid_signal_date')
        if session not in calendar:
            raise ValueError('signal_not_on_calendar')
        symbol = signal.get('symbol')
        if not isinstance(symbol, str) or symbol not in bars_by_symbol:
            raise ValueError('signal_symbol_missing_bars')
        if signal.get('plan_state') != 'eligible_proxy':
            continue
        key = (symbol, session)
        if key in seen_signals:
            raise ValueError('duplicate_symbol_signal_session')
        seen_signals.add(key)
        if (any(not _finite_number(signal.get(k)) for k in ('buy_limit', 'entry_lower', 'stop', 'rank'))
                or signal['buy_limit'] <= 0 or signal['entry_lower'] < 0 or signal['stop'] < 0
                or any(type(signal.get(k)) is not int or signal[k] < 1 for k in ('exit_ma', 'max_hold'))
                or signal.get('exit_ma_direction', 'below') not in ('below', 'above')):
            raise ValueError('invalid_signal')
    if not isinstance(actions, dict):
        raise ValueError('invalid_actions')
    for symbol, events in actions.items():
        if not isinstance(symbol, str) or symbol not in bars_by_symbol or not isinstance(events, (list, tuple)):
            raise ValueError('invalid_actions')
        seen = set()
        for event in events:
            if not isinstance(event, dict):
                raise ValueError('invalid_actions')
            session = _session(event.get('session'), 'invalid_action_session')
            if session in seen:
                raise ValueError('duplicate_action_session:' + symbol + ':' + session)
            seen.add(session)
            if session not in calendar:
                raise ValueError('action_not_on_calendar')
            if event.get('status') != 'verified' or not _finite_number(event.get('share_factor')) or event['share_factor'] != 1:
                raise ValueError('unresolved_or_share_changing_event:' + symbol + ':' + session)
            if not _finite_number(event.get('price_factor')) or event['price_factor'] <= 0:
                raise ValueError('invalid_action_factor')
            if not _finite_number(event.get('cash_dividend', 0)) or event.get('cash_dividend', 0) < 0:
                raise ValueError('invalid_cash_dividend')
            if not _finite_number(event.get('cash_return', 0)) or event.get('cash_return', 0) != 0:
                raise ValueError('return_of_capital_execution_unmodeled')
            payment = event.get('payment_date')
            if payment is not None:
                _session(payment, 'invalid_payment_date')
                if payment < session:
                    raise ValueError('payment_before_entitlement')


def simulate(bars_by_symbol, signals, sessions, *, start, end, actions_by_symbol=None, assumptions=None):
    a = Assumptions() if assumptions is None else assumptions
    actions = {} if actions_by_symbol is None else actions_by_symbol
    _validate_inputs(bars_by_symbol, signals, sessions, start, end, actions, a)
    active = [s for s in sessions if start <= s <= end]
    if len(active) < 2:
        raise ValueError('insufficient_sessions')
    lookup = {symbol: {b['date']: b for b in bars} for symbol, bars in bars_by_symbol.items()}
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
