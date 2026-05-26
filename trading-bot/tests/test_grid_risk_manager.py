"""Tests for bot.risk.grid_risk_manager.

Validates:
  - 40% equity DD circuit breaker trips correctly
  - MA re-arm check accepts/rejects based on daily MA
  - Pre-order gate rejects when bot halted, CB tripped, or notional cap exceeded
"""

from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from bot.risk.grid_risk_manager import (
    CircuitBreakerStatus,
    GridRiskManager,
    RiskCheckResult,
)


def _mock_exchange(equity: float = 10000.0):
    exch = AsyncMock()
    exch.get_equity = AsyncMock(return_value=Decimal(str(equity)))
    return exch


def _mock_repo(
    *,
    peak_equity: float = 10000.0,
    is_halted: bool = False,
    halt_reason: str = "",
):
    repo = AsyncMock()
    repo.get_peak_equity = AsyncMock(return_value=peak_equity)
    repo.get_bot_state = AsyncMock(return_value=SimpleNamespace(
        is_halted=is_halted, halt_reason=halt_reason,
    ))
    return repo


def _mgr(*, exchange=None, repo=None, dd_threshold=40.0,
         max_notional_pct=100.0, rearm_ma_days=50):
    return GridRiskManager(
        repository=repo or _mock_repo(),
        exchange=exchange or _mock_exchange(),
        dd_threshold_pct=dd_threshold,
        rearm_ma_days=rearm_ma_days,
        max_grid_notional_pct=max_notional_pct,
    )


# ─────────────────────────────────────────────────────────────────────────
# Circuit breaker
# ─────────────────────────────────────────────────────────────────────────


