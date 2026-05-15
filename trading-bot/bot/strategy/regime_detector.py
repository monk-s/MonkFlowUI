"""
Market regime classification with hysteresis.

Regimes
-------
- TRENDING_UP:   ADX > 25 AND EMA9 > EMA26 AND slope > +0.2%
- TRENDING_DOWN: ADX > 25 AND EMA9 < EMA26 AND slope < -0.2%
- RANGING:       ADX < 20 AND BB bandwidth stable
- CHOPPY:        everything else (ADX 20-25 ambiguous zone uses EMA
                 separation as tiebreaker)

Hysteresis: requires REGIME_CONFIRMATION_CANDLES consecutive identical
readings before the regime actually switches.
"""

from __future__ import annotations

import math
from typing import Optional

from bot.data.indicators import (
    Candle,
    IndicatorSnapshot,
    _isnan,
    adx as calc_adx,
    bb_bandwidth as calc_bb_bandwidth,
    bollinger_bands,
    ema as calc_ema,
    ema_slope as calc_ema_slope,
)
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("regime_detector")


# Regime string constants
TRENDING_UP = "trending_up"
TRENDING_DOWN = "trending_down"
RANGING = "ranging"
CHOPPY = "choppy"


class RegimeDetector:
    """
    Stateful regime detector with hysteresis.

    Keeps track of the current confirmed regime and a pending regime counter.
    The regime only switches after ``REGIME_CONFIRMATION_CANDLES`` consecutive
    identical raw readings that differ from the current regime.
    """

    def __init__(self) -> None:
        self._current_regime: str = CHOPPY
        self._pending_regime: Optional[str] = None
        self._pending_count: int = 0
        self._confirmation_needed: int = settings.REGIME_CONFIRMATION_CANDLES

    @property
    def current_regime(self) -> str:
        return self._current_regime

    def update(self, candles_4h: list[Candle]) -> str:
        """
        Classify the market regime from the latest 4H candle data and apply
        hysteresis.  Returns the confirmed regime string.
        """
        raw = self._classify_raw(candles_4h)

        if raw == self._current_regime:
            # Matches current regime -- reset any pending transition
            self._pending_regime = None
            self._pending_count = 0
        elif raw == self._pending_regime:
            # Continues a pending transition
            self._pending_count += 1
            if self._pending_count >= self._confirmation_needed:
                old = self._current_regime
                self._current_regime = raw
                self._pending_regime = None
                self._pending_count = 0
                logger.info(
                    "regime_changed",
                    old_regime=old,
                    new_regime=raw,
                    confirmation_candles=self._confirmation_needed,
                )
        else:
            # New candidate regime -- start counting
            self._pending_regime = raw
            self._pending_count = 1
            if self._pending_count >= self._confirmation_needed:
                old = self._current_regime
                self._current_regime = raw
                self._pending_regime = None
                self._pending_count = 0
                logger.info(
                    "regime_changed",
                    old_regime=old,
                    new_regime=raw,
                    confirmation_candles=self._confirmation_needed,
                )

        return self._current_regime

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    def _classify_raw(self, candles_4h: list[Candle]) -> str:
        """Single-bar regime classification (no hysteresis)."""
        closes = [c.close for c in candles_4h]
        highs = [c.high for c in candles_4h]
        lows = [c.low for c in candles_4h]

        # Compute indicators
        adx_values = calc_adx(highs, lows, closes, period=14)
        ema_fast_values = calc_ema(closes, settings.EMA_FAST_PERIOD)
        ema_slow_values = calc_ema(closes, settings.EMA_SLOW_PERIOD)
        bb_upper, bb_mid, bb_lower = bollinger_bands(
            closes, settings.BB_PERIOD, settings.BB_STD_DEV,
        )
        bw_values = calc_bb_bandwidth(bb_upper, bb_mid, bb_lower)

        # Latest values
        adx_val = adx_values[-1] if adx_values else float("nan")
        ema_fast = ema_fast_values[-1] if ema_fast_values else float("nan")
        ema_slow = ema_slow_values[-1] if ema_slow_values else float("nan")
        slope = calc_ema_slope(ema_fast_values, lookback=5)

        # Guard against NaN
        if _isnan(adx_val) or _isnan(ema_fast) or _isnan(ema_slow) or _isnan(slope):
            return CHOPPY

        # ----- Trending -----
        if adx_val > settings.TREND_ADX_THRESHOLD:
            if ema_fast > ema_slow and slope > settings.EMA_SLOPE_THRESHOLD:
                return TRENDING_UP
            if ema_fast < ema_slow and slope < -settings.EMA_SLOPE_THRESHOLD:
                return TRENDING_DOWN

        # ----- Ranging -----
        if adx_val < settings.RANGE_ADX_THRESHOLD:
            if self._is_bandwidth_stable(bw_values):
                return RANGING

        # ----- Ambiguous zone (ADX 20-25): use EMA separation -----
        if settings.REGIME_ADX_AMBIGUOUS_LOW <= adx_val <= settings.REGIME_ADX_AMBIGUOUS_HIGH:
            separation = abs(ema_fast - ema_slow) / ema_slow if ema_slow != 0 else 0.0
            if separation > settings.REGIME_EMA_SEPARATION_THRESHOLD:
                # Meaningful separation -- lean towards trend
                if ema_fast > ema_slow and slope > settings.EMA_SLOPE_THRESHOLD:
                    return TRENDING_UP
                if ema_fast < ema_slow and slope < -settings.EMA_SLOPE_THRESHOLD:
                    return TRENDING_DOWN
            # Separation too small or slopes don't confirm
            return CHOPPY

        return CHOPPY

    @staticmethod
    def _is_bandwidth_stable(bw_values: list[float]) -> bool:
        """
        BB bandwidth is "stable" if the latest value is between 0.5x and 1.2x
        the 20-period average bandwidth.
        """
        valid = [v for v in bw_values if not _isnan(v)]
        if len(valid) < 20:
            return False

        recent_20 = valid[-20:]
        avg_bw = sum(recent_20) / len(recent_20)

        if avg_bw == 0:
            return False

        latest = valid[-1]
        ratio = latest / avg_bw

        return (
            settings.BB_BANDWIDTH_CONTRACTION_MIN
            <= ratio
            <= settings.BB_BANDWIDTH_EXPANSION_MAX
        )
