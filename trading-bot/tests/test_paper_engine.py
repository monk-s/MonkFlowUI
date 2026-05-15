"""Tests for bot.exchange.paper_engine."""

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from bot.exchange.base import OrderSide, OrderType
from bot.exchange.paper_engine import PaperEngine


@pytest.fixture
def engine(monkeypatch):
    """Create a PaperEngine with a mocked CoinbaseClient."""
    mock_client = AsyncMock()
    mock_client.get_current_price.return_value = Decimal("85000.00")
    mock_client.get_candles.return_value = [
        {
            "timestamp": "2025-01-01T00:00:00Z",
            "open": 84500,
            "high": 85500,
            "low": 84000,
            "close": 85000,
            "volume": 1000,
        }
    ]
    mock_client.get_funding_rate.return_value = AsyncMock(
        rate=Decimal("0.0001"),
        interval_hours=8,
    )

    # Patch PaperEngine to use our mock instead of real CoinbaseClient
    eng = PaperEngine.__new__(PaperEngine)
    eng.market_client = mock_client
    eng.balance = Decimal("10000")
    eng.positions = {}
    eng.pending_orders = {}
    eng.filled_orders = []
    eng.total_fees = Decimal("0")
    eng.total_funding = Decimal("0")
    eng._last_price = None
    return eng


class TestPaperEngine:
    @pytest.mark.asyncio
    async def test_initial_balance(self, engine):
        balance = await engine.get_balance()
        assert balance == Decimal("10000")

    @pytest.mark.asyncio
    async def test_initial_equity(self, engine):
        equity = await engine.get_equity()
        assert equity == Decimal("10000")

    @pytest.mark.asyncio
    async def test_get_price(self, engine):
        price = await engine.get_current_price()
        assert price == Decimal("85000.00")

    @pytest.mark.asyncio
    async def test_market_buy(self, engine):
        result = await engine.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.1"),
            order_type=OrderType.MARKET,
        )
        assert result.filled
        assert result.size == Decimal("0.1")
        assert result.fee > 0

    @pytest.mark.asyncio
    async def test_no_positions_initially(self, engine):
        positions = await engine.get_positions()
        assert positions == []

    @pytest.mark.asyncio
    async def test_set_leverage(self, engine):
        result = await engine.set_leverage(Decimal("4"))
        assert result is True

    @pytest.mark.asyncio
    async def test_cancel_nonexistent_order(self, engine):
        result = await engine.cancel_order("nonexistent-id")
        assert result is False
