"""
Tests for bot.execution.order_manager — safety-critical order placement,
cancellation, and trailing-stop update flows.
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from bot.exchange.base import OrderResult, OrderSide, OrderType
from bot.execution.order_manager import OrderManager


def _ok_result(order_id="new-stop-id", filled=False):
    return OrderResult(
        order_id=order_id,
        side=OrderSide.SELL,
        order_type=OrderType.STOP_MARKET,
        size=Decimal("0.01"),
        filled=filled,
    )


@pytest.fixture
def exchange():
    return AsyncMock()


@pytest.fixture
def om(exchange):
    return OrderManager(exchange)


class TestUpdateStopPlaceThenCancel:
    """C2 regression: never leave a position without a stop during trailing."""

    @pytest.mark.asyncio
    async def test_normal_path_places_new_then_cancels_old(self, om, exchange):
        exchange.place_order.return_value = _ok_result("new-stop-id")
        exchange.cancel_order.return_value = True

        result = await om.update_stop(
            old_stop_order_id="old-stop-id",
            new_stop_price=Decimal("78000"),
            size=Decimal("0.01"),
            direction="long",
        )
        # Order of operations matters
        call_order = [c[0] for c in exchange.method_calls]
        place_idx = call_order.index("place_order")
        cancel_idx = call_order.index("cancel_order")
        assert place_idx < cancel_idx, "Must place new stop BEFORE cancelling old"
        assert result.order_id == "new-stop-id"

    @pytest.mark.asyncio
    async def test_new_stop_placement_failure_keeps_old_alive(self, om, exchange):
        """If new placement raises, the old stop must NOT be cancelled."""
        exchange.place_order.side_effect = RuntimeError("Coinbase 500")

        with pytest.raises(RuntimeError):
            await om.update_stop(
                old_stop_order_id="old-stop-id",
                new_stop_price=Decimal("78000"),
                size=Decimal("0.01"),
                direction="long",
            )

        # Critical: cancel_order must NOT have been called
        exchange.cancel_order.assert_not_called()

    @pytest.mark.asyncio
    async def test_old_cancel_failure_after_new_placed_does_not_raise(self, om, exchange):
        """If new is placed but cancel-old fails, we still return success."""
        exchange.place_order.return_value = _ok_result("new-stop-id")
        exchange.cancel_order.return_value = False  # cancel "failed"

        result = await om.update_stop(
            old_stop_order_id="old-stop-id",
            new_stop_price=Decimal("78000"),
            size=Decimal("0.01"),
            direction="long",
        )
        assert result.order_id == "new-stop-id"


class TestCancelAllOrdersForTrade:
    """H6 regression: report which order_ids failed to cancel."""

    @pytest.mark.asyncio
    async def test_all_succeed_returns_empty_failed_list(self, om, exchange):
        exchange.cancel_order.return_value = True
        trade = SimpleNamespace(
            id="t1",
            stop_order_id="stop-id",
            target_order_id="tgt-id",
            entry_order_id="entry-id",
        )
        failed = await om.cancel_all_orders_for_trade(trade)
        assert failed == []

    @pytest.mark.asyncio
    async def test_partial_failure_returns_failed_ids(self, om, exchange):
        # First two succeed, third fails
        async def cancel_side(oid):
            return oid != "entry-id"
        exchange.cancel_order.side_effect = cancel_side

        trade = SimpleNamespace(
            id="t1",
            stop_order_id="stop-id",
            target_order_id="tgt-id",
            entry_order_id="entry-id",
        )
        failed = await om.cancel_all_orders_for_trade(trade)
        assert "entry-id" in failed
        assert "stop-id" not in failed

    @pytest.mark.asyncio
    async def test_exception_during_cancel_counted_as_failure(self, om, exchange):
        exchange.cancel_order.side_effect = RuntimeError("network")

        trade = SimpleNamespace(
            id="t1",
            stop_order_id="stop-id",
            target_order_id=None,
            entry_order_id=None,
        )
        failed = await om.cancel_all_orders_for_trade(trade)
        assert failed == ["stop-id"]

    @pytest.mark.asyncio
    async def test_failures_logged_to_repo_when_repo_passed(self, om, exchange):
        exchange.cancel_order.return_value = False  # all fail
        repo = AsyncMock()

        trade = SimpleNamespace(
            id="t1",
            stop_order_id="stop-id",
            target_order_id=None,
            entry_order_id=None,
        )
        await om.cancel_all_orders_for_trade(trade, repo=repo)

        repo.log.assert_called_once()
        call_args = repo.log.call_args.args
        assert call_args[0] == "warn"
        assert call_args[1] == "order_manager"
        assert "phantom positions" in call_args[2]
