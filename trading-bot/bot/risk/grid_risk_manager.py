"""
v3 grid risk manager: drawdown circuit breaker + grid notional cap.

Three responsibilities:

  1. **Equity drawdown circuit breaker (default 40%)** — fires when peak
     equity drops by GRID_DD_CIRCUIT_BREAKER_PCT. On trip, the caller
     (grid_tick) is expected to:
       a. Call grid_order_manager.emergency_exit() to cancel all orders
          and market-close the perp position.
       b. Set bot_state.is_halted = True with halt_reason.
     This manager only DETECTS the trip; emergency-exit logic is in
     grid_order_manager.

  2. **MA re-arm check** — after a circuit-breaker halt, the bot stays
     halted until a manual unhalt AND daily close > 50-day MA. This
     method just reports whether the MA gate is currently satisfied.

  3. **Pre-order gate** — block new orders if bot is halted, CB is
     tripped, or the new order would push total grid notional above
     max_grid_notional_pct of equity.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from config.logging_config import get_logger

logger = get_logger("grid_risk_manager")


@dataclass
class RiskCheckResult:
    allowed: bool
    reason: Optional[str] = None


@dataclass
class CircuitBreakerStatus:
    tripped: bool
    peak_equity: Decimal
    current_equity: Decimal
    drawdown_pct: float        # negative number when in drawdown
    threshold_pct: float        # the configured trip threshold (e.g. -40)


class GridRiskManager:
    """Grid-specific risk checks. Composes with v1 RiskManager — doesn't replace it."""

    def __init__(
        self,
        *,
        repository,
        exchange,
        dd_threshold_pct: float = 40.0,
        rearm_ma_days: int = 50,
        max_grid_notional_pct: float = 100.0,  # max notional as % of equity
    ) -> None:
        self.repo = repository
        self.exchange = exchange
        self.dd_threshold_pct = dd_threshold_pct
        self.rearm_ma_days = rearm_ma_days
        self.max_grid_notional_pct = max_grid_notional_pct

    # ─────────────────────────────────────────────────────────────────
    # Drawdown circuit breaker
    # ─────────────────────────────────────────────────────────────────

    async def check_circuit_breaker(self) -> CircuitBreakerStatus:
        """Detect if the equity drawdown circuit breaker should trip.

        Equity = current exchange equity (cash + position MTM).
        Peak = max equity ever recorded in tb_balance_history.
        DD% = (current - peak) / peak * 100  (negative when below peak).

        Trips when DD% <= -dd_threshold_pct. Caller handles trip actions.
        """
        try:
            current_equity = Decimal(str(await self.exchange.get_equity()))
        except Exception as e:
            logger.error("get_equity_failed", error=str(e))
            # Fail-safe: if we can't fetch equity, DO NOT trip the breaker.
            # Other safety layers (bot_state.is_halted, manual oversight)
            # protect against pathological cases. Tripping the breaker on
            # an exchange API hiccup would be worse than waiting one tick.
            return CircuitBreakerStatus(
                tripped=False,
                peak_equity=Decimal("0"),
                current_equity=Decimal("0"),
                drawdown_pct=0.0,
                threshold_pct=-self.dd_threshold_pct,
            )

        # Guard against zero/negative equity from a bad exchange read.
        # A literal $0 equity would compute as -100% DD against any positive
        # peak and trip the breaker on what's almost certainly a stale or
        # garbled response. Fail safe: skip the CB check this tick.
        if current_equity <= 0:
            logger.warning(
                "cb_skip_invalid_equity",
                current_equity=float(current_equity),
                note="Treating zero/negative equity as bad data, not real drawdown.",
            )
            return CircuitBreakerStatus(
                tripped=False,
                peak_equity=current_equity,
                current_equity=current_equity,
                drawdown_pct=0.0,
                threshold_pct=-self.dd_threshold_pct,
            )

        peak = Decimal(str(await self.repo.get_peak_equity() or 0))
        if peak <= 0:
            # Brand-new bot: no peak yet. Treat current as peak (no DD).
            peak = current_equity

        if peak == 0:
            drawdown_pct = 0.0
        else:
            drawdown_pct = float((current_equity - peak) / peak * 100)

        threshold = -float(self.dd_threshold_pct)
        tripped = drawdown_pct <= threshold

        if tripped:
            logger.critical(
                "grid_dd_circuit_breaker_TRIPPED",
                current_equity=float(current_equity),
                peak_equity=float(peak),
                drawdown_pct=drawdown_pct,
                threshold_pct=threshold,
            )

        return CircuitBreakerStatus(
            tripped=tripped,
            peak_equity=peak,
            current_equity=current_equity,
            drawdown_pct=round(drawdown_pct, 2),
            threshold_pct=threshold,
        )

    # ─────────────────────────────────────────────────────────────────
    # MA re-arm check
    # ─────────────────────────────────────────────────────────────────

    async def can_rearm(
        self, daily_closes: Optional[list[float]] = None
    ) -> tuple[bool, Optional[str]]:
        """After a CB trip, the bot can only resume when daily close > 50-day MA.

        Caller provides daily_closes (typically pulled from CandleStore or
        directly from the exchange). If not provided, fetches from exchange.

        Returns (rearm_eligible, reason_if_not).
        """
        if daily_closes is None:
            try:
                candles = await self.exchange.get_candles(
                    "1D", limit=self.rearm_ma_days + 10
                )
                daily_closes = [float(c["close"]) for c in candles]
            except Exception as e:
                return False, f"could not fetch daily candles: {e}"

        if len(daily_closes) < self.rearm_ma_days:
            return False, (
                f"need {self.rearm_ma_days} daily bars to compute MA, "
                f"have {len(daily_closes)}"
            )

        ma = sum(daily_closes[-self.rearm_ma_days:]) / self.rearm_ma_days
        latest = daily_closes[-1]
        if latest <= ma:
            return False, (
                f"latest close {latest:.2f} <= {self.rearm_ma_days}-day MA "
                f"{ma:.2f} (waiting for trend to recover)"
            )
        return True, None

    # ─────────────────────────────────────────────────────────────────
    # Pre-order gate (called before placing each new grid order)
    # ─────────────────────────────────────────────────────────────────

    async def check_can_place_order(
        self,
        *,
        side: str,
        qty: Decimal,
        price: Decimal,
        current_equity: Decimal,
        current_grid_notional: Decimal,
    ) -> RiskCheckResult:
        """Gate one new grid order placement.

        Sequence:
          1. Bot not halted
          2. Circuit breaker not tripped
          3. Adding this notional doesn't exceed max_grid_notional_pct
        """
        # 1. Halted?
        state = await self.repo.get_bot_state()
        if state and getattr(state, "is_halted", False):
            return RiskCheckResult(
                allowed=False,
                reason=f"bot halted: {getattr(state, 'halt_reason', 'unknown')}",
            )

        # 2. Circuit breaker
        cb = await self.check_circuit_breaker()
        if cb.tripped:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"circuit breaker tripped: DD {cb.drawdown_pct:.2f}% "
                    f"(threshold {cb.threshold_pct}%)"
                ),
            )

        # 3. Grid notional cap
        if current_equity <= 0:
            return RiskCheckResult(allowed=False, reason="no equity")
        new_notional = qty * price
        max_notional = current_equity * Decimal(str(self.max_grid_notional_pct / 100))
        if current_grid_notional + new_notional > max_notional:
            return RiskCheckResult(
                allowed=False,
                reason=(
                    f"would exceed grid notional cap: "
                    f"{float(current_grid_notional + new_notional):.2f} > "
                    f"{float(max_notional):.2f}"
                ),
            )

        return RiskCheckResult(allowed=True)
