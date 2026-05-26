"""
SQLAlchemy 2.0 ORM models for the Bitcoin trading bot.

All tables are prefixed with ``tb_`` to avoid collisions with reserved words.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSON, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


def _utcnow() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


# ---------------------------------------------------------------------------
# tb_bot_state  (singleton -- id is always 1)
# ---------------------------------------------------------------------------
class BotState(Base):
    __tablename__ = "tb_bot_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    trading_mode: Mapped[str] = mapped_column(
        String(10),
        default="paper",
    )
    is_halted: Mapped[bool] = mapped_column(Boolean, default=False)
    halt_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    halted_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    paper_balance: Mapped[float] = mapped_column(
        Numeric(20, 8), default=10000.0
    )
    live_balance: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    last_heartbeat: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    current_regime: Mapped[Optional[str]] = mapped_column(
        String(20), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (
        CheckConstraint(
            "trading_mode IN ('paper', 'live')",
            name="ck_bot_state_trading_mode",
        ),
        CheckConstraint(
            "current_regime IN ('trending_up', 'trending_down', 'ranging', 'choppy')"
            " OR current_regime IS NULL",
            name="ck_bot_state_regime",
        ),
    )


# ---------------------------------------------------------------------------
# tb_trades
# ---------------------------------------------------------------------------
_VALID_STATUSES = (
    "signal",
    "entry_pending",
    "open",
    "trailing",
    "stopped",
    "target",
    "closed",
    "rejected",
    "cancelled",
)


class Trade(Base):
    __tablename__ = "tb_trades"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    strategy: Mapped[str] = mapped_column(String(50), nullable=False)
    direction: Mapped[str] = mapped_column(String(5), nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default="signal"
    )
    regime: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # --- Prices ---
    signal_price: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    entry_price: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    stop_price: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    target_price: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    exit_price: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    trailing_stop: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )

    # --- Position sizing ---
    position_size: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 8), nullable=True
    )
    position_value: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    margin_used: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )

    # --- Risk ---
    risk_amount: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 2), nullable=True
    )
    risk_pct: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), nullable=True
    )
    rr_ratio: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), nullable=True
    )

    # --- PnL ---
    realized_pnl: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 4), nullable=True
    )
    fees_paid: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 4), nullable=True
    )
    funding_paid: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 4), nullable=True
    )
    net_pnl: Mapped[Optional[float]] = mapped_column(
        Numeric(20, 4), nullable=True
    )
    r_multiple: Mapped[Optional[float]] = mapped_column(
        Numeric(5, 2), nullable=True
    )

    # --- Exchange order IDs ---
    entry_order_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    stop_order_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )
    target_order_id: Mapped[Optional[str]] = mapped_column(
        String(100), nullable=True
    )

    reject_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    indicators_snapshot: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)

    # --- Timestamps ---
    signal_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    entry_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    exit_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    # --- Relationships ---
    events: Mapped[list["TradeEvent"]] = relationship(
        back_populates="trade", cascade="all, delete-orphan"
    )

    __table_args__ = (
        CheckConstraint(
            "direction IN ('long', 'short')",
            name="ck_trades_direction",
        ),
        CheckConstraint(
            "status IN ("
            + ", ".join(f"'{s}'" for s in _VALID_STATUSES)
            + ")",
            name="ck_trades_status",
        ),
        CheckConstraint(
            "strategy IN ('ema_trend', 'bb_rsi_reversion')",
            name="ck_trades_strategy",
        ),
        Index("ix_trades_status", "status"),
        Index("ix_trades_strategy", "strategy"),
        Index("ix_trades_created_at", "created_at"),
        Index("ix_trades_signal_at", "signal_at"),
    )


# ---------------------------------------------------------------------------
# tb_trade_events  (audit trail)
# ---------------------------------------------------------------------------
class TradeEvent(Base):
    __tablename__ = "tb_trade_events"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    trade_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("tb_trades.id", ondelete="CASCADE"),
        nullable=False,
    )
    from_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    # --- Relationships ---
    trade: Mapped["Trade"] = relationship(back_populates="events")

    __table_args__ = (
        Index("ix_trade_events_trade_id", "trade_id"),
        Index("ix_trade_events_created_at", "created_at"),
    )


# ---------------------------------------------------------------------------
# tb_balance_history
# ---------------------------------------------------------------------------
class BalanceHistory(Base):
    __tablename__ = "tb_balance_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    equity: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    cash_balance: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    unrealized_pnl: Mapped[float] = mapped_column(Numeric(20, 2), default=0)
    open_positions: Mapped[int] = mapped_column(Integer, default=0)
    portfolio_heat: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    drawdown_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0)

    __table_args__ = (
        Index("ix_balance_history_timestamp", "timestamp"),
    )


# ---------------------------------------------------------------------------
# tb_circuit_breakers
# ---------------------------------------------------------------------------
class CircuitBreaker(Base):
    __tablename__ = "tb_circuit_breakers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    period: Mapped[str] = mapped_column(String(10), nullable=False)
    period_start: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    starting_equity: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    current_equity: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    drawdown_pct: Mapped[float] = mapped_column(Numeric(5, 2), default=0)
    threshold_pct: Mapped[float] = mapped_column(Numeric(5, 2), nullable=False)
    is_tripped: Mapped[bool] = mapped_column(Boolean, default=False)
    tripped_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    resets_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    __table_args__ = (
        Index("ix_circuit_breakers_period", "period"),
        Index("ix_circuit_breakers_is_tripped", "is_tripped"),
    )


# ---------------------------------------------------------------------------
# tb_candles
# ---------------------------------------------------------------------------
class Candle(Base):
    __tablename__ = "tb_candles"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    symbol: Mapped[str] = mapped_column(String(30), default="BTC-PERP-INTX")
    timeframe: Mapped[str] = mapped_column(String(5), nullable=False)
    open_time: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    open: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    high: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    low: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    close: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    volume: Mapped[float] = mapped_column(Numeric(30, 8), nullable=False)

    __table_args__ = (
        UniqueConstraint(
            "symbol", "timeframe", "open_time", name="uq_candle_identity"
        ),
        Index("ix_candles_symbol_timeframe_open_time", "symbol", "timeframe", "open_time"),
    )


# ---------------------------------------------------------------------------
# tb_bot_log
# ---------------------------------------------------------------------------
class BotLog(Base):
    __tablename__ = "tb_bot_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    level: Mapped[str] = mapped_column(String(10), default="info")
    component: Mapped[str] = mapped_column(String(50), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_: Mapped[Optional[dict]] = mapped_column(
        "metadata", JSON, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    __table_args__ = (
        Index("ix_bot_log_created_at", "created_at"),
        Index("ix_bot_log_level", "level"),
        Index("ix_bot_log_component", "component"),
    )


# ═══════════════════════════════════════════════════════════════════════════
# v3 GRID TRADER TABLES (tb3_*)
# ───────────────────────────────────────────────────────────────────────────
# Added 2026-05-21 for the lean-long hybrid grid trader. Coexists with the
# v1 tb_* tables. v3 doesn't write to tb_trades (different lifecycle) but
# DOES share tb_balance_history (equity curve) and tb_bot_log.
# ═══════════════════════════════════════════════════════════════════════════


# ---------------------------------------------------------------------------
# tb3_grid_state  (singleton -- id is always 1)
# ---------------------------------------------------------------------------
class GridState(Base):
    """Singleton row tracking the active grid: range, levels, inventory.

    Updated by:
      - grid_strategy on recenter (range_*, num_levels, last_recenter_at)
      - grid_order_manager on pre-buy (prebuy_qty, prebuy_avg_price, prebuy_at)
      - grid_position_manager on every fill (inventory_qty, inventory_avg_cost,
        realized_pnl_total, fees_paid_total)
    """
    __tablename__ = "tb3_grid_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    symbol: Mapped[str] = mapped_column(String(30), default="BTC-PERP-INTX")

    # Pre-buy snapshot (set once on first deploy)
    # prebuy_qty: how much BTC was actually filled (may be < intended if partial)
    # prebuy_avg_price: weighted avg fill price of the pre-buy market order
    # prebuy_at: timestamp of the pre-buy completion (or the latest top-up)
    # prebuy_status: lifecycle marker for idempotent recovery on restart
    #   NULL → never attempted; 'pending' → market order in flight;
    #   'partial' → underfilled, needs top-up; 'complete' → done;
    #   'failed' → terminal failure, bot should be halted
    prebuy_qty: Mapped[Optional[float]] = mapped_column(Numeric(20, 8), nullable=True)
    prebuy_avg_price: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    prebuy_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    prebuy_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)

    # Active grid range + level config
    current_range_low: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    current_range_high: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    num_levels: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    capital_per_level: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)

    # Recenter timing
    last_recenter_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    next_recenter_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    # Live inventory (updates on every fill)
    inventory_qty: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    inventory_avg_cost: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)

    # Lifetime stats
    realized_pnl_total: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    fees_paid_total: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    n_buy_fills: Mapped[int] = mapped_column(Integer, default=0)
    n_sell_fills: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )


# ---------------------------------------------------------------------------
# tb3_active_orders
# ---------------------------------------------------------------------------
_GRID_ORDER_STATUSES = ("open", "filled", "cancelled", "failed", "expired")


class GridActiveOrder(Base):
    """One row per limit order placed on the exchange.

    Lifecycle:
      open → filled (price hit, fill recorded in tb3_grid_fills)
      open → cancelled (manually cancelled — re-anchor, stale, range exit)
      open → failed (exchange rejected at placement time, no fill)
      open → expired (Coinbase post-only rejection, cancelled by exchange)

    Note: 'filled' rows are also represented in tb3_grid_fills with full
    fill details. This table just tracks order existence; fills table is
    the authoritative log of executions.
    """
    __tablename__ = "tb3_active_orders"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    exchange_order_id: Mapped[str] = mapped_column(String(100), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)  # 'buy' | 'sell'
    level_index: Mapped[int] = mapped_column(Integer, nullable=False)
    level_price: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    qty: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="open")
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )
    filled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    cancelled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    last_polled_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    fill_price: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    fill_qty: Mapped[Optional[float]] = mapped_column(Numeric(20, 8), nullable=True)
    fee_paid: Mapped[Optional[float]] = mapped_column(Numeric(20, 4), nullable=True)

    __table_args__ = (
        UniqueConstraint("exchange_order_id", name="uq_grid_active_orders_exch_id"),
        CheckConstraint("side IN ('buy', 'sell')", name="ck_grid_active_orders_side"),
        CheckConstraint(
            "status IN ('open', 'filled', 'cancelled', 'failed', 'expired')",
            name="ck_grid_active_orders_status",
        ),
        Index("ix_grid_active_orders_status", "status"),
        Index("ix_grid_active_orders_level", "level_index"),
        Index("ix_grid_active_orders_created_at", "created_at"),
    )


# ---------------------------------------------------------------------------
# tb3_grid_fills  (every fill = one row)
# ---------------------------------------------------------------------------
class GridFill(Base):
    """Authoritative log of every grid fill.

    Buys: add to position; realized_pnl is 0 (no offsetting sell yet).
    Sells: reduce position; realized_pnl = fill_qty × (fill_price - avg_cost_at_fill)
    All exchange fees recorded against the fill.

    Snapshots inventory state AFTER the fill for forensic reconstruction.
    """
    __tablename__ = "tb3_grid_fills"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    active_order_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("tb3_active_orders.id", ondelete="SET NULL"),
        nullable=True,
    )
    exchange_order_id: Mapped[str] = mapped_column(String(100), nullable=False)
    side: Mapped[str] = mapped_column(String(4), nullable=False)
    level_index: Mapped[int] = mapped_column(Integer, nullable=False)
    fill_price: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    fill_qty: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    fee_paid: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    realized_pnl: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    # Inventory snapshot AFTER this fill (forensic)
    inventory_after_qty: Mapped[float] = mapped_column(Numeric(20, 8), nullable=False)
    inventory_after_avg_cost: Mapped[float] = mapped_column(Numeric(20, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    __table_args__ = (
        CheckConstraint("side IN ('buy', 'sell')", name="ck_grid_fills_side"),
        Index("ix_grid_fills_created_at", "created_at"),
        Index("ix_grid_fills_exchange_order", "exchange_order_id"),
    )


# ---------------------------------------------------------------------------
# tb3_grid_metrics  (daily aggregates for dashboard / analysis)
# ---------------------------------------------------------------------------
class GridDailyMetric(Base):
    """One row per UTC day with grid trading aggregates.

    Used by dashboard for daily-fills bar chart + cumulative P&L. Computed
    by a scheduled job (end-of-day rollup) from tb3_grid_fills.
    """
    __tablename__ = "tb3_grid_metrics"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    n_buy_fills: Mapped[int] = mapped_column(Integer, default=0)
    n_sell_fills: Mapped[int] = mapped_column(Integer, default=0)
    gross_realized_pnl: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    fees_paid: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    net_pnl: Mapped[float] = mapped_column(Numeric(20, 4), default=0)
    inventory_end_qty: Mapped[Optional[float]] = mapped_column(Numeric(20, 8), nullable=True)
    inventory_end_avg_cost: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    equity_end: Mapped[Optional[float]] = mapped_column(Numeric(20, 2), nullable=True)
    drawdown_pct: Mapped[Optional[float]] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow
    )

    __table_args__ = (
        UniqueConstraint("date", name="uq_grid_metrics_date"),
        Index("ix_grid_metrics_date", "date"),
    )
