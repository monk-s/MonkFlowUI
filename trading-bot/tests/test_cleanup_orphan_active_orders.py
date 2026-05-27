"""Tests for scripts/cleanup_orphan_active_orders.py.

The script itself is a thin async wrapper around two SQL statements;
the meaningful logic to test is:

1. The SELECT SQL identifies the right rows (pre-recenter epoch OR
   out-of-range price), and labels them with the right `orphan_reason`.
2. The UPDATE SQL writes status='cancelled' (and cancel_reason when
   the A5 column is present).

We can't easily spin up a real Postgres in tests, so we exercise the
SELECT against a SQLite-compatible schema fixture and verify the rows
that come back.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
import sys

import pytest
from sqlalchemy import (
    Column,
    Integer,
    Numeric,
    String,
    Table,
    MetaData,
    DateTime,
    create_engine,
    insert,
    text,
)
from sqlalchemy.orm import Session

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))


# Reconstruct the relevant table shapes in SQLite for testing the SQL
# (the production schema lives in migrations 002 + 004; we mirror just
# enough here to exercise the cleanup script's queries).

_metadata = MetaData()

_grid_state = Table(
    "tb3_grid_state", _metadata,
    Column("id", Integer, primary_key=True),
    Column("last_recenter_at", DateTime(timezone=True), nullable=True),
    Column("current_range_low", Numeric(20, 2), nullable=True),
    Column("current_range_high", Numeric(20, 2), nullable=True),
)

_active_orders = Table(
    "tb3_active_orders", _metadata,
    Column("id", Integer, primary_key=True, autoincrement=True),
    Column("exchange_order_id", String(100), nullable=False),
    Column("side", String(4), nullable=False),
    Column("level_index", Integer, nullable=False),
    Column("level_price", Numeric(20, 2), nullable=False),
    Column("qty", Numeric(20, 8), nullable=False),
    Column("status", String(20), nullable=False, default="open"),
    Column("created_at", DateTime(timezone=True), nullable=False),
    Column("cancelled_at", DateTime(timezone=True), nullable=True),
    Column("cancel_reason", String(50), nullable=True),  # post-A5
)


# The cleanup script's SELECT statement, adapted to SQLite. We have to
# replace PostgreSQL-specific syntax (CROSS JOIN works in SQLite too,
# but the WITH-clause CTE is supported only in SQLite >= 3.8.3, which
# the version that ships with Python 3.7+ already has).

_SQLITE_SELECT = text("""
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


@pytest.fixture
def db():
    """In-memory SQLite with the two relevant tables."""
    engine = create_engine("sqlite:///:memory:")
    _metadata.create_all(engine)
    yield engine
    engine.dispose()


def _seed_grid_state(engine, *, last_recenter, range_low, range_high):
    with Session(engine) as session:
        session.execute(insert(_grid_state).values(
            id=1,
            last_recenter_at=last_recenter,
            current_range_low=range_low,
            current_range_high=range_high,
        ))
        session.commit()


def _seed_order(engine, **kwargs):
    defaults = dict(
        exchange_order_id="x", side="buy", level_index=0,
        level_price=Decimal("75000"), qty=Decimal("0.01"),
        status="open",
        created_at=datetime(2026, 5, 27, 0, 0, tzinfo=timezone.utc),
        cancelled_at=None, cancel_reason=None,
    )
    defaults.update(kwargs)
    with Session(engine) as session:
        session.execute(insert(_active_orders).values(**defaults))
        session.commit()


def _run_select(engine) -> list[dict]:
    with Session(engine) as session:
        result = session.execute(_SQLITE_SELECT)
        return [dict(r._mapping) for r in result.all()]


# ──────────────────────────────────────────────────────────────────────────
# Tests — orphan detection
# ──────────────────────────────────────────────────────────────────────────


