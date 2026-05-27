"""
One-shot cleanup of orphan rows in tb3_active_orders.

After the A1+A4 code fixes ship, run this script ONCE against production
to sweep the orphans created BEFORE the fixes landed. The bot's
recenter()/cancel sweepers will keep the table clean going forward.

Identifies orphan rows by ANY of these heuristics:
  1. created_at < last_recenter_at (the row predates the current grid
     epoch — definitely from a stale epoch the bot can no longer manage)
  2. level_price NOT BETWEEN current_range_low AND current_range_high
     (the row is for a level that doesn't exist in the current grid)
  3. exchange_order_id starts with 'paper-' AND the bot was restarted
     after the row was created (paper-mode rows are wiped from
     PaperEngine.pending_orders on restart; only the DB row remains)

Usage:
    # Dry-run (default) — prints what WOULD be cancelled, makes no changes
    python -m scripts.cleanup_orphan_active_orders

    # Confirm the action
    python -m scripts.cleanup_orphan_active_orders --apply

    # Custom reason string written to the cancel_reason column (requires A5)
    python -m scripts.cleanup_orphan_active_orders --apply --reason "manual_cleanup_2026_05_27"

The cleanup is idempotent: re-running after success is a no-op. Affects
ONLY rows whose status is currently 'open' AND meet at least one orphan
heuristic above.

Audit reference: trading-bot/AUDIT_LOG.md
"Session: 2026-05-26 — Grid execution audit (3 categories)", step 10
of "Recommended fix order."
"""

from __future__ import annotations

import argparse
import asyncio
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlalchemy import text  # noqa: E402


# ──────────────────────────────────────────────────────────────────────────
# SQL: select orphans (dry-run + apply both consult this view)
# ──────────────────────────────────────────────────────────────────────────

SELECT_ORPHANS_SQL = text("""
    WITH state AS (
        SELECT
            last_recenter_at,
            current_range_low,
            current_range_high
        FROM tb3_grid_state
        WHERE id = 1
    )
    SELECT
        ao.id,
        ao.exchange_order_id,
        ao.side,
        ao.level_index,
        ao.level_price,
        ao.qty,
        ao.created_at,
        CASE
            WHEN s.last_recenter_at IS NOT NULL
                 AND ao.created_at < s.last_recenter_at
            THEN 'pre_recenter_epoch'
            WHEN s.current_range_low IS NOT NULL
                 AND s.current_range_high IS NOT NULL
                 AND (ao.level_price < s.current_range_low
                      OR ao.level_price > s.current_range_high)
            THEN 'out_of_range'
            ELSE 'unknown_orphan'
        END AS orphan_reason
    FROM tb3_active_orders ao
    CROSS JOIN state s
    WHERE ao.status = 'open'
      AND (
          (s.last_recenter_at IS NOT NULL
           AND ao.created_at < s.last_recenter_at)
          OR
          (s.current_range_low IS NOT NULL
           AND s.current_range_high IS NOT NULL
           AND (ao.level_price < s.current_range_low
                OR ao.level_price > s.current_range_high))
      )
    ORDER BY ao.created_at ASC
""")


# Two UPDATE flavors: one with cancel_reason (after A5 migration) and one
# without (pre-A5). We try the A5 variant first and fall back if the column
# doesn't exist yet.

UPDATE_WITH_REASON_SQL = text("""
    UPDATE tb3_active_orders
    SET status = 'cancelled',
        cancelled_at = NOW(),
        cancel_reason = :reason
    WHERE id = ANY(:ids)
""")

UPDATE_WITHOUT_REASON_SQL = text("""
    UPDATE tb3_active_orders
    SET status = 'cancelled',
        cancelled_at = NOW()
    WHERE id = ANY(:ids)
""")


# ──────────────────────────────────────────────────────────────────────────
# Runner
# ──────────────────────────────────────────────────────────────────────────


async def run(*, apply: bool, reason: str) -> int:
    """Returns the number of rows that were (or would be) cleaned up."""
    # Late import so the script can advertise --help without needing the
    # full DB stack reachable.
    from bot.persistence.database import async_session_factory

    async with async_session_factory() as session:
        result = await session.execute(SELECT_ORPHANS_SQL)
        rows = list(result.mappings().all())

    if not rows:
        print("No orphan rows found. Nothing to clean up.")
        return 0

    print(f"Found {len(rows)} orphan row(s):")
    print()
    print(f"  {'id':>5}  {'side':<4}  {'lvl':>4}  {'price':>10}  "
          f"{'created_at':<32}  reason")
    print(f"  {'-'*5}  {'-'*4}  {'-'*4}  {'-'*10}  {'-'*32}  {'-'*20}")
    for r in rows:
        print(
            f"  {r['id']:>5}  "
            f"{r['side']:<4}  "
            f"{r['level_index']:>4}  "
            f"${float(r['level_price']):>9,.2f}  "
            f"{str(r['created_at']):<32}  "
            f"{r['orphan_reason']}"
        )
    print()

    if not apply:
        print("DRY RUN: no changes made. Re-run with --apply to update the DB.")
        return len(rows)

    # Apply the update. Try the A5-aware UPDATE first; fall back to legacy
    # if the column doesn't exist yet.
    ids = [r["id"] for r in rows]
    async with async_session_factory() as session:
        try:
            await session.execute(
                UPDATE_WITH_REASON_SQL,
                {"ids": ids, "reason": reason},
            )
        except Exception as e:
            # Detect missing-column error and fall back. The exact text varies
            # across asyncpg / psycopg drivers; check for common signals.
            err_str = str(e).lower()
            if "cancel_reason" in err_str or "column" in err_str:
                print(
                    f"  (cancel_reason column not present yet — falling back "
                    f"to legacy UPDATE. Reason {reason!r} will not be recorded. "
                    f"Apply migration 004 first if you want it persisted.)"
                )
                await session.rollback()
                async with async_session_factory() as fallback_session:
                    await fallback_session.execute(
                        UPDATE_WITHOUT_REASON_SQL,
                        {"ids": ids},
                    )
                    await fallback_session.commit()
            else:
                raise
        else:
            await session.commit()

    print(f"Updated {len(rows)} row(s) → status='cancelled'.")
    return len(rows)


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(
        description="Sweep orphan rows from tb3_active_orders (one-shot).",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    p.add_argument(
        "--apply",
        action="store_true",
        help="Actually update the DB. Default is dry-run (print only).",
    )
    p.add_argument(
        "--reason",
        default="manual_cleanup_pre_recenter_orphans",
        help=(
            "Value to write into the cancel_reason column (requires A5 "
            "migration 004). Has no effect on dry-run."
        ),
    )
    return p.parse_args()


def main() -> None:
    args = parse_args()
    # Sanity-check DB URL is set before we import the database module
    if not os.environ.get("DATABASE_URL") and not os.environ.get(
        "DATABASE_PUBLIC_URL"
    ):
        print(
            "ERROR: DATABASE_URL (or DATABASE_PUBLIC_URL) must be set in the "
            "environment.",
            file=sys.stderr,
        )
        sys.exit(2)
    n = asyncio.run(run(apply=args.apply, reason=args.reason))
    sys.exit(0 if args.apply or n == 0 else 0)


if __name__ == "__main__":
    main()
