"""
Async CRUD operations for the trading bot database.
"""

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from typing import Optional

from sqlalchemy import delete, desc, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import async_sessionmaker

from bot.persistence.models import (
    BalanceHistory,
    BotLog,
    BotState,
    Candle,
    CircuitBreaker,
    GridActiveOrder,
    GridDailyMetric,
    GridFill,
    GridState,
    Trade,
    TradeEvent,
)


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Repository:
    """Thin async data-access layer over SQLAlchemy models."""

    def __init__(self, session_factory: async_sessionmaker):
        self.session_factory = session_factory

    # ------------------------------------------------------------------
    # Bot state (singleton row, id=1)
    # ------------------------------------------------------------------

    async def get_bot_state(self) -> BotState:
        """Return the singleton bot-state row, creating it if absent."""
        async with self.session_factory() as session:
            result = await session.execute(
                select(BotState).where(BotState.id == 1)
            )
            state = result.scalar_one_or_none()
            if state is None:
                state = BotState(id=1)
                session.add(state)
                await session.commit()
                await session.refresh(state)
            return state

    async def update_bot_state(self, **kwargs) -> None:
        """Update arbitrary columns on the singleton state row."""
        kwargs["updated_at"] = _utcnow()
        async with self.session_factory() as session:
            await session.execute(
                update(BotState).where(BotState.id == 1).values(**kwargs)
            )
            await session.commit()

    async def update_heartbeat(self) -> None:
        """Touch last_heartbeat to signal liveness."""
        await self.update_bot_state(last_heartbeat=_utcnow())

    # ------------------------------------------------------------------
    # Trades
    # ------------------------------------------------------------------

    async def create_trade(self, trade_data: dict) -> Trade:
        """Insert a new trade row and return the ORM instance."""
        async with self.session_factory() as session:
            trade = Trade(**trade_data)
            session.add(trade)
            await session.commit()
            await session.refresh(trade)
            return trade

    async def get_trade(self, trade_id: str) -> Optional[Trade]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(Trade).where(Trade.id == trade_id)
            )
            return result.scalar_one_or_none()

    async def get_open_trades(self) -> list[Trade]:
        """Return trades with status in (open, trailing, entry_pending)."""
        return await self.get_trades_by_status(
            ["open", "trailing", "entry_pending"]
        )

    async def get_trades_by_status(self, statuses: list[str]) -> list[Trade]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(Trade)
                .where(Trade.status.in_(statuses))
                .order_by(Trade.created_at.desc())
            )
            return list(result.scalars().all())

    async def update_trade(self, trade_id: str, **kwargs) -> None:
        kwargs["updated_at"] = _utcnow()
        async with self.session_factory() as session:
            await session.execute(
                update(Trade).where(Trade.id == trade_id).values(**kwargs)
            )
            await session.commit()

    async def get_trade_history(
        self, limit: int = 100, offset: int = 0
    ) -> list[Trade]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(Trade)
                .order_by(Trade.created_at.desc())
                .limit(limit)
                .offset(offset)
            )
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Trade events (audit trail)
    # ------------------------------------------------------------------

    async def log_trade_event(
        self,
        trade_id: str,
        from_status: Optional[str],
        to_status: str,
        reason: Optional[str] = None,
        metadata: Optional[dict] = None,
    ) -> None:
        async with self.session_factory() as session:
            event = TradeEvent(
                trade_id=trade_id,
                from_status=from_status,
                to_status=to_status,
                reason=reason,
                metadata_=metadata,
            )
            session.add(event)
            await session.commit()

    # ------------------------------------------------------------------
    # Balance history
    # ------------------------------------------------------------------

    async def record_balance(
        self,
        equity: float,
        cash: float,
        unrealized_pnl: float,
        open_positions: int,
        heat: float,
        drawdown: float,
    ) -> None:
        async with self.session_factory() as session:
            row = BalanceHistory(
                equity=equity,
                cash_balance=cash,
                unrealized_pnl=unrealized_pnl,
                open_positions=open_positions,
                portfolio_heat=heat,
                drawdown_pct=drawdown,
            )
            session.add(row)
            await session.commit()

    async def get_balance_history(
        self, limit: int = 500
    ) -> list[BalanceHistory]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(BalanceHistory)
                .order_by(BalanceHistory.timestamp.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Circuit breakers
    # ------------------------------------------------------------------

    async def get_circuit_breakers(self) -> list[CircuitBreaker]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(CircuitBreaker).order_by(CircuitBreaker.period)
            )
            return list(result.scalars().all())

    async def update_circuit_breaker(self, period: str, **kwargs) -> None:
        kwargs["updated_at"] = _utcnow()
        async with self.session_factory() as session:
            await session.execute(
                update(CircuitBreaker)
                .where(CircuitBreaker.period == period)
                .values(**kwargs)
            )
            await session.commit()

    async def init_circuit_breakers(self, starting_equity: float) -> None:
        """Seed the four circuit-breaker rows if they don't already exist."""
        breakers = [
            {"period": "daily", "threshold_pct": Decimal("-5")},
            {"period": "weekly", "threshold_pct": Decimal("-10")},
            {"period": "monthly", "threshold_pct": Decimal("-15")},
            {"period": "total", "threshold_pct": Decimal("-25")},
        ]
        now = _utcnow()
        async with self.session_factory() as session:
            existing = await session.execute(select(CircuitBreaker))
            if existing.scalars().first() is not None:
                return  # already seeded
            for b in breakers:
                session.add(
                    CircuitBreaker(
                        period=b["period"],
                        period_start=now,
                        starting_equity=starting_equity,
                        current_equity=starting_equity,
                        threshold_pct=b["threshold_pct"],
                    )
                )
            await session.commit()

    # ------------------------------------------------------------------
    # Candles
    # ------------------------------------------------------------------

    async def upsert_candles(
        self, candles: list[dict], symbol: str, timeframe: str
    ) -> None:
        """
        Bulk upsert candle rows using PostgreSQL ON CONFLICT.

        Each dict in *candles* must have keys:
        open_time, open, high, low, close, volume.
        """
        if not candles:
            return
        async with self.session_factory() as session:
            for candle in candles:
                stmt = pg_insert(Candle).values(
                    symbol=symbol,
                    timeframe=timeframe,
                    open_time=candle["open_time"],
                    open=candle["open"],
                    high=candle["high"],
                    low=candle["low"],
                    close=candle["close"],
                    volume=candle["volume"],
                )
                stmt = stmt.on_conflict_do_update(
                    constraint="uq_candle_identity",
                    set_={
                        "open": stmt.excluded.open,
                        "high": stmt.excluded.high,
                        "low": stmt.excluded.low,
                        "close": stmt.excluded.close,
                        "volume": stmt.excluded.volume,
                    },
                )
                await session.execute(stmt)
            await session.commit()

    async def get_candles(
        self, symbol: str, timeframe: str, limit: int = 200
    ) -> list[Candle]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(Candle)
                .where(Candle.symbol == symbol, Candle.timeframe == timeframe)
                .order_by(Candle.open_time.asc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def get_latest_candle_time(
        self, symbol: str, timeframe: str
    ) -> Optional[datetime]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(func.max(Candle.open_time)).where(
                    Candle.symbol == symbol, Candle.timeframe == timeframe
                )
            )
            return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # Bot log
    # ------------------------------------------------------------------

    async def log(
        self,
        level: str,
        component: str,
        message: str,
        metadata: Optional[dict] = None,
    ) -> None:
        async with self.session_factory() as session:
            session.add(
                BotLog(
                    level=level,
                    component=component,
                    message=message,
                    metadata_=metadata,
                )
            )
            await session.commit()

    async def get_logs(
        self,
        limit: int = 100,
        level: Optional[str] = None,
        component: Optional[str] = None,
    ) -> list[BotLog]:
        async with self.session_factory() as session:
            stmt = select(BotLog)
            if level is not None:
                stmt = stmt.where(BotLog.level == level)
            if component is not None:
                stmt = stmt.where(BotLog.component == component)
            stmt = stmt.order_by(BotLog.created_at.desc()).limit(limit)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    # ------------------------------------------------------------------
    # Dashboard / stats helpers
    # ------------------------------------------------------------------

    async def get_trade_stats(self) -> dict:
        """
        Compute aggregate stats for closed trades:
        win_rate, avg_r, expectancy, profit_factor, total_trades.
        """
        async with self.session_factory() as session:
            closed = (
                await session.execute(
                    select(Trade).where(
                        Trade.status.in_(["stopped", "target", "closed"])
                    )
                )
            ).scalars().all()

            total = len(closed)
            if total == 0:
                return {
                    "total_trades": 0,
                    "win_rate": 0.0,
                    "avg_r": 0.0,
                    "expectancy": 0.0,
                    "profit_factor": 0.0,
                }

            wins = [t for t in closed if (t.net_pnl or 0) > 0]
            losses = [t for t in closed if (t.net_pnl or 0) <= 0]

            win_rate = len(wins) / total * 100
            r_values = [float(t.r_multiple or 0) for t in closed]
            avg_r = sum(r_values) / total if total else 0.0

            gross_profit = sum(float(t.net_pnl or 0) for t in wins)
            gross_loss = abs(sum(float(t.net_pnl or 0) for t in losses))
            profit_factor = (
                gross_profit / gross_loss if gross_loss > 0 else float("inf")
            )

            avg_win = gross_profit / len(wins) if wins else 0.0
            avg_loss = gross_loss / len(losses) if losses else 0.0
            expectancy = (
                (win_rate / 100) * avg_win - (1 - win_rate / 100) * avg_loss
            )

            return {
                "total_trades": total,
                "win_rate": round(win_rate, 2),
                "avg_r": round(avg_r, 2),
                "expectancy": round(expectancy, 2),
                "profit_factor": round(profit_factor, 2),
            }

    async def get_daily_pnl(self, live_only: bool = False) -> float:
        """
        Sum of net_pnl for trades closed today (UTC).

        live_only=True: filters out paper-mode trades by entry_order_id prefix
        (PaperEngine prefixes all order IDs with 'paper-'). Use this in live
        mode so prior paper trades' losses don't pollute the live circuit
        breaker math.
        """
        async with self.session_factory() as session:
            today_start = _utcnow().replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            q = select(func.coalesce(func.sum(Trade.net_pnl), 0)).where(
                Trade.status.in_(["stopped", "target", "closed"]),
                Trade.exit_at >= today_start,
            )
            if live_only:
                q = q.where(~Trade.entry_order_id.like("paper-%"))
            result = await session.execute(q)
            return float(result.scalar_one())

    async def get_weekly_pnl(self, live_only: bool = False) -> float:
        """
        Sum of net_pnl for trades closed in the last 7 days (UTC).

        Rolling 7-day window so the figure doesn't reset at midnight or on
        the calendar week boundary — matches how the circuit breaker should
        actually work (continuous drawdown protection, not calendar-week).
        """
        async with self.session_factory() as session:
            week_ago = _utcnow() - timedelta(days=7)
            q = select(func.coalesce(func.sum(Trade.net_pnl), 0)).where(
                Trade.status.in_(["stopped", "target", "closed"]),
                Trade.exit_at >= week_ago,
            )
            if live_only:
                q = q.where(~Trade.entry_order_id.like("paper-%"))
            result = await session.execute(q)
            return float(result.scalar_one())

    async def get_monthly_pnl(self, live_only: bool = False) -> float:
        """Sum of net_pnl for trades closed in the last 30 days (UTC)."""
        async with self.session_factory() as session:
            month_ago = _utcnow() - timedelta(days=30)
            q = select(func.coalesce(func.sum(Trade.net_pnl), 0)).where(
                Trade.status.in_(["stopped", "target", "closed"]),
                Trade.exit_at >= month_ago,
            )
            if live_only:
                q = q.where(~Trade.entry_order_id.like("paper-%"))
            result = await session.execute(q)
            return float(result.scalar_one())

    async def get_peak_equity(self) -> float:
        """Highest equity ever recorded in balance history."""
        async with self.session_factory() as session:
            result = await session.execute(
                select(func.coalesce(func.max(BalanceHistory.equity), 0))
            )
            val = result.scalar_one()
            return float(val)

    # ══════════════════════════════════════════════════════════════════
    # v3 GRID — tb3_* CRUD
    # ══════════════════════════════════════════════════════════════════

    # ------------------------------------------------------------------
    # tb3_grid_state (singleton, id=1)
    # ------------------------------------------------------------------

    async def get_grid_state(self) -> Optional[GridState]:
        """Return the singleton grid state row, or None if not initialized.

        The migration seeds a row at install time, so this normally
        returns a row; callers should still treat None as "no state yet"
        for forward-compat.
        """
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridState).where(GridState.id == 1)
            )
            return result.scalar_one_or_none()

    async def update_grid_state(self, **kwargs) -> None:
        """Update arbitrary columns on the singleton grid state row."""
        kwargs["updated_at"] = _utcnow()
        async with self.session_factory() as session:
            await session.execute(
                update(GridState).where(GridState.id == 1).values(**kwargs)
            )
            await session.commit()

    # ------------------------------------------------------------------
    # tb3_active_orders
    # ------------------------------------------------------------------

    async def insert_active_order(
        self,
        *,
        exchange_order_id: str,
        side: str,
        level_index: int,
        level_price: float,
        qty: float,
    ) -> GridActiveOrder:
        """Record a newly-placed grid order."""
        async with self.session_factory() as session:
            order = GridActiveOrder(
                exchange_order_id=exchange_order_id,
                side=side,
                level_index=level_index,
                level_price=level_price,
                qty=qty,
                status="open",
            )
            session.add(order)
            await session.commit()
            await session.refresh(order)
            return order

    async def update_active_order(
        self,
        exchange_order_id: str,
        **kwargs,
    ) -> None:
        """Update an active order by exchange_order_id (fill, cancel, etc.)."""
        async with self.session_factory() as session:
            await session.execute(
                update(GridActiveOrder)
                .where(GridActiveOrder.exchange_order_id == exchange_order_id)
                .values(**kwargs)
            )
            await session.commit()

    async def mark_order_filled(
        self,
        *,
        exchange_order_id: str,
        fill_price: float,
        fill_qty: float,
        fee_paid: float,
    ) -> None:
        await self.update_active_order(
            exchange_order_id,
            status="filled",
            filled_at=_utcnow(),
            fill_price=fill_price,
            fill_qty=fill_qty,
            fee_paid=fee_paid,
        )

    async def mark_order_cancelled(
        self,
        exchange_order_id: str,
        *,
        reason: Optional[str] = None,
    ) -> None:
        """Mark an order as cancelled.

        AUDIT-FIX A5: accepts an optional `reason` string for orphan-source
        observability. When called from the bot-initiated cancel paths
        (recenter, out-of-range sweep, stale sweep) the reason can be
        omitted; when called from the orphan-recovery paths (terminal
        failure_reason in A1, post-only rejection in A2, exchange-side
        cancel in A3), populate it so downstream queries can split the
        orphan-source distribution.
        """
        kwargs: dict = {"status": "cancelled", "cancelled_at": _utcnow()}
        if reason is not None:
            kwargs["cancel_reason"] = reason
        await self.update_active_order(exchange_order_id, **kwargs)

    async def mark_order_failed(
        self,
        exchange_order_id: str,
        *,
        reason: str,
    ) -> None:
        """Mark an order as 'failed' — used when the exchange rejected the
        placement at submission (AUDIT-FIX A2 path).

        Use `reason` to record the new_order_failure_reason from Coinbase
        (e.g. 'INVALID_LIMIT_PRICE_POST_ONLY', 'INSUFFICIENT_FUND').
        """
        await self.update_active_order(
            exchange_order_id,
            status="failed",
            cancelled_at=_utcnow(),
            cancel_reason=reason,
        )

    async def mark_order_expired(
        self,
        exchange_order_id: str,
        *,
        reason: str,
    ) -> None:
        """Mark an order as 'expired' — used when the exchange terminated
        the order behind our back (AUDIT-FIX A1 terminal failure_reason
        and A3 poll-time terminal status both land here).

        Use `reason` to record what surfaced from the exchange
        (e.g. 'UNKNOWN_CANCEL_ORDER', 'ORDER_IS_FULLY_FILLED',
        'CANCELLED', 'EXPIRED', 'FAILED').
        """
        await self.update_active_order(
            exchange_order_id,
            status="expired",
            cancelled_at=_utcnow(),
            cancel_reason=reason,
        )

    async def get_active_orders_by_status(
        self, status: str,
    ) -> list[GridActiveOrder]:
        """Filter `tb3_active_orders` by a single status value.

        AUDIT-FIX A5: lets dashboards / scripts split orphan-source
        cohorts (e.g. `await repo.get_active_orders_by_status("failed")`
        to count placement rejections).
        """
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridActiveOrder)
                .where(GridActiveOrder.status == status)
                .order_by(GridActiveOrder.created_at.desc())
            )
            return list(result.scalars().all())

    async def get_active_order(
        self, exchange_order_id: str
    ) -> Optional[GridActiveOrder]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridActiveOrder).where(
                    GridActiveOrder.exchange_order_id == exchange_order_id
                )
            )
            return result.scalar_one_or_none()

    async def get_open_active_orders(self) -> list[GridActiveOrder]:
        """All open grid orders (status='open'), ordered by level_index."""
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridActiveOrder)
                .where(GridActiveOrder.status == "open")
                .order_by(GridActiveOrder.level_index.asc())
            )
            return list(result.scalars().all())

    async def get_stale_open_orders(
        self, max_age_minutes: int
    ) -> list[GridActiveOrder]:
        """Return open orders older than max_age_minutes."""
        cutoff = _utcnow() - timedelta(minutes=max_age_minutes)
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridActiveOrder)
                .where(
                    GridActiveOrder.status == "open",
                    GridActiveOrder.created_at < cutoff,
                )
                .order_by(GridActiveOrder.created_at.asc())
            )
            return list(result.scalars().all())

    async def get_open_orders_at_level(
        self, level_index: int, side: Optional[str] = None
    ) -> list[GridActiveOrder]:
        """Look up open orders at a specific level (and side, if given)."""
        async with self.session_factory() as session:
            stmt = select(GridActiveOrder).where(
                GridActiveOrder.status == "open",
                GridActiveOrder.level_index == level_index,
            )
            if side is not None:
                stmt = stmt.where(GridActiveOrder.side == side)
            result = await session.execute(stmt)
            return list(result.scalars().all())

    async def touch_order_polled(self, exchange_order_id: str) -> None:
        """Bump last_polled_at on an open order (for stale-poll diagnostics)."""
        await self.update_active_order(
            exchange_order_id, last_polled_at=_utcnow()
        )

    # ------------------------------------------------------------------
    # tb3_grid_fills
    # ------------------------------------------------------------------

    async def record_grid_fill(
        self,
        *,
        active_order_id: Optional[int],
        exchange_order_id: str,
        side: str,
        level_index: int,
        fill_price: float,
        fill_qty: float,
        fee_paid: float,
        realized_pnl: float,
        inventory_after_qty: float,
        inventory_after_avg_cost: float,
    ) -> GridFill:
        """Insert a fill row. Called by GridPositionManager after applying the fill."""
        async with self.session_factory() as session:
            fill = GridFill(
                active_order_id=active_order_id,
                exchange_order_id=exchange_order_id,
                side=side,
                level_index=level_index,
                fill_price=fill_price,
                fill_qty=fill_qty,
                fee_paid=fee_paid,
                realized_pnl=realized_pnl,
                inventory_after_qty=inventory_after_qty,
                inventory_after_avg_cost=inventory_after_avg_cost,
            )
            session.add(fill)
            await session.commit()
            await session.refresh(fill)
            return fill

    async def get_grid_fills_since(
        self, since: datetime, limit: int = 500
    ) -> list[GridFill]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridFill)
                .where(GridFill.created_at >= since)
                .order_by(GridFill.created_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def get_recent_grid_fills(self, limit: int = 100) -> list[GridFill]:
        async with self.session_factory() as session:
            result = await session.execute(
                select(GridFill)
                .order_by(GridFill.created_at.desc())
                .limit(limit)
            )
            return list(result.scalars().all())

    async def get_most_recent_fill_at_level(
        self, level_index: int, side: Optional[str] = None,
    ) -> Optional[GridFill]:
        """Return the newest fill at a given level (optionally filtered by side).

        Used by the pair-state cooldown logic (AUDIT-FIX C1) to detect when
        a level just filled on one side and the bot should hold off on
        re-placing same-side orders there until the matching opposite-side
        order at the adjacent level completes the round-trip.
        """
        async with self.session_factory() as session:
            stmt = select(GridFill).where(GridFill.level_index == level_index)
            if side is not None:
                stmt = stmt.where(GridFill.side == side)
            stmt = stmt.order_by(GridFill.created_at.desc()).limit(1)
            result = await session.execute(stmt)
            return result.scalar_one_or_none()

    # ------------------------------------------------------------------
    # tb3_grid_metrics (daily aggregates)
    # ------------------------------------------------------------------

    async def upsert_grid_daily_metric(
        self,
        *,
        date: datetime,
        n_buy_fills: int,
        n_sell_fills: int,
        gross_realized_pnl: float,
        fees_paid: float,
        net_pnl: float,
        inventory_end_qty: Optional[float] = None,
        inventory_end_avg_cost: Optional[float] = None,
        equity_end: Optional[float] = None,
        drawdown_pct: Optional[float] = None,
    ) -> None:
        """Upsert a daily metric row (one per UTC day)."""
        async with self.session_factory() as session:
            stmt = pg_insert(GridDailyMetric).values(
                date=date,
                n_buy_fills=n_buy_fills,
                n_sell_fills=n_sell_fills,
                gross_realized_pnl=gross_realized_pnl,
                fees_paid=fees_paid,
                net_pnl=net_pnl,
                inventory_end_qty=inventory_end_qty,
                inventory_end_avg_cost=inventory_end_avg_cost,
                equity_end=equity_end,
                drawdown_pct=drawdown_pct,
            )
            stmt = stmt.on_conflict_do_update(
                constraint="uq_grid_metrics_date",
                set_={
                    "n_buy_fills": stmt.excluded.n_buy_fills,
                    "n_sell_fills": stmt.excluded.n_sell_fills,
                    "gross_realized_pnl": stmt.excluded.gross_realized_pnl,
                    "fees_paid": stmt.excluded.fees_paid,
                    "net_pnl": stmt.excluded.net_pnl,
                    "inventory_end_qty": stmt.excluded.inventory_end_qty,
                    "inventory_end_avg_cost": stmt.excluded.inventory_end_avg_cost,
                    "equity_end": stmt.excluded.equity_end,
                    "drawdown_pct": stmt.excluded.drawdown_pct,
                },
            )
            await session.execute(stmt)
            await session.commit()

    async def get_grid_daily_metrics(
        self, days: int = 30
    ) -> list[GridDailyMetric]:
        async with self.session_factory() as session:
            cutoff = _utcnow() - timedelta(days=days)
            result = await session.execute(
                select(GridDailyMetric)
                .where(GridDailyMetric.date >= cutoff)
                .order_by(GridDailyMetric.date.desc())
            )
            return list(result.scalars().all())
