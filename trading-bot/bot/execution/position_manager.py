"""
Position manager -- monitors open positions every 60 seconds.

For each open trade:
  1. Get current price
  2. Check if stop or target hit (in paper mode, check pending orders)
  3. If profit > 1R and trailing not active, activate trailing stop
  4. If trailing active, update trailing stop
  5. Update unrealized P&L in DB
  6. Check circuit breakers
"""

from __future__ import annotations

from decimal import Decimal
from typing import Optional

from bot.data.indicators import Candle, _isnan, atr as calc_atr
from bot.exchange.base import ExchangeInterface
from bot.execution.order_manager import OrderManager
from bot.persistence.repository import Repository
from bot.risk.risk_manager import RiskManager
from bot.risk.trailing_stop import TrailingStopManager
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("position_manager")


class PositionManager:
    """
    Periodically checks all open trades and manages stops, trailing,
    and P&L tracking.
    """

    def __init__(
        self,
        exchange: ExchangeInterface,
        repository: Repository,
        risk_manager: RiskManager,
        trailing_stop_manager: TrailingStopManager,
        order_manager: Optional[OrderManager] = None,
    ) -> None:
        self._exchange = exchange
        self._repo = repository
        self._risk = risk_manager
        self._trailing = trailing_stop_manager
        self._orders = order_manager or OrderManager(exchange)

    async def check_positions(self) -> None:
        """
        Main tick -- called every POSITION_CHECK_INTERVAL_SEC seconds.
        Iterates over all open trades and manages each one.
        """
        open_trades = await self._repo.get_open_trades()
        if not open_trades:
            return

        try:
            # NB: do NOT also assign get_equity() to a current_price variable
            # here — the actual price is fetched as market_price below via
            # get_current_price(). An earlier version had a redundant
            # `current_price = float(await self.get_equity())` here that was
            # never read; removed to save one Coinbase API call per 60s tick
            # (1,440 wasted calls/day) and avoid the confusion of having
            # current_price actually hold an account-equity value.
            equity = await self._exchange.get_equity()
        except Exception as exc:
            logger.error("failed_to_get_equity", error=str(exc))
            try:
                await self._repo.log(
                    "error", "position_manager",
                    f"Failed to fetch equity in position tick: {exc} "
                    f"(skipping this 60s cycle; will retry next tick)"
                )
            except Exception:
                pass
            return

        try:
            market_price = float(await self._exchange.get_current_price())
        except Exception as exc:
            logger.error("failed_to_get_price", error=str(exc))
            return

        # Fetch latest ATR for trailing stop calculations
        atr_val = await self._get_latest_atr()

        # Check paper-mode pending orders
        await self._check_paper_orders(market_price)

        for trade in open_trades:
            try:
                await self._manage_trade(trade, market_price, atr_val, equity)
            except Exception as exc:
                logger.error(
                    "trade_management_error",
                    trade_id=str(trade.id),
                    error=str(exc),
                )

        # Circuit breaker check across all positions
        await self._check_portfolio_circuit_breakers(open_trades, equity)

    async def _manage_trade(
        self,
        trade,
        current_price: float,
        atr_val: float,
        equity: Decimal,
    ) -> None:
        """Process a single open trade."""
        entry = float(trade.entry_price) if trade.entry_price else 0.0
        stop = float(trade.stop_price) if trade.stop_price else 0.0
        target = float(trade.target_price) if trade.target_price else 0.0
        direction = str(trade.direction)
        size = float(trade.position_size) if trade.position_size else 0.0

        if entry == 0 or stop == 0 or size == 0:
            return

        # --- Check if target hit ---
        target_hit = False
        if target > 0:
            if direction == "long" and current_price >= target:
                target_hit = True
            elif direction == "short" and current_price <= target:
                target_hit = True

        if target_hit:
            logger.info(
                "target_hit",
                trade_id=str(trade.id),
                target=target,
                price=current_price,
            )
            await self._close_trade(trade, current_price, "target")
            return

        # --- Check if stop hit ---
        stop_hit = False
        effective_stop = float(trade.trailing_stop) if trade.trailing_stop else stop
        if direction == "long" and current_price <= effective_stop:
            stop_hit = True
        elif direction == "short" and current_price >= effective_stop:
            stop_hit = True

        if stop_hit:
            logger.info(
                "stop_hit",
                trade_id=str(trade.id),
                stop=effective_stop,
                price=current_price,
            )
            await self._close_trade(trade, current_price, "stopped")
            return

        # --- Trailing stop management ---
        if trade.status == "trailing":
            # Already trailing -- update stop
            if atr_val and not _isnan(atr_val):
                new_stop = self._trailing.calculate_trailing_stop(
                    current_price, atr_val, direction,
                )
                old_trailing = float(trade.trailing_stop) if trade.trailing_stop else stop
                updated_stop = self._trailing.update_stop(old_trailing, new_stop, direction)

                if updated_stop != old_trailing:
                    # Update stop order on exchange
                    stop_order_id = trade.stop_order_id
                    if stop_order_id:
                        try:
                            new_order = await self._orders.update_stop(
                                old_stop_order_id=stop_order_id,
                                new_stop_price=Decimal(str(round(updated_stop, 2))),
                                size=Decimal(str(trade.position_size)),
                                direction=direction,
                            )
                            await self._repo.update_trade(
                                str(trade.id),
                                trailing_stop=round(updated_stop, 2),
                                stop_order_id=new_order.order_id,
                            )
                        except Exception as exc:
                            logger.error(
                                "trailing_stop_update_failed",
                                trade_id=str(trade.id),
                                error=str(exc),
                            )
                    else:
                        await self._repo.update_trade(
                            str(trade.id),
                            trailing_stop=round(updated_stop, 2),
                        )

        elif trade.status == "open":
            # Check if trailing should activate
            should_trail = self._trailing.should_activate(
                entry_price=entry,
                current_price=current_price,
                stop_price=stop,
                direction=direction,
            )
            if should_trail and atr_val and not _isnan(atr_val):
                new_stop = self._trailing.calculate_trailing_stop(
                    current_price, atr_val, direction,
                )
                # Only activate if new trailing stop is better than original
                activate = False
                if direction == "long" and new_stop > stop:
                    activate = True
                elif direction == "short" and new_stop < stop:
                    activate = True

                if activate:
                    logger.info(
                        "trailing_activated",
                        trade_id=str(trade.id),
                        original_stop=stop,
                        trailing_stop=round(new_stop, 2),
                    )

                    # Update the stop order on exchange
                    stop_order_id = trade.stop_order_id
                    if stop_order_id:
                        try:
                            new_order = await self._orders.update_stop(
                                old_stop_order_id=stop_order_id,
                                new_stop_price=Decimal(str(round(new_stop, 2))),
                                size=Decimal(str(trade.position_size)),
                                direction=direction,
                            )
                            await self._repo.update_trade(
                                str(trade.id),
                                status="trailing",
                                trailing_stop=round(new_stop, 2),
                                stop_order_id=new_order.order_id,
                            )
                        except Exception as exc:
                            logger.error(
                                "trailing_activation_failed",
                                trade_id=str(trade.id),
                                error=str(exc),
                            )
                    else:
                        await self._repo.update_trade(
                            str(trade.id),
                            status="trailing",
                            trailing_stop=round(new_stop, 2),
                        )

                    await self._repo.log_trade_event(
                        trade_id=str(trade.id),
                        from_status="open",
                        to_status="trailing",
                        reason=f"Trailing activated at {round(new_stop, 2)}",
                    )

        # --- Update unrealized P&L ---
        if direction == "long":
            unrealized = (current_price - entry) * size
        else:
            unrealized = (entry - current_price) * size

        # We don't update the trade record every tick to avoid DB churn,
        # but we could store it on the balance history snapshot.

    async def _close_trade(
        self,
        trade,
        exit_price: float,
        exit_reason: str,
    ) -> None:
        """Close a trade: cancel orders, close position, update DB."""
        direction = str(trade.direction)
        size = Decimal(str(trade.position_size)) if trade.position_size else Decimal("0")
        # None-guard for defensive consistency with _manage_trade (lines 99-101).
        # Recovered-orphan trades or partially-written rows might have NULL
        # entry/stop. Without the guard, float(None) raises TypeError mid-close,
        # leaving the trade stuck in "open" with a real position closed on
        # Coinbase but no DB record of it.
        entry = float(trade.entry_price) if trade.entry_price else 0.0
        if entry == 0.0 or size == 0:
            logger.error(
                "close_trade_invalid_data",
                trade_id=str(trade.id),
                entry_price=str(trade.entry_price),
                position_size=str(trade.position_size),
            )
            try:
                await self._repo.log(
                    "error", "position_manager",
                    f"Cannot close trade {trade.id}: missing entry_price or position_size. "
                    f"Manual intervention required."
                )
            except Exception:
                pass
            return

        # Cancel all pending orders. Pass repo so any cancel failures get
        # logged to tb_bot_log (H6) — uncancelled stops are a phantom-position
        # risk if they trigger after the position is gone.
        await self._orders.cancel_all_orders_for_trade(trade, repo=self._repo)

        # Close position on exchange
        try:
            close_result = await self._exchange.close_position(direction, size)
            actual_exit = float(close_result.price) if close_result.price else exit_price
            fee = float(close_result.fee)
        except Exception as exc:
            logger.error(
                "position_close_failed",
                trade_id=str(trade.id),
                error=str(exc),
            )
            actual_exit = exit_price
            fee = 0.0

        # Calculate P&L
        if direction == "long":
            realized_pnl = (actual_exit - entry) * float(size)
        else:
            realized_pnl = (entry - actual_exit) * float(size)

        fees_total = float(trade.fees_paid or 0) + fee
        net_pnl = realized_pnl - fees_total - float(trade.funding_paid or 0)

        # R-multiple — same None-guard pattern as above
        stop_for_r = float(trade.stop_price) if trade.stop_price else 0.0
        risk_per_unit = abs(entry - stop_for_r) if stop_for_r > 0 else 0.0
        r_multiple = realized_pnl / (risk_per_unit * float(size)) if risk_per_unit > 0 and float(size) > 0 else 0.0

        # Determine final status
        final_status = exit_reason if exit_reason in ("target", "stopped") else "closed"

        await self._repo.update_trade(
            str(trade.id),
            status=final_status,
            exit_price=round(actual_exit, 2),
            realized_pnl=round(realized_pnl, 4),
            fees_paid=round(fees_total, 4),
            net_pnl=round(net_pnl, 4),
            r_multiple=round(r_multiple, 2),
        )

        await self._repo.log_trade_event(
            trade_id=str(trade.id),
            from_status=str(trade.status),
            to_status=final_status,
            reason=exit_reason,
            metadata={
                "exit_price": round(actual_exit, 2),
                "realized_pnl": round(realized_pnl, 4),
                "net_pnl": round(net_pnl, 4),
                "r_multiple": round(r_multiple, 2),
                "fees": round(fees_total, 4),
            },
        )

        logger.info(
            "trade_closed",
            trade_id=str(trade.id),
            status=final_status,
            exit_price=round(actual_exit, 2),
            pnl=round(net_pnl, 4),
            r_multiple=round(r_multiple, 2),
        )

    async def _check_paper_orders(self, current_price: float) -> None:
        """In paper mode, check if any pending orders should fill."""
        if settings.TRADING_MODE != "paper":
            return

        # The PaperEngine handles this internally via check_pending_orders,
        # but we need to pass candle high/low.  For the 60-second tick,
        # we approximate by using current_price for both.
        if hasattr(self._exchange, "check_pending_orders"):
            try:
                filled = await self._exchange.check_pending_orders(
                    candle_high=current_price,
                    candle_low=current_price,
                )
                if filled:
                    logger.info("paper_orders_filled", count=len(filled))
            except Exception as exc:
                logger.warning("paper_order_check_failed", error=str(exc))

    async def _check_portfolio_circuit_breakers(
        self,
        open_trades: list,
        equity: Decimal,
    ) -> None:
        """If circuit breakers trip, close all positions.

        H7: Uses real weekly/monthly P&L windows (rolling 7d / 30d) instead
        of the prior copy-of-daily simplification. Filters to live-mode trades
        only so any prior paper losses don't pollute live breaker math.
        """
        live_only = settings.TRADING_MODE == "live"
        daily_pnl = await self._repo.get_daily_pnl(live_only=live_only)
        weekly_pnl = await self._repo.get_weekly_pnl(live_only=live_only)
        monthly_pnl = await self._repo.get_monthly_pnl(live_only=live_only)
        peak = await self._repo.get_peak_equity()
        total_pnl_pct = (
            ((float(equity) - peak) / peak) * 100 if peak > 0 else 0.0
        )

        cb_result = await self._risk.check_circuit_breakers(
            equity=equity,
            daily_pnl=daily_pnl,
            weekly_pnl=weekly_pnl,
            monthly_pnl=monthly_pnl,
            total_pnl_pct=total_pnl_pct,
        )

        if not cb_result.allowed:
            logger.error(
                "circuit_breaker_tripped_closing_all",
                reason=cb_result.reason,
                open_trades=len(open_trades),
            )
            for trade in open_trades:
                try:
                    market_price = float(await self._exchange.get_current_price())
                    await self._close_trade(trade, market_price, f"circuit_breaker: {cb_result.reason}")
                except Exception as exc:
                    logger.error(
                        "emergency_close_failed",
                        trade_id=str(trade.id),
                        error=str(exc),
                    )

            # Halt the bot
            await self._repo.update_bot_state(
                is_halted=True,
                halt_reason=cb_result.reason,
            )

    async def _get_latest_atr(self) -> float:
        """Fetch the latest 4H ATR value for trailing stop calculations."""
        try:
            raw_candles = await self._exchange.get_candles("4h", limit=50)
            if not raw_candles or len(raw_candles) < settings.ATR_PERIOD + 2:
                return float("nan")

            highs = [c["high"] for c in raw_candles]
            lows = [c["low"] for c in raw_candles]
            closes = [c["close"] for c in raw_candles]

            atr_values = calc_atr(highs, lows, closes, settings.ATR_PERIOD)
            latest = atr_values[-1] if atr_values else float("nan")
            return latest

        except Exception as exc:
            logger.warning("atr_fetch_failed", error=str(exc))
            return float("nan")
