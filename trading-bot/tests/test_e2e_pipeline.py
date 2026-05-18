"""
End-to-end pipeline tests for the trading bot.

Exercises the full stack -- repository, exchange (paper), regime detector,
strategies, risk manager, position sizer, order manager, trade lifecycle,
position manager, and dashboard -- against a real PostgreSQL database.

ISOLATION STRATEGY
------------------
Tests use a dedicated PostgreSQL schema (``tb_e2e_test``) created at session
start and dropped on teardown. This guarantees zero contact with the
production ``public`` schema even if cleanup fails.

Connection URL is read from the ``TRADING_BOT_E2E_DB_URL`` environment
variable (no credentials are stored in this file or in fixtures). Tests are
auto-skipped when the env var is unset, so this file is safe in CI without
secrets.

Run locally:
    export TRADING_BOT_E2E_DB_URL='postgresql://user:pass@host:5432/db'
    python -m pytest tests/test_e2e_pipeline.py -v
"""

from __future__ import annotations

import asyncio
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import AsyncIterator
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine, async_sessionmaker, create_async_engine

# Make sure the trading-bot root is on sys.path
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from bot.exchange.base import OrderResult, OrderSide, OrderType, Position
from bot.persistence.models import Base
from tests.conftest import make_trending_up


# --------------------------------------------------------------------------
# Module-level skip if no DB URL is provided.
# --------------------------------------------------------------------------

E2E_DB_URL = os.environ.get("TRADING_BOT_E2E_DB_URL", "").strip()
TEST_SCHEMA = "tb_e2e_test"

pytestmark = pytest.mark.skipif(
    not E2E_DB_URL,
    reason="TRADING_BOT_E2E_DB_URL not set; skipping E2E DB tests",
)


def _normalize_url(url: str) -> str:
    """Force the URL to use the asyncpg driver."""
    if url.startswith("postgresql://"):
        return url.replace("postgresql://", "postgresql+asyncpg://", 1)
    return url


# --------------------------------------------------------------------------
# Session-scoped infrastructure: schema + engine.
# --------------------------------------------------------------------------


@pytest_asyncio.fixture(scope="session", loop_scope="session")
async def test_engine() -> AsyncIterator[AsyncEngine]:
    """
    Create an isolated test schema and yield an engine pinned to it.

    All ``tb_*`` tables are created inside ``tb_e2e_test`` via
    ``search_path``. Schema is dropped CASCADE on teardown.
    """
    url = _normalize_url(E2E_DB_URL)

    # Step 1: create the schema using a temporary engine on the public path
    bootstrap_engine = create_async_engine(url, echo=False, pool_pre_ping=True)
    async with bootstrap_engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
        await conn.execute(text(f"CREATE SCHEMA {TEST_SCHEMA}"))
    await bootstrap_engine.dispose()

    # Step 2: create the engine that all tests will use, pinned to test schema
    engine = create_async_engine(
        url,
        echo=False,
        pool_size=2,
        max_overflow=2,
        pool_pre_ping=True,
        connect_args={
            "server_settings": {"search_path": f"{TEST_SCHEMA},public"},
        },
    )

    # Step 3: create all tables in the test schema.
    # We must SET LOCAL search_path to ONLY the test schema during create_all,
    # because metadata.create_all checks every schema in search_path for
    # existence and skips creation if tables already exist anywhere on the path.
    # Once production has been deployed, tb_* tables exist in `public` — without
    # this override, create_all sees them and never instantiates them in
    # tb_e2e_test, breaking every test with "relation does not exist".
    async with engine.begin() as conn:
        await conn.execute(text(f"SET LOCAL search_path TO {TEST_SCHEMA}"))
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    # Teardown: dispose engine, then drop the schema with a fresh connection
    await engine.dispose()
    cleanup_engine = create_async_engine(url, echo=False)
    async with cleanup_engine.begin() as conn:
        await conn.execute(text(f"DROP SCHEMA IF EXISTS {TEST_SCHEMA} CASCADE"))
    await cleanup_engine.dispose()


