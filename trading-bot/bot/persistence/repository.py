"""
Async CRUD operations for the trading bot database.
"""

from datetime import datetime, timezone
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

    async def get_daily_pnl(self) -> float:
        """Sum of net_pnl for trades closed today (UTC)."""
        async with self.session_factory() as session:
            today_start = _utcnow().replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            result = await session.execute(
                select(func.coalesce(func.sum(Trade.net_pnl), 0)).where(
                    Trade.status.in_(["stopped", "target", "closed"]),
                    Trade.exit_at >= today_start,
                )
            )
            val = result.scalar_one()
            return float(val)

    async def get_peak_equity(self) -> float:
        """Highest equity ever recorded in balance history."""
        async with self.session_factory() as session:
            result = await session.execute(
                select(func.coalesce(func.max(BalanceHistory.equity), 0))
            )
            val = result.scalar_one()
            return float(val)