class TestCircuitBreaker:
    @pytest.mark.asyncio
    async def test_not_tripped_when_equity_above_peak(self):
        # Equity > peak (e.g. on a new high) → 0 or positive DD
        m = _mgr(
            exchange=_mock_exchange(equity=11000),
            repo=_mock_repo(peak_equity=10000),
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False
        assert result.drawdown_pct >= 0  # positive (gain)

    @pytest.mark.asyncio
    async def test_not_tripped_at_small_drawdown(self):
        m = _mgr(
            exchange=_mock_exchange(equity=9500),  # -5%
            repo=_mock_repo(peak_equity=10000),
            dd_threshold=40.0,
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False
        assert result.drawdown_pct == -5.0

    @pytest.mark.asyncio
    async def test_not_tripped_just_under_threshold(self):
        # -39.9% DD, threshold -40% → not yet
        m = _mgr(
            exchange=_mock_exchange(equity=6010),  # -39.9%
            repo=_mock_repo(peak_equity=10000),
            dd_threshold=40.0,
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False

    @pytest.mark.asyncio
    async def test_tripped_at_threshold(self):
        # -40% exactly → trips (using <= threshold)
        m = _mgr(
            exchange=_mock_exchange(equity=6000),  # -40%
            repo=_mock_repo(peak_equity=10000),
            dd_threshold=40.0,
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is True
        assert result.drawdown_pct == -40.0

    @pytest.mark.asyncio
    async def test_tripped_beyond_threshold(self):
        m = _mgr(
            exchange=_mock_exchange(equity=5000),  # -50%
            repo=_mock_repo(peak_equity=10000),
            dd_threshold=40.0,
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is True
        assert result.drawdown_pct == -50.0

    @pytest.mark.asyncio
    async def test_zero_peak_uses_current_as_peak(self):
        """First boot has no peak yet — treat current as peak (no DD)."""
        m = _mgr(
            exchange=_mock_exchange(equity=10000),
            repo=_mock_repo(peak_equity=0),
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False
        assert result.drawdown_pct == 0.0

    @pytest.mark.asyncio
    async def test_exchange_error_fails_safe(self):
        """If get_equity throws, we MUST NOT trip the breaker (fail safe)."""
        bad_exchange = AsyncMock()
        bad_exchange.get_equity = AsyncMock(side_effect=Exception("API down"))
        m = _mgr(exchange=bad_exchange)
        result = await m.check_circuit_breaker()
        assert result.tripped is False  # fail-safe behavior

    @pytest.mark.asyncio
    async def test_zero_equity_does_not_trip(self):
        """Bad-data fail-safe: $0 equity is treated as garbled, not -100% DD."""
        m = _mgr(
            exchange=_mock_exchange(equity=0),
            repo=_mock_repo(peak_equity=10000),
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False
        assert result.drawdown_pct == 0.0

    @pytest.mark.asyncio
    async def test_negative_equity_does_not_trip(self):
        """Defensive: a negative equity from a bad parse must not trip the CB."""
        m = _mgr(
            exchange=_mock_exchange(equity=-100),
            repo=_mock_repo(peak_equity=10000),
        )
        result = await m.check_circuit_breaker()
        assert result.tripped is False


# ─────────────────────────────────────────────────────────────────────────
# MA re-arm
# ─────────────────────────────────────────────────────────────────────────


class TestCanRearm:
    @pytest.mark.asyncio
    async def test_below_ma_blocks_rearm(self):
        m = _mgr(rearm_ma_days=10)
        closes = [100.0] * 10 + [80.0]  # MA = 100, latest = 80
        allowed, reason = await m.can_rearm(daily_closes=closes)
        assert allowed is False
        assert "MA" in reason

    @pytest.mark.asyncio
    async def test_above_ma_allows_rearm(self):
        m = _mgr(rearm_ma_days=10)
        closes = [100.0] * 10 + [110.0]  # MA = 100, latest = 110
        allowed, reason = await m.can_rearm(daily_closes=closes)
        assert allowed is True
        assert reason is None

    @pytest.mark.asyncio
    async def test_insufficient_history_blocks_rearm(self):
        m = _mgr(rearm_ma_days=50)
        closes = [100.0] * 30  # need 50, got 30
        allowed, reason = await m.can_rearm(daily_closes=closes)
        assert allowed is False
        assert "need 50" in reason

    @pytest.mark.asyncio
    async def test_at_ma_blocks_rearm(self):
        """Exactly equal to MA → not above, so blocks (conservative)."""
        m = _mgr(rearm_ma_days=10)
        closes = [100.0] * 10 + [100.0]  # MA = 100, latest = 100
        allowed, reason = await m.can_rearm(daily_closes=closes)
        assert allowed is False


# ─────────────────────────────────────────────────────────────────────────
# Pre-order gate
# ─────────────────────────────────────────────────────────────────────────


class TestCheckCanPlaceOrder:
    @pytest.mark.asyncio
    async def test_allowed_in_healthy_state(self):
        m = _mgr()
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("10000"),
            current_grid_notional=Decimal("0"),
        )
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_rejects_when_halted(self):
        m = _mgr(repo=_mock_repo(is_halted=True, halt_reason="test halt"))
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("10000"),
            current_grid_notional=Decimal("0"),
        )
        assert result.allowed is False
        assert "halted" in result.reason

    @pytest.mark.asyncio
    async def test_rejects_when_cb_tripped(self):
        # Exchange shows -50% DD → CB trips
        m = _mgr(
            exchange=_mock_exchange(equity=5000),
            repo=_mock_repo(peak_equity=10000, is_halted=False),
            dd_threshold=40.0,
        )
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("5000"),
            current_grid_notional=Decimal("0"),
        )
        assert result.allowed is False
        assert "circuit breaker" in result.reason

    @pytest.mark.asyncio
    async def test_rejects_when_notional_cap_exceeded(self):
        m = _mgr(max_notional_pct=50.0)  # cap at 50% of equity
        # 0.001 BTC × 77000 = 77 USD; existing 5000 USD → total 5077 > cap 5000
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("10000"),
            current_grid_notional=Decimal("5000"),  # already at the cap
        )
        assert result.allowed is False
        assert "notional cap" in result.reason

    @pytest.mark.asyncio
    async def test_allows_when_just_under_cap(self):
        m = _mgr(max_notional_pct=100.0)
        # Existing $5K notional + new $77 = $5077 < cap $10K
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("10000"),
            current_grid_notional=Decimal("5000"),
        )
        assert result.allowed is True

    @pytest.mark.asyncio
    async def test_rejects_when_no_equity(self):
        m = _mgr()
        result = await m.check_can_place_order(
            side="buy",
            qty=Decimal("0.001"),
            price=Decimal("77000"),
            current_equity=Decimal("0"),
            current_grid_notional=Decimal("0"),
        )
        assert result.allowed is False
        assert "no equity" in result.reason
