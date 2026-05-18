"""Tests for bot.risk.risk_manager."""

from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from bot.risk.risk_manager import RiskManager
from bot.strategy.base import Signal


def _make_signal(direction="long", entry=85000, stop=84000, target=87000, rr=2.0):
    return Signal(
        direction=direction,
        entry_price=entry,
        stop_price=stop,
        target_price=target,
        strategy="ema_trend",
        regime="trending_up",
        rr_ratio=rr,
    )


class TestRiskManager:
    @pytest.fixture
    def rm(self):
        return RiskManager()

    @pytest.mark.asyncio
    async def test_approve_valid_trade(self, rm):
        result = await rm.check_trade(
            signal=_make_signal(),
            equity=Decimal("10000"),
            open_positions=[],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert result.allowed

    @pytest.mark.asyncio
    async def test_positive_pnl_pct_does_NOT_trip_total_breaker(self, rm):
        """
        Regression: caught in production after the user deposited additional
        capital. The bot's peak_equity hadn't updated yet (lagged 15 min until
        next balance_snapshot) so total_pnl_pct = (new_equity - stale_peak) /
        stale_peak * 100 read as +30.25 (positive gain). The old breaker used
        abs(total_pnl_pct) which treated gains symmetrically with losses and
        would have tripped at +25%, rejecting valid signals.
        """
        result = await rm.check_trade(
            signal=_make_signal(),
            equity=Decimal("2605"),
            open_positions=[],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=+30.25,   # 30% UP from stale peak — should NOT trip
        )
        assert result.allowed, (
            f"Total breaker false-tripped on a +30% GAIN: {result.reason}. "
            f"It should only trip on actual drawdown (negative pnl_pct)."
        )

    @pytest.mark.asyncio
    async def test_negative_pnl_pct_DOES_trip_total_breaker(self, rm):
        """The other side of the regression: actual -25%+ drawdown still trips."""
        result = await rm.check_trade(
            signal=_make_signal(),
            equity=Decimal("7500"),
            open_positions=[],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=-25.0,    # exactly at threshold — should trip
        )
        assert not result.allowed
        assert "Total circuit breaker" in result.reason

    @pytest.mark.asyncio
    async def test_reject_low_rr(self, rm):
        signal = _make_signal(rr=1.5)
        result = await rm.check_trade(
            signal=signal,
            equity=Decimal("10000"),
            open_positions=[],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert not result.allowed
        assert "R:R" in result.reason

    @pytest.mark.asyncio
    async def test_reject_max_positions(self, rm):
        # Create 2 mock open positions
        pos1 = MagicMock(direction="long", risk_pct=1.5)
        pos2 = MagicMock(direction="long", risk_pct=1.5)
        result = await rm.check_trade(
            signal=_make_signal(),
            equity=Decimal("10000"),
            open_positions=[pos1, pos2],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert not result.allowed
        assert "concurrent" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_reject_opposing_position(self, rm):
        pos = MagicMock(direction="short", risk_pct=1.5)
        result = await rm.check_trade(
            signal=_make_signal(direction="long"),
            equity=Decimal("10000"),
            open_positions=[pos],
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert not result.allowed
        assert "opposing" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_daily_circuit_breaker(self, rm):
        result = await rm.check_circuit_breakers(
            equity=Decimal("10000"),
            daily_pnl=-600.0,  # -6% > 5% threshold
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert not result.allowed
        assert "daily" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_weekly_circuit_breaker(self, rm):
        result = await rm.check_circuit_breakers(
            equity=Decimal("10000"),
            daily_pnl=0.0,
            weekly_pnl=-1100.0,  # -11% > 10% threshold
            monthly_pnl=0.0,
            total_pnl_pct=0.0,
        )
        assert not result.allowed
        assert "weekly" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_total_circuit_breaker(self, rm):
        result = await rm.check_circuit_breakers(
            equity=Decimal("10000"),
            daily_pnl=0.0,
            weekly_pnl=0.0,
            monthly_pnl=0.0,
            total_pnl_pct=-26.0,  # > 25% threshold
        )
        assert not result.allowed
        assert "total" in result.reason.lower()

    @pytest.mark.asyncio
    async def test_all_breakers_ok(self, rm):
        result = await rm.check_circuit_breakers(
            equity=Decimal("10000"),
            daily_pnl=-100.0,  # -1%
            weekly_pnl=-200.0,  # -2%
            monthly_pnl=-300.0,  # -3%
            total_pnl_pct=-5.0,
        )
        assert result.allowed

    def test_portfolio_heat_calculation(self, rm):
        pos1 = MagicMock(risk_pct=1.5)
        pos2 = MagicMock(risk_pct=1.5)
        heat = rm.calculate_portfolio_heat([pos1, pos2], Decimal("10000"))
        assert heat == pytest.approx(3.0)

    def test_portfolio_heat_empty(self, rm):
        heat = rm.calculate_portfolio_heat([], Decimal("10000"))
        assert heat == 0.0
