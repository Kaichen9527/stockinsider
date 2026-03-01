from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Dict


def moving_average(values: List[float], window: int) -> Optional[float]:
    if len(values) < window or window <= 0:
        return None
    subset = values[-window:]
    return sum(subset) / float(window)


def calculate_rsi(values: List[float], period: int = 14) -> Optional[float]:
    if len(values) <= period:
        return None

    gains: List[float] = []
    losses: List[float] = []
    for idx in range(1, len(values)):
        diff = values[idx] - values[idx - 1]
        gains.append(max(diff, 0.0))
        losses.append(abs(min(diff, 0.0)))

    avg_gain = sum(gains[-period:]) / period
    avg_loss = sum(losses[-period:]) / period
    if avg_loss == 0:
        return 100.0

    rs = avg_gain / avg_loss
    return 100.0 - (100.0 / (1.0 + rs))


def ema(values: List[float], period: int) -> Optional[float]:
    if len(values) < period:
        return None

    multiplier = 2.0 / (period + 1.0)
    ema_value = sum(values[:period]) / period
    for value in values[period:]:
        ema_value = (value - ema_value) * multiplier + ema_value
    return ema_value


def calculate_macd(values: List[float], short_period: int = 12, long_period: int = 26, signal_period: int = 9) -> Dict[str, Optional[float]]:
    short_ema = ema(values, short_period)
    long_ema = ema(values, long_period)
    if short_ema is None or long_ema is None:
        return {"macd": None, "signal": None}

    macd_line = short_ema - long_ema

    macd_series: List[float] = []
    for idx in range(len(values)):
        sub = values[: idx + 1]
        s_ema = ema(sub, short_period)
        l_ema = ema(sub, long_period)
        if s_ema is None or l_ema is None:
            continue
        macd_series.append(s_ema - l_ema)

    signal = ema(macd_series, signal_period)
    return {"macd": macd_line, "signal": signal}


@dataclass
class TechnicalSnapshot:
    ma_short: Optional[float]
    ma_mid: Optional[float]
    ma_long: Optional[float]
    rsi: Optional[float]
    macd: Optional[float]
    macd_signal: Optional[float]


def compute_technical_snapshot(close_prices: List[float]) -> TechnicalSnapshot:
    macd = calculate_macd(close_prices)
    return TechnicalSnapshot(
        ma_short=moving_average(close_prices, 5),
        ma_mid=moving_average(close_prices, 20),
        ma_long=moving_average(close_prices, 60),
        rsi=calculate_rsi(close_prices, 14),
        macd=macd["macd"],
        macd_signal=macd["signal"],
    )
