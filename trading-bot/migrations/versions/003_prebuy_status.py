"""Add prebuy_status column to tb3_grid_state for idempotent pre-buy recovery.

Without this, a market order that partial-fills + crash leaves the bot
permanently underweighted: on restart, qty > 0 makes the existing check
think pre-buy is done. With prebuy_status:
  - 'pending'  → set before placing the market order
  - 'partial'  → set if fill was < intended size
  - 'complete' → set on full fill
  - 'failed'   → set on order rejection
On restart we resume if status in (NULL, 'pending', 'partial').

Revision ID: 003
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # New column; nullable to preserve existing seeded row from migration 002
    op.add_column(
        "tb3_grid_state",
        sa.Column("prebuy_status", sa.String(20), nullable=True),
    )
    op.create_check_constraint(
        "ck_grid_state_prebuy_status",
        "tb3_grid_state",
        "prebuy_status IS NULL OR prebuy_status IN "
        "('pending', 'partial', 'complete', 'failed')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_grid_state_prebuy_status", "tb3_grid_state", type_="check"
    )
    op.drop_column("tb3_grid_state", "prebuy_status")
