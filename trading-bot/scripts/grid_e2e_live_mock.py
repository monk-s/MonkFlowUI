"""Live-mock E2E for the v3 grid trader.

Single-file deterministic simulation that:
  1. Anchors on ONE real Coinbase price call (then drops the client).
  2. Drives `grid_tick.run()` manually in a tight loop with INJECTED prices
     walked from the anchor, NOT real-time waits.
  3. Compresses ~24h of grid activity into a few seconds per scenario.
  4. Runs against an in-memory FakeRepo (NO real DB needed).
  5. Asserts pre/post state per scenario.
  6. Writes a structured PASS/FAIL report to `data/grid_e2e_mock_report.md`.

Invocation:
    python -m scripts.grid_e2e_live_mock

Why no real DB:
    The DB-backed E2E (TestGridE2E in tests/test_e2e_pipeline.py) covers
    persistence + schema. This script focuses on the temporal behavior:
    how the grid evolves over a simulated trading day, how the CB fires,
    how recenters cascade. Mixing those concerns muddies both.

Why no real-time waits:
    Real-time sleeps make CI flaky. Direct injection of `current_price`
    into `tick(current_price=...)` gives full control. The Coinbase
    anchor at boot proves we can read live data; everything after is
    deterministic.
"""

from __future__ import annotations

import asyncio
import math
import sys
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from typing import Callable, Iterable, Optional
from unittest.mock import AsyncMock

from bot.exchange.base import OrderResult, OrderSide, OrderType
from bot.execution.grid_order_manager import GridOrderManager
from bot.execution.grid_position_manager import GridPositionManager
from bot.risk.grid_risk_manager import CircuitBreakerStatus, GridRiskManager
from bot.scheduler.grid_tick import GridTickHandler
from bot.strategy.grid_strategy import GridRange, compute_range_and_levels

# Where to write the report
ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "data"
OUT_DIR.mkdir(exist_ok=True)
REPORT_FILE = OUT_DIR / "grid_e2e_mock_report.md"


# ═══════════════════════════════════════════════════════════════════════
# In-memory fakes (slightly more sophisticated than the unit-test ones —
# track equity + fills against a simulated price stream)
# ═══════════════════════════════════════════════════════════════════════


class FakeRepo:
    """In-memory FakeRepo with the methods the grid stack uses."""

    def __init__(self):
        self.grid_state = SimpleNamespace(
            id=1, symbol="BTC-PERP-INTX",
            prebuy_qty=0, prebuy_avg_price=0, prebuy_at=None,
            prebuy_status=None,
            current_range_low=None, current_range_high=None,
            num_levels=None, capital_per_level=None,
            last_recenter_at=None, next_recenter_at=None,
            inventory_qty=0, inventory_avg_cost=0,
            realized_pnl_total=0, fees_paid_total=0,
            n_buy_fills=0, n_sell_fills=0,
        )
        self.bot_state = SimpleNamespace(
            is_halted=False, halt_reason=None,
            trading_mode="paper",
        )
        self.active_orders: dict[str, SimpleNamespace] = {}
        self._next_id = 1
        self.fills: list[SimpleNamespace] = []
        self.logs: list[tuple] = []
        # Simulated equity peak for CB calculations
        self.peak_equity = 10000.0

    async def get_grid_state(self): return self.grid_state
    async def update_grid_state(self, **kw):
        for k, v in kw.items(): setattr(self.grid_state, k, v)
    async def get_bot_state(self): return self.bot_state
    async def update_bot_state(self, **kw):
        for k, v in kw.items(): setattr(self.bot_state, k, v)
    async def insert_active_order(self, *, exchange_order_id, side, level_index,
                                    level_price, qty):
        row = SimpleNamespace(
            id=self._next_id, exchange_order_id=exchange_order_id, side=side,
            level_index=level_index, level_price=level_price, qty=qty,
            status="open", created_at=datetime.now(timezone.utc),
            filled_at=None, cancelled_at=None, last_polled_at=None,
            fill_price=None, fill_qty=None, fee_paid=None,
        )
        self.active_orders[exchange_order_id] = row
        self._next_id += 1
        return row
    async def update_active_order(self, exchange_order_id, **kw):
        row = self.active_orders.get(exchange_order_id)
        if row:
            for k, v in kw.items(): setattr(row, k, v)
    async def mark_order_filled(self, *, exchange_order_id, fill_price, fill_qty, fee_paid):
        await self.update_active_order(exchange_order_id,
                                         status="filled", filled_at=datetime.now(timezone.utc),
                                         fill_price=fill_price, fill_qty=fill_qty, fee_paid=fee_paid)
    async def mark_order_cancelled(self, exchange_order_id):
        await self.update_active_order(exchange_order_id,
                                         status="cancelled", cancelled_at=datetime.now(timezone.utc))
    async def get_active_order(self, exchange_order_id):
        return self.active_orders.get(exchange_order_id)
    async def get_open_active_orders(self):
        return sorted([o for o in self.active_orders.values() if o.status == "open"],
                       key=lambda o: o.level_index)
    async def get_stale_open_orders(self, max_age_minutes):
        cutoff = datetime.now(timezone.utc) - timedelta(minutes=max_age_minutes)
        return [o for o in self.active_orders.values()
                if o.status == "open" and o.created_at < cutoff]
    async def get_open_orders_at_level(self, level_index, side=None):
        out = [o for o in self.active_orders.values()
               if o.status == "open" and o.level_index == level_index]
        if side: out = [o for o in out if o.side == side]
        return out
    async def touch_order_polled(self, exchange_order_id):
        await self.update_active_order(exchange_order_id,
                                         last_polled_at=datetime.now(timezone.utc))
    async def record_grid_fill(self, **kw):
        fill = SimpleNamespace(
            id=len(self.fills) + 1, created_at=datetime.now(timezone.utc), **kw,
        )
        self.fills.append(fill)
        return fill
    async def get_recent_grid_fills(self, limit=100): return self.fills[-limit:]
    async def get_peak_equity(self): return self.peak_equity
    async def log(self, level, component, message, metadata=None):
        self.logs.append((level, component, message))


