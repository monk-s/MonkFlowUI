"""
Daily trend-following engine for v3 research.

Long-only by default (research shows crypto trend-following works best long;
crypto often crashes much faster than it falls in real bear markets, making
short trend signals fail). Optionally enable shorts via constructor.

Entry: daily close breaks above N-day Donchian high (channel) AND ADX > min.
Exit: trailing stop in % from peak since entry.

Designed for daily bars. Friction at daily timeframe is dramatically lower
than 1H/4H — typical entries have stops 4-8% away (vs 0.5-2% on 1H), so
fees + stop-limit slippage become 5-10% of risk instead of 50-100%.

Two flavors of entry signal:
  - "donchian": close > rolling N-day high
  - "ma_cross": EMA(fast) crosses above EMA(slow)
"""

from __future__ import annotations

from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    adx as calc_adx,
    atr as calc_atr,
    ema as calc_ema,
)
from scripts.v2_engines.ema_trend_v2 import V2Signal


class DailyTrendV2:
    """Daily long-only trend follower (Donchian or MA-cross)."""

    def __init__(
        self,
        mode: str = "donchian",  # "donchian" or "ma_cross"
        channel_period: int = 20,
        ma_fast: int = 20,
        ma_slow: int = 50,
        adx_period: int = 14,
        atr_period: int = 14,
        min_adx: float = 20.0,  # daily ADX runs lower than 1H
        atr_stop_multiplier: float = 2.0,
        trail_pct: float = 12.0,        # 12% retracement from peak triggers exit
        cooldown_bars: int = 5,
        allow_shorts: bool = False,
        min_stop_distance_pct: float = 1.0,
    ) -> None:
        assert mode in ("donchian", "ma_cross")
        self.mode = mode
        self.channel_period = channel_period
        self.ma_fast = ma_fast
        self.ma_slow = ma_slow
        self.adx_period = adx_period
        self.atr_period = atr_period
        self.min_adx = min_adx
        self.atr_stop_multiplier = atr_stop_multiplier
        self.trail_pct = trail_pct
        self.cooldown_bars = cooldown_bars
        self.allow_shorts = allow_shorts
        self.min_stop_distance_pct = min_stop_distance_pct

    def evaluate(
        self,
        candles: list[Candle],
        symbol: str,
        regime: str,
    ) -> Optional[V2Signal]:
        need = max(60, self.channel_period + self.cooldown_bars + 2, self.ma_slow + 2)
        if len(candles) < need:
            return None

        sig = self._check_long(candles, symbol, regime)
        if sig is not None:
            return sig
        if self.allow_shorts:
            return self._check_short(candles, symbol, regime)
        return None

    # ------------------------------------------------------------------
    def _common(self, candles: list[Candle]) -> Optional[dict]:
        closes = [c.close for c in candles]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]

        adx_v = calc_adx(highs, lows, closes, self.adx_period)
        atr_v = calc_atr(highs, lows, closes, self.atr_period)

        adx_val = adx_v[-1]
        atr_val = atr_v[-1]
        if any(_isnan(v) for v in (adx_val, atr_val)):
            return None

        latest = candles[-1]
        prev_window = candles[-(self.channel_period + 1):-1]
        if len(prev_window) < self.channel_period:
            return None
        channel_high = max(c.high for c in prev_window)
        channel_low = min(c.low for c in prev_window)
        channel_mid = (channel_high + channel_low) / 2.0

        # Cooldown window (excluding latest bar)
        cool_start = max(0, len(candles) - 1 - self.cooldown_bars)
        cooldown = candles[cool_start:-1]
        recent_long_breakout = any(c.close > channel_high for c in cooldown)
        recent_short_breakout = any(c.close < channel_low for c in cooldown)

        # MA cross state (used in ma_cross mode)
        ema_f = calc_ema(closes, self.ma_fast)
        ema_s = calc_ema(closes, self.ma_slow)
        ef_now = ema_f[-1]
        es_now = ema_s[-1]
        ef_prev = ema_f[-2] if len(ema_f) >= 2 else float("nan")
        es_prev = ema_s[-2] if len(ema_s) >= 2 else float("nan")

        if any(_isnan(v) for v in (ef_now, es_now, ef_prev, es_prev)):
            ma_long_signal = False
            ma_short_signal = False
        else:
            # "Just crossed" = today fast>slow but yesterday fast<=slow
            ma_long_signal = (ef_now > es_now) and (ef_prev <= es_prev)
            ma_short_signal = (ef_now < es_now) and (ef_prev >= es_prev)

        return dict(
            latest=latest,
            channel_high=channel_high, channel_low=channel_low, channel_mid=channel_mid,
            adx=adx_val, atr=atr_val,
            recent_long_breakout=recent_long_breakout,
            recent_short_breakout=recent_short_breakout,
            ma_long_signal=ma_long_signal, ma_short_signal=ma_short_signal,
            ef=ef_now, es=es_now,
        )

    def _check_long(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        # 1. Entry signal
        if self.mode == "donchian":
            if L.close <= ind["channel_high"]:
                return None
            if ind["recent_long_breakout"]:
                return None  # already in breakout regime
        else:  # ma_cross
            if not ind["ma_long_signal"]:
                return None

        # 2. Trend strength
        if ind["adx"] < self.min_adx:
            return None

        # 3. Stop placement
        entry = L.close
        # For trend-following, use a WIDE stop (we want to give the position room)
        # Stop = entry - atr_mult × ATR, OR channel midpoint, whichever is FURTHER
        stop_atr = entry - self.atr_stop_multiplier * ind["atr"]
        stop_chan = ind["channel_mid"]
        stop = min(stop_atr, stop_chan)  # min = further from entry (lower) for long
        if stop >= entry:
            return None

        # 4. Min stop distance
        if (entry - stop) / entry < (self.min_stop_distance_pct / 100.0):
            return None

        # 5. Target — far out, the trailing stop does the real exit work
        risk = entry - stop
        target = entry + 20.0 * risk  # 20R "target" = essentially uncapped
        rr = (target - entry) / risk

        return V2Signal(
            direction="long",
            symbol=symbol,
            engine=f"daily_trend_{self.mode}",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "channel_high": ind["channel_high"], "channel_low": ind["channel_low"],
                "adx": ind["adx"], "atr": ind["atr"],
                "ema_fast": ind["ef"], "ema_slow": ind["es"],
                "mode": self.mode,
            },
            trail_pct=self.trail_pct,
        )

    def _check_short(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        if self.mode == "donchian":
            if L.close >= ind["channel_low"]:
                return None
            if ind["recent_short_breakout"]:
                return None
        else:
            if not ind["ma_short_signal"]:
                return None

        if ind["adx"] < self.min_adx:
            return None

        entry = L.close
        stop_atr = entry + self.atr_stop_multiplier * ind["atr"]
        stop_chan = ind["channel_mid"]
        stop = max(stop_atr, stop_chan)  # max = further from entry (higher) for short
        if stop <= entry:
            return None

        if (stop - entry) / entry < (self.min_stop_distance_pct / 100.0):
            return None

        risk = stop - entry
        target = entry - 20.0 * risk
        rr = (entry - target) / risk

        return V2Signal(
            direction="short",
            symbol=symbol,
            engine=f"daily_trend_{self.mode}",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "channel_high": ind["channel_high"], "channel_low": ind["channel_low"],
                "adx": ind["adx"], "atr": ind["atr"],
                "ema_fast": ind["ef"], "ema_slow": ind["es"],
                "mode": self.mode,
            },
            trail_pct=self.trail_pct,
        )
