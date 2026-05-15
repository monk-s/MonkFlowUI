"""
Trade lifecycle -- state machine orchestrator.

Owns the complete flow from signal to open trade:
  1. Run risk check -> if blocked, log REJECTED, return
  2. Calculate position size
  3. Place orders via order_manager
  4. Create trade record in DB
  5. Log state transitions
"""

from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from typing import Optional

from bot.exchange.base import ExchangeInterface
from bot.execution.order_manager import OrderManager
from bot.persistence.repository import Repository
from bot.risk.position_sizer import PositionSizeResult, calculate_position_size
from bot.risk.risk_manager import RiskCheckResult, RiskManager
from bot.strategy.base import Signal
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("trade_lifecycle")


class TradeLifecycle:
    """
    Orchestrates the complete trade lifecycle from signal to open position.
    """

    def __init__(
        self,
        exchange: ExchangeInterface,
        repository: Repository,
        risk_manager: RiskManager,
        order_manager: Optional[OrderManager] = None,
    ) -> None:
        self._exchange = exchange
        self._repo = repository
        self._risk = risk_manager
        self._orders = order_manager or OrderManager(exchange)

    async def process_signal(self, signal: Signal) -> str:
        """
        Process a trade signal through the full lifecycle.

        Returns
        -------
        str
            Final status: ``"open"``, ``"rejected"``, or ``"error"``.
        """
        logger.info(
            "processing_signal",
            strategy=signal.strategy,
            direction=signal.direction,
            entry=signal.entry_price,
            stop=signal.stop_price,
            target=signal.target_price,
            rr=signal.rr_ratio,
            regime=signal.regime,
        )

        now = datetime.now(timezone.utc)

        # --- Step 1: Risk check ---
        try:
            equity = await self._exchange.get_equity()
            open_trades = await self._repo.get_open_trades()
            daily_pnl = await self._repo.get_daily_pnl()
            peak_equity = await self._repo.get_peak_equity()

            total_pnl_pct = (
                ((float(equity) - peak_equity) / peak_equity) * 100
                if peak_equity > 0
                else 0.0
            )

            risk_result: RiskCheckResult = await self._risk.check_trade(
                signal=signal,
                equity=equity,
                open_positions=open_trades,
                daily_pnl=daily_pnl,
                weekly_pnl=daily_pnl,  # simplified
                monthly_pnl=daily_pnl,  # simplified
                total_pnl_pct=total_pnl_pct,
            )
        except Exception as exc:
            logger.error("risk_check_failed", error=str(exc))
            await self._create_rejected_trade(signal, f"Risk check error: {exc}", now)
            return "error"

        if not risk_result.allowed:
            logger.warning(
                "signal_rejected",
                strategy=signal.strategy,
                direction=signal.direction,
                reason=risk_result.reason,
            )
            await self._create_rejected_trade(signal, risk_result.reason, now)
            return "rejected"

        # --- Step 2: Calculate position size ---
        try:
            pos_size: PositionSizeResult = calculate_position_size(
                equity=equity,
                entry_price=Decimal(str(signal.entry_price)),
                stop_price=Decimal(str(signal.stop_price)),
                risk_pct=settings.RISK_PER_TRADE_PCT,
                leverage=settings.LEVERAGE,
            )
        except Exception as exc:
            logger.error("position_sizing_failed", error=str(exc))
            await self._create_rejected_trade(signal, f"Sizing error: {exc}", now)
            return "error"

        if not pos_size.is_valid:
            reason = "Position size calculation returned zero"
            logger.warning("invalid_position_size", reason=reason)
            await self._create_rejected_trade(signal, reason, now)
            return "rejected"

        # --- Step 3: Place orders ---
        try:
            entry_result, stop_result = await self._orders.open_position(
                signal=signal,
                position_size=pos_size,
            )
        except Exception as exc:
            logger.error("order_placement_failed", error=str(exc))
            await self._create_rejected_trade(signal, f"Order error: {exc}", now)
            return "error"

        # If stop placement failed (emergency close happened), record as error
        if not stop_result.filled and stop_result.order_id.startswith("stop-failed"):
            logger.error(
                "stop_placement_failed_emergency_closed",
                entry_order_id=entry_result.order_id,
            )
            await self._create_rejected_trade(
                signal,
                "Stop order failed after 3 retries; entry closed at market",
                now,
            )
            return "error"

        # --- Step 4: Create trade record ---
        actual_entry = float(entry_result.price) if entry_result.price else signal.entry_price

        # Recalculate R:R with actual fill price
        if signal.direction == "long":
            actual_risk = actual_entry - signal.stop_price
            actual_rr = (signal.target_price - actual_entry) / actual_risk if actual_risk > 0 else 0
        else:
            actual_risk = signal.stop_price - actual_entry
            actual_rr = (actual_entry - signal.target_price) / actual_risk if actual_risk > 0 else 0

        trade_data = {
            "strategy": signal.strategy,
            "direction": signal.direction,
            "status": "open",
            "regime": signal.regime,
            "signal_price": signal.entry_price,
            "entry_price": actual_entry,
            "stop_price": signal.stop_price,
            "target_price": signal.target_price,
            "position_size": float(pos_size.size_btc),
            "position_value": float(pos_size.value_usd),
            "margin_used": float(pos_size.margin_usd),
            "risk_amount": float(pos_size.risk_usd),
            "risk_pct": float(pos_size.risk_pct),
            "rr_ratio": round(actual_rr, 2),
            "entry_order_id": entry_result.order_id,
            "stop_order_id": stop_result.order_id,
            "fees_paid": float(entry_result.fee),
            "funding_paid": 0.0,
            "indicators_snapshot": signal.indicators,
            "signal_at": now,
            "entry_at": entry_result.timestamp,
        }

        try:
            trade = await self._repo.create_trade(trade_data)
        except Exception as exc:
            logger.error("trade_record_creation_failed", error=str(exc))
            return "error"

        # --- Step 5: Log state transition ---
        await self._repo.log_trade_event(
            trade_id=str(trade.id),
            from_status=None,
            to_status="open",
            reason=f"Signal from {signal.strategy} ({signal.regime})",
            metadata={
                "entry_price": actual_entry,
                "stop_price": signal.stop_price,
                "target_price": signal.target_price,
                "rr_ratio": round(actual_rr, 2),
                "size_btc": float(pos_size.size_btc),
                "risk_usd": float(pos_size.risk_usd),
            },
        )

        logger.info(
            "trade_opened",
            trade_id=str(trade.id),
            strategy=signal.strategy,
            direction=signal.direction,
            entry=actual_entry,
            stop=signal.stop_price,
            target=signal.target_price,
            size_btc=float(pos_size.size_btc),
            margin=float(pos_size.margin_usd),
            risk_usd=float(pos_size.risk_usd),
        )

        return "open"

    async def transition(
        self,
        trade_id: str,
        new_status: str,
        reason: str,
        **updates,
    ) -> None:
        """
        Transition a trade to a new status with an audit trail.

        Parameters
        ----------
        trade_id : str
            UUID of the trade to update.
        new_status : str
            The target status.
        reason : str
            Human-readable reason for the transition.
        **updates
            Additional column updates to apply.
        """
        trade = await self._repo.get_trade(trade_id)
        old_status = str(trade.status) if trade else None

        await self._repo.update_trade(
            trade_id,
            status=new_status,
            **updates,
        )

        await self._repo.log_trade_event(
            trade_id=trade_id,
            from_status=old_status,
            to_status=new_status,
            reason=reason,
            metadata=updates if updates else None,
        )

        logger.info(
            "trade_transitioned",
            trade_id=trade_id,
            from_status=old_status,
            to_status=new_status,
            reason=reason,
        )

    # ------------------------------------------------------------------
    # Internal
    # ------------------------------------------------------------------

    async def recover_orphaned_trades(self) -> int:
        """
        On startup, find trades stuck in entry_pending and clean them up.
        Returns the count of recovered trades.
        """
        pending = await self._repo.get_trades_by_status(["entry_pending"])
        recovered = 0

        for trade in pending:
            logger.warning(
                "recovering_orphaned_trade",
                trade_id=str(trade.id),
                direction=trade.direction,
            )

            # Check if there's an actual position on the exchange
            try:
                positions = await self._exchange.get_positions()
                has_position = any(
                    p.side == trade.direction for p in positions
                )
            except Exception:
                has_position = False

            if has_position:
                await self._repo.update_trade(
                    str(trade.id),
                    status="open",
                    entry_at=datetime.now(timezone.utc),
                )
                await self._repo.log_trade_event(
                    trade_id=str(trade.id),
                    from_status="entry_pending",
                    to_status="open",
                    reason="Recovered on startup — position found on exchange",
                )
                logger.info("orphan_recovered_as_open", trade_id=str(trade.id))
            else:
                await self._repo.update_trade(
                    str(trade.id),
                    status="cancelled",
                    exit_at=datetime.now(timezone.utc),
                )
                await self._repo.log_trade_event(
                    trade_id=str(trade.id),
                    from_status="entry_pending",
                    to_status="cancelled",
                    reason="Cancelled on startup — no position found",
                )
                logger.info("orphan_cancelled", trade_id=str(trade.id))

            recovered += 1

        if recovered:
            await self._repo.log(
                "warn", "lifecycle",
                f"Startup recovery: {recovered} orphaned trade(s) processed",
            )

        return recovered

    async def _create_rejected_trade(
        self,
        signal: Signal,
        reason: str,
        timestamp: datetime,
    ) -> None:
        """Create a trade record with status=rejected for audit purposes."""
        trade_data = {
            "strategy": signal.strategy,
            "direction": signal.direction,
            "status": "rejected",
            "regime": signal.regime,
            "signal_price": signal.entry_price,
            "stop_price": signal.stop_price,
            "target_price": signal.target_price,
            "rr_ratio": signal.rr_ratio,
            "reject_reason": reason,
            "indicators_snapshot": signal.indicators,
            "signal_at": timestamp,
        }

        try:
            trade = await self._repo.create_trade(trade_data)
            await self._repo.log_trade_event(
                trade_id=str(trade.id),
                from_status=None,
                to_status="rejected",
                reason=reason,
            )
        except Exception as exc:
            logger.error(
                "rejected_trade_record_failed",
                error=str(exc),
                reason=reason,
            )
