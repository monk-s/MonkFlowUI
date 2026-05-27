"""
v3 grid order manager: maintains the live grid of maker-only limit orders.

Responsibilities:
  1. Place pre-buy MARKET order once on first deploy (records prebuy_qty)
  2. On each grid tick (30s):
     - Poll all open orders; for each FILLED order:
       * Apply via grid_position_manager.apply_fill()
       * Place an opposite-side limit at the adjacent level
     - Cancel orders that fell outside the active range (post-recenter)
     - Cancel stale orders (older than GRID_ORDER_STALE_MINUTES)
     - Ensure N levels around current price have open orders
  3. recenter(): cancel ALL active orders + rebuild
  4. emergency_exit(): cancel + market-close the position

Order conventions:
  - All grid orders are LIMIT with post_only=True (maker fees only)
  - Quantity per level = capital_per_level / level_price (in BTC contracts)
  - Buy level fills → place a sell at the NEXT level up (i+1)
  - Sell level fills → place a buy at the NEXT level down (i-1)
  - Inventory floor enforced by GridPositionManager (rejects shorting sells)
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_DOWN

# Coinbase BTC-PERP-INTX base_increment is 0.0001 BTC. Sizing finer than
# this gets rejected at order placement. We always quantize down (truncate)
# so we never round UP into a more-expensive position than risk-sized for.
_BTC_QTY_QUANTUM = Decimal("0.0001")


def _quantize_btc(qty: Decimal) -> Decimal:
    """Round a BTC quantity DOWN to Coinbase's 0.0001 BTC increment."""
    return qty.quantize(_BTC_QTY_QUANTUM, rounding=ROUND_DOWN)
from typing import Optional

from bot.exchange.base import ExchangeInterface, OrderResult, OrderSide, OrderType
from bot.strategy.grid_strategy import GridRange
from config.logging_config import get_logger

logger = get_logger("grid_order_manager")


@dataclass
class PlaceOrderResult:
    """Outcome of placing a single grid limit order."""
    success: bool
    exchange_order_id: Optional[str]
    side: str
    level_index: int
    level_price: float
    qty: float
    error: Optional[str] = None


@dataclass
class PrebuyResult:
    """Outcome of the one-time pre-buy on first deploy."""
    success: bool
    exchange_order_id: Optional[str]
    filled_qty: Decimal
    avg_fill_price: Decimal
    fee_paid: Decimal
    error: Optional[str] = None


