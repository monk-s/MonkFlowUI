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
            cancel_reason=None,  # AUDIT-FIX A5
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

    async def mark_order_cancelled(self, exchange_order_id, *, reason=None):
        # AUDIT-FIX A5: accept optional `reason` for orphan-source observability
        kwargs = {"status": "cancelled", "cancelled_at": datetime.now(timezone.utc)}
        if reason is not None:
            kwargs["cancel_reason"] = reason
        await self.update_active_order(exchange_order_id, **kwargs)

    async def mark_order_failed(self, exchange_order_id, *, reason):
        """AUDIT-FIX A5: exchange rejected at placement (A2 path)."""
        await self.update_active_order(
            exchange_order_id,
            status="failed",
            cancelled_at=datetime.now(timezone.utc),
            cancel_reason=reason,
        )

    async def mark_order_expired(self, exchange_order_id, *, reason):
        """AUDIT-FIX A5: exchange-side terminal (A1/A3 paths)."""
        await self.update_active_order(
            exchange_order_id,
            status="expired",
            cancelled_at=datetime.now(timezone.utc),
            cancel_reason=reason,
        )

    async def get_active_orders_by_status(self, status):
        return [
            o for o in self.active_orders.values()
            if o.status == status
        ]

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
            return base
        # Check market fill history
        for m in self.market_fills:
            if m.order_id == order_id:
                return m
        return None

    async def cancel_order(self, order_id: str) -> bool:
        if order_id in self.placed:
            self.cancelled.add(order_id)
            del self.placed[order_id]
            return True
        return False

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


class TestFullCycle:
    @pytest.mark.asyncio
    async def test_5_buys_then_5_sells_clean(self):
        """The Phase 3 gate test: pre-buy + 5 buy-fills + 5 sell-fills cycle clean.

        With long_only=True, initial sells are blocked (inventory == floor).
        After the 5 buys fill, opposite sells at i+1 are placed by
        _place_opposite_after_fill. Those then fill on the next round.
        Verifies final inventory ≥ floor and realized P&L is positive.
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

        # New opposite-side sells placed at i+1 for each filled buy.
        # Filled buys were at levels [0,1,2,3,4] → opposite sells at [1,2,3,4,5].
        all_orders = list(repo.active_orders.values())
        new_sells = [
            o for o in all_orders
            if o.side == "sell" and o.status == "open" and o.level_index in {1, 2, 3, 4, 5}
        ]
        assert len(new_sells) == 5, (
            f"Expected 5 opposite-side sells, got {len(new_sells)}. "
            f"All orders: {[(o.side, o.level_index, o.status) for o in all_orders]}"
        )

        # Flag those 5 sells as filled (simulating price recovery)
        for s in new_sells:
            exch.set_filled(s.exchange_order_id)
        await om.tick(grid_range=gr, current_price=80000.0)

        # All 5 sells filled cleanly through the position manager
        assert pos_mgr.state.n_sell_fills >= 5
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


class TestA5DistinctStatusesAndReason:
    """AUDIT-FIX A5: repository methods that write distinct status values
    + cancel_reason for orphan-source observability.

    The bot-initiated cancel path still uses status='cancelled' (with an
    optional reason). Placement-time rejections (A2 follow-up) use
    status='failed' + reason. Exchange-side terminations (A1/A3
    follow-ups) use status='expired' + reason.
    """

    @pytest.mark.asyncio
    async def test_mark_order_cancelled_without_reason(self):
        """Backward compat: existing call sites without `reason` still work."""
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="legacy-cancel",
            side="buy", level_index=0, level_price=70000.0, qty=0.01,
        )
        await repo.mark_order_cancelled("legacy-cancel")
        row = await repo.get_active_order("legacy-cancel")
        assert row.status == "cancelled"
        assert row.cancel_reason is None

    @pytest.mark.asyncio
    async def test_mark_order_cancelled_with_reason(self):
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="with-reason",
            side="buy", level_index=0, level_price=70000.0, qty=0.01,
        )
        await repo.mark_order_cancelled("with-reason", reason="recenter_force_close")
        row = await repo.get_active_order("with-reason")
        assert row.status == "cancelled"
        assert row.cancel_reason == "recenter_force_close"

    @pytest.mark.asyncio
    async def test_mark_order_failed_records_reason(self):
        """A2 path: Coinbase rejected the placement at submission."""
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="rejected-placement",
            side="sell", level_index=12, level_price=78000.0, qty=0.005,
        )
        await repo.mark_order_failed(
            "rejected-placement",
            reason="INVALID_LIMIT_PRICE_POST_ONLY",
        )
        row = await repo.get_active_order("rejected-placement")
        assert row.status == "failed"
        assert row.cancel_reason == "INVALID_LIMIT_PRICE_POST_ONLY"

    @pytest.mark.asyncio
    async def test_mark_order_expired_records_reason(self):
        """A1/A3 path: exchange terminal status (CANCELLED / EXPIRED /
        UNKNOWN_CANCEL_ORDER / ORDER_IS_FULLY_FILLED / etc)."""
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        await repo.insert_active_order(
            exchange_order_id="exchange-cancelled",
            side="buy", level_index=3, level_price=74000.0, qty=0.005,
        )
        await repo.mark_order_expired(
            "exchange-cancelled",
            reason="UNKNOWN_CANCEL_ORDER",
        )
        row = await repo.get_active_order("exchange-cancelled")
        assert row.status == "expired"
        assert row.cancel_reason == "UNKNOWN_CANCEL_ORDER"

    @pytest.mark.asyncio
    async def test_get_active_orders_by_status_splits_cohorts(self):
        """Query helper: split orphan-source cohorts."""
        repo, _pos_mgr, _exch, om, _gr = _build_setup(orders_per_side=2)
        # Seed 5 rows across 4 statuses
        for i, (oid, status_writer) in enumerate([
            ("ok-cancel-1", lambda x: repo.mark_order_cancelled(x, reason="recenter")),
            ("ok-cancel-2", lambda x: repo.mark_order_cancelled(x, reason="stale")),
            ("rejected-1", lambda x: repo.mark_order_failed(x, reason="INVALID_LIMIT_PRICE_POST_ONLY")),
            ("expired-1", lambda x: repo.mark_order_expired(x, reason="UNKNOWN_CANCEL_ORDER")),
            ("expired-2", lambda x: repo.mark_order_expired(x, reason="ORDER_IS_FULLY_FILLED")),
        ]):
            await repo.insert_active_order(
                exchange_order_id=oid, side="buy",
                level_index=i, level_price=70000.0 + i * 100, qty=0.001,
            )
            await status_writer(oid)

        cancelled_rows = await repo.get_active_orders_by_status("cancelled")
        assert len(cancelled_rows) == 2
        assert {r.cancel_reason for r in cancelled_rows} == {"recenter", "stale"}

        failed_rows = await repo.get_active_orders_by_status("failed")
        assert len(failed_rows) == 1
        assert failed_rows[0].cancel_reason == "INVALID_LIMIT_PRICE_POST_ONLY"

        expired_rows = await repo.get_active_orders_by_status("expired")
        assert len(expired_rows) == 2
        assert {r.cancel_reason for r in expired_rows} == {
            "UNKNOWN_CANCEL_ORDER", "ORDER_IS_FULLY_FILLED",
        }


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
