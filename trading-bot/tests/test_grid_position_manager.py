"""Tests for bot.execution.grid_position_manager.

These ARE the spec for inventory + cost-basis math. Backtested grid math
in scripts/grid_sim.py uses the same conventions (weighted-avg cost
basis, realized P&L on sells = (price - avg_cost) × qty - fee).
"""

from decimal import Decimal
from unittest.mock import AsyncMock

import pytest

from bot.execution.grid_position_manager import (
    FillResult,
    GridInventoryState,
    GridPositionManager,
    _to_decimal,
)


# ─────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────

def _mock_repo():
    """A mock Repository where every async method returns None."""
    repo = AsyncMock()
    repo.get_grid_state = AsyncMock(return_value=None)
    repo.update_grid_state = AsyncMock(return_value=None)
    repo.record_grid_fill = AsyncMock(return_value=None)
    return repo


def _mgr(long_only=True):
    return GridPositionManager(repository=_mock_repo(), long_only=long_only)


# ─────────────────────────────────────────────────────────────────────────
# Pre-buy
# ─────────────────────────────────────────────────────────────────────────

class TestPrebuy:
    @pytest.mark.asyncio
    async def test_record_prebuy_sets_floor_and_inventory(self):
        m = _mgr()
        await m.record_prebuy(
            qty=Decimal("0.0623"),
            avg_price=Decimal("77000"),
            fee=Decimal("2.40"),
        )
        assert m.state.prebuy_qty == Decimal("0.0623")
        assert m.state.qty == Decimal("0.0623")
        assert m.state.avg_cost == Decimal("77000")
        assert m.state.fees_paid_total == Decimal("2.40")

    @pytest.mark.asyncio
    async def test_record_prebuy_persists(self):
        m = _mgr()
        await m.record_prebuy(
            qty=Decimal("0.1"),
            avg_price=Decimal("80000"),
            fee=Decimal("4"),
        )
        m.repo.update_grid_state.assert_awaited_once()
        kwargs = m.repo.update_grid_state.await_args.kwargs
        assert kwargs["prebuy_qty"] == pytest.approx(0.1)
        assert kwargs["prebuy_avg_price"] == pytest.approx(80000.0)
        assert kwargs["inventory_qty"] == pytest.approx(0.1)


# ─────────────────────────────────────────────────────────────────────────
# Buy math: weighted average cost basis
# ─────────────────────────────────────────────────────────────────────────

class TestBuyFill:
    @pytest.mark.asyncio
    async def test_buy_from_zero_inventory(self):
        m = _mgr()
        r = await m.apply_fill(side="buy", qty="0.01", price="70000", fee="0.14")
        # Cost basis includes fee: (0 * 0 + 0.01 * 70000 + 0.14) / 0.01 = 70014
        assert r.new_inventory_qty == Decimal("0.01")
        assert r.new_inventory_avg_cost == Decimal("70014")
        assert r.realized_pnl == Decimal("0")
        assert m.state.n_buy_fills == 1

    @pytest.mark.asyncio
    async def test_buy_compounds_avg_cost(self):
        m = _mgr()
        await m.apply_fill(side="buy", qty="0.01", price="70000", fee="0")
        await m.apply_fill(side="buy", qty="0.01", price="80000", fee="0")
        # avg_cost = (0.01*70000 + 0.01*80000) / 0.02 = 75000
        assert m.state.qty == Decimal("0.02")
        assert m.state.avg_cost == Decimal("75000")

    @pytest.mark.asyncio
    async def test_buy_persists_fill(self):
        m = _mgr()
        await m.apply_fill(
            side="buy", qty="0.01", price="75000", fee="0.15",
            exchange_order_id="abc123", level_index=10,
        )
        m.repo.record_grid_fill.assert_awaited_once()
        kwargs = m.repo.record_grid_fill.await_args.kwargs
        assert kwargs["side"] == "buy"
        assert kwargs["exchange_order_id"] == "abc123"
        assert kwargs["level_index"] == 10
        assert kwargs["fill_price"] == 75000.0
        assert kwargs["realized_pnl"] == 0.0


# ─────────────────────────────────────────────────────────────────────────
# Sell math: realized P&L
# ─────────────────────────────────────────────────────────────────────────

class TestSellFill:
    @pytest.mark.asyncio
    async def test_sell_realized_pnl_basic(self):
        m = _mgr(long_only=False)
        # Buy 0.02 BTC at $70K (avg cost = 70000)
        await m.apply_fill(side="buy", qty="0.02", price="70000", fee="0")
        # Sell 0.01 at $80K → realized = (80000 - 70000) * 0.01 - fee = 100 - 0.10 = 99.90
        r = await m.apply_fill(side="sell", qty="0.01", price="80000", fee="0.10")
        assert r.realized_pnl == pytest.approx(Decimal("99.90"))
        assert r.new_inventory_qty == Decimal("0.01")
        # Avg cost unchanged on partial exit
        assert r.new_inventory_avg_cost == Decimal("70000")

    @pytest.mark.asyncio
    async def test_sell_full_exit_resets_avg(self):
        m = _mgr(long_only=False)
        await m.apply_fill(side="buy", qty="0.02", price="70000", fee="0")
        await m.apply_fill(side="sell", qty="0.02", price="75000", fee="0")
        assert m.state.qty == Decimal("0")
        assert m.state.avg_cost == Decimal("0")

    @pytest.mark.asyncio
    async def test_sell_loss(self):
        """Sells below avg cost realize negative P&L."""
        m = _mgr(long_only=False)
        await m.apply_fill(side="buy", qty="0.01", price="80000", fee="0")
        r = await m.apply_fill(side="sell", qty="0.01", price="75000", fee="0")
        # realized = (75000 - 80000) * 0.01 = -50
        assert r.realized_pnl == Decimal("-50")

    @pytest.mark.asyncio
    async def test_sell_accumulates_realized_pnl_total(self):
        m = _mgr(long_only=False)
        await m.apply_fill(side="buy", qty="0.03", price="70000", fee="0")
        await m.apply_fill(side="sell", qty="0.01", price="80000", fee="0")  # +100
        await m.apply_fill(side="sell", qty="0.01", price="75000", fee="0")  # +50
        assert m.state.realized_pnl_total == Decimal("150")


