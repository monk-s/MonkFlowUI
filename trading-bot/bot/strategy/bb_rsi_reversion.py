"""
Bollinger Band + RSI mean-reversion strategy.

Long signal (ALL must be true):
  1. 4H: Candle low <= lower BB
  2. 4H: RSI <= 30
  3. 4H: Candle close > lower BB (closed back inside)
  4. 4H: BB bandwidth <= 1.2x 20-period avg AND >= 0.5x avg
  5. 1H: RSI turning up (current > previous)
  6. Stop = lower BB - 1*ATR
  7. Target = middle band, or upper band if middle band gives R:R < 2.0
  8. R:R must be >= 2.0

Short signal: all conditions inverted.
"""

from __future__ import annotations

import math
from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    atr as calc_atr,
    bb_bandwidth as calc_bb_bandwidth,
    bollinger_bands,
    ema as calc_ema,
    ema_slope as calc_ema_slope,
    rsi as calc_rsi,
    adx as calc_adx,
)
from bot.strategy.base import Signal, StrategyBase
from bot.strategy.regime_detector import RegimeDetector
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("bb_rsi_reversion")


class BBRSIReversionStrategy(StrategyBase):
    """BB + RSI mean-reversion for ranging markets."""

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

        bb_upper, bb_mid, bb_lower = bollinger_bands(
            closes_4h, settings.BB_PERIOD, settings.BB_STD_DEV,
        )
        rsi_4h = calc_rsi(closes_4h, settings.RSI_PERIOD)
        atr_4h = calc_atr(highs_4h, lows_4h, closes_4h, settings.ATR_PERIOD)
        bw_values = calc_bb_bandwidth(bb_upper, bb_mid, bb_lower)
        rsi_1h = calc_rsi(closes_1h, settings.RSI_PERIOD)

        latest_4h = candles_4h[-1]

        lower_bb = bb_lower[-1]
        middle_bb = bb_mid[-1]
        upper_bb = bb_upper[-1]
        rsi_val = rsi_4h[-1]
        atr_val = atr_4h[-1]

        # Guard NaN
        if any(_isnan(v) for v in (lower_bb, middle_bb, upper_bb, rsi_val, atr_val)):
            return None

        # Need at least 2 RSI values on 1H for "turning up" check
        rsi_1h_curr = rsi_1h[-1] if rsi_1h else float("nan")
        rsi_1h_prev = rsi_1h[-2] if len(rsi_1h) >= 2 else float("nan")
        if _isnan(rsi_1h_curr) or _isnan(rsi_1h_prev):
            return None

        # (1) 4H: Candle low <= lower BB
        if latest_4h.low > lower_bb:
            return None

        # (2) 4H: RSI <= 30
        if rsi_val > settings.RSI_OVERSOLD:
            return None

        # (3) 4H: Candle close > lower BB (closed back inside)
        if latest_4h.close <= lower_bb:
            return None

        # (4) 4H: BB bandwidth within normal range
        if not self._bandwidth_in_range(bw_values):
            return None

        # (5) 1H: RSI turning up
        if rsi_1h_curr <= rsi_1h_prev:
            return None

        # (6) Stop = lower BB - 1*ATR
        entry_price = latest_4h.close
        stop_price = lower_bb - 1.0 * atr_val

        if stop_price >= entry_price:
            logger.debug("long_stop_above_entry", stop=stop_price, entry=entry_price)
            return None

        # (7) Target = middle band; escalate to upper band if R:R < 2.0
        risk = entry_price - stop_price
        target_price = middle_bb

        if risk > 0:
            rr = (target_price - entry_price) / risk
        else:
            return None

        if rr < settings.MIN_RR_RATIO:
            target_price = upper_bb
            rr = (target_price - entry_price) / risk

        # (8) Final R:R check
        if rr < settings.MIN_RR_RATIO:
            return None

        indicators = self._build_indicator_snapshot(
            candles_4h, candles_1h, bb_upper, bb_mid, bb_lower,
            bw_values, rsi_4h, atr_4h,
        )

        logger.info(
            "long_signal_generated",
            strategy="bb_rsi_reversion",
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
            strategy="bb_rsi_reversion",
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

        bb_upper, bb_mid, bb_lower = bollinger_bands(
            closes_4h, settings.BB_PERIOD, settings.BB_STD_DEV,
        )
        rsi_4h = calc_rsi(closes_4h, settings.RSI_PERIOD)
        atr_4h = calc_atr(highs_4h, lows_4h, closes_4h, settings.ATR_PERIOD)
        bw_values = calc_bb_bandwidth(bb_upper, bb_mid, bb_lower)
        rsi_1h = calc_rsi(closes_1h, settings.RSI_PERIOD)

        latest_4h = candles_4h[-1]

        lower_bb = bb_lower[-1]
        middle_bb = bb_mid[-1]
        upper_bb = bb_upper[-1]
        rsi_val = rsi_4h[-1]
        atr_val = atr_4h[-1]

        if any(_isnan(v) for v in (lower_bb, middle_bb, upper_bb, rsi_val, atr_val)):
            return None

        rsi_1h_curr = rsi_1h[-1] if rsi_1h else float("nan")
        rsi_1h_prev = rsi_1h[-2] if len(rsi_1h) >= 2 else float("nan")
        if _isnan(rsi_1h_curr) or _isnan(rsi_1h_prev):
            return None

        # (1) 4H: Candle high >= upper BB
        if latest_4h.high < upper_bb:
            return None

        # (2) 4H: RSI >= 70
        if rsi_val < settings.RSI_OVERBOUGHT:
            return None

        # (3) 4H: Candle close < upper BB (closed back inside)
        if latest_4h.close >= upper_bb:
            return None

        # (4) 4H: BB bandwidth within normal range
        if not self._bandwidth_in_range(bw_values):
            return None

        # (5) 1H: RSI turning down
        if rsi_1h_curr >= rsi_1h_prev:
            return None

        # (6) Stop = upper BB + 1*ATR
        entry_price = latest_4h.close
        stop_price = upper_bb + 1.0 * atr_val

        if stop_price <= entry_price:
            logger.debug("short_stop_below_entry", stop=stop_price, entry=entry_price)
            return None

        # (7) Target = middle band; escalate to lower band if R:R < 2.0
        risk = stop_price - entry_price
        target_price = middle_bb

        if risk > 0:
            rr = (entry_price - target_price) / risk
        else:
            return None

        if rr < settings.MIN_RR_RATIO:
            target_price = lower_bb
            rr = (entry_price - target_price) / risk

        # (8) Final R:R check
        if rr < settings.MIN_RR_RATIO:
            return None

        indicators = self._build_indicator_snapshot(
            candles_4h, candles_1h, bb_upper, bb_mid, bb_lower,
            bw_values, rsi_4h, atr_4h,
        )

        logger.info(
            "short_signal_generated",
            strategy="bb_rsi_reversion",
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
            strategy="bb_rsi_reversion",
            regime=regime,
            rr_ratio=round(rr, 2),
            indicators=indicators,
        )

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _bandwidth_in_range(bw_values: list[float]) -> bool:
        """
        True if latest bandwidth is between 0.5x and 1.2x the 20-period average.
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

    @staticmethod
    def _build_indicator_snapshot(
        candles_4h: list[Candle],
        candles_1h: list[Candle],
        bb_upper: list[float],
        bb_mid: list[float],
        bb_lower: list[float],
        bw_values: list[float],
        rsi_4h: list[float],
        atr_4h: list[float],
    ) -> dict:
        """Build a JSON-serializable indicator dict for the trade record."""
        closes_4h = [c.close for c in candles_4h]
        highs_4h = [c.high for c in candles_4h]
        lows_4h = [c.low for c in candles_4h]
        closes_1h = [c.close for c in candles_1h]

        ema_fast_4h = calc_ema(closes_4h, settings.EMA_FAST_PERIOD)
        ema_slow_4h = calc_ema(closes_4h, settings.EMA_SLOW_PERIOD)
        adx_4h = calc_adx(highs_4h, lows_4h, closes_4h, 14)
        slope = calc_ema_slope(ema_fast_4h, lookback=5)

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
                "bb_upper": _safe(bb_upper[-1]),
                "bb_middle": _safe(bb_mid[-1]),
                "bb_lower": _safe(bb_lower[-1]),
                "bb_bandwidth": _safe(bw_values[-1]),
            },
            "tf_1h": {
                "rsi": _safe(rsi_1h[-1]),
                "rsi_prev": _safe(rsi_1h[-2]) if len(rsi_1h) >= 2 else None,
            },
        }
