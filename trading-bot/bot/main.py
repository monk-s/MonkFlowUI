"""
BTC Trading Bot — Main entrypoint.

Boot order (rearranged for fast healthcheck):
  1. Logging + database
  2. Exchange client + dashboard wiring  (cheap)
  3. **Start uvicorn**  → /health responds in seconds
  4. Background task: candle warmup, circuit breaker seed, orphan recovery,
     initial balance snapshot, scheduler.start()

This separation matters because Railway's healthcheck times out (default 30s)
long before candle warmup finishes (~50s cross-region for 400 candles). The
dashboard `/health` endpoint must respond ASAP. The bot's trading machinery
comes online a minute later; it doesn't need to gate the healthcheck.

Serves the dashboard on the PORT assigned by Railway.
"""

from __future__ import annotations

import asyncio
import signal
import sys
from decimal import Decimal

import uvicorn

from config.logging_config import get_logger, setup_logging
from config.settings import settings

logger = get_logger("main")


async def boot() -> None:
    """Initialize all subsystems and start the event loop."""

    setup_logging()
    logger.info(
        "bot_starting",
        mode=settings.TRADING_MODE,
        symbol=settings.SYMBOL,
        leverage=settings.LEVERAGE,
    )

    # ---- 1. Database ----
    logger.info("initializing_database")
    from bot.persistence.database import init_db, async_session_factory
    await init_db()

    from bot.persistence.repository import Repository
    repo = Repository(async_session_factory)

    # Ensure bot state row exists
    state = await repo.get_bot_state()
    logger.info(
        "bot_state_loaded",
        mode=state.trading_mode,
        halted=state.is_halted,
    )

    # ---- 2. Exchange client (cheap) ----
    logger.info("initializing_exchange", mode=settings.TRADING_MODE)
    if settings.TRADING_MODE == "paper":
        from bot.exchange.paper_engine import PaperEngine

        exchange = PaperEngine()
        logger.info(
            "paper_engine_ready",
            balance=settings.PAPER_STARTING_BALANCE,
        )
    else:
        from bot.exchange.coinbase_client import CoinbaseClient
        exchange = CoinbaseClient()
        logger.info("live_exchange_ready")

    # Set leverage
    try:
        await exchange.set_leverage(Decimal(str(settings.LEVERAGE)))
        logger.info("leverage_set", leverage=settings.LEVERAGE)
    except Exception as exc:
        logger.warning("leverage_set_failed", error=str(exc))

    # ---- 3. Wire strategy + risk + execution layers (cheap, in-memory) ----
    from bot.strategy.regime_detector import RegimeDetector
    from bot.strategy.ema_trend import EMATrendStrategy
    from bot.strategy.bb_rsi_reversion import BBRSIReversionStrategy
    from bot.risk.risk_manager import RiskManager
    from bot.risk.trailing_stop import TrailingStopManager
    from bot.execution.order_manager import OrderManager
    from bot.execution.position_manager import PositionManager
    from bot.execution.trade_lifecycle import TradeLifecycle
    from bot.data.candle_store import CandleStore
    from bot.scheduler.tick_scheduler import TickScheduler

    regime_detector = RegimeDetector()
    ema_strategy = EMATrendStrategy(regime_detector)
    bb_rsi_strategy = BBRSIReversionStrategy(regime_detector)
    risk_manager = RiskManager()
    trailing_stop_mgr = TrailingStopManager()
    order_manager = OrderManager(exchange)

    trade_lifecycle = TradeLifecycle(
        exchange=exchange,
        repository=repo,
        risk_manager=risk_manager,
        order_manager=order_manager,
    )

    position_manager = PositionManager(
        exchange=exchange,
        repository=repo,
        risk_manager=risk_manager,
        trailing_stop_manager=trailing_stop_mgr,
        order_manager=order_manager,
    )

    candle_store = CandleStore(exchange=exchange, repository=repo)

    scheduler = TickScheduler(
        candle_store=candle_store,
        regime_detector=regime_detector,
        ema_strategy=ema_strategy,
        bb_rsi_strategy=bb_rsi_strategy,
        trade_lifecycle=trade_lifecycle,
        position_manager=position_manager,
        repository=repo,
        exchange=exchange,
    )

    # ---- 4. Wire dashboard (routes registered, ready to serve) ----
    from dashboard.app import app as dashboard_app, init_dashboard
    init_dashboard(repo, exchange, scheduler)

    # ---- 5. Start uvicorn FIRST so /health responds during heavy init ----
    # Railway's healthcheck fires immediately after deploy. The dashboard
    # /health endpoint is a no-arg "ok" response and must respond within seconds.
    # We start uvicorn here, then do the slow candle warmup in the background.

    # Read PORT directly from env so we're not relying on Pydantic Settings
    # to have parsed it. Railway sets $PORT to a random port at container start.
    # Fall back to settings.PORT (8080) only if env is genuinely empty.
    import os
    env_port = os.environ.get("PORT", "").strip()
    try:
        bind_port = int(env_port) if env_port else settings.PORT
    except ValueError:
        logger.warning("invalid_port_env", value=env_port, fallback=settings.PORT)
        bind_port = settings.PORT

    bind_host = os.environ.get("DASHBOARD_HOST", settings.DASHBOARD_HOST)

    logger.info(
        "uvicorn_binding",
        host=bind_host,
        port=bind_port,
        port_source="env" if env_port else "settings_default",
        env_PORT_raw=env_port or "(unset)",
    )

    config = uvicorn.Config(
        dashboard_app,
        host=bind_host,
        port=bind_port,
        log_level="info",
        access_log=True,  # show every healthcheck hit so we can confirm Railway reached us
    )
    server = uvicorn.Server(config)

    loop = asyncio.get_running_loop()
    shutdown_event = asyncio.Event()

    def _handle_signal(sig: signal.Signals) -> None:
        logger.info("shutdown_signal_received", signal=sig.name)
        shutdown_event.set()

    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _handle_signal, sig)

    serve_task = asyncio.create_task(server.serve())

    # Give uvicorn a tick to actually bind the socket before we log "listening"
    # and before we kick off the slow background init. If binding fails (port
    # already in use, permissions, etc.), the serve_task will error and we
    # want to surface that loudly.
    for _ in range(20):  # up to 2 seconds
        if getattr(server, "started", False):
            break
        if serve_task.done():
            # Server crashed before starting — surface the exception
            try:
                serve_task.result()
            except Exception as exc:
                logger.error("uvicorn_startup_failed", error=str(exc), exc_info=True)
                raise
            break
        await asyncio.sleep(0.1)

    logger.info(
        "dashboard_listening",
        host=bind_host,
        port=bind_port,
        started=getattr(server, "started", False),
    )

    # ---- 6. Background boot: slow operations that mustn't block healthcheck ----
    async def _background_boot() -> None:
        """
        Run the slow / network-bound init in the background so the dashboard's
        /health endpoint can respond to Railway's healthcheck during boot.
        """
        logger.info("background_boot_started")

        # Candle warmup (slow on first boot — ~5-30s depending on DB latency)
        try:
            await candle_store.initialize()
            logger.info("candle_store_warmed")
        except Exception as exc:
            logger.error("candle_warmup_failed", error=str(exc))
            # Non-fatal: scheduler will retry on first tick

        # Seed circuit breakers (one round-trip)
        try:
            starting_eq = float(await exchange.get_equity())
            await repo.init_circuit_breakers(starting_eq)
            logger.info("circuit_breakers_initialized", equity=starting_eq)
        except Exception as exc:
            logger.warning("circuit_breaker_seed_failed", error=str(exc))

        # Recover any trades stuck in entry_pending from a previous crash
        try:
            recovered = await trade_lifecycle.recover_orphaned_trades()
            if recovered:
                logger.info("orphaned_trades_recovered", count=recovered)
        except Exception as exc:
            logger.error("recovery_failed", error=str(exc))

        # Initial balance snapshot for the equity curve
        try:
            equity = float(await exchange.get_equity())
            await repo.record_balance(
                equity=equity,
                cash=equity,
                unrealized_pnl=0.0,
                open_positions=0,
                heat=0.0,
                drawdown=0.0,
            )
        except Exception as exc:
            logger.warning("initial_balance_snapshot_failed", error=str(exc))

        # Now that data is loaded, start the trading scheduler
        scheduler.start()

        await repo.log(
            "info", "lifecycle",
            f"Bot started in {settings.TRADING_MODE.upper()} mode | "
            f"Symbol: {settings.SYMBOL} | Leverage: {settings.LEVERAGE}x",
        )
        logger.info(
            "bot_ready",
            mode=settings.TRADING_MODE,
            dashboard_port=settings.PORT,
        )

    boot_task = asyncio.create_task(_background_boot())

    # ---- 7. Wait for shutdown signal ----
    await shutdown_event.wait()

    # ---- 8. Graceful shutdown ----
    logger.info("shutting_down")

    # Cancel the background boot if it's still running
    if not boot_task.done():
        boot_task.cancel()

    # Stop the scheduler if it started
    try:
        scheduler.stop()
    except Exception:
        pass

    server.should_exit = True
    await serve_task

    try:
        await repo.log("info", "lifecycle", "Bot shut down gracefully")
    except Exception:
        pass
    logger.info("bot_stopped")


def main() -> None:
    """CLI entrypoint."""
    try:
        asyncio.run(boot())
    except KeyboardInterrupt:
        pass
    except Exception as exc:
        print(f"Fatal error: {exc}", file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
