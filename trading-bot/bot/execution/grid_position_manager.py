"""
v3 grid position manager: tracks inventory + avg cost basis + realized P&L.

Pure in-memory bookkeeping; persistence goes through the repository.
Every fill (buy or sell) is processed by `apply_fill()`, which:
  - Updates qty and weighted-avg cost basis
  - Computes realized P&L (for sells) from current avg cost
  - Records the fill snapshot to tb3_grid_fills
  - Updates tb3_grid_state with new inventory

Designed to be safe to re-instantiate from DB on bot restart — the
authoritative state always lives in tb3_grid_state + tb3_grid_fills.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional


def _to_decimal(x) -> Decimal:
    """Coerce numerics to Decimal for safe money math."""
    if isinstance(x, Decimal):
        return x
    return Decimal(str(x))


@dataclass
class FillResult:
    """Outcome of applying a fill. Surfaces realized P&L + post-state."""
    side: str
    qty: Decimal
    price: Decimal
    fee: Decimal
    realized_pnl: Decimal           # 0 for buys, computed for sells
    new_inventory_qty: Decimal
    new_inventory_avg_cost: Decimal
    rejected: bool = False           # True if long_only blocked the sell
    reject_reason: Optional[str] = None


@dataclass
class GridInventoryState:
    """In-memory mirror of tb3_grid_state's inventory fields.

    Persistence layer should `load_from_db()` on boot and `flush_to_db()`
    after each fill.
    """
    qty: Decimal = field(default_factory=lambda: Decimal("0"))
    avg_cost: Decimal = field(default_factory=lambda: Decimal("0"))
    realized_pnl_total: Decimal = field(default_factory=lambda: Decimal("0"))
    fees_paid_total: Decimal = field(default_factory=lambda: Decimal("0"))
    n_buy_fills: int = 0
    n_sell_fills: int = 0
    # The inventory floor — sells below this qty are rejected when long_only=True.
    # Set once on pre-buy and never modified.
    prebuy_qty: Decimal = field(default_factory=lambda: Decimal("0"))


class GridPositionManager:
    """Tracks inventory + cost basis. All math is in Decimal."""

    def __init__(
        self,
        *,
        repository,             # bot.persistence.repository.Repository
        long_only: bool = True,
        floor_fraction: Decimal | float | str = Decimal("0.5"),
    ) -> None:
        """
        floor_fraction: floor for the long-only check, expressed as a
        fraction of `prebuy_qty`. A value of 1.0 (legacy default) means
        the grid cannot sell unless inventory exceeds the entire prebuy,
        which blocks bidirectional chop trading. 0.5 (current default)
        keeps the lean-long bias while giving the grid headroom to
        pre-place all its sell orders.
        """
        self.repo = repository
        self.long_only = long_only
        self.floor_fraction = _to_decimal(floor_fraction)
        if self.floor_fraction < 0 or self.floor_fraction > 1:
            raise ValueError(
                f"floor_fraction must be in [0, 1], got {self.floor_fraction}"
            )
        self.state = GridInventoryState()

    # ----- public API -----

    async def load_from_db(self) -> None:
        """Restore in-memory state from tb3_grid_state on boot."""
        gs = await self.repo.get_grid_state()
        if gs is None:
            return
        self.state.qty = _to_decimal(gs.inventory_qty or 0)
        self.state.avg_cost = _to_decimal(gs.inventory_avg_cost or 0)
        self.state.realized_pnl_total = _to_decimal(gs.realized_pnl_total or 0)
        self.state.fees_paid_total = _to_decimal(gs.fees_paid_total or 0)
        self.state.n_buy_fills = int(gs.n_buy_fills or 0)
        self.state.n_sell_fills = int(gs.n_sell_fills or 0)
        self.state.prebuy_qty = _to_decimal(gs.prebuy_qty or 0)

    async def record_prebuy(
        self,
        *,
        qty: Decimal,
        avg_price: Decimal,
        fee: Decimal,
    ) -> None:
        """Record the initial pre-buy as the inventory floor."""
        self.state.prebuy_qty = _to_decimal(qty)
        self.state.qty = _to_decimal(qty)
        self.state.avg_cost = _to_decimal(avg_price)
        self.state.fees_paid_total = _to_decimal(fee)
        await self.repo.update_grid_state(
            prebuy_qty=float(qty),
            prebuy_avg_price=float(avg_price),
            prebuy_at=datetime.now(timezone.utc),
            inventory_qty=float(qty),
            inventory_avg_cost=float(avg_price),
            fees_paid_total=float(fee),
        )

    @property
    def inventory_floor(self) -> Decimal:
        """The effective inventory floor (prebuy_qty * floor_fraction).

        Sells that would push remaining inventory below this value are
        rejected when `long_only=True`. With the default floor_fraction
        of 0.5 and a 70% prebuy, the floor is 35% of starting equity
        (still long-biased), and the grid has up to 35%-of-equity worth
        of inventory to sell into chop before the floor blocks further
        sells.
        """
        return self.state.prebuy_qty * self.floor_fraction

    def can_sell(self, qty: Decimal) -> tuple[bool, Optional[str]]:
        """Check if a sell of `qty` is allowed (long-only floor check).

        Returns (allowed, reason_if_not).
        """
        if self.long_only:
            qty = _to_decimal(qty)
            remaining = self.state.qty - qty
            floor = self.inventory_floor
            if remaining < floor:
                return False, (
                    f"long_only floor: sell {qty} would reduce inventory "
                    f"({self.state.qty}) below floor ({floor}; "
                    f"{self.floor_fraction} × prebuy {self.state.prebuy_qty})"
                )
        return True, None

    async def apply_fill(
        self,
        *,
        side: str,                      # 'buy' or 'sell'
        qty,                            # any numeric → Decimal
        price,
        fee,
        active_order_id: Optional[int] = None,
        exchange_order_id: str = "",
        level_index: int = -1,
        force: bool = False,
    ) -> FillResult:
        """Process a fill: update inventory, compute realized P&L if sell,
        persist to tb3_grid_fills and tb3_grid_state.

        force=True bypasses the long_only floor check. Used by grid_order_manager
        when the exchange has FILLED a sell and we MUST record it even if it
        violates the floor (alternative is DB-vs-exchange divergence which is
        worse). Floor violation is logged loudly for manual reconciliation.

        Returns a FillResult describing the post-state.
        """
        qty = _to_decimal(qty)
        price = _to_decimal(price)
        fee = _to_decimal(fee)

        if side == "buy":
            return await self._apply_buy(
                qty=qty, price=price, fee=fee,
                active_order_id=active_order_id,
                exchange_order_id=exchange_order_id,
                level_index=level_index,
            )
        elif side == "sell":
            return await self._apply_sell(
                qty=qty, price=price, fee=fee,
                active_order_id=active_order_id,
                exchange_order_id=exchange_order_id,
                level_index=level_index,
                force=force,
            )
        else:
            raise ValueError(f"side must be 'buy' or 'sell', got {side!r}")

    # ----- internal -----

    async def _apply_buy(
        self,
        *,
        qty: Decimal,
        price: Decimal,
        fee: Decimal,
        active_order_id: Optional[int],
        exchange_order_id: str,
        level_index: int,
    ) -> FillResult:
        # Weighted-avg cost update
        prev_qty = self.state.qty
        prev_avg = self.state.avg_cost
        new_qty = prev_qty + qty
        if new_qty > 0:
            # Cost basis includes fees so realized P&L tracks net of friction
            new_cost_basis = (prev_qty * prev_avg) + (qty * price) + fee
            new_avg = new_cost_basis / new_qty
        else:
            new_avg = Decimal("0")
        self.state.qty = new_qty
        self.state.avg_cost = new_avg
        self.state.fees_paid_total += fee
        self.state.n_buy_fills += 1

        await self._persist_fill(
            side="buy", qty=qty, price=price, fee=fee,
            realized_pnl=Decimal("0"),
            active_order_id=active_order_id,
            exchange_order_id=exchange_order_id,
            level_index=level_index,
        )
        return FillResult(
            side="buy",
            qty=qty,
            price=price,
            fee=fee,
            realized_pnl=Decimal("0"),
            new_inventory_qty=new_qty,
            new_inventory_avg_cost=new_avg,
        )

    async def _apply_sell(
        self,
        *,
        qty: Decimal,
        price: Decimal,
        fee: Decimal,
        active_order_id: Optional[int],
        exchange_order_id: str,
        level_index: int,
        force: bool = False,
    ) -> FillResult:
        # Floor check
        allowed, reason = self.can_sell(qty)
        if not allowed and not force:
            return FillResult(
                side="sell",
                qty=qty, price=price, fee=fee,
                realized_pnl=Decimal("0"),
                new_inventory_qty=self.state.qty,
                new_inventory_avg_cost=self.state.avg_cost,
                rejected=True,
                reject_reason=reason,
            )
        # AUDIT-FIX A: When force=True (exchange has already filled), we
        # accept the fill even if it violates the floor — DB MUST mirror
        # exchange state. Log loudly so the user knows manual review is
        # warranted.
        if not allowed and force:
            # Late-import to avoid circular dep (only used in this branch)
            import logging
            logging.getLogger("grid_position_manager").warning(
                "long_only_floor_VIOLATED_by_forced_fill",
                extra={
                    "qty": float(qty), "price": float(price),
                    "inventory_before": float(self.state.qty),
                    "floor": float(self.state.prebuy_qty),
                    "reason": reason,
                    "note": "exchange filled the sell; recording to keep DB in sync. Manual review recommended.",
                }
            )

        # Realized P&L = (sell_price - avg_cost) × qty − exit_fee
        avg_cost = self.state.avg_cost
        realized = (price - avg_cost) * qty - fee
        new_qty = self.state.qty - qty
        # Avg cost stays the same on partial exits (FIFO/weighted convention)
        # If we go to zero, reset avg to 0 for cleanliness.
        new_avg = avg_cost if new_qty > 0 else Decimal("0")

        self.state.qty = new_qty
        self.state.avg_cost = new_avg
        self.state.realized_pnl_total += realized
        self.state.fees_paid_total += fee
        self.state.n_sell_fills += 1

        await self._persist_fill(
            side="sell", qty=qty, price=price, fee=fee,
            realized_pnl=realized,
            active_order_id=active_order_id,
            exchange_order_id=exchange_order_id,
            level_index=level_index,
        )
        return FillResult(
            side="sell",
            qty=qty,
            price=price,
            fee=fee,
            realized_pnl=realized,
            new_inventory_qty=new_qty,
            new_inventory_avg_cost=new_avg,
        )

    async def _persist_fill(
        self,
        *,
        side: str,
        qty: Decimal,
        price: Decimal,
        fee: Decimal,
        realized_pnl: Decimal,
        active_order_id: Optional[int],
        exchange_order_id: str,
        level_index: int,
    ) -> None:
        """Write the fill to tb3_grid_fills AND refresh tb3_grid_state."""
        await self.repo.record_grid_fill(
            active_order_id=active_order_id,
            exchange_order_id=exchange_order_id,
            side=side,
            level_index=level_index,
            fill_price=float(price),
            fill_qty=float(qty),
            fee_paid=float(fee),
            realized_pnl=float(realized_pnl),
            inventory_after_qty=float(self.state.qty),
            inventory_after_avg_cost=float(self.state.avg_cost),
        )
        await self.repo.update_grid_state(
            inventory_qty=float(self.state.qty),
            inventory_avg_cost=float(self.state.avg_cost),
            realized_pnl_total=float(self.state.realized_pnl_total),
            fees_paid_total=float(self.state.fees_paid_total),
            n_buy_fills=self.state.n_buy_fills,
            n_sell_fills=self.state.n_sell_fills,
        )
