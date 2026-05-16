"""
Abstract strategy interface and Signal dataclass.

Every concrete strategy (EMA trend, BB/RSI reversion) inherits from
``StrategyBase`` and implements ``evaluate()``.
"""

from __future__ import annotations

import math
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional

from bot.data.indicators import Candle


@dataclass(frozen=True)
class Signal:
    """Immutable snapshot of a trade signal emitted by a strategy."""

    direction: str  # "long" or "short"
    entry_price: float
    stop_price: float
    target_price: float
    strategy: str  # "ema_trend" or "bb_rsi_reversion"
    regime: str  # "trending_up", "trending_down", "ranging", "choppy"
    rr_ratio: float
    indicators: dict = field(default_factory=dict)  # snapshot of all indicator values

    def __post_init__(self) -> None:
        if self.direction not in ("long", "short"):
            raise ValueError(f"Invalid direction: {self.direction}")
        if self.strategy not in ("ema_trend", "bb_rsi_reversion"):
            raise ValueError(f"Invalid strategy: {self.strategy}")
        if math.isnan(self.rr_ratio) or self.rr_ratio <= 0:
            raise ValueError(f"Invalid rr_ratio: {self.rr_ratio}")

    @property
    def risk_per_unit(self) -> float:
        """Dollar risk per 1 BTC."""
        return abs(self.entry_price - self.stop_price)

    @property
    def reward_per_unit(self) -> float:
        """Dollar reward per 1 BTC."""
        return abs(self.target_price - self.entry_price)


class StrategyBase(ABC):
    """
    All strategies receive two timeframes of candles and return either a
    fully-formed Signal or None (no trade).
    """

    @abstractmethod
    def evaluate(
        self,
        candles_4h: list[Candle],
        candles_1h: list[Candle],
    ) -> Optional[Signal]:
        """
        Evaluate the strategy against the latest candle data.

        Parameters
        ----------
        candles_4h : list[Candle]
            4-hour candles sorted oldest-to-newest, at least 200 bars.
        candles_1h : list[Candle]
            1-hour candles sorted oldest-to-newest, at least 200 bars.

        Returns
        -------
        Signal | None
            A fully-formed signal if all entry conditions are met, else None.
        """
        ...
