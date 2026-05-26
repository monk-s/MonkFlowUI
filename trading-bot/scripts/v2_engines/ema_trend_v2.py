"""
v2 EMA Trend Pullback strategy — 1H primary timeframe with 15m confirmation.

Differs from v1 (bot/strategy/ema_trend.py) by:
  - Operates on 1H primary + 15m confirmation (not 4H + 1H)
  - Looser pullback tolerance (0.3% vs 0.2%) for 1H noise
  - Lower min R:R (1.7 vs 2.0) — 1H targets fill faster
  - Parameters taken in constructor, NO settings.* globals (so backtest can
    parametrize freely without monkey-patching)

Logic is otherwise identical to v1: pullback to EMA9 in a confirmed trend +
bullish/bearish confirmation candle + lower-timeframe momentum alignment.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from bot.data.indicators import (
    Candle,
    _isnan,
    adx as calc_adx,
    atr as calc_atr,
    ema as calc_ema,
    ema_slope as calc_ema_slope,
)


@dataclass
class V2Signal:
    """Lightweight signal record for v2 backtest. Mirrors v1 Signal but adds engine."""
    direction: str           # "long" or "short"
    symbol: str
    engine: str
    entry_price: float
    stop_price: float
    target_price: float
    rr_ratio: float
    regime: str
    indicators: dict
    # Optional: if >0, manage exit via trailing stop (in % from extreme since entry)
    # rather than (or in addition to) fixed stop/target. Used by trend-followers.
    trail_pct: float = 0.0


class EMATrendV2:
    """1H-primary EMA Trend Pullback engine. Stateless — call evaluate() per closed 1H bar."""

    def __init__(
        self,
        ema_fast: int = 9,
        ema_slow: int = 26,
        atr_period: int = 14,
        adx_period: int = 14,
        pullback_tolerance_pct: float = 0.3,  # was 0.2 in v1
        body_ratio_min: float = 0.6,  # ITER-B: was 0.5 — demand stronger confirm
        ema_stop_buffer_pct: float = 0.003,
        atr_stop_multiplier: float = 3.0,  # ITER-D: was 1.5 — wider stops, less friction drag
        min_rr_ratio: float = 2.0,  # ITER-D: was 1.7 — pair wider stop with higher target
        # ── REDESIGN filters added 2026-05-21 after Phase 2 backtest FAIL ──
        # ADX filter: original v2 had no regime filter (regime="unknown"),
        # which is why expectancy went negative. v1 used ADX≥35 (too tight,
        # ~2 trades/month). ITER-A=28, ITER-B=32 (tighter, push win rate up).
        min_adx: float = 32.0,
        # ITER-D: widen min stop to 1.5% (was 0.5%). Friction analysis showed
        # 0.5% min stops put fixed-$ fees at 36% of R and stop-gap 100% of R.
        # 1.5% min stop drops both ~3×, collapsing friction floor from 0.96R
        # to ~0.35R per trade. Break-even win rate at 2R falls from 65% → ~45%.
        min_stop_distance_pct: float = 1.5,
        # ITER-B: require EMA26 slope in trade direction over `ema_slope_lookback`
        # bars. Catches the "EMA9 > EMA26 but trend already flattened" case.
        ema_slope_lookback: int = 10,
        min_ema_slope_pct: float = 0.10,  # 0.10% over 10 bars
    ) -> None:
        self.ema_fast = ema_fast
        self.ema_slow = ema_slow
        self.atr_period = atr_period
        self.adx_period = adx_period
        self.pullback_tolerance_pct = pullback_tolerance_pct
        self.body_ratio_min = body_ratio_min
        self.ema_stop_buffer_pct = ema_stop_buffer_pct
        self.atr_stop_multiplier = atr_stop_multiplier
        self.min_rr_ratio = min_rr_ratio
        self.min_adx = min_adx
        self.min_stop_distance_pct = min_stop_distance_pct
        self.ema_slope_lookback = ema_slope_lookback
        self.min_ema_slope_pct = min_ema_slope_pct

    def evaluate(
        self,
        candles_primary: list[Candle],   # 1H
        candles_confirm: list[Candle],   # 15m
        symbol: str,
        regime: str,
    ) -> Optional[V2Signal]:
        if len(candles_primary) < 50 or len(candles_confirm) < 50:
            return None

        signal = self._check_long(candles_primary, candles_confirm, symbol, regime)
        if signal is not None:
            return signal
        return self._check_short(candles_primary, candles_confirm, symbol, regime)

    # ------------------------------------------------------------------
    def _check_long(self, candles_p, candles_c, symbol, regime) -> Optional[V2Signal]:
        closes_p = [c.close for c in candles_p]
        highs_p = [c.high for c in candles_p]
        lows_p = [c.low for c in candles_p]
        closes_c = [c.close for c in candles_c]

        ema_f = calc_ema(closes_p, self.ema_fast)
        ema_s = calc_ema(closes_p, self.ema_slow)
        atr_v = calc_atr(highs_p, lows_p, closes_p, self.atr_period)
        adx_v = calc_adx(highs_p, lows_p, closes_p, self.adx_period)
        ema_f_c = calc_ema(closes_c, self.ema_fast)

        latest_p = candles_p[-1]
        latest_c = candles_c[-1]

        e9 = ema_f[-1]
        e26 = ema_s[-1]
        atr_val = atr_v[-1]
        adx_val = adx_v[-1]
        e9c = ema_f_c[-1]

        if any(_isnan(v) for v in (e9, e26, atr_val, adx_val, e9c)):
            return None

        # 0. NEW: ADX trend-strength filter (replaces missing regime gate)
        if adx_val < self.min_adx:
            return None

        # 0b. ITER-B: EMA26 slope must point UP for long
        e26_slope = calc_ema_slope(ema_s, lookback=self.ema_slope_lookback)
        if _isnan(e26_slope) or (e26_slope * 100.0) < self.min_ema_slope_pct:
            return None

        # 1. EMA9 > EMA26 on primary
        if e9 <= e26:
            return None

        # 2. Pullback to EMA9
        tolerance = e9 * (self.pullback_tolerance_pct / 100.0)
        if latest_p.low > e9 + tolerance:
            return None
        if latest_p.close < e9:
            return None

        # 3. Bullish confirmation candle
        if latest_p.close <= latest_p.open:
            return None
        rng = latest_p.high - latest_p.low
        if rng == 0:
            return None
        body = latest_p.close - latest_p.open
        if body / rng < self.body_ratio_min:
            return None

        # 4. 15m confirmation
        if latest_c.close <= e9c:
            return None
        if latest_c.close <= latest_c.open:
            return None

        # 5. Stop
        entry = latest_p.close
        stop_ema = e26 * (1.0 - self.ema_stop_buffer_pct)
        stop_atr = entry - self.atr_stop_multiplier * atr_val
        stop = max(stop_ema, stop_atr)  # closer to entry for long
        if stop >= entry:
            return None

        # 5b. NEW: min stop-distance filter — avoid the margin-cap → R distortion
        if (entry - stop) / entry < (self.min_stop_distance_pct / 100.0):
            return None

        # 6. Target
        risk = entry - stop
        target = entry + self.min_rr_ratio * risk
        rr = (target - entry) / risk
        if rr < self.min_rr_ratio:
            return None

        return V2Signal(
            direction="long",
            symbol=symbol,
            engine="ema_trend_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={"ema9": e9, "ema26": e26, "atr": atr_val, "adx": adx_val, "ema9_confirm": e9c},
        )

    # ------------------------------------------------------------------
    def _check_short(self, candles_p, candles_c, symbol, regime) -> Optional[V2Signal]:
        closes_p = [c.close for c in candles_p]
        highs_p = [c.high for c in candles_p]
        lows_p = [c.low for c in candles_p]
        closes_c = [c.close for c in candles_c]

        ema_f = calc_ema(closes_p, self.ema_fast)
        ema_s = calc_ema(closes_p, self.ema_slow)
        atr_v = calc_atr(highs_p, lows_p, closes_p, self.atr_period)
        adx_v = calc_adx(highs_p, lows_p, closes_p, self.adx_period)
        ema_f_c = calc_ema(closes_c, self.ema_fast)

        latest_p = candles_p[-1]
        latest_c = candles_c[-1]

        e9 = ema_f[-1]
        e26 = ema_s[-1]
        atr_val = atr_v[-1]
        adx_val = adx_v[-1]
        e9c = ema_f_c[-1]

        if any(_isnan(v) for v in (e9, e26, atr_val, adx_val, e9c)):
            return None

        # 0. NEW: ADX trend-strength filter (mirror of long side)
        if adx_val < self.min_adx:
            return None

        # 0b. ITER-B: EMA26 slope must point DOWN for short
        e26_slope = calc_ema_slope(ema_s, lookback=self.ema_slope_lookback)
        if _isnan(e26_slope) or (e26_slope * 100.0) > -self.min_ema_slope_pct:
            return None

        # 1. EMA9 < EMA26
        if e9 >= e26:
            return None

        # 2. Pullback up to EMA9 from below
        tolerance = e9 * (self.pullback_tolerance_pct / 100.0)
        if latest_p.high < e9 - tolerance:
            return None
        if latest_p.close > e9:
            return None

        # 3. Bearish confirmation
        if latest_p.close >= latest_p.open:
            return None
        rng = latest_p.high - latest_p.low
        if rng == 0:
            return None
        body = latest_p.open - latest_p.close
        if body / rng < self.body_ratio_min:
            return None

        # 4. 15m confirmation
        if latest_c.close >= e9c:
            return None
        if latest_c.close >= latest_c.open:
            return None

        # 5. Stop
        entry = latest_p.close
        stop_ema = e26 * (1.0 + self.ema_stop_buffer_pct)
        stop_atr = entry + self.atr_stop_multiplier * atr_val
        stop = min(stop_ema, stop_atr)
        if stop <= entry:
            return None

        # 5b. NEW: min stop-distance filter — avoid R-distortion from margin cap
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
            engine="ema_trend_v2",
            entry_price=entry,
            stop_price=stop,
            target_price=target,
            rr_ratio=round(rr, 3),
            regime=regime,
            indicators={"ema9": e9, "ema26": e26, "atr": atr_val, "adx": adx_val, "ema9_confirm": e9c},
        )
