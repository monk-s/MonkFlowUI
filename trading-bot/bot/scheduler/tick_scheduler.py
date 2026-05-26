"""
Two scheduled ticks:
1. Strategy tick (every 4H candle close) — fetch data, run regime detection, generate signals
2. Position check tick (every 60s) — monitor positions, manage stops, check circuit breakers
"""

import asyncio
from datetime import datetime, timedelta, timezone

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("scheduler")


class TickScheduler:
    """
    Manages the two core loops of the trading bot:
    - Strategy evaluation on 4H candle closes
    - Position monitoring every 60 seconds
    """

    def __init__(
        self,
        candle_store,
        regime_detector,
        ema_strategy,
        bb_rsi_strategy,
        trade_lifecycle,
        position_manager,
        repository,
        exchange,
        grid_tick_handler=None,  # v3: optional GridTickHandler
    ):
        self.candle_store = candle_store
        self.regime_detector = regime_detector
        self.ema_strategy = ema_strategy
        self.bb_rsi_strategy = bb_rsi_strategy
        self.trade_lifecycle = trade_lifecycle
        self.position_manager = position_manager
        self.repo = repository
        self.exchange = exchange
        self.grid_tick_handler = grid_tick_handler
        self.scheduler = AsyncIOScheduler()
        self._running = False

    def start(self) -> None:
        """Start scheduled ticks.

        v3 grid mode (BOT_ENGINE=grid) registers ONLY the grid tick +
        heartbeat + balance snapshot. v1 mode (BOT_ENGINE=ema_trend)
        registers the legacy 4H strategy tick + 60s position tick.
        """
        if settings.BOT_ENGINE == "grid":
            # v3: grid tick replaces strategy + position ticks
            if self.grid_tick_handler is None:
                raise RuntimeError(
                    "BOT_ENGINE=grid but no grid_tick_handler provided to TickScheduler"
                )
            self.scheduler.add_job(
                self._grid_tick,
                IntervalTrigger(seconds=settings.GRID_TICK_INTERVAL_SEC),
                id="grid_tick",
                name=f"Grid Maintenance ({settings.GRID_TICK_INTERVAL_SEC}s)",
                max_instances=1,
                misfire_grace_time=30,
            )
            # Daily rollup: aggregate yesterday's grid fills at 00:05 UTC
            self.scheduler.add_job(
                self._grid_daily_rollup,
                CronTrigger(hour=0, minute=5, timezone="UTC"),
                id="grid_daily_rollup",
                name="Grid Daily Rollup (00:05 UTC)",
                max_instances=1,
                misfire_grace_time=3600,  # 1h grace for late deploys
            )
            logger.info(
                "scheduler_grid_mode",
                grid_interval=settings.GRID_TICK_INTERVAL_SEC,
            )
        else:
            # v1: legacy ema_trend mode
            hours = settings.STRATEGY_TICK_HOURS  # "0,4,8,12,16,20"
            self.scheduler.add_job(
                self._strategy_tick,
                CronTrigger(hour=hours, minute=1, timezone="UTC"),
                id="strategy_tick",
                name="Strategy Evaluation (4H)",
                max_instances=1,
                misfire_grace_time=300,
            )

            # Position check tick: every 60 seconds
            self.scheduler.add_job(
                self._position_tick,
                IntervalTrigger(seconds=settings.POSITION_CHECK_INTERVAL_SEC),
                id="position_tick",
                name="Position Monitor (60s)",
                max_instances=1,
                misfire_grace_time=30,
            )

        # Heartbeat: update bot_state every 5 minutes
        self.scheduler.add_job(
            self._heartbeat,
            IntervalTrigger(minutes=5),
            id="heartbeat",
            name="Heartbeat",
            max_instances=1,
        )

        # Balance snapshot: record every 15 minutes for equity curve
        self.scheduler.add_job(
            self._balance_snapshot,
            IntervalTrigger(minutes=15),
            id="balance_snapshot",
            name="Balance Snapshot",
            max_instances=1,
        )

        self.scheduler.start()
        self._running = True
        logger.info(
            "scheduler_started",
            engine=settings.BOT_ENGINE,
        )

    def stop(self) -> None:
        if self._running:
            self.scheduler.shutdown(wait=False)
            self._running = False
            logger.info("scheduler_stopped")

    async def _strategy_tick(self) -> None:
        """
        Main strategy evaluation loop. Runs every 4 hours.
        1. Check if bot is halted
        2. Refresh candle data
        3. Check for stale data
        4. Detect market regime
        5. Run the appropriate strategy
        6. Process any signals
        """
        try:
            tick_start = datetime.now(timezone.utc)
            logger.info("strategy_tick_start", time=tick_start.isoformat())

            # Check halt state
            state = await self.repo.get_bot_state()
            if state.is_halted:
                logger.info("bot_halted_skipping_tick", reason=state.halt_reason)
                return

            # Refresh candle data for both timeframes
            candles_4h = await self.candle_store.refresh("4H")
            candles_1h = await self.candle_store.refresh("1H")

            # Stale data check
            if self.candle_store.is_stale("4H"):
                logger.warning("stale_data_skipping", timeframe="4H")
                await self.repo.log(
                    "warn", "scheduler", "Skipping strategy tick: 4H data is stale"
                )
                return

            if len(candles_4h) < 50:
                logger.warning("insufficient_candles", count=len(candles_4h))
                return

            # Detect market regime
            regime = self.regime_detector.update(candles_4h)
            logger.info("regime_detected", regime=regime)

            # Update bot state with current regime
            await self.repo.update_bot_state(current_regime=regime)
            await self.repo.log(
                "info", "strategy",
                f"Market regime: {regime}",
                {"regime": regime, "ema9": candles_4h[-1].close if candles_4h else None}
            )

            # Route to appropriate strategy
            signal = None
            if regime in ("trending_up", "trending_down"):
                signal = self.ema_strategy.evaluate(candles_4h, candles_1h)
                if signal:
                    logger.info("ema_signal_generated", direction=signal.direction)
            elif regime == "ranging":
                signal = self.bb_rsi_strategy.evaluate(candles_4h, candles_1h)
                if signal:
                    logger.info("bb_rsi_signal_generated", direction=signal.direction)
            else:
                # CHOPPY — no signals
                logger.info("choppy_no_signal")
                await self.repo.log(
                    "info", "strategy",
                    "Market regime CHOPPY — sitting flat, no signals generated"
                )

            # Process signal through trade lifecycle
            if signal:
                result = await self.trade_lifecycle.process_signal(signal)
                logger.info(
                    "signal_processed",
                    direction=signal.direction,
                    strategy=signal.strategy,
                    result=result,
                )
                await self.repo.log(
                    "info", "lifecycle",
                    f"Signal {signal.direction} via {signal.strategy} → {result}",
                    {
                        "direction": signal.direction,
                        "entry": signal.entry_price,
                        "stop": signal.stop_price,
                        "target": signal.target_price,
                        "rr": signal.rr_ratio,
                        "result": result,
                    }
                )
            else:
                # No signal generated. For choppy regime the bot intentionally
                # sits flat (and logged that above). For actionable regimes
                # (trending_up/down/ranging) the bot evaluated the strategy
                # and chose not to enter — log that explicitly so the dashboard
                # shows the tick was acted upon, not silently skipped.
                if regime in ("trending_up", "trending_down"):
                    strat_name = "ema_trend"
                elif regime == "ranging":
                    strat_name = "bb_rsi_reversion"
                else:
                    strat_name = None  # choppy — already logged above

                if strat_name is not None:
                    logger.info("no_signal_this_tick", regime=regime, strategy=strat_name)
                    await self.repo.log(
                        "info", "strategy",
                        f"Evaluated {strat_name} in {regime} regime — "
                        f"no entry conditions met this tick (waiting for setup)",
                        {"regime": regime, "strategy": strat_name},
                    )

            elapsed = (datetime.now(timezone.utc) - tick_start).total_seconds()
            logger.info("strategy_tick_complete", elapsed_seconds=round(elapsed, 2))

        except Exception as e:
            logger.error("strategy_tick_error", error=str(e), exc_info=True)
            try:
                await self.repo.log("error", "scheduler", f"Strategy tick failed: {e}")
            except Exception:
                pass  # don't mask the original error if the DB itself is down

    async def _grid_tick(self) -> None:
        """v3 grid maintenance tick (every GRID_TICK_INTERVAL_SEC).

        Delegates to the GridTickHandler. Wrapped in try/except so the
        scheduler stays alive even if a single tick fails.
        """
        try:
            await self.grid_tick_handler.run()
        except Exception as e:
            logger.error("grid_tick_error", error=str(e), exc_info=True)
            try:
                await self.repo.log(
                    "error", "scheduler",
                    f"Grid tick failed: {e} (next 30s tick will reconcile)"
                )
            except Exception:
                pass

    async def _grid_daily_rollup(self) -> None:
        """End-of-day aggregate rollup at 00:05 UTC.

        Reads YESTERDAY's `tb3_grid_fills`, sums counts + gross/fees/net P&L,
        snapshots end-of-day inventory + equity, and UPSERTs one row to
        `tb3_grid_metrics`. Idempotent via unique constraint on (date) —
        safe to re-run if the cron misfires.
        """
        try:
            today_utc = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )
            yesterday_start = today_utc - timedelta(days=1)

            # Read fills since yesterday's midnight; trim to BEFORE today's midnight
            fills_since = await self.repo.get_grid_fills_since(
                yesterday_start, limit=100000
            )
            fills = [f for f in fills_since if f.created_at < today_utc]

            n_buy = sum(1 for f in fills if f.side == "buy")
            n_sell = sum(1 for f in fills if f.side == "sell")
            gross = sum(float(f.realized_pnl or 0) for f in fills)
            fees = sum(float(f.fee_paid or 0) for f in fills)
            net = gross - fees

            # End-of-day inventory + equity snapshot
            gs = await self.repo.get_grid_state()
            equity = float(await self.exchange.get_equity())
            peak = float(await self.repo.get_peak_equity() or equity)
            dd_pct = ((equity - peak) / peak * 100) if peak > 0 else 0.0

            inv_qty = float(gs.inventory_qty or 0) if gs else 0.0
            inv_avg = (
                float(gs.inventory_avg_cost)
                if gs and gs.inventory_avg_cost is not None
                else None
            )

            await self.repo.upsert_grid_daily_metric(
                date=yesterday_start,
                n_buy_fills=n_buy,
                n_sell_fills=n_sell,
                gross_realized_pnl=gross,
                fees_paid=fees,
                net_pnl=net,
                inventory_end_qty=inv_qty,
                inventory_end_avg_cost=inv_avg,
                equity_end=equity,
                drawdown_pct=round(dd_pct, 2),
            )

            logger.info(
                "grid_daily_rollup_complete",
                date=yesterday_start.date().isoformat(),
                n_buy_fills=n_buy,
                n_sell_fills=n_sell,
                net_pnl=round(net, 2),
                equity_end=round(equity, 2),
            )
        except Exception as e:
            logger.error(
                "grid_daily_rollup_failed", error=str(e), exc_info=True,
            )
            try:
                await self.repo.log(
                    "error", "scheduler",
                    f"Grid daily rollup failed: {e} "
                    f"(will retry tomorrow; missing day OK)"
                )
            except Exception:
                pass

    async def _position_tick(self) -> None:
        """
        Position monitoring loop. Runs every 60 seconds.
        Checks stops, targets, trailing stops, and circuit breakers.
        """
        try:
            state = await self.repo.get_bot_state()
            if state.is_halted:
                return

            await self.position_manager.check_positions()

        except Exception as e:
            logger.error("position_tick_error", error=str(e), exc_info=True)
            try:
                await self.repo.log(
                    "error", "scheduler",
                    f"Position tick failed: {e} (position monitoring missed this 60s cycle)"
                )
            except Exception:
                pass

    async def _heartbeat(self) -> None:
        """Update the heartbeat timestamp in bot_state."""
        try:
            await self.repo.update_heartbeat()
        except Exception as e:
            logger.error("heartbeat_error", error=str(e))
            try:
                await self.repo.log(
                    "error", "scheduler",
                    f"Heartbeat failed: {e} (bot may appear stale on dashboard)"
                )
            except Exception:
                pass

    async def _balance_snapshot(self) -> None:
        """Record balance snapshot for equity curve.

        Type-safety note: ``exchange.get_equity`` and ``Position.unrealized_pnl``
        return ``Decimal`` (correct for precise money math). ``repo.get_peak_equity``
        returns ``float`` (it's a SQL MAX cast for display). Mixing the two
        with arithmetic operators (``Decimal - float``) raises ``TypeError`` in
        Python — exactly what was silently breaking every snapshot until the
        scheduler error-visibility fix exposed it.

        We coerce everything to float up front because the persistence layer
        stores these as ``Numeric`` columns which SQLAlchemy happily accepts
        as Python floats. Money precision past hundredths doesn't matter for
        an equity-curve snapshot.
        """
        try:
            state = await self.repo.get_bot_state()
            equity = float(await self.exchange.get_equity())
            positions = await self.exchange.get_positions()
            unrealized = sum(float(p.unrealized_pnl) for p in positions)
            cash = equity - unrealized

            peak = float(await self.repo.get_peak_equity() or equity)
            drawdown = ((equity - peak) / peak * 100) if peak > 0 else 0.0

            # Calculate portfolio heat
            open_trades = await self.repo.get_open_trades()
            total_risk = sum(
                float(t.risk_amount or 0) for t in open_trades
            )
            heat = (total_risk / equity * 100) if equity > 0 else 0.0

            await self.repo.record_balance(
                equity=equity,
                cash=cash,
                unrealized_pnl=unrealized,
                open_positions=len(positions),
                heat=round(heat, 2),
                drawdown=round(drawdown, 2),
            )

            # H4: keep tb_bot_state.live_balance current in live mode. The column
            # was permanently NULL otherwise (no code wrote to it). Dashboard and
            # downstream code can now show "last known live balance" meaningfully.
            if settings.TRADING_MODE == "live":
                try:
                    await self.repo.update_bot_state(live_balance=equity)
                except Exception as exc:
                    logger.warning("live_balance_update_failed", error=str(exc))
        except Exception as e:
            logger.error("balance_snapshot_error", error=str(e), exc_info=True)
            # Surface to dashboard so sparse snapshots are diagnosable
            try:
                await self.repo.log(
                    "error", "scheduler",
                    f"Balance snapshot failed: {e} "
                    f"(equity curve will have gaps; check exchange.get_equity / "
                    f"exchange.get_positions for the underlying issue)"
                )
            except Exception:
                pass

    async def run_strategy_now(self) -> None:
        """Force a strategy tick immediately (for testing)."""
        await self._strategy_tick()
