"""
Technical indicators for Bitcoin trading bot.

Pure math module -- only dependency is numpy. All functions accept lists of
floats (close prices) or separated OHLCV lists and return computed values.
NaN is used for positions where insufficient data exists.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Tuple

import numpy as np


NaN: float = float("nan")


# ---------------------------------------------------------------------------
# Dataclasses
# ---------------------------------------------------------------------------

@dataclass
class Candle:
    """Single OHLCV bar."""

    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: float


@dataclass
class IndicatorSnapshot:
    """Latest-bar indicator values returned by ``compute_all``."""

    ema_fast: float
    ema_slow: float
    rsi: float
    adx: float
    atr: float
    bb_upper: float
    bb_middle: float
    bb_lower: float
    bb_bandwidth: float
    ema_fast_slope: float


# ---------------------------------------------------------------------------
# Simple Moving Average
# ---------------------------------------------------------------------------

def sma(closes: list[float], period: int) -> list[float]:
    """Simple Moving Average.

    Returns a list the same length as *closes*. The first ``period - 1``
    entries are NaN because there aren't enough data points yet.
    """
    n: int = len(closes)
    out: list[float] = [NaN] * n
    if period <= 0 or n < period:
        return out

    arr = np.asarray(closes, dtype=np.float64)
    cumsum = np.cumsum(arr)
    cumsum[period:] = cumsum[period:] - cumsum[:-period]
    for i in range(period - 1, n):
        out[i] = float(cumsum[i] / period)
    return out


# ---------------------------------------------------------------------------
# Exponential Moving Average
# ---------------------------------------------------------------------------

def ema(closes: list[float], period: int) -> list[float]:
    """Exponential Moving Average.

    * Multiplier k = 2 / (period + 1)
    * Seed value (index ``period - 1``) is the SMA of the first *period*
      prices.
    * EMA_today = price * k + EMA_yesterday * (1 - k)
    """
    n: int = len(closes)
    out: list[float] = [NaN] * n
    if period <= 0 or n < period:
        return out

    k: float = 2.0 / (period + 1)

    # Seed with SMA of first `period` values.
    seed: float = float(np.mean(closes[:period]))
    out[period - 1] = seed

    prev: float = seed
    for i in range(period, n):
        val: float = closes[i] * k + prev * (1.0 - k)
        out[i] = val
        prev = val

    return out


# ---------------------------------------------------------------------------
# Relative Strength Index (Wilder's smoothing)
# ---------------------------------------------------------------------------

def rsi(closes: list[float], period: int = 14) -> list[float]:
    """Relative Strength Index using Wilder's smoothing method.

    RSI = 100 - 100 / (1 + RS)
    RS  = avg_gain / avg_loss

    The first *period* price changes are averaged with a simple mean to seed
    the smoothed averages.  Thereafter Wilder's recursive smoothing is used:

        avg_gain = (prev_avg_gain * (period - 1) + current_gain) / period
        avg_loss = (prev_avg_loss * (period - 1) + current_loss) / period
    """
    n: int = len(closes)
    out: list[float] = [NaN] * n
    if period <= 0 or n < period + 1:
        return out

    deltas = np.diff(np.asarray(closes, dtype=np.float64))

    gains = np.where(deltas > 0, deltas, 0.0)
    losses = np.where(deltas < 0, -deltas, 0.0)

    # Seed: simple average of first `period` changes.
    avg_gain: float = float(np.mean(gains[:period]))
    avg_loss: float = float(np.mean(losses[:period]))

    if avg_loss == 0.0:
        out[period] = 100.0
    else:
        rs: float = avg_gain / avg_loss
        out[period] = 100.0 - 100.0 / (1.0 + rs)

    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period

        if avg_loss == 0.0:
            out[i + 1] = 100.0
        else:
            rs = avg_gain / avg_loss
            out[i + 1] = 100.0 - 100.0 / (1.0 + rs)

    return out


# ---------------------------------------------------------------------------
# Bollinger Bands
# ---------------------------------------------------------------------------

def bollinger_bands(
    closes: list[float],
    period: int = 20,
    std_dev: float = 2.0,
) -> Tuple[list[float], list[float], list[float]]:
    """Bollinger Bands.

    Returns ``(upper, middle, lower)`` where each list has the same length
    as *closes*.

    * middle = SMA(period)
    * upper  = middle + std_dev * stdev(period)
    * lower  = middle - std_dev * stdev(period)
    """
    n: int = len(closes)
    upper: list[float] = [NaN] * n
    middle: list[float] = [NaN] * n
    lower: list[float] = [NaN] * n

    if period <= 0 or n < period:
        return upper, middle, lower

    arr = np.asarray(closes, dtype=np.float64)

    for i in range(period - 1, n):
        window = arr[i - period + 1 : i + 1]
        m: float = float(np.mean(window))
        s: float = float(np.std(window, ddof=0))  # population stdev
        middle[i] = m
        upper[i] = m + std_dev * s
        lower[i] = m - std_dev * s

    return upper, middle, lower


# ---------------------------------------------------------------------------
# Bollinger Band Bandwidth
# ---------------------------------------------------------------------------

def bb_bandwidth(
    upper: list[float],
    middle: list[float],
    lower: list[float],
) -> list[float]:
    """Bollinger Band Bandwidth = (upper - lower) / middle."""
    n: int = len(upper)
    out: list[float] = [NaN] * n
    for i in range(n):
        u = upper[i]
        m = middle[i]
        lo = lower[i]
        if _isnan(u) or _isnan(m) or _isnan(lo) or m == 0.0:
            continue
        out[i] = (u - lo) / m
    return out


# ---------------------------------------------------------------------------
# Average True Range
# ---------------------------------------------------------------------------

def atr(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = 14,
) -> list[float]:
    """Average True Range using Wilder's smoothing.

    True Range = max(high - low, |high - prev_close|, |low - prev_close|)

    The first ATR value (at index ``period``) is the simple average of the
    first *period* true ranges.  Subsequent values use Wilder's smoothing:

        ATR = (prev_ATR * (period - 1) + current_TR) / period
    """
    n: int = len(closes)
    out: list[float] = [NaN] * n
    if period <= 0 or n < period + 1:
        return out

    h = np.asarray(highs, dtype=np.float64)
    lo = np.asarray(lows, dtype=np.float64)
    c = np.asarray(closes, dtype=np.float64)

    # True ranges (index 0 has no previous close so we skip it).
    tr = np.empty(n, dtype=np.float64)
    tr[0] = h[0] - lo[0]
    for i in range(1, n):
        hl: float = h[i] - lo[i]
        hc: float = abs(h[i] - c[i - 1])
        lc: float = abs(lo[i] - c[i - 1])
        tr[i] = max(hl, hc, lc)

    # Seed with simple average of first `period` TRs (starting at index 1).
    atr_val: float = float(np.mean(tr[1 : period + 1]))
    out[period] = atr_val

    for i in range(period + 1, n):
        atr_val = (atr_val * (period - 1) + tr[i]) / period
        out[i] = atr_val

    return out


# ---------------------------------------------------------------------------
# Average Directional Index
# ---------------------------------------------------------------------------

def adx(
    highs: list[float],
    lows: list[float],
    closes: list[float],
    period: int = 14,
) -> list[float]:
    """Average Directional Index (full standard Wilder formula).

    Steps
    -----
    1. Compute +DM / -DM from consecutive highs and lows.
    2. Compute True Range series.
    3. Smooth +DM, -DM, and TR with Wilder's smoothing over *period*.
    4. +DI = 100 * smoothed(+DM) / smoothed(TR)
       -DI = 100 * smoothed(-DM) / smoothed(TR)
    5. DX  = 100 * |+DI - -DI| / (+DI + -DI)
    6. ADX = Wilder's smoothing of DX over *period*.

    The first ADX value appears at index ``2 * period``.
    """
    n: int = len(closes)
    out: list[float] = [NaN] * n
    # Need at least 2*period + 1 bars to produce the first ADX value.
    if period <= 0 or n < 2 * period + 1:
        return out

    h = np.asarray(highs, dtype=np.float64)
    lo = np.asarray(lows, dtype=np.float64)
    c = np.asarray(closes, dtype=np.float64)

    # ------------------------------------------------------------------
    # 1. +DM, -DM, TR  (all start at index 1; index 0 has no prior bar)
    # ------------------------------------------------------------------
    plus_dm = np.zeros(n, dtype=np.float64)
    minus_dm = np.zeros(n, dtype=np.float64)
    tr = np.zeros(n, dtype=np.float64)

    for i in range(1, n):
        up_move: float = h[i] - h[i - 1]
        down_move: float = lo[i - 1] - lo[i]

        if up_move > down_move and up_move > 0:
            plus_dm[i] = up_move
        if down_move > up_move and down_move > 0:
            minus_dm[i] = down_move

        hl: float = h[i] - lo[i]
        hc: float = abs(h[i] - c[i - 1])
        lc: float = abs(lo[i] - c[i - 1])
        tr[i] = max(hl, hc, lc)

    # ------------------------------------------------------------------
    # 2. First smoothed values (simple sum of first `period` values,
    #    starting at index 1).
    # ------------------------------------------------------------------
    sm_plus_dm: float = float(np.sum(plus_dm[1 : period + 1]))
    sm_minus_dm: float = float(np.sum(minus_dm[1 : period + 1]))
    sm_tr: float = float(np.sum(tr[1 : period + 1]))

    # ------------------------------------------------------------------
    # 3. Build +DI, -DI, DX arrays using Wilder's smoothing.
    # ------------------------------------------------------------------
    dx_values: list[float] = []

    def _compute_dx(s_pdm: float, s_mdm: float, s_tr: float) -> float:
        if s_tr == 0.0:
            return 0.0
        pdi: float = 100.0 * s_pdm / s_tr
        mdi: float = 100.0 * s_mdm / s_tr
        denom: float = pdi + mdi
        if denom == 0.0:
            return 0.0
        return 100.0 * abs(pdi - mdi) / denom

    # DX at the end of the first smoothing window (index `period`).
    dx_values.append(_compute_dx(sm_plus_dm, sm_minus_dm, sm_tr))

    # Continue smoothing from index `period + 1` onward.
    for i in range(period + 1, n):
        sm_plus_dm = sm_plus_dm - sm_plus_dm / period + plus_dm[i]
        sm_minus_dm = sm_minus_dm - sm_minus_dm / period + minus_dm[i]
        sm_tr = sm_tr - sm_tr / period + tr[i]
        dx_values.append(_compute_dx(sm_plus_dm, sm_minus_dm, sm_tr))

    # ------------------------------------------------------------------
    # 4. ADX = Wilder-smoothed DX over another `period` window.
    # ------------------------------------------------------------------
    if len(dx_values) < period:
        return out

    adx_val: float = float(np.mean(dx_values[:period]))
    # The first ADX maps to bar index = period (first DX) + period - 1
    first_adx_idx: int = 2 * period
    out[first_adx_idx] = adx_val

    for j in range(period, len(dx_values)):
        adx_val = (adx_val * (period - 1) + dx_values[j]) / period
        bar_idx: int = first_adx_idx + (j - period + 1)
        if bar_idx < n:
            out[bar_idx] = adx_val

    return out


# ---------------------------------------------------------------------------
# EMA Slope
# ---------------------------------------------------------------------------

def ema_slope(ema_values: list[float], lookback: int = 5) -> float:
    """Percentage change of EMA over the last *lookback* periods.

    Returns ``(ema[-1] - ema[-1 - lookback]) / ema[-1 - lookback]``.
    Returns NaN if the values list is too short or the reference value is
    zero/NaN.
    """
    if len(ema_values) < lookback + 1:
        return NaN

    current: float = ema_values[-1]
    reference: float = ema_values[-1 - lookback]

    if _isnan(current) or _isnan(reference) or reference == 0.0:
        return NaN

    return (current - reference) / reference


# ---------------------------------------------------------------------------
# Convenience: compute all indicators for the latest bar
# ---------------------------------------------------------------------------

def compute_all(
    candles: list[Candle],
    fast_period: int = 9,
    slow_period: int = 26,
    rsi_period: int = 14,
    bb_period: int = 20,
    bb_std: float = 2.0,
    atr_period: int = 14,
    adx_period: int = 14,
) -> IndicatorSnapshot:
    """Compute every indicator and return a snapshot for the latest candle."""
    closes: list[float] = [c.close for c in candles]
    highs: list[float] = [c.high for c in candles]
    lows: list[float] = [c.low for c in candles]

    ema_fast_arr: list[float] = ema(closes, fast_period)
    ema_slow_arr: list[float] = ema(closes, slow_period)
    rsi_arr: list[float] = rsi(closes, rsi_period)
    adx_arr: list[float] = adx(highs, lows, closes, adx_period)
    atr_arr: list[float] = atr(highs, lows, closes, atr_period)

    bb_upper, bb_mid, bb_lower = bollinger_bands(closes, bb_period, bb_std)
    bw: list[float] = bb_bandwidth(bb_upper, bb_mid, bb_lower)

    slope: float = ema_slope(ema_fast_arr)

    return IndicatorSnapshot(
        ema_fast=_last(ema_fast_arr),
        ema_slow=_last(ema_slow_arr),
        rsi=_last(rsi_arr),
        adx=_last(adx_arr),
        atr=_last(atr_arr),
        bb_upper=_last(bb_upper),
        bb_middle=_last(bb_mid),
        bb_lower=_last(bb_lower),
        bb_bandwidth=_last(bw),
        ema_fast_slope=slope,
    )


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _isnan(v: float) -> bool:
    """Return True if *v* is NaN (works without numpy)."""
    return v != v  # noqa: PLR0124  — canonical NaN check


def _last(arr: list[float]) -> float:
    """Return the last element of *arr*, or NaN if empty."""
    return arr[-1] if arr else NaN
