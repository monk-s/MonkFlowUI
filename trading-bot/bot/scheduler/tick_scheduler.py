"""
Two scheduled ticks:
1. Strategy tick (every 4H candle close) — fetch data, run regime detection, generate signals
2. Position check tick (every 60s) — monitor positions, manage stops, check circuit breakers
"""

import asyncio
from datetime import datetime, timezone

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
    ):
        self.candle_store = candle_store
        self.regime_detector = regime_detector
        self.ema_strategy = ema_strategy
        self.bb_rsi_strategy = bb_rsi_strategy
        self.trade_lifecycle = trade_lifecycle
        self.position_manager = position_manager
        self.repo = repository
        self.exchange = exchange
        self.scheduler = AsyncIOScheduler()
        self._running = False

    def start(self) -> None:
        """Start both scheduled ticks."""
        # Strategy tick: fire at 4H candle close times (UTC)
        # 00:00, 04:00, 08:00, 12:00, 16:00, 20:00
        hours = settings.STRATEGY_TICK_HOURS  # "0,4,8,12,16,20"
        self.scheduler.add_job(
            self._strategy_tick,
            CronTrigger(hour=hours, minute=1, timezone="UTC"),
            id="strategy_tick",
            name="Strategy Evaluation (4H)",
            max_instances=1,
            misfire_grace_time=300,  # 5 min grace for misfires
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
            strategy_hours=hours,
            position_interval=settings.POSITION_CHECK_INTERVAL_SEC,
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
        """Record balance snapshot for equity curve."""
        try:
            state = await self.repo.get_bot_state()
            equity = await self.exchange.get_equity()
            positions = await self.exchange.get_positions()
            unrealized = sum(p.unrealized_pnl for p in positions)
            cash = equity - unrealized

            peak = await self.repo.get_peak_equity()
            drawdown = ((equity - peak) / peak * 100) if peak > 0 else 0

            # Calculate portfolio heat
            open_trades = await self.repo.get_open_trades()
            total_risk = sum(
                float(t.risk_amount or 0) for t in open_trades
            )
            heat = (total_risk / float(equity) * 100) if equity > 0 else 0

            await self.repo.record_balance(
                equity=float(equity),
                cash=float(cash),
                unrealized_pnl=float(unrealized),
                open_positions=len(positions),
                heat=round(heat, 2),
                drawdown=round(float(drawdown), 2),
            )
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
