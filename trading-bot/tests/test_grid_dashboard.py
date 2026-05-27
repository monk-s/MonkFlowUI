"""Tests for the v3 grid dashboard endpoints.

Uses FastAPI's TestClient with a FakeRepo + AsyncMock exchange. Validates
JSON contract for /api/grid/state, /api/grid/fills, /api/grid/metrics,
and /api/admin/run-grid-tick.
"""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi import FastAPI
from fastapi.templating import Jinja2Templates
from fastapi.testclient import TestClient

from dashboard.routes import register_routes


def _fake_grid_state(**overrides):
    """Build a fake tb3_grid_state row with sensible defaults."""
    defaults = dict(
        id=1, symbol="BTC-PERP-INTX",
        prebuy_qty=0.0623, prebuy_avg_price=77000.0,
        prebuy_at=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        prebuy_status="complete",
        current_range_low=60000.0, current_range_high=95000.0,
        num_levels=30, capital_per_level=320.0,
        last_recenter_at=datetime(2026, 5, 1, 12, 0, tzinfo=timezone.utc),
        next_recenter_at=datetime(2026, 6, 30, 12, 0, tzinfo=timezone.utc),
        inventory_qty=0.075, inventory_avg_cost=76000.0,
        realized_pnl_total=125.50, fees_paid_total=4.20,
        n_buy_fills=12, n_sell_fills=8,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fake_active_order(level_index, side, **overrides):
    defaults = dict(
        id=level_index + 100,
        exchange_order_id=f"co-{level_index:04d}",
        side=side,
        level_index=level_index,
        level_price=76000.0 + level_index * 1000,
        qty=0.004,
        status="open",
        created_at=datetime(2026, 5, 26, 12, 0, tzinfo=timezone.utc),
        last_polled_at=datetime(2026, 5, 26, 14, 0, tzinfo=timezone.utc),
        # AUDIT-FIX A5
        cancel_reason=None,
    )
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


def _fake_fill(idx, side, price, qty, realized_pnl=0.0):
    return SimpleNamespace(
        id=idx,
        created_at=datetime(2026, 5, 26, 12, idx, tzinfo=timezone.utc),
        side=side,
        level_index=idx,
        fill_price=price,
        fill_qty=qty,
        fee_paid=0.10,
        realized_pnl=realized_pnl,
        inventory_after_qty=0.07,
        inventory_after_avg_cost=76000.0,
        exchange_order_id=f"co-fill-{idx:04d}",
    )


def _fake_daily_metric(date_iso, net_pnl):
    return SimpleNamespace(
        id=1,
        date=datetime.fromisoformat(date_iso),
        n_buy_fills=5, n_sell_fills=4,
        gross_realized_pnl=net_pnl + 1.0,
        fees_paid=1.0, net_pnl=net_pnl,
        inventory_end_qty=0.07, inventory_end_avg_cost=76000.0,
        equity_end=10500.0, drawdown_pct=-2.5,
    )


def _build_app(*, grid_state=None, active_orders=None, fills=None, metrics=None):
    app = FastAPI()
    repo = AsyncMock()
    repo.get_grid_state = AsyncMock(return_value=grid_state)
    repo.get_open_active_orders = AsyncMock(return_value=active_orders or [])
    repo.get_recent_grid_fills = AsyncMock(return_value=fills or [])
    repo.get_grid_fills_since = AsyncMock(return_value=fills or [])
    repo.get_grid_daily_metrics = AsyncMock(return_value=metrics or [])
    # v1 stuff (unused but called by register_routes for other endpoints)
    repo.get_bot_state = AsyncMock(return_value=SimpleNamespace(
        is_halted=False, halt_reason=None, trading_mode="paper",
        current_regime=None, paper_balance=10000.0, live_balance=None,
        last_heartbeat=datetime.now(timezone.utc),
    ))
    repo.get_open_trades = AsyncMock(return_value=[])
    repo.get_trade_stats = AsyncMock(return_value={})
    repo.get_daily_pnl = AsyncMock(return_value=0.0)
    repo.get_peak_equity = AsyncMock(return_value=10000.0)
    repo.get_circuit_breakers = AsyncMock(return_value=[])
    repo.log = AsyncMock()
    exchange = AsyncMock()
    exchange.get_equity = AsyncMock(return_value=10000)
    exchange.get_positions = AsyncMock(return_value=[])
    templates = Jinja2Templates(directory=".")  # not used in API tests
    register_routes(app, repo, exchange, templates, scheduler=None)
    return app, repo


# ─────────────────────────────────────────────────────────────────────────
# /api/grid/state
# ─────────────────────────────────────────────────────────────────────────


class TestGridState:
    def test_returns_full_state_when_initialized(self):
        gs = _fake_grid_state()
        active = [
            _fake_active_order(5, "buy"),
            _fake_active_order(15, "sell"),
        ]
        app, _ = _build_app(grid_state=gs, active_orders=active)
        client = TestClient(app)
        r = client.get("/api/grid/state")
        assert r.status_code == 200
        body = r.json()
        assert body["initialized"] is True
        assert body["symbol"] == "BTC-PERP-INTX"
        assert body["range_low"] == 60000.0
        assert body["range_high"] == 95000.0
        assert body["num_levels"] == 30
        assert body["prebuy_qty"] == 0.0623
        assert body["prebuy_status"] == "complete"
        assert body["inventory_qty"] == 0.075
        assert body["realized_pnl_total"] == 125.50
        assert body["n_buy_fills"] == 12
        assert body["n_sell_fills"] == 8
        assert len(body["active_orders"]) == 2
        assert body["active_orders_count"] == 2

    def test_returns_uninitialized_when_no_grid_state(self):
        app, _ = _build_app(grid_state=None)
        client = TestClient(app)
        r = client.get("/api/grid/state")
        assert r.status_code == 200
        assert r.json() == {"initialized": False}

    def test_cancel_reason_exposed_in_active_order(self):
        """AUDIT-FIX A5: cancel_reason flows into the JSON payload so
        dashboards can split orphan-source cohorts."""
        gs = _fake_grid_state()
        active = [
            _fake_active_order(5, "buy"),  # open — no reason
            # An open row with cancel_reason should NOT appear in production
            # (we only write it on terminal transitions), but if it ever
            # does, the JSON should faithfully pass it through.
            _fake_active_order(
                15, "sell",
                cancel_reason="INVALID_LIMIT_PRICE_POST_ONLY",
            ),
        ]
        app, _ = _build_app(grid_state=gs, active_orders=active)
        body = TestClient(app).get("/api/grid/state").json()
        orders_by_level = {o["level_index"]: o for o in body["active_orders"]}
        assert orders_by_level[5]["cancel_reason"] is None
        assert orders_by_level[15]["cancel_reason"] == "INVALID_LIMIT_PRICE_POST_ONLY"

    def test_handles_nullable_fields(self):
        """Singleton row exists but with NULLs — first deploy before any tick."""
        gs = _fake_grid_state(
            prebuy_qty=None, prebuy_avg_price=None, prebuy_at=None,
            prebuy_status=None,
            current_range_low=None, current_range_high=None, num_levels=None,
            capital_per_level=None, last_recenter_at=None, next_recenter_at=None,
            inventory_avg_cost=None,
        )
        app, _ = _build_app(grid_state=gs)
        client = TestClient(app)
        r = client.get("/api/grid/state")
        assert r.status_code == 200
        body = r.json()
        assert body["initialized"] is True
        assert body["prebuy_qty"] is None
        assert body["range_low"] is None
        assert body["num_levels"] is None


# ─────────────────────────────────────────────────────────────────────────
# /api/grid/fills
# ─────────────────────────────────────────────────────────────────────────


class TestGridFills:
    def test_returns_recent_fills(self):
        fills = [
            _fake_fill(1, "buy", 76000.0, 0.004),
            _fake_fill(2, "sell", 78000.0, 0.004, realized_pnl=8.0),
        ]
        app, _ = _build_app(fills=fills)
        client = TestClient(app)
        r = client.get("/api/grid/fills?limit=10")
        assert r.status_code == 200
        body = r.json()
        assert body["count"] == 2
        assert body["fills"][0]["side"] == "buy"
        assert body["fills"][1]["realized_pnl"] == 8.0

    def test_empty_when_no_fills(self):
        app, _ = _build_app(fills=[])
        client = TestClient(app)
        r = client.get("/api/grid/fills")
        assert r.json() == {"fills": [], "count": 0}

    def test_since_param_routes_to_filtered_query(self):
        fills = [_fake_fill(1, "buy", 76000.0, 0.004)]
        app, repo = _build_app(fills=fills)
        client = TestClient(app)
        r = client.get("/api/grid/fills?since=2026-05-26T00:00:00Z")
        assert r.status_code == 200
        repo.get_grid_fills_since.assert_awaited_once()
        repo.get_recent_grid_fills.assert_not_awaited()

    def test_invalid_since_returns_error(self):
        app, _ = _build_app()
        client = TestClient(app)
        r = client.get("/api/grid/fills?since=not-a-date")
        assert r.status_code == 200
        assert "error" in r.json()


# ─────────────────────────────────────────────────────────────────────────
# /api/grid/metrics
# ─────────────────────────────────────────────────────────────────────────


class TestGridMetrics:
    def test_returns_metrics_for_default_period(self):
        metrics = [
            _fake_daily_metric("2026-05-25T00:00:00+00:00", net_pnl=15.0),
            _fake_daily_metric("2026-05-26T00:00:00+00:00", net_pnl=22.0),
        ]
        app, _ = _build_app(metrics=metrics)
        client = TestClient(app)
        r = client.get("/api/grid/metrics")
        body = r.json()
        assert body["period"] == "30d"
        assert body["days"] == 30
        assert len(body["metrics"]) == 2
        assert body["metrics"][1]["net_pnl"] == 22.0

    def test_custom_period(self):
        app, repo = _build_app(metrics=[])
        client = TestClient(app)
        r = client.get("/api/grid/metrics?period=7d")
        body = r.json()
        assert body["days"] == 7
        # Verify the repo was called with days=7
        repo.get_grid_daily_metrics.assert_awaited_once_with(days=7)

    def test_unknown_period_defaults_to_30d(self):
        app, _ = _build_app(metrics=[])
        client = TestClient(app)
        r = client.get("/api/grid/metrics?period=nonsense")
        body = r.json()
        assert body["days"] == 30
