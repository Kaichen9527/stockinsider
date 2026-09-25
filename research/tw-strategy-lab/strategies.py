"""Frozen exploratory signals; no fills, network access, production gates or holdout reads.

Raw bars: date/open/high/low/close/volume. Corporate actions adjust EACH rolling
window to its signal-session price/share basis, never to a future anchor.
"""
from datetime import date, datetime, time, timedelta, timezone
import math

SIGNAL_VERSION = "tw-strategy-lab-signals-v1"
HOLDOUT_START = "2024-01-01"
MINIMUM_BARS = 240
TAIPEI = timezone(timedelta(hours=8))
STRATEGY_IDS = ("S1", "S2", "S3", "S4", "S5", "S6", "S7")
NAMES = {"S1": "breakout", "S2": "pullback", "S3": "panel_relative_momentum",
         "S4": "contraction", "S5": "revenue_acceleration",
         "S6": "short_term_reversal", "S7": "broker_revision"}


def strategy_coverage(strategy_id):
    if strategy_id not in STRATEGY_IDS:
        raise ValueError("unknown_strategy_id")
    blocked = strategy_id in ("S5", "S7")
    return {"strategy_id": strategy_id, "name": NAMES[strategy_id],
            "status": "blocked" if blocked else "exploratory_executable",
            "reason": "historical_point_in_time_events_missing" if blocked else None,
            "signalversion": SIGNAL_VERSION, "minimum_bars": MINIMUM_BARS,
            "production_eligibility": "not_evaluated", "variants_enabled": False,
            "sector_rotation_status": "blocked_pit_sector_membership_missing" if strategy_id == "S3" else None}