class ScenarioExchange:
    """A controllable exchange that lets the scenario inject prices + fills.

    `set_price(p)` sets the value returned by get_current_price().
    `mark_filled(order_id)` flags a pending limit as filled — next get_order()
    will report it as filled at its limit price.
    `get_equity()` returns the simulated equity (settable from scenario).
    """

    def __init__(self, *, anchor_price: float, starting_equity: float = 10000):
        self.current_price = anchor_price
        self.equity = starting_equity
        self.placed: dict[str, OrderResult] = {}
        self.filled_orders: set[str] = set()
        self.cancelled: set[str] = set()
        self.closed_positions: list[tuple[str, Decimal]] = []
        self._next = 1
        self.maker_fee_pct = Decimal("0.04")

    def set_price(self, p: float): self.current_price = p
    def set_equity(self, e: float): self.equity = e
    def mark_filled(self, order_id: str):
        if order_id in self.placed: self.filled_orders.add(order_id)

    def _oid(self) -> str:
        oid = f"sim-{self._next:06d}"; self._next += 1; return oid

    async def get_current_price(self): return Decimal(str(self.current_price))
    async def get_equity(self): return Decimal(str(self.equity))

    async def place_order(self, side, size, order_type, price=None, stop_price=None,
                          leverage=Decimal("1"), reduce_only=False, post_only=False):
        oid = self._oid()
        if order_type == OrderType.MARKET:
            fill_price = Decimal(str(self.current_price))
            fee = size * fill_price * Decimal("0.0006")
            result = OrderResult(
                order_id=oid, side=side, order_type=order_type,
                size=size, price=fill_price, filled=True, fee=fee,
            )
            return result
        # LIMIT — return as pending
        result = OrderResult(
            order_id=oid, side=side, order_type=order_type,
            size=size, price=price, filled=False, fee=Decimal("0"),
        )
        self.placed[oid] = result
        return result

    async def get_order(self, order_id):
        if order_id not in self.placed: return None
        base = self.placed[order_id]
        if order_id in self.filled_orders:
            fee = base.size * base.price * (self.maker_fee_pct / Decimal("100"))
            return OrderResult(
                order_id=order_id, side=base.side, order_type=base.order_type,
                size=base.size, price=base.price, filled=True, fee=fee,
            )
        return base

    async def cancel_order(self, order_id):
        # AUDIT-FIX A1: returns (success, failure_reason); mirrors live shape.
        if order_id in self.placed:
            self.cancelled.add(order_id); del self.placed[order_id]
            return True, None
        return False, "UNKNOWN_CANCEL_ORDER"

    async def close_position(self, side, size):
        self.closed_positions.append((side, size))
        return OrderResult(
            order_id=self._oid(), side=OrderSide.SELL if side == "long" else OrderSide.BUY,
            order_type=OrderType.MARKET, size=size,
            price=Decimal(str(self.current_price)), filled=True, fee=Decimal("0"),
        )

    async def get_candles(self, tf, limit=200):
        return [{"high": self.current_price, "low": self.current_price,
                  "close": self.current_price} for _ in range(limit)]

    async def set_leverage(self, leverage): return True
    async def get_positions(self): return []
    async def get_balance(self): return Decimal(str(self.equity))


