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


class TestPartialFillAutoClose:
    """H1 regression: partial fills on market entries get auto-closed to avoid orphans."""

    @pytest.mark.asyncio
    async def test_partial_fill_triggers_reduce_only_close(self, client):
        # First call returns partial fill, second is the auto-close
        client._request = AsyncMock(side_effect=[
            {"success_response": {"order_id": "partial-entry", "status": "PARTIALLY_FILLED", "filled_size": "0.005"}},
            {"success_response": {"order_id": "auto-close", "status": "FILLED"}},
        ])
        result = await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.MARKET,
        )
        # filled=False because caller should treat this as a failed entry
        assert result.filled is False
        # Two requests made: original + auto-close
        assert client._request.call_count == 2
        close_body = client._request.call_args_list[1].args[2]
        assert close_body["side"] == "SELL"  # opposite of BUY
        assert close_body["is_reduce_only"] is True
        assert close_body["order_configuration"]["market_market_ioc"]["base_size"] == "0.005"

    @pytest.mark.asyncio
    async def test_filled_status_returns_filled_true(self, client):
        client._request = AsyncMock(return_value={
            "success_response": {"order_id": "full-fill", "status": "FILLED"}
        })
        result = await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.MARKET,
        )
        assert result.filled is True
        assert client._request.call_count == 1  # no auto-close

    @pytest.mark.asyncio
    async def test_reduce_only_partial_does_NOT_auto_close(self, client):
        """A partial close (reduce_only) shouldn't auto-close itself — that would loop."""
        client._request = AsyncMock(return_value={
            "success_response": {"order_id": "partial-close", "status": "PARTIALLY_FILLED"}
        })
        result = await client.place_order(
            side=OrderSide.SELL,
            size=Decimal("0.01"),
            order_type=OrderType.MARKET,
            reduce_only=True,
        )
        assert result.filled is False
        # Only ONE request — no auto-close attempted on reduce_only partials
        assert client._request.call_count == 1


class TestPlacementRejection:
    """AUDIT-FIX A2: Coinbase returns HTTP 200 + {"success": false, ...} for
    rejected orders (post_only crossing, insufficient funds, etc). The client
    must surface this as `order_id=""` so the caller skips DB insertion
    instead of writing an unreconcilable orphan row.
    """

    @pytest.mark.asyncio
    async def test_post_only_rejection_returns_empty_order_id(self, client):
        """The flagship A2 scenario: post_only limit that would cross
        the spread. Coinbase responds with INVALID_LIMIT_PRICE_POST_ONLY."""
        client._request = AsyncMock(return_value={
            "success": False,
            "error_response": {
                "message": "Limit price would cross the spread",
                "error_details": "post_only requires order to be passive",
                "new_order_failure_reason": "INVALID_LIMIT_PRICE_POST_ONLY",
            },
            "order_configuration": {
                "limit_limit_gtc": {
                    "base_size": "0.01",
                    "limit_price": "75879",
                    "post_only": True,
                },
            },
        })
        result = await client.place_order(
            side=OrderSide.SELL,
            size=Decimal("0.01"),
            order_type=OrderType.LIMIT,
            price=Decimal("75879"),
            post_only=True,
        )
        # Critical: order_id MUST be falsy so the grid manager skips insertion
        assert not result.order_id, (
            "Rejected order must return empty order_id (not the client UUID); "
            f"got {result.order_id!r}"
        )
        assert result.filled is False
        # Raw response preserved for debugging
        assert result.raw_response is not None
        assert result.raw_response["success"] is False
        assert (
            result.raw_response["error_response"]["new_order_failure_reason"]
            == "INVALID_LIMIT_PRICE_POST_ONLY"
        )

    @pytest.mark.asyncio
    async def test_insufficient_funds_rejection(self, client):
        """Any failure_reason value triggers the same skip-insertion path."""
        client._request = AsyncMock(return_value={
            "success": False,
            "error_response": {
                "message": "Insufficient available funds",
                "new_order_failure_reason": "INSUFFICIENT_FUND",
            },
        })
        result = await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.5"),
            order_type=OrderType.LIMIT,
            price=Decimal("75000"),
        )
        assert not result.order_id
        assert result.filled is False

    @pytest.mark.asyncio
    async def test_successful_limit_still_passes_through(self, client):
        """Regression: the new gate must not break successful limit placements."""
        client._request = AsyncMock(return_value={
            "success": True,
            "success_response": {"order_id": "real-coinbase-uuid", "status": "OPEN"},
        })
        result = await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.LIMIT,
            price=Decimal("70000"),
            post_only=True,
        )
        assert result.order_id == "real-coinbase-uuid"
        assert result.filled is False  # OPEN, not yet filled — that's normal

    @pytest.mark.asyncio
    async def test_missing_success_key_treated_as_success(self, client):
        """Back-compat with mocks/responses that omit the 'success' field:
        absence (None) is NOT False, so the existing happy path is unaffected."""
        client._request = AsyncMock(return_value={
            # No "success" key at all
            "success_response": {"order_id": "back-compat-id", "status": "FILLED"},
        })
        result = await client.place_order(
            side=OrderSide.BUY,
            size=Decimal("0.01"),
            order_type=OrderType.MARKET,
        )
        # Should not be treated as rejected — order_id flows through normally
        assert result.order_id == "back-compat-id"
        assert result.filled is True
