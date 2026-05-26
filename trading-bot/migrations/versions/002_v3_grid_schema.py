"""v3 grid trader schema — 4 new tables for lean-long hybrid grid.

Adds: tb3_grid_state (singleton), tb3_active_orders, tb3_grid_fills,
tb3_grid_metrics. Coexists with v1 tb_* tables; v3 keeps the same equity
curve (tb_balance_history) and log table (tb_bot_log).

Revision ID: 002
Create Date: 2026-05-21
"""

from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- tb3_grid_state (singleton, id=1) ---
    op.create_table(
        "tb3_grid_state",
        sa.Column("id", sa.Integer(), primary_key=True, server_default="1"),
        sa.Column("symbol", sa.String(30), nullable=False, server_default="BTC-PERP-INTX"),
        # Pre-buy snapshot
        sa.Column("prebuy_qty", sa.Numeric(20, 8), nullable=True),
        sa.Column("prebuy_avg_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("prebuy_at", sa.DateTime(timezone=True), nullable=True),
        # Active grid range + level config
        sa.Column("current_range_low", sa.Numeric(20, 2), nullable=True),
        sa.Column("current_range_high", sa.Numeric(20, 2), nullable=True),
        sa.Column("num_levels", sa.Integer(), nullable=True),
        sa.Column("capital_per_level", sa.Numeric(20, 2), nullable=True),
        # Recenter timing
        sa.Column("last_recenter_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("next_recenter_at", sa.DateTime(timezone=True), nullable=True),
        # Live inventory (updated by grid_position_manager on every fill)
        sa.Column("inventory_qty", sa.Numeric(20, 8), nullable=False, server_default="0"),
        sa.Column("inventory_avg_cost", sa.Numeric(20, 2), nullable=True),
        # Lifetime stats
        sa.Column("realized_pnl_total", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("fees_paid_total", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("n_buy_fills", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("n_sell_fills", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    # Seed singleton row so updates always succeed
    op.execute(
        "INSERT INTO tb3_grid_state (id, symbol) "
        "VALUES (1, 'BTC-PERP-INTX') "
        "ON CONFLICT (id) DO NOTHING"
    )

    # --- tb3_active_orders ---
    op.create_table(
        "tb3_active_orders",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("exchange_order_id", sa.String(100), nullable=False),
        sa.Column("side", sa.String(4), nullable=False),
        sa.Column("level_index", sa.Integer(), nullable=False),
        sa.Column("level_price", sa.Numeric(20, 2), nullable=False),
        sa.Column("qty", sa.Numeric(20, 8), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="open"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("filled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_polled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fill_price", sa.Numeric(20, 2), nullable=True),
        sa.Column("fill_qty", sa.Numeric(20, 8), nullable=True),
        sa.Column("fee_paid", sa.Numeric(20, 4), nullable=True),
        sa.UniqueConstraint("exchange_order_id", name="uq_grid_active_orders_exch_id"),
        sa.CheckConstraint(
            "side IN ('buy', 'sell')",
            name="ck_grid_active_orders_side",
        ),
        sa.CheckConstraint(
            "status IN ('open', 'filled', 'cancelled', 'failed', 'expired')",
            name="ck_grid_active_orders_status",
        ),
    )
    op.create_index("ix_grid_active_orders_status", "tb3_active_orders", ["status"])
    op.create_index("ix_grid_active_orders_level", "tb3_active_orders", ["level_index"])
    op.create_index("ix_grid_active_orders_created_at", "tb3_active_orders", ["created_at"])

    # --- tb3_grid_fills ---
    op.create_table(
        "tb3_grid_fills",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "active_order_id",
            sa.Integer(),
            sa.ForeignKey("tb3_active_orders.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("exchange_order_id", sa.String(100), nullable=False),
        sa.Column("side", sa.String(4), nullable=False),
        sa.Column("level_index", sa.Integer(), nullable=False),
        sa.Column("fill_price", sa.Numeric(20, 2), nullable=False),
        sa.Column("fill_qty", sa.Numeric(20, 8), nullable=False),
        sa.Column("fee_paid", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("realized_pnl", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("inventory_after_qty", sa.Numeric(20, 8), nullable=False),
        sa.Column("inventory_after_avg_cost", sa.Numeric(20, 2), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("side IN ('buy', 'sell')", name="ck_grid_fills_side"),
    )
    op.create_index("ix_grid_fills_created_at", "tb3_grid_fills", ["created_at"])
    op.create_index("ix_grid_fills_exchange_order", "tb3_grid_fills", ["exchange_order_id"])

    # --- tb3_grid_metrics (daily aggregates) ---
    op.create_table(
        "tb3_grid_metrics",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("date", sa.DateTime(timezone=True), nullable=False),
        sa.Column("n_buy_fills", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("n_sell_fills", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("gross_realized_pnl", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("fees_paid", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("net_pnl", sa.Numeric(20, 4), nullable=False, server_default="0"),
        sa.Column("inventory_end_qty", sa.Numeric(20, 8), nullable=True),
        sa.Column("inventory_end_avg_cost", sa.Numeric(20, 2), nullable=True),
        sa.Column("equity_end", sa.Numeric(20, 2), nullable=True),
        sa.Column("drawdown_pct", sa.Numeric(5, 2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("date", name="uq_grid_metrics_date"),
    )
    op.create_index("ix_grid_metrics_date", "tb3_grid_metrics", ["date"])


def downgrade() -> None:
    op.drop_table("tb3_grid_metrics")
    op.drop_table("tb3_grid_fills")
    op.drop_table("tb3_active_orders")
    op.drop_table("tb3_grid_state")