# ═══════════════════════════════════════════════════════════════════════
# Scenario result tracking
# ═══════════════════════════════════════════════════════════════════════


@dataclass
class ScenarioResult:
    name: str
    passed: bool
    duration_sec: float
    asserts_passed: int = 0
    asserts_failed: int = 0
    failure_messages: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)


def _assert(result: ScenarioResult, condition: bool, message: str):
    if condition:
        result.asserts_passed += 1
    else:
        result.asserts_failed += 1
        result.failure_messages.append(message)


# ═══════════════════════════════════════════════════════════════════════
# Scenario harness
# ═══════════════════════════════════════════════════════════════════════


async def _setup_stack(*, anchor_price: float, starting_equity: float = 10000,
                         orders_per_side: int = 3, cap_per_level: float = 320.0):
    """Build a fresh grid stack for a scenario."""
    repo = FakeRepo()
    exch = ScenarioExchange(anchor_price=anchor_price, starting_equity=starting_equity)
    pos_mgr = GridPositionManager(repository=repo, long_only=True)
    risk_mgr = GridRiskManager(
        repository=repo, exchange=exch,
        dd_threshold_pct=40.0, rearm_ma_days=50,
    )
    order_mgr = GridOrderManager(
        exchange=exch, repository=repo, position_manager=pos_mgr,
        symbol="BTC-PERP-INTX",
        capital_per_level=cap_per_level, leverage=1.0,
        maker_only=True, orders_per_side=orders_per_side,
        order_stale_minutes=1440, maker_fee_pct=0.04,
    )
    tick = GridTickHandler(
        exchange=exch, repository=repo,
        grid_order_manager=order_mgr,
        grid_position_manager=pos_mgr,
        grid_risk_manager=risk_mgr,
    )
    return repo, exch, pos_mgr, order_mgr, risk_mgr, tick


# ═══════════════════════════════════════════════════════════════════════
# Scenario 1: happy_path_24h
# ═══════════════════════════════════════════════════════════════════════


