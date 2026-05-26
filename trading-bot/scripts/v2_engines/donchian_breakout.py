"""
v2 Donchian Channel Breakout engine — 1H.

Iteration C of v2 redesign. Pullback strategies (ema_trend_v2 iterations A
and B) showed ~40% win rate but never beat friction. This pivots to a
fundamentally different signal class — trend-following / momentum breakout
— to test whether the strategy CLASS was the problem, not the filter
strength.

Entry rules (long; short is mirror):
  1. Close above the rolling N-bar HIGHEST HIGH (channel breakout up)
  2. ADX ≥ min_adx (confirm we're in a trending market)
  3. Volume > volume_mult × avg(volume, N) (real participation)
  4. NOT inside the last K bars of an already-completed breakout
     (no double-fires)
  5. Stop at the channel midpoint, capped by max stop distance
  6. Target = fixed R:R multiple of risk

Note: still subject to the same min stop distance filter as
ema_trend_v2 iter-A/B — tiny stops get crushed by margin-cap fee
distortion.
"""

from __future__ import annotations

from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    adx as calc_adx,
    atr as calc_atr,
)
from scripts.v2_engines.ema_trend_v2 import V2Signal


class DonchianBreakoutV2:
    """1H Donchian channel breakout. Stateless."""

    def __init__(
        self,
        channel_period: int = 20,
        adx_period: int = 14,
        atr_period: int = 14,
        min_adx: float = 25.0,
        volume_mult: float = 1.2,
        volume_lookback: int = 20,
        atr_stop_multiplier: float = 1.5,
        min_rr_ratio: float = 2.0,
        min_stop_distance_pct: float = 0.5,
        # Reject if we already broke out within the last `cooldown_bars`
        cooldown_bars: int = 10,
    ) -> None:
        self.channel_period = channel_period
        self.adx_period = adx_period
        self.atr_period = atr_period
        self.min_adx = min_adx
        self.volume_mult = volume_mult
        self.volume_lookback = volume_lookback
        self.atr_stop_multiplier = atr_stop_multiplier
        self.min_rr_ratio = min_rr_ratio
        self.min_stop_distance_pct = min_stop_distance_pct
        self.cooldown_bars = cooldown_bars

    def evaluate(
        self,
        candles: list[Candle],
        symbol: str,
        regime: str,
    ) -> Optional[V2Signal]:
        if len(candles) < max(50, self.channel_period + self.cooldown_bars + 2):
            return None

        sig = self._check_long(candles, symbol, regime)
        if sig is not None:
            return sig
        return self._check_short(candles, symbol, regime)

    # ------------------------------------------------------------------
    def _common(self, candles: list[Candle]) -> Optional[dict]:
        closes = [c.close for c in candles]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        volumes = [c.volume for c in candles]

        adx_v = calc_adx(highs, lows, closes, self.adx_period)
        atr_v = calc_atr(highs, lows, closes, self.atr_period)

        adx_val = adx_v[-1]
        atr_val = atr_v[-1]
        if any(_isnan(v) for v in (adx_val, atr_val)):
            return None

        latest = candles[-1]
        # Channel = max-high / min-low over the PRIOR N bars (excluding latest)
        prev_window = candles[-(self.channel_period + 1):-1]
        if len(prev_window) < self.channel_period:
            return None
        channel_high = max(c.high for c in prev_window)
        channel_low = min(c.low for c in prev_window)
        channel_mid = (channel_high + channel_low) / 2.0

        # Average volume over the same prior window
        recent_vol = volumes[-(self.volume_lookback + 1):-1]
        avg_volume = sum(recent_vol) / len(recent_vol) if recent_vol else 0

        # Cooldown: is this bar within `cooldown_bars` of a previous breakout?
        cool_start = max(0, len(candles) - 1 - self.cooldown_bars)
        # Only the bars BEFORE the latest one count; cooldown_window excludes latest
        cooldown_window = candles[cool_start:-1]

        return dict(
            latest=latest,
            channel_high=channel_high, channel_low=channel_low, channel_mid=channel_mid,
            adx=adx_val, atr=atr_val,
            avg_volume=avg_volume,
            cooldown_window=cooldown_window,
        )

    def _has_recent_long_breakout(self, cooldown_window: list[Candle], channel_high: float) -> bool:
        return any(c.close > channel_high for c in cooldown_window)

    def _has_recent_short_breakout(self, cooldown_window: list[Candle], channel_low: float) -> bool:
        return any(c.close < channel_low for c in cooldown_window)

    # ------------------------------------------------------------------
    def _check_long(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        # 1. Breakout above channel high (close, not just wick)
        if L.close <= ind["channel_high"]:
            return None

        # 2. Trend strength
        if ind["adx"] < self.min_adx:
            return None

        # 3. Volume confirmation
        if ind["avg_volume"] > 0 and L.volume < ind["avg_volume"] * self.volume_mult:
            return None

        # 4. Cooldown — don't re-enter on a continuation of a recent breakout
        if self._has_recent_long_breakout(ind["cooldown_window"], ind["channel_high"]):
            return None

        # 5. Stop = channel midpoint, or 1.5× ATR below entry — whichever closer
        entry = L.close
        stop_mid = ind["channel_mid"]
        stop_atr = entry - self.atr_stop_multiplier * ind["atr"]
        stop = max(stop_mid, stop_atr)
        if stop >= entry:
            return None

        # 5b. Min stop distance
        if (entry - stop) / entry < (self.min_stop_distance_pct / 100.0):
            return None

        # 6. Target = entry + min_rr_ratio × risk
        risk = entry - stop
        target = entry + self.min_rr_ratio * risk
        rr = (target - entry) / risk
        if rr < self.min_rr_ratio:
            return None

        return V2Signal(
            direction="long",
            symbol=symbol,
            engine="donchian_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "channel_high": ind["channel_high"], "channel_low": ind["channel_low"],
                "channel_mid": ind["channel_mid"],
                "adx": ind["adx"], "atr": ind["atr"],
                "volume": L.volume, "avg_volume": ind["avg_volume"],
            },
        )

    def _check_short(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        # 1. Breakdown below channel low
        if L.close >= ind["channel_low"]:
            return None

        # 2. Trend strength
        if ind["adx"] < self.min_adx:
            return None

        # 3. Volume
        if ind["avg_volume"] > 0 and L.volume < ind["avg_volume"] * self.volume_mult:
            return None

        # 4. Cooldown
        if self._has_recent_short_breakout(ind["cooldown_window"], ind["channel_low"]):
            return None

        # 5. Stop
        entry = L.close
        stop_mid = ind["channel_mid"]
        stop_atr = entry + self.atr_stop_multiplier * ind["atr"]
        stop = min(stop_mid, stop_atr)
        if stop <= entry:
            return None

        # 5b. Min stop distance
        if (stop - entry) / entry < (self.min_stop_distance_pct / 100.0):
            return None

        # 6. Target
        risk = stop - entry
        target = entry - self.min_rr_ratio * risk
        rr = (entry - target) / risk
        if rr < self.min_rr_ratio:
            return None

        return V2Signal(
            direction="short",
            symbol=symbol,
            engine="donchian_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "channel_high": ind["channel_high"], "channel_low": ind["channel_low"],
                "channel_mid": ind["channel_mid"],
                "adx": ind["adx"], "atr": ind["atr"],
                "volume": L.volume, "avg_volume": ind["avg_volume"],
            },
        )