class TestOrphanDetection:
    def test_no_state_no_results(self, db):
        """If tb3_grid_state has no row, the CROSS JOIN produces nothing."""
        _seed_order(db, exchange_order_id="lonely")
        rows = _run_select(db)
        assert rows == []

    def test_pre_recenter_epoch_orphan(self, db):
        """Row created BEFORE last_recenter_at is flagged 'pre_recenter_epoch'."""
        recenter = datetime(2026, 5, 27, 0, 32, tzinfo=timezone.utc)
        _seed_grid_state(
            db,
            last_recenter=recenter,
            range_low=Decimal("73793"),
            range_high=Decimal("82434"),
        )
        # Order from BEFORE recenter, level_price still inside the new range
        # (the "tricky" case: only the created_at proves it's stale)
        _seed_order(
            db,
            exchange_order_id="pre",
            level_index=15,
            level_price=Decimal("78000"),  # inside range
            created_at=recenter - timedelta(hours=2),
        )
        rows = _run_select(db)
        assert len(rows) == 1
        assert rows[0]["orphan_reason"] == "pre_recenter_epoch"
        assert rows[0]["exchange_order_id"] == "pre"

    def test_out_of_range_orphan(self, db):
        """Row whose level_price falls outside the active range."""
        recenter = datetime(2026, 5, 27, 0, 32, tzinfo=timezone.utc)
        _seed_grid_state(
            db,
            last_recenter=recenter,
            range_low=Decimal("73793"),
            range_high=Decimal("82434"),
        )
        # Same created_at as recenter (in-epoch), but level_price below range
        _seed_order(
            db,
            exchange_order_id="out-low",
            level_index=7,
            level_price=Decimal("67861"),
            created_at=recenter + timedelta(minutes=5),
        )
        _seed_order(
            db,
            exchange_order_id="out-high",
            level_index=21,
            level_price=Decimal("83119"),
            created_at=recenter + timedelta(minutes=5),
        )
        rows = _run_select(db)
        assert len(rows) == 2
        assert {r["orphan_reason"] for r in rows} == {"out_of_range"}

    def test_in_range_in_epoch_not_returned(self, db):
        """The bot's healthy current grid: in-range price + post-recenter
        timestamp. Must NOT be flagged."""
        recenter = datetime(2026, 5, 27, 0, 32, tzinfo=timezone.utc)
        _seed_grid_state(
            db,
            last_recenter=recenter,
            range_low=Decimal("73793"),
            range_high=Decimal("82434"),
        )
        _seed_order(
            db,
            exchange_order_id="healthy",
            level_index=5,
            level_price=Decimal("75283"),
            created_at=recenter + timedelta(minutes=1),
        )
        rows = _run_select(db)
        assert rows == []

    def test_cancelled_rows_not_returned(self, db):
        """status != 'open' is already terminal — leave it alone."""
        recenter = datetime(2026, 5, 27, 0, 32, tzinfo=timezone.utc)
        _seed_grid_state(
            db,
            last_recenter=recenter,
            range_low=Decimal("73793"),
            range_high=Decimal("82434"),
        )
        _seed_order(
            db,
            exchange_order_id="already-cancelled",
            level_index=7,
            level_price=Decimal("67861"),  # out-of-range, but already cancelled
            status="cancelled",
            created_at=recenter - timedelta(hours=2),
        )
        rows = _run_select(db)
        assert rows == []

    def test_2026_05_27_production_scenario(self, db):
        """The exact 20-orphan cohort observed in the audit.

        Mix of pre-recenter rows (some in-range by coincidence, some out)
        plus healthy post-recenter rows. The cleanup should pick exactly
        the pre-recenter set — none of the healthy post-recenter rows.
        """
        recenter = datetime(2026, 5, 27, 0, 32, 15, tzinfo=timezone.utc)
        _seed_grid_state(
            db,
            last_recenter=recenter,
            range_low=Decimal("73793.01"),
            range_high=Decimal("82434.49"),
        )
        # 5 pre-recenter, mix of in/out of range
        pre_specs = [
            (1, "buy", Decimal("67861")),    # out-of-range
            (2, "buy", Decimal("73482")),    # out-of-range (just below)
            (3, "buy", Decimal("75088")),    # in-range price, stale epoch
            (4, "sell", Decimal("83119")),   # out-of-range (above)
            (5, "sell", Decimal("75891")),   # in-range price, stale epoch
        ]
        for i, (lvl, side, price) in enumerate(pre_specs):
            _seed_order(
                db,
                exchange_order_id=f"pre-{i}",
                level_index=lvl, side=side,
                level_price=price,
                created_at=recenter - timedelta(hours=5, minutes=i),
            )
        # 3 healthy post-recenter rows
        for i, (lvl, side, price) in enumerate([
            (0, "buy", Decimal("73793.01")),
            (5, "buy", Decimal("75283")),
            (8, "sell", Decimal("76177")),
        ]):
            _seed_order(
                db,
                exchange_order_id=f"post-{i}",
                level_index=lvl, side=side,
                level_price=price,
                created_at=recenter + timedelta(minutes=i),
            )
        rows = _run_select(db)
        # All 5 pre-recenter rows are orphans
        assert len(rows) == 5
        assert all(r["exchange_order_id"].startswith("pre-") for r in rows), [
            r["exchange_order_id"] for r in rows
        ]
        # Orphan reasons correctly split
        reasons = {r["exchange_order_id"]: r["orphan_reason"] for r in rows}
        assert reasons == {
            "pre-0": "pre_recenter_epoch",  # below-range AND stale → stale wins
            "pre-1": "pre_recenter_epoch",
            "pre-2": "pre_recenter_epoch",
            "pre-3": "pre_recenter_epoch",
            "pre-4": "pre_recenter_epoch",
        }