@pytest_asyncio.fixture(loop_scope="session")
async def session_factory(test_engine: AsyncEngine):
    """A fresh sessionmaker bound to the test engine, plus per-test cleanup."""
    factory = async_sessionmaker(test_engine, expire_on_commit=False)

    # Clean state before each test: TRUNCATE all tb_* tables
    async with test_engine.begin() as conn:
        # Order matters because of FKs (events references trades)
        await conn.execute(text(f"""
            TRUNCATE TABLE
                {TEST_SCHEMA}.tb_trade_events,
                {TEST_SCHEMA}.tb_trades,
                {TEST_SCHEMA}.tb_balance_history,
                {TEST_SCHEMA}.tb_circuit_breakers,
                {TEST_SCHEMA}.tb_candles,
                {TEST_SCHEMA}.tb_bot_log
            RESTART IDENTITY CASCADE
        """))
        # bot_state is a singleton -- delete then re-seed
        await conn.execute(text(f"DELETE FROM {TEST_SCHEMA}.tb_bot_state"))

    yield factory


@pytest_asyncio.fixture(loop_scope="session")
async def repo(session_factory):
    """A live Repository pointed at the isolated schema."""
    from bot.persistence.repository import Repository
    repository = Repository(session_factory)
    # Ensure the singleton bot_state row exists for tests that need it
    await repository.get_bot_state()
    return repository


# --------------------------------------------------------------------------
# Bot stack assembly (paper engine, strategies, risk, lifecycle).
# --------------------------------------------------------------------------


@pytest.fixture
def paper_engine_with_mock_market():
    """
    A real PaperEngine but with the Coinbase market client replaced by a mock.
    We don't want E2E tests to hit Coinbase's API.
    """
    from bot.exchange.paper_engine import PaperEngine

    eng = PaperEngine.__new__(PaperEngine)

    market_mock = AsyncMock()
    market_mock.get_current_price.return_value = Decimal("85000.00")
    market_mock.get_candles.return_value = [
        {
            "timestamp": datetime.now(timezone.utc),
            "open": 84500.0,
            "high": 85500.0,
            "low": 84000.0,
            "close": 85000.0,
            "volume": 1000.0,
        }
    ]
    funding_info = AsyncMock()
    funding_info.rate = Decimal("0.0001")
    funding_info.interval_hours = 8
    market_mock.get_funding_rate.return_value = funding_info

    eng.market_client = market_mock
    eng.balance = Decimal("10000")
    eng.positions = {}
    eng.pending_orders = {}
    eng.filled_orders = []
    eng.total_fees = Decimal("0")
    eng.total_funding = Decimal("0")
    eng._last_price = None
    return eng


@pytest.fixture
def bot_stack(repo, paper_engine_with_mock_market):
    """
    Wire up the full bot stack against the test DB and the mocked paper engine.
    Returns a SimpleNamespace so tests can grab ``stack.lifecycle``, ``.scheduler``, etc.
    """
    from types import SimpleNamespace
    from bot.execution.order_manager import OrderManager
    from bot.execution.position_manager import PositionManager
    from bot.execution.trade_lifecycle import TradeLifecycle
    from bot.risk.risk_manager import RiskManager
    from bot.risk.trailing_stop import TrailingStopManager
    from bot.strategy.bb_rsi_reversion import BBRSIReversionStrategy
    from bot.strategy.ema_trend import EMATrendStrategy
    from bot.strategy.regime_detector import RegimeDetector

    exchange = paper_engine_with_mock_market
    risk = RiskManager()
    trailing = TrailingStopManager()
    orders = OrderManager(exchange)
    regime = RegimeDetector()

    return SimpleNamespace(
        exchange=exchange,
        repo=repo,
        risk=risk,
        trailing=trailing,
        orders=orders,
        regime=regime,
        ema=EMATrendStrategy(regime),
        bb_rsi=BBRSIReversionStrategy(regime),
        lifecycle=TradeLifecycle(
            exchange=exchange,
            repository=repo,
            risk_manager=risk,
            order_manager=orders,
        ),
        positions=PositionManager(
            exchange=exchange,
            repository=repo,
            risk_manager=risk,
            trailing_stop_manager=trailing,
            order_manager=orders,
        ),
    )


# --------------------------------------------------------------------------
# Helpers.
# --------------------------------------------------------------------------


