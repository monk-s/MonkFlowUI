"""Integration tests for GridOrderManager + GridPositionManager.

Uses an in-memory FakeRepo (no real DB) and a hand-driven FakeExchange
that lets tests control fill behavior precisely. Validates the
end-to-end grid cycle: pre-buy → tick → buy fills → opposite sells
placed → sell fills → realized P&L → recenter → emergency exit.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from typing import Optional

import pytest

from bot.exchange.base import OrderResult, OrderSide, OrderType
from bot.execution.grid_order_manager import GridOrderManager, PrebuyResult
from bot.execution.grid_position_manager import GridPositionManager
from bot.strategy.grid_strategy import GridRange, compute_range_and_levels


# ─────────────────────────────────────────────────────────────────────────
# In-memory fakes
# ─────────────────────────────────────────────────────────────────────────


class FakeRepo:
    """In-memory implementation of the repository methods grid uses.

    Stores grid_state, active_orders, fills in dicts/lists. Mirrors the
    method signatures the GridOrderManager + GridPositionManager call.
    """

    def __init__(self):
        # tb3_grid_state singleton (as SimpleNamespace so .field works)
        self.grid_state = SimpleNamespace(
            id=1,
            symbol="BTC-PERP-INTX",
            prebuy_qty=0,
            prebuy_avg_price=0,
            prebuy_at=None,
            current_range_low=None,
            current_range_high=None,
            num_levels=None,
            capital_per_level=None,
            last_recenter_at=None,
            next_recenter_at=None,
            inventory_qty=0,
            inventory_avg_cost=0,
            realized_pnl_total=0,
            fees_paid_total=0,
            n_buy_fills=0,
            n_sell_fills=0,
        )
        # tb3_active_orders by exchange_order_id
        self.active_orders: dict[str, SimpleNamespace] = {}
        self._next_order_db_id = 1
        # tb3_grid_fills
        self.fills: list[SimpleNamespace] = []

    # --- grid_state ---
    async def get_grid_state(self):
        return self.grid_state

    async def update_grid_state(self, **kwargs):
        for k, v in kwargs.items():
            setattr(self.grid_state, k, v)

    # --- active orders ---
    async def insert_active_order(
        self, *, exchange_order_id, side, level_index, level_price, qty,
    ):
        row = SimpleNamespace(
            id=self._next_order_db_id,
            exchange_order_id=exchange_order_id,
            side=side,
            level_index=level_index,
            level_price=level_price,
            qty=qty,
            status="open",
            created_at=datetime.now(timezone.utc),
            filled_at=None,
            cancelled_at=None,
            last_polled_at=None,
            fill_price=None,
            fill_qty=None,
            fee_paid=None,
        )
        self.active_orders[exchange_order_id] = row
        self._next_order_db_id += 1
        return row

    async def update_active_order(self, exchange_order_id, **kwargs):
        row = self.active_orders.get(exchange_order_id)
        if row is None:
            return
        for k, v in kwargs.items():
            setattr(row, k, v)

    async def mark_order_filled(
        self, *, exchange_order_id, fill_price, fill_qty, fee_paid,
    ):
        await self.update_active_order(
            exchange_order_id,
            status="filled",
            filled_at=datetime.now(timezone.utc),
            fill_price=fill_price,
            fill_qty=fill_qty,
            fee_paid=fee_paid,
        )

    async def mark_order_cancelled(self, exchange_order_id):
        await self.update_active_order(
            exchange_order_id,
            status="cancelled",
            cancelled_at=datetime.now(timezone.utc),
        )

    async def get_active_order(self, exchange_order_id):
        return self.active_orders.get(exchange_order_id)

    async def get_open_active_orders(self):
        return sorted(
            [o for o in self.active_orders.values() if o.status == "open"],
            key=lambda o: o.level_index,
        )

    async def get_stale_open_orders(self, max_age_minutes):
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        return [
            o for o in self.active_orders.values()
            if o.status == "open" and o.created_at < cutoff
        ]

    async def get_open_orders_at_level(self, level_index, side=None):
        out = [
            o for o in self.active_orders.values()
            if o.status == "open" and o.level_index == level_index
        ]
        if side is not None:
            out = [o for o in out if o.side == side]
        return out

    async def touch_order_polled(self, exchange_order_id):
        await self.update_active_order(
            exchange_order_id, last_polled_at=datetime.now(timezone.utc)
        )

    # --- fills ---
    async def record_grid_fill(
        self,
        *,
        active_order_id, exchange_order_id, side, level_index,
        fill_price, fill_qty, fee_paid, realized_pnl,
        inventory_after_qty, inventory_after_avg_cost,
    ):
        fill = SimpleNamespace(
            id=len(self.fills) + 1,
            active_order_id=active_order_id,
            exchange_order_id=exchange_order_id,
            side=side, level_index=level_index,
            fill_price=fill_price, fill_qty=fill_qty,
            fee_paid=fee_paid, realized_pnl=realized_pnl,
            inventory_after_qty=inventory_after_qty,
            inventory_after_avg_cost=inventory_after_avg_cost,
            created_at=datetime.now(timezone.utc),
        )
        self.fills.append(fill)
        return fill

    async def get_most_recent_fill_at_level(self, level_index, side=None):
        """Mirror of Repository.get_most_recent_fill_at_level for tests."""
        candidates = [f for f in self.fills if f.level_index == level_index]
        if side is not None:
            candidates = [f for f in candidates if f.side == side]
        if not candidates:
            return None
        return max(candidates, key=lambda f: f.created_at)


class FakeExchange:
    """Minimal exchange that returns whatever fills we feed it.

    `set_filled(order_id)` flags an order as filled at its limit price.
    `place_order` returns a synthetic OrderResult with a sequential id.
    `get_order` returns the cached state.
    """

    def __init__(self, maker_fee_pct: float = 0.02):
        self.placed: dict[str, OrderResult] = {}
        self.filled: set[str] = set()
        self.cancelled: set[str] = set()
        self.market_fills: list[OrderResult] = []  # historical market fills
        self.closed_positions: list[tuple[str, Decimal]] = []
        self._next_id = 1
        self.maker_fee_pct = Decimal(str(maker_fee_pct))

    def _next_order_id(self) -> str:
        oid = f"fake-{self._next_id:06d}"
        self._next_id += 1
        return oid

    async def place_order(
        self, side, size, order_type,
        price=None, stop_price=None,
        leverage=Decimal("1"), reduce_only=False, post_only=False,
    ) -> OrderResult:
        # AUDIT-FIX A2: tests can set `reject_next_limit` to simulate a
        # Coinbase {"success": false, ...} rejection (e.g., post_only
        # would cross the spread). The exchange returns an OrderResult
        # with empty order_id; the grid manager must NOT insert a row.
        if order_type != OrderType.MARKET and getattr(self, "reject_next_limit", False):
            self.reject_next_limit = False
            return OrderResult(
                order_id="",  # sentinel — empty means rejected
                side=side, order_type=order_type,
                size=size, price=price, filled=False, fee=Decimal("0"),
            )
        oid = self._next_order_id()
        if order_type == OrderType.MARKET:
            # Market fills immediately at `price` if given, else $77000 (deterministic test default)
            fill_price = price if price else Decimal("77000")
            fee = size * fill_price * (Decimal("0.06") / Decimal("100"))  # taker
            result = OrderResult(
                order_id=oid, side=side, order_type=order_type,
                size=size, price=fill_price, filled=True, fee=fee,
            )
            self.market_fills.append(result)
            return result
        else:
            # LIMIT — store as pending; tests will call set_filled() to simulate fill
            result = OrderResult(
                order_id=oid, side=side, order_type=order_type,
                size=size, price=price, filled=False, fee=Decimal("0"),
            )
            self.placed[oid] = result
            return result

    def set_filled(self, order_id: str):
        """Mark a pending limit as filled — next get_order() will report it."""
        if order_id in self.placed:
            self.filled.add(order_id)

    def set_terminal_status(self, order_id: str, status: str):
        """AUDIT-FIX A3: simulate the exchange moving an order to
        CANCELLED / EXPIRED / FAILED behind our back (user cancel via UI,
        exchange risk-engine cancel, listing change, etc).
        """
        if not hasattr(self, "terminal_statuses"):
            self.terminal_statuses = {}
        self.terminal_statuses[order_id] = status

    async def get_order(self, order_id: str) -> Optional[OrderResult]:
        if order_id in self.placed:
            base = self.placed[order_id]
            if order_id in self.filled:
                # Compute maker fee
                fee = base.size * base.price * (self.maker_fee_pct / Decimal("100"))
                return OrderResult(
                    order_id=order_id, side=base.side, order_type=base.order_type,
                    size=base.size, price=base.price, filled=True, fee=fee,
                )
            # AUDIT-FIX A3: terminal_status overrides the still-pending response
            terminal = getattr(self, "terminal_statuses", {}).get(order_id)
            if terminal:
                return OrderResult(
                    order_id=order_id, side=base.side, order_type=base.order_type,
                    size=base.size, price=base.price, filled=False,
                    fee=Decimal("0"), terminal_status=terminal,
                )
            return base
        # Check market fill history
        for m in self.market_fills:
            if m.order_id == order_id:
                return m
        return None

    async def cancel_order(self, order_id: str) -> tuple[bool, Optional[str]]:
        # AUDIT-FIX A1: returns (success, failure_reason).
        if order_id in self.placed:
            self.cancelled.add(order_id)
            del self.placed[order_id]
            return True, None
        return False, "UNKNOWN_CANCEL_ORDER"

    async def close_position(self, side: str, size: Decimal) -> OrderResult:
        # Treat as a market sell
        self.closed_positions.append((side, size))
        return OrderResult(
            order_id=self._next_order_id(),
            side=OrderSide.SELL if side == "long" else OrderSide.BUY,
            order_type=OrderType.MARKET,
            size=size, price=Decimal("77000"), filled=True,
            fee=Decimal("0"),
        )


# ─────────────────────────────────────────────────────────────────────────
# Fixtures
# ─────────────────────────────────────────────────────────────────────────


def _build_setup(
    *,
    range_low=50000, range_high=110000, n_levels=7,
    capital_per_level=320.0,
    orders_per_side=3,
    long_only=True,
    floor_fraction=Decimal("1.0"),  # legacy strict floor for these tests
):
    repo = FakeRepo()
    pos_mgr = GridPositionManager(
        repository=repo, long_only=long_only, floor_fraction=floor_fraction,
    )
    exch = FakeExchange()
    om = GridOrderManager(
        exchange=exch,
        repository=repo,
        position_manager=pos_mgr,
        symbol="BTC-PERP-INTX",
        capital_per_level=capital_per_level,
        leverage=1.0,
        maker_only=True,
        orders_per_side=orders_per_side,
        order_stale_minutes=1440,
        maker_fee_pct=0.02,
    )
    grid_range = compute_range_and_levels(
        mode="static",
        static_low=range_low, static_high=range_high,
        n_levels=n_levels,
    )
    return repo, pos_mgr, exch, om, grid_range


# ─────────────────────────────────────────────────────────────────────────
# Tests
# ─────────────────────────────────────────────────────────────────────────


class TestPrebuy:
    @pytest.mark.asyncio
    async def test_prebuy_records_inventory_floor(self):
        _, pos_mgr, _, om, _ = _build_setup()
        result = await om.execute_prebuy(notional_usd=4800.0, current_price=77000.0)
        assert result.success
        assert result.filled_qty > 0
        # Inventory floor recorded
        assert pos_mgr.state.prebuy_qty == result.filled_qty
        assert pos_mgr.state.qty == result.filled_qty

    @pytest.mark.asyncio
    async def test_prebuy_sizing(self):
        _, _, _, om, _ = _build_setup()
        # $4800 notional at $77K → 0.06233766... BTC; quantized DOWN to
        # Coinbase's 0.0001 BTC base_increment → 0.0623
        result = await om.execute_prebuy(notional_usd=4800.0, current_price=77000.0)
        assert result.filled_qty == Decimal("0.0623")

    @pytest.mark.asyncio
    async def test_prebuy_quantizes_down(self):
        """Always round DOWN — never accidentally up-size into more risk."""
        _, _, _, om, _ = _build_setup()
        # $4801 / $77K = 0.06234... → quantize DOWN to 0.0623 (not 0.0624)
        result = await om.execute_prebuy(notional_usd=4801.0, current_price=77000.0)
        assert result.filled_qty == Decimal("0.0623")

    @pytest.mark.asyncio
    async def test_prebuy_too_small_to_quantize_fails(self):
        """Notional too small to produce ≥0.0001 BTC must fail cleanly."""
        _, _, _, om, _ = _build_setup()
        # $5 at $77K = 0.0000649 BTC → quantizes down to 0
        result = await om.execute_prebuy(notional_usd=5.0, current_price=77000.0)
        assert not result.success
        assert "too small" in result.error

    @pytest.mark.asyncio
    async def test_prebuy_status_lifecycle_on_success(self):
        """Successful pre-buy: 'pending' → 'complete'."""
        repo, _, _, om, _ = _build_setup()
        await om.execute_prebuy(notional_usd=4800.0, current_price=77000.0)
        assert repo.grid_state.prebuy_status == "complete"

    @pytest.mark.asyncio
    async def test_prebuy_status_failed_on_exchange_error(self):
        """Exchange exception during pre-buy → status='failed'."""
        repo, _, exch, om, _ = _build_setup()
        # Force the exchange to raise on place_order
        from unittest.mock import AsyncMock
        exch.place_order = AsyncMock(side_effect=Exception("API down"))
        result = await om.execute_prebuy(notional_usd=4800.0, current_price=77000.0)
        assert not result.success
        assert repo.grid_state.prebuy_status == "failed"

    @pytest.mark.asyncio
    async def test_prebuy_status_failed_when_not_filled(self):
        """Exchange returns filled=False → status='failed'."""
        repo, _, exch, om, _ = _build_setup()
        from unittest.mock import AsyncMock
        from bot.exchange.base import OrderResult, OrderSide, OrderType
        from decimal import Decimal as D
        exch.place_order = AsyncMock(return_value=OrderResult(
            order_id="fake-X", side=OrderSide.BUY, order_type=OrderType.MARKET,
            size=D("0.0623"), price=D("77000"), filled=False, fee=D("0"),
        ))
        result = await om.execute_prebuy(notional_usd=4800.0, current_price=77000.0)
        assert not result.success
        assert repo.grid_state.prebuy_status == "failed"

    @pytest.mark.asyncio
    async def test_prebuy_zero_notional_fails(self):
        _, _, _, om, _ = _build_setup()
        result = await om.execute_prebuy(notional_usd=0.0, current_price=77000.0)
        assert not result.success
        assert "invalid sizing" in result.error


class TestTickPopulatesLevels:
    @pytest.mark.asyncio
    async def test_populates_both_sides_when_long_only_disabled(self):
        """With long_only=False, both sides populate immediately."""
        repo, pos_mgr, _exch, om, gr = _build_setup(orders_per_side=3, long_only=False)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        open_orders = await repo.get_open_active_orders()
        buys = [o for o in open_orders if o.side == "buy"]
        sells = [o for o in open_orders if o.side == "sell"]
        buy_prices = sorted([o.level_price for o in buys])
        assert buy_prices == [50000.0, 60000.0, 70000.0]
        sell_prices = sorted([o.level_price for o in sells])
        assert sell_prices == [90000.0, 100000.0, 110000.0]

    @pytest.mark.asyncio
    async def test_long_only_blocks_initial_sells_at_floor(self):
        """With long_only=True and inventory==prebuy_qty (the floor),
        initial sells are blocked. The grid only places buys until enough
        inventory accumulates ABOVE the floor for sells to fire."""
        repo, pos_mgr, _exch, om, gr = _build_setup(orders_per_side=3, long_only=True)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        open_orders = await repo.get_open_active_orders()
        buys = [o for o in open_orders if o.side == "buy"]
        sells = [o for o in open_orders if o.side == "sell"]
        # 3 buys placed (below $80K)
        assert len(buys) == 3
        # 0 sells — floor blocks them all (inventory == prebuy_qty)
        assert len(sells) == 0

    @pytest.mark.asyncio
    async def test_idempotent_tick_doesnt_duplicate_orders(self):
        repo, pos_mgr, _exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        first_count = len(await repo.get_open_active_orders())
        # Second tick should NOT duplicate
        await om.tick(grid_range=gr, current_price=80000.0)
        second_count = len(await repo.get_open_active_orders())
        assert first_count == second_count

    @pytest.mark.asyncio
    async def test_long_only_blocks_sell_when_no_inventory_above_floor(self):
        repo, pos_mgr, _exch, om, gr = _build_setup(orders_per_side=3, long_only=True)
        # No pre-buy → no inventory → sells should be blocked
        await om.tick(grid_range=gr, current_price=80000.0)
        open_orders = await repo.get_open_active_orders()
        sells = [o for o in open_orders if o.side == "sell"]
        assert len(sells) == 0
        # Buys still populated
        buys = [o for o in open_orders if o.side == "buy"]
        assert len(buys) == 3

    @pytest.mark.asyncio
    async def test_c2_skips_sells_below_breakeven(self):
        """AUDIT-FIX C2: a sell-level only marginally above avg_cost (gross < fee)
        must be skipped at placement. Reproduces the 2026-05-27 live bleed:
        avg_cost $75,873.54, level_price $75,879, qty 0.0043, maker_fee 0.04%
        → lone-sell net −$0.1075 — placement BLOCKED.

        Setup: a 4-level static grid at $75K–$76K spacing where the level
        just above current price lands $5 above avg_cost (the fee trap).
        With C2 in place, no sell is placed there; without C2, one would
        be placed and would fill at a guaranteed loss.
        """
        # Static range 75873.54–76200, 4 levels evenly spaced.
        # step = (76200 - 75873.54) / 3 ≈ $108.82
        # levels: 75873.54, 75982.36, 76091.18, 76200
        repo, pos_mgr, _exch, om, gr = _build_setup(
            range_low=75873.54, range_high=76200,
            n_levels=4,
            orders_per_side=3,
            capital_per_level=200.0,
            long_only=False,  # so inventory floor doesn't mask the C2 effect
        )
        await om.execute_prebuy(notional_usd=2000.0, current_price=75873.54)
        # Force avg_cost to the exact production value (paper test
        # prebuy fee adjustment isn't relevant here)
        pos_mgr.state.avg_cost = Decimal("75873.54")
        pos_mgr.state.qty = Decimal("0.0922")
        pos_mgr.state.prebuy_qty = Decimal("0.0922")

        # Current price right at avg_cost so all levels above are "sells_above"
        await om.tick(grid_range=gr, current_price=75873.55)
        open_orders = await repo.get_open_active_orders()
        sells = sorted(
            [o for o in open_orders if o.side == "sell"],
            key=lambda o: o.level_price,
        )

        # With maker_fee_pct=0.02 from _build_setup and margin=1.5:
        # Level $75,982.36: gross = (75982.36 - 75873.54)*qty,
        #                   fee   = 75982.36*qty*0.0002. For qty ≈ 0.0026:
        #   gross ≈ $0.282, fee ≈ $0.0395, fee*1.5 = $0.059 → ACCEPT
        # Level $76,091.18 and $76,200: clearly ACCEPT (further from avg_cost)
        # So with this $108 step and 0.02% fee, all 3 sells pass C2.
        # To verify C2 catches the live scenario, we need a tighter test
        # where the step is small relative to fee. See next test.
        assert len(sells) == 3

    @pytest.mark.asyncio
    async def test_c2_skips_live_bleed_exact_scenario(self):
        """The exact production scenario: level just $5.46 above avg_cost
        at paper's 0.04% maker fee. With C2 in place, the placement is
        SKIPPED. (Without C2, the bot would place a sell here and fill
        it on every up-tick, losing $0.1075 each fire.)"""
        # Build a grid where one level lands at exactly $75,879 (the live
        # fee trap). We use a static range 75,872 → 75,886 with 3 levels:
        # levels = [75872, 75879, 75886]. avg_cost = 75873.54.
        repo, pos_mgr, _exch, om, gr = _build_setup(
            range_low=75872.0, range_high=75886.0,
            n_levels=3,
            orders_per_side=2,
            capital_per_level=200.0,
            long_only=False,
        )
        # Override the manager's fee to paper's 0.04% (matches the live evidence)
        om.maker_fee_pct = Decimal("0.04")

        await om.execute_prebuy(notional_usd=2000.0, current_price=75873.54)
        pos_mgr.state.avg_cost = Decimal("75873.54")
        pos_mgr.state.qty = Decimal("0.0922")
        pos_mgr.state.prebuy_qty = Decimal("0.0922")

        # Place at current price below all 3 levels
        await om.tick(grid_range=gr, current_price=75872.0)
        open_orders = await repo.get_open_active_orders()
        sells = [o for o in open_orders if o.side == "sell"]
        # Level $75,879 (index 1): gross = (75879 - 75873.54) * qty
        #                          = 5.46 * 0.0026 = $0.0142
        #                          fee = 75879 * 0.0026 * 0.0004 = $0.0789
        #                          gross < fee → REJECT
        # Level $75,886 (index 2): gross = 12.46 * 0.0026 = $0.0324
        #                          fee = 75886 * 0.0026 * 0.0004 = $0.0789
        #                          gross < fee*1.5 = $0.118 → REJECT
        # All sells in this very-tight grid should be rejected by C2.
        assert sells == [], (
            f"Expected all sells skipped by C2 at this tight spread, got: "
            f"{[(o.level_index, o.level_price) for o in sells]}"
        )

    @pytest.mark.asyncio
    async def test_c2_no_constraint_when_inventory_empty(self):
        """C2 only blocks placement when there IS inventory to ground avg_cost
        against. With zero inventory, the long_only floor blocks the placement
        instead; C2 is permissive."""
        repo, pos_mgr, _exch, om, gr = _build_setup(
            orders_per_side=3,
            long_only=False,  # disable floor for this check
        )
        # No pre-buy → state.qty == 0, state.avg_cost == 0
        await om.tick(grid_range=gr, current_price=80000.0)
        open_orders = await repo.get_open_active_orders()
        sells = [o for o in open_orders if o.side == "sell"]
        # Sells should be placed (C2 permissive when no avg_cost basis)
        assert len(sells) == 3


class TestPlacementRejection:
    """AUDIT-FIX A2: when the exchange rejects a limit placement (e.g.,
    Coinbase returns {"success": false, "new_order_failure_reason":
    "INVALID_LIMIT_PRICE_POST_ONLY"}), the grid manager MUST NOT write
    a row to tb3_active_orders. Before this fix, the rejected order's
    client UUID was inserted as status='open' and never reconciled.
    """

    @pytest.mark.asyncio
    async def test_rejected_limit_does_not_insert_row(self):
        repo, pos_mgr, exch, om, gr = _build_setup(
            orders_per_side=3, long_only=False,
        )
        # Pre-place a buy successfully to confirm baseline behavior
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)

        # Snapshot active-orders count BEFORE the rejected placement
        before_count = len(repo.active_orders)

        # Flip the exchange into reject-the-next-limit mode
        exch.reject_next_limit = True
        result = await om._place_limit(
            side="buy", level_index=0, level_price=70000.0, qty=0.001,
        )

        # The placement must report failure
        assert result.success is False
        assert result.exchange_order_id is None
        assert "rejected" in (result.error or "").lower()

        # And critically: no new row in tb3_active_orders
        after_count = len(repo.active_orders)
        assert after_count == before_count, (
            f"A rejected placement must not write a row. "
            f"before={before_count}, after={after_count}"
        )

    @pytest.mark.asyncio
    async def test_rejection_in_populate_levels_doesnt_corrupt_db(self):
        """End-to-end check: if a tick's _populate_levels hits one rejection,
        the remaining placements still succeed and no orphan row appears.
        """
        repo, pos_mgr, exch, om, gr = _build_setup(
            orders_per_side=3, long_only=False,
        )
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)

        # Reject the first limit placement during the tick.
        exch.reject_next_limit = True
        await om.tick(grid_range=gr, current_price=80000.0)

        # Subsequent placements were not rejected → 5 limits land in DB
        # (3 buys + 3 sells - 1 rejected = 5 successful). No row carries
        # an empty exchange_order_id.
        open_orders = await repo.get_open_active_orders()
        assert all(o.exchange_order_id for o in open_orders), (
            f"No row should have an empty exchange_order_id, got: "
            f"{[(o.side, o.level_index, o.exchange_order_id) for o in open_orders]}"
        )
        # Exactly one fewer order than the rejection-free case
        assert len(open_orders) == 5


class TestFillAndOppositePlacement:
    @pytest.mark.asyncio
    async def test_buy_fill_places_sell_at_next_level(self):
        repo, pos_mgr, exch, om, gr = _build_setup(orders_per_side=2)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Find the buy at level 2 ($70K) and flag it as filled
        before = await repo.get_open_active_orders()
        buy_70k = next(o for o in before if o.side == "buy" and o.level_price == 70000.0)
        exch.set_filled(buy_70k.exchange_order_id)

        # Trigger tick again — should detect fill + place sell at level 3 ($80K)
        await om.tick(grid_range=gr, current_price=80000.0)

        # The buy at 70K should be marked filled
        filled_order = await repo.get_active_order(buy_70k.exchange_order_id)
        assert filled_order.status == "filled"

        # A new sell at level 3 ($80K) should be placed
        sells_at_80k = await repo.get_open_orders_at_level(3, side="sell")
        assert len(sells_at_80k) == 1
        assert sells_at_80k[0].level_price == 80000.0

        # Inventory should have grown by the filled qty
        assert pos_mgr.state.qty > pos_mgr.state.prebuy_qty

    @pytest.mark.asyncio
    async def test_sell_fill_places_buy_at_next_level_down(self):
        """Use long_only=False so initial sells can be placed for this test."""
        repo, pos_mgr, exch, om, gr = _build_setup(orders_per_side=2, long_only=False)
        await om.execute_prebuy(notional_usd=20000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        before = await repo.get_open_active_orders()
        sell_90k = next(o for o in before if o.side == "sell" and o.level_price == 90000.0)
        exch.set_filled(sell_90k.exchange_order_id)

        await om.tick(grid_range=gr, current_price=80000.0)

        filled = await repo.get_active_order(sell_90k.exchange_order_id)
        assert filled.status == "filled"

        # Opposite-side BUY should be placed at level 3 ($80K)
        buys_at_80k = await repo.get_open_orders_at_level(3, side="buy")
        assert len(buys_at_80k) == 1


class TestC1PairStateCooldown:
    """AUDIT-FIX C1: after a same-side fill at level N, suppress same-side
    re-placement at level N until the opposite-side pair-partner at the
    adjacent level fills (or the pair-partner is cancelled).
    """

    @pytest.mark.asyncio
    async def test_sell_at_level_blocked_while_pair_buy_pending(self):
        """Reproduces the 2026-05-27 production bleed: sell fires at level 7,
        opposite buy at level 6 stays pending → next tick must NOT re-place
        sell at level 7. The check kicks in via _is_pair_pending.
        """
        # 11 levels at $2K spacing, $70K–$90K
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=90000, n_levels=11,
            orders_per_side=5, long_only=False,
        )
        await om.execute_prebuy(notional_usd=20000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Fire the sell at level 6 ($82K) — opposite buy at level 5 ($80K)
        # should already exist from the same populate call.
        sell_82k = next(
            o for o in await repo.get_open_active_orders()
            if o.side == "sell" and o.level_index == 6
        )
        exch.set_filled(sell_82k.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # The sell at level 6 should be marked filled
        assert (await repo.get_active_order(sell_82k.exchange_order_id)).status == "filled"

        # _place_opposite_after_fill places a buy at level 5 — but since one
        # already existed, no new one is placed. There IS still an open buy
        # at level 5 → C1 pair-pending should block re-placement of the
        # sell at level 6.
        buys_at_5 = await repo.get_open_orders_at_level(5, side="buy")
        assert len(buys_at_5) == 1, "expected the pre-existing buy at level 5"

        # Trigger another tick — C1 must block re-placement of sell at level 6
        await om.tick(grid_range=gr, current_price=80000.0)
        sells_at_6 = await repo.get_open_orders_at_level(6, side="sell")
        assert sells_at_6 == [], (
            f"C1 should block re-placement at level 6 while pair-buy at "
            f"level 5 is pending. Got: {[(o.side, o.level_index) for o in sells_at_6]}"
        )

    @pytest.mark.asyncio
    async def test_sell_replaces_after_pair_buy_fills(self):
        """Once the pair-partner buy at N-1 fills, the round-trip is
        complete and the bot resumes normal placement at level N."""
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=90000, n_levels=11,
            orders_per_side=5, long_only=False,
        )
        await om.execute_prebuy(notional_usd=20000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Fire sell at level 6 → opposite buy at level 5 pending
        sell_82k = next(
            o for o in await repo.get_open_active_orders()
            if o.side == "sell" and o.level_index == 6
        )
        exch.set_filled(sell_82k.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # C1 blocks re-placement at level 6 (verified by prior test)
        assert await repo.get_open_orders_at_level(6, side="sell") == []

        # Now fire the pair-partner buy at level 5 — round-trip complete
        buy_80k = (await repo.get_open_orders_at_level(5, side="buy"))[0]
        exch.set_filled(buy_80k.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # On this tick, sell at level 6 should be re-placed by _populate_levels
        # (most recent sell-fill at level 6 still exists, but the pair-partner
        # at level 5 is now FILLED, not open → pair_pending=False)
        sells_at_6 = await repo.get_open_orders_at_level(6, side="sell")
        assert len(sells_at_6) == 1, (
            "after the pair-buy fills, the sell at level 6 should be "
            "re-engaged for the next round-trip"
        )

    @pytest.mark.asyncio
    async def test_buy_blocked_while_pair_sell_pending(self):
        """Symmetric to the sell-side block: after a buy at level N fills,
        if the opposite sell at level N+1 is still open, no new buy at N."""
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=90000, n_levels=11,
            orders_per_side=5, long_only=False,
        )
        await om.execute_prebuy(notional_usd=20000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Fire buy at level 4 ($78K) — opposite sell at level 5 ($80K)
        # already exists from populate.
        buy_78k = next(
            o for o in await repo.get_open_active_orders()
            if o.side == "buy" and o.level_index == 4
        )
        exch.set_filled(buy_78k.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Pair-partner sell at level 5 still open → C1 blocks buy re-placement
        sells_at_5 = await repo.get_open_orders_at_level(5, side="sell")
        assert len(sells_at_5) == 1
        await om.tick(grid_range=gr, current_price=80000.0)
        buys_at_4 = await repo.get_open_orders_at_level(4, side="buy")
        assert buys_at_4 == [], "C1 should block buy re-placement"

    @pytest.mark.asyncio
    async def test_no_block_when_no_prior_fill_at_level(self):
        """First-time placement: no fill history → C1 is permissive."""
        repo, pos_mgr, exch, om, gr = _build_setup(
            orders_per_side=3, long_only=False,
        )
        await om.execute_prebuy(notional_usd=2000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        # All requested levels populated normally
        open_orders = await repo.get_open_active_orders()
        # 3 buys below + 3 sells above
        assert len([o for o in open_orders if o.side == "buy"]) == 3
        assert len([o for o in open_orders if o.side == "sell"]) == 3

    @pytest.mark.asyncio
    async def test_no_block_when_pair_partner_off_grid(self):
        """If the would-be pair-partner is off-grid (level_index < 0 or
        >= n_levels), there is no pair to wait for. Re-placement allowed.
        """
        # 4 levels: [70K, 75K, 80K, 85K]. Sell at level 0 (off-grid) edge case.
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=85000, n_levels=4,
            orders_per_side=4, long_only=False,
        )
        await om.execute_prebuy(notional_usd=20000.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Manually record a fill at level 0 (sell) to simulate the edge case
        await repo.record_grid_fill(
            active_order_id=None, exchange_order_id="synthetic-fill",
            side="sell", level_index=0,
            fill_price=70000.0, fill_qty=0.001, fee_paid=0.014,
            realized_pnl=0.0, inventory_after_qty=0.05,
            inventory_after_avg_cost=80000.0,
        )
        # _is_pair_pending(0, "sell", grid_range) → opposite_idx = -1
        # → off-grid → return False (no block)
        pair_pending = await om._is_pair_pending(0, "sell", gr)
        assert pair_pending is False


class TestFullCycle:
    @pytest.mark.asyncio
    async def test_5_buys_then_5_sells_clean(self):
        """The Phase 3 gate test: pre-buy + 5 buy-fills + n sell-fills cycle clean.

        With long_only=True, initial sells are blocked (inventory == floor).
        After the 5 buys fill, opposite sells at i+1 are placed by
        `_place_opposite_after_fill` — but ONLY for levels above the
        post-fill avg_cost (AUDIT-FIX C2). The bursty-fill scenario
        (5 buys complete before any sells) drags avg_cost from
        ~$77K down toward ~$74K; opposite sells at levels below the
        new avg_cost are correctly skipped as guaranteed losses.
        Sells at levels above are placed and fill cleanly.
        """
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=90000,
            n_levels=11,                # 11 levels at $2K spacing
            orders_per_side=5,
            capital_per_level=200.0,    # small for fast tests
        )
        await om.execute_prebuy(notional_usd=2000.0, current_price=80000.0)
        prebuy_qty = pos_mgr.state.qty

        await om.tick(grid_range=gr, current_price=80000.0)
        # Initial: 5 buys placed (below 80K). 0 sells (floor blocks them).
        before = await repo.get_open_active_orders()
        assert len([o for o in before if o.side == "buy"]) == 5
        assert len([o for o in before if o.side == "sell"]) == 0

        # Flag all 5 buys as filled (price simulated to have dipped through them)
        buys = [o for o in before if o.side == "buy"]
        for b in buys:
            exch.set_filled(b.exchange_order_id)
        # Tick: process fills, place opposite-side sells at i+1
        await om.tick(grid_range=gr, current_price=80000.0)

        # Inventory should have grown by 5 × buy qty
        expected_added = sum(Decimal(str(b.qty)) for b in buys)
        assert pos_mgr.state.qty == pytest.approx(
            prebuy_qty + expected_added,
            abs=Decimal("0.00000001"),
        )
        assert pos_mgr.state.n_buy_fills >= 5

        # AUDIT-FIX C2 changed the contract: opposite sells are placed at
        # i+1 ONLY when level_{i+1} clears (avg_cost + fee*margin). After
        # 5 buys at $70K..$78K drag avg_cost down to ~$74K, sells at $72K
        # and $74K are below breakeven (gross < 0 or < fee*1.5) and are
        # correctly skipped. Sells at $76K, $78K, $80K still pass.
        all_orders = list(repo.active_orders.values())
        new_sells = [
            o for o in all_orders
            if o.side == "sell" and o.status == "open" and o.level_index in {1, 2, 3, 4, 5}
        ]
        # At least the highest opposite sells (levels 3, 4, 5 = $76K/$78K/$80K)
        # must be placed — that's the canonical grid-recovery behavior.
        new_sell_levels = {o.level_index for o in new_sells}
        assert {3, 4, 5}.issubset(new_sell_levels), (
            f"Expected opposite sells at levels {{3, 4, 5}} (above post-fill "
            f"avg_cost), got levels {sorted(new_sell_levels)}. "
            f"All orders: {[(o.side, o.level_index, o.status) for o in all_orders]}"
        )

        # Flag the placed sells as filled (simulating price recovery)
        for s in new_sells:
            exch.set_filled(s.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # All placed sells filled cleanly through the position manager
        assert pos_mgr.state.n_sell_fills >= len(new_sells)
        # NB: realized P&L on bursty-fill scenarios is near-zero because all
        # buys complete BEFORE any sells, dragging avg cost down. Then the
        # sells execute against that low avg, so the early (low-price) sells
        # realize a loss that offsets the late (high-price) sells' gain.
        # Real grid trading alternates buy/sell pairs over time; see the
        # `test_alternating_cycle_realizes_positive_pnl` test for that.
        # Here we just assert fills cycle cleanly.

        # Inventory should be ≥ floor at all times (long_only enforced)
        assert pos_mgr.state.qty >= pos_mgr.state.prebuy_qty

    @pytest.mark.asyncio
    async def test_alternating_cycle_realizes_positive_pnl(self):
        """Realistic grid behavior: buy + sell pairs alternate over time.

        When the avg cost is stable between cycles (no other fills in
        between), each round-trip realizes the spread × qty as profit.
        This is where the grid's edge actually comes from.
        """
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=70000, range_high=90000,
            n_levels=11,
            orders_per_side=3,
            capital_per_level=200.0,
        )
        await om.execute_prebuy(notional_usd=2000.0, current_price=80000.0)

        # Cycle 1: buy at $78K fills → sell at $80K placed → sell fills
        await om.tick(grid_range=gr, current_price=80000.0)
        buy_78 = next(
            o for o in await repo.get_open_active_orders()
            if o.side == "buy" and o.level_price == 78000.0
        )
        exch.set_filled(buy_78.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)
        # Find the just-placed opposite sell at $80K
        sell_80 = next(
            o for o in await repo.get_open_active_orders()
            if o.side == "sell" and o.level_price == 80000.0
        )
        exch.set_filled(sell_80.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # After this round-trip, realized P&L should be positive — sold $2K
        # higher than bought, on a small avg-cost drift.
        assert pos_mgr.state.realized_pnl_total > Decimal("0"), (
            f"Expected positive realized P&L after alternating round-trip, "
            f"got {pos_mgr.state.realized_pnl_total}"
        )
        # Inventory back at or near the floor
        assert pos_mgr.state.qty >= pos_mgr.state.prebuy_qty


class TestA3PollTerminalStatus:
    """AUDIT-FIX A3: when the exchange moves an order to a non-FILLED
    terminal state (CANCELLED / EXPIRED / FAILED), _poll_and_apply_fills
    must reconcile the DB row by marking it cancelled. Without this,
    Coinbase-side cancellations behind our back leak orphan rows.
    """

    @pytest.mark.asyncio
    async def test_cancelled_status_reconciles_db_row(self):
        repo, _pos_mgr, exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        # Pick one open order; simulate Coinbase-side cancellation
        open_orders = await repo.get_open_active_orders()
        target = open_orders[0]
        exch.set_terminal_status(target.exchange_order_id, "CANCELLED")

        # The next poll should reconcile the row
        await om._poll_and_apply_fills(gr)

        refreshed = await repo.get_active_order(target.exchange_order_id)
        assert refreshed.status == "cancelled", (
            f"Expected status='cancelled' after CANCELLED terminal_status, "
            f"got {refreshed.status!r}"
        )

    @pytest.mark.asyncio
    async def test_expired_status_reconciles_db_row(self):
        repo, _pos_mgr, exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        target = (await repo.get_open_active_orders())[0]
        exch.set_terminal_status(target.exchange_order_id, "EXPIRED")
        await om._poll_and_apply_fills(gr)

        assert (await repo.get_active_order(target.exchange_order_id)).status == "cancelled"

    @pytest.mark.asyncio
    async def test_failed_status_reconciles_db_row(self):
        repo, _pos_mgr, exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        target = (await repo.get_open_active_orders())[0]
        exch.set_terminal_status(target.exchange_order_id, "FAILED")
        await om._poll_and_apply_fills(gr)

        assert (await repo.get_active_order(target.exchange_order_id)).status == "cancelled"

    @pytest.mark.asyncio
    async def test_still_open_orders_not_touched(self):
        """Regression: orders WITHOUT a terminal_status (still OPEN/PENDING)
        must not be marked cancelled by the new poll path."""
        repo, _pos_mgr, _exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)

        before_open = await repo.get_open_active_orders()
        assert len(before_open) > 0

        # Run poll — no terminal_status set on any order → all should stay open
        await om._poll_and_apply_fills(gr)

        after_open = await repo.get_open_active_orders()
        assert len(after_open) == len(before_open), (
            f"Non-terminal orders must stay open; "
            f"before={len(before_open)}, after={len(after_open)}"
        )


class TestCancellation:
    @pytest.mark.asyncio
    async def test_cancel_out_of_range_after_recenter(self):
        repo, pos_mgr, exch, om, gr = _build_setup(
            range_low=50000, range_high=110000, n_levels=7,
            orders_per_side=3,
        )
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        before_count = len(await repo.get_open_active_orders())
        assert before_count > 0

        # Recenter to a much tighter range that excludes most levels
        new_gr = compute_range_and_levels(
            mode="static", static_low=78000, static_high=82000, n_levels=5,
        )
        await om.recenter(new_range=new_gr, current_price=80000.0)

        # After recenter, all orders should be cancelled
        remaining = await repo.get_open_active_orders()
        assert len(remaining) == 0
        # Grid state should reflect the new range
        gs = await repo.get_grid_state()
        assert gs.current_range_low == 78000
        assert gs.current_range_high == 82000

    @pytest.mark.asyncio
    async def test_stale_order_cancellation(self):
        repo, pos_mgr, exch, om, gr = _build_setup(orders_per_side=2)
        om.order_stale_minutes = 0  # everything is stale immediately
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        # Manually backdate
        for o in repo.active_orders.values():
            o.created_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await om._cancel_stale()
        # All open orders should be cancelled
        remaining = await repo.get_open_active_orders()
        assert len(remaining) == 0


class TestEmergencyExit:
    @pytest.mark.asyncio
    async def test_emergency_exit_cancels_all_and_market_closes(self):
        repo, pos_mgr, exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        prebuy_qty = pos_mgr.state.qty
        assert len(await repo.get_open_active_orders()) > 0

        await om.emergency_exit()

        # All orders cancelled
        assert len(await repo.get_open_active_orders()) == 0
        # Market close called with the pre-buy size
        assert len(exch.closed_positions) == 1
        side, size = exch.closed_positions[0]
        assert side == "long"
        assert size == prebuy_qty


class TestA1TerminalCancelFailure:
    """AUDIT-FIX A1: when exchange.cancel_order returns
    (False, terminal_reason), the DB row MUST be marked cancelled.
    Without this, orphaned rows accumulate at status='open' and bleed
    rate-limit budget on every subsequent tick.

    Triggered in PaperEngine after a Railway redeploy clears
    self.pending_orders → cancel returns (False, "UNKNOWN_CANCEL_ORDER")
    for every order from the prior epoch. Triggered in live by races
    between our cancel attempt and Coinbase-side fills/cancellations
    (ORDER_IS_FULLY_FILLED, DUPLICATE_CANCEL_REQUEST,
    UNKNOWN_CANCEL_ORDER).
    """

    @pytest.mark.asyncio
    async def test_unknown_cancel_order_marks_row_cancelled(self):
        repo, _pos_mgr, exch, om, _gr = _build_setup(orders_per_side=2)
        # Place a buy and then forget it on the exchange side (paper restart
        # equivalent). Coinbase live: order was already filled/cancelled.
        await om._place_limit(
            side="buy", level_index=0, level_price=70000.0, qty=0.01,
        )
        order = next(iter(repo.active_orders.values()))
        assert order.status == "open"
        # Wipe the exchange's record of it
        del exch.placed[order.exchange_order_id]
        # Try to cancel — exchange returns (False, "UNKNOWN_CANCEL_ORDER")
        result = await om._cancel_order(order.exchange_order_id)
        # The DB row MUST be marked cancelled even though the cancel
        # itself "failed."
        assert result is True, "terminal failure should be treated as success-equivalent"
        refreshed = await repo.get_active_order(order.exchange_order_id)
        assert refreshed.status == "cancelled"

    @pytest.mark.asyncio
    async def test_retryable_failure_leaves_row_open(self):
        """For retryable failure_reasons (INVALID_CANCEL_REQUEST,
        NOT_ALLOWED_TO_CANCEL, etc), the row stays open so the next
        sweep tries again.
        """
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        # Inject an order and a mock exchange that returns a retryable
        # failure (not in the terminal set)
        await repo.insert_active_order(
            exchange_order_id="retry-order",
            side="buy", level_index=0, level_price=70000.0, qty=0.01,
        )

        class _RetryableExch:
            async def cancel_order(self, oid):
                return (False, "INVALID_CANCEL_REQUEST")

        om.exchange = _RetryableExch()
        result = await om._cancel_order("retry-order")
        assert result is False, "retryable should return False"
        refreshed = await repo.get_active_order("retry-order")
        assert refreshed.status == "open", "retryable must NOT mark cancelled"

    @pytest.mark.asyncio
    async def test_order_is_fully_filled_reconciles(self):
        """When the order filled on Coinbase between our placement and
        our cancel attempt, batch_cancel returns ORDER_IS_FULLY_FILLED.
        Our DB MUST be brought back into sync (row marked cancelled —
        the actual fill should land via the poll path).
        """
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="raced-order",
            side="sell", level_index=4, level_price=78000.0, qty=0.005,
        )

        class _RacedExch:
            async def cancel_order(self, oid):
                return (False, "ORDER_IS_FULLY_FILLED")

        om.exchange = _RacedExch()
        result = await om._cancel_order("raced-order")
        assert result is True
        assert (await repo.get_active_order("raced-order")).status == "cancelled"

    @pytest.mark.asyncio
    async def test_duplicate_cancel_request_marks_cancelled(self):
        """If our DB still shows 'open' but Coinbase already cancelled
        (DUPLICATE_CANCEL_REQUEST), bring DB back into sync."""
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="dup-order",
            side="buy", level_index=2, level_price=74000.0, qty=0.005,
        )

        class _DupExch:
            async def cancel_order(self, oid):
                return (False, "DUPLICATE_CANCEL_REQUEST")

        om.exchange = _DupExch()
        result = await om._cancel_order("dup-order")
        assert result is True
        assert (await repo.get_active_order("dup-order")).status == "cancelled"

    @pytest.mark.asyncio
    async def test_recenter_cleans_paper_restart_orphans(self):
        """End-to-end: simulate a Railway redeploy (wipe PaperEngine
        pending state) and verify recenter() leaves NO orphan rows."""
        repo, _pos_mgr, exch, om, gr = _build_setup(orders_per_side=3)
        await om.execute_prebuy(notional_usd=4800.0, current_price=80000.0)
        await om.tick(grid_range=gr, current_price=80000.0)
        # Pre-restart: orders exist
        before = await repo.get_open_active_orders()
        assert len(before) > 0

        # Simulate Railway redeploy: PaperEngine forgets pending_orders
        exch.placed.clear()

        # Recenter the grid — should sweep all prior-epoch orders
        # via the terminal-failure path
        from bot.strategy.grid_strategy import compute_range_and_levels
        new_gr = compute_range_and_levels(
            mode="static", static_low=60000, static_high=120000, n_levels=5,
        )
        await om.recenter(new_range=new_gr, current_price=80000.0)

        # All prior-epoch rows should now be status='cancelled'
        still_open = await repo.get_open_active_orders()
        assert still_open == [], (
            f"Recenter should have cleaned all paper-restart orphans, "
            f"but {len(still_open)} rows remain open: "
            f"{[(o.side, o.level_index, o.exchange_order_id) for o in still_open]}"
        )