class GridOrderManager:
    """Manages the live grid: placement, polling, replacement on fill."""

    def __init__(
        self,
        *,
        exchange: ExchangeInterface,
        repository,                     # bot.persistence.repository.Repository
        position_manager,               # GridPositionManager
        symbol: str,
        capital_per_level: float,
        leverage: float = 1.0,
        maker_only: bool = True,
        taker_fallback: bool = False,
        orders_per_side: int = 5,
        order_stale_minutes: int = 1440,
        maker_fee_pct: float = 0.02,
    ) -> None:
        self.exchange = exchange
        self.repo = repository
        self.position_manager = position_manager
        self.symbol = symbol
        self.capital_per_level = Decimal(str(capital_per_level))
        self.leverage = Decimal(str(leverage))
        self.maker_only = maker_only
        self.taker_fallback = taker_fallback
        self.orders_per_side = orders_per_side
        self.order_stale_minutes = order_stale_minutes
        self.maker_fee_pct = Decimal(str(maker_fee_pct))

    # ─────────────────────────────────────────────────────────────────
    # Pre-buy (one-time on first deploy)
    # ─────────────────────────────────────────────────────────────────

    async def execute_prebuy(
        self,
        *,
        notional_usd: float,
        current_price: float,
    ) -> PrebuyResult:
        """Open the initial LONG position with a MARKET order.

        Sized so that notional_usd / current_price = qty BTC contracts.
        On success, records prebuy_qty in tb3_grid_state via the
        position_manager.record_prebuy() call.
        """
        notional = Decimal(str(notional_usd))
        price = Decimal(str(current_price))
        if notional <= 0 or price <= 0:
            return PrebuyResult(
                success=False,
                exchange_order_id=None,
                filled_qty=Decimal("0"),
                avg_fill_price=Decimal("0"),
                fee_paid=Decimal("0"),
                error=f"invalid sizing: notional={notional}, price={price}",
            )
        qty = _quantize_btc(notional / price)
        if qty <= 0:
            return PrebuyResult(
                success=False,
                exchange_order_id=None,
                filled_qty=Decimal("0"),
                avg_fill_price=Decimal("0"),
                fee_paid=Decimal("0"),
                error=f"prebuy notional ${float(notional):.2f} too small at price ${float(price):.2f} — quantizes to 0",
            )
        logger.info(
            "executing_prebuy",
            symbol=self.symbol,
            notional_usd=float(notional),
            qty=float(qty),
            current_price=float(price),
        )

        # Mark pending BEFORE placing the market order so a crash during the
        # exchange round-trip leaves a recoverable state.
        await self.repo.update_grid_state(prebuy_status="pending")

        try:
            result = await self.exchange.place_order(
                side=OrderSide.BUY,
                size=qty,
                order_type=OrderType.MARKET,
                leverage=self.leverage,
                reduce_only=False,
            )
        except Exception as e:
            logger.critical("prebuy_market_order_failed", error=str(e))
            await self.repo.update_grid_state(prebuy_status="failed")
            return PrebuyResult(
                success=False,
                exchange_order_id=None,
                filled_qty=Decimal("0"),
                avg_fill_price=Decimal("0"),
                fee_paid=Decimal("0"),
                error=f"exchange error: {e}",
            )

        if not result.filled:
            await self.repo.update_grid_state(prebuy_status="failed")
            return PrebuyResult(
                success=False,
                exchange_order_id=result.order_id,
                filled_qty=Decimal("0"),
                avg_fill_price=Decimal("0"),
                fee_paid=Decimal("0"),
                error=f"order not filled (status from exchange: not FILLED)",
            )

        # Detect partial fill — `result.size` is what we asked for, but the
        # exchange may have only filled some of it. PaperEngine + CoinbaseClient
        # both populate `result.size` with the *requested* size, and the
        # auto-close path in coinbase_client.py already handles a PARTIALLY_FILLED
        # market order by closing the partial — so by the time we get here on
        # live, the position should match `result.size` or be zero (handled
        # above as not filled). Defensive check anyway:
        filled_qty = result.size if result.size else qty
        is_partial = filled_qty < qty

        avg_fill_price = result.price if result.price else price
        fee = result.fee if result.fee else Decimal("0")
        await self.position_manager.record_prebuy(
            qty=filled_qty, avg_price=avg_fill_price, fee=fee,
        )
        new_status = "partial" if is_partial else "complete"
        await self.repo.update_grid_state(prebuy_status=new_status)
        logger.info(
            "prebuy_complete" if not is_partial else "prebuy_partial",
            order_id=result.order_id,
            qty=float(filled_qty),
            intended_qty=float(qty),
            avg_price=float(avg_fill_price),
            fee=float(fee),
            status=new_status,
        )
        return PrebuyResult(
            success=True,
            exchange_order_id=result.order_id,
            filled_qty=filled_qty,
            avg_fill_price=avg_fill_price,
            fee_paid=fee,
        )

    # ─────────────────────────────────────────────────────────────────
    # Main maintenance loop (called by grid_tick every 30s)
    # ─────────────────────────────────────────────────────────────────

    async def tick(self, *, grid_range: GridRange, current_price: float) -> None:
        """Run one grid tick. Idempotent — safe to call repeatedly.

        Substeps:
          1. Poll all OPEN orders; on fill → apply + place opposite-side
          2. Cancel orders at level prices outside grid_range (post-recenter)
          3. Cancel stale orders (> order_stale_minutes old, unfilled)
          4. Populate levels near current price (up to orders_per_side each)
        """
        # 1. Poll fills
        await self._poll_and_apply_fills(grid_range)

        # 2. Cancel out-of-range
        await self._cancel_out_of_range(grid_range)

        # 3. Cancel stale
        await self._cancel_stale()

        # 4. Populate levels near current price
        await self._populate_levels(grid_range, current_price)

    # ─────────────────────────────────────────────────────────────────
    # Recenter handler
    # ─────────────────────────────────────────────────────────────────

    async def recenter(self, *, new_range: GridRange, current_price: float) -> None:
        """Cancel ALL active grid orders + persist new range. The next
        tick() will populate the new grid. Pre-buy position is NOT touched.

        AUDIT-FIX A4: after the cancel loop, re-query active orders. Any
        pre-recenter row still showing status='open' is hard-marked
        cancelled BEFORE the new range is written. Without this defensive
        sweep, a cancel_order failure (network error, exchange race,
        retryable failure_reason) would leave orphans from the prior
        epoch alongside the new grid — which is exactly what produced
        the 20 orphan rows observed in the 2026-05-27 live evidence.
        """
        logger.info(
            "grid_recenter_start",
            new_low=new_range.low, new_high=new_range.high,
            n_levels=new_range.n_levels,
        )
        open_orders = await self.repo.get_open_active_orders()
        pre_recenter_ids = {o.exchange_order_id for o in open_orders}
        cancelled = 0
        for o in open_orders:
            ok = await self._cancel_order(o.exchange_order_id)
            if ok:
                cancelled += 1

        # AUDIT-FIX A4: belt-and-suspenders sweep — anything from the
        # pre-recenter cohort still showing status='open' gets force-marked.
        # The old row was definitely in the prior epoch (we listed it
        # above, then tried to cancel); leaving it open under the NEW range
        # would mean the bot keeps `_cancel_out_of_range` looping on a
        # known-doomed row tick after tick, plus inflated dashboard counts.
        still_open = await self.repo.get_open_active_orders()
        force_cleaned = 0
        for o in still_open:
            if o.exchange_order_id in pre_recenter_ids:
                await self.repo.mark_order_cancelled(o.exchange_order_id)
                logger.warning(
                    "recenter_force_close_orphan",
                    order_id=o.exchange_order_id,
                    side=o.side, level=o.level_index, level_price=o.level_price,
                    note=(
                        "row was in pre-recenter set but cancel did not "
                        "succeed; force-marked cancelled to keep DB coherent"
                    ),
                )
                force_cleaned += 1

        await self.repo.update_grid_state(
            current_range_low=new_range.low,
            current_range_high=new_range.high,
            num_levels=new_range.n_levels,
            last_recenter_at=datetime.now(timezone.utc),
        )
        logger.info(
            "grid_recenter_done",
            cancelled=cancelled,
            force_cleaned=force_cleaned,
            requested=len(pre_recenter_ids),
        )

    # ─────────────────────────────────────────────────────────────────
    # Emergency exit (called by circuit breaker)
    # ─────────────────────────────────────────────────────────────────

    async def emergency_exit(self) -> None:
        """Cancel all open grid orders + market-close the perp position.

        Called when the equity DD circuit breaker trips. Caller (risk
        manager / grid_tick) is responsible for setting bot_state.is_halted.
        """
        logger.critical("grid_emergency_exit_start")
        # Cancel all grid orders
        open_orders = await self.repo.get_open_active_orders()
        for o in open_orders:
            try:
                await self._cancel_order(o.exchange_order_id)
            except Exception as e:
                logger.error("emergency_cancel_failed", order_id=o.exchange_order_id, error=str(e))

        # Market-close the current inventory
        gs = await self.repo.get_grid_state()
        inv_qty = Decimal(str(gs.inventory_qty)) if gs and gs.inventory_qty else Decimal("0")
        if inv_qty > 0:
            try:
                await self.exchange.close_position(side="long", size=inv_qty)
                logger.critical("grid_emergency_position_closed", size=float(inv_qty))
            except Exception as e:
                logger.critical(
                    "grid_emergency_close_FAILED_position_orphaned",
                    size=float(inv_qty),
                    error=str(e),
                )
        else:
            logger.info("grid_emergency_no_position_to_close")

    # ─────────────────────────────────────────────────────────────────
    # Substeps of tick()
    # ─────────────────────────────────────────────────────────────────

    async def _poll_and_apply_fills(self, grid_range: GridRange) -> None:
        """For each open order, query the exchange. If filled, apply via
        position_manager and place the opposite-side order at the next level."""
        open_orders = await self.repo.get_open_active_orders()
        for o in open_orders:
            try:
                result = await self.exchange.get_order(o.exchange_order_id)
            except Exception as e:
                logger.warning(
                    "poll_order_error",
                    order_id=o.exchange_order_id, error=str(e),
                )
                continue
            await self.repo.touch_order_polled(o.exchange_order_id)
            if result is None:
                continue
            if not result.filled:
                # AUDIT-FIX A3: if the exchange moved this order to a
                # non-FILLED terminal state (CANCELLED / EXPIRED / FAILED),
                # reconcile the DB row instead of polling it forever.
                # Without this, every Coinbase-side cancel (user UI
                # cancel, exchange risk-engine cancel, listing change,
                # post-listing-event expire) produces a permanent orphan
                # in tb3_active_orders.
                terminal = getattr(result, "terminal_status", None)
                if terminal:
                    await self.repo.mark_order_cancelled(o.exchange_order_id)
                    logger.warning(
                        "poll_terminal_status_marked_cancelled",
                        order_id=o.exchange_order_id,
                        terminal_status=terminal,
                        side=o.side, level=o.level_index,
                    )
                continue

            # FILLED — apply
            fill_price = result.price if result.price else Decimal(str(o.level_price))
            fill_qty = result.size if result.size else Decimal(str(o.qty))
            fee = result.fee if result.fee else (
                fill_qty * fill_price * (self.maker_fee_pct / Decimal("100"))
            )

            # Mark our DB row as filled
            await self.repo.mark_order_filled(
                exchange_order_id=o.exchange_order_id,
                fill_price=float(fill_price),
                fill_qty=float(fill_qty),
                fee_paid=float(fee),
            )

            # Apply through position_manager (updates inventory + records fill).
            #
            # NOTE: AUDIT-FIX A: When the exchange has FILLED the order, our
            # books MUST reflect it — even if the fill would push inventory
            # below the long-only floor (a rare race between the can_sell
            # check at placement and the actual fill). Previously we rejected
            # the fill via position_manager.apply_fill() and the exchange
            # state diverged from our DB. Now we ALWAYS apply the fill;
            # the long_only floor is a best-effort placement guard, not a
            # hard accounting barrier. If the floor is violated post-fill,
            # we log it loudly so manual reconciliation can happen.
            fill_result = await self.position_manager.apply_fill(
                side=o.side,
                qty=fill_qty,
                price=fill_price,
                fee=fee,
                active_order_id=o.id,
                exchange_order_id=o.exchange_order_id,
                level_index=o.level_index,
                force=True,  # bypass long_only floor — fill already happened on exchange
            )

            logger.info(
                "grid_fill_applied",
                side=o.side, level=o.level_index,
                price=float(fill_price), qty=float(fill_qty),
                realized_pnl=float(fill_result.realized_pnl),
            )

            # Place opposite-side order at adjacent level
            await self._place_opposite_after_fill(
                filled_side=o.side,
                filled_level_index=o.level_index,
                grid_range=grid_range,
            )

    async def _place_opposite_after_fill(
        self,
        *,
        filled_side: str,
        filled_level_index: int,
        grid_range: GridRange,
    ) -> None:
        """After a fill, place the opposite-side limit at the adjacent level.

        Buy at level i → place sell at level i+1
        Sell at level i → place buy at level i-1
        """
        if filled_side == "buy":
            opposite_idx = filled_level_index + 1
            opposite_side = "sell"
        else:
            opposite_idx = filled_level_index - 1
            opposite_side = "buy"

        if opposite_idx < 0 or opposite_idx >= grid_range.n_levels:
            # Off the grid — nothing to place
            return

        opposite_price = grid_range.levels[opposite_idx]

        # Skip if an order already exists at that level + side
        existing = await self.repo.get_open_orders_at_level(
            opposite_idx, side=opposite_side
        )
        if existing:
            return

        qty_dec = _quantize_btc(self.capital_per_level / Decimal(str(opposite_price)))
        if qty_dec <= 0:
            logger.warning(
                "opposite_place_skipped_qty_too_small",
                level=opposite_idx, price=opposite_price,
                cap_per_level=float(self.capital_per_level),
            )
            return
        # AUDIT-FIX C2: gate opposite-side sells with the same economic-positivity
        # check as `_populate_levels`. Buys are always allowed (they reduce
        # avg_cost or are below it, which is good); sells must clear fee +
        # safety margin against current avg_cost.
        if opposite_side == "sell":
            economic_ok, eco_reason = self.position_manager.is_sell_economically_positive(
                level_price=Decimal(str(opposite_price)),
                qty=qty_dec,
                maker_fee_pct=self.maker_fee_pct,
            )
            if not economic_ok:
                logger.info(
                    "opposite_sell_skipped_below_breakeven",
                    level=opposite_idx, level_price=opposite_price,
                    qty=float(qty_dec), reason=eco_reason,
                )
                return
        await self._place_limit(
            side=opposite_side,
            level_index=opposite_idx,
            level_price=opposite_price,
            qty=float(qty_dec),
        )

    async def _cancel_out_of_range(self, grid_range: GridRange) -> None:
        open_orders = await self.repo.get_open_active_orders()
        for o in open_orders:
            if o.level_price < grid_range.low or o.level_price > grid_range.high:
                logger.info(
                    "cancelling_out_of_range",
                    order_id=o.exchange_order_id,
                    level_price=o.level_price,
                    range=(grid_range.low, grid_range.high),
                )
                await self._cancel_order(o.exchange_order_id)

    async def _cancel_stale(self) -> None:
        stale = await self.repo.get_stale_open_orders(self.order_stale_minutes)
        for o in stale:
            logger.info(
                "cancelling_stale",
                order_id=o.exchange_order_id,
                age_minutes=int(
                    (datetime.now(timezone.utc) - o.created_at).total_seconds() / 60
                ),
            )
            await self._cancel_order(o.exchange_order_id)

    async def _populate_levels(
        self, grid_range: GridRange, current_price: float,
    ) -> None:
        """Ensure the N nearest buy levels below + N nearest sell levels above
        have open orders. Skips levels that already have an open order on
        the appropriate side, or that just filled and are waiting for the
        adjacent-level opposite to complete the round-trip pair."""
        buys_needed = grid_range.buys_below(current_price, n=self.orders_per_side)
        sells_needed = grid_range.sells_above(current_price, n=self.orders_per_side)

        for idx, level_price in buys_needed:
            existing = await self.repo.get_open_orders_at_level(idx, side="buy")
            if existing:
                continue
            # AUDIT-FIX C1: skip placement if a buy at this level just filled
            # and the pair-partner sell at level idx+1 is still pending.
            if await self._is_pair_pending(idx, "buy", grid_range):
                logger.info(
                    "buy_skipped_pair_pending",
                    level=idx, level_price=level_price,
                )
                continue
            qty_dec = _quantize_btc(self.capital_per_level / Decimal(str(level_price)))
            if qty_dec <= 0:
                continue  # capital_per_level too small at this price
            await self._place_limit(
                side="buy",
                level_index=idx,
                level_price=level_price,
                qty=float(qty_dec),
            )

        for idx, level_price in sells_needed:
            existing = await self.repo.get_open_orders_at_level(idx, side="sell")
            if existing:
                continue
            # AUDIT-FIX C1: skip placement if a sell at this level just filled
            # and the pair-partner buy at level idx-1 is still pending.
            # This is the bleed-stop mechanism — without it, _populate_levels
            # re-creates the same-side sell every tick while price chops just
            # below the level, firing fill-after-fill at fee-rate loss.
            if await self._is_pair_pending(idx, "sell", grid_range):
                logger.info(
                    "sell_skipped_pair_pending",
                    level=idx, level_price=level_price,
                )
                continue
            qty_dec = _quantize_btc(self.capital_per_level / Decimal(str(level_price)))
            if qty_dec <= 0:
                continue
            # Skip sell placement if we don't have enough inventory above the
            # floor — the position_manager would reject the fill anyway.
            allowed, _reason = self.position_manager.can_sell(qty_dec)
            if not allowed:
                continue
            # AUDIT-FIX C2: skip placement if the level is structurally
            # below the fee breakeven against current avg_cost. The grid
            # range is derived from recent BTC highs/lows with no awareness
            # of avg_cost, so a level can land just above avg_cost and
            # produce guaranteed-loss lone sells. Live evidence: 4 sells
            # at level 7 ($75,879) vs avg_cost $75,873.54 lost −$0.107
            # each — caught by this check now.
            economic_ok, eco_reason = self.position_manager.is_sell_economically_positive(
                level_price=Decimal(str(level_price)),
                qty=qty_dec,
                maker_fee_pct=self.maker_fee_pct,
            )
            if not economic_ok:
                logger.info(
                    "sell_skipped_below_breakeven",
                    level=idx, level_price=level_price,
                    qty=float(qty_dec), reason=eco_reason,
                )
                continue
            await self._place_limit(
                side="sell",
                level_index=idx,
                level_price=level_price,
                qty=float(qty_dec),
            )

    async def _is_pair_pending(
        self, level_index: int, side: str, grid_range: GridRange,
    ) -> bool:
        """C1 pair-state check: True iff `side` just filled at `level_index`
        and the pair-partner at the adjacent level is still open.

        Canonical grid behavior: after a sell at level N fills, the bot
        places a buy at level N-1 (the pair partner). The slot at level
        N should NOT be re-engaged for same-side placement until the
        pair-buy at N-1 fills, signaling the round-trip completed.

        Without this gate, tight chop reopens the same-side at level N
        every tick and bleeds at maker-fee rate — the 2026-05-27 live
        evidence shows 4 sells at level 7 ($75,879) in 70 minutes
        losing −$0.107 each because the buy at level 6 ($75,581)
        never fired.

        When the pair-partner is filled, cancelled, or never existed
        (e.g., off-grid edge), returns False so normal placement
        resumes. Cross-recenter is self-cleaning: any prior-epoch
        pair-partner was cancelled by recenter(), so this check
        permits placement again under the new epoch.
        """
        last_fill = await self.repo.get_most_recent_fill_at_level(
            level_index, side=side
        )
        if last_fill is None:
            return False
        if side == "sell":
            opposite_idx = level_index - 1
            opposite_side = "buy"
        else:
            opposite_idx = level_index + 1
            opposite_side = "sell"
        if opposite_idx < 0 or opposite_idx >= grid_range.n_levels:
            return False
        opposite_orders = await self.repo.get_open_orders_at_level(
            opposite_idx, side=opposite_side
        )
        return bool(opposite_orders)

    # ─────────────────────────────────────────────────────────────────
    # Low-level placement / cancellation
    # ─────────────────────────────────────────────────────────────────

    async def _place_limit(
        self,
        *,
        side: str,
        level_index: int,
        level_price: float,
        qty: float,
    ) -> PlaceOrderResult:
        """Place one POST_ONLY limit. Records to tb3_active_orders on success."""
        try:
            result = await self.exchange.place_order(
                side=OrderSide(side),
                size=Decimal(str(qty)),
                order_type=OrderType.LIMIT,
                price=Decimal(str(level_price)),
                leverage=self.leverage,
                post_only=self.maker_only,
            )
        except Exception as e:
            logger.warning(
                "place_limit_failed",
                side=side, level=level_index, price=level_price, error=str(e),
            )
            return PlaceOrderResult(
                success=False,
                exchange_order_id=None,
                side=side, level_index=level_index,
                level_price=level_price, qty=qty,
                error=str(e),
            )

        # AUDIT-FIX A2: An empty order_id means the exchange rejected the
        # placement at submission (CoinbaseClient returns OrderResult with
        # order_id="" when Coinbase responds with {"success": false, ...}).
        # We must NOT insert a row into tb3_active_orders in this case —
        # that produces an unreconcilable orphan row whose UUID Coinbase
        # has never heard of, leaking forever.
        if not result.order_id:
            logger.warning(
                "place_limit_rejected_by_exchange",
                side=side, level=level_index, price=level_price, qty=qty,
            )
            return PlaceOrderResult(
                success=False,
                exchange_order_id=None,
                side=side, level_index=level_index,
                level_price=level_price, qty=qty,
                error="exchange rejected placement at submission",
            )

        # Persist (status='open')
        await self.repo.insert_active_order(
            exchange_order_id=result.order_id,
            side=side,
            level_index=level_index,
            level_price=level_price,
            qty=qty,
        )
        logger.info(
            "limit_placed",
            order_id=result.order_id,
            side=side, level=level_index, price=level_price, qty=qty,
        )
        return PlaceOrderResult(
            success=True,
            exchange_order_id=result.order_id,
            side=side, level_index=level_index,
            level_price=level_price, qty=qty,
        )

    # AUDIT-FIX A1: failure_reason values from Coinbase batch_cancel that mean
    # "the order is definitively not open on the exchange" — these are
    # terminal, so the DB row MUST be marked cancelled even though the
    # cancel itself "failed." Without this, an order that fills (or
    # cancels, or never existed) on Coinbase between our placement and
    # our cancel attempt leaves an orphan row at status='open' that
    # nothing else can clear (every subsequent _cancel_order call hits
    # the same trap). Source: Coinbase Advanced Trade
    # NewOrderFailureReason enum at
    # https://docs.cdp.coinbase.com/api-reference/advanced-trade-api/rest-api/orders/cancel-order
    _TERMINAL_CANCEL_FAILURE_REASONS = frozenset({
        "UNKNOWN_CANCEL_ORDER",     # exchange has no record of this id
        "ORDER_IS_FULLY_FILLED",    # already filled — caller should re-poll
        "DUPLICATE_CANCEL_REQUEST", # already cancelled
    })

    async def _cancel_order(self, exchange_order_id: str) -> bool:
        """Cancel one open order. Updates tb3_active_orders on success or
        on a terminal failure_reason (AUDIT-FIX A1)."""
        try:
            ok, failure_reason = await self.exchange.cancel_order(exchange_order_id)
        except Exception as e:
            logger.warning(
                "cancel_order_exception",
                order_id=exchange_order_id, error=str(e),
            )
            return False
        if ok:
            await self.repo.mark_order_cancelled(exchange_order_id)
            return True
        # AUDIT-FIX A1: if the exchange says the order is gone, our DB
        # MUST reflect that. Mark the row cancelled and log loudly so we
        # know the orphan was caught at cancel time (rather than silently
        # leaking as before).
        if failure_reason in self._TERMINAL_CANCEL_FAILURE_REASONS:
            await self.repo.mark_order_cancelled(exchange_order_id)
            logger.warning(
                "cancel_terminal_failure_marked_cancelled",
                order_id=exchange_order_id,
                failure_reason=failure_reason,
                note=(
                    "exchange says this order is not open; DB row marked "
                    "cancelled to keep state coherent"
                ),
            )
            return True
        # Retryable failure (e.g. INVALID_CANCEL_REQUEST,
        # COMMANDER_REJECTED_CANCEL_ORDER, NOT_ALLOWED_TO_CANCEL,
        # EMPTY_RESPONSE, EXCEPTION) — leave the row open and let the
        # next cancel sweep try again.
        logger.warning(
            "cancel_retryable_failure_row_stays_open",
            order_id=exchange_order_id,
            failure_reason=failure_reason,
        )
        return False

    # ─────────────────────────────────────────────────────────────────
    # Diagnostics
    # ─────────────────────────────────────────────────────────────────

    def _is_stale(self, created_at: datetime, now: Optional[datetime] = None) -> bool:
        now = now or datetime.now(timezone.utc)
        return (now - created_at) >= timedelta(minutes=self.order_stale_minutes)
