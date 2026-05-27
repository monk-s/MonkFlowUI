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


def _mgr(long_only=True, floor_fraction=Decimal("1.0")):
    # Tests default to floor_fraction=1.0 (legacy "floor == full prebuy")
    # so the existing assertions exercise the strict-floor behavior.
    # Production now defaults to 0.5 (see config/settings.py).
    return GridPositionManager(
        repository=_mock_repo(),
        long_only=long_only,
        floor_fraction=floor_fraction,
    )


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

    def test_floor_fraction_relaxes_floor(self):
        """With floor_fraction=0.5 and prebuy=0.05, the floor drops to 0.025.
        A sell of 0.01 from inventory 0.05 leaves 0.04 → above floor → allowed."""
        m = _mgr(long_only=True, floor_fraction=Decimal("0.5"))
        m.state.qty = Decimal("0.05")
        m.state.prebuy_qty = Decimal("0.05")
        allowed, _ = m.can_sell(Decimal("0.01"))
        assert allowed is True
        assert m.inventory_floor == Decimal("0.025")

    def test_floor_fraction_still_blocks_below_relaxed_floor(self):
        """With floor_fraction=0.5 and prebuy=0.05, floor=0.025.
        A sell that would leave 0.02 (below 0.025) is still rejected."""
        m = _mgr(long_only=True, floor_fraction=Decimal("0.5"))
        m.state.qty = Decimal("0.03")
        m.state.prebuy_qty = Decimal("0.05")
        allowed, reason = m.can_sell(Decimal("0.01"))
        assert allowed is False
        assert "long_only floor" in reason

    def test_floor_fraction_zero_means_no_floor(self):
        """floor_fraction=0 lets the grid sell down to zero inventory."""
        m = _mgr(long_only=True, floor_fraction=Decimal("0.0"))
        m.state.qty = Decimal("0.05")
        m.state.prebuy_qty = Decimal("0.05")
        allowed, _ = m.can_sell(Decimal("0.04"))
        assert allowed is True

    def test_floor_fraction_validates_range(self):
        """floor_fraction outside [0, 1] is rejected at construction time."""
        with pytest.raises(ValueError, match="floor_fraction"):
            GridPositionManager(repository=_mock_repo(), floor_fraction=Decimal("1.5"))
        with pytest.raises(ValueError, match="floor_fraction"):
            GridPositionManager(repository=_mock_repo(), floor_fraction=Decimal("-0.1"))

    def test_floor_fraction_accepts_float_and_str(self):
        """Constructor coerces float / str via _to_decimal."""
        m1 = GridPositionManager(repository=_mock_repo(), floor_fraction=0.85)
        m2 = GridPositionManager(repository=_mock_repo(), floor_fraction="0.85")
        assert m1.floor_fraction == Decimal("0.85")
        assert m2.floor_fraction == Decimal("0.85")


# ─────────────────────────────────────────────────────────────────────────
# is_sell_economically_positive — AUDIT-FIX C2
# ─────────────────────────────────────────────────────────────────────────

