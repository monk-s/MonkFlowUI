"""
Order manager -- handles placing, updating, and cancelling orders through
the exchange interface.

Key safety feature: if a stop-loss order fails to place, it retries 3 times.
If all retries fail, it immediately closes the entry position at market to
prevent an unprotected position.
"""

from __future__ import annotations

import asyncio
from decimal import Decimal
from typing import Optional

from bot.exchange.base import (
    ExchangeInterface,
    OrderResult,
    OrderSide,
    OrderType,
)
from bot.risk.position_sizer import PositionSizeResult
from bot.strategy.base import Signal
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("order_manager")

_STOP_RETRY_ATTEMPTS = 3
_STOP_RETRY_DELAY_SEC = 2.0


class OrderManager:
    """
    Thin layer between the trade lifecycle and the exchange.
    Handles order placement, stop retries, and order cancellation.
    """

    def __init__(self, exchange: ExchangeInterface) -> None:
        self._exchange = exchange

    async def open_position(
        self,
        signal: Signal,
        position_size: PositionSizeResult,
        repo=None,
    ) -> tuple[OrderResult, OrderResult]:
        """
        Place an entry market order followed by a stop-market order.

        Returns
        -------
        (entry_result, stop_result)
            Both OrderResult objects.  If the stop order fails after 3
            retries the entry is closed at market and the returned
            stop_result will have ``filled=False`` and a synthetic order_id
            starting with ``stop-failed-`` so the caller can route to the
            rejected-trade path.

        If the emergency close ALSO fails (C1 fix), the bot halts itself
        via ``repo.update_bot_state(is_halted=True, ...)`` and the trade
        record is marked for human intervention.

        Raises
        ------
        RuntimeError
            If the entry order itself fails.
        """
        side = OrderSide.BUY if signal.direction == "long" else OrderSide.SELL

        # --- Entry (market) ---
        logger.info(
            "placing_entry_order",
            direction=signal.direction,
            size_btc=str(position_size.size_btc),
            strategy=signal.strategy,
        )

        entry_result = await self._exchange.place_order(
            side=side,
            size=position_size.size_btc,
            order_type=OrderType.MARKET,
            leverage=Decimal(str(settings.LEVERAGE)),
        )

        if not entry_result.filled:
            raise RuntimeError(
                f"Entry order not filled: {entry_result.order_id}"
            )

        logger.info(
            "entry_filled",
            order_id=entry_result.order_id,
            fill_price=str(entry_result.price),
            fee=str(entry_result.fee),
        )

        # --- Stop-loss (stop-market, reduce_only) ---
        stop_side = OrderSide.SELL if signal.direction == "long" else OrderSide.BUY
        stop_result = await self._place_stop_with_retry(
            stop_side=stop_side,
            size=position_size.size_btc,
            stop_price=Decimal(str(signal.stop_price)),
            entry_result=entry_result,
            signal=signal,
            repo=repo,
        )

        return entry_result, stop_result

    async def close_position(
        self,
        trade,
        reason: str,
    ) -> OrderResult:
        """
        Close a position at market.

        Parameters
        ----------
        trade
            A trade record with ``direction`` and ``position_size`` attributes.
        reason : str
            Why the position is being closed (logged).
        """
        direction = trade.direction if hasattr(trade, "direction") else str(trade.direction)
        size = Decimal(str(trade.position_size))

        logger.info(
            "closing_position",
            trade_id=str(getattr(trade, "id", "unknown")),
            direction=direction,
            size=str(size),
            reason=reason,
        )

        result = await self._exchange.close_position(direction, size)

        logger.info(
            "position_closed",
            trade_id=str(getattr(trade, "id", "unknown")),
            fill_price=str(result.price),
            fee=str(result.fee),
            reason=reason,
        )

        return result

    async def update_stop(
        self,
        old_stop_order_id: str,
        new_stop_price: Decimal,
        size: Decimal,
        direction: str,
    ) -> OrderResult:
        """
        Trail/update a stop by placing a new stop FIRST, then cancelling the old.

        Why place-then-cancel (C2 fix): the original code cancelled the old
        stop first, then placed the new one. If the new placement failed (any
        Coinbase API hiccup) the position would have NO stop on the exchange
        until the next position_tick (~60s window) — and the bot's DB would
        falsely show status=trailing with a tighter stop that didn't exist.

        Now: if the new place fails, the OLD stop is still active and we raise.
        The caller (position_manager) will see the exception, log it, and
        leave the trade record's stop_order_id pointing at the still-live
        old order. Bot continues to have stop protection.

        Both orders are reduce_only — if both end up briefly on the book
        (cancel of old fails after new is placed), they can't both trigger
        because only one position exists.
        """
        stop_side = OrderSide.SELL if direction == "long" else OrderSide.BUY

        # STEP 1: place the new stop. If this fails, old stop remains active.
        try:
            new_result = await self._exchange.place_order(
                side=stop_side,
                size=size,
                order_type=OrderType.STOP_MARKET,
                stop_price=new_stop_price,
                reduce_only=True,
            )
        except Exception as exc:
            logger.error(
                "new_stop_placement_failed_keeping_old",
                old_order_id=old_stop_order_id,
                new_stop_price=str(new_stop_price),
                error=str(exc),
            )
            raise  # caller knows to leave the trade record alone

        # STEP 2: now that the new stop is live, cancel the old.
        # If this fails it's safe to ignore — the old stop is reduce_only
        # and can't trigger because only one position exists. Worst case:
        # an extra harmless order on the book until it ages out.
        try:
            # AUDIT-FIX A1: cancel_order now returns (success, failure_reason).
            # v1 stop-rotation doesn't need the reason — just the boolean.
            cancelled, _failure_reason = await self._exchange.cancel_order(old_stop_order_id)
            if not cancelled:
                logger.warning(
                    "old_stop_cancel_failed_after_new_placed",
                    old_order_id=old_stop_order_id,
                    new_order_id=new_result.order_id,
                )
        except Exception as exc:
            logger.warning(
                "old_stop_cancel_error_after_new_placed",
                old_order_id=old_stop_order_id,
                new_order_id=new_result.order_id,
                error=str(exc),
            )

        logger.info(
            "stop_updated",
            old_order_id=old_stop_order_id,
            new_order_id=new_result.order_id,
            new_stop_price=str(new_stop_price),
        )

        return new_result

    async def cancel_all_orders_for_trade(self, trade, repo=None) -> list[str]:
        """
        Cancel all exchange orders associated with a trade record.

        Returns the list of order_ids that FAILED to cancel — empty list on
        full success. Critical at trade-close: an uncancelled stop (or target)
        order can later trigger after the position is gone, creating a phantom
        position in the opposite direction. (H6 fix.)

        If a repo is passed in, failures are also written to tb_bot_log so
        they're visible in the dashboard.
        """
        order_ids = []
        for attr in ("stop_order_id", "target_order_id", "entry_order_id"):
            oid = getattr(trade, attr, None)
            if oid:
                order_ids.append((attr, oid))

        failed: list[str] = []
        for attr, oid in order_ids:
            try:
                # AUDIT-FIX A1: cancel_order now returns (success, failure_reason).
                cancelled, failure_reason = await self._exchange.cancel_order(oid)
                if cancelled:
                    logger.info("order_cancelled", order_id=oid, trade_id=str(getattr(trade, "id", "?")))
                else:
                    # Not necessarily failure — could be already-filled or already-cancelled.
                    # Coinbase reports the reason in failure_reason.
                    logger.debug(
                        "order_cancel_not_found",
                        order_id=oid, attr=attr, failure_reason=failure_reason,
                    )
                    failed.append(oid)
            except Exception as exc:
                logger.warning(
                    "order_cancel_error",
                    order_id=oid,
                    attr=attr,
                    error=str(exc),
                )
                failed.append(oid)

        if failed and repo is not None:
            try:
                await repo.log(
                    "warn", "order_manager",
                    f"Trade {getattr(trade, 'id', '?')}: failed to cancel "
                    f"{len(failed)} of {len(order_ids)} orders ({failed}). "
                    f"Check Coinbase order book for stale orders that could create "
                    f"phantom positions if they later trigger."
                )
            except Exception:
                pass

        return failed

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def _place_stop_with_retry(
        self,
        stop_side: OrderSide,
        size: Decimal,
        stop_price: Decimal,
        entry_result: OrderResult,
        signal: Signal,
        repo=None,
    ) -> OrderResult:
        """
        Attempt to place a stop-loss order up to 3 times.
        If all attempts fail, close the entry position at market.

        C1 hardening: the previous version had a single un-protected call to
        ``place_order(MARKET, reduce_only=True)`` after stop retries failed.
        If that emergency close itself failed (rate limit, Coinbase 5xx,
        position-not-found race, insufficient margin briefly), the function
        raised — and the caller saw an exception with NO indication that
        the entry was now LIVE WITH NO STOP. Catastrophic.

        Now:
          - emergency close is wrapped in its own retry loop (3x with 1s delay)
          - filled status is checked before declaring success
          - if EVERYTHING fails: log CRITICAL to tb_bot_log AND halt the bot
            so no further trades are placed; human intervention required.
        """
        last_error: Optional[Exception] = None

        for attempt in range(1, _STOP_RETRY_ATTEMPTS + 1):
            try:
                stop_result = await self._exchange.place_order(
                    side=stop_side,
                    size=size,
                    order_type=OrderType.STOP_MARKET,
                    stop_price=stop_price,
                    reduce_only=True,
                )

                logger.info(
                    "stop_placed",
                    order_id=stop_result.order_id,
                    stop_price=str(stop_price),
                    attempt=attempt,
                )
                return stop_result

            except Exception as exc:
                last_error = exc
                logger.warning(
                    "stop_placement_failed",
                    attempt=attempt,
                    max_attempts=_STOP_RETRY_ATTEMPTS,
                    error=str(exc),
                )
                if attempt < _STOP_RETRY_ATTEMPTS:
                    await asyncio.sleep(_STOP_RETRY_DELAY_SEC)

        # All stop retries exhausted -- emergency close at market
        logger.error(
            "stop_all_retries_failed_emergency_close",
            entry_order_id=entry_result.order_id,
            error=str(last_error),
        )
        if repo is not None:
            try:
                await repo.log(
                    "error", "order_manager",
                    f"Stop placement failed 3x for entry {entry_result.order_id}. "
                    f"Attempting emergency market close. Last error: {last_error}"
                )
            except Exception:
                pass

        close_side = (
            OrderSide.SELL if signal.direction == "long" else OrderSide.BUY
        )

        emergency_result = await self._emergency_close_with_retry(
            close_side=close_side,
            size=size,
            entry_order_id=entry_result.order_id,
            repo=repo,
        )

        if emergency_result is None:
            # Emergency close ALSO failed after retries. Position is live with
            # no stop. Halt the bot and surface CRITICAL alert.
            logger.critical(
                "emergency_close_FAILED_position_unprotected",
                entry_order_id=entry_result.order_id,
            )
            if repo is not None:
                try:
                    await repo.update_bot_state(
                        is_halted=True,
                        halt_reason=(
                            f"emergency_close_failed: entry {entry_result.order_id} "
                            f"has NO stop and emergency close failed 3x. "
                            f"MANUAL INTERVENTION REQUIRED on Coinbase."
                        ),
                    )
                    await repo.log(
                        "error", "order_manager",
                        f"CRITICAL: entry {entry_result.order_id} is LIVE WITH NO STOP "
                        f"and emergency close failed 3x. Bot has been auto-halted. "
                        f"Go to Coinbase Advanced UI immediately and close the position manually."
                    )
                except Exception:
                    pass

            # Return synthetic with order_id that signals UNPROTECTED state
            return OrderResult(
                order_id=f"stop-failed-EMERGENCY-CLOSE-FAILED-{entry_result.order_id}",
                side=stop_side,
                order_type=OrderType.STOP_MARKET,
                size=size,
                stop_price=stop_price,
                filled=False,
            )

        logger.info(
            "emergency_close_filled",
            order_id=emergency_result.order_id,
            fill_price=str(emergency_result.price),
        )

        # Return a synthetic stop result to signal stop-failure but close-success
        return OrderResult(
            order_id=f"stop-failed-{entry_result.order_id}",
            side=stop_side,
            order_type=OrderType.STOP_MARKET,
            size=size,
            stop_price=stop_price,
            filled=False,
        )

    async def _emergency_close_with_retry(
        self,
        close_side: OrderSide,
        size: Decimal,
        entry_order_id: str,
        repo=None,
    ) -> Optional[OrderResult]:
        """
        Attempt the emergency market close up to 3 times.
        Returns the OrderResult if it filled, None if all attempts failed.

        Verifies ``filled=True`` on the response, not just absence of exception.
        Coinbase can accept an order without filling it (extreme illiquidity).
        """
        last_error: Optional[Exception] = None

        for attempt in range(1, 4):  # 3 attempts
            try:
                result = await self._exchange.place_order(
                    side=close_side,
                    size=size,
                    order_type=OrderType.MARKET,
                    reduce_only=True,
                )
                if result.filled:
                    return result
                # Got a result but unfilled — treat as failure for retry purposes
                logger.warning(
                    "emergency_close_not_filled",
                    attempt=attempt,
                    order_id=result.order_id,
                )
                last_error = RuntimeError(f"order {result.order_id} accepted but not filled")
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "emergency_close_attempt_failed",
                    attempt=attempt,
                    entry_order_id=entry_order_id,
                    error=str(exc),
                )

            if attempt < 3:
                await asyncio.sleep(1.0)

        logger.error(
            "emergency_close_all_attempts_failed",
            entry_order_id=entry_order_id,
            last_error=str(last_error),
        )
        return None
