"""JSON API routes consumed by the dashboard frontend."""

from datetime import datetime, timezone
from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.templating import Jinja2Templates


def register_routes(app: FastAPI, repo, exchange, templates: Jinja2Templates):
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
                    "metadata": log.metadata,
                    "created_at": log.created_at.isoformat(),
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
        open_trades = await repo.get_open_trades()
        closed = 0
        for trade in open_trades:
            try:
                size = trade.position_size
                if size and size > 0:
                    await exchange.close_position(trade.direction, size)
                    await repo.update_trade(
                        str(trade.id),
                        status="closed",
                        exit_at=datetime.now(timezone.utc),
                    )
                    closed += 1
            except Exception as e:
                await repo.log("error", "dashboard", f"Failed to close trade {trade.id}: {e}")

        await repo.log("warn", "dashboard", f"Close-all executed: {closed} positions closed")
        return {"closed": closed}
