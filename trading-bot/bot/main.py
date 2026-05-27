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
import os
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

    # ---- Mode-change detection ----
    # If the env var TRADING_MODE has changed since last boot, the persisted
    # equity-derived state (peak_equity, circuit_breaker starting_equity, balance
    # history) is from a DIFFERENT money scale (e.g. $10K paper → $1K live) and
    # will produce phantom drawdowns that immediately trip the total circuit
    # breaker. Reset that state to match the new scale. The actual equity will
    # be re-snapshotted by the background_boot once the exchange is ready.
    mode_changed = state.trading_mode != settings.TRADING_MODE
    if mode_changed:
        logger.warning(
            "trading_mode_changed",
            db_says=state.trading_mode,
            env_says=settings.TRADING_MODE,
            note="resetting persisted equity state to avoid phantom drawdown",
        )
        await repo.update_bot_state(trading_mode=settings.TRADING_MODE)
        # Wipe stale balance snapshots — they're at the OLD mode's scale
        async with async_session_factory() as session:
            from sqlalchemy import text
            await session.execute(text("DELETE FROM tb_balance_history"))
            # Mark existing circuit breakers as needing re-seed (we'll
            # re-seed in background_boot once we have a live equity reading)
            await session.execute(text("DELETE FROM tb_circuit_breakers"))
            await session.commit()
        await repo.log(
            "warn", "lifecycle",
            f"Trading mode flipped: {state.trading_mode} → {settings.TRADING_MODE}. "
            f"Cleared stale tb_balance_history + tb_circuit_breakers — will "
            f"re-seed from real equity in background_boot."
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

    # ---- v3 grid stack (BOT_ENGINE=grid only) ----
    # Instantiate the cheap components now; defer GridOrderManager + tick
    # handler until equity is known (in _background_boot). The scheduler
    # accepts grid_tick_handler=None at construct time — we set it via
    # `scheduler.grid_tick_handler = ...` once instantiated, and the
    # scheduler.start() call happens AFTER that in _background_boot.
    grid_tick_handler = None
    grid_order_mgr = None
    grid_pos_mgr = None
    grid_risk_mgr = None
    if settings.BOT_ENGINE == "grid":
        from bot.execution.grid_position_manager import GridPositionManager
        from bot.risk.grid_risk_manager import GridRiskManager

        # These two only need repo + exchange handles; they don't need equity.
        grid_pos_mgr = GridPositionManager(
            repository=repo,
            long_only=settings.GRID_LONG_ONLY,
            floor_fraction=settings.GRID_INVENTORY_FLOOR_FRACTION,
        )
        grid_risk_mgr = GridRiskManager(
            repository=repo,
            exchange=exchange,
            dd_threshold_pct=settings.GRID_DD_CIRCUIT_BREAKER_PCT,
            rearm_ma_days=settings.GRID_DD_REARM_MA_DAYS,
        )
        logger.info(
            "grid_stack_pre_wired",
            note="GridOrderManager + GridTickHandler deferred until equity is known",
            num_levels=settings.GRID_NUM_LEVELS,
            prebuy_pct=settings.GRID_PREBUY_PCT,
            tick_interval_sec=settings.GRID_TICK_INTERVAL_SEC,
        )

    scheduler = TickScheduler(
        candle_store=candle_store,
        regime_detector=regime_detector,
        ema_strategy=ema_strategy,
        bb_rsi_strategy=bb_rsi_strategy,
        trade_lifecycle=trade_lifecycle,
        position_manager=position_manager,
        repository=repo,
        exchange=exchange,
        grid_tick_handler=grid_tick_handler,
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

        # ---- One-time Coinbase auth test (set COINBASE_TEST_AUTH=true to run) ----
        # Verifies that CB_API_KEY + CB_API_SECRET can hit the authenticated
        # accounts endpoint. Read-only — no orders placed. Result is logged
        # to BOTH structlog AND tb_bot_log so it shows in the dashboard.
        # Remove the env var after a successful test.
        if os.environ.get("COINBASE_TEST_AUTH", "").lower() in ("true", "1", "yes"):
            try:
                from bot.exchange.coinbase_client import CoinbaseClient
                logger.info("coinbase_auth_test_starting")
                test_client = CoinbaseClient()
                balance = await test_client.get_balance()
                positions = await test_client.get_positions()
                # Mask the key ID — show only first 8 chars
                key_hint = (settings.CB_API_KEY[:8] + "...") if settings.CB_API_KEY else "(unset)"
                logger.info(
                    "coinbase_auth_test_PASSED",
                    balance_usd=str(balance),
                    open_positions=len(positions),
                    key_id_hint=key_hint,
                )
                await repo.log(
                    "info", "coinbase",
                    f"AUTH TEST PASSED. Available collateral balance: ${balance} "
                    f"(currency auto-detected — see balance_selected log for which one). "
                    f"{len(positions)} open positions on exchange. "
                    f"Key ID starts with: {key_hint}. "
                    f"Safe to flip TRADING_MODE=live when ready, "
                    f"provided this balance reflects your INTENDED trading capital."
                )
                await test_client.close()
            except Exception as exc:
                logger.error("coinbase_auth_test_FAILED", error=str(exc), exc_info=True)
                await repo.log(
                    "error", "coinbase",
                    f"AUTH TEST FAILED: {exc}. "
                    f"Do NOT flip TRADING_MODE=live until this is resolved. "
                    f"Common causes: wrong key/secret, IP allowlist mismatch, "
                    f"key uses Cloud Developer Platform format (need legacy HMAC key), "
                    f"insufficient scopes (need View + Trade)."
                )

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

        # ---- v3 grid: instantiate equity-dependent components, load state, pre-buy ----
        # Done AFTER candle warmup + circuit-breaker seed so we have equity
        # to size the grid. Skipped entirely if BOT_ENGINE != "grid".
        nonlocal grid_order_mgr, grid_tick_handler  # set in outer scope
        if settings.BOT_ENGINE == "grid" and grid_pos_mgr is not None:
            try:
                # Get the live equity (post-candle-warmup, post-CB-seed)
                live_equity = float(await exchange.get_equity())
                if live_equity <= 0:
                    logger.error(
                        "grid_boot_zero_equity",
                        equity=live_equity,
                        note="Cannot size grid with zero equity — skipping pre-buy",
                    )
                else:
                    # AUDIT-FIX B: capital_per_level computed from REAL equity,
                    # not the PAPER_STARTING_BALANCE default. Critical in live mode.
                    cap_per_level = live_equity / settings.GRID_NUM_LEVELS

                    from bot.execution.grid_order_manager import GridOrderManager
                    from bot.scheduler.grid_tick import GridTickHandler

                    grid_order_mgr = GridOrderManager(
                        exchange=exchange,
                        repository=repo,
                        position_manager=grid_pos_mgr,
                        symbol=settings.SYMBOL,
                        capital_per_level=cap_per_level,
                        leverage=settings.LEVERAGE,
                        maker_only=settings.GRID_MAKER_ONLY,
                        taker_fallback=settings.GRID_TAKER_FALLBACK,
                        orders_per_side=settings.GRID_OPEN_ORDERS_PER_SIDE,
                        order_stale_minutes=settings.GRID_ORDER_STALE_MINUTES,
                    )
                    grid_tick_handler = GridTickHandler(
                        exchange=exchange,
                        repository=repo,
                        grid_order_manager=grid_order_mgr,
                        grid_position_manager=grid_pos_mgr,
                        grid_risk_manager=grid_risk_mgr,
                        symbol=settings.SYMBOL,
                    )
                    # Inject into the already-built scheduler before .start()
                    scheduler.grid_tick_handler = grid_tick_handler
                    logger.info(
                        "grid_stack_finalized",
                        live_equity=live_equity,
                        cap_per_level=cap_per_level,
                    )

                # Restore in-memory inventory state from DB (no-op on first deploy)
                await grid_pos_mgr.load_from_db()
                logger.info(
                    "grid_position_loaded",
                    inventory_qty=float(grid_pos_mgr.state.qty),
                    prebuy_qty=float(grid_pos_mgr.state.prebuy_qty),
                )

                # Idempotent pre-buy: only fires if status indicates incomplete
                gs = await repo.get_grid_state()
                pb_status = getattr(gs, "prebuy_status", None) if gs else None
                if pb_status in (None, "pending", "partial"):
                    cur_equity = float(await exchange.get_equity())
                    target_notional = cur_equity * settings.GRID_PREBUY_PCT / 100
                    # Top-up logic: if 'partial', subtract what's already filled
                    if pb_status == "partial" and gs and gs.prebuy_qty:
                        cur_price = float(await exchange.get_current_price())
                        already_filled_notional = float(gs.prebuy_qty) * cur_price
                        target_notional = max(0, target_notional - already_filled_notional)
                        logger.info(
                            "grid_prebuy_resuming_partial",
                            already_filled_qty=float(gs.prebuy_qty),
                            remaining_notional=target_notional,
                        )

                    if target_notional <= 0:
                        logger.warning(
                            "grid_prebuy_skipped_zero_notional",
                            equity=cur_equity, pct=settings.GRID_PREBUY_PCT,
                        )
                    else:
                        current_price = float(await exchange.get_current_price())
                        result = await grid_order_mgr.execute_prebuy(
                            notional_usd=target_notional,
                            current_price=current_price,
                        )
                        if result.success:
                            logger.info(
                                "grid_prebuy_success",
                                qty=float(result.filled_qty),
                                avg_price=float(result.avg_fill_price),
                            )
                            await repo.log(
                                "info", "lifecycle",
                                f"Grid pre-buy filled: {float(result.filled_qty)} BTC "
                                f"@ avg ${float(result.avg_fill_price):.2f}",
                            )
                        else:
                            logger.critical(
                                "grid_prebuy_failed",
                                error=result.error,
                            )
                            await repo.log(
                                "critical", "lifecycle",
                                f"Grid pre-buy FAILED: {result.error}. "
                                f"Bot will halt — manual intervention required."
                            )
                            await repo.update_bot_state(
                                is_halted=True,
                                halt_reason=f"grid_prebuy_failed: {result.error}",
                            )
                else:
                    logger.info(
                        "grid_prebuy_already_complete",
                        status=pb_status,
                        qty=float(gs.prebuy_qty) if gs and gs.prebuy_qty else 0,
                    )
            except Exception as exc:
                logger.error("grid_boot_failed", error=str(exc), exc_info=True)
                # Non-fatal — the scheduler will still start; manual diagnosis needed

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
