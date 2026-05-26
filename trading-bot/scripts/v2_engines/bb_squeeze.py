"""
v2 Bollinger Band Squeeze Breakout engine — 1H timeframe.

Replaces v1 BB/RSI Mean Reversion (which never fired because it required
regime=ranging that the regime detector almost never produces).

Long entry (ALL must be true):
  1. BB bandwidth contracted: bandwidth < SQUEEZE_THRESHOLD × 20-period avg bandwidth
  2. Latest candle closes ABOVE upper BB (breakout up)
  3. RSI(14) > 50 (momentum confirmation, but not overbought)
  4. Volume > VOLUME_MULTIPLIER × 20-period avg volume (real participation)
  5. Stop = lower BB of breakout candle, OR entry - ATR_MULTIPLIER × ATR (whichever closer)
  6. Target = entry + RANGE_PROJECTION × (recent N-bar high - low)
  7. R:R >= MIN_RR_RATIO

Short entry: mirror.

Decoupled from RegimeDetector. Can fire in any regime that's not actively
trending in the OPPOSITE direction (we filter that with the RSI/momentum
checks rather than the regime detector).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    atr as calc_atr,
    bb_bandwidth as calc_bb_bandwidth,
    bollinger_bands,
    rsi as calc_rsi,
)
from scripts.v2_engines.ema_trend_v2 import V2Signal


class BBSqueezeV2:
    """1H Bollinger Squeeze Breakout. Stateless."""

    def __init__(
        self,
        bb_period: int = 20,
        bb_std: float = 2.0,
        rsi_period: int = 14,
        atr_period: int = 14,
        squeeze_threshold: float = 0.7,        # bandwidth < 0.7× avg = squeeze
        squeeze_lookback: int = 20,            # avg bandwidth lookback
        volume_multiplier: float = 1.2,        # need 1.2× avg volume
        volume_lookback: int = 20,
        rsi_long_min: float = 50.0,            # RSI must be > 50 for long
        rsi_short_max: float = 50.0,           # RSI must be < 50 for short
        range_lookback: int = 10,              # bars to look back for range projection
        range_projection: float = 1.5,         # target = 1.5× recent range
        atr_stop_multiplier: float = 1.0,
        min_rr_ratio: float = 1.5,
    ) -> None:
        self.bb_period = bb_period
        self.bb_std = bb_std
        self.rsi_period = rsi_period
        self.atr_period = atr_period
        self.squeeze_threshold = squeeze_threshold
        self.squeeze_lookback = squeeze_lookback
        self.volume_multiplier = volume_multiplier
        self.volume_lookback = volume_lookback
        self.rsi_long_min = rsi_long_min
        self.rsi_short_max = rsi_short_max
        self.range_lookback = range_lookback
        self.range_projection = range_projection
        self.atr_stop_multiplier = atr_stop_multiplier
        self.min_rr_ratio = min_rr_ratio

    def evaluate(
        self,
        candles: list[Candle],
        symbol: str,
        regime: str,
    ) -> Optional[V2Signal]:
        if len(candles) < max(50, self.squeeze_lookback + self.bb_period):
            return None

        signal = self._check_long(candles, symbol, regime)
        if signal is not None:
            return signal
        return self._check_short(candles, symbol, regime)

    # ------------------------------------------------------------------
    def _common(self, candles: list[Candle]) -> Optional[dict]:
        """Compute shared indicators. Return None if data invalid."""
        closes = [c.close for c in candles]
        highs = [c.high for c in candles]
        lows = [c.low for c in candles]
        volumes = [c.volume for c in candles]

        bb_u, bb_m, bb_l = bollinger_bands(closes, self.bb_period, self.bb_std)
        bw = calc_bb_bandwidth(bb_u, bb_m, bb_l)
        rsi_v = calc_rsi(closes, self.rsi_period)
        atr_v = calc_atr(highs, lows, closes, self.atr_period)

        # Current bar values
        latest = candles[-1]
        bb_upper = bb_u[-1]
        bb_middle = bb_m[-1]
        bb_lower = bb_l[-1]
        bandwidth = bw[-1]
        rsi_val = rsi_v[-1]
        atr_val = atr_v[-1]

        if any(_isnan(v) for v in (bb_upper, bb_lower, bandwidth, rsi_val, atr_val)):
            return None

        # Squeeze detection: PRIOR bar's bandwidth (not current — current
        # bar expands bandwidth on breakout) compared to a LONGER history.
        # We want: "the bar before the breakout was in a squeeze".
        prev_bw = bw[-2] if len(bw) >= 2 else float("nan")
        # Longer window = past 60 bars excluding the last (prev) bar
        long_window = self.squeeze_lookback * 3
        longer_bw = [b for b in bw[-(long_window + 2):-2] if not _isnan(b)]
        if len(longer_bw) < long_window // 2 or _isnan(prev_bw):
            return None
        longer_avg_bw = sum(longer_bw) / len(longer_bw)
        is_squeeze = prev_bw < longer_avg_bw * self.squeeze_threshold

        # Avg volume
        recent_vol = volumes[-(self.volume_lookback + 1):-1]
        avg_volume = sum(recent_vol) / len(recent_vol) if recent_vol else 0

        # Recent N-bar range for target projection
        recent_window = candles[-(self.range_lookback + 1):-1]
        recent_high = max(c.high for c in recent_window) if recent_window else latest.high
        recent_low = min(c.low for c in recent_window) if recent_window else latest.low
        recent_range = recent_high - recent_low

        return dict(
            latest=latest, bb_upper=bb_upper, bb_middle=bb_middle, bb_lower=bb_lower,
            bandwidth=bandwidth, prev_bandwidth=prev_bw, longer_avg_bw=longer_avg_bw,
            is_squeeze=is_squeeze, rsi=rsi_val, atr=atr_val,
            avg_volume=avg_volume, recent_range=recent_range,
        )

    def _check_long(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        # 1. Squeeze: prior bar's bandwidth was tight (we just exited a squeeze)
        if not ind["is_squeeze"]:
            return None

        # 2. Breakout above upper BB
        if L.close <= ind["bb_upper"]:
            return None
        if L.close <= L.open:  # Must be a green candle (close > open)
            return None

        # 3. RSI > 50 (momentum confirmation)
        if ind["rsi"] < self.rsi_long_min:
            return None

        # 4. Volume confirmation
        if ind["avg_volume"] > 0 and L.volume < ind["avg_volume"] * self.volume_multiplier:
            return None

        # 5. Stop: lower BB (of breakout candle) OR entry - 1×ATR, whichever closer
        entry = L.close
        stop_bb = ind["bb_lower"]
        stop_atr = entry - self.atr_stop_multiplier * ind["atr"]
        stop = max(stop_bb, stop_atr)  # higher = closer to entry for long
        if stop >= entry:
            return None

        # 6. Target: range projection
        target = entry + self.range_projection * ind["recent_range"]
        risk = entry - stop
        rr = (target - entry) / risk if risk > 0 else 0
        if rr < self.min_rr_ratio:
            return None

        return V2Signal(
            direction="long",
            symbol=symbol,
            engine="bb_squeeze_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "bb_upper": ind["bb_upper"], "bb_lower": ind["bb_lower"],
                "bandwidth": ind["bandwidth"], "prev_bandwidth": ind["prev_bandwidth"],
                "longer_avg_bw": ind["longer_avg_bw"],
                "rsi": ind["rsi"], "atr": ind["atr"], "volume": L.volume,
                "avg_volume": ind["avg_volume"],
            },
        )

    def _check_short(self, candles: list[Candle], symbol: str, regime: str) -> Optional[V2Signal]:
        ind = self._common(candles)
        if ind is None:
            return None
        L = ind["latest"]

        # 1. Squeeze: prior bar was in a squeeze (mirror of long side)
        if not ind["is_squeeze"]:
            return None

        # 2. Breakdown below lower BB, red candle
        if L.close >= ind["bb_lower"]:
            return None
        if L.close >= L.open:
            return None

        # 3. RSI < 50
        if ind["rsi"] > self.rsi_short_max:
            return None

        # 4. Volume
        if ind["avg_volume"] > 0 and L.volume < ind["avg_volume"] * self.volume_multiplier:
            return None

        # 5. Stop
        entry = L.close
        stop_bb = ind["bb_upper"]
        stop_atr = entry + self.atr_stop_multiplier * ind["atr"]
        stop = min(stop_bb, stop_atr)
        if stop <= entry:
            return None

        # 6. Target
        target = entry - self.range_projection * ind["recent_range"]
        risk = stop - entry
        rr = (entry - target) / risk if risk > 0 else 0
        if rr < self.min_rr_ratio:
            return None

        return V2Signal(
            direction="short",
            symbol=symbol,
            engine="bb_squeeze_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={
                "bb_upper": ind["bb_upper"], "bb_lower": ind["bb_lower"],
                "bandwidth": ind["bandwidth"], "prev_bandwidth": ind["prev_bandwidth"],
                "longer_avg_bw": ind["longer_avg_bw"],
                "rsi": ind["rsi"], "atr": ind["atr"], "volume": L.volume,
                "avg_volume": ind["avg_volume"],
            },
        )
