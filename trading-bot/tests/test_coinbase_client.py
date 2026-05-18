"""
Tests for bot.exchange.coinbase_client — the live Coinbase REST client.

These tests use mock _request to avoid hitting the real Coinbase API; the
goal is to verify the request construction logic (especially safety-critical
order placement quirks).
"""

from __future__ import annotations

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from bot.exchange.base import OrderSide, OrderType
from bot.exchange.coinbase_client import CoinbaseClient
from config.settings import settings


@pytest.fixture
def client():
    """A CoinbaseClient with mocked _request and no real auth needed."""
    cb = CoinbaseClient.__new__(CoinbaseClient)
    cb.symbol = "BTC-PERP-INTX"
    cb.base_url = "https://api.coinbase.com"
    cb._client = None
    cb._request = AsyncMock(return_value={
        "success_response": {"order_id": "test-order-uuid", "status": "FILLED"}
    })
    return cb


class TestStopLimitGapProtection:
    """C3 regression: stop-limit orders need a slippage buffer to fill on gaps."""

    @pytest.mark.asyncio
    async def test_sell_stop_long_close_has_lower_limit(self, client):
        """A SELL stop (closing a long) should set limit BELOW stop_price."""
        await client.place_order(
            side=OrderSide.SELL,
            size=Decimal("0.01"),
            order_type=OrderType.STOP_MARKET,
            stop_price=Decimal("70000"),
            reduce_only=True,
        )
        body = client._request.call_args.args[2]
        cfg = body["order_configuration"]["stop_limit_stop_limit_gtc"]
        stop = Decimal(cfg["stop_price"])
        limit = Decimal(cfg["limit_price"])
        slip_pct = Decimal(str(settings.STOP_LIMIT_SLIPPAGE_PCT)) / Decimal("100")
        expected_limit = (stop * (Decimal("1") - slip_pct)).quantize(Decimal("0.1"))
        assert limit == expected_limit, f"SELL stop: limit {limit} should equal {expected_limit}"
        assert limit < stop, "SELL stop limit must be BELOW stop (gap-down protection for longs)"

    @pytest.mark.asyncio
    async def test_buy_stop_short_close_has_higher_limit(self, client):
        """A BUY stop (closing a short) should set limit ABOVE stop_price."""
        await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.STOP_MARKET,
            stop_price=Decimal("85000"),
            reduce_only=True,
        )
        body = client._request.call_args.args[2]
        cfg = body["order_configuration"]["stop_limit_stop_limit_gtc"]
        stop = Decimal(cfg["stop_price"])
        limit = Decimal(cfg["limit_price"])
        slip_pct = Decimal(str(settings.STOP_LIMIT_SLIPPAGE_PCT)) / Decimal("100")
        expected_limit = (stop * (Decimal("1") + slip_pct)).quantize(Decimal("0.1"))
        assert limit == expected_limit, f"BUY stop: limit {limit} should equal {expected_limit}"
        assert limit > stop, "BUY stop limit must be ABOVE stop (gap-up protection for shorts)"

    @pytest.mark.asyncio
    async def test_market_order_unchanged(self, client):
        """Regular market orders should not have any stop_limit_stop_limit_gtc."""
        await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.MARKET,
        )
        body = client._request.call_args.args[2]
        assert "market_market_ioc" in body["order_configuration"]
        assert "stop_limit_stop_limit_gtc" not in body["order_configuration"]
