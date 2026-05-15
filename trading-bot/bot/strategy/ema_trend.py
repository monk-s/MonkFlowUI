"""
EMA Trend Following strategy.

Long signal (ALL must be true):
  1. 4H: EMA9 > EMA26
  2. 4H: Price wicked to EMA9 (candle low within 0.2% of EMA9) AND closed above EMA9
  3. 4H: Bullish confirmation candle (close > open, body ratio >= 50%)
  4. 1H: Latest close > EMA9 on 1H AND latest close > latest open
  5. Stop = max(EMA26 * (1 - 0.003), entry - 1.5*ATR) — whichever is CLOSER to
     entry (higher value for long)
  6. Target = entry + 2 * (entry - stop)
  7. R:R must be >= 2.0

Short signal: all conditions inverted.
"""

from __future__ import annotations

import math
from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    atr as calc_atr,
    ema as calc_ema,
    ema_slope as calc_ema_slope,
    rsi as calc_rsi,
    adx as calc_adx,
    bollinger_bands,
    bb_bandwidth as calc_bb_bandwidth,
)
from bot.strategy.base import Signal, StrategyBase
from bot.strategy.regime_detector import RegimeDetector
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("ema_trend")


class EMATrendStrategy(StrategyBase):
    """EMA trend following with multi-timeframe confirmation."""

    def __init__(self, regime_detector: RegimeDetector) -> None:
        self._regime = regime_detector

    def evaluate(
        self,
        candles_4h: list[Candle],
        candles_1h: list[Candle],
    ) -> Optional[Signal]:
        if len(candles_4h) < 50 or len(candles_1h) < 50:
            logger.debug("insufficient_candles", candles_4h=len(candles_4h), candles_1h=len(candles_1h))
            return None

        regime = self._regime.current_regime

        long_signal = self._check_long(candles_4h, candles_1h, regime)
        if long_signal is not None:
            return long_signal

        short_signal = self._check_short(candles_4h, candles_1h, regime)
        if short_signal is not None:
            return short_signal

        return None

    # ------------------------------------------------------------------
    # Long
    # ------------------------------------------------------------------

    def _check_long(
        self,
        candles_4h: list[Candle],
        candles_1h: list[Candle],
        regime: str,
    ) -> Optional[Signal]:
        closes_4h = [c.close for c in candles_4h]
        highs_4h = [c.high for c in candles_4h]
        lows_4h = [c.low for c in candles_4h]
        closes_1h = [c.close for c in candles_1h]

        ema_fast_4h = calc_ema(closes_4h, settings.EMA_FAST_PERIOD)
        ema_slow_4h = calc_ema(closes_4h, settings.EMA_SLOW_PERIOD)
        atr_4h = calc_atr(highs_4h, lows_4h, closes_4h, settings.ATR_PERIOD)
        ema_fast_1h = calc_ema(closes_1h, settings.EMA_FAST_PERIOD)

        latest_4h = candles_4h[-1]
        latest_1h = candles_1h[-1]

        ema9_4h = ema_fast_4h[-1]
        ema26_4h = ema_slow_4h[-1]
        atr_val = atr_4h[-1]
        ema9_1h = ema_fast_1h[-1]

        # Guard NaN
        if any(_isnan(v) for v in (ema9_4h, ema26_4h, atr_val, ema9_1h)):
            return None

        # (1) 4H: EMA9 > EMA26
        if ema9_4h <= ema26_4h:
            return None

        # (2) 4H: Price wicked to EMA9 (low within 0.2% of EMA9) AND closed above EMA9
        tolerance = ema9_4h * (settings.EMA_PULLBACK_TOLERANCE_PCT / 100.0)
        if latest_4h.low > ema9_4h + tolerance:
            return None  # Didn't pull back close enough
        if latest_4h.close < ema9_4h:
            return None  # Closed below EMA9

        # (3) 4H: Bullish confirmation candle (close > open, body >= 50% of range)
        if latest_4h.close <= latest_4h.open:
            return None
        candle_range = latest_4h.high - latest_4h.low
        if candle_range == 0:
            return None
        body = latest_4h.close - latest_4h.open
        body_ratio = body / candle_range
        if body_ratio < settings.EMA_BODY_RATIO_MIN:
            return None

        # (4) 1H: Latest close > EMA9 on 1H AND latest close > latest open
        if latest_1h.close <= ema9_1h:
            return None
        if latest_1h.close <= latest_1h.open:
            return None

        # (5) Stop calculation: max of the two candidates (closer to entry for long)
        entry_price = latest_4h.close
        stop_ema = ema26_4h * (1.0 - settings.EMA_STOP_BUFFER_PCT)
        stop_atr = entry_price - settings.ATR_STOP_MULTIPLIER * atr_val
        stop_price = max(stop_ema, stop_atr)  # higher = closer to entry for long

        # Sanity: stop must be below entry for a long
        if stop_price >= entry_price:
            logger.debug("long_stop_above_entry", stop=stop_price, entry=entry_price)
            return None

        # (6) Target = entry + MIN_RR_RATIO * risk
        risk = entry_price - stop_price
        target_price = entry_price + settings.MIN_RR_RATIO * risk

        # (7) R:R check
        rr = (target_price - entry_price) / risk if risk > 0 else 0.0
        if rr < settings.MIN_RR_RATIO:
            return None

        indicators = self._build_indicator_snapshot(
            candles_4h, candles_1h, ema_fast_4h, ema_slow_4h, atr_4h,
        )

        logger.info(
            "long_signal_generated",
            strategy="ema_trend",
            entry=round(entry_price, 2),
            stop=round(stop_price, 2),
            target=round(target_price, 2),
            rr=round(rr, 2),
            regime=regime,
        )

        return Signal(
            direction="long",
            entry_price=entry_price,
            stop_price=stop_price,
            target_price=target_price,
            strategy="ema_trend",
            regime=regime,
            rr_ratio=round(rr, 2),
            indicators=indicators,
        )

    # ------------------------------------------------------------------
    # Short
    # ------------------------------------------------------------------

    def _check_short(
        self,
        candles_4h: list[Candle],
        candles_1h: list[Candle],
        regime: str,
    ) -> Optional[Signal]:
        closes_4h = [c.close for c in candles_4h]
        highs_4h = [c.high for c in candles_4h]
        lows_4h = [c.low for c in candles_4h]
        closes_1h = [c.close for c in candles_1h]

        ema_fast_4h = calc_ema(closes_4h, settings.EMA_FAST_PERIOD)
        ema_slow_4h = calc_ema(closes_4h, settings.EMA_SLOW_PERIOD)
        atr_4h = calc_atr(highs_4h, lows_4h, closes_4h, settings.ATR_PERIOD)
        ema_fast_1h = calc_ema(closes_1h, settings.EMA_FAST_PERIOD)

        latest_4h = candles_4h[-1]
        latest_1h = candles_1h[-1]

        ema9_4h = ema_fast_4h[-1]
        ema26_4h = ema_slow_4h[-1]
        atr_val = atr_4h[-1]
        ema9_1h = ema_fast_1h[-1]

        if any(_isnan(v) for v in (ema9_4h, ema26_4h, atr_val, ema9_1h)):
            return None

        # (1) 4H: EMA9 < EMA26
        if ema9_4h >= ema26_4h:
            return None

        # (2) 4H: Price wicked up to EMA9 (high within 0.2% of EMA9) AND closed below EMA9
        tolerance = ema9_4h * (settings.EMA_PULLBACK_TOLERANCE_PCT / 100.0)
        if latest_4h.high < ema9_4h - tolerance:
            return None  # Didn't rally close enough to EMA9
        if latest_4h.close > ema9_4h:
            return None  # Closed above EMA9

        # (3) 4H: Bearish confirmation candle (close < open, body >= 50% of range)
        if latest_4h.close >= latest_4h.open:
            return None
        candle_range = latest_4h.high - latest_4h.low
        if candle_range == 0:
            return None
        body = latest_4h.open - latest_4h.close
        body_ratio = body / candle_range
        if body_ratio < settings.EMA_BODY_RATIO_MIN:
            return None

        # (4) 1H: Latest close < EMA9 on 1H AND latest close < latest open
        if latest_1h.close >= ema9_1h:
            return None
        if latest_1h.close >= latest_1h.open:
            return None

        # (5) Stop: min of the two candidates (closer to entry for short = lower value is farther)
        entry_price = latest_4h.close
        stop_ema = ema26_4h * (1.0 + settings.EMA_STOP_BUFFER_PCT)
        stop_atr = entry_price + settings.ATR_STOP_MULTIPLIER * atr_val
        stop_price = min(stop_ema, stop_atr)  # lower = closer to entry for short

        # Sanity: stop must be above entry for a short
        if stop_price <= entry_price:
            logger.debug("short_stop_below_entry", stop=stop_price, entry=entry_price)
            return None

        # (6) Target
        risk = stop_price - entry_price
        target_price = entry_price - settings.MIN_RR_RATIO * risk

        # (7) R:R check
        rr = (entry_price - target_price) / risk if risk > 0 else 0.0
        if rr < settings.MIN_RR_RATIO:
            return None

        indicators = self._build_indicator_snapshot(
            candles_4h, candles_1h, ema_fast_4h, ema_slow_4h, atr_4h,
        )

        logger.info(
            "short_signal_generated",
            strategy="ema_trend",
            entry=round(entry_price, 2),
            stop=round(stop_price, 2),
            target=round(target_price, 2),
            rr=round(rr, 2),
            regime=regime,
        )

        return Signal(
            direction="short",
            entry_price=entry_price,
            stop_price=stop_price,
            target_price=target_price,
            strategy="ema_trend",
            regime=regime,
            rr_ratio=round(rr, 2),
            indicators=indicators,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _build_indicator_snapshot(
        candles_4h: list[Candle],
        candles_1h: list[Candle],
        ema_fast_4h: list[float],
        ema_slow_4h: list[float],
        atr_4h: list[float],
    ) -> dict:
        """Build a JSON-serializable indicator dict for the trade record."""
        closes_4h = [c.close for c in candles_4h]
        highs_4h = [c.high for c in candles_4h]
        lows_4h = [c.low for c in candles_4h]
        closes_1h = [c.close for c in candles_1h]

        rsi_4h = calc_rsi(closes_4h, settings.RSI_PERIOD)
        adx_4h = calc_adx(highs_4h, lows_4h, closes_4h, 14)
        bb_u, bb_m, bb_l = bollinger_bands(closes_4h, settings.BB_PERIOD, settings.BB_STD_DEV)
        bw = calc_bb_bandwidth(bb_u, bb_m, bb_l)
        slope = calc_ema_slope(ema_fast_4h, lookback=5)

        ema_fast_1h = calc_ema(closes_1h, settings.EMA_FAST_PERIOD)
        rsi_1h = calc_rsi(closes_1h, settings.RSI_PERIOD)

        def _safe(v: float) -> float | None:
            return round(v, 6) if not _isnan(v) else None

        return {
            "tf_4h": {
                "ema9": _safe(ema_fast_4h[-1]),
                "ema26": _safe(ema_slow_4h[-1]),
                "ema_slope": _safe(slope),
                "rsi": _safe(rsi_4h[-1]),
                "adx": _safe(adx_4h[-1]),
                "atr": _safe(atr_4h[-1]),
                "bb_upper": _safe(bb_u[-1]),
                "bb_middle": _safe(bb_m[-1]),
                "bb_lower": _safe(bb_l[-1]),
                "bb_bandwidth": _safe(bw[-1]),
            },
            "tf_1h": {
                "ema9": _safe(ema_fast_1h[-1]),
                "rsi": _safe(rsi_1h[-1]),
            },
        }