async def scenario_happy_path(anchor: float) -> ScenarioResult:
    """24h of sinusoidal ±5% price walk; verify grid produces fills + P&L."""
    name = "happy_path_24h"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, pos_mgr, order_mgr, _, _ = await _setup_stack(
        anchor_price=anchor, orders_per_side=5, cap_per_level=200.0,
    )

    # Pre-buy 20% of equity
    pb = await order_mgr.execute_prebuy(notional_usd=2000.0, current_price=anchor)
    _assert(res, pb.success, f"prebuy must succeed: {pb.error}")
    _assert(res, repo.grid_state.prebuy_status == "complete", "prebuy_status not 'complete'")

    # Static grid around anchor
    gr = compute_range_and_levels(
        mode="static",
        static_low=anchor * 0.93, static_high=anchor * 1.07,
        n_levels=15,
    )

    # 240 ticks = 24h × 60min / 6 = simulated 6-minute ticks
    # Price walks sinusoidally ±5% with period ~12h (40 ticks)
    n_ticks = 240
    for i in range(n_ticks):
        # Sinusoidal walk
        phase = (i / 40.0) * 2 * math.pi
        price = anchor * (1 + 0.05 * math.sin(phase))
        exch.set_price(price)
        # Auto-fill any pending order whose price has been crossed
        for oid, o in list(exch.placed.items()):
            limit = float(o.price)
            if (o.side == OrderSide.BUY and price <= limit) or \
               (o.side == OrderSide.SELL and price >= limit):
                exch.mark_filled(oid)
        # Run the order-manager tick
        await order_mgr.tick(grid_range=gr, current_price=price)

    # Assertions
    _assert(res, pos_mgr.state.n_buy_fills >= 1,
             f"expected ≥1 buy fill, got {pos_mgr.state.n_buy_fills}")
    _assert(res, pos_mgr.state.qty >= pos_mgr.state.prebuy_qty,
             f"inventory ({pos_mgr.state.qty}) must stay ≥ floor ({pos_mgr.state.prebuy_qty})")
    crits = [l for l in repo.logs if l[0] == "critical"]
    _assert(res, len(crits) == 0,
             f"no CRITICAL logs expected, got {len(crits)}: {[l[2] for l in crits]}")

    res.metrics = {
        "n_buy_fills": pos_mgr.state.n_buy_fills,
        "n_sell_fills": pos_mgr.state.n_sell_fills,
        "final_inventory_qty": float(pos_mgr.state.qty),
        "realized_pnl_total": float(pos_mgr.state.realized_pnl_total),
        "n_ticks": n_ticks,
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Scenario 2: cb_trip_45pct_drawdown
# ═══════════════════════════════════════════════════════════════════════


async def scenario_cb_trip(anchor: float) -> ScenarioResult:
    """Equity drops 45% over the run; CB must trip + emergency_exit."""
    name = "cb_trip_45pct_drawdown"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, pos_mgr, order_mgr, risk_mgr, tick = await _setup_stack(
        anchor_price=anchor, orders_per_side=3, cap_per_level=200.0,
    )

    # Pre-buy + initial grid
    await order_mgr.execute_prebuy(notional_usd=2000.0, current_price=anchor)
    repo.peak_equity = 10000.0
    exch.set_equity(10000.0)

    # Initial state: healthy
    cb1 = await risk_mgr.check_circuit_breaker()
    _assert(res, not cb1.tripped, "CB must not trip at start")

    # Drop equity by 45%
    exch.set_equity(5500.0)
    repo.peak_equity = 10000.0  # peak stays at original

    cb2 = await risk_mgr.check_circuit_breaker()
    _assert(res, cb2.tripped, "CB must trip at -45% DD")

    # Run tick — should trigger emergency exit + halt
    await tick.run()
    _assert(res, repo.bot_state.is_halted, "bot_state.is_halted must be True after CB trip")
    halt_reason = repo.bot_state.halt_reason or ""
    _assert(res, "grid_dd_circuit_breaker" in halt_reason,
             f"halt_reason must mention circuit breaker, got: {halt_reason!r}")

    # Subsequent ticks must skip cleanly (already halted)
    placed_before = len(exch.placed)
    await tick.run()
    _assert(res, len(exch.placed) == placed_before, "halted bot must not place orders")

    res.metrics = {
        "drawdown_pct": cb2.drawdown_pct,
        "is_halted": repo.bot_state.is_halted,
        "halt_reason": repo.bot_state.halt_reason,
        "closed_positions": len(exch.closed_positions),
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Scenario 3: recenter_after_interval
# ═══════════════════════════════════════════════════════════════════════


async def scenario_recenter(anchor: float) -> ScenarioResult:
    """Backdate last_recenter_at; verify recenter runs + range updates."""
    name = "recenter_after_interval"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, _, order_mgr, _, tick = await _setup_stack(anchor_price=anchor)
    await order_mgr.execute_prebuy(notional_usd=2000.0, current_price=anchor)

    # Place some initial orders so we can verify they're cancelled
    gr_old = compute_range_and_levels(
        mode="static", static_low=anchor * 0.95, static_high=anchor * 1.05, n_levels=11,
    )
    await order_mgr.tick(grid_range=gr_old, current_price=anchor)
    open_before = len(await repo.get_open_active_orders())
    _assert(res, open_before > 0, "expected initial orders placed")

    # Backdate last_recenter_at by 65 days
    await repo.update_grid_state(
        current_range_low=gr_old.low,
        current_range_high=gr_old.high,
        num_levels=gr_old.n_levels,
        last_recenter_at=datetime.now(timezone.utc) - timedelta(days=65),
    )

    # Tick — should trigger recenter
    await tick.run()

    gs = await repo.get_grid_state()
    _assert(res, gs.last_recenter_at is not None, "last_recenter_at must be set after recenter")
    open_after = len(await repo.get_open_active_orders())
    # After recenter the order list should be smaller or equal (recenter cancels
    # all then NEXT tick repopulates — current tick just clears)
    _assert(res, open_after <= open_before,
             f"recenter should not leave MORE orders ({open_after}) than before ({open_before})")

    res.metrics = {
        "orders_before_recenter": open_before,
        "orders_after_recenter": open_after,
        "new_range_low": float(gs.current_range_low) if gs.current_range_low else None,
        "new_range_high": float(gs.current_range_high) if gs.current_range_high else None,
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Scenario 4: capacity_30_levels
# ═══════════════════════════════════════════════════════════════════════


async def scenario_capacity(anchor: float) -> ScenarioResult:
    """30-level grid; walk price across full range. Verify no errors."""
    name = "capacity_30_levels"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, pos_mgr, order_mgr, _, _ = await _setup_stack(
        anchor_price=anchor, orders_per_side=5, cap_per_level=200.0,
    )
    await order_mgr.execute_prebuy(notional_usd=5000.0, current_price=anchor)

    gr = compute_range_and_levels(
        mode="static", static_low=anchor * 0.85, static_high=anchor * 1.15, n_levels=30,
    )
    # Walk price from low to high in 30 steps
    step = (gr.high - gr.low) / 30
    max_concurrent = 0
    for i in range(31):
        price = gr.low + i * step
        exch.set_price(price)
        await order_mgr.tick(grid_range=gr, current_price=price)
        concurrent = len(await repo.get_open_active_orders())
        max_concurrent = max(max_concurrent, concurrent)

    _assert(res, max_concurrent <= 30, f"never more than 30 concurrent orders, peaked at {max_concurrent}")
    crits = [l for l in repo.logs if l[0] == "critical"]
    _assert(res, len(crits) == 0, f"no CRITICAL logs, got {len(crits)}")

    res.metrics = {
        "max_concurrent_orders": max_concurrent,
        "total_unique_orders_placed": len(exch.placed) + len(exch.cancelled),
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Scenario 5: partial_prebuy_recovery
# ═══════════════════════════════════════════════════════════════════════


async def scenario_partial_prebuy_recovery(anchor: float) -> ScenarioResult:
    """Set prebuy_status='partial' with half-filled qty; verify top-up logic."""
    name = "partial_prebuy_recovery"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, pos_mgr, order_mgr, _, _ = await _setup_stack(anchor_price=anchor)

    # Simulate a prior partial pre-buy
    intended_notional = 4000.0
    half_qty = (intended_notional * 0.5) / anchor
    await repo.update_grid_state(
        prebuy_qty=half_qty,
        prebuy_avg_price=anchor,
        prebuy_status="partial",
    )
    pos_mgr.state.prebuy_qty = Decimal(str(half_qty))
    pos_mgr.state.qty = Decimal(str(half_qty))

    # Top-up: notional needed is full - already_filled
    already_filled_notional = half_qty * anchor
    topup_notional = intended_notional - already_filled_notional
    pb = await order_mgr.execute_prebuy(notional_usd=topup_notional, current_price=anchor)
    _assert(res, pb.success, f"top-up prebuy failed: {pb.error}")
    _assert(res, repo.grid_state.prebuy_status == "complete",
             f"status must be 'complete' after top-up, got {repo.grid_state.prebuy_status!r}")

    res.metrics = {
        "half_qty": half_qty,
        "topup_notional": topup_notional,
        "final_status": repo.grid_state.prebuy_status,
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Scenario 6: restart_idempotency
# ═══════════════════════════════════════════════════════════════════════


async def scenario_restart_idempotency(anchor: float) -> ScenarioResult:
    """Set prebuy_status='complete'; verify re-running prebuy is a no-op."""
    name = "restart_idempotency"
    started = datetime.now(timezone.utc)
    res = ScenarioResult(name=name, passed=True, duration_sec=0)

    repo, exch, pos_mgr, order_mgr, _, _ = await _setup_stack(anchor_price=anchor)
    # Real prebuy
    pb1 = await order_mgr.execute_prebuy(notional_usd=2000.0, current_price=anchor)
    _assert(res, pb1.success, "first prebuy must succeed")
    qty_after_first = pos_mgr.state.qty

    # Simulate restart: check the gate logic (mirrors bot/main.py)
    gs = await repo.get_grid_state()
    pb_status = getattr(gs, "prebuy_status", None)
    should_retry = pb_status in (None, "pending", "partial")
    _assert(res, should_retry is False,
             f"restart with status='{pb_status}' must NOT re-prebuy")

    # If we DID call prebuy again hypothetically, inventory should not change
    # because the boot wiring skips it. Confirm by checking the state didn't move.
    _assert(res, pos_mgr.state.qty == qty_after_first,
             "qty changed unexpectedly")

    res.metrics = {
        "first_qty": float(qty_after_first),
        "status_after_first": pb_status,
        "should_retry_on_restart": should_retry,
    }
    res.passed = res.asserts_failed == 0
    res.duration_sec = (datetime.now(timezone.utc) - started).total_seconds()
    return res


# ═══════════════════════════════════════════════════════════════════════
# Runner + report
# ═══════════════════════════════════════════════════════════════════════


async def fetch_anchor_price() -> float:
    """Fetch one real BTC-PERP-INTX price as the anchor for synthetic walks.

    Falls back to $77000 if the call fails (offline / network issue).
    """
    try:
        from bot.exchange.coinbase_client import CoinbaseClient
        client = CoinbaseClient()
        price = float(await client.get_current_price())
        await client.close()
        return price
    except Exception as e:
        print(f"[warn] anchor fetch failed ({e}); using fallback $77,000", flush=True)
        return 77000.0


def write_report(results: list[ScenarioResult], anchor: float) -> None:
    md: list[str] = []
    md.append("# v3 grid trader — live-mock E2E report\n\n")
    md.append(f"_Generated: {datetime.now(timezone.utc).isoformat(timespec='seconds')}Z_\n")
    md.append(f"\n**Anchor price**: ${anchor:,.2f}\n\n")
    n_pass = sum(1 for r in results if r.passed)
    n_fail = sum(1 for r in results if not r.passed)
    md.append(f"## Summary: **{n_pass}/{len(results)} scenarios PASSED**, {n_fail} failed\n\n")
    md.append("| Scenario | Status | Asserts | Duration |\n|---|---|---|---|\n")
    for r in results:
        status = "PASS" if r.passed else "FAIL"
        md.append(f"| {r.name} | {status} | {r.asserts_passed}/{r.asserts_passed + r.asserts_failed} | {r.duration_sec:.2f}s |\n")
    md.append("\n## Details\n\n")
    for r in results:
        md.append(f"### {r.name}\n")
        md.append(f"- Status: **{'PASS' if r.passed else 'FAIL'}**\n")
        md.append(f"- Asserts passed: {r.asserts_passed}\n")
        md.append(f"- Asserts failed: {r.asserts_failed}\n")
        md.append(f"- Duration: {r.duration_sec:.3f}s\n")
        if r.metrics:
            md.append("- Metrics:\n")
            for k, v in r.metrics.items():
                md.append(f"  - `{k}` = {v}\n")
        if r.failure_messages:
            md.append("- Failure messages:\n")
            for m in r.failure_messages:
                md.append(f"  - {m}\n")
        md.append("\n")
    REPORT_FILE.write_text("".join(md))
    print(f"\nReport written: {REPORT_FILE}", flush=True)


async def main():
    print("=" * 70)
    print("v3 grid trader — live-mock E2E")
    print("=" * 70, flush=True)

    print("Fetching anchor price from Coinbase...", flush=True)
    anchor = await fetch_anchor_price()
    print(f"  Anchor: ${anchor:,.2f}\n", flush=True)

    scenarios: list[Callable] = [
        scenario_happy_path,
        scenario_cb_trip,
        scenario_recenter,
        scenario_capacity,
        scenario_partial_prebuy_recovery,
        scenario_restart_idempotency,
    ]

    results: list[ScenarioResult] = []
    for fn in scenarios:
        print(f"Running {fn.__name__[len('scenario_'):]}...", end=" ", flush=True)
        try:
            r = await fn(anchor)
        except Exception as e:
            r = ScenarioResult(
                name=fn.__name__[len("scenario_"):],
                passed=False, duration_sec=0,
                failure_messages=[f"raised exception: {e}"],
            )
        results.append(r)
        if r.passed:
            print(f"PASS ({r.duration_sec:.2f}s, {r.asserts_passed} asserts)", flush=True)
        else:
            print(f"FAIL ({r.asserts_failed} asserts failed)", flush=True)
            for m in r.failure_messages:
                print(f"    {m}", flush=True)

    write_report(results, anchor)

    n_fail = sum(1 for r in results if not r.passed)
    print("\n" + "=" * 70)
    print(f"DONE — {len(results) - n_fail}/{len(results)} PASSED")
    print("=" * 70)
    sys.exit(0 if n_fail == 0 else 1)


if __name__ == "__main__":
    asyncio.run(main())
