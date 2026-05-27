"""Add cancel_reason column to tb3_active_orders for orphan-source observability.

AUDIT-FIX A5: the schema's status CHECK constraint already allows
('open', 'filled', 'cancelled', 'failed', 'expired') but the code only
uses 'open' / 'filled' / 'cancelled'. Once A1 (cancel failure_reason
handling), A2 (place-order rejection), and A3 (poll-time terminal
status) land, we'll need to distinguish:
  - 'cancelled' → bot-initiated cancel that succeeded normally
  - 'failed'    → exchange rejected at placement (A2 path)
  - 'expired'   → exchange-side terminal (Coinbase cancel / expire),
                  detected via A3's poll path or A1's terminal
                  failure_reason path

Without a `cancel_reason` column, all three look identical in queries.
With it, operators can grep
  SELECT cancel_reason, COUNT(*) FROM tb3_active_orders
  WHERE status IN ('cancelled','failed','expired')
  GROUP BY cancel_reason
to see the orphan-source distribution.

The column is nullable so pre-existing rows are unaffected. New
code paths populate it; legacy `mark_order_cancelled` calls without
a reason continue to work.

Revision ID: 004
Create Date: 2026-05-26
"""

from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "tb3_active_orders",
        sa.Column("cancel_reason", sa.String(50), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("tb3_active_orders", "cancel_reason")
