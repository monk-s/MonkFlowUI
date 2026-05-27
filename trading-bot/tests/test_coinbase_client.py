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


class TestCancelOrderReturnShape:
    """AUDIT-FIX A1: cancel_order returns (success, failure_reason) so the
    caller can distinguish terminal failures (the order is gone, DB must
    reconcile) from retryable ones (still open, try again next tick).
    """

    @pytest.mark.asyncio
    async def test_successful_cancel_returns_true_and_none(self, client):
        client._request = AsyncMock(return_value={
            "results": [{"success": True, "order_id": "abc-123"}],
        })
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is True
        assert failure_reason is None

    @pytest.mark.asyncio
    async def test_unknown_cancel_order_returns_reason(self, client):
        client._request = AsyncMock(return_value={
            "results": [{
                "success": False,
                "failure_reason": "UNKNOWN_CANCEL_ORDER",
                "order_id": "abc-123",
            }],
        })
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is False
        assert failure_reason == "UNKNOWN_CANCEL_ORDER"

    @pytest.mark.asyncio
    async def test_order_is_fully_filled_returns_reason(self, client):
        """Race scenario: the order filled on Coinbase between our placement
        and our cancel attempt."""
        client._request = AsyncMock(return_value={
            "results": [{
                "success": False,
                "failure_reason": "ORDER_IS_FULLY_FILLED",
                "order_id": "abc-123",
            }],
        })
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is False
        assert failure_reason == "ORDER_IS_FULLY_FILLED"

    @pytest.mark.asyncio
    async def test_duplicate_cancel_request_returns_reason(self, client):
        client._request = AsyncMock(return_value={
            "results": [{
                "success": False,
                "failure_reason": "DUPLICATE_CANCEL_REQUEST",
                "order_id": "abc-123",
            }],
        })
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is False
        assert failure_reason == "DUPLICATE_CANCEL_REQUEST"

    @pytest.mark.asyncio
    async def test_empty_results_returns_empty_response(self, client):
        client._request = AsyncMock(return_value={"results": []})
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is False
        assert failure_reason == "EMPTY_RESPONSE"

    @pytest.mark.asyncio
    async def test_exception_returns_exception_sentinel(self, client):
        client._request = AsyncMock(side_effect=RuntimeError("network"))
        success, failure_reason = await client.cancel_order("abc-123")
        assert success is False
        assert failure_reason == "EXCEPTION"


class TestGetOrderTerminalStatus:
    """AUDIT-FIX A3: get_order surfaces CANCELLED / EXPIRED / FAILED via the
    new OrderResult.terminal_status field so the grid caller can reconcile
    the DB row instead of polling indefinitely.
    """

    @pytest.mark.asyncio
    async def test_cancelled_status_surfaces(self, client):
        client._request = AsyncMock(return_value={
            "order": {
                "side": "BUY",
                "status": "CANCELLED",
                "order_configuration": {
                    "limit_limit_gtc": {"base_size": "0.01", "limit_price": "70000"},
                },
                "total_fees": "0",
            },
        })
        result = await client.get_order("abc-123")
        assert result is not None
        assert result.filled is False
        assert result.terminal_status == "CANCELLED"

    @pytest.mark.asyncio
    async def test_expired_status_surfaces(self, client):
        client._request = AsyncMock(return_value={
            "order": {
                "side": "SELL",
                "status": "EXPIRED",
                "order_configuration": {
                    "limit_limit_gtc": {"base_size": "0.01", "limit_price": "85000"},
                },
                "total_fees": "0",
            },
        })
        result = await client.get_order("abc-123")
        assert result.terminal_status == "EXPIRED"

    @pytest.mark.asyncio
    async def test_failed_status_surfaces(self, client):
        client._request = AsyncMock(return_value={
            "order": {
                "side": "BUY",
                "status": "FAILED",
                "order_configuration": {
                    "limit_limit_gtc": {"base_size": "0.01", "limit_price": "70000"},
                },
                "total_fees": "0",
            },
        })
        result = await client.get_order("abc-123")
        assert result.terminal_status == "FAILED"

    @pytest.mark.asyncio
    async def test_open_status_has_no_terminal(self, client):
        """OPEN orders are still active — terminal_status must be None."""
        client._request = AsyncMock(return_value={
            "order": {
                "side": "BUY",
                "status": "OPEN",
                "order_configuration": {
                    "limit_limit_gtc": {"base_size": "0.01", "limit_price": "70000"},
                },
                "total_fees": "0",
            },
        })
        result = await client.get_order("abc-123")
        assert result.filled is False
        assert result.terminal_status is None

    @pytest.mark.asyncio
    async def test_filled_status_has_no_terminal(self, client):
        """FILLED is a terminal state but NOT in the not-filled set —
        filled=True is the relevant signal there, not terminal_status."""
        client._request = AsyncMock(return_value={
            "order": {
                "side": "BUY",
                "status": "FILLED",
                "order_configuration": {
                    "limit_limit_gtc": {"base_size": "0.01", "limit_price": "70000"},
                },
                "average_filled_price": "70000",
                "total_fees": "0.014",
            },
        })
        result = await client.get_order("abc-123")
        assert result.filled is True
        assert result.terminal_status is None