def _make_signal(direction: str = "long", entry: float = 85000.0):
    """Build a Signal that should pass risk checks."""
    from bot.strategy.base import Signal

    if direction == "long":
        stop = entry * 0.985  # 1.5% stop
        target = entry * 1.04  # 4% target -> ~2.67 R:R
    else:
        stop = entry * 1.015
        target = entry * 0.96

    risk_dist = abs(entry - stop)
    reward_dist = abs(target - entry)
    rr = reward_dist / risk_dist

    return Signal(
        strategy="ema_trend",
        direction=direction,
        entry_price=entry,
        stop_price=stop,
        target_price=target,
        rr_ratio=round(rr, 2),
        regime="trending_up" if direction == "long" else "trending_down",
        indicators={"ema9": entry, "ema26": entry * 0.99, "adx": 30.0},
    )


# --------------------------------------------------------------------------
# Test cases.
# --------------------------------------------------------------------------


class TestE2EFullTradeLifecycle:
    """End-to-end happy path: signal -> open trade -> recorded in DB."""

    @pytest.mark.asyncio(loop_scope="session")
    async def test_signal_opens_trade_and_records_audit_trail(self, bot_stack):
        """A valid signal should result in an open trade row + audit event."""
        signal = _make_signal(direction="long", entry=85000.0)

        result = await bot_stack.lifecycle.process_signal(signal)

        assert result == "open", f"Expected 'open', got {result!r}"

        # Verify the trade record
        open_trades = await bot_stack.repo.get_open_trades()
        assert len(open_trades) == 1, "Expected exactly one open trade"
        trade = open_trades[0]
        assert trade.strategy == "ema_trend"
        assert trade.direction == "long"
        assert trade.status == "open"
        assert trade.regime == "trending_up"
        assert float(trade.rr_ratio) >= 2.0
        assert trade.entry_order_id is not None
        assert trade.stop_order_id is not None
        assert trade.position_size is not None and float(trade.position_size) > 0
        assert trade.indicators_snapshot is not None
        assert "ema9" in trade.indicators_snapshot

        # Verify the audit trail
        from sqlalchemy import select
        from bot.persistence.models import TradeEvent

        async with bot_stack.repo.session_factory() as session:
            events = (await session.execute(
                select(TradeEvent).where(TradeEvent.trade_id == str(trade.id))
            )).scalars().all()

        assert len(events) >= 1, "Expected at least one audit event"
        assert any(e.to_status == "open" for e in events), "Expected SIGNAL->OPEN event"


class TestE2ERiskRejection:
    """Risk manager blocks trades that exceed limits."""

    @pytest.mark.asyncio(loop_scope="session")
    async def test_max_concurrent_positions_blocks_new_signal(self, bot_stack):
        """With 2 trades already open, the 3rd signal should be rejected."""
        # Open 2 trades to hit MAX_CONCURRENT_POSITIONS=2
        for entry in (85000.0, 86000.0):
            sig = _make_signal(direction="long", entry=entry)
            res = await bot_stack.lifecycle.process_signal(sig)
            assert res == "open"

        # Third should be rejected
        sig3 = _make_signal(direction="long", entry=87000.0)
        result = await bot_stack.lifecycle.process_signal(sig3)
        assert result == "rejected"

        # Verify the rejected row was written for audit
        from sqlalchemy import select
        from bot.persistence.models import Trade

        async with bot_stack.repo.session_factory() as session:
            rejected = (await session.execute(
                select(Trade).where(Trade.status == "rejected")
            )).scalars().all()

        assert len(rejected) == 1
        assert "Max concurrent positions" in rejected[0].reject_reason

    @pytest.mark.asyncio(loop_scope="session")
    async def test_low_rr_signal_rejected(self, bot_stack):
        """A signal with R:R < 2.0 must be rejected by risk manager."""
        from bot.strategy.base import Signal

        bad_signal = Signal(
            strategy="ema_trend",
            direction="long",
            entry_price=85000.0,
            stop_price=84000.0,   # 1000 risk
            target_price=85500.0, # 500 reward -> 0.5 R:R
            rr_ratio=0.5,
            regime="trending_up",
            indicators={"ema9": 85000.0},
        )

        result = await bot_stack.lifecycle.process_signal(bad_signal)
        assert result == "rejected"


