"""
Tests for bot.execution.position_manager.

Targets the defensive / None-guard logic added during the live-mode safety
audit (H2). Full-stack integration is covered by tests/test_e2e_pipeline.py.
"""

from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest

from bot.execution.position_manager import PositionManager


def _make_trade(**overrides):
    """Build a fake trade row. Override any field to None to test None-guards."""
    defaults = dict(
        id="trade-uuid-test",
        direction="long",
        entry_price=Decimal("85000.00"),
        stop_price=Decimal("83000.00"),
        target_price=Decimal("89000.00"),
        position_size=Decimal("0.01"),
        trailing_stop=None,
        stop_order_id="stop-uuid",
        target_order_id=None,
        entry_order_id="entry-uuid",
        status="open",
        fees_paid=Decimal("0.5"),
        funding_paid=Decimal("0"),
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


@pytest.fixture
def pm():
    """A PositionManager with all dependencies mocked."""
    exchange = AsyncMock()
    repo = AsyncMock()
    # risk_manager.check_circuit_breakers is async — AsyncMock, not MagicMock
    risk = AsyncMock()
    risk.check_circuit_breakers.return_value = SimpleNamespace(
        allowed=True, reason=""
    )
    trailing = MagicMock()
    orders = AsyncMock()
    return PositionManager(exchange, repo, risk, trailing, orders)


class TestCloseTradeNoneGuards:
    """H2 regression: _close_trade must not crash on rows with NULL price fields."""

    @pytest.mark.asyncio
    async def test_close_trade_with_none_entry_price_bails_safely(self, pm):
        """If entry_price is None, log and return without raising."""
        trade = _make_trade(entry_price=None)
        await pm._close_trade(trade, exit_price=84000.0, exit_reason="manual")
        # Should NOT have called exchange.close_position
        pm._exchange.close_position.assert_not_called()
        # Should have logged the error to repo
        pm._repo.log.assert_called()
        call_args = pm._repo.log.call_args
        assert call_args.args[0] == "error"
        assert "Cannot close trade" in call_args.args[2]

    @pytest.mark.asyncio
    async def test_close_trade_with_zero_position_size_bails_safely(self, pm):
        trade = _make_trade(position_size=Decimal("0"))
        await pm._close_trade(trade, exit_price=84000.0, exit_reason="manual")
        pm._exchange.close_position.assert_not_called()

    @pytest.mark.asyncio
    async def test_close_trade_with_none_position_size_bails_safely(self, pm):
        trade = _make_trade(position_size=None)
        await pm._close_trade(trade, exit_price=84000.0, exit_reason="manual")
        pm._exchange.close_position.assert_not_called()

    @pytest.mark.asyncio
    async def test_close_trade_with_none_stop_price_does_not_crash(self, pm):
        """Even with NULL stop_price (R-multiple becomes 0), close still proceeds."""
        close_result = MagicMock()
        close_result.price = Decimal("83500")
        close_result.fee = Decimal("0.5")
        pm._exchange.close_position.return_value = close_result

        trade = _make_trade(stop_price=None)
        await pm._close_trade(trade, exit_price=83500.0, exit_reason="manual")

        pm._exchange.close_position.assert_called_once()
        pm._repo.update_trade.assert_called()
        update_kwargs = pm._repo.update_trade.call_args.kwargs
        assert update_kwargs["r_multiple"] == 0.0


class TestPositionTickDeadCodeRemoved:
    """H3 regression: check_positions should only call get_equity ONCE per tick."""

    @pytest.mark.asyncio
    async def test_check_positions_empty_skips_api_calls(self, pm):
        pm._repo.get_open_trades.return_value = []
        await pm.check_positions()
        pm._exchange.get_equity.assert_not_called()

    @pytest.mark.asyncio
    async def test_check_positions_calls_get_equity_once_with_open_trade(self, pm):
        pm._repo.get_open_trades.return_value = [_make_trade()]
        pm._exchange.get_equity.return_value = Decimal("10000")
        pm._exchange.get_current_price.return_value = Decimal("85000")
        pm._exchange.get_candles.return_value = []
        pm._repo.get_daily_pnl.return_value = 0.0
        pm._repo.get_peak_equity.return_value = 10000.0

        await pm.check_positions()
        assert pm._exchange.get_equity.call_count == 1, (
            f"Expected get_equity called once but was called "
            f"{pm._exchange.get_equity.call_count} times — dead code regression!"
        )
