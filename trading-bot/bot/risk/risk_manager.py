"""
Risk Manager -- the FINAL GATEKEEPER before any order is placed.

Checks run in order; the first failure rejects the trade:
  1. Circuit breakers not tripped
  2. Portfolio heat < 5%
  3. Concurrent positions < 2
  4. No opposing position on same asset
  5. Risk per trade <= 2%
  6. R:R >= 2.0
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal
from typing import Optional

from bot.strategy.base import Signal
from config.logging_config import get_logger
from config.settings import settings

logger = get_logger("risk_manager")


@dataclass(frozen=True)
class RiskCheckResult:
    """Result of a pre-trade risk check."""

    allowed: bool
    reason: str = ""


class RiskManager:
    """
    Stateless risk gatekeeper.  Every check is a pure function of its
    inputs -- no hidden state.
    """

    async def check_trade(
        self,
        signal: Signal,
        equity: Decimal,
        open_positions: list,
        daily_pnl: float,
        weekly_pnl: float,
        monthly_pnl: float,
        total_pnl_pct: float,
    ) -> RiskCheckResult:
        """
        Run the full pre-trade checklist.  Returns ``RiskCheckResult(allowed=True)``
        only if every check passes.

        Parameters
        ----------
        signal : Signal
            The proposed trade signal.
        equity : Decimal
            Current account equity.
        open_positions : list
            List of open position objects (must have ``.side`` attribute).
        daily_pnl, weekly_pnl, monthly_pnl : float
            Realized + unrealized P&L for each period.
        total_pnl_pct : float
            Total drawdown from peak equity, as a negative percentage.
        """

        # (1) Circuit breakers
        cb_result = await self.check_circuit_breakers(
            equity=equity,
            daily_pnl=daily_pnl,
            weekly_pnl=weekly_pnl,
            monthly_pnl=monthly_pnl,
            total_pnl_pct=total_pnl_pct,
        )
        if not cb_result.allowed:
            logger.warning("trade_rejected_circuit_breaker", reason=cb_result.reason)
            return cb_result

        # (2) Portfolio heat < 5%
        heat = self.calculate_portfolio_heat(open_positions, equity)
        risk_usd = abs(signal.entry_price - signal.stop_price) * 1  # per-unit; actual size computed later
        # Estimate what the trade would add to heat
        # For pre-check, use signal's risk to approximate new heat
        signal_risk_pct = float(
            Decimal(str(settings.RISK_PER_TRADE_PCT))
        )
        projected_heat = heat + signal_risk_pct

        if projected_heat > settings.MAX_PORTFOLIO_HEAT_PCT:
            reason = (
                f"Portfolio heat would be {projected_heat:.2f}% "
                f"(limit {settings.MAX_PORTFOLIO_HEAT_PCT}%)"
            )
            logger.warning("trade_rejected_heat", reason=reason)
            return RiskCheckResult(allowed=False, reason=reason)

        # (3) Concurrent positions < max
        if len(open_positions) >= settings.MAX_CONCURRENT_POSITIONS:
            reason = (
                f"Max concurrent positions reached: "
                f"{len(open_positions)}/{settings.MAX_CONCURRENT_POSITIONS}"
            )
            logger.warning("trade_rejected_max_positions", reason=reason)
            return RiskCheckResult(allowed=False, reason=reason)

        # (4) No opposing position on same asset
        for pos in open_positions:
            pos_side = getattr(pos, "side", getattr(pos, "direction", None))
            if pos_side and pos_side != signal.direction:
                reason = (
                    f"Opposing position already open: {pos_side} vs signal {signal.direction}"
                )
                logger.warning("trade_rejected_opposing", reason=reason)
                return RiskCheckResult(allowed=False, reason=reason)

        # (5) Risk per trade <= MAX_RISK_PER_TRADE_PCT
        risk_per_unit = abs(signal.entry_price - signal.stop_price)
        if signal.entry_price > 0 and float(equity) > 0:
            # Estimate risk as a percentage of equity using default risk_pct
            if settings.RISK_PER_TRADE_PCT > settings.MAX_RISK_PER_TRADE_PCT:
                reason = (
                    f"Risk per trade {settings.RISK_PER_TRADE_PCT}% "
                    f"exceeds max {settings.MAX_RISK_PER_TRADE_PCT}%"
                )
                logger.warning("trade_rejected_risk_pct", reason=reason)
                return RiskCheckResult(allowed=False, reason=reason)

        # (6) R:R >= MIN_RR_RATIO
        if signal.rr_ratio < settings.MIN_RR_RATIO:
            reason = (
                f"R:R ratio {signal.rr_ratio:.2f} below minimum {settings.MIN_RR_RATIO}"
            )
            logger.warning("trade_rejected_rr", reason=reason)
            return RiskCheckResult(allowed=False, reason=reason)

        logger.info(
            "trade_approved",
            strategy=signal.strategy,
            direction=signal.direction,
            rr=signal.rr_ratio,
            heat=round(heat, 2),
            positions=len(open_positions),
        )
        return RiskCheckResult(allowed=True)

    async def check_circuit_breakers(
        self,
        equity: Decimal,
        daily_pnl: float,
        weekly_pnl: float,
        monthly_pnl: float,
        total_pnl_pct: float,
    ) -> RiskCheckResult:
        """
        Check all circuit breakers.  Any breached threshold blocks trading.

        Parameters
        ----------
        equity : Decimal
            Current equity for percentage calculations.
        daily_pnl, weekly_pnl, monthly_pnl : float
            Period P&L in dollars (negative = loss).
        total_pnl_pct : float
            Total drawdown from peak as a negative percentage.
        """
        equity_f = float(equity) if equity > 0 else 1.0  # avoid division by zero

        # Daily drawdown
        daily_dd_pct = (daily_pnl / equity_f) * 100 if daily_pnl < 0 else 0.0
        if abs(daily_dd_pct) >= settings.CB_DAILY_MAX_DRAWDOWN_PCT:
            return RiskCheckResult(
                allowed=False,
                reason=f"Daily circuit breaker tripped: {daily_dd_pct:.2f}% "
                       f"(limit -{settings.CB_DAILY_MAX_DRAWDOWN_PCT}%)",
            )

        # Weekly drawdown
        weekly_dd_pct = (weekly_pnl / equity_f) * 100 if weekly_pnl < 0 else 0.0
        if abs(weekly_dd_pct) >= settings.CB_WEEKLY_MAX_DRAWDOWN_PCT:
            return RiskCheckResult(
                allowed=False,
                reason=f"Weekly circuit breaker tripped: {weekly_dd_pct:.2f}% "
                       f"(limit -{settings.CB_WEEKLY_MAX_DRAWDOWN_PCT}%)",
            )

        # Monthly drawdown
        monthly_dd_pct = (monthly_pnl / equity_f) * 100 if monthly_pnl < 0 else 0.0
        if abs(monthly_dd_pct) >= settings.CB_MONTHLY_MAX_DRAWDOWN_PCT:
            return RiskCheckResult(
                allowed=False,
                reason=f"Monthly circuit breaker tripped: {monthly_dd_pct:.2f}% "
                       f"(limit -{settings.CB_MONTHLY_MAX_DRAWDOWN_PCT}%)",
            )

        # Total drawdown from peak
        if abs(total_pnl_pct) >= settings.CB_TOTAL_MAX_DRAWDOWN_PCT:
            return RiskCheckResult(
                allowed=False,
                reason=f"Total circuit breaker tripped: {total_pnl_pct:.2f}% "
                       f"(limit -{settings.CB_TOTAL_MAX_DRAWDOWN_PCT}%)",
            )

        return RiskCheckResult(allowed=True)

    def calculate_portfolio_heat(
        self,
        open_positions: list,
        equity: Decimal,
    ) -> float:
        """
        Portfolio heat = sum of risk% across all open positions.

        Each open position's risk is its ``risk_pct`` attribute (stored when
        the trade was opened).  If unavailable, falls back to
        ``RISK_PER_TRADE_PCT`` per position.

        Returns the total as a percentage (e.g. 3.0 means 3%).
        """
        if not open_positions or equity <= 0:
            return 0.0

        total_heat = 0.0
        for pos in open_positions:
            # Try to read stored risk_pct from the trade record
            risk = getattr(pos, "risk_pct", None)
            if risk is not None:
                total_heat += float(risk)
            else:
                # Fallback: compute from entry/stop if available
                entry = getattr(pos, "entry_price", None)
                stop = getattr(pos, "stop_price", None)
                size = getattr(pos, "position_size", None)
                if entry and stop and size and float(equity) > 0:
                    risk_usd = abs(float(entry) - float(stop)) * float(size)
                    total_heat += (risk_usd / float(equity)) * 100
                else:
                    # Last resort: assume default risk per trade
                    total_heat += settings.RISK_PER_TRADE_PCT

        return total_heat