def _positive(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value > 0


def tw_tick(price):
    if not _positive(price):
        return None
    return 0.01 if price < 10 else 0.05 if price < 50 else 0.1 if price < 100 else 0.5 if price < 500 else 1 if price < 1000 else 5


def round_tw_price(price, direction="down"):
    tick = tw_tick(price)
    if tick is None:
        return None
    if direction not in ("up", "down"):
        raise ValueError("invalid_tick_direction")
    quotient = price / tick
    nearest = round(quotient)
    integer = nearest if abs(quotient - nearest) <= 1e-8 else math.ceil(quotient) if direction == "up" else math.floor(quotient)
    value = round(integer * tick, 8)
    return value if value > 0 else None


def next_tw_price(price):
    up = round_tw_price(price, "up")
    return None if up is None else up if up > price + 1e-8 else round(up + tw_tick(up), 8)


def wilder_atr(bars, period=14):
    if not isinstance(period, int) or period < 1 or len(bars) < period:
        return None
    ranges = []
    for index, bar in enumerate(bars):
        if not all(_positive(bar.get(key)) for key in ("high", "low", "close")) or bar["high"] < bar["low"]:
            return None
        prior = bars[index - 1]["close"] if index else None
        ranges.append(bar["high"] - bar["low"] if prior is None else max(
            bar["high"] - bar["low"], abs(bar["high"] - prior), abs(bar["low"] - prior)))
    value = sum(ranges[:period]) / period
    for item in ranges[period:]:
        value = (value * (period - 1) + item) / period
    return value if _positive(value) else None


def _date(value):
    if not isinstance(value, str) or len(value) != 10 or date.fromisoformat(value).isoformat() != value:
        raise ValueError("invalid_session_date")
    return value


def _validate_bars(bars):
    previous = ""
    for bar in bars:
        session = _date(bar.get("date"))
        if session >= HOLDOUT_START:
            raise ValueError("holdout_access_forbidden")
        if session <= previous:
            raise ValueError("bar_dates_must_be_unique_and_sorted")
        previous = session
        if not all(_positive(bar.get(key)) for key in ("open", "high", "low", "close")):
            raise ValueError("invalid_ohlc")
        if bar["high"] < max(bar["open"], bar["close"]) or bar["low"] > min(bar["open"], bar["close"]):
            raise ValueError("invalid_ohlc_geometry")
        volume = bar.get("volume")
        if not isinstance(volume, (int, float)) or isinstance(volume, bool) or not math.isfinite(volume) or volume < 0:
            raise ValueError("invalid_volume")


def _window(raw, actions, allow_reconstructed_history):
    """share_factor is NEW/OLD shares: a 2-for-1 split doubles older volume."""
    result = [dict(bar) for bar in raw]
    session = raw[-1]["date"]
    cutoff = datetime.combine(date.fromisoformat(session), time(20), TAIPEI)
    reconstructed = False
    for action in actions:
        effective = _date(action.get("session"))
        if effective > session or effective <= raw[0]["date"]:
            continue
        if action.get("status") != "verified" or not all(_positive(action.get(key)) for key in ("price_factor", "share_factor")):
            raise ValueError("corporate_action_basis_unverified")
        if action.get("known_at"):
            known_at = datetime.fromisoformat(action["known_at"].replace("Z", "+00:00"))
            if known_at.tzinfo is None or known_at > cutoff:
                raise ValueError("corporate_action_not_known_at_signal")
        elif allow_reconstructed_history and action.get("knowledge_mode") == "official_effective_date_reconstruction":
            reconstructed = True
        else:
            raise ValueError("corporate_action_known_at_missing")
        for bar in result:
            if bar["date"] < effective:
                for key in ("open", "high", "low", "close"):
                    bar[key] *= action["price_factor"]
                bar["volume"] *= action["share_factor"]
    return result, reconstructed


def _mean(bars, period):
    return sum(bar["close"] for bar in bars[-period:]) / period


def _signal(strategy_id, symbol, bars, lower, upper, stop, rank, exit_ma, max_hold, reconstructed, features):
    current = bars[-1]
    valid = upper is not None and stop is not None and 0 < stop < lower <= upper and current["close"] <= upper
    return {"date": current["date"], "symbol": symbol, "strategy_id": strategy_id,
            "buy_limit": upper if valid else None, "entry_lower": lower if valid else None,
            "no_chase_above": upper, "stop": stop if valid else None,
            "exit_ma": exit_ma, "max_hold": max_hold, "rank": rank,
            "exit_ma_direction": "above" if strategy_id == "S6" else "below",
            "signalversion": SIGNAL_VERSION, "raw_signal_state": "confirmed",
            "plan_state": "eligible_proxy" if valid else "avoid_chase",
            "exit_rule": "close_below_ma_or_stop_then_next_session",
            "execution_model": "daily_auction_limit_proxy", "production_eligibility": "not_evaluated",
            "knowledge_mode": "official_effective_date_reconstruction" if reconstructed else "supplied_event_timestamps",
            "pit_membership_status": "not_verified_fixed_panel", "features": features}


def _technical(strategy_id, symbol, bars, reconstructed):
    current, previous = bars[-1], bars[-2]
    close = current["close"]
    atr = wilder_atr(bars)
    if atr is None or abs(close - (round_tw_price(close) or 0)) > 1e-8:
        return None
    prior20 = bars[-21:-1]
    volume20 = sum(bar["volume"] for bar in prior20) / 20
    if volume20 <= 0:
        return None
    ma20, ma60 = _mean(bars, 20), _mean(bars, 60)
    trend = close > ma20 > ma60 and ma60 >= _mean(bars[:-5], 60)
    resistance = max(bar["high"] for bar in prior20)
    features = {"atr14": atr, "ma20": ma20, "ma60": ma60,
                "prior20_high": resistance, "prior20_volume": volume20}
    if strategy_id in ("S1", "S2"):
        threshold = next_tw_price(resistance)
        breakout = strategy_id == "S1"
        confirmed = close >= threshold and current["volume"] >= 1.5 * volume20 if breakout else (
            current["low"] <= ma20 + 0.5 * atr and current["high"] >= ma20 - 0.5 * atr
            and close >= ma20 and close > previous["high"])
        if not trend or not confirmed:
            return None
        lower = threshold if breakout else close
        upper = round_tw_price(min(close + 0.25 * atr, resistance + 0.75 * atr if breakout else ma20 + atr))
        stop = round_tw_price(resistance - atr if breakout else min(current["low"], ma20) - 0.5 * atr)
        return _signal(strategy_id, symbol, bars, lower, upper, stop, current["volume"] / volume20,
                       20, 20, reconstructed, features)
    if strategy_id == "S4":
        fast, slow = wilder_atr(bars[:-1], 5), wilder_atr(bars[:-1], 20)
        compression = fast / slow if fast is not None and slow is not None else math.inf
        prior10 = bars[-11:-1]
        if compression > 0.60 or close < next_tw_price(max(bar["high"] for bar in prior10)) or current["volume"] < volume20 or close <= ma60:
            return None
        features["atr5_atr20_prior"] = compression
        return _signal(strategy_id, symbol, bars, close, round_tw_price(close + 0.25 * atr),
                       round_tw_price(min(bar["low"] for bar in prior10)), 1 / compression,
                       20, 20, reconstructed, features)
    if strategy_id == "S6":
        decline = close / bars[-4]["close"] - 1
        if close <= _mean(bars, 120) or decline > -2 * atr / close:
            return None
        features["three_session_return"] = decline
        value = _signal(strategy_id, symbol, bars, close, round_tw_price(close), round_tw_price(close - 2 * atr),
                        -decline, 5, 5, reconstructed, features)
        value["exit_rule"] = "close_at_or_above_ma_or_below_stop_then_next_session"
        return value
    return None


def generate_signals(bars_by_symbol, strategy_id, actions_by_symbol=None, *, allow_reconstructed_history=False):
    """All decisions use <=t data. S5/S7 remain blocked even if events exist.

    Input calendar completeness and historical universe authority are separate
    dataset gates. Friday-only S3 avoids discovering week-end from future bars.
    """
    if strategy_coverage(strategy_id)["status"] == "blocked":
        return []
    actions_by_symbol = actions_by_symbol or {}
    signals, weekly = [], {}
    for symbol, raw in sorted(bars_by_symbol.items()):
        _validate_bars(raw)
        for index in range(MINIMUM_BARS - 1, len(raw)):
            if strategy_id == "S3" and date.fromisoformat(raw[index]["date"]).weekday() != 4:
                continue
            bars, reconstructed = _window(raw[index - MINIMUM_BARS + 1:index + 1],
                                          actions_by_symbol.get(symbol, []), allow_reconstructed_history)
            if strategy_id == "S3":
                current = bars[-1]
                score = bars[-22]["close"] / bars[-127]["close"] - 1
                weekly.setdefault(current["date"], []).append((score, symbol, bars, reconstructed))
            else:
                signal = _technical(strategy_id, symbol, bars, reconstructed)
                if signal is not None:
                    signals.append(signal)
    for session in sorted(weekly):
        ranked = sorted(weekly[session], key=lambda value: (-value[0], value[1]))
        if len(ranked) < 5:
            continue
        for score, symbol, bars, reconstructed in ranked[:math.ceil(len(ranked) * 0.20)]:
            close, atr = bars[-1]["close"], wilder_atr(bars)
            if score <= 0 or close <= _mean(bars, 60) or atr is None or abs(close - (round_tw_price(close) or 0)) > 1e-8:
                continue
            signals.append(_signal("S3", symbol, bars, close, round_tw_price(close + 0.25 * atr),
                                   round_tw_price(close - 2 * atr), score, 60, 60, reconstructed,
                                   {"momentum_126_21": score, "eligible_panel_count": len(ranked)}))
    return sorted(signals, key=lambda value: (value["date"], -value["rank"], value["symbol"]))


def research_event_contract(strategy_id):
    """Research agents can deliver these records; delivery does not enable trading."""
    if strategy_id not in ("S5", "S7"):
        raise ValueError("event_contract_only_for_blocked_fundamental_strategies")
    common = ["symbol", "published_at", "first_available_at", "source_url", "document_hash", "revision_id"]
    fields = (["report_month", "revenue", "currency", "original_or_correction", "prior_revision_id"] if strategy_id == "S5"
              else ["broker_id", "analyst_id", "forecast_period", "metric", "currency", "prior_value", "new_value",
                    "prior_document_hash", "rights_status"])
    return {"strategy_id": strategy_id, "status": "blocked", "required_fields": common + fields,
            "knowledge_rule": "max(published_at,first_available_at)<=signal_cutoff; preserve all revisions",
            "automatic_activation": False}
