"""Shared test fixtures for the trading bot test suite."""

import sys
from datetime import datetime, timezone, timedelta
from decimal import Decimal
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

# Ensure the trading-bot root is on sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.data.indicators import Candle
from bot.exchange.base import ExchangeInterface, OrderResult, OrderSide, OrderType, Position


def make_candle(
    close: float,
    open_: float = None,
    high: float = None,
    low: float = None,
    volume: float = 100.0,
    ts: datetime = None,
) -> Candle:
    """Create a Candle with sensible defaults for testing."""
    if open_ is None:
        open_ = close * 0.999
    if high is None:
        high = max(close, open_) * 1.001
    if low is None:
        low = min(close, open_) * 0.999
    if ts is None:
        ts = datetime.now(timezone.utc)
    return Candle(timestamp=ts, open=open_, high=high, low=low, close=close, volume=volume)


def make_candle_series(
    prices: list[float],
    start: datetime = None,
    interval_hours: int = 4,
) -> list[Candle]:
    """Build a list of candles from close prices with realistic OHLC."""
    if start is None:
        start = datetime(2025, 1, 1, tzinfo=timezone.utc)

    candles = []
    for i, price in enumerate(prices):
        ts = start + timedelta(hours=i * interval_hours)
        # Add slight randomness for realism
        open_ = price * (1 - 0.003 * (1 if i % 2 == 0 else -1))
        high = max(price, open_) * 1.002
        low = min(price, open_) * 0.998
        candles.append(Candle(
            timestamp=ts,
            open=open_,
            high=high,
            low=low,
            close=price,
            volume=100.0 + i * 10,
        ))
    return candles


def make_trending_up(n: int = 100, start_price: float = 80000.0) -> list[Candle]:
    """Generate a clearly trending-up candle series."""
    prices = [start_price + i * 50.0 for i in range(n)]
    return make_candle_series(prices)


def make_trending_down(n: int = 100, start_price: float = 90000.0) -> list[Candle]:
    """Generate a clearly trending-down candle series."""
    prices = [start_price - i * 50.0 for i in range(n)]
    return make_candle_series(prices)


def make_ranging(n: int = 100, center: float = 85000.0, amplitude: float = 200.0) -> list[Candle]:
    """Generate a ranging (sideways) candle series."""
    import math
    prices = [center + amplitude * math.sin(i * 0.3) for i in range(n)]
    return make_candle_series(prices)


@pytest.fixture
def mock_exchange():
    """Mock exchange that returns reasonable values."""
    exchange = AsyncMock(spec=ExchangeInterface)
    exchange.get_equity.return_value = Decimal("10000.00")
    exchange.get_balance.return_value = Decimal("10000.00")
    exchange.get_current_price.return_value = Decimal("85000.00")
    exchange.get_positions.return_value = []
    exchange.place_order.return_value = OrderResult(
        order_id="test-order-1",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        size=Decimal("0.001"),
        price=Decimal("85000.00"),
        filled=True,
        fee=Decimal("0.51"),
    )
    exchange.close_position.return_value = OrderResult(
        order_id="test-close-1",
        side=OrderSide.SELL,
        order_type=OrderType.MARKET,
        size=Decimal("0.001"),
        price=Decimal("85500.00"),
        filled=True,
        fee=Decimal("0.51"),
    )
    # AUDIT-FIX A1: cancel_order now returns (success, failure_reason).
    exchange.cancel_order.return_value = (True, None)
    return exchange


@pytest.fixture
def mock_repo():
    """Mock repository with standard returns."""
    repo = AsyncMock()
    repo.get_bot_state.return_value = MagicMock(
        is_halted=False,
        trading_mode="paper",
        halt_reason=None,
    )
    repo.get_open_trades.return_value = []
    repo.get_daily_pnl.return_value = 0.0
    repo.get_peak_equity.return_value = 10000.0
    repo.get_trade_stats.return_value = {
        "total_trades": 0,
        "win_rate": 0.0,
        "avg_r": 0.0,
        "expectancy": 0.0,
        "profit_factor": 0.0,
    }
    repo.create_trade.return_value = MagicMock(id="trade-uuid-1")
    return repo