# ─────────────────────────────────────────────────────────────────────────
# Long-only floor enforcement
# ─────────────────────────────────────────────────────────────────────────

class TestLongOnlyFloor:
    @pytest.mark.asyncio
    async def test_sell_below_prebuy_floor_rejected(self):
        m = _mgr(long_only=True)
        await m.record_prebuy(qty=Decimal("0.05"), avg_price=Decimal("75000"), fee=Decimal("0"))
        # Inventory = 0.05; sell of 0.01 would leave 0.04 (below floor of 0.05)
        r = await m.apply_fill(side="sell", qty="0.01", price="80000", fee="0")
        assert r.rejected is True
        assert "long_only floor" in r.reject_reason
        # State unchanged
        assert m.state.qty == Decimal("0.05")

    @pytest.mark.asyncio
    async def test_sell_above_floor_allowed(self):
        m = _mgr(long_only=True)
        await m.record_prebuy(qty=Decimal("0.05"), avg_price=Decimal("75000"), fee=Decimal("0"))
        # Buy more to get above floor
        await m.apply_fill(side="buy", qty="0.02", price="78000", fee="0")
        # Now inventory = 0.07; sell of 0.01 leaves 0.06 (above floor)
        r = await m.apply_fill(side="sell", qty="0.01", price="80000", fee="0")
        assert r.rejected is False
        assert m.state.qty == Decimal("0.06")

    @pytest.mark.asyncio
    async def test_long_only_false_allows_sell_below_floor(self):
        m = _mgr(long_only=False)
        await m.record_prebuy(qty=Decimal("0.05"), avg_price=Decimal("75000"), fee=Decimal("0"))
        r = await m.apply_fill(side="sell", qty="0.01", price="80000", fee="0")
        # Should succeed since long_only=False
        assert r.rejected is False

    def test_can_sell_returns_reason(self):
        m = _mgr(long_only=True)
        m.state.qty = Decimal("0.05")
        m.state.prebuy_qty = Decimal("0.05")
        allowed, reason = m.can_sell(Decimal("0.01"))
        assert allowed is False
        assert "long_only floor" in reason

    def test_can_sell_long_only_disabled(self):
        m = _mgr(long_only=False)
        m.state.qty = Decimal("0.05")
        m.state.prebuy_qty = Decimal("0.05")
        allowed, reason = m.can_sell(Decimal("0.01"))
        assert allowed is True
        assert reason is None


# ─────────────────────────────────────────────────────────────────────────
# Load from DB (boot path)
# ─────────────────────────────────────────────────────────────────────────

class TestLoadFromDb:
    @pytest.mark.asyncio
    async def test_loads_zero_when_no_state(self):
        m = _mgr()
        await m.load_from_db()  # mock returns None
        assert m.state.qty == Decimal("0")
        assert m.state.avg_cost == Decimal("0")

    @pytest.mark.asyncio
    async def test_restores_from_db(self):
        from types import SimpleNamespace
        repo = AsyncMock()
        repo.get_grid_state = AsyncMock(return_value=SimpleNamespace(
            inventory_qty=0.05,
            inventory_avg_cost=75000.0,
            realized_pnl_total=125.50,
            fees_paid_total=4.20,
            n_buy_fills=10,
            n_sell_fills=8,
            prebuy_qty=0.02,
        ))
        m = GridPositionManager(repository=repo, long_only=True)
        await m.load_from_db()
        assert m.state.qty == Decimal("0.05")
        assert m.state.avg_cost == Decimal("75000.0")
        assert m.state.realized_pnl_total == Decimal("125.50")
        assert m.state.prebuy_qty == Decimal("0.02")


# ─────────────────────────────────────────────────────────────────────────
# Edge cases
# ─────────────────────────────────────────────────────────────────────────

class TestEdgeCases:
    @pytest.mark.asyncio
    async def test_unknown_side_raises(self):
        m = _mgr()
        with pytest.raises(ValueError, match="side must be"):
            await m.apply_fill(side="banana", qty="0.01", price="70000", fee="0")

    def test_to_decimal_accepts_various(self):
        assert _to_decimal(1) == Decimal("1")
        assert _to_decimal(1.5) == Decimal("1.5")
        assert _to_decimal("2.5") == Decimal("2.5")
        assert _to_decimal(Decimal("3")) == Decimal("3")
