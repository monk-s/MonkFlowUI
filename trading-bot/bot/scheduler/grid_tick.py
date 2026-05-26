"""
v3 grid tick: the 30s heartbeat that drives all grid activity.

Wired into the existing TickScheduler. Replaces the v1 strategy_tick
(4H cron) and position_tick (60s interval) for v3 builds.

On each tick:
  1. Halt check (skip if bot_state.is_halted)
  2. Circuit breaker check (trip + emergency exit if equity DD ≥ threshold)
  3. Determine if recenter is due → trigger recenter
  4. Otherwise → call GridOrderManager.tick() for fill polling + level maintenance

Designed to NEVER throw. Wraps everything in try/except. A dropped tick
(network blip, scheduler misfire) is recovered by the next tick.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from bot.strategy.grid_strategy import (
    GridRange,
    compute_range_and_levels,
    should_recenter,
)
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("grid_tick")


class GridTickHandler:
    """The body of the 30-second grid maintenance tick."""

    def __init__(
        self,
        *,
        exchange,
        repository,
        grid_order_manager,           # GridOrderManager
        grid_position_manager,        # GridPositionManager
        grid_risk_manager,            # GridRiskManager
        symbol: str = "BTC-PERP-INTX",
    ) -> None:
        self.exchange = exchange
        self.repo = repository
        self.order_manager = grid_order_manager
        self.position_manager = grid_position_manager
        self.risk_manager = grid_risk_manager
        self.symbol = symbol

    async def run(self) -> None:
        """Run one grid tick. Idempotent. Never raises."""
        try:
            # 1. Halt check
            state = await self.repo.get_bot_state()
            if state and getattr(state, "is_halted", False):
                # Log occasionally so we know the bot is still alive
                logger.debug(
                    "grid_tick_skip_halted",
                    reason=getattr(state, "halt_reason", "unknown"),
                )
                return

            # 2. Circuit breaker check
            cb = await self.risk_manager.check_circuit_breaker()
            if cb.tripped:
                logger.critical(
                    "grid_tick_CB_TRIP_initiating_emergency_exit",
                    drawdown=cb.drawdown_pct,
                    peak=float(cb.peak_equity),
                    current=float(cb.current_equity),
                )
                # Emergency exit: cancel orders + market-close position
                try:
                    await self.order_manager.emergency_exit()
                except Exception as e:
                    logger.critical(
                        "emergency_exit_FAILED_position_may_be_open",
                        error=str(e),
                    )
                # Halt the bot regardless
                await self.repo.update_bot_state(
                    is_halted=True,
                    halt_reason=(
                        f"grid_dd_circuit_breaker: DD {cb.drawdown_pct:.2f}% "
                        f"(threshold {cb.threshold_pct}%)"
                    ),
                    halted_at=datetime.now(timezone.utc),
                )
                await self.repo.log(
                    "critical", "grid_tick",
                    f"Circuit breaker tripped: DD {cb.drawdown_pct:.2f}%. "
                    f"All orders cancelled, position market-closed, bot halted.",
                    {
                        "drawdown_pct": cb.drawdown_pct,
                        "peak_equity": float(cb.peak_equity),
                        "current_equity": float(cb.current_equity),
                    },
                )
                return

            # 3. Recenter check
            grid_state = await self.repo.get_grid_state()
            recenter_due = should_recenter(
                getattr(grid_state, "last_recenter_at", None) if grid_state else None,
                interval_days=settings.GRID_RECENTER_INTERVAL_DAYS,
            )

            if recenter_due:
                new_range = await self._compute_new_range()
                if new_range is None:
                    logger.warning(
                        "grid_tick_recenter_skipped_no_data",
                        note="couldn't fetch enough daily history to recenter",
                    )
                    return
                try:
                    current_price = float(await self.exchange.get_current_price())
                except Exception as e:
                    logger.warning("get_price_failed_skipping_tick", error=str(e))
                    return
                await self.order_manager.recenter(
                    new_range=new_range, current_price=current_price,
                )
                # Don't run tick() in the same iteration — let the next tick
                # populate the new grid. Keeps each tick simple + idempotent.
                return

            # 4. Normal maintenance tick
            try:
                current_price = float(await self.exchange.get_current_price())
            except Exception as e:
                logger.warning("get_price_failed_skipping_tick", error=str(e))
                return

            current_range = self._range_from_state(grid_state)
            if current_range is None:
                # No active grid yet (this is the first tick after pre-buy
                # but before recenter has populated state). Skip; next tick
                # will hit the recenter path.
                logger.info("grid_tick_no_active_range_skipping")
                return

            await self.order_manager.tick(
                grid_range=current_range, current_price=current_price,
            )

        except Exception as e:
            # Last-line catch — never let the scheduler see an unhandled
            # exception. Log to DB so the dashboard surfaces it.
            logger.error("grid_tick_unhandled_error", error=str(e), exc_info=True)
            try:
                await self.repo.log(
                    "error", "grid_tick",
                    f"Grid tick failed: {e} (tick will retry next cycle)",
                )
            except Exception:
                pass  # don't mask original error if DB also down

    # ─────────────────────────────────────────────────────────────────
    # Helpers
    # ─────────────────────────────────────────────────────────────────

    async def force_recenter(self) -> dict:
        """Cancel all open orders + immediately rebuild the grid range.

        Bypasses the `should_recenter` interval check. Used by the admin
        endpoint when config has changed and the user wants the new
        range / floor active right away (instead of waiting for the
        natural recenter cadence).

        Returns a small dict describing what happened, suitable for the
        admin API response.
        """
        new_range = await self._compute_new_range()
        if new_range is None:
            return {
                "ok": False,
                "error": "could not compute new range (insufficient history?)",
            }
        try:
            current_price = float(await self.exchange.get_current_price())
        except Exception as e:
            return {"ok": False, "error": f"get_current_price failed: {e}"}
        await self.order_manager.recenter(
            new_range=new_range, current_price=current_price,
        )
        return {
            "ok": True,
            "ran": "force_recenter",
            "new_range_low": new_range.low,
            "new_range_high": new_range.high,
            "n_levels": new_range.n_levels,
            "step": new_range.step(),
            "current_price": current_price,
        }

    async def _compute_new_range(self) -> Optional[GridRange]:
        """Build a new GridRange using current settings + recent daily data."""
        if settings.GRID_RANGE_MODE == "static":
            return compute_range_and_levels(
                mode="static",
                static_low=settings.GRID_STATIC_RANGE_LOW,
                static_high=settings.GRID_STATIC_RANGE_HIGH,
                n_levels=settings.GRID_NUM_LEVELS,
            )

        # Dynamic mode: fetch recent daily candles
        try:
            candles = await self.exchange.get_candles(
                "1D", limit=settings.GRID_RECENTER_DAYS + 10
            )
        except Exception as e:
            logger.warning("recenter_fetch_candles_failed", error=str(e))
            return None

        if len(candles) < settings.GRID_RECENTER_DAYS:
            logger.warning(
                "recenter_insufficient_history",
                got=len(candles), needed=settings.GRID_RECENTER_DAYS,
            )
            return None

        highs = [float(c["high"]) for c in candles]
        lows = [float(c["low"]) for c in candles]
        return compute_range_and_levels(
            mode="dynamic",
            daily_highs=highs, daily_lows=lows,
            n_levels=settings.GRID_NUM_LEVELS,
            lookback_days=settings.GRID_RECENTER_DAYS,
            padding_pct=settings.GRID_RANGE_PADDING_PCT,
        )

    def _range_from_state(self, grid_state) -> Optional[GridRange]:
        """Reconstruct GridRange from the persisted state row.

        Returns None if the state hasn't been populated yet (first deploy
        before recenter has fired).
        """
        if grid_state is None:
            return None
        low = getattr(grid_state, "current_range_low", None)
        high = getattr(grid_state, "current_range_high", None)
        n_levels = getattr(grid_state, "num_levels", None)
        if low is None or high is None or n_levels is None:
            return None
        try:
            return compute_range_and_levels(
                mode="static",
                static_low=float(low),
                static_high=float(high),
                n_levels=int(n_levels),
            )
        except Exception as e:
            logger.warning("range_from_state_failed", error=str(e))
            return None
