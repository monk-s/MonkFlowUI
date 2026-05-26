"""Tests for the grid daily rollup task in TickScheduler.

Validates that yesterday's fills are correctly aggregated and that the
rollup is exception-isolated (errors don't crash the scheduler).
"""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from bot.scheduler.tick_scheduler import TickScheduler


def _fill(side, realized_pnl, fee, created_at):
    return SimpleNamespace(
        side=side,
        realized_pnl=realized_pnl,
        fee_paid=fee,
        created_at=created_at,
    )


def _grid_state(inv_qty=0.07, inv_avg=76000.0):
    return SimpleNamespace(inventory_qty=inv_qty, inventory_avg_cost=inv_avg)


def _build_scheduler(*, fills=None, grid_state=None, equity=10000.0, peak=10500.0,
                      get_fills_raises=False):
    repo = AsyncMock()
    if get_fills_raises:
        repo.get_grid_fills_since = AsyncMock(side_effect=Exception("DB error"))
    else:
        repo.get_grid_fills_since = AsyncMock(return_value=fills or [])
    repo.get_grid_state = AsyncMock(return_value=grid_state or _grid_state())
    repo.get_peak_equity = AsyncMock(return_value=peak)
    repo.upsert_grid_daily_metric = AsyncMock()
    repo.log = AsyncMock()
    exchange = AsyncMock()
    exchange.get_equity = AsyncMock(return_value=equity)
    # All other dependencies unused for rollup tests
    return TickScheduler(
        candle_store=None,
        regime_detector=None,
        ema_strategy=None,
        bb_rsi_strategy=None,
        trade_lifecycle=None,
        position_manager=None,
        repository=repo,
        exchange=exchange,
    ), repo


# ─────────────────────────────────────────────────────────────────────────


class TestGridDailyRollup:
    @pytest.mark.asyncio
    async def test_aggregates_yesterday_fills_correctly(self):
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        # 3 buys + 2 sells with various PnL/fees, all in yesterday's window
        fills = [
            _fill("buy", 0.0, 0.10, yesterday + timedelta(hours=3)),
            _fill("buy", 0.0, 0.10, yesterday + timedelta(hours=6)),
            _fill("buy", 0.0, 0.10, yesterday + timedelta(hours=9)),
            _fill("sell", 8.50, 0.10, yesterday + timedelta(hours=12)),
            _fill("sell", 11.20, 0.10, yesterday + timedelta(hours=20)),
        ]
        sched, repo = _build_scheduler(fills=fills)
        await sched._grid_daily_rollup()
        repo.upsert_grid_daily_metric.assert_awaited_once()
        kwargs = repo.upsert_grid_daily_metric.await_args.kwargs
        assert kwargs["n_buy_fills"] == 3
        assert kwargs["n_sell_fills"] == 2
        assert kwargs["gross_realized_pnl"] == pytest.approx(19.70)
        assert kwargs["fees_paid"] == pytest.approx(0.50)
        assert kwargs["net_pnl"] == pytest.approx(19.20)

    @pytest.mark.asyncio
    async def test_excludes_today_fills(self):
        """Fills FROM TODAY (after midnight UTC) must NOT be in yesterday's rollup."""
        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday = today - timedelta(days=1)
        # 2 fills yesterday + 2 fills today (must be excluded)
        fills = [
            _fill("buy", 0, 0.10, yesterday + timedelta(hours=10)),
            _fill("sell", 5.0, 0.10, yesterday + timedelta(hours=18)),
            _fill("buy", 0, 0.10, today + timedelta(hours=1)),       # excluded
            _fill("buy", 0, 0.10, today + timedelta(hours=3)),       # excluded
        ]
        sched, repo = _build_scheduler(fills=fills)
        await sched._grid_daily_rollup()
        kwargs = repo.upsert_grid_daily_metric.await_args.kwargs
        assert kwargs["n_buy_fills"] == 1
        assert kwargs["n_sell_fills"] == 1

    @pytest.mark.asyncio
    async def test_empty_day_writes_zeros(self):
        sched, repo = _build_scheduler(fills=[])
        await sched._grid_daily_rollup()
        kwargs = repo.upsert_grid_daily_metric.await_args.kwargs
        assert kwargs["n_buy_fills"] == 0
        assert kwargs["n_sell_fills"] == 0
        assert kwargs["gross_realized_pnl"] == 0.0

    @pytest.mark.asyncio
    async def test_snapshots_eod_inventory_and_equity(self):
        sched, repo = _build_scheduler(
            grid_state=_grid_state(inv_qty=0.0825, inv_avg=75500.0),
            equity=10250.0,
            peak=10500.0,
        )
        await sched._grid_daily_rollup()
        kwargs = repo.upsert_grid_daily_metric.await_args.kwargs
        assert kwargs["inventory_end_qty"] == 0.0825
        assert kwargs["inventory_end_avg_cost"] == 75500.0
        assert kwargs["equity_end"] == 10250.0
        # DD = (10250 - 10500) / 10500 * 100 ≈ -2.38
        assert kwargs["drawdown_pct"] == pytest.approx(-2.38, abs=0.01)

    @pytest.mark.asyncio
    async def test_exception_isolated_does_not_propagate(self):
        sched, repo = _build_scheduler(get_fills_raises=True)
        # Must not raise
        await sched._grid_daily_rollup()
        # And must log
        repo.log.assert_awaited()
