"""Strategy package -- signal generation and regime detection."""

from bot.strategy.base import Signal, StrategyBase
from bot.strategy.bb_rsi_reversion import BBRSIReversionStrategy
from bot.strategy.ema_trend import EMATrendStrategy
from bot.strategy.regime_detector import (
    CHOPPY,
    RANGING,
    TRENDING_DOWN,
    TRENDING_UP,
    RegimeDetector,
)

__all__ = [
    "Signal",
    "StrategyBase",
    "EMATrendStrategy",
    "BBRSIReversionStrategy",
    "RegimeDetector",
    "TRENDING_UP",
    "TRENDING_DOWN",
    "RANGING",
    "CHOPPY",
]
