"""Initial schema — 7 tables for the BTC trading bot.

Revision ID: 001
Create Date: 2026-05-15
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSON, UUID

revision = "001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- tb_bot_state (singleton) ---
    op.create_table(
        "tb_bot_state",
        sa.Column("id", sa.Integer(), primary_key=True, default=1),
        sa.Column("trading_mode", sa.String(10), nullable=False, server_default="paper"),
        sa.Column("is_halted", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("halt_reason", sa.Text(), nullable=True),
        sa.Column("halted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("paper_balance", sa.Numeric(20, 8), nullable=False, server_default="10000"),
        sa.Column("live_balance", sa.Numeric(20, 8), nullable=True),
        sa.Column("last_heartbeat", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("current_regime", sa.String(20), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "trading_mode IN ('paper', 'live')",
            name="ck_bot_state_trading_mode",
        ),
        sa.CheckConstraint(
            "current_regime IN ('trending_up', 'trending_down', 'ranging', 'choppy') "
            "OR current_regime IS NULL",
            name="ck_bot_state_regime",
        ),
    )

    # --- tb_trades ---
    op.create_table(
        "tb_trades",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("strategy", sa.String(50), nullable=False),
        sa.Column("direction", sa.String(5), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="signal"),
        sa.Column("regime", sa.String(20), nullable=True),
        sa.Column("signal_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("entry_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("stop_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("target_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("exit_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("trailing_stop", sa.Numeric(20, 2), nullable=True),
        sa.Column("position_size", sa.Numeric(20, 8), nullable=True),
        sa.Column("position_value", sa.Numeric(20, 2), nullable=True),
        sa.Column("margin_used", sa.Numeric(20, 2), nullable=True),
        sa.Column("risk_amount", sa.Numeric(20, 2), nullable=True),
        sa.Column("risk_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("rr_ratio", sa.Numeric(5, 2), nullable=True),
        sa.Column("realized_pnl", sa.Numeric(20, 4), nullable=True),
        sa.Column("fees_paid", sa.Numeric(20, 4), nullable=True),
        sa.Column("funding_paid", sa.Numeric(20, 4), nullable=True),
        sa.Column("net_pnl", sa.Numeric(20, 4), nullable=True),
        sa.Column("r_multiple", sa.Numeric(5, 2), nullable=True),
        sa.Column("entry_order_id", sa.String(100), nullable=True),
        sa.Column("stop_order_id", sa.String(100), nullable=True),
        sa.Column("target_order_id", sa.String(100), nullable=True),
        sa.Column("reject_reason", sa.Text(), nullable=True),
        sa.Column("indicators_snapshot", JSON, nullable=True),
        sa.Column("signal_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("entry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("exit_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint(
            "direction IN ('long', 'short')",
            name="ck_trades_direction",
        ),
        sa.CheckConstraint(
            "status IN ('signal', 'entry_pending', 'open', 'trailing', "
            "'stopped', 'target', 'closed', 'rejected', 'cancelled')",
            name="ck_trades_status",
        ),
        sa.CheckConstraint(
            "strategy IN ('ema_trend', 'bb_rsi_reversion')",
            name="ck_trades_strategy",
        ),
    )
    op.create_index("ix_trades_status", "tb_trades", ["status"])
    op.create_index("ix_trades_strategy", "tb_trades", ["strategy"])
    op.create_index("ix_trades_created_at", "tb_trades", ["created_at"])
    op.create_index("ix_trades_signal_at", "tb_trades", ["signal_at"])

    # --- tb_trade_events ---
    op.create_table(
        "tb_trade_events",
        sa.Column("id", UUID(as_uuid=False), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("trade_id", UUID(as_uuid=False), sa.ForeignKey("tb_trades.id", ondelete="CASCADE"), nullable=False),
        sa.Column("from_status", sa.String(20), nullable=True),
        sa.Column("to_status", sa.String(20), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("metadata", JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_trade_events_trade_id", "tb_trade_events", ["trade_id"])
    op.create_index("ix_trade_events_created_at", "tb_trade_events", ["created_at"])

    # --- tb_balance_history ---
    op.create_table(
        "tb_balance_history",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("timestamp", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("equity", sa.Numeric(20, 2), nullable=False),
        sa.Column("cash_balance", sa.Numeric(20, 2), nullable=False),
        sa.Column("unrealized_pnl", sa.Numeric(20, 2), server_default="0"),
        sa.Column("open_positions", sa.Integer(), server_default="0"),
        sa.Column("portfolio_heat", sa.Numeric(5, 2), server_default="0"),
        sa.Column("drawdown_pct", sa.Numeric(5, 2), server_default="0"),
    )
    op.create_index("ix_balance_history_timestamp", "tb_balance_history", ["timestamp"])

    # --- tb_circuit_breakers ---
    op.create_table(
        "tb_circuit_breakers",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("period", sa.String(10), nullable=False),
        sa.Column("period_start", sa.DateTime(timezone=True), nullable=False),
        sa.Column("starting_equity", sa.Numeric(20, 2), nullable=False),
        sa.Column("current_equity", sa.Numeric(20, 2), nullable=False),
        sa.Column("drawdown_pct", sa.Numeric(5, 2), server_default="0"),
        sa.Column("threshold_pct", sa.Numeric(5, 2), nullable=False),
        sa.Column("is_tripped", sa.Boolean(), server_default="false"),
        sa.Column("tripped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resets_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_circuit_breakers_period", "tb_circuit_breakers", ["period"])
    op.create_index("ix_circuit_breakers_is_tripped", "tb_circuit_breakers", ["is_tripped"])

    # --- tb_candles ---
    op.create_table(
        "tb_candles",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("symbol", sa.String(30), nullable=False, server_default="BTC-PERP-INTX"),
        sa.Column("timeframe", sa.String(5), nullable=False),
        sa.Column("open_time", sa.DateTime(timezone=True), nullable=False),
        sa.Column("open", sa.Numeric(20, 2), nullable=False),
        sa.Column("high", sa.Numeric(20, 2), nullable=False),
        sa.Column("low", sa.Numeric(20, 2), nullable=False),
        sa.Column("close", sa.Numeric(20, 2), nullable=False),
        sa.Column("volume", sa.Numeric(30, 8), nullable=False),
        sa.UniqueConstraint("symbol", "timeframe", "open_time", name="uq_candle_identity"),
    )
    op.create_index(
        "ix_candles_symbol_timeframe_open_time",
        "tb_candles",
        ["symbol", "timeframe", "open_time"],
    )

    # --- tb_bot_log ---
    op.create_table(
        "tb_bot_log",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("level", sa.String(10), nullable=False, server_default="info"),
        sa.Column("component", sa.String(50), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("metadata", JSON, nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_bot_log_created_at", "tb_bot_log", ["created_at"])
    op.create_index("ix_bot_log_level", "tb_bot_log", ["level"])
    op.create_index("ix_bot_log_component", "tb_bot_log", ["component"])

    # Seed the bot_state singleton
    op.execute(
        "INSERT INTO tb_bot_state (id, trading_mode, is_halted, paper_balance) "
        "VALUES (1, 'paper', false, 10000.0) "
        "ON CONFLICT (id) DO NOTHING"
    )


def downgrade() -> None:
    op.drop_table("tb_bot_log")
    op.drop_table("tb_candles")
    op.drop_table("tb_circuit_breakers")
    op.drop_table("tb_balance_history")
    op.drop_table("tb_trade_events")
    op.drop_table("tb_trades")
    op.drop_table("tb_bot_state")
