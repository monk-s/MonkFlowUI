"""Tests for bot.scheduler.grid_tick.

Validates the orchestration:
  - Halt check skips the tick cleanly
  - CB trip triggers emergency exit + halt
  - Recenter-due triggers recenter (and NOT a tick)
  - Normal path delegates to order_manager.tick()
  - Exceptions don't propagate to scheduler
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from bot.risk.grid_risk_manager import CircuitBreakerStatus
from bot.scheduler.grid_tick import GridTickHandler
from bot.strategy.grid_strategy import compute_range_and_levels


def _build_handler(
    *,
    is_halted=False,
    halt_reason=None,
    cb_tripped=False,
    last_recenter_at=None,
    range_low=70000,
    range_high=90000,
    n_levels=11,
    current_price=80000.0,
    fetch_candles_raises=False,
):
    """Build a GridTickHandler with mocked dependencies for orchestration tests."""
    exchange = AsyncMock()
    exchange.get_current_price = AsyncMock(return_value=current_price)
    exchange.get_candles = AsyncMock(return_value=[
        {"high": 90000.0, "low": 70000.0, "close": 80000.0}
        for _ in range(70)
    ])
    if fetch_candles_raises:
        exchange.get_candles = AsyncMock(side_effect=Exception("API down"))

    repo = AsyncMock()
    grid_state = SimpleNamespace(
        last_recenter_at=last_recenter_at,
        current_range_low=range_low,
        current_range_high=range_high,
        num_levels=n_levels,
    )
    bot_state = SimpleNamespace(is_halted=is_halted, halt_reason=halt_reason)
    repo.get_bot_state = AsyncMock(return_value=bot_state)
    repo.get_grid_state = AsyncMock(return_value=grid_state)
    repo.update_bot_state = AsyncMock()
    repo.log = AsyncMock()

    order_manager = AsyncMock()
    order_manager.tick = AsyncMock()
    order_manager.recenter = AsyncMock()
    order_manager.emergency_exit = AsyncMock()

    position_manager = AsyncMock()

    risk_manager = AsyncMock()
    cb = CircuitBreakerStatus(
        tripped=cb_tripped,
        peak_equity=10000,
        current_equity=6000 if cb_tripped else 10000,
        drawdown_pct=-40.0 if cb_tripped else 0.0,
        threshold_pct=-40.0,
    )
    risk_manager.check_circuit_breaker = AsyncMock(return_value=cb)

    handler = GridTickHandler(
        exchange=exchange,
        repository=repo,
        grid_order_manager=order_manager,
        grid_position_manager=position_manager,
        grid_risk_manager=risk_manager,
        symbol="BTC-PERP-INTX",
    )
    return handler, exchange, repo, order_manager, risk_manager


# ─────────────────────────────────────────────────────────────────────────


class TestHaltedBehavior:
    @pytest.mark.asyncio
    async def test_halted_skips_tick(self):
        h, _, _, om, rm = _build_handler(is_halted=True, halt_reason="manual")
        await h.run()
        # Nothing should be called
        om.tick.assert_not_called()
        om.recenter.assert_not_called()
        om.emergency_exit.assert_not_called()
        rm.check_circuit_breaker.assert_not_called()


class TestCircuitBreakerTrip:
    @pytest.mark.asyncio
    async def test_cb_trip_triggers_emergency_exit_and_halt(self):
        h, _, repo, om, _ = _build_handler(cb_tripped=True)
        await h.run()
        # Emergency exit fires
        om.emergency_exit.assert_awaited_once()
        # Bot gets halted
        repo.update_bot_state.assert_awaited()
        update_kwargs = repo.update_bot_state.await_args.kwargs
        assert update_kwargs.get("is_halted") is True
        assert "grid_dd_circuit_breaker" in update_kwargs.get("halt_reason", "")
        # Normal tick should NOT run
        om.tick.assert_not_called()
        om.recenter.assert_not_called()

    @pytest.mark.asyncio
    async def test_emergency_exit_exception_still_halts_bot(self):
        """If emergency_exit raises, the bot MUST still be halted."""
        h, _, repo, om, _ = _build_handler(cb_tripped=True)
        om.emergency_exit = AsyncMock(side_effect=Exception("close failed"))
        await h.run()
        repo.update_bot_state.assert_awaited()
        assert repo.update_bot_state.await_args.kwargs.get("is_halted") is True


class TestRecenter:
    @pytest.mark.asyncio
    async def test_first_deploy_triggers_recenter(self):
        # last_recenter_at=None means first deploy → recenter immediately
        h, _, _, om, _ = _build_handler(last_recenter_at=None)
        await h.run()
        om.recenter.assert_awaited_once()
        # tick() should NOT run in the same iteration as recenter
        om.tick.assert_not_called()

    @pytest.mark.asyncio
    async def test_recent_recenter_skips_recenter(self):
        recent = datetime.now(timezone.utc) - timedelta(days=5)
        h, _, _, om, _ = _build_handler(last_recenter_at=recent)
        await h.run()
        om.recenter.assert_not_called()
        # Should go to normal tick path
        om.tick.assert_awaited_once()

    @pytest.mark.asyncio
    async def test_old_recenter_triggers_recenter(self):
        old = datetime.now(timezone.utc) - timedelta(days=61)
        h, _, _, om, _ = _build_handler(last_recenter_at=old)
        await h.run()
        om.recenter.assert_awaited_once()
        om.tick.assert_not_called()

    @pytest.mark.asyncio
    async def test_recenter_fetch_failure_skips_safely(self):
        h, _, _, om, _ = _build_handler(
            last_recenter_at=None, fetch_candles_raises=True,
        )
        await h.run()
        # Recenter shouldn't fire if we can't get data
        om.recenter.assert_not_called()
        # But also shouldn't crash


class TestNormalTick:
    @pytest.mark.asyncio
    async def test_normal_tick_delegates_to_order_manager(self):
        recent = datetime.now(timezone.utc) - timedelta(days=5)
        h, _, _, om, _ = _build_handler(last_recenter_at=recent)
        await h.run()
        om.tick.assert_awaited_once()
        # The tick is called with grid_range and current_price
        kwargs = om.tick.await_args.kwargs
        assert "grid_range" in kwargs
        assert "current_price" in kwargs


class TestErrorIsolation:
    @pytest.mark.asyncio
    async def test_order_manager_exception_does_not_propagate(self):
        """A failing tick() must not propagate — scheduler must stay alive."""
        recent = datetime.now(timezone.utc) - timedelta(days=5)
        h, _, repo, om, _ = _build_handler(last_recenter_at=recent)
        om.tick = AsyncMock(side_effect=Exception("transient failure"))
        # Should not raise
        await h.run()
        # Should log the error
        repo.log.assert_awaited()