class TestSellEconomicallyPositive:
    """Lone-sell breakeven check that catches the live fee-trap bleed.

    The reference scenario (2026-05-27 production live data):
      avg_cost = 75873.54, level_price = 75879, qty = 0.0043,
      maker_fee_pct = 0.04 (paper). gross = $0.0235, fee = $0.1305.
      Net = −$0.107 per lone sell. The check MUST reject this placement.
    """

    def test_returns_true_when_no_inventory(self):
        """Empty inventory: no avg-cost basis to ground against → permissive."""
        m = _mgr()
        ok, reason = m.is_sell_economically_positive(
            level_price=Decimal("80000"), qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is True
        assert reason is None

    def test_returns_true_when_avg_cost_zero(self):
        """avg_cost==0 means no anchor — defer to the floor check."""
        m = _mgr()
        m.state.qty = Decimal("0.01")
        m.state.avg_cost = Decimal("0")
        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("80000"), qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is True

    def test_rejects_live_bleed_scenario(self):
        """The exact scenario from 2026-05-27 production fills."""
        m = _mgr()
        m.state.qty = Decimal("0.0922")
        m.state.avg_cost = Decimal("75873.54")
        ok, reason = m.is_sell_economically_positive(
            level_price=Decimal("75879"),
            qty=Decimal("0.0043"),
            maker_fee_pct=Decimal("0.04"),  # paper maker
        )
        assert ok is False
        assert "lose money on a lone fill" in reason

    def test_rejects_live_bleed_at_live_fee_too(self):
        """Same scenario but at Coinbase INTX live maker fee (0.02%).
        Bleed is slower in live but still strictly negative per fire."""
        m = _mgr()
        m.state.qty = Decimal("0.0922")
        m.state.avg_cost = Decimal("75873.54")
        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("75879"),
            qty=Decimal("0.0043"),
            maker_fee_pct=Decimal("0.02"),  # live
        )
        assert ok is False

    def test_accepts_level_one_full_step_above_avg(self):
        """A sell one grid-step (~$298) above avg_cost is economically positive
        even with the safety margin of 1.5."""
        m = _mgr()
        m.state.qty = Decimal("0.0922")
        m.state.avg_cost = Decimal("75873.54")
        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("76172"),  # ~$298 above avg_cost
            qty=Decimal("0.0043"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is True

    def test_rejects_level_below_avg_cost(self):
        """Levels below avg_cost have negative gross — always rejected."""
        m = _mgr()
        m.state.qty = Decimal("0.05")
        m.state.avg_cost = Decimal("80000")
        ok, reason = m.is_sell_economically_positive(
            level_price=Decimal("79000"),
            qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is False
        assert "75" not in reason  # sanity: reason mentions avg_cost
        assert "80000" in reason

    def test_strict_breakeven_at_margin_1(self):
        """margin=1.0 = strict breakeven. A level exactly at gross==fee fails;
        one penny above passes."""
        m = _mgr()
        m.state.qty = Decimal("0.01")
        m.state.avg_cost = Decimal("80000")
        # At maker_fee_pct=0.04%, on qty=0.01 at level $80,032:
        #   gross = (80032 - 80000) * 0.01 = 0.32
        #   fee   = 80032 * 0.01 * 0.0004  = 0.32013...
        # → gross < fee → reject
        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("80032"),
            qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
            margin=Decimal("1.0"),
        )
        assert ok is False
        # At level $80,500 the gross dwarfs the fee → accept
        ok2, _ = m.is_sell_economically_positive(
            level_price=Decimal("80500"),
            qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
            margin=Decimal("1.0"),
        )
        assert ok2 is True

    def test_higher_margin_blocks_more_aggressively(self):
        """margin=3.0 demands a wider edge — a level that passes at 1.0
        may fail at 3.0."""
        m = _mgr()
        m.state.qty = Decimal("0.01")
        m.state.avg_cost = Decimal("80000")
        # gross = (80100 - 80000)*0.01 = 1.0; fee = 80100*0.01*0.0004 = 0.3204
        # margin=1.0: 1.0 > 0.32 → True
        # margin=3.0: 1.0 > 0.96 → True
        # margin=5.0: 1.0 > 1.60 → False
        assert m.is_sell_economically_positive(
            level_price=Decimal("80100"), qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"), margin=Decimal("1.0"),
        )[0] is True
        assert m.is_sell_economically_positive(
            level_price=Decimal("80100"), qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"), margin=Decimal("5.0"),
        )[0] is False

    def test_accepts_decimal_str_and_float_inputs(self):
        """All inputs coerced via _to_decimal."""
        m = _mgr()
        m.state.qty = Decimal("0.01")
        m.state.avg_cost = Decimal("80000")
        # All three forms produce the same answer
        a = m.is_sell_economically_positive(
            level_price=80500, qty=0.01, maker_fee_pct=0.04,
        )[0]
        b = m.is_sell_economically_positive(
            level_price="80500", qty="0.01", maker_fee_pct="0.04",
        )[0]
        c = m.is_sell_economically_positive(
            level_price=Decimal("80500"), qty=Decimal("0.01"),
            maker_fee_pct=Decimal("0.04"),
        )[0]
        assert a == b == c == True


# ─────────────────────────────────────────────────────────────────────────
# effective_avg_cost — AUDIT-FIX C4
# ─────────────────────────────────────────────────────────────────────────

class TestEffectiveAvgCost:
    """C4: P&L-adjusted breakeven floor that self-corrects as realized
    losses (or profits) accumulate. Layers on top of C2's helper so a
    bot that has already bled at a level becomes EVEN harder to fire
    sells there.
    """

    def test_no_inventory_returns_raw_avg_cost(self):
        m = _mgr()
        m.state.qty = Decimal("0")
        m.state.avg_cost = Decimal("80000")
        m.state.realized_pnl_total = Decimal("-50")
        # qty=0 → avoid div-by-zero; fall back to avg_cost
        assert m.effective_avg_cost() == Decimal("80000")

    def test_zero_realized_pnl_matches_avg_cost(self):
        m = _mgr()
        m.state.qty = Decimal("0.01")
        m.state.avg_cost = Decimal("80000")
        m.state.realized_pnl_total = Decimal("0")
        # Fresh deploy (no realized P&L) → eff_avg == avg_cost
        assert m.effective_avg_cost() == Decimal("80000")

    def test_realized_losses_raise_effective_floor(self):
        """Losses RAISE the effective cost basis — harder to sell at
        levels just above raw avg_cost after losses have been booked."""
        m = _mgr()
        m.state.qty = Decimal("0.075")
        m.state.avg_cost = Decimal("75873.54")
        m.state.realized_pnl_total = Decimal("-0.43")
        # eff_avg = 75873.54 - (-0.43 / 0.075) = 75873.54 + 5.7333... = 75879.27
        eff = m.effective_avg_cost()
        assert eff > Decimal("75873.54")
        assert abs(eff - Decimal("75879.273")) < Decimal("0.01"), eff

    def test_realized_profits_lower_effective_floor(self):
        """Profits LOWER the effective cost basis — easier to sell at
        levels marginally above raw avg_cost when the bot has earned
        a buffer."""
        m = _mgr()
        m.state.qty = Decimal("0.05")
        m.state.avg_cost = Decimal("80000")
        m.state.realized_pnl_total = Decimal("100")
        # eff_avg = 80000 - (100 / 0.05) = 80000 - 2000 = 78000
        assert m.effective_avg_cost() == Decimal("78000")

    def test_c4_blocks_relapse_at_previously_bled_level(self):
        """The flagship C4 scenario: after losses have already accumulated
        from sells at a level, re-engaging that level must be BLOCKED
        even though the raw C2 check (against unmodified avg_cost) would
        marginally allow it.

        Walk: avg_cost $75,873.54, level $75,879, qty 0.0043, maker
        fee 0.04%. Before any losses, the level is just barely below
        breakeven and C2 already rejects (gross 0.0235 vs fee*1.5 =
        0.196). After 4 lone-sells lost a total of $0.43 (the actual
        2026-05-27 production state), the effective avg_cost rises
        to ~$75,879.27 — meaning level 7 ($75,879) is now BELOW the
        effective cost basis: gross is NEGATIVE, and the rejection
        message reflects that.
        """
        m = _mgr()
        m.state.qty = Decimal("0.0750")     # inventory after 4 lone sells
        m.state.avg_cost = Decimal("75873.54")
        m.state.realized_pnl_total = Decimal("-0.43")  # accumulated losses

        ok, reason = m.is_sell_economically_positive(
            level_price=Decimal("75879"),
            qty=Decimal("0.0043"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is False
        # Reason mentions the P&L-adjusted floor so operators can see
        # that C4 was the gating factor (not just C2).
        assert "eff_avg" in reason
        assert "realized_pnl_total" in reason

    def test_c4_allows_sell_after_realized_profits_built_buffer(self):
        """Mirror of the above: a level just above raw avg_cost that
        C2 alone would reject becomes ALLOWED after the bot has built
        up enough realized profit for the buffer."""
        m = _mgr()
        m.state.qty = Decimal("0.05")
        m.state.avg_cost = Decimal("80000")
        # Big realized profit drops eff_avg far below the level
        m.state.realized_pnl_total = Decimal("50")  # eff_avg = 79000

        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("80050"),  # only $50 above raw avg
            qty=Decimal("0.001"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is True

    def test_c4_zero_pnl_matches_c2_behavior(self):
        """Regression: with realized_pnl_total=0, C4 must produce
        identical decisions to vanilla C2. The 2026-05-27 baseline
        scenario from the C2 tests must still reject."""
        m = _mgr()
        m.state.qty = Decimal("0.0922")
        m.state.avg_cost = Decimal("75873.54")
        m.state.realized_pnl_total = Decimal("0")
        ok, _ = m.is_sell_economically_positive(
            level_price=Decimal("75879"),
            qty=Decimal("0.0043"),
            maker_fee_pct=Decimal("0.04"),
        )
        assert ok is False  # same as the C2-only test


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