class TestE2ECircuitBreaker:
    """Circuit breaker rejection path."""

    @pytest.mark.asyncio(loop_scope="session")
    async def test_daily_drawdown_circuit_breaker_blocks_trade(self, bot_stack, monkeypatch):
        """When daily P&L < -5% threshold, trades are rejected with breaker reason."""
        # Force daily_pnl into the breaker zone:
        # 5% of $10,000 = $500 -- so -$600 trips the breaker.
        # H7: signatures now accept `live_only` kwarg; mocks must too.
        async def fake_daily_pnl(live_only: bool = False):
            return -600.0

        async def fake_weekly_pnl(live_only: bool = False):
            return -600.0

        async def fake_monthly_pnl(live_only: bool = False):
            return -600.0

        monkeypatch.setattr(bot_stack.repo, "get_daily_pnl", fake_daily_pnl)
        monkeypatch.setattr(bot_stack.repo, "get_weekly_pnl", fake_weekly_pnl)
        monkeypatch.setattr(bot_stack.repo, "get_monthly_pnl", fake_monthly_pnl)

        signal = _make_signal(direction="long", entry=85000.0)
        result = await bot_stack.lifecycle.process_signal(signal)

        assert result == "rejected"

        # Verify the rejection was due to the circuit breaker
        from sqlalchemy import select
        from bot.persistence.models import Trade

        async with bot_stack.repo.session_factory() as session:
            rejected = (await session.execute(
                select(Trade).where(Trade.status == "rejected")
            )).scalars().all()
        assert len(rejected) == 1
        assert "circuit breaker" in rejected[0].reject_reason.lower()


class TestE2EOrphanRecovery:
    """Orphaned-trade recovery on bot startup."""

    @pytest.mark.asyncio(loop_scope="session")
    async def test_orphan_pending_with_no_position_is_cancelled(self, bot_stack):
        """A trade stuck in entry_pending with no exchange position -> cancelled."""
        # Insert a stuck entry_pending trade directly
        trade = await bot_stack.repo.create_trade({
            "strategy": "ema_trend",
            "direction": "long",
            "status": "entry_pending",
            "regime": "trending_up",
            "signal_price": 85000.0,
            "stop_price": 83000.0,
            "target_price": 89000.0,
            "rr_ratio": 2.0,
            "indicators_snapshot": {"ema9": 85000.0},
            "signal_at": datetime.now(timezone.utc),
        })

        # No positions on the (paper) exchange -> recovery should cancel it
        recovered = await bot_stack.lifecycle.recover_orphaned_trades()
        assert recovered == 1

        from sqlalchemy import select
        from bot.persistence.models import Trade

        async with bot_stack.repo.session_factory() as session:
            updated = (await session.execute(
                select(Trade).where(Trade.id == str(trade.id))
            )).scalar_one()

        assert updated.status == "cancelled"
        assert updated.exit_at is not None


class TestE2EDashboardHealth:
    """Dashboard endpoints respond correctly when wired to the test stack."""

    @pytest.mark.asyncio(loop_scope="session")
    async def test_health_and_state_endpoints_respond(self, bot_stack):
        """The /health endpoint returns 200 and key API endpoints return data."""
        from httpx import ASGITransport, AsyncClient
        from dashboard.app import app, init_dashboard

        # Wire dashboard against the test stack (no scheduler needed for these endpoints)
        init_dashboard(bot_stack.repo, bot_stack.exchange, scheduler=None)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            health = await client.get("/health")
            assert health.status_code == 200
            assert health.json().get("status") == "ok"

            # /api/overview returns bot state + equity JSON
            overview = await client.get("/api/overview")
            assert overview.status_code == 200
            payload = overview.json()
            assert "status" in payload
            assert "equity" in payload

            # /api/trades returns a dict with 'trades' list and 'stats' summary
            trades = await client.get("/api/trades")
            assert trades.status_code == 200
            trades_payload = trades.json()
            assert "trades" in trades_payload
            assert isinstance(trades_payload["trades"], list)
            assert "stats" in trades_payload

            # /api/positions returns a dict with current price + positions list
            positions = await client.get("/api/positions")
            assert positions.status_code == 200
            pos_payload = positions.json()
            assert "positions" in pos_payload
            assert isinstance(pos_payload["positions"], list)
