"""JSON API routes consumed by the dashboard frontend."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates


def register_routes(app: FastAPI, repo, exchange, templates: Jinja2Templates, scheduler=None):
    """Register all dashboard routes."""

    @app.get("/")
    async def index(request: Request):
        return templates.TemplateResponse("index.html", {"request": request})

    @app.get("/api/overview")
    async def overview():
        state = await repo.get_bot_state()
        equity = await exchange.get_equity()
        positions = await exchange.get_positions()
        open_trades = await repo.get_open_trades()
        stats = await repo.get_trade_stats()
        daily_pnl = await repo.get_daily_pnl()
        peak = await repo.get_peak_equity()
        breakers = await repo.get_circuit_breakers()

        unrealized = sum(float(p.unrealized_pnl) for p in positions)
        total_risk = sum(float(t.risk_amount or 0) for t in open_trades)
        heat = (total_risk / float(equity) * 100) if equity > 0 else 0
        drawdown = ((float(equity) - peak) / peak * 100) if peak > 0 else 0

        return {
            "status": "HALTED" if state.is_halted else state.trading_mode.upper(),
            "halt_reason": state.halt_reason,
            "regime": state.current_regime or "unknown",
            "equity": float(equity),
            "cash_balance": float(equity) - unrealized,
            "unrealized_pnl": unrealized,
            "daily_pnl": daily_pnl,
            "total_pnl": float(equity) - float(state.paper_balance if state.trading_mode == "paper" else (state.live_balance or 0)),
            "portfolio_heat": round(heat, 2),
            "drawdown_pct": round(drawdown, 2),
            "peak_equity": peak,
            "open_positions": len(open_trades),
            "last_heartbeat": state.last_heartbeat.isoformat() if state.last_heartbeat else None,
            "circuit_breakers": [
                {
                    "period": cb.period,
                    "threshold": float(cb.threshold_pct),
                    "current": float(cb.drawdown_pct),
                    "tripped": cb.is_tripped,
                }
                for cb in breakers
            ],
            "stats": stats,
        }

    @app.get("/api/positions")
    async def get_positions():
        """Unified positions view: v1 trade records + v3 grid-managed perp.

        v1 mode: returns tb_trades open trades (entry/stop/target lifecycle).
        v3 mode: returns the grid-managed perp position from tb3_grid_state
                 (continuous long position adjusted by buy/sell fills).
        Both lists are returned; the frontend renders them with different
        styling so the user sees a single "Open Positions" view regardless
        of which engine is running.
        """
        trades = await repo.get_open_trades()
        current_price = float(await exchange.get_current_price())

        result = []
        for t in trades:
            entry = float(t.entry_price or t.signal_price)
            if t.direction == "long":
                pnl = float(t.position_size or 0) * (current_price - entry)
            else:
                pnl = float(t.position_size or 0) * (entry - current_price)

            risk = float(t.risk_amount or 1)
            r_multiple = pnl / risk if risk > 0 else 0
            stop_dist = abs(entry - float(t.stop_price or entry))
            r_progress = pnl / stop_dist if stop_dist > 0 else 0

            result.append({
                "id": str(t.id),
                "managed_by": "v1",
                "strategy": t.strategy,
                "direction": t.direction,
                "status": t.status,
                "entry_price": entry,
                "current_price": current_price,
                "stop_price": float(t.stop_price or 0),
                "target_price": float(t.target_price or 0),
                "trailing_stop": float(t.trailing_stop) if t.trailing_stop else None,
                "size_btc": float(t.position_size or 0),
                "risk_amount": risk,
                "unrealized_pnl": round(pnl, 2),
                "r_multiple": round(r_multiple, 2),
                "entry_at": t.entry_at.isoformat() if t.entry_at else None,
            })

        # v3 grid-managed position: read inventory from tb3_grid_state.
        # We surface it here so the Positions tab is a single source-of-truth
        # for "what am I holding right now?" regardless of engine.
        gs = await repo.get_grid_state()
        if gs is not None and gs.inventory_qty and float(gs.inventory_qty) > 0:
            inv_qty = float(gs.inventory_qty)
            avg_cost = float(gs.inventory_avg_cost or 0)
            # Long-only convention: grid only opens long perp positions
            unrealized = inv_qty * (current_price - avg_cost) if avg_cost else 0.0
            prebuy_qty = float(gs.prebuy_qty or 0)
            n_buy_fills = int(gs.n_buy_fills or 0)
            n_sell_fills = int(gs.n_sell_fills or 0)
            result.append({
                "id": "grid-managed",
                "managed_by": "grid",
                "strategy": "grid",
                "direction": "long",
                "status": "open",
                "entry_price": avg_cost,
                "current_price": current_price,
                "stop_price": 0,            # no fixed stop — circuit breaker handles catastrophe
                "target_price": 0,           # no fixed target — grid trades the range
                "trailing_stop": None,
                "size_btc": inv_qty,
                "risk_amount": 0,
                "unrealized_pnl": round(unrealized, 2),
                "r_multiple": 0,             # not meaningful for grid
                "entry_at": gs.prebuy_at.isoformat() if gs.prebuy_at else None,
                # Grid-specific fields the frontend can use:
                "inventory_floor_qty": prebuy_qty,
                "inventory_above_floor_qty": round(inv_qty - prebuy_qty, 6),
                "n_buy_fills": n_buy_fills,
                "n_sell_fills": n_sell_fills,
                "realized_pnl_total": float(gs.realized_pnl_total or 0),
                "fees_paid_total": float(gs.fees_paid_total or 0),
                "prebuy_status": getattr(gs, "prebuy_status", None),
            })

        return {"positions": result, "current_price": current_price}

    @app.get("/api/trades")
    async def get_trade_history(limit: int = 100, offset: int = 0):
        trades = await repo.get_trade_history(limit=limit, offset=offset)
        stats = await repo.get_trade_stats()

        result = []
        for t in trades:
            result.append({
                "id": str(t.id),
                "strategy": t.strategy,
                "direction": t.direction,
                "status": t.status,
                "entry_price": float(t.entry_price) if t.entry_price else None,
                "exit_price": float(t.exit_price) if t.exit_price else None,
                "stop_price": float(t.stop_price) if t.stop_price else None,
                "target_price": float(t.target_price) if t.target_price else None,
                "net_pnl": float(t.net_pnl) if t.net_pnl else None,
                "r_multiple": float(t.r_multiple) if t.r_multiple else None,
                "risk_amount": float(t.risk_amount) if t.risk_amount else None,
                "signal_at": t.signal_at.isoformat() if t.signal_at else None,
                "entry_at": t.entry_at.isoformat() if t.entry_at else None,
                "exit_at": t.exit_at.isoformat() if t.exit_at else None,
                "reject_reason": t.reject_reason,
            })

        return {"trades": result, "stats": stats}

    @app.get("/api/equity")
    async def get_equity_curve(limit: int = 500):
        history = await repo.get_balance_history(limit=limit)
        return {
            "points": [
                {
                    "timestamp": h.timestamp.isoformat(),
                    "equity": float(h.equity),
                    "drawdown": float(h.drawdown_pct),
                }
                for h in history
            ]
        }

    @app.get("/api/logs")
    async def get_logs(limit: int = 100, level: str = None, component: str = None):
        logs = await repo.get_logs(limit=limit, level=level, component=component)
        return {
            "logs": [
                {
                    "level": log.level,
                    "component": log.component,
                    "message": log.message,
                    # NB: model uses metadata_ (trailing underscore) because plain
                    # "metadata" collides with SQLAlchemy's DeclarativeBase.metadata
                    # (the MetaData registry). Accessing log.metadata returns the
                    # MetaData object → FastAPI's encoder recurses into every table
                    # reference and OOMs the worker.
                    "metadata": log.metadata_,
                    "created_at": log.created_at.isoformat() if log.created_at else None,
                }
                for log in logs
            ]
        }

    @app.get("/api/config")
    async def get_config():
        from config.settings import settings as s
        return {
            "trading_mode": s.TRADING_MODE,
            "symbol": s.SYMBOL,
            "leverage": s.LEVERAGE,
            "risk_per_trade": s.RISK_PER_TRADE_PCT,
            "min_rr": s.MIN_RR_RATIO,
            "max_heat": s.MAX_PORTFOLIO_HEAT_PCT,
            "max_positions": s.MAX_CONCURRENT_POSITIONS,
            "ema_fast": s.EMA_FAST_PERIOD,
            "ema_slow": s.EMA_SLOW_PERIOD,
            "bb_period": s.BB_PERIOD,
            "rsi_period": s.RSI_PERIOD,
            "atr_period": s.ATR_PERIOD,
            "trailing_activation_r": s.TRAILING_ACTIVATION_R,
            "circuit_breakers": {
                "daily": s.CB_DAILY_MAX_DRAWDOWN_PCT,
                "weekly": s.CB_WEEKLY_MAX_DRAWDOWN_PCT,
                "monthly": s.CB_MONTHLY_MAX_DRAWDOWN_PCT,
                "total": s.CB_TOTAL_MAX_DRAWDOWN_PCT,
            },
        }

    @app.post("/api/halt")
    async def halt_bot():
        await repo.update_bot_state(
            is_halted=True,
            halt_reason="Manual halt via dashboard",
            halted_at=datetime.now(timezone.utc),
        )
        await repo.log("warn", "dashboard", "Bot halted manually")
        return {"status": "halted"}

    @app.post("/api/resume")
    async def resume_bot():
        await repo.update_bot_state(
            is_halted=False,
            halt_reason=None,
            halted_at=None,
        )
        await repo.log("info", "dashboard", "Bot resumed manually")
        return {"status": "running"}

    @app.post("/api/close-all")
    async def close_all():
        """
        Attempt to close every open trade. H5: only mark a trade closed in DB
        AFTER Coinbase confirms the close (result.filled == True). Otherwise
        a queued-but-unfilled order would falsely show as closed on dashboard
        while the position remains live on the exchange.
        """
        open_trades = await repo.get_open_trades()
        requested = len(open_trades)
        confirmed_closed = 0
        still_open: list[str] = []

        for trade in open_trades:
            try:
                size = trade.position_size
                if not size or size <= 0:
                    still_open.append(str(trade.id))
                    continue
                result = await exchange.close_position(trade.direction, size)
                if result and getattr(result, "filled", False):
                    await repo.update_trade(
                        str(trade.id),
                        status="closed",
                        exit_at=datetime.now(timezone.utc),
                    )
                    confirmed_closed += 1
                else:
                    still_open.append(str(trade.id))
                    await repo.log(
                        "warn", "dashboard",
                        f"Close-all: trade {trade.id} close order accepted but NOT filled "
                        f"(result={result}). Position may still be live on Coinbase. "
                        f"Check the exchange UI."
                    )
            except Exception as e:
                still_open.append(str(trade.id))
                await repo.log("error", "dashboard", f"Failed to close trade {trade.id}: {e}")

        await repo.log(
            "warn", "dashboard",
            f"Close-all executed: requested={requested}, "
            f"confirmed_closed={confirmed_closed}, still_open={len(still_open)}"
        )
        return {
            "requested": requested,
            "confirmed_closed": confirmed_closed,
            "still_open": still_open,
        }

    # ------------------------------------------------------------------
    # Admin endpoints — fire scheduled ticks on demand (useful for
    # post-deploy smoke-tests and for compressing the paper-trading
    # observation window). These do exactly what the cron triggers do,
    # just without waiting for the clock.
    # ------------------------------------------------------------------

    @app.post("/api/admin/run-strategy-tick")
    async def run_strategy_tick_now():
        """Force the 4H strategy evaluation to run right now."""
        if scheduler is None:
            return {"ok": False, "error": "scheduler not wired into dashboard"}
        await repo.log(
            "info", "dashboard",
            "Manual strategy tick triggered via /api/admin/run-strategy-tick",
        )
        try:
            await scheduler.run_strategy_now()
            return {"ok": True, "ran": "strategy_tick"}
        except Exception as e:
            await repo.log("error", "dashboard", f"Manual strategy tick failed: {e}")
            return {"ok": False, "error": str(e)}

    @app.post("/api/admin/run-position-tick")
    async def run_position_tick_now():
        """Force the 60-second position monitor to run right now."""
        if scheduler is None:
            return {"ok": False, "error": "scheduler not wired into dashboard"}
        await repo.log(
            "info", "dashboard",
            "Manual position tick triggered via /api/admin/run-position-tick",
        )
        try:
            await scheduler._position_tick()
            return {"ok": True, "ran": "position_tick"}
        except Exception as e:
            await repo.log("error", "dashboard", f"Manual position tick failed: {e}")
            return {"ok": False, "error": str(e)}

    # ══════════════════════════════════════════════════════════════════
    # v3 GRID endpoints
    # ──────────────────────────────────────────────────────────────────
    # Return data from tb3_grid_state, tb3_active_orders, tb3_grid_fills,
    # tb3_grid_metrics. If running in v1 mode (BOT_ENGINE=ema_trend), the
    # tables are still queried (they exist post-migration), they're just
    # empty — frontend renders empty states.
    # ══════════════════════════════════════════════════════════════════

    @app.get("/api/grid/state")
    async def grid_state():
        """Current grid state: range, levels, inventory, prebuy, active orders.

        AUDIT-FIX A-final: belt-and-suspenders filter — hide rows whose
        `level_price` falls outside the currently-active range. Once A1+A4
        are in place, orphans should be reconciled at the cancel/recenter
        boundary; this filter ensures any future regression doesn't
        immediately re-inflate the dashboard count. The hidden count is
        surfaced as `hidden_out_of_range_count` so operators can spot
        the signal that something upstream is leaking again.
        """
        gs = await repo.get_grid_state()
        if gs is None:
            return {"initialized": False}
        active_all = await repo.get_open_active_orders()

        # Filter to in-range rows (if the range has been initialized).
        rlow = float(gs.current_range_low) if gs.current_range_low is not None else None
        rhigh = float(gs.current_range_high) if gs.current_range_high is not None else None
        if rlow is not None and rhigh is not None:
            active = []
            hidden_out_of_range_count = 0
            hidden_out_of_range_sample: list[dict] = []
            for o in active_all:
                lp = float(o.level_price)
                if rlow <= lp <= rhigh:
                    active.append(o)
                else:
                    hidden_out_of_range_count += 1
                    if len(hidden_out_of_range_sample) < 5:
                        hidden_out_of_range_sample.append({
                            "exchange_order_id": o.exchange_order_id,
                            "side": o.side,
                            "level_index": o.level_index,
                            "level_price": lp,
                            "created_at": o.created_at.isoformat() if o.created_at else None,
                        })
        else:
            # Range not initialized yet — show everything.
            active = active_all
            hidden_out_of_range_count = 0
            hidden_out_of_range_sample = []

        return {
            "initialized": True,
            "symbol": gs.symbol,
            "range_low": rlow,
            "range_high": rhigh,
            "num_levels": gs.num_levels,
            "capital_per_level": float(gs.capital_per_level) if gs.capital_per_level is not None else None,
            "prebuy_qty": float(gs.prebuy_qty) if gs.prebuy_qty is not None else None,
            "prebuy_avg_price": float(gs.prebuy_avg_price) if gs.prebuy_avg_price is not None else None,
            "prebuy_at": gs.prebuy_at.isoformat() if gs.prebuy_at else None,
            "prebuy_status": getattr(gs, "prebuy_status", None),
            "inventory_qty": float(gs.inventory_qty or 0),
            "inventory_avg_cost": float(gs.inventory_avg_cost) if gs.inventory_avg_cost is not None else None,
            "realized_pnl_total": float(gs.realized_pnl_total or 0),
            "fees_paid_total": float(gs.fees_paid_total or 0),
            "n_buy_fills": int(gs.n_buy_fills or 0),
            "n_sell_fills": int(gs.n_sell_fills or 0),
            "last_recenter_at": gs.last_recenter_at.isoformat() if gs.last_recenter_at else None,
            "next_recenter_at": gs.next_recenter_at.isoformat() if gs.next_recenter_at else None,
            "active_orders": [
                {
                    "id": o.id,
                    "exchange_order_id": o.exchange_order_id,
                    "side": o.side,
                    "level_index": o.level_index,
                    "level_price": float(o.level_price),
                    "qty": float(o.qty),
                    "status": o.status,
                    "created_at": o.created_at.isoformat() if o.created_at else None,
                    "last_polled_at": o.last_polled_at.isoformat() if o.last_polled_at else None,
                }
                for o in active
            ],
            "active_orders_count": len(active),
            # AUDIT-FIX A-final: surface the count of hidden out-of-range rows
            # so operators can detect upstream leaks via the dashboard.
            "hidden_out_of_range_count": hidden_out_of_range_count,
            "hidden_out_of_range_sample": hidden_out_of_range_sample,
        }

    @app.get("/api/grid/fills")
    async def grid_fills(since: str = None, limit: int = 100):
        """Paginated recent grid fills. `since` is an ISO8601 timestamp."""
        if since:
            try:
                since_dt = datetime.fromisoformat(since.replace("Z", "+00:00"))
            except (ValueError, TypeError):
                return {"error": f"invalid 'since' (need ISO8601): {since!r}"}
            fills = await repo.get_grid_fills_since(since_dt, limit=limit)
        else:
            fills = await repo.get_recent_grid_fills(limit=limit)
        return {
            "fills": [
                {
                    "id": f.id,
                    "created_at": f.created_at.isoformat() if f.created_at else None,
                    "side": f.side,
                    "level_index": f.level_index,
                    "fill_price": float(f.fill_price),
                    "fill_qty": float(f.fill_qty),
                    "fee_paid": float(f.fee_paid or 0),
                    "realized_pnl": float(f.realized_pnl or 0),
                    "inventory_after_qty": float(f.inventory_after_qty),
                    "inventory_after_avg_cost": float(f.inventory_after_avg_cost),
                    "exchange_order_id": f.exchange_order_id,
                }
                for f in fills
            ],
            "count": len(fills),
        }

    @app.get("/api/grid/metrics")
    async def grid_metrics(period: str = "30d"):
        """Daily aggregate metrics. `period` = 24h | 7d | 30d (default 30d)."""
        days_map = {"24h": 1, "7d": 7, "30d": 30, "90d": 90}
        days = days_map.get(period, 30)
        metrics = await repo.get_grid_daily_metrics(days=days)
        return {
            "period": period,
            "days": days,
            "metrics": [
                {
                    "date": m.date.isoformat() if m.date else None,
                    "n_buy_fills": m.n_buy_fills,
                    "n_sell_fills": m.n_sell_fills,
                    "gross_realized_pnl": float(m.gross_realized_pnl or 0),
                    "fees_paid": float(m.fees_paid or 0),
                    "net_pnl": float(m.net_pnl or 0),
                    "inventory_end_qty": float(m.inventory_end_qty) if m.inventory_end_qty is not None else None,
                    "inventory_end_avg_cost": float(m.inventory_end_avg_cost) if m.inventory_end_avg_cost is not None else None,
                    "equity_end": float(m.equity_end) if m.equity_end is not None else None,
                    "drawdown_pct": float(m.drawdown_pct) if m.drawdown_pct is not None else None,
                }
                for m in metrics
            ],
        }

    @app.post("/api/admin/run-grid-tick")
    async def run_grid_tick_now():
        """Force the grid maintenance tick to run right now (v3 only)."""
        if scheduler is None:
            return {"ok": False, "error": "scheduler not wired into dashboard"}
        await repo.log(
            "info", "dashboard",
            "Manual grid tick triggered via /api/admin/run-grid-tick",
        )
        try:
            await scheduler._grid_tick()
            return {"ok": True, "ran": "grid_tick"}
        except Exception as e:
            await repo.log("error", "dashboard", f"Manual grid tick failed: {e}")
            return {"ok": False, "error": str(e)}

    @app.post("/api/admin/force-recenter")
    async def force_recenter():
        """Cancel all open orders + rebuild the grid range immediately.

        Bypasses the natural recenter interval. Use after changing
        GRID_RANGE_PADDING_PCT / GRID_RECENTER_DAYS so the live bot
        picks up the new sizing without waiting (the natural recenter
        only fires every GRID_RECENTER_INTERVAL_DAYS = 14 days by
        default).
        """
        if scheduler is None or scheduler.grid_tick_handler is None:
            return {"ok": False, "error": "grid_tick_handler not wired into dashboard"}
        await repo.log(
            "info", "dashboard",
            "Force recenter triggered via /api/admin/force-recenter",
        )
        try:
            result = await scheduler.grid_tick_handler.force_recenter()
            return result
        except Exception as e:
            await repo.log("error", "dashboard", f"Force recenter failed: {e}")
            return {"ok": False, "error": str(e)}
