"""
v3 grid strategy: pure level-generation logic.

This module is stateless and side-effect-free. It computes:
  - The active grid range (static or dynamic from recent N-day high/low)
  - The list of level prices within the range
  - Which levels are "buy" (below current price) vs "sell" (above)
  - When the next recenter should happen

State persistence lives in tb3_grid_state. Order management lives in
grid_order_manager. This module is the brain; those are the hands.

The dynamic-range backtest in scripts/grid_sim.py uses the SAME math
this module exposes — so live behavior matches the backtest by
construction.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Optional


@dataclass(frozen=True)
class GridRange:
    """Immutable description of a grid range and its levels.

    `levels` is sorted ascending. `level_for_price(p)` returns the index
    of the nearest level. Constructed via `compute_range_and_levels`.
    """
    low: float
    high: float
    n_levels: int
    levels: tuple[float, ...]   # sorted ascending, len = n_levels

    def step(self) -> float:
        """Spacing between adjacent levels."""
        return (self.high - self.low) / (self.n_levels - 1) if self.n_levels > 1 else 0.0

    def level_for_price(self, price: float) -> Optional[int]:
        """Index of the nearest level to `price`, or None if out of range."""
        if price < self.low or price > self.high:
            return None
        # Linear search is fine — N is small (~30)
        best_idx = 0
        best_dist = abs(self.levels[0] - price)
        for i, lvl in enumerate(self.levels):
            d = abs(lvl - price)
            if d < best_dist:
                best_dist = d
                best_idx = i
        return best_idx

    def buys_below(self, price: float, n: int) -> list[tuple[int, float]]:
        """Return up to `n` (idx, level_price) pairs strictly below `price`,
        ordered from nearest to farthest below."""
        out: list[tuple[int, float]] = []
        for i, lvl in enumerate(self.levels):
            if lvl < price:
                out.append((i, lvl))
        out.sort(key=lambda p: price - p[1])  # nearest first
        return out[:n]

    def sells_above(self, price: float, n: int) -> list[tuple[int, float]]:
        """Return up to `n` (idx, level_price) pairs strictly above `price`,
        ordered from nearest to farthest above."""
        out: list[tuple[int, float]] = []
        for i, lvl in enumerate(self.levels):
            if lvl > price:
                out.append((i, lvl))
        out.sort(key=lambda p: p[1] - price)
        return out[:n]


def compute_dynamic_range(
    daily_highs: list[float],
    daily_lows: list[float],
    *,
    lookback_days: int,
    padding_pct: float,
) -> tuple[float, float]:
    """Compute the grid range from recent N-day high/low with padding.

    `daily_highs` / `daily_lows` are arrays sorted oldest→newest (one
    entry per day). We use the last `lookback_days` of each.

    Padding is a symmetric percentage of the recent range. With
    padding_pct=15 and recent range $50K-$110K (width $60K), the grid
    extends to [$50K - $60K*15% = $41K, $110K + $60K*15% = $119K] —
    so normal volatility doesn't immediately blow us out of the grid.

    Raises ValueError if there's not enough history.
    """
    if lookback_days < 2:
        raise ValueError(f"lookback_days must be >= 2, got {lookback_days}")
    if len(daily_highs) < lookback_days or len(daily_lows) < lookback_days:
        raise ValueError(
            f"Need >= {lookback_days} daily bars, got "
            f"highs={len(daily_highs)} lows={len(daily_lows)}"
        )
    recent_high = max(daily_highs[-lookback_days:])
    recent_low = min(daily_lows[-lookback_days:])
    width = recent_high - recent_low
    pad = width * (padding_pct / 100.0)
    return (recent_low - pad, recent_high + pad)


def compute_levels(low: float, high: float, n_levels: int) -> tuple[float, ...]:
    """Generate `n_levels` evenly-spaced levels from `low` to `high` inclusive.

    Levels are sorted ascending. Returns a tuple for hashability.
    """
    if n_levels < 2:
        raise ValueError(f"n_levels must be >= 2, got {n_levels}")
    if low >= high:
        raise ValueError(f"low must be < high, got low={low} high={high}")
    step = (high - low) / (n_levels - 1)
    return tuple(low + i * step for i in range(n_levels))


def compute_range_and_levels(
    *,
    daily_highs: Optional[list[float]] = None,
    daily_lows: Optional[list[float]] = None,
    n_levels: int,
    mode: str,
    static_low: float = 0.0,
    static_high: float = 0.0,
    lookback_days: int = 60,
    padding_pct: float = 15.0,
) -> GridRange:
    """High-level entry point. Returns a fully-built GridRange.

    mode = "dynamic" → uses daily_highs/lows + lookback_days + padding_pct
    mode = "static"  → uses static_low/static_high directly
    """
    if mode == "static":
        low, high = static_low, static_high
    elif mode == "dynamic":
        if daily_highs is None or daily_lows is None:
            raise ValueError("Dynamic mode requires daily_highs and daily_lows")
        low, high = compute_dynamic_range(
            daily_highs, daily_lows,
            lookback_days=lookback_days, padding_pct=padding_pct,
        )
    else:
        raise ValueError(f"mode must be 'dynamic' or 'static', got {mode!r}")
    levels = compute_levels(low, high, n_levels)
    return GridRange(low=low, high=high, n_levels=n_levels, levels=levels)


def should_recenter(
    last_recenter_at: Optional[datetime],
    *,
    interval_days: int,
    now: Optional[datetime] = None,
) -> bool:
    """True if the grid hasn't been recentered in >= interval_days.

    First-deploy (last_recenter_at=None) returns True so the bot
    immediately builds an initial grid.
    """
    if last_recenter_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    age = now - last_recenter_at
    return age >= timedelta(days=interval_days)


def capital_per_level(starting_capital_usd: float, n_levels: int) -> float:
    """Equal-weighted capital per grid level. Total notional = capital.

    Note: in practice, half the levels are "buy waiting" (below price)
    and half are "sell waiting" (above). Only the buys consume cash.
    Pre-buy fills the "above-price" side at start so the strategy is
    immediately symmetric.
    """
    return starting_capital_usd / n_levels


def prebuy_qty_from_pct(
    starting_capital_usd: float,
    prebuy_pct: float,
    current_price: float,
) -> float:
    """Compute initial long-position size (BTC contracts) for the pre-buy.

    Returned in base-asset units. For BTC at $77K with $9600 × 50% = $4800
    of pre-buy notional, that's 4800/77000 = 0.0623 BTC.
    """
    if not (0 <= prebuy_pct <= 100):
        raise ValueError(f"prebuy_pct must be in [0, 100], got {prebuy_pct}")
    if current_price <= 0:
        raise ValueError(f"current_price must be > 0, got {current_price}")
    prebuy_notional = starting_capital_usd * (prebuy_pct / 100.0)
    return prebuy_notional / current_price
